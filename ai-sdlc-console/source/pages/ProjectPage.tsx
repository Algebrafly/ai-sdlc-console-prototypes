/**
 * 项目管理（pageId: project）
 *
 * 标签页：
 *  1. 项目组合 portfolio   —— 组合汇总指标 / 6 张项目卡 / 对比表（筛选 + 搜索 + 排序）/ 偏差 × 变更率四象限散点（手绘 SVG）
 *  2. 当前项目 detail      —— 项目选择器 / 基本信息 KV / 环形仪表 / G1~G6 门禁条形 / 关联迭代 · 里程碑 · 发布单 / AI 健康诊断
 *  3. 里程碑 milestone     —— 横向泳道时间线（含 TODAY 竖线）/ 里程碑登记表 / AI 里程碑延期预测
 *  4. 干系人 stakeholder   —— RACI 决策域矩阵 / 干系人登记册 / 权力-利益四象限（手绘 SVG）/ AI 沟通建议
 *  5. 风险与 AI 周报 risk  —— 5×5 概率影响热力矩阵 / 12+ 列风险登记表 / AI 自动生成的项目周报（采纳 / 重生成 / 编辑后发布）
 *
 * 数据口径：全部来自 ../data-mgmt 的项目管理段（PROJECTS / PROJECT_MILESTONES / STAKEHOLDERS /
 * PROJECT_RISKS / aiProjectReport）与 ../data 的共享基础数据（SPRINTS / GATES / RELEASE_MAP / TODAY / USER_MAP / agents / models）。
 * 页内不新增任何数据字段，所有派生指标均在注释中写明算式。
 */
import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Compass,
  Crosshair,
  Crown,
  FileText,
  Flag,
  FolderKanban,
  Gauge,
  Info,
  Layers,
  ListChecks,
  Mail,
  MessageSquare,
  Milestone,
  Network,
  PieChart,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  FormGrid,
  FormGroupTitle,
  MultiPickField,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
  checkDateRange,
  cleanErrors,
  requireNumber,
  requireText,
} from '../components/FormFields';
import type { FieldOption } from '../components/FormFields';
import { GATES, RELEASE_MAP, SPRINTS, TODAY, USER_MAP, USERS, agents, models } from '../data';
import type { Tone } from '../data';
import {
  CURRENT_PROJECT,
  PROJECTS,
  PROJECT_MILESTONES,
  PROJECT_RISKS,
  STAKEHOLDERS,
  aiProjectReport,
} from '../data-mgmt';
import type {
  AiProjectReportDef,
  ProjectDef,
  ProjectMilestoneDef,
  ProjectRiskDef,
  StakeholderDef,
} from '../data-mgmt';
import './project.css';

/* ================================================================== 常量 */

/** 语义色 → 十六进制（与 style.css 设计 token 一致，用于手绘 SVG 填色） */
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

type TabId = 'portfolio' | 'detail' | 'milestone' | 'stakeholder' | 'risk';

const TABS: { id: TabId; name: string; icon: typeof Target; count: number }[] = [
  { id: 'portfolio', name: '项目组合', icon: FolderKanban, count: PROJECTS.length },
  { id: 'detail', name: '当前项目', icon: Target, count: CURRENT_PROJECT.milestoneIds.length },
  { id: 'milestone', name: '里程碑', icon: Milestone, count: PROJECT_MILESTONES.filter((m) => m.projectId === CURRENT_PROJECT.id).length },
  { id: 'stakeholder', name: '干系人', icon: Users, count: STAKEHOLDERS.length },
  { id: 'risk', name: '风险与 AI 周报', icon: AlertTriangle, count: PROJECT_RISKS.length },
];

/** 项目健康度三态 → 展示文案与标签语义 */
const HEALTH_META: Record<ProjectDef['health'], { label: string; short: string; tagTone: string; tone: Tone }> = {
  green: { label: '绿灯 · 健康', short: '绿', tagTone: 'ok', tone: 'ok' },
  amber: { label: '黄灯 · 需关注', short: '黄', tagTone: 'warn', tone: 'warn' },
  red: { label: '红灯 · 告警', short: '红', tagTone: 'danger', tone: 'danger' },
};

/** 项目阶段 → 标签语义（阶段取自 ProjectDef.phase 的 7 个枚举值） */
const PHASE_TONE: Record<ProjectDef['phase'], Tone> = {
  立项: 'neutral',
  规划: 'info',
  研发: 'brand',
  测试: 'teal',
  发布: 'warn',
  运维: 'ok',
  已结项: 'slate',
};

/** 里程碑状态 → 标签语义 */
const MS_STATUS_TAG: Record<ProjectMilestoneDef['status'], string> = {
  已完成: 'ok',
  进行中: 'brand',
  待开始: 'neutral',
  已取消: 'danger',
};

/** 风险状态 → 文案与标签语义 */
const RISK_STATUS: Record<ProjectRiskDef['status'], { label: string; tagTone: string }> = {
  open: { label: '待处理', tagTone: 'danger' },
  mitigating: { label: '缓解中', tagTone: 'warn' },
  closed: { label: '已关闭', tagTone: 'ok' },
  occurred: { label: '已发生', tagTone: 'danger' },
};

/** 概率 / 影响枚举 → 中文与数值（数值口径见 data-mgmt.ts 文件头 C 节：low=1 / medium=3 / high=5） */
const PI_META: Record<'low' | 'medium' | 'high', { label: string; value: number }> = {
  low: { label: '低', value: 1 },
  medium: { label: '中', value: 3 },
  high: { label: '高', value: 5 },
};

/** 影响力枚举 → 中文、数值（1~3）与标签语义 */
const INFLUENCE_META: Record<StakeholderDef['influence'], { label: string; value: number; tagTone: string }> = {
  high: { label: '高', value: 3, tagTone: 'danger' },
  medium: { label: '中', value: 2, tagTone: 'warn' },
  low: { label: '低', value: 1, tagTone: 'neutral' },
};

/** RACI 四角色 → 中文与矩阵单元格配色类 */
const RACI_META: Record<StakeholderDef['raci'], { label: string; cls: string }> = {
  R: { label: 'R 执行', cls: 'ac-pj-raci-cell--r' },
  A: { label: 'A 问责', cls: 'ac-pj-raci-cell--a' },
  C: { label: 'C 咨询', cls: 'ac-pj-raci-cell--c' },
  I: { label: 'I 知会', cls: 'ac-pj-raci-cell--i' },
};

/** 质量门禁状态 → 文案与标签语义（取自 GateDef.status 的 4 个枚举值） */
const GATE_STATUS: Record<string, { label: string; tagTone: string; tone: Tone }> = {
  passed: { label: '通过', tagTone: 'ok', tone: 'ok' },
  failed: { label: '未通过', tagTone: 'danger', tone: 'danger' },
  pending: { label: '待执行', tagTone: 'warn', tone: 'warn' },
  waived: { label: '已豁免', tagTone: 'info', tone: 'info' },
};

/** 发布单状态 → 文案与标签语义（取自 ReleaseOrderDef.status） */
const REL_STATUS: Record<string, { label: string; tagTone: string }> = {
  released: { label: '已发布', tagTone: 'ok' },
  approving: { label: '审批中', tagTone: 'info' },
  blocked: { label: '被阻断', tagTone: 'danger' },
  planned: { label: '已排期', tagTone: 'neutral' },
  rolledback: { label: '已回滚', tagTone: 'warn' },
};

/** 迭代 id → 定义（SPRINTS 未导出 map，页内自建） */
const SPRINT_MAP: Record<string, (typeof SPRINTS)[number]> = SPRINTS.reduce<Record<string, (typeof SPRINTS)[number]>>(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {},
);

/**
 * 六个关键决策域 × 十位干系人的 RACI 落位。
 * 依据：STAKEHOLDERS.role / raci / interest、RELEASE_ORDERS['REL-2403'].approverIds（含 u-lin）、
 *       GATES 各门禁的 approverId（G4 = u-he、G3/G5 = u-lin、G2 = u-yan）推导。
 * 约束：每个决策域列恰好 1 个 A；登记册层面的唯一问责人 SH-07 保留「里程碑基线」与「资源调配」两个战略域的 A。
 */
const DECISION_DOMAINS: {
  id: string;
  name: string;
  decision: string;
  raci: Record<string, StakeholderDef['raci']>;
}[] = [
  {
    id: 'D1',
    name: '需求范围与 rc1 取舍',
    decision: 'REQ-2405 多仓拆单是否保留在 v3.0-rc1',
    raci: {
      'SH-01': 'R', 'SH-02': 'C', 'SH-03': 'A', 'SH-04': 'C', 'SH-05': 'C',
      'SH-06': 'I', 'SH-07': 'I', 'SH-08': 'C', 'SH-09': 'C', 'SH-10': 'R',
    },
  },
  {
    id: 'D2',
    name: '里程碑基线与工期调整',
    decision: 'REL-2403 是否由 03-20 顺延至 03-26、v3.0 基线是否调整',
    raci: {
      'SH-01': 'C', 'SH-02': 'R', 'SH-03': 'I', 'SH-04': 'I', 'SH-05': 'I',
      'SH-06': 'C', 'SH-07': 'A', 'SH-08': 'I', 'SH-09': 'I', 'SH-10': 'I',
    },
  },
  {
    id: 'D3',
    name: '质量门禁签发与例外审批',
    decision: 'G3（覆盖率 71.4%）/ G4（执行率 62.1%）是否例外放行',
    raci: {
      'SH-01': 'R', 'SH-02': 'I', 'SH-03': 'I', 'SH-04': 'C', 'SH-05': 'A',
      'SH-06': 'C', 'SH-07': 'I', 'SH-08': 'I', 'SH-09': 'I', 'SH-10': 'R',
    },
  },
  {
    id: 'D4',
    name: '架构契约冻结与技术选型',
    decision: 'API-10「拆单预演」契约冻结与分片键选型变更',
    raci: {
      'SH-01': 'C', 'SH-02': 'I', 'SH-03': 'C', 'SH-04': 'A', 'SH-05': 'I',
      'SH-06': 'I', 'SH-07': 'I', 'SH-08': 'C', 'SH-09': 'I', 'SH-10': 'R',
    },
  },
  {
    id: 'D5',
    name: '生产发布放行与切流窗口',
    decision: 'REL-2403 四批灰度是否按 03-20 22:00 窗口执行',
    raci: {
      'SH-01': 'A', 'SH-02': 'C', 'SH-03': 'I', 'SH-04': 'C', 'SH-05': 'C',
      'SH-06': 'R', 'SH-07': 'I', 'SH-08': 'C', 'SH-09': 'I', 'SH-10': 'I',
    },
  },
  {
    id: 'D6',
    name: '资源调配与跨组借调',
    decision: 'TASK-2415 / TASK-2408 转出与基础平台部后端借调',
    raci: {
      'SH-01': 'R', 'SH-02': 'R', 'SH-03': 'I', 'SH-04': 'C', 'SH-05': 'I',
      'SH-06': 'I', 'SH-07': 'A', 'SH-08': 'I', 'SH-09': 'I', 'SH-10': 'C',
    },
  },
];

/** 组合散点图坐标域：X = 进度偏差 %（负为落后），Y = 需求变更率 % */
const SCATTER_X: [number, number] = [-24, 8];
const SCATTER_Y: [number, number] = [0, 40];
/** 需求变更率基线（%）：PRD-ORD-v2.3 基线允许的变更上限，超过即视为范围不稳定 */
const CHANGE_BASELINE = 15;

/** 权力-利益四象限阈值（均为 0~3 的派生分值，算式见 interestScore / INFLUENCE_META） */
const PI_X_THRESHOLD = 1.8;
const PI_Y_THRESHOLD = 2.5;

/* ================================================================== 工具函数 */

/** 数字千分位 */
function num(v: number) {
  return v.toLocaleString('zh-CN');
}

/** 保留 n 位小数 */
function fmt(v: number, d = 1) {
  return v.toFixed(d);
}

/** 带正负号的百分比文本 */
function signed(v: number, d = 1) {
  return `${v > 0 ? '+' : ''}${v.toFixed(d)}%`;
}

/** 预算执行率 = spentWan ÷ budgetWan × 100 */
function budgetExecPct(p: ProjectDef) {
  return p.budgetWan > 0 ? (p.spentWan / p.budgetWan) * 100 : 0;
}

/** 'YYYY-MM-DD' → 整数天序号（用于时间轴定位与日期差计算） */
function dayIdx(dateStr: string) {
  return Math.round(Date.parse(`${dateStr}T00:00:00Z`) / 86400000);
}

/** to − from 的自然日天数 */
function diffDays(from: string, to: string) {
  return dayIdx(to) - dayIdx(from);
}

/** 'YYYY-MM-DD' → 'MM-DD' */
function md(dateStr: string) {
  return dateStr ? dateStr.slice(5) : '—';
}

/** 截断长文本，超出以省略号结尾 */
function cut(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 稳定字符串散列（用于同坐标点的视觉展开，避免标签重叠） */
function hashOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return h;
}

/** 干系人关联的项目数（ProjectDef.stakeholderIds 反向计数） */
function projectCountOf(shId: string) {
  return PROJECTS.filter((p) => p.stakeholderIds.includes(shId)).length;
}

/**
 * 利益相关度派生分值（0~3）：
 *   raciWeight：A = 3 / R = 2.5 / C = 1.8 / I = 1
 *   projWeight：min(关联项目数, 6) ÷ 6 × 3
 *   interest = raciWeight × 0.7 + projWeight × 0.3
 */
function interestScore(sh: StakeholderDef) {
  const raciWeight: Record<StakeholderDef['raci'], number> = { A: 3, R: 2.5, C: 1.8, I: 1 };
  const projWeight = (Math.min(projectCountOf(sh.id), 6) / 6) * 3;
  return raciWeight[sh.raci] * 0.7 + projWeight * 0.3;
}

/** 四象限分区名 */
function piZone(x: number, y: number) {
  if (x >= PI_X_THRESHOLD && y >= PI_Y_THRESHOLD) return '重点管理';
  if (x < PI_X_THRESHOLD && y >= PI_Y_THRESHOLD) return '保持满意';
  if (x >= PI_X_THRESHOLD && y < PI_Y_THRESHOLD) return '保持沟通';
  return '监控';
}

/** 从里程碑交付物文本中提取发布单编号（数据层未提供 project → release 外键，按交付物文本回溯） */
function releaseIdsOf(p: ProjectDef) {
  const found = new Set<string>();
  PROJECT_MILESTONES.filter((m) => p.milestoneIds.includes(m.id)).forEach((m) => {
    m.deliverables.forEach((d) => {
      const hits = d.match(/REL-\d{4}/g);
      if (hits) hits.forEach((h) => found.add(h));
    });
  });
  return Array.from(found).filter((id) => Boolean(RELEASE_MAP[id]));
}

/** 跳转到其他原型页面（页头面包屑与关联对象卡片的跨页入口） */
function jump(page: string) {
  window.location.hash = `#page=${page}`;
}

/* ================================================================== 内联 SVG 图表 */

/** 环形仪表（预算执行率 / 人力利用率 / 总体进度 / 健康度评分共用） */
function DonutGauge({
  value,
  label,
  sub,
  tone,
  max = 100,
}: {
  value: number;
  label: string;
  sub: string;
  tone: Tone;
  max?: number;
}) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const ratio = Math.max(0, Math.min(value / max, 1));
  const color = TONE_HEX[tone] ?? TONE_HEX.brand;
  return (
    <div className="ac-pj-gauge">
      <div className="ac-donut">
        <svg viewBox="0 0 88 88" width="88" height="88" role="img" aria-label={`${label} ${fmt(value)}%`}>
          <circle cx="44" cy="44" r={R} fill="none" stroke="#eceff4" strokeWidth="10" />
          <circle
            cx="44"
            cy="44"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${C * ratio} ${C}`}
            transform="rotate(-90 44 44)"
          />
          <text className="ac-pj-gauge-value" x="44" y="46" textAnchor="middle">
            {fmt(value, value >= 100 ? 0 : 1)}
          </text>
          <text className="ac-pj-gauge-unit" x="44" y="60" textAnchor="middle">
            %
          </text>
        </svg>
      </div>
      <div className="ac-pj-gauge-label">{label}</div>
      <div className="ac-pj-gauge-sub">{sub}</div>
    </div>
  );
}

/** 质量门禁 G1~G6 通过率横向条形（手绘 SVG） */
function GateBarChart() {
  const W = 720;
  const labelW = 132;
  const valueW = 92;
  const rowH = 34;
  const chartW = W - labelW - valueW;
  const H = GATES.length * rowH + 8;
  return (
    <svg
      className="ac-pj-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="六道质量门禁当前通过率"
    >
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line
            className="ac-pj-svg-grid"
            x1={labelW + (chartW * tick) / 100}
            y1={4}
            x2={labelW + (chartW * tick) / 100}
            y2={H - 4}
          />
          <text className="ac-pj-svg-tick" x={labelW + (chartW * tick) / 100} y={H - 0} textAnchor="middle">
            {tick}
          </text>
        </g>
      ))}
      {GATES.map((g, idx) => {
        const y = idx * rowH + 4;
        const meta = GATE_STATUS[g.status] ?? GATE_STATUS.pending;
        const w = Math.max(2, (g.passRate / 100) * chartW);
        return (
          <g key={g.id}>
            <text className="ac-pj-svg-name" x={0} y={y + 16}>
              {g.id} · {g.name}
            </text>
            <rect className="ac-pj-svg-track" x={labelW} y={y + 5} width={chartW} height={14} rx={4} />
            <rect x={labelW} y={y + 5} width={w} height={14} rx={4} fill={TONE_HEX[meta.tone]} />
            <text className="ac-pj-svg-value" x={labelW + chartW + 8} y={y + 16}>
              {g.passRate}% · {meta.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 项目组合四象限散点图（手绘 SVG）
 * X = 进度偏差 %（阈值 0），Y = 需求变更率 %（阈值 CHANGE_BASELINE），气泡半径 = headcount，颜色 = health。
 */
function PortfolioScatter({ onPick }: { onPick: (p: ProjectDef) => void }) {
  const W = 880;
  const H = 372;
  const pl = 62;
  const pr = 26;
  const pt = 22;
  const pb = 52;
  const pw = W - pl - pr;
  const ph = H - pt - pb;
  const x = (v: number) => pl + ((v - SCATTER_X[0]) / (SCATTER_X[1] - SCATTER_X[0])) * pw;
  const y = (v: number) => pt + ph - ((v - SCATTER_Y[0]) / (SCATTER_Y[1] - SCATTER_Y[0])) * ph;
  const xTh = x(0);
  const yTh = y(CHANGE_BASELINE);

  const xTicks = [-20, -15, -10, -5, 0, 5];
  const yTicks = [0, 10, 15, 20, 30, 40];

  return (
    <svg
      className="ac-pj-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="项目组合进度偏差与需求变更率四象限散点图"
    >
      {/* 四象限底色 */}
      <rect x={pl} y={pt} width={xTh - pl} height={yTh - pt} fill="#feecec" opacity="0.5" />
      <rect x={xTh} y={pt} width={pl + pw - xTh} height={yTh - pt} fill="#eaf2ff" opacity="0.55" />
      <rect x={pl} y={yTh} width={xTh - pl} height={pt + ph - yTh} fill="#fef4e3" opacity="0.55" />
      <rect x={xTh} y={yTh} width={pl + pw - xTh} height={pt + ph - yTh} fill="#e7f8f1" opacity="0.55" />

      {/* 网格 */}
      {xTicks.map((t) => (
        <line key={`gx${t}`} className="ac-pj-svg-grid" x1={x(t)} y1={pt} x2={x(t)} y2={pt + ph} />
      ))}
      {yTicks.map((t) => (
        <line key={`gy${t}`} className="ac-pj-svg-grid" x1={pl} y1={y(t)} x2={pl + pw} y2={y(t)} />
      ))}

      {/* 阈值线 */}
      <line className="ac-pj-svg-axis" x1={xTh} y1={pt} x2={xTh} y2={pt + ph} />
      <line className="ac-pj-svg-axis" x1={pl} y1={yTh} x2={pl + pw} y2={yTh} />

      {/* 象限说明 */}
      <text className="ac-pj-svg-zone ac-pj-svg-zone--danger" x={pl + 8} y={pt + 15}>范围失控区</text>
      <text className="ac-pj-svg-zone ac-pj-svg-zone--info" x={pl + pw - 8} y={pt + 15} textAnchor="end">变更吸收良好区</text>
      <text className="ac-pj-svg-zone ac-pj-svg-zone--warn" x={pl + 8} y={pt + ph - 8}>执行受阻区</text>
      <text className="ac-pj-svg-zone ac-pj-svg-zone--ok" x={pl + pw - 8} y={pt + ph - 8} textAnchor="end">基线健康区</text>

      {/* 坐标轴刻度 */}
      {xTicks.map((t) => (
        <text key={`tx${t}`} className="ac-pj-svg-tick" x={x(t)} y={pt + ph + 18} textAnchor="middle">
          {t > 0 ? `+${t}` : t}
        </text>
      ))}
      {yTicks.map((t) => (
        <text key={`ty${t}`} className="ac-pj-svg-tick" x={pl - 8} y={y(t) + 4} textAnchor="end">
          {t}
        </text>
      ))}
      <text className="ac-pj-svg-axis-label" x={pl + pw / 2} y={H - 8} textAnchor="middle">
        进度偏差 %（负值 = 落后于基线）
      </text>
      <text className="ac-pj-svg-axis-label" x={16} y={pt + ph / 2} textAnchor="middle" transform={`rotate(-90 16 ${pt + ph / 2})`}>
        需求变更率 %
      </text>

      {/* 气泡 */}
      {PROJECTS.map((p) => {
        const r = 7 + p.headcount * 0.95;
        const cx = x(p.scheduleVariancePct);
        const cy = y(p.reqChangeRatePct);
        const color = TONE_HEX[HEALTH_META[p.health].tone];
        const labelLeft = cx > pl + pw - 150;
        return (
          <g
            key={p.id}
            className="ac-pj-scatter-point"
            onClick={() => onPick(p)}
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') onPick(p);
            }}
          >
            <title>{`${p.name}（${p.code}）· 进度偏差 ${signed(p.scheduleVariancePct)} · 需求变更率 ${fmt(p.reqChangeRatePct)}% · 人力 ${p.headcount} 人 · ${HEALTH_META[p.health].label}`}</title>
            <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity="0.24" stroke={color} strokeWidth="2" />
            <circle cx={cx} cy={cy} r={3} fill={color} />
            <text
              className="ac-pj-svg-name"
              x={labelLeft ? cx - r - 6 : cx + r + 6}
              y={cy + 4}
              textAnchor={labelLeft ? 'end' : 'start'}
            >
              {p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 里程碑横向泳道时间线（手绘 SVG）
 * 每个里程碑独占一行避免标签重叠；实心菱形 = 计划日期，空心菱形 = AI 预测日期，虚线 = 滑移区间，竖线 = TODAY。
 */
function MilestoneTimeline({ items }: { items: ProjectMilestoneDef[] }) {
  const sorted = [...items].sort((a, b) => dayIdx(a.plannedDate) - dayIdx(b.plannedDate));
  const allDates = sorted.flatMap((m) => [m.plannedDate, m.forecastDate, m.actualDate].filter(Boolean));
  const minD = Math.min(dayIdx(TODAY), ...allDates.map(dayIdx)) - 6;
  const maxD = Math.max(dayIdx(TODAY), ...allDates.map(dayIdx)) + 8;

  const W = 1060;
  const left = 236;
  const right = 24;
  const head = 40;
  const rowH = 46;
  const H = head + sorted.length * rowH + 26;
  const pw = W - left - right;
  const x = (dateStr: string) => left + ((dayIdx(dateStr) - minD) / (maxD - minD)) * pw;

  /** 月刻度：从起始月的 1 号开始，每月一条 */
  const monthTicks: string[] = [];
  const first = new Date(`${sorted.length ? allDates[0] : TODAY}T00:00:00Z`);
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  while (Math.floor(cursor / 86400000) <= maxD) {
    const d = new Date(cursor).toISOString().slice(0, 10);
    if (dayIdx(d) >= minD) monthTicks.push(d);
    cursor = Date.UTC(new Date(cursor).getUTCFullYear(), new Date(cursor).getUTCMonth() + 1, 1);
  }

  /** 菱形路径（里程碑节点标记） */
  const diamond = (cx: number, cy: number, r: number) =>
    `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;

  return (
    <div className="ac-pj-tl-scroll">
      <svg
        className="ac-pj-svg ac-pj-tl-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="当前项目里程碑时间线，含今日基准线"
      >
        {/* 月份网格 */}
        {monthTicks.map((d) => (
          <g key={d}>
            <line className="ac-pj-svg-grid" x1={x(d)} y1={head - 10} x2={x(d)} y2={H - 22} />
            <text className="ac-pj-svg-tick" x={x(d)} y={head - 18} textAnchor="middle">
              {d.slice(0, 7)}
            </text>
          </g>
        ))}

        {/* 主时间轴 */}
        <line className="ac-pj-svg-axis" x1={left} y1={head + 12} x2={left + pw} y2={head + 12} />

        {/* 今日竖线 */}
        <line className="ac-pj-tl-today" x1={x(TODAY)} y1={head - 12} x2={x(TODAY)} y2={H - 22} />
        <rect x={x(TODAY) - 34} y={head - 30} width={68} height={17} rx={8} fill="#4f46e5" />
        <text className="ac-pj-tl-today-label" x={x(TODAY)} y={head - 18} textAnchor="middle">
          今日 {md(TODAY)}
        </text>

        {sorted.map((m, idx) => {
          const cy = head + 34 + idx * rowH;
          const px = x(m.plannedDate);
          const fx = x(m.forecastDate);
          const ax = m.actualDate ? x(m.actualDate) : null;
          const color = TONE_HEX[m.tone] ?? TONE_HEX.brand;
          const slipped = m.forecastDate !== m.plannedDate && m.status !== '已完成';
          return (
            <g key={m.id}>
              <line className="ac-pj-svg-rowline" x1={left} y1={cy} x2={left + pw} y2={cy} />
              <text className="ac-pj-tl-rowname" x={8} y={cy - 2}>
                {cut(m.name, 20)}
              </text>
              <text className="ac-pj-tl-rowmeta" x={8} y={cy + 13}>
                {m.id} · {m.gateId} · {m.status}
                {m.slipDays > 0 ? ` · 滑移 ${m.slipDays} 天` : ''}
              </text>

              {/* 计划 → 预测 的滑移区间 */}
              {slipped && (
                <>
                  <line className="ac-pj-tl-slip" x1={px} y1={cy} x2={fx} y2={cy} />
                  <text className="ac-pj-tl-slip-label" x={(px + fx) / 2} y={cy - 9} textAnchor="middle">
                    +{diffDays(m.plannedDate, m.forecastDate)}d
                  </text>
                </>
              )}

              {/* 计划日期节点 */}
              <path
                d={diamond(px, cy, 7)}
                fill={m.status === '待开始' ? '#ffffff' : color}
                stroke={color}
                strokeWidth="2"
              />
              {/* 实际完成节点 */}
              {ax !== null && m.status === '已完成' && (
                <circle cx={ax} cy={cy} r={4} fill={TONE_HEX.ok} stroke="#fff" strokeWidth="1.5" />
              )}
              {/* AI 预测节点 */}
              {slipped && (
                <path
                  d={diamond(fx, cy, 6)}
                  fill="#ffffff"
                  stroke={TONE_HEX.ai}
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
              )}

              <text className="ac-pj-tl-date" x={px} y={cy + 20} textAnchor="middle">
                {md(m.plannedDate)}
              </text>
            </g>
          );
        })}

        {/* 图例 */}
        <g>
          <path d={diamond(left + 6, H - 10, 5)} fill="#4f46e5" stroke="#4f46e5" strokeWidth="1.5" />
          <text className="ac-pj-svg-tick" x={left + 18} y={H - 6}>计划日期</text>
          <path d={diamond(left + 92, H - 10, 5)} fill="#ffffff" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="3 2" />
          <text className="ac-pj-svg-tick" x={left + 104} y={H - 6}>AI 预测日期</text>
          <circle cx={left + 196} cy={H - 10} r={4} fill={TONE_HEX.ok} />
          <text className="ac-pj-svg-tick" x={left + 206} y={H - 6}>实际完成</text>
          <line className="ac-pj-tl-slip" x1={left + 276} y1={H - 10} x2={left + 300} y2={H - 10} />
          <text className="ac-pj-svg-tick" x={left + 306} y={H - 6}>滑移区间</text>
        </g>
      </svg>
    </div>
  );
}

/**
 * 权力-利益四象限散点图（手绘 SVG）
 * X = 利益相关度（interestScore 派生），Y = 影响力（INFLUENCE_META.value）。
 * 同坐标点位按 id 散列做 ±0.07 的视觉展开，避免标签完全重叠。
 */
function PowerInterestScatter({ onPick }: { onPick: (sh: StakeholderDef) => void }) {
  const W = 700;
  const H = 400;
  const pl = 58;
  const pr = 26;
  const pt = 20;
  const pb = 50;
  const pw = W - pl - pr;
  const ph = H - pt - pb;
  const xMin = 0.8;
  const xMax = 3.0;
  const yMin = 0.6;
  const yMax = 3.4;

  const points = STAKEHOLDERS.map((sh) => {
    const rawX = interestScore(sh);
    const rawY = INFLUENCE_META[sh.influence].value;
    const jitter = ((hashOf(sh.id) % 5) - 2) * 0.035;
    return { sh, x: rawX + jitter, y: rawY + jitter * 0.6, rawX, rawY };
  });

  const x = (v: number) => pl + ((v - xMin) / (xMax - xMin)) * pw;
  const y = (v: number) => pt + ph - ((v - yMin) / (yMax - yMin)) * ph;
  const xTh = x(PI_X_THRESHOLD);
  const yTh = y(PI_Y_THRESHOLD);

  return (
    <svg
      className="ac-pj-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="干系人权力利益四象限分布"
    >
      <rect x={xTh} y={pt} width={pl + pw - xTh} height={yTh - pt} fill="#feecec" opacity="0.5" />
      <rect x={pl} y={pt} width={xTh - pl} height={yTh - pt} fill="#fef4e3" opacity="0.55" />
      <rect x={xTh} y={yTh} width={pl + pw - xTh} height={pt + ph - yTh} fill="#eaf2ff" opacity="0.55" />
      <rect x={pl} y={yTh} width={xTh - pl} height={pt + ph - yTh} fill="#f2f4f8" opacity="0.7" />

      <line className="ac-pj-svg-axis" x1={xTh} y1={pt} x2={xTh} y2={pt + ph} />
      <line className="ac-pj-svg-axis" x1={pl} y1={yTh} x2={pl + pw} y2={yTh} />
      <rect x={pl} y={pt + ph} width={pw} height={1} fill="#cfd6e0" />
      <rect x={pl} y={pt} width={1} height={ph} fill="#cfd6e0" />

      <text className="ac-pj-svg-zone ac-pj-svg-zone--danger" x={pl + pw - 8} y={pt + 15} textAnchor="end">重点管理</text>
      <text className="ac-pj-svg-zone ac-pj-svg-zone--warn" x={pl + 8} y={pt + 15}>保持满意</text>
      <text className="ac-pj-svg-zone ac-pj-svg-zone--info" x={pl + pw - 8} y={pt + ph - 8} textAnchor="end">保持沟通</text>
      <text className="ac-pj-svg-zone" x={pl + 8} y={pt + ph - 8}>监控</text>

      {[1, 1.5, 2, 2.5, 3].map((t) => (
        <text key={`tx${t}`} className="ac-pj-svg-tick" x={x(t)} y={pt + ph + 18} textAnchor="middle">
          {t.toFixed(1)}
        </text>
      ))}
      {[1, 2, 3].map((t) => (
        <text key={`ty${t}`} className="ac-pj-svg-tick" x={pl - 8} y={y(t) + 4} textAnchor="end">
          {t === 3 ? '高' : t === 2 ? '中' : '低'}
        </text>
      ))}
      <text className="ac-pj-svg-axis-label" x={pl + pw / 2} y={H - 8} textAnchor="middle">
        利益相关度（RACI 权重 0.7 + 关联项目数 0.3）
      </text>
      <text className="ac-pj-svg-axis-label" x={16} y={pt + ph / 2} textAnchor="middle" transform={`rotate(-90 16 ${pt + ph / 2})`}>
        影响力
      </text>

      {points.map((pt2) => {
        const cx = x(pt2.x);
        const cy = y(pt2.y);
        const color = TONE_HEX[pt2.sh.tone] ?? TONE_HEX.brand;
        const flip = cx > pl + pw - 120;
        return (
          <g
            key={pt2.sh.id}
            className="ac-pj-scatter-point"
            onClick={() => onPick(pt2.sh)}
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') onPick(pt2.sh);
            }}
          >
            <title>{`${pt2.sh.displayName} · ${pt2.sh.role} · RACI ${pt2.sh.raci} · 影响力 ${INFLUENCE_META[pt2.sh.influence].label} · 利益相关度 ${fmt(pt2.rawX, 2)} · 分区「${piZone(pt2.rawX, pt2.rawY)}」`}</title>
            <circle cx={cx} cy={cy} r={9} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2" />
            <text className="ac-pj-svg-dotlabel" x={cx} y={cy + 3.5} textAnchor="middle">
              {pt2.sh.raci}
            </text>
            <text
              className="ac-pj-svg-name"
              x={flip ? cx - 14 : cx + 14}
              y={cy + 4}
              textAnchor={flip ? 'end' : 'start'}
            >
              {pt2.sh.displayName}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 风险概率 × 影响 5×5 热力矩阵（手绘 SVG）
 * 轴刻度取 1 / 3 / 5（low / medium / high 的数值口径），格内标注落入该格的风险编号。
 */
function RiskHeatMatrix({ onPick }: { onPick: (r: ProjectRiskDef) => void }) {
  const W = 660;
  const left = 86;
  const top = 26;
  const cellW = 104;
  const cellH = 62;
  const H = top + cellH * 5 + 46;
  const axis = [1, 2, 3, 4, 5];

  const cellTone = (score: number): string => {
    if (score >= 20) return '#ef4444';
    if (score >= 10) return '#f59e0b';
    if (score >= 5) return '#3b82f6';
    return '#94a3b8';
  };

  return (
    <svg
      className="ac-pj-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="项目风险概率与影响五乘五热力矩阵"
    >
      {axis.map((py, iy) =>
        axis.map((px, ix) => {
          const score = py * px;
          const cx = left + ix * cellW;
          const cy = top + (4 - iy) * cellH;
          const risks = PROJECT_RISKS.filter(
            (r) => PI_META[r.probability].value === py && PI_META[r.impact].value === px,
          );
          const base = cellTone(score);
          return (
            <g key={`${py}-${px}`}>
              <rect
                x={cx + 1}
                y={cy + 1}
                width={cellW - 2}
                height={cellH - 2}
                rx={6}
                fill={base}
                fillOpacity={risks.length ? 0.26 : 0.08}
                stroke={risks.length ? base : '#e2e6ec'}
                strokeWidth={risks.length ? 1.6 : 1}
              />
              <text className="ac-pj-heat-score" x={cx + 8} y={cy + 16}>
                {score}
              </text>
              {risks.slice(0, 4).map((r, i) => (
                <g
                  key={r.id}
                  className="ac-pj-scatter-point"
                  onClick={() => onPick(r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') onPick(r);
                  }}
                >
                  <title>{`${r.id} · ${r.title} · 分值 ${r.score} · ${RISK_STATUS[r.status].label}`}</title>
                  <rect
                    x={cx + 8 + i * 24}
                    y={cy + 26}
                    width={22}
                    height={18}
                    rx={4}
                    fill={TONE_HEX[TAG_TONE[r.tone] === 'neutral' ? 'neutral' : r.tone] ?? base}
                  />
                  <text className="ac-pj-heat-id" x={cx + 19 + i * 24} y={cy + 39} textAnchor="middle">
                    {r.id.replace('PR-', '')}
                  </text>
                </g>
              ))}
            </g>
          );
        }),
      )}

      {/* 轴标签 */}
      {axis.map((py, iy) => (
        <text key={`ly${py}`} className="ac-pj-svg-name" x={left - 10} y={top + (4 - iy) * cellH + cellH / 2 + 4} textAnchor="end">
          {py === 5 ? '高 5' : py === 3 ? '中 3' : py === 1 ? '低 1' : `${py}`}
        </text>
      ))}
      {axis.map((px, ix) => (
        <text key={`lx${px}`} className="ac-pj-svg-name" x={left + ix * cellW + cellW / 2} y={top + cellH * 5 + 18} textAnchor="middle">
          {px === 5 ? '高 5' : px === 3 ? '中 3' : px === 1 ? '低 1' : `${px}`}
        </text>
      ))}
      <text className="ac-pj-svg-axis-label" x={left - 44} y={top + (cellH * 5) / 2} textAnchor="middle" transform={`rotate(-90 ${left - 44} ${top + (cellH * 5) / 2})`}>
        发生概率
      </text>
      <text className="ac-pj-svg-axis-label" x={left + (cellW * 5) / 2} y={H - 6} textAnchor="middle">
        影响程度
      </text>
    </svg>
  );
}

/** AI 周报「计划 vs 实际」对比条（手绘 SVG 分组条形） */
function PlanActualBars({ items }: { items: AiProjectReportDef['progressItems'] }) {
  const W = 640;
  const labelW = 168;
  const valueW = 92;
  const rowH = 46;
  const chartW = W - labelW - valueW;
  const H = items.length * rowH + 10;

  return (
    <svg
      className="ac-pj-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="AI 周报计划值与实际值对比"
    >
      {items.map((it, idx) => {
        const y = idx * rowH + 6;
        const max = Math.max(it.planned, it.actual, 1) * 1.12;
        const wp = (it.planned / max) * chartW;
        const wa = (it.actual / max) * chartW;
        return (
          <g key={it.label}>
            <text className="ac-pj-svg-name" x={0} y={y + 14}>
              {it.label}
            </text>
            <rect className="ac-pj-svg-track" x={labelW} y={y + 3} width={chartW} height={12} rx={3} />
            <rect x={labelW} y={y + 3} width={Math.max(2, wp)} height={12} rx={3} fill="#c7cdd8" />
            <rect x={labelW} y={y + 20} width={Math.max(2, wa)} height={12} rx={3} fill={TONE_HEX[it.tone] ?? TONE_HEX.brand} />
            <text className="ac-pj-svg-tick" x={labelW + wp + 6} y={y + 13}>
              计划 {fmt(it.planned, it.planned % 1 === 0 ? 0 : 1)}
            </text>
            <text className="ac-pj-svg-value" x={labelW + wa + 6} y={y + 30}>
              实际 {fmt(it.actual, it.actual % 1 === 0 ? 0 : 1)}
            </text>
            <text
              className="ac-pj-svg-value"
              x={W}
              y={y + 22}
              textAnchor="end"
              fill={it.variancePct > 0 ? TONE_HEX.ok : it.variancePct < 0 ? TONE_HEX.danger : TONE_HEX.neutral}
            >
              {signed(it.variancePct)}
            </text>
          </g>
        );
      })}
      <g>
        <rect x={labelW} y={H - 6} width={12} height={8} rx={2} fill="#c7cdd8" />
        <text className="ac-pj-svg-tick" x={labelW + 18} y={H + 1}>基线计划</text>
        <rect x={labelW + 92} y={H - 6} width={12} height={8} rx={2} fill={TONE_HEX.brand} />
        <text className="ac-pj-svg-tick" x={labelW + 110} y={H + 1}>本期实际（按 tone 着色）</text>
      </g>
    </svg>
  );
}

/* ================================================================== AI 派生逻辑 */

/** 一条 AI 健康诊断结论 */
interface Diagnosis {
  id: string;
  level: 'danger' | 'warn' | 'info' | 'ok';
  weight: number;
  title: string;
  signals: { source: string; value: string }[];
  action: string;
}

/**
 * 由 ProjectDef 的既有指标派生健康诊断（不新增数据字段）：
 *   scheduleVariancePct / reqChangeRatePct / defectDensity / resourceUtilizationPct / healthScore
 *   + 当前项目额外叠加 GATES 的未通过门禁与预算执行率 vs 进度的剪刀差。
 * 输出按严重度排序后取前 5 条，不足 3 条时补足正向结论。
 */
function diagnose(p: ProjectDef, blockedGates: string[]): Diagnosis[] {
  const out: Diagnosis[] = [];

  if (p.scheduleVariancePct <= -10) {
    out.push({
      id: `${p.id}-schedule`,
      level: 'danger',
      weight: 96,
      title: '进度严重落后基线，关键路径已失守',
      signals: [
        { source: 'ProjectDef.scheduleVariancePct', value: signed(p.scheduleVariancePct) },
        { source: 'ProjectDef.progress', value: `${p.progress}%（计划基线 ${fmt(p.progress - p.scheduleVariancePct, 1)}%）` },
      ],
      action: '立即重排关键路径：把非里程碑必需的范围移出本期基线，并在 3 个工作日内提交新的里程碑基线供指导委员会签核。',
    });
  } else if (p.scheduleVariancePct <= -3) {
    out.push({
      id: `${p.id}-schedule`,
      level: 'warn',
      weight: 78,
      title: '进度落后基线，剩余工期缓冲不足',
      signals: [
        { source: 'ProjectDef.scheduleVariancePct', value: signed(p.scheduleVariancePct) },
        { source: 'ProjectDef.endDate', value: `${p.endDate}（距今 ${diffDays(TODAY, p.endDate)} 天）` },
      ],
      action: '按当前速率重算完工日期，若滑移超过 7 天则触发范围取舍决策；同步把阻塞项升级时效压到 24 小时内。',
    });
  } else {
    out.push({
      id: `${p.id}-schedule`,
      level: 'ok',
      weight: 20,
      title: '进度不落后于基线',
      signals: [{ source: 'ProjectDef.scheduleVariancePct', value: signed(p.scheduleVariancePct) }],
      action: '维持当前节奏，继续按周复核燃尽曲线与关键路径前置依赖。',
    });
  }

  if (p.reqChangeRatePct >= 25) {
    out.push({
      id: `${p.id}-change`,
      level: 'danger',
      weight: 92,
      title: '需求变更率失控，范围基线已失效',
      signals: [
        { source: 'ProjectDef.reqChangeRatePct', value: `${fmt(p.reqChangeRatePct)}%（基线上限 ${CHANGE_BASELINE}%）` },
      ],
      action: '冻结基线并成立口径仲裁小组，未签核的变更一律移出本期；把变更率纳入项目健康度评分模型。',
    });
  } else if (p.reqChangeRatePct >= CHANGE_BASELINE) {
    out.push({
      id: `${p.id}-change`,
      level: 'warn',
      weight: 70,
      title: '需求变更率高于基线上限',
      signals: [
        { source: 'ProjectDef.reqChangeRatePct', value: `${fmt(p.reqChangeRatePct)}%（基线上限 ${CHANGE_BASELINE}%）` },
        { source: 'PRD 基线', value: 'PRD-ORD-v2.3 在 SP-24 内已修订 2 次' },
      ],
      action: '对每条变更做「价值 / 工期」双维打分，低价值变更顺延至下一迭代；rc1 范围一旦确定不再接受新增。',
    });
  }

  if (p.defectDensity >= 1.0) {
    out.push({
      id: `${p.id}-quality`,
      level: 'danger',
      weight: 90,
      title: '缺陷密度显著偏高，质量门禁难以达标',
      signals: [{ source: 'ProjectDef.defectDensity', value: `${fmt(p.defectDensity, 2)} 个 / KLOC（红线 1.0）` }],
      action: '暂停新功能投入，集中做缺陷收敛与根因分析；把逃逸缺陷逐条回溯到用例缺口并补齐自动化回归。',
    });
  } else if (p.defectDensity >= 0.55) {
    out.push({
      id: `${p.id}-quality`,
      level: 'warn',
      weight: 66,
      title: '缺陷密度接近红线',
      signals: [
        { source: 'ProjectDef.defectDensity', value: `${fmt(p.defectDensity, 2)} 个 / KLOC（红线 1.0）` },
        { source: '关联门禁', value: blockedGates.length ? `${blockedGates.join(' / ')} 未通过` : 'G1~G6 无阻断' },
      ],
      action: '把 AI 生成的边界用例按模块分配到人并设定合入时限，优先补齐金额与并发两类高危场景。',
    });
  } else if (p.defectDensity > 0) {
    out.push({
      id: `${p.id}-quality`,
      level: 'ok',
      weight: 18,
      title: '缺陷密度处于健康区间',
      signals: [{ source: 'ProjectDef.defectDensity', value: `${fmt(p.defectDensity, 2)} 个 / KLOC` }],
      action: '维持现有评审与门禁策略，继续观测逃逸率。',
    });
  }

  if (p.resourceUtilizationPct >= 100) {
    out.push({
      id: `${p.id}-resource`,
      level: 'danger',
      weight: 88,
      title: '人力已透支，存在关键人依赖风险',
      signals: [{ source: 'ProjectDef.resourceUtilizationPct', value: `${p.resourceUtilizationPct}%（> 100% 表示借调或加班透支）` }],
      action: '立即做一次跨组负载再平衡，把非关键路径任务转出，并为关键人配置 backup；同步复核加班时长与缺陷逃逸的相关性。',
    });
  } else if (p.resourceUtilizationPct >= 90) {
    out.push({
      id: `${p.id}-resource`,
      level: 'warn',
      weight: 64,
      title: '人力接近饱和，无缓冲承接突发阻塞',
      signals: [{ source: 'ProjectDef.resourceUtilizationPct', value: `${p.resourceUtilizationPct}%（饱和阈值 90%）` }],
      action: '预留至少 10% 的缓冲产能用于阻塞清理与评审；把可自动化的回归与预检工作交给 Agent 承接。',
    });
  } else if (p.resourceUtilizationPct <= 50 && p.phase !== '已结项') {
    out.push({
      id: `${p.id}-resource`,
      level: 'info',
      weight: 46,
      title: '人力利用率偏低，产能可被组合复用',
      signals: [{ source: 'ProjectDef.resourceUtilizationPct', value: `${p.resourceUtilizationPct}%` }],
      action: '把闲置产能登记到项目组合资源池，优先支援红灯项目或提前启动下一阶段的架构评审。',
    });
  }

  const exec = budgetExecPct(p);
  if (exec - p.progress > 10) {
    out.push({
      id: `${p.id}-budget`,
      level: 'warn',
      weight: 60,
      title: '预算执行快于实体进度，成本效率下降',
      signals: [
        { source: 'spentWan ÷ budgetWan', value: `${fmt(exec)}%（${num(p.spentWan)} / ${num(p.budgetWan)} 万元）` },
        { source: 'ProjectDef.progress', value: `${p.progress}%` },
        { source: '剪刀差', value: `${fmt(exec - p.progress)} 个百分点` },
      ],
      action: '按里程碑重排资金计划，未启动的工作包暂缓采购与外包投入；对已花费部分做挣值分析（EV / AC）复核。',
    });
  }

  if (blockedGates.length) {
    out.push({
      id: `${p.id}-gate`,
      level: 'danger',
      weight: 99,
      title: `质量门禁 ${blockedGates.join(' / ')} 未通过，发布准入不成立`,
      signals: blockedGates.map((gid) => {
        const g = GATES.find((x) => x.id === gid);
        return {
          source: `GATES[${gid}].actual`,
          value: g ? g.actual.filter((a) => a.includes('✗')).slice(0, 2).join('；') || `通过率 ${g.passRate}%` : '—',
        };
      }),
      action: '门禁未过不谈发布窗口：先补齐硬性条件，或由例外审批人签署降级方案并把受影响范围移出本次发布。',
    });
  }

  out.push({
    id: `${p.id}-health`,
    level: p.healthScore < 50 ? 'danger' : p.healthScore < 75 ? 'warn' : p.healthScore < 85 ? 'info' : 'ok',
    weight: p.healthScore < 50 ? 94 : p.healthScore < 75 ? 72 : p.healthScore < 85 ? 40 : 16,
    title: `健康度综合评分 ${p.healthScore} 分（${HEALTH_META[p.health].label}）`,
    signals: [
      { source: 'ProjectDef.healthScore', value: `${p.healthScore} / 100` },
      {
        source: '加权构成',
        value: `进度偏差 ${signed(p.scheduleVariancePct)} · 变更率 ${fmt(p.reqChangeRatePct)}% · 缺陷密度 ${fmt(p.defectDensity, 2)} · 资源利用 ${p.resourceUtilizationPct}%`,
      },
    ],
    action:
      p.healthScore < 75
        ? '纳入 PMO 周度重点盯盘清单，每周复核一次评分构成并跟踪缓解措施闭环。'
        : '维持双周例行巡检，评分构成变化超过 5 分时再触发专项复核。',
  });

  return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

/** 一条 AI 沟通建议 */
interface CommAdvice {
  id: string;
  sh: StakeholderDef;
  urgent: boolean;
  signals: string[];
  action: string;
  due: string;
}

/**
 * 由 STAKEHOLDERS 的既有字段派生沟通建议：
 *   ① 影响力 high 但沟通频率为「双周 / 每月」→ 频率与影响力不匹配
 *   ② expectation 含硬性红线词（必须 / 不接受 / 否则 / 不签发）→ 需当面对齐
 *   ③ userId 为 null（平台外干系人）→ 平台内无协作痕迹，需线下同步
 *   ④ raci === 'A' → 唯一问责人，需前置简报
 *   ⑤ 关联项目数 ≥ 4 → 跨项目共享干系人，需组合级统一口径
 */
function buildCommAdvice(): CommAdvice[] {
  const list: CommAdvice[] = [];
  STAKEHOLDERS.forEach((sh) => {
    const signals: string[] = [];
    const freqLow = /双周|每月/.test(sh.communicationFreq);
    if (sh.influence === 'high' && freqLow) {
      signals.push(`影响力「高」但沟通频率为「${sh.communicationFreq.split('（')[0]}」，触达密度不足`);
    }
    const hardline = sh.expectation.match(/必须|不接受|否则|不签发/g);
    if (hardline) {
      signals.push(`诉求中含硬性红线表述「${Array.from(new Set(hardline)).join(' / ')}」`);
    }
    if (!sh.userId) {
      signals.push(`平台外干系人（${sh.externalName.split('·')[1]?.trim() ?? '外部组织'}），平台内无协作痕迹可追踪`);
    }
    if (sh.raci === 'A') {
      signals.push('登记册中唯一的 A（最终问责人），决策链顶端');
    }
    const pc = projectCountOf(sh.id);
    if (pc >= 4) {
      signals.push(`同时出现在 ${pc} 个项目的干系人清单中，口径需组合级统一`);
    }
    if (!signals.length) return;

    const urgent = Boolean(hardline) || sh.raci === 'A' || (sh.influence === 'high' && freqLow);
    let action: string;
    let due: string;
    if (sh.raci === 'A') {
      action = `在 ${md(TODAY)} 当日 17:00 前提交一页纸决策简报（现状 / 两个可选方案 / 资源诉求），并预约下一次指导委员会前的 15 分钟预沟通；简报由 ag-ba 自动生成初稿，${sh.displayName} 只做签核。`;
      due = '今日 17:00 前';
    } else if (hardline) {
      action = `就红线「${cut(sh.expectation, 34)}」安排一次 30 分钟当面对齐，带着可验证的证据（门禁实测值、用例执行率、迁移窗口方案）而非结论，会后 2 小时内回写会议纪要并同步到风险登记册。`;
      due = '48 小时内';
    } else if (sh.influence === 'high' && freqLow) {
      action = `把沟通频率由「${sh.communicationFreq.split('（')[0]}」提升为每周一次，形式改为 15 分钟站会 + 飞书文档异步补充；每次同步固定三块内容：进度偏差、阻塞项、需其决策的事项。`;
      due = '本迭代内生效';
    } else if (pc >= 4) {
      action = `建立跨 ${pc} 个项目的统一口径视图（进度 / 风险 / 资源），由其一次性评审而非逐项目重复汇报，减少口径冲突。`;
      due = 'SP-25 第一周';
    } else {
      action = '维持既有沟通节奏，在其关注的议题上提供异步文档即可，无需增加会议。';
      due = '按需';
    }

    list.push({ id: sh.id, sh, urgent, signals, action, due });
  });
  return list.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.signals.length - a.signals.length || a.id.localeCompare(b.id));
}

/** 一条 AI 里程碑延期预测 */
interface MsForecast {
  id: string;
  level: 'danger' | 'warn' | 'ok';
  text: string;
  slipDays: number;
  confidencePct: number;
}

/**
 * 由 PROJECT_MILESTONES 的 plannedDate / forecastDate / progress 与 ProjectDef.scheduleVariancePct 派生延期预测：
 *   滑移天数 = forecastDate − plannedDate；
 *   置信度 = 已完成 96 / 进行中按 progress 折算 / 待开始取 40 起步，再按 |进度偏差| 折减。
 */
function buildMsForecast(project: ProjectDef, items: ProjectMilestoneDef[]): MsForecast[] {
  const pending = items.filter((m) => m.status !== '已完成' && m.status !== '已取消');
  return pending
    .map((m) => {
      const slip = diffDays(m.plannedDate, m.forecastDate);
      const base = m.status === '进行中' ? 40 + m.progress * 0.4 : 40;
      const confidence = Math.round(Math.max(20, Math.min(95, base - Math.abs(project.scheduleVariancePct) * 1.6)));
      const level: MsForecast['level'] = slip >= 10 ? 'danger' : slip > 0 ? 'warn' : 'ok';
      const text =
        slip > 0
          ? `${m.name}：计划 ${m.plannedDate}，按当前速率预测 ${m.forecastDate}，预计延期 ${slip} 天。`
          : `${m.name}：计划 ${m.plannedDate}，当前速率下可按期完成，无预测滑移。`;
      return { id: m.id, level, text, slipDays: slip, confidencePct: confidence };
    })
    .sort((a, b) => b.slipDays - a.slipDays);
}

/* ================================================================== 小型展示组件 */

/** 成员头像 + 姓名 + 岗位 */
function PersonCell({ userId, size = 'sm', showTitle = true }: { userId: string; size?: 'xs' | 'sm' | 'lg'; showTitle?: boolean }) {
  const u = USER_MAP[userId];
  if (!u) return <span className="ac-muted ac-xs">{userId}</span>;
  const sizeCls = size === 'lg' ? 'ac-avatar--lg' : size === 'xs' ? 'ac-avatar--xs' : 'ac-avatar--sm';
  return (
    <span className="ac-user">
      <span className={`ac-avatar ${sizeCls} ${u.isAi ? 'ac-avatar--ai' : AVATAR_TONE[u.avatarColor]}`}>{u.initial}</span>
      <span className="ac-col ac-gap-0">
        <span className="ac-user-name">{u.name}</span>
        {showTitle ? <span className="ac-user-meta">{u.title}</span> : null}
      </span>
    </span>
  );
}

/** 带头像的干系人单元格（平台外干系人显示 externalName / externalOrg） */
function StakeholderCell({ sh }: { sh: StakeholderDef }) {
  if (sh.userId && USER_MAP[sh.userId]) {
    return <PersonCell userId={sh.userId} />;
  }
  const parts = sh.externalName.split('·');
  return (
    <span className="ac-user">
      <span className="ac-avatar ac-avatar--sm ac-pj-avatar-ext">{sh.displayName.slice(0, 1)}</span>
      <span className="ac-col ac-gap-0">
        <span className="ac-user-name">
          {sh.displayName}
          <span className="ac-tag ac-tag--sm ac-tag--outline ac-ml-1">平台外</span>
        </span>
        <span className="ac-user-meta">{(parts[1] ?? '').trim()}</span>
      </span>
    </span>
  );
}

/** 采纳 / 驳回 按钮组（本地 state 乐观更新） */
function AiVoteBar({
  state,
  onVote,
}: {
  state: 'accepted' | 'rejected' | undefined;
  onVote: (v: 'accepted' | 'rejected') => void;
}) {
  if (state === 'accepted') {
    return (
      <span className="ac-tag ac-tag--sm ac-tag--ok">
        <CheckCircle2 size={12} />
        已采纳
      </span>
    );
  }
  if (state === 'rejected') {
    return (
      <span className="ac-tag ac-tag--sm ac-tag--neutral">
        <XCircle size={12} />
        已驳回
      </span>
    );
  }
  return (
    <span className="ac-row ac-gap-1">
      <button type="button" className="ac-btn ac-btn--sm ac-btn--primary" onClick={() => onVote('accepted')}>
        <CheckCircle2 size={12} />
        采纳
      </button>
      <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => onVote('rejected')}>
        <XCircle size={12} />
        驳回
      </button>
    </span>
  );
}

/* ================================================================== 抽屉内容 */

type PjDrawer =
  | { kind: 'risk'; risk: ProjectRiskDef }
  | { kind: 'sh'; sh: StakeholderDef }
  | { kind: 'ms'; ms: ProjectMilestoneDef }
  | null;

/** 风险详情抽屉内容 */
function RiskDrawerBody({ risk }: { risk: ProjectRiskDef }) {
  const owner = USER_MAP[risk.owner];
  const project = PROJECTS.find((p) => p.id === risk.projectId);
  return (
    <>
      {risk.detectedBy === 'ai' ? (
        <div className="ac-ai-block ac-mb-4">
          <div className="ac-ai-block-title">
            <Sparkles size={14} />
            AI 识别 · 信号证据链
          </div>
          <div className="ac-mt-2">{risk.aiEvidence}</div>
          <div className="ac-xs ac-mt-2 ac-pj-ai-note">
            识别时间 {risk.detectedAt} · 证据来自平台内真实指标采样，人工可在风险登记册中改判发现方式与评分。
          </div>
        </div>
      ) : (
        <div className="ac-hint ac-mb-4">
          <UserCheck size={14} />
          <span>
            本条由人工于 {risk.detectedAt} 登记，无 AI 证据链；AI 仅在后续复评时给出评分建议，不覆盖人工结论。
          </span>
        </div>
      )}

      <dl className="ac-kv ac-mb-4">
        <dt>风险编号</dt>
        <dd className="ac-mono ac-brand-text">{risk.id}</dd>
        <dt>所属项目</dt>
        <dd>
          {project ? `${project.name}（${project.code}）` : risk.projectId}
        </dd>
        <dt>概率 × 影响</dt>
        <dd>
          {PI_META[risk.probability].label}（{PI_META[risk.probability].value}） × {PI_META[risk.impact].label}（
          {PI_META[risk.impact].value}） = <span className="ac-bold">{risk.score}</span>
        </dd>
        <dt>状态</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${RISK_STATUS[risk.status].tagTone}`}>
            {RISK_STATUS[risk.status].label}
          </span>
        </dd>
        <dt>责任人</dt>
        <dd>{owner ? `${owner.name} · ${owner.title}` : risk.owner}</dd>
        <dt>发现方式</dt>
        <dd>
          {risk.detectedBy === 'ai' ? (
            <span className="ac-tag ac-tag--sm ac-tag--ai">
              <Sparkles size={11} />
              AI 识别 · {risk.detectedAt}
            </span>
          ) : (
            <span className="ac-tag ac-tag--sm ac-tag--outline">人工登记 · {risk.detectedAt}</span>
          )}
        </dd>
      </dl>

      <div className="ac-section-title">风险描述</div>
      <p className="ac-pj-para">{risk.desc}</p>

      <div className="ac-section-title">缓解措施</div>
      <p className="ac-pj-para">{risk.mitigation}</p>

      <div className="ac-section-title">应急预案（缓解失效时启动）</div>
      <div className="ac-hint ac-hint--warn">
        <AlertTriangle size={14} />
        <span>{risk.contingency}</span>
      </div>
    </>
  );
}

/** 干系人详情抽屉内容 */
function StakeholderDrawerBody({ sh }: { sh: StakeholderDef }) {
  const projects = PROJECTS.filter((p) => p.stakeholderIds.includes(sh.id));
  const domains = DECISION_DOMAINS.filter((d) => d.raci[sh.id]);
  return (
    <>
      <div className="ac-pj-sh-head">
        <StakeholderCell sh={sh} />
        <span className={`ac-tag ac-tag--${sh.raci === 'A' ? 'danger' : TAG_TONE[sh.tone]}`}>
          {RACI_META[sh.raci].label}
        </span>
      </div>

      <dl className="ac-kv ac-mb-4">
        <dt>登记编号</dt>
        <dd className="ac-mono">{sh.id}</dd>
        <dt>主责项目</dt>
        <dd>{PROJECTS.find((p) => p.id === sh.projectId)?.name ?? sh.projectId}</dd>
        <dt>职责</dt>
        <dd>{sh.role}</dd>
        <dt>影响力</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${INFLUENCE_META[sh.influence].tagTone}`}>
            {INFLUENCE_META[sh.influence].label}（{INFLUENCE_META[sh.influence].value} / 3）
          </span>
        </dd>
        <dt>利益相关度</dt>
        <dd className="ac-tnum">
          {fmt(interestScore(sh), 2)} / 3 · 分区「{piZone(interestScore(sh), INFLUENCE_META[sh.influence].value)}」
        </dd>
        <dt>沟通频率</dt>
        <dd>{sh.communicationFreq}</dd>
        <dt>平台账号</dt>
        <dd className="ac-mono">{sh.userId ? `${sh.userId} · ${USER_MAP[sh.userId]?.email ?? '—'}` : sh.externalName}</dd>
      </dl>

      <div className="ac-section-title">关注点</div>
      <p className="ac-pj-para">{sh.interest}</p>

      <div className="ac-section-title">当前诉求 / 异议</div>
      <div className="ac-hint ac-hint--warn">
        <MessageSquare size={14} />
        <span>{sh.expectation}</span>
      </div>

      <div className="ac-section-title">决策域 RACI 落位</div>
      <div className="ac-pj-domain-list">
        {domains.map((d) => (
          <div className="ac-pj-domain-item" key={d.id}>
            <span className={`ac-pj-raci-cell ${RACI_META[d.raci[sh.id]].cls}`}>{d.raci[sh.id]}</span>
            <span className="ac-col ac-gap-0">
              <span className="ac-semi ac-text-1 ac-sm">{d.name}</span>
              <span className="ac-xs ac-muted">{d.decision}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="ac-section-title">关联项目（{projects.length}）</div>
      <div className="ac-row ac-gap-1 ac-wrap">
        {projects.map((p) => (
          <span key={p.id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[p.tone]}`}>
            {p.name}
          </span>
        ))}
      </div>
    </>
  );
}

/** 里程碑详情抽屉内容 */
function MilestoneDrawerBody({ ms }: { ms: ProjectMilestoneDef }) {
  const gate = GATES.find((g) => g.id === ms.gateId);
  const owner = USER_MAP[ms.ownerId];
  const project = PROJECTS.find((p) => p.id === ms.projectId);
  const slip = ms.forecastDate !== ms.plannedDate ? diffDays(ms.plannedDate, ms.forecastDate) : 0;
  return (
    <>
      <dl className="ac-kv ac-mb-4">
        <dt>里程碑</dt>
        <dd className="ac-mono">{ms.id}</dd>
        <dt>所属项目</dt>
        <dd>{project ? `${project.name}（${project.code}）` : ms.projectId}</dd>
        <dt>状态</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${MS_STATUS_TAG[ms.status]}`}>{ms.status}</span>
          <span className="ac-xs ac-muted ac-ml-1">进度 {ms.progress}%</span>
        </dd>
        <dt>计划日期</dt>
        <dd className="ac-mono">{ms.plannedDate}</dd>
        <dt>实际日期</dt>
        <dd className="ac-mono">{ms.actualDate || '—'}</dd>
        <dt>AI 预测日期</dt>
        <dd className="ac-mono">
          {ms.forecastDate}
          {slip > 0 ? <span className="ac-danger-text ac-xs ac-ml-1">较计划 +{slip} 天</span> : null}
        </dd>
        <dt>负责人</dt>
        <dd>{owner ? `${owner.name} · ${owner.title}` : ms.ownerId}</dd>
        <dt>关联门禁</dt>
        <dd>
          {gate ? (
            <span className={`ac-tag ac-tag--sm ac-tag--${GATE_STATUS[gate.status].tagTone}`}>
              {gate.id} {gate.name} · {GATE_STATUS[gate.status].label}（{gate.passRate}%）
            </span>
          ) : (
            ms.gateId
          )}
        </dd>
        <dt>登记滑移</dt>
        <dd>
          {ms.slipDays > 0 ? (
            <span className="ac-danger-text">{ms.slipDays} 天</span>
          ) : (
            <span className="ac-ok-text">无滑移</span>
          )}
        </dd>
      </dl>

      <div className="ac-section-title">交付物（{ms.deliverables.length}）</div>
      <ul className="ac-pj-list">
        {ms.deliverables.map((d) => (
          <li key={d}>
            <BadgeCheck size={13} />
            {d}
          </li>
        ))}
      </ul>

      {ms.slipReason ? (
        <>
          <div className="ac-section-title">滑移原因</div>
          <div className="ac-hint ac-hint--danger">
            <AlertTriangle size={14} />
            <span>{ms.slipReason}</span>
          </div>
        </>
      ) : null}

      {gate ? (
        <>
          <div className="ac-section-title">门禁实测（{gate.id}）</div>
          <div className="ac-pj-gate-actual">
            {gate.actual.map((a, i) => (
              <div className="ac-pj-gate-row" key={a}>
                <span className="ac-xs ac-muted ac-mono">{gate.criteria[i] ? `条件 ${i + 1}` : `实测 ${i + 1}`}</span>
                <span className="ac-xs ac-text-2">{gate.criteria[i] ?? '—'}</span>
                <span className={`ac-xs ${a.includes('✗') ? 'ac-danger-text' : a.includes('△') ? 'ac-warn-text' : 'ac-ok-text'}`}>
                  {a}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

/* ============================================== 录入项目（本地草稿态，不回写 data-mgmt） */

/**
 * 录入项目表单值。
 * 约定：数值 / 日期字段一律用 string 承载，空串即「未填」，便于必填与区间校验；
 *      techStack / sprintIds 为多选，直接用 string[]。
 */
interface CreateForm {
  code: string;
  name: string;
  ownerId: string;
  managerId: string;
  phase: string;
  startDate: string;
  endDate: string;
  budgetWan: string;
  headcount: string;
  keyObjective: string;
  desc: string;
  techStack: string[];
  sprintIds: string[];
}

const EMPTY_FORM: CreateForm = {
  code: '',
  name: '',
  ownerId: '',
  managerId: '',
  phase: '立项',
  startDate: '',
  endDate: '',
  budgetWan: '',
  headcount: '',
  keyObjective: '',
  desc: '',
  techStack: [],
  sprintIds: [],
};

/** 阶段候选：与 ProjectDef.phase 的 7 个枚举值一致，顺序即生命周期顺序 */
const CREATE_PHASES: ProjectDef['phase'][] = ['立项', '规划', '研发', '测试', '发布', '运维', '已结项'];
const PHASE_OPTIONS: FieldOption[] = CREATE_PHASES.map((p) => ({ value: p, label: p }));

/** 负责人 / 项目经理候选：USERS 中的真人成员（isAi 的 Agent 账号不可担任） */
const MEMBER_OPTIONS: FieldOption[] = USERS.filter((u) => !u.isAi).map((u) => ({
  value: u.id,
  label: `${u.name} · ${u.title}`,
  title: `${u.dept} · ${u.account}`,
}));

/** 关联迭代候选：SPRINTS 全量，label 带起止日期便于判断是否落在项目周期内 */
const SPRINT_OPTIONS: FieldOption[] = SPRINTS.map((s) => ({
  value: s.id,
  label: `${s.name}（${s.startDate} ~ ${s.endDate}）`,
  title: s.theme,
}));

/** 技术栈候选：PROJECTS 既有 6 个项目 techStack 去重后的并集 */
const TECH_OPTIONS: FieldOption[] = Array.from(new Set(PROJECTS.flatMap((p) => p.techStack))).map((t) => ({
  value: t,
  label: t,
}));

/** 组合人力基准 = PRJ-01（订单中心重构）编制 9 人；对应组合人力利用率均值 82% */
const BASE_HEADCOUNT = CURRENT_PROJECT.headcount;
const BASE_UTILIZATION_PCT = 82;

/** 4 条里程碑建议在项目周期上的插值位置（15% / 40% / 75% / 100%） */
const MS_RATIOS: { name: string; ratio: number }[] = [
  { name: '立项评审', ratio: 0.15 },
  { name: '架构基线冻结', ratio: 0.4 },
  { name: '联调完成', ratio: 0.75 },
  { name: '生产切流', ratio: 1 },
];

/** 会影响 AI 推导结果的表单字段（变更后需同步刷新推导说明） */
const AI_INPUT_KEYS: (keyof CreateForm)[] = [
  'phase',
  'headcount',
  'budgetWan',
  'startDate',
  'endDate',
  'keyObjective',
];

/** AI 辅助立项的前置条件提示：名称与关键目标同时为空时给出，条件满足后自动清除 */
const AI_NEED_INPUT_MSG = '请先填写项目名称与关键目标，AI 才能推导';

/**
 * 日期插值：在 [start, end] 上按 ratio 取整到日。
 * 解析统一补 'T00:00:00Z'、输出用 toISOString()，即全程按 UTC 计算，避免本地时区导致 ±1 天偏移。
 */
function interpDate(start: string, end: string, ratio: number): string {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return '';
  return new Date(s + Math.round((e - s) * ratio)).toISOString().slice(0, 10);
}

/** AI 辅助立项的推导结果：全部由表单值确定性算出，不含任何随机量 */
interface AiDraft {
  healthScore: number;
  health: ProjectDef['health'];
  tone: Tone;
  statusLabel: string;
  resourceUtilizationPct: number;
  milestones: { name: string; date: string }[];
  note: string;
}

/**
 * AI 辅助立项推导规则（口径与 PROJECTS 既有 6 个项目对齐）：
 *  - 阶段基准分：立项 / 规划 85、研发 72、测试 76、发布 / 运维 / 已结项 80；
 *  - 规模修正：编制 > 8 人 −4；预算 > 800 万元 −3；关键目标不含任何数字 −6；结果 clamp 到 [40, 95]；
 *  - 健康灯：≥85 green / 70~84 amber / <70 red；
 *  - 人力利用率 = min(100, round(headcount ÷ 9 × 82))，9 为 PRJ-01 编制；
 *  - 进度 / 已花费 / 偏差 / 变更率 / 缺陷密度一律 0（新建项目尚无实测数据）。
 */
function deriveAiDraft(form: CreateForm): AiDraft {
  const headcount = Number(form.headcount) || 0;
  const budgetWan = Number(form.budgetWan) || 0;
  const phase = form.phase as ProjectDef['phase'];

  let score = phase === '立项' || phase === '规划' ? 85 : phase === '研发' ? 72 : phase === '测试' ? 76 : 80;
  const adjusts: string[] = [`阶段「${phase}」基准 ${score} 分`];
  if (headcount > 8) {
    score -= 4;
    adjusts.push(`编制 ${headcount} 人 > 8 人（PRJ-01 为 9 人），跨组协同成本上升 −4 分`);
  }
  if (budgetWan > 800) {
    score -= 3;
    adjusts.push(`预算 ${num(budgetWan)} 万元 > 800 万元（组合最大值 PRJ-01），资金敞口 −3 分`);
  }
  if (/\d/.test(form.keyObjective)) {
    adjusts.push('关键目标含数字口径（如 P99 / 错误率 / TPS），验收可度量，不扣分');
  } else {
    score -= 6;
    adjusts.push('关键目标未出现任何数字，验收口径不可度量 −6 分');
  }
  score = Math.max(40, Math.min(95, score));

  const health: ProjectDef['health'] = score >= 85 ? 'green' : score >= 70 ? 'amber' : 'red';
  const tone: Tone =
    phase === '立项' || phase === '规划'
      ? 'info'
      : phase === '研发'
        ? 'brand'
        : phase === '测试'
          ? 'warn'
          : phase === '发布' || phase === '运维'
            ? 'ok'
            : 'neutral';
  const statusLabel = `${phase} · 新建待同步`;
  const resourceUtilizationPct = headcount > 0
    ? Math.min(100, Math.round((headcount / BASE_HEADCOUNT) * BASE_UTILIZATION_PCT))
    : 0;
  const milestones = form.startDate && form.endDate
    ? MS_RATIOS.map((m) => ({ name: m.name, date: interpDate(form.startDate, form.endDate, m.ratio) })).filter(
        (m) => m.date,
      )
    : [];

  const avgScore = fmt(PROJECTS.reduce((s, p) => s + p.healthScore, 0) / PROJECTS.length, 1);
  const agentName = agents.find((a) => a.id === 'ag-pm')?.name ?? 'ag-pm';
  const modelName = models.find((m) => m.id === 'mdl-local')?.name ?? 'mdl-local';
  const note =
    `由 ag-pm（数据集登记名「${agentName}」，在本页承担项目管家角色）按确定性规则本地推导，` +
    `路由模型 mdl-local（${modelName} · 禁止出域），未调用任何外部大模型。` +
    `依据：① 组合基线 —— PROJECTS 既有 ${PROJECTS.length} 个项目健康度均值 ${avgScore} 分；` +
    `② ${adjusts.join('；')}；` +
    `③ 结论 —— 健康分 ${score}（${HEALTH_META[health].label}）、tone = ${tone}、statusLabel =「${statusLabel}」；` +
    `④ 进度 / 已花费 / 进度偏差 / 需求变更率 / 缺陷密度均置 0（新建项目尚无实测数据），` +
    `人力利用率 = min(100, round(${headcount} ÷ ${BASE_HEADCOUNT} × ${BASE_UTILIZATION_PCT})) = ${resourceUtilizationPct}%` +
    `（${BASE_HEADCOUNT} 为 PRJ-01 编制，作为组合均值基准）。` +
    `里程碑建议（按起止日期 15% / 40% / 75% / 100% 插值，仅为建议文本，不写入 milestoneIds）：` +
    `${milestones.length ? milestones.map((m) => `${m.name} ${m.date}`).join('；') : '起止日期未填写，补齐后可重新推导'}。`;

  return { healthScore: score, health, tone, statusLabel, resourceUtilizationPct, milestones, note };
}

/** 录入项目全量校验：返回 { 字段: 错误文案 }，空对象表示可提交 */
function validateCreate(form: CreateForm, existing: ProjectDef[]): Record<string, string> {
  const e: Record<string, string | undefined> = {
    code: requireText(form.code, '项目编号'),
    name: requireText(form.name, '项目名称'),
    ownerId: form.ownerId ? '' : '请选择项目负责人',
    managerId: form.managerId ? '' : '请选择项目经理',
    phase: requireText(form.phase, '项目阶段'),
    headcount: requireNumber(form.headcount, '编制人数', 1, 200),
    budgetWan: requireNumber(form.budgetWan, '项目预算', 1, 100000),
    startDate: form.startDate ? '' : '请选择开始日期',
    endDate: form.endDate ? '' : '请选择结束日期',
    keyObjective: requireText(form.keyObjective, '关键目标'),
  };

  const code = form.code.trim();
  const name = form.name.trim();
  if (!e.code && existing.some((p) => p.code === code)) e.code = `项目编号 ${code} 已存在`;
  if (!e.name && existing.some((p) => p.name === name)) e.name = `项目名称「${name}」已存在`;
  if (!e.keyObjective && form.keyObjective.trim().length < 10) {
    e.keyObjective = '关键目标过短，请补充可量化验收口径';
  }
  if (!e.startDate && !e.endDate) {
    const range = checkDateRange(form.startDate, form.endDate, '项目周期');
    if (range) e.endDate = range;
    else if (form.endDate < TODAY) e.endDate = `结束日期不得早于今日 ${TODAY}`;
  }
  return cleanErrors(e);
}

/* ================================================================== 主组件 */

type PjSortKey =
  | 'name'
  | 'phase'
  | 'healthScore'
  | 'progress'
  | 'scheduleVariancePct'
  | 'reqChangeRatePct'
  | 'defectDensity'
  | 'resourceUtilizationPct'
  | 'budgetExec'
  | 'risks';

export default function ProjectPage() {
  const [tab, setTab] = useState<TabId>('portfolio');
  const [drawer, setDrawer] = useState<PjDrawer>(null);

  /* ---- 项目组合：筛选 / 搜索 / 排序 ---- */
  const [healthFilter, setHealthFilter] = useState<'all' | ProjectDef['health']>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<PjSortKey>('healthScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  /* ---- 当前项目：选择器 ---- */
  const [detailId, setDetailId] = useState<string>(CURRENT_PROJECT.id);

  /* ---- 风险：筛选 ---- */
  const [riskProject, setRiskProject] = useState<string>('all');
  const [riskDetected, setRiskDetected] = useState<'all' | 'ai' | 'human'>('all');

  /* ---- 干系人：筛选 ---- */
  const [shRaci, setShRaci] = useState<'all' | StakeholderDef['raci']>('all');
  const [shKeyword, setShKeyword] = useState('');

  /* ---- AI 建议的本地乐观更新 ---- */
  const [diagVotes, setDiagVotes] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [commVotes, setCommVotes] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [msVotes, setMsVotes] = useState<Record<string, 'accepted' | 'rejected'>>({});

  /* ---- AI 周报状态机（采纳发布 / 重新生成 / 编辑后发布）---- */
  const [report, setReport] = useState<{
    reviewStatus: AiProjectReportDef['reviewStatus'];
    humanEdited: boolean;
    published: 'idle' | 'published' | 'regenerated' | 'edited';
    note: string;
  }>({
    reviewStatus: aiProjectReport.reviewStatus,
    humanEdited: aiProjectReport.humanEdited,
    published: 'idle',
    note: '',
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(aiProjectReport.summary);

  /* ---- 组合级同步状态 ---- */
  const [syncAt, setSyncAt] = useState<string>('');

  /* ---- 录入项目（本地草稿态，不回写 data-mgmt）---- */
  const [createOpen, setCreateOpen] = useState(false);
  /** 本地新建的项目草稿，仅存在于页面 state，刷新即丢失 */
  const [created, setCreated] = useState<ProjectDef[]>([]);
  /** 录入成功后的绿色提示文案 */
  const [createNote, setCreateNote] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** AI 辅助立项的推导依据说明，null 表示尚未推导 */
  const [aiDraft, setAiDraft] = useState<string | null>(null);

  /* ================= 派生数据 ================= */

  /** 组合全集 = PingCode 已同步的 6 个项目 + 本地录入草稿 */
  const allProjects = useMemo(() => [...PROJECTS, ...created], [created]);

  const portfolio = useMemo(() => {
    const total = allProjects.length;
    const green = allProjects.filter((p) => p.health === 'green').length;
    const amber = allProjects.filter((p) => p.health === 'amber').length;
    const red = allProjects.filter((p) => p.health === 'red').length;
    const budget = allProjects.reduce((s, p) => s + p.budgetWan, 0);
    const spent = allProjects.reduce((s, p) => s + p.spentWan, 0);
    const headcount = allProjects.reduce((s, p) => s + p.headcount, 0);
    const avgVariance = allProjects.reduce((s, p) => s + p.scheduleVariancePct, 0) / total;
    const worst = allProjects.reduce((a, b) => (a.scheduleVariancePct < b.scheduleVariancePct ? a : b));
    const aiRisks = PROJECT_RISKS.filter((r) => r.detectedBy === 'ai').length;
    const inFlight = allProjects.filter((p) => p.phase !== '已结项' && p.phase !== '运维').length;
    const ops = allProjects.filter((p) => p.phase === '运维').length;
    const closed = allProjects.filter((p) => p.phase === '已结项').length;
    return { total, green, amber, red, budget, spent, headcount, avgVariance, worst, aiRisks, inFlight, ops, closed };
  }, [allProjects]);

  const phases = useMemo(() => Array.from(new Set(allProjects.map((p) => p.phase))), [allProjects]);

  const compareRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const rows = allProjects.filter((p) => {
      if (healthFilter !== 'all' && p.health !== healthFilter) return false;
      if (phaseFilter !== 'all' && p.phase !== phaseFilter) return false;
      if (!kw) return true;
      const owner = USER_MAP[p.ownerId];
      const manager = USER_MAP[p.managerId];
      return [p.name, p.code, p.id, p.statusLabel, owner?.name ?? '', manager?.name ?? '', p.keyObjective]
        .join(' ')
        .toLowerCase()
        .includes(kw);
    });
    const valueOf = (p: ProjectDef): number | string => {
      switch (sortKey) {
        case 'name':
          return p.name;
        case 'phase':
          return p.phase;
        case 'budgetExec':
          return budgetExecPct(p);
        case 'risks':
          return p.riskIds.length;
        default:
          return p[sortKey];
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'zh-CN') * dir;
      }
      return (va - vb) * dir;
    });
  }, [allProjects, keyword, healthFilter, phaseFilter, sortKey, sortDir]);

  const detailProject = allProjects.find((p) => p.id === detailId) ?? CURRENT_PROJECT;
  const detailMilestones = useMemo(
    () => PROJECT_MILESTONES.filter((m) => detailProject.milestoneIds.includes(m.id)),
    [detailProject],
  );
  const detailSprints = useMemo(
    () => detailProject.sprintIds.map((id) => SPRINT_MAP[id]).filter(Boolean),
    [detailProject],
  );
  const detailReleases = useMemo(
    () => releaseIdsOf(detailProject).map((id) => RELEASE_MAP[id]),
    [detailProject],
  );
  const detailRisks = useMemo(
    () => PROJECT_RISKS.filter((r) => r.projectId === detailProject.id),
    [detailProject],
  );
  const blockedGates = useMemo(
    () => (detailProject.id === CURRENT_PROJECT.id ? GATES.filter((g) => g.status === 'failed').map((g) => g.id) : []),
    [detailProject],
  );
  const diagnoses = useMemo(() => diagnose(detailProject, blockedGates), [detailProject, blockedGates]);

  const currentMilestones = useMemo(
    () => PROJECT_MILESTONES.filter((m) => m.projectId === CURRENT_PROJECT.id),
    [],
  );
  const msForecasts = useMemo(() => buildMsForecast(CURRENT_PROJECT, currentMilestones), [currentMilestones]);

  const commAdvice = useMemo(() => buildCommAdvice(), []);

  const filteredStakeholders = useMemo(() => {
    const kw = shKeyword.trim().toLowerCase();
    return STAKEHOLDERS.filter((sh) => {
      if (shRaci !== 'all' && sh.raci !== shRaci) return false;
      if (!kw) return true;
      return [sh.displayName, sh.role, sh.interest, sh.expectation, sh.externalName, sh.communicationFreq]
        .join(' ')
        .toLowerCase()
        .includes(kw);
    });
  }, [shRaci, shKeyword]);

  const filteredRisks = useMemo(
    () =>
      PROJECT_RISKS.filter((r) => {
        if (riskProject !== 'all' && r.projectId !== riskProject) return false;
        if (riskDetected !== 'all' && r.detectedBy !== riskDetected) return false;
        return true;
      }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
    [riskProject, riskDetected],
  );

  const reportAgent = agents.find((a) => a.id === aiProjectReport.generatedBy);
  const reportModel = models.find((m) => m.id === aiProjectReport.modelId);

  /* ================= 交互 ================= */

  const toggleSort = (key: PjSortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const pickProject = (p: ProjectDef) => {
    setDetailId(p.id);
    setTab('detail');
  };

  const sortIcon = (key: PjSortKey) => {
    if (sortKey !== key) return <ChevronRight size={11} className="ac-pj-sort-idle" />;
    return sortDir === 'asc' ? <TrendingUp size={11} /> : <TrendingDown size={11} />;
  };

  const th = (label: string, key: PjSortKey, align?: string) => (
    <th className={`ac-pj-th-sort ${align ?? ''}`} onClick={() => toggleSort(key)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') toggleSort(key); }}>
      <span className="ac-pj-th-inner">
        {label}
        {sortIcon(key)}
      </span>
    </th>
  );

  const vote = (
    setter: React.Dispatch<React.SetStateAction<Record<string, 'accepted' | 'rejected'>>>,
    id: string,
    v: 'accepted' | 'rejected',
  ) => setter((prev) => ({ ...prev, [id]: v }));

  /* ---- 录入项目 ---- */

  const openCreate = () => {
    setCreateNote(null);
    setCreateOpen(true);
  };

  /**
   * 单字段更新：写入值的同时清掉该字段的既有错误，实现「改即消错」；
   * 若已做过 AI 推导且改动的是推导输入项，同步刷新推导说明，避免文案与最终入库值不一致。
   */
  const patch = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => {
    const next = { ...form, [key]: value } as CreateForm;
    setForm(next);
    setErrors((prev) => ({ ...prev, [key as string]: '' }));
    if (aiDraft !== null && AI_INPUT_KEYS.includes(key)) setAiDraft(deriveAiDraft(next).note);
  };

  const closeCreate = () => setCreateOpen(false);

  /**
   * AI 辅助立项：确定性推导（无 Math.random），把健康度 / tone / 状态标签 / 利用率回填到表单口径，
   * 并把推导依据与 4 条里程碑建议写入 aiDraft 供人工核对；不写入 milestoneIds。
   */
  const runAiDraft = () => {
    if (!form.name.trim() && !form.keyObjective.trim()) {
      setErrors((prev) => ({ ...prev, name: AI_NEED_INPUT_MSG, keyObjective: AI_NEED_INPUT_MSG }));
      return;
    }
    setAiDraft(deriveAiDraft(form).note);
    /* 仅清除前置条件提示，其余校验错误（如编号重复）保留到提交时统一复核 */
    setErrors((prev) => ({
      ...prev,
      name: prev.name === AI_NEED_INPUT_MSG ? '' : prev.name,
      keyObjective: prev.keyObjective === AI_NEED_INPUT_MSG ? '' : prev.keyObjective,
    }));
  };

  /** 提交：全量校验 → 组装完整 ProjectDef → 追加到本地 created（不回写 data-mgmt） */
  const submitCreate = () => {
    const next = validateCreate(form, allProjects);
    setErrors(next);
    if (Object.keys(next).length) return;

    const draft = aiDraft ? deriveAiDraft(form) : null;
    const phase = form.phase as ProjectDef['phase'];
    const id = `PRJ-${String(PROJECTS.length + created.length + 1).padStart(2, '0')}`;
    const item: ProjectDef = {
      id,
      code: form.code.trim(),
      name: form.name.trim(),
      ownerId: form.ownerId,
      managerId: form.managerId,
      phase,
      statusLabel: draft?.statusLabel ?? `${phase} · 新建待同步`,
      tone: draft?.tone ?? 'neutral',
      health: draft?.health ?? 'green',
      healthScore: draft?.healthScore ?? 0,
      startDate: form.startDate,
      endDate: form.endDate,
      budgetWan: Number(form.budgetWan) || 0,
      spentWan: 0,
      headcount: Number(form.headcount) || 0,
      progress: 0,
      scheduleVariancePct: 0,
      reqChangeRatePct: 0,
      defectDensity: 0,
      resourceUtilizationPct: draft?.resourceUtilizationPct ?? 0,
      sprintIds: [...form.sprintIds],
      milestoneIds: [],
      stakeholderIds: [],
      riskIds: [],
      desc: form.desc.trim(),
      keyObjective: form.keyObjective.trim(),
      techStack: [...form.techStack],
      isCurrent: false,
    };

    setCreated((prev) => [...prev, item]);
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setAiDraft(null);
    setCreateNote(
      `已录入项目「${item.name}」（${item.code} · ${item.id}），当前为本地草稿态：` +
        `已计入项目组合指标卡与对比表（共 ${allProjects.length + 1} 个项目），尚未回写 PingCode；` +
        `散点图与 AI 周报仍按已同步的 ${PROJECTS.length} 个项目绘制，提交后纳入下一轮同步。`,
    );
  };

  /** 待修正字段数（patch 会把已修正字段置为空串，故按非空值计数） */
  const errorCount = Object.values(errors).filter(Boolean).length;

  /* ================= 渲染 ================= */

  return (
    <div className="ac-pj" data-annotation-id="ai-sdlc-project-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">项目管理</div>
          <div className="ac-page-desc">
            以项目组合为单位统一治理进度、成本、质量、干系人与风险，并让 AI 承担「健康诊断 / 里程碑延期预测 /
            沟通建议 / 周报生成」四类重复性分析工作。所有指标口径与贯穿案例「订单中心重构」（
            <span className="ac-mono">EPIC-ORDER-REF</span>，PRJ-01 · Sprint 24 · 今日 {TODAY}）完全一致；
            预算单位为万元，进度偏差 = 实体进度 − 基线进度，需求变更率 = 已变更需求条数 ÷ 基线需求条数。
          </div>
        </div>
        <div className="ac-page-actions">
          <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={openCreate}>
            <Plus size={13} />
            录入项目
          </button>
          <span className="ac-tag ac-tag--outline">
            <CalendarClock size={12} />
            今日 {TODAY}
          </span>
          <span className={`ac-tag ac-tag--${HEALTH_META[CURRENT_PROJECT.health].tagTone}`}>
            <span className="ac-tag-dot" />
            当前项目 {CURRENT_PROJECT.name} · {CURRENT_PROJECT.healthScore} 分
          </span>
          <span className="ac-tag ac-tag--ai">
            <Sparkles size={12} />
            AI 识别风险 {portfolio.aiRisks} / {PROJECT_RISKS.length}
          </span>
          <button
            type="button"
            className="ac-btn ac-btn--ghost ac-btn--sm"
            onClick={() => setSyncAt(`${TODAY} ${new Date().toTimeString().slice(0, 5)}`)}
          >
            <RefreshCw size={13} />
            {syncAt ? `已同步 ${syncAt}` : '同步 PingCode 项目组合'}
          </button>
        </div>
      </div>

      {/* ---------- 页签 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              className={`ac-tab ${tab === t.id ? 'ac-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={14} />
              {t.name}
              <span className="ac-tab-count">{t.id === 'portfolio' ? allProjects.length : t.count}</span>
            </button>
          );
        })}
      </div>

      {syncAt ? (
        <div className="ac-hint ac-hint--ok">
          <CheckCircle2 size={14} />
          <span>
            已于 {syncAt} 从 PingCode 拉取 {allProjects.length} 个项目的进度、预算与工作项映射，
            本地口径与远端一致；{PROJECTS.filter((p) => p.sprintIds.length === 0).length} 个项目使用独立迭代序列，未纳入本原型 SPRINTS 数据集。
            {created.length ? `其中 ${created.length} 个为本地录入草稿，尚未回写 PingCode。` : ''}
          </span>
        </div>
      ) : null}

      {createNote ? (
        <div className="ac-hint ac-hint--ok">
          <CheckCircle2 size={14} />
          <span>{createNote}</span>
          <button
            type="button"
            className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto"
            onClick={() => setCreateNote(null)}
          >
            收起
          </button>
        </div>
      ) : null}

      {/* ==================== 1. 项目组合 ==================== */}
      {tab === 'portfolio' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--6 ac-mb-0" data-annotation-id="ai-sdlc-project-portfolio-metrics">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">项目总数</span>
                <span className="ac-metric-icon">
                  <FolderKanban size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {portfolio.total}
                <span className="ac-metric-unit">个</span>
              </div>
              <div className="ac-metric-foot">
                在建 {portfolio.inFlight} · 运维 {portfolio.ops} · 已结项 {portfolio.closed}
              </div>
            </div>

            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head">
                <span className="ac-metric-label">健康度分布</span>
                <span className="ac-metric-icon">
                  <Gauge size={14} />
                </span>
              </div>
              <div className="ac-metric-value ac-pj-metric-health">
                <span className="ac-ok-text">{portfolio.green}</span>
                <span className="ac-muted">/</span>
                <span className="ac-warn-text">{portfolio.amber}</span>
                <span className="ac-muted">/</span>
                <span className="ac-danger-text">{portfolio.red}</span>
              </div>
              <div className="ac-metric-foot">绿 / 黄 / 红，红灯项目需 PMO 周度盯盘</div>
            </div>

            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">预算与花费</span>
                <span className="ac-metric-icon">
                  <Wallet size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {num(portfolio.spent)}
                <span className="ac-metric-unit">/ {num(portfolio.budget)} 万元</span>
              </div>
              <div className="ac-metric-foot">
                组合执行率 {fmt((portfolio.spent / portfolio.budget) * 100)}%
              </div>
            </div>

            <div className="ac-metric ac-metric--danger">
              <div className="ac-metric-head">
                <span className="ac-metric-label">平均进度偏差</span>
                <span className="ac-metric-icon">
                  <Compass size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {fmt(portfolio.avgVariance)}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">
                最差 {portfolio.worst.name} {signed(portfolio.worst.scheduleVariancePct)}
              </div>
            </div>

            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">投入人力</span>
                <span className="ac-metric-icon">
                  <Users size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {portfolio.headcount}
                <span className="ac-metric-unit">人</span>
              </div>
              <div className="ac-metric-foot">按项目 headcount 直接求和，含跨项目重复投入</div>
            </div>

            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">AI 识别风险</span>
                <span className="ac-metric-icon">
                  <Sparkles size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {portfolio.aiRisks}
                <span className="ac-metric-unit">/ {PROJECT_RISKS.length} 条</span>
              </div>
              <div className="ac-metric-foot">
                占比 {fmt((portfolio.aiRisks / PROJECT_RISKS.length) * 100, 0)}%，均附证据链
              </div>
            </div>
          </div>

          <div className="ac-section-title">项目卡片</div>
          <div className="ac-grid-3" data-annotation-id="ai-sdlc-project-portfolio-cards">
            {PROJECTS.map((p) => {
              const owner = USER_MAP[p.ownerId];
              const ms = PROJECT_MILESTONES.filter((m) => p.milestoneIds.includes(m.id));
              const next =
                ms.find((m) => m.status === '进行中') ??
                ms.filter((m) => m.status === '待开始').sort((a, b) => dayIdx(a.plannedDate) - dayIdx(b.plannedDate))[0] ??
                ms[ms.length - 1];
              const risks = PROJECT_RISKS.filter((r) => r.projectId === p.id);
              const exec = budgetExecPct(p);
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`ac-pj-card ${p.isCurrent ? 'ac-pj-card--current' : ''}`}
                  onClick={() => pickProject(p)}
                >
                  <div className="ac-pj-card-head">
                    <span className="ac-col ac-gap-0 ac-flex-1">
                      <span className="ac-pj-card-name">{p.name}</span>
                      <span className="ac-xs ac-muted ac-mono">
                        {p.code} · {p.id}
                      </span>
                    </span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[PHASE_TONE[p.phase]]}`}>{p.phase}</span>
                  </div>

                  <div className="ac-pj-card-health">
                    <span className={`ac-pj-dot ac-pj-dot--${p.health}`} />
                    <span className="ac-xs ac-text-2">{HEALTH_META[p.health].label}</span>
                    <span className="ac-pj-card-score">{p.healthScore}</span>
                    <span className="ac-xs ac-muted">健康分</span>
                  </div>

                  <div className="ac-progress-row">
                    <div className="ac-progress">
                      <div
                        className={`ac-progress-bar ac-progress-bar--${HEALTH_META[p.health].tagTone === 'ok' ? 'ok' : HEALTH_META[p.health].tagTone === 'warn' ? 'warn' : 'danger'}`}
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                    <span className="ac-progress-label">{p.progress}%</span>
                  </div>

                  <div className="ac-pj-card-stats">
                    <span>
                      <Coins size={11} />
                      {num(p.spentWan)} / {num(p.budgetWan)} 万
                    </span>
                    <span>
                      <Users size={11} />
                      {p.headcount} 人 · 利用 {p.resourceUtilizationPct}%
                    </span>
                    <span>
                      <Activity size={11} />
                      偏差 {signed(p.scheduleVariancePct)}
                    </span>
                    <span>
                      <AlertTriangle size={11} />
                      风险 {risks.length} 条
                    </span>
                  </div>

                  <div className="ac-pj-card-ms">
                    <Milestone size={12} className="ac-muted" />
                    <span className="ac-col ac-gap-0 ac-flex-1">
                      <span className="ac-xs ac-text-2 ac-ellipsis">{next ? cut(next.name, 26) : '无里程碑'}</span>
                      <span className="ac-xs ac-muted ac-mono">
                        {next ? `${next.id} · ${next.plannedDate} · ${next.status}` : '—'}
                      </span>
                    </span>
                  </div>

                  <div className="ac-pj-card-foot">
                    <span className="ac-user">
                      <span className={`ac-avatar ac-avatar--xs ${owner ? AVATAR_TONE[owner.avatarColor] : 'ac-avatar--slate'}`}>
                        {owner?.initial ?? '—'}
                      </span>
                      <span className="ac-xs ac-text-2">{owner?.name ?? p.ownerId}</span>
                    </span>
                    <span className="ac-xs ac-muted ac-pj-card-exec">预算执行 {fmt(exec, 0)}%</span>
                    {p.isCurrent ? (
                      <span className="ac-tag ac-tag--sm ac-tag--brand">
                        <Flag size={10} />
                        贯穿案例
                      </span>
                    ) : null}
                    <ChevronRight size={14} className="ac-muted ac-ml-auto" />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="ac-section-title">项目对比</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-project-portfolio-compare">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <BarChart3 size={16} />
                项目组合对比表
              </span>
              <span className="ac-card-subtitle">12 列口径，点击表头排序；健康分升序即「最差优先」</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">命中 {compareRows.length} / {allProjects.length}</span>
              </div>
            </div>

            <div className="ac-filter-bar">
              <Search size={14} className="ac-muted" />
              <input
                className="ac-input"
                placeholder="搜索项目名 / 编号 / 负责人 / 关键目标"
                value={keyword}
                onChange={(ev) => setKeyword(ev.target.value)}
              />
              <span className="ac-xs ac-muted">健康度</span>
              <select
                className="ac-select"
                value={healthFilter}
                onChange={(ev) => setHealthFilter(ev.target.value as 'all' | ProjectDef['health'])}
              >
                <option value="all">全部</option>
                <option value="green">绿灯</option>
                <option value="amber">黄灯</option>
                <option value="red">红灯</option>
              </select>
              <span className="ac-xs ac-muted">阶段</span>
              <select className="ac-select" value={phaseFilter} onChange={(ev) => setPhaseFilter(ev.target.value)}>
                <option value="all">全部</option>
                {phases.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto"
                onClick={() => {
                  setKeyword('');
                  setHealthFilter('all');
                  setPhaseFilter('all');
                  setSortKey('healthScore');
                  setSortDir('asc');
                }}
              >
                <RefreshCw size={12} />
                重置
              </button>
            </div>

            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      {th('项目', 'name')}
                      {th('阶段', 'phase')}
                      <th>负责人</th>
                      <th>项目经理</th>
                      {th('健康度', 'healthScore')}
                      {th('进度', 'progress', 'ac-td-right')}
                      {th('进度偏差', 'scheduleVariancePct', 'ac-td-right')}
                      {th('需求变更率', 'reqChangeRatePct', 'ac-td-right')}
                      {th('缺陷密度', 'defectDensity', 'ac-td-right')}
                      {th('人力利用率', 'resourceUtilizationPct', 'ac-td-right')}
                      {th('预算执行', 'budgetExec', 'ac-td-right')}
                      {th('风险数', 'risks', 'ac-td-right')}
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((p) => {
                      const exec = budgetExecPct(p);
                      const risks = PROJECT_RISKS.filter((r) => r.projectId === p.id);
                      const aiRisks = risks.filter((r) => r.detectedBy === 'ai').length;
                      return (
                        <tr
                          key={p.id}
                          className="ac-pj-row"
                          onClick={() => pickProject(p)}
                          title="点击切换到「当前项目」查看详情"
                        >
                          <td>
                            <div className="ac-row ac-gap-1 ac-wrap">
                              <span className="ac-semi ac-text-1">{p.name}</span>
                              {created.some((c) => c.id === p.id) ? (
                                <span className="ac-tag ac-tag--sm ac-tag--ai">新建 · 待同步</span>
                              ) : null}
                            </div>
                            <span className="ac-xs ac-muted ac-mono">
                              {p.code} · {p.id}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[PHASE_TONE[p.phase]]}`}>{p.phase}</span>
                            <div className="ac-xs ac-muted ac-pj-cell-status">{p.statusLabel}</div>
                          </td>
                          <td>
                            <PersonCell userId={p.ownerId} size="xs" showTitle={false} />
                          </td>
                          <td>
                            <PersonCell userId={p.managerId} size="xs" showTitle={false} />
                          </td>
                          <td>
                            <span className="ac-pj-health">
                              <span className={`ac-pj-dot ac-pj-dot--${p.health}`} />
                              <span className="ac-bold ac-tnum">{p.healthScore}</span>
                              <span className="ac-xs ac-muted">{HEALTH_META[p.health].short}</span>
                            </span>
                          </td>
                          <td className="ac-td-right">
                            <div className="ac-progress-row ac-pj-mini-progress">
                              <div className="ac-progress ac-progress--sm">
                                <div
                                  className={`ac-progress-bar ac-progress-bar--${p.health === 'green' ? 'ok' : p.health === 'amber' ? 'warn' : 'danger'}`}
                                  style={{ width: `${p.progress}%` }}
                                />
                              </div>
                              <span className="ac-progress-label">{p.progress}%</span>
                            </div>
                          </td>
                          <td className={`ac-td-num ${p.scheduleVariancePct < 0 ? 'ac-danger-text' : 'ac-ok-text'}`}>
                            {signed(p.scheduleVariancePct)}
                          </td>
                          <td className={`ac-td-num ${p.reqChangeRatePct > CHANGE_BASELINE ? 'ac-warn-text' : ''}`}>
                            {fmt(p.reqChangeRatePct)}%
                          </td>
                          <td className={`ac-td-num ${p.defectDensity >= 1 ? 'ac-danger-text' : p.defectDensity >= 0.55 ? 'ac-warn-text' : ''}`}>
                            {fmt(p.defectDensity, 2)}
                          </td>
                          <td className={`ac-td-num ${p.resourceUtilizationPct >= 100 ? 'ac-danger-text' : ''}`}>
                            {p.resourceUtilizationPct}%
                          </td>
                          <td className="ac-td-num">
                            {fmt(exec, 0)}%
                            <div className="ac-xs ac-muted">
                              {num(p.spentWan)} / {num(p.budgetWan)}
                            </div>
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${risks.length ? (aiRisks ? 'ai' : 'warn') : 'neutral'}`}>
                              {risks.length}
                              {aiRisks ? ` · AI ${aiRisks}` : ''}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {compareRows.length === 0 ? (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-icon">
                      <Search size={22} />
                    </div>
                    <div className="ac-empty-title">没有匹配的项目</div>
                    <div className="ac-empty-desc">
                      当前筛选条件下无结果，试试清空关键字或把健康度切回「全部」。组合内共 {allProjects.length} 个项目。
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Scale size={14} />
                <span>
                  口径说明：进度偏差 = 实体进度 − 基线进度（负为落后）；缺陷密度单位为「个 / KLOC」；
                  人力利用率 &gt; 100% 表示已借调或加班透支；预算执行 = 已花费 ÷ 预算；
                  PRJ-05 / PRJ-06 使用 PingCode 独立迭代序列，其进度不来自本原型 SPRINTS 数据集。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">组合定位</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-project-portfolio-scatter">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Crosshair size={16} />
                进度偏差 × 需求变更率 四象限
              </span>
              <span className="ac-card-subtitle">
                气泡大小 = headcount（人力），颜色 = 健康度；阈值线 X = 0%、Y = {CHANGE_BASELINE}%（变更率基线）
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">点击气泡进入项目详情</span>
              </div>
            </div>
            <div className="ac-card-body">
              <PortfolioScatter onPick={pickProject} />
              <div className="ac-pj-legend">
                <span className="ac-legend-item">
                  <span className="ac-legend-swatch" style={{ background: TONE_HEX.ok }} />
                  绿灯（healthScore ≥ 80）
                </span>
                <span className="ac-legend-item">
                  <span className="ac-legend-swatch" style={{ background: TONE_HEX.warn }} />
                  黄灯（50 ~ 79）
                </span>
                <span className="ac-legend-item">
                  <span className="ac-legend-swatch" style={{ background: TONE_HEX.danger }} />
                  红灯（&lt; 50）
                </span>
                <span className="ac-pj-legend-note">
                  落位结论：PRJ-05 数据中台（-17.5% / 34.8%）位于「范围失控区」，是唯一红灯项目；
                  PRJ-01 订单中心重构（-6.2% / 18.4%）落在「范围失控区」边缘，靠 AI 分担与范围取舍拉回；
                  PRJ-02 / PRJ-04 / PRJ-06 位于右侧健康区。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 2. 当前项目 ==================== */}
      {tab === 'detail' && (
        <>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Target size={16} />
                项目详情
              </span>
              <span className="ac-card-subtitle">切换项目后，下方全部区块（含 AI 诊断）按所选项目重新派生</span>
              <div className="ac-card-extra">
                <select className="ac-select ac-select--sm" value={detailId} onChange={(ev) => setDetailId(ev.target.value)}>
                  {allProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.code}）{p.isCurrent ? ' · 贯穿案例' : ''}
                      {created.some((c) => c.id === p.id) ? ' · 本地草稿' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pj-detail-head">
                <div className="ac-flex-1">
                  <div className="ac-row ac-gap-2 ac-wrap">
                    <span className="ac-pj-detail-name">{detailProject.name}</span>
                    {created.some((c) => c.id === detailProject.id) ? (
                      <span className="ac-tag ac-tag--sm ac-tag--ai">新建 · 待同步</span>
                    ) : null}
                    <span className={`ac-tag ac-tag--${TAG_TONE[PHASE_TONE[detailProject.phase]]}`}>{detailProject.phase}</span>
                    <span className={`ac-tag ac-tag--${HEALTH_META[detailProject.health].tagTone}`}>
                      <span className="ac-tag-dot" />
                      {HEALTH_META[detailProject.health].label} · {detailProject.healthScore} 分
                    </span>
                    {detailProject.isCurrent ? (
                      <span className="ac-tag ac-tag--brand">
                        <Flag size={11} />
                        贯穿案例 EPIC-ORDER-REF
                      </span>
                    ) : null}
                  </div>
                  <div className="ac-xs ac-muted ac-mono ac-mt-1">
                    {detailProject.id} · {detailProject.code} · {detailProject.startDate} ~ {detailProject.endDate}
                  </div>
                  <p className="ac-pj-para ac-mt-2">{detailProject.desc}</p>
                </div>
              </div>

              <dl className="ac-kv ac-pj-kv">
                <dt>项目负责人</dt>
                <dd>
                  <PersonCell userId={detailProject.ownerId} size="xs" />
                </dd>
                <dt>项目经理</dt>
                <dd>
                  <PersonCell userId={detailProject.managerId} size="xs" />
                </dd>
                <dt>状态标签</dt>
                <dd>{detailProject.statusLabel}</dd>
                <dt>预算 / 已花费</dt>
                <dd className="ac-tnum">
                  {num(detailProject.budgetWan)} 万元 / {num(detailProject.spentWan)} 万元（执行 {fmt(budgetExecPct(detailProject), 1)}%）
                </dd>
                <dt>投入人力</dt>
                <dd className="ac-tnum">
                  {detailProject.headcount} 人 · 资源利用率 {detailProject.resourceUtilizationPct}%
                </dd>
                <dt>进度 / 偏差</dt>
                <dd className="ac-tnum">
                  {detailProject.progress}% · 偏差{' '}
                  <span className={detailProject.scheduleVariancePct < 0 ? 'ac-danger-text' : 'ac-ok-text'}>
                    {signed(detailProject.scheduleVariancePct)}
                  </span>
                </dd>
                <dt>质量指标</dt>
                <dd className="ac-tnum">
                  需求变更率 {fmt(detailProject.reqChangeRatePct)}% · 缺陷密度 {fmt(detailProject.defectDensity, 2)} 个 / KLOC
                </dd>
                <dt>关联对象</dt>
                <dd>
                  迭代 {detailProject.sprintIds.length || '无'} · 里程碑 {detailProject.milestoneIds.length} · 干系人{' '}
                  {detailProject.stakeholderIds.length} · 风险 {detailProject.riskIds.length}
                </dd>
              </dl>

              <div className="ac-pj-objective">
                <div className="ac-pj-objective-label">
                  <Crown size={13} />
                  关键目标
                </div>
                <div className="ac-pj-objective-text">{detailProject.keyObjective}</div>
              </div>

              <div className="ac-row ac-gap-1 ac-wrap ac-mt-3">
                {detailProject.techStack.map((t) => (
                  <span key={t} className="ac-tag ac-tag--sm ac-tag--outline">
                    {t}
                  </span>
                ))}
              </div>

              <div className="ac-pj-gauge-row">
                <DonutGauge
                  value={budgetExecPct(detailProject)}
                  label="预算执行率"
                  sub={`${num(detailProject.spentWan)} / ${num(detailProject.budgetWan)} 万元`}
                  tone={budgetExecPct(detailProject) - detailProject.progress > 10 ? 'warn' : 'info'}
                />
                <DonutGauge
                  value={detailProject.resourceUtilizationPct}
                  label="人力利用率"
                  sub={`${detailProject.headcount} 人投入${detailProject.resourceUtilizationPct > 100 ? ' · 已透支' : ''}`}
                  tone={detailProject.resourceUtilizationPct >= 100 ? 'danger' : detailProject.resourceUtilizationPct >= 90 ? 'warn' : 'ok'}
                  max={140}
                />
                <DonutGauge
                  value={detailProject.progress}
                  label="总体进度"
                  sub={`基线 ${fmt(detailProject.progress - detailProject.scheduleVariancePct)}% · 偏差 ${signed(detailProject.scheduleVariancePct)}`}
                  tone={detailProject.scheduleVariancePct < -3 ? 'warn' : 'ok'}
                />
                <DonutGauge
                  value={detailProject.healthScore}
                  label="健康度评分"
                  sub={HEALTH_META[detailProject.health].label}
                  tone={HEALTH_META[detailProject.health].tone}
                />
              </div>
            </div>
          </div>

          <div className="ac-section-title">质量门禁</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ShieldCheck size={16} />
                G1 ~ G6 门禁通过情况
              </span>
              <span className="ac-card-subtitle">条形长度 = GateDef.passRate，颜色 = 门禁状态</span>
              <div className="ac-card-extra">
                {detailProject.id === CURRENT_PROJECT.id ? (
                  <>
                    <span className="ac-tag ac-tag--ok">通过 {GATES.filter((g) => g.status === 'passed').length}</span>
                    <span className="ac-tag ac-tag--danger">未通过 {GATES.filter((g) => g.status === 'failed').length}</span>
                    <span className="ac-tag ac-tag--warn">待执行 {GATES.filter((g) => g.status === 'pending').length}</span>
                  </>
                ) : (
                  <span className="ac-tag ac-tag--outline">数据源仅覆盖 {CURRENT_PROJECT.name}</span>
                )}
              </div>
            </div>
            <div className="ac-card-body">
              {detailProject.id === CURRENT_PROJECT.id ? (
                <>
                  <GateBarChart />
                  <div className="ac-pj-gate-tags">
                    {GATES.map((g) => (
                      <span key={g.id} className={`ac-tag ac-tag--sm ac-tag--${GATE_STATUS[g.status].tagTone}`}>
                        {g.id} {g.name}
                        {g.blocking ? ' · 阻断' : ' · 非阻断'}
                      </span>
                    ))}
                  </div>
                  <div className="ac-hint ac-hint--danger ac-mt-3">
                    <AlertTriangle size={14} />
                    <span>
                      G3（编码门禁）实测聚合分支覆盖率 71.4% &lt; 85%、MR-2410 仍有 1 条 must-fix 未处理，状态为 failed；
                      G4（测试门禁）用例执行率 62.1%、P0 未关闭 4 个，状态为 pending。二者共同构成 REL-2403 的
                      gateBlockedIds，即「批次 1 准入条件不成立」。
                    </span>
                  </div>
                </>
              ) : (
                <div className="ac-empty ac-empty--sm">
                  <div className="ac-empty-icon">
                    <ShieldCheck size={22} />
                  </div>
                  <div className="ac-empty-title">该项目门禁数据未纳入本原型</div>
                  <div className="ac-empty-desc">
                    GATES 数据集只覆盖贯穿案例「{CURRENT_PROJECT.name}」（{CURRENT_PROJECT.code}）的六道门禁实测值。
                    切换到该项目可查看完整的 G1 ~ G6 通过率与逐条实测证据。
                  </div>
                  <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setDetailId(CURRENT_PROJECT.id)}>
                    <ArrowRight size={13} />
                    切换到 {CURRENT_PROJECT.name}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="ac-grid-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Clock size={16} />
                  关联迭代（{detailSprints.length}）
                </span>
                <span className="ac-card-subtitle">由 ProjectDef.sprintIds 关联 SPRINTS</span>
              </div>
              <div className="ac-card-body ac-pj-sub-list">
                {detailSprints.length ? (
                  detailSprints.map((s) => (
                    <div className="ac-pj-sub-item" key={s.id}>
                      <div className="ac-row ac-gap-2">
                        <span className="ac-semi ac-text-1">{s.name}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[s.tone]}`}>{s.statusLabel}</span>
                        <span className="ac-xs ac-muted ac-mono ac-ml-auto">
                          {s.startDate} ~ {s.endDate}
                        </span>
                      </div>
                      <div className="ac-xs ac-text-2 ac-mt-1">
                        {s.theme} · 承诺 {s.committed} 点 / 产能 {s.capacity} 点 · 已完成 {s.completed} 点
                      </div>
                      <div className="ac-progress-row ac-mt-1">
                        <div className="ac-progress ac-progress--sm">
                          <div className="ac-progress-bar" style={{ width: `${s.progress}%` }} />
                        </div>
                        <span className="ac-progress-label">{s.progress}%</span>
                      </div>
                      <div className="ac-xs ac-muted ac-mt-1">{s.goal}</div>
                    </div>
                  ))
                ) : (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-icon">
                      <Clock size={20} />
                    </div>
                    <div className="ac-empty-title">未关联平台内迭代</div>
                    <div className="ac-empty-desc">
                      {detailProject.name} 使用 PingCode「{detailProject.code.split('-')[0]}」独立迭代序列，
                      未纳入本原型 SPRINTS 数据集，故此处为空。
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Send size={16} />
                  关联发布单（{detailReleases.length}）
                </span>
                <span className="ac-card-subtitle">由里程碑交付物文本回溯 REL 编号，再关联 RELEASE_ORDERS</span>
                <div className="ac-card-extra">
                  <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => jump('pipeline')}>
                    去发布流水线
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
              <div className="ac-card-body ac-pj-sub-list">
                {detailReleases.length ? (
                  detailReleases.map((r) => (
                    <div className="ac-pj-sub-item" key={r.id}>
                      <div className="ac-row ac-gap-2">
                        <span className="ac-mono ac-brand-text ac-semi">{r.id}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${REL_STATUS[r.status]?.tagTone ?? 'neutral'}`}>
                          {REL_STATUS[r.status]?.label ?? r.status}
                        </span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${r.riskLevel === 'high' ? 'danger' : r.riskLevel === 'medium' ? 'warn' : 'ok'}`}>
                          风险 {r.riskLevel === 'high' ? '高' : r.riskLevel === 'medium' ? '中' : '低'}
                        </span>
                        <span className="ac-xs ac-muted ac-mono ac-ml-auto">{r.windowStart}</span>
                      </div>
                      <div className="ac-sm ac-text-1 ac-mt-1">{r.title}</div>
                      <div className="ac-xs ac-muted ac-mt-1">
                        {r.version} · 变更项 {r.changeItems} · 灰度 {r.batches.length} 批 · RTO {r.rtoMin} 分钟 · 演练{' '}
                        {r.rehearsed} 次
                        {r.gateBlockedIds.length ? ` · 被 ${r.gateBlockedIds.join('/')} 阻断` : ''}
                      </div>
                      <div className="ac-xs ac-text-2 ac-mt-1">{r.summary}</div>
                    </div>
                  ))
                ) : (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-icon">
                      <Send size={20} />
                    </div>
                    <div className="ac-empty-title">暂无可回溯的发布单</div>
                    <div className="ac-empty-desc">
                      数据层未提供「项目 → 发布单」的直接外键，本页通过里程碑交付物文本中的 REL 编号回溯；
                      {detailProject.name} 的里程碑交付物中未出现 REL 编号，故此处为空。
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="ac-section-title">关联里程碑与风险</div>
          <div className="ac-grid-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Milestone size={16} />
                  里程碑（{detailMilestones.length}）
                </span>
                <span className="ac-card-subtitle">点击行查看交付物、滑移原因与门禁实测</span>
              </div>
              <div className="ac-card-body ac-card-body--flush">
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm">
                    <thead>
                      <tr>
                        <th>里程碑</th>
                        <th className="ac-td-num">计划</th>
                        <th className="ac-td-num">实际 / 预测</th>
                        <th className="ac-td-right">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailMilestones.map((m) => (
                        <tr key={m.id} className="ac-pj-row" onClick={() => setDrawer({ kind: 'ms', ms: m })}>
                          <td>
                            <div className="ac-semi ac-text-1 ac-pj-cell-name">{cut(m.name, 24)}</div>
                            <span className="ac-xs ac-muted ac-mono">
                              {m.id} · {m.gateId}
                            </span>
                          </td>
                          <td className="ac-td-num ac-xs">{md(m.plannedDate)}</td>
                          <td className="ac-td-num ac-xs">
                            {m.actualDate ? md(m.actualDate) : <span className="ac-ai-text">{md(m.forecastDate)}</span>}
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${MS_STATUS_TAG[m.status]}`}>{m.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <AlertTriangle size={16} />
                  风险（{detailRisks.length}）
                </span>
                <span className="ac-card-subtitle">按分值降序；AI 识别的条目带紫色标记</span>
                <div className="ac-card-extra">
                  <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setTab('risk')}>
                    去风险登记册
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
              <div className="ac-card-body ac-card-body--flush">
                {detailRisks.length ? (
                  <div className="ac-table-wrap">
                    <table className="ac-table ac-table--sm">
                      <thead>
                        <tr>
                          <th>编号</th>
                          <th>标题</th>
                          <th className="ac-td-right">分值</th>
                          <th className="ac-td-right">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...detailRisks]
                          .sort((a, b) => b.score - a.score)
                          .map((r) => (
                            <tr key={r.id} className="ac-pj-row" onClick={() => setDrawer({ kind: 'risk', risk: r })}>
                              <td className="ac-mono ac-brand-text">
                                {r.id}
                                {r.detectedBy === 'ai' ? <Sparkles size={11} className="ac-ai-text ac-ml-1" /> : null}
                              </td>
                              <td className="ac-pj-cell-name ac-text-2">{cut(r.title, 26)}</td>
                              <td className={`ac-td-num ac-bold ${TEXT_TONE[r.tone]}`}>{r.score}</td>
                              <td className="ac-td-right">
                                <span className={`ac-tag ac-tag--sm ac-tag--${RISK_STATUS[r.status].tagTone}`}>
                                  {RISK_STATUS[r.status].label}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-icon">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="ac-empty-title">登记册中无未关闭风险</div>
                    <div className="ac-empty-desc">
                      {detailProject.name} 当前在 PROJECT_RISKS 中没有条目；风险登记册共 {PROJECT_RISKS.length} 条，
                      分布在 PRJ-01 / PRJ-04 / PRJ-05 三个项目。
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 项目健康诊断</div>
          <div className="ac-card ac-pj-ai-card" data-annotation-id="ai-sdlc-project-detail-diagnosis">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                AI 健康诊断 · {detailProject.name}
              </span>
              <span className="ac-card-subtitle">
                输入信号：healthScore / scheduleVariancePct / reqChangeRatePct / defectDensity / resourceUtilizationPct
                {detailProject.id === CURRENT_PROJECT.id ? ' + GATES 未通过门禁' : ''}
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">
                  <Sparkles size={12} />
                  {diagnoses.length} 条结论
                </span>
                <span className="ac-tag ac-tag--outline">
                  已采纳 {Object.values(diagVotes).filter((v) => v === 'accepted').length}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pj-diag-list">
                {diagnoses.map((d) => (
                  <div className={`ac-pj-diag ac-pj-diag--${d.level}`} key={d.id}>
                    <div className="ac-pj-diag-head">
                      <span className="ac-pj-diag-icon">
                        {d.level === 'ok' ? <CheckCircle2 size={14} /> : d.level === 'info' ? <Activity size={14} /> : <AlertTriangle size={14} />}
                      </span>
                      <span className="ac-pj-diag-title">{d.title}</span>
                      <span className="ac-ml-auto">
                        <AiVoteBar state={diagVotes[d.id]} onVote={(v) => vote(setDiagVotes, d.id, v)} />
                      </span>
                    </div>
                    <div className="ac-pj-diag-signals">
                      {d.signals.map((s) => (
                        <span className="ac-pj-signal" key={s.source}>
                          <span className="ac-pj-signal-source ac-mono">{s.source}</span>
                          <span className="ac-pj-signal-value">{s.value}</span>
                        </span>
                      ))}
                    </div>
                    <div className="ac-pj-diag-action">
                      <ArrowRight size={12} />
                      建议动作：{d.action}
                    </div>
                  </div>
                ))}
              </div>
              <div className="ac-hint ac-hint--ai ac-mt-3">
                <Sparkles size={14} />
                <span>
                  AI 做了什么：读取项目组合的 5 个既有指标 + 当前项目的六道门禁实测值，按阈值规则生成结论并给出可执行动作；
                  依据是什么：每条结论都标注了信号来源字段与具体数值，可逐条回溯到 data-mgmt 的 PROJECTS 与 data 的 GATES；
                  人工如何介入：点击「采纳」把动作写入 PMO 周度盯盘清单，点击「驳回」则本条不进入清单且不改变原始数据，
                  所有表决仅保存在页面本地状态，刷新即恢复。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 3. 里程碑 ==================== */}
      {tab === 'milestone' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-project-milestone-timeline">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Milestone size={16} />
                {CURRENT_PROJECT.name} 里程碑时间线
              </span>
              <span className="ac-card-subtitle">
                每个里程碑独占一行泳道；实心菱形 = 计划日期，虚线菱形 = AI 预测日期，竖线 = 今日 {TODAY}
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">
                  已完成 {currentMilestones.filter((m) => m.status === '已完成').length}
                </span>
                <span className="ac-tag ac-tag--brand">
                  进行中 {currentMilestones.filter((m) => m.status === '进行中').length}
                </span>
                <span className="ac-tag ac-tag--neutral">
                  待开始 {currentMilestones.filter((m) => m.status === '待开始').length}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <MilestoneTimeline items={currentMilestones} />
              {currentMilestones
                .filter((m) => m.status === '进行中' && m.slipDays > 0)
                .map((m) => (
                  <div className="ac-hint ac-hint--danger ac-mt-3" key={m.id}>
                    <AlertTriangle size={14} />
                    <span>
                      <span className="ac-bold">{m.id} {m.name}</span> 已滑移 {m.slipDays} 天（计划 {m.plannedDate} → AI 预测{' '}
                      {m.forecastDate}），原因：{m.slipReason}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="ac-section-title">里程碑登记表</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                里程碑明细（{currentMilestones.length}）
              </span>
              <span className="ac-card-subtitle">点击任意行查看交付物清单、滑移原因与门禁逐条实测</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">项目 {CURRENT_PROJECT.code}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>里程碑</th>
                      <th className="ac-td-num">计划日期</th>
                      <th className="ac-td-num">实际日期</th>
                      <th className="ac-td-num">AI 预测</th>
                      <th className="ac-td-right">延期天数</th>
                      <th className="ac-td-right">状态</th>
                      <th>负责人</th>
                      <th className="ac-td-center">门禁</th>
                      <th>交付物</th>
                      <th>阻塞 / 滑移原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...currentMilestones]
                      .sort((a, b) => dayIdx(a.plannedDate) - dayIdx(b.plannedDate))
                      .map((m) => {
                        const slip = m.forecastDate !== m.plannedDate ? diffDays(m.plannedDate, m.forecastDate) : 0;
                        return (
                          <tr key={m.id} className="ac-pj-row" onClick={() => setDrawer({ kind: 'ms', ms: m })}>
                            <td>
                              <div className="ac-semi ac-text-1 ac-pj-cell-name">{m.name}</div>
                              <span className="ac-xs ac-muted ac-mono">{m.id}</span>
                            </td>
                            <td className="ac-td-num ac-xs">{m.plannedDate}</td>
                            <td className="ac-td-num ac-xs">{m.actualDate || '—'}</td>
                            <td className="ac-td-num ac-xs ac-ai-text">{m.forecastDate}</td>
                            <td className={`ac-td-num ${slip > 0 ? 'ac-danger-text ac-bold' : 'ac-muted'}`}>
                              {slip > 0 ? `+${slip}` : '0'}
                            </td>
                            <td className="ac-td-right">
                              <span className={`ac-tag ac-tag--sm ac-tag--${MS_STATUS_TAG[m.status]}`}>{m.status}</span>
                              <div className="ac-progress ac-progress--sm ac-mt-1">
                                <div className="ac-progress-bar" style={{ width: `${m.progress}%` }} />
                              </div>
                            </td>
                            <td>
                              <PersonCell userId={m.ownerId} size="xs" />
                            </td>
                            <td className="ac-td-center">
                              <span className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{m.gateId}</span>
                            </td>
                            <td className="ac-xs ac-text-2 ac-pj-cell-deliv">
                              {m.deliverables.map((d) => (
                                <span key={d} className="ac-pj-deliv-item">
                                  · {cut(d, 30)}
                                </span>
                              ))}
                            </td>
                            <td className="ac-xs ac-pj-cell-reason">
                              {m.slipReason ? (
                                <span className="ac-danger-text">{cut(m.slipReason, 60)}</span>
                              ) : (
                                <span className="ac-muted">无</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Clock size={14} />
                <span>
                  延期天数 = AI 预测日期 − 计划日期（已完成的里程碑以实际日期为准，MS-01 / MS-02 均为 0）；
                  MS-05 计划日期 03-20 早于 MS-04 的 03-24，因为灰度切流批次 1 与测试报告签发在既有基线中是并行推进的，
                  二者共同被 G3 / G4 阻断。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 里程碑预测</div>
          <div className="ac-card ac-pj-ai-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                延期预测与置信度
              </span>
              <span className="ac-card-subtitle">
                输入：各里程碑 plannedDate / forecastDate / progress + 项目 scheduleVariancePct（{signed(CURRENT_PROJECT.scheduleVariancePct)}）
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">
                  <Sparkles size={12} />
                  {msForecasts.filter((f) => f.slipDays > 0).length} 个里程碑预测延期
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pj-forecast-list">
                {msForecasts.map((f) => (
                  <div className={`ac-pj-forecast ac-pj-forecast--${f.level}`} key={f.id}>
                    <div className="ac-pj-forecast-head">
                      <span className="ac-mono ac-xs ac-muted">{f.id}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${f.level === 'danger' ? 'danger' : f.level === 'warn' ? 'warn' : 'ok'}`}>
                        {f.slipDays > 0 ? `预计延期 ${f.slipDays} 天` : '可按期完成'}
                      </span>
                      <span className="ac-xs ac-text-2">置信度 {f.confidencePct}%</span>
                      <div className="ac-progress ac-progress--sm ac-pj-forecast-bar">
                        <div
                          className={`ac-progress-bar ac-progress-bar--${f.confidencePct >= 70 ? 'ok' : f.confidencePct >= 45 ? 'warn' : 'danger'}`}
                          style={{ width: `${f.confidencePct}%` }}
                        />
                      </div>
                      <span className="ac-ml-auto">
                        <AiVoteBar state={msVotes[f.id]} onVote={(v) => vote(setMsVotes, f.id, v)} />
                      </span>
                    </div>
                    <div className="ac-pj-forecast-text">{f.text}</div>
                  </div>
                ))}
              </div>

              <div className="ac-ai-block ac-mt-3">
                <div className="ac-ai-block-title">
                  <Sparkles size={14} />
                  AI 综合结论
                </div>
                <div className="ac-mt-2">
                  按当前速率外推，{CURRENT_PROJECT.name} 的收口里程碑 MS-06（v3.0 全量发布）将由 {ms06ForecastText()}
                  ；三条延期预测的置信度均在 {Math.min(...msForecasts.map((f) => f.confidencePct))}% ~{' '}
                  {Math.max(...msForecasts.map((f) => f.confidencePct))}% 之间，最大不确定性来自 BLOCK-0312 生产迁移窗口的批复时点——
                  这是一个平台外的单点决策，AI 无法通过历史速率外推消解。人工介入方式：采纳后由 PMO 把预测日期写入新的里程碑基线并提交指导委员会签核；
                  驳回则保留原基线，但需在下一次风险评审会上书面说明理由。
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 4. 干系人 ==================== */}
      {tab === 'stakeholder' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-project-stakeholder-raci">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Network size={16} />
                RACI 决策域矩阵
              </span>
              <span className="ac-card-subtitle">
                {DECISION_DOMAINS.length} 个关键决策域 × {STAKEHOLDERS.length} 位干系人；每列恰好 1 个 A
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--danger">A 问责 {STAKEHOLDERS.filter((s) => s.raci === 'A').length}</span>
                <span className="ac-tag ac-tag--brand">R 执行 {STAKEHOLDERS.filter((s) => s.raci === 'R').length}</span>
                <span className="ac-tag ac-tag--info">C 咨询 {STAKEHOLDERS.filter((s) => s.raci === 'C').length}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered ac-pj-raci-table">
                  <thead>
                    <tr>
                      <th className="ac-pj-raci-corner">干系人 \ 决策域</th>
                      {DECISION_DOMAINS.map((d) => (
                        <th key={d.id} className="ac-td-center ac-pj-raci-head">
                          <span className="ac-pj-raci-head-id ac-mono">{d.id}</span>
                          <span className="ac-pj-raci-head-name">{d.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STAKEHOLDERS.map((sh) => (
                      <tr key={sh.id} className="ac-pj-row" onClick={() => setDrawer({ kind: 'sh', sh })}>
                        <td>
                          <StakeholderCell sh={sh} />
                          <div className="ac-xs ac-muted ac-mt-1">{cut(sh.role, 22)}</div>
                        </td>
                        {DECISION_DOMAINS.map((d) => {
                          const v = d.raci[sh.id];
                          return (
                            <td key={d.id} className="ac-td-center">
                              <span className={`ac-pj-raci-cell ${RACI_META[v].cls}`} title={`${d.name} · ${RACI_META[v].label}`}>
                                {v}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-pj-raci-legend">
                {(['A', 'R', 'C', 'I'] as StakeholderDef['raci'][]).map((k) => (
                  <span className="ac-pj-raci-legend-item" key={k}>
                    <span className={`ac-pj-raci-cell ${RACI_META[k].cls}`}>{k}</span>
                    {RACI_META[k].label}
                  </span>
                ))}
                <span className="ac-pj-raci-legend-note">
                  六个决策域的具体待决事项：
                  {DECISION_DOMAINS.map((d) => `${d.id} ${d.decision}`).join('；')}。
                </span>
              </div>
              <div className="ac-hint ac-mt-2">
                <Info size={14} />
                <span>
                  登记册层面的唯一问责人是 SH-07（韩沐辰 · 集团 CTO 办公室数字化负责人）；按决策域细化时，
                  运营级决策域（需求范围 / 门禁签发 / 契约冻结 / 发布放行）的 A 下沉到该域的实际责任人，
                  SH-07 在这四列退为 I，只在「里程碑基线调整」与「资源调配与跨组借调」两个战略域保留 A。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">干系人登记册</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Users size={16} />
                干系人清单（{filteredStakeholders.length} / {STAKEHOLDERS.length}）
              </span>
              <span className="ac-card-subtitle">
                平台内成员取 USER_MAP 真实头像；平台外干系人显示 externalName / externalOrg
              </span>
            </div>
            <div className="ac-filter-bar">
              <Search size={14} className="ac-muted" />
              <input
                className="ac-input"
                placeholder="搜索姓名 / 职责 / 关注点 / 诉求"
                value={shKeyword}
                onChange={(ev) => setShKeyword(ev.target.value)}
              />
              <span className="ac-xs ac-muted">RACI</span>
              <div className="ac-tabs ac-tabs--pill">
                {(['all', 'A', 'R', 'C', 'I'] as ('all' | StakeholderDef['raci'])[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`ac-tab ${shRaci === k ? 'ac-tab--active' : ''}`}
                    onClick={() => setShRaci(k)}
                  >
                    {k === 'all' ? '全部' : k}
                    <span className="ac-tab-count">
                      {k === 'all' ? STAKEHOLDERS.length : STAKEHOLDERS.filter((s) => s.raci === k).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>干系人</th>
                      <th>编号</th>
                      <th className="ac-td-center">登记 RACI</th>
                      <th>职责</th>
                      <th>关注点</th>
                      <th className="ac-td-center">影响力</th>
                      <th className="ac-td-right">利益相关度</th>
                      <th className="ac-td-center">四象限分区</th>
                      <th>沟通频率与形式</th>
                      <th>当前诉求 / 异议</th>
                      <th className="ac-td-right">关联项目</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStakeholders.map((sh) => {
                      const score = interestScore(sh);
                      const zone = piZone(score, INFLUENCE_META[sh.influence].value);
                      return (
                        <tr key={sh.id} className="ac-pj-row" onClick={() => setDrawer({ kind: 'sh', sh })}>
                          <td>
                            <StakeholderCell sh={sh} />
                          </td>
                          <td className="ac-mono ac-xs ac-muted">{sh.id}</td>
                          <td className="ac-td-center">
                            <span className={`ac-pj-raci-cell ${RACI_META[sh.raci].cls}`}>{sh.raci}</span>
                          </td>
                          <td className="ac-xs ac-text-2 ac-pj-cell-role">{sh.role}</td>
                          <td className="ac-xs ac-text-2 ac-pj-cell-interest">{sh.interest}</td>
                          <td className="ac-td-center">
                            <span className={`ac-tag ac-tag--sm ac-tag--${INFLUENCE_META[sh.influence].tagTone}`}>
                              {INFLUENCE_META[sh.influence].label}
                            </span>
                          </td>
                          <td className="ac-td-num">{fmt(score, 2)}</td>
                          <td className="ac-td-center">
                            <span
                              className={`ac-tag ac-tag--sm ac-tag--${
                                zone === '重点管理' ? 'danger' : zone === '保持满意' ? 'warn' : zone === '保持沟通' ? 'info' : 'neutral'
                              }`}
                            >
                              {zone}
                            </span>
                          </td>
                          <td className="ac-xs ac-text-2 ac-pj-cell-freq">{sh.communicationFreq}</td>
                          <td className="ac-xs ac-text-2 ac-pj-cell-interest">{cut(sh.expectation, 46)}</td>
                          <td className="ac-td-num">{projectCountOf(sh.id)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredStakeholders.length === 0 ? (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-icon">
                      <Users size={22} />
                    </div>
                    <div className="ac-empty-title">没有匹配的干系人</div>
                    <div className="ac-empty-desc">
                      登记册共 {STAKEHOLDERS.length} 人（{STAKEHOLDERS.filter((s) => s.userId).length} 位平台内成员 +{' '}
                      {STAKEHOLDERS.filter((s) => !s.userId).length} 位平台外干系人），请调整关键字或 RACI 筛选。
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="ac-grid-3-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <PieChart size={16} />
                  权力 - 利益四象限
                </span>
                <span className="ac-card-subtitle">Y = 影响力，X = 利益相关度派生分值；点击点位查看登记详情</span>
              </div>
              <div className="ac-card-body">
                <PowerInterestScatter onPick={(sh) => setDrawer({ kind: 'sh', sh })} />
              </div>
              <div className="ac-card-foot">
                <div className="ac-hint">
                  <Info size={14} />
                  <span>
                    利益相关度算式：RACI 权重（A=3 / R=2.5 / C=1.8 / I=1）× 0.7 + min(关联项目数, 6) ÷ 6 × 3 × 0.3。
                    同坐标点位按 id 散列做 ±0.035 的视觉展开，标签位置不代表精确分值，精确值见登记册「利益相关度」列。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card ac-pj-ai-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sparkles size={16} />
                  AI 沟通建议
                </span>
                <span className="ac-card-subtitle">高影响低触达 / 含硬性红线 / 平台外干系人优先</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--ai">{commAdvice.length} 条</span>
                </div>
              </div>
              <div className="ac-card-body ac-pj-advice-body">
                {commAdvice.map((a) => (
                  <div className={`ac-pj-advice ${a.urgent ? 'ac-pj-advice--urgent' : ''}`} key={a.id}>
                    <div className="ac-pj-advice-head">
                      <StakeholderCell sh={a.sh} />
                      {a.urgent ? (
                        <span className="ac-tag ac-tag--sm ac-tag--danger">
                          <AlertTriangle size={10} />
                          需即时对齐
                        </span>
                      ) : (
                        <span className="ac-tag ac-tag--sm ac-tag--info">常规跟进</span>
                      )}
                      <span className="ac-xs ac-muted ac-ml-auto">{a.due}</span>
                    </div>
                    <ul className="ac-pj-advice-signals">
                      {a.signals.map((s) => (
                        <li key={s}>
                          <span className="ac-pj-signal-source ac-mono">信号</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                    <div className="ac-pj-diag-action">
                      <ArrowRight size={12} />
                      {a.action}
                    </div>
                    <div className="ac-pj-advice-foot">
                      <AiVoteBar state={commVotes[a.id]} onVote={(v) => vote(setCommVotes, a.id, v)} />
                      {commVotes[a.id] === 'accepted' ? (
                        <span className="ac-xs ac-ok-text">已加入本周沟通计划</span>
                      ) : commVotes[a.id] === 'rejected' ? (
                        <span className="ac-xs ac-muted">已驳回，不进入沟通计划</span>
                      ) : (
                        <span className="ac-xs ac-muted">采纳后写入 PMO 沟通计划并生成飞书日程草稿</span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="ac-hint ac-hint--ai">
                  <Sparkles size={14} />
                  <span>
                    AI 做了什么：扫描 10 位干系人的 influence / raci / communicationFreq / expectation / userId 与关联项目数，
                    命中 5 条规则即生成建议；依据是什么：每条建议都列出命中的原始信号；
                    人工如何介入：采纳后由 PMO 落到沟通计划，驳回则保留原始登记册不变。
                    建议文本中的日期与阈值均取自 TODAY（{TODAY}）与既有诉求原文，未引入外部数据。
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 5. 风险与 AI 周报 ==================== */}
      {tab === 'risk' && (
        <>
          <div className="ac-grid-3-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Layers size={16} />
                  概率 × 影响 5×5 热力矩阵
                </span>
                <span className="ac-card-subtitle">
                  轴刻度按 low=1 / medium=3 / high=5 落位；格内数字为风险分（概率值 × 影响值），色块为风险编号
                </span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">共 {PROJECT_RISKS.length} 条</span>
                </div>
              </div>
              <div className="ac-card-body">
                <RiskHeatMatrix onPick={(r) => setDrawer({ kind: 'risk', risk: r })} />
                <div className="ac-pj-legend ac-mt-2">
                  <span className="ac-legend-item">
                    <span className="ac-legend-swatch" style={{ background: TONE_HEX.danger }} />
                    分值 ≥ 20（立即处置）
                  </span>
                  <span className="ac-legend-item">
                    <span className="ac-legend-swatch" style={{ background: TONE_HEX.warn }} />
                    分值 10 ~ 19（本迭代内缓解）
                  </span>
                  <span className="ac-legend-item">
                    <span className="ac-legend-swatch" style={{ background: TONE_HEX.info }} />
                    分值 5 ~ 9（观察）
                  </span>
                  <span className="ac-legend-item">
                    <span className="ac-legend-swatch" style={{ background: TONE_HEX.neutral }} />
                    分值 &lt; 5（登记留痕）
                  </span>
                </div>
                <div className="ac-hint ac-hint--danger ac-mt-2">
                  <AlertTriangle size={14} />
                  <span>
                    最危险的格子是「概率高 × 影响高」（分值 25），当前仅 PR-01 生产迁移窗口未批复落在此处且状态已为
                    「已发生」；「概率高 × 影响中」（分值 15）一格堆叠了 PR-02 / PR-06 / PR-07 三条风险，
                    其中 PR-02 与 PR-06 同属当前项目，构成本迭代的主要威胁集中区。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sparkles size={16} />
                  AI vs 人工识别
                </span>
                <span className="ac-card-subtitle">发现方式构成与证据链完备度</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-pj-split">
                  {(['ai', 'human'] as const).map((k) => {
                    const list = PROJECT_RISKS.filter((r) => r.detectedBy === k);
                    const ratio = (list.length / PROJECT_RISKS.length) * 100;
                    return (
                      <div className="ac-pj-split-row" key={k}>
                        <span className="ac-pj-split-label">
                          {k === 'ai' ? (
                            <span className="ac-tag ac-tag--sm ac-tag--ai">
                              <Sparkles size={11} />
                              AI 识别
                            </span>
                          ) : (
                            <span className="ac-tag ac-tag--sm ac-tag--outline">
                              <UserCheck size={11} />
                              人工登记
                            </span>
                          )}
                        </span>
                        <div className="ac-progress">
                          <div
                            className={`ac-progress-bar ${k === 'ai' ? '' : 'ac-progress-bar--info'}`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                        <span className="ac-progress-label">
                          {list.length} 条 · {fmt(ratio, 0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                <dl className="ac-kv ac-mt-3">
                  <dt>平均发现分值</dt>
                  <dd className="ac-tnum">
                    AI {fmt(PROJECT_RISKS.filter((r) => r.detectedBy === 'ai').reduce((s, r) => s + r.score, 0) / 5, 1)} ·
                    人工 {fmt(PROJECT_RISKS.filter((r) => r.detectedBy === 'human').reduce((s, r) => s + r.score, 0) / 3, 1)}
                  </dd>
                  <dt>证据链完备</dt>
                  <dd>
                    {PROJECT_RISKS.filter((r) => r.detectedBy === 'ai' && r.aiEvidence).length} / 5 条 AI 风险均附 aiEvidence
                  </dd>
                  <dt>平均提前天数</dt>
                  <dd className="ac-tnum">
                    AI 风险自 detectedAt 至今平均 {fmt(
                      PROJECT_RISKS.filter((r) => r.detectedBy === 'ai').reduce((s, r) => s + diffDays(r.detectedAt, TODAY), 0) / 5,
                      1,
                    )}{' '}
                    天
                  </dd>
                  <dt>仍在处置中</dt>
                  <dd>
                    {PROJECT_RISKS.filter((r) => r.status === 'mitigating').length} 条 mitigating ·{' '}
                    {PROJECT_RISKS.filter((r) => r.status === 'open').length} 条 open ·{' '}
                    {PROJECT_RISKS.filter((r) => r.status === 'occurred').length} 条 occurred
                  </dd>
                </dl>

                <div className="ac-hint ac-hint--ai ac-mt-3">
                  <Sparkles size={14} />
                  <span>
                    AI 识别的 5 条风险全部给出了可复核的指标证据（流水线覆盖率采样、双写比对差异率、契约冻结进度、
                    压测热点倾斜度、WORKLOADS 负载快照），人工登记的风险则来自线下沟通与 DBA 反馈。
                    两者在登记册中同权，AI 不自动改判人工结论。
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-section-title">风险登记册</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <FileText size={16} />
                项目风险登记表（{filteredRisks.length} / {PROJECT_RISKS.length}）
              </span>
              <span className="ac-card-subtitle">13 列口径，按分值降序；点击行查看证据链与应急预案</span>
            </div>
            <div className="ac-filter-bar">
              <span className="ac-xs ac-muted">所属项目</span>
              <select className="ac-select" value={riskProject} onChange={(ev) => setRiskProject(ev.target.value)}>
                <option value="all">全部项目</option>
                {PROJECTS.filter((p) => PROJECT_RISKS.some((r) => r.projectId === p.id)).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{PROJECT_RISKS.filter((r) => r.projectId === p.id).length}）
                  </option>
                ))}
              </select>
              <span className="ac-xs ac-muted">发现方式</span>
              <div className="ac-tabs ac-tabs--pill">
                {(['all', 'ai', 'human'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`ac-tab ${riskDetected === k ? 'ac-tab--active' : ''}`}
                    onClick={() => setRiskDetected(k)}
                  >
                    {k === 'all' ? '全部' : k === 'ai' ? 'AI 识别' : '人工登记'}
                    <span className="ac-tab-count">
                      {k === 'all' ? PROJECT_RISKS.length : PROJECT_RISKS.filter((r) => r.detectedBy === k).length}
                    </span>
                  </button>
                ))}
              </div>
              <span className="ac-xs ac-muted ac-ml-auto">
                分值合计 {filteredRisks.reduce((s, r) => s + r.score, 0)} · 最高{' '}
                {filteredRisks.length ? Math.max(...filteredRisks.map((r) => r.score)) : 0}
              </span>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>风险描述</th>
                      <th>所属项目</th>
                      <th className="ac-td-center">概率</th>
                      <th className="ac-td-center">影响</th>
                      <th className="ac-td-right">分值</th>
                      <th>责任人</th>
                      <th className="ac-td-right">状态</th>
                      <th className="ac-td-center">发现方式</th>
                      <th>缓解措施</th>
                      <th>应急预案</th>
                      <th className="ac-td-num">发现日期</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRisks.map((r) => {
                      const proj = PROJECTS.find((p) => p.id === r.projectId);
                      return (
                        <tr key={r.id} className="ac-pj-row" onClick={() => setDrawer({ kind: 'risk', risk: r })}>
                          <td className="ac-mono ac-brand-text ac-nowrap">{r.id}</td>
                          <td>
                            <div className="ac-semi ac-text-1 ac-pj-cell-name">{cut(r.title, 28)}</div>
                            <div className="ac-xs ac-muted ac-pj-cell-desc">{cut(r.desc, 60)}</div>
                          </td>
                          <td className="ac-xs ac-text-2 ac-nowrap">{proj?.name ?? r.projectId}</td>
                          <td className="ac-td-center">
                            <span className={`ac-tag ac-tag--sm ac-tag--${r.probability === 'high' ? 'danger' : r.probability === 'medium' ? 'warn' : 'neutral'}`}>
                              {PI_META[r.probability].label}
                            </span>
                          </td>
                          <td className="ac-td-center">
                            <span className={`ac-tag ac-tag--sm ac-tag--${r.impact === 'high' ? 'danger' : r.impact === 'medium' ? 'warn' : 'neutral'}`}>
                              {PI_META[r.impact].label}
                            </span>
                          </td>
                          <td className={`ac-td-num ac-bold ${TEXT_TONE[r.tone]}`}>{r.score}</td>
                          <td>
                            <PersonCell userId={r.owner} size="xs" showTitle={false} />
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${RISK_STATUS[r.status].tagTone}`}>
                              {RISK_STATUS[r.status].label}
                            </span>
                          </td>
                          <td className="ac-td-center">
                            {r.detectedBy === 'ai' ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ai" title={r.aiEvidence}>
                                <Sparkles size={11} />
                                AI
                              </span>
                            ) : (
                              <span className="ac-tag ac-tag--sm ac-tag--outline">人工</span>
                            )}
                          </td>
                          <td className="ac-xs ac-text-2 ac-pj-cell-desc">{cut(r.mitigation, 48)}</td>
                          <td className="ac-xs ac-text-2 ac-pj-cell-desc">{cut(r.contingency, 48)}</td>
                          <td className="ac-td-num ac-xs ac-nowrap">{r.detectedAt}</td>
                          <td className="ac-td-right">
                            <button
                              type="button"
                              className="ac-btn ac-btn--text ac-btn--sm"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setDrawer({ kind: 'risk', risk: r });
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
                {filteredRisks.length === 0 ? (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-icon">
                      <ShieldCheck size={22} />
                    </div>
                    <div className="ac-empty-title">该项目暂无登记风险</div>
                    <div className="ac-empty-desc">
                      当前筛选条件下无匹配条目。PRJ-02 / PRJ-03 / PRJ-06 的 riskIds 为空数组，
                      表示登记册中没有归属这三个项目的风险。
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Scale size={14} />
                <span>
                  分值口径：概率与影响按 low=1 / medium=3 / high=5 映射后相乘，取值 1 ~ 25；
                  tone 分档为 ≥20 danger、10~19 warn、5~9 info、&lt;5 neutral，status 为 closed 时统一覆写为 ok（见 PR-08）。
                  AI 识别的风险在「发现方式」列以紫色标记，鼠标悬停可查看完整 aiEvidence。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 项目周报</div>
          <div className="ac-card ac-pj-ai-card" data-annotation-id="ai-sdlc-project-risk-report">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                {aiProjectReport.weekLabel}
              </span>
              <span className="ac-card-subtitle">
                由 {reportAgent?.name ?? aiProjectReport.generatedBy}（{aiProjectReport.generatedBy}）生成 ·
                路由模型 {reportModel?.name ?? aiProjectReport.modelId} · {aiProjectReport.generatedAt}
              </span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${report.reviewStatus === '已确认' ? 'ok' : report.reviewStatus === '已驳回' ? 'danger' : 'warn'}`}>
                  {report.reviewStatus}
                </span>
                {report.humanEdited ? (
                  <span className="ac-tag ac-tag--outline">
                    <SquarePen size={11} />
                    已人工编辑
                  </span>
                ) : null}
                <span className="ac-tag ac-tag--ai">
                  <Coins size={11} />
                  生成成本 ¥{fmt(aiProjectReport.tokenCost, 2)}
                </span>
              </div>
            </div>

            <div className="ac-card-body">
              <div className="ac-ai-block">
                <div className="ac-ai-block-title">
                  <Sparkles size={14} />
                  总体结论 · summary
                </div>
                <div className="ac-mt-2">{aiProjectReport.summary}</div>
              </div>

              <div className="ac-pj-report-actions">
                <button
                  type="button"
                  className="ac-btn ac-btn--ai"
                  onClick={() =>
                    setReport({
                      reviewStatus: '已确认',
                      humanEdited: report.humanEdited,
                      published: 'published',
                      note: `已发布到飞书「${CURRENT_PROJECT.name}」项目群与指导委员会话题，@${STAKEHOLDERS.filter((s) => s.influence === 'high').map((s) => s.displayName).join('、')} 共 ${STAKEHOLDERS.filter((s) => s.influence === 'high').length} 位高影响干系人，并同步写入 PingCode 迭代周报字段。`,
                    })
                  }
                >
                  <Send size={14} />
                  采纳并发布到飞书
                </button>
                <button
                  type="button"
                  className="ac-btn ac-btn--ghost"
                  onClick={() =>
                    setReport({
                      reviewStatus: '待确认',
                      humanEdited: false,
                      published: 'regenerated',
                      note: `已触发重新生成：${reportAgent?.name ?? 'Agent'} 重新采样 ${TODAY} 18:30 之后的流水线与负载快照，预计耗时 ${reportAgent?.avgDurationMin ?? 9} 分钟；重生成期间保留当前版本供对照，人工编辑痕迹将被清除。`,
                    })
                  }
                >
                  <RefreshCw size={14} />
                  重新生成
                </button>
                <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setEditOpen(true)}>
                  <SquarePen size={14} />
                  编辑后发布
                </button>
                <button
                  type="button"
                  className="ac-btn ac-btn--danger-ghost"
                  onClick={() =>
                    setReport({
                      reviewStatus: '已驳回',
                      humanEdited: report.humanEdited,
                      published: 'idle',
                      note: '已驳回本周报告：不发布到飞书，驳回理由将回流给 ag-ba 作为负反馈样本，用于校准下一次生成的口径与语气。',
                    })
                  }
                >
                  <XCircle size={14} />
                  驳回
                </button>
              </div>

              {report.note ? (
                <div className={`ac-hint ${report.published === 'published' || report.published === 'edited' ? 'ac-hint--ok' : report.reviewStatus === '已驳回' ? 'ac-hint--danger' : 'ac-hint--warn'} ac-mt-3`}>
                  {report.published === 'published' || report.published === 'edited' ? (
                    <CheckCircle2 size={14} />
                  ) : report.reviewStatus === '已驳回' ? (
                    <XCircle size={14} />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  <span>{report.note}</span>
                </div>
              ) : null}

              <div className="ac-pj-report-grid">
                <div className="ac-pj-report-block">
                  <div className="ac-pj-report-label">
                    <BarChart3 size={13} />
                    计划 vs 实际（{aiProjectReport.progressItems.length} 项）
                  </div>
                  <PlanActualBars items={aiProjectReport.progressItems} />
                </div>

                <div className="ac-pj-report-block">
                  <div className="ac-pj-report-label">
                    <TrendingUp size={13} />
                    完工预测 · forecast
                  </div>
                  <div className="ac-pj-forecast-card">
                    <div className="ac-pj-forecast-date">
                      <CalendarClock size={18} className="ac-ai-text" />
                      <span className="ac-col ac-gap-0">
                        <span className="ac-pj-forecast-big">{aiProjectReport.forecast.finishDate}</span>
                        <span className="ac-xs ac-muted">
                          基线 {CURRENT_PROJECT.endDate} · 滑移 {diffDays(CURRENT_PROJECT.endDate, aiProjectReport.forecast.finishDate)} 天
                        </span>
                      </span>
                    </div>
                    <div className="ac-row ac-gap-2 ac-wrap">
                      <span className="ac-tag ac-tag--ai">置信度 {aiProjectReport.forecast.confidencePct}%</span>
                      <span
                        className={`ac-tag ac-tag--${
                          aiProjectReport.forecast.onTimeRisk === 'high'
                            ? 'danger'
                            : aiProjectReport.forecast.onTimeRisk === 'medium'
                              ? 'warn'
                              : 'ok'
                        }`}
                      >
                        按期风险{' '}
                        {aiProjectReport.forecast.onTimeRisk === 'high'
                          ? '高'
                          : aiProjectReport.forecast.onTimeRisk === 'medium'
                            ? '中'
                            : '低'}
                      </span>
                      <span className="ac-tag ac-tag--outline">
                        <Coins size={11} />
                        本次生成 ¥{fmt(aiProjectReport.tokenCost, 2)}
                      </span>
                    </div>
                    <p className="ac-pj-para ac-mt-2">{aiProjectReport.forecast.basis}</p>
                  </div>
                </div>
              </div>

              <div className="ac-pj-report-cols">
                <div className="ac-pj-report-col">
                  <div className="ac-pj-report-label ac-ok-text">
                    <CheckCircle2 size={13} />
                    本周亮点（{aiProjectReport.highlights.length}）
                  </div>
                  <ul className="ac-pj-list ac-pj-list--ok">
                    {aiProjectReport.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
                <div className="ac-pj-report-col">
                  <div className="ac-pj-report-label ac-danger-text">
                    <AlertTriangle size={13} />
                    阻塞项（{aiProjectReport.blockers.length}）
                  </div>
                  <ul className="ac-pj-list ac-pj-list--danger">
                    {aiProjectReport.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div className="ac-pj-report-col">
                  <div className="ac-pj-report-label ac-brand-text">
                    <ListChecks size={13} />
                    下周计划（{aiProjectReport.nextWeekPlan.length}）
                  </div>
                  <ul className="ac-pj-list ac-pj-list--brand">
                    {aiProjectReport.nextWeekPlan.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="ac-hint ac-hint--ai ac-mt-3">
                <Sparkles size={14} />
                <span>
                  AI 做了什么：汇总 {TODAY} 当日的迭代故事点、六道门禁实测、阻塞链、AI 采纳率与 WORKLOADS 负载快照，
                  生成 summary / 6 项计划实际对比 / 4 条亮点 / 4 条阻塞 / 5 条下周计划 / 完工预测；
                  依据是什么：预测 basis 明确写出了「近 3 周燃烧速率 21.7 点/周 + BLOCK-0312 的 7 天阻塞 + G3 达标所需 21 天斜率，取三者最大值」的推算过程；
                  人工如何介入：三个动作按钮分别对应「直接采纳发布」「重新采样生成」「先编辑再发布」，另有「驳回」把负反馈回流给 Agent。
                  humanEdited 为 true 表示本版本已含人工修订，发布时会保留修订痕迹。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---------- 抽屉 ---------- */}
      <Drawer
        open={drawer !== null}
        title={
          drawer?.kind === 'risk'
            ? '风险详情'
            : drawer?.kind === 'sh'
              ? '干系人详情'
              : drawer?.kind === 'ms'
                ? '里程碑详情'
                : ''
        }
        subtitle={
          drawer?.kind === 'risk'
            ? `${drawer.risk.id} · ${drawer.risk.title}`
            : drawer?.kind === 'sh'
              ? `${drawer.sh.id} · ${drawer.sh.role}`
              : drawer?.kind === 'ms'
                ? `${drawer.ms.id} · ${drawer.ms.name}`
                : undefined
        }
        width={680}
        onClose={() => setDrawer(null)}
        footer={
          drawer ? (
            <div className="ac-row ac-gap-2">
              <span className="ac-xs ac-muted">
                {drawer.kind === 'risk'
                  ? `责任人 ${USER_MAP[drawer.risk.owner]?.name ?? drawer.risk.owner} · 分值 ${drawer.risk.score}`
                  : drawer.kind === 'sh'
                    ? `RACI ${RACI_META[drawer.sh.raci].label} · 影响力 ${INFLUENCE_META[drawer.sh.influence].label}`
                    : `负责人 ${USER_MAP[drawer.ms.ownerId]?.name ?? drawer.ms.ownerId} · 进度 ${drawer.ms.progress}%`}
              </span>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm ac-ml-auto" onClick={() => setDrawer(null)}>
                关闭
              </button>
            </div>
          ) : undefined
        }
      >
        {drawer?.kind === 'risk' ? <RiskDrawerBody risk={drawer.risk} /> : null}
        {drawer?.kind === 'sh' ? <StakeholderDrawerBody sh={drawer.sh} /> : null}
        {drawer?.kind === 'ms' ? <MilestoneDrawerBody ms={drawer.ms} /> : null}
      </Drawer>

      {/* ---------- 弹窗：编辑周报后发布 ---------- */}
      <Modal
        open={editOpen}
        title="编辑后发布 AI 项目周报"
        subtitle={`${aiProjectReport.weekLabel} · 修改仅作用于总体结论，其余区块保持 AI 原文`}
        width={640}
        onClose={() => setEditOpen(false)}
        footer={
          <div className="ac-row ac-gap-2 ac-justify-end">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setEditOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="ac-btn ac-btn--primary ac-btn--sm"
              onClick={() => {
                setReport({
                  reviewStatus: '已确认',
                  humanEdited: true,
                  published: 'edited',
                  note: `已保存人工修订（${editText.length} 字，较 AI 原文 ${aiProjectReport.summary.length} 字${editText.length >= aiProjectReport.summary.length ? '增加' : '精简'} ${Math.abs(editText.length - aiProjectReport.summary.length)} 字）并发布到飞书项目群；humanEdited 置为 true，修订痕迹随报告归档，AI 原文保留在版本历史中可对照。`,
                });
                setEditOpen(false);
              }}
            >
              <Send size={13} />
              保存并发布
            </button>
          </div>
        }
      >
        <div className="ac-field">
          <span className="ac-field-label">总体结论 summary</span>
          <textarea className="ac-textarea ac-pj-textarea" value={editText} onChange={(ev) => setEditText(ev.target.value)} rows={8} />
          <span className="ac-field-hint">
            发布前请确认：结论中的日期与数值需与门禁实测、WORKLOADS 快照一致；对外口径避免出现未经签核的承诺日期。
          </span>
        </div>
        <dl className="ac-kv ac-mt-3">
          <dt>生成者</dt>
          <dd>
            {reportAgent?.name ?? aiProjectReport.generatedBy}（{aiProjectReport.generatedBy}）
          </dd>
          <dt>路由模型</dt>
          <dd>
            {reportModel?.name ?? aiProjectReport.modelId}
            {reportModel ? <span className="ac-xs ac-muted"> · {reportModel.contextWindow} 上下文</span> : null}
          </dd>
          <dt>生成时间</dt>
          <dd className="ac-mono">{aiProjectReport.generatedAt}</dd>
          <dt>成本</dt>
          <dd className="ac-tnum">¥{fmt(aiProjectReport.tokenCost, 2)}</dd>
        </dl>
        <div className="ac-hint ac-hint--ai ac-mt-3">
          <Mail size={14} />
          <span>
            改派说明：本周报由跨源综合类长上下文任务触发，按模型路由规则从 ag-ba 的默认模型 DeepSeek-V3 改派至 GPT-5
            （承接「影响面分析 / 发布风险评审 / 长上下文推理」），故 generatedBy 与 modelId 不同源。
          </span>
        </div>
      </Modal>

      {/* ---------- 弹窗：录入项目（本地草稿态，不回写 data-mgmt） ---------- */}
      <Modal
        open={createOpen}
        title="录入项目"
        subtitle={`新建记录仅存在于本页 state：提交后计入组合指标卡与对比表（当前 ${allProjects.length} 个项目），不回写 PingCode 与 data-mgmt`}
        width={760}
        onClose={closeCreate}
        footer={
          <div className="ac-row ac-gap-2 ac-wrap" style={{ width: '100%' }}>
            <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={runAiDraft}>
              <Sparkles size={13} />
              AI 辅助立项
            </button>
            <span className="ac-xs ac-muted">
              本地规则推导健康度 / tone / 状态标签 / 人力利用率与 4 条里程碑建议，模型 mdl-local，不出域
            </span>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm ac-ml-auto" onClick={closeCreate}>
              取消
            </button>
            <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={submitCreate}>
              <CheckCircle2 size={13} />
              确认录入
            </button>
          </div>
        }
      >
        <FormGrid cols={2}>
          <FormGroupTitle title="基本信息" note="字段与 PingCode 项目对象一一对应，编号全局唯一" />
          <TextField
            label="项目编号"
            value={form.code}
            onChange={(v) => patch('code', v)}
            required
            mono
            maxLength={32}
            placeholder="ORD-REF-2026"
            hint="PingCode 项目编号，全局唯一"
            error={errors.code}
          />
          <TextField
            label="项目名称"
            value={form.name}
            onChange={(v) => patch('name', v)}
            required
            maxLength={40}
            placeholder="如：会员中心二期"
            error={errors.name}
          />
          <SelectField
            label="项目负责人"
            value={form.ownerId}
            onChange={(v) => patch('ownerId', v)}
            options={MEMBER_OPTIONS}
            required
            placeholder="请选择负责人"
            hint="研发侧总负责，候选为 USERS 中的真人成员"
            error={errors.ownerId}
          />
          <SelectField
            label="项目经理"
            value={form.managerId}
            onChange={(v) => patch('managerId', v)}
            options={MEMBER_OPTIONS}
            required
            placeholder="请选择项目经理"
            hint="PMO 侧口径负责人，可与负责人不同人"
            error={errors.managerId}
          />
          <SelectField
            label="项目阶段"
            value={form.phase}
            onChange={(v) => patch('phase', v)}
            options={PHASE_OPTIONS}
            required
            hint="ProjectDef.phase 的 7 个枚举值，默认「立项」"
            error={errors.phase}
          />
          <NumberField
            label="编制人数"
            value={form.headcount}
            onChange={(v) => patch('headcount', v)}
            required
            min={1}
            max={200}
            step={1}
            unit="人"
            hint="按 headcount 直接求和计入组合人力（含跨项目重复投入）"
            error={errors.headcount}
          />

          <FormGroupTitle title="周期与预算" note={`结束日期不得早于今日 ${TODAY}`} />
          <TextField
            label="开始日期"
            value={form.startDate}
            onChange={(v) => patch('startDate', v)}
            required
            mono
            type="date"
            error={errors.startDate}
          />
          <TextField
            label="结束日期"
            value={form.endDate}
            onChange={(v) => patch('endDate', v)}
            required
            mono
            type="date"
            hint="与开始日期构成项目周期，AI 按 15% / 40% / 75% / 100% 插值给出里程碑建议"
            error={errors.endDate}
          />
          <NumberField
            label="项目预算"
            value={form.budgetWan}
            onChange={(v) => patch('budgetWan', v)}
            required
            min={1}
            max={100000}
            step={10}
            unit="万元"
            hint="组合内现有最大值为 PRJ-01 的 860 万元，已花费录入后为 0"
            error={errors.budgetWan}
          />
          <MultiPickField
            label="关联迭代"
            value={form.sprintIds}
            onChange={(v) => patch('sprintIds', v)}
            options={SPRINT_OPTIONS}
            hint="可留空，独立迭代序列的项目在同步后补齐"
            error={errors.sprintIds}
          />

          <FormGroupTitle title="目标与技术栈" note="关键目标需含可量化验收口径" />
          <TextareaField
            label="关键目标"
            value={form.keyObjective}
            onChange={(v) => patch('keyObjective', v)}
            required
            full
            rows={2}
            placeholder="如：2026-07-05 前完成生产切流，下单 P99 ≤ 200ms、错误率 ≤ 0.05%、资损事故归零"
            hint="需含可量化验收口径，如 P99 ≤ 200ms / 错误率 ≤ 0.05%"
            error={errors.keyObjective}
          />
          <TextareaField
            label="项目描述"
            value={form.desc}
            onChange={(v) => patch('desc', v)}
            full
            rows={3}
            placeholder="选填：项目背景、范围边界与主要交付物"
            error={errors.desc}
          />
          <MultiPickField
            label="技术栈"
            value={form.techStack}
            onChange={(v) => patch('techStack', v)}
            options={TECH_OPTIONS}
            full
            hint={`候选为 PROJECTS 既有 ${PROJECTS.length} 个项目 techStack 去重后的并集，共 ${TECH_OPTIONS.length} 项`}
            error={errors.techStack}
          />
        </FormGrid>

        {aiDraft ? (
          <div className="ac-hint ac-hint--ai ac-mt-3">
            <Sparkles size={14} />
            <span>{aiDraft}</span>
          </div>
        ) : null}

        {errorCount ? (
          <div className="ac-hint ac-hint--danger ac-mt-3">
            <AlertTriangle size={14} />
            <span>
              还有 {errorCount} 处待修正：
              {Object.values(errors)
                .filter(Boolean)
                .join('；')}
            </span>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ================================================================== 文案派生 */

/** MS-06 综合结论文案（由里程碑的计划日期与 AI 预测日期拼接） */
function ms06ForecastText() {
  const ms06 = PROJECT_MILESTONES.find((m) => m.id === 'MS-06');
  if (!ms06) return '原计划日期滑移，具体天数需人工确认';
  return `${ms06.plannedDate} 滑至 ${ms06.forecastDate}（+${diffDays(ms06.plannedDate, ms06.forecastDate)} 天），落在大促封网之后`;
}
