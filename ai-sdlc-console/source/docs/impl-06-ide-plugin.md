# impl-06 IDE 插件实施（VS Code + JetBrains）

> 版本：v1.0 ｜ 对应设计方案 v1.0（第 2 节「本地 IDE 插件层设计」）｜ 日期：2026-09-24

## 本篇范围

本篇定义本地 IDE 插件层（层 2）的**工程结构、模块划分、共享协议层、上下文采集、脱敏上传、本地构建测试执行器、Diff 审查 UI 与双端一致性验证**，做到两个终端（VS Code / JetBrains）可各自独立开发、按同一契约联调。

本篇**不**覆盖：

- 消息信封字段与 REST/WSS 报文全集 → 见 `impl-01-protocol.md`（本篇只做**引用与落地**，不重新定义）
- Agent 的 Prompt 与模型路由 → 见 `impl-02-agents.md`
- 状态迁移守卫（`dev`→`testGreen` 的门槛值） → 见 `impl-03-state-machine.md`
- 服务端表结构（`code_link` / `build` / `test_execution`） → 见 `impl-04-data-model.md`
- 出域策略与脱敏规则的服务端实现 → 见 `impl-08-security.md`

## 关联文档

| 文档 | 与本篇的关系 |
|:---|:---|
| `docs/AI研发平台设计方案.md` | 上层输入；本篇细化其 2.1 双 IDE 覆盖表、2.2 插件 6 模块、2.3 安全红线 |
| `impl-00-overview.md` | 层 2 的职责边界与「不做什么」清单、组件 `ide-plugin-vscode` / `ide-plugin-jetbrains` |
| `impl-01-protocol.md` | 本篇全部报文的**唯一来源**：信封、`client.hello`、`context.push`、`test.report`、`coding.diff.decision` |
| `impl-03-state-machine.md` | `test.report` 触发的 `testGreen` 迁移守卫与 `evidence` 字段口径 |
| `impl-04-data-model.md` | `code_link` / `build` / `test_execution` 的落地表结构 |
| `impl-08-security.md` | 客户端预脱敏与服务端脱敏引擎（SEC-MASK-2.1）的分工 |

---

## 1. 设计目标与技术决策

| 目标 | 决策 | 理由 | 被否方案及原因 |
|:---|:---|:---|:---|
| 双端一致性 | **契约单一事实源 = JSON Schema(+ 事件目录 YAML)**，两端各自生成/校验类型 | 跨语言代码无法共享，但契约可以；一致性由 CI 契约测试兜底 | 手写两份 DTO：必然漂移；Protobuf/gRPC：信封是 JSON over WSS，引入 gRPC 需改造 `wss-hub` |
| UI 复用 | Diff 审查与任务卡片 UI 编译为**同一份 Webview Bundle**，JetBrains 经 JCEF 加载 | 交互契约与视觉完全一致，缺陷只修一处 | 纯原生 UI（VS Code Webview + JetBrains Swing）：双份实现，验收用例要跑两遍 |
| 本地执行 | 构建/单测**只在 IDE 侧执行**，云端不执行用户代码 | impl-00 层 3 边界；代码不出开发者机器 | 云端 Runner：需上传全量代码，违反「最小化上传」红线 |
| 密钥 | 插件**不持有模型密钥**，仅持短期 STS（TTL ≤ 900s）换取网关调用令牌 | impl-00 红线；私有化 VPC 下密钥在客户 KMS | 插件内置 API Key：可被反编译提取 |
| 离线能力 | 断线时任务卡只读 + 写操作本地队列（≤ 200 条） | 与 `impl-01 §7.1` 一致；开发者弱网可用 | 完全离线编辑：状态机权威在云端，离线改状态会冲突 |
| 采集粒度 | **方法/函数级切片**（非整文件、非整库） | 上下文窗口成本与合规双重约束 | 整文件上传：Token 成本高 3~8 倍且含无关敏感字段 |

---

## 2. 工程结构与模块划分

### 2.1 仓库结构（monorepo）

```
ai-sdlc-console/
├─ packages/
│  ├─ protocol/                 # 单一事实源：JSON Schema + events.yaml + 生成的 TS/Kotlin
│  │  ├─ schema/*.schema.json   # envelope / context.slice / test.report / diff.decision
│  │  ├─ events.yaml            # WSS 消息类型目录（type + payload schema 引用）
│  │  ├─ gen/ts/               # 生成产物（TypeScript）
│  │  └─ gen/kotlin/           # 生成产物（Kotlin data class + kotlinx.serialization）
│  ├─ core/                     # 共享 TS 逻辑（用于插件宿主与 Webview 两侧）
│  │  ├─ envelope.ts            # 信封构造/校验、idempotencyKey
│  │  ├─ slice.ts               # 切片算法与大小裁剪
│  │  ├─ redact.ts              # 客户端预脱敏规则引擎（rd-01~rd-08 子集）
│  │  ├─ parse/                 # 构建/测试结果解析器（junit-xml / jacoco / jest-json / go-json）
│  │  └─ transport.ts           # WSS 客户端、退避重连、本地队列
│  ├─ webview-ui/               # Diff 审查 + 任务卡片 UI（React + TS，Vite 构建单 Bundle）
│  ├─ vscode-ext/               # VS Code 插件（TypeScript / Extension API）
│  └─ jetbrains-plugin/         # JetBrains 插件（Kotlin / IntelliJ Platform SDK）
└─ tools/
   └─ schema-gen/               # JSON Schema → TS/Kotlin 代码生成器
```

### 2.2 模块划分对照表

| 模块 | 职责 | VS Code 实现方式 | JetBrains 实现方式 | 代码位置 |
|:---|:---|:---|:---|:---|
| `conn-client` 连接与会话 | 握手、心跳、退避重连、本地队列、订阅 | `WebSocket`（Node 侧）+ `vscode.SecretStorage` 存 token | `OkHttp WebSocket` + `PasswordSafe` 存 token | `vscode-ext/src/conn/`、`jetbrains-plugin/src/main/kotlin/.../conn/` |
| `context-collector` 上下文采集器 | 文件树、选中代码、Git diff、LSP 符号表、框架识别 | `vscode.workspace.fs` / `vscode.window.activeTextEditor.selection` / `vscode.commands.executeCommand('vscode.executeDefinitionProvider')` / Git 扩展 API | `ProjectFileIndex` / `EditorFactory` / `PsiElement` / `Git4Idea` API | `.../context/` 两端 |
| `redact` 脱敏 | 客户端预脱敏、命中计数、上报 | 复用 `core/redact.ts` | Kotlin 端口 `Redactor.kt`（同一规则表由 `protocol/redact-rules.json` 生成） | `core/redact.ts`、`.../redact/Redactor.kt` |
| `ai-panel` AI 交互面板 | 对话、代码生成、解释、重构、修复 | Webview（`webview-ui` Bundle） | Tool Window + JCEF（同一 Bundle） | `webview-ui/src/ai-panel/` |
| `diff-review` Diff 审查面板 | 块级接受/拒绝、局部修改 | Webview + 内嵌 `vscode.diff` 兜底 | JCEF Webview + `DiffManager.showDiff` 兜底 | `webview-ui/src/diff/` |
| `task-card` 任务卡片 | 「分配给我」列表、内嵌状态闭环 | TreeView（`vscode.TreeDataProvider`） | Tool Window（`Tree` / `List`） | `.../tasks/` 两端 |
| `build-runner` 构建测试执行器 | 命令探测、执行、结果解析、回传 | `child_process.spawn`（Extension Host 的 Node） | `ProcessBuilder` + `GeneralCommandLine`（后台 Task） | `core/parse/` + 两端 runner |
| `deploy-trigger` 部署触发 | 一键触发流水线、展示进度 | Webview/QuickPick + 订阅 `sdlc.pipeline.*` | Tool Window 进度条 + 同订阅 | `.../deploy/` 两端 |

---

## 3. 共享协议层（单一事实源）

### 3.1 生成管线

```
protocol/schema/*.schema.json ──┐
protocol/events.yaml ───────────┼─> tools/schema-gen ─┬─> protocol/gen/ts/*.ts      (VS Code + Webview)
protocol/redact-rules.json ─────┘                     └─> protocol/gen/kotlin/*.kt  (JetBrains)
```

规则：

1. `protocol/` 为**只读生成物目录**，任何人不手工编辑 `gen/`，由 CI 校验「重新生成后 `git diff` 为空」。
2. 信封四元组 `msgId` / `type` / `payload` / `traceId` 必填，`version` / `seq` / `ts` 可选——与 `impl-01 §2.1` 契约一致，生成器对四元组输出 `required` 约束。
3. `events.yaml` 中每个 `type` 必须与 `impl-01 §3.1/§3.2` 表格逐项对应，CI 用 `type` 正则 `^[a-z]+(\.[a-z_]+)+$` 校验并在 `gen/` 输出枚举常量。

### 3.2 生成产物示例

TypeScript（`protocol/gen/ts/envelope.ts`）：

```typescript
export interface Envelope<T = unknown> {
  msgId: string;      // uuid v7
  type: string;       // events.yaml 白名单
  payload: T;
  traceId: string;    // 32 位 hex
  version?: string;   // 默认 "1.0"
  seq?: number;
  ts?: string;
}

export function envelope<T>(type: string, payload: T, traceId: string): Envelope<T> {
  return { msgId: uuidv7(), type, payload, traceId, version: '1.0', ts: new Date().toISOString() };
}
```

Kotlin（`protocol/gen/kotlin/Envelope.kt`）：

```kotlin
@Serializable
data class Envelope<T>(
    val msgId: String,
    val type: String,
    val payload: T,
    val traceId: String,
    val version: String? = "1.0",
    val seq: Long? = null,
    val ts: String? = null,
)
```

### 3.3 契约一致性校验（CI 必跑）

| 校验项 | 工具 | 失败判定 |
|:---|:---|:---|
| 生成物与 Schema 同步 | `schema-gen --check` | `git diff --exit-code protocol/gen` 非空 |
| `type` 与 `impl-01` 表格一致 | `scripts/check-events.mjs`（解析 md 表格 + `events.yaml`） | 任一侧多出/缺失即失败 |
| 包体大小 | `vscode-ext` VSIX < 8 MB；`jetbrains-plugin` 插件包 < 25 MB | 超限阻断（JCEF Bundle 单独统计） |
| 本地队列容量 | 单测断言 `QUEUE_MAX = 200`、`SLICE_MAX_BYTES = 2 MB`、`SLICE_MAX_LINES = 5000` | 常量被改且无评审记录 |

---

## 4. 上下文采集器

### 4.1 采集项与粒度

| 采集项 | 粒度 | 采集上限 | 是否出域 | 说明 |
|:---|:---|:---|:---|:---|
| 文件树 | 目录/文件名（不含内容） | 项目根 3 层 | 否（仅本地用于选文件） | 用于 Diff 定位与最小切片选取 |
| 当前打开文件 | **方法/函数级切片** | 单切片 ≤ 200 行 | 是（脱敏后） | 完整文件路径出域时可替换为相对路径 + 哈希 |
| 选中代码 | 精确选区（扩展至整行） | ≤ 200 行 | 是（脱敏后） | 优先级最高 |
| Git diff | 变更 hunk（未提交 + 当前分支 vs 基线） | ≤ 400 行/文件 | 是（脱敏后） | 基线取 `merge-base origin/main HEAD` |
| LSP 符号表 | 符号名 + 签名 + 定义位置 + 直接引用者 | 顶层符号 ≤ 300 个 | 否 | 只出域**名称与签名**，不出域实现体 |
| 语言/框架识别 | 清单文件推断 | — | 否 | `pom.xml`→Maven/SB、`build.gradle.kts`→Gradle/Kotlin、`package.json`→Node、`pyproject.toml`→Python |
| 活跃任务 | 任务卡 `taskId` + 状态 | — | 是 | 与 `context.push.sessionId` 绑定 |

### 4.2 VS Code API 映射

| 能力 | API | 说明 |
|:---|:---|:---|
| 编辑器与选区 | `window.activeTextEditor.selection`、`document.getText(range)` | 选区为空时退化为「光标所在方法」 |
| 方法边界 | `vscode.executeDocumentSymbolProvider`（`DocumentSymbol.range`） | 取最内层 `Function`/`Method` 节点 |
| 定义/引用 | `vscode.executeDefinitionProvider` / `vscode.executeReferenceProvider` | 只取 `uri` + `range.start.line`，不出域内容 |
| Git diff | 内置 Git 扩展 `vscode.git` 导出 API：`repository.diff(cached=false)` | 无 Git 扩展时降级为 `git diff` 子进程 |
| 工作区 | `workspace.workspaceFolders`、`workspace.findFiles` | 需要排除 `**/node_modules/**`、`**/target/**` |

### 4.3 JetBrains API 映射

| 能力 | API | 说明 |
|:---|:---|:---|
| 编辑器与选区 | `FileEditorManager.getInstance(project).selectedTextEditor` | `SelectionModel` 取选区 |
| 方法边界 | PSI：`PsiFile.findElementAt(offset)?.parentOfType<PsiMethod>()` 或语言对应节点 | 用 `PsiMethod` / `KtNamedFunction` 兼容 Java/Kotlin |
| 符号与引用 | `PsiElement.reference` → `ReferencesSearch.search(el)` | 只取 `SmartPointer` 的 `containingFile.virtualFile.path` + 行号 |
| Git diff | `Git4Idea`：`GitRepositoryManager` / `ChangeListManager` | 未提交变更走 `ChangeListManager.getInstance(project).allChanges` |
| 工作区 | `ProjectRootManager.getInstance(project).contentRoots` | 排除 `ExcludedScope`（`ProjectFileIndex.isExcluded`） |

### 4.4 最小切片算法

```typescript
// core/slice.ts —— 两端行为一致（Kotlin 端口逐行等价）
interface Slice {
  path: string;                // 出域前替换为仓库相对路径
  range: [number, number];     // [startLine, endLine]，1-based，闭区间
  symbol?: string;             // 脱敏后的符号名
  hash: string;                // sha256(规范化文本)，用于云端去重与增量
  redacted: boolean;           // 是否命中脱敏规则
  priority: number;            // 0=选中 1=编辑中 2=diff命中 3=直接引用 4=同包
}

const SLICE_MAX_LINES = 5000;   // 单任务切片总行数上限（impl-01 SDLC-SEC-413 口径）
const SLICE_MAX_BYTES = 2 * 1024 * 1024; // 单任务切片总字节上限
const PER_SLICE_MAX_LINES = 200;

function buildSlices(ctx: CollectContext): Slice[] {
  const candidates = dedupeByHash([
    fromSelection(ctx),        // priority 0
    fromActiveMethod(ctx),     // priority 1
    fromGitDiff(ctx),          // priority 2
    fromReferences(ctx, 1),    // priority 3，仅一层
    fromSamePackage(ctx, 5),   // priority 4，最多 5 个文件
  ]);
  candidates.sort((a, b) => a.priority - b.priority);   // 同优先级按修改时间倒序
  return trimToLimits(candidates, SLICE_MAX_LINES, SLICE_MAX_BYTES); // 从尾部裁剪
}
```

裁剪规则：按 `priority` 升序累加，超限时**从最低优先级尾部整片丢弃**，不做行内截断（行内截断会破坏语法，导致模型幻觉增加）。

---

## 5. 脱敏与最小切片上传

### 5.1 两级防线与时机

| 防线 | 位置 | 时机 | 职责 |
|:---|:---|:---|:---|
| L1 客户端预脱敏 | IDE 插件 `core/redact.ts` | **切片生成后、入队前** | 阻断明显密钥/PII 出域；计算 `redacted` 标记与命中计数 |
| L2 服务端脱敏 | `api-gateway` SEC-MASK-2.1 | 落库/转发模型前 | 权威判定；客户端漏网在此拦截；产出出域审计流水 |

原则：**L1 是降低成本与风险的优化，不是安全边界**；安全边界在 L2。因此 L1 命中后仍携带 `redacted:true` 上报，供 L2 比对（两侧命中数不一致即告警）。

### 5.2 客户端预脱敏规则（取 `redactRules` 中代码相关子集）

| 规则 | 字段/模式 | 客户端策略 | 样例（前 → 后） |
|:---|:---|:---|:---|
| `rd-08` 访问令牌全量替换 | `apiToken`、`(?i)(token\|secret\|password\|api[_-]?key)\s*[:=]\s*["'][^"']+["']` | 全量替换仅留后缀 | `pc_live_8f3a9c2e7b14d05a6c88` → `pc_live_****c88` |
| `rd-01` 手机号掩码 | `receiverPhone`、`1[3-9]\d{9}` | 中间四位掩码 | `13815626621` → `138****6621` |
| `rd-02` 身份证号掩码 | `buyerIdCard`、`\d{17}[\dXx]` | 保留前 6 后 4 | `330106199203124521` → `330106********4521` |
| `rd-05` 邮箱用户名掩码 | `buyerEmail`、`[\w.]+@[\w.]+` | 用户名保留前 3 位，域名保留 | `linshuyuan@example.com` → `lin***@example.com` |
| `rd-04` 银行卡号掩码 | `payCardNo`、`62\d{13,18}` | 保留后四位 | `6222020200112233445` → `***************3445` |
| 私有地址（新增规则 `rd-09`） | 内网 IP、`jdbc:`/`redis://`/`mongodb://` 连接串 | 替换为占位符 `{{INTERNAL_ADDR}}` | `redis://10.24.3.9:6379` → `redis://{{INTERNAL_ADDR}}` |

> `rd-09` 为本篇为代码场景补充的规则，**服务端需登记同名规则**（见 `impl-08-security.md §3`）；`rd-03`/`rd-06`/`rd-07` 面向订单业务字段，代码切片命中率低，客户端不预脱敏、交 L2 处理。

### 5.3 上传通道与限额

| 通道 | 报文 | 适用 | 限额 |
|:---|:---|:---|:---|
| WSS（首选，同会话增量） | `context.push`（`impl-01 §3.1`） | 编码会话进行中的增量切片 | 单次 ≤ 512 KB（gzip 前），切片数 ≤ 200 |
| REST（批量/补传） | `POST /api/v1/tasks/{id}/context-slices` → `{accepted, redacted}` | 会话外历史切片、重连补传 | 单任务累计 ≤ 2 MB / 5,000 行，超限返回 `SDLC-SEC-413` |
| 制品/日志 | `POST /api/v1/tasks/{id}/evidence` → `{uploadUrl, objectKey}`，随后 `PUT uploadUrl` | 测试日志、覆盖率报告 | 单文件 ≤ 20 MB，`Content-Encoding: gzip` |

```json
{
  "msgId": "0192f3a1-8c4d-7b21-9e10-3f5a7c2d1c11",
  "type": "context.push",
  "traceId": "7d1e4a2b6c8f4a0e9b3d5c7a1f2e4b60",
  "payload": {
    "sessionId": "CS-2401",
    "slices": [
      {
        "path": "order-domain/src/main/java/com/mall/order/domain/service/OrderCreateService.java",
        "range": [88, 142],
        "symbol": "createOrder",
        "hash": "b7d1f0c9a4e83f27c6b5d0e9a1f3c284d6071e5b9a2c4f8e0d3b6a7c1f2e4b60",
        "redacted": true
      }
    ]
  }
}
```

### 5.4 失败处理

| 场景 | 处理 |
|:---|:---|
| WSS 断开 | 切片入本地队列（`localStorage`/`PersistentStateComponent`），上限 200 条，超限丢**最低优先级**并提示 |
| 服务端返回 `SDLC-SEC-413` | 前端提示「本次上下文超限，已自动裁剪至 5,000 行」并重算 `priority` 尾部丢弃后重试一次 |
| 服务端脱敏命中数 > 客户端 | 记 `SEC-WARN-1`，弹一次非阻断提示「检测到未预脱敏内容，已由平台拦截」 |
| `hash` 已存在（服务端去重命中） | 服务端返回 `accepted` 但不计行数，客户端记 `dedup:true` |

---

## 6. 本地构建测试执行器

### 6.1 命令探测与执行

| 工程标志 | 生态 | 探测命令 | 执行命令 | 结果解析器 | 覆盖率来源 |
|:---|:---|:---|:---|:---|:---|
| `pom.xml` | Java/Maven | `mvn -v` | `mvn -q -B -DskipITs test` | `junit-xml`（`target/surefire-reports/*.xml`） | `target/site/jacoco/jacoco.xml` |
| `build.gradle` / `build.gradle.kts` | Java/Gradle | `./gradlew -v`（无 wrapper 退 `gradle -v`） | `./gradlew test` | `junit-xml`（`build/test-results/test/*.xml`） | `build/reports/jacoco/test/jacocoTestReport.xml` |
| `package.json` | Node | `node -v` | `npm test -- --reporter=jest-junit` | `jest-json`（`jest-junit.xml`） | `coverage/coverage-summary.json` |
| `pyproject.toml` / `pytest.ini` | Python | `python -m pytest --version` | `python -m pytest -q --junitxml=.ai/junit.xml` | `junit-xml` | `coverage.xml`（需 `pytest-cov`） |
| `go.mod` | Go | `go version` | `go test ./... -json -coverprofile=.ai/cover.out` | `go-json`（逐行 NDJSON） | `cover.out`（`go tool cover -func`） |
| `Cargo.toml` | Rust | `cargo -V` | `cargo test --message-format json` | `cargo-json` | `tarpaulin`（未安装则 `coverage:null`） |

探测失败（无匹配标志或工具不在 `PATH`）→ 任务卡「本地测试」按钮置灰，提示「未识别的工程类型，请手动执行并在 IDE 终端回传」。

### 6.2 执行与结果回传

```typescript
// core/parse/index.ts（两端共用同一套断言：参数化解析器 + 统一 TestReport）
export interface TestReport {
  taskId: string;
  command: string;        // 实际执行的完整命令
  exitCode: number;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: number | null; // 百分比，无覆盖率工具时为 null
  logRef: string;          // 对象存储 key（经 /tasks/{id}/evidence 换取）
  ranAt: string;
}
```

回传报文（`impl-01 §3.1` 的 `test.report`，字段逐一对应）：

```json
{
  "msgId": "0192f3a1-8c4d-7b21-9e10-3f5a7c2d1d20",
  "type": "test.report",
  "traceId": "1a2b3c4d5e6f4a0e9b3d5c7a1f2e4b60",
  "payload": {
    "taskId": "TASK-2401",
    "command": "mvn -q -B -DskipITs test",
    "exitCode": 0,
    "durationMs": 84200,
    "passed": 248,
    "failed": 0,
    "coverage": 88.0,
    "logRef": "evidence/TASK-2401/2026-03-19T18-10-00-surefire.log.gz"
  }
}
```

服务端依据 `impl-03` 的守卫判定 `dev`→`testGreen`：`exitCode === 0 && failed === 0 && coverage >= 85`（G3 阈值 85%，见 `impl-03`）。覆盖率 71.4% 的现状（`data.ts` `G3_FAILURE_TREND`）即因此被拒。

### 6.3 超时与资源限制

| 参数 | 默认值 | 可配置 | 超时处理 |
|:---|:---|:---|:---|
| 单次执行超时 | 20 min | 是（`aiSdlc.test.timeoutMin`） | 杀进程树，回传 `exitCode=124` + `failed=0`，状态**不迁移**，日志标注 `TIMEOUT` |
| 并发执行数 | 1 | 否 | 已有任务运行时按钮排队（队列 ≤ 3） |
| 日志留存 | 最后 8,000 行 + 首个失败堆栈 | 是 | 超出部分头部截断并写 `[truncated N lines]` |
| 进程优先级 | `nice=10`（Win: `BelowNormal`） | 否 | 避免阻塞开发者 IDE |

---

## 7. Diff 审查 UI

### 7.1 载体差异

| 维度 | VS Code | JetBrains |
|:---|:---|:---|
| 载体 | Webview Panel（`createWebviewPanel`）+ `webview-ui` Bundle | JCEF `JBCefBrowser` 加载**同一 Bundle** |
| 原生兜底 | `vscode.diff(before, after)` 只读对比 | `DiffManager.showDiff(left, right)` 只读对比 |
| 应用补丁 | `WorkspaceEdit` + `editor.applyEdit`（支持 `scope:'block'`） | `WriteCommandAction` + `Document.replaceString` |
| 主题适配 | `webview` 注入 `--vscode-*` CSS 变量 | JCEF 注入 `--jb-*` 映射（在 `webview-ui` 中做一层变量别名） |
| 通信 | `webview.postMessage` ↔ `onDidReceiveMessage` | `JBCefJSQuery` 双向桥 |

### 7.2 统一交互契约（两端一致）

| 消息 | 方向 | payload | 语义 |
|:---|:---|:---|:---|
| `coding.diff.render` | 宿主 → UI | `{sessionId, files:[{path, additions, deletions, blocks:[{id, range, before, after, status}]}]}` | 渲染 Diff |
| `coding.diff.decision` | UI → 宿主 | `{sessionId, blockId, decision:'accept'\|'reject', scope:'all'\|'block'}` | 用户决策 |
| `coding.diff.applied` | 宿主 → UI | `{blockId, applied:boolean, error?}` | 应用结果回执 |
| `coding.diff.decision`（转发云端） | 宿主 → WSS | 同上，按 `impl-01 §3.1` 原样转发 | 供 Agent 继续迭代与采纳率统计 |

工作区未保存时先执行 `saveAll`；应用失败（如文件被外部修改）回 `applied:false` 并提示「文件已变更，请刷新 Diff」。

### 7.3 采纳率口径

`acceptRate`（`data.ts` `CodingSessionDef.acceptRate`，示例 82%）定义为 `accept 块数 / 总产出块数`，**仅统计 `scope:'block'` 的块级决策**；`scope:'all'` 的批量接受按其中块数计入，避免「一键全收」把指标拉满导致失真。

---

## 8. 双端一致性冒烟测试方案

### 8.1 用例清单（12 条，两端各跑一遍）

| 编号 | 用例 | 依赖 | 通过判定 |
|:---|:---|:---|:---|
| SMK-01 | 握手与心跳 | mock `wss-hub` | 3s 内发 `client.hello`，收到 `server.welcome`；25s 心跳无丢包 |
| SMK-02 | 退避重连 | mock 断连 3 次 | 间隔 1/2/4s（±20%），第 4 次恢复 |
| SMK-03 | 离线队列 | mock 断连 + 触发 5 次写操作 | 队列长度 5，恢复后按序补发且 `idempotencyKey` 保留 |
| SMK-04 | 选中代码切片 | 打开 `OrderCreateService.java` 选中 30 行 | 产出 1 个 `priority=0` 切片，`range` 长度 ≥ 30 |
| SMK-05 | Git diff 切片 | 修改 2 文件未提交 | 产出 `priority=2` 切片 2 个，`hash` 互不相同 |
| SMK-06 | 切片上限裁剪 | 构造 6,000 行上下文 | 出域总量 ≤ 5,000 行 / 2 MB，且最低优先级被整片丢弃 |
| SMK-07 | 客户端预脱敏 | 选中含 `apiToken = "pc_live_xxx"` 与手机号 | `redacted=true`，报文内无明文密钥/完整手机号 |
| SMK-08 | 上传通道切换 | 断 WSS 后触发上传 | 自动改走 `/tasks/{id}/context-slices`，返回 `accepted>0` |
| SMK-09 | Maven 执行与解析 | 本地小型 Maven 工程 | `exitCode` 与 `mvn` 一致，`passed/failed` 与 surefire 报告一致，`coverage` 非空 |
| SMK-10 | pytest 执行与解析 | 本地小型 pytest 工程 | 同上，`coverage` 来自 `coverage.xml` |
| SMK-11 | 超时处理 | 注入 25 min 睡眠测试 | 20 min 杀进程，回传 `exitCode=124`，状态未迁移 |
| SMK-12 | Diff 块级接受/拒绝 | mock 3 块 diff | 拒绝 1 块后文件仅应用 2 块；云端收到 3 条 `coding.diff.decision` |

### 8.2 执行步骤

```bash
# 1) 启动 mock 服务（wss-hub + api-gateway 契约桩，含 impl-01 全部错误码分支）
pnpm --filter @aisdlc/mock-server start --port 18080

# 2) 生成协议产物并校验一致性
pnpm --filter @aisdlc/protocol gen && pnpm --filter @aisdlc/protocol check

# 3) VS Code 端：打包并跑集成测试（@vscode/test-electron）
pnpm --filter @aisdlc/vscode-ext build && pnpm --filter @aisdlc/vscode-ext test:smoke

# 4) JetBrains 端：Gradle 集成测试（intellij-platform-gradle-plugin 的 runIde + 测试源集）
./gradlew -p packages/jetbrains-plugin test --tests "*SmokeTest"

# 5) 汇总：比对两端同一用例的报文（结构化 diff）
node tools/smoke-report.mjs --vscode tmp/smoke-vscode.json --jetbrains tmp/smoke-jb.json
```

### 8.3 通过判定

| 判定项 | 阈值 |
|:---|:---|
| 单端用例通过率 | 12/12，无 `skip` |
| 双端报文一致性 | SMK-01~08、SMK-12 的正常路径报文经字段归一后（忽略 `msgId`/`ts`/`seq`）**完全一致** |
| 常量一致性 | 两端报告中 `SLICE_MAX_LINES=5000`、`SLICE_MAX_BYTES=2097152`、`QUEUE_MAX=200`、`TEST_TIMEOUT_MIN=20` 四项取值相同 |
| 覆盖度 | 冒烟测试用例覆盖 `impl-01 §3.1` 中 IDE 相关的 7 类上行消息（`client.hello`/`client.ping`/`context.push`/`test.report`/`coding.diff.decision`/`agent.invoke`/`task.transition.request`） |

---

## 9. 可验收标准

- [ ] §2.2 模块对照表 8 个模块均有「职责 / VS Code 实现 / JetBrains 实现 / 代码位置」四列，且代码位置为仓库内真实路径。
- [ ] §3.1 生成管线可由一条命令复现（`pnpm --filter @aisdlc/protocol gen`），重跑后 `git diff protocol/gen` 为空。
- [ ] §3.2 TS 与 Kotlin 生成的 `Envelope` 字段名、可选性完全一致，四元组 `msgId/type/payload/traceId` 均为必填。
- [ ] §4.1 采集项表中「是否出域」列与 §5 脱敏策略不矛盾（不出域项不得出现在 `context.push` 报文中）。
- [ ] §4.4 切片算法给出 `SLICE_MAX_LINES=5000`、`SLICE_MAX_BYTES=2 MB`、`PER_SLICE_MAX_LINES=200` 三个上限，与 SMK-06 判定一致。
- [ ] §5.2 客户端脱敏规则覆盖 `rd-08/rd-01/rd-02/rd-05/rd-04` 五条并给出前后样例；新增 `rd-09` 已注明需在 `impl-08-security.md` 登记。
- [ ] §6.1 命令探测表覆盖 Maven / Gradle / Node / Python / Go / Rust 六类工程，每类给出执行命令、解析器与覆盖率来源。
- [ ] §6.2 `TestReport` 字段与 `impl-01` 的 `test.report` payload 字段逐一对应（字段名与类型全等）。
- [ ] §7.2 四条 Diff 交互消息与 `impl-01 §3.1` 的 `coding.diff.decision` 定义一致，未新增未登记的消息类型。
- [ ] §8.1 冒烟用例 12 条均有可观测的通过判定，且 §8.3 给出「双端报文一致」的归一化比较口径。
- [ ] 全文无「待补充 / TBD / 略」，所有数值型阈值均标注默认值与可否配置。
