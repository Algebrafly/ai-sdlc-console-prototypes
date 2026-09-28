/**
 * AI 原型工坊（pageId: prototype）
 *
 * 定位：把已定稿的 PRD 交给 AI 生成高保真交互原型，能力对标 AxHub Make
 *   （AI 生成页面结构、企业组件库 axhub-lib 映射、锚点级批注评审、版本基线、Make / Figma / HTML / Sketch 导出），
 *   是「需求 → 设计」之间的自动化环节，由 ag-pm 触发、ag-arch 协同。
 *
 * 标签页：
 *  1. jobs       生成任务 —— 汇总卡 + 新建任务表单 + 可回放的 7 步生成进度 + 15 列任务表
 *  2. canvas     原型结构与预览 —— 手绘 SVG 页面树 + 线框预览 + 页面属性 + 交互流有向图
 *  3. components 组件与批注 —— 13 列组件库表 + 复用度条形图 + 12 条批注评审 + 严重度堆叠图
 *  4. versions   版本与导出 —— 手绘 SVG 版本时间线 + 版本表 + diffFromPrev 四组清单 + 4 格式导出
 *  5. capability AxHub 能力与自动化编排 —— 集成信息卡 + 6 条能力 + AIF-01 端到端流 + 6 条流概览 + 收益测算
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Blocks,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock,
  Coins,
  Component,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Frame,
  Gauge,
  GitCompareArrows,
  History,
  Info,
  LayoutGrid,
  Layers,
  ListChecks,
  MessageSquare,
  MessageSquareWarning,
  Monitor,
  MousePointerClick,
  Network,
  Package,
  Palette,
  Pause,
  PenTool,
  Play,
  RotateCcw,
  Route,
  Save,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Star,
  Tablet,
  Tag,
  Target,
  Timer,
  UserCheck,
  Users,
  Waypoints,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import { PRD_VERSIONS, REQUIREMENTS, REQUIREMENT_MAP, SDLC_STAGES, USER_MAP, agents, models } from '../data';
import type { Executor, Tone } from '../data';
import {
  AI_AUTOMATION_FLOWS,
  AI_FLOW_TODAY,
  AI_TOOL_CAPABILITIES,
  AI_TOOL_PROVIDERS,
  PROTOTYPE_COMPONENTS,
  PROTOTYPE_JOBS,
  PROTOTYPE_JOB_STEPS,
  PROTOTYPE_PAGES,
  PROTOTYPE_REVIEWS,
  PROTOTYPE_VERSIONS,
} from '../data-ai-flow';
import type {
  AiAutomationFlowDef,
  AiToolCapabilityDef,
  AutomationFlowStepDef,
  PrototypeComponentDef,
  PrototypeJobDef,
  PrototypeJobStepDef,
  PrototypePageDef,
  PrototypeReviewDef,
  PrototypeVersionDef,
} from '../data-ai-flow';
import './prototype.css';

/* ------------------------------------------------------------------ 常量 */

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
  brand: 'brand', ai: 'ai', ok: 'ok', warn: 'warn', danger: 'danger', info: 'info', neutral: 'neutral',
  slate: 'neutral', teal: 'ok', pink: 'danger', indigo: 'brand', amber: 'warn',
};

const AVATAR_TONE: Record<Tone, string> = {
  brand: 'ac-avatar--brand', ai: 'ac-avatar--ai', ok: 'ac-avatar--ok', warn: 'ac-avatar--warn',
  danger: 'ac-avatar--danger', info: 'ac-avatar--info', neutral: 'ac-avatar--slate', slate: 'ac-avatar--slate',
  teal: 'ac-avatar--teal', pink: 'ac-avatar--pink', indigo: 'ac-avatar--indigo', amber: 'ac-avatar--amber',
};

type TabId = 'jobs' | 'canvas' | 'components' | 'versions' | 'capability';

const TABS: { id: TabId; name: string; icon: typeof Package; count: number }[] = [
  { id: 'jobs', name: '生成任务', icon: Workflow, count: PROTOTYPE_JOBS.length },
  { id: 'canvas', name: '原型结构与预览', icon: LayoutGrid, count: PROTOTYPE_PAGES.length },
  { id: 'components', name: '组件与批注', icon: Component, count: PROTOTYPE_COMPONENTS.length },
  { id: 'versions', name: '版本与导出', icon: History, count: PROTOTYPE_VERSIONS.length },
  { id: 'capability', name: 'AxHub 能力与自动化编排', icon: Blocks, count: AI_AUTOMATION_FLOWS.length },
];

/** 7 步生成流水线的固定权重（与 PROTOTYPE_JOB_STEPS 注释一致：8/12/30/18/14/12/6） */
const STEP_WEIGHTS = [8, 12, 30, 18, 14, 12, 6];
const STEP_CUM = STEP_WEIGHTS.reduce<number[]>((acc, w, i) => [...acc, (i === 0 ? 0 : acc[i - 1]) + w], []);

/** 任务状态 → 标签语义 */
const JOB_STATUS_TONE: Record<PrototypeJobDef['status'], string> = {
  queued: 'neutral', parsing: 'info', generating: 'ai', reviewing: 'warn', approved: 'ok', failed: 'danger', exported: 'ok',
};

/** 步骤状态 → 语义与竖向流程节点样式 */
const STEP_STATUS: Record<PrototypeJobStepDef['status'], { label: string; tone: string; dot: string }> = {
  done: { label: '已完成', tone: 'ok', dot: 'ac-flow-v-dot--ok' },
  running: { label: '执行中', tone: 'brand', dot: 'ac-flow-v-dot--running' },
  pending: { label: '待执行', tone: 'neutral', dot: '' },
  failed: { label: '失败', tone: 'danger', dot: 'ac-flow-v-dot--failed' },
  skipped: { label: '已跳过', tone: 'warn', dot: '' },
};

const MODE_LABEL: Record<PrototypeJobDef['mode'], string> = {
  full: '全量重建', incremental: '增量生成', regenerate: '同输入重跑',
};

const FIDELITY_LABEL: Record<PrototypeJobDef['fidelity'], string> = { low: '低保真', mid: '中保真', high: '高保真' };

const DEVICE_META: Record<'desktop' | 'mobile' | 'tablet', { label: string; icon: typeof Monitor }> = {
  desktop: { label: '桌面 1440', icon: Monitor },
  tablet: { label: '平板 834', icon: Tablet },
  mobile: { label: '移动 390', icon: Smartphone },
};

const PAGE_STATUS: Record<PrototypePageDef['status'], { label: string; tone: string }> = {
  generated: { label: '已生成', tone: 'ai' },
  generating: { label: '生成中', tone: 'brand' },
  draft: { label: '草稿', tone: 'neutral' },
  approved: { label: '已批准', tone: 'ok' },
  rejected: { label: '已驳回', tone: 'danger' },
};

const LAYOUT_LABEL: Record<PrototypePageDef['layout'], string> = {
  'sidebar-content': '侧栏 + 内容', 'top-nav': '顶部导航', 'full-bleed': '通栏', split: '左右分栏',
};

const COMP_SOURCE: Record<PrototypeComponentDef['source'], { label: string; tone: string }> = {
  'axhub-lib': { label: 'axhub-lib 企业组件库', tone: 'brand' },
  custom: { label: '自定义组件', tone: 'warn' },
  'ai-generated': { label: 'AI 派生组件', tone: 'ai' },
};

const REVIEW_SEVERITY: Record<PrototypeReviewDef['severity'], { label: string; tone: string; hex: string }> = {
  info: { label: '提示', tone: 'info', hex: '#3b82f6' },
  minor: { label: '轻微', tone: 'ok', hex: '#10b981' },
  major: { label: '重要', tone: 'warn', hex: '#f59e0b' },
  blocker: { label: '阻断', tone: 'danger', hex: '#ef4444' },
};

const REVIEW_STATUS: Record<PrototypeReviewDef['status'], { label: string; tone: string }> = {
  open: { label: '待处理', tone: 'danger' },
  'pending-ai': { label: 'AI 处理中', tone: 'ai' },
  resolved: { label: '已解决', tone: 'ok' },
  wontfix: { label: '判定不修复', tone: 'neutral' },
};

const EXECUTOR_META: Record<Executor, { label: string; tone: string }> = {
  ai: { label: 'AI 执行', tone: 'ai' },
  human: { label: '人工执行', tone: 'info' },
  'ai+human': { label: '人机协同', tone: 'brand' },
};

const AUTOMATION_META: Record<AiToolCapabilityDef['automationLevel'], { label: string; tone: string }> = {
  full: { label: '全自动', tone: 'ok' },
  assisted: { label: 'AI 辅助', tone: 'ai' },
  manual: { label: '人工为主', tone: 'neutral' },
};

const FLOW_RUN_STATUS: Record<AiAutomationFlowDef['lastRunStatus'], { label: string; tone: string }> = {
  success: { label: '成功', tone: 'ok' },
  partial: { label: '部分成功', tone: 'warn' },
  failed: { label: '失败', tone: 'danger' },
};

const TRIGGER_TYPE_LABEL: Record<AiAutomationFlowDef['triggerType'], string> = {
  event: '事件触发', schedule: '定时调度', manual: '手动触发',
};

const EXPORT_META: Record<'make' | 'figma' | 'html' | 'sketch', { label: string; tone: string; scope: string; withComments: boolean; withInteractions: boolean; sizeMb: number; icon: typeof Package }> = {
  make: { label: 'AxHub Make', tone: 'brand', scope: '页面结构 + 组件实例 + 交互流 + 版本树，可在 Make 端继续协作', withComments: true, withInteractions: true, sizeMb: 18.4, icon: Frame },
  figma: { label: 'Figma 库', tone: 'ai', scope: '高保真视觉稿 + 组件库（含 4 个 AI 派生组件）+ 设计 token v3', withComments: false, withInteractions: false, sizeMb: 42.6, icon: Palette },
  html: { label: 'HTML 走查包', tone: 'ok', scope: '可点击走查的静态站点（1440 / 834 / 390 三断点）+ 交互脚本', withComments: true, withInteractions: true, sizeMb: 9.2, icon: FileText },
  sketch: { label: 'Sketch 文档', tone: 'neutral', scope: '页面画板 + Symbol 库，仅保留视觉层，不含交互与批注', withComments: false, withInteractions: false, sizeMb: 26.8, icon: PenTool },
};

/** AxHub 集成信息（AI_TOOL_PROVIDERS 中 provider-axhub 那一条） */
const AXHUB = AI_TOOL_PROVIDERS.filter((p) => p.id === 'provider-axhub')[0];

/** AxHub 六项能力（AXHUB-01 ~ AXHUB-06） */
const AXHUB_CAPS = AI_TOOL_CAPABILITIES.filter((c) => c.providerId === 'provider-axhub');

/** 与原型相关的端到端编排流（PRD 定稿 → 原型生成 → 批注评审 → 需求确认） */
const PROTO_FLOW = AI_AUTOMATION_FLOWS.filter((f) => f.id === 'AIF-01')[0];

/** 组件 id → 定义 */
const COMP_MAP: Record<string, PrototypeComponentDef> = PROTOTYPE_COMPONENTS.reduce<Record<string, PrototypeComponentDef>>((acc, c) => {
  acc[c.id] = c;
  return acc;
}, {});

/** Agent id → 名称 */
const AGENT_NAME: Record<string, string> = agents.reduce<Record<string, string>>((acc, a) => {
  acc[a.id] = a.name;
  return acc;
}, {});

/** 模型 id → 名称 */
const MODEL_NAME: Record<string, string> = models.reduce<Record<string, string>>((acc, m) => {
  acc[m.id] = m.name;
  return acc;
}, {});

/**
 * 各编排流的月执行次数（收益测算口径，页面上同步展示推导依据）。
 * 数据层未提供执行次数字段，此处按触发源在 SP-24 内的对象规模推算：
 *   AIF-01 = 5 个原型任务 + 3 次 PRD 基线修订；AIF-02 = 24 个任务各认领一次；
 *   AIF-03 = 14 份接口契约冻结；AIF-04 = 近 30 天门禁失败 6 次；
 *   AIF-05 = 12 个缺陷定级；AIF-06 = 每迭代规划日 1 次。
 */
const MONTHLY_RUNS: Record<string, number> = {
  'AIF-01': 8, 'AIF-02': 24, 'AIF-03': 14, 'AIF-04': 6, 'AIF-05': 12, 'AIF-06': 1,
};

/** 线框预览中组件块的栅格跨度（1~3） */
const BLOCK_SPAN: Record<string, number> = {
  数据表格: 3, 筛选栏: 3, 甘特条: 3, 看板列: 3, 步骤条: 3,
  '代码 Diff 块': 2, 折线图: 2, 骨架屏: 2, 抽屉: 2, 模态框: 2,
  时间线: 1, 树形结构: 1, 环形图: 1, 指标卡: 1, 标签组: 1, 状态标签: 1, 空态: 1, 批注锚点: 1,
};

/* ------------------------------------------------------------------ 工具函数 */

function num(v: number) {
  return v.toLocaleString('zh-CN');
}

function fixed(v: number, d = 1) {
  return v.toFixed(d);
}

function userName(id: string) {
  return USER_MAP[id]?.name ?? (id === 'ai' ? 'AI 自动生成' : id);
}

function userInitial(id: string) {
  return id === 'ai' ? 'AI' : USER_MAP[id]?.initial ?? '·';
}

function avatarCls(id: string) {
  const u = USER_MAP[id];
  return u ? AVATAR_TONE[u.avatarColor] : 'ac-avatar--ai';
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** 秒 → 「X 分 Y 秒」 */
function dur(sec: number) {
  if (sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

function jump(page: string) {
  if (page) window.location.hash = `#page=${page}`;
}

/* ------------------------------------------------------------------ 手绘 SVG 图表 */

/** 7 步生成流水线总览（横向，带权重与实测耗时） */
function PipelineStrip({ jobId }: { jobId: string }) {
  const steps = useMemo(
    () => PROTOTYPE_JOB_STEPS.filter((s) => s.jobId === jobId).sort((a, b) => a.order - b.order),
    [jobId],
  );
  const W = 1120;
  const H = 190;
  const padL = 24;
  const cellW = (W - padL * 2) / 7;
  const axisY = 66;
  const totalDur = steps.reduce((s, x) => s + x.durationSec, 0) || 1;

  return (
    <svg className="ac-pt-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`原型生成 7 步流水线：${steps.map((s) => `${s.order} ${s.name} ${STEP_STATUS[s.status].label}`).join('；')}`}>
      <line x1={padL} y1={axisY} x2={W - padL} y2={axisY} stroke="#dfe3ea" strokeWidth={2} />
      {steps.map((s, i) => {
        const cx = padL + cellW * i + cellW / 2;
        const st = STEP_STATUS[s.status];
        const color = s.status === 'failed' ? TONE_HEX.danger : s.status === 'pending' ? '#cfd6e0' : TONE_HEX[s.tone] ?? TONE_HEX.brand;
        const shareW = Math.max(2, (s.durationSec / totalDur) * (W - padL * 2));
        const shareX = padL + steps.slice(0, i).reduce((a, b) => a + Math.max(2, (b.durationSec / totalDur) * (W - padL * 2)), 0);
        return (
          <g key={s.id}>
            <rect x={shareX} y={axisY + 26} width={shareW} height={9} rx={4} fill={color} opacity={s.status === 'pending' ? 0.28 : 0.85} />
            <circle cx={cx} cy={axisY} r={15} fill={s.status === 'pending' ? '#fff' : color} stroke={color} strokeWidth={2} />
            <text className="ac-pt-svg-idx" x={cx} y={axisY + 5} textAnchor="middle" fill={s.status === 'pending' ? '#98a2b0' : '#fff'}>
              {s.order}
            </text>
            <text className="ac-pt-svg-name" x={cx} y={axisY - 26} textAnchor="middle">{clip(s.name, 9)}</text>
            <text className="ac-pt-svg-sub" x={cx} y={axisY - 12} textAnchor="middle">{st.label}</text>
            <text className="ac-pt-svg-sub" x={cx} y={axisY + 54} textAnchor="middle">权重 {STEP_WEIGHTS[i]}%</text>
            <text className="ac-pt-svg-mono" x={cx} y={axisY + 70} textAnchor="middle">
              {s.durationSec > 0 ? dur(s.durationSec) : '—'} · {num(s.tokenIn + s.tokenOut)} tok
            </text>
            {i < 6 && <path d={`M ${cx + 17} ${axisY} L ${cx + cellW - 17} ${axisY}`} stroke="#cfd6e0" strokeWidth={1.5} markerEnd="url(#ac-pt-arrow)" />}
            <title>{`${s.order}. ${s.name}｜${st.label}｜${s.startedAt || '未开始'} → ${s.finishedAt || '—'}｜${s.outputSummary}`}</title>
          </g>
        );
      })}
      <defs>
        <marker id="ac-pt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 z" fill="#cfd6e0" />
        </marker>
      </defs>
    </svg>
  );
}

/** 组件复用度横向条形图 */
function ReuseBars({ items }: { items: PrototypeComponentDef[] }) {
  const W = 1060;
  const labelW = 190;
  const valueW = 92;
  const rowH = 24;
  const H = items.length * rowH + 12;
  const chartW = W - labelW - valueW;
  const max = Math.max(...items.map((c) => c.reusedAcrossPages), 1);
  return (
    <svg className="ac-pt-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label="组件跨页复用度条形图，按被引用页面数降序排列">
      {items.map((c, i) => {
        const y = 6 + i * rowH;
        const w = Math.max(3, (c.reusedAcrossPages / max) * chartW);
        const color = TONE_HEX[c.tone] ?? TONE_HEX.brand;
        return (
          <g key={c.id}>
            <text className="ac-pt-svg-name-l" x={0} y={y + 15}>{c.name}</text>
            <rect x={labelW} y={y + 4} width={chartW} height={13} rx={3} fill="#eceff4" />
            <rect x={labelW} y={y + 4} width={w} height={13} rx={3} fill={color} opacity={c.aiGenerated ? 0.72 : 1} />
            <text className="ac-pt-svg-mono" x={W} y={y + 15} textAnchor="end">{c.reusedAcrossPages} 页 · {c.variantCount} 变体</text>
            <title>{`${c.id} ${c.name}｜来源 ${COMP_SOURCE[c.source].label}｜被 ${c.pageIds.length} 个页面引用｜${c.a11yNote}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** 批注分布堆叠条形图（severity × status） */
function ReviewStackBars({ items }: { items: PrototypeReviewDef[] }) {
  const severities: PrototypeReviewDef['severity'][] = ['blocker', 'major', 'minor', 'info'];
  const statuses: PrototypeReviewDef['status'][] = ['open', 'pending-ai', 'resolved', 'wontfix'];
  const STATUS_HEX: Record<string, string> = { open: '#ef4444', 'pending-ai': '#7c3aed', resolved: '#10b981', wontfix: '#94a3b8' };
  const W = 1060;
  const labelW = 96;
  const rowH = 40;
  const H = severities.length * rowH + 46;
  const chartW = W - labelW - 30;
  const maxCount = Math.max(...severities.map((s) => items.filter((i) => i.severity === s).length), 1);

  return (
    <svg className="ac-pt-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label="批注分布堆叠条形图：按严重度分行，按处理状态分段着色">
      {statuses.map((st, i) => (
        <g key={st}>
          <rect x={labelW + i * 128} y={6} width={10} height={10} rx={2} fill={STATUS_HEX[st]} />
          <text className="ac-pt-svg-legend" x={labelW + i * 128 + 15} y={15}>
            {REVIEW_STATUS[st].label}（{items.filter((x) => x.status === st).length}）
          </text>
        </g>
      ))}
      {severities.map((sv, r) => {
        const y = 26 + r * rowH;
        const rows = items.filter((i) => i.severity === sv);
        let cursor = labelW;
        return (
          <g key={sv}>
            <text className="ac-pt-svg-name-l" x={0} y={y + 20}>{REVIEW_SEVERITY[sv].label}</text>
            <rect x={labelW} y={y + 8} width={chartW} height={20} rx={4} fill="#f4f6f9" />
            {statuses.map((st) => {
              const n = rows.filter((x) => x.status === st).length;
              if (n === 0) return null;
              const w = (n / maxCount) * chartW;
              const x0 = cursor;
              cursor += w;
              return (
                <g key={st}>
                  <rect x={x0} y={y + 8} width={Math.max(w - 1, 1)} height={20} rx={3} fill={STATUS_HEX[st]} />
                  <text className="ac-pt-svg-inbar" x={x0 + w / 2} y={y + 22} textAnchor="middle">{n}</text>
                  <title>{`${REVIEW_SEVERITY[sv].label} · ${REVIEW_STATUS[st].label}：${n} 条`}</title>
                </g>
              );
            })}
            <text className="ac-pt-svg-mono" x={W} y={y + 22} textAnchor="end">{rows.length} 条</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 页面树：任务 → pageType 分组 → 页面叶子 */
function PageTree({ pages, activeId, onPick }: { pages: PrototypePageDef[]; activeId: string; onPick: (p: PrototypePageDef) => void }) {
  const groups = useMemo(() => {
    const m: Record<string, PrototypePageDef[]> = {};
    pages.forEach((p) => {
      m[p.pageType] = m[p.pageType] ? [...m[p.pageType], p] : [p];
    });
    return Object.keys(m).map((k) => ({ type: k, list: m[k] }));
  }, [pages]);

  const leafH = 30;
  const gap = 14;
  const H = pages.length * leafH + groups.length * gap + 30;
  const W = 1000;
  const rootX = 12;
  const groupX = 132;
  const leafX = 268;
  const leafW = W - leafX - 12;
  const rootCy = H / 2;

  let y = 20;
  const placed = groups.map((g) => {
    const startY = y;
    const nodes = g.list.map((p) => {
      const cy = startY + leafH / 2;
      y += leafH;
      return { p, cy };
    });
    y += gap;
    return { g, startY, cy: (startY + y - gap) / 2, nodes };
  });

  return (
    <svg className="ac-pt-svg ac-pt-tree" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`原型页面树：${pages.length} 个页面按 ${groups.length} 种页面类型分组`}>
      <rect x={rootX} y={rootCy - 18} width={104} height={36} rx={7} fill="#eef2ff" stroke="#4f46e5" />
      <text className="ac-pt-svg-name" x={rootX + 52} y={rootCy - 2} textAnchor="middle">原型任务</text>
      <text className="ac-pt-svg-mono" x={rootX + 52} y={rootCy + 12} textAnchor="middle">{pages.length} 个页面</text>

      {placed.map((row) => (
        <g key={row.g.type}>
          <path d={`M ${rootX + 104} ${rootCy} C ${groupX - 26} ${rootCy}, ${groupX - 26} ${row.cy}, ${groupX} ${row.cy}`} fill="none" stroke="#cfd6e0" strokeWidth={1.4} />
          <rect x={groupX} y={row.cy - 14} width={120} height={28} rx={6} fill="#fff" stroke="#e2e6ec" />
          <text className="ac-pt-svg-name-l" x={groupX + 10} y={row.cy + 4}>{row.g.type}</text>
          <text className="ac-pt-svg-mono" x={groupX + 112} y={row.cy + 4} textAnchor="end">{row.g.list.length}</text>
          {row.nodes.map(({ p, cy }) => {
            const active = p.id === activeId;
            const color = TONE_HEX[p.tone] ?? TONE_HEX.brand;
            const lowConf = p.aiConfidencePct < 75;
            return (
              <g key={p.id} className="ac-pt-tree-leaf" onClick={() => onPick(p)} role="button" aria-label={`${p.id} ${p.name}`}>
                <path d={`M ${groupX + 120} ${row.cy} C ${leafX - 20} ${row.cy}, ${leafX - 20} ${cy}, ${leafX} ${cy}`} fill="none" stroke="#e2e6ec" strokeWidth={1.2} />
                <rect x={leafX} y={cy - 13} width={leafW} height={26} rx={6}
                  fill={active ? '#eef2ff' : lowConf ? '#fffbeb' : '#fff'}
                  stroke={active ? '#4f46e5' : lowConf ? '#f2dcae' : '#e2e6ec'} strokeWidth={active ? 2 : 1} />
                <rect x={leafX} y={cy - 13} width={3} height={26} rx={1.5} fill={color} />
                <text className="ac-pt-svg-mono" x={leafX + 10} y={cy + 4}>{p.id}</text>
                <text className="ac-pt-svg-name-l" x={leafX + 62} y={cy + 4}>{clip(p.name, 20)}</text>
                <text className="ac-pt-svg-mono" x={leafX + leafW - 118} y={cy + 4}>{clip(p.route, 20)}</text>
                <text className="ac-pt-svg-pri" x={leafX + leafW - 62} y={cy + 4} textAnchor="middle"
                  fill={p.priority === 'P0' ? '#b91c1c' : p.priority === 'P1' ? '#b45309' : '#5b6675'}>{p.priority}</text>
                <text className="ac-pt-svg-mono" x={leafX + leafW - 10} y={cy + 4} textAnchor="end"
                  fill={lowConf ? '#b45309' : '#047857'}>{p.aiConfidencePct}%</text>
                <title>{`${p.id} ${p.name}｜${p.route}｜${PAGE_STATUS[p.status].label}｜AI 置信度 ${p.aiConfidencePct}%｜人工编辑 ${p.editCount} 次｜批注 ${p.annotationIds.length} 条`}</title>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/** 交互流有向图：页面 → 交互 → 目标（跨页跳转用实线靛蓝，页内动作用虚线灰） */
function InteractionFlow({ page, pages }: { page: PrototypePageDef; pages: PrototypePageDef[] }) {
  /** 目标节点按出现顺序聚合：跨页目标各自成组，全部页内动作合并为一个节点 */
  const targets = useMemo(() => {
    const list: { key: string; label: string; cross: boolean; count: number }[] = [];
    page.interactions.forEach((it) => {
      const key = it.targetPageId ?? '__self__';
      const cross = it.targetPageId !== null;
      const label = cross ? pages.find((p) => p.id === it.targetPageId)?.name ?? String(it.targetPageId) : '页内动作';
      const hit = list.find((x) => x.key === key);
      if (hit) hit.count += 1;
      else list.push({ key, label, cross, count: 1 });
    });
    return list;
  }, [page, pages]);

  const rowH = 34;
  const H = Math.max(page.interactions.length, targets.length) * rowH + 60;
  const W = 1000;
  const pageX = 14;
  const interX = 210;
  const targetX = 690;
  const pageCy = H / 2;
  const targetCy = (key: string) => 34 + targets.findIndex((t) => t.key === key) * rowH + rowH / 2;

  return (
    <svg className="ac-pt-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`${page.name} 的交互流有向图，共 ${page.interactions.length} 条交互，其中跨页跳转 ${page.interactions.filter((i) => i.targetPageId !== null).length} 条`}>
      <defs>
        <marker id="ac-pt-flow-self" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
        </marker>
        <marker id="ac-pt-flow-cross" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#4f46e5" />
        </marker>
      </defs>

      <rect x={pageX} y={pageCy - 34} width={168} height={68} rx={9} fill="#f5f0ff" stroke="#7c3aed" strokeWidth={1.6} />
      <text className="ac-pt-svg-name" x={pageX + 84} y={pageCy - 14} textAnchor="middle">当前页面</text>
      <text className="ac-pt-svg-mono" x={pageX + 84} y={pageCy + 2} textAnchor="middle">{page.id}</text>
      <text className="ac-pt-svg-sub" x={pageX + 84} y={pageCy + 18} textAnchor="middle">{clip(page.name, 16)}</text>

      {page.interactions.map((it, i) => {
        const cy = 34 + i * rowH;
        const cross = it.targetPageId !== null;
        const key = it.targetPageId ?? '__self__';
        const ty = targetCy(key);
        const color = cross ? '#4f46e5' : '#cfd6e0';
        return (
          <g key={`${it.name}-${i}`}>
            <path d={`M ${pageX + 168} ${pageCy} C ${interX - 40} ${pageCy}, ${interX - 40} ${cy}, ${interX} ${cy}`}
              fill="none" stroke={color} strokeWidth={1.4} opacity={0.8}
              markerEnd={cross ? 'url(#ac-pt-flow-cross)' : 'url(#ac-pt-flow-self)'} />
            <rect x={interX} y={cy - 12} width={440} height={24} rx={6} fill="#fff" stroke={cross ? '#d8dcfb' : '#e2e6ec'} />
            <rect x={interX} y={cy - 12} width={3} height={24} rx={1.5} fill={cross ? '#4f46e5' : '#94a3b8'} />
            <text className="ac-pt-svg-mono" x={interX + 10} y={cy + 4} fill={cross ? '#4338ca' : '#5b6675'}>{it.trigger}</text>
            <text className="ac-pt-svg-name-l" x={interX + 66} y={cy + 4}>{clip(it.name, 22)}</text>
            <text className="ac-pt-svg-mono" x={interX + 430} y={cy + 4} textAnchor="end">{it.action}</text>
            <path d={`M ${interX + 440} ${cy} C ${targetX - 40} ${cy}, ${targetX - 40} ${ty}, ${targetX} ${ty}`}
              fill="none" stroke={color} strokeWidth={1.4} strokeDasharray={cross ? undefined : '3 3'}
              markerEnd={cross ? 'url(#ac-pt-flow-cross)' : 'url(#ac-pt-flow-self)'} />
            <title>{`${it.name}｜触发 ${it.trigger}｜动作 ${it.action}｜目标 ${cross ? it.targetPageId : '页内动作'}`}</title>
          </g>
        );
      })}

      {targets.map((t) => {
        const cy = targetCy(t.key);
        return (
          <g key={t.key}>
            <rect x={targetX} y={cy - 11} width={W - targetX - 12} height={22} rx={5}
              fill={t.cross ? '#eef2ff' : '#f2f4f8'} stroke={t.cross ? '#c7c2f7' : '#e2e6ec'} />
            <text className="ac-pt-svg-name-l" x={targetX + 9} y={cy + 4} fill={t.cross ? '#3730a3' : '#5b6675'}>
              {t.cross ? `${clip(t.label, 15)} · ${t.key}` : `${t.label}（${t.count} 条）`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 原型版本时间线：6 个版本横向排布，标出基线 */
function VersionTimeline({ versions, activeId, onPick }: { versions: PrototypeVersionDef[]; activeId: string; onPick: (v: PrototypeVersionDef) => void }) {
  const W = 1120;
  const H = 210;
  const padL = 40;
  const plotW = W - padL * 2;
  const axisY = 112;
  const step = plotW / Math.max(versions.length - 1, 1);

  return (
    <svg className="ac-pt-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`原型版本时间线：${versions.map((v) => `${v.version}${v.isBaseline ? '（基线）' : ''}`).join(' → ')}`}>
      <line x1={padL} y1={axisY} x2={W - padL} y2={axisY} stroke="#dfe3ea" strokeWidth={2} />
      {versions.map((v, i) => {
        const cx = padL + step * i;
        const up = i % 2 === 0;
        const color = TONE_HEX[v.tone] ?? TONE_HEX.brand;
        const boxY = up ? axisY - 84 : axisY + 26;
        const active = v.id === activeId;
        const byAi = v.createdBy === 'ai';
        return (
          <g key={v.id} className="ac-pt-tree-leaf" onClick={() => onPick(v)} role="button" aria-label={`版本 ${v.version}`}>
            <line x1={cx} y1={axisY} x2={cx} y2={up ? boxY + 58 : boxY} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.7} />
            <circle cx={cx} cy={axisY} r={active ? 9 : 7} fill={v.isBaseline ? color : '#fff'} stroke={color} strokeWidth={2.5} />
            {v.isBaseline && (
              <path d={`M ${cx} ${axisY - 5} l 1.6 3.3 3.6 0.5 -2.6 2.5 0.6 3.6 -3.2 -1.7 -3.2 1.7 0.6 -3.6 -2.6 -2.5 3.6 -0.5 z`} fill="#fff" />
            )}
            <rect x={cx - 84} y={boxY} width={168} height={58} rx={8} fill="#fff"
              stroke={active ? color : '#e2e6ec'} strokeWidth={active ? 2 : 1} />
            <text className="ac-pt-svg-ver" x={cx - 74} y={boxY + 18}>{v.version}</text>
            {v.isBaseline && <text className="ac-pt-svg-base" x={cx + 74} y={boxY + 18} textAnchor="end">★ 基线</text>}
            <text className="ac-pt-svg-sub" x={cx - 74} y={boxY + 33}>{v.jobId} · {v.createdAt.slice(5, 16)}</text>
            <text className="ac-pt-svg-mono" x={cx - 74} y={boxY + 48}>
              {byAi ? 'AI 自动出版本' : `人工出版本（${userName(v.createdBy)}）`} · {v.pageCount} 页 / {v.componentCount} 组件
            </text>
            <title>{`${v.id} ${v.version}｜${v.createdAt}｜创建者 ${byAi ? 'AI' : userName(v.createdBy)}｜${v.changeSummary}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ 线框预览 */

/** 单个组件块的线框示意（纯内联 SVG） */
function WireShape({ comp }: { comp: PrototypeComponentDef }) {
  const stroke = '#c3cad6';
  const fill = '#eef1f6';
  switch (comp.name) {
    case '数据表格':
      return (
        <svg viewBox="0 0 320 110" className="ac-pt-wf-svg" role="img" aria-label="数据表格线框：表头与 5 行 4 列">
          <rect x={2} y={2} width={316} height={18} rx={3} fill={fill} stroke={stroke} />
          {[0, 1, 2, 3].map((c) => <rect key={c} x={10 + c * 78} y={7} width={52} height={7} rx={2} fill="#c3cad6" />)}
          {[0, 1, 2, 3, 4].map((r) => (
            <g key={r}>
              <line x1={2} y1={22 + r * 17} x2={318} y2={22 + r * 17} stroke="#e6eaf1" />
              {[0, 1, 2, 3].map((c) => <rect key={c} x={10 + c * 78} y={27 + r * 17} width={c === 3 ? 30 : 60} height={6} rx={2} fill="#dde3ec" />)}
            </g>
          ))}
          <rect x={2} y={106} width={316} height={2} fill="#e6eaf1" />
        </svg>
      );
    case '筛选栏':
      return (
        <svg viewBox="0 0 320 46" className="ac-pt-wf-svg" role="img" aria-label="筛选栏线框：4 个筛选项与查询按钮">
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x={4 + i * 66} y={6} width={58} height={7} rx={2} fill="#c3cad6" />
              <rect x={4 + i * 66} y={17} width={58} height={18} rx={4} fill="#fff" stroke={stroke} />
              <path d={`M ${52 + i * 66} 24 l 4 4 l 4 -4`} fill="none" stroke="#98a2b0" strokeWidth={1.2} />
            </g>
          ))}
          <rect x={272} y={17} width={44} height={18} rx={4} fill="#4f46e5" />
          <rect x={284} y={24} width={20} height={5} rx={2} fill="#fff" />
        </svg>
      );
    case '状态标签':
      return (
        <svg viewBox="0 0 160 40" className="ac-pt-wf-svg" role="img" aria-label="状态标签线框：4 枚带图标的状态胶囊">
          {['#10b981', '#f59e0b', '#3b82f6', '#94a3b8'].map((c, i) => (
            <g key={c}>
              <rect x={4 + (i % 2) * 78} y={5 + Math.floor(i / 2) * 17} width={70} height={14} rx={7} fill={c} opacity={0.16} stroke={c} strokeWidth={0.8} />
              <circle cx={13 + (i % 2) * 78} cy={12 + Math.floor(i / 2) * 17} r={2.6} fill={c} />
              <rect x={19 + (i % 2) * 78} y={9.5 + Math.floor(i / 2) * 17} width={44} height={5} rx={2} fill={c} opacity={0.6} />
            </g>
          ))}
        </svg>
      );
    case '甘特条':
      return (
        <svg viewBox="0 0 320 60" className="ac-pt-wf-svg" role="img" aria-label="甘特条线框：3 条带进度填充的任务条与依赖箭头">
          {[0, 1, 2].map((r) => {
            const x0 = 40 + r * 46;
            const w = 120 + r * 40;
            return (
              <g key={r}>
                <rect x={6} y={8 + r * 18} width={28} height={6} rx={2} fill="#c3cad6" />
                <rect x={x0} y={5 + r * 18} width={w} height={12} rx={3} fill={r === 1 ? '#ef4444' : '#4f46e5'} opacity={0.8} />
                <rect x={x0} y={5 + r * 18} width={w * (0.4 + r * 0.2)} height={12} rx={3} fill="#fff" opacity={0.3} />
              </g>
            );
          })}
          <path d="M 160 17 L 190 35" stroke="#94a3b8" strokeWidth={1.2} markerEnd="url(#ac-pt-wf-dep)" />
          <defs>
            <marker id="ac-pt-wf-dep" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>
      );
    case '看板列':
      return (
        <svg viewBox="0 0 320 100" className="ac-pt-wf-svg" role="img" aria-label="看板列线框：4 个泳道列与卡片">
          {[0, 1, 2, 3].map((c) => (
            <g key={c}>
              <rect x={4 + c * 79} y={4} width={74} height={92} rx={5} fill="#f7f8fb" stroke={stroke} />
              <rect x={10 + c * 79} y={10} width={40} height={6} rx={2} fill="#c3cad6" />
              <circle cx={70 + c * 79} cy={13} r={6} fill="#e6eaf1" />
              {[0, 1, 2].map((k) => (
                <g key={k}>
                  <rect x={10 + c * 79} y={24 + k * 23} width={62} height={19} rx={4} fill="#fff" stroke="#e2e6ec" />
                  <rect x={10 + c * 79} y={24 + k * 23} width={2.5} height={19} rx={1} fill={c === 1 ? '#f59e0b' : '#4f46e5'} />
                  <rect x={16 + c * 79} y={29 + k * 23} width={40} height={4} rx={2} fill="#dde3ec" />
                  <rect x={16 + c * 79} y={36 + k * 23} width={26} height={4} rx={2} fill="#e9edf3" />
                </g>
              ))}
            </g>
          ))}
        </svg>
      );
    case '抽屉':
      return (
        <svg viewBox="0 0 320 100" className="ac-pt-wf-svg" role="img" aria-label="抽屉线框：右侧滑出面板与遮罩">
          <rect x={2} y={2} width={316} height={96} rx={5} fill="#f7f8fb" stroke={stroke} />
          <rect x={2} y={2} width={200} height={96} fill="#131a24" opacity={0.08} />
          <rect x={204} y={2} width={114} height={96} rx={5} fill="#fff" stroke="#c7c2f7" strokeWidth={1.4} />
          <rect x={212} y={10} width={60} height={7} rx={2} fill="#4f46e5" opacity={0.7} />
          <line x1={204} y1={24} x2={318} y2={24} stroke="#eef0f4" />
          {[0, 1, 2, 3].map((r) => <rect key={r} x={212} y={32 + r * 13} width={r === 3 ? 50 : 92} height={6} rx={2} fill="#e2e6ec" />)}
          <rect x={212} y={84} width={44} height={11} rx={3} fill="#4f46e5" />
          <rect x={262} y={84} width={44} height={11} rx={3} fill="#fff" stroke={stroke} />
        </svg>
      );
    case '模态框':
      return (
        <svg viewBox="0 0 320 100" className="ac-pt-wf-svg" role="img" aria-label="模态框线框：居中对话框与确认取消按钮">
          <rect x={2} y={2} width={316} height={96} rx={5} fill="#131a24" opacity={0.1} />
          <rect x={70} y={14} width={180} height={72} rx={7} fill="#fff" stroke={stroke} strokeWidth={1.4} />
          <rect x={82} y={24} width={86} height={8} rx={2} fill="#c3cad6" />
          <path d="M 236 24 l 8 8 M 244 24 l -8 8" stroke="#98a2b0" strokeWidth={1.4} />
          <line x1={70} y1={40} x2={250} y2={40} stroke="#eef0f4" />
          {[0, 1].map((r) => <rect key={r} x={82} y={48 + r * 12} width={r === 1 ? 108 : 148} height={6} rx={2} fill="#e2e6ec" />)}
          <rect x={146} y={70} width={44} height={12} rx={3} fill="#fff" stroke={stroke} />
          <rect x={196} y={70} width={44} height={12} rx={3} fill="#4f46e5" />
        </svg>
      );
    case '步骤条':
      return (
        <svg viewBox="0 0 320 44" className="ac-pt-wf-svg" role="img" aria-label="步骤条线框：4 步，当前第 2 步">
          <line x1={26} y1={16} x2={294} y2={16} stroke="#e2e6ec" strokeWidth={2} />
          <line x1={26} y1={16} x2={116} y2={16} stroke="#10b981" strokeWidth={2} />
          {[0, 1, 2, 3].map((i) => {
            const cx = 26 + i * 90;
            const c = i === 0 ? '#10b981' : i === 1 ? '#4f46e5' : '#cfd6e0';
            return (
              <g key={i}>
                <circle cx={cx} cy={16} r={9} fill={i === 1 ? '#fff' : c} stroke={c} strokeWidth={2} />
                {i === 0 && <path d={`M ${cx - 4} 16 l 3 3 l 5 -6`} fill="none" stroke="#fff" strokeWidth={1.8} />}
                {i === 1 && <circle cx={cx} cy={16} r={9} fill="none" stroke="#4f46e5" strokeWidth={2} opacity={0.3} transform={`scale(1.35) translate(${-cx * 0.35} ${-16 * 0.35})`} />}
                <text x={cx} y={19.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={i === 1 ? '#4f46e5' : '#fff'}>{i + 1}</text>
                <rect x={cx - 22} y={30} width={44} height={5} rx={2} fill={i <= 1 ? '#c3cad6' : '#e9edf3'} />
              </g>
            );
          })}
        </svg>
      );
    case '指标卡':
      return (
        <svg viewBox="0 0 160 74" className="ac-pt-wf-svg" role="img" aria-label="指标卡线框：标签、数值、单位与涨跌">
          <rect x={2} y={2} width={156} height={70} rx={6} fill="#fff" stroke={stroke} />
          <rect x={2} y={2} width={3} height={70} rx={1.5} fill="#4f46e5" />
          <rect x={12} y={12} width={52} height={6} rx={2} fill="#c3cad6" />
          <circle cx={144} cy={15} r={6} fill="#eef1f6" />
          <text x={12} y={44} fontSize={20} fontWeight={800} fill="#131a24">3,000</text>
          <rect x={86} y={36} width={18} height={7} rx={2} fill="#e2e6ec" />
          <path d="M 12 58 l 5 -6 l 4 4 l 6 -8" fill="none" stroke="#10b981" strokeWidth={1.6} />
          <rect x={34} y={54} width={40} height={6} rx={2} fill="#d6f5e7" />
          <rect x={80} y={54} width={62} height={6} rx={2} fill="#eef1f6" />
        </svg>
      );
    case '折线图':
      return (
        <svg viewBox="0 0 320 100" className="ac-pt-wf-svg" role="img" aria-label="折线图线框：双序列折线与阈值线">
          <rect x={2} y={2} width={316} height={96} rx={6} fill="#fff" stroke={stroke} />
          {[0, 1, 2, 3].map((i) => <line key={i} x1={26} y1={20 + i * 20} x2={306} y2={20 + i * 20} stroke="#f0f2f6" />)}
          <line x1={26} y1={40} x2={306} y2={40} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.2} />
          <polyline points="26,78 66,66 106,70 146,50 186,44 226,36 266,30 306,26" fill="none" stroke="#4f46e5" strokeWidth={2} />
          <polyline points="26,88 66,84 106,86 146,74 186,78 226,64 266,60 306,58" fill="none" stroke="#0d9488" strokeWidth={1.6} strokeDasharray="3 2" />
          {[66, 146, 226, 306].map((cx, i) => <circle key={cx} cx={cx} cy={[66, 50, 36, 26][i]} r={2.6} fill="#4f46e5" />)}
        </svg>
      );
    case '环形图':
      return (
        <svg viewBox="0 0 160 100" className="ac-pt-wf-svg" role="img" aria-label="环形图线框：三段环形与右侧图例">
          <circle cx={52} cy={50} r={34} fill="none" stroke="#eef1f6" strokeWidth={14} />
          <circle cx={52} cy={50} r={34} fill="none" stroke="#4f46e5" strokeWidth={14} strokeDasharray="120 214" transform="rotate(-90 52 50)" />
          <circle cx={52} cy={50} r={34} fill="none" stroke="#10b981" strokeWidth={14} strokeDasharray="60 214" strokeDashoffset="-120" transform="rotate(-90 52 50)" />
          <circle cx={52} cy={50} r={34} fill="none" stroke="#f59e0b" strokeWidth={14} strokeDasharray="34 214" strokeDashoffset="-180" transform="rotate(-90 52 50)" />
          <text x={52} y={48} textAnchor="middle" fontSize={13} fontWeight={800} fill="#131a24">100%</text>
          <text x={52} y={60} textAnchor="middle" fontSize={7} fill="#98a2b0">差异分布</text>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={100} y={26 + i * 18} width={8} height={8} rx={2} fill={['#4f46e5', '#10b981', '#f59e0b'][i]} />
              <rect x={112} y={28 + i * 18} width={40} height={5} rx={2} fill="#e2e6ec" />
            </g>
          ))}
        </svg>
      );
    case '代码 Diff 块':
      return (
        <svg viewBox="0 0 320 90" className="ac-pt-wf-svg" role="img" aria-label="代码 Diff 块线框：删除行与新增行">
          <rect x={2} y={2} width={316} height={86} rx={6} fill="#0f172a" />
          <rect x={2} y={2} width={316} height={16} rx={6} fill="#1b2740" />
          <rect x={10} y={8} width={70} height={5} rx={2} fill="#475569" />
          {[0, 1, 2, 3].map((r) => {
            const del = r === 1;
            const add = r === 2;
            return (
              <g key={r}>
                <rect x={2} y={20 + r * 16} width={316} height={16} fill={del ? 'rgba(239,68,68,0.16)' : add ? 'rgba(16,185,129,0.16)' : 'transparent'} />
                <text x={10} y={32 + r * 16} fontSize={9} fontFamily="monospace" fill="#64748b">{120 + r}</text>
                <text x={30} y={32 + r * 16} fontSize={9} fontFamily="monospace" fill={del ? '#fca5a5' : add ? '#86efac' : '#94a3b8'}>{del ? '−' : add ? '+' : ' '}</text>
                <rect x={42} y={27 + r * 16} width={del ? 150 : add ? 190 : 110} height={5} rx={2} fill={del ? '#fca5a5' : add ? '#86efac' : '#475569'} opacity={0.75} />
              </g>
            );
          })}
        </svg>
      );
    case '时间线':
      return (
        <svg viewBox="0 0 160 100" className="ac-pt-wf-svg" role="img" aria-label="时间线线框：4 个节点与说明">
          <line x1={14} y1={12} x2={14} y2={92} stroke="#e2e6ec" strokeWidth={2} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <circle cx={14} cy={14 + i * 25} r={5} fill="#fff" stroke={['#10b981', '#4f46e5', '#f59e0b', '#cfd6e0'][i]} strokeWidth={2.4} />
              <rect x={28} y={9 + i * 25} width={i === 3 ? 60 : 100} height={6} rx={2} fill="#c3cad6" />
              <rect x={28} y={19 + i * 25} width={i === 1 ? 84 : 68} height={5} rx={2} fill="#e9edf3" />
            </g>
          ))}
        </svg>
      );
    case '树形结构':
      return (
        <svg viewBox="0 0 160 100" className="ac-pt-wf-svg" role="img" aria-label="树形结构线框：两层父子节点">
          <rect x={6} y={8} width={9} height={9} rx={2} fill="#4f46e5" opacity={0.75} />
          <rect x={22} y={10} width={70} height={6} rx={2} fill="#c3cad6" />
          <line x1={10} y1={20} x2={10} y2={78} stroke="#e2e6ec" strokeWidth={1.4} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <line x1={10} y1={34 + i * 22} x2={26} y2={34 + i * 22} stroke="#e2e6ec" strokeWidth={1.4} />
              <rect x={26} y={29 + i * 22} width={8} height={8} rx={2} fill={i === 1 ? '#f59e0b' : '#94a3b8'} opacity={0.7} />
              <rect x={40} y={31 + i * 22} width={i === 1 ? 84 : 62} height={6} rx={2} fill="#dde3ec" />
              {i === 1 && <rect x={128} y={30 + i * 22} width={24} height={8} rx={4} fill="#fef4e3" stroke="#f2dcae" />}
            </g>
          ))}
          <rect x={40} y={86} width={54} height={6} rx={2} fill="#eef1f6" />
        </svg>
      );
    case '标签组':
      return (
        <svg viewBox="0 0 160 60" className="ac-pt-wf-svg" role="img" aria-label="标签组线框：5 枚标签，超出折叠为 +N">
          {[0, 1, 2, 3, 4].map((i) => {
            const x = 6 + (i % 3) * 52;
            const y = 8 + Math.floor(i / 3) * 24;
            const last = i === 4;
            return (
              <g key={i}>
                <rect x={x} y={y} width={last ? 34 : 46} height={17} rx={8} fill={last ? '#f1f3f6' : '#eef2ff'} stroke={last ? '#e4e8ee' : '#d8dcfb'} />
                <rect x={x + 7} y={y + 6} width={last ? 12 : 24} height={5} rx={2} fill={last ? '#94a3b8' : '#4f46e5'} opacity={0.6} />
                {!last && <path d={`M ${x + 38} ${y + 5} l 5 5 M ${x + 43} ${y + 5} l -5 5`} stroke="#98a2b0" strokeWidth={1} />}
              </g>
            );
          })}
        </svg>
      );
    case '空态':
      return (
        <svg viewBox="0 0 160 90" className="ac-pt-wf-svg" role="img" aria-label="空态线框：插画、标题、说明与动作按钮">
          <circle cx={80} cy={26} r={17} fill="#f2f4f8" />
          <path d="M 72 26 h 16 M 80 18 v 16" stroke="#c3cad6" strokeWidth={2} strokeLinecap="round" />
          <rect x={48} y={52} width={64} height={7} rx={2} fill="#c3cad6" />
          <rect x={34} y={64} width={92} height={5} rx={2} fill="#e9edf3" />
          <rect x={56} y={74} width={48} height={13} rx={4} fill="#4f46e5" />
        </svg>
      );
    case '骨架屏':
      return (
        <svg viewBox="0 0 320 70" className="ac-pt-wf-svg" role="img" aria-label="骨架屏线框：头像与三行渐变占位条">
          <rect x={6} y={10} width={40} height={40} rx={8} fill="#e9edf3" />
          {[0, 1, 2].map((i) => <rect key={i} x={58} y={12 + i * 16} width={i === 2 ? 140 : 240} height={9} rx={4} fill="#eef1f6" />)}
          <rect x={58} y={12} width={70} height={41} rx={4} fill="#fff" opacity={0.45} />
        </svg>
      );
    case '批注锚点':
      return (
        <svg viewBox="0 0 160 54" className="ac-pt-wf-svg" role="img" aria-label="批注锚点线框：3 个带序号的锚点气泡">
          {[0, 1, 2].map((i) => {
            const x = 16 + i * 52;
            const c = ['#db2777', '#f59e0b', '#10b981'][i];
            return (
              <g key={i}>
                <circle cx={x} cy={18} r={11} fill={c} />
                <text x={x} y={22} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">{i + 1}</text>
                <rect x={x - 22} y={34} width={44} height={14} rx={4} fill="#fff" stroke={c} strokeWidth={0.9} />
                <rect x={x - 16} y={39} width={32} height={4} rx={2} fill={c} opacity={0.4} />
              </g>
            );
          })}
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 160 60" className="ac-pt-wf-svg" role="img" aria-label="组件占位块">
          <rect x={2} y={2} width={156} height={56} rx={6} fill="#f7f8fb" stroke={stroke} />
          <rect x={14} y={20} width={90} height={7} rx={2} fill="#dde3ec" />
          <rect x={14} y={34} width={60} height={6} rx={2} fill="#e9edf3" />
        </svg>
      );
  }
}

/** 页面线框预览：按 layout 画骨架，按 componentIds 画组件占位块 */
function Wireframe({ page, device }: { page: PrototypePageDef; device: 'desktop' | 'tablet' | 'mobile' }) {
  const comps = page.componentIds.map((id) => COMP_MAP[id]).filter(Boolean);
  const half = Math.ceil(comps.length / 2);

  const blocks = (list: PrototypeComponentDef[]) => (
    <div className="ac-pt-wf-grid">
      {list.map((c) => (
        <div className="ac-pt-wf-block" key={c.id} style={{ gridColumn: `span ${device === 'mobile' ? 3 : BLOCK_SPAN[c.name] ?? 1}` }}>
          <div className="ac-pt-wf-block-label">
            <span>{c.name}</span>
            <em>{c.id}</em>
            {c.aiGenerated && <span className="ac-tag ac-tag--sm ac-tag--ai">AI</span>}
          </div>
          <WireShape comp={c} />
        </div>
      ))}
    </div>
  );

  return (
    <div className={`ac-pt-wf ac-pt-wf--${device}`}>
      <div className={`ac-pt-wf-frame ac-pt-wf-frame--${page.layout}`}>
        {(page.layout === 'sidebar-content' || page.layout === 'split') && (
          <aside className="ac-pt-wf-side">
            <div className="ac-pt-wf-logo">
              <span className="ac-pt-wf-logo-mark" />
              <span>订单中心</span>
            </div>
            {['总览', page.pageType === '列表' ? '订单查询' : '订单域', page.name.slice(0, 4), '履约域', '合规域', '配置'].map((n, i) => (
              <div className={`ac-pt-wf-nav ${i === 2 ? 'ac-pt-wf-nav--active' : ''}`} key={`${n}-${i}`}>
                <span className="ac-pt-wf-nav-ico" />
                <span>{n}</span>
              </div>
            ))}
            <div className="ac-pt-wf-side-foot">
              <span className="ac-pt-wf-nav-ico" />
              <span>{clip(page.route, 22)}</span>
            </div>
          </aside>
        )}

        <div className="ac-pt-wf-body">
          {page.layout === 'top-nav' && (
            <header className="ac-pt-wf-top">
              <span className="ac-pt-wf-logo-mark" />
              {['订单列表', '状态看板', '审计流水', '导出'].map((n, i) => (
                <span className={`ac-pt-wf-top-item ${i === 1 ? 'ac-pt-wf-top-item--active' : ''}`} key={n}>{n}</span>
              ))}
              <span className="ac-pt-wf-top-user" />
            </header>
          )}

          <div className="ac-pt-wf-pagehead">
            <div className="ac-pt-wf-title">{page.name}</div>
            <div className="ac-pt-wf-crumb">
              首页 / 订单中心 / {page.pageType} · <span className="ac-pt-wf-route">{page.route}</span>
            </div>
            <div className="ac-pt-wf-actions">
              <span className="ac-pt-wf-btn" />
              <span className="ac-pt-wf-btn ac-pt-wf-btn--primary" />
            </div>
          </div>

          {page.layout === 'split' ? (
            <div className="ac-pt-wf-split">
              <div className="ac-pt-wf-split-col">{blocks(comps.slice(0, half))}</div>
              <div className="ac-pt-wf-split-col">{blocks(comps.slice(half))}</div>
            </div>
          ) : (
            blocks(comps)
          )}

          <div className="ac-pt-wf-foot">
            <span>数据绑定 {page.dataBindings.length} 项</span>
            <span>交互 {page.interactions.length} 条</span>
            <span>批注锚点 {page.annotationIds.length} 个</span>
            <span className="ac-pt-wf-foot-ai">AI 置信度 {page.aiConfidencePct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 抽屉子组件 */

/** 任务详情抽屉：全字段 + 7 步执行详情 */
function JobDrawerBody({ job }: { job: PrototypeJobDef }) {
  const steps = useMemo(
    () => PROTOTYPE_JOB_STEPS.filter((s) => s.jobId === job.id).sort((a, b) => a.order - b.order),
    [job.id],
  );
  const tokIn = steps.reduce((s, x) => s + x.tokenIn, 0);
  const tokOut = steps.reduce((s, x) => s + x.tokenOut, 0);

  return (
    <>
      <div className="ac-row ac-gap-2 ac-wrap ac-mb-3">
        <span className={`ac-tag ac-tag--${JOB_STATUS_TONE[job.status]}`}>
          <span className={job.status === 'generating' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
          {job.statusLabel}
        </span>
        <span className="ac-tag ac-tag--outline">{MODE_LABEL[job.mode]}</span>
        <span className="ac-tag ac-tag--ai">{FIDELITY_LABEL[job.fidelity]}</span>
        {job.exportFormats.map((f) => (
          <span key={f} className="ac-tag ac-tag--sm ac-tag--brand">{EXPORT_META[f].label}</span>
        ))}
      </div>

      <div className="ac-ai-block ac-mb-4">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          {AGENT_NAME[job.agentId] ?? job.agentId} · {MODEL_NAME[job.modelId] ?? job.modelId}
        </div>
        <div className="ac-mt-2 ac-lh">{job.desc}</div>
      </div>

      <dl className="ac-kv ac-mb-4">
        <dt>任务编号</dt>
        <dd className="ac-mono ac-brand-text">{job.id}</dd>
        <dt>PRD 版本</dt>
        <dd>
          <span className="ac-mono">{job.prdVersionId}</span>
          <span className="ac-tag ac-tag--sm ac-tag--outline">{job.prdVersionLabel}</span>
        </dd>
        <dt>关联需求</dt>
        <dd>
          <span className="ac-row ac-gap-1 ac-wrap">
            {job.requirementIds.map((rid) => (
              <button key={rid} type="button" className="ac-tag ac-tag--sm ac-tag--brand" title={REQUIREMENT_MAP[rid]?.title} onClick={() => jump('requirement')}>
                {rid}
                <ExternalLink size={10} />
              </button>
            ))}
          </span>
        </dd>
        <dt>触发人</dt>
        <dd>
          <span className="ac-user">
            <span className={`ac-avatar ac-avatar--sm ${avatarCls(job.triggeredBy)}`}>{userInitial(job.triggeredBy)}</span>
            <span className="ac-user-name">{userName(job.triggeredBy)}</span>
            <span className="ac-user-meta">{job.triggeredAt}</span>
          </span>
        </dd>
        <dt>生成进度</dt>
        <dd>
          <span className="ac-progress-row">
            <span className="ac-progress ac-pt-progress-lg">
              <span className={`ac-progress-bar ${job.status === 'failed' ? 'ac-progress-bar--danger' : ''}`} style={{ width: `${job.progress}%` }} />
            </span>
            <span className="ac-progress-label">{job.progress}%</span>
          </span>
        </dd>
        <dt>目标设备</dt>
        <dd>
          <span className="ac-row ac-gap-1 ac-wrap">
            {job.deviceTargets.map((d) => (
              <span key={d} className="ac-tag ac-tag--sm ac-tag--outline">{DEVICE_META[d].label}</span>
            ))}
          </span>
        </dd>
        <dt>页面 / 组件 / 交互</dt>
        <dd className="ac-tnum">
          {job.pageCountDone} / {job.pageCountPlanned} 页 · {job.componentCount} 组件 · {job.interactionCount} 交互
        </dd>
        <dt>耗时 / Token</dt>
        <dd className="ac-tnum">
          {dur(job.durationSec)} · ${fixed(job.tokenCost, 2)}（入 {num(tokIn)} / 出 {num(tokOut)}）
        </dd>
        <dt>重试次数</dt>
        <dd className="ac-tnum">{job.retryCount} 次</dd>
        <dt>AxHub 项目</dt>
        <dd className="ac-mono">{job.axhubProjectId === '' ? '未写入（生成失败或未进入步骤 7）' : job.axhubProjectId}</dd>
        <dt>评审状态</dt>
        <dd className="ac-lh">{job.reviewStatus}</dd>
        <dt>批准</dt>
        <dd>
          {job.approvedBy === '' ? (
            <span className="ac-muted">尚未批准</span>
          ) : (
            <span>
              <span className={`ac-avatar ac-avatar--xs ${avatarCls(job.approvedBy)}`}>{userInitial(job.approvedBy)}</span>{' '}
              {userName(job.approvedBy)} · <span className="ac-mono ac-xs">{job.approvedAt}</span>
            </span>
          )}
        </dd>
        <dt>当前生成页</dt>
        <dd className="ac-mono">{job.currentPageId === '' ? '—' : job.currentPageId}</dd>
      </dl>

      {job.failReason && (
        <>
          <div className="ac-section-title">失败原因</div>
          <div className="ac-hint ac-hint--danger ac-mb-4">
            <AlertOctagon size={14} />
            <span className="ac-lh">{job.failReason}</span>
          </div>
        </>
      )}

      <div className="ac-section-title">7 步执行详情</div>
      <div className="ac-flow-v">
        {steps.map((s) => {
          const st = STEP_STATUS[s.status];
          return (
            <div className="ac-flow-v-node" key={s.id}>
              <div className="ac-flow-v-rail">
                <span className={`ac-flow-v-dot ${st.dot}`}>{s.order}</span>
                <span className="ac-flow-v-line" />
              </div>
              <div className="ac-flow-v-body ac-pt-step">
                <div className="ac-row ac-gap-2 ac-wrap">
                  <span className="ac-flow-v-title">{s.name}</span>
                  <span className={`ac-tag ac-tag--sm ac-tag--${st.tone}`}>{st.label}</span>
                  <span className="ac-xs ac-muted ac-mono">权重 {STEP_WEIGHTS[s.order - 1]}%</span>
                  <span className="ac-xs ac-muted ac-mono ac-ml-auto">
                    <Timer size={11} /> {dur(s.durationSec)} · <Coins size={11} /> {num(s.tokenIn + s.tokenOut)} tok
                  </span>
                </div>
                <div className="ac-flow-v-desc">{s.outputSummary}</div>
                <div className="ac-row ac-gap-2 ac-wrap ac-mt-2">
                  <span className="ac-xs ac-muted ac-mono">
                    {s.startedAt === '' ? '未开始' : `${s.startedAt.slice(5)} → ${s.finishedAt === '' ? '进行中' : s.finishedAt.slice(5)}`}
                  </span>
                  <span className="ac-xs ac-muted ac-mono">{MODEL_NAME[s.modelId] ?? s.modelId}</span>
                  <span className="ac-xs ac-muted ac-mono">入 {num(s.tokenIn)} / 出 {num(s.tokenOut)}</span>
                </div>
                {s.artifacts.length > 0 && (
                  <div className="ac-row ac-gap-1 ac-wrap ac-mt-2">
                    {s.artifacts.map((a) => (
                      <span key={a} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{a}</span>
                    ))}
                  </div>
                )}
                {s.warnings.map((w) => (
                  <div className={`ac-hint ${s.status === 'failed' ? 'ac-hint--danger' : 'ac-hint--warn'} ac-pt-step-warn`} key={w}>
                    <AlertTriangle size={13} />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** 批注详情抽屉 */
function ReviewDrawerBody({
  r,
  page,
  comp,
  state,
  onResolve,
  onTransfer,
  onReject,
}: {
  r: PrototypeReviewDef;
  page: PrototypePageDef | undefined;
  comp: PrototypeComponentDef | undefined;
  state: 'resolved' | 'transferred' | 'rejected' | undefined;
  onResolve: () => void;
  onTransfer: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <div className="ac-row ac-gap-2 ac-wrap ac-mb-3">
        <span className={`ac-tag ac-tag--${r.type === '阻断' ? 'danger' : r.type === '问题' ? 'warn' : r.type === '确认' ? 'info' : 'ok'}`}>{r.type}</span>
        <span className={`ac-tag ac-tag--${REVIEW_SEVERITY[r.severity].tone}`}>{REVIEW_SEVERITY[r.severity].label}</span>
        <span className={`ac-tag ac-tag--${state ? 'ok' : REVIEW_STATUS[r.status].tone}`}>{state === 'resolved' ? '已标记解决' : state === 'transferred' ? '已转交' : state === 'rejected' ? '已驳回' : REVIEW_STATUS[r.status].label}</span>
        <span className="ac-tag ac-tag--outline ac-mono">{r.id}</span>
      </div>

      <dl className="ac-kv ac-mb-4">
        <dt>锚定页面</dt>
        <dd>{page ? `${page.id} · ${page.name}` : r.pageId}</dd>
        <dt>锚定组件</dt>
        <dd>{comp ? `${comp.id} · ${comp.name}（${COMP_SOURCE[comp.source].label}）` : '页面空白处（未锚定具体组件）'}</dd>
        <dt>锚定元素</dt>
        <dd className="ac-lh">{r.anchorText}</dd>
        <dt>评审人</dt>
        <dd>
          <span className="ac-user">
            <span className={`ac-avatar ac-avatar--sm ${avatarCls(r.reviewerId)}`}>{userInitial(r.reviewerId)}</span>
            <span className="ac-user-name">{userName(r.reviewerId)}</span>
            <span className="ac-user-meta">{r.createdAt}</span>
          </span>
        </dd>
        {r.resolvedAt !== '' && (
          <>
            <dt>处理人</dt>
            <dd>
              {userName(r.resolvedBy)} · <span className="ac-mono ac-xs">{r.resolvedAt}</span>
            </dd>
          </>
        )}
      </dl>

      <div className="ac-section-title">评审意见</div>
      <div className="ac-pt-comment ac-mb-4">{r.comment}</div>

      <div className="ac-section-title">AI 回应与修改方案</div>
      <div className="ac-ai-block ac-mb-4">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          ag-pm · 基于 PRD 验收标准与接口契约生成
          {r.status === 'pending-ai' && <span className="ac-tag ac-tag--sm ac-tag--ai ac-ml-auto">方案生成中</span>}
        </div>
        <div className="ac-mt-2 ac-lh">{r.aiResponse}</div>
      </div>

      <div className="ac-section-title">已应用的修改</div>
      {r.revisionApplied === '' ? (
        <div className="ac-hint ac-hint--warn ac-mb-4">
          <Info size={14} />
          <span>
            尚未产生版本修订：{r.status === 'open' ? '批注待处理，AI 方案需人工确认后才落版本。' : r.status === 'pending-ai' ? 'AI 正在生成方案，字段口径待 ag-test 确认。' : '评审判定为不修复，不产生修订，理由已归档知识库。'}
          </span>
        </div>
      ) : (
        <div className="ac-diff ac-mb-4">
          <div className="ac-diff-head">
            <span className="ac-diff-file">{page?.id ?? r.pageId}.make</span>
            <span className="ac-diff-stat">
              <span className="ac-diff-add">修订已落版本</span>
            </span>
          </div>
          <div className="ac-diff-body">
            <div className="ac-diff-row ac-diff-row--del">
              <span className="ac-diff-ln">前</span>
              <span className="ac-diff-sign">-</span>
              <span className="ac-diff-code">批注提出前的原型状态（见「评审意见」中描述的实现风险）</span>
            </div>
            <div className="ac-diff-row ac-diff-row--add">
              <span className="ac-diff-ln">后</span>
              <span className="ac-diff-sign">+</span>
              <span className="ac-diff-code">{r.revisionApplied}</span>
            </div>
          </div>
        </div>
      )}

      <div className="ac-row ac-gap-2 ac-wrap">
        <button type="button" className={`ac-btn ac-btn--sm ac-btn--primary ${state === 'resolved' ? 'ac-btn--disabled' : ''}`} disabled={state === 'resolved'} onClick={onResolve}>
          <CheckCircle2 size={13} />
          {state === 'resolved' ? '已标记解决' : '标记已解决'}
        </button>
        <button type="button" className={`ac-btn ac-btn--sm ac-btn--ghost ${state === 'transferred' ? 'ac-btn--disabled' : ''}`} disabled={state === 'transferred'} onClick={onTransfer}>
          <UserCheck size={13} />
          {state === 'transferred' ? '已转交处理' : '转交处理'}
        </button>
        <button type="button" className={`ac-btn ac-btn--sm ac-btn--danger-ghost ${state === 'rejected' ? 'ac-btn--disabled' : ''}`} disabled={state === 'rejected'} onClick={onReject}>
          <Ban size={13} />
          {state === 'rejected' ? '已驳回' : '驳回'}
        </button>
      </div>
      {state === 'resolved' && (
        <div className="ac-hint ac-hint--ok ac-mt-3">
          <CheckCircle2 size={14} />
          <span>已标记解决：批注闭环记录归档至 WeKnora，作为 G1 需求门禁的评审证据；关联页面 editCount +1。</span>
        </div>
      )}
      {state === 'transferred' && (
        <div className="ac-hint ac-hint--ai ac-mt-3">
          <UserCheck size={14} />
          <span>已转交处理：任务指派给对应模块负责人，48 小时未响应将自动升级至研发总监并阻断 G1 签署。</span>
        </div>
      )}
      {state === 'rejected' && (
        <div className="ac-hint ac-hint--warn ac-mt-3">
          <AlertTriangle size={14} />
          <span>已驳回：驳回理由回灌 ag-pm 作为负样本；若为阻断级批注被驳回，需研发总监二次确认后方可放行。</span>
        </div>
      )}
    </>
  );
}

/** 编排流详情抽屉：全部步骤（复用同一套流程渲染） */
function FlowDrawerBody({ flow }: { flow: AiAutomationFlowDef }) {
  const humanSteps = flow.steps.filter((s) => s.executor !== 'ai');
  return (
    <>
      <div className="ac-row ac-gap-2 ac-wrap ac-mb-3">
        <span className={`ac-tag ac-tag--${TAG_TONE[flow.tone]}`}>{flow.name}</span>
        <span className="ac-tag ac-tag--outline ac-mono">{flow.triggerEvent}</span>
        <span className="ac-tag ac-tag--sm ac-tag--info">{TRIGGER_TYPE_LABEL[flow.triggerType]}</span>
        <span className={`ac-tag ac-tag--sm ac-tag--${FLOW_RUN_STATUS[flow.lastRunStatus].tone}`}>最近执行 {FLOW_RUN_STATUS[flow.lastRunStatus].label}</span>
      </div>

      <div className="ac-metric-grid ac-metric-grid--4 ac-mb-4">
        <div className="ac-metric">
          <div className="ac-metric-head"><span className="ac-metric-label">自动化率</span><span className="ac-metric-icon"><Gauge size={14} /></span></div>
          <div className="ac-metric-value">{flow.autoRatePct}<span className="ac-metric-unit">%</span></div>
          <div className="ac-metric-foot">按步骤执行主体加权</div>
        </div>
        <div className="ac-metric ac-metric--info">
          <div className="ac-metric-head"><span className="ac-metric-label">端到端耗时</span><span className="ac-metric-icon"><Timer size={14} /></span></div>
          <div className="ac-metric-value">{flow.avgEndToEndMin}<span className="ac-metric-unit">分钟</span></div>
          <div className="ac-metric-foot">含人工等待时间</div>
        </div>
        <div className="ac-metric ac-metric--warn">
          <div className="ac-metric-head"><span className="ac-metric-label">人工检查点</span><span className="ac-metric-icon"><UserCheck size={14} /></span></div>
          <div className="ac-metric-value">{flow.humanCheckpoints.length}<span className="ac-metric-unit">个</span></div>
          <div className="ac-metric-foot">{humanSteps.length} 个步骤含人工</div>
        </div>
        <div className="ac-metric ac-metric--ai">
          <div className="ac-metric-head"><span className="ac-metric-label">月执行次数</span><span className="ac-metric-icon"><Activity size={14} /></span></div>
          <div className="ac-metric-value">{MONTHLY_RUNS[flow.id] ?? 0}<span className="ac-metric-unit">次</span></div>
          <div className="ac-metric-foot">按触发源对象规模推算</div>
        </div>
      </div>

      <div className="ac-section-title">步骤明细</div>
      <div className="ac-flow-v">
        {flow.steps.map((s) => (
          <FlowStepNode key={`${flow.id}-${s.order}`} step={s} checkpoint={flow.humanCheckpoints.indexOf(s.name) >= 0} />
        ))}
      </div>
    </>
  );
}

/** 编排流单步节点（横向流程与竖向流程共用同一份字段渲染） */
function FlowStepNode({ step, checkpoint }: { step: AutomationFlowStepDef; checkpoint: boolean }) {
  return (
    <div className="ac-flow-v-node">
      <div className="ac-flow-v-rail">
        <span className={`ac-flow-v-dot ${step.executor === 'ai' ? 'ac-flow-v-dot--ok' : step.executor === 'human' ? 'ac-flow-v-dot--failed' : 'ac-flow-v-dot--running'}`}>
          {step.order}
        </span>
        <span className="ac-flow-v-line" />
      </div>
      <div className="ac-flow-v-body ac-pt-step">
        <div className="ac-row ac-gap-2 ac-wrap">
          <span className="ac-flow-v-title">{step.name}</span>
          <span className={`ac-tag ac-tag--sm ac-tag--${EXECUTOR_META[step.executor].tone}`}>{EXECUTOR_META[step.executor].label}</span>
          {checkpoint && (
            <span className="ac-tag ac-tag--sm ac-tag--danger">
              <UserCheck size={10} />
              人工检查点
            </span>
          )}
          <span className="ac-xs ac-muted ac-mono ac-ml-auto">
            <Timer size={11} /> {dur(step.durationSec)}
          </span>
        </div>
        <div className="ac-row ac-gap-1 ac-wrap ac-mt-1">
          {step.agentId !== '' && <span className="ac-tag ac-tag--sm ac-tag--ai">{AGENT_NAME[step.agentId] ?? step.agentId}</span>}
          {step.toolProviderId !== '' && (
            <span className="ac-tag ac-tag--sm ac-tag--brand">
              {AI_TOOL_PROVIDERS.find((p) => p.id === step.toolProviderId)?.name ?? step.toolProviderId}
            </span>
          )}
          {step.agentId === '' && step.toolProviderId === '' && <span className="ac-tag ac-tag--sm ac-tag--outline">平台自有集成</span>}
        </div>
        <div className="ac-pt-io">
          <span className="ac-pt-io-k">输入</span>
          <span className="ac-pt-io-v">{step.inputFrom}</span>
        </div>
        <div className="ac-pt-io">
          <span className="ac-pt-io-k">输出</span>
          <span className="ac-pt-io-v">{step.outputTo}</span>
        </div>
        <div className="ac-pt-io">
          <span className="ac-pt-io-k">降级</span>
          <span className="ac-pt-io-v ac-warn-text">{step.fallbackAction}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 页面 */

export default function PrototypePage() {
  const [tab, setTab] = useState<TabId>('jobs');

  /* ---- 抽屉 / 弹窗 ---- */
  const [drawerJob, setDrawerJob] = useState<PrototypeJobDef | null>(null);
  const [drawerReview, setDrawerReview] = useState<PrototypeReviewDef | null>(null);
  const [drawerFlow, setDrawerFlow] = useState<AiAutomationFlowDef | null>(null);
  const [exportTarget, setExportTarget] = useState<'make' | 'figma' | 'html' | 'sketch' | null>(null);

  /* ---- 本地乐观更新 ---- */
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, 'resolved' | 'transferred' | 'rejected'>>({});
  const [exportState, setExportState] = useState<Record<string, 'idle' | 'exporting' | 'done'>>({});
  const [confChecks, setConfChecks] = useState<Record<string, boolean>>({});
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* ---- 新建生成任务表单 ---- */
  const [fPrd, setFPrd] = useState<string>('PRD-ORD-v2.3');
  const [fReqs, setFReqs] = useState<string[]>(['REQ-2401', 'REQ-2403']);
  const [fFidelity, setFFidelity] = useState<PrototypeJobDef['fidelity']>('high');
  const [fDevices, setFDevices] = useState<('desktop' | 'mobile' | 'tablet')[]>(['desktop', 'mobile']);
  const [fMode, setFMode] = useState<PrototypeJobDef['mode']>('full');
  const [fModel, setFModel] = useState<string>('mdl-claude');
  const [fKw, setFKw] = useState('');

  /* ---- 7 步生成进度回放 ---- */
  const [sim, setSim] = useState({ running: false, paused: false, pct: 0, sec: 0, tokens: 0 });

  const simSteps = useMemo(() => PROTOTYPE_JOB_STEPS.filter((s) => s.jobId === 'PT-01').sort((a, b) => a.order - b.order), []);
  const simTotalSec = useMemo(() => simSteps.reduce((s, x) => s + x.durationSec, 0), [simSteps]);
  const simTotalTok = useMemo(() => simSteps.reduce((s, x) => s + x.tokenIn + x.tokenOut, 0), [simSteps]);
  const simCurrent = useMemo(() => {
    const done = STEP_CUM.filter((c) => sim.pct >= c).length;
    return Math.min(done, 6);
  }, [sim.pct]);

  useEffect(() => {
    if (!sim.running || sim.paused || sim.pct >= 100) return undefined;
    const t = window.setInterval(() => {
      setSim((s) => {
        const pct = Math.min(100, s.pct + 1.6);
        return { running: pct < 100, paused: false, pct, sec: Math.round((pct / 100) * simTotalSec), tokens: Math.round((pct / 100) * simTotalTok) };
      });
    }, 220);
    return () => window.clearInterval(t);
  }, [sim.running, sim.paused, sim.pct >= 100, simTotalSec, simTotalTok]);

  const startSim = () => setSim({ running: true, paused: false, pct: 0.1, sec: 0, tokens: 0 });
  const resetSim = () => setSim({ running: false, paused: false, pct: 0, sec: 0, tokens: 0 });

  /* ---- canvas / components / versions 选择态 ---- */
  const [canvasJobId, setCanvasJobId] = useState<string>(PROTOTYPE_JOBS.filter((j) => j.status === 'exported')[0]?.id ?? 'PT-01');
  const canvasPages = useMemo(() => PROTOTYPE_PAGES.filter((p) => p.jobId === canvasJobId), [canvasJobId]);
  const [activePageId, setActivePageId] = useState<string>(canvasPages[0]?.id ?? 'PTP-01');
  const activePage = useMemo(
    () => PROTOTYPE_PAGES.find((p) => p.id === activePageId) ?? canvasPages[0],
    [activePageId, canvasPages],
  );
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const [compSource, setCompSource] = useState<string>('all');
  const [reviewFilter, setReviewFilter] = useState<string>('all');

  const [verJobId, setVerJobId] = useState<string>('PT-01');
  const jobVersions = useMemo(() => PROTOTYPE_VERSIONS.filter((v) => v.jobId === verJobId), [verJobId]);
  const [activeVerId, setActiveVerId] = useState<string>(jobVersions[jobVersions.length - 1]?.id ?? 'PTV-01');
  const activeVer = useMemo(() => PROTOTYPE_VERSIONS.find((v) => v.id === activeVerId), [activeVerId]);

  /* ============================== 派生数据 ============================== */

  const stats = useMemo(() => {
    const running = PROTOTYPE_JOBS.filter((j) => ['queued', 'parsing', 'generating'].indexOf(j.status) >= 0).length;
    const reviewing = PROTOTYPE_JOBS.filter((j) => j.status === 'reviewing').length;
    const passed = PROTOTYPE_JOBS.filter((j) => j.status === 'approved' || j.status === 'exported').length;
    const failed = PROTOTYPE_JOBS.filter((j) => j.status === 'failed').length;
    const cost = PROTOTYPE_JOBS.reduce((s, j) => s + j.tokenCost, 0);
    const dur = PROTOTYPE_JOBS.reduce((s, j) => s + j.durationSec, 0);
    return { running, reviewing, passed, failed, cost, dur };
  }, []);

  const failedJobs = useMemo(() => PROTOTYPE_JOBS.filter((j) => j.status === 'failed'), []);

  const filteredComponents = useMemo(() => {
    const kw = fKw.trim().toLowerCase();
    return PROTOTYPE_COMPONENTS.filter((c) => {
      if (compSource !== 'all' && c.source !== compSource) return false;
      if (kw && !`${c.id} ${c.name} ${c.category} ${c.propSchema.join(' ')}`.toLowerCase().includes(kw)) return false;
      return true;
    }).sort((a, b) => b.reusedAcrossPages - a.reusedAcrossPages);
  }, [compSource, fKw]);

  const reviewsByPage = useMemo(() => {
    const m: Record<string, PrototypeReviewDef[]> = {};
    PROTOTYPE_REVIEWS.forEach((r) => {
      m[r.pageId] = m[r.pageId] ? [...m[r.pageId], r] : [r];
    });
    return m;
  }, []);

  const blockers = useMemo(() => PROTOTYPE_REVIEWS.filter((r) => r.severity === 'blocker'), []);
  const openBlockers = blockers.filter((r) => r.status !== 'resolved' && reviewOverrides[r.id] !== 'resolved');

  const filteredReviews = useMemo(() => {
    if (reviewFilter === 'all') return PROTOTYPE_REVIEWS;
    if (reviewFilter === 'blocker') return PROTOTYPE_REVIEWS.filter((r) => r.severity === 'blocker');
    if (reviewFilter === 'open') return PROTOTYPE_REVIEWS.filter((r) => r.status === 'open' || r.status === 'pending-ai');
    return PROTOTYPE_REVIEWS.filter((r) => r.type === reviewFilter);
  }, [reviewFilter]);

  const roi = useMemo(() => {
    const rows = AI_AUTOMATION_FLOWS.map((f) => {
      const runs = MONTHLY_RUNS[f.id] ?? 0;
      const savedMin = (f.avgEndToEndMin * f.autoRatePct) / 100 * runs;
      return { flow: f, runs, savedMin, savedHours: savedMin / 60 };
    });
    const totalHours = rows.reduce((s, r) => s + r.savedHours, 0);
    const totalRuns = rows.reduce((s, r) => s + r.runs, 0);
    const weightedAuto = rows.reduce((s, r) => s + r.flow.autoRatePct * r.runs, 0) / Math.max(totalRuns, 1);
    return { rows, totalHours, totalRuns, weightedAuto };
  }, []);

  const lowConfPages = useMemo(() => PROTOTYPE_PAGES.filter((p) => p.aiConfidencePct < 75), []);

  /* ============================== 行为 ============================== */

  const doExport = (fmt: 'make' | 'figma' | 'html' | 'sketch') => {
    setExportTarget(null);
    setExportState((p) => ({ ...p, [fmt]: 'exporting' }));
    const t = window.setTimeout(() => {
      setExportState((p) => ({ ...p, [fmt]: 'done' }));
    }, 2000);
    timers.current = [...timers.current, t];
  };

  const toggleReq = (rid: string) =>
    setFReqs((prev) => (prev.indexOf(rid) >= 0 ? prev.filter((x) => x !== rid) : [...prev, rid]));

  const toggleDevice = (d: 'desktop' | 'mobile' | 'tablet') =>
    setFDevices((prev) => (prev.indexOf(d) >= 0 ? prev.filter((x) => x !== d) : [...prev, d]));

  const prdBaseline = PRD_VERSIONS.find((p) => p.id === fPrd);
  const canGenerate = prdBaseline?.baseline === true && fReqs.length > 0 && fDevices.length > 0;

  /* ============================== 渲染 ============================== */

  return (
    <div className="ac-pt" data-annotation-id="ai-sdlc-prototype-page">
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">AI 原型工坊</div>
          <div className="ac-page-desc">
            把已定稿的 PRD 交给 AI 生成高保真交互原型，能力对标 <b>AxHub Make</b>（{AXHUB.version}）：AI 生成页面结构、
            axhub-lib 企业组件库智能映射、锚点级批注评审、版本基线与 Make / Figma / HTML / Sketch 多格式导出。
            本页是「需求 → 设计」之间的自动化环节，由 ag-pm（需求澄清 Agent）触发、ag-arch（架构设计 Agent）协同，
            产物回写 AxHub 项目并作为 G1 需求门禁与 G2 架构门禁的评审证据。数据口径贯穿「订单中心重构」（EPIC-ORDER-REF）·
            PRD-ORD-v2.3 基线 · Sprint 24，快照日 {AI_FLOW_TODAY}。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className={`ac-tag ac-tag--${AXHUB.status === 'connected' ? 'ok' : 'neutral'}`}>
            <span className={AXHUB.status === 'connected' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
            {AXHUB.name} {AXHUB.status === 'connected' ? '已连接' : '未连接'}
          </span>
          <span className="ac-tag ac-tag--ai">
            <Sparkles size={12} />
            {PROTOTYPE_JOBS.length} 任务 · {PROTOTYPE_PAGES.length} 页面 · {PROTOTYPE_COMPONENTS.length} 组件
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('requirement')}>
            <FileText size={13} />
            去需求澄清
          </button>
        </div>
      </div>

      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" className={`ac-tab ${tab === t.id ? 'ac-tab--active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={14} />
              {t.name}
              <span className="ac-tab-count">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* ================= 1. 生成任务 ================= */}
      {tab === 'jobs' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--6 ac-mb-0" data-annotation-id="ai-sdlc-prototype-summary">
            <div className="ac-metric">
              <div className="ac-metric-head"><span className="ac-metric-label">任务总数</span><span className="ac-metric-icon"><Workflow size={14} /></span></div>
              <div className="ac-metric-value">{PROTOTYPE_JOBS.length}<span className="ac-metric-unit">个</span></div>
              <div className="ac-metric-foot">覆盖 {PROTOTYPE_PAGES.length} 个页面</div>
            </div>
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head"><span className="ac-metric-label">进行中</span><span className="ac-metric-icon"><Zap size={14} /></span></div>
              <div className="ac-metric-value">{stats.running}<span className="ac-metric-unit">个</span></div>
              <div className="ac-metric-foot">queued / parsing / generating</div>
            </div>
            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head"><span className="ac-metric-label">待评审</span><span className="ac-metric-icon"><MessageSquare size={14} /></span></div>
              <div className="ac-metric-value">{stats.reviewing}<span className="ac-metric-unit">个</span></div>
              <div className="ac-metric-foot">{PROTOTYPE_REVIEWS.filter((r) => r.status === 'open').length} 条批注待处理</div>
            </div>
            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head"><span className="ac-metric-label">已通过 / 已导出</span><span className="ac-metric-icon"><CheckCircle2 size={14} /></span></div>
              <div className="ac-metric-value">{stats.passed}<span className="ac-metric-unit">个</span></div>
              <div className="ac-metric-foot">PT-01 已导出 3 种格式</div>
            </div>
            <div className="ac-metric ac-metric--danger">
              <div className="ac-metric-head"><span className="ac-metric-label">失败</span><span className="ac-metric-icon"><XCircle size={14} /></span></div>
              <div className="ac-metric-value">{stats.failed}<span className="ac-metric-unit">个</span></div>
              <div className="ac-metric-foot">已回退至需求澄清环节</div>
            </div>
            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head"><span className="ac-metric-label">累计 Token 成本</span><span className="ac-metric-icon"><Coins size={14} /></span></div>
              <div className="ac-metric-value">${fixed(stats.cost, 2)}</div>
              <div className="ac-metric-foot">累计生成耗时 {dur(stats.dur)}</div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-prototype-create">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                新建原型生成任务
              </span>
              <span className="ac-card-subtitle">PRD 基线 → 关联需求 → 保真度 / 设备 / 模式 / 模型 → 触发 7 步生成流水线</span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${prdBaseline?.baseline ? 'ok' : 'warn'}`}>
                  {prdBaseline ? `${prdBaseline.id} · ${prdBaseline.status}` : '未选择'}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pt-form">
                <div className="ac-field">
                  <span className="ac-field-label ac-field-req">PRD 版本</span>
                  <select className="ac-select" value={fPrd} onChange={(e) => setFPrd(e.target.value)}>
                    {PRD_VERSIONS.map((p) => (
                      <option key={p.id} value={p.id}>{p.id} · {p.title}（{p.status}）</option>
                    ))}
                  </select>
                  <span className="ac-field-hint">
                    {prdBaseline?.baseline
                      ? `已基线，${prdBaseline.wordCount.toLocaleString('zh-CN')} 字，AI 生成占比 ${prdBaseline.aiRatio}%，可直接驱动原型生成`
                      : '非基线版本缺少冻结的验收标准，AI 无法推断交互分支（PT-05 即因此失败）'}
                  </span>
                </div>

                <div className="ac-field">
                  <span className="ac-field-label ac-field-req">关联需求（{fReqs.length} 条 · 合计 {fReqs.reduce((s, r) => s + (REQUIREMENT_MAP[r]?.storyPoints ?? 0), 0)} 点）</span>
                  <div className="ac-pt-req-list">
                    {REQUIREMENTS.map((r) => (
                      <label className={`ac-pt-req ${fReqs.indexOf(r.id) >= 0 ? 'ac-pt-req--on' : ''}`} key={r.id}>
                        <input type="checkbox" checked={fReqs.indexOf(r.id) >= 0} onChange={() => toggleReq(r.id)} />
                        <span className="ac-mono ac-xs">{r.id}</span>
                        <span className="ac-pt-req-title">{clip(r.title, 26)}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${r.priority === 'P0' ? 'danger' : r.priority === 'P1' ? 'warn' : 'neutral'}`}>{r.priority}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="ac-pt-form-row">
                  <div className="ac-field">
                    <span className="ac-field-label">保真度</span>
                    <div className="ac-tabs ac-tabs--pill">
                      {(['low', 'mid', 'high'] as PrototypeJobDef['fidelity'][]).map((f) => (
                        <button key={f} type="button" className={`ac-tab ${fFidelity === f ? 'ac-tab--active' : ''}`} onClick={() => setFFidelity(f)}>
                          {FIDELITY_LABEL[f]}
                        </button>
                      ))}
                    </div>
                    <span className="ac-field-hint">低保真只出栅格骨架；高保真额外产出视觉稿与暗色变体，耗时约为低保真的 3 倍</span>
                  </div>

                  <div className="ac-field">
                    <span className="ac-field-label ac-field-req">目标设备（{fDevices.length} 个断点）</span>
                    <div className="ac-row ac-gap-3 ac-wrap">
                      {(['desktop', 'tablet', 'mobile'] as ('desktop' | 'tablet' | 'mobile')[]).map((d) => {
                        const Icon = DEVICE_META[d].icon;
                        return (
                          <label className="ac-pt-check" key={d}>
                            <input type="checkbox" checked={fDevices.indexOf(d) >= 0} onChange={() => toggleDevice(d)} />
                            <Icon size={13} />
                            {DEVICE_META[d].label}
                          </label>
                        );
                      })}
                    </div>
                    <span className="ac-field-hint">断点 1440 / 834 / 390，多选会分别产出各断点的布局区块</span>
                  </div>

                  <div className="ac-field">
                    <span className="ac-field-label">生成模式</span>
                    <select className="ac-select" value={fMode} onChange={(e) => setFMode(e.target.value as PrototypeJobDef['mode'])}>
                      <option value="full">全量重建（full）—— 从零生成整棵信息架构</option>
                      <option value="incremental">增量生成（incremental）—— 在既有基线上挂出新子树</option>
                      <option value="regenerate">同输入重跑（regenerate）—— 用于对比模型稳定性</option>
                    </select>
                    <span className="ac-field-hint">{fMode === 'incremental' ? '需选择基线版本，复用 PT-01 的导航树与术语表' : fMode === 'regenerate' ? '产物不会覆盖既有版本，会另存为新快照' : '将生成全新的 AxHub 项目号'}</span>
                  </div>

                  <div className="ac-field">
                    <span className="ac-field-label">模型</span>
                    <select className="ac-select" value={fModel} onChange={(e) => setFModel(e.target.value)}>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}（{m.contextWindow} · ¥{fixed(m.costPer1kTokens, 3)}/千 tok · {m.egress}）</option>
                      ))}
                    </select>
                    <span className="ac-field-hint">
                      {models.find((m) => m.id === fModel)?.desc}
                    </span>
                  </div>
                </div>

                <div className="ac-row ac-gap-2 ac-wrap">
                  <button type="button" className={`ac-btn ac-btn--ai ${canGenerate ? '' : 'ac-btn--disabled'}`} disabled={!canGenerate} onClick={startSim}>
                    <Play size={14} />
                    开始生成
                  </button>
                  {!canGenerate && (
                    <span className="ac-hint ac-hint--warn ac-pt-inline-hint">
                      <ShieldAlert size={13} />
                      <span>
                        生成按钮已禁用：{prdBaseline?.baseline ? '' : `PRD 版本 ${fPrd} 尚未基线，验收标准不可作为生成依据；`}
                        {fReqs.length === 0 ? '未选择关联需求；' : ''}
                        {fDevices.length === 0 ? '未选择目标设备。' : ''}
                        平台规范：非基线 PRD 一律不允许触发原型生成，避免重演 PT-05 的失败。
                      </span>
                    </span>
                  )}
                  {canGenerate && (
                    <span className="ac-xs ac-muted">
                      将以 {MODE_LABEL[fMode]} · {FIDELITY_LABEL[fFidelity]} · {fDevices.length} 断点触发，预计 7 步耗时约 {dur(simTotalSec)}、消耗 {num(simTotalTok)} tokens
                    </span>
                  )}
                </div>
              </div>

              {/* 回放演示 */}
              <div className="ac-pt-sim">
                <div className="ac-pt-sim-head">
                  <span className="ac-pt-sim-title">
                    <Bot size={14} />
                    7 步生成进度回放（演示）
                  </span>
                  <span className="ac-tag ac-tag--outline ac-mono">{fPrd}</span>
                  <span className="ac-tag ac-tag--ai ac-mono">{MODEL_NAME[fModel] ?? fModel}</span>
                  <span className="ac-row ac-gap-2 ac-ml-auto">
                    <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" disabled={!sim.running} onClick={() => setSim((s) => ({ ...s, paused: !s.paused }))}>
                      {sim.paused ? <Play size={13} /> : <Pause size={13} />}
                      {sim.paused ? '继续' : '暂停'}
                    </button>
                    <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={resetSim}>
                      <RotateCcw size={13} />
                      重置
                    </button>
                  </span>
                </div>

                <div className="ac-pt-sim-body">
                  <div className="ac-pt-sim-gauge">
                    <div className="ac-pt-sim-pct">{Math.round(sim.pct)}<em>%</em></div>
                    <div className="ac-pt-sim-step">
                      {sim.pct <= 0 ? '待启动' : sim.pct >= 100 ? '生成完成' : `步骤 ${simCurrent + 1} · ${simSteps[simCurrent].name}`}
                    </div>
                    <div className="ac-pt-sim-meta">
                      <span><Timer size={11} /> {dur(sim.sec)}</span>
                      <span><Coins size={11} /> {num(sim.tokens)} tok</span>
                      <span><Layers size={11} /> {Math.min(8, Math.round((sim.pct / 100) * 8))} / 8 页</span>
                    </div>
                  </div>

                  <div className="ac-pt-sim-track">
                    <div className="ac-progress ac-progress--lg">
                      <div className={`ac-progress-bar ${sim.pct >= 100 ? 'ac-progress-bar--ok' : 'ac-progress-bar--striped'}`} style={{ width: `${sim.pct}%` }} />
                    </div>
                    <div className="ac-pt-sim-steps">
                      {simSteps.map((s, i) => {
                        const state = sim.pct <= 0 ? 'pending' : sim.pct >= 100 ? 'done' : i < simCurrent ? 'done' : i === simCurrent ? 'running' : 'pending';
                        return (
                          <div className={`ac-pt-sim-step-item ac-pt-sim-step-item--${state}`} key={s.id}>
                            <span className="ac-pt-sim-step-idx">{i + 1}</span>
                            <span className="ac-pt-sim-step-name">{s.name}</span>
                            <span className="ac-pt-sim-step-w">{STEP_WEIGHTS[i]}%</span>
                          </div>
                        );
                      })}
                    </div>
                    {sim.pct >= 100 && (
                      <div className="ac-hint ac-hint--ok">
                        <CheckCircle2 size={14} />
                        <span>
                          生成完成：8 个页面骨架 + 18 个组件映射 + 34 条交互流已写入 AxHub 项目，
                          并生成 {PROTOTYPE_REVIEWS.filter((r) => r.pageId.indexOf('PTP-0') === 0).length} 个批注锚点等待多角色评审。
                          实际耗时 {dur(simTotalSec)}、Token {num(simTotalTok)}（入 / 出分步明细见任务抽屉）。
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-prototype-steps">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Waypoints size={16} />
                7 步生成流水线（PT-01 实测）
              </span>
              <span className="ac-card-subtitle">权重 8 / 12 / 30 / 18 / 14 / 12 / 6，任务 progress 即按此加权；条形长度表示各步实测耗时占比</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">合计 {dur(simTotalSec)}</span>
                <span className="ac-tag ac-tag--ai">{num(simTotalTok)} tokens</span>
              </div>
            </div>
            <div className="ac-card-body">
              <PipelineStrip jobId="PT-01" />
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint ac-hint--ai">
                <Sparkles size={14} />
                <span>
                  AI 做了什么：步骤 1~2 由 ag-pm 解析 PRD 并抽取信息架构，步骤 3~4、6 由 ag-arch 生成页面结构与组件映射并套用设计 token，
                  步骤 5 由 ag-pm 把验收标准的 Given-When-Then 转成交互流与状态机，步骤 7 写入 AxHub 项目并生成批注锚点。
                  依据是什么：PRD-ORD-v2.3 的 32 条验收标准、axhub-lib {AXHUB.version.split(' ')[1]} 组件索引、design-token v3。
                  人工如何介入：组件映射置信度 &lt; 70% 的区块自动转草稿态并标记 humanEdited 待人工选型；阻断级批注不允许自动修改，必须人工确认后再生成版本。
                </span>
              </div>
            </div>
          </div>

          {failedJobs.length > 0 && (
            <div className="ac-card ac-pt-fail-card">
              <div className="ac-card-head">
                <span className="ac-card-title ac-danger-text">
                  <AlertOctagon size={16} />
                  生成失败任务（{failedJobs.length}）
                </span>
                <span className="ac-card-subtitle">失败任务已按兜底策略回退至需求澄清环节（st-req），并沉淀为流水线的前置校验规则</span>
              </div>
              <div className="ac-card-body">
                {failedJobs.map((j) => (
                  <div className="ac-pt-fail" key={j.id}>
                    <div className="ac-row ac-gap-2 ac-wrap">
                      <span className="ac-mono ac-xs ac-danger-text">{j.id}</span>
                      <span className="ac-pt-fail-title">{j.name}</span>
                      <span className="ac-tag ac-tag--sm ac-tag--danger">进度停在 {j.progress}%</span>
                      <span className="ac-tag ac-tag--sm ac-tag--outline">重试 {j.retryCount} 次</span>
                      <span className="ac-tag ac-tag--sm ac-tag--warn">已耗 {dur(j.durationSec)} · ${fixed(j.tokenCost, 2)}</span>
                      <button type="button" className="ac-btn ac-btn--sm ac-btn--danger-ghost ac-ml-auto" onClick={() => jump('requirement')}>
                        <RotateCcw size={13} />
                        回退到需求澄清
                      </button>
                    </div>
                    <div className="ac-hint ac-hint--danger ac-mt-2">
                      <AlertOctagon size={14} />
                      <span className="ac-lh">{j.failReason}</span>
                    </div>
                    <div className="ac-hint ac-hint--ai ac-mt-2">
                      <Sparkles size={14} />
                      <span className="ac-lh">{j.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ac-card" data-annotation-id="ai-sdlc-prototype-jobs">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                原型生成任务清单（15 列）
              </span>
              <span className="ac-card-subtitle">点击任意行查看任务全字段与 7 步执行详情（含产物、告警、Token 明细）</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">共 {PROTOTYPE_JOBS.length} 个任务</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>任务编号</th>
                      <th>名称</th>
                      <th>PRD 版本</th>
                      <th>关联需求</th>
                      <th>触发人</th>
                      <th className="ac-td-num">触发时间</th>
                      <th>模式</th>
                      <th>模型 / Agent</th>
                      <th>状态</th>
                      <th>进度</th>
                      <th>保真度 / 设备</th>
                      <th className="ac-td-num">页数（完成 / 计划）</th>
                      <th className="ac-td-num">组件 · 交互</th>
                      <th className="ac-td-num">耗时 · Token · 重试</th>
                      <th>AxHub 项目 / 评审状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROTOTYPE_JOBS.map((j) => (
                      <tr key={j.id} className="ac-pt-row" onClick={() => setDrawerJob(j)} title="点击查看任务详情与 7 步执行记录">
                        <td className="ac-mono ac-brand-text">{j.id}</td>
                        <td className="ac-pt-cell-title">{clip(j.name, 34)}</td>
                        <td>
                          <span className="ac-mono ac-xs">{j.prdVersionId}</span>
                          <div className="ac-xs ac-muted">{j.prdVersionLabel}</div>
                        </td>
                        <td>
                          <span className="ac-row ac-gap-1 ac-wrap">
                            {j.requirementIds.slice(0, 3).map((rid) => (
                              <span key={rid} className="ac-tag ac-tag--sm ac-tag--brand" title={REQUIREMENT_MAP[rid]?.title}>{rid}</span>
                            ))}
                            {j.requirementIds.length > 3 && <span className="ac-tag ac-tag--sm ac-tag--outline">+{j.requirementIds.length - 3}</span>}
                          </span>
                        </td>
                        <td>
                          <span className="ac-user">
                            <span className={`ac-avatar ac-avatar--xs ${avatarCls(j.triggeredBy)}`}>{userInitial(j.triggeredBy)}</span>
                            <span className="ac-user-name">{userName(j.triggeredBy)}</span>
                          </span>
                        </td>
                        <td className="ac-td-num ac-xs">{j.triggeredAt}</td>
                        <td><span className="ac-tag ac-tag--sm ac-tag--outline">{MODE_LABEL[j.mode]}</span></td>
                        <td className="ac-xs ac-text-2">
                          {MODEL_NAME[j.modelId] ?? j.modelId}
                          <div className="ac-xs ac-muted">{AGENT_NAME[j.agentId] ?? j.agentId}</div>
                        </td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${JOB_STATUS_TONE[j.status]}`}>
                            <span className={j.status === 'generating' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                            {j.statusLabel}
                          </span>
                        </td>
                        <td>
                          <span className="ac-progress-row">
                            <span className="ac-progress ac-progress--sm ac-pt-progress">
                              <span className={`ac-progress-bar ${j.status === 'failed' ? 'ac-progress-bar--danger' : j.progress >= 100 ? 'ac-progress-bar--ok' : ''}`} style={{ width: `${j.progress}%` }} />
                            </span>
                            <span className="ac-progress-label">{j.progress}%</span>
                          </span>
                        </td>
                        <td className="ac-xs ac-text-2">
                          {FIDELITY_LABEL[j.fidelity]}
                          <div className="ac-xs ac-muted">{j.deviceTargets.map((d) => DEVICE_META[d].label.split(' ')[0]).join(' / ')}</div>
                        </td>
                        <td className="ac-td-num">{j.pageCountDone} / {j.pageCountPlanned}</td>
                        <td className="ac-td-num">{j.componentCount} · {j.interactionCount}</td>
                        <td className="ac-td-num ac-xs">
                          {dur(j.durationSec)} · ${fixed(j.tokenCost, 2)} · {j.retryCount} 次
                        </td>
                        <td className="ac-pt-cell-scope">
                          <span className="ac-mono ac-xs ac-brand-text">{j.axhubProjectId === '' ? '未写入' : j.axhubProjectId}</span>
                          <div className="ac-xs ac-muted">{clip(j.reviewStatus, 30)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Info size={14} />
                <span>
                  导出格式：PT-01 已导出 make / figma / html 三种格式，PT-03 导出 make / html，PT-04 导出 make / figma，
                  PT-02 与 PT-05 尚未产出导出包；完整导出配置见「版本与导出」标签页。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 2. 原型结构与预览 ================= */}
      {tab === 'canvas' && activePage && (
        <>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <LayoutGrid size={16} />
                原型结构与线框预览
              </span>
              <span className="ac-card-subtitle">左侧页面树按 pageType 分组；右侧按 layout 与 componentIds 绘制低保真线框骨架</span>
              <div className="ac-card-extra">
                <div className="ac-field ac-field--inline">
                  <span className="ac-field-label">任务</span>
                  <select className="ac-select ac-select--sm" value={canvasJobId}
                    onChange={(e) => {
                      setCanvasJobId(e.target.value);
                      const first = PROTOTYPE_PAGES.find((p) => p.jobId === e.target.value);
                      setActivePageId(first?.id ?? 'PTP-01');
                    }}>
                    {Array.from(new Set(PROTOTYPE_PAGES.map((p) => p.jobId))).map((jid) => {
                      const j = PROTOTYPE_JOBS.find((x) => x.id === jid);
                      return (
                        <option key={jid} value={jid}>
                          {jid} · {j?.name.slice(0, 20)}（{PROTOTYPE_PAGES.filter((p) => p.jobId === jid).length} 页）
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="ac-tabs ac-tabs--pill">
                  {(['desktop', 'tablet', 'mobile'] as ('desktop' | 'tablet' | 'mobile')[]).map((d) => {
                    const Icon = DEVICE_META[d].icon;
                    return (
                      <button key={d} type="button" className={`ac-tab ${device === d ? 'ac-tab--active' : ''}`} onClick={() => setDevice(d)} title={DEVICE_META[d].label}>
                        <Icon size={13} />
                        {DEVICE_META[d].label.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="ac-card-body" data-annotation-id="ai-sdlc-prototype-canvas">
              <div className="ac-pt-canvas">
                <div className="ac-pt-canvas-tree">
                  <PageTree pages={canvasPages} activeId={activePage.id} onPick={(p) => setActivePageId(p.id)} />
                  <div className="ac-pt-tree-legend">
                    <span><i style={{ background: TONE_HEX.ok }} />已批准</span>
                    <span><i style={{ background: TONE_HEX.ai }} />已生成</span>
                    <span><i style={{ background: TONE_HEX.brand }} />生成中</span>
                    <span><i style={{ background: TONE_HEX.neutral }} />草稿</span>
                    <span className="ac-pt-tree-legend-warn">黄底 = AI 置信度 &lt; 75%，需人工确认</span>
                  </div>
                </div>

                <div className="ac-pt-canvas-preview">
                  <div className="ac-pt-preview-head">
                    <span className="ac-pt-preview-title">{activePage.name}</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${PAGE_STATUS[activePage.status].tone}`}>{PAGE_STATUS[activePage.status].label}</span>
                    <span className="ac-tag ac-tag--sm ac-tag--outline">{LAYOUT_LABEL[activePage.layout]}</span>
                    <span className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{activePage.route}</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${activePage.aiConfidencePct < 75 ? 'warn' : 'ok'}`}>
                      AI 置信度 {activePage.aiConfidencePct}%
                    </span>
                    <span className="ac-tag ac-tag--sm ac-tag--ai ac-ml-auto">
                      <MousePointerClick size={11} />
                      {DEVICE_META[device].label} 预览
                    </span>
                  </div>
                  <Wireframe page={activePage} device={device} />
                </div>
              </div>

              {activePage.aiConfidencePct < 75 && (
                <div className="ac-hint ac-hint--warn ac-mt-3">
                  <AlertTriangle size={14} />
                  <span>
                    <b>需人工确认</b>：本页 AI 置信度 {activePage.aiConfidencePct}%（阈值 75%）。
                    {activePage.id === 'PTP-10' && ' 具体待确认点：axhub-lib 缺少「四维规则编辑器」变体，AI 已暂停派生自定义组件，改为复用 PTC-15 标签组 + PTC-14 树形结构组合，且互斥语义需与 ac-promo-engine 的 exclusiveGroup 对齐（PTR-11）。'}
                    {activePage.id === 'PTP-11' && ' 具体待确认点：子订单退款的优惠退回依赖 API-08 的 rollbackToken，而「先核销后退款」时序约束（PTR-03）需在退款表单上显式表达。'}
                    {activePage.id === 'PTP-12' && ' 具体待确认点：库存中心 /warehouse/api/v1/stock/deduct 仅有 Mock（MK-01 / MK-02），真实分配算法的看板列划分尚未冻结。'}
                    {activePage.id === 'PTP-13' && ' 具体待确认点：SPLIT_RULE_MISSING 与 WMS_PROTOCOL_UNFROZEN 两类异常的分色与推荐处理动作待测试确认（PTR-12）。'}
                    {activePage.id === 'PTP-14' && ' 具体待确认点：运费重算服务 /freight/api/v1/recalc 的 Mock 尚未覆盖，合单后的运费差额无法在原型内演示。'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="ac-grid-1-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Info size={16} />
                  页面属性
                </span>
                <span className="ac-card-subtitle">{activePage.id}</span>
              </div>
              <div className="ac-card-body">
                <dl className="ac-kv ac-pt-kv">
                  <dt>页面类型</dt>
                  <dd><span className="ac-tag ac-tag--sm ac-tag--brand">{activePage.pageType}</span></dd>
                  <dt>布局</dt>
                  <dd>{LAYOUT_LABEL[activePage.layout]}<span className="ac-xs ac-muted ac-mono">（{activePage.layout}）</span></dd>
                  <dt>优先级</dt>
                  <dd><span className={`ac-tag ac-tag--sm ac-tag--${activePage.priority === 'P0' ? 'danger' : activePage.priority === 'P1' ? 'warn' : 'neutral'}`}>{activePage.priority}</span></dd>
                  <dt>状态</dt>
                  <dd><span className={`ac-tag ac-tag--sm ac-tag--${PAGE_STATUS[activePage.status].tone}`}>{PAGE_STATUS[activePage.status].label}</span></dd>
                  <dt>AI 置信度</dt>
                  <dd>
                    <span className="ac-progress-row">
                      <span className="ac-progress ac-pt-progress">
                        <span className={`ac-progress-bar ${activePage.aiConfidencePct < 75 ? 'ac-progress-bar--warn' : 'ac-progress-bar--ok'}`} style={{ width: `${activePage.aiConfidencePct}%` }} />
                      </span>
                      <span className="ac-progress-label">{activePage.aiConfidencePct}%</span>
                    </span>
                  </dd>
                  <dt>人工干预</dt>
                  <dd>
                    {activePage.humanEdited ? `已编辑 ${activePage.editCount} 次` : '未编辑（AI 产物原样保留）'}
                  </dd>
                  <dt>批注数</dt>
                  <dd className="ac-tnum">
                    {activePage.annotationIds.length} 条
                    {activePage.annotationIds.length > 0 && (
                      <span className="ac-xs ac-muted ac-mono">（{activePage.annotationIds.join('、')}）</span>
                    )}
                  </dd>
                  <dt>关联需求</dt>
                  <dd>
                    <span className="ac-row ac-gap-1 ac-wrap">
                      {activePage.requirementIds.map((rid) => (
                        <button key={rid} type="button" className="ac-tag ac-tag--sm ac-tag--brand" title={REQUIREMENT_MAP[rid]?.title} onClick={() => jump('requirement')}>
                          {rid}<ExternalLink size={10} />
                        </button>
                      ))}
                    </span>
                  </dd>
                  <dt>组件</dt>
                  <dd>
                    <span className="ac-row ac-gap-1 ac-wrap">
                      {activePage.componentIds.map((cid) => (
                        <span key={cid} className={`ac-tag ac-tag--sm ac-tag--${COMP_MAP[cid]?.aiGenerated ? 'ai' : 'outline'}`} title={COMP_MAP[cid]?.name}>
                          {COMP_MAP[cid]?.name ?? cid}
                        </span>
                      ))}
                    </span>
                  </dd>
                </dl>
                <div className="ac-section-title">数据绑定</div>
                <ul className="ac-pt-bind-list">
                  {activePage.dataBindings.map((b) => (
                    <li key={b}>
                      <Network size={12} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Route size={16} />
                  交互流有向图
                </span>
                <span className="ac-card-subtitle">trigger → action → targetPageId；实线靛蓝为跨页跳转，虚线灰为页内动作</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">
                    {activePage.interactions.length} 条交互 · 跨页{' '}
                    {activePage.interactions.filter((i) => i.targetPageId !== null).length}
                  </span>
                </div>
              </div>
              <div className="ac-card-body">
                {activePage.interactions.length === 0 ? (
                  <div className="ac-empty ac-empty--sm">
                    <span className="ac-empty-icon"><MousePointerClick size={22} /></span>
                    <div className="ac-empty-title">本页暂无交互流</div>
                    <div className="ac-empty-desc">PT-05 的交互流步骤失败（PRD 缺少验收标准），其余页面均已在步骤 5 生成交互流。</div>
                  </div>
                ) : (
                  <InteractionFlow page={activePage} pages={PROTOTYPE_PAGES} />
                )}
              </div>
              <div className="ac-card-foot">
                <div className="ac-hint ac-hint--ai">
                  <Sparkles size={14} />
                  <span>
                    AI 置信度与人工干预对比：{canvasPages.length} 个页面中，
                    已人工编辑 {canvasPages.filter((p) => p.humanEdited).length} 个（累计 {canvasPages.reduce((s, p) => s + p.editCount, 0)} 次），
                    平均置信度 {Math.round(canvasPages.reduce((s, p) => s + p.aiConfidencePct, 0) / canvasPages.length)}%；
                    全平台置信度 &lt; 75% 的页面共 {lowConfPages.length} 个（{lowConfPages.map((p) => `${p.id} ${p.aiConfidencePct}%`).join('、')}），
                    这些页面在版本锁定前必须由对应角色人工确认。
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 3. 组件与批注 ================= */}
      {tab === 'components' && (
        <>
          {openBlockers.length > 0 && (
            <div className="ac-hint ac-hint--danger">
              <AlertOctagon size={14} />
              <span>
                <b>阻断级批注 {openBlockers.length} 条未闭环</b>：
                {openBlockers.map((r) => `${r.id}（${r.anchorText}）`).join('；')}。
                阻断级批注会阻断 AIF-01 步骤 6「AI 回应批注并产出新版本」，72 小时未闭环将直接阻断 G1 需求门禁签署；
                已闭环的阻断项（如 PTR-03 退款时序、PTR-08 导出二次授权字段）不再计入。
              </span>
            </div>
          )}
          {openBlockers.length === 0 && (
            <div className="ac-hint ac-hint--ok">
              <ShieldAlert size={14} />
              <span>全部阻断级批注已闭环，G1 需求门禁的原型评审证据齐备（{blockers.length} 条阻断项均已产生版本修订）。</span>
            </div>
          )}

          <div className="ac-card" data-annotation-id="ai-sdlc-prototype-reviews">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Component size={16} />
                原型组件库（13 列）
              </span>
              <span className="ac-card-subtitle">
                axhub-lib {AXHUB.version.split(' ')[1]} 企业组件库 + 自定义组件 + AI 派生组件；pageIds 与页面 componentIds 双向一致
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--brand">库内 {PROTOTYPE_COMPONENTS.filter((c) => c.source === 'axhub-lib').length}</span>
                <span className="ac-tag ac-tag--warn">自定义 {PROTOTYPE_COMPONENTS.filter((c) => c.source === 'custom').length}</span>
                <span className="ac-tag ac-tag--ai">AI 派生 {PROTOTYPE_COMPONENTS.filter((c) => c.source === 'ai-generated').length}</span>
                <span className={`ac-tag ac-tag--${PROTOTYPE_COMPONENTS.every((c) => c.accessible) ? 'ok' : 'warn'}`}>
                  可访问性 {PROTOTYPE_COMPONENTS.filter((c) => c.accessible).length} / {PROTOTYPE_COMPONENTS.length}
                </span>
              </div>
            </div>
            <div className="ac-filter-bar">
              <Search size={14} className="ac-muted" />
              <input className="ac-input ac-input--sm ac-pt-filter-input" placeholder="搜索组件名 / 分类 / 属性" value={fKw} onChange={(e) => setFKw(e.target.value)} />
              <div className="ac-tabs ac-tabs--pill">
                <button type="button" className={`ac-tab ${compSource === 'all' ? 'ac-tab--active' : ''}`} onClick={() => setCompSource('all')}>
                  全部<span className="ac-tab-count">{PROTOTYPE_COMPONENTS.length}</span>
                </button>
                {(['axhub-lib', 'custom', 'ai-generated'] as PrototypeComponentDef['source'][]).map((s) => (
                  <button key={s} type="button" className={`ac-tab ${compSource === s ? 'ac-tab--active' : ''}`} onClick={() => setCompSource(s)}>
                    {COMP_SOURCE[s].label}<span className="ac-tab-count">{PROTOTYPE_COMPONENTS.filter((c) => c.source === s).length}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              {filteredComponents.length === 0 ? (
                <div className="ac-empty">
                  <span className="ac-empty-icon"><Search size={22} /></span>
                  <div className="ac-empty-title">没有匹配的组件</div>
                  <div className="ac-empty-desc">18 个组件中无匹配项，可清空关键字或切换来源筛选。</div>
                </div>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm ac-table--bordered">
                    <thead>
                      <tr>
                        <th>组件</th>
                        <th>分类</th>
                        <th>来源</th>
                        <th>AxHub 库版本</th>
                        <th className="ac-td-right">变体数</th>
                        <th>关键属性</th>
                        <th className="ac-td-right">被引用页面</th>
                        <th>引用页面</th>
                        <th className="ac-td-center">AI 生成</th>
                        <th className="ac-td-center">可访问性</th>
                        <th>a11y 说明</th>
                        <th className="ac-td-right">复用度</th>
                        <th>线框预览</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComponents.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="ac-pt-cell-name">{c.name}</div>
                            <span className="ac-xs ac-muted ac-mono">{c.id}</span>
                          </td>
                          <td><span className="ac-tag ac-tag--sm ac-tag--outline">{c.category}</span></td>
                          <td><span className={`ac-tag ac-tag--sm ac-tag--${COMP_SOURCE[c.source].tone}`}>{COMP_SOURCE[c.source].label}</span></td>
                          <td className="ac-mono ac-xs">{c.axhubLibVersion === '' ? '—' : c.axhubLibVersion}</td>
                          <td className="ac-td-num">{c.variantCount}</td>
                          <td>
                            <span className="ac-row ac-gap-1 ac-wrap">
                              {c.propSchema.map((p) => <span key={p} className="ac-tag ac-tag--sm ac-tag--neutral ac-mono">{p}</span>)}
                            </span>
                          </td>
                          <td className="ac-td-num">{c.reusedAcrossPages}</td>
                          <td className="ac-xs ac-muted ac-mono">{clip(c.pageIds.join(', '), 34)}</td>
                          <td className="ac-td-center">
                            {c.aiGenerated ? <span className="ac-tag ac-tag--sm ac-tag--ai">是</span> : <span className="ac-xs ac-muted">否</span>}
                          </td>
                          <td className="ac-td-center">
                            {c.accessible
                              ? <span className="ac-tag ac-tag--sm ac-tag--ok"><CheckCircle2 size={10} />达标</span>
                              : <span className="ac-tag ac-tag--sm ac-tag--warn"><AlertTriangle size={10} />未达标</span>}
                          </td>
                          <td className="ac-pt-cell-scope">{clip(c.a11yNote, 40)}</td>
                          <td className="ac-td-num">
                            <span className="ac-pt-reuse-bar">
                              <i style={{ width: `${(c.reusedAcrossPages / 14) * 100}%`, background: TONE_HEX[c.tone] }} />
                            </span>
                            {c.reusedAcrossPages}
                          </td>
                          <td>
                            <span className="ac-pt-thumb"><WireShape comp={c} /></span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><Activity size={16} />组件跨页复用度</span>
                <span className="ac-card-subtitle">按被引用页面数降序；AI 派生组件以 72% 不透明度区分</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">批注锚点 PTC-18 被全部 14 页引用</span>
                </div>
              </div>
              <div className="ac-card-body">
                <ReuseBars items={[...PROTOTYPE_COMPONENTS].sort((a, b) => b.reusedAcrossPages - a.reusedAcrossPages)} />
              </div>
            </div>
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><MessageSquareWarning size={16} />批注分布</span>
                <span className="ac-card-subtitle">严重度 × 处理状态堆叠</span>
              </div>
              <div className="ac-card-body">
                <ReviewStackBars items={PROTOTYPE_REVIEWS} />
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <MessageSquare size={16} />
                批注评审（{PROTOTYPE_REVIEWS.length} 条）
              </span>
              <span className="ac-card-subtitle">按锚定页面分组；点击任意批注查看 AI 回应、已应用的修订与前后对比</span>
              <div className="ac-card-extra">
                <div className="ac-tabs ac-tabs--pill">
                  {[
                    { id: 'all', label: '全部' },
                    { id: 'blocker', label: '阻断级' },
                    { id: 'open', label: '未闭环' },
                    { id: '建议', label: '建议' },
                    { id: '问题', label: '问题' },
                    { id: '确认', label: '确认' },
                  ].map((o) => (
                    <button key={o.id} type="button" className={`ac-tab ${reviewFilter === o.id ? 'ac-tab--active' : ''}`} onClick={() => setReviewFilter(o.id)}>
                      {o.label}
                      <span className="ac-tab-count">
                        {o.id === 'all' ? PROTOTYPE_REVIEWS.length
                          : o.id === 'blocker' ? blockers.length
                            : o.id === 'open' ? PROTOTYPE_REVIEWS.filter((r) => r.status === 'open' || r.status === 'pending-ai').length
                              : PROTOTYPE_REVIEWS.filter((r) => r.type === o.id).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="ac-card-body">
              {Object.keys(reviewsByPage).filter((pid) => (reviewFilter === 'all' ? true : reviewsByPage[pid].some((r) => filteredReviews.indexOf(r) >= 0))).length === 0 ? (
                <div className="ac-empty ac-empty--sm">
                  <span className="ac-empty-icon"><Filter size={22} /></span>
                  <div className="ac-empty-title">当前筛选下没有批注</div>
                  <div className="ac-empty-desc">可切换到「全部」查看 12 条批注的完整评审记录。</div>
                </div>
              ) : (
                <div className="ac-pt-review-groups">
                  {Object.keys(reviewsByPage).map((pid) => {
                    const list = reviewsByPage[pid].filter((r) => filteredReviews.indexOf(r) >= 0);
                    if (list.length === 0) return null;
                    const pg = PROTOTYPE_PAGES.find((p) => p.id === pid);
                    return (
                      <div className="ac-pt-review-group" key={pid}>
                        <div className="ac-pt-review-group-head">
                          <span className="ac-mono ac-xs ac-brand-text">{pid}</span>
                          <span className="ac-pt-review-group-name">{pg?.name ?? pid}</span>
                          <span className="ac-tag ac-tag--sm ac-tag--outline">{list.length} 条</span>
                          {pg && <span className={`ac-tag ac-tag--sm ac-tag--${PAGE_STATUS[pg.status].tone}`}>{PAGE_STATUS[pg.status].label}</span>}
                          <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => { setTab('canvas'); setActivePageId(pid); }}>
                            <Eye size={12} />
                            在线框中查看
                          </button>
                        </div>
                        {list.map((r) => {
                          const st = reviewOverrides[r.id];
                          return (
                            <div className={`ac-pt-review ${r.severity === 'blocker' ? 'ac-pt-review--blocker' : ''} ${st ? 'ac-pt-review--done' : ''}`} key={r.id}
                              onClick={() => setDrawerReview(r)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') setDrawerReview(r);
                              }}
                              role="button" tabIndex={0}>
                              <span className={`ac-pt-review-sev ac-pt-review-sev--${r.severity}`}>{REVIEW_SEVERITY[r.severity].label}</span>
                              <div className="ac-flex-1">
                                <div className="ac-row ac-gap-2 ac-wrap">
                                  <span className={`ac-tag ac-tag--sm ac-tag--${r.type === '阻断' ? 'danger' : r.type === '问题' ? 'warn' : r.type === '确认' ? 'info' : 'ok'}`}>{r.type}</span>
                                  <span className="ac-mono ac-xs ac-muted">{r.id}</span>
                                  <span className="ac-pt-review-anchor">{r.anchorText}</span>
                                  <span className={`ac-tag ac-tag--sm ac-tag--${st ? 'ok' : REVIEW_STATUS[r.status].tone}`}>
                                    {st === 'resolved' ? '已标记解决' : st === 'transferred' ? '已转交' : st === 'rejected' ? '已驳回' : REVIEW_STATUS[r.status].label}
                                  </span>
                                </div>
                                <div className="ac-pt-review-comment">{clip(r.comment, 108)}</div>
                                <div className="ac-row ac-gap-2 ac-wrap ac-mt-1">
                                  <span className="ac-user">
                                    <span className={`ac-avatar ac-avatar--xs ${avatarCls(r.reviewerId)}`}>{userInitial(r.reviewerId)}</span>
                                    <span className="ac-user-name">{userName(r.reviewerId)}</span>
                                  </span>
                                  <span className="ac-xs ac-muted ac-mono">{r.createdAt}</span>
                                  {r.componentId && <span className="ac-tag ac-tag--sm ac-tag--outline">{COMP_MAP[r.componentId]?.name}</span>}
                                  <span className="ac-xs ac-ai-text ac-ml-auto">
                                    <Sparkles size={11} />
                                    AI 已回应
                                    <ChevronRight size={11} />
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= 4. 版本与导出 ================= */}
      {tab === 'versions' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-prototype-versions">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <History size={16} />
                原型版本时间线
              </span>
              <span className="ac-card-subtitle">v0.1 → v1.2 共 6 个快照；星标节点为锁定基线，节点下方标注创建方式（AI / 人工）</span>
              <div className="ac-card-extra">
                <div className="ac-field ac-field--inline">
                  <span className="ac-field-label">任务</span>
                  <select className="ac-select ac-select--sm" value={verJobId}
                    onChange={(e) => {
                      setVerJobId(e.target.value);
                      const vs = PROTOTYPE_VERSIONS.filter((v) => v.jobId === e.target.value);
                      setActiveVerId(vs[vs.length - 1]?.id ?? 'PTV-01');
                    }}>
                    {Array.from(new Set(PROTOTYPE_VERSIONS.map((v) => v.jobId))).map((jid) => (
                      <option key={jid} value={jid}>
                        {jid}（{PROTOTYPE_VERSIONS.filter((v) => v.jobId === jid).length} 个版本）
                      </option>
                    ))}
                  </select>
                </div>
                <span className="ac-tag ac-tag--ok">
                  <Star size={12} />
                  基线 {PROTOTYPE_VERSIONS.filter((v) => v.isBaseline).map((v) => `${v.jobId} ${v.version}`).join('、')}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <VersionTimeline versions={jobVersions} activeId={activeVerId} onPick={(v) => setActiveVerId(v.id)} />
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>快照编号</th>
                      <th>版本号</th>
                      <th>所属任务</th>
                      <th className="ac-td-num">创建时间</th>
                      <th>创建者 / 方式</th>
                      <th>变更摘要</th>
                      <th className="ac-td-right">页数</th>
                      <th className="ac-td-right">组件数</th>
                      <th className="ac-td-center">是否基线</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobVersions.map((v) => (
                      <tr key={v.id} className={`ac-pt-row ${v.id === activeVerId ? 'ac-table-row--selected' : ''}`} onClick={() => setActiveVerId(v.id)}>
                        <td className="ac-mono ac-xs ac-brand-text">{v.id}</td>
                        <td className="ac-pt-cell-name">{v.version}</td>
                        <td className="ac-mono ac-xs">{v.jobId}</td>
                        <td className="ac-td-num ac-xs">{v.createdAt}</td>
                        <td>
                          {v.createdBy === 'ai' ? (
                            <span className="ac-tag ac-tag--sm ac-tag--ai"><Bot size={10} />AI 自动</span>
                          ) : (
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ${avatarCls(v.createdBy)}`}>{userInitial(v.createdBy)}</span>
                              <span className="ac-user-name">{userName(v.createdBy)}</span>
                            </span>
                          )}
                        </td>
                        <td className="ac-pt-cell-scope">{clip(v.changeSummary, 56)}</td>
                        <td className="ac-td-num">{v.pageCount}</td>
                        <td className="ac-td-num">{v.componentCount}</td>
                        <td className="ac-td-center">
                          {v.isBaseline ? <span className="ac-tag ac-tag--sm ac-tag--ok"><Star size={10} />基线</span> : <span className="ac-xs ac-muted">—</span>}
                        </td>
                        <td className="ac-td-right">
                          <a className="ac-btn ac-btn--text ac-btn--sm" href={v.snapshotUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            快照<ExternalLink size={11} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {activeVer && (
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <GitCompareArrows size={16} />
                  {activeVer.version} 与上一版本的差异
                </span>
                <span className="ac-card-subtitle">diffFromPrev 四组清单：新增页面 / 移除页面 / 修改页面 / 新增组件</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline ac-mono">{activeVer.id}</span>
                  <span className="ac-tag ac-tag--ok">+{activeVer.diffFromPrev.addedPages.length} 页</span>
                  <span className="ac-tag ac-tag--danger">-{activeVer.diffFromPrev.removedPages.length} 页</span>
                  <span className="ac-tag ac-tag--info">~{activeVer.diffFromPrev.modifiedPages.length} 页</span>
                  <span className="ac-tag ac-tag--ai">+{activeVer.diffFromPrev.addedComponents.length} 组件</span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-pt-diff-grid">
                  {[
                    { key: 'addedPages' as const, label: '新增页面', sign: '+', cls: 'ac-diff-row--add' },
                    { key: 'removedPages' as const, label: '移除页面', sign: '-', cls: 'ac-diff-row--del' },
                    { key: 'modifiedPages' as const, label: '修改页面', sign: '~', cls: 'ac-diff-row--ctx' },
                    { key: 'addedComponents' as const, label: '新增组件', sign: '+', cls: 'ac-diff-row--add' },
                  ].map((grp) => {
                    const ids = activeVer.diffFromPrev[grp.key];
                    return (
                      <div className="ac-pt-diff-col" key={grp.key}>
                        <div className="ac-pt-diff-col-head">
                          <span className={`ac-pt-diff-sign ${grp.cls}`}>{grp.sign}</span>
                          {grp.label}（{ids.length}）
                        </div>
                        {ids.length === 0 ? (
                          <div className="ac-xs ac-muted ac-pt-diff-empty">无变更</div>
                        ) : (
                          ids.map((id) => {
                            const isComp = grp.key === 'addedComponents';
                            const name = isComp ? COMP_MAP[id]?.name : PROTOTYPE_PAGES.find((p) => p.id === id)?.name;
                            return (
                              <div className={`ac-diff-row ${grp.cls} ac-pt-diff-item`} key={id}>
                                <span className="ac-diff-sign">{grp.sign}</span>
                                <span className="ac-mono ac-xs">{id}</span>
                                <span className="ac-pt-diff-item-title">{name ?? id}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="ac-hint ac-mt-3">
                  <Info size={14} />
                  <span className="ac-lh">{activeVer.changeSummary}</span>
                </div>
              </div>
            </div>
          )}

          <div className="ac-section-title">导出交付</div>
          <div className="ac-grid-4">
            {(['make', 'figma', 'html', 'sketch'] as ('make' | 'figma' | 'html' | 'sketch')[]).map((fmt) => {
              const meta = EXPORT_META[fmt];
              const Icon = meta.icon;
              const st = exportState[fmt] ?? 'idle';
              const job = PROTOTYPE_JOBS.find((j) => j.id === verJobId);
              const planned = job?.exportFormats.indexOf(fmt) ?? -1;
              return (
                <div className={`ac-card ac-pt-export ${st === 'done' ? 'ac-pt-export--done' : ''}`} key={fmt}>
                  <div className="ac-card-head">
                    <span className="ac-card-title">
                      <Icon size={16} />
                      {meta.label}
                    </span>
                    <div className="ac-card-extra">
                      <span className={`ac-tag ac-tag--sm ac-tag--${st === 'done' ? 'ok' : st === 'exporting' ? 'ai' : 'outline'}`}>
                        {st === 'done' ? '已导出' : st === 'exporting' ? '导出中' : planned >= 0 ? '任务已配置' : '未配置'}
                      </span>
                    </div>
                  </div>
                  <div className="ac-card-body">
                    <div className="ac-pt-export-scope">{meta.scope}</div>
                    <ul className="ac-pt-export-meta">
                      <li><Tag size={11} />含批注锚点：{meta.withComments ? '是（随 data-annotation-id 一并导出）' : '否'}</li>
                      <li><MousePointerClick size={11} />含交互流：{meta.withInteractions ? '是（可点击走查）' : '否（仅视觉层）'}</li>
                      <li><Package size={11} />预计体积：{fixed(meta.sizeMb, 1)} MB</li>
                      <li><Boxes size={11} />范围：{jobVersions[jobVersions.length - 1]?.pageCount ?? 0} 页 / {jobVersions[jobVersions.length - 1]?.componentCount ?? 0} 组件</li>
                    </ul>
                    {st === 'exporting' && (
                      <div className="ac-progress ac-mt-3"><div className="ac-progress-bar ac-progress-bar--striped" style={{ width: '72%' }} /></div>
                    )}
                    {st === 'done' && (
                      <div className="ac-hint ac-hint--ok ac-mt-3">
                        <CheckCircle2 size={13} />
                        <span className="ac-mono ac-xs">/export/{verJobId}/{jobVersions[jobVersions.length - 1]?.version}/{fmt}-bundle.zip</span>
                      </div>
                    )}
                  </div>
                  <div className="ac-card-foot">
                    <button type="button" className={`ac-btn ac-btn--sm ${st === 'idle' ? 'ac-btn--primary' : 'ac-btn--ghost'} ${st !== 'idle' ? 'ac-btn--disabled' : ''}`}
                      disabled={st !== 'idle'} onClick={() => setExportTarget(fmt)}>
                      <Download size={13} />
                      {st === 'done' ? '已导出' : st === 'exporting' ? '导出中…' : `导出为 ${meta.label}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ac-hint ac-hint--ai">
            <Sparkles size={14} />
            <span>
              <b>导出到 Make 的说明</b>：Make 导出包会完整保留每个界面元素的 <span className="ac-mono">data-annotation-id</span> 批注锚点，
              在 AxHub Make 管理端打开后可以继续多人批注协作、追加评审意见并生成新版本 —— 这正是本原型自身所使用的批注机制：
              你此刻在页面右侧看到的批注面板，就是通过同一套锚点定位到具体 DOM 元素的。
              导出包同时会挂载为 G1 需求门禁与 G2 架构门禁的评审证据，由 ag-pm 在 AIF-01 步骤 8 归档至 WeKnora。
            </span>
          </div>
        </>
      )}

      {/* ================= 5. AxHub 能力与自动化编排 ================= */}
      {tab === 'capability' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-prototype-automation">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Blocks size={16} />
                AxHub Make 集成信息
              </span>
              <span className="ac-card-subtitle">{AXHUB.vendor}</span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${AXHUB.status === 'connected' ? 'ok' : 'neutral'}`}>
                  <span className={AXHUB.status === 'connected' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                  {AXHUB.status === 'connected' ? '已连接' : AXHUB.status === 'paused' ? '已暂停' : '未接入'}
                </span>
                <a className="ac-btn ac-btn--ghost ac-btn--sm" href={AXHUB.docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} />
                  OpenAPI 文档
                </a>
              </div>
            </div>
            <div className="ac-card-body">
              <dl className="ac-kv ac-pt-kv-2">
                <dt>提供方 id</dt><dd className="ac-mono ac-brand-text">{AXHUB.id}</dd>
                <dt>能力域</dt><dd><span className="ac-tag ac-tag--sm ac-tag--brand">prototype · 原型协作</span></dd>
                <dt>对接版本</dt><dd className="ac-mono">{AXHUB.version}</dd>
                <dt>endpoint</dt><dd className="ac-mono ac-xs">{AXHUB.endpoint}</dd>
                <dt>协议 / 鉴权</dt><dd>{AXHUB.protocol} · {AXHUB.authMode}</dd>
                <dt>接入时间</dt><dd className="ac-mono">{AXHUB.connectedAt}</dd>
                <dt>SLA / 时延 / 调用量</dt>
                <dd className="ac-tnum">
                  可用率 {fixed(AXHUB.slaUptimePct, 1)}% · 平均时延 {num(AXHUB.avgLatencyMs)} ms · 日调用 {num(AXHUB.dailyCallCount)} 次
                </dd>
                <dt>挂载 SDLC 环节</dt>
                <dd>
                  <span className="ac-row ac-gap-1 ac-wrap">
                    {AXHUB.sdStageIds.map((sid) => {
                      const st = SDLC_STAGES.find((s) => s.id === sid);
                      return (
                        <button key={sid} type="button" className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[st?.tone ?? 'neutral']}`} onClick={() => jump(sid === 'st-req' ? 'requirement' : 'design')}>
                          {st?.code} {st?.name}<ExternalLink size={10} />
                        </button>
                      );
                    })}
                  </span>
                </dd>
                <dt>调用 Agent</dt>
                <dd>
                  <span className="ac-row ac-gap-1 ac-wrap">
                    {AXHUB.agentIds.map((aid) => {
                      const ag = agents.find((a) => a.id === aid);
                      return (
                        <span key={aid} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[ag?.tone ?? 'ai']}`}>
                          <BrainCircuit size={10} />
                          {AGENT_NAME[aid] ?? aid}（{aid}）· {ag?.modelName}
                        </span>
                      );
                    })}
                  </span>
                </dd>
                <dt>平台能力名</dt>
                <dd>
                  <span className="ac-row ac-gap-1 ac-wrap">
                    {AXHUB.capabilities.map((c) => <span key={c} className="ac-tag ac-tag--sm ac-tag--outline">{c}</span>)}
                  </span>
                </dd>
              </dl>
              <div className="ac-hint ac-hint--ai">
                <Sparkles size={14} />
                <span className="ac-lh">{AXHUB.note}</span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AxHub 能力清单（AXHUB-01 ~ AXHUB-06）</div>
          <div className="ac-grid-3">
            {AXHUB_CAPS.map((c) => (
              <div className="ac-card ac-pt-cap" key={c.id}>
                <div className="ac-card-head">
                  <span className="ac-card-title">
                    <CircleDot size={15} />
                    {c.name}
                  </span>
                  <div className="ac-card-extra">
                    <span className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{c.id}</span>
                  </div>
                </div>
                <div className="ac-card-body">
                  <div className="ac-pt-cap-desc">{c.desc}</div>
                  <div className="ac-pt-io-block">
                    <div className="ac-pt-io-label"><ArrowRight size={11} />输入产物</div>
                    <div className="ac-row ac-gap-1 ac-wrap">
                      {c.inputArtifacts.map((a) => <span key={a} className="ac-tag ac-tag--sm ac-tag--outline">{a}</span>)}
                    </div>
                  </div>
                  <div className="ac-pt-io-block">
                    <div className="ac-pt-io-label"><ArrowUpRight size={11} />输出产物</div>
                    <div className="ac-row ac-gap-1 ac-wrap">
                      {c.outputArtifacts.map((a) => <span key={a} className="ac-tag ac-tag--sm ac-tag--ai ac-mono">{a}</span>)}
                    </div>
                  </div>
                  <div className="ac-pt-cap-foot">
                    <span className={`ac-tag ac-tag--sm ac-tag--${AUTOMATION_META[c.automationLevel].tone}`}>{AUTOMATION_META[c.automationLevel].label}</span>
                    <span className="ac-xs ac-muted"><Cpu size={11} />{AGENT_NAME[c.aiAgentId] ?? c.aiAgentId}</span>
                    <span className="ac-xs ac-muted"><Timer size={11} />{dur(c.avgDurationSec)}</span>
                    <span className="ac-xs ac-ok-text ac-ml-auto"><Target size={11} />采纳率 {c.adoptionRatePct}%</span>
                  </div>
                  <div className="ac-pt-cap-equiv">
                    <Save size={11} />
                    平台落地：{c.platformEquivalent}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="ac-section-title">端到端自动化编排</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Workflow size={16} />
                {PROTO_FLOW.name}
              </span>
              <span className="ac-card-subtitle">
                触发事件 <span className="ac-mono">{PROTO_FLOW.triggerEvent}</span>（{TRIGGER_TYPE_LABEL[PROTO_FLOW.triggerType]}）·{' '}
                {PROTO_FLOW.steps.length} 步 · 人工检查点 {PROTO_FLOW.humanCheckpoints.length} 个
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">自动化率 {PROTO_FLOW.autoRatePct}%</span>
                <span className="ac-tag ac-tag--outline">端到端 {PROTO_FLOW.avgEndToEndMin} 分钟</span>
                <span className={`ac-tag ac-tag--${FLOW_RUN_STATUS[PROTO_FLOW.lastRunStatus].tone}`}>
                  最近 {PROTO_FLOW.lastRunAt} · {FLOW_RUN_STATUS[PROTO_FLOW.lastRunStatus].label}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-flow">
                {PROTO_FLOW.steps.map((s, i) => {
                  const cp = PROTO_FLOW.humanCheckpoints.indexOf(s.name) >= 0;
                  const provider = s.toolProviderId === '' ? null : AI_TOOL_PROVIDERS.find((p) => p.id === s.toolProviderId);
                  return (
                    <React.Fragment key={`${s.order}`}>
                      {i > 0 && <span className={`ac-flow-arrow ${s.executor === 'ai' ? 'ac-flow-arrow--ok' : ''}`}><ArrowRight size={14} /></span>}
                      <div className={`ac-flow-node ${cp ? 'ac-flow-node--gate' : s.executor === 'ai' ? 'ac-flow-node--ok' : 'ac-flow-node--running'} ac-pt-flow-node`}>
                        <div className="ac-flow-node-head">
                          <span className="ac-flow-node-idx">{s.order}</span>
                          <span className="ac-flow-node-title">{clip(s.name, 14)}</span>
                          <span className="ac-flow-node-icon">
                            {cp ? <UserCheck size={13} /> : s.executor === 'ai' ? <Bot size={13} /> : <Users size={13} />}
                          </span>
                        </div>
                        <div className="ac-flow-node-meta">
                          {EXECUTOR_META[s.executor].label}
                          {s.agentId !== '' && ` · ${AGENT_NAME[s.agentId] ?? s.agentId}`}
                        </div>
                        <div className="ac-flow-node-meta">{provider ? provider.name : '平台自有集成'}</div>
                        <div className="ac-pt-flow-io">入 {clip(s.inputFrom, 20)}</div>
                        <div className="ac-pt-flow-io">出 {clip(s.outputTo, 20)}</div>
                        <div className="ac-pt-flow-io ac-pt-flow-io--fb">降级 {clip(s.fallbackAction, 24)}</div>
                        <div className="ac-pt-flow-dur"><Clock size={11} />{dur(s.durationSec)}</div>
                        {cp && <span className="ac-pt-flow-cp">人工检查点</span>}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint ac-hint--ai">
                <Sparkles size={14} />
                <span>
                  全流程 {PROTO_FLOW.steps.length} 步中 {PROTO_FLOW.steps.filter((s) => s.executor === 'ai').length} 步由 AI 独立完成、
                  {PROTO_FLOW.steps.filter((s) => s.executor === 'human').length} 步纯人工、
                  {PROTO_FLOW.steps.filter((s) => s.executor === 'ai+human').length} 步人机协同，
                  自动化率 {PROTO_FLOW.autoRatePct}%（按步骤耗时加权）；
                  两个人工检查点是「多角色批注评审（6 人）」与「需求确认并导出交付包」，
                  48 小时未评审会自动升级至研发总监，72 小时未闭环阻断 G1 签署。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">全流程 AI 自动化编排总览</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Network size={16} />
                6 条端到端编排流
              </span>
              <span className="ac-card-subtitle">串起「需求 → 原型 → 编码 → 接口测试 → 门禁 → 观测 → 知识归档」全链路，每条流末步均以 WeKnora 归档收尾</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">加权自动化率 {fixed(roi.weightedAuto, 1)}%</span>
                <span className="ac-tag ac-tag--ok">月节省 {fixed(roi.totalHours, 1)} 人时</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>编排流名称</th>
                      <th>触发事件</th>
                      <th>触发类型</th>
                      <th className="ac-td-right">步骤数</th>
                      <th className="ac-td-right">人工检查点</th>
                      <th className="ac-td-right">自动化率</th>
                      <th className="ac-td-right">端到端耗时</th>
                      <th className="ac-td-right">月执行次数</th>
                      <th className="ac-td-right">月节省人时</th>
                      <th className="ac-td-num">最近执行</th>
                      <th className="ac-td-center">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roi.rows.map(({ flow, runs, savedHours }) => (
                      <tr key={flow.id} className="ac-pt-row" onClick={() => setDrawerFlow(flow)} title="点击查看该流的全部步骤">
                        <td className="ac-mono ac-xs ac-brand-text">{flow.id}</td>
                        <td className="ac-pt-cell-title">{flow.name}</td>
                        <td className="ac-mono ac-xs ac-text-2">{flow.triggerEvent}</td>
                        <td><span className="ac-tag ac-tag--sm ac-tag--outline">{TRIGGER_TYPE_LABEL[flow.triggerType]}</span></td>
                        <td className="ac-td-num">{flow.steps.length}</td>
                        <td className="ac-td-num">{flow.humanCheckpoints.length}</td>
                        <td className="ac-td-num">
                          <span className="ac-pt-reuse-bar ac-pt-reuse-bar--sm">
                            <i style={{ width: `${flow.autoRatePct}%`, background: TONE_HEX[flow.tone] }} />
                          </span>
                          {flow.autoRatePct}%
                        </td>
                        <td className="ac-td-num">{flow.avgEndToEndMin} 分</td>
                        <td className="ac-td-num">{runs}</td>
                        <td className="ac-td-num ac-ok-text">{fixed(savedHours, 1)} h</td>
                        <td className="ac-td-num ac-xs">{flow.lastRunAt}</td>
                        <td className="ac-td-center">
                          <span className={`ac-tag ac-tag--sm ac-tag--${FLOW_RUN_STATUS[flow.lastRunStatus].tone}`}>
                            {FLOW_RUN_STATUS[flow.lastRunStatus].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><Gauge size={16} />AI 自动化收益测算</span>
                <span className="ac-card-subtitle">口径：节省人时 = Σ（端到端平均分钟 × 自动化率 × 月执行次数）÷ 60</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-metric-grid ac-metric-grid--3 ac-mb-0">
                  <div className="ac-metric ac-metric--ok">
                    <div className="ac-metric-head"><span className="ac-metric-label">月节省人力</span><span className="ac-metric-icon"><Users size={14} /></span></div>
                    <div className="ac-metric-value">{fixed(roi.totalHours, 1)}<span className="ac-metric-unit">人时</span></div>
                    <div className="ac-metric-foot">约 {fixed(roi.totalHours / 8, 1)} 个人日 / 月</div>
                  </div>
                  <div className="ac-metric ac-metric--ai">
                    <div className="ac-metric-head"><span className="ac-metric-label">加权自动化率</span><span className="ac-metric-icon"><Gauge size={14} /></span></div>
                    <div className="ac-metric-value">{fixed(roi.weightedAuto, 1)}<span className="ac-metric-unit">%</span></div>
                    <div className="ac-metric-foot">按月执行次数加权</div>
                  </div>
                  <div className="ac-metric ac-metric--info">
                    <div className="ac-metric-head"><span className="ac-metric-label">月执行总次数</span><span className="ac-metric-icon"><Activity size={14} /></span></div>
                    <div className="ac-metric-value">{roi.totalRuns}<span className="ac-metric-unit">次</span></div>
                    <div className="ac-metric-foot">6 条流合计</div>
                  </div>
                </div>
                <div className="ac-hint ac-mt-3">
                  <Info size={14} />
                  <span className="ac-lh">
                    口径说明：① 「月执行次数」数据层未提供，按各流触发源在 SP-24 内的对象规模推算
                    （AIF-01 = 5 个原型任务 + 3 次 PRD 修订 = 8；AIF-02 = 24 个任务各认领一次 = 24；AIF-03 = 14 份契约冻结 = 14；
                    AIF-04 = 近 30 天门禁失败 6 次；AIF-05 = 12 个缺陷定级；AIF-06 = 每迭代规划日 1 次）。
                    ② 「自动化率」直接取 autoRatePct，代表端到端耗时中由 AI 独立承担的比例，人工等待时间不计入节省。
                    ③ 节省人时不含返工与复核成本，属上限口径；实际收益需扣除人工检查点的复核工时。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><Target size={16} />各流节省占比</span>
                <span className="ac-card-subtitle">按月节省人时降序</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-pt-roi">
                  {[...roi.rows].sort((a, b) => b.savedHours - a.savedHours).map((r) => (
                    <div className="ac-pt-roi-row" key={r.flow.id}>
                      <span className="ac-pt-roi-name">{r.flow.id}</span>
                      <span className="ac-pt-roi-bar">
                        <i style={{ width: `${(r.savedHours / Math.max(...roi.rows.map((x) => x.savedHours))) * 100}%`, background: TONE_HEX[r.flow.tone] }} />
                      </span>
                      <span className="ac-pt-roi-val">{fixed(r.savedHours, 1)} h</span>
                      <span className="ac-pt-roi-sub">{clip(r.flow.name, 12)}</span>
                    </div>
                  ))}
                </div>
                <div className="ac-hint ac-hint--ai ac-mt-3">
                  <Sparkles size={14} />
                  <span>
                    收益最大的是 AIF-02（任务认领 → IDE AI 编码 → 同步平台 → 自动提 MR）：单任务端到端 76 分钟、自动化率 71%、月执行 24 次，
                    月节省约 {fixed((76 * 0.71 * 24) / 60, 1)} 人时；其中步骤 3「本地 AI 多轮编码与逐块接受」是人工检查点，
                    连续 3 轮采纳率 &lt; 30% 时会提示切换模型或转人工主导。
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 抽屉 ================= */}
      <Drawer
        open={drawerJob !== null}
        title={drawerJob ? `${drawerJob.id} · 原型生成任务` : ''}
        subtitle={drawerJob ? clip(drawerJob.name, 48) : undefined}
        width={780}
        onClose={() => setDrawerJob(null)}
      >
        {drawerJob && <JobDrawerBody job={drawerJob} />}
      </Drawer>

      <Drawer
        open={drawerReview !== null}
        title={drawerReview ? `${drawerReview.id} · 批注详情` : ''}
        subtitle={drawerReview ? drawerReview.anchorText : undefined}
        width={720}
        onClose={() => setDrawerReview(null)}
      >
        {drawerReview && (
          <ReviewDrawerBody
            r={drawerReview}
            page={PROTOTYPE_PAGES.find((p) => p.id === drawerReview.pageId)}
            comp={drawerReview.componentId ? COMP_MAP[drawerReview.componentId] : undefined}
            state={reviewOverrides[drawerReview.id]}
            onResolve={() => setReviewOverrides((p) => ({ ...p, [drawerReview.id]: 'resolved' }))}
            onTransfer={() => setReviewOverrides((p) => ({ ...p, [drawerReview.id]: 'transferred' }))}
            onReject={() => setReviewOverrides((p) => ({ ...p, [drawerReview.id]: 'rejected' }))}
          />
        )}
      </Drawer>

      <Drawer
        open={drawerFlow !== null}
        title={drawerFlow ? `${drawerFlow.id} · 自动化编排流` : ''}
        subtitle={drawerFlow ? drawerFlow.name : undefined}
        width={760}
        onClose={() => setDrawerFlow(null)}
      >
        {drawerFlow && <FlowDrawerBody flow={drawerFlow} />}
      </Drawer>

      {/* ================= 导出确认 Modal ================= */}
      <Modal
        open={exportTarget !== null}
        title={exportTarget ? `导出为 ${EXPORT_META[exportTarget].label}` : ''}
        subtitle={exportTarget ? `${verJobId} · ${jobVersions[jobVersions.length - 1]?.version ?? ''}（${jobVersions[jobVersions.length - 1]?.isBaseline ? '锁定基线' : '非基线快照'}）` : undefined}
        width={620}
        onClose={() => setExportTarget(null)}
        footer={
          exportTarget && (
            <>
              <span className="ac-xs ac-muted">导出为异步任务，完成后在制品库生成下载链接</span>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setExportTarget(null)}>取消</button>
              <button type="button" className="ac-btn ac-btn--sm ac-btn--primary" onClick={() => doExport(exportTarget)}>
                <Download size={13} />
                确认导出
              </button>
            </>
          )
        }
      >
        {exportTarget && (
          <>
            <dl className="ac-kv ac-mb-3">
              <dt>导出格式</dt>
              <dd><span className={`ac-tag ac-tag--sm ac-tag--${EXPORT_META[exportTarget].tone}`}>{EXPORT_META[exportTarget].label}</span></dd>
              <dt>导出范围</dt>
              <dd className="ac-lh">{EXPORT_META[exportTarget].scope}</dd>
              <dt>包含内容</dt>
              <dd>
                {jobVersions[jobVersions.length - 1]?.pageCount ?? 0} 个页面 · {jobVersions[jobVersions.length - 1]?.componentCount ?? 0} 个组件 ·{' '}
                {EXPORT_META[exportTarget].withComments ? `${PROTOTYPE_REVIEWS.length} 条批注锚点` : '不含批注'} ·{' '}
                {EXPORT_META[exportTarget].withInteractions ? '完整交互流' : '不含交互流'}
              </dd>
              <dt>预计体积</dt>
              <dd className="ac-tnum">{fixed(EXPORT_META[exportTarget].sizeMb, 1)} MB</dd>
              <dt>产物路径</dt>
              <dd className="ac-mono ac-xs">/export/{verJobId}/{jobVersions[jobVersions.length - 1]?.version}/{exportTarget}-bundle.zip</dd>
            </dl>
            <div className="ac-section-title">导出前确认</div>
            <div className="ac-pt-checklist">
              {[
                { key: 'baseline', text: '导出对象为已批准的版本快照（非草稿态页面）', hint: jobVersions[jobVersions.length - 1]?.isBaseline ? '当前选中版本为锁定基线' : '当前版本非基线，导出包会带「非基线」水印' },
                { key: 'blocker', text: '阻断级批注已全部闭环', hint: openBlockers.length === 0 ? `${blockers.length} 条阻断项均已产生版本修订` : `仍有 ${openBlockers.length} 条阻断级批注未闭环，导出包不能用作 G1 门禁证据` },
                { key: 'a11y', text: '可访问性未达标组件已登记批注', hint: `PTC-11 环形图对比度 3.8:1 未达 WCAG AA，已由 PTR-09 判定为不修复` },
              ].map((c) => {
                const done = confChecks[c.key] === true;
                return (
                  <label className={`ac-pt-checklist-item ${done ? 'ac-pt-checklist-item--done' : ''}`} key={c.key}>
                    <input type="checkbox" checked={done} onChange={(e) => setConfChecks((p) => ({ ...p, [c.key]: e.target.checked }))} />
                    <span className="ac-flex-1">
                      <span className="ac-pt-checklist-text">{c.text}</span>
                      <span className={`ac-xs ${c.key === 'blocker' && openBlockers.length > 0 ? 'ac-danger-text' : 'ac-muted'}`}>{c.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {exportTarget === 'make' && (
              <div className="ac-hint ac-hint--ai ac-mt-3">
                <Sparkles size={14} />
                <span>
                  Make 导出包会保留每个元素的 <span className="ac-mono">data-annotation-id</span> 锚点，
                  在 AxHub Make 管理端可继续多人批注协作 —— 与本原型自身使用的批注机制完全一致。
                </span>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
