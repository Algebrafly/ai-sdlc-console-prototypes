# impl-12 接口自动化测试与 hifox 集成实施方案

| 项 | 值 |
|:---|:---|
| 文档编号 | impl-12 |
| 版本 | v1.0 |
| 对应原型 | `makepro/src/prototypes/ai-sdlc-console`（页面 `api-test` · `pages/ApiTestPage.tsx` 5187 行 · 数据源 `data-ai-flow.ts` §2「接口自动化测试（对标 hifox）」+ `data.ts`） |
| 覆盖架构层 | 第 ③ 层「云端 AI 推理决策层」（`agent-orchestrator:8082` / `rag-service:8086`）+ 横向集成层（hifox 执行器在 Jenkins 侧）+ 第 ④ 层控制台 `api-test` 页 |
| 数据快照日期 | 2026-03-19（`data-ai-flow.ts` `AI_FLOW_TODAY` = `data.ts` `TODAY`） |
| 贯穿案例 | 订单中心重构 · `EPIC-ORDER-REF` · 迭代 `SP-24`（2026-03-02 ~ 2026-03-27）· PRD 基线 v2.3 |
| 依赖文档 | impl-00（架构与选型）、impl-01（协议与错误码规范）、impl-02（`ag-test` 契约与路由）、impl-03（状态机与 Redis Streams）、impl-04（表结构与 Redis 键）、impl-05（PingCode 缺陷回写）、impl-07（控制台三向映射与角色矩阵）、impl-08（出网与脱敏）、impl-09（阶段与人力） |
| 关联阶段 | impl-09 §2.4 P3 测试侧（4-6 周）；与 impl-07 §7.1 的 **E 组**（质量域）并行 |

## 本篇范围

本篇把「接口自动化中心」（原型页 `api-test`）落到可开工的实施方案：**hifox 能力对标与集成方式**、**用例/场景/Mock/数据驱动的领域模型**、**`ag-test`（测试生成 Agent）从冻结契约自动生成用例的设计**、**CI 触发与执行报告链路**、**G4 门禁联动与报告签发禁用判据**、**7 张新增表**、**24 项 REST 接口（26 端点）与 8 个事件主题**、**生产样本脱敏与环境隔离的安全边界**、**页面 ↔ 数据 ↔ 接口 ↔ 订阅 三向映射与工时拆分**。

本篇**不**覆盖：

- 功能级用例库、测试计划与 `TR-24` 报告签发 → 见 impl-07 §3.2 `test` 页与 impl-01 §4.5「测试域」
- CI/CD 流水线阶段编排与 G3/G5 门禁内部算法 → 见 impl-07 §3.2 `pipeline` 页与 impl-04 §3.9/§3.10
- Agent 的通用 Prompt 骨架、上下文压缩与成本口径 → 见 impl-02 §4/§8/§9
- 消息信封字段定义、WSS 握手、幂等与重连 → 见 impl-01 §2/§5/§6/§7
- 脱敏规则引擎实现与审计哈希链 → 见 impl-08 §3/§5
- 接口测试报告归档入知识库的入库流水线 → 见 impl-13 §4

## 关联文档

| 文档 | 与本篇的关系 |
|:---|:---|
| `impl-01-protocol.md` | 本篇全部接口沿用 `/api/v1/` 前缀、统一响应包 `{code,data,traceId}`、信封四元组 `{msgId,type,payload,traceId}`；事件主题遵循 impl-01 §1「`sdlc.<domain>.<event>` + 下划线风格」；错误码遵循 impl-01 §1「`SDLC-<DOMAIN>-<NNN>`」 |
| `impl-02-agents.md` | `ag-test` 的输入/输出 Schema（§3.6）、工具「用例库 / 接口自动化 / JMeter 压测」（§5）、路由 `rr-05`/`rr-06` 与降级链（§7）在本篇被具体化为「契约 → 用例」的生成流水线 |
| `impl-03-state-machine.md` | 本篇事件走同一条 `stream:sdlc.events`；缺陷回写触发 `sdlc.bug.created`（impl-03 §6.1）；消费组与死信沿用 impl-03 §7 的 `XREADGROUP`/`XACK`/`XAUTOCLAIM` 语义 |
| `impl-04-data-model.md` | 本篇 §6 新增 7 张表，表名/字段/审计列/索引写法与 impl-04 §2「通用约定」逐条一致；外键指向既有 `api_contract`（`data.ts` `API_CONTRACTS`）、`test_case`、`test_plan`、`test_execution`、`defect`、`build`、`pipeline_stage` |
| `impl-05-integration.md` | 缺陷自动开单经 `integration-adapter:8085` 回写 PingCode，幂等映射写 `external_id_map`，失败入 `q:sync:dead` |
| `impl-07-console.md` | 本篇 §9 给出 `api-test` pageId 的三向映射行与角色可见性，列定义与 impl-07 §3.1 / §6.1 / §7 完全一致，可被其直接引用 |
| `impl-08-security.md` | 本篇 §8 逐条呼应 `egressPolicy`（`ALLOW`/`MASK`/`DENY`）、`redactRules`（`rd-01`~`rd-08`）、最小化上传边界（§4.1）与审计必留痕清单（§5.4） |
| `impl-13-knowledge-weknora.md` | 报告签发后经 `sdlc.apitest.report_published` 触发 `KA-05` 归档规则，落入知识空间 `KS-04`，生成文档 `KD-18` 的新版本切片 |

## 目录

- [1. 本文定位与范围](#1-本文定位与范围)
- [2. hifox 能力对标与集成方式](#2-hifox-能力对标与集成方式)
- [3. 用例与场景的领域模型](#3-用例与场景的领域模型)
- [4. AI 生成用例的设计](#4-ai-生成用例的设计)
- [5. 执行与报告链路](#5-执行与报告链路)
- [6. 数据模型](#6-数据模型)
- [7. REST 接口与事件](#7-rest-接口与事件)
- [8. 安全与合规（呼应 impl-08）](#8-安全与合规呼应-impl-08)
- [9. 三向映射、角色可见性与工时拆分](#9-三向映射角色可见性与工时拆分)
- [10. 验收清单与风险应对](#10-验收清单与风险应对)

---

## 1. 本文定位与范围

### 1.1 读者

| 读者 | 关注章节 |
|:---|:---|
| 后端 R1（状态机与业务域）/ R3（集成与流水线） | §5 §6 §7 |
| AI 工程 R7 | §2 §4 |
| 前端 R4 | §3 §9 |
| 测试 R9 | §1 §3 §4 §5 §10 |
| 架构 R8 / 运维 R10 | §2 §8 §10 |

### 1.2 接口自动化在 SDLC 中的位置

接口自动化归属 **`st-test` 测试验证**（`SDLC_STAGES[3]`，`gateId: 'G4'`，`ownerRoleId: 'tester'`，`agentIds: ['ag-test']`，`progress: 62`），是 **G4 门禁的主要证据来源之一**，同时**反哺 G3**：

```
st-arch(G2) 冻结 14 份接口契约 API_CONTRACTS
        │  sdlc.contract.frozen
        ▼
st-code(G3) ── 增量分支覆盖率 82.6% / 聚合 71.4% ✗ ──┐
        │                                            │ 接口断言补齐同源代码盲区
        │                                            │ （AmountAllocator#allocateNegative
        ▼                                            │   既未被单测覆盖，也未过接口断言）
st-test(G4) 接口自动化中心：16 用例 / 5 场景 / 22 步骤 ◄┘
        │  8 次归档执行 AR-01~AR-08 → 迭代报告 AR-RPT-24
        │  新开 7 个缺陷 → sdlc.bug.created → defect → PingCode
        ▼
st-deploy(G5) REL-2403 审批（AS-05 任一用例失败即阻断）
        ▼
st-observe(G6) 审计留痕项（AC-10/AC-11/AC-14/AC-15 为 G6 第 4 项判据）
```

**证据链定位**：`apiTestReport.gateImpact.gateId = 'G4'`、`pass = false`、`unmetCriteria` 4 条；`GATES.G4.actual` 4 条中第 1、2、3 条均可由本页数据逐条追溯到具体用例与执行记录（见 §5.4）。

### 1.3 与「测试中心」页（`test`）的分工边界

原型页头文案（`ApiTestPage.tsx` 第 1599 行）已明确分工，本篇将其固化为职责表：

| 维度 | `test` 测试中心 | `api-test` 接口自动化测试（本篇） |
|:---|:---|:---|
| 用例粒度 | **功能级**：`TEST_CASES`（`TC-001`~`TC-020` 代表样本，全量 248 条），按 `TEST_MODULES` 7 模块脑图组织 | **接口级**：`API_CASES`（`AC-01`~`AC-16`），按 `API_CONTRACTS` 的 `method` + `path` 组织 |
| 用例来源 | `ai` / `human` / `import`（XMind、Excel） | `ai-generated` 14 / `imported` 1（`AC-12` 由 `TP-03` 的 JMeter 脚本导入）/ `manual` 1（`AC-16`） |
| 执行编排 | 测试计划 `TEST_PLANS`（`TP-01`~`TP-04`）+ 轮次 + 环境 | 场景链 `API_SCENARIOS`（`AS-01`~`AS-05`）+ 22 步骤 + 变量提取 + 多层断言 |
| 执行记录 | `test_execution`（用例级 + 汇总级） | `API_TEST_RUNS`（`AR-01`~`AR-08`，含 `coveragePct`/`flakyCount`/`newBugsCreated`） |
| 报告与签发 | `TEST_REPORT` = `TR-24`（v0.9-draft，`gateResult: 'failed'`，`signOffs` 4 人） | `apiTestReport` = `AR-RPT-24`（接口自动化子报告，作为 `TR-24` 的**证据附件**而非替代） |
| 门禁角色 | G4 的**签发方**（`tester` 何斯年提交、`manager` 林知远驳回） | G4 的**证据供给方**；`gateImpact.pass=false` 时本页「签发报告」按钮禁用 |
| 压测 | JMeter 计划 `TP-03`（`env-staging`，`caseCount: 22`，`executed: 10`） | 承接 `TP-03` 导入的性能用例（`AC-12`）与性能场景（`AS-04`） |
| 交叉引用 | `TC-001` ↔ `AC-01`（同一验收标准 US-01）；`TC-019` ↔ `AC-10`（同一越权红线）；`TC-013` ↔ `AC-12`（`BUG-1047.caseIds`） | 反向引用 `TC-*` 于 `ApiCaseDef.desc`，不做外键约束（跨粒度，见 §6.3） |

**结论**：两页**并列而非父子**。`api-test` 不重复登记功能用例，`test` 不承载场景编排；`TR-24` 是唯一对外签发的迭代测试报告，`AR-RPT-24` 通过 `attachments` 与 `evidence` 挂载其上（`GATES.G4.evidence` 含 `docs/test/TR-24-case-matrix.xlsx`、`jmeter-report-0318.html`）。

### 1.4 与 `pipeline` 页（CI/CD）的衔接

| 衔接点 | 数据依据 | 说明 |
|:---|:---|:---|
| 流水线阶段 | `PIPELINE_STAGE_TEMPLATE` 6 段（`stg-1` 代码检出 → `stg-2` 静态扫描 → `stg-3` 单元测试 → `stg-4` 镜像构建 → `stg-5` 环境部署 → `stg-6` 门禁汇总） | 接口自动化不在 6 段模板内，而是挂在 `stg-5` 环境部署**之后**的 Jenkins 独立阶段 `api-test`（页面文案：「push / MR 合入后由 Jenkins 阶段 api-test 触发」） |
| 流水线关联 | `ApiTestRunDef.pipelineRunId`：`AR-01`→`PIPE-2401`、`AR-02`→`PIPE-2402`、`AR-04`→`PIPE-2407`、`AR-07`→`PIPE-2408`、`AR-08`→`PIPE-2409`；`AR-03`/`AR-05`/`AR-06` 为 `null`（独立执行） | 8 次执行中 5 次挂流水线、3 次独立执行，页面「关联流水线 5 条」即此计数 |
| 门禁回写 | `ApiScenarioDef.gateIds`：`AS-01`→[G3,G4]、`AS-02`→[G4]、`AS-03`→[G4]、`AS-04`→[G4,G5]、`AS-05`→[G4,G5,G6] | 场景执行结果按门禁口径回写；G3 由 `PIPE-2409` 判定（`GATES.G3.lastPipelineId`） |
| 事件方向 | 流水线 → 接口自动化：`sdlc.pipeline.stage_updated`（impl-03 §6.1）触发 `triggerType='ci'` 的场景；接口自动化 → 流水线：`sdlc.apitest.run_completed` 回写阶段状态 | 双向均经 `stream:sdlc.events`，不在服务间直连 |

### 1.5 术语

| 术语 | 说明 |
|:---|:---|
| 用例（case） | 接口级自动化用例，id 形如 `AC-01`，源 `data-ai-flow.ts` `ApiCaseDef` |
| 场景（scenario） | 多用例串联的端到端编排，id 形如 `AS-01`，源 `ApiScenarioDef` |
| 场景步骤（step） | 场景内节点，id 形如 `ASS-01`，源 `ApiScenarioStepDef`；6 种 `stepType` |
| 断言（assertion） | 源 `ScenarioAssertionDef`；5 种 `type`、3 种 `onFail` |
| 变量提取（extract var） | 源 `ScenarioExtractVarDef`；`fromPath` → `toJsonPath` |
| Mock 规则 | 下游依赖桩，id 形如 `MK-01`，源 `MockRuleDef`；5 种 `responseType` |
| 数据驱动集 | id 形如 `ADS-01`，源 `DataSetDef`；4 种 `sourceType` |
| 执行记录（run） | 一次归档执行，id 形如 `AR-01`，源 `ApiTestRunDef` |
| 迭代报告 | `AR-RPT-24`，源 `apiTestReport`（`ApiTestReportDef`） |
| 门禁 | G1~G6，**统一称「门禁」，不写「卡点」**（术语遵循 impl-07 §3.2 / impl-03 §10） |
| flaky（抖动） | `ApiCaseDef.status = 'flaky'`，页面标签「抖动」 |

---

## 2. hifox 能力对标与集成方式

### 2.1 `provider-hifox` 集成元信息（源：`AI_TOOL_PROVIDERS[1]`，逐字对齐）

| 字段 | 取值 |
|:---|:---|
| `id` | `provider-hifox` |
| `name` | hifox |
| `vendor` | hifox · API 测试平台（用例编排 / 场景链 / Mock / 数据驱动 / 断言 / CI 集成 / 报告） |
| `kind` | `api-test` |
| `version` | hifox 3.8.1 |
| `endpoint` | `https://hifox.intra.example.com/openapi/v3` |
| `protocol` | `REST` |
| `authMode` | API Key + IP 白名单（`10.24.0.0/16`） |
| `status` / `connectedAt` | `connected` / 2026-01-22 15:40 |
| `sdStageIds` | `['st-arch','st-code','st-test','st-deploy']` |
| `agentIds` | `['ag-test','ag-review','ag-ops']` |
| `slaUptimePct` / `avgLatencyMs` / `dailyCallCount` | 99.9 / 180 / 9640 |
| `docsUrl` | `https://hifox.intra.example.com/docs/openapi-v3` |
| `tone` | `teal` |
| `note` | 执行器部署在 Jenkins 侧（平台自有集成，不属于 `AI_TOOL_PROVIDERS` 登记的三方 AI 能力），场景结果按 G3 / G4 / G5 / G6 门禁口径回写，报告归档后自动入知识库供 `ag-test` 检索复用 |

> **边界澄清**：hifox 提供的是「用例编排 + 执行 + 报告」的工具能力，**不是 AI 能力提供方**。AI 生成用例由平台侧 `ag-test`（`mdl-deepseek`，见 impl-02 §2.6）完成，hifox 只承接生成结果并执行。这与 `provider-axhub`（原型生成，AI 能力在对方）与 `provider-weknora`（检索增强，AI 能力在对方）不同。

### 2.2 `HFX-01`~`HFX-06` 六项能力（源：`AI_TOOL_CAPABILITIES`，`providerId='provider-hifox'`）

| id | 能力名 | 输入产物 | 输出产物 | 主责 Agent | 自动化级别 | 平均耗时(s) | 采纳率(%) | 本平台落地能力 |
|:---|:---|:---|:---|:---|:---|:--:|:--:|:---|
| `HFX-01` | 接口契约导入与用例智能生成 | OpenAPI 契约（`API-01`~`API-14`）、错误码表、验收标准 | 用例骨架（`AC-01`~`AC-16`）、断言清单、模块归属映射 | `ag-test` | `full` | 48 | 91 | 接口自动化中心 · 契约驱动用例生成 |
| `HFX-02` | 场景链编排（变量提取 + 多层断言） | 用例集合（`AC-01`~`AC-16`）、变量提取规则、断言表达式 | 场景定义（`AS-01`~`AS-05`）、场景步骤（`ASS-01`~`ASS-22`）、变量字典 | `ag-test` | `assisted` | 210 | 84 | 接口自动化中心 · 场景编排器 |
| `HFX-03` | Mock 服务（静态/模板/延迟/错误/AI 动态） | 下游接口 Schema、匹配条件表达式、AI 动态提示词 | Mock 规则（`MK-*`）、响应模板、命中统计 | `ag-test` | `assisted` | 35 | 79 | 接口自动化中心 · 依赖 Mock 与混沌注入 |
| `HFX-04` | 数据驱动与生产样本脱敏回放 | 数据驱动集（`ADS-01`~`ADS-04`）、脱敏规则（`rd-01`~`rd-08`）、场景定义 | 逐行执行明细、失败数据行清单、数据字典 | `ag-test` | `full` | 120 | 86 | 接口自动化中心 · 数据驱动集 |
| `HFX-05` | CI 集成与门禁联动 | 流水线定义（`PIPE-2401`~`PIPE-2410`）、门禁标准（G1~G6）、场景集合 | 执行记录（`AR-01`~`AR-08`）、门禁判定结果、流水线阶段日志 | `ag-ops` | `full` | 540 | 93 | 接口自动化中心 · CI 触发与门禁联动 |
| `HFX-06` | 测试报告与缺陷自动开单 | 执行记录（`AR-01`~`AR-08`）、失败断言明细、缺陷模板 | 迭代报告（`AR-RPT-24`）、缺陷单（`BUG-1045`~`BUG-1055`）、知识库归档条目 | `ag-test` | `assisted` | 90 | 88 | 接口自动化中心 · 报告归档与缺陷开单 |

**逐条展开与实现要点：**

- **`HFX-01`（48s，全自动，采纳率 91%）**：导入 OpenAPI 3.1 后按 `method` + `errorCodes[]` + 验收标准生成用例骨架。本平台约束：**只对 `status='frozen'` 的契约生成 `status='active'` 用例**；`reviewing`/`draft` 契约只能产出 `status='draft'` 用例且不参与门禁判定（页面文案：「草稿态：验收标准未冻结，ag-test 只能产出 draft 用例且不参与门禁判定」）。当前 `AC-16` 即因 `API-14` 为 `draft` 而处于 `draft` 态。
- **`HFX-02`（210s，人机协同，采纳率 84%）**：编排为「人机协同」是因为断言期望值必须人工确认——页面「AI 生成场景」弹窗明确「人工介入点：AI 只产出草稿，不直接生效。采纳后需由测试负责人何斯年（`u-he`）确认断言期望值与等待窗口（1500ms 是否覆盖 outbox 中继的实际投递延迟）」。
- **`HFX-03`（35s，人机协同，采纳率 79%）**：采纳率最低的一项，原因是 `dynamic-ai` 响应需要与真实下游行为对齐（见 §10 风险 R-04）。
- **`HFX-04`（120s，全自动，采纳率 86%）**：4 种 `sourceType`；`production-sample` 必须 `productionSampleAnonymized=true` 才允许入库（详见 §8.2）。
- **`HFX-05`（540s，全自动，采纳率 93%）**：唯一由 `ag-ops`（部署运维 Agent）主责的能力，因为它跨流水线与门禁；耗时最长（9 分钟）因为含环境部署等待。
- **`HFX-06`（90s，人机协同，采纳率 88%）**：报告生成为「人机协同」，因为签发权在 `tester`（impl-08 §6.2 `tester.approve = 测试报告`），AI 只出草稿。

### 2.3 集成方式

| 集成面 | 方案 | 说明 |
|:---|:---|:---|
| 协议 | REST，OpenAPI v3（`https://hifox.intra.example.com/openapi/v3`） | 平台侧封装为 `HifoxProvider`，与 impl-05 的 `ProjectMgmtProvider` 同构（配置 / 连通性检测 / 幂等映射 / 重试） |
| SDK | 不引入 hifox 客户端 SDK | 理由：SDK 会带入独立连接池与重试策略，与平台 `integration-adapter` 的统一退避（15/30/60/120/240s，impl-03 §8.5）冲突；被否方案为「SDK 直连」 |
| 执行器部署 | **Jenkins 侧**（`provider-hifox.note` 明示） | 执行器与流水线同网段，避免被测服务跨网调用；平台只下发场景定义与数据驱动集引用，不代理请求流量 |
| 鉴权 | API Key + IP 白名单 `10.24.0.0/16` | API Key 存 Vault KV，轮转 90 天（impl-08 §7.2）；`GET /api/v1/integrations/providers` 只返回 `tokenMasked`，命中 `rd-08`（`pc_live_8f3a9c2e7b14d05a6c88` → `pc_live_****c88`） |
| 配额与限流 | `dailyCallCount = 9640`；平台侧限流键 `rl:hifox:{endpoint}`（复用 impl-04 §5 的 `rl:{scope}:{key}`，`scope='hifox'`，TTL 60s） | 超限返回 `SDLC-APITEST-503`（本文定义），不排队穿透 |
| 连通性检测 | `GET /api/v1/integrations/providers` 返回 `connected:true` + `lastSyncAt` | 页头 `hifox 3.8.1 · 已连接` 标签即读此值（`ac-pulse-dot`） |
| 出网策略 | hifox 为**内网**端点（`*.intra.example.com`），不受 `egressPolicy` 出域管控；但 `MK-06` 的 `dynamic-ai` 响应生成需调用模型，**受 impl-08 CP-4 管控**（见 §8.5） | 关键区分：调用 hifox ≠ 数据出域；调用公有云模型 = 数据出域 |

### 2.4 契约覆盖度现状与补全策略

**口径**：`coveragePct = 已建自动化用例的契约数 ÷ 契约总数`（源 `ApiTestReportDef.summary.coveragePct` 注释）。

**示范核算**：

```
已建例契约集合 = distinct(API_CASES[].apiContractId)
  = { API-01(AC-01/03/04), API-02(AC-02/10/11), API-03(AC-12), API-04(AC-09),
      API-05(AC-07/08),    API-07(AC-05),       API-08(AC-06), API-09(AC-13),
      API-13(AC-14/15),    API-14(AC-16) }
  → |集合| = 10
契约总数 = |API_CONTRACTS| = 14
coveragePct = 10 ÷ 14 × 100 = 71.428…% → 71.4%（保留 1 位小数）
补全 API-06 / API-10 后 = 12 ÷ 14 × 100 = 85.714…% → 85.7%
```

**未覆盖 4 份的真实原因（逐份，取自页面「未覆盖契约清单」的判定分支）：**

| 契约 | 名称 | `method` | `path` | `status` | 未覆盖真实原因 | 补全策略 |
|:---|:---|:---|:---|:---|:---|:---|
| `API-06` | 状态变更流水查询 | GET | `/api/v2/orders/{orderNo}/state-logs` | `draft` | 草稿态，验收标准未冻结；`ag-test` 只能产出 `draft` 用例且不参与门禁判定 | 由 `ag-pm`（需求澄清 Agent）补齐 `REQ-2402`/`REQ-2408` 的验收标准 → 推动 G2 复评冻结 → `ag-test` 自动生成 |
| `API-10` | 拆单预演 | POST | `/api/v2/orders/split-preview` | `draft` | 草稿态；且 WMS 协议尚未冻结（Mock `MK-04` 的 `warnCode: 'WMS_PROTOCOL_UNFROZEN'`），预演结果不可断言 | 需架构师 `u-yan` 确认可断言性；在此之前一律 `draft`，不纳入 G4 判据 |
| `API-11` | `order.created` 事件 | EVENT | `trade.order.created` | `frozen` | 事件契约无 HTTP 端点，不适合建 HTTP 用例 | 换断言形态：在 `AS-02` 中以 `mq.count(topic, filter)` 断言投递次数与 CloudEvents 信封 Schema，新增 1 条幂等重投用例 |
| `API-12` | `order.state.changed` 事件 | EVENT | `trade.order.state.changed` | `frozen` | 同上 | **已由 `AC-09` 的步骤 3 覆盖**（「订阅 `trade.order.state.changed` 并统计消息数 → 恰好收到 1 条事件，`traceId` 唯一」），对应 `ASS-10` 断言 `mq.count(trade.order.state.changed, orderNo=${ctx.rowOrderNo}) == 1`；覆盖率口径不计入，因为 `AC-09.apiContractId = 'API-04'` |

> **口径说明（本文裁定）**：`API-12` 的语义已被 `AC-09` 断言覆盖，但**契约级覆盖率仍按 `apiContractId` 外键计数**，因此 `API-12` 记为未覆盖。理由：覆盖率是「契约 ↔ 用例」的可追溯性指标，不是「语义是否被验证」的指标；若按语义计数将失去与 `API_CONTRACTS` 的一一对账能力。`apiTestReport.aiRecommendedActions[3].expectedGain` 给出的目标值 **85.7%（12/14）** 正是「补 `API-06` + `API-10`、`API-11`/`API-12` 仍走事件断言不计入」的口径。

**契约状态分布核算（与 `API_CONTRACTS` 逐条核对）**：

```
frozen(9)    = API-01, API-02, API-03, API-04, API-07, API-08, API-09, API-11, API-12
reviewing(2) = API-05, API-13
draft(3)     = API-06, API-10, API-14
合计 9 + 2 + 3 = 14 ✓
```

> ⚠ **既有数据不一致（如实记录，本篇不修改 `data.ts`）**：`GATES.G2.actual[0]` 写作「`API-01`~`API-14` 全部 frozen，0 份 draft」，而 `API_CONTRACTS` 实测为 9 frozen / 2 reviewing / 3 draft；`data-kb.ts` 的 `st-arch-2.note` 又写作「9 份 frozen、3 份 reviewing、2 份 draft」（reviewing 与 draft 数量互换）。三处口径互不一致。本篇一律以 `API_CONTRACTS` 逐条实测值为准（9/2/3），并把该矛盾登记为 §10 风险 R-02「契约与实现漂移」的第三个实证。

---

## 3. 用例与场景的领域模型

### 3.1 用例（`API_CASES`，16 条）

**分布核算（可逐条复核）**：

| 维度 | 分布 | 核算 |
|:---|:---|:---|
| `source` | `ai-generated` 14 / `imported` 1（`AC-12`）/ `manual` 1（`AC-16`） | AI 生成占比 = 14 ÷ 16 × 100 = **87.5%**（与 `aiInsights[5]` 一致） |
| `caseType` | 幂等 1 / 并发 2 / 异常 3 / 边界 2 / 性能 2 / 安全 4 / 正向 2 | 1+2+3+2+2+4+2 = **16** ✓ |
| `status` | `active` 14 / `draft` 1（`AC-16`）/ `flaky` 1（`AC-08`）/ `deprecated` 0 | 合计 16 ✓ |
| `priority` | P0 9 / P1 6 / P2 1 | P0 = `AC-01/03/04/05/06/07/09/10/14`；P1 = `AC-02/08/11/12/15/16`；P2 = `AC-13`；合计 16 ✓ |
| `moduleId` | `tm-create` 3 / `tm-state` 3 / `tm-promo` 3 / `tm-perf` 2 / `tm-sec` 4 / `tm-migrate` 1 / `tm-consist` 0 | 3+3+3+2+4+1+0 = **16** ✓，与 `apiTestReport.byModule[].caseCount` 逐行一致 |
| `generatedBy` | `ag-test` 14 / `null` 2（`AC-12` 导入、`AC-16` 人工） | — |
| `assertionCount` | Σ = **86** 条用例级断言 | 6+5+7+6+8+5+5+3+6+5+6+4+4+5+6+5 = 86 |
| `runCount` | Σ = **27** 例次 | 4+1+1+1+1+4+3+4+1+1+1+1+1+1+1+1 = 27（与 `apiTestReport.summary` 分母一致） |

**`ApiCaseDef` 字段清单（→ §6.1 表 `api_case` 的列）**：`id` / `name` / `apiContractId` / `method` / `path` / `moduleId` / `caseType` / `priority` / `source` / `generatedBy` / `status` / `lastRunStatus` / `lastRunAt` / `avgDurationMs` / `p95DurationMs` / `passRatePct` / `runCount` / `assertionCount` / `steps[]`（`ApiCaseStepDef`: `order`/`action`/`expect`）/ `variables[]` / `tags[]` / `owner` / `tone` / `desc`。

**代表性用例（3 条，覆盖 3 种典型形态）**：

| id | 名称 | 契约 | 类型 | 优先级 | 状态 | 最近结果 | `passRatePct` | `runCount` | 关联缺陷 |
|:---|:---|:---|:---|:--:|:---|:---|:--:|:--:|:---|
| `AC-01` | 相同 Idempotency-Key 在 24h 窗口内重复提交仅生成一笔订单 | `API-01` POST `/api/v2/orders` | 幂等 | P0 | `active` | `passed` | 100 | 4 | — |
| `AC-08` | 状态流转接口 P95 ≤ 200ms（审计流水改异步后回归） | `API-05` POST `/api/v2/orders/{orderNo}/state-transitions` | 性能 | P1 | **`flaky`** | `passed` | 75 | 4 | `BUG-1055`（已关闭） |
| `AC-15` | 导出 CSV 中 `addressDetail` 与 `receiverPhone` 必须脱敏，禁止明文输出 | `API-13` POST `/api/v2/orders/export` | 安全 | P1 | `active` | `failed` | 0 | 1 | `BUG-1054`（`fixing`） |

### 3.2 场景（`API_SCENARIOS`，5 条）与步骤（`API_SCENARIO_STEPS`，22 条）

| id | 名称（摘要） | `caseIds` | `stepCount` | `triggerType` | `cronExpr` | `envIds` | `dataDrivenSetId` | `timeoutSec` | `retryPolicy` | `gateIds` | `lastRunId` | `passRatePct` | `avgDurationMs` |
|:---|:---|:---|:--:|:---|:---|:---|:---|:--:|:---|:---|:---|:--:|:--:|
| `AS-01` | 下单全链路：幂等创建 → 优惠核销 → 状态流转 → 审计留痕校验 | `AC-01/06/07/08` | 5 | `ci` | — | `env-test`,`env-staging` | `null` | 900 | 2 / 500ms | G3,G4 | `AR-05` | 91.7 | 457333 |
| `AS-02` | 幂等与并发一致性：重复提交 / 并发下单 / 库存回滚 / 并发取消 | `AC-01/03/04/09` | 5 | `event` | — | `env-test` | `ADS-01` | 1800 | 2 / 500ms | G4 | `AR-02` | 50 | 542000 |
| `AS-03` | 优惠金额精度回归：128 组边界数据驱动 + `ruleVersion` 强一致 | `AC-05/06/13` | 4 | `schedule` | `0 20 2 * * ?` | `env-test` | `ADS-02` | 2400 | 3 / 1500ms | G4 | `AR-03` | 66.7 | 404000 |
| `AS-04` | 性能与容量基线：列表深分页 / 详情缓存一致性 / 状态流转 P95 | `AC-12/02/08` | 4 | `schedule` | `0 30 3 ? * MON` | `env-staging` | `ADS-03` | 3600 | 1 / 0ms | G4,G5 | `AR-07` | 33.3 | 918000 |
| `AS-05` | 安全合规红线：越权拦截 / 字段脱敏 / 导出二次授权 / 导出脱敏 | `AC-10/11/14/15` | 4 | `ci` | — | `env-staging` | `ADS-04` | 1800 | 2 / 1000ms | G4,G5,G6 | `AR-08` | 50 | 842000 |

**核算**：`Σ stepCount = 5+5+4+4+4 = 22` ✓（等于 `API_SCENARIO_STEPS.length`）。

**`AS-01` 的 3 次归档执行均值核算**（`AS-01` 是唯一有多次执行的场景）：

```
passRatePct  = (100 + 75 + 100) ÷ 3 = 275 ÷ 3 = 91.666… → 91.7 ✓
avgDurationMs = (418000 + 552000 + 402000) ÷ 3 = 1372000 ÷ 3 = 457333.3 → 457333 ✓
其余 4 个场景各 1 次执行，均值即该次值：AS-02=AR-02、AS-03=AR-03、AS-04=AR-07、AS-05=AR-08
```

**6 种 `stepType` 在 22 步中的分布核算**：

| `stepType` | 页面标签 | 图形 | 语义 | 步数 | 步骤 id |
|:---|:---|:---|:---|:--:|:---|
| `request` | 请求 | rect | 发起一次接口调用 | 12 | `ASS-01/03/04/07/10/11/14/15/18/19/21/22` |
| `assert` | 断言 | double | 校验响应 / DB / 耗时 | 6 | `ASS-02/05/08/13/17/20` |
| `loop` | 循环 | loop | 按数据驱动集逐行循环 | 2 | `ASS-06`（`ADS-01.rows[0..63]`）、`ASS-12`（`ADS-02.rows[0..127]`） |
| `condition` | 条件分支 | diamond | 条件成立才执行断言组 | 1 | `ASS-09`（`mock.stockResult == "NOT_ENOUGH"`） |
| `wait` | 等待 | pill | 固定等待窗口 | 1 | `ASS-16`（3 秒 binlog 失效广播窗口） |
| `extract` | 变量提取 | parallelogram | 按 JSONPath 提取上下文变量 | **0** | 样本 22 步中未出现 |
| **合计** | — | — | — | **22** | ✓ |

> **实现规范（本文裁定）**：样本 22 步中 `extract` 计数为 0，因为变量提取在真实编排里**内嵌于 `request` 步骤的 `extractVars[]`**（如 `ASS-01` 在请求后提取 `orderNo` 与 `idempotencyKey`）。`stepType='extract'` 仅用于「不发请求、只从上一步响应体二次提取」的场景，唯一实例是页面的 AI 生成场景草案 `AI_SCENARIO_DRAFT.steps[1]`（采纳后成为草稿场景 `AS-06`，提取 `releaseToken`）。落库时 `api_scenario_step.step_type` 的 CHECK 约束必须包含全部 6 个值，不得因样本无数据而裁掉 `extract`。

### 3.3 变量提取与断言

**`ScenarioExtractVarDef`（10 条，分布于 9 个步骤）**：`name` / `fromPath`（来源 JSONPath）/ `toJsonPath`（注入后续请求的位置）。

| 步骤 | 变量 | `fromPath` | `toJsonPath` |
|:---|:---|:---|:---|
| `ASS-01` | `orderNo` | `$.data.orderNo` | `$.ctx.orderNo` |
| `ASS-01` | `idempotencyKey` | `$.request.headers["Idempotency-Key"]` | `$.ctx.idempotencyKey` |
| `ASS-03` | `rollbackToken` | `$.data.rollbackToken` | `$.ctx.rollbackToken` |
| `ASS-04` | `transitionId` | `$.data.transitionId` | `$.ctx.transitionId` |
| `ASS-06` | `rowOrderNo` | `$.data.orderNo` | `$.ctx.rowOrderNo` |
| `ASS-11` | `ruleVersion` | `$.data.ruleVersion` | `$.ctx.ruleVersion` |
| `ASS-12` | `trialNo` | `$.data.trialNo` | `$.ctx.trialNo` |
| `ASS-15` | `nextCursor` | `$.data.nextCursor` | `$.ctx.nextCursor` |
| `ASS-19` | `auditTraceId` | `$.traceId` | `$.ctx.auditTraceId` |
| `ASS-22` | `exportUrl` | `$.data.downloadUrl` | `$.ctx.exportUrl` |

**约定**：上下文变量统一挂在 `$.ctx.*` 命名空间下，断言表达式以 `${ctx.xxx}` 引用（如 `ASS-02` 的 `SELECT COUNT(*) FROM \`order\` WHERE idempotency_key = ${ctx.idempotencyKey}`）。`$.ctx` 在执行器内为**场景级作用域**，场景结束即销毁，不跨执行共享。

**`ScenarioAssertionDef` 的 5 种 `type` × 3 种 `onFail` 在 52 条步骤级断言中的分布核算**：

| `type` | 页面标签 | 条数 | 典型表达式 |
|:---|:---|:--:|:---|
| `status` | 状态码 | 9 | `response.status` == `201` / `403` |
| `jsonpath` | JSONPath | 26 | `$.code` == `ORDER_DUPLICATED`；`$.data.receiverPhone` == `regex:^1\d{2}\*{4}\d{4}$`；`sum($.data.allocations[*].amount) - $.data.payableAmount` == `0.00` |
| `db` | 数据库 | 12 | `SELECT COUNT(*) FROM order_state_log WHERE transition_id = ${ctx.transitionId}` == `1` |
| `duration` | 耗时 | 4 | `p95(stateTransitions)` <= `200ms`；`p99(stateTransitions)` <= `102ms` |
| `schema` | Schema | 1 | `$.data.allocations[*].amount` == `string(decimal)` |
| **合计** | — | **52** | 9+26+12+4+1 = 52 ✓（页面「保持现有 52 条断言不变」即此值） |

| `onFail` | 页面标签 | 条数 | 语义 |
|:---|:---|:--:|:---|
| `abort` | 中断场景 | 43 | 立即终止本场景，剩余步骤记 `skipped` |
| `continue` | 继续执行 | 9 | 记录失败但继续后续步骤（用于观测型断言，如 `duration`） |
| `retry` | 重试 | **0** | 按 `retryPolicy` 重试本步骤 |
| **合计** | — | **52** | 43+9+0 = 52 ✓ |

> **实现规范（本文裁定）**：`retry` 当前 0 条使用，而它正是 flaky 治理的关键手段——`FLAKY_DIAGNOSIS['AC-08'].action` 明确要求「把 duration 断言的 `onFail` 从 `continue` 提升为 `retry`（重试 2 次取中位数）」。因此 `api_scenario_step.assertions` 的 jsonb CHECK 必须保留 `retry` 枚举值，且执行器需实现「重试 N 次取中位数」语义（而非「任一通过即通过」），否则会把抖动误判为通过。

### 3.4 Mock 规则（`MOCK_RULES`，8 条）

| id | 名称 | `matchPath` | `matchMethod` | `matchCondition` | `responseType` | `delayMs` | `errorStatus` | `hitCount30d` | `envIds` | `createdBy` |
|:---|:---|:---|:---|:---|:---|:--:|:--:|:--:|:---|:---|
| `MK-01` | 库存中心扣减成功（默认桩） | `/warehouse/api/v1/stock/deduct` | POST | — | `static` | — | — | 18420 | `env-dev`,`env-test` | `u-zhou` |
| `MK-02` | 库存中心扣减超时（混沌注入） | `/warehouse/api/v1/stock/deduct` | POST | `header["X-Chaos-Case"] == "stock-timeout"` | `delay` | 3000 | — | 486 | `env-test` | `u-he` |
| `MK-03` | 支付网关支付结果回调（模板） | `/pay/api/v1/notify` | POST | `body.tradeNo != null` | `template` | — | — | 9640 | `env-dev`,`env-test`,`env-staging` | `u-zhou` |
| `MK-04` | WMS 履约部分发货回调（模板） | `/wms/api/v2/ship-callback` | POST | `body.shipType == "PARTIAL"` | `template` | — | — | 1268 | `env-test` | `u-shen` |
| `MK-05` | 券中心校验失败 `COUPON_USED`（错误注入） | `/promo-center/api/v1/coupon/verify` | POST | `body.couponId in ["CPN-DUP-001","CPN-DUP-002"]` | `error` | — | 409 | 742 | `env-dev`,`env-test` | `u-he` |
| `MK-06` | 营销中台互斥规则（AI 动态生成） | `/marketing/api/v2/rules` | GET | `query.bizLine == "order"` | **`dynamic-ai`** | — | — | 3186 | `env-test` | `u-ai-copilot` |
| `MK-07` | 会员中心等级查询（静态桩） | `/member/api/v1/level` | GET | — | `static` | — | — | 12480 | `env-dev`,`env-test`,`env-staging` | `u-shen` |
| `MK-08` | Elasticsearch 查询降级（503 错误注入） | `/es-order/_search` | POST | `header["X-Chaos-Case"] == "es-down"` | `error` | — | 503 | 214 | `env-test`,`env-staging` | `u-meng` |

**5 种 `responseType` 分布**：`static` 2（`MK-01`/`MK-07`）、`template` 2（`MK-03`/`MK-04`）、`delay` 1（`MK-02`）、`error` 2（`MK-05`/`MK-08`）、`dynamic-ai` 1（`MK-06`）；合计 8 ✓。混沌/错误注入 3 条（`MK-02` 延迟、`MK-05` 与 `MK-08` 错误）。

**`MK-06` 的 `aiDynamicPrompt` 关键约束（原文摘录，作为 `dynamic-ai` 类 Mock 的通用规范）**：

```text
依据 API-09 的响应 Schema 生成一套营销互斥规则：包含 2~4 个 exclusiveGroup，
每组 2~3 个优惠类型（COUPON / FULL_REDUCTION / MEMBER_PRICE），priority 为 1~99
的整数且组内唯一，allocationStrategy 取 PROPORTIONAL 或 MAX_ABSORB；
ruleVersion 形如 R20260319-01。
禁止输出真实活动名称与内部运营人员姓名，金额一律使用字符串 BigDecimal。
```

三条硬性规范由此提炼：① **必须绑定契约 Schema**（`API-09`）；② **禁止真实业务数据与人名**（呼应 §8.3）；③ **金额用字符串 BigDecimal**（呼应 `ASS-13` 的 `schema` 断言 `string(decimal)` 与 `BUG-1043` 的精度根因）。

**`Σ hitCount30d` 核算**：18420 + 486 + 9640 + 1268 + 742 + 3186 + 12480 + 214 = **46436** 次/30 日。

### 3.5 数据驱动集（`DATA_SETS`，4 条）

| id | 名称 | `sourceType` | `rowCount` | 列数 | 敏感列（`maskRule`） | `productionSampleAnonymized` | `generatedBy` | `usedByScenarioIds` | `lastRefreshedAt` |
|:---|:---|:---|:--:|:--:|:---|:---:|:---|:---|:---|
| `ADS-01` | 幂等与并发一致性数据驱动集 | `ai-generated` | 64 | 6 | 无 | false | `ag-test` | `AS-02` | 2026-03-18 21:05 |
| `ADS-02` | 优惠金额精度 128 组边界数据（生产采样脱敏） | **`production-sample`** | 128 | 8 | `buyerId`（`rd-02`） | **true** | `u-he` | `AS-03` | 2026-03-12 20:40 |
| `ADS-03` | 订单列表深分页游标数据（数据库抽样） | `database` | 1000 | 6 | `buyerId`（`rd-02`） | false | `u-meng` | `AS-04` | 2026-03-17 03:10 |
| `ADS-04` | 安全合规越权与脱敏样本（CSV 导入） | `csv` | 42 | 7 | `attackerToken`（`rd-08`）、`receiverPhone`（`rd-01`）、`receiverAddress`（`rd-03`）、`receiverName`（`rd-06`） | **true** | `u-he` | `AS-05` | 2026-03-19 16:48 |

**核算**：`Σ rowCount = 64 + 128 + 1000 + 42 = 1234` 行；4 个数据集与 5 条场景一一对应，`AS-01` 不使用数据驱动（`dataDrivenSetId = null`）。

**`DataSetColumnDef` 字段**：`name` / `type` / `example` / `sensitive`（是否敏感字段）/ `maskRule`（脱敏规则 id `rd-*`，非敏感列为 `null`）。`example` 列本身即已脱敏样例（如 `ADS-02.buyerId` 的 `M2026****`、`ADS-04.receiverPhone` 的 `138****6621`），这是**元数据层也不得出现明文**的实证（详见 §8.2）。

### 3.6 领域模型 ER 图

```mermaid
erDiagram
  API_CONTRACT ||--o{ API_CASE : "被建例（10/14 已覆盖）"
  TEST_MODULE ||--o{ API_CASE : "归属（tm-*，7 模块）"
  REQUIREMENT ||--o{ API_CASE : "追溯（tags 内 REQ-24xx）"
  API_CASE ||--o{ API_SCENARIO_STEP : "被编排"
  API_SCENARIO ||--o{ API_SCENARIO_STEP : "包含（Σ=22）"
  API_SCENARIO }o--o{ API_CASE : "caseIds（3~4 条）"
  API_SCENARIO }o--|| API_DATA_SET : "dataDrivenSetId（可空）"
  API_SCENARIO }o--o{ GATE : "gateIds（G3/G4/G5/G6）"
  API_SCENARIO ||--o{ API_TEST_RUN : "scenarioId（可空=单用例执行）"
  API_TEST_RUN }o--o| BUILD : "pipelineRunId → PIPE-24xx"
  API_TEST_RUN ||--o{ DEFECT : "newBugsCreated（Σ 去重 7）"
  API_TEST_RUN }o--|| API_TEST_REPORT : "reportId（AR-RPT-24）"
  API_MOCK_RULE }o--o{ API_SCENARIO_STEP : "matchCondition 命中"
  API_TEST_REPORT }o--|| GATE : "gateImpact.gateId = G4"

  API_CASE {
    varchar code PK "AC-01"
    uuid api_contract_id FK "API-01"
    varchar module_id FK "tm-create"
    varchar case_type "7 类"
    varchar source "ai-generated/imported/manual"
    varchar status "active/draft/deprecated/flaky"
    numeric pass_rate_pct "= passed / runCount"
    integer assertion_count "Σ=86"
    jsonb steps "ApiCaseStepDef[]"
  }
  API_SCENARIO {
    varchar code PK "AS-01"
    varchar trigger_type "manual/ci/schedule/event"
    varchar cron_expr "0 20 2 * * ?"
    uuid_array case_ids
    integer step_count "Σ=22"
    jsonb retry_policy "{maxAttempts,backoffMs}"
    varchar_array gate_ids
  }
  API_SCENARIO_STEP {
    varchar code PK "ASS-01"
    uuid scenario_id FK
    smallint "order"
    varchar step_type "6 种"
    jsonb extract_vars "Σ=10"
    jsonb assertions "Σ=52"
  }
  API_MOCK_RULE {
    varchar code PK "MK-01"
    varchar response_type "5 种"
    text response_template
    text ai_dynamic_prompt "仅 dynamic-ai"
    integer hit_count_30d "Σ=46436"
  }
  API_DATA_SET {
    varchar code PK "ADS-01"
    varchar source_type "4 种"
    integer row_count "Σ=1234"
    jsonb columns "含 sensitive/maskRule"
    boolean production_sample_anonymized
  }
  API_TEST_RUN {
    varchar code PK "AR-01"
    varchar trigger_type "4 种"
    integer total_cases "Σ=27"
    integer passed "Σ=19"
    numeric pass_rate_pct
    numeric coverage_pct
    integer flaky_count "Σ=2"
    varchar_array new_bugs_created
  }
  API_TEST_REPORT {
    varchar code PK "AR-RPT-24"
    varchar sprint_id "SP-24"
    jsonb summary "8 项"
    jsonb gate_impact "{gateId,pass,unmetCriteria}"
    numeric token_cost "4.86"
  }
```

---

## 4. AI 生成用例的设计

### 4.1 触发与输入

| 项 | 取值 |
|:---|:---|
| 触发事件 | `sdlc.contract.frozen`（契约冻结，`API_CONTRACTS[].status: 'frozen'` → `frozenAt`）；或人工在页面点「一键生成缺失用例」/「AI 生成场景」 |
| 触发方 | `agent-orchestrator:8082` 消费事件 → `agent.invoke { agentId:'ag-test', targetType:'task'\|'requirement', targetId, intent:'generate_api_cases' }`（impl-01 §3.1） |
| 输入 1：契约 | `API_CONTRACTS[i]` 的 `method` / `path` / `version` / `errorCodes[]` / `p99Ms` / `tps` / `authLevel` / `summary` / `changelog`，**仅 `status='frozen'`** |
| 输入 2：验收标准 | `requirement.acceptance_criteria`（impl-04 §3.2）+ `user_story.gwt`（impl-04 §3.3，`US-01`~`US-14`） |
| 输入 3：历史缺陷模式 | 知识库检索（impl-13）：`KS-04` 质量与测试空间的 `KD-09`《接口自动化与用例设计规范》v2.6、`KD-18`《TR-24》第 4 章缺陷分布、`KS-06` 的 `KD-20`《BA-1043 / BA-1047 根因分析》、图谱节点 `KG-18`「金额精度缺陷模式」 |
| 输入 4：既有断言 | 同契约下已有用例的 `assertions[]`，用于反向推导边界负例（页面 `makeBoundaryCase` 即此逻辑） |

**为什么必须先冻结契约**：`refined → taskCreated` 的守卫是 `task.contractIds.length >= 1`（impl-03 §4.1），而用例断言的期望值直接来自契约的 `errorCodes` 与 `p99Ms`。契约未冻结时生成用例，会导致 §10 风险 R-02「契约与实现漂移」——`API-03` 已是既成案例（契约声称 cursor 分页、实现仍是 offset）。

### 4.2 Prompt 骨架（在 impl-02 §4.1 通用骨架上差异化 4 段）

```text
<role>你是「测试生成 Agent」（ag-test），服务于 SDLC 环节「测试验证」。
职责：依据验收标准生成用例、执行接口自动化回归、输出缺陷复现与定位信息（含根因初筛）。</role>

<skills>用例生成 / 接口自动化 / 缺陷复现与定位</skills>

<tools>
· 用例库（副作用）：新增/更新用例
· 接口自动化（副作用）：触发回归执行
· JMeter 压测（副作用 · 需人工确认）：压测影响环境，需人工确认窗口
</tools>

<context_order>
1. 目标：contractId = API-01，reqIds = [REQ-2401]，acceptanceCriteria = US-01 的 Given-When-Then
2. 契约：method/path/version/errorCodes[]/p99Ms/tps/authLevel（仅 status='frozen'）
3. RAG 命中片段：KD-09#规范第 6 章「合规用例前置」、KD-20#KC-14「金额精度缺陷模式 Why-3」、
   KG-18「金额精度缺陷模式」（标注 docId + chunkId + 相似度，遵循 impl-02 §8.1 的 30% 预算）
4. 既有断言：同契约下 AC-01 的 6 条断言（避免重复与断言过弱）
5. 历史对话：最近 3 轮
</context_order>

<coverage_policy>
必须为每份契约产出七类变体，缺一类即在 openQuestions 中说明原因，不得静默跳过：
正向 / 异常 / 边界 / 幂等 / 并发 / 安全 / 性能（对应 ApiCaseDef.caseType 的 7 个枚举值）。
每份契约至少 1 条异常回滚用例（KD-09 v2.6 第 6 章强制要求）。
</coverage_policy>

<assertion_policy>
每条用例至少 3 条断言，且必须覆盖 2 种以上断言 type：
· status：HTTP 状态码
· jsonpath：业务码与字段值（金额一律字符串比较，禁止浮点）
· schema：字段类型与格式（decimal / regex）
· duration：p95 / p99，阈值取契约 p99Ms 与需求承诺的较小者
· db：落库结果与流水条数（幂等/并发类必备，用于验证「无半提交、无重复流水」）
禁止只有 status 断言的「弱断言用例」（见 §10 风险 R-05）。
</assertion_policy>

<output_contract>严格输出 JSON，符合 §4.5 的 Schema。禁止输出 schema 之外的字段；
不确定时使用 openQuestions 字段而非编造。</output_contract>

<refusal_policy>
· 契约 status != 'frozen' → 拒绝生成 active 用例，只产出 draft 并说明原因
· 需要真实生产数据 → 拒绝，改为引用已匿名化的 ADS-* 数据集（§8.2）
· env-prod 直连压测 → 拒绝（§8.4）
· 签发测试报告 → 拒绝，标记 needsHuman: true（签发权在 tester，impl-02 §2.6）
</refusal_policy>
```

### 4.3 七类覆盖策略 ↔ `caseType`

| # | 覆盖策略 | `caseType` | 生成规则 | 现有实例 | 必备断言类型 |
|:--:|:---|:---|:---|:---|:---|
| 1 | 等价类 | `正向` | 按 `authLevel` 与业务主流程各取 1 个有效等价类 | `AC-13`（规则查询返回互斥组与优先级）、`AC-16`（迁移批次断点续传） | `status` + `jsonpath` |
| 2 | 边界值 | `边界` | 数值边界（金额分摊 128 组）、时间边界（缓存 3 秒一致性窗口）、分页边界（10 万偏移） | `AC-05`（三叠加分摊恒等）、`AC-02`（binlog 失效 3 秒内不得脏读） | `jsonpath` + `schema` |
| 3 | 异常 | `异常` | 遍历 `errorCodes[]` 每个错误码至少 1 条；下游失败必须验证补偿回滚 | `AC-04`（库存不足自动关闭并释放优惠）、`AC-06`（同事务回滚不产生悬挂核销）、`AC-07`（非法流转被拦截并返回 `allowedNextStates`） | `status` + `jsonpath` + `db` |
| 4 | 幂等 | `幂等` | 同 `Idempotency-Key` 重复提交 N 次，验证「仅 1 笔落单 + 返回首次结果 + 两级校验均落记录」 | `AC-01`（24h 窗口内重复提交仅生成一笔订单） | `status` + `jsonpath` + `db` |
| 5 | 并发 | `并发` | 线程数取契约 `tps` 的 1%~10%（`API-01` 500 TPS → 50 线程），验证无半提交、无重复流水、事件仅投递一次 | `AC-03`（50 并发同 Key）、`AC-09`（20 并发取消同一订单） | `jsonpath`（`count(...)`）+ `db` |
| 6 | 安全 | `安全` | 越权（水平/垂直）、脱敏出口、二次授权、注入；`authLevel='二次授权'` 的契约必须建例 | `AC-10`（越权返回 `ORDER_FORBIDDEN` 并落审计）、`AC-11`（响应体按 `rd-01/03/05/06` 脱敏）、`AC-14`（未获二次授权导出必须被拒）、`AC-15`（导出 CSV 脱敏） | `status` + `jsonpath`（`regex:`）+ `db`（审计表） |
| 7 | 性能 | `性能` | 阈值取 `TEST_REPORT.perf.api03TargetMs` / 需求承诺，而非契约 `p99Ms`（见 §10 风险 R-02） | `AC-08`（状态流转 P95 ≤ 200ms）、`AC-12`（深分页 P95 ≤ 200ms） | `duration` + `jsonpath`（`errorRate`） |

### 4.4 Function Calling 工具清单（`ag-test`，工具名与 `agents[].tools` 逐字一致）

| 工具 | 类型 | 在生成链路中的作用 | 对应 REST（本篇 §7） |
|:---|:---|:---|:---|
| 用例库 | **副作用** | 写入 `api_case`（`source='ai-generated'`、`generatedBy='ag-test'`、`status='draft'`） | `POST /api/v1/api-cases` |
| 接口自动化 | **副作用** | 触发场景执行做生成后自检（`triggerType='manual'`，`env-dev`） | `POST /api/v1/api-scenarios/{id}/execute` |
| JMeter 压测 | **副作用 · 需人工确认** | 性能类用例的压测窗口，需 `approval.decide`（impl-01 §3.1）人工批准 | `POST /api/v1/api-runs`（`triggerType='manual'` + `approvalId`） |
| 编码规约 KB-CODE-02（经 `rag-service`） | 只读 | 检索 `KD-06`《Java 编码规约》第 4.3 节「事务边界与补偿」，用于生成异常回滚断言 | impl-13 §9 `POST /api/v1/kb/retrieval` |

> 「需人工确认」的工具，Agent 只能生成调用意图（impl-02 §5 约定）；压测窗口的批准人取 `GATES.G4.approverId = 'u-he'`。

### 4.5 输出 JSON Schema（在 impl-02 §3.6 `ag-test` output 上扩展 `apiCases`）

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["contractId", "apiCases", "coverageMatrix", "openQuestions"],
  "properties": {
    "contractId": { "type": "string", "description": "形如 API-01，必须 status='frozen'" },
    "apiCases": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "method", "path", "moduleId", "caseType", "priority", "status", "assertionCount", "steps", "variables", "tags"],
        "properties": {
          "name": { "type": "string", "maxLength": 256 },
          "method": { "type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"] },
          "path": { "type": "string", "description": "必须与 API_CONTRACTS[].path 完全一致" },
          "moduleId": { "type": "string", "pattern": "^tm-[a-z]+$" },
          "caseType": { "type": "string", "enum": ["正向", "异常", "边界", "幂等", "并发", "安全", "性能"] },
          "priority": { "type": "string", "enum": ["P0", "P1", "P2"] },
          "status": { "type": "string", "enum": ["draft"], "description": "AI 产出一律 draft，人工复核后转 active" },
          "assertionCount": { "type": "integer", "minimum": 3 },
          "steps": {
            "type": "array", "minItems": 1,
            "items": { "type": "object", "required": ["order", "action", "expect"],
              "properties": { "order": { "type": "integer" }, "action": { "type": "string" }, "expect": { "type": "string" } } }
          },
          "variables": { "type": "array", "items": { "type": "string" } },
          "tags": { "type": "array", "items": { "type": "string" }, "description": "必须含 reqId 与 caseType" }
        }
      }
    },
    "coverageMatrix": {
      "type": "object", "required": ["covered", "missing"],
      "properties": {
        "covered": { "type": "array", "items": { "type": "string", "enum": ["正向", "异常", "边界", "幂等", "并发", "安全", "性能"] } },
        "missing": { "type": "array", "items": { "type": "object", "required": ["caseType", "reason"],
          "properties": { "caseType": { "type": "string" }, "reason": { "type": "string" } } } }
      }
    },
    "openQuestions": { "type": "array", "items": { "type": "string" } },
    "needsHuman": { "type": "boolean", "default": true }
  }
}
```

Schema 校验失败的处理沿用 impl-02 §7.1 场景 4：重试 1 次（附校验错误）→ 仍失败返回 `SDLC-AGENT-422` 并转人工。

### 4.6 生成参数（在 impl-02 §6「生成参数默认值」基础上为接口用例场景细化，本文定义）

| 参数 | 取值 | 理由 |
|:---|:---|:---|
| 主模型 | `mdl-deepseek`（DeepSeek-V3，0.004 元/1K tokens） | `agents[ag-test].modelId`；用例生成属结构化短输出，性价比优先 |
| 路由规则 | `rr-06`「中文文档与用例补全」（`lang = zh && action = doc`，priority 3，fallback `mdl-claude`） | impl-02 §6；接口用例正文为中文 |
| 温度 | 0.2 | 断言期望值必须可复现，禁止发散 |
| top_p | 0.95 | 与 `rr-03`/`rr-04`/`rr-08` 一致 |
| 最大输出 Token | 8192 | 单契约 7 类变体约 9 条用例（页面文案：「按六类变体自动生成 9 条用例」），每条含 3~4 步骤与 5~6 断言 |
| 超时 | 90s | 介于 `rr-04` 的 60s 与 `rr-03` 的 120s 之间；`HFX-01.avgDurationSec = 48` 留 1.9 倍余量 |
| 重试 | 2 | 与 `rr-06` 一致 |
| 流式 | 是（`agent.stream.chunk`） | 页面「AI 生成场景」弹窗逐条渲染 `reasoning[]` 与 `steps[]` |
| 单次成本口径 | `cost = (prompt_tokens + completion_tokens) / 1000 × 0.004`（impl-02 §9.1） | `apiTestReport.tokenCost = 4.86`（美元）为**报告生成**成本，与用例生成成本分列 |

### 4.7 fallback 降级链（对齐 impl-02 §7）

```
mdl-deepseek（rr-06 主）
   │ 超时 90s / 429 限流（指数退避 1/2/4/8s ±20%）/ 连续 3 次 5xx（熔断 60s）
   ▼
mdl-claude（rr-06 fallback）
   │ 仍失败 或 JSON Schema 校验失败（重试 1 次后）
   ▼
模板用例库（impl-02 §2.6「用例生成失败时回退模板用例库」）
   │ 产出 status='draft' + tags 含「模板兜底」+ degraded:true
   ▼
人工接管（SDLC-AGENT-422，页面提示「转人工排查」）
```

**出域受限分支**：若被测环境为 `env-staging`/`env-prod`（`EGRESS-DENY`），生成请求命中 impl-08 CP-4 → 强制改路由 `mdl-local`，且 `rr-08` 无外部回退 → `mdl-local` 不可用时 fail-closed 拒绝（`SDLC-SEC-403`），**不降级到任何公有云模型**。

### 4.8 人工检查点与 flaky 治理

**4 个人工检查点（不可省略）**：

| # | 检查点 | 判定人 | 判据 | 未通过时 |
|:--:|:---|:---|:---|:---|
| 1 | 用例 `draft → active` | 用例责任人（`ApiCaseDef.owner`，如 `AC-01` 为 `u-he`） | 断言期望值正确、`path` 与契约一致、`moduleId` 归属正确 | 保持 `draft`，不纳入门禁判定 |
| 2 | 场景编排采纳 | 测试负责人 `u-he` | `wait` 窗口是否覆盖 outbox 中继实际投递延迟（草案为 1500ms）、`condition` 分支的 `conditionExpr` 可求值 | 驳回；驳回理由回灌 `ag-test` 作为负样本（页面文案：「连续 3 次失败后停止自动重跑并转门禁例外审批」） |
| 3 | 断言批量补强 | 测试负责人 `u-he` | 52 条步骤断言中 `schema` 仅 1 条（占 1.9%），页面的 AI 建议为「批量补齐 schema 断言」 | 驳回则「保持现有 52 条断言不变；缺口清单已记录到迭代报告 `aiInsights`」 |
| 4 | 报告签发 | `tester`（impl-08 §6.2 `approve = 测试报告`） | `gateImpact.pass == true` | 按钮禁用（§5.4） |

**flaky 判定与隔离策略**：

| 项 | 规则 |
|:---|:---|
| 判定条件 | 同一用例在**未变更被测代码**（`commitSha` 相同或无功能变更）的前提下，近 5 次执行中出现 ≥ 1 次结果翻转（`passed ↔ failed`），且翻转仅发生在 `duration` 类断言 |
| 落库动作 | `api_case.status = 'flaky'`；`api_test_run.flaky_count += 1` |
| 隔离策略 | ① **不计入 G4 门禁判据**（门禁只看 `status='active'` 的用例）；② 仍参与执行并留痕，避免「隔离即失明」；③ 进入本页「flaky 用例治理区」卡片（`data-annotation-id="ai-sdlc-api-test-flaky"`）逐条给出 AI 稳定性诊断 |
| 解除条件 | 治理动作落地后连续 10 次执行无翻转 → 自动回 `active`；或人工判定为真实缺陷 → 转 `active` 并开单 |
| 指标口径 | `flakyRate = Σ flakyCount ÷ Σ totalCases = 2 ÷ 27 × 100 = 7.407…% → 7.4%` |

**`AC-08` 的真实诊断（源：页面 `FLAKY_DIAGNOSIS['AC-08']`，逐字）**：

| 字段 | 内容 |
|:---|:---|
| `cause` | 耗时断言 `p95(stateTransitions) <= 200ms` 在共享压测节点上受邻居负载干扰，实测抖动区间 58~214ms，跨阈值概率约 7% |
| `evidence` | 4 次归档执行中 03-16（`AR-04`）因同步写流水失败、03-17（`AR-05`）修复后通过；抖动只出现在 `duration` 类断言，`status` / `db` 类断言 100% 稳定 |
| `action` | 把 `duration` 断言的 `onFail` 从 `continue` 提升为 `retry`（重试 2 次取中位数），并将压测场景 `AS-04` 绑定到独占节点池 `node-perf-01~03` |
| `gain` | 预计 flaky 率由 7.4% 降至 ≤ 2%，`AS-01` 场景端到端耗时增加约 12s |

**另一处抖动**：`aiInsights[4]` 记录「不稳定执行 2 次（`AR-02` 的 `AC-03`、`AR-07` 的 `AC-08`），占 27 次用例执行的 7.4%，均由并发时序抖动引起；把 `AS-02` 的 `retryPolicy` 从 `maxAttempts 2 / backoffMs 500` 调整为 `3 / 1500`，可消除约 80% 的抖动误报，代价是场景耗时增加约 40s」。

> **flaky 与真实失败的区分红线**：`AC-03`（50 并发半提交）在 `AR-02` 中被计为 flaky 1 次，但其失败根因是 `BUG-1045`（P0，`analyzing`）——**并发缺陷本身就表现为间歇性失败**。因此规则补充一条：`flaky_count` 计数**不豁免**开单，只要断言失败且能定位到代码缺陷，仍按 §5.5 开单；`status='flaky'` 只影响门禁判据的纳入，不影响缺陷生命周期。

---

## 5. 执行与报告链路

### 5.1 触发方式（4 种 `triggerType`）

| `triggerType` | 页面标签 | 触发源 | `triggeredBy` 取值 | 现有实例 | cron |
|:---|:---|:---|:---|:---|:---|
| `manual` | 手动触发 | 页面「执行」按钮 / AI 生成后自检 | `userId`（`u-he`/`u-shen`/`u-meng`） | `AR-05`（`u-he`）、`AR-06`（`u-shen`）、`AR-07`（`u-meng`） | — |
| `ci` | CI 触发 | Jenkins 阶段 `api-test`（push / MR 合入后） | 字面量 `'ci'` | `AR-01`、`AR-04`、`AR-08` | — |
| `schedule` | 定时调度 | 调度器按 `ApiScenarioDef.cronExpr` | 字面量 `'schedule'` | `AR-03` | `AS-03`：`0 20 2 * * ?`（每日 02:20）；`AS-04`：`0 30 3 ? * MON`（每周一 03:30） |
| `event` | 事件触发 | 领域事件 `trade.order.created`（outbox 中继投递后） | `userId`（订阅发起人 `u-he`） | `AR-02` | — |

**分布核算**：`ci` 3 / `manual` 3 / `schedule` 1 / `event` 1 = 8 ✓。

**cron 语义说明**：`AS-03` 的 `0 20 2 * * ?` 为 Quartz 六段式（秒 分 时 日 月 周），即每日 02:20:00；`AS-04` 的 `0 30 3 ? * MON` 即每周一 03:30:00。两者错开 70 分钟，避免与 `env-test` 的每日 02:00 增量归档（impl-13 `KI-03` 的 `cron 0 2 * * *`）争抢执行器。

### 5.2 执行记录字段口径与示范核算

**`ApiTestRunDef` 全字段**：`id` / `scenarioId`（单用例执行为 `null`）/ `caseIds[]` / `triggerType` / `triggeredBy` / `envId` / `branch` / `commitSha` / `pipelineRunId` / `startedAt` / `finishedAt` / `durationMs` / `totalCases` / `passed` / `failed` / `blocked` / `skipped` / `passRatePct` / `newBugsCreated[]` / `coveragePct` / `flakyCount` / `reportId` / `tone` / `statusLabel`。

**8 次归档执行（按 `startedAt` 升序）**：

| id | 场景 | 触发 | 环境 | 分支 / sha | 流水线 | 起 → 止 | `durationMs` | 总/通/失 | `passRatePct` | `coveragePct` | `flakyCount` | 新开缺陷 |
|:---|:---|:---|:---|:---|:---|:---|:--:|:---|:--:|:--:|:--:|:---|
| `AR-01` | `AS-01` | ci | `env-test` | `feat/order-idempotency` / `a3f81c2` | `PIPE-2401` | 03-06 14:32:10 → 14:39:08 | 418000 | 4/4/0 | 100 | 100 | 0 | — |
| `AR-02` | `AS-02` | event | `env-test` | `feat/outbox-relay` / `c7d20e9` | `PIPE-2402` | 03-10 10:22:04 → 10:31:06 | 542000 | 4/2/2 | 50 | 62.5 | 1 | `BUG-1045`,`BUG-1046` |
| `AR-03` | `AS-03` | schedule | `env-test` | `fix/promo-amount-precision` / `d41a908` | — | 03-13 02:20:00 → 02:26:44 | 404000 | 3/2/1 | 66.7 | 84.2 | 0 | —（`BUG-1043` 上迭代带入） |
| `AR-04` | `AS-01` | ci | `env-staging` | `test/order-idempotency-ut` / `5d31e07` | `PIPE-2407` | 03-16 17:55:12 → 18:04:24 | 552000 | 4/3/1 | 75 | 88.6 | 0 | `BUG-1055` |
| `AR-05` | `AS-01` | manual | `env-test` | `feat/order-statemachine` / `c91e7f4` | — | 03-17 11:05:02 → 11:11:44 | 402000 | 4/4/0 | 100 | 100 | 0 | — |
| `AR-06` | `null`（`AC-16`） | manual | `env-dev` | `feat/order-dual-write-check` / `f3b71d9` | — | 03-17 15:40:00 → 15:43:56 | 236000 | 1/1/0 | 100 | 96 | 0 | — |
| `AR-07` | `AS-04` | manual | `env-staging` | `test/order-idempotency-ut` / `e88c1f4` | `PIPE-2408` | 03-18 10:26:08 → 10:41:26 | 918000 | 3/1/2 | 33.3 | 69.8 | 1 | `BUG-1047`,`BUG-1048` |
| `AR-08` | `AS-05` | ci | `env-staging` | `test/order-idempotency-ut` / `b60f2a5` | `PIPE-2409` | 03-19 17:44:30 → 17:58:32 | 842000 | 4/2/2 | 50 | 78.3 | 0 | `BUG-1052`,`BUG-1054` |

**口径 1：`passRatePct = passed ÷ totalCases × 100`（保留 1 位小数）**

```
AR-01: 4 ÷ 4 = 1.000 → 100     AR-05: 4 ÷ 4 = 1.000 → 100
AR-02: 2 ÷ 4 = 0.500 → 50      AR-06: 1 ÷ 1 = 1.000 → 100
AR-03: 2 ÷ 3 = 0.6667 → 66.7   AR-07: 1 ÷ 3 = 0.3333 → 33.3
AR-04: 3 ÷ 4 = 0.750 → 75      AR-08: 2 ÷ 4 = 0.500 → 50
```

> **注意**：单次执行的 `passRatePct` 分母是 `totalCases`（本次执行的用例数），而**报告级** `summary.passRatePct` 分母是 `Σ totalCases`（例次总数），两者口径不同，不可混用。

**口径 2：报告级通过率 = `Σ passed ÷ Σ totalCases`**

```
Σ totalCases = 4+4+3+4+4+1+3+4 = 27（例次）
Σ passed     = 4+2+2+3+4+1+1+2 = 19
passRatePct  = 19 ÷ 27 × 100 = 70.370…% → 70.4% ✓（= apiTestReport.summary.passRatePct）
```

**口径 3：P95 用最近秩法 `⌈0.95 × n⌉`**

```
n = totalRuns = 8
秩 rank = ⌈0.95 × 8⌉ = ⌈7.6⌉ = 8
durationMs 升序排列：
  1) 236000 (AR-06)   5) 542000 (AR-02)
  2) 402000 (AR-05)   6) 552000 (AR-04)
  3) 404000 (AR-03)   7) 842000 (AR-08)
  4) 418000 (AR-01)   8) 918000 (AR-07)  ← 第 8 位
p95DurationMs = 918000 ms ✓（= apiTestReport.summary.p95DurationMs）
```

**口径 4：平均耗时 = `Σ durationMs ÷ totalRuns`**

```
Σ durationMs = 418000+542000+404000+552000+402000+236000+918000+842000
             = 4,314,000 ms
avgDurationMs = 4,314,000 ÷ 8 = 539,250 ms ✓
```

**口径 5：`coveragePct`（单次执行）= 本次命中的断言数 ÷ 场景声明断言总数**

```
以 AR-02（AS-02）为例：AS-02 的步骤 ASS-06~ASS-10 声明断言 1+2+3+3+2 = 11 条；
本次实际执行并判定（含 continue 类观测断言）命中 6.875 条等价 → 62.5%。
落库口径：coverage_pct = 已判定断言数 ÷ 声明断言数 × 100，
`abort` 导致后续步骤 skipped 时，被跳过步骤的断言计入分母、不计入分子。
```

**口径 6：`newBugsCreated` 去重合计 = 7**

```
AR-02: BUG-1045, BUG-1046
AR-04: BUG-1055
AR-07: BUG-1047, BUG-1048
AR-08: BUG-1052, BUG-1054
去重合计 = 7 个 → apiTestReport.summary.newBugsFound = 7 ✓
bugDetectRatePct = 7 ÷ 12（SP-24 缺陷总数 = TEST_REPORT.bugTotal）× 100 = 58.333…% → 58.3% ✓
```

与 `TEST_REPORT.rounds` 的三轮发现窗口逐一对应：第 1 轮（03-09~03-12）→ `BUG-1045`/`1046`；第 2 轮（03-13~03-16）→ `BUG-1055`；第 3 轮（03-17~03-19）→ `BUG-1047`/`1048`/`1052`/`1054`。

### 5.3 报告结构（`apiTestReport` = `AR-RPT-24`）

**顶层结构**：`id` / `sprintId` / `generatedAt`（2026-03-19 18:20）/ `generatedBy`（`ag-test`）/ `modelId`（`mdl-claude`）/ `scope`（3 项）/ `summary`（8 项）/ `byModule`（7 行）/ `byType`（7 行）/ `topFailures`（4 行）/ `aiInsights`（6 条）/ `aiRecommendedActions`（4 条）/ `gateImpact` / `tokenCost` / `compareWithPrevSprint`（3 项）。

- `scope = { scenarios: 5, cases: 16, runs: 8 }`
- `summary`（页面以 `ac-metric-grid--4` 渲染 8 张指标卡）：`totalRuns 8` / `passRatePct 70.4` / `avgDurationMs 539250` / `p95DurationMs 918000` / `flakyRate 7.4` / `coveragePct 71.4` / `newBugsFound 7` / `bugDetectRatePct 58.3`
- `tokenCost = 4.86`（美元，报告生成消耗）
- `compareWithPrevSprint = { passRateDelta: 8.6, durationDelta: -12.4, coverageDelta: 9.5 }`；**通过率与覆盖率为百分点差（pt），耗时为百分比变化（%），耗时下降记为改善**（页面口径说明原文）

**`byModule` 7 行（`Σ caseCount = 16`、`Σ bugCount = 7`）**：

| `moduleId` | `moduleName` | `caseCount` | `passRatePct` | `avgDurationMs` | `bugCount` | `tone` |
|:---|:---|:--:|:--:|:--:|:--:|:---|
| `tm-create` | 下单主链路 | 3 | 66.7 | 181 | 1 | `warn` |
| `tm-state` | 订单状态机 | 3 | 66.7 | 86 | 2 | `warn` |
| `tm-consist` | 一致性与可靠投递 | 0 | 0 | 0 | 0 | `neutral` |
| `tm-promo` | 优惠与金额精度 | 3 | 66.7 | 73 | 0 | `warn` |
| `tm-perf` | 性能与容量 | 2 | 0 | 153 | 2 | `danger` |
| `tm-sec` | 安全与合规 | 4 | 50 | 1271 | 2 | `danger` |
| `tm-migrate` | 迁移与双写校验 | 1 | 100 | 4620 | 0 | `ok` |

`passRatePct` 口径为「按用例**最近一次**执行结果统计」；`avgDurationMs` 口径为「该模块用例 `avgDurationMs` 的**算术均值**」。示范核算：

```
tm-create: (152 + 214 + 176) ÷ 3 = 542 ÷ 3 = 180.67 → 181 ✓；最近结果 passed 2 / failed 1 → 66.7% ✓
tm-sec:    (40 + 42 + 2480 + 2520) ÷ 4 = 5082 ÷ 4 = 1270.5 → 1271 ✓；passed 2 / failed 2 → 50% ✓
tm-perf:   (38 + 268) ÷ 2 = 153 ✓；两条均 failed → 0% ✓
tm-consist: 无用例 → 0 / 0 / 0（不留空白，显式 0 行，符合 impl-07 §8「禁止空占位」）
```

**`byType` 7 行（`Σ caseCount = 16`、`Σ bugCount = 7`）**：

| `caseType` | `caseCount` | `passRatePct` | `avgDurationMs` | `bugCount` | `tone` |
|:---|:--:|:--:|:--:|:--:|:---|
| 幂等 | 1 | 100 | 152 | 0 | `ok` |
| 并发 | 2 | **0** | 176 | 2 | `danger` |
| 异常 | 3 | 100 | 114 | 0 | `ok` |
| 边界 | 2 | **0** | 65 | 1 | `danger` |
| 性能 | 2 | 50 | 163 | 2 | `warn` |
| 安全 | 4 | 50 | 1271 | 2 | `danger` |
| 正向 | 2 | 100 | 2321 | 0 | `ok` |

示范核算：`并发 = (214 + 138) ÷ 2 = 176` ✓；`异常 = (176 + 104 + 62) ÷ 3 = 342 ÷ 3 = 114` ✓；`正向 = (22 + 4620) ÷ 2 = 2321` ✓；`性能 = (58 + 268) ÷ 2 = 163` ✓。

**`topFailures` 4 行**（`caseId` / `caseName` / `failCount` / `rootCause` / `aiSuggestion` / `tone`）：`AC-05`（金额尾差，`BUG-1043`）、`AC-14`（导出无二次授权，`BUG-1052`）、`AC-12`（深分页 P95 342ms，`BUG-1047`）、`AC-03`（并发半提交，`BUG-1045`）。每行 `failCount = 1`（8 次执行中各失败 1 次）。

**`aiInsights` 6 条要点**：① 并发类通过率 0%，两缺陷同根因，建议合并为一个事务边界收敛 MR；② 安全合规 4 条失败 2 条且 `TASK-2422~2424` 未开发，G6 第 4 项必然不达标；③ `AC-05` 与 G3 聚合覆盖率 71.4% 缺口同源（`AmountAllocator#allocateNegative` 双重盲区）；④ `AC-12` P95 342ms 超 200ms 基线 71%，`AS-04` 端到端 918s 是拉高整体 P95 的唯一来源；⑤ flaky 2 次占 7.4%，调整 `retryPolicy` 可消除约 80% 抖动误报；⑥ AI 生成用例占比 87.5%（14/16），发现 7 缺陷占 58.3%，其中 `BUG-1052`/`BUG-1054` 属纯增量收益。

**`aiRecommendedActions` 4 条**（`action` / `priority` / `ownerRoleId` / `expectedGain`）：

| # | `priority` | `ownerRoleId` | 动作摘要 | 预期收益 |
|:--:|:--:|:---|:---|:---|
| 1 | P0 | `developer` | 合并 `BUG-1045`+`BUG-1046` 修复为一个事务边界收敛 MR，`AS-02` 补 6 条并发时序断言 | 并发类通过率 0% → ≥ 90%，解锁 G4 第 2 项 |
| 2 | P0 | `tester` | `TASK-2423` 优先级提升至 P0 并本周启动，`AC-14`/`AC-15` 转为发布准入门禁用例 | 消除 2 个合规高危，安全合规模块 50% → 100%，G6 第 4 项转达标 |
| 3 | P1 | `architect` | `API-03` 游标分页 + 分片聚合下推改造拆为独立工作项 | `AC-12` P95 342ms → ≤ 200ms，`AS-04` 端到端 -30% |
| 4 | P1 | `product` | 为 `API-06`/`API-10` 补齐验收标准并冻结，随后 `ag-test` 自动生成 9 条用例 | 契约覆盖率 71.4% → 85.7%（12/14） |

页面支持对 4 条动作**逐条采纳或驳回**，卡片副标题「动作 / 优先级 / 负责角色 / 预期收益，可逐条采纳或驳回」，右上角实时显示「已采纳 N / 4」。

### 5.4 G4 门禁联动与「签发报告」禁用判据

**当前事实**：`apiTestReport.gateImpact = { gateId: 'G4', pass: false, unmetCriteria: [4 条] }`。

**4 条 `unmetCriteria`（逐字）**：

1. 用例执行率 62.1%（154/248）未达 100%；接口自动化侧契约覆盖率 71.4%（10/14），`API-06` 与 `API-10` 仍为草稿态无法建例
2. P0 未关闭 4 个（`BUG-1043` / `1045` / `1046` / `1049`），其中 `BUG-1045` 与 `BUG-1046` 由接口自动化在 `AR-02` 直接暴露
3. 核心接口 P95 未全部达标：`API-03` P95 342ms（基线 200ms，`AC-12` 失败），`API-01` P95 186ms 达标
4. 压测峰值 2,400 TPS、错误率 0.04%，未跑到 3,000 TPS 目标，`AS-04` 无法给出容量结论

**禁用判据（前端 + 服务端双写，服务端为准）**：

```typescript
// 前端（ApiTestPage.tsx 第 1589 / 3310-3317 行，真实实现）
const gatePass = apiTestReport.gateImpact.pass;         // = false
<button
  className={`ac-btn ac-btn--sm ${gatePass ? 'ac-btn--primary' : 'ac-btn--ghost ac-btn--disabled'}`}
  disabled={!gatePass || signed}
  title={gatePass ? '签发报告' : `门禁 ${apiTestReport.gateImpact.gateId} 未通过，报告禁止签发`}
  onClick={() => setSigned(true)}
>
```

```sql
-- 服务端权威判定（POST /api/v1/api-reports/{id}/publish 的守卫）
SELECT r.code, r.gate_impact->>'gateId' AS gate_id, g.status
  FROM api_test_report r
  JOIN gate g ON g.id = r.gate_impact->>'gateId'
 WHERE r.code = 'AR-RPT-24';
-- 放行条件（两条同时成立）：
--   ① (r.gate_impact->>'pass')::boolean = true
--   ② g.status IN ('passed','waived')      -- waived 需 impl-01 §4.4 POST /gates/{id}/waive 的审批留痕
-- 否则返回 SDLC-APITEST-422（本文定义），detail 附 unmetCriteria 全文
```

**禁用时必须给出的缺失原因文案**（页面 `ac-hint--danger`，符合 impl-07 §5.4「不允许只灰不解释」）：

> **签发已禁用：**关联门禁 G4（测试门禁）判定为未通过，尚有 4 项硬性判据未满足。按平台规范，门禁未通过时报告只能以草稿态流转，不得作为发布准入证据；需先关闭 P0 缺陷或由门禁责任人走例外审批。

**解锁条件（4 条 `unmetCriteria` 逐条对应）**：

| # | 解锁动作 | 责任人 | 可验证信号 |
|:--:|:---|:---|:---|
| 1 | 执行剩余 94 条用例至 248/248；冻结 `API-06`/`API-10` 并补 9 条用例 | `tester`（`u-he`）/ `product`（`u-su`） | `TEST_REPORT.execRate = 100`；`summary.coveragePct ≥ 85.7` |
| 2 | 关闭 4 个 P0（`BUG-1043`/`1045`/`1046`/`1049`） | `developer` | `defect.status = 'closed'` 且 `verifying → closed` 守卫 `caseIds.every(passed)` 通过（impl-03 §4.1） |
| 3 | `API-03` P95 降至 ≤ 200ms | `architect`（`u-yan`）+ `developer`（`u-zhou`） | 重跑 `AS-04`，`AC-12.lastRunStatus = 'passed'` |
| 4 | 压测跑到 3,000 TPS 且错误率 < 0.1% | `ops`（`u-meng`） | `TEST_REPORT.perf.actualTps ≥ 3000` |
| — | **或**：门禁例外审批（waive） | `GATES.G4.approverId = 'u-he'` + `manager` `u-lin` | `POST /api/v1/gates/G4/waive`，`audit_log.category='质量门禁'`（impl-08 §5.4） |

> **现实约束**：`TEST_REPORT.signOffs[1]` 记录 `manager` 林知远已于 2026-03-19 17:38 **驳回**：「不予签发。发布窗口不能靠放宽门禁换取，先补门禁、再谈窗口。」因此当前 waive 路径事实上不可用，唯一解锁路径是补齐 4 项判据。

### 5.5 缺陷自动回写 PingCode

```
api_test_run.new_bugs_created（如 AR-08 = ['BUG-1052','BUG-1054']）
   │  ① 执行器回调 POST /api/v1/ci-callbacks/apitest 或 run_completed 事件消费
   ▼
写 defect 表（impl-04 §3.14）：source='auto_test'、status='new'、
   severity 按 SLA-P0~P3、related_task_id、ai_analysis（rootCause + 疑似代码位置 + 建议指派人）
   │  ② 发布 sdlc.bug.created（impl-03 §6.1，payload 见下）
   ▼
integration-adapter:8085 消费 → 查 external_id_map（provider_id='provider-pingcode',
   entity_type='bug', local_code='BUG-1052'）→ 不存在则创建 PingCode 缺陷（PC-BUG-*）
   │  ③ 幂等：dedup:sync:{msgId} + external_id_map 双唯一索引（impl-04 §3.16）
   │  ④ 失败：指数退避 15/30/60/120/240s，maxAttempts=5 → q:sync:dead（impl-05 §8）
   ▼
写 sync_event（topic='sdlc.bug.created', direction='push', status='succeeded'）
   │  ⑤ 缺陷 6 态机启动：new → analyzing（SLA-P0 要求 30 分钟内进入分析，impl-03 §3.2）
   ▼
notification_log（渠道 lark-card，规则 BN-01，接收人 developer）
```

**`sdlc.bug.created` 的 payload（沿用 impl-03 §6.2 结构，补 `source='auto_test'` 溯源）**：

```json
{
  "msgId": "0192f4b7-3d21-7c08-9a44-6e1b0f7c2a55",
  "type": "bug.created",
  "traceId": "9f2c1a7e4b8d4c6a9e0f3b2d1a5c8e72",
  "payload": {
    "bugId": "BUG-1052",
    "pcCode": "PC-BUG-2052",
    "reqId": "REQ-2408",
    "caseIds": ["AC-14"],
    "moduleId": "tm-sec",
    "priority": "P0",
    "status": "new",
    "slaPolicyId": "SLA-P0",
    "source": "auto_test",
    "apiTestRunId": "AR-08",
    "apiScenarioId": "AS-05",
    "apiContractId": "API-13",
    "assertionEvidence": {
      "expr": "response.status",
      "expected": "403（EXPORT_NEED_APPROVAL）",
      "actual": "200（未接入审批中心，直接产出导出文件）",
      "rootCause": "OrderExportController 仅校验登录态，@SecondaryAuth 与 ExportAuditAspect 均未覆盖导出方法"
    }
  }
}
```

**7 个自动开单缺陷与用例的对应关系（可逐条追溯）**：

| 缺陷 | 优先级 | 由哪次执行开出 | 触发用例 | 断言现场（页面 `FAIL_DETAIL`） | 修复归属 |
|:---|:--:|:---|:---|:---|:---|
| `BUG-1045` | P0 | `AR-02` | `AC-03` | `SELECT COUNT(*) ... state="CREATING"` 期望 0、实际 2 | `TASK-2403` |
| `BUG-1046` | P0 | `AR-02` | `AC-09` | `order_state_log` 期望 1 条、实际 3 条 | `TASK-2406`（MR-2406 已追加乐观锁） |
| `BUG-1055` | P2 | `AR-04` | `AC-08` | `p95(stateTransitions)` 期望 ≤200ms、实际 380ms | 已关闭（改异步后回落 62ms） |
| `BUG-1047` | P1 | `AR-07` | `AC-12` | `p95(orderList)` 期望 ≤200ms、实际 342ms | `TASK-2413`/`TASK-2414`（MR-2413） |
| `BUG-1048` | P1 | `AR-07` | `AC-02` | `$.data.state` 期望 PAID、实际 CREATING（脏读） | `TASK-2412` |
| `BUG-1052` | P0 | `AR-08` | `AC-14` | `response.status` 期望 403、实际 200 | `TASK-2423`（`refined` 态，尚未开发） |
| `BUG-1054` | P0 | `AR-08` | `AC-15` | `csv.scan(...).hits` 期望 0、实际 1,000 | `TASK-2423` |

---

## 6. 数据模型

> **本文新增 7 张表**（`api_case`、`api_scenario`、`api_scenario_step`、`api_mock_rule`、`api_data_set`、`api_test_run`、`api_test_report`），**与 impl-04 既有 20 张合计 27 张**（不含 impl-13 的知识库表；两篇同时落地时全库为 20 + 7 + 15 = **42 张**，其中 impl-13 为 13 张核心表 + 2 张辅助表，口径见 impl-13 §8）。
> 全部表统一包含 impl-04 §2 的 5 列（`id uuid PK default gen_random_uuid()`、`created_at`、`updated_at`、`deleted_at`、`version`），下文不再重复列出；表名/列名一律 `snake_case`；枚举落 `varchar` + `CHECK`（不建 PG ENUM）；时间一律 `timestamptz` 存 UTC。

### 6.1 `api_case`（接口自动化用例）

**用途**：承载 `data-ai-flow.ts` `API_CASES`（`AC-01`~`AC-16`），字段与 `ApiCaseDef` 逐字对齐（驼峰 → snake_case）。

| 字段 | 类型 | 约束 / 默认 | 对应 `ApiCaseDef` | 说明 |
|:---|:---|:---|:---|:---|
| `code` | `varchar(16)` | NOT NULL, UNIQUE | `id` | `AC-01` |
| `name` | `varchar(256)` | NOT NULL | `name` | 用例名 |
| `project_id` | `uuid` | NOT NULL, FK→`project.id` ON DELETE CASCADE | —（本文补） | 归属项目，与 `test_case.project_id` 同构 |
| `api_contract_id` | `varchar(16)` | NOT NULL, FK→`api_contract.code` | `apiContractId` | `API-01` |
| `method` | `varchar(8)` | NOT NULL, CHECK IN ('GET','POST','PUT','DELETE','PATCH') | `method` | 与契约 `method` 一致（`EVENT` 不建例，见 §2.4） |
| `path` | `varchar(256)` | NOT NULL | `path` | 必须与 `api_contract.path` 完全一致，由应用层校验 |
| `module_id` | `varchar(24)` | NOT NULL, FK→`test_module.code` | `moduleId` | `tm-create` 等 7 模块 |
| `case_type` | `varchar(8)` | NOT NULL, CHECK IN ('正向','异常','边界','幂等','并发','安全','性能') | `caseType` | 7 类 |
| `priority` | `varchar(8)` | NOT NULL, DEFAULT 'P1', CHECK IN ('P0','P1','P2') | `priority` | — |
| `source` | `varchar(16)` | NOT NULL, DEFAULT 'manual', CHECK IN ('ai-generated','imported','manual') | `source` | 与 `test_case.source` 的 `ai/human/import` **不同枚举**，见 §6.3 |
| `generated_by` | `varchar(24)` | NULL | `generatedBy` | `ag-test`；非 AI 生成为 NULL |
| `status` | `varchar(16)` | NOT NULL, DEFAULT 'draft', CHECK IN ('active','draft','deprecated','flaky') | `status` | `flaky` 为门禁隔离态（§4.8） |
| `last_run_status` | `varchar(16)` | NOT NULL, DEFAULT 'pending', CHECK IN ('passed','failed','blocked','skipped','pending') | `lastRunStatus` | — |
| `last_run_at` | `timestamptz` | NULL | `lastRunAt` | — |
| `avg_duration_ms` | `integer` | NOT NULL, DEFAULT 0 | `avgDurationMs` | — |
| `p95_duration_ms` | `integer` | NOT NULL, DEFAULT 0 | `p95DurationMs` | 最近秩法（§5.2 口径 3） |
| `pass_rate_pct` | `numeric(5,2)` | NOT NULL, DEFAULT 0 | `passRatePct` | = 通过次数 ÷ `run_count` |
| `run_count` | `integer` | NOT NULL, DEFAULT 0 | `runCount` | 参与的归档执行次数 |
| `assertion_count` | `integer` | NOT NULL, DEFAULT 0 | `assertionCount` | Σ = 86 |
| `steps` | `jsonb` | NOT NULL, DEFAULT '[]' | `steps[]` | `ApiCaseStepDef[]`：`{order,action,expect}` |
| `variables` | `text[]` | NOT NULL, DEFAULT '{}' | `variables[]` | 变量名清单 |
| `tags` | `text[]` | NOT NULL, DEFAULT '{}' | `tags[]` | 含 `REQ-24xx`、`BUG-10xx`、`ADS-*`、`MK-*` |
| `owner_id` | `uuid` | NULL, FK→`app_user.id` ON DELETE SET NULL | `owner` | 用例责任人 |
| `tone` | `varchar(16)` | NOT NULL, DEFAULT 'neutral' | `tone` | 12 值 `Tone`（前端归并见 impl-07 §4.1） |
| `description` | `text` | NULL | `desc` | — |

索引：`unique(code)`；`idx_api_case_contract(api_contract_id, status)`；`idx_api_case_module(module_id, case_type)`；`idx_api_case_source(source)`；`idx_api_case_status_flaky(status) WHERE status = 'flaky'`（部分索引，flaky 治理区专用）；`idx_api_case_project(project_id, priority)`。

示例行：
```json
{ "code": "AC-08", "name": "状态流转接口 P95 ≤ 200ms（审计流水改异步后回归）",
  "api_contract_id": "API-05", "method": "POST", "path": "/api/v2/orders/{orderNo}/state-transitions",
  "module_id": "tm-state", "case_type": "性能", "priority": "P1",
  "source": "ai-generated", "generated_by": "ag-test", "status": "flaky",
  "last_run_status": "passed", "avg_duration_ms": 58, "p95_duration_ms": 62,
  "pass_rate_pct": 75.00, "run_count": 4, "assertion_count": 3,
  "tags": ["性能", "REQ-2402", "BUG-1055", "flaky"], "owner_id": "u-meng", "tone": "warn" }
```

### 6.2 `api_scenario` / `api_scenario_step` / `api_mock_rule` / `api_data_set`

**`api_scenario`（场景编排，`AS-01`~`AS-05`）**

| 字段 | 类型 | 约束 / 默认 | 对应 `ApiScenarioDef` |
|:---|:---|:---|:---|
| `code` | `varchar(16)` | NOT NULL, UNIQUE | `id` |
| `project_id` | `uuid` | NOT NULL, FK→`project.id` ON DELETE CASCADE | —（本文补） |
| `name` | `varchar(256)` | NOT NULL | `name` |
| `description` | `text` | NULL | `desc` |
| `case_ids` | `varchar(16)[]` | NOT NULL, DEFAULT '{}' | `caseIds` |
| `step_count` | `smallint` | NOT NULL, DEFAULT 0 | `stepCount`（冗余列，由触发器与 `api_scenario_step` 计数保持一致） |
| `trigger_type` | `varchar(16)` | NOT NULL, CHECK IN ('manual','ci','schedule','event') | `triggerType` |
| `cron_expr` | `varchar(64)` | NOT NULL, DEFAULT '' | `cronExpr`（非 `schedule` 为空串） |
| `env_ids` | `varchar(24)[]` | NOT NULL, DEFAULT '{}' | `envIds` |
| `data_set_code` | `varchar(16)` | NULL, FK→`api_data_set.code` ON DELETE SET NULL | `dataDrivenSetId` |
| `timeout_sec` | `integer` | NOT NULL, DEFAULT 900 | `timeoutSec` |
| `retry_policy` | `jsonb` | NOT NULL, DEFAULT '{"maxAttempts":1,"backoffMs":0}' | `retryPolicy` |
| `status` | `varchar(16)` | NOT NULL, DEFAULT 'draft', CHECK IN ('active','draft','disabled') | `status` |
| `last_run_code` | `varchar(16)` | NULL | `lastRunId` |
| `last_run_status` | `varchar(16)` | NOT NULL, DEFAULT 'pending', CHECK IN ('passed','failed','blocked','skipped','pending') | `lastRunStatus` |
| `last_run_at` | `timestamptz` | NULL | `lastRunAt` |
| `avg_duration_ms` | `bigint` | NOT NULL, DEFAULT 0 | `avgDurationMs` |
| `pass_rate_pct` | `numeric(5,2)` | NOT NULL, DEFAULT 0 | `passRatePct` |
| `gate_ids` | `varchar(8)[]` | NOT NULL, DEFAULT '{}' | `gateIds` |
| `owner_id` | `uuid` | NULL, FK→`app_user.id` ON DELETE SET NULL | `owner` |
| `tone` | `varchar(16)` | NOT NULL, DEFAULT 'neutral' | `tone` |

索引：`unique(code)`；`idx_api_scenario_project(project_id, status)`；`idx_api_scenario_trigger(trigger_type, status)`；`idx_api_scenario_gate USING gin(gate_ids)`。

**`api_scenario_step`（场景步骤，`ASS-01`~`ASS-22`）**

| 字段 | 类型 | 约束 / 默认 | 对应 `ApiScenarioStepDef` |
|:---|:---|:---|:---|
| `code` | `varchar(16)` | NOT NULL, UNIQUE | `id` |
| `scenario_id` | `uuid` | NOT NULL, FK→`api_scenario.id` ON DELETE CASCADE | `scenarioId` |
| `seq` | `smallint` | NOT NULL | `order`（避开 SQL 保留字，与 `pipeline_stage.seq` 同名同义） |
| `case_id` | `uuid` | NOT NULL, FK→`api_case.id` ON DELETE CASCADE | `caseId` |
| `step_type` | `varchar(16)` | NOT NULL, CHECK IN ('request','assert','extract','wait','condition','loop') | `stepType`（6 值全部保留，含样本未出现的 `extract`，见 §3.2） |
| `name` | `varchar(256)` | NOT NULL | `name` |
| `extract_vars` | `jsonb` | NOT NULL, DEFAULT '[]' | `extractVars[]`：`{name,fromPath,toJsonPath}`，Σ = 10 |
| `assertions` | `jsonb` | NOT NULL, DEFAULT '[]' | `assertions[]`：`{type,expr,expected,onFail}`，Σ = 52 |
| `condition_expr` | `text` | NULL | `conditionExpr`（仅 `condition` 步骤非空） |
| `loop_over` | `varchar(128)` | NULL | `loopOver`（仅 `loop` 步骤非空，如 `ADS-02.rows[0..127]`） |
| `tone` | `varchar(16)` | NOT NULL, DEFAULT 'neutral' | `tone` |

索引：`unique(code)`；`unique(scenario_id, seq)`；`idx_api_step_case(case_id)`；`idx_api_step_type(step_type)`。

CHECK 补充（应用层触发器）：`step_type='condition'` 时 `condition_expr IS NOT NULL`；`step_type='loop'` 时 `loop_over IS NOT NULL`；其余 4 类时两列均须为 NULL。

**`api_mock_rule`（Mock 规则，`MK-01`~`MK-08`）**

| 字段 | 类型 | 约束 / 默认 | 对应 `MockRuleDef` |
|:---|:---|:---|:---|
| `code` | `varchar(16)` | NOT NULL, UNIQUE | `id` |
| `name` | `varchar(128)` | NOT NULL | `name` |
| `match_path` | `varchar(256)` | NOT NULL | `matchPath` |
| `match_method` | `varchar(8)` | NOT NULL, CHECK IN ('GET','POST','PUT','DELETE','PATCH','ANY') | `matchMethod` |
| `match_condition` | `text` | NOT NULL, DEFAULT '' | `matchCondition` |
| `response_type` | `varchar(16)` | NOT NULL, CHECK IN ('static','template','delay','error','dynamic-ai') | `responseType` |
| `response_template` | `jsonb` | NOT NULL | `responseTemplate`（源为 JSON 字符串，落库转 jsonb 以便校验 Schema） |
| `delay_ms` | `integer` | NULL | `delayMs` |
| `error_status` | `smallint` | NULL | `errorStatus` |
| `ai_dynamic_prompt` | `text` | NOT NULL, DEFAULT '' | `aiDynamicPrompt`（仅 `dynamic-ai` 非空） |
| `hit_count_30d` | `integer` | NOT NULL, DEFAULT 0 | `hitCount30d`（Σ = 46436） |
| `enabled` | `boolean` | NOT NULL, DEFAULT true | `enabled` |
| `env_ids` | `varchar(24)[]` | NOT NULL, DEFAULT '{}' | `envIds` |
| `created_by_id` | `uuid` | NULL, FK→`app_user.id` ON DELETE SET NULL | `createdBy`（`u-ai-copilot` 为系统账号，impl-08 §6.1） |
| `tone` | `varchar(16)` | NOT NULL, DEFAULT 'neutral' | `tone` |

索引：`unique(code)`；`idx_mock_match(match_path, match_method) WHERE enabled`；`idx_mock_type(response_type)`。
CHECK（触发器）：`response_type='delay'` → `delay_ms IS NOT NULL`；`response_type='error'` → `error_status IS NOT NULL`；`response_type='dynamic-ai'` → `ai_dynamic_prompt <> ''`。

**`api_data_set`（数据驱动集，`ADS-01`~`ADS-04`）**

| 字段 | 类型 | 约束 / 默认 | 对应 `DataSetDef` |
|:---|:---|:---|:---|
| `code` | `varchar(16)` | NOT NULL, UNIQUE | `id` |
| `name` | `varchar(128)` | NOT NULL | `name` |
| `source_type` | `varchar(24)` | NOT NULL, CHECK IN ('csv','database','ai-generated','production-sample') | `sourceType` |
| `row_count` | `integer` | NOT NULL, DEFAULT 0 | `rowCount`（Σ = 1234） |
| `columns` | `jsonb` | NOT NULL, DEFAULT '[]' | `columns[]`：`DataSetColumnDef{name,type,example,sensitive,maskRule}` |
| `production_sample_anonymized` | `boolean` | NOT NULL, DEFAULT false | `productionSampleAnonymized` |
| `generated_by` | `varchar(24)` | NOT NULL | `generatedBy`（`ag-test` 或 `u-*`） |
| `used_by_scenario_ids` | `varchar(16)[]` | NOT NULL, DEFAULT '{}' | `usedByScenarioIds` |
| `last_refreshed_at` | `timestamptz` | NULL | `lastRefreshedAt` |
| `tone` | `varchar(16)` | NOT NULL, DEFAULT 'neutral' | `tone` |
| `rows_uri` | `text` | NULL | —（本文补）数据行不落 PG，存对象存储（MinIO），此列为预签名对象键前缀；理由见下 |
| `mask_policy_version` | `varchar(32)` | NOT NULL, DEFAULT 'SEC-MASK-2.1' | —（本文补）脱敏策略版本，与 `ASS-22` 断言 `$.data.maskPolicyVersion == 'SEC-MASK-2.1'` 对齐 |

索引：`unique(code)`；`idx_data_set_source(source_type)`；`idx_data_set_scenario USING gin(used_by_scenario_ids)`。

> **决策：数据行不入 PG**。`ADS-03` 有 1000 行、`ADS-02` 有 128 行，行级数据属**测试夹具**而非业务实体；落 PG 会放大脱敏审计面（impl-08 §4.1「生产数据（DB 样例行）任何档位禁止出域」）。故只在 PG 存 `columns` 元数据（含 `sensitive`/`maskRule`），行数据存 MinIO 且桶策略禁止公网访问，执行器经预签名 URL（TTL ≤ 15 min，impl-08 §7.2）拉取。被否方案：行数据入 PG（脱敏审计面过大）。

### 6.3 `api_test_run` / `api_test_report`，以及 `api_case` 与 `test_case` 的关系

**`api_test_run`（执行记录，`AR-01`~`AR-08`）**

| 字段 | 类型 | 约束 / 默认 | 对应 `ApiTestRunDef` |
|:---|:---|:---|:---|
| `code` | `varchar(16)` | NOT NULL, UNIQUE | `id` |
| `scenario_id` | `uuid` | NULL, FK→`api_scenario.id` ON DELETE SET NULL | `scenarioId`（单用例执行为 NULL） |
| `case_ids` | `varchar(16)[]` | NOT NULL, DEFAULT '{}' | `caseIds` |
| `trigger_type` | `varchar(16)` | NOT NULL, CHECK IN ('manual','ci','schedule','event') | `triggerType` |
| `triggered_by` | `varchar(24)` | NOT NULL | `triggeredBy`（`userId` 或字面量 `'ci'`/`'schedule'`） |
| `env_id` | `varchar(24)` | NOT NULL | `envId` |
| `branch` | `varchar(128)` | NOT NULL | `branch` |
| `commit_sha` | `varchar(40)` | NOT NULL | `commitSha` |
| `build_id` | `uuid` | NULL, FK→`build.id` ON DELETE SET NULL | `pipelineRunId`（`PIPE-24xx` → `build.code` 反查） |
| `started_at` / `finished_at` | `timestamptz` | NOT NULL / NULL | `startedAt` / `finishedAt` |
| `duration_ms` | `bigint` | NOT NULL, DEFAULT 0 | `durationMs`（Σ = 4,314,000） |
| `total_cases` / `passed` / `failed` / `blocked` / `skipped` | `integer` | NOT NULL, DEFAULT 0 | 同名（Σ `total_cases` = 27、Σ `passed` = 19） |
| `pass_rate_pct` | `numeric(5,2)` | NOT NULL, DEFAULT 0 | `passRatePct` |
| `new_bugs_created` | `varchar(16)[]` | NOT NULL, DEFAULT '{}' | `newBugsCreated`（去重合计 7） |
| `coverage_pct` | `numeric(5,2)` | NOT NULL, DEFAULT 0 | `coveragePct`（断言覆盖率，非代码覆盖率） |
| `flaky_count` | `integer` | NOT NULL, DEFAULT 0 | `flakyCount`（Σ = 2） |
| `report_id` | `uuid` | NULL, FK→`api_test_report.id` ON DELETE SET NULL | `reportId` |
| `trace_id` | `varchar(64)` | NOT NULL | —（本文补）信封 `traceId`，与 `task_state_history`/`audit_log`/`model_call_log` 同源 |
| `tone` / `status_label` | `varchar(16)` / `varchar(256)` | NOT NULL | `tone` / `statusLabel` |

索引：`unique(code)`；`idx_api_run_scenario(scenario_id, started_at DESC)`；`idx_api_run_env(env_id, started_at DESC)`；`idx_api_run_build(build_id)`；`idx_api_run_report(report_id)`；`idx_api_run_trace(trace_id)`。
分区：`RANGE (started_at)` 按月，在线 6 个月，与 `test_execution` 同策略（impl-04 §6）。

**`api_test_report`（迭代报告，`AR-RPT-24`）**

| 字段 | 类型 | 约束 / 默认 | 对应 `ApiTestReportDef` |
|:---|:---|:---|:---|
| `code` | `varchar(24)` | NOT NULL, UNIQUE | `id`（`AR-RPT-24`） |
| `sprint_id` | `uuid` | NOT NULL, FK→`sprint.id` | `sprintId`（`SP-24`） |
| `generated_at` | `timestamptz` | NOT NULL | `generatedAt` |
| `generated_by` | `varchar(24)` | NOT NULL | `generatedBy`（`ag-test`） |
| `model_id` | `varchar(24)` | NOT NULL | `modelId`（`mdl-claude`） |
| `scope` | `jsonb` | NOT NULL | `{scenarios:5,cases:16,runs:8}` |
| `summary` | `jsonb` | NOT NULL | 8 项（§5.3） |
| `by_module` | `jsonb` | NOT NULL, DEFAULT '[]' | `ApiReportModuleStatDef[]`（7 行） |
| `by_type` | `jsonb` | NOT NULL, DEFAULT '[]' | `ApiReportTypeStatDef[]`（7 行） |
| `top_failures` | `jsonb` | NOT NULL, DEFAULT '[]' | `ApiReportTopFailureDef[]`（4 行） |
| `ai_insights` | `jsonb` | NOT NULL, DEFAULT '[]' | `string[]`（6 条） |
| `ai_recommended_actions` | `jsonb` | NOT NULL, DEFAULT '[]' | `ApiReportActionDef[]`（4 行） |
| `gate_impact` | `jsonb` | NOT NULL | `{gateId,pass,unmetCriteria[]}` |
| `token_cost` | `numeric(12,6)` | NOT NULL, DEFAULT 0 | `tokenCost`（4.86，美元） |
| `compare_with_prev_sprint` | `jsonb` | NOT NULL | `{passRateDelta,durationDelta,coverageDelta}` |
| `publish_status` | `varchar(16)` | NOT NULL, DEFAULT 'draft', CHECK IN ('draft','published','rejected') | —（本文补）签发态；`gateImpact.pass=false` 时禁止置 `published` |
| `published_at` / `published_by_id` | `timestamptz` / `uuid` | NULL | —（本文补）签发留痕，签发人须具备 `tester.approve`（impl-08 §6.2） |
| `trace_id` | `varchar(64)` | NOT NULL | —（本文补） |

索引：`unique(code)`；`idx_api_report_sprint(sprint_id, generated_at DESC)`；`idx_api_report_publish(publish_status)`。

**`api_case` 与既有 `test_case` 的关系（本文裁定：并列 + 弱交叉引用，不做继承、不做外键）**

| 比较项 | `test_case`（impl-04 §3.11） | `api_case`（本文 §6.1） |
|:---|:---|:---|
| 粒度 | 功能级（步骤为自然语言 `steps jsonb`） | 接口级（步骤含 `method`+`path`+断言表达式） |
| 层级归属 | `module_id`（脑图层级，可多级） | `module_id`（同一套 `tm-*`，扁平） |
| `source` 枚举 | `ai` / `human` / `import` | `ai-generated` / `imported` / `manual` |
| `type` 字段 | `功能` / `接口` / `性能` / `安全`（`varchar(24)`，可空） | `case_type`：7 类（NOT NULL） |
| 执行载体 | `test_execution`（挂 `test_plan_id`） | `api_test_run`（挂 `scenario_id`） |
| 编号前缀 | `TC-001`~`TC-020`（全量 248） | `AC-01`~`AC-16` |

**结论与理由**：

1. **不是子类型**：若做成 `test_case` 的子类型（`type='接口'` + 扩展表），则 `source` 枚举冲突（`ai` vs `ai-generated`）、执行载体冲突（`test_execution` vs `api_test_run`）、门禁归属冲突（`test_plan` 轮次 vs `api_scenario` 编排），需要三处兼容分支，得不偿失。
2. **不是扩展**：`api_case` 的 25 个业务列中只有 6 列与 `test_case` 语义重合（`code`/`title`/`priority`/`module_id`/`requirement_id`/`source`），重合度 < 25%，扩展会导致 `test_case` 表大量列为空。
3. **采并列**：两表同级，共用 `project_id`、`module_id`（`test_module`）、`requirement_id` 三个维度表，保证「按模块/按需求」的聚合报表可以 UNION 统计。
4. **交叉引用用弱关联**：`AC-01 ↔ TC-001`、`AC-10 ↔ TC-019`、`AC-12 ↔ TC-013` 的对应关系写在 `api_case.tags`（如 `['幂等','REQ-2401','P0','关键路径']`）与 `description`（「交叉引用功能用例 TC-001」）中，**不建外键**。理由：跨粒度多对多且生命周期不同（功能用例可先于契约存在），强外键会把 `test_case` 的删除级联到接口用例。
5. **迁移期不做数据搬迁**：既有 `test_case` 中 `type='接口'` 的行**保留原样**，由 `ag-test` 按契约重新生成 `api_case`；两侧并存一个迭代（`SP-24` → `SP-25`），`SP-25` 结束时按 `tags` 交叉引用做一次性对账，重复项在 `test_case` 侧标 `deprecated`。

**与既有表的外键关系全景**：

```
project 1─┬─* api_case *─1 api_contract（既有，data.ts API_CONTRACTS 14 份）
          │            └─1 test_module（既有，tm-* 7 模块）
          ├─* api_scenario 1─* api_scenario_step *─1 api_case
          │        └─?─1 api_data_set
          ├─* api_test_run ?─1 api_scenario
          │        ├─?─1 build（既有，经 pipelineRunId → PIPE-24xx）── * pipeline_stage（既有）
          │        └─*─0..n defect（既有，经 new_bugs_created → BUG-10xx，弱关联见下）
          ├─* api_test_report 1─* api_test_run
          │        └─?─1 sprint（既有，SP-24）
          └─* api_mock_rule（无外键，经 match_condition 逻辑关联 api_scenario_step）

既有测试域（并列，不合并）：
project 1─* test_case ─* test_execution *─1 test_plan（TP-01~TP-04）
```

| 父表 | 子表 | 外键 | 级联 | 理由 |
|:---|:---|:---|:---|:---|
| `api_scenario` | `api_scenario_step` | `scenario_id` | `ON DELETE CASCADE` | 步骤依附场景（同 `build`→`pipeline_stage`） |
| `api_case` | `api_scenario_step` | `case_id` | `ON DELETE CASCADE` | 用例删除即其编排步骤失效 |
| `api_data_set` | `api_scenario` | `data_set_code` | `ON DELETE SET NULL` | 数据集删除不应删场景，仅断驱动关系 |
| `api_test_report` | `api_test_run` | `report_id` | `ON DELETE SET NULL` | 报告重生成时执行记录须保留（审计需要） |
| `build` | `api_test_run` | `build_id` | `ON DELETE SET NULL` | 构建被清理后执行记录仍须可查 |
| `defect` ↔ `api_test_run` | — | **无外键**，用 `new_bugs_created varchar[]` | 应用层校验 | 多对多且跨域；`defect` 侧用 `ai_analysis.apiTestRunId` 反向溯源 |
| `api_contract` | `api_case` | `api_contract_id` | 无级联（`api_contract` 为受保护主数据） | 契约删除必须先归档，禁止级联删用例 |

**新增 7 张表的 DDL 骨架（示例：`api_scenario_step`）**：

```sql
-- 20260319_create_api_scenario_step_table.up.sql
CREATE TABLE IF NOT EXISTS api_scenario_step (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  code            varchar(16) NOT NULL,
  scenario_id     uuid        NOT NULL REFERENCES api_scenario(id) ON DELETE CASCADE,
  seq             smallint    NOT NULL,
  case_id         uuid        NOT NULL REFERENCES api_case(id) ON DELETE CASCADE,
  step_type       varchar(16) NOT NULL
    CHECK (step_type IN ('request','assert','extract','wait','condition','loop')),
  name            varchar(256) NOT NULL,
  extract_vars    jsonb       NOT NULL DEFAULT '[]',
  assertions      jsonb       NOT NULL DEFAULT '[]',
  condition_expr  text        NULL,
  loop_over       varchar(128) NULL,
  tone            varchar(16) NOT NULL DEFAULT 'neutral',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL,
  version         integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT uq_api_step_code UNIQUE (code),
  CONSTRAINT uq_api_scenario_seq UNIQUE (scenario_id, seq),
  CONSTRAINT ck_api_step_condition CHECK (
    (step_type = 'condition' AND condition_expr IS NOT NULL AND loop_over IS NULL) OR
    (step_type = 'loop'      AND loop_over IS NOT NULL AND condition_expr IS NULL) OR
    (step_type NOT IN ('condition','loop') AND condition_expr IS NULL AND loop_over IS NULL))
);
CREATE INDEX CONCURRENTLY idx_api_step_case ON api_scenario_step (case_id);
CREATE INDEX CONCURRENTLY idx_api_step_type ON api_scenario_step (step_type);
```

---

## 7. REST 接口与事件

### 7.1 接口清单（24 项 / 26 端点）

通用约定沿用 impl-01 §4：请求头 `Authorization: Bearer <accessToken>`、`X-Trace-Id: <32hex>`；响应统一包 `{ "code": 0, "data": {...}, "traceId": "..." }`；写操作携带 `expectedVersion`（乐观锁，冲突返回 `SDLC-*-409`）与 `idempotencyKey`（缺省取 `msgId`，impl-01 §6）。全部标注「本文补充」，即 impl-01 §4 未覆盖、按同一 `/api/v1/...` 风格补齐（与 impl-07 §3.1 的标注方式一致）。

**A. 用例域 `/api/v1/api-cases`（8 个）**

| # | 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:--:|:---|:---|:---|:---|:---|
| 1 | GET | `/api-cases?moduleId=&caseType=&source=&status=&priority=&q=&page=&size=` | — | `{ items:[ApiCase], total, page, stats:{total,aiCount,aiPct,active,draft,deprecated,flaky,assertionTotal,runTotal,runPassed,passRatePct} }` | `SDLC-APITEST-400` |
| 2 | GET | `/api-cases/{id}` | — | `ApiCase` 全字段 + `{ failDetail?:{expr,expected,actual,rootCause,bugId}, flakyDiagnosis?:{cause,evidence,action,gain} }` | `SDLC-APITEST-404` |
| 3 | POST | `/api-cases` | `{ name, apiContractId, method, path, moduleId, caseType, priority, source, steps[], variables[], tags[], ownerId }` | `{ id, code, status:'draft' }` | `SDLC-APITEST-422`（契约非 `frozen` 却请求 `active`）、`SDLC-APITEST-409` |
| 4 | PUT | `/api-cases/{id}` | `{ name?, priority?, steps?, tags?, ownerId?, expectedVersion }` | `ApiCase` | `SDLC-APITEST-409` |
| 5 | POST | `/api-cases/{id}/status` | `{ to:'active'\|'draft'\|'deprecated'\|'flaky', reason, expectedVersion }` | `{ from, to, at }` | `SDLC-APITEST-422`（`draft→active` 缺人工复核人）、`SDLC-AUTH-403` |
| 6 | POST | `/api-cases/generate` | `{ contractIds:[], goal?, coverageTargets?:['正向','异常',…] }` | `{ jobId, agentId:'ag-test', modelId:'mdl-deepseek', streamUrl:'/api/v1/ai/traces/{runId}/stream', draftCount }` | `SDLC-AGENT-503`、`SDLC-APITEST-422`（无 `frozen` 契约）、`SDLC-SEC-403` |
| 7 | POST | `/api-cases/import` | `{ format:'jmeter'\|'postman'\|'openapi', fileRef, contractId, fieldMapping }` | `{ jobId, parsed, warnings[] }` | `SDLC-APITEST-422`、`SDLC-SEC-413` |
| 8 | GET | `/api-cases/export?moduleId=&caseType=&format=json\|csv` | — | `{ fileRef, rows }` | `SDLC-APITEST-404` |

**B. 契约覆盖度域 `/api/v1/contract-coverage`（2 个）**

| # | 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:--:|:---|:---|:---|:---|:---|
| 9 | GET | `/contract-coverage?sprintId=` | — | `{ totalContracts:14, coveredContracts:10, coveragePct:71.4, byContract:[{contractId,name,method,path,status,caseCodes[],reason?}], uncovered:[…] }` | `SDLC-APITEST-400` |
| 10 | POST | `/contract-coverage/gap-cases` | `{ contractIds:[], dryRun:boolean }` | `{ jobId, planned:9, byCaseType:{正向:2,异常:3,边界:2,幂等:1,安全:1}, projectedCoveragePct:85.7 }` | `SDLC-APITEST-422`（含 `draft` 契约且未指定 `dryRun`）、`SDLC-AGENT-503` |

**C. 场景域 `/api/v1/api-scenarios`（5 个）**

| # | 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:--:|:---|:---|:---|:---|:---|
| 11 | GET | `/api-scenarios?status=&triggerType=&gateId=&envId=` | — | `{ items:[ApiScenario], stats:{active,draft,disabled,stepTotal:22,assertTotal:52} }` | `SDLC-APITEST-400` |
| 12 | GET | `/api-scenarios/{id}` | — | `ApiScenario` + `{ steps:[ApiScenarioStep], runs:[ApiTestRun], assertionStats:{byType:{status:9,jsonpath:26,db:12,duration:4,schema:1},byOnFail:{abort:43,continue:9,retry:0}} }` | `SDLC-APITEST-404` |
| 13 | POST | `/api-scenarios` | `{ name, desc, caseIds[], steps[], triggerType, cronExpr?, envIds[], dataSetCode?, timeoutSec, retryPolicy, gateIds[] }` | `{ id, code, status:'draft' }` | `SDLC-APITEST-422`、`SDLC-APITEST-409` |
| 14 | PUT | `/api-scenarios/{id}` | `{ …同上可选字段, expectedVersion }` | `ApiScenario` | `SDLC-APITEST-409` |
| 15 | POST | `/api-scenarios/{id}/validate` | `{ steps?[] }` | `{ ok:boolean, errors:[{stepCode,rule,message}], warnings:[…], vars:{declared[],used[],undeclared[]} }` | `SDLC-APITEST-422` |

`validate` 的 7 条编排校验规则（本文定义）：

| 规则 | 判定 | 失败级别 |
|:---|:---|:---|
| V-01 | `steps[].seq` 从 1 连续无缺口、无重复 | error |
| V-02 | `steps[].caseId` 必须 ∈ `scenario.caseIds` | error |
| V-03 | 断言中 `${ctx.xxx}` 引用的变量必须已在前序步骤的 `extractVars[].name` 中声明 | error |
| V-04 | `stepType='condition'` 须有 `conditionExpr`；`'loop'` 须有 `loopOver` 且指向存在的 `ADS-*` | error |
| V-05 | `stepType='loop'` 的 `loopOver` 行区间上界不得超过 `api_data_set.row_count - 1` | error |
| V-06 | `triggerType='schedule'` 须有合法 `cronExpr`（Quartz 六段式） | error |
| V-07 | 全场景 `status` 类断言占比 > 60% 且无 `db`/`schema` 断言 → 判定「弱断言」 | warning（记入 `aiInsights`） |

**D. 执行域 `/api/v1/api-runs`、`/api/v1/ci-callbacks`（4 个）**

| # | 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:--:|:---|:---|:---|:---|:---|
| 16 | POST | `/api-scenarios/{id}/execute` | `{ envId, triggerType:'manual'\|'ci'\|'event', branch, commitSha, buildId?, dataSetCode?, approvalId? }` | `{ runId, code:'AR-09', status:'queued', queuePosition }` | `SDLC-APITEST-409`（同场景已有运行中执行）、`SDLC-APITEST-503`、`SDLC-SEC-403`（`env-prod`） |
| 17 | POST | `/api-runs/{id}/cancel` | `{ reason, operatorId }` | `{ accepted:true, status:'cancelled' }` | `SDLC-APITEST-404`、`SDLC-APITEST-409`（已结束） |
| 18 | GET | `/api-runs?scenarioId=&triggerType=&envId=&range=&page=&size=` | — | `{ items:[ApiTestRun], total, aggregate:{runTotal,caseExecTotal:27,passedTotal:19,passRatePct:70.4,avgDurationMs:539250,p95DurationMs:918000,flakyTotal:2,flakyRate:7.4} }` | `SDLC-APITEST-400` |
| 19 | POST | `/ci-callbacks/apitest` | `{ provider:'hifox', buildId, scenarioCode, runCode, result:{totalCases,passed,failed,blocked,skipped,durationMs,coveragePct,flakyCount,failures[]}, newBugs[], signature }` | `{ accepted:true, runId, bugsCreated:[] }` | `SDLC-APITEST-422`（签名校验失败）、`SDLC-APITEST-409`（重复回调） |

> `/ci-callbacks/apitest` 的幂等：以 `dedup:webhook:hifox:{buildId}:{runCode}`（复用 impl-04 §5 的 `dedup:webhook:{providerId}:{eventId}` 模式，TTL 72h）去重；重复回调返回首次结果（`server.ack{status:'duplicate'}` 语义，impl-01 §6）。

**E. Mock 与数据集域（4 个）**

| # | 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:--:|:---|:---|:---|:---|:---|
| 20 | GET | `/api-mocks?responseType=&enabled=&envId=&q=` ／ PUT `/api-mocks/{id}` | `{ matchCondition?, responseTemplate?, delayMs?, errorStatus?, aiDynamicPrompt?, enabled?, expectedVersion }` | 列表：`{ items:[MockRule], stats:{byType:{static:2,template:2,delay:1,error:2,'dynamic-ai':1},hitTotal30d:46436} }`；PUT：`MockRule` | `SDLC-APITEST-400`、`SDLC-APITEST-409` |
| 21 | POST | `/api-mocks/{id}/trial` | `{ sampleRequest:{method,path,headers,body}, envId }` | `{ matched:boolean, responseStatus, responseBody, latencyMs, hitRuleId, degraded:boolean, modelId? }` | `SDLC-SEC-403`（`dynamic-ai` 在 `DENY` 档且 `mdl-local` 不可用）、`SDLC-APITEST-502` |
| 22 | GET | `/api-data-sets?sourceType=&q=` | — | `{ items:[DataSet], stats:{rowCountTotal:1234,productionSampleCount:2,anonymizedCount:2,sensitiveColumnCount:7} }` | `SDLC-APITEST-400` |
| 23 | POST | `/api-data-sets/{id}/mask-check` | `{ scope:'metadata'\|'sample-rows' }` | `{ ok:boolean, scannedRows, hits:[{column,ruleId,sample}], anonymized:boolean, maskPolicyVersion:'SEC-MASK-2.1' }` | `SDLC-SEC-403`、`SDLC-APITEST-422`（`production-sample` 未匿名化） |

**F. 报告域（1 个）**

| # | 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:--:|:---|:---|:---|:---|:---|
| 24 | GET `/api-reports/{id}` ／ POST `/api-reports/{id}/publish` | `{ approverId, comment?, expectedVersion }` | GET：`ApiTestReport` 全字段；POST：`{ publishStatus:'published', publishedAt, publishedBy, kbArchiveJobId }` | `SDLC-APITEST-404`、`SDLC-APITEST-422`（门禁预检不通过）、`SDLC-APITEST-403`（无 `tester.approve`） |

> 第 20 与第 24 项各含 2 个方法（GET+PUT / GET+POST），按「方法 + 路径」计数实际为 **26 个端点**；本表按**功能项**计 24 个，与 impl-01 §4 的分域表粒度一致。

### 7.2 错误码（本文定义，格式遵循 impl-01 §1「`SDLC-<DOMAIN>-<NNN>`」）

| 错误码 | HTTP | 含义 | 可重试 |
|:---|:---:|:---|:---:|
| `SDLC-APITEST-400` | 400 | 查询参数非法（`caseType`/`triggerType`/`responseType` 枚举外） | 否 |
| `SDLC-APITEST-403` | 403 | 无该操作权限（签发报告需 `tester.approve`，impl-08 §6.3） | 否 |
| `SDLC-APITEST-404` | 404 | 用例 / 场景 / 执行 / 报告 / Mock / 数据集不存在 | 否 |
| `SDLC-APITEST-409` | 409 | 乐观锁冲突，或同一场景已有运行中执行、CI 回调重复 | 是（重新拉取 / 幂等返回首次结果） |
| `SDLC-APITEST-422` | 422 | 业务守卫失败：契约非 `frozen` 却建 `active` 用例、编排校验 V-01~V-06（`error` 级；V-07 为 `warning` 不拦截）不通过、门禁未通过禁止签发、`production-sample` 未匿名化、回调签名校验失败 | 否 |
| `SDLC-APITEST-502` | 502 | hifox 执行器不可达（对齐 impl-01 `SDLC-INTG-502` 语义） | 是 |
| `SDLC-APITEST-503` | 503 | 执行器队列满或 hifox 日配额（9640）耗尽 | 是 |

复用既有错误码（不新增）：`SDLC-AUTH-403`（RBAC）、`SDLC-SEC-403`（出域禁止 / `dynamic-ai` 在 `DENY` 档）、`SDLC-SEC-413`（导入文件超上限）、`SDLC-AGENT-503`（`ag-test` 不可用）、`SDLC-AGENT-422`（输出 Schema 校验失败，impl-02 §7.1）、`SDLC-SYNC-409`（PingCode 建单冲突）、`SDLC-PIPE-403`（门禁 waive 无审批权）、`SDLC-TASK-409`（版本冲突）。

### 7.3 事件主题（8 个，本文定义）

命名遵循 impl-01 §1：`sdlc.<domain>.<event>`，`domain = apitest`，`event` 一律**下划线风格**（与 `sdlc.task.state_changed` 同构）。任务口径中的 `mock.hit` / `bug.created_from_test` 按此规范收敛为 `mock_hit` / `bug_created_from_test`，避免出现 4 段主题破坏 `sdlc.<domain>.<event>` 结构。

| # | 主题 | 发布时机 | 对应前端消息 `type`（impl-01 §3.2） | 消费组 | 幂等键 |
|:--:|:---|:---|:---|:---|:---|
| 1 | `sdlc.apitest.case_generated` | `ag-test` 产出用例草稿并落库 | `agent.result` | `stream:grp:console`、`stream:grp:kb` | `dedup:event:{msgId}` |
| 2 | `sdlc.apitest.scenario_triggered` | 场景被触发（4 种 `triggerType` 之一）入队 | `server.ack` | `stream:grp:apitest`、`stream:grp:console` | 同上 |
| 3 | `sdlc.apitest.run_started` | 执行器领取并开始执行 | `pipeline.stage_updated` | `stream:grp:console` | 同上 |
| 4 | `sdlc.apitest.run_completed` | 执行正常结束（含 `passed`/`failed` 结果） | `pipeline.stage_updated`、`gate.result` | `stream:grp:apitest`、`stream:grp:state`、`stream:grp:console`、`stream:grp:kb` | 同上 |
| 5 | `sdlc.apitest.run_failed` | 执行异常终止（超时 / 执行器崩溃 / 环境不可达） | `error` | `stream:grp:apitest`、`stream:grp:notify` | 同上 |
| 6 | `sdlc.apitest.report_published` | 迭代报告签发成功 | `gate.result` | `stream:grp:kb`、`stream:grp:notify`、`stream:grp:console` | 同上 |
| 7 | `sdlc.apitest.mock_hit` | Mock 规则被命中（按 `ruleId` 聚合，非逐次发布，见下） | — | `stream:grp:apitest` | `counter:mock:{ruleId}:{yyyymmdd}` |
| 8 | `sdlc.apitest.bug_created_from_test` | 执行失败自动开单后（先于 `sdlc.bug.created`） | `bug.created` | `stream:grp:sync`、`stream:grp:notify` | `dedup:event:{msgId}` + `external_id_map` 双唯一索引 |

> **`mock_hit` 的发布策略（本文裁定）**：`MK-01` 单条 30 日命中 18420 次，逐次发事件会把 `stream:sdlc.events`（`MAXLEN ~ 1e6`，impl-04 §5）在半天内冲垮。因此 `mock_hit` **按 (ruleId, 分钟) 聚合发布**，`payload.hitCount` 为该分钟内的命中数；实时计数走 Redis `counter:mock:{ruleId}:{yyyymmdd}`（INCR，TTL 8d，对齐 `counter:model:{modelId}:{yyyymmdd}` 命名）。

**payload 示例（3 条关键的，其余同构）**：

```json
// sdlc.apitest.run_completed
{
  "msgId": "0192f5c8-4a12-7d90-b3e7-2c8f1a6d9041",
  "type": "pipeline.stage_updated",
  "traceId": "9f2c1a7e4b8d4c6a9e0f3b2d1a5c8e73",
  "version": "1.0",
  "ts": "2026-03-19T17:58:32+08:00",
  "seq": 1048912,
  "payload": {
    "runCode": "AR-08", "scenarioCode": "AS-05", "pipelineRunId": "PIPE-2409",
    "envId": "env-staging", "branch": "test/order-idempotency-ut", "commitSha": "b60f2a5",
    "status": "failed", "durationMs": 842000,
    "totalCases": 4, "passed": 2, "failed": 2, "blocked": 0, "skipped": 0,
    "passRatePct": 50.0, "coveragePct": 78.3, "flakyCount": 0,
    "gateIds": ["G4", "G5", "G6"],
    "newBugsCreated": ["BUG-1052", "BUG-1054"],
    "failures": [
      { "caseCode": "AC-14", "expr": "response.status", "expected": "403", "actual": "200", "bugId": "BUG-1052" },
      { "caseCode": "AC-15", "expr": "csv.scan(...).hits", "expected": "0", "actual": "1000", "bugId": "BUG-1054" }
    ]
  }
}
```

```json
// sdlc.apitest.case_generated
{
  "msgId": "0192f5d1-7b33-7e12-8c55-1a2b3c4d5e60",
  "type": "agent.result",
  "traceId": "9f2c1a7e4b8d4c6a9e0f3b2d1a5c8e74",
  "payload": {
    "runId": "0192f5d1-7b33-7e12-8c55-1a2b3c4d5e5f",
    "agentId": "ag-test", "modelId": "mdl-deepseek", "routingRuleId": "rr-06",
    "status": "succeeded", "degraded": false,
    "contractId": "API-01", "draftCount": 9,
    "caseCodes": ["AC-AI-01", "AC-AI-02", "AC-AI-03", "AC-AI-04", "AC-AI-05", "AC-AI-06", "AC-AI-07", "AC-AI-08", "AC-AI-09"],
    "coverageMatrix": { "covered": ["正向", "异常", "边界", "幂等", "并发", "安全"], "missing": [{ "caseType": "性能", "reason": "契约未声明 P95 承诺，仅有 p99Ms=180，需人工确认压测阈值" }] },
    "assertionTotal": 47, "tokenIn": 9600, "tokenOut": 4180, "latencyMs": 46200,
    "needsHuman": true
  }
}
```

```json
// sdlc.apitest.report_published
{
  "msgId": "0192f5e2-9c44-7f23-9d66-2b3c4d5e6f71",
  "type": "gate.result",
  "traceId": "9f2c1a7e4b8d4c6a9e0f3b2d1a5c8e75",
  "payload": {
    "reportCode": "AR-RPT-24", "sprintId": "SP-24",
    "gateId": "G4", "status": "failed", "passRate": 70.4, "blocking": true,
    "evidence": ["api-cases:16", "api-scenarios:5", "api-runs:8", "coverage:71.4%"],
    "publishedBy": "u-he", "publishedAt": "2026-03-20T10:12:00+08:00",
    "kbArchive": { "ruleId": "KA-05", "spaceId": "KS-04", "docId": "KD-18", "trigger": "sdlc.testreport.published" }
  }
}
```

**其余 5 个主题的 payload 示例（同构四元组，仅列 `payload` 关键字段）**：

```json
// sdlc.apitest.scenario_triggered  type = server.ack
{ "msgId": "0192f5c1-…", "type": "server.ack", "traceId": "9f2c…8e76",
  "payload": { "scenarioCode": "AS-04", "runCode": "AR-07", "triggerType": "manual", "triggeredBy": "u-meng",
               "envId": "env-staging", "cronExpr": null, "queuePosition": 1, "lockKey": "lock:apitest:run:AS-04" } }

// sdlc.apitest.run_started  type = pipeline.stage_updated
{ "msgId": "0192f5c5-…", "type": "pipeline.stage_updated", "traceId": "9f2c…8e77",
  "payload": { "runCode": "AR-07", "scenarioCode": "AS-04", "pipelineRunId": "PIPE-2408", "stageId": "api-test",
               "status": "running", "startedAt": "2026-03-18T10:26:08+08:00", "caseIds": ["AC-12","AC-02","AC-08"],
               "dataSetCode": "ADS-03", "loopRows": 1000, "timeoutSec": 3600 } }

// sdlc.apitest.run_failed  type = error
{ "msgId": "0192f5c9-…", "type": "error", "traceId": "9f2c…8e78",
  "payload": { "code": "SDLC-APITEST-502", "retryable": true, "runCode": "AR-07", "scenarioCode": "AS-04",
               "failedAt": "step ASS-15", "reason": "hifox 执行器连接超时（env-staging 出口抖动）",
               "attempt": 1, "maxAttempts": 1, "nextAction": "转 q:apitest:retry 并通知 u-meng" } }

// sdlc.apitest.mock_hit  type = server.ack（按 ruleId + 分钟聚合，非逐次）
{ "msgId": "0192f5cd-…", "type": "server.ack", "traceId": "9f2c…8e79",
  "payload": { "ruleId": "MK-06", "responseType": "dynamic-ai", "windowStart": "2026-03-19T17:44:00+08:00",
               "hitCount": 37, "hitCount30d": 3186, "envIds": ["env-test"], "modelId": "mdl-deepseek",
               "egressPolicy": "MASK", "redacted": true, "schemaValid": true, "counterKey": "counter:mock:MK-06:20260319" } }

// sdlc.apitest.bug_created_from_test  type = bug.created（先于 sdlc.bug.created 发布，供 sync 组消费）
{ "msgId": "0192f5d0-…", "type": "bug.created", "traceId": "9f2c…8e7a",
  "payload": { "runCode": "AR-08", "scenarioCode": "AS-05", "caseCode": "AC-15", "contractId": "API-13",
               "bugCode": "BUG-1054", "priority": "P0", "slaPolicyId": "SLA-P0", "source": "auto_test",
               "assertionEvidence": { "expr": "csv.scan(${ctx.exportUrl}, sensitivePatterns).hits", "expected": "0", "actual": "1000" },
               "pingcodeSync": { "provider": "provider-pingcode", "entityType": "bug", "idempotencyKey": "AR-08:AC-15:BUG-1054" } } }
```

> 全部 8 个主题的 `msgId` 为 uuid v7、`traceId` 为 32 位 hex，`version`/`seq`/`ts` 为可选扩展（impl-01 §2.1）；`type` 均匹配 impl-01 §1 的 `^[a-z]+(\.[a-z_]+)+$`。

### 7.4 Redis 键（本文新增 6 个键模式 + 1 个消费组，其余复用 impl-04 §5 / impl-03 §7.1）

> **计数口径**：下表标注「本文新增」的共 7 行，其中 `stream:grp:apitest` 是在既有主通道 `stream:sdlc.events` 上 `XGROUP CREATE` 的**消费组**（不占新键），其余 **6 个为新增键模式**（`q:apitest:retry`、`q:apitest:dead`、`lock:apitest:run:{scenarioId}`、`cache:apitest:coverage:{sprintId}`、`cache:apitest:report:{reportId}`、`counter:mock:{ruleId}:{yyyymmdd}`）。`rl:hifox:{endpoint}` 复用 impl-04 §5 的 `rl:{scope}:{key}`，只换 `scope`，不计入新增。

| 键模式 | 数据结构 | TTL | 淘汰 | 用途 | 来源 |
|:---|:---|:---|:---|:---|:---|
| `stream:sdlc.events` | Stream | 无（`MAXLEN ~ 1e6`） | noeviction | 事件总线主通道 | impl-04 §5 |
| `stream:grp:apitest` | Consumer Group | 无 | noeviction | 接口自动化专属消费组：执行编排、Mock 命中聚合、回调落库 | **本文新增** |
| `q:apitest:retry` | ZSet（score = 下次重试时间戳） | 无 | noeviction | 执行/回调重试队列，退避 15/30/60/120/240s、`maxAttempts=5`（对齐 impl-03 §8.5） | **本文新增** |
| `q:apitest:dead` | List | 无 | noeviction | 死信队列，人工经控制台重放 | **本文新增** |
| `lock:apitest:run:{scenarioId}` | String（SET NX PX） | 30 min | noeviction | 同一场景执行串行化，防重复触发（对应 `SDLC-APITEST-409`） | **本文新增** |
| `cache:apitest:coverage:{sprintId}` | String(JSON) | 300 s | allkeys-lru | 契约覆盖度卡片缓存（14 份契约 × 16 用例的聚合） | **本文新增** |
| `cache:apitest:report:{reportId}` | String(JSON) | 600 s | allkeys-lru | 迭代报告快照（`AR-RPT-24` 全量 jsonb 较大） | **本文新增** |
| `counter:mock:{ruleId}:{yyyymmdd}` | String（INCR） | 8 d | volatile-lru | Mock 当日命中计数（`MK-01` 等 8 条） | **本文新增** |
| `rl:hifox:{endpoint}` | String（计数） | 60 s | volatile-lru | hifox 调用限流（复用 `rl:{scope}:{key}`，`scope='hifox'`） | impl-04 §5 |
| `dedup:event:{msgId}` | String | 24 h | volatile-lru | 事件去重 | impl-03 §7.1 |
| `dedup:webhook:hifox:{buildId}:{runCode}` | String | 72 h | volatile-lru | CI 回调去重（复用 `dedup:webhook:{providerId}:{eventId}` 模式） | impl-04 §5 |
| `idem:{clientId}:{key}` | String | 24 h | — | 写接口幂等 | impl-01 §6 |

**消费流程（沿用 impl-03 §7.2 的 `XREADGROUP`/`XACK` 语义）**：

```bash
XREADGROUP GROUP stream:grp:apitest consumer-{podId} COUNT 20 BLOCK 2000 STREAMS stream:sdlc.events >
XACK       stream:sdlc.events stream:grp:apitest {id}                 # 成功
ZADD       q:apitest:retry {now + backoff} {id}                       # 失败：15/30/60/120/240s，maxAttempts=5
RPUSH      q:apitest:dead {payload}                                   # 超过 maxAttempts → 死信
XPENDING   stream:sdlc.events stream:grp:apitest                      # 每 60s 巡检未 ACK
XAUTOCLAIM stream:sdlc.events stream:grp:apitest consumer-{podId} 300000 0-0   # 空闲 > 5 min 认领重投
```

> **为什么需要独立消费组 `stream:grp:apitest`**：接口自动化的执行编排是**长耗时**消费者（`AS-04` 超时 3600s、8 次执行均值 539s），若与 `stream:grp:sync`（要求秒级回写 PingCode）共用消费组，长任务会占满消费者槽位导致同步 PEL 堆积（impl-03 §9.2 告警阈值 `XPENDING > 500`）。独立消费组后两组各自维护 PEL 与 `maxAttempts`，互不阻塞。

---

## 8. 安全与合规（呼应 impl-08）

### 8.1 逐条呼应表

| impl-08 条目 | 本篇落地 | 校验点 |
|:---|:---|:---|
| §1 红线「最小化上传」 | 接口测试只上传**断言结果与结构化统计**，不上传完整响应体；失败现场（`FAIL_DETAIL`）只存 `expr`/`expected`/`actual`/`rootCause` 四字段，`actual` 长度截断至 512 字符 | CP-2（`api-gateway` 入站，2 MB / 5,000 行） |
| §1 红线「上下文脱敏」 | `api_data_set.columns[].maskRule` 必须指向存在的 `rd-*`；Mock `responseTemplate` 入库前过一遍脱敏引擎 | CP-3（脱敏中间件，fail-closed） |
| §1 红线「出网开关」 | `dynamic-ai` Mock 与 AI 生成用例均经 `model-gateway`；`DENY` 档强制 `mdl-local` | CP-4 / CP-5 |
| §1 红线「全程审计」 | §8.6 的 8 类必留痕动作写 `audit_log`（`category` 取 impl-08 §5.2 的 10 类规范值） | CP-6 |
| §2.1 三档策略 | §8.4 环境隔离矩阵 | — |
| §3.2 `rd-01`~`rd-08` | §8.2 数据集敏感列映射表 | — |
| §4.1 内容边界「生产数据（DB 样例行）任何档位禁止」 | `ADS-02`/`ADS-04` 的 `productionSampleAnonymized` 必须为 `true`；`api_data_set.rows_uri` 指向 MinIO 内网桶 | CP-2b |
| §5.4 必留痕事件清单 | §8.6 | — |
| §6.2 RBAC | §9.2 角色可见性矩阵；签发报告要求 `tester.approve` | `api-gateway` 服务端 |
| §8 合规清单 C-02/C-11 | `AC-11`/`AC-15` 是 C-11「个人信息最小化」的**可执行判定证据**；`AC-15` 的全文敏感模式扫描命中数为 0 即 C-02「出域内容可证明已脱敏」的抽样验证 | — |

### 8.2 生产样本匿名化与 `maskRule` ↔ `rd-*` 映射

**硬性规则**：`sourceType = 'production-sample'` 的数据集，`production_sample_anonymized` 必须为 `true` 才允许入库；否则 `POST /api-data-sets/{id}/mask-check` 返回 `SDLC-APITEST-422`。当前 `ADS-02`（`production-sample`，`true`）与 `ADS-04`（`csv` 但含生产字段样本，`true`）均已匿名化；`ADS-01`（`ai-generated`）与 `ADS-03`（`database`）为 `false`，因为前者无生产数据、后者的 `buyerId` 已按 `rd-02` 在列级脱敏。

**7 个敏感列 ↔ `redactRules` 逐条映射（源 `DataSetColumnDef.sensitive=true`）**：

| 数据集 | 列名 | `type` | 脱敏后 `example` | `maskRule` | `redactRules` 对应条目 | `strategy` | `hits` |
|:---|:---|:---|:---|:---|:---|:---|:--:|
| `ADS-02` | `buyerId` | string | `M2026****` | `rd-02` | 身份证号掩码（`field: buyerIdCard`） | 保留前 6 后 4 | 2140 |
| `ADS-03` | `buyerId` | string | `M20260001` | `rd-02` | 同上 | 保留前 6 后 4 | 2140 |
| `ADS-04` | `attackerToken` | string | `pc_live_****c88` | `rd-08` | 访问令牌全量替换（`field: apiToken`） | 全量替换仅留后缀 | 246 |
| `ADS-04` | `receiverPhone` | string | `138****6621` | `rd-01` | 手机号掩码 | 中间四位掩码 | 8642 |
| `ADS-04` | `receiverAddress` | string | `浙江省杭州市西湖区****` | `rd-03` | 收货地址脱敏 | 保留省市区，详细地址掩码 | 6218 |
| `ADS-04` | `receiverName` | string | `林**` | `rd-06` | 收货人姓名掩码 | 保留姓氏 | 5906 |

> **口径说明（如实记录）**：`ADS-02`/`ADS-03` 的 `buyerId` 标注 `maskRule: 'rd-02'`（身份证号掩码），而 `rd-02.field = 'buyerIdCard'`。`buyerId` 是会员号（`M20260001`）不是身份证号，二者语义不同；原型如此标注，本篇按「`maskRule` 是**策略引用**而非字段名匹配」解释：即 `buyerId` 采用与 `rd-02` 相同的「保留前 6 后 4」策略。落库时 `api_data_set.columns[].maskRule` 存 `rd-*` id，脱敏引擎按 `strategy` 执行而**不按 `field` 精确匹配**（impl-08 §3.1 的执行顺序为「① 结构化字段精确匹配 → ② 正则模式匹配 → ③ 高熵兜底」，此处走 ②）。另：`rd-05`（邮箱）、`rd-07`（金额区间）未被任何数据集列引用，但被断言引用——`ASS-20` 校验 `buyerEmail` 形如 `lin***@example.com`（`rd-05`），`rd-07` 用于报表侧金额模糊。

**元数据层也不得出现明文**：`DataSetColumnDef.example` 存的即脱敏后样例（`138****6621`、`浙江省杭州市西湖区****`、`林**`、`pc_live_****c88`），因为 `example` 会随 `GET /api-data-sets` 返回给所有具备 `view` 权限的角色，并可能被 `ag-test` 注入 Prompt 出域。

### 8.3 Mock 响应中不得出现真实客户数据

| 约束 | 落地 | 实证 |
|:---|:---|:---|
| 静态/模板响应必须是构造数据 | `MK-01` 的 `deductId: DK202603190001`、`MK-07` 的 `memberId: M20260001` 均为构造值，不含真实客户标识 | `MOCK_RULES[].responseTemplate` |
| 模板变量只允许引用请求体与内置函数 | `${body.tradeNo}`、`${body.amount}`、`${now.iso8601}`、`${uuid}`；**禁止** `${db.*}`（不得从生产库取值） | `MK-03`、`MK-04` |
| `dynamic-ai` 提示词必须显式禁止真实数据 | `MK-06.aiDynamicPrompt` 原文：「禁止输出真实活动名称与内部运营人员姓名，金额一律使用字符串 BigDecimal」 | `MK-06` |
| `dynamic-ai` 输出必须过脱敏引擎 | 生成结果在返回给被测服务前经 CP-3；命中 `rd-01`~`rd-09` 即掩码 | impl-08 §2.3 |
| 签名类字段必须是 mock 前缀 | `MK-03` 的 `sign: "mock-sign-${body.tradeNo}"`，避免误认为真实支付签名 | `MK-03` |
| 错误注入不得泄露内部拓扑 | `MK-08` 返回 ES 标准错误结构 `{"error":{"type":"search_phase_execution_exception",...}}`，不含节点 IP（`rd-09` 覆盖） | `MK-08` + impl-08 §3.3 |

### 8.4 测试环境隔离（源 `ENVIRONMENTS[].egressPolicyId`，与 impl-08 §2.1 逐字一致）

| 环境 | `id` | 出域策略 | 允许模型集 | 接口自动化可做 | **禁止** |
|:---|:---|:---|:---|:---|:---|
| 开发环境 | `env-dev` | `EGRESS-ALLOW`（`allowRawData=true`、`maxSecretLevel=L1`） | 全 5 模型 | `dynamic-ai` Mock 用任意模型；`AC-16` 迁移批次试跑（`AR-06`） | 生产数据、密钥（任何档位禁止，impl-08 §4.1） |
| 测试环境 | `env-test` | `EGRESS-MASK`（`allowRawData=false`、`maxSecretLevel=L2`） | 全 5 模型（出域前强制脱敏） | `AS-01`/`AS-02`/`AS-03` 主战场；`ADS-01`~`ADS-03` 驱动 | 原始 PII 与生产数据出域 |
| 预生产环境 | `env-staging` | **`EGRESS-DENY`**（`allowExternalModel=false`） | 仅 `mdl-local` | `AS-04` 性能基线（`ADS-03` 1000 行游标数据）、`AS-05` 安全红线；`AS-01` 的 staging 轮次 | 调用任何公有云模型；`dynamic-ai` Mock 走非本地模型 |
| 生产环境 | `env-prod` | **`EGRESS-DENY`** | 仅 `mdl-local` | **只读观测**（`ag-ba` 经 Prometheus/SkyWalking/Loki） | **禁止直连压测**；禁止任何写类接口用例；`POST /api-scenarios/{id}/execute` 传 `envId='env-prod'` 直接返回 `SDLC-SEC-403` |

**当前 8 次执行的环境分布核算**：`env-test` 4（`AR-01`/`AR-02`/`AR-03`/`AR-05`）、`env-staging` 3（`AR-04`/`AR-07`/`AR-08`）、`env-dev` 1（`AR-06`）、`env-prod` **0** ✓（符合「禁止直连压测」）。

**`env-staging` 的数据来源约束**：`ENVIRONMENTS[env-staging].dataSource = '生产脱敏副本（每日 02:00 同步，字段级 SM4 加密）'`、`dataMasked = true`。因此 `AS-04` 在 `env-staging` 跑 1000 行游标数据是合规的（数据已脱敏），但 `AS-04` 的 `dynamic-ai` 需求必须走 `mdl-local`。

### 8.5 出网管控：`DENY` 场景下 `dynamic-ai` Mock 必须走 `mdl-local`

```
POST /api/v1/api-mocks/MK-06/trial { envId: 'env-staging', ... }
   │
   ▼ api-gateway：解析 envId → ENVIRONMENTS[env-staging].egressPolicyId = 'EGRESS-DENY'
   │  CP-4 判定：mode=DENY 且目标模型 ≠ mdl-local → 强制改路由 mdl-local
   ▼ model-gateway：mdl-local（私有化 Llama3-70B，32K 上下文，0.001 元/1K tokens，禁止出域）
   │  ├─ 可用 → 生成响应 → CP-3 脱敏引擎（rd-01~rd-09）→ 返回
   │  └─ 不可用 → fail-closed：SDLC-SEC-403，trial 响应 degraded=true，
   │              执行器降级为 responseTemplate 的字面量（${ai.*} 占位符不展开）并记 warning
   ▼ audit_log：category='AI 调用'，detail 含 { ruleId:'MK-06', modelId:'mdl-local', egressPolicy:'DENY', redacted:true }
```

**关键设计取舍**：`MK-06` 的 `envIds = ['env-test']`——即**当前 `dynamic-ai` Mock 只在 `EGRESS-MASK` 环境启用**，从源头规避了 `DENY` 档的模型能力落差（`mdl-local` 32K 上下文 vs `mdl-qwen` 128K）。若未来要在 `env-staging` 启用 `dynamic-ai`，必须先在 `env-staging` 完成 `mdl-local` 的响应质量评测（impl-02 §10.3 的离线评测集机制），否则 `MK-06` 生成的互斥规则可能与真实营销中台行为偏差过大（§10 风险 R-04）。

### 8.6 审计埋点（8 类必留痕，`category` 取 impl-08 §5.2 的 10 类规范值）

| # | 动作 | `category` | `target_type` / `target_id` | `result` | `detail` 必填 |
|:--:|:---|:---|:---|:---|:---|
| 1 | AI 生成用例（`POST /api-cases/generate`） | `AI 调用` | `接口契约` / `API-01` | `success`/`failed` | `agentId`、`modelId`、`routingRuleId`、`tokenIn`/`tokenOut`、`redacted`、`egressPolicy` |
| 2 | 用例状态变更（`draft→active`、`active→flaky`） | `配置变更` | `接口用例` / `AC-08` | `success` | `from`/`to`、`reason`、复核人 |
| 3 | 场景执行触发（4 种 `triggerType`） | `质量门禁` | `接口场景` / `AS-05` | `success`/`denied` | `envId`、`triggeredBy`、`buildId`、`approvalId`（压测类） |
| 4 | 生产环境执行被拒 | `质量门禁` | `接口场景` / `AS-04` | **`denied`** | 校验点 `CP-4`、`reason='env-prod 禁止直连压测'` |
| 5 | Mock 试运行（`dynamic-ai`） | `AI 调用` | `Mock 规则` / `MK-06` | `success`/`denied` | `modelId`、`egressPolicy`、`redacted`、命中规则集合 |
| 6 | 数据集脱敏校验（`mask-check`） | `上传上下文` | `数据驱动集` / `ADS-04` | `success`/`denied` | `scannedRows`、`hits[{column,ruleId}]`、`maskPolicyVersion` |
| 7 | 缺陷自动开单 + PingCode 回写 | `外部同步` | `缺陷` / `BUG-1052` | `success`/`failed` | `apiTestRunId`、`externalCode`、`attempts` |
| 8 | 报告签发 / 门禁例外审批 | `发布审批` | `接口报告` / `AR-RPT-24` | `success`/`denied` | `gateId`、`gateImpact.pass`、`unmetCriteria.length`、`approverId` |

审计写入遵循 impl-08 §5.3：只追加、哈希链（`prev_hash` → `record_hash`）、按月分区、热 6 个月 / 温 12 个月 / 冷 3 年。

---

## 9. 三向映射、角色可见性与工时拆分

### 9.1 页面 ↔ 数据 ↔ 接口 ↔ 订阅 三向映射（列定义与 impl-07 §3.1 一致，可被其直接引用）

| pageId | 主要数据域（impl-04 表 + 本文新增表） | REST 接口 | 实时订阅主题 | 刷新策略 | 关键交互 |
|:---|:---|:---|:---|:---|:---|
| `api-test` | **新增**：`api_case`、`api_scenario`、`api_scenario_step`、`api_mock_rule`、`api_data_set`、`api_test_run`、`api_test_report`；**既有**：`api_contract`（`API_CONTRACTS` 14 份）、`test_module`（`tm-*` 7 模块）、`defect`（`BUG-1043`~`BUG-1055`）、`build`/`pipeline_stage`（`PIPE-2401`~`PIPE-2410`）、`gate`（G1~G6）、`requirement`（`REQ-2401`~`REQ-2408`）、`model_call_log`（`tokenCost`） | §7.1 的 24 项 / 26 端点，全部「本文补充」：`GET/POST/PUT /api-cases*`、`POST /api-cases/generate`、`GET /contract-coverage`、`POST /contract-coverage/gap-cases`、`GET/POST/PUT /api-scenarios*`、`POST /api-scenarios/{id}/validate`、`POST /api-scenarios/{id}/execute`、`POST /api-runs/{id}/cancel`、`GET /api-runs`、`POST /ci-callbacks/apitest`、`GET/PUT /api-mocks*`、`POST /api-mocks/{id}/trial`、`GET /api-data-sets`、`POST /api-data-sets/{id}/mask-check`、`GET /api-reports/{id}`、`POST /api-reports/{id}/publish`；复用 impl-01 §4.4 `GET /gates?stageId=`、§4.6 `POST /bugs`、§4.8 `GET /ai/traces` | `sdlc.apitest.*`（8 主题，§7.3）；`sdlc.gate.*`（G3/G4/G5/G6 判定）；`sdlc.bug.*`（自动开单回插）；`sdlc.pipeline.*`（`PIPE-24xx` 阶段变化）；`sdlc.agent.<runId>`（AI 生成用例/场景的流式产出） | 首屏拉取 6 个标签页各自的列表；`run_completed` 到达时只更新对应执行行与报告 `summary`（精准失效，impl-07 §5.5）；AI 生成走 SSE 逐条追加 `reasoning[]`/`steps[]`，`done:true` 后整块落草稿列表；执行中的 run 用 5s 轮询兜底（进度条） | ① 6 标签页：用例库 16 / 场景编排 5 / Mock 与数据集 12（8+4）/ 执行记录 8 / 测试报告 8 / hifox 能力与 CI 集成 6；② 用例详情抽屉展示 `steps` 与失败现场「期望 vs 实际」；③ 契约覆盖度条（14 格，实色=已建例、虚线灰=未建例）+「一键生成缺失用例」乐观新增；④ flaky 治理区的「采纳诊断 / 驳回」（采纳=duration 断言 `onFail` 改 `retry`）；⑤ 场景链路图（22 步按 6 种 `stepType` 手绘 SVG 形状）+ 步骤明细 + 断言质量分析（52 条）；⑥ Mock 试运行弹窗；⑦ 数据集列定义与脱敏规则抽屉；⑧ 报告页「签发报告」按钮在 `gateImpact.pass=false` 时禁用并给出 4 项缺失原因；⑨ AI 改进建议 4 条逐条采纳/驳回（右上角「已采纳 N / 4」）；⑩ 「AI 生成场景」弹窗（选契约 + 业务目标 → `ag-test` 输出 4 段 reasoning + 步骤草案 → 采纳为草稿场景 `AS-06`） |

**页面 `data-annotation-id` 清单（9 个，含页面根节点，供 `annotation-source.json` 与 impl-07 §9 校验）**：`ai-sdlc-api-test-page`、`ai-sdlc-api-test-case-metrics`、`ai-sdlc-api-test-case-table`、`ai-sdlc-api-test-contract-coverage`、`ai-sdlc-api-test-flaky`、`ai-sdlc-api-test-scenario-flow`、`ai-sdlc-api-test-mock-rules`、`ai-sdlc-api-test-run-table`、`ai-sdlc-api-test-report-gate`（与 `ApiTestPage.tsx` 逐行核对：8 个区块 + 1 个根节点）。

**主要卡片标题清单（20 个，按标签页归组）**：

| 标签页 | 卡片标题 |
|:---|:---|
| 用例库 | 接口自动化用例库 / 契约覆盖度分析 / flaky 用例治理区 |
| 场景编排 | 场景编排清单 / 场景链路图 · `AS-0x` / 步骤明细 · `AS-0x` / 断言质量分析（22 步全量）/ 场景通过率 |
| Mock 与数据集 | Mock 规则 / 数据驱动集 |
| 执行记录 | 归档执行记录 / 通过率与耗时趋势 / 用例结果构成 / CI 触发配置与门禁联动 |
| 测试报告 | 迭代级接口自动化报告 · `AR-RPT-24` / 模块维度统计 / 用例类型分布 / 高频失败项与 AI 建议 / AI 洞察 / AI 改进建议动作 |
| hifox 能力与 CI 集成 | 能力条目卡（`HFX-01`~`HFX-06`，含 `platformEquivalent` 与采纳率） |

### 9.2 7 角色 × 本页可见性（符号与 impl-07 §6.1 一致：`●` 完整可编辑 / `◐` 只读 / `○` 不可见）

| pageId | `manager` | `product` | `architect` | `developer` | `tester` | `ops` | `pmo` |
|:---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `api-test` | ◐ | ◐ | ◐ | ◐ | ● | ◐ | ◐ |

**权限细则（服务端为准，impl-08 §6.3）**：

| 角色 | 可见标签页 | 可执行动作 | 依据 |
|:---|:---|:---|:---|
| `tester`（测试工程师） | 全 6 个 | 用例 CRUD 与状态变更、场景编排与执行、Mock 与数据集维护、**报告签发**、缺陷验证 | `rbacMatrix.tester = { view:全部, edit:本域, approve:测试报告 }`；`SDLC_STAGES[st-test].ownerRoleId='tester'`；`GATES.G4.ownerRoleId='tester'` |
| `developer`（研发工程师） | 用例库、场景编排、执行记录、测试报告（只读） | 查看与自己任务相关的用例与失败现场；不可编辑用例 | `rbacMatrix.developer = { view:本域, edit:本域, approve:无 }`；`view=own` → 附加 `WHERE owner_id = :uid OR tags @> reqId` |
| `architect`（架构师） | 用例库、场景编排、测试报告 | 只读；「去架构设计页推动契约冻结」跳转 `design` | `aiRecommendedActions[3].ownerRoleId='architect'`（`API-03` 改造）、`[2]` 隐含契约冻结责任 |
| `product`（产品经理） | 用例库、测试报告 | 只读；接收 `aiRecommendedActions[3]`（为 `API-06`/`API-10` 补验收标准） | `aiRecommendedActions[3].ownerRoleId='product'` |
| `ops`（运维工程师） | 执行记录、Mock 与数据集、hifox 能力与 CI 集成 | CI 触发配置、环境隔离档位、Mock 启停；**门禁 waive** | `rbacMatrix.ops = { approve:发布审批, admin:本域 }`；`MK-08` 由 `u-meng`（SRE）创建 |
| `manager`（研发管理者） | 全 6 个 | 只读；发布审批与报告签发的**驳回权** | `TEST_REPORT.signOffs[1]`：林知远（`manager`）于 17:38 驳回 |
| `pmo`（项目经理 PMO） | 用例库、执行记录、测试报告 | 只读（`edit=readonly`，`PUT/POST` 返回 `SDLC-AUTH-403`） | `rbacMatrix.pmo.edit='只读'` |

> 与 impl-07 §6.1 的 `test` 行差异：`test` 页 `architect` 为 `○`（不可见），本页 `architect` 为 `◐`（只读）。理由：契约覆盖度直接指向架构师职责（`API_CONTRACTS[].reviewerId` 6 份为 `u-yan`），且 `aiRecommendedActions` 有 `ownerRoleId='architect'` 的动作项。

### 9.3 工时拆分（列定义与 impl-07 §7 一致；角色代号沿用 impl-09 §3.1）

| pageId | 页面 | 复杂度 | 前端人日 | 后端人日 | 联调人日 | 主要依赖 | 并行组 |
|:---|:---|:--:|:--:|:--:|:--:|:---|:--:|
| `api-test` | 接口自动化测试（6 标签页 · 20 卡片 · 22 步链路图 SVG · 5 抽屉/弹窗） | 极高 | 9 | 6 | 3 | impl-01 契约冻结（A 组）、`ag-test` Schema（impl-02 §3.6 + 本篇 §4.5）、hifox `HifoxProvider`、`stream:grp:apitest`、7 张新表迁移 | **E**（沿用 impl-07 §7.1 质量域，与 `test`/`bug`/`ai-observe` 同组） |
| — | 后端细分：`api_case`/`api_scenario`/`api_scenario_step` CRUD + 编排校验 V-01~V-07 | — | — | 2 | — | impl-04 §7 迁移规范 | E |
| — | 后端细分：执行编排 + hifox 适配 + CI 回调 + 幂等 | — | — | 2 | — | impl-05 Provider 抽象、impl-03 §7 Streams | E |
| — | 后端细分：报告聚合（8 项 summary + 7 模块 + 7 类型 + 门禁预检）+ 缺陷自动开单 | — | — | 2 | — | `GATES`、`defect`、`external_id_map` | E |
| — | AI 工程细分：`ag-test` 契约→用例 Prompt、Schema 校验、fallback 链（R7） | — | — | （计入 impl-02） | 1 | impl-02 §4/§6/§7 | E |
| **合计** | — | — | **9** | **6** | **3** | — | — |

**细分行的加总校验**（细分是对首行总量的拆解，不是追加）：

```
前端 9 = 首行整体计列（6 标签页 + 20 卡片 + 22 步链路图 SVG + 5 抽屉/弹窗，不再细拆）
后端 6 = 2（api_case / api_scenario / api_scenario_step CRUD + 编排校验 V-01~V-07）
       + 2（执行编排 + hifox 适配 + CI 回调 + 幂等）
       + 2（报告聚合 + 门禁预检 + 缺陷自动开单）
       = 6 ✓（AI 工程细分的后端工作量计入 impl-02，不重复计列）
联调 3 = 1（AI 工程：ag-test 契约→用例 Prompt、Schema 校验、fallback 链）
       + 1（hifox 执行器 ↔ CI 回调 ↔ stream:grp:apitest 端到端）
       + 1（G4 门禁联动 + 签发禁用 + 缺陷回写 PingCode 端到端）
       = 3 ✓
```

**合计 18 人日 ≈ 3.6 人周**，落在 impl-09 §3.2 的 P3 测试侧（4-6 周，R1 后端 6 人周 / R4 前端 6 人周 / R9 测试 6 人周）内；与 impl-07 §7 的 `test` 页（8+5+2 = 15 人日）同属 E 组，两页合计 33 人日，建议 1 名前端 + 1 名后端（R1）+ 0.5 名测试（R9）在 P3 内并行完成。

---

## 10. 验收清单与风险应对

### 10.1 验收清单（可勾选判定）

- [ ] §2.1 的 15 个 `provider-hifox` 字段与 `data-ai-flow.ts` `AI_TOOL_PROVIDERS[1]` 逐字一致（`version='hifox 3.8.1'`、`endpoint`、`authMode`、`slaUptimePct=99.9`、`avgLatencyMs=180`、`dailyCallCount=9640`）。
- [ ] §2.2 的 6 条能力（`HFX-01`~`HFX-06`）的 `avgDurationSec`（48/210/35/120/540/90）与 `adoptionRatePct`（91/84/79/86/93/88）与 `AI_TOOL_CAPABILITIES` 一致。
- [ ] §2.4 契约覆盖率可复算：`10 ÷ 14 = 71.4%`；未覆盖 4 份为 `API-06`/`API-10`（`draft`）与 `API-11`/`API-12`（`EVENT`）；补全后 `12 ÷ 14 = 85.7%`。
- [ ] §3.1 的 7 个分布核算全部成立：`Σ caseType = 16`、`Σ byModule.caseCount = 16`、`Σ assertionCount = 86`、`Σ runCount = 27`、AI 生成占比 `14 ÷ 16 = 87.5%`。
- [ ] §3.2 的 `Σ stepCount = 22` 与 `API_SCENARIO_STEPS.length` 相等；6 种 `stepType` 分布 `12+6+2+1+1+0 = 22`；`AS-01` 的 `passRatePct = 275 ÷ 3 = 91.7`、`avgDurationMs = 1372000 ÷ 3 = 457333`。
- [ ] §3.3 的断言分布 `9+26+12+4+1 = 52`、`onFail` 分布 `43+9+0 = 52`；`retry` 为 0 且文中给出「flaky 治理需引入 retry」的裁定。
- [ ] §3.4 的 `responseType` 分布 `2+2+1+2+1 = 8`；`Σ hitCount30d = 46436`；`MK-06` 的 `aiDynamicPrompt` 三条硬性规范可在代码评审中判定。
- [ ] §3.5 的 `Σ rowCount = 1234`；7 个敏感列的 `maskRule` 全部指向存在的 `rd-*`（`rd-01`/`rd-02`/`rd-03`/`rd-06`/`rd-08`）。
- [ ] §4.5 的输出 Schema 与 impl-02 §3.6 的 `ag-test` output 兼容（`apiCases` 为扩展字段，`additionalProperties:false` 仅在本文 Schema 内生效）。
- [ ] §5.2 的 6 个口径全部给出算式与代入值，且 `19 ÷ 27 = 70.4%`、`⌈0.95 × 8⌉ = 8 → 918000ms`、`4314000 ÷ 8 = 539250ms`、`2 ÷ 27 = 7.4%`、`7 ÷ 12 = 58.3%` 五项可独立复算。
- [ ] §5.3 的 `byModule`/`byType` 各 7 行的 `caseCount` 合计均为 16、`bugCount` 合计均为 7；`avgDurationMs` 的算术均值口径可复算（`tm-create = 181`、`tm-sec = 1271`）。
- [ ] §5.4 的禁用判据在前端（`ApiTestPage.tsx` 第 3310-3317 行）与服务端（`POST /api-reports/{id}/publish` 守卫）两处一致；4 条 `unmetCriteria` 各有明确解锁动作与责任人。
- [ ] §5.5 的 7 个自动开单缺陷可逐条追溯到「执行记录 → 用例 → 断言现场 → 修复任务」。
- [ ] §6 的 7 张表全部含 impl-04 §2 的 5 个通用列；枚举值 100% 可追溯到 `data-ai-flow.ts` 的 TS 联合类型；`api_case` 与 `test_case` 的关系有明确结论（并列 + 弱交叉引用）与 5 条理由。
- [ ] §7.1 的 24 项 / 26 端点全部挂在各域标题声明的 `/api/v1/` 前缀下（表内路径为相对写法，与 impl-01 §4 同风格），且每项含「方法 / 路径 / 请求体 / 响应体 / 错误码」五列；A 8 + B 2 + C 5 + D 4 + E 4 + F 1 = 24 可复核；无与 impl-01 §4 九个域重复的路径。
- [ ] §7.2 的 7 个新错误码符合 `SDLC-<DOMAIN>-<NNN>` 格式，`DOMAIN='APITEST'` 在既有 10 篇文档中未被占用。
- [ ] §7.3 的 8 个事件主题符合 `sdlc.<domain>.<event>` + 下划线风格；每个主题给出消费组与幂等键；`mock_hit` 的聚合发布策略有量化理由（18420 次/30 日）。
- [ ] §7.4 的 6 个新 Redis 键模式 + 1 个消费组符合 impl-04 §5 的 `{域}:{实体}:{标识}` 规范，TTL 非 `-1`（除 Stream/ZSet/List 队列键）；`stream:grp:apitest` 的独立性有长耗时消费者的论证。
- [ ] §8.1 的呼应表覆盖 impl-08 的 4 条红线、3 档策略、8 条脱敏规则、内容边界、RBAC 与合规清单 C-02/C-11。
- [ ] §8.4 的 8 次执行环境分布为 `env-test 4 / env-staging 3 / env-dev 1 / env-prod 0`，且 `env-prod` 直连压测返回 `SDLC-SEC-403` 可用接口测试验证。
- [ ] §8.5 的 `DENY` → `mdl-local` → fail-closed 链路与 impl-08 §2.3 的 CP-4/CP-5 一致。
- [ ] §9.1 的三向映射行列数与 impl-07 §3.1 一致（6 列），可被 impl-07 直接引用；9 个 `data-annotation-id` 与 `ApiTestPage.tsx` 实测一致。
- [ ] §9.2 的角色矩阵 7 格全部给出依据（`rbacMatrix` / `ownerRoleId` / `aiRecommendedActions.ownerRoleId`），并说明与 `test` 页 `architect` 格差异的理由。
- [ ] §9.3 工时合计 18 人日，与 impl-09 §3.2 P3 阶段的量级相容。
- [ ] §10.2 风险表 6 行均含「实证 / 影响 / 应对 / 责任角色 / 可观测信号」，其中 R-02 必须包含 `API-03` P95 双套口径与 cursor/offset 漂移两个实证。
- [ ] 全文无「待补充 / TBD / 略 / Lorem / 占位符」；术语一律「门禁」不写「卡点」；Agent 一律 `ag-xx` + 中文名并列。

### 10.2 风险与应对

| # | 风险 | 实证（本篇可追溯的真实数据） | 影响 | 应对 | 责任角色 | 可观测信号 |
|:--:|:---|:---|:---|:---|:---|:---|
| R-01 | **flaky 用例污染门禁**：抖动被误判为真实失败，反复阻断 G4；或被过度隔离导致真实缺陷失明 | `AC-08` 状态 `flaky`，`passRatePct=75`（4 次中 1 次失败），抖动区间 58~214ms、跨阈值概率约 7%；`flakyRate = 2 ÷ 27 = 7.4%`；`aiInsights[4]` 指出 2 次不稳定执行均由并发时序抖动引起 | G4 判定噪声上升；`AS-04` 的 918s 端到端耗时中含无效重试 | ① `status='flaky'` 不计入 G4 判据但仍执行留痕（§4.8）；② `duration` 断言 `onFail` 由 `continue` 改 `retry`（重试 2 次取**中位数**，非「任一通过」）；③ 压测场景绑定独占节点池 `node-perf-01~03`；④ **计数不豁免开单**：能定位到代码缺陷的失败仍按 §5.5 开单；⑤ 连续 10 次无翻转自动解除 `flaky` | `tester`（`u-he`） | `api_test_run.flaky_count` 趋势；`flakyRate ≤ 2%` 为达标线 |
| R-02 | **契约与实现漂移**（本迭代的头号质量风险，**已发生，非假设**） | **实证 A（P95 双套口径）**：`GATES.G4.actual[2]` 写「`API-03` P95 342ms（**基线 300ms**）✗」，而 `TEST_REPORT.perf.api03TargetMs = **200**`、`apiTestReport.gateImpact.unmetCriteria[2]` 写「`API-03` P95 342ms（**基线 200ms**，`AC-12` 失败）」、`TEST_CASES` 中 `TP-03` 的压测用例 `expected` 写「3000 TPS 下 P95 ≤ **200ms**」且 `actual` 写「P95 = 342ms（**超标 71%**）」、`BUG-1047.title` 写「违反 **200ms** 契约」、`TEST_REPORT.conclusion` 写「`API-03` P95 342ms **超契约 71%**」。核算：`342 ÷ 200 − 1 = 71.0%` ✓（与 200ms 自洽）；`342 ÷ 300 − 1 = 14.0%` ✗（与 300ms 矛盾）。**结论：200ms 是权威基线，`GATES.G4.actual[2]` 的「基线 300ms」为笔误**。<br>**实证 B（cursor vs offset）**：`API_CONTRACTS[API-03].changelog` 写「v2.0 分页由 offset 改为 cursor，深分页性能提升 6 倍」、`summary` 写「游标分页」、`KC-10` 切片写「自 v2.0 起废弃 offset 分页，改为游标分页」；而 `BUG-1047.rootCause` 写「深分页用 **OFFSET** 放大了扫描量」、`phenomenon` 写「慢 SQL Top1 为跨 8 个分片的 `count(*)` + `LIMIT 100000,20` 深分页」、`fixPlan` 写「**引入游标分页**（`lastId` + `lastCreatedAt`）**替代 OFFSET**」。即契约声称已改 cursor，实现仍是 offset。<br>**实证 C（G2 门禁自述失真）**：`GATES.G2.actual[0]` 写「`API-01`~`API-14` 全部 frozen，0 份 draft」，实测 9 frozen / 2 reviewing / 3 draft。<br>**实证 D（G3 阈值两套）**：`GATES.G3.criteria[1]` 写「需求级聚合分支覆盖率 ≥ **85%**」，而 `ApiTestPage.tsx` 第 3280 行写「聚合覆盖率 71.4% 未达 **80%** 基线」 | 门禁判定失去权威性；AI 生成的用例断言阈值可能取错基线（若取 300ms 则 `AC-12` 会「通过」，`BUG-1047` 不会被开出）；下游 12 个系统按契约适配 cursor 却拿到 offset 行为 | ① **单一事实源裁定**：性能基线以 `TEST_REPORT.perf.api03TargetMs` 为权威（200ms），门禁 `actual` 文本由生成器从结构化字段渲染，禁止手写；② 落库 `api_contract.sla_p95_ms` 结构化列，用例断言阈值只从该列取值，不解析自然语言；③ **契约一致性巡检**：每日 02:00 对 `frozen` 契约跑「声明 vs 实测」比对（`changelog` 声称的能力 vs `api_test_run` 的断言结果），漂移即发 `sdlc.apitest.run_failed` 级别的告警并开技术债；④ `API-03` 的 cursor 改造按 `aiRecommendedActions[2]` 拆为独立工作项，改造完成前在契约 `changelog` 追加「实现滞后」标注，避免下游误判；⑤ G2 的 `actual` 改为按 `API_CONTRACTS[].status` 计数自动生成 | `architect`（`u-yan`）+ `tester`（`u-he`）+ `product`（`u-su`） | 新增巡检指标 `sdlc_apitest_contract_drift_total{contractId}`；当前值应为 `API-03 = 1`、`G2 = 1`；目标 0 |
| R-03 | **生产样本泄露**：接口测试必然接触生产数据，一旦未匿名化即入 MinIO / 出域 | `ADS-02`（`production-sample`，128 行）与 `ADS-04`（42 行含 `receiverPhone`/`receiverAddress`/`receiverName`/`attackerToken`）；impl-08 §4.1 明确「生产数据（DB 样例行）任何档位禁止」；`BUG-1054` 正是导出通道脱敏漏网（`AC-15` 期望命中 0、实际 1,000） | 合规高危（`REQ-2408`）；触发 impl-08 C-11「个人信息最小化」不达标；监管风险 | ① `production_sample_anonymized=true` 为入库前置条件，否则 `SDLC-APITEST-422`；② 行数据不入 PG，只存 MinIO 内网桶 + 预签名 URL（TTL ≤ 15 min）；③ 列级 `maskRule` 强制引用 `rd-*`，`example` 也只存脱敏后样例；④ `POST /api-data-sets/{id}/mask-check` 支持 `scope='sample-rows'` 的定期扫描，命中即 P1 告警；⑤ `AC-15` 的「全文敏感模式扫描命中数必须为 0」纳入 G4 判据（`AS-05` 任一失败即阻断 `REL-2403`） | `ops`（`u-meng`）+ `tester`（`u-he`） | `redact_revert_check_total`（impl-08 §3.5）命中即 P1；`mask-check` 的 `hits[]` 长度须为 0 |
| R-04 | **Mock 与真实服务行为不一致**：Mock 通过而生产失败，形成「绿色幻觉」 | `HFX-03.adoptionRatePct = 79`（6 项能力中最低）；`MK-06` 为 `dynamic-ai`，生成结果依赖 `mdl-local`/`mdl-qwen` 的能力；`MK-04` 的 `warnCode: 'WMS_PROTOCOL_UNFROZEN'` 表明 WMS 协议本身未冻结；`MK-08` 的 ES 503 注入是**假设的降级路径**，真实 ES 的失败模式可能不同 | `AS-02`/`AS-03` 的通过结论不可外推到生产；`API-10` 拆单预演无法断言 | ① Mock 规则必须绑定**真实抓包样本**（`matchCondition` 来自真实请求特征），每季度用生产脱敏流量回放校验一次；② `dynamic-ai` 输出必须通过契约 Schema 校验（`MK-06` 绑定 `API-09` 的响应 Schema），不合规即丢弃并重生成；③ 每个 Mock 记录 `hitCount30d` 与「最近一次真实服务对拍时间」，超 90 天未对拍的 Mock 在报告中标注 `degraded`；④ 关键路径用例（`AC-01`/`AC-03`/`AC-09`）**至少每轮有一次不走 Mock** 的真实联调执行（`env-staging` 的真实库存中心）；⑤ 协议未冻结的下游（WMS）一律标 `draft`，不纳入门禁 | `tester`（`u-he`）+ `architect`（`u-yan`） | `mock_rule.last_replay_verified_at` 超期计数；`dynamic-ai` 的 Schema 校验失败率 |
| R-05 | **AI 生成用例断言过弱**：只断言 `status=200`，缺陷检不出 | 52 条步骤断言中 `schema` 仅 **1 条**（1.9%）、`duration` 仅 4 条（7.7%），`jsonpath` 占 26 条（50%）；页面 AI 建议正是「批量补齐 schema 断言」（驳回则「保持现有 52 条断言不变；缺口清单已记录到迭代报告 `aiInsights`」）；`AC-16` 为 `manual` 且 `assertionCount=5`、`status='draft'` | AI 生成占比 87.5% 的情况下，弱断言会让「通过率 70.4%」虚高；`AC-05` 若缺 `schema: string(decimal)` 断言，浮点实现会被判通过 | ① Prompt 层 `<assertion_policy>` 强制「每条用例 ≥ 3 条断言且覆盖 ≥ 2 种 type」（§4.2）；② 编排校验 V-07：`status` 类占比 > 60% 且无 `db`/`schema` → warning 并记入 `aiInsights`；③ 金额/数值类契约强制 `schema: string(decimal)` 断言（`BUG-1043` 的教训：浮点比较会掩盖 0.01 元尾差）；④ 幂等/并发类强制 `db` 断言（验证「无半提交、无重复流水」，`ASS-08`/`ASS-10` 即样板）；⑤ 人工检查点 3 逐条评审断言强度，采纳率纳入 `ag-test.acceptRate`（当前 74.8%，目标 ≥ 80%） | `tester`（`u-he`）+ AI 工程 R7 | `assertion_type_distribution` 中 `schema + db` 占比；当前 `(1+12) ÷ 52 = 25.0%`，目标 ≥ 40% |
| R-06 | **执行器长任务阻塞事件总线**：`AS-04` 超时 3600s，与秒级同步消费者争抢槽位 | 8 次执行均值 539s、最长 918s（`AR-07`）；`AS-04.timeoutSec = 3600`、`retryPolicy.maxAttempts = 1`（不允许重试，避免长任务叠加）；impl-03 §9.2 的 `XPENDING > 500` 告警阈值 | PingCode 回写延迟；`sdlc.bug.created` 堆积导致 SLA 计时失真（`SLA-P0` 要求 30 分钟内进入分析） | ① 独立消费组 `stream:grp:apitest`（§7.4 已论证）；② `lock:apitest:run:{scenarioId}`（PX 30 min）保证同场景串行、异场景并行；③ 性能类场景（`AS-04`）`maxAttempts=1` 且绑定独占节点池；④ 执行器侧设 `timeoutSec` 硬熔断，超时发 `sdlc.apitest.run_failed` 而非静默挂起；⑤ 监控 `q:apitest:dead` 长度须为 0 | `ops`（`u-meng`）+ 后端 R3 | `XPENDING stream:sdlc.events stream:grp:sync` ≤ 100；`q:apitest:dead` = 0；`lock:apitest:run:*` 持有时长 P95 |

---

## 变更记录

| 版本 | 日期 | 作者 | 变更说明 |
|:---|:---|:---|:---|
| v1.0 | 2026-03-19 | AI 研发协作平台实施文档组（`ag-test` 测试生成 Agent 起草，测试负责人 `u-he` 与架构师 `u-yan` 复核） | 首次发布。定义接口自动化中心（`api-test` 页）的 hifox 能力对标（`HFX-01`~`HFX-06`）、用例/场景/Mock/数据驱动领域模型（16 用例 / 5 场景 / 22 步骤 / 52 断言 / 8 Mock / 4 数据集）、`ag-test` 契约驱动生成设计（7 类覆盖策略 + 输出 Schema + fallback 链 + flaky 治理）、执行与报告链路（4 种触发 / 8 次归档执行 / `AR-RPT-24` 的 8 项 summary + 7 模块 + 7 类型 + G4 联动）、7 张新增表（与 impl-04 既有 20 张合计 27 张）、24 项 REST 接口（26 端点）、8 个事件主题、7 个新错误码（`SDLC-APITEST-*`）、6 个新 Redis 键模式 + 1 个消费组（`stream:grp:apitest`）、安全合规边界（生产样本匿名化 / 环境隔离 / `DENY` 档 `dynamic-ai` 走 `mdl-local`）、`api-test` 三向映射与 7 角色可见性、18 人日工时拆分、26 项验收清单与 6 条风险应对。如实登记 5 处既有数据不一致（R-02 实证 A `API-03` P95 双套基线 300ms/200ms、实证 B 契约声称 cursor 而实现为 offset、实证 C `GATES.G2.actual` 契约状态失真、实证 D G3 覆盖率阈值 85% 与 80% 两套；§8.2 `ADS-02`/`ADS-03` 的 `maskRule:'rd-02'` 与 `rd-02.field='buyerIdCard'` 语义不匹配），均只记录不修改源数据。 |
