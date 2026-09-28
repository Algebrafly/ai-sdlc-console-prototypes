# impl-05 项目管理平台集成（PingCode 适配）

> 版本：v1.0 | 日期：2026-09-24 | 对应设计方案：第 5 节「PingCode 集成层设计」、第 6 节「六环节能力映射」

## 本篇范围

本篇定义项目管理平台集成的**可开工落地设计**：`ProjectMgmtProvider` 抽象接口的逐方法契约、PingCode OpenAPI 的实际端点与鉴权落地、本平台 ↔ PingCode 的数据模型与状态工作流映射、双向同步与 Webhook 订阅回写、幂等 `external_id_map` 设计、失败重试与死信人工兜底、定期对账算法。目标是「新增 Jira / 禅道 / ONES / TAPD 时只加一个实现类，业务层零改动」。

不包含：表结构的完整 DDL（见 impl-04）、事件总线内部语义（见 impl-03）、控制台同步可观测页面的渲染（见 impl-07）。

## 关联文档

| 文档 | 关系 |
|:---|:---|
| impl-03 任务状态机与事件总线 | 本适配器消费 `sdlc.task.state_changed` 等主题；事件主题命名 `sdlc.<domain>.<event>` |
| impl-04 数据模型与存储设计 | `external_id_map` / `sync_event` 两张表的字段与唯一索引 |
| impl-07 Web 控制台实施 | 「PingCode 集成中心」页（适配器列表 / 映射表 / ID 映射 / 同步队列 / 对账）的数据来源 |
| impl-08 安全、脱敏与合规 | 出域开关对同步通道的拦截、审计留痕 |

---

## 1. 设计目标与技术决策

| 决策点 | 选定方案 | 理由 | 被否方案 |
|:---|:---|:---|:---|
| 抽象粒度 | 定义 `ProjectMgmtProvider` 接口 + `PingCodeProvider` 实现，接口按「业务动作」而非「HTTP 端点」划分 | 端点随厂商变，业务动作稳定；换厂商只需重写实现 | 直接暴露 HTTP 客户端：业务层耦合厂商端点 |
| 同步主方向 | **平台 → PingCode 单向为主**，PingCode → 平台仅回写「状态 / 指派 / 截止时间」白名单字段 | 避免双写不一致；白名单外的外部变更只告警不覆盖 | 全字段双向：冲突不可判定 |
| 幂等 | `external_id_map` 双唯一索引（provider+external、provider+local） | 数据库层兜底，进程崩溃/重放都不重复创建 | 仅靠应用层缓存：多实例并发下会漏 |
| 冲突解决 | 时间戳较新者胜 + 状态机合法性校验；不合法则进死信 | 状态机有严格 `nextStates`，非法迁移必须人工介入 | 一律以平台为准：会吞掉外部真实变更 |
| 事件去重 | Redis `dedup:sync:{msgId}`（24h）+ `sync_event.msg_id` 唯一约束 | 双层去重，覆盖「重复投递」与「回环回写」 | 仅内存去重：重启即失效 |
| 传输协议 | HTTPS + JSON，OAuth2 client_credentials 换 access_token，`Authorization: Bearer` | PingCode 开放平台标准方式，支持 scope 细分 | 长期 Token 硬编码：轮换困难、审计不合规 |

---

## 2. `ProjectMgmtProvider` 接口定义

```ts
/** 统一信封：所有事件与回调负载均使用该结构（impl-01） */
export interface Envelope<T> {
  msgId: string;      // uuid，幂等去重键
  type: string;       // 事件主题，如 sdlc.task.state_changed
  payload: T;
  traceId: string;    // 全链路追踪
}

export type SyncDirection = 'push' | 'pull';
export type WorkItemKind = 'requirement' | 'task' | 'bug';

export interface ProviderContext {
  tenant: string;         // 如 artisan-group
  projectId: string;      // 外部项目 id，如 PC-ORD
  operatorId: string;     // 触发同步的平台用户 id
  traceId: string;
}

export interface ProjectMgmtProvider {
  readonly providerId: string;            // provider-pingcode
  readonly kind: 'project';

  // ── 连接与元数据 ──────────────────────────────
  healthCheck(ctx: ProviderContext): Promise<{ ok: boolean; latencyMs: number }>;
  getProject(ctx: ProviderContext): Promise<ProjectInfo>;
  getFields(ctx: ProviderContext, kind: WorkItemKind): Promise<FieldDef[]>;
  getWorkflow(ctx: ProviderContext, kind: WorkItemKind): Promise<WorkflowDef>;

  // ── 工作项写入 ────────────────────────────────
  createRequirement(ctx: ProviderContext, item: RequirementPayload): Promise<ExternalRef>;
  createTask(ctx: ProviderContext, item: TaskPayload): Promise<ExternalRef>;
  updateTaskStatus(ctx: ProviderContext, ref: ExternalRef, status: TaskStateId): Promise<void>;
  createBug(ctx: ProviderContext, bug: BugPayload): Promise<ExternalRef>;
  updateBug(ctx: ProviderContext, ref: ExternalRef, patch: BugPatch): Promise<void>;

  // ── 测试 ──────────────────────────────────────
  importTestCases(ctx: ProviderContext, cases: TestCasePayload[]): Promise<ImportResult>;
  importTestReport(ctx: ProviderContext, report: TestReportPayload): Promise<ExternalRef>;

  // ── 查询 ──────────────────────────────────────
  listWorkItems(ctx: ProviderContext, filter: WorkItemFilter): Promise<Page<WorkItem>>;
  getWorkItem(ctx: ProviderContext, ref: ExternalRef): Promise<WorkItem>;

  // ── 订阅外部变更 ──────────────────────────────
  watchWorkItems(ctx: ProviderContext, topics: string[]): Promise<Subscription>;
  unsubscribe(sub: Subscription): Promise<void>;
}
```

### 2.1 方法契约逐项说明

| 方法 | 入参 | 出参 | 幂等性 | 异常 |
|:---|:---|:---|:---|:---|
| `healthCheck` | `ctx` | `{ ok, latencyMs }` | 天然幂等 | 网络异常返回 `ok=false`，不抛 |
| `getProject` | `ctx` | `ProjectInfo{ id, name, workItemTypes[] }` | 幂等（只读） | `ProviderAuthError` / `ProviderNotFoundError` |
| `getFields` | `ctx, kind` | `FieldDef[]`（字段 id/名称/类型/选项） | 幂等（只读，缓存 1h） | `ProviderAuthError` |
| `getWorkflow` | `ctx, kind` | `WorkflowDef{ states[], transitions[] }` | 幂等（只读，缓存 1h） | `ProviderAuthError` |
| `createRequirement` | `ctx, item{ localCode, title, type, acceptance[] }` | `ExternalRef{ externalCode, externalId }` | **幂等**：以 `localCode` 为 `Idempotency-Key`；已存在则返回既有 ref | `ProviderConflictError`（外部已存在同 code） |
| `createTask` | `ctx, item{ localCode, title, requirementRef, assignee, estimateH }` | `ExternalRef` | **幂等**：同上 | `ProviderConflictError` |
| `updateTaskStatus` | `ctx, ref, status` | `void` | **幂等**：目标状态已达成则空操作 | `ProviderStateIllegalError`（外部工作流不允许该迁移） |
| `createBug` | `ctx, bug{ localCode, title, severity, secretLevel, relatedTaskRef }` | `ExternalRef` | **幂等** | `ProviderValidationError`（缺 `secretLevel` 等必填） |
| `updateBug` | `ctx, ref, patch` | `void` | **幂等**（字段级覆盖） | `ProviderValidationError` |
| `importTestCases` | `ctx, cases[]` | `ImportResult{ created, updated, failed[] }` | **幂等**：按用例 `code` upsert | `ProviderValidationError`（字段映射缺失） |
| `importTestReport` | `ctx, report` | `ExternalRef` | **非幂等但可重放**：以 `report.code` 去重 | `ProviderConflictError` |
| `listWorkItems` | `ctx, filter` | `Page<WorkItem>`（含 `nextCursor`） | 幂等（只读） | `ProviderRateLimitError` |
| `getWorkItem` | `ctx, ref` | `WorkItem` | 幂等（只读） | `ProviderNotFoundError` |
| `watchWorkItems` | `ctx, topics[]` | `Subscription{ subId, expiresAt }` | 非幂等：重复订阅需先 `unsubscribe` | `ProviderAuthError` |
| `unsubscribe` | `sub` | `void` | 幂等 | — |

**异常基类约定**（统一映射为平台错误码，见 impl-01）：

| 异常 | 触发条件 | 是否可重试 | 处置 |
|:---|:---|:---:|:---|
| `ProviderAuthError` | 401/403，token 失效或 scope 不足 | 否（先刷新 token 再试 1 次） | 刷新 token → 仍失败则告警运维 |
| `ProviderRateLimitError` | 429 | 是 | 按 `Retry-After` 或指数退避重试 |
| `ProviderConflictError` | 409 | 否 | 查既有 ref 后转更新 |
| `ProviderNotFoundError` | 404 | 否 | 进死信，人工确认外部是否已归档 |
| `ProviderValidationError` | 400 | 否 | 进死信，补齐字段后重放 |
| `ProviderServerError` | 5xx | 是 | 指数退避重试 |

---

## 3. PingCode OpenAPI 落地映射

### 3.1 鉴权

| 项 | 取值 |
|:---|:---|
| 地址 | `https://pingcode.artisan.internal/api/v1`（对应 `pingcodeConfig.apiBase`） |
| 模式 | OAuth2 应用授权（`client_credentials`），对应 `pingcodeConfig.authType` |
| scope | `work_item:rw`、`sprint:rw`、`bug:rw`、`wiki:r` |
| token 端点 | `POST /v1/auth/token`，body `{ grant_type, client_id, client_secret }` |
| token 缓存 | Redis `cache:pc:token`，TTL = `expires_in - 300s`；提前 5 分钟刷新 |
| 存储 | `client_secret` 存 Vault（见 impl-08），库中只留 `tokenMasked` 形如 `pc_****************9f3a` |
| 项目绑定 | `projectId=PC-ORD`（`pingcodeConfig.projectId`） |

### 3.2 用到的端点清单

| # | 方法 | 端点 | 用途 | 对应 Provider 方法 |
|:--:|:---|:---|:---|:---|
| 1 | POST | `/v1/auth/token` | 换取 access_token | — |
| 2 | GET | `/v1/projects/{projectId}` | 校验连通性与项目信息 | `healthCheck` / `getProject` |
| 3 | GET | `/v1/projects/{projectId}/work_item_types` | 工作项类型（需求/任务） | `getFields` |
| 4 | GET | `/v1/projects/{projectId}/workflows` | 工作流状态与迁移规则 | `getWorkflow` |
| 5 | GET | `/v1/projects/{projectId}/fields` | 自定义字段定义 | `getFields` |
| 6 | POST | `/v1/projects/{projectId}/work_items` | 创建需求/任务 | `createRequirement` / `createTask` |
| 7 | PATCH | `/v1/projects/{projectId}/work_items/{id}` | 更新字段（含状态） | `updateTaskStatus` |
| 8 | GET | `/v1/projects/{projectId}/work_items` | 列表（对账用） | `listWorkItems` |
| 9 | GET | `/v1/projects/{projectId}/work_items/{id}` | 详情 | `getWorkItem` |
| 10 | POST | `/v1/projects/{projectId}/bugs` | 创建缺陷 | `createBug` |
| 11 | PATCH | `/v1/projects/{projectId}/bugs/{id}` | 更新缺陷 | `updateBug` |
| 12 | POST | `/v1/projects/{projectId}/testhub/cases/import` | 导入测试用例 | `importTestCases` |
| 13 | POST | `/v1/projects/{projectId}/testhub/plans/{planId}/executions` | 上报执行/报告 | `importTestReport` |
| 14 | POST | `/v1/hooks` | 订阅变更 Webhook | `watchWorkItems` |
| 15 | DELETE | `/v1/hooks/{hookId}` | 取消订阅 | `unsubscribe` |

### 3.3 分页与限流

| 项 | 规则 |
|:---|:---|
| 分页方式 | 游标分页：`?page_size=100&cursor={cursor}`，响应 `{ data, next_cursor }`；`next_cursor` 为空即结束 |
| 单页上限 | 100 条（对账时循环拉取直到 `next_cursor` 为空） |
| 限流阈值 | 600 请求/分钟/租户；突发 20 请求/秒 |
| 限流响应 | HTTP 429 + `Retry-After: {seconds}` + `X-RateLimit-Remaining` |
| 客户端保护 | 令牌桶（`rl:pingcode:{tenant}`，容量 600、速率 10/s），本地先排队，避免打满外部配额 |
| 幂等头 | 写请求携带 `Idempotency-Key: {localCode}`，服务端 24h 内去重 |

---

## 4. 数据模型映射表

| 本平台（表.字段） | PingCode 字段 | 类型转换规则 | 方向 | 备注 |
|:---|:---|:---|:---|:---|
| `requirement.code`（`REQ-2401`） | `work_item.identifier` | 直传字符串 | 双向 | 外部以 `PC-ORD-1024` 形式回填 `external_id_map.external_code` |
| `requirement.title` | `work_item.title` | 直传；超 255 字符截断并写审计 | 双向 | — |
| `requirement.type`（功能需求） | `work_item.type_id` | 枚举 → 类型 id 查表（`功能需求`→`requirement`） | 平台→外部 | 映射表存 `cache:pc:type_map` |
| `requirement.acceptance_criteria`（jsonb 数组） | `work_item.custom_fields.acceptance` | 数组 → `\n` 连接字符串 | 平台→外部 | 回读时按 `\n` 还原数组 |
| `requirement.priority`（P0~P3） | `work_item.priority_id` | `P0→urgent`、`P1→high`、`P2→medium`、`P3→low` | 双向 | — |
| `task.code`（`TASK-2401`） | `work_item.identifier` | 直传 | 双向 | — |
| `task.title` | `work_item.title` | 直传 | 双向 | — |
| `task.state`（10 状态） | `work_item.state_id` | 见第 5 节状态映射表 | 双向（部分单向） | 核心字段 |
| `task.assignee_id`（uuid） | `work_item.assignee_id` | 平台用户 → 外部账号，查 `app_user.external_accounts`；未绑定则留空并告警 | 双向 | 白名单回写字段 |
| `task.priority` | `work_item.priority_id` | 同上 | 双向 | — |
| `task.estimate_expected`（numeric h） | `work_item.estimated_hours` | 直传数值（保留 1 位小数） | 平台→外部 | — |
| `task.sprint_id` | `work_item.sprint_id` | 平台迭代 → 外部 sprint id | 平台→外部 | — |
| `task.branch` | `work_item.custom_fields.dev_branch` | 直传 | 平台→外部 | — |
| `defect.code`（`BUG-1043`） | `bug.identifier` | 直传 | 双向 | — |
| `defect.title` | `bug.title` | 直传 | 双向 | — |
| `defect.severity`（P0~P3） | `bug.priority_id` | 同 priority 映射 | 双向 | — |
| `defect.status` | `bug.state_id` | `new→待确认`、`analyzing→已确认`、`fixing→修复中`、`verifying→待验证`、`closed→已关闭`、`reopened→重开` | 双向 | — |
| `defect.secret_level`（L1/L2/L3） | `bug.custom_fields.secretLevel` | 直传；**必填**，缺失则 `ProviderValidationError` | 平台→外部 | 合规模块强校验（见 `syncQueue.deadLetters.sdl-002`） |
| `defect.related_task_id` | `bug.custom_fields.relatedTask` | 本地 code → 外部 identifier | 平台→外部 | — |
| `test_case`（用例） | `testhub.case` | 字段映射见下表 | 平台→外部 | — |
| `test_plan` + `test_execution` | `testhub.plan.execution` | 汇总上报 | 平台→外部 | — |

**测试用例字段映射（`importTestCases`）：**

| 本平台 | PingCode Testhub | 转换 |
|:---|:---|:---|
| `test_case.code` | `case.identifier` | upsert 键 |
| `test_case.title` | `case.title` | 直传 |
| `test_case.precondition` | `case.precondition` | 直传 |
| `test_case.steps`（jsonb） | `case.steps` | 数组 → `[{ step, expected }]` |
| `test_case.expected` | `case.expected` | 直传 |
| `test_case.priority` | `case.priority_id` | 同 priority 映射 |
| `test_case.module_id` | `case.module_id` | 平台模块 → 外部目录 |

---

## 5. 状态工作流映射表

严格对齐 `data.ts` 的 `stateMappings`（10 条全覆盖）：

| # | 平台 stateId | code | 平台状态名 | PingCode 状态 | 方向 | 同步模式 | 冲突规则 |
|:--:|:---|:--:|:---|:---|:---|:---|:---|
| 1 | `backlog` | T01 | 需求池 | 待评审 | 双向 | 实时 | 回写优先级排序结果；状态冲突时以平台为准 |
| 2 | `refined` | T02 | 已拆解 | 未开始 | 双向 | 实时 | 携带子工作项拆解清单 |
| 3 | `taskCreated` | T03 | 任务已创建 | 未开始 | 单向（平台→PingCode） | 实时 | 外部「未开始」不回写 |
| 4 | `dev` | T04 | 开发中 | 处理中 | 双向 | 实时 | 进度按 MR 提交频次回写 |
| 5 | `testGreen` | T05 | 本地测试通过 | 处理中 | 单向（平台→PingCode） | 实时 | 外部「处理中」不回写 |
| 6 | `committed` | T06 | 已提交 | 处理中 | 双向 | 实时 | 关联 MR 记录 |
| 7 | `deployed` | T07 | 已部署 | 处理中 | 单向（平台→PingCode） | 实时 | 附带环境与制品版本 |
| 8 | `qa` | T08 | 自动化测试中 | 测试中 | 双向 | 实时 | 失败则同步转入 `bugfix` |
| 9 | `bugfix` | T09 | 缺陷修复中 | 处理中 | 双向 | 实时 | 关联缺陷修复单 |
| 10 | `released` | T10 | 已发布 | 已关闭 | 单向（PingCode→平台） | 实时 | 外部关闭即平台终态 |

**多对一反向映射消歧**（PingCode「处理中」对应 T04/T05/T06/T07/T09 五个平台状态）：

当外部状态回写为「处理中」时，平台**不直接改状态**，按以下优先级推断并校验：

| 外部状态 | 平台当前状态 | 处置 |
|:---|:---|:---|
| 处理中 | `dev` / `testGreen` / `committed` / `deployed` / `bugfix` | 视为「无变化」，仅刷新 `sync_event` 时间戳 |
| 处理中 | `taskCreated` | 迁移到 `dev`（外部已开工） |
| 处理中 | `qa` | 拒绝回写（外部状态倒退），记 `audit_log` + 告警，不改平台状态 |
| 测试中 | `deployed` | 迁移到 `qa` |
| 未开始 | `dev` 及之后 | 拒绝回写，进死信人工确认 |
| 已关闭 | 任意非终态 | 迁移到 `released`（若 `nextStates` 允许），否则进死信 |

**状态迁移合法性**：所有回写均需通过 `TASK_STATES[id].nextStates` 校验（见 impl-04 第 2 节表），非法迁移不落库。

---

## 6. 双向同步与订阅回写

### 6.1 Webhook 事件清单

| 外部事件 | 平台主题（内部） | 处理动作 | 是否触发回写 |
|:---|:---|:---|:---|
| `work_item.created` | `sdlc.integration.work_item_created` | 若 `external_code` 无本地映射 → 建「影子需求」待人工认领 | 否 |
| `work_item.updated` | `sdlc.integration.work_item_updated` | 白名单字段（state / assignee / due_date）比对后回写 | 是（白名单） |
| `work_item.state_changed` | `sdlc.integration.state_changed` | 按第 5 节消歧规则回写平台状态 | 是 |
| `work_item.deleted` | `sdlc.integration.work_item_deleted` | 标记 `external_id_map.sync_status='dead_letter'` + 告警 | 否 |
| `bug.created` | `sdlc.integration.bug_created` | 建本地缺陷（`source='external'`） | 否 |
| `bug.state_changed` | `sdlc.integration.bug_state_changed` | 回写 `defect.status` | 是 |
| `sprint.updated` | `sdlc.integration.sprint_updated` | 更新迭代起止时间，重算甘特 | 否 |
| `comment.created` | `sdlc.integration.comment_created` | 落 `notification_log`（仅展示，不改数据） | 否 |

### 6.2 防回环策略（三层）

1. **来源标记**：平台推送写外部时，在 `work_item.custom_fields.sdlc_origin = 'platform'` 打标；收到 Webhook 若 `sdlc_origin='platform'` 且距推送 < 60s，判定为回环，直接丢弃。
2. **msgId 去重**：所有推送与回写事件携带唯一 `msgId`，Redis `dedup:sync:{msgId}`（TTL 24h）+ `sync_event.msg_id` 唯一约束双层去重。
3. **抑制窗口**：本地状态变更后 60s 内，忽略同 `ref_code` 的入向状态回写（`cache:suppress:{ref_code}` 标记），窗口内变更记录为 `suppressed` 供对账参考。

### 6.3 去重与顺序

| 问题 | 方案 |
|:---|:---|
| 重复投递 | `dedup:sync:{msgId}` + `sync_event.msg_id` 唯一约束 |
| 乱序到达 | `sync_event` 按 `ref_code` 分组，只应用 `created_at` 最新事件；旧事件标记 `stale` |
| 并发写同对象 | Redis `lock:sync:{entityType}:{localId}`（SET NX PX 30s） |
| 外部批量变更 | 合并窗口 5s 内同 `ref_code` 事件为一次写 |

---

## 7. 幂等 `external_id_map` 设计

表结构见 impl-04 第 3.16 节，本节给出**写入流程与并发语义**。

```
写入流程（createTask 示例）：
1. 本地事务：INSERT task → 拿到 local_id
2. 查 external_id_map (provider, entity_type='task', local_id)
   ├─ 命中 → 直接返回既有 external_code（幂等，不重复创建）
   └─ 未命中 → 继续
3. 调 PingCode createWorkItem(Idempotency-Key = local_code)
4. 本地事务：INSERT external_id_map
   ├─ 成功 → sync_status='synced'
   └─ 唯一约束冲突（并发） → SELECT 既有记录返回，丢弃本次 external 创建结果
```

| 场景 | 数据库行为 | 结果 |
|:---|:---|:---|
| 同一 `local_id` 并发创建 | `uq_eim_provider_local` 冲突 | 后者回滚，复用前者 `external_code` |
| 外部已存在同 `identifier` | `uq_eim_provider_external` 冲突 | 判定为「外部先建」，转更新 |
| 软删除后重建 | 部分唯一索引 `WHERE deleted_at IS NULL` 放行 | 允许重新绑定 |

---

## 8. 失败重试与死信兜底

### 8.1 指数退避参数表

| 参数 | 取值 | 说明 |
|:---|:---|:---|
| 初始间隔 `initial` | 15 s | 首次失败后等待 |
| 退避倍数 `factor` | 2 | 每次乘 2 |
| 最大间隔 `max` | 1800 s | 封顶 30 分钟 |
| 抖动 `jitter` | ±20% | 防雪崩 |
| 最大次数 `maxAttempts` | 5 | 第 5 次失败即转死信 |
| 触发重试的错误 | 429 / 5xx / 网络超时 | 4xx（400/403/404/409）不重试，直接死信 |

实际退避序列（含抖动前）：`15s → 30s → 60s → 120s → 240s`（与 `syncQueue.retrying` 中「第 3 次，下次 60s 后」一致）。

```yaml
retry:
  initial_seconds: 15
  factor: 2
  max_seconds: 1800
  jitter_ratio: 0.2
  max_attempts: 5
  retryable_status: [429, 500, 502, 503, 504]
  queue: "q:sync:retry"          # Redis ZSet, score = next_retry_at
```

### 8.2 死信人工兜底流程

| 步骤 | 操作 | 责任方 | 输出 |
|:--:|:---|:---|:---|
| 1 | 第 5 次失败 → 写 `sync_event.status='dead_letter'` + `q:sync:dead` | 系统 | 死信条目（对应 `syncQueue.deadLetters`） |
| 2 | 通知集成负责人（IM 卡片，模板 `TPL-SYNC-DEAD`） | 系统 | `notification_log` |
| 3 | 控制台「同步队列」页展示死信（失败原因 + `traceId`） | 集成负责人 | 人工判断 |
| 4 | 修正后点「人工重放」→ `POST /api/v1/integrations/sync-queue/dead-letters/{id}/replay` | 集成负责人 | 重置 `attempts=0` 重新入队 |
| 5 | 重放仍失败且确认为外部数据问题 → 标记「忽略」并写审计 | 集成负责人 | `sync_event.status='ignored'` |

死信典型场景（来自原型数据）：

| 死信编号 | 对象 | 原因 | 处置 |
|:---|:---|:---|:---|
| `sdl-001` | `TASK-2419` | 外部工作项已归档，目标不存在 | 人工确认后重建外部工作项 |
| `sdl-002` | `BUG-1052` | 缺 `secretLevel` 字段校验失败 | 补齐密级后重放 |
| `sdl-003` | `PIPE-2409` | SonarQube 门禁字段缺失 | 补齐 `gateStatus` 后重放 |

---

## 9. 定期对账算法

**调度**：`pingcodeConfig.syncMode = 准实时增量 + 每 6 小时全量对账`；`lastReconcileAt` 记录在 `pingcodeConfig`。

| 项 | 说明 |
|:---|:---|
| 比对范围 | 开发任务 / 需求 / 缺陷 / 迭代 四类（对应 `syncQueue.lastReconcile.items`） |
| 数据来源 | 平台：按 `project_id` 查本地表；外部：`listWorkItems` 游标翻页拉全量 |
| 比对键 | `local_code ↔ external_code`（来自 `external_id_map`） |
| 差异分类 | `missing_remote`（本地有外部无）、`missing_local`（外部有本地无）、`field_mismatch`（关键字段不一致）、`state_conflict`（状态不在映射表内） |
| 修正动作 | `missing_remote`→重推创建；`missing_local`→建影子对象待认领；`field_mismatch`→按冲突规则修正；`state_conflict`→告警人工 |
| 报告 | 写 `sync_event`（`topic='sdlc.integration.reconciled'`）+ 控制台对账卡片 |
| 限流保护 | 对账走低优先级队列，令牌桶限速 5 req/s，避免影响实时同步 |

对账伪代码：

```python
def reconcile(provider, project_id):
    report = []
    for scope, local_table, ext_kind in SCOPES:  # 任务/需求/缺陷/迭代
        local = load_local(project_id, local_table)          # {local_code: row}
        remote = {}                                          # {external_code: item}
        cursor = None
        while True:
            page = provider.listWorkItems(ctx, kind=ext_kind, page_size=100, cursor=cursor)
            remote.update({it.identifier: it for it in page.data})
            cursor = page.next_cursor
            if not cursor: break
        for local_code, row in local.items():
            ext_code = get_mapping(provider, row, local_code)
            if not ext_code or ext_code not in remote:
                report.append(diff("missing_remote", local_code, ext_code)); continue
            if not field_equal(row, remote[ext_code]):
                report.append(diff("field_mismatch", local_code, ext_code))
        for ext_code, item in remote.items():
            if not has_local(ext_code):
                report.append(diff("missing_local", None, ext_code))
    emit_envelope(type="sdlc.integration.reconciled", payload=report)
    return report
```

对账结果示例（对齐 `syncQueue.lastReconcile`）：

| scope | 平台数 | PingCode 数 | 差异 | 结果 |
|:---|--:|--:|--:|:---|
| 开发任务 | 24 | 24 | 0 | 一致 |
| 需求 | 8 | 8 | 0 | 一致 |
| 缺陷 | 12 | 11 | 1 | 存在 1 条未同步（`BUG-1052` 已入死信） |
| 迭代 | 4 | 4 | 0 | 一致 |

**字段回写规则**（对应 `syncQueue.writebacks`）：

| 字段 | 来源 | 目标 | 成功率基线 |
|:---|:---|:---|--:|
| 开发进度 `progress` | 平台编码会话 / MR 提交 | 工作项完成度 | ≥ 99% |
| 状态 `state` | 平台 10 状态机 | 工作项状态 | ≥ 95% |
| 关联代码 `mrId` | GitLab MR | 缺陷关联代码 | ≥ 99% |
| 门禁结果 `gateStatus` | SonarQube 质量门禁 | 工作项校验项 | ≥ 90% |
| 发布版本 `releaseVersion` | 平台发布单 | 迭代发布记录 | ≥ 99% |

---

## 10. 可验收标准

- [ ] `ProjectMgmtProvider` 接口 15 个方法全部有 TypeScript 定义与契约说明表（入参/出参/异常/幂等性），`tsc --noEmit` 通过。
- [ ] 提供 `PingCodeProvider` 与 `MockProvider` 两个实现，业务层仅依赖接口（可用依赖注入替换，替换后集成测试全绿）。
- [ ] 第 5 节状态映射表 10 行与 `data.ts` 的 `stateMappings` 逐字段一致（`stateId`/`stateCode`/`stateName`/`pingcodeName`/`direction`）。
- [ ] 对「PingCode 处理中」回写能正确消歧到 T04/T05/T06/T07/T09，`qa` 状态收到「处理中」时不改平台状态并写 `audit_log`。
- [ ] `external_id_map` 两个部分唯一索引在并发创建同一任务时抛出唯一冲突且不产生重复外部工作项（可用并发测试脚本验证）。
- [ ] 指数退避实测序列为 `15s/30s/60s/120s/240s`，第 5 次失败进入 `q:sync:dead` 并生成 `notification_log`。
- [ ] 对账任务对四类对象各跑一次，输出差异条目数与 `syncQueue.lastReconcile` 结构一致，且 `BUG-1052` 被正确归类为 `missing_remote`。
- [ ] Webhook 回环测试：平台推送后 60s 内收到自身变更回调，被标记 `suppressed` 且不产生二次写入。
- [ ] 全文无 `TBD` / `待补充`；所有端点、字段名、状态名可追溯到 `pingcodeConfig` / `stateMappings` / `idMappings` / `syncQueue`。
