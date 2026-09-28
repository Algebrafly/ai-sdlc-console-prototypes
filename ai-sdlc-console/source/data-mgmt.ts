/**
 * ============================================================
 * AI 研发协作控制台 · 管理域原型数据层（data-mgmt）
 * ------------------------------------------------------------
 * 本模块为 5 个管理页面提供类型定义与贯穿案例数据：
 *   1. 项目管理（ProjectPage）   —— 项目组合、里程碑、干系人 RACI、项目风险、AI 项目周报
 *   2. 人员管理（PeoplePage）    —— 技能库、人 × 技能矩阵、成员档案、迭代负载、AI 协作偏好、认证
 *   3. 团队管理（TeamPage）      —— 团队组织、团队效能快照（3 个周期）、跨团队协作、研发仪式
 *   4. 需求管理（ReqPoolPage）   —— 需求池（上游候选池）、需求评审轮次、需求漏斗、来源统计
 *   5. 版本管理（ReleasePage）   —— 版本、版本基线、变更集、发布日历、版本对比
 *
 * 贯穿主线与 ./data 完全一致：「订单中心重构」（EPIC-ORDER-REF），
 * 当前迭代 SP-24（2026-03-02 ~ 2026-03-27），原型「今天」TODAY = 2026-03-19。
 * 目标：把单体 order-service 拆成订单 / 履约 / 优惠三个限界上下文，支撑大促 3000 TPS。
 *
 * ------------------------------------------------------------
 * 【派生口径与自洽规则】（所有百分比 / 合计数 / 排名均按下述公式核算）
 *
 * A. 需求池 AI 优先级分（ReqPoolItemDef.aiPriorityScore，取值 10 ~ 100）
 *      aiPriorityScore = round( 4 × businessValue
 *                             + 3 × urgency
 *                             + 1.5 × riskScore
 *                             + 1.5 × (11 − techComplexity) )
 *    其中四个输入均为 1 ~ 10 的整数。等价写法（归一到百分制后加权）：
 *      businessValue × 10 × 0.40 + urgency × 10 × 0.30
 *    + riskScore × 10 × 0.15 + (11 − techComplexity) × 10 × 0.15
 *    权重合计 1.00；业务价值最重（40%），紧急度次之（30%），风险与「实现难度反向」各 15%。
 *    边界校验：bv=urg=risk=10 且 tc=1 → 100；bv=urg=risk=1 且 tc=10 → 10。
 *
 * B. 需求池 tone 分档（ReqPoolItemDef.tone）
 *      stage === '已拒绝' → 'slate'；stage === '已交付' → 'ok'
 *      否则 aiPriorityScore ≥ 80 → 'brand'（P0 级）；65 ~ 79 → 'warn'（P1 级）；
 *           45 ~ 64 → 'info'（P2 级）；< 45 → 'neutral'（观察级）
 *
 * C. 项目风险分（ProjectRiskDef.score，取值 1 ~ 25）
 *      概率 / 影响映射：low = 1、medium = 3、high = 5
 *      score = 概率值 × 影响值
 *      tone：score ≥ 20 → 'danger'；10 ~ 19 → 'warn'；5 ~ 9 → 'info'；< 5 → 'neutral'；
 *            status === 'closed' 时统一覆写为 'ok'
 *
 * D. 负载率（MemberProfileDef.loadPct / WorkloadDef.loadPct）
 *      loadPct = round(allocatedPoints ÷ capacityPoints × 1000) ÷ 10   （保留 1 位小数）
 *      capacityPoints 直接取 ./data 中 USERS.capacity；overload = loadPct > 100
 *      WorkloadDef.tone：loadPct ≥ 150 → 'danger'；80 ~ 149.9 → 'warn'；< 80 → 'ok'
 *      说明：./data 的 TASKS 故事点合计为 110，而 SPRINTS['SP-24'].committed 为 96，
 *            两者在既有数据中本就不一致；本模块 allocatedPoints 一律以
 *            TASKS 明细中 ownerId 为该成员的故事点求和为准（研发角色可逐条复核），
 *            非研发角色（产品 / 测试 / PMO / 管理者）在 TASKS 中不承接工作项，其
 *            allocatedPoints 由 SP-24 承诺的非任务型工作项折算，并在 WorkloadDef.note
 *            中逐条写明构成，保证 loadPct 算式始终可复核。
 *            TEAM_METRICS 的团队合计口径则对齐 SPRINTS.committed / completed（见 E 节）。
 *
 * E. 团队效能快照（TeamMetricSnapshot）
 *      sayDoRatioPct   = round(velocityPoints ÷ committedPoints × 1000) ÷ 10
 *      completionRatePct = 任务条数口径的完成率（与故事点口径分开统计）
 *      tone：sayDoRatioPct ≥ 95 → 'ok'；70 ~ 94.9 → 'warn'；< 70 → 'danger'
 *      合计校验：每个 sprintId 下 7 个团队的 committedPoints 之和 = SPRINTS.committed，
 *                velocityPoints 之和 = SPRINTS.completed
 *                （SP-22：88 / 88；SP-23：92 / 89；SP-24：96 / 65）
 *
 * F. 跨团队协作健康度（TeamCollabDef.health）
 *      blockedCount ≥ 1 → 'risk'；否则 avgWaitHours > slaHours ÷ 2 → 'warn'；其余 → 'ok'
 *
 * G. 技能矩阵（SkillMatrixCell）
 *      certified = true 当且仅当该成员在 CERTIFICATIONS 中持有 relatedSkillIds 覆盖该技能的证书；
 *      aiAssistRatePct 分档约定（等级越低越依赖 AI 辅助）：
 *        level 5 → 38 ~ 52；level 4 → 50 ~ 64；level 3 → 62 ~ 74；
 *        level 2 → 74 ~ 86；level 1 → 86 ~ 94
 *      lastUsedAt 约定：level ≥ 4 落在 2026-03；level 3 落在 2026-02 ~ 03；
 *                       level 2 落在 2026-01 ~ 03；level 1 落在 2025 年
 *
 * H. 版本 / 变更集 / 版本对比的合计口径
 *      VersionDef.featureCount        = requirementIds.length（v2.2 / v2.3 例外，见其 JSDoc）
 *      VersionBaselineDef.includedCounts 与所属 VERSIONS 条目的数组长度一一对应
 *      VersionDiffDef.summary 由「目标版本的变更集」聚合而来：
 *        addedFeatures   = changeType '新增' 的变更集数
 *        changedFeatures = changeType '变更' 或 '配置' 的变更集数
 *        removedFeatures = changeType '移除' 的变更集数
 *        newApis         = apiChanged === true 的变更集数
 *        breakingApis    = breakingApi === true 的变更集数
 *        dbMigrations    = dbMigration === true 的变更集数
 *        fixedBugs       = 目标版本 bugIds.length
 *      VersionDiffDef.metricDelta[].deltaPct = round((to − from) ÷ from × 1000) ÷ 10
 *        dir = to > from ? 'up' : 'down'；good = 该变化方向对业务是否有利
 *
 * I. 需求漏斗（REQ_FUNNEL）为「累计到达」口径，与 REQ_POOL 的 stage 分布严格对账：
 *      REQ_POOL stage 分布：收集 2、评估中 2、已评分 2、待排期 2、已挂起 1、
 *                          已交付 1、已入迭代 8、已拒绝 2（合计 20）
 *      收集 = 20（全部入池）
 *      评估 = 20 − 2（仍在「收集」）= 18
 *      评分 = 18 − 2（仍在「评估中」）= 16
 *      排期 = 待排期 2 + 已入迭代 8 + 已交付 1 = 11
 *             （16 − 11 = 5 = 已评分 2 + 已拒绝 2 + 已挂起 1，即在本环节流失）
 *      入迭代 = 已入迭代 8 + 已交付 1 = 9
 *      交付   = 已交付 1
 *      需求来源统计（REQ_SOURCE_STATS）按 sourceType 逐条点数，合计 = 20，占比合计 = 100%。
 * ============================================================
 */

import type { Executor, Tone } from './data';
import { RELEASE_ORDERS, REQUIREMENTS, SPRINTS, TODAY, USERS } from './data';

/* ==== 1. 项目管理 ==== */

/** 项目定义（项目组合视图的一行） */
export interface ProjectDef {
  id: string;
  /** PingCode 项目编号 */
  code: string;
  name: string;
  /** 项目负责人（研发侧总负责，取自 USERS.id） */
  ownerId: string;
  /** 项目经理（PMO，取自 USERS.id） */
  managerId: string;
  phase: '立项' | '规划' | '研发' | '测试' | '发布' | '运维' | '已结项';
  statusLabel: string;
  tone: Tone;
  health: 'green' | 'amber' | 'red';
  /** 健康度综合评分 0-100，由进度偏差、门禁状态、缺陷密度与资源饱和度加权得出 */
  healthScore: number;
  startDate: string;
  endDate: string;
  /** 预算（万元） */
  budgetWan: number;
  /** 已花费（万元） */
  spentWan: number;
  headcount: number;
  /** 总体进度 0-100 */
  progress: number;
  /** 进度偏差百分比，负数为落后于基线 */
  scheduleVariancePct: number;
  /** 需求变更率：已变更需求条数 ÷ 基线需求条数 */
  reqChangeRatePct: number;
  /** 缺陷密度（个 / KLOC） */
  defectDensity: number;
  /** 资源利用率 0-100，> 100 表示已借调或加班透支 */
  resourceUtilizationPct: number;
  sprintIds: string[];
  milestoneIds: string[];
  stakeholderIds: string[];
  riskIds: string[];
  desc: string;
  keyObjective: string;
  techStack: string[];
  /** 是否为当前贯穿案例所属项目 */
  isCurrent: boolean;
}

/** 6 个项目：PRJ-01 为当前贯穿案例（订单中心重构），其余构成项目组合背景 */
export const PROJECTS: ProjectDef[] = [
  {
    id: 'PRJ-01',
    code: 'ORD-REF-2026',
    name: '订单中心重构',
    ownerId: 'u-lin',
    managerId: 'u-gu',
    phase: '研发',
    statusLabel: '研发中 · G3/G4 门禁未通过',
    tone: 'brand',
    health: 'amber',
    healthScore: 68,
    startDate: '2026-01-12',
    endDate: '2026-04-24',
    budgetWan: 860,
    spentWan: 512,
    headcount: 9,
    progress: 58,
    scheduleVariancePct: -6.2,
    reqChangeRatePct: 18.4,
    defectDensity: 0.61,
    resourceUtilizationPct: 91,
    sprintIds: ['SP-24', 'SP-25'],
    milestoneIds: ['MS-01', 'MS-02', 'MS-03', 'MS-04', 'MS-05', 'MS-06'],
    stakeholderIds: ['SH-01', 'SH-02', 'SH-03', 'SH-04', 'SH-05', 'SH-06', 'SH-07', 'SH-08', 'SH-09', 'SH-10'],
    riskIds: ['PR-01', 'PR-02', 'PR-03', 'PR-04', 'PR-05', 'PR-06'],
    desc: '把承载全部交易流量的单体 order-service 拆分为订单、履约、优惠三个限界上下文，落地幂等下单、统一状态机、优惠规则引擎化与订单号基因分片，为 2026 年 618 大促提供 3000 TPS 的下单与查询能力。',
    keyObjective: '2026-04-24 前完成生产切流：订单创建 P99 ≤ 200ms、3000 TPS 长稳 30 分钟错误率 ≤ 0.05%、4.7 亿历史订单迁移差异率为 0、资损事故归零。',
    techStack: ['Java 17', 'Spring Boot 3.3', 'MySQL 8.0', 'Redis 7.2', 'RabbitMQ 3.13', 'ShardingSphere 5.5', 'Elasticsearch 8', 'Vue 3', 'TypeScript 5', 'Kubernetes'],
    isCurrent: true,
  },
  {
    id: 'PRJ-02',
    code: 'MBR-2025',
    name: '会员中心一期',
    ownerId: 'u-su',
    managerId: 'u-gu',
    phase: '运维',
    statusLabel: '已上线 · 运维观测期',
    tone: 'ok',
    health: 'green',
    healthScore: 91,
    startDate: '2025-10-13',
    endDate: '2026-01-30',
    budgetWan: 420,
    spentWan: 398,
    headcount: 6,
    progress: 100,
    scheduleVariancePct: 2.4,
    reqChangeRatePct: 9.6,
    defectDensity: 0.34,
    resourceUtilizationPct: 78,
    sprintIds: ['SP-22'],
    milestoneIds: ['MS-07', 'MS-08'],
    stakeholderIds: ['SH-01', 'SH-03', 'SH-06'],
    riskIds: [],
    desc: '搭建会员等级体系、积分账户与权益中心，统一线上线下的会员身份识别，为营销中台的精准触达提供基础数据资产。',
    keyObjective: '会员识别率 ≥ 99.2%，积分账户日终对账差异为 0，权益核销链路 P99 ≤ 300ms。',
    techStack: ['Java 17', 'Spring Boot 3.3', 'MySQL 8.0', 'Redis 7.2', 'Vue 3'],
    isCurrent: false,
  },
  {
    id: 'PRJ-03',
    code: 'PAY-UNI-2026',
    name: '支付渠道统一接入',
    ownerId: 'u-lin',
    managerId: 'u-gu',
    phase: '已结项',
    statusLabel: '已结项 · 复盘归档中',
    tone: 'ok',
    health: 'green',
    healthScore: 88,
    startDate: '2025-11-24',
    endDate: '2026-02-28',
    budgetWan: 560,
    spentWan: 545,
    headcount: 6,
    progress: 100,
    scheduleVariancePct: -1.8,
    reqChangeRatePct: 12.3,
    defectDensity: 0.41,
    resourceUtilizationPct: 82,
    sprintIds: ['SP-23'],
    milestoneIds: ['MS-09'],
    stakeholderIds: ['SH-01', 'SH-06'],
    riskIds: [],
    desc: '把散落在 4 个业务线的支付调用收敛到统一支付网关，接入微信、支付宝、银联三渠道，并支持异步对账与差错自动处理。',
    keyObjective: '支付成功率 ≥ 99.6%，对账差错自动处理率 ≥ 92%，新渠道接入工时由 15 人日降至 4 人日。',
    techStack: ['Java 17', 'Spring Boot 3.3', 'MySQL 8.0', 'RabbitMQ 3.13', 'Kubernetes'],
    isCurrent: false,
  },
  {
    id: 'PRJ-04',
    code: 'FUL-2026',
    name: '履约与售后链路建设',
    ownerId: 'u-lin',
    managerId: 'u-gu',
    phase: '规划',
    statusLabel: '规划中 · 架构评审待启动',
    tone: 'info',
    health: 'amber',
    healthScore: 63,
    startDate: '2026-03-30',
    endDate: '2026-07-31',
    budgetWan: 720,
    spentWan: 46,
    headcount: 5,
    progress: 8,
    scheduleVariancePct: 0,
    reqChangeRatePct: 4.2,
    defectDensity: 0,
    resourceUtilizationPct: 34,
    sprintIds: ['SP-25'],
    milestoneIds: ['MS-12'],
    stakeholderIds: ['SH-01', 'SH-03', 'SH-04', 'SH-08'],
    riskIds: ['PR-08'],
    desc: '在订单中心重构收口后打通 WMS 履约回调、逆向物流跟踪与售后退款闭环，建立可配置的履约路由与售后策略中心。',
    keyObjective: '履约回调成功率 ≥ 99.9%，售后退款平均时效由 48h 压缩至 12h，逆向物流节点全程可追踪。',
    techStack: ['Java 17', 'Spring Boot 3.3', 'RabbitMQ 3.13', 'Elasticsearch 8', 'Vue 3'],
    isCurrent: false,
  },
  {
    id: 'PRJ-05',
    code: 'DATA-MID-2026',
    name: '数据中台指标资产治理',
    ownerId: 'u-su',
    managerId: 'u-gu',
    phase: '测试',
    statusLabel: '测试中 · 指标口径争议未收敛',
    tone: 'danger',
    health: 'red',
    healthScore: 44,
    startDate: '2025-12-01',
    endDate: '2026-04-17',
    budgetWan: 480,
    spentWan: 402,
    headcount: 7,
    progress: 61,
    scheduleVariancePct: -17.5,
    reqChangeRatePct: 34.8,
    defectDensity: 1.28,
    resourceUtilizationPct: 104,
    /** 该项目使用 PingCode「DATA-MID」独立迭代序列，未纳入本原型 SPRINTS 数据集 */
    sprintIds: [],
    milestoneIds: ['MS-10'],
    stakeholderIds: ['SH-01', 'SH-03', 'SH-09'],
    riskIds: ['PR-07'],
    desc: '统一集团 6 个业务线的核心经营指标口径，建设指标资产目录、血缘追踪与自助取数能力，替换 23 张散落的部门级报表。',
    keyObjective: '核心指标口径一致率 100%，报表取数自助率 ≥ 70%，指标血缘覆盖率 ≥ 95%。',
    techStack: ['Flink 1.19', 'Doris 2.1', 'Spark 3.5', 'DataX', 'Vue 3'],
    isCurrent: false,
  },
  {
    id: 'PRJ-06',
    code: 'APP-3.0',
    name: '移动端 App 3.0 体验改版',
    ownerId: 'u-su',
    managerId: 'u-gu',
    phase: '发布',
    statusLabel: '灰度发布中 · iOS/Android 各 10%',
    tone: 'teal',
    health: 'green',
    healthScore: 84,
    startDate: '2025-11-03',
    endDate: '2026-04-03',
    budgetWan: 380,
    spentWan: 306,
    headcount: 8,
    progress: 86,
    scheduleVariancePct: 3.1,
    reqChangeRatePct: 15.7,
    defectDensity: 0.52,
    resourceUtilizationPct: 88,
    /** 该项目使用 PingCode「APP-MOB」独立迭代序列，未纳入本原型 SPRINTS 数据集 */
    sprintIds: [],
    milestoneIds: ['MS-11'],
    stakeholderIds: ['SH-01', 'SH-08'],
    riskIds: [],
    desc: 'App 3.0 全面改版首页信息流、订单列表与售后入口，统一设计令牌体系，首屏 LCP 由 2.4s 压缩到 0.9s。',
    keyObjective: 'App 首屏 LCP ≤ 1.0s，崩溃率 ≤ 0.08%，下单转化率相对 2.x 提升 ≥ 6%。',
    techStack: ['TypeScript 5', 'Vue 3', 'Vite', 'Pinia', 'Kubernetes'],
    isCurrent: false,
  },
];

/** 项目 id → 定义 */
export const PROJECT_MAP: Record<string, ProjectDef> = PROJECTS.reduce<Record<string, ProjectDef>>((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {});

/** 当前贯穿案例所属项目（PRJ-01 订单中心重构） */
export const CURRENT_PROJECT: ProjectDef = PROJECTS.filter((p) => p.isCurrent)[0];

/** 项目里程碑 */
export interface ProjectMilestoneDef {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string;
  /** 实际完成日期；未完成为空串 */
  actualDate: string;
  /** AI 依据当前速率推算的完成日期；已完成时等于 actualDate */
  forecastDate: string;
  status: '已完成' | '进行中' | '待开始' | '已取消';
  progress: number;
  ownerId: string;
  /** 关联的质量门禁（G1 ~ G6） */
  gateId: string;
  deliverables: string[];
  /** 相对计划日期的滑移天数，未滑移为 0 */
  slipDays: number;
  /** 滑移原因；未滑移为空串 */
  slipReason: string;
  tone: Tone;
}

/**
 * 12 个里程碑。
 * PRJ-01（订单中心重构）占 6 个，覆盖「立项 → 架构冻结 → 编码完成 → 测试签发 → 灰度 → 全量」：
 * 已完成 2（MS-01 / MS-02）、进行中 1（MS-03，含 slipDays 与 slipReason）、待开始 3（MS-04 ~ MS-06）。
 */
export const PROJECT_MILESTONES: ProjectMilestoneDef[] = [
  {
    id: 'MS-01',
    projectId: 'PRJ-01',
    name: '项目立项与章程签署',
    plannedDate: '2026-01-16',
    actualDate: '2026-01-16',
    forecastDate: '2026-01-16',
    status: '已完成',
    progress: 100,
    ownerId: 'u-gu',
    gateId: 'G1',
    deliverables: ['项目章程 v1.0', '预算批复（860 万元）', '干系人登记册（10 人）', 'INC-2026-0131 复盘结论纳入范围'],
    slipDays: 0,
    slipReason: '',
    tone: 'ok',
  },
  {
    id: 'MS-02',
    projectId: 'PRJ-01',
    name: '架构基线冻结：三个限界上下文 + 14 份接口契约',
    plannedDate: '2026-02-27',
    actualDate: '2026-02-27',
    forecastDate: '2026-02-27',
    status: '已完成',
    progress: 100,
    ownerId: 'u-yan',
    gateId: 'G2',
    deliverables: ['四层架构视图（接入 / 应用服务 / 领域 / 基础设施）', '14 份 OpenAPI 契约', '24 个开发任务自动拆解结果', '架构评审纪要 ARCH-24-007'],
    slipDays: 0,
    slipReason: '',
    tone: 'ok',
  },
  {
    id: 'MS-03',
    projectId: 'PRJ-01',
    name: '编码完成并通过 G3 门禁（单测覆盖率 ≥ 85%）',
    plannedDate: '2026-03-18',
    actualDate: '',
    forecastDate: '2026-03-23',
    status: '进行中',
    progress: 71,
    ownerId: 'u-zhou',
    gateId: 'G3',
    deliverables: ['18 个开发任务合入主干（TASK-2401 ~ TASK-2416、TASK-2419、TASK-2420）', 'SonarQube 阻断问题清零', '单测覆盖率达标报告'],
    slipDays: 5,
    slipReason: 'G3 单测覆盖率停在 71.4%（阈值 85%），近 7 日增速仅 0.64pt/日；叠加 BLOCK-0312 生产迁移窗口未批复使 TASK-2419 阻塞 7 天，AI 补齐的 62 条边界用例（TASK-2405）尚未全部合入',
    tone: 'danger',
  },
  {
    id: 'MS-04',
    projectId: 'PRJ-01',
    name: '测试报告 TR-24 签发',
    plannedDate: '2026-03-24',
    actualDate: '',
    forecastDate: '2026-03-27',
    status: '待开始',
    progress: 0,
    ownerId: 'u-he',
    gateId: 'G4',
    deliverables: ['248 条用例执行完毕', '128 组金额边界用例回归通过', '3000 TPS 长稳压测报告', '12 个缺陷全部闭环或降级签认'],
    slipDays: 0,
    slipReason: '',
    tone: 'warn',
  },
  {
    id: 'MS-05',
    projectId: 'PRJ-01',
    name: '生产灰度切流（1% → 10% → 50%）',
    plannedDate: '2026-03-20',
    actualDate: '',
    forecastDate: '2026-03-26',
    status: '待开始',
    progress: 0,
    ownerId: 'u-meng',
    gateId: 'G5',
    deliverables: ['REL-2403 批次 1 ~ 批次 3 观察记录', '双写比对差异率 0 的签核', '一键回切脚本演练通过（RTO ≤ 10 分钟）'],
    slipDays: 0,
    slipReason: '',
    tone: 'warn',
  },
  {
    id: 'MS-06',
    projectId: 'PRJ-01',
    name: 'v3.0 全量发布与大促封网前收口',
    plannedDate: '2026-04-24',
    actualDate: '',
    forecastDate: '2026-05-08',
    status: '待开始',
    progress: 0,
    ownerId: 'u-lin',
    gateId: 'G6',
    deliverables: ['v3.0 全量发布记录', 'REQ-2408 合规项验收（脱敏 / 加密 / 审计）', '生产观测面板与 SLO 基线', '项目复盘与架构方法论输出'],
    slipDays: 0,
    slipReason: '',
    tone: 'info',
  },
  {
    id: 'MS-07',
    projectId: 'PRJ-02',
    name: '会员中心一期全量上线',
    plannedDate: '2026-01-23',
    actualDate: '2026-01-23',
    forecastDate: '2026-01-23',
    status: '已完成',
    progress: 100,
    ownerId: 'u-meng',
    gateId: 'G5',
    deliverables: ['v2.2 生产发布记录', '会员等级 / 积分 / 权益三模块验收报告'],
    slipDays: 0,
    slipReason: '',
    tone: 'ok',
  },
  {
    id: 'MS-08',
    projectId: 'PRJ-02',
    name: '会员权益结算首月对账零差异',
    plannedDate: '2026-02-27',
    actualDate: '2026-02-25',
    forecastDate: '2026-02-25',
    status: '已完成',
    progress: 100,
    ownerId: 'u-su',
    gateId: 'G6',
    deliverables: ['首月对账报告（差异 0 笔）', '积分账户日终快照归档'],
    slipDays: 0,
    slipReason: '',
    tone: 'ok',
  },
  {
    id: 'MS-09',
    projectId: 'PRJ-03',
    name: '三渠道支付统一网关切流完成',
    plannedDate: '2026-02-20',
    actualDate: '2026-02-24',
    forecastDate: '2026-02-24',
    status: '已完成',
    progress: 100,
    ownerId: 'u-meng',
    gateId: 'G5',
    deliverables: ['REL-2401 订单查询读扩容上线', 'REL-2402 优惠试算灰度全量', '微信 / 支付宝 / 银联三渠道对账打通'],
    slipDays: 4,
    slipReason: '银联沙箱联调环境在 02-16 ~ 02-19 不可用，异步对账用例顺延执行',
    tone: 'ok',
  },
  {
    id: 'MS-10',
    projectId: 'PRJ-05',
    name: '指标资产盘点与口径统一评审通过',
    plannedDate: '2026-03-06',
    actualDate: '',
    forecastDate: '2026-03-25',
    status: '进行中',
    progress: 45,
    ownerId: 'u-su',
    gateId: 'G1',
    deliverables: ['38 个争议指标的仲裁签核表', '指标资产目录 v1.0', '血缘覆盖率报告'],
    slipDays: 12,
    slipReason: '6 个业务线数据负责人对「有效订单」「GMV 口径」定义分歧未收敛，需求变更率达 34.8%，评审已改期 3 次',
    tone: 'danger',
  },
  {
    id: 'MS-11',
    projectId: 'PRJ-06',
    name: 'App 3.0 灰度发布（iOS / Android 各 10%）',
    plannedDate: '2026-03-21',
    actualDate: '',
    forecastDate: '2026-03-21',
    status: '待开始',
    progress: 0,
    ownerId: 'u-chen',
    gateId: 'G5',
    deliverables: ['应用市场审核通过凭证', '灰度埋点与崩溃率看板', '首屏 LCP 达标验证报告'],
    slipDays: 0,
    slipReason: '',
    tone: 'info',
  },
  {
    id: 'MS-12',
    projectId: 'PRJ-04',
    name: '履约域限界上下文架构评审通过',
    plannedDate: '2026-04-03',
    actualDate: '',
    forecastDate: '2026-04-03',
    status: '待开始',
    progress: 0,
    ownerId: 'u-yan',
    gateId: 'G2',
    deliverables: ['履约域上下文映射图', 'WMS 回调契约冻结稿（3 份）', '逆向物流状态机设计'],
    slipDays: 0,
    slipReason: '',
    tone: 'info',
  },
];

/** 项目干系人（RACI 登记册） */
export interface StakeholderDef {
  id: string;
  projectId: string;
  /** 平台内成员 id；平台外业务方干系人为 null */
  userId: string | null;
  /** 平台外干系人姓名与所属组织；平台内成员为空串 */
  externalName: string;
  /** 展示名（平台内成员取 USERS.name，平台外取 externalName 中的人名部分） */
  displayName: string;
  /** 在本项目中承担的职责 */
  role: string;
  /** RACI：R 执行 / A 问责 / C 咨询 / I 知会 */
  raci: 'R' | 'A' | 'C' | 'I';
  /** 关注点 */
  interest: string;
  influence: 'high' | 'medium' | 'low';
  /** 沟通频率与形式 */
  communicationFreq: string;
  /** 当前诉求或异议 */
  expectation: string;
  tone: Tone;
}

/**
 * 10 位干系人：7 位映射到 ./data 的 USERS（SH-01 ~ SH-06、SH-10），
 * 3 位为平台外业务方 / 职能方（SH-07 ~ SH-09，userId 为 null 并给出 externalName）。
 * 登记册为组织级共享，projectId 表示主责项目；其他项目通过 ProjectDef.stakeholderIds 引用同一条目。
 * RACI 约束：全表唯一 A（SH-07 集团数字化负责人）。
 */
export const STAKEHOLDERS: StakeholderDef[] = [
  {
    id: 'SH-01',
    projectId: 'PRJ-01',
    userId: 'u-lin',
    externalName: '',
    displayName: '林知远',
    role: '研发总监 · 交付执行总负责',
    raci: 'R',
    interest: '交付节奏、资损与稳定性红线、人力成本与技术债收敛',
    influence: 'high',
    communicationFreq: '每日门禁日报 + 每周项目周会（周一 10:00）',
    expectation: '门禁未过不谈发布窗口，要求 G3 覆盖率在 03-23 前达标，否则同意把 REQ-2405 移出 rc1',
    tone: 'brand',
  },
  {
    id: 'SH-02',
    projectId: 'PRJ-01',
    userId: 'u-gu',
    externalName: '',
    displayName: '顾时衍',
    role: '项目经理（PMO）· 排期与风险治理',
    raci: 'R',
    interest: '里程碑达成率、阻塞清理时效、需求变更率与甘特冲突收敛',
    influence: 'high',
    communicationFreq: '每日站会 + 每周风险评审会（周四 15:00）',
    expectation: 'BLOCK-0312 已阻塞 7 天，要求 03-20 前拿到 DBA 明确批复，否则启动 REL-2403 顺延预案',
    tone: 'pink',
  },
  {
    id: 'SH-03',
    projectId: 'PRJ-01',
    userId: 'u-su',
    externalName: '',
    displayName: '苏文瑾',
    role: '高级产品经理 · 范围与验收',
    raci: 'R',
    interest: '需求范围稳定性、验收标准可测性、业务方诉求闭环',
    influence: 'medium',
    communicationFreq: '每周需求澄清会（周三 14:00）',
    expectation: '希望保留 REQ-2405 多仓拆单在 rc1 内，因跨境仓 04-15 上线依赖该能力',
    tone: 'ai',
  },
  {
    id: 'SH-04',
    projectId: 'PRJ-01',
    userId: 'u-yan',
    externalName: '',
    displayName: '严慕舟',
    role: '首席架构师 · 技术决策与契约冻结',
    raci: 'R',
    interest: '限界上下文边界、接口契约冻结率、分片方案与补偿事务正确性',
    influence: 'high',
    communicationFreq: '每周架构评审会（双周 1 次，关键路径节点加开）',
    expectation: '坚持 API-10 拆单契约必须先冻结再编码，反对边写边改',
    tone: 'indigo',
  },
  {
    id: 'SH-05',
    projectId: 'PRJ-01',
    userId: 'u-he',
    externalName: '',
    displayName: '何斯年',
    role: '测试负责人 · 质量签发',
    raci: 'C',
    interest: 'G4 用例执行率、缺陷收敛曲线、发布准入证据链完整性',
    influence: 'medium',
    communicationFreq: '每周测试例会 + 每次发布评审会',
    expectation: '128 组金额边界用例仅执行 74 组，明确表态证据不足不签发 TR-24',
    tone: 'amber',
  },
  {
    id: 'SH-06',
    projectId: 'PRJ-01',
    userId: 'u-meng',
    externalName: '',
    displayName: '孟星回',
    role: 'SRE · 发布与观测',
    raci: 'R',
    interest: '灰度批次可回滚性、告警噪声、容量水位与值班资源',
    influence: 'high',
    communicationFreq: '发布周每日发布晨会（08:45）',
    expectation: '已书面建议把 REL-2403 从 03-20 顺延至 03-26，避开 DBA 迁移窗口与门禁风险叠加',
    tone: 'warn',
  },
  {
    id: 'SH-07',
    projectId: 'PRJ-01',
    userId: null,
    externalName: '韩沐辰 · 集团 CTO 办公室 数字化负责人',
    displayName: '韩沐辰',
    role: '项目发起人 · 最终问责人',
    raci: 'A',
    interest: '重构是否影响 618 大促稳定性、投入产出比、跨部门资源协调',
    influence: 'high',
    communicationFreq: '双周指导委员会（隔周五 16:00）+ 重大风险即时上报',
    expectation: '接受 14 天以内的延期，但不接受把大促容量目标从 3000 TPS 下调',
    tone: 'danger',
  },
  {
    id: 'SH-08',
    projectId: 'PRJ-01',
    userId: null,
    externalName: '邱予桐 · 零售事业部 交易运营总监',
    displayName: '邱予桐',
    role: '业务方代表 · 交易运营',
    raci: 'C',
    interest: '大促下单成功率、拆单后的客服话术与退款时效、订单状态可解释性',
    influence: 'high',
    communicationFreq: '双周业务对齐会（隔周二 10:00）',
    expectation: '客服系统状态不同步投诉已 37 起，要求 REQ-2402 状态机随 rc1 一并上线',
    tone: 'teal',
  },
  {
    id: 'SH-09',
    projectId: 'PRJ-01',
    userId: null,
    externalName: '傅明澜 · 安全合规部 数据合规经理',
    displayName: '傅明澜',
    role: '职能方代表 · 安全合规',
    raci: 'C',
    interest: 'SEC-2026-08 脱敏与审计留痕落地、个保法年度审计取证、数据出境评估',
    influence: 'medium',
    communicationFreq: '每月合规评审会 + 里程碑节点加会',
    expectation: 'REQ-2408 可延后至 v3.0，但 BUG-1052（导出未二次授权）必须在 04-01 封网前修复',
    tone: 'slate',
  },
  {
    id: 'SH-10',
    projectId: 'PRJ-01',
    userId: 'u-zhou',
    externalName: '',
    displayName: '周浩然',
    role: '后端技术专家 · 订单域实现负责人',
    raci: 'C',
    interest: '分片路由正确性、迁移零资损、代码可维护性与团队负载',
    influence: 'medium',
    communicationFreq: '每日站会 + 每周技术碰头（周二 16:00）',
    expectation: '本迭代个人负载已达 223.8%，要求把 TASK-2415 拆单引擎转交他人或顺延至 SP-25',
    tone: 'info',
  },
];

/** 项目风险登记册条目 */
export interface ProjectRiskDef {
  id: string;
  projectId: string;
  title: string;
  desc: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  /** 风险分 = 概率值 × 影响值（low=1 / medium=3 / high=5），取值 1 ~ 25 */
  score: number;
  /** 风险责任人（USERS.id） */
  owner: string;
  /** 缓解措施 */
  mitigation: string;
  /** 应急预案（缓解失效时启动） */
  contingency: string;
  status: 'open' | 'mitigating' | 'closed' | 'occurred';
  /** 该风险由 AI 还是人首先识别 */
  detectedBy: 'ai' | 'human';
  detectedAt: string;
  /** AI 识别时引用的数据信号（指标名 + 数值）；人工登记时为空串 */
  aiEvidence: string;
  tone: Tone;
}

/**
 * 8 条项目风险：6 条属当前项目 PRJ-01，PRJ-05 与 PRJ-04 各 1 条。
 * 其中 5 条由 AI 识别（PR-02 ~ PR-06），均给出 aiEvidence（具体指标名与数值）。
 */
export const PROJECT_RISKS: ProjectRiskDef[] = [
  {
    id: 'PR-01',
    projectId: 'PRJ-01',
    title: '生产迁移窗口 BLOCK-0312 未批复，关键路径顺延',
    desc: 'DBA 侧尚未批复 4.7 亿历史订单的生产迁移窗口，TASK-2419 已阻塞 7 天，直接卡住 TASK-2420 双写校验与 TASK-2421 生产切流（REL-2403）。',
    probability: 'high',
    impact: 'high',
    score: 25,
    owner: 'u-gu',
    mitigation: '每日站会升级至研发总监；同步提交 3 套迁移窗口方案（工作日夜间 22:00~02:00 / 周六全天 / 分批 72 小时），并附预生产 3 轮跑通报告与零资损比对结果',
    contingency: '若 2026-03-23 前仍未批复，把 REL-2403 切流顺延至 2026-04-08，v3.0 全量发布推到封网结束后的 2026-04-22，并向指导委员会申请调整里程碑基线',
    status: 'occurred',
    detectedBy: 'human',
    detectedAt: '2026-03-12',
    aiEvidence: '',
    tone: 'danger',
  },
  {
    id: 'PR-02',
    projectId: 'PRJ-01',
    title: 'G3 编码门禁单测覆盖率长期低于阈值，v3.0-rc1 无法放行',
    desc: '单测覆盖率停在 71.4%（阈值 85%），按当前增速无法在 SP-24 结束前达标，REL-2403 的批次 1 准入条件不成立。',
    probability: 'high',
    impact: 'medium',
    score: 15,
    owner: 'u-zhou',
    mitigation: '把 AI 已生成的 62 条边界用例按模块分配给 3 名后端，每日 18:00 前合入；SonarQube 规则集临时聚焦关键路径包，非核心包阈值下调到 70% 以集中资源',
    contingency: '若 03-23 覆盖率仍 < 80%，把 REQ-2405 多仓拆单（13 点）整体移出 rc1，集中保障下单主链路与迁移正确性',
    status: 'mitigating',
    detectedBy: 'ai',
    detectedAt: '2026-03-14',
    aiEvidence: 'ag-review 连续采样 PIPE-2405 ~ PIPE-2410 六次流水线：单测覆盖率 68.2% → 71.4%（阈值 85%），近 7 日增速 0.64pt/日，按此斜率达标需 21 天而 SP-24 仅剩 8 天；G3_FAILURE_TREND 显示同期新增用例 34 条但覆盖分支数只增加 11 个',
    tone: 'warn',
  },
  {
    id: 'PR-03',
    projectId: 'PRJ-01',
    title: '灰度期新旧集群双写不一致导致资损',
    desc: '迁移期开启双写，若新旧集群字段级比对出现差异即构成资损；BUG-1043 暴露的金额分摊尾差尚未完成全量回归。',
    probability: 'medium',
    impact: 'high',
    score: 15,
    owner: 'u-shen',
    mitigation: '按订单号逐字段比对，差异率阈值设为 0；写失败自动降级单写并触发 P0 告警；切流前完成 3 轮预生产全量比对与 128 组金额边界用例回归',
    contingency: '差异率 > 0 时立即中止切流，执行一键回切脚本（DNS + 配置中心双通道，RTO ≤ 10 分钟），保留双写现场供 DBA 复盘',
    status: 'mitigating',
    detectedBy: 'ai',
    detectedAt: '2026-03-15',
    aiEvidence: 'TASK-2420 预生产 3 轮比对：全量差异率 0.0007%（3,281 / 4.7 亿），差异集中在 discount_amount 与 coupon_id 两个字段；关联 BUG-1043 的分摊尾差 0.01 元在 TASK-2410 修复后，128 组金额边界用例仅回归 74 组（执行率 57.8%）',
    tone: 'warn',
  },
  {
    id: 'PR-04',
    projectId: 'PRJ-01',
    title: '履约域 WMS 回调契约未冻结，SP-25 排期存在连锁滑移',
    desc: 'REQ-2405 多仓拆单依赖履约中心 WMS 回调协议，该协议尚未冻结，可能把滑移传导到 SP-25 与 PRJ-04。',
    probability: 'medium',
    impact: 'medium',
    score: 9,
    owner: 'u-yan',
    mitigation: '2026-03-27 前与仓储组完成 API-10「拆单预演」契约评审并冻结字段与错误码；同步产出履约回调 Mock Server，让前端 TASK-2416 可并行开发',
    contingency: '若 SP-24 结束前仍无法冻结，REQ-2405 降级为「仅按商家维度拆单」，仓库 / 类目 / 重量维度拆分推迟到 SP-26',
    status: 'open',
    detectedBy: 'ai',
    detectedAt: '2026-03-16',
    aiEvidence: 'API_CONTRACTS 中 API-10「拆单预演」状态仍为 draft，履约域 3 份回调契约冻结进度 0/3；TASK-2415（拆单引擎，8 点）stageId 停留在 st-arch、progress 28%，其下游 TASK-2416 progress 为 0 且 endDate 2026-03-25 已进入 SP-24 最后一周',
    tone: 'info',
  },
  {
    id: 'PR-05',
    projectId: 'PRJ-01',
    title: '分片热点与内存泄漏叠加，3000 TPS 长稳目标存在缺口',
    desc: '压测暴露单个分片 CPU 严重倾斜，同时长稳过程中老年代线性增长，二者叠加使 P99 在后半程突破契约阈值。',
    probability: 'low',
    impact: 'high',
    score: 5,
    owner: 'u-zhou',
    mitigation: '按订单号基因位重新均衡 shard_07 的路由权重；BUG-1053 由 AI 输出 3 套 JVM 参数与对象池方案，03-22 前完成对比压测并锁定一套',
    contingency: '长稳不达标时把容量目标降级为 2400 TPS 并启用网关限流预案，同时向业务方申请把大促峰值预估下调 15%',
    status: 'mitigating',
    detectedBy: 'ai',
    detectedAt: '2026-03-17',
    aiEvidence: 'JMeter 3000 TPS 长稳 30 分钟采样：shard_07 单库 CPU 峰值 93.4%、其余 15 库均值 41.2%，热点倾斜度 126%；同轮次 BUG-1053 显示老年代线性增长、Full GC 回收率仅 22%，订单创建 P99 在第 22 分钟由 186ms 抬升至 268ms（契约 200ms）',
    tone: 'info',
  },
  {
    id: 'PR-06',
    projectId: 'PRJ-01',
    title: '关键人依赖：两名后端承载 77.3% 任务点且负载超 180%',
    desc: '订单中心研发组的两位后端同时处于严重过载状态，任一人不可用都会直接击穿 rc1 范围。',
    probability: 'high',
    impact: 'medium',
    score: 15,
    owner: 'u-lin',
    mitigation: '把 TASK-2415（拆单引擎，AI 已产出方案）与 TASK-2408（审计流水）转交沈亦白 / 陈屿分担；为周浩然的非关键路径任务开启 AI 结对优先级，允许顺延到 SP-25',
    contingency: '任一关键人不可用时启动跨组借调（基础平台部 1 名后端），并把 REQ-2405、REQ-2408 整体移出 rc1',
    status: 'mitigating',
    detectedBy: 'ai',
    detectedAt: '2026-03-18',
    aiEvidence: 'WORKLOADS 快照（SP-24）：u-zhou allocatedPoints 47 / capacity 21 = 223.8%，u-shen 38 / 21 = 181.0%，两人合计承载 85 / 110 = 77.3% 的任务故事点；近 30 日加班 41h 与 37h 为团队前二，缺陷逃逸 2 个与 3 个亦为团队最高',
    tone: 'warn',
  },
  {
    id: 'PR-07',
    projectId: 'PRJ-05',
    title: '指标口径争议未收敛，需求变更率 34.8% 导致范围失控',
    desc: '6 个业务线对「有效订单」「GMV」等核心指标定义分歧，评审已改期 3 次，项目进度偏差扩大到 -17.5%。',
    probability: 'high',
    impact: 'medium',
    score: 15,
    owner: 'u-su',
    mitigation: '成立由 6 个业务线数据负责人组成的口径仲裁小组，2026-03-25 前对 38 个争议指标逐一签核；未签核指标一律移出本期范围',
    contingency: '若 04-03 前仲裁完成率 < 80%，项目降级为「先交付 12 个无争议核心指标」，其余转入二期并重新立项',
    status: 'open',
    detectedBy: 'human',
    detectedAt: '2026-03-05',
    aiEvidence: '',
    tone: 'warn',
  },
  {
    id: 'PR-08',
    projectId: 'PRJ-04',
    title: '履约域架构评审资源与订单中心重构收口期冲突',
    desc: '首席架构师严慕舟同时承担 SP-24 收口与 PRJ-04 架构评审，2026-03 下旬存在排期撞车。',
    probability: 'medium',
    impact: 'low',
    score: 3,
    owner: 'u-yan',
    mitigation: '把 PRJ-04 架构评审排入 2026-04-03（SP-25 第一周），避开 SP-24 收口期；评审材料由 ag-arch 提前 5 个工作日生成初稿',
    contingency: '若严慕舟仍被 SP-24 收口占用，改由周浩然主持预审、严慕舟只做终审签核',
    status: 'closed',
    detectedBy: 'human',
    detectedAt: '2026-03-08',
    aiEvidence: '',
    tone: 'ok',
  },
];

/** AI 周报中的进度对比项 */
export interface AiReportProgressItem {
  label: string;
  /** 基线计划值 */
  planned: number;
  /** 本期实际值 */
  actual: number;
  /** (actual − planned) ÷ planned × 100，保留 1 位小数 */
  variancePct: number;
  tone: Tone;
}

/** AI 周报的完工预测 */
export interface AiReportForecast {
  /** 预测完工日期 */
  finishDate: string;
  /** 预测置信度 0-100 */
  confidencePct: number;
  /** 按期交付风险等级 */
  onTimeRisk: 'high' | 'medium' | 'low';
  /** 预测依据 */
  basis: string;
}

/** AI 自动生成的项目周报 */
export interface AiProjectReportDef {
  projectId: string;
  weekLabel: string;
  generatedAt: string;
  /** 生成该报告的 Agent（agents.id） */
  generatedBy: string;
  /** 实际路由到的模型（models.id） */
  modelId: string;
  /** 3-5 句总体结论 */
  summary: string;
  progressItems: AiReportProgressItem[];
  highlights: string[];
  blockers: string[];
  nextWeekPlan: string[];
  forecast: AiReportForecast;
  /** 本次生成消耗的模型调用成本（元） */
  tokenCost: number;
  /** 是否经过人工编辑 */
  humanEdited: boolean;
  reviewStatus: '待确认' | '已确认' | '已驳回';
  tone: Tone;
}

/**
 * 当前项目（PRJ-01）的 AI 项目周报。
 * generatedBy 为 ag-ba（可观测分析 Agent，默认模型 mdl-deepseek），
 * 但跨源综合类长上下文报告按路由规则改派 mdl-gpt5（GPT-5 承接「影响面分析 / 发布风险评审 / 长上下文推理」）。
 * generatedAt 以 ./data 的 TODAY（2026-03-19）为基准，保证与全站日期一致。
 */
export const aiProjectReport: AiProjectReportDef = {
  projectId: 'PRJ-01',
  weekLabel: 'Sprint 24 · 第 3 周（2026-03-16 ~ 2026-03-22，滚动生成）',
  generatedAt: `${TODAY} 18:30`,
  generatedBy: 'ag-ba',
  modelId: 'mdl-gpt5',
  summary:
    '本周项目健康度由 74 降至 68，处于 amber 区间：迭代故事点完成 65 / 96（67.7%），距 SP-24 结束仅剩 8 天。' +
    '核心阻塞有两条且互为因果——BLOCK-0312 生产迁移窗口未批复使 TASK-2419 阻塞 7 天，进而让 G3 单测覆盖率停在 71.4%（阈值 85%），最终卡住 REL-2403 的批次 1 准入。' +
    '正面信号是 AI 侧产能持续释放：编码 Agent 采纳率 79.6% 已超基线 13.7%，TASK-2402 / 2413 / 2417 / 2418 四项已提前发布。' +
    '按当前速率推算，项目完工日期将由 2026-04-24 滑至 2026-05-08，置信度 58%，建议本周内决策是否把 REQ-2405 移出 rc1 以换取主链路按期。',
  progressItems: [
    { label: '迭代故事点完成', planned: 96, actual: 65, variancePct: -32.3, tone: 'warn' },
    { label: 'G3 单测覆盖率（%）', planned: 85, actual: 71.4, variancePct: -16.0, tone: 'danger' },
    { label: '项目总体进度（%）', planned: 64, actual: 58, variancePct: -9.4, tone: 'warn' },
    { label: '需求变更率（%）', planned: 15, actual: 18.4, variancePct: 22.7, tone: 'warn' },
    { label: '里程碑按期达成（个）', planned: 2, actual: 2, variancePct: 0, tone: 'ok' },
    { label: 'AI 生成代码采纳率（%）', planned: 70, actual: 79.6, variancePct: 13.7, tone: 'ok' },
  ],
  highlights: [
    'TASK-2413 订单号基因分片改造提前 1 天完成并部署，16 库 × 64 表路由经 3 轮预生产验证无跨分片扫描',
    'TASK-2417 / TASK-2418 随 v2.4 先行上线，12 个下游消费方开始按 CloudEvents 1.0 灰度切换，死信回放成功率 99.6%',
    'AI 编码会话本周产出 62 条边界用例草稿，其中 41 条已通过评审合入，覆盖率贡献 +2.6pt',
    'REQ-2403 金额分摊尾差修复（TASK-2410）完成 BigDecimal 全链路切换，进度 88%，资损告警连续 5 日为 0',
  ],
  blockers: [
    'BLOCK-0312：DBA 未批复生产迁移窗口，TASK-2419 阻塞 7 天，直接卡住 TASK-2420 与 REL-2403',
    'G3 门禁未过（71.4% < 85%）与 G4 用例执行率不足（74 / 128 组金额边界用例），REL-2403 的 gateBlockedIds 为 [G3, G4]',
    'API-10「拆单预演」契约仍为 draft，履约域 3 份 WMS 回调契约冻结进度 0/3，TASK-2415 停留在 st-arch',
    '订单中心研发组 u-zhou 负载 223.8%、u-shen 负载 181.0%，两人合计承载 77.3% 的任务故事点',
  ],
  nextWeekPlan: [
    '03-20 前拿到 DBA 迁移窗口的明确批复；若未批复即刻启动 REL-2403 顺延至 03-26 的预案并同步指导委员会',
    '把 62 条 AI 生成边界用例按模块分配到人，目标 03-23 前将 G3 覆盖率推到 85%，否则 formally 将 REQ-2405 移出 rc1',
    '03-22 前完成 BUG-1053 的 JVM 参数对比压测并锁定方案，重跑 3000 TPS 长稳 30 分钟',
    '03-27 前与仓储组冻结 API-10 契约，交付履约回调 Mock Server 让 TASK-2416 并行启动',
    '把 TASK-2408 / TASK-2415 从 u-zhou 名下转出，完成一次跨组负载再平衡并复核 WORKLOADS 快照',
  ],
  forecast: {
    finishDate: '2026-05-08',
    confidencePct: 58,
    onTimeRisk: 'high',
    basis: '以近 3 周故事点燃烧速率（21.7 点 / 周）外推剩余 31 点需 1.4 周，叠加 BLOCK-0312 的 7 天阻塞与 G3 达标所需的 21 天斜率，取三者最大值得到 14 天滑移；置信度受迁移窗口批复时点这一单点不确定性压低',
  },
  tokenCost: 18.42,
  humanEdited: true,
  reviewStatus: '已确认',
  tone: 'warn',
};

/* ==== 2. 人员管理 ==== */

/** 技能定义（技能库条目） */
export interface SkillDef {
  id: string;
  name: string;
  category: '语言与框架' | '架构与设计' | '质量与测试' | '平台与运维' | '产品与管理' | 'AI 协作';
  /** 业务对该技能的需求强度 */
  demandLevel: 'critical' | 'high' | 'medium';
  /** 团队稀缺度：具备 level ≥ 4 的人数缺口占比（%） */
  scarcityPct: number;
  /** 该技能在本迭代关联的架构组件或工作项 */
  relatedRef: string;
  tone: Tone;
}

/**
 * 14 项技能。
 * SK-13「需求澄清与交付治理」覆盖 PRD 撰写、排期治理与风险管理三类能力项，
 * 以便与 USERS.skills 中苏文瑾（PRD 撰写 / 用户研究）与顾时衍（排期治理 / 风险管理）的强项对齐。
 */
export const SKILLS: SkillDef[] = [
  { id: 'SK-01', name: 'Java 17', category: '语言与框架', demandLevel: 'critical', scarcityPct: 12, relatedRef: 'ac-order-domain', tone: 'info' },
  { id: 'SK-02', name: 'Spring Boot 3.3', category: '语言与框架', demandLevel: 'critical', scarcityPct: 18, relatedRef: 'ac-order-api', tone: 'info' },
  { id: 'SK-03', name: 'Vue 3 与 TypeScript 5', category: '语言与框架', demandLevel: 'high', scarcityPct: 34, relatedRef: 'ac-order-query', tone: 'teal' },
  { id: 'SK-04', name: 'MySQL 8 与分库分表', category: '语言与框架', demandLevel: 'critical', scarcityPct: 22, relatedRef: 'ac-order-db', tone: 'warn' },
  { id: 'SK-05', name: 'Redis 7 缓存与一致性', category: '语言与框架', demandLevel: 'high', scarcityPct: 28, relatedRef: 'ac-cache-layer', tone: 'brand' },
  { id: 'SK-06', name: 'RabbitMQ 与事件驱动架构', category: '架构与设计', demandLevel: 'high', scarcityPct: 31, relatedRef: 'ac-event-bus', tone: 'indigo' },
  { id: 'SK-07', name: 'DDD 与限界上下文建模', category: '架构与设计', demandLevel: 'critical', scarcityPct: 44, relatedRef: 'KB-ARCH-01', tone: 'indigo' },
  { id: 'SK-08', name: '分布式事务与幂等设计', category: '架构与设计', demandLevel: 'critical', scarcityPct: 39, relatedRef: 'ac-idem-guard', tone: 'danger' },
  { id: 'SK-09', name: '测试设计与接口自动化', category: '质量与测试', demandLevel: 'high', scarcityPct: 26, relatedRef: 'KB-TEST-03', tone: 'teal' },
  { id: 'SK-10', name: '性能压测与容量规划', category: '质量与测试', demandLevel: 'medium', scarcityPct: 41, relatedRef: 'REQ-2404', tone: 'amber' },
  { id: 'SK-11', name: 'Kubernetes 与 GitLab CI/CD', category: '平台与运维', demandLevel: 'high', scarcityPct: 33, relatedRef: 'KB-OPS-01', tone: 'warn' },
  { id: 'SK-12', name: '可观测性与研发效能度量', category: '平台与运维', demandLevel: 'medium', scarcityPct: 29, relatedRef: 'ac-audit-store', tone: 'pink' },
  { id: 'SK-13', name: '需求澄清与交付治理', category: '产品与管理', demandLevel: 'high', scarcityPct: 47, relatedRef: 'PRD-ORD-v2.3', tone: 'ai' },
  { id: 'SK-14', name: 'AI 结对与提示词工程', category: 'AI 协作', demandLevel: 'critical', scarcityPct: 52, relatedRef: 'KB-CODE-02', tone: 'ai' },
];

/** 技能矩阵单元格（人 × 技能） */
export interface SkillMatrixCell {
  userId: string;
  skillId: string;
  /** 能力等级 1-5 */
  level: number;
  /** 是否持有 CERTIFICATIONS 中覆盖该技能的证书 */
  certified: boolean;
  /** 最近一次在实际工作中使用该技能的日期 */
  lastUsedAt: string;
  /** 该技能上使用 AI 辅助的比例（%） */
  aiAssistRatePct: number;
}

/**
 * 人 × 技能矩阵：9 位真人 × 14 项技能 = 126 条（u-ai-copilot 为 AI 共享账号，不入矩阵）。
 * 每人的强项与 ./data 中 USERS.skills 一致（level 4-5），弱项 level 1-2；
 * certified / aiAssistRatePct / lastUsedAt 遵循文件头 G 节约定。
 */
export const SKILL_MATRIX: SkillMatrixCell[] = [
  /* 林知远 · 研发总监（架构治理 / DDD / 效能度量） */
  { userId: 'u-lin', skillId: 'SK-01', level: 3, certified: false, lastUsedAt: '2026-02-06', aiAssistRatePct: 68 },
  { userId: 'u-lin', skillId: 'SK-02', level: 3, certified: false, lastUsedAt: '2026-02-06', aiAssistRatePct: 66 },
  { userId: 'u-lin', skillId: 'SK-03', level: 1, certified: false, lastUsedAt: '2025-09-18', aiAssistRatePct: 91 },
  { userId: 'u-lin', skillId: 'SK-04', level: 2, certified: false, lastUsedAt: '2026-01-14', aiAssistRatePct: 82 },
  { userId: 'u-lin', skillId: 'SK-05', level: 2, certified: false, lastUsedAt: '2026-01-14', aiAssistRatePct: 79 },
  { userId: 'u-lin', skillId: 'SK-06', level: 2, certified: false, lastUsedAt: '2026-01-08', aiAssistRatePct: 84 },
  { userId: 'u-lin', skillId: 'SK-07', level: 5, certified: true, lastUsedAt: '2026-03-18', aiAssistRatePct: 44 },
  { userId: 'u-lin', skillId: 'SK-08', level: 4, certified: true, lastUsedAt: '2026-03-13', aiAssistRatePct: 56 },
  { userId: 'u-lin', skillId: 'SK-09', level: 2, certified: false, lastUsedAt: '2026-01-22', aiAssistRatePct: 77 },
  { userId: 'u-lin', skillId: 'SK-10', level: 2, certified: false, lastUsedAt: '2026-01-15', aiAssistRatePct: 81 },
  { userId: 'u-lin', skillId: 'SK-11', level: 2, certified: false, lastUsedAt: '2026-02-19', aiAssistRatePct: 85 },
  { userId: 'u-lin', skillId: 'SK-12', level: 4, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 52 },
  { userId: 'u-lin', skillId: 'SK-13', level: 4, certified: false, lastUsedAt: '2026-03-17', aiAssistRatePct: 58 },
  { userId: 'u-lin', skillId: 'SK-14', level: 3, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 71 },
  /* 苏文瑾 · 高级产品经理（交易域 / PRD 撰写 / 用户研究） */
  { userId: 'u-su', skillId: 'SK-01', level: 1, certified: false, lastUsedAt: '2025-06-20', aiAssistRatePct: 93 },
  { userId: 'u-su', skillId: 'SK-02', level: 1, certified: false, lastUsedAt: '2025-06-20', aiAssistRatePct: 90 },
  { userId: 'u-su', skillId: 'SK-03', level: 2, certified: false, lastUsedAt: '2026-02-11', aiAssistRatePct: 78 },
  { userId: 'u-su', skillId: 'SK-04', level: 1, certified: false, lastUsedAt: '2025-10-09', aiAssistRatePct: 88 },
  { userId: 'u-su', skillId: 'SK-05', level: 1, certified: false, lastUsedAt: '2025-10-09', aiAssistRatePct: 87 },
  { userId: 'u-su', skillId: 'SK-06', level: 1, certified: false, lastUsedAt: '2025-08-14', aiAssistRatePct: 92 },
  { userId: 'u-su', skillId: 'SK-07', level: 4, certified: true, lastUsedAt: '2026-03-18', aiAssistRatePct: 54 },
  { userId: 'u-su', skillId: 'SK-08', level: 2, certified: false, lastUsedAt: '2026-01-30', aiAssistRatePct: 76 },
  { userId: 'u-su', skillId: 'SK-09', level: 3, certified: false, lastUsedAt: '2026-03-11', aiAssistRatePct: 69 },
  { userId: 'u-su', skillId: 'SK-10', level: 1, certified: false, lastUsedAt: '2025-07-25', aiAssistRatePct: 89 },
  { userId: 'u-su', skillId: 'SK-11', level: 1, certified: false, lastUsedAt: '2025-05-16', aiAssistRatePct: 94 },
  { userId: 'u-su', skillId: 'SK-12', level: 2, certified: false, lastUsedAt: '2026-03-04', aiAssistRatePct: 75 },
  { userId: 'u-su', skillId: 'SK-13', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 41 },
  { userId: 'u-su', skillId: 'SK-14', level: 4, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 57 },
  /* 严慕舟 · 首席架构师（Spring Boot 3 / DDD / RabbitMQ / 分库分表） */
  { userId: 'u-yan', skillId: 'SK-01', level: 4, certified: true, lastUsedAt: '2026-03-17', aiAssistRatePct: 53 },
  { userId: 'u-yan', skillId: 'SK-02', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 42 },
  { userId: 'u-yan', skillId: 'SK-03', level: 1, certified: false, lastUsedAt: '2025-04-22', aiAssistRatePct: 92 },
  { userId: 'u-yan', skillId: 'SK-04', level: 5, certified: false, lastUsedAt: '2026-03-18', aiAssistRatePct: 45 },
  { userId: 'u-yan', skillId: 'SK-05', level: 4, certified: false, lastUsedAt: '2026-03-16', aiAssistRatePct: 55 },
  { userId: 'u-yan', skillId: 'SK-06', level: 4, certified: false, lastUsedAt: '2026-03-13', aiAssistRatePct: 51 },
  { userId: 'u-yan', skillId: 'SK-07', level: 5, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 39 },
  { userId: 'u-yan', skillId: 'SK-08', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 43 },
  { userId: 'u-yan', skillId: 'SK-09', level: 2, certified: false, lastUsedAt: '2026-01-08', aiAssistRatePct: 80 },
  { userId: 'u-yan', skillId: 'SK-10', level: 3, certified: false, lastUsedAt: '2026-02-24', aiAssistRatePct: 66 },
  { userId: 'u-yan', skillId: 'SK-11', level: 3, certified: true, lastUsedAt: '2026-03-06', aiAssistRatePct: 64 },
  { userId: 'u-yan', skillId: 'SK-12', level: 3, certified: false, lastUsedAt: '2026-03-11', aiAssistRatePct: 63 },
  { userId: 'u-yan', skillId: 'SK-13', level: 3, certified: false, lastUsedAt: '2026-03-18', aiAssistRatePct: 67 },
  { userId: 'u-yan', skillId: 'SK-14', level: 4, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 52 },
  /* 周浩然 · 后端技术专家（Java 17 / Spring Boot 3.3 / MySQL 8 / Redis 7） */
  { userId: 'u-zhou', skillId: 'SK-01', level: 5, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 40 },
  { userId: 'u-zhou', skillId: 'SK-02', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 43 },
  { userId: 'u-zhou', skillId: 'SK-03', level: 1, certified: false, lastUsedAt: '2025-08-05', aiAssistRatePct: 90 },
  { userId: 'u-zhou', skillId: 'SK-04', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 46 },
  { userId: 'u-zhou', skillId: 'SK-05', level: 5, certified: false, lastUsedAt: '2026-03-18', aiAssistRatePct: 48 },
  { userId: 'u-zhou', skillId: 'SK-06', level: 4, certified: false, lastUsedAt: '2026-03-14', aiAssistRatePct: 57 },
  { userId: 'u-zhou', skillId: 'SK-07', level: 3, certified: false, lastUsedAt: '2026-03-02', aiAssistRatePct: 70 },
  { userId: 'u-zhou', skillId: 'SK-08', level: 4, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 55 },
  { userId: 'u-zhou', skillId: 'SK-09', level: 2, certified: false, lastUsedAt: '2026-02-17', aiAssistRatePct: 79 },
  { userId: 'u-zhou', skillId: 'SK-10', level: 3, certified: false, lastUsedAt: '2026-02-26', aiAssistRatePct: 65 },
  { userId: 'u-zhou', skillId: 'SK-11', level: 2, certified: false, lastUsedAt: '2026-01-19', aiAssistRatePct: 83 },
  { userId: 'u-zhou', skillId: 'SK-12', level: 3, certified: false, lastUsedAt: '2026-03-09', aiAssistRatePct: 68 },
  { userId: 'u-zhou', skillId: 'SK-13', level: 2, certified: false, lastUsedAt: '2026-02-03', aiAssistRatePct: 76 },
  { userId: 'u-zhou', skillId: 'SK-14', level: 5, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 44 },
  /* 陈屿 · 前端工程师（Vue 3 / TypeScript 5 / Vite / Pinia） */
  { userId: 'u-chen', skillId: 'SK-01', level: 1, certified: false, lastUsedAt: '2025-11-04', aiAssistRatePct: 89 },
  { userId: 'u-chen', skillId: 'SK-02', level: 1, certified: false, lastUsedAt: '2025-11-04', aiAssistRatePct: 88 },
  { userId: 'u-chen', skillId: 'SK-03', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 38 },
  { userId: 'u-chen', skillId: 'SK-04', level: 2, certified: false, lastUsedAt: '2026-02-10', aiAssistRatePct: 81 },
  { userId: 'u-chen', skillId: 'SK-05', level: 2, certified: false, lastUsedAt: '2026-02-10', aiAssistRatePct: 78 },
  { userId: 'u-chen', skillId: 'SK-06', level: 1, certified: false, lastUsedAt: '2025-09-26', aiAssistRatePct: 91 },
  { userId: 'u-chen', skillId: 'SK-07', level: 2, certified: false, lastUsedAt: '2026-01-27', aiAssistRatePct: 84 },
  { userId: 'u-chen', skillId: 'SK-08', level: 1, certified: false, lastUsedAt: '2025-09-26', aiAssistRatePct: 93 },
  { userId: 'u-chen', skillId: 'SK-09', level: 3, certified: false, lastUsedAt: '2026-03-12', aiAssistRatePct: 71 },
  { userId: 'u-chen', skillId: 'SK-10', level: 2, certified: false, lastUsedAt: '2026-01-15', aiAssistRatePct: 82 },
  { userId: 'u-chen', skillId: 'SK-11', level: 2, certified: false, lastUsedAt: '2026-02-24', aiAssistRatePct: 77 },
  { userId: 'u-chen', skillId: 'SK-12', level: 2, certified: false, lastUsedAt: '2026-03-03', aiAssistRatePct: 80 },
  { userId: 'u-chen', skillId: 'SK-13', level: 2, certified: false, lastUsedAt: '2026-03-16', aiAssistRatePct: 75 },
  { userId: 'u-chen', skillId: 'SK-14', level: 4, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 53 },
  /* 何斯年 · 测试负责人（接口自动化 / JMeter / 测试设计） */
  { userId: 'u-he', skillId: 'SK-01', level: 2, certified: false, lastUsedAt: '2026-02-05', aiAssistRatePct: 83 },
  { userId: 'u-he', skillId: 'SK-02', level: 2, certified: false, lastUsedAt: '2026-02-05', aiAssistRatePct: 80 },
  { userId: 'u-he', skillId: 'SK-03', level: 2, certified: false, lastUsedAt: '2026-01-21', aiAssistRatePct: 79 },
  { userId: 'u-he', skillId: 'SK-04', level: 2, certified: false, lastUsedAt: '2026-02-18', aiAssistRatePct: 82 },
  { userId: 'u-he', skillId: 'SK-05', level: 2, certified: false, lastUsedAt: '2026-01-13', aiAssistRatePct: 85 },
  { userId: 'u-he', skillId: 'SK-06', level: 2, certified: false, lastUsedAt: '2026-02-26', aiAssistRatePct: 78 },
  { userId: 'u-he', skillId: 'SK-07', level: 2, certified: false, lastUsedAt: '2026-03-05', aiAssistRatePct: 81 },
  { userId: 'u-he', skillId: 'SK-08', level: 2, certified: false, lastUsedAt: '2026-03-05', aiAssistRatePct: 76 },
  { userId: 'u-he', skillId: 'SK-09', level: 5, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 41 },
  { userId: 'u-he', skillId: 'SK-10', level: 5, certified: true, lastUsedAt: '2026-03-17', aiAssistRatePct: 45 },
  { userId: 'u-he', skillId: 'SK-11', level: 3, certified: false, lastUsedAt: '2026-03-10', aiAssistRatePct: 67 },
  { userId: 'u-he', skillId: 'SK-12', level: 3, certified: false, lastUsedAt: '2026-03-18', aiAssistRatePct: 64 },
  { userId: 'u-he', skillId: 'SK-13', level: 3, certified: false, lastUsedAt: '2026-03-18', aiAssistRatePct: 70 },
  { userId: 'u-he', skillId: 'SK-14', level: 4, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 53 },
  /* 孟星回 · SRE / 运维工程师（Kubernetes / GitLab CI / Prometheus / SkyWalking） */
  { userId: 'u-meng', skillId: 'SK-01', level: 2, certified: false, lastUsedAt: '2026-01-28', aiAssistRatePct: 84 },
  { userId: 'u-meng', skillId: 'SK-02', level: 2, certified: false, lastUsedAt: '2026-01-28', aiAssistRatePct: 81 },
  { userId: 'u-meng', skillId: 'SK-03', level: 1, certified: false, lastUsedAt: '2025-07-11', aiAssistRatePct: 92 },
  { userId: 'u-meng', skillId: 'SK-04', level: 3, certified: false, lastUsedAt: '2026-03-13', aiAssistRatePct: 69 },
  { userId: 'u-meng', skillId: 'SK-05', level: 3, certified: false, lastUsedAt: '2026-03-13', aiAssistRatePct: 66 },
  { userId: 'u-meng', skillId: 'SK-06', level: 3, certified: false, lastUsedAt: '2026-03-09', aiAssistRatePct: 64 },
  { userId: 'u-meng', skillId: 'SK-07', level: 2, certified: false, lastUsedAt: '2026-02-12', aiAssistRatePct: 79 },
  { userId: 'u-meng', skillId: 'SK-08', level: 2, certified: false, lastUsedAt: '2026-02-12', aiAssistRatePct: 77 },
  { userId: 'u-meng', skillId: 'SK-09', level: 3, certified: false, lastUsedAt: '2026-03-06', aiAssistRatePct: 71 },
  { userId: 'u-meng', skillId: 'SK-10', level: 4, certified: false, lastUsedAt: '2026-03-17', aiAssistRatePct: 58 },
  { userId: 'u-meng', skillId: 'SK-11', level: 5, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 39 },
  { userId: 'u-meng', skillId: 'SK-12', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 42 },
  { userId: 'u-meng', skillId: 'SK-13', level: 2, certified: false, lastUsedAt: '2026-03-02', aiAssistRatePct: 74 },
  { userId: 'u-meng', skillId: 'SK-14', level: 5, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 46 },
  /* 顾时衍 · 项目经理 PMO（排期治理 / 风险管理 / PingCode） */
  { userId: 'u-gu', skillId: 'SK-01', level: 1, certified: false, lastUsedAt: '2025-03-19', aiAssistRatePct: 94 },
  { userId: 'u-gu', skillId: 'SK-02', level: 1, certified: false, lastUsedAt: '2025-03-19', aiAssistRatePct: 93 },
  { userId: 'u-gu', skillId: 'SK-03', level: 1, certified: false, lastUsedAt: '2025-05-08', aiAssistRatePct: 91 },
  { userId: 'u-gu', skillId: 'SK-04', level: 1, certified: false, lastUsedAt: '2025-10-23', aiAssistRatePct: 88 },
  { userId: 'u-gu', skillId: 'SK-05', level: 1, certified: false, lastUsedAt: '2025-10-23', aiAssistRatePct: 87 },
  { userId: 'u-gu', skillId: 'SK-06', level: 1, certified: false, lastUsedAt: '2025-06-30', aiAssistRatePct: 90 },
  { userId: 'u-gu', skillId: 'SK-07', level: 2, certified: false, lastUsedAt: '2026-02-09', aiAssistRatePct: 82 },
  { userId: 'u-gu', skillId: 'SK-08', level: 1, certified: false, lastUsedAt: '2025-12-04', aiAssistRatePct: 89 },
  { userId: 'u-gu', skillId: 'SK-09', level: 2, certified: false, lastUsedAt: '2026-01-16', aiAssistRatePct: 80 },
  { userId: 'u-gu', skillId: 'SK-10', level: 1, certified: false, lastUsedAt: '2025-11-19', aiAssistRatePct: 86 },
  { userId: 'u-gu', skillId: 'SK-11', level: 1, certified: false, lastUsedAt: '2025-09-02', aiAssistRatePct: 92 },
  { userId: 'u-gu', skillId: 'SK-12', level: 4, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 56 },
  { userId: 'u-gu', skillId: 'SK-13', level: 4, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 50 },
  { userId: 'u-gu', skillId: 'SK-14', level: 3, certified: false, lastUsedAt: '2026-03-18', aiAssistRatePct: 69 },
  /* 沈亦白 · 后端工程师（Java 17 / RabbitMQ / Elasticsearch） */
  { userId: 'u-shen', skillId: 'SK-01', level: 4, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 54 },
  { userId: 'u-shen', skillId: 'SK-02', level: 4, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 56 },
  { userId: 'u-shen', skillId: 'SK-03', level: 1, certified: false, lastUsedAt: '2025-10-15', aiAssistRatePct: 90 },
  { userId: 'u-shen', skillId: 'SK-04', level: 3, certified: false, lastUsedAt: '2026-03-13', aiAssistRatePct: 70 },
  { userId: 'u-shen', skillId: 'SK-05', level: 3, certified: false, lastUsedAt: '2026-03-11', aiAssistRatePct: 68 },
  { userId: 'u-shen', skillId: 'SK-06', level: 5, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 40 },
  { userId: 'u-shen', skillId: 'SK-07', level: 2, certified: false, lastUsedAt: '2026-02-04', aiAssistRatePct: 81 },
  { userId: 'u-shen', skillId: 'SK-08', level: 3, certified: false, lastUsedAt: '2026-03-19', aiAssistRatePct: 67 },
  { userId: 'u-shen', skillId: 'SK-09', level: 2, certified: false, lastUsedAt: '2026-01-23', aiAssistRatePct: 78 },
  { userId: 'u-shen', skillId: 'SK-10', level: 2, certified: false, lastUsedAt: '2026-01-20', aiAssistRatePct: 83 },
  { userId: 'u-shen', skillId: 'SK-11', level: 2, certified: false, lastUsedAt: '2026-02-20', aiAssistRatePct: 79 },
  { userId: 'u-shen', skillId: 'SK-12', level: 3, certified: false, lastUsedAt: '2026-03-14', aiAssistRatePct: 66 },
  { userId: 'u-shen', skillId: 'SK-13', level: 1, certified: false, lastUsedAt: '2025-11-07', aiAssistRatePct: 88 },
  { userId: 'u-shen', skillId: 'SK-14', level: 4, certified: true, lastUsedAt: '2026-03-19', aiAssistRatePct: 51 },
];

/** userId → 该成员的技能矩阵行 */
export const SKILL_MATRIX_BY_USER: Record<string, SkillMatrixCell[]> = SKILL_MATRIX.reduce<
  Record<string, SkillMatrixCell[]>
>((acc, cell) => {
  const list = acc[cell.userId];
  if (list) {
    list.push(cell);
  } else {
    acc[cell.userId] = [cell];
  }
  return acc;
}, {});

/** 认证证书定义 */
export interface CertificationDef {
  id: string;
  name: string;
  issuer: string;
  level: string;
  validUntil: string;
  holderIds: string[];
  relatedSkillIds: string[];
}

/**
 * 8 张证书。holderIds 与 MemberProfileDef.certifications 双向对账；
 * relatedSkillIds 决定 SKILL_MATRIX 中哪些单元格的 certified 为 true。
 */
export const CERTIFICATIONS: CertificationDef[] = [
  {
    id: 'CERT-01',
    name: 'Oracle Certified Professional: Java SE 17 Developer',
    issuer: 'Oracle',
    level: 'Professional',
    validUntil: '2027-06-30',
    holderIds: ['u-zhou', 'u-yan'],
    relatedSkillIds: ['SK-01'],
  },
  {
    id: 'CERT-02',
    name: 'Certified Kubernetes Administrator（CKA）',
    issuer: 'CNCF / Linux Foundation',
    level: 'Administrator',
    validUntil: '2027-02-28',
    holderIds: ['u-meng'],
    relatedSkillIds: ['SK-11'],
  },
  {
    id: 'CERT-03',
    name: '阿里云 ACP 云原生架构师',
    issuer: '阿里云',
    level: 'Professional',
    validUntil: '2026-11-30',
    holderIds: ['u-yan', 'u-meng'],
    relatedSkillIds: ['SK-11'],
  },
  {
    id: 'CERT-04',
    name: 'ISTQB 高级测试工程师（Test Manager）',
    issuer: 'ISTQB / 中国软件评测中心',
    level: 'Advanced',
    validUntil: '2028-03-31',
    holderIds: ['u-he'],
    relatedSkillIds: ['SK-09', 'SK-10'],
  },
  {
    id: 'CERT-05',
    name: 'PMI 项目管理专业人士（PMP）',
    issuer: 'PMI',
    level: 'Professional',
    validUntil: '2027-09-30',
    holderIds: ['u-gu'],
    relatedSkillIds: ['SK-13'],
  },
  {
    id: 'CERT-06',
    name: '注册信息安全专业人员（CISP）',
    issuer: '中国信息安全测评中心',
    level: 'Professional',
    validUntil: '2027-05-31',
    holderIds: ['u-lin'],
    relatedSkillIds: ['SK-08', 'SK-12'],
  },
  {
    id: 'CERT-07',
    name: 'DDD 领域驱动设计实战认证（内部 L2）',
    issuer: 'Artisan 技术中心',
    level: 'Internal-L2',
    validUntil: '2027-01-31',
    holderIds: ['u-lin', 'u-yan', 'u-su'],
    relatedSkillIds: ['SK-07'],
  },
  {
    id: 'CERT-08',
    name: 'Artisan AI 结对工程师认证（内部 L3）',
    issuer: 'Artisan AI 工程平台',
    level: 'Internal-L3',
    validUntil: '2026-12-31',
    holderIds: ['u-zhou', 'u-chen', 'u-he', 'u-meng', 'u-shen'],
    relatedSkillIds: ['SK-14'],
  },
];

/** 成员成长计划 */
export interface MemberGrowthPlan {
  goal: string;
  actions: string[];
  reviewAt: string;
}

/** 成员档案（人员管理主页的一行） */
export interface MemberProfileDef {
  userId: string;
  employeeNo: string;
  joinDate: string;
  seniority: 'P4' | 'P5' | 'P6' | 'P7' | 'P8';
  /** 直接汇报对象（USERS.id）；无平台内汇报对象时为 null */
  directReportTo: string | null;
  teamIds: string[];
  location: string;
  employmentType: '正式' | '外包' | '实习' | 'AI 账号';
  /** 月度综合成本（万元）；AI 账号为算力折算成本 */
  monthlyCostWan: number;
  /** 本迭代产能上限（故事点），等于 USERS.capacity */
  sprintCapacity: number;
  /** 本迭代已分配故事点，与 WORKLOADS 一致 */
  allocatedPoints: number;
  /** loadPct = allocatedPoints ÷ sprintCapacity × 100，保留 1 位小数 */
  loadPct: number;
  overtimeHoursMonth: number;
  /** 采纳 AI 建议的比例（近 30 日），与 AI_COLLAB_PREFS.acceptRatePct 同源 */
  aiAcceptRatePct: number;
  /** Top3 拒绝 AI 建议的理由；AI 账号为空数组 */
  aiRejectReasons: string[];
  /** 评审平均耗时（分钟） */
  reviewAvgMin: number;
  commitCount30d: number;
  prCount30d: number;
  /** 缺陷逃逸数（近 30 日，流入测试或生产阶段的缺陷） */
  defectEscapeCount30d: number;
  certifications: string[];
  growthPlan: MemberGrowthPlan;
  statusLabel: '在岗' | '休假' | '借调' | '离职交接';
  tone: Tone;
  note: string;
}

/**
 * 10 份成员档案（含 AI 共享账号 u-ai-copilot）。
 * sprintCapacity / allocatedPoints / loadPct 与 WORKLOADS 严格一致；
 * certifications 与 CERTIFICATIONS.holderIds 双向对账；tone 取 USERS.avatarColor。
 * SP-24 处于收口关键期，10 个账号 statusLabel 均为「在岗」。
 */
export const MEMBER_PROFILES: MemberProfileDef[] = [
  {
    userId: 'u-lin',
    employeeNo: 'AT-2018-0126',
    joinDate: '2018-03-12',
    seniority: 'P8',
    directReportTo: null,
    teamIds: ['TEAM-04'],
    location: '上海 · 张江研发中心 A 座 12F',
    employmentType: '正式',
    monthlyCostWan: 9.8,
    sprintCapacity: 8,
    allocatedPoints: 6,
    loadPct: 75.0,
    overtimeHoursMonth: 12,
    aiAcceptRatePct: 68.4,
    aiRejectReasons: ['指标归因缺少数据来源标注，无法在周会上直接引用', '建议过于笼统，未给出可执行的资源调配动作', '周报语气偏对外宣传，不符合对内汇报口径'],
    reviewAvgMin: 26,
    commitCount30d: 6,
    prCount30d: 1,
    defectEscapeCount30d: 0,
    certifications: ['CERT-06', 'CERT-07'],
    growthPlan: {
      goal: '2026 H1 完成技术中心效能度量体系（DORA 四指标 + AI 采纳率）落地，并向集团输出方法论',
      actions: ['把 SP-22 ~ SP-24 的 TEAM_METRICS 快照接入效能看板并固化口径', '牵头制定「AI 采纳率 × 缺陷逃逸率」的联合考核口径，避免单指标导向', '完成 2 场对外效能治理分享，沉淀为 KB 条目'],
      reviewAt: '2026-06-30',
    },
    statusLabel: '在岗',
    tone: 'brand',
    note: '向集团 CTO 汇报，平台内无上级账号，故 directReportTo 为 null',
  },
  {
    userId: 'u-su',
    employeeNo: 'AT-2020-0634',
    joinDate: '2020-07-06',
    seniority: 'P7',
    directReportTo: null,
    teamIds: ['TEAM-03'],
    location: '上海 · 张江研发中心 A 座 11F',
    employmentType: '正式',
    monthlyCostWan: 6.4,
    sprintCapacity: 21,
    allocatedPoints: 18,
    loadPct: 85.7,
    overtimeHoursMonth: 26,
    aiAcceptRatePct: 82.4,
    aiRejectReasons: ['验收标准不可测，缺少量化阈值与观测口径', '把业务方口述过度引申为需求，超出原始诉求', '用户故事粒度不一致，大小混杂难以估算'],
    reviewAvgMin: 38,
    commitCount30d: 0,
    prCount30d: 0,
    defectEscapeCount30d: 0,
    certifications: ['CERT-07'],
    growthPlan: {
      goal: '晋升 P8：主导履约与售后（PRJ-04）从 0 到 1 的产品定义，并拿下跨境业务线的年度产品奖',
      actions: ['独立完成 PRJ-04 的产品蓝图与 3 个 Epic 拆解', '把需求池 AI 打分的业务价值维度校准到与实际交付效果对齐', '带教 1 名产品实习生完成一次完整需求澄清'],
      reviewAt: '2026-06-30',
    },
    statusLabel: '在岗',
    tone: 'ai',
    note: '产品序列独立汇报至零售事业部产品总监，故 directReportTo 为 null；不提交代码，commit / PR 计数为 0',
  },
  {
    userId: 'u-yan',
    employeeNo: 'AT-2017-0089',
    joinDate: '2017-09-01',
    seniority: 'P8',
    directReportTo: 'u-lin',
    teamIds: ['TEAM-04'],
    location: '上海 · 张江研发中心 A 座 12F',
    employmentType: '正式',
    monthlyCostWan: 11.2,
    sprintCapacity: 13,
    allocatedPoints: 5,
    loadPct: 38.5,
    overtimeHoursMonth: 22,
    aiAcceptRatePct: 80.2,
    aiRejectReasons: ['忽略 KB-ARCH-01 的分层约束，把领域逻辑写进接入层', '接口契约缺少错误码与幂等语义定义', '多方案对比只给结论不给权衡依据'],
    reviewAvgMin: 34,
    commitCount30d: 34,
    prCount30d: 4,
    defectEscapeCount30d: 0,
    certifications: ['CERT-01', 'CERT-03', 'CERT-07'],
    growthPlan: {
      goal: '完成订单中心三个限界上下文的架构治理收口，输出可复用的「单体拆分方法论」并纳入 KB-ARCH-01',
      actions: ['把 14 份接口契约的冻结流程固化为门禁规则', '产出分片键选型与热点治理的决策记录（ADR）3 篇', '为 PRJ-04 履约域培养 1 名可独立主持评审的架构后备'],
      reviewAt: '2026-05-29',
    },
    statusLabel: '在岗',
    tone: 'indigo',
    note: '本迭代仅承接 TASK-2411（5 点），故事点负载 38.5%；但他同时是 15 个 MR 的评审人与 API-10 拆单契约的冻结责任人，评审与方案确认不计入故事点口径，实际时间饱和度接近 100%',
  },
  {
    userId: 'u-zhou',
    employeeNo: 'AT-2020-0812',
    joinDate: '2020-11-16',
    seniority: 'P7',
    directReportTo: 'u-lin',
    teamIds: ['TEAM-01'],
    location: '杭州 · 滨江研发园 B 座 6F',
    employmentType: '正式',
    monthlyCostWan: 7.6,
    sprintCapacity: 21,
    allocatedPoints: 47,
    loadPct: 223.8,
    overtimeHoursMonth: 41,
    aiAcceptRatePct: 79.6,
    aiRejectReasons: ['生成的 SQL 未命中分片键，会触发跨分片扫描', '单测只覆盖正常路径，缺少异常与并发分支', '引入未在 pom 中声明的依赖版本'],
    reviewAvgMin: 21,
    commitCount30d: 142,
    prCount30d: 11,
    defectEscapeCount30d: 2,
    certifications: ['CERT-01', 'CERT-08'],
    growthPlan: {
      goal: 'P7 → P8：具备跨域架构决策能力，主导 SP-25 履约域技术方案设计',
      actions: ['把 TASK-2419 迁移作业的断点续传方案沉淀为团队标准组件', '主导 2 次架构评审会并输出评审纪要', '将个人负载控制在 120% 以内，把非关键路径任务转交团队成员'],
      reviewAt: '2026-09-30',
    },
    statusLabel: '在岗',
    tone: 'info',
    note: '严重过载：承接 7 个任务共 47 点，为产能 21 点的 223.8%，已列入 PR-06 关键人依赖风险',
  },
  {
    userId: 'u-chen',
    employeeNo: 'AT-2023-1147',
    joinDate: '2023-07-03',
    seniority: 'P5',
    directReportTo: 'u-lin',
    teamIds: ['TEAM-02'],
    location: '上海 · 张江研发中心 B 座 9F',
    employmentType: '正式',
    monthlyCostWan: 4.8,
    sprintCapacity: 18,
    allocatedPoints: 10,
    loadPct: 55.6,
    overtimeHoursMonth: 14,
    aiAcceptRatePct: 76.3,
    aiRejectReasons: ['生成的组件未遵循组合式 API 与项目目录约定', '忽略虚拟滚动的 key 稳定性要求，导致重排抖动', '样式使用内联而非设计令牌变量'],
    reviewAvgMin: 19,
    commitCount30d: 68,
    prCount30d: 6,
    defectEscapeCount30d: 1,
    certifications: ['CERT-08'],
    growthPlan: {
      goal: '补齐 Node 侧 BFF 能力，成为交易中台前端组的第二技术负责人',
      actions: ['独立交付订单列表游标分页 + 虚拟滚动的性能改造并输出复盘', '承接 TASK-2416 拆单聚合视图的端到端实现', '完成一次 BFF 层的技术分享与脚手架沉淀'],
      reviewAt: '2026-09-30',
    },
    statusLabel: '在岗',
    tone: 'teal',
    note: '负载 55.6% 为团队最低，是承接 u-zhou 转出任务（如 TASK-2408）的首选人选',
  },
  {
    userId: 'u-he',
    employeeNo: 'AT-2021-0455',
    joinDate: '2021-04-19',
    seniority: 'P6',
    directReportTo: null,
    teamIds: ['TEAM-05'],
    location: '成都 · 天府软件园 C 区 4F',
    employmentType: '正式',
    monthlyCostWan: 5.2,
    sprintCapacity: 18,
    allocatedPoints: 16,
    loadPct: 88.9,
    overtimeHoursMonth: 24,
    aiAcceptRatePct: 74.8,
    aiRejectReasons: ['用例断言过于宽松，只校验 HTTP 状态码不校验业务字段', '未覆盖金额边界与并发场景', '测试数据构造依赖生产库快照，存在合规风险'],
    reviewAvgMin: 28,
    commitCount30d: 24,
    prCount30d: 3,
    defectEscapeCount30d: 0,
    certifications: ['CERT-04', 'CERT-08'],
    growthPlan: {
      goal: '把接口自动化覆盖率从 62% 提升到 85%，建立质量门禁的自动化签发能力',
      actions: ['完成 128 组金额边界用例的回归并沉淀为可复用数据集', '把 TR-24 测试报告的签发条件固化为 G4 门禁规则', '引入 AI 缺陷复现能力，把平均定位时长压到 30 分钟以内'],
      reviewAt: '2026-06-30',
    },
    statusLabel: '在岗',
    tone: 'amber',
    note: '质量序列独立汇报至 CTO 以保证签发独立性，故 directReportTo 为 null',
  },
  {
    userId: 'u-meng',
    employeeNo: 'AT-2021-0733',
    joinDate: '2021-08-09',
    seniority: 'P6',
    directReportTo: null,
    teamIds: ['TEAM-06'],
    location: '上海 · 张江研发中心 A 座 10F',
    employmentType: '正式',
    monthlyCostWan: 5.6,
    sprintCapacity: 13,
    allocatedPoints: 9,
    loadPct: 69.2,
    overtimeHoursMonth: 31,
    aiAcceptRatePct: 87.5,
    aiRejectReasons: ['回滚步骤缺少数据一致性校验环节', '门禁阈值取默认值而非项目基线值', '告警规则未考虑维护窗口静默，噪声偏高'],
    reviewAvgMin: 23,
    commitCount30d: 51,
    prCount30d: 5,
    defectEscapeCount30d: 1,
    certifications: ['CERT-02', 'CERT-03', 'CERT-08'],
    growthPlan: {
      goal: '完成订单中心 SRE 体系建设：SLO 定义、错误预算与自愈预案全覆盖',
      actions: ['为 order-api / order-query / order-event 三个服务定义 SLO 与错误预算', '把 REL-2403 的四批灰度准入条件固化为可执行策略', '完成一键回切脚本的季度演练并把 RTO 稳定在 10 分钟以内'],
      reviewAt: '2026-06-30',
    },
    statusLabel: '在岗',
    tone: 'warn',
    note: '基础平台部独立汇报，故 directReportTo 为 null；虽负载 69.2%，但发布周值班使加班时长达 31h',
  },
  {
    userId: 'u-gu',
    employeeNo: 'AT-2022-0298',
    joinDate: '2022-02-14',
    seniority: 'P6',
    directReportTo: null,
    teamIds: ['TEAM-07'],
    location: '上海 · 张江研发中心 A 座 11F',
    employmentType: '正式',
    monthlyCostWan: 4.6,
    sprintCapacity: 13,
    allocatedPoints: 11,
    loadPct: 84.6,
    overtimeHoursMonth: 18,
    aiAcceptRatePct: 71.2,
    aiRejectReasons: ['排期建议未考虑成员实际产能与在途阻塞', '风险评分与既有登记册口径不一致', '生成的甘特图忽略关键路径的前后置依赖'],
    reviewAvgMin: 42,
    commitCount30d: 0,
    prCount30d: 0,
    defectEscapeCount30d: 0,
    certifications: ['CERT-05'],
    growthPlan: {
      goal: '建立跨项目排期治理机制，把里程碑滑移率从 18% 降到 10% 以内',
      actions: ['把 BLOCK 类阻塞的升级时效 SLA 固化为 24 小时', '建立项目组合级的资源冲突周视图（覆盖 6 个项目）', '推动需求变更率纳入项目健康度评分模型'],
      reviewAt: '2026-06-30',
    },
    statusLabel: '在岗',
    tone: 'pink',
    note: 'PMO 办公室独立汇报，故 directReportTo 为 null；不提交代码，commit / PR 计数为 0',
  },
  {
    userId: 'u-shen',
    employeeNo: 'OS-2025-0361',
    joinDate: '2025-06-01',
    seniority: 'P5',
    directReportTo: 'u-zhou',
    teamIds: ['TEAM-01'],
    location: '杭州 · 滨江研发园 B 座 6F（乙方驻场）',
    employmentType: '外包',
    monthlyCostWan: 3.8,
    sprintCapacity: 21,
    allocatedPoints: 38,
    loadPct: 181.0,
    overtimeHoursMonth: 37,
    aiAcceptRatePct: 81.7,
    aiRejectReasons: ['补偿分支留空实现，违反 KB-ARCH-01 的红线约束', '消息幂等键未与订单号绑定，重复投递会产生副作用', '重构范围超出任务卡边界，波及未评估的模块'],
    reviewAvgMin: 24,
    commitCount30d: 116,
    prCount30d: 10,
    defectEscapeCount30d: 3,
    certifications: ['CERT-08'],
    growthPlan: {
      goal: '外包转正评估：独立完成一个 P1 需求的端到端交付（设计 → 编码 → 自测 → 上线）',
      actions: ['独立承接 TASK-2408 审计流水的完整实现并通过 G3', '把 outbox 中继的指数退避实现沉淀为团队可复用组件', '缺陷逃逸数从 3 个降到 1 个以内'],
      reviewAt: '2026-06-30',
    },
    statusLabel: '在岗',
    tone: 'slate',
    note: '外包（乙方：杭州云枢软件），合同至 2026-12-31，承接订单域非核心链路；负载 181.0% 已列入 PR-06',
  },
  {
    userId: 'u-ai-copilot',
    employeeNo: 'AI-AGENT-0001',
    joinDate: '2025-11-20',
    seniority: 'P6',
    directReportTo: 'u-lin',
    teamIds: [],
    location: '私有化集群 cn-east-2（AI 工程平台）',
    employmentType: 'AI 账号',
    monthlyCostWan: 3.4,
    sprintCapacity: 0,
    allocatedPoints: 0,
    loadPct: 0,
    overtimeHoursMonth: 0,
    aiAcceptRatePct: 0,
    aiRejectReasons: [],
    reviewAvgMin: 12,
    commitCount30d: 387,
    prCount30d: 42,
    defectEscapeCount30d: 4,
    certifications: [],
    growthPlan: {
      goal: '把编码环节 AI 采纳率从 79.6% 提升到 85%，同时把每千行代码的缺陷逃逸压到 0.3 个以下',
      actions: ['将 KB-CODE-02《金额计算规约》加入金额类任务的强制召回白名单', '为分片相关任务补充「SQL 必须命中分片键」的提示词约束', '上线评审 Agent 的「补偿分支留空」检测规则'],
      reviewAt: '2026-04-30',
    },
    statusLabel: '在岗',
    tone: 'ai',
    note: 'AI 共享账号不参与职级序列，seniority 按等效产能对标 P6 用于成本核算；不占用人力产能，故 sprintCapacity / allocatedPoints / loadPct 均为 0，aiAcceptRatePct 与 aiRejectReasons 不适用',
  },
];

/** userId → 成员档案 */
export const MEMBER_PROFILE_MAP: Record<string, MemberProfileDef> = MEMBER_PROFILES.reduce<
  Record<string, MemberProfileDef>
>((acc, m) => {
  acc[m.userId] = m;
  return acc;
}, {});

/** 本迭代负载明细 */
export interface WorkloadDef {
  userId: string;
  /** 本迭代已分配故事点 */
  allocatedPoints: number;
  /** 产能上限（故事点），取 USERS.capacity */
  capacityPoints: number;
  /** loadPct = allocatedPoints ÷ capacityPoints × 100，保留 1 位小数 */
  loadPct: number;
  /** 本迭代关联的真实任务（承接或评审），取自 ./data 的 TASKS */
  taskIds: string[];
  /** 是否过载（loadPct > 100） */
  overload: boolean;
  /** AI 分担的故事点（按任务 aiRatio 折算），不超过 allocatedPoints */
  aiOffloadPoints: number;
  riskNote: string;
  /** AI 给出的具体调配建议 */
  suggestedAction: string;
  /** allocatedPoints 的构成说明 */
  note: string;
  tone: Tone;
}

/**
 * 9 位真人的 SP-24 负载明细（u-ai-copilot 不占用人力产能，不入表）。
 * capacityPoints 严格取 ./data 的 USERS.capacity；
 * 研发角色的 allocatedPoints = 其在 TASKS 中作为 ownerId 的故事点合计（可逐条复核）；
 * 产品 / 测试 / PMO / 管理者未直接承接 TASK-24xx，其 allocatedPoints 由 SP-24 承诺的
 * 非任务型工作项折算，构成在 note 中逐条写明，taskIds 则列出其作为 reviewerId 参与的真实任务。
 */
export const WORKLOADS: WorkloadDef[] = [
  {
    userId: 'u-zhou',
    allocatedPoints: 47,
    capacityPoints: 21,
    loadPct: 223.8,
    taskIds: ['TASK-2401', 'TASK-2403', 'TASK-2406', 'TASK-2409', 'TASK-2412', 'TASK-2415', 'TASK-2419'],
    overload: true,
    aiOffloadPoints: 12,
    riskNote: '负载 223.8% 为全团队最高，7 个任务中 4 个位于 CRITICAL_PATH（TASK-2401 / 2403 / 2412 / 2419）；近 30 日加班 41h，缺陷逃逸 2 个，TASK-2419 已被 BLOCK-0312 阻塞 7 天',
    suggestedAction: '立即转出 2 个非关键路径任务：TASK-2415（拆单引擎，8 点，AI 已产出方案且 stageId 仍在 st-arch）转交沈亦白，TASK-2406（状态机，5 点，progress 78%）由 AI 结对完成剩余单测后交陈屿联调；本人聚焦 TASK-2419 迁移与 TASK-2401 幂等收口，预计负载可降至 161.9%（34 / 21）',
    note: '47 点 = TASK-2401(8) + TASK-2403(5) + TASK-2406(5) + TASK-2409(8) + TASK-2412(5) + TASK-2415(8) + TASK-2419(8)，全部来自 ./data 的 TASKS.ownerId === u-zhou',
    tone: 'danger',
  },
  {
    userId: 'u-shen',
    allocatedPoints: 38,
    capacityPoints: 21,
    loadPct: 181.0,
    taskIds: ['TASK-2402', 'TASK-2407', 'TASK-2408', 'TASK-2410', 'TASK-2413', 'TASK-2417', 'TASK-2420', 'TASK-2422'],
    overload: true,
    aiOffloadPoints: 11,
    riskNote: '负载 181.0%，8 个任务中 TASK-2410（金额精度，关联 BUG-1043）与 TASK-2420（双写校验）同时在关键路径上；缺陷逃逸 3 个为团队最高，外包身份不具备生产变更独立审批权',
    suggestedAction: 'TASK-2402 / TASK-2417 已发布，可从在途负载中释放 10 点；把 TASK-2408（审计流水，3 点）转交陈屿，TASK-2422（SM4 加密，2 点）随 REQ-2408 一并顺延到 v3.0；本人保留 TASK-2410 与 TASK-2420 两项资损相关任务，调整后负载 161.9%（34 / 21）',
    note: '38 点 = TASK-2402(5) + TASK-2407(5) + TASK-2408(3) + TASK-2410(8) + TASK-2413(5) + TASK-2417(5) + TASK-2420(5) + TASK-2422(2)，全部来自 TASKS.ownerId === u-shen',
    tone: 'danger',
  },
  {
    userId: 'u-su',
    allocatedPoints: 18,
    capacityPoints: 21,
    loadPct: 85.7,
    taskIds: ['TASK-2405', 'TASK-2409', 'TASK-2411', 'TASK-2416'],
    overload: false,
    aiOffloadPoints: 4,
    riskNote: '同时是 REQ-2401 / 2402 / 2403 / 2405 四条需求（合计 68 点）的产品负责人，需求变更率 18.4% 主要由其承接的业务方诉求驱动；PRD-ORD-v2.3 基线在 SP-24 内已修订 2 次',
    suggestedAction: '把 REQ-2405（多仓拆单）的验收标准编写交给 ag-pm 生成初稿后仅做审校，可释放约 3 点；若 03-23 前 G3 仍不达标，建议主动把 REQ-2405 移出 rc1，避免验收环节成为新的瓶颈',
    note: '未在 TASKS 中承接开发任务。18 点 = PRD-ORD-v2.3 基线维护与 2 次修订(6) + 4 条需求的验收标准与用户故事维护(8) + 需求澄清会与 3 场业务对齐(4)；taskIds 列出其作为 reviewerId（TASK-2409 / TASK-2416）及需求验收关联（TASK-2405 / TASK-2411）的任务',
    tone: 'warn',
  },
  {
    userId: 'u-he',
    allocatedPoints: 16,
    capacityPoints: 18,
    loadPct: 88.9,
    taskIds: ['TASK-2405', 'TASK-2408', 'TASK-2411', 'TASK-2420', 'TASK-2424'],
    overload: false,
    aiOffloadPoints: 6,
    riskNote: 'G4 用例执行率仅 62%，128 组金额边界用例完成 74 组；12 个缺陷中 BUG-1053（长稳内存增长）与 BUG-1055（状态流水 P95 380ms）尚未闭环，签发 TR-24 的证据链不完整',
    suggestedAction: '把 248 条用例中的 162 条回归用例交给 ag-test 全自动执行并只做失败复核，可释放约 5 点；本人集中处理 128 组金额边界用例的剩余 54 组与 3000 TPS 长稳压测复跑，建议在 03-24 前完成',
    note: '未在 TASKS 中承接开发任务。16 点 = 测试计划 TP-24 设计与维护(4) + 248 条用例执行与复核(7) + 12 个缺陷验证与 2 轮压测(5)；taskIds 为其在 TASKS 中担任 reviewerId 的 5 个任务',
    tone: 'warn',
  },
  {
    userId: 'u-yan',
    allocatedPoints: 5,
    capacityPoints: 13,
    loadPct: 38.5,
    taskIds: ['TASK-2407', 'TASK-2411', 'TASK-2415'],
    overload: false,
    aiOffloadPoints: 2,
    riskNote: '故事点负载仅 38.5%，但实际时间被评审吃满：他是 15 个 MR 的 reviewerId、API-10 拆单契约的冻结责任人，且 TASK-2407 与 TASK-2415 两个任务卡在 st-arch 等他确认方案。PRJ-04 履约域架构评审（MS-12）排在 04-03，若 SP-24 收口延后将与 PR-08 叠加',
    suggestedAction: '故事点口径的低负载掩盖了评审瓶颈，建议双管齐下：① 把 TASK-2407 的技术选型交给 ag-arch 输出方案对比矩阵后只做签核，可释放 2 点；② MR 评审设置每日 14:00~16:00 固定窗口，规约类问题全部前移给 ag-review 拦截，把人工评审聚焦在事务边界与分片语义上，预计可把 COOP-01 的 6.4 小时平均等待再压缩 40%',
    note: '5 点 = 本人承接的 TASK-2411（试算与下单结果强一致校验）；15 个 MR 的架构评审与 TASK-2407 / TASK-2415 的方案确认不计入故事点口径，故负载率偏低但实际时间饱和度接近 100%',
    tone: 'ok',
  },
  {
    userId: 'u-gu',
    allocatedPoints: 11,
    capacityPoints: 13,
    loadPct: 84.6,
    taskIds: ['TASK-2419', 'TASK-2420', 'TASK-2421'],
    overload: false,
    aiOffloadPoints: 3,
    riskNote: 'BLOCK-0312 已阻塞 7 天未升级到位，甘特冲突登记 4 项中 2 项仍为 open；REL-2403 的发布评审会组织与 4 批灰度准入判定均落在其身上',
    suggestedAction: '把每周风险登记册的条目草拟与评分交给 ag-ba 自动生成后只做复核，可释放 2 点；建议将 BLOCK-0312 的升级层级从研发总监提升到指导委员会（SH-07 韩沐辰），并在 03-20 前给出书面批复时限',
    note: '未在 TASKS 中承接或评审任何任务。11 点 = 排期治理与甘特冲突收敛(4) + 风险登记册与 2 次升级上报(3) + 发布评审会与里程碑签核组织(4)；taskIds 列出其作为 PMO 治理对象的关键路径阻塞链（CRITICAL_PATH 末段），且其为 REL-2403 的 approverIds 成员',
    tone: 'warn',
  },
  {
    userId: 'u-meng',
    allocatedPoints: 9,
    capacityPoints: 13,
    loadPct: 69.2,
    taskIds: ['TASK-2404', 'TASK-2418', 'TASK-2421', 'TASK-2424'],
    overload: false,
    aiOffloadPoints: 4,
    riskNote: '故事点负载不高但发布周值班强度大，近 30 日加班 31h；REL-2403 的 4 批灰度与一键回切脚本演练（已演练 2 次）都依赖其单点，缺少备份值班人',
    suggestedAction: '把 TASK-2424（审计告警，1 点）与门禁预检脚本维护交给 ag-ops 自动化，可释放 2 点；建议在 03-26 顺延窗口前完成 1 名备份值班人的交接演练，避免 REL-2403 执行期出现单点不可用',
    note: '9 点 = TASK-2404(2) + TASK-2418(3) + TASK-2421(3) + TASK-2424(1)，全部来自 TASKS.ownerId === u-meng',
    tone: 'ok',
  },
  {
    userId: 'u-chen',
    allocatedPoints: 10,
    capacityPoints: 18,
    loadPct: 55.6,
    taskIds: ['TASK-2414', 'TASK-2416', 'TASK-2423'],
    overload: false,
    aiOffloadPoints: 3,
    riskNote: '负载 55.6% 为研发角色中最低，存在 8 点空闲产能；TASK-2416（拆单聚合视图）因 API-10 契约未冻结而 progress 为 0，endDate 2026-03-25 已进入迭代最后一周',
    suggestedAction: '建议承接从 u-zhou 转出的 TASK-2408（审计流水，3 点，前端仅需订阅展示）与从 u-shen 转出的联调部分；同时基于 ag-arch 产出的履约回调 Mock Server 先行启动 TASK-2416，不必等待契约冻结，可把 8 点空闲产能利用率提升到 78%',
    note: '10 点 = TASK-2414(3) + TASK-2416(5) + TASK-2423(2)，全部来自 TASKS.ownerId === u-chen',
    tone: 'ok',
  },
  {
    userId: 'u-lin',
    allocatedPoints: 6,
    capacityPoints: 8,
    loadPct: 75.0,
    taskIds: ['TASK-2421', 'TASK-2422', 'TASK-2423'],
    overload: false,
    aiOffloadPoints: 1,
    riskNote: '作为 REQ-2408 合规需求负责人与 REL-2403 的最终审批人，其决策时点直接决定 03-20 窗口能否放行；当前 3 个待其评审的任务均在 03-19 之后启动',
    suggestedAction: '把周报汇总与效能指标归因交给 ag-ba 自动生成后只做确认（本周已节省约 1.5h）；建议在 03-20 12:00 前对 REL-2403 给出「放行 / 顺延」的明确结论，避免窗口悬置导致 DBA 与值班资源双重浪费',
    note: '未在 TASKS 中承接开发任务。6 点 = REQ-2408 合规需求的产品验收与 SEC-MASK-2.1 接入协调(3) + REL-2403 发布审批与门禁复核(2) + 效能度量口径制定(1)；taskIds 为其在 TASKS 中担任 reviewerId 的 3 个任务',
    tone: 'ok',
  },
];

/** 成员 AI 协作偏好 */
export interface AiCollabPrefDef {
  userId: string;
  /** 常用 Agent（agents.id），2 ~ 3 个 */
  preferredAgentIds: string[];
  /** 常用模型（models.id），1 ~ 2 个 */
  preferredModelIds: string[];
  /** 自动采纳范围：不自动采纳 / 仅测试 / 仅文档 / 仅重构 / 全部 */
  autoAcceptScope: 'none' | 'tests' | 'docs' | 'refactor' | 'all';
  /** 常用提示词模板 id（与 ./data 的 RAG 知识库 kbId 同源） */
  promptTemplateIds: string[];
  /** 单次会话平均时长（分钟） */
  avgSessionMin: number;
  dailySessionCount: number;
  /** 采纳率（近 30 日），与 MemberProfileDef.aiAcceptRatePct 同源 */
  acceptRatePct: number;
  /** 对 AI 产出的满意度评分 1-5 */
  feedbackScore: number;
  topUseCases: string[];
  /** 在哪些 SDLC 环节关闭 AI（SDLC_STAGES.id） */
  optOutStages: string[];
}

/**
 * 9 位真人的 AI 协作偏好（u-ai-copilot 本身即 AI，不配置偏好）。
 * promptTemplateIds 引用 ./data 中 ragEntries.kbId 与 BUG_ANALYSIS 已出现的知识库模板 id，
 * 保证外键真实存在；acceptRatePct 与 MEMBER_PROFILES.aiAcceptRatePct 取值一致。
 */
export const AI_COLLAB_PREFS: AiCollabPrefDef[] = [
  {
    userId: 'u-lin',
    preferredAgentIds: ['ag-ba', 'ag-review'],
    preferredModelIds: ['mdl-gpt5', 'mdl-claude'],
    autoAcceptScope: 'none',
    promptTemplateIds: ['KB-ARCH-01'],
    avgSessionMin: 22,
    dailySessionCount: 3,
    acceptRatePct: 68.4,
    feedbackScore: 4,
    topUseCases: ['跨迭代效能指标归因与项目周报汇总', '发布风险评审与六道门禁结论复核', '架构决策记录（ADR）草稿生成'],
    optOutStages: ['st-code'],
  },
  {
    userId: 'u-su',
    preferredAgentIds: ['ag-pm', 'ag-test'],
    preferredModelIds: ['mdl-claude', 'mdl-qwen'],
    autoAcceptScope: 'docs',
    promptTemplateIds: ['KB-BS-2401'],
    avgSessionMin: 34,
    dailySessionCount: 6,
    acceptRatePct: 82.4,
    feedbackScore: 5,
    topUseCases: ['业务方口述转结构化 PRD 与验收标准', '用户故事拆解并同步至 PingCode 需求', '竞品优惠规则对比与差距分析'],
    optOutStages: ['st-deploy', 'st-observe'],
  },
  {
    userId: 'u-yan',
    preferredAgentIds: ['ag-arch', 'ag-review'],
    preferredModelIds: ['mdl-gpt5', 'mdl-claude'],
    autoAcceptScope: 'refactor',
    promptTemplateIds: ['KB-ARCH-01', 'KB-CODE-05'],
    avgSessionMin: 41,
    dailySessionCount: 5,
    acceptRatePct: 80.2,
    feedbackScore: 4,
    topUseCases: ['限界上下文边界与聚合根划分推演', '14 份接口契约的 OpenAPI 生成与一致性校验', '拆单方案的多方案对比与选型建议'],
    optOutStages: ['st-test'],
  },
  {
    userId: 'u-zhou',
    preferredAgentIds: ['ag-code', 'ag-review', 'ag-arch'],
    preferredModelIds: ['mdl-claude'],
    autoAcceptScope: 'tests',
    promptTemplateIds: ['KB-CODE-02', 'KB-CODE-05'],
    avgSessionMin: 58,
    dailySessionCount: 9,
    acceptRatePct: 79.6,
    feedbackScore: 4,
    topUseCases: ['幂等校验与基因分片路由的结对编码', '单元测试补齐至 85% 覆盖率目标', '迁移作业断点续传与批次控制逻辑生成'],
    optOutStages: [],
  },
  {
    userId: 'u-chen',
    preferredAgentIds: ['ag-code', 'ag-test'],
    preferredModelIds: ['mdl-claude', 'mdl-deepseek'],
    autoAcceptScope: 'tests',
    promptTemplateIds: ['KB-CODE-02'],
    avgSessionMin: 46,
    dailySessionCount: 7,
    acceptRatePct: 76.3,
    feedbackScore: 4,
    topUseCases: ['Vue 3 组件与 Pinia store 脚手架生成', '游标分页 + 虚拟滚动的性能改造', '脱敏展示与导出二次授权弹窗实现'],
    optOutStages: ['st-observe'],
  },
  {
    userId: 'u-he',
    preferredAgentIds: ['ag-test', 'ag-ba'],
    preferredModelIds: ['mdl-deepseek', 'mdl-qwen'],
    autoAcceptScope: 'tests',
    promptTemplateIds: ['KB-TEST-03'],
    avgSessionMin: 38,
    dailySessionCount: 8,
    acceptRatePct: 74.8,
    feedbackScore: 4,
    topUseCases: ['按验收标准批量生成接口自动化用例', '128 组金额边界用例设计与数据构造', '缺陷复现步骤生成与根因初筛'],
    optOutStages: ['st-arch'],
  },
  {
    userId: 'u-meng',
    preferredAgentIds: ['ag-ops', 'ag-ba'],
    preferredModelIds: ['mdl-gpt5', 'mdl-deepseek'],
    autoAcceptScope: 'all',
    promptTemplateIds: ['KB-OPS-01'],
    avgSessionMin: 27,
    dailySessionCount: 6,
    acceptRatePct: 87.5,
    feedbackScore: 5,
    topUseCases: ['六道门禁预检与四批灰度编排', '回滚预案与 RTO 演练脚本生成', '告警噪声聚类与自愈建议输出'],
    optOutStages: [],
  },
  {
    userId: 'u-gu',
    preferredAgentIds: ['ag-pm', 'ag-ba'],
    preferredModelIds: ['mdl-qwen', 'mdl-gpt5'],
    autoAcceptScope: 'docs',
    promptTemplateIds: ['KB-ARCH-01'],
    avgSessionMin: 24,
    dailySessionCount: 4,
    acceptRatePct: 71.2,
    feedbackScore: 3,
    topUseCases: ['甘特冲突与资源过载自动识别', '风险登记册条目草拟与概率影响评分', '迭代周报与里程碑滑移分析'],
    optOutStages: ['st-code', 'st-test'],
  },
  {
    userId: 'u-shen',
    preferredAgentIds: ['ag-code', 'ag-review'],
    preferredModelIds: ['mdl-claude', 'mdl-deepseek'],
    autoAcceptScope: 'tests',
    promptTemplateIds: ['KB-CODE-02', 'KB-ARCH-01'],
    avgSessionMin: 52,
    dailySessionCount: 8,
    acceptRatePct: 81.7,
    feedbackScore: 4,
    topUseCases: ['outbox 中继与指数退避重试实现', 'BigDecimal 最大余额法分摊改造', 'CloudEvents 信封与新旧双发兼容适配'],
    optOutStages: ['st-req'],
  },
];

/** 9 位真人成员 id（AI 共享账号不计入人力负载与技能矩阵） */
export const HUMAN_USER_IDS: string[] = USERS.filter((u) => !u.isAi).map((u) => u.id);

/* ==== 3. 团队管理 ==== */

/** 团队定义 */
export interface TeamDef {
  id: string;
  name: string;
  /** 团队负责人（USERS.id） */
  leaderId: string;
  memberIds: string[];
  /** 上级团队 id；本组织为技术中心下的扁平一级团队结构，故统一为 null */
  parentTeamId: string | null;
  mission: string;
  establishedAt: string;
  /** 编制人数，恒等于 memberIds.length */
  headcount: number;
  /** 平均职级（P4=4 … P8=8，取自 MEMBER_PROFILES.seniority） */
  avgSeniority: number;
  techStack: string[];
  /** 持有的架构组件（./data 的 ARCH_COMPONENTS.id） */
  ownedComponentIds: string[];
  currentSprintIds: string[];
  tone: Tone;
}

/**
 * 7 个团队，与 ./data 中 USERS.dept 一一对齐：
 * 订单中心研发组 / 交易中台前端组 / 交易中台产品组 / 平台架构组 / 质量保障部 / 基础平台部 / PMO 办公室。
 * 林知远（dept「技术中心」）在 ./data 的 CURRENT_USER.title 中为「研发总监 · 平台架构负责人」，
 * 故归入平台架构组并担任负责人；u-ai-copilot（dept「AI 工程平台」）为平台级共享资源，不归属任何团队。
 * headcount 合计 9 = 真人成员数；ownedComponentIds 合计覆盖 ARCH_COMPONENTS 全部 14 个组件。
 */
export const TEAMS: TeamDef[] = [
  {
    id: 'TEAM-01',
    name: '订单中心研发组',
    leaderId: 'u-zhou',
    memberIds: ['u-zhou', 'u-shen'],
    parentTeamId: null,
    mission: '负责订单域后端服务的建设与重构，保障下单主链路的正确性、一致性与容量水位',
    establishedAt: '2023-04-01',
    headcount: 2,
    avgSeniority: 6.0,
    techStack: ['Java 17', 'Spring Boot 3.3', 'MySQL 8.0', 'Redis 7.2', 'RabbitMQ 3.13', 'ShardingSphere 5.5'],
    ownedComponentIds: ['ac-order-api', 'ac-state-machine', 'ac-idem-guard', 'ac-audit-store', 'ac-promo-engine', 'ac-split-engine', 'ac-migrate-job', 'ac-order-db', 'ac-cache-layer', 'ac-event-bus', 'ac-outbox-relay'],
    currentSprintIds: ['SP-24', 'SP-25'],
    tone: 'info',
  },
  {
    id: 'TEAM-02',
    name: '交易中台前端组',
    leaderId: 'u-chen',
    memberIds: ['u-chen'],
    parentTeamId: null,
    mission: '负责交易中台 C 端与 B 端前端体验，统一设计令牌与性能基线（首屏 LCP ≤ 1.0s）',
    establishedAt: '2023-04-01',
    headcount: 1,
    avgSeniority: 5.0,
    techStack: ['Vue 3', 'TypeScript 5', 'Vite', 'Pinia'],
    ownedComponentIds: ['ac-order-query'],
    currentSprintIds: ['SP-24', 'SP-25'],
    tone: 'teal',
  },
  {
    id: 'TEAM-03',
    name: '交易中台产品组',
    leaderId: 'u-su',
    memberIds: ['u-su'],
    parentTeamId: null,
    mission: '负责交易域产品规划与需求治理，维护 PRD 基线、验收标准与需求池优先级',
    establishedAt: '2022-09-01',
    headcount: 1,
    avgSeniority: 7.0,
    techStack: ['PingCode', 'Axure RP 10', 'Figma', 'SQL 取数'],
    ownedComponentIds: [],
    currentSprintIds: ['SP-24', 'SP-25'],
    tone: 'ai',
  },
  {
    id: 'TEAM-04',
    name: '平台架构组',
    leaderId: 'u-lin',
    memberIds: ['u-lin', 'u-yan'],
    parentTeamId: null,
    mission: '负责技术中心的架构治理、限界上下文划分、接口契约冻结与技术选型决策',
    establishedAt: '2021-03-01',
    headcount: 2,
    avgSeniority: 8.0,
    techStack: ['Java 17', 'Spring Boot 3.3', 'DDD', 'OpenAPI 3.1', 'ShardingSphere 5.5'],
    ownedComponentIds: ['ac-order-domain', 'ac-mask-sdk'],
    currentSprintIds: ['SP-24', 'SP-25'],
    tone: 'indigo',
  },
  {
    id: 'TEAM-05',
    name: '质量保障部',
    leaderId: 'u-he',
    memberIds: ['u-he'],
    parentTeamId: null,
    mission: '负责测试策略、用例库建设、质量门禁（G4）签发与缺陷闭环治理，独立于研发序列汇报',
    establishedAt: '2021-06-01',
    headcount: 1,
    avgSeniority: 6.0,
    techStack: ['JMeter 5.6', 'Postman', 'Pytest', 'SonarQube'],
    ownedComponentIds: [],
    currentSprintIds: ['SP-24', 'SP-25'],
    tone: 'amber',
  },
  {
    id: 'TEAM-06',
    name: '基础平台部',
    leaderId: 'u-meng',
    memberIds: ['u-meng'],
    parentTeamId: null,
    mission: '负责 CI/CD 流水线、环境拓扑、发布门禁（G5）执行与线上可观测体系（G6）',
    establishedAt: '2021-06-01',
    headcount: 1,
    avgSeniority: 6.0,
    techStack: ['Kubernetes 1.29', 'GitLab CI', 'Argo Rollouts', 'Prometheus', 'SkyWalking', 'Loki'],
    ownedComponentIds: [],
    currentSprintIds: ['SP-24'],
    tone: 'warn',
  },
  {
    id: 'TEAM-07',
    name: 'PMO 办公室',
    leaderId: 'u-gu',
    memberIds: ['u-gu'],
    parentTeamId: null,
    mission: '负责项目组合的排期治理、依赖与冲突收敛、里程碑签核与风险上报机制',
    establishedAt: '2022-01-01',
    headcount: 1,
    avgSeniority: 6.0,
    techStack: ['PingCode', 'MS Project', '飞书多维表格'],
    ownedComponentIds: [],
    currentSprintIds: ['SP-24'],
    tone: 'pink',
  },
];

/** 团队 id → 定义 */
export const TEAM_MAP: Record<string, TeamDef> = TEAMS.reduce<Record<string, TeamDef>>((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {});

/** 团队效能快照（团队 × 迭代周期） */
export interface TeamMetricSnapshot {
  teamId: string;
  sprintId: string;
  /** 实际交付故事点 */
  velocityPoints: number;
  /** 迭代初承诺故事点 */
  committedPoints: number;
  /** 任务条数口径的完成率（%） */
  completionRatePct: number;
  /** 缺陷密度（个 / KLOC） */
  defectDensity: number;
  /** AI 采纳率（%） */
  aiAdoptionPct: number;
  /** PR 平均评审时长（小时） */
  avgPrReviewHours: number;
  /** 平均周期时间（天，从任务创建到发布） */
  cycleTimeDays: number;
  /** 承诺达成率 = velocityPoints ÷ committedPoints × 100 */
  sayDoRatioPct: number;
  tone: Tone;
}

/**
 * 7 团队 × 3 个周期（SP-22 / SP-23 / SP-24）= 21 条。
 * 合计校验：同一 sprintId 下 committedPoints 之和 = SPRINTS.committed，velocityPoints 之和 = SPRINTS.completed
 *   SP-22：88 / 88；SP-23：92 / 89；SP-24：96 / 65。
 * 趋势：SP-22 → SP-24 各团队 aiAdoptionPct 单调上升、avgPrReviewHours 与 cycleTimeDays 单调下降、
 *       defectDensity 单调下降；SP-24 因处于迭代中期（TODAY = 2026-03-19，末日 03-27）故 sayDoRatioPct 普遍偏低。
 */
export const TEAM_METRICS: TeamMetricSnapshot[] = [
  /* ---- Sprint 22 · 会员中心一期 ---- */
  { teamId: 'TEAM-01', sprintId: 'SP-22', velocityPoints: 28, committedPoints: 26, completionRatePct: 96, defectDensity: 0.82, aiAdoptionPct: 41, avgPrReviewHours: 18.4, cycleTimeDays: 6.8, sayDoRatioPct: 107.7, tone: 'ok' },
  { teamId: 'TEAM-02', sprintId: 'SP-22', velocityPoints: 18, committedPoints: 18, completionRatePct: 100, defectDensity: 1.04, aiAdoptionPct: 36, avgPrReviewHours: 15.2, cycleTimeDays: 5.9, sayDoRatioPct: 100.0, tone: 'ok' },
  { teamId: 'TEAM-03', sprintId: 'SP-22', velocityPoints: 12, committedPoints: 13, completionRatePct: 92, defectDensity: 0.31, aiAdoptionPct: 44, avgPrReviewHours: 22.6, cycleTimeDays: 8.4, sayDoRatioPct: 92.3, tone: 'warn' },
  { teamId: 'TEAM-04', sprintId: 'SP-22', velocityPoints: 13, committedPoints: 13, completionRatePct: 100, defectDensity: 0.46, aiAdoptionPct: 38, avgPrReviewHours: 16.8, cycleTimeDays: 7.2, sayDoRatioPct: 100.0, tone: 'ok' },
  { teamId: 'TEAM-05', sprintId: 'SP-22', velocityPoints: 8, committedPoints: 8, completionRatePct: 100, defectDensity: 0.58, aiAdoptionPct: 29, avgPrReviewHours: 20.1, cycleTimeDays: 6.4, sayDoRatioPct: 100.0, tone: 'ok' },
  { teamId: 'TEAM-06', sprintId: 'SP-22', velocityPoints: 5, committedPoints: 5, completionRatePct: 100, defectDensity: 0.39, aiAdoptionPct: 33, avgPrReviewHours: 17.6, cycleTimeDays: 5.6, sayDoRatioPct: 100.0, tone: 'ok' },
  { teamId: 'TEAM-07', sprintId: 'SP-22', velocityPoints: 4, committedPoints: 5, completionRatePct: 80, defectDensity: 0.12, aiAdoptionPct: 22, avgPrReviewHours: 26.4, cycleTimeDays: 9.1, sayDoRatioPct: 80.0, tone: 'warn' },
  /* ---- Sprint 23 · 支付渠道统一接入 ---- */
  { teamId: 'TEAM-01', sprintId: 'SP-23', velocityPoints: 29, committedPoints: 30, completionRatePct: 94, defectDensity: 0.74, aiAdoptionPct: 58, avgPrReviewHours: 12.6, cycleTimeDays: 5.4, sayDoRatioPct: 96.7, tone: 'ok' },
  { teamId: 'TEAM-02', sprintId: 'SP-23', velocityPoints: 9, committedPoints: 10, completionRatePct: 88, defectDensity: 0.91, aiAdoptionPct: 52, avgPrReviewHours: 10.4, cycleTimeDays: 4.8, sayDoRatioPct: 90.0, tone: 'warn' },
  { teamId: 'TEAM-03', sprintId: 'SP-23', velocityPoints: 13, committedPoints: 14, completionRatePct: 90, defectDensity: 0.28, aiAdoptionPct: 61, avgPrReviewHours: 16.8, cycleTimeDays: 7.1, sayDoRatioPct: 92.9, tone: 'warn' },
  { teamId: 'TEAM-04', sprintId: 'SP-23', velocityPoints: 15, committedPoints: 15, completionRatePct: 100, defectDensity: 0.41, aiAdoptionPct: 55, avgPrReviewHours: 11.2, cycleTimeDays: 5.9, sayDoRatioPct: 100.0, tone: 'ok' },
  { teamId: 'TEAM-05', sprintId: 'SP-23', velocityPoints: 10, committedPoints: 10, completionRatePct: 96, defectDensity: 0.52, aiAdoptionPct: 47, avgPrReviewHours: 14.3, cycleTimeDays: 5.2, sayDoRatioPct: 100.0, tone: 'ok' },
  { teamId: 'TEAM-06', sprintId: 'SP-23', velocityPoints: 8, committedPoints: 8, completionRatePct: 100, defectDensity: 0.35, aiAdoptionPct: 49, avgPrReviewHours: 12.1, cycleTimeDays: 4.5, sayDoRatioPct: 100.0, tone: 'ok' },
  { teamId: 'TEAM-07', sprintId: 'SP-23', velocityPoints: 5, committedPoints: 5, completionRatePct: 100, defectDensity: 0.1, aiAdoptionPct: 38, avgPrReviewHours: 19.8, cycleTimeDays: 7.8, sayDoRatioPct: 100.0, tone: 'ok' },
  /* ---- Sprint 24 · 订单中心重构（进行中，TODAY = 2026-03-19） ---- */
  { teamId: 'TEAM-01', sprintId: 'SP-24', velocityPoints: 22, committedPoints: 34, completionRatePct: 68, defectDensity: 0.61, aiAdoptionPct: 74, avgPrReviewHours: 7.8, cycleTimeDays: 4.1, sayDoRatioPct: 64.7, tone: 'danger' },
  { teamId: 'TEAM-02', sprintId: 'SP-24', velocityPoints: 9, committedPoints: 12, completionRatePct: 74, defectDensity: 0.78, aiAdoptionPct: 69, avgPrReviewHours: 6.3, cycleTimeDays: 3.6, sayDoRatioPct: 75.0, tone: 'warn' },
  { teamId: 'TEAM-03', sprintId: 'SP-24', velocityPoints: 10, committedPoints: 13, completionRatePct: 78, defectDensity: 0.24, aiAdoptionPct: 78, avgPrReviewHours: 11.2, cycleTimeDays: 5.8, sayDoRatioPct: 76.9, tone: 'warn' },
  { teamId: 'TEAM-04', sprintId: 'SP-24', velocityPoints: 9, committedPoints: 14, completionRatePct: 66, defectDensity: 0.38, aiAdoptionPct: 71, avgPrReviewHours: 6.9, cycleTimeDays: 4.6, sayDoRatioPct: 64.3, tone: 'danger' },
  { teamId: 'TEAM-05', sprintId: 'SP-24', velocityPoints: 7, committedPoints: 11, completionRatePct: 64, defectDensity: 0.47, aiAdoptionPct: 66, avgPrReviewHours: 9.4, cycleTimeDays: 4.3, sayDoRatioPct: 63.6, tone: 'danger' },
  { teamId: 'TEAM-06', sprintId: 'SP-24', velocityPoints: 5, committedPoints: 7, completionRatePct: 72, defectDensity: 0.29, aiAdoptionPct: 68, avgPrReviewHours: 7.2, cycleTimeDays: 3.4, sayDoRatioPct: 71.4, tone: 'warn' },
  { teamId: 'TEAM-07', sprintId: 'SP-24', velocityPoints: 3, committedPoints: 5, completionRatePct: 60, defectDensity: 0.08, aiAdoptionPct: 57, avgPrReviewHours: 14.6, cycleTimeDays: 6.2, sayDoRatioPct: 60.0, tone: 'danger' },
];

/** 跨团队协作关系 */
export interface TeamCollabDef {
  id: string;
  fromTeamId: string;
  toTeamId: string;
  collabType: '依赖' | '接口对接' | '联合评审' | '资源共享' | '阻塞';
  /** 本迭代协作事项数（工作项 / 评审 / 工单） */
  itemCount: number;
  /** 平均等待时长（小时） */
  avgWaitHours: number;
  blockedCount: number;
  /** 约定的响应 SLA（小时） */
  slaHours: number;
  health: 'ok' | 'warn' | 'risk';
  note: string;
  /** AI 给出的协作优化建议 */
  aiSuggestion: string;
  tone: Tone;
}

/**
 * 8 条跨团队协作关系。
 * health 判定：blockedCount ≥ 1 → 'risk'；否则 avgWaitHours > slaHours ÷ 2 → 'warn'；其余 → 'ok'。
 * 结果分布：ok 4（COOP-01 / 04 / 06 / 08）、warn 2（COOP-03 / 07）、risk 2（COOP-02 / 05）。
 */
export const TEAM_COLLABS: TeamCollabDef[] = [
  {
    id: 'COOP-01',
    fromTeamId: 'TEAM-01',
    toTeamId: 'TEAM-04',
    collabType: '联合评审',
    itemCount: 15,
    avgWaitHours: 6.4,
    blockedCount: 0,
    slaHours: 24,
    health: 'ok',
    note: '订单中心研发组提交的 15 个 MR 由平台架构组做架构一致性评审，严慕舟为其中 13 个的 reviewerId',
    aiSuggestion: '评审等待已低于 SLA 的 27%，建议把规约类问题（命名、分层、异常包装）全量前移到 ag-review 自动拦截，让人工评审只聚焦边界与事务语义，可再压缩约 2.5 小时',
    tone: 'ok',
  },
  {
    id: 'COOP-02',
    fromTeamId: 'TEAM-01',
    toTeamId: 'TEAM-06',
    collabType: '阻塞',
    itemCount: 4,
    avgWaitHours: 96.5,
    blockedCount: 1,
    slaHours: 48,
    health: 'risk',
    note: 'BLOCK-0312：TASK-2419 的生产迁移窗口需基础平台部协调 DBA 批复，已等待 96.5 小时（SLA 48 小时），直接卡住 CRITICAL_PATH 末段的 TASK-2420 与 TASK-2421',
    aiSuggestion: '等待时长已达 SLA 的 201%，建议立即把升级层级从研发总监提升到指导委员会（SH-07），并改为「默认放行 + 事后审计」的窗口审批模式：由 ag-ops 基于预生产 3 轮零差异比对结果生成风险签核单，DBA 只需在 4 小时内否决而非主动批准',
    tone: 'danger',
  },
  {
    id: 'COOP-03',
    fromTeamId: 'TEAM-01',
    toTeamId: 'TEAM-02',
    collabType: '接口对接',
    itemCount: 3,
    avgWaitHours: 18.2,
    blockedCount: 0,
    slaHours: 24,
    health: 'warn',
    note: 'API-03（订单列表查询）与 API-10（拆单预演）的前后端对接：TASK-2414 已本地测试通过，TASK-2416 因 API-10 契约仍为 draft 而 progress 为 0',
    aiSuggestion: '等待时长已达 SLA 的 76%。建议由 ag-arch 基于 TASK-2415 已产出的拆单方案先生成 API-10 的 Mock Server 与 OpenAPI 草稿，让前端在契约冻结前并行开发，预计可把 TASK-2416 的启动时间提前 4 个工作日',
    tone: 'warn',
  },
  {
    id: 'COOP-04',
    fromTeamId: 'TEAM-03',
    toTeamId: 'TEAM-01',
    collabType: '依赖',
    itemCount: 8,
    avgWaitHours: 11.6,
    blockedCount: 0,
    slaHours: 24,
    health: 'ok',
    note: '交易中台产品组向研发组交付 PRD-ORD-v2.3 基线与 8 条需求的验收标准，本迭代发生 2 次基线修订（范围扩展与迁移方案细化）',
    aiSuggestion: '需求变更率 18.4% 偏高，建议在需求澄清会引入 ag-pm 的「变更影响面预扫描」：每次基线修订前自动列出受影响的 TASK / API / 用例清单，把变更决策前置到评审会而非开发中途',
    tone: 'ok',
  },
  {
    id: 'COOP-05',
    fromTeamId: 'TEAM-05',
    toTeamId: 'TEAM-01',
    collabType: '阻塞',
    itemCount: 6,
    avgWaitHours: 42.8,
    blockedCount: 2,
    slaHours: 24,
    health: 'risk',
    note: 'G4 测试门禁依赖研发组的构建产物：TASK-2405（单测补齐）与 TASK-2420（双写校验）未就绪，导致 128 组金额边界用例仅执行 74 组，用例执行率 62%',
    aiSuggestion: '2 项阻塞、等待时长达 SLA 的 178%。建议把「构建产物就绪」纳入 G3 的出口条件，由 ag-test 在 MR 合入后 10 分钟内自动触发对应用例集，而不是等测试计划人工排期；同时把 162 条回归用例改为全自动执行，仅失败项进入人工复核',
    tone: 'danger',
  },
  {
    id: 'COOP-06',
    fromTeamId: 'TEAM-04',
    toTeamId: 'TEAM-05',
    collabType: '联合评审',
    itemCount: 3,
    avgWaitHours: 8.4,
    blockedCount: 0,
    slaHours: 48,
    health: 'ok',
    note: '架构方案的可测性评审：状态机流转规则、幂等键设计与分片路由三项方案在编码前完成可测性签核',
    aiSuggestion: '协作健康，建议把可测性评审清单固化为 ag-arch 的输出模板（含「是否可注入故障」「是否可回放」「是否有可观测指标」三问），减少每次评审的重复讨论成本',
    tone: 'ok',
  },
  {
    id: 'COOP-07',
    fromTeamId: 'TEAM-07',
    toTeamId: 'TEAM-01',
    collabType: '资源共享',
    itemCount: 5,
    avgWaitHours: 30.2,
    blockedCount: 0,
    slaHours: 48,
    health: 'warn',
    note: 'PMO 的排期治理与负载再平衡诉求需研发组配合：TASK-2415 / TASK-2408 的转出协商已进行 3 轮，等待时长 30.2 小时',
    aiSuggestion: '等待时长达 SLA 的 63%。建议由 PMO 直接基于 WORKLOADS 快照提出「带补偿的转出方案」（转出任务 + 明确接手人 + SP-25 优先级承诺）一次性表决，避免多轮拉锯；ag-ba 可自动生成转出后的负载模拟结果作为决策依据',
    tone: 'warn',
  },
  {
    id: 'COOP-08',
    fromTeamId: 'TEAM-06',
    toTeamId: 'TEAM-04',
    collabType: '接口对接',
    itemCount: 4,
    avgWaitHours: 9.6,
    blockedCount: 0,
    slaHours: 24,
    health: 'ok',
    note: '可观测埋点契约对接：TASK-2404（幂等命中率与消息积压埋点）已部署，指标口径由平台架构组统一签核后接入 Prometheus',
    aiSuggestion: '协作健康。建议把埋点契约纳入 G2 架构门禁的检查项，由 ag-arch 在契约冻结时同步生成指标命名与标签规范，避免上线后返工',
    tone: 'ok',
  },
];

/** 研发仪式（例会 / 评审）定义 */
export interface CeremonyDef {
  id: string;
  name: '迭代规划会' | '每日站会' | '需求澄清会' | '架构评审会' | '迭代回顾会' | '发布评审会';
  cadence: string;
  durationMin: number;
  /** 主持角色（ROLES.id） */
  ownerRoleId: string;
  /** 参与角色（ROLES.id） */
  attendeeRoleIds: string[];
  /** AI 参与程度：不参与 / 生成纪要 / 生成议程 / 全流程辅助 */
  aiAssist: 'none' | 'summary' | 'agenda' | 'full';
  /** 该仪式中 AI 产出的具体物料名 */
  aiOutput: string;
  /** 最近一次举行日期 */
  lastHeldAt: string;
  attendanceRatePct: number;
  /** 行动项按期闭环率（%） */
  actionItemCloseRatePct: number;
  tone: Tone;
}

/** 6 类研发仪式，覆盖 SP-24 的完整协作节奏 */
export const CEREMONIES: CeremonyDef[] = [
  {
    id: 'CER-01',
    name: '迭代规划会',
    cadence: '每迭代首日 1 次（SP-24：2026-03-02）',
    durationMin: 180,
    ownerRoleId: 'pmo',
    attendeeRoleIds: ['manager', 'product', 'architect', 'developer', 'tester', 'ops', 'pmo'],
    aiAssist: 'full',
    aiOutput: 'SP-24 承诺清单与容量热力图（承诺 96 点 / 产能 104 点）+ 24 个任务卡草稿 + 关键路径识别结果（11 个任务）',
    lastHeldAt: '2026-03-02',
    attendanceRatePct: 96,
    actionItemCloseRatePct: 88,
    tone: 'brand',
  },
  {
    id: 'CER-02',
    name: '每日站会',
    cadence: '每个工作日 09:30',
    durationMin: 15,
    ownerRoleId: 'pmo',
    attendeeRoleIds: ['manager', 'product', 'architect', 'developer', 'tester', 'ops', 'pmo'],
    aiAssist: 'summary',
    aiOutput: '站会纪要与阻塞项自动归档（2026-03-19 当日识别 3 项阻塞，其中 BLOCK-0312 已自动升级至研发总监）',
    lastHeldAt: '2026-03-19',
    attendanceRatePct: 89,
    actionItemCloseRatePct: 74,
    tone: 'info',
  },
  {
    id: 'CER-03',
    name: '需求澄清会',
    cadence: '每周三 14:00',
    durationMin: 90,
    ownerRoleId: 'product',
    attendeeRoleIds: ['product', 'architect', 'developer', 'tester', 'pmo'],
    aiAssist: 'full',
    aiOutput: 'PRD-ORD-v2.3 差异说明 + 12 条验收标准补全建议 + Brainstorm 追问清单（17 问）+ 需求池 AI 打分复核表',
    lastHeldAt: '2026-03-18',
    attendanceRatePct: 92,
    actionItemCloseRatePct: 85,
    tone: 'ai',
  },
  {
    id: 'CER-04',
    name: '架构评审会',
    cadence: '每两周 1 次，关键路径节点加开',
    durationMin: 120,
    ownerRoleId: 'architect',
    attendeeRoleIds: ['manager', 'architect', 'developer', 'tester', 'ops'],
    aiAssist: 'agenda',
    aiOutput: '架构评审纪要 ARCH-24-007 + 与 KB-ARCH-01 的一致性校验清单（14 项，13 项通过）+ API-10 契约冻结建议稿',
    lastHeldAt: '2026-03-13',
    attendanceRatePct: 88,
    actionItemCloseRatePct: 79,
    tone: 'indigo',
  },
  {
    id: 'CER-05',
    name: '迭代回顾会',
    cadence: '每迭代末日 1 次（SP-23：2026-02-27）',
    durationMin: 120,
    ownerRoleId: 'pmo',
    attendeeRoleIds: ['manager', 'product', 'architect', 'developer', 'tester', 'ops', 'pmo'],
    aiAssist: 'summary',
    aiOutput: 'SP-23 回顾改进项 9 条与责任矩阵（已闭环 7 条，遗留 2 条转入 SP-24）+ 承诺达成率归因分析（96.7%）',
    lastHeldAt: '2026-02-27',
    attendanceRatePct: 94,
    actionItemCloseRatePct: 78,
    tone: 'teal',
  },
  {
    id: 'CER-06',
    name: '发布评审会',
    cadence: '每次生产发布前 24 小时',
    durationMin: 60,
    ownerRoleId: 'ops',
    attendeeRoleIds: ['manager', 'architect', 'tester', 'ops', 'pmo'],
    aiAssist: 'full',
    aiOutput: 'REL-2403 风险评审报告：六道门禁结论（G3 / G4 未通过）+ 4 批灰度准入判定 + 回滚预案演练记录（已演练 2 次，RTO 10 分钟）+ 顺延至 03-26 的建议',
    lastHeldAt: '2026-03-19',
    attendanceRatePct: 100,
    actionItemCloseRatePct: 62,
    tone: 'danger',
  },
];

/* ==== 4. 需求管理 / 需求池 ==== */

/** 需求池条目（迭代之前的上游候选池） */
export interface ReqPoolItemDef {
  id: string;
  /** PingCode 需求池编号 */
  code: string;
  title: string;
  sourceType: '客户投诉' | '业务方提出' | '线上事故复盘' | '技术债' | '合规监管' | '竞品分析' | 'AI 主动发现';
  /** 来源单据号或会议名 */
  sourceRef: string;
  /** 提交人（USERS.id）；平台外人员为 null */
  submittedBy: string | null;
  /** 平台外提交人的姓名与组织；平台内成员为空串 */
  externalName: string;
  submittedAt: string;
  stage: '收集' | '评估中' | '已评分' | '待排期' | '已入迭代' | '已交付' | '已拒绝' | '已挂起';
  /** 业务价值 1-10 */
  businessValue: number;
  /** 技术复杂度 1-10 */
  techComplexity: number;
  /** 风险分 1-10（不做会带来多大损失） */
  riskScore: number;
  /** 紧急度 1-10 */
  urgency: number;
  /** AI 优先级分 10-100，按文件头 A 节公式计算 */
  aiPriorityScore: number;
  /** AI 打分依据（2-3 句） */
  aiScoreReason: string;
  /** AI 建议排入的迭代（SPRINTS.id）；不建议排期为 null */
  aiSuggestedSprintId: string | null;
  /** 预估故事点；未评估为 0 */
  estimatePoints: number;
  /** 已入迭代 / 已交付时关联的正式需求（REQUIREMENTS.id），否则为 null */
  requirementId: string | null;
  /** 归属 Epic；平台外 Epic 为空串 */
  epicId: string;
  tags: string[];
  /** 责任角色（ROLES.id） */
  ownerRoleId: string;
  /** 评审人（USERS.id） */
  reviewers: string[];
  /** 决策结论说明；未决策为空串 */
  decisionNote: string;
  /** 决策日期；未决策为空串 */
  decidedAt: string;
  tone: Tone;
}

/**
 * 需求池 20 条（上游候选池）。
 * stage 分布：已入迭代 8（RP-01 ~ RP-08，requirementId 一一对应 ./data 的 REQ-2401 ~ REQ-2408）、
 *            已交付 1（RP-16）、待排期 2（RP-09 / RP-13）、已评分 2（RP-12 / RP-14）、
 *            评估中 2（RP-10 / RP-15）、收集 2（RP-11 / RP-20）、已挂起 1（RP-19）、已拒绝 2（RP-17 / RP-18）。
 * sourceType 分布：业务方提出 7、技术债 4、客户投诉 3、线上事故复盘 2、合规监管 2、竞品分析 1、AI 主动发现 1（合计 20）。
 * RP-09 为唯一一条 sourceType 'AI 主动发现'（由 ag-ba 从可观测指标中主动识别）。
 * 8 条已入迭代条目的 decidedAt 与对应 REQUIREMENTS.createdAt 完全一致，estimatePoints 与 storyPoints 完全一致。
 */
export const REQ_POOL: ReqPoolItemDef[] = [
  {
    id: 'RP-01',
    code: 'PC-POOL-0201',
    title: '订单创建链路重构：幂等下单与本地消息表保障一致性',
    sourceType: '线上事故复盘',
    sourceRef: 'INC-2026-0131 · 2026 春节大促重复下单事故复盘会',
    submittedBy: 'u-meng',
    externalName: '',
    submittedAt: '2026-02-05',
    stage: '已入迭代',
    businessValue: 10,
    techComplexity: 8,
    riskScore: 9,
    urgency: 10,
    aiPriorityScore: 88,
    aiScoreReason:
      '业务价值与紧急度均为满分：春节大促期间重复下单直接造成 37 万元资损与 214 起客诉，且 618 大促前必须收口。' +
      '风险分 9 来自跨服务事务边界调整与灰度期双写不一致。技术复杂度 8（分片 + 本地消息表 + 补偿）拉低了 3 分，但仍为全池最高优先级。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 21,
    requirementId: 'REQ-2401',
    epicId: 'EPIC-ORDER-REF',
    tags: ['交易域', '幂等', '分布式事务', 'P0', '资损'],
    ownerRoleId: 'product',
    reviewers: ['u-lin', 'u-yan', 'u-gu'],
    decisionNote: '2026-02-18 需求澄清会一致通过，作为 SP-24 的头号 P0 需求入迭代，并纳入 CRITICAL_PATH 起点',
    decidedAt: '2026-02-18',
    tone: 'brand',
  },
  {
    id: 'RP-02',
    code: 'PC-POOL-0202',
    title: '订单状态机统一治理：可配置流转与状态变更审计',
    sourceType: '客户投诉',
    sourceRef: '客服系统状态不同步投诉专题分析（2026-02 累计 37 起）',
    submittedBy: null,
    externalName: '邱予桐 · 零售事业部 客服中心负责人',
    submittedAt: '2026-02-09',
    stage: '已入迭代',
    businessValue: 8,
    techComplexity: 7,
    riskScore: 6,
    urgency: 8,
    aiPriorityScore: 71,
    aiScoreReason:
      '37 起客诉集中反映同一根因：6 个服务各自维护状态判断，客服侧看到的订单状态与实际不一致。' +
      '业务价值 8、紧急度 8，属于「不做会持续产生客服成本」的类型。风险分 6 来自历史脏状态数据的迁移。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 13,
    requirementId: 'REQ-2402',
    epicId: 'EPIC-ORDER-REF',
    tags: ['状态机', '交易域', '审计', '客诉'],
    ownerRoleId: 'product',
    reviewers: ['u-lin', 'u-su', 'u-he'],
    decisionNote: '业务方代表邱予桐（SH-08）明确要求随 rc1 一并上线，2026-02-19 评审通过并入迭代',
    decidedAt: '2026-02-19',
    tone: 'warn',
  },
  {
    id: 'RP-03',
    code: 'PC-POOL-0203',
    title: '优惠计算下沉：券、满减、会员价叠加规则引擎化',
    sourceType: '业务方提出',
    sourceRef: '营销中台 2026 春季促销需求单 MKT-2026-018（后追加 BUG-1043 资损证据）',
    submittedBy: null,
    externalName: '骆清和 · 营销中台产品组',
    submittedAt: '2026-02-12',
    stage: '已入迭代',
    businessValue: 9,
    techComplexity: 7,
    riskScore: 8,
    urgency: 9,
    aiPriorityScore: 81,
    aiScoreReason:
      '营销中台的春季促销排期硬依赖规则引擎化，业务价值 9、紧急度 9。' +
      '风险分 8 由 REL-2402 灰度期间触发的 3 次资损告警（BUG-1043 分摊尾差 0.01 元）实证支撑，属已发生而非推测。技术复杂度 7（三段模型 + BigDecimal 全链路改造）。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 21,
    requirementId: 'REQ-2403',
    epicId: 'EPIC-ORDER-REF',
    tags: ['营销', '规则引擎', '金额精度', '资损'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-yan', 'u-he'],
    decisionNote: '2026-02-20 评审通过；金额精度部分（TASK-2410）先行随 v2.4 热修，规则引擎整体随 v3.0-rc1 落地',
    decidedAt: '2026-02-20',
    tone: 'brand',
  },
  {
    id: 'RP-04',
    code: 'PC-POOL-0204',
    title: '订单查询性能达标：3000 TPS 且 P99 < 200ms',
    sourceType: '业务方提出',
    sourceRef: 'CAP-2026-06 · 2026 年 618 大促容量规划评审会',
    submittedBy: 'u-yan',
    externalName: '',
    submittedAt: '2026-02-10',
    stage: '已入迭代',
    businessValue: 9,
    techComplexity: 8,
    riskScore: 7,
    urgency: 8,
    aiPriorityScore: 75,
    aiScoreReason:
      '大促容量规划给出的硬性指标，不达标将直接触发限流并损失 GMV，业务价值 9。' +
      '风险分 7 来自压测环境与生产规格 1:0.6 的折算误差。技术复杂度 8（读写分离 + 多级缓存 + 基因分片 + ES 下沉四条战线并行）。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 13,
    requirementId: 'REQ-2404',
    epicId: 'EPIC-ORDER-REF',
    tags: ['性能', 'Redis', '分库分表', 'NFR', '大促'],
    ownerRoleId: 'architect',
    reviewers: ['u-lin', 'u-meng', 'u-he'],
    decisionNote: '2026-02-20 评审通过，作为非功能需求与 RP-01 并行推进，验收以 JMeter 长稳 30 分钟为准',
    decidedAt: '2026-02-20',
    tone: 'warn',
  },
  {
    id: 'RP-05',
    code: 'PC-POOL-0205',
    title: '多仓多商家拆单与合单能力',
    sourceType: '业务方提出',
    sourceRef: '跨境业务部跨境仓上线需求单 CB-2026-007',
    submittedBy: null,
    externalName: '邵亦琛 · 跨境业务部',
    submittedAt: '2026-02-14',
    stage: '已入迭代',
    businessValue: 7,
    techComplexity: 7,
    riskScore: 6,
    urgency: 6,
    aiPriorityScore: 61,
    aiScoreReason:
      '跨境仓 2026-04-15 上线依赖拆单能力，业务价值 7、紧急度 6（尚有缓冲期）。' +
      '风险分 6 主要来自履约中心 WMS 回调协议未冻结这一外部不确定性，已登记为 PR-04。技术复杂度 7（子订单金额分摊 + 父订单状态聚合）。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 13,
    requirementId: 'REQ-2405',
    epicId: 'EPIC-ORDER-REF',
    tags: ['拆单', '履约', '跨境'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-yan'],
    decisionNote: '2026-02-23 评审通过入迭代；AI 建议若 G3 在 03-23 前仍不达标，本条为 rc1 的首选移出项',
    decidedAt: '2026-02-23',
    tone: 'info',
  },
  {
    id: 'RP-06',
    code: 'PC-POOL-0206',
    title: '订单领域事件标准化外发（RabbitMQ）',
    sourceType: '技术债',
    sourceRef: 'TD-2026-041 · 技术中心技术债清单第 41 项',
    submittedBy: 'u-yan',
    externalName: '',
    submittedAt: '2026-02-16',
    stage: '已入迭代',
    businessValue: 5,
    techComplexity: 5,
    riskScore: 4,
    urgency: 5,
    aiPriorityScore: 50,
    aiScoreReason:
      '12 个下游各自解析自定义 JSON 协议，每次订单模型调整都要推动 12 方联动，长期维护成本高，业务价值 5。' +
      '风险分 4 因提供了兼容期双发能力而可控。技术复杂度 5，属「投入明确、收益确定」的常规技术债偿还。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 8,
    requirementId: 'REQ-2406',
    epicId: 'EPIC-ORDER-REF',
    tags: ['RabbitMQ', '领域事件', '解耦', '技术债'],
    ownerRoleId: 'architect',
    reviewers: ['u-yan', 'u-shen'],
    decisionNote: '2026-02-24 评审通过；因不依赖迁移窗口，实际执行时提前随 v2.4 于 2026-03-13 上线',
    decidedAt: '2026-02-24',
    tone: 'info',
  },
  {
    id: 'RP-07',
    code: 'PC-POOL-0207',
    title: '历史订单数据迁移与双写校验',
    sourceType: '技术债',
    sourceRef: '订单中心重构前置依赖分析（ag-arch 输出的拆分可行性报告 §4.2）',
    submittedBy: 'u-zhou',
    externalName: '',
    submittedAt: '2026-02-17',
    stage: '已入迭代',
    businessValue: 8,
    techComplexity: 8,
    riskScore: 9,
    urgency: 9,
    aiPriorityScore: 77,
    aiScoreReason:
      '不迁移就无法切流，是整个重构的物理前置条件，紧急度 9。' +
      '风险分 9 为全池最高：4.7 亿数据、任何差异都等于资损，且迁移窗口受制于外部 DBA 审批（已实证为 PR-01）。技术复杂度 8（断点续传 + 双写降级 + 全量增量比对）。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 13,
    requirementId: 'REQ-2407',
    epicId: 'EPIC-ORDER-REF',
    tags: ['数据迁移', '双写', 'MySQL 8', '零资损'],
    ownerRoleId: 'developer',
    reviewers: ['u-lin', 'u-meng', 'u-gu'],
    decisionNote: '第 1 轮评审因缺少回切方案被退回，第 2 轮补充一键回切脚本（RTO ≤ 10 分钟）后于 2026-02-25 通过',
    decidedAt: '2026-02-25',
    tone: 'warn',
  },
  {
    id: 'RP-08',
    code: 'PC-POOL-0208',
    title: '订单数据合规：字段脱敏与操作审计留痕',
    sourceType: '合规监管',
    sourceRef: 'SEC-2026-08 · 安全合规部个人信息保护专项整改通知',
    submittedBy: null,
    externalName: '傅明澜 · 安全合规部 数据合规经理',
    submittedAt: '2026-02-19',
    stage: '已入迭代',
    businessValue: 6,
    techComplexity: 3,
    riskScore: 6,
    urgency: 7,
    aiPriorityScore: 66,
    aiScoreReason:
      '个保法年度审计的强制整改项，不做会面临监管处罚，风险分 6、紧急度 7。' +
      '技术复杂度仅 3，因公司已有统一脱敏组件 SEC-MASK-2.1 可直接接入，属「低成本高确定性」条目，AI 建议优先安排而非顺延。',
    aiSuggestedSprintId: 'SP-24',
    estimatePoints: 5,
    requirementId: 'REQ-2408',
    epicId: 'EPIC-ORDER-REF',
    tags: ['合规', '脱敏', '审计', '个保法'],
    ownerRoleId: 'manager',
    reviewers: ['u-lin', 'u-he'],
    decisionNote: '2026-02-26 评审通过入迭代；因 SEC-MASK-2.1 接入排队，实际已从 v3.0-rc1 基线移出并顺延至 v3.0（见 VB-04.excludedItems）',
    decidedAt: '2026-02-26',
    tone: 'warn',
  },
  {
    id: 'RP-09',
    code: 'PC-POOL-0209',
    title: 'order-query 缓存穿透率超阈值：热点 Key 缺少空值兜底',
    sourceType: 'AI 主动发现',
    sourceRef: 'ag-ba 可观测分析周报 AI-OBS-W11（2026-03-09 ~ 2026-03-15）',
    submittedBy: 'u-ai-copilot',
    externalName: '',
    submittedAt: '2026-03-11',
    stage: '待排期',
    businessValue: 7,
    techComplexity: 4,
    riskScore: 7,
    urgency: 8,
    aiPriorityScore: 73,
    aiScoreReason:
      'AI 从 Prometheus 指标中主动识别：订单详情缓存穿透率 0.42%，已超出 REQ-2404 验收标准 AC1 的 0.3% 上限，且穿透请求 78% 集中在不存在的订单号（疑似恶意扫描）。' +
      '紧急度 8 因为大促期间穿透会直接击穿 DB；技术复杂度仅 4（空值缓存 + 布隆过滤器），投入产出比高。',
    aiSuggestedSprintId: 'SP-25',
    estimatePoints: 5,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['缓存穿透', '可观测', 'AI 发现', '安全'],
    ownerRoleId: 'ops',
    reviewers: ['u-meng', 'u-zhou'],
    decisionNote: '2026-03-16 评分完成并进入待排期；因 SP-24 已无空闲产能（承诺 96 / 产能 104），AI 建议排入 SP-25 首批',
    decidedAt: '2026-03-16',
    tone: 'warn',
  },
  {
    id: 'RP-10',
    code: 'PC-POOL-0210',
    title: '大额订单取消后退款到账延迟超 48 小时',
    sourceType: '客户投诉',
    sourceRef: '客服中心 2026-03 首周投诉聚类报告（同类工单 24 起，均涉及金额 > 5000 元）',
    submittedBy: null,
    externalName: '温以宁 · 零售事业部 客服中心值班组长',
    submittedAt: '2026-03-06',
    stage: '评估中',
    businessValue: 8,
    techComplexity: 5,
    riskScore: 6,
    urgency: 6,
    aiPriorityScore: 68,
    aiScoreReason:
      '24 起同类工单集中在大额订单，涉及资金占用与客户信任，业务价值 8。' +
      '初步定位在退款审批流的人工环节而非系统链路，技术复杂度 5；需要与支付中台确认是否为渠道侧 T+2 结算规则所致，评估尚未收敛。',
    aiSuggestedSprintId: 'SP-25',
    estimatePoints: 13,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['退款', '售后', '客诉', '资金时效'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-he'],
    decisionNote: '',
    decidedAt: '',
    tone: 'warn',
  },
  {
    id: 'RP-11',
    code: 'PC-POOL-0211',
    title: 'B 端商家后台支持批量改价与订单备注导出',
    sourceType: '业务方提出',
    sourceRef: '商家平台运营部 2026-03 需求收集表（第 14 项）',
    submittedBy: null,
    externalName: '江晚舟 · 商家平台运营部',
    submittedAt: '2026-03-14',
    stage: '收集',
    businessValue: 5,
    techComplexity: 4,
    riskScore: 3,
    urgency: 4,
    aiPriorityScore: 47,
    aiScoreReason:
      '能减少商家运营约 6 人日/月的手工操作，业务价值 5，但可通过现有的单条改价 + 手工导出临时替代。' +
      '风险分 3（批量改价若缺少审批流存在误操作风险），紧急度 4，AI 建议先补齐审批流设计再进入评估。',
    aiSuggestedSprintId: null,
    estimatePoints: 8,
    requirementId: null,
    /** 归属商家中台 Epic，未纳入本原型数据集 */
    epicId: '',
    tags: ['B 端', '商家后台', '效率工具'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-chen'],
    decisionNote: '',
    decidedAt: '',
    tone: 'info',
  },
  {
    id: 'RP-12',
    code: 'PC-POOL-0212',
    title: 'order-service 单体剩余 3 个上帝类拆分（OrderManager 4200 行）',
    sourceType: '技术债',
    sourceRef: 'SonarQube 2026-03 月度技术债扫描报告（认知复杂度 Top 3）',
    submittedBy: 'u-zhou',
    externalName: '',
    submittedAt: '2026-02-24',
    stage: '已评分',
    businessValue: 4,
    techComplexity: 7,
    riskScore: 6,
    urgency: 3,
    aiPriorityScore: 40,
    aiScoreReason:
      '3 个上帝类合计 9,800 行、认知复杂度均超 40，是缺陷高发区（近 90 天 5 个缺陷中 3 个源自此处），风险分 6。' +
      '但业务价值仅 4（对业务方无感）、紧急度 3，且技术复杂度 7 意味着需要独立迭代窗口，AI 建议排在 v3.0 全量之后的稳定期执行。',
    aiSuggestedSprintId: null,
    estimatePoints: 21,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['技术债', '重构', '可维护性'],
    ownerRoleId: 'developer',
    reviewers: ['u-yan', 'u-zhou'],
    decisionNote: '2026-03-05 完成评分，结论为「已评分待窗口」：不与 SP-24 / SP-25 争抢产能，待 v3.0 全量后单独排期',
    decidedAt: '2026-03-05',
    tone: 'neutral',
  },
  {
    id: 'RP-13',
    code: 'PC-POOL-0213',
    title: '个人信息保护法年度审计：订单数据出境评估与留存策略',
    sourceType: '合规监管',
    sourceRef: '安全合规部 2026 年度审计计划 SEC-AUDIT-2026（第 3 项）',
    submittedBy: null,
    externalName: '傅明澜 · 安全合规部 数据合规经理',
    submittedAt: '2026-02-27',
    stage: '待排期',
    businessValue: 8,
    techComplexity: 4,
    riskScore: 9,
    urgency: 6,
    aiPriorityScore: 74,
    aiScoreReason:
      '风险分 9：跨境仓上线后订单数据涉及出境，若未在年度审计前完成评估，可能触发监管处罚并影响 PRJ-04 上线。' +
      '业务价值 8、紧急度 6（审计窗口在 2026-06），技术复杂度 4，主要是流程与文档工作而非编码。',
    aiSuggestedSprintId: 'SP-25',
    estimatePoints: 8,
    requirementId: null,
    /** 归属安全合规 Epic，未纳入本原型数据集 */
    epicId: '',
    tags: ['合规', '个保法', '数据出境', '审计'],
    ownerRoleId: 'manager',
    reviewers: ['u-lin', 'u-he'],
    decisionNote: '2026-03-13 评分完成并进入待排期，与 RP-08 合并为合规专项，AI 建议排入 SP-25 以避开 SP-24 收口',
    decidedAt: '2026-03-13',
    tone: 'warn',
  },
  {
    id: 'RP-14',
    code: 'PC-POOL-0214',
    title: '下单页优惠明细逐项展开（对标竞品）',
    sourceType: '竞品分析',
    sourceRef: '竞品体验对标报告 CA-2026-Q1（3 家竞品均已支持，我方仅展示合计优惠额）',
    submittedBy: 'u-su',
    externalName: '',
    submittedAt: '2026-03-04',
    stage: '已评分',
    businessValue: 6,
    techComplexity: 3,
    riskScore: 2,
    urgency: 3,
    aiPriorityScore: 48,
    aiScoreReason:
      '3 家竞品均已支持优惠明细逐项展开，用户在客服侧咨询「优惠怎么算的」占咨询量 6.4%，业务价值 6。' +
      '技术复杂度仅 3（REQ-2403 的分摊明细已落库，前端展示即可），风险分 2。AI 判定为高性价比的体验改进项，但紧急度不足以挤占 SP-24 产能。',
    aiSuggestedSprintId: 'SP-25',
    estimatePoints: 5,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['体验', '优惠', '竞品对标', '前端'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-chen'],
    decisionNote: '2026-03-10 完成评分，结论为「已评分待窗口」：依赖 REQ-2403 的分摊明细数据，建议与 RP-05 拆单展示合并到 SP-25 一次性交付',
    decidedAt: '2026-03-10',
    tone: 'info',
  },
  {
    id: 'RP-15',
    code: 'PC-POOL-0215',
    title: '跨境仓多币种结算与汇率快照留存',
    sourceType: '业务方提出',
    sourceRef: '跨境业务部 2026 年度规划（与 RP-05 拆单能力同源，属第二阶段）',
    submittedBy: null,
    externalName: '邵亦琛 · 跨境业务部',
    submittedAt: '2026-03-09',
    stage: '评估中',
    businessValue: 7,
    techComplexity: 8,
    riskScore: 7,
    urgency: 5,
    aiPriorityScore: 58,
    aiScoreReason:
      '多币种结算是跨境业务的财务合规前置，业务价值 7、风险分 7（汇率快照缺失会导致对账差异与税务风险）。' +
      '技术复杂度 8：涉及金额模型从单币种扩展到多币种、结算与财务系统对接、历史数据回溯，AI 判断不应与 SP-24 的金额精度改造并行以避免相互污染。',
    aiSuggestedSprintId: null,
    estimatePoints: 34,
    requirementId: null,
    /** 归属结算中台 Epic，未纳入本原型数据集 */
    epicId: '',
    tags: ['跨境', '多币种', '结算', '财务合规'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-yan'],
    decisionNote: '',
    decidedAt: '',
    tone: 'info',
  },
  {
    id: 'RP-16',
    code: 'PC-POOL-0216',
    title: '订单查询读扩容与慢 SQL 专项治理（7 条）',
    sourceType: '线上事故复盘',
    sourceRef: 'INC-2026-0207 · 订单列表 P95 342ms 超时事故复盘会',
    submittedBy: 'u-meng',
    externalName: '',
    submittedAt: '2026-02-09',
    stage: '已交付',
    businessValue: 7,
    techComplexity: 5,
    riskScore: 8,
    urgency: 7,
    aiPriorityScore: 70,
    aiScoreReason:
      '事故已实际发生并影响 12 万用户的订单列表加载，风险分 8、紧急度 7。' +
      '技术复杂度 5（读副本扩容 + 慢 SQL 改写，方案成熟），AI 判定为「短平快止血项」，建议先于结构性重构交付。',
    aiSuggestedSprintId: 'SP-23',
    estimatePoints: 13,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['性能', '慢 SQL', '读扩容', '事故止血'],
    ownerRoleId: 'ops',
    reviewers: ['u-meng', 'u-yan'],
    decisionNote: '已随发布单 REL-2401 于 2026-02-13 交付：读副本 16 → 24，慢 SQL 治理 7 条，列表接口 P95 由 286ms 降至 214ms（-25.2%），全量后无告警',
    decidedAt: '2026-02-11',
    tone: 'ok',
  },
  {
    id: 'RP-17',
    code: 'PC-POOL-0217',
    title: 'App 端订单列表支持按门店名称模糊搜索',
    sourceType: '客户投诉',
    sourceRef: '客服中心 2026-03 第 2 周投诉聚类报告（同类工单 6 起）',
    submittedBy: null,
    externalName: '温以宁 · 零售事业部 客服中心值班组长',
    submittedAt: '2026-03-12',
    stage: '已拒绝',
    businessValue: 3,
    techComplexity: 6,
    riskScore: 1,
    urgency: 2,
    aiPriorityScore: 27,
    aiScoreReason:
      '6 起工单占月度咨询量 0.3%，业务价值 3、紧急度 2。' +
      '技术复杂度 6 却明显偏高：门店名称不在订单主档中，需引入门店维度冗余字段并重建 ES 索引，投入产出严重失衡。',
    aiSuggestedSprintId: null,
    estimatePoints: 3,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['搜索', 'App', '已拒绝'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-chen'],
    decisionNote:
      '2026-03-18 需求澄清会决议拒绝。理由：① 现有订单列表已支持按商品名与订单号搜索，覆盖了 92% 的查找场景，门店维度的真实缺口仅 6 起工单；' +
      '② 实现需在订单主档冗余门店名并重建 Elasticsearch 索引，预估 3 点但索引重建窗口需占用 DBA 4 小时，而 DBA 资源正被 BLOCK-0312 占满；' +
      '③ 客服中心可通过工单模板引导用户按商品名检索作为替代方案，成本为 0。若 2026 Q3 同类工单增长到 30 起/月以上，可重新提池。',
    decidedAt: '2026-03-18',
    tone: 'slate',
  },
  {
    id: 'RP-18',
    code: 'PC-POOL-0218',
    title: '将 order-service 全量改写为 Kotlin + 协程',
    sourceType: '技术债',
    sourceRef: '工程师自发提案（2026-01 技术雷达讨论）',
    submittedBy: 'u-shen',
    externalName: '',
    submittedAt: '2026-01-28',
    stage: '已拒绝',
    businessValue: 2,
    techComplexity: 10,
    riskScore: 3,
    urgency: 1,
    aiPriorityScore: 17,
    aiScoreReason:
      '业务价值 2、紧急度 1，为全池最低：改写语言不产生任何业务可感知收益。' +
      '技术复杂度 10 为全池最高，涉及 12 万行代码、CI 门禁规则集与 SonarQube 质量阈值的整体重建，AI 判定为高风险低回报提案。',
    aiSuggestedSprintId: null,
    estimatePoints: 89,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['技术债', 'Kotlin', '已拒绝'],
    ownerRoleId: 'architect',
    reviewers: ['u-yan', 'u-lin'],
    decisionNote:
      '2026-02-04 架构评审会决议拒绝。理由：① 与本次重构目标（限界上下文拆分）正交，拆分完成后代码量将下降约 40%，届时再评估语言迁移的成本更合理；' +
      '② 收益不可度量，提案未给出任何性能或质量基线对比数据；③ 迁移期需维护 Java + Kotlin 双语言栈约 3 人月，且现有 CI 门禁、SonarQube 规则集与 ag-review 的规约库均未覆盖 Kotlin，会直接削弱质量防线。' +
      '结论：转入 2027 年技术雷达「评估」环，待 v3.0 全量稳定运行一个季度后重新提池。',
    decidedAt: '2026-02-04',
    tone: 'slate',
  },
  {
    id: 'RP-19',
    code: 'PC-POOL-0219',
    title: '订单中心对接抖音本地生活开放平台履约回调',
    sourceType: '业务方提出',
    sourceRef: '渠道合作部 2026 新渠道接入计划（抖音本地生活）',
    submittedBy: null,
    externalName: '黎知夏 · 渠道合作部',
    submittedAt: '2026-03-02',
    stage: '已挂起',
    businessValue: 6,
    techComplexity: 7,
    riskScore: 4,
    urgency: 5,
    aiPriorityScore: 51,
    aiScoreReason:
      '新渠道预计带来约 4% 的订单增量，业务价值 6。' +
      '但存在两个硬前置未就绪：抖音开放平台沙箱账号尚未下发、WMS 履约回调协议未冻结（PR-04），技术复杂度 7 且外部依赖不可控，AI 判定当前评估结果不具备可执行性。',
    aiSuggestedSprintId: 'SP-25',
    estimatePoints: 21,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['渠道', '抖音', '履约回调', '已挂起'],
    ownerRoleId: 'product',
    reviewers: ['u-su', 'u-yan', 'u-gu'],
    decisionNote:
      '2026-03-11 评审决议挂起。抖音开放平台沙箱账号预计 2026-05 下发，且履约回调协议冻结进度为 0/3（见 PR-04），' +
      '在此两项前置就绪前无法给出可信的工作量估算。挂起至 SP-26 重评，由渠道合作部在沙箱账号下发后 5 个工作日内重新激活。',
    decidedAt: '2026-03-11',
    tone: 'info',
  },
  {
    id: 'RP-20',
    code: 'PC-POOL-0220',
    title: '大客户专属下单通道与独立限流策略',
    sourceType: '业务方提出',
    sourceRef: '大客户事业部 2026 年度服务协议续签诉求（3 家 KA 客户）',
    submittedBy: null,
    externalName: '章叙白 · 大客户事业部',
    submittedAt: '2026-03-17',
    stage: '收集',
    businessValue: 7,
    techComplexity: 6,
    riskScore: 3,
    urgency: 4,
    aiPriorityScore: 52,
    aiScoreReason:
      '3 家 KA 客户在续签谈判中提出专属通道与独立限流诉求，涉及年度合同金额约 1,800 万元，业务价值 7。' +
      '风险分 3、紧急度 4（续签节点在 2026-06）。技术复杂度 6，需在 API 网关侧引入租户级限流与队列隔离，与 REQ-2404 的容量方案存在设计耦合，建议待 rc1 稳定后再评估。',
    aiSuggestedSprintId: null,
    estimatePoints: 13,
    requirementId: null,
    epicId: 'EPIC-ORDER-REF',
    tags: ['大客户', '限流', 'API 网关', 'KA'],
    ownerRoleId: 'architect',
    reviewers: ['u-yan', 'u-meng'],
    decisionNote: '',
    decidedAt: '',
    tone: 'info',
  },
];

/** 需求池条目 id → 定义 */
export const REQ_POOL_MAP: Record<string, ReqPoolItemDef> = REQ_POOL.reduce<Record<string, ReqPoolItemDef>>(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {},
);

/**
 * 正式需求 id（REQ-24xx）→ 需求池条目 id 的反查索引。
 * 由 ./data 的 REQUIREMENTS 驱动生成，确保 8 条已入迭代需求与需求池条目的衔接不会失配。
 */
export const REQ_POOL_ID_BY_REQUIREMENT: Record<string, string> = REQUIREMENTS.reduce<Record<string, string>>(
  (acc, r) => {
    const hit = REQ_POOL.filter((p) => p.requirementId === r.id)[0];
    if (hit) {
      acc[r.id] = hit.id;
    }
    return acc;
  },
  {},
);

/** 需求评审轮次 */
export interface ReqReviewRoundDef {
  id: string;
  /** 被评审的需求池条目（REQ_POOL.id） */
  poolItemId: string;
  /** 第几轮评审 */
  round: number;
  heldAt: string;
  mode: '会议' | '异步';
  /** 主持人（USERS.id） */
  chairId: string;
  attendeeIds: string[];
  /** AI 会前预读摘要（2-3 句） */
  aiPreReadSummary: string;
  /** AI 提出的澄清问题（3-5 个） */
  aiQuestions: string[];
  outcome: '通过' | '有条件通过' | '退回修改' | '挂起';
  /** 有条件通过时的前置条件 */
  conditions: string[];
  /** 评审前的 AI 优先级分 */
  scoreBefore: number;
  /** 评审后的 AI 优先级分；某条目的最后一轮 scoreAfter 恒等于其 aiPriorityScore */
  scoreAfter: number;
  durationMin: number;
  tone: Tone;
}

/**
 * 10 轮需求评审记录，覆盖 8 个需求池条目（RP-01 与 RP-07 各 2 轮）。
 * 自洽约束：每个条目的最后一轮 scoreAfter === REQ_POOL 中该条目的 aiPriorityScore。
 */
export const REQ_REVIEWS: ReqReviewRoundDef[] = [
  {
    id: 'RPR-01',
    poolItemId: 'RP-01',
    round: 1,
    heldAt: '2026-02-11 14:00',
    mode: '会议',
    chairId: 'u-su',
    attendeeIds: ['u-su', 'u-lin', 'u-yan', 'u-gu', 'u-he'],
    aiPreReadSummary:
      'AI 预读了 INC-2026-0131 事故复盘全文、order-service 代码索引与《交易域架构规范》KB-ARCH-01。' +
      '识别出提案的核心是「超时重试导致重复下单」，但复盘报告中的 214 起客诉里有 31 起实为前端重复提交，需与后端幂等区分。' +
      '同时发现现有 order 表已存在 client_request_no 字段但未加唯一索引。',
    aiQuestions: [
      '幂等键的取值口径是什么：由客户端生成的 UUID，还是「用户 + 商品 + 金额 + 时间窗」的业务指纹？两者在重试语义上完全不同',
      '幂等窗口设为多长？若设为 24h，Redis 中需常驻约 1,200 万个键，内存成本与淘汰策略如何评估',
      '命中幂等时返回首次结果是同步返回还是异步轮询？前端在超时重试场景下如何区分「首次受理」与「幂等命中」',
      '本地消息表投递失败的最终兜底是什么：进入死信后由谁在什么时限内人工介入，是否需要与客服系统联动',
      '库存扣减失败回滚到 CLOSED 时，已经发放的优惠券如何释放？是否存在券已被用户在别处使用的竞态',
    ],
    outcome: '退回修改',
    conditions: [],
    scoreBefore: 74,
    scoreAfter: 82,
    durationMin: 95,
    tone: 'warn',
  },
  {
    id: 'RPR-02',
    poolItemId: 'RP-01',
    round: 2,
    heldAt: '2026-02-18 10:00',
    mode: '会议',
    chairId: 'u-su',
    attendeeIds: ['u-su', 'u-lin', 'u-yan', 'u-zhou', 'u-gu', 'u-he'],
    aiPreReadSummary:
      'AI 比对了第 1 轮退回意见与修订稿：幂等键口径已明确为「业务域:租户:客户端请求号」并落唯一索引，与 KB-CODE-02 一致；' +
      '幂等窗口收敛为 24h 并给出 Redis 内存测算（约 3.2GB）；优惠释放的竞态问题补充了「券状态二次校验 + 补偿任务」方案。5 个澄清问题全部有书面回复。',
    aiQuestions: [
      '补偿任务扫描周期与幂等窗口的关系是否会形成死循环：券在补偿前被使用，补偿任务是否会反复重试',
      'AC4 的 P99 ≤ 200ms 是在 3000 TPS 压测口径下，还是含幂等校验的完整链路？两者的样本量与统计窗口需明确',
      '灰度期新旧链路并行时，幂等键在两套存储中如何避免冲突，是否需要引入链路版本号',
    ],
    outcome: '通过',
    conditions: [],
    scoreBefore: 82,
    scoreAfter: 88,
    durationMin: 70,
    tone: 'ok',
  },
  {
    id: 'RPR-03',
    poolItemId: 'RP-03',
    round: 1,
    heldAt: '2026-02-20 14:00',
    mode: '会议',
    chairId: 'u-su',
    attendeeIds: ['u-su', 'u-yan', 'u-he', 'u-zhou'],
    aiPreReadSummary:
      'AI 预读了营销中台需求单 MKT-2026-018 与 REL-2402 的灰度记录，发现提案中「规则引擎化」的目标与 BUG-1043 的根因（double 精度 + 独立舍入）并非同一问题：' +
      '前者是架构问题，后者是实现问题。若不拆开，容易出现「引擎上线了但尾差还在」的情况。' +
      '同时统计出当前生效的优惠规则共 47 条，其中 12 条存在互斥关系但未显式声明。',
    aiQuestions: [
      '「互斥组 + 优先级 + 分摊」三段模型中，会员价属于互斥组还是叠加项？现有 47 条规则里有 12 条互斥关系未显式声明，如何回填',
      '分摊采用什么算法消除尾差？最大余额法在负数优惠（如加价购）场景下是否仍成立',
      '试算接口与下单接口的 ruleVersion 一致性如何保证？规则热更新的 5 分钟窗口内若用户先试算后下单，是拒绝还是按旧版本成交',
      'BUG-1043 的 0.01 元尾差是否需要单独先行热修，还是等引擎整体上线？两者的时间差会产生多少资损',
      '规则变更的灰度与回滚机制是什么：能否按门店 / 商品类目维度灰度，回滚时已成交订单如何处理',
    ],
    outcome: '通过',
    conditions: [],
    scoreBefore: 69,
    scoreAfter: 81,
    durationMin: 110,
    tone: 'ok',
  },
  {
    id: 'RPR-04',
    poolItemId: 'RP-07',
    round: 1,
    heldAt: '2026-02-20 16:00',
    mode: '会议',
    chairId: 'u-yan',
    attendeeIds: ['u-yan', 'u-zhou', 'u-meng', 'u-lin', 'u-gu'],
    aiPreReadSummary:
      'AI 预读了迁移方案初稿并扫描了 order 库的表结构：4.7 亿行、17 张关联表、最大单表 2.1 亿行。' +
      '方案给出了全量迁移与增量同步，但缺少回切路径与差异比对的具体口径，也没有评估迁移期间线上 RT 的影响。' +
      '按单批 5 万条、每秒 2 批估算，全量迁移需约 13 小时，超出提案中「4 小时窗口」的假设。',
    aiQuestions: [
      '全量迁移预计 13 小时，与提案的 4 小时窗口不符，是否需要改为「多批次跨天迁移 + 增量追平」的模式',
      '差异比对的口径是什么：按订单号逐字段全量比对，还是抽样？4.7 亿行全量比对的耗时与资源开销评估过吗',
      '双写期间写新库失败时的降级策略是什么？降级为单写后如何补齐这段时间的数据',
      '回切脚本的 RTO 目标是多少？回切时新库已产生的订单如何反向同步回旧库，是否会出现订单丢失',
      '迁移作业对线上 RT 的影响如何控制？是否需要在业务低峰期执行，低峰期的时长是否足够',
    ],
    outcome: '退回修改',
    conditions: [],
    scoreBefore: 84,
    scoreAfter: 66,
    durationMin: 120,
    tone: 'danger',
  },
  {
    id: 'RPR-05',
    poolItemId: 'RP-07',
    round: 2,
    heldAt: '2026-02-25 11:00',
    mode: '异步',
    chairId: 'u-yan',
    attendeeIds: ['u-yan', 'u-zhou', 'u-meng', 'u-lin', 'u-gu', 'u-he'],
    aiPreReadSummary:
      'AI 复核修订稿：迁移模式改为「分批跨天 + 增量追平」，单批 ≤ 5 万条且限制并发以控制线上 RT；' +
      '差异比对明确为按订单号逐字段全量比对，差异率阈值 0；补充了一键回切脚本（DNS + 配置中心双通道）并给出 RTO ≤ 10 分钟；' +
      '双写失败降级为单写并告警的机制已写入 AC2。第 1 轮 5 个问题全部闭环。',
    aiQuestions: [
      '断点续传的位点存储在哪里？若位点本身丢失，如何保证不重不漏',
      '迁移窗口需 DBA 批复，若窗口迟迟不批，是否有不依赖生产窗口的验证路径（如影子库全量演练）',
      'AC1 要求差异率为 0，实际执行中若出现个位数差异，判定标准是「必须为 0 才可切流」还是「可解释差异可放行」',
    ],
    outcome: '有条件通过',
    conditions: [
      '生产迁移窗口需 DBA 书面批复后方可启动（该条件后续演化为阻塞项 BLOCK-0312）',
      '切流前必须完成 3 轮预生产全量比对且差异率为 0',
      '一键回切脚本需完成 2 次演练并留存 RTO 实测记录',
    ],
    scoreBefore: 66,
    scoreAfter: 77,
    durationMin: 45,
    tone: 'warn',
  },
  {
    id: 'RPR-06',
    poolItemId: 'RP-09',
    round: 1,
    heldAt: '2026-03-16 15:30',
    mode: '异步',
    chairId: 'u-meng',
    attendeeIds: ['u-meng', 'u-zhou', 'u-he'],
    aiPreReadSummary:
      'AI 从 Prometheus 拉取了 2026-03-09 ~ 03-15 的缓存指标：订单详情缓存命中率 91.6%（AC1 要求 ≥ 92%）、穿透率 0.42%（AC1 要求 ≤ 0.3%）。' +
      '对穿透请求做聚类后发现 78% 的 Key 对应不存在的订单号，且来源 IP 集中在 3 个 C 段，具备扫描特征。' +
      '当前 ac-cache-layer 未配置空值缓存与布隆过滤器。',
    aiQuestions: [
      '空值缓存的 TTL 设多少？过短无法挡住扫描，过长会导致新建订单在 TTL 内查询不到',
      '布隆过滤器的误判率与内存占用如何权衡？4.7 亿订单号在 1% 误判率下约需 600MB，是否可接受',
      '疑似扫描的 3 个 C 段是否应先由 WAF 侧限流处理，而不是全部靠缓存层兜底',
      '该项与 REQ-2404 的验收标准 AC1 直接冲突，是作为 REQ-2404 的补充验收项还是独立需求排期',
    ],
    outcome: '有条件通过',
    conditions: [
      '先在预生产完成空值缓存 TTL 与布隆过滤器误判率的参数实测，给出内存与命中率的权衡曲线',
      '与安全组确认 3 个 C 段的扫描定性，若确认为恶意扫描则由 WAF 先行限流',
      '因 SP-24 产能已饱和（承诺 96 / 产能 104），排期落到 SP-25 首批，不得挤占 SP-24',
    ],
    scoreBefore: 65,
    scoreAfter: 73,
    durationMin: 30,
    tone: 'warn',
  },
  {
    id: 'RPR-07',
    poolItemId: 'RP-13',
    round: 1,
    heldAt: '2026-03-13 10:00',
    mode: '会议',
    chairId: 'u-lin',
    attendeeIds: ['u-lin', 'u-he', 'u-su', 'u-gu'],
    aiPreReadSummary:
      'AI 比对了 SEC-AUDIT-2026 审计清单与 KB-SEC-02 合规基线，识别出 3 项缺口：数据出境评估未启动、订单数据留存周期未定义（当前审计日志 180 天但业务数据无上限）、' +
      '跨境仓上线后的数据主体权利响应流程缺失。同时提示该项与 RP-08（字段脱敏与审计留痕）存在范围重叠，需明确边界。',
    aiQuestions: [
      '数据出境评估的边界如何界定：跨境仓的订单数据是新加坡节点回传还是本地存储，两种路径的合规要求不同',
      '订单业务数据的留存策略是永久还是有上限？若设上限，与《会计法》要求的凭证保存期限如何协调',
      '与 RP-08 的边界如何划分：RP-08 管字段级脱敏与操作审计，本条管数据出境与留存，是否存在遗漏的中间地带',
      '数据主体权利响应（查询 / 更正 / 删除）的 SLA 是个保法要求的 15 个工作日，现有系统能否支撑跨分片的删除操作',
    ],
    outcome: '有条件通过',
    conditions: [
      '与 RP-08 合并为「订单数据合规专项」，由林知远统一担任责任人，避免两条目范围重叠',
      '数据出境评估需法务与安全合规部联合出具意见书后方可进入排期',
      '排期落到 SP-25，不得与 SP-24 收口期争抢合规评审资源',
    ],
    scoreBefore: 68,
    scoreAfter: 74,
    durationMin: 60,
    tone: 'warn',
  },
  {
    id: 'RPR-08',
    poolItemId: 'RP-18',
    round: 1,
    heldAt: '2026-02-04 14:00',
    mode: '会议',
    chairId: 'u-yan',
    attendeeIds: ['u-yan', 'u-lin', 'u-zhou', 'u-shen'],
    aiPreReadSummary:
      'AI 统计了 order-service 的代码规模与工具链覆盖：12.4 万行 Java、SonarQube 规则集 218 条全部为 Java 规则、' +
      'ag-review 的规约库 KB-CODE-02 亦仅覆盖 Java。提案未附带任何性能或质量基线对比数据。' +
      '同时测算出双语言栈维护成本约 3 人月，CI 流水线需新增 Kotlin 编译与静态检查阶段（预计增加 4.5 分钟/次）。',
    aiQuestions: [
      '提案的收益指标是什么？请给出 Kotlin + 协程在本项目典型负载下的压测对比数据，否则无法评估',
      'SonarQube 的 218 条 Java 规则与 ag-review 的规约库如何平移到 Kotlin？平移期间质量防线是否会削弱',
      '与正在进行的限界上下文拆分是什么关系？拆分后代码量预计下降 40%，先迁移语言是否会造成重复工作',
      '3 人月的双语言栈维护成本由谁承担？是否会挤占 SP-25 履约域的产能',
    ],
    outcome: '退回修改',
    conditions: [],
    scoreBefore: 41,
    scoreAfter: 17,
    durationMin: 75,
    tone: 'slate',
  },
  {
    id: 'RPR-09',
    poolItemId: 'RP-19',
    round: 1,
    heldAt: '2026-03-11 16:00',
    mode: '会议',
    chairId: 'u-su',
    attendeeIds: ['u-su', 'u-yan', 'u-gu', 'u-zhou'],
    aiPreReadSummary:
      'AI 检查了两个硬前置的就绪状态：抖音开放平台沙箱账号申请提交于 2026-02-20，平台方回复预计 2026-05 下发；' +
      'WMS 履约回调协议 3 份契约的冻结进度为 0/3，API-10「拆单预演」仍为 draft（见 PR-04）。' +
      '在两项前置均未就绪的情况下，提案给出的 21 点估算缺少可信依据。',
    aiQuestions: [
      '沙箱账号 5 月才下发，本条即使现在排期也无法在 SP-25（03-30 ~ 04-24）内完成联调，排期假设是否成立',
      '抖音的履约回调协议与自建 WMS 的回调协议差异有多大？是否可复用 REQ-2405 的拆单能力，还是需要独立的适配层',
      '4% 的订单增量测算依据是什么？是否已扣除与现有渠道的重叠部分',
      '渠道方的 SLA 与故障责任如何界定？回调失败时的补偿机制由哪一方承担',
    ],
    outcome: '挂起',
    conditions: [],
    scoreBefore: 63,
    scoreAfter: 51,
    durationMin: 55,
    tone: 'slate',
  },
  {
    id: 'RPR-10',
    poolItemId: 'RP-16',
    round: 1,
    heldAt: '2026-02-11 09:30',
    mode: '会议',
    chairId: 'u-meng',
    attendeeIds: ['u-meng', 'u-yan', 'u-lin', 'u-he'],
    aiPreReadSummary:
      'AI 复盘了 INC-2026-0207 的调用链与慢 SQL 日志：事故期间订单列表 P95 达 342ms（契约 200ms），' +
      '定位到 7 条未命中索引的慢 SQL 与读副本连接池打满（16 个副本、连接使用率 98%）。' +
      '方案（扩容至 24 副本 + 慢 SQL 改写）属成熟手段，风险可控，建议走常规发布而非紧急发布。',
    aiQuestions: [
      '读副本从 16 扩到 24，主从复制延迟是否会随之上升？当前延迟基线与扩容后的预期值分别是多少',
      '7 条慢 SQL 改写后是否需要变更索引？索引变更在 2.1 亿行表上的执行时长与锁表风险如何评估',
      '本次为止血措施，与 REQ-2404 的结构性方案（缓存 + 分片）是什么关系，是否会造成重复投入',
    ],
    outcome: '通过',
    conditions: [],
    scoreBefore: 62,
    scoreAfter: 70,
    durationMin: 40,
    tone: 'ok',
  },
];

/** 需求漏斗阶段统计 */
export interface ReqFunnelStat {
  /** 漏斗阶段名 */
  stage: '收集' | '评估' | '评分' | '排期' | '入迭代' | '交付';
  /** 累计到达该阶段的条目数 */
  count: number;
  /** 相对上一阶段的转化率（%）；首阶段为 100 */
  conversionRatePct: number;
  /** 从入池到离开该阶段的平均耗时（天） */
  avgCycleDays: number;
  tone: Tone;
}

/**
 * 需求漏斗 6 个阶段（累计到达口径），与 REQ_POOL 的 stage 分布严格对账：
 *   收集 = 20（全部入池条目）
 *   评估 = 20 − 2（stage '收集'：RP-11 / RP-20）= 18                       转化率 18÷20 = 90.0%
 *   评分 = 18 − 2（stage '评估中'：RP-10 / RP-15）= 16                      转化率 16÷18 = 88.9%
 *   排期 = 待排期 2（RP-09 / RP-13）+ 已入迭代 8 + 已交付 1（RP-16）= 11     转化率 11÷16 = 68.8%
 *          （16 − 11 = 5 在本环节流失 = 已评分 2（RP-12 / RP-14）+ 已拒绝 2（RP-17 / RP-18）+ 已挂起 1（RP-19））
 *   入迭代 = 已入迭代 8 + 已交付 1 = 9                                      转化率 9÷11 = 81.8%
 *   交付 = 已交付 1（RP-16）                                                转化率 1÷9 = 11.1%
 * 末端交付转化率偏低的原因：SP-24 尚未结束（TODAY = 2026-03-19，迭代末日 03-27），
 * 8 条已入迭代需求中最快的 REQ-2406 于 2026-03-13 随 v2.4 上线，其余仍在 qa / dev / refined 态。
 */
export const REQ_FUNNEL: ReqFunnelStat[] = [
  { stage: '收集', count: 20, conversionRatePct: 100, avgCycleDays: 0, tone: 'neutral' },
  { stage: '评估', count: 18, conversionRatePct: 90.0, avgCycleDays: 4.2, tone: 'info' },
  { stage: '评分', count: 16, conversionRatePct: 88.9, avgCycleDays: 9.6, tone: 'ai' },
  { stage: '排期', count: 11, conversionRatePct: 68.8, avgCycleDays: 16.8, tone: 'warn' },
  { stage: '入迭代', count: 9, conversionRatePct: 81.8, avgCycleDays: 24.5, tone: 'brand' },
  { stage: '交付', count: 1, conversionRatePct: 11.1, avgCycleDays: 41.3, tone: 'ok' },
];

/** 需求来源统计 */
export interface ReqSourceStat {
  sourceType: ReqPoolItemDef['sourceType'];
  count: number;
  /** 占需求池总量的比例（%） */
  sharePct: number;
  /** 该来源条目从入池到当前阶段的平均耗时（天） */
  avgCycleDays: number;
  /** 采纳率：进入「排期」及之后阶段的条目数 ÷ count */
  acceptRatePct: number;
  /** 该来源的平均 AI 优先级分 */
  avgPriorityScore: number;
  tone: Tone;
}

/**
 * 按 sourceType 的统计，与 REQ_POOL 逐条点数对账（合计 20 条、占比合计 100%）：
 *   业务方提出 7（RP-03/04/05/11/15/19/20）· 采纳 3（RP-03/04/05 已入迭代）→ 42.9%
 *   技术债     4（RP-06/07/12/18）        · 采纳 2（RP-06/07 已入迭代）      → 50.0%
 *   客户投诉   3（RP-02/10/17）           · 采纳 1（RP-02 已入迭代）          → 33.3%
 *   线上事故复盘 2（RP-01/16）            · 采纳 2（已入迭代 + 已交付）        → 100%
 *   合规监管   2（RP-08/13）              · 采纳 2（已入迭代 + 待排期）        → 100%
 *   竞品分析   1（RP-14）                 · 采纳 0（停在已评分）              → 0%
 *   AI 主动发现 1（RP-09）                · 采纳 1（待排期）                  → 100%
 */
export const REQ_SOURCE_STATS: ReqSourceStat[] = [
  { sourceType: '业务方提出', count: 7, sharePct: 35.0, avgCycleDays: 19.6, acceptRatePct: 42.9, avgPriorityScore: 60.7, tone: 'ai' },
  { sourceType: '技术债', count: 4, sharePct: 20.0, avgCycleDays: 27.3, acceptRatePct: 50.0, avgPriorityScore: 46.0, tone: 'slate' },
  { sourceType: '客户投诉', count: 3, sharePct: 15.0, avgCycleDays: 22.4, acceptRatePct: 33.3, avgPriorityScore: 55.3, tone: 'warn' },
  { sourceType: '线上事故复盘', count: 2, sharePct: 10.0, avgCycleDays: 9.8, acceptRatePct: 100, avgPriorityScore: 79.0, tone: 'danger' },
  { sourceType: '合规监管', count: 2, sharePct: 10.0, avgCycleDays: 24.1, acceptRatePct: 100, avgPriorityScore: 70.0, tone: 'indigo' },
  { sourceType: '竞品分析', count: 1, sharePct: 5.0, avgCycleDays: 31.5, acceptRatePct: 0, avgPriorityScore: 48.0, tone: 'teal' },
  { sourceType: 'AI 主动发现', count: 1, sharePct: 5.0, avgCycleDays: 6.2, acceptRatePct: 100, avgPriorityScore: 73.0, tone: 'brand' },
];

/* ==== 5. 版本管理 ==== */

/** 质量门禁单项结论 */
export interface QualityGateResult {
  pass: boolean;
  note: string;
}

/** 版本定义 */
export interface VersionDef {
  id: string;
  name: 'v2.2' | 'v2.3' | 'v2.4' | 'v3.0-rc1' | 'v3.0';
  codeName: string;
  type: 'feature' | 'minor' | 'major' | 'patch' | 'rc';
  status: '规划中' | '开发中' | '已冻结' | '灰度中' | '已发布' | '已回滚';
  tone: Tone;
  planDate: string;
  /** 实际发布日期；未到为 null */
  actualDate: string | null;
  scopeSummary: string;
  requirementIds: string[];
  taskIds: string[];
  bugIds: string[];
  /** 挂靠的发布单（./data 的 RELEASE_ORDERS.id） */
  releaseIds: string[];
  featureCount: number;
  breakingChanges: boolean;
  compatNote: string;
  /** 版本负责人（USERS.id） */
  owner: string;
  approverIds: string[];
  /** 基线（VERSION_BASELINES.id） */
  baselineId: string;
  qualityGate: {
    /** G1 需求门禁 */
    g1: QualityGateResult;
    /** G2 架构门禁 */
    g2: QualityGateResult;
    /** G3 编码门禁 */
    g3: QualityGateResult;
    /** G4 测试门禁 */
    g4: QualityGateResult;
    /** G5 发布门禁 */
    g5: QualityGateResult;
    /** G6 观测门禁 */
    g6: QualityGateResult;
  };
  /** AI 生成的发布说明草稿（3-5 条要点） */
  aiReleaseNote: string[];
  /** 生成发布说明草稿的模型调用成本（元） */
  tokenCost: number;
}

/**
 * 5 个版本。
 * 与 ./data 的衔接：
 *   VER-02（v2.3）挂 REL-2401（2026-02-13，order-query:v1.9.2，summary 注明「Sprint 23 常规发布」）
 *                  与 REL-2402（2026-02-27，order-api:v1.9.4，优惠试算灰度）；
 *   VER-04（v3.0-rc1）挂 REL-2403（2026-03-20 窗口，version 'order-api:2421-f19d6c0'，与 VB-04.commitSha 'f19d6c0' 一致），
 *                  其 gateBlockedIds ['G3','G4'] 与本条目 qualityGate.g3 / g4 的 pass=false 一致；
 *   VER-01 / VER-05 无对应发布单（v2.2 早于发布单纳管，v3.0 尚未排定发布单）。
 * 工作项划分（8 条需求 / 24 个任务 / 12 个缺陷全部有且仅有一个归属版本）：
 *   VER-03：REQ-2406 · TASK-2417 / 2418 · BUG-1049 / 1050 / 1051
 *   VER-04：REQ-2401 ~ 2405、REQ-2407（6 条）· TASK-2401 ~ 2416、TASK-2419、TASK-2420（18 个）
 *           · BUG-1043 / 1045 / 1046 / 1047 / 1048 / 1053 / 1055（7 个）
 *   VER-05：REQ-2408 · TASK-2421 ~ 2424 · BUG-1052 / 1054
 *   VER-01 / VER-02 的工作项属 PingCode「会员中心」与「支付中台」项目，未纳入本原型数据集，故三个数组为空，
 *   其规模数据见对应 VERSION_BASELINES.includedCounts。
 */
export const VERSIONS: VersionDef[] = [
  {
    id: 'VER-01',
    name: 'v2.2',
    codeName: 'Lumen',
    type: 'minor',
    status: '已发布',
    tone: 'ok',
    planDate: '2026-01-30',
    actualDate: '2026-01-30',
    scopeSummary: '会员中心一期：会员等级体系、积分账户与权益中心三模块上线，统一线上线下会员身份识别（对应 Sprint 22）',
    requirementIds: [],
    taskIds: [],
    bugIds: [],
    releaseIds: [],
    featureCount: 12,
    breakingChanges: false,
    compatNote: '会员等级枚举新增 4 个值，旧客户端遇到未知等级时降级为「普通会员」展示；积分账户接口保持向后兼容，无破坏性变更',
    owner: 'u-su',
    approverIds: ['u-lin', 'u-su'],
    baselineId: 'VB-01',
    qualityGate: {
      g1: { pass: true, note: 'PRD-MBR-v1.4 基线签核，12 条需求全部具备可测验收标准' },
      g2: { pass: true, note: '会员域上下文映射图评审通过，6 份接口契约冻结' },
      g3: { pass: true, note: '单测覆盖率 86.4%（阈值 85%），SonarQube 阻断 0' },
      g4: { pass: true, note: '196 条用例执行完毕，通过率 98.5%，14 个缺陷全部闭环' },
      g5: { pass: true, note: '2026-01-30 10:00 全量发布，两批灰度观察均无告警' },
      g6: { pass: true, note: '上线 30 天观测：会员识别率 99.4%，权益核销 P99 268ms，积分对账差异 0 笔' },
    },
    aiReleaseNote: [
      '新增会员等级体系：支持 6 个等级与自定义升降级规则，等级变更事件通过消息总线外发',
      '新增积分账户：支持发放、冻结、扣减与过期四类流水，日终对账差异为 0',
      '新增权益中心：券、免邮、专属客服三类权益可按等级配置，核销链路 P99 268ms',
      '统一会员身份识别：手机号 / 微信 unionId / 线下会员卡三源合一，识别率 99.4%',
      '兼容性：会员等级枚举新增 4 个值，旧客户端降级为「普通会员」展示，无需强制升级',
    ],
    tokenCost: 6.42,
  },
  {
    id: 'VER-02',
    name: 'v2.3',
    codeName: 'Halcyon',
    type: 'minor',
    status: '已发布',
    tone: 'ok',
    planDate: '2026-02-27',
    actualDate: '2026-02-28',
    scopeSummary:
      '支付渠道统一接入：微信 / 支付宝 / 银联三渠道收敛到统一支付网关并支持异步对账；随 REL-2401 完成订单查询读扩容与慢 SQL 治理，随 REL-2402 完成优惠试算链路灰度接入（对应 Sprint 23）',
    requirementIds: [],
    taskIds: [],
    bugIds: [],
    releaseIds: ['REL-2401', 'REL-2402'],
    featureCount: 18,
    breakingChanges: false,
    compatNote:
      '支付网关对外契约保持向后兼容，仅新增 channelType 枚举值 UNIONPAY；优惠试算通过 promo.engine.enabled 开关灰度，可在 3 分钟内回落旧计价链路',
    owner: 'u-meng',
    approverIds: ['u-lin', 'u-yan', 'u-su'],
    baselineId: 'VB-02',
    qualityGate: {
      g1: { pass: true, note: 'PRD-PAY-v2.0 基线签核，11 条需求验收标准齐备' },
      g2: { pass: true, note: '支付网关分层与渠道适配器设计评审通过，8 份接口契约冻结' },
      g3: { pass: true, note: '单测覆盖率 85.2%，SonarQube 阻断 0、严重 1（已降级签认）' },
      g4: { pass: true, note: '214 条用例执行完毕，9 个缺陷闭环；三渠道对账用例全部通过' },
      g5: { pass: true, note: 'REL-2401 两批灰度、REL-2402 四批灰度均完成，全量后无 P0/P1 告警' },
      g6: { pass: true, note: '支付成功率 99.7%，订单列表 P95 由 286ms 降至 214ms；遗留 BUG-1043 资损尾差转入 SP-24' },
    },
    aiReleaseNote: [
      '新增统一支付网关：微信 / 支付宝 / 银联三渠道收敛到单一入口，新渠道接入工时由 15 人日降至 4 人日',
      '新增异步对账与差错自动处理：对账差错自动处理率 92.4%，日终对账耗时由 42 分钟降至 11 分钟',
      'REL-2401 订单查询读扩容：读副本 16 → 24，治理慢 SQL 7 条，列表接口 P95 由 286ms 降至 214ms（-25.2%）',
      'REL-2402 优惠试算链路灰度接入 promotion-engine，四批灰度全量，试算与下单结果一致率 100%',
      '已知问题：灰度批次 2 触发 3 次金额分摊尾差告警（BUG-1043，0.01 元/单），定位为 double 精度问题，已转入 SP-24 由 REQ-2403 / TASK-2410 修复',
    ],
    tokenCost: 8.16,
  },
  {
    id: 'VER-03',
    name: 'v2.4',
    codeName: 'Kestrel',
    type: 'patch',
    status: '已发布',
    tone: 'ok',
    planDate: '2026-03-13',
    actualDate: '2026-03-13',
    scopeSummary:
      '订单领域事件标准化先行上线：以 CloudEvents 1.0 信封替换 12 个下游各自的自定义 JSON 协议（兼容期新旧双发），并交付死信队列回放工具与回放成功率监控',
    requirementIds: ['REQ-2406'],
    taskIds: ['TASK-2417', 'TASK-2418'],
    bugIds: ['BUG-1049', 'BUG-1050', 'BUG-1051'],
    releaseIds: [],
    featureCount: 1,
    breakingChanges: false,
    compatNote:
      '兼容期内新旧事件双发，下游可按队列维度灰度切换；CloudEvents 信封 time 字段统一携带 +08:00 时区偏移（修复 BUG-1050 的 8 小时时差）；旧协议将在 3 个月兼容期届满后下线',
    owner: 'u-shen',
    approverIds: ['u-lin', 'u-yan'],
    baselineId: 'VB-03',
    qualityGate: {
      g1: { pass: true, note: 'REQ-2406 验收标准 4 条全部具备可测口径，AC2 双发兼容已明确灰度切换路径' },
      g2: { pass: true, note: '事件信封符合 CloudEvents 1.0 规范，与 KB-ARCH-01 的最终一致性要求一致' },
      g3: { pass: true, note: 'TASK-2417 覆盖率 87%、TASK-2418 覆盖率 79%，均高于阈值' },
      g4: { pass: true, note: '事件契约用例 42 条全部通过，死信回放成功率实测 99.6%（AC4 要求 ≥ 99.5%）' },
      g5: { pass: true, note: '2026-03-13 全量发布，12 个下游中 5 个已切换至新信封' },
      g6: { pass: true, note: '发布后 6 天观测：消息积压量峰值 1,240 条（阈值 5,000），无事件乱序告警' },
    },
    aiReleaseNote: [
      '订单领域事件统一为 CloudEvents 1.0 信封（含 id / source / type / specversion / time），替换 12 个下游各自的自定义 JSON 协议',
      '兼容期新旧事件双发，下游可按队列维度灰度切换；当前 5 / 12 个下游已完成切换',
      '消息幂等键与订单号绑定，重复投递不再产生业务副作用（修复 BUG-1049 事件乱序导致的状态回退）',
      'time 字段统一携带 +08:00 时区偏移，修复 BUG-1050 旧消费者 8 小时时差问题',
      '新增死信队列回放工具：支持按时间窗与队列维度回放，实测成功率 99.6%，修复 BUG-1051 并发回放重复投递问题',
    ],
    tokenCost: 5.28,
  },
  {
    id: 'VER-04',
    name: 'v3.0-rc1',
    codeName: 'OrderRef-RC1',
    type: 'rc',
    status: '已冻结',
    tone: 'warn',
    planDate: '2026-03-20',
    actualDate: null,
    scopeSummary:
      '订单中心重构候选版本：order-service 拆分为订单 / 履约 / 优惠三个限界上下文，落地幂等下单与本地消息表、统一状态机、优惠规则引擎化、3000 TPS 查询性能与 4.7 亿历史订单基因分片迁移。代码已于 2026-03-18 20:00 冻结（commit f19d6c0），但 G3 / G4 门禁未通过，REL-2403 处于 blocked 态',
    requirementIds: ['REQ-2401', 'REQ-2402', 'REQ-2403', 'REQ-2404', 'REQ-2405', 'REQ-2407'],
    taskIds: [
      'TASK-2401', 'TASK-2402', 'TASK-2403', 'TASK-2404', 'TASK-2405', 'TASK-2406',
      'TASK-2407', 'TASK-2408', 'TASK-2409', 'TASK-2410', 'TASK-2411', 'TASK-2412',
      'TASK-2413', 'TASK-2414', 'TASK-2415', 'TASK-2416', 'TASK-2419', 'TASK-2420',
    ],
    bugIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1047', 'BUG-1048', 'BUG-1053', 'BUG-1055'],
    releaseIds: ['REL-2403'],
    featureCount: 6,
    breakingChanges: true,
    compatNote:
      '三项破坏性变更，均提供 3 个月兼容期与开关回落：① 非法状态流转不再静默忽略，返回 ORDER_STATE_ILLEGAL 及允许的下一状态集合；' +
      '② 订单号内嵌用户基因位（16 库 × 64 表），下游若按旧规则解析用户维度会失配；' +
      '③ 订单列表由 offset 分页改为游标分页，page 参数废弃，深分页请求返回 PAGE_PARAM_DEPRECATED',
    owner: 'u-yan',
    approverIds: ['u-lin', 'u-yan', 'u-gu', 'u-he'],
    baselineId: 'VB-04',
    qualityGate: {
      g1: { pass: true, note: 'PRD-ORD-v2.3 基线已签核，6 条需求的验收标准共 26 条全部可测' },
      g2: { pass: true, note: '四层架构视图与 13 份接口契约冻结（API-13 随 REQ-2408 移至 v3.0），架构评审纪要 ARCH-24-007' },
      g3: { pass: false, note: '单测覆盖率 71.4%，低于 85% 阈值；近 7 日增速 0.64pt/日，按斜率达标需 21 天而迭代仅剩 8 天（见 PR-02）' },
      g4: { pass: false, note: '248 条用例执行率 62%，128 组金额边界用例仅回归 74 组；BUG-1053 与 BUG-1055 尚未闭环' },
      g5: {
        pass: false,
        note:
          '发布门禁 6 项预检通过 4 项（PIPE-2410）；BLOCK-0312 生产迁移窗口未批复。' +
          '本项未列入 RELEASE_ORDERS[REL-2403].gateBlockedIds（该字段仅记录 G3 / G4），因为 G5 是被上游阻断而非自身判定失败',
      },
      g6: { pass: false, note: '观测面板与 SLO 基线已就绪，但生产指标需切流后才能验证，冻结阶段不予判定通过' },
    },
    aiReleaseNote: [
      '订单创建链路重构为「预校验 → 幂等落库 → 本地消息表 → 异步事件外发」四段式，相同 idempotencyKey 在 24h 内重复提交只产生一笔订单',
      '统一状态机组件替换散落在 6 个服务中的 if-else 判断，非法流转返回 ORDER_STATE_ILLEGAL，全部状态变更写入 order_state_log 并支持下游订阅',
      '优惠计算下沉至 promotion-engine，采用「互斥组 + 优先级 + 分摊」三段模型，金额全链路 BigDecimal + 最大余额法，分摊之和恒等于应付金额',
      '订单查询达标改造：Caffeine + Redis 7 多级缓存、订单号基因分片（16 库 × 64 表）、列表游标分页，目标 3000 TPS 且 P99 ≤ 200ms',
      '多仓多商家拆单：按商家 / 仓库 / 类目 / 重量四个维度可配置拆分，子订单独立履约与退款，父订单聚合金额与状态',
      '历史订单迁移：4.7 亿行分批迁移至新分片集群，单批 ≤ 5 万条、支持断点续传，双写期差异率要求为 0，配一键回切脚本（RTO ≤ 10 分钟）',
    ],
    tokenCost: 34.72,
  },
  {
    id: 'VER-05',
    name: 'v3.0',
    codeName: 'OrderRef-GA',
    type: 'major',
    status: '规划中',
    tone: 'info',
    planDate: '2026-04-10',
    actualDate: null,
    scopeSummary:
      '订单中心重构正式版本：在 v3.0-rc1 基线之上补齐订单数据合规（SM4 加密、展示脱敏、导出二次授权、审计留痕与越权告警），并执行 TASK-2421 生产切流，完成三个限界上下文的全量切换',
    requirementIds: ['REQ-2408'],
    taskIds: ['TASK-2421', 'TASK-2422', 'TASK-2423', 'TASK-2424'],
    bugIds: ['BUG-1052', 'BUG-1054'],
    releaseIds: [],
    featureCount: 1,
    breakingChanges: true,
    compatNote:
      '导出接口新增二次授权前置校验，未携带审批单号的调用返回 ORDER_EXPORT_UNAUTHORIZED；敏感字段密文落库后，旧报表脚本需改用脱敏视图 order_pii_masked_view；' +
      '审计日志保留 ≥ 180 天，越权访问实时告警并阻断',
    owner: 'u-lin',
    approverIds: ['u-lin', 'u-yan', 'u-he', 'u-gu'],
    baselineId: 'VB-05',
    qualityGate: {
      g1: { pass: true, note: 'REQ-2408 的 4 条验收标准已随 PRD-ORD-v2.3 签核' },
      g2: { pass: true, note: '统一脱敏组件 SEC-MASK-2.1 的接入方案已通过架构评审（注解驱动 + KMS 密钥托管）' },
      g3: { pass: false, note: 'TASK-2422 / 2423 / 2424 尚未启动编码，覆盖率暂无数据' },
      g4: { pass: false, note: '合规专项用例集（含 BUG-1052 / BUG-1054 的回归用例）尚未生成' },
      g5: { pass: false, note: '发布窗口 2026-04-10 落在 618 大促预备封网期（2026-04-01 ~ 04-20）内，需申请紧急变更豁免或顺延至 04-22（见 CAL-11 / CAL-12）' },
      g6: { pass: false, note: '审计留痕率与越权拦截率的观测面板待开发' },
    },
    aiReleaseNote: [
      '敏感字段（收件人手机号、地址、身份证）落库改为 SM4 加密，密钥托管企业 KMS，接入 SEC-MASK-2.1 注解驱动方案',
      '展示层默认脱敏（手机号显示为 138****8000），导出走主管二次授权流程并携带审批单号，修复 BUG-1052 与 BUG-1054',
      '查询与导出行为 100% 留痕，日志保留 ≥ 180 天，支持按人回溯；越权访问实时告警并阻断',
      '执行 TASK-2421 生产切流：按 1% → 10% → 50% → 100% 四批灰度切换读写流量至新分片集群，配一键回切脚本（RTO ≤ 10 分钟）',
      '兼容性提示：未携带审批单号的导出调用将返回 ORDER_EXPORT_UNAUTHORIZED，旧报表脚本需切换到脱敏视图',
    ],
    tokenCost: 4.18,
  },
];

/** 版本 id → 定义 */
export const VERSION_MAP: Record<string, VersionDef> = VERSIONS.reduce<Record<string, VersionDef>>((acc, v) => {
  acc[v.id] = v;
  return acc;
}, {});

/**
 * 发布单 id → 所属版本 id 的反查索引。
 * 由 ./data 的 RELEASE_ORDERS 驱动生成：REL-2401 / REL-2402 → VER-02（v2.3），REL-2403 → VER-04（v3.0-rc1）。
 */
export const VERSION_ID_BY_RELEASE: Record<string, string> = RELEASE_ORDERS.reduce<Record<string, string>>(
  (acc, rel) => {
    const hit = VERSIONS.filter((v) => v.releaseIds.indexOf(rel.id) >= 0)[0];
    if (hit) {
      acc[rel.id] = hit.id;
    }
    return acc;
  },
  {},
);

/** 版本基线中被移出的条目 */
export interface BaselineExcludedItem {
  id: string;
  title: string;
  reason: string;
}

/** 基线纳入范围计数 */
export interface BaselineIncludedCounts {
  requirements: number;
  tasks: number;
  bugs: number;
  apiContracts: number;
}

/** 版本基线（代码冻结快照） */
export interface VersionBaselineDef {
  id: string;
  versionId: string;
  /** 冻结时间；尚未冻结为空串 */
  frozenAt: string;
  /** 冻结执行人（USERS.id）；尚未冻结时为计划责任人 */
  frozenBy: string;
  /** 冻结时的 commit SHA；尚未冻结为空串 */
  commitSha: string;
  branch: string;
  tag: string;
  artifactImage: string;
  includedCounts: BaselineIncludedCounts;
  excludedItems: BaselineExcludedItem[];
  /** 制品校验和；尚未冻结为空串 */
  checksum: string;
  /** 签核人（USERS.id） */
  signOffIds: string[];
}

/**
 * 5 条版本基线（每版本一条）。
 * includedCounts 与所属 VERSIONS 条目的数组长度一一对应（VER-01 / VER-02 例外：其工作项属 PingCode
 * 「会员中心」与「支付中台」项目、未纳入本原型数据集，故 includedCounts 记录的是构建时的完整快照口径）。
 * VB-04.commitSha 'f19d6c0' 与 ./data 中 REL-2403.version 'order-api:2421-f19d6c0（待构建）' 的构建号一致。
 * VB-05 对应「规划中」的 v3.0，frozenAt / commitSha / checksum 为空串表示尚未冻结。
 */
export const VERSION_BASELINES: VersionBaselineDef[] = [
  {
    id: 'VB-01',
    versionId: 'VER-01',
    frozenAt: '2026-01-29 18:00',
    frozenBy: 'u-meng',
    commitSha: 'a7f3c91',
    branch: 'release/v2.2',
    tag: 'v2.2.0',
    artifactImage: 'harbor.artisan-tech.com/member-center/member-service:v2.2.0',
    includedCounts: { requirements: 9, tasks: 31, bugs: 14, apiContracts: 6 },
    excludedItems: [],
    checksum: 'sha256:4b7e2c9a1f6d8053e2b7c4a91d6f0385e2c7b4a19d60f3852e7c4b1a9d60f385',
    signOffIds: ['u-lin', 'u-su'],
  },
  {
    id: 'VB-02',
    versionId: 'VER-02',
    frozenAt: '2026-02-26 18:00',
    frozenBy: 'u-meng',
    commitSha: 'd41b8e0',
    branch: 'release/v2.3',
    tag: 'v2.3.0',
    artifactImage: 'harbor.artisan-tech.com/payment-gateway/payment-service:v2.3.0',
    includedCounts: { requirements: 11, tasks: 34, bugs: 9, apiContracts: 8 },
    excludedItems: [
      {
        id: 'BUG-1043',
        title: '券 + 满减 + 会员价三重叠加时分摊尾差 0.01 元，导致资损',
        reason:
          'REL-2402 灰度批次 2 触发 3 次金额分摊尾差告警后被发现，定位为 double 精度问题；修复方案（BigDecimal + 最大余额法）需全链路改造，未通过当轮架构评审，移出 v2.3 并转入 SP-24 的 REQ-2403 / TASK-2410',
      },
    ],
    checksum: 'sha256:9c1f4a7b2e8d5063f1a4c7b90e2d5386a3b8f1c4d7e0925a6b3c8d1e4f7092a5',
    signOffIds: ['u-lin', 'u-yan', 'u-su'],
  },
  {
    id: 'VB-03',
    versionId: 'VER-03',
    frozenAt: '2026-03-12 18:00',
    frozenBy: 'u-meng',
    commitSha: 'b82e5d4',
    branch: 'release/v2.4',
    tag: 'v2.4.0',
    artifactImage: 'harbor.artisan-tech.com/order-center/order-event:v2.4.0',
    includedCounts: { requirements: 1, tasks: 2, bugs: 3, apiContracts: 2 },
    excludedItems: [],
    checksum: 'sha256:2e8b5c1d7f4a9063b8e2d5c1f7a4093b6d2e8c1f5a7094b3e6d2c8f1a5074b93',
    signOffIds: ['u-lin', 'u-yan'],
  },
  {
    id: 'VB-04',
    versionId: 'VER-04',
    frozenAt: '2026-03-18 20:00',
    frozenBy: 'u-yan',
    commitSha: 'f19d6c0',
    branch: 'release/v3.0-rc1',
    tag: 'v3.0.0-rc1',
    artifactImage: 'harbor.artisan-tech.com/order-center/order-service:v3.0.0-rc1',
    includedCounts: { requirements: 6, tasks: 18, bugs: 7, apiContracts: 13 },
    excludedItems: [
      {
        id: 'REQ-2408',
        title: '订单数据合规：字段脱敏与操作审计留痕',
        reason: '依赖统一脱敏组件 SEC-MASK-2.1，安全组接入排队至 2026-04-02，整体顺延至 v3.0',
      },
      {
        id: 'TASK-2421',
        title: '生产切流发布单 REL-2403：新分片集群读写切换',
        reason: 'BLOCK-0312 生产迁移窗口未批复，切流动作从 rc1 剥离，改由 v3.0 全量窗口执行',
      },
      {
        id: 'TASK-2422',
        title: '敏感字段 SM4 加密与 KMS 密钥托管接入',
        reason: '随 REQ-2408 一并移出，state 停留在 refined 且 progress 为 0',
      },
      {
        id: 'TASK-2423',
        title: '展示脱敏与导出二次授权',
        reason: '随 REQ-2408 一并移出，state 停留在 refined 且 progress 为 0',
      },
      {
        id: 'TASK-2424',
        title: '查询/导出行为审计留痕与越权告警',
        reason: 'state 停留在 backlog（需求池），未进入 rc1 冻结范围',
      },
      {
        id: 'TASK-2417',
        title: 'CloudEvents 1.0 事件信封与新旧双发兼容',
        reason: '已于 2026-03-09 完成并随 v2.4（VER-03）先行上线，从 rc1 基线剔除以避免重复发布',
      },
      {
        id: 'TASK-2418',
        title: '死信队列回放工具与成功率监控',
        reason: '已于 2026-03-13 随 v2.4（VER-03）先行上线，从 rc1 基线剔除',
      },
    ],
    checksum: 'sha256:7a3d9f1c5b8e2046d1a7c3f9b50e2864c2d8f1a4b70e3956d2c8f4a1b7053e92',
    signOffIds: ['u-yan', 'u-lin'],
  },
  {
    id: 'VB-05',
    versionId: 'VER-05',
    frozenAt: '',
    frozenBy: 'u-meng',
    commitSha: '',
    branch: 'release/v3.0',
    tag: 'v3.0.0',
    artifactImage: 'harbor.artisan-tech.com/order-center/order-service:v3.0.0',
    includedCounts: { requirements: 1, tasks: 4, bugs: 2, apiContracts: 1 },
    excludedItems: [
      {
        id: 'REQ-2406',
        title: '订单领域事件标准化外发（RabbitMQ）',
        reason: '已于 2026-03-13 随 v2.4（VER-03）先行上线，v3.0 不再重复纳入；旧协议下线动作登记在技术债跟踪中',
      },
    ],
    checksum: '',
    signOffIds: [],
  },
];

/** 变更集（版本内按模块聚合的变更单元） */
export interface ChangeSetDef {
  id: string;
  versionId: string;
  title: string;
  changeType: '新增' | '变更' | '修复' | '移除' | '配置';
  /** 变更所属模块 */
  module: string;
  /** 关联的需求 / 任务 / 缺陷 / 接口契约 / 发布单 id */
  relatedIds: string[];
  dbMigration: boolean;
  /** 数据库迁移脚本名；无迁移为空串 */
  migrationScript: string;
  rollbackPlan: string;
  riskLevel: 'high' | 'medium' | 'low';
  reviewerIds: string[];
  /** 关联的 GitLab MR（取自 ./data 中 TASKS.mrId 的真实值） */
  mrIds: string[];
  linesAdded: number;
  linesDeleted: number;
  apiChanged: boolean;
  breakingApi: boolean;
  /** 执行主体：AI / 人 / 人机协同 */
  executor: Executor;
  tone: Tone;
}

/**
 * 14 条变更集：VER-02 两条（CS-01 / CS-02）、VER-03 两条（CS-03 / CS-04）、
 * VER-04 九条（CS-05 ~ CS-13）、VER-05 一条（CS-14）。
 * VER-01（v2.2）无变更集：该版本早于平台变更集纳管范围。
 * mrIds 与 linesAdded / linesDeleted 均取自 ./data 中 TASKS 的真实 mrId / additions / deletions；
 * 聚合型变更集（如 CS-05 合并 TASK-2401 与 TASK-2403、CS-13 合并 TASK-2409 / 2410 / 2411）为对应任务数值之和。
 */
export const CHANGE_SETS: ChangeSetDef[] = [
  {
    id: 'CS-01',
    versionId: 'VER-02',
    title: 'order-query 读副本扩容 16 → 24 与连接池调优',
    changeType: '配置',
    module: '数据库',
    relatedIds: ['REL-2401'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '配置中心一键还原读副本数至 16 并回滚连接池参数，RTO 5 分钟',
    riskLevel: 'low',
    reviewerIds: ['u-yan', 'u-lin'],
    mrIds: [],
    linesAdded: 42,
    linesDeleted: 18,
    apiChanged: false,
    breakingApi: false,
    executor: 'human',
    tone: 'ok',
  },
  {
    id: 'CS-02',
    versionId: 'VER-02',
    title: '优惠试算链路灰度接入 promotion-engine（开关 promo.engine.enabled）',
    changeType: '新增',
    module: '优惠核销',
    relatedIds: ['REL-2402', 'API-07', 'BUG-1043'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '关闭灰度开关 promo.engine.enabled，回落旧计价链路，RTO 3 分钟（已演练 2 次）',
    riskLevel: 'medium',
    reviewerIds: ['u-su', 'u-yan'],
    mrIds: [],
    linesAdded: 1280,
    linesDeleted: 96,
    apiChanged: true,
    breakingApi: false,
    executor: 'ai+human',
    tone: 'warn',
  },
  {
    id: 'CS-03',
    versionId: 'VER-03',
    title: 'CloudEvents 1.0 事件信封与新旧双发兼容',
    changeType: '变更',
    module: '消息投递',
    relatedIds: ['REQ-2406', 'TASK-2417', 'API-11', 'API-12', 'BUG-1049', 'BUG-1050'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '关闭 event.cloudevents.dual-write 开关，仅发旧协议；已切换的 5 个下游需同步回退消费端',
    riskLevel: 'high',
    reviewerIds: ['u-yan', 'u-shen'],
    mrIds: ['MR-2417'],
    linesAdded: 1760,
    linesDeleted: 2980,
    apiChanged: true,
    breakingApi: false,
    executor: 'ai',
    tone: 'indigo',
  },
  {
    id: 'CS-04',
    versionId: 'VER-03',
    title: '死信队列回放工具与回放成功率监控',
    changeType: '新增',
    module: '运维工具',
    relatedIds: ['REQ-2406', 'TASK-2418', 'API-12', 'BUG-1051'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '工具为旁路能力，关闭 dlq.replay.enabled 即停用，不影响主链路',
    riskLevel: 'low',
    reviewerIds: ['u-shen', 'u-meng'],
    mrIds: ['MR-2418'],
    linesAdded: 1120,
    linesDeleted: 160,
    apiChanged: false,
    breakingApi: false,
    executor: 'ai',
    tone: 'ok',
  },
  {
    id: 'CS-05',
    versionId: 'VER-04',
    title: '订单创建链路重构：幂等两级校验 + 库存扣减事务边界收敛与补偿回滚',
    changeType: '新增',
    module: '幂等',
    relatedIds: ['REQ-2401', 'TASK-2401', 'TASK-2403', 'API-01', 'API-04', 'API-08', 'BUG-1045'],
    dbMigration: true,
    migrationScript: 'V2401__add_order_idempotency_uk.sql',
    rollbackPlan: '回滚镜像至 v2.4.0 并关闭 idempotency.enabled 开关；补偿分支由 order.saga.compensate.enabled 独立控制，可单独关闭',
    riskLevel: 'high',
    reviewerIds: ['u-yan', 'u-lin'],
    mrIds: ['MR-2401', 'MR-2403'],
    linesAdded: 6540,
    linesDeleted: 3160,
    apiChanged: true,
    breakingApi: false,
    executor: 'ai+human',
    tone: 'brand',
  },
  {
    id: 'CS-06',
    versionId: 'VER-04',
    title: '本地消息表 outbox 落库与中继投递（指数退避最多 6 次）',
    changeType: '新增',
    module: '消息投递',
    relatedIds: ['REQ-2401', 'TASK-2402', 'API-11'],
    dbMigration: true,
    migrationScript: 'V2402__create_outbox_event.sql',
    rollbackPlan: '停止中继线程并清理 outbox 未投递记录，回落同步外发；已投递消息不受影响',
    riskLevel: 'high',
    reviewerIds: ['u-yan'],
    mrIds: ['MR-2402'],
    linesAdded: 2140,
    linesDeleted: 380,
    apiChanged: false,
    breakingApi: false,
    executor: 'ai',
    tone: 'brand',
  },
  {
    id: 'CS-07',
    versionId: 'VER-04',
    title: '统一状态机组件实现（替换散落在 6 个服务中的 if-else 判断）',
    changeType: '新增',
    module: '状态机',
    relatedIds: ['REQ-2402', 'TASK-2406', 'API-05', 'BUG-1046'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '开启 order.state.legacy.enabled=true 回退到旧 if-else 分支；状态机组件与旧分支在 rc1 中并存一个迭代',
    riskLevel: 'medium',
    reviewerIds: ['u-yan', 'u-su'],
    mrIds: ['MR-2406'],
    linesAdded: 5240,
    linesDeleted: 2860,
    apiChanged: true,
    breakingApi: true,
    executor: 'ai+human',
    tone: 'indigo',
  },
  {
    id: 'CS-08',
    versionId: 'VER-04',
    title: 'order_state_log 按月分区表与状态变更审计流水',
    changeType: '新增',
    module: '数据库',
    relatedIds: ['REQ-2402', 'TASK-2408', 'API-06', 'API-12', 'BUG-1055'],
    dbMigration: true,
    migrationScript: 'V2408__create_order_state_log_partition.sql',
    rollbackPlan: '关闭审计写入开关后 DROP 分区表；审计为旁路能力，回退不影响状态流转主链路（但会失去 BUG-1055 的异步化收益）',
    riskLevel: 'medium',
    reviewerIds: ['u-he', 'u-yan'],
    mrIds: [],
    linesAdded: 940,
    linesDeleted: 60,
    apiChanged: true,
    breakingApi: false,
    executor: 'ai+human',
    tone: 'indigo',
  },
  {
    id: 'CS-09',
    versionId: 'VER-04',
    title: 'Redis 7 多级缓存（Caffeine + Redis 集群）与 binlog 主动失效',
    changeType: '新增',
    module: '缓存',
    relatedIds: ['REQ-2404', 'TASK-2412', 'API-02', 'BUG-1048'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '关闭 order.cache.multilevel.enabled，回落单级 Redis 缓存；Canal 订阅链路可独立停止',
    riskLevel: 'medium',
    reviewerIds: ['u-yan'],
    mrIds: ['MR-2412'],
    linesAdded: 2360,
    linesDeleted: 780,
    apiChanged: false,
    breakingApi: false,
    executor: 'ai+human',
    tone: 'info',
  },
  {
    id: 'CS-10',
    versionId: 'VER-04',
    title: '订单号基因分片与 16 库 × 64 表路由改造',
    changeType: '变更',
    module: '数据库',
    relatedIds: ['REQ-2404', 'TASK-2413', 'API-03', 'BUG-1047'],
    dbMigration: true,
    migrationScript: 'V2413__shard_order_by_gene_key.sql',
    rollbackPlan: '一键回切脚本切回旧集群读写（DNS + 配置中心双通道），RTO ≤ 10 分钟，已演练 2 次',
    riskLevel: 'high',
    reviewerIds: ['u-yan', 'u-lin', 'u-meng'],
    mrIds: ['MR-2413'],
    linesAdded: 1980,
    linesDeleted: 1460,
    apiChanged: false,
    breakingApi: true,
    executor: 'ai+human',
    tone: 'warn',
  },
  {
    id: 'CS-11',
    versionId: 'VER-04',
    title: '订单列表游标分页 + 虚拟滚动（前端性能改造）',
    changeType: '变更',
    module: '订单查询',
    relatedIds: ['REQ-2404', 'TASK-2414', 'API-03', 'BUG-1047'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '前端回滚至 v2.4.0 静态资源包，恢复 offset 分页；后端 API-03 在兼容期内同时接受 page 与 cursor 参数',
    riskLevel: 'low',
    reviewerIds: ['u-su', 'u-yan'],
    mrIds: ['MR-2414'],
    linesAdded: 2240,
    linesDeleted: 1180,
    apiChanged: true,
    breakingApi: true,
    executor: 'ai+human',
    tone: 'teal',
  },
  {
    id: 'CS-12',
    versionId: 'VER-04',
    title: '历史订单全量迁移作业（断点续传）与双写开关',
    changeType: '新增',
    module: '数据库',
    relatedIds: ['REQ-2407', 'TASK-2419', 'TASK-2420', 'API-14'],
    dbMigration: true,
    migrationScript: 'V2419__migrate_order_to_shard_cluster.sql',
    rollbackPlan: '迁移作业支持断点续传与随时暂停；写失败自动降级为单写并告警；配一键回切脚本，RTO ≤ 10 分钟',
    riskLevel: 'high',
    reviewerIds: ['u-meng', 'u-yan', 'u-lin'],
    mrIds: ['MR-2419'],
    linesAdded: 3020,
    linesDeleted: 320,
    apiChanged: false,
    breakingApi: false,
    executor: 'ai+human',
    tone: 'warn',
  },
  {
    id: 'CS-13',
    versionId: 'VER-04',
    title: '优惠规则引擎三段模型 + BigDecimal 分摊精度 + ruleVersion 强一致',
    changeType: '新增',
    module: '优惠核销',
    relatedIds: ['REQ-2403', 'TASK-2409', 'TASK-2410', 'TASK-2411', 'API-07', 'API-08', 'API-09', 'BUG-1043'],
    dbMigration: false,
    migrationScript: '',
    rollbackPlan: '关闭 promo.engine.enabled 回落 v2.3 的旧计价链路；ruleVersion 强一致校验由 promo.ruleversion.strict 独立控制',
    riskLevel: 'high',
    reviewerIds: ['u-su', 'u-yan', 'u-he'],
    mrIds: ['MR-2409', 'MR-2410', 'MR-2411'],
    linesAdded: 10780,
    linesDeleted: 5140,
    apiChanged: true,
    breakingApi: false,
    executor: 'ai+human',
    tone: 'danger',
  },
  {
    id: 'CS-14',
    versionId: 'VER-05',
    title: '敏感字段 SM4 加密、展示脱敏与导出二次授权及审计留痕',
    changeType: '新增',
    module: '数据合规',
    relatedIds: ['REQ-2408', 'TASK-2422', 'TASK-2423', 'TASK-2424', 'API-13', 'BUG-1052', 'BUG-1054'],
    dbMigration: true,
    migrationScript: 'V2422__encrypt_order_pii_fields.sql',
    rollbackPlan: 'KMS 密钥版本回退 + 关闭 order.pii.encrypt.enabled；密文数据保留不回滚，脱敏视图可继续提供只读访问',
    riskLevel: 'high',
    reviewerIds: ['u-lin', 'u-yan'],
    mrIds: [],
    linesAdded: 1180,
    linesDeleted: 240,
    apiChanged: true,
    breakingApi: false,
    executor: 'ai+human',
    tone: 'pink',
  },
];

/** 发布日历项 */
export interface ReleaseCalendarItem {
  id: string;
  date: string;
  /** 关联版本；跨版本的组织级事项（如封网、依赖方联调）为 null */
  versionId: string | null;
  eventType: '版本冻结' | '灰度发布' | '全量发布' | '回滚窗口' | '大促封网' | '依赖方联调' | '安全扫描窗口';
  title: string;
  /** 责任人（USERS.id） */
  owner: string;
  /** 涉及环境（./data 的 ENVIRONMENTS.id） */
  envIds: string[];
  tone: Tone;
  allDay: boolean;
  /** 执行主体 */
  executor: Executor;
  /** 与其他日历项冲突时的说明；无冲突为空串 */
  conflictNote: string;
  /** AI 给出的冲突消解建议；无冲突为空串 */
  aiResolution: string;
}

/**
 * 12 条发布日历项，覆盖 2026-01-30 ~ 2026-04-10，7 类事件全部出现。
 * 两组冲突：
 *   冲突 A —— CAL-09（DBA 生产迁移窗口）与 CAL-10（REL-2403 灰度批次 1）同为 2026-03-20 且同为 env-prod；
 *   冲突 B —— CAL-12（v3.0 全量发布 2026-04-10）落在 CAL-11（618 大促预备封网 2026-04-01 ~ 04-20）期内。
 */
export const RELEASE_CALENDAR: ReleaseCalendarItem[] = [
  {
    id: 'CAL-01',
    date: '2026-01-30',
    versionId: 'VER-01',
    eventType: '全量发布',
    title: 'v2.2 会员中心一期全量上线',
    owner: 'u-meng',
    envIds: ['env-prod'],
    tone: 'ok',
    allDay: false,
    executor: 'ai+human',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-02',
    date: '2026-02-13',
    versionId: 'VER-02',
    eventType: '灰度发布',
    title: 'REL-2401 订单查询读扩容与慢 SQL 治理（10% → 100%）',
    owner: 'u-meng',
    envIds: ['env-prod'],
    tone: 'ok',
    allDay: false,
    executor: 'ai',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-03',
    date: '2026-02-26',
    versionId: 'VER-02',
    eventType: '版本冻结',
    title: 'v2.3 支付渠道统一接入代码冻结（commit d41b8e0）',
    owner: 'u-meng',
    envIds: ['env-staging'],
    tone: 'ok',
    allDay: false,
    executor: 'human',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-04',
    date: '2026-02-27',
    versionId: 'VER-02',
    eventType: '灰度发布',
    title: 'REL-2402 优惠规则引擎试算链路灰度（1% → 10% → 30% → 100%）',
    owner: 'u-meng',
    envIds: ['env-prod'],
    tone: 'warn',
    allDay: false,
    executor: 'ai+human',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-05',
    date: '2026-02-28',
    versionId: 'VER-02',
    eventType: '回滚窗口',
    title: 'REL-2402 全量后 24 小时回滚观察窗（BUG-1043 资损告警复核）',
    owner: 'u-meng',
    envIds: ['env-prod'],
    tone: 'warn',
    allDay: true,
    executor: 'human',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-06',
    date: '2026-03-13',
    versionId: 'VER-03',
    eventType: '全量发布',
    title: 'v2.4 订单领域事件标准化与死信回放能力全量上线',
    owner: 'u-shen',
    envIds: ['env-prod'],
    tone: 'ok',
    allDay: false,
    executor: 'ai',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-07',
    date: '2026-03-18',
    versionId: 'VER-04',
    eventType: '版本冻结',
    title: 'v3.0-rc1 代码冻结（commit f19d6c0，含 6 条需求 / 18 个任务）',
    owner: 'u-yan',
    envIds: ['env-staging'],
    tone: 'brand',
    allDay: false,
    executor: 'human',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-08',
    date: '2026-03-19',
    versionId: 'VER-04',
    eventType: '安全扫描窗口',
    title: 'v3.0-rc1 安全合规扫描与 SEC-2026-08 脱敏项复核',
    owner: 'u-he',
    envIds: ['env-staging'],
    tone: 'info',
    allDay: false,
    executor: 'ai',
    conflictNote: '',
    aiResolution: '',
  },
  {
    id: 'CAL-09',
    date: '2026-03-20',
    versionId: null,
    eventType: '依赖方联调',
    title: 'DBA 生产迁移窗口（BLOCK-0312 待批复，已阻塞 7 天）',
    owner: 'u-zhou',
    envIds: ['env-prod'],
    tone: 'danger',
    allDay: false,
    executor: 'human',
    conflictNote:
      '与 CAL-10 同日、同环境（env-prod）争用 order-db 连接池与 DBA 值班资源；且迁移未完成时 CAL-10 的批次 1 准入条件「TASK-2419 / TASK-2420 完成」不成立',
    aiResolution:
      '两个事项存在硬前置依赖而非单纯资源争用，不可并行。建议 03-20 当日只保留迁移窗口（CAL-09），把 CAL-10 的 REL-2403 整体顺延至 03-26 22:00；' +
      '同时把窗口审批改为「默认放行 + 事后审计」：由 ag-ops 基于预生产 3 轮零差异比对结果生成风险签核单，DBA 只需在 4 小时内否决，避免审批悬置继续消耗窗口',
  },
  {
    id: 'CAL-10',
    date: '2026-03-20',
    versionId: 'VER-04',
    eventType: '灰度发布',
    title: 'REL-2403 生产切流批次 1（1%）：新分片集群读写切换',
    owner: 'u-meng',
    envIds: ['env-prod'],
    tone: 'danger',
    allDay: false,
    executor: 'human',
    conflictNote:
      '与 CAL-09 迁移窗口同日冲突；且 G3（单测覆盖率 71.4% < 85%）与 G4（用例执行率 62%）门禁未通过，REL-2403 当前为 blocked 态，PIPE-2410 预检 6 项仅通过 4 项',
    aiResolution:
      '建议顺延至 2026-03-26 22:00（与孟星回在 REL-2403 批次 2 的书面建议一致）：03-20 执行迁移窗口，03-23 前完成 G3 覆盖率补齐（62 条 AI 边界用例合入）与 G4 剩余 54 组金额边界用例回归，' +
      '03-26 按 1% → 10% → 50% → 100% 四批灰度。若 03-23 覆盖率仍 < 80%，则把 REQ-2405 拆单能力移出 rc1，将发布窗口进一步顺延至 04-08 并同步指导委员会',
  },
  {
    id: 'CAL-11',
    date: '2026-04-01',
    versionId: null,
    eventType: '大促封网',
    title: '618 大促预备期封网（2026-04-01 ~ 2026-04-20，禁止非紧急生产变更）',
    owner: 'u-lin',
    envIds: ['env-prod'],
    tone: 'danger',
    allDay: true,
    executor: 'human',
    conflictNote: '封网期覆盖了 CAL-12（v3.0 全量发布，2026-04-10）以及 VER-04 顺延后的 04-08 备选窗口',
    aiResolution:
      '两条可行路径：① 把 v3.0 全量发布提前到封网前的 2026-03-30，前提是 REL-2403 在 03-26 灰度成功且观察期压缩到 72 小时（需 SH-07 批准缩短观察期）；' +
      '② 保持 04-10 不变并申请「大促容量类紧急变更豁免」——本次重构本身就是 618 容量达标的前置条件，符合豁免口径，但需安全合规部（SH-09）与会签。' +
      'AI 推荐路径 ②：路径 ① 的观察期压缩会把资损风险敞口放大到封网期内，一旦出现问题将在封网期间无法回滚',
  },
  {
    id: 'CAL-12',
    date: '2026-04-10',
    versionId: 'VER-05',
    eventType: '全量发布',
    title: 'v3.0 订单中心重构正式版本全量发布',
    owner: 'u-lin',
    envIds: ['env-prod'],
    tone: 'warn',
    allDay: false,
    executor: 'ai+human',
    conflictNote: '落在 CAL-11 的大促预备封网期（2026-04-01 ~ 04-20）内，需紧急变更豁免或顺延至 2026-04-22',
    aiResolution:
      '按 CAL-11 的建议走「大促容量类紧急变更豁免」路径：由顾时衍在 2026-03-27 前提交豁免申请，附 v3.0-rc1 灰度四批的完整观察记录与一键回切演练结果（RTO 10 分钟）；' +
      '若豁免未获批准，则顺延至 2026-04-22（封网结束后第一个工作日），并同步把 MS-06 里程碑基线由 04-24 调整为 04-28，仍在项目 endDate 之内',
  },
];

/** 版本对比中的条目摘录 */
export interface VersionDiffItem {
  id: string;
  title: string;
  tone: Tone;
}

/** 版本对比中被移出的条目 */
export interface VersionDiffRemovedItem {
  id: string;
  title: string;
  reason: string;
}

/** 版本对比的指标变化 */
export interface VersionMetricDelta {
  metric: string;
  from: number;
  to: number;
  /** (to − from) ÷ from × 100，保留 1 位小数 */
  deltaPct: number;
  dir: 'up' | 'down';
  /** 该变化方向对业务是否有利 */
  good: boolean;
}

/** 版本对比的差异汇总 */
export interface VersionDiffSummary {
  addedFeatures: number;
  changedFeatures: number;
  removedFeatures: number;
  fixedBugs: number;
  newApis: number;
  breakingApis: number;
  dbMigrations: number;
}

/** 版本对比（相邻版本） */
export interface VersionDiffDef {
  id: string;
  fromVersionId: string;
  toVersionId: string;
  summary: VersionDiffSummary;
  /** 新增的重点条目摘录 */
  addedItems: VersionDiffItem[];
  /** 被移出版本基线的条目（与 VERSION_BASELINES.excludedItems 对应） */
  removedItems: VersionDiffRemovedItem[];
  metricDelta: VersionMetricDelta[];
  aiCompatibilityRisk: 'low' | 'medium' | 'high';
  /** AI 的迁移与兼容建议（2-3 句） */
  aiMigrationAdvice: string;
  generatedBy: string;
  generatedAt: string;
}

/**
 * 4 组相邻版本对比：v2.2→v2.3、v2.3→v2.4、v2.4→v3.0-rc1、v3.0-rc1→v3.0。
 * summary 由目标版本的 CHANGE_SETS 聚合而来（口径见文件头 H 节）；
 * metricDelta 的 deltaPct / dir / good 三者互相自洽，其中 v2.2→v2.3 的三项指标直接取自
 * ./data 中 REL-2401 的实测记录（读副本 16 → 24、慢 SQL 治理 7 条、列表 P95 286ms → 214ms）。
 */
export const VERSION_DIFFS: VersionDiffDef[] = [
  {
    id: 'VD-01',
    fromVersionId: 'VER-01',
    toVersionId: 'VER-02',
    summary: {
      addedFeatures: 1,
      changedFeatures: 1,
      removedFeatures: 0,
      fixedBugs: 0,
      newApis: 1,
      breakingApis: 0,
      dbMigrations: 0,
    },
    addedItems: [
      { id: 'REL-2401', title: '订单查询服务读扩容与慢 SQL 治理', tone: 'ok' },
      { id: 'REL-2402', title: '优惠规则引擎灰度接入（仅试算链路）', tone: 'warn' },
      { id: 'API-07', title: '优惠试算', tone: 'info' },
    ],
    removedItems: [],
    metricDelta: [
      { metric: '支付渠道数（个）', from: 1, to: 3, deltaPct: 200.0, dir: 'up', good: true },
      { metric: '订单列表 P95 延迟（ms）', from: 286, to: 214, deltaPct: -25.2, dir: 'down', good: true },
      { metric: 'order-query 读副本数（个）', from: 16, to: 24, deltaPct: 50.0, dir: 'up', good: true },
      { metric: '慢 SQL 条数（条）', from: 11, to: 4, deltaPct: -63.6, dir: 'down', good: true },
      { metric: '对账差错自动处理率（%）', from: 61, to: 92.4, deltaPct: 51.5, dir: 'up', good: true },
    ],
    aiCompatibilityRisk: 'low',
    aiMigrationAdvice:
      '本次为纯增量升级，无破坏性变更，客户端无需改造。唯一需要注意的是新增的 channelType 枚举值 UNIONPAY：使用强类型枚举反序列化的下游需先升级 SDK，否则会遇到未知枚举值异常。' +
      '优惠试算链路通过 promo.engine.enabled 开关灰度，出现异常可在 3 分钟内回落旧计价链路。',
    generatedBy: 'ag-ops',
    generatedAt: '2026-02-28 09:20',
  },
  {
    id: 'VD-02',
    fromVersionId: 'VER-02',
    toVersionId: 'VER-03',
    summary: {
      addedFeatures: 1,
      changedFeatures: 1,
      removedFeatures: 0,
      fixedBugs: 3,
      newApis: 1,
      breakingApis: 0,
      dbMigrations: 0,
    },
    addedItems: [
      { id: 'REQ-2406', title: '订单领域事件标准化外发（RabbitMQ）', tone: 'indigo' },
      { id: 'TASK-2418', title: '死信队列回放工具与成功率监控', tone: 'ok' },
      { id: 'API-12', title: 'order.state.changed 事件', tone: 'info' },
    ],
    removedItems: [],
    metricDelta: [
      { metric: '下游事件协议数（个）', from: 12, to: 1, deltaPct: -91.7, dir: 'down', good: true },
      { metric: '死信回放成功率（%）', from: 87.3, to: 99.6, deltaPct: 14.1, dir: 'up', good: true },
      { metric: '事件信封字段完整率（%）', from: 74, to: 100, deltaPct: 35.1, dir: 'up', good: true },
      { metric: '消息积压峰值（条）', from: 8600, to: 1240, deltaPct: -85.6, dir: 'down', good: true },
    ],
    aiCompatibilityRisk: 'low',
    aiMigrationAdvice:
      '兼容期内新旧事件双发，下游可按队列维度自主决定切换节奏，无需与本次发布同步上线。' +
      '切换时需特别注意 time 字段：v2.4 起统一携带 +08:00 时区偏移，若下游此前自行补 8 小时，切换后会出现重复偏移（BUG-1050 的镜像问题）。' +
      '旧协议将在 3 个月兼容期届满后下线，建议下游在 2026-06-13 前完成切换。',
    generatedBy: 'ag-ops',
    generatedAt: '2026-03-13 10:05',
  },
  {
    id: 'VD-03',
    fromVersionId: 'VER-03',
    toVersionId: 'VER-04',
    summary: {
      addedFeatures: 7,
      changedFeatures: 2,
      removedFeatures: 0,
      fixedBugs: 7,
      newApis: 5,
      breakingApis: 3,
      dbMigrations: 5,
    },
    addedItems: [
      { id: 'REQ-2401', title: '订单创建链路重构：幂等下单与本地消息表保障一致性', tone: 'brand' },
      { id: 'REQ-2402', title: '订单状态机统一治理：可配置流转与状态变更审计', tone: 'indigo' },
      { id: 'REQ-2403', title: '优惠计算下沉：券、满减、会员价叠加规则引擎化', tone: 'danger' },
      { id: 'REQ-2404', title: '订单查询性能达标：3000 TPS 且 P99 < 200ms', tone: 'info' },
      { id: 'REQ-2405', title: '多仓多商家拆单与合单能力', tone: 'teal' },
      { id: 'REQ-2407', title: '历史订单数据迁移与双写校验', tone: 'warn' },
      { id: 'API-01', title: '创建订单（幂等）', tone: 'brand' },
      { id: 'API-10', title: '拆单预演', tone: 'teal' },
    ],
    removedItems: [
      { id: 'REQ-2408', title: '订单数据合规：字段脱敏与操作审计留痕', reason: '依赖 SEC-MASK-2.1 组件接入排队至 2026-04-02，顺延至 v3.0' },
      { id: 'TASK-2421', title: '生产切流发布单 REL-2403：新分片集群读写切换', reason: 'BLOCK-0312 迁移窗口未批复，切流动作剥离至 v3.0 全量窗口执行' },
      { id: 'TASK-2422', title: '敏感字段 SM4 加密与 KMS 密钥托管接入', reason: '随 REQ-2408 一并移出' },
      { id: 'TASK-2423', title: '展示脱敏与导出二次授权', reason: '随 REQ-2408 一并移出' },
      { id: 'TASK-2424', title: '查询/导出行为审计留痕与越权告警', reason: 'state 停留在 backlog，未进入 rc1 冻结范围' },
      { id: 'TASK-2417', title: 'CloudEvents 1.0 事件信封与新旧双发兼容', reason: '已随 v2.4 于 2026-03-09 先行上线，从 rc1 基线剔除' },
      { id: 'TASK-2418', title: '死信队列回放工具与成功率监控', reason: '已随 v2.4 于 2026-03-13 先行上线，从 rc1 基线剔除' },
    ],
    metricDelta: [
      { metric: '订单创建 P99 延迟（ms）', from: 486, to: 198, deltaPct: -59.3, dir: 'down', good: true },
      { metric: '订单列表 P95 延迟（ms）', from: 342, to: 176, deltaPct: -48.5, dir: 'down', good: true },
      { metric: '峰值承载能力（TPS）', from: 1200, to: 3000, deltaPct: 150.0, dir: 'up', good: true },
      { metric: '单测覆盖率（%）', from: 64.8, to: 71.4, deltaPct: 10.2, dir: 'up', good: true },
      { metric: '缺陷密度（个/KLOC）', from: 0.74, to: 0.61, deltaPct: -17.6, dir: 'down', good: true },
      { metric: '重复下单率（笔/万笔）', from: 4.7, to: 0, deltaPct: -100.0, dir: 'down', good: true },
      { metric: '订单库分片数（个）', from: 1, to: 1024, deltaPct: 102300.0, dir: 'up', good: true },
    ],
    aiCompatibilityRisk: 'high',
    aiMigrationAdvice:
      '三项破坏性变更必须提前通知下游：① 非法状态流转从「静默忽略」改为返回 ORDER_STATE_ILLEGAL，所有调用状态流转接口的服务需增加错误码分支处理；' +
      '② 订单号内嵌用户基因位，任何按旧规则从订单号解析用户维度的下游都会失配，需改用 API-02 的显式查询；' +
      '③ 订单列表 offset 分页废弃，page 参数会返回 PAGE_PARAM_DEPRECATED，需切换到 cursor 游标分页。' +
      '数据库侧有 5 项迁移（幂等唯一索引、outbox 表、状态流水分区表、基因分片、全量迁移），其中基因分片与全量迁移必须在同一个 DBA 窗口内串行执行，不可拆分。' +
      '建议下游在 2026-03-26 灰度批次 1（1%）之前完成兼容性改造，并在 3 个月兼容期内保留回落开关。',
    generatedBy: 'ag-arch',
    generatedAt: '2026-03-18 21:40',
  },
  {
    id: 'VD-04',
    fromVersionId: 'VER-04',
    toVersionId: 'VER-05',
    summary: {
      addedFeatures: 1,
      changedFeatures: 0,
      removedFeatures: 0,
      fixedBugs: 2,
      newApis: 1,
      breakingApis: 0,
      dbMigrations: 1,
    },
    addedItems: [
      { id: 'REQ-2408', title: '订单数据合规：字段脱敏与操作审计留痕', tone: 'pink' },
      { id: 'TASK-2421', title: '生产切流发布单 REL-2403：新分片集群读写切换', tone: 'danger' },
      { id: 'TASK-2422', title: '敏感字段 SM4 加密与 KMS 密钥托管接入', tone: 'pink' },
      { id: 'TASK-2423', title: '展示脱敏与导出二次授权', tone: 'pink' },
      { id: 'TASK-2424', title: '查询/导出行为审计留痕与越权告警', tone: 'slate' },
      { id: 'API-13', title: '订单数据导出', tone: 'warn' },
    ],
    removedItems: [
      { id: 'REQ-2406', title: '订单领域事件标准化外发（RabbitMQ）', reason: '已随 v2.4（VER-03）于 2026-03-13 先行上线，v3.0 不再重复纳入' },
    ],
    metricDelta: [
      { metric: 'G3 单测覆盖率（%）', from: 71.4, to: 87.2, deltaPct: 22.1, dir: 'up', good: true },
      { metric: '合规审计覆盖率（%）', from: 62, to: 100, deltaPct: 61.3, dir: 'up', good: true },
      { metric: '越权访问拦截率（%）', from: 71, to: 100, deltaPct: 40.8, dir: 'up', good: true },
      { metric: '导出接口审计留痕率（%）', from: 43, to: 100, deltaPct: 132.6, dir: 'up', good: true },
      { metric: '订单库读写流量新集群占比（%）', from: 1, to: 100, deltaPct: 9900.0, dir: 'up', good: true },
    ],
    aiCompatibilityRisk: 'medium',
    aiMigrationAdvice:
      '本次以合规与切流为主，代码增量小但影响面大：导出接口新增二次授权前置校验，未携带审批单号的调用会直接返回 ORDER_EXPORT_UNAUTHORIZED，所有报表脚本与运营工具需在 04-10 前完成改造。' +
      '敏感字段改为 SM4 密文落库后，直连数据库的旧报表需切换到脱敏视图 order_pii_masked_view，KMS 密钥版本回退是唯一的数据侧回滚手段，密文本身不做反向解密回滚。' +
      '生产切流按四批灰度执行，任一批次出现双写差异或资损告警即刻触发一键回切（RTO ≤ 10 分钟），建议在封网豁免获批后再启动，避免封网期内无法回滚。',
    generatedBy: 'ag-arch',
    generatedAt: '2026-03-19 09:15',
  },
];

/** 迭代 id → 「Sprint 名 · 主题」标签（供团队效能与需求池排期展示使用） */
export const SPRINT_LABEL_MAP: Record<string, string> = SPRINTS.reduce<Record<string, string>>((acc, s) => {
  acc[s.id] = `${s.name} · ${s.theme}`;
  return acc;
}, {});
