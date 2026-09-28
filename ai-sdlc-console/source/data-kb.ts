/**
 * ============================================================
 * AI 研发协作控制台 · 企业知识库（对标 WeKnora）数据层
 * ------------------------------------------------------------
 * 对标引擎：**WeKnora** —— 腾讯开源的文档理解与检索增强（RAG）框架，
 * 核心能力包括：多格式文档解析、OCR 与表格结构化、层级语义切片、
 * 多路召回（向量 + BM25 + 知识图谱）、二阶段重排序（Reranker）、
 * 知识图谱自动构建、检索评测与调优、引用溯源与可观测。
 *
 * 本平台的知识库不是「又一个网盘」，而是 SDLC 六环节的**自动归档终点**
 * 与 7 个 Agent 的**统一检索入口**：
 *   S1 需求澄清(G1) → PRD v2.3 基线 / 用户故事 US-01~US-14 / 验收标准
 *   S2 架构设计(G2) → 四层架构视图 / 14 份接口契约 / 24 个开发任务
 *   S3 编码实现(G3) → 源代码 MR / 单元测试 / 代码评审记录
 *   S4 测试验证(G4) → 248 条用例执行结果 / 12 个缺陷 / 测试报告 TR-24
 *   S5 部署发布(G5) → 生产发布记录 / 环境拓扑快照 / 回滚预案
 *   S6 运维观测(G6) → 告警事件 / 根因分析报告 / 技术债清单
 * 上述 18 项产物由 KB_STAGE_ARTIFACT_MAP 逐条登记归档规则，命中事件
 * （sdlc.prd.baselined / sdlc.gate.passed / sdlc.mr.merged / …）后自动
 * 走 7 步入库流水线（采集 → 解析/OCR → 结构化抽取 → 层级切片 →
 * 向量化 → 图谱构建 → 索引与评测），落入 6 个知识空间；随后被
 * ag-pm / ag-arch / ag-code / ag-review / ag-test / ag-ops / ag-ba
 * 七个 Agent 在各自环节检索消费，形成「产物 → 知识 → 下一次决策」的闭环。
 *
 * 与既有数据的关系（**只读复用，不修改 data.ts**）：
 * - `ragEntries` 的 11 条存量条目（rag-01~rag-11）全部映射进本模块的
 *   6 个知识空间与 20 篇文档（KD-01~KD-11），其 kbId（KB-ARCH-01 /
 *   KB-CODE-02 / KB-SEC-02 / KB-TEST-03 / KB-OPS-01 / KB-BS-2401）作为
 *   legacyKbId 原样保留，成为新文档编号体系的兼容层，不另起炉灶。
 * - 图谱节点的 layer / componentId 引用 ARCH_LAYERS 与 ARCH_COMPONENTS
 *   的真实 id；检索日志的 agentTraceId 引用 agentTraces 的真实 id；
 *   治理策略引用 egressPolicy / redactRules / auditLogs 的真实 id。
 *
 * 切片引用统一约定（本模块内 KC / 图谱证据 / 检索命中通用）：
 *   · 样本切片（KB_CHUNKS 中已收录）→ 直接写 `KC-xx`
 *   · 非样本切片 → 写 `{docId}#{chunkIndex}`，例如 `KD-15#52`
 *
 * 贯穿主线：「订单中心重构」（EPIC-ORDER-REF）· Sprint 24
 * 日期基准：TODAY = 2026-03-19
 * ============================================================
 */

import type { Tone } from './data';

/* ==== 0. WeKnora 引擎与能力描述 ==== */

/** 知识引擎（RAG 底座）定义，本平台对接腾讯开源 WeKnora */
export interface KbEngineDef {
  id: string;
  /** 引擎名称 */
  name: string;
  /** 供应方 */
  vendor: string;
  version: string;
  /** 部署形态 */
  deployMode: '私有化 VPC' | 'SaaS' | '混合';
  /** 服务入口 */
  endpoint: string;
  protocol: 'REST' | 'gRPC' | 'SDK';
  /** 鉴权方式 */
  authMode: string;
  status: 'connected' | 'paused' | 'unplugged';
  connectedAt: string;
  /** 向量化模型，须与 data.ts ragEntries.embedModel 一致 */
  embeddingModel: string;
  /** 二阶段重排模型 */
  rerankModel: string;
  /** OCR 引擎 */
  ocrEngine: string;
  /** 可解析的文档格式 */
  parserFormats: ('pdf' | 'docx' | 'md' | 'xlsx' | 'pptx' | 'html' | 'image' | 'confluence' | 'feishu-doc')[];
  vectorStore: 'PostgreSQL + pgvector' | 'Milvus' | 'Elasticsearch';
  /** 图谱存储 */
  graphStore: string;
  /** 索引数量（与 KB_SPACES 一一对应，每个知识空间一个索引） */
  indexCount: number;
  /** 切片总数 = KB_SPACES.chunkCount 之和 = KB_DOCS.chunks 之和 = 2406 */
  totalChunks: number;
  /** token 总量（百万）= KB_DOCS.tokensK 之和 1219K ÷ 1000 ≈ 1.22 */
  totalTokensM: number;
  /** 检索 QPS 上限 */
  qpsLimit: number;
  /** 平均纯检索耗时（ms），与 kbStats.avgRetrievalMs 一致 */
  avgRetrievalMs: number;
  /** 平均单文档入库耗时（秒）= 已结束 7 次执行耗时之和 1321 ÷ 7 ≈ 188.7 */
  avgIngestSec: number;
  /** SLA 可用率 */
  slaUptimePct: number;
  docsUrl: string;
  note: string;
  tone: Tone;
}

/** WeKnora 引擎实例（私有化 VPC 部署，1 条） */
export const KB_ENGINE: KbEngineDef = {
  id: 'engine-weknora',
  name: 'WeKnora',
  vendor: '腾讯开源',
  version: '1.4.2',
  deployMode: '私有化 VPC',
  endpoint: 'https://weknora.intra.example.com/api/v1',
  protocol: 'REST',
  authMode: 'mTLS 双向证书 + OIDC（飞书 SSO 联邦）',
  status: 'connected',
  connectedAt: '2026-01-06 10:20',
  embeddingModel: 'bge-large-zh-v1.5',
  rerankModel: 'bge-reranker-v2-m3',
  ocrEngine: 'PaddleOCR v4（含 PP-StructureV2 表格结构还原）',
  parserFormats: ['pdf', 'docx', 'md', 'xlsx', 'pptx', 'html', 'image', 'confluence', 'feishu-doc'],
  vectorStore: 'PostgreSQL + pgvector',
  graphStore: 'NebulaGraph 3.8',
  indexCount: 6,
  totalChunks: 2406,
  totalTokensM: 1.22,
  qpsLimit: 60,
  avgRetrievalMs: 268,
  avgIngestSec: 188.7,
  slaUptimePct: 99.95,
  docsUrl: 'https://github.com/Tencent/WeKnora',
  note: '与生产网同 VPC 隔离部署，向量与原文均不出域；env-staging / env-prod 命中 EGRESS-DENY 时，检索链路强制走本实例而非任何公有云 RAG 服务。近 30 日 SLA 99.95%，仅 03-19 16:22 因 GitLab Runner 出口网络抖动导致 1 次向量化超时（KI-07）。',
  tone: 'ai',
};

/** WeKnora 能力条目定义 */
export interface WeKnoraCapabilityDef {
  id: string;
  name: string;
  /** 能力的具体实现方式与效果指标 */
  desc: string;
  /** 输入产物 */
  inputArtifacts: string[];
  /** 输出产物 */
  outputArtifacts: string[];
  /** 服务于哪些 SDLC 环节（引用 SDLC_STAGES 真实 id） */
  sdStageIds: string[];
  /** 哪些 Agent 消费该能力（引用 agents 真实 id） */
  agentIds: string[];
  automationLevel: 'full' | 'assisted' | 'manual';
  metrics: { name: string; value: number; unit: string }[];
  /** 本平台的落地能力名 */
  platformEquivalent: string;
  tone: Tone;
}

/** WeKnora 8 项核心能力，以及它们在本平台 SDLC 链路上的落地形态 */
export const WEKNORA_CAPABILITIES: WeKnoraCapabilityDef[] = [
  {
    id: 'WK-01',
    name: '多格式文档解析',
    desc: '基于版面分析（PP-DocLayout）+ 阅读顺序还原的统一解析器，支持 pdf/docx/md/xlsx/pptx/html/image/confluence/feishu-doc 九类来源；对 Confluence 与飞书文档走官方 API 拉取富文本，避免二次导版式丢失。本平台 20 篇文档按来源系统分布为：Confluence 10 篇、飞书文档 1 篇、平台自动归档 6 篇、GitLab 2 篇、PingCode 1 篇（后三类合计 9 篇由 SDLC 事件驱动归档），解析成功率 99.2%。',
    inputArtifacts: ['Confluence 页面', '飞书文档', 'GitLab MR diff', 'PingCode 工作项', 'Jenkins 构建报告', '人工上传 PDF'],
    outputArtifacts: ['结构化中间表示（IR）', '段落/标题树', '表格对象', '图片对象'],
    sdStageIds: ['st-req', 'st-arch', 'st-code', 'st-test', 'st-deploy', 'st-observe'],
    agentIds: ['ag-pm', 'ag-arch', 'ag-code', 'ag-review', 'ag-test', 'ag-ops', 'ag-ba'],
    automationLevel: 'full',
    metrics: [
      { name: '解析成功率', value: 99.2, unit: '%' },
      { name: '支持格式数', value: 9, unit: '种' },
      { name: '平均解析耗时', value: 4.6, unit: '秒/百页' },
    ],
    platformEquivalent: '统一文档接入适配器（Confluence / 飞书 / GitLab / PingCode / Jenkins 五路连接器）',
    tone: 'brand',
  },
  {
    id: 'WK-02',
    name: 'OCR 与表格结构化',
    desc: 'PaddleOCR v4 识别位图中的文字，PP-StructureV2 还原表格行列关系并输出 HTML/Markdown 双格式；对架构图额外做框线检测，把「组件框 + 箭头」转为可供图谱构建消费的三元组候选。本平台 KD-04（权限矩阵截图 3 页）、KD-14（架构图位图 2 张）、KD-19（灰度批次截图 3 页）共 8 页走了 OCR。',
    inputArtifacts: ['架构图位图', '权限矩阵截图', '扫描件 PDF', 'Excel 报表'],
    outputArtifacts: ['OCR 文本层', '结构化表格', '图形三元组候选'],
    sdStageIds: ['st-arch', 'st-deploy', 'st-test'],
    agentIds: ['ag-arch', 'ag-ops', 'ag-test'],
    automationLevel: 'assisted',
    metrics: [
      { name: '印刷体识别准确率', value: 98.4, unit: '%' },
      { name: '表格结构还原 F1', value: 0.941, unit: '' },
      { name: '本月 OCR 页数', value: 8, unit: '页' },
    ],
    platformEquivalent: '架构图与权限矩阵 OCR 结构化（KD-04 / KD-14 / KD-19）',
    tone: 'teal',
  },
  {
    id: 'WK-03',
    name: '层级语义切片',
    desc: '按标题层级（heading-aware）切分并保留 headingPath 上下文，代码按语法块（code-block）切分、表格按行组（table-row）切分，避免「切一半语义」；对过短切片（< 120 字）自动与相邻兄弟节点合并。切片策略调优后架构规范类文档 recall@10 由 0.826 提升至 0.878（见 KQ-01 tuningActions）。',
    inputArtifacts: ['结构化中间表示（IR）', '标题树', '代码块', '表格对象'],
    outputArtifacts: ['切片（含 headingPath / position）', '切片质量标记'],
    sdStageIds: ['st-req', 'st-arch', 'st-code', 'st-test', 'st-deploy', 'st-observe'],
    agentIds: ['ag-pm', 'ag-arch', 'ag-code', 'ag-review', 'ag-test', 'ag-ops', 'ag-ba'],
    automationLevel: 'full',
    metrics: [
      { name: '切片总数', value: 2406, unit: '个' },
      { name: '平均切片长度', value: 507, unit: 'token' },
      { name: '噪声切片占比', value: 2.1, unit: '%' },
    ],
    platformEquivalent: 'heading-aware 切片器 + 代码块/表格保真策略（chunkStrategy 五档可配）',
    tone: 'info',
  },
  {
    id: 'WK-04',
    name: '多路召回（向量+BM25+图谱）',
    desc: '三路并行召回后按可配权重融合：向量路负责语义相似，BM25 路负责术语与编号精确匹配（如 API-03、BUG-1043、TASK-2413），图谱路负责多跳关系扩展（如「优惠核销 → 最大余额法 → 金额精度缺陷模式」）。BUG-1043 复盘后为「幂等键 / 幂等性 / Idempotency-Key」建立同义词表，修复了 ag-code 在 02-24 未召回 KB-CODE-02 的缺口。',
    inputArtifacts: ['用户/Agent 查询', '向量索引', 'BM25 倒排索引', '知识图谱'],
    outputArtifacts: ['候选切片集合（含各路得分）'],
    sdStageIds: ['st-req', 'st-arch', 'st-code', 'st-test', 'st-deploy', 'st-observe'],
    agentIds: ['ag-pm', 'ag-arch', 'ag-code', 'ag-review', 'ag-test', 'ag-ops', 'ag-ba'],
    automationLevel: 'full',
    metrics: [
      { name: '近 30 日检索次数', value: 3842, unit: '次' },
      { name: '平均候选数', value: 31, unit: '个/次' },
      { name: '图谱路命中占比', value: 18.6, unit: '%' },
    ],
    platformEquivalent: '向量 + BM25 + 图谱三路召回编排器（recallStrategy 权重可按 Agent 单独配置）',
    tone: 'indigo',
  },
  {
    id: 'WK-05',
    name: '重排序（Reranker）',
    desc: 'bge-reranker-v2-m3 对多路融合后的候选做 cross-encoder 精排，取 topK 注入提示词；对标记为 stale 的文档施加 0.6 降权因子（如 KD-08 金额精度附录 C），避免过期规约污染生成结果。引入二阶段重排后 KQ-01 的 MRR 提升 0.055。',
    inputArtifacts: ['候选切片集合'],
    outputArtifacts: ['重排后 topK 切片', '相似度分数'],
    sdStageIds: ['st-arch', 'st-code', 'st-test', 'st-observe'],
    agentIds: ['ag-arch', 'ag-code', 'ag-review', 'ag-test', 'ag-ba'],
    automationLevel: 'full',
    metrics: [
      { name: 'MRR 提升', value: 0.055, unit: '' },
      { name: '平均重排耗时', value: 74, unit: 'ms' },
      { name: '过期文档降权因子', value: 0.6, unit: '' },
    ],
    platformEquivalent: 'bge-reranker-v2-m3 二阶段重排 + 保鲜降权',
    tone: 'ai',
  },
  {
    id: 'WK-06',
    name: '知识图谱自动构建',
    desc: '从切片中抽取实体与关系（NER + 关系抽取 + 实体链接），与架构画布的 ARCH_COMPONENTS 做 id 对齐，形成 18 节点 / 26 边的订单域知识图谱；每条边保留 evidence（docId + chunkId + 原文引用）与置信度，置信度 < 80% 的边进入人工复核队列，由架构师严慕舟确认后 verified 置真。抽取口径实测：节点侧 AI 抽取 17/18 = 94.4%，边侧 AI 抽取 25/26 = 96.2%；已人工核验边 18/26 = 69.2%（u-yan 11 条、u-zhou 7 条），其余 8 条仍在复核队列，下面两项指标均取边侧口径，与 KnowledgePage 的 graphStats 一致。',
    inputArtifacts: ['切片', '实体候选', '架构组件清单'],
    outputArtifacts: ['图谱节点', '图谱边（含证据与置信度）'],
    sdStageIds: ['st-arch', 'st-code', 'st-observe'],
    agentIds: ['ag-arch', 'ag-code', 'ag-review', 'ag-ba'],
    automationLevel: 'assisted',
    metrics: [
      { name: '图谱节点数', value: 18, unit: '个' },
      { name: '图谱边数', value: 26, unit: '条' },
      { name: 'AI 抽取占比', value: 96.2, unit: '%' },
      { name: '人工核验占比', value: 69.2, unit: '%' },
    ],
    platformEquivalent: 'SDLC 实体图谱（与 ARCH_LAYERS / ARCH_COMPONENTS 的 id 双向对齐）',
    tone: 'brand',
  },
  {
    id: 'WK-07',
    name: '检索评测与调优',
    desc: '维护 3 个黄金评测集（KQ-01 架构与规范 120 问、KQ-02 金额与合规 86 问、KQ-03 运维与根因 64 问），每周三 22:00 自动回归，输出 recall@5/@10、MRR、nDCG@10、precision@5 与答案忠实度；指标连续两次下滑即触发调优工单。KQ-01 近 5 次评测 recall@10 由 0.826 稳步升至 0.912。',
    inputArtifacts: ['黄金问答对', '检索日志', '人工反馈标注'],
    outputArtifacts: ['评测报告', '调优动作清单'],
    sdStageIds: ['st-arch', 'st-code', 'st-test', 'st-observe'],
    agentIds: ['ag-arch', 'ag-code', 'ag-test', 'ag-ba'],
    automationLevel: 'assisted',
    metrics: [
      { name: '评测问题总数', value: 270, unit: '问' },
      { name: 'recall@10（KQ-01）', value: 0.912, unit: '' },
      { name: '答案忠实度', value: 94.6, unit: '%' },
    ],
    platformEquivalent: '检索评测集 KQ-01~KQ-03 与每周三自动回归',
    tone: 'ok',
  },
  {
    id: 'WK-08',
    name: '引用溯源与幻觉抑制',
    desc: '强制「无引用不成立」：Agent 生成的每条结论必须挂载 docId + chunkId，引用校验器会核对被引切片是否真实存在于索引、以及引文与结论是否语义一致；校验不通过则拦截该句并要求补充证据。近 30 日拦截 4 次（见 kb-gov-05），注入知识后整体幻觉率由 12.04% 降至 2.50%，相对下降 79.3%。',
    inputArtifacts: ['Agent 生成草稿', '重排后 topK 切片', '图谱约束'],
    outputArtifacts: ['带引用的结论', '幻觉拦截记录'],
    sdStageIds: ['st-req', 'st-arch', 'st-code', 'st-test', 'st-deploy', 'st-observe'],
    agentIds: ['ag-pm', 'ag-arch', 'ag-code', 'ag-review', 'ag-test', 'ag-ops', 'ag-ba'],
    automationLevel: 'full',
    metrics: [
      { name: '无知识注入幻觉率', value: 12.04, unit: '%' },
      { name: '注入知识后幻觉率', value: 2.5, unit: '%' },
      { name: '幻觉率相对下降', value: 79.3, unit: '%' },
      { name: '近 30 日拦截次数', value: 4, unit: '次' },
    ],
    platformEquivalent: '引用溯源校验器 + 无引用即阻断（治理策略 kb-gov-05）',
    tone: 'danger',
  },
];

/* ==== 1. 阶段产物 → 知识库归档映射 ==== */

/** 知识产物类型（同时用作 KB_DOCS.docType，共 18 种，与 SDLC 六环节 outputs 一一对应） */
export type KbArtifactType =
  | 'PRD' | '用户故事' | '验收标准' | '架构图' | '接口契约' | '任务清单'
  | '代码' | '单元测试' | '评审记录' | '测试报告' | '缺陷分析' | '用例执行结果'
  | '发布记录' | '环境快照' | '回滚预案' | '告警事件' | '根因报告' | '技术债';

/** 知识空间/文档的访问级别 */
export type KbAccessLevel = 'public' | 'internal' | 'restricted' | 'confidential';

/**
 * 阶段产物 → 知识库归档映射定义。
 * 这是本模块最核心的一张表：SDLC_STAGES 六个环节的 outputs 共 18 项，
 * 每一项在此登记「由哪个事件触发、走哪条归档规则、落到哪个知识空间、
 * 生成哪篇文档、谁能检索、要不要脱敏」。
 * 口径说明：`archivedCount` 为跨迭代累计归档次数；`docId` 指向**本迭代**
 * 生成的知识文档，为 null 表示本轮尚未产出可归档文档（详见 note）。
 */
export interface KbStageArtifactDef {
  /** 形如 `st-req-1`：{stageId}-{该环节内的序号 1~3}，不引入新的 id 前缀 */
  id: string;
  /** 环节 id（引用 SDLC_STAGES） */
  stageId: string;
  stageName: string;
  /** 产物名称，字面值必须与 SDLC_STAGES.outputs 完全一致 */
  artifactName: string;
  artifactType: KbArtifactType;
  /** 是否自动归档 */
  autoArchive: boolean;
  /** 归档触发事件名 */
  archiveTrigger: string;
  /** 关联归档规则（KA-*） */
  archiveRuleId: string;
  /** 目标知识空间（KS-*） */
  targetSpaceId: string;
  /** 本迭代生成的知识文档（KD-*），null 表示尚未产出 */
  docId: string | null;
  retentionDays: number;
  accessLevel: KbAccessLevel;
  redactRequired: boolean;
  /** 关联脱敏规则（引用 data.ts redactRules 的 rd-* id） */
  redactRuleIds: string[];
  /** 会检索该产物的 Agent（引用 agents 真实 id） */
  consumedByAgentIds: string[];
  chunkStrategy: 'heading' | 'semantic' | 'fixed' | 'table-row' | 'code-block';
  embeddingModel: string;
  versionPolicy: 'latest' | 'all-versions' | 'baseline-only';
  lastArchivedAt: string;
  archivedCount: number;
  tone: Tone;
  note: string;
}

/**
 * 18 条阶段产物归档映射：st-req 3 条 / st-arch 3 条 / st-code 3 条 /
 * st-test 3 条 / st-deploy 3 条 / st-observe 3 条。
 * 其中 16 条已生成本迭代知识文档（docId 非空），2 条为 null：
 * 「环境拓扑快照」（REL-2403 被 G3/G4 阻塞未切流）与「技术债清单」（G6 未开启，仍为草稿）。
 */
export const KB_STAGE_ARTIFACT_MAP: KbStageArtifactDef[] = [
  {
    id: 'st-req-1',
    stageId: 'st-req',
    stageName: '需求澄清',
    artifactName: 'PRD v2.3 基线',
    artifactType: 'PRD',
    autoArchive: true,
    archiveTrigger: 'sdlc.prd.baselined',
    archiveRuleId: 'KA-01',
    targetSpaceId: 'KS-02',
    docId: 'KD-12',
    retentionDays: 1825,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-pm', 'ag-arch', 'ag-code', 'ag-test'],
    chunkStrategy: 'heading',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'all-versions',
    lastArchivedAt: '2026-03-11 11:07',
    archivedCount: 5,
    tone: 'ai',
    note: 'PRD_VERSIONS 自 v1.0 至 v2.3 共 5 版全部归档，v2.3 为唯一基线（isBaseline=true）；G1 通过后由 KA-01 规则自动入库，AI 生成占比 44%。',
  },
  {
    id: 'st-req-2',
    stageId: 'st-req',
    stageName: '需求澄清',
    artifactName: '用户故事 US-01~US-14',
    artifactType: '用户故事',
    autoArchive: true,
    archiveTrigger: 'sdlc.prd.baselined',
    archiveRuleId: 'KA-01',
    targetSpaceId: 'KS-02',
    docId: 'KD-13',
    retentionDays: 1095,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-pm', 'ag-arch', 'ag-test'],
    chunkStrategy: 'heading',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-11 11:07',
    archivedCount: 3,
    tone: 'ai',
    note: '14 条用户故事按 US 编号独立切片，ag-test 生成用例时以「US 编号 + Given-When-Then」为最小检索单元，避免跨故事串味。',
  },
  {
    id: 'st-req-3',
    stageId: 'st-req',
    stageName: '需求澄清',
    artifactName: '验收标准',
    artifactType: '验收标准',
    autoArchive: true,
    archiveTrigger: 'sdlc.gate.passed:G1',
    archiveRuleId: 'KA-01',
    targetSpaceId: 'KS-02',
    docId: 'KD-13',
    retentionDays: 1095,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-test', 'ag-code', 'ag-review'],
    chunkStrategy: 'semantic',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-11 11:07',
    archivedCount: 3,
    tone: 'ok',
    note: '验收标准以 Given-When-Then 形式内嵌于 KD-13 第 3 章，按语义切片独立索引；v2.3 将退款链路时序由「先退款后核销」改为「先核销后退款」，旧切片已下线。',
  },
  {
    id: 'st-arch-1',
    stageId: 'st-arch',
    stageName: '架构设计',
    artifactName: '四层架构视图',
    artifactType: '架构图',
    autoArchive: true,
    archiveTrigger: 'sdlc.gate.passed:G2',
    archiveRuleId: 'KA-02',
    targetSpaceId: 'KS-01',
    docId: 'KD-14',
    retentionDays: 1825,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-arch', 'ag-code', 'ag-review', 'ag-test', 'ag-ba'],
    chunkStrategy: 'semantic',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'baseline-only',
    lastArchivedAt: '2026-03-13 17:26',
    archivedCount: 2,
    tone: 'brand',
    note: '架构画布导出 HTML，含 6 张图（其中 2 张为 Confluence 粘贴位图，已走 OCR）；14 个组件 id 与 ARCH_COMPONENTS 完全对齐，是知识图谱实体的权威来源。',
  },
  {
    id: 'st-arch-2',
    stageId: 'st-arch',
    stageName: '架构设计',
    artifactName: '14 份接口契约',
    artifactType: '接口契约',
    autoArchive: true,
    archiveTrigger: 'sdlc.contract.frozen',
    archiveRuleId: 'KA-02',
    targetSpaceId: 'KS-01',
    docId: 'KD-15',
    retentionDays: 1825,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-arch', 'ag-code', 'ag-test', 'ag-review'],
    chunkStrategy: 'code-block',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'all-versions',
    lastArchivedAt: '2026-03-13 17:26',
    archivedCount: 14,
    tone: 'brand',
    note: 'API_CONTRACTS 的 14 份契约（含 2 个 EVENT 契约）按 OpenAPI 3.1 逐接口切片，每个 operationId 一个切片；9 份 frozen、2 份 reviewing、3 份 draft，reviewing/draft 版本在检索时降权 0.7。',
  },
  {
    id: 'st-arch-3',
    stageId: 'st-arch',
    stageName: '架构设计',
    artifactName: '24 个开发任务',
    artifactType: '任务清单',
    autoArchive: true,
    archiveTrigger: 'sdlc.task.state_changed',
    archiveRuleId: 'KA-02',
    targetSpaceId: 'KS-01',
    docId: 'KD-16',
    retentionDays: 730,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-pm', 'ag-arch', 'ag-code'],
    chunkStrategy: 'table-row',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-19 08:00',
    archivedCount: 24,
    tone: 'info',
    note: 'TASK-2401~TASK-2424 由 PingCode 每日 08:00 增量同步为 JSON 快照，按任务卡逐行切片；保留 730 天用于效能回溯，不作为编码依据（编码以接口契约为准）。',
  },
  {
    id: 'st-code-1',
    stageId: 'st-code',
    stageName: '编码实现',
    artifactName: '源代码 MR',
    artifactType: '代码',
    autoArchive: true,
    archiveTrigger: 'sdlc.mr.merged',
    archiveRuleId: 'KA-03',
    targetSpaceId: 'KS-03',
    docId: 'KD-17',
    retentionDays: 1095,
    accessLevel: 'restricted',
    redactRequired: true,
    redactRuleIds: ['rd-01', 'rd-03', 'rd-08'],
    consumedByAgentIds: ['ag-code', 'ag-review', 'ag-test', 'ag-ba'],
    chunkStrategy: 'code-block',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-19 17:06',
    archivedCount: 4,
    tone: 'info',
    note: '仅归档已合入主干的 MR（MR-2402 / MR-2413 / MR-2417 / MR-2418）；MR-2410 因 G3 覆盖率 71.4% 未达标仍在第 2 轮复检，暂不入库。测试夹具中的手机号、收货地址与访问令牌按 rd-01/rd-03/rd-08 脱敏后再切片。',
  },
  {
    id: 'st-code-2',
    stageId: 'st-code',
    stageName: '编码实现',
    artifactName: '单元测试',
    artifactType: '单元测试',
    autoArchive: true,
    archiveTrigger: 'sdlc.coverage.reported',
    archiveRuleId: 'KA-03',
    targetSpaceId: 'KS-03',
    docId: 'KD-17',
    retentionDays: 730,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-test', 'ag-review', 'ag-code'],
    chunkStrategy: 'code-block',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-19 17:06',
    archivedCount: 4,
    tone: 'teal',
    note: '单测源码与覆盖率报告随 MR 一并归档进 KD-17；ag-test 反向补齐用例时优先检索「同一聚合根的历史单测」，本迭代据此定位到 InventoryDeductService#rollback 分支完全缺失（BUG-1045 与 G3 缺口同源）。',
  },
  {
    id: 'st-code-3',
    stageId: 'st-code',
    stageName: '编码实现',
    artifactName: '代码评审记录',
    artifactType: '评审记录',
    autoArchive: true,
    archiveTrigger: 'sdlc.review.approved',
    archiveRuleId: 'KA-04',
    targetSpaceId: 'KS-03',
    docId: 'KD-17',
    retentionDays: 1095,
    accessLevel: 'restricted',
    redactRequired: true,
    redactRuleIds: ['rd-08'],
    consumedByAgentIds: ['ag-code', 'ag-review'],
    chunkStrategy: 'semantic',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-19 17:06',
    archivedCount: 4,
    tone: 'warn',
    note: '仅归档 must-fix / should-fix 级别的最终批注，AI 中间态批注由 KA-08 判定 skip；MR-2410 的 1 条 must-fix（负向分摊余数方向错误）已随第 2 轮复检归档，是 ag-review 后续评审的高价值样本。',
  },
  {
    id: 'st-test-1',
    stageId: 'st-test',
    stageName: '测试验证',
    artifactName: '248 条用例执行结果',
    artifactType: '用例执行结果',
    autoArchive: true,
    archiveTrigger: 'sdlc.testplan.executed',
    archiveRuleId: 'KA-05',
    targetSpaceId: 'KS-04',
    docId: 'KD-18',
    retentionDays: 730,
    accessLevel: 'internal',
    redactRequired: true,
    redactRuleIds: ['rd-01', 'rd-06'],
    consumedByAgentIds: ['ag-test', 'ag-code', 'ag-review', 'ag-ba'],
    chunkStrategy: 'table-row',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-19 17:09',
    archivedCount: 3,
    tone: 'teal',
    note: '按 3 轮测试窗口（03-09~03-12 / 03-13~03-16 / 03-17~03-19）分批归档，已执行 154 条、通过 132 条、失败 17 条、阻塞 5 条；未执行的 94 条不入索引，避免 ag-test 误判为「已覆盖」。',
  },
  {
    id: 'st-test-2',
    stageId: 'st-test',
    stageName: '测试验证',
    artifactName: '12 个缺陷',
    artifactType: '缺陷分析',
    autoArchive: true,
    archiveTrigger: 'sdlc.bug.created',
    archiveRuleId: 'KA-05',
    targetSpaceId: 'KS-04',
    docId: 'KD-18',
    retentionDays: 1095,
    accessLevel: 'internal',
    redactRequired: true,
    redactRuleIds: ['rd-01', 'rd-04'],
    consumedByAgentIds: ['ag-test', 'ag-code', 'ag-review', 'ag-ba'],
    chunkStrategy: 'semantic',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'all-versions',
    lastArchivedAt: '2026-03-19 17:09',
    archivedCount: 12,
    tone: 'danger',
    note: 'BUG-1043~BUG-1055 共 12 个缺陷的复现步骤与聚类特征全部入库，形成「缺陷模式库」；金额精度缺陷模式（KG-18）即由 BUG-1043 抽象而来，供 ag-review 在评审阶段做前置拦截。',
  },
  {
    id: 'st-test-3',
    stageId: 'st-test',
    stageName: '测试验证',
    artifactName: '测试报告 TR-24',
    artifactType: '测试报告',
    autoArchive: true,
    archiveTrigger: 'sdlc.testreport.published',
    archiveRuleId: 'KA-05',
    targetSpaceId: 'KS-04',
    docId: 'KD-18',
    retentionDays: 1825,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-pm', 'ag-test', 'ag-review', 'ag-ops', 'ag-ba'],
    chunkStrategy: 'heading',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'all-versions',
    lastArchivedAt: '2026-03-19 17:09',
    archivedCount: 1,
    tone: 'warn',
    note: 'TR-24 当前为 v0.9-draft，G4 门禁判定 failed 未签发，但阻塞项与风险清单对 ag-ops 的发布决策有直接价值，故按 draft 状态入库并在检索结果中标注「未签发」。',
  },
  {
    id: 'st-deploy-1',
    stageId: 'st-deploy',
    stageName: '部署发布',
    artifactName: '生产发布记录',
    artifactType: '发布记录',
    autoArchive: true,
    archiveTrigger: 'sdlc.release.completed',
    archiveRuleId: 'KA-06',
    targetSpaceId: 'KS-05',
    docId: 'KD-19',
    retentionDays: 1825,
    accessLevel: 'confidential',
    redactRequired: true,
    redactRuleIds: ['rd-01', 'rd-03', 'rd-08'],
    consumedByAgentIds: ['ag-ops', 'ag-ba', 'ag-review'],
    chunkStrategy: 'heading',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'all-versions',
    lastArchivedAt: '2026-03-19 15:43',
    archivedCount: 3,
    tone: 'warn',
    note: 'REL-2401（已发布）/ REL-2402（已发布，BUG-1043 发现现场）/ REL-2403（blocked）三份发布单连同灰度批次观察记录一并归档；REL-2402 批次 2 的资损告警记录是 ag-ba 做同类风险预判的关键样本。',
  },
  {
    id: 'st-deploy-2',
    stageId: 'st-deploy',
    stageName: '部署发布',
    artifactName: '环境拓扑快照',
    artifactType: '环境快照',
    autoArchive: true,
    archiveTrigger: 'sdlc.release.completed',
    archiveRuleId: 'KA-06',
    targetSpaceId: 'KS-05',
    docId: null,
    retentionDays: 730,
    accessLevel: 'restricted',
    redactRequired: true,
    redactRuleIds: ['rd-08'],
    consumedByAgentIds: ['ag-ops', 'ag-ba', 'ag-arch'],
    chunkStrategy: 'semantic',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-02-27 23:40',
    archivedCount: 2,
    tone: 'slate',
    note: 'docId 为 null：生产拓扑快照须在切流完成后采集，REL-2403 因 G3（覆盖率 71.4%）与 BLOCK-0312（DBA 未批复迁移窗口）双重阻塞未执行，当前仅有 env-staging 的两次回切演练快照（上次归档 2026-02-27），本轮不生成新文档。',
  },
  {
    id: 'st-deploy-3',
    stageId: 'st-deploy',
    stageName: '部署发布',
    artifactName: '回滚预案',
    artifactType: '回滚预案',
    autoArchive: true,
    archiveTrigger: 'sdlc.release.completed',
    archiveRuleId: 'KA-06',
    targetSpaceId: 'KS-05',
    docId: 'KD-19',
    retentionDays: 1825,
    accessLevel: 'restricted',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-ops', 'ag-ba'],
    chunkStrategy: 'heading',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-19 15:43',
    archivedCount: 3,
    tone: 'warn',
    note: 'REL-2403 回滚预案为一键回切脚本（DNS + 配置中心双通道），RTO ≤ 10 分钟，已在 env-staging 演练 2 次（实测 RTO 6.5 分钟）；ag-ops 在 at-05 轨迹 18:05 检索本预案后给出「保持 blocked」建议。',
  },
  {
    id: 'st-observe-1',
    stageId: 'st-observe',
    stageName: '运维观测',
    artifactName: '告警事件',
    artifactType: '告警事件',
    autoArchive: true,
    archiveTrigger: 'sdlc.alert.fired',
    archiveRuleId: 'KA-07',
    targetSpaceId: 'KS-06',
    docId: 'KD-20',
    retentionDays: 365,
    accessLevel: 'restricted',
    redactRequired: true,
    redactRuleIds: ['rd-01', 'rd-07'],
    consumedByAgentIds: ['ag-ba', 'ag-ops', 'ag-test'],
    chunkStrategy: 'fixed',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-03-19 18:00',
    archivedCount: 36,
    tone: 'danger',
    note: '近 30 日归档 36 条告警事件快照（含 REL-2402 灰度期 3 次资损告警），以时间线形式内嵌于根因分析报告第 2 章；原始指标仍留在 Prometheus，知识库只存可检索的语义摘要。',
  },
  {
    id: 'st-observe-2',
    stageId: 'st-observe',
    stageName: '运维观测',
    artifactName: '根因分析报告',
    artifactType: '根因报告',
    autoArchive: true,
    archiveTrigger: 'sdlc.rca.approved',
    archiveRuleId: 'KA-07',
    targetSpaceId: 'KS-06',
    docId: 'KD-20',
    retentionDays: 1825,
    accessLevel: 'restricted',
    redactRequired: true,
    redactRuleIds: ['rd-01', 'rd-03', 'rd-04'],
    consumedByAgentIds: ['ag-ba', 'ag-test', 'ag-code', 'ag-review', 'ag-arch'],
    chunkStrategy: 'heading',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'all-versions',
    lastArchivedAt: '2026-03-18 09:17',
    archivedCount: 2,
    tone: 'danger',
    note: '仅归档 status=approved 的报告：BA-1043（优惠分摊尾差，置信度 94%）与 BA-1047（跨分片深分页）；BA-1045 仍为 reviewing，待何斯年复核通过后由同一规则追加入库。',
  },
  {
    id: 'st-observe-3',
    stageId: 'st-observe',
    stageName: '运维观测',
    artifactName: '技术债清单',
    artifactType: '技术债',
    autoArchive: true,
    archiveTrigger: 'sdlc.gate.passed:G6',
    archiveRuleId: 'KA-08',
    targetSpaceId: 'KS-06',
    docId: null,
    retentionDays: 1095,
    accessLevel: 'internal',
    redactRequired: false,
    redactRuleIds: [],
    consumedByAgentIds: ['ag-arch', 'ag-pm', 'ag-ba'],
    chunkStrategy: 'table-row',
    embeddingModel: 'bge-large-zh-v1.5',
    versionPolicy: 'latest',
    lastArchivedAt: '2026-02-20 10:30',
    archivedCount: 2,
    tone: 'slate',
    note: 'docId 为 null：G6 环节 progress 仅 20%、门禁未开启，本迭代技术债清单仍为草稿态，被 KA-08 规则判定 skip（草稿不入库，避免污染检索）。上一版归档于 Sprint 23 收尾（2026-02-20），其中 TD-2026-041 已转化为 REQ-2406 领域事件标准化。',
  },
];

/** 归档规则定义 */
export interface KbArchiveRuleDef {
  id: string;
  name: string;
  /** 命中的环节 id */
  matchStageIds: string[];
  matchArtifactTypes: KbArtifactType[];
  /** 触发条件表达式 */
  condition: string;
  action: 'archive' | 'archive-and-index' | 'skip' | 'redact-then-archive';
  targetSpaceId: string;
  /** 归档命名模板 */
  namingTemplate: string;
  dedupStrategy: 'content-hash' | 'semantic-similarity' | 'version-supersede';
  notifyUserIds: string[];
  enabled: boolean;
  /** 优先级 1（最高）~ 8（最低） */
  priority: number;
  hitCount30d: number;
  lastHitAt: string;
  tone: Tone;
}

/** 8 条归档规则（KA-01~KA-08），按 priority 升序求值，首条命中即执行 */
export const KB_ARCHIVE_RULES: KbArchiveRuleDef[] = [
  {
    id: 'KA-01',
    name: '需求基线归档',
    matchStageIds: ['st-req'],
    matchArtifactTypes: ['PRD', '用户故事', '验收标准'],
    condition: "event == 'sdlc.prd.baselined' || (gate.id == 'G1' && gate.status == 'passed')",
    action: 'archive-and-index',
    targetSpaceId: 'KS-02',
    namingTemplate: '{project}/S1-需求澄清/{artifactType}-{version}-{date}',
    dedupStrategy: 'version-supersede',
    notifyUserIds: ['u-su', 'u-lin', 'u-gu'],
    enabled: true,
    priority: 1,
    hitCount30d: 11,
    lastHitAt: '2026-03-11 11:07',
    tone: 'ai',
  },
  {
    id: 'KA-02',
    name: '架构冻结归档',
    matchStageIds: ['st-arch'],
    matchArtifactTypes: ['架构图', '接口契约', '任务清单'],
    condition: "gate.id == 'G2' && gate.status == 'passed' && contract.status in ['frozen','reviewing']",
    action: 'archive-and-index',
    targetSpaceId: 'KS-01',
    namingTemplate: '{project}/S2-架构设计/{artifactType}-{version}-{date}',
    dedupStrategy: 'content-hash',
    notifyUserIds: ['u-yan', 'u-lin'],
    enabled: true,
    priority: 2,
    hitCount30d: 46,
    lastHitAt: '2026-03-19 08:00',
    tone: 'brand',
  },
  {
    id: 'KA-03',
    name: '代码与单测归档',
    matchStageIds: ['st-code'],
    matchArtifactTypes: ['代码', '单元测试'],
    condition: "mr.state == 'merged' && pipeline.gateId == 'G3'",
    action: 'archive-and-index',
    targetSpaceId: 'KS-03',
    namingTemplate: '{project}/S3-编码实现/{repo}-{mrId}-{commitSha7}',
    dedupStrategy: 'content-hash',
    notifyUserIds: ['u-zhou', 'u-shen'],
    enabled: true,
    priority: 3,
    hitCount30d: 8,
    lastHitAt: '2026-03-19 17:06',
    tone: 'info',
  },
  {
    id: 'KA-04',
    name: '评审记录脱敏后归档',
    matchStageIds: ['st-code'],
    matchArtifactTypes: ['评审记录'],
    condition: "mr.state == 'merged' && review.severity in ['must-fix','should-fix']",
    action: 'redact-then-archive',
    targetSpaceId: 'KS-03',
    namingTemplate: '{project}/S3-编码实现/评审记录-{mrId}-{date}',
    dedupStrategy: 'semantic-similarity',
    notifyUserIds: ['u-zhou', 'u-lin'],
    enabled: true,
    priority: 4,
    hitCount30d: 6,
    lastHitAt: '2026-03-19 16:26',
    tone: 'warn',
  },
  {
    id: 'KA-05',
    name: '测试产物归档',
    matchStageIds: ['st-test'],
    matchArtifactTypes: ['用例执行结果', '缺陷分析', '测试报告'],
    condition: "event in ['sdlc.testplan.executed','sdlc.bug.created','sdlc.testreport.published']",
    action: 'archive-and-index',
    targetSpaceId: 'KS-04',
    namingTemplate: '{project}/S4-测试验证/{artifactType}-{sprintId}-{date}',
    dedupStrategy: 'version-supersede',
    notifyUserIds: ['u-he', 'u-gu'],
    enabled: true,
    priority: 5,
    hitCount30d: 34,
    lastHitAt: '2026-03-19 17:09',
    tone: 'teal',
  },
  {
    id: 'KA-06',
    name: '发布产物归档（仅存档不建图谱）',
    matchStageIds: ['st-deploy'],
    matchArtifactTypes: ['发布记录', '环境快照', '回滚预案'],
    condition: "event == 'sdlc.release.completed' || release.status in ['released','blocked']",
    action: 'archive',
    targetSpaceId: 'KS-05',
    namingTemplate: '{project}/S5-部署发布/{releaseId}-{artifactType}-{date}',
    dedupStrategy: 'version-supersede',
    notifyUserIds: ['u-meng', 'u-lin'],
    enabled: true,
    priority: 6,
    hitCount30d: 7,
    lastHitAt: '2026-03-19 15:43',
    tone: 'warn',
  },
  {
    id: 'KA-07',
    name: '观测与根因脱敏归档',
    matchStageIds: ['st-observe'],
    matchArtifactTypes: ['告警事件', '根因报告'],
    condition: "event == 'sdlc.alert.fired' || (event == 'sdlc.rca.approved' && rca.status == 'approved')",
    action: 'redact-then-archive',
    targetSpaceId: 'KS-06',
    namingTemplate: '{project}/S6-运维观测/{artifactType}-{bugId|alertId}-{date}',
    dedupStrategy: 'semantic-similarity',
    notifyUserIds: ['u-meng', 'u-zhou'],
    enabled: true,
    priority: 7,
    hitCount30d: 38,
    lastHitAt: '2026-03-19 18:00',
    tone: 'danger',
  },
  {
    id: 'KA-08',
    name: '草稿态与门禁未通过产物跳过',
    matchStageIds: ['st-code', 'st-observe'],
    matchArtifactTypes: ['评审记录', '技术债'],
    condition: "artifact.status == 'draft' || gate.status != 'passed'",
    action: 'skip',
    targetSpaceId: 'KS-06',
    namingTemplate: '{project}/S6-运维观测/{artifactType}-{sprintId}-{date}',
    dedupStrategy: 'version-supersede',
    notifyUserIds: ['u-yan', 'u-gu'],
    enabled: true,
    priority: 8,
    hitCount30d: 3,
    lastHitAt: '2026-03-19 06:00',
    tone: 'slate',
  },
];

/* ==== 2. 知识空间与文档资产 ==== */

/**
 * 知识空间定义（6 个）。
 * qualityScore 计算口径（0~100）：
 *   0.40 × 覆盖率（本空间对应环节的产物归档完成度）
 * + 0.25 × 新鲜度（100 − 超期未复核文档占比 × 100，按文档数加权）
 * + 0.20 × 命中率（近 30 日召回被采纳的比例归一化）
 * + 0.15 × 引用有效性（引用溯源校验通过率）
 */
export interface KbSpaceDef {
  id: string;
  name: string;
  /** 空间编号前缀，与 ragEntries 的 legacyKbId 体系兼容 */
  code: string;
  desc: string;
  ownerIds: string[];
  stageIds: string[];
  /** 文档数 = 该空间下 KB_DOCS 条数 */
  docCount: number;
  /** 切片数 = 该空间下 KB_DOCS.chunks 之和 */
  chunkCount: number;
  /** token 数（千）= 该空间下 KB_DOCS.tokensK 之和 */
  tokensK: number;
  /** 近 30 日命中数 = 该空间下 KB_DOCS.hitCount30d 之和 */
  hitCount30d: number;
  accessLevel: KbAccessLevel;
  /** 关联脱敏策略（SEC-MASK-2.1 即 data.ts redactRules 的策略集），null 表示无需脱敏 */
  redactPolicyId: string | null;
  autoArchiveEnabled: boolean;
  embeddingModel: string;
  updatedAt: string;
  qualityScore: number;
  /** 超期未复核文档数 = 该空间下 staleness.isStale 为 true 的文档数 */
  staleDocCount: number;
  tone: Tone;
}

/**
 * 6 个知识空间。合计 docCount 20 / chunkCount 2406 / tokensK 1219 / hitCount30d 4986。
 * legacyKbId 兼容映射：KB-ARCH-* → KS-01，KB-SEC-* → KS-01（平台级强制规范），
 * KB-BS-* → KS-02，KB-CODE-* → KS-03，KB-TEST-* → KS-04，KB-OPS-* → KS-05 或 KS-06
 * （发布手册归 KS-05，可观测与告警处置手册按主题归 KS-06）。
 */
export const KB_SPACES: KbSpaceDef[] = [
  {
    id: 'KS-01',
    name: '架构与规范',
    code: 'KB-ARCH',
    desc: '四层架构视图、限界上下文与聚合根边界约定、14 份接口契约、任务拆解快照，以及平台级安全合规规范（脱敏与审计）。是 ag-arch / ag-code / ag-review 的主要知识来源。',
    ownerIds: ['u-yan', 'u-lin'],
    stageIds: ['st-arch'],
    docCount: 7,
    chunkCount: 768,
    tokensK: 380,
    hitCount30d: 1804,
    accessLevel: 'internal',
    redactPolicyId: 'SEC-MASK-2.1',
    autoArchiveEnabled: true,
    embeddingModel: 'bge-large-zh-v1.5',
    updatedAt: '2026-03-19 08:00',
    qualityScore: 94.7,
    staleDocCount: 0,
    tone: 'brand',
  },
  {
    id: 'KS-02',
    name: '需求与产品',
    code: 'KB-REQ',
    desc: 'PRD v2.3 基线及其 5 版演进、14 条用户故事与 Given-When-Then 验收标准、订单业务术语与领域词汇表。ag-pm 做 Brainstorm 追问与故事拆解时的第一检索空间。',
    ownerIds: ['u-su', 'u-gu'],
    stageIds: ['st-req'],
    docCount: 3,
    chunkCount: 374,
    tokensK: 200,
    hitCount30d: 686,
    accessLevel: 'internal',
    redactPolicyId: null,
    autoArchiveEnabled: true,
    embeddingModel: 'bge-large-zh-v1.5',
    updatedAt: '2026-03-11 11:07',
    qualityScore: 92.3,
    staleDocCount: 0,
    tone: 'ai',
  },
  {
    id: 'KS-03',
    name: '代码与实现',
    code: 'KB-CODE',
    desc: 'Java 编码规约、Vue3 组件规范、金额精度附录、已合入 MR 变更集与单测快照。本空间新鲜度最低（KD-07 / KD-08 两篇超期未复核），是 ag-review 前置拦截的主要短板。',
    ownerIds: ['u-zhou', 'u-chen'],
    stageIds: ['st-code'],
    docCount: 4,
    chunkCount: 558,
    tokensK: 285,
    hitCount30d: 1150,
    accessLevel: 'restricted',
    redactPolicyId: 'SEC-MASK-2.1',
    autoArchiveEnabled: true,
    embeddingModel: 'bge-large-zh-v1.5',
    updatedAt: '2026-03-19 17:06',
    qualityScore: 89.1,
    staleDocCount: 2,
    tone: 'info',
  },
  {
    id: 'KS-04',
    name: '质量与测试',
    code: 'KB-QA',
    desc: '接口自动化与用例设计规范、TR-24 测试报告（含 248 条用例执行结果与 12 个缺陷汇总）。ag-test 反向补齐异常回滚用例时以此为依据。',
    ownerIds: ['u-he', 'u-gu'],
    stageIds: ['st-test'],
    docCount: 2,
    chunkCount: 290,
    tokensK: 143,
    hitCount30d: 618,
    accessLevel: 'internal',
    redactPolicyId: 'SEC-MASK-2.1',
    autoArchiveEnabled: true,
    embeddingModel: 'bge-large-zh-v1.5',
    updatedAt: '2026-03-19 17:09',
    qualityScore: 91.5,
    staleDocCount: 0,
    tone: 'teal',
  },
  {
    id: 'KS-05',
    name: '运维与发布',
    code: 'KB-OPS',
    desc: '生产发布与灰度回滚手册、REL-2401/2402/2403 发布归档包（发布记录 + 灰度批次 + 回滚预案）。访问级别 confidential，仅 ag-ops / ag-ba 与 SRE 可检索原文。',
    ownerIds: ['u-meng', 'u-lin'],
    stageIds: ['st-deploy'],
    docCount: 2,
    chunkCount: 200,
    tokensK: 99,
    hitCount30d: 341,
    accessLevel: 'confidential',
    redactPolicyId: 'SEC-MASK-2.1',
    autoArchiveEnabled: true,
    embeddingModel: 'bge-large-zh-v1.5',
    updatedAt: '2026-03-19 15:43',
    qualityScore: 73.5,
    staleDocCount: 0,
    tone: 'warn',
  },
  {
    id: 'KS-06',
    name: '事故与根因',
    code: 'KB-INC',
    desc: '可观测性与告警处置手册、BA-1043 / BA-1047 根因分析报告归档包（含告警时间线与预防项）。是缺陷模式库的载体，ag-ba 与 ag-review 共用。',
    ownerIds: ['u-meng', 'u-zhou'],
    stageIds: ['st-observe'],
    docCount: 2,
    chunkCount: 216,
    tokensK: 112,
    hitCount30d: 387,
    accessLevel: 'restricted',
    redactPolicyId: 'SEC-MASK-2.1',
    autoArchiveEnabled: true,
    embeddingModel: 'bge-large-zh-v1.5',
    updatedAt: '2026-03-18 09:17',
    qualityScore: 72.8,
    staleDocCount: 0,
    tone: 'danger',
  },
];

/**
 * 知识文档定义（当前资产视图 Top 20，非全量清单）。
 * legacyKbId / legacyRagId 用于与 data.ts 的 ragEntries 一一对应，
 * 其 chunks / tokensK / embedModel / hitCount30d / embedStatus 与存量值严格一致。
 */
export interface KbDocDef {
  id: string;
  spaceId: string;
  /** 对应 ragEntries 的 kbId（如 KB-ARCH-01），无则为 null */
  legacyKbId: string | null;
  /** 对应 ragEntries 的 id（如 rag-01），无则为 null */
  legacyRagId: string | null;
  title: string;
  docType: KbArtifactType;
  sourceSystem: '平台自动归档' | 'Confluence' | '飞书文档' | 'GitLab' | 'PingCode' | 'Jenkins' | 'SonarQube' | '人工上传';
  /** 源单据号 / URL 路径 / commit sha / MR id */
  sourceRef: string;
  stageId: string;
  stageName: string;
  /** 关联的真实业务对象 id（REQ-24xx / TASK-24xx / BUG-10xx / REL-24xx 等） */
  relatedIds: string[];
  version: string;
  isBaseline: boolean;
  format: 'md' | 'pdf' | 'docx' | 'xlsx' | 'html' | 'json' | 'yaml' | 'code';
  sizeKb: number;
  pageCount: number | null;
  chunks: number;
  tokensK: number;
  embedModel: string;
  embedStatus: 'ready' | 'indexing' | 'failed' | 'stale';
  parseStatus: 'parsed' | 'parsing' | 'ocr-pending' | 'failed';
  ocrRequired: boolean;
  tableCount: number;
  imageCount: number;
  codeBlockCount: number;
  /** 该文档贡献的图谱节点（KG-*） */
  graphNodeIds: string[];
  accessLevel: KbAccessLevel;
  redacted: boolean;
  redactedFields: string[];
  ownerIds: string[];
  /** 创建者 userId，或 'ai' 表示由 Agent 生成 */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastArchivedAt: string;
  hitCount30d: number;
  /** 引用过该文档的 Agent */
  citedByAgents: string[];
  /** 自入库以来累计被引用次数（口径不同于 kbStats.citationCount30d 的近 30 日） */
  citationCount: number;
  feedbackScore: number;
  staleness: {
    lastVerifiedAt: string;
    verifyCycleDays: number;
    isStale: boolean;
    staleReason: string | null;
  };
  /** 被哪篇文档取代；非空时该文档同时从检索索引下线 */
  supersededBy: string | null;
  tone: Tone;
  summary: string;
}

/**
 * 20 篇知识文档：KD-01~KD-11 与 ragEntries 的 11 条存量条目一一对应，
 * KD-12~KD-20 为本轮 SDLC 自动归档新增产物。
 * 合计 chunks 2406、tokensK 1219、sizeKb 13058。
 * embedStatus 分布：indexing 2 篇（KD-04 / KD-17）、stale 1 篇（KD-08）、ready 17 篇。
 */
export const KB_DOCS: KbDocDef[] = [
  {
    id: 'KD-01',
    spaceId: 'KS-01',
    legacyKbId: 'KB-ARCH-01',
    legacyRagId: 'rag-01',
    title: '订单中心四层架构规范',
    docType: '架构图',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://ARCH/KB-ARCH-01（架构组基线 v1.8）',
    stageId: 'st-arch',
    stageName: '架构设计',
    relatedIds: ['REQ-2401', 'REQ-2404', 'TASK-2413', 'TASK-2415'],
    version: 'v1.8',
    isBaseline: true,
    format: 'md',
    sizeKb: 486,
    pageCount: null,
    chunks: 186,
    tokensK: 92,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 12,
    imageCount: 4,
    codeBlockCount: 0,
    graphNodeIds: ['KG-01', 'KG-07', 'KG-11', 'KG-13', 'KG-14', 'KG-15'],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-yan'],
    createdBy: 'u-yan',
    createdAt: '2026-01-08 10:20',
    updatedAt: '2026-03-10',
    lastArchivedAt: '2026-03-10 09:12',
    hitCount30d: 428,
    citedByAgents: ['ag-arch', 'ag-code', 'ag-review', 'ag-ba'],
    citationCount: 168,
    feedbackScore: 4.7,
    staleness: { lastVerifiedAt: '2026-03-10', verifyCycleDays: 90, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'brand',
    summary: '定义接入层 / 应用服务层 / 领域层 / 基础设施层的职责与单向依赖规则，明确 14 个组件的归属层级，并给出 ArchUnit 门禁检查项。第 3.3 节的分层依赖禁令是 G3 门禁 must-fix 的直接判据，MR-2410 曾因 Controller 直接注入聚合根被判失败。',
  },
  {
    id: 'KD-02',
    spaceId: 'KS-01',
    legacyKbId: 'KB-ARCH-01',
    legacyRagId: 'rag-02',
    title: '限界上下文与聚合根边界约定',
    docType: '架构图',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://ARCH/ARCH-24-007（架构评审纪要）',
    stageId: 'st-arch',
    stageName: '架构设计',
    relatedIds: ['REQ-2405', 'TASK-2415', 'BUG-1046'],
    version: 'v1.3',
    isBaseline: true,
    format: 'md',
    sizeKb: 214,
    pageCount: null,
    chunks: 74,
    tokensK: 38,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 6,
    imageCount: 2,
    codeBlockCount: 0,
    graphNodeIds: ['KG-01', 'KG-02', 'KG-03', 'KG-04', 'KG-05'],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-yan'],
    createdBy: 'u-yan',
    createdAt: '2026-02-11 14:36',
    updatedAt: '2026-03-13',
    lastArchivedAt: '2026-03-17 20:44',
    hitCount30d: 246,
    citedByAgents: ['ag-arch', 'ag-code', 'ag-review'],
    citationCount: 96,
    feedbackScore: 4.6,
    staleness: { lastVerifiedAt: '2026-03-13', verifyCycleDays: 90, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'brand',
    summary: '把单体 order-service 拆为订单 / 履约 / 优惠三个限界上下文，逐一列出各上下文的聚合根、不变式与跨上下文协作方式（只允许领域事件，不允许直接引用领域层类型）。第 2.1 节的三条订单聚合根不变式是 BUG-1046 并发取消重复流水问题的判定基准。',
  },
  {
    id: 'KD-03',
    spaceId: 'KS-01',
    legacyKbId: 'KB-SEC-02',
    legacyRagId: 'rag-08',
    title: '数据脱敏与合规出域规范',
    docType: '验收标准',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://SEC/SEC-MASK-2.1',
    stageId: 'st-arch',
    stageName: '架构设计',
    relatedIds: ['REQ-2408', 'TASK-2423', 'BUG-1054'],
    version: 'v2.1',
    isBaseline: true,
    format: 'pdf',
    sizeKb: 268,
    pageCount: 28,
    chunks: 108,
    tokensK: 52,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 9,
    imageCount: 0,
    codeBlockCount: 0,
    graphNodeIds: [],
    accessLevel: 'restricted',
    redacted: true,
    redactedFields: ['receiverPhone', 'buyerIdCard'],
    ownerIds: ['u-lin'],
    createdBy: 'u-lin',
    createdAt: '2026-01-19 09:40',
    updatedAt: '2026-03-15',
    lastArchivedAt: '2026-03-15 02:02',
    hitCount30d: 204,
    citedByAgents: ['ag-code', 'ag-review', 'ag-test', 'ag-ops'],
    citationCount: 74,
    feedbackScore: 4.5,
    staleness: { lastVerifiedAt: '2026-03-15', verifyCycleDays: 60, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'danger',
    summary: '规定 8 类敏感字段的脱敏策略与出域边界，与 EGRESS-ALLOW / MASK / DENY 三档策略一一对应；文档内的样例手机号与身份证号在入库时已按 rd-01 / rd-02 二次掩码。BUG-1054（导出 CSV 中 addressDetail 明文）即违反本规范第 4.2 条。',
  },
  {
    id: 'KD-04',
    spaceId: 'KS-01',
    legacyKbId: 'KB-SEC-02',
    legacyRagId: 'rag-09',
    title: '审计日志与权限最小化规范',
    docType: '验收标准',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://SEC/SEC-AUDIT-1.4',
    stageId: 'st-arch',
    stageName: '架构设计',
    relatedIds: ['REQ-2408', 'TASK-2424', 'BUG-1052'],
    version: 'v1.4',
    isBaseline: true,
    format: 'pdf',
    sizeKb: 176,
    pageCount: 22,
    chunks: 76,
    tokensK: 36,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'indexing',
    parseStatus: 'ocr-pending',
    ocrRequired: true,
    tableCount: 11,
    imageCount: 3,
    codeBlockCount: 0,
    graphNodeIds: [],
    accessLevel: 'restricted',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-lin'],
    createdBy: 'u-lin',
    createdAt: '2026-02-02 11:08',
    updatedAt: '2026-03-16',
    lastArchivedAt: '2026-03-16 09:40',
    hitCount30d: 142,
    citedByAgents: ['ag-review', 'ag-ops', 'ag-code'],
    citationCount: 52,
    feedbackScore: 4.2,
    staleness: { lastVerifiedAt: '2026-03-16', verifyCycleDays: 60, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'danger',
    summary: '定义审计事件的必填字段、留存周期（≥ 180 天）与 RBAC 最小权限矩阵，要求所有二次授权操作留痕。文档含 3 张权限矩阵截图待 OCR，故整体状态为 indexing；BUG-1052（导出接口无审计留痕）的整改验收即以本规范第 3 章为准。',
  },
  {
    id: 'KD-05',
    spaceId: 'KS-02',
    legacyKbId: 'KB-BS-2401',
    legacyRagId: 'rag-10',
    title: '订单业务术语与领域词汇表',
    docType: 'PRD',
    sourceSystem: '飞书文档',
    sourceRef: 'feishu://docx/产品中心业务词典 v1.2',
    stageId: 'st-req',
    stageName: '需求澄清',
    relatedIds: ['REQ-2403', 'REQ-2405'],
    version: 'v1.2',
    isBaseline: true,
    format: 'md',
    sizeKb: 132,
    pageCount: null,
    chunks: 64,
    tokensK: 28,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 4,
    imageCount: 0,
    codeBlockCount: 0,
    graphNodeIds: [],
    accessLevel: 'public',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-su'],
    createdBy: 'u-su',
    createdAt: '2026-01-26 15:02',
    updatedAt: '2026-03-06',
    lastArchivedAt: '2026-03-06 15:22',
    hitCount30d: 188,
    citedByAgents: ['ag-pm', 'ag-arch', 'ag-test'],
    citationCount: 71,
    feedbackScore: 4.4,
    staleness: { lastVerifiedAt: '2026-03-06', verifyCycleDays: 90, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'ai',
    summary: '统一「试算 / 核销 / 分摊 / 拆单 / 合单 / 基因分片」等 96 个订单域术语的中文定义与英文字段名映射，并给出同义词表。该同义词表是修复 BUG-1043「RAG 检索关键词未命中」问题的基础设施，ag-pm 在 Brainstorm 阶段用它消除业务方口述与系统字段的歧义。',
  },
  {
    id: 'KD-06',
    spaceId: 'KS-03',
    legacyKbId: 'KB-CODE-02',
    legacyRagId: 'rag-03',
    title: 'Java 编码规约与异常处理约定',
    docType: '代码',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://DEV/研发规范库 v3.2',
    stageId: 'st-code',
    stageName: '编码实现',
    relatedIds: ['TASK-2401', 'TASK-2403', 'BUG-1045'],
    version: 'v3.2',
    isBaseline: true,
    format: 'md',
    sizeKb: 392,
    pageCount: null,
    chunks: 152,
    tokensK: 76,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 8,
    imageCount: 0,
    codeBlockCount: 26,
    graphNodeIds: [],
    accessLevel: 'public',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-zhou'],
    createdBy: 'u-zhou',
    createdAt: '2025-12-14 09:12',
    updatedAt: '2026-03-08',
    lastArchivedAt: '2026-03-08 02:00',
    hitCount30d: 612,
    citedByAgents: ['ag-code', 'ag-review', 'ag-test'],
    citationCount: 246,
    feedbackScore: 4.8,
    staleness: { lastVerifiedAt: '2026-03-08', verifyCycleDays: 90, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'info',
    summary: '全库命中最高的知识文档（近 30 日 612 次），覆盖命名、异常分层、事务边界、日志与并发五大约束。第 4.3 节「事务边界与补偿」明确要求跨服务调用不得包裹本地事务、补偿必须携带 compensationId 且幂等，是 BUG-1045 事务半提交问题的规约依据。',
  },
  {
    id: 'KD-07',
    spaceId: 'KS-03',
    legacyKbId: 'KB-CODE-05',
    legacyRagId: 'rag-04',
    title: '前端 Vue3 组件规范与性能约定',
    docType: '代码',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://FE/前端规范库 v2.4',
    stageId: 'st-code',
    stageName: '编码实现',
    relatedIds: ['TASK-2414', 'REQ-2404'],
    version: 'v2.4',
    isBaseline: false,
    format: 'md',
    sizeKb: 306,
    pageCount: null,
    chunks: 118,
    tokensK: 58,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 5,
    imageCount: 2,
    codeBlockCount: 34,
    graphNodeIds: [],
    accessLevel: 'public',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-chen'],
    createdBy: 'u-chen',
    createdAt: '2026-01-12 16:44',
    updatedAt: '2026-03-11',
    lastArchivedAt: '2026-03-11 02:00',
    hitCount30d: 284,
    citedByAgents: ['ag-code', 'ag-review'],
    citationCount: 108,
    feedbackScore: 4.1,
    staleness: {
      lastVerifiedAt: '2025-12-19',
      verifyCycleDays: 90,
      isStale: true,
      staleReason: '前端规范库已发布 v2.5（新增 Pinia 状态持久化与长列表虚拟滚动约定），本文档仍为 v2.4；90 天复核周期已超期 12 天，v2.5 尚未入库，检索时对本文档施加 0.8 降权。',
    },
    supersededBy: null,
    tone: 'teal',
    summary: '约定订单列表页的组件拆分粒度、Pinia store 命名、请求去重与首屏性能门槛（LCP ≤ 2.0s）。与 KD-15 中 API-03 的游标分页契约配套使用：前端不得再按 offset 实现无限滚动，需改为 cursor 透传。',
  },
  {
    id: 'KD-08',
    spaceId: 'KS-03',
    legacyKbId: 'KB-CODE-02',
    legacyRagId: 'rag-11',
    title: '金额精度与 BigDecimal 使用规范',
    docType: '代码',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://DEV/研发规范库 v3.2 附录 C',
    stageId: 'st-code',
    stageName: '编码实现',
    relatedIds: ['BUG-1043', 'REQ-2403', 'TASK-2409'],
    version: 'v3.2-C',
    isBaseline: false,
    format: 'md',
    sizeKb: 98,
    pageCount: null,
    chunks: 42,
    tokensK: 19,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'stale',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 3,
    imageCount: 0,
    codeBlockCount: 12,
    graphNodeIds: ['KG-10', 'KG-18'],
    accessLevel: 'public',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-zhou'],
    createdBy: 'u-zhou',
    createdAt: '2026-01-30 10:05',
    updatedAt: '2026-03-17',
    lastArchivedAt: '2026-03-17 20:44',
    hitCount30d: 96,
    citedByAgents: ['ag-review', 'ag-test', 'ag-code'],
    citationCount: 34,
    feedbackScore: 3.6,
    staleness: {
      lastVerifiedAt: '2026-01-16',
      verifyCycleDays: 60,
      isStale: true,
      staleReason: '研发规范库 v3.3 已把金额计算条款并入正文第 5 章并补充「退款场景负向分摊的余数方向」规则（正是 MR-2410 剩余 1 条 must-fix），本附录 C 停止维护且未覆盖该场景；向量索引仍为 v3.2 内容，检索时按 0.6 权重降权。',
    },
    supersededBy: null,
    tone: 'info',
    summary: '第 3.2 节规定多行金额分摊必须用最大余额法回填余数、BigDecimal 除法必须显式指定 scale 与 RoundingMode。BUG-1043 的五问法第 3 层直接指向本条规约，第 4 层则暴露出「该规约未被纳入 AI 提示词上下文」的检索缺口。',
  },
  {
    id: 'KD-09',
    spaceId: 'KS-04',
    legacyKbId: 'KB-TEST-03',
    legacyRagId: 'rag-07',
    title: '接口自动化与用例设计规范',
    docType: '用例执行结果',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://QA/测试中心规范库 v2.6',
    stageId: 'st-test',
    stageName: '测试验证',
    relatedIds: ['REQ-2401', 'REQ-2404', 'TASK-2403'],
    version: 'v2.6',
    isBaseline: true,
    format: 'md',
    sizeKb: 348,
    pageCount: null,
    chunks: 132,
    tokensK: 64,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 14,
    imageCount: 1,
    codeBlockCount: 18,
    graphNodeIds: [],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-he'],
    createdBy: 'u-he',
    createdAt: '2026-01-22 14:18',
    updatedAt: '2026-03-14',
    lastArchivedAt: '2026-03-15 02:02',
    hitCount30d: 342,
    citedByAgents: ['ag-test', 'ag-code', 'ag-review'],
    citationCount: 132,
    feedbackScore: 4.5,
    staleness: { lastVerifiedAt: '2026-03-14', verifyCycleDays: 90, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'teal',
    summary: '规定用例分层（冒烟 / 主链路 / 异常 / 并发 / 安全合规）、断言粒度与数据构造规范，并强制要求每个接口契约至少覆盖 1 条异常回滚用例。本迭代 94 条未执行用例中有 28 条属安全合规模块，正是违反本规范第 6 章「合规用例前置」要求的结果。',
  },
  {
    id: 'KD-10',
    spaceId: 'KS-05',
    legacyKbId: 'KB-OPS-01',
    legacyRagId: 'rag-05',
    title: '生产发布与灰度回滚手册',
    docType: '回滚预案',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://SRE/发布规范 v4.1',
    stageId: 'st-deploy',
    stageName: '部署发布',
    relatedIds: ['REL-2401', 'REL-2402', 'REL-2403', 'TASK-2421'],
    version: 'v4.1',
    isBaseline: true,
    format: 'pdf',
    sizeKb: 246,
    pageCount: 36,
    chunks: 96,
    tokensK: 47,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 7,
    imageCount: 3,
    codeBlockCount: 0,
    graphNodeIds: [],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-meng'],
    createdBy: 'u-meng',
    createdAt: '2025-12-28 11:30',
    updatedAt: '2026-03-09',
    lastArchivedAt: '2026-03-09 02:00',
    hitCount30d: 198,
    citedByAgents: ['ag-ops', 'ag-ba'],
    citationCount: 76,
    feedbackScore: 4.6,
    staleness: { lastVerifiedAt: '2026-03-09', verifyCycleDays: 90, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'warn',
    summary: '定义六道发布门禁、灰度批次节奏（1% → 10% → 50% → 100%）、每批观察时长与出口准则，以及 RTO 分级要求。ag-ops 在 at-05 轨迹中依据本手册第 5 章判定 REL-2403 的 4 个批次全部不满足入口准则，输出「保持 blocked」结论。',
  },
  {
    id: 'KD-11',
    spaceId: 'KS-06',
    legacyKbId: 'KB-OPS-01',
    legacyRagId: 'rag-06',
    title: '可观测性与告警处置手册',
    docType: '告警事件',
    sourceSystem: 'Confluence',
    sourceRef: 'confluence://SRE/观测规范 v2.0',
    stageId: 'st-observe',
    stageName: '运维观测',
    relatedIds: ['BUG-1047', 'BUG-1053', 'REQ-2404'],
    version: 'v2.0',
    isBaseline: true,
    format: 'md',
    sizeKb: 218,
    pageCount: null,
    chunks: 84,
    tokensK: 41,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 10,
    imageCount: 5,
    codeBlockCount: 0,
    graphNodeIds: [],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-meng'],
    createdBy: 'u-meng',
    createdAt: '2026-02-06 09:55',
    updatedAt: '2026-03-12',
    lastArchivedAt: '2026-03-12 02:00',
    hitCount30d: 156,
    citedByAgents: ['ag-ba', 'ag-ops'],
    citationCount: 58,
    feedbackScore: 4.3,
    staleness: { lastVerifiedAt: '2026-03-12', verifyCycleDays: 90, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'warn',
    summary: '规定指标 / 日志 / 链路三支柱的采集口径、告警分级与值班响应时限，并附 12 类常见故障的处置 SOP。按内容主题归入「事故与根因」空间（legacyKbId 仍保留 KB-OPS-01）；BUG-1053 老年代线性增长的排查即参照本手册第 7 章 JVM 类故障 SOP。',
  },
  {
    id: 'KD-12',
    spaceId: 'KS-02',
    legacyKbId: null,
    legacyRagId: null,
    title: '订单中心重构 PRD v2.3 基线',
    docType: 'PRD',
    sourceSystem: '平台自动归档',
    sourceRef: 'PRD-ORD-v2.3 / PingCode PC-ORD-1024',
    stageId: 'st-req',
    stageName: '需求澄清',
    relatedIds: ['REQ-2401', 'REQ-2402', 'REQ-2405', 'REQ-2408'],
    version: 'v2.3',
    isBaseline: true,
    format: 'md',
    sizeKb: 612,
    pageCount: null,
    chunks: 214,
    tokensK: 118,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 18,
    imageCount: 2,
    codeBlockCount: 0,
    graphNodeIds: ['KG-05', 'KG-06'],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-su', 'u-lin'],
    createdBy: 'ai',
    createdAt: '2026-03-11 11:02',
    updatedAt: '2026-03-11',
    lastArchivedAt: '2026-03-11 11:07',
    hitCount30d: 312,
    citedByAgents: ['ag-arch', 'ag-code', 'ag-test', 'ag-pm'],
    citationCount: 124,
    feedbackScore: 4.7,
    staleness: { lastVerifiedAt: '2026-03-11', verifyCycleDays: 30, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'ai',
    summary: 'G1 通过后由 KA-01 规则在 5 秒内自动入库的基线 PRD，含 8 条需求、14 条用户故事、全部验收标准与合规要求，字数 13460、AI 生成占比 44%。第 5.1.2 节的幂等键两级校验规则（网关 Redis 一级 + 幂等表唯一索引二级）是 ag-code 实现 TASK-2401 的直接输入。',
  },
  {
    id: 'KD-13',
    spaceId: 'KS-02',
    legacyKbId: null,
    legacyRagId: null,
    title: '用户故事 US-01~US-14 与验收标准集',
    docType: '用户故事',
    sourceSystem: '平台自动归档',
    sourceRef: 'PRD-ORD-v2.3 第 6 章 / PingCode PC-ORD-1024~1073',
    stageId: 'st-req',
    stageName: '需求澄清',
    relatedIds: ['REQ-2401', 'REQ-2402', 'REQ-2403', 'REQ-2407'],
    version: 'v2.3',
    isBaseline: true,
    format: 'md',
    sizeKb: 288,
    pageCount: null,
    chunks: 96,
    tokensK: 54,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 14,
    imageCount: 0,
    codeBlockCount: 0,
    graphNodeIds: ['KG-09'],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-su'],
    createdBy: 'ai',
    createdAt: '2026-03-11 11:02',
    updatedAt: '2026-03-11',
    lastArchivedAt: '2026-03-11 11:07',
    hitCount30d: 186,
    citedByAgents: ['ag-test', 'ag-arch', 'ag-code'],
    citationCount: 72,
    feedbackScore: 4.5,
    staleness: { lastVerifiedAt: '2026-03-11', verifyCycleDays: 30, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'ai',
    summary: '14 条用户故事全部补齐 Given-When-Then 验收标准，按 US 编号独立切片。US-03（库存扣减失败补偿）明确了「CREATING 超 5 秒自动释放优惠券、回滚积分、置 CLOSED 并投递 order.closed 事件」的补偿语义，是 ag-test 生成异常回滚用例的黄金样本。',
  },
  {
    id: 'KD-14',
    spaceId: 'KS-01',
    legacyKbId: null,
    legacyRagId: null,
    title: '订单中心四层架构视图与限界上下文划分（G2 冻结版）',
    docType: '架构图',
    sourceSystem: '平台自动归档',
    sourceRef: '架构画布导出 / ARCH-24-007',
    stageId: 'st-arch',
    stageName: '架构设计',
    relatedIds: ['REQ-2404', 'REQ-2405', 'TASK-2413', 'TASK-2415'],
    version: 'v2.0',
    isBaseline: true,
    format: 'html',
    sizeKb: 1284,
    pageCount: 24,
    chunks: 88,
    tokensK: 46,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: true,
    tableCount: 8,
    imageCount: 6,
    codeBlockCount: 0,
    graphNodeIds: ['KG-01', 'KG-02', 'KG-03', 'KG-04', 'KG-07', 'KG-11', 'KG-12', 'KG-14'],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-yan'],
    createdBy: 'ai',
    createdAt: '2026-03-13 17:18',
    updatedAt: '2026-03-13',
    lastArchivedAt: '2026-03-13 17:26',
    hitCount30d: 268,
    citedByAgents: ['ag-arch', 'ag-code', 'ag-review', 'ag-ba'],
    citationCount: 104,
    feedbackScore: 4.8,
    staleness: { lastVerifiedAt: '2026-03-13', verifyCycleDays: 30, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'brand',
    summary: 'G2 门禁通过后自动导出的架构画布快照，14 个组件与 ARCH_COMPONENTS 的 id 双向对齐，6 张图中 2 张位图已 OCR 还原。本档是知识图谱实体链接的权威来源：18 个图谱节点里有 8 个由此文档首次抽取，包括基因分片路由（KG-12）与三个限界上下文。',
  },
  {
    id: 'KD-15',
    spaceId: 'KS-01',
    legacyKbId: null,
    legacyRagId: null,
    title: '订单中心 14 份接口契约集（OpenAPI 3.1）',
    docType: '接口契约',
    sourceSystem: 'GitLab',
    sourceRef: 'gitlab://trade/order-api/-/blob/release/24.3/openapi.yaml',
    stageId: 'st-arch',
    stageName: '架构设计',
    relatedIds: ['TASK-2401', 'TASK-2413', 'TASK-2414', 'BUG-1047'],
    version: 'v2.0',
    isBaseline: true,
    format: 'yaml',
    sizeKb: 742,
    pageCount: null,
    chunks: 164,
    tokensK: 82,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 4,
    imageCount: 0,
    codeBlockCount: 14,
    graphNodeIds: ['KG-06', 'KG-08', 'KG-15', 'KG-16', 'KG-17'],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-yan', 'u-zhou'],
    createdBy: 'ai',
    createdAt: '2026-03-13 17:18',
    updatedAt: '2026-03-16',
    lastArchivedAt: '2026-03-13 17:26',
    hitCount30d: 394,
    citedByAgents: ['ag-code', 'ag-test', 'ag-review', 'ag-arch'],
    citationCount: 158,
    feedbackScore: 4.6,
    staleness: { lastVerifiedAt: '2026-03-16', verifyCycleDays: 30, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'brand',
    summary: '按 operationId 逐接口切片的契约集，含 12 个 REST 与 2 个 EVENT 契约、每份契约的 P99/TPS 承诺与错误码表。API-03 切片明确记录了「废弃 offset 分页、改游标分页、P95 承诺 200ms」，与实测 342ms 的偏差正是 BUG-1047 的契约级判据。',
  },
  {
    id: 'KD-16',
    spaceId: 'KS-01',
    legacyKbId: null,
    legacyRagId: null,
    title: 'Sprint 24 开发任务拆解快照（TASK-2401~TASK-2424）',
    docType: '任务清单',
    sourceSystem: 'PingCode',
    sourceRef: 'pingcode://PC-ORD-2401~2424（每日 08:00 增量同步）',
    stageId: 'st-arch',
    stageName: '架构设计',
    relatedIds: ['TASK-2401', 'TASK-2413', 'TASK-2419', 'TASK-2421'],
    version: 'SP-24',
    isBaseline: false,
    format: 'json',
    sizeKb: 196,
    pageCount: null,
    chunks: 72,
    tokensK: 34,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 24,
    imageCount: 0,
    codeBlockCount: 0,
    graphNodeIds: ['KG-13'],
    accessLevel: 'internal',
    redacted: false,
    redactedFields: [],
    ownerIds: ['u-gu'],
    createdBy: 'ai',
    createdAt: '2026-03-13 17:18',
    updatedAt: '2026-03-19',
    lastArchivedAt: '2026-03-19 08:00',
    hitCount30d: 122,
    citedByAgents: ['ag-pm', 'ag-arch', 'ag-code'],
    citationCount: 46,
    feedbackScore: 4.0,
    staleness: { lastVerifiedAt: '2026-03-19', verifyCycleDays: 7, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'info',
    summary: '24 个开发任务按任务卡逐行切片，含 reqId、依赖关系、关键路径标记与负责人负载。ag-pm 用它做排期冲突识别（如 GANTT-CF-03 周浩然日负载 13.5 小时），ag-arch 用它在评审时反查任务是否偏离原始拆解意图。',
  },
  {
    id: 'KD-17',
    spaceId: 'KS-03',
    legacyKbId: null,
    legacyRagId: null,
    title: '已合入 MR 变更集、单元测试与评审记录（MR-2402 / 2413 / 2417 / 2418）',
    docType: '代码',
    sourceSystem: 'GitLab',
    sourceRef: 'gitlab://trade/order-api/-/merge_requests/2413（commit 4e6a918）',
    stageId: 'st-code',
    stageName: '编码实现',
    relatedIds: ['TASK-2401', 'TASK-2403', 'TASK-2413', 'BUG-1043', 'BUG-1045'],
    version: 'release/24.3',
    isBaseline: false,
    format: 'code',
    sizeKb: 3860,
    pageCount: null,
    chunks: 246,
    tokensK: 132,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'indexing',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 2,
    imageCount: 0,
    codeBlockCount: 68,
    graphNodeIds: ['KG-06', 'KG-12'],
    accessLevel: 'restricted',
    redacted: true,
    redactedFields: ['receiverPhone', 'receiverAddress', 'accessToken'],
    ownerIds: ['u-zhou', 'u-shen'],
    createdBy: 'ai',
    createdAt: '2026-03-19 16:22',
    updatedAt: '2026-03-19',
    lastArchivedAt: '2026-03-19 17:06',
    hitCount30d: 158,
    citedByAgents: ['ag-code', 'ag-review', 'ag-test'],
    citationCount: 62,
    feedbackScore: 4.4,
    staleness: { lastVerifiedAt: '2026-03-19', verifyCycleDays: 7, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'info',
    summary: '按语法块切片的代码归档包，含 OrderIdShardRouter 基因分片路由、outbox 中继指数退避与看门狗续期实现及其单测；测试夹具中的手机号、收货地址与访问令牌已按 rd-01/rd-03/rd-08 脱敏。首次入库（KI-07）因向量化超时失败，正由 KI-08 死信重放，当前状态 indexing（已产出 28/246 切片）。',
  },
  {
    id: 'KD-18',
    spaceId: 'KS-04',
    legacyKbId: null,
    legacyRagId: null,
    title: 'Sprint 24 测试报告 TR-24（含 248 条用例执行结果与 12 个缺陷汇总）',
    docType: '测试报告',
    sourceSystem: '平台自动归档',
    sourceRef: 'TR-24 v0.9-draft / G4 门禁判定 failed',
    stageId: 'st-test',
    stageName: '测试验证',
    relatedIds: ['REQ-2404', 'BUG-1043', 'BUG-1045', 'BUG-1047', 'TASK-2403', 'REL-2403'],
    version: 'v0.9-draft',
    isBaseline: false,
    format: 'html',
    sizeKb: 924,
    pageCount: 42,
    chunks: 158,
    tokensK: 79,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 22,
    imageCount: 4,
    codeBlockCount: 0,
    graphNodeIds: ['KG-17', 'KG-18'],
    accessLevel: 'internal',
    redacted: true,
    redactedFields: ['receiverPhone', 'receiverName'],
    ownerIds: ['u-he'],
    createdBy: 'u-he',
    createdAt: '2026-03-19 17:05',
    updatedAt: '2026-03-19',
    lastArchivedAt: '2026-03-19 17:09',
    hitCount30d: 276,
    citedByAgents: ['ag-test', 'ag-ops', 'ag-review', 'ag-ba', 'ag-pm'],
    citationCount: 110,
    feedbackScore: 4.3,
    staleness: { lastVerifiedAt: '2026-03-19', verifyCycleDays: 7, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'warn',
    summary: '未签发（G4 failed）但已入库并标注状态的测试报告：用例执行率 62.1%（154/248）、通过率 85.7%、增量覆盖率 82.6%、分支覆盖率 71.4% 未达 85% 门槛，P0 未关闭 4 个、压测峰值 2400 TPS 未达 3000 目标。第 4 章缺陷分布表按 table-row 切片，是 ag-test 反向补齐 12 个异常回滚用例的输入。',
  },
  {
    id: 'KD-19',
    spaceId: 'KS-05',
    legacyKbId: null,
    legacyRagId: null,
    title: 'REL-2403 生产发布归档包：发布记录、灰度批次与回滚预案',
    docType: '发布记录',
    sourceSystem: '平台自动归档',
    sourceRef: 'REL-2403 / PIPE-2410 预检报告',
    stageId: 'st-deploy',
    stageName: '部署发布',
    relatedIds: ['REL-2401', 'REL-2402', 'REL-2403', 'TASK-2421', 'BUG-1053'],
    version: 'REL-2403-r2',
    isBaseline: false,
    format: 'pdf',
    sizeKb: 1580,
    pageCount: 18,
    chunks: 104,
    tokensK: 52,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: true,
    tableCount: 6,
    imageCount: 3,
    codeBlockCount: 0,
    graphNodeIds: [],
    accessLevel: 'confidential',
    redacted: true,
    redactedFields: ['accessToken'],
    ownerIds: ['u-meng'],
    createdBy: 'ai',
    createdAt: '2026-03-19 15:36',
    updatedAt: '2026-03-19',
    lastArchivedAt: '2026-03-19 15:43',
    hitCount30d: 143,
    citedByAgents: ['ag-ops', 'ag-ba', 'ag-review'],
    citationCount: 54,
    feedbackScore: 4.2,
    staleness: { lastVerifiedAt: '2026-03-19', verifyCycleDays: 30, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'warn',
    summary: '三份发布单（REL-2401 已发布 / REL-2402 已发布 / REL-2403 blocked）的批次计划、观察窗口出入口准则与一键回切脚本说明，3 页灰度批次截图已 OCR。REL-2402 批次 2 的资损告警观察记录被 ag-ba 用作 REL-2403 的风险预判证据；实例 IP 与连接串按 rd-08 脱敏。',
  },
  {
    id: 'KD-20',
    spaceId: 'KS-06',
    legacyKbId: null,
    legacyRagId: null,
    title: '根因分析报告归档包 · BA-1043 / BA-1047（含告警时间线与预防项）',
    docType: '根因报告',
    sourceSystem: '平台自动归档',
    sourceRef: 'docs/bug/BUG-1043-analysis.md（v1.3，approved）',
    stageId: 'st-observe',
    stageName: '运维观测',
    relatedIds: ['BUG-1043', 'BUG-1045', 'BUG-1047', 'TASK-2403', 'TASK-2409'],
    version: 'v1.3',
    isBaseline: true,
    format: 'md',
    sizeKb: 688,
    pageCount: null,
    chunks: 132,
    tokensK: 71,
    embedModel: 'bge-large-zh-v1.5',
    embedStatus: 'ready',
    parseStatus: 'parsed',
    ocrRequired: false,
    tableCount: 9,
    imageCount: 2,
    codeBlockCount: 8,
    graphNodeIds: ['KG-08', 'KG-09', 'KG-10', 'KG-18'],
    accessLevel: 'restricted',
    redacted: true,
    redactedFields: ['payCardNo', 'receiverAddress'],
    ownerIds: ['u-zhou', 'u-meng'],
    createdBy: 'ai',
    createdAt: '2026-03-17 20:15',
    updatedAt: '2026-03-18',
    lastArchivedAt: '2026-03-18 09:17',
    hitCount30d: 231,
    citedByAgents: ['ag-ba', 'ag-test', 'ag-review', 'ag-code', 'ag-arch'],
    citationCount: 89,
    feedbackScore: 4.9,
    staleness: { lastVerifiedAt: '2026-03-18', verifyCycleDays: 30, isStale: false, staleReason: null },
    supersededBy: null,
    tone: 'danger',
    summary: '仅收录 status=approved 的两份 RCA：BA-1043（优惠分摊尾差，置信度 94%，五问法直指「最大余额法缺失」与「KB-CODE-02 未进入 AI 上下文」）与 BA-1047（跨分片深分页 P95 342ms）。第 2 章为告警事件时间线，第 5 章为预防项（技术债候选），BA-1045 待复核通过后追加。',
  },
];

/** 知识切片定义（切片详情抽屉的样本切片） */
export interface KbChunkDef {
  id: string;
  docId: string;
  chunkIndex: number;
  /** 与所属文档的 chunkStrategy 一致 */
  strategy: 'heading' | 'semantic' | 'fixed' | 'table-row' | 'code-block';
  /** 层级标题路径 */
  headingPath: string[];
  /** 切片正文 */
  content: string;
  charCount: number;
  tokenCount: number;
  embedding: { model: string; dim: number; norm: number };
  hasTable: boolean;
  hasCode: boolean;
  codeLang: string | null;
  /** 抽取出的实体 */
  entities: string[];
  relations: { from: string; to: string; type: string }[];
  position: { page: number | null; section: string; offset: number };
  retrievedCount30d: number;
  lastRetrievedAt: string;
  qualityFlag: 'ok' | 'noisy' | 'too-short' | 'duplicate';
  tone: Tone;
}

/**
 * 14 条样本切片（KC-01~KC-14），覆盖 12 篇文档，供「切片详情」抽屉展示。
 * tokenCount 口径：bge-large-zh-v1.5 中文约 1 token ≈ 1.6 字，故 tokenCount ≈ charCount ÷ 1.6；
 * 样本切片偏向小粒度语义切片，文档级平均切片长度为 tokensK × 1000 ÷ chunks（KD-01 约 495 token）。
 */
export const KB_CHUNKS: KbChunkDef[] = [
  {
    id: 'KC-01',
    docId: 'KD-01',
    chunkIndex: 12,
    strategy: 'heading',
    headingPath: ['第 3 章 架构设计', '3.2 限界上下文', '3.2.1 订单上下文'],
    content: '订单上下文承接下单、取消、查询与状态推进，聚合根为 Order，唯一标识 orderId 采用基因分片编码：低 10 位取自 buyerId 后 10 位的哈希，保证同一买家的订单恒定落在同一分片。上下文对外仅暴露应用服务接口，领域层不得被履约、优惠上下文直接引用；跨上下文协作一律通过领域事件（order.created / order.paid / order.closed）在 RabbitMQ 上异步完成，禁止跨库事务。',
    charCount: 214,
    tokenCount: 134,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['订单上下文', '订单聚合根', '基因分片', '领域事件', 'RabbitMQ'],
    relations: [
      { from: '订单上下文', to: '订单聚合根', type: '包含' },
      { from: '订单上下文', to: 'RabbitMQ', type: '调用' },
    ],
    position: { page: null, section: '3.2.1', offset: 4180 },
    retrievedCount30d: 74,
    lastRetrievedAt: '2026-03-19 15:08',
    qualityFlag: 'ok',
    tone: 'brand',
  },
  {
    id: 'KC-02',
    docId: 'KD-01',
    chunkIndex: 18,
    strategy: 'heading',
    headingPath: ['第 3 章 架构设计', '3.3 分层依赖规则'],
    content: '分层依赖只能自上而下：接入层（L1）可依赖应用服务层（L2），L2 可依赖领域层（L3），L3 仅依赖基础设施层（L4）的抽象接口。禁止 L1 直接调用 L3 的聚合根方法，禁止 L4 反向引用 L2 / L3 的任何类型。违反该规则的代码在 G3 门禁的 ArchUnit 检查中会被直接判为 must-fix；本迭代 MR-2410 曾因 OrderController 直接注入 OrderAggregate 被判失败并重做。',
    charCount: 216,
    tokenCount: 135,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['接入层', '应用服务层', '领域层', '基础设施层', 'ArchUnit', 'G3 门禁'],
    relations: [
      { from: '接入层', to: '应用服务层', type: '依赖' },
      { from: '领域层', to: '基础设施层', type: '依赖' },
    ],
    position: { page: null, section: '3.3', offset: 6020 },
    retrievedCount30d: 68,
    lastRetrievedAt: '2026-03-19 16:18',
    qualityFlag: 'ok',
    tone: 'brand',
  },
  {
    id: 'KC-03',
    docId: 'KD-02',
    chunkIndex: 5,
    strategy: 'semantic',
    headingPath: ['第 2 章 聚合根边界', '2.1 订单聚合根不变式'],
    content: 'Order 聚合根维护三条不变式：其一，订单总额等于明细金额之和减去优惠分摊之和，任一条不成立即拒绝持久化；其二，状态流转必须经 OrderStateMachine 校验，禁止直接 setStatus；其三，同一 orderId 的写操作必须携带版本号走乐观锁。聚合内包含 OrderItem、PromotionDetail、PaymentRef 三类实体；履约单与发票不属于本聚合，由履约上下文自行建模，通过 order.paid 事件驱动。',
    charCount: 222,
    tokenCount: 139,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['订单聚合根', '状态机', '乐观锁', '优惠分摊', '履约上下文'],
    relations: [
      { from: '订单聚合根', to: '状态机', type: '包含' },
      { from: '履约上下文', to: '订单聚合根', type: '派生自' },
    ],
    position: { page: null, section: '2.1', offset: 1240 },
    retrievedCount30d: 61,
    lastRetrievedAt: '2026-03-18 17:44',
    qualityFlag: 'ok',
    tone: 'brand',
  },
  {
    id: 'KC-04',
    docId: 'KD-06',
    chunkIndex: 34,
    strategy: 'code-block',
    headingPath: ['第 4 章 异常处理', '4.3 事务边界与补偿'],
    content: '事务边界必须收敛在应用服务层，领域层方法不得标注 @Transactional。跨服务调用（库存扣减、优惠核销）不得包裹在本地事务内，应采用本地消息表加定时中继实现最终一致；补偿逻辑必须显式声明 compensationId 并保证幂等，重试采用指数退避且最多 5 次，超限转死信并告警。捕获异常后禁止吞掉堆栈，业务异常统一继承 BizException 并携带错误码，系统异常必须在 3 秒内触发告警。',
    charCount: 202,
    tokenCount: 126,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['事务边界', '本地消息表', '补偿', '幂等键', '死信队列'],
    relations: [
      { from: '本地消息表', to: '补偿', type: '约束' },
      { from: '事务边界', to: '应用服务层', type: '归属于' },
    ],
    position: { page: null, section: '4.3', offset: 8860 },
    retrievedCount30d: 96,
    lastRetrievedAt: '2026-03-19 15:08',
    qualityFlag: 'ok',
    tone: 'info',
  },
  {
    id: 'KC-05',
    docId: 'KD-08',
    chunkIndex: 9,
    strategy: 'code-block',
    headingPath: ['第 3 章 金额计算', '3.2 分摊与余数回填'],
    content: '多行金额分摊禁止逐行独立 setScale。正确做法是最大余额法：先按比例向下取整到分，再把 totalAmount 与已分配之和的差额逐分补给余额最大的行，直至差额为 0。BigDecimal 除法必须显式指定 scale 与 RoundingMode，推荐 divide(divisor, 10, RoundingMode.HALF_UP) 保留中间精度，仅在最终落库时收敛到 2 位。违反本条规约的代码在评审中一律判为 must-fix。',
    charCount: 222,
    tokenCount: 139,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['最大余额法', 'BigDecimal', '优惠分摊', 'RoundingMode', '金额精度缺陷模式'],
    relations: [
      { from: '优惠核销', to: '最大余额法', type: '依赖' },
      { from: '最大余额法', to: '金额精度缺陷模式', type: '约束' },
    ],
    position: { page: null, section: '3.2', offset: 2140 },
    retrievedCount30d: 88,
    lastRetrievedAt: '2026-03-19 16:18',
    qualityFlag: 'ok',
    tone: 'info',
  },
  {
    id: 'KC-06',
    docId: 'KD-12',
    chunkIndex: 41,
    strategy: 'heading',
    headingPath: ['第 5 章 功能需求', '5.1 幂等下单', '5.1.2 幂等键生成规则'],
    content: '幂等键 Idempotency-Key 由调用方生成，长度 32~64 位，允许字符集为 [A-Za-z0-9_-]。服务端做两级校验：一级在 API 网关按 key + buyerId 查 Redis（TTL 24 小时），命中即直接返回首次结果并置响应头 X-Idempotent-Replay: true；二级在幂等守卫按 key 查幂等表唯一索引，防止缓存击穿后的重复写入。同一 key 在 24 小时内重复提交必须返回首次订单号，不得创建新订单。',
    charCount: 228,
    tokenCount: 143,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['幂等键', 'API 网关', '幂等守卫', 'Redis', '创建订单接口'],
    relations: [
      { from: '幂等键', to: '创建订单接口', type: '约束' },
      { from: '幂等守卫', to: 'Redis', type: '调用' },
    ],
    position: { page: null, section: '5.1.2', offset: 7320 },
    retrievedCount30d: 82,
    lastRetrievedAt: '2026-03-18 14:05',
    qualityFlag: 'ok',
    tone: 'ai',
  },
  {
    id: 'KC-07',
    docId: 'KD-13',
    chunkIndex: 8,
    strategy: 'heading',
    headingPath: ['US-03 库存扣减失败补偿', '验收标准'],
    content: 'Given 用户已提交订单且库存服务返回扣减失败，When 订单处于 CREATING 状态超过 5 秒，Then 系统必须自动触发补偿：释放已核销的优惠券、回滚已冻结的积分、将订单状态置为 CLOSED 并写入状态流水，同时向 order.closed 主题投递领域事件。补偿动作必须幂等，重复触发不得产生二次退款或重复发券；补偿超时须生成告警并转人工工单。',
    charCount: 180,
    tokenCount: 113,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['库存扣减', '补偿', '状态机', '优惠券', '领域事件'],
    relations: [
      { from: '库存扣减', to: '状态机', type: '约束' },
      { from: '补偿', to: '优惠券', type: '调用' },
    ],
    position: { page: null, section: 'US-03', offset: 1980 },
    retrievedCount30d: 79,
    lastRetrievedAt: '2026-03-19 15:08',
    qualityFlag: 'ok',
    tone: 'ai',
  },
  {
    id: 'KC-08',
    docId: 'KD-14',
    chunkIndex: 22,
    strategy: 'semantic',
    headingPath: ['第 3 章 架构设计', '3.2 限界上下文', '3.2.3 优惠上下文'],
    content: '优惠上下文从单体 order-service 的 PromotionCalculator 剥离，独立为 promotion-engine，承担规则建模、试算与核销三段能力。规则以互斥组、优先级、分摊策略三元组描述，支持券、满减、会员价、平台立减四类叠加。上下文对订单上下文只暴露 API-07 试算与 API-08 核销两个同步接口，核销结果通过 promotion.redeemed 事件回流，供财务对账与资损监控消费。',
    charCount: 211,
    tokenCount: 132,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['优惠上下文', '优惠核销', 'order-service', '互斥组', '分摊策略'],
    relations: [
      { from: '优惠上下文', to: 'order-service', type: '派生自' },
      { from: '优惠上下文', to: '优惠核销', type: '包含' },
    ],
    position: { page: 9, section: '3.2.3', offset: 3460 },
    retrievedCount30d: 57,
    lastRetrievedAt: '2026-03-18 17:44',
    qualityFlag: 'ok',
    tone: 'brand',
  },
  {
    id: 'KC-09',
    docId: 'KD-15',
    chunkIndex: 3,
    strategy: 'code-block',
    headingPath: ['API-01 创建订单（幂等）', '请求头与幂等语义'],
    content: 'POST /api/v2/orders 必须在请求头携带 Idempotency-Key，缺失时网关直接返回 400 IDEMPOTENCY_KEY_MISSING。响应 200 表示新建成功；200 且响应头 X-Idempotent-Replay: true 表示命中幂等重放，返回体与首次完全一致。契约冻结版本 v2.0，P99 承诺 180ms、单实例 500 TPS，属破坏性变更，下游 12 个系统需在 2026-04-30 前完成适配。',
    charCount: 225,
    tokenCount: 141,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['创建订单接口', '幂等键', '错误码', 'P99', '破坏性变更'],
    relations: [
      { from: '创建订单接口', to: '幂等键', type: '约束' },
      { from: '创建订单接口', to: '订单上下文', type: '实现' },
    ],
    position: { page: null, section: 'API-01', offset: 620 },
    retrievedCount30d: 104,
    lastRetrievedAt: '2026-03-19 15:08',
    qualityFlag: 'ok',
    tone: 'brand',
  },
  {
    id: 'KC-10',
    docId: 'KD-15',
    chunkIndex: 47,
    strategy: 'code-block',
    headingPath: ['API-03 订单列表查询', '分页与游标约束'],
    content: 'GET /api/v2/orders 自 v2.0 起废弃 offset 分页，改为游标分页：请求携带 cursor（Base64 编码的 createTime + orderId 组合）与 limit（上限 100）。跨分片聚合由查询服务在内存中归并，禁止使用 SQL OFFSET 深翻页。契约 P95 承诺 200ms，当前实测 342ms（BUG-1047），治理方案为游标下推至各分片并按 createTime 倒序归并，配合多级缓存层承接热点首页请求。',
    charCount: 232,
    tokenCount: 145,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['订单列表查询接口', '游标分页', '分库分表', '多级缓存层', 'BUG-1047'],
    relations: [
      { from: '订单列表查询接口', to: '分库分表', type: '依赖' },
      { from: '订单列表查询接口', to: '多级缓存层', type: '调用' },
    ],
    position: { page: null, section: 'API-03', offset: 12480 },
    retrievedCount30d: 91,
    lastRetrievedAt: '2026-03-19 11:36',
    qualityFlag: 'ok',
    tone: 'warn',
  },
  {
    id: 'KC-11',
    docId: 'KD-17',
    chunkIndex: 88,
    strategy: 'code-block',
    headingPath: ['MR-2413', 'OrderIdShardRouter 基因分片路由'],
    content: 'public class OrderIdShardRouter { private static final int GENE_BITS = 10; public int route(long orderId) { return (int) (orderId & ((1L << GENE_BITS) - 1)) % SHARD_COUNT; } } 基因位取自 buyerId 后 10 位哈希，同一买家订单单分片命中，双向查询无需广播。压测 12,000 TPS 下 P99 由 210ms 降至 46ms。',
    charCount: 256,
    tokenCount: 160,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: true,
    codeLang: 'java',
    entities: ['基因分片路由', '分库分表', 'OrderIdShardRouter', 'MR-2413'],
    relations: [
      { from: '分库分表', to: '基因分片路由', type: '包含' },
      { from: '基因分片路由', to: '订单聚合根', type: '实现' },
    ],
    position: { page: null, section: 'MR-2413', offset: 26400 },
    retrievedCount30d: 63,
    lastRetrievedAt: '2026-03-19 15:08',
    qualityFlag: 'ok',
    tone: 'info',
  },
  {
    id: 'KC-12',
    docId: 'KD-18',
    chunkIndex: 15,
    strategy: 'table-row',
    headingPath: ['第 4 章 缺陷分析', '4.2 P0 缺陷分布'],
    content: '本轮 4 个未关闭 P0 缺陷分布：BUG-1043 优惠分摊尾差（资损级，fixing，MR-2410 剩 1 条 must-fix）；BUG-1045 下单超时事务半提交（与 G3 覆盖率缺口同源，InventoryDeductService#rollback 分支未实现）；BUG-1046 并发取消产生重复状态流水（MR-2406 已追加乐观锁，待 G3 通过后合并）；BUG-1049 分片键设计导致跨分片聚合（MR-2417 改聚合根哈希串行，等待流水线重跑）。',
    charCount: 237,
    tokenCount: 148,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: true,
    hasCode: false,
    codeLang: null,
    entities: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049', '金额精度缺陷模式', 'G3 门禁'],
    relations: [
      { from: 'BUG-1045', to: '库存扣减', type: '归属于' },
      { from: 'BUG-1043', to: '金额精度缺陷模式', type: '派生自' },
    ],
    position: { page: 18, section: '4.2', offset: 5240 },
    retrievedCount30d: 87,
    lastRetrievedAt: '2026-03-19 17:52',
    qualityFlag: 'ok',
    tone: 'danger',
  },
  {
    id: 'KC-13',
    docId: 'KD-19',
    chunkIndex: 6,
    strategy: 'heading',
    headingPath: ['第 2 章 灰度批次与观察窗口', '2.3 批次 3（50%）入口准则'],
    content: '批次 3 计划于 2026-03-20 23:30 放量至 50%，观察 45 分钟。入口准则：批次 2 通过且值班 DBA 在线；出口准则：新旧集群分片热点均衡度偏差小于 10%、错误率低于 0.05%、P95 不高于 200ms。当前状态 waiting，待确认事项为新分片集群连接池上限（需 DBA 批复 BLOCK-0312）。回滚动作：执行一键回切脚本，DNS 与配置中心双通道同时切回旧集群，RTO 目标 10 分钟，预生产实测 6.5 分钟。',
    charCount: 228,
    tokenCount: 143,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['灰度批次', '回滚预案', '分片热点均衡', 'BLOCK-0312', 'RTO'],
    relations: [
      { from: '回滚预案', to: '灰度批次', type: '约束' },
      { from: '灰度批次', to: '分库分表', type: '依赖' },
    ],
    position: { page: 7, section: '2.3', offset: 2860 },
    retrievedCount30d: 52,
    lastRetrievedAt: '2026-03-19 18:05',
    qualityFlag: 'ok',
    tone: 'warn',
  },
  {
    id: 'KC-14',
    docId: 'KD-20',
    chunkIndex: 27,
    strategy: 'heading',
    headingPath: ['BA-1043 资损级根因分析', '第 3 章 五问法', 'Why-3 余数回填缺失'],
    content: 'Why-3：为什么各自独立舍入会丢余数？因为没有做余数回填。正确做法是最大余额法——先按比例取整到分，再把 totalAmount 减去已分配之和的差额，逐分补给余额最大的行。证据：KB-CODE-02《金额计算规约》第 3.2 节，该规约未被纳入本次 AI 生成的提示词上下文。Why-4 进一步指出：RAG 检索关键词用的是「优惠 分摊」，而知识库该条目标签为「金额 精度 BigDecimal」，向量召回未命中且未做同义词扩展。',
    charCount: 217,
    tokenCount: 136,
    embedding: { model: 'bge-large-zh-v1.5', dim: 1024, norm: 1 },
    hasTable: false,
    hasCode: false,
    codeLang: null,
    entities: ['最大余额法', '金额精度缺陷模式', '优惠核销', '同义词扩展', 'BA-1043'],
    relations: [
      { from: '优惠核销', to: '金额精度缺陷模式', type: '导致' },
      { from: '金额精度缺陷模式', to: '最大余额法', type: '派生自' },
    ],
    position: { page: null, section: 'Why-3', offset: 6480 },
    retrievedCount30d: 95,
    lastRetrievedAt: '2026-03-19 16:18',
    qualityFlag: 'ok',
    tone: 'danger',
  },
];

/* ==== 3. 知识图谱 ==== */

/** 知识图谱节点定义 */
export interface KbGraphNodeDef {
  id: string;
  /** 实体名 */
  label: string;
  nodeType: '限界上下文' | '领域概念' | '技术组件' | '接口' | '数据表' | '中间件' | '服务' | '规范' | '缺陷模式' | '人员' | '文档';
  /** 引用 ARCH_LAYERS 的真实 id，无对应层级则为 null */
  layer: string | null;
  /** 引用 ARCH_COMPONENTS 的真实 id，无对应组件则为 null */
  componentId: string | null;
  /** 来源文档（KD-*） */
  docIds: string[];
  /** 连接数 = 本节点在 KB_GRAPH_EDGES 中作为 from 或 to 出现的总次数 */
  degree: number;
  weight: number;
  firstSeenAt: string;
  lastUpdatedAt: string;
  aiExtracted: boolean;
  confidencePct: number;
  tone: Tone;
}

/**
 * 18 个图谱节点。degree 已按 KB_GRAPH_EDGES 的 26 条边逐点核算：
 * KG-01=8, KG-02=3, KG-03=5, KG-04=3, KG-05=2, KG-06=2, KG-07=2, KG-08=3,
 * KG-09=3, KG-10=1, KG-11=3, KG-12=1, KG-13=4, KG-14=3, KG-15=2, KG-16=2,
 * KG-17=3, KG-18=2；合计 52 = 26 × 2 ✓
 */
export const KB_GRAPH_NODES: KbGraphNodeDef[] = [
  {
    id: 'KG-01',
    label: '订单上下文',
    nodeType: '限界上下文',
    layer: 'layer-domain',
    componentId: 'ac-order-domain',
    docIds: ['KD-01', 'KD-02', 'KD-14'],
    degree: 8,
    weight: 1.0,
    firstSeenAt: '2026-01-08 10:24',
    lastUpdatedAt: '2026-03-13 17:26',
    aiExtracted: true,
    confidencePct: 98,
    tone: 'brand',
  },
  {
    id: 'KG-02',
    label: '履约上下文',
    nodeType: '限界上下文',
    layer: 'layer-app',
    componentId: 'ac-split-engine',
    docIds: ['KD-02', 'KD-14'],
    degree: 3,
    weight: 0.82,
    firstSeenAt: '2026-02-11 14:40',
    lastUpdatedAt: '2026-03-13 17:26',
    aiExtracted: true,
    confidencePct: 94,
    tone: 'brand',
  },
  {
    id: 'KG-03',
    label: '优惠上下文',
    nodeType: '限界上下文',
    layer: 'layer-app',
    componentId: 'ac-promo-engine',
    docIds: ['KD-02', 'KD-14'],
    degree: 5,
    weight: 0.9,
    firstSeenAt: '2026-02-11 14:40',
    lastUpdatedAt: '2026-03-13 17:26',
    aiExtracted: true,
    confidencePct: 96,
    tone: 'brand',
  },
  {
    id: 'KG-04',
    label: '订单聚合根',
    nodeType: '领域概念',
    layer: 'layer-domain',
    componentId: 'ac-order-domain',
    docIds: ['KD-02', 'KD-14'],
    degree: 3,
    weight: 0.95,
    firstSeenAt: '2026-01-08 10:26',
    lastUpdatedAt: '2026-03-17 20:44',
    aiExtracted: true,
    confidencePct: 97,
    tone: 'ai',
  },
  {
    id: 'KG-05',
    label: '订单状态机',
    nodeType: '领域概念',
    layer: 'layer-domain',
    componentId: 'ac-state-machine',
    docIds: ['KD-02', 'KD-12'],
    degree: 2,
    weight: 0.88,
    firstSeenAt: '2026-01-08 10:28',
    lastUpdatedAt: '2026-03-11 11:07',
    aiExtracted: true,
    confidencePct: 95,
    tone: 'ai',
  },
  {
    id: 'KG-06',
    label: '幂等键',
    nodeType: '领域概念',
    layer: 'layer-domain',
    componentId: 'ac-idem-guard',
    docIds: ['KD-12', 'KD-15', 'KD-17'],
    degree: 2,
    weight: 0.86,
    firstSeenAt: '2026-02-20 10:16',
    lastUpdatedAt: '2026-03-19 17:06',
    aiExtracted: true,
    confidencePct: 93,
    tone: 'ai',
  },
  {
    id: 'KG-07',
    label: '本地消息表',
    nodeType: '领域概念',
    layer: 'layer-infra',
    componentId: 'ac-outbox-relay',
    docIds: ['KD-01', 'KD-14'],
    degree: 2,
    weight: 0.8,
    firstSeenAt: '2026-01-08 10:31',
    lastUpdatedAt: '2026-03-13 17:26',
    aiExtracted: true,
    confidencePct: 91,
    tone: 'slate',
  },
  {
    id: 'KG-08',
    label: '优惠核销',
    nodeType: '领域概念',
    layer: 'layer-app',
    componentId: 'ac-promo-engine',
    docIds: ['KD-15', 'KD-20'],
    degree: 3,
    weight: 0.84,
    firstSeenAt: '2026-02-25 16:44',
    lastUpdatedAt: '2026-03-18 09:17',
    aiExtracted: true,
    confidencePct: 92,
    tone: 'pink',
  },
  {
    id: 'KG-09',
    label: '库存扣减',
    nodeType: '领域概念',
    layer: null,
    componentId: null,
    docIds: ['KD-13', 'KD-20'],
    degree: 3,
    weight: 0.78,
    firstSeenAt: '2026-03-02 09:26',
    lastUpdatedAt: '2026-03-18 09:17',
    aiExtracted: true,
    confidencePct: 88,
    tone: 'warn',
  },
  {
    id: 'KG-10',
    label: '最大余额法',
    nodeType: '领域概念',
    layer: 'layer-app',
    componentId: 'ac-promo-engine',
    docIds: ['KD-08', 'KD-20'],
    degree: 1,
    weight: 0.72,
    firstSeenAt: '2026-03-17 20:22',
    lastUpdatedAt: '2026-03-18 09:17',
    aiExtracted: true,
    confidencePct: 96,
    tone: 'amber',
  },
  {
    id: 'KG-11',
    label: '分库分表',
    nodeType: '技术组件',
    layer: 'layer-infra',
    componentId: 'ac-order-db',
    docIds: ['KD-01', 'KD-14'],
    degree: 3,
    weight: 0.89,
    firstSeenAt: '2026-01-08 10:34',
    lastUpdatedAt: '2026-03-13 17:26',
    aiExtracted: true,
    confidencePct: 95,
    tone: 'slate',
  },
  {
    id: 'KG-12',
    label: '基因分片路由',
    nodeType: '领域概念',
    layer: 'layer-infra',
    componentId: 'ac-order-db',
    docIds: ['KD-14', 'KD-17'],
    degree: 1,
    weight: 0.74,
    firstSeenAt: '2026-03-13 17:24',
    lastUpdatedAt: '2026-03-19 17:06',
    aiExtracted: true,
    confidencePct: 90,
    tone: 'slate',
  },
  {
    id: 'KG-13',
    label: 'order-service',
    nodeType: '服务',
    layer: null,
    componentId: null,
    docIds: ['KD-01', 'KD-16'],
    degree: 4,
    weight: 0.68,
    firstSeenAt: '2026-01-08 10:20',
    lastUpdatedAt: '2026-03-19 08:00',
    aiExtracted: true,
    confidencePct: 99,
    tone: 'neutral',
  },
  {
    id: 'KG-14',
    label: 'RabbitMQ',
    nodeType: '中间件',
    layer: 'layer-infra',
    componentId: 'ac-event-bus',
    docIds: ['KD-01', 'KD-14'],
    degree: 3,
    weight: 0.85,
    firstSeenAt: '2026-01-08 10:36',
    lastUpdatedAt: '2026-03-13 17:26',
    aiExtracted: false,
    confidencePct: 100,
    tone: 'slate',
  },
  {
    id: 'KG-15',
    label: '多级缓存层',
    nodeType: '技术组件',
    layer: 'layer-infra',
    componentId: 'ac-cache-layer',
    docIds: ['KD-01', 'KD-15'],
    degree: 2,
    weight: 0.76,
    firstSeenAt: '2026-01-08 10:38',
    lastUpdatedAt: '2026-03-13 17:26',
    aiExtracted: true,
    confidencePct: 93,
    tone: 'teal',
  },
  {
    id: 'KG-16',
    label: '创建订单接口 API-01',
    nodeType: '接口',
    layer: 'layer-access',
    componentId: 'ac-order-api',
    docIds: ['KD-15'],
    degree: 2,
    weight: 0.92,
    firstSeenAt: '2026-03-13 17:22',
    lastUpdatedAt: '2026-03-16 09:30',
    aiExtracted: true,
    confidencePct: 97,
    tone: 'info',
  },
  {
    id: 'KG-17',
    label: '订单列表查询接口 API-03',
    nodeType: '接口',
    layer: 'layer-access',
    componentId: 'ac-order-query',
    docIds: ['KD-15', 'KD-18'],
    degree: 3,
    weight: 0.87,
    firstSeenAt: '2026-03-13 17:22',
    lastUpdatedAt: '2026-03-19 17:09',
    aiExtracted: true,
    confidencePct: 96,
    tone: 'info',
  },
  {
    id: 'KG-18',
    label: '金额精度缺陷模式',
    nodeType: '缺陷模式',
    layer: null,
    componentId: null,
    docIds: ['KD-08', 'KD-18', 'KD-20'],
    degree: 2,
    weight: 0.81,
    firstSeenAt: '2026-02-27 23:12',
    lastUpdatedAt: '2026-03-19 17:09',
    aiExtracted: true,
    confidencePct: 94,
    tone: 'danger',
  },
];

/** 知识图谱边定义 */
export interface KbGraphEdgeDef {
  id: string;
  /** 起点节点（KG-*） */
  from: string;
  /** 终点节点（KG-*） */
  to: string;
  relation: '依赖' | '包含' | '实现' | '调用' | '约束' | '派生自' | '验证' | '导致' | '归属于' | '替代';
  weight: number;
  /** 证据：来源文档 + 切片（KC-xx 或 {docId}#{chunkIndex}）+ 原文引用 */
  evidence: { docId: string; chunkId: string; quote: string };
  aiExtracted: boolean;
  confidencePct: number;
  verified: boolean;
  verifiedBy: string | null;
  createdAt: string;
  tone: Tone;
}

/**
 * 26 条图谱边。端点出现次数合计 52，与 KB_GRAPH_NODES 的 degree 之和一致。
 * 其中 AI 抽取 25 条（96.2%）、人工录入 1 条；verified=true 共 18 条（69.2%，u-yan 复核 11 条、u-zhou 复核 7 条），其余 8 条 verifiedBy 为 null，仍在人工复核队列中。
 */
export const KB_GRAPH_EDGES: KbGraphEdgeDef[] = [
  {
    id: 'KGE-01',
    from: 'KG-01',
    to: 'KG-13',
    relation: '派生自',
    weight: 0.9,
    evidence: { docId: 'KD-01', chunkId: 'KC-02', quote: '分层依赖只能自上而下：接入层（L1）可依赖应用服务层（L2）……禁止 L4 反向引用 L2 / L3 的任何类型。' },
    aiExtracted: true,
    confidencePct: 96,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-01-08 10:40',
    tone: 'brand',
  },
  {
    id: 'KGE-02',
    from: 'KG-02',
    to: 'KG-13',
    relation: '派生自',
    weight: 0.88,
    evidence: { docId: 'KD-14', chunkId: 'KC-08', quote: '优惠上下文从单体 order-service 的 PromotionCalculator 剥离，独立为 promotion-engine。' },
    aiExtracted: true,
    confidencePct: 94,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-03-13 17:24',
    tone: 'brand',
  },
  {
    id: 'KGE-03',
    from: 'KG-03',
    to: 'KG-13',
    relation: '派生自',
    weight: 0.85,
    evidence: { docId: 'KD-14', chunkId: 'KC-08', quote: '优惠上下文从单体 order-service 的 PromotionCalculator 剥离，独立为 promotion-engine，承担规则建模、试算与核销三段能力。' },
    aiExtracted: true,
    confidencePct: 95,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-03-13 17:24',
    tone: 'brand',
  },
  {
    id: 'KGE-04',
    from: 'KG-01',
    to: 'KG-04',
    relation: '包含',
    weight: 0.95,
    evidence: { docId: 'KD-02', chunkId: 'KC-03', quote: 'Order 聚合根维护三条不变式……聚合内包含 OrderItem、PromotionDetail、PaymentRef 三类实体。' },
    aiExtracted: true,
    confidencePct: 98,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-02-11 14:44',
    tone: 'ai',
  },
  {
    id: 'KGE-05',
    from: 'KG-04',
    to: 'KG-05',
    relation: '包含',
    weight: 0.9,
    evidence: { docId: 'KD-02', chunkId: 'KC-03', quote: '状态流转必须经 OrderStateMachine 校验，禁止直接 setStatus。' },
    aiExtracted: true,
    confidencePct: 96,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-02-11 14:44',
    tone: 'ai',
  },
  {
    id: 'KGE-06',
    from: 'KG-06',
    to: 'KG-16',
    relation: '约束',
    weight: 0.92,
    evidence: { docId: 'KD-15', chunkId: 'KC-09', quote: 'POST /api/v2/orders 必须在请求头携带 Idempotency-Key，缺失时网关直接返回 400 IDEMPOTENCY_KEY_MISSING。' },
    aiExtracted: true,
    confidencePct: 97,
    verified: true,
    verifiedBy: 'u-zhou',
    createdAt: '2026-03-13 17:23',
    tone: 'info',
  },
  {
    id: 'KGE-07',
    from: 'KG-16',
    to: 'KG-01',
    relation: '实现',
    weight: 0.9,
    evidence: { docId: 'KD-15', chunkId: 'KC-09', quote: '契约冻结版本 v2.0，P99 承诺 180ms、单实例 500 TPS，属破坏性变更，下游 12 个系统需在 2026-04-30 前完成适配。' },
    aiExtracted: true,
    confidencePct: 95,
    verified: true,
    verifiedBy: 'u-zhou',
    createdAt: '2026-03-13 17:23',
    tone: 'info',
  },
  {
    id: 'KGE-08',
    from: 'KG-01',
    to: 'KG-09',
    relation: '调用',
    weight: 0.84,
    evidence: { docId: 'KD-13', chunkId: 'KC-07', quote: 'Given 用户已提交订单且库存服务返回扣减失败，When 订单处于 CREATING 状态超过 5 秒，Then 系统必须自动触发补偿。' },
    aiExtracted: true,
    confidencePct: 92,
    verified: true,
    verifiedBy: 'u-zhou',
    createdAt: '2026-03-11 11:06',
    tone: 'warn',
  },
  {
    id: 'KGE-09',
    from: 'KG-01',
    to: 'KG-03',
    relation: '依赖',
    weight: 0.88,
    evidence: { docId: 'KD-14', chunkId: 'KC-08', quote: '上下文对订单上下文只暴露 API-07 试算与 API-08 核销两个同步接口。' },
    aiExtracted: true,
    confidencePct: 96,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-03-13 17:24',
    tone: 'brand',
  },
  {
    id: 'KGE-10',
    from: 'KG-03',
    to: 'KG-08',
    relation: '包含',
    weight: 0.93,
    evidence: { docId: 'KD-15', chunkId: 'KD-15#52', quote: 'API-08 优惠核销：POST /api/v2/promotions/redeem，核销结果通过 promotion.redeemed 事件回流，供财务对账与资损监控消费。' },
    aiExtracted: true,
    confidencePct: 94,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-03-13 17:25',
    tone: 'pink',
  },
  {
    id: 'KGE-11',
    from: 'KG-08',
    to: 'KG-10',
    relation: '依赖',
    weight: 0.8,
    evidence: { docId: 'KD-08', chunkId: 'KC-05', quote: '多行金额分摊禁止逐行独立 setScale。正确做法是最大余额法：先按比例向下取整到分，再把差额逐分补给余额最大的行。' },
    aiExtracted: true,
    confidencePct: 97,
    verified: true,
    verifiedBy: 'u-zhou',
    createdAt: '2026-03-17 20:44',
    tone: 'amber',
  },
  {
    id: 'KGE-12',
    from: 'KG-08',
    to: 'KG-18',
    relation: '导致',
    weight: 0.82,
    evidence: { docId: 'KD-20', chunkId: 'KC-14', quote: 'Why-3：为什么各自独立舍入会丢余数？因为没有做余数回填……该规约未被纳入本次 AI 生成的提示词上下文。' },
    aiExtracted: true,
    confidencePct: 94,
    verified: true,
    verifiedBy: 'u-zhou',
    createdAt: '2026-03-18 09:16',
    tone: 'danger',
  },
  {
    id: 'KGE-13',
    from: 'KG-18',
    to: 'KG-03',
    relation: '归属于',
    weight: 0.75,
    evidence: { docId: 'KD-20', chunkId: 'KC-14', quote: 'RAG 检索关键词用的是「优惠 分摊」，而知识库该条目标签为「金额 精度 BigDecimal」，向量召回未命中且未做同义词扩展。' },
    aiExtracted: true,
    confidencePct: 89,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-03-18 09:16',
    tone: 'danger',
  },
  {
    id: 'KGE-14',
    from: 'KG-01',
    to: 'KG-07',
    relation: '包含',
    weight: 0.87,
    evidence: { docId: 'KD-01', chunkId: 'KC-01', quote: '跨上下文协作一律通过领域事件（order.created / order.paid / order.closed）在 RabbitMQ 上异步完成，禁止跨库事务。' },
    aiExtracted: true,
    confidencePct: 93,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-01-08 10:42',
    tone: 'slate',
  },
  {
    id: 'KGE-15',
    from: 'KG-07',
    to: 'KG-14',
    relation: '调用',
    weight: 0.9,
    evidence: { docId: 'KD-01', chunkId: 'KD-01#104', quote: 'outbox 中继的指数退避与死信转投实现符合 KB-ARCH-01 的最终一致性规范，重试最多 5 次后转死信队列并告警。' },
    aiExtracted: true,
    confidencePct: 95,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-01-08 10:42',
    tone: 'slate',
  },
  {
    id: 'KGE-16',
    from: 'KG-14',
    to: 'KG-02',
    relation: '调用',
    weight: 0.8,
    evidence: { docId: 'KD-14', chunkId: 'KC-08', quote: '核销结果通过 promotion.redeemed 事件回流，供财务对账与资损监控消费。' },
    aiExtracted: true,
    confidencePct: 90,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-03-13 17:25',
    tone: 'slate',
  },
  {
    id: 'KGE-17',
    from: 'KG-14',
    to: 'KG-03',
    relation: '调用',
    weight: 0.78,
    evidence: { docId: 'KD-14', chunkId: 'KD-14#25', quote: 'order.paid 事件由领域事件总线广播，履约与优惠上下文各自订阅，禁止跨上下文直接读写对方数据表。' },
    aiExtracted: true,
    confidencePct: 88,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-03-13 17:25',
    tone: 'slate',
  },
  {
    id: 'KGE-18',
    from: 'KG-01',
    to: 'KG-11',
    relation: '依赖',
    weight: 0.89,
    evidence: { docId: 'KD-01', chunkId: 'KC-02', quote: 'L3 仅依赖基础设施层（L4）的抽象接口……MySQL 8 分片集群、Redis 7 多级缓存、RabbitMQ 事件总线与安全组件。' },
    aiExtracted: true,
    confidencePct: 96,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-01-08 10:44',
    tone: 'slate',
  },
  {
    id: 'KGE-19',
    from: 'KG-11',
    to: 'KG-12',
    relation: '包含',
    weight: 0.88,
    evidence: { docId: 'KD-14', chunkId: 'KD-14#31', quote: '订单号基因分片：低 10 位取自 buyerId 后 10 位哈希，双向查询均单分片命中，压测 12,000 TPS 下 P99 由 210ms 降至 46ms。' },
    aiExtracted: true,
    confidencePct: 93,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-03-13 17:25',
    tone: 'slate',
  },
  {
    id: 'KGE-20',
    from: 'KG-17',
    to: 'KG-11',
    relation: '依赖',
    weight: 0.85,
    evidence: { docId: 'KD-18', chunkId: 'KC-12', quote: 'BUG-1049 分片键设计导致跨分片聚合（MR-2417 改聚合根哈希串行，等待流水线重跑）。' },
    aiExtracted: true,
    confidencePct: 91,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-03-19 17:08',
    tone: 'warn',
  },
  {
    id: 'KGE-21',
    from: 'KG-17',
    to: 'KG-15',
    relation: '调用',
    weight: 0.82,
    evidence: { docId: 'KD-15', chunkId: 'KC-10', quote: '跨分片聚合由查询服务在内存中归并……配合多级缓存层承接热点首页请求。' },
    aiExtracted: true,
    confidencePct: 94,
    verified: true,
    verifiedBy: 'u-zhou',
    createdAt: '2026-03-13 17:25',
    tone: 'teal',
  },
  {
    id: 'KGE-22',
    from: 'KG-01',
    to: 'KG-15',
    relation: '依赖',
    weight: 0.79,
    evidence: { docId: 'KD-01', chunkId: 'KD-01#88', quote: '订单详情走 Redis 多级缓存，命中率门槛 ≥ 92%、穿透率 ≤ 0.3%，缓存未命中回落分片集群主库。' },
    aiExtracted: true,
    confidencePct: 90,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-01-08 10:45',
    tone: 'teal',
  },
  {
    id: 'KGE-23',
    from: 'KG-09',
    to: 'KG-05',
    relation: '约束',
    weight: 0.72,
    evidence: { docId: 'KD-13', chunkId: 'KC-07', quote: 'Then 系统必须自动触发补偿：释放已核销的优惠券、回滚已冻结的积分、将订单状态置为 CLOSED 并写入状态流水。' },
    aiExtracted: true,
    confidencePct: 86,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-03-11 11:06',
    tone: 'warn',
  },
  {
    id: 'KGE-24',
    from: 'KG-02',
    to: 'KG-09',
    relation: '调用',
    weight: 0.8,
    evidence: { docId: 'KD-13', chunkId: 'KD-13#11', quote: '履约上下文在拆单完成后按子单粒度调用库存服务扣减，任一子单失败则整单进入补偿流程，不得部分发货。' },
    aiExtracted: true,
    confidencePct: 89,
    verified: false,
    verifiedBy: null,
    createdAt: '2026-03-11 11:06',
    tone: 'warn',
  },
  {
    id: 'KGE-25',
    from: 'KG-06',
    to: 'KG-04',
    relation: '约束',
    weight: 0.84,
    evidence: { docId: 'KD-12', chunkId: 'KC-06', quote: '同一 key 在 24 小时内重复提交必须返回首次订单号，不得创建新订单。' },
    aiExtracted: true,
    confidencePct: 95,
    verified: true,
    verifiedBy: 'u-zhou',
    createdAt: '2026-03-11 11:06',
    tone: 'ai',
  },
  {
    id: 'KGE-26',
    from: 'KG-17',
    to: 'KG-13',
    relation: '替代',
    weight: 0.83,
    evidence: { docId: 'KD-15', chunkId: 'KC-10', quote: 'GET /api/v2/orders 自 v2.0 起废弃 offset 分页，改为游标分页。' },
    aiExtracted: false,
    confidencePct: 100,
    verified: true,
    verifiedBy: 'u-yan',
    createdAt: '2026-03-16 09:30',
    tone: 'neutral',
  },
];

/* ==== 4. 入库流水线与检索 ==== */

/** 入库流水线步骤定义（7 步，名称与顺序固定） */
export interface KbIngestStepDef {
  id: string;
  order: number;
  name: string;
  engine: 'weknora' | 'platform' | 'ai-agent';
  desc: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
  /** 平均耗时（秒），7 步合计 188.7 秒 = KB_ENGINE.avgIngestSec */
  avgDurationSec: number;
  successRatePct: number;
  retryPolicy: { maxAttempts: number; backoffMs: number };
  fallbackAction: string;
  /** 并发度 */
  parallelism: number;
  tone: Tone;
}

/** 7 步入库流水线：采集 → 解析/OCR → 结构化抽取 → 层级切片 → 向量化 → 图谱构建 → 索引与评测 */
export const KB_INGEST_STEPS: KbIngestStepDef[] = [
  {
    id: 'KIS-01',
    order: 1,
    name: '采集',
    engine: 'platform',
    desc: '监听 SDLC 事件总线（sdlc.prd.baselined / sdlc.gate.passed / sdlc.mr.merged 等），按 KA-01~KA-08 规则匹配产物，从 Confluence、飞书、GitLab、PingCode、Jenkins 五路连接器拉取原文并做 content-hash 去重。',
    inputArtifacts: ['SDLC 事件', '归档规则命中结果', '外部系统凭证'],
    outputArtifacts: ['原文包', '元数据清单'],
    avgDurationSec: 14.6,
    successRatePct: 100,
    retryPolicy: { maxAttempts: 5, backoffMs: 2000 },
    fallbackAction: '转入死信队列并通知空间 Owner，24 小时内可人工重放',
    parallelism: 8,
    tone: 'info',
  },
  {
    id: 'KIS-02',
    order: 2,
    name: '解析/OCR',
    engine: 'weknora',
    desc: 'WeKnora 版面分析 + 阅读顺序还原，位图走 PaddleOCR v4，表格走 PP-StructureV2 还原行列关系；输出统一的结构化中间表示（IR）。本月共处理 8 页 OCR（KD-04 权限矩阵 3 页、KD-14 架构图 2 张、KD-19 灰度截图 3 页）。',
    inputArtifacts: ['原文包'],
    outputArtifacts: ['结构化中间表示（IR）', 'OCR 文本层', '表格对象'],
    avgDurationSec: 45.2,
    successRatePct: 98.6,
    retryPolicy: { maxAttempts: 3, backoffMs: 5000 },
    fallbackAction: 'OCR 失败的页面降级为纯文本抽取，并把文档 parseStatus 置为 ocr-pending 转人工',
    parallelism: 4,
    tone: 'teal',
  },
  {
    id: 'KIS-03',
    order: 3,
    name: '结构化抽取',
    engine: 'ai-agent',
    desc: '抽取标题树、元数据（版本 / 作者 / 关联单据号）、实体与关系候选，并把实体链接到 ARCH_COMPONENTS 的真实 id；由 ag-arch 承接架构类文档、ag-review 承接代码类文档的抽取任务。',
    inputArtifacts: ['结构化中间表示（IR）', '标题树', '架构组件清单'],
    outputArtifacts: ['标题层级树', '元数据', '实体与关系候选'],
    avgDurationSec: 29.1,
    successRatePct: 97.2,
    retryPolicy: { maxAttempts: 2, backoffMs: 3000 },
    fallbackAction: '抽取失败时降级为 fixed(512) 切片入库，文档标记 qualityFlag=noisy 并进入人工修复队列',
    parallelism: 6,
    tone: 'ai',
  },
  {
    id: 'KIS-04',
    order: 4,
    name: '层级切片',
    engine: 'weknora',
    desc: '按文档配置的 chunkStrategy（heading / semantic / fixed / table-row / code-block）切片，保留 headingPath 与 position；短于 120 字的切片自动与相邻兄弟合并，代码块不跨函数边界切断。',
    inputArtifacts: ['标题层级树', '表格对象', '代码块'],
    outputArtifacts: ['切片（含 headingPath / position）', '切片质量标记'],
    avgDurationSec: 10.8,
    successRatePct: 99.8,
    retryPolicy: { maxAttempts: 3, backoffMs: 1000 },
    fallbackAction: '回退到 fixed(512) 定长切片并记录降级原因',
    parallelism: 12,
    tone: 'indigo',
  },
  {
    id: 'KIS-05',
    order: 5,
    name: '向量化',
    engine: 'weknora',
    desc: 'bge-large-zh-v1.5（1024 维，L2 归一化）批量编码，写入 PostgreSQL + pgvector 的 HNSW 索引（m=16, ef_construction=200）；同时构建 BM25 倒排。本步是全链路最脆弱环节，KI-07 即因出口网络抖动在此超时失败。',
    inputArtifacts: ['切片'],
    outputArtifacts: ['向量索引', 'BM25 倒排索引'],
    avgDurationSec: 48.9,
    successRatePct: 99.1,
    retryPolicy: { maxAttempts: 3, backoffMs: 10000 },
    fallbackAction: '三次重试失败即整批转死信，由下一次事件合批重放（见 KI-08）',
    parallelism: 16,
    tone: 'ai',
  },
  {
    id: 'KIS-06',
    order: 6,
    name: '图谱构建',
    engine: 'weknora',
    desc: '把结构化抽取的实体与关系候选写入 NebulaGraph，做实体消歧与合并，为每条边挂载 evidence（docId + chunkId + 原文引用）与置信度；置信度 < 80% 的边进入人工复核队列。',
    inputArtifacts: ['实体与关系候选', '切片'],
    outputArtifacts: ['图谱节点', '图谱边（含证据与置信度）'],
    avgDurationSec: 26.3,
    successRatePct: 94.3,
    retryPolicy: { maxAttempts: 2, backoffMs: 5000 },
    fallbackAction: '图谱构建失败不阻塞检索（向量与 BM25 路仍可用），仅关闭图谱召回路并告警',
    parallelism: 4,
    tone: 'brand',
  },
  {
    id: 'KIS-07',
    order: 7,
    name: '索引与评测',
    engine: 'platform',
    desc: '提交索引事务、刷新缓存、回写文档 embedStatus=ready，并对受影响的评测集（KQ-01~KQ-03）跑一次增量回归；若 recall@10 下滑超过 0.02 则自动回滚本次索引并开调优工单。',
    inputArtifacts: ['向量索引', '图谱节点', '图谱边', '评测集'],
    outputArtifacts: ['可检索索引', '增量评测报告'],
    avgDurationSec: 13.8,
    successRatePct: 96.8,
    retryPolicy: { maxAttempts: 2, backoffMs: 4000 },
    fallbackAction: '索引回滚至上一版本，文档 embedStatus 置为 failed 并通知空间 Owner',
    parallelism: 2,
    tone: 'ok',
  },
];

/** 入库流水线单步执行记录 */
export interface KbIngestStepRunDef {
  stepId: string;
  status: 'done' | 'running' | 'pending' | 'failed' | 'skipped';
  /** 未开始的步骤为 null */
  startedAt: string | null;
  finishedAt: string | null;
  durationSec: number;
  itemsProcessed: number;
  error: string | null;
}

/** 入库执行记录定义 */
export interface KbIngestRunDef {
  id: string;
  triggeredBy: 'event' | 'schedule' | 'manual';
  /** 事件名 / cron 表达式 / 触发人 userId */
  triggerRef: string;
  docIds: string[];
  startedAt: string;
  finishedAt: string | null;
  durationSec: number;
  status: 'success' | 'partial' | 'running' | 'failed' | 'queued';
  statusLabel: string;
  steps: KbIngestStepRunDef[];
  totalChunksProduced: number;
  totalTokens: number;
  costYuan: number;
  ocrPages: number;
  graphNodesAdded: number;
  graphEdgesAdded: number;
  tone: Tone;
  note: string;
}

/**
 * 最近 8 次入库执行记录（近 30 日共 46 次，此处为最近样本，非全量）。
 * 状态分布：success 5 / partial 1 / failed 1 / running 1；
 * 已结束 7 次，ingestSuccessRatePct = (5 + 1) ÷ 7 = 85.7%。
 * 各次 durationSec（已结束）合计 1321 秒，均值 188.7 秒 = KB_ENGINE.avgIngestSec。
 * graphNodesAdded 合计 18 = KB_GRAPH_NODES 长度；graphEdgesAdded 合计 26 = KB_GRAPH_EDGES 长度。
 */
export const KB_INGEST_RUNS: KbIngestRunDef[] = [
  {
    id: 'KI-01',
    triggeredBy: 'event',
    triggerRef: 'sdlc.prd.baselined（PRD-ORD-v2.3）',
    docIds: ['KD-12', 'KD-13'],
    startedAt: '2026-03-11 11:04:00',
    finishedAt: '2026-03-11 11:07:04',
    durationSec: 184,
    status: 'success',
    statusLabel: '成功',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-11 11:04:00', finishedAt: '2026-03-11 11:04:14', durationSec: 14, itemsProcessed: 2, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-11 11:04:14', finishedAt: '2026-03-11 11:04:56', durationSec: 42, itemsProcessed: 2, error: null },
      { stepId: 'KIS-03', status: 'done', startedAt: '2026-03-11 11:04:56', finishedAt: '2026-03-11 11:05:24', durationSec: 28, itemsProcessed: 2, error: null },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-11 11:05:24', finishedAt: '2026-03-11 11:05:35', durationSec: 11, itemsProcessed: 310, error: null },
      { stepId: 'KIS-05', status: 'done', startedAt: '2026-03-11 11:05:35', finishedAt: '2026-03-11 11:06:22', durationSec: 47, itemsProcessed: 310, error: null },
      { stepId: 'KIS-06', status: 'done', startedAt: '2026-03-11 11:06:22', finishedAt: '2026-03-11 11:06:48', durationSec: 26, itemsProcessed: 8, error: null },
      { stepId: 'KIS-07', status: 'done', startedAt: '2026-03-11 11:06:48', finishedAt: '2026-03-11 11:07:04', durationSec: 16, itemsProcessed: 310, error: null },
    ],
    totalChunksProduced: 310,
    totalTokens: 172000,
    costYuan: 6.42,
    ocrPages: 0,
    graphNodesAdded: 3,
    graphEdgesAdded: 5,
    tone: 'ok',
    note: 'G1 门禁通过后 5 秒内触发，PRD v2.3 基线与 14 条用户故事同批入库；新增图谱节点为订单状态机、幂等键、库存扣减。',
  },
  {
    id: 'KI-02',
    triggeredBy: 'event',
    triggerRef: 'sdlc.gate.passed:G2',
    docIds: ['KD-14', 'KD-15', 'KD-16'],
    startedAt: '2026-03-13 17:20:00',
    finishedAt: '2026-03-13 17:25:42',
    durationSec: 342,
    status: 'success',
    statusLabel: '成功',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-13 17:20:00', finishedAt: '2026-03-13 17:20:22', durationSec: 22, itemsProcessed: 3, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-13 17:20:22', finishedAt: '2026-03-13 17:21:58', durationSec: 96, itemsProcessed: 5, error: null },
      { stepId: 'KIS-03', status: 'done', startedAt: '2026-03-13 17:21:58', finishedAt: '2026-03-13 17:22:56', durationSec: 58, itemsProcessed: 3, error: null },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-13 17:22:56', finishedAt: '2026-03-13 17:23:20', durationSec: 24, itemsProcessed: 324, error: null },
      { stepId: 'KIS-05', status: 'done', startedAt: '2026-03-13 17:23:20', finishedAt: '2026-03-13 17:24:42', durationSec: 82, itemsProcessed: 324, error: null },
      { stepId: 'KIS-06', status: 'done', startedAt: '2026-03-13 17:24:42', finishedAt: '2026-03-13 17:25:24', durationSec: 42, itemsProcessed: 16, error: null },
      { stepId: 'KIS-07', status: 'done', startedAt: '2026-03-13 17:25:24', finishedAt: '2026-03-13 17:25:42', durationSec: 18, itemsProcessed: 324, error: null },
    ],
    totalChunksProduced: 324,
    totalTokens: 162000,
    costYuan: 11.86,
    ocrPages: 2,
    graphNodesAdded: 6,
    graphEdgesAdded: 10,
    tone: 'ok',
    note: 'G2 冻结后一次性归档架构视图、14 份接口契约与 24 个任务快照，是本迭代图谱构建的主力批次：三个限界上下文、基因分片路由、API-01 / API-03 均在此批产生。',
  },
  {
    id: 'KI-03',
    triggeredBy: 'schedule',
    triggerRef: 'cron 0 2 * * *（每日增量归档）',
    docIds: ['KD-03', 'KD-09'],
    startedAt: '2026-03-15 02:00:00',
    finishedAt: '2026-03-15 02:02:22',
    durationSec: 142,
    status: 'success',
    statusLabel: '成功',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-15 02:00:00', finishedAt: '2026-03-15 02:00:12', durationSec: 12, itemsProcessed: 2, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-15 02:00:12', finishedAt: '2026-03-15 02:00:46', durationSec: 34, itemsProcessed: 2, error: null },
      { stepId: 'KIS-03', status: 'done', startedAt: '2026-03-15 02:00:46', finishedAt: '2026-03-15 02:01:08', durationSec: 22, itemsProcessed: 2, error: null },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-15 02:01:08', finishedAt: '2026-03-15 02:01:17', durationSec: 9, itemsProcessed: 240, error: null },
      { stepId: 'KIS-05', status: 'done', startedAt: '2026-03-15 02:01:17', finishedAt: '2026-03-15 02:01:55', durationSec: 38, itemsProcessed: 240, error: null },
      { stepId: 'KIS-06', status: 'done', startedAt: '2026-03-15 02:01:55', finishedAt: '2026-03-15 02:02:13', durationSec: 18, itemsProcessed: 4, error: null },
      { stepId: 'KIS-07', status: 'done', startedAt: '2026-03-15 02:02:13', finishedAt: '2026-03-15 02:02:22', durationSec: 9, itemsProcessed: 240, error: null },
    ],
    totalChunksProduced: 240,
    totalTokens: 116000,
    costYuan: 4.86,
    ocrPages: 0,
    graphNodesAdded: 2,
    graphEdgesAdded: 2,
    tone: 'ok',
    note: '每日 02:00 增量同步 Confluence 变更：脱敏规范 v2.1（03-15 更新）与测试规范 v2.6（03-14 更新）重索引，未产生内容级 diff 的文档自动跳过。',
  },
  {
    id: 'KI-04',
    triggeredBy: 'manual',
    triggerRef: 'u-yan',
    docIds: ['KD-02', 'KD-08'],
    startedAt: '2026-03-17 20:40:00',
    finishedAt: '2026-03-17 20:43:46',
    durationSec: 226,
    status: 'partial',
    statusLabel: '部分成功',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-17 20:40:00', finishedAt: '2026-03-17 20:40:16', durationSec: 16, itemsProcessed: 2, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-17 20:40:16', finishedAt: '2026-03-17 20:41:14', durationSec: 58, itemsProcessed: 2, error: null },
      { stepId: 'KIS-03', status: 'failed', startedAt: '2026-03-17 20:41:14', finishedAt: '2026-03-17 20:41:58', durationSec: 44, itemsProcessed: 1, error: 'KD-08 附录 C 的 Markdown 表格跨页错位，结构化抽取失败；已按 fallbackAction 降级为 fixed(512) 切片' },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-17 20:41:58', finishedAt: '2026-03-17 20:42:12', durationSec: 14, itemsProcessed: 116, error: null },
      { stepId: 'KIS-05', status: 'done', startedAt: '2026-03-17 20:42:12', finishedAt: '2026-03-17 20:43:04', durationSec: 52, itemsProcessed: 116, error: null },
      { stepId: 'KIS-06', status: 'done', startedAt: '2026-03-17 20:43:04', finishedAt: '2026-03-17 20:43:34', durationSec: 30, itemsProcessed: 5, error: null },
      { stepId: 'KIS-07', status: 'done', startedAt: '2026-03-17 20:43:34', finishedAt: '2026-03-17 20:43:46', durationSec: 12, itemsProcessed: 116, error: null },
    ],
    totalChunksProduced: 116,
    totalTokens: 57000,
    costYuan: 3.42,
    ocrPages: 0,
    graphNodesAdded: 2,
    graphEdgesAdded: 3,
    tone: 'warn',
    note: 'BUG-1043 复盘后由严慕舟手工触发：把《限界上下文与聚合根边界约定》与《金额精度规范》一并重索引，并新建「最大余额法 → 金额精度缺陷模式」图谱边，修复 02-24 未召回 KB-CODE-02 的缺口。KD-08 的 2 处表格切片被标记 qualityFlag=noisy。',
  },
  {
    id: 'KI-05',
    triggeredBy: 'event',
    triggerRef: 'sdlc.rca.approved（BA-1043 v1.3）',
    docIds: ['KD-20'],
    startedAt: '2026-03-18 09:14:00',
    finishedAt: '2026-03-18 09:16:48',
    durationSec: 168,
    status: 'success',
    statusLabel: '成功',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-18 09:14:00', finishedAt: '2026-03-18 09:14:13', durationSec: 13, itemsProcessed: 1, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-18 09:14:13', finishedAt: '2026-03-18 09:14:51', durationSec: 38, itemsProcessed: 1, error: null },
      { stepId: 'KIS-03', status: 'done', startedAt: '2026-03-18 09:14:51', finishedAt: '2026-03-18 09:15:17', durationSec: 26, itemsProcessed: 1, error: null },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-18 09:15:17', finishedAt: '2026-03-18 09:15:27', durationSec: 10, itemsProcessed: 132, error: null },
      { stepId: 'KIS-05', status: 'done', startedAt: '2026-03-18 09:15:27', finishedAt: '2026-03-18 09:16:11', durationSec: 44, itemsProcessed: 132, error: null },
      { stepId: 'KIS-06', status: 'done', startedAt: '2026-03-18 09:16:11', finishedAt: '2026-03-18 09:16:35', durationSec: 24, itemsProcessed: 7, error: null },
      { stepId: 'KIS-07', status: 'done', startedAt: '2026-03-18 09:16:35', finishedAt: '2026-03-18 09:16:48', durationSec: 13, itemsProcessed: 132, error: null },
    ],
    totalChunksProduced: 132,
    totalTokens: 71000,
    costYuan: 4.28,
    ocrPages: 0,
    graphNodesAdded: 3,
    graphEdgesAdded: 4,
    tone: 'danger',
    note: 'BA-1043 复核通过（林知远 / 何斯年 / 孟星回）后自动归档，五问法逐层切片并抽取「优惠核销 → 最大余额法 → 金额精度缺陷模式」因果链，供 ag-review 在后续评审中做前置拦截。',
  },
  {
    id: 'KI-06',
    triggeredBy: 'manual',
    triggerRef: 'u-meng',
    docIds: ['KD-19'],
    startedAt: '2026-03-19 15:40:00',
    finishedAt: '2026-03-19 15:43:16',
    durationSec: 196,
    status: 'success',
    statusLabel: '成功',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-19 15:40:00', finishedAt: '2026-03-19 15:40:15', durationSec: 15, itemsProcessed: 1, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-19 15:40:15', finishedAt: '2026-03-19 15:41:17', durationSec: 62, itemsProcessed: 4, error: null },
      { stepId: 'KIS-03', status: 'done', startedAt: '2026-03-19 15:41:17', finishedAt: '2026-03-19 15:41:47', durationSec: 30, itemsProcessed: 1, error: null },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-19 15:41:47', finishedAt: '2026-03-19 15:41:59', durationSec: 12, itemsProcessed: 104, error: null },
      { stepId: 'KIS-05', status: 'done', startedAt: '2026-03-19 15:41:59', finishedAt: '2026-03-19 15:42:41', durationSec: 42, itemsProcessed: 104, error: null },
      { stepId: 'KIS-06', status: 'done', startedAt: '2026-03-19 15:42:41', finishedAt: '2026-03-19 15:43:03', durationSec: 22, itemsProcessed: 4, error: null },
      { stepId: 'KIS-07', status: 'done', startedAt: '2026-03-19 15:43:03', finishedAt: '2026-03-19 15:43:16', durationSec: 13, itemsProcessed: 104, error: null },
    ],
    totalChunksProduced: 104,
    totalTokens: 52000,
    costYuan: 3.16,
    ocrPages: 3,
    graphNodesAdded: 2,
    graphEdgesAdded: 2,
    tone: 'warn',
    note: '孟星回在发布评审会前手工触发：把 REL-2401/2402/2403 三份发布单与灰度批次截图归档为 confidential 级文档，3 页截图走 OCR；实例 IP 与连接串按 rd-08 脱敏。ag-ops 在 18:05 的检索即命中本批切片 KC-13。',
  },
  {
    id: 'KI-07',
    triggeredBy: 'event',
    triggerRef: 'sdlc.mr.merged（MR-2418）',
    docIds: ['KD-17'],
    startedAt: '2026-03-19 16:22:00',
    finishedAt: '2026-03-19 16:23:03',
    durationSec: 63,
    status: 'failed',
    statusLabel: '失败',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-19 16:22:00', finishedAt: '2026-03-19 16:22:11', durationSec: 11, itemsProcessed: 1, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-19 16:22:11', finishedAt: '2026-03-19 16:22:29', durationSec: 18, itemsProcessed: 1, error: null },
      { stepId: 'KIS-03', status: 'done', startedAt: '2026-03-19 16:22:29', finishedAt: '2026-03-19 16:22:41', durationSec: 12, itemsProcessed: 1, error: null },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-19 16:22:41', finishedAt: '2026-03-19 16:22:46', durationSec: 5, itemsProcessed: 246, error: null },
      { stepId: 'KIS-05', status: 'failed', startedAt: '2026-03-19 16:22:46', finishedAt: '2026-03-19 16:23:03', durationSec: 17, itemsProcessed: 0, error: '向量化服务连接超时（GitLab Runner 出口网络抖动），按 backoffMs=10000 重试 3 次均失败' },
      { stepId: 'KIS-06', status: 'skipped', startedAt: null, finishedAt: null, durationSec: 0, itemsProcessed: 0, error: null },
      { stepId: 'KIS-07', status: 'skipped', startedAt: null, finishedAt: null, durationSec: 0, itemsProcessed: 0, error: null },
    ],
    totalChunksProduced: 0,
    totalTokens: 0,
    costYuan: 0.42,
    ocrPages: 0,
    graphNodesAdded: 0,
    graphEdgesAdded: 0,
    tone: 'danger',
    note: '本迭代唯一一次入库失败：切片已完成 246 个但向量写入超时，整批转死信并告警 u-meng；文档 embedStatus 保持 indexing，等待 KI-08 重放。',
  },
  {
    id: 'KI-08',
    triggeredBy: 'event',
    triggerRef: 'sdlc.testreport.published + sdlc.mr.merged#retry-1（事件合批）',
    docIds: ['KD-18', 'KD-17'],
    startedAt: '2026-03-19 17:06:00',
    finishedAt: null,
    durationSec: 168,
    status: 'running',
    statusLabel: '执行中',
    steps: [
      { stepId: 'KIS-01', status: 'done', startedAt: '2026-03-19 17:06:00', finishedAt: '2026-03-19 17:06:16', durationSec: 16, itemsProcessed: 2, error: null },
      { stepId: 'KIS-02', status: 'done', startedAt: '2026-03-19 17:06:16', finishedAt: '2026-03-19 17:07:00', durationSec: 44, itemsProcessed: 2, error: null },
      { stepId: 'KIS-03', status: 'done', startedAt: '2026-03-19 17:07:00', finishedAt: '2026-03-19 17:07:30', durationSec: 30, itemsProcessed: 2, error: null },
      { stepId: 'KIS-04', status: 'done', startedAt: '2026-03-19 17:07:30', finishedAt: '2026-03-19 17:07:43', durationSec: 13, itemsProcessed: 404, error: null },
      { stepId: 'KIS-05', status: 'running', startedAt: '2026-03-19 17:07:43', finishedAt: null, durationSec: 65, itemsProcessed: 186, error: null },
      { stepId: 'KIS-06', status: 'pending', startedAt: null, finishedAt: null, durationSec: 0, itemsProcessed: 0, error: null },
      { stepId: 'KIS-07', status: 'pending', startedAt: null, finishedAt: null, durationSec: 0, itemsProcessed: 0, error: null },
    ],
    totalChunksProduced: 186,
    totalTokens: 94000,
    costYuan: 3.94,
    ocrPages: 0,
    graphNodesAdded: 0,
    graphEdgesAdded: 0,
    tone: 'ai',
    note: '测试报告 TR-24（158 切片）已完成向量化并置为 ready，KD-17 的死信重放仍在进行（已产出 28/246 切片）；图谱构建与索引评测两步待向量化结束后启动。',
  },
];

/** 检索日志定义 */
export interface KbRetrievalLogDef {
  id: string;
  at: string;
  query: string;
  queryType: 'semantic' | 'keyword' | 'hybrid' | 'graph';
  callerType: 'agent' | 'human' | 'api';
  /** ag-* 或 u-* */
  callerId: string;
  /** 关联 agentTraces 的真实 id（at-01~at-05），无则为 null */
  agentTraceId: string | null;
  stageId: string;
  recallStrategy: { type: 'vector' | 'bm25' | 'graph'; topK: number; weight: number }[];
  candidateCount: number;
  rerankModel: string;
  rerankedCount: number;
  /** 命中切片：样本切片写 KC-xx，非样本切片写 {docId}#{chunkIndex} */
  hitChunkIds: string[];
  topScore: number;
  scoreThreshold: number;
  latencyMs: number;
  tokenCost: number;
  /** AI 是否真的采用了召回结果 */
  used: boolean;
  citationCount: number;
  feedback: 'helpful' | 'irrelevant' | 'partial' | null;
  hallucinationSuppressed: boolean;
  redacted: boolean;
  tone: Tone;
  note: string;
}

/**
 * 14 条检索日志：12 条来自 Agent（覆盖全部 7 个 Agent）、2 条来自人工。
 * 其中 KR-01~KR-05 分别关联 agentTraces 的 at-01~at-05；
 * used=false 2 条（KR-12 知识冲突待仲裁、KR-13 运行态数据不在库内）；
 * hallucinationSuppressed=true 2 条（KR-09 状态机编造、KR-14 引用不存在条目）。
 */
export const KB_RETRIEVAL_LOGS: KbRetrievalLogDef[] = [
  {
    id: 'KR-01',
    at: '2026-03-18 14:05',
    query: '幂等下单 Idempotency-Key 两级校验应如何实现',
    queryType: 'hybrid',
    callerType: 'agent',
    callerId: 'ag-code',
    agentTraceId: 'at-01',
    stageId: 'st-code',
    recallStrategy: [
      { type: 'vector', topK: 10, weight: 0.6 },
      { type: 'bm25', topK: 10, weight: 0.4 },
    ],
    candidateCount: 42,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 10,
    hitChunkIds: ['KC-04', 'KC-09', 'KC-02'],
    topScore: 0.91,
    scoreThreshold: 0.72,
    latencyMs: 286,
    tokenCost: 0.42,
    used: true,
    citationCount: 3,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'ai',
    note: 'TASK-2401 编码会话的第 2 步「检索知识库 KB-CODE-02 / KB-ARCH-01」即本次调用；召回的事务边界规约与 API-01 幂等语义被完整采纳，最终实现覆盖率 88%。',
  },
  {
    id: 'KR-02',
    at: '2026-03-19 10:02',
    query: '优惠分摊尾差 0.01 元的复现路径与最大余额法修复方案',
    queryType: 'graph',
    callerType: 'agent',
    callerId: 'ag-test',
    agentTraceId: 'at-02',
    stageId: 'st-test',
    recallStrategy: [
      { type: 'vector', topK: 8, weight: 0.55 },
      { type: 'bm25', topK: 6, weight: 0.25 },
      { type: 'graph', topK: 3, weight: 0.2 },
    ],
    candidateCount: 38,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 8,
    hitChunkIds: ['KC-05', 'KC-14', 'KD-08#11'],
    topScore: 0.94,
    scoreThreshold: 0.72,
    latencyMs: 342,
    tokenCost: 0.56,
    used: true,
    citationCount: 4,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: true,
    tone: 'danger',
    note: '图谱路沿「优惠核销 → 最大余额法 → 金额精度缺陷模式」两跳扩展，命中 BA-1043 五问法 Why-3；测试 Agent 据此在 10:21 定位 BigDecimal 精度丢失点。召回内容含生产订单号样本，出域前按 rd-01 脱敏。',
  },
  {
    id: 'KR-03',
    at: '2026-03-02 09:14',
    query: '订单创建链路重构涉及的限界上下文划分与幂等约定有哪些既有规范',
    queryType: 'semantic',
    callerType: 'agent',
    callerId: 'ag-pm',
    agentTraceId: 'at-03',
    stageId: 'st-req',
    recallStrategy: [{ type: 'vector', topK: 6, weight: 1 }],
    candidateCount: 26,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 6,
    hitChunkIds: ['KD-02#4', 'KD-01#6', 'KD-05#8'],
    topScore: 0.86,
    scoreThreshold: 0.72,
    latencyMs: 248,
    tokenCost: 0.31,
    used: true,
    citationCount: 3,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'ai',
    note: 'Brainstorm 追问阶段的背景检索，用业务术语表消除「核销 / 试算」口述歧义，并据此把 REQ-2401 的边界条件追问收敛到 5 条用户故事（US-01~US-05）。',
  },
  {
    id: 'KR-04',
    at: '2026-03-19 16:18',
    query: '金额计算规约中关于分摊余数回填的强制要求',
    queryType: 'keyword',
    callerType: 'agent',
    callerId: 'ag-review',
    agentTraceId: 'at-04',
    stageId: 'st-code',
    recallStrategy: [
      { type: 'bm25', topK: 10, weight: 0.7 },
      { type: 'vector', topK: 5, weight: 0.3 },
    ],
    candidateCount: 31,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 8,
    hitChunkIds: ['KC-05', 'KD-08#12'],
    topScore: 0.89,
    scoreThreshold: 0.72,
    latencyMs: 196,
    tokenCost: 0.24,
    used: true,
    citationCount: 2,
    feedback: 'partial',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'warn',
    note: 'MR-2410 第 2 轮复检的规约与缺陷模式检查。KD-08 已标记 stale（缺「退款负向分摊余数方向」条款），评审 Agent 仅采纳最大余额法条款，剩余 1 条 must-fix 需人工补充判断，故反馈为 partial。',
  },
  {
    id: 'KR-05',
    at: '2026-03-19 18:05',
    query: '生产切流回滚预案的 RTO 要求与一键回切脚本验证记录',
    queryType: 'hybrid',
    callerType: 'agent',
    callerId: 'ag-ops',
    agentTraceId: 'at-05',
    stageId: 'st-deploy',
    recallStrategy: [
      { type: 'vector', topK: 8, weight: 0.6 },
      { type: 'bm25', topK: 8, weight: 0.4 },
    ],
    candidateCount: 24,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 6,
    hitChunkIds: ['KC-13', 'KD-10#22'],
    topScore: 0.88,
    scoreThreshold: 0.72,
    latencyMs: 232,
    tokenCost: 0.28,
    used: true,
    citationCount: 2,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: true,
    tone: 'warn',
    note: 'at-05 第 3 步「评估回滚预案（RTO 10min）」的知识来源；命中 KI-06 刚归档的批次 3 入口准则切片，据此判定 DBA 未批复 BLOCK-0312 时不具备回切条件，输出「发布单保持 blocked」。',
  },
  {
    id: 'KR-06',
    at: '2026-03-16 11:24',
    query: '大促 3000 TPS 下的分库分表路由策略与热点均衡方案',
    queryType: 'graph',
    callerType: 'agent',
    callerId: 'ag-arch',
    agentTraceId: null,
    stageId: 'st-arch',
    recallStrategy: [
      { type: 'vector', topK: 8, weight: 0.45 },
      { type: 'graph', topK: 4, weight: 0.35 },
      { type: 'bm25', topK: 6, weight: 0.2 },
    ],
    candidateCount: 56,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 10,
    hitChunkIds: ['KD-14#31', 'KC-02', 'KD-01#88'],
    topScore: 0.87,
    scoreThreshold: 0.72,
    latencyMs: 388,
    tokenCost: 0.62,
    used: true,
    citationCount: 3,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'brand',
    note: '为 TASK-2413 的基因分片方案评审做知识准备，图谱路沿「订单上下文 → 分库分表 → 基因分片路由」扩展；结论「基因位取 buyerId 后 10 位哈希」被架构评审采纳并写入 MR-2413。',
  },
  {
    id: 'KR-07',
    at: '2026-03-19 11:36',
    query: 'API-03 跨分片深分页 P95 342ms 的历史根因与治理方案',
    queryType: 'hybrid',
    callerType: 'agent',
    callerId: 'ag-ba',
    agentTraceId: null,
    stageId: 'st-observe',
    recallStrategy: [
      { type: 'vector', topK: 10, weight: 0.5 },
      { type: 'bm25', topK: 10, weight: 0.3 },
      { type: 'graph', topK: 3, weight: 0.2 },
    ],
    candidateCount: 44,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 9,
    hitChunkIds: ['KC-10', 'KC-12', 'KD-20#18'],
    topScore: 0.9,
    scoreThreshold: 0.72,
    latencyMs: 312,
    tokenCost: 0.48,
    used: true,
    citationCount: 3,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'danger',
    note: '可观测分析 Agent 对 BUG-1047 做二次归因：契约切片给出 200ms 承诺、测试报告切片给出实测 342ms、RCA 切片给出游标下推方案，三方交叉验证后输出「治理方案与 TASK-2414 合并推进」。',
  },
  {
    id: 'KR-08',
    at: '2026-03-19 15:08',
    query: '幂等下单在库存扣减失败时应如何回滚订单状态',
    queryType: 'semantic',
    callerType: 'agent',
    callerId: 'ag-code',
    agentTraceId: null,
    stageId: 'st-code',
    recallStrategy: [
      { type: 'vector', topK: 10, weight: 0.7 },
      { type: 'bm25', topK: 6, weight: 0.3 },
    ],
    candidateCount: 37,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 8,
    hitChunkIds: ['KC-07', 'KC-04', 'KD-13#11'],
    topScore: 0.92,
    scoreThreshold: 0.72,
    latencyMs: 274,
    tokenCost: 0.39,
    used: true,
    citationCount: 3,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'info',
    note: 'TASK-2403 库存扣减事务边界收敛的编码前检索。US-03 验收标准给出「CREATING 超 5 秒触发补偿」的明确语义，编码规约给出「补偿必须携带 compensationId 且幂等」的实现约束，直接生成了 rollback 分支骨架。',
  },
  {
    id: 'KR-09',
    at: '2026-03-19 14:22',
    query: '订单状态机允许从 PAID 直接流转到 CLOSED 吗',
    queryType: 'graph',
    callerType: 'agent',
    callerId: 'ag-test',
    agentTraceId: null,
    stageId: 'st-test',
    recallStrategy: [
      { type: 'graph', topK: 5, weight: 0.6 },
      { type: 'vector', topK: 6, weight: 0.4 },
    ],
    candidateCount: 18,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 5,
    hitChunkIds: ['KD-12#58', 'KD-02#9'],
    topScore: 0.74,
    scoreThreshold: 0.72,
    latencyMs: 226,
    tokenCost: 0.21,
    used: true,
    citationCount: 1,
    feedback: 'partial',
    hallucinationSuppressed: true,
    redacted: false,
    tone: 'warn',
    note: '模型初稿断言「PAID 可直接流转 CLOSED（超时关闭）」，但图谱中 CLOSED 为终态且无入边来自 PAID，约束校验拦截该句并要求引用状态流转表；最终用例改为断言「PAID → REFUNDING → CLOSED」。召回分数仅 0.74，接近阈值，故反馈 partial。',
  },
  {
    id: 'KR-10',
    at: '2026-03-19 09:26',
    query: 'BigDecimal setScale HALF_EVEN 与最大余额法在分摊场景的差异',
    queryType: 'keyword',
    callerType: 'human',
    callerId: 'u-zhou',
    agentTraceId: null,
    stageId: 'st-code',
    recallStrategy: [{ type: 'bm25', topK: 10, weight: 1 }],
    candidateCount: 22,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 10,
    hitChunkIds: ['KC-05', 'KD-08#12'],
    topScore: 0.93,
    scoreThreshold: 0.72,
    latencyMs: 168,
    tokenCost: 0,
    used: true,
    citationCount: 0,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'info',
    note: '周浩然在修 MR-2410 最后 1 条 must-fix 前的人工检索；纯 BM25 路（关键词精确匹配「HALF_EVEN」）耗时最低 168ms。人工调用不计 token 成本、不产生 Agent 引用。',
  },
  {
    id: 'KR-11',
    at: '2026-03-18 17:44',
    query: '拆单引擎与订单聚合根的职责边界如何划分',
    queryType: 'hybrid',
    callerType: 'human',
    callerId: 'u-yan',
    agentTraceId: null,
    stageId: 'st-arch',
    recallStrategy: [
      { type: 'vector', topK: 8, weight: 0.6 },
      { type: 'bm25', topK: 6, weight: 0.4 },
    ],
    candidateCount: 29,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 8,
    hitChunkIds: ['KC-03', 'KC-08', 'KD-02#7'],
    topScore: 0.85,
    scoreThreshold: 0.72,
    latencyMs: 254,
    tokenCost: 0,
    used: true,
    citationCount: 0,
    feedback: 'helpful',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'brand',
    note: 'TASK-2415「聚合根边界无法自决，待架构师确认」的处置过程：严慕舟检索后确认履约单不属于订单聚合，由履约上下文自行建模，并把该结论回写为图谱边 KGE-24。',
  },
  {
    id: 'KR-12',
    at: '2026-03-17 20:48',
    query: '本地消息表与 RabbitMQ 事件总线的最终一致性保障机制',
    queryType: 'hybrid',
    callerType: 'agent',
    callerId: 'ag-arch',
    agentTraceId: null,
    stageId: 'st-arch',
    recallStrategy: [
      { type: 'vector', topK: 8, weight: 0.5 },
      { type: 'bm25', topK: 6, weight: 0.3 },
      { type: 'graph', topK: 3, weight: 0.2 },
    ],
    candidateCount: 33,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 8,
    hitChunkIds: ['KD-01#104', 'KD-14#25'],
    topScore: 0.81,
    scoreThreshold: 0.72,
    latencyMs: 342,
    tokenCost: 0.44,
    used: false,
    citationCount: 0,
    feedback: 'irrelevant',
    hallucinationSuppressed: false,
    redacted: false,
    tone: 'warn',
    note: '未采纳原因：KD-01（v1.8，Confluence 基线）与 KD-14（v2.0，G2 冻结版）对 outbox 重试次数的描述冲突（5 次 vs 3 次），相似度 0.93 触发知识冲突仲裁（kb-gov-06），策略要求人工确认前不得注入；架构 Agent 放弃本次召回，改为发起澄清工单。',
  },
  {
    id: 'KR-13',
    at: '2026-03-19 17:52',
    query: '预生产环境新分片集群连接池上限与 DBA 批复配置',
    queryType: 'keyword',
    callerType: 'agent',
    callerId: 'ag-ops',
    agentTraceId: null,
    stageId: 'st-deploy',
    recallStrategy: [
      { type: 'bm25', topK: 10, weight: 0.6 },
      { type: 'vector', topK: 6, weight: 0.4 },
    ],
    candidateCount: 12,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 5,
    hitChunkIds: ['KC-13'],
    topScore: 0.61,
    scoreThreshold: 0.72,
    latencyMs: 188,
    tokenCost: 0.12,
    used: false,
    citationCount: 0,
    feedback: 'irrelevant',
    hallucinationSuppressed: false,
    redacted: true,
    tone: 'slate',
    note: '未采纳原因：连接池上限属运行态配置，知识库只有静态发布归档包 KD-19，且该文档中相关字段已按 rd-08 脱敏；topScore 0.61 低于阈值 0.72，无候选通过精排。运维 Agent 转而调用 Prometheus 实时接口取数，并在结论中标注「非知识库来源」。',
  },
  {
    id: 'KR-14',
    at: '2026-03-19 12:08',
    query: '老年代线性增长且 Full GC 仅回收 22% 的排查经验',
    queryType: 'semantic',
    callerType: 'agent',
    callerId: 'ag-ba',
    agentTraceId: null,
    stageId: 'st-observe',
    recallStrategy: [{ type: 'vector', topK: 8, weight: 1 }],
    candidateCount: 15,
    rerankModel: 'bge-reranker-v2-m3',
    rerankedCount: 5,
    hitChunkIds: ['KD-11#38', 'KD-20#22'],
    topScore: 0.73,
    scoreThreshold: 0.72,
    latencyMs: 296,
    tokenCost: 0.36,
    used: true,
    citationCount: 1,
    feedback: 'partial',
    hallucinationSuppressed: true,
    redacted: false,
    tone: 'danger',
    note: '幻觉抑制：模型初稿引用了知识库中并不存在的「G1 混合回收阈值配置基线」条目，引用溯源校验（kb-gov-05）核对该 docId 不在索引中，拦截该句并要求补充证据；最终结论改为 BUG-1053「堆快照不足，待长稳压测复跑后定位」，与 KD-11 第 7 章 JVM 故障 SOP 一致。',
  },
];

/** 检索评测集定义 */
export interface KbEvalSetDef {
  id: string;
  name: string;
  desc: string;
  queryCount: number;
  /** 黄金答案对应的文档（KD-*） */
  goldenDocIds: string[];
  createdAt: string;
  lastRunAt: string;
  metrics: {
    recallAt5: number;
    recallAt10: number;
    mrr: number;
    ndcgAt10: number;
    precisionAt5: number;
    answerFaithfulnessPct: number;
    avgLatencyMs: number;
  };
  /** 近 5 次评测趋势（最后一条与 metrics 一致） */
  history: { at: string; recallAt10: number; mrr: number; ndcgAt10: number; faithfulnessPct: number }[];
  /** 为提升指标采取的具体调优动作 */
  tuningActions: string[];
  status: 'active' | 'draft' | 'archived';
  tone: Tone;
}

/** 3 个检索评测集（合计 270 问），每周三 22:00 自动回归 */
export const KB_EVAL_SETS: KbEvalSetDef[] = [
  {
    id: 'KQ-01',
    name: '订单域架构与规范检索评测集',
    desc: '120 个黄金问答对，覆盖四层架构依赖规则、限界上下文边界、14 份接口契约语义与 Java / Vue3 编码规约，问题由 ag-arch 与 ag-code 近 90 日的真实检索日志去重后人工标注生成。',
    queryCount: 120,
    goldenDocIds: ['KD-01', 'KD-02', 'KD-06', 'KD-14', 'KD-15'],
    createdAt: '2026-02-10 14:00',
    lastRunAt: '2026-03-18 22:00',
    metrics: {
      recallAt5: 0.864,
      recallAt10: 0.912,
      mrr: 0.868,
      ndcgAt10: 0.891,
      precisionAt5: 0.792,
      answerFaithfulnessPct: 94.6,
      avgLatencyMs: 262,
    },
    history: [
      { at: '2026-02-18 22:00', recallAt10: 0.826, mrr: 0.771, ndcgAt10: 0.804, faithfulnessPct: 88.1 },
      { at: '2026-02-25 22:00', recallAt10: 0.851, mrr: 0.798, ndcgAt10: 0.828, faithfulnessPct: 90.2 },
      { at: '2026-03-04 22:00', recallAt10: 0.878, mrr: 0.826, ndcgAt10: 0.857, faithfulnessPct: 91.8 },
      { at: '2026-03-11 22:00', recallAt10: 0.896, mrr: 0.849, ndcgAt10: 0.876, faithfulnessPct: 93.4 },
      { at: '2026-03-18 22:00', recallAt10: 0.912, mrr: 0.868, ndcgAt10: 0.891, faithfulnessPct: 94.6 },
    ],
    tuningActions: [
      '切片策略由 fixed(512) 改为 heading-aware，架构规范类文档 recall@10 由 0.826 提升至 0.878',
      '引入 bge-reranker-v2-m3 二阶段重排，MRR 累计提升 0.055、答案忠实度提升 3.4 个百分点',
      '向量 / BM25 融合权重由 0.7:0.3 调整为 0.6:0.4，接口契约类查询 precision@5 提升 6.4 个百分点',
      '依据 KD-05 业务术语表建立同义词扩展（幂等键 / 幂等性 / Idempotency-Key），修复 BUG-1043 复盘暴露的召回缺口',
    ],
    status: 'active',
    tone: 'ok',
  },
  {
    id: 'KQ-02',
    name: '金额精度与合规敏感问答评测集',
    desc: '86 个问答对，专测金额分摊、BigDecimal 精度、脱敏与出域合规、审计留痕等高风险问题；额外校验「无引用即阻断」与过期文档降权是否生效，是幻觉抑制能力的主评测集。',
    queryCount: 86,
    goldenDocIds: ['KD-03', 'KD-04', 'KD-08', 'KD-20'],
    createdAt: '2026-02-28 10:30',
    lastRunAt: '2026-03-18 22:40',
    metrics: {
      recallAt5: 0.791,
      recallAt10: 0.874,
      mrr: 0.802,
      ndcgAt10: 0.836,
      precisionAt5: 0.744,
      answerFaithfulnessPct: 91.2,
      avgLatencyMs: 284,
    },
    history: [
      { at: '2026-02-28 22:00', recallAt10: 0.762, mrr: 0.704, ndcgAt10: 0.741, faithfulnessPct: 84.6 },
      { at: '2026-03-04 22:00', recallAt10: 0.801, mrr: 0.738, ndcgAt10: 0.776, faithfulnessPct: 86.9 },
      { at: '2026-03-11 22:00', recallAt10: 0.838, mrr: 0.771, ndcgAt10: 0.804, faithfulnessPct: 89.3 },
      { at: '2026-03-15 22:00', recallAt10: 0.856, mrr: 0.788, ndcgAt10: 0.821, faithfulnessPct: 90.4 },
      { at: '2026-03-18 22:40', recallAt10: 0.874, mrr: 0.802, ndcgAt10: 0.836, faithfulnessPct: 91.2 },
    ],
    tuningActions: [
      '对 stale 文档（KD-08）施加 0.6 降权因子，避免 v3.2 附录 C 的过期金额条款覆盖 v3.3 新规',
      '把 BA-1043 五问法结论沉淀为「金额精度缺陷模式」图谱节点，使因果类问题可走图谱路召回',
      '合规类问题强制开启引用溯源校验，未挂载 docId 的答案一律阻断（近 30 日拦截 4 次）',
      '补充 12 个「负向分摊 / 退款尾差」对抗问题，覆盖 MR-2410 剩余 must-fix 场景',
    ],
    status: 'active',
    tone: 'danger',
  },
  {
    id: 'KQ-03',
    name: '运维发布与根因诊断评测集',
    desc: '64 个问答对，覆盖灰度批次准则、回滚 RTO、告警处置 SOP 与根因诊断链路。因 KS-05 / KS-06 文档量偏少（各 2 篇）且环境拓扑快照尚未归档，当前指标最低，仍在扩充黄金集。',
    queryCount: 64,
    goldenDocIds: ['KD-10', 'KD-11', 'KD-19', 'KD-20'],
    createdAt: '2026-03-06 16:20',
    lastRunAt: '2026-03-18 23:10',
    metrics: {
      recallAt5: 0.742,
      recallAt10: 0.838,
      mrr: 0.771,
      ndcgAt10: 0.802,
      precisionAt5: 0.688,
      answerFaithfulnessPct: 88.4,
      avgLatencyMs: 306,
    },
    history: [
      { at: '2026-03-06 22:00', recallAt10: 0.714, mrr: 0.652, ndcgAt10: 0.698, faithfulnessPct: 82.4 },
      { at: '2026-03-09 22:00', recallAt10: 0.756, mrr: 0.688, ndcgAt10: 0.731, faithfulnessPct: 84.1 },
      { at: '2026-03-12 22:00', recallAt10: 0.789, mrr: 0.716, ndcgAt10: 0.762, faithfulnessPct: 85.8 },
      { at: '2026-03-15 22:00', recallAt10: 0.812, mrr: 0.744, ndcgAt10: 0.784, faithfulnessPct: 87.2 },
      { at: '2026-03-18 23:10', recallAt10: 0.838, mrr: 0.771, ndcgAt10: 0.802, faithfulnessPct: 88.4 },
    ],
    tuningActions: [
      '把发布单批次表按 table-row 切片，避免「批次 3 入口准则」被跨行切断（precision@5 提升 5.2 个百分点）',
      '为灰度批次截图（KD-19）补做 OCR，使图片中的观察指标可被检索',
      '运行态配置类问题（连接池、副本数）加入负样本，训练 Agent 在低分时改调 Prometheus 而非硬答',
      '待 REL-2403 切流完成后补入生产环境拓扑快照，预计 recall@10 可提升至 0.88 以上',
    ],
    status: 'draft',
    tone: 'warn',
  },
];

/* ==== 5. AI 消费统计与治理 ==== */

/** 单个 Agent 的知识消费统计（近 30 日） */
export interface KbConsumeStatDef {
  agentId: string;
  agentName: string;
  stageId: string;
  retrievalCount30d: number;
  avgHitsPerQuery: number;
  topKUsed: number;
  /** AI 采纳召回结果的比例 */
  acceptRatePct: number;
  citationCount: number;
  /** 注入知识前的幻觉率 */
  withoutKbPct: number;
  /** 注入知识后的幻觉率（必须显著低于 withoutKbPct） */
  withKbPct: number;
  tokenCostFromKb: number;
  topSpaceIds: string[];
  topDocIds: string[];
  /** 端到端知识注入耗时（检索 + 重排 + 上下文拼装），大于纯检索耗时 */
  latencyImpactMs: number;
  feedbackScore: number;
  /** 近 4 个完整自然周（02-23 ~ 03-19）的趋势，合计 ≤ retrievalCount30d */
  trend: { week: string; retrievalCount: number; acceptRatePct: number }[];
  tone: Tone;
}

/**
 * 7 条 Agent 消费统计（每个 Agent 一条）。
 * retrievalCount30d 合计 3216 = kbStats.retrievalByAgents30d；
 * citationCount 合计 2620 = kbStats.citationCount30d；
 * tokenCostFromKb 合计 572.0 = kbStats.tokenCost30dYuan。
 * 幻觉率加权（按 retrievalCount30d 加权）：注入前 12.04%、注入后 2.50%，
 * 相对下降 (12.038 − 2.496) ÷ 12.038 = 79.3% = kbStats.hallucinationReductionPct。
 */
export const KB_CONSUME_STATS: KbConsumeStatDef[] = [
  {
    agentId: 'ag-pm',
    agentName: '需求澄清 Agent',
    stageId: 'st-req',
    retrievalCount30d: 318,
    avgHitsPerQuery: 4.2,
    topKUsed: 6,
    acceptRatePct: 78.4,
    citationCount: 214,
    withoutKbPct: 8.6,
    withKbPct: 1.9,
    tokenCostFromKb: 42.6,
    topSpaceIds: ['KS-02', 'KS-01', 'KS-04'],
    topDocIds: ['KD-12', 'KD-13', 'KD-05'],
    latencyImpactMs: 240,
    feedbackScore: 4.4,
    trend: [
      { week: '02-23~03-01', retrievalCount: 72, acceptRatePct: 74.6 },
      { week: '03-02~03-08', retrievalCount: 76, acceptRatePct: 76.8 },
      { week: '03-09~03-15', retrievalCount: 82, acceptRatePct: 79.2 },
      { week: '03-16~03-19', retrievalCount: 84, acceptRatePct: 80.1 },
    ],
    tone: 'ai',
  },
  {
    agentId: 'ag-arch',
    agentName: '架构设计 Agent',
    stageId: 'st-arch',
    retrievalCount30d: 402,
    avgHitsPerQuery: 4.8,
    topKUsed: 8,
    acceptRatePct: 81.6,
    citationCount: 356,
    withoutKbPct: 9.4,
    withKbPct: 2.1,
    tokenCostFromKb: 88.4,
    topSpaceIds: ['KS-01', 'KS-03', 'KS-02'],
    topDocIds: ['KD-01', 'KD-14', 'KD-15'],
    latencyImpactMs: 310,
    feedbackScore: 4.6,
    trend: [
      { week: '02-23~03-01', retrievalCount: 88, acceptRatePct: 78.4 },
      { week: '03-02~03-08', retrievalCount: 96, acceptRatePct: 80.2 },
      { week: '03-09~03-15', retrievalCount: 104, acceptRatePct: 82.6 },
      { week: '03-16~03-19', retrievalCount: 106, acceptRatePct: 83.1 },
    ],
    tone: 'brand',
  },
  {
    agentId: 'ag-code',
    agentName: '编码实现 Agent',
    stageId: 'st-code',
    retrievalCount30d: 986,
    avgHitsPerQuery: 5.6,
    topKUsed: 10,
    acceptRatePct: 86.2,
    citationCount: 812,
    withoutKbPct: 14.2,
    withKbPct: 3.1,
    tokenCostFromKb: 186.2,
    topSpaceIds: ['KS-03', 'KS-01', 'KS-04'],
    topDocIds: ['KD-06', 'KD-15', 'KD-17'],
    latencyImpactMs: 380,
    feedbackScore: 4.7,
    trend: [
      { week: '02-23~03-01', retrievalCount: 208, acceptRatePct: 82.4 },
      { week: '03-02~03-08', retrievalCount: 226, acceptRatePct: 84.6 },
      { week: '03-09~03-15', retrievalCount: 254, acceptRatePct: 86.8 },
      { week: '03-16~03-19', retrievalCount: 268, acceptRatePct: 87.4 },
    ],
    tone: 'info',
  },
  {
    agentId: 'ag-review',
    agentName: '代码评审 Agent',
    stageId: 'st-code',
    retrievalCount30d: 534,
    avgHitsPerQuery: 5.1,
    topKUsed: 8,
    acceptRatePct: 83.9,
    citationCount: 468,
    withoutKbPct: 12.8,
    withKbPct: 2.6,
    tokenCostFromKb: 96.8,
    topSpaceIds: ['KS-03', 'KS-01', 'KS-06'],
    topDocIds: ['KD-06', 'KD-08', 'KD-20'],
    latencyImpactMs: 296,
    feedbackScore: 4.5,
    trend: [
      { week: '02-23~03-01', retrievalCount: 118, acceptRatePct: 80.2 },
      { week: '03-02~03-08', retrievalCount: 126, acceptRatePct: 82.4 },
      { week: '03-09~03-15', retrievalCount: 142, acceptRatePct: 84.6 },
      { week: '03-16~03-19', retrievalCount: 138, acceptRatePct: 85.2 },
    ],
    tone: 'warn',
  },
  {
    agentId: 'ag-test',
    agentName: '测试生成 Agent',
    stageId: 'st-test',
    retrievalCount30d: 476,
    avgHitsPerQuery: 4.9,
    topKUsed: 8,
    acceptRatePct: 79.8,
    citationCount: 391,
    withoutKbPct: 11.6,
    withKbPct: 2.4,
    tokenCostFromKb: 74.5,
    topSpaceIds: ['KS-04', 'KS-01', 'KS-02'],
    topDocIds: ['KD-09', 'KD-18', 'KD-13'],
    latencyImpactMs: 342,
    feedbackScore: 4.3,
    trend: [
      { week: '02-23~03-01', retrievalCount: 96, acceptRatePct: 75.8 },
      { week: '03-02~03-08', retrievalCount: 108, acceptRatePct: 78.2 },
      { week: '03-09~03-15', retrievalCount: 132, acceptRatePct: 80.6 },
      { week: '03-16~03-19', retrievalCount: 128, acceptRatePct: 81.4 },
    ],
    tone: 'teal',
  },
  {
    agentId: 'ag-ops',
    agentName: '部署运维 Agent',
    stageId: 'st-deploy',
    retrievalCount30d: 268,
    avgHitsPerQuery: 3.8,
    topKUsed: 5,
    acceptRatePct: 74.2,
    citationCount: 176,
    withoutKbPct: 10.2,
    withKbPct: 1.8,
    tokenCostFromKb: 38.9,
    topSpaceIds: ['KS-05', 'KS-06', 'KS-01'],
    topDocIds: ['KD-10', 'KD-19', 'KD-11'],
    latencyImpactMs: 208,
    feedbackScore: 4.1,
    trend: [
      { week: '02-23~03-01', retrievalCount: 58, acceptRatePct: 71.4 },
      { week: '03-02~03-08', retrievalCount: 62, acceptRatePct: 73.2 },
      { week: '03-09~03-15', retrievalCount: 70, acceptRatePct: 75.6 },
      { week: '03-16~03-19', retrievalCount: 72, acceptRatePct: 76.1 },
    ],
    tone: 'warn',
  },
  {
    agentId: 'ag-ba',
    agentName: '可观测分析 Agent',
    stageId: 'st-observe',
    retrievalCount30d: 232,
    avgHitsPerQuery: 4.4,
    topKUsed: 6,
    acceptRatePct: 76.5,
    citationCount: 203,
    withoutKbPct: 13.4,
    withKbPct: 2.2,
    tokenCostFromKb: 44.6,
    topSpaceIds: ['KS-06', 'KS-05', 'KS-04'],
    topDocIds: ['KD-20', 'KD-11', 'KD-18'],
    latencyImpactMs: 264,
    feedbackScore: 4.2,
    trend: [
      { week: '02-23~03-01', retrievalCount: 48, acceptRatePct: 72.6 },
      { week: '03-02~03-08', retrievalCount: 54, acceptRatePct: 74.8 },
      { week: '03-09~03-15', retrievalCount: 62, acceptRatePct: 77.4 },
      { week: '03-16~03-19', retrievalCount: 60, acceptRatePct: 78.2 },
    ],
    tone: 'danger',
  },
];

/** 阶段归档覆盖率（kbStats.coverage.byStage 的元素） */
export interface KbStageCoverageDef {
  stageId: string;
  stageName: string;
  /** 该环节 SDLC_STAGES.outputs 的条数（均为 3） */
  expectedArtifacts: number;
  /** 本迭代已生成知识文档（KB_STAGE_ARTIFACT_MAP.docId 非空）的条数 */
  archivedArtifacts: number;
  coveragePct: number;
  tone: Tone;
}

/** 知识库全局统计定义 */
export interface KbStatsDef {
  id: string;
  /** 统计口径说明 */
  range: string;
  totalSpaces: number;
  totalDocs: number;
  totalChunks: number;
  totalTokensM: number;
  totalSizeGb: number;
  autoArchivedPct: number;
  autoArchiveCount30d: number;
  manualUploadCount30d: number;
  retrievalCount30d: number;
  retrievalByAgents30d: number;
  retrievalByHumans30d: number;
  avgRetrievalMs: number;
  cacheHitRatePct: number;
  citationCount30d: number;
  staleDocCount: number;
  staleDocPct: number;
  redactedDocCount: number;
  restrictedDocCount: number;
  graphNodes: number;
  graphEdges: number;
  ingestSuccessRatePct: number;
  evalRecallAt10: number;
  evalMrr: number;
  faithfulnessPct: number;
  hallucinationReductionPct: number;
  tokenCost30dYuan: number;
  storageCost30dYuan: number;
  topConsumers: { agentId: string; count: number }[];
  coverage: { byStage: KbStageCoverageDef[] };
}

/**
 * 知识库全局统计（近 30 日：2026-02-18 ~ 2026-03-19）。逐条核对口径：
 * · totalSpaces 6 = KB_SPACES.length
 * · totalDocs 20 = KB_DOCS.length = Σ KS-*.docCount（7+3+4+2+2+2）
 * · totalChunks 2406 = Σ KB_DOCS.chunks = Σ KS-*.chunkCount（768+374+558+290+200+216）
 * · totalTokensM 1.22 = Σ KB_DOCS.tokensK 1219 ÷ 1000 = Σ KS-*.tokensK（380+200+285+143+99+112）÷ 1000
 * · totalSizeGb 0.02 = 原文 13058KB(12.75MB) + pgvector 索引 9.4MB(2406×1024×4B) + OCR 中间产物 ≈ 22.6MB
 * · autoArchivedPct 45.0 = 事件驱动自动归档 9 篇（KD-12~KD-20）÷ 20；
 *   autoArchiveCount30d 9 + manualUploadCount30d 11（Confluence / 飞书存量同步与人工复核上传）= 20
 * · retrievalCount30d 3842 = retrievalByAgents30d 3216 + retrievalByHumans30d 626；
 *   注意 Σ KB_DOCS.hitCount30d = 4986 > 3842，因一次检索可命中多篇文档
 * · citationCount30d 2620 = Σ KB_CONSUME_STATS.citationCount
 * · tokenCost30dYuan 572.0 = Σ KB_CONSUME_STATS.tokenCostFromKb（仅 RAG 注入的模型 token 成本，
 *   不含入库解析/向量化成本 38.36 元，后者单列于 KB_INGEST_RUNS.costYuan）
 * · staleDocCount 2 = KD-07 + KD-08（staleness.isStale=true），staleDocPct = 2 ÷ 20 = 10.0
 * · redactedDocCount 5 = KD-03 / KD-17 / KD-18 / KD-19 / KD-20（redacted=true）
 * · restrictedDocCount 5 = accessLevel 为 restricted 或 confidential 的文档
 *   （KD-03、KD-04、KD-17、KD-20 restricted + KD-19 confidential）
 * · graphNodes 18 / graphEdges 26 = KB_GRAPH_NODES.length / KB_GRAPH_EDGES.length，
 *   亦等于 Σ KB_INGEST_RUNS.graphNodesAdded / graphEdgesAdded
 * · ingestSuccessRatePct 85.7 = (success 5 + partial 1) ÷ 已结束 7（running 1 条不计入分母）
 * · evalRecallAt10 0.912 / evalMrr 0.868 / faithfulnessPct 94.6 取自活跃评测集 KQ-01 最近一次结果
 * · hallucinationReductionPct 79.3 = (12.038 − 2.496) ÷ 12.038，两个数值为 7 个 Agent 按
 *   retrievalCount30d 加权后的 withoutKbPct / withKbPct（展示时四舍五入为 12.04% / 2.50%）
 * · coverage.byStage 6 条对应 KB_STAGE_ARTIFACT_MAP 的 18 条（每环节 expected 3），
 *   archived 合计 16（st-deploy 的「环境拓扑快照」与 st-observe 的「技术债清单」docId 为 null）
 */
export const kbStats: KbStatsDef = {
  id: 'KBS-01',
  range: '近 30 日（2026-02-18 ~ 2026-03-19）',
  totalSpaces: 6,
  totalDocs: 20,
  totalChunks: 2406,
  totalTokensM: 1.22,
  totalSizeGb: 0.02,
  autoArchivedPct: 45.0,
  autoArchiveCount30d: 9,
  manualUploadCount30d: 11,
  retrievalCount30d: 3842,
  retrievalByAgents30d: 3216,
  retrievalByHumans30d: 626,
  avgRetrievalMs: 268,
  cacheHitRatePct: 34.6,
  citationCount30d: 2620,
  staleDocCount: 2,
  staleDocPct: 10.0,
  redactedDocCount: 5,
  restrictedDocCount: 5,
  graphNodes: 18,
  graphEdges: 26,
  ingestSuccessRatePct: 85.7,
  evalRecallAt10: 0.912,
  evalMrr: 0.868,
  faithfulnessPct: 94.6,
  hallucinationReductionPct: 79.3,
  tokenCost30dYuan: 572.0,
  storageCost30dYuan: 68.4,
  topConsumers: [
    { agentId: 'ag-code', count: 986 },
    { agentId: 'ag-review', count: 534 },
    { agentId: 'ag-test', count: 476 },
    { agentId: 'ag-arch', count: 402 },
    { agentId: 'ag-pm', count: 318 },
    { agentId: 'ag-ops', count: 268 },
    { agentId: 'ag-ba', count: 232 },
  ],
  coverage: {
    byStage: [
      { stageId: 'st-req', stageName: '需求澄清', expectedArtifacts: 3, archivedArtifacts: 3, coveragePct: 100.0, tone: 'ok' },
      { stageId: 'st-arch', stageName: '架构设计', expectedArtifacts: 3, archivedArtifacts: 3, coveragePct: 100.0, tone: 'ok' },
      { stageId: 'st-code', stageName: '编码实现', expectedArtifacts: 3, archivedArtifacts: 3, coveragePct: 100.0, tone: 'ok' },
      { stageId: 'st-test', stageName: '测试验证', expectedArtifacts: 3, archivedArtifacts: 3, coveragePct: 100.0, tone: 'ok' },
      { stageId: 'st-deploy', stageName: '部署发布', expectedArtifacts: 3, archivedArtifacts: 2, coveragePct: 66.7, tone: 'warn' },
      { stageId: 'st-observe', stageName: '运维观测', expectedArtifacts: 3, archivedArtifacts: 2, coveragePct: 66.7, tone: 'warn' },
    ],
  },
};

/** 知识库治理策略定义 */
export interface KbGovernanceDef {
  id: string;
  name: string;
  desc: string;
  enforcedBy: 'weknora' | 'platform' | 'both';
  /** 关联 data.ts egressPolicy（EGRESS-*）/ redactRules（rd-*）的真实 id */
  relatedPolicyIds: string[];
  scope: 'space' | 'doc' | 'chunk' | 'query';
  ruleExpr: string;
  violationCount30d: number;
  lastViolationAt: string | null;
  /** 关联 data.ts auditLogs 的真实 id（al-*） */
  auditLogIds: string[];
  ownerIds: string[];
  status: 'enabled' | 'monitor' | 'disabled';
  tone: Tone;
}

/** 6 条知识库治理策略，近 30 日累计违规拦截 19 次 */
export const KB_GOVERNANCE: KbGovernanceDef[] = [
  {
    id: 'kb-gov-01',
    name: '最小化上传边界',
    desc: '只归档 SDLC 环节的结论性产物，禁止把生产原始数据集、客户明细与密钥物料入库；env-staging / env-prod 命中 EGRESS-DENY 的物料一律拒绝。近 30 日拦截 1 次：顾时衍尝试把生产订单明细数据集（DS-ORDER-PROD）作为测试样本上传至 KS-04。',
    enforcedBy: 'both',
    relatedPolicyIds: ['EGRESS-DENY', 'EGRESS-MASK'],
    scope: 'doc',
    ruleExpr: "doc.sourceEnv in ['env-staging','env-prod'] && doc.containsRawPii == true -> deny",
    violationCount30d: 1,
    lastViolationAt: '2026-03-16 09:40',
    auditLogIds: ['al-0019'],
    ownerIds: ['u-lin', 'u-meng'],
    status: 'enabled',
    tone: 'danger',
  },
  {
    id: 'kb-gov-02',
    name: '敏感字段脱敏',
    desc: '切片入库前对 8 类敏感字段做统一脱敏（SEC-MASK-2.1），包括手机号、身份证号、收货地址、银行卡号、收货人姓名与访问令牌；OCR 文本层同样过一遍正则+NER 双通道检测。近 30 日命中 7 次，集中在 KD-17 的测试夹具与 KD-19 的实例配置。',
    enforcedBy: 'both',
    relatedPolicyIds: ['rd-01', 'rd-02', 'rd-03', 'rd-04', 'rd-06', 'rd-08'],
    scope: 'chunk',
    ruleExpr: 'chunk.text ~= /(1[3-9]\\d{9}|\\d{17}[\\dXx]|\\d{16,19})/ -> mask',
    violationCount30d: 7,
    lastViolationAt: '2026-03-19 15:43',
    auditLogIds: ['al-0018', 'al-0009'],
    ownerIds: ['u-lin'],
    status: 'enabled',
    tone: 'warn',
  },
  {
    id: 'kb-gov-03',
    name: '分级访问控制',
    desc: '空间与文档四级访问（public / internal / restricted / confidential），Agent 使用共享账号 u-ai-copilot 检索时继承调用人的密级，不得越级；KS-05 为 confidential，ag-ops 仅在发布决策上下文中可读原文，其余场景只返回摘要。近 30 日 3 次越级尝试被拒。',
    enforcedBy: 'platform',
    relatedPolicyIds: ['EGRESS-DENY'],
    scope: 'space',
    ruleExpr: 'user.clearance < space.accessLevel -> deny && audit',
    violationCount30d: 3,
    lastViolationAt: '2026-03-15 15:02',
    auditLogIds: ['al-0020', 'al-0002', 'al-0025'],
    ownerIds: ['u-lin', 'u-gu'],
    status: 'enabled',
    tone: 'info',
  },
  {
    id: 'kb-gov-04',
    name: '知识保鲜与失效',
    desc: '每篇文档按 verifyCycleDays（7 / 30 / 60 / 90 天四档）定期复核，超期即标记 isStale 并在重排阶段施加 0.6 降权；架构评审通过会自动触发相关文档的保鲜复核任务。当前 KD-07（Vue3 规范 v2.4）与 KD-08（金额精度附录 C）两篇超期，占全库 10%。',
    enforcedBy: 'platform',
    relatedPolicyIds: [],
    scope: 'doc',
    ruleExpr: 'daysSince(doc.lastVerifiedAt) > doc.verifyCycleDays -> markStale && downweight(0.6)',
    violationCount30d: 2,
    lastViolationAt: '2026-03-19 06:00',
    auditLogIds: ['al-0022'],
    ownerIds: ['u-yan', 'u-su'],
    status: 'enabled',
    tone: 'amber',
  },
  {
    id: 'kb-gov-05',
    name: '引用溯源强制',
    desc: 'WeKnora 侧强制「无引用不成立」：Agent 输出的每条结论必须挂载真实存在的 docId + chunkId，引用校验器还会比对引文与结论的语义一致性，不通过即拦截该句。近 30 日拦截 4 次，其中 KR-14 拦截了 ag-ba 编造的「G1 混合回收阈值配置基线」条目。',
    enforcedBy: 'weknora',
    relatedPolicyIds: [],
    scope: 'query',
    ruleExpr: 'answer.citationCount == 0 || citation.docId not in index -> block',
    violationCount30d: 4,
    lastViolationAt: '2026-03-19 12:08',
    auditLogIds: ['al-0007', 'al-0005'],
    ownerIds: ['u-lin', 'u-zhou'],
    status: 'enabled',
    tone: 'ai',
  },
  {
    id: 'kb-gov-06',
    name: '知识冲突仲裁',
    desc: '对语义相似度 > 0.92 但结论相左的切片做隔离，通知双方 Owner 仲裁后才恢复召回；当前处于 monitor 模式（只告警不硬隔离）。近 30 日发现 2 起：KD-01 v1.8 与 KD-14 v2.0 对 outbox 重试次数描述不一致（KR-12 因此未采纳），以及聚合根边界的两版表述（由严慕舟在架构评审中裁定）。',
    enforcedBy: 'both',
    relatedPolicyIds: [],
    scope: 'chunk',
    ruleExpr: 'similarity(a,b) > 0.92 && a.conclusion != b.conclusion -> quarantine && notifyOwner',
    violationCount30d: 2,
    lastViolationAt: '2026-03-17 20:48',
    auditLogIds: ['al-0010', 'al-0014'],
    ownerIds: ['u-yan'],
    status: 'monitor',
    tone: 'pink',
  },
];
