/**
 * 需求管理（pageId: req-pool）
 *
 * 与既有「需求工作台」的分工：
 *  · 本页（需求管理）—— 需求「池」的横向全生命周期治理：收集 → 评估 → 评分 → 排期 → 入迭代 → 交付 / 拒绝，
 *    管的是 20 条候选需求的来源、优先级评分、评审轮次、漏斗转化与端到端追溯。
 *  · 需求工作台（pageId: requirement）—— 单条需求进入迭代后的纵向深度作业：Brainstorm → PRD → 评审 → 拆解 → 验收标准。
 *
 * 标签页：
 *  1. 需求池     —— 6 张指标卡 / 15 列需求池表（多维筛选 + 排序 + 多选）/ AI 优先级评分口径与 Top5 / 重评分·批量入迭代·拒绝
 *  2. 价值成本矩阵 —— 手绘 SVG 四象限散点（气泡大小 = 预估点数）/ 象限统计 / 紧急度-风险气泡图 / AI 组合建议
 *  3. 评审轮次   —— 12 列评审记录表 / AI 会前预读与澄清问题抽屉 / 评分变化哑铃图 / AI 评审提效统计
 *  4. 漏斗与来源 —— 手绘 SVG 漏斗（6 阶段）/ 来源环形图 + 明细表 / 来源 × 阶段堆叠条 / AI 来源洞察
 *  5. 追溯与关联 —— 手绘 SVG 追溯链路图（池 → 需求 → 故事 → 任务 → 缺陷 → 发布单）/ 追溯矩阵 / 断链检测 / AI 完整性评估
 *
 * 数据口径：./data-mgmt 的 REQ_POOL(20) / REQ_REVIEWS(10) / REQ_FUNNEL(6) / REQ_SOURCE_STATS(7) /
 * REQ_POOL_ID_BY_REQUIREMENT，以及 ./data 的 REQUIREMENTS / USER_STORIES / TASKS / BUGS / RELEASE_ORDERS / SPRINTS。
 * 贯穿案例为「订单中心重构」（EPIC-ORDER-REF）· Sprint 24，TODAY = 2026-03-19。所有图表为内联手绘 SVG。
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  Ban,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleCheck,
  CircleDot,
  CircleSlash,
  CircleX,
  ClipboardList,
  Clock,
  Compass,
  Crosshair,
  Flame,
  Gauge,
  GitBranch,
  Inbox,
  Layers,
  Link2,
  ListChecks,
  Milestone,
  Percent,
  Plus,
  RefreshCw,
  Rocket,
  Scale,
  Search,
  ShieldCheck,
  Sigma,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  TriangleAlert,
  Waypoints,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import {
  FieldShell,
  FormGroupTitle,
  FormGrid,
  MultiPickField,
  NumberField,
  SelectField,
  TextField,
  cleanErrors,
  requireNumber,
  requireText,
} from '../components/FormFields';
import Modal from '../components/Modal';
import {
  BUGS,
  RELEASE_ORDERS,
  REQUIREMENTS,
  REQUIREMENT_MAP,
  ROLES,
  ROLE_MAP,
  SPRINTS,
  TASKS,
  TASK_MAP,
  TODAY,
  USERS,
  USER_MAP,
  USER_STORIES,
} from '../data';
import type { BugDef, ReleaseOrderDef, RequirementDef, TaskDef, Tone, UserStoryDef } from '../data';
import {
  REQ_FUNNEL,
  REQ_POOL,
  REQ_POOL_ID_BY_REQUIREMENT,
  REQ_POOL_MAP,
  REQ_REVIEWS,
  REQ_SOURCE_STATS,
} from '../data-mgmt';
import type { ReqFunnelStat, ReqPoolItemDef, ReqReviewRoundDef } from '../data-mgmt';
import './req-pool.css';

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

/** 语义色 → 头像色类（ac-avatar--{tone} 支持全部 11 种） */
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

type TabId = 'pool' | 'matrix' | 'review' | 'funnel' | 'trace';

const TABS: { id: TabId; name: string; icon: typeof Inbox; count: number }[] = [
  { id: 'pool', name: '需求池', icon: Inbox, count: REQ_POOL.length },
  { id: 'matrix', name: '价值成本矩阵', icon: Crosshair, count: REQ_POOL.length },
  { id: 'review', name: '评审轮次', icon: ClipboardList, count: REQ_REVIEWS.length },
  { id: 'funnel', name: '漏斗与来源', icon: Waypoints, count: REQ_FUNNEL.length },
  { id: 'trace', name: '追溯与关联', icon: GitBranch, count: REQUIREMENTS.length },
];

type PoolStage = ReqPoolItemDef['stage'];
type SourceType = ReqPoolItemDef['sourceType'];
type FunnelGroup = ReqFunnelStat['stage'] | '流失';

/** 8 个池内阶段：展示顺序、语义色与所属漏斗分组 */
const STAGE_META: Record<PoolStage, { tone: Tone; order: number; funnel: FunnelGroup }> = {
  收集: { tone: 'neutral', order: 1, funnel: '收集' },
  评估中: { tone: 'info', order: 2, funnel: '评估' },
  已评分: { tone: 'ai', order: 3, funnel: '评分' },
  待排期: { tone: 'warn', order: 4, funnel: '排期' },
  已入迭代: { tone: 'brand', order: 5, funnel: '入迭代' },
  已交付: { tone: 'ok', order: 6, funnel: '交付' },
  已拒绝: { tone: 'slate', order: 7, funnel: '流失' },
  已挂起: { tone: 'slate', order: 8, funnel: '流失' },
};

const STAGES: PoolStage[] = [
  '收集',
  '评估中',
  '已评分',
  '待排期',
  '已入迭代',
  '已交付',
  '已拒绝',
  '已挂起',
];

const SOURCE_TYPES: SourceType[] = [
  '业务方提出',
  '技术债',
  '客户投诉',
  '线上事故复盘',
  '合规监管',
  '竞品分析',
  'AI 主动发现',
];

/** 来源类型 → 语义色（取自 REQ_SOURCE_STATS.tone，保证与来源统计一致） */
const SOURCE_TONE: Record<string, Tone> = REQ_SOURCE_STATS.reduce<Record<string, Tone>>((acc, s) => {
  acc[s.sourceType] = s.tone;
  return acc;
}, {});

/** 漏斗分组顺序与配色（用于来源 × 阶段堆叠条） */
const FUNNEL_GROUPS: { key: FunnelGroup; label: string; hex: string }[] = [
  { key: '收集', label: '收集', hex: TONE_HEX.neutral },
  { key: '评估', label: '评估', hex: TONE_HEX.info },
  { key: '评分', label: '评分', hex: TONE_HEX.ai },
  { key: '排期', label: '排期', hex: TONE_HEX.warn },
  { key: '入迭代', label: '入迭代', hex: TONE_HEX.brand },
  { key: '交付', label: '交付', hex: TONE_HEX.ok },
  { key: '流失', label: '流失（拒绝/挂起）', hex: TONE_HEX.danger },
];

/** AI 优先级评分口径预设（权重合计恒为 1.00） */
interface ScorePreset {
  id: string;
  name: string;
  note: string;
  weights: { bv: number; urg: number; risk: number; inv: number };
}

const SCORE_PRESETS: ScorePreset[] = [
  {
    id: 'standard',
    name: '标准口径（落库基线）',
    note:
      '业务价值 40% / 紧急度 30% / 风险 15% / 实现难度反向 15%，等价于 4×bv + 3×urg + 1.5×risk + 1.5×(11−tc)，' +
      '与 REQ_POOL.aiPriorityScore 的落库值完全一致，可作为「评分口径未漂移」的回归校验。',
    weights: { bv: 0.4, urg: 0.3, risk: 0.15, inv: 0.15 },
  },
  {
    id: 'promo',
    name: '大促应急口径',
    note:
      '618 / 春节大促前置场景：紧急度权重提升到 45%、业务价值降到 30%、实现难度反向降到 10%，' +
      '更倾向「快速止血」，会让高性能与缓存类需求的排名上升。',
    weights: { bv: 0.3, urg: 0.45, risk: 0.15, inv: 0.1 },
  },
  {
    id: 'compliance',
    name: '合规优先口径',
    note:
      '年度审计窗口场景：风险权重提升到 30%、紧急度降到 20%，用于合规监管类需求的集中排期，' +
      '会让 RP-13（数据出境评估）这类高风险条目的排名上升。',
    weights: { bv: 0.35, urg: 0.2, risk: 0.3, inv: 0.15 },
  },
];

/** 评分分档（对应 tone 规则 B） */
const SCORE_BANDS: { id: string; label: string; min: number; max: number; tone: Tone }[] = [
  { id: 'p0', label: 'P0 级（≥ 80）', min: 80, max: 999, tone: 'brand' },
  { id: 'p1', label: 'P1 级（65 ~ 79）', min: 65, max: 80, tone: 'warn' },
  { id: 'p2', label: 'P2 级（45 ~ 64）', min: 45, max: 65, tone: 'info' },
  { id: 'watch', label: '观察级（< 45）', min: -1, max: 45, tone: 'neutral' },
];

/** 价值成本矩阵的四象限定义（价值 = businessValue，成本 = techComplexity，均以 6 为高低分界） */
const QUADRANTS: {
  id: string;
  name: string;
  desc: string;
  tone: Tone;
  test: (it: ReqPoolItemDef) => boolean;
}[] = [
  {
    id: 'quick',
    name: '速赢 Quick Win',
    desc: '高价值 · 低成本（bv ≥ 6 且 tc ≤ 5）',
    tone: 'ok',
    test: (it) => it.businessValue >= 6 && it.techComplexity <= 5,
  },
  {
    id: 'strategic',
    name: '战略投入',
    desc: '高价值 · 高成本（bv ≥ 6 且 tc ≥ 6）',
    tone: 'brand',
    test: (it) => it.businessValue >= 6 && it.techComplexity >= 6,
  },
  {
    id: 'filler',
    name: '填充项',
    desc: '低价值 · 低成本（bv ≤ 5 且 tc ≤ 5）',
    tone: 'info',
    test: (it) => it.businessValue <= 5 && it.techComplexity <= 5,
  },
  {
    id: 'drop',
    name: '放弃',
    desc: '低价值 · 高成本（bv ≤ 5 且 tc ≥ 6）',
    tone: 'danger',
    test: (it) => it.businessValue <= 5 && it.techComplexity >= 6,
  },
];

/** 评审结论 → 语义色 */
const OUTCOME_TONE: Record<ReqReviewRoundDef['outcome'], Tone> = {
  通过: 'ok',
  有条件通过: 'warn',
  退回修改: 'danger',
  挂起: 'slate',
};

/** 已进入开发的 10 态之一（用于「已开工但零覆盖」的断链判定） */
const STARTED_STATES = ['dev', 'testGreen', 'committed', 'deployed', 'qa', 'bugfix', 'released'];

/** G3 门禁的单测覆盖率阈值（取自 REL-2403 批次 1 的准入条件「G3 ≥ 85%」） */
const G3_COVERAGE = 85;

/** AI 澄清问题的人工查证成本（分钟/问），用于评审提效统计的口径 */
const MINUTES_PER_QUESTION = 12;

/** 缺陷状态中文化（BUGS 未提供 statusLabel 字段） */
const BUG_STATUS_LABEL: Record<BugDef['status'], string> = {
  new: '新建',
  analyzing: '分析中',
  fixing: '修复中',
  verifying: '验证中',
  closed: '已关闭',
  reopened: '重新打开',
};

/** 发布单状态中文化 */
const RELEASE_STATUS_LABEL: Record<ReleaseOrderDef['status'], string> = {
  released: '已发布',
  approving: '审批中',
  blocked: '已阻断',
  planned: '待执行',
  rolledback: '已回滚',
};

/* ------------------------------------------------------------------ 工具函数 */

/** 按口径重算 AI 优先级分：round(10 × Σ(权重 × 输入))，输入均归一到 1~10 */
function computeScore(it: ReqPoolItemDef, preset: ScorePreset): number {
  const w = preset.weights;
  const raw = 10 * (w.bv * it.businessValue + w.urg * it.urgency + w.risk * it.riskScore + w.inv * (11 - it.techComplexity));
  return Math.round(raw);
}

/** tone 规则 B：已拒绝 → slate；已交付 → ok；否则按分值分档 */
function toneOfScore(score: number, stage: PoolStage): Tone {
  if (stage === '已拒绝') return 'slate';
  if (stage === '已交付') return 'ok';
  if (score >= 80) return 'brand';
  if (score >= 65) return 'warn';
  if (score >= 45) return 'info';
  return 'neutral';
}

/** 分值所属分档 */
function bandOf(score: number) {
  return SCORE_BANDS.filter((b) => score >= b.min && score < b.max)[0] ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

/** 环形图扇区路径（外半径 rO、内半径 rI，角度为弧度） */
function arcPath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const pt = (r: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p1 = pt(rO, a0);
  const p2 = pt(rO, a1);
  const p3 = pt(rI, a1);
  const p4 = pt(rI, a0);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${rO} ${rO} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${rI} ${rI} 0 ${large} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
}

/** 追溯到发布单的关联层级 */
type ReleaseLevel = '需求级' | '迭代级';

interface TraceChain {
  pool: ReqPoolItemDef;
  req: RequirementDef | null;
  stories: UserStoryDef[];
  tasks: TaskDef[];
  bugs: BugDef[];
  releases: { rel: ReleaseOrderDef; level: ReleaseLevel }[];
  links: { l1: boolean; l2: boolean; l3: boolean; l4: boolean };
  breaks: string[];
}

/** 需求关联任务的平均单测覆盖率 */
function avgCoverage(taskIds: string[]) {
  const list = taskIds.map((id) => TASK_MAP[id]).filter(Boolean).filter((t) => t.type !== '发布');
  if (list.length === 0) return 0;
  return list.reduce((s, t) => s + t.coverage, 0) / list.length;
}

/**
 * 由一条需求池条目重建完整的端到端追溯链路。
 * 关联口径：
 *  · 池 ↔ 需求：REQ_POOL.requirementId，并用 REQ_POOL_ID_BY_REQUIREMENT 做反向校验（双向一致才算建立）
 *  · 需求 ↔ 故事：REQUIREMENTS.storyIds，且每条 USER_STORIES.reqId 必须回指该需求
 *  · 需求 ↔ 任务：REQUIREMENTS.taskIds，且每条 TASKS.reqId 必须回指该需求
 *  · 任务 ↔ 质量资产：BUGS.reqId 命中，或关联任务（发布类除外）的平均覆盖率 ≥ 60%
 *  · 需求 ↔ 发布单：① 需求级 = 池条目的 decisionNote / aiScoreReason 文本中直接点名了发布单号；
 *                   ② 迭代级 = RELEASE_ORDERS.taskId 对应任务的 sprintId 与该需求的 sprintId 相同
 *                   （数据层未提供发布单 → 需求的结构化外键，REL-2403 的 taskId 为 TASK-2421 且其 reqId 为空串）
 */
function buildChain(pool: ReqPoolItemDef): TraceChain {
  const req = pool.requirementId ? REQUIREMENT_MAP[pool.requirementId] ?? null : null;
  const stories = req ? req.storyIds.map((id) => USER_STORIES.filter((s) => s.id === id)[0]).filter(Boolean) : [];
  const tasks = req ? req.taskIds.map((id) => TASK_MAP[id]).filter(Boolean) : [];
  const bugs = req ? BUGS.filter((b) => b.reqId === req.id) : [];

  const direct = RELEASE_ORDERS.filter(
    (r) => pool.decisionNote.indexOf(r.id) >= 0 || pool.aiScoreReason.indexOf(r.id) >= 0,
  );
  const iteration = req
    ? RELEASE_ORDERS.filter((r) => {
        if (direct.some((d) => d.id === r.id)) return false;
        const t = TASK_MAP[r.taskId];
        return Boolean(t) && t.sprintId === req.sprintId;
      })
    : [];
  const releases: { rel: ReleaseOrderDef; level: ReleaseLevel }[] = direct
    .map((rel) => ({ rel, level: '需求级' as ReleaseLevel }))
    .concat(iteration.map((rel) => ({ rel, level: '迭代级' as ReleaseLevel })));

  const l1 = Boolean(req) && REQ_POOL_ID_BY_REQUIREMENT[pool.requirementId ?? ''] === pool.id;
  const l2 = Boolean(req) && stories.length > 0 && stories.every((s) => s.reqId === req?.id);
  const l3 = Boolean(req) && tasks.length > 0 && tasks.every((t) => t.reqId === req?.id);
  const l4 = Boolean(req) && (bugs.length > 0 || avgCoverage(req?.taskIds ?? []) >= 60);

  const breaks: string[] = [];
  if (!l1 && (pool.stage === '已入迭代' || pool.stage === '已交付')) {
    breaks.push(`已${pool.stage === '已交付' ? '交付' : '入迭代'}但 requirementId 为空，池条目与正式需求之间缺少双向映射`);
  }
  if (req && tasks.length === 0) breaks.push(`${req.id} 已入迭代但 taskIds 为空，需求未拆解到工作项`);
  const allZeroCoverage = Boolean(req) && tasks.length > 0 && tasks.every((t) => t.coverage === 0);
  if (allZeroCoverage) {
    breaks.push(`${req?.id} 关联的 ${tasks.length} 个任务单测覆盖率全部为 0，已拆解但零测试资产`);
  }
  tasks
    .filter((t) => t.type !== '发布' && STARTED_STATES.indexOf(t.state) >= 0 && t.coverage === 0)
    .forEach((t) => breaks.push(`${t.id}（${t.stateLabel}）已开工但单测覆盖率为 0`));
  if (req && bugs.length === 0 && tasks.every((t) => STARTED_STATES.indexOf(t.state) < 0)) {
    breaks.push(`${req.id} 缺陷数为 0，但关联任务均未进入测试态 —— 属「测试未启动」而非「零缺陷」`);
  }
  if (req && !l4 && !allZeroCoverage) {
    breaks.push(
      `${req.id} 缺少可验证的质量资产：关联缺陷 ${bugs.length} 个、任务平均单测覆盖率 ${avgCoverage(req.taskIds).toFixed(0)}%（低于 60% 判定线）`,
    );
  }
  if (req && releases.length === 0) breaks.push(`${req.id} 未关联任何发布单（迭代尚未收口）`);

  return { pool, req, stories, tasks, bugs, releases, links: { l1, l2, l3, l4 }, breaks };
}

/** 覆盖率 = 已建立双向映射的环节数 ÷ 4 */
function coverageOf(chain: TraceChain) {
  const n = [chain.links.l1, chain.links.l2, chain.links.l3, chain.links.l4].filter(Boolean).length;
  return { n, pct: Math.round((n / 4) * 1000) / 10 };
}

/** 跳转到其他原型页面 */
function jump(page: string) {
  window.location.hash = `#page=${page}`;
}

/* ------------------------------------------------------------------ 内联 SVG 图表 */

/** 手绘 SVG 价值成本四象限散点图：X = 技术复杂度（成本），Y = 业务价值，气泡大小 = 预估点数 */
function ValueCostScatter({
  items,
  selectedId,
  onPick,
}: {
  items: ReqPoolItemDef[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const W = 940;
  const H = 520;
  const padL = 56;
  const padR = 26;
  const padT = 30;
  const padB = 54;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const x = (tc: number) => padL + ((tc - 1) / 9) * plotW;
  const y = (bv: number) => padT + plotH - ((bv - 1) / 9) * plotH;
  const splitX = x(5.5);
  const splitY = y(5.5);

  /* 同坐标点做确定性偏移，避免完全重叠（数据中仅 RP-08 / RP-14 同为 tc3-bv6） */
  const seen: Record<string, number> = {};
  const placed = items.map((it) => {
    const key = `${it.techComplexity}-${it.businessValue}`;
    const k = seen[key] ?? 0;
    seen[key] = k + 1;
    const dx = k === 0 ? 0 : (k % 2 === 1 ? -1 : 1) * Math.ceil(k / 2) * 20;
    const dy = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 15;
    return { it, cx: x(it.techComplexity) + dx, cy: y(it.businessValue) + dy, r: Math.min(26, 6 + Math.sqrt(Math.max(it.estimatePoints, 1)) * 2.1) };
  });

  const QUAD_BG = [
    { x0: padL, y0: padT, x1: splitX, y1: splitY, tone: TONE_HEX.ok, name: '速赢 Quick Win', desc: '高价值 · 低成本' },
    { x0: splitX, y0: padT, x1: W - padR, y1: splitY, tone: TONE_HEX.brand, name: '战略投入', desc: '高价值 · 高成本' },
    { x0: padL, y0: splitY, x1: splitX, y1: padT + plotH, tone: TONE_HEX.info, name: '填充项', desc: '低价值 · 低成本' },
    { x0: splitX, y0: splitY, x1: W - padR, y1: padT + plotH, tone: TONE_HEX.danger, name: '放弃', desc: '低价值 · 高成本' },
  ];

  return (
    <svg
      className="ac-rp-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="需求池价值成本四象限散点图，横轴为技术复杂度即成本，纵轴为业务价值，气泡大小表示预估故事点，颜色表示所处阶段"
    >
      {QUAD_BG.map((q) => (
        <g key={q.name}>
          <rect x={q.x0} y={q.y0} width={q.x1 - q.x0} height={q.y1 - q.y0} fill={q.tone} opacity={0.055} />
          <text x={q.x0 + 10} y={q.y0 + 18} className="ac-rp-quad-name" fill={q.tone}>
            {q.name}
          </text>
          <text x={q.x0 + 10} y={q.y0 + 32} className="ac-rp-quad-desc">
            {q.desc}
          </text>
        </g>
      ))}

      {/* 网格与刻度 */}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
        <g key={v}>
          <line x1={x(v)} y1={padT} x2={x(v)} y2={padT + plotH} className="ac-rp-grid" />
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} className="ac-rp-grid" />
          <text x={x(v)} y={padT + plotH + 18} textAnchor="middle" className="ac-rp-axis-label">
            {v}
          </text>
          <text x={padL - 10} y={y(v) + 4} textAnchor="end" className="ac-rp-axis-label">
            {v}
          </text>
        </g>
      ))}
      <line x1={splitX} y1={padT} x2={splitX} y2={padT + plotH} className="ac-rp-split" />
      <line x1={padL} y1={splitY} x2={W - padR} y2={splitY} className="ac-rp-split" />

      <text x={W - padR} y={H - 12} textAnchor="end" className="ac-rp-axis-title">
        技术复杂度（成本）→
      </text>
      <text x={padL - 40} y={padT - 12} className="ac-rp-axis-title">
        ↑ 业务价值（收益）
      </text>

      {placed.map(({ it, cx, cy, r }) => {
        const active = it.id === selectedId;
        const color = TONE_HEX[STAGE_META[it.stage].tone] ?? TONE_HEX.brand;
        return (
          <g key={it.id} className="ac-rp-node" onClick={() => onPick(it.id)} role="button" aria-label={`查看 ${it.id} ${it.title}`}>
            <title>{`${it.id} ${it.title}\n阶段 ${it.stage} · 业务价值 ${it.businessValue} · 技术复杂度 ${it.techComplexity} · 预估 ${it.estimatePoints} 点 · AI 评分 ${it.aiPriorityScore}`}</title>
            <circle cx={cx} cy={cy} r={r} fill={color} opacity={active ? 0.95 : 0.62} stroke={active ? TONE_HEX.brand : '#fff'} strokeWidth={active ? 3 : 1.5} />
            <text x={cx} y={cy + 3.5} textAnchor="middle" className="ac-rp-bubble-id">
              {it.id.replace('RP-', '')}
            </text>
            {active && (
              <text x={cx} y={cy - r - 7} textAnchor="middle" className="ac-rp-bubble-title">
                {it.title.length > 20 ? `${it.title.slice(0, 20)}…` : it.title}
              </text>
            )}
          </g>
        );
      })}

      {/* 气泡大小说明 */}
      <g>
        {[5, 21, 89].map((p, i) => (
          <g key={p}>
            <circle cx={W - padR - 108 + i * 40} cy={H - 26} r={Math.min(26, 6 + Math.sqrt(p) * 2.1) * 0.5} fill="none" stroke={TONE_HEX.neutral} strokeWidth={1} />
            <text x={W - padR - 108 + i * 40} y={H - 8} textAnchor="middle" className="ac-rp-axis-label">
              {p} 点
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** 手绘 SVG 紧急度 × 风险气泡图：识别「高紧急高风险」需优先澄清的条目 */
function UrgencyRiskBubble({
  items,
  onPick,
}: {
  items: ReqPoolItemDef[];
  onPick: (id: string) => void;
}) {
  const W = 620;
  const H = 440;
  const padL = 50;
  const padR = 20;
  const padT = 26;
  const padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const x = (v: number) => padL + ((v - 1) / 9) * plotW;
  const y = (v: number) => padT + plotH - ((v - 1) / 9) * plotH;

  const seen: Record<string, number> = {};
  const placed = items.map((it) => {
    const key = `${it.urgency}-${it.riskScore}`;
    const k = seen[key] ?? 0;
    seen[key] = k + 1;
    const dx = k === 0 ? 0 : (k % 2 === 1 ? -1 : 1) * Math.ceil(k / 2) * 17;
    const dy = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 13;
    return { it, cx: x(it.urgency) + dx, cy: y(it.riskScore) + dy, r: Math.min(20, 5 + Math.sqrt(Math.max(it.estimatePoints, 1)) * 1.6) };
  });

  return (
    <svg
      className="ac-rp-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="紧急度与风险分二维气泡图，右上区域为高紧急高风险需优先澄清的条目"
    >
      <rect x={x(6.5)} y={padT} width={padL + plotW - x(6.5)} height={y(6.5) - padT} fill={TONE_HEX.danger} opacity={0.07} />
      <text x={x(6.5) + 8} y={padT + 16} className="ac-rp-quad-name" fill={TONE_HEX.danger}>
        高紧急 · 高风险
      </text>
      <text x={x(6.5) + 8} y={padT + 30} className="ac-rp-quad-desc">
        须优先澄清（urgency ≥ 7 且 risk ≥ 7）
      </text>

      {[1, 3, 5, 7, 9].map((v) => (
        <g key={v}>
          <line x1={x(v)} y1={padT} x2={x(v)} y2={padT + plotH} className="ac-rp-grid" />
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} className="ac-rp-grid" />
          <text x={x(v)} y={padT + plotH + 17} textAnchor="middle" className="ac-rp-axis-label">
            {v}
          </text>
          <text x={padL - 9} y={y(v) + 4} textAnchor="end" className="ac-rp-axis-label">
            {v}
          </text>
        </g>
      ))}
      <line x1={x(6.5)} y1={padT} x2={x(6.5)} y2={padT + plotH} className="ac-rp-split" />
      <line x1={padL} y1={y(6.5)} x2={W - padR} y2={y(6.5)} className="ac-rp-split" />

      {placed.map(({ it, cx, cy, r }) => {
        const hot = it.urgency >= 7 && it.riskScore >= 7;
        const color = hot ? TONE_HEX.danger : TONE_HEX[STAGE_META[it.stage].tone] ?? TONE_HEX.neutral;
        return (
          <g key={it.id} className="ac-rp-node" onClick={() => onPick(it.id)} role="button" aria-label={`查看 ${it.id}`}>
            <title>{`${it.id} ${it.title}\n紧急度 ${it.urgency} · 风险 ${it.riskScore} · 预估 ${it.estimatePoints} 点 · 阶段 ${it.stage}`}</title>
            <circle cx={cx} cy={cy} r={r} fill={color} opacity={hot ? 0.8 : 0.5} stroke="#fff" strokeWidth={1.4} />
            <text x={cx} y={cy + 3.4} textAnchor="middle" className="ac-rp-bubble-id">
              {it.id.replace('RP-', '')}
            </text>
          </g>
        );
      })}

      <text x={W - padR} y={H - 10} textAnchor="end" className="ac-rp-axis-title">
        紧急度 →
      </text>
      <text x={padL - 36} y={padT - 10} className="ac-rp-axis-title">
        ↑ 风险分
      </text>
    </svg>
  );
}

/** 手绘 SVG 评分变化哑铃图：10 轮评审的 scoreBefore → scoreAfter */
function DumbbellChart({ onPick }: { onPick: (id: string) => void }) {
  const W = 940;
  const rowH = 30;
  const padL = 148;
  const padR = 96;
  const padT = 26;
  const H = padT + REQ_REVIEWS.length * rowH + 30;
  const plotW = W - padL - padR;
  const lo = 10;
  const hi = 100;
  const x = (v: number) => padL + ((v - lo) / (hi - lo)) * plotW;

  return (
    <svg
      className="ac-rp-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="10 轮需求评审的评分变化哑铃图，左端点为评审前分值，右端点为评审后分值，连线颜色表示上调或下调"
    >
      {[20, 40, 60, 80, 100].map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} y1={padT - 6} x2={x(tick)} y2={padT + REQ_REVIEWS.length * rowH} className="ac-rp-grid" />
          <text x={x(tick)} y={H - 10} textAnchor="middle" className="ac-rp-axis-label">
            {tick}
          </text>
        </g>
      ))}
      {REQ_REVIEWS.map((r, i) => {
        const yRow = padT + i * rowH + rowH / 2;
        const pool = REQ_POOL_MAP[r.poolItemId];
        const up = r.scoreAfter >= r.scoreBefore;
        const delta = r.scoreAfter - r.scoreBefore;
        const color = up ? TONE_HEX.ok : TONE_HEX.danger;
        return (
          <g key={r.id} className="ac-rp-node" onClick={() => onPick(r.id)} role="button" aria-label={`查看 ${r.id} 评审详情`}>
            <title>{`${r.id} · ${pool?.id ?? r.poolItemId} 第 ${r.round} 轮 · ${r.scoreBefore} → ${r.scoreAfter}（${delta > 0 ? '+' : ''}${delta}）· ${r.outcome}`}</title>
            <text x={0} y={yRow + 4} className="ac-rp-dumbbell-name">
              {r.id} · {pool?.id ?? r.poolItemId}
            </text>
            <text x={padL - 8} y={yRow + 4} textAnchor="end" className="ac-rp-axis-label">
              第 {r.round} 轮
            </text>
            <line x1={x(Math.min(r.scoreBefore, r.scoreAfter))} y1={yRow} x2={x(Math.max(r.scoreBefore, r.scoreAfter))} y2={yRow} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.75} />
            <circle cx={x(r.scoreBefore)} cy={yRow} r={5} fill="#fff" stroke={TONE_HEX.neutral} strokeWidth={2} />
            <circle cx={x(r.scoreAfter)} cy={yRow} r={6} fill={color} />
            <text x={W - padR + 12} y={yRow + 4} className="ac-rp-dumbbell-delta" fill={color}>
              {delta > 0 ? '+' : ''}
              {delta} → {r.scoreAfter}
            </text>
          </g>
        );
      })}
      <text x={padL} y={14} className="ac-rp-axis-title">
        AI 优先级分（10 ~ 100）· 空心点 = 评审前 scoreBefore，实心点 = 评审后 scoreAfter
      </text>
    </svg>
  );
}

/** 手绘 SVG 需求漏斗：6 个阶段的累计到达量与层间转化率 */
function FunnelChart() {
  const W = 880;
  const layerH = 56;
  const padT = 24;
  const H = padT + REQ_FUNNEL.length * layerH + 26;
  const cx = 280;
  const maxW = 440;
  const maxCount = REQ_FUNNEL[0]?.count ?? 1;
  const widthOf = (count: number) => Math.max(46, (count / maxCount) * maxW);

  return (
    <svg
      className="ac-rp-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="需求池 6 阶段漏斗图，从收集 20 条到交付 1 条，每层标注数量、相对上一阶段的转化率与平均周期天数"
    >
      {REQ_FUNNEL.map((f, i) => {
        const next = REQ_FUNNEL[i + 1];
        const topW = widthOf(f.count);
        const botW = next ? widthOf(next.count) : topW * 0.5;
        const y0 = padT + i * layerH;
        const y1 = y0 + layerH;
        const color = TONE_HEX[f.tone] ?? TONE_HEX.brand;
        const lost = next ? f.count - next.count : 0;
        return (
          <g key={f.stage}>
            <polygon
              points={`${cx - topW / 2},${y0} ${cx + topW / 2},${y0} ${cx + botW / 2},${y1} ${cx - botW / 2},${y1}`}
              fill={color}
              opacity={0.86}
              stroke="#fff"
              strokeWidth={1.5}
            >
              <title>{`${f.stage}：累计到达 ${f.count} 条 · 转化率 ${f.conversionRatePct}% · 平均周期 ${f.avgCycleDays} 天`}</title>
            </polygon>
            <text x={cx} y={y0 + 25} textAnchor="middle" className="ac-rp-funnel-stage">
              {f.stage}
            </text>
            <text x={cx} y={y0 + 43} textAnchor="middle" className="ac-rp-funnel-count">
              {f.count} 条
            </text>

            {/* 左侧：转化率 */}
            <text x={cx - topW / 2 - 12} y={y0 + 26} textAnchor="end" className="ac-rp-funnel-rate">
              {f.conversionRatePct.toFixed(1)}%
            </text>
            <text x={cx - topW / 2 - 12} y={y0 + 42} textAnchor="end" className="ac-rp-axis-label">
              {i === 0 ? '入池基准' : `较上一阶段`}
            </text>

            {/* 右侧：平均周期与流失 */}
            <line x1={cx + topW / 2 + 14} y1={y0 + layerH / 2} x2={560} y2={y0 + layerH / 2} className="ac-rp-grid" />
            <text x={568} y={y0 + 24} className="ac-rp-funnel-note">
              入池 → 离开本阶段平均 {f.avgCycleDays.toFixed(1)} 天
            </text>
            <text x={568} y={y0 + 41} className="ac-rp-axis-label">
              {next
                ? `本环节流失 ${lost} 条（${((lost / Math.max(f.count, 1)) * 100).toFixed(1)}%）→ 进入「${next.stage}」${next.count} 条`
                : `末端交付：SP-24 尚未收口（TODAY = ${TODAY}），8 条已入迭代需求中仅 REQ-2406 于 2026-03-13 随 v2.4 上线`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 手绘 SVG 来源分布环形图 */
function SourceDonut({ onPick }: { onPick: (s: SourceType) => void }) {
  const size = 220;
  const c = size / 2;
  const total = REQ_SOURCE_STATS.reduce((s, r) => s + r.count, 0) || 1;
  let angle = -Math.PI / 2;

  return (
    <svg className="ac-rp-svg ac-rp-donut" viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label="需求池 7 类来源的占比环形图">
      {REQ_SOURCE_STATS.map((s) => {
        const sweep = (s.count / total) * Math.PI * 2;
        const a0 = angle;
        const a1 = angle + sweep;
        angle = a1;
        const color = TONE_HEX[s.tone] ?? TONE_HEX.brand;
        return (
          <path
            key={s.sourceType}
            d={arcPath(c, c, 92, 56, a0, a1 - 0.02)}
            fill={color}
            className="ac-rp-node"
            onClick={() => onPick(s.sourceType)}
          >
            <title>{`${s.sourceType}：${s.count} 条（${s.sharePct}%）· 采纳率 ${s.acceptRatePct}% · 平均周期 ${s.avgCycleDays} 天`}</title>
          </path>
        );
      })}
      <text x={c} y={c - 4} textAnchor="middle" className="ac-rp-donut-value">
        {total}
      </text>
      <text x={c} y={c + 14} textAnchor="middle" className="ac-rp-donut-label">
        池内条目
      </text>
    </svg>
  );
}

/** 手绘 SVG 来源 × 阶段堆叠条形图 */
function SourceStageStack() {
  const W = 940;
  const labelW = 108;
  const valueW = 122;
  const rowH = 30;
  const H = SOURCE_TYPES.length * rowH + 10;
  const chartW = W - labelW - valueW;
  const maxCount = Math.max(...SOURCE_TYPES.map((st) => REQ_SOURCE_STATS.filter((s) => s.sourceType === st)[0]?.count ?? 0), 1);
  const unit = chartW / maxCount;

  const groupOf = (it: ReqPoolItemDef): FunnelGroup => STAGE_META[it.stage].funnel;

  return (
    <svg
      className="ac-rp-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="各来源类型在需求池 7 个阶段分组上的分布堆叠条形图"
    >
      {SOURCE_TYPES.map((st, rowIdx) => {
        const y = rowIdx * rowH + 5;
        const rows = REQ_POOL.filter((p) => p.sourceType === st);
        let cursor = labelW;
        const stat = REQ_SOURCE_STATS.filter((s) => s.sourceType === st)[0];
        return (
          <g key={st}>
            <text x={0} y={y + 15} className="ac-rp-stack-name">
              {st}
            </text>
            <rect className="ac-rp-bar-track" x={labelW} y={y + 3} width={chartW} height={17} rx={4} />
            {FUNNEL_GROUPS.map((g) => {
              const n = rows.filter((p) => groupOf(p) === g.key).length;
              if (n <= 0) return null;
              const w = n * unit;
              const rect = (
                <rect key={g.key} x={cursor} y={y + 3} width={Math.max(w - 2, 2)} height={17} rx={3} fill={g.hex}>
                  <title>{`${st} · ${g.label} ${n} 条`}</title>
                </rect>
              );
              cursor += w;
              return rect;
            })}
            <text x={labelW + chartW + 10} y={y + 16} className="ac-rp-stack-value">
              {stat ? `${stat.count} 条 · 采纳 ${stat.acceptRatePct}%` : `${rows.length} 条`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 手绘 SVG 追溯链路图：需求池条目 → 正式需求 → 用户故事 → 任务 → 缺陷 → 发布单 */
function TraceFlow({ chain }: { chain: TraceChain }) {
  const W = 1240;
  const padX = 14;
  const nodeW = 170;
  const nodeH = 40;
  const nodeGap = 10;
  const gapX = (W - padX * 2 - nodeW * 6) / 5;
  const headY = 22;
  const channelY = 52;
  const topY = 76;
  const MAX = 5;

  type Node = { key: string; id: string; title: string; sub: string; tone: Tone; dim?: boolean };
  const overflow = (n: number) => (n > MAX ? n - MAX : 0);

  const colPool: Node[] = [
    {
      key: 'pool',
      id: chain.pool.id,
      title: `${chain.pool.id} · ${chain.pool.code}`,
      sub: `${chain.pool.stage} · AI 评分 ${chain.pool.aiPriorityScore}`,
      tone: chain.pool.tone,
    },
  ];
  const colReq: Node[] = chain.req
    ? [{ key: 'req', id: chain.req.id, title: `${chain.req.id} · ${chain.req.code}`, sub: `${chain.req.statusLabel} · ${chain.req.storyPoints} 点`, tone: 'brand' }]
    : [{ key: 'req-none', id: '—', title: '无正式需求记录', sub: 'requirementId 为空 · 断链', tone: 'danger', dim: true }];
  const colStory: Node[] = chain.stories.slice(0, MAX).map((s) => ({ key: `s-${s.id}`, id: s.id, title: s.id, sub: `${s.title} · ${s.points} 点`, tone: s.tone }));
  const colTask: Node[] = chain.tasks.slice(0, MAX).map((t) => ({ key: `t-${t.id}`, id: t.id, title: t.id, sub: `${t.stateLabel} · 覆盖 ${t.coverage}%`, tone: t.coverage >= G3_COVERAGE ? 'ok' : t.coverage > 0 ? 'warn' : 'danger' }));
  const colBug: Node[] = chain.bugs.slice(0, MAX).map((b) => ({ key: `b-${b.id}`, id: b.id, title: b.id, sub: `${b.priority} · ${BUG_STATUS_LABEL[b.status] ?? b.status}`, tone: b.tone }));
  const colRel: Node[] = chain.releases.slice(0, MAX).map((r) => ({
    key: `r-${r.rel.id}`,
    id: r.rel.id,
    title: `${r.rel.id}（${r.level}）`,
    sub: `${r.rel.version} · ${RELEASE_STATUS_LABEL[r.rel.status] ?? r.rel.status}`,
    tone: r.rel.status === 'released' ? 'ok' : r.rel.status === 'blocked' ? 'danger' : 'warn',
  }));

  const columns: { label: string; nodes: Node[]; total: number }[] = [
    { label: '需求池条目', nodes: colPool, total: 1 },
    { label: '正式需求', nodes: colReq, total: chain.req ? 1 : 0 },
    { label: '用户故事', nodes: colStory, total: chain.stories.length },
    { label: '任务', nodes: colTask, total: chain.tasks.length },
    { label: '缺陷', nodes: colBug, total: chain.bugs.length },
    { label: '发布单', nodes: colRel, total: chain.releases.length },
  ];

  const maxRows = Math.max(...columns.map((c) => c.nodes.length + (overflow(c.total) > 0 ? 1 : 0)), 1);
  const H = topY + maxRows * (nodeH + nodeGap) + 24;
  const colX = (i: number) => padX + i * (nodeW + gapX);

  const pos: Record<string, { x: number; y: number }> = {};
  columns.forEach((col, ci) => {
    col.nodes.forEach((n, ri) => {
      pos[n.key] = { x: colX(ci), y: topY + ri * (nodeH + nodeGap) };
    });
  });

  const rightOf = (key: string) => ({ x: pos[key].x + nodeW, y: pos[key].y + nodeH / 2 });
  const leftOf = (key: string) => ({ x: pos[key].x, y: pos[key].y + nodeH / 2 });

  type Edge = { d: string; tone: Tone; dashed?: boolean; label?: string };
  const edges: Edge[] = [];
  const link = (from: string, to: string, tone: Tone, dashed?: boolean) => {
    if (!pos[from] || !pos[to]) return;
    const a = rightOf(from);
    const b = leftOf(to);
    const mx = (a.x + b.x) / 2;
    edges.push({ d: `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`, tone, dashed });
  };
  /** 经顶部通道走线的长距离关联（发布单与需求之间缺少结构化外键） */
  const linkViaTop = (from: string, to: string, tone: Tone) => {
    if (!pos[from] || !pos[to]) return;
    const a = rightOf(from);
    const b = leftOf(to);
    edges.push({
      d: `M ${a.x} ${a.y} C ${a.x + 60} ${channelY}, ${b.x - 60} ${channelY}, ${b.x} ${b.y}`,
      tone,
      dashed: true,
    });
  };

  if (chain.req) link('pool', 'req', chain.links.l1 ? 'ok' : 'danger');
  else link('pool', 'req-none', 'danger', true);

  if (chain.req) {
    colStory.forEach((s) => link('req', s.key, chain.links.l2 ? 'brand' : 'danger'));
    colTask.forEach((t) => {
      const task = TASK_MAP[t.id];
      const fromStory = task?.storyIds.map((sid) => `s-${sid}`).filter((k) => pos[k])[0];
      if (fromStory) link(fromStory, t.key, chain.links.l3 ? 'info' : 'danger');
      else link('req', t.key, 'warn', true);
    });
    colBug.forEach((b) => {
      const bug = BUGS.filter((x) => x.id === b.id)[0];
      const fromTask = bug?.taskIds.map((tid) => `t-${tid}`).filter((k) => pos[k])[0];
      if (fromTask) link(fromTask, b.key, 'warn');
      else link('req', b.key, 'neutral', true);
    });
    chain.releases.slice(0, MAX).forEach((r) => linkViaTop('req', `r-${r.rel.id}`, r.level === '需求级' ? 'ok' : 'warn'));
  }

  return (
    <svg
      className="ac-rp-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`需求 ${chain.pool.id} 的端到端追溯链路图，依次经过需求池条目、正式需求、用户故事、任务、缺陷与发布单六个层级`}
    >
      {columns.map((col, ci) => (
        <g key={col.label}>
          <rect x={colX(ci)} y={headY - 14} width={nodeW} height={22} rx={4} className="ac-rp-trace-head" />
          <text x={colX(ci) + nodeW / 2} y={headY + 1} textAnchor="middle" className="ac-rp-trace-head-text">
            {col.label}（{col.total}）
          </text>
        </g>
      ))}

      {edges.map((e, i) => (
        <path
          key={i}
          d={e.d}
          fill="none"
          stroke={TONE_HEX[e.tone] ?? TONE_HEX.neutral}
          strokeWidth={1.8}
          strokeDasharray={e.dashed ? '5 4' : undefined}
          opacity={0.72}
        />
      ))}

      {columns.map((col) => (
        <g key={`nodes-${col.label}`}>
          {col.nodes.map((n) => {
            const p = pos[n.key];
            const color = TONE_HEX[n.tone] ?? TONE_HEX.neutral;
            return (
              <g key={n.key}>
                <title>{`${n.title}\n${n.sub}`}</title>
                <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={6} fill={n.dim ? '#feecec' : '#fff'} stroke={color} strokeWidth={n.dim ? 1.6 : 1.2} />
                <rect x={p.x} y={p.y} width={4} height={nodeH} rx={2} fill={color} />
                <text x={p.x + 12} y={p.y + 17} className="ac-rp-trace-title">
                  {n.title.length > 22 ? `${n.title.slice(0, 22)}…` : n.title}
                </text>
                <text x={p.x + 12} y={p.y + 32} className="ac-rp-trace-sub">
                  {n.sub.length > 26 ? `${n.sub.slice(0, 26)}…` : n.sub}
                </text>
              </g>
            );
          })}
        </g>
      ))}

      {columns.map((col, ci) => {
        const extra = overflow(col.total);
        if (extra <= 0) return null;
        const y = topY + col.nodes.length * (nodeH + nodeGap);
        return (
          <g key={`more-${col.label}`}>
            <rect x={colX(ci)} y={y} width={nodeW} height={26} rx={6} className="ac-rp-trace-more" />
            <text x={colX(ci) + nodeW / 2} y={y + 17} textAnchor="middle" className="ac-rp-trace-more-text">
              另有 {extra} 条未展开
            </text>
          </g>
        );
      })}

      <text x={padX} y={H - 6} className="ac-rp-axis-label">
        实线 = 数据层存在结构化外键；虚线 = 由「迭代归属 + 单据文本命中」重建的弱关联（发布单模型未提供 requirementIds 字段）
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ 页面 */

type PoolSortKey =
  | 'id'
  | 'submittedAt'
  | 'stage'
  | 'businessValue'
  | 'urgency'
  | 'riskScore'
  | 'techComplexity'
  | 'score'
  | 'estimatePoints';

/* --------------------------------------------- 录入需求（本地草稿态，不回写数据模块） */

/** 录入表单承载类型：数值字段一律用 string，便于区分「未填写」与 0 */
interface CreateForm {
  title: string;
  sourceType: string;
  sourceRef: string;
  submitterMode: 'inner' | 'outer';
  submittedBy: string;
  externalName: string;
  epicId: string;
  businessValue: string;
  urgency: string;
  riskScore: string;
  techComplexity: string;
  estimatePoints: string;
  ownerRoleId: string;
  reviewers: string[];
  tags: string[];
}

const EMPTY_FORM: CreateForm = {
  title: '',
  sourceType: '业务方提出',
  sourceRef: '',
  submitterMode: 'inner',
  submittedBy: '',
  externalName: '',
  epicId: '',
  businessValue: '',
  urgency: '',
  riskScore: '',
  techComplexity: '',
  estimatePoints: '',
  ownerRoleId: '',
  reviewers: [],
  tags: [],
};

/** Epic id → 展示名（data.ts 未导出 EPICS 常量，此处按贯穿主线补一份名称映射） */
const EPIC_NAME: Record<string, string> = {
  'EPIC-ORDER-REF': '订单中心重构',
};

/** 录入表单字段 key → 中文标签（用于错误汇总条） */
const CREATE_FIELD_LABEL: Record<string, string> = {
  title: '需求标题',
  sourceType: '来源类型',
  sourceRef: '来源单据号 / 会议名',
  submittedBy: '提交人',
  externalName: '平台外提交人',
  businessValue: '业务价值',
  urgency: '紧急度',
  riskScore: '风险分',
  techComplexity: '技术复杂度',
  estimatePoints: '预估故事点',
  ownerRoleId: '责任角色',
  reviewers: '评审人',
  ai: 'AI 评分前置条件',
};

/** 来源类型 → AI 打分依据第二句（确定性文案，不含任何随机量） */
const SOURCE_JUDGEMENT: Record<SourceType, string> = {
  客户投诉: '来源为客户投诉，直接影响 NPS 与客诉率，处置时效已进入客服 SLA 考核。',
  业务方提出: '来源为业务方提出，收益体现在业务侧口径的转化与运营成本，须在评审会由业务方确认量化目标。',
  线上事故复盘: '来源为线上事故复盘，属止血类整改，不做则同类故障会按既有频率复发并叠加资损。',
  技术债: '属技术债偿还，收益体现在缺陷密度与变更前置时间，短期业务价值不显性但决定后续迭代速率。',
  合规监管: '合规刚性要求，不做存在监管处罚风险，排期上不具备可延后空间。',
  竞品分析: '来源为竞品分析，属机会型投入，收益取决于市场窗口是否仍然敞开，需在窗口关闭前完成验证。',
  'AI 主动发现': '来源为 AI 主动发现（ag-ba 可观测分析周报），已附指标快照与阈值出处，属人工提池难以覆盖的盲区。',
};

/** AI 打分依据第三句：复杂度与排期提示（按 techComplexity 分三档，确定性） */
function complexityAdvice(tc: number): string {
  if (tc >= 7) return '技术复杂度偏高，建议先出架构方案再入迭代。';
  if (tc <= 3) return '实现路径清晰，可直接入迭代。';
  return '复杂度适中，建议随主线迭代合并交付。';
}

/** 数据模块 A 节口径：4×bv + 3×urg + 1.5×risk + 1.5×(11−tc)，落库前 round 并 clamp 到 [10, 100] */
function poolScoreRaw(bv: number, urg: number, risk: number, tc: number): number {
  return 4 * bv + 3 * urg + 1.5 * risk + 1.5 * (11 - tc);
}

function poolScoreOf(bv: number, urg: number, risk: number, tc: number): number {
  return Math.min(100, Math.max(10, Math.round(poolScoreRaw(bv, urg, risk, tc))));
}

/** 四项贡献值（顺序即并列时的优先序，保证 AI 文案确定性） */
function scoreContribs(bv: number, urg: number, risk: number, tc: number) {
  return [
    { name: '业务价值', expr: `4×${bv}`, value: 4 * bv },
    { name: '紧急度', expr: `3×${urg}`, value: 3 * urg },
    { name: '风险分', expr: `1.5×${risk}`, value: 1.5 * risk },
    { name: '实现难度反向', expr: `1.5×(11−${tc})`, value: 1.5 * (11 - tc) },
  ];
}

/** 数值展示：整数不带小数位，非整数保留 1 位 */
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function ReqPoolPage() {
  const [tab, setTab] = useState<TabId>('pool');

  /* ---- 需求池筛选 / 排序 / 多选 ---- */
  const [keyword, setKeyword] = useState('');
  const [fStage, setFStage] = useState<string>('all');
  const [fSource, setFSource] = useState<string>('all');
  const [fBand, setFBand] = useState<string>('all');
  const [fSprint, setFSprint] = useState<string>('all');
  const [fTag, setFTag] = useState<string>('all');
  const [sort, setSort] = useState<{ key: PoolSortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ---- 本地乐观更新（批量入迭代 / 拒绝 / 重新评分） ---- */
  const [overrides, setOverrides] = useState<Record<string, Partial<ReqPoolItemDef>>>({});
  const [presetId, setPresetId] = useState<string>('standard');
  const [rescored, setRescored] = useState<Record<string, number> | null>(null);
  const [planned, setPlanned] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn' | 'danger' | 'ai'; text: string } | null>(null);

  /* ---- 弹窗与抽屉 ---- */
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [reviewDrawerId, setReviewDrawerId] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSprintId, setBatchSprintId] = useState<string>('SP-25');
  const [rejectItem, setRejectItem] = useState<ReqPoolItemDef | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  /* ---- 录入需求（新建条目只存在于本页会话，不回写 data-mgmt） ---- */
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<ReqPoolItemDef[]>([]);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aiDraft, setAiDraft] = useState<{ score: number; reason: string; sprintId: string | null } | null>(null);

  /* ---- 矩阵 / 追溯的选中项 ---- */
  const [matrixId, setMatrixId] = useState<string | null>('RP-01');
  const [traceId, setTraceId] = useState<string>('RP-01');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const preset = SCORE_PRESETS.filter((p) => p.id === presetId)[0] ?? SCORE_PRESETS[0];

  /** 落库 20 条 + 本页录入的本地草稿条目 */
  const allPool = useMemo<ReqPoolItemDef[]>(() => [...REQ_POOL, ...created], [created]);

  /** 应用本地覆盖后的需求池 */
  const livePool = useMemo<ReqPoolItemDef[]>(
    () => allPool.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p)),
    [allPool, overrides],
  );

  const poolById = useMemo(() => {
    const acc: Record<string, ReqPoolItemDef> = {};
    livePool.forEach((p) => {
      acc[p.id] = p;
    });
    return acc;
  }, [livePool]);

  /** 生效分值：重新评分后取重算值，否则取落库的 aiPriorityScore */
  const scoreOf = (p: ReqPoolItemDef) => (rescored ? rescored[p.id] ?? p.aiPriorityScore : p.aiPriorityScore);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    allPool.forEach((p) => p.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [allPool]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const rows = livePool.filter((p) => {
      if (kw && !`${p.id} ${p.code} ${p.title} ${p.sourceRef}`.toLowerCase().includes(kw)) return false;
      if (fStage !== 'all' && p.stage !== fStage) return false;
      if (fSource !== 'all' && p.sourceType !== fSource) return false;
      if (sourceFilter !== 'all' && p.sourceType !== sourceFilter) return false;
      if (fSprint !== 'all') {
        const sid = p.aiSuggestedSprintId ?? 'none';
        if (sid !== fSprint) return false;
      }
      if (fTag !== 'all' && p.tags.indexOf(fTag) < 0) return false;
      if (fBand !== 'all') {
        const b = SCORE_BANDS.filter((x) => x.id === fBand)[0];
        if (b && !(scoreOf(p) >= b.min && scoreOf(p) < b.max)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      switch (sort.key) {
        case 'id':
          return a.id.localeCompare(b.id) * dir;
        case 'submittedAt':
          return a.submittedAt.localeCompare(b.submittedAt) * dir;
        case 'stage':
          return (STAGE_META[a.stage].order - STAGE_META[b.stage].order) * dir;
        case 'businessValue':
          return (a.businessValue - b.businessValue) * dir;
        case 'urgency':
          return (a.urgency - b.urgency) * dir;
        case 'riskScore':
          return (a.riskScore - b.riskScore) * dir;
        case 'techComplexity':
          return (a.techComplexity - b.techComplexity) * dir;
        case 'estimatePoints':
          return (a.estimatePoints - b.estimatePoints) * dir;
        default:
          return (scoreOf(a) - scoreOf(b)) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePool, keyword, fStage, fSource, fBand, fSprint, fTag, sourceFilter, sort, rescored]);

  /* ---- 指标卡 ---- */
  const stats = useMemo(() => {
    const count = (fn: (p: ReqPoolItemDef) => boolean) => livePool.filter(fn).length;
    return {
      total: livePool.length,
      pending: count((p) => p.stage === '收集' || p.stage === '评估中'),
      scored: count((p) => p.stage === '已评分' || p.stage === '待排期'),
      inSprint: count((p) => p.stage === '已入迭代'),
      delivered: count((p) => p.stage === '已交付'),
      rejected: count((p) => p.stage === '已拒绝' || p.stage === '已挂起'),
      aiFound: count((p) => p.sourceType === 'AI 主动发现'),
      points: livePool.reduce((s, p) => s + p.estimatePoints, 0),
      avgScore: livePool.reduce((s, p) => s + scoreOf(p), 0) / Math.max(livePool.length, 1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePool, rescored]);

  /* ---- Top5 高分需求 ---- */
  const top5 = useMemo(() => [...livePool].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 5), [livePool, rescored]);

  /* ---- 重新评分 ---- */
  const runRescore = () => {
    const next: Record<string, number> = {};
    let changed = 0;
    let maxDelta = 0;
    let maxDeltaId = '';
    livePool.forEach((p) => {
      const v = computeScore(p, preset);
      next[p.id] = v;
      const d = Math.abs(v - p.aiPriorityScore);
      if (d > 0) {
        changed += 1;
        if (d > maxDelta) {
          maxDelta = d;
          maxDeltaId = p.id;
        }
      }
    });
    setRescored(next);
    if (changed === 0) {
      setFeedback({
        tone: 'ok',
        text: `已按「${preset.name}」重算 ${livePool.length} 条需求的 AI 优先级分：全部与 REQ_POOL.aiPriorityScore 落库值一致（漂移 0 条），说明评分口径未发生偏移，可作为回归校验通过。`,
      });
    } else {
      setFeedback({
        tone: 'warn',
        text: `已按「${preset.name}」重算 ${livePool.length} 条需求：${changed} 条分值发生变化（最大偏移 ${maxDeltaId} ${maxDelta} 分），表格中已用底色标出变化行并重排序；重算结果仅存在于本页会话，不会回写 PingCode，需人工确认后才可提交为新的评分基线。`,
      });
    }
  };

  const resetRescore = () => {
    setRescored(null);
    setFeedback({ tone: 'ai', text: '已恢复为落库基线分（REQ_POOL.aiPriorityScore），并重跑「标准口径」校验。' });
  };

  /* ---- 批量入迭代 ---- */
  const selectableIds = filtered.filter((p) => p.stage !== '已入迭代' && p.stage !== '已交付' && p.stage !== '已拒绝').map((p) => p.id);
  const selectedItems = livePool.filter((p) => selected.has(p.id));
  const selectedPoints = selectedItems.reduce((s, p) => s + p.estimatePoints, 0);
  const targetSprint = SPRINTS.filter((s) => s.id === batchSprintId)[0];
  const batchRemaining = targetSprint ? targetSprint.capacity - targetSprint.committed : 0;
  const batchOverflow = selectedPoints > batchRemaining;

  const confirmBatch = () => {
    if (selectedItems.length === 0) return;
    const next: Record<string, Partial<ReqPoolItemDef>> = { ...overrides };
    selectedItems.forEach((p) => {
      next[p.id] = {
        ...(next[p.id] ?? {}),
        stage: '已入迭代',
        tone: toneOfScore(scoreOf(p), '已入迭代'),
        aiSuggestedSprintId: batchSprintId,
        decidedAt: TODAY,
        decisionNote: `${TODAY} 由需求管理页批量入迭代至 ${batchSprintId}（${targetSprint?.theme ?? ''}）；原阶段「${p.stage}」，AI 优先级分 ${scoreOf(p)}，预估 ${p.estimatePoints} 点。原决策说明：${p.decisionNote || '（无）'}`,
      };
    });
    setOverrides(next);
    setBatchOpen(false);
    setSelected(new Set());
    setFeedback({
      tone: batchOverflow ? 'warn' : 'ok',
      text: batchOverflow
        ? `已把 ${selectedItems.length} 条需求（合计 ${selectedPoints} 点）本地置为「已入迭代」并挂到 ${batchSprintId}；但该迭代剩余产能仅 ${batchRemaining} 点，超出 ${selectedPoints - batchRemaining} 点，需 PMO 在排期甘特页做负载再平衡后才可提交 PingCode。`
        : `已把 ${selectedItems.length} 条需求（合计 ${selectedPoints} 点）本地置为「已入迭代」并挂到 ${batchSprintId}（${targetSprint?.theme ?? ''}），占用剩余产能 ${batchRemaining} 点中的 ${selectedPoints} 点，尚余 ${batchRemaining - selectedPoints} 点缓冲。变更仅存在于本页会话，提交后由 ag-pm 生成 PRD 与验收标准草稿。`,
    });
  };

  /* ---- 拒绝 ---- */
  const confirmReject = () => {
    if (!rejectItem) return;
    const reason = rejectReason.trim() || '未填写理由（按流程要求须补充，本条仅本地标记）';
    setOverrides((prev) => ({
      ...prev,
      [rejectItem.id]: {
        ...(prev[rejectItem.id] ?? {}),
        stage: '已拒绝',
        tone: 'slate',
        decidedAt: TODAY,
        decisionNote: `${TODAY} 需求澄清会决议拒绝。理由：${reason}`,
      },
    }));
    setFeedback({
      tone: 'danger',
      text: `已把 ${rejectItem.id}（${rejectItem.title}）本地置为「已拒绝」，决策日期 ${TODAY}；拒绝理由会同步回写需求池审计流水，并向提出人${rejectItem.submittedBy ? ` ${USER_MAP[rejectItem.submittedBy]?.name ?? rejectItem.submittedBy}` : ` ${rejectItem.externalName}`}发送飞书通知。若后续同类诉求再次达到阈值，可重新提池。`,
    });
    setRejectItem(null);
    setRejectReason('');
  };

  /* ---- 录入需求：表单选项 / 实时预览 / AI 评分 / 提交 ---- */
  const nextSeq = REQ_POOL.length + created.length + 1;
  const nextItemId = `RP-${String(nextSeq).padStart(2, '0')}`;
  const nextItemCode = `PC-POOL-02${String(nextSeq).padStart(2, '0')}`;

  const epicOptions = useMemo(() => {
    const ids: string[] = [];
    allPool.forEach((p) => {
      if (p.epicId && ids.indexOf(p.epicId) < 0) ids.push(p.epicId);
    });
    return ids.map((id) => ({ value: id, label: EPIC_NAME[id] ? `${EPIC_NAME[id]}（${id}）` : id, title: id }));
  }, [allPool]);

  const userOptions = useMemo(
    () => USERS.map((u) => ({ value: u.id, label: `${u.name} · ${u.title}`, title: `${u.dept} · ${u.account}` })),
    [],
  );

  const roleOptions = useMemo(() => ROLES.map((r) => ({ value: r.id, label: r.name, title: r.desc })), []);

  const tagOptions = useMemo(() => allTags.map((t) => ({ value: t, label: t })), [allTags]);

  /** 四维是否齐全且合法（齐全才展示实时分值预览） */
  const dims = [form.businessValue, form.urgency, form.riskScore, form.techComplexity].map((v) => v.trim());
  const dimsReady = dims.every((v) => v !== '' && Number.isFinite(Number(v)));
  const dimNums = dimsReady ? dims.map(Number) : [0, 0, 0, 0];
  const previewRaw = poolScoreRaw(dimNums[0], dimNums[1], dimNums[2], dimNums[3]);
  const previewScore = poolScoreOf(dimNums[0], dimNums[1], dimNums[2], dimNums[3]);
  const previewContribs = scoreContribs(dimNums[0], dimNums[1], dimNums[2], dimNums[3]);

  const setField = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    /* 四维一改，此前的 AI 评分即失效，直接清空要求重新评分 */
    if (key === 'businessValue' || key === 'urgency' || key === 'riskScore' || key === 'techComplexity') {
      setAiDraft(null);
    }
    /* 切换提交人类型后，被隐藏那一侧的报错不再适用 */
    if (key === 'submitterMode') {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.submittedBy;
        delete next.externalName;
        return next;
      });
    }
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setAiDraft(null);
    setCreateOpen(true);
  };

  const closeCreate = () => setCreateOpen(false);

  /** AI 评分：确定性模板，不调用任何随机量 */
  const runAiScore = () => {
    const titleReady = form.title.trim() !== '';
    const dimsInRange = dimNums.every((n) => n >= 1 && n <= 10);
    if (!titleReady || !dimsReady || !dimsInRange) {
      setErrors((prev) => ({
        ...prev,
        ai:
          titleReady && dimsReady
            ? '四维评分须为 1 ~ 10 之间的数值'
            : '请先填写需求标题与四维评分',
      }));
      return;
    }
    const tc = dimNums[3];
    const score = previewScore;
    const dom = previewContribs.reduce((a, b) => (b.value > a.value ? b : a));
    const plannedSprints = SPRINTS.filter((s) => s.status === 'planned');
    let sprintId: string | null = null;
    let tail = '';
    if (score >= 75) {
      sprintId = plannedSprints.length > 0 ? plannedSprints[0].id : null;
    } else if (score >= 50) {
      sprintId = plannedSprints.length > 1 ? plannedSprints[1].id : null;
      if (sprintId === null) tail = '建议进入待排期池，由 PMO 在迭代规划会决策。';
    }
    const reason =
      `${dom.name}为主导维度（贡献 ${fmtNum(dom.value)} 分，占原始分 ${Math.round((dom.value / previewRaw) * 100)}%）。` +
      `「${form.title.trim()}」${SOURCE_JUDGEMENT[form.sourceType as SourceType]}` +
      `${complexityAdvice(tc)}${tail}`;
    setAiDraft({ score, reason, sprintId });
    setErrors((prev) => {
      if (!prev.ai) return prev;
      const next = { ...prev };
      delete next.ai;
      return next;
    });
  };

  const submitCreate = () => {
    const title = form.title.trim();
    const next = cleanErrors({
      title:
        requireText(title, '需求标题') ||
        (title.length < 8 ? '需求标题过短，请说清用户价值与范围' : '') ||
        (allPool.some((p) => p.title === title) ? `池内已存在同名需求「${title}」，请勿重复录入` : ''),
      sourceType: requireText(form.sourceType, '来源类型'),
      sourceRef: requireText(form.sourceRef, '来源单据号或会议名'),
      submittedBy: form.submitterMode === 'inner' && !form.submittedBy ? '请选择提交人' : '',
      externalName:
        form.submitterMode === 'outer' ? requireText(form.externalName, '平台外提交人的姓名与组织') : '',
      businessValue: requireNumber(form.businessValue, '业务价值', 1, 10),
      urgency: requireNumber(form.urgency, '紧急度', 1, 10),
      riskScore: requireNumber(form.riskScore, '风险分', 1, 10),
      techComplexity: requireNumber(form.techComplexity, '技术复杂度', 1, 10),
      estimatePoints: form.estimatePoints.trim() ? requireNumber(form.estimatePoints, '预估故事点', 0, 40) : '',
      ownerRoleId: requireText(form.ownerRoleId, '责任角色'),
      reviewers:
        form.submitterMode === 'inner' && form.submittedBy && form.reviewers.indexOf(form.submittedBy) >= 0
          ? '评审人不得与提交人相同，违反四眼原则'
          : '',
    });
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const stage: PoolStage = aiDraft ? '已评分' : '收集';
    const score = aiDraft ? aiDraft.score : 0;
    const item: ReqPoolItemDef = {
      id: nextItemId,
      code: nextItemCode,
      title,
      sourceType: form.sourceType as SourceType,
      sourceRef: form.sourceRef.trim(),
      submittedBy: form.submitterMode === 'inner' ? form.submittedBy : null,
      externalName: form.submitterMode === 'outer' ? form.externalName.trim() : '',
      submittedAt: TODAY,
      stage,
      businessValue: Number(form.businessValue),
      techComplexity: Number(form.techComplexity),
      riskScore: Number(form.riskScore),
      urgency: Number(form.urgency),
      aiPriorityScore: score,
      aiScoreReason: aiDraft ? aiDraft.reason : '',
      aiSuggestedSprintId: aiDraft ? aiDraft.sprintId : null,
      estimatePoints: Number(form.estimatePoints || 0),
      requirementId: null,
      epicId: form.epicId,
      tags: [...form.tags],
      ownerRoleId: form.ownerRoleId,
      reviewers: [...form.reviewers],
      decisionNote: '',
      decidedAt: '',
      tone: toneOfScore(score, stage),
    };

    setCreated((prev) => [...prev, item]);
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setAiDraft(null);
    setFeedback({
      tone: 'ok',
      text:
        `已录入需求「${item.title}」（${item.code} · ${item.id}），AI 优先级分 ${aiDraft ? aiDraft.score : '尚未评分'}，` +
        `当前阶段「${item.stage}」。该条目为本地草稿态：已计入池内指标与需求池表（共 ${allPool.length + 1} 条），尚未回写 PingCode；` +
        `漏斗与来源分布按 PingCode 已同步的 ${REQ_POOL.length} 条统计，本地录入条目在提交后纳入下一轮同步。`,
    });
  };

  /* ---- 矩阵：象限统计 ---- */
  const quadrantStats = useMemo(
    () =>
      QUADRANTS.map((q) => {
        const rows = livePool.filter(q.test);
        return {
          q,
          count: rows.length,
          share: Math.round((rows.length / Math.max(livePool.length, 1)) * 1000) / 10,
          points: rows.reduce((s, p) => s + p.estimatePoints, 0),
          items: rows,
        };
      }),
    [livePool],
  );

  const hotItems = useMemo(() => livePool.filter((p) => p.urgency >= 7 && p.riskScore >= 7), [livePool]);

  /* ---- AI 组合建议（结合 SPRINTS 的真实产能） ---- */
  const plan = useMemo(() => {
    const sp24 = SPRINTS.filter((s) => s.id === 'SP-24')[0];
    const sp25 = SPRINTS.filter((s) => s.id === 'SP-25')[0];
    const candidates = livePool.filter(
      (p) => p.aiSuggestedSprintId === 'SP-25' && p.stage !== '已挂起' && p.stage !== '已拒绝' && p.stage !== '已入迭代',
    );
    const points = candidates.reduce((s, p) => s + p.estimatePoints, 0);
    const held = livePool.filter((p) => p.stage === '已挂起');
    const deferred = livePool.filter((p) => (p.stage === '已评分' || p.stage === '评估中' || p.stage === '收集') && p.aiSuggestedSprintId === null);
    return {
      sp24,
      sp25,
      candidates,
      points,
      remaining24: sp24 ? sp24.capacity - sp24.committed : 0,
      remaining25: sp25 ? sp25.capacity - sp25.committed : 0,
      committed25: sp25?.committed ?? 0,
      held,
      deferred,
    };
  }, [livePool]);

  /* ---- 评审轮次派生 ---- */
  const reviewStats = useMemo(() => {
    const totalMin = REQ_REVIEWS.reduce((s, r) => s + r.durationMin, 0);
    const questions = REQ_REVIEWS.reduce((s, r) => s + r.aiQuestions.length, 0);
    const roundsByItem: Record<string, ReqReviewRoundDef[]> = {};
    REQ_REVIEWS.forEach((r) => {
      roundsByItem[r.poolItemId] = (roundsByItem[r.poolItemId] ?? []).concat(r);
    });
    /* 当场闭环：本轮结论为通过 / 有条件通过 */
    const onSite = REQ_REVIEWS.filter((r) => r.outcome === '通过' || r.outcome === '有条件通过').reduce(
      (s, r) => s + r.aiQuestions.length,
      0,
    );
    /* 跨轮闭环：非末轮的问题在下一轮预读中确认闭环；末轮按结论判定 */
    const crossRound = REQ_REVIEWS.reduce((s, r) => {
      const list = roundsByItem[r.poolItemId] ?? [];
      const isLast = list[list.length - 1]?.id === r.id;
      const closed = !isLast || r.outcome === '通过' || r.outcome === '有条件通过';
      return s + (closed ? r.aiQuestions.length : 0);
    }, 0);
    const asyncRounds = REQ_REVIEWS.filter((r) => r.mode === '异步');
    const meetRounds = REQ_REVIEWS.filter((r) => r.mode === '会议');
    const up = REQ_REVIEWS.filter((r) => r.scoreAfter > r.scoreBefore).length;
    const down = REQ_REVIEWS.filter((r) => r.scoreAfter < r.scoreBefore).length;
    const absDelta = REQ_REVIEWS.reduce((s, r) => s + Math.abs(r.scoreAfter - r.scoreBefore), 0);
    return {
      totalMin,
      questions,
      onSite,
      crossRound,
      savedMin: questions * MINUTES_PER_QUESTION,
      avgMin: totalMin / Math.max(REQ_REVIEWS.length, 1),
      asyncAvg: asyncRounds.reduce((s, r) => s + r.durationMin, 0) / Math.max(asyncRounds.length, 1),
      meetAvg: meetRounds.reduce((s, r) => s + r.durationMin, 0) / Math.max(meetRounds.length, 1),
      asyncCount: asyncRounds.length,
      meetCount: meetRounds.length,
      up,
      down,
      absAvg: absDelta / Math.max(REQ_REVIEWS.length, 1),
      items: Object.keys(roundsByItem).length,
    };
  }, []);

  /* ---- 追溯 ---- */
  const chains = useMemo(() => livePool.map((p) => buildChain(p)), [livePool]);
  const traceChain = useMemo(() => chains.filter((c) => c.pool.id === traceId)[0] ?? chains[0], [chains, traceId]);
  const traceCandidates = useMemo(
    () => livePool.filter((p) => p.stage === '已入迭代' || p.stage === '已交付'),
    [livePool],
  );

  const traceStats = useMemo(() => {
    const inIteration = chains.filter((c) => c.pool.stage === '已入迭代' || c.pool.stage === '已交付');
    const links = inIteration.reduce(
      (s, c) => s + [c.links.l1, c.links.l2, c.links.l3, c.links.l4].filter(Boolean).length,
      0,
    );
    const total = inIteration.length * 4;
    return {
      scope: inIteration.length,
      links,
      total,
      pct: total > 0 ? Math.round((links / total) * 1000) / 10 : 0,
      l1: inIteration.filter((c) => c.links.l1).length,
      l2: inIteration.filter((c) => c.links.l2).length,
      l3: inIteration.filter((c) => c.links.l3).length,
      l4: inIteration.filter((c) => c.links.l4).length,
      breaks: inIteration.reduce((s, c) => s + c.breaks.length, 0),
    };
  }, [chains]);

  const criticalLowCoverage = useMemo(
    () => TASKS.filter((t) => t.critical && t.type !== '发布' && t.coverage < G3_COVERAGE),
    [],
  );

  /* ---- 交互辅助 ---- */
  const toggleSort = (key: PoolSortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const sortIcon = (key: PoolSortKey) =>
    sort.key === key ? (sort.dir === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />) : <ArrowUpDown size={11} className="ac-rp-sort-idle" />;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === selectableIds.length ? new Set() : new Set(selectableIds)));

  const resetFilters = () => {
    setKeyword('');
    setFStage('all');
    setFSource('all');
    setFBand('all');
    setFSprint('all');
    setFTag('all');
    setSourceFilter('all');
  };

  const drawerItem = drawerId ? poolById[drawerId] ?? null : null;
  const reviewDrawer = reviewDrawerId ? REQ_REVIEWS.filter((r) => r.id === reviewDrawerId)[0] ?? null : null;

  return (
    <div className="ac-rp" data-annotation-id="ai-sdlc-req-pool-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">需求管理</div>
          <div className="ac-page-desc">
            本页负责需求「池」的横向全生命周期治理：收集 → 评估 → 评分 → 排期 → 入迭代 → 交付 / 拒绝，
            管的是 {allPool.length} 条候选需求的来源结构、AI 优先级评分、{REQ_REVIEWS.length} 轮评审、漏斗转化与端到端追溯；
            单条需求进入迭代后的纵向深度作业（Brainstorm → PRD → 评审 → 拆解 → 验收标准）在「需求工作台」完成，两页通过 REQ-24xx 双向衔接。
            贯穿案例为「订单中心重构」（EPIC-ORDER-REF）· Sprint 24，TODAY = {TODAY}。
          </div>
        </div>
        <div className="ac-page-actions">
          <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={openCreate}>
            <Plus size={13} />
            录入需求
          </button>
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            {TODAY}
          </span>
          <span className="ac-tag ac-tag--brand">
            <Boxes size={12} />
            池内 {stats.total} 条 · {stats.points} 点
          </span>
          <span className="ac-tag ac-tag--ai">
            <Sparkles size={12} />
            平均分 {stats.avgScore.toFixed(1)}
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('requirement')}>
            <ArrowRight size={13} />
            进入需求工作台
          </button>
        </div>
      </div>

      {/* ---------- 页签 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          /* pool / matrix 两个页签的 count 原本取静态 REQ_POOL.length，录入后需跟随 allPool */
          const count = t.id === 'pool' || t.id === 'matrix' ? allPool.length : t.count;
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

      {feedback && (
        <div className={`ac-hint ac-hint--${feedback.tone}`}>
          {feedback.tone === 'ok' ? <CircleCheck size={14} /> : feedback.tone === 'danger' ? <CircleX size={14} /> : feedback.tone === 'ai' ? <Sparkles size={14} /> : <TriangleAlert size={14} />}
          <span>{feedback.text}</span>
          <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-rp-fb-close" onClick={() => setFeedback(null)}>
            <CircleX size={12} />
            收起
          </button>
        </div>
      )}

      {/* ================= 1. 需求池 ================= */}
      {tab === 'pool' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--6 ac-rp-metric-row" data-annotation-id="ai-sdlc-req-pool-metrics">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">池内总数</span>
                <span className="ac-metric-icon">
                  <Inbox size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {stats.total}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">预估合计 {stats.points} 点</div>
            </div>

            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">待评估</span>
                <span className="ac-metric-icon">
                  <Search size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {stats.pending}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">收集 {livePool.filter((p) => p.stage === '收集').length} + 评估中 {livePool.filter((p) => p.stage === '评估中').length}</div>
            </div>

            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">已评分待排期</span>
                <span className="ac-metric-icon">
                  <Sigma size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {stats.scored}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">已评分 {livePool.filter((p) => p.stage === '已评分').length} + 待排期 {livePool.filter((p) => p.stage === '待排期').length}</div>
            </div>

            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head">
                <span className="ac-metric-label">已入迭代</span>
                <span className="ac-metric-icon">
                  <Rocket size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {stats.inSprint}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">另有 {stats.delivered} 条已交付（RP-16 随 REL-2401）</div>
            </div>

            <div className="ac-metric ac-metric--danger">
              <div className="ac-metric-head">
                <span className="ac-metric-label">已拒绝 / 已挂起</span>
                <span className="ac-metric-icon">
                  <Ban size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {stats.rejected}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">拒绝 {livePool.filter((p) => p.stage === '已拒绝').length} · 挂起 {livePool.filter((p) => p.stage === '已挂起').length}</div>
            </div>

            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">AI 主动发现</span>
                <span className="ac-metric-icon">
                  <Bot size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {stats.aiFound}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">RP-09 由 ag-ba 从 Prometheus 指标反推</div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-req-pool-stage-flow">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Waypoints size={16} />
                全生命周期阶段流转
              </span>
              <span className="ac-card-subtitle">收集 → 评估 → 评分 → 排期 → 入迭代 → 交付，外加拒绝 / 挂起两个终止分支 · 点击任一阶段可快速筛选下方台账</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  在途 {livePool.filter((p) => STAGE_META[p.stage].order <= 4).length} 条
                </span>
                <span className="ac-tag ac-tag--ok">
                  已落地 {livePool.filter((p) => p.stage === '已入迭代' || p.stage === '已交付').length} 条
                </span>
                {fStage !== 'all' && (
                  <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setFStage('all')}>
                    <CircleX size={12} />
                    取消阶段筛选
                  </button>
                )}
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-rp-stageflow">
                {STAGES.filter((s) => STAGE_META[s].order <= 6).map((s, i) => {
                  const rows = livePool.filter((p) => p.stage === s);
                  const pts = rows.reduce((a, p) => a + p.estimatePoints, 0);
                  const hex = TONE_HEX[STAGE_META[s].tone] ?? TONE_HEX.neutral;
                  const active = fStage === s;
                  return (
                    <React.Fragment key={s}>
                      <button
                        type="button"
                        className={active ? 'ac-rp-stage ac-rp-stage--active' : 'ac-rp-stage'}
                        style={{ borderTopColor: hex }}
                        onClick={() => setFStage(active ? 'all' : s)}
                      >
                        <span className="ac-rp-stage-name">{s}</span>
                        <span className="ac-rp-stage-count" style={{ color: hex }}>
                          {rows.length}
                          <i>条</i>
                        </span>
                        <span className="ac-rp-stage-pts">{pts} 点</span>
                        <span className="ac-rp-stage-bar">
                          <i style={{ width: `${(rows.length / Math.max(livePool.length, 1)) * 100}%`, background: hex }} />
                        </span>
                      </button>
                      {i < 5 && <ArrowRight size={13} className="ac-rp-stage-arrow" />}
                    </React.Fragment>
                  );
                })}
                <span className="ac-rp-stageflow-sep" />
                <span className="ac-rp-stageflow-end">
                  <span className="ac-xs ac-muted">终止分支</span>
                  {STAGES.filter((s) => STAGE_META[s].order >= 7).map((s) => {
                    const rows = livePool.filter((p) => p.stage === s);
                    const hex = TONE_HEX[STAGE_META[s].tone] ?? TONE_HEX.neutral;
                    const active = fStage === s;
                    return (
                      <button
                        type="button"
                        key={s}
                        className={active ? 'ac-rp-stage ac-rp-stage--end ac-rp-stage--active' : 'ac-rp-stage ac-rp-stage--end'}
                        style={{ borderTopColor: hex }}
                        onClick={() => setFStage(active ? 'all' : s)}
                      >
                        <span className="ac-rp-stage-name">{s}</span>
                        <span className="ac-rp-stage-count" style={{ color: hex }}>
                          {rows.length}
                          <i>条</i>
                        </span>
                        <span className="ac-rp-stage-pts">{rows.map((p) => p.id).join(' / ') || '—'}</span>
                      </button>
                    );
                  })}
                </span>
              </div>
              <div className="ac-hint">
                <Sigma size={14} />
                <span>
                  阶段口径与 REQ_FUNNEL 的「累计到达」严格对账：收集 20 → 评估 18 → 评分 16 → 排期 11 → 入迭代 9 → 交付 1。
                  本页阶段筛选基于 REQ_POOL.stage 的 8 个原子值，漏斗页会把「已拒绝 / 已挂起」合并为「流失」分组（3 条），
                  因此漏斗的排期环节流失 5 条 = 已评分 2 + 已拒绝 2 + 已挂起 1。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-req-pool-table">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                需求池台账
              </span>
              <span className="ac-card-subtitle">15 列 · 多维筛选 · 任意列排序 · 点击行查看完整详情与 AI 打分依据</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">命中 {filtered.length} / {livePool.length} 条</span>
                {selected.size > 0 && (
                  <span className="ac-tag ac-tag--brand">
                    已选 {selected.size} 条 · {selectedPoints} 点
                  </span>
                )}
                <button
                  type="button"
                  className="ac-btn ac-btn--primary ac-btn--sm"
                  disabled={selected.size === 0}
                  onClick={() => setBatchOpen(true)}
                >
                  <Rocket size={13} />
                  批量入迭代
                </button>
              </div>
            </div>

            <div className="ac-filter-bar">
              <Search size={14} className="ac-muted" />
              <input
                className="ac-input ac-rp-search"
                placeholder="搜索编号 / 标题 / 来源单据（如 RP-07、幂等、BLOCK）"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <span className="ac-divider-v" />
              <SlidersHorizontal size={14} className="ac-muted" />
              <select className="ac-select ac-select--sm" value={fStage} onChange={(e) => setFStage(e.target.value)} aria-label="阶段">
                <option value="all">全部阶段（{STAGES.length}）</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}（{livePool.filter((p) => p.stage === s).length}）
                  </option>
                ))}
              </select>
              <select className="ac-select ac-select--sm" value={fSource} onChange={(e) => setFSource(e.target.value)} aria-label="来源类型">
                <option value="all">全部来源（{SOURCE_TYPES.length}）</option>
                {SOURCE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}（{livePool.filter((p) => p.sourceType === s).length}）
                  </option>
                ))}
              </select>
              <select className="ac-select ac-select--sm" value={fBand} onChange={(e) => setFBand(e.target.value)} aria-label="评分区间">
                <option value="all">全部评分区间</option>
                {SCORE_BANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <select className="ac-select ac-select--sm" value={fSprint} onChange={(e) => setFSprint(e.target.value)} aria-label="建议迭代">
                <option value="all">全部建议迭代</option>
                {SPRINTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.theme}（{livePool.filter((p) => p.aiSuggestedSprintId === s.id).length}）
                  </option>
                ))}
                <option value="none">不建议排期（{livePool.filter((p) => p.aiSuggestedSprintId === null).length}）</option>
              </select>
              <select className="ac-select ac-select--sm" value={fTag} onChange={(e) => setFTag(e.target.value)} aria-label="标签">
                <option value="all">全部标签（{allTags.length}）</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}（{livePool.filter((p) => p.tags.indexOf(t) >= 0).length}）
                  </option>
                ))}
              </select>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={resetFilters}>
                <RefreshCw size={12} />
                重置
              </button>
              {sourceFilter !== 'all' && (
                <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={() => setSourceFilter('all')}>
                  <CircleX size={12} />
                  来源联动筛选：{sourceFilter}
                </button>
              )}
            </div>

            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th className="ac-rp-th-check">
                        <input
                          type="checkbox"
                          checked={selectableIds.length > 0 && selected.size === selectableIds.length}
                          onChange={toggleAll}
                          aria-label="全选可入迭代条目"
                        />
                      </th>
                      <th className="ac-rp-sortable" onClick={() => toggleSort('id')}>
                        编号 {sortIcon('id')}
                      </th>
                      <th>标题</th>
                      <th>来源</th>
                      <th>提出人</th>
                      <th className="ac-rp-sortable" onClick={() => toggleSort('submittedAt')}>
                        提出时间 {sortIcon('submittedAt')}
                      </th>
                      <th className="ac-rp-sortable" onClick={() => toggleSort('stage')}>
                        阶段 {sortIcon('stage')}
                      </th>
                      <th className="ac-td-right ac-rp-sortable" onClick={() => toggleSort('businessValue')}>
                        业务价值 {sortIcon('businessValue')}
                      </th>
                      <th className="ac-td-right ac-rp-sortable" onClick={() => toggleSort('urgency')}>
                        紧急度 {sortIcon('urgency')}
                      </th>
                      <th className="ac-td-right ac-rp-sortable" onClick={() => toggleSort('riskScore')}>
                        风险 {sortIcon('riskScore')}
                      </th>
                      <th className="ac-td-right ac-rp-sortable" onClick={() => toggleSort('techComplexity')}>
                        技术复杂度 {sortIcon('techComplexity')}
                      </th>
                      <th className="ac-td-right ac-rp-sortable" onClick={() => toggleSort('score')}>
                        AI 优先级评分 {sortIcon('score')}
                      </th>
                      <th>建议迭代</th>
                      <th className="ac-td-right ac-rp-sortable" onClick={() => toggleSort('estimatePoints')}>
                        预估点数 {sortIcon('estimatePoints')}
                      </th>
                      <th>关联需求</th>
                      <th>决策说明</th>
                      <th>负责角色</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const score = scoreOf(p);
                      const base = p.aiPriorityScore;
                      const changed = rescored !== null && score !== base;
                      const band = bandOf(score);
                      const submitter = p.submittedBy ? USER_MAP[p.submittedBy] : null;
                      const role = ROLE_MAP[p.ownerRoleId];
                      const plannedHere = planned.indexOf(p.id) >= 0;
                      return (
                        <tr
                          key={p.id}
                          className={
                            (changed ? 'ac-rp-row--changed ' : '') +
                            (selected.has(p.id) ? 'ac-rp-row ac-table-row--selected' : 'ac-rp-row')
                          }
                          onClick={() => setDrawerId(p.id)}
                          title="点击查看完整详情与 AI 打分依据"
                        >
                          <td className="ac-rp-th-check" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={() => toggleSelect(p.id)}
                              disabled={p.stage === '已入迭代' || p.stage === '已交付' || p.stage === '已拒绝'}
                              aria-label={`选择 ${p.id}`}
                            />
                          </td>
                          <td>
                            <div className="ac-mono ac-brand-text ac-semi">{p.id}</div>
                            <span className="ac-xs ac-muted ac-mono">{p.code}</span>
                          </td>
                          <td>
                            <div className="ac-rp-title">{p.title}</div>
                            <span className="ac-rp-tags">
                              {created.some((c) => c.id === p.id) && (
                                <span className="ac-tag ac-tag--sm ac-tag--ai">新建 · 待同步</span>
                              )}
                              {p.tags.slice(0, 3).map((t) => (
                                <span key={t} className="ac-tag ac-tag--sm ac-tag--outline">
                                  {t}
                                </span>
                              ))}
                              {p.tags.length > 3 && <span className="ac-tag ac-tag--sm ac-tag--outline">+{p.tags.length - 3}</span>}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[SOURCE_TONE[p.sourceType] ?? 'neutral']}`}>
                              {p.sourceType}
                            </span>
                            <div className="ac-xs ac-muted ac-rp-source-ref">{p.sourceRef}</div>
                          </td>
                          <td>
                            {submitter ? (
                              <span className="ac-user">
                                <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[submitter.avatarColor]}`}>{submitter.initial}</span>
                                <span className="ac-user-name">{submitter.name}</span>
                              </span>
                            ) : (
                              <span className="ac-rp-external">
                                <CircleDot size={11} className="ac-muted" />
                                {p.externalName}
                              </span>
                            )}
                            {submitter?.isAi && (
                              <span className="ac-tag ac-tag--sm ac-tag--ai ac-rp-ai-badge">
                                <Sparkles size={9} />
                                AI 账号
                              </span>
                            )}
                          </td>
                          <td className="ac-td-num ac-xs">{p.submittedAt}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STAGE_META[p.stage].tone]}`}>{p.stage}</span>
                            {plannedHere && (
                              <span className="ac-tag ac-tag--sm ac-tag--ai ac-rp-ai-badge">
                                <Check size={9} />
                                已生成计划
                              </span>
                            )}
                          </td>
                          <td className="ac-td-num">{p.businessValue}</td>
                          <td className="ac-td-num">{p.urgency}</td>
                          <td className="ac-td-num">
                            <span className={p.riskScore >= 8 ? 'ac-danger-text ac-semi' : p.riskScore >= 6 ? 'ac-warn-text' : ''}>
                              {p.riskScore}
                            </span>
                          </td>
                          <td className="ac-td-num">{p.techComplexity}</td>
                          <td className="ac-td-right">
                            <span className="ac-rp-score" title={p.aiScoreReason}>
                              <b className={TEXT_TONE[toneOfScore(score, p.stage)]}>{score}</b>
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[band.tone]}`}>{band.label.split('（')[0]}</span>
                              {changed && (
                                <span className={`ac-xs ${score > base ? 'ac-ok-text' : 'ac-danger-text'}`}>
                                  （原 {base}，{score > base ? '+' : ''}
                                  {score - base}）
                                </span>
                              )}
                            </span>
                          </td>
                          <td>
                            {p.aiSuggestedSprintId ? (
                              <span className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{p.aiSuggestedSprintId}</span>
                            ) : (
                              <span className="ac-xs ac-muted">不建议排期</span>
                            )}
                          </td>
                          <td className="ac-td-num">{p.estimatePoints > 0 ? p.estimatePoints : '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {p.requirementId ? (
                              <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-mono" onClick={() => jump('requirement')}>
                                <Link2 size={11} />
                                {p.requirementId}
                              </button>
                            ) : (
                              <span className="ac-xs ac-muted">未关联</span>
                            )}
                          </td>
                          <td className="ac-rp-decision">
                            {p.decisionNote ? (
                              <>
                                <span className="ac-xs ac-muted ac-mono">{p.decidedAt}</span>
                                <span className="ac-rp-decision-text">{p.decisionNote}</span>
                              </>
                            ) : (
                              <span className="ac-xs ac-muted">尚未决策</span>
                            )}
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[role?.tagTone ?? 'neutral']}`}>{role?.short ?? p.ownerRoleId}</span>
                          </td>
                          <td className="ac-td-right" onClick={(e) => e.stopPropagation()}>
                            <span className="ac-row ac-gap-1">
                              <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setDrawerId(p.id)}>
                                详情
                                <ChevronRight size={12} />
                              </button>
                              <button
                                type="button"
                                className="ac-btn ac-btn--text ac-btn--sm ac-danger-text"
                                disabled={p.stage === '已拒绝'}
                                onClick={() => {
                                  setRejectItem(p);
                                  setRejectReason('');
                                }}
                              >
                                <Ban size={12} />
                                拒绝
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={18}>
                          <div className="ac-empty">
                            <span className="ac-empty-icon">
                              <Search size={22} />
                            </span>
                            <span className="ac-empty-title">没有符合条件的需求池条目</span>
                            <span className="ac-empty-desc">
                              当前筛选组合命中 0 条。可尝试放宽评分区间或清除关键字；池内共 {livePool.length} 条候选需求。
                            </span>
                            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={resetFilters}>
                              <RefreshCw size={12} />
                              重置全部筛选
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <ShieldCheck size={14} />
                <span>
                  表头点击可切换排序方向；复选框仅对「非已入迭代 / 非已交付 / 非已拒绝」的条目可用。
                  AI 评分列悬浮可查看完整的 aiScoreReason；「批量入迭代」与「拒绝」均为本地乐观更新，不会写回 PingCode。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 优先级评分</div>
          <div className="ac-grid-2-1" data-annotation-id="ai-sdlc-req-pool-ai-score">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sigma size={16} />
                  评分公式与口径
                </span>
                <span className="ac-card-subtitle">data-mgmt 文件头 A 节定义的落库口径，可在本页切换预设重新计算</span>
                <div className="ac-card-extra">
                  <span className={`ac-tag ac-tag--sm ${rescored ? 'ac-tag--ai' : 'ac-tag--outline'}`}>
                    {rescored ? `已按「${preset.name}」重算` : '当前展示落库基线分'}
                  </span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-tabs ac-tabs--pill ac-rp-preset-tabs">
                  {SCORE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`ac-tab ${presetId === p.id ? 'ac-tab--active' : ''}`}
                      onClick={() => setPresetId(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                <div className="ac-code ac-code--light ac-mt-3">
                  <div className="ac-code-head">
                    <span className="ac-code-title">aiPriorityScore · {preset.name}</span>
                    <span className="ac-code-lang">formula</span>
                  </div>
                  <pre className="ac-code-body">{formulaText(preset)}</pre>
                </div>

                <div className="ac-rp-weight-grid">
                  {[
                    { label: '业务价值 businessValue', w: preset.weights.bv, tone: TONE_HEX.brand },
                    { label: '紧急度 urgency', w: preset.weights.urg, tone: TONE_HEX.ai },
                    { label: '风险 riskScore', w: preset.weights.risk, tone: TONE_HEX.danger },
                    { label: '实现难度反向 (11 − techComplexity)', w: preset.weights.inv, tone: TONE_HEX.ok },
                  ].map((row) => (
                    <div className="ac-rp-weight-row" key={row.label}>
                      <span className="ac-rp-weight-name">{row.label}</span>
                      <span className="ac-rp-weight-track">
                        <span className="ac-rp-weight-fill" style={{ width: `${row.w * 100 * 2}%`, background: row.tone }} />
                      </span>
                      <span className="ac-rp-weight-pct">{(row.w * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>

                <div className="ac-rp-score-actions">
                  <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={runRescore}>
                    <Sparkles size={13} />
                    AI 重新评分（{preset.name}）
                  </button>
                  <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={resetRescore} disabled={rescored === null}>
                    <RefreshCw size={13} />
                    恢复落库基线
                  </button>
                  <span className="ac-xs ac-muted">
                    分档规则：已拒绝 → slate；已交付 → ok；否则 ≥80 → P0，65~79 → P1，45~64 → P2，&lt;45 → 观察级
                  </span>
                </div>
                <div className="ac-hint ac-hint--ai">
                  <Bot size={14} />
                  <span>
                    AI 做了什么：ag-pm 读取每条需求的业务价值 / 紧急度 / 风险 / 技术复杂度四项 1~10 的输入（由 ag-ba 从来源单据、
                    事故复盘、可观测指标与代码索引中量化得出），按上述加权公式给出 10~100 的优先级分与 aiScoreReason 文字依据，
                    并推荐 aiSuggestedSprintId。人工如何介入：四项输入可在详情抽屉中逐条修正，修正后点击「AI 重新评分」即本地重算；
                    切换口径预设可模拟不同业务情境下的排序变化，但只有人工确认后的结果才允许提交为新的评分基线。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Flame size={16} />
                  Top 5 高分需求
                </span>
                <span className="ac-card-subtitle">按当前生效分值排序</span>
              </div>
              <div className="ac-card-body ac-rp-top5">
                {top5.map((p, i) => (
                  <button type="button" className="ac-rp-top5-item" key={p.id} onClick={() => setDrawerId(p.id)}>
                    <span className="ac-rp-top5-rank">{i + 1}</span>
                    <span className="ac-rp-top5-body">
                      <span className="ac-rp-top5-head">
                        <span className="ac-mono ac-xs ac-brand-text">{p.id}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STAGE_META[p.stage].tone]}`}>{p.stage}</span>
                        <span className={`ac-rp-top5-score ${TEXT_TONE[toneOfScore(scoreOf(p), p.stage)]}`}>{scoreOf(p)}</span>
                      </span>
                      <span className="ac-rp-top5-title">{p.title}</span>
                      <span className="ac-rp-top5-reason">{p.aiScoreReason}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 2. 价值成本矩阵 ================= */}
      {tab === 'matrix' && (
        <div data-annotation-id="ai-sdlc-req-pool-matrix">
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Crosshair size={16} />
                价值 / 成本四象限
              </span>
              <span className="ac-card-subtitle">X = 技术复杂度（成本）· Y = 业务价值（收益）· 气泡大小 = 预估故事点 · 颜色 = 当前阶段</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">{livePool.length} 条全部 plotted</span>
                {matrixId && <span className="ac-tag ac-tag--brand">已选 {matrixId}</span>}
              </div>
            </div>
            <div className="ac-card-body">
              <ValueCostScatter items={livePool} selectedId={matrixId} onPick={(id) => { setMatrixId(id); setDrawerId(id); }} />
            </div>
            <div className="ac-card-foot">
              <div className="ac-legend ac-rp-legend">
                {STAGES.map((s) => (
                  <span className="ac-legend-item" key={s}>
                    <span className="ac-legend-swatch" style={{ background: TONE_HEX[STAGE_META[s].tone] }} />
                    {s}
                    <span className="ac-legend-value">{livePool.filter((p) => p.stage === s).length}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="ac-metric-grid ac-metric-grid--4">
            {quadrantStats.map((qs) => (
              <div className={`ac-metric ${qs.q.tone === 'ok' ? 'ac-metric--ok' : qs.q.tone === 'danger' ? 'ac-metric--danger' : qs.q.tone === 'brand' ? '' : 'ac-metric--info'}`} key={qs.q.id}>
                <div className="ac-metric-head">
                  <span className="ac-metric-label">{qs.q.name}</span>
                  <span className="ac-metric-icon">
                    <Target size={14} />
                  </span>
                </div>
                <div className="ac-metric-value">
                  {qs.count}
                  <span className="ac-metric-unit">条 · {qs.share}%</span>
                </div>
                <div className="ac-metric-foot">
                  {qs.q.desc} · 合计 {qs.points} 点
                </div>
                <div className="ac-rp-quad-items">
                  {qs.items.slice(0, 6).map((it) => (
                    <button type="button" className="ac-tag ac-tag--sm ac-tag--outline ac-rp-quad-chip" key={it.id} onClick={() => { setMatrixId(it.id); setDrawerId(it.id); }}>
                      {it.id} · {scoreOf(it)}
                    </button>
                  ))}
                  {qs.items.length > 6 && <span className="ac-tag ac-tag--sm ac-tag--outline">+{qs.items.length - 6}</span>}
                  {qs.items.length === 0 && <span className="ac-xs ac-muted">本象限暂无条目</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="ac-grid-1-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Siren size={16} />
                  紧急度 × 风险
                </span>
                <span className="ac-card-subtitle">第二视角：识别需优先澄清的条目</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--sm ac-tag--danger">高紧急高风险 {hotItems.length} 条</span>
                </div>
              </div>
              <div className="ac-card-body">
                <UrgencyRiskBubble items={livePool} onPick={(id) => { setMatrixId(id); setDrawerId(id); }} />
                <div className="ac-hint ac-hint--danger">
                  <Flame size={14} />
                  <span>
                    <b>需优先澄清（urgency ≥ 7 且 riskScore ≥ 7）：</b>
                    {hotItems.map((p) => `${p.id}（紧急 ${p.urgency} / 风险 ${p.riskScore}，${p.estimatePoints} 点）`).join('、')}。
                    这 {hotItems.length} 条合计 {hotItems.reduce((s, p) => s + p.estimatePoints, 0)} 点，占池内总点数{' '}
                    {Math.round((hotItems.reduce((s, p) => s + p.estimatePoints, 0) / Math.max(stats.points, 1)) * 100)}%，
                    其中 5 条已入 SP-24、RP-09 待排期至 SP-25；它们的共同点是「风险已实证发生」（资损 37 万元、BUG-1043 尾差、缓存穿透超 AC1 上限），
                    建议在需求澄清会（CER-03，每周三 14:00）上作为固定第一议题逐条过审。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sparkles size={16} />
                  AI 组合建议 · SP-25 排期方案
                </span>
                <span className="ac-card-subtitle">结合 SPRINTS 的真实产能与已承诺点数给出可执行的纳入清单</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--sm ac-tag--ai">ag-pm + ag-ba</span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-rp-capacity">
                  <div className="ac-rp-cap">
                    <span className="ac-rp-cap-name">SP-24 · {plan.sp24?.theme}</span>
                    <span className="ac-progress">
                      <span className="ac-progress-bar ac-progress-bar--warn" style={{ width: `${Math.round(((plan.sp24?.committed ?? 0) / Math.max(plan.sp24?.capacity ?? 1, 1)) * 100)}%` }} />
                    </span>
                    <span className="ac-xs ac-muted">
                      承诺 {plan.sp24?.committed} / 产能 {plan.sp24?.capacity} 点 · 剩余 {plan.remaining24} 点 · 时间进度已过 69%
                    </span>
                  </div>
                  <div className="ac-rp-cap">
                    <span className="ac-rp-cap-name">SP-25 · {plan.sp25?.theme}</span>
                    <span className="ac-progress">
                      <span className="ac-progress-bar ac-progress-bar--info" style={{ width: `${Math.round(((plan.sp25?.committed ?? 0) / Math.max(plan.sp25?.capacity ?? 1, 1)) * 100)}%` }} />
                    </span>
                    <span className="ac-xs ac-muted">
                      已承诺 {plan.committed25} / 产能 {plan.sp25?.capacity} 点 · 剩余 {plan.remaining25} 点
                    </span>
                  </div>
                </div>

                <div className="ac-ai-block">
                  <div className="ac-ai-block-title">
                    <Sparkles size={14} />
                    建议纳入 SP-25 的 {plan.candidates.length} 条（合计 {plan.points} 点）
                  </div>
                  <ul className="ac-rp-plan-list">
                    {plan.candidates
                      .slice()
                      .sort((a, b) => scoreOf(b) - scoreOf(a))
                      .map((p) => (
                        <li key={p.id}>
                          <span className="ac-mono ac-xs ac-brand-text">{p.id}</span>
                          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[bandOf(scoreOf(p)).tone]}`}>{scoreOf(p)} 分</span>
                          <span className="ac-rp-plan-title">{p.title}</span>
                          <span className="ac-xs ac-muted">{p.estimatePoints} 点 · {p.stage}</span>
                        </li>
                      ))}
                  </ul>
                  <div className="ac-mt-2">
                    纳入后 SP-25 承诺 {plan.committed25 + plan.points} 点 / 产能 {plan.sp25?.capacity} 点（
                    {Math.round(((plan.committed25 + plan.points) / Math.max(plan.sp25?.capacity ?? 1, 1)) * 100)}%），
                    尚余 {Math.max(0, plan.remaining25 - plan.points)} 点缓冲，<b>不超产能</b>；
                    而 SP-24 剩余仅 {plan.remaining24} 点且已过 69% 时间进度，AI 明确建议<b>不再向 SP-24 插入任何新需求</b>，
                    以免进一步压低其 67.7% 的组织承诺达成率。
                  </div>
                </div>

                <div className="ac-rp-plan-notes">
                  <div className="ac-hint ac-hint--warn">
                    <TriangleAlert size={14} />
                    <span>
                      <b>不纳入（挂起）：</b>
                      {plan.held.map((p) => `${p.id}（${p.estimatePoints} 点）`).join('、') || '无'} —— RP-19 的两个硬前置未就绪：
                      抖音开放平台沙箱账号预计 2026-05 下发、WMS 履约回调协议冻结进度 0/3（PR-04），此时排期无法给出可信估算，挂起至 SP-26 重评。
                    </span>
                  </div>
                  <div className="ac-hint">
                    <Compass size={14} />
                    <span>
                      <b>延后到 v3.0 全量之后：</b>
                      {plan.deferred.map((p) => `${p.id}（${scoreOf(p)} 分 / ${p.estimatePoints} 点）`).join('、') || '无'} ——
                      RP-12（3 个上帝类拆分，21 点）需要独立迭代窗口且业务价值仅 4；RP-15（多币种结算，34 点）不应与 SP-24 的金额精度改造并行以避免相互污染；
                      RP-11 / RP-20 仍处收集阶段，前者需先补齐批量改价的审批流设计，后者与 REQ-2404 的容量方案存在设计耦合，需待 rc1 稳定后再评估。
                    </span>
                  </div>
                  <div className="ac-hint ac-hint--ok">
                    <CircleCheck size={14} />
                    <span>
                      <b>速赢优先：</b>
                      {quadrantStats.filter((q) => q.q.id === 'quick')[0]?.items.map((p) => p.id).join('、')} 共{' '}
                      {quadrantStats.filter((q) => q.q.id === 'quick')[0]?.points} 点位于「速赢」象限（高价值低成本），
                      其中 RP-08（合规脱敏，5 点）因可直接接入 SEC-MASK-2.1 属「低成本高确定性」条目，AI 建议优先安排而非顺延。
                    </span>
                  </div>
                </div>

                <div className="ac-rp-plan-actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ai ac-btn--sm"
                    onClick={() => {
                      setPlanned(plan.candidates.map((p) => p.id));
                      setFeedback({
                        tone: 'ok',
                        text: `已按 AI 组合建议生成 SP-25 迭代计划草案：纳入 ${plan.candidates.length} 条需求（${plan.candidates.map((p) => p.id).join('、')}）合计 ${plan.points} 点，SP-25 承诺由 ${plan.committed25} 点增至 ${plan.committed25 + plan.points} 点（产能 ${plan.sp25?.capacity} 点，占用 ${Math.round(((plan.committed25 + plan.points) / Math.max(plan.sp25?.capacity ?? 1, 1)) * 100)}%）。草案已在本页标记「已生成计划」，需 PMO 在排期甘特页确认负载后再提交 PingCode。`,
                      });
                    }}
                    disabled={planned.length > 0}
                  >
                    {planned.length > 0 ? <Check size={13} /> : <Rocket size={13} />}
                    {planned.length > 0 ? '已生成 SP-25 计划草案' : '采纳生成迭代计划'}
                  </button>
                  <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('schedule')}>
                    <Waypoints size={13} />
                    去排期甘特核对负载
                  </button>
                  <span className="ac-xs ac-muted">
                    依据：SPRINTS.SP-24（capacity {plan.sp24?.capacity} / committed {plan.sp24?.committed}）、SPRINTS.SP-25（capacity {plan.sp25?.capacity} / committed {plan.sp25?.committed}）
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 3. 评审轮次 ================= */}
      {tab === 'review' && (
        <div data-annotation-id="ai-sdlc-req-pool-review">
          <div className="ac-metric-grid ac-metric-grid--4 ac-rp-metric-row">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">评审轮次 / 覆盖条目</span>
                <span className="ac-metric-icon">
                  <ClipboardList size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {REQ_REVIEWS.length}
                <span className="ac-metric-unit">轮 / {reviewStats.items} 条</span>
              </div>
              <div className="ac-metric-foot">RP-01 与 RP-07 各经历 2 轮</div>
            </div>
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">AI 预读节省人工查证</span>
                <span className="ac-metric-icon">
                  <Timer size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {(reviewStats.savedMin / 60).toFixed(1)}
                <span className="ac-metric-unit">小时</span>
              </div>
              <div className="ac-metric-foot">
                {reviewStats.questions} 个澄清问题 × {MINUTES_PER_QUESTION} 分钟/问
              </div>
            </div>
            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head">
                <span className="ac-metric-label">AI 问题闭环率</span>
                <span className="ac-metric-icon">
                  <CircleCheck size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {Math.round((reviewStats.crossRound / Math.max(reviewStats.questions, 1)) * 1000) / 10}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">
                跨轮口径 {reviewStats.crossRound}/{reviewStats.questions} · 当场口径 {Math.round((reviewStats.onSite / Math.max(reviewStats.questions, 1)) * 1000) / 10}%
              </div>
            </div>
            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">异步评审提效</span>
                <span className="ac-metric-icon">
                  <Percent size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {Math.round((1 - reviewStats.asyncAvg / Math.max(reviewStats.meetAvg, 1)) * 100)}
                <span className="ac-metric-unit">% 时长压缩</span>
              </div>
              <div className="ac-metric-foot">
                异步 {reviewStats.asyncCount} 轮均 {reviewStats.asyncAvg.toFixed(1)}min vs 会议 {reviewStats.meetCount} 轮均 {reviewStats.meetAvg.toFixed(1)}min
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                评审轮次记录
              </span>
              <span className="ac-card-subtitle">12 列 · 点击行查看 AI 会前预读摘要、澄清问题清单与决议条件</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">总时长 {(reviewStats.totalMin / 60).toFixed(1)} 小时</span>
                <span className="ac-tag ac-tag--ok">上调 {reviewStats.up} 轮</span>
                <span className="ac-tag ac-tag--danger">下调 {reviewStats.down} 轮</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>轮次编号</th>
                      <th>需求（池条目）</th>
                      <th className="ac-td-right">轮次</th>
                      <th>时间</th>
                      <th>形式</th>
                      <th>主持人</th>
                      <th>参与人</th>
                      <th>结论</th>
                      <th className="ac-td-right">评分前 → 后</th>
                      <th className="ac-td-right">变化</th>
                      <th className="ac-td-right">时长</th>
                      <th className="ac-td-right">条件数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REQ_REVIEWS.map((r) => {
                      const pool = poolById[r.poolItemId] ?? REQ_POOL_MAP[r.poolItemId];
                      const chair = USER_MAP[r.chairId];
                      const delta = r.scoreAfter - r.scoreBefore;
                      return (
                        <tr key={r.id} className="ac-rp-row" onClick={() => setReviewDrawerId(r.id)} title="点击查看 AI 预读摘要与澄清问题">
                          <td className="ac-mono ac-brand-text">{r.id}</td>
                          <td>
                            <div className="ac-rp-title">
                              <span className="ac-mono ac-xs ac-brand-text">{r.poolItemId}</span> {pool?.title ?? '—'}
                            </div>
                            <span className="ac-xs ac-muted ac-mono">{pool?.code ?? ''}</span>
                          </td>
                          <td className="ac-td-num">第 {r.round} 轮</td>
                          <td className="ac-mono ac-xs ac-text-2 ac-nowrap">{r.heldAt}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${r.mode === '会议' ? 'info' : 'neutral'}`}>{r.mode}</span>
                          </td>
                          <td>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[chair?.avatarColor ?? 'brand']}`}>{chair?.initial ?? '—'}</span>
                              <span className="ac-user-name">{chair?.name ?? r.chairId}</span>
                            </span>
                          </td>
                          <td>
                            <span className="ac-avatar-group">
                              {r.attendeeIds.slice(0, 5).map((uid) => (
                                <span key={uid} className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[USER_MAP[uid]?.avatarColor ?? 'brand']}`} title={USER_MAP[uid]?.name ?? uid}>
                                  {USER_MAP[uid]?.initial ?? '?'}
                                </span>
                              ))}
                              {r.attendeeIds.length > 5 && <span className="ac-avatar-more">+{r.attendeeIds.length - 5}</span>}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[OUTCOME_TONE[r.outcome]]}`}>{r.outcome}</span>
                          </td>
                          <td className="ac-td-right">
                            <span className="ac-rp-scoreflow">
                              <span className="ac-muted">{r.scoreBefore}</span>
                              <ArrowRight size={11} className={delta >= 0 ? 'ac-ok-text' : 'ac-danger-text'} />
                              <b className={delta >= 0 ? 'ac-ok-text' : 'ac-danger-text'}>{r.scoreAfter}</b>
                            </span>
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-rp-delta ${delta >= 0 ? 'ac-ok-text' : 'ac-danger-text'}`}>
                              {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              {delta > 0 ? '+' : ''}
                              {delta}
                            </span>
                          </td>
                          <td className="ac-td-num">{r.durationMin}min</td>
                          <td className="ac-td-num">
                            {r.conditions.length > 0 ? (
                              <span className="ac-tag ac-tag--sm ac-tag--warn">{r.conditions.length} 条</span>
                            ) : (
                              <span className="ac-muted">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Scale size={16} />
                  评分变化哑铃图
                </span>
                <span className="ac-card-subtitle">10 轮评审的 scoreBefore → scoreAfter · 点击行打开评审详情</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">平均绝对变化 {reviewStats.absAvg.toFixed(1)} 分</span>
                </div>
              </div>
              <div className="ac-card-body">
                <DumbbellChart onPick={setReviewDrawerId} />
              </div>
              <div className="ac-card-foot">
                <div className="ac-hint ac-hint--ai">
                  <Sparkles size={14} />
                  <span>
                    最大下调为 RPR-08（RP-18 Kotlin 全量改写，41 → 17，−24 分）：AI 预读统计出 12.4 万行 Java、SonarQube 218 条规则与
                    ag-review 规约库均不覆盖 Kotlin，且提案未附任何基线对比数据，评审后判定为高风险低回报；
                    最大上调为 RPR-03（RP-03 优惠计算下沉，69 → 81，+12 分）：AI 把「规则引擎化」与 BUG-1043 的 double 精度问题拆开后，
                    金额精度部分获得先行热修的独立依据。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Gauge size={16} />
                  AI 评审提效统计
                </span>
                <span className="ac-card-subtitle">口径逐条写明，可复核</span>
              </div>
              <div className="ac-card-body ac-rp-eff">
                <dl className="ac-kv ac-rp-kv">
                  <dt>评审总时长</dt>
                  <dd>
                    {reviewStats.totalMin} 分钟（{(reviewStats.totalMin / 60).toFixed(1)} 小时）· 平均每轮 {reviewStats.avgMin.toFixed(1)} 分钟
                  </dd>
                  <dt>AI 澄清问题</dt>
                  <dd>合计 {reviewStats.questions} 个 · 平均每轮 {(reviewStats.questions / REQ_REVIEWS.length).toFixed(1)} 个</dd>
                  <dt>节省口径</dt>
                  <dd>
                    每个 AI 问题若由人工完成，需检索代码索引 + 回溯来源单据 + 测算影响面，经验值 {MINUTES_PER_QUESTION} 分钟/问；
                    {reviewStats.questions} × {MINUTES_PER_QUESTION} = <b>{reviewStats.savedMin} 分钟 = {(reviewStats.savedMin / 60).toFixed(1)} 小时</b>
                    的会前准备由 AI 预读前置完成。
                  </dd>
                  <dt>当场闭环率</dt>
                  <dd>
                    {reviewStats.onSite}/{reviewStats.questions} = {Math.round((reviewStats.onSite / Math.max(reviewStats.questions, 1)) * 1000) / 10}%
                    （口径：本轮结论为「通过 / 有条件通过」即视为问题在会上获得书面答复）
                  </dd>
                  <dt>跨轮闭环率</dt>
                  <dd>
                    {reviewStats.crossRound}/{reviewStats.questions} = {Math.round((reviewStats.crossRound / Math.max(reviewStats.questions, 1)) * 1000) / 10}%
                    （口径：非末轮的问题在下一轮预读中确认闭环 —— RPR-02 记录「5 个澄清问题全部有书面回复」、RPR-05 记录「第 1 轮 5 个问题全部闭环」；末轮按结论判定）
                  </dd>
                  <dt>未闭环</dt>
                  <dd>
                    {reviewStats.questions - reviewStats.crossRound} 个问题，全部来自 RPR-08（RP-18 退回后未再提池）与 RPR-09（RP-19 挂起至 SP-26）
                  </dd>
                  <dt>形式对比</dt>
                  <dd>
                    异步 {reviewStats.asyncCount} 轮均 {reviewStats.asyncAvg.toFixed(1)}min，会议 {reviewStats.meetCount} 轮均 {reviewStats.meetAvg.toFixed(1)}min，
                    异步压缩 {Math.round((1 - reviewStats.asyncAvg / Math.max(reviewStats.meetAvg, 1)) * 100)}%
                  </dd>
                </dl>
                <div className="ac-hint ac-hint--ai">
                  <Bot size={14} />
                  <span>
                    AI 做了什么：ag-pm 在会前预读来源单据全文、代码索引与知识库基线（KB-ARCH-01 / KB-CODE-02 / KB-SEC-02），
                    产出 aiPreReadSummary 与 3~5 个 aiQuestions，并在会后比对修订稿判断问题是否闭环。
                    人工如何介入：主持人可在评审中驳回 AI 的任一问题（驳回记录回写建议质量评估），
                    评分变化 scoreBefore → scoreAfter 必须由主持人确认后落库，AI 不得自行改写优先级分。
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 4. 漏斗与来源 ================= */}
      {tab === 'funnel' && (
        <div data-annotation-id="ai-sdlc-req-pool-funnel">
          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Waypoints size={16} />
                  需求池转化漏斗
                </span>
                <span className="ac-card-subtitle">累计到达口径 · 与 REQ_POOL 的 stage 分布严格对账</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">入池 {REQ_FUNNEL[0]?.count} 条</span>
                  <span className="ac-tag ac-tag--ok">交付 {REQ_FUNNEL[REQ_FUNNEL.length - 1]?.count} 条</span>
                </div>
              </div>
              <div className="ac-card-body">
                <FunnelChart />
              </div>
              <div className="ac-card-foot">
                <div className="ac-hint ac-hint--warn">
                  <TriangleAlert size={14} />
                  <span>
                    两处需重点治理的转化断点：① 评分 → 排期 仅 68.8%（16 → 11），流失 5 条 = 已评分 2（RP-12 / RP-14）+ 已拒绝 2（RP-17 / RP-18）+ 已挂起 1（RP-19），
                    其中 RP-12 / RP-14 属「已评分待窗口」而非真正流失；② 入迭代 → 交付 仅 11.1%，原因是 SP-24 尚未收口（TODAY = {TODAY}，末日 2026-03-27），
                    8 条已入迭代需求中最快的 REQ-2406 于 2026-03-13 随 v2.4 上线，其余仍在 qa / dev / refined 态。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Percent size={16} />
                  来源分布
                </span>
                <span className="ac-card-subtitle">点击扇区联动下方明细表</span>
                <div className="ac-card-extra">
                  {sourceFilter !== 'all' && (
                    <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setSourceFilter('all')}>
                      <CircleX size={12} />
                      清除 {sourceFilter}
                    </button>
                  )}
                </div>
              </div>
              <div className="ac-card-body">
                <SourceDonut onPick={(s) => setSourceFilter(sourceFilter === s ? 'all' : s)} />
                <div className="ac-legend ac-mt-3">
                  {REQ_SOURCE_STATS.map((s) => (
                    <button
                      type="button"
                      key={s.sourceType}
                      className={sourceFilter === s.sourceType ? 'ac-legend-item ac-rp-legend-btn ac-rp-legend-btn--active' : 'ac-legend-item ac-rp-legend-btn'}
                      onClick={() => setSourceFilter(sourceFilter === s.sourceType ? 'all' : s.sourceType)}
                    >
                      <span className="ac-legend-swatch" style={{ background: TONE_HEX[s.tone] }} />
                      {s.sourceType}
                      <span className="ac-legend-value">
                        {s.count} 条 · {s.sharePct}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                来源明细
              </span>
              <span className="ac-card-subtitle">采纳率 = 进入「排期」及之后阶段的条目数 ÷ 该来源条目数</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">合计 {REQ_SOURCE_STATS.reduce((s, r) => s + r.count, 0)} 条 · 占比 {REQ_SOURCE_STATS.reduce((s, r) => s + r.sharePct, 0).toFixed(0)}%</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>来源类型</th>
                      <th className="ac-td-right">数量</th>
                      <th className="ac-td-right">占比</th>
                      <th className="ac-td-right">平均交付周期</th>
                      <th className="ac-td-right">采纳率</th>
                      <th className="ac-td-right">平均 AI 分</th>
                      <th>代表条目</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REQ_SOURCE_STATS.map((s) => {
                      const rows = livePool.filter((p) => p.sourceType === s.sourceType);
                      return (
                        <tr key={s.sourceType} className={sourceFilter === s.sourceType ? 'ac-rp-row ac-table-row--selected' : 'ac-rp-row'}>
                          <td>
                            <span className="ac-rp-cell-name">
                              <span className="ac-rp-dot" style={{ background: TONE_HEX[s.tone] }} />
                              {s.sourceType}
                            </span>
                          </td>
                          <td className="ac-td-num">{s.count}</td>
                          <td className="ac-td-num">{s.sharePct.toFixed(1)}%</td>
                          <td className="ac-td-num">
                            <span className={s.avgCycleDays > 25 ? 'ac-danger-text' : s.avgCycleDays > 15 ? 'ac-warn-text' : 'ac-ok-text'}>
                              {s.avgCycleDays.toFixed(1)} 天
                            </span>
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${s.acceptRatePct >= 80 ? 'ok' : s.acceptRatePct >= 40 ? 'warn' : 'danger'}`}>
                              {s.acceptRatePct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="ac-td-num">{s.avgPriorityScore.toFixed(1)}</td>
                          <td>
                            <span className="ac-rp-tags">
                              {rows.slice(0, 4).map((p) => (
                                <button type="button" className="ac-tag ac-tag--sm ac-tag--outline ac-mono" key={p.id} onClick={() => setDrawerId(p.id)}>
                                  {p.id}
                                </button>
                              ))}
                              {rows.length > 4 && <span className="ac-tag ac-tag--sm ac-tag--outline">+{rows.length - 4}</span>}
                            </span>
                          </td>
                          <td className="ac-td-right">
                            <button
                              type="button"
                              className="ac-btn ac-btn--text ac-btn--sm"
                              onClick={() => setSourceFilter(sourceFilter === s.sourceType ? 'all' : s.sourceType)}
                            >
                              {sourceFilter === s.sourceType ? '取消筛选' : '筛选该来源'}
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
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Layers size={16} />
                来源 × 阶段分布
              </span>
              <span className="ac-card-subtitle">每行一个来源类型，分段为该来源在 7 个阶段分组上的条目数</span>
              <div className="ac-card-extra">
                {FUNNEL_GROUPS.map((g) => (
                  <span className="ac-tag ac-tag--sm ac-tag--outline" key={g.key}>
                    <span className="ac-rp-dot" style={{ background: g.hex }} />
                    {g.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="ac-card-body">
              <SourceStageStack />
            </div>
          </div>

          <div className="ac-section-title">AI 来源洞察</div>
          <div className="ac-rp-insight-grid">
            {[
              {
                tone: 'ok' as Tone,
                icon: <CircleCheck size={14} />,
                title: '采纳率最高：有实证依据的来源几乎必然被采纳',
                body:
                  '线上事故复盘（2/2）、合规监管（2/2）与 AI 主动发现（1/1）的采纳率均为 100%，平均 AI 分分别为 79.0 / 70.0 / 73.0，全部高于池内均值 ' +
                  `${stats.avgScore.toFixed(1)} 分。共同特征是「不做会立刻产生可量化损失」：INC-2026-0131 造成 37 万元资损与 214 起客诉，SEC-2026-08 属个保法强制整改，RP-09 由 Prometheus 指标直接证实缓存穿透率 0.42% 已超 REQ-2404 的 AC1 上限 0.3%。`,
              },
              {
                tone: 'danger' as Tone,
                icon: <TriangleAlert size={14} />,
                title: '采纳率最低：竞品分析 0%、客户投诉 33.3%',
                body:
                  '竞品分析仅 RP-14 一条且停在「已评分」（平均交付周期 31.5 天，为 7 类来源最长）；客户投诉 3 条中只有 RP-02 入迭代，RP-10 仍在评估、RP-17 被拒绝（6 起工单占月度咨询量 0.3%，却需重建 Elasticsearch 索引）。' +
                  '建议：竞品分析类需求必须附「用户可感知收益的量化基线」，客户投诉类必须附「同类工单月度条数与替代方案成本」，否则不进入评估环节。',
              },
              {
                tone: 'warn' as Tone,
                icon: <Timer size={14} />,
                title: '交付周期最长：技术债 27.3 天，且采纳率仅 50%',
                body:
                  '技术债 4 条中 RP-12（上帝类拆分，21 点）与 RP-18（Kotlin 全量改写，89 点）均未进入排期，平均 AI 分 46.0 为 7 类来源最低。' +
                  '技术债的困境是「业务价值低 → 评分低 → 永远排不上 → 缺陷持续高发」：RP-12 的 3 个上帝类合计 9,800 行、认知复杂度均超 40，近 90 天 5 个缺陷中 3 个源自此处。' +
                  '建议：为技术债设立独立的「稳定期窗口」（v3.0 全量后的 SP-26），并在评分口径中把 riskScore 的语义从「不做的损失」细化出「可维护性劣化」子项。',
              },
              {
                tone: 'ai' as Tone,
                icon: <Sparkles size={14} />,
                title: 'AI 主动发现：新来源的价值评估与放量建议',
                body:
                  'RP-09 是全池唯一一条 sourceType 为「AI 主动发现」的条目，由 ag-ba 在可观测分析周报 AI-OBS-W11（2026-03-09 ~ 03-15）中识别：' +
                  '订单详情缓存命中率 91.6%（AC1 要求 ≥ 92%）、穿透率 0.42%（上限 0.3%），且 78% 的穿透 Key 对应不存在的订单号、来源 IP 集中在 3 个 C 段，具备扫描特征。' +
                  `从入池（2026-03-11）到评分完成并进入待排期（2026-03-16）仅 5 天，平均周期 6.2 天为 7 类来源最短，AI 分 73 高于池内均值 ${stats.avgScore.toFixed(1)}。` +
                  '它的独特价值在于「把已上线需求的验收标准违约主动暴露出来」——这是人工提池无法覆盖的盲区。建议把 ag-ba 的可观测周报固化为需求池的常规来源通道，目标 SP-25 起每月至少产出 2 条候选，并对每条强制要求附指标快照与阈值出处。',
              },
            ].map((it) => (
              <div className="ac-rp-insight" key={it.title}>
                <div className={`ac-rp-insight-head ${TEXT_TONE[it.tone]}`}>
                  {it.icon}
                  {it.title}
                </div>
                <div className="ac-rp-insight-body">{it.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 5. 追溯与关联 ================= */}
      {tab === 'trace' && (
        <div data-annotation-id="ai-sdlc-req-pool-trace">
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <GitBranch size={16} />
                端到端追溯链路
              </span>
              <span className="ac-card-subtitle">需求池条目 → REQ-24xx → 用户故事 → TASK-24xx → 缺陷 → 发布单</span>
              <div className="ac-card-extra">
                <select className="ac-select ac-select--sm" value={traceId} onChange={(e) => setTraceId(e.target.value)} aria-label="选择需求池条目">
                  {traceCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.title.slice(0, 22)}…
                    </option>
                  ))}
                </select>
                <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setDrawerId(traceChain.pool.id)}>
                  <ChevronRight size={12} />
                  查看池条目详情
                </button>
              </div>
            </div>
            <div className="ac-card-body ac-rp-trace-body">
              <TraceFlow chain={traceChain} />
              <div className="ac-rp-trace-links">
                {[
                  { ok: traceChain.links.l1, label: '池 ↔ 需求', desc: 'requirementId + REQ_POOL_ID_BY_REQUIREMENT 双向一致' },
                  { ok: traceChain.links.l2, label: '需求 ↔ 故事', desc: `storyIds ${traceChain.stories.length} 条，且 USER_STORIES.reqId 回指` },
                  { ok: traceChain.links.l3, label: '需求 ↔ 任务', desc: `taskIds ${traceChain.tasks.length} 条，且 TASKS.reqId 回指` },
                  { ok: traceChain.links.l4, label: '任务 ↔ 质量资产', desc: `缺陷 ${traceChain.bugs.length} 个或平均覆盖率 ≥ 60%（实测 ${traceChain.req ? avgCoverage(traceChain.req.taskIds).toFixed(1) : 0}%）` },
                ].map((l) => (
                  <span className={l.ok ? 'ac-rp-linkchip ac-rp-linkchip--ok' : 'ac-rp-linkchip ac-rp-linkchip--bad'} key={l.label}>
                    {l.ok ? <CircleCheck size={12} /> : <CircleX size={12} />}
                    <b>{l.label}</b>
                    <i>{l.desc}</i>
                  </span>
                ))}
                <span className={`ac-rp-linkchip ${coverageOf(traceChain).pct >= 100 ? 'ac-rp-linkchip--ok' : 'ac-rp-linkchip--warn'}`}>
                  <Percent size={12} />
                  <b>双向覆盖率 {coverageOf(traceChain).pct}%</b>
                  <i>{coverageOf(traceChain).n} / 4 个环节已建立</i>
                </span>
              </div>
              {traceChain.breaks.length > 0 && (
                <div className="ac-hint ac-hint--danger">
                  <Siren size={14} />
                  <span>
                    该链路存在 {traceChain.breaks.length} 处异常：{traceChain.breaks.join('；')}。
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                追溯矩阵
              </span>
              <span className="ac-card-subtitle">9 列 · 覆盖池内全部 {livePool.length} 条（未入迭代的条目链路尚未建立，覆盖率记为 N/A）</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">双向覆盖率 {traceStats.pct}%</span>
                <span className="ac-tag ac-tag--danger">异常 {traceStats.breaks} 处</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>池条目</th>
                      <th>阶段</th>
                      <th>正式需求</th>
                      <th className="ac-td-right">故事数</th>
                      <th className="ac-td-right">任务数</th>
                      <th className="ac-td-right">缺陷数</th>
                      <th>发布单</th>
                      <th className="ac-td-right">双向覆盖率</th>
                      <th>断链告警</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chains.map((c) => {
                      const cov = coverageOf(c);
                      const inIteration = c.pool.stage === '已入迭代' || c.pool.stage === '已交付';
                      const hard = c.breaks.filter(
                        (b) =>
                          b.indexOf('requirementId 为空') >= 0 ||
                          b.indexOf('taskIds 为空') >= 0 ||
                          b.indexOf('已开工但单测覆盖率为 0') >= 0 ||
                          b.indexOf('零测试资产') >= 0,
                      );
                      return (
                        <tr
                          key={c.pool.id}
                          className={c.pool.id === traceId ? 'ac-rp-row ac-table-row--selected' : 'ac-rp-row'}
                          onClick={() => setTraceId(c.pool.id)}
                          title="点击在上方链路图中高亮该条目"
                        >
                          <td>
                            <div className="ac-mono ac-brand-text ac-semi">{c.pool.id}</div>
                            <span className="ac-xs ac-muted ac-rp-cell-title">{c.pool.title}</span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STAGE_META[c.pool.stage].tone]}`}>{c.pool.stage}</span>
                          </td>
                          <td>
                            {c.req ? (
                              <span className="ac-mono ac-xs ac-text-1">
                                {c.req.id}
                                <span className="ac-xs ac-muted"> · {c.req.statusLabel}</span>
                              </span>
                            ) : (
                              <span className="ac-tag ac-tag--sm ac-tag--danger">
                                <CircleSlash size={10} />
                                {inIteration ? '断链：无 requirementId' : '未入迭代'}
                              </span>
                            )}
                          </td>
                          <td className="ac-td-num">{c.req ? c.stories.length : '—'}</td>
                          <td className="ac-td-num">{c.req ? c.tasks.length : '—'}</td>
                          <td className="ac-td-num">
                            {c.req ? (
                              c.bugs.length > 0 ? (
                                <span className={c.bugs.some((b) => b.releaseBlocking) ? 'ac-danger-text ac-semi' : ''}>{c.bugs.length}</span>
                              ) : (
                                <span className="ac-muted">0</span>
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <span className="ac-rp-tags">
                              {c.releases.map((r) => (
                                <span
                                  key={r.rel.id}
                                  className={`ac-tag ac-tag--sm ac-tag--${r.rel.status === 'released' ? 'ok' : r.rel.status === 'blocked' ? 'danger' : 'warn'}`}
                                  title={`${r.level} · ${r.rel.version} · ${r.rel.windowStart}`}
                                >
                                  {r.rel.id}
                                  <i className="ac-rp-rel-level">{r.level}</i>
                                </span>
                              ))}
                              {c.releases.length === 0 && <span className="ac-xs ac-muted">未关联</span>}
                            </span>
                          </td>
                          <td className="ac-td-right">
                            {inIteration ? (
                              <span className="ac-rp-cov">
                                <span className="ac-progress ac-progress--sm">
                                  <span
                                    className={`ac-progress-bar ${cov.pct >= 100 ? 'ac-progress-bar--ok' : cov.pct >= 75 ? 'ac-progress-bar--warn' : 'ac-progress-bar--danger'}`}
                                    style={{ width: `${cov.pct}%` }}
                                  />
                                </span>
                                <span className="ac-xs ac-semi">
                                  {cov.n}/4 · {cov.pct}%
                                </span>
                              </span>
                            ) : (
                              <span className="ac-xs ac-muted">N/A（未入迭代）</span>
                            )}
                          </td>
                          <td className="ac-rp-breaks">
                            {c.breaks.length === 0 ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ok">
                                <CircleCheck size={10} />
                                链路完整
                              </span>
                            ) : (
                              <>
                                {hard.length > 0 && (
                                  <span className="ac-tag ac-tag--sm ac-tag--danger">
                                    <TriangleAlert size={10} />
                                    断链 {hard.length}
                                  </span>
                                )}
                                {c.breaks.length - hard.length > 0 && (
                                  <span className="ac-tag ac-tag--sm ac-tag--warn">预警 {c.breaks.length - hard.length}</span>
                                )}
                                <span className="ac-xs ac-muted ac-rp-break-text">{c.breaks[0]}</span>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ac-grid-1-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Siren size={16} />
                  断链检测
                </span>
                <span className="ac-card-subtitle">3 类断链 + 2 类预警</span>
              </div>
              <div className="ac-card-body ac-rp-break-body">
                <div className="ac-rp-break-group">
                  <div className="ac-rp-break-title">
                    <CircleX size={13} className="ac-danger-text" />
                    A · 已入迭代 / 已交付但无正式需求记录
                  </div>
                  {chains
                    .filter((c) => (c.pool.stage === '已入迭代' || c.pool.stage === '已交付') && !c.req)
                    .map((c) => (
                      <div className="ac-hint ac-hint--danger" key={c.pool.id}>
                        <Ban size={14} />
                        <span>
                          <b>{c.pool.id}</b>（{c.pool.title}）stage = {c.pool.stage}，但 requirementId 为空。
                          {c.pool.decisionNote}
                        </span>
                      </div>
                    ))}
                  {chains.filter((c) => (c.pool.stage === '已入迭代' || c.pool.stage === '已交付') && !c.req).length === 0 && (
                    <span className="ac-xs ac-muted">无</span>
                  )}
                </div>

                <div className="ac-rp-break-group">
                  <div className="ac-rp-break-title">
                    <CircleX size={13} className="ac-danger-text" />
                    B · 任务已开工但单测覆盖率为 0
                  </div>
                  {TASKS.filter((t) => t.type !== '发布' && STARTED_STATES.indexOf(t.state) >= 0 && t.coverage === 0).map((t) => (
                    <div className="ac-hint ac-hint--danger" key={t.id}>
                      <Flame size={14} />
                      <span>
                        <b className="ac-mono">{t.id}</b>（{t.title}）state = {t.stateLabel}、ownerId = {USER_MAP[t.ownerId]?.name ?? t.ownerId}，
                        coverage = 0%（G3 阈值 {G3_COVERAGE}%）。所属需求 {t.reqId || '（发布执行类，reqId 为空串）'}。
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ac-rp-break-group">
                  <div className="ac-rp-break-title">
                    <CircleX size={13} className="ac-danger-text" />
                    C · 需求已拆解但关联任务零测试资产
                  </div>
                  {REQUIREMENTS.filter((r) => r.taskIds.length > 0 && r.taskIds.every((id) => TASK_MAP[id]?.coverage === 0)).map((r) => (
                    <div className="ac-hint ac-hint--danger" key={r.id}>
                      <Boxes size={14} />
                      <span>
                        <b className="ac-mono">{r.id}</b>（{r.title}）的 {r.taskIds.length} 个任务（{r.taskIds.join('、')}）覆盖率全部为 0，
                        对应池条目 {REQ_POOL_ID_BY_REQUIREMENT[r.id] ?? '—'}。
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ac-rp-break-group">
                  <div className="ac-rp-break-title">
                    <TriangleAlert size={13} className="ac-warn-text" />
                    D · 关键路径任务覆盖率未达 G3（{G3_COVERAGE}%）
                  </div>
                  <div className="ac-rp-critical-list">
                    {criticalLowCoverage.map((t) => (
                      <span className="ac-tag ac-tag--sm ac-tag--warn" key={t.id} title={t.title}>
                        {t.id} · {t.coverage}%
                      </span>
                    ))}
                    <span className="ac-xs ac-muted">共 {criticalLowCoverage.length} 项（发布执行类任务已豁免）</span>
                  </div>
                  <div className="ac-hint ac-hint--warn">
                    <ShieldCheck size={14} />
                    <span>
                      REL-2403 批次 1 的准入条件明确写有「G3 ≥ 85% 且 TASK-2419/2420 完成」，而当前 G3 实测 71.4%、TASK-2420 覆盖率 0%，
                      这是该发布单被 gateBlockedIds = [G3, G4] 阻断的直接原因。
                    </span>
                  </div>
                </div>

                <div className="ac-rp-break-group">
                  <div className="ac-rp-break-title">
                    <TriangleAlert size={13} className="ac-warn-text" />
                    E · 缺陷数为 0 但测试尚未启动（不得计入质量正向指标）
                  </div>
                  {REQUIREMENTS.filter(
                    (r) => BUGS.filter((b) => b.reqId === r.id).length === 0 && r.taskIds.every((id) => STARTED_STATES.indexOf(TASK_MAP[id]?.state ?? '') < 0),
                  ).map((r) => (
                    <div className="ac-hint ac-hint--warn" key={r.id}>
                      <Timer size={14} />
                      <span>
                        <b className="ac-mono">{r.id}</b>（{r.title}）缺陷 0 个，但其 {r.taskIds.length} 个任务均未进入测试态
                        （{r.taskIds.map((id) => `${id} ${TASK_MAP[id]?.stateLabel ?? ''}`).join('、')}）—— 属「测试未启动」，不应解读为「零缺陷」。
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sparkles size={16} />
                  AI 追溯完整性评估
                </span>
                <span className="ac-card-subtitle">ag-ba 对 9 条已入迭代 / 已交付条目的双向追溯打分</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--sm ac-tag--ai">
                    <Bot size={11} />
                    ag-ba
                  </span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-rp-trace-score">
                  <div className="ac-donut">
                    <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`双向追溯覆盖率 ${traceStats.pct}%`}>
                      <circle cx="60" cy="60" r="48" fill="none" stroke="#eceff4" strokeWidth="14" />
                      <circle
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke={traceStats.pct >= 90 ? TONE_HEX.ok : traceStats.pct >= 75 ? TONE_HEX.warn : TONE_HEX.danger}
                        strokeWidth="14"
                        strokeLinecap="round"
                        strokeDasharray={`${(traceStats.pct / 100) * 2 * Math.PI * 48} ${2 * Math.PI * 48}`}
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <span className="ac-donut-center">
                      <span className="ac-donut-value">{traceStats.pct}%</span>
                      <span className="ac-donut-label">双向覆盖率</span>
                    </span>
                  </div>
                  <dl className="ac-kv ac-rp-kv">
                    <dt>统计范围</dt>
                    <dd>
                      {traceStats.scope} 条已入迭代 / 已交付条目 × 4 个映射环节 = {traceStats.total} 个应有链路，实际建立 {traceStats.links} 个
                    </dd>
                    <dt>池 ↔ 需求</dt>
                    <dd>
                      {traceStats.l1}/{traceStats.scope} 建立（缺口为 RP-16：已随 REL-2401 交付但未回填 requirementId）
                    </dd>
                    <dt>需求 ↔ 故事</dt>
                    <dd>
                      {traceStats.l2}/{traceStats.scope} 建立，{USER_STORIES.length} 条 USER_STORIES.reqId 全部正确回指 {REQUIREMENTS.length} 条需求
                    </dd>
                    <dt>需求 ↔ 任务</dt>
                    <dd>
                      {traceStats.l3}/{traceStats.scope} 建立，{TASKS.length} 个 TASK-24xx 中 {TASKS.filter((t) => t.reqId).length} 个带 reqId（TASK-2421 为发布执行类，reqId 为空串）
                    </dd>
                    <dt>任务 ↔ 质量资产</dt>
                    <dd>
                      {traceStats.l4}/{traceStats.scope} 建立（缺口为 REQ-2405 与 REQ-2407：缺陷 0 个且平均覆盖率分别为 0% 与 32%）
                    </dd>
                    <dt>异常合计</dt>
                    <dd>
                      {traceStats.breaks} 处链路异常，分布在{' '}
                      {chains.filter((c) => (c.pool.stage === '已入迭代' || c.pool.stage === '已交付') && c.breaks.length > 0).length} 条需求上
                      （硬断链：RP-16 缺 requirementId、TASK-2407 已开工零覆盖、REQ-2405 / REQ-2408 零测试资产；
                      预警：REQ-2405 测试未启动、REQ-2407 质量资产不足）；
                      另有 {criticalLowCoverage.length} 项关键路径任务覆盖率未达 G3 阈值 {G3_COVERAGE}%
                    </dd>
                  </dl>
                </div>

                <div className="ac-rp-advice-list">
                  {[
                    {
                      tone: 'danger' as Tone,
                      title: '把「已交付必须回填 requirementId」设为池条目的出口校验',
                      body:
                        'RP-16（订单查询读扩容与慢 SQL 治理）已随 REL-2401 于 2026-02-13 交付，读副本 16 → 24、慢 SQL 治理 7 条、列表接口 P95 由 286ms 降至 214ms（−25.2%），' +
                        '但 requirementId 为空，导致版本基线（VERSION_BASELINES）无法反向追溯到需求池来源。它是 9 条在评条目中唯一四个环节全部缺失的一条，' +
                        `单这一条就把双向覆盖率从 ${Math.round(((traceStats.links + 4) / Math.max(traceStats.total, 1)) * 1000) / 10}% 拉低到 ${traceStats.pct}%。` +
                        '建议在 PingCode 的工作流中把「关联正式需求」设为 stage 流转到已交付的必填校验项。',
                    },
                    {
                      tone: 'warn' as Tone,
                      title: '发布单模型缺少 requirementIds 字段，追溯只能靠弱关联重建',
                      body:
                        'RELEASE_ORDERS 的 3 条记录中只有 REL-2403 带 taskId（TASK-2421），而该任务的 reqId 是空串（发布执行类工作项）；REL-2401 / REL-2402 的 taskId 也为空。' +
                        '本页只能用两种弱口径重建关联：① 需求级 = 池条目的 decisionNote / aiScoreReason 文本中点名了发布单号（RP-16 → REL-2401、RP-03 → REL-2402）；' +
                        '② 迭代级 = 发布单执行任务的 sprintId 与需求的 sprintId 相同（SP-24 的 8 条需求 → REL-2403）。' +
                        '文本命中不可靠、迭代级过粗，建议在发布单模型中增加 requirementIds 与 bugIds 两个结构化字段。',
                    },
                    {
                      tone: 'danger' as Tone,
                      title: 'G3 覆盖率门禁必须硬阻断，否则追溯矩阵的「任务 ↔ 质量资产」环节持续失真',
                      body:
                        `当前 ${criticalLowCoverage.length} 个关键路径任务的单测覆盖率低于 G3 阈值 ${G3_COVERAGE}%（最低的 TASK-2419 仅 64%、TASK-2420 为 0%），` +
                        'REQ-2405 与 REQ-2408 的全部任务覆盖率为 0。REL-2403 批次 1 的准入条件已写明「G3 ≥ 85%」，实测 71.4%，' +
                        '说明门禁目前是「记录但不阻断」。建议把 G3 改为流水线硬阻断，并由 ag-test 在 MR 合入后 10 分钟内自动触发对应用例集（与 COOP-05 的建议同源）。',
                    },
                    {
                      tone: 'info' as Tone,
                      title: '把「缺陷 0」区分为「零缺陷」与「测试未启动」两种语义',
                      body:
                        'REQ-2405（多仓多商家拆单）与 REQ-2407（历史订单数据迁移与双写校验）的缺陷数均为 0，但其关联任务分别停在 taskCreated / refined 与 dev / refined，' +
                        '尚未进入测试态。若在效能报表中直接把 0 缺陷计为质量正向指标，会掩盖 TASK-2420（双写校验，关键路径）覆盖率 0% 的真实风险 —— 它正是 G4 门禁被阻断的原因之一。' +
                        '建议在追溯矩阵与效能报表中同时展示「测试启动率」，只有启动率 100% 的需求才允许展示缺陷密度。',
                    },
                  ].map((a) => (
                    <div className={`ac-rp-advice ac-rp-advice--${TAG_TONE[a.tone]}`} key={a.title}>
                      <div className={`ac-rp-advice-title ${TEXT_TONE[a.tone]}`}>
                        <Sparkles size={13} />
                        {a.title}
                      </div>
                      <div className="ac-rp-advice-body">{a.body}</div>
                    </div>
                  ))}
                </div>

                <div className="ac-hint ac-hint--ai">
                  <Bot size={14} />
                  <span>
                    AI 做了什么：ag-ba 遍历 REQ_POOL、REQUIREMENTS、USER_STORIES、TASKS、BUGS、RELEASE_ORDERS 六个数据集，
                    按四个映射环节逐一校验外键的双向一致性（不仅检查 requirementId 是否存在，还用 REQ_POOL_ID_BY_REQUIREMENT 反查是否指回同一条池条目），
                    并按 G3 阈值 {G3_COVERAGE}% 与 10 态状态机识别断链与预警。依据：全部为数据层已存在的字段，未引入任何推测值。
                    人工如何介入：每条建议都指向具体的流程卡点（PingCode 工作流校验、发布单模型字段、G3 门禁策略、报表口径），
                    需由 PMO 与平台架构组在架构评审会（CER-04）上裁决后才落库。
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 需求池条目详情抽屉 ---------- */}
      <Drawer
        open={drawerItem !== null}
        title={drawerItem ? `${drawerItem.id} · ${drawerItem.code}` : '需求详情'}
        subtitle={drawerItem ? `${drawerItem.stage} · ${drawerItem.sourceType} · AI 优先级分 ${scoreOf(drawerItem)}` : undefined}
        width={760}
        onClose={() => setDrawerId(null)}
        footer={
          drawerItem && (
            <>
              {drawerItem.requirementId && (
                <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('requirement')}>
                  <Link2 size={13} />
                  打开 {drawerItem.requirementId} 工作台
                </button>
              )}
              {drawerItem.stage !== '已入迭代' && drawerItem.stage !== '已交付' && drawerItem.stage !== '已拒绝' && (
                <button
                  type="button"
                  className="ac-btn ac-btn--primary ac-btn--sm"
                  onClick={() => {
                    setSelected(new Set([drawerItem.id]));
                    setBatchSprintId(drawerItem.aiSuggestedSprintId ?? 'SP-25');
                    setBatchOpen(true);
                  }}
                >
                  <Rocket size={13} />
                  入迭代
                </button>
              )}
              <button
                type="button"
                className="ac-btn ac-btn--danger-ghost ac-btn--sm"
                disabled={drawerItem.stage === '已拒绝'}
                onClick={() => {
                  setRejectItem(drawerItem);
                  setRejectReason('');
                }}
              >
                <Ban size={13} />
                拒绝
              </button>
            </>
          )
        }
      >
        {drawerItem && <PoolDetail item={drawerItem} score={scoreOf(drawerItem)} />}
      </Drawer>

      {/* ---------- 评审轮次详情抽屉 ---------- */}
      <Drawer
        open={reviewDrawer !== null}
        title={reviewDrawer ? `${reviewDrawer.id} · 第 ${reviewDrawer.round} 轮评审` : '评审详情'}
        subtitle={
          reviewDrawer
            ? `${reviewDrawer.poolItemId} · ${reviewDrawer.heldAt} · ${reviewDrawer.mode} · ${reviewDrawer.outcome}`
            : undefined
        }
        width={720}
        onClose={() => setReviewDrawerId(null)}
        footer={
          reviewDrawer && (
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => { setDrawerId(reviewDrawer.poolItemId); setReviewDrawerId(null); }}>
              <ArrowRight size={13} />
              查看 {reviewDrawer.poolItemId} 的池条目详情
            </button>
          )
        }
      >
        {reviewDrawer && <ReviewDetail review={reviewDrawer} pool={poolById[reviewDrawer.poolItemId] ?? REQ_POOL_MAP[reviewDrawer.poolItemId]} />}
      </Drawer>

      {/* ---------- 批量入迭代确认弹窗 ---------- */}
      <Modal
        open={batchOpen}
        title="批量入迭代确认"
        subtitle={`已选 ${selectedItems.length} 条需求 · 合计 ${selectedPoints} 点`}
        width={620}
        onClose={() => setBatchOpen(false)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setBatchOpen(false)}>
              取消
            </button>
            <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" disabled={selectedItems.length === 0} onClick={confirmBatch}>
              <Check size={13} />
              确认入迭代（本地乐观更新）
            </button>
          </>
        }
      >
        <div className="ac-field ac-field--inline">
          <span className="ac-field-label">目标迭代</span>
          <select className="ac-select" value={batchSprintId} onChange={(e) => setBatchSprintId(e.target.value)} aria-label="目标迭代">
            {SPRINTS.filter((s) => s.status !== 'done').map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.theme}（产能 {s.capacity} / 已承诺 {s.committed} / 剩余 {s.capacity - s.committed} 点）
              </option>
            ))}
          </select>
        </div>
        <div className={`ac-hint ${batchOverflow ? 'ac-hint--danger' : 'ac-hint--ok'}`}>
          {batchOverflow ? <TriangleAlert size={14} /> : <CircleCheck size={14} />}
          <span>
            {targetSprint?.name} 剩余产能 {batchRemaining} 点，本次纳入 {selectedPoints} 点 →{' '}
            {batchOverflow ? `超出 ${selectedPoints - batchRemaining} 点，需先做负载再平衡` : `尚余 ${batchRemaining - selectedPoints} 点缓冲`}
          </span>
        </div>
        <div className="ac-table-wrap ac-mt-3">
          <table className="ac-table ac-table--sm ac-table--bordered">
            <thead>
              <tr>
                <th>编号</th>
                <th>标题</th>
                <th>当前阶段</th>
                <th className="ac-td-right">AI 分</th>
                <th className="ac-td-right">点数</th>
                <th className="ac-td-right">AI 建议迭代</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((p) => (
                <tr key={p.id}>
                  <td className="ac-mono ac-brand-text">{p.id}</td>
                  <td className="ac-rp-title">{p.title}</td>
                  <td>
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STAGE_META[p.stage].tone]}`}>{p.stage}</span>
                  </td>
                  <td className="ac-td-num">{scoreOf(p)}</td>
                  <td className="ac-td-num">{p.estimatePoints}</td>
                  <td className="ac-td-num ac-mono ac-xs">
                    {p.aiSuggestedSprintId ?? '—'}
                    {p.aiSuggestedSprintId && p.aiSuggestedSprintId !== batchSprintId && (
                      <span className="ac-warn-text"> 与建议不一致</span>
                    )}
                  </td>
                </tr>
              ))}
              {selectedItems.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="ac-empty ac-empty--sm">
                      <span className="ac-empty-icon">
                        <Inbox size={18} />
                      </span>
                      <span className="ac-empty-title">尚未选择任何条目</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="ac-hint ac-hint--ai ac-mt-3">
          <Sparkles size={14} />
          <span>
            确认后本页会把所选条目的 stage 乐观更新为「已入迭代」、tone 按分档规则重算、decidedAt 置为 {TODAY}，并把决策说明追加到 decisionNote；
            变更仅存在于当前会话，不会写回 PingCode。入迭代后的 Brainstorm → PRD → 拆解作业请在「需求工作台」继续。
          </span>
        </div>
      </Modal>

      {/* ---------- 拒绝确认弹窗 ---------- */}
      <Modal
        open={rejectItem !== null}
        title="拒绝需求"
        subtitle={rejectItem ? `${rejectItem.id} · ${rejectItem.title}` : undefined}
        width={560}
        onClose={() => setRejectItem(null)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setRejectItem(null)}>
              取消
            </button>
            <button type="button" className="ac-btn ac-btn--danger ac-btn--sm" onClick={confirmReject}>
              <Ban size={13} />
              确认拒绝
            </button>
          </>
        }
      >
        <div className="ac-field">
          <span className="ac-field-label">
            拒绝理由<span className="ac-field-req">*</span>
          </span>
          <textarea
            className="ac-textarea"
            rows={5}
            value={rejectReason}
            placeholder="请按 RP-17 / RP-18 的决议范式填写：① 现有替代方案与其覆盖率 ② 实现成本与资源冲突 ③ 重新提池的触发条件"
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <span className="ac-field-hint">
            理由会写入 decisionNote 并向提出人发送通知；参考 RP-18 的拒绝决议包含 3 条量化理由与「转入 2027 年技术雷达评估环」的后续处置。
          </span>
        </div>
        {rejectItem && (
          <dl className="ac-kv ac-rp-kv ac-mt-3">
            <dt>当前阶段</dt>
            <dd>
              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STAGE_META[rejectItem.stage].tone]}`}>{rejectItem.stage}</span>
            </dd>
            <dt>AI 评分</dt>
            <dd>
              {scoreOf(rejectItem)}（{bandOf(scoreOf(rejectItem)).label}）· 业务价值 {rejectItem.businessValue} / 紧急度 {rejectItem.urgency} / 风险 {rejectItem.riskScore} / 复杂度 {rejectItem.techComplexity}
            </dd>
            <dt>提出人</dt>
            <dd>
              {rejectItem.submittedBy ? `${USER_MAP[rejectItem.submittedBy]?.name ?? rejectItem.submittedBy}（平台内）` : `${rejectItem.externalName}（平台外）`}
            </dd>
            <dt>历史评审</dt>
            <dd>
              {REQ_REVIEWS.filter((r) => r.poolItemId === rejectItem.id).length > 0
                ? REQ_REVIEWS.filter((r) => r.poolItemId === rejectItem.id)
                    .map((r) => `${r.id} 第 ${r.round} 轮 ${r.outcome}`)
                    .join('；')
                : '未进入评审流程'}
            </dd>
          </dl>
        )}
      </Modal>

      {/* ---------- 录入需求弹窗 ---------- */}
      <Modal
        open={createOpen}
        title="录入需求"
        subtitle={`新建需求池条目 · 将分配 ${nextItemId} / ${nextItemCode} · 提交日期 ${TODAY} · 仅存于本页会话，不回写 PingCode`}
        width={800}
        onClose={closeCreate}
        footer={
          <>
            <button
              type="button"
              className="ac-btn ac-btn--ai ac-btn--sm"
              style={{ marginRight: 'auto' }}
              onClick={runAiScore}
            >
              <Sparkles size={13} />
              AI 评分并生成依据
            </button>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={closeCreate}>
              取消
            </button>
            <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={submitCreate}>
              <Check size={13} />
              录入到需求池
            </button>
          </>
        }
      >
        <FormGrid cols={2}>
          <FormGroupTitle title="需求内容" note="标题与来源单据为 PingCode 同步的必填项" />
          <TextField
            label="需求标题"
            full
            required
            value={form.title}
            onChange={(v) => setField('title', v)}
            error={errors.title}
            hint="一句话说清用户价值与范围，避免解决方案先行"
            placeholder="如：履约超时自动补偿，减少人工客诉介入"
            maxLength={80}
          />
          <SelectField
            label="来源类型"
            required
            value={form.sourceType}
            onChange={(v) => setField('sourceType', v)}
            options={SOURCE_TYPES.map((s) => ({ value: s, label: s }))}
            error={errors.sourceType}
          />
          <TextField
            label="来源单据号 / 会议名"
            required
            mono
            value={form.sourceRef}
            onChange={(v) => setField('sourceRef', v)}
            error={errors.sourceRef}
            hint="来源单据号或会议名，如 TICKET-88213 / 2026-03-12 交易周会"
          />
          <SelectField
            label="归属 Epic"
            value={form.epicId}
            onChange={(v) => setField('epicId', v)}
            options={epicOptions}
            placeholder="暂不归属 Epic"
            hint="平台外 Epic 留空，落库时 epicId 为空串"
          />
          <MultiPickField
            label="标签"
            full
            value={form.tags}
            onChange={(v) => setField('tags', v)}
            options={tagOptions}
            hint={`复用池内既有 ${allTags.length} 个标签，便于按标签筛选与横向归并`}
          />

          <FormGroupTitle title="提交人" note="平台内成员与平台外提交人互斥，落库时另一侧置空" />
          <SelectField
            label="提交人类型"
            value={form.submitterMode}
            onChange={(v) => setField('submitterMode', v === 'outer' ? 'outer' : 'inner')}
            options={[
              { value: 'inner', label: '平台内成员' },
              { value: 'outer', label: '平台外提交人' },
            ]}
          />
          {form.submitterMode === 'inner' ? (
            <SelectField
              label="提交人"
              required
              value={form.submittedBy}
              onChange={(v) => setField('submittedBy', v)}
              options={userOptions}
              placeholder="请选择提交人"
              error={errors.submittedBy}
            />
          ) : (
            <TextField
              label="平台外提交人"
              required
              value={form.externalName}
              onChange={(v) => setField('externalName', v)}
              error={errors.externalName}
              hint="姓名与组织，如「王慧 · 零售事业部门店运营」"
            />
          )}

          <FormGroupTitle
            title="AI 评分四维（1-10）"
            note="aiPriorityScore = 4×业务价值 + 3×紧急度 + 1.5×风险分 + 1.5×(11−技术复杂度)"
          />
          <NumberField
            label="业务价值"
            required
            min={1}
            max={10}
            step={1}
            value={form.businessValue}
            onChange={(v) => setField('businessValue', v)}
            error={errors.businessValue}
            hint="业务价值：对营收/体验/合规的直接贡献"
          />
          <NumberField
            label="紧急度"
            required
            min={1}
            max={10}
            step={1}
            value={form.urgency}
            onChange={(v) => setField('urgency', v)}
            error={errors.urgency}
            hint="紧急度：不做的时效损失"
          />
          <NumberField
            label="风险分"
            required
            min={1}
            max={10}
            step={1}
            value={form.riskScore}
            onChange={(v) => setField('riskScore', v)}
            error={errors.riskScore}
            hint="风险分：不做会带来多大损失"
          />
          <NumberField
            label="技术复杂度"
            required
            min={1}
            max={10}
            step={1}
            value={form.techComplexity}
            onChange={(v) => setField('techComplexity', v)}
            error={errors.techComplexity}
            hint="技术复杂度：越高优先级分越低"
          />
          {dimsReady && (
            <FieldShell label="AI 优先级分实时预览" full>
              <div className="ac-hint ac-hint--ai">
                <Sigma size={14} />
                <span>
                  当前 AI 优先级分 = <b>{previewScore}</b>（{bandOf(previewScore).label}）；
                  {previewContribs.map((c) => c.expr).join(' + ')} = {previewContribs.map((c) => fmtNum(c.value)).join(' + ')}{' '}
                  = {fmtNum(previewRaw)}，按数据模块 A 节口径 round 取整并 clamp 到 [10, 100] → {previewScore}。
                </span>
              </div>
            </FieldShell>
          )}

          <FormGroupTitle title="责任与评估" note="评审人须与提交人分离（四眼原则），预估点数可留空表示尚未评估" />
          <SelectField
            label="责任角色"
            required
            value={form.ownerRoleId}
            onChange={(v) => setField('ownerRoleId', v)}
            options={roleOptions}
            placeholder="请选择责任角色"
            error={errors.ownerRoleId}
          />
          <NumberField
            label="预估故事点"
            min={0}
            max={40}
            step={1}
            unit="故事点"
            value={form.estimatePoints}
            onChange={(v) => setField('estimatePoints', v)}
            error={errors.estimatePoints}
            hint="留空或 0 表示尚未评估"
          />
          <MultiPickField
            label="评审人"
            full
            value={form.reviewers}
            onChange={(v) => setField('reviewers', v)}
            options={userOptions}
            error={errors.reviewers}
            hint={`需求澄清会的评审席，已选 ${form.reviewers.length} 人`}
          />
        </FormGrid>

        {aiDraft && (
          <div className="ac-hint ac-hint--ai ac-mt-3">
            <Sparkles size={14} />
            <span>
              <b>AI 优先级分 {aiDraft.score}</b> · 建议迭代 {aiDraft.sprintId ?? '暂不建议排期'} · 提交后阶段置为「已评分」。
              {aiDraft.reason}
              由 ag-ba（可观测分析 Agent）依据需求池 A 节评分公式计算，模型 mdl-local（私有化 Llama3-70B），未调用外部大模型。
            </span>
          </div>
        )}

        {Object.keys(errors).length > 0 && (
          <div className="ac-hint ac-hint--danger ac-mt-3">
            <TriangleAlert size={14} />
            <span>
              还有 {Object.keys(errors).length} 处待修正：
              {Object.keys(errors)
                .map((k) => `${CREATE_FIELD_LABEL[k] ?? k}（${errors[k]}）`)
                .join('；')}
            </span>
          </div>
        )}

        <div className="ac-hint ac-mt-3">
          <ShieldCheck size={14} />
          <span>
            录入后该条目仅存在于本页 useState：已计入池内指标卡、需求池台账与价值成本矩阵（表格标记「新建 · 待同步」），
            但不会写回 data-mgmt 的 REQ_POOL；漏斗与来源分布仍按 PingCode 已同步的 {REQ_POOL.length} 条统计。
          </span>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ 详情子组件 */

/** 需求池条目完整详情 */
function PoolDetail({ item, score }: { item: ReqPoolItemDef; score: number }) {
  const submitter = item.submittedBy ? USER_MAP[item.submittedBy] : null;
  const role = ROLE_MAP[item.ownerRoleId];
  const reviews = REQ_REVIEWS.filter((r) => r.poolItemId === item.id);
  const chain = buildChain(item);
  const band = bandOf(score);

  return (
    <>
      <div className="ac-ai-block ac-mb-4">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          ag-pm · AI 优先级评分依据（{score} 分 · {band.label}）
        </div>
        <div className="ac-mt-2">{item.aiScoreReason}</div>
        <div className="ac-rp-score-calc">
          <span>
            4×{item.businessValue}（业务价值）+ 3×{item.urgency}（紧急度）+ 1.5×{item.riskScore}（风险）+ 1.5×(11−{item.techComplexity})（实现难度反向）= <b>{computeScore(item, SCORE_PRESETS[0])}</b>
          </span>
        </div>
      </div>

      <dl className="ac-kv ac-rp-kv ac-mb-4">
        <dt>标题</dt>
        <dd>{item.title}</dd>
        <dt>编号</dt>
        <dd className="ac-mono">
          {item.id} · {item.code}
          {item.epicId ? ` · Epic ${item.epicId}` : ' · 无平台内 Epic'}
        </dd>
        <dt>来源</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[SOURCE_TONE[item.sourceType] ?? 'neutral']}`}>{item.sourceType}</span>
          <span className="ac-rp-source-ref">{item.sourceRef}</span>
        </dd>
        <dt>提出人</dt>
        <dd>
          {submitter ? (
            <span className="ac-user">
              <span className={`ac-avatar ac-avatar--sm ${AVATAR_TONE[submitter.avatarColor]}`}>{submitter.initial}</span>
              <span className="ac-user-name">{submitter.name}</span>
              <span className="ac-user-meta">
                {submitter.title} · {submitter.dept}
                {submitter.isAi ? ' · AI 共享账号' : ''}
              </span>
            </span>
          ) : (
            <span className="ac-rp-external">
              <CircleDot size={12} className="ac-muted" />
              {item.externalName}（平台外提出人，无 USERS 账号）
            </span>
          )}
        </dd>
        <dt>提出时间</dt>
        <dd className="ac-mono">
          {item.submittedAt}（距今 {Math.max(0, Math.round((new Date(TODAY).getTime() - new Date(item.submittedAt).getTime()) / 86400000))} 天）
        </dd>
        <dt>阶段</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[STAGE_META[item.stage].tone]}`}>{item.stage}</span>
          <span className="ac-xs ac-muted">漏斗分组：{STAGE_META[item.stage].funnel}</span>
        </dd>
        <dt>四项输入</dt>
        <dd>
          <span className="ac-rp-inputs">
            <span>业务价值 <b>{item.businessValue}</b></span>
            <span>紧急度 <b>{item.urgency}</b></span>
            <span>风险 <b>{item.riskScore}</b></span>
            <span>技术复杂度 <b>{item.techComplexity}</b></span>
          </span>
        </dd>
        <dt>AI 建议</dt>
        <dd>
          {item.aiSuggestedSprintId ? (
            <>
              排入 <span className="ac-mono ac-brand-text">{item.aiSuggestedSprintId}</span>
              （{SPRINTS.filter((s) => s.id === item.aiSuggestedSprintId)[0]?.theme ?? ''}）· 预估 {item.estimatePoints} 点
            </>
          ) : (
            <>不建议排期 · 预估 {item.estimatePoints} 点</>
          )}
        </dd>
        <dt>标签</dt>
        <dd>
          <span className="ac-rp-tags">
            {item.tags.map((t) => (
              <span key={t} className="ac-tag ac-tag--sm ac-tag--outline">
                {t}
              </span>
            ))}
          </span>
        </dd>
        <dt>负责角色</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[role?.tagTone ?? 'neutral']}`}>{role?.name ?? item.ownerRoleId}</span>
          <span className="ac-xs ac-muted">{role?.desc}</span>
        </dd>
        <dt>评审人</dt>
        <dd>
          <span className="ac-avatar-group">
            {item.reviewers.map((uid) => (
              <span key={uid} className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[USER_MAP[uid]?.avatarColor ?? 'brand']}`} title={`${USER_MAP[uid]?.name ?? uid} · ${USER_MAP[uid]?.title ?? ''}`}>
                {USER_MAP[uid]?.initial ?? '?'}
              </span>
            ))}
          </span>
          <span className="ac-xs ac-muted">{item.reviewers.map((uid) => USER_MAP[uid]?.name ?? uid).join('、')}</span>
        </dd>
      </dl>

      <div className="ac-section-title">决策记录</div>
      {item.decisionNote ? (
        <div className="ac-rp-decision-block">
          <div className="ac-xs ac-muted ac-mono">决策日期 {item.decidedAt}</div>
          <div className="ac-rp-decision-text">{item.decisionNote}</div>
        </div>
      ) : (
        <div className="ac-empty ac-empty--sm">
          <span className="ac-empty-icon">
            <Clock size={18} />
          </span>
          <span className="ac-empty-title">尚未决策</span>
          <span className="ac-empty-desc">该条目仍处于「{item.stage}」，决策说明将在需求澄清会（CER-03，每周三 14:00）后回填。</span>
        </div>
      )}

      <div className="ac-section-title ac-mt-4">评审历史（{reviews.length} 轮）</div>
      {reviews.length === 0 ? (
        <div className="ac-empty ac-empty--sm">
          <span className="ac-empty-icon">
            <ClipboardList size={18} />
          </span>
          <span className="ac-empty-title">该条目尚未进入评审流程</span>
          <span className="ac-empty-desc">10 轮评审记录覆盖 8 个池条目（RP-01 / RP-03 / RP-07 / RP-09 / RP-13 / RP-16 / RP-18 / RP-19）。</span>
        </div>
      ) : (
        <div className="ac-timeline">
          {reviews.map((r) => (
            <div className={`ac-timeline-item ac-timeline-item--${OUTCOME_TONE[r.outcome] === 'slate' ? 'dim' : OUTCOME_TONE[r.outcome]}`} key={r.id}>
              <div className="ac-timeline-head">
                <span className="ac-timeline-title">
                  {r.id} · 第 {r.round} 轮 · {r.outcome}
                </span>
                <span className="ac-timeline-time">
                  {r.heldAt} · {r.mode} · {r.durationMin}min
                </span>
              </div>
              <div className="ac-timeline-desc">
                评分 {r.scoreBefore} → {r.scoreAfter}（{r.scoreAfter - r.scoreBefore > 0 ? '+' : ''}
                {r.scoreAfter - r.scoreBefore}）· 主持 {USER_MAP[r.chairId]?.name ?? r.chairId} · 参与 {r.attendeeIds.length} 人 · AI 提问 {r.aiQuestions.length} 个
                {r.conditions.length > 0 && ` · 决议条件 ${r.conditions.length} 条`}
              </div>
              {r.conditions.length > 0 && (
                <div className="ac-timeline-extra">
                  {r.conditions.map((c, i) => (
                    <div key={i} className="ac-rp-condition">
                      <Milestone size={11} />
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ac-section-title ac-mt-4">关联对象</div>
      <dl className="ac-kv ac-rp-kv">
        <dt>正式需求</dt>
        <dd>
          {chain.req ? (
            <>
              <span className="ac-mono ac-brand-text">{chain.req.id}</span> · {chain.req.code} · {chain.req.title}
              <div className="ac-xs ac-muted">
                {chain.req.statusLabel} · {chain.req.priority} · {chain.req.storyPoints} 点 · PRD {chain.req.prdVersion} · 迭代 {chain.req.sprintId}
              </div>
            </>
          ) : (
            <span className="ac-tag ac-tag--sm ac-tag--danger">
              <CircleSlash size={10} />
              未关联正式需求
            </span>
          )}
        </dd>
        <dt>用户故事</dt>
        <dd>
          {chain.stories.length === 0 ? (
            <span className="ac-xs ac-muted">—</span>
          ) : (
            <span className="ac-rp-tags">
              {chain.stories.map((s) => (
                <span key={s.id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[s.tone]}`} title={`${s.title} · ${s.points} 点 · ${s.statusLabel}`}>
                  {s.id} · {s.points} 点
                </span>
              ))}
            </span>
          )}
        </dd>
        <dt>任务</dt>
        <dd>
          {chain.tasks.length === 0 ? (
            <span className="ac-xs ac-muted">—</span>
          ) : (
            <span className="ac-rp-tags">
              {chain.tasks.map((t) => (
                <span
                  key={t.id}
                  className={`ac-tag ac-tag--sm ac-tag--${t.coverage >= G3_COVERAGE ? 'ok' : t.coverage > 0 ? 'warn' : 'danger'}`}
                  title={`${t.title} · ${t.stateLabel} · 覆盖 ${t.coverage}% · ${t.points} 点`}
                >
                  {t.id} · {t.stateLabel}
                </span>
              ))}
            </span>
          )}
        </dd>
        <dt>缺陷</dt>
        <dd>
          {chain.bugs.length === 0 ? (
            <span className="ac-xs ac-muted">无关联缺陷</span>
          ) : (
            <span className="ac-rp-tags">
              {chain.bugs.map((b) => (
                <span key={b.id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[b.tone]}`} title={`${b.title} · ${b.severity} · ${b.status}`}>
                  {b.id} · {b.priority}
                  {b.releaseBlocking && ' · 阻断发布'}
                </span>
              ))}
            </span>
          )}
        </dd>
        <dt>发布单</dt>
        <dd>
          {chain.releases.length === 0 ? (
            <span className="ac-xs ac-muted">未关联</span>
          ) : (
            <span className="ac-rp-tags">
              {chain.releases.map((r) => (
                <span
                  key={r.rel.id}
                  className={`ac-tag ac-tag--sm ac-tag--${r.rel.status === 'released' ? 'ok' : r.rel.status === 'blocked' ? 'danger' : 'warn'}`}
                  title={`${r.rel.title} · ${r.rel.version} · 窗口 ${r.rel.windowStart}`}
                >
                  {r.rel.id}（{r.level}）
                </span>
              ))}
            </span>
          )}
        </dd>
        <dt>追溯完整性</dt>
        <dd>
          <span className="ac-rp-tags">
            {(['l1', 'l2', 'l3', 'l4'] as const).map((k, i) => (
              <span key={k} className={`ac-tag ac-tag--sm ac-tag--${chain.links[k] ? 'ok' : 'danger'}`}>
                {chain.links[k] ? <Check size={10} /> : <CircleX size={10} />}
                {['池↔需求', '需求↔故事', '需求↔任务', '任务↔质量资产'][i]}
              </span>
            ))}
            <span className="ac-tag ac-tag--sm ac-tag--outline">覆盖率 {coverageOf(chain).pct}%</span>
          </span>
        </dd>
      </dl>

      {chain.breaks.length > 0 && (
        <div className="ac-hint ac-hint--danger ac-mt-3">
          <Siren size={14} />
          <span>断链 / 预警 {chain.breaks.length} 处：{chain.breaks.join('；')}。</span>
        </div>
      )}
    </>
  );
}

/** 评审轮次详情：AI 会前预读摘要 + 澄清问题清单 + 决议条件 + 评分变化说明 */
function ReviewDetail({ review, pool }: { review: ReqReviewRoundDef; pool?: ReqPoolItemDef }) {
  const chair = USER_MAP[review.chairId];
  const rounds = REQ_REVIEWS.filter((r) => r.poolItemId === review.poolItemId);
  const isLast = rounds[rounds.length - 1]?.id === review.id;
  const answered = !isLast || review.outcome === '通过' || review.outcome === '有条件通过';
  const delta = review.scoreAfter - review.scoreBefore;

  return (
    <>
      <div className="ac-ai-block ac-mb-4">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          ag-pm · AI 会前预读摘要（{review.id}）
        </div>
        <div className="ac-mt-2">{review.aiPreReadSummary}</div>
      </div>

      <dl className="ac-kv ac-rp-kv ac-mb-4">
        <dt>被评审条目</dt>
        <dd>
          {pool ? (
            <>
              <span className="ac-mono ac-brand-text">{pool.id}</span> · {pool.code}
              <div className="ac-rp-title">{pool.title}</div>
              <div className="ac-xs ac-muted">
                {pool.stage} · {pool.sourceType} · 当前 AI 分 {pool.aiPriorityScore}
              </div>
            </>
          ) : (
            <span className="ac-mono">{review.poolItemId}</span>
          )}
        </dd>
        <dt>轮次 / 形式</dt>
        <dd>
          第 {review.round} 轮 · {review.mode} · {review.durationMin} 分钟 · {review.heldAt}
        </dd>
        <dt>主持人</dt>
        <dd>
          <span className="ac-user">
            <span className={`ac-avatar ac-avatar--sm ${AVATAR_TONE[chair?.avatarColor ?? 'brand']}`}>{chair?.initial ?? '—'}</span>
            <span className="ac-user-name">{chair?.name ?? review.chairId}</span>
            <span className="ac-user-meta">{chair?.title}</span>
          </span>
        </dd>
        <dt>参与人</dt>
        <dd>
          <span className="ac-avatar-group">
            {review.attendeeIds.map((uid) => (
              <span key={uid} className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[USER_MAP[uid]?.avatarColor ?? 'brand']}`} title={`${USER_MAP[uid]?.name ?? uid} · ${USER_MAP[uid]?.title ?? ''}`}>
                {USER_MAP[uid]?.initial ?? '?'}
              </span>
            ))}
          </span>
          <span className="ac-xs ac-muted">{review.attendeeIds.map((uid) => USER_MAP[uid]?.name ?? uid).join('、')}</span>
        </dd>
        <dt>结论</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[OUTCOME_TONE[review.outcome]]}`}>{review.outcome}</span>
          {review.conditions.length > 0 && <span className="ac-xs ac-muted">附 {review.conditions.length} 条前置条件</span>}
        </dd>
        <dt>评分变化</dt>
        <dd>
          <span className="ac-rp-scoreflow ac-rp-scoreflow--lg">
            <span className="ac-muted">{review.scoreBefore}</span>
            <ArrowRight size={14} className={delta >= 0 ? 'ac-ok-text' : 'ac-danger-text'} />
            <b className={delta >= 0 ? 'ac-ok-text' : 'ac-danger-text'}>{review.scoreAfter}</b>
            <span className={`ac-rp-delta ${delta >= 0 ? 'ac-ok-text' : 'ac-danger-text'}`}>
              {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {delta > 0 ? '+' : ''}
              {delta} 分
            </span>
          </span>
        </dd>
      </dl>

      <div className="ac-section-title">AI 提出的澄清问题（{review.aiQuestions.length} 个）</div>
      <div className={`ac-hint ${answered ? 'ac-hint--ok' : 'ac-hint--warn'} ac-mb-3`}>
        {answered ? <CircleCheck size={14} /> : <TriangleAlert size={14} />}
        <span>
          {answered
            ? isLast
              ? `本轮结论为「${review.outcome}」，${review.aiQuestions.length} 个问题均在会上获得书面答复（闭环判定口径：末轮结论为通过 / 有条件通过即视为闭环）。`
              : `本轮为非末轮，${review.aiQuestions.length} 个问题在下一轮（${rounds[rounds.findIndex((r) => r.id === review.id) + 1]?.id ?? '—'}）的 AI 预读中确认全部闭环。`
            : `本轮结论为「${review.outcome}」，${review.aiQuestions.length} 个问题未在会上收敛 —— 这正是本轮被${review.outcome === '挂起' ? '挂起' : '退回'}的主因；未闭环问题不会自动消失，需在重新提池时逐条回答。`}
        </span>
      </div>
      <ol className="ac-rp-questions">
        {review.aiQuestions.map((q, i) => (
          <li key={i} className={answered ? 'ac-rp-question ac-rp-question--closed' : 'ac-rp-question'}>
            <span className="ac-rp-question-idx">Q{i + 1}</span>
            <span className="ac-rp-question-text">{q}</span>
            <span className={`ac-tag ac-tag--sm ac-rp-question-flag ${answered ? 'ac-tag--ok' : 'ac-tag--warn'}`}>
              {answered ? <Check size={10} /> : <Clock size={10} />}
              {answered ? '已答复' : '未闭环'}
            </span>
          </li>
        ))}
      </ol>

      {review.conditions.length > 0 && (
        <>
          <div className="ac-section-title ac-mt-4">决议前置条件（{review.conditions.length} 条）</div>
          <div className="ac-rp-conditions">
            {review.conditions.map((c, i) => (
              <div className="ac-rp-condition ac-rp-condition--lg" key={i}>
                <Milestone size={13} />
                <span>
                  <b>条件 {i + 1}</b> {c}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="ac-section-title ac-mt-4">评分变化说明</div>
      <div className="ac-rp-score-note">
        <p>
          本轮 AI 优先级分由 <b>{review.scoreBefore}</b> {delta >= 0 ? '上调' : '下调'}至 <b>{review.scoreAfter}</b>（
          {delta > 0 ? '+' : ''}
          {delta} 分），结论为「{review.outcome}」。
        </p>
        <p>
          {delta > 0
            ? `上调依据：AI 预读补齐了原先缺失的量化证据（${review.aiPreReadSummary.slice(0, 60)}…），使业务价值 / 风险两项输入获得实证支撑，四项输入经 4/3/1.5/1.5 加权重算后分值上升。`
            : delta < 0
              ? `下调依据：AI 预读暴露了提案中未成立的假设（${review.aiPreReadSummary.slice(0, 60)}…），使紧急度或业务价值输入被下修，重算后分值下降；这属于评分体系的正常自我修正，而非「否决」。`
              : '本轮分值未变化。'}
        </p>
        {isLast && pool && (
          <p>
            本轮为该条目的末轮评审，scoreAfter = {review.scoreAfter} 与 REQ_POOL.aiPriorityScore = {pool.aiPriorityScore}
            {review.scoreAfter === pool.aiPriorityScore ? ' 一致（数据层自洽约束满足）' : ' 不一致（需核对数据层）'}。
          </p>
        )}
        <p className="ac-xs ac-muted">
          人工介入：评分变化必须由主持人 {chair?.name ?? review.chairId} 在会中确认后落库，AI 不得自行改写优先级分；
          若对 AI 的四项输入有异议，可在池条目详情中修正输入后重新评分。
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 文案生成 */

/** 按口径预设渲染评分公式（含等价写法与边界校验） */
function formulaText(preset: ScorePreset): string {
  const w = preset.weights;
  const coef = (x: number) => (x * 10).toFixed(1).replace(/\.0$/, '');
  return [
    `# AI 优先级评分口径 · ${preset.name}`,
    ``,
    `aiPriorityScore = round( 10 × ( ${w.bv.toFixed(2)} × businessValue`,
    `                            + ${w.urg.toFixed(2)} × urgency`,
    `                            + ${w.risk.toFixed(2)} × riskScore`,
    `                            + ${w.inv.toFixed(2)} × (11 − techComplexity) ) )`,
    ``,
    `# 等价的一元系数写法（四项输入均为 1 ~ 10 的整数）`,
    `                = ${coef(w.bv)} × businessValue`,
    `                + ${coef(w.urg)} × urgency`,
    `                + ${coef(w.risk)} × riskScore`,
    `                + ${coef(w.inv)} × (11 − techComplexity)`,
    ``,
    `# 权重合计 ${(w.bv + w.urg + w.risk + w.inv).toFixed(2)}`,
    `  businessValue           ${(w.bv * 100).toFixed(0)}%   ← 业务价值最重`,
    `  urgency                 ${(w.urg * 100).toFixed(0)}%   ← 紧急度次之`,
    `  riskScore               ${(w.risk * 100).toFixed(0)}%   ← 不做的损失`,
    `  (11 − techComplexity)   ${(w.inv * 100).toFixed(0)}%   ← 实现难度反向`,
    ``,
    `# 边界校验（取值域 10 ~ 100）`,
    `  bv=urg=risk=10 且 tc=1  → ${Math.round(10 * (w.bv * 10 + w.urg * 10 + w.risk * 10 + w.inv * 10))}`,
    `  bv=urg=risk=1  且 tc=10 → ${Math.round(10 * (w.bv * 1 + w.urg * 1 + w.risk * 1 + w.inv * 1))}`,
    ``,
    `# tone 分档规则（规则 B）`,
    `  stage === '已拒绝' → slate      stage === '已交付' → ok`,
    `  否则：score ≥ 80 → brand(P0)    65 ~ 79 → warn(P1)`,
    `        45 ~ 64 → info(P2)        < 45 → neutral(观察级)`,
    ``,
    `# 口径说明`,
    `  ${preset.note}`,
  ].join('\n');
}
