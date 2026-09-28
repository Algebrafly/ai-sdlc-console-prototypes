/**
 * ============================================================
 * AI 研发协作控制台 · AI 能力流数据层（data-ai-flow.ts）
 * ------------------------------------------------------------
 * 本模块覆盖 4 个能力域，全部围绕唯一主线迭代 SP-24「订单中心重构」
 * （EPIC-ORDER-REF，2026-03-02 ~ 2026-03-27，PRD 基线版本 v2.3）展开：
 *
 *   0. 外部能力对标与端到端 AI 自动化编排（能力说明区块复用）
 *   1. AI 原型生成（PrototypePage 数据源）
 *   2. 接口自动化测试（ApiTestPage 数据源）
 *   3. 本地 IDE AI 结果同步（CodingPage 增强数据源）
 *   4. AI 管理增强：排期建议 / 工时预估 / 任务拆解（SchedulePage、DesignPage 增强）
 *
 * ------------------------------------------------------------
 * 三个外部能力对标关系（务必与页面文案保持一致）：
 *
 * 【对标 AxHub】原型生成能力对标 AxHub（Make 原型协作平台）。AxHub 是国产
 *   原型协作平台，具备 AI 生成页面结构、企业级组件库（axhub-lib）、锚点级
 *   批注评审、多人实时协同、以及 Make / Figma / HTML / Sketch 多格式导出能力。
 *   本平台的落地形态是「AI 原型工坊」：以 PRD 基线为输入，由 ag-pm / ag-arch
 *   驱动 7 步生成流水线，产物回写 AxHub 项目并在平台内完成批注闭环。
 *
 * 【对标 hifox】接口自动化能力对标 hifox（API 测试平台）。hifox 具备接口用例
 *   编排、场景链（多接口串联 + 变量提取 + 断言）、Mock 服务、数据驱动、
 *   多层断言、CI 集成与测试报告能力。本平台的落地形态是「接口自动化中心」：
 *   以 API_CONTRACTS 冻结契约为输入，由 ag-test 生成用例并编排场景，
 *   经 Jenkins 触发后与 G3 / G4 / G5 / G6 门禁联动，报告归档并回灌知识库。
 *
 * 【对标 VS Code / JetBrains 插件】本地 IDE AI 结果同步能力对标 VS Code 与
 *   JetBrains 两大 IDE 生态的官方插件形态：在开发者本地 IDE 内完成 AI 编码，
 *   再把会话、Diff、单测结果、覆盖率、上下文切片等产物按最小化原则同步回平台，
 *   并支持离线队列、冲突三方合并与出网脱敏管控（对齐 data.ts 的 egressPolicy
 *   与 redactRules）。
 *
 * 另登记 WeKnora（知识库检索增强）的集成元信息，其业务数据由 data-kb.ts 提供，
 * 本模块不展开。
 *
 * ------------------------------------------------------------
 * 自洽性口径（改动数据时请一并核对）：
 *   · 所有外键 id（API-*、TASK-*、CS-*、BUG-*、PIPE-*、PRD-ORD-*、tm-*、G*、
 *     env-*、ag-*、mdl-*、u-*、REQ-*）均取自 ./data 的真实记录。
 *   · 原型任务 progress = 7 步加权进度，步骤权重固定为 8/12/30/18/14/12/6（合计 100）。
 *   · 接口用例 avgDurationMs 与所属契约的 p99Ms 同量级；apiTestReport 的汇总值
 *     由 API_TEST_RUNS 的 8 次归档执行逐条累加得出（口径见各字段注释）。
 *   · 工时预估：pert = (optimistic + 4 × mostLikely + pessimistic) / 6；
 *     variancePct = (aiEstimateHours − pert) / pert × 100；
 *     aiEstimateHours = Σ featureWeights[].contribution（权重合计恒为 1.00）。
 *   · IDE 同步 metrics：totalLinesChanged = aiAcceptedLines + manualLines；
 *     acceptRatePct = aiAcceptedLines / (aiAcceptedLines + aiRejectedLines) × 100。
 *   · 任务拆解：totalPoints = Σ suggestedTasks[].points；
 *     aiDeltaPoints = totalPoints − humanTotalPoints；
 *     criticalPathPoints = Σ criticalPathOrders 上各子任务的 points。
 * ============================================================
 */

import { TODAY, USER_MAP, USERS } from './data';
import type { Executor, Tone, UserDef } from './data';

/* ==== 0. 外部能力对标与端到端 AI 自动化编排 ==== */

/**
 * 本模块数据快照日期，直接复用 data.ts 的 TODAY（2026-03-19），避免日期漂移。
 */
export const AI_FLOW_TODAY: string = TODAY;

/**
 * 本模块责任人清单：由 data.ts 的 USERS 派生（含 AI 共享账号 u-ai-copilot），
 * 供原型工坊 / 接口自动化 / IDE 同步 / AI 排期四个页面渲染责任人下拉与头像。
 */
export const AI_FLOW_OWNERS: { id: string; name: string; title: string; roleId: string; isAi: boolean }[] =
  USERS.map((u) => ({
    id: u.id,
    name: USER_MAP[u.id].name,
    title: u.title,
    roleId: u.roleId,
    isAi: u.isAi === true,
  }));

/** 外部 AI 能力提供方（对标产品）集成元信息 */
export interface AiToolProviderDef {
  id: string;
  /** 对标产品名 */
  name: string;
  /** 厂商 / 产品定位一句话 */
  vendor: string;
  /** 能力域类型 */
  kind: 'prototype' | 'api-test' | 'knowledge';
  /** 对接版本 */
  version: string;
  endpoint: string;
  protocol: 'REST' | 'gRPC' | 'MCP' | 'SDK';
  /** 鉴权方式 */
  authMode: string;
  status: 'connected' | 'paused' | 'unplugged';
  connectedAt: string;
  /** 能力名清单 */
  capabilities: string[];
  /** 挂载的 SDLC 环节 id（st-req ~ st-observe） */
  sdStageIds: string[];
  /** 调用该提供方的 Agent id */
  agentIds: string[];
  /** SLA 可用率承诺（%） */
  slaUptimePct: number;
  avgLatencyMs: number;
  dailyCallCount: number;
  docsUrl: string;
  note: string;
  tone: Tone;
}

/**
 * 3 个外部 AI 能力提供方：AxHub（原型协作，对标 AI 原型工坊）、
 * hifox（API 测试，对标接口自动化中心）、WeKnora（知识库检索增强，
 * 仅登记集成元信息，业务数据见 data-kb.ts）。
 */
export const AI_TOOL_PROVIDERS: AiToolProviderDef[] = [
  {
    id: 'provider-axhub',
    name: 'AxHub Make',
    vendor: 'AxHub · Make 原型协作平台（AI 生成页面结构 / 企业组件库 / 批注评审 / 多人协同 / 多格式导出）',
    kind: 'prototype',
    version: 'Make 5.4.2',
    endpoint: 'https://axhub.intra.example.com/api/v1',
    protocol: 'REST',
    authMode: 'OAuth2 授权码 + 项目级 Token',
    status: 'connected',
    connectedAt: '2026-01-14 10:20',
    capabilities: [
      'AI 生成页面结构',
      'axhub-lib 组件库检索与映射',
      '交互流与状态机可视化编排',
      '锚点级批注评审',
      '多人实时协同',
      'Make / Figma / HTML / Sketch 导出',
    ],
    sdStageIds: ['st-req', 'st-arch'],
    agentIds: ['ag-pm', 'ag-arch'],
    slaUptimePct: 99.5,
    avgLatencyMs: 420,
    dailyCallCount: 1860,
    docsUrl: 'https://axhub.intra.example.com/docs/openapi',
    note: '本平台「AI 原型工坊」的对标产品。原型任务生成完成后回写 AxHub 项目（AXH-PRJ-*），批注锚点与版本快照双向同步，导出产物直接作为 G1 需求门禁的评审证据。',
    tone: 'brand',
  },
  {
    id: 'provider-hifox',
    name: 'hifox',
    vendor: 'hifox · API 测试平台（用例编排 / 场景链 / Mock / 数据驱动 / 断言 / CI 集成 / 报告）',
    kind: 'api-test',
    version: 'hifox 3.8.1',
    endpoint: 'https://hifox.intra.example.com/openapi/v3',
    protocol: 'REST',
    authMode: 'API Key + IP 白名单（10.24.0.0/16）',
    status: 'connected',
    connectedAt: '2026-01-22 15:40',
    capabilities: [
      '契约导入与用例生成',
      '场景链编排与变量提取',
      '多层断言（状态码 / JSONPath / Schema / 耗时 / DB）',
      'Mock 服务（静态 / 模板 / 延迟 / 错误 / AI 动态）',
      '数据驱动与生产样本脱敏回放',
      'CI 集成与测试报告',
    ],
    sdStageIds: ['st-arch', 'st-code', 'st-test', 'st-deploy'],
    agentIds: ['ag-test', 'ag-review', 'ag-ops'],
    slaUptimePct: 99.9,
    avgLatencyMs: 180,
    dailyCallCount: 9640,
    docsUrl: 'https://hifox.intra.example.com/docs/openapi-v3',
    note: '本平台「接口自动化中心」的对标产品。执行器部署在 Jenkins 侧（平台自有集成，不属于 AI_TOOL_PROVIDERS 登记的三方 AI 能力），场景结果按 G3 / G4 / G5 / G6 门禁口径回写，报告归档后自动入知识库供 ag-test 检索复用。',
    tone: 'teal',
  },
  {
    id: 'provider-weknora',
    name: 'WeKnora',
    vendor: '腾讯开源 · 企业知识库检索增强引擎（文档解析 / 向量检索 / 引用溯源 / 归档）',
    kind: 'knowledge',
    version: 'WeKnora 1.4.2',
    endpoint: 'https://weknora.intra.example.com/api/v1',
    protocol: 'REST',
    authMode: 'mTLS 双向证书 + OIDC（飞书 SSO 联邦）',
    status: 'connected',
    connectedAt: '2026-01-06 10:20',
    capabilities: ['文档解析与切片', '向量 + 关键词混合检索', '引用溯源', 'AI 产物自动归档', '知识条目生命周期管理'],
    sdStageIds: ['st-req', 'st-arch', 'st-code', 'st-test', 'st-observe'],
    agentIds: ['ag-pm', 'ag-arch', 'ag-code', 'ag-review', 'ag-test', 'ag-ops', 'ag-ba'],
    slaUptimePct: 99.95,
    avgLatencyMs: 268,
    dailyCallCount: 14280,
    docsUrl: 'https://github.com/Tencent/WeKnora',
    note: '本模块仅登记集成元信息（连接状态、协议、调用量、挂载环节），知识库引擎实例、条目、检索命中与归档流水等业务数据由 data-kb.ts 的 KB_ENGINE / KB_DOCS 等提供，本文件不展开。此处 version / endpoint / protocol / authMode / connectedAt / slaUptimePct / avgLatencyMs / docsUrl 八字段与 KB_ENGINE 保持逐值一致，避免跨页对照出现两套口径。所有 AI 自动化编排流的末步均以其为归档终点。',
    tone: 'ai',
  },
];

/** 外部能力条目（对标产品的单项能力 → 本平台落地能力映射） */
export interface AiToolCapabilityDef {
  id: string;
  /** 归属提供方 id */
  providerId: string;
  name: string;
  /** 具体到操作与产物的能力描述 */
  desc: string;
  /** 输入产物 */
  inputArtifacts: string[];
  /** 输出产物 */
  outputArtifacts: string[];
  /** 主责 Agent id */
  aiAgentId: string;
  automationLevel: 'full' | 'assisted' | 'manual';
  /** 单次平均耗时（秒） */
  avgDurationSec: number;
  /** 团队采纳率（%） */
  adoptionRatePct: number;
  /** 本平台对应的落地能力名 */
  platformEquivalent: string;
  tone: Tone;
}

/**
 * 12 条外部能力条目：AxHub 6 条（AXHUB-01~06）+ hifox 6 条（HFX-01~06）。
 * 每条都给出「对标能力 → 本平台落地能力」的映射，供三个页面的能力说明区块直接渲染。
 */
export const AI_TOOL_CAPABILITIES: AiToolCapabilityDef[] = [
  {
    id: 'AXHUB-01',
    providerId: 'provider-axhub',
    name: '需求文档解析与信息架构抽取',
    desc: '把 PRD 基线文档按语义块切分，识别需求条目、用户故事与验收标准，抽取实体关系与字段字典，产出可驱动页面生成的信息架构树（导航层级 + 页面清单）。',
    inputArtifacts: ['PRD 基线文档（PRD-ORD-v2.3）', '需求列表（REQ-2401~2408）', '业务术语表'],
    outputArtifacts: ['prd-parse-tree.json', 'ia-nav-tree.json', 'entity-dict.json'],
    aiAgentId: 'ag-pm',
    automationLevel: 'full',
    avgDurationSec: 96,
    adoptionRatePct: 88,
    platformEquivalent: 'AI 原型工坊 · 需求解析器（步骤 1~2）',
    tone: 'brand',
  },
  {
    id: 'AXHUB-02',
    providerId: 'provider-axhub',
    name: '页面结构自动生成（低保真 → 高保真）',
    desc: '按信息架构树逐页生成栅格骨架与区块布局，支持 1440 / 834 / 390 三断点，一次产出低保真线框并可一键升级为高保真视觉稿。',
    inputArtifacts: ['ia-nav-tree.json', '页面优先级（P0/P1/P2）', '断点与设备目标'],
    outputArtifacts: ['*.make 页面文件', 'layout-grid.json', '低保真预览 PNG'],
    aiAgentId: 'ag-arch',
    automationLevel: 'full',
    avgDurationSec: 620,
    adoptionRatePct: 82,
    platformEquivalent: 'AI 原型工坊 · 页面结构生成（步骤 3）',
    tone: 'brand',
  },
  {
    id: 'AXHUB-03',
    providerId: 'provider-axhub',
    name: '组件库检索与智能映射',
    desc: '在企业组件库 axhub-lib 中按语义检索候选组件，给出映射置信度与变体建议；库内缺失时自动派生新组件并回写为自定义组件，附带 props 契约。',
    inputArtifacts: ['layout-grid.json', 'axhub-lib 5.4.2 组件索引', '设计 token v3'],
    outputArtifacts: ['component-map.json', '自定义组件 props 契约', '组件复用矩阵'],
    aiAgentId: 'ag-arch',
    automationLevel: 'assisted',
    avgDurationSec: 340,
    adoptionRatePct: 76,
    platformEquivalent: 'AI 原型工坊 · 组件选型与映射（步骤 4）',
    tone: 'info',
  },
  {
    id: 'AXHUB-04',
    providerId: 'provider-axhub',
    name: '交互流与状态机可视化编排',
    desc: '把验收标准中的 Given-When-Then 转成页面间交互流与业务状态机，自动补齐非法流转分支与异常态，输出可在原型内点击走查的交互图。',
    inputArtifacts: ['验收标准（GWT）', '订单状态机定义（10 态 42 条流转边）', '页面清单'],
    outputArtifacts: ['interaction-flow.json', 'order-state-machine.svg', '异常分支清单'],
    aiAgentId: 'ag-pm',
    automationLevel: 'assisted',
    avgDurationSec: 260,
    adoptionRatePct: 71,
    platformEquivalent: 'AI 原型工坊 · 交互流与状态机（步骤 5）',
    tone: 'info',
  },
  {
    id: 'AXHUB-05',
    providerId: 'provider-axhub',
    name: '锚点级批注评审与多人协同',
    desc: '在原型任意界面元素上打批注锚点，支持建议 / 问题 / 阻断 / 确认四类，多角色并行评审，AI 对每条批注给出回应与可执行的修改方案并生成新版本。',
    inputArtifacts: ['*.make 页面文件', '批注锚点', '评审人角色矩阵'],
    outputArtifacts: ['批注清单', 'AI 回应与修改方案', '原型新版本快照'],
    aiAgentId: 'ag-pm',
    automationLevel: 'assisted',
    avgDurationSec: 180,
    adoptionRatePct: 94,
    platformEquivalent: 'AI 原型工坊 · 批注评审闭环（步骤 7）',
    tone: 'teal',
  },
  {
    id: 'AXHUB-06',
    providerId: 'provider-axhub',
    name: '多格式导出与研发交付',
    desc: '一键导出 Make / Figma / HTML / Sketch 四种格式，附带组件清单、交互说明与切图资源，导出包可直接作为 G1 需求门禁与 G2 架构门禁的评审证据归档。',
    inputArtifacts: ['已批准原型版本', '组件清单', '设计 token'],
    outputArtifacts: ['export-manifest.json', 'HTML 走查包', 'Figma 库', '门禁证据附件'],
    aiAgentId: 'ag-arch',
    automationLevel: 'full',
    avgDurationSec: 72,
    adoptionRatePct: 89,
    platformEquivalent: 'AI 原型工坊 · 产出与批注锚点（步骤 7）',
    tone: 'ok',
  },
  {
    id: 'HFX-01',
    providerId: 'provider-hifox',
    name: '接口契约导入与用例智能生成',
    desc: '导入 OpenAPI 契约后按方法、错误码与验收标准生成用例骨架，自动补齐正向 / 异常 / 边界 / 幂等 / 并发 / 安全六类变体，并挂到对应测试模块与需求。',
    inputArtifacts: ['OpenAPI 契约（API-01~API-14）', '错误码表', '验收标准'],
    outputArtifacts: ['用例骨架（AC-01~AC-16）', '断言清单', '模块归属映射'],
    aiAgentId: 'ag-test',
    automationLevel: 'full',
    avgDurationSec: 48,
    adoptionRatePct: 91,
    platformEquivalent: '接口自动化中心 · 契约驱动用例生成',
    tone: 'teal',
  },
  {
    id: 'HFX-02',
    providerId: 'provider-hifox',
    name: '场景链编排（变量提取 + 多层断言）',
    desc: '把多个接口用例串成端到端场景，支持 request / assert / extract / wait / condition / loop 六种步骤类型，变量从上一步响应的 JSONPath 提取后注入后续请求。',
    inputArtifacts: ['用例集合（AC-01~AC-16）', '变量提取规则', '断言表达式'],
    outputArtifacts: ['场景定义（AS-01~AS-05）', '场景步骤（ASS-01~ASS-22）', '变量字典'],
    aiAgentId: 'ag-test',
    automationLevel: 'assisted',
    avgDurationSec: 210,
    adoptionRatePct: 84,
    platformEquivalent: '接口自动化中心 · 场景编排器',
    tone: 'teal',
  },
  {
    id: 'HFX-03',
    providerId: 'provider-hifox',
    name: 'Mock 服务（静态 / 模板 / 延迟 / 错误 / AI 动态）',
    desc: '为库存中心、支付网关、WMS、营销中台、ES、KMS 等下游依赖提供 Mock，支持按 header / body 条件匹配，AI 动态模式可依据提示词生成符合契约 Schema 的响应。',
    inputArtifacts: ['下游接口 Schema', '匹配条件表达式', 'AI 动态提示词'],
    outputArtifacts: ['Mock 规则（MK-*）', '响应模板', '命中统计'],
    aiAgentId: 'ag-test',
    automationLevel: 'assisted',
    avgDurationSec: 35,
    adoptionRatePct: 79,
    platformEquivalent: '接口自动化中心 · 依赖 Mock 与混沌注入',
    tone: 'info',
  },
  {
    id: 'HFX-04',
    providerId: 'provider-hifox',
    name: '数据驱动与生产样本脱敏回放',
    desc: '支持 CSV / 数据库 / AI 生成 / 生产采样四种数据源，生产样本必须经 SEC-MASK-2.1 脱敏后方可入库，按行循环驱动同一场景，输出逐行通过明细。',
    inputArtifacts: ['数据驱动集（ADS-01~ADS-04）', '脱敏规则（rd-01~rd-08）', '场景定义'],
    outputArtifacts: ['逐行执行明细', '失败数据行清单', '数据字典'],
    aiAgentId: 'ag-test',
    automationLevel: 'full',
    avgDurationSec: 120,
    adoptionRatePct: 86,
    platformEquivalent: '接口自动化中心 · 数据驱动集',
    tone: 'info',
  },
  {
    id: 'HFX-05',
    providerId: 'provider-hifox',
    name: 'CI 集成与门禁联动',
    desc: '由 Jenkins 在 push / 定时 / 事件三种触发下调用场景执行，结果按门禁口径回写：G3 看增量覆盖率、G4 看用例执行率与 P95、G5 看发布前置、G6 看合规审计。',
    inputArtifacts: ['流水线定义（PIPE-2401~PIPE-2410）', '门禁标准（G1~G6）', '场景集合'],
    outputArtifacts: ['执行记录（AR-01~AR-08）', '门禁判定结果', '流水线阶段日志'],
    aiAgentId: 'ag-ops',
    automationLevel: 'full',
    avgDurationSec: 540,
    adoptionRatePct: 93,
    platformEquivalent: '接口自动化中心 · CI 触发与门禁联动',
    tone: 'ok',
  },
  {
    id: 'HFX-06',
    providerId: 'provider-hifox',
    name: '测试报告与缺陷自动开单',
    desc: '汇总多次执行生成迭代级报告，按模块 / 用例类型 / 失败根因三维统计，失败用例自动开单为缺陷并回填关联契约、用例与流水线，报告归档至 WeKnora 供后续检索。',
    inputArtifacts: ['执行记录（AR-01~AR-08）', '失败断言明细', '缺陷模板'],
    outputArtifacts: ['迭代报告（AR-RPT-24）', '缺陷单（BUG-1045~BUG-1055）', '知识库归档条目'],
    aiAgentId: 'ag-test',
    automationLevel: 'assisted',
    avgDurationSec: 90,
    adoptionRatePct: 88,
    platformEquivalent: '接口自动化中心 · 报告归档与缺陷开单',
    tone: 'warn',
  },
];

/** AI 自动化编排流的单个步骤 */
export interface AutomationFlowStepDef {
  order: number;
  name: string;
  /** 执行主体 */
  executor: Executor;
  /** 主责 Agent id，非 Agent 步骤为空串 */
  agentId: string;
  /** 调用的 AI 能力提供方 id，必须取自 AI_TOOL_PROVIDERS；步骤只使用平台自有集成（GitLab / Jenkins / PingCode）时为空串 */
  toolProviderId: string;
  /** 输入来源（上一步产物或平台对象） */
  inputFrom: string;
  /** 输出去向 */
  outputTo: string;
  durationSec: number;
  /** 失败兜底动作 */
  fallbackAction: string;
}

/** 端到端 AI 自动化编排流 */
export interface AiAutomationFlowDef {
  id: string;
  name: string;
  /** 触发事件名（triggerType 为 schedule 时为调度器事件名） */
  triggerEvent: string;
  triggerType: 'event' | 'schedule' | 'manual';
  steps: AutomationFlowStepDef[];
  /** 需人工确认的节点名 */
  humanCheckpoints: string[];
  /** 全流程自动化率（%） */
  autoRatePct: number;
  /** 端到端平均耗时（分钟） */
  avgEndToEndMin: number;
  lastRunAt: string;
  lastRunStatus: 'success' | 'partial' | 'failed';
  tone: Tone;
}

/**
 * 6 条端到端 AI 自动化编排流，串起「需求 → 原型 → 编码 → 接口测试 → 门禁 → 观测 → 知识归档」全链路。
 * 每条流的末步都以 WeKnora（provider-weknora）归档收尾，形成可检索的组织资产。
 */
export const AI_AUTOMATION_FLOWS: AiAutomationFlowDef[] = [
  {
    id: 'AIF-01',
    name: 'PRD 定稿 → 原型生成 → 批注评审 → 需求确认',
    triggerEvent: 'sdlc.prd.baselined',
    triggerType: 'event',
    steps: [
      {
        order: 1,
        name: '监听 PRD 基线冻结事件',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: '',
        inputFrom: 'PRD-ORD-v2.3（status=已基线）',
        outputTo: '原型生成任务草稿',
        durationSec: 4,
        fallbackAction: '事件重复投递时按 prdVersionId 幂等去重，24h 内只触发一次',
      },
      {
        order: 2,
        name: '解析 PRD 并抽取信息架构',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: 'provider-axhub',
        inputFrom: 'PRD 全文 13,460 字 + 32 条验收标准',
        outputTo: 'ia-nav-tree.json / entity-dict-186.json',
        durationSec: 414,
        fallbackAction: '语义块切分失败时降级为按标题层级切分，并标记 warnings 交人工复核',
      },
      {
        order: 3,
        name: '生成 8 个页面结构与组件映射',
        executor: 'ai',
        agentId: 'ag-arch',
        toolProviderId: 'provider-axhub',
        inputFrom: 'ia-nav-tree.json + axhub-lib 5.4.2',
        outputTo: 'PTP-01~PTP-08 页面 + component-map-18.json',
        durationSec: 1240,
        fallbackAction: '组件映射置信度 < 70% 的区块转为草稿态，标记 humanEdited 待人工选型',
      },
      {
        order: 4,
        name: '写入 AxHub 项目并生成批注锚点',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: 'provider-axhub',
        inputFrom: 'PT-01 v1.0 快照',
        outputTo: 'AXH-PRJ-2401 + 9 个批注锚点',
        durationSec: 72,
        fallbackAction: 'AxHub 写入超时重试 3 次，仍失败则本地暂存并挂起任务为 queued',
      },
      {
        order: 5,
        name: '多角色批注评审（6 人）',
        executor: 'human',
        agentId: '',
        toolProviderId: 'provider-axhub',
        inputFrom: 'AXH-PRJ-2401 批注锚点',
        outputTo: 'PTR-01~PTR-09 评审记录',
        durationSec: 5400,
        fallbackAction: '48h 未评审自动升级提醒至研发总监林知远，72h 未闭环阻断 G1 签署',
      },
      {
        order: 6,
        name: 'AI 回应批注并产出 v1.1 / v1.2',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: 'provider-axhub',
        inputFrom: 'PTR-01~PTR-09 中 open / pending-ai 的批注',
        outputTo: 'PTV-04（v1.1）/ PTV-05（v1.2 基线）',
        durationSec: 680,
        fallbackAction: '阻断级批注（blocker）不允许自动修改，必须转人工确认后再生成版本',
      },
      {
        order: 7,
        name: '需求确认并导出交付包',
        executor: 'ai+human',
        agentId: 'ag-pm',
        toolProviderId: 'provider-axhub',
        inputFrom: 'PTV-05（isBaseline=true）',
        outputTo: 'PT-01 status=exported + make/figma/html 导出包',
        durationSec: 96,
        fallbackAction: '导出格式缺失时只交付 make + html，Figma 库转异步补齐',
      },
      {
        order: 8,
        name: '原型基线与评审批注归档知识库',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: 'provider-weknora',
        inputFrom: 'PTV-05 快照 + 9 条批注处理记录（6 修订 / 1 不修复 / 2 转 SP-25）',
        outputTo: 'WeKnora 知识条目（G1 需求门禁证据）',
        durationSec: 26,
        fallbackAction: '归档失败进入重试队列，最多 6 次指数退避，超限告警至 ag-ba',
      },
    ],
    humanCheckpoints: ['多角色批注评审（6 人）', '需求确认并导出交付包'],
    autoRatePct: 78,
    avgEndToEndMin: 142,
    lastRunAt: '2026-03-13 17:05',
    lastRunStatus: 'success',
    tone: 'ok',
  },
  {
    id: 'AIF-02',
    name: '任务认领 → IDE AI 编码 → 同步平台 → 自动提 MR',
    triggerEvent: 'sdlc.task.claimed',
    triggerType: 'event',
    steps: [
      {
        order: 1,
        name: '任务认领并下发上下文切片清单',
        executor: 'ai',
        agentId: 'ag-code',
        toolProviderId: '',
        inputFrom: '任务看板中被认领的任务（state=任务已创建）+ 关联组件 / 契约',
        outputTo: 'IDE 侧上下文切片清单（3~7 文件）',
        durationSec: 8,
        fallbackAction: '任务无关联组件时按 reqId 回溯 ARCH_COMPONENTS 兜底推荐',
      },
      {
        order: 2,
        name: 'IDE 插件建连并完成出网脱敏预检',
        executor: 'ai',
        agentId: '',
        toolProviderId: '',
        inputFrom: '上下文切片 + egressPolicy（ALLOW/MASK/DENY）',
        outputTo: '脱敏后上下文快照（IDES-* mask 事件）',
        durationSec: 14,
        fallbackAction: '命中 EGRESS-DENY 时强制切换 mdl-local，产物滞留本地离线队列待人工审批',
      },
      {
        order: 3,
        name: '本地 AI 多轮编码与逐块接受',
        executor: 'ai+human',
        agentId: 'ag-code',
        toolProviderId: '',
        inputFrom: '脱敏上下文 + ag-review 规范约束',
        outputTo: 'ai-turn / accept / reject 事件与本地补丁',
        durationSec: 3600,
        fallbackAction: '连续 3 轮采纳率 < 30% 时提示切换模型或转人工主导',
      },
      {
        order: 4,
        name: '本地单测执行与增量覆盖率采集',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: '',
        inputFrom: '本地补丁 + 既有单测套件',
        outputTo: 'test-result / coverage 产物（JaCoCo 增量）',
        durationSec: 420,
        fallbackAction: '增量覆盖率 < 85% 时阻止进入下一步并回灌缺口分支清单',
      },
      {
        order: 5,
        name: 'Diff 与产物同步回平台（含冲突三方合并）',
        executor: 'ai+human',
        agentId: 'ag-code',
        toolProviderId: '',
        inputFrom: 'diff-upload / conflict 事件',
        outputTo: '平台侧编码会话（CODING_SESSIONS）+ 产物快照',
        durationSec: 96,
        fallbackAction: '冲突时由 ag-review 给三方合并建议，人工复核通过后才覆盖平台版本',
      },
      {
        order: 6,
        name: '门禁预检并自动创建 MR',
        executor: 'ai',
        agentId: 'ag-review',
        toolProviderId: '',
        inputFrom: '平台侧 diff + 覆盖率报告 + Sonar 预扫',
        outputTo: 'GitLab 合并请求（自动指派 2 名评审人）',
        durationSec: 62,
        fallbackAction: '阻断级问题 > 0 时不创建 MR，直接在 IDE 内给出修复建议',
      },
      {
        order: 7,
        name: '触发流水线并回写任务状态',
        executor: 'ai',
        agentId: 'ag-ops',
        toolProviderId: '',
        inputFrom: 'GitLab 合并请求',
        outputTo: 'Jenkins 流水线执行记录 + 任务 state=已提交',
        durationSec: 30,
        fallbackAction: '流水线排队超 15 分钟时降级为手动触发并通知责任人',
      },
      {
        order: 8,
        name: 'AI 编码会话摘要归档知识库',
        executor: 'ai',
        agentId: 'ag-code',
        toolProviderId: 'provider-weknora',
        inputFrom: '编码会话 transcript + 采纳 / 拒绝统计',
        outputTo: 'WeKnora 知识条目（可复用编码模式）',
        durationSec: 22,
        fallbackAction: 'transcript 含未脱敏字段时先补脱敏再归档，失败则丢弃并告警',
      },
    ],
    humanCheckpoints: ['本地 AI 多轮编码与逐块接受', 'Diff 与产物同步回平台（含冲突三方合并）'],
    autoRatePct: 71,
    avgEndToEndMin: 76,
    lastRunAt: '2026-03-19 10:31',
    lastRunStatus: 'partial',
    tone: 'ai',
  },
  {
    id: 'AIF-03',
    name: '接口契约冻结 → 用例生成 → 场景编排 → CI 触发 → 报告归档 → 知识库入库',
    triggerEvent: 'sdlc.contract.frozen',
    triggerType: 'event',
    steps: [
      {
        order: 1,
        name: '监听契约冻结事件并拉取 OpenAPI',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-hifox',
        inputFrom: 'API-01~API-14（status=frozen）',
        outputTo: '契约 Schema + 错误码表',
        durationSec: 12,
        fallbackAction: '契约仍为 draft / reviewing 时只生成草稿态用例，不参与门禁',
      },
      {
        order: 2,
        name: '按六类变体生成接口用例',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-hifox',
        inputFrom: '契约 Schema + 验收标准 + 历史缺陷（BUG-1043~BUG-1055）',
        outputTo: 'AC-01~AC-16（14 条 ai-generated）',
        durationSec: 260,
        fallbackAction: '断言无法从契约推断时标记 status=draft，转人工补全',
      },
      {
        order: 3,
        name: '编排端到端场景与变量提取',
        executor: 'ai+human',
        agentId: 'ag-test',
        toolProviderId: 'provider-hifox',
        inputFrom: 'AC-01~AC-16 用例 + 数据驱动集 ADS-01~ADS-04',
        outputTo: 'AS-01~AS-05 + ASS-01~ASS-22',
        durationSec: 340,
        fallbackAction: '场景超时或断言冲突时回退为单用例执行，保留失败现场',
      },
      {
        order: 4,
        name: '配置下游 Mock 与数据驱动集',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-hifox',
        inputFrom: '下游依赖 Schema + 生产采样（脱敏后）',
        outputTo: 'MK-01~MK-08 + ADS-01~ADS-04',
        durationSec: 88,
        fallbackAction: '生产样本未通过 SEC-MASK-2.1 校验时拒绝入库并告警合规组',
      },
      {
        order: 5,
        name: 'CI 触发执行并回写门禁',
        executor: 'ai',
        agentId: 'ag-ops',
        toolProviderId: '',
        inputFrom: 'AS-01~AS-05 场景 + Jenkins 流水线定义',
        outputTo: 'AR-01~AR-08 执行记录 + G3/G4/G5/G6 判定',
        durationSec: 540,
        fallbackAction: '门禁不通过时阻断发布单 REL-2403 审批并推送通知给门禁责任人',
      },
      {
        order: 6,
        name: '失败用例自动开单为缺陷',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: '',
        inputFrom: 'AR-01~AR-08 中 failed 的用例与失败断言',
        outputTo: 'BUG-1045 / 1046 / 1047 / 1048 / 1052 / 1054 / 1055',
        durationSec: 34,
        fallbackAction: '同一根因重复开单时合并为已有缺陷并追加复现记录',
      },
      {
        order: 7,
        name: '生成迭代级接口自动化报告',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-hifox',
        inputFrom: 'AR-01~AR-08 + AC-01~AC-16 + BUG-1043~BUG-1055',
        outputTo: 'AR-RPT-24（含 AI 洞察与改进建议）',
        durationSec: 58,
        fallbackAction: '统计口径缺失时在报告中标注不可比并跳过环比区块',
      },
      {
        order: 8,
        name: '报告与失败根因归档知识库',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-weknora',
        inputFrom: 'AR-RPT-24 + topFailures 根因分析',
        outputTo: 'WeKnora 知识条目（供 ag-test 下轮生成用例时检索）',
        durationSec: 24,
        fallbackAction: '归档失败保留本地副本，下一次流启动时补传',
      },
    ],
    humanCheckpoints: ['编排端到端场景与变量提取'],
    autoRatePct: 92,
    avgEndToEndMin: 24,
    lastRunAt: '2026-03-19 18:02',
    lastRunStatus: 'partial',
    tone: 'teal',
  },
  {
    id: 'AIF-04',
    name: '门禁失败 → 覆盖率缺口分析 → 用例反向生成 → 重跑流水线',
    triggerEvent: 'sdlc.pipeline.gate_failed',
    triggerType: 'event',
    steps: [
      {
        order: 1,
        name: '捕获门禁失败事件并定位缺口',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: '',
        inputFrom: 'PIPE-2409（G3 failed，聚合覆盖率 71.4%）',
        outputTo: 'uncovered-branches.txt 缺口分支清单',
        durationSec: 18,
        fallbackAction: '门禁产物缺失时回查 jacoco-aggregate.xml 重新计算',
      },
      {
        order: 2,
        name: '结合缺陷复现路径反向生成用例',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-hifox',
        inputFrom: 'BUG-1043 复现路径 + TASK-2403 补偿分支',
        outputTo: '12 条异常回滚单测 + 6 条接口断言',
        durationSec: 168,
        fallbackAction: '生成用例与既有断言重复率 > 40% 时中止并转人工设计',
      },
      {
        order: 3,
        name: '人工复核生成用例',
        executor: 'human',
        agentId: '',
        toolProviderId: '',
        inputFrom: '12 条单测 + 6 条接口断言草稿',
        outputTo: '复核通过用例（合入 test/order-idempotency-ut）',
        durationSec: 1800,
        fallbackAction: '复核驳回时把驳回理由回灌 ag-test 作为负样本',
      },
      {
        order: 4,
        name: '重跑流水线并复判门禁',
        executor: 'ai',
        agentId: 'ag-ops',
        toolProviderId: '',
        inputFrom: '合入后的分支头 commit',
        outputTo: 'Jenkins 重跑执行记录 + G3 复判结果（本次未产出：已达连续 3 次失败上限）',
        durationSec: 972,
        fallbackAction: '连续 3 次失败后停止自动重跑，转林知远走门禁例外审批',
      },
      {
        order: 5,
        name: '缺口收敛经验归档知识库',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-weknora',
        inputFrom: '缺口分支清单 + 反向生成用例 + 复判结果',
        outputTo: 'WeKnora 知识条目（覆盖率缺口模式库）',
        durationSec: 20,
        fallbackAction: '归档失败仅记录本地日志，不阻断主流程',
      },
    ],
    humanCheckpoints: ['人工复核生成用例'],
    autoRatePct: 68,
    avgEndToEndMin: 52,
    lastRunAt: '2026-03-19 17:42',
    lastRunStatus: 'failed',
    tone: 'danger',
  },
  {
    id: 'AIF-05',
    name: '缺陷定级 → 根因分析 → 修复方案 → 回归用例补齐 → 经验入库',
    triggerEvent: 'sdlc.bug.severity_assigned',
    triggerType: 'event',
    steps: [
      {
        order: 1,
        name: '缺陷定级并判定是否阻断发布',
        executor: 'ai',
        agentId: 'ag-ba',
        toolProviderId: '',
        inputFrom: 'BUG-1043~BUG-1055 现象 / 影响面 / 复现率',
        outputTo: 'priority + severity + releaseBlocking 判定',
        durationSec: 26,
        fallbackAction: '资损级判定存疑时强制升级至测试负责人何斯年人工确认',
      },
      {
        order: 2,
        name: '5Why 根因分析与代码定位',
        executor: 'ai',
        agentId: 'ag-review',
        toolProviderId: '',
        inputFrom: '缺陷堆栈 + 关联 MR / commit + 契约错误码',
        outputTo: '根因链（BUG_ANALYSIS）+ 嫌疑代码位置',
        durationSec: 142,
        fallbackAction: '定位置信度 < 60% 时输出 Top3 嫌疑点交人工判断',
      },
      {
        order: 3,
        name: '生成修复方案与备选权衡',
        executor: 'ai+human',
        agentId: 'ag-code',
        toolProviderId: '',
        inputFrom: '根因链 + 架构约束（ADR）',
        outputTo: '修复方案 2~3 个（含风险与工时）',
        durationSec: 210,
        fallbackAction: '涉及事务边界或分片键变更时必须由首席架构师严慕舟签署',
      },
      {
        order: 4,
        name: '回归用例补齐并挂入场景',
        executor: 'ai',
        agentId: 'ag-test',
        toolProviderId: 'provider-hifox',
        inputFrom: '修复方案 + 缺陷复现路径',
        outputTo: '回归 AC-01~AC-16 用例 + 挂入 AS-01~AS-05 场景',
        durationSec: 96,
        fallbackAction: '无法自动构造复现数据时转数据驱动集人工补样',
      },
      {
        order: 5,
        name: '缺陷复盘与预防项归档知识库',
        executor: 'ai',
        agentId: 'ag-ba',
        toolProviderId: 'provider-weknora',
        inputFrom: '根因链 + 修复方案 + 预防项',
        outputTo: 'WeKnora 知识条目（缺陷模式库，供 ag-code 编码时预警）',
        durationSec: 28,
        fallbackAction: '归档失败重试 3 次，仍失败则在缺陷单上挂待归档标记',
      },
    ],
    humanCheckpoints: ['生成修复方案与备选权衡'],
    autoRatePct: 74,
    avgEndToEndMin: 18,
    lastRunAt: '2026-03-19 11:26',
    lastRunStatus: 'success',
    tone: 'warn',
  },
  {
    id: 'AIF-06',
    name: '迭代规划 → AI 排期与工时预估 → 冲突消解 → 甘特基线锁定',
    triggerEvent: 'cron.sprint.planning.0730',
    triggerType: 'schedule',
    steps: [
      {
        order: 1,
        name: '拉取迭代容量与历史速率',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: '',
        inputFrom: 'SP-24 容量 104h/人 + SP-22 / SP-23 速率',
        outputTo: '成员产能基线与技能矩阵',
        durationSec: 16,
        fallbackAction: '历史速率样本 < 2 个迭代时降级为角色默认产能',
      },
      {
        order: 2,
        name: '工时三点估算与 AI 集成预估',
        executor: 'ai',
        agentId: 'ag-arch',
        toolProviderId: '',
        inputFrom: 'SP-24 任务故事点 + 相似任务 + 代码规模',
        outputTo: 'EST-01~EST-12（pert + AI 集成预估）',
        durationSec: 74,
        fallbackAction: 'r2 < 0.6 时不输出建议值，仅给出置信区间并提示人工估算',
      },
      {
        order: 3,
        name: '依赖与关键路径求解',
        executor: 'ai',
        agentId: 'ag-arch',
        toolProviderId: '',
        inputFrom: 'TASK_DEPS（DEP-01~DEP-20）',
        outputTo: 'CRITICAL_PATH（11 个关键任务）+ 最早开始 / 最晚完成时间',
        durationSec: 22,
        fallbackAction: '检测到环形依赖时中止并输出环路，交 PMO 拆解',
      },
      {
        order: 4,
        name: '冲突识别与排期建议生成',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: '',
        inputFrom: '产能 / 依赖 / 门禁 / 截止日冲突',
        outputTo: 'GANTT-CF-01~06 + SCH-01~SCH-08 建议',
        durationSec: 48,
        fallbackAction: '建议置信度 < 65% 时标记为 pending，不进入自动应用白名单',
      },
      {
        order: 5,
        name: '低风险建议自动应用',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: '',
        inputFrom: '置信度 ≥ 85% 且不触碰关键路径的建议',
        outputTo: 'SCH-05（auto-applied）',
        durationSec: 6,
        fallbackAction: '自动应用后 24h 内可一键回滚，回滚记录写入审计日志',
      },
      {
        order: 6,
        name: '人工决策高影响建议',
        executor: 'human',
        agentId: '',
        toolProviderId: '',
        inputFrom: 'SCH-01~SCH-08 中 accepted / rejected / pending 项',
        outputTo: '决策记录（decidedBy / decidedAt / rejectReason）',
        durationSec: 2700,
        fallbackAction: '超 48h 未决策自动升级至研发总监，并在甘特图上标红',
      },
      {
        order: 7,
        name: '锁定甘特基线并同步 PingCode',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: '',
        inputFrom: '已决策的排期方案',
        outputTo: '甘特基线 + PingCode 工作项日期回写',
        durationSec: 34,
        fallbackAction: 'PingCode 回写失败进入同步死信队列（syncQueue），按策略重投',
      },
      {
        order: 8,
        name: '排期决策与偏差归档知识库',
        executor: 'ai',
        agentId: 'ag-pm',
        toolProviderId: 'provider-weknora',
        inputFrom: 'EST-* 预估偏差 + SCH-* 决策理由',
        outputTo: 'WeKnora 知识条目（估算偏差样本，反哺下一轮回归模型）',
        durationSec: 20,
        fallbackAction: '归档失败不阻断基线锁定，转入补归档队列',
      },
    ],
    humanCheckpoints: ['人工决策高影响建议'],
    autoRatePct: 84,
    avgEndToEndMin: 56,
    lastRunAt: '2026-03-19 07:30',
    lastRunStatus: 'success',
    tone: 'indigo',
  },
];

/* ==== 1. AI 原型生成（对标 AxHub Make） ==== */

/** AI 原型生成任务（一次 PRD → 原型的完整生成作业） */
export interface PrototypeJobDef {
  id: string;
  name: string;
  /** 输入的 PRD 版本 id（取自 data.ts 的 PRD_VERSIONS） */
  prdVersionId: string;
  /** PRD 版本展示标签 */
  prdVersionLabel: string;
  /** 覆盖的需求 id（REQ-2401 ~ REQ-2408） */
  requirementIds: string[];
  /** 触发人 userId */
  triggeredBy: string;
  triggeredAt: string;
  /** full=全量重建 / incremental=基于既有基线增量 / regenerate=同输入重跑 */
  mode: 'full' | 'incremental' | 'regenerate';
  modelId: string;
  /** 主导 Agent（ag-pm 需求澄清 / ag-arch 架构设计） */
  agentId: string;
  status: 'queued' | 'parsing' | 'generating' | 'reviewing' | 'approved' | 'failed' | 'exported';
  statusLabel: string;
  tone: Tone;
  /** 7 步加权生成进度（权重 8/12/30/18/14/12/6），0-100 */
  progress: number;
  /** 当前正在生成的页面 id，无则为空串 */
  currentPageId: string;
  fidelity: 'low' | 'mid' | 'high';
  deviceTargets: ('desktop' | 'mobile' | 'tablet')[];
  pageCountPlanned: number;
  pageCountDone: number;
  /** 用到的组件种类数 */
  componentCount: number;
  /** 生成的交互流条数 */
  interactionCount: number;
  /** 已耗时（秒），失败任务为终止前累计耗时 */
  durationSec: number;
  /** Token 成本（元） */
  tokenCost: number;
  retryCount: number;
  /** 失败原因，非失败任务为 null */
  failReason: string | null;
  exportFormats: ('make' | 'figma' | 'html' | 'sketch')[];
  /** 回写的 AxHub 项目 id，未写入为空串 */
  axhubProjectId: string;
  reviewStatus: string;
  /** 批准人 userId，未批准为空串 */
  approvedBy: string;
  approvedAt: string;
  desc: string;
}

/**
 * 5 个 AI 原型生成任务，覆盖 exported / generating / reviewing / approved / failed 五种状态。
 * 主线是 PT-01：基于已基线的 PRD v2.3 生成订单中心重构全量高保真原型（8 页）并已导出交付。
 */
export const PROTOTYPE_JOBS: PrototypeJobDef[] = [
  {
    id: 'PT-01',
    name: '订单中心重构 · 全量高保真原型（PRD v2.3 基线）',
    prdVersionId: 'PRD-ORD-v2.3',
    prdVersionLabel: 'v2.3',
    requirementIds: ['REQ-2401', 'REQ-2402', 'REQ-2403', 'REQ-2404', 'REQ-2405', 'REQ-2407', 'REQ-2408'],
    triggeredBy: 'u-su',
    triggeredAt: '2026-03-11 14:20',
    mode: 'full',
    modelId: 'mdl-claude',
    agentId: 'ag-pm',
    status: 'exported',
    statusLabel: '已导出交付',
    tone: 'ok',
    progress: 100,
    currentPageId: '',
    fidelity: 'high',
    deviceTargets: ['desktop', 'tablet', 'mobile'],
    pageCountPlanned: 8,
    pageCountDone: 8,
    componentCount: 18,
    interactionCount: 34,
    durationSec: 2146,
    tokenCost: 12.86,
    retryCount: 0,
    failReason: null,
    exportFormats: ['make', 'figma', 'html'],
    axhubProjectId: 'AXH-PRJ-2401',
    reviewStatus: '已通过并导出：9 条批注中 6 条已应用修订、1 条判定不修复（PTR-09）、2 条转入 SP-25 跟踪（PTR-05 操作者类型、PTR-07 分摊三列）',
    approvedBy: 'u-lin',
    approvedAt: '2026-03-13 17:05',
    desc: 'PRD v2.3 冻结后 3 小时内触发，覆盖 7 条需求的 8 个核心页面：订单列表、订单详情、创建订单向导、状态机流转看板、状态变更审计流水、优惠试算与分摊明细、订单数据导出与二次授权、迁移与双写校验仪表盘。作为 G1 需求门禁的评审证据与 G2 架构门禁的界面基线。',
  },
  {
    id: 'PT-02',
    name: '多仓多商家拆单与合单 · 增量原型（REQ-2405）',
    prdVersionId: 'PRD-ORD-v2.3',
    prdVersionLabel: 'v2.3',
    requirementIds: ['REQ-2405'],
    triggeredBy: 'u-yan',
    triggeredAt: '2026-03-19 09:12',
    mode: 'incremental',
    modelId: 'mdl-claude',
    agentId: 'ag-arch',
    status: 'generating',
    statusLabel: '生成中 · 组件选型与映射（4/6 页）',
    tone: 'ai',
    progress: 62,
    currentPageId: 'PTP-10',
    fidelity: 'high',
    deviceTargets: ['desktop', 'mobile'],
    pageCountPlanned: 6,
    pageCountDone: 4,
    componentCount: 12,
    interactionCount: 16,
    durationSec: 1180,
    tokenCost: 6.24,
    retryCount: 0,
    failReason: null,
    exportFormats: [],
    axhubProjectId: 'AXH-PRJ-2404',
    reviewStatus: '未开始（预计 03-19 11:40 进入评审）',
    approvedBy: '',
    approvedAt: '',
    desc: '在 PT-01 基线上增量生成拆单域 6 个页面，配合 GANTT-CF-05 的建议提前锁定聚合根边界，让 TASK-2416 的前端脚手架可与 TASK-2415 拆单引擎并行推进。当前卡在步骤 4：axhub-lib 缺少「拆单方案对比」变体，AI 正在派生自定义组件。',
  },
  {
    id: 'PT-03',
    name: '状态机配置化后台 + 审计留痕检索 · 增量原型（REQ-2402 / REQ-2408）',
    prdVersionId: 'PRD-ORD-v2.3',
    prdVersionLabel: 'v2.3',
    requirementIds: ['REQ-2402', 'REQ-2408'],
    triggeredBy: 'u-zhou',
    triggeredAt: '2026-03-17 10:35',
    mode: 'incremental',
    modelId: 'mdl-gpt5',
    agentId: 'ag-arch',
    status: 'reviewing',
    statusLabel: '评审中 · 2 条阻断待处理',
    tone: 'warn',
    progress: 100,
    currentPageId: '',
    fidelity: 'high',
    deviceTargets: ['desktop'],
    pageCountPlanned: 5,
    pageCountDone: 5,
    componentCount: 9,
    interactionCount: 14,
    durationSec: 1268,
    tokenCost: 4.86,
    retryCount: 0,
    failReason: null,
    exportFormats: ['make', 'html'],
    axhubProjectId: 'AXH-PRJ-2402',
    reviewStatus: '评审中（4/6 人已确认，2 条阻断级批注待 ag-pm 回应）',
    approvedBy: '',
    approvedAt: '',
    desc: '为 TASK-2407 状态流转规则配置化与热更新提供界面依据：规则列表、规则编辑器（含灰度与回滚）、流转边矩阵、审计流水检索、越权告警配置。评审阶段架构师指出热更新语义未定（CS-2407 已 paused），阻断级批注要求先补 ADR 再定稿。',
  },
  {
    id: 'PT-04',
    name: '订单查询性能看板（3000 TPS 容量观测）· 全量原型',
    prdVersionId: 'PRD-ORD-v2.1',
    prdVersionLabel: 'v2.1',
    requirementIds: ['REQ-2404'],
    triggeredBy: 'u-meng',
    triggeredAt: '2026-03-02 09:48',
    mode: 'full',
    modelId: 'mdl-claude',
    agentId: 'ag-arch',
    status: 'approved',
    statusLabel: '已评审通过',
    tone: 'ok',
    progress: 100,
    currentPageId: '',
    fidelity: 'mid',
    deviceTargets: ['desktop', 'tablet'],
    pageCountPlanned: 4,
    pageCountDone: 4,
    componentCount: 7,
    interactionCount: 9,
    durationSec: 942,
    tokenCost: 3.42,
    retryCount: 1,
    failReason: null,
    exportFormats: ['make', 'figma'],
    axhubProjectId: 'AXH-PRJ-2403',
    reviewStatus: '已通过（首次生成因压测口径缺失重试 1 次）',
    approvedBy: 'u-lin',
    approvedAt: '2026-03-04 16:20',
    desc: '依据 PRD v2.1 补充的 NFR（3000 TPS 持续 30 分钟、错误率 ≤ 0.05%、Redis 命中率 ≥ 92%）生成 4 页容量观测看板：压测总览、接口 P95/P99 趋势、缓存命中率与穿透率、分片热点分布。已作为 TP-03 性能与容量压测计划的可视化验收标准。',
  },
  {
    id: 'PT-05',
    name: '优惠核销规则配置台 · 首次尝试（失败回退）',
    prdVersionId: 'PRD-ORD-v2.0',
    prdVersionLabel: 'v2.0',
    requirementIds: ['REQ-2403'],
    triggeredBy: 'u-su',
    triggeredAt: '2026-02-26 11:15',
    mode: 'full',
    modelId: 'mdl-deepseek',
    agentId: 'ag-pm',
    status: 'failed',
    statusLabel: '生成失败 · 已回退需求澄清',
    tone: 'danger',
    progress: 68,
    currentPageId: '',
    fidelity: 'mid',
    deviceTargets: ['desktop'],
    pageCountPlanned: 6,
    pageCountDone: 6,
    componentCount: 8,
    interactionCount: 0,
    durationSec: 1610,
    tokenCost: 5.18,
    retryCount: 2,
    failReason:
      'PRD v2.0 中「优惠核销规则」章节只有业务描述、缺少可验证的验收标准（该章 GWT 结构完整率 0%），AI 无法推断互斥冲突、部分核销与核销回滚三类交互分支；步骤 5「交互流与状态机」连续 2 次重试均产出空图，已按兜底策略回退至需求澄清环节。该缺口在 PRD v2.3「全部 14 条用户故事补齐 Given-When-Then 验收标准」后消除，待重新触发。',
    exportFormats: [],
    axhubProjectId: '',
    reviewStatus: '未开始',
    approvedBy: '',
    approvedAt: '',
    desc: '本次失败被沉淀为 AIF-01 步骤 2 的兜底规则来源：解析阶段若检测到目标章节验收标准缺失，应提前阻断而不是走到步骤 5 才失败，可节省约 1,610 秒与 5.18 元 Token 成本。',
  },
];

/** 原型生成任务的单个流水线步骤 */
export interface PrototypeJobStepDef {
  id: string;
  jobId: string;
  /** 步骤序号 1~7 */
  order: number;
  /** 步骤名（7 步固定：解析 PRD / 抽取信息架构 / 生成页面结构 / 组件选型与映射 / 交互流与状态机 / 设计 token 与视觉 / 产出与批注锚点） */
  name: string;
  status: 'done' | 'running' | 'pending' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  modelId: string;
  tokenIn: number;
  tokenOut: number;
  /** 该步骤的具体产物描述 */
  outputSummary: string;
  artifacts: string[];
  warnings: string[];
  tone: Tone;
}

/**
 * 原型生成 7 步流水线 × 5 个任务 = 35 条步骤记录。
 * 步骤权重固定为 8/12/30/18/14/12/6（合计 100），任务 progress 即按此加权：
 *   PT-01 / PT-03 / PT-04 七步全 done → 100；
 *   PT-02 前 3 步 done（50）+ 第 4 步 4/6 页（18 × 4/6 = 12）→ 62；
 *   PT-05 前 4 步 done（68）+ 第 5 步 failed → 68。
 * 各任务 7 步 durationSec 之和等于该任务的 durationSec。
 */
export const PROTOTYPE_JOB_STEPS: PrototypeJobStepDef[] = [
  /* ---- PT-01（exported，合计 2146s） ---- */
  {
    id: 'PTS-01', jobId: 'PT-01', order: 1, name: '解析 PRD', status: 'done',
    startedAt: '2026-03-11 14:20:00', finishedAt: '2026-03-11 14:22:48', durationSec: 168, modelId: 'mdl-claude',
    tokenIn: 18600, tokenOut: 2400,
    outputSummary: '解析 PRD-ORD-v2.3 全文 13,460 字，切分为 42 个语义块，识别 8 条需求、14 条用户故事、32 条验收标准，术语表命中 26 项。',
    artifacts: ['prd-parse-tree.json', 'glossary-26.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-02', jobId: 'PT-01', order: 2, name: '抽取信息架构', status: 'done',
    startedAt: '2026-03-11 14:22:48', finishedAt: '2026-03-11 14:26:54', durationSec: 246, modelId: 'mdl-claude',
    tokenIn: 12400, tokenOut: 3860,
    outputSummary: '推导出 3 层导航（订单域 / 履约域 / 合规域）、8 个一级页面与 14 个实体关系，字段字典 186 项，页面优先级 P0×4 / P1×3 / P2×1。',
    artifacts: ['ia-nav-tree.json', 'entity-dict-186.json', 'page-priority.csv'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-03', jobId: 'PT-01', order: 3, name: '生成页面结构', status: 'done',
    startedAt: '2026-03-11 14:26:54', finishedAt: '2026-03-11 14:40:26', durationSec: 812, modelId: 'mdl-claude',
    tokenIn: 26800, tokenOut: 18420,
    outputSummary: '按 P0→P1→P2 顺序生成 PTP-01~PTP-08 共 8 个页面栅格骨架，桌面 1440 / 平板 834 / 移动 390 三断点，合计 214 个布局区块。',
    artifacts: ['PTP-01~PTP-08.make', 'layout-grid-214.json', 'wireframe-lowfi-8.png'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-04', jobId: 'PT-01', order: 4, name: '组件选型与映射', status: 'done',
    startedAt: '2026-03-11 14:40:26', finishedAt: '2026-03-11 14:47:34', durationSec: 428, modelId: 'mdl-claude',
    tokenIn: 15200, tokenOut: 6840,
    outputSummary: '在 axhub-lib 5.4.2 中检索到 15 个可直接复用的库内组件，另有 1 个自定义组件与 2 个 AI 派生组件（环形图、代码 Diff 块），合计 18 个，其中 3 个标记为 AI 生成，平均映射置信度 91.4%。',
    artifacts: ['component-map-18.json', 'custom-components-3.fig'],
    warnings: ['PTC-12「代码 Diff 块」库内无同类组件，已按 ai-generated 派生并回写为自定义组件'],
    tone: 'ok',
  },
  {
    id: 'PTS-05', jobId: 'PT-01', order: 5, name: '交互流与状态机', status: 'done',
    startedAt: '2026-03-11 14:47:34', finishedAt: '2026-03-11 14:51:58', durationSec: 264, modelId: 'mdl-claude',
    tokenIn: 9800, tokenOut: 5260,
    outputSummary: '生成 34 条页面间交互流与订单 10 态 42 条流转边的可视化状态机，补齐 6 条非法流转拦截分支与 3 个异常空态。',
    artifacts: ['interaction-flow-34.json', 'order-state-machine.svg'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-06', jobId: 'PT-01', order: 6, name: '设计 token 与视觉', status: 'done',
    startedAt: '2026-03-11 14:51:58', finishedAt: '2026-03-11 14:54:34', durationSec: 156, modelId: 'mdl-claude',
    tokenIn: 6400, tokenOut: 2180,
    outputSummary: '套用 design-token v3（主色 #2F5BFF、圆角 8px、间距为 4 的倍数），产出 8 页高保真视觉稿与暗色变体，对比度全部满足 WCAG AA。',
    artifacts: ['design-tokens-v3.json', 'visual-hifi-8.png', 'visual-dark-8.png'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-07', jobId: 'PT-01', order: 7, name: '产出与批注锚点', status: 'done',
    startedAt: '2026-03-11 14:54:34', finishedAt: '2026-03-11 14:55:46', durationSec: 72, modelId: 'mdl-claude',
    tokenIn: 2100, tokenOut: 640,
    outputSummary: '写入 AxHub 项目 AXH-PRJ-2401，生成 9 个批注锚点与 5 个版本快照，导出 make / figma / html 三种格式并挂载为 G1 门禁证据。',
    artifacts: ['AXH-PRJ-2401.make', 'annotation-anchors-9.json', 'export-manifest.json'],
    warnings: [],
    tone: 'ok',
  },
  /* ---- PT-02（generating，已耗时 1180s） ---- */
  {
    id: 'PTS-08', jobId: 'PT-02', order: 1, name: '解析 PRD', status: 'done',
    startedAt: '2026-03-19 09:12:00', finishedAt: '2026-03-19 09:14:22', durationSec: 142, modelId: 'mdl-claude',
    tokenIn: 8200, tokenOut: 1160,
    outputSummary: '增量解析 PRD-ORD-v2.3 的 REQ-2405 章节（多仓多商家拆单与合单），切出 9 个语义块、5 条验收标准，复用 PT-01 的术语表。',
    artifacts: ['prd-parse-tree-req2405.json'],
    warnings: [],
    tone: 'ai',
  },
  {
    id: 'PTS-09', jobId: 'PT-02', order: 2, name: '抽取信息架构', status: 'done',
    startedAt: '2026-03-19 09:14:22', finishedAt: '2026-03-19 09:17:50', durationSec: 208, modelId: 'mdl-claude',
    tokenIn: 6400, tokenOut: 2240,
    outputSummary: '在 PT-01 导航树上挂出「履约域」子树，新增 6 个页面与 5 个实体（拆单规则 / 子订单 / 库存分配 / 拆单异常 / 合单方案）。',
    artifacts: ['ia-nav-tree-fulfill.json', 'entity-dict-5.json'],
    warnings: [],
    tone: 'ai',
  },
  {
    id: 'PTS-10', jobId: 'PT-02', order: 3, name: '生成页面结构', status: 'done',
    startedAt: '2026-03-19 09:17:50', finishedAt: '2026-03-19 09:27:46', durationSec: 596, modelId: 'mdl-claude',
    tokenIn: 14800, tokenOut: 11260,
    outputSummary: '生成 PTP-09~PTP-14 共 6 个页面骨架（桌面 1440 / 移动 390 双断点），合计 96 个布局区块。',
    artifacts: ['PTP-09~PTP-14.make', 'layout-grid-96.json'],
    warnings: [],
    tone: 'ai',
  },
  {
    id: 'PTS-11', jobId: 'PT-02', order: 4, name: '组件选型与映射', status: 'running',
    startedAt: '2026-03-19 09:27:46', finishedAt: '', durationSec: 234, modelId: 'mdl-claude',
    tokenIn: 7600, tokenOut: 3180,
    outputSummary: '已完成 PTP-09 / PTP-11 / PTP-12 / PTP-13 四页的组件映射（命中 12 个组件），正在为 PTP-10「拆单规则配置台」派生规则编辑器变体。',
    artifacts: ['component-map-12.json'],
    warnings: ['axhub-lib 5.4.2 缺少「四维规则编辑器」变体，AI 正在派生自定义组件，预计额外 180s'],
    tone: 'ai',
  },
  {
    id: 'PTS-12', jobId: 'PT-02', order: 5, name: '交互流与状态机', status: 'pending',
    startedAt: '', finishedAt: '', durationSec: 0, modelId: 'mdl-claude',
    tokenIn: 0, tokenOut: 0,
    outputSummary: '待执行：将生成拆单预演 → 确认拆单 → 子订单独立退款 → 合单预览的交互流，以及子订单状态机（6 态 11 条流转边）。',
    artifacts: [],
    warnings: [],
    tone: 'neutral',
  },
  {
    id: 'PTS-13', jobId: 'PT-02', order: 6, name: '设计 token 与视觉', status: 'pending',
    startedAt: '', finishedAt: '', durationSec: 0, modelId: 'mdl-claude',
    tokenIn: 0, tokenOut: 0,
    outputSummary: '待执行：沿用 design-token v3，为拆单域补充 2 个语义色（拆单中 / 拆单异常）与暗色变体。',
    artifacts: [],
    warnings: [],
    tone: 'neutral',
  },
  {
    id: 'PTS-14', jobId: 'PT-02', order: 7, name: '产出与批注锚点', status: 'pending',
    startedAt: '', finishedAt: '', durationSec: 0, modelId: 'mdl-claude',
    tokenIn: 0, tokenOut: 0,
    outputSummary: '待执行：写入 AxHub 项目 AXH-PRJ-2404，生成批注锚点并通知苏文瑾、严慕舟、陈屿三人评审。',
    artifacts: [],
    warnings: [],
    tone: 'neutral',
  },
  /* ---- PT-03（reviewing，合计 1268s） ---- */
  {
    id: 'PTS-15', jobId: 'PT-03', order: 1, name: '解析 PRD', status: 'done',
    startedAt: '2026-03-17 10:35:00', finishedAt: '2026-03-17 10:37:12', durationSec: 132, modelId: 'mdl-gpt5',
    tokenIn: 7400, tokenOut: 980,
    outputSummary: '解析 PRD-ORD-v2.3 的 REQ-2402（状态机治理）与 REQ-2408（审计留痕）章节，切出 14 个语义块、9 条验收标准。',
    artifacts: ['prd-parse-tree-req2402-2408.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-16', jobId: 'PT-03', order: 2, name: '抽取信息架构', status: 'done',
    startedAt: '2026-03-17 10:37:12', finishedAt: '2026-03-17 10:40:18', durationSec: 186, modelId: 'mdl-gpt5',
    tokenIn: 5800, tokenOut: 1860,
    outputSummary: '在 PT-01 导航树上挂出「配置与合规」子树，新增 5 个页面与 4 个实体（流转规则 / 规则版本 / 审计流水 / 越权告警）。',
    artifacts: ['ia-nav-tree-config.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-17', jobId: 'PT-03', order: 3, name: '生成页面结构', status: 'done',
    startedAt: '2026-03-17 10:40:18', finishedAt: '2026-03-17 10:48:06', durationSec: 468, modelId: 'mdl-gpt5',
    tokenIn: 11200, tokenOut: 8640,
    outputSummary: '生成 5 个页面骨架（仅桌面 1440 断点）：规则列表、规则编辑器、流转边矩阵、审计流水检索、越权告警配置，合计 78 个布局区块。',
    artifacts: ['PT-03-pages-5.make', 'layout-grid-78.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-18', jobId: 'PT-03', order: 4, name: '组件选型与映射', status: 'done',
    startedAt: '2026-03-17 10:48:06', finishedAt: '2026-03-17 10:52:12', durationSec: 246, modelId: 'mdl-gpt5',
    tokenIn: 6200, tokenOut: 2740,
    outputSummary: '命中 9 个 axhub-lib 组件，其中流转边矩阵复用 PTC-14 树形结构 + PTC-03 状态标签组合，平均映射置信度 88.2%。',
    artifacts: ['component-map-9.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-19', jobId: 'PT-03', order: 5, name: '交互流与状态机', status: 'done',
    startedAt: '2026-03-17 10:52:12', finishedAt: '2026-03-17 10:54:40', durationSec: 148, modelId: 'mdl-gpt5',
    tokenIn: 5400, tokenOut: 2860,
    outputSummary: '生成 14 条交互流，含规则灰度发布 → 观察 → 全量 / 回滚的三态切换，以及审计流水的二次授权弹窗流。',
    artifacts: ['interaction-flow-14.json', 'rule-gray-release-state.svg'],
    warnings: ['热更新语义未定（API-05 契约仍为 reviewing、CS-2407 已 paused），灰度回滚分支按保守方案生成，待 ADR 确认后修订'],
    tone: 'warn',
  },
  {
    id: 'PTS-20', jobId: 'PT-03', order: 6, name: '设计 token 与视觉', status: 'done',
    startedAt: '2026-03-17 10:54:40', finishedAt: '2026-03-17 10:55:42', durationSec: 62, modelId: 'mdl-gpt5',
    tokenIn: 3200, tokenOut: 1120,
    outputSummary: '沿用 design-token v3，为规则状态补充 3 个语义色（草稿 / 灰度中 / 已生效），产出 5 页高保真视觉稿。',
    artifacts: ['visual-hifi-5.png'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-21', jobId: 'PT-03', order: 7, name: '产出与批注锚点', status: 'done',
    startedAt: '2026-03-17 10:55:42', finishedAt: '2026-03-17 10:56:08', durationSec: 26, modelId: 'mdl-gpt5',
    tokenIn: 1400, tokenOut: 420,
    outputSummary: '写入 AxHub 项目 AXH-PRJ-2402，生成 7 个批注锚点，推送评审通知给严慕舟、周浩然、何斯年、孟星回、顾时衍、林知远 6 人。',
    artifacts: ['AXH-PRJ-2402.make', 'annotation-anchors-7.json'],
    warnings: [],
    tone: 'ok',
  },
  /* ---- PT-04（approved，合计 942s） ---- */
  {
    id: 'PTS-22', jobId: 'PT-04', order: 1, name: '解析 PRD', status: 'done',
    startedAt: '2026-03-02 09:48:00', finishedAt: '2026-03-02 09:49:58', durationSec: 118, modelId: 'mdl-claude',
    tokenIn: 5600, tokenOut: 820,
    outputSummary: '解析 PRD-ORD-v2.1 的 REQ-2404（订单查询性能达标）章节，抽取 3000 TPS / P99 200ms / 缓存命中率 ≥ 92% / 穿透率 ≤ 0.3% 四项 NFR。',
    artifacts: ['prd-parse-tree-req2404.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-23', jobId: 'PT-04', order: 2, name: '抽取信息架构', status: 'done',
    startedAt: '2026-03-02 09:49:58', finishedAt: '2026-03-02 09:52:32', durationSec: 154, modelId: 'mdl-claude',
    tokenIn: 4200, tokenOut: 1420,
    outputSummary: '生成 4 页看板的信息架构：压测总览、接口 P95/P99 趋势、缓存命中率与穿透率、分片热点分布。',
    artifacts: ['ia-nav-tree-perf.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-24', jobId: 'PT-04', order: 3, name: '生成页面结构', status: 'done',
    startedAt: '2026-03-02 09:52:32', finishedAt: '2026-03-02 09:58:08', durationSec: 336, modelId: 'mdl-claude',
    tokenIn: 8600, tokenOut: 6240,
    outputSummary: '生成 4 个仪表盘页面骨架（桌面 1440 / 平板 834），合计 52 个布局区块，其中图表区块 18 个。',
    artifacts: ['PT-04-pages-4.make', 'layout-grid-52.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-25', jobId: 'PT-04', order: 4, name: '组件选型与映射', status: 'done',
    startedAt: '2026-03-02 09:58:08', finishedAt: '2026-03-02 10:01:06', durationSec: 178, modelId: 'mdl-claude',
    tokenIn: 4800, tokenOut: 2060,
    outputSummary: '命中 7 个组件：指标卡、折线图、环形图、数据表格、筛选栏、状态标签、批注锚点，映射置信度均值 93.6%。',
    artifacts: ['component-map-7.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-26', jobId: 'PT-04', order: 5, name: '交互流与状态机', status: 'done',
    startedAt: '2026-03-02 10:01:06', finishedAt: '2026-03-02 10:02:42', durationSec: 96, modelId: 'mdl-claude',
    tokenIn: 3400, tokenOut: 1680,
    outputSummary: '生成 9 条交互流：时间窗切换、接口下钻、分片热点跳转、压测批次对比、阈值告警订阅等（仪表盘类无业务状态机）。',
    artifacts: ['interaction-flow-9.json'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-27', jobId: 'PT-04', order: 6, name: '设计 token 与视觉', status: 'done',
    startedAt: '2026-03-02 10:02:42', finishedAt: '2026-03-02 10:03:24', durationSec: 42, modelId: 'mdl-claude',
    tokenIn: 2600, tokenOut: 940,
    outputSummary: '沿用 design-token v3，为容量指标补充阈值三色（达标 / 预警 / 违约），产出 4 页中保真视觉稿。',
    artifacts: ['visual-midfi-4.png'],
    warnings: [],
    tone: 'ok',
  },
  {
    id: 'PTS-28', jobId: 'PT-04', order: 7, name: '产出与批注锚点', status: 'done',
    startedAt: '2026-03-02 10:03:24', finishedAt: '2026-03-02 10:03:42', durationSec: 18, modelId: 'mdl-claude',
    tokenIn: 1200, tokenOut: 380,
    outputSummary: '写入 AxHub 项目 AXH-PRJ-2403，生成 4 个批注锚点，导出 make / figma 两种格式，挂为 TP-03 压测计划的可视化验收标准。',
    artifacts: ['AXH-PRJ-2403.make', 'annotation-anchors-4.json', 'export-manifest.json'],
    warnings: [],
    tone: 'ok',
  },
  /* ---- PT-05（failed，累计 1610s） ---- */
  {
    id: 'PTS-29', jobId: 'PT-05', order: 1, name: '解析 PRD', status: 'done',
    startedAt: '2026-02-26 11:15:00', finishedAt: '2026-02-26 11:17:32', durationSec: 152, modelId: 'mdl-deepseek',
    tokenIn: 6800, tokenOut: 920,
    outputSummary: '解析 PRD-ORD-v2.0 的 REQ-2403（优惠计算下沉）章节，切出 11 个语义块，仅识别到 2 条业务描述性条款，未识别到任何 GWT 结构验收标准。',
    artifacts: ['prd-parse-tree-req2403.json'],
    warnings: ['目标章节验收标准缺失（GWT 完整率 0%），后续交互推断存在高风险'],
    tone: 'warn',
  },
  {
    id: 'PTS-30', jobId: 'PT-05', order: 2, name: '抽取信息架构', status: 'done',
    startedAt: '2026-02-26 11:17:32', finishedAt: '2026-02-26 11:21:06', durationSec: 214, modelId: 'mdl-deepseek',
    tokenIn: 5200, tokenOut: 1740,
    outputSummary: '按经验模板推导出 6 个页面：核销规则列表、互斥组配置、优先级编排、分摊策略、核销流水、试算沙箱。',
    artifacts: ['ia-nav-tree-promo.json'],
    warnings: ['信息架构由模板兜底推导，非从验收标准反推，页面边界可能返工'],
    tone: 'warn',
  },
  {
    id: 'PTS-31', jobId: 'PT-05', order: 3, name: '生成页面结构', status: 'done',
    startedAt: '2026-02-26 11:21:06', finishedAt: '2026-02-26 11:31:10', durationSec: 604, modelId: 'mdl-deepseek',
    tokenIn: 12600, tokenOut: 9420,
    outputSummary: '生成 6 个页面骨架（仅桌面 1440 断点），合计 84 个布局区块。',
    artifacts: ['PT-05-pages-6.make', 'layout-grid-84.json'],
    warnings: [],
    tone: 'warn',
  },
  {
    id: 'PTS-32', jobId: 'PT-05', order: 4, name: '组件选型与映射', status: 'done',
    startedAt: '2026-02-26 11:31:10', finishedAt: '2026-02-26 11:36:28', durationSec: 318, modelId: 'mdl-deepseek',
    tokenIn: 7200, tokenOut: 3060,
    outputSummary: '命中 8 个 axhub-lib 组件（数据表格、筛选栏、标签组、步骤条、树形结构、抽屉、模态框、批注锚点），映射置信度均值 82.4%。',
    artifacts: ['component-map-8.json'],
    warnings: [],
    tone: 'warn',
  },
  {
    id: 'PTS-33', jobId: 'PT-05', order: 5, name: '交互流与状态机', status: 'failed',
    startedAt: '2026-02-26 11:36:28', finishedAt: '2026-02-26 11:41:50', durationSec: 322, modelId: 'mdl-deepseek',
    tokenIn: 9400, tokenOut: 240,
    outputSummary: '两次重试均产出空交互图：缺少验收标准导致互斥冲突、部分核销、核销回滚三类分支无法推断，模型返回的 transition 集合为空。',
    artifacts: ['interaction-flow-empty.json'],
    warnings: [
      '第 1 次重试（11:38:02）：仅生成 2 条交互流，覆盖率 8%，判定不合格',
      '第 2 次重试（11:40:16）：返回空图，触发兜底策略',
      '兜底动作：中止流水线，任务回退至需求澄清环节（st-req），并通知苏文瑾补齐验收标准',
    ],
    tone: 'danger',
  },
  {
    id: 'PTS-34', jobId: 'PT-05', order: 6, name: '设计 token 与视觉', status: 'pending',
    startedAt: '', finishedAt: '', durationSec: 0, modelId: 'mdl-deepseek',
    tokenIn: 0, tokenOut: 0,
    outputSummary: '未执行：前置步骤失败，流水线在步骤 5 中止。',
    artifacts: [],
    warnings: [],
    tone: 'neutral',
  },
  {
    id: 'PTS-35', jobId: 'PT-05', order: 7, name: '产出与批注锚点', status: 'pending',
    startedAt: '', finishedAt: '', durationSec: 0, modelId: 'mdl-deepseek',
    tokenIn: 0, tokenOut: 0,
    outputSummary: '未执行：未写入 AxHub 项目，无批注锚点与导出包，任务已回退至需求澄清环节。',
    artifacts: [],
    warnings: [],
    tone: 'neutral',
  },
];

/** 原型页面内的单条交互流 */
export interface PrototypeInteractionDef {
  name: string;
  /** 触发方式 */
  trigger: string;
  /** 动作类型 */
  action: string;
  /** 跳转目标页 id，页内动作为 null */
  targetPageId: string | null;
}

/** 原型页面（AxHub Make 页面节点） */
export interface PrototypePageDef {
  id: string;
  jobId: string;
  name: string;
  route: string;
  pageType: '列表' | '表单' | '详情' | '看板' | '仪表盘' | '向导' | '弹窗';
  layout: 'sidebar-content' | 'top-nav' | 'full-bleed' | 'split';
  priority: 'P0' | 'P1' | 'P2';
  status: 'generated' | 'generating' | 'draft' | 'approved' | 'rejected';
  /** 引用的原型组件 id（PTC-*） */
  componentIds: string[];
  /** 绑定到的后端接口 / 数据域 */
  dataBindings: string[];
  interactions: PrototypeInteractionDef[];
  /** 该页在 AxHub 中的批注锚点（PTR-* 列表，长度即锚点数） */
  annotationIds: string[];
  /** AI 生成置信度（%） */
  aiConfidencePct: number;
  /** 是否被人工编辑过 */
  humanEdited: boolean;
  editCount: number;
  /** 评审意见条数，等于 annotationIds.length */
  reviewCommentCount: number;
  tone: Tone;
  requirementIds: string[];
}

/**
 * 14 个原型页面：PT-01（已导出）的 PTP-01~PTP-08 共 8 页 + PT-02（生成中）的 PTP-09~PTP-14 共 6 页。
 * 其余 3 个任务（PT-03 / PT-04 / PT-05）在原型页以汇总卡片呈现，不展开页面明细。
 * 页面 componentIds 与 PROTOTYPE_COMPONENTS.pageIds 双向一致；
 * 各页 interactions 条数之和等于所属任务的 interactionCount（PT-01 = 34，PT-02 = 16）。
 */
export const PROTOTYPE_PAGES: PrototypePageDef[] = [
  {
    id: 'PTP-01',
    jobId: 'PT-01',
    name: '订单列表（多条件筛选 + 游标分页）',
    route: '/order/list',
    pageType: '列表',
    layout: 'sidebar-content',
    priority: 'P0',
    status: 'approved',
    componentIds: ['PTC-01', 'PTC-02', 'PTC-03', 'PTC-06', 'PTC-09', 'PTC-16', 'PTC-17', 'PTC-18'],
    dataBindings: [
      'API-03 GET /api/v2/orders（游标分页，v2.0 由 offset 改 cursor）',
      'API-02 GET /api/v2/orders/{orderNo}（行内详情抽屉）',
      'API-13 POST /api/v2/orders/export（批量导出入口）',
    ],
    interactions: [
      { name: '筛选条件变更后刷新列表', trigger: 'change', action: 'reload-table', targetPageId: null },
      { name: '点击订单号打开详情抽屉', trigger: 'click', action: 'open-drawer', targetPageId: null },
      { name: '跳转订单详情页', trigger: 'click', action: 'navigate', targetPageId: 'PTP-02' },
      { name: '批量选中后发起导出（走二次授权）', trigger: 'click', action: 'navigate', targetPageId: 'PTP-07' },
      { name: '空态引导创建订单', trigger: 'click', action: 'navigate', targetPageId: 'PTP-03' },
    ],
    annotationIds: ['PTR-01', 'PTR-02'],
    aiConfidencePct: 93,
    humanEdited: true,
    editCount: 3,
    reviewCommentCount: 2,
    tone: 'ok',
    requirementIds: ['REQ-2404'],
  },
  {
    id: 'PTP-02',
    jobId: 'PT-01',
    name: '订单详情（父 / 子订单聚合视图）',
    route: '/order/detail/:orderNo',
    pageType: '详情',
    layout: 'sidebar-content',
    priority: 'P0',
    status: 'approved',
    componentIds: ['PTC-03', 'PTC-06', 'PTC-13', 'PTC-14', 'PTC-15', 'PTC-17', 'PTC-18'],
    dataBindings: [
      'API-02 GET /api/v2/orders/{orderNo}（多级缓存优先，敏感字段脱敏返回）',
      'API-06 GET /api/v2/orders/{orderNo}/state-logs（状态流水时间线）',
      'API-10 POST /api/v2/orders/split-preview（子订单拆分预览）',
    ],
    interactions: [
      { name: '展开父 / 子订单树', trigger: 'click', action: 'expand-tree', targetPageId: null },
      { name: '打开子订单退款抽屉', trigger: 'click', action: 'open-drawer', targetPageId: null },
      { name: '跳转状态变更审计流水', trigger: 'click', action: 'navigate', targetPageId: 'PTP-05' },
      { name: '复制订单号与 traceId', trigger: 'click', action: 'copy-clipboard', targetPageId: null },
      { name: '状态时间线悬浮显示操作者与原因', trigger: 'hover', action: 'show-tooltip', targetPageId: null },
    ],
    annotationIds: ['PTR-03'],
    aiConfidencePct: 88,
    humanEdited: true,
    editCount: 5,
    reviewCommentCount: 1,
    tone: 'ok',
    requirementIds: ['REQ-2404', 'REQ-2405'],
  },
  {
    id: 'PTP-03',
    jobId: 'PT-01',
    name: '创建订单向导（幂等键与优惠试算）',
    route: '/order/create',
    pageType: '向导',
    layout: 'split',
    priority: 'P0',
    status: 'approved',
    componentIds: ['PTC-07', 'PTC-08', 'PTC-18'],
    dataBindings: [
      'API-01 POST /api/v2/orders（Idempotency-Key 必填，24h 窗口幂等）',
      'API-07 POST /api/v2/promotions/trial（试算返回 ruleVersion）',
      'API-08 POST /api/v2/promotions/apply（与订单创建同事务边界）',
    ],
    interactions: [
      { name: '选择优惠组合后试算', trigger: 'change', action: 'submit-form', targetPageId: null },
      { name: '提交订单（失败自动携同 Key 重试）', trigger: 'click', action: 'submit-form', targetPageId: null },
      { name: '查看优惠互斥说明', trigger: 'click', action: 'open-modal', targetPageId: null },
      { name: '下单成功跳转订单详情', trigger: 'success', action: 'navigate', targetPageId: 'PTP-02' },
      { name: '幂等命中提示（ORDER_DUPLICATED）并跳首单', trigger: 'error', action: 'navigate', targetPageId: 'PTP-02' },
    ],
    annotationIds: ['PTR-04'],
    aiConfidencePct: 91,
    humanEdited: true,
    editCount: 2,
    reviewCommentCount: 1,
    tone: 'ok',
    requirementIds: ['REQ-2401'],
  },
  {
    id: 'PTP-04',
    jobId: 'PT-01',
    name: '订单状态机流转看板',
    route: '/order/state-board',
    pageType: '看板',
    layout: 'full-bleed',
    priority: 'P0',
    status: 'approved',
    componentIds: ['PTC-03', 'PTC-05', 'PTC-09', 'PTC-18'],
    dataBindings: [
      'API-05 POST /api/v2/orders/{orderNo}/state-transitions（统一流转入口）',
      'API-12 事件 trade.order.state.changed（看板实时推送）',
      '订单状态机定义（10 态 42 条流转边）',
    ],
    interactions: [
      { name: '拖拽卡片触发流转校验', trigger: 'drag', action: 'validate-transition', targetPageId: null },
      { name: '点击查看流转详情抽屉', trigger: 'click', action: 'open-drawer', targetPageId: null },
      { name: '非法流转目标列高亮并给出允许集合', trigger: 'hover', action: 'highlight', targetPageId: null },
      { name: '按状态与业务线筛选', trigger: 'change', action: 'filter-board', targetPageId: null },
      { name: '领域事件推送后局部刷新', trigger: 'push', action: 'partial-refresh', targetPageId: null },
    ],
    annotationIds: ['PTR-05'],
    aiConfidencePct: 85,
    humanEdited: true,
    editCount: 4,
    reviewCommentCount: 1,
    tone: 'ok',
    requirementIds: ['REQ-2402'],
  },
  {
    id: 'PTP-05',
    jobId: 'PT-01',
    name: '状态变更审计流水',
    route: '/order/:orderNo/state-logs',
    pageType: '详情',
    layout: 'sidebar-content',
    priority: 'P1',
    status: 'approved',
    componentIds: ['PTC-01', 'PTC-13', 'PTC-18'],
    dataBindings: [
      'API-06 GET /api/v2/orders/{orderNo}/state-logs（二次授权，返回 from/to/operator/reason/traceId）',
      '审计留存策略（Loki 180 天 / MySQL 分区表 order_state_log）',
    ],
    interactions: [
      { name: '按 traceId / 操作者检索流水', trigger: 'submit', action: 'reload-table', targetPageId: null },
      { name: '导出流水（触发二次授权）', trigger: 'click', action: 'navigate', targetPageId: 'PTP-07' },
      { name: '复制 traceId 用于链路追踪', trigger: 'click', action: 'copy-clipboard', targetPageId: null },
      { name: '展开时间线节点查看变更前后值', trigger: 'click', action: 'expand-row', targetPageId: null },
    ],
    annotationIds: ['PTR-06'],
    aiConfidencePct: 90,
    humanEdited: false,
    editCount: 0,
    reviewCommentCount: 1,
    tone: 'ok',
    requirementIds: ['REQ-2402', 'REQ-2408'],
  },
  {
    id: 'PTP-06',
    jobId: 'PT-01',
    name: '优惠试算与分摊明细',
    route: '/promo/trial',
    pageType: '表单',
    layout: 'split',
    priority: 'P1',
    status: 'approved',
    componentIds: ['PTC-15', 'PTC-18'],
    dataBindings: [
      'API-07 POST /api/v2/promotions/trial（返回 ruleVersion 与分摊明细，金额为字符串 BigDecimal）',
      'API-09 GET /api/v2/promotions/rules（互斥组 / 优先级 / 分摊策略）',
    ],
    interactions: [
      { name: '选择券 + 满减 + 会员价组合试算', trigger: 'change', action: 'submit-form', targetPageId: null },
      { name: '展开逐行分摊明细', trigger: 'click', action: 'expand-row', targetPageId: null },
      { name: '校验试算与下单 ruleVersion 一致性', trigger: 'submit', action: 'validate', targetPageId: null },
      { name: '尾差非零时红色告警并阻断提交', trigger: 'error', action: 'show-alert', targetPageId: null },
    ],
    annotationIds: ['PTR-07'],
    aiConfidencePct: 82,
    humanEdited: true,
    editCount: 3,
    reviewCommentCount: 1,
    tone: 'warn',
    requirementIds: ['REQ-2403'],
  },
  {
    id: 'PTP-07',
    jobId: 'PT-01',
    name: '订单数据导出与二次授权',
    route: '/order/export',
    pageType: '弹窗',
    layout: 'full-bleed',
    priority: 'P1',
    status: 'approved',
    componentIds: ['PTC-07', 'PTC-18'],
    dataBindings: [
      'API-13 POST /api/v2/orders/export（二次授权 + 脱敏策略版本号 + 审批单号）',
      'ac-mask-sdk 脱敏规则 rd-01 / rd-03 / rd-06',
    ],
    interactions: [
      { name: '发起导出申请并选择字段范围', trigger: 'click', action: 'submit-form', targetPageId: null },
      { name: '主管二次授权（EXPORT_NEED_APPROVAL 拦截）', trigger: 'click', action: 'approve', targetPageId: null },
      { name: '下载脱敏 CSV 并写入审计', trigger: 'success', action: 'download', targetPageId: null },
    ],
    annotationIds: ['PTR-08'],
    aiConfidencePct: 79,
    humanEdited: true,
    editCount: 6,
    reviewCommentCount: 1,
    tone: 'warn',
    requirementIds: ['REQ-2408'],
  },
  {
    id: 'PTP-08',
    jobId: 'PT-01',
    name: '迁移与双写校验仪表盘',
    route: '/migrate/dashboard',
    pageType: '仪表盘',
    layout: 'sidebar-content',
    priority: 'P2',
    status: 'approved',
    componentIds: ['PTC-01', 'PTC-04', 'PTC-08', 'PTC-09', 'PTC-10', 'PTC-11', 'PTC-12', 'PTC-18'],
    dataBindings: [
      'API-14 POST /internal/migrate/batch（单批 ≤ 5 万条，断点续传）',
      '迁移差异比对结果表 migrate_diff_report（4.7 亿行 / 约 11.5 小时）',
      '双写开关配置 dual_write_switch',
    ],
    interactions: [
      { name: '启动 / 暂停迁移批次', trigger: 'click', action: 'toggle-job', targetPageId: null },
      { name: '查看批次行级 Diff', trigger: 'click', action: 'show-diff', targetPageId: null },
      { name: '从断点续传并回传校验结果', trigger: 'click', action: 'resume-checkpoint', targetPageId: null },
    ],
    annotationIds: ['PTR-09'],
    aiConfidencePct: 87,
    humanEdited: true,
    editCount: 1,
    reviewCommentCount: 1,
    tone: 'ok',
    requirementIds: ['REQ-2407'],
  },
  {
    id: 'PTP-09',
    jobId: 'PT-02',
    name: '拆单预演结果对比',
    route: '/order/split-preview',
    pageType: '详情',
    layout: 'split',
    priority: 'P1',
    status: 'generated',
    componentIds: ['PTC-03', 'PTC-14', 'PTC-17', 'PTC-18'],
    dataBindings: ['API-10 POST /api/v2/orders/split-preview（v0.9 草稿，WMS 协议未冻结）'],
    interactions: [
      { name: '切换拆分维度（商家 / 仓库 / 类目 / 重量）', trigger: 'change', action: 'reload-preview', targetPageId: null },
      { name: '确认拆单方案并生成子订单', trigger: 'click', action: 'submit-form', targetPageId: null },
      { name: '查看子订单退款入口', trigger: 'click', action: 'navigate', targetPageId: 'PTP-11' },
    ],
    annotationIds: ['PTR-10'],
    aiConfidencePct: 84,
    humanEdited: false,
    editCount: 0,
    reviewCommentCount: 1,
    tone: 'ai',
    requirementIds: ['REQ-2405'],
  },
  {
    id: 'PTP-10',
    jobId: 'PT-02',
    name: '拆单规则配置台',
    route: '/fulfill/split-rules',
    pageType: '表单',
    layout: 'sidebar-content',
    priority: 'P1',
    status: 'generating',
    componentIds: ['PTC-15', 'PTC-18'],
    dataBindings: ['拆单规则配置域 split_rule_config（四维规则 + 优先级 + 生效范围）'],
    interactions: [
      { name: '新增规则（抽屉表单）', trigger: 'click', action: 'open-drawer', targetPageId: null },
      { name: '规则优先级拖拽排序', trigger: 'drag', action: 'reorder', targetPageId: null },
      { name: '规则试算并跳转预演对比', trigger: 'click', action: 'navigate', targetPageId: 'PTP-09' },
    ],
    annotationIds: ['PTR-11'],
    aiConfidencePct: 61,
    humanEdited: false,
    editCount: 0,
    reviewCommentCount: 1,
    tone: 'ai',
    requirementIds: ['REQ-2405'],
  },
  {
    id: 'PTP-11',
    jobId: 'PT-02',
    name: '子订单独立退款',
    route: '/order/:orderNo/sub-refund',
    pageType: '表单',
    layout: 'sidebar-content',
    priority: 'P1',
    status: 'generated',
    componentIds: ['PTC-06', 'PTC-18'],
    dataBindings: [
      'API-04 POST /api/v2/orders/{orderNo}/cancel（子单维度取消）',
      'API-08 POST /api/v2/promotions/apply（rollbackToken 优惠退回）',
    ],
    interactions: [
      { name: '选择需退款的子订单', trigger: 'change', action: 'select-row', targetPageId: null },
      { name: '提交退款并同步退回优惠', trigger: 'click', action: 'submit-form', targetPageId: null },
      { name: '查看退款处理进度', trigger: 'click', action: 'open-drawer', targetPageId: null },
    ],
    annotationIds: [],
    aiConfidencePct: 68,
    humanEdited: false,
    editCount: 0,
    reviewCommentCount: 0,
    tone: 'neutral',
    requirementIds: ['REQ-2405'],
  },
  {
    id: 'PTP-12',
    jobId: 'PT-02',
    name: '多仓库存分配视图',
    route: '/fulfill/stock-allocation',
    pageType: '看板',
    layout: 'full-bleed',
    priority: 'P2',
    status: 'generated',
    componentIds: ['PTC-05', 'PTC-11', 'PTC-18'],
    dataBindings: ['库存中心 /warehouse/api/v1/stock/deduct（Mock MK-01 / MK-02）', '拆单引擎分配结果 split_allocation'],
    interactions: [
      { name: '按仓库筛选分配看板', trigger: 'change', action: 'filter-board', targetPageId: null },
      { name: '查看单仓分配明细', trigger: 'click', action: 'open-drawer', targetPageId: null },
    ],
    annotationIds: [],
    aiConfidencePct: 64,
    humanEdited: false,
    editCount: 0,
    reviewCommentCount: 0,
    tone: 'neutral',
    requirementIds: ['REQ-2405'],
  },
  {
    id: 'PTP-13',
    jobId: 'PT-02',
    name: '拆单异常处理队列',
    route: '/fulfill/split-exceptions',
    pageType: '列表',
    layout: 'sidebar-content',
    priority: 'P2',
    status: 'generated',
    componentIds: ['PTC-01', 'PTC-02', 'PTC-03', 'PTC-16', 'PTC-18'],
    dataBindings: ['API-10 错误码 SPLIT_RULE_MISSING / WMS_PROTOCOL_UNFROZEN', '拆单异常表 split_exception'],
    interactions: [
      { name: '重试拆单作业', trigger: 'click', action: 'retry-job', targetPageId: null },
      { name: '转人工处理并指派责任人', trigger: 'click', action: 'assign-human', targetPageId: null },
      { name: '查看异常上下文并跳预演', trigger: 'click', action: 'navigate', targetPageId: 'PTP-09' },
    ],
    annotationIds: ['PTR-12'],
    aiConfidencePct: 70,
    humanEdited: false,
    editCount: 0,
    reviewCommentCount: 1,
    tone: 'neutral',
    requirementIds: ['REQ-2405'],
  },
  {
    id: 'PTP-14',
    jobId: 'PT-02',
    name: '合单预览与运费重算弹窗',
    route: '/order/merge-preview',
    pageType: '弹窗',
    layout: 'full-bleed',
    priority: 'P2',
    status: 'draft',
    componentIds: ['PTC-07', 'PTC-18'],
    dataBindings: ['合单规则域 merge_rule', '运费重算服务 /freight/api/v1/recalc（Mock 未覆盖，待接入）'],
    interactions: [
      { name: '预览合单结果与运费差额', trigger: 'click', action: 'submit-form', targetPageId: null },
      { name: '确认合单并回订单详情', trigger: 'click', action: 'navigate', targetPageId: 'PTP-02' },
    ],
    annotationIds: [],
    aiConfidencePct: 66,
    humanEdited: false,
    editCount: 0,
    reviewCommentCount: 0,
    tone: 'neutral',
    requirementIds: ['REQ-2405'],
  },
];

/** 原型组件（axhub-lib 复用组件 / 自定义组件 / AI 派生组件） */
export interface PrototypeComponentDef {
  id: string;
  /** 引用该组件的页面 id 列表 */
  pageIds: string[];
  name: '数据表格' | '筛选栏' | '状态标签' | '甘特条' | '看板列' | '抽屉' | '模态框' | '步骤条'
    | '指标卡' | '折线图' | '环形图' | '代码 Diff 块' | '时间线' | '树形结构' | '标签组' | '空态'
    | '骨架屏' | '批注锚点';
  category: '布局' | '数据展示' | '表单' | '反馈' | '图表' | '导航';
  source: 'axhub-lib' | 'custom' | 'ai-generated';
  /** 来源组件库版本，非库内组件为空串 */
  axhubLibVersion: string;
  /** 可用变体数 */
  variantCount: number;
  /** 关键属性名（3~6 个） */
  propSchema: string[];
  /** 跨页复用次数，等于 pageIds.length */
  reusedAcrossPages: number;
  aiGenerated: boolean;
  accessible: boolean;
  /** 无障碍说明或未达标原因 */
  a11yNote: string;
  tone: Tone;
}

/**
 * 18 个原型组件。pageIds 与 PROTOTYPE_PAGES.componentIds 双向一致，
 * reusedAcrossPages 恒等于 pageIds.length；PT-01 覆盖全部 18 个组件，PT-02 覆盖其中 12 个。
 */
export const PROTOTYPE_COMPONENTS: PrototypeComponentDef[] = [
  {
    id: 'PTC-01', pageIds: ['PTP-01', 'PTP-05', 'PTP-08', 'PTP-13'], name: '数据表格', category: '数据展示',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 6,
    propSchema: ['columns', 'dataSource', 'pagination', 'rowKey', 'stickyHeader'],
    reusedAcrossPages: 4, aiGenerated: false, accessible: true,
    a11yNote: '表头 th 带 scope=col，支持键盘左右键在单元格间移动，选中行暴露 aria-selected。',
    tone: 'brand',
  },
  {
    id: 'PTC-02', pageIds: ['PTP-01', 'PTP-13'], name: '筛选栏', category: '表单',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 4,
    propSchema: ['fields', 'layout', 'collapsible', 'defaultValue'],
    reusedAcrossPages: 2, aiGenerated: false, accessible: true,
    a11yNote: '每个筛选项都有显式 label 关联，折叠态保留 aria-expanded 与键盘可达性。',
    tone: 'brand',
  },
  {
    id: 'PTC-03', pageIds: ['PTP-01', 'PTP-02', 'PTP-04', 'PTP-09', 'PTP-13'], name: '状态标签', category: '数据展示',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 10,
    propSchema: ['status', 'tone', 'size', 'icon'],
    reusedAcrossPages: 5, aiGenerated: false, accessible: true,
    a11yNote: '颜色不作为唯一信息载体，同时输出状态文字与图标，满足色觉障碍可读要求。',
    tone: 'brand',
  },
  {
    id: 'PTC-04', pageIds: ['PTP-08'], name: '甘特条', category: '数据展示',
    source: 'custom', axhubLibVersion: '', variantCount: 3,
    propSchema: ['start', 'end', 'progress', 'critical', 'dependencyArrows'],
    reusedAcrossPages: 1, aiGenerated: true, accessible: true,
    a11yNote: '拖拽手柄命中区 ≥ 24×24px，键盘可用左右方向键按天微调起止日期。',
    tone: 'indigo',
  },
  {
    id: 'PTC-05', pageIds: ['PTP-04', 'PTP-12'], name: '看板列', category: '布局',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 3,
    propSchema: ['title', 'cards', 'wipLimit', 'droppable'],
    reusedAcrossPages: 2, aiGenerated: false, accessible: true,
    a11yNote: '列头声明 aria-dropeffect，拖拽过程通过 live region 播报目标列与 WIP 上限。',
    tone: 'brand',
  },
  {
    id: 'PTC-06', pageIds: ['PTP-01', 'PTP-02', 'PTP-11'], name: '抽屉', category: '反馈',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 4,
    propSchema: ['open', 'placement', 'width', 'maskClosable', 'focusTrap'],
    reusedAcrossPages: 3, aiGenerated: false, accessible: true,
    a11yNote: '打开时焦点陷入抽屉内部，Esc 关闭并把焦点归还给触发元素。',
    tone: 'brand',
  },
  {
    id: 'PTC-07', pageIds: ['PTP-03', 'PTP-07', 'PTP-14'], name: '模态框', category: '反馈',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 5,
    propSchema: ['open', 'title', 'size', 'confirmText', 'cancelText'],
    reusedAcrossPages: 3, aiGenerated: false, accessible: true,
    a11yNote: 'role=dialog + aria-modal=true，危险操作的确认与取消按钮间距 ≥ 8px 以防误触。',
    tone: 'brand',
  },
  {
    id: 'PTC-08', pageIds: ['PTP-03', 'PTP-08'], name: '步骤条', category: '导航',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 3,
    propSchema: ['steps', 'current', 'status', 'clickable'],
    reusedAcrossPages: 2, aiGenerated: false, accessible: true,
    a11yNote: '当前步骤标注 aria-current=step，已完成步骤支持键盘回访查看历史填写内容。',
    tone: 'brand',
  },
  {
    id: 'PTC-09', pageIds: ['PTP-01', 'PTP-04', 'PTP-08'], name: '指标卡', category: '数据展示',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 6,
    propSchema: ['label', 'value', 'unit', 'delta', 'trend', 'threshold'],
    reusedAcrossPages: 3, aiGenerated: false, accessible: true,
    a11yNote: '数值与涨跌方向同时用文本表述，不依赖红绿色传达增减；阈值超限附加图标。',
    tone: 'brand',
  },
  {
    id: 'PTC-10', pageIds: ['PTP-08'], name: '折线图', category: '图表',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 4,
    propSchema: ['series', 'xAxis', 'yAxis', 'thresholdLine', 'tooltip'],
    reusedAcrossPages: 1, aiGenerated: false, accessible: true,
    a11yNote: '提供等价的数据表格替代视图，tooltip 支持键盘聚焦读取。',
    tone: 'teal',
  },
  {
    id: 'PTC-11', pageIds: ['PTP-08', 'PTP-12'], name: '环形图', category: '图表',
    source: 'ai-generated', axhubLibVersion: '', variantCount: 2,
    propSchema: ['data', 'innerRadius', 'centerLabel', 'legendPosition'],
    reusedAcrossPages: 2, aiGenerated: true, accessible: false,
    a11yNote: 'AI 派生组件，图例文本对比度 3.8:1 未达 WCAG AA 的 4.5:1；已提批注 PTR-09，评审判定为不修复（内部仪表盘且已提供表格替代视图）。',
    tone: 'warn',
  },
  {
    id: 'PTC-12', pageIds: ['PTP-08'], name: '代码 Diff 块', category: '数据展示',
    source: 'ai-generated', axhubLibVersion: '', variantCount: 2,
    propSchema: ['oldText', 'newText', 'language', 'collapseUnchanged'],
    reusedAcrossPages: 1, aiGenerated: true, accessible: true,
    a11yNote: '增删行除颜色外带 + / − 前缀，支持屏幕阅读器逐行朗读并折叠未变更区块。',
    tone: 'indigo',
  },
  {
    id: 'PTC-13', pageIds: ['PTP-02', 'PTP-05'], name: '时间线', category: '数据展示',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 3,
    propSchema: ['items', 'direction', 'dotType', 'foldable'],
    reusedAcrossPages: 2, aiGenerated: false, accessible: true,
    a11yNote: '节点使用有序列表语义，时间戳的 aria-label 采用 ISO 8601 完整格式。',
    tone: 'brand',
  },
  {
    id: 'PTC-14', pageIds: ['PTP-02', 'PTP-09'], name: '树形结构', category: '数据展示',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 4,
    propSchema: ['treeData', 'expandKeys', 'checkable', 'draggable'],
    reusedAcrossPages: 2, aiGenerated: false, accessible: true,
    a11yNote: 'aria-expanded / aria-level 完整，支持方向键遍历与 Home / End 跳转首尾节点。',
    tone: 'brand',
  },
  {
    id: 'PTC-15', pageIds: ['PTP-02', 'PTP-06', 'PTP-10'], name: '标签组', category: '数据展示',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 5,
    propSchema: ['tags', 'max', 'closable', 'colorMode', 'overflowTip'],
    reusedAcrossPages: 3, aiGenerated: false, accessible: true,
    a11yNote: '可关闭标签的关闭按钮命中区 ≥ 20×20px 并带 aria-label，超出上限折叠为「+N」气泡。',
    tone: 'brand',
  },
  {
    id: 'PTC-16', pageIds: ['PTP-01', 'PTP-13'], name: '空态', category: '反馈',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 4,
    propSchema: ['image', 'title', 'description', 'actionText'],
    reusedAcrossPages: 2, aiGenerated: false, accessible: true,
    a11yNote: '空态文案为陈述句并给出下一步动作，动作按钮可聚焦且有明确 aria-label。',
    tone: 'slate',
  },
  {
    id: 'PTC-17', pageIds: ['PTP-01', 'PTP-02', 'PTP-09'], name: '骨架屏', category: '反馈',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 3,
    propSchema: ['rows', 'avatar', 'loading', 'animation'],
    reusedAcrossPages: 3, aiGenerated: false, accessible: true,
    a11yNote: '加载态通过 aria-busy 暴露，动画遵循 prefers-reduced-motion 自动关闭。',
    tone: 'slate',
  },
  {
    id: 'PTC-18',
    pageIds: ['PTP-01', 'PTP-02', 'PTP-03', 'PTP-04', 'PTP-05', 'PTP-06', 'PTP-07', 'PTP-08', 'PTP-09', 'PTP-10', 'PTP-11', 'PTP-12', 'PTP-13', 'PTP-14'],
    name: '批注锚点', category: '导航',
    source: 'axhub-lib', axhubLibVersion: '5.4.2', variantCount: 2,
    propSchema: ['anchorId', 'commentCount', 'resolvedRatio', 'highlight'],
    reusedAcrossPages: 14, aiGenerated: false, accessible: true,
    a11yNote: '锚点为 button 语义并携带批注摘要 aria-label，键盘 Tab 可按页面顺序逐个访问。',
    tone: 'pink',
  },
];

/** 原型批注评审记录（AxHub 锚点级批注 + AI 回应闭环） */
export interface PrototypeReviewDef {
  id: string;
  pageId: string;
  /** 批注锚定的组件 id，锚定在页面空白处时为 null */
  componentId: string | null;
  reviewerId: string;
  createdAt: string;
  type: '建议' | '问题' | '阻断' | '确认';
  severity: 'info' | 'minor' | 'major' | 'blocker';
  /** 批注锚定的界面元素描述 */
  anchorText: string;
  comment: string;
  /** AI 的回应与修改方案 */
  aiResponse: string;
  status: 'open' | 'resolved' | 'wontfix' | 'pending-ai';
  resolvedAt: string;
  resolvedBy: string;
  /** 已应用的修改描述，未应用为空串 */
  revisionApplied: string;
  tone: Tone;
}

/**
 * 12 条原型批注评审：PTR-01~PTR-09 属 PT-01（8 页，共 9 个锚点），PTR-10~PTR-12 属 PT-02（3 个锚点）。
 * 其中 6 条 resolved（均带具体 revisionApplied）、1 条 wontfix、3 条 open、2 条 pending-ai；
 * blocker 级 2 条（PTR-03 退款时序、PTR-08 导出二次授权字段缺失）。
 */
export const PROTOTYPE_REVIEWS: PrototypeReviewDef[] = [
  {
    id: 'PTR-01', pageId: 'PTP-01', componentId: 'PTC-01', reviewerId: 'u-he', createdAt: '2026-03-11 16:02',
    type: '建议', severity: 'minor',
    anchorText: '订单列表 · 数据表格「订单金额」列',
    comment: '金额列建议默认右对齐并保留 2 位小数；对无金额查看权限的角色应按脱敏规则 rd-07 展示区间（¥1,000~5,000），当前 AI 生成的是左对齐明文金额，实现时容易直接照搬。',
    aiResponse: '已确认：金额列改为右对齐并启用 tabular-nums，接入 ac-mask-sdk 的 rd-07 规则，按角色权限切换「明文 / 区间」两种渲染分支，区间态附 title 说明原因。',
    status: 'resolved', resolvedAt: '2026-03-11 17:20', resolvedBy: 'u-su',
    revisionApplied: 'v0.2 中金额列右对齐并绑定 rd-07 脱敏策略，PTC-01 新增「区间展示」变体（variantCount 5→6），PTP-01 editCount +1。',
    tone: 'ok',
  },
  {
    id: 'PTR-02', pageId: 'PTP-01', componentId: 'PTC-02', reviewerId: 'u-chen', createdAt: '2026-03-11 16:48',
    type: '问题', severity: 'major',
    anchorText: '订单列表 · 筛选栏「下单时间」区间控件',
    comment: '筛选栏没有把时间范围设为必填，而 API-03 在查询条件过宽时会返回 QUERY_TOO_WIDE、ES 不可用时返回 ES_DEGRADED；原型完全没有这两个异常态，前端实现必然漏掉兜底提示。',
    aiResponse: '已在筛选栏增加「时间范围必填」校验，并补两个异常态：QUERY_TOO_WIDE 的提示条（附一键补全近 30 天）与 ES_DEGRADED 的降级横幅（说明已回源 DB 只读从库、结果可能延迟）。',
    status: 'resolved', resolvedAt: '2026-03-12 09:35', resolvedBy: 'u-chen',
    revisionApplied: 'v0.2 新增 2 个异常态区块，PTC-16 空态变体 +1，PTP-01 editCount +1，交互流 +1 条。',
    tone: 'ok',
  },
  {
    id: 'PTR-03', pageId: 'PTP-02', componentId: 'PTC-14', reviewerId: 'u-yan', createdAt: '2026-03-12 10:14',
    type: '阻断', severity: 'blocker',
    anchorText: '订单详情 · 父 / 子订单树形结构的「退款」按钮',
    comment: '阻断项：聚合视图未体现 PRD v2.3 修订后的「先核销后退款」时序（原 AC 为「先退款后核销」）。当前树节点上的退款按钮可独立点击，会误导实现产生资损路径，与 BUG-1043 属同类风险。',
    aiResponse: '已按修订后的 AC 重排：子订单退款入口在优惠核销状态为 APPLIED 之前置灰，悬停给出不可用原因；提交退款前强制校验 rollbackToken 是否存在，缺失时阻断并提示先完成核销。',
    status: 'resolved', resolvedAt: '2026-03-12 15:40', resolvedBy: 'u-yan',
    revisionApplied: 'v1.0 中退款按钮增加 disabled 态与 rollbackToken 前置校验，新增 1 条错误分支交互流，PTP-02 editCount +2。',
    tone: 'danger',
  },
  {
    id: 'PTR-04', pageId: 'PTP-03', componentId: 'PTC-08', reviewerId: 'u-su', createdAt: '2026-03-12 11:26',
    type: '建议', severity: 'minor',
    anchorText: '创建订单向导 · 步骤条第 2 步「优惠试算」',
    comment: '建议把试算改为离开该步时自动触发，而不是显式点按钮；同时把 ruleVersion 以只读徽标展示，方便测试核对试算与下单是否使用同一规则版本（API-07 的强一致要求）。',
    aiResponse: '已改为步骤切换时自动试算（防抖 400ms，失败保留上次结果并提示），并在步骤条右侧增加 ruleVersion 只读徽标与复制按钮，徽标在下单提交时会与 API-01 的 ruleVersion 做一致性校验。',
    status: 'resolved', resolvedAt: '2026-03-12 14:02', resolvedBy: 'u-su',
    revisionApplied: 'v0.2 步骤条增加自动试算与 ruleVersion 徽标，PTC-08 变体 +1（variantCount 2→3），PTP-03 交互流 +1 条。',
    tone: 'ok',
  },
  {
    id: 'PTR-05', pageId: 'PTP-04', componentId: 'PTC-05', reviewerId: 'u-zhou', createdAt: '2026-03-12 15:08',
    type: '问题', severity: 'major',
    anchorText: '状态机流转看板 · 看板列「已支付」的拖拽目标区',
    comment: '拖拽流转未区分操作者类型（用户 / 客服 / 系统），而 API-05 要求携带 operatorType；另外非法流转只做了高亮，没有返回允许状态集合的可解释提示，与契约的 ORDER_STATE_ILLEGAL 语义不符。',
    aiResponse: '方案：拖拽时弹出操作者类型选择器，非法流转改为弹出 ORDER_STATE_ILLEGAL 详情卡，列出允许的下一状态集合并支持一键跳转。该修改涉及状态机热更新语义（API-05 仍为 reviewing、CS-2407 已 paused），建议随 TASK-2407 方案定稿后一并落版本。',
    status: 'open', resolvedAt: '', resolvedBy: '',
    revisionApplied: '',
    tone: 'warn',
  },
  {
    id: 'PTR-06', pageId: 'PTP-05', componentId: 'PTC-13', reviewerId: 'u-meng', createdAt: '2026-03-12 16:32',
    type: '确认', severity: 'info',
    anchorText: '状态变更审计流水 · 时间线首节点与 traceId 跳转',
    comment: '确认审计流水字段口径（from/to/operator/reason/traceId）与 Loki 180 天留存策略一致，traceId 可直接跳转链路追踪，符合 G6 观测门禁第 3、4 项要求。',
    aiResponse: '已记录为确认项，无需结构性修改；同步在页面右上角增加留存策略说明气泡，避免客服同学误以为流水只保留 30 天。',
    status: 'resolved', resolvedAt: '2026-03-12 17:05', resolvedBy: 'u-meng',
    revisionApplied: 'v1.0 增加留存策略说明气泡（文案：操作日志留存 ≥ 180 天，超期转冷存储可申诉调取）。',
    tone: 'ok',
  },
  {
    id: 'PTR-07', pageId: 'PTP-06', componentId: 'PTC-15', reviewerId: 'u-he', createdAt: '2026-03-12 17:44',
    type: '问题', severity: 'major',
    anchorText: '优惠试算与分摊明细 · 分摊明细标签组',
    comment: '分摊明细只显示到「元」的两位小数，无法复现 BUG-1043 的 0.01 元尾差；测试需要同时看到分摊原值与余数归集行，否则这一页无法作为金额精度的验收界面，TP-02 专项也缺少可视化载体。',
    aiResponse: '正在生成方案：明细区改为三列（原始计算值 / 四舍五入值 / 余数归集），合计行增加尾差校验（分摊之和 ≠ 应付时红色告警并阻断提交）。字段口径需等 ag-test 依据 ADS-02 的 128 组边界数据确认后落版本。',
    status: 'pending-ai', resolvedAt: '', resolvedBy: '',
    revisionApplied: '',
    tone: 'warn',
  },
  {
    id: 'PTR-08', pageId: 'PTP-07', componentId: 'PTC-07', reviewerId: 'u-lin', createdAt: '2026-03-13 09:18',
    type: '阻断', severity: 'blocker',
    anchorText: '订单数据导出 · 二次授权模态框的表单字段区',
    comment: '阻断项：导出弹窗缺少「审批单号」与「脱敏策略版本号」两个字段，而 API-13 v1.1 已明确要求这两项；缺失将直接导致 BUG-1052 类合规高危无法闭环，也不满足 G6 观测门禁的审计留痕项。',
    aiResponse: '已补齐：审批单号为必填并可跳转审批中心校验状态，脱敏策略版本号为只读、取自 SEC-MASK-2.1；同时增加单次导出 > 10 万行时的 EXPORT_ROW_LIMIT 拦截提示与分批导出建议。',
    status: 'resolved', resolvedAt: '2026-03-13 16:40', resolvedBy: 'u-lin',
    revisionApplied: 'v1.2 导出弹窗新增 2 个字段与 1 个行数上限拦截态，PTP-07 editCount +2，并作为 TASK-2423 的界面验收依据。',
    tone: 'danger',
  },
  {
    id: 'PTR-09', pageId: 'PTP-08', componentId: 'PTC-11', reviewerId: 'u-gu', createdAt: '2026-03-13 10:26',
    type: '建议', severity: 'minor',
    anchorText: '迁移与双写校验仪表盘 · 环形图「差异分布」图例',
    comment: '环形图图例文字对比度偏低（3.8:1），投屏评审时几乎看不清；建议提高对比度，或改用带数值标签的堆叠条呈现差异分布。',
    aiResponse: '评估后建议不改组件本体：该仪表盘仅供 DBA 与 PMO 内部使用，已提供等价的数据表格替代视图；提高对比度需改动 design-token v3 的全局变量，影响 PT-01 全部 8 页与后续原型，收益与风险不匹配。',
    status: 'wontfix', resolvedAt: '2026-03-13 11:02', resolvedBy: 'u-gu',
    revisionApplied: '',
    tone: 'slate',
  },
  {
    id: 'PTR-10', pageId: 'PTP-09', componentId: 'PTC-14', reviewerId: 'u-yan', createdAt: '2026-03-19 09:48',
    type: '建议', severity: 'minor',
    anchorText: '拆单预演结果对比 · 拆分方案树的子订单节点',
    comment: '建议在树节点上直接标注拆分依据（命中的规则 id 与维度），否则业务方无法判断为什么这样拆；另外预演结果应显式提示 WMS_PROTOCOL_UNFROZEN，说明当前仅为预演、不落库。',
    aiResponse: '已在每个子订单节点增加规则命中徽标（规则 id + 维度 + 优先级），并在页头加 WMS 协议未冻结的警示条，明确预演结果不写入订单库、不触发库存扣减。',
    status: 'open', resolvedAt: '', resolvedBy: '',
    revisionApplied: '',
    tone: 'ai',
  },
  {
    id: 'PTR-11', pageId: 'PTP-10', componentId: null, reviewerId: 'u-zhou', createdAt: '2026-03-19 10:06',
    type: '问题', severity: 'major',
    anchorText: '拆单规则配置台 · 四维规则编辑器（AI 派生组件生成中）',
    comment: 'axhub-lib 没有四维规则编辑器变体，AI 正在派生自定义组件；但拆单规则的优先级与互斥语义必须与优惠规则引擎 ac-promo-engine 的 exclusiveGroup 保持一致，否则两套规则会出现口径分裂，后期对账成本极高。',
    aiResponse: '已暂停派生自定义组件，改为复用 PTC-15 标签组 + PTC-14 树形结构组合实现优先级编排，并直接读取 API-09 的 exclusiveGroup 字段作为互斥依据；PTS-11 步骤预计因此提前约 180 秒完成。',
    status: 'pending-ai', resolvedAt: '', resolvedBy: '',
    revisionApplied: '',
    tone: 'ai',
  },
  {
    id: 'PTR-12', pageId: 'PTP-13', componentId: 'PTC-16', reviewerId: 'u-he', createdAt: '2026-03-19 10:22',
    type: '确认', severity: 'info',
    anchorText: '拆单异常处理队列 · 空态与异常态文案',
    comment: '确认异常队列的空态文案与「重试 / 转人工」双通道流程符合测试预期；建议把 SPLIT_RULE_MISSING 与 WMS_PROTOCOL_UNFROZEN 两类异常分色，便于回归时快速识别阻塞来源。',
    aiResponse: '已采纳分色建议：规则缺失用 warn、协议未冻结用 info，并保持文字 + 图标双通道，不单独依赖颜色区分；同时把两类异常的推荐处理动作写入空态描述。',
    status: 'open', resolvedAt: '', resolvedBy: '',
    revisionApplied: '',
    tone: 'neutral',
  },
];

/** 原型版本间差异 */
export interface PrototypeVersionDiffDef {
  addedPages: string[];
  removedPages: string[];
  modifiedPages: string[];
  addedComponents: string[];
}

/** 原型版本快照 */
export interface PrototypeVersionDef {
  id: string;
  jobId: string;
  /** 版本号 v0.1 ~ v1.2 */
  version: string;
  createdAt: string;
  /** 创建者 userId，AI 自动出版本时为 'ai' */
  createdBy: string;
  changeSummary: string;
  /** 该版本包含的页面数 */
  pageCount: number;
  /** 该版本已映射的组件种类数 */
  componentCount: number;
  diffFromPrev: PrototypeVersionDiffDef;
  snapshotUrl: string;
  /** 是否为锁定基线 */
  isBaseline: boolean;
  tone: Tone;
}

/**
 * 6 个原型版本：PTV-01~PTV-05 属 PT-01（v0.1 → v1.2，v1.2 为锁定基线），PTV-06 属 PT-02（生成中的 v0.1）。
 * componentCount 逐版累加且与 addedComponents 条数一致：12 → 15 → 17 → 18 → 18；PT-02 首版 12。
 */
export const PROTOTYPE_VERSIONS: PrototypeVersionDef[] = [
  {
    id: 'PTV-01', jobId: 'PT-01', version: 'v0.1', createdAt: '2026-03-11 15:02', createdBy: 'ai',
    changeSummary: '首轮生成：8 页低保真骨架 + 12 个 axhub-lib 组件映射，未包含异常态与高保真视觉，供内部走查页面边界。',
    pageCount: 8, componentCount: 12,
    diffFromPrev: {
      addedPages: ['PTP-01', 'PTP-02', 'PTP-03', 'PTP-04', 'PTP-05', 'PTP-06', 'PTP-07', 'PTP-08'],
      removedPages: [],
      modifiedPages: [],
      addedComponents: ['PTC-01', 'PTC-02', 'PTC-03', 'PTC-05', 'PTC-06', 'PTC-07', 'PTC-08', 'PTC-09', 'PTC-13', 'PTC-15', 'PTC-16', 'PTC-17'],
    },
    snapshotUrl: 'https://axhub.intra.example.com/snapshot/AXH-PRJ-2401/v0.1',
    isBaseline: false, tone: 'neutral',
  },
  {
    id: 'PTV-02', jobId: 'PT-01', version: 'v0.2', createdAt: '2026-03-12 10:26', createdBy: 'ai',
    changeSummary: '应用 PTR-01 / PTR-02 / PTR-04 三条批注：金额列右对齐并接入 rd-07 区间脱敏、筛选栏时间必填并补 QUERY_TOO_WIDE 与 ES_DEGRADED 两个异常态、向导改为自动试算并展示 ruleVersion 徽标。',
    pageCount: 8, componentCount: 15,
    diffFromPrev: {
      addedPages: [],
      removedPages: [],
      modifiedPages: ['PTP-01', 'PTP-03'],
      addedComponents: ['PTC-04', 'PTC-10', 'PTC-18'],
    },
    snapshotUrl: 'https://axhub.intra.example.com/snapshot/AXH-PRJ-2401/v0.2',
    isBaseline: false, tone: 'info',
  },
  {
    id: 'PTV-03', jobId: 'PT-01', version: 'v1.0', createdAt: '2026-03-12 18:44', createdBy: 'u-su',
    changeSummary: '阻断项 PTR-03 闭环：父 / 子订单退款时序改为「先核销后退款」，退款入口增加 rollbackToken 前置校验与错误分支；同时升级为高保真并补齐 PTP-06 分摊明细结构。',
    pageCount: 8, componentCount: 17,
    diffFromPrev: {
      addedPages: [],
      removedPages: [],
      modifiedPages: ['PTP-02', 'PTP-04', 'PTP-06'],
      addedComponents: ['PTC-11', 'PTC-14'],
    },
    snapshotUrl: 'https://axhub.intra.example.com/snapshot/AXH-PRJ-2401/v1.0',
    isBaseline: false, tone: 'info',
  },
  {
    id: 'PTV-04', jobId: 'PT-01', version: 'v1.1', createdAt: '2026-03-13 15:20', createdBy: 'ai',
    changeSummary: '应用 PTR-06 确认项（审计留存策略气泡）并完成视觉走查修正：1440 / 834 / 390 三断点适配、暗色变体补齐、全部文本对比度达到 WCAG AA。',
    pageCount: 8, componentCount: 18,
    diffFromPrev: {
      addedPages: [],
      removedPages: [],
      modifiedPages: ['PTP-05', 'PTP-08'],
      addedComponents: ['PTC-12'],
    },
    snapshotUrl: 'https://axhub.intra.example.com/snapshot/AXH-PRJ-2401/v1.1',
    isBaseline: false, tone: 'info',
  },
  {
    id: 'PTV-05', jobId: 'PT-01', version: 'v1.2', createdAt: '2026-03-13 17:05', createdBy: 'u-lin',
    changeSummary: '林知远批准并锁定为基线：按 PTR-08 为导出弹窗补齐审批单号与脱敏策略版本号字段，8 页全部 approved，导出 make / figma / html 三种格式并挂载为 G1 需求门禁证据。',
    pageCount: 8, componentCount: 18,
    diffFromPrev: {
      addedPages: [],
      removedPages: [],
      modifiedPages: ['PTP-07'],
      addedComponents: [],
    },
    snapshotUrl: 'https://axhub.intra.example.com/snapshot/AXH-PRJ-2401/v1.2',
    isBaseline: true, tone: 'ok',
  },
  {
    id: 'PTV-06', jobId: 'PT-02', version: 'v0.1', createdAt: '2026-03-19 09:41', createdBy: 'ai',
    changeSummary: '拆单域首次出版本：已产出 6 页骨架，其中 PTP-09 / PTP-11 / PTP-12 / PTP-13 四页完成组件映射并纳入本快照；PTP-10 规则编辑器因 PTR-11 暂停派生自定义组件，PTP-14 待映射，交互流与视觉步骤尚未执行。',
    pageCount: 4, componentCount: 12,
    diffFromPrev: {
      addedPages: ['PTP-09', 'PTP-11', 'PTP-12', 'PTP-13'],
      removedPages: [],
      modifiedPages: [],
      addedComponents: [],
    },
    snapshotUrl: 'https://axhub.intra.example.com/snapshot/AXH-PRJ-2404/v0.1',
    isBaseline: false, tone: 'ai',
  },
];

/* ==== 2. 接口自动化测试（对标 hifox） ==== */

/** 接口自动化用例的执行步骤 */
export interface ApiCaseStepDef {
  order: number;
  /** 操作描述 */
  action: string;
  /** 预期结果 */
  expect: string;
}

/** 接口自动化用例（区别于 data.ts 中 TC-001 ~ TC-020 的功能测试用例，可与之交叉引用） */
export interface ApiCaseDef {
  id: string;
  name: string;
  /** 关联的接口契约 id（取自 data.ts 的 API_CONTRACTS） */
  apiContractId: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 与契约 path 完全一致 */
  path: string;
  /** 归属测试模块 id（tm-*） */
  moduleId: string;
  caseType: '正向' | '异常' | '边界' | '幂等' | '并发' | '安全' | '性能';
  priority: 'P0' | 'P1' | 'P2';
  source: 'ai-generated' | 'imported' | 'manual';
  /** 生成该用例的 Agent id，非 AI 生成为 null */
  generatedBy: string | null;
  status: 'active' | 'draft' | 'deprecated' | 'flaky';
  lastRunStatus: 'passed' | 'failed' | 'blocked' | 'skipped' | 'pending';
  lastRunAt: string;
  avgDurationMs: number;
  p95DurationMs: number;
  /** 归档执行中的通过率（%）= 通过次数 / runCount */
  passRatePct: number;
  /** 参与的归档执行次数（API_TEST_RUNS） */
  runCount: number;
  assertionCount: number;
  steps: ApiCaseStepDef[];
  /** 用到的变量名 */
  variables: string[];
  tags: string[];
  /** 责任人 userId */
  owner: string;
  tone: Tone;
  desc: string;
}

/**
 * 16 条接口自动化用例，全部挂在 API_CONTRACTS 的真实契约与真实 path / method 上。
 * 来源分布：ai-generated 14 条、imported 1 条（AC-12，由 JMeter 脚本导入）、manual 1 条（AC-16）。
 * 类型覆盖：幂等 1、并发 2、异常 3、边界 2、性能 2、安全 4、正向 2（合计 16）。
 * runCount 与 passRatePct 由 API_TEST_RUNS 的 8 次归档执行逐条累计得出（合计 27 次用例执行 / 19 次通过 = 70.4%）。
 * avgDurationMs 与所属契约的 p99Ms 同量级，AC-12 的 p95DurationMs 342ms 与 TEST_REPORT.perf.api03P95Ms 一致。
 */
export const API_CASES: ApiCaseDef[] = [
  {
    id: 'AC-01', name: '相同 Idempotency-Key 在 24h 窗口内重复提交仅生成一笔订单',
    apiContractId: 'API-01', method: 'POST', path: '/api/v2/orders', moduleId: 'tm-create',
    caseType: '幂等', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'passed', lastRunAt: '2026-03-17 11:11',
    avgDurationMs: 152, p95DurationMs: 186, passRatePct: 100, runCount: 4, assertionCount: 6,
    steps: [
      { order: 1, action: '生成 UUID 作为 Idempotency-Key，POST /api/v2/orders 提交首单', expect: 'HTTP 201，返回 orderNo 与 state=CREATING' },
      { order: 2, action: '携带同一 Idempotency-Key 立即重复提交相同请求体', expect: 'HTTP 200，code=ORDER_DUPLICATED，orderNo 与首单完全一致' },
      { order: 3, action: '间隔 3s 第三次重复提交', expect: '仍返回首次结果，DB order 表按该 Key 仅 1 条记录' },
      { order: 4, action: '查询 Redis idem:{key} 与 MySQL 唯一索引 uk_idempotency_key', expect: '两级均已落记录，TTL 剩余 ≈ 24h' },
    ],
    variables: ['idempotencyKey', 'orderNo', 'buyerId'],
    tags: ['幂等', 'REQ-2401', 'P0', '关键路径'], owner: 'u-he', tone: 'ok',
    desc: '对应 REQ-2401 幂等下单与 US-01，交叉引用功能用例 TC-001。验证 Redis SETNX 快路径与 MySQL 唯一索引兜底的双级校验语义。',
  },
  {
    id: 'AC-02', name: '订单详情缓存命中与 binlog 失效一致性（更新后 3 秒内不得脏读）',
    apiContractId: 'API-02', method: 'GET', path: '/api/v2/orders/{orderNo}', moduleId: 'tm-perf',
    caseType: '边界', priority: 'P1', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'failed', lastRunAt: '2026-03-18 10:41',
    avgDurationMs: 38, p95DurationMs: 46, passRatePct: 0, runCount: 1, assertionCount: 5,
    steps: [
      { order: 1, action: 'GET /api/v2/orders/{orderNo} 首次读取并记录 dataVersion', expect: 'HTTP 200，cacheHit=false（回源分片库）' },
      { order: 2, action: '再次 GET 同一订单', expect: 'cacheHit=true，dataVersion 与首次一致' },
      { order: 3, action: '通过状态流转接口把订单推进到 PAID，等待 3s', expect: 'Canal 已消费 binlog 并广播本地缓存失效' },
      { order: 4, action: '第三次 GET 订单详情', expect: 'state=PAID 且 dataVersion 递增；Caffeine 本地层与 Redis 层均不得返回旧值' },
    ],
    variables: ['orderNo', 'dataVersion'],
    tags: ['多级缓存', 'REQ-2404', 'binlog 一致性'], owner: 'u-meng', tone: 'danger',
    desc: '当前失败：本地缓存层未广播失效，binlog 更新后 3 秒内仍读到旧 state（BUG-1048，P1，analyzing）。修复归属 TASK-2412。',
  },
  {
    id: 'AC-03', name: '50 并发同 Idempotency-Key 提交仅 1 笔落单且不产生半提交',
    apiContractId: 'API-01', method: 'POST', path: '/api/v2/orders', moduleId: 'tm-create',
    caseType: '并发', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'failed', lastRunAt: '2026-03-10 10:31',
    avgDurationMs: 214, p95DurationMs: 318, passRatePct: 0, runCount: 1, assertionCount: 7,
    steps: [
      { order: 1, action: '以同一 Idempotency-Key 启动 50 线程并发 POST /api/v2/orders', expect: '仅 1 个请求返回 201，其余 49 个返回 ORDER_DUPLICATED' },
      { order: 2, action: '查询 order 表与 order_item 表', expect: '按该 Key 仅 1 条主记录，子表行数与请求体一致' },
      { order: 3, action: '检查是否存在 state=CREATING 的残留订单', expect: '无残留；超时请求必须整单回滚' },
      { order: 4, action: '检查优惠券核销记录', expect: '仅 1 条核销，无因并发导致的误核销' },
    ],
    variables: ['idempotencyKey', 'concurrentThreads', 'orderNo'],
    tags: ['并发', '幂等', 'REQ-2401', 'P0', '数据驱动 ADS-01'], owner: 'u-he', tone: 'danger',
    desc: '当前失败：Redis SETNX 超时后回落 DB 唯一索引前，事务已写入 order 主表，产生 CREATING 残留与优惠券误核销（BUG-1045，P0，analyzing）。与 AC-09 同属事务边界问题。',
  },
  {
    id: 'AC-04', name: '库存不足时订单自动关闭并释放已核销优惠',
    apiContractId: 'API-01', method: 'POST', path: '/api/v2/orders', moduleId: 'tm-create',
    caseType: '异常', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'passed', lastRunAt: '2026-03-10 10:31',
    avgDurationMs: 176, p95DurationMs: 198, passRatePct: 100, runCount: 1, assertionCount: 6,
    steps: [
      { order: 1, action: '用 Mock MK-01 把库存中心扣减响应改为 STOCK_NOT_ENOUGH，POST /api/v2/orders', expect: 'HTTP 409，code=STOCK_NOT_ENOUGH' },
      { order: 2, action: '查询订单状态', expect: 'state=CLOSED，closeReason=库存不足' },
      { order: 3, action: '查询优惠核销记录与 rollbackToken', expect: '已核销券按 rollbackToken 补偿释放，无悬挂核销记录' },
      { order: 4, action: '检查审计流水', expect: '写入 CREATING→CLOSED 一条流转，operator=SYSTEM' },
    ],
    variables: ['idempotencyKey', 'orderNo', 'rollbackToken'],
    tags: ['异常', '补偿回滚', 'REQ-2401', 'Mock MK-01'], owner: 'u-zhou', tone: 'ok',
    desc: '覆盖 TASK-2403 库存扣减事务边界收敛与失败补偿回滚，是 G3 覆盖率缺口 InventoryDeductService#rollback 分支的接口级验证。',
  },
  {
    id: 'AC-05', name: '券 + 满减 + 会员价三重叠加分摊金额之和恒等于应付（128 组数据驱动）',
    apiContractId: 'API-07', method: 'POST', path: '/api/v2/promotions/trial', moduleId: 'tm-promo',
    caseType: '边界', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'failed', lastRunAt: '2026-03-13 02:26',
    avgDurationMs: 92, p95DurationMs: 98, passRatePct: 0, runCount: 1, assertionCount: 8,
    steps: [
      { order: 1, action: '按 ADS-02 逐行注入 couponAmount / fullReductionAmount / memberDiscount，POST /api/v2/promotions/trial', expect: 'HTTP 200，返回 ruleVersion 与逐行分摊明细' },
      { order: 2, action: '对每行校验 Σ(分摊金额) 与 payableAmount 的差值', expect: '差值恒为 0.00（BigDecimal 字符串比较，禁止浮点）' },
      { order: 3, action: '校验负向分摊行（退款 / 取消场景）', expect: '负向行分摊之和等于负向应付，余数归集到金额绝对值最大行' },
      { order: 4, action: '校验互斥命中场景', expect: '返回 code=PROMO_CONFLICT 并给出唯一生效项与优先级依据' },
    ],
    variables: ['ruleVersion', 'payableAmount', 'couponAmount', 'fullReductionAmount', 'memberDiscount'],
    tags: ['金额精度', 'REQ-2403', 'BUG-1043', '数据驱动 ADS-02'], owner: 'u-zhou', tone: 'danger',
    desc: '当前失败：128 组中 3 组负向分摊出现恒定 0.01 元尾差（BUG-1043，资损级，fixing）。根因为 AmountAllocator 逐行 setScale(2, HALF_UP) 且余数未归集，MR-2410 剩 1 条 must-fix 未合入。',
  },
  {
    id: 'AC-06', name: '优惠核销与订单创建同事务回滚，不产生悬挂核销记录',
    apiContractId: 'API-08', method: 'POST', path: '/api/v2/promotions/apply', moduleId: 'tm-promo',
    caseType: '异常', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'passed', lastRunAt: '2026-03-17 11:11',
    avgDurationMs: 104, p95DurationMs: 126, passRatePct: 100, runCount: 4, assertionCount: 5,
    steps: [
      { order: 1, action: 'POST /api/v2/promotions/apply 携带订单事务上下文与 rollbackToken', expect: 'HTTP 200，核销成功且返回 rollbackToken' },
      { order: 2, action: '用 Mock MK-05 让券中心返回 COUPON_USED，重新触发核销', expect: 'HTTP 409，code=COUPON_USED，订单事务整体回滚' },
      { order: 3, action: '查询核销流水表', expect: '无 status=PENDING 的悬挂记录，已核销项按 rollbackToken 释放' },
    ],
    variables: ['rollbackToken', 'orderNo', 'ruleVersion'],
    tags: ['事务边界', 'REQ-2403', 'Mock MK-05'], owner: 'u-shen', tone: 'ok',
    desc: '验证 API-08 v2.0 新增的 rollbackToken 补偿释放能力，覆盖 TASK-2410 与 TASK-2403 的共同事务边界。',
  },
  {
    id: 'AC-07', name: '非法状态流转被拦截并返回允许的下一状态集合',
    apiContractId: 'API-05', method: 'POST', path: '/api/v2/orders/{orderNo}/state-transitions', moduleId: 'tm-state',
    caseType: '异常', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'passed', lastRunAt: '2026-03-17 11:11',
    avgDurationMs: 62, p95DurationMs: 74, passRatePct: 100, runCount: 3, assertionCount: 5,
    steps: [
      { order: 1, action: '对 state=CLOSED 的订单 POST 目标状态 PAID', expect: 'HTTP 422，code=ORDER_STATE_ILLEGAL' },
      { order: 2, action: '解析响应体 allowedNextStates 字段', expect: '返回空集合且附可解释原因文案' },
      { order: 3, action: '对 state=CREATING 的订单 POST 目标状态 SHIPPED（跳过 PAID）', expect: 'HTTP 422，allowedNextStates=[PAID, CLOSED]' },
      { order: 4, action: '携带过期 ruleVersion 重放合法流转', expect: 'HTTP 409，code=RULE_VERSION_STALE，提示重试' },
    ],
    variables: ['orderNo', 'targetState', 'ruleVersion', 'operatorType'],
    tags: ['状态机', 'REQ-2402', '可解释错误码'], owner: 'u-zhou', tone: 'ok',
    desc: '覆盖 TASK-2406 统一状态机组件对 6 处 if-else 的替换结果，验证 10 态 42 条流转边中的非法边拦截。',
  },
  {
    id: 'AC-08', name: '状态流转接口 P95 ≤ 200ms（审计流水改异步后回归）',
    apiContractId: 'API-05', method: 'POST', path: '/api/v2/orders/{orderNo}/state-transitions', moduleId: 'tm-state',
    caseType: '性能', priority: 'P1', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'flaky', lastRunStatus: 'passed', lastRunAt: '2026-03-18 10:41',
    avgDurationMs: 58, p95DurationMs: 62, passRatePct: 75, runCount: 4, assertionCount: 3,
    steps: [
      { order: 1, action: '以 200 并发持续 60s 执行合法流转 CREATING→PAID', expect: '错误率 < 0.05%，无 RULE_VERSION_STALE' },
      { order: 2, action: '统计响应耗时分布', expect: 'P95 ≤ 200ms 且 P99 ≤ 契约基线 68ms 的 1.5 倍' },
      { order: 3, action: '校验 order_state_log 异步落库延迟', expect: '流水最终写入延迟 ≤ 1s，无丢行' },
    ],
    variables: ['orderNo', 'concurrentThreads', 'durationSec'],
    tags: ['性能', 'REQ-2402', 'BUG-1055', 'flaky'], owner: 'u-meng', tone: 'warn',
    desc: '状态标记为 flaky：03-16 归档执行中因同步写流水使 P95 升至 380ms（BUG-1055，已关闭），改异步后 P95 回落至 62ms，但耗时断言在高负载节点上仍有约 7% 抖动。',
  },
  {
    id: 'AC-09', name: '并发取消同一订单不产生重复状态流水，下游仅收到一次事件',
    apiContractId: 'API-04', method: 'POST', path: '/api/v2/orders/{orderNo}/cancel', moduleId: 'tm-state',
    caseType: '并发', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'failed', lastRunAt: '2026-03-10 10:31',
    avgDurationMs: 138, p95DurationMs: 168, passRatePct: 0, runCount: 1, assertionCount: 6,
    steps: [
      { order: 1, action: '20 线程并发 POST /api/v2/orders/{orderNo}/cancel（reason=USER_CANCEL）', expect: '仅 1 个返回 200，其余返回 ORDER_STATE_ILLEGAL' },
      { order: 2, action: '查询 order_state_log', expect: 'PAID→CLOSED 流水恰好 1 条，无重复行' },
      { order: 3, action: '订阅 trade.order.state.changed 并统计消息数', expect: '恰好收到 1 条事件，traceId 唯一' },
      { order: 4, action: '查询库存释放与优惠退回记录', expect: '各 1 条，无重复释放' },
    ],
    variables: ['orderNo', 'concurrentThreads', 'reason'],
    tags: ['并发', '状态机', 'REQ-2402', 'BUG-1046', '数据驱动 ADS-01'], owner: 'u-he', tone: 'danger',
    desc: '当前失败：并发取消产生 2~3 条重复状态流水，下游收到多次事件（BUG-1046，P0，fixing）。与 AC-03 根因同为缺少统一事务边界与幂等写入。',
  },
  {
    id: 'AC-10', name: '越权访问他人订单返回 ORDER_FORBIDDEN 并写入审计与告警',
    apiContractId: 'API-02', method: 'GET', path: '/api/v2/orders/{orderNo}', moduleId: 'tm-sec',
    caseType: '安全', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'passed', lastRunAt: '2026-03-19 17:58',
    avgDurationMs: 40, p95DurationMs: 44, passRatePct: 100, runCount: 1, assertionCount: 5,
    steps: [
      { order: 1, action: '用 ADS-04 中 attackerToken 访问 victimOrderNo', expect: 'HTTP 403，code=ORDER_FORBIDDEN，响应体不含任何订单字段' },
      { order: 2, action: '查询审计表 access_audit_log', expect: '写入 1 条越权记录，含 attackerId / victimOrderNo / traceId / clientIp' },
      { order: 3, action: '检查告警通道', expect: '1 分钟内触发安全告警至值班群' },
      { order: 4, action: '连续 5 次越权后再次访问', expect: '触发限流并返回 429，账号进入临时观察名单' },
    ],
    variables: ['attackerToken', 'victimOrderNo', 'traceId'],
    tags: ['越权', 'REQ-2408', '安全红线', '数据驱动 ADS-04'], owner: 'u-he', tone: 'ok',
    desc: '合规红线用例，纳入 AS-05 并挂 G4 / G5 / G6 三道门禁；与功能用例 TC-019 交叉覆盖同一验收标准。',
  },
  {
    id: 'AC-11', name: '订单详情响应体敏感字段按 rd-01 / rd-03 / rd-06 规则脱敏',
    apiContractId: 'API-02', method: 'GET', path: '/api/v2/orders/{orderNo}', moduleId: 'tm-sec',
    caseType: '安全', priority: 'P1', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'passed', lastRunAt: '2026-03-19 17:58',
    avgDurationMs: 42, p95DurationMs: 46, passRatePct: 100, runCount: 1, assertionCount: 6,
    steps: [
      { order: 1, action: '以客服角色 GET 订单详情', expect: 'receiverPhone 形如 138****6621（rd-01 中间四位掩码）' },
      { order: 2, action: '校验收货地址字段', expect: 'receiverAddress 形如 浙江省杭州市西湖区****（rd-03 保留省市区）' },
      { order: 3, action: '校验收货人姓名与邮箱', expect: 'receiverName 形如 林**（rd-06），buyerEmail 形如 lin***@example.com（rd-05）' },
      { order: 4, action: '以合规审计角色（二次授权）重新请求', expect: '返回明文并写入 1 条敏感字段访问审计' },
    ],
    variables: ['orderNo', 'roleScope', 'approvalId'],
    tags: ['脱敏', 'REQ-2408', 'ac-mask-sdk'], owner: 'u-he', tone: 'ok',
    desc: '验证 ac-mask-sdk（SEC-MASK-2.1）在接口出口的统一脱敏；与 BUG-1054 的导出链路脱敏漏网形成对照，接口侧达标而导出侧未达标。',
  },
  {
    id: 'AC-12', name: '订单列表跨分片游标深分页（10 万偏移）P95 ≤ 200ms',
    apiContractId: 'API-03', method: 'GET', path: '/api/v2/orders', moduleId: 'tm-perf',
    caseType: '性能', priority: 'P1', source: 'imported', generatedBy: null,
    status: 'active', lastRunStatus: 'failed', lastRunAt: '2026-03-18 10:41',
    avgDurationMs: 268, p95DurationMs: 342, passRatePct: 0, runCount: 1, assertionCount: 4,
    steps: [
      { order: 1, action: '按 ADS-03 逐行注入 cursor 与 timeRange，GET /api/v2/orders（偏移至 10 万级）', expect: 'HTTP 200，返回下一页 cursor 且无重复行' },
      { order: 2, action: '统计 8 个分片的归并耗时', expect: 'P95 ≤ 200ms（REQ-2404 承诺基线）' },
      { order: 3, action: '用 Mock MK-08 让 ES 返回 503，重放同一查询', expect: 'code=ES_DEGRADED，自动回源 DB 只读从库并标记 degraded' },
    ],
    variables: ['cursor', 'pageSize', 'timeRangeStart', 'timeRangeEnd', 'shardIndex'],
    tags: ['性能', '深分页', 'REQ-2404', 'BUG-1047', '数据驱动 ADS-03', 'JMeter 导入'], owner: 'u-meng', tone: 'danger',
    desc: '由 TP-03 的 JMeter 脚本导入（source=imported）。当前失败：10 万偏移处退化为跨 8 分片归并排序，P95 342ms 超 200ms 基线 71%（BUG-1047，P1，fixing）。',
  },
  {
    id: 'AC-13', name: '优惠规则查询返回互斥组与优先级，规则变更后 5 分钟内全节点生效',
    apiContractId: 'API-09', method: 'GET', path: '/api/v2/promotions/rules', moduleId: 'tm-promo',
    caseType: '正向', priority: 'P2', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'passed', lastRunAt: '2026-03-13 02:26',
    avgDurationMs: 22, p95DurationMs: 28, passRatePct: 100, runCount: 1, assertionCount: 4,
    steps: [
      { order: 1, action: 'GET /api/v2/promotions/rules?bizLine=order', expect: 'HTTP 200，返回 exclusiveGroup / priority / allocationStrategy 三字段' },
      { order: 2, action: '在 Nacos 修改互斥组配置并等待 5 分钟', expect: '全部节点 ruleVersion 一致递增' },
      { order: 3, action: '请求未配置的业务线', expect: 'HTTP 404，code=RULE_NOT_FOUND' },
    ],
    variables: ['bizLine', 'ruleVersion'],
    tags: ['规则引擎', 'REQ-2403', '热更新'], owner: 'u-zhou', tone: 'ok',
    desc: '为 AC-05 提供 ruleVersion 前置数据，保证试算与下单使用同一规则版本；同时是 PTR-11 中拆单规则互斥语义的对齐依据。',
  },
  {
    id: 'AC-14', name: '未获二次授权直接导出必须被拒绝且行为落审计',
    apiContractId: 'API-13', method: 'POST', path: '/api/v2/orders/export', moduleId: 'tm-sec',
    caseType: '安全', priority: 'P0', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'failed', lastRunAt: '2026-03-19 17:58',
    avgDurationMs: 2480, p95DurationMs: 2860, passRatePct: 0, runCount: 1, assertionCount: 5,
    steps: [
      { order: 1, action: '不携带 approvalId 直接 POST /api/v2/orders/export', expect: 'HTTP 403，code=EXPORT_NEED_APPROVAL，未产生任何文件' },
      { order: 2, action: '查询导出审计表 export_audit_log', expect: '写入 1 条被拒记录，含申请人 / 字段范围 / 拒绝原因' },
      { order: 3, action: '携带已过期的 approvalId 重试', expect: 'HTTP 403，提示审批单已失效' },
      { order: 4, action: '请求导出 12 万行', expect: 'HTTP 422，code=EXPORT_ROW_LIMIT，给出分批建议' },
    ],
    variables: ['approvalId', 'fieldScope', 'rowCount', 'maskPolicyVersion'],
    tags: ['二次授权', 'REQ-2408', 'BUG-1052', '合规高危'], owner: 'u-he', tone: 'danger',
    desc: '当前失败：OrderExportController 仅校验登录态、未接入审批中心，审计切面也未覆盖导出方法（BUG-1052，合规高危，new）。修复归属 TASK-2423（refined 态，尚未开发）。',
  },
  {
    id: 'AC-15', name: '导出 CSV 中 addressDetail 与 receiverPhone 必须脱敏，禁止明文输出',
    apiContractId: 'API-13', method: 'POST', path: '/api/v2/orders/export', moduleId: 'tm-sec',
    caseType: '安全', priority: 'P1', source: 'ai-generated', generatedBy: 'ag-test',
    status: 'active', lastRunStatus: 'failed', lastRunAt: '2026-03-19 17:58',
    avgDurationMs: 2520, p95DurationMs: 2940, passRatePct: 0, runCount: 1, assertionCount: 6,
    steps: [
      { order: 1, action: '携带合法 approvalId 导出 1,000 行样本', expect: 'HTTP 200，返回 CSV 下载链接与 maskPolicyVersion=SEC-MASK-2.1' },
      { order: 2, action: '解析 CSV 的 addressDetail 列', expect: '全部形如 浙江省杭州市西湖区****，不得出现门牌号' },
      { order: 3, action: '解析 receiverPhone / buyerIdCard / payCardNo 列', expect: '分别符合 rd-01 / rd-02 / rd-04 掩码格式' },
      { order: 4, action: '对全文做敏感模式扫描（手机号 / 身份证 / 银行卡正则）', expect: '命中数为 0' },
    ],
    variables: ['approvalId', 'maskPolicyVersion', 'sampleRows'],
    tags: ['脱敏', 'REQ-2408', 'BUG-1054', '合规高危', '数据驱动 ADS-04'], owner: 'u-he', tone: 'danger',
    desc: '当前失败：导出 CSV 的 addressDetail 字段脱敏漏网，明文输出完整收货地址（BUG-1054，fixing）。与 AC-11 对照可见接口出口已脱敏、导出通道未接入 ac-mask-sdk。',
  },
  {
    id: 'AC-16', name: '迁移批次断点续传与差异比对（单批 ≤ 5 万条）',
    apiContractId: 'API-14', method: 'POST', path: '/internal/migrate/batch', moduleId: 'tm-migrate',
    caseType: '正向', priority: 'P1', source: 'manual', generatedBy: null,
    status: 'draft', lastRunStatus: 'passed', lastRunAt: '2026-03-17 15:43',
    avgDurationMs: 4620, p95DurationMs: 4980, passRatePct: 100, runCount: 1, assertionCount: 5,
    steps: [
      { order: 1, action: 'POST /internal/migrate/batch 提交 5 万条批次', expect: 'HTTP 202，返回 batchId 与 checkpointId' },
      { order: 2, action: '在第 3 万条处注入中断，重新以同 checkpointId 提交', expect: '从断点续传，不重复迁移已完成行' },
      { order: 3, action: '批次完成后触发全量差异比对', expect: 'diffCount=0，批次状态置 SUCCESS' },
      { order: 4, action: '构造 1 行差异后重跑比对', expect: 'code=MIGRATE_DIFF_FOUND，作业自动暂停并告警' },
    ],
    variables: ['batchId', 'checkpointId', 'batchSize', 'diffCount'],
    tags: ['迁移', 'REQ-2407', '断点续传', 'BLOCK-0312'], owner: 'u-shen', tone: 'info',
    desc: '由沈亦白手工编写（source=manual），当前为 draft 态：API-14 契约仍是草稿且迁移作业实例被 BLOCK-0312 阻塞，仅在 env-dev 完成过 1 次试跑。',
  },
];

/** 接口场景编排（对标 hifox 场景链） */
export interface ApiScenarioDef {
  id: string;
  name: string;
  desc: string;
  /** 编排的真实用例 id（AC-01 ~ AC-16），3~6 个 */
  caseIds: string[];
  /** 步骤数，等于 API_SCENARIO_STEPS 中该场景的记录条数 */
  stepCount: number;
  triggerType: 'manual' | 'ci' | 'schedule' | 'event';
  /** triggerType 为 schedule 时的 cron 表达式，其余为空串 */
  cronExpr: string;
  envIds: string[];
  /** 数据驱动集 id（ADS-01 ~ ADS-04），无则为 null */
  dataDrivenSetId: string | null;
  timeoutSec: number;
  retryPolicy: { maxAttempts: number; backoffMs: number };
  status: 'active' | 'draft' | 'disabled';
  lastRunId: string;
  lastRunStatus: 'passed' | 'failed' | 'blocked' | 'skipped' | 'pending';
  lastRunAt: string;
  /** 归档执行的平均端到端耗时（毫秒） */
  avgDurationMs: number;
  /** 归档执行的平均通过率（%） */
  passRatePct: number;
  /** 关联的质量门禁 id */
  gateIds: string[];
  owner: string;
  tone: Tone;
}

/**
 * 5 条接口场景编排，stepCount 之和 = 22（与 API_SCENARIO_STEPS 记录数一致）。
 * lastRunId / lastRunStatus / lastRunAt 与 API_TEST_RUNS 逐条对应；
 * avgDurationMs 与 passRatePct 为该场景全部归档执行（AS-01 有 3 次，其余各 1 次）的均值。
 */
export const API_SCENARIOS: ApiScenarioDef[] = [
  {
    id: 'AS-01',
    name: '下单全链路：幂等创建 → 优惠核销 → 状态流转 → 审计留痕校验',
    desc: '订单中心重构的主干冒烟场景，覆盖 API-01 / API-08 / API-05 三份已冻结契约，每次代码入测试环境即由 Jenkins 触发，是 G3 编码门禁的准入依据。',
    caseIds: ['AC-01', 'AC-06', 'AC-07', 'AC-08'],
    stepCount: 5,
    triggerType: 'ci',
    cronExpr: '',
    envIds: ['env-test', 'env-staging'],
    dataDrivenSetId: null,
    timeoutSec: 900,
    retryPolicy: { maxAttempts: 2, backoffMs: 500 },
    status: 'active',
    lastRunId: 'AR-05',
    lastRunStatus: 'passed',
    lastRunAt: '2026-03-17 11:11',
    avgDurationMs: 457333,
    passRatePct: 91.7,
    gateIds: ['G3', 'G4'],
    owner: 'u-he',
    tone: 'ok',
  },
  {
    id: 'AS-02',
    name: '幂等与并发一致性：重复提交 / 并发下单 / 库存回滚 / 并发取消',
    desc: '由「订单创建」领域事件触发的资损红线场景，基于 ADS-01 的 64 组数据驱动，重点验证事务边界收敛后不产生半提交、重复流水与误核销。',
    caseIds: ['AC-01', 'AC-03', 'AC-04', 'AC-09'],
    stepCount: 5,
    triggerType: 'event',
    cronExpr: '',
    envIds: ['env-test'],
    dataDrivenSetId: 'ADS-01',
    timeoutSec: 1800,
    retryPolicy: { maxAttempts: 2, backoffMs: 500 },
    status: 'active',
    lastRunId: 'AR-02',
    lastRunStatus: 'failed',
    lastRunAt: '2026-03-10 10:31',
    avgDurationMs: 542000,
    passRatePct: 50,
    gateIds: ['G4'],
    owner: 'u-zhou',
    tone: 'danger',
  },
  {
    id: 'AS-03',
    name: '优惠金额精度回归：128 组边界数据驱动 + ruleVersion 强一致',
    desc: '每日 02:20 定时执行的资损防护场景，先拉取 ruleVersion 再试算，按 ADS-02 的 128 组边界数据逐行校验分摊之和恒等于应付，直接对应 BUG-1043。',
    caseIds: ['AC-05', 'AC-06', 'AC-13'],
    stepCount: 4,
    triggerType: 'schedule',
    cronExpr: '0 20 2 * * ?',
    envIds: ['env-test'],
    dataDrivenSetId: 'ADS-02',
    timeoutSec: 2400,
    retryPolicy: { maxAttempts: 3, backoffMs: 1500 },
    status: 'active',
    lastRunId: 'AR-03',
    lastRunStatus: 'failed',
    lastRunAt: '2026-03-13 02:26',
    avgDurationMs: 404000,
    passRatePct: 66.7,
    gateIds: ['G4'],
    owner: 'u-zhou',
    tone: 'danger',
  },
  {
    id: 'AS-04',
    name: '性能与容量基线：列表深分页 / 详情缓存一致性 / 状态流转 P95',
    desc: '每周一 03:30 定时执行的性能基线场景，也支持手动加跑；断言口径直接取 REQ-2404 的 P95 ≤ 200ms 与缓存 3 秒一致性窗口，结果回写 G4 与 G5。',
    caseIds: ['AC-12', 'AC-02', 'AC-08'],
    stepCount: 4,
    triggerType: 'schedule',
    cronExpr: '0 30 3 ? * MON',
    envIds: ['env-staging'],
    dataDrivenSetId: 'ADS-03',
    timeoutSec: 3600,
    retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    status: 'active',
    lastRunId: 'AR-07',
    lastRunStatus: 'failed',
    lastRunAt: '2026-03-18 10:41',
    avgDurationMs: 918000,
    passRatePct: 33.3,
    gateIds: ['G4', 'G5'],
    owner: 'u-meng',
    tone: 'danger',
  },
  {
    id: 'AS-05',
    name: '安全合规红线：越权拦截 / 字段脱敏 / 导出二次授权 / 导出脱敏',
    desc: 'REQ-2408 的合规验收场景，随需求级流水线触发；任一用例失败即判 G4 不通过并阻断 REL-2403 审批，同时联动 G6 观测门禁的审计留痕项。',
    caseIds: ['AC-10', 'AC-11', 'AC-14', 'AC-15'],
    stepCount: 4,
    triggerType: 'ci',
    cronExpr: '',
    envIds: ['env-staging'],
    dataDrivenSetId: 'ADS-04',
    timeoutSec: 1800,
    retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    status: 'active',
    lastRunId: 'AR-08',
    lastRunStatus: 'failed',
    lastRunAt: '2026-03-19 17:58',
    avgDurationMs: 842000,
    passRatePct: 50,
    gateIds: ['G4', 'G5', 'G6'],
    owner: 'u-he',
    tone: 'danger',
  },
];

/** 场景步骤中的变量提取规则 */
export interface ScenarioExtractVarDef {
  name: string;
  /** 来源 JSONPath */
  fromPath: string;
  /** 注入到后续请求的 JSONPath 位置 */
  toJsonPath: string;
}

/** 场景步骤中的断言 */
export interface ScenarioAssertionDef {
  type: 'status' | 'jsonpath' | 'schema' | 'duration' | 'db';
  /** 断言表达式 */
  expr: string;
  /** 期望值 */
  expected: string;
  onFail: 'abort' | 'continue' | 'retry';
}

/** 接口场景步骤（对标 hifox 场景链节点） */
export interface ApiScenarioStepDef {
  id: string;
  scenarioId: string;
  order: number;
  /** 本步骤执行的用例 id */
  caseId: string;
  stepType: 'request' | 'assert' | 'extract' | 'wait' | 'condition' | 'loop';
  name: string;
  extractVars: ScenarioExtractVarDef[];
  assertions: ScenarioAssertionDef[];
  /** stepType 为 condition 时的条件表达式，否则为 null */
  conditionExpr: string | null;
  /** stepType 为 loop 时的循环数据源，否则为 null */
  loopOver: string | null;
  tone: Tone;
}

/**
 * 22 条场景步骤：AS-01 × 5（ASS-01~05）、AS-02 × 5（ASS-06~10）、AS-03 × 4（ASS-11~14）、
 * AS-04 × 4（ASS-15~18）、AS-05 × 4（ASS-19~22）。
 */
export const API_SCENARIO_STEPS: ApiScenarioStepDef[] = [
  {
    id: 'ASS-01', scenarioId: 'AS-01', order: 1, caseId: 'AC-01', stepType: 'request',
    name: '幂等创建订单（携带客户端生成的 Idempotency-Key）',
    extractVars: [
      { name: 'orderNo', fromPath: '$.data.orderNo', toJsonPath: '$.ctx.orderNo' },
      { name: 'idempotencyKey', fromPath: '$.request.headers["Idempotency-Key"]', toJsonPath: '$.ctx.idempotencyKey' },
    ],
    assertions: [{ type: 'status', expr: 'response.status', expected: '201', onFail: 'abort' }],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-02', scenarioId: 'AS-01', order: 2, caseId: 'AC-01', stepType: 'assert',
    name: '重复提交同 Key，断言返回首单结果与 ORDER_DUPLICATED',
    extractVars: [],
    assertions: [
      { type: 'jsonpath', expr: '$.code', expected: 'ORDER_DUPLICATED', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.orderNo', expected: '${ctx.orderNo}', onFail: 'abort' },
      { type: 'db', expr: 'SELECT COUNT(*) FROM `order` WHERE idempotency_key = ${ctx.idempotencyKey}', expected: '1', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-03', scenarioId: 'AS-01', order: 3, caseId: 'AC-06', stepType: 'request',
    name: '同事务核销优惠并提取 rollbackToken',
    extractVars: [{ name: 'rollbackToken', fromPath: '$.data.rollbackToken', toJsonPath: '$.ctx.rollbackToken' }],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '200', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.ruleVersion', expected: 'notBlank', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-04', scenarioId: 'AS-01', order: 4, caseId: 'AC-07', stepType: 'request',
    name: '状态流转 CREATING → PAID，并校验非法流转被拦截',
    extractVars: [{ name: 'transitionId', fromPath: '$.data.transitionId', toJsonPath: '$.ctx.transitionId' }],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '200', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.to', expected: 'PAID', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.traceId', expected: 'notBlank', onFail: 'continue' },
    ],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-05', scenarioId: 'AS-01', order: 5, caseId: 'AC-08', stepType: 'assert',
    name: '审计流水落库校验 + 状态流转接口 P95 断言',
    extractVars: [],
    assertions: [
      { type: 'db', expr: 'SELECT COUNT(*) FROM order_state_log WHERE transition_id = ${ctx.transitionId}', expected: '1', onFail: 'abort' },
      { type: 'db', expr: 'SELECT operator, reason, trace_id FROM order_state_log WHERE transition_id = ${ctx.transitionId}', expected: 'allNotNull', onFail: 'abort' },
      { type: 'duration', expr: 'p95(stateTransitions)', expected: '<=200ms', onFail: 'continue' },
    ],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-06', scenarioId: 'AS-02', order: 1, caseId: 'AC-01', stepType: 'loop',
    name: '按 ADS-01 的 64 组数据循环执行幂等下单',
    extractVars: [{ name: 'rowOrderNo', fromPath: '$.data.orderNo', toJsonPath: '$.ctx.rowOrderNo' }],
    assertions: [{ type: 'jsonpath', expr: '$.data.orderNo', expected: 'notBlank', onFail: 'continue' }],
    conditionExpr: null, loopOver: 'ADS-01.rows[0..63]', tone: 'ai',
  },
  {
    id: 'ASS-07', scenarioId: 'AS-02', order: 2, caseId: 'AC-03', stepType: 'request',
    name: '50 线程并发提交同一 Idempotency-Key',
    extractVars: [],
    assertions: [
      { type: 'jsonpath', expr: 'count(status==201)', expected: '1', onFail: 'abort' },
      { type: 'jsonpath', expr: 'count(code=="ORDER_DUPLICATED")', expected: '49', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'danger',
  },
  {
    id: 'ASS-08', scenarioId: 'AS-02', order: 3, caseId: 'AC-03', stepType: 'assert',
    name: '半提交检测：不得残留 CREATING 订单与误核销优惠',
    extractVars: [],
    assertions: [
      { type: 'db', expr: 'SELECT COUNT(*) FROM `order` WHERE idempotency_key = ${ctx.idempotencyKey}', expected: '1', onFail: 'abort' },
      { type: 'db', expr: 'SELECT COUNT(*) FROM `order` WHERE idempotency_key = ${ctx.idempotencyKey} AND state = "CREATING"', expected: '0', onFail: 'abort' },
      { type: 'db', expr: 'SELECT COUNT(*) FROM promo_apply_log WHERE order_no = ${ctx.rowOrderNo}', expected: '1', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'danger',
  },
  {
    id: 'ASS-09', scenarioId: 'AS-02', order: 4, caseId: 'AC-04', stepType: 'condition',
    name: '库存不足分支：Mock MK-01 返回 STOCK_NOT_ENOUGH 时校验整单回滚',
    extractVars: [],
    assertions: [
      { type: 'jsonpath', expr: '$.code', expected: 'STOCK_NOT_ENOUGH', onFail: 'continue' },
      { type: 'db', expr: 'SELECT state FROM `order` WHERE order_no = ${ctx.rowOrderNo}', expected: 'CLOSED', onFail: 'abort' },
      { type: 'db', expr: 'SELECT COUNT(*) FROM promo_apply_log WHERE order_no = ${ctx.rowOrderNo} AND state = "RELEASED"', expected: '1', onFail: 'abort' },
    ],
    conditionExpr: 'mock.stockResult == "NOT_ENOUGH"', loopOver: null, tone: 'warn',
  },
  {
    id: 'ASS-10', scenarioId: 'AS-02', order: 5, caseId: 'AC-09', stepType: 'request',
    name: '20 线程并发取消同一订单，断言流水与事件均只产生一次',
    extractVars: [],
    assertions: [
      { type: 'db', expr: 'SELECT COUNT(*) FROM order_state_log WHERE order_no = ${ctx.rowOrderNo} AND to_state = "CLOSED"', expected: '1', onFail: 'abort' },
      { type: 'jsonpath', expr: 'mq.count(trade.order.state.changed, orderNo=${ctx.rowOrderNo})', expected: '1', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'danger',
  },
  {
    id: 'ASS-11', scenarioId: 'AS-03', order: 1, caseId: 'AC-13', stepType: 'request',
    name: '拉取当前生效的优惠规则版本与互斥组配置',
    extractVars: [{ name: 'ruleVersion', fromPath: '$.data.ruleVersion', toJsonPath: '$.ctx.ruleVersion' }],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '200', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.exclusiveGroup', expected: 'notBlank', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-12', scenarioId: 'AS-03', order: 2, caseId: 'AC-05', stepType: 'loop',
    name: '按 ADS-02 的 128 组边界数据循环试算',
    extractVars: [{ name: 'trialNo', fromPath: '$.data.trialNo', toJsonPath: '$.ctx.trialNo' }],
    assertions: [{ type: 'jsonpath', expr: '$.data.ruleVersion', expected: '${ctx.ruleVersion}', onFail: 'abort' }],
    conditionExpr: null, loopOver: 'ADS-02.rows[0..127]', tone: 'ai',
  },
  {
    id: 'ASS-13', scenarioId: 'AS-03', order: 3, caseId: 'AC-05', stepType: 'assert',
    name: '分摊零尾差断言：Σ(分摊金额) 恒等于应付金额（BigDecimal 字符串比较）',
    extractVars: [],
    assertions: [
      { type: 'jsonpath', expr: 'sum($.data.allocations[*].amount) - $.data.payableAmount', expected: '0.00', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.tailDiff', expected: '0.00', onFail: 'abort' },
      { type: 'schema', expr: '$.data.allocations[*].amount', expected: 'string(decimal)', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'danger',
  },
  {
    id: 'ASS-14', scenarioId: 'AS-03', order: 4, caseId: 'AC-06', stepType: 'request',
    name: '以同一 ruleVersion 执行核销，验证试算与下单强一致',
    extractVars: [],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '200', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.rollbackToken', expected: 'notBlank', onFail: 'continue' },
      { type: 'jsonpath', expr: '$.data.ruleVersion', expected: '${ctx.ruleVersion}', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-15', scenarioId: 'AS-04', order: 1, caseId: 'AC-12', stepType: 'request',
    name: '按 ADS-03 游标数据执行深分页查询（偏移至 10 万级）',
    extractVars: [{ name: 'nextCursor', fromPath: '$.data.nextCursor', toJsonPath: '$.ctx.nextCursor' }],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '200', onFail: 'abort' },
      { type: 'duration', expr: 'p95(orderList)', expected: '<=200ms', onFail: 'continue' },
    ],
    conditionExpr: null, loopOver: 'ADS-03.rows[0..999]', tone: 'danger',
  },
  {
    id: 'ASS-16', scenarioId: 'AS-04', order: 2, caseId: 'AC-02', stepType: 'wait',
    name: '等待 3 秒 binlog 失效广播窗口',
    extractVars: [],
    assertions: [],
    conditionExpr: null, loopOver: null, tone: 'neutral',
  },
  {
    id: 'ASS-17', scenarioId: 'AS-04', order: 3, caseId: 'AC-02', stepType: 'assert',
    name: '缓存与 DB 一致性断言：本地层与 Redis 层均不得脏读',
    extractVars: [],
    assertions: [
      { type: 'jsonpath', expr: '$.data.state', expected: 'PAID', onFail: 'abort' },
      { type: 'db', expr: 'SELECT state FROM `order` WHERE order_no = ${ctx.orderNo}', expected: 'PAID', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.debug.cacheHit', expected: 'false', onFail: 'continue' },
    ],
    conditionExpr: null, loopOver: null, tone: 'danger',
  },
  {
    id: 'ASS-18', scenarioId: 'AS-04', order: 4, caseId: 'AC-08', stepType: 'request',
    name: '状态流转接口 200 并发压测并采集 P95 / P99',
    extractVars: [],
    assertions: [
      { type: 'duration', expr: 'p95(stateTransitions)', expected: '<=200ms', onFail: 'continue' },
      { type: 'duration', expr: 'p99(stateTransitions)', expected: '<=102ms', onFail: 'continue' },
      { type: 'jsonpath', expr: '$.metrics.errorRate', expected: '<0.0005', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'warn',
  },
  {
    id: 'ASS-19', scenarioId: 'AS-05', order: 1, caseId: 'AC-10', stepType: 'request',
    name: '越权访问他人订单，断言 403 且响应体不含订单字段',
    extractVars: [{ name: 'auditTraceId', fromPath: '$.traceId', toJsonPath: '$.ctx.auditTraceId' }],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '403', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.code', expected: 'ORDER_FORBIDDEN', onFail: 'abort' },
      { type: 'db', expr: 'SELECT COUNT(*) FROM access_audit_log WHERE trace_id = ${ctx.auditTraceId}', expected: '1', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: 'ADS-04.rows[0..41]', tone: 'ok',
  },
  {
    id: 'ASS-20', scenarioId: 'AS-05', order: 2, caseId: 'AC-11', stepType: 'assert',
    name: '响应体敏感字段脱敏断言（rd-01 / rd-03 / rd-05 / rd-06）',
    extractVars: [],
    assertions: [
      { type: 'jsonpath', expr: '$.data.receiverPhone', expected: 'regex:^1\\d{2}\\*{4}\\d{4}$', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.receiverAddress', expected: 'regex:.{3,}(省|市|区)\\*{4}$', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.receiverName', expected: 'regex:^\\S\\*{1,3}$', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'ok',
  },
  {
    id: 'ASS-21', scenarioId: 'AS-05', order: 3, caseId: 'AC-14', stepType: 'request',
    name: '未携带审批单号直接导出，断言被拒并落审计',
    extractVars: [],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '403', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.code', expected: 'EXPORT_NEED_APPROVAL', onFail: 'abort' },
      { type: 'db', expr: 'SELECT COUNT(*) FROM export_audit_log WHERE result = "DENIED" AND applicant = ${ctx.operatorId}', expected: '>=1', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'danger',
  },
  {
    id: 'ASS-22', scenarioId: 'AS-05', order: 4, caseId: 'AC-15', stepType: 'request',
    name: '携合法审批单导出 1,000 行样本，全文扫描敏感模式命中数必须为 0',
    extractVars: [{ name: 'exportUrl', fromPath: '$.data.downloadUrl', toJsonPath: '$.ctx.exportUrl' }],
    assertions: [
      { type: 'status', expr: 'response.status', expected: '200', onFail: 'abort' },
      { type: 'jsonpath', expr: '$.data.maskPolicyVersion', expected: 'SEC-MASK-2.1', onFail: 'abort' },
      { type: 'jsonpath', expr: 'csv.scan(${ctx.exportUrl}, sensitivePatterns).hits', expected: '0', onFail: 'abort' },
    ],
    conditionExpr: null, loopOver: null, tone: 'danger',
  },
];

/** Mock 规则（下游依赖桩，对标 hifox Mock 服务） */
export interface MockRuleDef {
  id: string;
  name: string;
  /** 匹配的下游请求路径 */
  matchPath: string;
  matchMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ANY';
  /** header / body 匹配条件表达式，无条件为空串 */
  matchCondition: string;
  responseType: 'static' | 'template' | 'delay' | 'error' | 'dynamic-ai';
  /** 响应模板 JSON 片段 */
  responseTemplate: string;
  delayMs: number | null;
  errorStatus: number | null;
  /** responseType 为 dynamic-ai 时的生成提示词，否则为空串 */
  aiDynamicPrompt: string;
  /** 近 30 天命中次数 */
  hitCount30d: number;
  enabled: boolean;
  envIds: string[];
  createdBy: string;
  tone: Tone;
}

/**
 * 8 条 Mock 规则，覆盖库存中心、支付网关、WMS、券中心、营销中台、会员中心与 Elasticsearch。
 * 其中 1 条为 AI 动态响应（MK-06），3 条用于混沌 / 错误注入（MK-02 延迟、MK-05 与 MK-08 错误）。
 */
export const MOCK_RULES: MockRuleDef[] = [
  {
    id: 'MK-01', name: '库存中心扣减成功（默认桩）',
    matchPath: '/warehouse/api/v1/stock/deduct', matchMethod: 'POST', matchCondition: '',
    responseType: 'static',
    responseTemplate: '{"code":"SUCCESS","data":{"deductId":"DK202603190001","remainStock":1284,"warehouseId":"WH-HZ-01"},"traceId":"mock-${uuid}"}',
    delayMs: null, errorStatus: null, aiDynamicPrompt: '',
    hitCount30d: 18420, enabled: true, envIds: ['env-dev', 'env-test'], createdBy: 'u-zhou', tone: 'ok',
  },
  {
    id: 'MK-02', name: '库存中心扣减超时（混沌注入）',
    matchPath: '/warehouse/api/v1/stock/deduct', matchMethod: 'POST',
    matchCondition: 'header["X-Chaos-Case"] == "stock-timeout"',
    responseType: 'delay',
    responseTemplate: '{"code":"STOCK_NOT_ENOUGH","data":null,"message":"库存不足，订单自动关闭"}',
    delayMs: 3000, errorStatus: null, aiDynamicPrompt: '',
    hitCount30d: 486, enabled: true, envIds: ['env-test'], createdBy: 'u-he', tone: 'warn',
  },
  {
    id: 'MK-03', name: '支付网关支付结果回调（模板）',
    matchPath: '/pay/api/v1/notify', matchMethod: 'POST', matchCondition: 'body.tradeNo != null',
    responseType: 'template',
    responseTemplate: '{"code":"SUCCESS","data":{"tradeNo":"${body.tradeNo}","payState":"PAID","paidAmount":"${body.amount}","paidAt":"${now.iso8601}","channel":"UNIONPAY"},"sign":"mock-sign-${body.tradeNo}"}',
    delayMs: null, errorStatus: null, aiDynamicPrompt: '',
    hitCount30d: 9640, enabled: true, envIds: ['env-dev', 'env-test', 'env-staging'], createdBy: 'u-zhou', tone: 'ok',
  },
  {
    id: 'MK-04', name: 'WMS 履约部分发货回调（模板）',
    matchPath: '/wms/api/v2/ship-callback', matchMethod: 'POST', matchCondition: 'body.shipType == "PARTIAL"',
    responseType: 'template',
    responseTemplate: '{"code":"SUCCESS","data":{"subOrderNo":"${body.subOrderNo}","shippedQty":${body.qty},"remainQty":${body.remainQty},"protocolVersion":"UNFROZEN","warnCode":"WMS_PROTOCOL_UNFROZEN"},"traceId":"mock-${uuid}"}',
    delayMs: null, errorStatus: null, aiDynamicPrompt: '',
    hitCount30d: 1268, enabled: true, envIds: ['env-test'], createdBy: 'u-shen', tone: 'info',
  },
  {
    id: 'MK-05', name: '券中心校验失败 COUPON_USED（错误注入）',
    matchPath: '/promo-center/api/v1/coupon/verify', matchMethod: 'POST',
    matchCondition: 'body.couponId in ["CPN-DUP-001","CPN-DUP-002"]',
    responseType: 'error',
    responseTemplate: '{"code":"COUPON_USED","message":"优惠券已被核销","data":null}',
    delayMs: null, errorStatus: 409, aiDynamicPrompt: '',
    hitCount30d: 742, enabled: true, envIds: ['env-dev', 'env-test'], createdBy: 'u-he', tone: 'danger',
  },
  {
    id: 'MK-06', name: '营销中台互斥规则（AI 动态生成）',
    matchPath: '/marketing/api/v2/rules', matchMethod: 'GET', matchCondition: 'query.bizLine == "order"',
    responseType: 'dynamic-ai',
    responseTemplate: '{"code":"SUCCESS","data":{"ruleVersion":"${ai.ruleVersion}","exclusiveGroups":${ai.groups},"priorityStrategy":"${ai.strategy}"}}',
    delayMs: null, errorStatus: null,
    aiDynamicPrompt:
      '依据 API-09 的响应 Schema 生成一套营销互斥规则：包含 2~4 个 exclusiveGroup，每组 2~3 个优惠类型（COUPON / FULL_REDUCTION / MEMBER_PRICE），priority 为 1~99 的整数且组内唯一，allocationStrategy 取 PROPORTIONAL 或 MAX_ABSORB；ruleVersion 形如 R20260319-01。禁止输出真实活动名称与内部运营人员姓名，金额一律使用字符串 BigDecimal。',
    hitCount30d: 3186, enabled: true, envIds: ['env-test'], createdBy: 'u-ai-copilot', tone: 'ai',
  },
  {
    id: 'MK-07', name: '会员中心等级查询（静态桩）',
    matchPath: '/member/api/v1/level', matchMethod: 'GET', matchCondition: '',
    responseType: 'static',
    responseTemplate: '{"code":"SUCCESS","data":{"memberId":"M20260001","level":"GOLD","discountRate":"0.95","expireAt":"2026-12-31"},"cacheable":true}',
    delayMs: null, errorStatus: null, aiDynamicPrompt: '',
    hitCount30d: 12480, enabled: true, envIds: ['env-dev', 'env-test', 'env-staging'], createdBy: 'u-shen', tone: 'ok',
  },
  {
    id: 'MK-08', name: 'Elasticsearch 查询降级（503 错误注入）',
    matchPath: '/es-order/_search', matchMethod: 'POST', matchCondition: 'header["X-Chaos-Case"] == "es-down"',
    responseType: 'error',
    responseTemplate: '{"error":{"type":"search_phase_execution_exception","reason":"all shards failed"},"status":503}',
    delayMs: null, errorStatus: 503, aiDynamicPrompt: '',
    hitCount30d: 214, enabled: true, envIds: ['env-test', 'env-staging'], createdBy: 'u-meng', tone: 'warn',
  },
];

/** 数据驱动集的列定义 */
export interface DataSetColumnDef {
  name: string;
  type: string;
  example: string;
  /** 是否敏感字段 */
  sensitive: boolean;
  /** 脱敏规则 id（rd-*），非敏感列为 null */
  maskRule: string | null;
}

/** 数据驱动集（对标 hifox 数据驱动） */
export interface DataSetDef {
  id: string;
  name: string;
  sourceType: 'csv' | 'database' | 'ai-generated' | 'production-sample';
  rowCount: number;
  columns: DataSetColumnDef[];
  /** 生产采样是否已匿名化 */
  productionSampleAnonymized: boolean;
  generatedBy: string;
  /** 引用该数据集的场景 id */
  usedByScenarioIds: string[];
  lastRefreshedAt: string;
  tone: Tone;
}

/**
 * 4 个数据驱动集，与 5 条场景一一对应（AS-01 不使用数据驱动）。
 * 生产采样集 ADS-02 / ADS-04 必须经 SEC-MASK-2.1 脱敏并匿名化后方可入库，敏感列均标注 rd-* 规则。
 */
export const DATA_SETS: DataSetDef[] = [
  {
    id: 'ADS-01', name: '幂等与并发一致性数据驱动集', sourceType: 'ai-generated', rowCount: 64,
    columns: [
      { name: 'idempotencyKey', type: 'string(uuid)', example: '9f2c1a4e-6b7d-4c31-9a20-7de54b0c1188', sensitive: false, maskRule: null },
      { name: 'buyerId', type: 'string', example: 'M20260001', sensitive: false, maskRule: null },
      { name: 'skuList', type: 'json', example: '[{"skuId":"SKU-88213","qty":2,"price":"199.00"}]', sensitive: false, maskRule: null },
      { name: 'couponIds', type: 'array<string>', example: '["CPN-DUP-001"]', sensitive: false, maskRule: null },
      { name: 'concurrentThreads', type: 'int', example: '50', sensitive: false, maskRule: null },
      { name: 'expectedOrderCount', type: 'int', example: '1', sensitive: false, maskRule: null },
    ],
    productionSampleAnonymized: false, generatedBy: 'ag-test', usedByScenarioIds: ['AS-02'],
    lastRefreshedAt: '2026-03-18 21:05', tone: 'ai',
  },
  {
    id: 'ADS-02', name: '优惠金额精度 128 组边界数据（生产采样脱敏）', sourceType: 'production-sample', rowCount: 128,
    columns: [
      { name: 'caseNo', type: 'string', example: 'PROMO-EDGE-077', sensitive: false, maskRule: null },
      { name: 'couponAmount', type: 'decimal', example: '30.00', sensitive: false, maskRule: null },
      { name: 'fullReductionAmount', type: 'decimal', example: '50.00', sensitive: false, maskRule: null },
      { name: 'memberDiscount', type: 'decimal', example: '0.95', sensitive: false, maskRule: null },
      { name: 'payableAmount', type: 'decimal', example: '208.55', sensitive: false, maskRule: null },
      { name: 'allocationDetail', type: 'json', example: '[{"line":1,"amount":"69.52"},{"line":2,"amount":"69.52"},{"line":3,"amount":"69.51"}]', sensitive: false, maskRule: null },
      { name: 'expectedTailDiff', type: 'decimal', example: '0.00', sensitive: false, maskRule: null },
      { name: 'buyerId', type: 'string', example: 'M2026****', sensitive: true, maskRule: 'rd-02' },
    ],
    productionSampleAnonymized: true, generatedBy: 'u-he', usedByScenarioIds: ['AS-03'],
    lastRefreshedAt: '2026-03-12 20:40', tone: 'warn',
  },
  {
    id: 'ADS-03', name: '订单列表深分页游标数据（数据库抽样）', sourceType: 'database', rowCount: 1000,
    columns: [
      { name: 'cursor', type: 'string', example: 'eyJvZmZzZXQiOjEwMDAwMCwidCI6MTc3MzQ1NjAwMH0', sensitive: false, maskRule: null },
      { name: 'buyerId', type: 'string', example: 'M20260001', sensitive: true, maskRule: 'rd-02' },
      { name: 'pageSize', type: 'int', example: '50', sensitive: false, maskRule: null },
      { name: 'timeRangeStart', type: 'datetime', example: '2026-01-01 00:00:00', sensitive: false, maskRule: null },
      { name: 'timeRangeEnd', type: 'datetime', example: '2026-03-19 00:00:00', sensitive: false, maskRule: null },
      { name: 'shardIndex', type: 'int', example: '5', sensitive: false, maskRule: null },
    ],
    productionSampleAnonymized: false, generatedBy: 'u-meng', usedByScenarioIds: ['AS-04'],
    lastRefreshedAt: '2026-03-17 03:10', tone: 'info',
  },
  {
    id: 'ADS-04', name: '安全合规越权与脱敏样本（CSV 导入）', sourceType: 'csv', rowCount: 42,
    columns: [
      { name: 'attackerToken', type: 'string', example: 'pc_live_****c88', sensitive: true, maskRule: 'rd-08' },
      { name: 'victimOrderNo', type: 'string', example: 'SO2026031900042', sensitive: false, maskRule: null },
      { name: 'receiverPhone', type: 'string', example: '138****6621', sensitive: true, maskRule: 'rd-01' },
      { name: 'receiverAddress', type: 'string', example: '浙江省杭州市西湖区****', sensitive: true, maskRule: 'rd-03' },
      { name: 'receiverName', type: 'string', example: '林**', sensitive: true, maskRule: 'rd-06' },
      { name: 'exportApprovalId', type: 'string', example: 'APR-2026-0319-007', sensitive: false, maskRule: null },
      { name: 'expectedMaskPattern', type: 'regex', example: '^1\\d{2}\\*{4}\\d{4}$', sensitive: false, maskRule: null },
    ],
    productionSampleAnonymized: true, generatedBy: 'u-he', usedByScenarioIds: ['AS-05'],
    lastRefreshedAt: '2026-03-19 16:48', tone: 'danger',
  },
];

/** 接口自动化执行记录（一次归档执行） */
export interface ApiTestRunDef {
  id: string;
  /** 执行的场景 id；单用例执行为 null */
  scenarioId: string | null;
  /** 本次执行的用例 id 列表 */
  caseIds: string[];
  triggerType: 'manual' | 'ci' | 'schedule' | 'event';
  /** 触发者 userId，或 'ci' / 'schedule' */
  triggeredBy: string;
  envId: string;
  branch: string;
  commitSha: string;
  /** 关联的流水线 id（PIPE-2401 ~ PIPE-2410），无关联为 null */
  pipelineRunId: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  /** 通过率（%）= passed / totalCases × 100，保留 1 位小数 */
  passRatePct: number;
  /** 本次执行新开出的缺陷 id（取自 data.ts 的 BUGS） */
  newBugsCreated: string[];
  /** 契约断言覆盖率（%）= 本次命中的断言数 / 场景声明断言总数 */
  coveragePct: number;
  /** 抖动（flaky）用例执行次数 */
  flakyCount: number;
  /** 归属的迭代报告 id */
  reportId: string;
  tone: Tone;
  statusLabel: string;
}

/**
 * 8 次归档执行，按 startedAt 升序排列。核对口径：
 *   · 每次 passRatePct = passed / totalCases（4/4=100、2/4=50、2/3=66.7、3/4=75、4/4=100、1/1=100、1/3=33.3、2/4=50）；
 *   · 用例执行总数 = Σ totalCases = 27，通过总数 = Σ passed = 19，故 apiTestReport.summary.passRatePct = 70.4；
 *   · 平均耗时 = Σ durationMs / 8 = 4,314,000 / 8 = 539,250ms；
 *   · flakyCount 合计 2，flakyRate = 2 / 27 = 7.4%；
 *   · newBugsCreated 去重后 7 个，与 TEST_REPORT 的三轮发现窗口逐一对应
 *     （第 1 轮 03-09~03-12 → BUG-1045/1046；第 2 轮 03-13~03-16 → BUG-1055；第 3 轮 03-17~03-19 → BUG-1047/1048/1052/1054）。
 */
export const API_TEST_RUNS: ApiTestRunDef[] = [
  {
    id: 'AR-01', scenarioId: 'AS-01', caseIds: ['AC-01', 'AC-06', 'AC-07', 'AC-08'],
    triggerType: 'ci', triggeredBy: 'ci', envId: 'env-test',
    branch: 'feat/order-idempotency', commitSha: 'a3f81c2', pipelineRunId: 'PIPE-2401',
    startedAt: '2026-03-06 14:32:10', finishedAt: '2026-03-06 14:39:08', durationMs: 418000,
    totalCases: 4, passed: 4, failed: 0, blocked: 0, skipped: 0, passRatePct: 100,
    newBugsCreated: [], coveragePct: 100, flakyCount: 0, reportId: 'AR-RPT-24',
    tone: 'ok', statusLabel: '全部通过 · 作为 REQ-2401 集成基线',
  },
  {
    id: 'AR-02', scenarioId: 'AS-02', caseIds: ['AC-01', 'AC-03', 'AC-04', 'AC-09'],
    triggerType: 'event', triggeredBy: 'u-he', envId: 'env-test',
    branch: 'feat/outbox-relay', commitSha: 'c7d20e9', pipelineRunId: 'PIPE-2402',
    startedAt: '2026-03-10 10:22:04', finishedAt: '2026-03-10 10:31:06', durationMs: 542000,
    totalCases: 4, passed: 2, failed: 2, blocked: 0, skipped: 0, passRatePct: 50,
    newBugsCreated: ['BUG-1045', 'BUG-1046'], coveragePct: 62.5, flakyCount: 1, reportId: 'AR-RPT-24',
    tone: 'danger', statusLabel: '发现 2 个 P0：并发下单半提交与并发取消重复流水',
  },
  {
    id: 'AR-03', scenarioId: 'AS-03', caseIds: ['AC-05', 'AC-06', 'AC-13'],
    triggerType: 'schedule', triggeredBy: 'schedule', envId: 'env-test',
    branch: 'fix/promo-amount-precision', commitSha: 'd41a908', pipelineRunId: null,
    startedAt: '2026-03-13 02:20:00', finishedAt: '2026-03-13 02:26:44', durationMs: 404000,
    totalCases: 3, passed: 2, failed: 1, blocked: 0, skipped: 0, passRatePct: 66.7,
    newBugsCreated: [], coveragePct: 84.2, flakyCount: 0, reportId: 'AR-RPT-24',
    tone: 'warn', statusLabel: '128 组中 3 组负向分摊尾差 0.01 元（BUG-1043 上迭代带入，未新开单）',
  },
  {
    id: 'AR-04', scenarioId: 'AS-01', caseIds: ['AC-01', 'AC-06', 'AC-07', 'AC-08'],
    triggerType: 'ci', triggeredBy: 'ci', envId: 'env-staging',
    branch: 'test/order-idempotency-ut', commitSha: '5d31e07', pipelineRunId: 'PIPE-2407',
    startedAt: '2026-03-16 17:55:12', finishedAt: '2026-03-16 18:04:24', durationMs: 552000,
    totalCases: 4, passed: 3, failed: 1, blocked: 0, skipped: 0, passRatePct: 75,
    newBugsCreated: ['BUG-1055'], coveragePct: 88.6, flakyCount: 0, reportId: 'AR-RPT-24',
    tone: 'warn', statusLabel: '状态流转 P95 升至 380ms（同步写流水），已开 BUG-1055',
  },
  {
    id: 'AR-05', scenarioId: 'AS-01', caseIds: ['AC-01', 'AC-06', 'AC-07', 'AC-08'],
    triggerType: 'manual', triggeredBy: 'u-he', envId: 'env-test',
    branch: 'feat/order-statemachine', commitSha: 'c91e7f4', pipelineRunId: null,
    startedAt: '2026-03-17 11:05:02', finishedAt: '2026-03-17 11:11:44', durationMs: 402000,
    totalCases: 4, passed: 4, failed: 0, blocked: 0, skipped: 0, passRatePct: 100,
    newBugsCreated: [], coveragePct: 100, flakyCount: 0, reportId: 'AR-RPT-24',
    tone: 'ok', statusLabel: 'BUG-1055 修复后复跑全通过，状态流转 P95 回落至 62ms',
  },
  {
    id: 'AR-06', scenarioId: null, caseIds: ['AC-16'],
    triggerType: 'manual', triggeredBy: 'u-shen', envId: 'env-dev',
    branch: 'feat/order-dual-write-check', commitSha: 'f3b71d9', pipelineRunId: null,
    startedAt: '2026-03-17 15:40:00', finishedAt: '2026-03-17 15:43:56', durationMs: 236000,
    totalCases: 1, passed: 1, failed: 0, blocked: 0, skipped: 0, passRatePct: 100,
    newBugsCreated: [], coveragePct: 96, flakyCount: 0, reportId: 'AR-RPT-24',
    tone: 'ok', statusLabel: '迁移批次断点续传单用例试跑通过（AC-16 仍为 draft 态）',
  },
  {
    id: 'AR-07', scenarioId: 'AS-04', caseIds: ['AC-12', 'AC-02', 'AC-08'],
    triggerType: 'manual', triggeredBy: 'u-meng', envId: 'env-staging',
    branch: 'test/order-idempotency-ut', commitSha: 'e88c1f4', pipelineRunId: 'PIPE-2408',
    startedAt: '2026-03-18 10:26:08', finishedAt: '2026-03-18 10:41:26', durationMs: 918000,
    totalCases: 3, passed: 1, failed: 2, blocked: 0, skipped: 0, passRatePct: 33.3,
    newBugsCreated: ['BUG-1047', 'BUG-1048'], coveragePct: 69.8, flakyCount: 1, reportId: 'AR-RPT-24',
    tone: 'danger', statusLabel: '深分页 P95 342ms 与缓存 3 秒脏读双双失败，性能基线未达标',
  },
  {
    id: 'AR-08', scenarioId: 'AS-05', caseIds: ['AC-10', 'AC-11', 'AC-14', 'AC-15'],
    triggerType: 'ci', triggeredBy: 'ci', envId: 'env-staging',
    branch: 'test/order-idempotency-ut', commitSha: 'b60f2a5', pipelineRunId: 'PIPE-2409',
    startedAt: '2026-03-19 17:44:30', finishedAt: '2026-03-19 17:58:32', durationMs: 842000,
    totalCases: 4, passed: 2, failed: 2, blocked: 0, skipped: 0, passRatePct: 50,
    newBugsCreated: ['BUG-1052', 'BUG-1054'], coveragePct: 78.3, flakyCount: 0, reportId: 'AR-RPT-24',
    tone: 'danger', statusLabel: '导出二次授权缺失与导出脱敏漏网两项合规高危，直接阻断 G4 / G6',
  },
];

/** 迭代报告的模块维度统计 */
export interface ApiReportModuleStatDef {
  moduleId: string;
  /** 模块名，与 data.ts 的 TEST_MODULES.name 一致 */
  moduleName: string;
  /** 该模块下的接口自动化用例数（Σ = 16） */
  caseCount: number;
  /** 按用例最近一次执行结果统计的通过率（%） */
  passRatePct: number;
  /** 该模块用例 avgDurationMs 的算术均值 */
  avgDurationMs: number;
  /** 由接口自动化新开出的缺陷数（Σ = 7） */
  bugCount: number;
  tone: Tone;
}

/** 迭代报告的用例类型维度统计 */
export interface ApiReportTypeStatDef {
  caseType: '正向' | '异常' | '边界' | '幂等' | '并发' | '安全' | '性能';
  caseCount: number;
  passRatePct: number;
  avgDurationMs: number;
  bugCount: number;
  tone: Tone;
}

/** 迭代报告的高频失败项 */
export interface ApiReportTopFailureDef {
  caseId: string;
  caseName: string;
  /** 在 8 次归档执行中的失败次数 */
  failCount: number;
  rootCause: string;
  aiSuggestion: string;
  tone: Tone;
}

/** 迭代报告的 AI 改进建议 */
export interface ApiReportActionDef {
  action: string;
  priority: 'P0' | 'P1' | 'P2';
  /** 建议责任角色 id（manager / product / architect / developer / tester / ops / pmo） */
  ownerRoleId: string;
  expectedGain: string;
}

/** 接口自动化迭代汇总报告 */
export interface ApiTestReportDef {
  id: string;
  sprintId: string;
  generatedAt: string;
  generatedBy: string;
  modelId: string;
  scope: { scenarios: number; cases: number; runs: number };
  summary: {
    totalRuns: number;
    /** Σ passed / Σ totalCases = 19 / 27 */
    passRatePct: number;
    /** Σ durationMs / totalRuns */
    avgDurationMs: number;
    p95DurationMs: number;
    /** Σ flakyCount / Σ totalCases = 2 / 27 */
    flakyRate: number;
    /** 契约覆盖率 = 已建自动化用例的契约数 10 / 契约总数 14 */
    coveragePct: number;
    newBugsFound: number;
    /** 接口自动化发现缺陷 / SP-24 缺陷总数 = 7 / 12 */
    bugDetectRatePct: number;
  };
  byModule: ApiReportModuleStatDef[];
  byType: ApiReportTypeStatDef[];
  topFailures: ApiReportTopFailureDef[];
  aiInsights: string[];
  aiRecommendedActions: ApiReportActionDef[];
  gateImpact: { gateId: string; pass: boolean; unmetCriteria: string[] };
  /** 生成报告消耗的 Token 成本（元） */
  tokenCost: number;
  /** 与 SP-23 的环比：通过率 / 覆盖率为百分点差，耗时为百分比变化 */
  compareWithPrevSprint: { passRateDelta: number; durationDelta: number; coverageDelta: number };
}

/**
 * SP-24 接口自动化总体报告。所有汇总值均可由 API_TEST_RUNS（8 次）与 API_CASES（16 条）逐条累加复核：
 *   passRatePct 70.4 = 19/27；avgDurationMs 539250 = 4314000/8；
 *   p95DurationMs 918000 按最近秩法取 8 次执行耗时的 P95（⌈0.95 × 8⌉ = 第 8 位，即 AR-07 的 918000ms）；
 *   flakyRate 7.4 = 2/27；coveragePct 71.4 = 10/14（未覆盖 API-06、API-10 两份草稿契约与 API-11、API-12 两份 EVENT 契约）；
 *   newBugsFound 7 = BUG-1045/1046/1047/1048/1052/1054/1055；bugDetectRatePct 58.3 = 7/12（BUG_STATS 口径）。
 *   byModule.caseCount 合计 16、bugCount 合计 7；byType.caseCount 合计 16、bugCount 合计 7。
 */
export const apiTestReport: ApiTestReportDef = {
  id: 'AR-RPT-24',
  sprintId: 'SP-24',
  generatedAt: '2026-03-19 18:20',
  generatedBy: 'ag-test',
  modelId: 'mdl-claude',
  scope: { scenarios: 5, cases: 16, runs: 8 },
  summary: {
    totalRuns: 8,
    passRatePct: 70.4,
    avgDurationMs: 539250,
    p95DurationMs: 918000,
    flakyRate: 7.4,
    coveragePct: 71.4,
    newBugsFound: 7,
    bugDetectRatePct: 58.3,
  },
  byModule: [
    { moduleId: 'tm-create', moduleName: '下单主链路', caseCount: 3, passRatePct: 66.7, avgDurationMs: 181, bugCount: 1, tone: 'warn' },
    { moduleId: 'tm-state', moduleName: '订单状态机', caseCount: 3, passRatePct: 66.7, avgDurationMs: 86, bugCount: 2, tone: 'warn' },
    { moduleId: 'tm-consist', moduleName: '一致性与可靠投递', caseCount: 0, passRatePct: 0, avgDurationMs: 0, bugCount: 0, tone: 'neutral' },
    { moduleId: 'tm-promo', moduleName: '优惠与金额精度', caseCount: 3, passRatePct: 66.7, avgDurationMs: 73, bugCount: 0, tone: 'warn' },
    { moduleId: 'tm-perf', moduleName: '性能与容量', caseCount: 2, passRatePct: 0, avgDurationMs: 153, bugCount: 2, tone: 'danger' },
    { moduleId: 'tm-sec', moduleName: '安全与合规', caseCount: 4, passRatePct: 50, avgDurationMs: 1271, bugCount: 2, tone: 'danger' },
    { moduleId: 'tm-migrate', moduleName: '迁移与双写校验', caseCount: 1, passRatePct: 100, avgDurationMs: 4620, bugCount: 0, tone: 'ok' },
  ],
  byType: [
    { caseType: '幂等', caseCount: 1, passRatePct: 100, avgDurationMs: 152, bugCount: 0, tone: 'ok' },
    { caseType: '并发', caseCount: 2, passRatePct: 0, avgDurationMs: 176, bugCount: 2, tone: 'danger' },
    { caseType: '异常', caseCount: 3, passRatePct: 100, avgDurationMs: 114, bugCount: 0, tone: 'ok' },
    { caseType: '边界', caseCount: 2, passRatePct: 0, avgDurationMs: 65, bugCount: 1, tone: 'danger' },
    { caseType: '性能', caseCount: 2, passRatePct: 50, avgDurationMs: 163, bugCount: 2, tone: 'warn' },
    { caseType: '安全', caseCount: 4, passRatePct: 50, avgDurationMs: 1271, bugCount: 2, tone: 'danger' },
    { caseType: '正向', caseCount: 2, passRatePct: 100, avgDurationMs: 2321, bugCount: 0, tone: 'ok' },
  ],
  topFailures: [
    {
      caseId: 'AC-05', caseName: '券 + 满减 + 会员价三重叠加分摊金额之和恒等于应付（128 组数据驱动）', failCount: 1,
      rootCause: 'AmountAllocator 逐行 setScale(2, HALF_UP) 且余数未归集，负向分摊时恒定产生 0.01 元尾差（BUG-1043，资损级）',
      aiSuggestion: '改为 HALF_EVEN 并把余数归集到金额绝对值最大行，同时对 allocateNegative 补 12 条边界用例；与 MR-2410 剩余 1 条 must-fix 合并提交，可一并缓解 G3 聚合覆盖率 71.4% 的缺口。',
      tone: 'danger',
    },
    {
      caseId: 'AC-14', caseName: '未获二次授权直接导出必须被拒绝且行为落审计', failCount: 1,
      rootCause: 'OrderExportController 仅校验登录态，未接入审批中心二次授权，审计切面也未覆盖导出方法（BUG-1052，合规高危）',
      aiSuggestion: '按 API-13 v1.1 契约补 @SecondaryAuth 注解与 ExportAuditAspect，并在 AS-05 增加「审批单不存在」与「审批单已过期」两条负例；修复归属 TASK-2423，建议优先级提升至 P0。',
      tone: 'danger',
    },
    {
      caseId: 'AC-12', caseName: '订单列表跨分片游标深分页（10 万偏移）P95 ≤ 200ms', failCount: 1,
      rootCause: '游标分页在 10 万偏移处退化为跨 8 分片归并排序，ES 聚合未下推（BUG-1047，P95 342ms）',
      aiSuggestion: '引入分片内局部游标 + 归并堆，把聚合与排序下推至 ES；改造后重跑 AS-04 验证 P95，预计场景端到端耗时可从 918s 降至约 640s。',
      tone: 'warn',
    },
    {
      caseId: 'AC-03', caseName: '50 并发同 Idempotency-Key 提交仅 1 笔落单且不产生半提交', failCount: 1,
      rootCause: 'Redis SETNX 快路径超时后、回落 DB 唯一索引前，事务已写入 order 主表，产生 CREATING 残留与优惠券误核销（BUG-1045）',
      aiSuggestion: '把幂等记录写入与订单主表写入收敛进同一本地事务，并为 SETNX 超时增加补偿删除；在 AS-02 补 6 条并发时序断言。与 BUG-1046 合并为一个事务边界收敛 MR 更高效。',
      tone: 'danger',
    },
  ],
  aiInsights: [
    '并发类用例通过率 0%（AC-03、AC-09 均失败），是 7 种用例类型中唯一归零的一类；两者分别对应 BUG-1045（事务半提交）与 BUG-1046（重复状态流水），根因同为「先写库后发消息」缺少统一事务边界，建议合并为一个修复 MR，预计可一次性消解 2 个 P0。',
    '安全合规模块 4 条用例失败 2 条（AC-14 / AC-15），且都在 03-19 17:44 的 AR-08 首次执行即暴露；TASK-2422~2424 分别处于 refined / refined / backlog 态尚未开发，意味着 REQ-2408 的合规承诺当前缺少代码支撑，G6 观测门禁第 4 项必然不达标。',
    '优惠金额精度用例 AC-05 在 128 组数据驱动下失败 3 组（均为负向分摊），尾差恒定 0.01 元；这与 G3 聚合分支覆盖率 71.4% 的缺口同源——AmountAllocator#allocateNegative 既未被单测覆盖，也未通过接口断言，属同一处代码的双重盲区。',
    '性能类用例平均耗时 163ms，其中 AC-12 深分页 P95 342ms，超 REQ-2404 承诺的 200ms 基线 71%；AS-04 场景端到端 918s，是 8 次执行中最慢的一次，也是拉高整体 P95 耗时的唯一来源。',
    '不稳定执行 2 次（AR-02 的 AC-03、AR-07 的 AC-08），占 27 次用例执行的 7.4%，均由并发时序抖动引起；把 AS-02 的 retryPolicy 从 maxAttempts 2 / backoffMs 500 调整为 3 / 1500，可消除约 80% 的抖动误报，代价是场景耗时增加约 40s。',
    'AI 生成用例占比 87.5%（14/16），累计发现 7 个缺陷，占 SP-24 全部 12 个缺陷的 58.3%；其中 BUG-1052 与 BUG-1054 两个合规高危在此前的人工用例中完全没有覆盖，属纯增量收益。',
  ],
  aiRecommendedActions: [
    {
      action: '合并 BUG-1045 与 BUG-1046 的修复为一个事务边界收敛 MR，并在 AS-02 中补 6 条并发时序断言',
      priority: 'P0', ownerRoleId: 'developer',
      expectedGain: '并发类通过率 0% → ≥ 90%，一次性消解 2 个 P0，解锁 G4 第 2 项「P0 / P1 缺陷全部关闭」',
    },
    {
      action: '把 TASK-2423（展示脱敏与导出二次授权）优先级提升至 P0 并于本周启动，AC-14 / AC-15 转为发布准入门禁用例',
      priority: 'P0', ownerRoleId: 'tester',
      expectedGain: '消除 2 个合规高危（BUG-1052 / BUG-1054），安全合规模块通过率 50% → 100%，G6 第 4 项由未达标转达标',
    },
    {
      action: '将 API-03 游标分页 + 分片聚合下推改造拆为独立工作项，插入 SP-24 剩余产能或 SP-25 首批',
      priority: 'P1', ownerRoleId: 'architect',
      expectedGain: 'AC-12 P95 342ms → ≤ 200ms，性能类通过率 50% → 100%，AS-04 端到端耗时 -30%',
    },
    {
      action: '为 API-06（状态流水查询）与 API-10（拆单预演）两份草稿契约补齐验收标准并冻结，随后由 ag-test 自动生成 9 条用例',
      priority: 'P1', ownerRoleId: 'product',
      expectedGain: '契约覆盖率 71.4% → 85.7%（12/14），并为 PT-02 拆单原型提供可执行的接口验收依据',
    },
  ],
  gateImpact: {
    gateId: 'G4',
    pass: false,
    unmetCriteria: [
      '用例执行率 62.1%（154/248）未达 100%；接口自动化侧契约覆盖率 71.4%（10/14），API-06 与 API-10 仍为草稿态无法建例',
      'P0 未关闭 4 个（BUG-1043 / 1045 / 1046 / 1049），其中 BUG-1045 与 BUG-1046 由接口自动化在 AR-02 直接暴露',
      '核心接口 P95 未全部达标：API-03 P95 342ms（基线 200ms，AC-12 失败），API-01 P95 186ms 达标',
      '压测峰值 2,400 TPS、错误率 0.04%，未跑到 3,000 TPS 目标，AS-04 无法给出容量结论',
    ],
  },
  tokenCost: 4.86,
  compareWithPrevSprint: { passRateDelta: 8.6, durationDelta: -12.4, coverageDelta: 9.5 },
};

/* ==== 3. 本地 IDE AI 结果同步（对标 VS Code / JetBrains 插件） ==== */

/** IDE 同步会话的量化指标 */
export interface IdeSyncMetricsDef {
  /** 本次 IDE 会话内的 AI 对话轮次 */
  aiTurnCount: number;
  aiAcceptedLines: number;
  aiRejectedLines: number;
  /** 采纳率（%）= aiAcceptedLines / (aiAcceptedLines + aiRejectedLines) × 100 */
  acceptRatePct: number;
  manualLines: number;
  /** 变更总行数 = aiAcceptedLines + manualLines */
  totalLinesChanged: number;
  /** 上行到平台的上下文文件数（已脱敏） */
  contextFilesSent: number;
  tokensSent: number;
  tokensMasked: number;
  /** 命中脱敏规则的处数 */
  maskHitCount: number;
  uploadBytes: number;
  avgLatencyMs: number;
}

/** IDE 同步的隐私与出网管控配置 */
export interface IdeSyncPrivacyDef {
  /** 出网模式，与 data.ts 的 egressPolicy 对齐：ALLOW 允许出域 / MASK 脱敏后出域 / DENY 禁止出域 */
  egressMode: 'ALLOW' | 'MASK' | 'DENY';
  /** 实际被脱敏的字段名（对应 redactRules 的 field） */
  maskedFields: string[];
  /** 永不上行、仅保留在本地的工作区文件 */
  localOnlyFiles: string[];
  /** 脱敏策略版本 */
  policyVersion: string;
}

/** IDE 与平台之间的版本冲突 */
export interface IdeSyncConflictDef {
  filePath: string;
  platformVersion: string;
  localVersion: string;
  resolvedBy: 'human' | 'ai' | 'auto';
  resolution: string;
}

/** 本地 IDE AI 结果同步会话 */
export interface IdeSyncSessionDef {
  id: string;
  userId: string;
  ide: 'vscode' | 'jetbrains';
  ideVersion: string;
  pluginVersion: string;
  os: 'Windows 11' | 'macOS 15' | 'Ubuntu 24.04';
  repoUrl: string;
  branch: string;
  /** 关联的真实工作项 id（取自 data.ts 的 TASKS，TASK-2401 ~ TASK-2424） */
  taskId: string;
  /** 关联的平台侧编码会话 id（取自 data.ts 的 CODING_SESSIONS，CS-2401 ~ CS-2420），无则为 null */
  codingSessionId: string | null;
  startedAt: string;
  lastSyncAt: string;
  syncMode: 'realtime' | 'batch' | 'manual' | 'offline-queue';
  connectionStatus: 'online' | 'degraded' | 'offline';
  /** 待上传产物数 */
  pendingUploads: number;
  syncState: 'synced' | 'partial' | 'conflict' | 'queued' | 'failed';
  syncStateLabel: string;
  tone: Tone;
  metrics: IdeSyncMetricsDef;
  privacy: IdeSyncPrivacyDef;
  conflicts: IdeSyncConflictDef[];
  /** 已上传到平台的产物类型 */
  artifactsUploaded: ('ai-session' | 'diff' | 'test-result' | 'coverage' | 'lint-report' | 'context-snapshot' | 'commit-meta')[];
  lastError: string | null;
}

/**
 * 10 个 IDE 同步会话，逐一挂靠 data.ts 的真实工作项与真实编码会话：
 * taskId ↔ codingSessionId ↔ branch ↔ 模型 全部与 TASKS / CODING_SESSIONS 对齐，
 * 且 privacy.egressMode 与 CODING_SESSIONS.modelId 严格自洽——
 * MASK 会话一律走外部模型（mdl-claude / mdl-deepseek / mdl-qwen），
 * DENY 会话（IDE-09 / IDE-10，预生产与生产数据）一律被强制路由到内网 mdl-local。
 * metrics 口径：totalLinesChanged = aiAcceptedLines + manualLines（整段任务级会话等于 CS 的 additions），
 * acceptRatePct = aiAcceptedLines / (aiAcceptedLines + aiRejectedLines)，与 CS 的 acceptRate 一致；
 * IDE-07 是唯一例外：它只是 CS-2410（03-15 10:30 ~ 03-19 16:00，38 轮 / 3120 行新增 / 采纳率 71%）中
 * 03-19 08:58~10:31 这一次晨会级连接，14 轮 / 1528 行，故 metrics 小于任务级聚合值；
 * 该窗口集中处理的是 BigDecimal 精度改造的成熟片段，因此 acceptRatePct 84.7% 高于 CS-2410 全期的 71%。
 */
export const IDE_SYNC_SESSIONS: IdeSyncSessionDef[] = [
  {
    id: 'IDE-01', userId: 'u-zhou', ide: 'vscode', ideVersion: 'VS Code 1.98.2', pluginVersion: '1.8.2',
    os: 'Windows 11', repoUrl: 'git@gitlab.intra.example.com:trade/order-api.git', branch: 'feat/order-idempotency',
    taskId: 'TASK-2401', codingSessionId: 'CS-2401',
    startedAt: '2026-03-02 10:40:00', lastSyncAt: '2026-03-18 15:20:00',
    syncMode: 'realtime', connectionStatus: 'online', pendingUploads: 0,
    syncState: 'synced', syncStateLabel: '已同步 · 7 类产物全部上行', tone: 'ok',
    metrics: {
      aiTurnCount: 46, aiAcceptedLines: 2914, aiRejectedLines: 640, acceptRatePct: 82,
      manualLines: 946, totalLinesChanged: 3860, contextFilesSent: 4,
      tokensSent: 268400, tokensMasked: 12860, maskHitCount: 34, uploadBytes: 486210, avgLatencyMs: 268,
    },
    privacy: {
      egressMode: 'MASK',
      maskedFields: ['receiverPhone', 'receiverAddress', 'apiToken'],
      localOnlyFiles: ['order-api/src/main/resources/application-prod.yaml'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [],
    artifactsUploaded: ['ai-session', 'diff', 'test-result', 'coverage', 'lint-report', 'context-snapshot', 'commit-meta'],
    lastError: null,
  },
  {
    id: 'IDE-02', userId: 'u-shen', ide: 'jetbrains', ideVersion: 'IntelliJ IDEA 2025.1.3', pluginVersion: '1.8.2',
    os: 'macOS 15', repoUrl: 'git@gitlab.intra.example.com:infra/outbox-relay.git', branch: 'feat/outbox-relay',
    taskId: 'TASK-2402', codingSessionId: 'CS-2402',
    startedAt: '2026-03-03 09:15:00', lastSyncAt: '2026-03-09 18:30:00',
    syncMode: 'batch', connectionStatus: 'online', pendingUploads: 0,
    syncState: 'synced', syncStateLabel: '已同步 · 每 10 分钟批量上行一次', tone: 'ok',
    metrics: {
      aiTurnCount: 31, aiAcceptedLines: 1780, aiRejectedLines: 176, acceptRatePct: 91,
      manualLines: 360, totalLinesChanged: 2140, contextFilesSent: 3,
      tokensSent: 142800, tokensMasked: 4120, maskHitCount: 9, uploadBytes: 214680, avgLatencyMs: 212,
    },
    privacy: {
      egressMode: 'MASK',
      maskedFields: ['apiToken', 'payCardNo'],
      localOnlyFiles: ['outbox-relay/src/main/resources/application-prod.yaml'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [],
    artifactsUploaded: ['ai-session', 'diff', 'test-result', 'coverage', 'commit-meta'],
    lastError: null,
  },
  {
    id: 'IDE-03', userId: 'u-zhou', ide: 'vscode', ideVersion: 'VS Code 1.98.2', pluginVersion: '1.8.2',
    os: 'Windows 11', repoUrl: 'git@gitlab.intra.example.com:trade/order-domain.git', branch: 'feat/order-tx-boundary',
    taskId: 'TASK-2403', codingSessionId: 'CS-2403',
    startedAt: '2026-03-05 14:00:00', lastSyncAt: '2026-03-19 10:00:00',
    syncMode: 'realtime', connectionStatus: 'degraded', pendingUploads: 3,
    syncState: 'partial', syncStateLabel: '部分同步 · 长连接降级为 30s 批量，3 项产物待补传', tone: 'warn',
    metrics: {
      aiTurnCount: 52, aiAcceptedLines: 1552, aiRejectedLines: 873, acceptRatePct: 64,
      manualLines: 1128, totalLinesChanged: 2680, contextFilesSent: 3,
      tokensSent: 312600, tokensMasked: 18640, maskHitCount: 41, uploadBytes: 398420, avgLatencyMs: 890,
    },
    privacy: {
      egressMode: 'MASK',
      maskedFields: ['receiverPhone', 'receiverAddress', 'receiverName', 'apiToken'],
      localOnlyFiles: ['warehouse-client/src/main/resources/stock-client-prod.properties'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [
      {
        filePath: 'order-domain/src/main/java/com/mall/order/domain/service/InventoryDeductService.java',
        platformVersion: 'sha 7c1d0e9（沈亦白 03-18 20:14 推送的补偿回滚分支）',
        localVersion: 'sha b42f8a1（本地把扣减重试次数改为 3 次）',
        resolvedBy: 'human',
        resolution: '保留平台侧 rollbackToken 释放逻辑，本地重试次数改动以补丁方式追加，并补 2 条重试上限单测；周浩然 03-19 09:52 复核通过。',
      },
    ],
    artifactsUploaded: ['ai-session', 'diff', 'test-result', 'commit-meta'],
    lastError: '2026-03-18 21:14 WebSocket 心跳连续 3 次超时（RTT 1,860ms），已降级为 30s 批量同步；coverage / lint-report / context-snapshot 三项待重连后补传',
  },
  {
    id: 'IDE-04', userId: 'u-meng', ide: 'vscode', ideVersion: 'VS Code 1.98.2', pluginVersion: '1.8.2',
    os: 'Ubuntu 24.04', repoUrl: 'git@gitlab.intra.example.com:trade/order-api.git', branch: 'feat/order-metrics',
    taskId: 'TASK-2404', codingSessionId: 'CS-2404',
    startedAt: '2026-03-09 10:20:00', lastSyncAt: '2026-03-12 14:10:00',
    syncMode: 'manual', connectionStatus: 'online', pendingUploads: 0,
    syncState: 'synced', syncStateLabel: '已同步 · 由开发者手动点击「同步到平台」', tone: 'ok',
    metrics: {
      aiTurnCount: 14, aiAcceptedLines: 576, aiRejectedLines: 24, acceptRatePct: 96,
      manualLines: 44, totalLinesChanged: 620, contextFilesSent: 3,
      tokensSent: 48200, tokensMasked: 1240, maskHitCount: 4, uploadBytes: 86420, avgLatencyMs: 186,
    },
    privacy: {
      egressMode: 'MASK',
      maskedFields: ['apiToken'],
      localOnlyFiles: ['deploy/grafana/admin-datasource.yaml'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [],
    artifactsUploaded: ['ai-session', 'diff', 'commit-meta'],
    lastError: null,
  },
  {
    id: 'IDE-05', userId: 'u-he', ide: 'jetbrains', ideVersion: 'IntelliJ IDEA 2025.1.3', pluginVersion: '1.8.2',
    os: 'macOS 15', repoUrl: 'git@gitlab.intra.example.com:trade/order-api.git', branch: 'test/order-idempotency-ut',
    taskId: 'TASK-2405', codingSessionId: 'CS-2405',
    startedAt: '2026-03-10 09:30:00', lastSyncAt: '2026-03-19 17:26:00',
    syncMode: 'realtime', connectionStatus: 'online', pendingUploads: 1,
    syncState: 'conflict', syncStateLabel: '冲突待复核 · ag-test 已给三方合并建议', tone: 'warn',
    metrics: {
      aiTurnCount: 68, aiAcceptedLines: 2680, aiRejectedLines: 942, acceptRatePct: 74,
      manualLines: 1440, totalLinesChanged: 4120, contextFilesSent: 3,
      tokensSent: 386400, tokensMasked: 22480, maskHitCount: 58, uploadBytes: 528640, avgLatencyMs: 312,
    },
    privacy: {
      egressMode: 'MASK',
      maskedFields: ['receiverPhone', 'receiverAddress', 'buyerIdCard', 'orderAmount'],
      localOnlyFiles: ['order-api/src/test/resources/prod-order-sample.csv'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [
      {
        filePath: 'order-domain/src/test/java/com/mall/order/domain/OrderTxBoundaryTest.java',
        platformVersion: 'sha 5d31e07（PIPE-2407 归档的补测版本）',
        localVersion: 'sha e88c1f4（本地新增 34 个异常分支用例）',
        resolvedBy: 'ai',
        resolution: 'ag-test 三方合并保留双方断言，去重 12 条重复用例，覆盖率归集口径统一为需求级；等待何斯年复核后覆盖平台版本（当前 pendingUploads = 1）。',
      },
    ],
    artifactsUploaded: ['ai-session', 'diff', 'test-result', 'coverage', 'lint-report', 'context-snapshot'],
    lastError: '2026-03-19 17:20 检测到平台侧与本地对 OrderTxBoundaryTest.java 的双向修改，合并结果待人工复核，暂未上行',
  },
  {
    id: 'IDE-06', userId: 'u-zhou', ide: 'vscode', ideVersion: 'VS Code 1.98.2', pluginVersion: '1.8.2',
    os: 'Windows 11', repoUrl: 'git@gitlab.intra.example.com:trade/promotion-engine.git', branch: 'feat/promotion-engine',
    taskId: 'TASK-2409', codingSessionId: 'CS-2409',
    startedAt: '2026-03-06 10:30:00', lastSyncAt: '2026-03-19 09:40:00',
    syncMode: 'realtime', connectionStatus: 'online', pendingUploads: 0,
    syncState: 'synced', syncStateLabel: '已同步 · 7 类产物全部上行', tone: 'ok',
    metrics: {
      aiTurnCount: 61, aiAcceptedLines: 4300, aiRejectedLines: 1143, acceptRatePct: 79,
      manualLines: 1880, totalLinesChanged: 6180, contextFilesSent: 3,
      tokensSent: 398200, tokensMasked: 9860, maskHitCount: 22, uploadBytes: 642180, avgLatencyMs: 234,
    },
    privacy: {
      egressMode: 'MASK',
      maskedFields: ['orderAmount', 'apiToken'],
      localOnlyFiles: ['promo-engine/src/main/resources/aviator-license.key'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [],
    artifactsUploaded: ['ai-session', 'diff', 'test-result', 'coverage', 'lint-report', 'context-snapshot', 'commit-meta'],
    lastError: null,
  },
  {
    id: 'IDE-07', userId: 'u-shen', ide: 'jetbrains', ideVersion: 'IntelliJ IDEA 2025.1.3', pluginVersion: '1.8.2',
    os: 'macOS 15', repoUrl: 'git@gitlab.intra.example.com:trade/promotion-engine.git', branch: 'fix/promo-amount-precision',
    taskId: 'TASK-2410', codingSessionId: 'CS-2410',
    startedAt: '2026-03-19 08:58:02', lastSyncAt: '2026-03-19 10:31:02',
    syncMode: 'offline-queue', connectionStatus: 'degraded', pendingUploads: 0,
    syncState: 'partial', syncStateLabel: '部分同步 · 6 条 AI 生成断言待人工复核后回传', tone: 'warn',
    metrics: {
      aiTurnCount: 14, aiAcceptedLines: 1186, aiRejectedLines: 214, acceptRatePct: 84.7,
      manualLines: 342, totalLinesChanged: 1528, contextFilesSent: 7,
      tokensSent: 96400, tokensMasked: 8120, maskHitCount: 29, uploadBytes: 372210, avgLatencyMs: 742,
    },
    privacy: {
      egressMode: 'MASK',
      maskedFields: ['receiverAddress', 'receiverName', 'payCardNo', 'apiToken'],
      localOnlyFiles: ['promo-engine/src/test/resources/prod-order-sample.csv'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [
      {
        filePath: 'order-domain/src/main/java/com/mall/order/domain/vo/OrderAmount.java',
        platformVersion: 'sha 7c1d0e9（周浩然 03-19 09:32 推送的 setScale(2, HALF_EVEN) 修正）',
        localVersion: 'sha b42f8a1（本地新增 negativeFlag 负向分摊标记字段）',
        resolvedBy: 'ai',
        resolution: '采纳 ag-review 的三方合并建议：保留平台侧 HALF_EVEN 修正，本地 negativeFlag 以补丁方式追加，2 处冲突块已解决并经沈亦白人工复核通过。',
      },
    ],
    artifactsUploaded: ['ai-session', 'diff', 'test-result', 'coverage', 'context-snapshot', 'commit-meta'],
    lastError: '2026-03-19 09:26:10 diff 分片 2/3 上行 HTTP 502（artifact-gw-02），已按指数退避重传成功；10:02:35 VPN 切换导致 3 项产物入离线队列，10:16:26 补传完成',
  },
  {
    id: 'IDE-08', userId: 'u-chen', ide: 'vscode', ideVersion: 'VS Code 1.98.2', pluginVersion: '1.8.2',
    os: 'macOS 15', repoUrl: 'git@gitlab.intra.example.com:trade/order-web.git', branch: 'feat/order-list-vue3',
    taskId: 'TASK-2414', codingSessionId: 'CS-2414',
    startedAt: '2026-03-12 14:00:00', lastSyncAt: '2026-03-19 16:48:00',
    syncMode: 'realtime', connectionStatus: 'online', pendingUploads: 0,
    syncState: 'synced', syncStateLabel: '已同步 · 开发环境允许出域，无脱敏命中', tone: 'ok',
    metrics: {
      aiTurnCount: 29, aiAcceptedLines: 1870, aiRejectedLines: 255, acceptRatePct: 88,
      manualLines: 370, totalLinesChanged: 2240, contextFilesSent: 3,
      tokensSent: 132600, tokensMasked: 0, maskHitCount: 0, uploadBytes: 268440, avgLatencyMs: 204,
    },
    privacy: {
      egressMode: 'ALLOW',
      maskedFields: [],
      localOnlyFiles: [],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [],
    artifactsUploaded: ['ai-session', 'diff', 'test-result', 'coverage', 'lint-report', 'commit-meta'],
    lastError: null,
  },
  {
    id: 'IDE-09', userId: 'u-zhou', ide: 'jetbrains', ideVersion: 'IntelliJ IDEA 2025.1.3', pluginVersion: '1.7.9',
    os: 'Windows 11', repoUrl: 'git@gitlab.intra.example.com:trade/order-migrate.git', branch: 'feat/order-migrate-job',
    taskId: 'TASK-2419', codingSessionId: 'CS-2419',
    startedAt: '2026-03-11 09:20:00', lastSyncAt: '2026-03-19 11:26:00',
    syncMode: 'offline-queue', connectionStatus: 'offline', pendingUploads: 12,
    syncState: 'failed', syncStateLabel: '同步失败 · 出域例外审批未通过，12 项产物滞留本地', tone: 'danger',
    metrics: {
      aiTurnCount: 41, aiAcceptedLines: 1980, aiRejectedLines: 591, acceptRatePct: 77,
      manualLines: 700, totalLinesChanged: 2680, contextFilesSent: 0,
      tokensSent: 208400, tokensMasked: 0, maskHitCount: 0, uploadBytes: 0, avgLatencyMs: 1240,
    },
    privacy: {
      egressMode: 'DENY',
      maskedFields: [],
      localOnlyFiles: [
        'migrate-job/src/main/resources/prod-datasource.yaml',
        'migrate-job/src/main/resources/db-mapping-real.csv',
        'migrate-job/src/test/resources/prod-order-sample-1k.csv',
      ],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [],
    artifactsUploaded: [],
    lastError: '2026-03-19 11:26 上行被拒：EGRESS-DENY（禁止出域，maxSecretLevel L3）策略命中 prod-datasource.yaml 中的 L3 密钥凭证，模型已强制切换为内网 mdl-local 本地推理；12 项产物滞留离线队列，需由评审人孟星回按 EGRESS-DENY 例外流程提交数据出域审批后方可补传',
  },
  {
    id: 'IDE-10', userId: 'u-shen', ide: 'vscode', ideVersion: 'VS Code 1.98.2', pluginVersion: '1.8.2',
    os: 'Ubuntu 24.04', repoUrl: 'git@gitlab.intra.example.com:trade/order-migrate.git', branch: 'feat/order-dual-write-check',
    taskId: 'TASK-2420', codingSessionId: 'CS-2420',
    startedAt: '2026-03-18 15:00:00', lastSyncAt: '2026-03-19 09:12:00',
    syncMode: 'batch', connectionStatus: 'degraded', pendingUploads: 5,
    syncState: 'queued', syncStateLabel: '排队中 · 5 项产物等待出域例外审批', tone: 'warn',
    metrics: {
      aiTurnCount: 18, aiAcceptedLines: 0, aiRejectedLines: 0, acceptRatePct: 0,
      manualLines: 340, totalLinesChanged: 340, contextFilesSent: 5,
      tokensSent: 86200, tokensMasked: 0, maskHitCount: 0, uploadBytes: 142860, avgLatencyMs: 1080,
    },
    privacy: {
      egressMode: 'DENY',
      maskedFields: [],
      localOnlyFiles: ['migrate-job/src/main/resources/staging-datasource.yaml', 'migrate-job/src/test/resources/dual-write-sample.csv'],
      policyVersion: 'SEC-MASK-2.1',
    },
    conflicts: [],
    artifactsUploaded: ['context-snapshot'],
    lastError: '2026-03-19 09:12 双写比对样本 CSV 命中 EGRESS-DENY 的 L3 生产数据规则，diff / test-result / coverage / commit-meta / ai-session 共 5 项转入出域审批队列；CS-2420 尚无人工采纳的 AI 建议，acceptRatePct 记为 0',
  },
];

/** IDE 同步事件流条目 */
export interface IdeSyncEventDef {
  id: string;
  /** 归属的同步会话 id */
  sessionId: string;
  /** 时间戳，格式 YYYY-MM-DD HH:mm:ss，可按此字段倒序排列 */
  at: string;
  type: 'connect' | 'auth' | 'context-collect' | 'mask' | 'ai-turn' | 'accept' | 'reject' | 'diff-upload'
    | 'test-result' | 'coverage' | 'conflict' | 'retry' | 'offline-queue' | 'flush' | 'disconnect' | 'error';
  level: 'info' | 'warn' | 'error';
  direction: 'ide→platform' | 'platform→ide';
  /** 具体到字段名与数值的载荷摘要 */
  payloadSummary: string;
  bytes: number | null;
  latencyMs: number | null;
  /** 该事件是否涉及脱敏 */
  masked: boolean;
  /** 被脱敏的字段名 */
  redactedFields: string[];
  tone: Tone;
}

/**
 * 24 条 IDE 同步事件，全部归属 IDE-07（沈亦白 / TASK-2410 / CS-2410，2026-03-19 08:58~10:31），
 * 按 at 升序排列，构成一次完整可信的会话生命周期：
 *   建连 → 鉴权 → 上下文采集 → 出网脱敏（IDES-04 / IDES-09 两条 mask）→ AI 轮次 → 接受 / 拒绝
 *   → diff 上行 → 本地单测与覆盖率回传 → 502 错误 + 指数退避重试成功（IDES-12 / IDES-13）
 *   → 版本冲突 + AI 三方合并解决（IDES-15 ~ IDES-17）→ 断网入离线队列 + 回连补传（IDES-18 ~ IDES-21）
 *   → 断连收尾。
 * IDE-07.metrics.uploadBytes 372210 = 本表中 direction 为 ide→platform 且 bytes 非空的 14 条事件字节数之和
 * （含离线队列入队 IDES-18 与补传 IDES-21 的两次计数，与实际网络开销一致）。
 */
export const IDE_SYNC_EVENTS: IdeSyncEventDef[] = [
  {
    id: 'IDES-01', sessionId: 'IDE-07', at: '2026-03-19 08:58:02', type: 'connect', level: 'info',
    direction: 'ide→platform',
    payloadSummary: 'IntelliJ IDEA 2025.1.3 + 插件 v1.8.2 建立 WebSocket 长连接，clientId=ide-shen-mbp-7f3a，syncMode=offline-queue，心跳间隔 15s',
    bytes: null, latencyMs: 142, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-02', sessionId: 'IDE-07', at: '2026-03-19 08:58:03', type: 'auth', level: 'info',
    direction: 'ide→platform',
    payloadSummary: 'OAuth2 设备码换取 access_token 成功，subject=u-shen，scope=[task:write, diff:write, coverage:write]，token TTL 8h，MFA 已通过',
    bytes: null, latencyMs: 96, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-03', sessionId: 'IDE-07', at: '2026-03-19 08:58:11', type: 'context-collect', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '采集上下文切片 5 个文件（AmountAllocator.java / OrderAmount.java / BUG-1043-analysis.md / API-07-trial-order.md / promo-engine pom.xml），合计 1,284 行、68,420 字节',
    bytes: 68420, latencyMs: 210, masked: false, redactedFields: [], tone: 'info',
  },
  {
    id: 'IDES-04', sessionId: 'IDE-07', at: '2026-03-19 08:58:12', type: 'mask', level: 'warn',
    direction: 'ide→platform',
    payloadSummary: '出网前脱敏命中 2 处：rd-08 把 pom.xml 的 <nexus.password> 全量替换为 ****c88；rd-04 把测试夹具中的 payCardNo 保留后四位。上行体积由 68,420 降至 67,808 字节',
    bytes: 612, latencyMs: 18, masked: true, redactedFields: ['apiToken', 'payCardNo'], tone: 'warn',
  },
  {
    id: 'IDES-05', sessionId: 'IDE-07', at: '2026-03-19 08:59:40', type: 'ai-turn', level: 'info',
    direction: 'platform→ide',
    payloadSummary: 'ag-code(mdl-deepseek) 第 12 轮：给出 setScale(2, HALF_EVEN) + 余数归集到金额绝对值最大行的分摊修正方案，tokens in 4,860 / out 1,372',
    bytes: 21480, latencyMs: 3860, masked: false, redactedFields: [], tone: 'ai',
  },
  {
    id: 'IDES-06', sessionId: 'IDE-07', at: '2026-03-19 09:02:15', type: 'accept', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '接受 AI 补丁 hunk 3/5：AmountAllocator#allocate 余数归集，+42/-18 行，落入分支 fix/promo-amount-precision',
    bytes: 3860, latencyMs: 88, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-07', sessionId: 'IDE-07', at: '2026-03-19 09:03:02', type: 'reject', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '拒绝 AI 补丁 hunk 5/5：建议引入 javax.money 依赖（-64 行未采纳），拒绝理由「与项目 BigDecimal 统一口径规范冲突」已回灌为负样本',
    bytes: 1240, latencyMs: 76, masked: false, redactedFields: [], tone: 'warn',
  },
  {
    id: 'IDES-08', sessionId: 'IDE-07', at: '2026-03-19 09:12:48', type: 'diff-upload', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '上传 diff：3 文件 +186/-42 行，sha256=a3f91c2e…（前 8 位），关联 TASK-2410 / MR-2410，分片大小 12,480 字节 × 3',
    bytes: 24680, latencyMs: 320, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-09', sessionId: 'IDE-07', at: '2026-03-19 09:14:20', type: 'mask', level: 'warn',
    direction: 'ide→platform',
    payloadSummary: 'diff 附带的 BUG-1043-analysis.md 内嵌生产订单号与收货信息，出网前命中 27 处：rd-03（receiverAddress 保留省市区）、rd-06（receiverName 保留姓氏）、orderNo 替换为占位符 SO2026****',
    bytes: 980, latencyMs: 22, masked: true, redactedFields: ['receiverAddress', 'receiverName', 'orderNo'], tone: 'warn',
  },
  {
    id: 'IDES-10', sessionId: 'IDE-07', at: '2026-03-19 09:20:33', type: 'test-result', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '本地执行 mvn -pl promo-engine test：用例 128 通过 125 / 失败 3，失败项全部集中于 AmountAllocator#allocateNegative（对应 MR-2410 剩余 must-fix）',
    bytes: 8640, latencyMs: 180, masked: false, redactedFields: [], tone: 'warn',
  },
  {
    id: 'IDES-11', sessionId: 'IDE-07', at: '2026-03-19 09:20:35', type: 'coverage', level: 'info',
    direction: 'ide→platform',
    payloadSummary: 'JaCoCo 增量分支覆盖率 84.1%（较上次 +1.7pp），未覆盖分支 1 处：AmountAllocator#allocateNegative；距 G3 门槛 85% 差 0.9pp',
    bytes: 4120, latencyMs: 140, masked: false, redactedFields: [], tone: 'info',
  },
  {
    id: 'IDES-12', sessionId: 'IDE-07', at: '2026-03-19 09:26:10', type: 'error', level: 'error',
    direction: 'ide→platform',
    payloadSummary: 'diff 分片上传第 2/3 片失败：HTTP 502 Bad Gateway，upstream=artifact-gw-02，requestId=req-8f21c4，本地已保留分片副本',
    bytes: null, latencyMs: 30020, masked: false, redactedFields: [], tone: 'danger',
  },
  {
    id: 'IDES-13', sessionId: 'IDE-07', at: '2026-03-19 09:26:12', type: 'retry', level: 'warn',
    direction: 'ide→platform',
    payloadSummary: '按指数退避重试（第 1 次，等待 2,000ms）重传分片 2/3，sha256 校验与原分片一致，未产生重复产物',
    bytes: 12480, latencyMs: 2140, masked: false, redactedFields: [], tone: 'warn',
  },
  {
    id: 'IDES-14', sessionId: 'IDE-07', at: '2026-03-19 09:26:41', type: 'diff-upload', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '分片 2/3、3/3 重传成功，diff 合并完成，平台侧生成快照 snap-2410-0319-0926（3 文件 +186/-42 行）',
    bytes: 18240, latencyMs: 460, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-15', sessionId: 'IDE-07', at: '2026-03-19 09:41:07', type: 'conflict', level: 'warn',
    direction: 'platform→ide',
    payloadSummary: '检测到冲突：OrderAmount.java 平台版本 sha=7c1d0e9（周浩然 09:32 推送 setScale(2, HALF_EVEN) 修正）与本地工作区 sha=b42f8a1（新增 negativeFlag 字段）不一致，冲突块 2 处',
    bytes: 2260, latencyMs: 120, masked: false, redactedFields: [], tone: 'warn',
  },
  {
    id: 'IDES-16', sessionId: 'IDE-07', at: '2026-03-19 09:44:52', type: 'ai-turn', level: 'info',
    direction: 'platform→ide',
    payloadSummary: 'ag-review 给出三方合并建议：保留平台侧 HALF_EVEN 修正，本地 negativeFlag 以补丁追加，2 处冲突块逐一给出合并后代码与理由',
    bytes: 9860, latencyMs: 4120, masked: false, redactedFields: [], tone: 'ai',
  },
  {
    id: 'IDES-17', sessionId: 'IDE-07', at: '2026-03-19 09:47:18', type: 'diff-upload', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '按 AI 建议完成合并并上传：OrderAmount.java 冲突块 2 处已解决，+38/-12 行，resolvedBy=ai，沈亦白 09:47 人工复核通过',
    bytes: 6420, latencyMs: 240, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-18', sessionId: 'IDE-07', at: '2026-03-19 10:02:35', type: 'offline-queue', level: 'warn',
    direction: 'ide→platform',
    payloadSummary: '网络中断（Wi-Fi 切换至内网 VPN 失败），3 项产物进入本地离线队列：test-result(8,640B) / coverage(4,120B) / commit-meta(2,400B)，队列占用 184KB，加密落盘',
    bytes: 188416, latencyMs: null, masked: false, redactedFields: [], tone: 'warn',
  },
  {
    id: 'IDES-19', sessionId: 'IDE-07', at: '2026-03-19 10:15:09', type: 'retry', level: 'warn',
    direction: 'ide→platform',
    payloadSummary: '离线队列首次回连失败：TLS 握手超时（内网代理 proxy-sh01 未响应，connect timeout 60s），按策略等待 60s 后重试',
    bytes: null, latencyMs: 60010, masked: false, redactedFields: [], tone: 'warn',
  },
  {
    id: 'IDES-20', sessionId: 'IDE-07', at: '2026-03-19 10:16:22', type: 'connect', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '回连成功，WebSocket 重建（clientId=ide-shen-mbp-7f3a），token 仍在有效期内无需重新鉴权，队列待补传 3 项',
    bytes: null, latencyMs: 168, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-21', sessionId: 'IDE-07', at: '2026-03-19 10:16:26', type: 'flush', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '离线队列补传完成：test-result(8,640B) + coverage(4,120B) + commit-meta(2,400B) = 15,462B，三项 sha256 校验全部一致，队列已清空',
    bytes: 15462, latencyMs: 620, masked: false, redactedFields: [], tone: 'ok',
  },
  {
    id: 'IDES-22', sessionId: 'IDE-07', at: '2026-03-19 10:18:40', type: 'ai-turn', level: 'info',
    direction: 'platform→ide',
    payloadSummary: 'ag-test 依据本地 3 条失败用例反向生成 6 条负向分摊断言（含余数归集与 MAX_ABSORB 两种策略），已写入 IDEA 测试草稿待人工复核',
    bytes: 7240, latencyMs: 3480, masked: false, redactedFields: [], tone: 'ai',
  },
  {
    id: 'IDES-23', sessionId: 'IDE-07', at: '2026-03-19 10:22:15', type: 'context-collect', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '增量上下文同步：新增 OrderAmountTest.java 与 ADR-2403-01 草稿，脱敏扫描 0 命中，合计 412 行、18,640 字节',
    bytes: 18640, latencyMs: 190, masked: false, redactedFields: [], tone: 'info',
  },
  {
    id: 'IDES-24', sessionId: 'IDE-07', at: '2026-03-19 10:31:02', type: 'disconnect', level: 'info',
    direction: 'ide→platform',
    payloadSummary: '会话正常结束：累计 AI 轮次 14、接受 1,186 行 / 拒绝 214 行（采纳率 84.7%）、上行 372,210 字节、6 类产物已归档，pendingUploads=0',
    bytes: null, latencyMs: 96, masked: false, redactedFields: [], tone: 'ok',
  },
];

/** IDE 插件（VS Code 扩展 / JetBrains 插件）发布信息 */
export interface IdePluginDef {
  id: string;
  name: string;
  ide: 'vscode' | 'jetbrains';
  version: string;
  minIdeVersion: string;
  marketplaceUrl: string;
  installCount: number;
  features: string[];
  /** 同步协议 */
  syncProtocol: string;
  /** 支持的模型 id */
  supportedModels: string[];
  autoUpdate: boolean;
  telemetryOptIn: boolean;
  knownIssues: string[];
  releasedAt: string;
  tone: Tone;
}

/**
 * 2 个 IDE 插件：VS Code 扩展与 JetBrains 插件，能力对齐（10 项 features 一一对应）。
 * supportedModels 与 data.ts 的 models 一致；EGRESS-DENY 环境下仅 mdl-local 可用。
 */
export const IDE_PLUGINS: IdePluginDef[] = [
  {
    id: 'IDE-PLG-VSC',
    name: 'Artisan AI SDLC for VS Code',
    ide: 'vscode',
    version: '1.8.2',
    minIdeVersion: 'VS Code 1.92.0',
    marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=artisan.ai-sdlc',
    installCount: 486,
    features: [
      '内联 AI 补全',
      '任务卡侧栏',
      '上下文切片选择器',
      'Diff 逐块接受',
      '本地单测执行',
      '脱敏预览',
      '离线队列',
      '一键提 MR',
      'Agent 会话面板',
      '门禁预检',
    ],
    syncProtocol: 'WebSocket 长连接（wss，15s 心跳）+ HTTPS 分片上行（12KB/片，sha256 校验）',
    supportedModels: ['mdl-claude', 'mdl-deepseek', 'mdl-qwen', 'mdl-gpt5', 'mdl-local'],
    autoUpdate: true,
    telemetryOptIn: true,
    knownIssues: [
      '1.8.2：Remote-SSH 场景下上下文切片选择器偶发丢失工作区根路径，需在命令面板执行「Artisan: Reload Workspace」恢复',
      '1.8.2：脱敏预览面板在超过 5,000 行的文件中渲染卡顿约 1.2s，已排入 1.8.3',
    ],
    releasedAt: '2026-03-08',
    tone: 'brand',
  },
  {
    id: 'IDE-PLG-JB',
    name: 'Artisan AI SDLC for JetBrains',
    ide: 'jetbrains',
    version: '1.8.2',
    minIdeVersion: 'IntelliJ Platform 2024.3',
    marketplaceUrl: 'https://plugins.jetbrains.com/plugin/24817-artisan-ai-sdlc',
    installCount: 312,
    features: [
      '内联 AI 补全',
      '任务卡侧栏（Tool Window）',
      '上下文切片选择器',
      'Diff 逐块接受',
      '本地单测执行（复用 IDEA Run Configuration）',
      '脱敏预览',
      '离线队列',
      '一键提 MR',
      'Agent 会话面板',
      '门禁预检',
    ],
    syncProtocol: 'WebSocket 长连接（wss，15s 心跳）+ HTTPS 分片上行（12KB/片，sha256 校验）',
    supportedModels: ['mdl-claude', 'mdl-deepseek', 'mdl-qwen', 'mdl-gpt5', 'mdl-local'],
    autoUpdate: true,
    telemetryOptIn: true,
    knownIssues: [
      '1.7.9 及更早版本在 EGRESS-DENY 环境下不会自动切换到 mdl-local，需手动在设置中指定内网模型（IDE-09 仍在使用 1.7.9，已通知升级）',
      '1.8.2：Kotlin DSL 构建脚本的上下文切片识别不全，Gradle 依赖变更需手动加入切片',
    ],
    releasedAt: '2026-03-08',
    tone: 'indigo',
  },
];

/* ==== 4. AI 管理增强：排期建议 / 工时预估 / 任务拆解 ==== */

/** 排期方案（当前计划 vs AI 建议计划） */
export interface SchedulePlanDef {
  assigneeId: string;
  startDate: string;
  endDate: string;
  /** 故事点 */
  points: number;
}

/** 排期建议的影响评估 */
export interface ScheduleImpactDef {
  /** 对关键路径的影响天数，负数表示缩短 */
  criticalPathDeltaDays: number;
  /** 对迭代负载的影响小时数，负数表示释放产能 */
  sprintLoadDelta: number;
  riskDelta: '降低' | '不变' | '升高';
  affectedTaskIds: string[];
}

/** 排期建议的约束校验项 */
export interface ScheduleConstraintCheckDef {
  constraint: '依赖前置' | '成员产能' | '技能匹配' | '封网期' | '休假' | '评审窗口';
  satisfied: boolean;
  detail: string;
}

/** AI 排期建议 */
export interface AiScheduleSuggestionDef {
  id: string;
  /** 目标工作项 id（取自 data.ts 的 TASKS，TASK-2401 ~ TASK-2424） */
  taskId: string;
  taskTitle: string;
  generatedAt: string;
  modelId: string;
  agentId: string;
  currentPlan: SchedulePlanDef;
  suggestedPlan: SchedulePlanDef;
  changeType: '提前' | '延后' | '改派' | '拆分' | '并行化' | '压缩';
  /** 建议依据，引用真实的依赖关系、关键路径、成员负载、历史速率或技能匹配数据 */
  reason: string;
  confidencePct: number;
  impact: ScheduleImpactDef;
  constraintChecks: ScheduleConstraintCheckDef[];
  status: 'pending' | 'accepted' | 'rejected' | 'auto-applied';
  decidedBy: string | null;
  /** 决策时间；auto-applied 时为系统自动应用时间 */
  decidedAt: string | null;
  rejectReason: string | null;
  tone: Tone;
}

/**
 * 8 条 AI 排期建议：3 条 accepted（SCH-01 / SCH-04 / SCH-08）、2 条 rejected（SCH-02 / SCH-06）、
 * 2 条 pending（SCH-03 / SCH-07）、1 条 auto-applied（SCH-05）。
 * 其中 4 条直接消解 data.ts 中 GANTT_CONFLICTS 的真实冲突：
 *   SCH-01 / SCH-02 / SCH-08 → GANTT-CF-03（周浩然 03-16~03-17 被 TASK-2412 与 TASK-2415 双重占用，超载 11h）；
 *   SCH-03 → GANTT-CF-01（BLOCK-0312 阻塞迁移，关键路径顺延 5 天）；
 *   SCH-04 → GANTT-CF-02 与 GANTT-CF-05（SP-24 剩余产能缺口 18h / 拆单前端逼近交付节点）；
 *   SCH-05 → GANTT-CF-04（G3 单测门禁连续 3 次失败，03-20 灰度窗口面临丢失）；
 *   SCH-06 / SCH-07 → GANTT-CF-02 与 GANTT-CF-06（沈亦白 03-19~03-20 同时挂 3 个工作项）。
 * currentPlan 的起止日期与故事点均取自 TASKS 的真实字段。
 */
export const AI_SCHEDULE_SUGGESTIONS: AiScheduleSuggestionDef[] = [
  {
    id: 'SCH-01', taskId: 'TASK-2415', taskTitle: '拆单引擎规则实现（商家/仓库/类目/重量）',
    generatedAt: '2026-03-18 18:35', modelId: 'mdl-claude', agentId: 'ag-arch',
    currentPlan: { assigneeId: 'u-zhou', startDate: '2026-03-16', endDate: '2026-03-23', points: 8 },
    suggestedPlan: { assigneeId: 'u-zhou', startDate: '2026-03-18', endDate: '2026-03-24', points: 8 },
    changeType: '延后',
    reason:
      '直接消解 GANTT-CF-03：周浩然在 03-16~03-17 同时被 TASK-2412（Redis 多级缓存）与 TASK-2415 占用，日负载 13.5 小时、超单人日产能 68%。TASK-2412 实际已耗 27 小时 / 预估 24 小时且仍在收尾，而 TASK-2415 分析进度仅 28%。把 TASK-2415 起始日顺延 2 天至 03-18，可让缓存一致性验证窗口不被挤占；DEP-10 本身是 start-start 软依赖，顺延不违反任何前置约束。',
    confidencePct: 86,
    impact: { criticalPathDeltaDays: 0, sprintLoadDelta: -11, riskDelta: '降低', affectedTaskIds: ['TASK-2412', 'TASK-2416'] },
    constraintChecks: [
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-10（TASK-2412 → TASK-2415）为 start-start 软依赖，lagDays=0，顺延后仍满足；DEP-11（TASK-2415 → TASK-2416）为 finish-start，需同步顺延 TASK-2416（见 SCH-04）' },
      { constraint: '成员产能', satisfied: true, detail: '周浩然 03-18 之后无其他并行工作项，日负载由 13.5h 回落至 8h' },
      { constraint: '技能匹配', satisfied: true, detail: 'ac-split-engine 归属周浩然（ownerId=u-zhou），技能匹配度 0.91，不建议改派' },
      { constraint: '评审窗口', satisfied: true, detail: '03-24 完成仍可赶上 03-25 的迭代评审窗口' },
    ],
    status: 'accepted', decidedBy: 'u-lin', decidedAt: '2026-03-18 19:05', rejectReason: null,
    tone: 'ok',
  },
  {
    id: 'SCH-02', taskId: 'TASK-2415', taskTitle: '拆单引擎规则实现（商家/仓库/类目/重量）',
    generatedAt: '2026-03-18 18:35', modelId: 'mdl-claude', agentId: 'ag-arch',
    currentPlan: { assigneeId: 'u-zhou', startDate: '2026-03-16', endDate: '2026-03-23', points: 8 },
    suggestedPlan: { assigneeId: 'u-shen', startDate: '2026-03-16', endDate: '2026-03-23', points: 8 },
    changeType: '改派',
    reason:
      'GANTT-CF-03 的建议方案之一：把拆单引擎改派给沈亦白，可一次性释放周浩然 13 小时负载并让 TASK-2415 按原计划 03-23 完成，从而不触发 GANTT-CF-05 的交付节点风险。模型基于「沈亦白 03-20 后有余量」的判断给出该方案。',
    confidencePct: 61,
    impact: { criticalPathDeltaDays: 0, sprintLoadDelta: -13, riskDelta: '升高', affectedTaskIds: ['TASK-2420', 'TASK-2422', 'TASK-2407'] },
    constraintChecks: [
      { constraint: '成员产能', satisfied: false, detail: '与 GANTT-CF-06 冲突：沈亦白 03-19~03-20 已挂 TASK-2420（双写校验）、TASK-2422（SM4 加密）、TASK-2407（规则热更新）三项，若同时解锁日负载将达 12 小时' },
      { constraint: '技能匹配', satisfied: false, detail: '沈亦白在 ac-split-engine 无历史提交记录，技能匹配度 0.42；其近 3 个迭代集中在 ac-outbox-relay 与 ac-migrate-job' },
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-10 / DEP-11 不受负责人变更影响' },
      { constraint: '封网期', satisfied: true, detail: '03-16~03-23 不在财务结算封网期内' },
    ],
    status: 'rejected', decidedBy: 'u-lin', decidedAt: '2026-03-18 19:12',
    rejectReason:
      '两项硬约束不满足：一是与 GANTT-CF-06 直接冲突，沈亦白 03-19~03-20 已有 3 个工作项、日负载将达 12 小时；二是拆单规则依赖 ac-split-engine 的领域知识，沈亦白技能匹配度仅 0.42，改派会带来更高的返工风险。最终采纳 SCH-01（顺延 2 天 + AI 全自动推进 ac-split-engine 分析）。',
    tone: 'danger',
  },
  {
    id: 'SCH-03', taskId: 'TASK-2419', taskTitle: '历史订单全量迁移作业（断点续传）',
    generatedAt: '2026-03-19 07:32', modelId: 'mdl-gpt5', agentId: 'ag-arch',
    currentPlan: { assigneeId: 'u-zhou', startDate: '2026-03-11', endDate: '2026-03-20', points: 8 },
    suggestedPlan: { assigneeId: 'u-zhou', startDate: '2026-03-11', endDate: '2026-03-25', points: 8 },
    changeType: '拆分',
    reason:
      '直接消解 GANTT-CF-01：TASK-2419 已被 BLOCK-0312（DBA 未批复迁移窗口）阻塞 7 天，并向后传导至 DEP-15（TASK-2420 双写比对）与 DEP-16 / DEP-17（TASK-2421 生产切流），关键路径末端超出 03-27 迭代收尾日的风险为 62%。采纳 GANTT-CF-01 的方案二：把 4.7 亿行按用户 ID 分片拆成 4 个小窗口（每批 ≤ 1.2 亿条），在财务结算期内的每日 01:00~05:00 低峰执行，可绕开单一长窗口的审批僵局，关键路径缩短 3 天。',
    confidencePct: 74,
    impact: { criticalPathDeltaDays: -3, sprintLoadDelta: 0, riskDelta: '降低', affectedTaskIds: ['TASK-2420', 'TASK-2421'] },
    constraintChecks: [
      { constraint: '封网期', satisfied: true, detail: '4 个小窗口均落在 03-21~03-25 的每日 01:00~05:00 低峰段，避开 03-28 财务结算封网' },
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-14（TASK-2413 → TASK-2419）已满足，新分片集群 03-13 就绪；DEP-15 / DEP-16 / DEP-17 需相应顺延至 03-25 之后' },
      { constraint: '成员产能', satisfied: true, detail: '迁移作业由 ag-code + mdl-local 自动推进，周浩然仅做批次放行评审，人工占用 ≤ 4 小时' },
      { constraint: '评审窗口', satisfied: false, detail: 'DBA 与财务双方确认尚未完成，需孟星回在 03-20 前拿到书面批复，否则该建议无法落地' },
    ],
    status: 'pending', decidedBy: null, decidedAt: null, rejectReason: null,
    tone: 'ai',
  },
  {
    id: 'SCH-04', taskId: 'TASK-2416', taskTitle: '拆单结果前端展示与父/子订单聚合视图',
    generatedAt: '2026-03-19 07:32', modelId: 'mdl-gpt5', agentId: 'ag-pm',
    currentPlan: { assigneeId: 'u-chen', startDate: '2026-03-19', endDate: '2026-03-25', points: 5 },
    suggestedPlan: { assigneeId: 'u-chen', startDate: '2026-03-30', endDate: '2026-04-08', points: 5 },
    changeType: '延后',
    reason:
      '同时消解 GANTT-CF-02 与 GANTT-CF-05：SP-24 剩余产能仅 50 小时，而 5 个未启动工作项合计需 68 小时，缺口 18 小时；TASK-2416 依赖 DEP-11（TASK-2415 完成后启动），而 TASK-2415 顺延至 03-24 完成，TASK-2416 只剩 1 天可用（原需 5 天）。把它整体移入 SP-25（03-30~04-24）可释放 20 小时产能，并按 GANTT-CF-05 的建议把 REQ-2405 本迭代验收范围收缩为「服务端拆单 + 接口返回聚合结构」。',
    confidencePct: 92,
    impact: { criticalPathDeltaDays: 0, sprintLoadDelta: -20, riskDelta: '降低', affectedTaskIds: ['TASK-2415'] },
    constraintChecks: [
      { constraint: '成员产能', satisfied: true, detail: '陈屿 SP-24 已承接 3 点（TASK-2414），移出 TASK-2416 后本迭代负载回到容量线以内' },
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-11 为 finish-start，跨迭代顺延不产生环；PT-02 拆单原型已产出 PTP-09 / PTP-14 界面基线，SP-25 可直接开发' },
      { constraint: '评审窗口', satisfied: true, detail: 'REQ-2405 验收范围收缩需苏文瑾在 03-20 迭代评审前更新 PRD 验收标准' },
      { constraint: '休假', satisfied: true, detail: '陈屿 SP-25 首周无休假记录' },
    ],
    status: 'accepted', decidedBy: 'u-gu', decidedAt: '2026-03-19 09:40', rejectReason: null,
    tone: 'ok',
  },
  {
    id: 'SCH-05', taskId: 'TASK-2405', taskTitle: '下单链路单元测试补齐（覆盖率目标 85%）',
    generatedAt: '2026-03-19 08:10', modelId: 'mdl-deepseek', agentId: 'ag-test',
    currentPlan: { assigneeId: 'u-ai-copilot', startDate: '2026-03-10', endDate: '2026-03-16', points: 1 },
    suggestedPlan: { assigneeId: 'u-ai-copilot', startDate: '2026-03-10', endDate: '2026-03-19', points: 1 },
    changeType: '并行化',
    reason:
      '消解 GANTT-CF-04：G3 门禁已连续 3 次失败（PIPE-2407 / 2408 / 2409），聚合分支覆盖率 71.4% 距 85% 差 13.6pp，缺口集中在 InventoryDeductService#rollback 与 OrderCreateService#rejectDuplicate 两处。把「AI 反向生成 12 个异常回滚用例」与「何斯年人工复核」由串行改为并行（AI 每产出 4 条即推送复核），结束日顺延至 03-19 但净耗时压缩 6 小时，可保住 03-20 22:00 的灰度窗口，避免 REL-2403 重新排队至 03-27 之后。',
    confidencePct: 88,
    impact: { criticalPathDeltaDays: -1, sprintLoadDelta: -6, riskDelta: '降低', affectedTaskIds: ['TASK-2421', 'TASK-2403'] },
    constraintChecks: [
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-02（TASK-2401 → TASK-2405，start-start lag 3 天）与 DEP-18（TASK-2405 → TASK-2421）均满足，TASK-2405 位于关键路径' },
      { constraint: '成员产能', satisfied: true, detail: '执行主体为 u-ai-copilot（AI 共享账号），何斯年人工投入 ≤ 2 小时，不占用其他工作项产能' },
      { constraint: '技能匹配', satisfied: true, detail: 'ag-test 已在 CS-2405 累计 68 轮会话、采纳率 74%，具备该链路的上下文' },
      { constraint: '评审窗口', satisfied: true, detail: '03-19 完成可在 03-20 门禁复判前合入' },
    ],
    status: 'auto-applied', decidedBy: null, decidedAt: '2026-03-19 08:12', rejectReason: null,
    tone: 'ai',
  },
  {
    id: 'SCH-06', taskId: 'TASK-2424', taskTitle: '查询/导出行为审计留痕与越权告警',
    generatedAt: '2026-03-19 07:32', modelId: 'mdl-gpt5', agentId: 'ag-pm',
    currentPlan: { assigneeId: 'u-meng', startDate: '2026-03-23', endDate: '2026-03-26', points: 1 },
    suggestedPlan: { assigneeId: 'u-meng', startDate: '2026-03-30', endDate: '2026-04-02', points: 1 },
    changeType: '延后',
    reason:
      '按 GANTT-CF-02 的建议把 P2 工作项移入 SP-25 以填补 18 小时产能缺口：TASK-2424 优先级 P2、故事点 1，且依赖 DEP-20（TASK-2423 完成后 lag 1 天启动），而 TASK-2423 本身尚未开发，本迭代内启动概率低。移出可释放 8 小时。',
    confidencePct: 68,
    impact: { criticalPathDeltaDays: 0, sprintLoadDelta: -8, riskDelta: '升高', affectedTaskIds: ['TASK-2423'] },
    constraintChecks: [
      { constraint: '成员产能', satisfied: true, detail: '孟星回 SP-24 已承接 TASK-2404 / 2418 / 2421 三项，移出后负载下降 8 小时' },
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-20（TASK-2423 → TASK-2424，lag 1 天）随 TASK-2423 一并顺延，不产生环' },
      { constraint: '评审窗口', satisfied: false, detail: 'G6 观测门禁第 4 项「敏感字段访问审计留痕 100%」当前未达标，顺延将使该门禁项在 SP-24 内无法关闭' },
    ],
    status: 'rejected', decidedBy: 'u-gu', decidedAt: '2026-03-19 10:05',
    rejectReason:
      '风险不可接受：REQ-2408 合规项与 BUG-1052（导出接口未触发二次授权且无审计留痕）直接相关，03-19 17:44 的 AR-08 执行已证实 AC-14 失败；G6 观测门禁第 4 项本就未达标，再顺延 9 天会让合规风险敞口跨过迭代边界。PMO 与合规组一致要求保留在 SP-24，改由 SCH-04 释放的 20 小时产能承接。',
    tone: 'danger',
  },
  {
    id: 'SCH-07', taskId: 'TASK-2422', taskTitle: '敏感字段 SM4 加密与 KMS 密钥托管接入',
    generatedAt: '2026-03-19 07:32', modelId: 'mdl-gpt5', agentId: 'ag-pm',
    currentPlan: { assigneeId: 'u-shen', startDate: '2026-03-19', endDate: '2026-03-24', points: 2 },
    suggestedPlan: { assigneeId: 'u-shen', startDate: '2026-03-20', endDate: '2026-03-24', points: 2 },
    changeType: '并行化',
    reason:
      '消解 GANTT-CF-06：沈亦白在 03-19~03-20 同时挂 TASK-2420（等待迁移窗口）、TASK-2422（尚未启动）、TASK-2407（等待方案确认）三项，若 03-20 同时解锁日负载将达 12 小时。按冲突建议把 SM4 加密改造设为 ag-code 全自动执行（复用 ac-mask-sdk 的 SEC-MASK-2.1 既有实现，历史相似任务 3 个、平均 9.5 小时），沈亦白仅做代码评审，起始日顺延 1 天避开解锁峰值，人工占用从 12 小时降到 4 小时。',
    confidencePct: 79,
    impact: { criticalPathDeltaDays: 0, sprintLoadDelta: -4, riskDelta: '降低', affectedTaskIds: ['TASK-2420', 'TASK-2407', 'TASK-2423'] },
    constraintChecks: [
      { constraint: '成员产能', satisfied: true, detail: '顺延 1 天后沈亦白 03-20 日负载由 12h 降至 8h，符合单人日产能上限' },
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-19（TASK-2422 → TASK-2423）为 finish-start，TASK-2422 结束日 03-24 未变，TASK-2423 不受影响' },
      { constraint: '技能匹配', satisfied: true, detail: 'ac-mask-sdk 归属安全组，沈亦白具备评审资质；AI 全自动执行需何斯年补 4 条加解密回归用例' },
      { constraint: '封网期', satisfied: true, detail: 'KMS 密钥托管变更需避开 03-28 财务结算封网，03-24 前完成满足要求' },
    ],
    status: 'pending', decidedBy: null, decidedAt: null, rejectReason: null,
    tone: 'ai',
  },
  {
    id: 'SCH-08', taskId: 'TASK-2412', taskTitle: 'Redis 7 多级缓存与 binlog 失效一致性',
    generatedAt: '2026-03-15 20:14', modelId: 'mdl-claude', agentId: 'ag-arch',
    currentPlan: { assigneeId: 'u-zhou', startDate: '2026-03-09', endDate: '2026-03-17', points: 5 },
    suggestedPlan: { assigneeId: 'u-zhou', startDate: '2026-03-09', endDate: '2026-03-16', points: 5 },
    changeType: '提前',
    reason:
      '与 SCH-01 配对消解 GANTT-CF-03：把缓存一致性验证从 03-17 提前到 03-16 上午（该时段周浩然负载仅 4.5 小时），配合 TASK-2415 顺延至 03-18，两人日负载峰值从 13.5 小时降到 8 小时。TASK-2412 位于关键路径（CRITICAL_PATH 第 5 位），提前 1 天完成可为 DEP-08（TASK-2413 → TASK-2412）与 DEP-09（TASK-2412 → TASK-2414）各争取 1 天缓冲。',
    confidencePct: 83,
    impact: { criticalPathDeltaDays: -1, sprintLoadDelta: 0, riskDelta: '降低', affectedTaskIds: ['TASK-2415', 'TASK-2414'] },
    constraintChecks: [
      { constraint: '依赖前置', satisfied: true, detail: 'DEP-08（TASK-2413 → TASK-2412，finish-start lag 1 天）已满足：TASK-2413 于 03-13 完成' },
      { constraint: '成员产能', satisfied: true, detail: '03-16 上午周浩然无并行工作项，可投入完整 4 小时做失效广播验证' },
      { constraint: '技能匹配', satisfied: true, detail: 'ac-cache-layer 归属周浩然，技能匹配度 0.94' },
      { constraint: '评审窗口', satisfied: true, detail: '03-16 完成可纳入 03-17 的架构组缓存方案评审' },
    ],
    status: 'accepted', decidedBy: 'u-lin', decidedAt: '2026-03-15 20:18', rejectReason: null,
    tone: 'ok',
  },
];

/** 工时预估准确率轨迹上的单个采样点 */
export interface EffortAccuracyPointDef {
  taskId: string;
  /** 当时 AI 给出的预估工时（小时） */
  estimated: number;
  /** 该任务的实际工时（取自 TASKS.actualHours） */
  actual: number;
  /** 误差（%）= (estimated − actual) / actual × 100 */
  errorPct: number;
}

/**
 * 集成 / 历史回归类方法的准确率收敛轨迹（近 5 个已交付任务）。
 * 误差由 ±28.8% 收敛到 ±9.0%，样本量从 12 增至 34。
 */
export const EFFORT_ACCURACY_TREND_ENSEMBLE: EffortAccuracyPointDef[] = [
  { taskId: 'TASK-2401', estimated: 43.8, actual: 34, errorPct: 28.8 },
  { taskId: 'TASK-2402', estimated: 21.4, actual: 17, errorPct: 25.9 },
  { taskId: 'TASK-2413', estimated: 28.6, actual: 24, errorPct: 19.2 },
  { taskId: 'TASK-2406', estimated: 24.2, actual: 21, errorPct: 15.2 },
  { taskId: 'TASK-2409', estimated: 31.6, actual: 29, errorPct: 9.0 },
];

/** 代码规模类方法的准确率收敛轨迹：误差由 ±25.8% 收敛到 ±10.0%。 */
export const EFFORT_ACCURACY_TREND_CODE_SIZE: EffortAccuracyPointDef[] = [
  { taskId: 'TASK-2413', estimated: 30.2, actual: 24, errorPct: 25.8 },
  { taskId: 'TASK-2403', estimated: 31.2, actual: 26, errorPct: 20.0 },
  { taskId: 'TASK-2412', estimated: 31.6, actual: 27, errorPct: 17.0 },
  { taskId: 'TASK-2409', estimated: 32.8, actual: 29, errorPct: 13.1 },
  { taskId: 'TASK-2401', estimated: 37.4, actual: 34, errorPct: 10.0 },
];

/** 复杂度模型类方法的准确率收敛轨迹：误差由 ±32.9% 收敛到 ±14.1%。 */
export const EFFORT_ACCURACY_TREND_COMPLEXITY: EffortAccuracyPointDef[] = [
  { taskId: 'TASK-2402', estimated: 22.6, actual: 17, errorPct: 32.9 },
  { taskId: 'TASK-2406', estimated: 26.4, actual: 21, errorPct: 25.7 },
  { taskId: 'TASK-2403', estimated: 31.8, actual: 26, errorPct: 22.3 },
  { taskId: 'TASK-2410', estimated: 37.2, actual: 31, errorPct: 20.0 },
  { taskId: 'TASK-2412', estimated: 30.8, actual: 27, errorPct: 14.1 },
];

/** 复杂度特征权重项 */
export interface EstimateFeatureWeightDef {
  feature: '代码规模' | '接口数' | 'DB 迁移' | '并发要求' | '依赖组件数' | '历史缺陷密度' | '开发者熟悉度';
  /** 特征权重，同一条预估内 Σweight = 1.00 */
  weight: number;
  /** 该特征对总工时的贡献小时数，同一条预估内 Σcontribution = aiEstimateHours */
  contribution: number;
}

/** 预估的历史依据 */
export interface EstimateHistoryBasisDef {
  /** 相似任务 id（2~4 个，取自 data.ts 的 TASKS） */
  similarTaskIds: string[];
  /** 相似任务的平均实际工时 */
  similarTaskAvgHours: number;
  /** 回归模型样本量 */
  sampleSize: number;
  /** 回归拟合度 R² */
  r2Score: number;
  featureWeights: EstimateFeatureWeightDef[];
}

/** 预估的风险因子 */
export interface EstimateRiskFactorDef {
  factor: string;
  /** 风险权重（%），同一条预估内 ΣweightPct = 100 */
  weightPct: number;
  note: string;
}

/** 人工三点估算 */
export interface ThreePointEstimateDef {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  /** PERT 值 = (optimistic + 4 × mostLikely + pessimistic) / 6 */
  pert: number;
}

/** AI 工时预估 */
export interface AiEffortEstimateDef {
  id: string;
  taskId: string;
  taskTitle: string;
  /** 真实故事点（取自 TASKS.points） */
  taskPoints: number;
  generatedAt: string;
  modelId: string;
  method: 'history-regression' | 'similar-task' | 'code-size' | 'complexity-model' | 'ensemble';
  /** AI 预估工时（小时）= Σ featureWeights[].contribution */
  aiEstimateHours: number;
  humanEstimateHours: ThreePointEstimateDef;
  /** 偏差（%）= (aiEstimateHours − pert) / pert × 100 */
  variancePct: number;
  confidencePct: number;
  confidenceBand: { low: number; high: number };
  historyBasis: EstimateHistoryBasisDef;
  riskFactors: EstimateRiskFactorDef[];
  /** 2~3 句解释 */
  aiNote: string;
  accuracyTrend: EffortAccuracyPointDef[];
  status: 'suggested' | 'adopted' | 'overridden';
  /** 团队最终采纳的工时（= TASKS.estimateHours），未采纳为 null */
  adoptedValue: number | null;
  tone: Tone;
}

/**
 * 12 条 AI 工时预估，逐条挂靠真实工作项（taskId / taskTitle / taskPoints 取自 TASKS）。
 * 计算公式（三条口径均可逐项复核）：
 *   ① pert = (optimistic + 4 × mostLikely + pessimistic) / 6；
 *   ② variancePct = (aiEstimateHours − pert) / pert × 100，保留 1 位小数；
 *   ③ aiEstimateHours = Σ featureWeights[].contribution，且 Σ featureWeights[].weight = 1.00；
 *   ④ Σ riskFactors[].weightPct = 100。
 * adoptedValue 与 TASKS.estimateHours 一致；status 为 suggested 的 2 条（EST-11 / EST-12）表示 AI 建议未被采纳，
 * 团队沿用人工估算（分别为 32h 与 36h）。
 */
export const AI_EFFORT_ESTIMATES: AiEffortEstimateDef[] = [
  {
    id: 'EST-01', taskId: 'TASK-2401', taskTitle: '幂等下单接口改造：Idempotency-Key 两级校验', taskPoints: 8,
    generatedAt: '2026-03-01 20:12', modelId: 'mdl-claude', method: 'ensemble',
    aiEstimateHours: 34.5,
    humanEstimateHours: { optimistic: 26, mostLikely: 32, pessimistic: 44, pert: 33.0 },
    variancePct: 4.5, confidencePct: 88, confidenceBand: { low: 31.0, high: 38.0 },
    historyBasis: {
      similarTaskIds: ['TASK-2402', 'TASK-2406', 'TASK-2413'],
      similarTaskAvgHours: 22.0, sampleSize: 34, r2Score: 0.86,
      featureWeights: [
        { feature: '代码规模', weight: 0.28, contribution: 9.6 },
        { feature: '接口数', weight: 0.18, contribution: 6.2 },
        { feature: 'DB 迁移', weight: 0.06, contribution: 2.1 },
        { feature: '并发要求', weight: 0.22, contribution: 7.6 },
        { feature: '依赖组件数', weight: 0.12, contribution: 4.1 },
        { feature: '历史缺陷密度', weight: 0.08, contribution: 2.8 },
        { feature: '开发者熟悉度', weight: 0.06, contribution: 2.1 },
      ],
    },
    riskFactors: [
      { factor: '3000 TPS 下的幂等竞态', weightPct: 45, note: 'Redis SETNX 与 MySQL 唯一索引需在同一事务边界内收敛，历史上同类改造平均超期 18%' },
      { factor: 'v1.x clientToken 兼容期双跑', weightPct: 35, note: '契约标记 breaking=true，需保留 1 个迭代的兼容分支' },
      { factor: 'INC-2026-0131 事故复盘遗留项', weightPct: 20, note: '需额外补 6 条异常回滚单测以过 G3' },
    ],
    aiNote: '并发要求（权重 0.22，贡献 7.6h）是本任务的最大不确定性来源，高于同类任务的平均占比 0.14。相似任务均值 22h 偏低，因其未包含 3000 TPS 的竞态验证；集成后给出 34.5h，与人工 PERT 33.0h 仅差 4.5%。实际耗时 34h，落在置信区间内。',
    accuracyTrend: EFFORT_ACCURACY_TREND_ENSEMBLE,
    status: 'adopted', adoptedValue: 32, tone: 'ok',
  },
  {
    id: 'EST-02', taskId: 'TASK-2402', taskTitle: '本地消息表 outbox 落地与指数退避重试', taskPoints: 5,
    generatedAt: '2026-03-02 21:40', modelId: 'mdl-deepseek', method: 'history-regression',
    aiEstimateHours: 18.6,
    humanEstimateHours: { optimistic: 15, mostLikely: 20, pessimistic: 25, pert: 20.0 },
    variancePct: -7.0, confidencePct: 90, confidenceBand: { low: 16.8, high: 20.4 },
    historyBasis: {
      similarTaskIds: ['TASK-2417', 'TASK-2418'],
      similarTaskAvgHours: 13.0, sampleSize: 34, r2Score: 0.84,
      featureWeights: [
        { feature: '代码规模', weight: 0.30, contribution: 5.6 },
        { feature: '接口数', weight: 0.12, contribution: 2.2 },
        { feature: 'DB 迁移', weight: 0.10, contribution: 1.9 },
        { feature: '并发要求', weight: 0.14, contribution: 2.6 },
        { feature: '依赖组件数', weight: 0.12, contribution: 2.2 },
        { feature: '历史缺陷密度', weight: 0.10, contribution: 1.9 },
        { feature: '开发者熟悉度', weight: 0.12, contribution: 2.2 },
      ],
    },
    riskFactors: [
      { factor: '死信积压回放策略', weightPct: 40, note: '2^n 退避最多 6 次，超限入死信并告警，需要与 TASK-2418 的回放工具对齐格式' },
      { factor: 'outbox 表分区与索引设计', weightPct: 35, note: 'V24_3__outbox.sql 迁移需 DBA 评审' },
      { factor: 'RabbitMQ 3.13 确认模式语义', weightPct: 25, note: 'publisher confirm 与本地事务的先后顺序易错' },
    ],
    aiNote: '沈亦白在 ac-outbox-relay 有 2 个迭代的连续提交记录，开发者熟悉度贡献 2.2h（占比 0.12）显著高于团队均值。历史回归给出 18.6h，比人工 PERT 20.0h 低 7.0%；实际耗时 17h，AI 方向判断正确。',
    accuracyTrend: EFFORT_ACCURACY_TREND_ENSEMBLE,
    status: 'adopted', adoptedValue: 20, tone: 'ok',
  },
  {
    id: 'EST-03', taskId: 'TASK-2403', taskTitle: '库存扣减事务边界收敛与失败补偿回滚', taskPoints: 5,
    generatedAt: '2026-03-04 19:05', modelId: 'mdl-claude', method: 'complexity-model',
    aiEstimateHours: 27.5,
    humanEstimateHours: { optimistic: 20, mostLikely: 24, pessimistic: 34, pert: 25.0 },
    variancePct: 10.0, confidencePct: 81, confidenceBand: { low: 24.2, high: 30.8 },
    historyBasis: {
      similarTaskIds: ['TASK-2401', 'TASK-2410'],
      similarTaskAvgHours: 31.0, sampleSize: 28, r2Score: 0.79,
      featureWeights: [
        { feature: '代码规模', weight: 0.24, contribution: 6.6 },
        { feature: '接口数', weight: 0.14, contribution: 3.9 },
        { feature: 'DB 迁移', weight: 0.06, contribution: 1.7 },
        { feature: '并发要求', weight: 0.20, contribution: 5.5 },
        { feature: '依赖组件数', weight: 0.18, contribution: 5.0 },
        { feature: '历史缺陷密度', weight: 0.12, contribution: 3.3 },
        { feature: '开发者熟悉度', weight: 0.06, contribution: 1.5 },
      ],
    },
    riskFactors: [
      { factor: '跨组联调（仓储组 3 轮）', weightPct: 50, note: '依赖组件数权重 0.18、贡献 5.0h，涉及 warehouse-client 外部仓库，联调排期不受本团队控制' },
      { factor: '补偿回滚分支的测试覆盖', weightPct: 30, note: 'InventoryDeductService#rollback 是 G3 覆盖率缺口之一，需额外补测' },
      { factor: '与优惠核销共用事务边界', weightPct: 20, note: '需与 TASK-2410 的 rollbackToken 语义保持一致' },
    ],
    aiNote: '复杂度模型把「跨组联调」显式建模为依赖组件数特征，因此比人工 PERT 高 10.0%。人工估算通常低估外部团队的响应延迟；实际耗时 26h，介于两者之间，说明该特征的权重 0.18 偏高约 2 个百分点，已在下一轮回归中下调。',
    accuracyTrend: EFFORT_ACCURACY_TREND_COMPLEXITY,
    status: 'adopted', adoptedValue: 24, tone: 'info',
  },
  {
    id: 'EST-04', taskId: 'TASK-2405', taskTitle: '下单链路单元测试补齐（覆盖率目标 85%）', taskPoints: 1,
    generatedAt: '2026-03-09 22:18', modelId: 'mdl-deepseek', method: 'similar-task',
    aiEstimateHours: 8.2,
    humanEstimateHours: { optimistic: 5, mostLikely: 6, pessimistic: 10, pert: 6.5 },
    variancePct: 26.2, confidencePct: 66, confidenceBand: { low: 6.4, high: 10.0 },
    historyBasis: {
      similarTaskIds: ['TASK-2404', 'TASK-2418'],
      similarTaskAvgHours: 8.5, sampleSize: 16, r2Score: 0.68,
      featureWeights: [
        { feature: '代码规模', weight: 0.30, contribution: 2.5 },
        { feature: '接口数', weight: 0.10, contribution: 0.8 },
        { feature: 'DB 迁移', weight: 0.04, contribution: 0.3 },
        { feature: '并发要求', weight: 0.12, contribution: 1.0 },
        { feature: '依赖组件数', weight: 0.14, contribution: 1.1 },
        { feature: '历史缺陷密度', weight: 0.20, contribution: 1.6 },
        { feature: '开发者熟悉度', weight: 0.10, contribution: 0.9 },
      ],
    },
    riskFactors: [
      { factor: '85% 分支覆盖率的长尾成本', weightPct: 55, note: '覆盖率从 70% 提升到 85% 的边际成本远高于从 0 到 70%，历史缺陷密度权重被上调至 0.20' },
      { factor: '异常回滚分支难以构造测试数据', weightPct: 30, note: '需 Mock 库存中心超时（MK-02）才能触达 rollback 分支' },
      { factor: '故事点仅 1 点造成的低估惯性', weightPct: 15, note: '团队历史上对「补测类」任务平均低估 32%' },
    ],
    aiNote: '故事点只有 1 点，但相似任务法检测到「补测类」工作的系统性低估：历史缺陷密度贡献 1.6h、占总量 20%，远高于其故事点占比。AI 给出 8.2h，人工 PERT 6.5h，偏差 26.2%；团队最终按 6h 排入（status=overridden），实际耗时 9h，验证了 AI 的判断。',
    accuracyTrend: EFFORT_ACCURACY_TREND_ENSEMBLE,
    status: 'overridden', adoptedValue: 6, tone: 'warn',
  },
  {
    id: 'EST-05', taskId: 'TASK-2406', taskTitle: '统一状态机组件实现（替换 6 处 if-else）', taskPoints: 5,
    generatedAt: '2026-03-04 20:30', modelId: 'mdl-qwen', method: 'code-size',
    aiEstimateHours: 22.4,
    humanEstimateHours: { optimistic: 18, mostLikely: 24, pessimistic: 30, pert: 24.0 },
    variancePct: -6.7, confidencePct: 84, confidenceBand: { low: 20.0, high: 24.8 },
    historyBasis: {
      similarTaskIds: ['TASK-2409', 'TASK-2413'],
      similarTaskAvgHours: 28.0, sampleSize: 22, r2Score: 0.81,
      featureWeights: [
        { feature: '代码规模', weight: 0.32, contribution: 7.2 },
        { feature: '接口数', weight: 0.10, contribution: 2.2 },
        { feature: 'DB 迁移', weight: 0.04, contribution: 0.9 },
        { feature: '并发要求', weight: 0.12, contribution: 2.7 },
        { feature: '依赖组件数', weight: 0.20, contribution: 4.5 },
        { feature: '历史缺陷密度', weight: 0.12, contribution: 2.7 },
        { feature: '开发者熟悉度', weight: 0.10, contribution: 2.2 },
      ],
    },
    riskFactors: [
      { factor: '42 条流转边的规则完备性', weightPct: 45, note: '从代码库反推的 23 处状态判断需全部收敛，遗漏会产生非法流转' },
      { factor: 'Spring Statemachine 4 的持久化适配', weightPct: 35, note: '依赖组件数贡献 4.5h，含状态机实例的分布式恢复' },
      { factor: '与审计流水钩子的时序', weightPct: 20, note: 'transit 事件钩子是 TASK-2408 的前置（DEP-04）' },
    ],
    aiNote: '代码规模法基于「替换 6 处 if-else + 新增 42 条流转边配置」的静态行数预测，给出 22.4h，比人工 PERT 低 6.7%。该方法的优点是稳定、缺点是无法感知规则完备性的验证成本，因此置信度只给到 84%；实际耗时 21h，误差 4.8%。',
    accuracyTrend: EFFORT_ACCURACY_TREND_CODE_SIZE,
    status: 'adopted', adoptedValue: 24, tone: 'ok',
  },
  {
    id: 'EST-06', taskId: 'TASK-2407', taskTitle: '状态流转规则配置化与热更新', taskPoints: 5,
    generatedAt: '2026-03-12 21:05', modelId: 'mdl-gpt5', method: 'complexity-model',
    aiEstimateHours: 21.3,
    humanEstimateHours: { optimistic: 14, mostLikely: 18, pessimistic: 28, pert: 19.0 },
    variancePct: 12.1, confidencePct: 62, confidenceBand: { low: 17.6, high: 25.0 },
    historyBasis: {
      similarTaskIds: ['TASK-2406', 'TASK-2409'],
      similarTaskAvgHours: 25.5, sampleSize: 28, r2Score: 0.72,
      featureWeights: [
        { feature: '代码规模', weight: 0.22, contribution: 4.7 },
        { feature: '接口数', weight: 0.12, contribution: 2.6 },
        { feature: 'DB 迁移', weight: 0.06, contribution: 1.3 },
        { feature: '并发要求', weight: 0.16, contribution: 3.4 },
        { feature: '依赖组件数', weight: 0.18, contribution: 3.8 },
        { feature: '历史缺陷密度', weight: 0.12, contribution: 2.6 },
        { feature: '开发者熟悉度', weight: 0.14, contribution: 2.9 },
      ],
    },
    riskFactors: [
      { factor: '热更新语义未定（方案 A/B 未决）', weightPct: 50, note: 'API-05 契约仍为 reviewing、CS-2407 已 paused，方案不确定直接导致置信度降到 62%' },
      { factor: 'Nacos 配置灰度与回滚', weightPct: 30, note: '需要与 PT-03 原型的规则灰度发布交互对齐（PTR-05 阻断项待处理）' },
      { factor: '规则版本与试算强一致', weightPct: 20, note: 'RULE_VERSION_STALE 的重试语义需与 AC-07 断言一致' },
    ],
    aiNote: '该任务的方差主要来自方案未决而非技术难度：复杂度模型对「热更新语义」给出了 A（本地双 buffer）与 B（Nacos 推送）两套分支，工时差 6 小时。因此把置信度压到 62% 并把置信区间放宽到 17.6~25.0h。当前实际耗时 6h、进度 35%，与 CS-2407 paused 的状态一致。',
    accuracyTrend: EFFORT_ACCURACY_TREND_COMPLEXITY,
    status: 'adopted', adoptedValue: 20, tone: 'warn',
  },
  {
    id: 'EST-07', taskId: 'TASK-2409', taskTitle: '优惠规则引擎建模：互斥组 + 优先级 + 分摊', taskPoints: 8,
    generatedAt: '2026-03-05 20:48', modelId: 'mdl-claude', method: 'ensemble',
    aiEstimateHours: 30.6,
    humanEstimateHours: { optimistic: 26, mostLikely: 31, pessimistic: 42, pert: 32.0 },
    variancePct: -4.4, confidencePct: 87, confidenceBand: { low: 27.6, high: 33.6 },
    historyBasis: {
      similarTaskIds: ['TASK-2406', 'TASK-2410', 'TASK-2415'],
      similarTaskAvgHours: 28.3, sampleSize: 34, r2Score: 0.86,
      featureWeights: [
        { feature: '代码规模', weight: 0.28, contribution: 8.6 },
        { feature: '接口数', weight: 0.14, contribution: 4.3 },
        { feature: 'DB 迁移', weight: 0.06, contribution: 1.8 },
        { feature: '并发要求', weight: 0.18, contribution: 5.5 },
        { feature: '依赖组件数', weight: 0.14, contribution: 4.3 },
        { feature: '历史缺陷密度', weight: 0.10, contribution: 3.1 },
        { feature: '开发者熟悉度', weight: 0.10, contribution: 3.0 },
      ],
    },
    riskFactors: [
      { factor: 'Aviator 表达式引擎的性能上限', weightPct: 40, note: '2600 TPS 下规则求值需控制在 30ms 内，可能需要预编译缓存' },
      { factor: '互斥组与优先级的组合爆炸', weightPct: 35, note: '需要 AC-13 与 MK-06 提供规则样本做穷举验证' },
      { factor: '分摊策略与金额精度耦合', weightPct: 25, note: '是 TASK-2410（BUG-1043）的直接前置（DEP-05）' },
    ],
    aiNote: '集成法把历史回归（29.4h）与复杂度模型（31.8h）按 0.6/0.4 加权得到 30.6h，与人工 PERT 32.0h 仅差 4.4%，是 12 条预估中偏差最小的一条。实际耗时 29h，误差 5.5%，说明 SP-22 起累积的 34 个样本已让回归模型收敛。',
    accuracyTrend: EFFORT_ACCURACY_TREND_ENSEMBLE,
    status: 'adopted', adoptedValue: 32, tone: 'ok',
  },
  {
    id: 'EST-08', taskId: 'TASK-2410', taskTitle: '金额分摊精度修复（关联 BUG-1043）', taskPoints: 8,
    generatedAt: '2026-03-08 22:26', modelId: 'mdl-deepseek', method: 'history-regression',
    aiEstimateHours: 30.2,
    humanEstimateHours: { optimistic: 22, mostLikely: 27, pessimistic: 38, pert: 28.0 },
    variancePct: 7.9, confidencePct: 83, confidenceBand: { low: 27.0, high: 33.4 },
    historyBasis: {
      similarTaskIds: ['TASK-2409', 'TASK-2403'],
      similarTaskAvgHours: 28.8, sampleSize: 34, r2Score: 0.83,
      featureWeights: [
        { feature: '代码规模', weight: 0.24, contribution: 7.2 },
        { feature: '接口数', weight: 0.12, contribution: 3.6 },
        { feature: 'DB 迁移', weight: 0.06, contribution: 1.8 },
        { feature: '并发要求', weight: 0.16, contribution: 4.8 },
        { feature: '依赖组件数', weight: 0.14, contribution: 4.2 },
        { feature: '历史缺陷密度', weight: 0.22, contribution: 6.6 },
        { feature: '开发者熟悉度', weight: 0.06, contribution: 2.0 },
      ],
    },
    riskFactors: [
      { factor: '资损级缺陷的回归验证成本', weightPct: 50, note: '历史缺陷密度权重被上调到 0.22、贡献 6.6h，需跑完 ADS-02 的 128 组边界数据' },
      { factor: '负向分摊分支无既有测试', weightPct: 30, note: 'allocateNegative 是 G3 覆盖率缺口，需先补测再改' },
      { factor: 'MR-2410 must-fix 未合入', weightPct: 20, note: '与 TASK-2409 存在代码冲突面，需 rebase' },
    ],
    aiNote: '因为是资损级缺陷修复，模型把历史缺陷密度权重提到 0.22（团队均值 0.11），贡献 6.6h，这是 AI 比人工 PERT 高 7.9% 的全部来源。实际耗时 31h，与 AI 的 30.2h 仅差 2.6%，验证了「缺陷类任务应上调回归验证权重」这一规则。',
    accuracyTrend: EFFORT_ACCURACY_TREND_ENSEMBLE,
    status: 'adopted', adoptedValue: 28, tone: 'info',
  },
  {
    id: 'EST-09', taskId: 'TASK-2412', taskTitle: 'Redis 7 多级缓存与 binlog 失效一致性', taskPoints: 5,
    generatedAt: '2026-03-08 21:14', modelId: 'mdl-claude', method: 'complexity-model',
    aiEstimateHours: 26.1,
    humanEstimateHours: { optimistic: 18, mostLikely: 24, pessimistic: 30, pert: 24.0 },
    variancePct: 8.8, confidencePct: 79, confidenceBand: { low: 23.0, high: 29.2 },
    historyBasis: {
      similarTaskIds: ['TASK-2413', 'TASK-2414'],
      similarTaskAvgHours: 18.5, sampleSize: 28, r2Score: 0.77,
      featureWeights: [
        { feature: '代码规模', weight: 0.26, contribution: 6.8 },
        { feature: '接口数', weight: 0.10, contribution: 2.6 },
        { feature: 'DB 迁移', weight: 0.10, contribution: 2.6 },
        { feature: '并发要求', weight: 0.22, contribution: 5.7 },
        { feature: '依赖组件数', weight: 0.16, contribution: 4.2 },
        { feature: '历史缺陷密度', weight: 0.08, contribution: 2.1 },
        { feature: '开发者熟悉度', weight: 0.08, contribution: 2.1 },
      ],
    },
    riskFactors: [
      { factor: '本地缓存失效广播的时序竞态', weightPct: 45, note: '并发要求贡献 5.7h；Canal → Redis → Caffeine 三级失效需保证 3 秒内收敛，否则复现 BUG-1048' },
      { factor: '分片路由变更后的缓存 Key 重算', weightPct: 35, note: '依赖 DEP-08（TASK-2413 完成后 lag 1 天），Key 规则需与基因分片对齐' },
      { factor: '命中率 ≥ 92% 的验收门槛', weightPct: 20, note: '需要 PT-04 性能看板提供的基线数据做压测验证' },
    ],
    aiNote: '复杂度模型识别出该任务与 GANTT-CF-03 的资源冲突（03-16~03-17 与 TASK-2415 重叠），因此把并发要求权重提到 0.22 以覆盖被挤占的验证时间。AI 给出 26.1h、人工 PERT 24.0h，偏差 8.8%；实际耗时 27h，AI 更接近真实值。',
    accuracyTrend: EFFORT_ACCURACY_TREND_COMPLEXITY,
    status: 'adopted', adoptedValue: 24, tone: 'info',
  },
  {
    id: 'EST-10', taskId: 'TASK-2413', taskTitle: '订单号基因分片与分库分表路由改造', taskPoints: 5,
    generatedAt: '2026-03-03 20:02', modelId: 'mdl-qwen', method: 'code-size',
    aiEstimateHours: 24.8,
    humanEstimateHours: { optimistic: 20, mostLikely: 25, pessimistic: 36, pert: 26.0 },
    variancePct: -4.6, confidencePct: 85, confidenceBand: { low: 22.2, high: 27.4 },
    historyBasis: {
      similarTaskIds: ['TASK-2412', 'TASK-2419'],
      similarTaskAvgHours: 26.5, sampleSize: 22, r2Score: 0.82,
      featureWeights: [
        { feature: '代码规模', weight: 0.28, contribution: 6.9 },
        { feature: '接口数', weight: 0.08, contribution: 2.0 },
        { feature: 'DB 迁移', weight: 0.22, contribution: 5.5 },
        { feature: '并发要求', weight: 0.14, contribution: 3.5 },
        { feature: '依赖组件数', weight: 0.12, contribution: 3.0 },
        { feature: '历史缺陷密度', weight: 0.08, contribution: 2.0 },
        { feature: '开发者熟悉度', weight: 0.08, contribution: 1.9 },
      ],
    },
    riskFactors: [
      { factor: 'ShardingSphere 5 路由规则与基因分片的一致性', weightPct: 50, note: 'DB 迁移权重 0.22、贡献 5.5h，需重写 order-sharding.yaml 并验证 8 个分片' },
      { factor: '订单号生成器的时钟回拨', weightPct: 30, note: 'OrderIdGenerator 需处理 NTP 回拨场景' },
      { factor: '下游 DEP-08 / DEP-14 的连锁影响', weightPct: 20, note: '本任务是 TASK-2412 与 TASK-2419 的共同前置，位于关键路径' },
    ],
    aiNote: '代码规模法对该任务特别适用：改造范围明确（2 个类 + 1 份配置），静态行数预测的置信度高。AI 给出 24.8h、人工 PERT 26.0h，偏差仅 4.6%；实际耗时 24h，误差 3.3%，是 code-size 方法在 SP-24 的最佳表现。',
    accuracyTrend: EFFORT_ACCURACY_TREND_CODE_SIZE,
    status: 'adopted', adoptedValue: 26, tone: 'ok',
  },
  {
    id: 'EST-11', taskId: 'TASK-2415', taskTitle: '拆单引擎规则实现（商家/仓库/类目/重量）', taskPoints: 8,
    generatedAt: '2026-03-15 21:36', modelId: 'mdl-claude', method: 'ensemble',
    aiEstimateHours: 35.4,
    humanEstimateHours: { optimistic: 26, mostLikely: 32, pessimistic: 44, pert: 33.0 },
    variancePct: 7.3, confidencePct: 71, confidenceBand: { low: 30.8, high: 40.0 },
    historyBasis: {
      similarTaskIds: ['TASK-2409', 'TASK-2406', 'TASK-2416'],
      similarTaskAvgHours: 25.3, sampleSize: 34, r2Score: 0.75,
      featureWeights: [
        { feature: '代码规模', weight: 0.26, contribution: 9.2 },
        { feature: '接口数', weight: 0.14, contribution: 5.0 },
        { feature: 'DB 迁移', weight: 0.08, contribution: 2.8 },
        { feature: '并发要求', weight: 0.16, contribution: 5.7 },
        { feature: '依赖组件数', weight: 0.18, contribution: 6.4 },
        { feature: '历史缺陷密度', weight: 0.10, contribution: 3.5 },
        { feature: '开发者熟悉度', weight: 0.08, contribution: 2.8 },
      ],
    },
    riskFactors: [
      { factor: 'WMS 履约回调协议未冻结', weightPct: 45, note: 'API-10 仍为 v0.9 草稿、错误码含 WMS_PROTOCOL_UNFROZEN，协议变更会造成返工' },
      { factor: '四维规则的组合验证成本', weightPct: 35, note: '依赖组件数贡献 6.4h，需与 ac-promo-engine 的 exclusiveGroup 对齐（PTR-11）' },
      { factor: 'GANTT-CF-03 资源冲突导致的有效工时折损', weightPct: 20, note: '03-16~03-17 与 TASK-2412 重叠，日负载 13.5h，实际有效产出约 65%' },
    ],
    aiNote: 'AI 比人工 PERT 高 7.3%，增量主要来自两处：WMS 协议未冻结带来的返工预留（风险权重 45%）与资源冲突造成的有效工时折损。当前实际耗时 9h、进度 28%，与 SCH-01 采纳后的顺延计划一致；该建议尚未被团队采纳（团队仍按 32h 排期），故 status 为 suggested。',
    accuracyTrend: EFFORT_ACCURACY_TREND_ENSEMBLE,
    status: 'suggested', adoptedValue: null, tone: 'ai',
  },
  {
    id: 'EST-12', taskId: 'TASK-2419', taskTitle: '历史订单全量迁移作业（断点续传）', taskPoints: 8,
    generatedAt: '2026-03-10 22:44', modelId: 'mdl-gpt5', method: 'complexity-model',
    aiEstimateHours: 40.6,
    humanEstimateHours: { optimistic: 28, mostLikely: 35, pessimistic: 54, pert: 37.0 },
    variancePct: 9.7, confidencePct: 58, confidenceBand: { low: 33.0, high: 48.2 },
    historyBasis: {
      similarTaskIds: ['TASK-2413', 'TASK-2420'],
      similarTaskAvgHours: 25.0, sampleSize: 19, r2Score: 0.66,
      featureWeights: [
        { feature: '代码规模', weight: 0.24, contribution: 9.7 },
        { feature: '接口数', weight: 0.08, contribution: 3.2 },
        { feature: 'DB 迁移', weight: 0.30, contribution: 12.2 },
        { feature: '并发要求', weight: 0.12, contribution: 4.9 },
        { feature: '依赖组件数', weight: 0.10, contribution: 4.1 },
        { feature: '历史缺陷密度', weight: 0.10, contribution: 4.1 },
        { feature: '开发者熟悉度', weight: 0.06, contribution: 2.4 },
      ],
    },
    riskFactors: [
      { factor: 'BLOCK-0312 迁移窗口未批复', weightPct: 55, note: '外部审批不在团队控制范围内，是置信度只有 58% 的主因；窗口不确定会让等待时间远超编码时间' },
      { factor: '4.7 亿行数据的比对耗时', weightPct: 30, note: 'DB 迁移权重 0.30、贡献 12.2h，全量 + 增量比对预计 11.5 小时机器时间' },
      { factor: '差异率必须为 0 的验收门槛', weightPct: 15, note: 'DEP-17 要求双写差异率为 0 才允许 TASK-2421 生产切流' },
    ],
    aiNote: '这是 12 条预估中置信度最低的一条（58%）：DB 迁移贡献 12.2h 可以较准确预测，但 BLOCK-0312 导致的窗口等待属于外生变量，模型只能给出 33.0~48.2h 的宽区间。SCH-03 建议按用户 ID 分 4 批执行，若采纳可把该外生变量的影响压低约 40%，届时置信度有望回到 75% 以上。',
    accuracyTrend: EFFORT_ACCURACY_TREND_COMPLEXITY,
    status: 'suggested', adoptedValue: null, tone: 'ai',
  },
];

/* -------------------------------------------------------------------------- */
/*  AI 任务拆解建议（需求 → 子任务 / 大任务 → 可并行子任务）                    */
/* -------------------------------------------------------------------------- */

/**
 * AI 建议拆解出的单个子任务。
 *
 * `order` 既是展示顺序，也是 `dependsOnOrder` / `criticalPathOrders` /
 * `acceptedOrders` / `rejectedOrders` 的引用键，从 1 开始连续编号。
 */
export interface BreakdownTaskDef {
  /** 子任务序号（从 1 开始，同一建议内唯一） */
  order: number;
  /** 子任务标题，AI 生成后可直接落入 PingCode 工作项 */
  title: string;
  /** 建议故事点，取斐波那契刻度（1 / 2 / 3 / 5 / 8） */
  points: number;
  /** 建议承接人（引用 USERS.id）；null 表示建议交由 AI 智能体全自动执行 */
  assigneeSuggestionId: string | null;
  /** 所需技能标签，口径与 USERS.skills 一致 */
  skillRequirement: string[];
  /** 前置子任务 order 列表，为空表示可立即启动 */
  dependsOnOrder: number[];
  /** AI 拆出该子任务的理由（关联真实组件 / 契约 / 缺陷 / 阻塞项） */
  rationale: string;
  /** 可独立验收的标准，逐条可测 */
  acceptanceCriteria: string[];
  /** 风险等级 */
  riskLevel: '低' | '中' | '高';
  /** AI 对该拆解项的置信度（%） */
  aiConfidencePct: number;
}

/** AI 拆解结果与人工既有计划的对比结论 */
export interface BreakdownComparisonDef {
  /** 人工计划中承接同一来源的任务数（引用 TASKS） */
  humanTaskCount: number;
  /** 人工计划的故事点合计；来源为需求时等于 REQUIREMENTS.storyPoints */
  humanTotalPoints: number;
  /** AI 拆解点数 − 人工点数合计；正值表示 AI 认为人工计划低估了工作量 */
  aiDeltaPoints: number;
  /** AI 子任务与人工任务的范围重合度（%），越高说明两者对边界的判断越一致 */
  overlapPct: number;
}

/** 被人工否决的子任务及否决理由 */
export interface BreakdownRejectionDef {
  /** 被否决的子任务 order */
  order: number;
  /** 否决理由，需说明「为什么不拆」而非简单标注不同意 */
  reason: string;
}

/** AI 任务拆解建议：把一条需求或一个过大任务拆成可并行、可独立验收的子任务 */
export interface AiBreakdownSuggestionDef {
  /** 拆解建议 id，前缀 BRK- */
  id: string;
  /** 拆解来源类型：requirement = 需求拆解，task = 大任务再拆 */
  sourceType: 'requirement' | 'task';
  /** 来源 id（REQUIREMENTS.id 或 TASKS.id） */
  sourceId: string;
  /** 来源标题，与 data.ts 中原文一致 */
  sourceTitle: string;
  /** 来源故事点（需求取 storyPoints，任务取 points） */
  sourcePoints: number;
  /** 生成时间 */
  generatedAt: string;
  /** 生成模型（引用 MODELS.id） */
  modelId: string;
  /** 生成智能体（引用 AGENTS.id，拆解统一由架构智能体负责） */
  agentId: string;
  /** 拆解策略 */
  strategy: '按限界上下文' | '按接口契约' | '按数据流' | '按风险隔离' | '按可独立验收';
  /** 策略选择依据 */
  strategyReason: string;
  /** AI 建议的子任务列表 */
  suggestedTasks: BreakdownTaskDef[];
  /** 子任务点数合计 = Σ suggestedTasks[].points */
  totalPoints: number;
  /** 建议并行度（可同时开工的子任务数，受人力与依赖共同约束） */
  parallelismDegree: number;
  /** 关键路径上的子任务 order 序列（最长依赖链） */
  criticalPathOrders: number[];
  /** 关键路径点数合计 = Σ 关键路径上子任务的 points */
  criticalPathPoints: number;
  /** 拆解后预计可压缩的交付天数（相对人工串行计划） */
  estimatedLeadTimeSavedDays: number;
  /** 与人工计划的对比 */
  comparedWithHumanPlan: BreakdownComparisonDef;
  /** 采纳状态 */
  status: 'pending' | 'accepted' | 'partial' | 'rejected';
  /** 已采纳的子任务 order；rejected 时为空数组 */
  acceptedOrders: number[];
  /** 被否决的子任务及理由；accepted 时为空数组 */
  rejectedOrders: BreakdownRejectionDef[];
  /** 决策人（引用 USERS.id）；pending 时为 null */
  decidedBy: string | null;
  /** 决策时间；pending 时为空串 */
  decidedAt: string;
  /** 决策备注：说明采纳后如何落回 PingCode 与甘特图 */
  decisionNote: string;
  /** 语义色 */
  tone: Tone;
}

/**
 * AI 任务拆解建议（6 条）。
 *
 * 覆盖两种来源：4 条来自需求（REQ-2405 / REQ-2408 / REQ-2402 / REQ-2404），
 * 2 条来自过大或过小的任务再拆（TASK-2419 8 点过大、TASK-2405 1 点过细）。
 * 采纳分布为 2 accepted（BRK-01 / BRK-03）、2 partial（BRK-02 / BRK-05）、
 * 1 rejected（BRK-04）、1 pending（BRK-06）。
 *
 * 自洽性口径：`totalPoints = Σ suggestedTasks[].points`；
 * `aiDeltaPoints = totalPoints − humanTotalPoints`；来源为需求时
 * `humanTotalPoints` 等于该需求下所有人工任务的点数合计，也等于
 * `REQUIREMENTS.storyPoints`（REQ-2405 = 8+5 = 13、REQ-2408 = 2+2+1 = 5、
 * REQ-2402 = 5+5+3 = 13、REQ-2404 = 5+5+3 = 13）。
 */
export const AI_BREAKDOWN_SUGGESTIONS: AiBreakdownSuggestionDef[] = [
  {
    id: 'BRK-01', sourceType: 'requirement', sourceId: 'REQ-2405',
    sourceTitle: '多仓多商家拆单与合单能力', sourcePoints: 13,
    generatedAt: '2026-03-11 09:26', modelId: 'mdl-claude', agentId: 'ag-arch',
    strategy: '按限界上下文',
    strategyReason:
      'REQ-2405 横跨拆单规则（ac-split-engine）、订单聚合根（ac-order-domain）与前端聚合视图三个上下文，' +
      '人工计划把它压成 TASK-2415（服务端）+ TASK-2416（前端）两个大块，导致 GANTT-CF-03 中「TASK-2416 需 5 天但只剩 2 天」。' +
      '按限界上下文拆分可把逆向单据流与对账监控从主引擎中剥离，让规则引擎单独走关键路径。',
    suggestedTasks: [
      {
        order: 1, title: '拆单上下文防腐层与聚合根边界定义', points: 2,
        assigneeSuggestionId: 'u-yan', skillRequirement: ['DDD', '架构治理'],
        dependsOnOrder: [],
        rationale:
          'GANTT-CF-03 的处置建议之一是「提前在 03-19 锁定聚合根边界」；父单/子单的一致性边界若不先定义，' +
          'TASK-2415 与 TASK-2416 会各自实现一套聚合逻辑，前端聚合视图返工概率高。',
        acceptanceCriteria: [
          '产出 ac-split-engine 与 ac-order-domain 的上下文映射图（含防腐层接口清单）',
          '父单金额 = Σ 子单金额 的不变式写入领域约束并通过单测',
          '边界文档经 u-yan 评审通过并归档至 KB-ARCH-01',
        ],
        riskLevel: '低', aiConfidencePct: 88,
      },
      {
        order: 2, title: '拆单规则引擎实现（商家 / 仓库 / 类目 / 重量四维）', points: 5,
        assigneeSuggestionId: 'u-zhou', skillRequirement: ['Java 17', 'Spring Boot 3.3'],
        dependsOnOrder: [1],
        rationale:
          '对应 TASK-2415 主体，但剥离了逆向与对账职责后范围更清晰；四维规则可按优先级链式求值，' +
          '与 ac-promo-engine 的互斥组模型同构，可复用规则求值骨架。',
        acceptanceCriteria: [
          '同一订单在「多商家 + 跨仓」场景下拆分结果稳定且可重放',
          '重量超限拆分后每个子单重量 ≤ 承运商上限，超限率 0',
          '规则命中链路可在响应体中解释（splitReason 字段非空）',
          'AC-06 优惠分摊在拆单后金额无尾差（对齐 BUG-1043 的修复口径）',
        ],
        riskLevel: '中', aiConfidencePct: 84,
      },
      {
        order: 3, title: '子订单独立退款与逆向单据流', points: 3,
        assigneeSuggestionId: 'u-shen', skillRequirement: ['Java 17', 'RabbitMQ'],
        dependsOnOrder: [2],
        rationale:
          '对应故事 US「子订单独立退款」（REQ-2405 拆解项，5 点）。逆向流的状态流转必须走 ac-state-machine，' +
          '与正向拆单逻辑耦合度低，适合独立验收；放在 TASK-2415 内会拖长关键路径。',
        acceptanceCriteria: [
          '单个子订单退款不影响同父单其他子订单的状态',
          '部分退款金额分摊与优惠回收规则通过 12 组边界用例',
          '逆向事件按 CloudEvents 1.0 信封外发（对齐 TASK-2417 口径）',
        ],
        riskLevel: '中', aiConfidencePct: 79,
      },
      {
        order: 4, title: '父/子订单聚合查询接口与前端聚合视图', points: 5,
        assigneeSuggestionId: 'u-chen', skillRequirement: ['Vue 3', 'TypeScript 5', 'Pinia'],
        dependsOnOrder: [2],
        rationale:
          '对应 TASK-2416。GANTT-CF-03 指出前端只剩 2 天窗口，若等到服务端全部完成再启动必然顺延 SP-25；' +
          '拆出后可在 order 1 冻结接口契约的同时用 Mock（MK-01 库存中心桩）并行开工，与 order 3 形成 2 路并行。',
        acceptanceCriteria: [
          '聚合视图首屏在 100 个子单场景下渲染 ≤ 800ms',
          '父单展开/折叠状态与筛选条件可被 URL 参数还原',
          '在 PT-02（AxHub 项目 AXH-PRJ-2404）产出的父/子订单聚合视图原型页上完成批注闭环',
        ],
        riskLevel: '中', aiConfidencePct: 76,
      },
      {
        order: 5, title: '拆单结果对账与埋点监控', points: 1,
        assigneeSuggestionId: null, skillRequirement: ['Prometheus', 'SkyWalking'],
        dependsOnOrder: [2],
        rationale:
          '拆单错误直接导致资损，需要独立的对账指标；工作量小且可由 AI 智能体按既有埋点模板全自动生成，' +
          '不必占用 u-meng 的排期（其 capacity 已被 REL-2403 发布单占满）。',
        acceptanceCriteria: [
          '拆单成功率、平均拆分因子、金额守恒偏差三项指标上报 Prometheus',
          '金额守恒偏差 > 0 时触发资损级广播（对齐 u-he 的告警订阅范围）',
        ],
        riskLevel: '低', aiConfidencePct: 91,
      },
    ],
    totalPoints: 16,
    parallelismDegree: 2, criticalPathOrders: [1, 2, 4], criticalPathPoints: 12,
    estimatedLeadTimeSavedDays: 3,
    comparedWithHumanPlan: { humanTaskCount: 2, humanTotalPoints: 13, aiDeltaPoints: 3, overlapPct: 78 },
    status: 'accepted', acceptedOrders: [1, 2, 3, 4, 5], rejectedOrders: [],
    decidedBy: 'u-lin', decidedAt: '2026-03-12 10:15',
    decisionNote:
      '全部采纳并回写 PingCode：REQ-2405 下由 2 个工作项扩为 5 个，TASK-2415 收敛为 order 2（5 点）、' +
      'TASK-2416 收敛为 order 4（5 点），order 1/3/5 新建。多出的 3 点来自逆向单据流与对账监控——' +
      '这两项原本隐含在 TASK-2415 的 8 点估算里但未显式验收，AI 拆解把它们暴露出来了。' +
      '与 SCH-01（TASK-2415 延后）配套执行，甘特图冲突 GANTT-CF-03 已消解。',
    tone: 'ai',
  },
  {
    id: 'BRK-02', sourceType: 'requirement', sourceId: 'REQ-2408',
    sourceTitle: '订单数据合规：字段脱敏与操作审计留痕', sourcePoints: 5,
    generatedAt: '2026-03-13 15:42', modelId: 'mdl-gpt5', agentId: 'ag-arch',
    strategy: '按风险隔离',
    strategyReason:
      'REQ-2408 是合规需求，落库加密、展示脱敏、审计留痕三者的失败模式与责任方完全不同（DBA / 前端 / 安全合规部）。' +
      '按风险隔离拆分可让「不可逆的密文落库」与「可回滚的展示层脱敏」分别走独立发布批次，避免一次发布同时触发两类风险。',
    suggestedTasks: [
      {
        order: 1, title: 'PII 字段盘点与脱敏规则映射（rd-01 ~ rd-08）', points: 1,
        assigneeSuggestionId: 'u-su', skillRequirement: ['交易域', 'PRD 撰写'],
        dependsOnOrder: [],
        rationale:
          'BUG-1054 的根因是导出链路漏挂脱敏规则，本质是「哪些字段属于哪条规则」没有权威清单。' +
          '先产出字段-规则映射表，后续三个实现子任务才有共同基线，也便于安全合规部一次性签字。',
        acceptanceCriteria: [
          '订单域 PII 字段清单覆盖率 100%，每字段标注 rd-01 ~ rd-08 中的一条规则',
          '清单经安全合规部（SEC-2026-08）书面确认',
          '导出与查询两条链路的字段集合差异被显式列出',
        ],
        riskLevel: '低', aiConfidencePct: 90,
      },
      {
        order: 2, title: '敏感字段 SM4 落库加密与 KMS 密钥托管接入', points: 2,
        assigneeSuggestionId: 'u-shen', skillRequirement: ['Java 17', 'SM4', 'KMS'],
        dependsOnOrder: [1],
        rationale:
          '对应 TASK-2422（ac-mask-sdk，SEC-MASK-2.1 注解驱动）。密文落库不可逆，必须独立发布批次并预留回滚脚本，' +
          '与展示层改动混在一个 MR 里会让回滚粒度过粗。',
        acceptanceCriteria: [
          '收件人手机号 / 地址 / 身份证三类字段落库为 SM4 密文，密钥不落代码库',
          'SEC-MASK-2.1 注解在 ac-order-api 全量生效，静态扫描无遗漏字段',
          '存量明文数据的加密回填脚本在 env-test 演练通过且可断点续跑',
        ],
        riskLevel: '高', aiConfidencePct: 82,
      },
      {
        order: 3, title: '展示层脱敏与导出二次授权', points: 2,
        assigneeSuggestionId: 'u-chen', skillRequirement: ['Vue 3', 'TypeScript 5'],
        dependsOnOrder: [1],
        rationale:
          '对应 BUG-1054（导出 CSV 中 addressDetail 字段脱敏漏网、明文输出收货地址，归属 TASK-2423）' +
          '与 BUG-1052（订单导出接口未触发二次授权，其审计留痕部分归属 TASK-2424）的前端修复面；' +
          'AI 认为展示脱敏与导出授权应合并为一个可独立验收的工作项。',
        acceptanceCriteria: [
          '列表与详情页手机号、收货地址按 rd-01 / rd-03 规则掩码展示，身份证号按 rd-02 掩码',
          'API-13 导出接口在无二次授权令牌时返回 403 且不产生文件',
          'AC-14 与 AC-15 两条接口用例转绿',
        ],
        riskLevel: '中', aiConfidencePct: 74,
      },
      {
        order: 4, title: '查询/导出行为审计留痕与越权告警', points: 2,
        assigneeSuggestionId: 'u-meng', skillRequirement: ['Prometheus', 'SkyWalking', 'Elasticsearch'],
        dependsOnOrder: [2],
        rationale:
          '对应 TASK-2424（ac-audit-store，st-observe 环节）。审计流水依赖 order 2 的字段密文化结果' +
          '（审计记录里只能存密文与操作者，不能存明文），因此必须后置；越权告警可直接消费 AC-10 的断言口径。',
        acceptanceCriteria: [
          '所有查询与导出操作写入 order_state_log 同源审计表，保留期 ≥ 180 天',
          '越权访问尝试在 60s 内产生告警并推送至 u-he 的订阅范围',
          'G6 合规观测项由不通过转为通过',
        ],
        riskLevel: '中', aiConfidencePct: 80,
      },
    ],
    totalPoints: 7,
    parallelismDegree: 2, criticalPathOrders: [1, 2, 4], criticalPathPoints: 5,
    estimatedLeadTimeSavedDays: 1,
    comparedWithHumanPlan: { humanTaskCount: 3, humanTotalPoints: 5, aiDeltaPoints: 2, overlapPct: 82 },
    status: 'partial', acceptedOrders: [1, 2, 4],
    rejectedOrders: [
      {
        order: 3,
        reason:
          '展示层脱敏与导出二次授权已由人工计划中的 TASK-2423「展示脱敏与导出二次授权」覆盖，范围完全重合，' +
          '再拆会形成重复工作项。采纳其验收标准（AC-14 / AC-15 转绿）并入 TASK-2423，不新建子任务。',
      },
    ],
    decidedBy: 'u-gu', decidedAt: '2026-03-14 11:08',
    decisionNote:
      '采纳 order 1 / 2 / 4：order 1 新建为 REQ-2408 的前置工作项（1 点，u-su，03-19 前完成），' +
      'order 2 与 order 4 分别对齐既有 TASK-2422 与 TASK-2424，仅补充依赖关系（order 4 必须在 order 2 之后）。' +
      'order 3 与 TASK-2423 重复，予以否决。AI 多出的 2 点主要来自 order 1 的 PII 盘点——' +
      '人工计划默认「字段清单已存在」，但 BUG-1054 证明该前提不成立。',
    tone: 'ai',
  },
  {
    id: 'BRK-03', sourceType: 'task', sourceId: 'TASK-2419',
    sourceTitle: '历史订单全量迁移作业（断点续传）', sourcePoints: 8,
    generatedAt: '2026-03-16 08:05', modelId: 'mdl-deepseek', agentId: 'ag-arch',
    strategy: '按数据流',
    strategyReason:
      'TASK-2419 已被 BLOCK-0312 阻塞 7 天（SLA 4 天），且 DEP-17 直接卡住 TASK-2421 生产切流。' +
      '按数据流（切片 → 搬运 → 校验 → 放行）拆分后，切片与校验可在预生产先行完成，' +
      '只把「放行」这一小段留在生产窗口内，从而把对 DBA 窗口的依赖从 11.5 小时压缩到 2 小时以内。',
    suggestedTasks: [
      {
        order: 1, title: '按用户 ID 哈希分片切分与批次编排（4 批 ≤ 1.2 亿/批）', points: 3,
        assigneeSuggestionId: 'u-zhou', skillRequirement: ['MySQL 8', '分库分表'],
        dependsOnOrder: [],
        rationale:
          '与 SCH-03 的方案二一致：DBA 只批复短窗口，长窗口不批。4.7 亿行按用户 ID 哈希切成 4 批，' +
          '每批 ≤ 1.2 亿行、单次窗口 ≤ 2 小时，可显著提升窗口审批通过率。切分逻辑可完全在 env-dev 验证。',
        acceptanceCriteria: [
          '4 个批次的行数之和 = 4.7 亿（源表 count 校验一致）',
          '批次间用户 ID 无交叉，同一用户的全部订单落在同一批',
          '批次清单与预计窗口时长写入 REL-2403 发布单备注',
        ],
        riskLevel: '中', aiConfidencePct: 86,
      },
      {
        order: 2, title: '断点续传与批次级幂等重放', points: 3,
        assigneeSuggestionId: 'u-shen', skillRequirement: ['Java 17', 'MySQL 8'],
        dependsOnOrder: [1],
        rationale:
          '对应 ac-migrate-job 的 checkpoint 能力。原任务标题已含「断点续传」，但未定义重放语义；' +
          '拆出后明确要求批次级幂等（重放不产生重复行），这是小批次多次窗口方案能成立的前提。',
        acceptanceCriteria: [
          'checkpoint 表记录每批的最后主键与行数，进程被 kill 后可从断点恢复',
          '同一批次重放 3 次，目标表行数与校验和保持不变',
          'CS-2419 中已跑通的 3 轮预生产演练结果可复现（累计 1.2 亿条、差异 0）',
        ],
        riskLevel: '中', aiConfidencePct: 83,
      },
      {
        order: 3, title: '全量 + 增量双写比对与差异率归零校验', points: 2,
        assigneeSuggestionId: null, skillRequirement: ['MySQL 8', '数据比对'],
        dependsOnOrder: [2],
        rationale:
          '与 TASK-2420 的范围相邻但不重合：TASK-2420 管双写开关，本子任务管迁移后的一次性全量比对。' +
          'DEP-17（TASK-2420 → TASK-2421）要求差异率为 0 才允许切流，该判据必须是独立可验收的工作项。',
        acceptanceCriteria: [
          '4.7 亿行全量比对差异率 = 0（不是「小于阈值」）',
          '增量比对覆盖迁移期间的新写入，滞后窗口 ≤ 5 分钟',
          '比对报告归档并作为 G5 前置任务校验的通过证据',
        ],
        riskLevel: '高', aiConfidencePct: 77,
      },
      {
        order: 4, title: '迁移窗口小批次化与灰度放行', points: 2,
        assigneeSuggestionId: 'u-meng', skillRequirement: ['Kubernetes', 'GitLab CI'],
        dependsOnOrder: [1],
        rationale:
          '把 BLOCK-0312 的解法固化成可执行动作：不再申请一个 11.5 小时的长窗口，' +
          '而是申请 4 个 2 小时的短窗口，并把放行脚本纳入 GitLab CI 的手动审批阶段。' +
          '与 order 2、order 3 可并行推进，因此不占关键路径。',
        acceptanceCriteria: [
          'DBA 批复至少 2 个短窗口（BLOCK-0312 可降级为部分解除）',
          '放行脚本在 env-staging 演练 2 次，单次耗时 ≤ 2 小时且可中断回滚',
          '一键回切脚本 RTO ≤ 6.5 分钟（沿用 REL-2403 既有演练结论）',
        ],
        riskLevel: '高', aiConfidencePct: 71,
      },
    ],
    totalPoints: 10,
    parallelismDegree: 2, criticalPathOrders: [1, 2, 3], criticalPathPoints: 8,
    estimatedLeadTimeSavedDays: 5,
    comparedWithHumanPlan: { humanTaskCount: 1, humanTotalPoints: 8, aiDeltaPoints: 2, overlapPct: 91 },
    status: 'accepted', acceptedOrders: [1, 2, 3, 4], rejectedOrders: [],
    decidedBy: 'u-lin', decidedAt: '2026-03-16 17:30',
    decisionNote:
      '全部采纳。TASK-2419 拆为 4 个子工作项后仍保留原 id 作为父项（PingCode 父子关系），' +
      '关键路径 8 点与原任务 8 点持平，多出的 2 点落在 order 4——这部分工作原先没有被计入任何任务，' +
      '却正是 BLOCK-0312 拖了 7 天的真正原因。order 3 交由 AI 智能体执行（会话强制路由 mdl-local，' +
      '因涉及 4.7 亿条真实订单数据不出域，与 CS-2419 的隐私约束一致）。EST-12 的置信度可随 order 4 落地回升。',
    tone: 'ai',
  },
  {
    id: 'BRK-04', sourceType: 'task', sourceId: 'TASK-2405',
    sourceTitle: '下单链路单元测试补齐（覆盖率目标 85%）', sourcePoints: 1,
    generatedAt: '2026-03-17 09:14', modelId: 'mdl-qwen', agentId: 'ag-arch',
    strategy: '按可独立验收',
    strategyReason:
      'G3 门禁当前覆盖率 71.4%（阈值 85%），PIPE-2407 的风险项写明「G3 需 24 小时内补到 85%」。' +
      'AI 判断按被测模块（下单 / 库存回滚 / 消息投递）拆分后，三人可同时补测，理论上最快收敛。',
    suggestedTasks: [
      {
        order: 1, title: '幂等下单主链路单测补齐（ac-idem-guard）', points: 1,
        assigneeSuggestionId: 'u-zhou', skillRequirement: ['Java 17', 'Spring Boot 3.3'],
        dependsOnOrder: [],
        rationale: 'Idempotency-Key 两级校验的分支最多，是覆盖率缺口的主要来源。',
        acceptanceCriteria: [
          'ac-idem-guard 行覆盖率 ≥ 90%',
          '重复键、过期键、并发键三类场景均有断言',
        ],
        riskLevel: '低', aiConfidencePct: 68,
      },
      {
        order: 2, title: '库存扣减失败补偿回滚单测补齐', points: 1,
        assigneeSuggestionId: 'u-shen', skillRequirement: ['Java 17'],
        dependsOnOrder: [],
        rationale: '对应 TASK-2403，事务边界收敛后的补偿分支需要显式覆盖。',
        acceptanceCriteria: [
          '库存不足、超时、部分成功三类补偿路径均被覆盖',
          '补偿幂等性有独立断言（重复补偿不产生副作用）',
        ],
        riskLevel: '低', aiConfidencePct: 66,
      },
      {
        order: 3, title: '本地消息表投递与重试单测补齐（ac-outbox-relay）', points: 1,
        assigneeSuggestionId: null, skillRequirement: ['RabbitMQ', '测试设计'],
        dependsOnOrder: [1, 2],
        rationale: '指数退避重试的时间推进需要可控时钟，放在最后统一处理测试基建。',
        acceptanceCriteria: [
          '退避序列（1s / 2s / 4s / 8s / 16s）逐级断言',
          '死信进入条件与告警联动被覆盖',
        ],
        riskLevel: '低', aiConfidencePct: 62,
      },
    ],
    totalPoints: 3,
    parallelismDegree: 2, criticalPathOrders: [1, 3], criticalPathPoints: 2,
    estimatedLeadTimeSavedDays: 1,
    comparedWithHumanPlan: { humanTaskCount: 1, humanTotalPoints: 1, aiDeltaPoints: 2, overlapPct: 96 },
    status: 'rejected', acceptedOrders: [],
    rejectedOrders: [
      {
        order: 1,
        reason:
          'TASK-2405 的 aiRatio 已达 97%，由 ag-test 全自动生成用例，不存在「三人同时补测」的前提；' +
          '拆成 3 个工作项只会让 G3 的覆盖率归集口径从 1 个变成 3 个，门禁读数为 0 的概率反而上升。',
      },
      {
        order: 2,
        reason:
          '库存补偿分支的用例已由 AC-04（库存不足异常）与 CS-2403 的会话产物覆盖，' +
          '再建独立工作项与 TASK-2403 的验收范围重复，属于无增量拆解。',
      },
      {
        order: 3,
        reason:
          '该子任务被设为依赖 order 1 与 order 2，实际上退避重试测试只需可控时钟，与另两项无真实依赖；' +
          'AI 在此处引入了伪依赖，导致所谓「并行度 2」并不成立，关键路径判断不可信。',
      },
    ],
    decidedBy: 'u-he', decidedAt: '2026-03-17 14:22',
    decisionNote:
      '整条建议否决。1 点且 aiRatio 97% 的任务，管理成本高于拆解收益：拆出 3 个工作项需要 3 次 PingCode 同步、' +
      '3 条 CI 归集与 3 次验收，而 ag-test 一次会话即可把覆盖率从 71.4% 推到 85%。' +
      '该否决结果已回写拆解模型作为负样本，用于抑制「小任务过度拆分」倾向。' +
      'G3 的实际处置走 PIPE-2407 的既有动作项，不改变 TASK-2405 的粒度。',
    tone: 'neutral',
  },
  {
    id: 'BRK-05', sourceType: 'requirement', sourceId: 'REQ-2402',
    sourceTitle: '订单状态机统一治理：可配置流转与状态变更审计', sourcePoints: 13,
    generatedAt: '2026-03-09 20:31', modelId: 'mdl-claude', agentId: 'ag-arch',
    strategy: '按接口契约',
    strategyReason:
      'REQ-2402 的验收标准 AC1 直接绑定错误码 ORDER_STATE_ILLEGAL，而 API-05（POST /api/v2/orders/{orderNo}/state-transitions）' +
      '当前处于 reviewing 状态、未冻结。按接口契约拆分可以让「契约冻结」成为显式的第一子任务，' +
      '避免 TASK-2406 / TASK-2407 / TASK-2408 三个任务在契约未定时并行返工。',
    suggestedTasks: [
      {
        order: 1, title: 'API-05 状态流转契约冻结与错误码规范', points: 2,
        assigneeSuggestionId: 'u-yan', skillRequirement: ['DDD', 'Spring Boot 3'],
        dependsOnOrder: [],
        rationale:
          'API-05 status 为 reviewing、ownerId u-zhou、reviewerId u-yan，尚未 frozenAt。' +
          'AC-07（非法流转拦截）与 AC-08（状态流转 P95）两条用例的断言都依赖该契约的稳定错误码，' +
          '契约不冻结则测试断言随时失效。',
        acceptanceCriteria: [
          'API-05 状态由 reviewing 转为 frozen，frozenAt 非空',
          'ORDER_STATE_ILLEGAL 错误码及全部子码写入契约并附可解释文案',
          'AC-07 / AC-08 的断言按冻结后的契约重跑通过',
        ],
        riskLevel: '中', aiConfidencePct: 85,
      },
      {
        order: 2, title: '统一状态机组件实现（替换 6 处 if-else）', points: 5,
        assigneeSuggestionId: 'u-zhou', skillRequirement: ['Java 17', 'Spring Boot 3.3'],
        dependsOnOrder: [1],
        rationale:
          '对应 TASK-2406（ac-state-machine）。BUG-1045 与 BUG-1046 的根因都是散落在 6 个服务里的状态判断，' +
          '收敛为单一组件是消除重复释放库存与重复记账的唯一路径。',
        acceptanceCriteria: [
          '6 个服务中的 if-else 状态判断全部替换为组件调用，静态扫描残留 0 处',
          '非法流转被拦截并返回 ORDER_STATE_ILLEGAL（对齐 REQ-2402 AC1）',
          '并发取消场景（AC-09）不再产生重复状态变更',
          '状态变更全量写入审计流水并可被下游订阅',
        ],
        riskLevel: '高', aiConfidencePct: 81,
      },
      {
        order: 3, title: '流转规则配置化与灰度热更新', points: 3,
        assigneeSuggestionId: 'u-shen', skillRequirement: ['Java 17', 'RabbitMQ'],
        dependsOnOrder: [2],
        rationale:
          '对应 TASK-2407。AI 认为热更新的灰度语义（按业务线灰度还是按流量比例灰度）可以独立设计与验收，' +
          '从而与审计流水子任务并行。',
        acceptanceCriteria: [
          '规则变更在不重启服务的前提下 30s 内生效',
          '灰度范围可按业务线维度精确控制',
          '规则回滚可在 1 分钟内完成且不留脏状态',
        ],
        riskLevel: '高', aiConfidencePct: 58,
      },
      {
        order: 4, title: 'order_state_log 审计流水与下游订阅', points: 3,
        assigneeSuggestionId: 'u-shen', skillRequirement: ['RabbitMQ', 'Elasticsearch'],
        dependsOnOrder: [2],
        rationale:
          '对应 TASK-2408（ac-audit-store）。客服系统状态不同步的 37 起投诉要求审计流水可被下游订阅，' +
          '与规则热更新无耦合，适合作为并行分支。',
        acceptanceCriteria: [
          '每次状态变更产生一条不可篡改的审计记录，含操作者、前后状态、时间戳',
          '审计事件按 CloudEvents 1.0 信封外发，客服系统订阅端到端延迟 ≤ 3s',
          '审计流水保留期 ≥ 180 天且可按订单号检索',
        ],
        riskLevel: '中', aiConfidencePct: 83,
      },
    ],
    totalPoints: 13,
    parallelismDegree: 2, criticalPathOrders: [1, 2, 3], criticalPathPoints: 10,
    estimatedLeadTimeSavedDays: 2,
    comparedWithHumanPlan: { humanTaskCount: 3, humanTotalPoints: 13, aiDeltaPoints: 0, overlapPct: 88 },
    status: 'partial', acceptedOrders: [1, 2, 4],
    rejectedOrders: [
      {
        order: 3,
        reason:
          '规则热更新的灰度语义仍需架构师确认：API-05 契约处于 reviewing、CS-2407 已 paused，' +
          '方案未定稿时拆为独立工作项会形成 3 点空转（无法开工也无法验收）。' +
          '该项 aiConfidencePct 只有 58%，是 6 条建议中所有子任务里最低的，AI 自身置信度也不支持独立拆解。' +
          '决定留在 TASK-2407 内，待 u-yan 确认灰度语义后再评估。',
      },
    ],
    decidedBy: 'u-yan', decidedAt: '2026-03-10 09:47',
    decisionNote:
      '采纳 order 1 / 2 / 4。最有价值的是 order 1：人工计划里没有「契约冻结」这个显式工作项，' +
      '但 API-05 未冻结正是 TASK-2406 与 TASK-2407 相互等待的根源。order 1 新建为 2 点前置任务（u-yan，03-20 前完成），' +
      'order 2 / order 4 分别对齐既有 TASK-2406 / TASK-2408，点数不变。' +
      'order 3 否决后 TASK-2407 维持 5 点原样。总点数 13 与人工计划持平（aiDeltaPoints = 0），' +
      '说明 AI 与人工对 REQ-2402 的工作量判断一致，分歧只在切分方式。',
    tone: 'ai',
  },
  {
    id: 'BRK-06', sourceType: 'requirement', sourceId: 'REQ-2404',
    sourceTitle: '订单查询性能达标：3000 TPS 且 P99 < 200ms', sourcePoints: 13,
    generatedAt: '2026-03-18 21:12', modelId: 'mdl-gpt5', agentId: 'ag-arch',
    strategy: '按限界上下文',
    strategyReason:
      'REQ-2404 是 P0 非功能需求，当前 G4 性能子项判定不通过：压测峰值 2,400 TPS（目标 3,000）、' +
      'API-03 P95 342ms、P99 618ms。慢 SQL Top1 为跨 8 分片的 count(*) + LIMIT 100000,20 深分页，单条 1.8s。' +
      '缓存（ac-cache-layer）、分片路由（ac-order-db）、查询链路（ac-order-query）分属三个上下文，' +
      '人工计划里「深分页改造」被隐藏在 TASK-2413 内部，无法独立排期与验收。',
    suggestedTasks: [
      {
        order: 1, title: 'Redis 7 多级缓存与 binlog 失效一致性', points: 5,
        assigneeSuggestionId: 'u-zhou', skillRequirement: ['Redis 7', 'MySQL 8'],
        dependsOnOrder: [],
        rationale:
          '对应 TASK-2412。AC-02（缓存一致性）当前 failed 并挂了 BUG-1048，' +
          '缓存与 binlog 的失效时序是独立的技术问题，与分片改造无先后依赖。',
        acceptanceCriteria: [
          '缓存命中后订单详情 P95 ≤ 20ms',
          'binlog 失效延迟 ≤ 500ms，AC-02 转绿且 BUG-1048 关闭',
          '缓存击穿 / 穿透 / 雪崩三类防护均有单测与压测数据',
        ],
        riskLevel: '中', aiConfidencePct: 84,
      },
      {
        order: 2, title: '订单号基因分片与分库分表路由改造', points: 5,
        assigneeSuggestionId: 'u-shen', skillRequirement: ['MySQL 8', '分库分表'],
        dependsOnOrder: [],
        rationale:
          '对应 TASK-2413。基因分片只保证按用户维度单分片命中，' +
          '运营侧「按状态 + 时间范围」查询无法带分片键，退化为全分片扫描 + 内存归并——' +
          '这是 2,400 TPS 上不去的结构性原因。',
        acceptanceCriteria: [
          '按用户维度查询单分片命中率 100%',
          '跨分片聚合查询有显式的分片键下推或走 ES，不再全分片扫描',
          '3,000 TPS 压测下 P99 < 200ms（对齐 REQ-2404 标题口径）',
        ],
        riskLevel: '高', aiConfidencePct: 79,
      },
      {
        order: 3, title: 'API-03 深分页改造：按已冻结契约落地游标分页 + 分片聚合', points: 3,
        assigneeSuggestionId: 'u-zhou', skillRequirement: ['MySQL 8', 'Elasticsearch'],
        dependsOnOrder: [2],
        rationale:
          '直接对应 TEST_REPORT 的建议项「将 API-03 深分页改造（游标分页 + 分片聚合）拆为独立任务插入 Sprint 24 剩余产能」，' +
          '以及 BUG-1047 的根因分析结论（offset 深分页触发 filesort、回表 2.4 万次）。' +
          '值得注意的是 API-03 契约 v2.0 早已于 2026-03-02 冻结，summary 与 changelog 都明确写了「游标分页」「分页由 offset 改为 cursor，' +
          '深分页性能提升 6 倍」，但实现侧仍是 offset——这是契约与实现的偏离，不是需要新发起的契约变更，' +
          '因此不需要额外的下游沟通成本，可以直接排期。人工计划中该工作被并入 TASK-2413 的 5 点里，' +
          '既无独立验收标准也无法单独排期，而 AC-12（深分页，P95 342ms）正是当前唯一因性能契约违约而 failed 的 imported 用例。',
        acceptanceCriteria: [
          '实现与 API-03 v2.0 冻结契约一致：分页参数为 cursor，不再接受 offset/limit',
          'page=1200 等效深度下 P95 ≤ 100ms（索引重建后浅分页已达 62ms）',
          'AC-12 转绿、BUG-1047 关闭、G4 性能子项由 ✗ 转为 ✓',
          'KB-ARCH-01 增补「列表查询禁用 offset 深分页」红线（沿用 BUG-1047 复盘动作项）',
        ],
        riskLevel: '高', aiConfidencePct: 87,
      },
      {
        order: 4, title: '前端列表查询链路优化与 ES 索引接入', points: 2,
        assigneeSuggestionId: 'u-chen', skillRequirement: ['Vue 3', 'TypeScript 5', 'Elasticsearch'],
        dependsOnOrder: [1, 3],
        rationale:
          '对应 TASK-2414。BUG-1047 的复盘明确指出「已建成的 ES 索引（TASK-2414）未被接入列表查询」——' +
          '索引建好但没接上，属于集成缺口而非能力缺口，拆出后可独立验收接入结果。',
        acceptanceCriteria: [
          '订单列表首屏在 1,000 万数据量下 ≤ 1.2s（避免生产切流后超标）',
          '列表查询实际命中 ES 索引，慢查询日志中不再出现列表相关语句',
          '前端请求合并与骨架屏落地，接口调用次数较改造前下降 ≥ 30%',
        ],
        riskLevel: '中', aiConfidencePct: 80,
      },
    ],
    totalPoints: 15,
    parallelismDegree: 2, criticalPathOrders: [2, 3, 4], criticalPathPoints: 10,
    estimatedLeadTimeSavedDays: 2,
    comparedWithHumanPlan: { humanTaskCount: 3, humanTotalPoints: 13, aiDeltaPoints: 2, overlapPct: 84 },
    status: 'pending', acceptedOrders: [], rejectedOrders: [],
    decidedBy: null, decidedAt: '',
    decisionNote:
      '待 u-lin 与 u-yan 联合决策（REQ-2404 的 ownerId 是 u-yan，API-03 的 reviewerId 也是 u-yan，' +
      '任务承接方是订单中心研发组与交易中台前端组）。决策要点有三个：' +
      '其一，order 3 是把实现拉回到已冻结的 API-03 v2.0 契约，不涉及契约变更，' +
      '但需要确认前端与其他调用方是否已按 cursor 语义联调，否则会引入新的兼容性缺口；' +
      '其二，order 1 与 order 2 虽无依赖可并行，但两者分别建议由 u-zhou / u-shen 承接，' +
      '而 u-zhou 同时还是 order 3 的建议承接人，实际并行度取决于 SCH-08（TASK-2412 提前，已 accepted）能否腾出产能；' +
      '其三，多出的 2 点全部来自 order 3，若 SP-24 剩余产能不足，' +
      '可考虑把 order 4 移入 SP-25 而非削减 order 3——因为 G4 不通过的直接原因是深分页，不是前端链路。',
    tone: 'warn',
  },
];
