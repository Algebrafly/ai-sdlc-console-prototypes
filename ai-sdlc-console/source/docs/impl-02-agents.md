# impl-02 · 多 Agent 编排与模型网关实施方案

> **文档编号**：impl-02-agents
> **文档版本**：v1.0
> **对应原型**：`makepro/src/prototypes/ai-sdlc-console`（数据源 `data.ts`：`models` / `routingRules` / `agents` / `modelStats` / `ragEntries`）
> **依赖文档**：
> - `docs/AI研发平台设计方案.md`（总体设计方案，多 Agent 编排与模型网关章节）
> - `impl-00-overview.md`（术语基线、7 个 Agent 表、5 个模型表、Agent 别名映射表、组件清单）
> - `impl-01-protocol.md`（统一消息信封、`sdlc.<domain>.<event>` 主题规范、`SDLC-<DOMAIN>-<NNN>` 错误码规范）
> - `impl-04-data-model.md`（`model_call_log` / `rag_entry` / `agent` 相关表与 Redis 键设计）
> - `impl-05-integration.md`（PingCode 适配器与状态映射）
> - `impl-06-ide-plugin.md`（IDE 插件侧 Agent 会话与代码切片契约）
> - `impl-08-security.md`（`egressPolicy` 三档、脱敏规则、`model_call_log.redacted`）
> **事实基线**：Agent id/名称/技能/工具、模型 id/厂商/单价、路由规则一律以 `data.ts` 为准；`data.ts` 未定义的细节（如具体错误码数值、埋点事件名）在本文中显式标注「本文定义」。

---

## 目录

- [1. 文档定位与范围](#1-文档定位与范围)
- [2. Agent 全景](#2-agent-全景)
- [3. 输入 / 输出 JSON Schema](#3-输入--输出-json-schema)
- [4. Prompt 结构与 few-shot 策略](#4-prompt-结构与-few-shot-策略)
- [5. 工具调用清单（Function Calling）](#5-工具调用清单function-calling)
- [6. 模型网关路由规则表](#6-模型网关路由规则表)
- [7. Fallback 与降级策略](#7-fallback-与降级策略)
- [8. 上下文压缩策略](#8-上下文压缩策略)
- [9. 成本统计口径](#9-成本统计口径)
- [10. 可观测性与评测](#10-可观测性与评测)
- [11. 附录：Agent ↔ SDLC 环节 ↔ 门禁映射表](#11-附录agent--sdlc-环节--门禁映射表)

---

## 1. 文档定位与范围

### 1.1 定位

本文是「AI 驱动软件研发全生命周期协作平台」实施落地文档体系的第 3 篇，描述**云端 AI 推理决策层**中多 Agent 编排（`agent-orchestrator:8082`）、模型网关（`model-gateway:8083`）与 RAG 服务（`rag-service:8086`）的实现方案，回答四个问题：

1. 平台有哪些 Agent、各自负责哪个 SDLC 环节、职责边界在哪里；
2. Agent 的输入 / 输出契约（JSON Schema）、Prompt 结构与工具调用方式；
3. 请求如何在 5 个模型之间被路由、失败如何降级、成本如何归集与熔断；
4. Agent 行为如何被 traceId 串联观测与离线评测。

### 1.2 范围

| 在范围内 | 不在范围内 |
|:---|:---|
| 7 个 SDLC Agent 的职责、Schema、Prompt、工具、模型绑定 | Agent 运行态调度算法实现（另见 `agent-orchestrator` 服务设计） |
| 模型网关的 8 条路由规则与 Fallback 链 | 模型供应商账号、配额与商务（另见采购流程） |
| 上下文压缩与 Token 预算 | IDE 插件端会话 UI（另见 impl-06） |
| 成本归集口径与预算熔断 | 财务结算流程 |
| Agent 可观测埋点与离线评测集 | 数据出域策略完整定义（另见 impl-08） |

### 1.3 术语

| 术语 | 说明 |
|:---|:---|
| Agent | 绑定单一 SDLC 环节、由模型驱动、可调用工具的智能体，id 形如 `ag-*` |
| 模型 | 经模型网关接入并可路由的大模型，id 形如 `mdl-*` |
| 路由规则 | 按场景 / 匹配表达式把请求分派到目标模型，id 形如 `rr-*`，含 fallback |
| 技能（skill） | Agent 对外的能力标签，见 `agents[].skills` |
| 工具（tool） | Agent 可经 Function Calling 调用的外部能力，见 `agents[].tools` |
| traceId | 贯穿一次请求全链路（Agent → 模型 → 工具 → 事件）的 uuid v7 标识（与 impl-01 一致） |

---

## 2. Agent 全景

### 2.1 总表

下表数据逐字来自 `data.ts` 的 `agents` 数组（`AiAgentDef`）。

| id | 名称 | 所属环节（stageId） | 主模型（modelId） | 技能 | 工具 | 成功率 | 采纳率 | 平均耗时 | 运行态 |
|:---|:---|:---|:---|:---|:---|:--:|:--:|:--:|:--:|
| `ag-pm` | 需求澄清 Agent | `st-req` 需求澄清 | `mdl-claude` | Brainstorm 追问 / 用户故事拆解 / 验收标准生成 | Brainstorm 对话 / PRD 编辑器 / PingCode 需求同步 | 97.1% | 82.4% | 26 min | active |
| `ag-arch` | 架构设计 Agent | `st-arch` 架构设计 | `mdl-gpt5` | 限界上下文划分 / 接口契约生成 / 任务自动拆解 | 架构画布 / OpenAPI 契约 / 任务拆解器 | 96.4% | 80.2% | 42 min | active |
| `ag-code` | 编码实现 Agent | `st-code` 编码实现 | `mdl-claude` | 结对编码 / 单测同步生成 / MR 生成 | IDE 插件 / AI 编码会话 / GitLab MR | 95.8% | 79.6% | 58 min | active |
| `ag-review` | 代码评审 Agent | `st-code` 编码实现 | `mdl-claude` | 规约检查 / 缺陷模式识别 / 评审批注生成 | GitLab MR / SonarQube / 编码规约 KB-CODE-02 | 98.2% | 85.1% | 12 min | active |
| `ag-test` | 测试生成 Agent | `st-test` 测试验证 | `mdl-deepseek` | 用例生成 / 接口自动化 / 缺陷复现与定位 | 用例库 / 接口自动化 / JMeter 压测 | 94.3% | 74.8% | 34 min | active |
| `ag-ops` | 部署运维 Agent | `st-deploy` 部署发布 | `mdl-gpt5` | 门禁校验 / 灰度分批执行 / 回滚预案生成 | GitLab CI / Argo Rollouts / Kubernetes | 99.0% | 87.5% | 21 min | idle |
| `ag-ba` | 可观测分析 Agent | `st-observe` 运维观测 | `mdl-deepseek` | 根因分析 / 异常聚类 / 自愈建议 | Prometheus / SkyWalking / Loki | 93.6% | 72.3% | 9 min | active |

> **备用模型**不直接写在 `agents` 上，而由 §6 路由规则的 `fallbackModelId` 决定（如 `ag-pm` 主模型 `mdl-claude`，其 `rr-01` 备用为 `mdl-qwen`）。
> **触发方式**统一为「事件触发 + 人工唤起」两类：事件触发由 `agent-orchestrator` 消费事件总线消息（见 impl-03 §6），人工唤起由控制台 / IDE 插件经 `agent.invoke`（impl-01 §3.1）发起。

### 2.2 `ag-pm` 需求澄清 Agent

- **职责边界**：把业务方口述纪要、客户投诉记录与历史 PRD 转为结构化 PRD 基线与可验收的用户故事（`inputs` 见 `SDLC_STAGES[st-req]`）。
- **不做什么**：不做技术方案选型、不写代码、不修改已冻结的 PRD 基线（修改需人工确认后生成新版本）。
- **失败降级**：Brainstorm 追问无法收敛（连续 3 轮未补齐关键边界）时，降级为「生成待澄清问题清单 + 人工接管」，并在 `sdlc.agent.result` 中标记 `needsHuman: true`；模型失败按 §6 `rr-01` 回退 `mdl-qwen`。

### 2.3 `ag-arch` 架构设计 Agent

- **职责边界**：划分限界上下文与聚合根边界，产出四层架构视图、接口契约（OpenAPI）并把需求自动拆解为开发任务。
- **不做什么**：不做需求澄清、不直接改代码、不代替人工做最终架构评审签字（架构师为 `ownerRoleId: architect`）。
- **失败降级**：契约生成失败时保留上一版契约并要求人工补全；长上下文超限（>400K）时按 §8 压缩，仍超限则拆分需求分批评审；模型失败按 `rr-02` 回退 `mdl-claude`。

### 2.4 `ag-code` 编码实现 Agent

- **职责边界**：按任务卡 `TASK-24xx` 与接口契约结对编码，同步生成单元测试，产出可评审 MR；引用编码规约 `KB-CODE-02`。
- **不做什么**：不自行合入主干（合入需人工评审，G3 门禁校验）、不绕过脱敏直接出域、不改动任务卡范围外文件。
- **失败降级**：本地测试未全绿（`dev` → `testGreen` 守卫不满足，见 impl-03 §4）时不流转状态，回退到 `dev` 继续修复；模型失败按 `rr-03` 回退 `mdl-deepseek`；L2+ 密级代码强制 `rr-08`（`mdl-local`，禁止出域、无外部回退）。

### 2.5 `ag-review` 代码评审 Agent

- **职责边界**：对每个 MR 做编码规约检查与缺陷模式识别，产出评审批注并拦截高风险合入。
- **不做什么**：不修改被评审代码、不代替人工做最终 approve（仅给出门禁建议）、不做根因修复（转 `ag-test`）。
- **失败降级**：SonarQube 不可用时降级为「仅规则文本检查」并标记 `degraded: true`；模型失败按 `rr-04` 场景回退（`mdl-deepseek` → `mdl-claude`）。

### 2.6 `ag-test` 测试生成 Agent

- **职责边界**：依据验收标准生成用例、执行接口自动化回归、输出缺陷复现与定位信息（含根因初筛）。
- **不做什么**：不签发测试报告（由测试负责人 `ownerRoleId: tester` 签发）、不直接关闭缺陷（`verifying → closed` 需人工复验，见 impl-03 §3）。
- **失败降级**：用例生成失败时回退模板用例库；缺陷初筛 P0/P1 误判升级时按 `rr-05` 转 `mdl-gpt5` 深挖。

### 2.7 `ag-ops` 部署运维 Agent

- **职责边界**：执行六道门禁校验（G1~G6）与灰度分批发布，异常时生成回滚预案并告警。
- **不做什么**：不绕过门禁强推、不在未获审批时执行生产全量发布、不自行修改发布单范围。
- **失败降级**：门禁失败即中断流水线并回滚（`pipeline.stage_updated` 标记 failed）；K8s 不可用时进入只读待命，`state-machine` 同步降级返回 `SDLC-STATE-503`（impl-00 §6.3）；模型失败按 `rr-07` 回退 `mdl-claude`。

### 2.8 `ag-ba` 可观测分析 Agent

> 注：`ag-ba` 的 `stageName` 为 **运维观测**，职责为可观测分析（根因分析 / 异常聚类 / 自愈建议），非业务分析。以 `data.ts` 为准。

- **职责边界**：采集指标 / 日志 / 链路三支柱数据，输出根因分析报告与自愈建议，关联 `traceId`。
- **不做什么**：不直接执行自愈变更（自愈建议需人工或 `ag-ops` 确认后执行）、不修改业务代码。
- **失败降级**：三支柱数据任一缺失时降级为「单源分析」并标注置信度；模型失败按 `rr-05` 回退 `mdl-gpt5`。

### 2.9 Agent ↔ 环节 ↔ 别名对照

`impl-00 §1.5` 给出 `alias` 字段；设计方案原文使用另一套命名，二者经下表对齐（以 `data.ts` id 为准）。

| data.ts id | data.ts 名称 | impl-00 别名 | 设计方案原文称谓 | SDLC 环节 |
|:---|:---|:---|:---|:---|
| `ag-pm` | 需求澄清 Agent | `product-agent` | 产品 Agent | 需求澄清 |
| `ag-arch` | 架构设计 Agent | `architect-agent` | 架构 Agent | 架构设计 |
| `ag-code` | 编码实现 Agent | `coding-agent` | 编码 Agent | 编码实现 |
| `ag-review` | 代码评审 Agent | `review-agent` | 编码 Agent（评审） | 编码实现 |
| `ag-test` | 测试生成 Agent | `test-agent` | 测试 Agent | 测试验证 |
| `ag-ops` | 部署运维 Agent | `ops-agent` | 部署 Agent | 部署发布 |
| `ag-ba` | 可观测分析 Agent | `observability-agent` | QA Agent（观测） | 运维观测 |

---

## 3. 输入 / 输出 JSON Schema

### 3.1 通用约束

- 所有 Agent 调用经 `agent-orchestrator` 归一化，外层沿用 impl-01 统一信封 `{ msgId, type, payload, traceId }`；`type` 取 `agent.invoke` / `agent.result`。
- `payload` 内 schema 字段命名统一 **camelCase**（impl-01 §1）；落库列名 snake_case（impl-04）。
- 所有 schema 均 `additionalProperties: false`，未知字段返回 `SDLC-AGENT-400`（本文定义）。
- `traceId` 为必填，缺失或非 uuid v7 返回 `SDLC-AI-400`（impl-01 §4.10）。

### 3.2 `ag-pm`（需求澄清）

```json
{ "input": { "type": "object", "additionalProperties": false, "required": ["requirementId", "rawInput", "traceId"],
    "properties": { "requirementId": { "type": "string", "description": "需求 id，形如 REQ-2401" },
      "rawInput": { "type": "string", "description": "业务方口述纪要 / 投诉记录原文" },
      "historyPrd": { "type": "array", "items": { "type": "string" }, "description": "历史 PRD 引用（可选）" },
      "traceId": { "type": "string", "format": "uuid", "description": "全链路追踪 id" } } },
  "output": { "type": "object", "required": ["requirementId", "prdVersion", "userStories", "acceptanceCriteria", "openQuestions"],
    "properties": { "requirementId": { "type": "string" },
      "prdVersion": { "type": "string", "description": "PRD 版本，形如 v2.3" },
      "userStories": { "type": "array", "items": { "type": "object", "required": ["id", "title", "asA", "iWant", "soThat"], "properties": { "id": { "type": "string", "description": "形如 US-01" }, "title": { "type": "string" }, "asA": { "type": "string" }, "iWant": { "type": "string" }, "soThat": { "type": "string" } } } },
      "acceptanceCriteria": { "type": "array", "items": { "type": "string" } },
      "openQuestions": { "type": "array", "items": { "type": "string" }, "description": "待澄清问题清单" } } } }
```

### 3.3 `ag-arch`（架构设计）

```json
{ "input": { "type": "object", "additionalProperties": false, "required": ["requirementId", "prdVersion", "traceId"],
    "properties": { "requirementId": { "type": "string" }, "prdVersion": { "type": "string" },
      "codeIndexRef": { "type": "string", "description": "现有代码库索引引用（可选）" },
      "traceId": { "type": "string", "format": "uuid" } } },
  "output": { "type": "object", "required": ["contexts", "contracts", "tasks"],
    "properties": {
      "contexts": { "type": "array", "items": { "type": "object", "required": ["name", "aggregates", "boundaries"], "properties": { "name": { "type": "string", "description": "限界上下文名" }, "aggregates": { "type": "array", "items": { "type": "string" }, "description": "聚合根" }, "boundaries": { "type": "array", "items": { "type": "string" } } } } },
      "contracts": { "type": "array", "items": { "type": "object", "required": ["contractId", "method", "path", "openapiRef"], "properties": { "contractId": { "type": "string" }, "method": { "type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"] }, "path": { "type": "string" }, "openapiRef": { "type": "string", "description": "契约片段引用" } } } },
      "tasks": { "type": "array", "items": { "type": "object", "required": ["taskId", "title", "points", "contractId"], "properties": { "taskId": { "type": "string", "description": "形如 TASK-2401" }, "title": { "type": "string" }, "points": { "type": "integer", "description": "故事点，用于 rr-03 匹配" }, "contractId": { "type": "string" } } } } } } }
```

### 3.4 `ag-code`（编码实现）

```json
{ "input": { "type": "object", "additionalProperties": false, "required": ["taskId", "contractRef", "secretLevel", "traceId"],
    "properties": { "taskId": { "type": "string", "description": "形如 TASK-2401" },
      "contractRef": { "type": "string", "description": "接口契约引用" },
      "codeSlices": { "type": "array", "description": "符合 impl-06 SLICE_MAX_LINES=5000 / PER_SLICE_MAX_LINES=200 的切片", "items": { "type": "object", "required": ["path", "startLine", "endLine", "content"], "properties": { "path": { "type": "string" }, "startLine": { "type": "integer" }, "endLine": { "type": "integer" }, "content": { "type": "string", "description": "经脱敏后的代码切片" } } } },
      "secretLevel": { "type": "string", "enum": ["L0", "L1", "L2", "L3"], "description": "密级，驱动 rr-08 判定" },
      "traceId": { "type": "string", "format": "uuid" } } },
  "output": { "type": "object", "required": ["taskId", "diffRef", "unitTests", "coverage", "redacted"],
    "properties": { "taskId": { "type": "string" }, "diffRef": { "type": "string", "description": "MR / diff 引用，形如 MR-2410" },
      "unitTests": { "type": "array", "items": { "type": "string" }, "description": "生成的测试用例标识" },
      "coverage": { "type": "number", "description": "增量分支覆盖率（G3 阈值 85）" },
      "redacted": { "type": "boolean", "description": "是否已执行脱敏（写入 model_call_log.redacted）" } } } }
```

### 3.5 `ag-review`（代码评审）

```json
{ "input": { "type": "object", "additionalProperties": false, "required": ["mrId", "diffRef", "traceId"],
    "properties": { "mrId": { "type": "string" }, "diffRef": { "type": "string" },
      "sonarReportRef": { "type": "string", "description": "SonarQube 报告引用（可选）" },
      "traceId": { "type": "string", "format": "uuid" } } },
  "output": { "type": "object", "required": ["mrId", "verdict", "findings"],
    "properties": { "mrId": { "type": "string" },
      "verdict": { "type": "string", "enum": ["approve", "comment", "request_changes", "block"] },
      "findings": { "type": "array", "items": { "type": "object", "required": ["severity", "file", "line", "message", "ruleRef"], "properties": { "severity": { "type": "string", "enum": ["blocker", "critical", "major", "minor", "info"] }, "file": { "type": "string" }, "line": { "type": "integer" }, "message": { "type": "string" }, "ruleRef": { "type": "string", "description": "规约条目，如 KB-CODE-02#x.y" } } } } } } }
```

### 3.6 `ag-test`（测试生成）

```json
{ "input": { "type": "object", "additionalProperties": false, "required": ["targetType", "targetId", "traceId"],
    "properties": { "targetType": { "type": "string", "enum": ["requirement", "task", "bug", "release", "pipeline"] },
      "targetId": { "type": "string", "description": "形如 BUG-1043" },
      "failureLogRef": { "type": "string", "description": "失败日志 / 用例执行记录引用（可选）" },
      "traceId": { "type": "string", "format": "uuid" } } },
  "output": { "type": "object", "required": ["caseIds", "executionSummary", "defects"],
    "properties": { "caseIds": { "type": "array", "items": { "type": "string" }, "description": "用例标识" },
      "executionSummary": { "type": "object", "required": ["total", "passed", "failed"], "properties": { "total": { "type": "integer" }, "passed": { "type": "integer" }, "failed": { "type": "integer" } } },
      "defects": { "type": "array", "items": { "type": "object", "required": ["pcCode", "title", "priority", "reproSteps", "rootCauseHint"], "properties": { "pcCode": { "type": "string", "description": "PingCode 缺陷编号" }, "title": { "type": "string" }, "priority": { "type": "string", "enum": ["P0", "P1", "P2", "P3"] }, "reproSteps": { "type": "array", "items": { "type": "string" } }, "rootCauseHint": { "type": "string", "description": "根因初筛结论" } } } } } } }
```

### 3.7 `ag-ops`（部署运维）

```json
{ "input": { "type": "object", "additionalProperties": false, "required": ["releaseId", "versionTag", "changeList", "traceId"],
    "properties": { "releaseId": { "type": "string" }, "versionTag": { "type": "string", "description": "已冻结版本 tag" },
      "changeList": { "type": "array", "items": { "type": "string" } }, "traceId": { "type": "string", "format": "uuid" } } },
  "output": { "type": "object", "required": ["releaseId", "gateResults", "rolloutPlan", "rollbackPlan"],
    "properties": { "releaseId": { "type": "string" },
      "gateResults": { "type": "array", "items": { "type": "object", "required": ["gateId", "status", "detail"], "properties": { "gateId": { "type": "string", "enum": ["G1", "G2", "G3", "G4", "G5", "G6"] }, "status": { "type": "string", "enum": ["pass", "fail", "warn"] }, "detail": { "type": "string" } } } },
      "rolloutPlan": { "type": "object", "required": ["batches"], "properties": { "batches": { "type": "array", "items": { "type": "object", "properties": { "percent": { "type": "integer" }, "waitMinutes": { "type": "integer" } } } } } },
      "rollbackPlan": { "type": "string", "description": "回滚预案文本 / 引用" } } } }
```

### 3.8 `ag-ba`（可观测分析）

```json
{ "input": { "type": "object", "additionalProperties": false, "required": ["alertId", "traceIds", "traceId"],
    "properties": { "alertId": { "type": "string", "description": "告警事件 id" },
      "traceIds": { "type": "array", "items": { "type": "string" }, "description": "关联调用链 traceId" },
      "timeRange": { "type": "object", "properties": { "from": { "type": "string" }, "to": { "type": "string" } } },
      "traceId": { "type": "string", "format": "uuid" } } },
  "output": { "type": "object", "required": ["alertId", "clusters", "rootCause", "confidence", "remediation"],
    "properties": { "alertId": { "type": "string" },
      "clusters": { "type": "array", "items": { "type": "object", "properties": { "signature": { "type": "string" }, "count": { "type": "integer" } } } },
      "rootCause": { "type": "string" }, "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "remediation": { "type": "array", "items": { "type": "string" }, "description": "自愈建议（需人工确认）" } } } }
```

---

## 4. Prompt 结构与 few-shot 策略

### 4.1 System Prompt 骨架

所有 Agent 共享统一骨架，仅在 `<role>` / `<skills>` / `<tools>` / `<output_contract>` 段差异化：

```
<role>你是「{agent.name}」，服务于 SDLC 环节「{agent.stageName}」。职责：{agent.desc}</role>
<skills>{agent.skills 逐条}</skills>
<tools>可调用工具：{agent.tools 逐条，含只读/副作用/需人工确认标注}</tools>
<context_order>
1. 任务/需求目标（taskId / requirementId）
2. 接口契约（contractRef）
3. RAG 命中片段（按 §8 注入，标注 kbId + 相似度）
4. 代码切片（已脱敏，标注 path:startLine-endLine）
5. 历史对话（仅保留最近 N 轮，见 §8）
</context_order>
<output_contract>严格输出 JSON，符合 {agent 的 output JSON Schema}。禁止输出 schema 之外的字段；不确定时使用 openQuestions 字段而非编造。</output_contract>
<refusal_policy>超出职责边界、涉及 L2+ 密级出域、或需要人工签字的动作，一律拒绝并说明原因。</refusal_policy>
```

### 4.2 few-shot 策略

| 项 | 策略 |
|:---|:---|
| 正例数量 | 每 Agent 2~3 条「输入 → 期望输出」精简样例，来源为历史采纳（`acceptRate` 高的样本） |
| 反例数量 | 每 Agent 1 条，标注错误点（如越权出域、编造契约字段、跳过守卫直接流转状态） |
| 放置位置 | 反例置于正例之后、`<output_contract>` 之前，末尾补一句「不得复现上述反例」 |
| 动态注入 | 从 `rag_entry` 中按 `hitCount` 排序取 Top-K 相关片段作为补充上下文 |
| 版本管理 | few-shot 与 System Prompt 均纳入 Prompt 版本号，记录在本篇自定义字段 `promptVersion`（本文定义） |

### 4.3 上下文注入顺序与拒绝策略

注入顺序与 `<context_order>` 一致：**目标 → 契约 → RAG → 代码切片 → 历史对话**；RAG 与代码切片合计不得超过预算（见 §8），历史对话超出时按「先丢最旧、再丢工具中间结果、最后丢助手长文本」裁剪。

| 场景 | 行为 |
|:---|:---|
| 请求超出 Agent 职责边界 | 拒绝，返回 `refusalReason`，建议转交正确 Agent（如编码问题转 `ag-code`） |
| 输入关键字段缺失 | 不编造，写入 `openQuestions` / 请求澄清（`ag-pm` 走 Brainstorm 追问） |
| 涉及 L2+ 密级代码出域 | 强制走 `rr-08`（`mdl-local`），若无本地模型则 fail-closed 拒绝（对齐 impl-08） |
| 需人工签字动作（合入 / 关单 / 全量发布） | 只产出建议，不执行，标记 `needsHuman: true` |

---

## 5. 工具调用清单（Function Calling）

工具名与 `agents[].tools` 逐字一致；调用经 `agent.tool_call`（impl-01 §3.2）上报，入参出参均脱敏后落 `audit_log`。

| Agent | 工具 | 类型 | 说明 |
|:---|:---|:---|:---|
| `ag-pm` | Brainstorm 对话 | 只读 | 多轮追问，不落库 |
| `ag-pm` | PRD 编辑器 | **副作用** | 写入 PRD 草稿，需人工确认后发布版本 |
| `ag-pm` | PingCode 需求同步 | **副作用 · 需人工确认** | 经 `integration-adapter:8085` 同步，写 `external_id_map` |
| `ag-arch` | 架构画布 | 只读 | 渲染架构视图 |
| `ag-arch` | OpenAPI 契约 | **副作用** | 生成/更新契约文件，版本冻结需人工确认 |
| `ag-arch` | 任务拆解器 | **副作用 · 需人工确认** | 批量创建任务卡（进入 `taskCreated` 态） |
| `ag-code` | IDE 插件 | 只读 | 读取代码切片（已脱敏） |
| `ag-code` | AI 编码会话 | 只读 | 生成建议，不直接写工作区 |
| `ag-code` | GitLab MR | **副作用 · 需人工确认** | 创建 MR，合入由 G3 门禁 + 人工评审决定 |
| `ag-review` | GitLab MR | 只读 | 读取 diff |
| `ag-review` | SonarQube | 只读 | 读取静态扫描报告 |
| `ag-review` | 编码规约 KB-CODE-02 | 只读 | RAG 检索规约条目 |
| `ag-test` | 用例库 | **副作用** | 新增/更新用例 |
| `ag-test` | 接口自动化 | **副作用** | 触发回归执行 |
| `ag-test` | JMeter 压测 | **副作用 · 需人工确认** | 压测影响环境，需人工确认窗口 |
| `ag-ops` | GitLab CI | **副作用** | 触发流水线 |
| `ag-ops` | Argo Rollouts | **副作用 · 需人工确认** | 灰度/全量发布，生产变更需审批 |
| `ag-ops` | Kubernetes | **副作用 · 需人工确认** | 变更集群资源 |
| `ag-ba` | Prometheus | 只读 | 读取指标 |
| `ag-ba` | SkyWalking | 只读 | 读取调用链 |
| `ag-ba` | Loki | 只读 | 读取日志 |

> **约定**：标注「需人工确认」的工具，Agent 只能生成调用意图，实际执行需经 `approval.decide`（impl-01 §3.1）人工批准。

---

## 6. 模型网关路由规则表

路由规则逐字来自 `data.ts` 的 `routingRules`（`rr-01` ~ `rr-08`）。除 `matchExpr` / `modelId` / `priority` / `fallbackModelId` 外的生成参数（温度、top_p、超时等）为**本文定义**默认值，供 `model-gateway:8083` 落地。

| 规则 id | 名称 | 场景 | 匹配表达式 | 目标模型 | 优先级 | 备用模型 |
|:---|:---|:---|:---|:---|:--:|:---|
| `rr-01` | 需求拆解路由 | 需求澄清 | `stage = st-req` | `mdl-claude` | 1 | `mdl-qwen` |
| `rr-02` | 架构评审路由 | 架构设计 | `stage = st-arch` | `mdl-gpt5` | 1 | `mdl-claude` |
| `rr-03` | 复杂重构代码生成 | 编码实现 | `task.type = 重构 && task.points >= 8` | `mdl-claude` | 1 | `mdl-deepseek` |
| `rr-04` | 单元测试生成路由 | 编码实现 | `action = unit_test` | `mdl-deepseek` | 2 | `mdl-claude` |
| `rr-05` | 缺陷初筛路由 | 测试验证 | `bug.priority in [P0, P1]` | `mdl-deepseek` | 2 | `mdl-gpt5` |
| `rr-06` | 中文文档与用例补全 | 需求澄清 / 测试验证 | `lang = zh && action = doc` | `mdl-qwen` | 3 | `mdl-claude` |
| `rr-07` | 影响面与发布风险分析 | 部署发布 | `stage = st-deploy` | `mdl-gpt5` | 1 | `mdl-claude` |
| `rr-08` | 敏感代码脱敏补全 | 编码实现 | `code.secretLevel >= L2` | `mdl-local` | 1 | （空，禁止外部回退） |

**生成参数默认值（本文定义）**：

| 场景 | 温度 | top_p | 最大输出 Token | 超时 | 重试 | 流式 | 允许出网 |
|:---|:--:|:--:|:--:|:--:|:--:|:--:|:---|
| 需求拆解（`rr-01`） | 0.6 | 0.9 | 4096 | 60s | 2 | 是 | 是 |
| 架构评审（`rr-02`） | 0.3 | 0.9 | 8192 | 120s | 2 | 是 | 是 |
| 复杂重构（`rr-03`） | 0.2 | 0.95 | 8192 | 120s | 2 | 是 | 是 |
| 单测生成（`rr-04`） | 0.2 | 0.95 | 4096 | 60s | 3 | 是 | 是 |
| 缺陷初筛（`rr-05`） | 0.3 | 0.9 | 4096 | 60s | 3 | 是 | 是 |
| 中文文档（`rr-06`） | 0.5 | 0.9 | 4096 | 60s | 2 | 是 | 是 |
| 发布风险（`rr-07`） | 0.2 | 0.9 | 8192 | 120s | 2 | 是 | 是 |
| 敏感补全（`rr-08`） | 0.2 | 0.95 | 4096 | 90s | 1 | 否 | **否**（禁止出域） |

**模型清单（`data.ts` `models`）**：

| id | 名称 | 厂商 | 版本 | 上下文 | 单价（元/1K tokens） | 部署形态 | 出域 |
|:---|:---|:---|:---|:--:|:--:|:---|:---|
| `mdl-claude` | Claude 3.7 Sonnet | Anthropic | v3.7 | 200K | 0.021 | 公有云 SaaS | 允许出域（代码需先脱敏） |
| `mdl-deepseek` | DeepSeek-V3 | DeepSeek | v3 | 128K | 0.004 | 公有云 SaaS | 允许出域 |
| `mdl-qwen` | Qwen2.5-Max | Alibaba Cloud | v2.5 | 128K | 0.006 | 公有云 SaaS | 允许出域 |
| `mdl-gpt5` | GPT-5 | OpenAI | v5.0 | 400K | 0.035 | 公有云 SaaS | 允许出域（代码需先脱敏） |
| `mdl-local` | 私有化 Llama3-70B | 内部私有化部署 | 3.0-70B | 32K | 0.001 | 私有化 VPC | 禁止出域 |

---

## 7. Fallback 与降级策略

### 7.1 五类降级场景与降级链

| # | 场景 | 触发条件 | 降级链 |
|:--:|:---|:---|:---|
| 1 | 主模型超时 | 超过 §6 超时阈值 | 主模型 → 备用模型（`routingRules.fallbackModelId`）→ 重试上限后转人工 |
| 2 | 主模型限流（429） | 网关返回 429 | 指数退避 1/2/4/8s（±20%）重试主模型 2 次 → 切备用模型 |
| 3 | 主模型不可用（5xx） | 连续 3 次 5xx | 熔断 60s，直接走备用模型，同时上报 `SDLC-AI-503`（本文定义） |
| 4 | 输出不合法 | JSON Schema 校验失败 | 重试 1 次（附校验错误）→ 仍失败则返回 `SDLC-AGENT-422`（本文定义）并转人工 |
| 5 | 出域受限 | 命中 `rr-08` 且无本地模型 | fail-closed 拒绝，返回 `SDLC-SEC-403`（impl-08），不降级到外部模型 |

### 7.2 降级链示例

- `ag-arch`（`rr-02`）：`mdl-gpt5` → `mdl-claude` → 人工评审。
- `ag-test` 缺陷初筛（`rr-05`）：`mdl-deepseek` → `mdl-gpt5`（深挖）→ 人工。
- `ag-code` 敏感补全（`rr-08`）：`mdl-local` → **无回退** → fail-closed。

### 7.3 可观测埋点与告警

降级发生时，`model_call_log` 写入 `fallback_from`（原模型 id）与 `status`，并追加事件：

| 埋点事件（本文定义） | 触发 | 关键字段 |
|:---|:---|:---|
| `agent.model.fallback` | 每次发生模型降级 | `traceId, agentId, fromModelId, toModelId, reason` |
| `agent.model.circuit_open` | 熔断打开 | `modelId, openUntil` |
| `agent.invoke.rejected` | 出域拒绝 / Schema 失败 | `traceId, code, reason` |

告警规则（本文定义）：`agent.model.fallback` 5 分钟内 > 10 次 → 通知值班；`agent.model.circuit_open` 任一触发 → 立即告警。

---

## 8. 上下文压缩策略

### 8.1 窗口预算分配

按目标模型 `contextWindow` 划分预算（以 200K 为例，本文定义比例）：

| 分区 | 占比 | 上限（200K） | 说明 |
|:---|:--:|:--:|:---|
| System Prompt + few-shot | 10% | 20K | 固定骨架，随版本缓存 |
| 目标 + 契约 | 10% | 20K | 任务卡 / 需求 / OpenAPI 片段 |
| RAG 片段 | 30% | 60K | 按相似度排序取 Top-K |
| 代码切片 | 40% | 80K | 已脱敏，受 impl-06 切片上限约束 |
| 历史对话 | 10% | 20K | 保留最近 N 轮 |

### 8.2 压缩顺序与算法

压缩按「先低价值、后高价值」顺序执行：

1. **历史对话裁剪**：丢弃最旧的用户/助手轮次，保留工具调用结论摘要。
2. **工具中间结果折叠**：将多次工具返回压缩为一句结论 + 引用 id。
3. **RAG 片段重排截断**：按相似度降序，超出预算的低分片段整体丢弃。
4. **代码切片最小化**：按 `path:startLine-endLine` 只保留变更行 ± 上下文窗口，遵守 `PER_SLICE_MAX_LINES=200`。
5. **契约摘要化**：仅保留本次任务涉及的接口片段。

若压缩后仍超限，返回 `SDLC-AGENT-422`（本文定义）并提示「上下文超限，请拆分任务」。

### 8.3 代码切片最小化与脱敏前置

- **脱敏必须前置**：任何切片进入模型请求前先经脱敏规则引擎（impl-08，`redactRules` rd-01~rd-09），脱敏结果写入 `model_call_log.redacted=true`。
- **切片上限**：`SLICE_MAX_LINES=5000`、`SLICE_MAX_BYTES=2MB`、`PER_SLICE_MAX_LINES=200`（与 impl-06 一致）。
- **密级联动**：`code.secretLevel >= L2` 强制走 `rr-08`，禁止出域。

---

## 9. 成本统计口径

### 9.1 Token 计量与归集

| 项 | 口径 |
|:---|:---|
| 计量单位 | `prompt_tokens` + `completion_tokens`，落 `model_call_log` |
| 归集维度 | 按 `agent_id` × `model_id` × `scene` × `routing_rule_id` 归集 |
| 成本公式 | `cost = (prompt_tokens + completion_tokens) / 1000 × costPer1kTokens` |
| 计数器 | Redis `counter:model:{modelId}:{yyyymmdd}`（与 impl-04 §5 一致），INCRBY 累加 token 数 |
| 单价来源 | `models[].costPer1kTokens`（元/1K tokens），变更需版本化 |

### 9.2 原型基线（`data.ts` `modelStats`，近 7 日 2026-03-13 ~ 2026-03-19）

| 模型 | 调用次数 | Tokens(K) | 成本(元) | 平均时延(ms) | 成功率 | 采纳率 |
|:---|:--:|:--:|:--:|:--:|:--:|:--:|
| `mdl-claude` | 6240 | 41200 | 865.2 | 2260 | 99.2% | 84.6% |
| `mdl-deepseek` | 7180 | 32800 | 131.2 | 1120 | 99.6% | 76.4% |
| `mdl-qwen` | 2860 | 11400 | 68.4 | 1360 | 99.4% | 79.1% |
| `mdl-gpt5` | 1080 | 8600 | 301.0 | 3480 | 98.6% | 88.3% |
| `mdl-local` | 1060 | 2240 | 2.24 | 940 | 99.8% | 71.5% |
| **合计** | **18420** | **96240** | **1286.4** | **1840** | — | **78.2%** |

### 9.3 预算熔断

| 层级 | 阈值（本文定义） | 动作 |
|:---|:---|:---|
| 单次调用 | 单请求 token > 预算 90% | 记录 `warn`，触发压缩 |
| Agent 日预算 | 超日配额 | 拒绝新调用，返回 `SDLC-AI-400`（impl-01） |
| 平台日预算 | 超总配额 80% / 100% | 80% 告警；100% 熔断非关键场景（仅保留 P0 缺陷相关调用） |

### 9.4 报表字段与埋点事件名

`model_call_log` 关键字段（与 impl-04 §3.20 一致）：`trace_id, agent_id, model_id, scene, routing_rule_id, fallback_from, prompt_tokens, completion_tokens, cost, latency_ms, status, redacted, egress_policy`。

埋点事件（本文定义）：`agent.invoke.start` / `agent.invoke.end` / `agent.model.fallback` / `agent.cost.accumulate`（按日聚合写入统计表）。

---

## 10. 可观测性与评测

### 10.1 traceId 串联

一次 Agent 调用的全链路统一 `traceId`：控制台 / IDE（`agent.invoke`）→ `agent-orchestrator` → `model-gateway`（`model_call_log`）→ 工具调用（`agent.tool_call`）→ 事件总线（`sdlc.agent.<runId>` 主题）→ 前端订阅（impl-01 §3.2）。任一环节失败，均可凭 `traceId` 反查完整链路。

### 10.2 关键指标

| 指标 | 定义 | 目标（本文定义） |
|:---|:---|:---|
| 成功率 | 正常返回 / 总调用，对应 `agents[].successRate` | ≥ 95% |
| 采纳率 | 人工采纳 / 产出，对应 `agents[].acceptRate` | ≥ 75% |
| 平均耗时 | 端到端，对应 `agents[].avgDurationMin` | ≤ 60 min |
| Fallback 率 | 发生降级的调用占比 | ≤ 5% |
| 单任务成本 | 归集到 `task` 的累计 cost | 按模型分层设定 |

### 10.3 离线评测集与回归基线

| 项 | 说明 |
|:---|:---|
| 评测集构成 | 每 Agent 一套：`ag-pm` 历史需求 30 条、`ag-arch` 契约 20 条、`ag-code` 任务 50 条、`ag-review` MR 40 条、`ag-test` 缺陷 30 条、`ag-ops` 发布单 15 条、`ag-ba` 告警 25 条（本文定义） |
| 评测指标 | Schema 合法率、关键字段召回、人工采纳率、成本 |
| 回归基线 | 采纳率不低于 `agents[].acceptRate` − 3pp，成功率不低于 `agents[].successRate` − 2pp |
| 触发时机 | Prompt 版本变更、模型版本变更、路由规则变更时必跑 |
| 结果留存 | 写入评测报告并与 `promptVersion`（本文定义）绑定 |

---

## 11. 附录：Agent ↔ SDLC 环节 ↔ 门禁映射表

环节与门禁数据来自 `data.ts` 的 `SDLC_STAGES`。

| 环节（stageId / code） | 环节名 | 负责 Agent | 门禁 | 门禁校验要点 |
|:---|:---|:---|:--:|:---|
| `st-req` / S1 | 需求澄清 | `ag-pm` | G1 | PRD 基线与验收标准完备 |
| `st-arch` / S2 | 架构设计 | `ag-arch` | G2 | 接口契约冻结、任务拆解完成 |
| `st-code` / S3 | 编码实现 | `ag-code`、`ag-review` | G3 | 静态扫描通过、增量覆盖率 ≥ 85% |
| `st-test` / S4 | 测试验证 | `ag-test` | G4 | 用例执行达标、缺陷闭环 |
| `st-deploy` / S5 | 部署发布 | `ag-ops` | G5 | 六道门禁全通过、灰度就绪 |
| `st-observe` / S6 | 运维观测 | `ag-ba`、`ag-ops` | G6 | 核心指标告警规则已注册 |

**RAG 知识库与 Agent 关联（`data.ts` `ragEntries`，`embedModel` 均为 `bge-large-zh-v1.5`）**：

| kbId | 条目数 | 主要服务 Agent |
|:---|:--:|:---|
| `KB-ARCH-01` | 2 | `ag-arch` |
| `KB-CODE-02` | 2 | `ag-code`、`ag-review` |
| `KB-CODE-05` | 1 | `ag-code` |
| `KB-OPS-01` | 2 | `ag-ops`、`ag-ba` |
| `KB-TEST-03` | 1 | `ag-test` |
| `KB-SEC-02` | 2 | 全体（出域脱敏） |
| `KB-BS-2401` | 1 | `ag-pm` |

> 本文定义的事件主题：`agent.model.fallback`、`agent.model.circuit_open`、`agent.invoke.rejected`、`agent.invoke.start`、`agent.invoke.end`、`agent.cost.accumulate`。
> 本文定义的错误码：`SDLC-AGENT-400`、`SDLC-AGENT-422`、`SDLC-AI-429`、`SDLC-AI-503`。其余错误码沿用 impl-01 §4.10 与 impl-08。
