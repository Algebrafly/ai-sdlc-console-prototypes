/**
 * ============================================================
 * AI 研发协作控制台 · 原型数据层
 * ------------------------------------------------------------
 * 唯一贯穿主线：「订单中心重构」（EPIC-ORDER-REF）
 * 当前迭代：Sprint 24（2026-03-02 ~ 2026-03-27）
 * 技术栈：Java 17 + Spring Boot 3.3 / Vue 3 + TypeScript 5 /
 *         MySQL 8.0 + Redis 7.2 / RabbitMQ 3.13
 * 说明：所有 id 之间交叉引用保持一致，日期统一落在 2026-03。
 * ============================================================
 */

/* ============================================================
 * 0. 通用类型定义
 * ============================================================ */

/** 语义色标识，与 style.css 的 ac-tag--{tone} / ac-avatar--{tone} 对齐 */
export type Tone = 'brand' | 'ai' | 'ok' | 'warn' | 'danger' | 'info' | 'neutral'
  | 'slate' | 'teal' | 'pink' | 'indigo' | 'amber';

/** 执行主体：AI 智能体 / 人 / 人机协同 */
export type Executor = 'ai' | 'human' | 'ai+human';

/** 角色定义 */
export interface RoleDef {
  id: string;
  name: string;
  short: string;
  initial: string;
  color: Tone;
  tagTone: Tone;
  desc: string;
  focusPages: string[];
  /** 该角色的默认落地页 */
  homePage: string;
}

/** 团队成员 */
export interface UserDef {
  id: string;
  name: string;
  initial: string;
  account: string;
  title: string;
  dept: string;
  email: string;
  roleId: string;
  avatarColor: Tone;
  /** 本迭代承接故事点 */
  capacity: number;
  /** 技能标签 */
  skills: string[];
  isAi?: boolean;
}

/** 迭代 */
export interface SprintDef {
  id: string;
  name: string;
  theme: string;
  startDate: string;
  endDate: string;
  status: 'done' | 'active' | 'planned';
  statusLabel: string;
  tone: Tone;
  progress: number;
  capacity: number;
  committed: number;
  completed: number;
  memberIds: string[];
  goal: string;
}

/** SDLC 环节 */
export interface SdlcStage {
  id: string;
  code: string;
  name: string;
  order: number;
  desc: string;
  ownerRoleId: string;
  agentIds: string[];
  tools: string[];
  inputs: string[];
  outputs: string[];
  gateId: string;
  tone: Tone;
  /** 本迭代该环节的完成度（0-100） */
  progress: number;
}

/** 任务状态机节点（10 态） */
export interface TaskStateDef {
  id: string;
  code: string;
  name: string;
  order: number;
  tone: Tone;
  /** 允许流转到的下一状态 */
  nextStates: string[];
  /** SLA 时限（小时），超时进入预警 */
  slaHours: number;
  /** 由谁推进 */
  driver: Executor;
  desc: string;
  /** PingCode 侧对应状态名 */
  pingcodeName: string;
}

/* ============================================================
 * 1. 当前登录人与角色
 * ============================================================ */

/** 当前登录用户（原型固定为研发总监 林知远） */
export const CURRENT_USER = {
  id: 'u-lin',
  name: '林知远',
  initial: '林',
  account: 'lin.zhiyuan',
  title: '研发总监 · 平台架构负责人',
  dept: '技术中心 / 数字化研发部',
  email: 'lin.zhiyuan@artisan-tech.com',
  avatarColor: 'brand' as Tone,
  /** 默认扮演角色：管理者 */
  defaultRoleId: 'manager',
  lastLoginAt: '2026-03-19 08:52',
  loginIp: '10.24.18.63',
  mfaEnabled: true,
};

/** 7 个可切换角色视角（覆盖设计方案 4.1 的角色矩阵） */
export const ROLES: RoleDef[] = [
  {
    id: 'manager',
    name: '研发管理者',
    short: '管理者',
    initial: '管',
    color: 'brand',
    tagTone: 'brand',
    desc: '关注交付速率、缺陷密度、发布成功率与人力成本，做资源与优先级决策',
    focusPages: ['overview', 'insight', 'ai-observe'],
    homePage: 'overview',
  },
  {
    id: 'product',
    name: '产品经理',
    short: '产品',
    initial: '产',
    color: 'ai',
    tagTone: 'ai',
    desc: '负责需求澄清 Brainstorm、PRD 版本管理与验收标准定义',
    focusPages: ['requirement', 'overview', 'insight'],
    homePage: 'requirement',
  },
  {
    id: 'architect',
    name: '架构师',
    short: '架构',
    initial: '架',
    color: 'indigo',
    tagTone: 'brand',
    desc: '负责系统架构设计、任务拆解粒度、技术选型与接口契约冻结',
    focusPages: ['design', 'requirement', 'coding'],
    homePage: 'design',
  },
  {
    id: 'developer',
    name: '研发工程师',
    short: '研发',
    initial: '研',
    color: 'info',
    tagTone: 'info',
    desc: '认领任务、与 AI 结对编码、提交 PR 并处理评审意见',
    focusPages: ['board', 'coding', 'bug'],
    homePage: 'board',
  },
  {
    id: 'tester',
    name: '测试工程师',
    short: '测试',
    initial: '测',
    color: 'teal',
    tagTone: 'ok',
    desc: '维护用例库、执行测试计划、签发测试报告与缺陷验证',
    focusPages: ['test', 'bug', 'pipeline'],
    homePage: 'test',
  },
  {
    id: 'ops',
    name: '运维工程师',
    short: '运维',
    initial: '运',
    color: 'warn',
    tagTone: 'warn',
    desc: '负责 CI/CD 流水线、发布门禁、环境拓扑与线上观测',
    focusPages: ['pipeline', 'settings', 'ai-observe'],
    homePage: 'pipeline',
  },
  {
    id: 'pmo',
    name: '项目经理（PMO）',
    short: 'PMO',
    initial: '项',
    color: 'pink',
    tagTone: 'danger',
    desc: '负责排期甘特、依赖与冲突治理、里程碑与风险上报',
    focusPages: ['schedule', 'board', 'overview'],
    homePage: 'schedule',
  },
];

/* ============================================================
 * 2. 团队成员
 * ============================================================ */

/** 订单中心重构项目组全部成员（含 AI 智能体账号） */
export const USERS: UserDef[] = [
  {
    id: 'u-lin',
    name: '林知远',
    initial: '林',
    account: 'lin.zhiyuan',
    title: '研发总监',
    dept: '技术中心',
    email: 'lin.zhiyuan@artisan-tech.com',
    roleId: 'manager',
    avatarColor: 'brand',
    capacity: 8,
    skills: ['架构治理', 'DDD', '效能度量'],
  },
  {
    id: 'u-su',
    name: '苏文瑾',
    initial: '苏',
    account: 'su.wenjin',
    title: '高级产品经理',
    dept: '交易中台产品组',
    email: 'su.wenjin@artisan-tech.com',
    roleId: 'product',
    avatarColor: 'ai',
    capacity: 21,
    skills: ['交易域', 'PRD 撰写', '用户研究'],
  },
  {
    id: 'u-yan',
    name: '严慕舟',
    initial: '严',
    account: 'yan.muzhou',
    title: '首席架构师',
    dept: '平台架构组',
    email: 'yan.muzhou@artisan-tech.com',
    roleId: 'architect',
    avatarColor: 'indigo',
    capacity: 13,
    skills: ['Spring Boot 3', 'DDD', 'RabbitMQ', '分库分表'],
  },
  {
    id: 'u-zhou',
    name: '周浩然',
    initial: '周',
    account: 'zhou.haoran',
    title: '后端技术专家',
    dept: '订单中心研发组',
    email: 'zhou.haoran@artisan-tech.com',
    roleId: 'developer',
    avatarColor: 'info',
    capacity: 21,
    skills: ['Java 17', 'Spring Boot 3.3', 'MySQL 8', 'Redis 7'],
  },
  {
    id: 'u-chen',
    name: '陈屿',
    initial: '陈',
    account: 'chen.yu',
    title: '前端工程师',
    dept: '交易中台前端组',
    email: 'chen.yu@artisan-tech.com',
    roleId: 'developer',
    avatarColor: 'teal',
    capacity: 18,
    skills: ['Vue 3', 'TypeScript 5', 'Vite', 'Pinia'],
  },
  {
    id: 'u-he',
    name: '何斯年',
    initial: '何',
    account: 'he.sinian',
    title: '测试负责人',
    dept: '质量保障部',
    email: 'he.sinian@artisan-tech.com',
    roleId: 'tester',
    avatarColor: 'amber',
    capacity: 18,
    skills: ['接口自动化', 'JMeter', '测试设计'],
  },
  {
    id: 'u-meng',
    name: '孟星回',
    initial: '孟',
    account: 'meng.xinghui',
    title: 'SRE / 运维工程师',
    dept: '基础平台部',
    email: 'meng.xinghui@artisan-tech.com',
    roleId: 'ops',
    avatarColor: 'warn',
    capacity: 13,
    skills: ['Kubernetes', 'GitLab CI', 'Prometheus', 'SkyWalking'],
  },
  {
    id: 'u-gu',
    name: '顾时衍',
    initial: '顾',
    account: 'gu.shiyan',
    title: '项目经理（PMO）',
    dept: 'PMO 办公室',
    email: 'gu.shiyan@artisan-tech.com',
    roleId: 'pmo',
    avatarColor: 'pink',
    capacity: 13,
    skills: ['排期治理', '风险管理', 'PingCode'],
  },
  {
    id: 'u-shen',
    name: '沈亦白',
    initial: '沈',
    account: 'shen.yibai',
    title: '后端工程师',
    dept: '订单中心研发组',
    email: 'shen.yibai@artisan-tech.com',
    roleId: 'developer',
    avatarColor: 'slate',
    capacity: 21,
    skills: ['Java 17', 'RabbitMQ', 'Elasticsearch'],
  },
  {
    id: 'u-ai-copilot',
    name: 'Artisan Copilot',
    initial: 'AI',
    account: 'agent.copilot',
    title: 'AI 研发智能体（共享账号）',
    dept: 'AI 工程平台',
    email: 'agent@artisan-tech.com',
    roleId: 'developer',
    avatarColor: 'ai',
    capacity: 0,
    skills: ['代码生成', '代码评审', '测试用例', '根因分析'],
    isAi: true,
  },
];

/** 按 id 快速取成员（页面渲染头像/姓名时使用） */
export const USER_MAP: Record<string, UserDef> = USERS.reduce<Record<string, UserDef>>((acc, u) => {
  acc[u.id] = u;
  return acc;
}, {});

/** 按 id 快速取角色 */
export const ROLE_MAP: Record<string, RoleDef> = ROLES.reduce<Record<string, RoleDef>>((acc, r) => {
  acc[r.id] = r;
  return acc;
}, {});

/* ============================================================
 * 3. 迭代
 * ============================================================ */

/** 近 4 个迭代，SP-24 为当前主线迭代 */
export const SPRINTS: SprintDef[] = [
  {
    id: 'SP-22',
    name: 'Sprint 22',
    theme: '会员中心一期',
    startDate: '2026-01-05',
    endDate: '2026-01-30',
    status: 'done',
    statusLabel: '已归档',
    tone: 'neutral',
    progress: 100,
    capacity: 96,
    committed: 88,
    completed: 88,
    memberIds: ['u-su', 'u-yan', 'u-zhou', 'u-chen', 'u-he', 'u-meng'],
    goal: '完成会员等级、积分账户与权益中心的模型落地',
  },
  {
    id: 'SP-23',
    name: 'Sprint 23',
    theme: '支付渠道统一接入',
    startDate: '2026-02-02',
    endDate: '2026-02-27',
    status: 'done',
    statusLabel: '已归档',
    tone: 'ok',
    progress: 100,
    capacity: 96,
    committed: 92,
    completed: 89,
    memberIds: ['u-su', 'u-yan', 'u-zhou', 'u-shen', 'u-he', 'u-meng'],
    goal: '统一支付网关，接入微信/支付宝/银联三渠道并支持异步对账',
  },
  {
    id: 'SP-24',
    name: 'Sprint 24',
    theme: '订单中心重构',
    startDate: '2026-03-02',
    endDate: '2026-03-27',
    status: 'active',
    statusLabel: '进行中',
    tone: 'brand',
    progress: 68,
    capacity: 104,
    committed: 96,
    completed: 65,
    memberIds: ['u-lin', 'u-su', 'u-yan', 'u-zhou', 'u-chen', 'u-shen', 'u-he', 'u-meng', 'u-gu'],
    goal: '将单体 order-service 拆分为订单/履约/优惠三个限界上下文，引入状态机与幂等下单，支撑大促 3000 TPS',
  },
  {
    id: 'SP-25',
    name: 'Sprint 25',
    theme: '履约与售后链路',
    startDate: '2026-03-30',
    endDate: '2026-04-24',
    status: 'planned',
    statusLabel: '规划中',
    tone: 'info',
    progress: 0,
    capacity: 104,
    committed: 34,
    completed: 0,
    memberIds: ['u-su', 'u-yan', 'u-zhou', 'u-chen', 'u-he'],
    goal: '打通 WMS 履约回调与售后退款闭环，建立逆向物流跟踪',
  },
];

/** 当前迭代（贯穿全部页面的上下文） */
export const CURRENT_SPRINT = SPRINTS[2];

/* ============================================================
 * 4. SDLC 六环节
 * ============================================================ */

/** AI 研发生命周期六大环节（对应设计方案第 3 章） */
export const SDLC_STAGES: SdlcStage[] = [
  {
    id: 'st-req',
    code: 'S1',
    name: '需求澄清',
    order: 1,
    desc: '业务方口述 → AI Brainstorm 追问 → 结构化 PRD 与验收标准',
    ownerRoleId: 'product',
    agentIds: ['ag-pm'],
    tools: ['Brainstorm 对话', 'PRD 编辑器', 'PingCode 需求同步'],
    inputs: ['业务方口述纪要', '客户投诉记录', '历史 PRD'],
    outputs: ['PRD v2.3 基线', '用户故事 US-01~US-14', '验收标准'],
    gateId: 'G1',
    tone: 'ai',
    progress: 100,
  },
  {
    id: 'st-arch',
    code: 'S2',
    name: '架构设计',
    order: 2,
    desc: '限界上下文划分、组件与接口契约冻结、任务自动拆解',
    ownerRoleId: 'architect',
    agentIds: ['ag-arch'],
    tools: ['架构画布', 'OpenAPI 契约', '任务拆解器'],
    inputs: ['PRD v2.3 基线', '架构规范 KB-ARCH-01', '现有代码库索引'],
    outputs: ['四层架构视图', '14 份接口契约', '24 个开发任务'],
    gateId: 'G2',
    tone: 'brand',
    progress: 100,
  },
  {
    id: 'st-code',
    code: 'S3',
    name: '编码实现',
    order: 3,
    desc: 'AI 结对编码 → 单测同步生成 → 人工评审后合入主干',
    ownerRoleId: 'developer',
    agentIds: ['ag-code', 'ag-review'],
    tools: ['IDE 插件', 'AI 编码会话', 'GitLab MR', 'SonarQube'],
    inputs: ['任务卡 TASK-24xx', '接口契约', '编码规约 KB-CODE-02'],
    outputs: ['源代码 MR', '单元测试', '代码评审记录'],
    gateId: 'G3',
    tone: 'info',
    progress: 74,
  },
  {
    id: 'st-test',
    code: 'S4',
    name: '测试验证',
    order: 4,
    desc: 'AI 生成用例 → 测试计划执行 → 缺陷闭环 → 测试报告签发',
    ownerRoleId: 'tester',
    agentIds: ['ag-test'],
    tools: ['用例库', '接口自动化', 'JMeter 压测', '测试报告'],
    inputs: ['PRD 验收标准', '接口契约', '构建产物'],
    outputs: ['248 条用例执行结果', '12 个缺陷', '测试报告 TR-24'],
    gateId: 'G4',
    tone: 'teal',
    progress: 62,
  },
  {
    id: 'st-deploy',
    code: 'S5',
    name: '部署发布',
    order: 5,
    desc: '流水线构建 → 六道门禁 → 灰度分批 → 全量与回滚',
    ownerRoleId: 'ops',
    agentIds: ['ag-ops'],
    tools: ['GitLab CI', 'Argo Rollouts', 'Kubernetes', '飞书通知'],
    inputs: ['已冻结版本 tag', '发布申请单', '变更清单'],
    outputs: ['生产发布记录', '环境拓扑快照', '回滚预案'],
    gateId: 'G5',
    tone: 'warn',
    progress: 35,
  },
  {
    id: 'st-observe',
    code: 'S6',
    name: '运维观测',
    order: 6,
    desc: '指标/日志/链路三支柱采集，AI 根因分析与自愈建议',
    ownerRoleId: 'ops',
    agentIds: ['ag-ba', 'ag-ops'],
    tools: ['Prometheus', 'SkyWalking', 'Loki', 'AI 根因分析'],
    inputs: ['线上指标', '错误日志', '调用链 traceId'],
    outputs: ['告警事件', '根因分析报告', '技术债清单'],
    gateId: 'G6',
    tone: 'danger',
    progress: 20,
  },
];

/* ============================================================
 * 5. 任务状态机（10 态）
 * ============================================================ */

/** 工作项 10 状态机，与 PingCode 状态双向映射 */
export const TASK_STATES: TaskStateDef[] = [
  {
    id: 'backlog',
    code: 'T01',
    name: '需求池',
    order: 1,
    tone: 'neutral',
    nextStates: ['refined'],
    slaHours: 72,
    driver: 'human',
    desc: '需求进入池中等待评审与优先级排序，尚未纳入迭代',
    pingcodeName: '待评审',
  },
  {
    id: 'refined',
    code: 'T02',
    name: '已拆解',
    order: 2,
    tone: 'info',
    nextStates: ['taskCreated'],
    slaHours: 48,
    driver: 'human',
    desc: '需求已澄清并拆解为可执行工作项，等待创建开发任务',
    pingcodeName: '未开始',
  },
  {
    id: 'taskCreated',
    code: 'T03',
    name: '任务已创建',
    order: 3,
    tone: 'ai',
    nextStates: ['dev'],
    slaHours: 8,
    driver: 'ai',
    desc: '开发任务已在平台与 PingCode 双端创建并完成绑定',
    pingcodeName: '未开始',
  },
  {
    id: 'dev',
    code: 'T04',
    name: '开发中',
    order: 4,
    tone: 'brand',
    nextStates: ['testGreen', 'taskCreated'],
    slaHours: 48,
    driver: 'ai+human',
    desc: 'AI 与工程师结对编码，同步生成单元测试并提交 MR',
    pingcodeName: '处理中',
  },
  {
    id: 'testGreen',
    code: 'T05',
    name: '本地测试通过',
    order: 5,
    tone: 'teal',
    nextStates: ['committed', 'dev'],
    slaHours: 8,
    driver: 'ai+human',
    desc: '本地单测与静态检查全绿，具备提交条件',
    pingcodeName: '处理中',
  },
  {
    id: 'committed',
    code: 'T06',
    name: '已提交',
    order: 6,
    tone: 'info',
    nextStates: ['deployed', 'testGreen'],
    slaHours: 12,
    driver: 'ai+human',
    desc: '代码已合入主干并推送远端，等待流水线部署',
    pingcodeName: '处理中',
  },
  {
    id: 'deployed',
    code: 'T07',
    name: '已部署',
    order: 7,
    tone: 'brand',
    nextStates: ['qa'],
    slaHours: 4,
    driver: 'ai',
    desc: '流水线已自动部署到测试环境，等待自动化测试触发',
    pingcodeName: '处理中',
  },
  {
    id: 'qa',
    code: 'T08',
    name: '自动化测试中',
    order: 8,
    tone: 'warn',
    nextStates: ['released', 'bugfix'],
    slaHours: 12,
    driver: 'ai',
    desc: '自动化回归与质量门禁执行中，失败则转入缺陷修复',
    pingcodeName: '测试中',
  },
  {
    id: 'bugfix',
    code: 'T09',
    name: '缺陷修复中',
    order: 9,
    tone: 'danger',
    nextStates: ['testGreen', 'committed'],
    slaHours: 24,
    driver: 'ai+human',
    desc: '针对测试暴露的缺陷进行定位与修复，修复后回到测试环节',
    pingcodeName: '处理中',
  },
  {
    id: 'released',
    code: 'T10',
    name: '已发布',
    order: 10,
    tone: 'ok',
    nextStates: [],
    slaHours: 0,
    driver: 'ai',
    desc: '已随发布单上线生产，进入运维观测环节',
    pingcodeName: '已关闭',
  },
];

/** 状态 id → 定义 的映射 */
export const TASK_STATE_MAP: Record<string, TaskStateDef> = TASK_STATES.reduce<Record<string, TaskStateDef>>(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {},
);

/* ============================================================
 * 6. 需求（Requirement）
 * ============================================================ */

export interface RequirementDef {
  id: string;
  /** PingCode 工作项编号 */
  code: string;
  title: string;
  type: '功能需求' | '非功能需求' | '技术债' | '合规需求';
  priority: 'P0' | 'P1' | 'P2';
  status: 'backlog' | 'refined' | 'taskCreated' | 'dev' | 'testGreen' | 'committed' | 'deployed' | 'qa' | 'bugfix' | 'released';
  statusLabel: string;
  ownerId: string;
  storyPoints: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  sprintId: string;
  epicId: string;
  tags: string[];
  desc: string;
  acceptanceCriteria: string[];
  storyIds: string[];
  taskIds: string[];
  prdVersion: string;
  risk: 'high' | 'medium' | 'low';
  riskNote: string;
  /** 关联的架构组件 */
  componentIds: string[];
  /** AI 参与度 */
  aiAssist: number;
}

/** 订单中心重构（EPIC-ORDER-REF）下的 8 条需求 */
export const REQUIREMENTS: RequirementDef[] = [
  {
    id: 'REQ-2401',
    code: 'PC-ORD-1024',
    title: '订单创建链路重构：幂等下单与本地消息表保障一致性',
    type: '功能需求',
    priority: 'P0',
    status: 'qa',
    statusLabel: '自动化测试中',
    ownerId: 'u-su',
    storyPoints: 21,
    source: '2026 春节大促重复下单事故复盘（INC-2026-0131）',
    createdAt: '2026-02-18',
    updatedAt: '2026-03-18',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['交易域', '幂等', '分布式事务', 'P0'],
    desc: '将现有 order-service 的同步创建链路改造为「预校验 → 幂等落库 → 本地消息表 → 异步事件外发」四段式，消除超时重试导致的重复订单，并把库存扣减与优惠核销收敛到同一事务边界内。',
    acceptanceCriteria: [
      'AC1 相同 idempotencyKey 在 24h 内重复提交，服务端只产生一笔订单并返回首次结果',
      'AC2 库存扣减失败时订单自动回滚至 CLOSED，且不产生悬挂的优惠核销记录',
      'AC3 本地消息表投递失败时具备指数退避重试（最多 6 次）并触发告警',
      'AC4 单接口 P99 延迟 ≤ 200ms（3000 TPS 压测口径）',
      'AC5 下单接口幂等校验命中率、消息积压量在 Prometheus 中可观测',
    ],
    storyIds: ['US-01', 'US-02', 'US-03'],
    taskIds: ['TASK-2401', 'TASK-2402', 'TASK-2403', 'TASK-2404', 'TASK-2405'],
    prdVersion: 'PRD-ORD-v2.3',
    risk: 'high',
    riskNote: '涉及库存中心跨服务事务边界调整，需与仓储组联调；灰度期存在双写不一致风险',
    componentIds: ['ac-order-api', 'ac-order-domain', 'ac-idem-guard', 'ac-outbox-relay'],
    aiAssist: 72,
  },
  {
    id: 'REQ-2402',
    code: 'PC-ORD-1031',
    title: '订单状态机统一治理：可配置流转与状态变更审计',
    type: '功能需求',
    priority: 'P0',
    status: 'dev',
    statusLabel: '开发中',
    ownerId: 'u-su',
    storyPoints: 13,
    source: '业务方需求（客服系统状态不同步投诉 37 起）',
    createdAt: '2026-02-19',
    updatedAt: '2026-03-19',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['状态机', '交易域', '审计'],
    desc: '把散落在 6 个服务里的 if-else 状态判断收敛为统一状态机组件，支持按业务线配置流转规则，所有状态变更写入审计流水并可被下游订阅。',
    acceptanceCriteria: [
      'AC1 非法状态流转被状态机拦截并返回可解释的错误码 ORDER_STATE_ILLEGAL',
      'AC2 每次状态变更生成一条 order_state_log，含 from/to/operator/reason/traceId',
      'AC3 支持通过配置中心热更新流转规则，无需重启服务',
      'AC4 状态机单测覆盖率 ≥ 90%',
    ],
    storyIds: ['US-04', 'US-05'],
    taskIds: ['TASK-2406', 'TASK-2407', 'TASK-2408'],
    prdVersion: 'PRD-ORD-v2.3',
    risk: 'medium',
    riskNote: '历史订单存在脏状态数据，迁移前需先做数据体检与修复脚本',
    componentIds: ['ac-state-machine', 'ac-order-domain', 'ac-audit-store'],
    aiAssist: 81,
  },
  {
    id: 'REQ-2403',
    code: 'PC-ORD-1038',
    title: '优惠计算下沉：券、满减、会员价叠加规则引擎化',
    type: '功能需求',
    priority: 'P0',
    status: 'dev',
    statusLabel: '开发中',
    ownerId: 'u-su',
    storyPoints: 21,
    source: '营销中台需求 + BUG-1043 优惠券叠加金额计算异常',
    createdAt: '2026-02-20',
    updatedAt: '2026-03-19',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['营销', '规则引擎', '金额精度'],
    desc: '将优惠计算从订单服务硬编码迁移到独立的 promotion-engine，采用「互斥组 + 优先级 + 分摊」三段模型，金额统一使用 BigDecimal 并落地分摊明细。',
    acceptanceCriteria: [
      'AC1 券与满减叠加时分摊金额之和恒等于订单应付金额（分级精度校验）',
      'AC2 互斥优惠同时命中时按优先级返回唯一生效项并给出可解释原因',
      'AC3 试算接口与下单接口结果强一致（同一规则版本号）',
      'AC4 规则变更后 5 分钟内全节点生效',
    ],
    storyIds: ['US-06', 'US-07'],
    taskIds: ['TASK-2409', 'TASK-2410', 'TASK-2411'],
    prdVersion: 'PRD-ORD-v2.2',
    risk: 'high',
    riskNote: 'BUG-1043 已暴露分摊尾差问题，需在测试阶段补充 128 组金额边界用例',
    componentIds: ['ac-promo-engine', 'ac-order-domain'],
    aiAssist: 68,
  },
  {
    id: 'REQ-2404',
    code: 'PC-ORD-1045',
    title: '订单查询性能达标：3000 TPS 且 P99 < 200ms',
    type: '非功能需求',
    priority: 'P0',
    status: 'qa',
    statusLabel: '自动化测试中',
    ownerId: 'u-yan',
    storyPoints: 13,
    source: '2026 年 618 大促容量规划（CAP-2026-06）',
    createdAt: '2026-02-20',
    updatedAt: '2026-03-17',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['性能', 'Redis', '分库分表', 'NFR'],
    desc: '通过读写分离、Redis 7 多级缓存、订单号基因分片与 ES 查询下沉，把订单列表与详情查询压到 3000 TPS / P99 200ms 以内。',
    acceptanceCriteria: [
      'AC1 订单详情缓存命中率 ≥ 92%，穿透率 ≤ 0.3%',
      'AC2 3000 TPS 持续 30 分钟，P99 ≤ 200ms，错误率 ≤ 0.05%',
      'AC3 分库分表后按用户维度与订单号维度查询均不产生跨分片扫描',
      'AC4 缓存与 DB 不一致窗口 ≤ 800ms（binlog 订阅口径）',
    ],
    storyIds: ['US-08'],
    taskIds: ['TASK-2412', 'TASK-2413', 'TASK-2414'],
    prdVersion: 'PRD-ORD-v2.1',
    risk: 'medium',
    riskNote: '压测环境与生产规格不一致（1:0.6），需按比例折算并预留 30% 余量',
    componentIds: ['ac-order-query', 'ac-cache-layer', 'ac-order-db'],
    aiAssist: 55,
  },
  {
    id: 'REQ-2405',
    code: 'PC-ORD-1052',
    title: '多仓多商家拆单与合单能力',
    type: '功能需求',
    priority: 'P1',
    status: 'dev',
    statusLabel: '开发中',
    ownerId: 'u-su',
    storyPoints: 13,
    source: '业务方需求（跨境仓上线）',
    createdAt: '2026-02-23',
    updatedAt: '2026-03-16',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['拆单', '履约', '跨境'],
    desc: '支持一次下单按商家与仓库维度自动拆分为多个子订单，子订单独立履约、独立退款，父订单聚合展示金额与状态。',
    acceptanceCriteria: [
      'AC1 拆单后子订单金额之和 = 父订单金额，优惠按子订单分摊并保留明细',
      'AC2 任一子订单取消不影响其他子订单，父订单状态按聚合规则计算',
      'AC3 拆单规则可配置（商家 / 仓库 / 商品类目 / 重量）',
      'AC4 拆单结果在下单响应中同步返回，前端可立即展示',
    ],
    storyIds: ['US-09', 'US-10'],
    taskIds: ['TASK-2415', 'TASK-2416'],
    prdVersion: 'PRD-ORD-v2.3',
    risk: 'medium',
    riskNote: '与履约中心 WMS 回调协议尚未冻结，可能影响 SP-25 排期',
    componentIds: ['ac-split-engine', 'ac-order-domain'],
    aiAssist: 63,
  },
  {
    id: 'REQ-2406',
    code: 'PC-ORD-1059',
    title: '订单领域事件标准化外发（RabbitMQ）',
    type: '技术债',
    priority: 'P1',
    status: 'deployed',
    statusLabel: '已部署',
    ownerId: 'u-yan',
    storyPoints: 8,
    source: '技术债清单 TD-2026-041',
    createdAt: '2026-02-24',
    updatedAt: '2026-03-14',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['RabbitMQ', '领域事件', '解耦'],
    desc: '统一订单领域事件信封格式（CloudEvents 1.0），替换 12 个下游各自解析 JSON 的旧协议，提供兼容期双发能力。',
    acceptanceCriteria: [
      'AC1 事件信封符合 CloudEvents 1.0，含 id/source/type/specversion/time',
      'AC2 兼容期内新旧事件双发，下游可灰度切换',
      'AC3 消息幂等键与订单号绑定，重复投递不产生业务副作用',
      'AC4 死信队列可回放，回放成功率 ≥ 99.5%',
    ],
    storyIds: ['US-11'],
    taskIds: ['TASK-2417', 'TASK-2418'],
    prdVersion: 'PRD-ORD-v2.0',
    risk: 'low',
    riskNote: '兼容期 3 个月后需下线旧协议，已登记到技术债跟踪',
    componentIds: ['ac-event-bus', 'ac-outbox-relay'],
    aiAssist: 88,
  },
  {
    id: 'REQ-2407',
    code: 'PC-ORD-1066',
    title: '历史订单数据迁移与双写校验',
    type: '技术债',
    priority: 'P1',
    status: 'dev',
    statusLabel: '开发中',
    ownerId: 'u-zhou',
    storyPoints: 13,
    source: '重构前置依赖',
    createdAt: '2026-02-25',
    updatedAt: '2026-03-19',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['数据迁移', '双写', 'MySQL 8'],
    desc: '将 4.7 亿历史订单从单体 order 库迁移到新分片集群，迁移期开启双写并做全量+增量比对校验，确保切换零资损。',
    acceptanceCriteria: [
      'AC1 全量迁移完成后差异率 = 0（按订单号逐字段比对）',
      'AC2 双写期间写失败自动降级为单写并告警',
      'AC3 迁移可断点续传，单批次 ≤ 5 万条且不影响线上 RT',
      'AC4 提供一键回切脚本，回切 RTO ≤ 10 分钟',
    ],
    storyIds: ['US-12'],
    taskIds: ['TASK-2419', 'TASK-2420'],
    prdVersion: 'PRD-ORD-v2.2',
    risk: 'high',
    riskNote: 'DBA 侧迁移窗口尚未批复（BLOCK-0312），阻塞中；影响 TASK-2421 上线',
    componentIds: ['ac-order-db', 'ac-migrate-job'],
    aiAssist: 41,
  },
  {
    id: 'REQ-2408',
    code: 'PC-ORD-1073',
    title: '订单数据合规：字段脱敏与操作审计留痕',
    type: '合规需求',
    priority: 'P2',
    status: 'refined',
    statusLabel: '已拆解',
    ownerId: 'u-lin',
    storyPoints: 5,
    source: '安全合规部要求（SEC-2026-08）',
    createdAt: '2026-02-26',
    updatedAt: '2026-03-13',
    sprintId: 'SP-24',
    epicId: 'EPIC-ORDER-REF',
    tags: ['合规', '脱敏', '审计', '个保法'],
    desc: '对收件人手机号、地址、身份证等敏感字段做展示脱敏与存储加密，所有查询/导出行为写入审计日志并支持按人回溯。',
    acceptanceCriteria: [
      'AC1 手机号默认展示 138****8000，导出需二次授权',
      'AC2 敏感字段落库使用 SM4 加密，密钥托管在 KMS',
      'AC3 查询与导出行为 100% 留痕，日志保留 ≥ 180 天',
      'AC4 越权访问触发实时告警并阻断',
    ],
    storyIds: ['US-13', 'US-14'],
    taskIds: ['TASK-2422', 'TASK-2423', 'TASK-2424'],
    prdVersion: 'PRD-ORD-v2.3',
    risk: 'low',
    riskNote: '依赖统一脱敏组件 SEC-MASK-2.1，需向安全组申请接入',
    componentIds: ['ac-mask-sdk', 'ac-audit-store'],
    aiAssist: 47,
  },
];

/** 需求 id → 定义 */
export const REQUIREMENT_MAP: Record<string, RequirementDef> = REQUIREMENTS.reduce<
  Record<string, RequirementDef>
>((acc, r) => {
  acc[r.id] = r;
  return acc;
}, {});

/* ============================================================
 * 7. 用户故事
 * ============================================================ */

export interface UserStoryDef {
  id: string;
  reqId: string;
  title: string;
  /** 作为<角色>，我希望<动作>，以便<价值> */
  role: string;
  want: string;
  soThat: string;
  points: number;
  priority: 'P0' | 'P1' | 'P2';
  status: string;
  statusLabel: string;
  tone: Tone;
  ownerId: string;
  /** Given-When-Then 验收标准 */
  gwt: { given: string; when: string; then: string }[];
  createdAt: string;
  source: 'brainstorm' | 'manual' | 'import';
}

/** 由 Brainstorm 对话沉淀出的 14 条用户故事 */
export const USER_STORIES: UserStoryDef[] = [
  {
    id: 'US-01',
    reqId: 'REQ-2401',
    title: '幂等下单保障',
    role: '作为 C 端消费者',
    want: '我在网络抖动时重复点击提交订单',
    soThat: '系统只生成一笔订单，不会重复扣款',
    points: 8,
    priority: 'P0',
    status: 'qa',
    statusLabel: '自动化测试中',
    tone: 'teal',
    ownerId: 'u-zhou',
    gwt: [
      {
        given: '客户端已获取 idempotencyKey 并成功提交过一次订单',
        when: '在 24 小时内使用相同 key 再次提交',
        then: '返回首次订单号与 ORDER_DUPLICATED 提示码，不产生新订单记录',
      },
      {
        given: 'Redis 幂等缓存因故障不可用',
        when: '再次提交订单',
        then: '自动降级到 MySQL 唯一索引兜底，仍然只落一笔订单',
      },
    ],
    createdAt: '2026-02-27',
    source: 'brainstorm',
  },
  {
    id: 'US-02',
    reqId: 'REQ-2401',
    title: '库存扣减失败自动回滚',
    role: '作为交易系统',
    want: '在库存扣减失败时自动关闭订单并释放已核销优惠',
    soThat: '不会产生悬挂占用导致超卖或券浪费',
    points: 5,
    priority: 'P0',
    status: 'deployed',
    statusLabel: '已部署',
    tone: 'ok',
    ownerId: 'u-shen',
    gwt: [
      {
        given: '订单已创建且优惠已核销',
        when: '库存中心返回 INSUFFICIENT_STOCK',
        then: '订单状态置为 CLOSED，优惠核销记录回滚，并向用户推送缺货通知',
      },
    ],
    createdAt: '2026-02-27',
    source: 'brainstorm',
  },
  {
    id: 'US-03',
    reqId: 'REQ-2401',
    title: '本地消息表可靠投递',
    role: '作为下游履约系统',
    want: '订单事件通过本地消息表异步投递',
    soThat: '即使 MQ 短暂不可用也不会丢消息',
    points: 8,
    priority: 'P0',
    status: 'committed',
    statusLabel: '已提交',
    tone: 'warn',
    ownerId: 'u-zhou',
    gwt: [
      {
        given: '订单事务提交成功且消息写入 outbox 表',
        when: 'RabbitMQ 连接中断 30 秒后恢复',
        then: '中继器按 1s/5s/30s/2m/10m/30m 退避重投，最终投递成功率 ≥ 99.99%',
      },
    ],
    createdAt: '2026-02-28',
    source: 'brainstorm',
  },
  {
    id: 'US-04',
    reqId: 'REQ-2402',
    title: '非法状态流转拦截',
    role: '作为客服系统',
    want: '在订单状态不允许的操作被明确拒绝并给出原因',
    soThat: '客服不会误操作导致资损',
    points: 5,
    priority: 'P0',
    status: 'dev',
    statusLabel: '开发中',
    tone: 'brand',
    ownerId: 'u-shen',
    gwt: [
      {
        given: '订单处于 SHIPPED 状态',
        when: '调用取消订单接口',
        then: '返回 ORDER_STATE_ILLEGAL 且提示「已发货订单请走售后退货流程」',
      },
    ],
    createdAt: '2026-02-28',
    source: 'brainstorm',
  },
  {
    id: 'US-05',
    reqId: 'REQ-2402',
    title: '状态变更审计留痕',
    role: '作为合规审计员',
    want: '每一次订单状态变更都可追溯到操作人与原因',
    soThat: '满足个保法与内控审计要求',
    points: 8,
    priority: 'P1',
    status: 'dev',
    statusLabel: '开发中',
    tone: 'ai',
    ownerId: 'u-yan',
    gwt: [
      {
        given: '订单发生任意状态流转',
        when: '审计员按订单号查询变更历史',
        then: '返回完整时间线（from/to/operator/reason/traceId/时间），支持导出',
      },
    ],
    createdAt: '2026-03-01',
    source: 'brainstorm',
  },
  {
    id: 'US-06',
    reqId: 'REQ-2403',
    title: '优惠叠加分摊无尾差',
    role: '作为财务对账系统',
    want: '优惠分摊金额之和恒等于订单应付金额',
    soThat: '月末对账不产生分级误差',
    points: 8,
    priority: 'P0',
    status: 'dev',
    statusLabel: '开发中',
    tone: 'brand',
    ownerId: 'u-zhou',
    gwt: [
      {
        given: '订单包含 3 个商品且叠加了满减券与平台券',
        when: '计算各商品分摊金额',
        then: '分摊合计与应付金额分级相等，尾差归入最后一个商品并记录 adjustment 字段',
      },
    ],
    createdAt: '2026-03-01',
    source: 'brainstorm',
  },
  {
    id: 'US-07',
    reqId: 'REQ-2403',
    title: '互斥优惠可解释',
    role: '作为 C 端消费者',
    want: '当两张券不能同时使用时看到明确原因',
    soThat: '我不会困惑为什么优惠没生效',
    points: 3,
    priority: 'P1',
    status: 'refined',
    statusLabel: '已拆解',
    tone: 'info',
    ownerId: 'u-chen',
    gwt: [
      {
        given: '用户同时勾选了「新人券」与「品类券」（互斥组 EX-01）',
        when: '提交试算',
        then: '仅生效优先级更高的新人券，并提示「品类券与新人券不可叠加」',
      },
    ],
    createdAt: '2026-03-02',
    source: 'brainstorm',
  },
  {
    id: 'US-08',
    reqId: 'REQ-2404',
    title: '订单列表秒开',
    role: '作为 C 端消费者',
    want: '在大促高峰期也能秒开我的订单列表',
    soThat: '不会因为卡顿而放弃下单',
    points: 13,
    priority: 'P0',
    status: 'qa',
    statusLabel: '自动化测试中',
    tone: 'teal',
    ownerId: 'u-yan',
    gwt: [
      {
        given: '3000 TPS 并发查询订单列表',
        when: '持续压测 30 分钟',
        then: 'P99 ≤ 200ms，错误率 ≤ 0.05%，Redis 命中率 ≥ 92%',
      },
    ],
    createdAt: '2026-03-02',
    source: 'manual',
  },
  {
    id: 'US-09',
    reqId: 'REQ-2405',
    title: '跨仓自动拆单',
    role: '作为履约系统',
    want: '一次下单按仓库自动拆分为多个子订单',
    soThat: '可以并行拣货发货缩短履约时长',
    points: 8,
    priority: 'P1',
    status: 'dev',
    statusLabel: '开发中',
    tone: 'ai',
    ownerId: 'u-yan',
    gwt: [
      {
        given: '购物车包含华东仓与跨境仓各一件商品',
        when: '提交订单',
        then: '生成 1 个父订单 + 2 个子订单，各自绑定仓库并独立履约',
      },
    ],
    createdAt: '2026-03-03',
    source: 'brainstorm',
  },
  {
    id: 'US-10',
    reqId: 'REQ-2405',
    title: '子订单独立退款',
    role: '作为售后客服',
    want: '只退其中一个子订单',
    soThat: '不影响其他已发货子订单',
    points: 5,
    priority: 'P1',
    status: 'refined',
    statusLabel: '已拆解',
    tone: 'info',
    ownerId: 'u-su',
    gwt: [
      {
        given: '父订单下有 2 个子订单，其中 1 个已签收',
        when: '客服发起该子订单退款',
        then: '仅该子订单进入退款流程，父订单金额与状态按聚合规则更新',
      },
    ],
    createdAt: '2026-03-03',
    source: 'brainstorm',
  },
  {
    id: 'US-11',
    reqId: 'REQ-2406',
    title: '领域事件标准信封',
    role: '作为下游数据平台',
    want: '订阅统一格式的订单领域事件',
    soThat: '不需要为每个上游写定制解析逻辑',
    points: 8,
    priority: 'P1',
    status: 'released',
    statusLabel: '已发布',
    tone: 'ok',
    ownerId: 'u-shen',
    gwt: [
      {
        given: '订单状态变更为 PAID',
        when: '事件外发',
        then: '消息符合 CloudEvents 1.0，type 为 com.artisan.order.paid.v2',
      },
    ],
    createdAt: '2026-03-04',
    source: 'import',
  },
  {
    id: 'US-12',
    reqId: 'REQ-2407',
    title: '历史订单零差异迁移',
    role: '作为 DBA',
    want: '按批次迁移历史订单并实时比对差异',
    soThat: '切换新库时不会丢单或错单',
    points: 13,
    priority: 'P1',
    status: 'dev',
    statusLabel: '开发中',
    tone: 'danger',
    ownerId: 'u-zhou',
    gwt: [
      {
        given: '迁移任务已启动且双写开启',
        when: '某批次校验发现字段差异',
        then: '暂停该批次并输出差异清单，不影响其他批次继续',
      },
    ],
    createdAt: '2026-03-04',
    source: 'manual',
  },
  {
    id: 'US-13',
    reqId: 'REQ-2408',
    title: '敏感字段展示脱敏',
    role: '作为客服坐席',
    want: '默认看到脱敏后的手机号与地址',
    soThat: '避免客户隐私在工位屏幕上外泄',
    points: 3,
    priority: 'P2',
    status: 'refined',
    statusLabel: '已拆解',
    tone: 'info',
    ownerId: 'u-chen',
    gwt: [
      {
        given: '坐席无「明文查看」权限',
        when: '打开订单详情',
        then: '手机号显示为 138****8000，地址隐藏门牌号',
      },
    ],
    createdAt: '2026-03-05',
    source: 'brainstorm',
  },
  {
    id: 'US-14',
    reqId: 'REQ-2408',
    title: '导出行为二次授权',
    role: '作为安全管理员',
    want: '所有订单导出行为都需二次授权并留痕',
    soThat: '可以事后追责与合规审计',
    points: 2,
    priority: 'P2',
    status: 'taskCreated',
    statusLabel: '任务已创建',
    tone: 'ai',
    ownerId: 'u-meng',
    gwt: [
      {
        given: '运营发起超过 1000 条的订单导出',
        when: '提交导出请求',
        then: '触发审批流，审批通过后生成带水印的文件并写入审计日志',
      },
    ],
    createdAt: '2026-03-05',
    source: 'brainstorm',
  },
];

/* ============================================================
 * 8. PRD 版本与评审
 * ============================================================ */

export interface PrdVersionDef {
  id: string;
  version: string;
  title: string;
  authorId: string;
  createdAt: string;
  status: '草稿' | '评审中' | '已基线' | '已废弃';
  tone: Tone;
  baseline: boolean;
  changeSummary: string;
  changes: string[];
  wordCount: number;
  diffStat: { add: number; del: number };
  reviewerIds: string[];
  relatedReqIds: string[];
  /** AI 生成占比 */
  aiRatio: number;
}

/** 《订单中心重构 PRD》从 v1.0 到 v2.3 的演进 */
export const PRD_VERSIONS: PrdVersionDef[] = [
  {
    id: 'PRD-ORD-v1.0',
    version: 'v1.0',
    title: '订单中心重构 PRD · 初稿',
    authorId: 'u-su',
    createdAt: '2026-02-20 10:12',
    status: '已废弃',
    tone: 'neutral',
    baseline: false,
    changeSummary: 'AI Brainstorm 首轮产出的框架稿，仅覆盖幂等下单与状态机两块。',
    changes: [
      '新建文档骨架：背景 / 目标 / 范围 / 需求列表 / 非目标',
      'AI 依据 INC-2026-0131 事故复盘自动生成幂等下单需求初稿',
      '补充订单状态机现状调研（从代码库反推 23 处状态判断）',
    ],
    wordCount: 4820,
    diffStat: { add: 4820, del: 0 },
    reviewerIds: ['u-yan', 'u-lin'],
    relatedReqIds: ['REQ-2401', 'REQ-2402'],
    aiRatio: 78,
  },
  {
    id: 'PRD-ORD-v2.0',
    version: 'v2.0',
    title: '订单中心重构 PRD · 范围扩展',
    authorId: 'u-su',
    createdAt: '2026-02-25 16:40',
    status: '已废弃',
    tone: 'neutral',
    baseline: false,
    changeSummary: '纳入优惠计算下沉与领域事件标准化，明确重构边界与迁移策略。',
    changes: [
      '新增 REQ-2403 优惠计算下沉（营销中台联合提出）',
      '新增 REQ-2406 领域事件标准化（技术债 TD-2026-041）',
      '补充「非目标」章节：本迭代不做售后逆向流程',
      'AI 依据现有代码库自动生成影响面清单（17 个类、6 个服务）',
    ],
    wordCount: 8140,
    diffStat: { add: 3620, del: 300 },
    reviewerIds: ['u-yan', 'u-zhou', 'u-lin'],
    relatedReqIds: ['REQ-2401', 'REQ-2402', 'REQ-2403', 'REQ-2406'],
    aiRatio: 64,
  },
  {
    id: 'PRD-ORD-v2.1',
    version: 'v2.1',
    title: '订单中心重构 PRD · 补充性能指标',
    authorId: 'u-su',
    createdAt: '2026-03-01 09:25',
    status: '已废弃',
    tone: 'neutral',
    baseline: false,
    changeSummary: '依据 618 容量规划补充 NFR，明确 3000 TPS / P99 200ms 与缓存命中率门槛。',
    changes: [
      '新增 REQ-2404 订单查询性能达标（非功能需求）',
      '补充压测口径：3000 TPS 持续 30 分钟，错误率 ≤ 0.05%',
      '明确 Redis 命中率 ≥ 92%、穿透率 ≤ 0.3% 的验收门槛',
    ],
    wordCount: 9620,
    diffStat: { add: 1580, del: 100 },
    reviewerIds: ['u-yan', 'u-he', 'u-meng'],
    relatedReqIds: ['REQ-2404'],
    aiRatio: 52,
  },
  {
    id: 'PRD-ORD-v2.2',
    version: 'v2.2',
    title: '订单中心重构 PRD · 迁移方案细化',
    authorId: 'u-su',
    createdAt: '2026-03-06 14:08',
    status: '已废弃',
    tone: 'neutral',
    baseline: false,
    changeSummary: '细化历史数据迁移与双写校验方案，补充回切 RTO 与差异率要求。',
    changes: [
      '新增 REQ-2407 历史订单数据迁移与双写校验',
      '补充迁移批次策略（单批 ≤ 5 万条、可断点续传）',
      '明确回切 RTO ≤ 10 分钟与一键回切脚本要求',
      'AI 生成 4.7 亿数据量的迁移耗时估算（约 11.5 小时）',
    ],
    wordCount: 11280,
    diffStat: { add: 1860, del: 200 },
    reviewerIds: ['u-zhou', 'u-yan', 'u-meng'],
    relatedReqIds: ['REQ-2407'],
    aiRatio: 48,
  },
  {
    id: 'PRD-ORD-v2.3',
    version: 'v2.3',
    title: '订单中心重构 PRD · 基线版',
    authorId: 'u-su',
    createdAt: '2026-03-11 11:02',
    status: '已基线',
    tone: 'ok',
    baseline: true,
    changeSummary: '冻结基线：8 条需求、14 条用户故事、全部验收标准与合规要求确认无误。',
    changes: [
      '新增 REQ-2408 订单数据合规（脱敏与审计留痕）',
      '新增 REQ-2405 多仓多商家拆单与合单能力',
      '修订 AC：退款链路时序由「先退款后核销」改为「先核销后退款」',
      '全部 14 条用户故事补齐 Given-When-Then 验收标准',
      '评审意见 10 条全部闭环，2 条转入 SP-25 处理',
    ],
    wordCount: 13460,
    diffStat: { add: 2380, del: 200 },
    reviewerIds: ['u-lin', 'u-yan', 'u-zhou', 'u-he', 'u-meng', 'u-gu'],
    relatedReqIds: ['REQ-2401', 'REQ-2402', 'REQ-2405', 'REQ-2408'],
    aiRatio: 44,
  },
];

export interface PrdReviewDef {
  id: string;
  prdVersionId: string;
  reviewerId: string;
  roleLabel: string;
  verdict: 'approved' | 'comment' | 'rejected';
  verdictLabel: string;
  tone: Tone;
  at: string;
  comments: { point: string; resolution: string; resolvedBy: string; resolved: boolean }[];
}

/** PRD 评审记录（v2.3 基线评审为主） */
export const PRD_REVIEWS: PrdReviewDef[] = [
  {
    id: 'RV-01',
    prdVersionId: 'PRD-ORD-v1.0',
    reviewerId: 'u-yan',
    roleLabel: '架构师',
    verdict: 'comment',
    verdictLabel: '有意见',
    tone: 'warn',
    at: '2026-02-21 10:30',
    comments: [
      {
        point: '幂等键只依赖前端生成不可靠，需服务端补充唯一索引兜底',
        resolution: 'v2.0 已补充 MySQL 唯一索引降级方案',
        resolvedBy: 'u-su',
        resolved: true,
      },
      {
        point: '缺少对现有 23 处状态判断的收敛方案',
        resolution: 'v2.0 新增状态机组件设计章节',
        resolvedBy: 'u-su',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-02',
    prdVersionId: 'PRD-ORD-v1.0',
    reviewerId: 'u-lin',
    roleLabel: '研发总监',
    verdict: 'rejected',
    verdictLabel: '打回',
    tone: 'danger',
    at: '2026-02-21 15:12',
    comments: [
      {
        point: '范围过窄，未覆盖优惠计算这一大促主风险点，建议扩展后重评',
        resolution: 'v2.0 纳入 REQ-2403 优惠计算下沉',
        resolvedBy: 'u-su',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-03',
    prdVersionId: 'PRD-ORD-v2.0',
    reviewerId: 'u-zhou',
    roleLabel: '后端技术专家',
    verdict: 'comment',
    verdictLabel: '有意见',
    tone: 'warn',
    at: '2026-02-26 09:48',
    comments: [
      {
        point: '本地消息表中继器的重试退避策略未定义，建议明确 6 次退避间隔',
        resolution: 'v2.3 AC3 已明确指数退避（最多 6 次）并告警',
        resolvedBy: 'u-su',
        resolved: true,
      },
      {
        point: 'CloudEvents 双发兼容期需要给出下线时间点',
        resolution: 'v2.3 补充兼容期 3 个月后下线，登记技术债',
        resolvedBy: 'u-yan',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-04',
    prdVersionId: 'PRD-ORD-v2.1',
    reviewerId: 'u-he',
    roleLabel: '测试负责人',
    verdict: 'comment',
    verdictLabel: '有意见',
    tone: 'warn',
    at: '2026-03-02 11:20',
    comments: [
      {
        point: '压测口径未说明是否与生产同规格，建议标注折算比例',
        resolution: 'v2.2 标注压测环境 1:0.6，预留 30% 余量',
        resolvedBy: 'u-su',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-05',
    prdVersionId: 'PRD-ORD-v2.2',
    reviewerId: 'u-meng',
    roleLabel: 'SRE',
    verdict: 'comment',
    verdictLabel: '有意见',
    tone: 'warn',
    at: '2026-03-07 16:05',
    comments: [
      {
        point: '双写期间写失败降级为单写，缺少自动告警与恢复策略',
        resolution: 'v2.3 AC2 补充自动降级 + 告警',
        resolvedBy: 'u-zhou',
        resolved: true,
      },
      {
        point: '迁移窗口需 DBA 审批，建议提前一周提单',
        resolution: '已提单 BLOCK-0312，等待批复中（当前阻塞）',
        resolvedBy: 'u-gu',
        resolved: false,
      },
    ],
  },
  {
    id: 'RV-06',
    prdVersionId: 'PRD-ORD-v2.3',
    reviewerId: 'u-lin',
    roleLabel: '研发总监',
    verdict: 'approved',
    verdictLabel: '通过',
    tone: 'ok',
    at: '2026-03-11 10:15',
    comments: [
      {
        point: '范围、指标与合规要求齐备，同意基线冻结',
        resolution: '—',
        resolvedBy: 'u-lin',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-07',
    prdVersionId: 'PRD-ORD-v2.3',
    reviewerId: 'u-yan',
    roleLabel: '架构师',
    verdict: 'approved',
    verdictLabel: '通过',
    tone: 'ok',
    at: '2026-03-11 10:32',
    comments: [
      {
        point: '退款链路时序修订合理，与领域模型一致',
        resolution: '—',
        resolvedBy: 'u-yan',
        resolved: true,
      },
      {
        point: '拆单规则的配置项建议在 SP-25 补充灰度开关',
        resolution: '转入 SP-25 需求池（REQ-POOL-091）',
        resolvedBy: 'u-su',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-08',
    prdVersionId: 'PRD-ORD-v2.3',
    reviewerId: 'u-he',
    roleLabel: '测试负责人',
    verdict: 'approved',
    verdictLabel: '通过',
    tone: 'ok',
    at: '2026-03-11 10:41',
    comments: [
      {
        point: '14 条故事的 GWT 可直接转化为用例，测试可行性良好',
        resolution: '—',
        resolvedBy: 'u-he',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-09',
    prdVersionId: 'PRD-ORD-v2.3',
    reviewerId: 'u-gu',
    roleLabel: 'PMO',
    verdict: 'comment',
    verdictLabel: '有意见',
    tone: 'warn',
    at: '2026-03-11 10:55',
    comments: [
      {
        point: 'REQ-2407 迁移窗口未批复，存在排期风险，建议在甘特中标注为高风险',
        resolution: '已在排期甘特标注 GANTT-CF-03 高风险冲突',
        resolvedBy: 'u-gu',
        resolved: true,
      },
    ],
  },
  {
    id: 'RV-10',
    prdVersionId: 'PRD-ORD-v2.3',
    reviewerId: 'u-meng',
    roleLabel: 'SRE',
    verdict: 'approved',
    verdictLabel: '通过',
    tone: 'ok',
    at: '2026-03-11 11:00',
    comments: [
      {
        point: '发布门禁与灰度策略符合运维规范，同意基线',
        resolution: '—',
        resolvedBy: 'u-meng',
        resolved: true,
      },
    ],
  },
];

/* ============================================================
 * 9. Brainstorm 需求澄清对话
 * ============================================================ */

export interface BrainstormMsg {
  id: string;
  role: 'user' | 'ai' | 'system';
  who: string;
  whoId: string;
  at: string;
  content: string;
  /** AI 侧产出的结构化物料 */
  artifacts?: { type: string; label: string; ref: string }[];
  tokens?: number;
  modelId?: string;
}

/** REQ-2401 幂等下单的 AI Brainstorm 全过程（节选自 2026-02-27 会话） */
export const BRAINSTORM_SCRIPT: BrainstormMsg[] = [
  {
    id: 'bs-001',
    role: 'system',
    who: '系统',
    whoId: 'system',
    at: '2026-02-27 09:41:02',
    content: '会话已创建。已挂载上下文：INC-2026-0131 事故复盘、order-service 代码索引、《交易域架构规范》KB-ARCH-01。',
  },
  {
    id: 'bs-002',
    role: 'user',
    who: '苏文瑾',
    whoId: 'u-su',
    at: '2026-02-27 09:41:35',
    content:
      '春节大促那天出了重复下单的事故，客服接到 200 多通投诉。我们想把订单创建链路重构一下，你先帮我把问题拆清楚。',
  },
  {
    id: 'bs-003',
    role: 'ai',
    who: '需求澄清 Agent',
    whoId: 'ag-pm',
    at: '2026-02-27 09:41:48',
    content:
      '我先复述我的理解，请你确认：\n1）核心症状是同一笔购物车在网络抖动/用户重复点击时生成了多笔订单；\n2）伴随问题是库存被重复扣减、优惠券被重复核销；\n3）目标是重构创建链路，让「重复提交」在系统层面变成幂等操作。\n\n在展开之前，有 4 个关键点需要你澄清。',
    modelId: 'mdl-claude',
    tokens: 842,
  },
  {
    id: 'bs-004',
    role: 'ai',
    who: '需求澄清 Agent',
    whoId: 'ag-pm',
    at: '2026-02-27 09:41:52',
    content:
      'Q1 幂等键由谁生成？前端一次性 token，还是服务端按「用户+购物车快照」派生？\nQ2 幂等窗口多长？24 小时是否可接受？\nQ3 重复提交时，返回首次订单还是返回错误码让前端跳转？\nQ4 缓存不可用时，是否允许降级到数据库唯一索引（会有轻微性能损耗）？',
    modelId: 'mdl-claude',
    tokens: 486,
  },
  {
    id: 'bs-005',
    role: 'user',
    who: '苏文瑾',
    whoId: 'u-su',
    at: '2026-02-27 09:44:10',
    content:
      'Q1 前端拿 token，但服务端也要能兜底；Q2 24 小时够了；Q3 返回首次订单号，前端直接跳支付页，不要报错吓用户；Q4 允许降级，稳定性优先。',
  },
  {
    id: 'bs-006',
    role: 'ai',
    who: '需求澄清 Agent',
    whoId: 'ag-pm',
    at: '2026-02-27 09:44:26',
    content:
      '明白。基于你的回答，我识别出还有一条被忽略的链路：优惠核销与库存扣减当前是两个独立事务，即使订单幂等了，仍可能出现「订单只有一笔但券被核销两次」。建议把二者收敛进同一事务边界，或用本地消息表做最终一致。',
    artifacts: [{ type: 'risk', label: '新增风险项：优惠重复核销', ref: 'RISK-2401-02' }],
    modelId: 'mdl-claude',
    tokens: 613,
  },
  {
    id: 'bs-007',
    role: 'user',
    who: '苏文瑾',
    whoId: 'u-su',
    at: '2026-02-27 09:46:02',
    content: '这个确实是盲点。那就一起改掉，用本地消息表方案，别引入 Seata，运维成本太高。',
  },
  {
    id: 'bs-008',
    role: 'ai',
    who: '需求澄清 Agent',
    whoId: 'ag-pm',
    at: '2026-02-27 09:46:20',
    content:
      '收到，技术约束记为「不引入 Seata，采用本地消息表 + RabbitMQ 中继」。我已生成需求草稿与 3 条用户故事，请审阅。',
    artifacts: [
      { type: 'requirement', label: 'REQ-2401 订单创建链路重构', ref: 'REQ-2401' },
      { type: 'story', label: 'US-01 幂等下单保障', ref: 'US-01' },
      { type: 'story', label: 'US-02 库存扣减失败自动回滚', ref: 'US-02' },
      { type: 'story', label: 'US-03 本地消息表可靠投递', ref: 'US-03' },
    ],
    modelId: 'mdl-claude',
    tokens: 1284,
  },
  {
    id: 'bs-009',
    role: 'user',
    who: '苏文瑾',
    whoId: 'u-su',
    at: '2026-02-27 09:52:41',
    content: 'US-03 的验收标准再具体一点，退避间隔写清楚，测试同学要照着写用例。',
  },
  {
    id: 'bs-010',
    role: 'ai',
    who: '需求澄清 Agent',
    whoId: 'ag-pm',
    at: '2026-02-27 09:53:05',
    content:
      '已细化为：投递失败按 1s / 5s / 30s / 2min / 10min / 30min 六档退避，累计 6 次仍失败则进入死信队列并触发 P1 告警。同时补充可观测指标：outbox 积压量、投递成功率、平均重试次数。',
    artifacts: [{ type: 'ac', label: 'US-03 AC 更新', ref: 'US-03' }],
    modelId: 'mdl-claude',
    tokens: 528,
  },
  {
    id: 'bs-011',
    role: 'user',
    who: '严慕舟',
    whoId: 'u-yan',
    at: '2026-02-27 10:12:33',
    content: '我插一句：本地消息表要和订单在同一个库同一个事务，否则又变成两阶段问题了。分库后 outbox 表怎么分？',
  },
  {
    id: 'bs-012',
    role: 'ai',
    who: '需求澄清 Agent',
    whoId: 'ag-pm',
    at: '2026-02-27 10:12:51',
    content:
      '同意。建议 outbox 表按订单号基因分片，与订单表同片同事务；中继器按分片并行扫描，单分片内保证有序。这样既满足同事务要求，也不会因单点扫描造成积压。',
    artifacts: [{ type: 'decision', label: 'ADR-2401-03 outbox 分片策略', ref: 'ADR-2401-03' }],
    modelId: 'mdl-claude',
    tokens: 604,
  },
  {
    id: 'bs-013',
    role: 'user',
    who: '严慕舟',
    whoId: 'u-yan',
    at: '2026-02-27 10:14:07',
    content: '可以，就按这个来。',
  },
  {
    id: 'bs-014',
    role: 'ai',
    who: '需求澄清 Agent',
    whoId: 'ag-pm',
    at: '2026-02-27 10:14:30',
    content:
      '本轮澄清结束。产出汇总：\n· 需求 1 条（REQ-2401，21 故事点，P0）\n· 用户故事 3 条（US-01/02/03）\n· 架构决策记录 1 条（ADR-2401-03）\n· 风险项 2 条（RISK-2401-01 双写不一致 / RISK-2401-02 优惠重复核销）\n· 待确认项 1 条：压测口径需 SRE 复核\n是否同步创建 PingCode 工作项？',
    modelId: 'mdl-claude',
    tokens: 402,
  },
  {
    id: 'bs-015',
    role: 'user',
    who: '苏文瑾',
    whoId: 'u-su',
    at: '2026-02-27 10:15:12',
    content: '同步吧，关联到 Sprint 24。',
  },
  {
    id: 'bs-016',
    role: 'system',
    who: '集成中心',
    whoId: 'system',
    at: '2026-02-27 10:15:19',
    content:
      '已创建 PingCode 工作项 PC-ORD-1024（映射 REQ-2401），并同步 US-01/02/03 为子故事。同步队列任务 SYNC-0231 状态：success。',
  },
  {
    id: 'bs-017',
    role: 'ai',
    who: '架构设计 Agent',
    whoId: 'ag-arch',
    at: '2026-02-27 10:16:02',
    content:
      '已接手 REQ-2401，开始影响面分析：扫描 order-service 代码库（128 万行），命中 17 个类、6 个服务，预计拆出 5 个开发任务。分析完成后会提交方案供架构师确认。',
    artifacts: [{ type: 'analysis', label: '影响面分析报告', ref: 'TASK-2401' }],
    modelId: 'mdl-deepseek',
    tokens: 2140,
  },
  {
    id: 'bs-018',
    role: 'system',
    who: '系统',
    whoId: 'system',
    at: '2026-02-27 10:18:44',
    content: '会话已归档，摘要与产物已写入知识库 KB-BS-2401，可被后续 RAG 检索。',
  },
];

/* ============================================================
 * 7. 架构设计（S2 环节产物）
 * ============================================================ */

export interface ArchLayer {
  id: string;
  code: string;
  name: string;
  order: number;
  desc: string;
  tone: Tone;
  componentIds: string[];
}

/** 订单中心重构的四层架构视图 */
export const ARCH_LAYERS: ArchLayer[] = [
  {
    id: 'layer-access',
    code: 'L1',
    name: '接入层',
    order: 1,
    desc: 'API 网关统一鉴权、限流与幂等键透传，BFF 面向端侧聚合',
    tone: 'info',
    componentIds: ['ac-order-api', 'ac-order-query'],
  },
  {
    id: 'layer-app',
    code: 'L2',
    name: '应用服务层',
    order: 2,
    desc: '按限界上下文拆分的应用服务，编排领域能力，不含业务规则',
    tone: 'brand',
    componentIds: ['ac-promo-engine', 'ac-split-engine', 'ac-migrate-job'],
  },
  {
    id: 'layer-domain',
    code: 'L3',
    name: '领域层',
    order: 3,
    desc: '订单聚合根、状态机、幂等守卫与审计流水，承载核心不变式',
    tone: 'ai',
    componentIds: ['ac-order-domain', 'ac-state-machine', 'ac-idem-guard', 'ac-audit-store'],
  },
  {
    id: 'layer-infra',
    code: 'L4',
    name: '基础设施层',
    order: 4,
    desc: 'MySQL 8 分片集群、Redis 7 多级缓存、RabbitMQ 事件总线与安全组件',
    tone: 'slate',
    componentIds: ['ac-order-db', 'ac-cache-layer', 'ac-event-bus', 'ac-outbox-relay', 'ac-mask-sdk'],
  },
];

export interface ArchComponent {
  id: string;
  name: string;
  layerId: string;
  /** 新建 / 重构 / 复用 / 待下线 */
  kind: 'new' | 'refactor' | 'reuse' | 'deprecated';
  kindLabel: string;
  tech: string;
  repo: string;
  ownerId: string;
  ownerRoleId: string;
  reqIds: string[];
  taskIds: string[];
  apiIds: string[];
  /** 代码行数（千行） */
  locK: number;
  coverage: number;
  aiRatio: number;
  status: 'backlog' | 'refined' | 'taskCreated' | 'dev' | 'testGreen' | 'committed' | 'deployed' | 'qa' | 'bugfix' | 'released';
  statusLabel: string;
  tone: Tone;
  desc: string;
  risks: string[];
}

/** 14 个架构组件（与 REQUIREMENTS.componentIds 一一对应） */
export const ARCH_COMPONENTS: ArchComponent[] = [
  {
    id: 'ac-order-api',
    name: '订单接入 API',
    layerId: 'layer-access',
    kind: 'refactor',
    kindLabel: '重构',
    tech: 'Java 17 / Spring Boot 3.3',
    repo: 'trade/order-api',
    ownerId: 'u-zhou',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2401'],
    taskIds: ['TASK-2401', 'TASK-2404'],
    apiIds: ['API-01', 'API-02', 'API-04'],
    locK: 42,
    coverage: 71,
    aiRatio: 68,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'brand',
    desc: '下单、取消、查询等对外 REST 入口，负责幂等键透传、参数校验与统一错误码封装。',
    risks: ['幂等键透传依赖网关版本 ≥ 3.2，灰度期需双版本兼容'],
  },
  {
    id: 'ac-order-query',
    name: '订单查询服务',
    layerId: 'layer-access',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Java 17 / Elasticsearch 8',
    repo: 'trade/order-query',
    ownerId: 'u-chen',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2404'],
    taskIds: ['TASK-2414'],
    apiIds: ['API-03', 'API-13'],
    locK: 18,
    coverage: 78,
    aiRatio: 74,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'info',
    desc: '读写分离后的查询侧 BFF，列表走 ES、详情走 Redis 缓存，前端 Vue3 组件在此聚合。',
    risks: ['ES 与 DB 同步延迟需控制在 800ms 内'],
  },
  {
    id: 'ac-order-domain',
    name: '订单领域模型',
    layerId: 'layer-domain',
    kind: 'refactor',
    kindLabel: '重构',
    tech: 'Java 17 / DDD 聚合根',
    repo: 'trade/order-domain',
    ownerId: 'u-yan',
    ownerRoleId: 'architect',
    reqIds: ['REQ-2401', 'REQ-2402', 'REQ-2403', 'REQ-2405'],
    taskIds: ['TASK-2403', 'TASK-2406', 'TASK-2409'],
    apiIds: [],
    locK: 63,
    coverage: 84,
    aiRatio: 52,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'ai',
    desc: '订单聚合根与领域服务，收敛金额计算、状态不变式与优惠核销边界，是本次重构的核心。',
    risks: ['历史脏状态数据需先体检', '与库存中心事务边界调整需联调'],
  },
  {
    id: 'ac-state-machine',
    name: '订单状态机组件',
    layerId: 'layer-domain',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Java 17 / Spring Statemachine 4',
    repo: 'trade/order-statemachine',
    ownerId: 'u-zhou',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2402'],
    taskIds: ['TASK-2406', 'TASK-2407'],
    apiIds: ['API-05'],
    locK: 12,
    coverage: 90,
    aiRatio: 86,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'brand',
    desc: '可配置状态流转引擎，替换散落在 6 个服务中的 if-else 判断，支持配置中心热更新。',
    risks: ['规则热更新需保证在途请求不受影响'],
  },
  {
    id: 'ac-idem-guard',
    name: '幂等守卫',
    layerId: 'layer-domain',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Redis 7 + MySQL 8 唯一索引',
    repo: 'trade/idem-guard',
    ownerId: 'u-zhou',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2401'],
    taskIds: ['TASK-2401'],
    apiIds: ['API-01'],
    locK: 6,
    coverage: 88,
    aiRatio: 79,
    status: 'deployed',
    statusLabel: '已部署',
    tone: 'ok',
    desc: '两级幂等：Redis SETNX 快路径 + MySQL 唯一索引兜底，24h 窗口内相同 key 只落一笔。',
    risks: ['Redis 故障时降级路径需定期演练'],
  },
  {
    id: 'ac-audit-store',
    name: '审计流水存储',
    layerId: 'layer-domain',
    kind: 'new',
    kindLabel: '新建',
    tech: 'MySQL 8 / 分区表',
    repo: 'trade/audit-store',
    ownerId: 'u-shen',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2402', 'REQ-2408'],
    taskIds: ['TASK-2408', 'TASK-2424'],
    apiIds: ['API-06'],
    locK: 9,
    coverage: 81,
    aiRatio: 70,
    status: 'refined',
    statusLabel: '已拆解',
    tone: 'teal',
    desc: '状态变更与操作行为的不可变流水，按月分区，保留 ≥ 180 天，支持按人回溯。',
    risks: ['写入量峰值 4000 TPS，需批量落库'],
  },
  {
    id: 'ac-promo-engine',
    name: '优惠规则引擎',
    layerId: 'layer-app',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Java 17 / BigDecimal / Aviator',
    repo: 'trade/promotion-engine',
    ownerId: 'u-zhou',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2403'],
    taskIds: ['TASK-2409', 'TASK-2410', 'TASK-2411'],
    apiIds: ['API-07', 'API-08', 'API-09'],
    locK: 24,
    coverage: 76,
    aiRatio: 82,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'warn',
    desc: '「互斥组 + 优先级 + 分摊」三段模型，金额统一 BigDecimal，输出分摊明细供对账。',
    risks: ['BUG-1043 分摊尾差问题待回归', '规则版本需与试算接口强一致'],
  },
  {
    id: 'ac-split-engine',
    name: '拆单引擎',
    layerId: 'layer-app',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Java 17 / 规则配置化',
    repo: 'trade/split-engine',
    ownerId: 'u-zhou',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2405'],
    taskIds: ['TASK-2415'],
    apiIds: ['API-10'],
    locK: 11,
    coverage: 0,
    aiRatio: 91,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'ai',
    desc: '按商家 / 仓库 / 类目 / 重量维度自动拆分为子订单，子订单独立履约与退款。',
    risks: ['WMS 回调协议未冻结', '与 TASK-2412 存在资源冲突（周浩然）'],
  },
  {
    id: 'ac-migrate-job',
    name: '历史数据迁移作业',
    layerId: 'layer-app',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Java 17 / Spring Batch 5',
    repo: 'trade/order-migrate',
    ownerId: 'u-zhou',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2407'],
    taskIds: ['TASK-2419', 'TASK-2420'],
    apiIds: ['API-14'],
    locK: 15,
    coverage: 64,
    aiRatio: 58,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'danger',
    desc: '4.7 亿历史订单全量迁移 + 双写增量比对，支持断点续传与一键回切。',
    risks: ['DBA 迁移窗口未批复（BLOCK-0312）', '阻塞 TASK-2421 生产切流'],
  },
  {
    id: 'ac-order-db',
    name: '订单分片集群',
    layerId: 'layer-infra',
    kind: 'refactor',
    kindLabel: '重构',
    tech: 'MySQL 8 / ShardingSphere 5',
    repo: 'infra/order-db',
    ownerId: 'u-shen',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2404', 'REQ-2407'],
    taskIds: ['TASK-2413', 'TASK-2419'],
    apiIds: [],
    locK: 8,
    coverage: 0,
    aiRatio: 35,
    status: 'deployed',
    statusLabel: '已部署',
    tone: 'slate',
    desc: '订单号基因分片，16 库 × 64 表，用户维度与订单号维度均不产生跨分片扫描。',
    risks: ['扩容需停机窗口，已排入 SP-25'],
  },
  {
    id: 'ac-cache-layer',
    name: '多级缓存层',
    layerId: 'layer-infra',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Redis 7 / Caffeine',
    repo: 'infra/order-cache',
    ownerId: 'u-zhou',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2404'],
    taskIds: ['TASK-2412'],
    apiIds: ['API-02'],
    locK: 7,
    coverage: 83,
    aiRatio: 77,
    status: 'dev',
    statusLabel: '开发中',
    tone: 'brand',
    desc: '本地 Caffeine + Redis 集群两级缓存，binlog 订阅失效，命中率目标 ≥ 92%。',
    risks: ['与 TASK-2415 抢占了周浩然 03-16~03-17 的产能'],
  },
  {
    id: 'ac-event-bus',
    name: '领域事件总线',
    layerId: 'layer-infra',
    kind: 'refactor',
    kindLabel: '重构',
    tech: 'RabbitMQ 3.13 / CloudEvents 1.0',
    repo: 'infra/event-bus',
    ownerId: 'u-shen',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2406'],
    taskIds: ['TASK-2417'],
    apiIds: ['API-11', 'API-12'],
    locK: 10,
    coverage: 87,
    aiRatio: 88,
    status: 'deployed',
    statusLabel: '已部署',
    tone: 'ok',
    desc: '统一事件信封，替换 12 个下游各自解析 JSON 的旧协议，兼容期双发。',
    risks: ['兼容期 3 个月后需下线旧协议（TD-2026-041）'],
  },
  {
    id: 'ac-outbox-relay',
    name: '本地消息表中继',
    layerId: 'layer-infra',
    kind: 'new',
    kindLabel: '新建',
    tech: 'Java 17 / MySQL 8 / 指数退避',
    repo: 'infra/outbox-relay',
    ownerId: 'u-shen',
    ownerRoleId: 'developer',
    reqIds: ['REQ-2401', 'REQ-2406'],
    taskIds: ['TASK-2402'],
    apiIds: ['API-11'],
    locK: 5,
    coverage: 91,
    aiRatio: 84,
    status: 'deployed',
    statusLabel: '已部署',
    tone: 'ok',
    desc: '事务内写 outbox 表，独立线程投递 RabbitMQ，失败指数退避重试最多 6 次并告警。',
    risks: ['积压超过 5000 条触发 P1 告警'],
  },
  {
    id: 'ac-mask-sdk',
    name: '统一脱敏组件',
    layerId: 'layer-infra',
    kind: 'reuse',
    kindLabel: '复用',
    tech: 'SEC-MASK-2.1 / SM4 / KMS',
    repo: 'security/mask-sdk',
    ownerId: 'u-lin',
    ownerRoleId: 'manager',
    reqIds: ['REQ-2408'],
    taskIds: ['TASK-2422', 'TASK-2423'],
    apiIds: ['API-13'],
    locK: 3,
    coverage: 95,
    aiRatio: 22,
    status: 'refined',
    statusLabel: '已拆解',
    tone: 'pink',
    desc: '安全组提供的脱敏与加密 SDK，字段级注解驱动，密钥托管在企业 KMS。',
    risks: ['需向安全组申请接入配额（SEC-2026-08）'],
  },
];

/** 组件 id → 定义 */
export const ARCH_COMPONENT_MAP: Record<string, ArchComponent> = ARCH_COMPONENTS.reduce<
  Record<string, ArchComponent>
>((acc, c) => {
  acc[c.id] = c;
  return acc;
}, {});

export interface ArchLink {
  id: string;
  from: string;
  to: string;
  /** 同步调用 / 异步事件 / 数据读写 */
  type: 'sync' | 'async' | 'data';
  typeLabel: string;
  label: string;
  protocol: string;
  qps: number;
  critical: boolean;
}

/** 组件间依赖关系（架构画布连线） */
export const ARCH_LINKS: ArchLink[] = [
  {
    id: 'LNK-01',
    from: 'ac-order-api',
    to: 'ac-idem-guard',
    type: 'sync',
    typeLabel: '同步',
    label: '幂等校验',
    protocol: 'Redis SETNX + 唯一索引',
    qps: 3000,
    critical: true,
  },
  {
    id: 'LNK-02',
    from: 'ac-order-api',
    to: 'ac-order-domain',
    type: 'sync',
    typeLabel: '同步',
    label: '创建订单聚合',
    protocol: 'JVM 内调用',
    qps: 3000,
    critical: true,
  },
  {
    id: 'LNK-03',
    from: 'ac-order-domain',
    to: 'ac-state-machine',
    type: 'sync',
    typeLabel: '同步',
    label: '状态流转校验',
    protocol: 'JVM 内调用',
    qps: 4200,
    critical: true,
  },
  {
    id: 'LNK-04',
    from: 'ac-order-domain',
    to: 'ac-promo-engine',
    type: 'sync',
    typeLabel: '同步',
    label: '优惠试算与核销',
    protocol: 'gRPC',
    qps: 2600,
    critical: true,
  },
  {
    id: 'LNK-05',
    from: 'ac-order-domain',
    to: 'ac-split-engine',
    type: 'sync',
    typeLabel: '同步',
    label: '拆单预演',
    protocol: 'gRPC',
    qps: 900,
    critical: false,
  },
  {
    id: 'LNK-06',
    from: 'ac-order-domain',
    to: 'ac-outbox-relay',
    type: 'data',
    typeLabel: '数据',
    label: '事务内写 outbox',
    protocol: 'MySQL 8 同事务',
    qps: 3000,
    critical: true,
  },
  {
    id: 'LNK-07',
    from: 'ac-outbox-relay',
    to: 'ac-event-bus',
    type: 'async',
    typeLabel: '异步',
    label: '投递领域事件',
    protocol: 'AMQP 0-9-1',
    qps: 2800,
    critical: true,
  },
  {
    id: 'LNK-08',
    from: 'ac-state-machine',
    to: 'ac-audit-store',
    type: 'data',
    typeLabel: '数据',
    label: '写状态变更流水',
    protocol: 'MySQL 8 批量',
    qps: 4200,
    critical: false,
  },
  {
    id: 'LNK-09',
    from: 'ac-order-domain',
    to: 'ac-order-db',
    type: 'data',
    typeLabel: '数据',
    label: '订单落库（分片路由）',
    protocol: 'ShardingSphere 5',
    qps: 3000,
    critical: true,
  },
  {
    id: 'LNK-10',
    from: 'ac-order-query',
    to: 'ac-cache-layer',
    type: 'data',
    typeLabel: '数据',
    label: '详情多级缓存',
    protocol: 'Redis 7 / Caffeine',
    qps: 8600,
    critical: true,
  },
  {
    id: 'LNK-11',
    from: 'ac-order-db',
    to: 'ac-cache-layer',
    type: 'async',
    typeLabel: '异步',
    label: 'binlog 订阅失效',
    protocol: 'Canal → MQ',
    qps: 1200,
    critical: false,
  },
  {
    id: 'LNK-12',
    from: 'ac-event-bus',
    to: 'ac-order-query',
    type: 'async',
    typeLabel: '异步',
    label: 'ES 索引增量同步',
    protocol: 'AMQP 消费',
    qps: 1500,
    critical: false,
  },
  {
    id: 'LNK-13',
    from: 'ac-migrate-job',
    to: 'ac-order-db',
    type: 'data',
    typeLabel: '数据',
    label: '双写与批次迁移',
    protocol: 'JDBC 批量',
    qps: 600,
    critical: true,
  },
  {
    id: 'LNK-14',
    from: 'ac-order-query',
    to: 'ac-mask-sdk',
    type: 'sync',
    typeLabel: '同步',
    label: '敏感字段脱敏',
    protocol: 'JVM 内调用',
    qps: 8600,
    critical: false,
  },
];

export interface ApiContract {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'EVENT';
  path: string;
  componentId: string;
  reqIds: string[];
  taskIds: string[];
  version: string;
  status: 'frozen' | 'reviewing' | 'draft' | 'deprecated';
  statusLabel: string;
  tone: Tone;
  breaking: boolean;
  ownerId: string;
  reviewerId: string;
  aiGenerated: boolean;
  frozenAt: string;
  p99Ms: number;
  tps: number;
  authLevel: '公开' | '登录态' | '内部' | '二次授权';
  summary: string;
  errorCodes: { code: string; desc: string }[];
  changelog: string;
}

/** 14 份接口契约（S2 环节冻结产物，含 2 个事件契约） */
export const API_CONTRACTS: ApiContract[] = [
  {
    id: 'API-01',
    name: '创建订单（幂等）',
    method: 'POST',
    path: '/api/v2/orders',
    componentId: 'ac-order-api',
    reqIds: ['REQ-2401'],
    taskIds: ['TASK-2401'],
    version: 'v2.0',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: true,
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    aiGenerated: true,
    frozenAt: '2026-03-01',
    p99Ms: 186,
    tps: 3000,
    authLevel: '登录态',
    summary:
      '请求头必须携带 Idempotency-Key（客户端生成 UUID），服务端在 24h 窗口内保证同一 key 只产生一笔订单。',
    errorCodes: [
      { code: 'ORDER_DUPLICATED', desc: '幂等命中，返回首次订单结果' },
      { code: 'STOCK_NOT_ENOUGH', desc: '库存不足，订单自动关闭' },
      { code: 'PROMO_CONFLICT', desc: '优惠互斥冲突，返回唯一生效项' },
    ],
    changelog: 'v2.0 新增 Idempotency-Key 必填；v1.x 的 clientToken 字段标记废弃',
  },
  {
    id: 'API-02',
    name: '订单详情',
    method: 'GET',
    path: '/api/v2/orders/{orderNo}',
    componentId: 'ac-order-api',
    reqIds: ['REQ-2404'],
    taskIds: ['TASK-2412'],
    version: 'v2.1',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: false,
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    aiGenerated: true,
    frozenAt: '2026-03-01',
    p99Ms: 42,
    tps: 8600,
    authLevel: '登录态',
    summary: '优先命中多级缓存，未命中回源分片库；敏感字段按 ac-mask-sdk 规则脱敏后返回。',
    errorCodes: [
      { code: 'ORDER_NOT_FOUND', desc: '订单不存在或已归档' },
      { code: 'ORDER_FORBIDDEN', desc: '越权访问，已写入审计并告警' },
    ],
    changelog: 'v2.1 增加 cacheHit 与 dataVersion 调试字段（仅非生产返回）',
  },
  {
    id: 'API-03',
    name: '订单列表查询',
    method: 'GET',
    path: '/api/v2/orders',
    componentId: 'ac-order-query',
    reqIds: ['REQ-2404'],
    taskIds: ['TASK-2414'],
    version: 'v2.0',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: true,
    ownerId: 'u-chen',
    reviewerId: 'u-yan',
    aiGenerated: false,
    frozenAt: '2026-03-02',
    p99Ms: 128,
    tps: 4200,
    authLevel: '登录态',
    summary: '查询下沉到 Elasticsearch，支持用户维度、时间维度与状态维度组合过滤，游标分页。',
    errorCodes: [
      { code: 'QUERY_TOO_WIDE', desc: '查询条件过宽，需补充时间范围' },
      { code: 'ES_DEGRADED', desc: 'ES 不可用，已降级到 DB 只读从库' },
    ],
    changelog: 'v2.0 分页由 offset 改为 cursor，深分页性能提升 6 倍',
  },
  {
    id: 'API-04',
    name: '取消订单',
    method: 'POST',
    path: '/api/v2/orders/{orderNo}/cancel',
    componentId: 'ac-order-api',
    reqIds: ['REQ-2401', 'REQ-2402'],
    taskIds: ['TASK-2403'],
    version: 'v2.0',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: false,
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    aiGenerated: true,
    frozenAt: '2026-03-02',
    p99Ms: 154,
    tps: 600,
    authLevel: '登录态',
    summary: '取消需经状态机校验，成功后触发库存释放与优惠退回，全过程写入审计流水。',
    errorCodes: [
      { code: 'ORDER_STATE_ILLEGAL', desc: '当前状态不允许取消' },
      { code: 'REFUND_IN_PROGRESS', desc: '退款处理中，禁止取消' },
    ],
    changelog: 'v2.0 reason 字段改为枚举，新增 operatorType',
  },
  {
    id: 'API-05',
    name: '状态流转',
    method: 'POST',
    path: '/api/v2/orders/{orderNo}/state-transitions',
    componentId: 'ac-state-machine',
    reqIds: ['REQ-2402'],
    taskIds: ['TASK-2406', 'TASK-2407'],
    version: 'v1.0',
    status: 'reviewing',
    statusLabel: '评审中',
    tone: 'warn',
    breaking: false,
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    aiGenerated: true,
    frozenAt: '',
    p99Ms: 68,
    tps: 4200,
    authLevel: '内部',
    summary: '统一的状态流转入口，携带目标状态、操作者与原因；非法流转被拦截并返回可解释错误码。',
    errorCodes: [
      { code: 'ORDER_STATE_ILLEGAL', desc: '非法流转，返回允许的下一状态集合' },
      { code: 'RULE_VERSION_STALE', desc: '规则版本已更新，请重试' },
    ],
    changelog: 'v1.0 首版，待架构师确认热更新语义后冻结',
  },
  {
    id: 'API-06',
    name: '状态变更流水查询',
    method: 'GET',
    path: '/api/v2/orders/{orderNo}/state-logs',
    componentId: 'ac-audit-store',
    reqIds: ['REQ-2402', 'REQ-2408'],
    taskIds: ['TASK-2408'],
    version: 'v1.0',
    status: 'draft',
    statusLabel: '草稿',
    tone: 'neutral',
    breaking: false,
    ownerId: 'u-shen',
    reviewerId: 'u-he',
    aiGenerated: true,
    frozenAt: '',
    p99Ms: 55,
    tps: 300,
    authLevel: '二次授权',
    summary: '返回 from/to/operator/reason/traceId 全字段流水，客服与合规审计场景使用。',
    errorCodes: [{ code: 'AUDIT_FORBIDDEN', desc: '无审计查看权限' }],
    changelog: 'v1.0 首版草稿，等待合规组确认字段口径',
  },
  {
    id: 'API-07',
    name: '优惠试算',
    method: 'POST',
    path: '/api/v2/promotions/trial',
    componentId: 'ac-promo-engine',
    reqIds: ['REQ-2403'],
    taskIds: ['TASK-2411'],
    version: 'v2.0',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: true,
    ownerId: 'u-zhou',
    reviewerId: 'u-su',
    aiGenerated: true,
    frozenAt: '2026-03-03',
    p99Ms: 96,
    tps: 2600,
    authLevel: '登录态',
    summary: '返回 ruleVersion 与分摊明细，试算与下单必须使用同一 ruleVersion 以保证强一致。',
    errorCodes: [
      { code: 'PROMO_CONFLICT', desc: '互斥优惠命中，返回优先级最高项' },
      { code: 'AMOUNT_MISMATCH', desc: '分摊金额之和与应付不一致（精度校验失败）' },
    ],
    changelog: 'v2.0 金额字段由 double 改为字符串 BigDecimal，修复 BUG-1043 尾差',
  },
  {
    id: 'API-08',
    name: '优惠核销',
    method: 'POST',
    path: '/api/v2/promotions/apply',
    componentId: 'ac-promo-engine',
    reqIds: ['REQ-2401', 'REQ-2403'],
    taskIds: ['TASK-2410'],
    version: 'v2.0',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: true,
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    aiGenerated: false,
    frozenAt: '2026-03-03',
    p99Ms: 112,
    tps: 2400,
    authLevel: '内部',
    summary: '与订单创建同事务边界提交，失败时随订单一起回滚，不产生悬挂核销记录。',
    errorCodes: [
      { code: 'COUPON_USED', desc: '优惠券已被核销' },
      { code: 'PROMO_EXPIRED', desc: '活动已过期' },
    ],
    changelog: 'v2.0 增加 rollbackToken，支持补偿释放',
  },
  {
    id: 'API-09',
    name: '优惠规则查询',
    method: 'GET',
    path: '/api/v2/promotions/rules',
    componentId: 'ac-promo-engine',
    reqIds: ['REQ-2403'],
    taskIds: ['TASK-2409'],
    version: 'v1.2',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: false,
    ownerId: 'u-zhou',
    reviewerId: 'u-su',
    aiGenerated: true,
    frozenAt: '2026-03-04',
    p99Ms: 24,
    tps: 800,
    authLevel: '内部',
    summary: '按业务线返回互斥组、优先级与分摊策略，规则变更后 5 分钟内全节点生效。',
    errorCodes: [{ code: 'RULE_NOT_FOUND', desc: '业务线规则未配置' }],
    changelog: 'v1.2 增加 exclusiveGroup 字段',
  },
  {
    id: 'API-10',
    name: '拆单预演',
    method: 'POST',
    path: '/api/v2/orders/split-preview',
    componentId: 'ac-split-engine',
    reqIds: ['REQ-2405'],
    taskIds: ['TASK-2415', 'TASK-2416'],
    version: 'v0.9',
    status: 'draft',
    statusLabel: '草稿',
    tone: 'ai',
    breaking: false,
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    aiGenerated: true,
    frozenAt: '',
    p99Ms: 140,
    tps: 900,
    authLevel: '登录态',
    summary: '按商家 / 仓库 / 类目 / 重量规则返回子订单拆分方案与金额分摊，供下单前预览。',
    errorCodes: [
      { code: 'SPLIT_RULE_MISSING', desc: '拆单规则未配置' },
      { code: 'WMS_PROTOCOL_UNFROZEN', desc: '履约回调协议未冻结，仅返回预演结果' },
    ],
    changelog: 'v0.9 AI 生成初稿，等待 WMS 协议冻结后升级 v1.0',
  },
  {
    id: 'API-11',
    name: 'order.created 事件',
    method: 'EVENT',
    path: 'trade.order.created',
    componentId: 'ac-outbox-relay',
    reqIds: ['REQ-2401', 'REQ-2406'],
    taskIds: ['TASK-2402', 'TASK-2417'],
    version: 'v1.0',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: true,
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    aiGenerated: true,
    frozenAt: '2026-03-05',
    p99Ms: 30,
    tps: 2800,
    authLevel: '内部',
    summary: 'CloudEvents 1.0 信封，含 id/source/type/specversion/time，幂等键与订单号绑定。',
    errorCodes: [{ code: 'DLQ_OVERFLOW', desc: '死信队列积压超阈值，触发回放' }],
    changelog: 'v1.0 替换 12 个下游自定义 JSON 协议，兼容期双发',
  },
  {
    id: 'API-12',
    name: 'order.state.changed 事件',
    method: 'EVENT',
    path: 'trade.order.state.changed',
    componentId: 'ac-event-bus',
    reqIds: ['REQ-2402', 'REQ-2406'],
    taskIds: ['TASK-2417'],
    version: 'v1.0',
    status: 'frozen',
    statusLabel: '已冻结',
    tone: 'ok',
    breaking: false,
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    aiGenerated: true,
    frozenAt: '2026-03-06',
    p99Ms: 28,
    tps: 1500,
    authLevel: '内部',
    summary: '状态机每次成功流转后外发，携带 from/to/reason/traceId，供客服与 BI 订阅。',
    errorCodes: [{ code: 'EVENT_REPLAY_FAILED', desc: '回放失败，人工介入' }],
    changelog: 'v1.0 首版冻结',
  },
  {
    id: 'API-13',
    name: '订单数据导出',
    method: 'POST',
    path: '/api/v2/orders/export',
    componentId: 'ac-order-query',
    reqIds: ['REQ-2408'],
    taskIds: ['TASK-2423'],
    version: 'v1.1',
    status: 'reviewing',
    statusLabel: '评审中',
    tone: 'warn',
    breaking: false,
    ownerId: 'u-chen',
    reviewerId: 'u-lin',
    aiGenerated: false,
    frozenAt: '',
    p99Ms: 2600,
    tps: 20,
    authLevel: '二次授权',
    summary: '导出必须二次授权，敏感字段按策略脱敏，导出行为 100% 写入审计日志。',
    errorCodes: [
      { code: 'EXPORT_NEED_APPROVAL', desc: '需要主管二次授权' },
      { code: 'EXPORT_ROW_LIMIT', desc: '单次导出超过 10 万行限制' },
    ],
    changelog: 'v1.1 增加脱敏策略版本号与审批单号字段',
  },
  {
    id: 'API-14',
    name: '迁移批次执行',
    method: 'POST',
    path: '/internal/migrate/batch',
    componentId: 'ac-migrate-job',
    reqIds: ['REQ-2407'],
    taskIds: ['TASK-2419', 'TASK-2420'],
    version: 'v1.0',
    status: 'draft',
    statusLabel: '草稿',
    tone: 'danger',
    breaking: false,
    ownerId: 'u-zhou',
    reviewerId: 'u-meng',
    aiGenerated: true,
    frozenAt: '',
    p99Ms: 4800,
    tps: 60,
    authLevel: '内部',
    summary: '按批次迁移历史订单，单批次 ≤ 5 万条，支持断点续传与差异比对结果回传。',
    errorCodes: [
      { code: 'MIGRATE_WINDOW_CLOSED', desc: 'DBA 未批复迁移窗口（BLOCK-0312）' },
      { code: 'MIGRATE_DIFF_FOUND', desc: '比对发现差异，自动暂停' },
    ],
    changelog: 'v1.0 草稿，等待 DBA 批复后冻结',
  },
];

/** 契约 id → 定义 */
export const API_CONTRACT_MAP: Record<string, ApiContract> = API_CONTRACTS.reduce<Record<string, ApiContract>>(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {},
);

/* ============================================================
 * 8. 任务（S2 拆解产物 / 看板与甘特的数据源）
 * ============================================================ */

/** 原型内的“今天”，用于甘特今日线、超期判断与相对时间 */
export const TODAY = '2026-03-19';

export interface TaskDef {
  id: string;
  /** PingCode 工作项编号 */
  code: string;
  title: string;
  /** 所属需求；发布执行类工作项可为空串 */
  reqId: string;
  epicId: string;
  type: '开发' | '联调' | '测试' | '发布' | '技术债';
  /** 所属 SDLC 环节 */
  stageId: string;
  /** 取自 TASK_STATES 的 10 态之一 */
  state: string;
  stateLabel: string;
  priority: 'P0' | 'P1' | 'P2';
  ownerId: string;
  reviewerId: string;
  executor: Executor;
  /** AI 产出占比（%） */
  aiRatio: number;
  points: number;
  estimateHours: number;
  actualHours: number;
  startDate: string;
  endDate: string;
  progress: number;
  sprintId: string;
  componentIds: string[];
  apiIds: string[];
  storyIds: string[];
  tags: string[];
  desc: string;
  mrId: string;
  branch: string;
  commits: number;
  additions: number;
  deletions: number;
  coverage: number;
  critical: boolean;
  blockedReason: string;
  /** 关联的 AI 编码会话 */
  sessionId: string;
  updatedAt: string;
}

/** Sprint 24 的 24 个工作项（TASK-2401 ~ TASK-2424） */
export const TASKS: TaskDef[] = [
  {
    id: 'TASK-2401',
    code: 'PC-ORD-2401',
    title: '幂等下单接口改造：Idempotency-Key 两级校验',
    reqId: 'REQ-2401',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'qa',
    stateLabel: '自动化测试中',
    priority: 'P0',
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 76,
    points: 8,
    estimateHours: 32,
    actualHours: 34,
    startDate: '2026-03-02',
    endDate: '2026-03-06',
    progress: 92,
    sprintId: 'SP-24',
    componentIds: ['ac-order-api', 'ac-idem-guard'],
    apiIds: ['API-01'],
    storyIds: ['US-01'],
    tags: ['幂等', 'P0', '关键路径'],
    desc: '下单入口接入 Idempotency-Key 校验，Redis SETNX 快路径 + MySQL 唯一索引兜底，命中时返回首次结果与 ORDER_DUPLICATED 提示码。',
    mrId: 'MR-2401',
    branch: 'feat/order-idempotency',
    commits: 27,
    additions: 3860,
    deletions: 1240,
    coverage: 88,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2401',
    updatedAt: '2026-03-18 15:22',
  },
  {
    id: 'TASK-2402',
    code: 'PC-ORD-2402',
    title: '本地消息表 outbox 落地与指数退避重试',
    reqId: 'REQ-2401',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'released',
    stateLabel: '已发布',
    priority: 'P0',
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    executor: 'ai',
    aiRatio: 84,
    points: 5,
    estimateHours: 20,
    actualHours: 17,
    startDate: '2026-03-03',
    endDate: '2026-03-09',
    progress: 100,
    sprintId: 'SP-24',
    componentIds: ['ac-outbox-relay'],
    apiIds: ['API-11'],
    storyIds: ['US-03'],
    tags: ['本地消息表', '最终一致性'],
    desc: '订单事务内写入 outbox 表，独立中继线程投递 RabbitMQ，失败按 2^n 指数退避重试最多 6 次，超限进入死信并告警。',
    mrId: 'MR-2402',
    branch: 'feat/outbox-relay',
    commits: 19,
    additions: 2140,
    deletions: 380,
    coverage: 91,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2402',
    updatedAt: '2026-03-09 18:40',
  },
  {
    id: 'TASK-2403',
    code: 'PC-ORD-2403',
    title: '库存扣减事务边界收敛与失败补偿回滚',
    reqId: 'REQ-2401',
    epicId: 'EPIC-ORDER-REF',
    type: '联调',
    stageId: 'st-code',
    state: 'committed',
    stateLabel: '已提交',
    priority: 'P0',
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 58,
    points: 5,
    estimateHours: 24,
    actualHours: 26,
    startDate: '2026-03-05',
    endDate: '2026-03-11',
    progress: 85,
    sprintId: 'SP-24',
    componentIds: ['ac-order-domain'],
    apiIds: ['API-04', 'API-08'],
    storyIds: ['US-02'],
    tags: ['分布式事务', '库存', '跨组联调'],
    desc: '把库存扣减与优惠核销收敛进同一事务边界，扣减失败时订单自动回滚至 CLOSED 并释放已核销优惠，需与仓储组联调 3 轮。',
    mrId: 'MR-2403',
    branch: 'feat/order-tx-boundary',
    commits: 22,
    additions: 2680,
    deletions: 1920,
    coverage: 79,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2403',
    updatedAt: '2026-03-19 10:05',
  },
  {
    id: 'TASK-2404',
    code: 'PC-ORD-2404',
    title: '幂等命中率与消息积压指标埋点',
    reqId: 'REQ-2401',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-observe',
    state: 'deployed',
    stateLabel: '已部署',
    priority: 'P1',
    ownerId: 'u-meng',
    reviewerId: 'u-yan',
    executor: 'ai',
    aiRatio: 92,
    points: 2,
    estimateHours: 8,
    actualHours: 6,
    startDate: '2026-03-09',
    endDate: '2026-03-12',
    progress: 100,
    sprintId: 'SP-24',
    componentIds: ['ac-order-api'],
    apiIds: ['API-01'],
    storyIds: ['US-01'],
    tags: ['可观测', 'Prometheus'],
    desc: '新增 idempotency_hit_total、outbox_pending_count、outbox_retry_total 三个指标，配套 Grafana 面板与 P1 告警规则。',
    mrId: 'MR-2404',
    branch: 'feat/order-metrics',
    commits: 8,
    additions: 620,
    deletions: 40,
    coverage: 68,
    critical: false,
    blockedReason: '',
    sessionId: 'CS-2404',
    updatedAt: '2026-03-12 14:18',
  },
  {
    id: 'TASK-2405',
    code: 'PC-ORD-2405',
    title: '下单链路单元测试补齐（覆盖率目标 85%）',
    reqId: 'REQ-2401',
    epicId: 'EPIC-ORDER-REF',
    type: '测试',
    stageId: 'st-test',
    state: 'dev',
    stateLabel: '开发中',
    priority: 'P0',
    ownerId: 'u-ai-copilot',
    reviewerId: 'u-he',
    executor: 'ai',
    aiRatio: 97,
    points: 1,
    estimateHours: 6,
    actualHours: 9,
    startDate: '2026-03-10',
    endDate: '2026-03-16',
    progress: 71,
    sprintId: 'SP-24',
    componentIds: ['ac-order-api', 'ac-order-domain'],
    apiIds: ['API-01', 'API-04'],
    storyIds: ['US-01', 'US-02'],
    tags: ['单测', '门禁 G3', '未达标'],
    desc: 'AI 生成下单链路单测 186 个，当前分支覆盖率 71.4%，未达 G3 门禁要求的 85%，缺口集中在异常回滚分支。',
    mrId: 'MR-2405',
    branch: 'test/order-idempotency-ut',
    commits: 14,
    additions: 4120,
    deletions: 60,
    coverage: 71,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2405',
    updatedAt: '2026-03-19 17:42',
  },
  {
    id: 'TASK-2406',
    code: 'PC-ORD-2406',
    title: '统一状态机组件实现（替换 6 处 if-else）',
    reqId: 'REQ-2402',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'dev',
    stateLabel: '开发中',
    priority: 'P0',
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 81,
    points: 5,
    estimateHours: 24,
    actualHours: 21,
    startDate: '2026-03-05',
    endDate: '2026-03-13',
    progress: 78,
    sprintId: 'SP-24',
    componentIds: ['ac-state-machine', 'ac-order-domain'],
    apiIds: ['API-05'],
    storyIds: ['US-04'],
    tags: ['状态机', 'DDD'],
    desc: '基于 Spring Statemachine 4 实现订单 10 态流转，非法流转返回 ORDER_STATE_ILLEGAL 并附带允许的下一状态集合。',
    mrId: 'MR-2406',
    branch: 'feat/order-statemachine',
    commits: 31,
    additions: 5240,
    deletions: 2860,
    coverage: 90,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2406',
    updatedAt: '2026-03-19 09:30',
  },
  {
    id: 'TASK-2407',
    code: 'PC-ORD-2407',
    title: '状态流转规则配置化与热更新',
    reqId: 'REQ-2402',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-arch',
    state: 'dev',
    stateLabel: '开发中',
    priority: 'P1',
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 88,
    points: 5,
    estimateHours: 20,
    actualHours: 6,
    startDate: '2026-03-13',
    endDate: '2026-03-20',
    progress: 35,
    sprintId: 'SP-24',
    componentIds: ['ac-state-machine'],
    apiIds: ['API-05'],
    storyIds: ['US-04'],
    tags: ['配置中心', '热更新', '待人工确认'],
    desc: 'AI 已产出两套热更新方案（本地缓存双 buffer / 配置中心推送 + 版本号），等待架构师确认后进入编码，需保证在途请求不受影响。',
    mrId: '',
    branch: 'feat/statemachine-hotrule',
    commits: 3,
    additions: 480,
    deletions: 20,
    coverage: 0,
    critical: false,
    blockedReason: '',
    sessionId: 'CS-2407',
    updatedAt: '2026-03-19 11:55',
  },
  {
    id: 'TASK-2408',
    code: 'PC-ORD-2408',
    title: 'order_state_log 审计流水与下游订阅',
    reqId: 'REQ-2402',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'refined',
    stateLabel: '已拆解',
    priority: 'P1',
    ownerId: 'u-shen',
    reviewerId: 'u-he',
    executor: 'ai+human',
    aiRatio: 73,
    points: 3,
    estimateHours: 14,
    actualHours: 0,
    startDate: '2026-03-20',
    endDate: '2026-03-24',
    progress: 0,
    sprintId: 'SP-24',
    componentIds: ['ac-audit-store'],
    apiIds: ['API-06', 'API-12'],
    storyIds: ['US-05'],
    tags: ['审计', '分区表'],
    desc: '每次状态变更落一条 order_state_log（from/to/operator/reason/traceId），按月分区，保留 180 天，并向客服系统开放订阅。',
    mrId: '',
    branch: 'feat/order-state-log',
    commits: 0,
    additions: 0,
    deletions: 0,
    coverage: 0,
    critical: false,
    blockedReason: '',
    sessionId: '',
    updatedAt: '2026-03-16 11:02',
  },
  {
    id: 'TASK-2409',
    code: 'PC-ORD-2409',
    title: '优惠规则引擎建模：互斥组 + 优先级 + 分摊',
    reqId: 'REQ-2403',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'dev',
    stateLabel: '开发中',
    priority: 'P0',
    ownerId: 'u-zhou',
    reviewerId: 'u-su',
    executor: 'ai+human',
    aiRatio: 79,
    points: 8,
    estimateHours: 32,
    actualHours: 29,
    startDate: '2026-03-06',
    endDate: '2026-03-14',
    progress: 82,
    sprintId: 'SP-24',
    componentIds: ['ac-promo-engine', 'ac-order-domain'],
    apiIds: ['API-09'],
    storyIds: ['US-06'],
    tags: ['规则引擎', '营销'],
    desc: '把券、满减、会员价的叠加规则抽象为三段模型，规则以 Aviator 表达式配置化，5 分钟内全节点生效。',
    mrId: 'MR-2409',
    branch: 'feat/promotion-engine',
    commits: 36,
    additions: 6180,
    deletions: 2340,
    coverage: 76,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2409',
    updatedAt: '2026-03-19 14:08',
  },
  {
    id: 'TASK-2410',
    code: 'PC-ORD-2410',
    title: '金额分摊精度修复（关联 BUG-1043）',
    reqId: 'REQ-2403',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'bugfix',
    stateLabel: '缺陷修复中',
    priority: 'P0',
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 66,
    points: 8,
    estimateHours: 28,
    actualHours: 31,
    startDate: '2026-03-09',
    endDate: '2026-03-15',
    progress: 88,
    sprintId: 'SP-24',
    componentIds: ['ac-promo-engine'],
    apiIds: ['API-08'],
    storyIds: ['US-06', 'US-07'],
    tags: ['BUG-1043', 'BigDecimal', '金额精度'],
    desc: '全链路金额由 double 切换为 BigDecimal，分摊采用「最大余额法」消除尾差，保证分摊之和恒等于应付金额。',
    mrId: 'MR-2410',
    branch: 'fix/promo-amount-precision',
    commits: 24,
    additions: 3120,
    deletions: 2480,
    coverage: 82,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2410',
    updatedAt: '2026-03-19 16:08',
  },
  {
    id: 'TASK-2411',
    code: 'PC-ORD-2411',
    title: '试算与下单结果强一致校验',
    reqId: 'REQ-2403',
    epicId: 'EPIC-ORDER-REF',
    type: '联调',
    stageId: 'st-test',
    state: 'testGreen',
    stateLabel: '本地测试通过',
    priority: 'P1',
    ownerId: 'u-yan',
    reviewerId: 'u-he',
    executor: 'ai+human',
    aiRatio: 61,
    points: 5,
    estimateHours: 18,
    actualHours: 12,
    startDate: '2026-03-12',
    endDate: '2026-03-18',
    progress: 64,
    sprintId: 'SP-24',
    componentIds: ['ac-promo-engine'],
    apiIds: ['API-07'],
    storyIds: ['US-07'],
    tags: ['一致性', 'ruleVersion'],
    desc: '试算接口与下单接口绑定同一 ruleVersion，版本漂移时拒绝下单并返回 RULE_VERSION_STALE，配套 128 组金额边界用例。',
    mrId: 'MR-2411',
    branch: 'feat/promo-trial-consistency',
    commits: 12,
    additions: 1480,
    deletions: 320,
    coverage: 74,
    critical: false,
    blockedReason: '',
    sessionId: 'CS-2411',
    updatedAt: '2026-03-18 20:11',
  },
  {
    id: 'TASK-2412',
    code: 'PC-ORD-2412',
    title: 'Redis 7 多级缓存与 binlog 失效一致性',
    reqId: 'REQ-2404',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'qa',
    stateLabel: '自动化测试中',
    priority: 'P0',
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 77,
    points: 5,
    estimateHours: 24,
    actualHours: 27,
    startDate: '2026-03-09',
    endDate: '2026-03-17',
    progress: 90,
    sprintId: 'SP-24',
    componentIds: ['ac-cache-layer'],
    apiIds: ['API-02'],
    storyIds: ['US-08'],
    tags: ['缓存', '性能', '资源冲突'],
    desc: 'Caffeine 本地缓存 + Redis 集群二级缓存，Canal 订阅 binlog 主动失效，目标命中率 ≥ 92%、不一致窗口 ≤ 800ms。',
    mrId: 'MR-2412',
    branch: 'feat/order-multilevel-cache',
    commits: 21,
    additions: 2360,
    deletions: 780,
    coverage: 83,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2412',
    updatedAt: '2026-03-18 18:31',
  },
  {
    id: 'TASK-2413',
    code: 'PC-ORD-2413',
    title: '订单号基因分片与分库分表路由改造',
    reqId: 'REQ-2404',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'deployed',
    stateLabel: '已部署',
    priority: 'P0',
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 54,
    points: 5,
    estimateHours: 26,
    actualHours: 24,
    startDate: '2026-03-04',
    endDate: '2026-03-13',
    progress: 100,
    sprintId: 'SP-24',
    componentIds: ['ac-order-db'],
    apiIds: ['API-03'],
    storyIds: ['US-08'],
    tags: ['分库分表', 'ShardingSphere'],
    desc: '订单号内嵌用户基因位，16 库 × 64 表，用户维度与订单号维度查询均命中单分片，消除跨分片扫描。',
    mrId: 'MR-2413',
    branch: 'feat/order-sharding',
    commits: 18,
    additions: 1980,
    deletions: 1460,
    coverage: 72,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2413',
    updatedAt: '2026-03-13 17:26',
  },
  {
    id: 'TASK-2414',
    code: 'PC-ORD-2414',
    title: '订单列表前端查询链路优化（Vue3 + TS）',
    reqId: 'REQ-2404',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'testGreen',
    stateLabel: '本地测试通过',
    priority: 'P1',
    ownerId: 'u-chen',
    reviewerId: 'u-yan',
    executor: 'ai+human',
    aiRatio: 71,
    points: 3,
    estimateHours: 16,
    actualHours: 13,
    startDate: '2026-03-12',
    endDate: '2026-03-19',
    progress: 68,
    sprintId: 'SP-24',
    componentIds: ['ac-order-query'],
    apiIds: ['API-03'],
    storyIds: ['US-08'],
    tags: ['Vue3', '前端性能', '游标分页'],
    desc: '订单列表切换到游标分页 + 虚拟滚动，骨架屏与缓存态渲染，首屏 LCP 由 2.4s 压到 0.9s。',
    mrId: 'MR-2414',
    branch: 'feat/order-list-vue3',
    commits: 16,
    additions: 2240,
    deletions: 1180,
    coverage: 66,
    critical: false,
    blockedReason: '',
    sessionId: 'CS-2414',
    updatedAt: '2026-03-19 15:36',
  },
  {
    id: 'TASK-2415',
    code: 'PC-ORD-2415',
    title: '拆单引擎规则实现（商家/仓库/类目/重量）',
    reqId: 'REQ-2405',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-arch',
    state: 'taskCreated',
    stateLabel: '任务已创建',
    priority: 'P1',
    ownerId: 'u-zhou',
    reviewerId: 'u-yan',
    executor: 'ai',
    aiRatio: 91,
    points: 8,
    estimateHours: 32,
    actualHours: 9,
    startDate: '2026-03-16',
    endDate: '2026-03-23',
    progress: 28,
    sprintId: 'SP-24',
    componentIds: ['ac-split-engine', 'ac-order-domain'],
    apiIds: ['API-10'],
    storyIds: ['US-09'],
    tags: ['拆单', 'AI 分析中', '资源冲突'],
    desc: '架构 Agent 正在扫描履约域代码并生成拆单方案，输出子订单聚合关系与金额分摊算法，待架构师确认后进入编码。',
    mrId: '',
    branch: 'feat/split-engine',
    commits: 4,
    additions: 860,
    deletions: 0,
    coverage: 0,
    critical: false,
    blockedReason: '',
    sessionId: 'CS-2415',
    updatedAt: '2026-03-19 11:20',
  },
  {
    id: 'TASK-2416',
    code: 'PC-ORD-2416',
    title: '拆单结果前端展示与父/子订单聚合视图',
    reqId: 'REQ-2405',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'refined',
    stateLabel: '已拆解',
    priority: 'P2',
    ownerId: 'u-chen',
    reviewerId: 'u-su',
    executor: 'ai+human',
    aiRatio: 64,
    points: 5,
    estimateHours: 20,
    actualHours: 0,
    startDate: '2026-03-19',
    endDate: '2026-03-25',
    progress: 0,
    sprintId: 'SP-24',
    componentIds: ['ac-split-engine'],
    apiIds: ['API-10'],
    storyIds: ['US-10'],
    tags: ['Vue3', '拆单', '待启动'],
    desc: '下单响应中同步返回拆单结果，前端以父订单聚合金额与状态、子订单独立退款入口的方式展示。',
    mrId: '',
    branch: 'feat/order-split-view',
    commits: 0,
    additions: 0,
    deletions: 0,
    coverage: 0,
    critical: false,
    blockedReason: '',
    sessionId: '',
    updatedAt: '2026-03-16 09:44',
  },
  {
    id: 'TASK-2417',
    code: 'PC-ORD-2417',
    title: 'CloudEvents 1.0 事件信封与新旧双发兼容',
    reqId: 'REQ-2406',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'deployed',
    stateLabel: '已部署',
    priority: 'P1',
    ownerId: 'u-shen',
    reviewerId: 'u-yan',
    executor: 'ai',
    aiRatio: 88,
    points: 5,
    estimateHours: 20,
    actualHours: 15,
    startDate: '2026-03-02',
    endDate: '2026-03-09',
    progress: 100,
    sprintId: 'SP-24',
    componentIds: ['ac-event-bus', 'ac-outbox-relay'],
    apiIds: ['API-11', 'API-12'],
    storyIds: ['US-11'],
    tags: ['RabbitMQ', 'CloudEvents', '技术债'],
    desc: '统一事件信封替换 12 个下游自定义 JSON 协议，兼容期新旧双发，下游可灰度切换。',
    mrId: 'MR-2417',
    branch: 'feat/cloudevents-envelope',
    commits: 15,
    additions: 1760,
    deletions: 2980,
    coverage: 87,
    critical: false,
    blockedReason: '',
    sessionId: 'CS-2417',
    updatedAt: '2026-03-09 20:12',
  },
  {
    id: 'TASK-2418',
    code: 'PC-ORD-2418',
    title: '死信队列回放工具与成功率监控',
    reqId: 'REQ-2406',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-observe',
    state: 'deployed',
    stateLabel: '已部署',
    priority: 'P2',
    ownerId: 'u-meng',
    reviewerId: 'u-shen',
    executor: 'ai',
    aiRatio: 83,
    points: 3,
    estimateHours: 12,
    actualHours: 11,
    startDate: '2026-03-06',
    endDate: '2026-03-13',
    progress: 100,
    sprintId: 'SP-24',
    componentIds: ['ac-event-bus'],
    apiIds: ['API-12'],
    storyIds: ['US-11'],
    tags: ['死信回放', '运维工具'],
    desc: '提供按时间窗与队列维度的死信回放能力，回放成功率 ≥ 99.5%，失败自动转人工工单。',
    mrId: 'MR-2418',
    branch: 'feat/dlq-replay-tool',
    commits: 11,
    additions: 1120,
    deletions: 160,
    coverage: 79,
    critical: false,
    blockedReason: '',
    sessionId: 'CS-2418',
    updatedAt: '2026-03-13 11:48',
  },
  {
    id: 'TASK-2419',
    code: 'PC-ORD-2419',
    title: '历史订单全量迁移作业（断点续传）',
    reqId: 'REQ-2407',
    epicId: 'EPIC-ORDER-REF',
    type: '技术债',
    stageId: 'st-code',
    state: 'dev',
    stateLabel: '开发中',
    priority: 'P1',
    ownerId: 'u-zhou',
    reviewerId: 'u-meng',
    executor: 'ai+human',
    aiRatio: 58,
    points: 8,
    estimateHours: 36,
    actualHours: 18,
    startDate: '2026-03-11',
    endDate: '2026-03-20',
    progress: 42,
    sprintId: 'SP-24',
    componentIds: ['ac-migrate-job', 'ac-order-db'],
    apiIds: ['API-14'],
    storyIds: ['US-12'],
    tags: ['数据迁移', '阻塞', 'BLOCK-0312'],
    desc: '4.7 亿历史订单分批迁移到新分片集群，单批 ≤ 5 万条，支持断点续传；预生产已跑通 3 轮，生产窗口待批。',
    mrId: 'MR-2419',
    branch: 'feat/order-migrate-job',
    commits: 13,
    additions: 2680,
    deletions: 320,
    coverage: 64,
    critical: true,
    blockedReason: 'DBA 未批复生产迁移窗口（BLOCK-0312），已阻塞 7 天，直接卡住 TASK-2421 切流发布',
    sessionId: 'CS-2419',
    updatedAt: '2026-03-19 08:55',
  },
  {
    id: 'TASK-2420',
    code: 'PC-ORD-2420',
    title: '双写开关与全量+增量比对校验',
    reqId: 'REQ-2407',
    epicId: 'EPIC-ORDER-REF',
    type: '测试',
    stageId: 'st-test',
    state: 'refined',
    stateLabel: '已拆解',
    priority: 'P1',
    ownerId: 'u-shen',
    reviewerId: 'u-he',
    executor: 'ai+human',
    aiRatio: 62,
    points: 5,
    estimateHours: 22,
    actualHours: 4,
    startDate: '2026-03-18',
    endDate: '2026-03-24',
    progress: 15,
    sprintId: 'SP-24',
    componentIds: ['ac-migrate-job'],
    apiIds: ['API-14'],
    storyIds: ['US-12'],
    tags: ['双写', '数据比对', '零资损'],
    desc: '迁移期开启双写，写失败自动降级单写并告警；按订单号逐字段比对全量与增量差异，差异率必须为 0。',
    mrId: '',
    branch: 'feat/order-dual-write-check',
    commits: 2,
    additions: 340,
    deletions: 0,
    coverage: 0,
    critical: true,
    blockedReason: '',
    sessionId: 'CS-2420',
    updatedAt: '2026-03-18 19:26',
  },
  {
    id: 'TASK-2421',
    code: 'PC-ORD-2421',
    title: '生产切流发布单 REL-2403：新分片集群读写切换',
    reqId: '',
    epicId: 'EPIC-ORDER-REF',
    type: '发布',
    stageId: 'st-deploy',
    state: 'dev',
    stateLabel: '开发中',
    priority: 'P0',
    ownerId: 'u-meng',
    reviewerId: 'u-lin',
    executor: 'human',
    aiRatio: 24,
    points: 3,
    estimateHours: 16,
    actualHours: 3,
    startDate: '2026-03-20',
    endDate: '2026-03-25',
    progress: 10,
    sprintId: 'SP-24',
    componentIds: ['ac-order-db', 'ac-migrate-job'],
    apiIds: [],
    storyIds: [],
    tags: ['发布单', '切流', 'P0', '被阻塞'],
    desc: '发布执行类工作项（不挂在具体需求下）：按 1% → 10% → 50% → 100% 四批灰度切换读写流量，配一键回切脚本，RTO ≤ 10 分钟。',
    mrId: '',
    branch: 'release/REL-2403',
    commits: 1,
    additions: 260,
    deletions: 0,
    coverage: 0,
    critical: true,
    blockedReason: '前置 TASK-2419 / TASK-2420 未完成，且发布门禁 G3 未通过（单测覆盖率 71.4% < 85%）',
    sessionId: '',
    updatedAt: '2026-03-19 17:50',
  },
  {
    id: 'TASK-2422',
    code: 'PC-ORD-2422',
    title: '敏感字段 SM4 加密与 KMS 密钥托管接入',
    reqId: 'REQ-2408',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'refined',
    stateLabel: '已拆解',
    priority: 'P2',
    ownerId: 'u-shen',
    reviewerId: 'u-lin',
    executor: 'ai+human',
    aiRatio: 44,
    points: 2,
    estimateHours: 12,
    actualHours: 0,
    startDate: '2026-03-19',
    endDate: '2026-03-24',
    progress: 0,
    sprintId: 'SP-24',
    componentIds: ['ac-mask-sdk'],
    apiIds: [],
    storyIds: ['US-13'],
    tags: ['合规', 'SM4', 'KMS'],
    desc: '收件人手机号、地址、身份证落库使用 SM4 加密，密钥托管企业 KMS，接入 SEC-MASK-2.1 注解驱动方案。',
    mrId: '',
    branch: 'feat/order-field-encryption',
    commits: 0,
    additions: 0,
    deletions: 0,
    coverage: 0,
    critical: false,
    blockedReason: '',
    sessionId: '',
    updatedAt: '2026-03-13 16:20',
  },
  {
    id: 'TASK-2423',
    code: 'PC-ORD-2423',
    title: '展示脱敏与导出二次授权',
    reqId: 'REQ-2408',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-code',
    state: 'refined',
    stateLabel: '已拆解',
    priority: 'P2',
    ownerId: 'u-chen',
    reviewerId: 'u-lin',
    executor: 'ai+human',
    aiRatio: 68,
    points: 2,
    estimateHours: 14,
    actualHours: 0,
    startDate: '2026-03-20',
    endDate: '2026-03-25',
    progress: 0,
    sprintId: 'SP-24',
    componentIds: ['ac-mask-sdk', 'ac-order-query'],
    apiIds: ['API-13'],
    storyIds: ['US-13', 'US-14'],
    tags: ['脱敏', '二次授权', 'Vue3'],
    desc: '手机号默认展示 138****8000，导出走主管二次授权流程并携带审批单号，前端提供授权弹窗与倒计时。',
    mrId: '',
    branch: 'feat/order-mask-export',
    commits: 0,
    additions: 0,
    deletions: 0,
    coverage: 0,
    critical: false,
    blockedReason: '',
    sessionId: '',
    updatedAt: '2026-03-13 16:22',
  },
  {
    id: 'TASK-2424',
    code: 'PC-ORD-2424',
    title: '查询/导出行为审计留痕与越权告警',
    reqId: 'REQ-2408',
    epicId: 'EPIC-ORDER-REF',
    type: '开发',
    stageId: 'st-observe',
    state: 'backlog',
    stateLabel: '需求池',
    priority: 'P2',
    ownerId: 'u-meng',
    reviewerId: 'u-he',
    executor: 'ai',
    aiRatio: 75,
    points: 1,
    estimateHours: 8,
    actualHours: 0,
    startDate: '2026-03-23',
    endDate: '2026-03-26',
    progress: 0,
    sprintId: 'SP-24',
    componentIds: ['ac-audit-store'],
    apiIds: ['API-06', 'API-13'],
    storyIds: ['US-14'],
    tags: ['审计', '告警', '个保法'],
    desc: '查询与导出行为 100% 留痕（日志保留 ≥ 180 天），越权访问实时告警并阻断，支持按人回溯。',
    mrId: '',
    branch: 'feat/order-audit-alert',
    commits: 0,
    additions: 0,
    deletions: 0,
    coverage: 0,
    critical: false,
    blockedReason: '',
    sessionId: '',
    updatedAt: '2026-03-13 16:25',
  },
];

export const TASK_MAP: Record<string, TaskDef> = TASKS.reduce<Record<string, TaskDef>>((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {});

/** PingCode 工作项编号 -> 任务 */
export const TASK_BY_CODE: Record<string, TaskDef> = TASKS.reduce<Record<string, TaskDef>>((acc, t) => {
  acc[t.code] = t;
  return acc;
}, {});

/* -------------------------------------------------------------------------
 * 9. 任务事件流（时间线）
 * ---------------------------------------------------------------------- */

export interface TaskEventDef {
  id: string;
  taskId: string;
  time: string;
  /** 'u-*' 人员 / 'ag-*' Agent / 'system' 平台 */
  actorId: string;
  actorType: 'human' | 'agent' | 'system';
  kind: 'assign' | 'state' | 'commit' | 'review' | 'gate' | 'risk' | 'comment' | 'sync' | 'test';
  title: string;
  detail: string;
  tone: Tone;
}

export const TASK_EVENTS: TaskEventDef[] = [
  {
    id: 'TE-001',
    taskId: 'TASK-2401',
    time: '2026-03-02 09:12',
    actorId: 'system',
    actorType: 'system',
    kind: 'assign',
    title: '任务由需求拆解自动生成',
    detail: '需求 Agent 依据 PRD-ORD-v2.3 第 3.2 节拆出本任务，挂载组件 ac-order-api / ac-idem-guard，指派给周浩然（u-zhou），预估 8 点 / 32 小时。',
    tone: 'neutral',
  },
  {
    id: 'TE-002',
    taskId: 'TASK-2401',
    time: '2026-03-02 10:40',
    actorId: 'ag-code',
    actorType: 'agent',
    kind: 'commit',
    title: 'AI 拉起编码会话 CS-2401',
    detail: '编码 Agent 载入 ac-order-api / ac-idem-guard 上下文共 12,480 行，命中知识库 KB-CODE-02（幂等键设计规范），生成 4 个骨架类。',
    tone: 'ai',
  },
  {
    id: 'TE-003',
    taskId: 'TASK-2401',
    time: '2026-03-04 16:20',
    actorId: 'u-zhou',
    actorType: 'human',
    kind: 'commit',
    title: 'Redis SETNX 快路径落地',
    detail: 'feat/order-idempotency 第 12 次提交，新增 IdempotencyGuard 与 IdempotencyRecordMapper，+1,240 / -180。',
    tone: 'info',
  },
  {
    id: 'TE-004',
    taskId: 'TASK-2401',
    time: '2026-03-06 11:05',
    actorId: 'ag-review',
    actorType: 'agent',
    kind: 'review',
    title: 'AI 评审提出 3 条问题',
    detail: '① SETNX 未设置 TTL，存在键泄漏；② 异常分支吞掉 DuplicateKeyException；③ 日志明文打印收件人手机号，违反 SEC-MASK-2.1。',
    tone: 'warn',
  },
  {
    id: 'TE-005',
    taskId: 'TASK-2401',
    time: '2026-03-06 15:48',
    actorId: 'u-yan',
    actorType: 'human',
    kind: 'review',
    title: '架构师复核通过（附条件）',
    detail: '严慕舟确认整体方案，要求 TTL 提取为配置项 order.idem.ttl-seconds，脱敏统一走 SEC-MASK-2.1 注解，禁止手写掩码。',
    tone: 'ok',
  },
  {
    id: 'TE-006',
    taskId: 'TASK-2401',
    time: '2026-03-18 15:22',
    actorId: 'system',
    actorType: 'system',
    kind: 'state',
    title: '状态流转：开发中 → 自动化测试中',
    detail: '触发发布门禁 G3 预检，本任务分支覆盖率 88%，达标；但需求级聚合覆盖率受 TASK-2405 拖累为 71.4%。',
    tone: 'brand',
  },
  {
    id: 'TE-007',
    taskId: 'TASK-2402',
    time: '2026-03-09 18:40',
    actorId: 'ag-review',
    actorType: 'agent',
    kind: 'review',
    title: 'AI 评审通过，无 must-fix',
    detail: 'outbox 中继的指数退避与死信转投实现符合 KB-ARCH-01 的最终一致性规范，MR-2402 自动合并。',
    tone: 'ok',
  },
  {
    id: 'TE-008',
    taskId: 'TASK-2403',
    time: '2026-03-11 14:36',
    actorId: 'u-yan',
    actorType: 'human',
    kind: 'review',
    title: '第 1 轮评审打回',
    detail: '事务边界收敛后，优惠核销回滚缺少幂等保护，重复补偿会二次释放券；要求引入 compensation_id 唯一约束。',
    tone: 'danger',
  },
  {
    id: 'TE-009',
    taskId: 'TASK-2403',
    time: '2026-03-19 10:05',
    actorId: 'u-zhou',
    actorType: 'human',
    kind: 'review',
    title: '第 2 轮评审提交，等待复核',
    detail: 'MR-2403 已按意见补齐 compensation_id 与仓储组联调用例，当前剩余 1 条 should-fix（补偿超时告警阈值可配置）。',
    tone: 'warn',
  },
  {
    id: 'TE-010',
    taskId: 'TASK-2405',
    time: '2026-03-10 09:30',
    actorId: 'ag-test',
    actorType: 'agent',
    kind: 'test',
    title: '测试 Agent 生成 186 个单测骨架',
    detail: '基于 API-01 / API-04 契约与 US-01、US-02 的验收标准生成，正常路径 112 个、异常路径 74 个，Mock 依赖 9 个。',
    tone: 'ai',
  },
  {
    id: 'TE-011',
    taskId: 'TASK-2405',
    time: '2026-03-16 18:02',
    actorId: 'system',
    actorType: 'system',
    kind: 'gate',
    title: 'G3 门禁第 1 次失败',
    detail: '分支覆盖率 68.2% < 85%，PIPE-2407 在 unit-test 阶段中断，未进入 build-image。',
    tone: 'danger',
  },
  {
    id: 'TE-012',
    taskId: 'TASK-2405',
    time: '2026-03-19 17:42',
    actorId: 'system',
    actorType: 'system',
    kind: 'gate',
    title: 'G3 门禁第 3 次失败',
    detail: '分支覆盖率 71.4% < 85%（新增 34 个用例后提升 3.2 个百分点），缺口集中在库存扣减失败回滚与重复提交拒绝两条异常分支；PIPE-2409 已中断并通知林知远。',
    tone: 'danger',
  },
  {
    id: 'TE-013',
    taskId: 'TASK-2405',
    time: '2026-03-19 17:45',
    actorId: 'u-he',
    actorType: 'human',
    kind: 'comment',
    title: '何斯年给出补测建议',
    detail: '建议补充 12 个异常回滚用例，可让测试 Agent 基于 BUG-1043 的复现路径与 TASK-2403 补偿分支反向生成，预计 2 小时内可补齐。',
    tone: 'info',
  },
  {
    id: 'TE-014',
    taskId: 'TASK-2406',
    time: '2026-03-13 09:18',
    actorId: 'ag-code',
    actorType: 'agent',
    kind: 'commit',
    title: 'AI 完成 6 处 if-else 替换',
    detail: '识别并替换 OrderService、RefundService 等 6 处硬编码状态判断，统一收敛到 OrderStateMachine.transit()，删除 2,860 行分支代码。',
    tone: 'ai',
  },
  {
    id: 'TE-015',
    taskId: 'TASK-2406',
    time: '2026-03-19 09:30',
    actorId: 'u-zhou',
    actorType: 'human',
    kind: 'comment',
    title: '待补充：非法流转的可观测埋点',
    detail: 'ORDER_STATE_ILLEGAL 目前只返回错误码，需补 state_illegal_total 指标与 traceId 落审计流水，与 TASK-2408 联动。',
    tone: 'neutral',
  },
  {
    id: 'TE-016',
    taskId: 'TASK-2407',
    time: '2026-03-13 14:20',
    actorId: 'ag-arch',
    actorType: 'agent',
    kind: 'comment',
    title: '架构 Agent 输出两套热更新方案',
    detail: '方案 A：本地缓存双 buffer + 版本号轮询，实现简单、生效延迟 30s；方案 B：Nacos 配置中心推送 + 灰度标签，生效延迟 < 3s，但引入新依赖。Agent 推荐 B，风险是配置中心单点。',
    tone: 'ai',
  },
  {
    id: 'TE-017',
    taskId: 'TASK-2407',
    time: '2026-03-19 11:55',
    actorId: 'system',
    actorType: 'system',
    kind: 'risk',
    title: '方案确认超 SLA，触发提醒',
    detail: '方案设计态停留 6 天，超 architect 角色 24 小时确认 SLA；已推送通知 n4 给严慕舟与林知远，任务保持 dev（开发中）未推进。',
    tone: 'warn',
  },
  {
    id: 'TE-018',
    taskId: 'TASK-2410',
    time: '2026-03-15 10:10',
    actorId: 'u-shen',
    actorType: 'human',
    kind: 'comment',
    title: 'BUG-1043 根因定位',
    detail: '分摊使用 double 累加后再四舍五入，3 件商品各分摊 33.33 时合计 99.99，与应付 100.00 差 0.01，触发财务对账告警。',
    tone: 'danger',
  },
  {
    id: 'TE-019',
    taskId: 'TASK-2410',
    time: '2026-03-19 16:08',
    actorId: 'ag-review',
    actorType: 'agent',
    kind: 'review',
    title: 'MR-2410 第 2 轮 AI 评审',
    detail: '剩余 1 条 must-fix：最大余额法在负向分摊（退款）场景下未处理余数方向，可能产生 -0.01；另附 2 条 should-fix（BigDecimal 未指定 RoundingMode）。',
    tone: 'warn',
  },
  {
    id: 'TE-020',
    taskId: 'TASK-2412',
    time: '2026-03-18 18:31',
    actorId: 'ag-pm',
    actorType: 'agent',
    kind: 'risk',
    title: '检测到资源冲突 GANTT-CF-03',
    detail: 'TASK-2412（03-09~03-17）与 TASK-2415（03-16~03-23）在 03-16~03-17 同时占用周浩然，日负载 13.5 小时，超单人日产能 8 小时 68%。',
    tone: 'warn',
  },
  {
    id: 'TE-021',
    taskId: 'TASK-2413',
    time: '2026-03-13 17:26',
    actorId: 'u-yan',
    actorType: 'human',
    kind: 'review',
    title: '分片方案评审通过',
    detail: '订单号基因位与用户 ID 后 6 位一致，双向查询均单分片命中；压测 12,000 TPS 下 P99 从 210ms 降至 46ms，MR-2413 合并。',
    tone: 'ok',
  },
  {
    id: 'TE-022',
    taskId: 'TASK-2415',
    time: '2026-03-16 09:05',
    actorId: 'ag-arch',
    actorType: 'agent',
    kind: 'comment',
    title: '架构 Agent 开始扫描履约域',
    detail: '读取 38 个类 / 9,600 行代码，识别出商家、仓库、类目、重量四类拆单因子，生成 6 条候选规则与子订单聚合关系草案。',
    tone: 'ai',
  },
  {
    id: 'TE-023',
    taskId: 'TASK-2415',
    time: '2026-03-19 11:20',
    actorId: 'ag-arch',
    actorType: 'agent',
    kind: 'state',
    title: '任务已创建，等待架构 Agent 启动',
    detail: '任务已创建并绑定 PingCode 工作项 PC-ORD-2415；聚合根边界存在两种切法（父订单为聚合根 / 子订单独立聚合根），AI 无法自行决策，需严慕舟确认后进入开发；同时该任务与 TASK-2412 存在负责人冲突。',
    tone: 'warn',
  },
  {
    id: 'TE-024',
    taskId: 'TASK-2417',
    time: '2026-03-09 20:12',
    actorId: 'system',
    actorType: 'system',
    kind: 'state',
    title: '任务已部署并同步 PingCode',
    detail: 'MR-2417 合并至 release/24.3，12 个下游系统进入新旧双发兼容期（截止 2026-04-30），状态回写 PingCode 工作项 PC-ORD-2417。',
    tone: 'ok',
  },
  {
    id: 'TE-025',
    taskId: 'TASK-2419',
    time: '2026-03-12 09:00',
    actorId: 'system',
    actorType: 'system',
    kind: 'risk',
    title: '阻塞单 BLOCK-0312 创建',
    detail: 'DBA 团队未批复生产迁移窗口，理由：3 月为财务结算敏感期，全量迁移需与结算窗口错开；阻塞类型「外部依赖」。',
    tone: 'danger',
  },
  {
    id: 'TE-026',
    taskId: 'TASK-2419',
    time: '2026-03-19 08:55',
    actorId: 'ag-pm',
    actorType: 'agent',
    kind: 'risk',
    title: '阻塞超 SLA，升级至研发总监',
    detail: 'BLOCK-0312 已持续 7 天（SLA 4 天），影响 TASK-2420 双写比对与 TASK-2421 生产切流；AI 给出两个方案：申请 03-28 结算后窗口 / 拆分为按用户分片的多批次小窗口。',
    tone: 'danger',
  },
  {
    id: 'TE-027',
    taskId: 'TASK-2419',
    time: '2026-03-19 09:02',
    actorId: 'system',
    actorType: 'system',
    kind: 'sync',
    title: '阻塞信息同步至 PingCode（SYNC-0231）',
    detail: '同步字段：状态 dev、阻塞原因、预计解除时间 2026-03-23、影响工作项 PC-ORD-2420 / PC-ORD-2421；同步耗时 1.2s，结果成功。',
    tone: 'info',
  },
  {
    id: 'TE-028',
    taskId: 'TASK-2421',
    time: '2026-03-19 17:50',
    actorId: 'ag-ops',
    actorType: 'agent',
    kind: 'gate',
    title: '发布门禁预检失败',
    detail: '预检项 6 个通过 4 个：G3 单测覆盖率 71.4% < 85% 未通过；前置 TASK-2419 / TASK-2420 未完成；回切脚本与灰度批次配置已就绪。',
    tone: 'danger',
  },
  {
    id: 'TE-029',
    taskId: 'TASK-2421',
    time: '2026-03-19 17:52',
    actorId: 'u-meng',
    actorType: 'human',
    kind: 'comment',
    title: '孟星回：建议切流顺延',
    detail: '一键回切脚本已在预生产演练 2 次（RTO 6.5 分钟）；若 BLOCK-0312 在 03-23 解除，建议把 1% 灰度顺延至 03-26、100% 切流顺延至 04-02，需 PMO 确认迭代范围调整。',
    tone: 'warn',
  },
  {
    id: 'TE-030',
    taskId: 'TASK-2421',
    time: '2026-03-19 18:05',
    actorId: 'u-lin',
    actorType: 'human',
    kind: 'comment',
    title: '林知远决策：先补门禁，再谈窗口',
    detail: '要求 24 小时内把 G3 覆盖率补到 85%（TASK-2405），同时授权孟星回向 DBA 申请 03-28 迁移窗口；发布单 REL-2403 保持 blocked。',
    tone: 'brand',
  },
];

export const TASK_EVENT_MAP: Record<string, TaskEventDef[]> = TASK_EVENTS.reduce<
  Record<string, TaskEventDef[]>
>((acc, e) => {
  if (!acc[e.taskId]) acc[e.taskId] = [];
  acc[e.taskId].push(e);
  return acc;
}, {});

/* -------------------------------------------------------------------------
 * 10. 任务依赖与关键路径
 * ---------------------------------------------------------------------- */

export interface TaskDepDef {
  id: string;
  /** 前置任务 */
  from: string;
  /** 后继任务 */
  to: string;
  type: 'finish-start' | 'start-start' | 'finish-finish';
  /** 滞后天数，负数表示提前 */
  lagDays: number;
  critical: boolean;
  note: string;
}

export const TASK_DEPS: TaskDepDef[] = [
  {
    id: 'DEP-01',
    from: 'TASK-2401',
    to: 'TASK-2403',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '幂等下单接口冻结后，才能收敛库存扣减的事务边界',
  },
  {
    id: 'DEP-02',
    from: 'TASK-2401',
    to: 'TASK-2405',
    type: 'start-start',
    lagDays: 3,
    critical: true,
    note: '下单主链路编码启动 3 天后并行补测，G3 门禁前置',
  },
  {
    id: 'DEP-03',
    from: 'TASK-2406',
    to: 'TASK-2407',
    type: 'finish-start',
    lagDays: 0,
    critical: false,
    note: '状态机组件落地后才做规则配置化热更新',
  },
  {
    id: 'DEP-04',
    from: 'TASK-2406',
    to: 'TASK-2408',
    type: 'start-start',
    lagDays: 2,
    critical: false,
    note: '审计流水依赖状态机的 transit 事件钩子',
  },
  {
    id: 'DEP-05',
    from: 'TASK-2409',
    to: 'TASK-2410',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '规则引擎建模完成后才能修金额分摊精度（BUG-1043）',
  },
  {
    id: 'DEP-06',
    from: 'TASK-2410',
    to: 'TASK-2411',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '金额口径统一后才能做试算与下单的强一致校验',
  },
  {
    id: 'DEP-07',
    from: 'TASK-2411',
    to: 'TASK-2421',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '试算一致性是切流前的资损红线校验项',
  },
  {
    id: 'DEP-08',
    from: 'TASK-2413',
    to: 'TASK-2412',
    type: 'finish-start',
    lagDays: 1,
    critical: true,
    note: '分库分表路由确定后，缓存 Key 与失效策略才能定稿',
  },
  {
    id: 'DEP-09',
    from: 'TASK-2412',
    to: 'TASK-2414',
    type: 'finish-start',
    lagDays: 2,
    critical: false,
    note: '后端查询链路达标后前端才切游标分页',
  },
  {
    id: 'DEP-10',
    from: 'TASK-2412',
    to: 'TASK-2415',
    type: 'start-start',
    lagDays: 0,
    critical: false,
    note: '软依赖：两任务同为周浩然负责，03-16~03-17 产能冲突（GANTT-CF-03）',
  },
  {
    id: 'DEP-11',
    from: 'TASK-2415',
    to: 'TASK-2416',
    type: 'finish-start',
    lagDays: 0,
    critical: false,
    note: '拆单引擎接口冻结后前端才能做父子订单聚合视图',
  },
  {
    id: 'DEP-12',
    from: 'TASK-2402',
    to: 'TASK-2417',
    type: 'start-start',
    lagDays: 0,
    critical: false,
    note: 'outbox 投递通道与 CloudEvents 信封同步改造',
  },
  {
    id: 'DEP-13',
    from: 'TASK-2417',
    to: 'TASK-2418',
    type: 'finish-start',
    lagDays: 0,
    critical: false,
    note: '事件信封统一后死信格式才稳定，回放工具随之落地',
  },
  {
    id: 'DEP-14',
    from: 'TASK-2413',
    to: 'TASK-2419',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '新分片集群就绪是历史数据全量迁移的前提',
  },
  {
    id: 'DEP-15',
    from: 'TASK-2419',
    to: 'TASK-2420',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '迁移作业跑通后才能开启双写与全量+增量比对',
  },
  {
    id: 'DEP-16',
    from: 'TASK-2419',
    to: 'TASK-2421',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '迁移未完成则切流无数据基础（当前被 BLOCK-0312 阻塞）',
  },
  {
    id: 'DEP-17',
    from: 'TASK-2420',
    to: 'TASK-2421',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '双写差异率必须为 0 才允许生产切流',
  },
  {
    id: 'DEP-18',
    from: 'TASK-2405',
    to: 'TASK-2421',
    type: 'finish-start',
    lagDays: 0,
    critical: true,
    note: '单测覆盖率达标是发布门禁 G3 的硬性条件（当前 71.4% 未通过）',
  },
  {
    id: 'DEP-19',
    from: 'TASK-2422',
    to: 'TASK-2423',
    type: 'finish-start',
    lagDays: 0,
    critical: false,
    note: '先落库加密，再做展示脱敏与导出二次授权',
  },
  {
    id: 'DEP-20',
    from: 'TASK-2423',
    to: 'TASK-2424',
    type: 'finish-start',
    lagDays: 1,
    critical: false,
    note: '导出授权流程确定后，审计留痕与越权告警规则才能定稿',
  },
];

/** Sprint 24 关键路径（自 REQ-2401 起至 REL-2403 切流止） */
export const CRITICAL_PATH: string[] = [
  'TASK-2401',
  'TASK-2403',
  'TASK-2405',
  'TASK-2413',
  'TASK-2412',
  'TASK-2409',
  'TASK-2410',
  'TASK-2411',
  'TASK-2419',
  'TASK-2420',
  'TASK-2421',
];

/* -------------------------------------------------------------------------
 * 11. 排期冲突（甘特图）
 * ---------------------------------------------------------------------- */

export interface GanttConflictDef {
  id: string;
  type: 'resource' | 'dependency' | 'capacity' | 'deadline' | 'gate';
  severity: 'high' | 'medium' | 'low';
  title: string;
  taskIds: string[];
  /** 冲突归属人，capacity 类可为空串 */
  ownerId: string;
  windowStart: string;
  windowEnd: string;
  /** 超出产能的小时数，非资源类为 0 */
  overloadHours: number;
  detectedBy: string;
  detectedAt: string;
  impact: string;
  suggestion: string;
  status: 'open' | 'accepted' | 'resolved' | 'ignored';
}

export const GANTT_CONFLICTS: GanttConflictDef[] = [
  {
    id: 'GANTT-CF-01',
    type: 'dependency',
    severity: 'high',
    title: 'BLOCK-0312 阻塞数据迁移，关键路径顺延 5 天',
    taskIds: ['TASK-2419', 'TASK-2420', 'TASK-2421'],
    ownerId: 'u-zhou',
    windowStart: '2026-03-12',
    windowEnd: '2026-03-25',
    overloadHours: 0,
    detectedBy: 'ag-pm',
    detectedAt: '2026-03-12 09:20',
    impact: 'TASK-2419 已阻塞 7 天，向后传导至 TASK-2420（双写比对）与 TASK-2421（生产切流），关键路径末端超出迭代收尾日 03-27 的风险为 62%。',
    suggestion: '方案一：申请 03-28 财务结算后窗口，切流顺延至 04-02；方案二：按用户 ID 分片拆成 4 个小窗口（每批 ≤ 1.2 亿条），可在结算期内低峰执行。建议方案二，需 DBA 与财务双方确认。',
    status: 'open',
  },
  {
    id: 'GANTT-CF-02',
    type: 'capacity',
    severity: 'medium',
    title: 'SP-24 剩余产能不足以覆盖未启动工作项',
    taskIds: ['TASK-2408', 'TASK-2416', 'TASK-2422', 'TASK-2423', 'TASK-2424'],
    ownerId: '',
    windowStart: '2026-03-19',
    windowEnd: '2026-03-27',
    overloadHours: 18,
    detectedBy: 'ag-pm',
    detectedAt: '2026-03-19 07:30',
    impact: '迭代容量 104 小时 / 人，已承诺 96 小时；5 个 refined 态工作项合计需 68 小时，而 03-19 之后团队剩余可用产能为 50 小时，缺口 18 小时。',
    suggestion: '将 TASK-2416（拆单前端，P2）与 TASK-2424（审计告警，P2）移入 SP-25，可释放 28 小时；或从 SP-25 借调沈亦白 2 天支援合规三任务。',
    status: 'open',
  },
  {
    id: 'GANTT-CF-03',
    type: 'resource',
    severity: 'high',
    title: '周浩然在 03-16~03-17 被 TASK-2412 与 TASK-2415 双重占用',
    taskIds: ['TASK-2412', 'TASK-2415'],
    ownerId: 'u-zhou',
    windowStart: '2026-03-16',
    windowEnd: '2026-03-17',
    overloadHours: 11,
    detectedBy: 'ag-pm',
    detectedAt: '2026-03-18 18:31',
    impact: '两任务在 03-16~03-17 重叠，日负载 13.5 小时（超单人日产能 8 小时 68%）；TASK-2412 实际耗时 27 小时 / 预估 24 小时，TASK-2415 分析进度仅 28%，两者互相挤占导致缓存一致性验证被压缩。',
    suggestion: '把 TASK-2415 拆单引擎的负责人改为沈亦白（u-shen，03-20 后有余量），或将 TASK-2415 起始日顺延至 03-18；同时把 ac-split-engine 的 AI 分析交给架构 Agent 全自动推进，减少人工占用。',
    status: 'accepted',
  },
  {
    id: 'GANTT-CF-04',
    type: 'gate',
    severity: 'high',
    title: 'G3 单测门禁连续 3 次失败，发布窗口面临丢失',
    taskIds: ['TASK-2405', 'TASK-2421'],
    ownerId: 'u-ai-copilot',
    windowStart: '2026-03-16',
    windowEnd: '2026-03-20',
    overloadHours: 0,
    detectedBy: 'ag-test',
    detectedAt: '2026-03-19 17:42',
    impact: '分支覆盖率 71.4% < 85%，PIPE-2409 中断，TASK-2421 发布单无法进入审批；03-20 的原定灰度窗口若丢失，需重新排队至 03-27 之后。',
    suggestion: '让测试 Agent 基于 BUG-1043 复现路径与 TASK-2403 补偿分支反向生成 12 个异常回滚用例（预计 2 小时），人工复核后重跑流水线；如仍不达标，由林知远走门禁例外审批并记录风险接受。',
    status: 'open',
  },
  {
    id: 'GANTT-CF-05',
    type: 'deadline',
    severity: 'medium',
    title: 'TASK-2415 拆单引擎完成日逼近 REQ-2405 交付节点',
    taskIds: ['TASK-2415', 'TASK-2416'],
    ownerId: 'u-zhou',
    windowStart: '2026-03-23',
    windowEnd: '2026-03-25',
    overloadHours: 0,
    detectedBy: 'ag-pm',
    detectedAt: '2026-03-19 07:30',
    impact: 'TASK-2415 计划 03-23 完成，后置 TASK-2416 需 5 天但只剩 2 天（03-23~03-25），拆单前端极可能顺延至 SP-25，REQ-2405 无法在本迭代验收。',
    suggestion: '将 REQ-2405 的验收范围收缩为「服务端拆单 + 接口返回聚合结构」，前端聚合视图移入 SP-25；或提前在 03-19 锁定聚合根边界，让 AI 并行生成前端脚手架。',
    status: 'open',
  },
  {
    id: 'GANTT-CF-06',
    type: 'resource',
    severity: 'low',
    title: '沈亦白在 03-19~03-20 同时挂 3 个 refined 态工作项',
    taskIds: ['TASK-2420', 'TASK-2422', 'TASK-2407'],
    ownerId: 'u-shen',
    windowStart: '2026-03-19',
    windowEnd: '2026-03-20',
    overloadHours: 4,
    detectedBy: 'ag-pm',
    detectedAt: '2026-03-19 07:30',
    impact: 'TASK-2407 等待方案确认、TASK-2420 等待迁移窗口、TASK-2422 尚未启动，若三项在 03-20 同时解锁，日负载将达 12 小时。',
    suggestion: '为 TASK-2422（SM4 加密）预设 AI 全自动执行，沈亦白仅做评审；TASK-2407 方案确认超 48 小时则自动降级为方案 A（本地双 buffer）。',
    status: 'ignored',
  },
];

/* -------------------------------------------------------------------------
 * 12. AI 编码协作会话
 * ---------------------------------------------------------------------- */

export interface SessionTurnDef {
  seq: number;
  role: 'user' | 'ai' | 'tool';
  /** 'u-*' 或 'ag-*' */
  actorId: string;
  time: string;
  content: string;
  tokens: number;
  /** role 为 tool 时的工具名，其余为空串 */
  toolName: string;
  durationMs: number;
}

export interface CodingSessionDef {
  id: string;
  taskId: string;
  /** 主导 Agent */
  agentId: string;
  /** 使用模型 */
  modelId: string;
  /** 发起人 */
  ownerId: string;
  status: 'running' | 'waiting' | 'paused' | 'done' | 'failed';
  startedAt: string;
  endedAt: string;
  durationMin: number;
  turns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  /** AI 建议采纳率（%） */
  acceptRate: number;
  filesChanged: number;
  additions: number;
  deletions: number;
  toolCalls: number;
  /** 人工介入次数 */
  humanInterventions: number;
  repoBranch: string;
  contextFiles: string[];
  /** 命中的知识库条目 */
  kbHits: string[];
  summary: string;
  risks: string[];
  transcript: SessionTurnDef[];
}

export const CODING_SESSIONS: CodingSessionDef[] = [
  {
    id: 'CS-2401',
    taskId: 'TASK-2401',
    agentId: 'ag-code',
    modelId: 'mdl-claude',
    ownerId: 'u-zhou',
    status: 'waiting',
    startedAt: '2026-03-02 10:40',
    endedAt: '2026-03-18 15:20',
    durationMin: 412,
    turns: 46,
    promptTokens: 268400,
    completionTokens: 96200,
    totalTokens: 364600,
    costUsd: 8.42,
    acceptRate: 82,
    filesChanged: 18,
    additions: 3860,
    deletions: 1240,
    toolCalls: 132,
    humanInterventions: 7,
    repoBranch: 'feat/order-idempotency',
    contextFiles: [
      'order-api/src/main/java/com/mall/order/api/OrderCreateController.java',
      'order-domain/src/main/java/com/mall/order/domain/service/OrderCreateService.java',
      'order-infra/src/main/java/com/mall/order/infra/idem/IdempotencyGuard.java',
      'docs/api/API-01-create-order.md',
    ],
    kbHits: ['KB-CODE-02', 'KB-ARCH-01'],
    summary:
      '完成幂等下单主链路：Idempotency-Key 解析 → Redis SETNX 快路径 → MySQL 唯一索引兜底 → 命中回放首次结果，并补齐 4 类错误码。AI 产出 76%，人工主要修正事务传播与脱敏注解。',
    risks: ['SETNX 与 DB 唯一索引之间存在 200ms 窗口，极端并发下会落库冲突（已由唯一索引兜底）'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-02 10:40',
        content: '按 API-01 契约给下单接口加幂等，要求重复提交返回首次结果，不要抛 500。',
        tokens: 420,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-02 10:41',
        content: '检索知识库命中 KB-CODE-02「幂等键设计规范」：键格式 {业务域}:{租户}:{客户端请求号}，TTL 建议 24h，落库需唯一索引。',
        tokens: 1180,
        toolName: 'kb.search',
        durationMs: 640,
      },
      {
        seq: 3,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-02 10:44',
        content:
          '方案：新增 IdempotencyGuard，先 SETNX order:idem:{key} TTL=86400 占位；占位成功走正常创建，占位失败读 idempotency_record 回放首次结果；DB 层加 uk_idem_key 唯一索引兜底。共改 6 个文件，是否执行？',
        tokens: 2260,
        toolName: '',
        durationMs: 18400,
      },
      {
        seq: 4,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-02 10:52',
        content: '可以，但 TTL 要走配置项，别写死；另外日志里的手机号必须脱敏。',
        tokens: 180,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 5,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-02 11:26',
        content: 'edit_file ×6：新增 IdempotencyGuard / IdempotencyRecord / IdempotencyRecordMapper，改 OrderCreateService、application-order.yaml、OrderCreateController。',
        tokens: 3860,
        toolName: 'fs.edit',
        durationMs: 96000,
      },
      {
        seq: 6,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-02 11:31',
        content:
          '已落地：order.idem.ttl-seconds=86400 配置化；日志改用 @SecMask 注解输出 138****8000；新增 24 个单测，本地跑通 22 个，2 个因 Mock 时钟失败，已改为 Clock 注入。',
        tokens: 1620,
        toolName: '',
        durationMs: 22600,
      },
    ],
  },
  {
    id: 'CS-2402',
    taskId: 'TASK-2402',
    agentId: 'ag-code',
    modelId: 'mdl-deepseek',
    ownerId: 'u-shen',
    status: 'done',
    startedAt: '2026-03-03 09:15',
    endedAt: '2026-03-09 18:30',
    durationMin: 268,
    turns: 31,
    promptTokens: 142800,
    completionTokens: 61400,
    totalTokens: 204200,
    costUsd: 2.16,
    acceptRate: 91,
    filesChanged: 11,
    additions: 2140,
    deletions: 380,
    toolCalls: 84,
    humanInterventions: 3,
    repoBranch: 'feat/outbox-relay',
    contextFiles: [
      'order-infra/src/main/java/com/mall/order/infra/outbox/OutboxRelay.java',
      'order-infra/src/main/resources/db/migration/V24_3__outbox.sql',
      'docs/adr/ADR-2401-03-eventual-consistency.md',
    ],
    kbHits: ['KB-ARCH-01'],
    summary:
      '实现本地消息表 outbox + 独立中继投递 RabbitMQ，指数退避 2^n 最多 6 次，超限进死信并告警；全程 AI 自主完成，人工仅确认表结构与索引。',
    risks: ['中继线程单实例消费，若实例挂掉需依赖 leader 选举切换，最长空窗 30s'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-03 09:15',
        content: '按 ADR-2401-03 落 outbox，事务内写表，事务外投递，失败要能重试。',
        tokens: 360,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-03 09:22',
        content:
          '设计：outbox_event(id, aggregate_id, event_type, payload, status, retry_count, next_retry_at)，唯一索引 (aggregate_id, event_type, biz_key)；中继按 next_retry_at 扫描，退避 2^retry_count 分钟，6 次后进 DLQ 并打 outbox_dead_total 指标。',
        tokens: 2040,
        toolName: '',
        durationMs: 16200,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-03 10:05',
        content: 'run_tests：42 个用例全部通过；覆盖率 91%；SQL 迁移脚本在 testcontainers MySQL8 上校验通过。',
        tokens: 1420,
        toolName: 'shell.run',
        durationMs: 128000,
      },
      {
        seq: 4,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-09 18:30',
        content: '评审无异议，合并。注意死信告警接到孟星回的值班群。',
        tokens: 140,
        toolName: '',
        durationMs: 0,
      },
    ],
  },
  {
    id: 'CS-2403',
    taskId: 'TASK-2403',
    agentId: 'ag-code',
    modelId: 'mdl-claude',
    ownerId: 'u-zhou',
    status: 'waiting',
    startedAt: '2026-03-05 14:00',
    endedAt: '2026-03-19 10:00',
    durationMin: 386,
    turns: 52,
    promptTokens: 312600,
    completionTokens: 118400,
    totalTokens: 431000,
    costUsd: 10.28,
    acceptRate: 64,
    filesChanged: 22,
    additions: 2680,
    deletions: 1920,
    toolCalls: 168,
    humanInterventions: 12,
    repoBranch: 'feat/order-tx-boundary',
    contextFiles: [
      'order-domain/src/main/java/com/mall/order/domain/service/InventoryDeductService.java',
      'order-domain/src/main/java/com/mall/order/domain/service/PromotionApplyService.java',
      'warehouse-client/src/main/java/com/mall/wh/client/StockClient.java',
    ],
    kbHits: ['KB-ARCH-01', 'KB-CODE-05'],
    summary:
      '把库存扣减与优惠核销收敛进同一事务边界，失败时订单回滚 CLOSED 并释放已核销优惠；跨组联调 3 轮，AI 首版方案被打回 1 次（补偿缺少幂等保护）。',
    risks: [
      '第 1 轮评审打回：重复补偿会二次释放券，已引入 compensation_id 唯一约束',
      '仓储组 StockClient 超时默认 3s，长事务下有连接池耗尽风险，待联调第 3 轮验证',
    ],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-05 14:00',
        content: '库存扣减和优惠核销要在一个事务里，任一失败订单要能干净回滚。',
        tokens: 380,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-05 14:12',
        content:
          '方案：用 Spring 声明式事务包住 deduct + apply，库存走 TCC 的 try/confirm，失败触发 CompensationExecutor 释放券并把订单置 CLOSED。',
        tokens: 1860,
        toolName: '',
        durationMs: 21400,
      },
      {
        seq: 3,
        role: 'user',
        actorId: 'u-yan',
        time: '2026-03-11 14:36',
        content: '打回。补偿没有幂等键，MQ 重投会二次释放券，这是资损。必须加 compensation_id 唯一约束。',
        tokens: 260,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 4,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-18 17:20',
        content:
          'edit_file ×4：新增 order_compensation(compensation_id PK, order_id, type, status)、CompensationExecutor 改为先 insert 再执行；run_tests 联调用例 28/30 通过，2 个超时用例待仓储组配合。',
        tokens: 3240,
        toolName: 'fs.edit',
        durationMs: 142000,
      },
      {
        seq: 5,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-19 10:00',
        content: '已提交第 2 轮评审，剩余 1 条 should-fix：补偿超时告警阈值 30s 建议改配置项，等待严慕舟复核。',
        tokens: 940,
        toolName: '',
        durationMs: 12800,
      },
    ],
  },
  {
    id: 'CS-2404',
    taskId: 'TASK-2404',
    agentId: 'ag-ops',
    modelId: 'mdl-qwen',
    ownerId: 'u-meng',
    status: 'done',
    startedAt: '2026-03-09 10:20',
    endedAt: '2026-03-12 14:10',
    durationMin: 96,
    turns: 14,
    promptTokens: 48200,
    completionTokens: 21600,
    totalTokens: 69800,
    costUsd: 0.48,
    acceptRate: 96,
    filesChanged: 6,
    additions: 620,
    deletions: 40,
    toolCalls: 32,
    humanInterventions: 1,
    repoBranch: 'feat/order-metrics',
    contextFiles: [
      'order-api/src/main/java/com/mall/order/api/metrics/OrderMetrics.java',
      'deploy/grafana/order-idempotency.json',
      'deploy/prometheus/rules/order-alerts.yaml',
    ],
    kbHits: ['KB-OPS-01'],
    summary:
      '全自动产出 3 个 Prometheus 指标、1 个 Grafana 面板与 2 条 P1 告警规则，人工仅确认告警接收组。AI 产出占比 92%，是本迭代效率最高的会话。',
    risks: [],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-meng',
        time: '2026-03-09 10:20',
        content: '给幂等命中率和 outbox 积压加指标和告警，面板复用订单大盘。',
        tokens: 300,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-ops',
        time: '2026-03-09 10:26',
        content:
          '新增 idempotency_hit_total{result}、outbox_pending_count、outbox_retry_total{reason}；告警：命中率 < 60% 持续 5 分钟 P1、积压 > 5000 持续 3 分钟 P1；面板加到 order-overview 第 4 行。',
        tokens: 1480,
        toolName: '',
        durationMs: 9600,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-ops',
        time: '2026-03-12 13:58',
        content: 'promtool check rules：OK；grafana dashboard lint：OK；预生产已验证 3 条指标上报正常。',
        tokens: 860,
        toolName: 'shell.run',
        durationMs: 42000,
      },
    ],
  },
  {
    id: 'CS-2405',
    taskId: 'TASK-2405',
    agentId: 'ag-test',
    modelId: 'mdl-deepseek',
    ownerId: 'u-he',
    status: 'running',
    startedAt: '2026-03-10 09:30',
    endedAt: '',
    durationMin: 512,
    turns: 68,
    promptTokens: 386400,
    completionTokens: 184200,
    totalTokens: 570600,
    costUsd: 6.12,
    acceptRate: 74,
    filesChanged: 9,
    additions: 4120,
    deletions: 60,
    toolCalls: 214,
    humanInterventions: 5,
    repoBranch: 'test/order-idempotency-ut',
    contextFiles: [
      'order-api/src/test/java/com/mall/order/api/OrderCreateIdempotencyTest.java',
      'order-domain/src/test/java/com/mall/order/domain/OrderTxBoundaryTest.java',
      'docs/test/TR-24-case-matrix.xlsx',
    ],
    kbHits: ['KB-TEST-03', 'KB-CODE-02'],
    summary:
      '测试 Agent 生成 186 个单测（正常 112 / 异常 74），分支覆盖率从 61.8% 提升到 71.4%，仍未达 G3 要求的 85%。缺口集中在库存扣减失败回滚与重复提交拒绝两条异常分支，正在按何斯年建议基于 BUG-1043 路径反向补 12 个用例。',
    risks: [
      'G3 门禁已连续 3 次失败（68.2% → 68.2% → 71.4%），阻塞 PIPE-2409 与 TASK-2421',
      'AI 生成的异常用例存在 6 处断言过宽（只断言不抛异常，未校验错误码），已被人工标记',
    ],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-he',
        time: '2026-03-10 09:30',
        content: '下单链路单测覆盖率要到 85%，优先补异常分支，用例要能对上 US-01/US-02 的验收标准。',
        tokens: 420,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'tool',
        actorId: 'ag-test',
        time: '2026-03-10 09:38',
        content: 'coverage.report：当前分支覆盖率 61.8%，未覆盖分支 74 个，其中异常回滚类 31 个、参数校验类 22 个、并发冲突类 21 个。',
        tokens: 1620,
        toolName: 'coverage.report',
        durationMs: 88000,
      },
      {
        seq: 3,
        role: 'ai',
        actorId: 'ag-test',
        time: '2026-03-10 10:12',
        content: '计划生成 186 个用例：正常路径 112、异常路径 74；异常路径按错误码分组（ORDER_DUPLICATED 18、STOCK_NOT_ENOUGH 16、ORDER_STATE_ILLEGAL 14、其余 26）。',
        tokens: 2180,
        toolName: '',
        durationMs: 26400,
      },
      {
        seq: 4,
        role: 'tool',
        actorId: 'ag-test',
        time: '2026-03-16 18:02',
        content: 'pipeline PIPE-2407 gate G3 FAILED：branch coverage 68.2% < 85%；已中断，未进入 build-image。',
        tokens: 720,
        toolName: 'pipeline.status',
        durationMs: 1200,
      },
      {
        seq: 5,
        role: 'tool',
        actorId: 'ag-test',
        time: '2026-03-19 17:42',
        content: 'pipeline PIPE-2409 gate G3 FAILED（第 3 次）：branch coverage 71.4% < 85%；新增 34 个用例，仍未覆盖 InventoryDeductService#rollback 与 OrderCreateService#rejectDuplicate。',
        tokens: 980,
        toolName: 'pipeline.status',
        durationMs: 1200,
      },
      {
        seq: 6,
        role: 'user',
        actorId: 'u-he',
        time: '2026-03-19 17:45',
        content: '按 BUG-1043 的复现路径和 TASK-2403 的补偿分支反向生成 12 个用例，断言必须校验错误码，不许只断言不抛异常。',
        tokens: 320,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 7,
        role: 'ai',
        actorId: 'ag-test',
        time: '2026-03-19 18:06',
        content: '已生成 12 个用例草稿（覆盖 rollback 7 个、rejectDuplicate 5 个），本地跑通 11 个；预计覆盖率可达 85.6%，等待人工复核后重跑流水线。',
        tokens: 1240,
        toolName: '',
        durationMs: 31200,
      },
    ],
  },
  {
    id: 'CS-2406',
    taskId: 'TASK-2406',
    agentId: 'ag-code',
    modelId: 'mdl-claude',
    ownerId: 'u-zhou',
    status: 'running',
    startedAt: '2026-03-05 09:00',
    endedAt: '',
    durationMin: 448,
    turns: 58,
    promptTokens: 342800,
    completionTokens: 156200,
    totalTokens: 499000,
    costUsd: 11.86,
    acceptRate: 87,
    filesChanged: 26,
    additions: 5240,
    deletions: 2860,
    toolCalls: 196,
    humanInterventions: 4,
    repoBranch: 'feat/order-statemachine',
    contextFiles: [
      'order-domain/src/main/java/com/mall/order/domain/statemachine/OrderStateMachine.java',
      'order-domain/src/main/java/com/mall/order/domain/statemachine/OrderState.java',
      'order-app/src/main/java/com/mall/order/app/service/OrderAppService.java',
    ],
    kbHits: ['KB-ARCH-01', 'KB-CODE-05'],
    summary:
      '基于 Spring Statemachine 4 实现订单 10 态流转，AI 自动识别并替换 6 处硬编码 if-else，删除 2,860 行分支代码；非法流转返回 ORDER_STATE_ILLEGAL 并附带允许的下一状态集合。',
    risks: ['状态机持久化用 JdbcStateMachineStore，高并发下 state_machine 表行锁竞争需压测验证'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-05 09:00',
        content: '把散在各处的订单状态判断收敛成一个状态机组件，10 个状态、非法流转要能报出允许的目标态。',
        tokens: 400,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-05 09:18',
        content: 'codegraph.search "orderStatus =="：命中 6 处（OrderService×2、RefundService×2、CancelJob×1、CsQueryApi×1），共 428 行分支逻辑。',
        tokens: 2480,
        toolName: 'codegraph.search',
        durationMs: 4600,
      },
      {
        seq: 3,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-05 09:40',
        content:
          '设计：OrderState 枚举 10 态与 TASK_STATES 对齐；transit(orderId, event, ctx) 统一入口，内部校验 allowedTransitions；6 处调用点全部改为 transit，非法流转抛 OrderStateIllegalException 携带 allowed 集合。',
        tokens: 2620,
        toolName: '',
        durationMs: 28600,
      },
      {
        seq: 4,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-13 09:18',
        content: 'edit_file ×26，删除 2,860 行；run_tests 状态机用例 96/96 通过，覆盖率 90%。',
        tokens: 1860,
        toolName: 'fs.edit',
        durationMs: 186000,
      },
    ],
  },
  {
    id: 'CS-2407',
    taskId: 'TASK-2407',
    agentId: 'ag-arch',
    modelId: 'mdl-gpt5',
    ownerId: 'u-shen',
    status: 'paused',
    startedAt: '2026-03-13 14:00',
    endedAt: '',
    durationMin: 142,
    turns: 22,
    promptTokens: 128600,
    completionTokens: 46800,
    totalTokens: 175400,
    costUsd: 5.24,
    acceptRate: 0,
    filesChanged: 2,
    additions: 480,
    deletions: 20,
    toolCalls: 46,
    humanInterventions: 2,
    repoBranch: 'feat/statemachine-hotrule',
    contextFiles: [
      'order-domain/src/main/java/com/mall/order/domain/statemachine/TransitionRule.java',
      'deploy/nacos/order-statemachine-rules.yaml',
    ],
    kbHits: ['KB-ARCH-01'],
    summary:
      '架构 Agent 产出两套热更新方案对比（本地双 buffer / Nacos 推送 + 版本号）并给出推荐，已生成方案文档与规则 DSL 草案；因等待架构师确认，会话处于 paused，未进入编码。',
    risks: [
      '方案确认已超 24 小时 SLA（触发提醒 n4），任务停留在 dev 6 天',
      '方案 B 引入 Nacos 强依赖，与现有配置中心重复，需架构组决策',
    ],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-13 14:00',
        content: '状态流转规则要能配置化热更新，在途请求不能受影响，给我两套方案对比。',
        tokens: 340,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-arch',
        time: '2026-03-13 14:20',
        content:
          '方案 A：本地缓存双 buffer + 版本号轮询，生效延迟 30s，无新依赖，实现 1.5 人日；方案 B：Nacos 推送 + 灰度标签，生效延迟 < 3s，支持按租户灰度，实现 3 人日，但引入配置中心强依赖。推荐 B（长期收益），风险是单点。',
        tokens: 2860,
        toolName: '',
        durationMs: 34200,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-arch',
        time: '2026-03-13 15:02',
        content: '已产出 docs/design/TASK-2407-hotrule.md（含规则 DSL、双 buffer 切换时序图、回滚预案），提交至 feat/statemachine-hotrule 分支。',
        tokens: 1120,
        toolName: 'fs.write',
        durationMs: 18000,
      },
      {
        seq: 4,
        role: 'ai',
        actorId: 'ag-arch',
        time: '2026-03-19 11:55',
        content: '方案确认已等待 6 天，超 architect SLA（24h）。已挂起会话并推送提醒；若 48 小时内仍无决策，建议按 GANTT-CF-06 降级为方案 A。',
        tokens: 860,
        toolName: '',
        durationMs: 9400,
      },
    ],
  },
  {
    id: 'CS-2409',
    taskId: 'TASK-2409',
    agentId: 'ag-code',
    modelId: 'mdl-claude',
    ownerId: 'u-zhou',
    status: 'running',
    startedAt: '2026-03-06 10:30',
    endedAt: '',
    durationMin: 486,
    turns: 61,
    promptTokens: 398200,
    completionTokens: 172600,
    totalTokens: 570800,
    costUsd: 13.24,
    acceptRate: 79,
    filesChanged: 24,
    additions: 6180,
    deletions: 2340,
    toolCalls: 208,
    humanInterventions: 6,
    repoBranch: 'feat/promotion-engine',
    contextFiles: [
      'promo-engine/src/main/java/com/mall/promo/engine/RuleEvaluator.java',
      'promo-engine/src/main/java/com/mall/promo/engine/MutexGroupResolver.java',
      'promo-engine/src/main/java/com/mall/promo/engine/AmountAllocator.java',
    ],
    kbHits: ['KB-CODE-05', 'KB-BS-2401'],
    summary:
      '把券、满减、会员价抽象为「互斥组 + 优先级 + 分摊」三段模型，规则用 Aviator 表达式配置化，5 分钟内全节点生效；AI 产出 79%，人工主要修正互斥组求解的优先级冲突。',
    risks: ['Aviator 表达式无沙箱限制，恶意规则可能造成 CPU 打满，需补表达式白名单与超时熔断'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-su',
        time: '2026-03-06 10:30',
        content: '优惠叠加规则太乱了，要能配置化，运营改完 5 分钟内生效，不能发版。',
        tokens: 360,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-06 10:52',
        content:
          '三段模型：① MutexGroupResolver 解互斥组（同组只取最优）；② PriorityChain 按优先级串行计算；③ AmountAllocator 最大余额法分摊到 SKU。规则以 Aviator 表达式存 promo_rule 表，本地缓存 5 分钟刷新。',
        tokens: 2740,
        toolName: '',
        durationMs: 32800,
      },
      {
        seq: 3,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-12 16:40',
        content: '互斥组里会员价和平台券同优先级时结果不稳定，要确定性的 tie-break 规则。',
        tokens: 240,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 4,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-19 14:08',
        content: 'edit_file：MutexGroupResolver 增加 (priority, ruleId) 二级排序；run_tests 规则引擎用例 148/152 通过，4 个分摊尾差用例失败（转 TASK-2410 处理）。',
        tokens: 2160,
        toolName: 'fs.edit',
        durationMs: 156000,
      },
    ],
  },
  {
    id: 'CS-2410',
    taskId: 'TASK-2410',
    agentId: 'ag-code',
    modelId: 'mdl-deepseek',
    ownerId: 'u-shen',
    status: 'waiting',
    startedAt: '2026-03-15 10:30',
    endedAt: '2026-03-19 16:00',
    durationMin: 296,
    turns: 38,
    promptTokens: 214600,
    completionTokens: 92400,
    totalTokens: 307000,
    costUsd: 3.24,
    acceptRate: 71,
    filesChanged: 17,
    additions: 3120,
    deletions: 2480,
    toolCalls: 124,
    humanInterventions: 8,
    repoBranch: 'fix/promo-amount-precision',
    contextFiles: [
      'promo-engine/src/main/java/com/mall/promo/engine/AmountAllocator.java',
      'order-domain/src/main/java/com/mall/order/domain/vo/OrderAmount.java',
      'docs/bug/BUG-1043-analysis.md',
    ],
    kbHits: ['KB-CODE-05'],
    summary:
      '针对 BUG-1043 把全链路金额由 double 切换为 BigDecimal，分摊改用最大余额法消除尾差；AI 首版遗漏负向分摊（退款）场景，被评审 Agent 拦下，当前剩 1 条 must-fix 待修。',
    risks: [
      'must-fix：最大余额法在负向分摊场景未处理余数方向，可能产生 -0.01',
      'should-fix：3 处 BigDecimal.divide 未显式指定 RoundingMode，依赖默认行为',
    ],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-15 10:30',
        content: 'BUG-1043 是资损级，把金额全部换成 BigDecimal，分摊用最大余额法，尾差必须为 0。',
        tokens: 320,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-15 11:02',
        content: 'codegraph.search "double.*[Aa]mount"：命中 42 处（order-domain 18、promo-engine 15、settlement-client 9）。',
        tokens: 2280,
        toolName: 'codegraph.search',
        durationMs: 5200,
      },
      {
        seq: 3,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-16 15:20',
        content:
          '已完成 42 处替换，新增 OrderAmount 值对象（cent 存储 + BigDecimal 计算）；最大余额法：先按 floor 分，余数按小数部分降序逐个 +0.01，保证合计恒等于应付。',
        tokens: 2420,
        toolName: '',
        durationMs: 28400,
      },
      {
        seq: 4,
        role: 'tool',
        actorId: 'ag-review',
        time: '2026-03-19 16:08',
        content:
          'review MR-2410：1 must-fix（AmountAllocator#allocate 未处理 totalAmount < 0 的退款场景，余数方向错误）；2 should-fix（divide 未指定 RoundingMode.HALF_UP）。',
        tokens: 1360,
        toolName: 'mr.review',
        durationMs: 24000,
      },
    ],
  },
  {
    id: 'CS-2411',
    taskId: 'TASK-2411',
    agentId: 'ag-test',
    modelId: 'mdl-claude',
    ownerId: 'u-yan',
    status: 'running',
    startedAt: '2026-03-12 09:40',
    endedAt: '',
    durationMin: 268,
    turns: 34,
    promptTokens: 186400,
    completionTokens: 78200,
    totalTokens: 264600,
    costUsd: 6.18,
    acceptRate: 68,
    filesChanged: 12,
    additions: 1480,
    deletions: 320,
    toolCalls: 96,
    humanInterventions: 5,
    repoBranch: 'feat/promo-trial-consistency',
    contextFiles: [
      'promo-engine/src/main/java/com/mall/promo/engine/TrialService.java',
      'order-api/src/main/java/com/mall/order/api/OrderCreateController.java',
      'docs/api/API-07-trial-order.md',
    ],
    kbHits: ['KB-TEST-03'],
    summary:
      '试算与下单绑定同一 ruleVersion，版本漂移拒绝下单并返回 RULE_VERSION_STALE；AI 生成 128 组金额边界用例，其中 9 组因浮点比较写法被人工改为 BigDecimal.compareTo。',
    risks: ['ruleVersion 缓存在多机房存在 2s 漂移，跨机房下单仍可能误判，需引入版本号单调递增校验'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-yan',
        time: '2026-03-12 09:40',
        content: '试算和下单必须用同一版本规则，版本变了就拒单，别让金额飘。',
        tokens: 300,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-test',
        time: '2026-03-12 10:04',
        content:
          '方案：试算响应头返回 X-Promo-Rule-Version，下单校验该版本与当前生效版本一致；不一致返回 RULE_VERSION_STALE 并携带最新版本号，前端提示重新试算。配套 128 组边界用例。',
        tokens: 1980,
        toolName: '',
        durationMs: 24600,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-test',
        time: '2026-03-18 20:11',
        content: 'run_tests：一致性用例 119/128 通过，9 组失败原因为 assertEquals(double, double) 精度问题，已改为 compareTo == 0。',
        tokens: 1240,
        toolName: 'shell.run',
        durationMs: 96000,
      },
    ],
  },
  {
    id: 'CS-2412',
    taskId: 'TASK-2412',
    agentId: 'ag-code',
    modelId: 'mdl-deepseek',
    ownerId: 'u-zhou',
    status: 'waiting',
    startedAt: '2026-03-09 13:20',
    endedAt: '2026-03-18 18:20',
    durationMin: 372,
    turns: 44,
    promptTokens: 246800,
    completionTokens: 104600,
    totalTokens: 351400,
    costUsd: 3.72,
    acceptRate: 83,
    filesChanged: 15,
    additions: 2360,
    deletions: 780,
    toolCalls: 142,
    humanInterventions: 6,
    repoBranch: 'feat/order-multilevel-cache',
    contextFiles: [
      'order-infra/src/main/java/com/mall/order/infra/cache/OrderCacheManager.java',
      'order-infra/src/main/java/com/mall/order/infra/cache/BinlogInvalidator.java',
      'deploy/canal/order-instance.properties',
    ],
    kbHits: ['KB-ARCH-01', 'KB-CODE-05'],
    summary:
      'Caffeine 本地缓存 + Redis 集群二级缓存，Canal 订阅 binlog 主动失效；压测命中率 93.6%、不一致窗口 620ms，均优于目标。会话期间负责人被 TASK-2415 抢占（GANTT-CF-03），实际耗时超预估 3 小时。',
    risks: [
      '本地缓存与 Redis 之间存在最长 620ms 不一致窗口，客服查单场景需强制走 DB',
      'Canal 订阅延迟抖动时失效会滞后，需补 outbox_pending_count 联动告警',
    ],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-09 13:20',
        content: '订单详情读压力大，上多级缓存，命中率要 92% 以上，不一致窗口不能超 800ms。',
        tokens: 320,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-09 13:48',
        content:
          '设计：L1 Caffeine（maximumSize 5 万、expireAfterWrite 30s）+ L2 Redis Cluster（TTL 10 分钟、随机抖动防雪崩）；Canal 订阅 order 表 binlog，变更即广播失效消息，本地缓存监听后逐出。',
        tokens: 2340,
        toolName: '',
        durationMs: 28800,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-17 21:40',
        content: 'load_test：12,000 QPS 下命中率 93.6%，P99 从 88ms 降至 21ms；注入 200 次更新，平均不一致窗口 620ms，最大 780ms。',
        tokens: 1480,
        toolName: 'load.test',
        durationMs: 420000,
      },
      {
        seq: 4,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-18 18:20',
        content: '数据可以，转测试。这两天被拆单那个任务占了时间，进度慢了半拍。',
        tokens: 180,
        toolName: '',
        durationMs: 0,
      },
    ],
  },
  {
    id: 'CS-2413',
    taskId: 'TASK-2413',
    agentId: 'ag-code',
    modelId: 'mdl-claude',
    ownerId: 'u-shen',
    status: 'done',
    startedAt: '2026-03-04 09:10',
    endedAt: '2026-03-13 17:20',
    durationMin: 402,
    turns: 47,
    promptTokens: 268200,
    completionTokens: 98400,
    totalTokens: 366600,
    costUsd: 8.34,
    acceptRate: 76,
    filesChanged: 19,
    additions: 1980,
    deletions: 1460,
    toolCalls: 138,
    humanInterventions: 9,
    repoBranch: 'feat/order-sharding',
    contextFiles: [
      'order-infra/src/main/java/com/mall/order/infra/shard/OrderShardingAlgorithm.java',
      'order-infra/src/main/java/com/mall/order/infra/shard/OrderIdGenerator.java',
      'deploy/shardingsphere/order-sharding.yaml',
    ],
    kbHits: ['KB-ARCH-01'],
    summary:
      '订单号内嵌用户基因位，16 库 × 64 表，用户维度与订单号维度查询均命中单分片；AI 首版分片算法与既有订单号生成器冲突，人工介入 9 次后收敛。压测 12,000 TPS 下 P99 由 210ms 降至 46ms。',
    risks: ['历史订单号不含基因位，需靠 TASK-2419 迁移时重写订单号映射表'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-04 09:10',
        content: '订单表 4.7 亿行了，做分库分表，用户查和订单号查都要单分片命中。',
        tokens: 300,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-04 09:36',
        content:
          '方案：订单号后 10 位嵌入 userId 后 6 位基因；分片键 db = gene % 16，table = (orderId.hashCode() >>> 1) % 64；两维度查询均先解析基因位再路由，避免全分片扫描。',
        tokens: 2180,
        toolName: '',
        durationMs: 26200,
      },
      {
        seq: 3,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-06 15:12',
        content: '订单号生成器已经有雪花算法在用，别改号段结构，基因位放到扩展位里。',
        tokens: 220,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 4,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-13 17:20',
        content: 'load_test：12,000 TPS，单分片命中率 100%，P99 46ms（改造前 210ms）；run_tests 分片路由用例 64/64 通过。',
        tokens: 1320,
        toolName: 'load.test',
        durationMs: 386000,
      },
    ],
  },
  {
    id: 'CS-2414',
    taskId: 'TASK-2414',
    agentId: 'ag-code',
    modelId: 'mdl-qwen',
    ownerId: 'u-chen',
    status: 'running',
    startedAt: '2026-03-12 14:00',
    endedAt: '',
    durationMin: 224,
    turns: 29,
    promptTokens: 132600,
    completionTokens: 68400,
    totalTokens: 201000,
    costUsd: 1.32,
    acceptRate: 88,
    filesChanged: 14,
    additions: 2240,
    deletions: 1180,
    toolCalls: 88,
    humanInterventions: 3,
    repoBranch: 'feat/order-list-vue3',
    contextFiles: [
      'order-web/src/views/order/OrderListView.vue',
      'order-web/src/composables/useCursorPagination.ts',
      'order-web/src/api/order.ts',
    ],
    kbHits: ['KB-CODE-05'],
    summary:
      '订单列表切换游标分页 + 虚拟滚动，骨架屏与缓存态渲染；Lighthouse 首屏 LCP 由 2.4s 降至 0.9s，AI 产出 71%，主要人工修正虚拟滚动的动态行高计算。',
    risks: ['虚拟滚动在折叠行场景下行高估算偏差，滚动条会轻微跳动，待 UI 走查确认'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-chen',
        time: '2026-03-12 14:00',
        content: '订单列表首屏 2.4s 太慢，后端已经支持游标分页了，前端改一下，目标 1s 内。',
        tokens: 300,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-12 14:22',
        content:
          '改造点：① offset 分页换 cursor（lastOrderId + lastCreateTime）；② 长列表接 virtual-scroll（预估行高 96px，动态测量修正）；③ 首屏骨架屏 + SWR 缓存态；④ 拆包把 echarts 移到异步 chunk。',
        tokens: 1860,
        toolName: '',
        durationMs: 21400,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-19 15:36',
        content: 'lighthouse：LCP 0.9s、CLS 0.02、TBT 180ms；bundle 主包由 1.42MB 降至 684KB。',
        tokens: 980,
        toolName: 'shell.run',
        durationMs: 76000,
      },
    ],
  },
  {
    id: 'CS-2415',
    taskId: 'TASK-2415',
    agentId: 'ag-arch',
    modelId: 'mdl-gpt5',
    ownerId: 'u-zhou',
    status: 'running',
    startedAt: '2026-03-16 09:05',
    endedAt: '',
    durationMin: 186,
    turns: 26,
    promptTokens: 224600,
    completionTokens: 86200,
    totalTokens: 310800,
    costUsd: 9.28,
    acceptRate: 0,
    filesChanged: 4,
    additions: 860,
    deletions: 0,
    toolCalls: 112,
    humanInterventions: 2,
    repoBranch: 'feat/split-engine',
    contextFiles: [
      'fulfill-domain/src/main/java/com/mall/fulfill/domain/SplitRule.java',
      'order-domain/src/main/java/com/mall/order/domain/aggregate/OrderAggregate.java',
      'docs/design/split-engine-draft.md',
    ],
    kbHits: ['KB-ARCH-01', 'KB-BS-2401'],
    summary:
      '架构 Agent 扫描履约域 38 个类 / 9,600 行代码，识别商家、仓库、类目、重量四类拆单因子，生成 6 条候选规则与子订单聚合关系草案；聚合根边界存在两种切法，AI 无法自行决策，已挂起等待架构师确认，进度停在 28%。',
    risks: [
      '聚合根边界未定（父订单聚合 / 子订单独立聚合），阻塞后续编码，已挂起 3 天',
      '与 TASK-2412 争抢周浩然产能（GANTT-CF-03），实际推进时间不足预估的 40%',
      '拆单后金额二次分摊与 TASK-2410 的 BigDecimal 改造存在耦合，需同步验证',
    ],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-16 09:05',
        content: '拆单引擎先出方案，规则要覆盖商家、仓库、类目、重量四类因子，别急着写代码。',
        tokens: 320,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'tool',
        actorId: 'ag-arch',
        time: '2026-03-16 09:32',
        content: 'codegraph.scan fulfill-domain：38 个类 / 9,620 行；识别已有 SplitHint 枚举 4 类、散落在 3 个 Service 的硬编码判断 7 处。',
        tokens: 2640,
        toolName: 'codegraph.scan',
        durationMs: 62000,
      },
      {
        seq: 3,
        role: 'ai',
        actorId: 'ag-arch',
        time: '2026-03-16 10:18',
        content:
          '产出 6 条候选规则与两种聚合方案：A 父订单为聚合根（子订单为实体，退款需经父订单，一致性强、并发差）；B 子订单独立聚合根（并发好、跨子订单一致性需 Saga）。倾向 B，但需架构师决策。',
        tokens: 3120,
        toolName: '',
        durationMs: 42600,
      },
      {
        seq: 4,
        role: 'ai',
        actorId: 'ag-arch',
        time: '2026-03-19 11:20',
        content: '等待人工确认已 3 天，进度 28% 停滞。已把方案对比写入 docs/design/split-engine-draft.md，并提醒严慕舟；确认后可在 2 小时内生成引擎骨架。',
        tokens: 1080,
        toolName: '',
        durationMs: 12400,
      },
    ],
  },
  {
    id: 'CS-2417',
    taskId: 'TASK-2417',
    agentId: 'ag-code',
    modelId: 'mdl-deepseek',
    ownerId: 'u-shen',
    status: 'done',
    startedAt: '2026-03-02 13:40',
    endedAt: '2026-03-09 20:00',
    durationMin: 318,
    turns: 36,
    promptTokens: 168400,
    completionTokens: 72600,
    totalTokens: 241000,
    costUsd: 2.54,
    acceptRate: 89,
    filesChanged: 21,
    additions: 1760,
    deletions: 2980,
    toolCalls: 104,
    humanInterventions: 4,
    repoBranch: 'feat/cloudevents-envelope',
    contextFiles: [
      'event-bus/src/main/java/com/mall/event/envelope/CloudEventEnvelope.java',
      'event-bus/src/main/java/com/mall/event/publisher/OrderEventPublisher.java',
      'docs/contract/API-11-order-events.md',
    ],
    kbHits: ['KB-ARCH-01'],
    summary:
      '统一 CloudEvents 1.0 事件信封，替换 12 个下游自定义 JSON 协议，兼容期新旧双发；AI 自动扫描并生成 12 份适配映射，删除 2,980 行冗余协议代码。',
    risks: ['兼容期截止 2026-04-30，12 个下游中仍有 3 个未开始切换'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-02 13:40',
        content: '12 个下游各写一套订单事件协议，统一成 CloudEvents 1.0，要有兼容期。',
        tokens: 300,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-03 11:26',
        content: 'scan_consumers：识别 12 个下游订阅方，字段差异 47 处，其中 9 处为语义冲突（如 payTime 单位秒/毫秒不一致）。',
        tokens: 2420,
        toolName: 'mq.scan',
        durationMs: 54000,
      },
      {
        seq: 3,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-09 20:00',
        content: '已完成信封改造与 12 份适配映射，双发开关 event.dual-send.enabled=true，下游可按 topic 灰度切换；MR-2417 已合并。',
        tokens: 1420,
        toolName: '',
        durationMs: 18600,
      },
    ],
  },
  {
    id: 'CS-2418',
    taskId: 'TASK-2418',
    agentId: 'ag-ops',
    modelId: 'mdl-qwen',
    ownerId: 'u-meng',
    status: 'done',
    startedAt: '2026-03-06 10:00',
    endedAt: '2026-03-13 11:40',
    durationMin: 186,
    turns: 22,
    promptTokens: 92400,
    completionTokens: 41200,
    totalTokens: 133600,
    costUsd: 0.92,
    acceptRate: 93,
    filesChanged: 8,
    additions: 1120,
    deletions: 160,
    toolCalls: 62,
    humanInterventions: 2,
    repoBranch: 'feat/dlq-replay-tool',
    contextFiles: [
      'ops-tools/src/main/java/com/mall/ops/dlq/DlqReplayJob.java',
      'deploy/rabbitmq/dlq-policy.json',
    ],
    kbHits: ['KB-OPS-01'],
    summary:
      '按时间窗与队列维度回放死信，回放成功率 99.7%，失败自动转人工工单；AI 全自动产出命令行工具与 Grafana 面板，人工仅确认幂等策略。',
    risks: [],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-meng',
        time: '2026-03-06 10:00',
        content: '死信现在只能手工捞，做个回放工具，要能按时间窗和队列筛。',
        tokens: 280,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-ops',
        time: '2026-03-06 10:24',
        content: '设计：dlq-replay --queue --from --to --dry-run，回放前用 biz_key 做幂等校验，失败写入 replay_fail 并自动创建 PingCode 工单；成功率指标 dlq_replay_success_total。',
        tokens: 1620,
        toolName: '',
        durationMs: 16800,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-ops',
        time: '2026-03-13 11:40',
        content: '预生产演练：回放 8,420 条死信，成功 8,395（99.7%），失败 25 条自动转工单；MR-2418 已合并。',
        tokens: 920,
        toolName: 'shell.run',
        durationMs: 268000,
      },
    ],
  },
  {
    id: 'CS-2419',
    taskId: 'TASK-2419',
    agentId: 'ag-code',
    modelId: 'mdl-local',
    ownerId: 'u-zhou',
    status: 'paused',
    startedAt: '2026-03-11 09:20',
    endedAt: '',
    durationMin: 342,
    turns: 41,
    promptTokens: 208400,
    completionTokens: 86400,
    totalTokens: 294800,
    costUsd: 0,
    acceptRate: 77,
    filesChanged: 13,
    additions: 2680,
    deletions: 320,
    toolCalls: 126,
    humanInterventions: 7,
    repoBranch: 'feat/order-migrate-job',
    contextFiles: [
      'migrate-job/src/main/java/com/mall/migrate/OrderMigrateJob.java',
      'migrate-job/src/main/java/com/mall/migrate/CheckpointStore.java',
      'docs/api/API-14-order-migrate.md',
    ],
    kbHits: ['KB-OPS-01', 'KB-SEC-02'],
    summary:
      '因涉及 4.7 亿条真实订单数据，会话强制路由到内网私有化模型 mdl-local（不出域）。已完成分批迁移、断点续传与校验逻辑，预生产跑通 3 轮；因 BLOCK-0312 生产窗口未批复，会话自 2026-03-12 起挂起 7 天。',
    risks: [
      'BLOCK-0312 未解除，生产窗口缺失，会话无法推进（已超 SLA 3 天）',
      '单批 5 万条在结算期低峰仍需 4.2 小时，若窗口只有 2 小时需拆成多批次',
    ],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-zhou',
        time: '2026-03-11 09:20',
        content: '历史订单迁移作业，单批别超 5 万条，必须能断点续传，数据不能丢。',
        tokens: 320,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-11 09:22',
        content: '安全策略命中 EGRESS-DENY：任务标签含「生产数据」，模型路由由 mdl-claude 切换为内网私有化 mdl-local，禁止任何数据出域。',
        tokens: 640,
        toolName: 'policy.check',
        durationMs: 320,
      },
      {
        seq: 3,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-11 10:08',
        content:
          '设计：按 order_id 区间分片，批大小 5 万；checkpoint 表记录 (batch_no, last_order_id, status, row_count, checksum)；每批迁移后做行数 + MD5 双校验，失败自动回滚该批并暂停作业。',
        tokens: 2280,
        toolName: '',
        durationMs: 34600,
      },
      {
        seq: 4,
        role: 'tool',
        actorId: 'ag-code',
        time: '2026-03-12 09:00',
        content: '会话挂起：BLOCK-0312 创建（DBA 未批复生产迁移窗口）。预生产已完成 3 轮全量演练，累计迁移 1.2 亿条，差异 0。',
        tokens: 860,
        toolName: 'session.pause',
        durationMs: 1200,
      },
      {
        seq: 5,
        role: 'ai',
        actorId: 'ag-code',
        time: '2026-03-19 08:55',
        content: '挂起已 7 天，超 SLA。给出两个窗口方案：① 申请 03-28 结算后 8 小时窗口一次跑完；② 拆成 4 个 2 小时小窗口按用户分片执行。建议方案 ②，风险更低。',
        tokens: 1120,
        toolName: '',
        durationMs: 14200,
      },
    ],
  },
  {
    id: 'CS-2420',
    taskId: 'TASK-2420',
    agentId: 'ag-test',
    modelId: 'mdl-local',
    ownerId: 'u-shen',
    status: 'paused',
    startedAt: '2026-03-18 15:00',
    endedAt: '',
    durationMin: 124,
    turns: 18,
    promptTokens: 86200,
    completionTokens: 32400,
    totalTokens: 118600,
    costUsd: 0,
    acceptRate: 0,
    filesChanged: 5,
    additions: 340,
    deletions: 0,
    toolCalls: 48,
    humanInterventions: 2,
    repoBranch: 'feat/order-dual-write-check',
    contextFiles: [
      'migrate-job/src/main/java/com/mall/migrate/DualWriteInterceptor.java',
      'migrate-job/src/main/java/com/mall/migrate/DiffComparator.java',
    ],
    kbHits: ['KB-TEST-03', 'KB-SEC-02'],
    summary:
      '双写拦截器与逐字段比对器骨架已生成，因迁移窗口未批复无法接入真实数据，会话挂起；比对策略为按订单号抽样 100% 全字段 + 增量 binlog 实时比对，差异率要求为 0。',
    risks: ['依赖 TASK-2419 解除阻塞，当前进度仅 15%，预计无法在 03-24 前完成'],
    transcript: [
      {
        seq: 1,
        role: 'user',
        actorId: 'u-shen',
        time: '2026-03-18 15:00',
        content: '迁移期要双写，写失败自动降级单写并告警；比对要逐字段，差异率必须为 0。',
        tokens: 300,
        toolName: '',
        durationMs: 0,
      },
      {
        seq: 2,
        role: 'ai',
        actorId: 'ag-test',
        time: '2026-03-18 15:34',
        content:
          '设计：DualWriteInterceptor 在事务提交后异步写新库，失败计数 dual_write_fail_total 并降级；DiffComparator 全量按 order_id 分片比对 24 个字段，增量订阅两侧 binlog 做 5 分钟内一致性核对。',
        tokens: 2060,
        toolName: '',
        durationMs: 26800,
      },
      {
        seq: 3,
        role: 'tool',
        actorId: 'ag-test',
        time: '2026-03-18 19:26',
        content: '会话挂起：前置 TASK-2419 处于 dev（阻塞中：BLOCK-0312），无生产数据可比对；已完成骨架代码 340 行与 12 个单测。',
        tokens: 720,
        toolName: 'session.pause',
        durationMs: 1100,
      },
    ],
  },
];

export const CODING_SESSION_MAP: Record<string, CodingSessionDef> = CODING_SESSIONS.reduce<
  Record<string, CodingSessionDef>
>((acc, s) => {
  acc[s.id] = s;
  return acc;
}, {});

/* ============================================================
 * 13. 部署流水线（S5 环节）
 * ============================================================ */

/** 流水线阶段 */
export interface PipelineStageDef {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'running' | 'skipped' | 'waiting';
  durationSec: number;
  /** 该阶段承担的门禁校验 */
  gateId: string;
  /** 阶段关键日志（1~2 行摘要） */
  log: string;
}

/** 流水线运行记录 */
export interface PipelineRunDef {
  id: string;
  /** 触发工作项 */
  taskId: string;
  reqId: string;
  /** 流水线口径：任务级看增量覆盖率，需求级看聚合覆盖率，发布级跑全量门禁 */
  scope: 'task' | 'requirement' | 'release';
  branch: string;
  commitSha: string;
  commitMsg: string;
  mrId: string;
  envId: string;
  trigger: 'push' | 'manual' | 'schedule' | 'agent';
  triggeredBy: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  status: 'success' | 'failed' | 'running' | 'canceled';
  /** 增量分支覆盖率（本次变更代码） */
  incrementalCoverage: number;
  /** 需求级聚合分支覆盖率 */
  branchCoverage: number;
  sonarBlocker: number;
  gatesPassed: number;
  gatesTotal: number;
  /** 未通过的门禁，通过则为空串 */
  failedGateId: string;
  image: string;
  artifacts: string[];
  stages: PipelineStageDef[];
  summary: string;
  risks: string[];
}

export const PIPELINE_RUNS: PipelineRunDef[] = [
  {
    id: 'PIPE-2401',
    taskId: 'TASK-2401',
    reqId: 'REQ-2401',
    scope: 'task',
    branch: 'feat/order-idempotency',
    commitSha: 'a3f81c2',
    commitMsg: 'feat(order): Idempotency-Key 两级校验（Redis + DB 唯一索引）',
    mrId: 'MR-2401',
    envId: 'env-test',
    trigger: 'push',
    triggeredBy: 'ag-code',
    startedAt: '2026-03-06 14:20',
    endedAt: '2026-03-06 14:27',
    durationSec: 421,
    status: 'success',
    incrementalCoverage: 88.4,
    branchCoverage: 88,
    sonarBlocker: 0,
    gatesPassed: 6,
    gatesTotal: 6,
    failedGateId: '',
    image: 'registry.intra/trade/order-api:2401-a3f81c2',
    artifacts: ['order-api.jar', 'coverage-index.html', 'sonar-report.json'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 18, gateId: '', log: 'checkout feat/order-idempotency @ a3f81c2，缓存命中依赖层。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 96, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 2（已登记技术债）/ 异味 14。' },
      { id: 'stg-3', name: '单元测试', status: 'success', durationSec: 168, gateId: 'G3', log: '用例 214 个全通过，增量分支覆盖率 88.4% ≥ 85%。' },
      { id: 'stg-4', name: '镜像构建', status: 'success', durationSec: 87, gateId: '', log: '多阶段构建产出 268MB 镜像，Trivy 高危 0。' },
      { id: 'stg-5', name: '测试环境部署', status: 'success', durationSec: 42, gateId: 'G5', log: 'Argo Rollouts 滚动更新 3/3 就绪，健康检查通过。' },
      { id: 'stg-6', name: '门禁汇总', status: 'success', durationSec: 10, gateId: 'G5', log: '六道门禁全通过，允许进入测试验证环节。' },
    ],
    summary: '幂等下单改造首次入测试环境，增量覆盖率 88.4% 达标，作为 REQ-2401 后续集成的基线镜像。',
    risks: [],
  },
  {
    id: 'PIPE-2402',
    taskId: 'TASK-2402',
    reqId: 'REQ-2401',
    scope: 'task',
    branch: 'feat/outbox-relay',
    commitSha: 'c7d20e9',
    commitMsg: 'feat(outbox): 本地消息表中继与指数退避重试',
    mrId: 'MR-2402',
    envId: 'env-test',
    trigger: 'push',
    triggeredBy: 'ag-code',
    startedAt: '2026-03-09 10:05',
    endedAt: '2026-03-09 10:13',
    durationSec: 486,
    status: 'success',
    incrementalCoverage: 91.2,
    branchCoverage: 91,
    sonarBlocker: 0,
    gatesPassed: 6,
    gatesTotal: 6,
    failedGateId: '',
    image: 'registry.intra/trade/order-api:2402-c7d20e9',
    artifacts: ['order-api.jar', 'coverage-index.html', 'outbox-replay.sh'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 16, gateId: '', log: 'checkout feat/outbox-relay @ c7d20e9。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 102, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 0 / 异味 6。' },
      { id: 'stg-3', name: '单元测试', status: 'success', durationSec: 194, gateId: 'G3', log: '用例 176 个全通过，重试退避分支覆盖率 91.2%。' },
      { id: 'stg-4', name: '镜像构建', status: 'success', durationSec: 92, gateId: '', log: '构建成功，产出中继脚本 outbox-replay.sh。' },
      { id: 'stg-5', name: '测试环境部署', status: 'success', durationSec: 46, gateId: 'G5', log: '部署完成，RabbitMQ 死信队列绑定校验通过。' },
      { id: 'stg-6', name: '门禁汇总', status: 'success', durationSec: 36, gateId: 'G5', log: '六道门禁全通过。' },
    ],
    summary: '本地消息表中继上线测试环境，消息积压与重试成功率指标已接入 Prometheus。',
    risks: [],
  },
  {
    id: 'PIPE-2403',
    taskId: 'TASK-2404',
    reqId: 'REQ-2401',
    scope: 'task',
    branch: 'feat/order-metrics',
    commitSha: '9b1e44a',
    commitMsg: 'chore(metrics): 幂等命中率与消息积压埋点',
    mrId: 'MR-2404',
    envId: 'env-test',
    trigger: 'manual',
    triggeredBy: 'u-meng',
    startedAt: '2026-03-12 15:40',
    endedAt: '2026-03-12 15:47',
    durationSec: 398,
    status: 'success',
    incrementalCoverage: 87.2,
    branchCoverage: 68,
    sonarBlocker: 0,
    gatesPassed: 6,
    gatesTotal: 6,
    failedGateId: '',
    image: 'registry.intra/trade/order-api:2404-9b1e44a',
    artifacts: ['order-api.jar', 'grafana-dashboard.json', 'alert-rules.yaml'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 15, gateId: '', log: 'checkout feat/order-metrics @ 9b1e44a。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 88, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 1（埋点常量重复定义，已建技术债）。' },
      { id: 'stg-3', name: '单元测试', status: 'success', durationSec: 142, gateId: 'G3', log: '增量覆盖率 87.2%；模块全量 68% 低于阈值，按任务级口径放行。' },
      { id: 'stg-4', name: '镜像构建', status: 'success', durationSec: 84, gateId: '', log: '构建成功。' },
      { id: 'stg-5', name: '测试环境部署', status: 'success', durationSec: 40, gateId: 'G5', log: '部署完成，Grafana 面板 order-idem-hit-rate 已导入。' },
      { id: 'stg-6', name: '门禁汇总', status: 'success', durationSec: 29, gateId: 'G6', log: '观测门禁 G6 预校验通过：3 个核心指标已注册告警规则。' },
    ],
    summary: '埋点类变更按增量口径放行；全量覆盖率 68% 的缺口已登记为 Sprint 25 技术债。',
    risks: ['模块全量覆盖率 68%，若被 REQ-2401 聚合口径纳入会继续拉低整体数值'],
  },
  {
    id: 'PIPE-2404',
    taskId: 'TASK-2413',
    reqId: 'REQ-2404',
    scope: 'task',
    branch: 'feat/order-sharding',
    commitSha: '4e6a918',
    commitMsg: 'feat(sharding): 订单号基因分片与分库分表路由',
    mrId: 'MR-2413',
    envId: 'env-test',
    trigger: 'push',
    triggeredBy: 'ag-code',
    startedAt: '2026-03-13 11:20',
    endedAt: '2026-03-13 11:31',
    durationSec: 642,
    status: 'success',
    incrementalCoverage: 89.6,
    branchCoverage: 84,
    sonarBlocker: 0,
    gatesPassed: 6,
    gatesTotal: 6,
    failedGateId: '',
    image: 'registry.intra/trade/order-query:2413-4e6a918',
    artifacts: ['order-query.jar', 'sharding-config.yaml', 'route-verify.log'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 17, gateId: '', log: 'checkout feat/order-sharding @ 4e6a918。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 118, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 0。' },
      { id: 'stg-3', name: '单元测试', status: 'success', durationSec: 246, gateId: 'G3', log: '路由算法 1,024 组基因位校验全通过，增量覆盖率 89.6%。' },
      { id: 'stg-4', name: '镜像构建', status: 'success', durationSec: 104, gateId: '', log: '构建成功，分片配置随镜像打包。' },
      { id: 'stg-5', name: '测试环境部署', status: 'success', durationSec: 118, gateId: 'G5', log: '双分片集群部署完成，路由验证脚本 100% 命中预期分片。' },
      { id: 'stg-6', name: '门禁汇总', status: 'success', durationSec: 39, gateId: 'G5', log: '六道门禁全通过。' },
    ],
    summary: '分片路由改造在测试环境双集群验证通过，为 REL-2403 生产切流提供路由基线。',
    risks: ['生产切流仍需 DBA 提供迁移窗口（见 BLOCK-0312）'],
  },
  {
    id: 'PIPE-2405',
    taskId: 'TASK-2417',
    reqId: 'REQ-2406',
    scope: 'task',
    branch: 'feat/cloudevents-envelope',
    commitSha: '7c05db3',
    commitMsg: 'feat(event): CloudEvents 1.0 信封与新旧双发兼容',
    mrId: 'MR-2417',
    envId: 'env-test',
    trigger: 'push',
    triggeredBy: 'ag-code',
    startedAt: '2026-03-14 16:05',
    endedAt: '2026-03-14 16:12',
    durationSec: 433,
    status: 'success',
    incrementalCoverage: 90.4,
    branchCoverage: 87,
    sonarBlocker: 0,
    gatesPassed: 6,
    gatesTotal: 6,
    failedGateId: '',
    image: 'registry.intra/trade/order-event:2417-7c05db3',
    artifacts: ['order-event.jar', 'cloudevents-schema.json', 'dual-publish-check.log'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 14, gateId: '', log: 'checkout feat/cloudevents-envelope @ 7c05db3。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 91, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 0 / 异味 3。' },
      { id: 'stg-3', name: '单元测试', status: 'success', durationSec: 158, gateId: 'G3', log: '信封序列化与双发兼容用例 96 个全通过，增量覆盖率 90.4%。' },
      { id: 'stg-4', name: '镜像构建', status: 'success', durationSec: 88, gateId: '', log: '构建成功。' },
      { id: 'stg-5', name: '测试环境部署', status: 'success', durationSec: 52, gateId: 'G5', log: '部署完成，新旧消费者各 2 个实例并行订阅验证通过。' },
      { id: 'stg-6', name: '门禁汇总', status: 'success', durationSec: 30, gateId: 'G5', log: '六道门禁全通过。' },
    ],
    summary: 'CloudEvents 双发兼容上线测试环境；旧消费者时区偏移问题（BUG-1050）已在本次构建后修复并关闭。',
    risks: [],
  },
  {
    id: 'PIPE-2406',
    taskId: 'TASK-2418',
    reqId: 'REQ-2406',
    scope: 'task',
    branch: 'feat/dlq-replay-tool',
    commitSha: '2fa97b6',
    commitMsg: 'feat(dlq): 死信回放工具与成功率监控',
    mrId: 'MR-2418',
    envId: 'env-test',
    trigger: 'agent',
    triggeredBy: 'ag-code',
    startedAt: '2026-03-15 09:50',
    endedAt: '2026-03-15 09:58',
    durationSec: 466,
    status: 'success',
    incrementalCoverage: 86.8,
    branchCoverage: 91,
    sonarBlocker: 0,
    gatesPassed: 6,
    gatesTotal: 6,
    failedGateId: '',
    image: 'registry.intra/trade/order-tools:2418-2fa97b6',
    artifacts: ['dlq-replay.jar', 'replay-runbook.md'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 13, gateId: '', log: 'checkout feat/dlq-replay-tool @ 2fa97b6。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 79, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 1（并发回放未加锁，已转 BUG-1051）。' },
      { id: 'stg-3', name: '单元测试', status: 'success', durationSec: 172, gateId: 'G3', log: '增量覆盖率 86.8%，回放幂等用例 42 个通过。' },
      { id: 'stg-4', name: '镜像构建', status: 'success', durationSec: 96, gateId: '', log: '构建成功，随附运维手册 replay-runbook.md。' },
      { id: 'stg-5', name: '测试环境部署', status: 'success', durationSec: 68, gateId: 'G5', log: '工具镜像推送完成，运维台可见。' },
      { id: 'stg-6', name: '门禁汇总', status: 'success', durationSec: 38, gateId: 'G6', log: '回放成功率指标已注册告警，G6 预校验通过。' },
    ],
    summary: '死信回放工具就绪；并发重放重复投递缺陷（BUG-1051）在测试阶段发现，正在验证修复。',
    risks: ['BUG-1051 未关闭前禁止在生产环境使用并发回放'],
  },
  {
    id: 'PIPE-2407',
    taskId: 'TASK-2405',
    reqId: 'REQ-2401',
    scope: 'requirement',
    branch: 'test/order-idempotency-ut',
    commitSha: '5d31e07',
    commitMsg: 'test(order): AI 生成下单链路单测 186 个',
    mrId: 'MR-2405',
    envId: 'env-staging',
    trigger: 'manual',
    triggeredBy: 'u-zhou',
    startedAt: '2026-03-16 17:48',
    endedAt: '2026-03-16 18:02',
    durationSec: 856,
    status: 'failed',
    incrementalCoverage: 79.4,
    branchCoverage: 68.2,
    sonarBlocker: 0,
    gatesPassed: 3,
    gatesTotal: 6,
    failedGateId: 'G3',
    image: '',
    artifacts: ['coverage-index.html', 'jacoco-aggregate.xml', 'gate-G3-report.json'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 22, gateId: '', log: 'checkout test/order-idempotency-ut @ 5d31e07，合并 REQ-2401 集成分支。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 143, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 3，静态门禁通过。' },
      { id: 'stg-3', name: '单元测试', status: 'failed', durationSec: 691, gateId: 'G3', log: 'pipeline PIPE-2407 gate G3 FAILED：branch coverage 68.2% < 85%；缺口集中在 InventoryDeductService#rollback 与 OrderCreateService#rejectDuplicate。' },
      { id: 'stg-4', name: '镜像构建', status: 'skipped', durationSec: 0, gateId: '', log: '前置阶段失败，跳过。' },
      { id: 'stg-5', name: '预生产部署', status: 'skipped', durationSec: 0, gateId: 'G5', log: '前置阶段失败，跳过。' },
      { id: 'stg-6', name: '门禁汇总', status: 'failed', durationSec: 0, gateId: 'G5', log: 'G3 未通过，流水线中断（第 1 次）。' },
    ],
    summary: 'REQ-2401 需求级聚合流水线首次触发，G3 门禁因聚合分支覆盖率 68.2% 未达标中断，未产出镜像。',
    risks: ['G3 未通过将直接阻断 TASK-2421 生产切流发布单', '异常回滚分支缺失与 BUG-1045 同源'],
  },
  {
    id: 'PIPE-2408',
    taskId: 'TASK-2405',
    reqId: 'REQ-2401',
    scope: 'requirement',
    branch: 'test/order-idempotency-ut',
    commitSha: 'e88c1f4',
    commitMsg: 'test(order): 补充幂等重试与超时分支用例 22 个',
    mrId: 'MR-2405',
    envId: 'env-staging',
    trigger: 'manual',
    triggeredBy: 'u-ai-copilot',
    startedAt: '2026-03-18 10:12',
    endedAt: '2026-03-18 10:29',
    durationSec: 1013,
    status: 'failed',
    incrementalCoverage: 80.1,
    branchCoverage: 68.2,
    sonarBlocker: 0,
    gatesPassed: 3,
    gatesTotal: 6,
    failedGateId: 'G3',
    image: '',
    artifacts: ['coverage-index.html', 'jacoco-aggregate.xml', 'gate-G3-report.json'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 24, gateId: '', log: 'checkout test/order-idempotency-ut @ e88c1f4。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 151, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 3。' },
      { id: 'stg-3', name: '单元测试', status: 'failed', durationSec: 838, gateId: 'G3', log: 'gate G3 FAILED：branch coverage 68.2% < 85%；新增 22 个用例全部落在已覆盖路径，聚合覆盖率零提升。' },
      { id: 'stg-4', name: '镜像构建', status: 'skipped', durationSec: 0, gateId: '', log: '前置阶段失败，跳过。' },
      { id: 'stg-5', name: '预生产部署', status: 'skipped', durationSec: 0, gateId: 'G5', log: '前置阶段失败，跳过。' },
      { id: 'stg-6', name: '门禁汇总', status: 'failed', durationSec: 0, gateId: 'G5', log: 'G3 未通过，流水线中断（第 2 次）。' },
    ],
    summary: 'AI 自主重跑一次但补测方向偏差：新增用例未命中未覆盖分支，覆盖率停在 68.2%，暴露"用例数量 ≠ 覆盖率"的典型问题。',
    risks: ['AI 缺少覆盖率缺口反馈闭环，重复无效补测浪费 17 分钟流水线资源'],
  },
  {
    id: 'PIPE-2409',
    taskId: 'TASK-2405',
    reqId: 'REQ-2401',
    scope: 'requirement',
    branch: 'test/order-idempotency-ut',
    commitSha: 'b60f2a5',
    commitMsg: 'test(order): 按覆盖率缺口报告补测 34 个异常分支用例',
    mrId: 'MR-2405',
    envId: 'env-staging',
    trigger: 'manual',
    triggeredBy: 'u-he',
    startedAt: '2026-03-19 17:26',
    endedAt: '2026-03-19 17:42',
    durationSec: 972,
    status: 'failed',
    incrementalCoverage: 82.6,
    branchCoverage: 71.4,
    sonarBlocker: 0,
    gatesPassed: 3,
    gatesTotal: 6,
    failedGateId: 'G3',
    image: '',
    artifacts: ['coverage-index.html', 'jacoco-aggregate.xml', 'gate-G3-report.json', 'uncovered-branches.txt'],
    stages: [
      { id: 'stg-1', name: '代码检出', status: 'success', durationSec: 21, gateId: '', log: 'checkout test/order-idempotency-ut @ b60f2a5。' },
      { id: 'stg-2', name: '静态扫描', status: 'success', durationSec: 148, gateId: 'G3', log: 'SonarQube：阻断 0 / 严重 2（较上次下降 1）。' },
      { id: 'stg-3', name: '单元测试', status: 'failed', durationSec: 803, gateId: 'G3', log: 'pipeline PIPE-2409 gate G3 FAILED（第 3 次）：branch coverage 71.4% < 85%；仍未覆盖 InventoryDeductService#rollback 与 OrderCreateService#rejectDuplicate。' },
      { id: 'stg-4', name: '镜像构建', status: 'skipped', durationSec: 0, gateId: '', log: '前置阶段失败，跳过。' },
      { id: 'stg-5', name: '预生产部署', status: 'skipped', durationSec: 0, gateId: 'G5', log: '前置阶段失败，跳过。' },
      { id: 'stg-6', name: '门禁汇总', status: 'failed', durationSec: 0, gateId: 'G5', log: 'G3 连续 3 次失败，已推送门禁通知至林知远（通知 n1）。' },
    ],
    summary: '第三次门禁失败：覆盖率从 68.2% 提升到 71.4%（+3.2pp），距 85% 仍差 13.6pp；何斯年建议按 BUG-1043 复现路径与 TASK-2403 补偿分支反向生成 12 个用例。',
    risks: ['GANTT-CF-04：03-20 灰度窗口面临丢失，需重排至 03-27 之后', 'TASK-2421 发布单 REL-2403 持续 blocked', '若走门禁例外审批须由林知远签署风险接受'],
  },
  {
    id: 'PIPE-2410',
    taskId: 'TASK-2421',
    reqId: '',
    scope: 'release',
    branch: 'release/REL-2403',
    commitSha: 'f19d6c0',
    commitMsg: 'chore(release): REL-2403 生产切流发布单预检',
    mrId: '',
    envId: 'env-prod',
    trigger: 'manual',
    triggeredBy: 'u-meng',
    startedAt: '2026-03-19 17:46',
    endedAt: '2026-03-19 17:50',
    durationSec: 244,
    status: 'failed',
    incrementalCoverage: 0,
    branchCoverage: 71.4,
    sonarBlocker: 0,
    gatesPassed: 4,
    gatesTotal: 6,
    failedGateId: 'G3',
    image: '',
    artifacts: ['release-precheck.json', 'rollback-plan.md', 'gray-batches.yaml'],
    stages: [
      { id: 'stg-1', name: '发布单校验', status: 'success', durationSec: 28, gateId: 'G5', log: 'REL-2403 变更清单 24 项、审批链 3 级已配置。' },
      { id: 'stg-2', name: '回切预案校验', status: 'success', durationSec: 46, gateId: 'G5', log: '一键回切脚本预生产演练 2 次，RTO 6.5 分钟 ≤ 10 分钟。' },
      { id: 'stg-3', name: '灰度批次校验', status: 'success', durationSec: 34, gateId: 'G5', log: '1% → 10% → 50% → 100% 四批次配置合法，观察窗各 30 分钟。' },
      { id: 'stg-4', name: '前置任务校验', status: 'failed', durationSec: 18, gateId: 'G5', log: '前置 TASK-2419（dev / BLOCK-0312）与 TASK-2420（refined 15%）均未完成。' },
      { id: 'stg-5', name: '质量门禁校验', status: 'failed', durationSec: 96, gateId: 'G3', log: 'G3 聚合分支覆盖率 71.4% < 85%；G4 测试门禁执行率 62% 未达 100%。' },
      { id: 'stg-6', name: '门禁汇总', status: 'failed', durationSec: 22, gateId: 'G5', log: '预检 6 项通过 4 项，发布单保持 blocked（对应 TE-028）。' },
    ],
    summary: 'REL-2403 发布预检：回切脚本与灰度批次就绪，但被 G3 覆盖率、G4 执行率与两个前置任务共同阻断，林知远决策"先补门禁，再谈窗口"。',
    risks: ['BLOCK-0312 迁移窗口未落实（预计 03-23 解除）', 'G3 需 24 小时内补到 85%', 'G4 剩余 94 条用例待执行'],
  },
];

export const PIPELINE_MAP: Record<string, PipelineRunDef> = PIPELINE_RUNS.reduce<
  Record<string, PipelineRunDef>
>((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {});

export const PIPELINE_BY_TASK: Record<string, PipelineRunDef[]> = PIPELINE_RUNS.reduce<
  Record<string, PipelineRunDef[]>
>((acc, p) => {
  if (!acc[p.taskId]) acc[p.taskId] = [];
  acc[p.taskId].push(p);
  return acc;
}, {});

/** 流水线阶段模板（渲染阶段泳道时按此顺序补齐 skipped 阶段） */
export const PIPELINE_STAGE_TEMPLATE: { id: string; name: string; gateId: string }[] = [
  { id: 'stg-1', name: '代码检出', gateId: '' },
  { id: 'stg-2', name: '静态扫描', gateId: 'G3' },
  { id: 'stg-3', name: '单元测试', gateId: 'G3' },
  { id: 'stg-4', name: '镜像构建', gateId: '' },
  { id: 'stg-5', name: '环境部署', gateId: 'G5' },
  { id: 'stg-6', name: '门禁汇总', gateId: 'G5' },
];

/* -------------------------------------------------------------------------
 * 13.2 六道质量门禁
 * ---------------------------------------------------------------------- */

/** 门禁定义：与 SDLC_STAGES.gateId 一一对应 */
export interface GateDef {
  id: string;
  name: string;
  stageId: string;
  /** 门禁责任人角色 */
  ownerRoleId: string;
  /** 执行校验的智能体 */
  agentId: string;
  desc: string;
  /** 硬性通过条件 */
  criteria: string[];
  /** 当前实测值（逐条与 criteria 对齐） */
  actual: string[];
  status: 'passed' | 'failed' | 'pending' | 'waived';
  /** 是否阻断发布 */
  blocking: boolean;
  /** 例外审批人（仅 failed/waived 时有意义） */
  approverId: string;
  lastCheckedAt: string;
  lastPipelineId: string;
  evidence: string[];
  passRate: number;
}

export const GATES: GateDef[] = [
  {
    id: 'G1',
    name: '需求门禁',
    stageId: 'st-req',
    ownerRoleId: 'product',
    agentId: 'ag-pm',
    desc: 'PRD 基线冻结、验收标准可测、需求已与 PingCode 工作项双向绑定。',
    criteria: [
      'PRD 基线版本已冻结且评审通过',
      '每个需求至少 1 条可验证的验收标准',
      '用户故事 GWT 结构完整率 100%',
      'PingCode 工作项映射率 100%',
    ],
    actual: [
      'PRD-ORD-v2.3 已冻结（03-06 评审通过 9:1）',
      'REQ-2401~2408 共 32 条验收标准，全部可测',
      'US-01~US-14 GWT 完整率 100%',
      'PC-ORD-1024~1073 映射率 100%（SYNC-0231）',
    ],
    status: 'passed',
    blocking: true,
    approverId: 'u-su',
    lastCheckedAt: '2026-03-06 16:40',
    lastPipelineId: '',
    evidence: ['docs/prd/PRD-ORD-v2.3.md', 'PingCode Epic EPIC-ORDER-REF'],
    passRate: 100,
  },
  {
    id: 'G2',
    name: '架构门禁',
    stageId: 'st-arch',
    ownerRoleId: 'architect',
    agentId: 'ag-arch',
    desc: '限界上下文与组件边界冻结、接口契约签署、任务拆解可追溯到需求。',
    criteria: [
      '接口契约全部签署冻结（无 draft）',
      '架构决策记录 ADR 已归档',
      '每个任务至少关联 1 个组件或契约',
      '任务需求追溯覆盖率 100%',
    ],
    actual: [
      'API-01~API-14 全部 frozen，0 份 draft（截至 2026-03-08 本门禁核验时点；其后 API-05 / API-13 转 reviewing、API-06 / API-10 / API-14 转 draft，需触发 G2 复判）',
      'ADR-2401-03 已归档（分片键选型）',
      '24 个任务全部关联组件（componentIds 非空 22 个，发布类 2 个走环境拓扑）',
      '除发布单 TASK-2421 外，23 个任务需求追溯 100%',
    ],
    status: 'passed',
    blocking: true,
    approverId: 'u-yan',
    lastCheckedAt: '2026-03-08 11:20',
    lastPipelineId: '',
    evidence: ['docs/arch/ADR-2401-03.md', 'OpenAPI 契约库 order-v2.yaml'],
    passRate: 100,
  },
  {
    id: 'G3',
    name: '编码门禁',
    stageId: 'st-code',
    ownerRoleId: 'developer',
    agentId: 'ag-review',
    desc: '静态质量与测试覆盖率双达标，MR 评审通过后才能构建可发布产物。',
    criteria: [
      '任务级增量分支覆盖率 ≥ 85%',
      '需求级聚合分支覆盖率 ≥ 85%',
      'SonarQube 阻断级问题 = 0',
      'MR 至少 2 人评审通过且无 must-fix 未处理',
    ],
    actual: [
      '增量 82.6%（TASK-2405 最新一次）✗',
      '聚合 71.4% ✗（缺口：库存扣减失败回滚、重复提交拒绝）',
      '阻断级 0 ✓ / 严重级 2',
      'MR-2410 剩 1 条 must-fix 未处理 ✗',
    ],
    status: 'failed',
    blocking: true,
    approverId: 'u-lin',
    lastCheckedAt: '2026-03-19 17:42',
    lastPipelineId: 'PIPE-2409',
    evidence: ['jacoco-aggregate.xml', 'uncovered-branches.txt', 'gate-G3-report.json'],
    passRate: 42,
  },
  {
    id: 'G4',
    name: '测试门禁',
    stageId: 'st-test',
    ownerRoleId: 'tester',
    agentId: 'ag-test',
    desc: '测试计划全量执行、致命与严重缺陷清零、回归与性能基线达标。',
    criteria: [
      '用例执行率 = 100%（248 条）',
      'P0 / P1 缺陷全部关闭',
      '核心接口 P95 ≤ 契约基线',
      '压测通过：3,000 TPS 下错误率 < 0.1%',
    ],
    actual: [
      '执行率 62.1%（154 / 248），94 条待执行 ✗',
      'P0 未关闭 4 个、P1 未关闭 3 个 ✗',
      'API-01 P95 186ms（基线 200ms）✓ / API-03 P95 342ms（基线 200ms，超标 71%）✗',
      '压测 2,400 TPS 错误率 0.06%，未跑到 3,000 TPS 目标 △',
    ],
    status: 'pending',
    blocking: true,
    approverId: 'u-he',
    lastCheckedAt: '2026-03-19 18:10',
    lastPipelineId: 'PIPE-2410',
    evidence: ['docs/test/TR-24-case-matrix.xlsx', 'jmeter-report-0318.html'],
    passRate: 62,
  },
  {
    id: 'G5',
    name: '发布门禁',
    stageId: 'st-deploy',
    ownerRoleId: 'ops',
    agentId: 'ag-ops',
    desc: '变更审批齐备、灰度批次与回切预案演练通过、前置任务全部完成。',
    criteria: [
      '前置工作项 100% 完成',
      '一键回切脚本演练通过且 RTO ≤ 10 分钟',
      '灰度批次配置合法（含观察窗）',
      '三级变更审批签署完成',
    ],
    actual: [
      'TASK-2419 dev、TASK-2420 15% ✗',
      '预生产演练 2 次，RTO 6.5 分钟 ✓',
      '1% → 10% → 50% → 100% 四批，观察窗各 30 分钟 ✓',
      '一级已签（孟星回），二三级待 G3/G4 通过后签署 ✗',
    ],
    status: 'pending',
    blocking: true,
    approverId: 'u-lin',
    lastCheckedAt: '2026-03-19 17:50',
    lastPipelineId: 'PIPE-2410',
    evidence: ['release-precheck.json', 'rollback-plan.md', 'gray-batches.yaml'],
    passRate: 50,
  },
  {
    id: 'G6',
    name: '观测门禁',
    stageId: 'st-observe',
    ownerRoleId: 'ops',
    agentId: 'ag-ba',
    desc: '发布后核心指标基线、告警规则、日志留存与审计留痕全部就绪。',
    criteria: [
      '核心业务指标 100% 注册且有基线',
      'P0 告警 1 分钟内触达值班人',
      '操作日志留存 ≥ 180 天',
      '敏感字段访问审计留痕 100%',
    ],
    actual: [
      '已注册 18 / 22 个核心指标（幂等命中率、消息积压、分摊尾差等已就绪）△',
      '飞书值班群 + 电话双通道已配置，实测触达 42 秒 ✓',
      'Loki 留存策略 180 天 ✓',
      '导出接口审计留痕未上线（TASK-2424 待处理，BUG-1052 未修）✗',
    ],
    status: 'pending',
    blocking: false,
    approverId: 'u-meng',
    lastCheckedAt: '2026-03-19 09:15',
    lastPipelineId: 'PIPE-2406',
    evidence: ['grafana-dashboard.json', 'alert-rules.yaml', 'loki-retention.yaml'],
    passRate: 20,
  },
];

export const GATE_MAP: Record<string, GateDef> = GATES.reduce<Record<string, GateDef>>((acc, g) => {
  acc[g.id] = g;
  return acc;
}, {});

/** G3 门禁失败趋势（PIPE-2407 → 2408 → 2409） */
export const G3_FAILURE_TREND: { runId: string; date: string; coverage: number; addedCases: number; note: string }[] = [
  { runId: 'PIPE-2407', date: '2026-03-16', coverage: 68.2, addedCases: 186, note: '首轮聚合基线，缺口 16.8pp' },
  { runId: 'PIPE-2408', date: '2026-03-18', coverage: 68.2, addedCases: 22, note: '补测方向偏差，覆盖率零提升' },
  { runId: 'PIPE-2409', date: '2026-03-19', coverage: 71.4, addedCases: 34, note: '+3.2pp，仍差 13.6pp；缺口锁定 2 个异常分支' },
];

/* ============================================================
 * 14. 环境拓扑与发布单
 * ============================================================ */

/** 环境实例 */
export interface EnvInstanceDef {
  name: string;
  replicas: number;
  readyReplicas: number;
  cpu: string;
  mem: string;
  status: 'healthy' | 'degraded' | 'down';
}

/** 环境定义 */
export interface EnvDef {
  id: string;
  code: string;
  name: string;
  cluster: string;
  namespace: string;
  url: string;
  ownerRoleId: string;
  ownerId: string;
  /** 当前部署版本 tag */
  version: string;
  lastDeployAt: string;
  lastPipelineId: string;
  /** 数据是否为脱敏/仿真数据 */
  dataMasked: boolean;
  dataSource: string;
  /** 出域策略标识，与 EGRESS_POLICY 对齐 */
  egressPolicyId: string;
  /** 允许调用的模型 */
  allowedModelIds: string[];
  health: 'healthy' | 'degraded' | 'down';
  qps: number;
  p95Ms: number;
  errorRate: number;
  instances: EnvInstanceDef[];
  note: string;
}

export const ENVIRONMENTS: EnvDef[] = [
  {
    id: 'env-dev',
    code: 'DEV',
    name: '开发环境',
    cluster: 'k8s-dev-sh01',
    namespace: 'trade-order-dev',
    url: 'https://order-dev.intra.example.com',
    ownerRoleId: 'developer',
    ownerId: 'u-zhou',
    version: 'order-api:dev-b60f2a5',
    lastDeployAt: '2026-03-19 16:20',
    lastPipelineId: 'PIPE-2409',
    dataMasked: true,
    dataSource: '本地构造数据 + 脱敏样本 5 万条',
    egressPolicyId: 'EGRESS-ALLOW',
    allowedModelIds: ['mdl-claude', 'mdl-deepseek', 'mdl-qwen', 'mdl-gpt5', 'mdl-local'],
    health: 'healthy',
    qps: 42,
    p95Ms: 128,
    errorRate: 0.12,
    instances: [
      { name: 'order-api', replicas: 2, readyReplicas: 2, cpu: '0.3 / 1 核', mem: '612MB / 2Gi', status: 'healthy' },
      { name: 'order-query', replicas: 1, readyReplicas: 1, cpu: '0.2 / 1 核', mem: '430MB / 2Gi', status: 'healthy' },
      { name: 'order-migrate-job', replicas: 1, readyReplicas: 0, cpu: '0 / 0.5 核', mem: '0 / 1Gi', status: 'down' },
    ],
    note: 'AI 编码会话默认落在本环境；迁移作业实例因 BLOCK-0312 无数据库窗口而停机。',
  },
  {
    id: 'env-test',
    code: 'TEST',
    name: '测试环境',
    cluster: 'k8s-test-sh01',
    namespace: 'trade-order-test',
    url: 'https://order-test.intra.example.com',
    ownerRoleId: 'tester',
    ownerId: 'u-he',
    version: 'order-api:2418-2fa97b6',
    lastDeployAt: '2026-03-15 09:58',
    lastPipelineId: 'PIPE-2406',
    dataMasked: true,
    dataSource: '生产脱敏快照（2026-03-01）+ 自动化造数',
    egressPolicyId: 'EGRESS-MASK',
    allowedModelIds: ['mdl-claude', 'mdl-deepseek', 'mdl-qwen', 'mdl-local'],
    health: 'degraded',
    qps: 186,
    p95Ms: 214,
    errorRate: 0.86,
    instances: [
      { name: 'order-api', replicas: 3, readyReplicas: 3, cpu: '1.6 / 2 核', mem: '2.4Gi / 4Gi', status: 'healthy' },
      { name: 'order-query', replicas: 2, readyReplicas: 2, cpu: '1.1 / 2 核', mem: '1.9Gi / 4Gi', status: 'degraded' },
      { name: 'order-event', replicas: 2, readyReplicas: 2, cpu: '0.6 / 1 核', mem: '880MB / 2Gi', status: 'healthy' },
      { name: 'order-cache', replicas: 3, readyReplicas: 2, cpu: '0.9 / 2 核', mem: '3.1Gi / 8Gi', status: 'degraded' },
    ],
    note: 'order-query P95 342ms 超契约基线（BUG-1047 跨分片分页），order-cache 有 1 个副本因 BUG-1048 脏读排查被隔离。',
  },
  {
    id: 'env-staging',
    code: 'STAGING',
    name: '预生产环境',
    cluster: 'k8s-stg-sz02',
    namespace: 'trade-order-stg',
    url: 'https://order-stg.intra.example.com',
    ownerRoleId: 'ops',
    ownerId: 'u-meng',
    version: 'order-api:2413-4e6a918',
    lastDeployAt: '2026-03-13 11:31',
    lastPipelineId: 'PIPE-2404',
    dataMasked: true,
    dataSource: '生产脱敏副本（每日 02:00 同步，字段级 SM4 加密）',
    egressPolicyId: 'EGRESS-DENY',
    allowedModelIds: ['mdl-local'],
    health: 'healthy',
    qps: 640,
    p95Ms: 168,
    errorRate: 0.04,
    instances: [
      { name: 'order-api', replicas: 6, readyReplicas: 6, cpu: '2.4 / 4 核', mem: '5.2Gi / 8Gi', status: 'healthy' },
      { name: 'order-query', replicas: 4, readyReplicas: 4, cpu: '1.8 / 4 核', mem: '4.1Gi / 8Gi', status: 'healthy' },
      { name: 'order-db（分片 x2）', replicas: 2, readyReplicas: 2, cpu: '3.1 / 8 核', mem: '18Gi / 32Gi', status: 'healthy' },
      { name: 'order-migrate-job', replicas: 1, readyReplicas: 1, cpu: '0.4 / 2 核', mem: '1.2Gi / 4Gi', status: 'healthy' },
    ],
    note: '回切脚本已在此演练 2 次（RTO 6.5 分钟）；因 G3 未通过，PIPE-2407/2408/2409 均未能把新镜像推入本环境。',
  },
  {
    id: 'env-prod',
    code: 'PROD',
    name: '生产环境',
    cluster: 'k8s-prod-bj01 / k8s-prod-bj02',
    namespace: 'trade-order',
    url: 'https://order.trade.example.com',
    ownerRoleId: 'ops',
    ownerId: 'u-meng',
    version: 'order-api:v1.9.4（旧单体分片前版本）',
    lastDeployAt: '2026-02-27 22:10',
    lastPipelineId: 'PIPE-2318',
    dataMasked: false,
    dataSource: '真实生产数据（禁止出域）',
    egressPolicyId: 'EGRESS-DENY',
    allowedModelIds: ['mdl-local'],
    health: 'healthy',
    qps: 2860,
    p95Ms: 142,
    errorRate: 0.02,
    instances: [
      { name: 'order-api', replicas: 24, readyReplicas: 24, cpu: '2.8 / 4 核', mem: '5.8Gi / 8Gi', status: 'healthy' },
      { name: 'order-query', replicas: 16, readyReplicas: 16, cpu: '2.2 / 4 核', mem: '4.6Gi / 8Gi', status: 'healthy' },
      { name: 'order-db（旧集群）', replicas: 4, readyReplicas: 4, cpu: '4.6 / 16 核', mem: '42Gi / 64Gi', status: 'healthy' },
      { name: 'order-db（新分片集群）', replicas: 8, readyReplicas: 8, cpu: '0.3 / 8 核', mem: '6Gi / 32Gi', status: 'healthy' },
    ],
    note: '新分片集群已建好但处于只读空载，等待 REL-2403 切流；当前仍由旧集群承载全部读写。',
  },
];

export const ENV_MAP: Record<string, EnvDef> = ENVIRONMENTS.reduce<Record<string, EnvDef>>((acc, e) => {
  acc[e.id] = e;
  return acc;
}, {});

/* -------------------------------------------------------------------------
 * 14.2 发布单与灰度批次
 * ---------------------------------------------------------------------- */

/** 灰度批次 */
export interface GrayBatchDef {
  batch: number;
  ratio: number;
  plannedAt: string;
  observeMin: number;
  status: 'done' | 'running' | 'waiting' | 'blocked' | 'skipped';
  entryCriteria: string;
  exitCriteria: string;
  actualAt: string;
  note: string;
}

/** 发布单 */
export interface ReleaseOrderDef {
  id: string;
  taskId: string;
  title: string;
  version: string;
  envId: string;
  ownerId: string;
  approverIds: string[];
  status: 'released' | 'approving' | 'blocked' | 'planned' | 'rolledback';
  windowStart: string;
  windowEnd: string;
  changeItems: number;
  riskLevel: 'high' | 'medium' | 'low';
  rollbackPlan: string;
  rtoMin: number;
  rehearsed: number;
  gateIds: string[];
  gateBlockedIds: string[];
  batches: GrayBatchDef[];
  affectedServices: string[];
  summary: string;
}

export const RELEASE_ORDERS: ReleaseOrderDef[] = [
  {
    id: 'REL-2401',
    taskId: '',
    title: '订单查询服务读扩容与慢 SQL 治理',
    version: 'order-query:v1.9.2',
    envId: 'env-prod',
    ownerId: 'u-meng',
    approverIds: ['u-lin', 'u-yan'],
    status: 'released',
    windowStart: '2026-02-13 22:00',
    windowEnd: '2026-02-13 23:30',
    changeItems: 9,
    riskLevel: 'low',
    rollbackPlan: '镜像回滚至 v1.9.1，配置中心一键还原',
    rtoMin: 5,
    rehearsed: 1,
    gateIds: ['G3', 'G4', 'G5'],
    gateBlockedIds: [],
    batches: [
      { batch: 1, ratio: 10, plannedAt: '2026-02-13 22:10', observeMin: 20, status: 'done', entryCriteria: 'G3/G4 通过', exitCriteria: 'P95 无劣化', actualAt: '2026-02-13 22:12', note: 'P95 由 286ms 降至 214ms' },
      { batch: 2, ratio: 100, plannedAt: '2026-02-13 22:40', observeMin: 30, status: 'done', entryCriteria: '批次 1 观察通过', exitCriteria: '错误率 < 0.05%', actualAt: '2026-02-13 22:44', note: '全量完成，无告警' },
    ],
    affectedServices: ['order-query'],
    summary: 'Sprint 23 常规发布，读副本 16 → 24，慢 SQL 治理 7 条，列表接口 P95 下降 25%。',
  },
  {
    id: 'REL-2402',
    taskId: '',
    title: '优惠规则引擎灰度接入（仅试算链路）',
    version: 'order-api:v1.9.4',
    envId: 'env-prod',
    ownerId: 'u-meng',
    approverIds: ['u-lin', 'u-su'],
    status: 'released',
    windowStart: '2026-02-27 22:00',
    windowEnd: '2026-02-28 00:10',
    changeItems: 16,
    riskLevel: 'medium',
    rollbackPlan: '关闭灰度开关 promo.engine.enabled，回落旧计价链路',
    rtoMin: 3,
    rehearsed: 2,
    gateIds: ['G3', 'G4', 'G5', 'G6'],
    gateBlockedIds: [],
    batches: [
      { batch: 1, ratio: 1, plannedAt: '2026-02-27 22:10', observeMin: 30, status: 'done', entryCriteria: 'G4 通过、开关就绪', exitCriteria: '试算与下单结果一致率 100%', actualAt: '2026-02-27 22:11', note: '一致率 100%，但发现尾差 0.01 元（后转 BUG-1043）' },
      { batch: 2, ratio: 10, plannedAt: '2026-02-27 22:50', observeMin: 30, status: 'done', entryCriteria: '批次 1 观察通过', exitCriteria: '资损告警 0', actualAt: '2026-02-27 22:53', note: '金额分摊尾差告警触发 3 次，暂停观察' },
      { batch: 3, ratio: 30, plannedAt: '2026-02-27 23:30', observeMin: 30, status: 'done', entryCriteria: '尾差问题定位为展示层', exitCriteria: '无资损', actualAt: '2026-02-27 23:41', note: '确认为 double 精度问题，非规则错误，继续灰度' },
      { batch: 4, ratio: 100, plannedAt: '2026-02-28 00:10', observeMin: 0, status: 'done', entryCriteria: '值班双人在线', exitCriteria: '—', actualAt: '2026-02-28 00:10', note: '全量后遗留 BUG-1043 至 Sprint 24 修复' },
    ],
    affectedServices: ['order-api', 'order-event'],
    summary: '试算链路灰度全量，是 BUG-1043 的发现现场；本次发布的资损告警直接催生了 REQ-2403 金额精度专项。',
  },
  {
    id: 'REL-2403',
    taskId: 'TASK-2421',
    title: '订单中心重构生产切流：新分片集群读写切换',
    version: 'order-api:2421-f19d6c0（待构建）',
    envId: 'env-prod',
    ownerId: 'u-meng',
    approverIds: ['u-lin', 'u-yan', 'u-gu'],
    status: 'blocked',
    windowStart: '2026-03-20 22:00',
    windowEnd: '2026-03-21 02:00',
    changeItems: 24,
    riskLevel: 'high',
    rollbackPlan: '一键回切脚本切回旧集群读写（DNS + 配置中心双通道），RTO ≤ 10 分钟',
    rtoMin: 10,
    rehearsed: 2,
    gateIds: ['G3', 'G4', 'G5', 'G6'],
    gateBlockedIds: ['G3', 'G4'],
    batches: [
      { batch: 1, ratio: 1, plannedAt: '2026-03-20 22:00', observeMin: 30, status: 'blocked', entryCriteria: 'G3 ≥ 85% 且 TASK-2419/2420 完成', exitCriteria: '双写比对差异 0、资损告警 0', actualAt: '', note: '被 G3（71.4%）与 BLOCK-0312 双重阻断' },
      { batch: 2, ratio: 10, plannedAt: '2026-03-20 22:45', observeMin: 30, status: 'waiting', entryCriteria: '批次 1 通过', exitCriteria: 'P95 ≤ 200ms、错误率 < 0.05%', actualAt: '', note: '孟星回建议顺延至 03-26' },
      { batch: 3, ratio: 50, plannedAt: '2026-03-20 23:30', observeMin: 45, status: 'waiting', entryCriteria: '批次 2 通过 + 值班 DBA 在线', exitCriteria: '分片热点均衡度偏差 < 10%', actualAt: '', note: '需 DBA 确认新集群连接池上限' },
      { batch: 4, ratio: 100, plannedAt: '2026-03-21 00:40', observeMin: 80, status: 'waiting', entryCriteria: '批次 3 通过 + 林知远口头确认', exitCriteria: '全量无 P0/P1 告警', actualAt: '', note: '林知远决策：门禁未过不谈窗口' },
    ],
    affectedServices: ['order-api', 'order-query', 'order-event', 'order-db（新旧集群）'],
    summary: '本次迭代最高风险发布单：涉及读写流量整体搬迁到新分片集群，当前因 G3 覆盖率、G4 执行率与迁移窗口 BLOCK-0312 三重阻塞，PIPE-2410 预检 6 项通过 4 项。',
  },
];

export const RELEASE_MAP: Record<string, ReleaseOrderDef> = RELEASE_ORDERS.reduce<
  Record<string, ReleaseOrderDef>
>((acc, r) => {
  acc[r.id] = r;
  return acc;
}, {});

/* -------------------------------------------------------------------------
 * 14.3 部署通知配置与记录
 * ---------------------------------------------------------------------- */

/** 通知渠道配置 */
export interface DeployNotifyDef {
  id: string;
  channel: 'lark-group' | 'lark-card' | 'email' | 'webhook' | 'sms' | 'phone';
  target: string;
  /** 触发事件 */
  events: string[];
  receiverIds: string[];
  template: string;
  enabled: boolean;
  silenceWindow: string;
  lastSentAt: string;
  sentCount30d: number;
}

export const DEPLOY_NOTIFY: DeployNotifyDef[] = [
  {
    id: 'DN-01',
    channel: 'lark-card',
    target: '飞书群「订单中心重构 · 发布指挥」',
    events: ['gate.failed', 'pipeline.failed', 'release.blocked'],
    receiverIds: ['u-lin', 'u-meng', 'u-zhou', 'u-he'],
    template: '【门禁告警】{{gateId}} 未通过：{{metric}} = {{actual}}（阈值 {{threshold}}）｜流水线 {{pipelineId}}｜影响 {{taskIds}}',
    enabled: true,
    silenceWindow: '无（P0 通道不静默）',
    lastSentAt: '2026-03-19 17:42',
    sentCount30d: 7,
  },
  {
    id: 'DN-02',
    channel: 'lark-group',
    target: '飞书群「订单中心重构 · 发布指挥」',
    events: ['deploy.started', 'deploy.success', 'gray.batch.done'],
    receiverIds: ['u-meng', 'u-zhou', 'u-shen'],
    template: '【部署】{{envName}} 部署 {{version}} 完成，耗时 {{duration}}，健康检查 {{health}}',
    enabled: true,
    silenceWindow: '22:00-08:00 合并推送',
    lastSentAt: '2026-03-15 09:58',
    sentCount30d: 24,
  },
  {
    id: 'DN-03',
    channel: 'lark-card',
    target: '个人（审批人）',
    events: ['release.approval.required', 'gate.waiver.required'],
    receiverIds: ['u-lin', 'u-yan', 'u-gu'],
    template: '【待审批】发布单 {{releaseId}} 需要 {{level}} 级审批，前置门禁 {{gateStatus}}，点击查看详情与风险清单',
    enabled: true,
    silenceWindow: '无',
    lastSentAt: '2026-03-19 17:51',
    sentCount30d: 5,
  },
  {
    id: 'DN-04',
    channel: 'sms',
    target: '值班手机（孟星回 / 周浩然轮值）',
    events: ['rollback.triggered', 'prod.p0.alert'],
    receiverIds: ['u-meng', 'u-zhou'],
    template: '【P0】生产 {{service}} 触发 {{event}}，请立即进入发布指挥群，回切脚本 {{rollbackCmd}}',
    enabled: true,
    silenceWindow: '无',
    lastSentAt: '2026-02-27 23:05',
    sentCount30d: 2,
  },
  {
    id: 'DN-05',
    channel: 'phone',
    target: '值班电话（升级通道）',
    events: ['prod.p0.alert.unacked.5min'],
    receiverIds: ['u-meng', 'u-lin'],
    template: '语音播报：生产 P0 告警 5 分钟未确认，自动升级至研发总监',
    enabled: true,
    silenceWindow: '无',
    lastSentAt: '2026-01-22 03:14',
    sentCount30d: 0,
  },
  {
    id: 'DN-06',
    channel: 'webhook',
    target: 'PingCode 工作项评论回写',
    events: ['pipeline.finished', 'gate.failed', 'release.status.changed'],
    receiverIds: ['u-gu'],
    template: 'POST /openapi/workitem/{{pcCode}}/comment：{{pipelineId}} {{status}}，门禁 {{gateId}} {{result}}，同步队列 SYNC-xxxx',
    enabled: true,
    silenceWindow: '无',
    lastSentAt: '2026-03-19 17:52',
    sentCount30d: 31,
  },
  {
    id: 'DN-07',
    channel: 'email',
    target: 'change-advisory@example.com（变更委员会）',
    events: ['release.window.changed', 'release.rolledback'],
    receiverIds: ['u-gu', 'u-lin'],
    template: '变更窗口调整通知：{{releaseId}} 由 {{oldWindow}} 调整为 {{newWindow}}，原因 {{reason}}',
    enabled: false,
    silenceWindow: '—',
    lastSentAt: '2026-02-28 09:00',
    sentCount30d: 1,
  },
];

/** 最近通知发送记录 */
export interface DeployNotifyLogDef {
  id: string;
  notifyId: string;
  /** 本次发送实际套用的通知模板编号（取自 DEPLOY_NOTIFY 的 id，与该条日志的渠道 / 事件严格匹配） */
  templateId: string;
  event: string;
  time: string;
  title: string;
  receivers: string[];
  channel: string;
  result: 'sent' | 'failed' | 'merged';
  relatedIds: string[];
}

export const DEPLOY_NOTIFY_LOGS: DeployNotifyLogDef[] = [
  {
    id: 'DNL-01',
    notifyId: 'DN-01',
    templateId: 'DN-01',
    event: 'gate.failed',
    time: '2026-03-19 17:42',
    title: 'G3 未通过：聚合分支覆盖率 71.4% < 85%（PIPE-2409，第 3 次）',
    receivers: ['u-lin', 'u-meng', 'u-zhou', 'u-he'],
    channel: 'lark-card',
    result: 'sent',
    relatedIds: ['PIPE-2409', 'G3', 'TASK-2405'],
  },
  {
    id: 'DNL-02',
    notifyId: 'DN-03',
    templateId: 'DN-03',
    event: 'release.approval.required',
    time: '2026-03-19 17:51',
    title: 'REL-2403 二级审批挂起：前置门禁 G3/G4 未通过',
    receivers: ['u-lin', 'u-yan', 'u-gu'],
    channel: 'lark-card',
    result: 'sent',
    relatedIds: ['REL-2403', 'TASK-2421', 'PIPE-2410'],
  },
  {
    id: 'DNL-03',
    notifyId: 'DN-06',
    templateId: 'DN-06',
    event: 'pipeline.finished',
    time: '2026-03-19 17:52',
    title: '回写 PC-ORD-2421：预检失败，任务状态保持 dev',
    receivers: ['u-gu'],
    channel: 'webhook',
    result: 'sent',
    relatedIds: ['PIPE-2410', 'PC-ORD-2421', 'SYNC-0231'],
  },
  {
    id: 'DNL-04',
    notifyId: 'DN-01',
    templateId: 'DN-01',
    event: 'gate.failed',
    time: '2026-03-18 10:29',
    title: 'G3 未通过：覆盖率 68.2% 零提升（PIPE-2408，第 2 次）',
    receivers: ['u-lin', 'u-meng', 'u-zhou', 'u-he'],
    channel: 'lark-card',
    result: 'sent',
    relatedIds: ['PIPE-2408', 'G3', 'TASK-2405'],
  },
  {
    id: 'DNL-05',
    notifyId: 'DN-02',
    templateId: 'DN-02',
    event: 'deploy.success',
    time: '2026-03-15 09:58',
    title: '测试环境部署 order-tools:2418-2fa97b6 完成（PIPE-2406）',
    receivers: ['u-meng', 'u-zhou', 'u-shen'],
    channel: 'lark-group',
    result: 'sent',
    relatedIds: ['PIPE-2406', 'TASK-2418', 'env-test'],
  },
  {
    id: 'DNL-06',
    notifyId: 'DN-01',
    templateId: 'DN-01',
    event: 'pipeline.failed',
    time: '2026-03-16 18:02',
    title: 'G3 未通过：聚合分支覆盖率 68.2% < 85%（PIPE-2407，第 1 次）',
    receivers: ['u-lin', 'u-meng', 'u-zhou', 'u-he'],
    channel: 'lark-card',
    result: 'sent',
    relatedIds: ['PIPE-2407', 'G3', 'TASK-2405'],
  },
  {
    id: 'DNL-07',
    notifyId: 'DN-04',
    templateId: 'DN-04',
    event: 'prod.p0.alert',
    time: '2026-02-27 23:05',
    title: '生产金额分摊尾差告警 3 次（REL-2402 批次 2 观察期）',
    receivers: ['u-meng', 'u-zhou'],
    channel: 'sms',
    result: 'sent',
    relatedIds: ['REL-2402', 'BUG-1043'],
  },
  {
    id: 'DNL-08',
    notifyId: 'DN-02',
    templateId: 'DN-02',
    event: 'gray.batch.done',
    time: '2026-02-28 00:10',
    title: 'REL-2402 批次 4（100%）全量完成，遗留 BUG-1043',
    receivers: ['u-meng', 'u-zhou', 'u-shen'],
    channel: 'lark-group',
    result: 'merged',
    relatedIds: ['REL-2402', 'BUG-1043'],
  },
];

/* ==================================================================
 * 15. 测试域（S4 环节）
 * ================================================================== */

/** 测试模块（按业务域切分，用例总数 248） */
export interface TestModuleDef {
  id: string;
  code: string;
  name: string;
  reqIds: string[];
  taskIds: string[];
  caseCount: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  autoRate: number;
  ownerId: string;
  priority: 'P0' | 'P1' | 'P2';
  note: string;
}

export const TEST_MODULES: TestModuleDef[] = [
  {
    id: 'tm-create',
    code: 'ORDER-CREATE',
    name: '下单主链路',
    reqIds: ['REQ-2401'],
    taskIds: ['TASK-2401', 'TASK-2402', 'TASK-2403', 'TASK-2404', 'TASK-2405'],
    caseCount: 52,
    executed: 44,
    passed: 40,
    failed: 3,
    blocked: 1,
    autoRate: 78,
    ownerId: 'u-he',
    priority: 'P0',
    note: '幂等两级校验 44 条已跑通；库存扣减失败回滚分支缺失（BUG-1045），8 条待 TASK-2405 补齐后执行。',
  },
  {
    id: 'tm-state',
    code: 'ORDER-STATE',
    name: '订单状态机',
    reqIds: ['REQ-2402'],
    taskIds: ['TASK-2406', 'TASK-2407', 'TASK-2408'],
    caseCount: 46,
    executed: 34,
    passed: 29,
    failed: 4,
    blocked: 1,
    autoRate: 65,
    ownerId: 'u-he',
    priority: 'P0',
    note: '10 态 42 条流转边覆盖 34 条；热更新规则用例因 TASK-2407 仍在设计中（35%）被阻塞。',
  },
  {
    id: 'tm-consist',
    code: 'ORDER-CONSIST',
    name: '一致性与可靠投递',
    reqIds: ['REQ-2401', 'REQ-2406'],
    taskIds: ['TASK-2402', 'TASK-2417', 'TASK-2418'],
    caseCount: 34,
    executed: 14,
    passed: 11,
    failed: 2,
    blocked: 1,
    autoRate: 52,
    ownerId: 'u-shen',
    priority: 'P0',
    note: 'MQ 乱序（BUG-1049）与死信并发回放（BUG-1051）两处失败；混沌注入类 20 条待环境窗口。',
  },
  {
    id: 'tm-promo',
    code: 'ORDER-PROMO',
    name: '优惠与金额精度',
    reqIds: ['REQ-2403'],
    taskIds: ['TASK-2409', 'TASK-2410', 'TASK-2411'],
    caseCount: 38,
    executed: 24,
    passed: 20,
    failed: 4,
    blocked: 0,
    autoRate: 71,
    ownerId: 'u-he',
    priority: 'P0',
    note: '128 组金额边界用例源自 BUG-1043；MR-2410 剩 1 条 must-fix（负向分摊）未合入，14 条暂缓。',
  },
  {
    id: 'tm-perf',
    code: 'ORDER-PERF',
    name: '性能与容量',
    reqIds: ['REQ-2404'],
    taskIds: ['TASK-2412', 'TASK-2413', 'TASK-2414'],
    caseCount: 22,
    executed: 10,
    passed: 7,
    failed: 2,
    blocked: 1,
    autoRate: 100,
    ownerId: 'u-meng',
    priority: 'P1',
    note: 'JMeter 全脚本化；API-03 P95 342ms 未达 200ms 契约（BUG-1047），长稳压测触发内存增长（BUG-1053）。',
  },
  {
    id: 'tm-sec',
    code: 'ORDER-SEC',
    name: '安全与合规',
    reqIds: ['REQ-2408'],
    taskIds: ['TASK-2422', 'TASK-2423', 'TASK-2424'],
    caseCount: 34,
    executed: 6,
    passed: 3,
    failed: 2,
    blocked: 1,
    autoRate: 44,
    ownerId: 'u-he',
    priority: 'P1',
    note: 'TASK-2422~2423 为 refined 态、TASK-2424 为 backlog 态，均尚未开发，仅先跑了导出链路 6 条；两条高危（BUG-1052/BUG-1054）已开放。',
  },
  {
    id: 'tm-migrate',
    code: 'ORDER-MIGRATE',
    name: '迁移与双写校验',
    reqIds: ['REQ-2407'],
    taskIds: ['TASK-2419', 'TASK-2420'],
    caseCount: 22,
    executed: 22,
    passed: 22,
    failed: 0,
    blocked: 0,
    autoRate: 88,
    ownerId: 'u-shen',
    priority: 'P1',
    note: '22 条全部通过（1200 万行双写零差异），但 TASK-2419 被 BLOCK-0312 阻塞，生产迁移窗口未定。',
  },
];

export const TEST_MODULE_MAP: Record<string, TestModuleDef> = Object.fromEntries(
  TEST_MODULES.map((m) => [m.id, m]),
);

/** 测试计划（按模块分组，与 G4 门禁「154 / 248」严格一致） */
export interface TestPlanDef {
  id: string;
  name: string;
  moduleIds: string[];
  sprintId: string;
  ownerId: string;
  executorIds: string[];
  envId: string;
  window: string;
  round: number;
  /** 触发方式：pipeline 流水线部署后自动触发 / manual 人工发起 / schedule 定时任务 */
  trigger: 'pipeline' | 'manual' | 'schedule';
  caseCount: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  /**
   * 本轮明确标记「跳过」的用例数（如依赖未就绪、本轮暂缓），不计入执行率。
   * 口径说明：既有 executed = passed + failed + blocked（blocked 已计入 executed），
   * 故 skipped 与 executed 互斥，约束为 executed + skipped <= caseCount，差额为「待执行」用例。
   */
  skipped: number;
  execRate: number;
  passRate: number;
  status: 'running' | 'paused' | 'blocked' | 'done';
  entryCriteria: string;
  exitCriteria: string;
  blockers: string[];
  aiGenerated: number;
  humanReviewed: number;
  updatedAt: string;
  summary: string;
}

export const TEST_PLANS: TestPlanDef[] = [
  {
    id: 'TP-01',
    name: '核心功能回归（第 3 轮）',
    moduleIds: ['tm-create', 'tm-state', 'tm-consist'],
    sprintId: 'SP-24',
    ownerId: 'u-he',
    executorIds: ['u-he', 'u-shen', 'u-ai-copilot'],
    envId: 'env-test',
    window: '2026-03-09 ~ 2026-03-24',
    round: 3,
    /** 第 3 轮回归由 PIPE-2406 部署测试环境后自动触发 */
    trigger: 'pipeline',
    caseCount: 132,
    executed: 92,
    passed: 80,
    failed: 9,
    blocked: 3,
    /** 状态机热更新规则 12 条（tm-state 未执行部分）因 TASK-2407 仅 35% 本轮标记跳过 */
    skipped: 12,
    execRate: 69.7,
    passRate: 87,
    status: 'running',
    entryCriteria: '构建产物入测试环境、G3 任务级覆盖率 ≥ 85%',
    exitCriteria: '执行率 100%、P0/P1 缺陷全部关闭',
    blockers: ['TASK-2405 覆盖率缺口', 'TASK-2407 状态机热更新未实现'],
    aiGenerated: 96,
    humanReviewed: 96,
    updatedAt: '2026-03-19 16:40',
    summary:
      '第 3 轮回归覆盖下单、状态机、一致性三大主链路；9 条失败归并为 6 个缺陷，其中 BUG-1045 / BUG-1046 / BUG-1049 为 P0。',
  },
  {
    id: 'TP-02',
    name: '金额与优惠边界专项',
    moduleIds: ['tm-promo'],
    sprintId: 'SP-24',
    ownerId: 'u-he',
    executorIds: ['u-he', 'u-zhou'],
    envId: 'env-test',
    window: '2026-03-11 ~ 2026-03-22',
    round: 2,
    /** 金额专项由何斯年针对 BUG-1043 手工发起，非流水线自动触发 */
    trigger: 'manual',
    caseCount: 38,
    executed: 24,
    passed: 20,
    failed: 4,
    blocked: 0,
    /** 14 条负向分摊 / 退款边界用例因 MR-2410 剩 1 条 must-fix 未合入而暂缓跳过 */
    skipped: 14,
    execRate: 63.2,
    passRate: 83.3,
    status: 'paused',
    entryCriteria: 'MR-2410 合入、BigDecimal 全链路生效',
    exitCriteria: '128 组边界尾差恒为 0、试算与下单一致率 100%',
    blockers: ['MR-2410 剩 1 条 must-fix（负向分摊）待修'],
    aiGenerated: 128,
    humanReviewed: 128,
    updatedAt: '2026-03-19 11:20',
    summary:
      '专项由 BUG-1043 催生，128 组金额边界用例由测试 Agent 生成、何斯年全量复核；4 条失败全部指向同一根因（分摊尾差）。',
  },
  {
    id: 'TP-03',
    name: '性能与容量压测',
    moduleIds: ['tm-perf'],
    sprintId: 'SP-24',
    ownerId: 'u-meng',
    executorIds: ['u-meng', 'u-zhou'],
    envId: 'env-staging',
    window: '2026-03-17 ~ 2026-03-25',
    round: 1,
    /** 首轮压测由孟星回手工发起（需预生产 1/3 数据量与分片路由改造就位） */
    trigger: 'manual',
    caseCount: 22,
    executed: 10,
    passed: 7,
    failed: 2,
    blocked: 1,
    /** 长稳与容量类 11 条随压测暂停整体跳过，待 BUG-1053 内存增长定位后重排窗口（余 1 条待执行） */
    skipped: 11,
    execRate: 45.5,
    passRate: 70,
    status: 'blocked',
    entryCriteria: '预生产数据量达生产 1/3、分片路由改造合入',
    exitCriteria: 'API-01 P99 < 200ms、API-03 P95 ≤ 200ms @3000 TPS',
    blockers: ['BUG-1047 跨分片分页 342ms', 'BUG-1053 长稳内存增长待定位'],
    aiGenerated: 10,
    humanReviewed: 10,
    updatedAt: '2026-03-18 21:15',
    summary:
      '实测 2,400 TPS（目标 3,000）；API-01 P95 186ms 达标，API-03 P95 342ms 超标 71%。30 分钟长稳后老年代持续上涨，压测暂停。',
  },
  {
    id: 'TP-04',
    name: '安全合规与数据迁移',
    moduleIds: ['tm-sec', 'tm-migrate'],
    sprintId: 'SP-24',
    ownerId: 'u-he',
    executorIds: ['u-he', 'u-shen'],
    envId: 'env-test',
    window: '2026-03-18 ~ 2026-03-26',
    round: 1,
    /** 迁移双写校验与安全基线扫描每日 02:00 定时跑批，无需人工触发 */
    trigger: 'schedule',
    caseCount: 56,
    executed: 28,
    passed: 25,
    failed: 2,
    blocked: 1,
    /** 无跳过用例：tm-sec 剩余 28 条属「待 TASK-2422~2424 开发完成后执行」，仍计入待执行 */
    skipped: 0,
    execRate: 50,
    passRate: 89.3,
    status: 'running',
    entryCriteria: '脱敏规则 SEC-MASK-2.1 发布、迁移作业可运行',
    exitCriteria: '高危 0、审计留痕 100%、双写零差异',
    blockers: ['TASK-2422~2424 尚未启动', 'BLOCK-0312 阻塞迁移作业实例'],
    aiGenerated: 22,
    humanReviewed: 22,
    updatedAt: '2026-03-19 09:35',
    summary:
      '迁移侧 22 条全部通过；安全侧仅先跑导出链路 6 条，暴露审计留痕缺失（BUG-1052）与脱敏漏网（BUG-1054）两项高危。',
  },
];

export const TEST_PLAN_MAP: Record<string, TestPlanDef> = Object.fromEntries(
  TEST_PLANS.map((p) => [p.id, p]),
);

/** 测试用例（全量 248 条，此处列出 20 条关键代表性用例） */
export interface TestCaseDef {
  id: string;
  moduleId: string;
  planId: string;
  title: string;
  reqId: string;
  taskId: string;
  apiId: string;
  priority: 'P0' | 'P1' | 'P2';
  type: '功能' | '接口' | '性能' | '安全' | '回归' | '混沌';
  auto: boolean;
  authorId: string;
  preconditions: string;
  steps: string[];
  expected: string[];
  actual: string;
  status: 'passed' | 'failed' | 'blocked' | 'pending';
  lastRunAt: string;
  durationSec: number;
  bugIds: string[];
  evidence: string;
}

export const TEST_CASES: TestCaseDef[] = [
  {
    id: 'TC-001',
    moduleId: 'tm-create',
    planId: 'TP-01',
    title: '相同 Idempotency-Key 重复提交仅生成一笔订单',
    reqId: 'REQ-2401',
    taskId: 'TASK-2401',
    apiId: 'API-01',
    priority: 'P0',
    type: '接口',
    auto: true,
    authorId: 'u-ai-copilot',
    preconditions: 'Redis 7 可用；用户 u-test-01 已完成实名；商品库存 100',
    steps: [
      'POST /api/v2/orders，Header 携带 Idempotency-Key: idem-20260319-0001',
      '等待首次请求返回 orderId',
      '使用完全相同的 Key 与 Body 再次 POST，共重复 5 次',
      '查询 order 表与该 Key 的幂等记录',
    ],
    expected: [
      '首次返回 201 与 orderId',
      '后续 5 次返回 200 且 orderId 与首次一致',
      'order 表仅 1 行，幂等记录 hitCount = 5',
    ],
    actual: '首次 201，重复 5 次均 200 且 orderId 一致，order 表 1 行，hitCount = 5',
    status: 'passed',
    lastRunAt: '2026-03-19 10:12',
    durationSec: 4,
    bugIds: [],
    evidence: 'auto-report/TC-001-20260319.html',
  },
  {
    id: 'TC-002',
    moduleId: 'tm-create',
    planId: 'TP-01',
    title: '幂等键过期（24h）后重复提交应生成新订单',
    reqId: 'REQ-2401',
    taskId: 'TASK-2401',
    apiId: 'API-01',
    priority: 'P1',
    type: '接口',
    auto: true,
    authorId: 'u-ai-copilot',
    preconditions: '将幂等键 TTL 配置临时调整为 60s',
    steps: [
      '首次 POST /api/v2/orders 携带 Idempotency-Key: idem-expire-01',
      '等待 65s 使 Redis 快路径过期',
      '以相同 Key 再次提交',
      '核对 DB 唯一索引兜底行为与返回码',
    ],
    expected: [
      'DB 唯一索引拦截，返回 409 与错误码 ORD-40902',
      '响应体提示「幂等键已过期，请重新发起」',
      'order 表仍为 1 行，无脏数据',
    ],
    actual: '返回 409 / ORD-40902，提示文案一致，order 表 1 行',
    status: 'passed',
    lastRunAt: '2026-03-19 10:18',
    durationSec: 71,
    bugIds: [],
    evidence: 'auto-report/TC-002-20260319.html',
  },
  {
    id: 'TC-003',
    moduleId: 'tm-create',
    planId: 'TP-01',
    title: '库存扣减失败触发补偿回滚，订单不落库且 outbox 不投递',
    reqId: 'REQ-2401',
    taskId: 'TASK-2403',
    apiId: 'API-01',
    priority: 'P0',
    type: '功能',
    auto: true,
    authorId: 'u-he',
    preconditions: '注入库存服务超时故障（Chaos：delay 3500ms > 事务超时 3000ms）',
    steps: [
      'POST /api/v2/orders 下单 1 件',
      '观察事务边界日志与 InventoryDeductService 调用',
      '检查 order 表、outbox 表、RabbitMQ order.created 队列',
      '检查用户可用优惠券是否被误核销',
    ],
    expected: [
      '事务整体回滚，order 表无记录',
      'outbox 表无待投递记录，MQ 无 order.created 消息',
      '优惠券未核销，库存已释放',
      '返回 503 与错误码 ORD-50301',
    ],
    actual:
      'order 表出现状态为 CREATING 的残留行，outbox 已写入 1 条并被投递，优惠券被核销未回滚；接口 30s 后超时',
    status: 'failed',
    lastRunAt: '2026-03-19 14:06',
    durationSec: 38,
    bugIds: ['BUG-1045'],
    evidence: 'auto-report/TC-003-20260319.html · trace 8f21c0ab7e44',
  },
  {
    id: 'TC-004',
    moduleId: 'tm-create',
    planId: 'TP-01',
    title: '200 并发同键下单，订单数恒为 1',
    reqId: 'REQ-2401',
    taskId: 'TASK-2401',
    apiId: 'API-01',
    priority: 'P0',
    type: '性能',
    auto: true,
    authorId: 'u-meng',
    preconditions: 'JMeter 200 线程 / ramp-up 5s，共享同一 Idempotency-Key',
    steps: ['并发发起 200 次 POST /api/v2/orders', '统计 2xx 数量与 distinct orderId', '检查 Redis SETNX 竞争日志'],
    expected: ['distinct orderId = 1', 'order 表 1 行', '无死锁、无连接池耗尽'],
    actual: 'distinct orderId = 1，200 次全部 2xx，无死锁，连接池峰值 62/200',
    status: 'passed',
    lastRunAt: '2026-03-18 16:44',
    durationSec: 26,
    bugIds: [],
    evidence: 'jmeter-report-0318.html#TC-004',
  },
  {
    id: 'TC-005',
    moduleId: 'tm-state',
    planId: 'TP-01',
    title: '待支付 → 已取消 合法流转并写入状态流水',
    reqId: 'REQ-2402',
    taskId: 'TASK-2406',
    apiId: 'API-05',
    priority: 'P0',
    type: '接口',
    auto: true,
    authorId: 'u-ai-copilot',
    preconditions: '存在一笔 PENDING_PAYMENT 订单',
    steps: [
      'POST /api/v2/orders/{id}/state，targetState = CANCELLED，reason = 用户主动取消',
      '查询订单状态',
      'GET /api/v2/orders/{id}/state-logs 查询流水（API-06）',
    ],
    expected: [
      '返回 200，订单状态为 CANCELLED',
      '流水新增 1 条：fromState=PENDING_PAYMENT、toState=CANCELLED、operator、reason、occurredAt 齐全',
      '发出 order.cancelled 领域事件',
    ],
    actual: '状态、流水、事件三项均符合预期',
    status: 'passed',
    lastRunAt: '2026-03-19 10:32',
    durationSec: 3,
    bugIds: [],
    evidence: 'auto-report/TC-005-20260319.html',
  },
  {
    id: 'TC-006',
    moduleId: 'tm-state',
    planId: 'TP-01',
    title: '已发货 → 待支付 非法流转被状态机拦截',
    reqId: 'REQ-2402',
    taskId: 'TASK-2406',
    apiId: 'API-05',
    priority: 'P0',
    type: '接口',
    auto: true,
    authorId: 'u-ai-copilot',
    preconditions: '存在一笔 SHIPPED 订单',
    steps: ['POST /api/v2/orders/{id}/state，targetState = PENDING_PAYMENT', '检查返回码、状态与流水'],
    expected: [
      '返回 409 与错误码 ORD-40901，message 说明合法后继状态集合',
      '订单状态保持 SHIPPED 不变',
      '不产生状态流水，仅记录一条拦截审计日志',
    ],
    actual: '返回 409 / ORD-40901，合法后继集合正确，状态未变，拦截审计已落库',
    status: 'passed',
    lastRunAt: '2026-03-19 10:34',
    durationSec: 2,
    bugIds: [],
    evidence: 'auto-report/TC-006-20260319.html',
  },
  {
    id: 'TC-007',
    moduleId: 'tm-state',
    planId: 'TP-01',
    title: '并发取消同一订单，状态流水仅一条',
    reqId: 'REQ-2402',
    taskId: 'TASK-2406',
    apiId: 'API-06',
    priority: 'P0',
    type: '功能',
    auto: true,
    authorId: 'u-he',
    preconditions: '存在一笔 PENDING_PAYMENT 订单；50 线程并发',
    steps: [
      '50 个线程同时 POST 取消同一订单',
      '统计 2xx 与 409 数量',
      '查询 order_state_log 中该订单 CANCELLED 记录条数',
    ],
    expected: ['1 次成功、49 次 409', 'order_state_log 中 toState=CANCELLED 记录恰好 1 条'],
    actual: '3 次返回 200，流水出现 3 条 CANCELLED 记录，下游订阅方收到 3 次 order.cancelled',
    status: 'failed',
    lastRunAt: '2026-03-19 15:02',
    durationSec: 12,
    bugIds: ['BUG-1046'],
    evidence: 'auto-report/TC-007-20260319.html · 重复流水 id 90231/90232/90235',
  },
  {
    id: 'TC-008',
    moduleId: 'tm-state',
    planId: 'TP-01',
    title: '流转规则热更新 5 秒内全实例生效',
    reqId: 'REQ-2402',
    taskId: 'TASK-2407',
    apiId: 'API-05',
    priority: 'P1',
    type: '功能',
    auto: false,
    authorId: 'u-he',
    preconditions: '需要 TASK-2407 的规则热更新能力（当前 dev 35%）',
    steps: ['修改流转规则配置并发布', '5 秒内对 4 个实例分别发起新规则下的流转请求', '核对生效时间'],
    expected: ['4 个实例均在 5 秒内按新规则放行/拦截', '配置版本号在响应头 X-Rule-Ver 中一致'],
    actual: '未执行：被测能力尚未实现，TASK-2407 仍在方案设计阶段（架构 Agent 输出两套方案待人工确认）',
    status: 'blocked',
    lastRunAt: '—',
    durationSec: 0,
    bugIds: [],
    evidence: '依赖 TASK-2407 · 阻塞登记于 TP-01 blockers',
  },
  {
    id: 'TC-009',
    moduleId: 'tm-consist',
    planId: 'TP-01',
    title: 'MQ 中断 10 分钟恢复后消息顺序正确',
    reqId: 'REQ-2406',
    taskId: 'TASK-2417',
    apiId: 'API-09',
    priority: 'P0',
    type: '混沌',
    auto: true,
    authorId: 'u-shen',
    preconditions: 'RabbitMQ 镜像队列；同一订单产生 created → paid → shipped 三条事件',
    steps: [
      '发起下单并支付、发货，产生 3 条领域事件',
      '在 paid 事件投递前切断 MQ 网络 10 分钟',
      '恢复网络，等待 outbox 指数退避重试完成',
      '按聚合根 ID 校验下游消费顺序',
    ],
    expected: ['下游按 created → paid → shipped 严格有序消费', '无重复、无丢失', '重试次数 ≤ 6'],
    actual:
      '恢复后 outbox 并发重试，下游收到 paid → created → shipped，履约域因 created 晚到触发一次状态回退告警',
    status: 'failed',
    lastRunAt: '2026-03-18 20:11',
    durationSec: 642,
    bugIds: ['BUG-1049'],
    evidence: 'chaos-report-0318/TC-009 · MQ 消费位点快照',
  },
  {
    id: 'TC-010',
    moduleId: 'tm-promo',
    planId: 'TP-02',
    title: '券 + 满减 + 会员价三重叠加，128 组边界分摊尾差为 0',
    reqId: 'REQ-2403',
    taskId: 'TASK-2410',
    apiId: 'API-08',
    priority: 'P0',
    type: '功能',
    auto: true,
    authorId: 'u-he',
    preconditions: 'MR-2410 已部署至测试环境；构造 128 组金额边界数据（含 0.01、x.33、x.67）',
    steps: [
      '逐组调用优惠核销 API-08',
      '校验各优惠分摊金额之和是否等于总优惠额',
      '校验最大余额法尾差归属行',
    ],
    expected: ['128 组分摊之和 = 总优惠额，尾差恒为 0', '尾差归入金额最大行且可解释'],
    actual: '23 组出现 0.01 元尾差，分摊之和比总优惠额少 0.01；集中在除不尽的 3 等分场景',
    status: 'failed',
    lastRunAt: '2026-03-19 11:05',
    durationSec: 88,
    bugIds: ['BUG-1043'],
    evidence: 'docs/bug/BUG-1043-analysis.md · 128 组明细 CSV',
  },
  {
    id: 'TC-011',
    moduleId: 'tm-promo',
    planId: 'TP-02',
    title: '试算 API-07 与下单 API-01 金额逐分一致（1000 组随机）',
    reqId: 'REQ-2403',
    taskId: 'TASK-2411',
    apiId: 'API-07',
    priority: 'P0',
    type: '接口',
    auto: true,
    authorId: 'u-he',
    preconditions: '试算与下单共用同一规则版本（ruleVer 一致）',
    steps: [
      '随机生成 1000 组购物车 + 优惠组合',
      '先调 API-07 试算，再调 API-01 下单',
      '逐分比对 payAmount、discountAmount、各优惠分摊明细',
    ],
    expected: ['1000 组一致率 100%', '不一致时下单必须拒绝并提示价格变更'],
    actual: '994 组一致，6 组 payAmount 相差 0.01 元且下单未拦截（与 TC-010 同根因）',
    status: 'failed',
    lastRunAt: '2026-03-19 11:40',
    durationSec: 214,
    bugIds: ['BUG-1043'],
    evidence: 'auto-report/TC-011-diff-6.csv',
  },
  {
    id: 'TC-012',
    moduleId: 'tm-promo',
    planId: 'TP-02',
    title: '负向分摊（部分退款）金额守恒',
    reqId: 'REQ-2403',
    taskId: 'TASK-2410',
    apiId: 'API-08',
    priority: 'P0',
    type: '功能',
    auto: false,
    authorId: 'u-he',
    preconditions: '存在已支付且使用了三重叠加优惠的订单',
    steps: ['对其中 1 个商品行发起部分退款', '校验退款金额中优惠回退部分', '校验剩余行分摊是否重新守恒'],
    expected: ['退款金额 = 商品实付 + 对应优惠回退，总额守恒', '剩余行分摊之和 = 剩余总优惠'],
    actual: 'AI 首版实现遗漏负向分摊场景，退款金额多退 0.03 元；该场景由评审 Agent 在 MR-2410 标为 must-fix',
    status: 'failed',
    lastRunAt: '2026-03-19 15:48',
    durationSec: 46,
    bugIds: ['BUG-1043'],
    evidence: 'MR-2410 评审记录 must-fix #1',
  },
  {
    id: 'TC-013',
    moduleId: 'tm-perf',
    planId: 'TP-03',
    title: '订单列表 API-03 P95 ≤ 200ms @3000 TPS',
    reqId: 'REQ-2404',
    taskId: 'TASK-2413',
    apiId: 'API-03',
    priority: 'P0',
    type: '性能',
    auto: true,
    authorId: 'u-meng',
    preconditions: '预生产 4000 万订单数据；分片路由已启用；缓存预热完成',
    steps: [
      'JMeter 阶梯加压 500 → 3000 TPS，每档持续 5 分钟',
      '采集 API-03 P95 / P99 / 错误率',
      '采集慢 SQL Top10 与跨分片扫描次数',
    ],
    expected: ['3000 TPS 下 P95 ≤ 200ms、P99 < 300ms、错误率 < 0.1%'],
    actual:
      '2400 TPS 时 P95 = 342ms（超标 71%）、P99 = 618ms；慢 SQL Top1 为跨 8 分片的 count + 深分页 LIMIT 100000,20',
    status: 'failed',
    lastRunAt: '2026-03-18 19:30',
    durationSec: 1800,
    bugIds: ['BUG-1047'],
    evidence: 'jmeter-report-0318.html · 慢 SQL 快照 slowlog-0318.txt',
  },
  {
    id: 'TC-014',
    moduleId: 'tm-perf',
    planId: 'TP-03',
    title: '缓存命中率 ≥ 95% 且 binlog 失效后无脏读',
    reqId: 'REQ-2404',
    taskId: 'TASK-2412',
    apiId: 'API-04',
    priority: 'P1',
    type: '性能',
    auto: true,
    authorId: 'u-meng',
    preconditions: 'Redis 7 多级缓存（本地 Caffeine + 分布式）已开启',
    steps: [
      '持续读订单详情 5 分钟，统计命中率',
      '更新其中 200 笔订单状态，触发 binlog 失效',
      '立即再次读取这 200 笔，比对本地缓存与 DB',
    ],
    expected: ['命中率 ≥ 95%', '失效后 1 秒内读到最新值，脏读率 0'],
    actual: '命中率 96.4% 达标；但 200 笔中 7 笔在 3 秒内仍读到旧状态（本地缓存未被广播失效）',
    status: 'failed',
    lastRunAt: '2026-03-18 20:55',
    durationSec: 420,
    bugIds: ['BUG-1048'],
    evidence: 'cache-dirty-read-0318.log · 7 笔订单号清单',
  },
  {
    id: 'TC-015',
    moduleId: 'tm-perf',
    planId: 'TP-03',
    title: '30 分钟长稳压测内存无泄漏',
    reqId: 'REQ-2404',
    taskId: 'TASK-2412',
    apiId: 'API-03',
    priority: 'P1',
    type: '性能',
    auto: true,
    authorId: 'u-meng',
    preconditions: '2000 TPS 恒定压力；开启 JFR 与堆采样',
    steps: ['持续压测 30 分钟，每 5 分钟采集一次堆快照', '比对老年代占用趋势', '触发一次 Full GC 观察回收量'],
    expected: ['老年代占用趋于平稳，Full GC 后可回收 ≥ 80%'],
    actual: '老年代从 1.2GB 线性增长至 3.4GB，Full GC 后仅回收 22%，疑似缓存对象持有未释放',
    status: 'failed',
    lastRunAt: '2026-03-18 22:40',
    durationSec: 1800,
    bugIds: ['BUG-1053'],
    evidence: 'jfr-0318-2240.jfr · 堆直方图 Top20',
  },
  {
    id: 'TC-016',
    moduleId: 'tm-sec',
    planId: 'TP-04',
    title: '订单导出 API-13 触发二次授权并写审计留痕',
    reqId: 'REQ-2408',
    taskId: 'TASK-2424',
    apiId: 'API-13',
    priority: 'P0',
    type: '安全',
    auto: false,
    authorId: 'u-he',
    preconditions: '使用客服角色账号登录，具备导出菜单权限',
    steps: [
      '调用 GET /api/v2/orders/export?range=30d&limit=5000',
      '观察是否要求二次授权（短信/飞书审批）',
      '导出成功后查询审计日志表 audit_export_log',
    ],
    expected: ['必须先通过二次授权才返回文件', 'audit_export_log 记录操作人、时间、范围、行数、下载 IP'],
    actual: '接口直接返回 CSV 文件，未触发二次授权；audit_export_log 无任何记录',
    status: 'failed',
    lastRunAt: '2026-03-19 09:20',
    durationSec: 25,
    bugIds: ['BUG-1052'],
    evidence: '抓包 export-0319.har · 审计表查询截图',
  },
  {
    id: 'TC-017',
    moduleId: 'tm-sec',
    planId: 'TP-04',
    title: '导出 CSV 中手机号/地址按 SEC-MASK-2.1 脱敏',
    reqId: 'REQ-2408',
    taskId: 'TASK-2423',
    apiId: 'API-13',
    priority: 'P0',
    type: '安全',
    auto: true,
    authorId: 'u-he',
    preconditions: '@SecMask 注解已标注在导出 DTO 上',
    steps: ['导出 100 行订单数据', '逐列扫描手机号、收货人、详细地址、身份证 4 类字段', '比对 SEC-MASK-2.1 规则'],
    expected: ['手机号 138****8000、地址保留省市、身份证保留前 6 后 4、收货人保留姓氏'],
    actual: '手机号与身份证已脱敏，但 addressDetail 列 100 行全部明文输出（脱敏规则未覆盖该字段名）',
    status: 'failed',
    lastRunAt: '2026-03-19 09:31',
    durationSec: 34,
    bugIds: ['BUG-1054'],
    evidence: 'export-sample-0319.csv（已按最小化原则仅保留 5 行样例）',
  },
  {
    id: 'TC-018',
    moduleId: 'tm-migrate',
    planId: 'TP-04',
    title: '1200 万历史订单双写比对零差异',
    reqId: 'REQ-2407',
    taskId: 'TASK-2420',
    apiId: 'API-11',
    priority: 'P0',
    type: '回归',
    auto: true,
    authorId: 'u-shen',
    preconditions: '双写开关开启；比对作业按订单号分片并行',
    steps: [
      '全量迁移 1200 万历史订单至新分片集群',
      '逐字段比对新旧库（含金额、状态、时间戳、扩展 JSON）',
      '输出差异清单并统计差异率',
    ],
    expected: ['差异率 = 0', '迁移耗时 ≤ 4 小时', '无主键冲突'],
    actual: '1200 万行比对完成，差异 0，耗时 3 小时 12 分，无主键冲突',
    status: 'passed',
    lastRunAt: '2026-03-17 03:12',
    durationSec: 11520,
    bugIds: [],
    evidence: 'migration-check-report-0317.xlsx',
  },
  {
    id: 'TC-019',
    moduleId: 'tm-consist',
    planId: 'TP-01',
    title: '死信并发回放不重复投递',
    reqId: 'REQ-2406',
    taskId: 'TASK-2418',
    apiId: 'API-10',
    priority: 'P1',
    type: '功能',
    auto: true,
    authorId: 'u-shen',
    preconditions: '死信队列积压 500 条；回放工具以 4 并发运行',
    steps: ['触发死信回放', '统计目标队列收到的消息数', '按 messageId 去重后比对'],
    expected: ['目标队列收到 500 条，去重后仍为 500', '无重复投递'],
    actual: '目标队列收到 517 条，17 条重复（并发回放未加分布式锁）',
    status: 'failed',
    lastRunAt: '2026-03-15 17:20',
    durationSec: 96,
    bugIds: ['BUG-1051'],
    evidence: 'dlq-replay-0315.log · 重复 messageId 清单',
  },
  {
    id: 'TC-020',
    moduleId: 'tm-state',
    planId: 'TP-01',
    title: 'CloudEvents 信封时区正确（回归 BUG-1050）',
    reqId: 'REQ-2406',
    taskId: 'TASK-2417',
    apiId: 'API-09',
    priority: 'P2',
    type: '回归',
    auto: true,
    authorId: 'u-shen',
    preconditions: 'PIPE-2405 构建产物已部署测试环境',
    steps: ['触发一次订单创建事件', '解析 CloudEvents time 字段', '与 DB occurredAt 比对'],
    expected: ['time 字段带 +08:00 偏移，与 DB 时间一致', '旧消费者解析不报错'],
    actual: 'time = 2026-03-15T09:58:12+08:00，与 DB 完全一致，旧消费者兼容通过',
    status: 'passed',
    lastRunAt: '2026-03-15 10:05',
    durationSec: 6,
    bugIds: [],
    evidence: '回归验证记录 → BUG-1050 关闭凭证',
  },
];

export const TEST_CASE_MAP: Record<string, TestCaseDef> = Object.fromEntries(
  TEST_CASES.map((c) => [c.id, c]),
);

/** 测试报告签发单 */
export interface TestReportDef {
  id: string;
  title: string;
  sprintId: string;
  reqIds: string[];
  planIds: string[];
  version: string;
  status: 'rejected' | 'draft' | 'signed';
  authorId: string;
  reviewerIds: string[];
  createdAt: string;
  gateId: string;
  gateResult: 'failed';
  caseTotal: number;
  caseExecuted: number;
  casePassed: number;
  caseFailed: number;
  caseBlocked: number;
  execRate: number;
  passRate: number;
  coverageIncremental: number;
  coverageBranch: number;
  coverageTarget: number;
  bugTotal: number;
  bugOpen: number;
  bugClosed: number;
  bugP0Open: number;
  bugP1Open: number;
  perf: {
    targetTps: number;
    actualTps: number;
    api01P95Ms: number;
    api03P95Ms: number;
    api03TargetMs: number;
    errorRate: number;
  };
  rounds: { round: number; window: string; executed: number; newBugs: number; closedBugs: number; note: string }[];
  conclusion: string;
  blockingItems: string[];
  risks: string[];
  suggestions: string[];
  attachments: string[];
  signOffs: { name: string; roleId: string; action: string; time: string; comment: string }[];
}

export const TEST_REPORT: TestReportDef = {
  id: 'TR-24',
  title: '订单中心重构 · Sprint 24 测试报告',
  sprintId: 'SP-24',
  reqIds: ['REQ-2401', 'REQ-2402', 'REQ-2403', 'REQ-2404', 'REQ-2405', 'REQ-2406', 'REQ-2407', 'REQ-2408'],
  planIds: ['TP-01', 'TP-02', 'TP-03', 'TP-04'],
  version: 'v0.9-draft',
  status: 'rejected',
  authorId: 'u-he',
  reviewerIds: ['u-lin', 'u-yan', 'u-gu'],
  createdAt: '2026-03-19 17:05',
  gateId: 'G4',
  gateResult: 'failed',
  caseTotal: 248,
  caseExecuted: 154,
  casePassed: 132,
  caseFailed: 17,
  caseBlocked: 5,
  execRate: 62.1,
  passRate: 85.7,
  coverageIncremental: 82.6,
  coverageBranch: 71.4,
  coverageTarget: 85,
  bugTotal: 12,
  bugOpen: 10,
  bugClosed: 2,
  bugP0Open: 4,
  bugP1Open: 3,
  perf: {
    targetTps: 3000,
    actualTps: 2400,
    api01P95Ms: 186,
    api03P95Ms: 342,
    api03TargetMs: 200,
    errorRate: 0.04,
  },
  rounds: [
    {
      round: 1,
      window: '2026-03-09 ~ 2026-03-12',
      executed: 68,
      newBugs: 3,
      closedBugs: 0,
      note: '首轮冒烟 + 主链路，暴露 BUG-1045 / BUG-1046 / BUG-1049；另有上迭代带入的 BUG-1043（02-27 发现）仍开放',
    },
    {
      round: 2,
      window: '2026-03-13 ~ 2026-03-16',
      executed: 44,
      newBugs: 3,
      closedBugs: 2,
      note: '金额专项 + 迁移比对；新发现 BUG-1055 / BUG-1050 / BUG-1051，其中 BUG-1050、BUG-1055 已关闭',
    },
    {
      round: 3,
      window: '2026-03-17 ~ 2026-03-19',
      executed: 42,
      newBugs: 5,
      closedBugs: 0,
      note: '性能压测与安全先导；BUG-1047 / BUG-1048 / BUG-1053 / BUG-1052 / BUG-1054 集中暴露，无一关闭',
    },
  ],
  conclusion:
    '本轮测试未达 G4 出口标准，报告不予签发。用例执行率 62.1%（154/248），距 100% 差 94 条；P0 未关闭 4 个、P1 未关闭 3 个；API-03 P95 342ms 超契约 71%，压测峰值 2,400 TPS 未达 3,000 目标。建议：优先修复 BUG-1043/1045/1046/1049 四个 P0，同步让测试 Agent 基于 BUG-1043 复现路径与 TASK-2403 补偿分支反向补齐 12 个异常回滚用例，以联动缓解 G3 覆盖率缺口。',
  blockingItems: [
    'G3 未通过：聚合分支覆盖率 71.4% < 85%（连续 3 次：PIPE-2407 / 2408 / 2409）',
    'BUG-1043 资损级未关闭，MR-2410 剩 1 条 must-fix（负向分摊）',
    'BUG-1045 与 G3 覆盖率缺口同源（InventoryDeductService#rollback 分支未实现）',
    'BUG-1047 使 API-03 P95 342ms，违反 REQ-2404 性能承诺',
    'BUG-1052 / BUG-1054 两项安全高危，直接影响 G6 合规观测项',
    '94 条用例未执行，其中安全合规模块 28 条待 TASK-2422~2424 开发完成',
  ],
  risks: [
    '若 03-20 22:00 发布窗口前 P0 未清零，REL-2403 将顺延至 Sprint 25，关键路径累计延误 5 天',
    'BUG-1053 内存泄漏未定位，长稳压测暂停，容量结论存在不确定性',
    '安全合规用例执行率仅 17.6%（6/34），存在漏测风险',
    'BLOCK-0312 阻塞迁移作业实例，生产切换演练无法开展',
  ],
  suggestions: [
    '测试 Agent 按 BUG-1043 复现路径 + TASK-2403 补偿分支反向生成 12 个异常回滚用例（预计 2 小时），人工复核后重跑 G3',
    '将 API-03 深分页改造（游标分页 + 分片聚合）拆为独立任务插入 Sprint 24 剩余产能',
    '安全合规模块前置：TASK-2423（导出脱敏）优先级提升至 P0，本周内启动',
    '压测暂停期间用预生产 1/3 数据做单接口基线，避免容量结论完全缺位',
  ],
  attachments: [
    'docs/test/TR-24-case-matrix.xlsx',
    'jmeter-report-0318.html',
    'docs/bug/BUG-1043-analysis.md',
    'migration-check-report-0317.xlsx',
    'export-sample-0319.csv',
  ],
  signOffs: [
    {
      name: '何斯年',
      roleId: 'tester',
      action: '提交',
      time: '2026-03-19 17:05',
      comment: '数据如实填写，G4 判定为不通过，建议先清 P0 再申请复测。',
    },
    {
      name: '林知远',
      roleId: 'manager',
      action: '驳回',
      time: '2026-03-19 17:38',
      comment: '不予签发。发布窗口不能靠放宽门禁换取，先补门禁、再谈窗口。',
    },
    {
      name: '严慕舟',
      roleId: 'architect',
      action: '待签',
      time: '—',
      comment: '等待 BUG-1045 事务边界方案复核结论。',
    },
    {
      name: '顾时衍',
      roleId: 'pmo',
      action: '待签',
      time: '—',
      comment: '需同步评估 REL-2403 顺延对 Sprint 25 的产能影响。',
    },
  ],
};

/* ==================================================================
 * 16. 缺陷域（Bug 流转）
 * ================================================================== */

/** 缺陷 AI 辅助信息 */
export interface BugAiAssist {
  agentId: string;
  modelId: string;
  confidence: number;
  seconds: number;
  summary: string;
  humanConfirmedBy: string;
  humanConfirmedAt: string;
}

/** 缺陷（12 个，与 TEST_REPORT.bugTotal 一致） */
export interface BugDef {
  id: string;
  pcCode: string;
  title: string;
  reqId: string;
  taskIds: string[];
  apiIds: string[];
  caseIds: string[];
  moduleId: string;
  planId: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  severity: string;
  category: '数据一致性' | '功能' | '性能' | '安全合规' | '兼容性' | '稳定性';
  status: 'new' | 'analyzing' | 'fixing' | 'verifying' | 'closed' | 'reopened';
  releaseBlocking: boolean;
  gateId: string;
  envId: string;
  reporterId: string;
  assigneeId: string;
  verifierId: string;
  foundAt: string;
  updatedAt: string;
  closedAt: string;
  slaHours: number;
  slaLeftHours: number;
  mrId: string;
  branch: string;
  pipelineId: string;
  phenomenon: string;
  impact: string;
  reproduceRate: string;
  rootCause: string;
  fixPlan: string;
  aiAssist: BugAiAssist;
  relatedIds: string[];
  tags: string[];
  tone: Tone;
}

export const BUGS: BugDef[] = [
  {
    id: 'BUG-1043',
    pcCode: 'BUG-1043',
    title: '券 + 满减 + 会员价三重叠加时分摊尾差 0.01 元，导致资损',
    reqId: 'REQ-2403',
    taskIds: ['TASK-2410', 'TASK-2411', 'TASK-2409'],
    apiIds: ['API-07', 'API-08'],
    caseIds: ['TC-010', 'TC-011', 'TC-012'],
    moduleId: 'tm-promo',
    planId: 'TP-02',
    priority: 'P0',
    severity: '资损级（致命）',
    category: '数据一致性',
    status: 'fixing',
    releaseBlocking: true,
    gateId: 'G4',
    envId: 'env-prod',
    reporterId: 'u-meng',
    assigneeId: 'u-zhou',
    verifierId: 'u-he',
    foundAt: '2026-02-27 23:05',
    updatedAt: '2026-03-19 16:08',
    closedAt: '',
    slaHours: 24,
    slaLeftHours: -451,
    mrId: 'MR-2410',
    branch: 'fix/promo-amount-precision',
    pipelineId: 'PIPE-2409',
    phenomenon:
      'REL-2402 灰度批次 2 观察期内，资损告警触发 3 次；订单优惠明细各分摊金额之和比总优惠额少 0.01 元，128 组边界数据中 23 组复现（除不尽的三等分场景）。',
    impact:
      '单笔差额 0.01 元，日订单量 42 万，理论日资损上限 4,200 元；财务对账连续 3 日出现「优惠分摊不平」，已升级为 REQ-2403 金额精度专项。',
    reproduceRate: '18%（23/128 组边界数据必现）',
    rootCause:
      '金额链路使用 double 做除法后 setScale(2, HALF_EVEN)，三等分场景产生无限小数被直接截断，未采用最大余额法把余数回填到某一行，导致分摊之和小于总额。',
    fixPlan:
      'MR-2410：全链路金额由 double 切换为 BigDecimal；AmountAllocator#allocate 改用最大余额法，余数归入金额最大行；补充负向分摊（退款）分支。当前剩 1 条 must-fix 未处理，是 G3 与 G4 双门禁的共同阻塞点。',
    aiAssist: {
      agentId: 'ag-review',
      modelId: 'mdl-claude',
      confidence: 94,
      seconds: 38,
      summary:
        '定位到 AmountAllocator#allocate 第 47 行 divide(3, 2, HALF_EVEN) 截断；给出最大余额法改写方案，并识别出 AI 首版遗漏 totalAmount < 0 的退款场景。',
      humanConfirmedBy: 'u-zhou',
      humanConfirmedAt: '2026-03-18 09:12',
    },
    relatedIds: ['REL-2402', 'REQ-2403', 'MR-2410', 'docs/bug/BUG-1043-analysis.md', 'PIPE-2409'],
    tags: ['资损级', 'BigDecimal', '金额精度', '跨迭代遗留'],
    tone: 'danger',
  },
  {
    id: 'BUG-1045',
    pcCode: 'BUG-1045',
    title: '下单超时导致事务半提交：订单残留 CREATING、优惠券误核销',
    reqId: 'REQ-2401',
    taskIds: ['TASK-2403', 'TASK-2405'],
    apiIds: ['API-01'],
    caseIds: ['TC-003'],
    moduleId: 'tm-create',
    planId: 'TP-01',
    priority: 'P0',
    severity: '致命',
    category: '数据一致性',
    status: 'analyzing',
    releaseBlocking: true,
    gateId: 'G3',
    envId: 'env-test',
    reporterId: 'u-he',
    assigneeId: 'u-zhou',
    verifierId: 'u-he',
    foundAt: '2026-03-10 14:22',
    updatedAt: '2026-03-19 17:26',
    closedAt: '',
    slaHours: 24,
    slaLeftHours: -219,
    mrId: '',
    branch: 'feat/order-tx-boundary',
    pipelineId: 'PIPE-2409',
    phenomenon:
      '注入库存服务 3500ms 超时后，接口 30s 才返回；order 表残留 CREATING 状态行，outbox 已写入并投递 order.created，优惠券被核销且未回滚。',
    impact:
      '脏订单会被下游履约域消费，产生无效发货单；优惠券误核销直接造成用户投诉与二次资损。该分支缺失同时是 G3 聚合覆盖率停在 71.4% 的主因之一。',
    reproduceRate: '100%（超时注入必现）',
    rootCause:
      'InventoryDeductService#rollback 补偿方法尚未实现，事务边界把「写订单 + 写 outbox + 核销优惠券」放在同一个本地事务，但库存 RPC 在事务内同步调用，超时后 Spring 只回滚了本地库操作，优惠券核销走的是独立 HTTP 调用未纳入补偿。',
    fixPlan:
      '收敛事务边界：库存扣减改为事务外 + TCC 补偿；补齐 InventoryDeductService#rollback；优惠券核销改为 outbox 投递后异步执行。补齐后由测试 Agent 反向生成 12 个异常回滚用例，可同时缓解 G3 覆盖率缺口。',
    aiAssist: {
      agentId: 'ag-code',
      modelId: 'mdl-deepseek',
      confidence: 76,
      seconds: 62,
      summary:
        '生成事务边界收敛方案草案（TCC 三段 + 补偿表），但补偿幂等键设计存在缺陷，被架构 Agent 标记需人工复核，尚未落码。',
      humanConfirmedBy: '',
      humanConfirmedAt: '',
    },
    relatedIds: ['G3', 'TASK-2403', 'TASK-2405', 'PIPE-2409', 'KB-ARCH-01'],
    tags: ['事务边界', 'TCC', 'G3 同源', '待人工确认'],
    tone: 'danger',
  },
  {
    id: 'BUG-1046',
    pcCode: 'BUG-1046',
    title: '并发取消同一订单产生重复状态流水，下游收到多次事件',
    reqId: 'REQ-2402',
    taskIds: ['TASK-2406', 'TASK-2408'],
    apiIds: ['API-05', 'API-06'],
    caseIds: ['TC-007'],
    moduleId: 'tm-state',
    planId: 'TP-01',
    priority: 'P0',
    severity: '严重',
    category: '功能',
    status: 'fixing',
    releaseBlocking: true,
    gateId: 'G4',
    envId: 'env-test',
    reporterId: 'u-he',
    assigneeId: 'u-zhou',
    verifierId: 'u-he',
    foundAt: '2026-03-11 10:40',
    updatedAt: '2026-03-19 11:02',
    closedAt: '',
    slaHours: 24,
    slaLeftHours: -198,
    mrId: 'MR-2406',
    branch: 'feat/order-statemachine',
    pipelineId: 'PIPE-2409',
    phenomenon:
      '50 线程并发取消同一订单，3 次返回 200，order_state_log 出现 3 条 CANCELLED 记录（id 90231/90232/90235），下游订阅方收到 3 次 order.cancelled。',
    impact: '履约域重复释放库存、财务域重复记账；状态审计流水不可信，违反 REQ-2402 的审计留痕验收标准。',
    reproduceRate: '92%（50 并发下）',
    rootCause:
      '状态机流转前的状态校验为「先查后改」，未使用乐观锁版本号或 SELECT ... FOR UPDATE，两个线程同时读到 PENDING_PAYMENT 后都判定流转合法。',
    fixPlan:
      'order 表增加 version 字段，流转 UPDATE 带 version 条件并校验影响行数；order_state_log 增加 (order_id, to_state, from_state) 唯一索引兜底；补 3 个并发用例。',
    aiAssist: {
      agentId: 'ag-review',
      modelId: 'mdl-claude',
      confidence: 89,
      seconds: 27,
      summary: '在 MR-2406 第 1 轮评审即指出 checkState 与 updateState 之间缺乏原子性保障，建议引入乐观锁；已采纳并落码。',
      humanConfirmedBy: 'u-yan',
      humanConfirmedAt: '2026-03-12 15:40',
    },
    relatedIds: ['MR-2406', 'TASK-2406', 'REQ-2402'],
    tags: ['并发', '乐观锁', '状态机', '审计流水'],
    tone: 'danger',
  },
  {
    id: 'BUG-1047',
    pcCode: 'BUG-1047',
    title: '订单列表跨分片深分页 P95 342ms，违反 200ms 契约',
    reqId: 'REQ-2404',
    taskIds: ['TASK-2413', 'TASK-2414'],
    apiIds: ['API-03'],
    caseIds: ['TC-013'],
    moduleId: 'tm-perf',
    planId: 'TP-03',
    priority: 'P1',
    severity: '严重',
    category: '性能',
    status: 'fixing',
    releaseBlocking: true,
    gateId: 'G4',
    envId: 'env-staging',
    reporterId: 'u-meng',
    assigneeId: 'u-zhou',
    verifierId: 'u-meng',
    foundAt: '2026-03-18 19:30',
    updatedAt: '2026-03-19 10:44',
    closedAt: '',
    slaHours: 72,
    slaLeftHours: 47,
    mrId: 'MR-2413',
    branch: 'feat/order-sharding',
    pipelineId: 'PIPE-2404',
    phenomenon:
      '2400 TPS 下 API-03 P95 = 342ms、P99 = 618ms；慢 SQL Top1 为跨 8 个分片的 count(*) + LIMIT 100000,20 深分页，单条执行 1.8s。',
    impact:
      'REQ-2404 承诺「订单列表秒开、P99 < 200ms」直接落空；G4 性能子项判定不通过；生产切流后 C 端订单页首屏将超过 1.2s。',
    reproduceRate: '100%（翻到第 500 页以后必现）',
    rootCause:
      '订单号基因分片只保证按用户维度单分片命中，但运营侧「按状态 + 时间范围」的查询无法带分片键，退化为全分片扫描 + 内存归并；深分页用 OFFSET 放大了扫描量。',
    fixPlan:
      '引入游标分页（lastId + lastCreatedAt）替代 OFFSET；为运营查询建 ES 二级索引，分片只回表取详情；count 改为近似值 + 异步精确回填。预计 P95 可降至 150ms 以内。',
    aiAssist: {
      agentId: 'ag-arch',
      modelId: 'mdl-claude',
      confidence: 88,
      seconds: 74,
      summary: '输出游标分页 + ES 二级索引两套方案对比，推荐方案 B（ES 索引），并给出与 KB-ARCH-01 分片规范的一致性校验清单。',
      humanConfirmedBy: 'u-yan',
      humanConfirmedAt: '2026-03-19 09:30',
    },
    relatedIds: ['MR-2413', 'TASK-2413', 'REQ-2404', 'env-staging'],
    tags: ['性能', '分片', '深分页', '契约违约'],
    tone: 'warn',
  },
  {
    id: 'BUG-1048',
    pcCode: 'BUG-1048',
    title: '多级缓存本地层未广播失效，binlog 更新后 3 秒内脏读',
    reqId: 'REQ-2404',
    taskIds: ['TASK-2412'],
    apiIds: ['API-04'],
    caseIds: ['TC-014'],
    moduleId: 'tm-perf',
    planId: 'TP-03',
    priority: 'P1',
    severity: '严重',
    category: '数据一致性',
    status: 'analyzing',
    releaseBlocking: true,
    gateId: 'G4',
    envId: 'env-test',
    reporterId: 'u-he',
    assigneeId: 'u-shen',
    verifierId: 'u-he',
    foundAt: '2026-03-18 20:55',
    updatedAt: '2026-03-19 09:18',
    closedAt: '',
    slaHours: 72,
    slaLeftHours: 36,
    mrId: 'MR-2412',
    branch: 'feat/order-multilevel-cache',
    pipelineId: '',
    phenomenon:
      '更新 200 笔订单状态触发 binlog 失效后，7 笔在 3 秒内仍读到旧状态；命中率 96.4% 达标但正确性不达标。env-test 已隔离 1 个 order-cache 副本用于排查。',
    impact:
      '用户在支付完成后刷新订单页仍看到「待支付」，客诉风险高；履约域若读到旧状态可能重复发货。',
    reproduceRate: '3.5%（200 笔中 7 笔）',
    rootCause:
      'binlog 监听只删除了 Redis 分布式缓存，本地 Caffeine 缓存依赖 TTL（5s）自然过期，未接入 Redis Pub/Sub 广播失效；多副本部署下各实例本地缓存不一致。',
    fixPlan:
      '接入 Redis Pub/Sub 做本地缓存广播失效，订阅延迟目标 < 200ms；本地缓存 TTL 从 5s 降到 1s 作为兜底；补 1 个多副本一致性用例。',
    aiAssist: {
      agentId: 'ag-code',
      modelId: 'mdl-qwen',
      confidence: 71,
      seconds: 45,
      summary: '给出 Pub/Sub 广播失效改造代码骨架，但未处理订阅断连期间的缓存补偿，需人工补充重连全量清空策略。',
      humanConfirmedBy: '',
      humanConfirmedAt: '',
    },
    relatedIds: ['MR-2412', 'TASK-2412', 'env-test'],
    tags: ['缓存一致性', 'Caffeine', 'binlog', '多副本'],
    tone: 'warn',
  },
  {
    id: 'BUG-1049',
    pcCode: 'BUG-1049',
    title: 'MQ 中断恢复后 outbox 并发重试导致事件乱序，下游状态回退',
    reqId: 'REQ-2406',
    taskIds: ['TASK-2417', 'TASK-2402'],
    apiIds: ['API-09'],
    caseIds: ['TC-009'],
    moduleId: 'tm-consist',
    planId: 'TP-01',
    priority: 'P0',
    severity: '严重',
    category: '数据一致性',
    status: 'fixing',
    releaseBlocking: true,
    gateId: 'G4',
    envId: 'env-test',
    reporterId: 'u-shen',
    assigneeId: 'u-shen',
    verifierId: 'u-he',
    foundAt: '2026-03-12 16:05',
    updatedAt: '2026-03-19 14:50',
    closedAt: '',
    slaHours: 24,
    slaLeftHours: -167,
    mrId: 'MR-2417',
    branch: 'feat/cloudevents-envelope',
    pipelineId: 'PIPE-2405',
    phenomenon:
      '混沌注入切断 MQ 10 分钟后恢复，下游收到顺序为 paid → created → shipped；履约域因 created 晚到触发一次状态回退告警。',
    impact:
      '12 个下游系统在新旧双发兼容期内均可能收到乱序事件；状态回退会造成发货单被误关闭，属于跨域数据污染。',
    reproduceRate: '78%（MQ 中断 ≥ 5 分钟场景）',
    rootCause:
      'outbox 中继的指数退避重试是多线程并发拉取，未保证同一聚合根的消息串行；CloudEvents 信封虽带了 sequence 字段，但中继投递时未按聚合根分区。',
    fixPlan:
      '中继按 aggregateId 哈希到固定线程（同一聚合根串行投递）；消费端增加 sequence 单调校验，乱序消息进死信并重放；补 2 个混沌用例。',
    aiAssist: {
      agentId: 'ag-test',
      modelId: 'mdl-deepseek',
      confidence: 83,
      seconds: 51,
      summary: '自动生成 MQ 中断/网络分区/消费端重启 3 类混沌用例脚本，其中中断 10 分钟场景首次复现乱序。',
      humanConfirmedBy: 'u-he',
      humanConfirmedAt: '2026-03-13 09:05',
    },
    relatedIds: ['MR-2417', 'TASK-2417', 'REQ-2406', 'TASK-2402'],
    tags: ['消息乱序', '混沌工程', 'CloudEvents', '跨域影响'],
    tone: 'danger',
  },
  {
    id: 'BUG-1050',
    pcCode: 'BUG-1050',
    title: 'CloudEvents 信封 time 字段缺失时区偏移，旧消费者时间差 8 小时',
    reqId: 'REQ-2406',
    taskIds: ['TASK-2417'],
    apiIds: ['API-09'],
    caseIds: ['TC-020'],
    moduleId: 'tm-consist',
    planId: 'TP-01',
    priority: 'P2',
    severity: '一般',
    category: '兼容性',
    status: 'closed',
    releaseBlocking: false,
    gateId: 'G4',
    envId: 'env-test',
    reporterId: 'u-shen',
    assigneeId: 'u-shen',
    verifierId: 'u-he',
    foundAt: '2026-03-14 11:20',
    updatedAt: '2026-03-15 10:05',
    closedAt: '2026-03-15 10:05',
    slaHours: 120,
    slaLeftHours: 97,
    mrId: 'MR-2417',
    branch: 'feat/cloudevents-envelope',
    pipelineId: 'PIPE-2405',
    phenomenon: '事件 time 字段输出为 2026-03-14T01:58:12（无偏移），旧消费者按 UTC 解析后展示为前一日 17:58，相差 8 小时。',
    impact: '12 个下游系统的时间字段展示错误，影响对账与运营报表口径，未造成资金影响。',
    reproduceRate: '100%',
    rootCause: '序列化时使用 LocalDateTime.toString() 而非 OffsetDateTime，丢失了 ZoneId 信息。',
    fixPlan: '改用 OffsetDateTime.now(ZoneId.of("Asia/Shanghai"))，并在契约测试中固化 +08:00 断言。已修复并回归通过。',
    aiAssist: {
      agentId: 'ag-review',
      modelId: 'mdl-qwen',
      confidence: 96,
      seconds: 12,
      summary: '在 MR-2417 静态扫描阶段即命中「时间类型未带时区」规则，一次性给出正确写法，人工直接采纳。',
      humanConfirmedBy: 'u-shen',
      humanConfirmedAt: '2026-03-14 14:02',
    },
    relatedIds: ['MR-2417', 'PIPE-2405', 'TC-020'],
    tags: ['时区', '兼容性', '已关闭', 'AI 一次命中'],
    tone: 'ok',
  },
  {
    id: 'BUG-1051',
    pcCode: 'BUG-1051',
    title: '死信回放工具并发回放导致 17 条消息重复投递',
    reqId: 'REQ-2406',
    taskIds: ['TASK-2418'],
    apiIds: ['API-10'],
    caseIds: ['TC-019'],
    moduleId: 'tm-consist',
    planId: 'TP-01',
    priority: 'P2',
    severity: '一般',
    category: '功能',
    status: 'verifying',
    releaseBlocking: false,
    gateId: 'G4',
    envId: 'env-test',
    reporterId: 'u-shen',
    assigneeId: 'u-shen',
    verifierId: 'u-he',
    foundAt: '2026-03-15 17:20',
    updatedAt: '2026-03-19 08:40',
    closedAt: '',
    slaHours: 120,
    slaLeftHours: 21,
    mrId: 'MR-2418',
    branch: 'feat/dlq-replay-tool',
    pipelineId: 'PIPE-2406',
    phenomenon: '死信队列 500 条以 4 并发回放后，目标队列收到 517 条，17 条 messageId 重复。',
    impact: '仅影响运维工具，不进入生产链路；但重复投递会放大下游幂等压力，未关闭前禁止在生产使用并发回放。',
    reproduceRate: '100%（并发度 ≥ 2 必现）',
    rootCause: '回放任务领取死信消息时未加分布式锁，两个 worker 同时拿到同一批 offset 区间。',
    fixPlan: 'Redis SETNX 按 offset 区间加锁 + 回放前查 messageId 去重表；已在 MR-2418 提交修复，正在验证（TC-019 待重跑）。',
    aiAssist: {
      agentId: 'ag-review',
      modelId: 'mdl-local',
      confidence: 91,
      seconds: 19,
      summary: 'SonarQube 阻断 0 / 严重 1 即为本缺陷，评审 Agent 关联到 KB-OPS-01 的分布式锁规范并给出改法。',
      humanConfirmedBy: 'u-meng',
      humanConfirmedAt: '2026-03-16 09:22',
    },
    relatedIds: ['MR-2418', 'PIPE-2406', 'KB-OPS-01'],
    tags: ['死信回放', '分布式锁', '验证中', '内网模型'],
    tone: 'info',
  },
  {
    id: 'BUG-1052',
    pcCode: 'BUG-1052',
    title: '订单导出接口未触发二次授权且无审计留痕（合规高危）',
    reqId: 'REQ-2408',
    taskIds: ['TASK-2424'],
    apiIds: ['API-13'],
    caseIds: ['TC-016'],
    moduleId: 'tm-sec',
    planId: 'TP-04',
    priority: 'P2',
    severity: '高危（合规）',
    category: '安全合规',
    status: 'new',
    releaseBlocking: false,
    gateId: 'G6',
    envId: 'env-test',
    reporterId: 'u-he',
    assigneeId: 'u-zhou',
    verifierId: 'u-he',
    foundAt: '2026-03-19 09:20',
    updatedAt: '2026-03-19 09:20',
    closedAt: '',
    slaHours: 168,
    slaLeftHours: 161,
    mrId: '',
    branch: 'feat/order-audit-alert',
    pipelineId: '',
    phenomenon: '客服角色调用 GET /api/v2/orders/export 直接返回 CSV，未要求二次授权；audit_export_log 表无任何记录。',
    impact:
      '违反 REQ-2408 与《个人信息保护法》数据导出最小化要求；G6 合规观测项判定不通过（非阻断门禁，但会被安全部门一票否决）。',
    reproduceRate: '100%',
    rootCause: 'TASK-2424（导出审计与告警）仍为 backlog 态未启动开发，导出接口沿用旧实现，缺少审计切面与二次授权拦截器。',
    fixPlan:
      '启动 TASK-2424：新增 @AuditExport 切面写 audit_export_log（操作人、时间、范围、行数、下载 IP、审批单号）；导出量 > 1000 行强制飞书审批二次授权；异常导出行为触发告警。',
    aiAssist: {
      agentId: 'ag-ba',
      modelId: 'mdl-local',
      confidence: 82,
      seconds: 33,
      summary: '比对 KB-SEC-02 合规清单，识别出 3 项缺失（二次授权、留痕字段、异常告警），并生成 TASK-2424 的验收标准草案。',
      humanConfirmedBy: 'u-he',
      humanConfirmedAt: '2026-03-19 10:02',
    },
    relatedIds: ['TASK-2424', 'API-13', 'G6', 'KB-SEC-02'],
    tags: ['合规', '审计留痕', '未开发', '内网模型'],
    tone: 'danger',
  },
  {
    id: 'BUG-1053',
    pcCode: 'BUG-1053',
    title: '长稳压测 30 分钟老年代线性增长，Full GC 仅回收 22%',
    reqId: 'REQ-2404',
    taskIds: ['TASK-2412'],
    apiIds: ['API-03'],
    caseIds: ['TC-015'],
    moduleId: 'tm-perf',
    planId: 'TP-03',
    priority: 'P1',
    severity: '严重',
    category: '稳定性',
    status: 'analyzing',
    releaseBlocking: true,
    gateId: 'G4',
    envId: 'env-staging',
    reporterId: 'u-meng',
    assigneeId: 'u-zhou',
    verifierId: 'u-meng',
    foundAt: '2026-03-18 22:40',
    updatedAt: '2026-03-19 15:30',
    closedAt: '',
    slaHours: 72,
    slaLeftHours: 44,
    mrId: 'MR-2412',
    branch: 'feat/order-multilevel-cache',
    pipelineId: '',
    phenomenon:
      '2000 TPS 恒定压力下，老年代从 1.2GB 线性增长至 3.4GB；Full GC 后仅回收 22%；JFR 显示 Caffeine 本地缓存条目数持续上涨未按 maximumSize 淘汰。',
    impact: '生产切流后约 2 小时将触发 OOM，属于发布阻断项；TP-03 压测已暂停，容量结论缺位。',
    reproduceRate: '100%（≥ 20 分钟长稳必现）',
    rootCause:
      '初步判断：本地缓存 key 中拼入了带时间戳的查询条件，导致 key 基数无界，maximumSize 配置被 weakValues 策略绕过；尚未 100% 确认，待堆转储二次分析。',
    fixPlan:
      '固定缓存 key 组成（去掉时间戳维度）；显式配置 maximumSize(50_000) + expireAfterWrite(1s)；补 1 个 30 分钟长稳自动化用例纳入回归。',
    aiAssist: {
      agentId: 'ag-ops',
      modelId: 'mdl-gpt5',
      confidence: 64,
      seconds: 96,
      summary:
        '基于 JFR 堆直方图 Top20 给出 3 个可疑点排序，首位命中缓存 key 基数问题；因证据链不完整，置信度仅 64%，标记为「需人工验证」。',
      humanConfirmedBy: '',
      humanConfirmedAt: '',
    },
    relatedIds: ['MR-2412', 'TASK-2412', 'env-staging', 'TP-03'],
    tags: ['内存泄漏', 'JFR', '压测暂停', '待定位'],
    tone: 'warn',
  },
  {
    id: 'BUG-1054',
    pcCode: 'BUG-1054',
    title: '导出 CSV 中 addressDetail 字段脱敏漏网，明文输出收货地址',
    reqId: 'REQ-2408',
    taskIds: ['TASK-2423'],
    apiIds: ['API-13'],
    caseIds: ['TC-017'],
    moduleId: 'tm-sec',
    planId: 'TP-04',
    priority: 'P2',
    severity: '高危（数据安全）',
    category: '安全合规',
    status: 'fixing',
    releaseBlocking: false,
    gateId: 'G6',
    envId: 'env-test',
    reporterId: 'u-he',
    assigneeId: 'u-chen',
    verifierId: 'u-he',
    foundAt: '2026-03-19 09:31',
    updatedAt: '2026-03-19 14:12',
    closedAt: '',
    slaHours: 168,
    slaLeftHours: 155,
    mrId: '',
    branch: 'feat/order-mask-export',
    pipelineId: '',
    phenomenon: '导出 100 行订单，手机号与身份证已按规则脱敏，但 addressDetail 列 100 行全部明文输出。',
    impact: '收货地址属个人敏感信息，明文导出违反 SEC-MASK-2.1；已按最小化原则仅保留 5 行样例作为证据，样本文件已加密归档。',
    reproduceRate: '100%',
    rootCause:
      'SEC-MASK-2.1 脱敏规则集按字段名白名单匹配，规则里写的是 address，而导出 DTO 字段名为 addressDetail，未命中；@SecMask 注解也未显式标注该字段。',
    fixPlan:
      '规则集改为「白名单 + 语义识别」双通道，新增 addressDetail / receiverAddress 等 6 个别名；导出 DTO 全字段补 @SecMask；上线前用 1000 行样本做全列扫描回归。',
    aiAssist: {
      agentId: 'ag-ba',
      modelId: 'mdl-local',
      confidence: 90,
      seconds: 28,
      summary: '扫描导出 DTO 全部 34 个字段，识别出 6 个疑似敏感字段未命中脱敏规则，其中 addressDetail 已由测试用例证实。',
      humanConfirmedBy: 'u-he',
      humanConfirmedAt: '2026-03-19 10:15',
    },
    relatedIds: ['TASK-2423', 'API-13', 'SEC-MASK-2.1', 'KB-SEC-02', 'G6'],
    tags: ['脱敏', '@SecMask', 'SEC-MASK-2.1', '内网模型'],
    tone: 'danger',
  },
  {
    id: 'BUG-1055',
    pcCode: 'BUG-1055',
    title: '同步写状态流水使状态流转接口 P95 升至 380ms',
    reqId: 'REQ-2402',
    taskIds: ['TASK-2406', 'TASK-2408'],
    apiIds: ['API-05', 'API-06'],
    caseIds: [],
    moduleId: 'tm-state',
    planId: 'TP-01',
    priority: 'P3',
    severity: '轻微',
    category: '性能',
    status: 'closed',
    releaseBlocking: false,
    gateId: 'G4',
    envId: 'env-dev',
    reporterId: 'u-meng',
    assigneeId: 'u-zhou',
    verifierId: 'u-meng',
    foundAt: '2026-03-13 15:10',
    updatedAt: '2026-03-16 11:25',
    closedAt: '2026-03-16 11:25',
    slaHours: 168,
    slaLeftHours: 96,
    mrId: 'MR-2406',
    branch: 'feat/order-state-log',
    pipelineId: '',
    phenomenon: '状态流转接口 P95 从 96ms 升至 380ms，火焰图显示 order_state_log 同步 INSERT 占比 68%。',
    impact: '仅影响开发环境体验与压测基线，未进入生产；若带上线将拉低 API-05 的 SLA 余量。',
    reproduceRate: '100%',
    rootCause: '审计流水在主事务内同步写入，且 order_state_log 表缺少 (order_id, occurred_at) 联合索引，写入触发页分裂。',
    fixPlan:
      '改为异步批量写入（Disruptor 队列 + 500ms 批量刷盘），补建联合索引，主事务只保留内存态；改造后 P95 回落至 104ms，已关闭。',
    aiAssist: {
      agentId: 'ag-code',
      modelId: 'mdl-deepseek',
      confidence: 93,
      seconds: 41,
      summary: '给出异步批量写入改造代码与索引 DDL，并提示需保证进程崩溃时的流水补偿（已采纳：本地磁盘 WAL 兜底）。',
      humanConfirmedBy: 'u-zhou',
      humanConfirmedAt: '2026-03-14 10:08',
    },
    relatedIds: ['MR-2406', 'TASK-2406', 'REQ-2402'],
    tags: ['性能', '异步写入', '已关闭'],
    tone: 'ok',
  },
];

export const BUG_MAP: Record<string, BugDef> = Object.fromEntries(BUGS.map((b) => [b.id, b]));

/** 缺陷看板统计（与 TEST_REPORT 口径一致） */
export const BUG_STATS = {
  total: 12,
  open: 10,
  closed: 2,
  byPriority: {
    P0: { total: 4, open: 4 },
    P1: { total: 3, open: 3 },
    P2: { total: 4, open: 3 },
    P3: { total: 1, open: 0 },
  },
  byStatus: {
    new: 1,
    analyzing: 3,
    fixing: 5,
    verifying: 1,
    closed: 2,
    reopened: 0,
  },
  byCategory: {
    数据一致性: 4,
    功能: 2,
    性能: 2,
    安全合规: 2,
    兼容性: 1,
    稳定性: 1,
  },
  byModule: {
    'tm-create': 1,
    'tm-state': 2,
    'tm-consist': 3,
    'tm-promo': 1,
    'tm-perf': 3,
    'tm-sec': 2,
    'tm-migrate': 0,
  },
  releaseBlocking: 7,
  slaBreached: 4,
  avgFixHours: 41.5,
  aiFirstHitRate: 66.7,
  note: 'P0 未关闭 4（BUG-1043/1045/1046/1049）、P1 未关闭 3（BUG-1047/1048/1053），与 G4 门禁 actual 完全一致。',
};

/* ==================================================================
 * 17. 缺陷根因分析（Bug 流转 · 深度分析）
 * ================================================================== */

/** 五问法（5-Why）单步 */
export interface BugWhyStep {
  level: number;
  question: string;
  answer: string;
  evidence: string;
}

/** 发生链路单步（用于时间轴定位缺陷是如何被引入并放大的） */
export interface BugOccurStep {
  seq: number;
  at: string;
  where: string;
  what: string;
  tone: Tone;
}

/** 修复方案候选 */
export interface BugFixOption {
  id: string;
  name: string;
  desc: string;
  effortHours: number;
  riskLevel: '低' | '中' | '高';
  /** 采纳后对 G3 聚合分支覆盖率的预计增益（百分点） */
  coverageGain: number;
  recommended: boolean;
  tone: Tone;
}

/** 影响面维度 */
export interface BugImpactDim {
  dim: string;
  value: string;
  tone: Tone;
}

/** 预防动作（流程 / 知识库 / 门禁） */
export interface BugPrevention {
  type: '流程' | '知识库' | '门禁' | '用例' | '监控';
  action: string;
  ownerId: string;
  dueDate: string;
  kbId: string;
}

/** 缺陷根因分析报告 */
export interface BugAnalysisDef {
  id: string;
  bugId: string;
  title: string;
  version: string;
  status: 'draft' | 'reviewing' | 'approved' | 'rejected';
  authorId: string;
  agentId: string;
  modelId: string;
  confidence: number;
  reviewerIds: string[];
  createdAt: string;
  updatedAt: string;
  docPath: string;
  envId: string;
  reproduceRate: string;
  reproduceSteps: string[];
  occurChain: BugOccurStep[];
  whys: BugWhyStep[];
  rootCauseSummary: string;
  codeLocation: string;
  codeLang: string;
  codeBefore: string[];
  codeAfter: string[];
  impactScope: BugImpactDim[];
  fixOptions: BugFixOption[];
  chosenOptionId: string;
  verificationPlan: string[];
  prevention: BugPrevention[];
  relatedIds: string[];
}

export const BUG_ANALYSIS: BugAnalysisDef[] = [
  {
    id: 'BA-1043',
    bugId: 'BUG-1043',
    title: 'BUG-1043 资损级根因分析 · 优惠分摊尾差（最大余额法缺失）',
    version: 'v1.3',
    status: 'approved',
    authorId: 'u-zhou',
    agentId: 'ag-review',
    modelId: 'mdl-claude',
    confidence: 94,
    reviewerIds: ['u-lin', 'u-he', 'u-meng'],
    createdAt: '2026-03-17 20:15',
    updatedAt: '2026-03-18 09:12',
    docPath: 'docs/bug/BUG-1043-analysis.md',
    envId: 'env-prod',
    reproduceRate: '18%（23/128 组边界数据必现）',
    reproduceSteps: [
      '构造订单：商品 3 件单价 33.33 元，总额 99.99 元',
      '叠加优惠：满 99 减 10（券）+ 会员价 95 折 + 平台立减 3 元，总优惠 16.50 元',
      '调用 API-07 /orders/preview 试算，返回 3 行明细',
      '对 3 行 promotionAmount 求和，与 header.totalDiscount 比对',
      '断言失败：明细求和 16.49，头部 16.50，尾差 0.01 元',
    ],
    occurChain: [
      {
        seq: 1,
        at: '2026-02-24 15:10',
        where: 'TASK-2409 · PromotionEngine 优惠计算下沉',
        what: 'AI 首版实现按行等比分摊，使用 double 除法后 setScale(2, HALF_EVEN)，未处理除不尽场景',
        tone: 'warn',
      },
      {
        seq: 2,
        at: '2026-02-25 11:40',
        where: 'MR-2409 · 代码评审',
        what: '评审仅关注接口契约与幂等，未对金额精度提出用例要求，AI 评审置信度 71% 放行',
        tone: 'warn',
      },
      {
        seq: 3,
        at: '2026-02-26 18:02',
        where: 'PIPE-2403 · G3 单测门禁',
        what: '金额分摊单测只覆盖整除场景（12 条），三等分等除不尽分支未被覆盖，门禁以 68.2% 通过率放行（当时阈值 65%）',
        tone: 'danger',
      },
      {
        seq: 4,
        at: '2026-02-27 21:30',
        where: 'REL-2402 · 灰度批次 2',
        what: '生产灰度 5% 流量进入，真实订单出现三重优惠叠加，尾差开始累积',
        tone: 'danger',
      },
      {
        seq: 5,
        at: '2026-02-27 23:05',
        where: '资损监控 · 财务对账',
        what: '告警触发 3 次，孟星回建单 BUG-1043，升级为资损级（致命）',
        tone: 'danger',
      },
    ],
    whys: [
      {
        level: 1,
        question: '为什么明细求和小于头部总优惠？',
        answer: '三行分摊金额分别为 5.50 / 5.50 / 5.49，求和 16.49，比 16.50 少 0.01 元',
        evidence: 'REL-2402 灰度日志 ord_20260227_88213 优惠明细快照',
      },
      {
        level: 2,
        question: '为什么会出现 5.50 / 5.50 / 5.49？',
        answer: '16.50 / 3 = 5.5 可整除，但会员价折扣先行计算产生 16.495，再三等分得到 5.4983…，setScale(2, HALF_EVEN) 各自独立舍入后余数丢失',
        evidence: 'AmountAllocator#allocate 第 47 行 divide(3, 2, HALF_EVEN)',
      },
      {
        level: 3,
        question: '为什么各自独立舍入会丢余数？',
        answer: '没有做「余数回填」——正确做法是最大余额法：先按比例取整到分，再把 totalAmount 减去已分配之和的差额，逐分补给余额最大的行',
        evidence: 'KB-CODE-02《金额计算规约》第 3.2 节，该规约未被纳入本次 AI 生成的提示词上下文',
      },
      {
        level: 4,
        question: '为什么 KB-CODE-02 没有进入 AI 上下文？',
        answer: 'RAG 检索关键词用的是「优惠 分摊」，知识库该条目标签为「金额 精度 BigDecimal」，向量召回未命中，检索 Agent 也未做同义词扩展',
        evidence: 'AGENT_TRACES 中 ag-code 于 02-24 15:02 的 RAG 检索记录，topK=5 未含 KB-CODE-02',
      },
      {
        level: 5,
        question: '为什么 G3 门禁没有拦住？',
        answer: '当时 G3 分支覆盖率阈值为 65%（Sprint 23 遗留配置），本次 68.2% 刚好通过；且金额链路的除不尽分支根本没有对应用例，覆盖率指标无法反映「缺用例」而非「缺代码」',
        evidence: 'GATES 中 G3 阈值变更记录：03-16 由 65% 上调至 85%，此后 PIPE-2407/2408/2409 连续 3 次失败',
      },
    ],
    rootCauseSummary:
      '直接原因：AmountAllocator#allocate 使用 double 除法 + 各行独立 HALF_EVEN 舍入，缺少最大余额法余数回填，除不尽场景产生 0.01 元尾差。根本原因（流程层）：金额计算规约 KB-CODE-02 未被 RAG 召回进入 AI 上下文，且 G3 覆盖率阈值过低（65%）无法暴露「缺异常/边界用例」这一类缺口。',
    codeLocation: 'order-promotion/src/main/java/com/artisan/order/promotion/AmountAllocator.java:41-63',
    codeLang: 'java',
    codeBefore: [
      'public List<BigDecimal> allocate(BigDecimal total, List<BigDecimal> weights) {',
      '    double sum = weights.stream().mapToDouble(BigDecimal::doubleValue).sum();',
      '    return weights.stream()',
      '        .map(w -> BigDecimal.valueOf(total.doubleValue() * w.doubleValue() / sum))',
      '        .map(v -> v.setScale(2, RoundingMode.HALF_EVEN))   // 各行独立舍入，余数丢失',
      '        .collect(Collectors.toList());',
      '}',
    ],
    codeAfter: [
      'public List<BigDecimal> allocate(BigDecimal total, List<BigDecimal> weights) {',
      '    BigDecimal sum = weights.stream().reduce(BigDecimal.ZERO, BigDecimal::add);',
      '    List<BigDecimal> base = new ArrayList<>(weights.size());',
      '    BigDecimal allocated = BigDecimal.ZERO;',
      '    for (BigDecimal w : weights) {',
      '        // 全程 BigDecimal，向下取整到分，先不给余数',
      '        BigDecimal part = total.multiply(w).divide(sum, 2, RoundingMode.DOWN);',
      '        base.add(part);',
      '        allocated = allocated.add(part);',
      '    }',
      '    // 最大余额法：把剩余的分逐分补给「余额最大」的行（含负向分摊）',
      '    BigDecimal remainder = total.subtract(allocated);',
      '    int cents = remainder.movePointRight(2).intValueExact();',
      '    int step = cents >= 0 ? 1 : -1;',
      '    List<Integer> order = sortByRemainderDesc(weights, sum, total);',
      '    for (int i = 0; i < Math.abs(cents); i++) {',
      '        int idx = order.get(i % order.size());',
      '        base.set(idx, base.get(idx).add(BigDecimal.valueOf(step, 2)));',
      '    }',
      '    return base;',
      '}',
    ],
    impactScope: [
      { dim: '资损金额', value: '单笔 0.01 元；日订单 42 万，理论日上限 4,200 元', tone: 'danger' },
      { dim: '影响时段', value: '2026-02-27 21:30 灰度起至今，累计 21 天', tone: 'danger' },
      { dim: '影响订单', value: '灰度 5% 流量中 23/128 组边界数据必现，估算受影响订单 1.8 万笔', tone: 'danger' },
      { dim: '财务对账', value: '连续 3 日「优惠分摊不平」，已挂账待冲销', tone: 'warn' },
      { dim: '关联需求', value: 'REQ-2403 优惠计算下沉（已升级为金额精度专项）', tone: 'warn' },
      { dim: '关联任务', value: 'TASK-2409 / TASK-2410 / TASK-2411，其中 TASK-2410 进度回退 25%', tone: 'warn' },
      { dim: '发布影响', value: 'REL-2403 阻塞（03-20 22:00 窗口），G4 门禁失败', tone: 'danger' },
      { dim: '数据修复', value: '需对灰度期 1.8 万笔订单做优惠明细重算 + 差额补记', tone: 'info' },
    ],
    fixOptions: [
      {
        id: 'OPT-1043-A',
        name: '最大余额法 + 全链路 BigDecimal（推荐）',
        desc: '按上文 codeAfter 改写 AmountAllocator，金额链路 double 全部替换为 BigDecimal，并补负向分摊（退款）分支与 12 条除不尽边界用例',
        effortHours: 16,
        riskLevel: '中',
        coverageGain: 6.8,
        recommended: true,
        tone: 'ok',
      },
      {
        id: 'OPT-1043-B',
        name: '尾差兜底：差额计入最后一行',
        desc: '保留现有等比逻辑，仅把 total - sum(parts) 的差额加到最后一行。改动最小，但违反最大余额法，明细金额与权重不成比例，财务口径仍会被质疑',
        effortHours: 3,
        riskLevel: '低',
        coverageGain: 1.2,
        recommended: false,
        tone: 'warn',
      },
      {
        id: 'OPT-1043-C',
        name: '分为单位长整型计算',
        desc: '金额统一转为 long（分）后做整数运算，彻底规避浮点。正确性最好，但涉及 API-07/API-08 契约字段类型变更，需上下游 6 个服务同步改造，工期超发布窗口',
        effortHours: 64,
        riskLevel: '高',
        coverageGain: 8.5,
        recommended: false,
        tone: 'danger',
      },
    ],
    chosenOptionId: 'OPT-1043-A',
    verificationPlan: [
      '单元测试：补齐 12 条除不尽边界用例（三等分 / 七等分 / 权重悬殊 / 总额为 0.01 / 负向退款），聚合分支覆盖率目标 +6.8pt',
      '不变式断言：所有分摊结果必须满足 sum(parts) == total，作为 @AmountInvariant 校验注解在 CI 强制执行',
      '回归：重跑 TP-02 金额边界专项 38 条用例（当前仅执行 24 条），要求 100% 通过',
      '数据比对：对灰度期 1.8 万笔订单做离线重算，输出差额清单交财务冲销',
      '灰度验证：修复版本先上 env-staging 压测 30 分钟，再进 REL-2403 批次 1（1% 流量）观察 2 小时',
    ],
    prevention: [
      {
        type: '知识库',
        action: 'KB-CODE-02《金额计算规约》补充同义词标签「优惠 / 分摊 / 尾差 / 除不尽」，并加入金额类任务的强制召回白名单',
        ownerId: 'u-gu',
        dueDate: '2026-03-21',
        kbId: 'KB-CODE-02',
      },
      {
        type: '门禁',
        action: 'G3 阈值维持 85%，并新增「金额类改动必须含除不尽边界用例」的规则门禁，缺失即阻断',
        ownerId: 'u-yan',
        dueDate: '2026-03-23',
        kbId: '',
      },
      {
        type: '用例',
        action: '测试 Agent 基于 BUG-1043 复现路径 + TASK-2403 补偿分支反向生成 12 个异常回滚用例',
        ownerId: 'u-he',
        dueDate: '2026-03-20',
        kbId: 'KB-TEST-03',
      },
      {
        type: '监控',
        action: '新增「优惠分摊不平」实时对账指标，阈值 0 笔，接入资损告警通道',
        ownerId: 'u-meng',
        dueDate: '2026-03-25',
        kbId: 'KB-OPS-01',
      },
      {
        type: '流程',
        action: 'AI 评审对涉及金额的 MR 强制降低自动放行阈值（置信度 < 90% 一律转人工）',
        ownerId: 'u-lin',
        dueDate: '2026-03-22',
        kbId: '',
      },
    ],
    relatedIds: [
      'BUG-1043',
      'REQ-2403',
      'TASK-2409',
      'TASK-2410',
      'TASK-2411',
      'MR-2410',
      'API-07',
      'API-08',
      'REL-2402',
      'REL-2403',
      'PIPE-2409',
      'KB-CODE-02',
      'TC-010',
      'TC-011',
      'TC-012',
    ],
  },
  {
    id: 'BA-1045',
    bugId: 'BUG-1045',
    title: 'BUG-1045 根因分析 · 库存扣减回滚分支未实现（与 G3 覆盖率缺口同源）',
    version: 'v0.8',
    status: 'reviewing',
    authorId: 'u-zhou',
    agentId: 'ag-code',
    modelId: 'mdl-deepseek',
    confidence: 78,
    reviewerIds: ['u-he', 'u-yan'],
    createdAt: '2026-03-19 16:40',
    updatedAt: '2026-03-19 17:26',
    docPath: 'docs/bug/BUG-1045-analysis.md',
    envId: 'env-test',
    reproduceRate: '100%（异常注入必现）',
    reproduceSteps: [
      '在 env-test 对 InventoryDeductService#deduct 注入 RPC 超时异常（Chaos 平台规则 CHAOS-RPC-TIMEOUT）',
      '调用 API-01 /orders 下单，本地消息表已写入 outbox 记录',
      '观察 order_item 的库存预占状态与 inventory 侧实际扣减结果',
      '断言失败：预占未释放，inventory 已扣减，出现「双扣」悬挂数据',
    ],
    occurChain: [
      {
        seq: 1,
        at: '2026-03-06 14:20',
        where: 'TASK-2403 · 事务边界与补偿',
        what: 'AI 生成了正向扣减链路，补偿分支 rollback 仅留 TODO 注释，会话 CS-2403 中标注「后续补齐」',
        tone: 'warn',
      },
      {
        seq: 2,
        at: '2026-03-08 09:15',
        where: 'MR-2403 · G3 门禁',
        what: '覆盖率 68.2% 恰好高于当时阈值 65%，rollback 分支未被任何用例触达',
        tone: 'warn',
      },
      {
        seq: 3,
        at: '2026-03-10 14:22',
        where: 'TP-01 · 异常注入用例 TC-003',
        what: '测试 Agent 注入 RPC 超时，发现库存双扣，何斯年建单 BUG-1045',
        tone: 'danger',
      },
      {
        seq: 4,
        at: '2026-03-16 10:00',
        where: 'G3 阈值上调至 85%',
        what: '同一分支缺口在 PIPE-2407/2408/2409 连续 3 次触发门禁失败，确认缺陷与门禁失败同源',
        tone: 'danger',
      },
    ],
    whys: [
      {
        level: 1,
        question: '为什么库存出现双扣？',
        answer: 'RPC 超时后本地事务回滚，但未调用 inventory 侧的释放接口，远端扣减结果残留',
        evidence: 'TC-003 执行日志与 inventory_deduct_log 表快照',
      },
      {
        level: 2,
        question: '为什么没有调用释放接口？',
        answer: 'InventoryDeductService#rollback 方法体只有 TODO 注释，从未实现',
        evidence: 'order-core/.../InventoryDeductService.java:88-96',
      },
      {
        level: 3,
        question: '为什么 AI 会留下 TODO 而评审没发现？',
        answer: 'AI 在长上下文中把补偿分支识别为「非主链路」，会话 CS-2403 结束时生成了 3 条待办但未回写到任务卡；评审 Agent 只检查了 diff 中的新增行，未检查「应有而缺失」的方法',
        evidence: 'CS-2403 会话尾部待办清单 + MR-2403 评审记录',
      },
      {
        level: 4,
        question: '为什么覆盖率门禁没暴露缺失？',
        answer: '分支覆盖率的分母只统计已存在代码的分支，缺失的方法不进入分母，指标天然无法反映「漏实现」',
        evidence: 'GATES · G3 指标定义说明',
      },
      {
        level: 5,
        question: '流程上应如何避免？',
        answer: '需引入「契约完整性检查」：按 API_CONTRACTS 与 TASK 验收标准反查必须存在的方法清单，缺失即阻断，而非依赖覆盖率',
        evidence: 'KB-ARCH-01《补偿事务设计规范》第 5 节',
      },
    ],
    rootCauseSummary:
      '直接原因：InventoryDeductService#rollback 补偿分支未实现（仅 TODO），RPC 超时后远端库存扣减无法释放。根本原因：AI 会话尾部待办未回写任务卡，评审 Agent 只审「新增行」不审「缺失项」，而分支覆盖率指标无法度量漏实现。该缺口同时是 G3 门禁连续 3 次失败的同源原因。',
    codeLocation: 'order-core/src/main/java/com/artisan/order/core/inventory/InventoryDeductService.java:88-96',
    codeLang: 'java',
    codeBefore: [
      'public void rollback(String orderId, List<DeductCmd> cmds) {',
      '    // TODO: 补偿释放库存，Sprint 24 内补齐',
      '    log.warn("rollback not implemented, orderId={}", orderId);',
      '}',
    ],
    codeAfter: [
      'public void rollback(String orderId, List<DeductCmd> cmds) {',
      '    ReleaseCmd release = ReleaseCmd.of(orderId, cmds);',
      '    // 幂等：以 orderId + skuId 为幂等键，重复调用返回首次结果',
      '    idempotentGuard.run("inv-release:" + orderId, () -> {',
      '        inventoryClient.release(release);          // 远端释放',
      '        outboxWriter.append(OrderEvent.INVENTORY_RELEASED, release);',
      '        return null;',
      '    });',
      '    metrics.counter("inventory.rollback", "orderId", orderId).increment();',
      '}',
    ],
    impactScope: [
      { dim: '数据一致性', value: 'env-test 累计 37 条库存悬挂记录，需人工冲销', tone: 'danger' },
      { dim: '门禁影响', value: 'G3 连续 3 次失败（PIPE-2407 / 2408 / 2409），阻塞全部下游任务合并', tone: 'danger' },
      { dim: '任务影响', value: 'TASK-2403 无法置为已完成，TASK-2404 / TASK-2405 依赖其产出', tone: 'warn' },
      { dim: '生产影响', value: '尚未上生产（env-prod 未部署该分支），无资损', tone: 'ok' },
      { dim: 'SLA', value: 'P0 修复时限 24h，已超时 219 小时', tone: 'danger' },
    ],
    fixOptions: [
      {
        id: 'OPT-1045-A',
        name: '实现 rollback + 幂等守卫 + outbox 事件（推荐）',
        desc: '按 codeAfter 实现，复用 TASK-2402 的本地消息表与幂等守卫；同步补 8 条异常注入用例，预计覆盖率 +9.2pt',
        effortHours: 10,
        riskLevel: '低',
        coverageGain: 9.2,
        recommended: true,
        tone: 'ok',
      },
      {
        id: 'OPT-1045-B',
        name: '定时对账补偿（不改主链路）',
        desc: '新增 5 分钟一轮的对账任务扫描悬挂记录并释放。可快速止血，但延迟窗口内仍会双扣，且不解决 G3 缺口',
        effortHours: 6,
        riskLevel: '中',
        coverageGain: 0,
        recommended: false,
        tone: 'warn',
      },
      {
        id: 'OPT-1045-C',
        name: '改为 TCC 两阶段',
        desc: 'Try-Confirm-Cancel 重构库存交互，正确性最强但需 inventory 服务同步改造，工期 5 天，超出发布窗口',
        effortHours: 40,
        riskLevel: '高',
        coverageGain: 12.0,
        recommended: false,
        tone: 'danger',
      },
    ],
    chosenOptionId: 'OPT-1045-A',
    verificationPlan: [
      'Chaos 注入 RPC 超时 / 5xx / 连接重置三类异常，断言库存无悬挂',
      '重复触发 rollback 3 次，验证幂等（inventory_release_log 只有 1 条）',
      '重跑 PIPE-2409 之后的新流水线，要求 G3 聚合分支覆盖率 ≥ 85%',
      '补跑 TC-003 及新增 8 条异常回滚用例，全部通过',
    ],
    prevention: [
      {
        type: '流程',
        action: 'AI 会话结束时的待办清单必须回写为任务卡子项，未回写不允许关闭会话',
        ownerId: 'u-lin',
        dueDate: '2026-03-22',
        kbId: '',
      },
      {
        type: '门禁',
        action: 'G3 增加「契约完整性检查」：按 API_CONTRACTS 反查必须实现的方法清单，缺失即阻断',
        ownerId: 'u-yan',
        dueDate: '2026-03-24',
        kbId: 'KB-ARCH-01',
      },
      {
        type: '知识库',
        action: 'KB-ARCH-01 补充「补偿分支不可留 TODO」红线，并作为架构 Agent 强制召回项',
        ownerId: 'u-gu',
        dueDate: '2026-03-21',
        kbId: 'KB-ARCH-01',
      },
      {
        type: '用例',
        action: 'TP-01 增加异常注入用例族（RPC 超时 / 5xx / 连接重置 / 消息重复投递），共 16 条',
        ownerId: 'u-he',
        dueDate: '2026-03-23',
        kbId: 'KB-TEST-03',
      },
    ],
    relatedIds: [
      'BUG-1045',
      'REQ-2401',
      'TASK-2403',
      'TASK-2402',
      'MR-2403',
      'API-01',
      'CS-2403',
      'PIPE-2407',
      'PIPE-2408',
      'PIPE-2409',
      'KB-ARCH-01',
      'TC-003',
      'G3',
    ],
  },
  {
    id: 'BA-1047',
    bugId: 'BUG-1047',
    title: 'BUG-1047 性能根因分析 · 订单列表深分页导致 API-03 P95 342ms',
    version: 'v1.0',
    status: 'approved',
    authorId: 'u-zhou',
    agentId: 'ag-ops',
    modelId: 'mdl-gpt5',
    confidence: 88,
    reviewerIds: ['u-meng', 'u-he'],
    createdAt: '2026-03-19 08:20',
    updatedAt: '2026-03-19 10:44',
    docPath: 'docs/bug/BUG-1047-analysis.md',
    envId: 'env-staging',
    reproduceRate: '100%（offset > 50000 必现）',
    reproduceSteps: [
      '准备 env-staging 数据集：order_main 820 万行',
      '调用 API-03 /orders?status=PAID&page=1200&size=20（offset = 23,980）',
      '采集 P95 响应时间与 MySQL 执行计划',
      '断言失败：P95 = 342ms，契约要求 < 200ms；执行计划出现 Using filesort + 回表 2.4 万次',
    ],
    occurChain: [
      {
        seq: 1,
        at: '2026-03-04 16:30',
        where: 'TASK-2412 · 多级缓存与查询优化',
        what: 'AI 按 PRD 描述实现 offset/limit 分页，未考虑深分页；会话 CS-2412 中提示过「大数据量建议游标」但被标记为可选',
        tone: 'warn',
      },
      {
        seq: 2,
        at: '2026-03-11 10:05',
        where: 'PIPE-2404 · G3 性能子门禁',
        what: '性能用例只跑 page=1~10 的浅分页，P95 186ms 达标通过',
        tone: 'warn',
      },
      {
        seq: 3,
        at: '2026-03-18 19:30',
        where: 'TP-03 · 全量压测',
        what: '压测脚本覆盖真实运营翻页行为（page 分布长尾至 1500），P95 飙至 342ms，孟星回建单',
        tone: 'danger',
      },
    ],
    whys: [
      {
        level: 1,
        question: '为什么 P95 达到 342ms？',
        answer: 'offset 23,980 需要扫描并丢弃前 23,980 行，MySQL 执行计划出现 Using filesort',
        evidence: 'env-staging 慢查询日志 slow-20260318-1931.log',
      },
      {
        level: 2,
        question: '为什么会 filesort？',
        answer: 'ORDER BY create_time DESC, id DESC 的组合索引 idx_status_ctime 未包含 id，排序无法走索引；且 status 选择性低（PAID 占 62%）',
        evidence: 'EXPLAIN 输出 + 表结构 order_main 索引定义',
      },
      {
        level: 3,
        question: '为什么不用游标分页？',
        answer: 'PRD 只写了「支持翻页」，未定义分页契约；AI 选择了实现成本最低的 offset 方案，且没有把风险回写到需求评审',
        evidence: 'PRD-ORD-v2.1 第 4.3 节 + CS-2412 会话记录',
      },
      {
        level: 4,
        question: '为什么性能门禁没拦住？',
        answer: 'G3 性能子门禁的用例集固定为浅分页（page ≤ 10），缺少「真实流量分布回放」，压测数据未反哺门禁用例',
        evidence: 'PIPE-2404 性能阶段用例清单',
      },
      {
        level: 5,
        question: '架构层面应如何避免？',
        answer: '列表查询统一走 ES（order-search 索引已在 TASK-2414 建成但未接入），MySQL 只承担主键与索引点查，需在架构基线中固化',
        evidence: 'KB-ARCH-01《查询分层与读写分离基线》第 7 节',
      },
    ],
    rootCauseSummary:
      '直接原因：offset 深分页 + 排序字段未进组合索引，触发 filesort 与 2.4 万次回表。根本原因：PRD 未定义分页契约，AI 选择了低成本 offset 方案且风险未回写；G3 性能子门禁只覆盖浅分页，压测数据没有反哺门禁用例集；已建成的 ES 索引（TASK-2414）未被接入列表查询。',
    codeLocation: 'order-query/src/main/resources/mapper/OrderQueryMapper.xml:126-158',
    codeLang: 'xml',
    codeBefore: [
      '<select id="pageByStatus" resultMap="OrderMap">',
      '  SELECT * FROM order_main',
      '  WHERE status = #{status}',
      '  ORDER BY create_time DESC, id DESC',
      '  LIMIT #{offset}, #{size}   <!-- 深分页：offset 23980 触发 filesort -->',
      '</select>',
    ],
    codeAfter: [
      '<select id="pageByCursor" resultMap="OrderMap">',
      '  SELECT * FROM order_main',
      '  WHERE status = #{status}',
      '    AND (create_time, id) &lt; (#{cursorTime}, #{cursorId})',
      '  ORDER BY create_time DESC, id DESC',
      '  LIMIT #{size}              <!-- 游标分页：走 idx_status_ctime_id，无 offset 扫描 -->',
      '</select>',
      '<!-- 配套 DDL：ALTER TABLE order_main DROP INDEX idx_status_ctime,',
      '     ADD INDEX idx_status_ctime_id (status, create_time DESC, id DESC); -->',
    ],
    impactScope: [
      { dim: '契约违反', value: 'API-03 P95 342ms，超出契约 200ms 达 71%', tone: 'danger' },
      { dim: '压测结论', value: '峰值 2,400 TPS，未达 REQ-2404 要求的 3,000 TPS', tone: 'danger' },
      { dim: '用户体验', value: '运营后台翻页至 100 页以后明显卡顿，长尾请求 P99 达 890ms', tone: 'warn' },
      { dim: '数据库负载', value: 'env-staging MySQL CPU 峰值 87%，连接池等待队列 42', tone: 'warn' },
      { dim: '门禁影响', value: 'G4 性能项失败，TP-03 计划整体阻塞（22 条用例仅执行 10 条）', tone: 'danger' },
      { dim: '生产影响', value: '未上生产；若按当前实现上线，预估日订单 42 万下 CPU 将长期 > 80%', tone: 'danger' },
    ],
    fixOptions: [
      {
        id: 'OPT-1047-A',
        name: '游标分页 + 组合索引重建（MR-2413，进行中）',
        desc: '改为 (create_time, id) 游标分页并重建 idx_status_ctime_id；契约新增 cursor 参数，前端翻页组件同步改造。预计 P95 降至 90ms 以内',
        effortHours: 14,
        riskLevel: '中',
        coverageGain: 2.4,
        recommended: true,
        tone: 'ok',
      },
      {
        id: 'OPT-1047-B',
        name: '列表查询切 ES（推荐二期）',
        desc: '接入 TASK-2414 已建成的 order-search 索引，MySQL 只做详情点查。收益最大（P95 < 60ms）但需数据同步链路验证，工期 4 天，赶不上 03-20 窗口',
        effortHours: 32,
        riskLevel: '中',
        coverageGain: 1.0,
        recommended: false,
        tone: 'info',
      },
      {
        id: 'OPT-1047-C',
        name: '限制最大翻页深度',
        desc: 'page > 500 直接返回 400，提示使用筛选条件。改动 1 小时，但属于功能降级，运营侧不接受',
        effortHours: 1,
        riskLevel: '低',
        coverageGain: 0,
        recommended: false,
        tone: 'warn',
      },
    ],
    chosenOptionId: 'OPT-1047-A',
    verificationPlan: [
      '重跑 TP-03 全量 22 条用例（当前 10 条），要求 API-03 P95 < 200ms、P99 < 400ms',
      '压测：3,000 TPS 持续 30 分钟，错误率 < 0.1%，MySQL CPU < 65%',
      '真实流量分布回放：按运营侧 page 长尾分布（p50=3, p95=180, p99=1200）验证',
      'EXPLAIN 复核：确认无 Using filesort，rows 估算 < 40',
      '契约回归：API-03 新增 cursor 参数向后兼容（不传 cursor 时退化为 page=1）',
    ],
    prevention: [
      {
        type: '流程',
        action: 'PRD 模板新增「分页契约」必填项（分页方式 / 最大深度 / 排序键），需求评审阶段由 BA Agent 校验',
        ownerId: 'u-gu',
        dueDate: '2026-03-24',
        kbId: 'KB-BS-2401',
      },
      {
        type: '门禁',
        action: 'G3 性能子门禁引入真实流量分布回放，替换固定浅分页用例集',
        ownerId: 'u-yan',
        dueDate: '2026-03-26',
        kbId: '',
      },
      {
        type: '知识库',
        action: 'KB-ARCH-01 增补「列表查询禁用 offset 深分页」红线与游标分页模板代码',
        ownerId: 'u-gu',
        dueDate: '2026-03-22',
        kbId: 'KB-ARCH-01',
      },
      {
        type: '监控',
        action: '为 API-01~14 全部契约配置 P95 基线告警，超基线 20% 即推送',
        ownerId: 'u-meng',
        dueDate: '2026-03-25',
        kbId: 'KB-OPS-01',
      },
    ],
    relatedIds: [
      'BUG-1047',
      'REQ-2404',
      'TASK-2412',
      'TASK-2414',
      'MR-2413',
      'API-03',
      'CS-2412',
      'PIPE-2404',
      'TP-03',
      'KB-ARCH-01',
      'KB-OPS-01',
      'TC-013',
      'PRD-ORD-v2.1',
    ],
  },
];

export const BUG_ANALYSIS_MAP: Record<string, BugAnalysisDef> = BUG_ANALYSIS.reduce(
  (acc, item) => {
    acc[item.bugId] = item;
    return acc;
  },
  {} as Record<string, BugAnalysisDef>,
);

/* ==================================================================
 * 18. 缺陷流转时间线（Bug 流转 · 状态机轨迹）
 * ================================================================== */

/** 缺陷状态机允许的流转 */
export interface BugStateFlowDef {
  from: string;
  to: string;
  trigger: string;
  actorType: 'human' | 'agent' | 'system';
  slaHours: number;
  note: string;
  tone: Tone;
}

export const BUG_STATE_FLOW: BugStateFlowDef[] = [
  {
    from: '（无）',
    to: 'new',
    trigger: '用例失败自动建单 / 人工建单 / 监控告警建单',
    actorType: 'system',
    slaHours: 0,
    note: '建单即写入 pcCode、reqId、caseIds、moduleId，PingCode 侧同步为「新建」',
    tone: 'info',
  },
  {
    from: 'new',
    to: 'analyzing',
    trigger: '分析 Agent 认领 / 处理人接单',
    actorType: 'agent',
    slaHours: 2,
    note: 'P0 要求 30 分钟内进入分析，超时自动电话升级值班',
    tone: 'info',
  },
  {
    from: 'analyzing',
    to: 'fixing',
    trigger: '根因分析报告 approved 且创建修复分支',
    actorType: 'human',
    slaHours: 4,
    note: '必须关联 mrId 与 branch，否则不允许流转',
    tone: 'warn',
  },
  {
    from: 'fixing',
    to: 'verifying',
    trigger: '修复 MR 合并且流水线全绿',
    actorType: 'system',
    slaHours: 24,
    note: '由 pipelineId 的成功事件自动驱动，人工不可越过',
    tone: 'ok',
  },
  {
    from: 'verifying',
    to: 'closed',
    trigger: '验证人复验通过并回填证据',
    actorType: 'human',
    slaHours: 8,
    note: '必须附用例执行记录（caseIds 全部 passed）',
    tone: 'ok',
  },
  {
    from: 'verifying',
    to: 'reopened',
    trigger: '复验失败',
    actorType: 'human',
    slaHours: 0,
    note: '本迭代 0 次重开；重开 2 次以上自动升级优先级',
    tone: 'danger',
  },
  {
    from: 'reopened',
    to: 'fixing',
    trigger: '处理人重新接单',
    actorType: 'human',
    slaHours: 8,
    note: '重开后 SLA 重新计时，但保留首次超时记录用于效能统计',
    tone: 'warn',
  },
  {
    from: 'closed',
    to: 'reopened',
    trigger: '生产环境同类问题再现',
    actorType: 'human',
    slaHours: 0,
    note: '需附新的复现证据，并由需求负责人确认是否属同一根因',
    tone: 'danger',
  },
];

/** 缺陷时间线事件 */
export interface BugTimelineEvent {
  id: string;
  bugId: string;
  at: string;
  fromState: string;
  toState: string;
  actorId: string;
  actorType: 'human' | 'agent' | 'system';
  action: string;
  detail: string;
  refIds: string[];
  tone: Tone;
}

/** 47 条事件，覆盖 12 个缺陷全生命周期，时间与 BUGS 的 foundAt / updatedAt / closedAt 严格对齐 */
export const BUG_TIMELINE: BugTimelineEvent[] = [
  /* ---- BUG-1043（P0 资损级，02-27 建单，至今 fixing） ---- */
  {
    id: 'BT-001',
    bugId: 'BUG-1043',
    at: '2026-02-27 23:05',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-meng',
    actorType: 'human',
    action: '资损告警建单',
    detail: 'REL-2402 灰度批次 2 观察期内资损告警触发 3 次，财务对账出现「优惠分摊不平」，建单并定级资损级（致命）',
    refIds: ['REL-2402', 'env-prod'],
    tone: 'danger',
  },
  {
    id: 'BT-002',
    bugId: 'BUG-1043',
    at: '2026-02-27 23:12',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-review',
    actorType: 'agent',
    action: 'AI 首次定位',
    detail: '评审 Agent 38 秒内定位到 AmountAllocator#allocate 第 47 行 divide(3, 2, HALF_EVEN) 截断，置信度 94%',
    refIds: ['mdl-claude'],
    tone: 'ai',
  },
  {
    id: 'BT-003',
    bugId: 'BUG-1043',
    at: '2026-02-28 09:30',
    fromState: 'analyzing',
    toState: 'fixing',
    actorId: 'u-zhou',
    actorType: 'human',
    action: '创建修复分支',
    detail: '周浩然建 fix/promo-amount-precision 分支并提交 MR-2410，采纳方案 OPT-1043-A（最大余额法 + 全链路 BigDecimal）',
    refIds: ['MR-2410', 'TASK-2410'],
    tone: 'warn',
  },
  {
    id: 'BT-004',
    bugId: 'BUG-1043',
    at: '2026-03-05 14:20',
    fromState: 'fixing',
    toState: 'fixing',
    actorId: 'u-he',
    actorType: 'human',
    action: 'REL-2402 灰度前复验未通过',
    detail: '何斯年在 env-prod 灰度前复验 TC-010，仍有 9/128 组边界数据不平，负向分摊（退款）分支未覆盖',
    refIds: ['TC-010', 'REL-2402'],
    tone: 'danger',
  },
  {
    id: 'BT-005',
    bugId: 'BUG-1043',
    at: '2026-03-15 09:58',
    fromState: 'fixing',
    toState: 'fixing',
    actorId: 'system',
    actorType: 'system',
    action: 'G3 门禁失败',
    detail: 'PIPE-2407 聚合分支覆盖率 68.2% < 85%，MR-2410 无法合并，缺陷滞留 fixing',
    refIds: ['PIPE-2407', 'G3'],
    tone: 'danger',
  },
  {
    id: 'BT-006',
    bugId: 'BUG-1043',
    at: '2026-03-18 09:12',
    fromState: 'fixing',
    toState: 'fixing',
    actorId: 'u-zhou',
    actorType: 'human',
    action: '确认 AI 根因分析',
    detail: '周浩然人工确认 BA-1043 v1.3 根因结论，并采纳 5 条预防动作（KB-CODE-02 标签补齐、G3 金额规则门禁等）',
    refIds: ['BA-1043', 'KB-CODE-02'],
    tone: 'ok',
  },
  {
    id: 'BT-007',
    bugId: 'BUG-1043',
    at: '2026-03-19 16:08',
    fromState: 'fixing',
    toState: 'fixing',
    actorId: 'ag-review',
    actorType: 'agent',
    action: 'MR-2410 复检',
    detail: 'PIPE-2409 后复检：must-fix 由 3 条降至 1 条（负向分摊），覆盖率 71.4% 仍未达 85%；SLA 已超时 451 小时',
    refIds: ['MR-2410', 'PIPE-2409'],
    tone: 'danger',
  },

  /* ---- BUG-1045（P0，与 G3 覆盖率缺口同源，analyzing） ---- */
  {
    id: 'BT-008',
    bugId: 'BUG-1045',
    at: '2026-03-10 14:22',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-he',
    actorType: 'human',
    action: '异常注入用例建单',
    detail: 'TC-003 注入 RPC 超时后发现库存双扣，env-test 累计 37 条悬挂记录',
    refIds: ['TC-003', 'TP-01'],
    tone: 'danger',
  },
  {
    id: 'BT-009',
    bugId: 'BUG-1045',
    at: '2026-03-10 14:35',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-code',
    actorType: 'agent',
    action: '编码 Agent 认领分析',
    detail: '使用 mdl-deepseek 扫描 InventoryDeductService，发现 rollback 方法体仅 TODO 注释，置信度 78%',
    refIds: ['mdl-deepseek', 'TASK-2403'],
    tone: 'ai',
  },
  {
    id: 'BT-010',
    bugId: 'BUG-1045',
    at: '2026-03-12 10:05',
    fromState: 'analyzing',
    toState: 'analyzing',
    actorId: 'u-zhou',
    actorType: 'human',
    action: '判定与门禁失败同源',
    detail: '确认该缺失分支正是 G3 覆盖率缺口的组成部分，修复后可同时缓解门禁失败，优先级维持 P0',
    refIds: ['G3', 'BA-1045'],
    tone: 'warn',
  },
  {
    id: 'BT-011',
    bugId: 'BUG-1045',
    at: '2026-03-19 17:26',
    fromState: 'analyzing',
    toState: 'analyzing',
    actorId: 'ag-code',
    actorType: 'agent',
    action: 'AI 补偿方案待人工确认',
    detail: '产出 BA-1045 v0.8（rollback + 幂等守卫 + outbox 事件），预计覆盖率 +9.2pt；尚未创建修复分支，SLA 超时 219 小时',
    refIds: ['BA-1045', 'MR-2403'],
    tone: 'warn',
  },

  /* ---- BUG-1046（P0，状态机并发，fixing） ---- */
  {
    id: 'BT-012',
    bugId: 'BUG-1046',
    at: '2026-03-11 10:40',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-he',
    actorType: 'human',
    action: '并发用例建单',
    detail: 'TC-007 在 50 并发下出现 PAID → CANCELLED 非法跃迁，订单状态被覆盖',
    refIds: ['TC-007', 'REQ-2402'],
    tone: 'danger',
  },
  {
    id: 'BT-013',
    bugId: 'BUG-1046',
    at: '2026-03-11 11:02',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-code',
    actorType: 'agent',
    action: 'AI 定位状态机校验缺失',
    detail: 'OrderStateMachine#fire 未在事务内做前置状态校验，读改写非原子',
    refIds: ['TASK-2406'],
    tone: 'ai',
  },
  {
    id: 'BT-014',
    bugId: 'BUG-1046',
    at: '2026-03-12 15:40',
    fromState: 'analyzing',
    toState: 'fixing',
    actorId: 'u-zhou',
    actorType: 'human',
    action: 'MR-2406 追加乐观锁',
    detail: '在 order_main 增加 version 字段并以 CAS 更新，非法跃迁抛出 IllegalStateTransitionException',
    refIds: ['MR-2406', 'TASK-2406'],
    tone: 'warn',
  },
  {
    id: 'BT-015',
    bugId: 'BUG-1046',
    at: '2026-03-19 11:02',
    fromState: 'fixing',
    toState: 'fixing',
    actorId: 'system',
    actorType: 'system',
    action: 'G3 失败阻塞合并',
    detail: 'PIPE-2409 覆盖率 71.4% < 85%，MR-2406 无法合并；SLA 超时 198 小时，已电话升级至林知远',
    refIds: ['PIPE-2409', 'G3', 'DN-04'],
    tone: 'danger',
  },

  /* ---- BUG-1047（P1，深分页性能，fixing） ---- */
  {
    id: 'BT-016',
    bugId: 'BUG-1047',
    at: '2026-03-18 19:30',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-meng',
    actorType: 'human',
    action: '压测报告建单',
    detail: 'TP-03 全量压测 API-03 P95 = 342ms，超契约 200ms 达 71%，峰值仅 2,400 TPS',
    refIds: ['TC-013', 'TP-03', 'API-03'],
    tone: 'danger',
  },
  {
    id: 'BT-017',
    bugId: 'BUG-1047',
    at: '2026-03-18 19:48',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-ops',
    actorType: 'agent',
    action: '运维 Agent 分析执行计划',
    detail: 'mdl-gpt5 解析慢查询日志与 EXPLAIN，判定 offset 深分页 + filesort，回表 2.4 万次，置信度 88%',
    refIds: ['mdl-gpt5', 'BA-1047'],
    tone: 'ai',
  },
  {
    id: 'BT-018',
    bugId: 'BUG-1047',
    at: '2026-03-19 09:05',
    fromState: 'analyzing',
    toState: 'fixing',
    actorId: 'u-zhou',
    actorType: 'human',
    action: 'MR-2413 改游标分页',
    detail: '采纳 OPT-1047-A：(create_time, id) 游标分页 + 重建 idx_status_ctime_id，契约新增 cursor 参数并保持向后兼容',
    refIds: ['MR-2413', 'TASK-2412', 'BA-1047'],
    tone: 'warn',
  },
  {
    id: 'BT-019',
    bugId: 'BUG-1047',
    at: '2026-03-19 10:44',
    fromState: 'fixing',
    toState: 'fixing',
    actorId: 'u-meng',
    actorType: 'human',
    action: '复测未达标，TP-03 阻塞',
    detail: '索引重建后浅分页 P95 降至 62ms，但 page=1200 深分页仍为 342ms，需叠加 OPT-1047-B（切 ES）；TP-03 剩余 12 条用例暂停执行',
    refIds: ['TP-03', 'TASK-2414'],
    tone: 'danger',
  },

  /* ---- BUG-1048（P1，Pub/Sub 广播失效，analyzing） ---- */
  {
    id: 'BT-020',
    bugId: 'BUG-1048',
    at: '2026-03-18 20:55',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-he',
    actorType: 'human',
    action: '领域事件用例建单',
    detail: 'TC-014 验证 ORDER_PAID 事件广播时，3 个订阅方仅 1 个收到消息',
    refIds: ['TC-014', 'REQ-2406'],
    tone: 'danger',
  },
  {
    id: 'BT-021',
    bugId: 'BUG-1048',
    at: '2026-03-18 21:10',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'u-shen',
    actorType: 'human',
    action: '沈亦白接单',
    detail: 'RabbitMQ 队列声明为 exclusive，多消费方争抢同一队列，需改为 fanout 广播 + 每订阅方独立队列',
    refIds: ['MR-2412', 'TASK-2416'],
    tone: 'warn',
  },
  {
    id: 'BT-022',
    bugId: 'BUG-1048',
    at: '2026-03-19 09:18',
    fromState: 'analyzing',
    toState: 'analyzing',
    actorId: 'ag-arch',
    actorType: 'agent',
    action: '架构 Agent 给出拓扑改造方案',
    detail: '输出 exchange 拓扑改造建议（fanout + 独立队列 + 死信兜底），涉及 API-11/API-12 契约不变，等待人工确认后建分支',
    refIds: ['KB-ARCH-01', 'API-11'],
    tone: 'ai',
  },

  /* ---- BUG-1049（P0，事件串行化，fixing） ---- */
  {
    id: 'BT-023',
    bugId: 'BUG-1049',
    at: '2026-03-12 16:05',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-shen',
    actorType: 'human',
    action: '一致性用例建单',
    detail: 'TC-009 在同一聚合根并发投递事件时出现乱序，最终状态与预期不符',
    refIds: ['TC-009', 'REQ-2406'],
    tone: 'danger',
  },
  {
    id: 'BT-024',
    bugId: 'BUG-1049',
    at: '2026-03-12 16:30',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-code',
    actorType: 'agent',
    action: 'AI 定位分区键设计',
    detail: '事件分区键使用 orderId 的 hashCode 取模，负数哈希导致分区倾斜与乱序',
    refIds: ['TASK-2417'],
    tone: 'ai',
  },
  {
    id: 'BT-025',
    bugId: 'BUG-1049',
    at: '2026-03-13 10:15',
    fromState: 'analyzing',
    toState: 'fixing',
    actorId: 'u-shen',
    actorType: 'human',
    action: 'MR-2417 改聚合根哈希串行',
    detail: '分区键改为 aggregateId 的一致性哈希（非负），同聚合根事件严格串行，跨聚合根并行',
    refIds: ['MR-2417', 'TASK-2417'],
    tone: 'warn',
  },
  {
    id: 'BT-026',
    bugId: 'BUG-1049',
    at: '2026-03-19 14:50',
    fromState: 'fixing',
    toState: 'fixing',
    actorId: 'system',
    actorType: 'system',
    action: '等待流水线重跑',
    detail: 'PIPE-2405 已跑通功能用例，但 G3 覆盖率未达标导致无法合并；SLA 超时 167 小时',
    refIds: ['PIPE-2405', 'G3'],
    tone: 'danger',
  },

  /* ---- BUG-1050（P2，时区兼容，已关闭） ---- */
  {
    id: 'BT-027',
    bugId: 'BUG-1050',
    at: '2026-03-14 11:20',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-shen',
    actorType: 'human',
    action: '迁移比对建单',
    detail: 'TC-019 双写比对发现 create_time 相差 8 小时，迁移脚本未统一时区',
    refIds: ['TC-019', 'REQ-2407'],
    tone: 'warn',
  },
  {
    id: 'BT-028',
    bugId: 'BUG-1050',
    at: '2026-03-14 11:45',
    fromState: 'new',
    toState: 'fixing',
    actorId: 'u-shen',
    actorType: 'human',
    action: '直接进入修复',
    detail: '根因明确（JDBC 连接串缺 serverTimezone=Asia/Shanghai），跳过独立分析阶段',
    refIds: ['TASK-2419'],
    tone: 'info',
  },
  {
    id: 'BT-029',
    bugId: 'BUG-1050',
    at: '2026-03-14 18:20',
    fromState: 'fixing',
    toState: 'verifying',
    actorId: 'system',
    actorType: 'system',
    action: '流水线全绿',
    detail: 'PIPE-2405 构建 + 单测 + 迁移比对全部通过，自动流转至待验证',
    refIds: ['PIPE-2405'],
    tone: 'ok',
  },
  {
    id: 'BT-030',
    bugId: 'BUG-1050',
    at: '2026-03-15 10:05',
    fromState: 'verifying',
    toState: 'closed',
    actorId: 'u-he',
    actorType: 'human',
    action: '复验通过关闭',
    detail: 'TC-019 重跑通过，22 条迁移比对用例 100% 一致，修复耗时 22.75 小时（SLA 内）',
    refIds: ['TC-019', 'tm-migrate'],
    tone: 'ok',
  },

  /* ---- BUG-1051（P2，分布式锁，verifying） ---- */
  {
    id: 'BT-031',
    bugId: 'BUG-1051',
    at: '2026-03-15 17:20',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-shen',
    actorType: 'human',
    action: '幂等用例建单',
    detail: 'TC-002 重复提交下单请求时，Redis 分布式锁在 GC 停顿后提前过期，出现两次落单',
    refIds: ['TC-002', 'REQ-2401'],
    tone: 'warn',
  },
  {
    id: 'BT-032',
    bugId: 'BUG-1051',
    at: '2026-03-16 09:10',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-code',
    actorType: 'agent',
    action: 'AI 分析（数据不出域）',
    detail: '因涉及生产订单样本，改用内网私有化模型 mdl-local 分析；建议引入看门狗续期 + 唯一业务幂等键双保险',
    refIds: ['mdl-local', 'EGRESS-MASK'],
    tone: 'ai',
  },
  {
    id: 'BT-033',
    bugId: 'BUG-1051',
    at: '2026-03-16 15:40',
    fromState: 'analyzing',
    toState: 'fixing',
    actorId: 'u-shen',
    actorType: 'human',
    action: 'MR-2418 加看门狗续期',
    detail: '锁 TTL 30s + 每 10s 续期，并以 requestId 作为数据库唯一索引兜底',
    refIds: ['MR-2418', 'TASK-2401'],
    tone: 'warn',
  },
  {
    id: 'BT-034',
    bugId: 'BUG-1051',
    at: '2026-03-18 11:25',
    fromState: 'fixing',
    toState: 'verifying',
    actorId: 'system',
    actorType: 'system',
    action: '流水线全绿',
    detail: 'PIPE-2406 通过，进入待验证',
    refIds: ['PIPE-2406'],
    tone: 'ok',
  },
  {
    id: 'BT-035',
    bugId: 'BUG-1051',
    at: '2026-03-19 08:40',
    fromState: 'verifying',
    toState: 'verifying',
    actorId: 'u-he',
    actorType: 'human',
    action: '待并发复验排期',
    detail: '需 200 并发 + GC 注入环境，env-staging 资源被 TP-03 压测占用（BLOCK-0312），复验排至 03-20 上午',
    refIds: ['BLOCK-0312', 'TP-03'],
    tone: 'warn',
  },

  /* ---- BUG-1052（P2 高危，审计导出缺失，new） ---- */
  {
    id: 'BT-036',
    bugId: 'BUG-1052',
    at: '2026-03-19 09:20',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-he',
    actorType: 'human',
    action: 'G6 合规扫描建单',
    detail: '安全合规先导扫描发现 TASK-2424（审计导出）尚未启动，@AuditExport 注解缺失，G6 观测项不满足',
    refIds: ['G6', 'TASK-2424', 'TC-016'],
    tone: 'danger',
  },
  {
    id: 'BT-037',
    bugId: 'BUG-1052',
    at: '2026-03-19 09:26',
    fromState: 'new',
    toState: 'new',
    actorId: 'ag-ba',
    actorType: 'agent',
    action: 'AI 生成整改建议',
    detail: '业务分析 Agent 用 mdl-local 输出整改清单（注解埋点 14 处 / 导出格式 / 留存 180 天），等待排期确认，暂不流转',
    refIds: ['mdl-local', 'KB-SEC-02'],
    tone: 'ai',
  },

  /* ---- BUG-1053（P1，内存泄漏，analyzing） ---- */
  {
    id: 'BT-038',
    bugId: 'BUG-1053',
    at: '2026-03-18 22:40',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-meng',
    actorType: 'human',
    action: '长稳压测建单',
    detail: 'env-staging 4 小时长稳压测中 order-query 堆内存从 1.2G 涨至 3.8G，Full GC 后不回落',
    refIds: ['TC-015', 'TP-03', 'env-staging'],
    tone: 'danger',
  },
  {
    id: 'BT-039',
    bugId: 'BUG-1053',
    at: '2026-03-18 23:05',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-ops',
    actorType: 'agent',
    action: 'AI 分析堆快照',
    detail: 'mdl-gpt5 分析 heap dump，怀疑多级缓存未设最大条目数，置信度仅 64%，建议人工介入',
    refIds: ['mdl-gpt5', 'TASK-2412'],
    tone: 'ai',
  },
  {
    id: 'BT-040',
    bugId: 'BUG-1053',
    at: '2026-03-19 15:30',
    fromState: 'analyzing',
    toState: 'analyzing',
    actorId: 'u-zhou',
    actorType: 'human',
    action: '堆快照不足，长稳压测暂停',
    detail: '首次 dump 未开启 GC 日志与 native memory tracking，无法定位；已重新配置采集参数，长稳压测暂停，容量结论存在不确定性',
    refIds: ['TP-03', 'TR-24'],
    tone: 'warn',
  },

  /* ---- BUG-1054（P2 高危，脱敏漏网，fixing） ---- */
  {
    id: 'BT-041',
    bugId: 'BUG-1054',
    at: '2026-03-19 09:31',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-he',
    actorType: 'human',
    action: '脱敏用例建单',
    detail: 'TC-017 发现订单导出接口 addressDetail 字段未脱敏，明文返回详细门牌号',
    refIds: ['TC-017', 'G6', 'REQ-2408'],
    tone: 'danger',
  },
  {
    id: 'BT-042',
    bugId: 'BUG-1054',
    at: '2026-03-19 09:50',
    fromState: 'new',
    toState: 'analyzing',
    actorId: 'ag-ba',
    actorType: 'agent',
    action: 'AI 定位脱敏规则缺口',
    detail: '@SecMask 注解在 addressDetail 字段缺失；SEC-MASK-2.1 规则库中「详细地址」类目未纳入自动扫描白名单',
    refIds: ['SEC-MASK-2.1', 'TASK-2423'],
    tone: 'ai',
  },
  {
    id: 'BT-043',
    bugId: 'BUG-1054',
    at: '2026-03-19 14:12',
    fromState: 'analyzing',
    toState: 'fixing',
    actorId: 'u-chen',
    actorType: 'human',
    action: 'TASK-2423 补 @SecMask',
    detail: '陈屿在 OrderExportVO 补注解并把「详细地址」加入 SEC-MASK-2.1 白名单，同步补 6 条脱敏用例',
    refIds: ['TASK-2423', 'KB-SEC-02'],
    tone: 'warn',
  },

  /* ---- BUG-1055（P3，状态流水同步写，已关闭） ---- */
  {
    id: 'BT-044',
    bugId: 'BUG-1055',
    at: '2026-03-13 15:10',
    fromState: '（无）',
    toState: 'new',
    actorId: 'u-meng',
    actorType: 'human',
    action: '性能观测建单',
    detail: 'TC-008 显示状态流水同步落库使下单接口 P99 增加 46ms，定级 P3',
    refIds: ['TC-008', 'REQ-2402'],
    tone: 'info',
  },
  {
    id: 'BT-045',
    bugId: 'BUG-1055',
    at: '2026-03-13 16:02',
    fromState: 'new',
    toState: 'fixing',
    actorId: 'u-zhou',
    actorType: 'human',
    action: 'MR-2406 改异步写流水',
    detail: '状态流水改为本地队列异步批量落库，失败重试 3 次后进入死信表',
    refIds: ['MR-2406', 'TASK-2407'],
    tone: 'info',
  },
  {
    id: 'BT-046',
    bugId: 'BUG-1055',
    at: '2026-03-15 17:40',
    fromState: 'fixing',
    toState: 'verifying',
    actorId: 'u-zhou',
    actorType: 'human',
    action: '提交验证',
    detail: '自测 P99 回落 41ms，死信表 0 条，提交孟星回复验',
    refIds: ['TC-008'],
    tone: 'ok',
  },
  {
    id: 'BT-047',
    bugId: 'BUG-1055',
    at: '2026-03-16 11:25',
    fromState: 'verifying',
    toState: 'closed',
    actorId: 'u-meng',
    actorType: 'human',
    action: '复验通过关闭',
    detail: 'TC-008 重跑通过，P99 由 214ms 降至 173ms，关闭耗时 68.25 小时（P3 SLA 168h 内）',
    refIds: ['TC-008', 'tm-state'],
    tone: 'ok',
  },
];

export const BUG_TIMELINE_BY_BUG: Record<string, BugTimelineEvent[]> = BUG_TIMELINE.reduce(
  (acc, item) => {
    if (!acc[item.bugId]) acc[item.bugId] = [];
    acc[item.bugId].push(item);
    return acc;
  },
  {} as Record<string, BugTimelineEvent[]>,
);

/** 流转效率统计（供 Bug 流转页顶部指标卡） */
export const BUG_FLOW_STATS = {
  eventTotal: 47,
  bugTotal: 12,
  avgDetectToAnalyzeHours: 0.6,
  avgAnalyzeToFixHours: 14.2,
  avgFixToVerifyHours: 26.8,
  avgVerifyToCloseHours: 15.4,
  avgDetectToCloseHours: 41.5,
  reopenCount: 0,
  reopenRate: 0,
  aiInvolvedCount: 12,
  aiInvolvedRate: 100,
  aiFirstHitCount: 8,
  aiFirstHitRate: 66.7,
  slaBreachedIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049'],
  slaBreachedCount: 4,
  slaBreachRate: 33.3,
  autoFlowCount: 6,
  autoFlowRate: 12.8,
  longestOpenBugId: 'BUG-1043',
  longestOpenDays: 20,
  bottleneck: 'fixing → verifying',
  bottleneckReason:
    '5 个缺陷滞留在 fixing，全部因 G3 覆盖率门禁失败无法合并（PIPE-2407 / 2408 / 2409 连续 3 次），并非修复本身未完成',
  note: '4 个 SLA 超时缺陷全部为 P0/P1 且全部卡在 G3；解门禁即解 SLA，是当前最高杠杆动作。',
};

/* ==================================================================
 * 19. 缺陷 SLA 策略、通知订阅与升级链路（Bug 流转 · 订阅中心）
 * ================================================================== */

/** 升级步骤（超时后自动逐级升级） */
export interface BugEscalationStep {
  level: 1 | 2 | 3 | 4;
  /** 建单后经过多少小时仍未确认 / 未闭环即触发 */
  afterHours: number;
  toRoleId: string;
  channel: DeployNotifyDef['channel'];
  notifyId: string;
  action: string;
}

/** 缺陷 SLA 与升级策略（totalHours 与 BUGS.slaHours 严格一致） */
export interface BugSlaPolicyDef {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  name: string;
  ackMinutes: number;
  analyzeHours: number;
  fixHours: number;
  verifyHours: number;
  totalHours: number;
  /** 是否自动阻断发布（写入 G4 门禁 actual） */
  autoBlockRelease: boolean;
  notifyIds: string[];
  escalations: BugEscalationStep[];
  /** 特殊类目延长（覆盖 totalHours） */
  categoryOverrides: { category: string; totalHours: number; bugIds: string[]; reason: string }[];
  matchedBugIds: string[];
  breachedIds: string[];
  tone: Tone;
  note: string;
}

export const BUG_SLA_POLICIES: BugSlaPolicyDef[] = [
  {
    id: 'SLA-P0',
    priority: 'P0',
    name: 'P0 致命 / 资损级',
    ackMinutes: 5,
    analyzeHours: 2,
    fixHours: 8,
    verifyHours: 14,
    totalHours: 24,
    autoBlockRelease: true,
    notifyIds: ['BN-01', 'BN-02', 'BN-03', 'BN-04'],
    escalations: [
      {
        level: 1,
        afterHours: 0.08,
        toRoleId: 'developer',
        channel: 'lark-card',
        notifyId: 'BN-01',
        action: '飞书卡片推送处理人，5 分钟未点击「接单」进入下一级',
      },
      {
        level: 2,
        afterHours: 0.25,
        toRoleId: 'architect',
        channel: 'sms',
        notifyId: 'BN-02',
        action: '短信通知值班架构师与测试负责人，附带 AI 初步定位链接',
      },
      {
        level: 3,
        afterHours: 1,
        toRoleId: 'manager',
        channel: 'phone',
        notifyId: 'BN-03',
        action: '电话语音升级研发总监（与 DN-05 共用值班电话通道）',
      },
      {
        level: 4,
        afterHours: 4,
        toRoleId: 'manager',
        channel: 'lark-group',
        notifyId: 'BN-04',
        action: '资损级全员广播 + 拉起飞书应急会议，同步变更委员会',
      },
    ],
    categoryOverrides: [],
    matchedBugIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049'],
    breachedIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049'],
    tone: 'danger',
    note: '4 个 P0 全部超时，超时原因一致：G3 覆盖率门禁未过，修复代码无法合并（详见 BUG_FLOW_STATS.bottleneck）。',
  },
  {
    id: 'SLA-P1',
    priority: 'P1',
    name: 'P1 严重',
    ackMinutes: 15,
    analyzeHours: 8,
    fixHours: 24,
    verifyHours: 40,
    totalHours: 72,
    autoBlockRelease: true,
    notifyIds: ['BN-01', 'BN-05', 'BN-06', 'BN-08'],
    escalations: [
      {
        level: 1,
        afterHours: 0.25,
        toRoleId: 'developer',
        channel: 'lark-card',
        notifyId: 'BN-01',
        action: '飞书卡片推送处理人，15 分钟未接单提醒一次',
      },
      {
        level: 2,
        afterHours: 24,
        toRoleId: 'tester',
        channel: 'lark-card',
        notifyId: 'BN-05',
        action: 'SLA 消耗 1/3 仍停留在 analyzing，通知测试负责人评估是否降级或拆分',
      },
      {
        level: 3,
        afterHours: 57.6,
        toRoleId: 'manager',
        channel: 'lark-group',
        notifyId: 'BN-08',
        action: 'SLA 剩余不足 20%，日报置顶并通知研发总监',
      },
    ],
    categoryOverrides: [],
    matchedBugIds: ['BUG-1047', 'BUG-1048', 'BUG-1053'],
    breachedIds: [],
    tone: 'warn',
    note: '3 个 P1 均在 SLA 内（剩余 47h / 36h / 44h），但 BUG-1053 因堆快照不足已暂停 TP-03，存在 03-21 超时风险。',
  },
  {
    id: 'SLA-P2',
    priority: 'P2',
    name: 'P2 一般',
    ackMinutes: 60,
    analyzeHours: 24,
    fixHours: 72,
    verifyHours: 24,
    totalHours: 120,
    autoBlockRelease: false,
    notifyIds: ['BN-05', 'BN-06', 'BN-07', 'BN-08'],
    escalations: [
      {
        level: 1,
        afterHours: 1,
        toRoleId: 'developer',
        channel: 'lark-card',
        notifyId: 'BN-05',
        action: '飞书卡片推送处理人，进入当日待办清单',
      },
      {
        level: 2,
        afterHours: 96,
        toRoleId: 'tester',
        channel: 'lark-group',
        notifyId: 'BN-08',
        action: 'SLA 剩余不足 20%，纳入每日缺陷日报置顶区',
      },
    ],
    categoryOverrides: [
      {
        category: '安全合规',
        totalHours: 168,
        bugIds: ['BUG-1052', 'BUG-1054'],
        reason: '合规类缺陷需走安全部门复核与整改验证，SLA 由 120h 延长至 168h，但 G6 一票否决权不变',
      },
    ],
    matchedBugIds: ['BUG-1050', 'BUG-1051', 'BUG-1052', 'BUG-1054'],
    breachedIds: [],
    tone: 'info',
    note: 'BUG-1051 剩余 21h（占比 17.5%）已触发 BN-05 临期提醒，复验被 BLOCK-0312 环境占用阻塞，排至 03-20 上午。',
  },
  {
    id: 'SLA-P3',
    priority: 'P3',
    name: 'P3 轻微',
    ackMinutes: 240,
    analyzeHours: 48,
    fixHours: 96,
    verifyHours: 24,
    totalHours: 168,
    autoBlockRelease: false,
    notifyIds: ['BN-06', 'BN-08'],
    escalations: [
      {
        level: 1,
        afterHours: 4,
        toRoleId: 'developer',
        channel: 'lark-card',
        notifyId: 'BN-08',
        action: '仅进入每日缺陷日报，不做即时打扰',
      },
    ],
    categoryOverrides: [],
    matchedBugIds: ['BUG-1055'],
    breachedIds: [],
    tone: 'neutral',
    note: 'BUG-1055 关闭耗时 68.25h，为唯一在 SLA 内闭环的缺陷，且由 AI 一次命中根因（置信度 93%）。',
  },
];

export const BUG_SLA_POLICY_MAP: Record<string, BugSlaPolicyDef> = Object.fromEntries(
  BUG_SLA_POLICIES.map((p) => [p.priority, p]),
);

/* -------------------------------------------------------------------------
 * 19.2 缺陷通知规则（复用部署通知的渠道枚举）
 * ---------------------------------------------------------------------- */

export interface BugNotifyDef {
  id: string;
  name: string;
  channel: DeployNotifyDef['channel'];
  target: string;
  /** 触发事件（与 BUG_STATE_FLOW 的流转对齐） */
  events: string[];
  /** 命中条件表达式（原型内仅作展示） */
  matchRule: string;
  receiverIds: string[];
  template: string;
  /** 确认时限（分钟），超时进入 escalateToId */
  ackTimeoutMin: number;
  escalateToId: string;
  silenceWindow: string;
  enabled: boolean;
  lastSentAt: string;
  sentCount30d: number;
  relatedBugIds: string[];
  tone: Tone;
}

export const BUG_NOTIFY: BugNotifyDef[] = [
  {
    id: 'BN-01',
    name: 'P0/P1 新建即时告警',
    channel: 'lark-card',
    target: '飞书群「订单中心重构 · 质量作战室」+ 处理人个人',
    events: ['bug.created', 'bug.reopened', 'bug.priority.upgraded'],
    matchRule: "priority in ('P0','P1')",
    receiverIds: ['u-zhou', 'u-shen', 'u-he', 'u-meng'],
    template:
      '【{{priority}}缺陷】{{bugId}} {{title}}｜报告人 {{reporter}}｜复现率 {{reproduceRate}}｜SLA {{slaHours}}h｜AI 定位 {{aiSummary}}',
    ackTimeoutMin: 5,
    escalateToId: 'BN-02',
    silenceWindow: '无（P0/P1 通道不静默）',
    enabled: true,
    lastSentAt: '2026-03-12 16:05',
    sentCount30d: 7,
    relatedBugIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1047', 'BUG-1048', 'BUG-1049', 'BUG-1053'],
    tone: 'danger',
  },
  {
    id: 'BN-02',
    name: 'P0 未接单短信升级',
    channel: 'sms',
    target: '值班架构师 / 测试负责人手机',
    events: ['bug.ack.timeout'],
    matchRule: "priority = 'P0' && acked = false && elapsedMinutes > 5",
    receiverIds: ['u-yan', 'u-he'],
    template: '【升级】{{bugId}} 建单已 {{elapsed}} 分钟无人接单，严重度 {{severity}}，请立即进入质量作战室',
    ackTimeoutMin: 10,
    escalateToId: 'BN-03',
    silenceWindow: '无',
    enabled: true,
    lastSentAt: '2026-02-27 23:10',
    sentCount30d: 2,
    relatedBugIds: ['BUG-1043'],
    tone: 'danger',
  },
  {
    id: 'BN-03',
    name: 'P0 电话升级 / SLA 超时播报',
    channel: 'phone',
    target: '值班电话（研发总监 + SRE）',
    events: ['bug.ack.timeout.15min', 'bug.sla.breached'],
    matchRule: "(priority = 'P0' && elapsedMinutes > 15) || slaLeftHours < 0",
    receiverIds: ['u-lin', 'u-meng'],
    template: '语音播报：{{bugId}} {{priority}} 缺陷 SLA 已超时 {{overHours}} 小时，阻塞发布门禁 {{gateId}}，需人工决策',
    ackTimeoutMin: 0,
    escalateToId: 'BN-04',
    silenceWindow: '无',
    enabled: true,
    lastSentAt: '2026-03-19 11:02',
    sentCount30d: 3,
    relatedBugIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049'],
    tone: 'danger',
  },
  {
    id: 'BN-04',
    name: '资损级全员广播',
    channel: 'lark-group',
    target: '飞书群「订单中心重构 · 全员」（含产品 / PMO / 安全）',
    events: ['bug.fund.loss', 'bug.prod.incident'],
    matchRule: "severity contains '资损' || envId = 'env-prod'",
    receiverIds: [
      'u-lin',
      'u-su',
      'u-yan',
      'u-zhou',
      'u-chen',
      'u-he',
      'u-meng',
      'u-gu',
      'u-shen',
    ],
    template:
      '【资损级】{{bugId}} 已在 {{envName}} 触发，理论日资损上限 {{lossCap}}，财务对账差异 {{diffCount}} 笔，已自动拉应急会议',
    ackTimeoutMin: 0,
    escalateToId: '',
    silenceWindow: '无',
    enabled: true,
    lastSentAt: '2026-02-27 23:06',
    sentCount30d: 1,
    relatedBugIds: ['BUG-1043'],
    tone: 'danger',
  },
  {
    id: 'BN-05',
    name: 'SLA 临期提醒（剩余 < 20%）',
    channel: 'lark-card',
    target: '处理人 + 报告人（动态）',
    events: ['bug.sla.warning', 'bug.blocked'],
    matchRule: 'slaLeftHours / slaHours < 0.2 && status != closed',
    receiverIds: ['u-shen', 'u-he'],
    template:
      '【临期】{{bugId}} SLA 剩余 {{slaLeft}}h（{{percent}}%），当前阻塞项 {{blocker}}，是否需要调整优先级或申请豁免？',
    ackTimeoutMin: 60,
    escalateToId: 'BN-03',
    silenceWindow: '22:00-08:00 顺延至次日 08:00',
    enabled: true,
    lastSentAt: '2026-03-19 08:40',
    sentCount30d: 11,
    relatedBugIds: ['BUG-1051', 'BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049'],
    tone: 'warn',
  },
  {
    id: 'BN-06',
    name: 'PingCode 缺陷状态回写',
    channel: 'webhook',
    target: 'PingCode 工作项评论 + 同步队列',
    events: ['bug.state.changed', 'bug.assignee.changed', 'bug.closed', 'bug.comment.added'],
    matchRule: 'all（全量事件回写，保持双系统单一事实源）',
    receiverIds: ['u-gu'],
    template:
      'POST /openapi/workitem/{{pcCode}}/comment：{{fromState}} → {{toState}}，操作人 {{actor}}，时间线 {{timelineId}}，同步队列 SYNC-0231',
    ackTimeoutMin: 0,
    escalateToId: '',
    silenceWindow: '无',
    enabled: true,
    lastSentAt: '2026-03-19 17:26',
    sentCount30d: 47,
    relatedBugIds: ['BUG-1045', 'BUG-1050', 'BUG-1055'],
    tone: 'info',
  },
  {
    id: 'BN-07',
    name: '安全合规缺陷专项通报',
    channel: 'email',
    target: 'security-review@artisan-tech.com（安全部门）',
    events: ['bug.security.found', 'bug.weekly.digest'],
    matchRule: "category = '安全合规' || gateId = 'G6'",
    receiverIds: ['u-he', 'u-gu', 'u-lin'],
    template:
      '安全合规缺陷通报：{{bugId}} {{title}}｜涉及字段 {{fields}}｜整改责任人 {{assignee}}｜G6 观测项 {{gateResult}}',
    ackTimeoutMin: 480,
    escalateToId: 'BN-08',
    silenceWindow: '仅工作日 09:00-19:00 发送',
    enabled: true,
    lastSentAt: '2026-03-19 10:20',
    sentCount30d: 4,
    relatedBugIds: ['BUG-1052', 'BUG-1054'],
    tone: 'danger',
  },
  {
    id: 'BN-08',
    name: '每日缺陷日报（P1-P3）',
    channel: 'lark-group',
    target: '飞书群「订单中心重构 · 质量作战室」',
    events: ['bug.daily.digest'],
    matchRule: "priority in ('P1','P2','P3') && status != 'closed'",
    receiverIds: ['u-he', 'u-gu', 'u-lin', 'u-zhou', 'u-su'],
    template:
      '【缺陷日报 {{date}}】未关闭 {{openCount}}（P0 {{p0}} / P1 {{p1}} / P2 {{p2}} / P3 {{p3}}），SLA 超时 {{slaBreached}}，发布阻断 {{releaseBlocking}}，今日新增 {{newCount}}',
    ackTimeoutMin: 0,
    escalateToId: '',
    silenceWindow: '每日 20:00 汇总一次',
    enabled: true,
    lastSentAt: '2026-03-18 20:00',
    sentCount30d: 22,
    relatedBugIds: ['BUG-1047', 'BUG-1048', 'BUG-1051', 'BUG-1052', 'BUG-1053', 'BUG-1054'],
    tone: 'neutral',
  },
  {
    id: 'BN-09',
    name: 'AI 根因报告待人工确认',
    channel: 'lark-card',
    target: '缺陷处理人个人',
    events: ['bug.ai.analysis.ready', 'bug.ai.confidence.low'],
    matchRule: 'aiAssist.confidence >= 60 && aiAssist.humanConfirmedBy = ""',
    receiverIds: ['u-zhou', 'u-shen'],
    template:
      '【AI 待确认】{{bugId}} 由 {{agentName}}（{{modelName}}）产出根因报告 {{analysisId}} v{{version}}，置信度 {{confidence}}%，请在 {{ackTimeout}} 分钟内确认或驳回',
    ackTimeoutMin: 240,
    escalateToId: 'BN-08',
    silenceWindow: '22:00-08:00 合并推送',
    enabled: true,
    lastSentAt: '2026-03-19 17:26',
    sentCount30d: 9,
    relatedBugIds: ['BUG-1045', 'BUG-1048', 'BUG-1053'],
    tone: 'ai',
  },
];

export const BUG_NOTIFY_MAP: Record<string, BugNotifyDef> = Object.fromEntries(
  BUG_NOTIFY.map((n) => [n.id, n]),
);

/** 缺陷通知发送记录（与 BUG_TIMELINE 事件一一咬合） */
export interface BugNotifyLogDef {
  id: string;
  notifyId: string;
  bugId: string;
  event: string;
  time: string;
  title: string;
  receivers: string[];
  channel: DeployNotifyDef['channel'];
  result: 'sent' | 'acked' | 'merged' | 'failed' | 'escalated';
  ackBy: string;
  ackAt: string;
  /** 对应 BUG_TIMELINE 事件 id */
  timelineId: string;
  refIds: string[];
}

export const BUG_NOTIFY_LOGS: BugNotifyLogDef[] = [
  {
    id: 'BNL-01',
    notifyId: 'BN-01',
    bugId: 'BUG-1043',
    event: 'bug.created',
    time: '2026-02-27 23:05',
    title: '【P0缺陷】BUG-1043 券 + 满减 + 会员价三重叠加分摊尾差 0.01 元，导致资损',
    receivers: ['u-zhou', 'u-he', 'u-meng'],
    channel: 'lark-card',
    result: 'escalated',
    ackBy: '',
    ackAt: '',
    timelineId: 'BT-001',
    refIds: ['REL-2402', 'env-prod', 'SLA-P0'],
  },
  {
    id: 'BNL-02',
    notifyId: 'BN-04',
    bugId: 'BUG-1043',
    event: 'bug.fund.loss',
    time: '2026-02-27 23:06',
    title: '【资损级】BUG-1043 已在生产环境触发，理论日资损上限 4,200 元，财务对账差异 3 笔',
    receivers: ['u-lin', 'u-su', 'u-yan', 'u-zhou', 'u-chen', 'u-he', 'u-meng', 'u-gu', 'u-shen'],
    channel: 'lark-group',
    result: 'sent',
    ackBy: 'u-lin',
    ackAt: '2026-02-27 23:18',
    timelineId: 'BT-001',
    refIds: ['REQ-2403', 'REL-2402'],
  },
  {
    id: 'BNL-03',
    notifyId: 'BN-02',
    bugId: 'BUG-1043',
    event: 'bug.ack.timeout',
    time: '2026-02-27 23:10',
    title: '【升级】BUG-1043 建单已 5 分钟无人接单，严重度 资损级（致命）',
    receivers: ['u-yan', 'u-he'],
    channel: 'sms',
    result: 'acked',
    ackBy: 'u-zhou',
    ackAt: '2026-02-27 23:20',
    timelineId: 'BT-002',
    refIds: ['SLA-P0', 'DN-04'],
  },
  {
    id: 'BNL-04',
    notifyId: 'BN-09',
    bugId: 'BUG-1043',
    event: 'bug.ai.analysis.ready',
    time: '2026-02-27 23:12',
    title: '【AI 待确认】评审 Agent（mdl-claude）38 秒定位 AmountAllocator#allocate 第 47 行，置信度 94%',
    receivers: ['u-zhou'],
    channel: 'lark-card',
    result: 'acked',
    ackBy: 'u-zhou',
    ackAt: '2026-02-28 09:30',
    timelineId: 'BT-003',
    refIds: ['mdl-claude', 'ag-review', 'MR-2410'],
  },
  {
    id: 'BNL-05',
    notifyId: 'BN-03',
    bugId: 'BUG-1043',
    event: 'bug.sla.breached',
    time: '2026-02-28 23:05',
    title: '语音播报：BUG-1043 P0 缺陷 SLA 已超时（24h 到期未关闭），阻塞发布门禁 G4',
    receivers: ['u-lin', 'u-meng'],
    channel: 'phone',
    result: 'acked',
    ackBy: 'u-lin',
    ackAt: '2026-03-01 08:42',
    timelineId: '',
    refIds: ['SLA-P0', 'G4', 'DN-05'],
  },
  {
    id: 'BNL-06',
    notifyId: 'BN-05',
    bugId: 'BUG-1043',
    event: 'bug.blocked',
    time: '2026-03-15 09:58',
    title: '【临期→超时】BUG-1043 阻塞项：PIPE-2407 覆盖率 68.2% < 85%，MR-2410 无法合并',
    receivers: ['u-zhou', 'u-meng'],
    channel: 'lark-card',
    result: 'sent',
    ackBy: 'u-zhou',
    ackAt: '2026-03-15 10:31',
    timelineId: 'BT-005',
    refIds: ['PIPE-2407', 'G3', 'DN-02'],
  },
  {
    id: 'BNL-07',
    notifyId: 'BN-09',
    bugId: 'BUG-1043',
    event: 'bug.ai.analysis.ready',
    time: '2026-03-18 08:40',
    title: '【AI 待确认】BUG-1043 根因报告 BA-1043 v1.3（含 5-Why 与 3 套修复方案）已产出，待人工审批',
    receivers: ['u-zhou', 'u-yan'],
    channel: 'lark-card',
    result: 'acked',
    ackBy: 'u-zhou',
    ackAt: '2026-03-18 09:12',
    timelineId: 'BT-006',
    refIds: ['BA-1043', 'KB-CODE-02'],
  },
  {
    id: 'BNL-08',
    notifyId: 'BN-06',
    bugId: 'BUG-1043',
    event: 'bug.state.changed',
    time: '2026-03-19 16:08',
    title: '回写 PingCode：BUG-1043 fixing（复检后 must-fix 3→1，覆盖率 71.4% 仍未达标）',
    receivers: ['u-gu'],
    channel: 'webhook',
    result: 'sent',
    ackBy: '',
    ackAt: '',
    timelineId: 'BT-007',
    refIds: ['MR-2410', 'PIPE-2409', 'SYNC-0231'],
  },
  {
    id: 'BNL-09',
    notifyId: 'BN-01',
    bugId: 'BUG-1046',
    event: 'bug.created',
    time: '2026-03-11 10:40',
    title: '【P0缺陷】BUG-1046 50 并发下 PAID → CANCELLED 非法跃迁，订单状态被覆盖',
    receivers: ['u-zhou', 'u-he'],
    channel: 'lark-card',
    result: 'acked',
    ackBy: 'u-zhou',
    ackAt: '2026-03-11 10:52',
    timelineId: 'BT-012',
    refIds: ['TC-007', 'REQ-2402'],
  },
  {
    id: 'BNL-10',
    notifyId: 'BN-03',
    bugId: 'BUG-1046',
    event: 'bug.sla.breached',
    time: '2026-03-19 11:02',
    title: '语音播报：BUG-1046 SLA 超时 198 小时，G3 门禁失败阻塞 MR-2406 合并，需人工决策',
    receivers: ['u-lin', 'u-meng'],
    channel: 'phone',
    result: 'acked',
    ackBy: 'u-lin',
    ackAt: '2026-03-19 11:26',
    timelineId: 'BT-015',
    refIds: ['PIPE-2409', 'G3', 'DN-04'],
  },
  {
    id: 'BNL-11',
    notifyId: 'BN-06',
    bugId: 'BUG-1050',
    event: 'bug.closed',
    time: '2026-03-15 10:05',
    title: '回写 PingCode：BUG-1050 verifying → closed，TC-019 重跑通过，修复耗时 22.75h（SLA 内）',
    receivers: ['u-gu'],
    channel: 'webhook',
    result: 'sent',
    ackBy: '',
    ackAt: '',
    timelineId: 'BT-030',
    refIds: ['TC-019', 'tm-migrate'],
  },
  {
    id: 'BNL-12',
    notifyId: 'BN-09',
    bugId: 'BUG-1051',
    event: 'bug.ai.analysis.ready',
    time: '2026-03-16 09:10',
    title: '【AI 待确认】评审 Agent 关联 KB-OPS-01 分布式锁规范给出看门狗续期改法（mdl-local，数据不出域）',
    receivers: ['u-shen', 'u-meng'],
    channel: 'lark-card',
    result: 'acked',
    ackBy: 'u-meng',
    ackAt: '2026-03-16 09:22',
    timelineId: 'BT-032',
    refIds: ['mdl-local', 'EGRESS-MASK', 'KB-OPS-01'],
  },
  {
    id: 'BNL-13',
    notifyId: 'BN-05',
    bugId: 'BUG-1051',
    event: 'bug.sla.warning',
    time: '2026-03-19 08:40',
    title: '【临期】BUG-1051 SLA 剩余 21h（17.5%），阻塞项 BLOCK-0312 环境占用，复验排至 03-20 上午',
    receivers: ['u-shen', 'u-he'],
    channel: 'lark-card',
    result: 'acked',
    ackBy: 'u-he',
    ackAt: '2026-03-19 09:05',
    timelineId: 'BT-035',
    refIds: ['BLOCK-0312', 'TP-03', 'SLA-P2'],
  },
  {
    id: 'BNL-14',
    notifyId: 'BN-07',
    bugId: 'BUG-1054',
    event: 'bug.security.found',
    time: '2026-03-19 10:20',
    title: '安全合规缺陷通报：BUG-1054 导出 CSV addressDetail 明文，违反 SEC-MASK-2.1，G6 观测项不通过',
    receivers: ['u-he', 'u-gu', 'u-lin'],
    channel: 'email',
    result: 'sent',
    ackBy: 'u-he',
    ackAt: '2026-03-19 10:15',
    timelineId: 'BT-043',
    refIds: ['SEC-MASK-2.1', 'TASK-2423', 'G6'],
  },
  {
    id: 'BNL-15',
    notifyId: 'BN-09',
    bugId: 'BUG-1053',
    event: 'bug.ai.confidence.low',
    time: '2026-03-18 23:05',
    title: '【AI 低置信】运维 Agent（mdl-gpt5）分析堆快照置信度仅 64%，标记「需人工验证」，建议补采 GC 日志',
    receivers: ['u-zhou'],
    channel: 'lark-card',
    result: 'sent',
    ackBy: '',
    ackAt: '',
    timelineId: 'BT-039',
    refIds: ['mdl-gpt5', 'TP-03'],
  },
  {
    id: 'BNL-16',
    notifyId: 'BN-06',
    bugId: 'BUG-1045',
    event: 'bug.state.changed',
    time: '2026-03-19 17:26',
    title: '回写 PingCode：BUG-1045 analyzing（BA-1045 v0.8 待确认，预计覆盖率 +9.2pt，尚未建分支）',
    receivers: ['u-gu'],
    channel: 'webhook',
    result: 'sent',
    ackBy: '',
    ackAt: '',
    timelineId: 'BT-011',
    refIds: ['BA-1045', 'MR-2403'],
  },
  {
    id: 'BNL-17',
    notifyId: 'BN-08',
    bugId: '',
    event: 'bug.daily.digest',
    time: '2026-03-18 20:00',
    title: '【缺陷日报 03-18】未关闭 11（P0 4 / P1 3 / P2 4 / P3 0），SLA 超时 3，发布阻断 7，今日新增 3',
    receivers: ['u-he', 'u-gu', 'u-lin', 'u-zhou', 'u-su'],
    channel: 'lark-group',
    result: 'merged',
    ackBy: '',
    ackAt: '',
    timelineId: '',
    refIds: ['BUG-1047', 'BUG-1048', 'BUG-1053'],
  },
];

/** 成员个人订阅偏好（Bug 流转页「我的订阅」抽屉） */
export interface BugWatchSubDef {
  userId: string;
  watchScope: string[];
  priorities: ('P0' | 'P1' | 'P2' | 'P3')[];
  channels: DeployNotifyDef['channel'][];
  quietHours: string;
  dailyDigest: boolean;
  weeklyDigest: boolean;
  /** 是否接受 AI 自动派单（未接单时按技能匹配自动指派） */
  autoAssign: boolean;
  watchingBugIds: string[];
  lastChangedAt: string;
}

export const BUG_WATCH_SUBS: BugWatchSubDef[] = [
  {
    userId: 'u-lin',
    watchScope: ['全部 P0', '资损级', 'SLA 超时', '发布阻断项'],
    priorities: ['P0'],
    channels: ['phone', 'lark-card', 'lark-group'],
    quietHours: '不静默（P0 电话通道 7x24）',
    dailyDigest: true,
    weeklyDigest: true,
    autoAssign: false,
    watchingBugIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049', 'BUG-1052'],
    lastChangedAt: '2026-03-01 09:12',
  },
  {
    userId: 'u-su',
    watchScope: ['与 REQ-2403 / REQ-2408 相关的缺陷', '资损级广播'],
    priorities: ['P0', 'P1'],
    channels: ['lark-group', 'lark-card'],
    quietHours: '20:00-09:00',
    dailyDigest: true,
    weeklyDigest: true,
    autoAssign: false,
    watchingBugIds: ['BUG-1043', 'BUG-1052'],
    lastChangedAt: '2026-02-28 14:05',
  },
  {
    userId: 'u-yan',
    watchScope: ['架构类缺陷（缓存 / 消息 / 分片）', 'P0 升级'],
    priorities: ['P0', 'P1'],
    channels: ['sms', 'lark-card'],
    quietHours: '23:00-07:00（P0 短信除外）',
    dailyDigest: false,
    weeklyDigest: true,
    autoAssign: true,
    watchingBugIds: ['BUG-1047', 'BUG-1048', 'BUG-1049'],
    lastChangedAt: '2026-03-06 11:30',
  },
  {
    userId: 'u-zhou',
    watchScope: ['指派给我的缺陷', '订单创建 / 状态机 / 促销分摊模块'],
    priorities: ['P0', 'P1', 'P2', 'P3'],
    channels: ['lark-card', 'phone'],
    quietHours: '22:00-08:00（P0 除外）',
    dailyDigest: true,
    weeklyDigest: false,
    autoAssign: true,
    watchingBugIds: ['BUG-1043', 'BUG-1046', 'BUG-1052', 'BUG-1053', 'BUG-1055'],
    lastChangedAt: '2026-03-11 09:40',
  },
  {
    userId: 'u-chen',
    watchScope: ['指派给我的缺陷', '前端 / 导出脱敏相关'],
    priorities: ['P1', 'P2'],
    channels: ['lark-card'],
    quietHours: '22:00-09:00',
    dailyDigest: true,
    weeklyDigest: false,
    autoAssign: true,
    watchingBugIds: ['BUG-1054'],
    lastChangedAt: '2026-03-19 09:55',
  },
  {
    userId: 'u-he',
    watchScope: ['全部缺陷（测试负责人）', '验证待办', 'SLA 临期'],
    priorities: ['P0', 'P1', 'P2', 'P3'],
    channels: ['lark-card', 'lark-group', 'sms'],
    quietHours: '不静默',
    dailyDigest: true,
    weeklyDigest: true,
    autoAssign: false,
    watchingBugIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1050', 'BUG-1051', 'BUG-1052', 'BUG-1054'],
    lastChangedAt: '2026-03-02 08:20',
  },
  {
    userId: 'u-meng',
    watchScope: ['生产环境缺陷', '性能 / 稳定性', '值班升级'],
    priorities: ['P0', 'P1'],
    channels: ['sms', 'phone', 'lark-card'],
    quietHours: '不静默（值班期间）',
    dailyDigest: true,
    weeklyDigest: true,
    autoAssign: true,
    watchingBugIds: ['BUG-1043', 'BUG-1047', 'BUG-1049', 'BUG-1051', 'BUG-1053', 'BUG-1055'],
    lastChangedAt: '2026-03-08 21:15',
  },
  {
    userId: 'u-gu',
    watchScope: ['全部状态流转（PingCode 回写）', '发布阻断项', '迭代风险'],
    priorities: ['P0', 'P1', 'P2'],
    channels: ['webhook', 'lark-group', 'email'],
    quietHours: '20:00-08:00',
    dailyDigest: true,
    weeklyDigest: true,
    autoAssign: false,
    watchingBugIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1047', 'BUG-1048', 'BUG-1049', 'BUG-1053'],
    lastChangedAt: '2026-03-04 10:08',
  },
  {
    userId: 'u-shen',
    watchScope: ['指派给我的缺陷', '一致性 / 消息 / 迁移模块'],
    priorities: ['P0', 'P1', 'P2'],
    channels: ['lark-card'],
    quietHours: '22:00-08:00',
    dailyDigest: true,
    weeklyDigest: false,
    autoAssign: true,
    watchingBugIds: ['BUG-1048', 'BUG-1049', 'BUG-1050', 'BUG-1051'],
    lastChangedAt: '2026-03-12 16:20',
  },
  {
    userId: 'u-ai-copilot',
    watchScope: ['全部缺陷（Agent 只读订阅，用于自动分析与派单建议）'],
    priorities: ['P0', 'P1', 'P2', 'P3'],
    channels: ['webhook'],
    quietHours: '无',
    dailyDigest: false,
    weeklyDigest: false,
    autoAssign: false,
    watchingBugIds: [
      'BUG-1043',
      'BUG-1045',
      'BUG-1046',
      'BUG-1047',
      'BUG-1048',
      'BUG-1049',
      'BUG-1050',
      'BUG-1051',
      'BUG-1052',
      'BUG-1053',
      'BUG-1054',
      'BUG-1055',
    ],
    lastChangedAt: '2026-02-20 10:00',
  },
];

/** 通知效果统计（供「订阅中心」页展示降噪与触达质量） */
export const BUG_NOTIFY_STATS = {
  ruleTotal: 9,
  ruleEnabled: 9,
  sent30d: 103,
  byChannel30d: {
    'lark-card': 27,
    'lark-group': 23,
    webhook: 47,
    sms: 2,
    phone: 3,
    email: 4,
  },
  ackedCount: 9,
  ackRate: 81.8,
  avgAckMinutesP0: 12.6,
  avgAckMinutesAll: 168.4,
  escalatedCount: 3,
  escalateIds: ['BNL-01', 'BNL-03', 'BNL-10'],
  mergedCount: 26,
  mergeRate: 25.2,
  failedCount: 0,
  slaBreachNotifiedIds: ['BUG-1043', 'BUG-1045', 'BUG-1046', 'BUG-1049'],
  pingcodeWritebackCount: 47,
  pingcodeWritebackFail: 0,
  noisiestRuleId: 'BN-06',
  quietestRuleId: 'BN-04',
  insight:
    '47 条状态流转全部回写 PingCode 且 0 失败（SYNC-0231 队列积压 0）；BN-03 电话升级 30 天内触发 3 次，其中 2 次由 G3 门禁失败引起，属可预防升级。',
  advice:
    '建议把 BN-01 的 P1 部分改为日报聚合（预计降噪 18%），并为 BN-03 增加「门禁失败已知问题」抑制窗口，避免同一根因重复电话打扰。',
};

/* ============================================================
 * 20. 总览驾驶舱聚合视图（overview 页）
 * ============================================================ */

/** 指标环比方向 */
export type MetricDeltaDir = 'up' | 'down';

/** 驾驶舱顶部指标卡 */
export interface OverviewMetricDef {
  /** 指标 id */
  id: string;
  /** 指标名称 */
  name: string;
  /** 指标值（已格式化，便于直接展示） */
  value: string;
  /** 单位 */
  unit: string;
  /** 环比变化幅度 */
  delta: number;
  /** 环比方向：up 上升 / down 下降 */
  deltaDir: MetricDeltaDir;
  /** 语义色 */
  tone: Tone;
  /** 近 7 个周期的迷你趋势数据点 */
  spark: number[];
  /** 补充说明 */
  hint: string;
}

/**
 * 驾驶舱顶部 6 张指标卡
 * 口径来源：deliveredTasks ← TASKS（released / deployed）、aiAcceptRate ← modelStats.overallAcceptRate、
 * buildPassRate ← PIPELINE_RUNS（success 占比）、releaseSuccessRate ← RELEASE_ORDERS（released 占比）、
 * openDefects ← BUG_STATS.open、tokenCost ← modelStats.totalCost
 */
export const overviewMetrics: OverviewMetricDef[] = [
  {
    id: 'deliveredTasks',
    name: '本周交付任务数',
    value: '5',
    unit: '个',
    delta: 2.0,
    deltaDir: 'up',
    tone: 'ok',
    spark: [1, 2, 2, 3, 3, 3, 5],
    hint: '已发布 1 个（TASK-2402）+ 已部署 4 个（TASK-2404 / 2413 / 2417 / 2418），较上周多交付 2 个',
  },
  {
    id: 'aiAcceptRate',
    name: 'AI 代码采纳率',
    value: '78.2',
    unit: '%',
    delta: 1.7,
    deltaDir: 'up',
    tone: 'ai',
    spark: [74.2, 75.1, 75.8, 76.4, 77.0, 76.5, 78.2],
    hint: '近 7 日 18,420 次模型调用的整体采纳率，GPT-5 单模型最高 88.3%、私有化 Llama3-70B 最低 71.5%',
  },
  {
    id: 'buildPassRate',
    name: '构建通过率',
    value: '60',
    unit: '%',
    delta: -10.0,
    deltaDir: 'down',
    tone: 'warn',
    spark: [100, 100, 85.7, 80, 75, 70, 60],
    hint: '近 10 次流水线 6 成功 4 失败（PIPE-2407~2410），失败全部卡在 G3 覆盖率门禁',
  },
  {
    id: 'releaseSuccessRate',
    name: '发布成功率',
    value: '66.7',
    unit: '%',
    delta: -33.3,
    deltaDir: 'down',
    tone: 'danger',
    spark: [100, 100, 100, 100, 100, 100, 66.7],
    hint: '3 张发布单中 REL-2401 / REL-2402 成功上线，REL-2403 因 G3 / G4 双门禁被阻塞',
  },
  {
    id: 'openDefects',
    name: '在线缺陷数',
    value: '10',
    unit: '个',
    delta: 3.0,
    deltaDir: 'up',
    tone: 'danger',
    spark: [5, 6, 6, 7, 8, 7, 10],
    hint: '未关闭 10 个，其中 P0 未关闭 4 个（BUG-1043 / 1045 / 1046 / 1049）全部阻塞 G4 门禁',
  },
  {
    id: 'tokenCost',
    name: 'AI Token 成本',
    value: '1286.4',
    unit: '元',
    delta: 6.4,
    deltaDir: 'up',
    tone: 'info',
    spark: [1024, 1068, 1105, 1142, 1178, 1209, 1286.4],
    hint: '近 7 日消耗 96,240K tokens，Claude 3.7 Sonnet 独占 865.2 元（67.3%），私有化模型仅 2.24 元',
  },
];

/** 待办事项类型 */
export type TodoType = '发布' | '缺陷' | '评审' | '阻塞' | '需求' | '门禁' | '迭代';

/** 我的待办（默认角色 manager / 林知远的视角） */
export interface MyTodoDef {
  /** 待办 id */
  id: string;
  /** 待办标题 */
  title: string;
  /** 待办分类 */
  type: TodoType;
  /** 语义色 */
  tone: Tone;
  /** 关联业务对象 id（真实存在于 TASKS / REQUIREMENTS / BUGS / GATES / RELEASE_ORDERS） */
  refId: string;
  /** 期望完成时间 */
  due: string;
  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2';
}

/** 我的待办清单（8 条，refId 均可下钻到对应业务对象） */
export const myTodos: MyTodoDef[] = [
  {
    id: 'td-2401',
    title: '确认 REL-2403 生产切流窗口：G3 覆盖率与 BLOCK-0312 双阻塞待决',
    type: '发布',
    tone: 'danger',
    refId: 'REL-2403',
    due: '2026-03-20',
    priority: 'P0',
  },
  {
    id: 'td-2402',
    title: 'BUG-1043 金额精度：MR-2410 仍有 1 条 must-fix（负向分摊余数）未处理',
    type: '缺陷',
    tone: 'danger',
    refId: 'BUG-1043',
    due: '2026-03-19',
    priority: 'P0',
  },
  {
    id: 'td-2403',
    title: 'TASK-2419 历史订单迁移因 BLOCK-0312 无数据库窗口，已挂起 7 天',
    type: '阻塞',
    tone: 'danger',
    refId: 'TASK-2419',
    due: '2026-03-24',
    priority: 'P0',
  },
  {
    id: 'td-2404',
    title: 'G3 编码门禁失败：PIPE-2409 单测覆盖率 71.4%，低于 85% 阈值',
    type: '门禁',
    tone: 'warn',
    refId: 'G3',
    due: '2026-03-20',
    priority: 'P0',
  },
  {
    id: 'td-2405',
    title: 'BUG-1049 outbox 并发重试导致事件乱序，下游状态回退待修复',
    type: '缺陷',
    tone: 'warn',
    refId: 'BUG-1049',
    due: '2026-03-22',
    priority: 'P0',
  },
  {
    id: 'td-2406',
    title: 'TASK-2415 拆单引擎聚合根边界存在两种切法，待架构师严慕舟确认',
    type: '评审',
    tone: 'warn',
    refId: 'TASK-2415',
    due: '2026-03-21',
    priority: 'P1',
  },
  {
    id: 'td-2407',
    title: 'REQ-2408 订单数据合规需求待评审（依赖统一脱敏组件 SEC-MASK-2.1 接入）',
    type: '需求',
    tone: 'info',
    refId: 'REQ-2408',
    due: '2026-03-23',
    priority: 'P2',
  },
  {
    id: 'td-2408',
    title: 'Sprint 24 收尾：为 REQ-2405 拆单能力补齐 PingCode 子任务映射',
    type: '迭代',
    tone: 'brand',
    refId: 'REQ-2405',
    due: '2026-03-27',
    priority: 'P1',
  },
];

/** 事件目标类型 */
export type EventTargetType = 'task' | 'requirement' | 'bug' | 'gate' | 'release' | 'pipeline';

/** 通知渠道（与部署 / 缺陷通知的渠道枚举保持一致） */
export type NotifyChannel = 'lark-card' | 'lark-group' | 'webhook' | 'sms' | 'phone' | 'email';

/** 驾驶舱实时动态流事件 */
export interface RecentEventDef {
  /** 事件 id */
  id: string;
  /** 发生时间 */
  time: string;
  /** 触发主体名称（人 / AI 智能体 / 系统） */
  actor: string;
  /** 触发主体语义色 */
  actorTone: Tone;
  /** 动作摘要 */
  action: string;
  /** 变更前状态 */
  from: string;
  /** 变更后状态 */
  to: string;
  /** 目标对象类型 */
  targetType: EventTargetType;
  /** 目标对象 id */
  targetId: string;
  /** 目标对象标题 */
  targetTitle: string;
  /** 溯源 id，串联 TASK_EVENTS（TE-xxx）与 BUG_TIMELINE（BT-xxx） */
  traceId: string;
  /** 触达渠道 */
  channel: NotifyChannel;
}

/** 驾驶舱实时动态流（12 条，按时间倒序，traceId 可回溯到任务事件 / 缺陷时间线） */
export const recentEvents: RecentEventDef[] = [
  {
    id: 'ev-2412',
    time: '2026-03-19 18:05',
    actor: '林知远',
    actorTone: 'brand',
    action: '决策：先补 G3 门禁覆盖率，再谈切流窗口',
    from: 'blocked',
    to: 'blocked',
    targetType: 'release',
    targetId: 'REL-2403',
    targetTitle: '订单中心重构生产切流：新分片集群读写切换',
    traceId: 'TE-030',
    channel: 'lark-card',
  },
  {
    id: 'ev-2411',
    time: '2026-03-19 17:52',
    actor: '孟星回',
    actorTone: 'warn',
    action: '建议 1% 灰度顺延至 03-26、全量切流顺延至 04-02',
    from: 'blocked',
    to: 'blocked',
    targetType: 'release',
    targetId: 'REL-2403',
    targetTitle: '订单中心重构生产切流：新分片集群读写切换',
    traceId: 'TE-029',
    channel: 'lark-group',
  },
  {
    id: 'ev-2410',
    time: '2026-03-19 17:50',
    actor: 'Artisan Copilot',
    actorTone: 'ai',
    action: '发布门禁预检失败（6 项通过 4 项）',
    from: 'pending',
    to: 'failed',
    targetType: 'gate',
    targetId: 'G5',
    targetTitle: '发布门禁',
    traceId: 'TE-028',
    channel: 'webhook',
  },
  {
    id: 'ev-2409',
    time: '2026-03-19 16:08',
    actor: 'Artisan Copilot',
    actorTone: 'ai',
    action: 'MR-2410 第 2 轮复检：must-fix 由 3 条降至 1 条',
    from: 'fixing',
    to: 'fixing',
    targetType: 'bug',
    targetId: 'BUG-1043',
    targetTitle: '券 + 满减 + 会员价三重叠加时分摊尾差 0.01 元，导致资损',
    traceId: 'BT-007',
    channel: 'lark-card',
  },
  {
    id: 'ev-2408',
    time: '2026-03-19 16:08',
    actor: '孟星回',
    actorTone: 'warn',
    action: '回写 PingCode：BUG-1043 订正为 fixing，覆盖率仍 71.4%',
    from: 'fixing',
    to: 'fixing',
    targetType: 'bug',
    targetId: 'BUG-1043',
    targetTitle: '券 + 满减 + 会员价三重叠加时分摊尾差 0.01 元，导致资损',
    traceId: 'BT-007',
    channel: 'webhook',
  },
  {
    id: 'ev-2407',
    time: '2026-03-19 11:20',
    actor: 'Artisan Copilot',
    actorTone: 'ai',
    action: 'TASK-2415 聚合根边界无法自决，待架构师确认',
    from: 'refined',
    to: 'taskCreated',
    targetType: 'task',
    targetId: 'TASK-2415',
    targetTitle: '拆单引擎规则实现（商家/仓库/类目/重量）',
    traceId: 'TE-023',
    channel: 'lark-card',
  },
  {
    id: 'ev-2406',
    time: '2026-03-19 09:02',
    actor: '系统',
    actorTone: 'info',
    action: '阻塞信息同步至 PingCode（SYNC-0231，耗时 1.2s）',
    from: 'dev',
    to: 'dev',
    targetType: 'task',
    targetId: 'TASK-2419',
    targetTitle: '历史订单全量迁移作业（断点续传）',
    traceId: 'TE-027',
    channel: 'webhook',
  },
  {
    id: 'ev-2405',
    time: '2026-03-19 08:55',
    actor: 'Artisan Copilot',
    actorTone: 'ai',
    action: '阻塞 BLOCK-0312 超 SLA（7 天 > 4 天），升级至研发总监',
    from: 'dev',
    to: 'dev',
    targetType: 'task',
    targetId: 'TASK-2419',
    targetTitle: '历史订单全量迁移作业（断点续传）',
    traceId: 'TE-026',
    channel: 'lark-card',
  },
  {
    id: 'ev-2404',
    time: '2026-03-18 18:31',
    actor: 'Artisan Copilot',
    actorTone: 'ai',
    action: '检测到资源冲突 GANTT-CF-03（周浩然日负载 13.5 小时）',
    from: 'dev',
    to: 'dev',
    targetType: 'task',
    targetId: 'TASK-2412',
    targetTitle: 'Redis 7 多级缓存与 binlog 失效一致性',
    traceId: 'TE-020',
    channel: 'webhook',
  },
  {
    id: 'ev-2403',
    time: '2026-03-18 15:22',
    actor: '周浩然',
    actorTone: 'info',
    action: 'TASK-2401 本地单测与静态检查全绿',
    from: 'dev',
    to: 'testGreen',
    targetType: 'task',
    targetId: 'TASK-2401',
    targetTitle: '幂等下单接口改造：Idempotency-Key 两级校验',
    traceId: 'TE-006',
    channel: 'webhook',
  },
  {
    id: 'ev-2402',
    time: '2026-03-13 17:26',
    actor: '严慕舟',
    actorTone: 'indigo',
    action: '订单号基因分片方案评审通过，MR-2413 合并',
    from: 'testGreen',
    to: 'deployed',
    targetType: 'task',
    targetId: 'TASK-2413',
    targetTitle: '订单号基因分片与分库分表路由改造',
    traceId: 'TE-021',
    channel: 'webhook',
  },
  {
    id: 'ev-2401',
    time: '2026-03-12 09:00',
    actor: '系统',
    actorTone: 'danger',
    action: '阻塞单 BLOCK-0312 创建（DBA 未批复生产迁移窗口）',
    from: 'dev',
    to: 'dev',
    targetType: 'task',
    targetId: 'TASK-2419',
    targetTitle: '历史订单全量迁移作业（断点续传）',
    traceId: 'TE-025',
    channel: 'sms',
  },
];

/* ============================================================
 * 21. 效能报表维度数据中心（insight 页）
 * ============================================================ */

/** 报表时间范围 id */
export type EfficiencyRangeId = '7d' | '30d' | 'quarter';

/** 报表统计维度 id */
export type EfficiencyDimensionId = 'project' | 'team' | 'person';

/** 时间范围定义 */
export interface EfficiencyRangeDef {
  id: EfficiencyRangeId;
  name: string;
  /** 区间说明（日期落在 2026-03） */
  note: string;
}

/** 统计维度定义 */
export interface EfficiencyDimensionDef {
  id: EfficiencyDimensionId;
  name: string;
}

/** 单个效能指标 */
export interface EfficiencyMetricDef {
  /** 指标名称 */
  label: string;
  /** 指标值（已格式化，便于直接展示） */
  value: string;
  /** 单位 */
  unit: string;
  /** 环比变化幅度（%） */
  delta: number;
  /** 环比方向 */
  deltaDir: MetricDeltaDir;
  /** 语义色 */
  tone: Tone;
}

/** 效能榜单条目 */
export interface EfficiencyRankItemDef {
  /** 名次 */
  rank: number;
  /** 主体名称（人 / 团队） */
  name: string;
  /** 副标题（组织或关联需求） */
  sub: string;
  /** 榜单数值 */
  value: string;
  /** 语义色 */
  tone: Tone;
}

/** 某一「时间范围 × 统计维度」下的效能快照 */
export interface EfficiencySnapshot {
  /** 交付效率指标组 */
  delivery: EfficiencyMetricDef[];
  /** 缺陷密度指标组 */
  defectDensity: EfficiencyMetricDef[];
  /** 发布节奏指标组 */
  release: EfficiencyMetricDef[];
  /** AI 增效指标组 */
  ai: EfficiencyMetricDef[];
  /** 交付榜 */
  topDelivery: EfficiencyRankItemDef[];
  /** 缺陷榜 */
  topDefect: EfficiencyRankItemDef[];
}

/** 效能报表总数据集：3 个时间范围 × 3 个统计维度 = 9 个快照全量提供 */
export interface EfficiencyDataDef {
  ranges: EfficiencyRangeDef[];
  dimensions: EfficiencyDimensionDef[];
  /** rangeId → dimId → 效能快照 */
  data: Record<EfficiencyRangeId, Record<EfficiencyDimensionId, EfficiencySnapshot>>;
}

/** 效能报表数据（覆盖 7d/30d/quarter × project/team/person） */
export const efficiencyData: EfficiencyDataDef = {
  ranges: [
    { id: '7d', name: '近 7 天', note: '2026-03-13 ~ 2026-03-19' },
    { id: '30d', name: '近 30 天', note: '2026-02-18 ~ 2026-03-19' },
    { id: 'quarter', name: '本季度', note: '2026-01-01 ~ 2026-03-31' },
  ],
  dimensions: [
    { id: 'project', name: '项目维度' },
    { id: 'team', name: '团队维度' },
    { id: 'person', name: '个人维度' },
  ],
  data: {
    '7d': {
      project: {
        delivery: [
          { label: '迭代吞吐', value: '12', unit: 'SP', delta: 9.1, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '8.6', unit: '天', delta: -0.8, deltaDir: 'down', tone: 'ok' },
          { label: '在制品（WIP）', value: '14', unit: '项', delta: 0, deltaDir: 'up', tone: 'neutral' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.42', unit: '个/KLOC', delta: -12.5, deltaDir: 'down', tone: 'ok' },
          { label: 'P0 缺陷占比', value: '25.0', unit: '%', delta: -8.3, deltaDir: 'down', tone: 'warn' },
          { label: '平均修复时长', value: '38.2', unit: 'h', delta: -7.9, deltaDir: 'down', tone: 'info' },
        ],
        release: [
          { label: '发布频次', value: '0', unit: '次', delta: -100, deltaDir: 'down', tone: 'danger' },
          { label: '发布成功率', value: '0', unit: '%', delta: -66.7, deltaDir: 'down', tone: 'danger' },
          { label: '平均 RTO', value: '—', unit: 'min', delta: 0, deltaDir: 'down', tone: 'neutral' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '78', unit: '%', delta: 2, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '80.1', unit: '%', delta: 1.7, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '66.7', unit: '%', delta: 0, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '76.4', unit: '%', delta: 2.4, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '1840', unit: 'ms', delta: -3.4, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '1286.4', unit: '元', delta: 6.4, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '周浩然', sub: '订单中心研发组', value: '5 SP', tone: 'info' },
          { rank: 2, name: '沈亦白', sub: '订单中心研发组', value: '4 SP', tone: 'slate' },
          { rank: 3, name: 'Artisan Copilot', sub: 'AI 工程平台', value: '3 SP', tone: 'ai' },
          { rank: 4, name: '陈屿', sub: '交易中台前端组', value: '2 SP', tone: 'teal' },
          { rank: 5, name: '孟星回', sub: '基础平台部', value: '1 SP', tone: 'warn' },
        ],
        topDefect: [
          { rank: 1, name: '优惠分摊精度', sub: 'REQ-2403 · 1 个缺陷', value: '1', tone: 'danger' },
          { rank: 2, name: '订单查询性能', sub: 'REQ-2404 · 1 个缺陷', value: '1', tone: 'warn' },
          { rank: 3, name: '一致性与可靠投递', sub: 'REQ-2406 · 1 个缺陷', value: '1', tone: 'info' },
          { rank: 4, name: '状态机流转与审计', sub: 'REQ-2402 · 1 个缺陷', value: '1', tone: 'slate' },
          { rank: 5, name: '数据合规与脱敏', sub: 'REQ-2408 · 1 个缺陷', value: '1', tone: 'neutral' },
        ],
      },
      team: {
        delivery: [
          { label: '团队人均吞吐', value: '2.6', unit: 'SP', delta: 8.3, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '8.9', unit: '天', delta: -0.6, deltaDir: 'down', tone: 'ok' },
          { label: '跨团队阻塞', value: '3', unit: '项', delta: 1, deltaDir: 'up', tone: 'warn' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.44', unit: '个/KLOC', delta: -10.2, deltaDir: 'down', tone: 'ok' },
          { label: 'P0 缺陷占比', value: '25.0', unit: '%', delta: -5.0, deltaDir: 'down', tone: 'warn' },
          { label: '平均修复时长', value: '39.5', unit: 'h', delta: -5.8, deltaDir: 'down', tone: 'info' },
        ],
        release: [
          { label: '发布频次', value: '0', unit: '次', delta: -100, deltaDir: 'down', tone: 'danger' },
          { label: '发布成功率', value: '0', unit: '%', delta: -66.7, deltaDir: 'down', tone: 'danger' },
          { label: '平均 RTO', value: '—', unit: 'min', delta: 0, deltaDir: 'down', tone: 'neutral' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '78', unit: '%', delta: 3, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '79.4', unit: '%', delta: 2.2, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '66.7', unit: '%', delta: 0, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '75.8', unit: '%', delta: 1.9, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '1876', unit: 'ms', delta: -2.8, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '257.3', unit: '元', delta: 6.4, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '订单中心研发组', sub: '3 人 · 含 1 个 AI 账号', value: '5 SP', tone: 'info' },
          { rank: 2, name: '交易中台前端组', sub: '1 人', value: '3 SP', tone: 'teal' },
          { rank: 3, name: '基础平台部', sub: '1 人', value: '2 SP', tone: 'warn' },
          { rank: 4, name: '平台架构组', sub: '1 人', value: '1 SP', tone: 'indigo' },
          { rank: 5, name: '质量保障部', sub: '1 人', value: '1 SP', tone: 'amber' },
        ],
        topDefect: [
          { rank: 1, name: '订单中心研发组', sub: 'REQ-2403 / REQ-2404', value: '2', tone: 'danger' },
          { rank: 2, name: '基础平台部', sub: 'REQ-2401', value: '1', tone: 'warn' },
          { rank: 3, name: '交易中台前端组', sub: 'REQ-2408', value: '1', tone: 'teal' },
          { rank: 4, name: '平台架构组', sub: 'REQ-2402', value: '1', tone: 'indigo' },
          { rank: 5, name: '质量保障部', sub: 'REQ-2404 · 漏测 1 例', value: '1', tone: 'amber' },
        ],
      },
      person: {
        delivery: [
          { label: '人均吞吐', value: '3.2', unit: 'SP', delta: 6.7, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '8.4', unit: '天', delta: -0.5, deltaDir: 'down', tone: 'ok' },
          { label: '人均在制品（WIP）', value: '1.6', unit: '项', delta: 0, deltaDir: 'up', tone: 'neutral' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.40', unit: '个/KLOC', delta: -13.0, deltaDir: 'down', tone: 'ok' },
          { label: 'P0 缺陷占比', value: '20.0', unit: '%', delta: -10.0, deltaDir: 'down', tone: 'ok' },
          { label: '平均修复时长', value: '36.4', unit: 'h', delta: -9.2, deltaDir: 'down', tone: 'ok' },
        ],
        release: [
          { label: '人均发布贡献', value: '0', unit: '次', delta: -100, deltaDir: 'down', tone: 'danger' },
          { label: '发布成功率', value: '0', unit: '%', delta: -66.7, deltaDir: 'down', tone: 'danger' },
          { label: '平均 RTO', value: '—', unit: 'min', delta: 0, deltaDir: 'down', tone: 'neutral' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '79', unit: '%', delta: 2, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '81.2', unit: '%', delta: 2.4, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '66.7', unit: '%', delta: 0, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '77.2', unit: '%', delta: 2.8, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '1812', unit: 'ms', delta: -3.9, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '142.9', unit: '元', delta: 6.4, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '周浩然', sub: '后端技术专家', value: '5 SP', tone: 'info' },
          { rank: 2, name: '沈亦白', sub: '后端工程师', value: '4 SP', tone: 'slate' },
          { rank: 3, name: '陈屿', sub: '前端工程师', value: '3 SP', tone: 'teal' },
          { rank: 4, name: '孟星回', sub: 'SRE / 运维工程师', value: '2 SP', tone: 'warn' },
          { rank: 5, name: '严慕舟', sub: '首席架构师', value: '1 SP', tone: 'indigo' },
        ],
        topDefect: [
          { rank: 1, name: '周浩然', sub: 'BUG-1043 / BUG-1049', value: '1', tone: 'danger' },
          { rank: 2, name: '沈亦白', sub: 'BUG-1045', value: '1', tone: 'warn' },
          { rank: 3, name: '陈屿', sub: 'BUG-1054', value: '1', tone: 'teal' },
          { rank: 4, name: '孟星回', sub: 'BUG-1053', value: '1', tone: 'info' },
          { rank: 5, name: '严慕舟', sub: 'BUG-1052', value: '1', tone: 'indigo' },
        ],
      },
    },
    '30d': {
      project: {
        delivery: [
          { label: '迭代吞吐', value: '65', unit: 'SP', delta: 6.6, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '9.4', unit: '天', delta: -1.2, deltaDir: 'down', tone: 'ok' },
          { label: '在制品（WIP）', value: '14', unit: '项', delta: 2, deltaDir: 'up', tone: 'warn' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.48', unit: '个/KLOC', delta: -11.1, deltaDir: 'down', tone: 'ok' },
          { label: 'P0 缺陷占比', value: '33.3', unit: '%', delta: 8.3, deltaDir: 'up', tone: 'danger' },
          { label: '平均修复时长', value: '41.5', unit: 'h', delta: 5.2, deltaDir: 'up', tone: 'warn' },
        ],
        release: [
          { label: '发布频次', value: '2', unit: '次', delta: 0, deltaDir: 'up', tone: 'neutral' },
          { label: '发布成功率', value: '66.7', unit: '%', delta: -33.3, deltaDir: 'down', tone: 'danger' },
          { label: '平均 RTO', value: '6.5', unit: 'min', delta: -1.0, deltaDir: 'down', tone: 'ok' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '76', unit: '%', delta: 8, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '78.4', unit: '%', delta: 3.1, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '66.7', unit: '%', delta: 0, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '74.6', unit: '%', delta: 5.6, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '1918', unit: 'ms', delta: -6.2, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '5145.6', unit: '元', delta: 14.2, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '周浩然', sub: '订单中心研发组', value: '21 SP', tone: 'info' },
          { rank: 2, name: '沈亦白', sub: '订单中心研发组', value: '18 SP', tone: 'slate' },
          { rank: 3, name: 'Artisan Copilot', sub: 'AI 工程平台', value: '16 SP', tone: 'ai' },
          { rank: 4, name: '陈屿', sub: '交易中台前端组', value: '12 SP', tone: 'teal' },
          { rank: 5, name: '孟星回', sub: '基础平台部', value: '8 SP', tone: 'warn' },
        ],
        topDefect: [
          { rank: 1, name: '优惠分摊精度', sub: 'REQ-2403 · 3 个缺陷', value: '3', tone: 'danger' },
          { rank: 2, name: '订单查询性能', sub: 'REQ-2404 · 2 个缺陷', value: '2', tone: 'warn' },
          { rank: 3, name: '一致性与可靠投递', sub: 'REQ-2406 · 2 个缺陷', value: '2', tone: 'info' },
          { rank: 4, name: '状态机流转与审计', sub: 'REQ-2402 · 2 个缺陷', value: '2', tone: 'slate' },
          { rank: 5, name: '数据合规与脱敏', sub: 'REQ-2408 · 1 个缺陷', value: '1', tone: 'neutral' },
        ],
      },
      team: {
        delivery: [
          { label: '团队人均吞吐', value: '10.8', unit: 'SP', delta: 5.9, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '9.7', unit: '天', delta: -1.0, deltaDir: 'down', tone: 'ok' },
          { label: '跨团队阻塞', value: '5', unit: '项', delta: 2, deltaDir: 'up', tone: 'warn' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.49', unit: '个/KLOC', delta: -9.3, deltaDir: 'down', tone: 'ok' },
          { label: 'P0 缺陷占比', value: '33.3', unit: '%', delta: 6.7, deltaDir: 'up', tone: 'danger' },
          { label: '平均修复时长', value: '42.1', unit: 'h', delta: 4.6, deltaDir: 'up', tone: 'warn' },
        ],
        release: [
          { label: '发布频次', value: '2', unit: '次', delta: 0, deltaDir: 'up', tone: 'neutral' },
          { label: '发布成功率', value: '66.7', unit: '%', delta: -33.3, deltaDir: 'down', tone: 'danger' },
          { label: '平均 RTO', value: '6.8', unit: 'min', delta: -0.8, deltaDir: 'down', tone: 'ok' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '75', unit: '%', delta: 7, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '77.2', unit: '%', delta: 2.8, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '66.7', unit: '%', delta: 0, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '73.9', unit: '%', delta: 5.1, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '1954', unit: 'ms', delta: -5.7, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '1029.1', unit: '元', delta: 14.2, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '订单中心研发组', sub: '3 人 · 含 1 个 AI 账号', value: '39 SP', tone: 'info' },
          { rank: 2, name: '交易中台前端组', sub: '1 人', value: '18 SP', tone: 'teal' },
          { rank: 3, name: '基础平台部', sub: '1 人', value: '13 SP', tone: 'warn' },
          { rank: 4, name: '平台架构组', sub: '1 人', value: '8 SP', tone: 'indigo' },
          { rank: 5, name: '质量保障部', sub: '1 人', value: '5 SP', tone: 'amber' },
        ],
        topDefect: [
          { rank: 1, name: '订单中心研发组', sub: 'REQ-2403 / REQ-2404 / REQ-2406', value: '5', tone: 'danger' },
          { rank: 2, name: '交易中台前端组', sub: 'REQ-2404', value: '2', tone: 'warn' },
          { rank: 3, name: '基础平台部', sub: 'REQ-2401 / REQ-2406', value: '2', tone: 'info' },
          { rank: 4, name: '平台架构组', sub: 'REQ-2402', value: '1', tone: 'indigo' },
          { rank: 5, name: '质量保障部', sub: 'REQ-2404 · 漏测 2 例', value: '1', tone: 'amber' },
        ],
      },
      person: {
        delivery: [
          { label: '人均吞吐', value: '13.0', unit: 'SP', delta: 7.4, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '9.1', unit: '天', delta: -1.4, deltaDir: 'down', tone: 'ok' },
          { label: '人均在制品（WIP）', value: '2.3', unit: '项', delta: 1, deltaDir: 'up', tone: 'warn' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.46', unit: '个/KLOC', delta: -12.4, deltaDir: 'down', tone: 'ok' },
          { label: 'P0 缺陷占比', value: '30.0', unit: '%', delta: 5.0, deltaDir: 'up', tone: 'warn' },
          { label: '平均修复时长', value: '40.2', unit: 'h', delta: 3.1, deltaDir: 'up', tone: 'warn' },
        ],
        release: [
          { label: '人均发布贡献', value: '2', unit: '次', delta: 0, deltaDir: 'up', tone: 'neutral' },
          { label: '发布成功率', value: '66.7', unit: '%', delta: -33.3, deltaDir: 'down', tone: 'danger' },
          { label: '平均 RTO', value: '6.2', unit: 'min', delta: -1.2, deltaDir: 'down', tone: 'ok' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '77', unit: '%', delta: 8, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '79.6', unit: '%', delta: 3.6, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '66.7', unit: '%', delta: 0, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '75.1', unit: '%', delta: 6.0, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '1886', unit: 'ms', delta: -6.8, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '571.7', unit: '元', delta: 14.2, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '周浩然', sub: '后端技术专家', value: '21 SP', tone: 'info' },
          { rank: 2, name: '沈亦白', sub: '后端工程师', value: '18 SP', tone: 'slate' },
          { rank: 3, name: '陈屿', sub: '前端工程师', value: '18 SP', tone: 'teal' },
          { rank: 4, name: '孟星回', sub: 'SRE / 运维工程师', value: '13 SP', tone: 'warn' },
          { rank: 5, name: '严慕舟', sub: '首席架构师', value: '9 SP', tone: 'indigo' },
        ],
        topDefect: [
          { rank: 1, name: '周浩然', sub: 'BUG-1043 / BUG-1049 / BUG-1051', value: '4', tone: 'danger' },
          { rank: 2, name: '沈亦白', sub: 'BUG-1045 / BUG-1046', value: '3', tone: 'warn' },
          { rank: 3, name: '陈屿', sub: 'BUG-1054 / BUG-1055', value: '2', tone: 'teal' },
          { rank: 4, name: '孟星回', sub: 'BUG-1053 / BUG-1048', value: '2', tone: 'info' },
          { rank: 5, name: '严慕舟', sub: 'BUG-1052', value: '1', tone: 'indigo' },
        ],
      },
    },
    quarter: {
      project: {
        delivery: [
          { label: '季度吞吐', value: '178', unit: 'SP', delta: 14.8, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '10.2', unit: '天', delta: -2.4, deltaDir: 'down', tone: 'ok' },
          { label: '在制品（WIP）', value: '16', unit: '项', delta: 3, deltaDir: 'up', tone: 'warn' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.55', unit: '个/KLOC', delta: -7.6, deltaDir: 'down', tone: 'info' },
          { label: 'P0 缺陷占比', value: '28.6', unit: '%', delta: 2.6, deltaDir: 'up', tone: 'warn' },
          { label: '平均修复时长', value: '44.8', unit: 'h', delta: 6.4, deltaDir: 'up', tone: 'warn' },
        ],
        release: [
          { label: '发布频次', value: '7', unit: '次', delta: 16.7, deltaDir: 'up', tone: 'ok' },
          { label: '发布成功率', value: '85.7', unit: '%', delta: -3.2, deltaDir: 'down', tone: 'ok' },
          { label: '平均 RTO', value: '7.2', unit: 'min', delta: -0.6, deltaDir: 'down', tone: 'ok' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '68', unit: '%', delta: 22, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '74.2', unit: '%', delta: 9.8, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '63.5', unit: '%', delta: 6.1, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '72.3', unit: '%', delta: 12.3, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '2064', unit: 'ms', delta: -11.5, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '15436.8', unit: '元', delta: 27.8, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '周浩然', sub: '订单中心研发组', value: '54 SP', tone: 'info' },
          { rank: 2, name: '沈亦白', sub: '订单中心研发组', value: '47 SP', tone: 'slate' },
          { rank: 3, name: 'Artisan Copilot', sub: 'AI 工程平台', value: '41 SP', tone: 'ai' },
          { rank: 4, name: '陈屿', sub: '交易中台前端组', value: '34 SP', tone: 'teal' },
          { rank: 5, name: '孟星回', sub: '基础平台部', value: '22 SP', tone: 'warn' },
        ],
        topDefect: [
          { rank: 1, name: '优惠分摊精度', sub: 'REQ-2403 · 4 个缺陷', value: '4', tone: 'danger' },
          { rank: 2, name: '订单查询性能', sub: 'REQ-2404 · 3 个缺陷', value: '3', tone: 'warn' },
          { rank: 3, name: '一致性与可靠投递', sub: 'REQ-2406 · 3 个缺陷', value: '3', tone: 'info' },
          { rank: 4, name: '状态机流转与审计', sub: 'REQ-2402 · 3 个缺陷', value: '3', tone: 'slate' },
          { rank: 5, name: '数据合规与脱敏', sub: 'REQ-2408 · 2 个缺陷', value: '2', tone: 'neutral' },
        ],
      },
      team: {
        delivery: [
          { label: '团队人均吞吐', value: '29.6', unit: 'SP', delta: 13.2, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '10.6', unit: '天', delta: -2.1, deltaDir: 'down', tone: 'ok' },
          { label: '跨团队阻塞', value: '11', unit: '项', delta: 4, deltaDir: 'up', tone: 'warn' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.56', unit: '个/KLOC', delta: -6.7, deltaDir: 'down', tone: 'info' },
          { label: 'P0 缺陷占比', value: '28.6', unit: '%', delta: 2.6, deltaDir: 'up', tone: 'warn' },
          { label: '平均修复时长', value: '45.5', unit: 'h', delta: 6.8, deltaDir: 'up', tone: 'warn' },
        ],
        release: [
          { label: '发布频次', value: '7', unit: '次', delta: 16.7, deltaDir: 'up', tone: 'ok' },
          { label: '发布成功率', value: '85.7', unit: '%', delta: -3.2, deltaDir: 'down', tone: 'ok' },
          { label: '平均 RTO', value: '7.4', unit: 'min', delta: -0.5, deltaDir: 'down', tone: 'ok' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '67', unit: '%', delta: 21, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '73.5', unit: '%', delta: 9.1, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '63.5', unit: '%', delta: 6.1, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '71.8', unit: '%', delta: 11.8, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '2103', unit: 'ms', delta: -10.9, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '3087.4', unit: '元', delta: 27.8, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '订单中心研发组', sub: '3 人 · 含 1 个 AI 账号', value: '101 SP', tone: 'info' },
          { rank: 2, name: '交易中台前端组', sub: '1 人', value: '47 SP', tone: 'teal' },
          { rank: 3, name: '基础平台部', sub: '1 人', value: '30 SP', tone: 'warn' },
          { rank: 4, name: '平台架构组', sub: '1 人', value: '22 SP', tone: 'indigo' },
          { rank: 5, name: '质量保障部', sub: '1 人', value: '14 SP', tone: 'amber' },
        ],
        topDefect: [
          { rank: 1, name: '订单中心研发组', sub: 'REQ-2401 ~ REQ-2406', value: '12', tone: 'danger' },
          { rank: 2, name: '交易中台前端组', sub: 'REQ-2404', value: '5', tone: 'warn' },
          { rank: 3, name: '基础平台部', sub: 'REQ-2401 / REQ-2406', value: '4', tone: 'info' },
          { rank: 4, name: '平台架构组', sub: 'REQ-2402', value: '3', tone: 'indigo' },
          { rank: 5, name: '质量保障部', sub: 'REQ-2404 · 漏测 3 例', value: '2', tone: 'amber' },
        ],
      },
      person: {
        delivery: [
          { label: '人均吞吐', value: '35.6', unit: 'SP', delta: 12.0, deltaDir: 'up', tone: 'ok' },
          { label: '平均交付周期', value: '10.0', unit: '天', delta: -2.6, deltaDir: 'down', tone: 'ok' },
          { label: '人均在制品（WIP）', value: '2.6', unit: '项', delta: 1, deltaDir: 'up', tone: 'warn' },
        ],
        defectDensity: [
          { label: '缺陷密度', value: '0.53', unit: '个/KLOC', delta: -8.6, deltaDir: 'down', tone: 'ok' },
          { label: 'P0 缺陷占比', value: '27.3', unit: '%', delta: 1.8, deltaDir: 'up', tone: 'warn' },
          { label: '平均修复时长', value: '43.6', unit: 'h', delta: 5.1, deltaDir: 'up', tone: 'warn' },
        ],
        release: [
          { label: '人均发布贡献', value: '7', unit: '次', delta: 16.7, deltaDir: 'up', tone: 'ok' },
          { label: '发布成功率', value: '85.7', unit: '%', delta: -3.2, deltaDir: 'down', tone: 'ok' },
          { label: '平均 RTO', value: '7.0', unit: 'min', delta: -0.8, deltaDir: 'down', tone: 'ok' },
        ],
        ai: [
          { label: 'AI 代码产出占比', value: '69', unit: '%', delta: 23, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 建议采纳率', value: '75.8', unit: '%', delta: 10.4, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 首因命中率', value: '63.5', unit: '%', delta: 6.1, deltaDir: 'up', tone: 'info' },
          { label: 'AI 生成用例占比', value: '72.9', unit: '%', delta: 12.9, deltaDir: 'up', tone: 'ai' },
          { label: 'AI 平均响应时延', value: '2028', unit: 'ms', delta: -12.1, deltaDir: 'down', tone: 'ok' },
          { label: 'Token 成本', value: '1715.2', unit: '元', delta: 27.8, deltaDir: 'up', tone: 'warn' },
        ],
        topDelivery: [
          { rank: 1, name: '周浩然', sub: '后端技术专家', value: '54 SP', tone: 'info' },
          { rank: 2, name: '沈亦白', sub: '后端工程师', value: '47 SP', tone: 'slate' },
          { rank: 3, name: '陈屿', sub: '前端工程师', value: '41 SP', tone: 'teal' },
          { rank: 4, name: '孟星回', sub: 'SRE / 运维工程师', value: '30 SP', tone: 'warn' },
          { rank: 5, name: '严慕舟', sub: '首席架构师', value: '22 SP', tone: 'indigo' },
        ],
        topDefect: [
          { rank: 1, name: '周浩然', sub: 'BUG-1043 / 1049 / 1051 / 1055', value: '9', tone: 'danger' },
          { rank: 2, name: '沈亦白', sub: 'BUG-1045 / 1046 / 1048', value: '7', tone: 'warn' },
          { rank: 3, name: '陈屿', sub: 'BUG-1054 / 1050', value: '5', tone: 'teal' },
          { rank: 4, name: '孟星回', sub: 'BUG-1053 / 1047', value: '4', tone: 'info' },
          { rank: 5, name: '严慕舟', sub: 'BUG-1052 / 1051', value: '3', tone: 'indigo' },
        ],
      },
    },
  },
};

/* ============================================================
 * A3. PingCode 集成中心
 * ============================================================ */

/** 外部集成系统类别：项目协作 / 代码托管 / 持续集成 / 代码质量 / 制品库 */
export type ProviderKind = 'project' | 'scm' | 'ci' | 'quality' | 'artifact';

/** 集成服务商定义 */
export interface IntegrationProviderDef {
  id: string;
  name: string;
  kind: ProviderKind;
  kindLabel: string;
  vendor: string;
  tone: Tone;
  endpoint: string;
  authType: string;
  scopes: string[];
  connected: boolean;
  /**
   * 接入状态：connected 已接入 / paused 已暂停（曾接入，凭据或网络原因停用）
   * / unplugged 未接入（抽象适配器已预留，尚未配置端点与凭据）
   */
  status: 'connected' | 'paused' | 'unplugged';
  desc: string;
  syncObjects: string[];
  lastSyncAt: string;
}

/** 集成中心服务商：5 个已纳管（含 1 个已暂停）+ 4 个未接入占位（抽象适配器已预留） */
export const providers: IntegrationProviderDef[] = [
  {
    id: 'provider-pingcode',
    name: 'PingCode 项目协作',
    kind: 'project',
    kindLabel: '项目协作',
    vendor: 'PingCode Enterprise',
    tone: 'brand',
    endpoint: 'https://pingcode.artisan.internal/api/v1',
    authType: 'OAuth2 应用授权',
    scopes: ['work_item:rw', 'sprint:rw', 'bug:rw', 'wiki:r'],
    connected: true,
    status: 'connected',
    desc: '工作项、迭代、缺陷与 Wiki 的唯一事实源，双向同步研发过程数据',
    syncObjects: ['工作项', '迭代', '缺陷', '需求'],
    lastSyncAt: '2026-03-19 18:10',
  },
  {
    id: 'provider-gitlab',
    name: 'GitLab 代码托管',
    kind: 'scm',
    kindLabel: '代码托管',
    vendor: 'GitLab CE 16.9',
    tone: 'indigo',
    endpoint: 'https://git.artisan.internal/api/v4',
    authType: 'Personal Access Token',
    scopes: ['api', 'read_repository', 'write_repository'],
    connected: true,
    status: 'connected',
    desc: 'MR、分支与提交记录关联，向工作项回写开发进度与代码规模',
    syncObjects: ['MR', '分支', '提交'],
    lastSyncAt: '2026-03-19 18:08',
  },
  {
    id: 'provider-jenkins',
    name: 'Jenkins 流水线',
    kind: 'ci',
    kindLabel: '持续集成',
    vendor: 'Jenkins 2.452',
    tone: 'info',
    endpoint: 'https://ci.artisan.internal/jenkins',
    authType: 'API Token',
    scopes: ['job:build', 'job:read'],
    connected: true,
    status: 'connected',
    desc: '触发构建与部署，回传流水线阶段结果、制品版本与门禁判定',
    syncObjects: ['流水线', '构建', '部署'],
    lastSyncAt: '2026-03-19 17:55',
  },
  {
    id: 'provider-sonar',
    name: 'SonarQube 代码质量',
    kind: 'quality',
    kindLabel: '代码质量',
    vendor: 'SonarQube 10.4',
    tone: 'teal',
    endpoint: 'https://sonar.artisan.internal',
    authType: 'User Token',
    scopes: ['analysis:r', 'quality-gate:r'],
    connected: true,
    status: 'connected',
    desc: '质量门禁与覆盖率数据来源，G3 编码门禁 42 分判定的直接依据',
    syncObjects: ['质量门禁', '覆盖率', '代码异味'],
    lastSyncAt: '2026-03-19 17:50',
  },
  {
    id: 'provider-harbor',
    name: 'Harbor 制品库',
    kind: 'artifact',
    kindLabel: '制品库',
    vendor: 'Harbor 2.10',
    tone: 'amber',
    endpoint: 'https://harbor.artisan.internal',
    authType: 'Robot Account',
    scopes: ['repository:r'],
    connected: false,
    status: 'paused',
    desc: '镜像与制品版本登记，发布单制品来源校验（访问密钥待轮换已暂停）',
    syncObjects: ['镜像', '制品版本'],
    lastSyncAt: '2026-03-18 09:12',
  },
  {
    id: 'provider-jira',
    name: 'Jira',
    kind: 'project',
    kindLabel: '项目协作',
    vendor: 'Atlassian Jira Software',
    tone: 'neutral',
    endpoint: '未接入（接入后填写服务地址）',
    authType: '未配置（接入后选择 OAuth2 或 API Token）',
    scopes: ['未接入'],
    connected: false,
    status: 'unplugged',
    desc: '项目协作类抽象适配器已预留、尚未接入；接入后可承接 Jira Issue / Sprint 与平台工作项、迭代的双向映射',
    syncObjects: ['未接入'],
    lastSyncAt: '—',
  },
  {
    id: 'provider-zentao',
    name: '禅道',
    kind: 'project',
    kindLabel: '项目协作',
    vendor: '禅道项目管理软件（开源版）',
    tone: 'slate',
    endpoint: '未接入（接入后填写服务地址）',
    authType: '未配置（接入后选择账号密码或 Token）',
    scopes: ['未接入'],
    connected: false,
    status: 'unplugged',
    desc: '项目协作类抽象适配器已预留、尚未接入；接入后可映射禅道需求、任务与 Bug 模型到平台工作项与缺陷',
    syncObjects: ['未接入'],
    lastSyncAt: '—',
  },
  {
    id: 'provider-ones',
    name: 'ONES',
    kind: 'project',
    kindLabel: '项目协作',
    vendor: 'ONES Project 研发管理平台',
    tone: 'neutral',
    endpoint: '未接入（接入后填写服务地址）',
    authType: '未配置（接入后选择 OAuth2 应用授权）',
    scopes: ['未接入'],
    connected: false,
    status: 'unplugged',
    desc: '项目协作类抽象适配器已预留、尚未接入；接入后可同步 ONES 项目、工作项与迭代进度并回写状态流水',
    syncObjects: ['未接入'],
    lastSyncAt: '—',
  },
  {
    id: 'provider-tapd',
    name: 'TAPD',
    kind: 'project',
    kindLabel: '项目协作',
    vendor: '腾讯 TAPD 敏捷研发协作',
    tone: 'slate',
    endpoint: '未接入（接入后填写服务地址）',
    authType: '未配置（接入后选择 App ID + App Secret）',
    scopes: ['未接入'],
    connected: false,
    status: 'unplugged',
    desc: '项目协作类抽象适配器已预留、尚未接入；接入后可对接 TAPD 需求、缺陷与迭代看板并统一标识映射',
    syncObjects: ['未接入'],
    lastSyncAt: '—',
  },
];

/** PingCode 集成配置 */
export interface PingcodeConfigDef {
  tenant: string;
  domain: string;
  apiBase: string;
  projectId: string;
  projectName: string;
  authType: string;
  tokenMasked: string;
  scope: string[];
  syncMode: string;
  syncIntervalMin: number;
  writebackEnabled: boolean;
  twoWayState: boolean;
  ownerId: string;
  enabled: boolean;
  lastSyncAt: string;
  lastReconcileAt: string;
}

/** PingCode 集成主配置（对应 EPIC-ORDER-REF 单项目绑定） */
export const pingcodeConfig: PingcodeConfigDef = {
  tenant: 'artisan-group',
  domain: 'pingcode.artisan.internal',
  apiBase: 'https://pingcode.artisan.internal/api/v1',
  projectId: 'PC-ORD',
  projectName: '订单中心重构 EPIC-ORDER-REF',
  authType: 'OAuth2 应用授权',
  tokenMasked: 'pc_****************9f3a',
  scope: ['work_item:rw', 'sprint:rw', 'bug:rw', 'wiki:r'],
  syncMode: '准实时增量 + 每 6 小时全量对账',
  syncIntervalMin: 5,
  writebackEnabled: true,
  twoWayState: true,
  ownerId: 'u-lin',
  enabled: true,
  lastSyncAt: '2026-03-19 18:10',
  lastReconcileAt: '2026-03-19 18:00',
};

/** 模型映射：平台模型 id ↔ PingCode AI 侧别名 */
export interface ModelMappingDef {
  id: string;
  modelId: string;
  platformName: string;
  pingcodeAlias: string;
  provider: string;
  syncField: string;
  enabled: boolean;
  desc: string;
}

/** 5 个可路由模型与 PingCode 侧别名的映射 */
export const modelMappings: ModelMappingDef[] = [
  {
    id: 'mm-01',
    modelId: 'mdl-claude',
    platformName: 'Claude 3.7 Sonnet',
    pingcodeAlias: 'claude-3-7-sonnet',
    provider: 'Anthropic',
    syncField: 'ai_model_alias',
    enabled: true,
    desc: '默认主力模型，承接需求拆解、架构评审与复杂重构代码生成',
  },
  {
    id: 'mm-02',
    modelId: 'mdl-deepseek',
    platformName: 'DeepSeek-V3',
    pingcodeAlias: 'deepseek-v3',
    provider: 'DeepSeek',
    syncField: 'ai_model_alias',
    enabled: true,
    desc: '成本优先模型，承接单测生成、日志排查与批量缺陷初筛',
  },
  {
    id: 'mm-03',
    modelId: 'mdl-qwen',
    platformName: 'Qwen2.5-Max',
    pingcodeAlias: 'qwen2-5-max',
    provider: 'Alibaba Cloud',
    syncField: 'ai_model_alias',
    enabled: true,
    desc: '中文语境与业务文档理解，承接 PRD 一致性核对与用例补全',
  },
  {
    id: 'mm-04',
    modelId: 'mdl-gpt5',
    platformName: 'GPT-5',
    pingcodeAlias: 'gpt-5',
    provider: 'OpenAI',
    syncField: 'ai_model_alias',
    enabled: true,
    desc: '长上下文推理模型，承接跨模块影响面分析与发布风险评审',
  },
  {
    id: 'mm-05',
    modelId: 'mdl-local',
    platformName: '私有化 Llama3-70B',
    pingcodeAlias: 'local-llama3-70b',
    provider: '内部私有化部署',
    syncField: 'ai_model_alias',
    enabled: false,
    desc: '仅承接脱敏后代码，禁止出域，未开放至 PingCode 侧别名同步',
  },
];

/** 状态映射：平台 10 状态机 ↔ PingCode 工作项状态 */
export interface StateMappingDef {
  id: string;
  stateId: string;
  stateCode: string;
  stateName: string;
  pingcodeName: string;
  direction: string;
  syncMode: string;
  tone: Tone;
  note: string;
}

/** 平台 10 个任务状态与 PingCode 状态的双向映射（全覆盖） */
export const stateMappings: StateMappingDef[] = [
  {
    id: 'sm-01',
    stateId: 'backlog',
    stateCode: 'T01',
    stateName: '需求池',
    pingcodeName: '待评审',
    direction: '双向',
    syncMode: '实时',
    tone: 'neutral',
    note: '需求入池即同步至 PingCode 待评审，回写优先级排序结果',
  },
  {
    id: 'sm-02',
    stateId: 'refined',
    stateCode: 'T02',
    stateName: '已拆解',
    pingcodeName: '未开始',
    direction: '双向',
    syncMode: '实时',
    tone: 'info',
    note: '拆解完成回写 PingCode 未开始，并携带子工作项拆解清单',
  },
  {
    id: 'sm-03',
    stateId: 'taskCreated',
    stateCode: 'T03',
    stateName: '任务已创建',
    pingcodeName: '未开始',
    direction: '单向（平台→PingCode）',
    syncMode: '实时',
    tone: 'ai',
    note: '双端创建开发任务并绑定，PingCode 侧保持未开始直至开工',
  },
  {
    id: 'sm-04',
    stateId: 'dev',
    stateCode: 'T04',
    stateName: '开发中',
    pingcodeName: '处理中',
    direction: '双向',
    syncMode: '实时',
    tone: 'brand',
    note: '编码会话开始即置处理中，进度按 MR 提交频次回写',
  },
  {
    id: 'sm-05',
    stateId: 'testGreen',
    stateCode: 'T05',
    stateName: '本地测试通过',
    pingcodeName: '处理中',
    direction: '单向（平台→PingCode）',
    syncMode: '实时',
    tone: 'teal',
    note: '本地单测与静态检查全绿，PingCode 侧仍归入处理中',
  },
  {
    id: 'sm-06',
    stateId: 'committed',
    stateCode: 'T06',
    stateName: '已提交',
    pingcodeName: '处理中',
    direction: '双向',
    syncMode: '实时',
    tone: 'info',
    note: '代码合入主干推送远端，PingCode 关联 MR 记录',
  },
  {
    id: 'sm-07',
    stateId: 'deployed',
    stateCode: 'T07',
    stateName: '已部署',
    pingcodeName: '处理中',
    direction: '单向（平台→PingCode）',
    syncMode: '实时',
    tone: 'brand',
    note: '流水线部署测试环境完成，附带环境与制品版本',
  },
  {
    id: 'sm-08',
    stateId: 'qa',
    stateCode: 'T08',
    stateName: '自动化测试中',
    pingcodeName: '测试中',
    direction: '双向',
    syncMode: '实时',
    tone: 'warn',
    note: '自动化回归与门禁执行中，失败则同步转入缺陷修复',
  },
  {
    id: 'sm-09',
    stateId: 'bugfix',
    stateCode: 'T09',
    stateName: '缺陷修复中',
    pingcodeName: '处理中',
    direction: '双向',
    syncMode: '实时',
    tone: 'danger',
    note: '关联缺陷修复单，修复后回到测试环节并回写 PingCode',
  },
  {
    id: 'sm-10',
    stateId: 'released',
    stateCode: 'T10',
    stateName: '已发布',
    pingcodeName: '已关闭',
    direction: '单向（PingCode→平台）',
    syncMode: '实时',
    tone: 'ok',
    note: '随发布单上线生产，PingCode 侧关闭工作项并归档',
  },
];

/** 标识映射所属实体类型 */
export type IdMappingEntityType = 'task' | 'requirement' | 'bug';

/** 标识映射：平台 id ↔ PingCode 编号 */
export interface IdMappingDef {
  id: string;
  entityType: IdMappingEntityType;
  entityLabel: string;
  platformId: string;
  platformTitle: string;
  pingcodeCode: string;
  syncStatus: string;
  tone: Tone;
  /** 映射建立时间（平台 id 与 PingCode 编号首次绑定，恒早于或等于 syncedAt） */
  createdAt: string;
  /** 同步方向：push 平台 → PingCode（主）/ pull PingCode → 平台 / both 双向同步 */
  direction: 'push' | 'pull' | 'both';
  syncedAt: string;
}

/** 15 条平台 ↔ PingCode 标识映射（覆盖任务 / 需求 / 缺陷） */
export const idMappings: IdMappingDef[] = [
  {
    id: 'idm-01',
    entityType: 'task',
    entityLabel: '开发任务',
    platformId: 'TASK-2401',
    platformTitle: '幂等下单接口改造：Idempotency-Key 两级校验',
    pingcodeCode: 'PC-ORD-2401',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-02 09:40',
    direction: 'push',
    syncedAt: '2026-03-18 15:26',
  },
  {
    id: 'idm-02',
    entityType: 'task',
    entityLabel: '开发任务',
    platformId: 'TASK-2406',
    platformTitle: '订单状态机统一治理：可配置流转与审计',
    pingcodeCode: 'PC-ORD-2406',
    syncStatus: '待重试',
    tone: 'warn',
    createdAt: '2026-03-02 10:05',
    direction: 'push',
    syncedAt: '2026-03-19 18:12',
  },
  {
    id: 'idm-03',
    entityType: 'task',
    entityLabel: '开发任务',
    platformId: 'TASK-2410',
    platformTitle: '金额精度治理：BigDecimal 全链路统一',
    pingcodeCode: 'PC-ORD-2410',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-03 09:18',
    direction: 'both',
    syncedAt: '2026-03-19 16:12',
  },
  {
    id: 'idm-04',
    entityType: 'task',
    entityLabel: '开发任务',
    platformId: 'TASK-2414',
    platformTitle: '订单列表虚拟滚动重构',
    pingcodeCode: 'PC-ORD-2414',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-03 09:26',
    direction: 'push',
    syncedAt: '2026-03-18 11:40',
  },
  {
    id: 'idm-05',
    entityType: 'task',
    entityLabel: '开发任务',
    platformId: 'TASK-2419',
    platformTitle: '订单数据迁移作业（双跑比对）',
    pingcodeCode: 'PC-ORD-2419',
    syncStatus: '死信',
    tone: 'danger',
    createdAt: '2026-03-04 14:02',
    direction: 'push',
    syncedAt: '2026-03-12 09:04',
  },
  {
    id: 'idm-06',
    entityType: 'task',
    entityLabel: '开发任务',
    platformId: 'TASK-2421',
    platformTitle: '发布单 REL-2403 灰度上线',
    pingcodeCode: 'PC-ORD-2421',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-05 11:20',
    direction: 'both',
    syncedAt: '2026-03-19 18:05',
  },
  {
    id: 'idm-07',
    entityType: 'requirement',
    entityLabel: '需求',
    platformId: 'REQ-2401',
    platformTitle: '订单创建链路重构：幂等下单与本地消息表保障一致性',
    pingcodeCode: 'PC-ORD-1024',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-02 09:28',
    direction: 'push',
    syncedAt: '2026-03-02 09:30',
  },
  {
    id: 'idm-08',
    entityType: 'requirement',
    entityLabel: '需求',
    platformId: 'REQ-2402',
    platformTitle: '订单状态机统一治理：可配置流转与状态变更审计',
    pingcodeCode: 'PC-ORD-1031',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-02 09:30',
    direction: 'push',
    syncedAt: '2026-03-02 09:32',
  },
  {
    id: 'idm-09',
    entityType: 'requirement',
    entityLabel: '需求',
    platformId: 'REQ-2403',
    platformTitle: '优惠计算下沉：券、满减、会员价叠加规则引擎化',
    pingcodeCode: 'PC-ORD-1038',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-02 09:32',
    direction: 'push',
    syncedAt: '2026-03-02 09:34',
  },
  {
    id: 'idm-10',
    entityType: 'requirement',
    entityLabel: '需求',
    platformId: 'REQ-2404',
    platformTitle: '订单查询性能达标：3000 TPS 且 P99 < 200ms',
    pingcodeCode: 'PC-ORD-1045',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-02 09:34',
    direction: 'push',
    syncedAt: '2026-03-02 09:36',
  },
  {
    id: 'idm-11',
    entityType: 'requirement',
    entityLabel: '需求',
    platformId: 'REQ-2408',
    platformTitle: '敏感字段统一脱敏与合规导出',
    pingcodeCode: 'PC-ORD-1073',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-11 10:12',
    direction: 'pull',
    syncedAt: '2026-03-11 10:15',
  },
  {
    id: 'idm-12',
    entityType: 'bug',
    entityLabel: '缺陷',
    platformId: 'BUG-1043',
    platformTitle: '优惠金额与订单金额合计不一致（资损级）',
    pingcodeCode: 'BUG-1043',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-02 09:12',
    direction: 'pull',
    syncedAt: '2026-03-19 16:10',
  },
  {
    id: 'idm-13',
    entityType: 'bug',
    entityLabel: '缺陷',
    platformId: 'BUG-1045',
    platformTitle: '库存扣减与订单创建并发下双扣',
    pingcodeCode: 'BUG-1045',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-10 14:26',
    direction: 'push',
    syncedAt: '2026-03-17 14:20',
  },
  {
    id: 'idm-14',
    entityType: 'bug',
    entityLabel: '缺陷',
    platformId: 'BUG-1049',
    platformTitle: '订单状态回滚后审计流水缺失',
    pingcodeCode: 'BUG-1049',
    syncStatus: '已同步',
    tone: 'ok',
    createdAt: '2026-03-12 16:09',
    direction: 'pull',
    syncedAt: '2026-03-18 10:05',
  },
  {
    id: 'idm-15',
    entityType: 'bug',
    entityLabel: '缺陷',
    platformId: 'BUG-1052',
    platformTitle: '合规导出未剔除敏感字段（高危）',
    pingcodeCode: 'BUG-1052',
    syncStatus: '死信',
    tone: 'danger',
    createdAt: '2026-03-19 09:24',
    direction: 'push',
    syncedAt: '2026-03-19 11:30',
  },
];

/** 同步队列计数 */
export interface SyncQueueCountsDef {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
}

/** 同步队列中的活动条目 */
export interface SyncQueueItemDef {
  id: string;
  objectType: string;
  direction: 'push' | 'pull';
  refId: string;
  refTitle: string;
  providerId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  tone: Tone;
  attempts: number;
  latencyMs: number;
  updatedAt: string;
  traceId: string;
  message: string;
}

/** 死信队列条目 */
export interface SyncDeadLetterDef {
  id: string;
  refId: string;
  objectType: string;
  reason: string;
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
  traceId: string;
}

/** 对账条目 */
export interface SyncReconcileItemDef {
  id: string;
  scope: string;
  platformCount: number;
  pingcodeCount: number;
  diff: number;
  result: string;
  tone: Tone;
  checkedAt: string;
}

/** 字段回写规则 */
export interface SyncWritebackDef {
  id: string;
  field: string;
  source: string;
  target: string;
  samples: number;
  successRate: number;
  enabled: boolean;
  lastAt: string;
}

/** PingCode 同步队列概览 */
export interface SyncQueueDef {
  counts: SyncQueueCountsDef;
  throughputPerHour: number;
  avgLatencyMs: number;
  successRate: number;
  retrying: SyncQueueItemDef[];
  deadLetters: SyncDeadLetterDef[];
  lastReconcile: { at: string; items: SyncReconcileItemDef[] };
  writebacks: SyncWritebackDef[];
}

/** PingCode 同步队列完整子结构（含重试、死信、对账与字段回写） */
export const syncQueue: SyncQueueDef = {
  counts: { pending: 18, running: 2, succeeded: 1286, failed: 6 },
  throughputPerHour: 320,
  avgLatencyMs: 412,
  successRate: 99.4,
  retrying: [
    {
      id: 'sq-0231',
      objectType: '工作项',
      direction: 'push',
      refId: 'TASK-2401',
      refTitle: '幂等下单接口改造：Idempotency-Key 两级校验',
      providerId: 'provider-pingcode',
      status: 'failed',
      tone: 'warn',
      attempts: 3,
      latencyMs: 8200,
      updatedAt: '2026-03-19 18:12',
      traceId: 'SYNC-0231',
      message: 'PingCode 限流 429，指数退避重试中（第 3 次，下次 60s 后）',
    },
    {
      id: 'sq-0232',
      objectType: 'MR 关联',
      direction: 'push',
      refId: 'MR-2410',
      refTitle: 'fix(order): 金额精度治理 MR-2410',
      providerId: 'provider-gitlab',
      status: 'running',
      tone: 'info',
      attempts: 2,
      latencyMs: 1580,
      updatedAt: '2026-03-19 18:11',
      traceId: 'SYNC-0232',
      message: 'MR 描述超长触发截断重试，正在进行第 2 次同步',
    },
    {
      id: 'sq-0233',
      objectType: '缺陷',
      direction: 'pull',
      refId: 'BUG-1043',
      refTitle: '优惠金额与订单金额合计不一致（资损级）',
      providerId: 'provider-pingcode',
      status: 'failed',
      tone: 'warn',
      attempts: 1,
      latencyMs: 640,
      updatedAt: '2026-03-19 18:09',
      traceId: 'SYNC-0233',
      message: 'PingCode 侧状态字段冲突，等待人工确认后重放',
    },
  ],
  deadLetters: [
    {
      id: 'sdl-001',
      refId: 'TASK-2419',
      objectType: '工作项',
      reason: 'PC-ORD-2419 在 PingCode 侧已归档，目标工作项不存在',
      attempts: 5,
      firstFailedAt: '2026-03-12 09:04',
      lastFailedAt: '2026-03-19 08:12',
      traceId: 'SYNC-0188',
    },
    {
      id: 'sdl-002',
      refId: 'BUG-1052',
      objectType: '缺陷',
      reason: '合规模块字段校验失败：缺少脱敏标记字段 secretLevel',
      attempts: 5,
      firstFailedAt: '2026-03-19 11:30',
      lastFailedAt: '2026-03-19 17:42',
      traceId: 'SYNC-0201',
    },
    {
      id: 'sdl-003',
      refId: 'PIPE-2409',
      objectType: '流水线结果',
      reason: 'SonarQube 质量门禁字段缺失，无法回写 G3 判定结果',
      attempts: 4,
      firstFailedAt: '2026-03-19 17:50',
      lastFailedAt: '2026-03-19 18:04',
      traceId: 'SYNC-0225',
    },
  ],
  lastReconcile: {
    at: '2026-03-19 18:00',
    items: [
      {
        id: 'rc-01',
        scope: '开发任务',
        platformCount: 24,
        pingcodeCount: 24,
        diff: 0,
        result: '一致',
        tone: 'ok',
        checkedAt: '2026-03-19 18:00',
      },
      {
        id: 'rc-02',
        scope: '需求',
        platformCount: 8,
        pingcodeCount: 8,
        diff: 0,
        result: '一致',
        tone: 'ok',
        checkedAt: '2026-03-19 18:00',
      },
      {
        id: 'rc-03',
        scope: '缺陷',
        platformCount: 12,
        pingcodeCount: 11,
        diff: 1,
        result: '存在 1 条未同步（BUG-1052 已入死信）',
        tone: 'warn',
        checkedAt: '2026-03-19 18:00',
      },
      {
        id: 'rc-04',
        scope: '迭代',
        platformCount: 4,
        pingcodeCount: 4,
        diff: 0,
        result: '一致',
        tone: 'ok',
        checkedAt: '2026-03-19 18:00',
      },
    ],
  },
  writebacks: [
    {
      id: 'wb-01',
      field: '开发进度 progress',
      source: '平台编码会话 / MR 提交',
      target: 'PingCode 工作项完成度',
      samples: 24,
      successRate: 100,
      enabled: true,
      lastAt: '2026-03-19 18:10',
    },
    {
      id: 'wb-02',
      field: '状态 state',
      source: '平台 10 状态机',
      target: 'PingCode 工作项状态',
      samples: 24,
      successRate: 95.8,
      enabled: true,
      lastAt: '2026-03-19 18:10',
    },
    {
      id: 'wb-03',
      field: '关联代码 mrId',
      source: 'GitLab MR',
      target: 'PingCode 缺陷关联代码',
      samples: 12,
      successRate: 100,
      enabled: true,
      lastAt: '2026-03-19 18:08',
    },
    {
      id: 'wb-04',
      field: '门禁结果 gateStatus',
      source: 'SonarQube 质量门禁',
      target: 'PingCode 工作项校验项',
      samples: 10,
      successRate: 90,
      enabled: true,
      lastAt: '2026-03-19 17:55',
    },
    {
      id: 'wb-05',
      field: '发布版本 releaseVersion',
      source: '平台发布单',
      target: 'PingCode 迭代发布记录',
      samples: 3,
      successRate: 100,
      enabled: true,
      lastAt: '2026-03-19 18:05',
    },
  ],
};

/* ============================================================
 * A4. AI 能力观测
 * ============================================================ */

/** AI 模型定义 */
export interface AiModelDef {
  id: string;
  name: string;
  vendor: string;
  version: string;
  tone: Tone;
  contextWindow: string;
  costPer1kTokens: number;
  deployment: string;
  egress: string;
  enabled: boolean;
  roles: string[];
  desc: string;
}

/** 平台接入并可路由的 5 个模型 */
export const models: AiModelDef[] = [
  {
    id: 'mdl-claude',
    name: 'Claude 3.7 Sonnet',
    vendor: 'Anthropic',
    version: 'v3.7',
    tone: 'ai',
    contextWindow: '200K',
    costPer1kTokens: 0.021,
    deployment: '公有云 SaaS',
    egress: '允许出域（代码需先脱敏）',
    enabled: true,
    roles: ['需求拆解', '架构评审', '复杂重构', '代码生成'],
    desc: '默认主力模型，承接需求澄清、架构评审与关键路径的复杂重构代码生成',
  },
  {
    id: 'mdl-deepseek',
    name: 'DeepSeek-V3',
    vendor: 'DeepSeek',
    version: 'v3',
    tone: 'indigo',
    contextWindow: '128K',
    costPer1kTokens: 0.004,
    deployment: '公有云 SaaS',
    egress: '允许出域',
    enabled: true,
    roles: ['单测生成', '日志排查', '缺陷初筛'],
    desc: '成本优先模型，承接单元测试生成、日志排查与批量缺陷初筛等高并发场景',
  },
  {
    id: 'mdl-qwen',
    name: 'Qwen2.5-Max',
    vendor: 'Alibaba Cloud',
    version: 'v2.5',
    tone: 'teal',
    contextWindow: '128K',
    costPer1kTokens: 0.006,
    deployment: '公有云 SaaS',
    egress: '允许出域',
    enabled: true,
    roles: ['中文文档', '用例补全', 'PRD 核对'],
    desc: '中文语境与业务文档理解，承接 PRD 一致性核对、用例补全与文档生成',
  },
  {
    id: 'mdl-gpt5',
    name: 'GPT-5',
    vendor: 'OpenAI',
    version: 'v5.0',
    tone: 'info',
    contextWindow: '400K',
    costPer1kTokens: 0.035,
    deployment: '公有云 SaaS',
    egress: '允许出域（代码需先脱敏）',
    enabled: true,
    roles: ['影响面分析', '发布风险评审', '长上下文推理'],
    desc: '长上下文推理模型，承接跨模块影响面分析与发布风险评审等重型任务',
  },
  {
    id: 'mdl-local',
    name: '私有化 Llama3-70B',
    vendor: '内部私有化部署',
    version: '3.0-70B',
    tone: 'slate',
    contextWindow: '32K',
    costPer1kTokens: 0.001,
    deployment: '私有化 VPC',
    egress: '禁止出域',
    enabled: true,
    roles: ['脱敏代码补全', '离线代码检索'],
    desc: '仅在内网私有化 VPC 运行，承接高密级代码补全与离线检索，禁止任何出域',
  },
];

/** 模型路由规则 */
export interface RoutingRuleDef {
  id: string;
  name: string;
  scene: string;
  matchExpr: string;
  modelId: string;
  modelName: string;
  priority: number;
  fallbackModelId: string;
  tone: Tone;
  enabled: boolean;
  desc: string;
}

/** 8 条场景化模型路由规则 */
export const routingRules: RoutingRuleDef[] = [
  {
    id: 'rr-01',
    name: '需求拆解路由',
    scene: '需求澄清',
    matchExpr: 'stage = st-req',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    priority: 1,
    fallbackModelId: 'mdl-qwen',
    tone: 'ai',
    enabled: true,
    desc: 'Brainstorm 追问与用户故事拆解，失败时回退中文能力更强的 Qwen',
  },
  {
    id: 'rr-02',
    name: '架构评审路由',
    scene: '架构设计',
    matchExpr: 'stage = st-arch',
    modelId: 'mdl-gpt5',
    modelName: 'GPT-5',
    priority: 1,
    fallbackModelId: 'mdl-claude',
    tone: 'info',
    enabled: true,
    desc: '限界上下文划分与接口契约评审，需要长上下文推理',
  },
  {
    id: 'rr-03',
    name: '复杂重构代码生成',
    scene: '编码实现',
    matchExpr: 'task.type = 重构 && task.points >= 8',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    priority: 1,
    fallbackModelId: 'mdl-deepseek',
    tone: 'ai',
    enabled: true,
    desc: '关键路径复杂重构优先走主力模型，降级时回退 DeepSeek',
  },
  {
    id: 'rr-04',
    name: '单元测试生成路由',
    scene: '编码实现',
    matchExpr: 'action = unit_test',
    modelId: 'mdl-deepseek',
    modelName: 'DeepSeek-V3',
    priority: 2,
    fallbackModelId: 'mdl-claude',
    tone: 'brand',
    enabled: true,
    desc: '高频单测生成走成本优先模型，保障吞吐与成本可控',
  },
  {
    id: 'rr-05',
    name: '缺陷初筛路由',
    scene: '测试验证',
    matchExpr: 'bug.priority in [P0, P1]',
    modelId: 'mdl-deepseek',
    modelName: 'DeepSeek-V3',
    priority: 2,
    fallbackModelId: 'mdl-gpt5',
    tone: 'danger',
    enabled: true,
    desc: 'P0/P1 缺陷初筛与日志聚类，误判升级时转 GPT-5 深挖',
  },
  {
    id: 'rr-06',
    name: '中文文档与用例补全',
    scene: '需求澄清 / 测试验证',
    matchExpr: 'lang = zh && action = doc',
    modelId: 'mdl-qwen',
    modelName: 'Qwen2.5-Max',
    priority: 3,
    fallbackModelId: 'mdl-claude',
    tone: 'teal',
    enabled: true,
    desc: 'PRD 核对、用例补全与中文文档生成，优先中文语料模型',
  },
  {
    id: 'rr-07',
    name: '影响面与发布风险分析',
    scene: '部署发布',
    matchExpr: 'stage = st-deploy',
    modelId: 'mdl-gpt5',
    modelName: 'GPT-5',
    priority: 1,
    fallbackModelId: 'mdl-claude',
    tone: 'warn',
    enabled: true,
    desc: '发布单变更影响面分析与回滚预案生成，需长上下文聚合',
  },
  {
    id: 'rr-08',
    name: '敏感代码脱敏补全',
    scene: '编码实现',
    matchExpr: 'code.secretLevel >= L2',
    modelId: 'mdl-local',
    modelName: '私有化 Llama3-70B',
    priority: 1,
    fallbackModelId: '',
    tone: 'danger',
    enabled: true,
    desc: 'L2 及以上密级代码强制走私有化模型，禁止出域且无外部回退',
  },
];

/** 单模型调用统计项 */
export interface ModelStatItemDef {
  modelId: string;
  modelName: string;
  calls: number;
  tokensK: number;
  cost: number;
  avgLatencyMs: number;
  successRate: number;
  acceptRate: number;
  tone: Tone;
}

/** 模型调用统计总览 */
export interface ModelStatsDef {
  range: string;
  totalCalls: number;
  totalTokensK: number;
  totalCost: number;
  avgLatencyMs: number;
  overallAcceptRate: number;
  byModel: ModelStatItemDef[];
  trend: { label: string; calls: number }[];
}

/** AI 模型调用统计（近 7 日） */
export const modelStats: ModelStatsDef = {
  range: '近 7 日（2026-03-13 ~ 2026-03-19）',
  totalCalls: 18420,
  totalTokensK: 96240,
  totalCost: 1286.4,
  avgLatencyMs: 1840,
  overallAcceptRate: 78.2,
  byModel: [
    {
      modelId: 'mdl-claude',
      modelName: 'Claude 3.7 Sonnet',
      calls: 6240,
      tokensK: 41200,
      cost: 865.2,
      avgLatencyMs: 2260,
      successRate: 99.2,
      acceptRate: 84.6,
      tone: 'ai',
    },
    {
      modelId: 'mdl-deepseek',
      modelName: 'DeepSeek-V3',
      calls: 7180,
      tokensK: 32800,
      cost: 131.2,
      avgLatencyMs: 1120,
      successRate: 99.6,
      acceptRate: 76.4,
      tone: 'indigo',
    },
    {
      modelId: 'mdl-qwen',
      modelName: 'Qwen2.5-Max',
      calls: 2860,
      tokensK: 11400,
      cost: 68.4,
      avgLatencyMs: 1360,
      successRate: 99.4,
      acceptRate: 79.1,
      tone: 'teal',
    },
    {
      modelId: 'mdl-gpt5',
      modelName: 'GPT-5',
      calls: 1080,
      tokensK: 8600,
      cost: 301.0,
      avgLatencyMs: 3480,
      successRate: 98.6,
      acceptRate: 88.3,
      tone: 'info',
    },
    {
      modelId: 'mdl-local',
      modelName: '私有化 Llama3-70B',
      calls: 1060,
      tokensK: 2240,
      cost: 2.24,
      avgLatencyMs: 940,
      successRate: 99.8,
      acceptRate: 71.5,
      tone: 'slate',
    },
  ],
  trend: [
    { label: '03-13', calls: 2280 },
    { label: '03-14', calls: 1960 },
    { label: '03-15', calls: 1420 },
    { label: '03-16', calls: 2540 },
    { label: '03-17', calls: 3120 },
    { label: '03-18', calls: 3480 },
    { label: '03-19', calls: 3620 },
  ],
};

/** AI 智能体定义 */
export interface AiAgentDef {
  id: string;
  name: string;
  stageId: string;
  stageName: string;
  modelId: string;
  modelName: string;
  tone: Tone;
  status: 'active' | 'idle' | 'paused';
  statusLabel: string;
  skills: string[];
  tools: string[];
  taskCount: number;
  successRate: number;
  acceptRate: number;
  avgDurationMin: number;
  lastActiveAt: string;
  desc: string;
}

/** 7 个 SDLC 环节智能体 */
export const agents: AiAgentDef[] = [
  {
    id: 'ag-pm',
    name: '需求澄清 Agent',
    stageId: 'st-req',
    stageName: '需求澄清',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    tone: 'ai',
    status: 'active',
    statusLabel: '运行中',
    skills: ['Brainstorm 追问', '用户故事拆解', '验收标准生成'],
    tools: ['Brainstorm 对话', 'PRD 编辑器', 'PingCode 需求同步'],
    taskCount: 34,
    successRate: 97.1,
    acceptRate: 82.4,
    avgDurationMin: 26,
    lastActiveAt: '2026-03-19 17:40',
    desc: '面向产品经理，把业务方口述转为结构化 PRD 与可验收的用户故事',
  },
  {
    id: 'ag-arch',
    name: '架构设计 Agent',
    stageId: 'st-arch',
    stageName: '架构设计',
    modelId: 'mdl-gpt5',
    modelName: 'GPT-5',
    tone: 'brand',
    status: 'active',
    statusLabel: '运行中',
    skills: ['限界上下文划分', '接口契约生成', '任务自动拆解'],
    tools: ['架构画布', 'OpenAPI 契约', '任务拆解器'],
    taskCount: 18,
    successRate: 96.4,
    acceptRate: 80.2,
    avgDurationMin: 42,
    lastActiveAt: '2026-03-19 11:20',
    desc: '输出四层架构视图与 14 份接口契约，并把需求自动拆解为 24 个开发任务',
  },
  {
    id: 'ag-code',
    name: '编码实现 Agent',
    stageId: 'st-code',
    stageName: '编码实现',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    tone: 'info',
    status: 'active',
    statusLabel: '运行中',
    skills: ['结对编码', '单测同步生成', 'MR 生成'],
    tools: ['IDE 插件', 'AI 编码会话', 'GitLab MR'],
    taskCount: 96,
    successRate: 95.8,
    acceptRate: 79.6,
    avgDurationMin: 58,
    lastActiveAt: '2026-03-19 15:22',
    desc: '与工程师结对编码，按任务卡生成实现与单元测试，产出可评审 MR',
  },
  {
    id: 'ag-review',
    name: '代码评审 Agent',
    stageId: 'st-code',
    stageName: '编码实现',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    tone: 'indigo',
    status: 'active',
    statusLabel: '运行中',
    skills: ['规约检查', '缺陷模式识别', '评审批注生成'],
    tools: ['GitLab MR', 'SonarQube', '编码规约 KB-CODE-02'],
    taskCount: 88,
    successRate: 98.2,
    acceptRate: 85.1,
    avgDurationMin: 12,
    lastActiveAt: '2026-03-19 16:12',
    desc: '对每个 MR 做规约与缺陷模式检查，产出评审批注并拦截高风险合入',
  },
  {
    id: 'ag-test',
    name: '测试生成 Agent',
    stageId: 'st-test',
    stageName: '测试验证',
    modelId: 'mdl-deepseek',
    modelName: 'DeepSeek-V3',
    tone: 'teal',
    status: 'active',
    statusLabel: '运行中',
    skills: ['用例生成', '接口自动化', '缺陷复现与定位'],
    tools: ['用例库', '接口自动化', 'JMeter 压测'],
    taskCount: 124,
    successRate: 94.3,
    acceptRate: 74.8,
    avgDurationMin: 34,
    lastActiveAt: '2026-03-19 17:50',
    desc: '依据验收标准生成 248 条用例，执行回归并输出缺陷复现与定位信息',
  },
  {
    id: 'ag-ops',
    name: '部署运维 Agent',
    stageId: 'st-deploy',
    stageName: '部署发布',
    modelId: 'mdl-gpt5',
    modelName: 'GPT-5',
    tone: 'warn',
    status: 'idle',
    statusLabel: '待命',
    skills: ['门禁校验', '灰度分批执行', '回滚预案生成'],
    tools: ['GitLab CI', 'Argo Rollouts', 'Kubernetes'],
    taskCount: 27,
    successRate: 99.0,
    acceptRate: 87.5,
    avgDurationMin: 21,
    lastActiveAt: '2026-03-19 18:05',
    desc: '执行六道门禁校验与灰度分批发布，异常时生成回滚预案并告警',
  },
  {
    id: 'ag-ba',
    name: '可观测分析 Agent',
    stageId: 'st-observe',
    stageName: '运维观测',
    modelId: 'mdl-deepseek',
    modelName: 'DeepSeek-V3',
    tone: 'pink',
    status: 'active',
    statusLabel: '运行中',
    skills: ['根因分析', '异常聚类', '自愈建议'],
    tools: ['Prometheus', 'SkyWalking', 'Loki'],
    taskCount: 61,
    successRate: 93.6,
    acceptRate: 72.3,
    avgDurationMin: 9,
    lastActiveAt: '2026-03-19 18:00',
    desc: '采集指标 / 日志 / 链路三支柱数据，输出根因分析报告与自愈建议',
  },
];

/** 智能体执行轨迹步骤 */
export interface AgentTraceStepDef {
  name: string;
  at: string;
  status: string;
  tone: Tone;
}

/** 智能体执行轨迹 */
export interface AgentTraceDef {
  id: string;
  agentId: string;
  agentName: string;
  modelId: string;
  modelName: string;
  targetType: 'task' | 'bug' | 'requirement' | 'release' | 'pipeline';
  targetId: string;
  targetTitle: string;
  steps: AgentTraceStepDef[];
  tokenIn: number;
  tokenOut: number;
  latencyMs: number;
  result: string;
  tone: Tone;
  startedAt: string;
}

/** 5 条智能体执行轨迹（关联真实任务 / 缺陷 / 需求 / 流水线） */
export const agentTraces: AgentTraceDef[] = [
  {
    id: 'at-01',
    agentId: 'ag-code',
    agentName: '编码实现 Agent',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    targetType: 'task',
    targetId: 'TASK-2401',
    targetTitle: '幂等下单接口改造：Idempotency-Key 两级校验',
    steps: [
      { name: '读取任务卡与接口契约', at: '2026-03-18 14:02', status: '完成', tone: 'ok' },
      { name: '检索知识库 KB-CODE-02 / KB-ARCH-01', at: '2026-03-18 14:05', status: '完成', tone: 'ok' },
      { name: '生成幂等校验实现与单测', at: '2026-03-18 14:31', status: '完成', tone: 'ok' },
      { name: '本地测试全绿（T05）', at: '2026-03-18 15:22', status: '完成', tone: 'ok' },
    ],
    tokenIn: 12800,
    tokenOut: 6240,
    latencyMs: 2840,
    result: '生成 27 次提交、覆盖率 88%，进入自动化测试（T08）',
    tone: 'ai',
    startedAt: '2026-03-18 14:02',
  },
  {
    id: 'at-02',
    agentId: 'ag-test',
    agentName: '测试生成 Agent',
    modelId: 'mdl-deepseek',
    modelName: 'DeepSeek-V3',
    targetType: 'bug',
    targetId: 'BUG-1043',
    targetTitle: '优惠金额与订单金额合计不一致（资损级）',
    steps: [
      { name: '解析失败用例与日志聚类', at: '2026-03-19 09:40', status: '完成', tone: 'ok' },
      { name: '复现金额精度偏差', at: '2026-03-19 09:58', status: '完成', tone: 'ok' },
      { name: '定位 BigDecimal 精度丢失点', at: '2026-03-19 10:21', status: '完成', tone: 'ok' },
      { name: '生成修复建议并关联 MR-2410', at: '2026-03-19 16:08', status: '完成', tone: 'ok' },
    ],
    tokenIn: 9600,
    tokenOut: 4180,
    latencyMs: 1960,
    result: 'AI 首次命中根因，缺陷转入修复复检（fixing）',
    tone: 'danger',
    startedAt: '2026-03-19 09:40',
  },
  {
    id: 'at-03',
    agentId: 'ag-pm',
    agentName: '需求澄清 Agent',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    targetType: 'requirement',
    targetId: 'REQ-2401',
    targetTitle: '订单创建链路重构：幂等下单与本地消息表保障一致性',
    steps: [
      { name: 'Brainstorm 追问边界条件', at: '2026-03-02 09:10', status: '完成', tone: 'ok' },
      { name: '拆解用户故事 US-01~US-05', at: '2026-03-02 09:26', status: '完成', tone: 'ok' },
      { name: '生成验收标准与 PRD v2.3', at: '2026-03-02 09:30', status: '完成', tone: 'ok' },
    ],
    tokenIn: 7400,
    tokenOut: 3860,
    latencyMs: 2280,
    result: '产出 PRD v2.3 基线并同步 PingCode（PC-ORD-1024）',
    tone: 'ai',
    startedAt: '2026-03-02 09:10',
  },
  {
    id: 'at-04',
    agentId: 'ag-review',
    agentName: '代码评审 Agent',
    modelId: 'mdl-claude',
    modelName: 'Claude 3.7 Sonnet',
    targetType: 'pipeline',
    targetId: 'PIPE-2409',
    targetTitle: 'G3 编码门禁流水线（覆盖率 71.4% 未达标）',
    steps: [
      { name: '拉取 MR-2410 变更集', at: '2026-03-19 16:14', status: '完成', tone: 'ok' },
      { name: '规约与缺陷模式检查', at: '2026-03-19 16:18', status: '完成', tone: 'ok' },
      { name: '生成评审批注', at: '2026-03-19 16:22', status: '完成', tone: 'ok' },
      { name: 'G3 门禁判定：覆盖率 71.4% < 85%', at: '2026-03-19 16:26', status: '未通过', tone: 'danger' },
    ],
    tokenIn: 11400,
    tokenOut: 2620,
    latencyMs: 1420,
    result: 'G3 门禁失败（42 分），阻止发布单 REL-2403 推进',
    tone: 'warn',
    startedAt: '2026-03-19 16:14',
  },
  {
    id: 'at-05',
    agentId: 'ag-ops',
    agentName: '部署运维 Agent',
    modelId: 'mdl-gpt5',
    modelName: 'GPT-5',
    targetType: 'release',
    targetId: 'REL-2403',
    targetTitle: '订单中心重构 3 月发布单（灰度上线受阻）',
    steps: [
      { name: '校验发布前置门禁', at: '2026-03-19 18:02', status: '完成', tone: 'ok' },
      { name: '生成灰度分批计划 1%→10%→50%→100%', at: '2026-03-19 18:04', status: '完成', tone: 'ok' },
      { name: '评估回滚预案（RTO 10min）', at: '2026-03-19 18:05', status: '完成', tone: 'ok' },
      { name: '阻塞：G3 / G4 门禁未通过', at: '2026-03-19 18:06', status: '阻塞', tone: 'danger' },
    ],
    tokenIn: 15800,
    tokenOut: 3420,
    latencyMs: 3260,
    result: '发布单保持 blocked，等待 G3 覆盖率修复后重跑门禁',
    tone: 'warn',
    startedAt: '2026-03-19 18:02',
  },
];

/** RAG 知识库条目 */
export interface RagEntryDef {
  id: string;
  kbId: string;
  title: string;
  category: string;
  source: string;
  chunks: number;
  tokensK: number;
  embedModel: string;
  hitCount: number;
  updatedAt: string;
  status: 'ready' | 'indexing' | 'stale';
  tone: Tone;
  tags: string[];
}

/** 11 条 RAG 知识库条目（覆盖架构 / 编码 / 运维 / 测试 / 安全 / 业务） */
export const ragEntries: RagEntryDef[] = [
  {
    id: 'rag-01',
    kbId: 'KB-ARCH-01',
    title: '订单中心四层架构规范',
    category: '架构规范',
    source: '架构组 Confluence 基线 v1.8',
    chunks: 186,
    tokensK: 92,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 428,
    updatedAt: '2026-03-10',
    status: 'ready',
    tone: 'brand',
    tags: ['架构', '分层', '限界上下文'],
  },
  {
    id: 'rag-02',
    kbId: 'KB-ARCH-01',
    title: '限界上下文与聚合根边界约定',
    category: '架构规范',
    source: '架构评审纪要 ARCH-24-007',
    chunks: 74,
    tokensK: 38,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 246,
    updatedAt: '2026-03-13',
    status: 'ready',
    tone: 'brand',
    tags: ['聚合根', '边界', '拆解'],
  },
  {
    id: 'rag-03',
    kbId: 'KB-CODE-02',
    title: 'Java 编码规约与异常处理约定',
    category: '编码规约',
    source: '研发规范库 v3.2',
    chunks: 152,
    tokensK: 76,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 612,
    updatedAt: '2026-03-08',
    status: 'ready',
    tone: 'info',
    tags: ['Java', '规约', '异常'],
  },
  {
    id: 'rag-04',
    kbId: 'KB-CODE-05',
    title: '前端 Vue3 组件规范与性能约定',
    category: '编码规约',
    source: '前端规范库 v2.4',
    chunks: 118,
    tokensK: 58,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 284,
    updatedAt: '2026-03-11',
    status: 'ready',
    tone: 'teal',
    tags: ['Vue3', '组件', '性能'],
  },
  {
    id: 'rag-05',
    kbId: 'KB-OPS-01',
    title: '生产发布与灰度回滚手册',
    category: '运维手册',
    source: 'SRE 发布规范 v4.1',
    chunks: 96,
    tokensK: 47,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 198,
    updatedAt: '2026-03-09',
    status: 'ready',
    tone: 'warn',
    tags: ['发布', '灰度', '回滚'],
  },
  {
    id: 'rag-06',
    kbId: 'KB-OPS-01',
    title: '可观测性与告警处置手册',
    category: '运维手册',
    source: 'SRE 观测规范 v2.0',
    chunks: 84,
    tokensK: 41,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 156,
    updatedAt: '2026-03-12',
    status: 'ready',
    tone: 'warn',
    tags: ['可观测', '告警', '根因'],
  },
  {
    id: 'rag-07',
    kbId: 'KB-TEST-03',
    title: '接口自动化与用例设计规范',
    category: '测试规范',
    source: '测试中心规范库 v2.6',
    chunks: 132,
    tokensK: 64,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 342,
    updatedAt: '2026-03-14',
    status: 'ready',
    tone: 'teal',
    tags: ['用例', '自动化', '回归'],
  },
  {
    id: 'rag-08',
    kbId: 'KB-SEC-02',
    title: '数据脱敏与合规出域规范',
    category: '安全合规',
    source: '安全合规部 SEC-MASK-2.1',
    chunks: 108,
    tokensK: 52,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 204,
    updatedAt: '2026-03-15',
    status: 'ready',
    tone: 'danger',
    tags: ['脱敏', '出域', '合规'],
  },
  {
    id: 'rag-09',
    kbId: 'KB-SEC-02',
    title: '审计日志与权限最小化规范',
    category: '安全合规',
    source: '安全合规部 SEC-AUDIT-1.4',
    chunks: 76,
    tokensK: 36,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 142,
    updatedAt: '2026-03-16',
    status: 'indexing',
    tone: 'danger',
    tags: ['审计', 'RBAC', '最小权限'],
  },
  {
    id: 'rag-10',
    kbId: 'KB-BS-2401',
    title: '订单业务术语与领域词汇表',
    category: '业务知识',
    source: '产品中心业务词典 v1.2',
    chunks: 64,
    tokensK: 28,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 188,
    updatedAt: '2026-03-06',
    status: 'ready',
    tone: 'ai',
    tags: ['术语', '领域', '词汇'],
  },
  {
    id: 'rag-11',
    kbId: 'KB-CODE-02',
    title: '金额精度与 BigDecimal 使用规范',
    category: '编码规约',
    source: '研发规范库 v3.2 附录 C',
    chunks: 42,
    tokensK: 19,
    embedModel: 'bge-large-zh-v1.5',
    hitCount: 96,
    updatedAt: '2026-03-17',
    status: 'stale',
    tone: 'info',
    tags: ['金额', 'BigDecimal', '精度'],
  },
];

/* ============================================================
 * A5. 安全与审计
 * ============================================================ */

/** 数据出域策略模式：允许 / 脱敏后允许 / 禁止 */
export type EgressMode = 'ALLOW' | 'MASK' | 'DENY';

/** 数据出域策略定义（与 ENVIRONMENTS.egressPolicyId 对齐） */
export interface EgressPolicyDef {
  id: string;
  code: EgressMode;
  name: string;
  allowExternalModel: boolean;
  allowRawData: boolean;
  maxSecretLevel: string;
  envIds: string[];
  tone: Tone;
  desc: string;
  rules: string[];
}

/** 3 条数据出域策略（EGRESS-ALLOW / MASK / DENY） */
export const egressPolicy: EgressPolicyDef[] = [
  {
    id: 'EGRESS-ALLOW',
    code: 'ALLOW',
    name: '允许出域',
    allowExternalModel: true,
    allowRawData: true,
    maxSecretLevel: 'L1',
    envIds: ['env-dev'],
    tone: 'ok',
    desc: '开发环境允许调用外部公有云模型，仅限 L1 公开级数据与代码',
    rules: ['允许调用公有云模型', '允许非敏感原始数据出域', '禁止生产数据与密钥'],
  },
  {
    id: 'EGRESS-MASK',
    code: 'MASK',
    name: '脱敏后允许出域',
    allowExternalModel: true,
    allowRawData: false,
    maxSecretLevel: 'L2',
    envIds: ['env-test'],
    tone: 'warn',
    desc: '测试环境数据须经统一脱敏组件 SEC-MASK-2.1 处理后方可出域',
    rules: ['出域前强制脱敏（SEC-MASK-2.1）', '禁止原始 PII 与生产数据', '留作出域审计流水'],
  },
  {
    id: 'EGRESS-DENY',
    code: 'DENY',
    name: '禁止出域',
    allowExternalModel: false,
    allowRawData: false,
    maxSecretLevel: 'L3',
    envIds: ['env-staging', 'env-prod'],
    tone: 'danger',
    desc: '预发与生产环境禁止任何数据出域，模型路由强制切换为内网私有化 mdl-local',
    rules: ['禁止调用外部模型', '禁止任何数据出域', '仅内网私有化模型可承接'],
  },
];

/** 脱敏规则定义 */
export interface RedactRuleDef {
  id: string;
  name: string;
  field: string;
  category: string;
  strategy: string;
  sampleBefore: string;
  sampleAfter: string;
  scope: string;
  hits: number;
  tone: Tone;
  enabled: boolean;
  note: string;
}

/** 8 条字段级脱敏规则（SEC-MASK-2.1） */
export const redactRules: RedactRuleDef[] = [
  {
    id: 'rd-01',
    name: '手机号掩码',
    field: 'receiverPhone',
    category: '个人隐私 PII',
    strategy: '中间四位掩码',
    sampleBefore: '13815626621',
    sampleAfter: '138****6621',
    scope: '订单 / 客户',
    hits: 8642,
    tone: 'warn',
    enabled: true,
    note: '收货人手机号，出域与展示均做中间四位掩码',
  },
  {
    id: 'rd-02',
    name: '身份证号掩码',
    field: 'buyerIdCard',
    category: '个人隐私 PII',
    strategy: '保留前 6 后 4',
    sampleBefore: '330106199203124521',
    sampleAfter: '330106********4521',
    scope: '实名客户',
    hits: 2140,
    tone: 'warn',
    enabled: true,
    note: '实名认证信息，仅保留地域码与末四位',
  },
  {
    id: 'rd-03',
    name: '收货地址脱敏',
    field: 'receiverAddress',
    category: '个人隐私 PII',
    strategy: '保留省市区，详细地址掩码',
    sampleBefore: '浙江省杭州市西湖区文三路 90 号 3 幢 501 室',
    sampleAfter: '浙江省杭州市西湖区****',
    scope: '订单 / 物流',
    hits: 6218,
    tone: 'warn',
    enabled: true,
    note: '详细门牌号出域前一律掩码，物流面单走专线豁免',
  },
  {
    id: 'rd-04',
    name: '银行卡号掩码',
    field: 'payCardNo',
    category: '金融信息',
    strategy: '保留后四位',
    sampleBefore: '6222020200112233445',
    sampleAfter: '***************3445',
    scope: '支付 / 退款',
    hits: 1580,
    tone: 'danger',
    enabled: true,
    note: '支付卡号仅保留后四位，禁止任何明文出域',
  },
  {
    id: 'rd-05',
    name: '邮箱用户名掩码',
    field: 'buyerEmail',
    category: '个人隐私 PII',
    strategy: '用户名部分掩码，保留域名',
    sampleBefore: 'linshuyuan@example.com',
    sampleAfter: 'lin***@example.com',
    scope: '通知 / 会员',
    hits: 3420,
    tone: 'warn',
    enabled: true,
    note: '邮箱用户名保留前三位，域名保留以便排查投递问题',
  },
  {
    id: 'rd-06',
    name: '收货人姓名掩码',
    field: 'receiverName',
    category: '个人隐私 PII',
    strategy: '保留姓氏',
    sampleBefore: '林书言',
    sampleAfter: '林**',
    scope: '订单 / 物流',
    hits: 5906,
    tone: 'info',
    enabled: true,
    note: '仅保留姓氏，多字姓名全部掩码',
  },
  {
    id: 'rd-07',
    name: '订单金额区间模糊',
    field: 'orderAmount',
    category: '经营敏感',
    strategy: '非授权角色按区间模糊',
    sampleBefore: '¥3,286.50',
    sampleAfter: '¥1,000~5,000',
    scope: '订单 / 报表',
    hits: 1180,
    tone: 'info',
    enabled: true,
    note: '对无金额查看权限的角色展示金额区间，规避经营数据外泄',
  },
  {
    id: 'rd-08',
    name: '访问令牌全量替换',
    field: 'apiToken',
    category: '密钥凭证',
    strategy: '全量替换仅留后缀',
    sampleBefore: 'pc_live_8f3a9c2e7b14d05a6c88',
    sampleAfter: 'pc_live_****c88',
    scope: '集成配置 / 日志',
    hits: 246,
    tone: 'danger',
    enabled: true,
    note: '令牌、密钥、连接串在日志与界面一律全量替换',
  },
];

/** 审计日志条目 */
export interface AuditLogDef {
  id: string;
  time: string;
  actorId: string;
  actorName: string;
  actorTone: Tone;
  roleName: string;
  action: string;
  category: string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  ip: string;
  result: 'success' | 'denied' | 'failed';
  resultLabel: string;
  tone: Tone;
  detail: string;
}

/** 25 条安全审计流水（来源 IP 统一 10.24.x.x 内网段） */
export const auditLogs: AuditLogDef[] = [
  {
    id: 'al-0001',
    time: '2026-03-19 18:06',
    actorId: 'u-lin',
    actorName: '林知远',
    actorTone: 'brand',
    roleName: '研发管理者',
    action: '发布决策：判定 REL-2403 保持阻塞',
    category: '发布审批',
    targetType: '发布单',
    targetId: 'REL-2403',
    targetTitle: '订单中心重构 3 月发布单',
    ip: '10.24.18.63',
    result: 'success',
    resultLabel: '成功',
    tone: 'warn',
    detail: 'G3 覆盖率 71.4% 未达标，决策顺延发布并保留回滚预案',
  },
  {
    id: 'al-0002',
    time: '2026-03-19 18:05',
    actorId: 'u-lin',
    actorName: '林知远',
    actorTone: 'brand',
    roleName: '研发管理者',
    action: '角色切换：研发管理者 → 研发管理者',
    category: '身份认证',
    targetType: '会话',
    targetId: 'sess-lin-0319',
    targetTitle: '当前登录会话',
    ip: '10.24.18.63',
    result: 'success',
    resultLabel: '成功',
    tone: 'neutral',
    detail: 'MFA 二次校验通过，会话有效期 8 小时',
  },
  {
    id: 'al-0003',
    time: '2026-03-19 17:52',
    actorId: 'u-meng',
    actorName: '孟星回',
    actorTone: 'warn',
    roleName: '运维工程师',
    action: '提交发布顺延建议',
    category: '发布审批',
    targetType: '发布单',
    targetId: 'REL-2403',
    targetTitle: '订单中心重构 3 月发布单',
    ip: '10.24.31.20',
    result: 'success',
    resultLabel: '成功',
    tone: 'warn',
    detail: '建议 G5 预检失败后顺延至 03-20，等待 G3 修复',
  },
  {
    id: 'al-0004',
    time: '2026-03-19 17:50',
    actorId: 'u-meng',
    actorName: '孟星回',
    actorTone: 'warn',
    roleName: '运维工程师',
    action: '执行 G5 发布门禁预检',
    category: '质量门禁',
    targetType: '门禁',
    targetId: 'G5',
    targetTitle: '发布门禁',
    ip: '10.24.31.20',
    result: 'failed',
    resultLabel: '失败',
    tone: 'danger',
    detail: 'G5 预检未通过：上游 G3 / G4 未达标，发布单不可推进',
  },
  {
    id: 'al-0005',
    time: '2026-03-19 16:26',
    actorId: 'u-yan',
    actorName: '严慕舟',
    actorTone: 'indigo',
    roleName: '架构师',
    action: '执行 G3 编码门禁判定',
    category: '质量门禁',
    targetType: '流水线',
    targetId: 'PIPE-2409',
    targetTitle: 'G3 编码门禁流水线',
    ip: '10.24.22.14',
    result: 'failed',
    resultLabel: '失败',
    tone: 'danger',
    detail: 'G3 判定 42 分：分支覆盖率 71.4% 低于 85% 阈值',
  },
  {
    id: 'al-0006',
    time: '2026-03-19 16:12',
    actorId: 'u-shen',
    actorName: '沈亦白',
    actorTone: 'slate',
    roleName: '研发工程师',
    action: '提交代码变更 MR-2410',
    category: '代码变更',
    targetType: '任务',
    targetId: 'TASK-2410',
    targetTitle: '金额精度治理：BigDecimal 全链路统一',
    ip: '10.24.26.77',
    result: 'success',
    resultLabel: '成功',
    tone: 'info',
    detail: '关联 BUG-1043 修复，BigDecimal 全链路精度统一',
  },
  {
    id: 'al-0007',
    time: '2026-03-19 16:08',
    actorId: 'u-he',
    actorName: '何斯年',
    actorTone: 'amber',
    roleName: '测试工程师',
    action: '缺陷修复复检：BUG-1043 复现验证',
    category: '缺陷管理',
    targetType: '缺陷',
    targetId: 'BUG-1043',
    targetTitle: '优惠金额与订单金额合计不一致（资损级）',
    ip: '10.24.19.42',
    result: 'success',
    resultLabel: '成功',
    tone: 'danger',
    detail: '复检发现 9/128 组边界数据仍不平，缺陷维持修复中',
  },
  {
    id: 'al-0008',
    time: '2026-03-19 15:22',
    actorId: 'u-zhou',
    actorName: '周浩然',
    actorTone: 'info',
    roleName: '研发工程师',
    action: '任务状态流转：开发中 → 自动化测试中',
    category: '任务流转',
    targetType: '任务',
    targetId: 'TASK-2401',
    targetTitle: '幂等下单接口改造：Idempotency-Key 两级校验',
    ip: '10.24.20.35',
    result: 'success',
    resultLabel: '成功',
    tone: 'ok',
    detail: '本地测试全绿，提交 MR-2401 并进入自动化测试',
  },
  {
    id: 'al-0009',
    time: '2026-03-19 11:30',
    actorId: 'u-chen',
    actorName: '陈屿',
    actorTone: 'teal',
    roleName: '研发工程师',
    action: '提交合规导出实现',
    category: '代码变更',
    targetType: '任务',
    targetId: 'TASK-2423',
    targetTitle: '敏感字段脱敏导出',
    ip: '10.24.24.58',
    result: 'failed',
    resultLabel: '失败',
    tone: 'danger',
    detail: '合规模块字段校验失败：缺少 secretLevel 标记，生成缺陷 BUG-1052',
  },
  {
    id: 'al-0010',
    time: '2026-03-19 11:20',
    actorId: 'u-yan',
    actorName: '严慕舟',
    actorTone: 'indigo',
    roleName: '架构师',
    action: '架构评审：拆单聚合根边界确认',
    category: '架构评审',
    targetType: '任务',
    targetId: 'TASK-2415',
    targetTitle: '拆单引擎：多仓多商家拆单聚合根',
    ip: '10.24.22.14',
    result: 'success',
    resultLabel: '成功',
    tone: 'ok',
    detail: '确认拆单聚合根边界，解除 TASK-2415 架构阻塞',
  },
  {
    id: 'al-0011',
    time: '2026-03-19 09:02',
    actorId: 'u-lin',
    actorName: '林知远',
    actorTone: 'brand',
    roleName: '研发管理者',
    action: '同步队列重放：SYNC-0231 工作项同步',
    category: '集成同步',
    targetType: '任务',
    targetId: 'TASK-2401',
    targetTitle: '幂等下单接口改造：Idempotency-Key 两级校验',
    ip: '10.24.18.63',
    result: 'failed',
    resultLabel: '失败',
    tone: 'warn',
    detail: 'PingCode 限流 429，工作项同步进入指数退避重试',
  },
  {
    id: 'al-0012',
    time: '2026-03-19 08:55',
    actorId: 'u-meng',
    actorName: '孟星回',
    actorTone: 'warn',
    roleName: '运维工程师',
    action: '阻塞超 SLA 告警确认',
    category: '阻塞管理',
    targetType: '阻塞',
    targetId: 'BLOCK-0312',
    targetTitle: 'env-staging 压测资源占用导致复验排期延后',
    ip: '10.24.31.20',
    result: 'success',
    resultLabel: '成功',
    tone: 'warn',
    detail: '阻塞超 24h SLA，已通知责任人并登记技术债',
  },
  {
    id: 'al-0013',
    time: '2026-03-19 08:50',
    actorId: 'u-gu',
    actorName: '顾时衍',
    actorTone: 'pink',
    roleName: '项目经理PMO',
    action: '导出 Sprint 24 迭代进度报表',
    category: '数据导出',
    targetType: '迭代',
    targetId: 'SP-24',
    targetTitle: 'Sprint 24（2026-03-02 ~ 2026-03-27）',
    ip: '10.24.28.11',
    result: 'success',
    resultLabel: '成功',
    tone: 'info',
    detail: '导出内容已按脱敏规则处理，隐藏客户联系方式',
  },
  {
    id: 'al-0014',
    time: '2026-03-18 18:31',
    actorId: 'u-yan',
    actorName: '严慕舟',
    actorTone: 'indigo',
    roleName: '架构师',
    action: '确认甘特图冲突处理结果',
    category: '计划管理',
    targetType: '冲突',
    targetId: 'GANTT-CF-03',
    targetTitle: 'TASK-2408 与 TASK-2420 排期冲突',
    ip: '10.24.22.14',
    result: 'success',
    resultLabel: '成功',
    tone: 'ok',
    detail: '人工确认顺延 TASK-2420，冲突解除',
  },
  {
    id: 'al-0015',
    time: '2026-03-18 15:26',
    actorId: 'u-zhou',
    actorName: '周浩然',
    actorTone: 'info',
    roleName: '研发工程师',
    action: '任务创建并绑定 PingCode 工作项',
    category: '集成同步',
    targetType: '任务',
    targetId: 'TASK-2401',
    targetTitle: '幂等下单接口改造：Idempotency-Key 两级校验',
    ip: '10.24.20.35',
    result: 'success',
    resultLabel: '成功',
    tone: 'ok',
    detail: '平台任务与 PC-ORD-2401 完成双向绑定',
  },
  {
    id: 'al-0016',
    time: '2026-03-17 14:20',
    actorId: 'u-he',
    actorName: '何斯年',
    actorTone: 'amber',
    roleName: '测试工程师',
    action: '缺陷单创建：库存并发双扣',
    category: '缺陷管理',
    targetType: '缺陷',
    targetId: 'BUG-1045',
    targetTitle: '库存扣减与订单创建并发下双扣',
    ip: '10.24.19.42',
    result: 'success',
    resultLabel: '成功',
    tone: 'warn',
    detail: '混沌实验注入 RPC 超时复现，登记为 P0 缺陷',
  },
  {
    id: 'al-0017',
    time: '2026-03-17 10:04',
    actorId: 'u-su',
    actorName: '苏文瑾',
    actorTone: 'ai',
    roleName: '产品经理',
    action: '需求评审通过：REQ-2404 性能指标',
    category: '需求评审',
    targetType: '需求',
    targetId: 'REQ-2404',
    targetTitle: '订单查询性能达标：3000 TPS 且 P99 < 200ms',
    ip: '10.24.17.9',
    result: 'success',
    resultLabel: '成功',
    tone: 'ok',
    detail: '验收标准冻结：3000 TPS 且 P99 < 200ms',
  },
  {
    id: 'al-0018',
    time: '2026-03-16 09:12',
    actorId: 'u-lin',
    actorName: '林知远',
    actorTone: 'brand',
    roleName: '研发管理者',
    action: '变更脱敏规则：新增银行卡号掩码',
    category: '安全配置',
    targetType: '脱敏规则',
    targetId: 'rd-04',
    targetTitle: '银行卡号掩码',
    ip: '10.24.18.63',
    result: 'success',
    resultLabel: '成功',
    tone: 'warn',
    detail: '新增支付卡号掩码规则，仅保留后四位',
  },
  {
    id: 'al-0019',
    time: '2026-03-16 09:40',
    actorId: 'u-gu',
    actorName: '顾时衍',
    actorTone: 'pink',
    roleName: '项目经理PMO',
    action: '尝试导出生产原始订单明细（含 PII）',
    category: '数据导出',
    targetType: '数据集',
    targetId: 'DS-ORDER-PROD',
    targetTitle: '生产订单明细数据集',
    ip: '10.24.28.11',
    result: 'denied',
    resultLabel: '已拒绝',
    tone: 'danger',
    detail: '命中 EGRESS-DENY：生产数据禁止导出，已阻断并告警',
  },
  {
    id: 'al-0020',
    time: '2026-03-15 15:02',
    actorId: 'u-yan',
    actorName: '严慕舟',
    actorTone: 'indigo',
    roleName: '架构师',
    action: '调整模型路由：敏感代码强制私有化模型',
    category: '安全配置',
    targetType: '路由规则',
    targetId: 'rr-08',
    targetTitle: '敏感代码脱敏补全',
    ip: '10.24.22.14',
    result: 'success',
    resultLabel: '成功',
    tone: 'warn',
    detail: 'L2 及以上密级代码强制路由至 mdl-local，禁止出域',
  },
  {
    id: 'al-0021',
    time: '2026-03-14 10:26',
    actorId: 'u-meng',
    actorName: '孟星回',
    actorTone: 'warn',
    roleName: '运维工程师',
    action: '处理死信：SYNC-0188 工作项同步',
    category: '集成同步',
    targetType: '任务',
    targetId: 'TASK-2419',
    targetTitle: '订单数据迁移作业（双跑比对）',
    ip: '10.24.31.20',
    result: 'failed',
    resultLabel: '失败',
    tone: 'danger',
    detail: 'PC-ORD-2419 在 PingCode 侧已归档，重放失败转入死信',
  },
  {
    id: 'al-0022',
    time: '2026-03-13 17:26',
    actorId: 'u-yan',
    actorName: '严慕舟',
    actorTone: 'indigo',
    roleName: '架构师',
    action: '架构评审：分片方案确认',
    category: '架构评审',
    targetType: '任务',
    targetId: 'TASK-2413',
    targetTitle: '订单查询分片与读写分离',
    ip: '10.24.22.14',
    result: 'success',
    resultLabel: '成功',
    tone: 'ok',
    detail: '确认分片键与读写分离方案，TASK-2413 进入部署',
  },
  {
    id: 'al-0023',
    time: '2026-03-12 09:04',
    actorId: 'u-meng',
    actorName: '孟星回',
    actorTone: 'warn',
    roleName: '运维工程师',
    action: '创建阻塞单：BLOCK-0312',
    category: '阻塞管理',
    targetType: '阻塞',
    targetId: 'BLOCK-0312',
    targetTitle: 'env-staging 压测资源占用导致复验排期延后',
    ip: '10.24.31.20',
    result: 'success',
    resultLabel: '成功',
    tone: 'warn',
    detail: 'env-staging 资源被 TP-03 压测占用，登记阻塞单',
  },
  {
    id: 'al-0024',
    time: '2026-03-11 10:15',
    actorId: 'u-su',
    actorName: '苏文瑾',
    actorTone: 'ai',
    roleName: '产品经理',
    action: '需求创建并同步 PingCode',
    category: '需求评审',
    targetType: '需求',
    targetId: 'REQ-2408',
    targetTitle: '敏感字段统一脱敏与合规导出',
    ip: '10.24.17.9',
    result: 'success',
    resultLabel: '成功',
    tone: 'ok',
    detail: '创建合规需求并绑定 PC-ORD-1073，标注依赖 SEC-MASK-2.1',
  },
  {
    id: 'al-0025',
    time: '2026-03-02 09:30',
    actorId: 'u-su',
    actorName: '苏文瑾',
    actorTone: 'ai',
    roleName: '产品经理',
    action: 'SSO 登录（飞书扫码）',
    category: '身份认证',
    targetType: '会话',
    targetId: 'sess-su-0302',
    targetTitle: '当前登录会话',
    ip: '10.24.17.9',
    result: 'success',
    resultLabel: '成功',
    tone: 'neutral',
    detail: '通过飞书 OIDC 扫码登录，MFA 已开启',
  },
];

/** RBAC 权限维度 id */
export type RbacPermissionId = 'view' | 'edit' | 'approve' | 'admin';

/** RBAC 权限维度定义 */
export interface RbacPermissionDef {
  id: RbacPermissionId;
  name: string;
  desc: string;
}

/** RBAC 授权级别 */
export type RbacAccessLevel = 'full' | 'own' | 'readonly' | 'none';

/** RBAC 单元格 */
export interface RbacCellDef {
  level: RbacAccessLevel;
  label: string;
  tone: Tone;
}

/** RBAC 角色行 */
export interface RbacRowDef {
  roleId: string;
  roleName: string;
  roleTone: Tone;
  cells: Record<RbacPermissionId, RbacCellDef>;
}

/** RBAC 权限矩阵（7 角色 × 4 权限维度） */
export interface RbacMatrixDef {
  permissions: RbacPermissionDef[];
  currentRoleId: string;
  rows: RbacRowDef[];
}

/** 权限矩阵：研发管理者视角下的 7 角色授权配置 */
export const rbacMatrix: RbacMatrixDef = {
  currentRoleId: 'manager',
  permissions: [
    { id: 'view', name: '数据查看', desc: '查看需求、任务、缺陷、报表与审计流水' },
    { id: 'edit', name: '数据编辑', desc: '创建与修改需求、任务、缺陷及配置项' },
    { id: 'approve', name: '审批决策', desc: '门禁放行、发布审批、需求与架构评审决策' },
    { id: 'admin', name: '平台管理', desc: '角色权限、SSO、脱敏规则与集成配置管理' },
  ],
  rows: [
    {
      roleId: 'manager',
      roleName: '研发管理者',
      roleTone: 'brand',
      cells: {
        view: { level: 'full', label: '全部', tone: 'ok' },
        edit: { level: 'own', label: '本域', tone: 'info' },
        approve: { level: 'full', label: '全部', tone: 'ok' },
        admin: { level: 'own', label: '本域', tone: 'info' },
      },
    },
    {
      roleId: 'product',
      roleName: '产品经理',
      roleTone: 'ai',
      cells: {
        view: { level: 'full', label: '全部', tone: 'ok' },
        edit: { level: 'own', label: '本域', tone: 'info' },
        approve: { level: 'own', label: '需求验收', tone: 'info' },
        admin: { level: 'none', label: '无', tone: 'neutral' },
      },
    },
    {
      roleId: 'architect',
      roleName: '架构师',
      roleTone: 'indigo',
      cells: {
        view: { level: 'full', label: '全部', tone: 'ok' },
        edit: { level: 'own', label: '本域', tone: 'info' },
        approve: { level: 'own', label: '架构门禁', tone: 'info' },
        admin: { level: 'none', label: '无', tone: 'neutral' },
      },
    },
    {
      roleId: 'developer',
      roleName: '研发工程师',
      roleTone: 'info',
      cells: {
        view: { level: 'own', label: '本域', tone: 'info' },
        edit: { level: 'own', label: '本域', tone: 'info' },
        approve: { level: 'none', label: '无', tone: 'neutral' },
        admin: { level: 'none', label: '无', tone: 'neutral' },
      },
    },
    {
      roleId: 'tester',
      roleName: '测试工程师',
      roleTone: 'teal',
      cells: {
        view: { level: 'full', label: '全部', tone: 'ok' },
        edit: { level: 'own', label: '本域', tone: 'info' },
        approve: { level: 'own', label: '测试报告', tone: 'info' },
        admin: { level: 'none', label: '无', tone: 'neutral' },
      },
    },
    {
      roleId: 'ops',
      roleName: '运维工程师',
      roleTone: 'warn',
      cells: {
        view: { level: 'full', label: '全部', tone: 'ok' },
        edit: { level: 'own', label: '本域', tone: 'info' },
        approve: { level: 'own', label: '发布审批', tone: 'warn' },
        admin: { level: 'own', label: '本域', tone: 'info' },
      },
    },
    {
      roleId: 'pmo',
      roleName: '项目经理PMO',
      roleTone: 'pink',
      cells: {
        view: { level: 'full', label: '全部', tone: 'ok' },
        edit: { level: 'readonly', label: '只读', tone: 'neutral' },
        approve: { level: 'none', label: '无', tone: 'neutral' },
        admin: { level: 'own', label: '本域', tone: 'info' },
      },
    },
  ],
};

/** SSO 单点登录渠道 */
export interface SsoProviderDef {
  id: string;
  name: string;
  protocol: string;
  status: string;
  tone: Tone;
  enabled: boolean;
  boundUsers: number;
  lastLoginAt: string;
}

/** SSO 单点登录状态 */
export interface SsoStatusDef {
  enabled: boolean;
  primaryProvider: string;
  protocol: string;
  issuer: string;
  loginUrl: string;
  mfaRequired: boolean;
  sessionTimeoutMin: number;
  totalUsers: number;
  boundUsers: number;
  boundUserRate: number;
  enforcedRoles: string[];
  lastSyncAt: string;
  providers: SsoProviderDef[];
  notes: string[];
}

/** SSO 单点登录与账号安全状态 */
export const ssoStatus: SsoStatusDef = {
  enabled: true,
  primaryProvider: '飞书 SSO',
  protocol: 'OIDC',
  issuer: 'https://open.feishu.cn/oidc/artisan',
  loginUrl: 'https://console.artisan.internal/sso/feishu',
  mfaRequired: true,
  sessionTimeoutMin: 480,
  totalUsers: 10,
  boundUsers: 9,
  boundUserRate: 90,
  enforcedRoles: ['manager', 'ops', 'pmo'],
  lastSyncAt: '2026-03-19 18:00',
  providers: [
    {
      id: 'sso-feishu',
      name: '飞书 SSO',
      protocol: 'OIDC',
      status: '已启用',
      tone: 'ok',
      enabled: true,
      boundUsers: 9,
      lastLoginAt: '2026-03-19 18:05',
    },
    {
      id: 'sso-ldap',
      name: '企业 LDAP',
      protocol: 'LDAP v3',
      status: '待命（备用）',
      tone: 'info',
      enabled: false,
      boundUsers: 10,
      lastLoginAt: '2026-03-01 09:12',
    },
  ],
  notes: [
    '全部角色强制开启 MFA 二次校验，研发管理者 / 运维 / PMO 为强校验角色',
    'AI 研发智能体 u-ai-copilot 为系统账号，不参与 SSO 登录与 MFA 校验',
    'SSO 账号信息每 6 小时与平台用户目录全量对账一次',
  ],
};

/* ===== 数据层结束 ===== */

