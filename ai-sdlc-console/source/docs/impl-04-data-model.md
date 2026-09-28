# impl-04 数据模型与存储设计

> 版本：v1.0 | 日期：2026-09-24 | 对应设计方案：第 4.2 节「技术选型」、第 5.3 节「同步策略」、第 7 节「关键技术决策」

## 本篇范围

本篇定义 AI 研发协作平台的**持久化层**：PostgreSQL 业务表结构（字段、类型、约束、索引、示例行）、表间外键与级联策略、Redis 键空间设计、大表分区与归档策略、数据库迁移与版本管理规范。覆盖从「项目 / 需求 / 用户故事 / PRD / 评审」到「任务 / 状态流转 / 代码关联 / 构建 / 流水线 / 用例 / 测试计划 / 执行 / 缺陷 / 通知」再到横向的「外部 ID 映射 / 同步事件 / 审计日志 / RAG 条目 / 模型调用日志」，共 20 张核心表。

不包含：接口契约（见 impl-01）、事件总线主题语义（见 impl-03）、PingCode 字段映射细则（见 impl-05）、脱敏字段清单与审计留存策略（见 impl-08）。

## 关联文档

| 文档 | 关系 |
|:---|:---|
| impl-00 总体架构与部署形态 | 本层部署在 PostgreSQL 16 + Redis 7，私有化 VPC 内 |
| impl-01 通信协议与接口契约 | 统一信封 `{ msgId, type, payload, traceId }`，`traceId` 落库到 `task_state_history` / `model_call_log` / `audit_log` |
| impl-03 任务状态机与事件总线 | 10 状态机落库为 `task.state`，迁移写 `task_state_history`，事件写 `sync_event` |
| impl-05 PingCode 适配器与双向同步 | `external_id_map` / `sync_event` 的写入方与唯一索引约束 |
| impl-07 Web 控制台实施 | 13 个原型页面的数据来源表 |
| impl-08 安全、脱敏与合规 | `audit_log` 字段定义与留存策略、脱敏字段标记 |

---

## 1. 存储选型与技术决策

| 决策点 | 选定方案 | 理由 | 被否方案 |
|:---|:---|:---|:---|
| 主库 | PostgreSQL 16（单实例 + 流复制备库） | 需要 JSONB（Agent 产出、映射配置）、部分唯一索引（`external_id_map`）、原生分区（审计/模型日志），MySQL 8 的 JSON 索引与分区体验更弱 | MySQL 8：JSONB 更新与 GIN 索引能力弱；MongoDB：事务与强一致关联查询不足 |
| 缓存/队列 | Redis 7（Cluster 3 主 3 从） | Streams 做事件投递 + List/ZSet 做同步重试队列 + String 做限流与缓存 | RabbitMQ：多引入一个中间件，MVP 阶段运维成本高；Kafka：小规模过重 |
| 向量检索 | pgvector 0.7（`rag_entry.embedding`） | 复用主库，避免引入独立向量库；条目量级（< 10 万切片）无需专用库 | Milvus：MVP 阶段过度设计，运维成本 > 收益 |
| ORM / 迁移 | 后端 NestJS + TypeORM；迁移用 `node-pg-migrate`（纯 SQL 优先） | 迁移文件是可评审的 SQL，不依赖 ORM 元数据推断，回滚明确 | Prisma Migrate：回滚需手写、对原生分区支持弱 |
| 主键 | `uuid`（`gen_random_uuid()`） | 双端创建不冲突、可离线生成、外部 ID 映射天然隔离 | 自增 bigint：跨端同步与分库时易冲突 |
| 时间 | 全部 `timestamptz`，统一 UTC 存储 | 避免夏令时/跨地域歧义 | `timestamp`（无时区）：跨时区展示易错 |

---

## 2. 通用约定

**所有表统一包含以下列，后续表设计不再重复列出：**

| 列名 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | 主键 |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | 创建时间 |
| `updated_at` | `timestamptz` | NOT NULL, `default now()`，由触发器 `set_updated_at()` 维护 | 更新时间 |
| `deleted_at` | `timestamptz` | NULL | 软删除标记，非空即视为已删除 |
| `version` | `integer` | NOT NULL, `default 0` | 乐观锁版本号，更新时 `where version = :v` |

**命名与枚举约定：**

- 表名、列名一律 `snake_case`；枚举值用 `snake_case` 字符串，落库为 `varchar(32)` + `CHECK` 约束（不建 PG ENUM 类型，便于加值不停机）。
- 任务状态枚举值严格取自 `data.ts` 的 `TASK_STATES`，逐字一致：

| # | 状态 id | code | 中文名 | 允许的下一状态 |
|:--:|:---|:--:|:---|:---|
| 1 | `backlog` | T01 | 需求池 | `refined` |
| 2 | `refined` | T02 | 已拆解 | `taskCreated` |
| 3 | `taskCreated` | T03 | 任务已创建 | `dev` |
| 4 | `dev` | T04 | 开发中 | `testGreen`, `taskCreated` |
| 5 | `testGreen` | T05 | 本地测试通过 | `committed`, `dev` |
| 6 | `committed` | T06 | 已提交 | `deployed`, `testGreen` |
| 7 | `deployed` | T07 | 已部署 | `qa` |
| 8 | `qa` | T08 | 自动化测试中 | `released`, `bugfix` |
| 9 | `bugfix` | T09 | 缺陷修复中 | `testGreen`, `committed` |
| 10 | `released` | T10 | 已发布 | （终态） |

- 模型枚举值取自 `data.ts` 的 `models`：`mdl-claude`(Claude 3.7 Sonnet)、`mdl-deepseek`(DeepSeek-V3)、`mdl-qwen`(Qwen2.5-Max)、`mdl-gpt5`(GPT-5)、`mdl-local`(私有化 Llama3-70B)。
- Agent 枚举值取自 `data.ts` 的 `agents`：`ag-pm`(需求澄清 Agent)、`ag-arch`(架构设计 Agent)、`ag-code`(编码实现 Agent)、`ag-review`(代码评审 Agent)、`ag-test`(测试生成 Agent)、`ag-ops`(部署运维 Agent)、`ag-ba`(可观测分析 Agent)。

> **差异说明**：设计方案第 3.2 节的 Agent 命名（产品 / 架构 / 编码 / 测试 / PMO / 部署 / QA）与 `data.ts` 的 `agents` 不完全一致。本文档以 `data.ts` 的 7 个 Agent 为准（其 id 与原型页面、`agentTraces` 对齐），并在 impl-02 中给出两套命名的对照表，避免业务层引用歧义。

---

## 3. 表设计

### 3.1 project（项目）

**用途**：一个交付项目（本例为「订单中心重构 EPIC-ORDER-REF」），是需求、任务、缺陷、迭代的顶层归属。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `code` | `varchar(32)` | NOT NULL, UNIQUE | 项目编号，如 `PC-ORD` |
| `name` | `varchar(128)` | NOT NULL | 项目名 |
| `tenant` | `varchar(64)` | NOT NULL | 租户，如 `artisan-group` |
| `owner_id` | `uuid` | NOT NULL, FK→`app_user.id` | 项目负责人 |
| `default_egress_policy` | `varchar(16)` | NOT NULL, `default 'MASK'`, CHECK IN ('ALLOW','MASK','DENY') | 默认出域策略 |
| `status` | `varchar(16)` | NOT NULL, `default 'active'` | `active` / `archived` |

索引：`unique(code)`；`idx_project_tenant(tenant, status)`。
示例行：
```json
{ "id": "5f1c…", "code": "PC-ORD", "name": "订单中心重构 EPIC-ORDER-REF", "tenant": "artisan-group", "owner_id": "u-lin", "default_egress_policy": "MASK", "status": "active" }
```

### 3.2 requirement（需求）

**用途**：承载 PRD 拆出的需求（对应 PingCode 需求/Story 工作项），本例 `REQ-2401`~`REQ-2408`。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `project_id` | `uuid` | NOT NULL, FK→`project.id` ON DELETE CASCADE | 所属项目 |
| `code` | `varchar(32)` | NOT NULL, UNIQUE | 需求编号，如 `REQ-2401` |
| `title` | `varchar(256)` | NOT NULL | 需求标题 |
| `type` | `varchar(24)` | NOT NULL | `功能需求` / `非功能需求` / `技术债` / `合规需求` |
| `priority` | `varchar(8)` | NOT NULL, `default 'P2'` | P0~P3 |
| `status` | `varchar(16)` | NOT NULL, `default 'backlog'` | 复用 10 状态枚举 |
| `prd_version_id` | `uuid` | NULL, FK→`prd_version.id` | 关联的 PRD 版本基线 |
| `owner_id` | `uuid` | NULL, FK→`app_user.id` | 需求负责人 |
| `acceptance_criteria` | `jsonb` | NOT NULL, `default '[]'` | 验收标准数组（可测） |

索引：`unique(code)`；`idx_requirement_project(project_id, status)`；`idx_requirement_prd(prd_version_id)`。
示例行：
```json
{ "code": "REQ-2401", "title": "订单创建链路重构：幂等下单与本地消息表保障一致性", "type": "功能需求", "priority": "P0", "status": "refined" }
```

### 3.3 user_story（用户故事）

**用途**：需求的原子拆分单元，含 GWT 结构（As a / I want / So that）与验收标准，本例 `US-01`~`US-14`。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `requirement_id` | `uuid` | NOT NULL, FK→`requirement.id` ON DELETE CASCADE | 所属需求 |
| `code` | `varchar(16)` | NOT NULL, UNIQUE | 故事编号，如 `US-01` |
| `as_a` | `varchar(128)` | NOT NULL | 角色 |
| `i_want` | `text` | NOT NULL | 期望能力 |
| `so_that` | `text` | NOT NULL | 业务价值 |
| `gwt` | `jsonb` | NOT NULL | `{ given, when, then }` 验收条件 |
| `story_points` | `integer` | NULL | 故事点估算 |

索引：`unique(code)`；`idx_user_story_req(requirement_id)`。

### 3.4 prd_version（PRD 版本）

**用途**：PRD 的版本快照，支撑「草稿/评审中/已确认/已归档」与版本差异摘要。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `project_id` | `uuid` | NOT NULL, FK→`project.id` ON DELETE CASCADE | 所属项目 |
| `version_no` | `varchar(16)` | NOT NULL | 版本号，如 `v2.3` |
| `title` | `varchar(256)` | NOT NULL | 版本标题 |
| `status` | `varchar(16)` | NOT NULL, `default 'draft'` | `draft` / `reviewing` / `confirmed` / `archived` |
| `author_id` | `uuid` | NOT NULL, FK→`app_user.id` | 作者 |
| `content_md` | `text` | NOT NULL | PRD 正文（Markdown） |
| `diff_summary` | `text` | NULL | 与上一版本差异摘要 |
| `frozen_at` | `timestamptz` | NULL | 基线冻结时间（G1 门禁依据） |

索引：`unique(project_id, version_no)`；`idx_prd_version_status(project_id, status)`。

### 3.5 prd_review（评审意见）

**用途**：PRD / 架构评审的意见条目，可定位到具体用户故事。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `prd_version_id` | `uuid` | NOT NULL, FK→`prd_version.id` ON DELETE CASCADE | 被评审版本 |
| `reviewer_id` | `uuid` | NOT NULL, FK→`app_user.id` | 评审人 |
| `anchor_story_id` | `uuid` | NULL, FK→`user_story.id` | 定位到的用户故事 |
| `comment` | `text` | NOT NULL | 意见正文 |
| `status` | `varchar(16)` | NOT NULL, `default 'pending'` | `pending` / `adopted` / `rejected` |
| `resolved_at` | `timestamptz` | NULL | 处理时间 |

索引：`idx_prd_review_version(prd_version_id, status)`。

### 3.6 task（任务）

**用途**：研发任务，10 状态机载体，与 PingCode 任务双向绑定。本例 `TASK-2401`~`TASK-2424`。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `project_id` | `uuid` | NOT NULL, FK→`project.id` ON DELETE CASCADE | 所属项目 |
| `requirement_id` | `uuid` | NULL, FK→`requirement.id` ON DELETE SET NULL | 需求追溯 |
| `parent_task_id` | `uuid` | NULL, FK→`task.id` ON DELETE SET NULL | 父子任务树 |
| `code` | `varchar(24)` | NOT NULL, UNIQUE | 任务编号，如 `TASK-2401` |
| `title` | `varchar(256)` | NOT NULL | 标题 |
| `state` | `varchar(24)` | NOT NULL, `default 'backlog'` | 10 状态枚举 |
| `driver` | `varchar(16)` | NOT NULL, `default 'human'` | `ai` / `human` / `ai+human` |
| `assignee_id` | `uuid` | NULL, FK→`app_user.id` | 负责人 |
| `priority` | `varchar(8)` | NOT NULL, `default 'P2'` | P0~P3 |
| `estimate_optimistic` | `numeric(6,1)` | NULL | 乐观工时（h） |
| `estimate_expected` | `numeric(6,1)` | NULL | 期望工时（h） |
| `estimate_pessimistic` | `numeric(6,1)` | NULL | 悲观工时（h） |
| `sprint_id` | `uuid` | NULL, FK→`sprint.id` | 所属迭代 |
| `component_ids` | `uuid[]` | NOT NULL, `default '{}'` | 关联组件（G2 门禁依据） |
| `branch` | `varchar(128)` | NULL | 关联分支 |
| `state_entered_at` | `timestamptz` | NOT NULL, `default now()` | 进入当前状态时间（SLA 计算基准） |

索引：`unique(code)`；`idx_task_state(state)`；`idx_task_assignee(assignee_id, state)`；`idx_task_sprint(sprint_id)`；`idx_task_parent(parent_task_id)`。
示例行：
```json
{ "code": "TASK-2401", "title": "幂等下单接口改造：Idempotency-Key 两级校验", "state": "dev", "driver": "ai+human", "assignee_id": "u-shen", "estimate_expected": 16.0, "branch": "feature/order-idem" }
```

### 3.7 task_state_history（状态流转历史）

**用途**：记录每次状态迁移（审计、SLA、看板时间线、PingCode 回写溯源）。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `task_id` | `uuid` | NOT NULL, FK→`task.id` ON DELETE CASCADE | 任务 |
| `from_state` | `varchar(24)` | NULL | 迁移前状态（首条为 NULL） |
| `to_state` | `varchar(24)` | NOT NULL | 迁移后状态 |
| `trigger_type` | `varchar(16)` | NOT NULL | `human` / `ai` / `external_sync` / `system` |
| `trigger_by` | `uuid` | NULL, FK→`app_user.id` | 触发者（AI 触发时为系统账号） |
| `trace_id` | `varchar(64)` | NOT NULL | 全链路追踪 id |
| `reason` | `text` | NULL | 迁移原因 / 备注 |

索引：`idx_tsh_task_time(task_id, created_at DESC)`；`idx_tsh_trace(trace_id)`。
示例行：
```json
{ "task_id": "…", "from_state": "testGreen", "to_state": "committed", "trigger_type": "ai+human", "trigger_by": "u-shen", "trace_id": "SYNC-0231", "reason": "MR-2410 合入主干" }
```

### 3.8 code_link（代码关联）

**用途**：任务 ↔ 代码（MR / 分支 / 提交）关联，回写开发进度与代码规模。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `task_id` | `uuid` | NOT NULL, FK→`task.id` ON DELETE CASCADE | 任务 |
| `repo` | `varchar(128)` | NOT NULL | 仓库，如 `trade/order-api` |
| `mr_id` | `varchar(64)` | NULL | MR 编号，如 `MR-2410` |
| `commit_sha` | `varchar(40)` | NULL | 提交 sha |
| `diff_summary` | `jsonb` | NOT NULL, `default '{}'` | `{ files, additions, deletions }` |
| `link_type` | `varchar(16)` | NOT NULL, `default 'primary'` | `primary` / `related` |

索引：`unique(task_id, repo, commit_sha)`（`commit_sha` 为空时以 `mr_id` 去重）；`idx_code_link_mr(mr_id)`。

### 3.9 build（构建）

**用途**：一次 CI 构建记录，关联任务、流水线、制品版本。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `project_id` | `uuid` | NOT NULL, FK→`project.id` | 项目 |
| `pipeline_run_id` | `uuid` | NULL, FK→`pipeline_run.id` | 所属流水线运行 |
| `code` | `varchar(24)` | NOT NULL, UNIQUE | 构建号，如 `PIPE-2409` |
| `task_ids` | `uuid[]` | NOT NULL, `default '{}'` | 关联任务 |
| `git_sha` | `varchar(40)` | NOT NULL | 构建源提交 |
| `artifact` | `varchar(160)` | NULL | 制品，如 `order-api:2418-2fa97b6` |
| `status` | `varchar(16)` | NOT NULL | `success` / `failed` / `running` |
| `duration_ms` | `integer` | NULL | 耗时 |

索引：`unique(code)`；`idx_build_pipeline(pipeline_run_id)`。

### 3.10 pipeline_stage（流水线阶段）

**用途**：流水线单阶段。阶段模板固定 6 段（`stg-1` 代码检出 → `stg-2` 静态扫描 → `stg-3` 单元测试 → `stg-4` 镜像构建 → `stg-5` 环境部署 → `stg-6` 门禁汇总），其中 `stg-2`/`stg-3` 挂 `G3`，`stg-5`/`stg-6` 挂 `G5`（观测类流水线为 `G6`）。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `build_id` | `uuid` | NOT NULL, FK→`build.id` ON DELETE CASCADE | 所属构建 |
| `seq` | `smallint` | NOT NULL | 阶段顺序 |
| `name` | `varchar(64)` | NOT NULL | 阶段名 |
| `gate_id` | `varchar(8)` | NULL | 关联门禁 `G1`~`G6` |
| `status` | `varchar(16)` | NOT NULL | `success` / `failed` / `running` / `skipped` |
| `duration_ms` | `integer` | NULL | 耗时 |
| `log_uri` | `text` | NULL | 日志地址 |
| `error_summary` | `text` | NULL | 失败摘要 |

索引：`unique(build_id, seq)`；`idx_pipeline_stage_status(status)`。

### 3.11 test_case（测试用例）

**用途**：用例库条目，来源 `ai` / `human` / `import`，支持 XMind / Excel 导入导出。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `project_id` | `uuid` | NOT NULL, FK→`project.id` | 项目 |
| `module_id` | `uuid` | NULL, FK→`test_module.id` | 用例模块（脑图层级） |
| `code` | `varchar(24)` | NOT NULL, UNIQUE | 用例编号，如 `TC-018` |
| `title` | `varchar(256)` | NOT NULL | 标题 |
| `precondition` | `text` | NULL | 前置条件 |
| `steps` | `jsonb` | NOT NULL | 步骤数组 |
| `expected` | `text` | NOT NULL | 预期结果 |
| `priority` | `varchar(8)` | NOT NULL, `default 'P2'` | P0~P3 |
| `type` | `varchar(24)` | NULL | 功能 / 接口 / 性能 / 安全 |
| `source` | `varchar(16)` | NOT NULL, `default 'human'` | `ai` / `human` / `import` |
| `requirement_id` | `uuid` | NULL, FK→`requirement.id` | 关联需求 |

索引：`unique(code)`；`idx_test_case_module(module_id)`；`idx_test_case_source(source)`。

### 3.12 test_plan（测试计划）

**用途**：测试计划（执行轮次），本例 `TP-01`~`TP-04`。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `project_id` | `uuid` | NOT NULL, FK→`project.id` | 项目 |
| `code` | `varchar(16)` | NOT NULL, UNIQUE | 计划编号，如 `TP-01` |
| `name` | `varchar(128)` | NOT NULL | 计划名 |
| `module_ids` | `uuid[]` | NOT NULL, `default '{}'` | 覆盖模块 |
| `sprint_id` | `uuid` | NULL, FK→`sprint.id` | 迭代，如 `SP-24` |
| `owner_id` | `uuid` | NOT NULL, FK→`app_user.id` | 负责人 |
| `env_id` | `varchar(24)` | NOT NULL | 执行环境，如 `env-test` |
| `round` | `smallint` | NOT NULL, `default 1` | 轮次 |
| `status` | `varchar(16)` | NOT NULL, `default 'running'` | `running` / `paused` / `blocked` / `done` |
| `ai_generated` | `integer` | NOT NULL, `default 0` | AI 生成用例数 |

索引：`unique(code)`；`idx_test_plan_sprint(sprint_id, status)`。

### 3.13 test_execution（执行记录）

**用途**：某计划某轮次的执行结果（用例级 + 汇总级）。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `test_plan_id` | `uuid` | NOT NULL, FK→`test_plan.id` ON DELETE CASCADE | 所属计划 |
| `test_case_id` | `uuid` | NULL, FK→`test_case.id` | 用例（汇总行为 NULL） |
| `build_id` | `uuid` | NULL, FK→`build.id` | 关联构建 |
| `trigger_type` | `varchar(16)` | NOT NULL | `pipeline` / `manual` |
| `env_id` | `varchar(24)` | NOT NULL | 环境 |
| `result` | `varchar(16)` | NOT NULL | `passed` / `failed` / `blocked` / `skipped` |
| `duration_ms` | `integer` | NULL | 耗时 |
| `failure_stack` | `text` | NULL | 失败堆栈摘要 |
| `ai_attribution` | `jsonb` | NULL | QA/测试 Agent 归因分析 |

索引：`idx_test_exec_plan(test_plan_id, result)`；`idx_test_exec_case(test_case_id)`。

### 3.14 defect（缺陷）

**用途**：缺陷单，来源自动化/人工，含 QA Agent 归因与指派建议。本例 `BUG-1043` 等。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `project_id` | `uuid` | NOT NULL, FK→`project.id` | 项目 |
| `code` | `varchar(16)` | NOT NULL, UNIQUE | 缺陷编号，如 `BUG-1043` |
| `title` | `varchar(256)` | NOT NULL | 标题 |
| `severity` | `varchar(8)` | NOT NULL | P0~P3（与 `BUG_SLA_POLICIES.priority` 对齐） |
| `status` | `varchar(16)` | NOT NULL, `default 'new'` | `new` / `analyzing` / `fixing` / `verifying` / `closed` / `reopened` |
| `source` | `varchar(16)` | NOT NULL | `auto_test` / `manual` |
| `found_version` | `varchar(64)` | NULL | 发现版本 |
| `assignee_id` | `uuid` | NULL, FK→`app_user.id` | 指派给 |
| `related_task_id` | `uuid` | NULL, FK→`task.id` | 关联任务 |
| `secret_level` | `varchar(8)` | NULL, CHECK IN ('L1','L2','L3') | 密级（合规模块校验必填） |
| `sla_deadline` | `timestamptz` | NULL | SLA 截止（由 `BUG_SLA_POLICIES` 计算） |
| `ai_analysis` | `jsonb` | NULL | QA Agent 结论（归因、疑似代码位置、建议指派人） |

索引：`unique(code)`；`idx_defect_severity(severity, status)`；`idx_defect_assignee(assignee_id, status)`；`idx_defect_sla(sla_deadline)`。

### 3.15 notification_log（通知记录）

**用途**：所有外发通知（IM 卡片 / 群 / 邮件 / 短信 / 电话 / Webhook）的留痕。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `channel` | `varchar(16)` | NOT NULL | `lark-card` / `lark-group` / `webhook` / `sms` / `phone` / `email` |
| `template` | `varchar(64)` | NOT NULL | 模板 id |
| `target_type` | `varchar(24)` | NOT NULL | `task` / `requirement` / `bug` / `gate` / `release` / `pipeline` |
| `target_id` | `varchar(24)` | NOT NULL | 目标编号 |
| `receiver_ids` | `uuid[]` | NOT NULL | 接收人 |
| `status` | `varchar(16)` | NOT NULL | `sent` / `failed` / `pending` |
| `trace_id` | `varchar(64)` | NOT NULL | 追踪 id |
| `payload` | `jsonb` | NOT NULL, `default '{}'` | 渲染后的消息体 |

索引：`idx_notify_target(target_type, target_id)`；`idx_notify_status(status, created_at DESC)`。

### 3.16 external_id_map（外部 ID 映射）

**用途**：本平台对象 ↔ 外部（PingCode 等）工作项的幂等映射表，防重复创建。详见 impl-05。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `provider_id` | `varchar(32)` | NOT NULL | 服务商，如 `provider-pingcode` |
| `entity_type` | `varchar(16)` | NOT NULL, CHECK IN ('task','requirement','bug') | 实体类型 |
| `local_id` | `uuid` | NOT NULL | 本地对象 id |
| `local_code` | `varchar(24)` | NOT NULL | 本地编号，如 `TASK-2401` |
| `external_code` | `varchar(64)` | NOT NULL | 外部编号，如 `PC-ORD-2401` |
| `external_project` | `varchar(32)` | NULL | 外部项目，如 `PC-ORD` |
| `sync_status` | `varchar(16)` | NOT NULL, `default 'synced'` | `synced` / `pending` / `retry` / `dead_letter` |
| `direction` | `varchar(16)` | NOT NULL, `default 'bidirectional'` | 同步方向 |
| `synced_at` | `timestamptz` | NULL | 最后同步时间 |

索引（关键）：
```sql
CREATE UNIQUE INDEX uq_eim_provider_external
  ON external_id_map (provider_id, entity_type, external_code)
  WHERE deleted_at IS NULL;                       -- 防同一外部工作项被两条本地记录绑定
CREATE UNIQUE INDEX uq_eim_provider_local
  ON external_id_map (provider_id, entity_type, local_id)
  WHERE deleted_at IS NULL;                       -- 防同一本地对象被创建两次外部工作项
CREATE INDEX idx_eim_local_code ON external_id_map (local_code);
```
示例行：
```json
{ "provider_id": "provider-pingcode", "entity_type": "task", "local_id": "…", "local_code": "TASK-2401", "external_code": "PC-ORD-2401", "external_project": "PC-ORD", "sync_status": "synced", "direction": "bidirectional" }
```

### 3.17 sync_event（同步事件）

**用途**：事件驱动同步的持久化日志，支撑重试、死信、对账、订阅回写溯源。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `provider_id` | `varchar(32)` | NOT NULL | 服务商 |
| `topic` | `varchar(96)` | NOT NULL | 事件主题，如 `sdlc.task.state_changed` |
| `direction` | `varchar(8)` | NOT NULL, CHECK IN ('push','pull') | 方向 |
| `entity_type` | `varchar(16)` | NOT NULL | `task` / `requirement` / `bug` / `pipeline` |
| `ref_code` | `varchar(24)` | NOT NULL | 业务编号，如 `TASK-2401` |
| `msg_id` | `uuid` | NOT NULL, UNIQUE | 幂等去重键（来自消息信封 `msgId`） |
| `trace_id` | `varchar(64)` | NOT NULL | 追踪 id |
| `status` | `varchar(16)` | NOT NULL, `default 'pending'` | `pending` / `running` / `succeeded` / `failed` / `dead_letter` |
| `attempts` | `smallint` | NOT NULL, `default 0` | 已尝试次数 |
| `next_retry_at` | `timestamptz` | NULL | 下次重试时间（指数退避计算） |
| `latency_ms` | `integer` | NULL | 耗时 |
| `error_message` | `text` | NULL | 失败原因 |
| `payload` | `jsonb` | NOT NULL | 事件负载 |

索引：`unique(msg_id)`；`idx_sync_event_pending(status, next_retry_at) WHERE status IN ('pending','failed')`；`idx_sync_event_ref(ref_code)`；`idx_sync_event_trace(trace_id)`。

### 3.18 audit_log（审计日志）

**用途**：全量安全留痕（上传上下文 / AI 调用 / 状态迁移 / 外部同步 / 配置变更 / 身份认证）。字段与留存策略详见 impl-08。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `time` | `timestamptz` | NOT NULL, `default now()` | 事件时间（分区键） |
| `actor_id` | `uuid` | NULL, FK→`app_user.id` | 操作者（系统账号可空） |
| `actor_name` | `varchar(64)` | NOT NULL | 操作者名（冗余，便于快照） |
| `role_name` | `varchar(32)` | NOT NULL | 当时角色 |
| `action` | `varchar(128)` | NOT NULL | 动作描述 |
| `category` | `varchar(24)` | NOT NULL | `上传上下文` / `AI 调用` / `状态迁移` / `外部同步` / `配置变更` / `身份认证` / `质量门禁` / `发布审批` / `代码变更` / `缺陷管理` |
| `target_type` | `varchar(24)` | NOT NULL | 对象类型 |
| `target_id` | `varchar(24)` | NOT NULL | 对象编号 |
| `ip` | `inet` | NOT NULL | 来源 IP（内网段 `10.24.x.x`） |
| `result` | `varchar(16)` | NOT NULL | `success` / `denied` / `failed` |
| `trace_id` | `varchar(64)` | NOT NULL | 追踪 id |
| `detail` | `text` | NULL | 明细 |

索引：`idx_audit_time(time DESC)`（分区本地索引）；`idx_audit_actor(actor_id, time DESC)`；`idx_audit_trace(trace_id)`；`idx_audit_category(category, time DESC)`。

### 3.19 rag_entry（RAG 条目）

**用途**：RAG 知识库条目（编码规范 / 架构文档 / 代码样例 / 最佳实践 / 需求模板）。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `kb_id` | `varchar(32)` | NOT NULL | 知识库 id，如 `KB-ARCH-01` |
| `title` | `varchar(256)` | NOT NULL | 标题 |
| `category` | `varchar(32)` | NOT NULL | 分类 |
| `source` | `varchar(160)` | NOT NULL | 来源 |
| `chunks` | `integer` | NOT NULL, `default 0` | 切片数 |
| `tokens_k` | `integer` | NOT NULL, `default 0` | Token 数（千） |
| `embed_model` | `varchar(48)` | NOT NULL, `default 'bge-large-zh-v1.5'` | 向量模型 |
| `embedding` | `vector(1024)` | NULL | 向量（pgvector） |
| `status` | `varchar(16)` | NOT NULL, `default 'ready'` | `ready` / `indexing` / `stale` |
| `hit_count` | `integer` | NOT NULL, `default 0` | 被引用次数 |
| `tags` | `text[]` | NOT NULL, `default '{}'` | 标签 |

索引：`idx_rag_kb(kb_id, status)`；`idx_rag_embedding USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`。

### 3.20 model_call_log（模型调用日志）

**用途**：每次模型网关调用的成本、时延、路由、脱敏与 trace 记录。

| 字段 | 类型 | 约束 / 默认 | 说明 |
|:---|:---|:---|:---|
| `time` | `timestamptz` | NOT NULL, `default now()` | 调用时间（分区键） |
| `trace_id` | `varchar(64)` | NOT NULL | 追踪 id（串联 Agent → 模型 → 工具） |
| `agent_id` | `varchar(24)` | NOT NULL | 7 个 Agent 之一 |
| `model_id` | `varchar(24)` | NOT NULL | 5 个模型之一 |
| `scene` | `varchar(48)` | NOT NULL | 场景（如 `code_generate`） |
| `routing_rule_id` | `varchar(24)` | NULL | 命中的路由规则 |
| `fallback_from` | `varchar(24)` | NULL | 触发 fallback 的原模型 |
| `prompt_tokens` | `integer` | NOT NULL, `default 0` | 输入 token |
| `completion_tokens` | `integer` | NOT NULL, `default 0` | 输出 token |
| `cost` | `numeric(12,6)` | NOT NULL, `default 0` | 成本（按 `costPer1kTokens` 计算） |
| `latency_ms` | `integer` | NOT NULL | 时延 |
| `status` | `varchar(16)` | NOT NULL | `success` / `failed` / `rate_limited` |
| `redacted` | `boolean` | NOT NULL, `default true` | 是否经脱敏 |
| `egress_policy` | `varchar(16)` | NOT NULL | 出域策略 `ALLOW`/`MASK`/`DENY` |

索引：`idx_mcl_time(time DESC)`；`idx_mcl_model(model_id, time DESC)`；`idx_mcl_agent(agent_id, time DESC)`；`idx_mcl_trace(trace_id)`。

---

## 4. 表间关系与级联策略

```
project 1─┬─* requirement 1─* user_story
          ├─* prd_version 1─* prd_review
          ├─* task 1─┬─* task_state_history
          │          ├─* code_link
          │          └─* build ─* pipeline_stage
          ├─* test_case ─* test_execution
          ├─* test_plan 1─* test_execution
          └─* defect
```

| 父表 | 子表 | 外键 | 级联策略 | 理由 |
|:---|:---|:---|:---|:---|
| `project` | `requirement` / `task` / `prd_version` / `test_case` / `test_plan` / `defect` | `project_id` | `ON DELETE CASCADE` | 项目删除即整体回收 |
| `requirement` | `user_story` | `requirement_id` | `ON DELETE CASCADE` | 故事依附需求存在 |
| `requirement` | `task` / `test_case` | `requirement_id` | `ON DELETE SET NULL` | 任务/用例可独立存续，仅断追溯 |
| `task` | `task_state_history` / `code_link` | `task_id` | `ON DELETE CASCADE` | 历史依附任务 |
| `task` | `task`(自引用) | `parent_task_id` | `ON DELETE SET NULL` | 删父任务不连带删子任务 |
| `build` | `pipeline_stage` | `build_id` | `ON DELETE CASCADE` | 阶段依附构建 |
| `test_plan` | `test_execution` | `test_plan_id` | `ON DELETE CASCADE` | 执行依附计划 |
| `app_user` | 各业务表 `assignee_id` 等 | `…_id` | `ON DELETE SET NULL` | 人员离职不破坏业务数据 |
| 业务表 | `external_id_map` | 逻辑关联（`local_id`） | 应用层清理 | 映射表跨实体，避免多态外键 |

**跨表一致性约束**：`task.state` 与 `task_state_history` 最新一条 `to_state` 必须相等，由应用层在同一事务内写入保证；`external_id_map.local_id` 与业务表 `id` 的引用完整性由应用层 + 每日对账任务校验（见 impl-05 第 7 节）。

---

## 5. Redis 键设计

| 键模式 | 数据结构 | TTL | 淘汰策略 | 用途 |
|:---|:---|:---|:---|:---|
| `sess:{userId}:{jti}` | String（JWT 摘要 + 角色） | 480 min（与 `ssoStatus.sessionTimeoutMin` 一致） | noeviction | 会话，支持强制登出 |
| `sess:idx:{userId}` | Set | 480 min | noeviction | 用户全部活跃会话，供「踢下线」 |
| `rl:{scope}:{key}` | String（计数） | 60 s | volatile-lru | 限流（`scope`=`api`/`model`/`pingcode`） |
| `cache:task:{taskId}` | Hash | 300 s | allkeys-lru | 任务卡片缓存 |
| `cache:board:{projectId}:{state}` | List | 120 s | allkeys-lru | 看板列缓存 |
| `cache:overview:{projectId}` | String(JSON) | 60 s | allkeys-lru | 驾驶舱指标卡 |
| `cache:state:map` | Hash | 3600 s | allkeys-lru | 10 状态 ↔ PingCode 状态映射（来自 `stateMappings`） |
| `stream:sdlc.events` | Stream | 无（`MAXLEN ~ 1e6`） | noeviction | 事件总线主通道 |
| `stream:grp:notify` / `stream:grp:sync` / `stream:grp:console` | Consumer Group | 无 | noeviction | 三类消费者组 |
| `q:sync:retry` | ZSet（score=下次重试时间戳） | 无 | noeviction | 同步指数退避重试队列 |
| `q:sync:dead` | List | 无 | noeviction | 死信队列（人工兜底） |
| `lock:sync:{entityType}:{localId}` | String（SET NX PX） | 30 s | noeviction | 同步幂等锁 |
| `lock:task:{taskId}:state` | String（SET NX PX） | 10 s | noeviction | 状态迁移并发锁 |
| `dedup:sync:{msgId}` | String | 24 h | volatile-lru | 事件去重（防回环/重复消费） |
| `dedup:webhook:{providerId}:{eventId}` | String | 72 h | volatile-lru | Webhook 去重 |
| `counter:model:{modelId}:{yyyymmdd}` | String（INCR） | 8 d | volatile-lru | 当日模型调用量/成本 |
| `presence:user:{userId}` | String | 90 s | volatile-lru | 在线心跳 |

**键名规范**：`{域}:{实体}:{标识}`，小写冒号分隔；键前缀统一由配置项 `redis.keyPrefix` 注入，多环境隔离。

---

## 6. 分区与归档策略

| 表 | 分区方式 | 分区粒度 | 保留策略 | 归档去向 |
|:---|:---|:---|:---|:---|
| `audit_log` | `RANGE (time)` | 按月 | 热 6 个月（在线分区）→ 温 12 个月（低配实例）→ 冷 3 年 | 对象存储 Parquet（S3 兼容），保留 3 年后按合规要求销毁 |
| `model_call_log` | `RANGE (time)` | 按月 | 在线 3 个月 | 对象存储，聚合后保留 12 个月 |
| `sync_event` | `RANGE (created_at)` | 按月 | 在线 6 个月（`status='succeeded'` 可 3 个月） | 对象存储 |
| `notification_log` | `RANGE (created_at)` | 按月 | 在线 6 个月 | 对象存储 |
| `task_state_history` | 不分区 | — | 全量在线 | 随项目归档 |
| 其余业务表 | 不分区 | — | 全量在线 | 项目归档时导出 JSON 快照 |

分区建表示例：
```sql
CREATE TABLE audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  time timestamptz NOT NULL DEFAULT now(),
  /* …其余字段… */
  PRIMARY KEY (id, time)
) PARTITION BY RANGE (time);

CREATE TABLE audit_log_2026_09 PARTITION OF audit_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```
归档作业由 `pg_cron` 每日 02:00 触发：`ATTACH` 下月分区 → `EXPORT` 超期分区到对象存储 → `DETACH` + `DROP`。

---

## 7. 迁移与版本管理

| 项 | 规范 |
|:---|:---|
| 工具 | `node-pg-migrate`，迁移文件为**纯 SQL**（`up.sql` / `down.sql`） |
| 命名 | `{时间戳}_{动作}_{对象}.sql`，如 `20260924_create_task_table.sql` |
| 顺序 | 时间戳严格递增；禁止修改已合入的迁移文件，只能追加新文件 |
| 事务 | 每个迁移在单事务内执行（DDL 幂等：`CREATE TABLE IF NOT EXISTS`、`ADD COLUMN IF NOT EXISTS`） |
| 加列 | 新增列必须 `NULL` 或有 `DEFAULT`，避免长事务锁表；大表加列用 `ADD COLUMN ... DEFAULT ... NOT VALID` 后补 `VALIDATE` |
| 索引 | 大表索引用 `CREATE INDEX CONCURRENTLY`（该迁移单独事务、`-- 事务外` 标记） |
| 回滚 | 每个 `up.sql` 必须有对应 `down.sql`；回滚前先在备库演练；数据破坏性变更采用「双写 + 回填 + 切读 + 删旧列」四步，不做原地 drop |
| 版本记录 | 迁移历史表 `pgmigrations`（工具默认），发布记录写入 `audit_log`（`category='配置变更'`） |

回滚策略分级：
```yaml
rollback:
  level_1_schema: 直接执行 down.sql（仅限新增表/列/索引）
  level_2_data: 双写期回滚：关闭新写开关，读回旧列，新列保留
  level_3_breaking: 不允许自动回滚，走人工应急预案 + 数据修复脚本
```

---

## 8. 可验收标准

- [ ] 20 张表全部有 `up.sql` / `down.sql`，`node-pg-migrate up` 与 `down` 均可在空库上往返执行成功。
- [ ] 每张表均含 `id uuid PK`、`created_at`、`updated_at`、`deleted_at`、`version` 五列（可通过 `information_schema.columns` 查询验证）。
- [ ] `external_id_map` 的 `uq_eim_provider_external`、`uq_eim_provider_local` 两个部分唯一索引存在，插入重复映射时数据库抛唯一约束错误。
- [ ] `task.state` 的 `CHECK` 约束精确包含 10 个值 `backlog/refined/taskCreated/dev/testGreen/committed/deployed/qa/bugfix/released`，无多余值。
- [ ] `audit_log` 与 `model_call_log` 按 `time` 月分区创建成功，`\d+ audit_log` 可见至少 1 个分区。
- [ ] Redis 全部键在 `docs` 中登记且 `TTL` 非 `-1`（除明确 `无` 的 Stream/ZSet 队列键）。
- [ ] 20 张表各提供至少 1 条示例行，示例值取自原型 `data.ts`（`TASK-2401` / `REQ-2401` / `BUG-1043` / `PC-ORD-2401` 等），字段名与 `data.ts` 语义一致。
- [ ] 全库无 `TBD` / `待补充` 字样；枚举值可 100% 追溯到 `data.ts` 的 `TASK_STATES` / `models` / `agents`。
