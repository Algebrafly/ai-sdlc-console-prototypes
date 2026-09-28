/**
 * 架构设计与任务拆解（pageId: design）
 * 需求选择器 · AI 拆解与预估总览 · 分层架构 + 组件关系图 · 接口契约表 ·
 * 任务树（行内编辑 / AI 再拆解）· AI 工时预估（人工三点估算 × AI 集成预估）·
 * AI 任务拆解建议（DAG / 逐条采纳 / 质量校验）· PingCode 批量同步
 */
import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Boxes,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileJson,
  GitBranch,
  Layers,
  Link2,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sigma,
  Sparkles,
  Target,
  TrendingDown,
  Undo2,
  Upload,
  Workflow,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  agents,
  API_CONTRACTS,
  ARCH_COMPONENTS,
  ARCH_COMPONENT_MAP,
  ARCH_LAYERS,
  ARCH_LINKS,
  CURRENT_SPRINT,
  CURRENT_USER,
  idMappings,
  models,
  REQUIREMENTS,
  REQUIREMENT_MAP,
  TASKS,
  TASK_DEPS,
  TASK_MAP,
  TASK_STATE_MAP,
  TODAY,
  USERS,
  USER_MAP,
  type Tone,
} from '../data';
import {
  AI_AUTOMATION_FLOWS,
  AI_BREAKDOWN_SUGGESTIONS,
  AI_EFFORT_ESTIMATES,
  AI_FLOW_TODAY,
  EFFORT_ACCURACY_TREND_CODE_SIZE,
  EFFORT_ACCURACY_TREND_COMPLEXITY,
  EFFORT_ACCURACY_TREND_ENSEMBLE,
  type AiBreakdownSuggestionDef,
  type AiEffortEstimateDef,
  type BreakdownTaskDef,
} from '../data-ai-flow';
import './design.css';

type Task = (typeof TASKS)[number];
type ComponentDef = (typeof ARCH_COMPONENTS)[number];
type TabId = 'arch' | 'api' | 'tasks' | 'estimate' | 'breakdown';

/* ============================================================
 * 确定性伪随机（仅用于 PingCode 批量同步的结果演示，
 * 以工作项 id 为种子本地生成，保证同一工作项每次渲染一致）
 * ============================================================ */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let s = seed || 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/* ============================================================
 * AI 工时预估 / AI 任务拆解建议（数据源：data-ai-flow.ts）
 *   三点估算与「AI 再拆解」不再本地伪随机生成，全部消费真实 AI 产出。
 * ============================================================ */

/** 12 值 Tone 归并到 style.css 实际存在的 7 种 ac-tag--{tone} */
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

function tagTone(tone: Tone): string {
  return TAG_TONE[tone] ?? 'neutral';
}

/** 5 种预估方法的中文化与色标 */
const METHOD_LABEL: Record<AiEffortEstimateDef['method'], string> = {
  'history-regression': '历史回归',
  'similar-task': '相似任务',
  'code-size': '代码规模',
  'complexity-model': '复杂度模型',
  ensemble: '集成预估',
};

const METHOD_TONE: Record<AiEffortEstimateDef['method'], string> = {
  'history-regression': 'info',
  'similar-task': 'brand',
  'code-size': 'ok',
  'complexity-model': 'warn',
  ensemble: 'ai',
};

const ESTIMATE_STATUS_LABEL: Record<AiEffortEstimateDef['status'], string> = {
  suggested: 'AI 建议待决',
  adopted: '已采纳',
  overridden: '人工覆写',
};

const ESTIMATE_STATUS_TONE: Record<AiEffortEstimateDef['status'], string> = {
  suggested: 'ai',
  adopted: 'ok',
  overridden: 'warn',
};

const BREAKDOWN_STATUS_LABEL: Record<AiBreakdownSuggestionDef['status'], string> = {
  pending: '待决策',
  accepted: '全部采纳',
  partial: '部分采纳',
  rejected: '整条否决',
};

const BREAKDOWN_STATUS_TONE: Record<AiBreakdownSuggestionDef['status'], string> = {
  pending: 'warn',
  accepted: 'ok',
  partial: 'ai',
  rejected: 'neutral',
};

const STRATEGY_TONE: Record<AiBreakdownSuggestionDef['strategy'], string> = {
  按限界上下文: 'brand',
  按接口契约: 'info',
  按数据流: 'ok',
  按风险隔离: 'danger',
  按可独立验收: 'ai',
};

const RISK_TONE: Record<BreakdownTaskDef['riskLevel'], string> = { 低: 'ok', 中: 'warn', 高: 'danger' };

/** 故事点斐波那契刻度（拆解质量校验用） */
const FIB_POINTS = [1, 2, 3, 5, 8, 13, 21];

const MODEL_MAP = Object.fromEntries(models.map((m) => [m.id, m]));
const AGENT_MAP = Object.fromEntries(agents.map((a) => [a.id, a]));
/** sourceId（REQ-24xx / TASK-24xx）→ 拆解建议 */
const BREAKDOWN_BY_SOURCE = Object.fromEntries(AI_BREAKDOWN_SUGGESTIONS.map((s) => [s.sourceId, s]));

/** 与「拆解 → 排期 → 编码」相关的端到端编排流，作为回放 Modal 的入口说明 */
const PLAN_FLOW = AI_AUTOMATION_FLOWS.find((f) => f.id === 'AIF-06') ?? AI_AUTOMATION_FLOWS[0];

/** 三条方法的准确率收敛轨迹（各 5 个采样点） */
const TREND_SERIES: { key: string; label: string; color: string; points: typeof EFFORT_ACCURACY_TREND_ENSEMBLE }[] = [
  { key: 'ensemble', label: '集成预估', color: '#7c3aed', points: EFFORT_ACCURACY_TREND_ENSEMBLE },
  { key: 'code-size', label: '代码规模', color: '#10b981', points: EFFORT_ACCURACY_TREND_CODE_SIZE },
  { key: 'complexity-model', label: '复杂度模型', color: '#f59e0b', points: EFFORT_ACCURACY_TREND_COMPLEXITY },
];

/** 特征贡献瀑布图的配色（按 featureWeights 顺序） */
const FEATURE_COLORS = ['#4f46e5', '#7c3aed', '#3b82f6', '#0d9488', '#f59e0b', '#ef4444', '#db2777'];
/** 风险因子占比条的配色 */
const RISK_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#0d9488', '#94a3b8'];

/** 置信区间条的统一横轴上限（小时）：覆盖 12 条预估中最大的悲观值 54h */
const EST_DOMAIN_MAX = 60;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${AI_FLOW_TODAY} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** PERT = (乐观 + 4 × 最可能 + 悲观) / 6，用于界面复核数据中的 pert 字段 */
function calcPert(o: number, m: number, p: number): number {
  return round1((o + 4 * m + p) / 6);
}

/** 偏差 % =（AI 预估 − PERT）/ PERT × 100 */
function calcVariance(ai: number, pert: number): number {
  return pert === 0 ? 0 : round1(((ai - pert) / pert) * 100);
}

/**
 * 采纳门禁：置信度 < 70% 且单一风险因子权重 ≥ 50% 时，
 * 认为不确定性集中在一个外生变量上，禁止直接采纳 AI 预估。
 */
function estimateGate(e: AiEffortEstimateDef): { blocked: boolean; reason: string } {
  const top = e.riskFactors.reduce((max, r) => (r.weightPct > max.weightPct ? r : max), e.riskFactors[0]);
  const blocked = e.confidencePct < 70 && top.weightPct >= 50;
  return {
    blocked,
    reason: blocked
      ? `置信度仅 ${e.confidencePct}%（门禁阈值 70%），且风险因子「${top.factor}」独占 ${top.weightPct}% 权重（≥ 50%）——不确定性集中在单一外生变量，直接采纳会把该风险写入排期基线。需勾选风险知悉后方可采纳。`
      : '',
  };
}

/* ---------- 拆解质量校验 ---------- */
interface CheckItem {
  name: string;
  pass: boolean;
  detail: string;
}

function hasCycle(tasks: BreakdownTaskDef[]): boolean {
  const byOrder: Record<number, BreakdownTaskDef> = {};
  tasks.forEach((t) => {
    byOrder[t.order] = t;
  });
  const state: Record<number, number> = {};
  const visit = (order: number): boolean => {
    if (state[order] === 1) return true;
    if (state[order] === 2) return false;
    state[order] = 1;
    const node = byOrder[order];
    for (const dep of node ? node.dependsOnOrder : []) {
      if (visit(dep)) return true;
    }
    state[order] = 2;
    return false;
  };
  return tasks.some((t) => visit(t.order));
}

function longestChainPoints(tasks: BreakdownTaskDef[]): number {
  const byOrder: Record<number, BreakdownTaskDef> = {};
  tasks.forEach((t) => {
    byOrder[t.order] = t;
  });
  const memo: Record<number, number> = {};
  const best = (order: number): number => {
    if (memo[order] !== undefined) return memo[order];
    const node = byOrder[order];
    if (!node) return 0;
    memo[order] = node.points;
    const up = node.dependsOnOrder.length ? Math.max(...node.dependsOnOrder.map(best)) : 0;
    memo[order] = up + node.points;
    return memo[order];
  };
  return tasks.length ? Math.max(...tasks.map((t) => best(t.order))) : 0;
}

/** 拆解结果的 9 项自检：AI 产出必须可验证 */
function runBreakdownChecks(s: AiBreakdownSuggestionDef): CheckItem[] {
  const tasks = s.suggestedTasks;
  const orders = tasks.map((t) => t.order);
  const orderSet = new Set(orders);
  const byOrder: Record<number, BreakdownTaskDef> = {};
  tasks.forEach((t) => {
    byOrder[t.order] = t;
  });

  const seqOk = orders.length === orderSet.size && orders.every((o, i) => o === i + 1);
  const dangling = tasks.flatMap((t) => t.dependsOnOrder.filter((d) => !orderSet.has(d)));
  const cyclic = hasCycle(tasks);
  const badPoints = tasks.filter((t) => !FIB_POINTS.includes(t.points)).map((t) => `#${t.order}`);
  const sumPoints = tasks.reduce((a, t) => a + t.points, 0);
  const missingEdges: string[] = [];
  for (let i = 0; i < s.criticalPathOrders.length - 1; i += 1) {
    const child = byOrder[s.criticalPathOrders[i + 1]];
    if (!child || !child.dependsOnOrder.includes(s.criticalPathOrders[i])) {
      missingEdges.push(`${s.criticalPathOrders[i]}→${s.criticalPathOrders[i + 1]}`);
    }
  }
  const cpPoints = s.criticalPathOrders.reduce((a, o) => a + (byOrder[o]?.points ?? 0), 0);
  const longest = longestChainPoints(tasks);
  const deltaOk = s.comparedWithHumanPlan.aiDeltaPoints === sumPoints - s.comparedWithHumanPlan.humanTotalPoints;

  let upstreamOk = false;
  let upstreamDetail = '';
  if (s.sourceType === 'requirement') {
    const req = REQUIREMENT_MAP[s.sourceId];
    const count = req ? req.taskIds.length : 0;
    upstreamOk = count === s.comparedWithHumanPlan.humanTaskCount;
    upstreamDetail = `REQUIREMENT_MAP['${s.sourceId}'].taskIds = ${count} 项（${req ? req.taskIds.join('、') : '—'}），与 comparedWithHumanPlan.humanTaskCount ${s.comparedWithHumanPlan.humanTaskCount} ${upstreamOk ? '一致' : '不一致'}`;
  } else {
    const inDeps = TASK_DEPS.filter((d) => d.to === s.sourceId);
    const entries = tasks.filter((t) => t.dependsOnOrder.length === 0);
    upstreamOk = entries.length === inDeps.length;
    upstreamDetail = `TASK_DEPS 中指向 ${s.sourceId} 的依赖 ${inDeps.length} 条（${inDeps.map((d) => d.id).join('、') || '无'}），拆解后无前置的入口子任务 ${entries.length} 个（order ${entries.map((t) => t.order).join('、') || '无'}）${upstreamOk ? '，上下游一一对应' : '，入口多于既有上游依赖，疑似 AI 引入伪并行'}`;
  }

  const assignable = tasks.filter((t) => t.assigneeSuggestionId !== null);
  let skillHit = 0;
  let skillTotal = 0;
  assignable.forEach((t) => {
    const user = USER_MAP[t.assigneeSuggestionId as string];
    const skills = user ? user.skills : [];
    t.skillRequirement.forEach((sk) => {
      skillTotal += 1;
      if (skills.includes(sk)) skillHit += 1;
    });
  });
  const skillPct = skillTotal === 0 ? 100 : Math.round((skillHit / skillTotal) * 1000) / 10;
  const skillOk = skillPct >= 60;

  return [
    {
      name: 'order 从 1 连续编号且唯一',
      pass: seqOk,
      detail: seqOk ? `1 ~ ${orders.length} 连续，无重号` : `实际序列 ${orders.join(', ')}，存在断号或重号`,
    },
    {
      name: 'dependsOnOrder 引用的 order 均存在',
      pass: dangling.length === 0,
      detail: dangling.length === 0 ? `${tasks.reduce((a, t) => a + t.dependsOnOrder.length, 0)} 条依赖边全部指向有效 order` : `悬空引用：order ${dangling.join(', ')}`,
    },
    {
      name: '依赖图无环（DFS 染色）',
      pass: !cyclic,
      detail: cyclic ? '检测到环形依赖，无法拓扑排序' : '拓扑排序通过，可按层并行开工',
    },
    {
      name: '点数均落在斐波那契刻度',
      pass: badPoints.length === 0,
      detail: badPoints.length === 0 ? `全部取自 {${FIB_POINTS.slice(0, 5).join(', ')}}：${tasks.map((t) => t.points).join(' / ')}` : `非法点数子任务 ${badPoints.join(', ')}`,
    },
    {
      name: 'totalPoints = Σ suggestedTasks[].points',
      pass: s.totalPoints === sumPoints,
      detail: `Σpoints = ${sumPoints}，totalPoints = ${s.totalPoints}`,
    },
    {
      name: 'criticalPathOrders 上依赖边真实存在且为最长点数链',
      pass: missingEdges.length === 0 && cpPoints === s.criticalPathPoints && cpPoints === longest,
      detail: `关键路径 order [${s.criticalPathOrders.join(' → ')}]${missingEdges.length ? `，缺失依赖边 ${missingEdges.join(', ')}` : '，相邻节点依赖边齐备'}；路径点数 ${cpPoints}（criticalPathPoints ${s.criticalPathPoints}），全图最长点数链 ${longest}`,
    },
    {
      name: 'aiDeltaPoints = totalPoints − humanTotalPoints',
      pass: deltaOk,
      detail: `${sumPoints} − ${s.comparedWithHumanPlan.humanTotalPoints} = ${sumPoints - s.comparedWithHumanPlan.humanTotalPoints}，aiDeltaPoints = ${s.comparedWithHumanPlan.aiDeltaPoints}`,
    },
    { name: '与既有 TASK_DEPS / 需求任务清单上下游对齐', pass: upstreamOk, detail: upstreamDetail },
    {
      name: '建议承接人技能覆盖率 ≥ 60%',
      pass: skillOk,
      detail: `${assignable.length} 个指派子任务共 ${skillTotal} 项技能要求，命中 ${skillHit} 项（${skillPct}%）；${tasks.length - assignable.length} 个 assigneeSuggestionId 为 null 的子任务交由 AI 智能体执行，不参与匹配`,
    },
  ];
}

/* ---------- 拆解决策（乐观更新覆盖层） ---------- */
interface BrkDecision {
  status: AiBreakdownSuggestionDef['status'];
  acceptedOrders: number[];
  rejectedOrders: { order: number; reason: string }[];
  decidedBy: string | null;
  decidedAt: string;
  decisionNote: string;
}

interface BrkDraft {
  accept: Record<number, boolean>;
  reject: Record<number, boolean>;
  reasons: Record<number, string>;
}

function baselineDecision(s: AiBreakdownSuggestionDef): BrkDecision {
  return {
    status: s.status,
    acceptedOrders: [...s.acceptedOrders],
    rejectedOrders: s.rejectedOrders.map((r) => ({ order: r.order, reason: r.reason })),
    decidedBy: s.decidedBy,
    decidedAt: s.decidedAt,
    decisionNote: s.decisionNote,
  };
}

function draftFromDecision(s: AiBreakdownSuggestionDef, d: BrkDecision): BrkDraft {
  const accept: Record<number, boolean> = {};
  const reject: Record<number, boolean> = {};
  const reasons: Record<number, string> = {};
  s.suggestedTasks.forEach((t) => {
    accept[t.order] = d.acceptedOrders.includes(t.order);
    const hit = d.rejectedOrders.find((r) => r.order === t.order);
    reject[t.order] = Boolean(hit);
    reasons[t.order] = hit ? hit.reason : '';
  });
  return { accept, reject, reasons };
}

/** 拆解结果的 DAG 分层：depth = 0（无前置）或 1 + max(depth(前置)) */
function layoutDepths(tasks: BreakdownTaskDef[]): Record<number, number> {
  const byOrder: Record<number, BreakdownTaskDef> = {};
  tasks.forEach((t) => {
    byOrder[t.order] = t;
  });
  const depth: Record<number, number> = {};
  const resolve = (order: number): number => {
    if (depth[order] !== undefined) return depth[order];
    const node = byOrder[order];
    depth[order] = 0;
    if (!node || node.dependsOnOrder.length === 0) return 0;
    depth[order] = 1 + Math.max(...node.dependsOnOrder.map(resolve));
    return depth[order];
  };
  tasks.forEach((t) => resolve(t.order));
  return depth;
}

/* ---------- 视觉映射 ---------- */
const TONE_HEX: Record<string, string> = {
  brand: '#4f46e5',
  ai: '#7c3aed',
  info: '#3b82f6',
  slate: '#64748b',
  ok: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  teal: '#0d9488',
  pink: '#db2777',
  indigo: '#4338ca',
  amber: '#b45309',
  neutral: '#94a3b8',
};

function toneHex(tone: string): string {
  return TONE_HEX[tone] ?? '#94a3b8';
}

const LINK_COLOR: Record<string, string> = { sync: '#4f46e5', async: '#7c3aed', data: '#3b82f6' };
const LINK_DASH: Record<string, string | undefined> = { sync: undefined, async: '6 4', data: '1.5 3.5' };

const PRIORITY_TONE: Record<string, string> = { P0: 'danger', P1: 'warn', P2: 'neutral' };
const WORK_ITEM_TYPE: Record<string, string> = {
  开发: '需求 / 任务',
  联调: '任务',
  测试: '测试用例',
  发布: '发布单',
  技术债: '技术债',
};

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'arch', label: '架构文档', icon: Boxes },
  { id: 'api', label: '接口定义', icon: FileJson },
  { id: 'tasks', label: '任务清单', icon: ListChecks },
  { id: 'estimate', label: 'AI 工时预估', icon: Clock },
  { id: 'breakdown', label: 'AI 拆解建议', icon: GitBranch },
];

/* ============================================================
 * SVG 组件关系图布局参数
 * ============================================================ */
const NODE_W = 138;
const NODE_H = 46;
const GAP_X = 24;
const GAP_Y = 52;
const PAD_L = 84;
const PAD_T = 30;

interface NodeBox {
  id: string;
  x: number;
  y: number;
  layerId: string;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ============================================================
 * 同步弹窗数据结构
 * ============================================================ */
type SyncState = 'pending' | 'syncing' | 'ok' | 'retrying' | 'failed';

interface SyncItem {
  taskId: string;
  /** 平台标识（TASK-24xx），映射关系的左侧 */
  platformId: string;
  /** PingCode 工作项编号（PC-ORD-24xx），映射关系的右侧 */
  code: string;
  title: string;
  action: 'create' | 'update';
  externalId: string;
  workItemType: string;
  state: SyncState;
  message: string;
}

interface ToastItem {
  id: number;
  tone: 'ok' | 'warn' | 'danger' | 'ai';
  text: string;
}

interface TaskOverride {
  title: string;
  ownerId: string;
  estimateHours: number;
}

/** AI 工时预估的本地覆盖层：采纳 / 保持人工 / 手动覆写 */
interface EstimateOverride {
  status: AiEffortEstimateDef['status'];
  adoptedValue: number | null;
}

/** 「AI 拆解与预估」回放流程的单步 */
interface ReplayStep {
  name: string;
  detail: string;
  durationSec: number;
  items: number;
  issues: number;
}

/* ============================================================
 * 手绘 SVG 图表（全部内联，不引入任何图表库）
 * ============================================================ */

/** ① 特征权重贡献瀑布图：featureWeights 逐项 contribution 从 0 累加成 aiEstimateHours */
function FeatureWaterfall({ estimate }: { estimate: AiEffortEstimateDef }) {
  const feats = estimate.historyBasis.featureWeights;
  const total = estimate.aiEstimateHours;
  const W = 664;
  const H = 276;
  const padL = 46;
  const padR = 12;
  const padT = 26;
  const padB = 74;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / (feats.length + 1);
  const barW = Math.min(54, slot * 0.58);
  const yMax = Math.max(total * 1.14, 1);
  const yOf = (v: number) => padT + plotH - (v / yMax) * plotH;
  const xOf = (i: number) => padL + i * slot + (slot - barW) / 2;
  let cum = 0;
  const bars = feats.map((f, i) => {
    const from = round1(cum);
    cum += f.contribution;
    return { f, i, from, to: round1(cum) };
  });
  const sumWeight = feats.reduce((a, f) => a + f.weight, 0);
  const sumContrib = round1(feats.reduce((a, f) => a + f.contribution, 0));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="特征权重贡献瀑布图">
      {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
        const v = round1(yMax * r);
        return (
          <g key={i}>
            <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="#e8ebf1" strokeWidth={1} />
            <text className="ac-dg-svg-axis" x={padL - 8} y={yOf(v) + 3.5} textAnchor="end">
              {v}h
            </text>
          </g>
        );
      })}
      {bars.map((b) => (
        <g key={b.f.feature}>
          <title>{`${b.f.feature}｜weight ${b.f.weight.toFixed(2)}｜contribution ${b.f.contribution}h｜累计 ${b.from} → ${b.to}h`}</title>
          <rect
            x={xOf(b.i)}
            y={yOf(b.to)}
            width={barW}
            height={Math.max(2, yOf(b.from) - yOf(b.to))}
            rx={3}
            fill={FEATURE_COLORS[b.i % FEATURE_COLORS.length]}
            opacity={0.9}
          />
          <text className="ac-dg-svg-val" x={xOf(b.i) + barW / 2} y={yOf(b.to) - 6} textAnchor="middle">
            +{b.f.contribution}
          </text>
          <text className="ac-dg-svg-cat" x={xOf(b.i) + barW / 2} y={H - padB + 18} textAnchor="middle">
            {b.f.feature}
          </text>
          <text className="ac-dg-svg-sub" x={xOf(b.i) + barW / 2} y={H - padB + 32} textAnchor="middle">
            w {b.f.weight.toFixed(2)}
          </text>
          {b.i < bars.length - 1 ? (
            <line x1={xOf(b.i) + barW} y1={yOf(b.to)} x2={xOf(b.i + 1)} y2={yOf(b.to)} stroke="#c3c9d4" strokeWidth={1} strokeDasharray="3 3" />
          ) : null}
        </g>
      ))}
      <g>
        <line x1={xOf(bars.length - 1) + barW} y1={yOf(total)} x2={xOf(bars.length)} y2={yOf(total)} stroke="#c3c9d4" strokeWidth={1} strokeDasharray="3 3" />
        <rect x={xOf(bars.length)} y={yOf(total)} width={barW} height={Math.max(2, padT + plotH - yOf(total))} rx={3} fill="#131a24" opacity={0.86} />
        <text className="ac-dg-svg-val" x={xOf(bars.length) + barW / 2} y={yOf(total) - 6} textAnchor="middle">
          {total}h
        </text>
        <text className="ac-dg-svg-cat" x={xOf(bars.length) + barW / 2} y={H - padB + 18} textAnchor="middle">
          AI 预估合计
        </text>
        <text className="ac-dg-svg-sub" x={xOf(bars.length) + barW / 2} y={H - padB + 32} textAnchor="middle">
          Σcontribution
        </text>
      </g>
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#c9cfd9" strokeWidth={1.2} />
      <text className="ac-dg-svg-note" x={padL} y={H - 10}>
        {`口径：Σweight = ${sumWeight.toFixed(2)}（≡ 1.00）· Σcontribution = ${sumContrib}h（≡ aiEstimateHours ${total}h）`}
      </text>
    </svg>
  );
}

/** ② 人工三点估算区间带 × AI 预估与置信区间（同一小时横轴） */
function HumanVsAiChart({ estimate }: { estimate: AiEffortEstimateDef }) {
  const h = estimate.humanEstimateHours;
  const band = estimate.confidenceBand;
  const W = 664;
  const H = 196;
  const padL = 58;
  const padR = 22;
  const padT = 20;
  const axisY = H - 38;
  const lo = Math.min(h.optimistic, band.low) * 0.88;
  const hi = Math.max(h.pessimistic, band.high) * 1.08;
  const xOf = (v: number) => padL + ((v - lo) / Math.max(0.001, hi - lo)) * (W - padL - padR);
  const humanY = padT + 24;
  const aiY = padT + 82;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => round1(lo + (hi - lo) * r));
  const aiInHuman = estimate.aiEstimateHours >= h.optimistic && estimate.aiEstimateHours <= h.pessimistic;
  const pertInBand = h.pert >= band.low && h.pert <= band.high;
  const diamond = (cx: number, cy: number, r: number) => `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="人工三点估算与 AI 预估对照图">
      <text className="ac-dg-svg-cat" x={8} y={humanY + 4}>
        人工三点
      </text>
      <text className="ac-dg-svg-cat" x={8} y={aiY + 4}>
        AI 预估
      </text>
      {/* 人工 O ~ P 区间带 */}
      <rect x={xOf(h.optimistic)} y={humanY - 11} width={Math.max(2, xOf(h.pessimistic) - xOf(h.optimistic))} height={22} rx={5} fill="#eef2ff" stroke="#c7d2fe" strokeWidth={1.2} />
      <line x1={xOf(h.mostLikely)} y1={humanY - 15} x2={xOf(h.mostLikely)} y2={humanY + 15} stroke="#4f46e5" strokeWidth={2} />
      <text className="ac-dg-svg-sub" x={xOf(h.optimistic)} y={humanY - 18} textAnchor="middle">
        O {h.optimistic}
      </text>
      <text className="ac-dg-svg-sub" x={xOf(h.mostLikely)} y={humanY + 30} textAnchor="middle">
        M {h.mostLikely}
      </text>
      <text className="ac-dg-svg-sub" x={xOf(h.pessimistic)} y={humanY - 18} textAnchor="middle">
        P {h.pessimistic}
      </text>
      <polygon points={diamond(xOf(h.pert), humanY, 6.5)} fill="#312e81" stroke="#fff" strokeWidth={1.4} />
      <text className="ac-dg-svg-val" x={xOf(h.pert) + 11} y={humanY + 4}>
        PERT {h.pert}h
      </text>
      {/* AI 置信区间带 */}
      <rect x={xOf(band.low)} y={aiY - 11} width={Math.max(2, xOf(band.high) - xOf(band.low))} height={22} rx={5} fill="#f5f0ff" stroke="#ddd0f7" strokeWidth={1.2} />
      <line x1={xOf(band.low)} y1={aiY - 15} x2={xOf(band.low)} y2={aiY + 15} stroke="#a78bda" strokeWidth={1.4} />
      <line x1={xOf(band.high)} y1={aiY - 15} x2={xOf(band.high)} y2={aiY + 15} stroke="#a78bda" strokeWidth={1.4} />
      <text className="ac-dg-svg-sub" x={xOf(band.low)} y={aiY + 30} textAnchor="middle">
        {band.low}
      </text>
      <text className="ac-dg-svg-sub" x={xOf(band.high)} y={aiY + 30} textAnchor="middle">
        {band.high}
      </text>
      <circle cx={xOf(estimate.aiEstimateHours)} cy={aiY} r={6} fill="#7c3aed" stroke="#fff" strokeWidth={1.6} />
      <text className="ac-dg-svg-val" x={xOf(estimate.aiEstimateHours)} y={aiY - 16} textAnchor="middle">
        AI {estimate.aiEstimateHours}h
      </text>
      {/* 引导线 + 横轴 */}
      <line x1={xOf(h.pert)} y1={humanY + 12} x2={xOf(h.pert)} y2={axisY} stroke="#c7d2fe" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={xOf(estimate.aiEstimateHours)} y1={aiY + 12} x2={xOf(estimate.aiEstimateHours)} y2={axisY} stroke="#ddd0f7" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="#c9cfd9" strokeWidth={1.2} />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={xOf(t)} y1={axisY} x2={xOf(t)} y2={axisY + 5} stroke="#c9cfd9" strokeWidth={1} />
          <text className="ac-dg-svg-axis" x={xOf(t)} y={axisY + 18} textAnchor="middle">
            {t}h
          </text>
        </g>
      ))}
      <text className="ac-dg-svg-note" x={padL} y={H - 6}>
        {`AI 值${aiInHuman ? '落在' : '未落在'}人工 O~P 区间内 · 人工 PERT ${pertInBand ? '落在' : '未落在'} AI 置信区间 ${band.low}~${band.high}h 内 · 偏差 ${estimate.variancePct > 0 ? '+' : ''}${estimate.variancePct}%`}
      </text>
    </svg>
  );
}

/** ③ 风险因子占比条（Σ weightPct = 100） */
function RiskShareBar({ estimate }: { estimate: AiEffortEstimateDef }) {
  const W = 664;
  const H = 26;
  let cursor = 0;
  const segs = estimate.riskFactors.map((r, i) => {
    const w = (r.weightPct / 100) * W;
    const seg = { r, i, x: cursor, w };
    cursor += w;
    return seg;
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="风险因子权重占比条">
      {segs.map((s) => (
        <g key={s.r.factor}>
          <title>{`${s.r.factor}｜${s.r.weightPct}%｜${s.r.note}`}</title>
          <rect x={s.x} y={1} width={Math.max(1, s.w - 2)} height={H - 2} rx={3} fill={RISK_COLORS[s.i % RISK_COLORS.length]} opacity={0.88} />
          {s.r.weightPct >= 12 ? (
            <text className="ac-dg-svg-seg" x={s.x + s.w / 2} y={H / 2 + 4} textAnchor="middle">
              {s.r.weightPct}%
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** ④ 三种方法的工时预估误差收敛折线（各 5 个采样点） */
function AccuracyTrendChart() {
  const W = 620;
  const H = 244;
  const padL = 46;
  const padR = 76;
  const padT = 20;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yMax = 36;
  const count = TREND_SERIES[0].points.length;
  const xOf = (i: number) => padL + (i / Math.max(1, count - 1)) * plotW;
  const yOf = (v: number) => padT + plotH - (v / yMax) * plotH;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="AI 工时预估误差收敛趋势">
      {[0, 10, 20, 30].map((v) => (
        <g key={v}>
          <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="#e8ebf1" strokeWidth={1} />
          <text className="ac-dg-svg-axis" x={padL - 8} y={yOf(v) + 3.5} textAnchor="end">
            ±{v}%
          </text>
        </g>
      ))}
      {Array.from({ length: count }).map((_, i) => (
        <text className="ac-dg-svg-axis" key={i} x={xOf(i)} y={H - padB + 20} textAnchor="middle">
          样本 {i + 1}
        </text>
      ))}
      {TREND_SERIES.map((s) => {
        const pts = s.points.map((p, i) => `${xOf(i)},${yOf(p.errorPct)}`).join(' ');
        const first = s.points[0];
        const last = s.points[count - 1];
        return (
          <g key={s.key}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p, i) => (
              <circle key={p.taskId} cx={xOf(i)} cy={yOf(p.errorPct)} r={3.6} fill="#fff" stroke={s.color} strokeWidth={2}>
                <title>{`${s.label}｜${p.taskId}｜预估 ${p.estimated}h / 实际 ${p.actual}h｜errorPct = |${p.estimated} − ${p.actual}| / ${p.actual} × 100 = ${p.errorPct}%`}</title>
              </circle>
            ))}
            <text className="ac-dg-svg-val" x={xOf(0)} y={yOf(first.errorPct) - 10} textAnchor="middle" fill={s.color}>
              {first.errorPct}%
            </text>
            <text className="ac-dg-svg-val" x={xOf(count - 1) + 10} y={yOf(last.errorPct) + 4} fill={s.color}>
              {`±${last.errorPct}%`}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#c9cfd9" strokeWidth={1.2} />
      <text className="ac-dg-svg-note" x={padL} y={H - 6}>
        errorPct = |estimated − actual| / actual × 100 · 横轴为近 5 个已交付任务的采样顺序（悬停查看 taskId）
      </text>
    </svg>
  );
}

/** ⑤ 拆解结果 DAG：按拓扑深度分列，关键路径高亮，同列即可并行泳道 */
function BreakdownDag({ suggestion, decision }: { suggestion: AiBreakdownSuggestionDef; decision: BrkDecision }) {
  const NW = 202;
  const NH = 88;
  const GX = 50;
  const GY = 20;
  const PL = 14;
  const PT = 46;
  const depth = layoutDepths(suggestion.suggestedTasks);
  const levels: BreakdownTaskDef[][] = [];
  suggestion.suggestedTasks.forEach((t) => {
    const d = depth[t.order];
    if (!levels[d]) levels[d] = [];
    levels[d].push(t);
  });
  const maxRows = Math.max(1, ...levels.map((l) => l.length));
  const bodyH = maxRows * NH + (maxRows - 1) * GY;
  const W = PL * 2 + levels.length * NW + (levels.length - 1) * GX;
  const H = PT + bodyH + 14;
  const pos: Record<number, { x: number; y: number }> = {};
  levels.forEach((lvl, li) => {
    const colH = lvl.length * NH + (lvl.length - 1) * GY;
    const startY = PT + (bodyH - colH) / 2;
    lvl.forEach((t, ti) => {
      pos[t.order] = { x: PL + li * (NW + GX), y: startY + ti * (NH + GY) };
    });
  });
  const cp = suggestion.criticalPathOrders;
  const isCp = (order: number) => cp.includes(order);
  const isCpEdge = (from: number, to: number) => {
    const i = cp.indexOf(from);
    return i >= 0 && cp[i + 1] === to;
  };
  const edges: { key: string; d: string; critical: boolean }[] = [];
  suggestion.suggestedTasks.forEach((t) => {
    t.dependsOnOrder.forEach((dep) => {
      const a = pos[dep];
      const b = pos[t.order];
      if (!a || !b) return;
      const x1 = a.x + NW;
      const y1 = a.y + NH / 2;
      const x2 = b.x;
      const y2 = b.y + NH / 2;
      const mx = (x1 + x2) / 2;
      edges.push({ key: `${dep}-${t.order}`, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, critical: isCpEdge(dep, t.order) });
    });
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="AI 拆解结果依赖图">
      <defs>
        <marker id="ac-dg-dag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#98a2b0" />
        </marker>
        <marker id="ac-dg-dag-arrow-cp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#4f46e5" />
        </marker>
      </defs>
      {levels.map((lvl, li) => (
        <g key={li}>
          <rect x={PL + li * (NW + GX) - 6} y={PT - 12} width={NW + 12} height={bodyH + 18} rx={10} fill={li % 2 === 0 ? '#fafbfc' : '#f5f6f8'} opacity={0.72} />
          <text className="ac-dg-svg-layer" x={PL + li * (NW + GX) + NW / 2} y={26} textAnchor="middle">
            {`第 ${li + 1} 层 · ${lvl.length} 项${lvl.length > 1 ? '（可并行泳道）' : '（串行）'}`}
          </text>
        </g>
      ))}
      {edges.map((e) => (
        <path
          key={e.key}
          d={e.d}
          fill="none"
          stroke={e.critical ? '#4f46e5' : '#b6bec9'}
          strokeWidth={e.critical ? 2.2 : 1.3}
          strokeDasharray={e.critical ? undefined : '5 3'}
          markerEnd={e.critical ? 'url(#ac-dg-dag-arrow-cp)' : 'url(#ac-dg-dag-arrow)'}
          opacity={e.critical ? 1 : 0.75}
        />
      ))}
      {suggestion.suggestedTasks.map((t) => {
        const p = pos[t.order];
        const critical = isCp(t.order);
        const user = t.assigneeSuggestionId ? USER_MAP[t.assigneeSuggestionId] : undefined;
        const accepted = decision.acceptedOrders.includes(t.order);
        const rejected = decision.rejectedOrders.some((r) => r.order === t.order);
        return (
          <g key={t.order}>
            <title>{`#${t.order} ${t.title}｜${t.points} 点｜风险 ${t.riskLevel}｜AI 置信度 ${t.aiConfidencePct}%｜验收标准 ${t.acceptanceCriteria.length} 条｜承接人 ${user ? `${user.name}（${user.title}）` : '待指派 / AI 智能体'}｜前置 ${t.dependsOnOrder.length ? t.dependsOnOrder.map((o) => `#${o}`).join('、') : '无'}｜${critical ? '关键路径' : '非关键路径'}`}</title>
            <rect x={p.x} y={p.y} width={NW} height={NH} rx={9} fill={critical ? '#eef2ff' : '#fff'} stroke={critical ? '#4f46e5' : '#dfe3ea'} strokeWidth={critical ? 2.2 : 1.2} />
            <rect x={p.x + 1.5} y={p.y + 9} width={3.5} height={NH - 18} rx={1.75} fill={toneHex(RISK_TONE[t.riskLevel] === 'ok' ? 'ok' : RISK_TONE[t.riskLevel] === 'warn' ? 'warn' : 'danger')} />
            <text className="ac-dg-svg-order" x={p.x + 13} y={p.y + 20}>
              #{t.order}
            </text>
            <text className="ac-dg-svg-name" x={p.x + 40} y={p.y + 20}>
              {clip(t.title, critical ? 8 : 11)}
            </text>
            {critical ? (
              <text className="ac-dg-svg-cp" x={p.x + NW - 9} y={p.y + 20} textAnchor="end">
                关键路径
              </text>
            ) : null}
            <text className="ac-dg-svg-tech" x={p.x + 13} y={p.y + 38}>
              {`${t.points} 点 · 风险${t.riskLevel} · 置信 ${t.aiConfidencePct}%`}
            </text>
            <circle cx={p.x + 22} cy={p.y + 56} r={8.5} fill={user ? toneHex(user.avatarColor) : '#94a3b8'} />
            <text className="ac-dg-svg-avatar" x={p.x + 22} y={p.y + 59.5} textAnchor="middle">
              {user ? user.initial : 'AI'}
            </text>
            <text className="ac-dg-svg-tech" x={p.x + 36} y={p.y + 59}>
              {user ? `${user.name} · ${clip(user.title, 8)}` : '待指派（AI 智能体）'}
            </text>
            <text className="ac-dg-svg-tech" x={p.x + 13} y={p.y + 77}>
              {`验收 ${t.acceptanceCriteria.length} 条 · 技能 ${clip(t.skillRequirement.join('/'), 11)}`}
            </text>
            {accepted ? (
              <circle cx={p.x + NW - 13} cy={p.y + NH - 13} r={5.5} fill="#10b981" stroke="#fff" strokeWidth={1.4} />
            ) : rejected ? (
              <circle cx={p.x + NW - 13} cy={p.y + NH - 13} r={5.5} fill="#ef4444" stroke="#fff" strokeWidth={1.4} />
            ) : (
              <circle cx={p.x + NW - 13} cy={p.y + NH - 13} r={5.5} fill="#fff" stroke="#98a2b0" strokeWidth={1.6} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** ⑥ 人工方案 × AI 方案 点数对比条（含重合度着色） */
function CompareBars({ suggestion }: { suggestion: AiBreakdownSuggestionDef }) {
  const cmp = suggestion.comparedWithHumanPlan;
  const W = 510;
  const H = 132;
  const padL = 72;
  const padR = 118;
  const padT = 16;
  const rowH = 26;
  const gap = 24;
  const plotW = W - padL - padR;
  const max = Math.max(cmp.humanTotalPoints, suggestion.totalPoints, 1);
  const wOf = (v: number) => (v / max) * plotW;
  const rows = [
    { label: '人工方案', value: cmp.humanTotalPoints, sub: `${cmp.humanTaskCount} 个工作项`, color: '#94a3b8' },
    { label: 'AI 方案', value: suggestion.totalPoints, sub: `${suggestion.suggestedTasks.length} 个子任务`, color: '#7c3aed' },
  ];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="人工方案与 AI 方案点数对比">
      {rows.map((r, i) => {
        const y = padT + i * (rowH + gap);
        return (
          <g key={r.label}>
            <title>{`${r.label}｜${r.value} 点｜${r.sub}`}</title>
            <text className="ac-dg-svg-cat" x={padL - 10} y={y + rowH / 2 + 4} textAnchor="end">
              {r.label}
            </text>
            <rect x={padL} y={y} width={plotW} height={rowH} rx={5} fill="#f2f4f8" />
            <rect x={padL} y={y} width={Math.max(2, wOf(r.value))} height={rowH} rx={5} fill={r.color} opacity={0.82} />
            {i === 1 ? (
              <rect x={padL} y={y} width={Math.max(2, wOf(r.value) * (cmp.overlapPct / 100))} height={rowH} rx={5} fill="#4f46e5" opacity={0.55} />
            ) : null}
            <text className="ac-dg-svg-val" x={padL + wOf(r.value) + 8} y={y + rowH / 2 + 4}>
              {`${r.value} 点 · ${r.sub}`}
            </text>
          </g>
        );
      })}
      <text className="ac-dg-svg-note" x={padL} y={H - 8}>
        {`aiDeltaPoints = ${suggestion.totalPoints} − ${cmp.humanTotalPoints} = ${cmp.aiDeltaPoints} 点 · 深蓝段为与人工方案重合的 ${cmp.overlapPct}% 范围`}
      </text>
    </svg>
  );
}

export default function DesignPage() {
  const [reqId, setReqId] = useState<string>(REQUIREMENTS[0].id);
  const [tab, setTab] = useState<TabId>('arch');
  const [compId, setCompId] = useState<string>(ARCH_COMPONENTS[0].id);
  const [apiId, setApiId] = useState<string>('');
  const [apiScope, setApiScope] = useState<'all' | 'req'>('req');
  const [estScope, setEstScope] = useState<'req' | 'all'>('req');
  const [estMethod, setEstMethod] = useState<'all' | AiEffortEstimateDef['method']>('all');
  const [estStatus, setEstStatus] = useState<'all' | AiEffortEstimateDef['status']>('all');
  const [estVariance, setEstVariance] = useState<'all' | 'le5' | 'mid' | 'gt20'>('all');
  const [estConfidence, setEstConfidence] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [estKeyword, setEstKeyword] = useState('');
  const [estSort, setEstSort] = useState<'time' | 'ai' | 'variance' | 'confidence'>('time');
  const [editingTaskId, setEditingTaskId] = useState<string>('');
  const [overrides, setOverrides] = useState<Record<string, TaskOverride>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [subTasks, setSubTasks] = useState<Record<string, BreakdownTaskDef[]>>({});
  const [selected, setSelected] = useState<string[]>(() => TASKS.filter((t) => t.state !== 'released').map((t) => t.id));
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncItems, setSyncItems] = useState<SyncItem[]>([]);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /* ---------- AI 工时预估 ---------- */
  const [estimateOverrides, setEstimateOverrides] = useState<Record<string, EstimateOverride>>({});
  const [estimateFeedback, setEstimateFeedback] = useState<{ id: string; text: string; prev: EstimateOverride | null } | null>(null);
  const [riskAck, setRiskAck] = useState<Record<string, boolean>>({});
  const [overrideInput, setOverrideInput] = useState<Record<string, string>>({});
  const [activeEstimateId, setActiveEstimateId] = useState('');
  /* ---------- AI 任务拆解建议 ---------- */
  const [brkId, setBrkId] = useState<string>(AI_BREAKDOWN_SUGGESTIONS[0].id);
  const [brkDecisions, setBrkDecisions] = useState<Record<string, BrkDecision>>(() => {
    const init: Record<string, BrkDecision> = {};
    AI_BREAKDOWN_SUGGESTIONS.forEach((s) => {
      init[s.id] = baselineDecision(s);
    });
    return init;
  });
  const [brkDrafts, setBrkDrafts] = useState<Record<string, BrkDraft>>(() => {
    const init: Record<string, BrkDraft> = {};
    AI_BREAKDOWN_SUGGESTIONS.forEach((s) => {
      init[s.id] = draftFromDecision(s, baselineDecision(s));
    });
    return init;
  });
  const [brkFeedback, setBrkFeedback] = useState<{ id: string; text: string; prev: BrkDecision; prevDraft: BrkDraft } | null>(null);
  const [brkError, setBrkError] = useState('');
  const [brkAcOpen, setBrkAcOpen] = useState<Record<string, boolean>>({});
  /* ---------- 回放流程 ---------- */
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayDone, setReplayDone] = useState(0);
  const [replayRunning, setReplayRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const replayTimers = useRef<number[]>([]);
  const toastSeq = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      replayTimers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  /* ---------- 派生数据 ---------- */
  const requirement = REQUIREMENT_MAP[reqId];

  const mergedTasks = useMemo<Task[]>(
    () =>
      TASKS.map((t) => {
        const ov = overrides[t.id];
        return ov ? { ...t, title: ov.title, ownerId: ov.ownerId, estimateHours: ov.estimateHours } : t;
      }),
    [overrides],
  );

  /** 12 条 AI 工时预估叠加本地采纳覆盖层（乐观更新） */
  const effEstimates = useMemo<AiEffortEstimateDef[]>(
    () =>
      AI_EFFORT_ESTIMATES.map((e) => {
        const ov = estimateOverrides[e.id];
        return ov ? { ...e, status: ov.status, adoptedValue: ov.adoptedValue } : e;
      }),
    [estimateOverrides],
  );

  const groups = useMemo(() => {
    const order: string[] = [];
    const bucket: Record<string, Task[]> = {};
    mergedTasks.forEach((t) => {
      const key = t.reqId || '__release';
      if (!bucket[key]) {
        bucket[key] = [];
        order.push(key);
      }
      bucket[key].push(t);
    });
    return order.map((key) => ({
      key,
      label: key === '__release' ? '发布执行工作项' : `${REQUIREMENT_MAP[key].code} · ${REQUIREMENT_MAP[key].title}`,
      tasks: bucket[key],
    }));
  }, [mergedTasks]);

  /** 当前范围内的预估行（范围 + 4 维筛选 + 关键字） */
  const estRows = useMemo<AiEffortEstimateDef[]>(() => {
    const kw = estKeyword.trim().toLowerCase();
    const list = effEstimates.filter((e) => {
      const task = TASK_MAP[e.taskId];
      if (estScope === 'req' && (!task || task.reqId !== reqId)) return false;
      if (estMethod !== 'all' && e.method !== estMethod) return false;
      if (estStatus !== 'all' && e.status !== estStatus) return false;
      const av = Math.abs(e.variancePct);
      if (estVariance === 'le5' && av > 5) return false;
      if (estVariance === 'mid' && (av <= 5 || av > 20)) return false;
      if (estVariance === 'gt20' && av <= 20) return false;
      if (estConfidence === 'high' && e.confidencePct < 85) return false;
      if (estConfidence === 'mid' && (e.confidencePct < 70 || e.confidencePct >= 85)) return false;
      if (estConfidence === 'low' && e.confidencePct >= 70) return false;
      if (kw && !`${e.taskId} ${e.taskTitle} ${task ? task.code : ''}`.toLowerCase().includes(kw)) return false;
      return true;
    });
    if (estSort === 'ai') return [...list].sort((a, b) => b.aiEstimateHours - a.aiEstimateHours);
    if (estSort === 'variance') return [...list].sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));
    if (estSort === 'confidence') return [...list].sort((a, b) => a.confidencePct - b.confidencePct);
    return [...list].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }, [effEstimates, estScope, reqId, estMethod, estStatus, estVariance, estConfidence, estKeyword, estSort]);

  /** 当前筛选结果的合计（PERT / AI / 采纳值 / 平均绝对偏差） */
  const estTotals = useMemo(() => {
    const sum = estRows.reduce(
      (acc, e) => {
        acc.optimistic += e.humanEstimateHours.optimistic;
        acc.pessimistic += e.humanEstimateHours.pessimistic;
        acc.pert += e.humanEstimateHours.pert;
        acc.ai += e.aiEstimateHours;
        acc.adopted += e.adoptedValue ?? e.humanEstimateHours.pert;
        acc.points += e.taskPoints;
        acc.absVar += Math.abs(e.variancePct);
        return acc;
      },
      { optimistic: 0, pessimistic: 0, pert: 0, ai: 0, adopted: 0, points: 0, absVar: 0 },
    );
    const n = Math.max(1, estRows.length);
    return {
      optimistic: round1(sum.optimistic),
      pessimistic: round1(sum.pessimistic),
      pert: round1(sum.pert),
      ai: round1(sum.ai),
      adopted: round1(sum.adopted),
      points: sum.points,
      meanAbsVar: round1(sum.absVar / n),
    };
  }, [estRows]);

  /** 顶部常驻指标（覆盖全量 12 条预估与 6 条拆解建议，随乐观更新联动） */
  const aiMetrics = useMemo(() => {
    const n = Math.max(1, effEstimates.length);
    const adopted = effEstimates.filter((e) => e.status === 'adopted').length;
    const overridden = effEstimates.filter((e) => e.status === 'overridden').length;
    const suggested = effEstimates.filter((e) => e.status === 'suggested').length;
    const meanAbsVar = effEstimates.reduce((a, e) => a + Math.abs(e.variancePct), 0) / n;
    const subTaskTotal = AI_BREAKDOWN_SUGGESTIONS.reduce((a, s) => a + s.suggestedTasks.length, 0);
    const meanOverlap =
      AI_BREAKDOWN_SUGGESTIONS.reduce((a, s) => a + s.comparedWithHumanPlan.overlapPct, 0) /
      Math.max(1, AI_BREAKDOWN_SUGGESTIONS.length);
    const acceptedPoints = AI_BREAKDOWN_SUGGESTIONS.reduce(
      (a, s) => a + s.suggestedTasks.filter((t) => brkDecisions[s.id].acceptedOrders.includes(t.order)).reduce((b, t) => b + t.points, 0),
      0,
    );
    return {
      coverage: effEstimates.length,
      taskTotal: TASKS.length,
      adopted,
      overridden,
      suggested,
      adoptRate: Math.round((adopted / n) * 1000) / 10,
      meanAbsVar: round1(meanAbsVar),
      bigVariance: effEstimates.filter((e) => Math.abs(e.variancePct) > 20).length,
      breakdownCount: AI_BREAKDOWN_SUGGESTIONS.length,
      reqSourceCount: AI_BREAKDOWN_SUGGESTIONS.filter((s) => s.sourceType === 'requirement').length,
      taskSourceCount: AI_BREAKDOWN_SUGGESTIONS.filter((s) => s.sourceType === 'task').length,
      subTaskTotal,
      acceptedPoints,
      meanOverlap: round1(meanOverlap),
    };
  }, [effEstimates, brkDecisions]);

  const remainWorkdays = useMemo(() => {
    const start = new Date(`${TODAY}T00:00:00`).getTime();
    const end = new Date(`${CURRENT_SPRINT.endDate}T00:00:00`).getTime();
    const days = Math.max(1, Math.round((end - start) / 86400000));
    let workdays = 0;
    for (let i = 1; i <= days; i += 1) {
      const wd = new Date(start + i * 86400000).getDay();
      if (wd !== 0 && wd !== 6) workdays += 1;
    }
    return Math.max(1, workdays);
  }, []);

  const parallel = Math.max(1, Math.ceil(estTotals.ai / (remainWorkdays * 6)));

  const byType = useMemo(() => {
    const acc: Record<string, { pert: number; ai: number }> = {};
    estRows.forEach((e) => {
      const task = TASK_MAP[e.taskId];
      const key = task ? task.type : '其他';
      if (!acc[key]) acc[key] = { pert: 0, ai: 0 };
      acc[key].pert += e.humanEstimateHours.pert;
      acc[key].ai += e.aiEstimateHours;
    });
    return Object.entries(acc)
      .map(([label, v]) => ({ label, value: round1(v.pert), ai: round1(v.ai) }))
      .sort((a, b) => b.value - a.value);
  }, [estRows]);

  const maxTypeValue = Math.max(1, ...byType.map((x) => Math.max(x.value, x.ai)));

  /** 偏差分布（|偏差| ≤5% / 5~20% / >20%），用于汇总卡 */
  const varianceBuckets = useMemo(() => {
    const b = [
      { label: '|偏差| ≤ 5%', value: 0, color: '#10b981' },
      { label: '5% < |偏差| ≤ 20%', value: 0, color: '#f59e0b' },
      { label: '|偏差| > 20%', value: 0, color: '#ef4444' },
    ];
    effEstimates.forEach((e) => {
      const av = Math.abs(e.variancePct);
      if (av <= 5) b[0].value += 1;
      else if (av <= 20) b[1].value += 1;
      else b[2].value += 1;
    });
    return b;
  }, [effEstimates]);

  const sprintAiRatio = useMemo(() => {
    const sum = mergedTasks.reduce((acc, t) => acc + t.aiRatio, 0);
    return Math.round(sum / Math.max(1, mergedTasks.length));
  }, [mergedTasks]);

  /* ---------- AI 拆解建议派生 ---------- */
  const activeBrk = AI_BREAKDOWN_SUGGESTIONS.find((s) => s.id === brkId) ?? AI_BREAKDOWN_SUGGESTIONS[0];
  const activeDecision = brkDecisions[activeBrk.id];
  const activeDraft = brkDrafts[activeBrk.id];
  const activeChecks = useMemo(() => runBreakdownChecks(activeBrk), [activeBrk]);
  const checkFailedTotal = useMemo(
    () => AI_BREAKDOWN_SUGGESTIONS.reduce((a, s) => a + runBreakdownChecks(s).filter((c) => !c.pass).length, 0),
    [],
  );

  const brkDepth = useMemo(() => layoutDepths(activeBrk.suggestedTasks), [activeBrk]);
  const brkParallelGroups = useMemo(() => {
    const groupsByDepth: Record<number, number[]> = {};
    activeBrk.suggestedTasks.forEach((t) => {
      const d = brkDepth[t.order];
      if (!groupsByDepth[d]) groupsByDepth[d] = [];
      groupsByDepth[d].push(t.order);
    });
    return Object.entries(groupsByDepth)
      .map(([d, orders]) => ({ depth: Number(d) + 1, orders }))
      .sort((a, b) => a.depth - b.depth);
  }, [activeBrk, brkDepth]);

  const activeEstimate = activeEstimateId ? effEstimates.find((e) => e.id === activeEstimateId) : undefined;
  const activeGate = activeEstimate ? estimateGate(activeEstimate) : { blocked: false, reason: '' };

  /** 当前拆解建议的草稿统计（决定提交按钮的禁用态） */
  const draftStat = useMemo(() => {
    const accepted = activeBrk.suggestedTasks.filter((t) => activeDraft.accept[t.order]).length;
    const rejected = activeBrk.suggestedTasks.filter((t) => activeDraft.reject[t.order]).length;
    const missingReason = activeBrk.suggestedTasks.filter(
      (t) => activeDraft.reject[t.order] && !(activeDraft.reasons[t.order] ?? '').trim(),
    ).length;
    return {
      accepted,
      rejected,
      missingReason,
      undecided: activeBrk.suggestedTasks.length - accepted - rejected,
      acceptedPoints: activeBrk.suggestedTasks.filter((t) => activeDraft.accept[t.order]).reduce((a, t) => a + t.points, 0),
      canSubmit: accepted + rejected > 0 && missingReason === 0,
    };
  }, [activeBrk, activeDraft]);

  const apiList = useMemo(
    () => (apiScope === 'req' ? API_CONTRACTS.filter((a) => a.reqIds.includes(reqId)) : API_CONTRACTS),
    [apiScope, reqId],
  );

  const activeContract = apiId ? API_CONTRACTS.find((a) => a.id === apiId) : undefined;

  const diagram = useMemo(() => {
    const boxes: NodeBox[] = [];
    ARCH_LAYERS.forEach((layer, li) => {
      ARCH_COMPONENTS.filter((c) => c.layerId === layer.id).forEach((c, ci) => {
        boxes.push({ id: c.id, x: PAD_L + ci * (NODE_W + GAP_X), y: PAD_T + li * (NODE_H + GAP_Y), layerId: layer.id });
      });
    });
    const map: Record<string, NodeBox> = {};
    boxes.forEach((b) => {
      map[b.id] = b;
    });
    const maxCols = Math.max(...ARCH_LAYERS.map((l) => ARCH_COMPONENTS.filter((c) => c.layerId === l.id).length));
    return {
      boxes,
      map,
      width: PAD_L + maxCols * (NODE_W + GAP_X) - GAP_X + 18,
      height: PAD_T + ARCH_LAYERS.length * (NODE_H + GAP_Y) - GAP_Y + 24,
    };
  }, []);

  /* ---------- 交互 ---------- */
  function pushToast(tone: ToastItem['tone'], text: string) {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((prev) => [...prev, { id, tone, text }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3200);
    timers.current.push(timer);
  }

  function updateTask(taskId: string, patch: Partial<TaskOverride>) {
    setOverrides((prev) => {
      const base = mergedTasks.find((t) => t.id === taskId);
      const current: TaskOverride =
        prev[taskId] ??
        (base ? { title: base.title, ownerId: base.ownerId, estimateHours: base.estimateHours } : { title: '', ownerId: '', estimateHours: 0 });
      return { ...prev, [taskId]: { ...current, ...patch } };
    });
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  /**
   * 「AI 再拆解」：直接取 data-ai-flow.ts 中该工作项对应的真实拆解建议（BRK-*），
   * 不再本地模板生成。没有对应建议的工作项给出明确说明，避免伪造 AI 产出。
   */
  function breakDown(task: Task) {
    if (subTasks[task.id]) {
      setSubTasks((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      return;
    }
    const suggestion = BREAKDOWN_BY_SOURCE[task.id];
    if (!suggestion) {
      pushToast(
        'warn',
        `AI 未对「${task.code}」产出拆解建议：本轮 ${AI_BREAKDOWN_SUGGESTIONS.length} 条建议只覆盖 ${AI_BREAKDOWN_SUGGESTIONS.map((s) => s.sourceId).join('、')}`,
      );
      return;
    }
    setSubTasks((prev) => ({ ...prev, [task.id]: suggestion.suggestedTasks }));
    pushToast(
      'ai',
      `${suggestion.id}（${suggestion.strategy}）已将「${task.code}」拆为 ${suggestion.suggestedTasks.length} 条子任务、合计 ${suggestion.totalPoints} 点，当前决策状态：${BREAKDOWN_STATUS_LABEL[suggestion.status]}`,
    );
  }

  /** 跳转到「AI 拆解建议」页签并选中指定建议 */
  function openBreakdown(id: string) {
    setBrkId(id);
    setBrkError('');
    setTab('breakdown');
  }

  /* ---------- AI 工时预估：采纳 / 保持人工 / 覆写 / 撤销 ---------- */
  function applyEstimateDecision(id: string, next: EstimateOverride, text: string) {
    const prev = estimateOverrides[id] ?? null;
    setEstimateOverrides((cur) => ({ ...cur, [id]: next }));
    setEstimateFeedback({ id, text, prev });
    pushToast('ok', text);
  }

  function undoEstimateDecision() {
    if (!estimateFeedback) return;
    const { id, prev } = estimateFeedback;
    setEstimateOverrides((cur) => {
      const next = { ...cur };
      if (prev) next[id] = prev;
      else delete next[id];
      return next;
    });
    setEstimateFeedback(null);
    pushToast('warn', `已撤销 ${id} 的决策，恢复为数据基线状态`);
  }

  function adoptAiEstimate(e: AiEffortEstimateDef) {
    applyEstimateDecision(
      e.id,
      { status: 'adopted', adoptedValue: e.aiEstimateHours },
      `${e.id}（${e.taskId}）已采纳 AI 预估 ${e.aiEstimateHours}h，状态置为「已采纳」`,
    );
  }

  function keepHumanEstimate(e: AiEffortEstimateDef) {
    applyEstimateDecision(
      e.id,
      { status: 'overridden', adoptedValue: e.humanEstimateHours.pert },
      `${e.id}（${e.taskId}）保持人工三点估算，采纳值置为 PERT ${e.humanEstimateHours.pert}h`,
    );
  }

  function overwriteEstimate(e: AiEffortEstimateDef) {
    const raw = overrideInput[e.id];
    const value = Number(raw);
    if (raw === undefined || raw.trim() === '' || !Number.isFinite(value) || value <= 0) {
      pushToast('warn', `${e.id} 覆写失败：请输入大于 0 的工时数（小时）`);
      return;
    }
    applyEstimateDecision(
      e.id,
      { status: 'overridden', adoptedValue: round1(value) },
      `${e.id}（${e.taskId}）已手动覆写为 ${round1(value)}h，偏差按 PERT ${e.humanEstimateHours.pert}h 重算为 ${calcVariance(round1(value), e.humanEstimateHours.pert)}%`,
    );
  }

  /* ---------- AI 拆解建议：逐条采纳 / 撤销 ---------- */
  function updateBrkDraft(id: string, patch: Partial<BrkDraft>) {
    setBrkDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function toggleBrkAccept(id: string, order: number) {
    const draft = brkDrafts[id];
    const nextAccept = { ...draft.accept, [order]: !draft.accept[order] };
    const nextReject = { ...draft.reject };
    if (nextAccept[order]) nextReject[order] = false;
    updateBrkDraft(id, { accept: nextAccept, reject: nextReject });
  }

  function toggleBrkReject(id: string, order: number) {
    const draft = brkDrafts[id];
    const nextReject = { ...draft.reject, [order]: !draft.reject[order] };
    const nextAccept = { ...draft.accept };
    if (nextReject[order]) nextAccept[order] = false;
    updateBrkDraft(id, { accept: nextAccept, reject: nextReject });
  }

  function submitBrkDecision(s: AiBreakdownSuggestionDef) {
    const draft = brkDrafts[s.id];
    const accepted: number[] = [];
    const rejected: { order: number; reason: string }[] = [];
    const missing: number[] = [];
    s.suggestedTasks.forEach((t) => {
      if (draft.accept[t.order]) {
        accepted.push(t.order);
        return;
      }
      if (draft.reject[t.order]) {
        const reason = (draft.reasons[t.order] ?? '').trim();
        if (!reason) missing.push(t.order);
        rejected.push({ order: t.order, reason });
      }
    });
    if (missing.length) {
      setBrkError(`否决必须说明「为什么不拆」：order ${missing.join('、')} 的否决理由为空，请补齐后再提交。`);
      return;
    }
    if (accepted.length === 0 && rejected.length === 0) {
      setBrkError('请至少对一条子任务作出采纳或否决决策，否则无法形成决策记录。');
      return;
    }
    setBrkError('');
    const status: AiBreakdownSuggestionDef['status'] =
      accepted.length === s.suggestedTasks.length
        ? 'accepted'
        : accepted.length === 0
          ? 'rejected'
          : 'partial';
    const acceptedPoints = s.suggestedTasks.filter((t) => accepted.includes(t.order)).reduce((a, t) => a + t.points, 0);
    const note = `${CURRENT_USER.name} 于控制台逐条决策：采纳 ${accepted.length} 项（order ${accepted.join('、') || '无'}，合计 ${acceptedPoints} 点）、否决 ${rejected.length} 项（order ${rejected.map((r) => r.order).join('、') || '无'}）。采纳项按 PingCode 父子关系回写至 ${s.sourceId}，关键路径 order [${s.criticalPathOrders.join(' → ')}] 同步进入甘特基线。`;
    const prevDecision = brkDecisions[s.id];
    const prevDraft = brkDrafts[s.id];
    const next: BrkDecision = {
      status,
      acceptedOrders: accepted,
      rejectedOrders: rejected,
      decidedBy: CURRENT_USER.id,
      decidedAt: nowStamp(),
      decisionNote: note,
    };
    setBrkDecisions((cur) => ({ ...cur, [s.id]: next }));
    setBrkFeedback({
      id: s.id,
      text: `${s.id} 决策已提交：${BREAKDOWN_STATUS_LABEL[status]}（采纳 ${accepted.length} / 否决 ${rejected.length}，共 ${s.suggestedTasks.length} 项）`,
      prev: prevDecision,
      prevDraft,
    });
    pushToast('ok', `${s.id} 决策已提交 · ${BREAKDOWN_STATUS_LABEL[status]}`);
  }

  function undoBrkDecision() {
    if (!brkFeedback) return;
    const { id, prev, prevDraft } = brkFeedback;
    setBrkDecisions((cur) => ({ ...cur, [id]: prev }));
    setBrkDrafts((cur) => ({ ...cur, [id]: prevDraft }));
    setBrkFeedback(null);
    setBrkError('');
    pushToast('warn', `已撤销 ${id} 的本次决策，恢复为上一次决策结果`);
  }

  function resetBrkDraft(s: AiBreakdownSuggestionDef) {
    setBrkDrafts((cur) => ({ ...cur, [s.id]: draftFromDecision(s, brkDecisions[s.id]) }));
    setBrkError('');
  }

  /* ---------- 「AI 拆解与预估」回放流程 ---------- */
  const replaySteps = useMemo<ReplayStep[]>(() => {
    const acTotal = REQUIREMENTS.reduce((a, r) => a + r.acceptanceCriteria.length, 0);
    const similarIds = new Set<string>();
    AI_EFFORT_ESTIMATES.forEach((e) => e.historyBasis.similarTaskIds.forEach((id) => similarIds.add(id)));
    const thinSample = AI_EFFORT_ESTIMATES.filter((e) => e.historyBasis.sampleSize < 20).length;
    const subTotal = AI_BREAKDOWN_SUGGESTIONS.reduce((a, s) => a + s.suggestedTasks.length, 0);
    const bigVariance = AI_EFFORT_ESTIMATES.filter((e) => Math.abs(e.variancePct) > 20).length;
    const gated = AI_EFFORT_ESTIMATES.filter((e) => estimateGate(e).blocked).length;
    const checkTotal = AI_BREAKDOWN_SUGGESTIONS.length * 9;
    return [
      {
        name: '读取需求与验收标准',
        detail: `拉取 REQUIREMENTS（${REQUIREMENTS.length} 条）与 acceptanceCriteria（${acTotal} 条），作为拆解的范围边界与可验收判据`,
        durationSec: 16,
        items: REQUIREMENTS.length + acTotal,
        issues: 0,
      },
      {
        name: '检索知识库相似历史任务',
        detail: `WeKnora 向量检索命中 ${similarIds.size} 个相似工作项（${[...similarIds].slice(0, 4).join('、')} 等），为 historyBasis 提供 similarTaskAvgHours 与 r2Score`,
        durationSec: 22,
        items: similarIds.size,
        issues: thinSample,
      },
      {
        name: '按策略拆解',
        detail: `ag-arch 按 ${[...new Set(AI_BREAKDOWN_SUGGESTIONS.map((s) => s.strategy))].length} 种策略产出 ${AI_BREAKDOWN_SUGGESTIONS.length} 条建议、${subTotal} 个子任务，并给出 rationale 与 acceptanceCriteria`,
        durationSec: 48,
        items: subTotal,
        issues: AI_BREAKDOWN_SUGGESTIONS.filter((s) => runBreakdownChecks(s).some((c) => !c.pass)).length,
      },
      {
        name: '逐子任务预估工时',
        detail: `对 ${AI_EFFORT_ESTIMATES.length} 个工作项按 5 种方法预估，aiEstimateHours = Σ featureWeights[].contribution，并与人工 PERT 求偏差`,
        durationSec: 74,
        items: AI_EFFORT_ESTIMATES.length,
        issues: bigVariance,
      },
      {
        name: '校验依赖与点数',
        detail: `对 ${AI_BREAKDOWN_SUGGESTIONS.length} 条建议执行 9 项自检（连续编号 / 无环 / 斐波那契 / 点数合计 / 关键路径边 / 上下游对齐 / 技能覆盖），共 ${checkTotal} 项`,
        durationSec: 12,
        items: checkTotal,
        issues: checkFailedTotal,
      },
      {
        name: '产出草案',
        detail: `生成 ${AI_EFFORT_ESTIMATES.length} 条预估 + ${AI_BREAKDOWN_SUGGESTIONS.length} 条拆解草案待人工决策；${gated} 条预估触发采纳门禁（置信度 < 70% 且单一风险权重 ≥ 50%）`,
        durationSec: 9,
        items: AI_EFFORT_ESTIMATES.length + AI_BREAKDOWN_SUGGESTIONS.length,
        issues: gated,
      },
    ];
  }, [checkFailedTotal]);

  function startReplay() {
    if (replayRunning) return;
    setReplayRunning(true);
    setReplayDone(0);
    let acc = 0;
    for (let index = 0; index < replaySteps.length; index += 1) {
      acc += 420;
      const at = index;
      const t = window.setTimeout(() => {
        setReplayDone(at + 1);
        if (at === replaySteps.length - 1) {
          setReplayRunning(false);
          pushToast('ai', `AI 拆解与预估流程回放完成：${replaySteps.length} 步 · 累计 ${replaySteps.reduce((a, s) => a + s.durationSec, 0)}s`);
        }
      }, acc);
      replayTimers.current.push(t);
    }
  }

  function resetReplay() {
    replayTimers.current.forEach((t) => window.clearTimeout(t));
    replayTimers.current = [];
    setReplayRunning(false);
    setReplayDone(0);
  }

  function toggleSelect(taskId: string) {
    setSelected((prev) => (prev.includes(taskId) ? prev.filter((x) => x !== taskId) : [...prev, taskId]));
  }

  function taskMapping(taskId: string) {
    return idMappings.find((m) => m.entityType === 'task' && m.platformId === taskId);
  }

  function openSync() {
    const items: SyncItem[] = mergedTasks
      .filter((t) => selected.includes(t.id))
      .map((t) => {
        const mapping = taskMapping(t.id);
        return {
          taskId: t.id,
          platformId: t.id,
          code: t.code,
          title: t.title,
          action: mapping ? 'update' : 'create',
          externalId: mapping ? mapping.pingcodeCode : '待生成',
          workItemType: WORK_ITEM_TYPE[t.type] ?? '任务',
          state: 'pending',
          message: '排队中',
        };
      });
    setSyncItems(items);
    setSyncRunning(false);
    setSyncDone(false);
    setSyncOpen(true);
  }

  function startSync() {
    if (syncRunning || syncItems.length === 0) return;
    setSyncRunning(true);
    setSyncDone(false);

    const planned = syncItems.map((item) => {
      const roll = makeRng(fnv1a(`sync:${item.taskId}`))();
      const result: SyncState = roll < 0.64 ? 'ok' : roll < 0.84 ? 'retrying' : 'failed';
      return { item, result };
    });

    planned.forEach((entry, index) => {
      const t1 = window.setTimeout(() => {
        setSyncItems((prev) => prev.map((x) => (x.taskId === entry.item.taskId ? { ...x, state: 'syncing', message: '推送中…' } : x)));
        const t2 = window.setTimeout(() => {
          setSyncItems((prev) =>
            prev.map((x) => {
              if (x.taskId !== entry.item.taskId) return x;
              if (entry.result === 'ok') {
                return {
                  ...x,
                  state: 'ok',
                  // 新建成功后回写 external_id，预览表中的映射关系即时生效
                  externalId: x.action === 'create' ? x.code : x.externalId,
                  message: x.action === 'create' ? `已新建并回写 ${x.code}` : `已更新 ${x.externalId}`,
                };
              }
              if (entry.result === 'retrying') {
                return { ...x, state: 'retrying', message: '限流 429，已进入重试队列' };
              }
              return { ...x, state: 'failed', message: '字段校验失败：负责人邮箱缺失' };
            }),
          );
          if (index === planned.length - 1) {
            setSyncRunning(false);
            setSyncDone(true);
            const ok = planned.filter((p) => p.result === 'ok').length;
            const retry = planned.filter((p) => p.result === 'retrying').length;
            const failed = planned.filter((p) => p.result === 'failed').length;
            pushToast(
              failed > 0 ? 'warn' : 'ok',
              `同步完成：成功 ${ok} · 重试队列 ${retry} · 失败 ${failed}（共 ${planned.length} 项）`,
            );
          }
        }, 380);
        timers.current.push(t2);
      }, 240 + index * 220);
      timers.current.push(t1);
    });
  }

  const syncCounts = useMemo(
    () => ({
      ok: syncItems.filter((x) => x.state === 'ok').length,
      retrying: syncItems.filter((x) => x.state === 'retrying').length,
      failed: syncItems.filter((x) => x.state === 'failed').length,
    }),
    [syncItems],
  );

  const selectedComp: ComponentDef = ARCH_COMPONENT_MAP[compId];

  const tabCounts: Record<TabId, number> = {
    arch: ARCH_COMPONENTS.filter((c) => c.reqIds.includes(reqId)).length,
    api: API_CONTRACTS.filter((a) => a.reqIds.includes(reqId)).length,
    tasks: mergedTasks.filter((t) => t.reqId === reqId).length,
    estimate: effEstimates.filter((e) => (estScope === 'all' ? true : TASK_MAP[e.taskId]?.reqId === reqId)).length,
    breakdown: AI_BREAKDOWN_SUGGESTIONS.length,
  };

  /* ============================================================
   * 渲染
   * ============================================================ */
  return (
    <div className="ac-dg" data-annotation-id="ai-sdlc-design-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">架构设计与任务拆解</div>
          <div className="ac-page-desc">
            从需求出发沉淀分层架构、组件关系与接口契约，并把范围切成可独立验收的工作项。
            <strong>AI 工时预估</strong>以人工三点估算为基线给出集成预估值、特征贡献与置信区间；
            <strong>AI 任务拆解建议</strong>按 5 种策略把需求或过大任务拆成带依赖的子任务 DAG，
            两类产出都必须经人工逐条决策，且每项数值都能按公开口径复核。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            {AI_FLOW_TODAY}
          </span>
          <span className={`ac-tag ac-tag--${tagTone(PLAN_FLOW.tone)}`}>
            <Workflow size={12} />
            {PLAN_FLOW.id} · 自动化率 {PLAN_FLOW.autoRatePct}%
          </span>
          <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={() => setReplayOpen(true)}>
            <Sparkles size={13} />
            AI 拆解与预估
          </button>
        </div>
      </div>

      {/* ---------- 顶部需求选择器 ---------- */}
      <div className="ac-dg-picker" data-annotation-id="ai-sdlc-design-page-picker">
        <span className="ac-dg-picker-label">当前需求</span>
        <select className="ac-select" value={reqId} onChange={(e) => setReqId(e.target.value)}>
          {REQUIREMENTS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} · {r.title}
            </option>
          ))}
        </select>
        <div className="ac-dg-picker-meta">
          <span className="ac-tag ac-tag--sm ac-tag--outline">{requirement.type}</span>
          <span className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[requirement.priority]}`}>{requirement.priority}</span>
          <span className={`ac-tag ac-tag--sm ac-tag--${requirement.risk === 'high' ? 'danger' : requirement.risk === 'medium' ? 'warn' : 'ok'}`}>
            风险 {requirement.risk === 'high' ? '高' : requirement.risk === 'medium' ? '中' : '低'}
          </span>
          <span>{requirement.prdVersion}</span>
          <span>·</span>
          <span>{CURRENT_SPRINT.name}</span>
          <span>·</span>
          <span>
            {requirement.storyPoints} 点 / {requirement.taskIds.length} 个工作项
          </span>
          <span>·</span>
          <span>AI 参与 {requirement.aiAssist}%</span>
        </div>
      </div>

      {/* ============================================================
          AI 工时预估总览（常驻，不随标签页切换）
         ============================================================ */}
      <div className="ac-dg-metrics" data-annotation-id="ai-sdlc-design-ai-estimate">
        <div className="ac-metric ac-metric--ai">
          <div className="ac-metric-head">
            <span className="ac-metric-label">AI 预估覆盖任务数</span>
            <span className="ac-metric-icon">
              <Brain size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {aiMetrics.coverage}
            <span className="ac-metric-unit">个</span>
          </div>
          <div className="ac-metric-foot">
            {CURRENT_SPRINT.name} 共 {aiMetrics.taskTotal} 个工作项 · 覆盖率 {Math.round((aiMetrics.coverage / aiMetrics.taskTotal) * 100)}%
          </div>
        </div>

        <div className="ac-metric ac-metric--info">
          <div className="ac-metric-head">
            <span className="ac-metric-label">平均绝对偏差</span>
            <span className="ac-metric-icon">
              <Sigma size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            ±{aiMetrics.meanAbsVar}
            <span className="ac-metric-unit">%</span>
          </div>
          <div className="ac-metric-foot">Σ|variancePct| / {aiMetrics.coverage} · |偏差| &gt; 20% 共 {aiMetrics.bigVariance} 条</div>
        </div>

        <div className="ac-metric ac-metric--ok">
          <div className="ac-metric-head">
            <span className="ac-metric-label">已采纳率</span>
            <span className="ac-metric-icon">
              <CheckCircle2 size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {aiMetrics.adoptRate}
            <span className="ac-metric-unit">%</span>
          </div>
          <div className="ac-metric-foot">
            采纳 {aiMetrics.adopted} · 覆写 {aiMetrics.overridden} · 待决 {aiMetrics.suggested}
          </div>
        </div>

        <div className="ac-metric ac-metric--brand">
          <div className="ac-metric-head">
            <span className="ac-metric-label">AI 拆解建议数</span>
            <span className="ac-metric-icon">
              <GitBranch size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {aiMetrics.breakdownCount}
            <span className="ac-metric-unit">条</span>
          </div>
          <div className="ac-metric-foot">
            需求来源 {aiMetrics.reqSourceCount} · 任务来源 {aiMetrics.taskSourceCount}
          </div>
        </div>

        <div className="ac-metric ac-metric--ai">
          <div className="ac-metric-head">
            <span className="ac-metric-label">AI 拆解新增子任务</span>
            <span className="ac-metric-icon">
              <ListChecks size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {aiMetrics.subTaskTotal}
            <span className="ac-metric-unit">个</span>
          </div>
          <div className="ac-metric-foot">Σ suggestedTasks[].length · 已采纳 {aiMetrics.acceptedPoints} 点</div>
        </div>

        <div className="ac-metric ac-metric--warn">
          <div className="ac-metric-head">
            <span className="ac-metric-label">AI 与人工方案平均重合度</span>
            <span className="ac-metric-icon">
              <Target size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {aiMetrics.meanOverlap}
            <span className="ac-metric-unit">%</span>
          </div>
          <div className="ac-metric-foot">Σ overlapPct / {aiMetrics.breakdownCount} · 校验不通过 {checkFailedTotal} 项</div>
        </div>
      </div>

      <div className="ac-dg-ai-band">
        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <TrendingDown size={14} />
              工时预估误差收敛轨迹
            </span>
            <span className="ac-card-subtitle">三种方法在近 5 个已交付任务上的 errorPct 变化</span>
            <div className="ac-card-extra ac-dg-legend">
              {TREND_SERIES.map((s) => (
                <span className="ac-dg-legend-item" key={s.key}>
                  <span className="ac-dg-legend-dot" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <div className="ac-card-body ac-col ac-gap-3">
            <div className="ac-dg-chart">
              <AccuracyTrendChart />
            </div>
            <div className="ac-hint ac-hint--ai">
              <Sparkles size={13} />
              <span>
                随样本积累，AI 工时预估误差由 ±{EFFORT_ACCURACY_TREND_ENSEMBLE[0].errorPct}% 收敛到 ±
                {EFFORT_ACCURACY_TREND_ENSEMBLE[EFFORT_ACCURACY_TREND_ENSEMBLE.length - 1].errorPct}%（集成预估）；代码规模法由 ±
                {EFFORT_ACCURACY_TREND_CODE_SIZE[0].errorPct}% 收敛到 ±{EFFORT_ACCURACY_TREND_CODE_SIZE[EFFORT_ACCURACY_TREND_CODE_SIZE.length - 1].errorPct}
                %，复杂度模型由 ±{EFFORT_ACCURACY_TREND_COMPLEXITY[0].errorPct}% 收敛到 ±
                {EFFORT_ACCURACY_TREND_COMPLEXITY[EFFORT_ACCURACY_TREND_COMPLEXITY.length - 1].errorPct}%。回归样本量从 12 增至 34、R² 由 0.66 升至 0.86 是收敛的直接原因。
              </span>
            </div>
          </div>
          <div className="ac-card-foot ac-muted ac-xs">
            口径：errorPct = |estimated − actual| / actual × 100，actual 取自 TASKS.actualHours；每条曲线的 5 个采样点均可在「AI 工时预估」页签的预估详情抽屉中逐条回溯。
          </div>
        </div>

        <div className="ac-card ac-dg-brk-overview" data-annotation-id="ai-sdlc-design-ai-breakdown">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <GitBranch size={14} />
              AI 任务拆解建议清单
            </span>
            <span className="ac-card-subtitle">需求拆解 {aiMetrics.reqSourceCount} 条 · 大任务再拆 {aiMetrics.taskSourceCount} 条</span>
            <span className="ac-card-extra ac-muted ac-xs">点击任一条进入逐条采纳</span>
          </div>
          <div className="ac-card-body ac-dg-brk-list">
            {AI_BREAKDOWN_SUGGESTIONS.map((s) => {
              const dec = brkDecisions[s.id];
              const model = MODEL_MAP[s.modelId];
              const agent = AGENT_MAP[s.agentId];
              const failed = runBreakdownChecks(s).filter((c) => !c.pass).length;
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`ac-dg-brk-item ${s.id === brkId ? 'ac-dg-brk-item--active' : ''}`}
                  title={`来源 ${s.sourceId} · ${s.sourceTitle}｜点击查看拆解结果 DAG、子任务明细、逐条采纳与质量校验`}
                  onClick={() => openBreakdown(s.id)}
                >
                  <span className="ac-dg-brk-item-head">
                    <span className="ac-mono ac-xs ac-bold">{s.id}</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${s.sourceType === 'requirement' ? 'brand' : 'info'}`}>
                      {s.sourceType === 'requirement' ? '需求' : '任务'}
                    </span>
                    <span className="ac-mono ac-xs">{s.sourceId}</span>
                    <span className="ac-dg-brk-item-title" title={s.sourceTitle}>
                      {s.sourceTitle}
                    </span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${BREAKDOWN_STATUS_TONE[dec.status]} ac-ml-auto`}>
                      {BREAKDOWN_STATUS_LABEL[dec.status]}
                    </span>
                  </span>
                  <span className="ac-dg-brk-item-meta">
                    <span className={`ac-tag ac-tag--sm ac-tag--${STRATEGY_TONE[s.strategy]}`}>{s.strategy}</span>
                    <span className="ac-muted ac-xs">{model ? model.name : s.modelId}</span>
                    <span className="ac-muted ac-xs">{agent ? agent.name : s.agentId}</span>
                    <span className="ac-muted ac-xs ac-mono">{s.generatedAt}</span>
                    {failed > 0 ? (
                      <span className="ac-tag ac-tag--sm ac-tag--danger">
                        <AlertTriangle size={10} />
                        校验 {failed} 项不通过
                      </span>
                    ) : (
                      <span className="ac-tag ac-tag--sm ac-tag--ok">
                        <Check size={10} />
                        校验全通过
                      </span>
                    )}
                  </span>
                  <span className="ac-dg-brk-item-stats">
                    <span>
                      子任务 <strong>{s.suggestedTasks.length}</strong>
                    </span>
                    <span>
                      总点数 <strong>{s.totalPoints}</strong>
                    </span>
                    <span>
                      可并行度 <strong>{s.parallelismDegree}</strong>
                    </span>
                    <span>
                      关键路径 <strong className="ac-mono">[{s.criticalPathOrders.join('→')}]</strong>
                    </span>
                    <span>
                      重合度 <strong>{s.comparedWithHumanPlan.overlapPct}%</strong>
                    </span>
                    <span>
                      点数差 <strong>{s.comparedWithHumanPlan.aiDeltaPoints > 0 ? '+' : ''}{s.comparedWithHumanPlan.aiDeltaPoints}</strong>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="ac-card-foot ac-muted ac-xs">
            口径：totalPoints = Σ suggestedTasks[].points · aiDeltaPoints = totalPoints − humanTotalPoints · 平均重合度 = Σ overlapPct /{' '}
            {aiMetrics.breakdownCount} = {aiMetrics.meanOverlap}% · 已采纳子任务合计 {aiMetrics.acceptedPoints} 点（随本页决策实时变化）
          </div>
        </div>
      </div>

      {/* ---------- 标签页 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" className={`ac-tab ${tab === t.id ? 'ac-tab--active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={14} />
              {t.label}
              <span className="ac-tab-count">{tabCounts[t.id]}</span>
            </button>
          );
        })}
      </div>

      {/* ============================================================
          ① 架构文档
         ============================================================ */}
      {tab === 'arch' ? (
        <div className="ac-dg-panel" data-annotation-id="ai-sdlc-design-page-arch">
          <div className="ac-dg-arch">
            <div className="ac-dg-arch-left">
              {ARCH_LAYERS.map((layer) => {
                const comps = ARCH_COMPONENTS.filter((c) => c.layerId === layer.id);
                return (
                  <div className="ac-card" key={layer.id}>
                    <div className="ac-card-head">
                      <div className="ac-col ac-gap-0">
                        <span className="ac-card-title">
                          <Layers size={14} />
                          {layer.code} · {layer.name}
                        </span>
                        <span className="ac-card-subtitle">{layer.desc}</span>
                      </div>
                      <span className="ac-card-extra ac-muted ac-xs">{comps.length} 个组件</span>
                    </div>
                    <div className="ac-dg-layer-comps">
                      {comps.map((c) => {
                        const inReq = c.reqIds.includes(reqId);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`ac-dg-comp ${c.id === compId ? 'ac-dg-comp--active' : ''}`}
                            onClick={() => setCompId(c.id)}
                            style={{ opacity: inReq ? 1 : 0.6 }}
                          >
                            <span className={`ac-tag ac-tag--sm ac-tag--${c.tone}`}>{c.kindLabel}</span>
                            <span className="ac-dg-comp-name">{c.name}</span>
                            <span className="ac-dg-comp-meta">{c.locK}k</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="ac-dg-arch-right">
              <div className="ac-card">
                <div className="ac-card-head">
                  <span className="ac-card-title">
                    <Link2 size={14} />
                    组件关系图
                  </span>
                  <span className="ac-card-subtitle">点击节点查看职责与技术栈，连线随选中组件高亮</span>
                  <span className="ac-card-extra ac-muted ac-xs">{ARCH_LINKS.length} 条链路</span>
                </div>
                <div className="ac-card-body ac-col ac-gap-3">
                  <div className="ac-dg-diagram">
                    <svg width={diagram.width} height={diagram.height} viewBox={`0 0 ${diagram.width} ${diagram.height}`} role="img" aria-label="组件关系图">
                      <defs>
                        {(['sync', 'async', 'data'] as const).map((type) => (
                          <marker key={type} id={`ac-dg-arrow-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill={LINK_COLOR[type]} />
                          </marker>
                        ))}
                      </defs>

                      {ARCH_LAYERS.map((layer, li) => {
                        const y = PAD_T + li * (NODE_H + GAP_Y) - 9;
                        return (
                          <g key={layer.id}>
                            <rect x={10} y={y} width={diagram.width - 20} height={NODE_H + 18} rx={10} fill={toneHex(layer.tone)} opacity={0.06} />
                            <text className="ac-dg-svg-layer" x={16} y={y + 20}>
                              {layer.code}
                            </text>
                            <text className="ac-dg-svg-layer" x={16} y={y + 34}>
                              {clip(layer.name, 6)}
                            </text>
                          </g>
                        );
                      })}

                      {ARCH_LINKS.map((link) => {
                        const from = diagram.map[link.from];
                        const to = diagram.map[link.to];
                        if (!from || !to) return null;
                        const down = to.y > from.y;
                        let d: string;
                        if (down) {
                          const x1 = from.x + NODE_W / 2;
                          const y1 = from.y + NODE_H;
                          const x2 = to.x + NODE_W / 2;
                          const y2 = to.y;
                          const my = (y1 + y2) / 2;
                          d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
                        } else {
                          const x1 = from.x + NODE_W;
                          const y1 = from.y + NODE_H / 2;
                          const x2 = to.x + NODE_W;
                          const y2 = to.y + NODE_H / 2;
                          const cx = Math.max(x1, x2) + 42;
                          d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                        }
                        const active = link.from === compId || link.to === compId;
                        return (
                          <g key={link.id}>
                            <title>{`${link.typeLabel} · ${link.label}（${link.protocol}）· ${link.qps} QPS${link.critical ? ' · 关键路径' : ''}`}</title>
                            <path
                              d={d}
                              fill="none"
                              stroke={LINK_COLOR[link.type]}
                              strokeWidth={active ? 2.1 : 1.3}
                              strokeDasharray={LINK_DASH[link.type]}
                              markerEnd={`url(#ac-dg-arrow-${link.type})`}
                              opacity={active ? 1 : 0.38}
                            />
                          </g>
                        );
                      })}

                      {diagram.boxes.map((b) => {
                        const comp = ARCH_COMPONENT_MAP[b.id];
                        const inReq = comp.reqIds.includes(reqId);
                        const active = comp.id === compId;
                        return (
                          <g
                            key={b.id}
                            className={`ac-dg-svg-node ${active ? 'ac-dg-svg-node--active' : ''}`}
                            opacity={inReq || active ? 1 : 0.55}
                            onClick={() => setCompId(comp.id)}
                          >
                            <title>{`${comp.name}｜${comp.kindLabel}｜${comp.tech}｜负责人 ${USER_MAP[comp.ownerId].name}`}</title>
                            <rect x={b.x} y={b.y} width={NODE_W} height={NODE_H} rx={9} fill="#fff" stroke={toneHex(comp.tone)} strokeWidth={1.3} />
                            <line x1={b.x + 2} y1={b.y + 7} x2={b.x + 2} y2={b.y + NODE_H - 7} stroke={toneHex(comp.tone)} strokeWidth={3} strokeLinecap="round" />
                            <text className="ac-dg-svg-name" x={b.x + 13} y={b.y + 19}>
                              {clip(comp.name, 11)}
                            </text>
                            <text className="ac-dg-svg-tech" x={b.x + 13} y={b.y + 34}>
                              {clip(comp.tech, 24)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div className="ac-dg-legend">
                    <span className="ac-dg-legend-item">
                      <span className="ac-dg-legend-line" />
                      同步调用
                    </span>
                    <span className="ac-dg-legend-item">
                      <span className="ac-dg-legend-line ac-dg-legend-line--async" />
                      异步消息
                    </span>
                    <span className="ac-dg-legend-item">
                      <span className="ac-dg-legend-line ac-dg-legend-line--data" />
                      数据流
                    </span>
                    <span className="ac-dg-legend-item ac-muted">节点描边颜色对应所属分层；连线在选中组件时高亮</span>
                  </div>
                </div>
              </div>

              <div className="ac-card">
                <div className="ac-card-head">
                  <div className="ac-col ac-gap-0">
                    <span className="ac-dg-comp-detail-head">
                      <span className="ac-card-title">{selectedComp.name}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${selectedComp.tone}`}>{selectedComp.kindLabel}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${TASK_STATE_MAP[selectedComp.status]?.tone ?? 'neutral'}`}>{selectedComp.statusLabel}</span>
                      <span className="ac-tag ac-tag--sm ac-tag--outline">{selectedComp.id}</span>
                    </span>
                    <span className="ac-card-subtitle">
                      {ARCH_LAYERS.find((l) => l.id === selectedComp.layerId)?.name} · {selectedComp.repo}
                    </span>
                  </div>
                  <div className="ac-card-extra">
                    <span className={`ac-avatar ac-avatar--sm ac-avatar--${USER_MAP[selectedComp.ownerId].avatarColor}`}>{USER_MAP[selectedComp.ownerId].initial}</span>
                    <span className="ac-muted ac-xs">{USER_MAP[selectedComp.ownerId].name}</span>
                  </div>
                </div>
                <div className="ac-card-body ac-col ac-gap-3">
                  <p className="ac-text-2 ac-sm ac-mb-0">{selectedComp.desc}</p>
                  <dl className="ac-kv">
                    <dt>技术栈</dt>
                    <dd>{selectedComp.tech}</dd>
                    <dt>代码仓库</dt>
                    <dd className="ac-mono ac-xs">{selectedComp.repo}</dd>
                    <dt>规模 / 覆盖率</dt>
                    <dd>
                      {selectedComp.locK}k 行 · 覆盖率 {selectedComp.coverage}%
                    </dd>
                    <dt>AI 产出占比</dt>
                    <dd>{selectedComp.aiRatio}%</dd>
                    <dt>关联需求</dt>
                    <dd>{selectedComp.reqIds.length ? selectedComp.reqIds.map((r) => REQUIREMENT_MAP[r]?.code ?? r).join('、') : '—'}</dd>
                    <dt>关联工作项</dt>
                    <dd className="ac-mono ac-xs">{selectedComp.taskIds.length ? selectedComp.taskIds.join('、') : '—'}</dd>
                    <dt>关联接口</dt>
                    <dd className="ac-mono ac-xs">{selectedComp.apiIds.length ? selectedComp.apiIds.join('、') : '—'}</dd>
                  </dl>
                  <div>
                    <div className="ac-section-title">
                      <AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                      风险与依赖
                    </div>
                    {selectedComp.risks.map((risk) => (
                      <div className="ac-dg-risk" key={risk}>
                        <AlertTriangle size={13} style={{ flex: '0 0 auto', marginTop: 3, color: 'var(--warn)' }} />
                        <span>{risk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ============================================================
          ② 接口定义
         ============================================================ */}
      {tab === 'api' ? (
        <div className="ac-dg-panel" data-annotation-id="ai-sdlc-design-page-api">
          <div className="ac-filter-bar">
            <span className="ac-dg-picker-label">范围</span>
            <select className="ac-select" value={apiScope} onChange={(e) => setApiScope(e.target.value as 'all' | 'req')}>
              <option value="req">当前需求（{requirement.code}）</option>
              <option value="all">全部契约</option>
            </select>
            <span className="ac-muted ac-xs">
              共 {apiList.length} 份契约 · 冻结 {apiList.filter((a) => a.status === 'frozen').length} 份 · 破坏性变更{' '}
              {apiList.filter((a) => a.breaking).length} 份
            </span>
            <span className="ac-ml-auto ac-muted ac-xs">点击行查看契约详情</span>
          </div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <FileJson size={14} />
                接口契约
              </span>
              <span className="ac-card-subtitle">请求 / 响应约定取自契约要点，错误码为服务端统一封装</span>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>方法</th>
                      <th>路径</th>
                      <th>接口名称</th>
                      <th>所属组件</th>
                      <th>请求 / 响应约定</th>
                      <th>错误码</th>
                      <th>版本</th>
                      <th>状态</th>
                      <th className="ac-td-right">P99 / TPS</th>
                      <th>负责人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiList.map((api) => (
                      <tr key={api.id} onClick={() => setApiId(api.id)} style={{ cursor: 'pointer' }}>
                        <td>
                          <span className={`ac-dg-method ac-dg-method--${api.method}`}>{api.method}</span>
                        </td>
                        <td className="ac-dg-path">{api.path}</td>
                        <td>
                          <div className="ac-dg-tree-title">
                            <span className="ac-dg-tree-title-text">{api.name}</span>
                            {api.breaking ? <span className="ac-tag ac-tag--sm ac-tag--danger">破坏性</span> : null}
                            {api.aiGenerated ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ai">
                                <Sparkles size={10} />
                                AI 生成
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="ac-text-2">{ARCH_COMPONENT_MAP[api.componentId]?.name ?? api.componentId}</td>
                        <td className="ac-text-2 ac-clamp-2" style={{ maxWidth: 320 }}>
                          {api.summary}
                        </td>
                        <td>
                          <div className="ac-row ac-row-wrap ac-gap-1">
                            {api.errorCodes.map((e) => (
                              <span className="ac-dg-code" key={e.code}>
                                {e.code}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="ac-mono ac-xs">{api.version}</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${api.tone}`}>{api.statusLabel}</span>
                        </td>
                        <td className="ac-td-num">
                          {api.p99Ms}ms / {api.tps}
                        </td>
                        <td className="ac-nowrap">{USER_MAP[api.ownerId].name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ============================================================
          ③ 任务清单
         ============================================================ */}
      {tab === 'tasks' ? (
        <div className="ac-dg-panel" data-annotation-id="ai-sdlc-design-page-tasks">
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={14} />
                任务拆解清单
              </span>
              <span className="ac-card-subtitle">按需求分组 · 负责人与工时支持行内编辑，汇总在页面底部实时联动</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--sm ac-tag--ai">
                  <Brain size={11} />
                  AI 再拆解 · 真实建议 {AI_BREAKDOWN_SUGGESTIONS.length} 条
                </span>
                <span className="ac-muted ac-xs">
                  共 {mergedTasks.length} 个工作项 / {groups.length} 个需求分组
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-dg-tree">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>标题</th>
                      <th>类型</th>
                      <th>负责人</th>
                      <th>优先级</th>
                      <th>工时</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => {
                      const open = expandedGroups[group.key] ?? true;
                      const groupHours = group.tasks.reduce((acc, t) => acc + t.estimateHours, 0);
                      const done = group.tasks.filter((t) => t.state === 'released').length;
                      const isCurrent = group.key === reqId;
                      const groupBrk = BREAKDOWN_BY_SOURCE[group.key];
                      return (
                        <Fragment key={group.key}>
                          <tr className="ac-dg-group-row">
                            <td colSpan={2}>
                              <button
                                type="button"
                                className="ac-dg-inline"
                                onClick={() => toggleGroup(group.key)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
                              >
                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span>{group.label}</span>
                                {isCurrent ? <span className="ac-tag ac-tag--sm ac-tag--brand">当前</span> : null}
                              </button>
                            </td>
                            <td colSpan={6} className="ac-text-3 ac-xs">
                              <div className="ac-row-between">
                                <span>
                                  {group.tasks.length} 个工作项 · 合计 {groupHours} h · 已发布 {done}/{group.tasks.length}
                                </span>
                                {groupBrk ? (
                                  <button type="button" className="ac-btn ac-btn--sm ac-btn--ai" onClick={() => openBreakdown(groupBrk.id)}>
                                    <GitBranch size={12} />
                                    {groupBrk.id} · {groupBrk.strategy}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {open
                            ? group.tasks.map((task) => {
                                const state = TASK_STATE_MAP[task.state];
                                const owner = USER_MAP[task.ownerId];
                                const editing = editingTaskId === task.id;
                                const subs = subTasks[task.id];
                                return (
                                  <Fragment key={task.id}>
                                    <tr className={editing ? 'ac-dg-row--editing' : undefined}>
                                      <td className="ac-mono ac-xs ac-nowrap">{task.code}</td>
                                      <td>
                                        {editing ? (
                                          <input
                                            className="ac-input ac-dg-input-title"
                                            value={task.title}
                                            onChange={(e) => updateTask(task.id, { title: e.target.value })}
                                          />
                                        ) : (
                                          <div className="ac-dg-tree-title">
                                            <span className="ac-dg-tree-title-text" title={task.title}>
                                              {task.title}
                                            </span>
                                            {task.critical ? <span className="ac-tag ac-tag--sm ac-tag--danger">关键路径</span> : null}
                                            {task.blockedReason ? <span className="ac-tag ac-tag--sm ac-tag--warn">受阻</span> : null}
                                          </div>
                                        )}
                                      </td>
                                      <td className="ac-nowrap">{task.type}</td>
                                      <td>
                                        {editing ? (
                                          <select className="ac-select" value={task.ownerId} onChange={(e) => updateTask(task.id, { ownerId: e.target.value })}>
                                            {USERS.map((u) => (
                                              <option key={u.id} value={u.id}>
                                                {u.name}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span className="ac-dg-inline">
                                            <span className={`ac-avatar ac-avatar--xs ac-avatar--${owner.avatarColor}`}>{owner.initial}</span>
                                            <span className="ac-nowrap">{owner.name}</span>
                                            {owner.isAi ? <span className="ac-tag ac-tag--sm ac-tag--ai">AI</span> : null}
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        <span className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>
                                      </td>
                                      <td className="ac-nowrap">
                                        {editing ? (
                                          <span className="ac-dg-inline">
                                            <input
                                              className="ac-input ac-dg-input-num"
                                              type="number"
                                              min={1}
                                              value={task.estimateHours}
                                              onChange={(e) => updateTask(task.id, { estimateHours: Math.max(1, Number(e.target.value) || 1) })}
                                            />
                                            <span className="ac-muted ac-xs">h</span>
                                          </span>
                                        ) : (
                                          <span className="ac-mono">{task.estimateHours} h</span>
                                        )}
                                      </td>
                                      <td>
                                        <span className={`ac-tag ac-tag--sm ac-tag--${state?.tone ?? 'neutral'}`}>{task.stateLabel}</span>
                                      </td>
                                      <td>
                                        <div className="ac-dg-inline">
                                          <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => setEditingTaskId(editing ? '' : task.id)}>
                                            {editing ? <Check size={12} /> : <Pencil size={12} />}
                                            {editing ? '完成' : '编辑'}
                                          </button>
                                          <button
                                            type="button"
                                            className="ac-btn ac-btn--sm ac-btn--ai"
                                            title={
                                              BREAKDOWN_BY_SOURCE[task.id]
                                                ? `展开 ${BREAKDOWN_BY_SOURCE[task.id].id}（${BREAKDOWN_BY_SOURCE[task.id].strategy}）的真实拆解结果`
                                                : 'AI 本轮未对该工作项产出拆解建议，点击查看详情'
                                            }
                                            onClick={() => breakDown(task)}
                                          >
                                            <Sparkles size={12} />
                                            {subs ? '收起子任务' : 'AI 再拆解'}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    {subs
                                      ? subs.map((sub) => {
                                          const subBrk = BREAKDOWN_BY_SOURCE[task.id];
                                          const subDec = subBrk ? brkDecisions[subBrk.id] : undefined;
                                          const subOwner = sub.assigneeSuggestionId ? USER_MAP[sub.assigneeSuggestionId] : undefined;
                                          const subAccepted = subDec ? subDec.acceptedOrders.includes(sub.order) : false;
                                          const subRejected = subDec ? subDec.rejectedOrders.some((r) => r.order === sub.order) : false;
                                          return (
                                            <tr className="ac-dg-sub-row" key={`${task.id}-${sub.order}`}>
                                              <td>
                                                <span className="ac-dg-sub-mark">
                                                  <Sparkles size={11} />
                                                  AI #{sub.order}
                                                </span>
                                              </td>
                                              <td>
                                                <div className="ac-dg-tree-title">
                                                  <span className="ac-dg-tree-title-text" title={sub.title}>
                                                    {sub.title}
                                                  </span>
                                                  {subBrk ? <span className="ac-mono ac-xs ac-muted">{subBrk.id}</span> : null}
                                                  {subBrk && subBrk.criticalPathOrders.includes(sub.order) ? (
                                                    <span className="ac-tag ac-tag--sm ac-tag--brand">关键路径</span>
                                                  ) : null}
                                                </div>
                                              </td>
                                              <td className="ac-nowrap ac-text-3 ac-xs">{subBrk ? subBrk.strategy : '—'}</td>
                                              <td>
                                                {subOwner ? (
                                                  <span className="ac-dg-inline">
                                                    <span className={`ac-avatar ac-avatar--xs ac-avatar--${subOwner.avatarColor}`}>{subOwner.initial}</span>
                                                    <span className="ac-nowrap">{subOwner.name}</span>
                                                  </span>
                                                ) : (
                                                  <span className="ac-dg-inline">
                                                    <span className="ac-avatar ac-avatar--xs ac-avatar--ai">AI</span>
                                                    <span className="ac-nowrap ac-muted">待指派</span>
                                                  </span>
                                                )}
                                              </td>
                                              <td>
                                                <span className={`ac-tag ac-tag--sm ac-tag--${RISK_TONE[sub.riskLevel]}`}>风险 {sub.riskLevel}</span>
                                              </td>
                                              <td className="ac-mono ac-nowrap">
                                                {sub.points} 点 · {sub.aiConfidencePct}%
                                              </td>
                                              <td>
                                                <span className={`ac-tag ac-tag--sm ac-tag--${subAccepted ? 'ok' : subRejected ? 'danger' : 'neutral'}`}>
                                                  {subAccepted ? '已采纳' : subRejected ? '已否决' : '待决策'}
                                                </span>
                                              </td>
                                              <td>
                                                <button
                                                  type="button"
                                                  className="ac-btn ac-btn--sm ac-btn--ghost"
                                                  onClick={() => (subBrk ? openBreakdown(subBrk.id) : undefined)}
                                                >
                                                  <ChevronRight size={12} />
                                                  查看方案
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })
                                      : null}
                                  </Fragment>
                                );
                              })
                            : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ============================================================
          ④ AI 工时预估（人工三点估算 × AI 集成预估）
         ============================================================ */}
      {tab === 'estimate' ? (
        <div className="ac-dg-panel" data-annotation-id="ai-sdlc-design-page-estimate">
          <div className="ac-filter-bar">
            <span className="ac-dg-picker-label">范围</span>
            <select className="ac-select" value={estScope} onChange={(e) => setEstScope(e.target.value as 'req' | 'all')}>
              <option value="req">当前需求（{requirement.code}）</option>
              <option value="all">全部 {AI_EFFORT_ESTIMATES.length} 条预估</option>
            </select>
            <span className="ac-dg-picker-label">预估方法</span>
            <select
              className="ac-select"
              value={estMethod}
              onChange={(e) => setEstMethod(e.target.value as 'all' | AiEffortEstimateDef['method'])}
            >
              <option value="all">全部方法</option>
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="ac-dg-picker-label">状态</span>
            <select
              className="ac-select"
              value={estStatus}
              onChange={(e) => setEstStatus(e.target.value as 'all' | AiEffortEstimateDef['status'])}
            >
              <option value="all">全部状态</option>
              {Object.entries(ESTIMATE_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="ac-dg-picker-label">偏差区间</span>
            <select className="ac-select" value={estVariance} onChange={(e) => setEstVariance(e.target.value as 'all' | 'le5' | 'mid' | 'gt20')}>
              <option value="all">全部偏差</option>
              <option value="le5">|偏差| ≤ 5%</option>
              <option value="mid">5% &lt; |偏差| ≤ 20%</option>
              <option value="gt20">|偏差| &gt; 20%</option>
            </select>
            <span className="ac-dg-picker-label">置信度</span>
            <select className="ac-select" value={estConfidence} onChange={(e) => setEstConfidence(e.target.value as 'all' | 'high' | 'mid' | 'low')}>
              <option value="all">全部置信度</option>
              <option value="high">≥ 85%</option>
              <option value="mid">70% ~ 84%</option>
              <option value="low">&lt; 70%</option>
            </select>
            <span className="ac-dg-picker-label">排序</span>
            <select className="ac-select" value={estSort} onChange={(e) => setEstSort(e.target.value as 'time' | 'ai' | 'variance' | 'confidence')}>
              <option value="time">生成时间（新 → 旧）</option>
              <option value="ai">AI 预估工时（高 → 低）</option>
              <option value="variance">偏差绝对值（大 → 小）</option>
              <option value="confidence">置信度（低 → 高）</option>
            </select>
            <span className="ac-dg-search">
              <Search size={13} />
              <input
                className="ac-input"
                value={estKeyword}
                placeholder="搜索任务编号 / 标题"
                onChange={(e) => setEstKeyword(e.target.value)}
                aria-label="搜索任务编号或标题"
              />
            </span>
            <button
              type="button"
              className="ac-btn ac-btn--sm ac-btn--ghost"
              onClick={() => {
                setEstMethod('all');
                setEstStatus('all');
                setEstVariance('all');
                setEstConfidence('all');
                setEstKeyword('');
                setEstSort('time');
              }}
            >
              <RotateCcw size={12} />
              重置筛选
            </button>
            <span className="ac-ml-auto ac-muted ac-xs">
              命中 {estRows.length} / {effEstimates.length} 条 · 点击行查看预估详情
            </span>
          </div>

          {estimateFeedback ? (
            <div className="ac-hint ac-hint--ok">
              <CheckCircle2 size={13} />
              <span className="ac-flex-1">{estimateFeedback.text}</span>
              <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={undoEstimateDecision}>
                <Undo2 size={12} />
                撤销
              </button>
            </div>
          ) : null}

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Clock size={14} />
                AI 工时预估总表
              </span>
              <span className="ac-card-subtitle">人工三点估算为基线，AI 集成预估给出建议值、置信区间与偏差；采纳结果实时回写状态列与顶部指标</span>
              <div className="ac-card-extra">
                <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => setSelected(mergedTasks.map((t) => t.id))}>
                  全选同步
                </button>
                <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => setSelected([])}>
                  清空
                </button>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              {estRows.length === 0 ? (
                <div className="ac-empty ac-empty--sm">
                  <div className="ac-empty-icon">
                    <Search size={20} />
                  </div>
                  <div className="ac-empty-title">没有符合条件的 AI 预估</div>
                  <div className="ac-empty-desc">
                    {estScope === 'req'
                      ? `${requirement.code} 下暂无工作项进入本轮 AI 预估（12 条预估覆盖 ${[...new Set(AI_EFFORT_ESTIMATES.map((e) => TASK_MAP[e.taskId]?.reqId ?? ''))].filter(Boolean).join('、')}）`
                      : '当前筛选组合无命中项'}
                    ，可切换范围或点击「重置筛选」。
                  </div>
                </div>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm ac-dg-est-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44 }}>同步</th>
                        <th>任务</th>
                        <th className="ac-td-right">故事点</th>
                        <th>预估方法</th>
                        <th>模型</th>
                        <th>生成时间</th>
                        <th className="ac-td-right">人工三点估算 O / M / P / PERT</th>
                        <th className="ac-td-right">AI 预估工时</th>
                        <th className="ac-td-right">偏差 %</th>
                        <th>置信度与区间</th>
                        <th className="ac-td-right">历史样本</th>
                        <th className="ac-td-right">R²</th>
                        <th className="ac-td-right">风险因子</th>
                        <th>状态</th>
                        <th className="ac-td-right">采纳值</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estRows.map((e) => {
                        const task = TASK_MAP[e.taskId];
                        const model = MODEL_MAP[e.modelId];
                        const owner = task ? USER_MAP[task.ownerId] : undefined;
                        const checked = selected.includes(e.taskId);
                        const gate = estimateGate(e);
                        const absVar = Math.abs(e.variancePct);
                        const pertOk = calcPert(e.humanEstimateHours.optimistic, e.humanEstimateHours.mostLikely, e.humanEstimateHours.pessimistic) === e.humanEstimateHours.pert;
                        return (
                          <tr
                            key={e.id}
                            className={checked ? 'ac-table-row--selected' : undefined}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setActiveEstimateId(e.id)}
                          >
                            <td onClick={(ev) => ev.stopPropagation()}>
                              <input className="ac-dg-check" type="checkbox" checked={checked} onChange={() => toggleSelect(e.taskId)} aria-label={`选择 ${e.taskId}`} />
                            </td>
                            <td>
                              <div className="ac-dg-tree-title">
                                <span className="ac-mono ac-xs ac-muted">{e.taskId}</span>
                                <span className="ac-dg-tree-title-text" title={e.taskTitle}>
                                  {e.taskTitle}
                                </span>
                                {owner ? (
                                  <span className={`ac-avatar ac-avatar--xs ac-avatar--${owner.avatarColor}`} title={`${owner.name} · ${owner.title}`}>
                                    {owner.initial}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="ac-td-num">{e.taskPoints}</td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${METHOD_TONE[e.method]}`}>{METHOD_LABEL[e.method]}</span>
                            </td>
                            <td className="ac-nowrap">
                              <span className={`ac-tag ac-tag--sm ac-tag--${model ? tagTone(model.tone) : 'neutral'}`}>{model ? model.name : e.modelId}</span>
                            </td>
                            <td className="ac-mono ac-xs ac-nowrap">{e.generatedAt}</td>
                            <td className="ac-td-num ac-nowrap" title={pertOk ? 'PERT = (O + 4M + P) / 6 校验通过' : 'PERT 与公式核算不一致'}>
                              <span className="ac-dg-tri">
                                <span>{e.humanEstimateHours.optimistic}</span>
                                <span>{e.humanEstimateHours.mostLikely}</span>
                                <span>{e.humanEstimateHours.pessimistic}</span>
                                <strong>{e.humanEstimateHours.pert}</strong>
                              </span>
                            </td>
                            <td className="ac-td-num ac-bold ac-nowrap">{e.aiEstimateHours} h</td>
                            <td className="ac-td-num ac-nowrap">
                              <span className={`ac-dg-var ${absVar > 20 ? 'ac-dg-var--high' : e.variancePct >= 0 ? 'ac-dg-var--up' : 'ac-dg-var--down'}`}>
                                {e.variancePct > 0 ? '+' : ''}
                                {e.variancePct}%
                              </span>
                            </td>
                            <td>
                              <div className="ac-dg-conf">
                                <span className="ac-dg-conf-num">{e.confidencePct}%</span>
                                <span
                                  className="ac-dg-conf-track"
                                  title={`置信区间 ${e.confidenceBand.low} ~ ${e.confidenceBand.high} h · AI 预估 ${e.aiEstimateHours} h（横轴 0 ~ ${EST_DOMAIN_MAX} h）`}
                                >
                                  <span
                                    className="ac-dg-conf-band"
                                    style={{
                                      left: `${(e.confidenceBand.low / EST_DOMAIN_MAX) * 100}%`,
                                      width: `${((e.confidenceBand.high - e.confidenceBand.low) / EST_DOMAIN_MAX) * 100}%`,
                                    }}
                                  />
                                  <span className="ac-dg-conf-mark" style={{ left: `${(e.aiEstimateHours / EST_DOMAIN_MAX) * 100}%` }} />
                                </span>
                                <span className="ac-dg-conf-range ac-mono">
                                  {e.confidenceBand.low}~{e.confidenceBand.high}h
                                </span>
                              </div>
                            </td>
                            <td className="ac-td-num">{e.historyBasis.sampleSize}</td>
                            <td className="ac-td-num">{e.historyBasis.r2Score.toFixed(2)}</td>
                            <td className="ac-td-num">
                              <span className={gate.blocked ? 'ac-dg-risk-count ac-dg-risk-count--high' : 'ac-dg-risk-count'} title={gate.blocked ? gate.reason : `${e.riskFactors.length} 个风险因子，ΣweightPct = ${e.riskFactors.reduce((a, r) => a + r.weightPct, 0)}`}>
                                {e.riskFactors.length}
                                {gate.blocked ? <ShieldAlert size={11} /> : null}
                              </span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${ESTIMATE_STATUS_TONE[e.status]}`}>{ESTIMATE_STATUS_LABEL[e.status]}</span>
                            </td>
                            <td className="ac-td-num ac-nowrap">{e.adoptedValue === null ? <span className="ac-muted">未采纳</span> : `${e.adoptedValue} h`}</td>
                            <td onClick={(ev) => ev.stopPropagation()}>
                              <div className="ac-dg-inline">
                                <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => setActiveEstimateId(e.id)}>
                                  详情
                                </button>
                                <button
                                  type="button"
                                  className={`ac-btn ac-btn--sm ac-btn--ai ${gate.blocked && !riskAck[e.id] ? 'ac-btn--disabled' : ''}`}
                                  title={gate.blocked && !riskAck[e.id] ? gate.reason : `采纳 AI 预估 ${e.aiEstimateHours}h`}
                                  disabled={gate.blocked && !riskAck[e.id]}
                                  onClick={() => adoptAiEstimate(e)}
                                >
                                  <Sparkles size={12} />
                                  采纳
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="ac-card-foot ac-dg-est-foot">
              <span className="ac-muted ac-xs">
                口径：pert = (optimistic + 4 × mostLikely + pessimistic) / 6 · variancePct = (aiEstimateHours − pert) / pert × 100 ·
                aiEstimateHours = Σ featureWeights[].contribution 且 Σ featureWeights[].weight ≡ 1.00 · Σ riskFactors[].weightPct ≡ 100 ·
                errorPct = |estimated − actual| / actual × 100。风险因子列带{' '}
                <ShieldAlert size={10} style={{ verticalAlign: '-1px', color: 'var(--danger)' }} /> 的行触发采纳门禁（置信度 &lt; 70% 且单一风险权重 ≥
                50%），「采纳」按钮置灰，需在详情抽屉勾选风险知悉后才可采纳。
              </span>
              <span className="ac-sm ac-bold ac-nowrap">
                命中 {estRows.length} 条 · 人工 PERT 合计 {estTotals.pert} h · AI 合计 {estTotals.ai} h · 采纳值合计 {estTotals.adopted} h ·
                平均绝对偏差 ±{estTotals.meanAbsVar}%
              </span>
            </div>
          </div>

          <div className="ac-dg-est">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sigma size={14} />
                  人工三点估算 × AI 预估 汇总对照
                </span>
                <span className="ac-card-subtitle">范围：{estScope === 'all' ? `全部 ${effEstimates.length} 条预估` : `${requirement.code} · ${estRows.length} 条`}</span>
              </div>
              <div className="ac-card-body ac-col ac-gap-4">
                <div className="ac-dg-cmp-grid">
                  <div className="ac-dg-cmp-cell">
                    <span className="ac-dg-cmp-label">人工 PERT 合计</span>
                    <span className="ac-dg-cmp-value">{estTotals.pert} h</span>
                    <span className="ac-dg-cmp-sub">
                      乐观 {estTotals.optimistic} h · 悲观 {estTotals.pessimistic} h
                    </span>
                  </div>
                  <div className="ac-dg-cmp-cell ac-dg-cmp-cell--ai">
                    <span className="ac-dg-cmp-label">AI 预估合计</span>
                    <span className="ac-dg-cmp-value">{estTotals.ai} h</span>
                    <span className="ac-dg-cmp-sub">
                      差 {estTotals.ai - estTotals.pert > 0 ? '+' : ''}
                      {round1(estTotals.ai - estTotals.pert)} h（{estTotals.pert === 0 ? 0 : round1(((estTotals.ai - estTotals.pert) / estTotals.pert) * 100)}%）
                    </span>
                  </div>
                  <div className="ac-dg-cmp-cell">
                    <span className="ac-dg-cmp-label">采纳值合计</span>
                    <span className="ac-dg-cmp-value">{estTotals.adopted} h</span>
                    <span className="ac-dg-cmp-sub">未采纳项按 PERT 计入 · 故事点 {estTotals.points}</span>
                  </div>
                  <div className="ac-dg-cmp-cell">
                    <span className="ac-dg-cmp-label">采纳门禁拦截</span>
                    <span className="ac-dg-cmp-value">{effEstimates.filter((e) => estimateGate(e).blocked).length} 条</span>
                    <span className="ac-dg-cmp-sub">置信度 &lt; 70% 且单一风险权重 ≥ 50%</span>
                  </div>
                </div>
                <div>
                  <div className="ac-section-title">偏差分布（全量 {effEstimates.length} 条）</div>
                  <div className="ac-dg-bar-list">
                    {varianceBuckets.map((b) => (
                      <div className="ac-dg-bar" key={b.label}>
                        <span className="ac-dg-bar-label" title={b.label}>
                          {b.label}
                        </span>
                        <span className="ac-dg-bar-track">
                          <span
                            className="ac-dg-bar-fill"
                            style={{ width: `${Math.round((b.value / Math.max(1, effEstimates.length)) * 100)}%`, background: b.color }}
                          />
                        </span>
                        <span className="ac-dg-bar-val">{b.value} 条</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ac-card-foot ac-muted ac-xs">
                派生数值核算：平均绝对偏差 = Σ|variancePct| / {Math.max(1, estRows.length)} = ±{estTotals.meanAbsVar}%；采纳值合计对未采纳（adoptedValue = null）的预估按其 PERT 计入，避免合计口径断裂。
              </div>
            </div>

            <div className="ac-dg-est-side">
              <div className="ac-metric ac-metric--brand">
                <div className="ac-metric-head">
                  <span className="ac-metric-label">AI 预估总工时</span>
                  <span className="ac-metric-icon">
                    <Clock size={14} />
                  </span>
                </div>
                <div className="ac-metric-value">
                  {estTotals.ai}
                  <span className="ac-metric-unit">h</span>
                </div>
                <div className="ac-metric-foot">
                  人工区间 {estTotals.optimistic} ~ {estTotals.pessimistic} h · {estTotals.points} 故事点
                </div>
              </div>

              <div className="ac-card">
                <div className="ac-card-head">
                  <span className="ac-card-title">
                    <Zap size={14} />
                    建议并行度
                  </span>
                </div>
                <div className="ac-card-body">
                  <div className="ac-dg-parallel">
                    <span className="ac-dg-parallel-num">{parallel}</span>
                    <span className="ac-text-2 ac-sm">人并行</span>
                  </div>
                  <p className="ac-muted ac-xs ac-mb-0 ac-mt-2">
                    {CURRENT_SPRINT.name} 剩余 {remainWorkdays} 个工作日，按每人日 6h 有效工时折算（{parallel} = ⌈{estTotals.ai} ÷ ({remainWorkdays} × 6)⌉）；
                    并行度过高会加剧联调与评审排队，建议不超过 {CURRENT_SPRINT.memberIds.length} 人。
                  </p>
                </div>
              </div>

              <div className="ac-card">
                <div className="ac-card-head">
                  <span className="ac-card-title">
                    <Boxes size={14} />
                    按工作项类型分布
                  </span>
                  <span className="ac-card-extra ac-muted ac-xs">紫条 = AI 预估 · 黑线 = 人工 PERT（h）</span>
                </div>
                <div className="ac-card-body">
                  {byType.length === 0 ? (
                    <p className="ac-muted ac-xs ac-mb-0">当前筛选无命中项</p>
                  ) : (
                    <div className="ac-dg-bar-list">
                      {byType.map((item) => (
                        <div className="ac-dg-bar" key={item.label}>
                          <span className="ac-dg-bar-label" title={item.label}>
                            {item.label}
                          </span>
                          <span className="ac-dg-bar-track" title={`人工 PERT ${item.value} h · AI 预估 ${item.ai} h`}>
                            <span className="ac-dg-bar-fill" style={{ width: `${Math.round((item.ai / maxTypeValue) * 100)}%` }} />
                            <span className="ac-dg-bar-mark" style={{ left: `${Math.round((item.value / maxTypeValue) * 100)}%` }} />
                          </span>
                          <span className="ac-dg-bar-val">
                            {item.ai}/{item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ============================================================
          ⑤ AI 拆解建议（DAG / 子任务明细 / 人工对比 / 逐条采纳 / 质量校验）
         ============================================================ */}
      {tab === 'breakdown' ? (
        <div className="ac-dg-panel">
          {brkFeedback ? (
            <div className="ac-hint ac-hint--ok">
              <CheckCircle2 size={13} />
              <span className="ac-flex-1">{brkFeedback.text}</span>
              <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={undoBrkDecision}>
                <Undo2 size={12} />
                撤销
              </button>
            </div>
          ) : null}
          {brkError ? (
            <div className="ac-hint ac-hint--warn">
              <AlertTriangle size={13} />
              <span>{brkError}</span>
            </div>
          ) : null}

          <div className="ac-card">
            <div className="ac-card-head">
              <div className="ac-col ac-gap-0">
                <span className="ac-dg-comp-detail-head">
                  <span className="ac-card-title">
                    <GitBranch size={14} />
                    {activeBrk.id} · {activeBrk.sourceType === 'requirement' ? '需求拆解' : '大任务再拆'}
                  </span>
                  <span className={`ac-tag ac-tag--sm ac-tag--${STRATEGY_TONE[activeBrk.strategy]}`}>{activeBrk.strategy}</span>
                  <span className={`ac-tag ac-tag--sm ac-tag--${BREAKDOWN_STATUS_TONE[activeDecision.status]}`}>
                    {BREAKDOWN_STATUS_LABEL[activeDecision.status]}
                  </span>
                  <button
                    type="button"
                    className="ac-tag ac-tag--sm ac-tag--outline ac-dg-taglink"
                    title="在任务清单中定位该来源"
                    onClick={() => {
                      if (activeBrk.sourceType === 'requirement') {
                        setReqId(activeBrk.sourceId);
                      } else {
                        setReqId(TASK_MAP[activeBrk.sourceId]?.reqId ?? reqId);
                      }
                      setTab('tasks');
                    }}
                  >
                    <Link2 size={10} />
                    {activeBrk.sourceId}
                  </button>
                </span>
                <span className="ac-card-subtitle">{activeBrk.sourceTitle}</span>
              </div>
              <div className="ac-card-extra ac-dg-inline">
                <span
                  className={`ac-tag ac-tag--sm ac-tag--${MODEL_MAP[activeBrk.modelId] ? tagTone(MODEL_MAP[activeBrk.modelId].tone) : 'neutral'}`}
                >
                  {MODEL_MAP[activeBrk.modelId] ? MODEL_MAP[activeBrk.modelId].name : activeBrk.modelId}
                </span>
                <span className={`ac-tag ac-tag--sm ac-tag--${AGENT_MAP[activeBrk.agentId] ? tagTone(AGENT_MAP[activeBrk.agentId].tone) : 'ai'}`}>
                  <Brain size={11} />
                  {AGENT_MAP[activeBrk.agentId] ? AGENT_MAP[activeBrk.agentId].name : activeBrk.agentId}
                </span>
                <span className={`ac-tag ac-tag--sm ac-tag--${tagTone(activeBrk.tone)}`}>{activeBrk.id}</span>
                <span className="ac-muted ac-xs ac-mono">{activeBrk.generatedAt}</span>
              </div>
            </div>
            <div className="ac-card-body ac-col ac-gap-3">
              <div className="ac-ai-block">
                <div className="ac-ai-block-title">
                  <Sparkles size={12} />
                  策略选择依据 · {activeBrk.strategy}
                </div>
                {activeBrk.strategyReason}
              </div>
              <dl className="ac-kv ac-dg-kv-wide">
                <dt>来源故事点</dt>
                <dd>{activeBrk.sourcePoints} 点</dd>
                <dt>子任务 / 总点数</dt>
                <dd>
                  {activeBrk.suggestedTasks.length} 个 · {activeBrk.totalPoints} 点（Σ suggestedTasks[].points）
                </dd>
                <dt>可并行度</dt>
                <dd>
                  {activeBrk.parallelismDegree} 路 · 分层泳道{' '}
                  {brkParallelGroups.map((g) => `第${g.depth}层[${g.orders.join(',')}]`).join(' → ')}
                </dd>
                <dt>关键路径</dt>
                <dd className="ac-mono ac-xs">
                  order [{activeBrk.criticalPathOrders.join(' → ')}] · {activeBrk.criticalPathPoints} 点（criticalPathPoints）
                </dd>
                <dt>交付压缩</dt>
                <dd>相对人工串行计划预计节省 {activeBrk.estimatedLeadTimeSavedDays} 天</dd>
                <dt>决策记录</dt>
                <dd>
                  {activeDecision.decidedBy
                    ? `${USER_MAP[activeDecision.decidedBy] ? USER_MAP[activeDecision.decidedBy].name : activeDecision.decidedBy} · ${activeDecision.decidedAt} · 采纳 order [${activeDecision.acceptedOrders.join('、') || '无'}] · 否决 order [${activeDecision.rejectedOrders.map((r) => r.order).join('、') || '无'}]`
                    : '尚未决策（pending）'}
                </dd>
              </dl>
              <div className="ac-hint">
                <Link2 size={13} />
                <span>{activeDecision.decisionNote}</span>
              </div>
              {activeDecision.decisionNote !== activeBrk.decisionNote ? (
                <p className="ac-muted ac-xs ac-mb-0">数据基线备注（{activeBrk.decidedBy ? USER_MAP[activeBrk.decidedBy]?.name ?? activeBrk.decidedBy : '—'} · {activeBrk.decidedAt}）：{activeBrk.decisionNote}</p>
              ) : null}
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Workflow size={14} />
                拆解结果依赖图（DAG）
              </span>
              <span className="ac-card-subtitle">按拓扑深度分列，同列即可并行泳道；靛蓝描边与实线边为关键路径</span>
              <div className="ac-card-extra ac-dg-legend">
                <span className="ac-dg-legend-item">
                  <span className="ac-dg-legend-swatch ac-dg-legend-swatch--cp" />
                  关键路径节点
                </span>
                <span className="ac-dg-legend-item">
                  <span className="ac-dg-legend-swatch" />
                  普通节点
                </span>
                <span className="ac-dg-legend-item">
                  <span className="ac-dg-legend-dot" style={{ background: '#10b981' }} />
                  已采纳
                </span>
                <span className="ac-dg-legend-item">
                  <span className="ac-dg-legend-dot" style={{ background: '#ef4444' }} />
                  已否决
                </span>
                <span className="ac-dg-legend-item">
                  <span className="ac-dg-legend-dot" style={{ background: '#fff', border: '1.5px solid #98a2b0' }} />
                  待决策
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-col ac-gap-3">
              <div className="ac-dg-chart">
                <BreakdownDag suggestion={activeBrk} decision={activeDecision} />
              </div>
              <p className="ac-muted ac-xs ac-mb-0">
                节点左侧色条对应风险等级（绿 = 低 / 橙 = 中 / 红 = 高）；节点内含 order、标题、点数、建议承接人（USER_MAP 头像，assigneeSuggestionId 为 null 时显示「待指派」）、
                AI 置信度、验收标准条数与技能要求。悬停任一节点可查看完整字段。
              </p>
            </div>
            <div className="ac-card-foot ac-muted ac-xs">
              口径：depth(节点) = 0（dependsOnOrder 为空）或 1 + max(depth(前置))；关键路径 = criticalPathOrders 给出的最长点数链，合计{' '}
              {activeBrk.criticalPathPoints} 点，占 totalPoints {activeBrk.totalPoints} 点的{' '}
              {Math.round((activeBrk.criticalPathPoints / Math.max(1, activeBrk.totalPoints)) * 100)}%。
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={14} />
                子任务明细与逐条采纳
              </span>
              <span className="ac-card-subtitle">支持部分采纳；否决必须填写理由，提交后状态按 全采纳 / 部分 / 全否决 自动归并</span>
              <div className="ac-card-extra ac-dg-inline">
                <span className="ac-tag ac-tag--sm ac-tag--ok">采纳 {draftStat.accepted}</span>
                <span className="ac-tag ac-tag--sm ac-tag--danger">否决 {draftStat.rejected}</span>
                <span className="ac-tag ac-tag--sm ac-tag--neutral">未决 {draftStat.undecided}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-dg-brk-table">
                  <thead>
                    <tr>
                      <th style={{ width: 46 }}>order</th>
                      <th>子任务标题</th>
                      <th className="ac-td-right">点数</th>
                      <th>建议承接人</th>
                      <th>技能要求</th>
                      <th>前置依赖</th>
                      <th>拆解理由</th>
                      <th>验收标准</th>
                      <th>风险等级</th>
                      <th className="ac-td-right">AI 置信度</th>
                      <th>决策</th>
                      <th>采纳状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBrk.suggestedTasks.map((t) => {
                      const user = t.assigneeSuggestionId ? USER_MAP[t.assigneeSuggestionId] : undefined;
                      const accepted = activeDraft.accept[t.order];
                      const rejected = activeDraft.reject[t.order];
                      const key = `${activeBrk.id}:${t.order}`;
                      const expanded = Boolean(brkAcOpen[key]) || rejected;
                      const critical = activeBrk.criticalPathOrders.includes(t.order);
                      const depLabel = t.dependsOnOrder.length
                        ? t.dependsOnOrder
                            .map((o) => {
                              const dep = activeBrk.suggestedTasks.find((x) => x.order === o);
                              return `#${o} ${dep ? clip(dep.title, 8) : ''}`;
                            })
                            .join('、')
                        : '无（可立即启动）';
                      return (
                        <Fragment key={t.order}>
                          <tr className={critical ? 'ac-dg-brk-row--cp' : undefined}>
                            <td className="ac-mono ac-xs ac-nowrap">
                              #{t.order}
                              {critical ? <span className="ac-tag ac-tag--sm ac-tag--brand" style={{ marginLeft: 4 }}>CP</span> : null}
                            </td>
                            <td>
                              <div className="ac-dg-tree-title">
                                <span className="ac-dg-tree-title-text" title={t.title}>
                                  {t.title}
                                </span>
                              </div>
                            </td>
                            <td className="ac-td-num ac-bold">{t.points}</td>
                            <td className="ac-nowrap">
                              {user ? (
                                <span className="ac-dg-inline" title={`${user.title} · ${user.dept} · 技能 ${user.skills.join('/')}`}>
                                  <span className={`ac-avatar ac-avatar--xs ac-avatar--${user.avatarColor}`}>{user.initial}</span>
                                  {user.name}
                                </span>
                              ) : (
                                <span className="ac-dg-inline" title="assigneeSuggestionId = null，建议交由 AI 智能体全自动执行">
                                  <span className="ac-avatar ac-avatar--xs ac-avatar--ai">AI</span>
                                  <span className="ac-muted">待指派</span>
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="ac-row ac-row-wrap ac-gap-1">
                                {t.skillRequirement.map((sk) => (
                                  <span className="ac-tag ac-tag--sm ac-tag--outline" key={sk}>
                                    {sk}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="ac-text-2 ac-xs">{depLabel}</td>
                            <td className="ac-text-2 ac-xs ac-dg-brk-rationale" title={t.rationale}>
                              {t.rationale}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ac-btn ac-btn--sm ac-btn--ghost"
                                onClick={() => setBrkAcOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
                              >
                                {brkAcOpen[key] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                {t.acceptanceCriteria.length} 条
                              </button>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${RISK_TONE[t.riskLevel]}`}>{t.riskLevel}</span>
                            </td>
                            <td className="ac-td-num">
                              <span className={t.aiConfidencePct < 70 ? 'ac-dg-var ac-dg-var--high' : undefined}>{t.aiConfidencePct}%</span>
                            </td>
                            <td>
                              <div className="ac-dg-brk-decision">
                                <label className="ac-dg-inline" title="采纳该子任务">
                                  <input
                                    className="ac-dg-check"
                                    type="checkbox"
                                    checked={Boolean(accepted)}
                                    onChange={() => toggleBrkAccept(activeBrk.id, t.order)}
                                    aria-label={`采纳 order ${t.order}`}
                                  />
                                  采纳
                                </label>
                                <label className="ac-dg-inline" title="否决该子任务（必须填写理由）">
                                  <input
                                    className="ac-dg-check"
                                    type="checkbox"
                                    checked={Boolean(rejected)}
                                    onChange={() => toggleBrkReject(activeBrk.id, t.order)}
                                    aria-label={`否决 order ${t.order}`}
                                  />
                                  否决
                                </label>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`ac-tag ac-tag--sm ac-tag--${
                                  activeDecision.acceptedOrders.includes(t.order)
                                    ? 'ok'
                                    : activeDecision.rejectedOrders.some((r) => r.order === t.order)
                                      ? 'danger'
                                      : 'neutral'
                                }`}
                              >
                                {activeDecision.acceptedOrders.includes(t.order)
                                  ? '已采纳'
                                  : activeDecision.rejectedOrders.some((r) => r.order === t.order)
                                    ? '已否决'
                                    : '待决策'}
                              </span>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="ac-dg-brk-detail-row">
                              <td colSpan={12}>
                                <div className="ac-dg-brk-detail">
                                  <div>
                                    <div className="ac-section-title">
                                      验收标准（{t.acceptanceCriteria.length} 条，逐条可测）
                                    </div>
                                    <ul className="ac-dg-brk-ac">
                                      {t.acceptanceCriteria.map((ac) => (
                                        <li key={ac}>
                                          <Check size={12} />
                                          <span>{ac}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <div className="ac-section-title">
                                      拆解理由（rationale）
                                    </div>
                                    <p className="ac-text-2 ac-xs ac-mb-0 ac-dg-brk-rationale-full">{t.rationale}</p>
                                    {rejected ? (
                                      <div className="ac-mt-3">
                                        <div className="ac-section-title">
                                          否决理由（必填，需说明「为什么不拆」）
                                          {!(activeDraft.reasons[t.order] ?? '').trim() ? (
                                            <span className="ac-tag ac-tag--sm ac-tag--danger" style={{ marginLeft: 6 }}>
                                              未填写，无法提交
                                            </span>
                                          ) : null}
                                        </div>
                                        <textarea
                                          className="ac-textarea"
                                          rows={3}
                                          value={activeDraft.reasons[t.order] ?? ''}
                                          placeholder="例如：该范围已由 TASK-24xx 覆盖，再拆会形成重复工作项……"
                                          onChange={(ev) =>
                                            updateBrkDraft(activeBrk.id, {
                                              reasons: { ...activeDraft.reasons, [t.order]: ev.target.value },
                                            })
                                          }
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot ac-dg-brk-actions">
              <span className="ac-muted ac-xs">
                草稿：采纳 {draftStat.accepted} 项（{draftStat.acceptedPoints} 点）· 否决 {draftStat.rejected} 项 · 未决 {draftStat.undecided} 项
                {draftStat.missingReason > 0 ? ` · ${draftStat.missingReason} 项否决理由待补` : ''}
              </span>
              <div className="ac-dg-inline">
                <button
                  type="button"
                  className="ac-btn ac-btn--sm ac-btn--ghost"
                  onClick={() => {
                    const accept: Record<number, boolean> = {};
                    const reject: Record<number, boolean> = {};
                    activeBrk.suggestedTasks.forEach((t) => {
                      accept[t.order] = true;
                      reject[t.order] = false;
                    });
                    updateBrkDraft(activeBrk.id, { accept, reject });
                    setBrkError('');
                  }}
                >
                  <Check size={12} />
                  全部采纳
                </button>
                <button
                  type="button"
                  className="ac-btn ac-btn--sm ac-btn--ghost"
                  onClick={() => {
                    const accept: Record<number, boolean> = {};
                    const reject: Record<number, boolean> = {};
                    activeBrk.suggestedTasks.forEach((t) => {
                      accept[t.order] = false;
                      reject[t.order] = true;
                    });
                    updateBrkDraft(activeBrk.id, { accept, reject });
                    setBrkError('');
                  }}
                >
                  <Ban size={12} />
                  全部否决
                </button>
                <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => resetBrkDraft(activeBrk)}>
                  <RotateCcw size={12} />
                  重置为当前决策
                </button>
                <button
                  type="button"
                  className={`ac-btn ac-btn--sm ac-btn--primary ${draftStat.canSubmit ? '' : 'ac-btn--disabled'}`}
                  disabled={!draftStat.canSubmit}
                  title={
                    draftStat.canSubmit
                      ? '提交逐条决策，状态将按 全采纳 / 部分采纳 / 整条否决 自动归并'
                      : draftStat.missingReason > 0
                        ? `还有 ${draftStat.missingReason} 项否决未填写理由`
                        : '请至少对一条子任务作出采纳或否决决策'
                  }
                  onClick={() => submitBrkDecision(activeBrk)}
                >
                  <Upload size={12} />
                  提交决策
                </button>
              </div>
            </div>
          </div>

          <div className="ac-dg-brk-bottom">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Boxes size={14} />
                  与人工方案对比
                </span>
                <span className="ac-card-extra ac-muted ac-xs">comparedWithHumanPlan</span>
              </div>
              <div className="ac-card-body ac-col ac-gap-3">
                <div className="ac-dg-chart">
                  <CompareBars suggestion={activeBrk} />
                </div>
                <dl className="ac-kv">
                  <dt>人工任务数</dt>
                  <dd>{activeBrk.comparedWithHumanPlan.humanTaskCount} 个</dd>
                  <dt>人工点数合计</dt>
                  <dd>{activeBrk.comparedWithHumanPlan.humanTotalPoints} 点</dd>
                  <dt>AI 点数差</dt>
                  <dd>
                    {activeBrk.comparedWithHumanPlan.aiDeltaPoints > 0 ? '+' : ''}
                    {activeBrk.comparedWithHumanPlan.aiDeltaPoints} 点（{activeBrk.totalPoints} − {activeBrk.comparedWithHumanPlan.humanTotalPoints}）
                  </dd>
                  <dt>范围重合度</dt>
                  <dd>{activeBrk.comparedWithHumanPlan.overlapPct}%</dd>
                </dl>
                <div className="ac-hint ac-hint--ai">
                  <Sparkles size={13} />
                  <span>
                    AI 方案与人工方案的范围重合度为 {activeBrk.comparedWithHumanPlan.overlapPct}%，说明两者对边界判断
                    {activeBrk.comparedWithHumanPlan.overlapPct >= 85 ? '高度一致，分歧主要在切分粒度' : '存在实质差异，需重点复核未重合部分'}；
                    点数差 {activeBrk.comparedWithHumanPlan.aiDeltaPoints > 0 ? '+' : ''}
                    {activeBrk.comparedWithHumanPlan.aiDeltaPoints} 点
                    {activeBrk.comparedWithHumanPlan.aiDeltaPoints > 0
                      ? '表示 AI 认为人工计划低估了工作量，增量通常来自被隐含在大任务里、但没有独立验收标准的子项'
                      : activeBrk.comparedWithHumanPlan.aiDeltaPoints === 0
                        ? '表示两者对工作量判断一致，分歧只在切分方式'
                        : '表示 AI 认为人工计划高估了工作量'}
                    。
                  </span>
                </div>
              </div>
              <div className="ac-card-foot ac-muted ac-xs">
                口径：aiDeltaPoints = totalPoints − humanTotalPoints = {activeBrk.totalPoints} − {activeBrk.comparedWithHumanPlan.humanTotalPoints} ={' '}
                {activeBrk.totalPoints - activeBrk.comparedWithHumanPlan.humanTotalPoints}；来源为需求时 humanTotalPoints 等于该需求下人工任务点数合计。
              </div>
            </div>

            <div className="ac-card" data-annotation-id="ai-sdlc-design-breakdown-check">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <ShieldAlert size={14} />
                  拆解质量校验
                </span>
                <span className="ac-card-subtitle">AI 产出必须可验证：9 项自检逐条给出判据与实测值</span>
                <span className="ac-card-extra">
                  <span className={`ac-tag ac-tag--sm ac-tag--${activeChecks.every((c) => c.pass) ? 'ok' : 'danger'}`}>
                    {activeChecks.filter((c) => c.pass).length} / {activeChecks.length} 通过
                  </span>
                </span>
              </div>
              <div className="ac-card-body ac-dg-check-list">
                {activeChecks.map((c) => (
                  <div className={`ac-dg-check-item ${c.pass ? '' : 'ac-dg-check-item--fail'}`} key={c.name}>
                    <span className="ac-dg-check-mark">
                      {c.pass ? <Check size={13} /> : <XCircle size={13} />}
                    </span>
                    <span className="ac-dg-check-body">
                      <span className="ac-dg-check-name">
                        {c.pass ? '✓' : '✗'} {c.name}
                      </span>
                      <span className="ac-dg-check-detail">{c.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="ac-card-foot ac-muted ac-xs">
                校验覆盖 6 条建议 × 9 项 = {AI_BREAKDOWN_SUGGESTIONS.length * 9} 项，当前全库不通过 {checkFailedTotal} 项；
                不通过项会在建议清单上标红，并作为人工否决该条建议的直接依据。
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- 底部工具条 ---------- */}
      <div className="ac-dg-toolbar">
        <div className="ac-dg-toolbar-meta">
          <span>
            工作项 <strong>{mergedTasks.length}</strong>
          </span>
          <span>
            已选待同步 <strong>{selected.length}</strong> 项
          </span>
          <span>
            AI 预估 <strong>{effEstimates.length}</strong> 条 / 合计{' '}
            <strong>{round1(effEstimates.reduce((acc, e) => acc + e.aiEstimateHours, 0))}</strong> h
          </span>
          <span>
            拆解决策 <strong>{AI_BREAKDOWN_SUGGESTIONS.filter((s) => brkDecisions[s.id].status !== 'pending').length}</strong> /{' '}
            {AI_BREAKDOWN_SUGGESTIONS.length} 条
          </span>
          <span>
            AI 产出占比 <strong>{sprintAiRatio}%</strong>
          </span>
          <span className="ac-muted">已映射 PingCode 编号 {mergedTasks.filter((t) => taskMapping(t.id)).length} 项，其余将以新建方式提交</span>
        </div>
        <div className="ac-dg-toolbar-actions">
          <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => setSelected(mergedTasks.filter((t) => t.state !== 'released').map((t) => t.id))}>
            <RefreshCw size={13} />
            重置选择
          </button>
          <button
            type="button"
            className={`ac-btn ac-btn--primary ac-btn--sm ${selected.length === 0 ? 'ac-btn--disabled' : ''}`}
            onClick={openSync}
            disabled={selected.length === 0}
          >
            <Upload size={13} />
            同步到 PingCode
          </button>
        </div>
      </div>

      {/* ---------- 契约详情抽屉 ---------- */}
      <Drawer
        open={Boolean(activeContract)}
        title={activeContract ? activeContract.name : ''}
        subtitle={activeContract ? `${activeContract.method} ${activeContract.path}` : ''}
        width={640}
        onClose={() => setApiId('')}
        footer={
          <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setApiId('')}>
            关闭
          </button>
        }
      >
        {activeContract ? (
          <div className="ac-col ac-gap-3" data-annotation-id="ai-sdlc-design-page-api-drawer">
            <div className="ac-row ac-row-wrap ac-gap-2">
              <span className={`ac-dg-method ac-dg-method--${activeContract.method}`}>{activeContract.method}</span>
              <span className="ac-dg-path">{activeContract.path}</span>
            </div>
            <div className="ac-row ac-row-wrap ac-gap-2">
              <span className={`ac-tag ac-tag--${activeContract.tone}`}>{activeContract.statusLabel}</span>
              <span className="ac-tag ac-tag--outline">版本 {activeContract.version}</span>
              <span className="ac-tag ac-tag--outline">认证 {activeContract.authLevel}</span>
              {activeContract.breaking ? <span className="ac-tag ac-tag--danger">破坏性变更</span> : null}
              {activeContract.aiGenerated ? (
                <span className="ac-tag ac-tag--ai">
                  <Sparkles size={11} />
                  AI 生成契约
                </span>
              ) : null}
            </div>
            <div>
              <div className="ac-section-title">请求 / 响应约定</div>
              <p className="ac-text-2 ac-sm ac-mb-0">{activeContract.summary}</p>
            </div>
            <div>
              <div className="ac-section-title">错误码</div>
              <div className="ac-col ac-gap-2">
                {activeContract.errorCodes.map((e) => (
                  <div className="ac-dg-risk" key={e.code}>
                    <span className="ac-dg-code">{e.code}</span>
                    <span>{e.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="ac-section-title">变更记录</div>
              <p className="ac-dg-changelog">{activeContract.changelog}</p>
            </div>
            <dl className="ac-kv">
              <dt>所属组件</dt>
              <dd>{ARCH_COMPONENT_MAP[activeContract.componentId]?.name ?? activeContract.componentId}</dd>
              <dt>关联需求</dt>
              <dd>{activeContract.reqIds.map((r) => REQUIREMENT_MAP[r]?.code ?? r).join('、')}</dd>
              <dt>关联工作项</dt>
              <dd className="ac-mono ac-xs">{activeContract.taskIds.join('、')}</dd>
              <dt>负责人</dt>
              <dd>{USER_MAP[activeContract.ownerId].name}</dd>
              <dt>评审人</dt>
              <dd>{USER_MAP[activeContract.reviewerId].name}</dd>
              <dt>冻结时间</dt>
              <dd className="ac-mono ac-xs">{activeContract.frozenAt || '—'}</dd>
              <dt>性能基线</dt>
              <dd>
                P99 {activeContract.p99Ms}ms · {activeContract.tps} TPS
              </dd>
            </dl>
          </div>
        ) : null}
      </Drawer>

      {/* ---------- AI 工时预估详情抽屉 ---------- */}
      <Drawer
        open={Boolean(activeEstimate)}
        title={activeEstimate ? `${activeEstimate.id} · ${activeEstimate.taskId}` : ''}
        subtitle={activeEstimate ? activeEstimate.taskTitle : ''}
        width={760}
        onClose={() => setActiveEstimateId('')}
        footer={
          activeEstimate ? (
            <>
              <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setActiveEstimateId('')}>
                关闭
              </button>
              <button type="button" className="ac-btn ac-btn--ghost" onClick={() => keepHumanEstimate(activeEstimate)}>
                <Pencil size={13} />
                保持人工估算（PERT {activeEstimate.humanEstimateHours.pert}h）
              </button>
              <button
                type="button"
                className={`ac-btn ac-btn--ai ${activeGate.blocked && !riskAck[activeEstimate.id] ? 'ac-btn--disabled' : ''}`}
                disabled={activeGate.blocked && !riskAck[activeEstimate.id]}
                title={activeGate.blocked && !riskAck[activeEstimate.id] ? activeGate.reason : `采纳后 adoptedValue = ${activeEstimate.aiEstimateHours}h，状态置为「已采纳」`}
                onClick={() => adoptAiEstimate(activeEstimate)}
              >
                <Sparkles size={14} />
                采纳 AI 预估 {activeEstimate.aiEstimateHours}h
              </button>
            </>
          ) : undefined
        }
      >
        {activeEstimate ? (
          <div className="ac-col ac-gap-4" data-annotation-id="ai-sdlc-design-estimate-detail">
            <div className="ac-row ac-row-wrap ac-gap-2">
              <span className={`ac-tag ac-tag--${tagTone(activeEstimate.tone)}`}>{activeEstimate.id}</span>
              <span className={`ac-tag ac-tag--${METHOD_TONE[activeEstimate.method]}`}>{METHOD_LABEL[activeEstimate.method]}</span>
              <span className={`ac-tag ac-tag--${MODEL_MAP[activeEstimate.modelId] ? tagTone(MODEL_MAP[activeEstimate.modelId].tone) : 'neutral'}`}>
                {MODEL_MAP[activeEstimate.modelId] ? MODEL_MAP[activeEstimate.modelId].name : activeEstimate.modelId}
              </span>
              <span className={`ac-tag ac-tag--${ESTIMATE_STATUS_TONE[activeEstimate.status]}`}>{ESTIMATE_STATUS_LABEL[activeEstimate.status]}</span>
              <span className="ac-tag ac-tag--outline">{activeEstimate.taskPoints} 故事点</span>
              <span className="ac-tag ac-tag--outline ac-mono">{activeEstimate.generatedAt}</span>
              {TASK_MAP[activeEstimate.taskId] ? (
                <span className="ac-tag ac-tag--outline">
                  负责人 {USER_MAP[TASK_MAP[activeEstimate.taskId].ownerId].name} · 实际 {TASK_MAP[activeEstimate.taskId].actualHours}h
                </span>
              ) : null}
            </div>

            {activeGate.blocked ? (
              <div className="ac-hint ac-hint--warn">
                <ShieldAlert size={13} />
                <span className="ac-flex-1">采纳门禁已拦截：{activeGate.reason}</span>
              </div>
            ) : null}

            <div>
              <div className="ac-section-title">人工三点估算 × AI 预估对照</div>
              <div className="ac-dg-chart">
                <HumanVsAiChart estimate={activeEstimate} />
              </div>
              <dl className="ac-kv ac-dg-kv-wide">
                <dt>人工三点</dt>
                <dd className="ac-mono ac-xs">
                  乐观 {activeEstimate.humanEstimateHours.optimistic}h · 最可能 {activeEstimate.humanEstimateHours.mostLikely}h · 悲观{' '}
                  {activeEstimate.humanEstimateHours.pessimistic}h
                </dd>
                <dt>PERT 核算</dt>
                <dd className="ac-mono ac-xs">
                  ({activeEstimate.humanEstimateHours.optimistic} + 4 × {activeEstimate.humanEstimateHours.mostLikely} +{' '}
                  {activeEstimate.humanEstimateHours.pessimistic}) / 6 ={' '}
                  {calcPert(activeEstimate.humanEstimateHours.optimistic, activeEstimate.humanEstimateHours.mostLikely, activeEstimate.humanEstimateHours.pessimistic)}
                  h（数据字段 {activeEstimate.humanEstimateHours.pert}h）
                </dd>
                <dt>AI 预估</dt>
                <dd className="ac-mono ac-xs">
                  {activeEstimate.aiEstimateHours}h · 置信度 {activeEstimate.confidencePct}% · 置信区间 {activeEstimate.confidenceBand.low} ~{' '}
                  {activeEstimate.confidenceBand.high}h
                </dd>
                <dt>偏差核算</dt>
                <dd className="ac-mono ac-xs">
                  ({activeEstimate.aiEstimateHours} − {activeEstimate.humanEstimateHours.pert}) / {activeEstimate.humanEstimateHours.pert} × 100 ={' '}
                  {calcVariance(activeEstimate.aiEstimateHours, activeEstimate.humanEstimateHours.pert)}%（数据字段 {activeEstimate.variancePct}%）
                </dd>
                <dt>采纳值</dt>
                <dd>{activeEstimate.adoptedValue === null ? '未采纳（沿用人工估算排期）' : `${activeEstimate.adoptedValue} h`}</dd>
              </dl>
            </div>

            <div>
              <div className="ac-section-title">特征权重贡献瀑布图</div>
              <div className="ac-dg-chart">
                <FeatureWaterfall estimate={activeEstimate} />
              </div>
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>特征</th>
                      <th className="ac-td-right">weight</th>
                      <th className="ac-td-right">contribution（h）</th>
                      <th className="ac-td-right">累计（h）</th>
                      <th className="ac-td-right">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let acc = 0;
                      return activeEstimate.historyBasis.featureWeights.map((f) => {
                        acc = round1(acc + f.contribution);
                        return (
                          <tr key={f.feature}>
                            <td>{f.feature}</td>
                            <td className="ac-td-num">{f.weight.toFixed(2)}</td>
                            <td className="ac-td-num">{f.contribution}</td>
                            <td className="ac-td-num">{acc}</td>
                            <td className="ac-td-num">{Math.round((f.contribution / Math.max(0.1, activeEstimate.aiEstimateHours)) * 100)}%</td>
                          </tr>
                        );
                      });
                    })()}
                    <tr className="ac-dg-sum-row">
                      <td>合计</td>
                      <td className="ac-td-num ac-bold">
                        {activeEstimate.historyBasis.featureWeights.reduce((a, f) => a + f.weight, 0).toFixed(2)}
                      </td>
                      <td className="ac-td-num ac-bold">
                        {round1(activeEstimate.historyBasis.featureWeights.reduce((a, f) => a + f.contribution, 0))}
                      </td>
                      <td className="ac-td-num ac-bold">{activeEstimate.aiEstimateHours}</td>
                      <td className="ac-td-num ac-bold">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="ac-muted ac-xs ac-mb-0 ac-mt-2">
                口径：Σ featureWeights[].weight ≡ 1.00（实测{' '}
                {activeEstimate.historyBasis.featureWeights.reduce((a, f) => a + f.weight, 0).toFixed(2)}）；Σ featureWeights[].contribution =
                aiEstimateHours（实测 {round1(activeEstimate.historyBasis.featureWeights.reduce((a, f) => a + f.contribution, 0))}h ={' '}
                {activeEstimate.aiEstimateHours}h）。瀑布图每段条形从上一段的累计值起画，末段黑色条为合计。
              </p>
            </div>

            <div>
              <div className="ac-section-title">相似任务依据（historyBasis）</div>
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>相似任务</th>
                      <th>标题</th>
                      <th className="ac-td-right">故事点</th>
                      <th className="ac-td-right">估算工时</th>
                      <th className="ac-td-right">实际工时</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEstimate.historyBasis.similarTaskIds.map((id) => {
                      const t = TASK_MAP[id];
                      return (
                        <tr key={id}>
                          <td>
                            <button
                              type="button"
                              className="ac-dg-link"
                              title={t ? `跳转到任务清单并定位到 ${t.reqId}` : id}
                              onClick={() => {
                                if (!t) return;
                                setReqId(t.reqId);
                                setTab('tasks');
                                setActiveEstimateId('');
                              }}
                            >
                              <Link2 size={11} />
                              {id}
                            </button>
                          </td>
                          <td className="ac-text-2 ac-xs">{t ? t.title : '—'}</td>
                          <td className="ac-td-num">{t ? t.points : '—'}</td>
                          <td className="ac-td-num">{t ? `${t.estimateHours} h` : '—'}</td>
                          <td className="ac-td-num">{t ? `${t.actualHours} h` : '—'}</td>
                          <td>{t ? <span className={`ac-tag ac-tag--sm ac-tag--${TASK_STATE_MAP[t.state]?.tone ?? 'neutral'}`}>{t.stateLabel}</span> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="ac-muted ac-xs ac-mb-0 ac-mt-2">
                相似任务平均实际工时 {activeEstimate.historyBasis.similarTaskAvgHours}h · 回归样本量 {activeEstimate.historyBasis.sampleSize} · 拟合度 R²{' '}
                {activeEstimate.historyBasis.r2Score.toFixed(2)}
                {activeEstimate.historyBasis.r2Score < 0.7 ? '（低于 0.70，按 AIF-06 兜底策略应只给置信区间、不给建议值）' : ''}
              </p>
            </div>

            <div>
              <div className="ac-section-title">
                风险因子（Σ weightPct = {activeEstimate.riskFactors.reduce((a, r) => a + r.weightPct, 0)}）
              </div>
              <div className="ac-dg-chart">
                <RiskShareBar estimate={activeEstimate} />
              </div>
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>风险因子</th>
                      <th className="ac-td-right">权重</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEstimate.riskFactors.map((r, i) => (
                      <tr key={r.factor}>
                        <td>
                          <span className="ac-dg-inline">
                            <span className="ac-dg-legend-dot" style={{ background: RISK_COLORS[i % RISK_COLORS.length] }} />
                            {r.factor}
                          </span>
                        </td>
                        <td className="ac-td-num ac-bold">{r.weightPct}%</td>
                        <td className="ac-text-2 ac-xs">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ac-ai-block">
              <div className="ac-ai-block-title">
                <Sparkles size={12} />
                AI 说明 · aiNote
              </div>
              {activeEstimate.aiNote}
            </div>

            <div>
              <div className="ac-section-title">
                该方法的准确率轨迹（accuracyTrend · {METHOD_LABEL[activeEstimate.method]}）
              </div>
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>采样任务</th>
                      <th className="ac-td-right">AI 预估（h）</th>
                      <th className="ac-td-right">实际（h）</th>
                      <th className="ac-td-right">errorPct</th>
                      <th>核算</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEstimate.accuracyTrend.map((p) => (
                      <tr key={p.taskId}>
                        <td className="ac-mono ac-xs">{p.taskId}</td>
                        <td className="ac-td-num">{p.estimated}</td>
                        <td className="ac-td-num">{p.actual}</td>
                        <td className="ac-td-num ac-bold">±{p.errorPct}%</td>
                        <td className="ac-muted ac-xs ac-mono">
                          |{p.estimated} − {p.actual}| / {p.actual} × 100 = {round1((Math.abs(p.estimated - p.actual) / p.actual) * 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="ac-section-title">手动覆写</div>
              <div className="ac-dg-override">
                <input
                  className="ac-input ac-dg-input-num"
                  type="number"
                  min={1}
                  step={0.5}
                  value={overrideInput[activeEstimate.id] ?? ''}
                  placeholder={`${activeEstimate.humanEstimateHours.pert}`}
                  aria-label="手动覆写工时"
                  onChange={(ev) => setOverrideInput((prev) => ({ ...prev, [activeEstimate.id]: ev.target.value }))}
                />
                <span className="ac-muted ac-xs">h</span>
                <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => overwriteEstimate(activeEstimate)}>
                  <Check size={12} />
                  确认覆写
                </button>
                <span className="ac-muted ac-xs">
                  覆写后 status 置为「人工覆写」，adoptedValue 记录该值，偏差按 PERT {activeEstimate.humanEstimateHours.pert}h 重算
                </span>
              </div>
              {activeGate.blocked ? (
                <label className="ac-dg-inline ac-mt-2">
                  <input
                    className="ac-dg-check"
                    type="checkbox"
                    checked={Boolean(riskAck[activeEstimate.id])}
                    onChange={(ev) => setRiskAck((prev) => ({ ...prev, [activeEstimate.id]: ev.target.checked }))}
                  />
                  我已知悉上述门禁风险，仍要采纳 AI 预估值
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* ---------- 批量同步弹窗 ---------- */}
      <Modal
        open={syncOpen}
        title="同步到 PingCode"
        subtitle={`已选 ${syncItems.length} 个工作项 · 目标项目 订单中台（PC-ORD）· 平台标识 → 外部编号 逐条映射`}
        width={860}
        onClose={() => setSyncOpen(false)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setSyncOpen(false)}>
              关闭
            </button>
            <button
              type="button"
              className={`ac-btn ac-btn--primary ${syncRunning || syncItems.length === 0 ? 'ac-btn--disabled' : ''}`}
              onClick={startSync}
              disabled={syncRunning || syncItems.length === 0}
            >
              {syncRunning ? <Loader2 size={14} className="ac-spin" /> : <Upload size={14} />}
              {syncRunning ? '同步中…' : syncDone ? '重新同步' : '开始同步'}
            </button>
          </>
        }
      >
        <div className="ac-col ac-gap-3" data-annotation-id="ai-sdlc-design-page-sync">
          <div className="ac-dg-sync-summary">
            <span>
              总计 <strong>{syncItems.length}</strong>
            </span>
            <span>
              成功 <strong style={{ color: 'var(--ok)' }}>{syncCounts.ok}</strong>
            </span>
            <span>
              重试队列 <strong style={{ color: 'var(--warn)' }}>{syncCounts.retrying}</strong>
            </span>
            <span>
              失败 <strong style={{ color: 'var(--danger)' }}>{syncCounts.failed}</strong>
            </span>
            <span className="ac-muted">
              新建 {syncItems.filter((x) => x.action === 'create').length} · 更新 {syncItems.filter((x) => x.action === 'update').length}
            </span>
          </div>
          <div className="ac-dg-sync-list">
            {/* 表头：平台标识与外部编号分列展示，直观呈现 id 映射关系 */}
            <div className="ac-dg-sync-head">
              <span>平台标识</span>
              <span />
              <span>外部编号</span>
              <span>操作</span>
              <span>标题</span>
              <span>工作项类型</span>
              <span>同步结果</span>
            </div>
            {syncItems.map((item) => {
              const rowClass =
                item.state === 'syncing'
                  ? 'ac-dg-sync-row--syncing'
                  : item.state === 'ok'
                    ? 'ac-dg-sync-row--ok'
                    : item.state === 'retrying'
                      ? 'ac-dg-sync-row--retrying'
                      : item.state === 'failed'
                        ? 'ac-dg-sync-row--failed'
                        : '';
              return (
                <div className={`ac-dg-sync-row ${rowClass}`} key={item.taskId}>
                  <span className="ac-dg-sync-platform">{item.platformId}</span>
                  <span className="ac-dg-sync-arrow">
                    <ArrowRight size={12} />
                  </span>
                  <span className="ac-dg-sync-code">{item.externalId}</span>
                  <span className={`ac-tag ac-tag--sm ac-tag--${item.action === 'create' ? 'ai' : 'info'}`}>{item.action === 'create' ? '新建' : '更新'}</span>
                  <span className="ac-dg-sync-title" title={item.title}>
                    {item.title}
                  </span>
                  <span className="ac-tag ac-tag--sm ac-tag--outline">{item.workItemType}</span>
                  <span className="ac-dg-sync-status">
                    {item.state === 'pending' ? <Clock size={12} /> : null}
                    {item.state === 'syncing' ? <Loader2 size={12} className="ac-spin" /> : null}
                    {item.state === 'ok' ? <CheckCircle2 size={12} style={{ color: 'var(--ok)' }} /> : null}
                    {item.state === 'retrying' ? <RefreshCw size={12} style={{ color: 'var(--warn)' }} /> : null}
                    {item.state === 'failed' ? <XCircle size={12} style={{ color: 'var(--danger)' }} /> : null}
                    {item.message}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ac-hint">
            <Link2 size={13} />
            <span>
              平台标识（TASK-24xx）与 PingCode 外部编号（PC-ORD-24xx）通过标识映射表绑定：已存在映射的工作项执行「更新」，未建立映射的执行「新建」并在返回后回写 external_id；限流与网络类错误自动进入重试队列，字段校验类错误标记失败需人工修正。
            </span>
          </div>
        </div>
      </Modal>

      {/* ---------- AI 拆解与预估 · 可回放流程 ---------- */}
      <Modal
        open={replayOpen}
        title="AI 拆解与预估"
        subtitle={`${PLAN_FLOW.id} · ${PLAN_FLOW.name}｜触发 ${PLAN_FLOW.triggerEvent}（${PLAN_FLOW.triggerType === 'schedule' ? '定时' : '事件'}）｜自动化率 ${PLAN_FLOW.autoRatePct}%｜端到端均耗 ${PLAN_FLOW.avgEndToEndMin} 分钟`}
        width={860}
        onClose={() => setReplayOpen(false)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setReplayOpen(false)}>
              关闭
            </button>
            <button
              type="button"
              className={`ac-btn ac-btn--ghost ${replayRunning ? 'ac-btn--disabled' : ''}`}
              onClick={resetReplay}
              disabled={replayRunning}
              title="清空进度与累计统计，回到未执行状态"
            >
              <RotateCcw size={13} />
              归零重放
            </button>
            <button
              type="button"
              className={`ac-btn ac-btn--ai ${replayRunning ? 'ac-btn--disabled' : ''}`}
              onClick={startReplay}
              disabled={replayRunning}
            >
              {replayRunning ? <Loader2 size={14} className="ac-spin" /> : <Play size={14} />}
              {replayRunning ? '执行中…' : replayDone >= replaySteps.length ? '重新播放' : '开始播放'}
            </button>
          </>
        }
      >
        <div className="ac-col ac-gap-3">
          <div className="ac-hint ac-hint--ai">
            <Workflow size={13} />
            <span>
              本流程取自 AI_AUTOMATION_FLOWS 的 {PLAN_FLOW.id}「{PLAN_FLOW.name}」，是「拆解 → 排期 → 编码」链路的入口：架构智能体（
              {AGENT_MAP['ag-arch'] ? AGENT_MAP['ag-arch'].name : 'ag-arch'}）先给出拆解与工时预估草案，再由 PMO 在排期页消解冲突、锁定甘特基线，
              最后由任务认领触发 AIF-02 的 IDE AI 编码流程。全部产出都落到本页的「AI 工时预估」与「AI 拆解建议」两个页签，可逐条复核与决策。
            </span>
          </div>

          <div className="ac-dg-replay">
            <div className="ac-dg-replay-head">
              <span>步骤</span>
              <span>耗时</span>
              <span>处理条目</span>
              <span>发现问题</span>
              <span>状态</span>
            </div>
            {replaySteps.map((step, i) => {
              const done = i < replayDone;
              const running = i === replayDone && replayRunning;
              return (
                <div
                  className={`ac-dg-replay-row ${done ? 'ac-dg-replay-row--ok' : ''} ${running ? 'ac-dg-replay-row--running' : ''}`}
                  key={step.name}
                >
                  <span className="ac-dg-replay-name">
                    <span className="ac-dg-replay-idx">{i + 1}</span>
                    <span className="ac-dg-replay-text">
                      <strong>{step.name}</strong>
                      <span className="ac-dg-replay-detail">{step.detail}</span>
                    </span>
                  </span>
                  <span className="ac-mono ac-xs">{step.durationSec}s</span>
                  <span className="ac-mono ac-xs">{step.items}</span>
                  <span className={`ac-mono ac-xs ${step.issues > 0 ? 'ac-dg-replay-issue' : 'ac-muted'}`}>{step.issues}</span>
                  <span className="ac-dg-replay-state">
                    {done ? <CheckCircle2 size={13} style={{ color: 'var(--ok)' }} /> : null}
                    {running ? <Loader2 size={13} className="ac-spin" style={{ color: 'var(--ai)' }} /> : null}
                    {!done && !running ? <Clock size={13} style={{ color: 'var(--text-3)' }} /> : null}
                    {done ? '已完成' : running ? '执行中' : '等待'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="ac-dg-sync-summary">
            <span>
              步骤 <strong>{replayDone}</strong> / {replaySteps.length}
            </span>
            <span>
              累计耗时 <strong>{replaySteps.slice(0, replayDone).reduce((a, s) => a + s.durationSec, 0)}s</strong>
            </span>
            <span>
              处理条目 <strong>{replaySteps.slice(0, replayDone).reduce((a, s) => a + s.items, 0)}</strong>
            </span>
            <span>
              发现问题{' '}
              <strong style={{ color: 'var(--warn)' }}>{replaySteps.slice(0, replayDone).reduce((a, s) => a + s.issues, 0)}</strong>
            </span>
            <span className="ac-muted">上次运行 {PLAN_FLOW.lastRunAt} · 结果 {PLAN_FLOW.lastRunStatus}</span>
          </div>

          <div className="ac-hint">
            <ShieldAlert size={13} />
            <span>
              人工检查点：{PLAN_FLOW.humanCheckpoints.join('、')}。「发现问题」不阻断流程，但会转成门禁拦截项——例如第 4 步中 |偏差| &gt; 20% 的预估、
              第 5 步中依赖校验不通过的拆解建议、第 6 步中置信度 &lt; 70% 且单一风险权重 ≥ 50% 的采纳门禁，都需要在本页给出人工结论后才写入基线。
            </span>
          </div>
        </div>
      </Modal>

      {/* ---------- Toast ---------- */}
      <div className="ac-dg-toast-wrap">
        {toasts.map((t) => (
          <div className={`ac-dg-toast ac-dg-toast--${t.tone}`} key={t.id}>
            {t.tone === 'ok' ? <CheckCircle2 size={14} style={{ color: 'var(--ok)' }} /> : null}
            {t.tone === 'warn' ? <AlertTriangle size={14} style={{ color: 'var(--warn)' }} /> : null}
            {t.tone === 'danger' ? <XCircle size={14} style={{ color: 'var(--danger)' }} /> : null}
            {t.tone === 'ai' ? <Sparkles size={14} style={{ color: 'var(--ai)' }} /> : null}
            <span className="ac-flex-1">{t.text}</span>
            <button
              type="button"
              className="ac-icon-btn"
              aria-label="关闭提示"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ width: 18, height: 18 }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
