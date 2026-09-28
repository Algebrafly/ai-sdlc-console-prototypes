/**
 * 排期甘特（pageId: schedule）
 * ------------------------------------------------------------------
 * 多智能体并行开发控制台 · Sprint 迭代排期视图
 * 页头（标题 / AI 区块开关 / 一键 AI 自动排期）+ AI 排期指标卡
 * + 顶部工具栏（迭代 / 粒度 / 视图 / 负责人筛选 / 统计 / 图例）
 * + 排期冲突告警条 + 左任务树 / 右时间轴双栏甘特（含依赖箭头叠加层）
 * + 风险推算标注 + 点击任务打开 Drawer 详情
 * + AI 排期建议区（多维筛选 / 建议清单表 / 详情抽屉 / 约束门禁 / 乐观更新）
 * + AI 冲突消解区（GANTT_CONFLICTS ↔ AI_SCHEDULE_SUGGESTIONS 关联看板 / SVG 时间窗）
 * + 一键 AI 自动排期回放 Modal（AIF-06 编排流）。
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Bot,
  Bug,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  EyeOff,
  Info,
  Layers,
  ListChecks,
  Minus,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  Undo2,
  Users,
  Workflow,
  X,
} from 'lucide-react';

import {
  agents,
  BUGS,
  CRITICAL_PATH,
  CURRENT_SPRINT,
  CURRENT_USER,
  GANTT_CONFLICTS,
  models,
  REQUIREMENT_MAP,
  SPRINTS,
  TASKS,
  TASK_DEPS,
  TASK_MAP,
  TASK_STATE_MAP,
  TODAY,
  USER_MAP,
  USERS,
} from '../data';
import type {
  AiAgentDef,
  AiModelDef,
  Executor,
  GanttConflictDef,
  RequirementDef,
  TaskDef,
  Tone,
} from '../data';
import { AI_AUTOMATION_FLOWS, AI_FLOW_TODAY, AI_SCHEDULE_SUGGESTIONS } from '../data-ai-flow';
import type { AiScheduleSuggestionDef, ScheduleConstraintCheckDef, SchedulePlanDef } from '../data-ai-flow';
import { WORKLOADS } from '../data-mgmt';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import './schedule.css';

/* ============================================================
 * 常量与纯函数
 * ============================================================ */

/** 左侧任务树宽度，必须与 schedule.css 的 --ac-sch-side 保持一致 */
const SIDE_W = 320;
const MS_DAY = 86_400_000;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type Granularity = 'week' | 'day';
type ViewMode = 'all' | 'critical';

/** 状态 tone → 甘特条修饰类（style.css 未覆盖 teal / neutral，见 schedule.css 补充） */
const TONE_CLASS: Record<string, string> = {
  brand: '',
  ai: 'ac-gantt-bar--ai',
  ok: 'ac-gantt-bar--ok',
  warn: 'ac-gantt-bar--warn',
  danger: 'ac-gantt-bar--danger',
  info: 'ac-gantt-bar--info',
  teal: 'ac-gantt-bar--teal',
  neutral: 'ac-gantt-bar--neutral',
};

const CONFLICT_TYPE_LABEL: Record<GanttConflictDef['type'], string> = {
  resource: '资源冲突',
  dependency: '依赖冲突',
  capacity: '产能不足',
  deadline: '交付风险',
  gate: '门禁阻塞',
};

const CONFLICT_SEV_TONE: Record<GanttConflictDef['severity'], string> = {
  high: 'danger',
  medium: 'warn',
  low: 'info',
};

const CONFLICT_SEV_LABEL: Record<GanttConflictDef['severity'], string> = {
  high: '高危',
  medium: '中危',
  low: '低危',
};

const CONFLICT_STATUS_LABEL: Record<GanttConflictDef['status'], string> = {
  open: '待处理',
  accepted: '已接受',
  resolved: '已解决',
  ignored: '已忽略',
};

const BUG_STATUS_LABEL: Record<string, string> = {
  new: '新建',
  analyzing: '分析中',
  fixing: '修复中',
  verifying: '验证中',
  closed: '已关闭',
  reopened: '重新打开',
};

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS_DAY);
}

function shiftDays(s: string, n: number): Date {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtMD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date → 'YYYY-MM-DD'（按本地时区，避免 toISOString 的 UTC 偏移导致跨日） */
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

function clampPct(v: number): number {
  return Math.min(100, Math.max(0, v));
}

/* ---------- AI 排期建议：类型别名与元数据 ---------- */

type SugStatus = AiScheduleSuggestionDef['status'];
type SugChangeType = AiScheduleSuggestionDef['changeType'];
type SugRiskDelta = AiScheduleSuggestionDef['impact']['riskDelta'];

/** 本地乐观更新覆盖层：只覆盖决策相关字段，不改动 data-ai-flow.ts */
interface SugOverride {
  status: SugStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
}

/** AI 已应用的排期方案（accepted / auto-applied 的 suggestedPlan） */
interface AppliedPlan {
  sugId: string;
  startDate: string;
  endDate: string;
  assigneeId: string;
  points: number;
}

/** Tone → SVG 用色（取值与 style.css :root 的语义色一致） */
const TONE_HEX: Record<string, string> = {
  brand: '#4f46e5',
  ai: '#7c3aed',
  ok: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  neutral: '#94a3b8',
  slate: '#64748b',
  teal: '#0d9488',
  pink: '#db2777',
  indigo: '#4338ca',
  amber: '#b45309',
};

/** Tone → ac-tag-- 语义色归并（ac-tag 仅支持 7 种，12 值 Tone 必须先归并） */
function tagTone(tone: Tone): string {
  const map: Record<Tone, string> = {
    brand: 'brand', ai: 'ai', ok: 'ok', warn: 'warn', danger: 'danger',
    info: 'info', neutral: 'neutral', slate: 'neutral', teal: 'ok',
    pink: 'danger', indigo: 'brand', amber: 'warn',
  };
  return map[tone];
}

const MODEL_MAP: Record<string, AiModelDef> = models.reduce<Record<string, AiModelDef>>((acc, m) => {
  acc[m.id] = m;
  return acc;
}, {});

const AGENT_MAP: Record<string, AiAgentDef> = agents.reduce<Record<string, AiAgentDef>>((acc, a) => {
  acc[a.id] = a;
  return acc;
}, {});

/** AIF-06：迭代规划 → AI 排期与工时预估 → 冲突消解 → 甘特基线锁定 */
const SCHEDULE_FLOW = AI_AUTOMATION_FLOWS.find((f) => f.id === 'AIF-06') ?? AI_AUTOMATION_FLOWS[0];

const SUG_STATUS_META: Record<SugStatus, { label: string; tone: Tone }> = {
  pending: { label: '待决策', tone: 'warn' },
  accepted: { label: '已采纳', tone: 'ok' },
  rejected: { label: '已驳回', tone: 'danger' },
  'auto-applied': { label: '自动应用', tone: 'ai' },
};

const SUG_STATUS_ORDER: SugStatus[] = ['pending', 'accepted', 'rejected', 'auto-applied'];

const CHANGE_TYPE_ORDER: SugChangeType[] = ['提前', '延后', '改派', '拆分', '并行化', '压缩'];

const CHANGE_TYPE_TONE: Record<SugChangeType, Tone> = {
  提前: 'ok',
  延后: 'warn',
  改派: 'info',
  拆分: 'ai',
  并行化: 'brand',
  压缩: 'teal',
};

const CHANGE_TYPE_HINT: Record<SugChangeType, string> = {
  提前: '起始 / 结束日整体前移，为后置依赖争取缓冲',
  延后: '起始 / 结束日整体后移，让出被挤占的资源窗口',
  改派: '承接人变更，负载在成员之间重新分配',
  拆分: '单一大工作项拆成多个可独立放行的小窗口',
  并行化: '串行环节改为并行推进，压缩净耗时',
  压缩: '保持起止不变，通过 AI 提效压缩实际工时',
};

const RISK_DELTA_TONE: Record<SugRiskDelta, Tone> = {
  降低: 'ok',
  不变: 'neutral',
  升高: 'danger',
};

/** 冲突消解状态（由冲突 ↔ 建议的关联与建议的实时状态推导） */
type ResolveState = 'resolved' | 'pending' | 'manual' | 'none';

const RESOLVE_META: Record<ResolveState, { label: string; tone: Tone; note: string }> = {
  resolved: {
    label: '已消解',
    tone: 'ok',
    note: '已有 accepted / auto-applied 的 AI 建议覆盖该冲突，方案已落到甘特基线',
  },
  pending: {
    label: '待决策',
    tone: 'warn',
    note: '存在 pending 的 AI 建议，等待人工裁决后才会重排甘特',
  },
  manual: {
    label: '需人工介入',
    tone: 'danger',
    note: '关联的 AI 建议已全部被驳回，平台内暂无可自动落地的方案',
  },
  none: {
    label: '无 AI 方案',
    tone: 'neutral',
    note: '8 条建议的 reason 与 impact.affectedTaskIds 均未覆盖该冲突',
  },
};

const CONF_BANDS: { key: string; label: string; test: (v: number) => boolean }[] = [
  { key: 'all', label: '全部置信度', test: () => true },
  { key: 'high', label: '≥ 85%', test: (v) => v >= 85 },
  { key: 'mid', label: '70% ~ 84%', test: (v) => v >= 70 && v < 85 },
  { key: 'low', label: '< 70%', test: (v) => v < 70 },
];

const SUG_SORTS: { key: string; label: string }[] = [
  { key: 'generated-desc', label: '生成时间（新 → 旧）' },
  { key: 'generated-asc', label: '生成时间（旧 → 新）' },
  { key: 'confidence-desc', label: '置信度（高 → 低）' },
  { key: 'confidence-asc', label: '置信度（低 → 高）' },
  { key: 'cp-asc', label: '关键路径收益（缩短最多优先）' },
  { key: 'id-asc', label: '建议编号（SCH-01 → 08）' },
];

/** 决策时间戳：日期沿用 AI_FLOW_TODAY（= data.ts 的 TODAY），时分取浏览器本地时钟 */
function stampNow(): string {
  const d = new Date();
  return `${AI_FLOW_TODAY} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 建议理由文本中点名的甘特冲突 id（GANTT-CF-xx），去重后返回 */
function conflictsNamedIn(s: AiScheduleSuggestionDef): string[] {
  const hit = s.reason.match(/GANTT-CF-\d{2}/g) ?? [];
  return Array.from(new Set(hit));
}

/** 未满足的硬约束（门禁禁用态的判定依据） */
function gateBlockers(s: AiScheduleSuggestionDef): ScheduleConstraintCheckDef[] {
  return s.constraintChecks.filter((c) => !c.satisfied);
}

/** 计划是否有变化（起止日或承接人） */
function planChanged(cur: SchedulePlanDef, sug: SchedulePlanDef): boolean {
  return (
    cur.startDate !== sug.startDate ||
    cur.endDate !== sug.endDate ||
    cur.assigneeId !== sug.assigneeId
  );
}

/** 带符号的天数差文本 */
function signedDays(n: number): string {
  if (n === 0) return '0 天';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)} 天`;
}

/** 带符号的小时差文本 */
function signedHours(n: number): string {
  if (n === 0) return '0h';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}h`;
}

/** 合并若干区间的两两重叠段（用于冲突时间窗的 danger 填充） */
function overlapWindows(ivs: { s: number; e: number }[]): { s: number; e: number }[] {
  const raw: { s: number; e: number }[] = [];
  for (let i = 0; i < ivs.length; i += 1) {
    for (let j = i + 1; j < ivs.length; j += 1) {
      const s = Math.max(ivs[i].s, ivs[j].s);
      const e = Math.min(ivs[i].e, ivs[j].e);
      if (e >= s) raw.push({ s, e });
    }
  }
  raw.sort((a, b) => a.s - b.s);
  const merged: { s: number; e: number }[] = [];
  for (const o of raw) {
    const last = merged[merged.length - 1];
    if (last && o.s <= last.e + 1) last.e = Math.max(last.e, o.e);
    else merged.push({ s: o.s, e: o.e });
  }
  return merged;
}

function fmt1(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}

const EXECUTOR_LABEL: Record<Executor, string> = {
  ai: 'AI 全自动',
  human: '人工节点',
  'ai+human': '人机协同',
};

/** 秒 → 人类可读耗时（用于 AIF-06 步骤回放） */
function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}min` : `${m}min${s}s`;
}

/* ---------- 风险推算（TaskDef 无显式风险字段，按进度/起止 + TODAY 推导） ---------- */

interface RiskInfo {
  level: 'high' | 'medium';
  type: string;
  detail: string;
  advice: string;
}

function deriveRisk(t: TaskDef): RiskInfo | null {
  if (t.progress >= 100) return null;

  if (t.blockedReason) {
    return {
      level: 'high',
      type: '阻塞风险',
      detail: t.blockedReason,
      advice: 'PMO Agent 建议：把阻塞项升级到每日站会，明确解阻责任人与截止时间，并评估关键路径顺延天数。',
    };
  }

  const remain = diffDays(TODAY, t.endDate);
  if (remain < 0) {
    return {
      level: 'high',
      type: '已逾期',
      detail: `计划完成日 ${t.endDate} 已过去 ${-remain} 天，当前进度仅 ${t.progress}%。`,
      advice: 'PMO Agent 建议：重排剩余工作并同步迭代目标，必要时申请范围裁剪或追加人力。',
    };
  }

  const total = Math.max(1, diffDays(t.startDate, t.endDate));
  const elapsed = diffDays(t.startDate, TODAY);
  const expected = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));

  if (remain <= 2 && t.progress < 90) {
    return {
      level: 'high',
      type: '剩余天数不足',
      detail: `距计划完成仅剩 ${remain} 天，进度 ${t.progress}%（按时间推算应达 ${expected}%）。`,
      advice: 'PMO Agent 建议：追加结对人力或拆分任务并行推进，并提前预演交付风险与回退方案。',
    };
  }

  if (expected - t.progress >= 25 && t.progress < 90) {
    return {
      level: 'medium',
      type: '进度落后',
      detail: `进度 ${t.progress}%，按时间推算应达 ${expected}%，落后 ${expected - t.progress} 个百分点。`,
      advice: 'PMO Agent 建议：核对剩余工作量与前置依赖，必要时顺延下游任务排期。',
    };
  }

  return null;
}

/* ---------- 行 / 分组 / 依赖 坐标模型 ---------- */

interface SchGroup {
  id: string;
  req: RequirementDef | null;
  tasks: TaskDef[];
  start: string;
  end: string;
  hours: number;
}

type SchRow =
  | { kind: 'group'; id: string; group: SchGroup }
  | { kind: 'task'; id: string; task: TaskDef };

interface SchCol {
  key: string;
  label: string;
  sub: string;
  days: number;
  weekend: boolean;
  today: boolean;
}

interface DepPath {
  id: string;
  from: string;
  to: string;
  critical: boolean;
  note: string;
  d: string;
}

interface TipState {
  x: number;
  y: number;
  node: ReactNode;
  cls?: string;
}

/* ============================================================
 * 页面组件
 * ============================================================ */

export default function SchedulePage() {
  const [selectedSprint, setSelectedSprint] = useState(CURRENT_SPRINT.id);
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drawerTask, setDrawerTask] = useState<TaskDef | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [depPaths, setDepPaths] = useState<DepPath[]>([]);

  /* ---------- AI 排期：区块开关 / 乐观更新覆盖层 / 反馈 ---------- */
  const [aiBlocksOpen, setAiBlocksOpen] = useState(true);
  const [applyAiToGantt, setApplyAiToGantt] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, SugOverride>>({});
  const [undoEntry, setUndoEntry] = useState<{ id: string; prev: SugOverride | null } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  /* ---------- AI 排期：筛选 / 排序 / 详情抽屉 ---------- */
  const [sugKeyword, setSugKeyword] = useState('');
  const [sugTypes, setSugTypes] = useState<SugChangeType[]>([]);
  const [sugStatuses, setSugStatuses] = useState<SugStatus[]>([]);
  const [sugBand, setSugBand] = useState('all');
  const [sugCritOnly, setSugCritOnly] = useState(false);
  const [sugSort, setSugSort] = useState('generated-desc');
  const [drawerSugId, setDrawerSugId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectText, setRejectText] = useState('');

  /* ---------- AI 冲突消解：时间窗可视化的选中冲突 ---------- */
  const [vizConflictId, setVizConflictId] = useState(GANTT_CONFLICTS[0].id);

  /* ---------- 一键 AI 自动排期：回放状态 ---------- */
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoStep, setAutoStep] = useState(-1);
  const [autoApplied, setAutoApplied] = useState(false);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const flashTimer = useRef<number | null>(null);

  /* ============================================================
   * AI 排期建议：派生数据
   * ============================================================ */

  /** 叠加本地覆盖层后的建议清单（乐观更新的唯一数据源） */
  const liveSuggestions = useMemo<AiScheduleSuggestionDef[]>(
    () => AI_SCHEDULE_SUGGESTIONS.map((s) => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s)),
    [overrides],
  );

  /**
   * 已应用（accepted / auto-applied）的排期方案，按 taskId 归并。
   * 同一任务命中多条建议时，取 decidedAt 最晚的一条；decidedAt 相同或缺失时取清单中靠后的一条。
   */
  const appliedPlans = useMemo<Record<string, AppliedPlan>>(() => {
    const out: Record<string, AppliedPlan> = {};
    const rank: Record<string, number> = {};
    liveSuggestions.forEach((s, idx) => {
      if (s.status !== 'accepted' && s.status !== 'auto-applied') return;
      if (!planChanged(s.currentPlan, s.suggestedPlan)) return;
      const prevIdx = rank[s.taskId];
      const prevAt = prevIdx === undefined ? '' : liveSuggestions[prevIdx].decidedAt ?? '';
      const curAt = s.decidedAt ?? '';
      if (prevIdx === undefined || curAt >= prevAt) {
        rank[s.taskId] = idx;
        out[s.taskId] = {
          sugId: s.id,
          startDate: s.suggestedPlan.startDate,
          endDate: s.suggestedPlan.endDate,
          assigneeId: s.suggestedPlan.assigneeId,
          points: s.suggestedPlan.points,
        };
      }
    });
    return out;
  }, [liveSuggestions]);

  /** 甘特实际使用的任务清单：AI 已应用方案覆盖起止日与承接人 */
  const liveTasks = useMemo<TaskDef[]>(() => {
    if (!applyAiToGantt) return TASKS;
    return TASKS.map((t) => {
      const p = appliedPlans[t.id];
      if (!p) return t;
      return { ...t, startDate: p.startDate, endDate: p.endDate, ownerId: p.assigneeId, points: p.points };
    });
  }, [appliedPlans, applyAiToGantt]);

  const liveTaskMap = useMemo<Map<string, TaskDef>>(
    () => new Map(liveTasks.map((t) => [t.id, t])),
    [liveTasks],
  );

  /** 汇总指标（口径见 ac-card-foot） */
  const aiStats = useMemo(() => {
    const total = liveSuggestions.length;
    const byStatus: Record<SugStatus, number> = { pending: 0, accepted: 0, rejected: 0, 'auto-applied': 0 };
    for (const s of liveSuggestions) byStatus[s.status] += 1;
    const adopted = byStatus.accepted + byStatus['auto-applied'];
    const adoptedList = liveSuggestions.filter(
      (s) => s.status === 'accepted' || s.status === 'auto-applied',
    );
    const rejectedList = liveSuggestions.filter((s) => s.status === 'rejected');
    const avg = (list: AiScheduleSuggestionDef[]) =>
      list.length === 0 ? 0 : list.reduce((sum, s) => sum + s.confidencePct, 0) / list.length;
    return {
      total,
      byStatus,
      adopted,
      adoptRatePct: total === 0 ? 0 : Math.round((adopted / total) * 1000) / 10,
      avgConfidencePct: fmt1(avg(liveSuggestions)),
      adoptedAvgConfidencePct: fmt1(avg(adoptedList)),
      rejectedAvgConfidencePct: fmt1(avg(rejectedList)),
      cpDeltaDays: adoptedList.reduce((sum, s) => sum + s.impact.criticalPathDeltaDays, 0),
      loadDeltaHours: adoptedList.reduce((sum, s) => sum + s.impact.sprintLoadDelta, 0),
      gateBlockedCount: liveSuggestions.filter((s) => gateBlockers(s).length > 0).length,
      localChangeCount: Object.keys(overrides).length,
      appliedTaskCount: Object.keys(appliedPlans).length,
    };
  }, [liveSuggestions, overrides, appliedPlans]);

  /** 变更类型分布（6 值全列，计数为 0 的类型也出现在图例中） */
  const changeTypeDist = useMemo(
    () =>
      CHANGE_TYPE_ORDER.map((ct) => ({
        label: ct,
        value: liveSuggestions.filter((s) => s.changeType === ct).length,
        tone: CHANGE_TYPE_TONE[ct],
        hex: TONE_HEX[tagTone(CHANGE_TYPE_TONE[ct])],
      })),
    [liveSuggestions],
  );

  /** 筛选 + 排序后的建议清单 */
  const filteredSuggestions = useMemo(() => {
    const kw = sugKeyword.trim().toLowerCase();
    const band = CONF_BANDS.find((b) => b.key === sugBand) ?? CONF_BANDS[0];
    const list = liveSuggestions.filter((s) => {
      if (sugTypes.length > 0 && !sugTypes.includes(s.changeType)) return false;
      if (sugStatuses.length > 0 && !sugStatuses.includes(s.status)) return false;
      if (!band.test(s.confidencePct)) return false;
      if (sugCritOnly && s.impact.criticalPathDeltaDays === 0) return false;
      if (kw) {
        const hay = `${s.id} ${s.taskId} ${TASK_MAP[s.taskId]?.code ?? ''} ${s.taskTitle} ${s.reason}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    const sorted = list.slice();
    switch (sugSort) {
      case 'generated-asc':
        sorted.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.id.localeCompare(b.id));
        break;
      case 'confidence-desc':
        sorted.sort((a, b) => b.confidencePct - a.confidencePct || a.id.localeCompare(b.id));
        break;
      case 'confidence-asc':
        sorted.sort((a, b) => a.confidencePct - b.confidencePct || a.id.localeCompare(b.id));
        break;
      case 'cp-asc':
        sorted.sort(
          (a, b) => a.impact.criticalPathDeltaDays - b.impact.criticalPathDeltaDays || a.id.localeCompare(b.id),
        );
        break;
      case 'id-asc':
        sorted.sort((a, b) => a.id.localeCompare(b.id));
        break;
      default:
        sorted.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt) || a.id.localeCompare(b.id));
    }
    return sorted;
  }, [liveSuggestions, sugKeyword, sugTypes, sugStatuses, sugBand, sugCritOnly, sugSort]);

  /**
   * 冲突 ↔ 建议关联：
   *   named = 建议 reason 文本中直接点名的 GANTT-CF-xx（强关联）
   *   aux   = 建议 impact.affectedTaskIds 与冲突 taskIds 的交集（弱关联，仅辅助定位）
   */
  const conflictLinks = useMemo(() => {
    return GANTT_CONFLICTS.map((c) => {
      const named = liveSuggestions.filter((s) => conflictsNamedIn(s).includes(c.id));
      const aux = liveSuggestions.filter(
        (s) =>
          !named.includes(s) &&
          s.impact.affectedTaskIds.some((tid) => c.taskIds.includes(tid)),
      );
      const decided = named.filter((s) => s.status === 'accepted' || s.status === 'auto-applied');
      const pending = named.filter((s) => s.status === 'pending');
      let state: ResolveState;
      if (decided.length > 0) state = 'resolved';
      else if (pending.length > 0) state = 'pending';
      else if (named.length > 0) state = 'manual';
      else state = 'none';
      return { conflict: c, named, aux, decided, pending, state };
    });
  }, [liveSuggestions]);

  const resolvedConflictCount = useMemo(
    () => conflictLinks.filter((l) => l.state === 'resolved').length,
    [conflictLinks],
  );

  /** 一键自动排期的回放步骤（在 AIF-06 真实步骤上补充可核算的处理条目数 / 发现数） */
  const autoSteps = useMemo(() => {
    const sp24Tasks = liveTasks.filter((t) => t.sprintId === CURRENT_SPRINT.id);
    const overloadMembers = WORKLOADS.filter((w) => w.overload);
    const pendingList = liveSuggestions.filter((s) => s.status === 'pending');
    const gateBlockedPending = pendingList.filter((s) => gateBlockers(s).length > 0);
    const appliedList = liveSuggestions.filter(
      (s) => s.status === 'accepted' || s.status === 'auto-applied',
    );
    const steps = SCHEDULE_FLOW.steps.map((st) => {
      switch (st.order) {
        case 1:
          return {
            ...st,
            items: `${WORKLOADS.length} 位成员产能基线 / ${SPRINTS.length} 个迭代速率样本`,
            issues: `${overloadMembers.length} 位成员负载超 100%（${overloadMembers
              .map((w) => `${USER_MAP[w.userId]?.name ?? w.userId} ${fmt1(w.loadPct)}%`)
              .join('、')}）`,
          };
        case 2:
          return {
            ...st,
            items: `${sp24Tasks.length} 个 ${CURRENT_SPRINT.id} 工作项 · 合计 ${sp24Tasks.reduce(
              (sum, t) => sum + t.points,
              0,
            )} 故事点`,
            issues: `${sp24Tasks.filter((t) => t.actualHours > t.estimateHours).length} 个任务实际工时已超估算`,
          };
        case 3:
          return {
            ...st,
            items: `${TASK_DEPS.length} 条依赖（DEP-01 ~ DEP-${String(TASK_DEPS.length).padStart(2, '0')}）拓扑排序`,
            issues: `关键路径 ${CRITICAL_PATH.length} 个任务，未检出环形依赖`,
          };
        case 4:
          return {
            ...st,
            items: `${GANTT_CONFLICTS.length} 条冲突 + ${liveSuggestions.length} 条排期建议`,
            issues: `${liveSuggestions.filter((s) => gateBlockers(s).length > 0).length} 条建议存在未满足的硬约束，${
              liveSuggestions.filter((s) => s.confidencePct < 70).length
            } 条置信度低于 70%`,
          };
        case 5:
          return {
            ...st,
            items: `${liveSuggestions.filter((s) => s.status === 'auto-applied').length} 条自动应用（置信度 ≥ 85% 且不触碰关键路径）`,
            issues: `自动应用后 24h 内可一键回滚`,
          };
        case 6:
          return {
            ...st,
            items: `${pendingList.length} 条待人工决策`,
            issues: `${gateBlockedPending.length} 条被约束门禁禁用「采纳」（${
              gateBlockedPending.map((s) => s.id).join('、') || '无'
            }）`,
          };
        case 7:
          return {
            ...st,
            items: `${Object.keys(appliedPlans).length} 个任务的甘特条按已决策方案重排`,
            issues: `关键路径净变化 ${signedDays(
              appliedList.reduce((sum, s) => sum + s.impact.criticalPathDeltaDays, 0),
            )} · 迭代负载 ${signedHours(
              appliedList.reduce((sum, s) => sum + s.impact.sprintLoadDelta, 0),
            )}`,
          };
        default:
          return {
            ...st,
            items: `${liveSuggestions.length} 条决策理由 + 预估偏差样本入库`,
            issues: `归档失败不阻断基线锁定`,
          };
      }
    });
    return steps;
  }, [liveTasks, liveSuggestions, appliedPlans]);

  const autoDone = autoStep >= autoSteps.length;

  const drawerSug = useMemo(
    () => liveSuggestions.find((s) => s.id === drawerSugId) ?? null,
    [liveSuggestions, drawerSugId],
  );

  const sprint = useMemo(
    () => SPRINTS.find((s) => s.id === selectedSprint) ?? CURRENT_SPRINT,
    [selectedSprint],
  );

  /* ---------- 分组（按需求聚合当前迭代任务；日期与承接人取 AI 已应用方案后的值） ---------- */
  const groups = useMemo<SchGroup[]>(() => {
    const scoped = liveTasks.filter((t) => t.sprintId === selectedSprint);
    const byReq = new Map<string, TaskDef[]>();
    for (const t of scoped) {
      const key = t.reqId || '__release__';
      const list = byReq.get(key);
      if (list) list.push(t);
      else byReq.set(key, [t]);
    }
    const order = REQUIREMENTS_ORDER.filter((id) => byReq.has(id));
    if (byReq.has('__release__')) order.push('__release__');
    return order.map((id) => {
      const list = (byReq.get(id) ?? [])
        .slice()
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.code.localeCompare(b.code));
      return {
        id,
        req: id === '__release__' ? null : REQUIREMENT_MAP[id] ?? null,
        tasks: list,
        start: list[0].startDate,
        end: list[0].endDate,
        hours: list.reduce((s, t) => s + t.estimateHours, 0),
      };
    });
  }, [selectedSprint, liveTasks]);

  /* ---------- 负责人筛选后的分组 ---------- */
  const filteredGroups = useMemo<SchGroup[]>(() => {
    const out: SchGroup[] = [];
    for (const g of groups) {
      const tasks =
        ownerFilter.length === 0 ? g.tasks : g.tasks.filter((t) => ownerFilter.includes(t.ownerId));
      if (tasks.length === 0) continue;
      let start = tasks[0].startDate;
      let end = tasks[0].endDate;
      let hours = 0;
      for (const t of tasks) {
        if (t.startDate < start) start = t.startDate;
        if (t.endDate > end) end = t.endDate;
        hours += t.estimateHours;
      }
      out.push({ ...g, tasks, start, end, hours });
    }
    return out;
  }, [groups, ownerFilter]);

  /* ---------- 时间轴范围 ---------- */
  const rangeStart = useMemo(() => {
    let s = sprint.startDate;
    for (const g of groups) for (const t of g.tasks) if (t.startDate < s) s = t.startDate;
    return s;
  }, [sprint, groups]);

  const rangeEnd = useMemo(() => {
    let e = sprint.endDate;
    for (const g of groups) for (const t of g.tasks) if (t.endDate > e) e = t.endDate;
    return e;
  }, [sprint, groups]);

  const totalDays = diffDays(rangeStart, rangeEnd) + 1;

  const offsetPct = (date: string) => (diffDays(rangeStart, date) / totalDays) * 100;
  const spanPct = (days: number) => (days / totalDays) * 100;

  const todayIdx = diffDays(rangeStart, TODAY);
  const todayInRange = todayIdx >= 0 && todayIdx < totalDays;
  const todayPct = ((todayIdx + 0.5) / totalDays) * 100;

  /* ---------- 时间轴列 ---------- */
  const cols = useMemo<SchCol[]>(() => {
    const list: SchCol[] = [];
    if (granularity === 'day') {
      for (let i = 0; i < totalDays; i += 1) {
        const d = shiftDays(rangeStart, i);
        list.push({
          key: `d${i}`,
          label: String(d.getDate()).padStart(2, '0'),
          sub: WEEKDAYS[d.getDay()],
          days: 1,
          weekend: isWeekend(d),
          today: i === todayIdx,
        });
      }
      return list;
    }
    let i = 0;
    let wi = 0;
    while (i < totalDays) {
      const d = shiftDays(rangeStart, i);
      const days = Math.min(7, totalDays - i);
      list.push({
        key: `w${wi}`,
        label: fmtMD(d),
        sub: `W${wi + 1}`,
        days,
        weekend: false,
        today: todayIdx >= i && todayIdx < i + days,
      });
      i += 7;
      wi += 1;
    }
    return list;
  }, [granularity, rangeStart, totalDays, todayIdx]);

  /* ---------- 扁平化行（分组头 + 任务行） ---------- */
  const rows = useMemo<SchRow[]>(() => {
    const out: SchRow[] = [];
    for (const g of filteredGroups) {
      out.push({ kind: 'group', id: g.id, group: g });
      if (expanded[g.id] !== false) {
        for (const t of g.tasks) out.push({ kind: 'task', id: t.id, task: t });
      }
    }
    return out;
  }, [filteredGroups, expanded]);

  /* ---------- 风险推算表 ---------- */
  const riskMap = useMemo(() => {
    const m = new Map<string, RiskInfo>();
    for (const t of TASKS) {
      const r = deriveRisk(t);
      if (r) m.set(t.id, r);
    }
    return m;
  }, []);

  /* ---------- 统计 ---------- */
  const stats = useMemo(() => {
    const tasks = filteredGroups.flatMap((g) => g.tasks);
    return {
      taskCount: tasks.length,
      hours: tasks.reduce((s, t) => s + t.estimateHours, 0),
      remainDays: Math.max(0, diffDays(TODAY, sprint.endDate)),
      criticalCount: tasks.filter((t) => t.critical || CRITICAL_PATH.includes(t.id)).length,
    };
  }, [filteredGroups, sprint]);

  /* ---------- 负责人 chips（仅取实际有任务的人） ---------- */
  const ownerChips = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) for (const t of g.tasks) ids.add(t.ownerId);
    return USERS.filter((u) => ids.has(u.id));
  }, [groups]);

  /* ---------- 冲突 ---------- */
  const openConflicts = useMemo(
    () => GANTT_CONFLICTS.filter((c) => c.status === 'open'),
    [],
  );

  /* ---------- 依赖箭头坐标计算（基于容器尺寸 ref，不写死坐标） ---------- */
  const layoutKey = useMemo(
    () =>
      `${selectedSprint}|${granularity}|${viewMode}|${rows.map((r) => r.id).join(',')}|${
        applyAiToGantt ? 'ai' : 'raw'
      }|${Object.keys(appliedPlans)
        .sort()
        .map((k) => `${k}:${appliedPlans[k].startDate}~${appliedPlans[k].endDate}~${appliedPlans[k].assigneeId}`)
        .join(';')}`,
    [selectedSprint, granularity, viewMode, rows, applyAiToGantt, appliedPlans],
  );

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;

    const compute = () => {
      const bb = body.getBoundingClientRect();
      const out: DepPath[] = [];
      for (const dep of TASK_DEPS) {
        const a = barRefs.current.get(dep.from);
        const b = barRefs.current.get(dep.to);
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        if (ar.width === 0 || br.width === 0) continue;
        const x1 = ar.right - bb.left - SIDE_W;
        const y1 = ar.top - bb.top + ar.height / 2;
        const x2 = br.left - bb.left - SIDE_W;
        const y2 = br.top - bb.top + br.height / 2;
        const midX = x1 + 10 > x2 - 12 ? x1 + 10 : x2 - 12;
        out.push({
          id: dep.id,
          from: dep.from,
          to: dep.to,
          critical: dep.critical,
          note: dep.note,
          d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`,
        });
      }
      setDepPaths(out);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(body);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [layoutKey]);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  /* ---------- 一键 AI 自动排期：逐步回放 ---------- */
  useEffect(() => {
    if (!autoOpen || autoStep < 0 || autoStep >= autoSteps.length) return undefined;
    const timer = window.setTimeout(() => setAutoStep((v) => v + 1), 640);
    return () => window.clearTimeout(timer);
  }, [autoOpen, autoStep, autoSteps.length]);

  const openAutoRun = () => {
    setAutoApplied(false);
    setAutoStep(0);
    setAutoOpen(true);
  };

  const closeAutoRun = () => {
    setAutoOpen(false);
    setAutoStep(-1);
  };

  /* ---------- 定位到任务：解除筛选 / 展开分组 / 滚动 + 闪烁高亮 ---------- */
  const revealTask = (id: string) => {
    const t = liveTaskMap.get(id) ?? TASK_MAP[id];
    if (!t) return;
    if (selectedSprint !== t.sprintId) setSelectedSprint(t.sprintId);
    if (ownerFilter.length > 0 && !ownerFilter.includes(t.ownerId)) setOwnerFilter([]);
    if (viewMode === 'critical') setViewMode('all');
    const gid = t.reqId || '__release__';
    setExpanded((prev) => ({ ...prev, [gid]: true }));
    window.setTimeout(() => {
      const el = barRefs.current.get(id);
      if (el) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      setFlashId(id);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1300);
    }, 60);
  };

  const toggleOwner = (id: string) => {
    setOwnerFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /* ---------- AI 排期建议：乐观更新（采纳 / 驳回 / 撤销） ---------- */

  const writeOverride = (id: string, next: SugOverride | null) => {
    setOverrides((prev) => {
      const out = { ...prev };
      if (next) out[id] = next;
      else delete out[id];
      return out;
    });
  };

  const acceptSuggestion = (s: AiScheduleSuggestionDef) => {
    if (gateBlockers(s).length > 0) return;
    const prev = overrides[s.id] ?? null;
    writeOverride(s.id, {
      status: 'accepted',
      decidedBy: CURRENT_USER.id,
      decidedAt: stampNow(),
      rejectReason: null,
    });
    setUndoEntry({ id: s.id, prev });
    const moved = planChanged(s.currentPlan, s.suggestedPlan);
    setFeedback({
      tone: 'ok',
      text: moved
        ? `已采纳 ${s.id}：${TASK_MAP[s.taskId]?.code ?? s.taskId} 的甘特条已按建议计划移动到 ${s.suggestedPlan.startDate} ~ ${s.suggestedPlan.endDate}${
            s.suggestedPlan.assigneeId !== s.currentPlan.assigneeId
              ? `，承接人改为 ${USER_MAP[s.suggestedPlan.assigneeId]?.name ?? s.suggestedPlan.assigneeId}`
              : ''
          }。`
        : `已采纳 ${s.id}：建议计划与当前计划一致，甘特条位置不变。`,
    });
    setApplyAiToGantt(true);
    setRejectOpen(false);
  };

  const rejectSuggestion = (s: AiScheduleSuggestionDef, reason: string) => {
    const prev = overrides[s.id] ?? null;
    writeOverride(s.id, {
      status: 'rejected',
      decidedBy: CURRENT_USER.id,
      decidedAt: stampNow(),
      rejectReason: reason.trim() || '（未填写驳回理由）',
    });
    setUndoEntry({ id: s.id, prev });
    setFeedback({
      tone: 'warn',
      text: `已驳回 ${s.id}：${TASK_MAP[s.taskId]?.code ?? s.taskId} 保持当前计划，关联冲突的消解状态已同步刷新。`,
    });
    setRejectOpen(false);
    setRejectText('');
  };

  const undoLastDecision = () => {
    if (!undoEntry) return;
    writeOverride(undoEntry.id, undoEntry.prev);
    setFeedback({
      tone: 'ok',
      text: `已撤销对 ${undoEntry.id} 的本次决策，状态与甘特图回到决策前。`,
    });
    setUndoEntry(null);
  };

  /** 一键把「通过约束门禁」的待决策建议全部采纳（门禁未通过的建议保持 pending 并说明原因） */
  const applyDraftToGantt = () => {
    const pendingList = liveSuggestions.filter((s) => s.status === 'pending');
    const passable = pendingList.filter((s) => gateBlockers(s).length === 0);
    const blocked = pendingList.filter((s) => gateBlockers(s).length > 0);
    const stamp = stampNow();
    setOverrides((prev) => {
      const out = { ...prev };
      for (const s of passable) {
        out[s.id] = { status: 'accepted', decidedBy: CURRENT_USER.id, decidedAt: stamp, rejectReason: null };
      }
      return out;
    });
    if (passable.length > 0) setUndoEntry(null);
    setApplyAiToGantt(true);
    setAutoApplied(true);
    setFeedback(
      blocked.length > 0
        ? {
            tone: 'warn',
            text: `草案已应用：${passable.length} 条待决策建议通过门禁并采纳（${
              passable.map((s) => s.id).join('、') || '无'
            }）；${blocked.length} 条被约束门禁拦下，仍需人工裁决（${blocked
              .map((s) => `${s.id}：${gateBlockers(s)
                .map((c) => c.constraint)
                .join('/')}`)
              .join('；')}）。`,
          }
        : {
            tone: 'warn',
            text: `本次草案没有可自动采纳的待决策建议：${blocked.length} 条全部被约束门禁拦下（${blocked
              .map((s) => s.id)
              .join('、')}），需先补齐未满足的硬约束。`,
          },
    );
  };

  const toggleSugType = (ct: SugChangeType) => {
    setSugTypes((prev) => (prev.includes(ct) ? prev.filter((x) => x !== ct) : [...prev, ct]));
  };

  const toggleSugStatus = (st: SugStatus) => {
    setSugStatuses((prev) => (prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]));
  };

  const resetSugFilters = () => {
    setSugKeyword('');
    setSugTypes([]);
    setSugStatuses([]);
    setSugBand('all');
    setSugCritOnly(false);
    setSugSort('generated-desc');
  };

  const openSugDrawer = (id: string) => {
    setDrawerTask(null);
    setDrawerSugId(id);
    setRejectOpen(false);
    setRejectText('');
  };

  /* ============================================================
   * 渲染片段
   * ============================================================ */

  const gridCells = (keyPrefix: string) => (
    <div className="ac-gantt-grid">
      {cols.map((c) => (
        <div
          key={`${keyPrefix}-${c.key}`}
          className={`ac-gantt-grid-cell ${c.weekend ? 'ac-gantt-grid-cell--weekend' : ''} ${
            c.today ? 'ac-gantt-grid-cell--today' : ''
          }`}
          style={{ flexGrow: c.days, flexBasis: 0 }}
        />
      ))}
    </div>
  );

  const renderGroupRow = (g: SchGroup) => {
    const isOpen = expanded[g.id] !== false;
    const left = clampPct(offsetPct(g.start));
    const right = clampPct(offsetPct(g.end) + spanPct(1));
    const width = Math.max(right - left, 0.8);
    const critical = g.tasks.some((t) => t.critical || CRITICAL_PATH.includes(t.id));
    const title = g.req ? `${g.req.code} ${g.req.title}` : '发布执行类工作项（未关联需求）';
    return (
      <div className="ac-gantt-row ac-sch-grouprow" key={g.id}>
        <div
          className="ac-gantt-side ac-sch-group-side"
          title={title}
          onClick={() => setExpanded((prev) => ({ ...prev, [g.id]: !isOpen }))}
        >
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="ac-sch-group-code">{g.req ? g.req.code : 'REL'}</span>
          <span className="ac-sch-group-name">{g.req ? g.req.title : title}</span>
          <span className="ac-sch-group-meta">
            <div>
              <b>{g.tasks.length}</b> 项
            </div>
            <div>
              {g.start.slice(5)} ~ {g.end.slice(5)} · {g.hours}h
            </div>
          </span>
        </div>
        <div className="ac-gantt-track">
          {gridCells(g.id)}
          {todayInRange && <div className="ac-gantt-today-line" style={{ left: `${todayPct}%` }} />}
          <div
            className="ac-sch-groupbar"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: critical ? '#aab2c5' : undefined,
            }}
          >
            <span className="ac-sch-groupbar-label">
              {g.tasks.length} 项 · {g.hours}h
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderTaskRow = (t: TaskDef) => {
    const critical = t.critical || CRITICAL_PATH.includes(t.id);
    const dim = viewMode === 'critical' && !critical;
    const stateDef = TASK_STATE_MAP[t.state];
    const toneCls = stateDef ? TONE_CLASS[stateDef.tone] ?? '' : '';
    const owner = USER_MAP[t.ownerId];
    const risk = riskMap.get(t.id) ?? null;
    const left = clampPct(offsetPct(t.startDate));
    const right = clampPct(offsetPct(t.endDate) + spanPct(1));
    const width = Math.max(right - left, 1.2);
    const flash = flashId === t.id;
    const applied = applyAiToGantt ? appliedPlans[t.id] ?? null : null;
    const raw = TASK_MAP[t.id];

    return (
      <div
        className={`ac-gantt-row ac-sch-row--clickable ${dim ? 'ac-sch-row--dim' : ''}`}
        key={t.id}
        onClick={() => setDrawerTask(t)}
      >
        <div className="ac-gantt-side ac-sch-row-side">
          <div className="ac-sch-cell-task">
            <span className="ac-gantt-side-id">{t.code}</span>
            <span className="ac-gantt-side-name" title={t.title}>
              {t.title}
            </span>
          </div>
          <span className="ac-sch-cell-owner">
            {owner ? (
              <span
                className={`ac-avatar ac-avatar--xs ac-avatar--${owner.avatarColor} ${
                  applied && raw && applied.assigneeId !== raw.ownerId ? 'ac-sch-avatar--ai' : ''
                }`}
                title={
                  applied && raw && applied.assigneeId !== raw.ownerId
                    ? `${owner.name} · ${owner.title}（AI ${applied.sugId} 改派，原 ${
                        USER_MAP[raw.ownerId]?.name ?? raw.ownerId
                      }）`
                    : `${owner.name} · ${owner.title}`
                }
              >
                {owner.initial}
              </span>
            ) : null}
          </span>
          <span className="ac-sch-cell-hours">{t.estimateHours}h</span>
        </div>
        <div className="ac-gantt-track">
          {gridCells(t.id)}
          {todayInRange && <div className="ac-gantt-today-line" style={{ left: `${todayPct}%` }} />}
          {applied && raw && (
            <div
              className="ac-sch-bar-ghost"
              style={{
                left: `${clampPct(offsetPct(raw.startDate))}%`,
                width: `${Math.max(
                  clampPct(offsetPct(raw.endDate) + spanPct(1)) - clampPct(offsetPct(raw.startDate)),
                  1.2,
                )}%`,
              }}
              title={`原始计划 ${raw.startDate} ~ ${raw.endDate}（AI ${applied.sugId} 已调整）`}
            />
          )}
          <div
            ref={(el) => {
              if (el) barRefs.current.set(t.id, el);
              else barRefs.current.delete(t.id);
            }}
            className={`ac-gantt-bar ${toneCls} ${critical ? 'ac-sch-bar--critical' : ''} ${
              flash ? 'ac-sch-bar--flash' : ''
            } ${applied ? 'ac-sch-bar--ai-applied' : ''}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            onClick={(e) => {
              e.stopPropagation();
              setDrawerTask(t);
            }}
            onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, node: barTip(t, risk, applied) })}
            onMouseMove={(e) =>
              setTip((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p))
            }
            onMouseLeave={() => setTip(null)}
          >
            <span
              className="ac-gantt-bar-fill"
              style={{ width: `${Math.min(100, Math.max(0, t.progress))}%` }}
            />
            <span className="ac-gantt-bar-label">{t.progress}%</span>
          </div>
          {risk && (
            <span
              className={`ac-sch-risk ${risk.level === 'high' ? 'ac-sch-risk--high' : ''}`}
              style={{ left: `calc(${left + width}% + 3px)` }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                setTip({
                  x: e.clientX,
                  y: e.clientY,
                  node: riskTip(t, risk),
                  cls: `ac-sch-tip--risk ${risk.level === 'high' ? 'ac-sch-tip--high' : ''}`,
                });
              }}
              onMouseMove={(e) =>
                setTip((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p))
              }
              onMouseLeave={() => setTip(null)}
            >
              <AlertTriangle size={12} />
            </span>
          )}
        </div>
      </div>
    );
  };

  /* ---------- AI 排期建议：计划单元格 / 表格行 ---------- */

  const planCell = (p: SchedulePlanDef, other: SchedulePlanDef, kind: 'cur' | 'sug') => {
    const u = USER_MAP[p.assigneeId];
    const dStart = diffDays(other.startDate, p.startDate);
    const dEnd = diffDays(other.endDate, p.endDate);
    const dPts = p.points - other.points;
    const reassigned = p.assigneeId !== other.assigneeId;
    const net = dStart + dEnd;
    const deltaCls = net < 0 ? 'ac-sch-delta--up' : net > 0 ? 'ac-sch-delta--down' : 'ac-sch-delta--zero';
    return (
      <span className="ac-sch-plan">
        {u ? (
          <span
            className={`ac-avatar ac-avatar--xs ac-avatar--${u.avatarColor} ${
              kind === 'sug' && reassigned ? 'ac-sch-avatar--ai' : ''
            }`}
            title={`${u.name} · ${u.title}`}
          >
            {u.initial}
          </span>
        ) : (
          <span className="ac-sch-plan-nouser" title={p.assigneeId}>
            {p.assigneeId}
          </span>
        )}
        <span className="ac-sch-plan-body">
          <span className="ac-mono ac-sch-plan-dates">
            {p.startDate.slice(5)} ~ {p.endDate.slice(5)}
          </span>
          {kind === 'sug' && (
            <span className="ac-sch-plan-delta">
              {reassigned && (
                <em className="ac-sch-delta--reassign">
                  改派 {USER_MAP[other.assigneeId]?.name ?? other.assigneeId} → {u?.name ?? p.assigneeId}
                </em>
              )}
              {(dStart !== 0 || dEnd !== 0) && (
                <em className={deltaCls}>
                  起 {signedDays(dStart)} · 止 {signedDays(dEnd)}
                </em>
              )}
              {dPts !== 0 && <em className={deltaCls}>点数 {dPts > 0 ? '+' : '−'}{Math.abs(dPts)}</em>}
              {dStart === 0 && dEnd === 0 && !reassigned && dPts === 0 && (
                <em className="ac-sch-delta--zero">与当前计划一致</em>
              )}
            </span>
          )}
        </span>
        <span className="ac-sch-plan-pts">{p.points}pt</span>
      </span>
    );
  };

  const renderSugRow = (s: AiScheduleSuggestionDef) => {
    const model = MODEL_MAP[s.modelId];
    const agent = AGENT_MAP[s.agentId];
    const task = TASK_MAP[s.taskId];
    const blockers = gateBlockers(s);
    const st = SUG_STATUS_META[s.status];
    const decidedUser = s.decidedBy ? USER_MAP[s.decidedBy] : null;
    const isLocal = !!overrides[s.id];
    const confLow = s.confidencePct < 70;
    const cp = s.impact.criticalPathDeltaDays;
    const load = s.impact.sprintLoadDelta;
    const appliedToGantt =
      applyAiToGantt &&
      (s.status === 'accepted' || s.status === 'auto-applied') &&
      appliedPlans[s.taskId]?.sugId === s.id;

    return (
      <tr key={s.id} className={isLocal ? 'ac-sch-tr--local' : ''}>
        <td>
          <span className="ac-sch-sugid">{s.id}</span>
          {isLocal && (
            <span className="ac-tag ac-tag--ai ac-tag--sm" title="状态来自本页乐观更新覆盖层，未写回数据文件">
              本次会话
            </span>
          )}
          {appliedToGantt && (
            <span className="ac-tag ac-tag--brand ac-tag--sm" title="甘特条已按本条建议的 suggestedPlan 重排">
              已落到甘特
            </span>
          )}
        </td>
        <td>
          <button
            type="button"
            className="ac-sch-tasklink"
            onClick={() => revealTask(s.taskId)}
            title={`${task?.code ?? s.taskId} · ${s.taskTitle} · 点击定位到甘特并高亮`}
          >
            <span className="ac-mono ac-sch-tasklink-id">{s.taskId}</span>
            <span className="ac-sch-tasklink-title">{s.taskTitle}</span>
          </button>
        </td>
        <td className="ac-mono ac-sch-nowrap">{s.generatedAt}</td>
        <td>
          <span className="ac-sch-inline" title={model ? `${model.vendor} · ${model.version} · ${model.contextWindow}` : s.modelId}>
            <span
              className="ac-sch-dot"
              style={{ background: TONE_HEX[tagTone(model?.tone ?? 'neutral')] }}
            />
            {model?.name ?? s.modelId}
          </span>
        </td>
        <td>
          <span className="ac-sch-inline" title={agent ? `${agent.stageName} · 采纳率 ${agent.acceptRate}%` : s.agentId}>
            <Cpu size={12} />
            {agent?.name ?? s.agentId}
          </span>
        </td>
        <td>
          <span
            className={`ac-tag ac-tag--${tagTone(CHANGE_TYPE_TONE[s.changeType])} ac-tag--sm`}
            title={CHANGE_TYPE_HINT[s.changeType]}
          >
            {s.changeType}
          </span>
        </td>
        <td>{planCell(s.currentPlan, s.suggestedPlan, 'cur')}</td>
        <td>{planCell(s.suggestedPlan, s.currentPlan, 'sug')}</td>
        <td>
          <span className="ac-sch-conf">
            <b className={confLow ? 'ac-sch-conf--low' : ''}>{s.confidencePct}%</b>
            <span className="ac-sch-conf-bar">
              <i
                style={{
                  width: `${clampPct(s.confidencePct)}%`,
                  background: confLow ? TONE_HEX.warn : TONE_HEX.brand,
                }}
              />
            </span>
          </span>
        </td>
        <td className="ac-td-num">
          <span
            className={cp < 0 ? 'ac-ok-text' : cp > 0 ? 'ac-danger-text' : 'ac-muted'}
            title={`impact.criticalPathDeltaDays = ${cp}（负数为关键路径缩短）`}
          >
            {cp === 0 ? '0 天' : signedDays(cp)}
          </span>
        </td>
        <td className="ac-td-num">
          <span
            className={load < 0 ? 'ac-ok-text' : load > 0 ? 'ac-danger-text' : 'ac-muted'}
            title={`impact.sprintLoadDelta = ${load}h（负数为释放迭代产能）`}
          >
            {signedHours(load)}
          </span>
        </td>
        <td>
          <span className={`ac-tag ac-tag--${tagTone(RISK_DELTA_TONE[s.impact.riskDelta])} ac-tag--sm`}>
            {s.impact.riskDelta}
          </span>
        </td>
        <td>
          <span className={`ac-tag ac-tag--${tagTone(st.tone)} ac-tag--sm`}>{st.label}</span>
          {blockers.length > 0 && (
            <span
              className="ac-sch-gate"
              title={`约束门禁未通过：${blockers.map((b) => `${b.constraint}（${b.detail}）`).join('；')}`}
            >
              <Ban size={11} /> 门禁 {blockers.length}
            </span>
          )}
        </td>
        <td>
          {decidedUser ? (
            <span className="ac-sch-inline" title={`${decidedUser.name} · ${decidedUser.title}`}>
              <span className={`ac-avatar ac-avatar--xs ac-avatar--${decidedUser.avatarColor}`}>
                {decidedUser.initial}
              </span>
              {decidedUser.name}
            </span>
          ) : (
            <span className="ac-muted" title="auto-applied 由平台按白名单自动执行，无人工决策人">
              {s.status === 'auto-applied' ? '系统自动' : '—'}
            </span>
          )}
        </td>
        <td className="ac-mono ac-sch-nowrap">{s.decidedAt ?? '—'}</td>
        <td>
          <span className="ac-sch-ops">
            <button
              type="button"
              className="ac-btn ac-btn--text ac-btn--sm"
              onClick={() => openSugDrawer(s.id)}
            >
              详情
            </button>
            {s.status === 'pending' && (
              <>
                <button
                  type="button"
                  className={`ac-btn ac-btn--sm ${blockers.length > 0 ? 'ac-btn--ghost ac-btn--disabled' : 'ac-btn--primary'}`}
                  onClick={() => acceptSuggestion(s)}
                  disabled={blockers.length > 0}
                  title={
                    blockers.length > 0
                      ? `约束门禁未通过，禁止采纳：${blockers.map((b) => b.constraint).join('、')}`
                      : '采纳后甘特条按 suggestedPlan 重排'
                  }
                >
                  <Check size={12} /> 采纳
                </button>
                <button
                  type="button"
                  className="ac-btn ac-btn--ghost ac-btn--sm"
                  onClick={() => {
                    openSugDrawer(s.id);
                    setRejectOpen(true);
                  }}
                >
                  驳回
                </button>
              </>
            )}
            {isLocal && (
              <button
                type="button"
                className="ac-btn ac-btn--text ac-btn--sm"
                onClick={() => {
                  setUndoEntry(null);
                  writeOverride(s.id, null);
                  setFeedback({
                    tone: 'ok',
                    text: `已还原 ${s.id} 为数据文件中的原始状态（${SUG_STATUS_META[AI_SCHEDULE_SUGGESTIONS.find((x) => x.id === s.id)?.status ?? 'pending'].label}）。`,
                  });
                }}
                title="清除本次会话对该建议的覆盖，还原为 data-ai-flow.ts 的原始状态"
              >
                <Undo2 size={12} /> 还原
              </button>
            )}
          </span>
        </td>
      </tr>
    );
  };

  /* ============================================================
   * 主渲染
   * ============================================================ */

  const d = drawerTask;
  const dReq = d && d.reqId ? REQUIREMENT_MAP[d.reqId] ?? null : null;
  const dState = d ? TASK_STATE_MAP[d.state] : undefined;
  const dOwner = d ? USER_MAP[d.ownerId] : undefined;
  const dRisk = d ? riskMap.get(d.id) ?? null : null;
  const prevDeps = d ? TASK_DEPS.filter((x) => x.to === d.id) : [];
  const nextDeps = d ? TASK_DEPS.filter((x) => x.from === d.id) : [];
  const dBugs = d ? BUGS.filter((b) => b.taskIds.includes(d.id)) : [];

  /* AI 排期建议抽屉的派生数据 */
  const ds = drawerSug;
  const dsBlockers = ds ? gateBlockers(ds) : [];
  const dsTask = ds ? TASK_MAP[ds.taskId] : undefined;
  const dsModel = ds ? MODEL_MAP[ds.modelId] : undefined;
  const dsAgent = ds ? AGENT_MAP[ds.agentId] : undefined;
  const dsDecidedUser = ds && ds.decidedBy ? USER_MAP[ds.decidedBy] : null;
  const dsLinks = ds ? conflictLinks.filter((l) => l.named.some((x) => x.id === ds.id)) : [];

  return (
    <div className="ac-page ac-sch" data-annotation-id="ai-sdlc-schedule-page">
      {/* ============ 0. 页头：AI 区块开关 + 一键 AI 自动排期入口 ============ */}
      <div className="ac-page-head">
        <div>
          <h2 className="ac-page-title">排期甘特</h2>
          <p className="ac-page-desc">
            {sprint.name}（{sprint.theme}）· {sprint.startDate} ~ {sprint.endDate} · 关键路径{' '}
            {CRITICAL_PATH.length} 个任务。AI 排期与冲突消解能力来自编排流 {SCHEDULE_FLOW.id}「
            {SCHEDULE_FLOW.name}」（自动化率 {SCHEDULE_FLOW.autoRatePct}% · 平均端到端{' '}
            {SCHEDULE_FLOW.avgEndToEndMin} 分钟 · 最近一次 {SCHEDULE_FLOW.lastRunAt}）。
          </p>
        </div>
        <div className="ac-page-actions" data-annotation-id="ai-sdlc-schedule-auto-run">
          <span className="ac-sch-field">
            AI 区块
            <span className="ac-sch-seg">
              <button
                type="button"
                className={`ac-sch-seg-btn ${aiBlocksOpen ? 'ac-sch-seg-btn--active' : ''}`}
                onClick={() => setAiBlocksOpen(true)}
              >
                显示
              </button>
              <button
                type="button"
                className={`ac-sch-seg-btn ${!aiBlocksOpen ? 'ac-sch-seg-btn--active' : ''}`}
                onClick={() => setAiBlocksOpen(false)}
              >
                隐藏
              </button>
            </span>
          </span>
          <button
            type="button"
            className="ac-btn ac-btn--ghost ac-btn--sm"
            onClick={undoLastDecision}
            disabled={!undoEntry}
            title={undoEntry ? `撤销对 ${undoEntry.id} 的本次决策` : '本次会话尚无 AI 排期决策可撤销'}
          >
            <Undo2 size={14} /> 撤销上次决策
          </button>
          <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={openAutoRun}>
            <Sparkles size={14} /> AI 自动排期
          </button>
        </div>
      </div>

      {/* ============ 0.1 AI 排期指标 ============ */}
      <div className="ac-card ac-card--flat" data-annotation-id="ai-sdlc-schedule-ai-metrics">
        <div className="ac-card-head">
          <span className="ac-card-title">
            <Sparkles size={15} /> AI 排期效果概览
          </span>
          <span className="ac-card-subtitle">
            数据源 AI_SCHEDULE_SUGGESTIONS（{aiStats.total} 条）· 决策时间基准 {AI_FLOW_TODAY}
          </span>
          <div className="ac-card-extra">
            <span className="ac-sch-field">
              甘特基线
              <span className="ac-sch-seg">
                <button
                  type="button"
                  className={`ac-sch-seg-btn ${applyAiToGantt ? 'ac-sch-seg-btn--active' : ''}`}
                  onClick={() => setApplyAiToGantt(true)}
                  title="甘特条按已采纳 / 自动应用的 suggestedPlan 重排"
                >
                  AI 已应用
                </button>
                <button
                  type="button"
                  className={`ac-sch-seg-btn ${!applyAiToGantt ? 'ac-sch-seg-btn--active' : ''}`}
                  onClick={() => setApplyAiToGantt(false)}
                  title="回退到 data.ts 中 TASKS 的原始 startDate / endDate / ownerId"
                >
                  原始计划
                </button>
              </span>
            </span>
          </div>
        </div>
        <div className="ac-card-body ac-card-body--tight">
          <div className="ac-metric-grid">
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">AI 排期建议</span>
                <span className="ac-metric-icon">
                  <ListChecks size={15} />
                </span>
              </div>
              <div className="ac-metric-value">{aiStats.total}</div>
              <div className="ac-metric-foot">
                已采纳 {aiStats.byStatus.accepted} · 自动应用 {aiStats.byStatus['auto-applied']} · 已驳回{' '}
                {aiStats.byStatus.rejected}
              </div>
            </div>
            <div className={`ac-metric ${aiStats.byStatus.pending > 0 ? 'ac-metric--warn' : ''}`}>
              <div className="ac-metric-head">
                <span className="ac-metric-label">待决策</span>
                <span className="ac-metric-icon">
                  <Clock size={15} />
                </span>
              </div>
              <div className="ac-metric-value">{aiStats.byStatus.pending}</div>
              <div className="ac-metric-foot">
                其中 {aiStats.gateBlockedCount} 条存在未满足约束，「采纳」被门禁禁用
              </div>
            </div>
            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head">
                <span className="ac-metric-label">已采纳率</span>
                <span className="ac-metric-icon">
                  <Check size={15} />
                </span>
              </div>
              <div className="ac-metric-value">
                {aiStats.adoptRatePct}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">
                {aiStats.adopted} / {aiStats.total} 条（accepted + auto-applied）
              </div>
            </div>
            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">平均置信度</span>
                <span className="ac-metric-icon">
                  <Target size={15} />
                </span>
              </div>
              <div className="ac-metric-value">
                {aiStats.avgConfidencePct}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">
                已采纳均值 {aiStats.adoptedAvgConfidencePct}% · 已驳回均值{' '}
                {aiStats.rejectedAvgConfidencePct}%
              </div>
            </div>
            <div
              className={`ac-metric ${
                aiStats.cpDeltaDays < 0 ? 'ac-metric--ok' : aiStats.cpDeltaDays > 0 ? 'ac-metric--danger' : ''
              }`}
            >
              <div className="ac-metric-head">
                <span className="ac-metric-label">关键路径净收益</span>
                <span className="ac-metric-icon">
                  {aiStats.cpDeltaDays < 0 ? (
                    <ArrowDownRight size={15} />
                  ) : aiStats.cpDeltaDays > 0 ? (
                    <ArrowUpRight size={15} />
                  ) : (
                    <Minus size={15} />
                  )}
                </span>
              </div>
              <div className="ac-metric-value">
                {aiStats.cpDeltaDays}
                <span className="ac-metric-unit">天</span>
              </div>
              <div className="ac-metric-foot">
                迭代负载 {signedHours(aiStats.loadDeltaHours)} · 已重排 {aiStats.appliedTaskCount} 个任务条
              </div>
            </div>
          </div>
        </div>
        <div className="ac-card-foot ac-sch-caliber">
          <Info size={12} />
          <span>
            口径：已采纳率 =（accepted + auto-applied）÷ AI_SCHEDULE_SUGGESTIONS 总数；平均置信度 =
            confidencePct 算术平均；关键路径净收益 = 已采纳 / 自动应用建议的 impact.criticalPathDeltaDays 求和（负数为缩短）；
            迭代负载 = 同口径下 impact.sprintLoadDelta 求和（负数为释放产能）；已重排任务数 = appliedPlans 的键数（同一任务命中多条建议时取
            decidedAt 最晚的一条）。以上数值随本页的采纳 / 驳回操作实时重算。
          </span>
        </div>
      </div>

      {/* ============ 0.2 乐观更新反馈条 ============ */}
      {feedback && (
        <div className={`ac-hint ac-hint--${feedback.tone} ac-sch-feedback`}>
          {feedback.tone === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
          <span className="ac-sch-feedback-text">{feedback.text}</span>
          {undoEntry && (
            <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={undoLastDecision}>
              <Undo2 size={13} /> 撤销
            </button>
          )}
          <button
            type="button"
            className="ac-btn ac-btn--text ac-btn--sm"
            onClick={() => setFeedback(null)}
            aria-label="关闭提示"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ============ 1. 工具栏 ============ */}
      <div className="ac-card ac-card--flat ac-sch-toolbar" data-annotation-id="ai-sdlc-schedule-toolbar">
        <div className="ac-sch-toolbar-row">
          <label className="ac-sch-field">
            <CalendarRange size={14} />
            迭代
            <select
              className="ac-select ac-select--sm"
              value={selectedSprint}
              onChange={(e) => setSelectedSprint(e.target.value)}
            >
              {SPRINTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.theme}（{s.startDate} ~ {s.endDate}）
                </option>
              ))}
            </select>
          </label>

          <span className="ac-sch-field">
            <SlidersHorizontal size={14} />
            粒度
            <span className="ac-sch-seg">
              <button
                type="button"
                className={`ac-sch-seg-btn ${granularity === 'week' ? 'ac-sch-seg-btn--active' : ''}`}
                onClick={() => setGranularity('week')}
                title="按周展示（每列 7 天）"
              >
                周
              </button>
              <button
                type="button"
                className={`ac-sch-seg-btn ${granularity === 'day' ? 'ac-sch-seg-btn--active' : ''}`}
                onClick={() => setGranularity('day')}
                title="按日展示（每列 1 天）"
              >
                日
              </button>
            </span>
          </span>

          <span className="ac-sch-field">
            <Target size={14} />
            视图
            <span className="ac-sch-seg">
              <button
                type="button"
                className={`ac-sch-seg-btn ${viewMode === 'all' ? 'ac-sch-seg-btn--active' : ''}`}
                onClick={() => setViewMode('all')}
              >
                全部任务
              </button>
              <button
                type="button"
                className={`ac-sch-seg-btn ${viewMode === 'critical' ? 'ac-sch-seg-btn--active' : ''}`}
                onClick={() => setViewMode('critical')}
                title="非关键路径任务置灰"
              >
                仅关键路径
              </button>
            </span>
          </span>

          <div className="ac-sch-stats">
            <div className="ac-sch-stat">
              <span className="ac-sch-stat-num">{stats.taskCount}</span>
              <span className="ac-sch-stat-label">任务数</span>
            </div>
            <div className="ac-sch-stat">
              <span className="ac-sch-stat-num">{stats.hours}</span>
              <span className="ac-sch-stat-label">总工时 (h)</span>
            </div>
            <div className="ac-sch-stat">
              <span
                className={`ac-sch-stat-num ${
                  stats.remainDays <= 3
                    ? 'ac-sch-stat-num--danger'
                    : stats.remainDays <= 7
                    ? 'ac-sch-stat-num--warn'
                    : ''
                }`}
              >
                {stats.remainDays}
              </span>
              <span className="ac-sch-stat-label">迭代剩余天数</span>
            </div>
            <div className="ac-sch-stat">
              <span className="ac-sch-stat-num">{stats.criticalCount}</span>
              <span className="ac-sch-stat-label">关键路径任务</span>
            </div>
          </div>
        </div>

        <div className="ac-sch-toolbar-row">
          <span className="ac-sch-field">
            <Users size={14} />
            负责人
          </span>
          <div className="ac-sch-chips">
            {ownerChips.map((u) => {
              const active = ownerFilter.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  className={`ac-sch-chip ${active ? 'ac-sch-chip--active' : ''}`}
                  onClick={() => toggleOwner(u.id)}
                  title={`${u.name} · ${u.title}`}
                >
                  <span className={`ac-avatar ac-avatar--xs ac-avatar--${u.avatarColor}`}>
                    {u.initial}
                  </span>
                  {u.name}
                </button>
              );
            })}
            {ownerFilter.length > 0 && (
              <button type="button" className="ac-sch-chip" onClick={() => setOwnerFilter([])}>
                <X size={12} /> 清除筛选
              </button>
            )}
          </div>
        </div>

        <div className="ac-sch-toolbar-row" data-annotation-id="ai-sdlc-schedule-legend">
          <span className="ac-gantt-legend-item">
            <span className="ac-sch-sw ac-sch-sw--critical" />
            关键路径（主色加粗描边）
          </span>
          <span className="ac-gantt-legend-item">
            <span className="ac-sch-sw" />
            普通任务
          </span>
          <span className="ac-gantt-legend-item">
            <AlertTriangle size={13} style={{ color: 'var(--warn)' }} />
            风险任务（条右侧警示三角）
          </span>
          <span className="ac-gantt-legend-item">
            <span className="ac-sch-sw ac-sch-sw--ok" />
            已完成
          </span>
          <span className="ac-gantt-legend-item">
            <span className="ac-sch-sw ac-sch-sw--group" />
            需求汇总条
          </span>
          <span className="ac-gantt-legend-item" style={{ color: 'var(--danger)' }}>
            | 今日线 {TODAY}
          </span>
          {applyAiToGantt && aiStats.appliedTaskCount > 0 && (
            <span className="ac-gantt-legend-item" title="虚线框为 data.ts 的原始计划位置，实色条为 AI 建议采纳后的位置">
              <span className="ac-sch-sw ac-sch-sw--ghost" />
              AI 已重排（{aiStats.appliedTaskCount}）
            </span>
          )}
          <span
            className="ac-sch-legend-note"
            data-annotation-id="ai-sdlc-schedule-risks"
            title={`任务数据无显式风险字段，风险等级由 progress / startDate / endDate 与 TODAY（${TODAY}）推算`}
          >
            <Info size={12} />
            风险为按进度与剩余天数推算（非显式风险字段）
          </span>
        </div>
      </div>

      {/* ============ 6. 排期冲突告警条 ============ */}
      {!conflictDismissed && openConflicts.length > 0 && (
        <div data-annotation-id="ai-sdlc-schedule-conflicts">
          <div className="ac-sch-conflictbar">
            <AlertTriangle size={15} />
            <span>
              检测到 <b>{openConflicts.length}</b> 项排期冲突
              {openConflicts.some((c) => c.severity === 'high') ? '（含高危，影响关键路径）' : ''}
            </span>
            <div className="ac-sch-conflictbar-actions">
              <button
                type="button"
                className="ac-btn ac-btn--ghost ac-btn--sm"
                onClick={() => setConflictOpen((v) => !v)}
              >
                {conflictOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {conflictOpen ? '收起' : '查看'}
              </button>
              <button
                type="button"
                className="ac-btn ac-btn--text ac-btn--sm"
                onClick={() => {
                  setConflictDismissed(true);
                  setConflictOpen(false);
                }}
                title="本次会话内不再提示该告警"
              >
                <EyeOff size={14} /> 忽略此告警
              </button>
            </div>
          </div>

          {conflictOpen && (
            <div className="ac-sch-conflict-panel">
              {GANTT_CONFLICTS.map((c) => (
                <div
                  key={c.id}
                  className={`ac-sch-conflict ac-sch-conflict--${c.severity} ${
                    c.status === 'ignored' || c.status === 'resolved' ? 'ac-sch-conflict--muted' : ''
                  }`}
                >
                  <div className="ac-sch-conflict-head">
                    <span className={`ac-tag ac-tag--${CONFLICT_SEV_TONE[c.severity]} ac-tag--sm`}>
                      {CONFLICT_SEV_LABEL[c.severity]}
                    </span>
                    <span className="ac-tag ac-tag--neutral ac-tag--sm">
                      {CONFLICT_TYPE_LABEL[c.type]}
                    </span>
                    <span className="ac-sch-conflict-title">{c.title}</span>
                    <span className="ac-tag ac-tag--outline ac-tag--sm">
                      {CONFLICT_STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="ac-sch-conflict-tasks">
                    {c.taskIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="ac-sch-conflict-task"
                        onClick={() => revealTask(id)}
                        title="定位到该任务并高亮"
                      >
                        {TASK_MAP[id]?.code ?? id}
                      </button>
                    ))}
                    {c.ownerId && (
                      <span className="ac-sch-conflict-text">
                        · 归属 {USER_MAP[c.ownerId]?.name ?? c.ownerId}
                      </span>
                    )}
                    <span className="ac-sch-conflict-text">
                      · {c.windowStart} ~ {c.windowEnd}
                      {c.overloadHours > 0 ? ` · 超产能 ${c.overloadHours}h` : ''}
                    </span>
                  </div>
                  <div className="ac-sch-conflict-text">
                    <b>影响：</b>
                    {c.impact}
                  </div>
                  <div className="ac-sch-conflict-text">
                    <b>PMO Agent 建议：</b>
                    {c.suggestion}
                  </div>
                  <div className="ac-sch-conflict-text" style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    由 {c.detectedBy} 于 {c.detectedAt} 检出
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ 2 / 3 / 4 / 5. 甘特主体 ============ */}
      <div className="ac-gantt" data-annotation-id="ai-sdlc-schedule-timeline">
        <div className="ac-gantt-head">
          <div
            className="ac-gantt-head-side ac-sch-head-side"
            data-annotation-id="ai-sdlc-schedule-sidebar"
          >
            <span className="ac-sch-head-col ac-sch-head-col--task">
              <Layers size={13} /> 任务 / 需求分组
            </span>
            <span className="ac-sch-head-col ac-sch-head-col--owner">负责</span>
            <span className="ac-sch-head-col ac-sch-head-col--hours">工时</span>
          </div>
          <div className="ac-gantt-head-timeline">
            {cols.map((c) => (
              <div
                key={c.key}
                className={`ac-gantt-head-cell ${c.weekend ? 'ac-gantt-head-cell--weekend' : ''} ${
                  c.today ? 'ac-gantt-head-cell--today' : ''
                }`}
                style={{ flexGrow: c.days, flexBasis: 0 }}
              >
                <span className="ac-gantt-head-day">{c.label}</span>
                {c.sub}
              </div>
            ))}
            {todayInRange && (
              <span className="ac-sch-today-label" style={{ left: `calc(${todayPct}% + 4px)` }}>
                今天 {fmtMD(parseDate(TODAY))}
              </span>
            )}
          </div>
        </div>

        <div className="ac-sch-body" ref={bodyRef}>
          {rows.length === 0 ? (
            <div className="ac-empty ac-empty--sm">
              <div className="ac-empty-icon">
                <CalendarRange size={18} />
              </div>
              <div className="ac-empty-title">该迭代暂无排期任务</div>
              <div className="ac-empty-desc">
                {sprint.name}（{sprint.theme}）尚未关联工作项，或当前负责人筛选无匹配结果。
              </div>
            </div>
          ) : (
            rows.map((row) =>
              row.kind === 'group' ? renderGroupRow(row.group) : renderTaskRow(row.task),
            )
          )}

          {/* 依赖箭头叠加层（尺寸与甘特网格一致，pointer-events 仅命中箭头路径） */}
          <div className="ac-sch-overlay" data-annotation-id="ai-sdlc-schedule-deps">
            <svg className="ac-sch-deps" aria-hidden="true">
              <defs>
                <marker
                  id="ac-sch-arrow"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="#98a2b0" />
                </marker>
                <marker
                  id="ac-sch-arrow-crit"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#3730a3" />
                </marker>
              </defs>
              {depPaths.map((dp) => (
                <g key={dp.id}>
                  <path
                    className="ac-sch-dep-line"
                    d={dp.d}
                    fill="none"
                    stroke={dp.critical ? '#3730a3' : '#98a2b0'}
                    strokeWidth={dp.critical ? 1.6 : 1.2}
                    markerEnd={`url(#${dp.critical ? 'ac-sch-arrow-crit' : 'ac-sch-arrow'})`}
                  />
                  <path
                    className="ac-sch-dep-hit"
                    d={dp.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                    onMouseEnter={(e) =>
                      setTip({ x: e.clientX, y: e.clientY, node: depTip(dp) })
                    }
                    onMouseMove={(e) =>
                      setTip((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p))
                    }
                    onMouseLeave={() => setTip(null)}
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* ============ 8. AI 排期建议 ============ */}
      {aiBlocksOpen && (
        <>
          <div className="ac-card ac-card--flat" data-annotation-id="ai-sdlc-schedule-ai-suggest">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Bot size={15} /> AI 排期建议
              </span>
              <span className="ac-card-subtitle">
                {AI_SCHEDULE_SUGGESTIONS.length} 条建议 · 覆盖{' '}
                {new Set(AI_SCHEDULE_SUGGESTIONS.map((s) => s.taskId)).size} 个 TASK-24xx 工作项 ·
                当前筛选命中 {filteredSuggestions.length} 条
              </span>
              <div className="ac-card-extra">
                <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={resetSugFilters}>
                  <RotateCcw size={13} /> 重置筛选
                </button>
              </div>
            </div>

            {/* ---- 多维筛选 ---- */}
            <div className="ac-card-body ac-card-body--tight ac-sch-filters">
              <div className="ac-sch-filter-row">
                <span className="ac-sch-search">
                  <Search size={14} />
                  <input
                    className="ac-input ac-input--sm"
                    placeholder="搜索建议编号 / TASK 编号 / 任务标题 / 理由关键字"
                    value={sugKeyword}
                    onChange={(e) => setSugKeyword(e.target.value)}
                  />
                  {sugKeyword && (
                    <button
                      type="button"
                      className="ac-sch-search-clear"
                      onClick={() => setSugKeyword('')}
                      aria-label="清空关键字"
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
                <span className="ac-sch-field">
                  <SlidersHorizontal size={14} />
                  排序
                  <select
                    className="ac-select ac-select--sm"
                    value={sugSort}
                    onChange={(e) => setSugSort(e.target.value)}
                  >
                    {SUG_SORTS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </span>
                <button
                  type="button"
                  className={`ac-sch-chip ${sugCritOnly ? 'ac-sch-chip--active' : ''}`}
                  onClick={() => setSugCritOnly((v) => !v)}
                  title="只看 impact.criticalPathDeltaDays ≠ 0 的建议"
                >
                  <Target size={12} /> 仅影响关键路径
                </button>
                <span className="ac-sch-field">
                  置信度
                  <span className="ac-sch-seg">
                    {CONF_BANDS.map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        className={`ac-sch-seg-btn ${sugBand === b.key ? 'ac-sch-seg-btn--active' : ''}`}
                        onClick={() => setSugBand(b.key)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </span>
                </span>
              </div>
              <div className="ac-sch-filter-row">
                <span className="ac-sch-field">变更类型</span>
                <div className="ac-sch-chips">
                  {CHANGE_TYPE_ORDER.map((ct) => {
                    const n = liveSuggestions.filter((s) => s.changeType === ct).length;
                    return (
                      <button
                        key={ct}
                        type="button"
                        className={`ac-sch-chip ${sugTypes.includes(ct) ? 'ac-sch-chip--active' : ''}`}
                        onClick={() => toggleSugType(ct)}
                        disabled={n === 0}
                        title={n === 0 ? `本批 8 条建议中没有「${ct}」类型` : CHANGE_TYPE_HINT[ct]}
                      >
                        <span
                          className="ac-sch-dot"
                          style={{ background: TONE_HEX[tagTone(CHANGE_TYPE_TONE[ct])] }}
                        />
                        {ct}
                        <b>{n}</b>
                      </button>
                    );
                  })}
                </div>
                <span className="ac-sch-field">状态</span>
                <div className="ac-sch-chips">
                  {SUG_STATUS_ORDER.map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`ac-sch-chip ${sugStatuses.includes(st) ? 'ac-sch-chip--active' : ''}`}
                      onClick={() => toggleSugStatus(st)}
                    >
                      <span className="ac-sch-dot" style={{ background: TONE_HEX[tagTone(SUG_STATUS_META[st].tone)] }} />
                      {SUG_STATUS_META[st].label}
                      <b>{aiStats.byStatus[st]}</b>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ---- 建议清单表 ---- */}
            <div className="ac-card-body ac-card-body--flush">
              {filteredSuggestions.length === 0 ? (
                <div className="ac-empty ac-empty--sm">
                  <div className="ac-empty-icon">
                    <Search size={18} />
                  </div>
                  <div className="ac-empty-title">没有符合筛选条件的排期建议</div>
                  <div className="ac-empty-desc">
                    AI_SCHEDULE_SUGGESTIONS 共 {AI_SCHEDULE_SUGGESTIONS.length} 条，当前筛选命中 0 条。
                    可清空关键字或放宽变更类型 / 状态 / 置信度区间。
                  </div>
                  <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={resetSugFilters}>
                    <RotateCcw size={13} /> 重置筛选
                  </button>
                </div>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm ac-table--bordered ac-sch-sug-table">
                    <thead>
                      <tr>
                        <th>建议编号</th>
                        <th>任务</th>
                        <th>生成时间</th>
                        <th>模型</th>
                        <th>Agent</th>
                        <th>变更类型</th>
                        <th>当前计划</th>
                        <th>建议计划</th>
                        <th>置信度</th>
                        <th className="ac-td-right">关键路径影响</th>
                        <th className="ac-td-right">迭代负载影响</th>
                        <th>风险变化</th>
                        <th>状态</th>
                        <th>决策人</th>
                        <th>决策时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>{filteredSuggestions.map(renderSugRow)}</tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ---- 手绘 SVG 图表 ---- */}
            <div className="ac-card-body ac-sch-charts">
              <div className="ac-sch-chart">
                <div className="ac-section-title">变更类型分布（{aiStats.total} 条建议）</div>
                <ChangeTypeDonut items={changeTypeDist} total={aiStats.total} />
              </div>
              <div className="ac-sch-chart">
                <div className="ac-section-title">置信度 vs 决策结果（8 条建议散点）</div>
                <ConfidenceScatter
                  points={liveSuggestions.map((s) => ({
                    id: s.id,
                    confidencePct: s.confidencePct,
                    status: s.status,
                    changeType: s.changeType,
                    taskTitle: s.taskTitle,
                  }))}
                  adoptAvg={Number(aiStats.adoptedAvgConfidencePct)}
                  rejectAvg={Number(aiStats.rejectedAvgConfidencePct)}
                />
              </div>
            </div>

            <div className="ac-card-foot ac-sch-caliber">
              <Info size={12} />
              <span>
                口径：变更类型分布按 changeType 计数（6 值全列，「压缩」在本批 8 条中计数为 0）；散点图 X 轴为
                confidencePct，Y 轴按状态分道（已采纳 / 自动应用在上、待决策居中、已驳回在下），两条竖虚线分别为已采纳组与已驳回组的置信度均值
                {aiStats.adoptedAvgConfidencePct}% / {aiStats.rejectedAvgConfidencePct}%，可见置信度越高越容易被采纳；置信度低于
                70% 的建议在表格中标黄。标「本次会话」的行表示状态来自本页乐观更新覆盖层，未写回 data-ai-flow.ts。
              </span>
            </div>
          </div>

          {/* ============ 9. AI 冲突消解 ============ */}
          <div
            className="ac-card ac-card--flat"
            data-annotation-id="ai-sdlc-schedule-conflict-resolution"
          >
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ShieldAlert size={15} /> AI 冲突消解
              </span>
              <span className="ac-card-subtitle">
                GANTT_CONFLICTS（{GANTT_CONFLICTS.length} 条）↔ AI_SCHEDULE_SUGGESTIONS（
                {liveSuggestions.length} 条）· 已消解 {resolvedConflictCount} / {GANTT_CONFLICTS.length}
              </span>
            </div>

            <div className="ac-card-body ac-card-body--tight">
              <div className="ac-sch-cres-list">
                {conflictLinks.map((l) => {
                  const c = l.conflict;
                  const meta = RESOLVE_META[l.state];
                  const isViz = vizConflictId === c.id;
                  return (
                    <div key={c.id} className={`ac-sch-cres ac-sch-cres--${l.state}`}>
                      <div className="ac-sch-cres-head">
                        <span className={`ac-tag ac-tag--${CONFLICT_SEV_TONE[c.severity]} ac-tag--sm`}>
                          {CONFLICT_SEV_LABEL[c.severity]}
                        </span>
                        <span className="ac-tag ac-tag--neutral ac-tag--sm">
                          {CONFLICT_TYPE_LABEL[c.type]}
                        </span>
                        <span className="ac-mono ac-sch-cres-id">{c.id}</span>
                        <span className="ac-sch-cres-title">{c.title}</span>
                        <span className={`ac-tag ac-tag--${tagTone(meta.tone)} ac-tag--sm`}>
                          {meta.label}
                        </span>
                        <button
                          type="button"
                          className={`ac-btn ac-btn--text ac-btn--sm ${isViz ? 'ac-sch-viz-on' : ''}`}
                          onClick={() => setVizConflictId(c.id)}
                        >
                          {isViz ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          时间窗
                        </button>
                      </div>

                      <div className="ac-sch-cres-tasks">
                        {c.taskIds.map((tid) => (
                          <button
                            key={tid}
                            type="button"
                            className="ac-sch-conflict-task"
                            onClick={() => revealTask(tid)}
                            title={`${TASK_MAP[tid]?.title ?? tid} · 定位到甘特并高亮`}
                          >
                            {tid}
                          </button>
                        ))}
                        <span className="ac-sch-cres-window">
                          冲突窗口 {c.windowStart} ~ {c.windowEnd}
                          {c.overloadHours > 0 ? ` · 超产能 ${c.overloadHours}h` : ''}
                          {c.ownerId ? ` · 归属 ${USER_MAP[c.ownerId]?.name ?? c.ownerId}` : ''}
                        </span>
                      </div>

                      <div className="ac-sch-cres-links">
                        <span className="ac-sch-cres-links-k">关联 AI 建议（理由点名）</span>
                        {l.named.length === 0 ? (
                          <span className="ac-sch-cres-none">
                            8 条建议的 reason 均未提及 {c.id}
                          </span>
                        ) : (
                          l.named.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="ac-sch-cres-link"
                              onClick={() => openSugDrawer(s.id)}
                              title={`${s.taskTitle} · 置信度 ${s.confidencePct}% · 点击打开建议详情`}
                            >
                              <span className="ac-mono">{s.id}</span>
                              <span
                                className={`ac-tag ac-tag--${tagTone(CHANGE_TYPE_TONE[s.changeType])} ac-tag--sm`}
                              >
                                {s.changeType}
                              </span>
                              <span className="ac-sch-cres-conf">{s.confidencePct}%</span>
                              <span
                                className={`ac-tag ac-tag--${tagTone(SUG_STATUS_META[s.status].tone)} ac-tag--sm`}
                              >
                                {SUG_STATUS_META[s.status].label}
                              </span>
                            </button>
                          ))
                        )}
                      </div>

                      {l.aux.length > 0 && (
                        <div className="ac-sch-cres-links ac-sch-cres-links--aux">
                          <span className="ac-sch-cres-links-k">受影响任务重叠（辅助）</span>
                          {l.aux.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="ac-sch-cres-link ac-sch-cres-link--aux"
                              onClick={() => openSugDrawer(s.id)}
                              title={`impact.affectedTaskIds 与本冲突 taskIds 存在交集：${s.impact.affectedTaskIds
                                .filter((tid) => c.taskIds.includes(tid))
                                .join('、')}`}
                            >
                              <span className="ac-mono">{s.id}</span>
                              <span className="ac-sch-cres-conf">{s.confidencePct}%</span>
                              <span
                                className={`ac-tag ac-tag--${tagTone(SUG_STATUS_META[s.status].tone)} ac-tag--sm`}
                              >
                                {SUG_STATUS_META[s.status].label}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {l.state === 'manual' && (
                        <div className="ac-hint ac-hint--warn ac-sch-cres-hint">
                          <AlertTriangle size={13} />
                          <span>
                            需人工介入：{l.named.map((s) => s.id).join('、')} 已被驳回，驳回理由为「
                            {(l.named[0].rejectReason ?? '').slice(0, 60)}
                            {(l.named[0].rejectReason ?? '').length > 60 ? '…' : ''}
                            」。平台内暂无可自动落地的方案，请由 PMO 重新拟定排期或走例外审批。
                          </span>
                        </div>
                      )}
                      {l.state === 'none' && (
                        <div className="ac-hint ac-hint--warn ac-sch-cres-hint">
                          <AlertTriangle size={13} />
                          <span>
                            需人工介入：本批 AI 建议未覆盖 {c.id}，只能按冲突自带的 PMO 建议手工处理——
                            {c.suggestion}
                          </span>
                        </div>
                      )}
                      {l.state === 'pending' && (
                        <div className="ac-hint ac-sch-cres-hint">
                          <Info size={13} />
                          <span>
                            {meta.note}：{l.pending.map((s) => s.id).join('、')} 仍为待决策
                            {l.pending.some((s) => gateBlockers(s).length > 0)
                              ? `，其中 ${l.pending
                                  .filter((s) => gateBlockers(s).length > 0)
                                  .map((s) => s.id)
                                  .join('、')} 因硬约束未满足，「采纳」按钮已被门禁禁用`
                              : ''}
                            。
                          </span>
                        </div>
                      )}
                      {l.state === 'resolved' && (
                        <div className="ac-hint ac-hint--ok ac-sch-cres-hint">
                          <Check size={13} />
                          <span>
                            {meta.note}：由 {l.decided.map((s) => s.id).join('、')} 消解
                            {applyAiToGantt
                              ? '，相关甘特条已按 suggestedPlan 重排'
                              : '（当前甘特基线切到「原始计划」，未显示重排结果）'}
                            。
                          </span>
                        </div>
                      )}

                      {isViz && (
                        <div className="ac-sch-cres-viz">
                          <ConflictWindowChart
                            conflict={c}
                            suggested={l.named
                              .filter((s) => s.status === 'accepted' || s.status === 'auto-applied')
                              .reduce<Record<string, SchedulePlanDef>>((acc, s) => {
                                acc[s.taskId] = s.suggestedPlan;
                                return acc;
                              }, {})}
                            today={TODAY}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ac-card-foot ac-sch-caliber">
              <Info size={12} />
              <span>
                口径：「理由点名」= 建议 reason 文本中用正则 /GANTT-CF-\d&#123;2&#125;/ 命中的冲突 id（强关联）；「受影响任务重叠」=
                建议 impact.affectedTaskIds 与冲突 taskIds 的交集（弱关联，仅辅助定位）。消解状态判定：命中建议中存在
                accepted / auto-applied → 已消解；否则存在 pending → 待决策；否则全部被驳回 → 需人工介入；无命中 → 无 AI
                方案。时间窗图中实色条为 data.ts 的原始计划，红色填充为两两重叠区间，虚线条为已采纳建议的 suggestedPlan
                新位置，竖线为今日 {TODAY}。
              </span>
            </div>
          </div>
        </>
      )}

      {/* ============ 7. 任务详情 Drawer ============ */}
      <Drawer
        open={!!d}
        title={d?.title ?? ''}
        subtitle={d ? `${d.code} · ${d.type} · ${d.priority}` : undefined}
        onClose={() => setDrawerTask(null)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setDrawerTask(null)}>
              关闭
            </button>
            <button
              type="button"
              className="ac-btn ac-btn--primary"
              onClick={() => {
                window.location.hash = '#page=board';
              }}
            >
              <ExternalLink size={14} /> 前往任务看板
            </button>
          </>
        }
      >
        {d && (
          <div data-annotation-id="ai-sdlc-schedule-drawer">
            <div className="ac-row ac-row-wrap ac-gap-2" style={{ marginBottom: 14 }}>
              {dState && (
                <span className={`ac-tag ac-tag--${dState.tone} ac-tag--sm`}>
                  {dState.code} {dState.name}
                </span>
              )}
              {dReq && <span className="ac-tag ac-tag--outline ac-tag--sm">{dReq.code}</span>}
              <span className="ac-tag ac-tag--neutral ac-tag--sm">{d.type}</span>
              <span
                className={`ac-tag ac-tag--${d.priority === 'P0' ? 'danger' : d.priority === 'P1' ? 'warn' : 'neutral'} ac-tag--sm`}
              >
                {d.priority}
              </span>
              {(d.critical || CRITICAL_PATH.includes(d.id)) && (
                <span className="ac-tag ac-tag--brand ac-tag--sm">关键路径</span>
              )}
              {dRisk && (
                <span
                  className={`ac-tag ac-tag--${dRisk.level === 'high' ? 'danger' : 'warn'} ac-tag--sm`}
                >
                  <AlertTriangle size={11} /> {dRisk.type}（推算）
                </span>
              )}
            </div>

            <div className="ac-progress-row" style={{ marginBottom: 16 }}>
              <div className="ac-progress">
                <div
                  className={`ac-progress-bar ${d.progress >= 100 ? 'ac-progress-bar--ok' : ''}`}
                  style={{ width: `${Math.min(100, Math.max(0, d.progress))}%` }}
                />
              </div>
              <span className="ac-progress-label">{d.progress}%</span>
            </div>

            <dl className="ac-kv" style={{ marginBottom: 16 }}>
              <dt>所属需求</dt>
              <dd>{dReq ? `${dReq.code} ${dReq.title}` : '发布执行类工作项（未关联需求）'}</dd>
              <dt>负责人</dt>
              <dd>{dOwner ? `${dOwner.name} · ${dOwner.title}` : d.ownerId}</dd>
              <dt>状态</dt>
              <dd>{d.stateLabel}{dState ? `（SLA ${dState.slaHours}h · 由${dState.driver}推进）` : ''}</dd>
              <dt>起止日期</dt>
              <dd className="ac-mono">
                {d.startDate} ~ {d.endDate}
              </dd>
              <dt>工时</dt>
              <dd className="ac-mono">
                估算 {d.estimateHours}h / 实际 {d.actualHours}h
              </dd>
              <dt>故事点</dt>
              <dd className="ac-mono">
                {d.points} pt · AI 产出占比 {d.aiRatio}%
              </dd>
              <dt>分支</dt>
              <dd className="ac-mono">{d.branch || '—'}</dd>
            </dl>

            {d.blockedReason && (
              <div className="ac-hint ac-hint--danger" style={{ marginBottom: 16 }}>
                <ShieldAlert size={13} /> 阻塞：{d.blockedReason}
              </div>
            )}

            {dRisk && (
              <div className="ac-hint ac-hint--warn" style={{ marginBottom: 16 }}>
                <AlertTriangle size={13} /> 风险（推算）：{dRisk.detail}
                <div style={{ marginTop: 4 }}>应对建议：{dRisk.advice}</div>
              </div>
            )}

            <div className="ac-section-title" style={{ marginBottom: 8 }}>
              前置任务（{prevDeps.length}）
            </div>
            {prevDeps.length === 0 ? (
              <div className="ac-hint" style={{ marginBottom: 16 }}>
                无前置依赖，可并行启动。
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {prevDeps.map((dep) => {
                  const p = TASK_MAP[dep.from];
                  return (
                    <button
                      key={dep.id}
                      type="button"
                      className="ac-sch-dep-row"
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => p && setDrawerTask(p)}
                      title={dep.note}
                    >
                      <ArrowRight size={13} className="ac-sch-dep-arrow" />
                      <span className="ac-mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                        {p?.code ?? dep.from}
                      </span>
                      <span className="ac-sch-dep-name">{p?.title ?? dep.from}</span>
                      <span className="ac-tag ac-tag--outline ac-tag--sm">{dep.type}</span>
                      {dep.lagDays !== 0 && (
                        <span className="ac-tag ac-tag--neutral ac-tag--sm">
                          lag {dep.lagDays}d
                        </span>
                      )}
                      {dep.critical && <span className="ac-tag ac-tag--brand ac-tag--sm">关键</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ac-section-title" style={{ marginBottom: 8 }}>
              后置任务（{nextDeps.length}）
            </div>
            {nextDeps.length === 0 ? (
              <div className="ac-hint" style={{ marginBottom: 16 }}>
                无后置依赖，为链路末端。
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {nextDeps.map((dep) => {
                  const n = TASK_MAP[dep.to];
                  return (
                    <button
                      key={dep.id}
                      type="button"
                      className="ac-sch-dep-row"
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => n && setDrawerTask(n)}
                      title={dep.note}
                    >
                      <ArrowRight size={13} className="ac-sch-dep-arrow" />
                      <span className="ac-mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                        {n?.code ?? dep.to}
                      </span>
                      <span className="ac-sch-dep-name">{n?.title ?? dep.to}</span>
                      <span className="ac-tag ac-tag--outline ac-tag--sm">{dep.type}</span>
                      {dep.lagDays !== 0 && (
                        <span className="ac-tag ac-tag--neutral ac-tag--sm">
                          lag {dep.lagDays}d
                        </span>
                      )}
                      {dep.critical && <span className="ac-tag ac-tag--brand ac-tag--sm">关键</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ac-section-title" style={{ marginBottom: 8 }}>
              关联缺陷（{dBugs.length}）
            </div>
            {dBugs.length === 0 ? (
              <div className="ac-hint">该任务暂无关联缺陷。</div>
            ) : (
              <div>
                {dBugs.map((b) => (
                  <div key={b.id} className="ac-sch-dep-row">
                    <Bug size={13} className="ac-sch-dep-arrow" />
                    <span className="ac-mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                      {b.pcCode}
                    </span>
                    <span className="ac-sch-dep-name" title={b.title}>
                      {b.title}
                    </span>
                    <span
                      className={`ac-tag ac-tag--${
                        b.priority === 'P0' ? 'danger' : b.priority === 'P1' ? 'warn' : 'neutral'
                      } ac-tag--sm`}
                    >
                      {b.priority}
                    </span>
                    <span className="ac-tag ac-tag--outline ac-tag--sm">
                      {BUG_STATUS_LABEL[b.status] ?? b.status}
                    </span>
                    {b.releaseBlocking && (
                      <span className="ac-tag ac-tag--danger ac-tag--sm">阻塞发布</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ============ 10. AI 排期建议详情 Drawer ============ */}
      <Drawer
        open={!!ds}
        width={700}
        title={ds ? `${ds.id} · ${ds.changeType}` : ''}
        subtitle={ds ? `${ds.taskId} ${ds.taskTitle}` : undefined}
        onClose={() => setDrawerSugId(null)}
        footer={
          ds ? (
            <>
              <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setDrawerSugId(null)}>
                关闭
              </button>
              {ds.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="ac-btn ac-btn--danger-ghost"
                    onClick={() => setRejectOpen((v) => !v)}
                  >
                    <X size={14} /> {rejectOpen ? '收起驳回理由' : '驳回'}
                  </button>
                  <button
                    type="button"
                    className={`ac-btn ${dsBlockers.length > 0 ? 'ac-btn--ghost ac-btn--disabled' : 'ac-btn--primary'}`}
                    onClick={() => acceptSuggestion(ds)}
                    disabled={dsBlockers.length > 0}
                    title={
                      dsBlockers.length > 0
                        ? `约束门禁未通过，禁止采纳：${dsBlockers.map((b) => b.constraint).join('、')}`
                        : '采纳后甘特条按 suggestedPlan 重排，冲突消解状态同步刷新'
                    }
                  >
                    <Check size={14} /> 采纳建议
                  </button>
                </>
              ) : (
                <span className="ac-sch-drawer-state">
                  <span className={`ac-tag ac-tag--${tagTone(SUG_STATUS_META[ds.status].tone)}`}>
                    {SUG_STATUS_META[ds.status].label}
                  </span>
                  {overrides[ds.id] && (
                    <button
                      type="button"
                      className="ac-btn ac-btn--text ac-btn--sm"
                      onClick={() => {
                        writeOverride(ds.id, null);
                        setUndoEntry(null);
                        setFeedback({
                          tone: 'ok',
                          text: `已还原 ${ds.id} 为数据文件中的原始状态。`,
                        });
                      }}
                    >
                      <Undo2 size={13} /> 还原为原始状态
                    </button>
                  )}
                </span>
              )}
            </>
          ) : null
        }
      >
        {ds && (
          <div className="ac-sch-sugdetail">
            <div className="ac-row ac-row-wrap ac-gap-2" style={{ marginBottom: 14 }}>
              <span className={`ac-tag ac-tag--${tagTone(SUG_STATUS_META[ds.status].tone)} ac-tag--sm`}>
                {SUG_STATUS_META[ds.status].label}
              </span>
              <span className={`ac-tag ac-tag--${tagTone(CHANGE_TYPE_TONE[ds.changeType])} ac-tag--sm`}>
                {ds.changeType}
              </span>
              <span
                className={`ac-tag ac-tag--${ds.confidencePct < 70 ? 'warn' : 'brand'} ac-tag--sm`}
                title="confidencePct < 70% 标黄"
              >
                置信度 {ds.confidencePct}%
              </span>
              <span className="ac-tag ac-tag--outline ac-tag--sm">
                <Cpu size={11} /> {dsModel?.name ?? ds.modelId}
              </span>
              <span className="ac-tag ac-tag--outline ac-tag--sm">
                <Bot size={11} /> {dsAgent?.name ?? ds.agentId}
              </span>
              <span className="ac-tag ac-tag--neutral ac-tag--sm">生成于 {ds.generatedAt}</span>
              {dsBlockers.length > 0 && (
                <span className="ac-tag ac-tag--danger ac-tag--sm">
                  <Ban size={11} /> 门禁未通过 {dsBlockers.length} 项
                </span>
              )}
            </div>

            <div className="ac-section-title" style={{ marginBottom: 8 }}>
              计划前后对照（共用时间轴 · 竖线为今日 {TODAY}）
            </div>
            <PlanCompareChart cur={ds.currentPlan} sug={ds.suggestedPlan} today={TODAY} />
            <div className="ac-sch-mini-legend">
              <span>
                <span className="ac-sch-sw ac-sch-sw--muted" /> 当前计划 {ds.currentPlan.startDate} ~{' '}
                {ds.currentPlan.endDate}
              </span>
              <span>
                <span className="ac-sch-sw ac-sch-sw--branddash" /> 建议计划 {ds.suggestedPlan.startDate} ~{' '}
                {ds.suggestedPlan.endDate}
              </span>
              <span>
                起始 {signedDays(diffDays(ds.currentPlan.startDate, ds.suggestedPlan.startDate))} · 结束{' '}
                {signedDays(diffDays(ds.currentPlan.endDate, ds.suggestedPlan.endDate))} · 净工期{' '}
                {signedDays(
                  diffDays(ds.suggestedPlan.startDate, ds.suggestedPlan.endDate) -
                    diffDays(ds.currentPlan.startDate, ds.currentPlan.endDate),
                )}
              </span>
            </div>

            <div className="ac-ai-block" style={{ marginTop: 16 }}>
              <div className="ac-ai-block-title">
                <Sparkles size={13} /> AI 依据
              </div>
              {ds.reason}
            </div>

            <div className="ac-section-title" style={{ margin: '16px 0 8px' }}>
              约束校验（{ds.constraintChecks.length} 项 · 任一不满足即禁用「采纳」）
            </div>
            <table className="ac-table ac-table--sm ac-table--bordered ac-sch-constraint">
              <thead>
                <tr>
                  <th style={{ width: 88 }}>约束</th>
                  <th style={{ width: 82 }}>是否满足</th>
                  <th>具体说明</th>
                </tr>
              </thead>
              <tbody>
                {ds.constraintChecks.map((c, i) => (
                  <tr key={`${c.constraint}-${i}`} className={c.satisfied ? '' : 'ac-sch-tr--blocked'}>
                    <td>
                      <span className="ac-tag ac-tag--neutral ac-tag--sm">{c.constraint}</span>
                    </td>
                    <td>
                      {c.satisfied ? (
                        <span className="ac-sch-pass">
                          <Check size={13} /> 满足
                        </span>
                      ) : (
                        <span className="ac-sch-fail">
                          <X size={13} /> 不满足
                        </span>
                      )}
                    </td>
                    <td className="ac-sch-constraint-detail">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {dsBlockers.length > 0 ? (
              <div className="ac-hint ac-hint--danger" style={{ marginTop: 12 }}>
                <Ban size={13} />
                <span>
                  <b>门禁禁用：</b>
                  {dsBlockers.length} 项硬约束未满足（
                  {dsBlockers.map((b) => b.constraint).join('、')}），「采纳」按钮已禁用。需先由{' '}
                  {dsBlockers.map((b) => b.constraint).join(' / ')}
                  的责任方补齐条件——{dsBlockers[0].detail}
                </span>
              </div>
            ) : (
              <div className="ac-hint ac-hint--ok" style={{ marginTop: 12 }}>
                <Check size={13} />
                <span>
                  {ds.constraintChecks.length} 项约束全部满足，门禁通过；采纳后甘特条将立即按 suggestedPlan
                  重排（乐观更新，可在页头「撤销上次决策」回退）。
                </span>
              </div>
            )}

            <div className="ac-section-title" style={{ margin: '16px 0 8px' }}>
              影响评估
            </div>
            <dl className="ac-kv">
              <dt>目标任务</dt>
              <dd>
                <button type="button" className="ac-sch-conflict-task" onClick={() => revealTask(ds.taskId)}>
                  {ds.taskId}
                </button>
                <span className="ac-sch-kv-note">
                  {dsTask ? `${dsTask.code} · ${dsTask.type} · ${dsTask.priority} · 进度 ${dsTask.progress}%` : ''}
                </span>
              </dd>
              <dt>关键路径</dt>
              <dd>
                <span className={ds.impact.criticalPathDeltaDays < 0 ? 'ac-ok-text' : ds.impact.criticalPathDeltaDays > 0 ? 'ac-danger-text' : 'ac-muted'}>
                  {ds.impact.criticalPathDeltaDays === 0
                    ? '0 天（不改变关键路径长度）'
                    : signedDays(ds.impact.criticalPathDeltaDays)}
                </span>
                {CRITICAL_PATH.includes(ds.taskId) && (
                  <span className="ac-tag ac-tag--brand ac-tag--sm" style={{ marginLeft: 6 }}>
                    目标任务位于关键路径
                  </span>
                )}
              </dd>
              <dt>迭代负载</dt>
              <dd>
                <span className={ds.impact.sprintLoadDelta < 0 ? 'ac-ok-text' : ds.impact.sprintLoadDelta > 0 ? 'ac-danger-text' : 'ac-muted'}>
                  {signedHours(ds.impact.sprintLoadDelta)}
                </span>
                <span className="ac-sch-kv-note">负数为释放 {CURRENT_SPRINT.id} 产能</span>
              </dd>
              <dt>风险变化</dt>
              <dd>
                <span className={`ac-tag ac-tag--${tagTone(RISK_DELTA_TONE[ds.impact.riskDelta])} ac-tag--sm`}>
                  {ds.impact.riskDelta}
                </span>
              </dd>
              <dt>受影响任务</dt>
              <dd className="ac-sch-kv-tasks">
                {ds.impact.affectedTaskIds.length === 0 ? (
                  <span className="ac-muted">无</span>
                ) : (
                  ds.impact.affectedTaskIds.map((tid) => (
                    <button
                      key={tid}
                      type="button"
                      className="ac-sch-conflict-task"
                      onClick={() => revealTask(tid)}
                      title={TASK_MAP[tid]?.title ?? tid}
                    >
                      {tid}
                    </button>
                  ))
                )}
              </dd>
              <dt>关联冲突</dt>
              <dd className="ac-sch-kv-tasks">
                {dsLinks.length === 0 ? (
                  <span className="ac-muted">reason 未点名任何 GANTT-CF 冲突</span>
                ) : (
                  dsLinks.map((l) => (
                    <span key={l.conflict.id} className="ac-sch-kv-conflict">
                      <span className="ac-mono">{l.conflict.id}</span>
                      <span className={`ac-tag ac-tag--${tagTone(RESOLVE_META[l.state].tone)} ac-tag--sm`}>
                        {RESOLVE_META[l.state].label}
                      </span>
                      <button
                        type="button"
                        className="ac-btn ac-btn--text ac-btn--sm"
                        onClick={() => setVizConflictId(l.conflict.id)}
                      >
                        看时间窗
                      </button>
                    </span>
                  ))
                )}
              </dd>
            </dl>

            {ds.status !== 'pending' && (
              <>
                <div className="ac-section-title" style={{ margin: '16px 0 8px' }}>
                  决策记录
                </div>
                <dl className="ac-kv">
                  <dt>决策人</dt>
                  <dd>
                    {dsDecidedUser
                      ? `${dsDecidedUser.name} · ${dsDecidedUser.title}`
                      : ds.status === 'auto-applied'
                      ? '系统自动应用（置信度 ≥ 85% 且不触碰关键路径的白名单）'
                      : '—'}
                  </dd>
                  <dt>决策时间</dt>
                  <dd className="ac-mono">{ds.decidedAt ?? '—'}</dd>
                  {ds.rejectReason && (
                    <>
                      <dt>驳回理由</dt>
                      <dd className="ac-sch-reject-shown">{ds.rejectReason}</dd>
                    </>
                  )}
                  {overrides[ds.id] && (
                    <>
                      <dt>来源</dt>
                      <dd className="ac-sch-kv-note">
                        本次会话的乐观更新（overrides[{ds.id}]），未写回 data-ai-flow.ts
                      </dd>
                    </>
                  )}
                </dl>
              </>
            )}

            {rejectOpen && ds.status === 'pending' && (
              <div className="ac-sch-reject">
                <div className="ac-section-title" style={{ marginBottom: 8 }}>
                  驳回理由
                </div>
                <textarea
                  className="ac-textarea"
                  rows={4}
                  placeholder="请说明驳回原因，例如：与 GANTT-CF-06 的产能约束冲突、合规项不可跨迭代顺延等。驳回后关联冲突的消解状态会回到「待决策 / 需人工介入」。"
                  value={rejectText}
                  onChange={(e) => setRejectText(e.target.value)}
                />
                <div className="ac-row ac-gap-2 ac-justify-end" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost ac-btn--sm"
                    onClick={() => {
                      setRejectOpen(false);
                      setRejectText('');
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="ac-btn ac-btn--danger ac-btn--sm"
                    onClick={() => rejectSuggestion(ds, rejectText)}
                  >
                    <X size={13} /> 确认驳回
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ============ 11. 一键 AI 自动排期 Modal（AIF-06 回放） ============ */}
      <Modal
        open={autoOpen}
        width={780}
        title="AI 自动排期"
        subtitle={`${SCHEDULE_FLOW.id} · ${SCHEDULE_FLOW.name}`}
        onClose={closeAutoRun}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={openAutoRun}>
              <RotateCcw size={13} /> 重新播放
            </button>
            {autoDone ? (
              <>
                <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={closeAutoRun}>
                  仅查看草案
                </button>
                <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={applyDraftToGantt}>
                  <Sparkles size={13} /> 应用到甘特（乐观更新）
                </button>
              </>
            ) : (
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={closeAutoRun}>
                关闭
              </button>
            )}
          </>
        }
      >
        <div className="ac-sch-auto">
          <div className="ac-row ac-row-wrap ac-gap-2" style={{ marginBottom: 12 }}>
            <span className="ac-tag ac-tag--neutral ac-tag--sm">
              触发 {SCHEDULE_FLOW.triggerEvent}（
              {SCHEDULE_FLOW.triggerType === 'schedule'
                ? '调度器'
                : SCHEDULE_FLOW.triggerType === 'manual'
                ? '手动'
                : '事件'}
              ）
            </span>
            <span className="ac-tag ac-tag--ok ac-tag--sm">自动化率 {SCHEDULE_FLOW.autoRatePct}%</span>
            <span className="ac-tag ac-tag--info ac-tag--sm">平均端到端 {SCHEDULE_FLOW.avgEndToEndMin} 分钟</span>
            <span className="ac-tag ac-tag--outline ac-tag--sm">
              最近一次 {SCHEDULE_FLOW.lastRunAt} ·{' '}
              {SCHEDULE_FLOW.lastRunStatus === 'success'
                ? '成功'
                : SCHEDULE_FLOW.lastRunStatus === 'partial'
                ? '部分成功'
                : '失败'}
            </span>
            <span className="ac-tag ac-tag--warn ac-tag--sm">
              人工确认节点：{SCHEDULE_FLOW.humanCheckpoints.join('、')}
            </span>
          </div>

          <div className="ac-progress-row" style={{ marginBottom: 14 }}>
            <div className="ac-progress">
              <div
                className="ac-progress-bar"
                style={{ width: `${clampPct((Math.min(autoStep, autoSteps.length) / autoSteps.length) * 100)}%` }}
              />
            </div>
            <span className="ac-progress-label">
              {Math.max(0, Math.min(autoStep, autoSteps.length))}/{autoSteps.length}
            </span>
          </div>

          <div className="ac-flow-v">
            {autoSteps.map((st, i) => {
              const state = i < autoStep ? 'done' : i === autoStep ? 'running' : 'wait';
              return (
                <div className="ac-flow-v-node" key={`${st.order}-${st.name}`}>
                  <div className="ac-flow-v-rail">
                    <span
                      className={`ac-flow-v-dot ${
                        state === 'done' ? 'ac-flow-v-dot--ok' : state === 'running' ? 'ac-flow-v-dot--running' : ''
                      }`}
                    >
                      {state === 'done' ? <Check size={12} /> : st.order}
                    </span>
                    {i < autoSteps.length - 1 && <span className="ac-flow-v-line" />}
                  </div>
                  <div className="ac-flow-v-body">
                    <div className="ac-flow-v-title">
                      {st.name}
                      <span
                        className={`ac-tag ac-tag--${
                          st.executor === 'human' ? 'info' : st.executor === 'ai+human' ? 'warn' : 'ai'
                        } ac-tag--sm`}
                      >
                        {EXECUTOR_LABEL[st.executor]}
                      </span>
                      {st.agentId && (
                        <span className="ac-tag ac-tag--outline ac-tag--sm">
                          {AGENT_MAP[st.agentId]?.name ?? st.agentId}
                        </span>
                      )}
                      {state !== 'wait' && <span className="ac-sch-auto-dur">耗时 {fmtDur(st.durationSec)}</span>}
                      {state === 'running' && (
                        <span className="ac-tag ac-tag--brand ac-tag--sm">
                          <Workflow size={11} /> 执行中
                        </span>
                      )}
                    </div>
                    <div className="ac-flow-v-desc">
                      <div>
                        <b>输入：</b>
                        {st.inputFrom}
                      </div>
                      <div>
                        <b>输出：</b>
                        {st.outputTo}
                      </div>
                      {state !== 'wait' && (
                        <>
                          <div>
                            <b>处理：</b>
                            {st.items}
                          </div>
                          <div className="ac-sch-auto-issue">
                            <b>发现：</b>
                            {st.issues}
                          </div>
                        </>
                      )}
                      <div className="ac-sch-auto-fb">
                        <b>兜底：</b>
                        {st.fallbackAction}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {autoDone && (
            <div className="ac-sch-auto-sum">
              <div className="ac-section-title">排期草案汇总</div>
              <div className="ac-sch-auto-grid">
                <div className="ac-sch-auto-cell">
                  <span className="ac-sch-auto-k">调整任务数</span>
                  <span className="ac-sch-auto-v">{Object.keys(appliedPlans).length}</span>
                  <span className="ac-sch-auto-n">
                    {Object.keys(appliedPlans)
                      .map((tid) => TASK_MAP[tid]?.code ?? tid)
                      .join('、') || '无'}
                  </span>
                </div>
                <div className="ac-sch-auto-cell">
                  <span className="ac-sch-auto-k">关键路径变化</span>
                  <span
                    className={`ac-sch-auto-v ${
                      aiStats.cpDeltaDays < 0 ? 'ac-ok-text' : aiStats.cpDeltaDays > 0 ? 'ac-danger-text' : ''
                    }`}
                  >
                    {signedDays(aiStats.cpDeltaDays)}
                  </span>
                  <span className="ac-sch-auto-n">已采纳 / 自动应用建议的 criticalPathDeltaDays 求和</span>
                </div>
                <div className="ac-sch-auto-cell">
                  <span className="ac-sch-auto-k">迭代负载变化</span>
                  <span
                    className={`ac-sch-auto-v ${
                      aiStats.loadDeltaHours < 0 ? 'ac-ok-text' : aiStats.loadDeltaHours > 0 ? 'ac-danger-text' : ''
                    }`}
                  >
                    {signedHours(aiStats.loadDeltaHours)}
                  </span>
                  <span className="ac-sch-auto-n">{CURRENT_SPRINT.id} 承诺 {CURRENT_SPRINT.committed}h / 容量 {CURRENT_SPRINT.capacity}h</span>
                </div>
                <div className="ac-sch-auto-cell">
                  <span className="ac-sch-auto-k">消解冲突</span>
                  <span className="ac-sch-auto-v">
                    {resolvedConflictCount}
                    <span className="ac-sch-auto-unit"> / {GANTT_CONFLICTS.length}</span>
                  </span>
                  <span className="ac-sch-auto-n">
                    {conflictLinks
                      .filter((l) => l.state === 'resolved')
                      .map((l) => l.conflict.id)
                      .join('、') || '无'}
                  </span>
                </div>
                <div className="ac-sch-auto-cell">
                  <span className="ac-sch-auto-k">需人工裁决</span>
                  <span className="ac-sch-auto-v">
                    {aiStats.byStatus.pending + conflictLinks.filter((l) => l.state !== 'resolved').length}
                  </span>
                  <span className="ac-sch-auto-n">
                    待决策建议 {aiStats.byStatus.pending} 条 + 未消解冲突{' '}
                    {conflictLinks.filter((l) => l.state !== 'resolved').length} 条
                  </span>
                </div>
              </div>
              {autoApplied ? (
                <div className="ac-hint ac-hint--ok" style={{ marginTop: 12 }}>
                  <Check size={13} />
                  <span>
                    草案已应用到甘特（乐观更新）：{Object.keys(appliedPlans).length} 个任务条按 suggestedPlan
                    重排。可在页头「撤销上次决策」或建议列表的「还原」回退。
                  </span>
                </div>
              ) : (
                <div className="ac-hint ac-hint--warn" style={{ marginTop: 12 }}>
                  <AlertTriangle size={13} />
                  <span>
                    草案尚未应用。点击「应用到甘特（乐观更新）」只会采纳通过约束门禁的待决策建议；被门禁拦下的建议（
                    {liveSuggestions
                      .filter((s) => s.status === 'pending' && gateBlockers(s).length > 0)
                      .map((s) => s.id)
                      .join('、') || '无'}
                    ）仍需人工裁决。
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 悬浮提示：任务条 / 依赖箭头 / 风险卡 */}
      {tip && (
        <div
          className={`ac-sch-tip ${tip.cls ?? ''}`}
          style={{
            left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 340)),
            top: tip.y + 16,
          }}
        >
          {tip.node}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 提示内容构造
 * ============================================================ */

function barTip(t: TaskDef, risk: RiskInfo | null, applied: AppliedPlan | null): ReactNode {
  const owner = USER_MAP[t.ownerId];
  const st = TASK_STATE_MAP[t.state];
  const req = t.reqId ? REQUIREMENT_MAP[t.reqId] : null;
  const critical = t.critical || CRITICAL_PATH.includes(t.id);
  const raw = TASK_MAP[t.id];
  return (
    <>
      <div className="ac-sch-tip-title">{t.title}</div>
      <div>
        <span className="ac-sch-tip-k">编号：</span>
        {t.code}（{t.id}）
      </div>
      <div>
        <span className="ac-sch-tip-k">需求：</span>
        {req ? `${req.code} ${req.title}` : '发布执行（未关联需求）'}
      </div>
      <div>
        <span className="ac-sch-tip-k">负责人：</span>
        {owner ? `${owner.name} · ${owner.title}` : t.ownerId}
      </div>
      <div>
        <span className="ac-sch-tip-k">状态：</span>
        {st ? `${st.code} ${st.name}` : t.stateLabel}
      </div>
      <div>
        <span className="ac-sch-tip-k">起止：</span>
        {t.startDate} ~ {t.endDate}
      </div>
      <div>
        <span className="ac-sch-tip-k">进度：</span>
        {t.progress}%
      </div>
      <div>
        <span className="ac-sch-tip-k">工时：</span>估算 {t.estimateHours}h / 实际 {t.actualHours}h
      </div>
      {critical && <div style={{ color: '#a5b4fc' }}>★ 关键路径任务</div>}
      {applied && raw && (
        <div style={{ color: '#c4b5fd' }}>
          ✦ AI {applied.sugId} 已重排：原 {raw.startDate} ~ {raw.endDate}
          {raw.ownerId !== t.ownerId ? `，原负责人 ${USER_MAP[raw.ownerId]?.name ?? raw.ownerId}` : ''}
        </div>
      )}
      {risk && (
        <div style={{ color: risk.level === 'high' ? '#fca5a5' : '#fcd34d' }}>
          ⚠ {risk.type}（推算）
        </div>
      )}
    </>
  );
}

function riskTip(t: TaskDef, risk: RiskInfo): ReactNode {
  return (
    <>
      <div className="ac-sch-tip-title">
        ⚠ {risk.type}：{t.code}
      </div>
      <div>
        <span className="ac-sch-tip-k">风险等级：</span>
        {risk.level === 'high' ? '高' : '中'}
      </div>
      <div>
        <span className="ac-sch-tip-k">风险说明：</span>
        {risk.detail}
      </div>
      <div>
        <span className="ac-sch-tip-k">PMO Agent 建议：</span>
        {risk.advice}
      </div>
      <div style={{ marginTop: 4, color: 'var(--text-3)' }}>
        ※ 由进度 / 起止日期与 TODAY（{TODAY}）推算，非任务显式风险字段。
      </div>
    </>
  );
}

function depTip(dp: DepPath): ReactNode {
  const a = TASK_MAP[dp.from];
  const b = TASK_MAP[dp.to];
  return (
    <>
      <div className="ac-sch-tip-title">
        依赖 {dp.id}
        {dp.critical ? ' · 关键路径' : ''}
      </div>
      <div>
        <span className="ac-sch-tip-k">前置：</span>
        {a ? `${a.code} ${a.title}` : dp.from}
      </div>
      <div>
        <span className="ac-sch-tip-k">后置：</span>
        {b ? `${b.code} ${b.title}` : dp.to}
      </div>
      <div>
        <span className="ac-sch-tip-k">说明：</span>
        {dp.note}
      </div>
    </>
  );
}

/* ============================================================
 * 需求展示顺序（取自 REQUIREMENTS 的稳定顺序）
 * ============================================================ */
const REQUIREMENTS_ORDER: string[] = Object.keys(REQUIREMENT_MAP).sort((a, b) => a.localeCompare(b));

/* ============================================================
 * 手绘 SVG 图表（不依赖任何图表库）
 * ============================================================ */

interface DonutItem {
  label: string;
  value: number;
  tone: Tone;
  hex: string;
}

/** 变更类型分布环形图：8 条建议按 changeType 分片，6 值全列于图例 */
function ChangeTypeDonut({ items, total }: { items: DonutItem[]; total: number }) {
  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const r = 56;
  const sw = 22;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="ac-sch-donut-wrap">
      <div className="ac-donut">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="AI 排期建议的变更类型分布环形图"
        >
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef0f4" strokeWidth={sw} />
          {total > 0 &&
            items
              .filter((it) => it.value > 0)
              .map((it) => {
                const frac = it.value / total;
                const dash = frac * circ;
                const node = (
                  <circle
                    key={it.label}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={it.hex}
                    strokeWidth={sw}
                    strokeDasharray={`${dash} ${circ - dash}`}
                    strokeDashoffset={-acc}
                    transform={`rotate(-90 ${cx} ${cy})`}
                  >
                    <title>{`${it.label}：${it.value} 条（${fmt1(frac * 100)}%）`}</title>
                  </circle>
                );
                acc += dash;
                return node;
              })}
          <text x={cx} y={cy - 1} textAnchor="middle" className="ac-sch-svg-big">
            {total}
          </text>
          <text x={cx} y={cy + 17} textAnchor="middle" className="ac-sch-svg-cap">
            条建议
          </text>
        </svg>
      </div>
      <div className="ac-legend">
        {items.map((it) => (
          <div className="ac-legend-item" key={it.label}>
            <span
              className="ac-legend-swatch"
              style={{ background: it.value > 0 ? it.hex : '#e4e8ee' }}
            />
            {it.label}
            <span className="ac-legend-value">
              {it.value}
              {total > 0 ? `（${fmt1((it.value / total) * 100)}%）` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ScatterPoint {
  id: string;
  confidencePct: number;
  status: SugStatus;
  changeType: SugChangeType;
  taskTitle: string;
}

/** 置信度 vs 决策结果散点图：X = confidencePct，Y = 状态分道 */
function ConfidenceScatter({
  points,
  adoptAvg,
  rejectAvg,
}: {
  points: ScatterPoint[];
  adoptAvg: number;
  rejectAvg: number;
}) {
  const W = 640;
  const H = 216;
  const padL = 104;
  const padR = 22;
  const xMin = 55;
  const xMax = 95;
  const axisY = 182;
  const lanes = [
    { key: 'adopt', label: '已采纳 / 自动应用', y: 48 },
    { key: 'pending', label: '待决策', y: 104 },
    { key: 'reject', label: '已驳回', y: 158 },
  ];
  const xOf = (v: number) => padL + ((v - xMin) / (xMax - xMin)) * (W - padL - padR);
  const laneOf = (s: SugStatus) =>
    s === 'accepted' || s === 'auto-applied' ? lanes[0] : s === 'pending' ? lanes[1] : lanes[2];
  const ticks = [55, 60, 65, 70, 75, 80, 85, 90, 95];

  return (
    <div className="ac-sch-scatter">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="置信度与决策结果的散点图"
        className="ac-sch-svg"
      >
        {/* 分道底色 */}
        {lanes.map((ln, i) => (
          <rect
            key={ln.key}
            x={padL}
            y={ln.y - 20}
            width={W - padL - padR}
            height={40}
            rx={6}
            fill={i % 2 === 0 ? '#fafbfc' : '#f5f6f8'}
          />
        ))}
        {/* 分道标签 */}
        {lanes.map((ln) => (
          <text key={`lb-${ln.key}`} x={padL - 10} y={ln.y + 4} textAnchor="end" className="ac-sch-svg-label">
            {ln.label}
          </text>
        ))}
        {/* X 轴与刻度 */}
        <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="#e2e6ec" strokeWidth={1} />
        {ticks.map((t) => (
          <g key={`t-${t}`}>
            <line x1={xOf(t)} y1={axisY} x2={xOf(t)} y2={axisY + 4} stroke="#c9cfda" strokeWidth={1} />
            <text x={xOf(t)} y={axisY + 16} textAnchor="middle" className="ac-sch-svg-tick">
              {t}%
            </text>
          </g>
        ))}
        {/* 70% 标黄阈值 */}
        <line
          x1={xOf(70)}
          y1={22}
          x2={xOf(70)}
          y2={axisY}
          stroke={TONE_HEX.warn}
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />
        <text x={xOf(70) + 4} y={18} className="ac-sch-svg-tick" fill={TONE_HEX.amber}>
          70% 标黄阈值
        </text>
        {/* 已采纳 / 已驳回均值 */}
        {rejectAvg > 0 && (
          <>
            <line
              x1={xOf(rejectAvg)}
              y1={26}
              x2={xOf(rejectAvg)}
              y2={axisY}
              stroke={TONE_HEX.danger}
              strokeWidth={1.4}
              strokeDasharray="6 4"
            />
            <text x={xOf(rejectAvg)} y={H - 4} textAnchor="middle" className="ac-sch-svg-tick" fill={TONE_HEX.danger}>
              驳回均值 {fmt1(rejectAvg)}%
            </text>
          </>
        )}
        {adoptAvg > 0 && (
          <>
            <line
              x1={xOf(adoptAvg)}
              y1={26}
              x2={xOf(adoptAvg)}
              y2={axisY}
              stroke={TONE_HEX.ok}
              strokeWidth={1.4}
              strokeDasharray="6 4"
            />
            <text x={xOf(adoptAvg)} y={H - 18} textAnchor="middle" className="ac-sch-svg-tick" fill="#047857">
              采纳均值 {fmt1(adoptAvg)}%
            </text>
          </>
        )}
        {/* 数据点 */}
        {points.map((p) => {
          const ln = laneOf(p.status);
          const color = TONE_HEX[tagTone(SUG_STATUS_META[p.status].tone)];
          return (
            <g key={p.id}>
              <circle cx={xOf(p.confidencePct)} cy={ln.y} r={7.5} fill={color} stroke="#fff" strokeWidth={2}>
                <title>{`${p.id} · ${p.changeType} · 置信度 ${p.confidencePct}% · ${SUG_STATUS_META[p.status].label}\n${p.taskTitle}`}</title>
              </circle>
              <text
                x={xOf(p.confidencePct)}
                y={ln.y - 13}
                textAnchor="middle"
                className="ac-sch-svg-id"
                fill={color}
              >
                {p.id}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="ac-sch-scatter-note">
        已采纳 / 自动应用组的置信度均值 {fmt1(adoptAvg)}% 明显高于已驳回组的 {fmt1(rejectAvg)}%——8 条建议中置信度
        ≥ 83% 的 4 条全部被采纳或自动应用，≤ 68% 的 2 条全部被驳回。
      </div>
    </div>
  );
}

/** 计划前后对照迷你甘特：两行横条共用时间轴 + 今日竖线 */
function PlanCompareChart({
  cur,
  sug,
  today,
}: {
  cur: SchedulePlanDef;
  sug: SchedulePlanDef;
  today: string;
}) {
  const W = 640;
  const H = 136;
  const padL = 78;
  const padR = 18;
  const plotW = W - padL - padR;
  const dates = [cur.startDate, cur.endDate, sug.startDate, sug.endDate, today];
  let domStart = dates[0];
  let domEnd = dates[0];
  for (const dt of dates) {
    if (dt < domStart) domStart = dt;
    if (dt > domEnd) domEnd = dt;
  }
  const d0s = toYmd(shiftDays(domStart, -2));
  const span = diffDays(d0s, domEnd) + 1 + 2;
  const dayW = plotW / span;
  const xOff = (off: number) => padL + off * dayW;
  const xOf = (date: string) => xOff(diffDays(d0s, date));
  const wOf = (s: string, e: string) => Math.max(10, (diffDays(s, e) + 1) * dayW);
  const rows = [
    { key: 'cur', label: '当前计划', plan: cur, y: 26, fill: '#94a3b8' },
    { key: 'sug', label: '建议计划', plan: sug, y: 68, fill: TONE_HEX.brand },
  ];
  const axisY = 110;
  const tickCount = 5;
  const todayOff = diffDays(d0s, today);
  const todayX = xOff(todayOff + 0.5);
  const inRange = todayOff >= 0 && todayOff < span;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="当前计划与建议计划的对照迷你甘特"
      className="ac-sch-svg"
    >
      {/* 时间轴刻度 */}
      {Array.from({ length: tickCount + 1 }, (_, i) => {
        const off = Math.round((span - 1) * (i / tickCount));
        return (
          <g key={`tick-${i}`}>
            <line x1={xOff(off)} y1={18} x2={xOff(off)} y2={axisY} stroke="#eef0f4" strokeWidth={1} />
            <text x={xOff(off)} y={axisY + 14} textAnchor="middle" className="ac-sch-svg-tick">
              {fmtMD(shiftDays(d0s, off))}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="#e2e6ec" strokeWidth={1} />

      {/* 今日竖线 */}
      {inRange && (
        <>
          <line x1={todayX} y1={16} x2={todayX} y2={axisY} stroke={TONE_HEX.danger} strokeWidth={1.4} strokeDasharray="4 3" />
          <text x={todayX + 4} y={14} className="ac-sch-svg-tick" fill={TONE_HEX.danger}>
            今天 {fmtMD(parseDate(today))}
          </text>
        </>
      )}

      {rows.map((rw) => {
        const x = xOf(rw.plan.startDate);
        const w = wOf(rw.plan.startDate, rw.plan.endDate);
        const label = `${rw.plan.startDate.slice(5)} ~ ${rw.plan.endDate.slice(5)} · ${rw.plan.points}pt`;
        const fits = w > 96;
        return (
          <g key={rw.key}>
            <text x={padL - 10} y={rw.y + 15} textAnchor="end" className="ac-sch-svg-label">
              {rw.label}
            </text>
            <rect x={x} y={rw.y} width={w} height={22} rx={5} fill={rw.fill} opacity={rw.key === 'cur' ? 0.85 : 1} />
            {rw.key === 'sug' && (
              <rect
                x={x}
                y={rw.y}
                width={w}
                height={22}
                rx={5}
                fill="none"
                stroke={TONE_HEX.ai}
                strokeWidth={1.6}
                strokeDasharray="5 3"
              />
            )}
            <text
              x={fits ? x + 8 : x + w + 6}
              y={rw.y + 15}
              className="ac-sch-svg-barlabel"
              fill={fits ? '#fff' : '#5b6675'}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* 起止位移标注 */}
      {cur.startDate !== sug.startDate && (
        <g>
          <line
            x1={xOf(cur.startDate)}
            y1={52}
            x2={xOf(sug.startDate)}
            y2={52}
            stroke={diffDays(cur.startDate, sug.startDate) > 0 ? TONE_HEX.warn : TONE_HEX.ok}
            strokeWidth={1.4}
          />
          <text
            x={(xOf(cur.startDate) + xOf(sug.startDate)) / 2}
            y={49}
            textAnchor="middle"
            className="ac-sch-svg-tick"
            fill={diffDays(cur.startDate, sug.startDate) > 0 ? TONE_HEX.amber : '#047857'}
          >
            起始 {signedDays(diffDays(cur.startDate, sug.startDate))}
          </text>
        </g>
      )}
      {cur.endDate !== sug.endDate && (
        <g>
          <line
            x1={xOf(cur.endDate) + dayW}
            y1={96}
            x2={xOf(sug.endDate) + dayW}
            y2={96}
            stroke={diffDays(cur.endDate, sug.endDate) > 0 ? TONE_HEX.warn : TONE_HEX.ok}
            strokeWidth={1.4}
          />
          <text
            x={(xOf(cur.endDate) + xOf(sug.endDate)) / 2 + dayW}
            y={93}
            textAnchor="middle"
            className="ac-sch-svg-tick"
            fill={diffDays(cur.endDate, sug.endDate) > 0 ? TONE_HEX.amber : '#047857'}
          >
            结束 {signedDays(diffDays(cur.endDate, sug.endDate))}
          </text>
        </g>
      )}
    </svg>
  );
}

/** 冲突时间窗可视化：原始任务条 + 两两重叠区间（danger 填充）+ 建议方案后的虚线新位置 */
function ConflictWindowChart({
  conflict,
  suggested,
  today,
}: {
  conflict: GanttConflictDef;
  suggested: Record<string, SchedulePlanDef>;
  today: string;
}) {
  const W = 720;
  const padL = 104;
  const padR = 18;
  const padT = 22;
  const rowH = 30;
  const barH = 14;
  const plotW = W - padL - padR;
  const ids = conflict.taskIds;

  const dates: string[] = [conflict.windowStart, conflict.windowEnd, today];
  for (const tid of ids) {
    const t = TASK_MAP[tid];
    if (t) {
      dates.push(t.startDate, t.endDate);
    }
    const sp = suggested[tid];
    if (sp) dates.push(sp.startDate, sp.endDate);
  }
  let domStart = dates[0];
  let domEnd = dates[0];
  for (const dt of dates) {
    if (dt < domStart) domStart = dt;
    if (dt > domEnd) domEnd = dt;
  }
  const d0s = toYmd(shiftDays(domStart, -2));
  const span = diffDays(d0s, domEnd) + 1 + 2;
  const dayW = plotW / span;
  const xOff = (off: number) => padL + off * dayW;
  const xOf = (date: string) => xOff(diffDays(d0s, date));
  const wOf = (s: string, e: string) => Math.max(8, (diffDays(s, e) + 1) * dayW);

  const plotH = ids.length * rowH;
  const axisY = padT + plotH + 6;
  const H = axisY + 26;

  const ivs = ids
    .map((tid) => TASK_MAP[tid])
    .filter((t): t is TaskDef => !!t)
    .map((t) => ({ s: diffDays(d0s, t.startDate), e: diffDays(d0s, t.endDate) }));
  const overlaps = overlapWindows(ivs);
  const todayOff = diffDays(d0s, today);
  const todayX = xOff(todayOff + 0.5);
  const tickCount = 6;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${conflict.id} 的冲突时间窗可视化`}
      className="ac-sch-svg"
    >
      {/* 刻度网格 */}
      {Array.from({ length: tickCount + 1 }, (_, i) => {
        const off = Math.round((span - 1) * (i / tickCount));
        return (
          <g key={`ct-${i}`}>
            <line x1={xOff(off)} y1={padT - 6} x2={xOff(off)} y2={axisY} stroke="#eef0f4" strokeWidth={1} />
            <text x={xOff(off)} y={axisY + 14} textAnchor="middle" className="ac-sch-svg-tick">
              {fmtMD(shiftDays(d0s, off))}
            </text>
          </g>
        );
      })}

      {/* 冲突窗口带 */}
      <rect
        x={xOf(conflict.windowStart)}
        y={padT - 6}
        width={wOf(conflict.windowStart, conflict.windowEnd)}
        height={plotH + 6}
        fill={TONE_HEX.warn}
        opacity={0.1}
      />
      <text x={xOf(conflict.windowStart) + 4} y={padT - 9} className="ac-sch-svg-tick" fill={TONE_HEX.amber}>
        冲突窗口 {conflict.windowStart.slice(5)} ~ {conflict.windowEnd.slice(5)}
        {conflict.overloadHours > 0 ? ` · 超产能 ${conflict.overloadHours}h` : ''}
      </text>

      {/* 重叠区间（danger 填充） */}
      {overlaps.map((o, i) => (
        <g key={`ov-${i}`}>
          <rect
            x={xOff(o.s)}
            y={padT - 4}
            width={(o.e - o.s + 1) * dayW}
            height={plotH + 4}
            fill={TONE_HEX.danger}
            opacity={0.16}
          >
            <title>{`重叠区间 ${fmtMD(shiftDays(d0s, o.s))} ~ ${fmtMD(shiftDays(d0s, o.e))}（${
              o.e - o.s + 1
            } 天）`}</title>
          </rect>
          <rect
            x={xOff(o.s)}
            y={padT - 4}
            width={(o.e - o.s + 1) * dayW}
            height={plotH + 4}
            fill="none"
            stroke={TONE_HEX.danger}
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.7}
          />
        </g>
      ))}

      {/* 今日线 */}
      <line x1={todayX} y1={padT - 8} x2={todayX} y2={axisY} stroke={TONE_HEX.danger} strokeWidth={1.4} strokeDasharray="4 3" />
      <text x={todayX + 4} y={H - 4} className="ac-sch-svg-tick" fill={TONE_HEX.danger}>
        今天 {fmtMD(parseDate(today))}
      </text>

      {/* 任务条 */}
      {ids.map((tid, i) => {
        const t = TASK_MAP[tid];
        if (!t) return null;
        const y = padT + i * rowH;
        const sp = suggested[tid];
        const moved = !!sp && (sp.startDate !== t.startDate || sp.endDate !== t.endDate);
        const stateDef = TASK_STATE_MAP[t.state];
        const color = TONE_HEX[tagTone(stateDef ? stateDef.tone : 'neutral')];
        return (
          <g key={tid}>
            <text x={padL - 10} y={y + 12} textAnchor="end" className="ac-sch-svg-label">
              {t.code}
            </text>
            <rect x={xOf(t.startDate)} y={y} width={wOf(t.startDate, t.endDate)} height={barH} rx={4} fill={color} opacity={0.9}>
              <title>{`${tid} ${t.title}\n原始计划 ${t.startDate} ~ ${t.endDate} · ${USER_MAP[t.ownerId]?.name ?? t.ownerId}`}</title>
            </rect>
            <text x={xOf(t.startDate) + 5} y={y + 11} className="ac-sch-svg-barlabel" fill="#fff">
              {t.startDate.slice(5)}~{t.endDate.slice(5)}
            </text>
            {moved && sp && (
              <>
                <rect
                  x={xOf(sp.startDate)}
                  y={y + barH + 2}
                  width={wOf(sp.startDate, sp.endDate)}
                  height={8}
                  rx={3}
                  fill="none"
                  stroke={TONE_HEX.ai}
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                >
                  <title>{`建议方案后的新位置 ${sp.startDate} ~ ${sp.endDate}`}</title>
                </rect>
                <line
                  x1={xOf(t.startDate)}
                  y1={y + barH / 2}
                  x2={xOf(sp.startDate)}
                  y2={y + barH + 6}
                  stroke={TONE_HEX.ai}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  opacity={0.8}
                />
              </>
            )}
          </g>
        );
      })}
      <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="#e2e6ec" strokeWidth={1} />
    </svg>
  );
}
