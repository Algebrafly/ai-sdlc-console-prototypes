/**
 * 接口自动化测试（pageId: api-test）
 *
 * 能力对标 hifox：以冻结的接口契约（API_CONTRACTS）为输入，由 ag-test 自动生成接口用例、
 * 编排端到端场景链（变量提取 + 多层断言）、配置下游 Mock 与数据驱动集，经 Jenkins CI 触发后
 * 与 G3 / G4 / G5 / G6 门禁联动，最终汇总为迭代级测试报告并归档知识库。
 *
 * 与「测试中心」（pageId: test）的分工：测试中心管功能用例库与测试计划 / 报告，本页管接口级自动化。
 *
 * 标签页：
 *  1. cases       用例库 —— 16 条接口用例多维筛选 + 契约覆盖度分析 + flaky 治理
 *  2. scenarios   场景编排 —— 5 条场景链手绘 SVG 链路图 + 22 步明细 + AI 生成场景
 *  3. mock        Mock 与数据集 —— 8 条 Mock 规则 + 4 个数据驱动集（敏感列脱敏）
 *  4. runs        执行记录 —— 8 次归档执行 16 列表 + 通过率双轴趋势 + 构成堆叠条
 *  5. report      测试报告 —— apiTestReport 全量渲染 + 门禁影响（未通过则禁止签发）
 *  6. capability  hifox 能力与 CI 集成 —— HFX-01~06 能力卡 + CI/CD 拓扑 + 自动化编排流
 */
import React, { Fragment, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Filter,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers,
  Link2,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Target,
  Timer,
  Workflow,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  AI_AUTOMATION_FLOWS,
  AI_FLOW_TODAY,
  AI_TOOL_CAPABILITIES,
  AI_TOOL_PROVIDERS,
  API_CASES,
  API_SCENARIOS,
  API_SCENARIO_STEPS,
  API_TEST_RUNS,
  DATA_SETS,
  MOCK_RULES,
  apiTestReport,
} from '../data-ai-flow';
import type {
  ApiCaseDef,
  ApiScenarioDef,
  ApiScenarioStepDef,
  ApiTestRunDef,
  DataSetDef,
  MockRuleDef,
} from '../data-ai-flow';
import {
  API_CONTRACTS,
  API_CONTRACT_MAP,
  BUG_MAP,
  ENV_MAP,
  GATE_MAP,
  PIPELINE_MAP,
  ROLE_MAP,
  SDLC_STAGES,
  SPRINTS,
  TEST_MODULE_MAP,
  USER_MAP,
  agents,
  models,
  redactRules,
} from '../data';
import type { Tone } from '../data';
import './api-test.css';

/* ------------------------------------------------------------------ 常量 */

/** 语义色 → 十六进制（与 style.css 设计 token 一致，用于手绘 SVG） */
const TONE_HEX: Record<string, string> = {
  brand: '#4f46e5',
  ai: '#7c3aed',
  ok: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  teal: '#0d9488',
  neutral: '#94a3b8',
  indigo: '#4338ca',
  amber: '#b45309',
  pink: '#db2777',
  slate: '#64748b',
};

/** style.css 仅提供 7 种 ac-tag--{tone}，其余语义色归并到最接近的语义 */
const TAG_TONE: Record<Tone, string> = {
  brand: 'brand',
  ai: 'ai',
  ok: 'ok',
  warn: 'warn',
  danger: 'danger',
  info: 'info',
  neutral: 'neutral',
  slate: 'neutral',
  teal: 'ok',
  pink: 'danger',
  indigo: 'brand',
  amber: 'warn',
};

/** 语义色 → 头像色类（ac-avatar--{tone}） */
const AVATAR_TONE: Record<Tone, string> = {
  brand: 'ac-avatar--brand',
  ai: 'ac-avatar--ai',
  ok: 'ac-avatar--ok',
  warn: 'ac-avatar--warn',
  danger: 'ac-avatar--danger',
  info: 'ac-avatar--info',
  neutral: 'ac-avatar--slate',
  slate: 'ac-avatar--slate',
  teal: 'ac-avatar--teal',
  pink: 'ac-avatar--pink',
  indigo: 'ac-avatar--indigo',
  amber: 'ac-avatar--amber',
};

/** 语义色 → 文本色工具类 */
const TEXT_TONE: Record<Tone, string> = {
  brand: 'ac-brand-text',
  ai: 'ac-ai-text',
  ok: 'ac-ok-text',
  warn: 'ac-warn-text',
  danger: 'ac-danger-text',
  info: 'ac-info-text',
  neutral: 'ac-muted',
  slate: 'ac-text-2',
  teal: 'ac-ok-text',
  pink: 'ac-danger-text',
  indigo: 'ac-brand-text',
  amber: 'ac-warn-text',
};

type TabId = 'cases' | 'scenarios' | 'mock' | 'runs' | 'report' | 'capability';

const TABS: { id: TabId; name: string; icon: typeof Cpu }[] = [
  { id: 'cases', name: '用例库', icon: FlaskConical },
  { id: 'scenarios', name: '场景编排', icon: Workflow },
  { id: 'mock', name: 'Mock 与数据集', icon: Wrench },
  { id: 'runs', name: '执行记录', icon: ListChecks },
  { id: 'report', name: '测试报告', icon: FileText },
  { id: 'capability', name: 'hifox 能力与 CI 集成', icon: Cpu },
];

/** HTTP 方法 → 色标（GET 绿 / POST 蓝 / PUT 橙 / DELETE 红 / PATCH 紫） */
const METHOD_META: Record<string, { tone: string; hex: string }> = {
  GET: { tone: 'ok', hex: TONE_HEX.ok },
  POST: { tone: 'info', hex: TONE_HEX.info },
  PUT: { tone: 'warn', hex: TONE_HEX.warn },
  DELETE: { tone: 'danger', hex: TONE_HEX.danger },
  PATCH: { tone: 'ai', hex: TONE_HEX.ai },
  EVENT: { tone: 'neutral', hex: TONE_HEX.slate },
};

/** 契约状态 → 覆盖条着色 */
const CONTRACT_STATUS_HEX: Record<string, string> = {
  frozen: TONE_HEX.ok,
  reviewing: TONE_HEX.info,
  draft: TONE_HEX.warn,
  deprecated: TONE_HEX.slate,
};

const CASE_STATUS_META: Record<ApiCaseDef['status'], { label: string; tone: string }> = {
  active: { label: '在用', tone: 'ok' },
  draft: { label: '草稿', tone: 'info' },
  deprecated: { label: '废弃', tone: 'neutral' },
  flaky: { label: '抖动', tone: 'warn' },
};

const RUN_RESULT_META: Record<ApiCaseDef['lastRunStatus'], { label: string; tone: string }> = {
  passed: { label: '通过', tone: 'ok' },
  failed: { label: '失败', tone: 'danger' },
  blocked: { label: '阻塞', tone: 'warn' },
  skipped: { label: '跳过', tone: 'neutral' },
  pending: { label: '未执行', tone: 'info' },
};

const SOURCE_META: Record<ApiCaseDef['source'], { label: string; tone: string }> = {
  'ai-generated': { label: 'AI 生成', tone: 'ai' },
  imported: { label: '脚本导入', tone: 'info' },
  manual: { label: '人工编写', tone: 'neutral' },
};

const CASE_TYPE_TONE: Record<ApiCaseDef['caseType'], Tone> = {
  正向: 'ok',
  异常: 'warn',
  边界: 'info',
  幂等: 'brand',
  并发: 'pink',
  安全: 'danger',
  性能: 'teal',
};

const TRIGGER_META: Record<ApiTestRunDef['triggerType'], { label: string; tone: string }> = {
  manual: { label: '手动触发', tone: 'neutral' },
  ci: { label: 'CI 触发', tone: 'info' },
  schedule: { label: '定时调度', tone: 'brand' },
  event: { label: '事件触发', tone: 'ai' },
};

const STEP_TYPE_META: Record<
  ApiScenarioStepDef['stepType'],
  { label: string; tone: Tone; shape: string; note: string }
> = {
  request: { label: '请求', tone: 'info', shape: 'rect', note: '发起一次接口调用' },
  assert: { label: '断言', tone: 'ok', shape: 'double', note: '校验响应 / DB / 耗时' },
  extract: { label: '变量提取', tone: 'ai', shape: 'parallelogram', note: '按 JSONPath 提取上下文变量' },
  wait: { label: '等待', tone: 'slate', shape: 'pill', note: '固定等待窗口' },
  condition: { label: '条件分支', tone: 'warn', shape: 'diamond', note: '条件成立才执行断言组' },
  loop: { label: '循环', tone: 'indigo', shape: 'loop', note: '按数据驱动集逐行循环' },
};

const ASSERT_TYPE_META: Record<string, { label: string; tone: string }> = {
  status: { label: '状态码', tone: 'info' },
  jsonpath: { label: 'JSONPath', tone: 'brand' },
  schema: { label: 'Schema', tone: 'ai' },
  duration: { label: '耗时', tone: 'teal' },
  db: { label: '数据库', tone: 'warn' },
};

const ON_FAIL_META: Record<string, { label: string; tone: string }> = {
  abort: { label: '中断场景', tone: 'danger' },
  continue: { label: '继续执行', tone: 'warn' },
  retry: { label: '重试', tone: 'info' },
};

const RESPONSE_TYPE_META: Record<MockRuleDef['responseType'], { label: string; tone: string }> = {
  static: { label: '静态响应', tone: 'ok' },
  template: { label: '模板响应', tone: 'info' },
  delay: { label: '延迟注入', tone: 'warn' },
  error: { label: '错误注入', tone: 'danger' },
  'dynamic-ai': { label: 'AI 动态生成', tone: 'ai' },
};

const DATASET_SOURCE_META: Record<DataSetDef['sourceType'], { label: string; tone: string }> = {
  csv: { label: 'CSV 导入', tone: 'neutral' },
  database: { label: '数据库抽样', tone: 'info' },
  'ai-generated': { label: 'AI 生成', tone: 'ai' },
  'production-sample': { label: '生产采样', tone: 'warn' },
};

const AUTOMATION_META: Record<string, { label: string; tone: string }> = {
  full: { label: '全自动', tone: 'ok' },
  assisted: { label: '人机协同', tone: 'ai' },
  manual: { label: '人工', tone: 'neutral' },
};

const CASE_SORT_KEYS = [
  'id',
  'priority',
  'passRatePct',
  'avgDurationMs',
  'p95DurationMs',
  'runCount',
  'assertionCount',
  'lastRunAt',
] as const;

type CaseSortKey = (typeof CASE_SORT_KEYS)[number];

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

/**
 * 8 条失败用例的断言现场（由 API_CASES.desc 与 API_SCENARIO_STEPS 的真实断言表达式推导，
 * 仅用于抽屉展示「期望 vs 实际」，不回写数据层）。
 */
const FAIL_DETAIL: Record<
  string,
  { expr: string; expected: string; actual: string; rootCause: string; bugId: string }
> = {
  'AC-02': {
    expr: '$.data.state',
    expected: 'PAID（binlog 广播后 3 秒内不得脏读）',
    actual: 'CREATING（Caffeine 本地层仍返回旧值，dataVersion 未递增）',
    rootCause: 'Canal 消费 binlog 后只失效了 Redis 层，本地缓存层未订阅失效广播',
    bugId: 'BUG-1048',
  },
  'AC-03': {
    expr: 'SELECT COUNT(*) FROM `order` WHERE idempotency_key = ${ctx.idempotencyKey} AND state = "CREATING"',
    expected: '0（无半提交残留）',
    actual: '2（Redis SETNX 超时回落期间事务已写主表）',
    rootCause: '幂等记录写入与订单主表写入未收敛进同一本地事务，SETNX 超时后无补偿删除',
    bugId: 'BUG-1045',
  },
  'AC-05': {
    expr: 'sum($.data.allocations[*].amount) - $.data.payableAmount',
    expected: '0.00',
    actual: '-0.01（128 组中 3 组负向分摊恒定尾差）',
    rootCause: 'AmountAllocator 逐行 setScale(2, HALF_UP) 且余数未归集到金额绝对值最大行',
    bugId: 'BUG-1043',
  },
  'AC-08': {
    expr: 'p95(stateTransitions)',
    expected: '<=200ms',
    actual: '380ms（同步写 order_state_log 阻塞主链路）',
    rootCause: '状态流水在主事务内同步落库，高并发下 P95 抬升；改异步后已回落至 62ms，耗时断言仍存约 7% 抖动',
    bugId: 'BUG-1055',
  },
  'AC-09': {
    expr: 'SELECT COUNT(*) FROM order_state_log WHERE order_no = ${ctx.rowOrderNo} AND to_state = "CLOSED"',
    expected: '1',
    actual: '3（20 线程并发取消产生重复流水，下游收到 3 次事件）',
    rootCause: '取消入口缺少统一事务边界与幂等写入，事件投递未做去重',
    bugId: 'BUG-1046',
  },
  'AC-12': {
    expr: 'p95(orderList)',
    expected: '<=200ms',
    actual: '342ms（10 万偏移处退化为跨 8 分片归并排序）',
    rootCause: '游标分页未在分片内做局部游标，ES 聚合与排序未下推',
    bugId: 'BUG-1047',
  },
  'AC-14': {
    expr: 'response.status',
    expected: '403（EXPORT_NEED_APPROVAL）',
    actual: '200（未接入审批中心，直接产出导出文件）',
    rootCause: 'OrderExportController 仅校验登录态，@SecondaryAuth 与 ExportAuditAspect 均未覆盖导出方法',
    bugId: 'BUG-1052',
  },
  'AC-15': {
    expr: 'csv.scan(${ctx.exportUrl}, sensitivePatterns).hits',
    expected: '0',
    actual: '1,000（addressDetail 列全量明文输出完整门牌号）',
    rootCause: '导出通道未接入 ac-mask-sdk（SEC-MASK-2.1），接口出口已脱敏而导出侧漏网',
    bugId: 'BUG-1054',
  },
};

/** flaky 用例的 AI 稳定性诊断（对 status=flaky 的用例逐条给出） */
const FLAKY_DIAGNOSIS: Record<string, { cause: string; evidence: string; action: string; gain: string }> = {
  'AC-08': {
    cause: '耗时断言 p95(stateTransitions) <= 200ms 在共享压测节点上受邻居负载干扰，实测抖动区间 58~214ms，跨阈值概率约 7%。',
    evidence: '4 次归档执行中 03-16（AR-04）因同步写流水失败、03-17（AR-05）修复后通过；抖动只出现在 duration 类断言，status / db 类断言 100% 稳定。',
    action: '把 duration 断言的 onFail 从 continue 提升为 retry（重试 2 次取中位数），并将压测场景 AS-04 绑定到独占节点池 node-perf-01~03。',
    gain: '预计 flaky 率由 7.4% 降至 ≤ 2%，AS-01 场景端到端耗时增加约 12s。',
  },
};

/** AI 补充边界用例的模板（乐观新增到本地列表，不回写数据层） */
function makeBoundaryCase(base: ApiCaseDef, seq: number): ApiCaseDef {
  return {
    ...base,
    id: `AC-AI-${String(seq).padStart(2, '0')}`,
    name: `${base.id} 边界补全：必填字段缺失 / 超长字符串 / 非法字符三组负例`,
    caseType: '边界',
    priority: 'P1',
    source: 'ai-generated',
    generatedBy: 'ag-test',
    status: 'draft',
    lastRunStatus: 'pending',
    lastRunAt: '尚未执行',
    avgDurationMs: Math.max(20, Math.round(base.avgDurationMs * 0.6)),
    p95DurationMs: Math.max(26, Math.round(base.p95DurationMs * 0.6)),
    passRatePct: 0,
    runCount: 0,
    assertionCount: 6,
    steps: [
      {
        order: 1,
        action: `去掉 ${base.variables[0] ?? 'orderNo'} 必填字段后重放 ${base.method} ${base.path}`,
        expect: 'HTTP 400，code=PARAM_MISSING，message 指明缺失字段名',
      },
      {
        order: 2,
        action: '把字符串字段长度扩到契约上限 +1（超长 1 字符）',
        expect: 'HTTP 422，code=PARAM_TOO_LONG，不得触发 5xx 与慢查询',
      },
      {
        order: 3,
        action: '注入 SQL 片段、脚本标签与 Emoji 组合字符',
        expect: 'HTTP 422 或按原样转义存储，响应体不回显原始注入串，审计留痕 1 条',
      },
    ],
    variables: base.variables,
    tags: [...base.tags.slice(0, 2), 'AI 补全', 'draft'],
    tone: 'ai',
    desc: `由 ag-test 基于 ${base.apiContractId} 契约 Schema 与 ${base.id} 的既有断言反向推导的边界负例草稿，需人工复核后转为 active 并挂入场景。`,
  };
}

/** AI 生成场景演示的编排草案（契约 API-04 取消订单 + 补偿一致性目标） */
const AI_SCENARIO_DRAFT = {
  contractId: 'API-04',
  goal: '取消订单全链路：取消落库 → 库存释放 → 优惠退回 → 领域事件仅投递一次',
  reasoning: [
    {
      title: '识别上下游依赖',
      detail:
        '从 API-04 的契约 Schema 与 KD-15 切片解析出取消动作会触发库存释放（/warehouse/api/v1/stock/release）与优惠退回（/promo-center/api/v1/coupon/release），并外发 trade.order.state.changed 事件；三者均为异步，需要在场景内插入等待窗口。',
    },
    {
      title: '确定变量提取点',
      detail:
        '在第 1 步响应中提取 orderNo 与 transitionId（$.data.orderNo / $.data.transitionId），在第 2 步提取 releaseToken，供后续 DB 断言与事件断言复用，避免硬编码。',
    },
    {
      title: '生成多层断言',
      detail:
        '按 hifox 五类断言补齐：status（200 / 409）、jsonpath（$.data.to == CLOSED）、db（order_state_log 恰好 1 条、promo_apply_log 状态 RELEASED）、duration（p95 <= 200ms）、schema（事件信封符合 CloudEvents 1.0）。',
    },
    {
      title: '插入等待与条件分支',
      detail:
        '在库存释放后插入 wait 1500ms 等待 outbox 中继投递；对「订单已发货不可取消」增加 condition 分支（order.shipped == false），条件不成立时走 409 断言组而不是中断整个场景。',
    },
  ],
  steps: [
    {
      order: 1,
      stepType: 'request' as const,
      name: '取消未支付订单（reason=USER_CANCEL）',
      extractVars: [
        { name: 'orderNo', fromPath: '$.data.orderNo', toJsonPath: '$.ctx.orderNo' },
        { name: 'transitionId', fromPath: '$.data.transitionId', toJsonPath: '$.ctx.transitionId' },
      ],
      assertions: [
        { type: 'status' as const, expr: 'response.status', expected: '200', onFail: 'abort' as const },
        { type: 'jsonpath' as const, expr: '$.data.to', expected: 'CLOSED', onFail: 'abort' as const },
      ],
      conditionExpr: null,
      loopOver: null,
    },
    {
      order: 2,
      stepType: 'extract' as const,
      name: '提取库存释放令牌供后续补偿断言',
      extractVars: [{ name: 'releaseToken', fromPath: '$.data.releaseToken', toJsonPath: '$.ctx.releaseToken' }],
      assertions: [{ type: 'jsonpath' as const, expr: '$.data.releaseToken', expected: 'notBlank', onFail: 'abort' as const }],
      conditionExpr: null,
      loopOver: null,
    },
    {
      order: 3,
      stepType: 'wait' as const,
      name: '等待 outbox 中继投递领域事件（1500ms）',
      extractVars: [],
      assertions: [],
      conditionExpr: null,
      loopOver: null,
    },
    {
      order: 4,
      stepType: 'condition' as const,
      name: '已发货分支：断言 409 且不得产生释放记录',
      extractVars: [],
      assertions: [
        { type: 'jsonpath' as const, expr: '$.code', expected: 'ORDER_STATE_ILLEGAL', onFail: 'continue' as const },
        {
          type: 'db' as const,
          expr: 'SELECT COUNT(*) FROM stock_release_log WHERE order_no = ${ctx.orderNo}',
          expected: '0',
          onFail: 'abort' as const,
        },
      ],
      conditionExpr: 'order.shipped == true',
      loopOver: null,
    },
    {
      order: 5,
      stepType: 'assert' as const,
      name: '流水与事件唯一性断言（防重复取消）',
      extractVars: [],
      assertions: [
        {
          type: 'db' as const,
          expr: 'SELECT COUNT(*) FROM order_state_log WHERE transition_id = ${ctx.transitionId}',
          expected: '1',
          onFail: 'abort' as const,
        },
        {
          type: 'jsonpath' as const,
          expr: 'mq.count(trade.order.state.changed, orderNo=${ctx.orderNo})',
          expected: '1',
          onFail: 'abort' as const,
        },
        { type: 'duration' as const, expr: 'p95(cancelOrder)', expected: '<=200ms', onFail: 'continue' as const },
      ],
      conditionExpr: null,
      loopOver: null,
    },
  ],
};

/* ------------------------------------------------------------------ 工具函数 */

/** 跳转到其他原型页面 */
function jump(page: string) {
  window.location.hash = `#page=${page}`;
}

/** 数字千分位 */
function num(v: number) {
  return v.toLocaleString('zh-CN');
}

/** 毫秒 → 人类可读时长 */
function fmtMs(ms: number) {
  if (ms <= 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const min = Math.floor(sec / 60);
  const rest = Math.round(sec - min * 60);
  return `${min} 分 ${rest} 秒`;
}

/** 保留 1 位小数 */
function pct1(v: number) {
  return `${v.toFixed(1)}%`;
}

/** userId → 姓名（含 ci / schedule / ai 等非用户触发者） */
function ownerName(id: string) {
  if (id === 'ci') return 'Jenkins CI';
  if (id === 'schedule') return '调度器';
  if (id === 'ai' || id === 'u-ai-copilot') return 'Artisan Copilot';
  return USER_MAP[id]?.name ?? id;
}

/** userId → 头像首字 */
function ownerInitial(id: string) {
  if (id === 'ci') return 'CI';
  if (id === 'schedule') return '定';
  if (id === 'ai' || id === 'u-ai-copilot') return 'AI';
  return USER_MAP[id]?.initial ?? id.slice(0, 1).toUpperCase();
}

/** userId → 头像色类 */
function ownerAvatar(id: string) {
  if (id === 'ci' || id === 'schedule') return 'ac-avatar--slate';
  const tone = USER_MAP[id]?.avatarColor;
  return tone ? AVATAR_TONE[tone] : 'ac-avatar--slate';
}

/** agentId → Agent 名 */
function agentName(id: string | null) {
  if (!id) return '—';
  return agents.find((a) => a.id === id)?.name ?? id;
}

/** 由 runCount 与 passRatePct 反推每次执行的累计通过率序列（前 N 次失败、其后通过） */
function passRateSeries(c: ApiCaseDef): number[] {
  if (c.runCount <= 0) return [];
  const passes = Math.round((c.passRatePct / 100) * c.runCount);
  const fails = c.runCount - passes;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < c.runCount; i += 1) {
    if (i >= fails) acc += 1;
    out.push(Math.round((acc / (i + 1)) * 1000) / 10);
  }
  return out;
}

/* ------------------------------------------------------------------ 手绘 SVG 图表 */

/** 契约覆盖率条：14 份契约逐格着色，覆盖为实色、未覆盖为虚线灰格 */
function CoverageStrip({ coveredIds }: { coveredIds: Set<string> }) {
  const W = 720;
  const H = 52;
  const gap = 4;
  const segW = (W - gap * (API_CONTRACTS.length - 1)) / API_CONTRACTS.length;
  return (
    <svg
      className="ac-at-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`接口契约自动化覆盖率：${coveredIds.size} / ${API_CONTRACTS.length} 份契约已建接口用例`}
    >
      {API_CONTRACTS.map((c, i) => {
        const on = coveredIds.has(c.id);
        const x = i * (segW + gap);
        return (
          <g key={c.id}>
            <rect
              x={x}
              y={6}
              width={segW}
              height={26}
              rx={4}
              fill={on ? CONTRACT_STATUS_HEX[c.status] ?? TONE_HEX.ok : '#eef1f5'}
              stroke={on ? 'none' : '#cfd6e0'}
              strokeDasharray={on ? undefined : '3 3'}
            />
            <text className="ac-at-svg-seg" x={x + segW / 2} y={24} textAnchor="middle">
              {c.id.replace('API-', '')}
            </text>
            <text className="ac-at-svg-cap" x={x + segW / 2} y={46} textAnchor="middle">
              {on ? '已覆盖' : '未覆盖'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 迷你折线：单条用例的历史累计通过率 */
function MiniSparkline({ points, tone }: { points: number[]; tone: Tone }) {
  const W = 148;
  const H = 36;
  const pad = 4;
  const color = TONE_HEX[tone] ?? TONE_HEX.brand;
  if (points.length === 0) {
    return (
      <svg className="ac-at-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="尚无归档执行记录">
        <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#dfe3e9" strokeDasharray="3 3" />
        <text className="ac-at-svg-cap" x={W / 2} y={H / 2 - 5} textAnchor="middle">
          无归档执行
        </text>
      </svg>
    );
  }
  const stepX = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const yOf = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const coords = points.map((v, i) => ({ x: pad + i * stepX, y: yOf(v) }));
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${H - pad} L ${coords[0].x.toFixed(1)} ${H - pad} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg
      className="ac-at-svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`近 ${points.length} 次归档执行的累计通过率趋势，最新 ${points[points.length - 1]}%`}
    >
      <line x1={pad} y1={yOf(100)} x2={W - pad} y2={yOf(100)} stroke="#eef1f5" />
      <line x1={pad} y1={yOf(50)} x2={W - pad} y2={yOf(50)} stroke="#eef1f5" />
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 2.8 : 1.8} fill={color} />
      ))}
      <text className="ac-at-svg-value" x={last.x} y={Math.max(9, last.y - 6)} textAnchor="end">
        {points[points.length - 1]}%
      </text>
    </svg>
  );
}

interface DonutItem {
  label: string;
  value: number;
  tone: Tone;
}

/** 通用环形图（手绘 SVG 弧线） */
function DonutChart({
  items,
  size = 168,
  thickness = 22,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  items: DonutItem[];
  size?: number;
  thickness?: number;
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = (size - thickness) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  let cursor = -Math.PI / 2;
  const arcs = items
    .filter((i) => i.value > 0)
    .map((i) => {
      const span = total > 0 ? (i.value / total) * Math.PI * 2 : 0;
      const start = cursor;
      const end = cursor + Math.max(span, 0.0001);
      cursor += span;
      const p1 = { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) };
      const p2 = { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) };
      const large = end - start > Math.PI ? 1 : 0;
      return {
        key: i.label,
        d: `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
        color: TONE_HEX[i.tone] ?? TONE_HEX.brand,
        label: i.label,
        value: i.value,
      };
    });
  return (
    <div className="ac-at-donut-wrap">
      <svg
        className="ac-at-svg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={ariaLabel}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f5" strokeWidth={thickness} />
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={thickness} strokeLinecap="butt" />
        ))}
        <text className="ac-at-donut-value" x={cx} y={cy + 2} textAnchor="middle">
          {centerValue}
        </text>
        <text className="ac-at-donut-label" x={cx} y={cy + 18} textAnchor="middle">
          {centerLabel}
        </text>
      </svg>
      <div className="ac-legend">
        {items.map((i) => (
          <div className="ac-legend-item" key={i.label}>
            <span className="ac-legend-swatch" style={{ background: TONE_HEX[i.tone] }} />
            {i.label}
            <span className="ac-legend-value">
              {i.value}
              {total > 0 ? ` · ${((i.value / total) * 100).toFixed(1)}%` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 8 次执行：通过率折线（左轴）+ 耗时柱（右轴）双轴图 */
function PassRateDualAxis({ runs }: { runs: ApiTestRunDef[] }) {
  const W = 860;
  const H = 250;
  const padL = 44;
  const padR = 54;
  const padT = 18;
  const padB = 42;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxDur = Math.max(...runs.map((r) => r.durationMs), 1);
  const slot = chartW / runs.length;
  const yRate = (v: number) => padT + chartH - (v / 100) * chartH;
  const yDur = (v: number) => padT + chartH - (v / maxDur) * chartH;
  const ratePts = runs.map((r, i) => ({ x: padL + slot * i + slot / 2, y: yRate(r.passRatePct), run: r }));
  const ratePath = ratePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <svg
      className="ac-at-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="8 次归档执行的通过率折线与端到端耗时柱状双轴对比"
    >
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={padL} y1={yRate(v)} x2={W - padR} y2={yRate(v)} stroke="#eef1f5" />
          <text className="ac-at-svg-axis" x={padL - 7} y={yRate(v) + 4} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      {[0, 0.5, 1].map((f) => (
        <text key={f} className="ac-at-svg-axis" x={W - padR + 7} y={yDur(maxDur * f) + 4}>
          {Math.round((maxDur * f) / 1000)}s
        </text>
      ))}
      {runs.map((r, i) => {
        const bw = slot * 0.44;
        const x = padL + slot * i + (slot - bw) / 2;
        const y = yDur(r.durationMs);
        return (
          <g key={r.id}>
            <rect x={x} y={y} width={bw} height={padT + chartH - y} rx={3} fill={TONE_HEX.info} opacity={0.22} />
            <text className="ac-at-svg-axis" x={padL + slot * i + slot / 2} y={H - 24} textAnchor="middle">
              {r.id}
            </text>
            <text className="ac-at-svg-cap" x={padL + slot * i + slot / 2} y={H - 10} textAnchor="middle">
              {r.startedAt.slice(5, 10)}
            </text>
          </g>
        );
      })}
      {/* G4 门禁期望线：通过率 100% */}
      <line
        x1={padL}
        y1={yRate(100)}
        x2={W - padR}
        y2={yRate(100)}
        stroke={TONE_HEX.danger}
        strokeDasharray="4 3"
        strokeWidth={1}
      />
      <path d={ratePath} fill="none" stroke={TONE_HEX.brand} strokeWidth={2.2} strokeLinejoin="round" />
      {ratePts.map((p) => (
        <g key={p.run.id}>
          <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke={TONE_HEX[p.run.tone] ?? TONE_HEX.brand} strokeWidth={2.4} />
          <text className="ac-at-svg-value" x={p.x} y={p.y - 9} textAnchor="middle">
            {p.run.passRatePct}%
          </text>
        </g>
      ))}
      <text className="ac-at-svg-axis" x={padL} y={12}>
        左轴 通过率
      </text>
      <text className="ac-at-svg-axis" x={W - padR} y={12} textAnchor="end">
        右轴 端到端耗时
      </text>
    </svg>
  );
}

/** 每次执行的 passed / failed / blocked / skipped 堆叠构成 */
function RunStackBars({ runs }: { runs: ApiTestRunDef[] }) {
  const W = 860;
  const H = 210;
  const padL = 34;
  const padR = 12;
  const padT = 16;
  const padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxTotal = Math.max(...runs.map((r) => r.totalCases), 1);
  const slot = chartW / runs.length;
  const bw = Math.min(slot * 0.5, 46);
  const parts: { key: keyof Pick<ApiTestRunDef, 'passed' | 'failed' | 'blocked' | 'skipped'>; label: string; hex: string }[] = [
    { key: 'passed', label: '通过', hex: TONE_HEX.ok },
    { key: 'failed', label: '失败', hex: TONE_HEX.danger },
    { key: 'blocked', label: '阻塞', hex: TONE_HEX.warn },
    { key: 'skipped', label: '跳过', hex: TONE_HEX.slate },
  ];
  return (
    <svg
      className="ac-at-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="8 次归档执行的用例结果构成堆叠条形图"
    >
      {[0, 1, 2, 3, 4].map((v) => (
        <g key={v}>
          <line x1={padL} y1={padT + chartH - (v / maxTotal) * chartH} x2={W - padR} y2={padT + chartH - (v / maxTotal) * chartH} stroke="#eef1f5" />
          <text className="ac-at-svg-axis" x={padL - 6} y={padT + chartH - (v / maxTotal) * chartH + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {runs.map((r, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        let acc = 0;
        return (
          <g key={r.id}>
            {parts.map((p) => {
              const v = r[p.key];
              if (v <= 0) return null;
              const h = (v / maxTotal) * chartH;
              const y = padT + chartH - acc - h;
              acc += h;
              return (
                <g key={p.key}>
                  <rect x={x} y={y} width={bw} height={h} fill={p.hex} opacity={0.9}>
                    <title>{`${r.id} · ${p.label} ${v} 条`}</title>
                  </rect>
                  {h > 13 ? (
                    <text className="ac-at-svg-seg-light" x={x + bw / 2} y={y + h / 2 + 4} textAnchor="middle">
                      {v}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <text className="ac-at-svg-axis" x={x + bw / 2} y={H - 18} textAnchor="middle">
              {r.id}
            </text>
            <text className="ac-at-svg-cap" x={x + bw / 2} y={H - 5} textAnchor="middle">
              {r.totalCases} 例
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 报告 byModule：用例数 / 缺陷数分组柱 + 通过率折线 */
function ModuleGroupedBars({
  rows,
}: {
  rows: { moduleId: string; moduleName: string; caseCount: number; bugCount: number; passRatePct: number; tone: Tone }[];
}) {
  const W = 780;
  const H = 250;
  const padL = 40;
  const padR = 46;
  const padT = 20;
  const padB = 46;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxCount = Math.max(...rows.map((r) => Math.max(r.caseCount, r.bugCount)), 1);
  const slot = chartW / rows.length;
  const bw = Math.min(slot * 0.26, 26);
  const yCount = (v: number) => padT + chartH - (v / maxCount) * chartH;
  const yRate = (v: number) => padT + chartH - (v / 100) * chartH;
  const ratePts = rows.map((r, i) => ({ x: padL + slot * i + slot / 2, y: yRate(r.passRatePct), row: r }));
  const ratePath = ratePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg
      className="ac-at-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="7 个测试模块的接口自动化用例数、缺陷数与通过率对比"
    >
      {[0, 1, 2, 3, 4].map((v) => {
        const val = Math.round((maxCount / 4) * v);
        return (
          <g key={v}>
            <line x1={padL} y1={yCount(val)} x2={W - padR} y2={yCount(val)} stroke="#eef1f5" />
            <text className="ac-at-svg-axis" x={padL - 6} y={yCount(val) + 4} textAnchor="end">
              {val}
            </text>
          </g>
        );
      })}
      {[0, 50, 100].map((v) => (
        <text key={v} className="ac-at-svg-axis" x={W - padR + 6} y={yRate(v) + 4}>
          {v}%
        </text>
      ))}
      {rows.map((r, i) => {
        const cx = padL + slot * i + slot / 2;
        return (
          <g key={r.moduleId}>
            <rect x={cx - bw - 2} y={yCount(r.caseCount)} width={bw} height={padT + chartH - yCount(r.caseCount)} rx={3} fill={TONE_HEX[r.tone] ?? TONE_HEX.brand} opacity={0.85}>
              <title>{`${r.moduleName} 用例 ${r.caseCount} 条`}</title>
            </rect>
            <rect x={cx + 2} y={yCount(r.bugCount)} width={bw} height={padT + chartH - yCount(r.bugCount)} rx={3} fill={TONE_HEX.danger} opacity={0.75}>
              <title>{`${r.moduleName} 缺陷 ${r.bugCount} 个`}</title>
            </rect>
            <text className="ac-at-svg-value" x={cx - bw / 2 - 2} y={yCount(r.caseCount) - 4} textAnchor="middle">
              {r.caseCount}
            </text>
            {r.bugCount > 0 ? (
              <text className="ac-at-svg-value" x={cx + bw / 2 + 2} y={yCount(r.bugCount) - 4} textAnchor="middle">
                {r.bugCount}
              </text>
            ) : null}
            <text className="ac-at-svg-axis" x={cx} y={H - 26} textAnchor="middle">
              {r.moduleName}
            </text>
            <text className="ac-at-svg-cap" x={cx} y={H - 12} textAnchor="middle">
              {r.moduleId}
            </text>
          </g>
        );
      })}
      <path d={ratePath} fill="none" stroke={TONE_HEX.brand} strokeWidth={2} strokeDasharray="5 3" />
      {ratePts.map((p) => (
        <circle key={p.row.moduleId} cx={p.x} cy={p.y} r={3.4} fill={TONE_HEX.brand} />
      ))}
    </svg>
  );
}

/** 场景链路图：按 order 横向排布步骤节点，画出变量流向、条件分支与循环回边 */
function ScenarioFlowGraph({ steps, selectedStepId }: { steps: ApiScenarioStepDef[]; selectedStepId: string | null }) {
  const pad = 26;
  const nodeW = 158;
  const nodeH = 64;
  const gapX = 46;
  const n = steps.length;
  const W = pad * 2 + n * nodeW + Math.max(n - 1, 0) * gapX;
  const H = 262;
  const topY = 56;
  const midY = topY + nodeH / 2;
  const branchY = 176;
  const xOf = (i: number) => pad + i * (nodeW + gapX);
  const cxOf = (i: number) => xOf(i) + nodeW / 2;

  /** 变量 → 消费该变量的后续步骤下标 */
  const varFlows = useMemo(() => {
    const out: { varName: string; from: number; to: number }[] = [];
    steps.forEach((s, i) => {
      s.extractVars.forEach((v) => {
        const token = `\${ctx.${v.name}}`;
        for (let j = i + 1; j < steps.length; j += 1) {
          const hit = steps[j].assertions.some((a) => a.expr.includes(token) || a.expected.includes(token));
          if (hit) out.push({ varName: v.name, from: i, to: j });
        }
      });
    });
    return out;
  }, [steps]);

  const shapeOf = (step: ApiScenarioStepDef, x: number, y: number, w: number, h: number) => {
    const meta = STEP_TYPE_META[step.stepType];
    const fill = `${TONE_HEX[meta.tone]}1a`;
    const stroke = TONE_HEX[meta.tone];
    switch (meta.shape) {
      case 'diamond': {
        const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.6} />;
      }
      case 'parallelogram': {
        const k = 14;
        const pts = `${x + k},${y} ${x + w},${y} ${x + w - k},${y + h} ${x},${y + h}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.6} />;
      }
      case 'pill':
        return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} stroke={stroke} strokeWidth={1.6} strokeDasharray="5 3" />;
      case 'double':
        return (
          <g>
            <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={stroke} strokeWidth={1.6} />
            <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx={4} fill="none" stroke={stroke} strokeWidth={0.9} opacity={0.6} />
          </g>
        );
      case 'loop':
        return (
          <g>
            <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={stroke} strokeWidth={1.6} />
            <line x1={x + 8} y1={y + 6} x2={x + 8} y2={y + h - 6} stroke={stroke} strokeWidth={2.4} />
            <line x1={x + 13} y1={y + 6} x2={x + 13} y2={y + h - 6} stroke={stroke} strokeWidth={1.2} opacity={0.6} />
          </g>
        );
      default:
        return <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.6} />;
    }
  };

  return (
    <div className="ac-at-flow-scroll">
      <svg
        className="ac-at-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`场景链路图：${n} 个步骤按执行顺序串联，含变量提取流向、条件分支与数据驱动循环`}
      >
        <defs>
          <marker id="ac-at-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#98a2b0" />
          </marker>
          <marker id="ac-at-arrow-ai" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE_HEX.ai} />
          </marker>
          <marker id="ac-at-arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE_HEX.warn} />
          </marker>
        </defs>

        {/* 主链路连线 */}
        {steps.slice(0, -1).map((s, i) => (
          <line
            key={`link-${s.id}`}
            x1={xOf(i) + nodeW}
            y1={midY}
            x2={xOf(i + 1) - 3}
            y2={midY}
            stroke="#98a2b0"
            strokeWidth={1.6}
            markerEnd="url(#ac-at-arrow)"
          />
        ))}

        {/* 变量流向（虚线，走节点上方） */}
        {varFlows.map((f, idx) => {
          const x1 = cxOf(f.from);
          const x2 = cxOf(f.to);
          const apex = 26 - (idx % 3) * 9;
          return (
            <g key={`var-${f.varName}-${f.from}-${f.to}`}>
              <path
                d={`M ${x1} ${topY} C ${x1} ${apex}, ${x2} ${apex}, ${x2} ${topY - 3}`}
                fill="none"
                stroke={TONE_HEX.ai}
                strokeWidth={1.2}
                strokeDasharray="4 3"
                markerEnd="url(#ac-at-arrow-ai)"
                opacity={0.85}
              />
              <text className="ac-at-svg-var" x={(x1 + x2) / 2} y={apex - 3} textAnchor="middle">
                {f.varName}
              </text>
            </g>
          );
        })}

        {/* 步骤节点 */}
        {steps.map((s, i) => {
          const meta = STEP_TYPE_META[s.stepType];
          const x = xOf(i);
          const active = selectedStepId === s.id;
          const words = s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name;
          const l1 = words.slice(0, 11);
          const l2 = words.slice(11, 22);
          return (
            <g key={s.id}>
              {active ? (
                <rect x={x - 5} y={topY - 5} width={nodeW + 10} height={nodeH + 10} rx={11} fill="none" stroke={TONE_HEX.brand} strokeWidth={2} strokeDasharray="4 3" />
              ) : null}
              {shapeOf(s, x, topY, nodeW, nodeH)}
              <text className="ac-at-svg-idx" x={x + 12} y={topY + 17}>
                {s.order}
              </text>
              <text className="ac-at-svg-type" x={x + 30} y={topY + 17} fill={TONE_HEX[meta.tone]}>
                {meta.label}
              </text>
              <text className="ac-at-svg-node" x={x + nodeW / 2} y={topY + 36} textAnchor="middle">
                {l1}
              </text>
              {l2 ? (
                <text className="ac-at-svg-node" x={x + nodeW / 2} y={topY + 50} textAnchor="middle">
                  {l2}
                </text>
              ) : null}
              <text className="ac-at-svg-cap" x={x + nodeW / 2} y={topY + nodeH + 15} textAnchor="middle">
                {s.id} · {s.caseId}
                {s.assertions.length > 0 ? ` · 断言 ${s.assertions.length}` : ''}
              </text>
              {/* 循环回边 */}
              {s.stepType === 'loop' ? (
                <g>
                  <path
                    d={`M ${x + 22} ${topY + nodeH} C ${x + 22} ${topY + nodeH + 34}, ${x + nodeW - 22} ${topY + nodeH + 34}, ${x + nodeW - 22} ${topY + nodeH + 3}`}
                    fill="none"
                    stroke={TONE_HEX.indigo}
                    strokeWidth={1.3}
                    strokeDasharray="4 3"
                    markerEnd="url(#ac-at-arrow)"
                  />
                  <text className="ac-at-svg-var" x={x + nodeW / 2} y={topY + nodeH + 45} textAnchor="middle" fill={TONE_HEX.indigo}>
                    {s.loopOver}
                  </text>
                </g>
              ) : null}
              {/* 条件分支 */}
              {s.stepType === 'condition' ? (
                <g>
                  <path
                    d={`M ${x + nodeW / 2} ${topY + nodeH} L ${x + nodeW / 2} ${branchY - 4}`}
                    stroke={TONE_HEX.warn}
                    strokeWidth={1.4}
                    strokeDasharray="4 3"
                    markerEnd="url(#ac-at-arrow-warn)"
                  />
                  <rect x={x - 6} y={branchY} width={nodeW + 12} height={38} rx={7} fill="#fffaf0" stroke={TONE_HEX.warn} strokeWidth={1.2} />
                  <text className="ac-at-svg-node" x={x + nodeW / 2} y={branchY + 16} textAnchor="middle">
                    条件不成立 → 跳过
                  </text>
                  <text className="ac-at-svg-cap" x={x + nodeW / 2} y={branchY + 30} textAnchor="middle">
                    {s.conditionExpr}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        {/* 图例 */}
        {(['request', 'assert', 'extract', 'wait', 'condition', 'loop'] as const).map((t, i) => {
          const meta = STEP_TYPE_META[t];
          const lx = pad + i * 132;
          return (
            <g key={t}>
              <rect x={lx} y={H - 22} width={12} height={12} rx={3} fill={`${TONE_HEX[meta.tone]}33`} stroke={TONE_HEX[meta.tone]} strokeWidth={1.2} />
              <text className="ac-at-svg-cap" x={lx + 17} y={H - 12}>
                {meta.label} · {meta.note}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** CI/CD 集成拓扑：GitLab → Jenkins → hifox → 门禁 → PingCode → WeKnora */
function CiTopologyGraph() {
  const nodes = [
    { title: 'GitLab', sub: 'push / MR 合入', detail: 'trade-order 主干', tone: 'info' as Tone },
    { title: 'Jenkins', sub: '流水线编排', detail: 'PIPE-2401~2410', tone: 'brand' as Tone },
    { title: 'hifox', sub: '接口自动化执行', detail: 'provider-hifox', tone: 'teal' as Tone },
    { title: 'G3 / G4 门禁', sub: '覆盖率与用例执行率', detail: 'GATE_MAP 判定', tone: 'warn' as Tone },
    { title: 'PingCode', sub: '缺陷自动回写', detail: 'BUG-1045~1055', tone: 'danger' as Tone },
    { title: 'WeKnora', sub: '报告归档入库', detail: 'provider-weknora', tone: 'indigo' as Tone },
  ];
  const W = 1010;
  const H = 132;
  const nodeW = 146;
  const gap = 18;
  return (
    <div className="ac-at-flow-scroll">
      <svg
        className="ac-at-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="CI/CD 集成拓扑：GitLab 提交经 Jenkins 触发 hifox 接口自动化，门禁判定后缺陷回写 PingCode、报告归档 WeKnora"
      >
        <defs>
          <marker id="ac-at-ci-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#98a2b0" />
          </marker>
        </defs>
        {nodes.map((nd, i) => {
          const x = 12 + i * (nodeW + gap);
          return (
            <g key={nd.title}>
              {i > 0 ? (
                <line x1={x - gap + 2} y1={54} x2={x - 3} y2={54} stroke="#98a2b0" strokeWidth={1.6} markerEnd="url(#ac-at-ci-arrow)" />
              ) : null}
              <rect x={x} y={20} width={nodeW} height={68} rx={9} fill="#fff" stroke={TONE_HEX[nd.tone]} strokeWidth={1.5} />
              <rect x={x} y={20} width={4} height={68} rx={2} fill={TONE_HEX[nd.tone]} />
              <text className="ac-at-svg-node" x={x + 14} y={42}>
                {nd.title}
              </text>
              <text className="ac-at-svg-cap" x={x + 14} y={59}>
                {nd.sub}
              </text>
              <text className="ac-at-svg-mono" x={x + 14} y={76}>
                {nd.detail}
              </text>
              <text className="ac-at-svg-idx" x={x + nodeW - 12} y={36} textAnchor="end">
                {i + 1}
              </text>
            </g>
          );
        })}
        <text className="ac-at-svg-cap" x={12} y={112}>
          触发口径：AS-01 / AS-05 随 push 与需求级流水线触发（ci）；AS-02 由「订单创建」领域事件触发（event）；AS-03 每日 02:20、AS-04 每周一 03:30 定时触发（schedule）。
        </text>
      </svg>
    </div>
  );
}

/** 横向条形：断言类型分布 / 场景通过率等通用小图 */
function HBars({ items, unit }: { items: { label: string; value: number; tone: Tone }[]; unit: string }) {
  const W = 520;
  const labelW = 118;
  const valueW = 62;
  const chartW = W - labelW - valueW;
  const rowH = 28;
  const H = items.length * rowH + 6;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <svg
      className="ac-at-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`横向条形图：${items.map((i) => `${i.label} ${i.value}${unit}`).join('，')}`}
    >
      {items.map((it, i) => {
        const y = i * rowH + 3;
        const w = Math.max(3, (it.value / max) * chartW);
        return (
          <g key={it.label}>
            <text className="ac-at-svg-name" x={0} y={y + 17}>
              {it.label}
            </text>
            <rect x={labelW} y={y + 6} width={chartW} height={15} rx={4} fill="#eceff4" />
            <rect x={labelW} y={y + 6} width={w} height={15} rx={4} fill={TONE_HEX[it.tone] ?? TONE_HEX.brand} />
            <text className="ac-at-svg-value" x={W} y={y + 18} textAnchor="end">
              {it.value}
              {unit}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ 页面 */

export default function ApiTestPage() {
  const [tab, setTab] = useState<TabId>('cases');

  /* -------- 用例库 -------- */
  const [fModule, setFModule] = useState('all');
  const [fType, setFType] = useState('all');
  const [fPriority, setFPriority] = useState('all');
  const [fSource, setFSource] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fResult, setFResult] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<CaseSortKey>('id');
  const [sortAsc, setSortAsc] = useState(true);
  const [extraCases, setExtraCases] = useState<ApiCaseDef[]>([]);
  const [caseDrawer, setCaseDrawer] = useState<ApiCaseDef | null>(null);
  const [aiCaseHint, setAiCaseHint] = useState<string | null>(null);
  const [coverageGenerated, setCoverageGenerated] = useState<string[]>([]);
  const [flakyDecision, setFlakyDecision] = useState<Record<string, 'accepted' | 'rejected'>>({});

  /* -------- 场景编排 -------- */
  const [activeScenarioId, setActiveScenarioId] = useState('AS-01');
  const [extraScenarios, setExtraScenarios] = useState<ApiScenarioDef[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [aiScenarioOpen, setAiScenarioOpen] = useState(false);
  const [aiScenarioDrafted, setAiScenarioDrafted] = useState(false);
  const [assertHint, setAssertHint] = useState<string | null>(null);

  /* -------- Mock 与数据集 -------- */
  const [mockOverrides, setMockOverrides] = useState<Record<string, boolean>>({});
  const [mockDrawer, setMockDrawer] = useState<MockRuleDef | null>(null);
  const [mockTrial, setMockTrial] = useState<{ at: string; latencyMs: number; body: string } | null>(null);
  const [mockHint, setMockHint] = useState<string | null>(null);
  const [dsDrawer, setDsDrawer] = useState<DataSetDef | null>(null);
  const [dsExtraRows, setDsExtraRows] = useState<Record<string, number>>({});
  const [dsHint, setDsHint] = useState<string | null>(null);

  /* -------- 执行记录 -------- */
  const [runDrawer, setRunDrawer] = useState<ApiTestRunDef | null>(null);
  const [localBugs, setLocalBugs] = useState<string[]>([]);
  const [runFilterTrigger, setRunFilterTrigger] = useState('all');
  const [runFilterEnv, setRunFilterEnv] = useState('all');

  /* -------- 测试报告 -------- */
  const [actionDecision, setActionDecision] = useState<Record<number, 'accepted' | 'rejected'>>({});
  const [failureDecision, setFailureDecision] = useState<Record<string, 'bug' | 'rerun'>>({});
  const [signed, setSigned] = useState(false);

  /** 用例全集（含 AI 乐观新增） */
  const allCases = useMemo(() => [...API_CASES, ...extraCases], [extraCases]);

  /** 场景全集（含 AI 乐观新增） */
  const allScenarios = useMemo(() => [...API_SCENARIOS, ...extraScenarios], [extraScenarios]);

  /** Mock 规则（含开关乐观更新） */
  const allMocks = useMemo(
    () => MOCK_RULES.map((m) => (m.id in mockOverrides ? { ...m, enabled: mockOverrides[m.id] } : m)),
    [mockOverrides],
  );

  /** 契约覆盖集合 */
  const coveredContracts = useMemo(
    () => new Set([...allCases.map((c) => c.apiContractId), ...coverageGenerated]),
    [allCases, coverageGenerated],
  );

  /** 用例库派生指标 */
  const caseStats = useMemo(() => {
    const total = allCases.length;
    const aiCount = allCases.filter((c) => c.source === 'ai-generated').length;
    const active = allCases.filter((c) => c.status === 'active').length;
    const draft = allCases.filter((c) => c.status === 'draft').length;
    const deprecated = allCases.filter((c) => c.status === 'deprecated').length;
    const flaky = allCases.filter((c) => c.status === 'flaky').length;
    const p0 = allCases.filter((c) => c.priority === 'P0').length;
    const sumDur = allCases.reduce((s, c) => s + c.avgDurationMs, 0);
    const runTotal = API_TEST_RUNS.reduce((s, r) => s + r.totalCases, 0);
    const runPassed = API_TEST_RUNS.reduce((s, r) => s + r.passed, 0);
    return {
      total,
      aiCount,
      aiPct: total > 0 ? (aiCount / total) * 100 : 0,
      active,
      draft,
      deprecated,
      flaky,
      p0,
      avgDurationMs: total > 0 ? Math.round(sumDur / total) : 0,
      passRatePct: runTotal > 0 ? (runPassed / runTotal) * 100 : 0,
      runTotal,
      runPassed,
      assertionTotal: allCases.reduce((s, c) => s + c.assertionCount, 0),
    };
  }, [allCases]);

  /** 用例筛选 + 排序 */
  const filteredCases = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const rows = allCases.filter((c) => {
      if (fModule !== 'all' && c.moduleId !== fModule) return false;
      if (fType !== 'all' && c.caseType !== fType) return false;
      if (fPriority !== 'all' && c.priority !== fPriority) return false;
      if (fSource !== 'all' && c.source !== fSource) return false;
      if (fStatus !== 'all' && c.status !== fStatus) return false;
      if (fResult !== 'all' && c.lastRunStatus !== fResult) return false;
      if (kw) {
        const hay = `${c.id} ${c.name} ${c.path} ${c.apiContractId}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    const dir = sortAsc ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'priority':
          return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
        case 'passRatePct':
        case 'avgDurationMs':
        case 'p95DurationMs':
        case 'runCount':
        case 'assertionCount':
          return (a[sortKey] - b[sortKey]) * dir;
        case 'lastRunAt':
          return a.lastRunAt.localeCompare(b.lastRunAt) * dir;
        default:
          return a.id.localeCompare(b.id) * dir;
      }
    });
  }, [allCases, fModule, fType, fPriority, fSource, fStatus, fResult, keyword, sortKey, sortAsc]);

  const flakyCases = useMemo(() => allCases.filter((c) => c.status === 'flaky'), [allCases]);

  const uncoveredContracts = useMemo(
    () => API_CONTRACTS.filter((c) => !coveredContracts.has(c.id)),
    [coveredContracts],
  );

  const activeScenario = useMemo(
    () => allScenarios.find((s) => s.id === activeScenarioId) ?? allScenarios[0],
    [allScenarios, activeScenarioId],
  );

  const activeScenarioSteps = useMemo(
    () => API_SCENARIO_STEPS.filter((s) => s.scenarioId === activeScenario.id).sort((a, b) => a.order - b.order),
    [activeScenario],
  );

  const selectedStep = useMemo(
    () => activeScenarioSteps.find((s) => s.id === selectedStepId) ?? null,
    [activeScenarioSteps, selectedStepId],
  );

  /** 22 步的断言类型分布与质量缺口 */
  const assertionStats = useMemo(() => {
    const counter: Record<string, number> = { status: 0, jsonpath: 0, schema: 0, duration: 0, db: 0 };
    let total = 0;
    API_SCENARIO_STEPS.forEach((s) => {
      s.assertions.forEach((a) => {
        counter[a.type] = (counter[a.type] ?? 0) + 1;
        total += 1;
      });
    });
    const withAssert = API_SCENARIO_STEPS.filter((s) => s.assertions.length > 0);
    const noSchema = withAssert.filter((s) => !s.assertions.some((a) => a.type === 'schema'));
    const noDuration = withAssert.filter((s) => !s.assertions.some((a) => a.type === 'duration'));
    return { counter, total, withAssertCount: withAssert.length, noSchema, noDuration };
  }, []);

  const filteredRuns = useMemo(
    () =>
      API_TEST_RUNS.filter((r) => {
        if (runFilterTrigger !== 'all' && r.triggerType !== runFilterTrigger) return false;
        if (runFilterEnv !== 'all' && r.envId !== runFilterEnv) return false;
        return true;
      }),
    [runFilterTrigger, runFilterEnv],
  );

  const hifox = AI_TOOL_PROVIDERS.find((p) => p.id === 'provider-hifox');
  const hifoxCaps = AI_TOOL_CAPABILITIES.filter((c) => c.providerId === 'provider-hifox');
  const ciFlows = AI_AUTOMATION_FLOWS.filter((f) => f.steps.some((s) => s.toolProviderId === 'provider-hifox'));
  const sprint = SPRINTS.find((s) => s.id === apiTestReport.sprintId);
  const reportAgent = agents.find((a) => a.id === apiTestReport.generatedBy);
  const reportModel = models.find((m) => m.id === apiTestReport.modelId);

  const toggleSort = (key: CaseSortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortIcon = (key: CaseSortKey) => (sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '');

  const addBoundaryCase = (base: ApiCaseDef) => {
    const seq = extraCases.length + 1;
    const created = makeBoundaryCase(base, seq);
    setExtraCases((prev) => [...prev, created]);
    setAiCaseHint(`ag-test 已依据 ${base.apiContractId} 契约 Schema 生成边界负例 ${created.id}（草稿态，6 条断言），复核通过后转 active 并挂入 ${base.moduleId} 的场景。`);
  };

  const generateMissingCases = () => {
    const ids = uncoveredContracts.filter((c) => c.status !== 'draft').map((c) => c.id);
    const drafts = uncoveredContracts.filter((c) => c.status === 'draft').map((c) => c.id);
    setCoverageGenerated((prev) => Array.from(new Set([...prev, ...ids, ...drafts])));
  };

  const adoptAiScenario = () => {
    if (aiScenarioDrafted) return;
    const created: ApiScenarioDef = {
      id: 'AS-06',
      name: `${AI_SCENARIO_DRAFT.goal}（AI 编排草稿）`,
      desc: `由 ag-test 基于 ${AI_SCENARIO_DRAFT.contractId} 契约与知识库 KD-15 切片自动编排的 5 步场景草稿，含 2 个变量提取点、1 个等待窗口与 1 个条件分支；需人工复核后转 active 并绑定 G4 门禁。`,
      caseIds: ['AC-09', 'AC-04', 'AC-07'],
      stepCount: AI_SCENARIO_DRAFT.steps.length,
      triggerType: 'manual',
      cronExpr: '',
      envIds: ['env-test'],
      dataDrivenSetId: 'ADS-01',
      timeoutSec: 1200,
      retryPolicy: { maxAttempts: 2, backoffMs: 800 },
      status: 'draft',
      lastRunId: '—',
      lastRunStatus: 'pending',
      lastRunAt: '尚未执行',
      avgDurationMs: 0,
      passRatePct: 0,
      gateIds: ['G4'],
      owner: 'u-he',
      tone: 'ai',
    };
    setExtraScenarios((prev) => [...prev, created]);
    setAiScenarioDrafted(true);
    setActiveScenarioId(created.id);
  };

  const toggleMock = (rule: MockRuleDef) => {
    const next = !(rule.id in mockOverrides ? mockOverrides[rule.id] : rule.enabled);
    setMockOverrides((prev) => ({ ...prev, [rule.id]: next }));
    const impacted = API_SCENARIO_STEPS.filter((s) =>
      s.assertions.some((a) => a.expr.includes(rule.id) || a.expected.includes(rule.id)),
    ).map((s) => s.scenarioId);
    const byCases = API_CASES.filter((c) => c.tags.some((t) => t.includes(rule.id))).map((c) => c.id);
    const list = Array.from(new Set([...impacted, ...byCases]));
    setMockHint(
      next
        ? `${rule.id} 已启用：${rule.matchMethod} ${rule.matchPath} 的请求将被拦截并返回${RESPONSE_TYPE_META[rule.responseType].label}。`
        : `${rule.id} 已停用：请求将直连真实下游，关联用例 ${byCases.join(' / ') || '无'}${
            list.length > 0 ? `，受影响场景 / 用例 ${list.join('、')}` : ''
          }，停用期间相关断言可能因真实数据波动而误报。`,
    );
  };

  const runMockTrial = (rule: MockRuleDef) => {
    const latency = rule.delayMs ?? Math.max(6, Math.round(rule.hitCount30d / 2400) + 8);
    setMockTrial({
      at: `${AI_FLOW_TODAY} 18:26:04`,
      latencyMs: latency,
      body: rule.responseTemplate,
    });
  };

  const expandDataSet = (ds: DataSetDef) => {
    setDsExtraRows((prev) => ({ ...prev, [ds.id]: (prev[ds.id] ?? 0) + 24 }));
    setDsHint(
      `ag-test 已按等价类 / 边界值 / 异常值三类策略为 ${ds.id} 追加 24 行样本（当前 ${ds.rowCount + (dsExtraRows[ds.id] ?? 0) + 24} 行），新增行覆盖金额 0.00 / 0.01 / 上限值、空数组与非法字符，敏感列继续沿用 ${
        ds.columns.filter((c) => c.sensitive).map((c) => c.maskRule).filter(Boolean).join(' / ') || 'rd-01'
      } 脱敏规则。`,
    );
  };

  const fileBugFromRun = (run: ApiTestRunDef, caseId: string) => {
    const key = `${run.id}:${caseId}`;
    if (localBugs.includes(key)) return;
    setLocalBugs((prev) => [...prev, key]);
  };

  const gatePass = apiTestReport.gateImpact.pass;

  return (
    <div className="ac-at" data-annotation-id="ai-sdlc-api-test-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">接口自动化测试</div>
          <div className="ac-page-desc">
            本页承载 API 层的自动化测试编排与执行，能力对标 <strong>hifox</strong>（用例编排、场景链、变量提取与多层断言、Mock、数据驱动、CI 触发、报告），
            由 <strong>ag-test</strong> 从冻结的接口契约自动生成用例；与「测试中心」页的分工是——测试中心管功能用例库与测试计划 / 报告，本页管接口级自动化。
            全部数据围绕「订单中心重构」（EPIC-ORDER-REF）Sprint 24 的真实契约、门禁与缺陷展开。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            数据快照 {AI_FLOW_TODAY}
          </span>
          <span className={`ac-tag ac-tag--${hifox?.status === 'connected' ? 'ok' : 'warn'}`}>
            <span className={hifox?.status === 'connected' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
            hifox {hifox?.version ?? ''} · {hifox?.status === 'connected' ? '已连接' : '未连接'}
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setTab('report')}>
            <FileText size={13} />
            查看迭代报告
          </button>
          <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={() => setAiScenarioOpen(true)}>
            <Sparkles size={13} />
            AI 生成场景
          </button>
        </div>
      </div>

      {/* ---------- 页签 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count =
            t.id === 'cases'
              ? allCases.length
              : t.id === 'scenarios'
                ? allScenarios.length
                : t.id === 'mock'
                  ? allMocks.length + DATA_SETS.length
                  : t.id === 'runs'
                    ? API_TEST_RUNS.length
                    : t.id === 'report'
                      ? apiTestReport.scope.runs
                      : hifoxCaps.length;
          return (
            <button
              key={t.id}
              type="button"
              className={`ac-tab ${tab === t.id ? 'ac-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={14} />
              {t.name}
              <span className="ac-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ================= 1. 用例库 ================= */}
      {tab === 'cases' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--6 ac-mb-0" data-annotation-id="ai-sdlc-api-test-case-metrics">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">接口用例总数</span>
                <span className="ac-metric-icon">
                  <FlaskConical size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {caseStats.total}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">断言合计 {caseStats.assertionTotal} 条</div>
            </div>

            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">AI 生成占比</span>
                <span className="ac-metric-icon">
                  <Sparkles size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {pct1(caseStats.aiPct)}
                <span className="ac-metric-unit">{caseStats.aiCount}/{caseStats.total}</span>
              </div>
              <div className="ac-metric-foot">由 ag-test 从冻结契约生成</div>
            </div>

            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head">
                <span className="ac-metric-label">状态分布</span>
                <span className="ac-metric-icon">
                  <Layers size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {caseStats.active}
                <span className="ac-metric-unit">在用</span>
              </div>
              <div className="ac-metric-foot">
                草稿 {caseStats.draft} · 废弃 {caseStats.deprecated} · 抖动 {caseStats.flaky}
              </div>
            </div>

            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head">
                <span className="ac-metric-label">近 30 日通过率</span>
                <span className="ac-metric-icon">
                  <Gauge size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {pct1(caseStats.passRatePct)}
                <span className="ac-metric-unit">{caseStats.runPassed}/{caseStats.runTotal}</span>
              </div>
              <div className="ac-metric-foot">Σ passed ÷ Σ totalCases（8 次归档执行）</div>
            </div>

            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">用例平均耗时</span>
                <span className="ac-metric-icon">
                  <Timer size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {num(caseStats.avgDurationMs)}
                <span className="ac-metric-unit">ms</span>
              </div>
              <div className="ac-metric-foot">导出类用例（AC-14/15）拉高均值</div>
            </div>

            <div className="ac-metric ac-metric--danger">
              <div className="ac-metric-head">
                <span className="ac-metric-label">P0 用例数</span>
                <span className="ac-metric-icon">
                  <Target size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {caseStats.p0}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">全部纳入 G4 门禁准入判定</div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-api-test-case-table">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <FlaskConical size={16} />
                接口自动化用例库
              </span>
              <span className="ac-card-subtitle">区别于测试中心的 TC-* 功能用例，本表为接口级自动化用例（AC-*）</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  命中 {filteredCases.length} / {allCases.length}
                </span>
                <button
                  type="button"
                  className="ac-btn ac-btn--ghost ac-btn--sm"
                  onClick={() => {
                    setFModule('all');
                    setFType('all');
                    setFPriority('all');
                    setFSource('all');
                    setFStatus('all');
                    setFResult('all');
                    setKeyword('');
                  }}
                >
                  <RefreshCw size={12} />
                  重置筛选
                </button>
              </div>
            </div>

            <div className="ac-filter-bar">
              <Search size={14} className="ac-muted" />
              <input
                className="ac-input ac-at-search"
                value={keyword}
                placeholder="搜索编号 / 名称 / 路径 / 契约（如 AC-05、/api/v2/orders、API-13）"
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Filter size={14} className="ac-muted" />
              <select className="ac-select" value={fModule} onChange={(e) => setFModule(e.target.value)}>
                <option value="all">全部模块（7）</option>
                {Object.keys(TEST_MODULE_MAP).map((id) => (
                  <option key={id} value={id}>
                    {TEST_MODULE_MAP[id].name}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="all">全部类型</option>
                {(['正向', '异常', '边界', '幂等', '并发', '安全', '性能'] as const).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
                <option value="all">全部优先级</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
              </select>
              <select className="ac-select" value={fSource} onChange={(e) => setFSource(e.target.value)}>
                <option value="all">全部来源</option>
                <option value="ai-generated">AI 生成</option>
                <option value="imported">脚本导入</option>
                <option value="manual">人工编写</option>
              </select>
              <select className="ac-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="all">全部状态</option>
                <option value="active">在用</option>
                <option value="draft">草稿</option>
                <option value="flaky">抖动</option>
                <option value="deprecated">废弃</option>
              </select>
              <select className="ac-select" value={fResult} onChange={(e) => setFResult(e.target.value)}>
                <option value="all">全部执行结果</option>
                <option value="passed">通过</option>
                <option value="failed">失败</option>
                <option value="blocked">阻塞</option>
                <option value="skipped">跳过</option>
                <option value="pending">未执行</option>
              </select>
            </div>

            {aiCaseHint ? (
              <div className="ac-hint ac-hint--ok ac-at-inline-hint">
                <CheckCircle2 size={14} />
                <span>{aiCaseHint}</span>
                <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-at-hint-close" onClick={() => setAiCaseHint(null)}>
                  收起
                </button>
              </div>
            ) : null}

            <div className="ac-card-body ac-card-body--flush">
              {filteredCases.length === 0 ? (
                <div className="ac-empty">
                  <span className="ac-empty-icon">
                    <Search size={22} />
                  </span>
                  <div className="ac-empty-title">没有符合条件的接口用例</div>
                  <div className="ac-empty-desc">
                    当前筛选组合下命中 0 条。可尝试放宽模块或执行结果条件，或清空关键字后重新检索；
                    若目标契约尚未建例，请到下方「契约覆盖度分析」使用一键生成。
                  </div>
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost ac-btn--sm"
                    onClick={() => {
                      setFModule('all');
                      setFType('all');
                      setFPriority('all');
                      setFSource('all');
                      setFStatus('all');
                      setFResult('all');
                      setKeyword('');
                    }}
                  >
                    清空全部筛选
                  </button>
                </div>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm ac-table--bordered">
                    <thead>
                      <tr>
                        <th className="ac-at-sortable" onClick={() => toggleSort('id')}>
                          用例{sortIcon('id')}
                        </th>
                        <th>方法</th>
                        <th>路径</th>
                        <th>关联契约</th>
                        <th>所属模块</th>
                        <th>类型</th>
                        <th className="ac-at-sortable" onClick={() => toggleSort('priority')}>
                          优先级{sortIcon('priority')}
                        </th>
                        <th>来源 / 生成 Agent</th>
                        <th>状态</th>
                        <th>最近执行</th>
                        <th className="ac-at-sortable ac-td-right" onClick={() => toggleSort('avgDurationMs')}>
                          平均 / P95{sortIcon('avgDurationMs')}
                        </th>
                        <th className="ac-at-sortable ac-td-right" onClick={() => toggleSort('passRatePct')}>
                          通过率{sortIcon('passRatePct')}
                        </th>
                        <th className="ac-at-sortable ac-td-right" onClick={() => toggleSort('runCount')}>
                          执行{sortIcon('runCount')}
                        </th>
                        <th className="ac-at-sortable ac-td-right" onClick={() => toggleSort('assertionCount')}>
                          断言{sortIcon('assertionCount')}
                        </th>
                        <th>负责人</th>
                        <th className="ac-td-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((c) => {
                        const contract = API_CONTRACT_MAP[c.apiContractId];
                        const mod = TEST_MODULE_MAP[c.moduleId];
                        const st = CASE_STATUS_META[c.status];
                        const rs = RUN_RESULT_META[c.lastRunStatus];
                        return (
                          <tr key={c.id} className="ac-at-row" onClick={() => setCaseDrawer(c)} title="点击查看用例详情">
                            <td>
                              <div className="ac-at-case-name">{c.name}</div>
                              <span className="ac-xs ac-muted ac-mono">
                                {c.id} · {c.tags.slice(0, 2).join(' / ')}
                              </span>
                            </td>
                            <td>
                              <span className={`ac-at-method ac-at-method--${METHOD_META[c.method]?.tone ?? 'neutral'}`}>
                                {c.method}
                              </span>
                            </td>
                            <td className="ac-mono ac-xs ac-text-2 ac-at-path">{c.path}</td>
                            <td>
                              <button
                                type="button"
                                className="ac-btn ac-btn--text ac-btn--sm ac-at-link"
                                title={`契约 ${c.apiContractId} · ${contract?.name ?? ''}（${contract?.statusLabel ?? ''}）`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  jump('design');
                                }}
                              >
                                <Link2 size={12} />
                                {c.apiContractId}
                              </button>
                              <span className="ac-xs ac-muted ac-at-cell-sub">{contract?.name ?? '—'}</span>
                            </td>
                            <td>
                              <span className="ac-at-cell-main">{mod?.name ?? c.moduleId}</span>
                              <span className="ac-xs ac-muted ac-mono ac-at-cell-sub">{mod?.code ?? c.moduleId}</span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[CASE_TYPE_TONE[c.caseType]]}`}>
                                {c.caseType}
                              </span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${c.priority === 'P0' ? 'danger' : c.priority === 'P1' ? 'warn' : 'neutral'}`}>
                                {c.priority}
                              </span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${SOURCE_META[c.source].tone}`}>
                                {c.source === 'ai-generated' ? <Sparkles size={11} /> : null}
                                {SOURCE_META[c.source].label}
                              </span>
                              <span className="ac-xs ac-muted ac-at-cell-sub">{agentName(c.generatedBy)}</span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${st.tone}`}>{st.label}</span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${rs.tone}`}>
                                {c.lastRunStatus === 'passed' ? (
                                  <CheckCircle2 size={11} />
                                ) : c.lastRunStatus === 'failed' ? (
                                  <XCircle size={11} />
                                ) : null}
                                {rs.label}
                              </span>
                              <span className="ac-xs ac-muted ac-mono ac-at-cell-sub">{c.lastRunAt}</span>
                            </td>
                            <td className="ac-td-num ac-xs">
                              {c.avgDurationMs} / {c.p95DurationMs} ms
                            </td>
                            <td className="ac-td-num">
                              <span className={c.passRatePct >= 90 ? 'ac-ok-text' : c.passRatePct >= 50 ? 'ac-warn-text' : 'ac-danger-text'}>
                                {c.runCount > 0 ? pct1(c.passRatePct) : '—'}
                              </span>
                            </td>
                            <td className="ac-td-num">{c.runCount}</td>
                            <td className="ac-td-num">{c.assertionCount}</td>
                            <td>
                              <span className="ac-user">
                                <span className={`ac-avatar ac-avatar--xs ${ownerAvatar(c.owner)}`}>{ownerInitial(c.owner)}</span>
                                <span className="ac-user-name">{ownerName(c.owner)}</span>
                              </span>
                            </td>
                            <td className="ac-td-right">
                              <button
                                type="button"
                                className="ac-btn ac-btn--text ac-btn--sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCaseDrawer(c);
                                }}
                              >
                                详情
                                <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="ac-card-foot ac-at-foot">
              <span>
                <Activity size={13} />
                排序：点击「用例 / 优先级 / 平均耗时 / 通过率 / 执行次数 / 断言数」表头切换升降序
              </span>
              <span className="ac-divider-v" />
              <span>
                <ShieldCheck size={13} />
                通过率口径 = 该用例在 8 次归档执行中的通过次数 ÷ runCount，与报告 summary.passRatePct（19/27 = 70.4%）同源
              </span>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-api-test-contract-coverage">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Gauge size={16} />
                契约覆盖度分析
              </span>
              <span className="ac-card-subtitle">
                14 份 API_CONTRACTS 中已建接口自动化用例 {coveredContracts.size} 份（
                {pct1((coveredContracts.size / API_CONTRACTS.length) * 100)}）
              </span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${uncoveredContracts.length === 0 ? 'ok' : 'warn'}`}>
                  未覆盖 {uncoveredContracts.length} 份
                </span>
                <button
                  type="button"
                  className="ac-btn ac-btn--ai ac-btn--sm"
                  onClick={generateMissingCases}
                  disabled={uncoveredContracts.length === 0}
                >
                  <Sparkles size={12} />
                  一键生成缺失用例
                </button>
              </div>
            </div>
            <div className="ac-card-body">
              <CoverageStrip coveredIds={coveredContracts} />
              <div className="ac-at-cov-legend">
                {(['frozen', 'reviewing', 'draft'] as const).map((s) => (
                  <span key={s} className="ac-at-cov-legend-item">
                    <span className="ac-at-cov-swatch" style={{ background: CONTRACT_STATUS_HEX[s] }} />
                    {s === 'frozen' ? '已冻结' : s === 'reviewing' ? '评审中' : '草稿'}
                  </span>
                ))}
                <span className="ac-at-cov-legend-item">
                  <span className="ac-at-cov-swatch ac-at-cov-swatch--empty" />
                  未建例
                </span>
              </div>

              <div className="ac-at-cov-grid">
                <div className="ac-at-cov-col">
                  <div className="ac-at-sub-title">
                    <AlertTriangle size={13} />
                    未覆盖契约清单（{uncoveredContracts.length}）
                  </div>
                  {uncoveredContracts.length === 0 ? (
                    <div className="ac-hint ac-hint--ok">
                      <CheckCircle2 size={14} />
                      <span>14 份契约已全部建立接口自动化用例，覆盖率 100%。</span>
                    </div>
                  ) : (
                    <div className="ac-at-cov-list">
                      {uncoveredContracts.map((c) => (
                        <div className="ac-at-cov-item" key={c.id}>
                          <span className={`ac-at-method ac-at-method--${METHOD_META[c.method]?.tone ?? 'neutral'}`}>{c.method}</span>
                          <div className="ac-flex-1">
                            <div className="ac-at-cell-main">
                              {c.id} · {c.name}
                            </div>
                            <div className="ac-xs ac-muted ac-mono">{c.path}</div>
                            <div className="ac-xs ac-text-2 ac-at-cov-reason">
                              {c.status === 'draft'
                                ? '草稿态：验收标准未冻结，ag-test 只能产出 draft 用例且不参与门禁判定'
                                : c.method === 'EVENT'
                                  ? '事件契约：无 HTTP 端点，需改用消息订阅断言（mq.count）而非接口用例'
                                  : '已冻结但尚未建例'}
                            </div>
                          </div>
                          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[c.tone]}`}>{c.statusLabel}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ac-at-cov-col">
                  <div className="ac-ai-block">
                    <div className="ac-ai-block-title">
                      <Sparkles size={13} />
                      ag-test · 覆盖缺口补全建议
                    </div>
                    <div className="ac-at-ai-list">
                      <p>
                        <strong>可立即补全（2 份）：</strong>API-06 状态变更流水查询与 API-10 拆单预演目前为草稿态，
                        建议先由 ag-pm 补齐验收标准并推动 G2 复评冻结；冻结后 ag-test 可按六类变体自动生成 9 条用例
                        （正向 2 / 异常 3 / 边界 2 / 幂等 1 / 安全 1），契约覆盖率可由{' '}
                        {pct1((coveredContracts.size / API_CONTRACTS.length) * 100)} 提升至 85.7%（12/14）。
                      </p>
                      <p>
                        <strong>需换断言形态（2 份）：</strong>API-11 order.created 与 API-12 order.state.changed 属 CloudEvents 事件契约，
                        不适合建 HTTP 用例。建议在 AS-02 / AS-05 中以 <code className="ac-at-code">mq.count(topic, filter)</code> 断言投递次数与信封 Schema，
                        AC-09 已用该方式覆盖 API-12 的一次投递语义，剩余 API-11 需新增 1 条幂等重投用例。
                      </p>
                      <p>
                        <strong>人工介入点：</strong>API-10 拆单预演的 WMS 协议尚未冻结（错误码 WMS_PROTOCOL_UNFROZEN），
                        生成用例前需架构师严慕舟确认预演结果是否可断言；否则一律标记 draft，不纳入 G4 判据。
                      </p>
                    </div>
                    <div className="ac-at-ai-actions">
                      <button
                        type="button"
                        className="ac-btn ac-btn--ai ac-btn--sm"
                        onClick={generateMissingCases}
                        disabled={uncoveredContracts.length === 0}
                      >
                        <Plus size={12} />
                        采纳建议并生成草稿用例
                      </button>
                      <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('design')}>
                        <ArrowRight size={12} />
                        去架构设计页推动契约冻结
                      </button>
                    </div>
                  </div>
                  <div className="ac-hint ac-at-mt">
                    <Layers size={14} />
                    <span>
                      覆盖率条按契约编号 01~14 顺序排布：实色格表示已有接口用例（颜色对应契约状态），
                      虚线灰格表示尚未建例。点击「一键生成缺失用例」会在本页乐观新增覆盖标记，不回写数据层。
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-api-test-flaky">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <AlertTriangle size={16} />
                flaky 用例治理区
              </span>
              <span className="ac-card-subtitle">status = flaky 的用例单列，附 AI 稳定性诊断与处置建议</span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${flakyCases.length > 0 ? 'warn' : 'ok'}`}>
                  抖动用例 {flakyCases.length} 条 · 报告 flakyRate {apiTestReport.summary.flakyRate}%
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              {flakyCases.length === 0 ? (
                <div className="ac-empty ac-empty--sm">
                  <span className="ac-empty-icon">
                    <CheckCircle2 size={20} />
                  </span>
                  <div className="ac-empty-title">当前没有抖动用例</div>
                  <div className="ac-empty-desc">全部接口用例在最近 4 次归档执行中结果稳定，无需进入隔离观察。</div>
                </div>
              ) : (
                <div className="ac-at-flaky-list">
                  {flakyCases.map((c) => {
                    const diag = FLAKY_DIAGNOSIS[c.id];
                    const decision = flakyDecision[c.id];
                    return (
                      <div className="ac-at-flaky" key={c.id}>
                        <div className="ac-at-flaky-head">
                          <span className={`ac-at-method ac-at-method--${METHOD_META[c.method]?.tone ?? 'neutral'}`}>{c.method}</span>
                          <span className="ac-at-cell-main">{c.name}</span>
                          <span className="ac-tag ac-tag--sm ac-tag--warn">
                            <span className="ac-tag-dot" />
                            flaky
                          </span>
                          <span className="ac-xs ac-muted ac-mono ac-ml-auto">
                            {c.id} · 通过率 {pct1(c.passRatePct)} · 近 {c.runCount} 次
                          </span>
                        </div>
                        <div className="ac-at-flaky-body">
                          <MiniSparkline points={passRateSeries(c)} tone={c.tone} />
                          <div className="ac-at-flaky-diag">
                            {diag ? (
                              <>
                                <div className="ac-ai-block">
                                  <div className="ac-ai-block-title">
                                    <Sparkles size={13} />
                                    ag-test · 稳定性诊断
                                  </div>
                                  <dl className="ac-kv ac-at-kv-tight">
                                    <dt>抖动成因</dt>
                                    <dd>{diag.cause}</dd>
                                    <dt>证据</dt>
                                    <dd>{diag.evidence}</dd>
                                    <dt>建议动作</dt>
                                    <dd>{diag.action}</dd>
                                    <dt>预期收益</dt>
                                    <dd>{diag.gain}</dd>
                                  </dl>
                                </div>
                                <div className="ac-at-ai-actions">
                                  <button
                                    type="button"
                                    className={`ac-btn ac-btn--sm ${decision === 'accepted' ? 'ac-btn--primary' : 'ac-btn--ghost'}`}
                                    onClick={() => setFlakyDecision((p) => ({ ...p, [c.id]: 'accepted' }))}
                                  >
                                    <CheckCircle2 size={12} />
                                    {decision === 'accepted' ? '已采纳（duration 断言改 retry）' : '采纳诊断'}
                                  </button>
                                  <button
                                    type="button"
                                    className={`ac-btn ac-btn--sm ${decision === 'rejected' ? 'ac-btn--danger' : 'ac-btn--ghost'}`}
                                    onClick={() => setFlakyDecision((p) => ({ ...p, [c.id]: 'rejected' }))}
                                  >
                                    <XCircle size={12} />
                                    {decision === 'rejected' ? '已驳回（转人工排查）' : '驳回'}
                                  </button>
                                  <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setCaseDrawer(c)}>
                                    查看用例详情
                                    <ChevronRight size={12} />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="ac-hint ac-hint--warn">
                                <AlertTriangle size={14} />
                                <span>该用例暂无 AI 稳定性诊断记录，建议先在 AS-04 场景中复跑 3 次采集耗时分布。</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= 2. 场景编排 ================= */}
      {tab === 'scenarios' && (
        <>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Workflow size={16} />
                场景编排清单
              </span>
              <span className="ac-card-subtitle">对标 hifox 场景链：多接口串联 + 变量提取 + 多层断言 + 数据驱动</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">步骤合计 {API_SCENARIO_STEPS.length}</span>
                <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={() => setAiScenarioOpen(true)}>
                  <BrainCircuit size={12} />
                  AI 生成场景
                </button>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>场景</th>
                      <th className="ac-td-right">步骤</th>
                      <th>触发方式</th>
                      <th>环境</th>
                      <th>数据驱动集</th>
                      <th>超时 / 重试</th>
                      <th>状态</th>
                      <th>关联门禁</th>
                      <th>最近执行</th>
                      <th className="ac-td-right">通过率</th>
                      <th>负责人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allScenarios.map((s) => {
                      const ds = DATA_SETS.find((d) => d.id === s.dataDrivenSetId);
                      const active = s.id === activeScenario.id;
                      return (
                        <tr
                          key={s.id}
                          className={`ac-at-row ${active ? 'ac-table-row--selected' : ''}`}
                          onClick={() => {
                            setActiveScenarioId(s.id);
                            setSelectedStepId(null);
                          }}
                          title="点击在下方链路图中查看该场景"
                        >
                          <td>
                            <div className="ac-at-case-name">{s.name}</div>
                            <span className="ac-xs ac-muted ac-mono">
                              {s.id} · 用例 {s.caseIds.join(' / ')}
                            </span>
                          </td>
                          <td className="ac-td-num">{s.stepCount}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TRIGGER_META[s.triggerType].tone}`}>
                              {TRIGGER_META[s.triggerType].label}
                            </span>
                            {s.triggerType === 'schedule' ? (
                              <span className="ac-xs ac-muted ac-mono ac-at-cell-sub">cron {s.cronExpr}</span>
                            ) : null}
                          </td>
                          <td>
                            <span className="ac-at-tag-col">
                              {s.envIds.map((e) => (
                                <span key={e} className="ac-tag ac-tag--sm ac-tag--outline">
                                  {ENV_MAP[e]?.name ?? e}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td>
                            {ds ? (
                              <>
                                <span className="ac-at-cell-main">{ds.id}</span>
                                <span className="ac-xs ac-muted ac-at-cell-sub">
                                  {ds.rowCount} 行 · {DATASET_SOURCE_META[ds.sourceType].label}
                                </span>
                              </>
                            ) : (
                              <span className="ac-xs ac-muted">不使用</span>
                            )}
                          </td>
                          <td className="ac-xs ac-text-2 ac-nowrap">
                            {s.timeoutSec}s / {s.retryPolicy.maxAttempts} 次 · {s.retryPolicy.backoffMs}ms
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${s.status === 'active' ? 'ok' : s.status === 'draft' ? 'info' : 'neutral'}`}>
                              {s.status === 'active' ? '生效中' : s.status === 'draft' ? '草稿' : '已停用'}
                            </span>
                          </td>
                          <td>
                            <span className="ac-at-tag-col">
                              {s.gateIds.map((g) => (
                                <button
                                  key={g}
                                  type="button"
                                  className="ac-tag ac-tag--sm ac-tag--warn ac-at-link"
                                  title={`${GATE_MAP[g]?.name ?? g}：${GATE_MAP[g]?.desc ?? ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jump('pipeline');
                                  }}
                                >
                                  {g} {GATE_MAP[g]?.name ?? ''}
                                </button>
                              ))}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${RUN_RESULT_META[s.lastRunStatus].tone}`}>
                              {RUN_RESULT_META[s.lastRunStatus].label}
                            </span>
                            <span className="ac-xs ac-muted ac-mono ac-at-cell-sub">
                              {s.lastRunId} · {s.lastRunAt}
                            </span>
                          </td>
                          <td className="ac-td-num">
                            <span className={s.passRatePct >= 90 ? 'ac-ok-text' : s.passRatePct >= 50 ? 'ac-warn-text' : 'ac-danger-text'}>
                              {s.passRatePct > 0 ? pct1(s.passRatePct) : '—'}
                            </span>
                          </td>
                          <td>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ${ownerAvatar(s.owner)}`}>{ownerInitial(s.owner)}</span>
                              <span className="ac-user-name">{ownerName(s.owner)}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot ac-at-foot">
              <span>
                <Zap size={13} />
                触发口径：ci = Jenkins 在 push / 需求级流水线阶段完成后自动触发；event = 领域事件驱动；schedule = cron 定时；manual = 人工加跑
              </span>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-api-test-scenario-flow">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Workflow size={16} />
                场景链路图 · {activeScenario.id}
              </span>
              <span className="ac-card-subtitle">{activeScenario.name}</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  {activeScenarioSteps.length} 步 · 变量 {activeScenarioSteps.reduce((s, x) => s + x.extractVars.length, 0)} 个 · 断言{' '}
                  {activeScenarioSteps.reduce((s, x) => s + x.assertions.length, 0)} 条
                </span>
                <span className={`ac-tag ac-tag--${TAG_TONE[activeScenario.tone]}`}>
                  {TRIGGER_META[activeScenario.triggerType].label}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <ScenarioFlowGraph steps={activeScenarioSteps} selectedStepId={selectedStepId} />
              <div className="ac-hint ac-at-mt">
                <Layers size={14} />
                <span>
                  实线为执行顺序；紫色虚线为变量流向（提取步骤的变量被后续哪些步骤的断言以{' '}
                  <code className="ac-at-code">{'${ctx.变量名}'}</code> 消费）；橙色虚线为条件分支的不成立路径；
                  节点下方的回边表示按数据驱动集逐行循环。点击节点可在明细表中定位该步骤。
                </span>
              </div>

              {activeScenario.id === 'AS-06' ? (
                <div className="ac-hint ac-hint--ai ac-at-mt">
                  <Sparkles size={14} />
                  <span>
                    该场景为 ag-test 刚生成的草稿：链路图中的等待窗口与条件分支由 AI 依据 API-04 契约的异步语义自动插入，
                    尚未执行过，通过率与耗时为空；请人工复核后再绑定 G4 门禁并转 active。
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                步骤明细 · {activeScenario.id}
              </span>
              <span className="ac-card-subtitle">提取变量（name ← fromPath → toJsonPath）与断言（类型 / 表达式 / 期望值 / 失败处理）</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">共 {activeScenarioSteps.length} 步</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th className="ac-td-right">序号</th>
                      <th>步骤类型</th>
                      <th>名称</th>
                      <th>关联用例</th>
                      <th>提取变量</th>
                      <th>断言明细</th>
                      <th>条件 / 循环</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeScenarioSteps.map((s) => {
                      const meta = STEP_TYPE_META[s.stepType];
                      const active = selectedStepId === s.id;
                      return (
                        <tr
                          key={s.id}
                          className={`ac-at-row ${active ? 'ac-table-row--selected' : ''}`}
                          onClick={() => setSelectedStepId(active ? null : s.id)}
                        >
                          <td className="ac-td-num">{s.order}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[meta.tone]}`}>{meta.label}</span>
                            <span className="ac-xs ac-muted ac-mono ac-at-cell-sub">{s.id}</span>
                          </td>
                          <td className="ac-at-step-name">{s.name}</td>
                          <td>
                            <button
                              type="button"
                              className="ac-btn ac-btn--text ac-btn--sm ac-at-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                const c = allCases.find((x) => x.id === s.caseId);
                                if (c) setCaseDrawer(c);
                              }}
                            >
                              {s.caseId}
                            </button>
                          </td>
                          <td>
                            {s.extractVars.length === 0 ? (
                              <span className="ac-xs ac-muted">—</span>
                            ) : (
                              <span className="ac-at-var-col">
                                {s.extractVars.map((v) => (
                                  <span className="ac-at-var" key={v.name}>
                                    <strong>{v.name}</strong>
                                    <code className="ac-at-code">{v.fromPath}</code>
                                    <ArrowRight size={10} />
                                    <code className="ac-at-code">{v.toJsonPath}</code>
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                          <td>
                            {s.assertions.length === 0 ? (
                              <span className="ac-xs ac-muted">无断言（等待步骤）</span>
                            ) : (
                              <span className="ac-at-assert-col">
                                {s.assertions.map((a, i) => (
                                  <span className="ac-at-assert" key={`${s.id}-${i}`}>
                                    <span className={`ac-tag ac-tag--sm ac-tag--${ASSERT_TYPE_META[a.type]?.tone ?? 'neutral'}`}>
                                      {ASSERT_TYPE_META[a.type]?.label ?? a.type}
                                    </span>
                                    <code className="ac-at-code ac-at-assert-expr">{a.expr}</code>
                                    <span className="ac-at-assert-exp">期望 {a.expected}</span>
                                    <span className={`ac-tag ac-tag--sm ac-tag--${ON_FAIL_META[a.onFail].tone}`}>
                                      失败{ON_FAIL_META[a.onFail].label}
                                    </span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                          <td className="ac-xs">
                            {s.conditionExpr ? (
                              <code className="ac-at-code ac-at-cond">{s.conditionExpr}</code>
                            ) : s.loopOver ? (
                              <code className="ac-at-code ac-at-cond">{s.loopOver}</code>
                            ) : (
                              <span className="ac-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedStep ? (
              <div className="ac-card-foot">
                <div className="ac-hint ac-hint--ai">
                  <Sparkles size={14} />
                  <span>
                    已选中 {selectedStep.id}「{selectedStep.name}」：{STEP_TYPE_META[selectedStep.stepType].note}；
                    该步骤执行用例 {selectedStep.caseId}（
                    {allCases.find((c) => c.id === selectedStep.caseId)?.name ?? '—'}），
                    失败处理策略为{' '}
                    {selectedStep.assertions.length > 0
                      ? selectedStep.assertions.map((a) => ON_FAIL_META[a.onFail].label).join(' / ')
                      : '无断言'}
                    。
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Target size={16} />
                  断言质量分析（22 步全量）
                </span>
                <span className="ac-card-subtitle">五类断言的分布与缺口</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">断言合计 {assertionStats.total} 条</span>
                </div>
              </div>
              <div className="ac-card-body">
                <HBars
                  unit=" 条"
                  items={(Object.keys(assertionStats.counter) as (keyof typeof assertionStats.counter)[]).map((k) => ({
                    label: ASSERT_TYPE_META[k]?.label ?? k,
                    value: assertionStats.counter[k],
                    tone: (ASSERT_TYPE_META[k]?.tone ?? 'neutral') as Tone,
                  }))}
                />
                {assertHint ? (
                  <div className="ac-hint ac-hint--ok ac-at-mt">
                    <CheckCircle2 size={14} />
                    <span>{assertHint}</span>
                  </div>
                ) : null}
                <div className="ac-ai-block ac-at-mt">
                  <div className="ac-ai-block-title">
                    <Sparkles size={13} />
                    ag-test · 断言质量诊断
                  </div>
                  <div className="ac-at-ai-list">
                    <p>
                      <strong>Schema 断言严重不足：</strong>
                      {assertionStats.withAssertCount} 个含断言的步骤中仅 1 个（ASS-13）使用了 schema 断言，
                      其余 {assertionStats.noSchema.length} 个步骤只做值比较。契约 v2.0 属破坏性变更（新增 Idempotency-Key 必填、废弃 clientToken），
                      缺少 schema 断言意味着字段类型漂移（如金额由 string(decimal) 变 number）不会被发现，正是 BUG-1043 尾差问题的温床。
                    </p>
                    <p>
                      <strong>耗时断言覆盖偏低：</strong>仅 ASS-05 / ASS-15 / ASS-18 三步带 duration 断言，
                      {assertionStats.noDuration.length} 个步骤未做耗时校验；REQ-2404 承诺的 P95 ≤ 200ms 只在 AS-04 中被覆盖，
                      建议为 API-01（P99 186ms）与 API-08 也补 duration 断言。
                    </p>
                    <p>
                      <strong>缺口清单：</strong>
                      {assertionStats.noSchema.slice(0, 6).map((s) => s.id).join('、')}
                      {assertionStats.noSchema.length > 6 ? ` 等 ${assertionStats.noSchema.length} 步` : ''} 缺 schema 断言；
                      建议统一在 request 类步骤追加 <code className="ac-at-code">schema($.data, contractSchema)</code>，失败处理设为 continue 以便一次跑完收集全部偏差。
                    </p>
                  </div>
                  <div className="ac-at-ai-actions">
                    <button
                      type="button"
                      className="ac-btn ac-btn--ai ac-btn--sm"
                      onClick={() =>
                        setAssertHint(
                          `已为 ${assertionStats.noSchema.length} 个步骤批量追加 schema 断言草稿（失败处理 continue），并为 API-01 / API-08 相关步骤补 3 条 duration 断言；变更以草稿形式挂在 AS-01~AS-05，需人工复核后生效。`,
                        )
                      }
                    >
                      <Sparkles size={12} />
                      采纳：批量补齐 schema 断言
                    </button>
                    <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setAssertHint('已驳回批量补断言建议，保持现有 52 条断言不变；缺口清单已记录到迭代报告 aiInsights。')}>
                      <XCircle size={12} />
                      驳回
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Activity size={16} />
                  场景通过率
                </span>
                <span className="ac-card-subtitle">按归档执行均值</span>
              </div>
              <div className="ac-card-body">
                <DonutChart
                  size={176}
                  thickness={24}
                  centerValue={`${allScenarios.filter((s) => s.status === 'active').length}`}
                  centerLabel="生效场景"
                  ariaLabel="5 条场景的状态分布"
                  items={[
                    { label: '生效中', value: allScenarios.filter((s) => s.status === 'active').length, tone: 'ok' },
                    { label: '草稿', value: allScenarios.filter((s) => s.status === 'draft').length, tone: 'info' },
                    { label: '已停用', value: allScenarios.filter((s) => s.status === 'disabled').length, tone: 'neutral' },
                  ]}
                />
                <div className="ac-at-scene-rates">
                  {allScenarios.map((s) => (
                    <div className="ac-at-scene-rate" key={s.id}>
                      <span className="ac-at-scene-id">{s.id}</span>
                      <div className="ac-progress ac-progress--sm">
                        <div
                          className={`ac-progress-bar ${
                            s.passRatePct >= 90 ? 'ac-progress-bar--ok' : s.passRatePct >= 50 ? 'ac-progress-bar--warn' : 'ac-progress-bar--danger'
                          }`}
                          style={{ width: `${Math.max(s.passRatePct, 2)}%` }}
                        />
                      </div>
                      <span className="ac-progress-label">{s.passRatePct > 0 ? pct1(s.passRatePct) : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 3. Mock 与数据集 ================= */}
      {tab === 'mock' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-api-test-mock-rules">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Wrench size={16} />
                Mock 规则
              </span>
              <span className="ac-card-subtitle">为库存中心 / 支付网关 / WMS / 券中心 / 营销中台 / 会员中心 / ES 提供下游桩</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">启用 {allMocks.filter((m) => m.enabled).length}</span>
                <span className="ac-tag ac-tag--ai">AI 动态 {allMocks.filter((m) => m.responseType === 'dynamic-ai').length}</span>
                <span className="ac-tag ac-tag--outline">近 30 日命中 {num(allMocks.reduce((s, m) => s + m.hitCount30d, 0))}</span>
              </div>
            </div>

            {mockHint ? (
              <div className="ac-hint ac-hint--warn ac-at-inline-hint">
                <AlertTriangle size={14} />
                <span>{mockHint}</span>
                <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-at-hint-close" onClick={() => setMockHint(null)}>
                  收起
                </button>
              </div>
            ) : null}

            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>规则</th>
                      <th>匹配路径</th>
                      <th>方法</th>
                      <th>匹配条件</th>
                      <th>响应类型</th>
                      <th className="ac-td-right">延迟</th>
                      <th className="ac-td-right">错误码</th>
                      <th className="ac-td-right">近 30 日命中</th>
                      <th>生效环境</th>
                      <th className="ac-td-center">启用</th>
                      <th>创建人</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allMocks.map((m) => {
                      const rt = RESPONSE_TYPE_META[m.responseType];
                      return (
                        <tr key={m.id} className="ac-at-row" onClick={() => { setMockDrawer(m); setMockTrial(null); }} title="点击查看响应模板与试运行">
                          <td>
                            <div className="ac-at-case-name">{m.name}</div>
                            <span className="ac-xs ac-muted ac-mono">{m.id}</span>
                          </td>
                          <td className="ac-mono ac-xs ac-text-2 ac-at-path">{m.matchPath}</td>
                          <td>
                            <span className={`ac-at-method ac-at-method--${METHOD_META[m.matchMethod]?.tone ?? 'neutral'}`}>{m.matchMethod}</span>
                          </td>
                          <td className="ac-xs">
                            {m.matchCondition ? (
                              <code className="ac-at-code ac-at-cond">{m.matchCondition}</code>
                            ) : (
                              <span className="ac-muted">无条件（全匹配）</span>
                            )}
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${rt.tone}`}>
                              {m.responseType === 'dynamic-ai' ? <Sparkles size={11} /> : null}
                              {rt.label}
                            </span>
                          </td>
                          <td className="ac-td-num">{m.delayMs !== null ? `${m.delayMs} ms` : '—'}</td>
                          <td className="ac-td-num">
                            {m.errorStatus !== null ? (
                              <span className="ac-danger-text ac-semi">{m.errorStatus}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="ac-td-num">{num(m.hitCount30d)}</td>
                          <td>
                            <span className="ac-at-tag-col">
                              {m.envIds.map((e) => (
                                <span key={e} className="ac-tag ac-tag--sm ac-tag--outline">
                                  {ENV_MAP[e]?.code ?? e}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-td-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`ac-at-switch ${m.enabled ? 'ac-at-switch--on' : ''}`}
                              aria-label={`${m.id} 启用开关`}
                              aria-pressed={m.enabled}
                              onClick={() => toggleMock(m)}
                            />
                          </td>
                          <td>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ${ownerAvatar(m.createdBy)}`}>{ownerInitial(m.createdBy)}</span>
                              <span className="ac-user-name">{ownerName(m.createdBy)}</span>
                            </span>
                          </td>
                          <td className="ac-td-right">
                            <button
                              type="button"
                              className="ac-btn ac-btn--text ac-btn--sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMockDrawer(m);
                                setMockTrial(null);
                              }}
                            >
                              模板
                              <ChevronRight size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot ac-at-foot">
              <span>
                <ShieldCheck size={13} />
                MK-02 / MK-05 / MK-08 为混沌与错误注入桩，仅在 env-test（MK-08 含 env-staging）生效，生产环境禁止挂载
              </span>
              <span className="ac-divider-v" />
              <span>
                <Zap size={13} />
                切换启用开关为本地乐观更新，会同步提示受影响的场景与用例
              </span>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Database size={16} />
                数据驱动集
              </span>
              <span className="ac-card-subtitle">四种数据源，生产采样必须经 SEC-MASK-2.1 脱敏并匿名化后方可入库</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">行数合计 {num(DATA_SETS.reduce((s, d) => s + d.rowCount, 0))}</span>
                <span className="ac-tag ac-tag--danger">
                  敏感列 {DATA_SETS.reduce((s, d) => s + d.columns.filter((c) => c.sensitive).length, 0)}
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>数据集</th>
                      <th>来源类型</th>
                      <th className="ac-td-right">行数</th>
                      <th className="ac-td-right">列 / 敏感列</th>
                      <th>被场景使用</th>
                      <th>最近刷新</th>
                      <th>生产样本匿名化</th>
                      <th>生成者</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DATA_SETS.map((d) => {
                      const sensitive = d.columns.filter((c) => c.sensitive).length;
                      return (
                        <tr key={d.id} className="ac-at-row" onClick={() => setDsDrawer(d)} title="点击查看列定义与脱敏规则">
                          <td>
                            <div className="ac-at-case-name">{d.name}</div>
                            <span className="ac-xs ac-muted ac-mono">{d.id}</span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${DATASET_SOURCE_META[d.sourceType].tone}`}>
                              {d.sourceType === 'ai-generated' ? <Sparkles size={11} /> : null}
                              {DATASET_SOURCE_META[d.sourceType].label}
                            </span>
                          </td>
                          <td className="ac-td-num">{num(d.rowCount + (dsExtraRows[d.id] ?? 0))}</td>
                          <td className="ac-td-num">
                            {d.columns.length} / {sensitive > 0 ? <span className="ac-danger-text ac-semi">{sensitive}</span> : 0}
                          </td>
                          <td>
                            <span className="ac-at-tag-col">
                              {d.usedByScenarioIds.map((sid) => {
                                const sc = allScenarios.find((x) => x.id === sid);
                                return (
                                  <span key={sid} className="ac-tag ac-tag--sm ac-tag--outline" title={sc?.name ?? sid}>
                                    {sid}
                                  </span>
                                );
                              })}
                            </span>
                          </td>
                          <td className="ac-xs ac-muted ac-mono">{d.lastRefreshedAt}</td>
                          <td>
                            {d.sourceType === 'production-sample' ? (
                              <span className={`ac-tag ac-tag--sm ac-tag--${d.productionSampleAnonymized ? 'ok' : 'danger'}`}>
                                {d.productionSampleAnonymized ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                {d.productionSampleAnonymized ? '已匿名化' : '未匿名化'}
                              </span>
                            ) : (
                              <span className="ac-xs ac-muted">不适用</span>
                            )}
                          </td>
                          <td className="ac-xs ac-text-2">{d.generatedBy.startsWith('u-') ? ownerName(d.generatedBy) : agentName(d.generatedBy)}</td>
                          <td className="ac-td-right">
                            <button
                              type="button"
                              className="ac-btn ac-btn--text ac-btn--sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDsDrawer(d);
                              }}
                            >
                              列详情
                              <ChevronRight size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint ac-hint--danger">
                <ShieldCheck size={14} />
                <span>
                  ADS-04 的 attackerToken / receiverPhone / receiverAddress / receiverName 四列均为敏感字段，分别绑定平台 redactRules 的
                  rd-08（访问令牌全量替换）、rd-01（手机号中间四位掩码）、rd-03（保留省市区）、rd-06（收货人保留姓氏）；
                  示例值在界面上一律以掩码形式展示，明文只存在于已脱敏的 CSV 源文件中。
                </span>
              </div>
            </div>
          </div>

          {dsHint ? (
            <div className="ac-hint ac-hint--ok">
              <CheckCircle2 size={14} />
              <span>{dsHint}</span>
            </div>
          ) : null}
        </>
      )}

      {/* ================= 4. 执行记录 ================= */}
      {tab === 'runs' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-api-test-run-table">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                归档执行记录
              </span>
              <span className="ac-card-subtitle">8 次执行合计 {caseStats.runTotal} 例次、通过 {caseStats.runPassed} 例次</span>
              <div className="ac-card-extra">
                <select className="ac-select ac-select--sm" value={runFilterTrigger} onChange={(e) => setRunFilterTrigger(e.target.value)}>
                  <option value="all">全部触发方式</option>
                  <option value="ci">CI 触发</option>
                  <option value="event">事件触发</option>
                  <option value="schedule">定时调度</option>
                  <option value="manual">手动触发</option>
                </select>
                <select className="ac-select ac-select--sm" value={runFilterEnv} onChange={(e) => setRunFilterEnv(e.target.value)}>
                  <option value="all">全部环境</option>
                  {Object.keys(ENV_MAP).map((id) => (
                    <option key={id} value={id}>
                      {ENV_MAP[id].name}
                    </option>
                  ))}
                </select>
                <span className="ac-tag ac-tag--outline">命中 {filteredRuns.length}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              {filteredRuns.length === 0 ? (
                <div className="ac-empty">
                  <span className="ac-empty-icon">
                    <ListChecks size={22} />
                  </span>
                  <div className="ac-empty-title">该筛选组合下没有执行记录</div>
                  <div className="ac-empty-desc">8 次归档执行分布在 env-dev / env-test / env-staging 三个环境，请调整触发方式或环境条件。</div>
                </div>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm ac-table--bordered">
                    <thead>
                      <tr>
                        <th>执行编号</th>
                        <th>场景 / 用例集</th>
                        <th>触发</th>
                        <th>触发者</th>
                        <th>环境</th>
                        <th>分支</th>
                        <th>commit</th>
                        <th>流水线</th>
                        <th>开始 → 结束</th>
                        <th className="ac-td-right">耗时</th>
                        <th className="ac-td-right">用例</th>
                        <th className="ac-td-right">通过/失败/阻塞/跳过</th>
                        <th className="ac-td-right">通过率</th>
                        <th>新建缺陷</th>
                        <th className="ac-td-right">覆盖率 / flaky</th>
                        <th className="ac-td-right">报告</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRuns.map((r) => {
                        const sc = allScenarios.find((s) => s.id === r.scenarioId);
                        const rate = r.totalCases > 0 ? (r.passed / r.totalCases) * 100 : 0;
                        return (
                          <tr key={r.id} className="ac-at-row" onClick={() => setRunDrawer(r)} title="点击查看失败明细与 AI 根因初判">
                            <td>
                              <span className="ac-mono ac-brand-text ac-semi">{r.id}</span>
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.tone]} ac-at-cell-sub`}>{r.statusLabel.slice(0, 12)}</span>
                            </td>
                            <td>
                              {sc ? (
                                <>
                                  <span className="ac-at-cell-main">{sc.id}</span>
                                  <span className="ac-xs ac-muted ac-at-cell-sub ac-at-clip">{sc.name}</span>
                                </>
                              ) : (
                                <>
                                  <span className="ac-at-cell-main">单用例执行</span>
                                  <span className="ac-xs ac-muted ac-mono ac-at-cell-sub">{r.caseIds.join(' / ')}</span>
                                </>
                              )}
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${TRIGGER_META[r.triggerType].tone}`}>
                                {TRIGGER_META[r.triggerType].label}
                              </span>
                            </td>
                            <td>
                              <span className="ac-user">
                                <span className={`ac-avatar ac-avatar--xs ${ownerAvatar(r.triggeredBy)}`}>{ownerInitial(r.triggeredBy)}</span>
                                <span className="ac-user-name">{ownerName(r.triggeredBy)}</span>
                              </span>
                            </td>
                            <td className="ac-xs ac-text-2 ac-nowrap">{ENV_MAP[r.envId]?.name ?? r.envId}</td>
                            <td className="ac-mono ac-xs ac-text-2 ac-at-clip">{r.branch}</td>
                            <td className="ac-mono ac-xs">{r.commitSha}</td>
                            <td>
                              {r.pipelineRunId ? (
                                <button
                                  type="button"
                                  className="ac-btn ac-btn--text ac-btn--sm ac-at-link"
                                  title={`${r.pipelineRunId} · ${PIPELINE_MAP[r.pipelineRunId]?.branch ?? ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jump('pipeline');
                                  }}
                                >
                                  <GitBranch size={12} />
                                  {r.pipelineRunId}
                                </button>
                              ) : (
                                <span className="ac-xs ac-muted">无关联</span>
                              )}
                            </td>
                            <td className="ac-mono ac-xs ac-text-2 ac-nowrap">
                              {r.startedAt.slice(5)}
                              <span className="ac-at-cell-sub">{r.finishedAt.slice(5)}</span>
                            </td>
                            <td className="ac-td-num ac-xs">{fmtMs(r.durationMs)}</td>
                            <td className="ac-td-num">{r.totalCases}</td>
                            <td className="ac-td-num ac-xs">
                              <span className="ac-ok-text">{r.passed}</span>
                              {' / '}
                              <span className={r.failed > 0 ? 'ac-danger-text' : 'ac-muted'}>{r.failed}</span>
                              {' / '}
                              <span className={r.blocked > 0 ? 'ac-warn-text' : 'ac-muted'}>{r.blocked}</span>
                              {' / '}
                              <span className="ac-muted">{r.skipped}</span>
                            </td>
                            <td className="ac-td-num">
                              <span className={rate >= 90 ? 'ac-ok-text' : rate >= 50 ? 'ac-warn-text' : 'ac-danger-text'}>{pct1(rate)}</span>
                              {Math.abs(rate - r.passRatePct) > 0.05 ? (
                                <span className="ac-at-cell-sub ac-danger-text ac-xs">口径不符</span>
                              ) : null}
                            </td>
                            <td>
                              {r.newBugsCreated.length === 0 ? (
                                <span className="ac-xs ac-muted">无</span>
                              ) : (
                                <span className="ac-at-tag-col">
                                  {r.newBugsCreated.map((b) => (
                                    <button
                                      key={b}
                                      type="button"
                                      className="ac-tag ac-tag--sm ac-tag--danger ac-at-link"
                                      title={BUG_MAP[b]?.title ?? b}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        jump('bug');
                                      }}
                                    >
                                      {b}
                                    </button>
                                  ))}
                                </span>
                              )}
                            </td>
                            <td className="ac-td-num ac-xs">
                              {pct1(r.coveragePct)}
                              <span className="ac-at-cell-sub">flaky {r.flakyCount}</span>
                            </td>
                            <td className="ac-td-right">
                              <span className="ac-mono ac-xs ac-text-2">{r.reportId}</span>
                              <button
                                type="button"
                                className="ac-btn ac-btn--text ac-btn--sm ac-at-cell-sub"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRunDrawer(r);
                                }}
                              >
                                明细
                                <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="ac-card-foot ac-at-foot">
              <span>
                <Gauge size={13} />
                通过率自洽核算：每行通过率 = passed ÷ totalCases（如 AR-03 = 2 ÷ 3 = 66.7%），8 次累计 19 ÷ 27 = 70.4%，与报告 summary.passRatePct 一致
              </span>
            </div>
          </div>

          <div className="ac-grid-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Activity size={16} />
                  通过率与耗时趋势
                </span>
                <span className="ac-card-subtitle">8 次归档执行 · 双轴</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">P95 耗时 {fmtMs(apiTestReport.summary.p95DurationMs)}</span>
                </div>
              </div>
              <div className="ac-card-body">
                <PassRateDualAxis runs={API_TEST_RUNS} />
              </div>
            </div>
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Boxes size={16} />
                  用例结果构成
                </span>
                <span className="ac-card-subtitle">passed / failed / blocked / skipped 堆叠</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--ok">通过 19</span>
                  <span className="ac-tag ac-tag--danger">失败 8</span>
                </div>
              </div>
              <div className="ac-card-body">
                <RunStackBars runs={API_TEST_RUNS} />
                <div className="ac-at-legend-row">
                  {[
                    { label: '通过', hex: TONE_HEX.ok },
                    { label: '失败', hex: TONE_HEX.danger },
                    { label: '阻塞', hex: TONE_HEX.warn },
                    { label: '跳过', hex: TONE_HEX.slate },
                  ].map((l) => (
                    <span className="ac-at-legend-item" key={l.label}>
                      <span className="ac-at-legend-swatch" style={{ background: l.hex }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Settings2 size={16} />
                CI 触发配置与门禁联动
              </span>
              <span className="ac-card-subtitle">流水线某阶段完成后自动触发哪个场景，以及回写哪道门禁</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">关联流水线 {API_TEST_RUNS.filter((r) => r.pipelineRunId).length} 条</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>触发方式</th>
                      <th>场景</th>
                      <th>触发条件 / cron</th>
                      <th>关联流水线阶段</th>
                      <th>回写门禁</th>
                      <th>门禁判据</th>
                      <th className="ac-td-right">门禁状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allScenarios
                      .filter((s) => s.status !== 'draft')
                      .map((s) => {
                        const runs = API_TEST_RUNS.filter((r) => r.scenarioId === s.id);
                        const pipe = runs.find((r) => r.pipelineRunId)?.pipelineRunId ?? null;
                        return (
                          <Fragment key={s.id}>
                            {s.gateIds.map((g, gi) => {
                              const gate = GATE_MAP[g];
                              return (
                                <tr key={`${s.id}-${g}`}>
                                  <td>
                                    {gi === 0 ? (
                                      <span className={`ac-tag ac-tag--sm ac-tag--${TRIGGER_META[s.triggerType].tone}`}>
                                        {TRIGGER_META[s.triggerType].label}
                                      </span>
                                    ) : (
                                      <span className="ac-xs ac-muted">同上</span>
                                    )}
                                  </td>
                                  <td>
                                    {gi === 0 ? (
                                      <>
                                        <span className="ac-at-cell-main">{s.id}</span>
                                        <span className="ac-xs ac-muted ac-at-cell-sub ac-at-clip">{s.name}</span>
                                      </>
                                    ) : (
                                      <span className="ac-xs ac-muted">同一场景</span>
                                    )}
                                  </td>
                                  <td className="ac-mono ac-xs ac-text-2">
                                    {s.triggerType === 'schedule'
                                      ? s.cronExpr
                                      : s.triggerType === 'ci'
                                        ? 'push / MR 合入后由 Jenkins 阶段 api-test 触发'
                                        : s.triggerType === 'event'
                                          ? 'trade.order.created 领域事件（outbox 中继投递后）'
                                          : '人工在场景详情页点击执行'}
                                  </td>
                                  <td className="ac-xs ac-text-2">
                                    {pipe ? (
                                      <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-at-link" onClick={() => jump('pipeline')}>
                                        {pipe} · 阶段 api-test
                                      </button>
                                    ) : (
                                      <span className="ac-muted">独立执行（无流水线关联）</span>
                                    )}
                                  </td>
                                  <td>
                                    <button type="button" className="ac-tag ac-tag--sm ac-tag--warn ac-at-link" onClick={() => jump('pipeline')}>
                                      {g} {gate?.name ?? ''}
                                    </button>
                                  </td>
                                  <td className="ac-xs ac-text-2 ac-at-criteria">{gate?.criteria[gi] ?? gate?.criteria[0] ?? '—'}</td>
                                  <td className="ac-td-right">
                                    <span
                                      className={`ac-tag ac-tag--sm ac-tag--${
                                        gate?.status === 'passed' ? 'ok' : gate?.status === 'failed' ? 'danger' : gate?.status === 'waived' ? 'warn' : 'neutral'
                                      }`}
                                    >
                                      {gate?.status === 'passed'
                                        ? '已通过'
                                        : gate?.status === 'failed'
                                          ? '未通过'
                                          : gate?.status === 'waived'
                                            ? '例外放行'
                                            : '待判定'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint ac-hint--warn">
                <AlertTriangle size={14} />
                <span>
                  当前 G4 门禁未通过（4 项判据未满足），AS-05 的任一用例失败都会直接阻断 REL-2403 审批；
                  G3 由流水线 PIPE-2409 判定，聚合覆盖率 71.4% 未达 80% 基线，已连续 3 次失败并停止自动重跑，转门禁例外审批。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 5. 测试报告 ================= */}
      {tab === 'report' && (
        <>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <FileText size={16} />
                迭代级接口自动化报告 · {apiTestReport.id}
              </span>
              <span className="ac-card-subtitle">
                {sprint?.name ?? apiTestReport.sprintId} · {sprint?.theme ?? ''} · 生成于 {apiTestReport.generatedAt}
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">
                  <Sparkles size={12} />
                  {reportAgent?.name ?? apiTestReport.generatedBy} · {reportModel?.name ?? apiTestReport.modelId}
                </span>
                <span className="ac-tag ac-tag--outline">
                  范围：场景 {apiTestReport.scope.scenarios} · 用例 {apiTestReport.scope.cases} · 执行 {apiTestReport.scope.runs}
                </span>
                <button
                  type="button"
                  className={`ac-btn ac-btn--sm ${gatePass ? 'ac-btn--primary' : 'ac-btn--ghost ac-btn--disabled'}`}
                  disabled={!gatePass || signed}
                  title={gatePass ? '签发报告' : `门禁 ${apiTestReport.gateImpact.gateId} 未通过，报告禁止签发`}
                  onClick={() => setSigned(true)}
                >
                  <CheckCircle2 size={12} />
                  {signed ? '已签发' : '签发报告'}
                </button>
              </div>
            </div>
            <div className="ac-card-body">
              {!gatePass ? (
                <div className="ac-hint ac-hint--danger ac-mb-4">
                  <AlertTriangle size={14} />
                  <span>
                    <strong>签发已禁用：</strong>关联门禁 {apiTestReport.gateImpact.gateId}（{GATE_MAP[apiTestReport.gateImpact.gateId]?.name ?? ''}）判定为
                    未通过，尚有 {apiTestReport.gateImpact.unmetCriteria.length} 项硬性判据未满足。按平台规范，门禁未通过时报告只能以草稿态流转，
                    不得作为发布准入证据；需先关闭 P0 缺陷或由门禁责任人走例外审批。
                  </span>
                </div>
              ) : null}
              {signed ? (
                <div className="ac-hint ac-hint--ok ac-mb-4">
                  <CheckCircle2 size={14} />
                  <span>
                    报告 {apiTestReport.id} 已签发（本地乐观状态），将归档至知识库 KS-04「质量与测试」空间并生成 KD-18 的新版本切片，供 ag-test 下轮生成用例时检索。
                  </span>
                </div>
              ) : null}

              <div className="ac-metric-grid ac-metric-grid--4">
                <div className="ac-metric">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">总执行次数</span>
                    <span className="ac-metric-icon">
                      <ListChecks size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {apiTestReport.summary.totalRuns}
                    <span className="ac-metric-unit">次</span>
                  </div>
                  <div className="ac-metric-foot">用例执行 {caseStats.runTotal} 例次</div>
                </div>
                <div className="ac-metric ac-metric--warn">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">通过率</span>
                    <span className="ac-metric-icon">
                      <Gauge size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {apiTestReport.summary.passRatePct}
                    <span className="ac-metric-unit">%</span>
                  </div>
                  <div className="ac-metric-foot">
                    <span className={`ac-metric-delta ${apiTestReport.compareWithPrevSprint.passRateDelta >= 0 ? 'ac-metric-delta--up' : 'ac-metric-delta--down'}`}>
                      {apiTestReport.compareWithPrevSprint.passRateDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {Math.abs(apiTestReport.compareWithPrevSprint.passRateDelta)} pt
                    </span>
                    环比 SP-23
                  </div>
                </div>
                <div className="ac-metric ac-metric--info">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">平均耗时</span>
                    <span className="ac-metric-icon">
                      <Timer size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value ac-at-metric-sm">{fmtMs(apiTestReport.summary.avgDurationMs)}</div>
                  <div className="ac-metric-foot">
                    <span className={`ac-metric-delta ${apiTestReport.compareWithPrevSprint.durationDelta <= 0 ? 'ac-metric-delta--up' : 'ac-metric-delta--down'}`}>
                      {apiTestReport.compareWithPrevSprint.durationDelta <= 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                      {Math.abs(apiTestReport.compareWithPrevSprint.durationDelta)}%
                    </span>
                    耗时下降为改善
                  </div>
                </div>
                <div className="ac-metric ac-metric--danger">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">P95 耗时</span>
                    <span className="ac-metric-icon">
                      <Clock size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value ac-at-metric-sm">{fmtMs(apiTestReport.summary.p95DurationMs)}</div>
                  <div className="ac-metric-foot">最近秩法 ⌈0.95 × 8⌉ = 第 8 位（AR-07）</div>
                </div>
                <div className="ac-metric ac-metric--warn">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">flaky 率</span>
                    <span className="ac-metric-icon">
                      <AlertTriangle size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {apiTestReport.summary.flakyRate}
                    <span className="ac-metric-unit">%</span>
                  </div>
                  <div className="ac-metric-foot">Σ flakyCount 2 ÷ 27 例次</div>
                </div>
                <div className="ac-metric ac-metric--info">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">契约覆盖率</span>
                    <span className="ac-metric-icon">
                      <Layers size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {apiTestReport.summary.coveragePct}
                    <span className="ac-metric-unit">%</span>
                  </div>
                  <div className="ac-metric-foot">
                    <span className={`ac-metric-delta ${apiTestReport.compareWithPrevSprint.coverageDelta >= 0 ? 'ac-metric-delta--up' : 'ac-metric-delta--down'}`}>
                      {apiTestReport.compareWithPrevSprint.coverageDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {Math.abs(apiTestReport.compareWithPrevSprint.coverageDelta)} pt
                    </span>
                    10 / 14 份契约
                  </div>
                </div>
                <div className="ac-metric ac-metric--danger">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">新发现缺陷</span>
                    <span className="ac-metric-icon">
                      <XCircle size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {apiTestReport.summary.newBugsFound}
                    <span className="ac-metric-unit">个</span>
                  </div>
                  <div className="ac-metric-foot">含 2 个合规高危</div>
                </div>
                <div className="ac-metric ac-metric--ai">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">缺陷检出率</span>
                    <span className="ac-metric-icon">
                      <Target size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {apiTestReport.summary.bugDetectRatePct}
                    <span className="ac-metric-unit">%</span>
                  </div>
                  <div className="ac-metric-foot">7 ÷ SP-24 缺陷总数 12</div>
                </div>
              </div>

              <div className="ac-hint">
                <Gauge size={14} />
                <span>
                  <strong>报告口径自洽说明：</strong>
                  通过率 = Σ passed ÷ Σ totalCases = 19 ÷ 27 = 70.4%（逐次通过率见执行记录表，可逐行核算）；
                  平均耗时 = Σ durationMs ÷ totalRuns = 4,314,000 ÷ 8 = 539,250ms；
                  P95 耗时按最近秩法取 ⌈0.95 × n⌉ = ⌈7.6⌉ = 第 8 位，即 AR-07 的 918,000ms；
                  flaky 率 = Σ flakyCount ÷ Σ totalCases = 2 ÷ 27 = 7.4%；
                  契约覆盖率 = 已建例契约 10 ÷ 契约总数 14 = 71.4%；
                  缺陷检出率 = 接口自动化新开缺陷 7 ÷ SP-24 缺陷总数 12 = 58.3%；
                  环比中通过率与覆盖率为百分点差（pt），耗时为百分比变化（%），耗时下降记为改善。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-grid-3-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Boxes size={16} />
                  模块维度统计
                </span>
                <span className="ac-card-subtitle">7 个测试模块的用例数 / 缺陷数（柱）与通过率（虚线）</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">用例合计 {apiTestReport.byModule.reduce((s, m) => s + m.caseCount, 0)}</span>
                </div>
              </div>
              <div className="ac-card-body">
                <ModuleGroupedBars rows={apiTestReport.byModule} />
              </div>
              <div className="ac-card-body ac-card-body--flush">
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm">
                    <thead>
                      <tr>
                        <th>模块</th>
                        <th className="ac-td-right">用例数</th>
                        <th className="ac-td-right">通过率</th>
                        <th className="ac-td-right">平均耗时</th>
                        <th className="ac-td-right">缺陷数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiTestReport.byModule.map((m) => (
                        <tr key={m.moduleId}>
                          <td>
                            <span className="ac-at-cell-main">{m.moduleName}</span>
                            <span className="ac-xs ac-muted ac-mono ac-at-cell-sub">{m.moduleId}</span>
                          </td>
                          <td className="ac-td-num">{m.caseCount}</td>
                          <td className="ac-td-num">
                            <span className={m.passRatePct >= 90 ? 'ac-ok-text' : m.passRatePct >= 50 ? 'ac-warn-text' : m.caseCount === 0 ? 'ac-muted' : 'ac-danger-text'}>
                              {m.caseCount > 0 ? pct1(m.passRatePct) : '无用例'}
                            </span>
                          </td>
                          <td className="ac-td-num">{m.avgDurationMs > 0 ? `${num(m.avgDurationMs)} ms` : '—'}</td>
                          <td className="ac-td-num">
                            {m.bugCount > 0 ? <span className="ac-danger-text ac-semi">{m.bugCount}</span> : <span className="ac-muted">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ac-card-foot">
                <div className="ac-hint ac-hint--warn">
                  <AlertTriangle size={14} />
                  <span>
                    tm-consist「一致性与可靠投递」接口自动化用例数为 0：该模块的 46 条功能用例依赖消息投递与死信回放，
                    需改用 mq.count 断言形态，已列入 aiRecommendedActions 的 P1 动作。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Target size={16} />
                  用例类型分布
                </span>
                <span className="ac-card-subtitle">7 种类型的构成与通过率</span>
              </div>
              <div className="ac-card-body">
                <DonutChart
                  size={186}
                  thickness={26}
                  centerValue={`${apiTestReport.byType.reduce((s, t) => s + t.caseCount, 0)}`}
                  centerLabel="用例总数"
                  ariaLabel="7 种接口用例类型的数量分布环形图"
                  items={apiTestReport.byType.map((t) => ({ label: t.caseType, value: t.caseCount, tone: t.tone }))}
                />
                <div className="ac-at-type-rates">
                  {apiTestReport.byType.map((t) => (
                    <div className="ac-at-type-rate" key={t.caseType}>
                      <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[t.tone]}`}>{t.caseType}</span>
                      <div className="ac-progress ac-progress--sm">
                        <div
                          className={`ac-progress-bar ${
                            t.passRatePct >= 90 ? 'ac-progress-bar--ok' : t.passRatePct >= 50 ? 'ac-progress-bar--warn' : 'ac-progress-bar--danger'
                          }`}
                          style={{ width: `${Math.max(t.passRatePct, 2)}%` }}
                        />
                      </div>
                      <span className="ac-progress-label">{pct1(t.passRatePct)}</span>
                      <span className="ac-xs ac-muted">缺陷 {t.bugCount}</span>
                    </div>
                  ))}
                </div>
                <div className="ac-hint ac-hint--danger ac-at-mt">
                  <XCircle size={14} />
                  <span>并发类（2 条）与边界类（2 条）通过率为 0%，是 7 种类型中唯一双双归零的两类，分别对应 BUG-1045 / 1046 与 BUG-1043 / 1048。</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <AlertTriangle size={16} />
                高频失败项与 AI 建议
              </span>
              <span className="ac-card-subtitle">8 次归档执行中的失败用例根因与改进方案</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--danger">{apiTestReport.topFailures.length} 项</span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-at-fail-list">
                {apiTestReport.topFailures.map((f) => {
                  const decision = failureDecision[f.caseId];
                  const bug = FAIL_DETAIL[f.caseId]?.bugId;
                  return (
                    <div className="ac-at-fail" key={f.caseId}>
                      <div className="ac-at-fail-head">
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[f.tone]}`}>{f.caseId}</span>
                        <span className="ac-at-cell-main">{f.caseName}</span>
                        <span className="ac-tag ac-tag--sm ac-tag--neutral">失败 {f.failCount} 次</span>
                        {bug ? (
                          <button type="button" className="ac-tag ac-tag--sm ac-tag--danger ac-at-link" onClick={() => jump('bug')}>
                            {bug} · {BUG_MAP[bug]?.title ?? ''}
                          </button>
                        ) : null}
                      </div>
                      <div className="ac-at-fail-cause">
                        <strong>根因：</strong>
                        {f.rootCause}
                      </div>
                      <div className="ac-ai-block">
                        <div className="ac-ai-block-title">
                          <Sparkles size={13} />
                          ag-test · AI 建议
                        </div>
                        <div>{f.aiSuggestion}</div>
                      </div>
                      <div className="ac-at-ai-actions">
                        <button
                          type="button"
                          className={`ac-btn ac-btn--sm ${decision === 'bug' ? 'ac-btn--danger' : 'ac-btn--ghost'}`}
                          onClick={() => setFailureDecision((p) => ({ ...p, [f.caseId]: 'bug' }))}
                        >
                          <XCircle size={12} />
                          {decision === 'bug' ? `已转为缺陷${bug ? ` ${bug}` : ''}` : '转为缺陷'}
                        </button>
                        <button
                          type="button"
                          className={`ac-btn ac-btn--sm ${decision === 'rerun' ? 'ac-btn--primary' : 'ac-btn--ghost'}`}
                          onClick={() => setFailureDecision((p) => ({ ...p, [f.caseId]: 'rerun' }))}
                        >
                          <RefreshCw size={12} />
                          {decision === 'rerun' ? '已排入重跑队列' : '重新执行'}
                        </button>
                        <button
                          type="button"
                          className="ac-btn ac-btn--text ac-btn--sm"
                          onClick={() => {
                            const c = allCases.find((x) => x.id === f.caseId);
                            if (c) setCaseDrawer(c);
                          }}
                        >
                          查看用例
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <BrainCircuit size={16} />
                AI 洞察
              </span>
              <span className="ac-card-subtitle">由 {reportAgent?.name ?? 'ag-test'}（{reportModel?.name ?? ''}）基于 8 次执行与 16 条用例生成</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">{apiTestReport.aiInsights.length} 条</span>
                <span className="ac-tag ac-tag--outline">
                  <Coins size={11} />
                  Token 成本 ${apiTestReport.tokenCost.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-at-insight-list">
                {apiTestReport.aiInsights.map((text, i) => (
                  <div className="ac-ai-block" key={i}>
                    <div className="ac-ai-block-title">
                      <Sparkles size={13} />
                      洞察 {i + 1}
                    </div>
                    <div>{text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                AI 改进建议动作
              </span>
              <span className="ac-card-subtitle">动作 / 优先级 / 负责角色 / 预期收益，可逐条采纳或驳回</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  已采纳 {Object.values(actionDecision).filter((v) => v === 'accepted').length} / {apiTestReport.aiRecommendedActions.length}
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th className="ac-td-right">#</th>
                      <th>建议动作</th>
                      <th>优先级</th>
                      <th>负责角色</th>
                      <th>预期收益</th>
                      <th className="ac-td-right">人工介入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiTestReport.aiRecommendedActions.map((a, i) => {
                      const decision = actionDecision[i];
                      const role = ROLE_MAP[a.ownerRoleId];
                      return (
                        <tr key={a.action}>
                          <td className="ac-td-num">{i + 1}</td>
                          <td className="ac-at-action-cell">{a.action}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${a.priority === 'P0' ? 'danger' : a.priority === 'P1' ? 'warn' : 'neutral'}`}>
                              {a.priority}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${role ? TAG_TONE[role.tagTone] : 'neutral'}`}>{role?.name ?? a.ownerRoleId}</span>
                          </td>
                          <td className="ac-xs ac-text-2 ac-at-gain-cell">{a.expectedGain}</td>
                          <td className="ac-td-right ac-nowrap">
                            <button
                              type="button"
                              className={`ac-btn ac-btn--sm ${decision === 'accepted' ? 'ac-btn--primary' : 'ac-btn--ghost'}`}
                              onClick={() => setActionDecision((p) => ({ ...p, [i]: 'accepted' }))}
                            >
                              <CheckCircle2 size={12} />
                              {decision === 'accepted' ? '已采纳' : '采纳'}
                            </button>
                            <button
                              type="button"
                              className={`ac-btn ac-btn--sm ${decision === 'rejected' ? 'ac-btn--danger-ghost' : 'ac-btn--text'}`}
                              onClick={() => setActionDecision((p) => ({ ...p, [i]: 'rejected' }))}
                            >
                              {decision === 'rejected' ? '已驳回' : '驳回'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ac-grid-2-1" data-annotation-id="ai-sdlc-api-test-report-gate">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <ShieldCheck size={16} />
                  门禁影响 · {apiTestReport.gateImpact.gateId}
                </span>
                <span className="ac-card-subtitle">{GATE_MAP[apiTestReport.gateImpact.gateId]?.name ?? ''} · {GATE_MAP[apiTestReport.gateImpact.gateId]?.desc ?? ''}</span>
                <div className="ac-card-extra">
                  <span className={`ac-tag ac-tag--${gatePass ? 'ok' : 'danger'}`}>
                    {gatePass ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {gatePass ? '判定通过' : '判定未通过'}
                  </span>
                  <span className={`ac-tag ac-tag--${GATE_MAP[apiTestReport.gateImpact.gateId]?.blocking ? 'danger' : 'neutral'}`}>
                    {GATE_MAP[apiTestReport.gateImpact.gateId]?.blocking ? '阻断发布' : '不阻断'}
                  </span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-at-sub-title">
                  <AlertTriangle size={13} />
                  未满足判据（{apiTestReport.gateImpact.unmetCriteria.length}）
                </div>
                <div className="ac-at-unmet">
                  {apiTestReport.gateImpact.unmetCriteria.map((c, i) => (
                    <div className="ac-hint ac-hint--danger" key={i}>
                      <XCircle size={14} />
                      <span>
                        <strong>判据 {i + 1}：</strong>
                        {c}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="ac-at-sub-title ac-at-mt">
                  <CheckCircle2 size={13} />
                  门禁原始判据与实测对照
                </div>
                <dl className="ac-kv ac-at-kv-tight">
                  {(GATE_MAP[apiTestReport.gateImpact.gateId]?.criteria ?? []).map((c, i) => (
                    <Fragment key={c}>
                      <dt>判据 {i + 1}</dt>
                      <dd>
                        {c}
                        <div className="ac-xs ac-text-2">
                          实测：{GATE_MAP[apiTestReport.gateImpact.gateId]?.actual[i] ?? '—'}
                        </div>
                      </dd>
                    </Fragment>
                  ))}
                  <dt>门禁责任人</dt>
                  <dd>
                    {ROLE_MAP[GATE_MAP[apiTestReport.gateImpact.gateId]?.ownerRoleId ?? '']?.name ?? '—'} · 校验 Agent{' '}
                    {agentName(GATE_MAP[apiTestReport.gateImpact.gateId]?.agentId ?? null)}
                  </dd>
                  <dt>例外审批人</dt>
                  <dd>{ownerName(GATE_MAP[apiTestReport.gateImpact.gateId]?.approverId ?? '')}</dd>
                  <dt>最近校验</dt>
                  <dd className="ac-mono">{GATE_MAP[apiTestReport.gateImpact.gateId]?.lastCheckedAt ?? '—'}</dd>
                </dl>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Activity size={16} />
                  环比 SP-23
                </span>
                <span className="ac-card-subtitle">通过率 / 覆盖率（pt）与耗时（%）</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-at-compare">
                  {[
                    {
                      label: '通过率',
                      delta: apiTestReport.compareWithPrevSprint.passRateDelta,
                      unit: 'pt',
                      goodWhenUp: true,
                      current: `${apiTestReport.summary.passRatePct}%`,
                    },
                    {
                      label: '平均耗时',
                      delta: apiTestReport.compareWithPrevSprint.durationDelta,
                      unit: '%',
                      goodWhenUp: false,
                      current: fmtMs(apiTestReport.summary.avgDurationMs),
                    },
                    {
                      label: '契约覆盖率',
                      delta: apiTestReport.compareWithPrevSprint.coverageDelta,
                      unit: 'pt',
                      goodWhenUp: true,
                      current: `${apiTestReport.summary.coveragePct}%`,
                    },
                  ].map((row) => {
                    const good = row.goodWhenUp ? row.delta >= 0 : row.delta <= 0;
                    return (
                      <div className="ac-at-compare-row" key={row.label}>
                        <span className="ac-at-compare-label">{row.label}</span>
                        <span className="ac-at-compare-current">{row.current}</span>
                        <span className={`ac-at-compare-delta ${good ? 'ac-at-compare-delta--good' : 'ac-at-compare-delta--bad'}`}>
                          {row.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {Math.abs(row.delta)}
                          {row.unit}
                        </span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${good ? 'ok' : 'danger'}`}>
                          {good ? '改善' : '劣化'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="ac-hint ac-at-mt">
                  <Gauge size={14} />
                  <span>
                    方向语义：通过率与覆盖率上升为改善；平均耗时<strong>下降</strong>为改善（本迭代 -12.4% 即耗时缩短，记为绿色）。
                  </span>
                </div>
                <dl className="ac-kv ac-at-kv-tight ac-at-mt">
                  <dt>报告编号</dt>
                  <dd className="ac-mono">{apiTestReport.id}</dd>
                  <dt>归属迭代</dt>
                  <dd>
                    {sprint?.name ?? apiTestReport.sprintId}（{sprint?.startDate ?? ''} ~ {sprint?.endDate ?? ''}）
                  </dd>
                  <dt>生成时间</dt>
                  <dd className="ac-mono">{apiTestReport.generatedAt}</dd>
                  <dt>生成 Agent</dt>
                  <dd>{reportAgent?.name ?? apiTestReport.generatedBy}</dd>
                  <dt>模型</dt>
                  <dd>{reportModel?.name ?? apiTestReport.modelId}</dd>
                  <dt>Token 成本</dt>
                  <dd className="ac-tnum">${apiTestReport.tokenCost.toFixed(2)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 6. hifox 能力与 CI 集成 ================= */}
      {tab === 'capability' && hifox && (
        <>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Cpu size={16} />
                hifox 集成信息
              </span>
              <span className="ac-card-subtitle">{hifox.vendor}</span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${hifox.status === 'connected' ? 'ok' : 'warn'}`}>
                  <span className={hifox.status === 'connected' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                  {hifox.status === 'connected' ? '已连接' : hifox.status === 'paused' ? '已暂停' : '未接入'}
                </span>
                <a className="ac-btn ac-btn--ghost ac-btn--sm" href={hifox.docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={12} />
                  接口文档
                </a>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-at-provider-grid">
                <dl className="ac-kv ac-at-kv">
                  <dt>提供方 id</dt>
                  <dd className="ac-mono">{hifox.id}</dd>
                  <dt>对标产品</dt>
                  <dd>{hifox.name}</dd>
                  <dt>厂商定位</dt>
                  <dd className="ac-xs">{hifox.vendor}</dd>
                  <dt>对接版本</dt>
                  <dd className="ac-mono">{hifox.version}</dd>
                  <dt>服务入口</dt>
                  <dd className="ac-mono ac-xs">{hifox.endpoint}</dd>
                  <dt>协议</dt>
                  <dd>{hifox.protocol}</dd>
                  <dt>鉴权方式</dt>
                  <dd>{hifox.authMode}</dd>
                  <dt>接入时间</dt>
                  <dd className="ac-mono">{hifox.connectedAt}</dd>
                </dl>
                <dl className="ac-kv ac-at-kv">
                  <dt>SLA 可用率</dt>
                  <dd className="ac-tnum">{hifox.slaUptimePct}%</dd>
                  <dt>平均时延</dt>
                  <dd className="ac-tnum">{hifox.avgLatencyMs} ms</dd>
                  <dt>日调用量</dt>
                  <dd className="ac-tnum">{num(hifox.dailyCallCount)} 次</dd>
                  <dt>挂载环节</dt>
                  <dd>
                    <span className="ac-at-tag-col">
                      {hifox.sdStageIds.map((id) => (
                        <span key={id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[SDLC_STAGES.find((s) => s.id === id)?.tone ?? 'neutral']}`}>
                          {SDLC_STAGES.find((s) => s.id === id)?.name ?? id}
                        </span>
                      ))}
                    </span>
                  </dd>
                  <dt>调用 Agent</dt>
                  <dd>
                    <span className="ac-at-tag-col">
                      {hifox.agentIds.map((id) => (
                        <span key={id} className="ac-tag ac-tag--sm ac-tag--ai">
                          <BrainCircuit size={11} />
                          {agentName(id)}
                        </span>
                      ))}
                    </span>
                  </dd>
                  <dt>能力项</dt>
                  <dd className="ac-xs">{hifox.capabilities.length} 项（详见下方能力清单）</dd>
                </dl>
              </div>
              <div className="ac-hint ac-hint--ai ac-at-mt">
                <Sparkles size={14} />
                <span>{hifox.note}</span>
              </div>
              <div className="ac-at-sub-title ac-at-mt">
                <Zap size={13} />
                hifox 声明能力项
              </div>
              <div className="ac-at-tag-col">
                {hifox.capabilities.map((c) => (
                  <span key={c} className="ac-tag ac-tag--sm ac-tag--outline">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="ac-section-title">能力清单（HFX-01 ~ HFX-06）</div>
          <div className="ac-grid-3 ac-at-cap-grid">
            {hifoxCaps.map((cap) => {
              const ag = agents.find((a) => a.id === cap.aiAgentId);
              return (
                <div className="ac-at-cap" key={cap.id}>
                  <div className="ac-at-cap-head">
                    <span className={`ac-avatar ac-avatar--square ${AVATAR_TONE[cap.tone]}`}>
                      <Wrench size={15} />
                    </span>
                    <div className="ac-flex-1">
                      <div className="ac-at-cap-name">{cap.name}</div>
                      <div className="ac-row ac-gap-1 ac-mt-1">
                        <span className="ac-tag ac-tag--sm ac-mono">{cap.id}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${AUTOMATION_META[cap.automationLevel].tone}`}>
                          {AUTOMATION_META[cap.automationLevel].label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ac-at-cap-desc">{cap.desc}</div>
                  <div className="ac-at-cap-block">
                    <div className="ac-at-cap-label">
                      <Layers size={11} />
                      输入产物
                    </div>
                    <div className="ac-at-tag-col">
                      {cap.inputArtifacts.map((a) => (
                        <span key={a} className="ac-tag ac-tag--sm ac-tag--outline">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ac-at-cap-block">
                    <div className="ac-at-cap-label">
                      <ArrowRight size={11} />
                      输出产物
                    </div>
                    <div className="ac-at-tag-col">
                      {cap.outputArtifacts.map((a) => (
                        <span key={a} className="ac-tag ac-tag--sm ac-tag--ai">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ac-at-cap-foot">
                    <span className="ac-row ac-gap-1 ac-semi ac-text-1">
                      <BrainCircuit size={12} className="ac-muted" />
                      {ag?.name ?? cap.aiAgentId}
                    </span>
                    <span className={`ac-xs ${TEXT_TONE[cap.tone]}`}>均耗时 {cap.avgDurationSec}s</span>
                    <span className="ac-xs ac-muted">采纳率 {cap.adoptionRatePct}%</span>
                  </div>
                  <div className="ac-at-cap-eq">
                    <Settings2 size={11} />
                    平台落地：{cap.platformEquivalent}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <GitBranch size={16} />
                CI/CD 集成拓扑
              </span>
              <span className="ac-card-subtitle">GitLab 提交 → Jenkins 流水线 → 接口自动化触发 → 门禁判定 → 缺陷回写 → 报告归档</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">节点引用真实 provider-* 与 GATE_MAP</span>
              </div>
            </div>
            <div className="ac-card-body">
              <CiTopologyGraph />
              <div className="ac-at-ci-notes">
                <div className="ac-at-ci-note">
                  <span className="ac-tag ac-tag--sm ac-tag--info">GitLab</span>
                  平台自有集成（非 AI_TOOL_PROVIDERS 登记的三方 AI 能力），trade-order 主干 push 与 MR 合入产生 commitSha，
                  对应 AR-01~AR-08 的 a3f81c2 / c7d20e9 / d41a908 等真实短 sha。
                </div>
                <div className="ac-at-ci-note">
                  <span className="ac-tag ac-tag--sm ac-tag--brand">Jenkins</span>
                  执行器部署在 Jenkins 侧，阶段 api-test 完成后调用 hifox OpenAPI v3 触发场景；
                  AR-01 / AR-04 / AR-08 分别关联 PIPE-2401 / PIPE-2407 / PIPE-2409。
                </div>
                <div className="ac-at-ci-note">
                  <span className="ac-tag ac-tag--sm ac-tag--warn">门禁</span>
                  G3 看增量与聚合覆盖率、G4 看用例执行率与 P95、G5 看发布前置、G6 看合规审计；
                  任一未通过即阻断 REL-2403 审批并推送门禁责任人。
                </div>
                <div className="ac-at-ci-note">
                  <span className="ac-tag ac-tag--sm ac-tag--danger">PingCode</span>
                  失败用例自动开单为 BUG-1045 / 1046 / 1047 / 1048 / 1052 / 1054 / 1055，回填关联契约、用例与流水线；同根因重复开单会合并。
                </div>
                <div className="ac-at-ci-note">
                  <span className="ac-tag ac-tag--sm ac-tag--brand">WeKnora</span>
                  报告 AR-RPT-24 与 topFailures 根因分析归档至 KS-04「质量与测试」空间，形成 KD-18 文档，供 ag-test 下轮生成用例时检索复用。
                </div>
              </div>
            </div>
          </div>

          <div className="ac-section-title">相关 AI 自动化编排流</div>
          {ciFlows.map((flow) => (
            <div className="ac-card" key={flow.id}>
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Workflow size={16} />
                  {flow.id} · {flow.name}
                </span>
                <span className="ac-card-subtitle">
                  触发事件 <code className="ac-at-code">{flow.triggerEvent}</code> · {TRIGGER_META[flow.triggerType].label}
                </span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--ai">自动化率 {flow.autoRatePct}%</span>
                  <span className="ac-tag ac-tag--outline">端到端 {flow.avgEndToEndMin} 分钟</span>
                  <span
                    className={`ac-tag ac-tag--${
                      flow.lastRunStatus === 'success' ? 'ok' : flow.lastRunStatus === 'partial' ? 'warn' : 'danger'
                    }`}
                  >
                    最近 {flow.lastRunAt} ·{' '}
                    {flow.lastRunStatus === 'success' ? '成功' : flow.lastRunStatus === 'partial' ? '部分成功' : '失败'}
                  </span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-flow">
                  {flow.steps.map((s, i) => {
                    const isHuman = flow.humanCheckpoints.includes(s.name);
                    const nodeMod = s.executor === 'human' ? 'gate' : s.executor === 'ai+human' ? 'running' : 'ok';
                    return (
                      <div key={`${flow.id}-${s.order}`} className="ac-row ac-gap-0">
                        {i > 0 ? (
                          <div className={`ac-flow-arrow ${i > 0 && flow.steps[i - 1].executor !== 'human' ? 'ac-flow-arrow--ok' : ''}`}>
                            <ChevronRight size={15} />
                          </div>
                        ) : null}
                        <div className={`ac-flow-node ac-at-flow-node ac-flow-node--${nodeMod}`}>
                          <div className="ac-flow-node-head">
                            <span className="ac-flow-node-idx">{s.order}</span>
                            <span className="ac-flow-node-title">{s.name}</span>
                            <span className="ac-flow-node-icon">
                              {s.executor === 'human' ? (
                                <ShieldCheck size={13} />
                              ) : s.executor === 'ai+human' ? (
                                <BrainCircuit size={13} />
                              ) : (
                                <Sparkles size={13} />
                              )}
                            </span>
                          </div>
                          <span className="ac-at-tag-col">
                            <span className={`ac-tag ac-tag--sm ac-tag--${s.executor === 'human' ? 'warn' : s.executor === 'ai+human' ? 'ai' : 'ok'}`}>
                              {s.executor === 'human' ? '人工' : s.executor === 'ai+human' ? '人机协同' : 'AI 自动'}
                            </span>
                            {s.agentId ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ai">{agentName(s.agentId)}</span>
                            ) : null}
                            {s.toolProviderId ? (
                              <span className="ac-tag ac-tag--sm ac-tag--outline">
                                {AI_TOOL_PROVIDERS.find((p) => p.id === s.toolProviderId)?.name ?? s.toolProviderId}
                              </span>
                            ) : (
                              <span className="ac-tag ac-tag--sm ac-tag--neutral">平台自有集成</span>
                            )}
                          </span>
                          <span className="ac-flow-node-meta">
                            输入 {s.inputFrom}
                            <br />
                            输出 {s.outputTo}
                          </span>
                          <span className="ac-flow-node-meta ac-at-flow-fallback">
                            <AlertTriangle size={11} />
                            降级：{s.fallbackAction}
                          </span>
                          <span className="ac-flow-node-meta ac-mono">
                            <Timer size={11} /> {s.durationSec}s
                            {isHuman ? ' · 人工检查点' : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="ac-hint ac-hint--warn ac-at-mt">
                  <ShieldCheck size={14} />
                  <span>
                    人工检查点：{flow.humanCheckpoints.join('、') || '无'}。该检查点为强制人工确认节点，
                    AI 产物在此转为草稿态；驳回理由会回灌对应 Agent 作为负样本，连续 3 次失败后停止自动重跑并转门禁例外审批。
                  </span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ================= 抽屉与弹窗 ================= */}
      <Drawer
        open={caseDrawer !== null}
        title={caseDrawer ? `${caseDrawer.id} · ${caseDrawer.name}` : ''}
        subtitle={
          caseDrawer
            ? `${caseDrawer.method} ${caseDrawer.path} · ${API_CONTRACT_MAP[caseDrawer.apiContractId]?.name ?? ''}（${
                API_CONTRACT_MAP[caseDrawer.apiContractId]?.statusLabel ?? ''
              }）`
            : undefined
        }
        width={720}
        onClose={() => setCaseDrawer(null)}
        footer={
          caseDrawer ? (
            <>
              <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={() => addBoundaryCase(caseDrawer)}>
                <Sparkles size={12} />
                AI 补充边界用例
              </button>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('test')}>
                <ArrowRight size={12} />
                查看交叉功能用例
              </button>
              <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => setCaseDrawer(null)}>
                关闭
              </button>
            </>
          ) : undefined
        }
      >
        {caseDrawer ? <CaseDetail c={caseDrawer} allCases={allCases} /> : null}
      </Drawer>

      <Drawer
        open={mockDrawer !== null}
        title={mockDrawer ? `${mockDrawer.id} · ${mockDrawer.name}` : ''}
        subtitle={mockDrawer ? `${mockDrawer.matchMethod} ${mockDrawer.matchPath}` : undefined}
        width={680}
        onClose={() => setMockDrawer(null)}
        footer={
          mockDrawer ? (
            <>
              <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={() => runMockTrial(mockDrawer)}>
                <Play size={12} />
                试运行
              </button>
              <button
                type="button"
                className={`ac-btn ac-btn--sm ${mockOverrides[mockDrawer.id] ?? mockDrawer.enabled ? 'ac-btn--ghost' : 'ac-btn--primary'}`}
                onClick={() => toggleMock(mockDrawer)}
              >
                <Settings2 size={12} />
                {mockOverrides[mockDrawer.id] ?? mockDrawer.enabled ? '停用该规则' : '启用该规则'}
              </button>
              <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => setMockDrawer(null)}>
                关闭
              </button>
            </>
          ) : undefined
        }
      >
        {mockDrawer ? <MockDetail m={allMocks.find((x) => x.id === mockDrawer.id) ?? mockDrawer} trial={mockTrial} /> : null}
      </Drawer>

      <Drawer
        open={dsDrawer !== null}
        title={dsDrawer ? `${dsDrawer.id} · ${dsDrawer.name}` : ''}
        subtitle={dsDrawer ? `${DATASET_SOURCE_META[dsDrawer.sourceType].label} · ${num(dsDrawer.rowCount + (dsExtraRows[dsDrawer.id] ?? 0))} 行 · ${dsDrawer.columns.length} 列` : undefined}
        width={720}
        onClose={() => setDsDrawer(null)}
        footer={
          dsDrawer ? (
            <>
              {dsDrawer.sourceType === 'ai-generated' ? (
                <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={() => expandDataSet(dsDrawer)}>
                  <Sparkles size={12} />
                  扩充边界样本（+24 行）
                </button>
              ) : null}
              <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => setDsDrawer(null)}>
                关闭
              </button>
            </>
          ) : undefined
        }
      >
        {dsDrawer ? <DataSetDetail d={dsDrawer} extraRows={dsExtraRows[dsDrawer.id] ?? 0} /> : null}
      </Drawer>

      <Drawer
        open={runDrawer !== null}
        title={runDrawer ? `${runDrawer.id} · 执行明细` : ''}
        subtitle={runDrawer ? `${runDrawer.startedAt} → ${runDrawer.finishedAt} · ${ENV_MAP[runDrawer.envId]?.name ?? runDrawer.envId}` : undefined}
        width={760}
        onClose={() => setRunDrawer(null)}
      >
        {runDrawer ? (
          <RunDetail
            run={runDrawer}
            allCases={allCases}
            allScenarios={allScenarios}
            filedBugs={localBugs.filter((k) => k.startsWith(`${runDrawer.id}:`)).map((k) => k.split(':')[1])}
            onFileBug={(caseId) => fileBugFromRun(runDrawer, caseId)}
            onOpenCase={(c) => {
              setRunDrawer(null);
              setCaseDrawer(c);
            }}
          />
        ) : null}
      </Drawer>

      <Modal
        open={aiScenarioOpen}
        title="AI 生成场景（ag-test 编排演示）"
        subtitle="选择一份接口契约与业务目标，由 ag-test 输出场景步骤草案，人工复核后采纳为草稿场景"
        width={760}
        onClose={() => setAiScenarioOpen(false)}
        footer={
          <>
            <button
              type="button"
              className={`ac-btn ac-btn--sm ${aiScenarioDrafted ? 'ac-btn--primary' : 'ac-btn--ai'}`}
              onClick={adoptAiScenario}
              disabled={aiScenarioDrafted}
            >
              <CheckCircle2 size={12} />
              {aiScenarioDrafted ? '已采纳为草稿场景 AS-06' : '采纳为草稿场景'}
            </button>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setAiScenarioOpen(false)}>
              关闭
            </button>
          </>
        }
      >
        <div className="ac-at-modal-form">
          <div className="ac-field">
            <span className="ac-field-label">接口契约</span>
            <select className="ac-select" defaultValue={AI_SCENARIO_DRAFT.contractId}>
              {API_CONTRACTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.name}（{c.statusLabel}）
                </option>
              ))}
            </select>
          </div>
          <div className="ac-field">
            <span className="ac-field-label">业务目标</span>
            <select className="ac-select" defaultValue={AI_SCENARIO_DRAFT.goal}>
              <option>{AI_SCENARIO_DRAFT.goal}</option>
              <option>幂等重复提交防护：同 Key 24h 窗口内仅落一笔订单</option>
              <option>金额精度回归：分摊之和恒等于应付且无尾差</option>
            </select>
          </div>
        </div>

        <div className="ac-ai-block">
          <div className="ac-ai-block-title">
            <Sparkles size={13} />
            ag-test · 编排推理过程（依据 {AI_SCENARIO_DRAFT.contractId} 契约 + 知识库 KD-15 接口契约切片 + 历史缺陷模式）
          </div>
          <div className="ac-at-reasoning">
            {AI_SCENARIO_DRAFT.reasoning.map((r, i) => (
              <div className="ac-at-reasoning-item" key={r.title}>
                <span className="ac-at-reasoning-idx">{i + 1}</span>
                <div>
                  <div className="ac-at-reasoning-title">{r.title}</div>
                  <div className="ac-at-reasoning-detail">{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ac-at-sub-title ac-at-mt">
          <ListChecks size={13} />
          生成的步骤草案（{AI_SCENARIO_DRAFT.steps.length} 步）
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table ac-table--sm">
            <thead>
              <tr>
                <th className="ac-td-right">#</th>
                <th>类型</th>
                <th>名称</th>
                <th>提取变量</th>
                <th>断言</th>
              </tr>
            </thead>
            <tbody>
              {AI_SCENARIO_DRAFT.steps.map((s) => (
                <tr key={s.order}>
                  <td className="ac-td-num">{s.order}</td>
                  <td>
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STEP_TYPE_META[s.stepType].tone]}`}>
                      {STEP_TYPE_META[s.stepType].label}
                    </span>
                  </td>
                  <td className="ac-xs">{s.name}</td>
                  <td className="ac-xs">
                    {s.extractVars.length > 0 ? (
                      <span className="ac-at-var-col">
                        {s.extractVars.map((v) => (
                          <code className="ac-at-code" key={v.name}>
                            {v.name} ← {v.fromPath}
                          </code>
                        ))}
                      </span>
                    ) : (
                      <span className="ac-muted">—</span>
                    )}
                  </td>
                  <td className="ac-xs">
                    {s.assertions.length > 0 ? (
                      <span className="ac-at-var-col">
                        {s.assertions.map((a, i) => (
                          <span key={i} className="ac-at-assert-compact">
                            <span className={`ac-tag ac-tag--sm ac-tag--${ASSERT_TYPE_META[a.type]?.tone ?? 'neutral'}`}>
                              {ASSERT_TYPE_META[a.type]?.label ?? a.type}
                            </span>
                            <code className="ac-at-code">{a.expr}</code>
                            <span className="ac-muted">= {a.expected}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="ac-muted">无断言</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {aiScenarioDrafted ? (
          <div className="ac-hint ac-hint--ok ac-at-mt">
            <CheckCircle2 size={14} />
            <span>
              已乐观新增草稿场景 AS-06（5 步 / 3 个变量 / 8 条断言），并自动切换到「场景编排」标签的链路图预览；
              该场景 status=draft，未绑定 CI 触发，需人工复核后转 active 才会参与 G4 门禁判定。
            </span>
          </div>
        ) : (
          <div className="ac-hint ac-hint--ai ac-at-mt">
            <Sparkles size={14} />
            <span>
              人工介入点：AI 只产出草稿，不直接生效。采纳后需由测试负责人何斯年确认断言期望值与等待窗口（1500ms 是否覆盖 outbox 中继的实际投递延迟），
              确认后才可绑定 G4 门禁并开启 CI 触发。
            </span>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ 抽屉详情 */

/** 用例详情：请求步骤 + 变量 + 断言明细 + 历史通过率趋势 */
function CaseDetail({ c, allCases }: { c: ApiCaseDef; allCases: ApiCaseDef[] }) {
  const contract = API_CONTRACT_MAP[c.apiContractId];
  const mod = TEST_MODULE_MAP[c.moduleId];
  const relatedSteps = useMemo(
    () => API_SCENARIO_STEPS.filter((s) => s.caseId === c.id).sort((a, b) => a.order - b.order),
    [c.id],
  );
  const scenarios = useMemo(
    () => API_SCENARIOS.filter((s) => s.caseIds.includes(c.id)),
    [c.id],
  );
  const runs = useMemo(() => API_TEST_RUNS.filter((r) => r.caseIds.includes(c.id)), [c.id]);
  const series = passRateSeries(c);

  return (
    <>
      <div className="ac-ai-block ac-mb-4">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          {c.source === 'ai-generated' ? `${agentName(c.generatedBy)} 自动生成` : SOURCE_META[c.source].label} · {c.caseType}类用例
        </div>
        <div className="ac-mt-2">{c.desc}</div>
      </div>

      <dl className="ac-kv ac-at-kv ac-mb-4">
        <dt>用例编号</dt>
        <dd className="ac-mono ac-brand-text">{c.id}</dd>
        <dt>请求</dt>
        <dd>
          <span className={`ac-at-method ac-at-method--${METHOD_META[c.method]?.tone ?? 'neutral'}`}>{c.method}</span>
          <code className="ac-at-code ac-at-ml">{c.path}</code>
        </dd>
        <dt>关联契约</dt>
        <dd>
          {c.apiContractId} · {contract?.name ?? '—'}（{contract?.statusLabel ?? '—'}，{contract?.version ?? ''}）
          <div className="ac-xs ac-text-2">
            P99 承诺 {contract?.p99Ms ?? '—'} ms · TPS {contract?.tps ?? '—'} · 鉴权级别 {contract?.authLevel ?? '—'}
          </div>
        </dd>
        <dt>所属模块</dt>
        <dd>
          {mod?.name ?? c.moduleId}（{mod?.code ?? ''}）· 模块负责人 {ownerName(mod?.ownerId ?? '')}
        </dd>
        <dt>优先级 / 状态</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${c.priority === 'P0' ? 'danger' : c.priority === 'P1' ? 'warn' : 'neutral'}`}>{c.priority}</span>{' '}
          <span className={`ac-tag ac-tag--sm ac-tag--${CASE_STATUS_META[c.status].tone}`}>{CASE_STATUS_META[c.status].label}</span>{' '}
          <span className={`ac-tag ac-tag--sm ac-tag--${RUN_RESULT_META[c.lastRunStatus].tone}`}>
            最近{RUN_RESULT_META[c.lastRunStatus].label}
          </span>
        </dd>
        <dt>耗时</dt>
        <dd className="ac-tnum">
          平均 {c.avgDurationMs} ms · P95 {c.p95DurationMs} ms · 契约 P99 基线 {contract?.p99Ms ?? '—'} ms
        </dd>
        <dt>执行统计</dt>
        <dd className="ac-tnum">
          归档执行 {c.runCount} 次 · 通过率 {c.runCount > 0 ? pct1(c.passRatePct) : '—'} · 断言 {c.assertionCount} 条
        </dd>
        <dt>负责人</dt>
        <dd>
          <span className="ac-user">
            <span className={`ac-avatar ac-avatar--sm ${ownerAvatar(c.owner)}`}>{ownerInitial(c.owner)}</span>
            <span className="ac-user-name">{ownerName(c.owner)}</span>
            <span className="ac-user-meta">{USER_MAP[c.owner]?.title ?? ''}</span>
          </span>
        </dd>
        <dt>所属场景</dt>
        <dd>
          {scenarios.length > 0 ? (
            <span className="ac-at-tag-col">
              {scenarios.map((s) => (
                <span key={s.id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[s.tone]}`} title={s.name}>
                  {s.id}
                </span>
              ))}
            </span>
          ) : (
            <span className="ac-xs ac-muted">未挂入任何场景（单用例执行）</span>
          )}
        </dd>
        <dt>标签</dt>
        <dd>
          <span className="ac-at-tag-col">
            {c.tags.map((t) => (
              <span key={t} className="ac-tag ac-tag--sm ac-tag--outline">
                {t}
              </span>
            ))}
          </span>
        </dd>
      </dl>

      <div className="ac-at-sub-title">
        <Layers size={13} />
        请求步骤（{c.steps.length}）
      </div>
      <div className="ac-at-steps">
        {c.steps.map((s) => (
          <div className="ac-at-step" key={s.order}>
            <span className="ac-at-step-idx">{s.order}</span>
            <div className="ac-at-step-body">
              <div className="ac-at-step-action">{s.action}</div>
              <div className="ac-at-step-expect">
                <CheckCircle2 size={11} />
                预期：{s.expect}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="ac-at-sub-title ac-at-mt">
        <Boxes size={13} />
        变量清单（{c.variables.length}）
      </div>
      <div className="ac-at-tag-col">
        {c.variables.map((v) => (
          <code className="ac-at-code ac-at-var-chip" key={v}>
            {v}
          </code>
        ))}
      </div>

      <div className="ac-at-sub-title ac-at-mt">
        <Target size={13} />
        断言明细（场景步骤中实际执行的 {relatedSteps.reduce((s, x) => s + x.assertions.length, 0)} 条 / 用例声明 {c.assertionCount} 条）
      </div>
      {relatedSteps.length === 0 ? (
        <div className="ac-hint ac-hint--warn">
          <AlertTriangle size={14} />
          <span>
            该用例尚未被任何场景步骤引用，声明的 {c.assertionCount} 条断言仅在单用例执行时生效；
            建议挂入 AS-01 主干冒烟场景以纳入 G3 / G4 门禁判定。
          </span>
        </div>
      ) : (
        <div className="ac-at-assert-list">
          {relatedSteps.map((s) => (
            <div className="ac-at-assert-group" key={s.id}>
              <div className="ac-at-assert-group-head">
                <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STEP_TYPE_META[s.stepType].tone]}`}>
                  {STEP_TYPE_META[s.stepType].label}
                </span>
                <span className="ac-mono ac-xs">{s.id}</span>
                <span className="ac-xs ac-text-2">{s.name}</span>
                <span className="ac-xs ac-muted ac-ml-auto">
                  所属场景 {s.scenarioId} · 第 {s.order} 步
                </span>
              </div>
              {s.assertions.length === 0 ? (
                <div className="ac-xs ac-muted ac-at-assert-empty">该步骤无断言（等待窗口）</div>
              ) : (
                s.assertions.map((a, i) => (
                  <div className="ac-at-assert-row" key={`${s.id}-${i}`}>
                    <span className={`ac-tag ac-tag--sm ac-tag--${ASSERT_TYPE_META[a.type]?.tone ?? 'neutral'}`}>
                      {ASSERT_TYPE_META[a.type]?.label ?? a.type}
                    </span>
                    <code className="ac-at-code ac-at-assert-expr">{a.expr}</code>
                    <span className="ac-at-assert-exp">期望 {a.expected}</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${ON_FAIL_META[a.onFail].tone}`}>失败{ON_FAIL_META[a.onFail].label}</span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ac-at-sub-title ac-at-mt">
        <Activity size={13} />
        历史通过率趋势（近 {c.runCount} 次归档执行）
      </div>
      <div className="ac-at-trend-row">
        <MiniSparkline points={series} tone={c.tone} />
        <div className="ac-xs ac-text-2">
          {runs.length > 0 ? (
            <>
              参与执行：
              {runs.map((r, i) => (
                <Fragment key={r.id}>
                  {i > 0 ? ' · ' : ''}
                  <span className="ac-mono">
                    {r.id}（{r.passed}/{r.totalCases}）
                  </span>
                </Fragment>
              ))}
            </>
          ) : (
            '尚未参与任何归档执行'
          )}
        </div>
      </div>

      <div className="ac-at-sub-title ac-at-mt">
        <Sparkles size={13} />
        AI 可执行动作
      </div>
      <div className="ac-hint ac-hint--ai">
        <Sparkles size={14} />
        <span>
          <strong>AI 做了什么：</strong>
          {c.source === 'ai-generated'
            ? `ag-test 从 ${c.apiContractId} 契约的 Schema、错误码表（${(contract?.errorCodes ?? []).map((e) => e.code).join(' / ') || '无'}）与 REQ 验收标准推导出 ${c.steps.length} 个步骤与 ${c.assertionCount} 条断言。`
            : `本用例为${SOURCE_META[c.source].label}，ag-test 仅在其基础上做断言补全建议，不改写原始步骤。`}
          <br />
          <strong>依据是什么：</strong>知识库 KD-15（14 份接口契约集）与 KD-18（TR-24 测试报告）的切片，以及缺陷模式库中的历史根因。
          <br />
          <strong>人工如何介入：</strong>点击底部「AI 补充边界用例」会生成一条 draft 态负例（乐观新增到本页列表，不回写数据层），
          需 {ownerName(c.owner)} 复核断言期望值后转 active；驳回则不产生任何变更。
          同批用例中的 {allCases.filter((x) => x.status === 'draft').length} 条草稿均处于该待复核状态。
        </span>
      </div>
    </>
  );
}

/** Mock 规则详情：响应模板着色 + AI 动态提示词 + 试运行结果 */
function MockDetail({ m, trial }: { m: MockRuleDef; trial: { at: string; latencyMs: number; body: string } | null }) {
  const rt = RESPONSE_TYPE_META[m.responseType];
  const relatedCases = API_CASES.filter((c) => c.tags.some((t) => t.includes(m.id)));
  const relatedSteps = API_SCENARIO_STEPS.filter(
    (s) => s.name.includes(m.id) || s.assertions.some((a) => a.expr.includes(m.id) || a.expected.includes(m.id)),
  );

  return (
    <>
      <dl className="ac-kv ac-at-kv ac-mb-4">
        <dt>规则编号</dt>
        <dd className="ac-mono ac-brand-text">{m.id}</dd>
        <dt>匹配请求</dt>
        <dd>
          <span className={`ac-at-method ac-at-method--${METHOD_META[m.matchMethod]?.tone ?? 'neutral'}`}>{m.matchMethod}</span>
          <code className="ac-at-code ac-at-ml">{m.matchPath}</code>
        </dd>
        <dt>匹配条件</dt>
        <dd>{m.matchCondition ? <code className="ac-at-code">{m.matchCondition}</code> : <span className="ac-xs ac-muted">无条件（全匹配）</span>}</dd>
        <dt>响应类型</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${rt.tone}`}>
            {m.responseType === 'dynamic-ai' ? <Sparkles size={11} /> : null}
            {rt.label}
          </span>
        </dd>
        <dt>延迟 / 错误码</dt>
        <dd className="ac-tnum">
          {m.delayMs !== null ? `${m.delayMs} ms` : '无延迟'} · {m.errorStatus !== null ? `HTTP ${m.errorStatus}` : '不注入错误'}
        </dd>
        <dt>生效环境</dt>
        <dd>
          <span className="ac-at-tag-col">
            {m.envIds.map((e) => (
              <span key={e} className="ac-tag ac-tag--sm ac-tag--outline">
                {ENV_MAP[e]?.name ?? e}（{ENV_MAP[e]?.code ?? e}）
              </span>
            ))}
          </span>
        </dd>
        <dt>近 30 日命中</dt>
        <dd className="ac-tnum">{num(m.hitCount30d)} 次</dd>
        <dt>启用状态</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${m.enabled ? 'ok' : 'neutral'}`}>
            <span className={m.enabled ? 'ac-pulse-dot' : 'ac-tag-dot'} />
            {m.enabled ? '已启用' : '已停用'}
          </span>
        </dd>
        <dt>创建人</dt>
        <dd>
          <span className="ac-user">
            <span className={`ac-avatar ac-avatar--sm ${ownerAvatar(m.createdBy)}`}>{ownerInitial(m.createdBy)}</span>
            <span className="ac-user-name">{ownerName(m.createdBy)}</span>
          </span>
        </dd>
      </dl>

      <div className="ac-at-sub-title">
        <Table2 size={13} />
        响应模板（responseTemplate）
      </div>
      <div className="ac-code ac-code--light ac-at-code-block">
        <div className="ac-code-head">
          <span className="ac-code-title">{m.id}-response.json</span>
          <span className="ac-code-lang">JSON</span>
        </div>
        <div className="ac-code-body">{tokenizeJson(m.responseTemplate)}</div>
      </div>

      {m.responseType === 'dynamic-ai' ? (
        <>
          <div className="ac-at-sub-title ac-at-mt">
            <Sparkles size={13} />
            AI 动态生成提示词（aiDynamicPrompt）
          </div>
          <div className="ac-ai-block">
            <div className="ac-ai-block-title">
              <Sparkles size={13} />
              ag-test · 动态响应生成约束
            </div>
            <div className="ac-mt-2">{m.aiDynamicPrompt}</div>
            <div className="ac-at-ai-note">
              <strong>AI 做了什么：</strong>按 API-09 的响应 Schema 实时生成符合约束的互斥规则集合，填充模板中的{' '}
              <code className="ac-at-code">{'${ai.ruleVersion}'}</code>、<code className="ac-at-code">{'${ai.groups}'}</code>、
              <code className="ac-at-code">{'${ai.strategy}'}</code> 三个占位符。
              <br />
              <strong>人工如何介入：</strong>提示词由 {ownerName(m.createdBy)} 维护，禁止输出真实活动名称与内部运营人员姓名；
              金额一律字符串 BigDecimal，若生成结果违反 Schema 则回退为静态模板并告警。
            </div>
          </div>
        </>
      ) : null}

      <div className="ac-at-sub-title ac-at-mt">
        <Play size={13} />
        试运行
      </div>
      {trial ? (
        <>
          <div className="ac-hint ac-hint--ok">
            <CheckCircle2 size={14} />
            <span>
              本地模拟命中成功：{trial.at}，端到端 {trial.latencyMs} ms
              {m.delayMs !== null ? `（含注入延迟 ${m.delayMs} ms）` : ''}
              {m.errorStatus !== null ? `，返回 HTTP ${m.errorStatus}` : '，返回 HTTP 200'}。
            </span>
          </div>
          <div className="ac-code ac-code--light ac-at-code-block ac-at-mt">
            <div className="ac-code-head">
              <span className="ac-code-title">trial-response.json</span>
              <span className="ac-code-lang">{trial.latencyMs} ms</span>
            </div>
            <div className="ac-code-body">{tokenizeJson(trial.body)}</div>
          </div>
        </>
      ) : (
        <div className="ac-hint">
          <Play size={14} />
          <span>点击底部「试运行」按钮，将在本地按模板与延迟 / 错误码配置模拟一次响应，不触达真实下游服务。</span>
        </div>
      )}

      <div className="ac-at-sub-title ac-at-mt">
        <Link2 size={13} />
        关联用例与场景步骤
      </div>
      <div className="ac-at-tag-col">
        {relatedCases.map((c) => (
          <span key={c.id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[c.tone]}`}>
            {c.id} · {c.name.slice(0, 18)}
          </span>
        ))}
        {relatedSteps.map((s) => (
          <span key={s.id} className="ac-tag ac-tag--sm ac-tag--outline">
            {s.scenarioId} / {s.id}
          </span>
        ))}
        {relatedCases.length === 0 && relatedSteps.length === 0 ? <span className="ac-xs ac-muted">暂无用例直接引用该规则</span> : null}
      </div>
    </>
  );
}

/** 数据集列详情：敏感列标红 + 掩码示例 + 脱敏规则来源 */
function DataSetDetail({ d, extraRows }: { d: DataSetDef; extraRows: number }) {
  const sensitive = d.columns.filter((c) => c.sensitive);
  return (
    <>
      <dl className="ac-kv ac-at-kv ac-mb-4">
        <dt>数据集编号</dt>
        <dd className="ac-mono ac-brand-text">{d.id}</dd>
        <dt>来源类型</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${DATASET_SOURCE_META[d.sourceType].tone}`}>
            {d.sourceType === 'ai-generated' ? <Sparkles size={11} /> : null}
            {DATASET_SOURCE_META[d.sourceType].label}
          </span>
        </dd>
        <dt>行数</dt>
        <dd className="ac-tnum">
          {num(d.rowCount + extraRows)} 行{extraRows > 0 ? <span className="ac-xs ac-ok-text">（含 AI 扩充 {extraRows} 行）</span> : null}
        </dd>
        <dt>使用场景</dt>
        <dd>
          <span className="ac-at-tag-col">
            {d.usedByScenarioIds.map((s) => {
              const sc = API_SCENARIOS.find((x) => x.id === s);
              return (
                <span key={s} className={`ac-tag ac-tag--sm ac-tag--${sc ? TAG_TONE[sc.tone] : 'neutral'}`} title={sc?.name ?? s}>
                  {s}
                </span>
              );
            })}
          </span>
        </dd>
        <dt>最近刷新</dt>
        <dd className="ac-mono">{d.lastRefreshedAt}</dd>
        <dt>生产样本</dt>
        <dd>
          {d.sourceType === 'production-sample' ? (
            <span className={`ac-tag ac-tag--sm ac-tag--${d.productionSampleAnonymized ? 'ok' : 'danger'}`}>
              {d.productionSampleAnonymized ? '已按 SEC-MASK-2.1 匿名化' : '未匿名化（禁止入库）'}
            </span>
          ) : (
            <span className="ac-xs ac-muted">非生产采样，不适用</span>
          )}
        </dd>
        <dt>生成者</dt>
        <dd>{d.generatedBy.startsWith('u-') ? ownerName(d.generatedBy) : agentName(d.generatedBy)}</dd>
      </dl>

      {d.sourceType === 'ai-generated' ? (
        <div className="ac-ai-block ac-mb-4">
          <div className="ac-ai-block-title">
            <Sparkles size={13} />
            ag-test · AI 造数说明
          </div>
          <div className="ac-at-ai-list">
            <p>
              <strong>生成提示：</strong>依据 API-01 契约的请求 Schema 与 REQ-2401 的幂等验收标准，为「幂等与并发一致性」场景生成
              {d.rowCount} 组输入；每组包含客户端 UUID、买家 id、SKU 明细、优惠券列表与并发线程数。
            </p>
            <p>
              <strong>边界覆盖：</strong>等价类 —— 单券 / 多券 / 无券三档；边界值 —— 并发线程数取 1 / 2 / 49 / 50 / 51，
              SKU 数量取 1 与契约上限 50；异常值 —— 过期券、已核销券、跨店铺券、金额为 0.00 与负数的行。
            </p>
            <p>
              <strong>人工介入：</strong>AI 造数不含任何真实用户数据，idempotencyKey 与 buyerId 均为合成值；
              若需引入生产样本，必须改走 production-sample 类型并经 SEC-MASK-2.1 脱敏与匿名化校验后方可入库。
            </p>
          </div>
        </div>
      ) : null}

      <div className="ac-at-sub-title">
        <Table2 size={13} />
        列定义（{d.columns.length} 列，敏感 {sensitive.length} 列）
      </div>
      <div className="ac-table-wrap">
        <table className="ac-table ac-table--sm ac-table--bordered">
          <thead>
            <tr>
              <th>列名</th>
              <th>类型</th>
              <th>示例值（已掩码）</th>
              <th className="ac-td-center">敏感</th>
              <th>脱敏规则</th>
            </tr>
          </thead>
          <tbody>
            {d.columns.map((col) => {
              const rule = col.maskRule ? redactRules.find((r) => r.id === col.maskRule) : null;
              return (
                <tr key={col.name}>
                  <td className="ac-mono ac-xs ac-semi">{col.name}</td>
                  <td className="ac-xs ac-text-2">{col.type}</td>
                  <td className="ac-mono ac-xs ac-at-example">{col.example}</td>
                  <td className="ac-td-center">
                    {col.sensitive ? (
                      <span className="ac-tag ac-tag--sm ac-tag--danger">
                        <ShieldCheck size={11} />
                        敏感
                      </span>
                    ) : (
                      <span className="ac-xs ac-muted">否</span>
                    )}
                  </td>
                  <td className="ac-xs">
                    {rule ? (
                      <>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[rule.tone]}`}>
                          {rule.id} {rule.name}
                        </span>
                        <span className="ac-at-cell-sub ac-text-2">
                          {rule.strategy} · {rule.sampleBefore} → {rule.sampleAfter}
                        </span>
                      </>
                    ) : (
                      <span className="ac-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ac-hint ac-hint--danger ac-at-mt">
        <ShieldCheck size={14} />
        <span>
          脱敏规则统一来自平台 <code className="ac-at-code">redactRules</code>（SEC-MASK-2.1，共 8 条），
          与「安全与审计」页的脱敏策略同源；示例值在界面上以掩码形式呈现（如 138****5678），
          明文仅存在于已完成匿名化校验的源文件中，任何出域调用都会再次经过统一脱敏组件。
        </span>
      </div>
    </>
  );
}

/** 执行记录详情：失败用例明细 + 断言现场 + AI 根因初判 + 一键建缺陷 */
function RunDetail({
  run,
  allCases,
  allScenarios,
  filedBugs,
  onFileBug,
  onOpenCase,
}: {
  run: ApiTestRunDef;
  allCases: ApiCaseDef[];
  allScenarios: ApiScenarioDef[];
  filedBugs: string[];
  onFileBug: (caseId: string) => void;
  onOpenCase: (c: ApiCaseDef) => void;
}) {
  const sc = allScenarios.find((s) => s.id === run.scenarioId);
  const pipe = run.pipelineRunId ? PIPELINE_MAP[run.pipelineRunId] : null;
  const failed = run.caseIds.filter((id) => FAIL_DETAIL[id] !== undefined);
  const rate = run.totalCases > 0 ? (run.passed / run.totalCases) * 100 : 0;

  return (
    <>
      <dl className="ac-kv ac-at-kv ac-mb-4">
        <dt>执行编号</dt>
        <dd className="ac-mono ac-brand-text">{run.id}</dd>
        <dt>执行对象</dt>
        <dd>
          {sc ? `${sc.id} · ${sc.name}` : `单用例执行 · ${run.caseIds.join(' / ')}`}
        </dd>
        <dt>触发</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TRIGGER_META[run.triggerType].tone}`}>{TRIGGER_META[run.triggerType].label}</span>{' '}
          {ownerName(run.triggeredBy)}
        </dd>
        <dt>环境 / 分支</dt>
        <dd>
          {ENV_MAP[run.envId]?.name ?? run.envId}（{ENV_MAP[run.envId]?.code ?? run.envId}）·{' '}
          <span className="ac-mono ac-xs">{run.branch}</span> @ <span className="ac-mono ac-xs">{run.commitSha}</span>
        </dd>
        <dt>流水线</dt>
        <dd>
          {pipe ? (
            <>
              <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-at-link" onClick={() => jump('pipeline')}>
                <GitBranch size={12} />
                {pipe.id}
              </button>
              <span className="ac-xs ac-text-2">
                {pipe.branch} · {pipe.status === 'success' ? '成功' : pipe.status === 'failed' ? '失败' : pipe.status === 'running' ? '执行中' : '已取消'}
                {pipe.failedGateId ? ` · 未通过门禁 ${pipe.failedGateId}` : ''}
              </span>
            </>
          ) : (
            <span className="ac-xs ac-muted">无流水线关联（手动 / 定时执行）</span>
          )}
        </dd>
        <dt>时间窗口</dt>
        <dd className="ac-mono ac-xs">
          {run.startedAt} → {run.finishedAt}（{fmtMs(run.durationMs)}）
        </dd>
        <dt>结果构成</dt>
        <dd className="ac-tnum">
          用例 {run.totalCases} · <span className="ac-ok-text">通过 {run.passed}</span> ·{' '}
          <span className={run.failed > 0 ? 'ac-danger-text' : 'ac-muted'}>失败 {run.failed}</span> ·{' '}
          <span className={run.blocked > 0 ? 'ac-warn-text' : 'ac-muted'}>阻塞 {run.blocked}</span> · 跳过 {run.skipped}
        </dd>
        <dt>通过率核算</dt>
        <dd className="ac-tnum">
          {run.passed} ÷ {run.totalCases} = {pct1(rate)}
          {Math.abs(rate - run.passRatePct) <= 0.05 ? (
            <span className="ac-xs ac-ok-text ac-at-ml">与登记值 {run.passRatePct}% 一致</span>
          ) : (
            <span className="ac-xs ac-danger-text ac-at-ml">与登记值 {run.passRatePct}% 不一致</span>
          )}
        </dd>
        <dt>覆盖率 / flaky</dt>
        <dd className="ac-tnum">
          契约断言覆盖率 {pct1(run.coveragePct)} · 抖动用例执行 {run.flakyCount} 次
        </dd>
        <dt>新开缺陷</dt>
        <dd>
          {run.newBugsCreated.length > 0 ? (
            <span className="ac-at-tag-col">
              {run.newBugsCreated.map((b) => (
                <button key={b} type="button" className="ac-tag ac-tag--sm ac-tag--danger ac-at-link" onClick={() => jump('bug')}>
                  {b} · {BUG_MAP[b]?.title ?? ''}
                </button>
              ))}
            </span>
          ) : (
            <span className="ac-xs ac-muted">本次未新开缺陷</span>
          )}
        </dd>
        <dt>结论</dt>
        <dd className="ac-xs">{run.statusLabel}</dd>
        <dt>归属报告</dt>
        <dd className="ac-mono">{run.reportId}</dd>
      </dl>

      <div className="ac-at-sub-title">
        <XCircle size={13} />
        失败用例明细与断言现场（{failed.length}）
      </div>
      {failed.length === 0 ? (
        <div className="ac-hint ac-hint--ok">
          <CheckCircle2 size={14} />
          <span>本次执行无失败用例，{run.totalCases} 条用例全部通过，可作为下游门禁的准入证据。</span>
        </div>
      ) : (
        <div className="ac-at-faildetail-list">
          {failed.map((id) => {
            const c = allCases.find((x) => x.id === id);
            const fd = FAIL_DETAIL[id];
            const filed = filedBugs.includes(id);
            const existBug = run.newBugsCreated.includes(fd.bugId);
            return (
              <div className="ac-at-faildetail" key={id}>
                <div className="ac-at-fail-head">
                  <span className={`ac-at-method ac-at-method--${METHOD_META[c?.method ?? 'GET']?.tone ?? 'neutral'}`}>{c?.method ?? '—'}</span>
                  <span className="ac-at-cell-main">
                    {id} · {c?.name ?? ''}
                  </span>
                  <span className="ac-tag ac-tag--sm ac-tag--danger">失败</span>
                  <button type="button" className="ac-tag ac-tag--sm ac-tag--outline ac-at-link" onClick={() => jump('bug')}>
                    {fd.bugId} · {BUG_MAP[fd.bugId]?.title ?? ''}
                  </button>
                </div>
                <div className="ac-code ac-code--light ac-at-code-block">
                  <div className="ac-code-head">
                    <span className="ac-code-title">assertion-failure</span>
                    <span className="ac-code-lang">{ASSERT_TYPE_META[fd.expr.startsWith('SELECT') ? 'db' : fd.expr.startsWith('p9') ? 'duration' : fd.expr.startsWith('response') ? 'status' : fd.expr.includes('(') ? 'jsonpath' : 'jsonpath']?.label ?? '断言'}</span>
                  </div>
                  <div className="ac-code-body">
                    <span className="ac-tok-key">expr</span>
                    {'     : '}
                    <span className="ac-tok-fn">{fd.expr}</span>
                    {'\n'}
                    <span className="ac-tok-key">expected</span>
                    {' : '}
                    <span className="ac-tok-str">{fd.expected}</span>
                    {'\n'}
                    <span className="ac-tok-key">actual</span>
                    {'   : '}
                    <span className="ac-tok-attr">{fd.actual}</span>
                  </div>
                </div>
                <div className="ac-ai-block ac-at-mt">
                  <div className="ac-ai-block-title">
                    <Sparkles size={13} />
                    ag-test · 根因初判
                  </div>
                  <div className="ac-mt-2">{fd.rootCause}</div>
                  <div className="ac-at-ai-note">
                    <strong>依据：</strong>失败断言的期望 / 实际差值、{fd.bugId} 的缺陷现象与关联 MR、
                    知识库 KD-18（TR-24 测试报告）与 KD-20（根因分析报告归档包）的切片交叉验证。
                    <br />
                    <strong>人工介入：</strong>AI 只给出初判与开单草稿，缺陷定级、指派与是否阻断发布仍由测试负责人与研发总监确认；
                    同根因重复开单会自动合并到已有缺陷并追加复现记录。
                  </div>
                </div>
                <div className="ac-at-ai-actions">
                  <button
                    type="button"
                    className={`ac-btn ac-btn--sm ${filed || existBug ? 'ac-btn--danger' : 'ac-btn--danger-ghost'}`}
                    onClick={() => onFileBug(id)}
                    disabled={existBug}
                  >
                    <XCircle size={12} />
                    {existBug ? `已开单 ${fd.bugId}` : filed ? '已生成缺陷草稿' : '一键建缺陷'}
                  </button>
                  <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => c && onOpenCase(c)}>
                    <FlaskConical size={12} />
                    查看用例
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="ac-at-sub-title ac-at-mt">
        <ListChecks size={13} />
        本次执行的用例清单（{run.caseIds.length}）
      </div>
      <div className="ac-at-tag-col">
        {run.caseIds.map((id) => {
          const c = allCases.find((x) => x.id === id);
          const isFail = FAIL_DETAIL[id] !== undefined;
          return (
            <span key={id} className={`ac-tag ac-tag--sm ac-tag--${isFail ? 'danger' : 'ok'}`} title={c?.name ?? id}>
              {isFail ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
              {id}
            </span>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ JSON 着色 */

/** 极简 JSON 语法着色：仅用 ac-tok-* 类，不引入任何高亮库 */
function tokenizeJson(src: string): React.ReactNode[] {
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|(\$\{[^}]*\})/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(src)) !== null) {
    if (m.index > last) out.push(src.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <span key={key++} className={m[2] ? 'ac-tok-key' : 'ac-tok-str'}>
          {m[1]}
        </span>,
      );
      if (m[2]) out.push(m[2]);
    } else if (m[3] !== undefined) {
      out.push(
        <span key={key++} className="ac-tok-num">
          {m[3]}
        </span>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <span key={key++} className="ac-tok-type">
          {m[4]}
        </span>,
      );
    } else if (m[5] !== undefined) {
      out.push(
        <span key={key++} className="ac-tok-fn">
          {m[5]}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}
