/**
 * 版本管理（pageId: release）
 *
 * 与「部署流水线」页的分工：
 *   本页负责版本**规划、范围冻结、基线与变更集**（发布前「做什么 / 含什么」）；
 *   「部署流水线」页负责单次发布的**执行过程**（构建、门禁、灰度、回滚）。
 *   两者通过 VERSIONS.releaseIds ↔ RELEASE_ORDERS.id（VERSION_ID_BY_RELEASE 反查）双向关联。
 *
 * 标签页：
 *  1. versions   版本规划 —— 手绘 SVG 版本路线图 + 版本卡片网格 + 15 列版本表 + AI 版本范围建议
 *  2. baseline   基线与冻结 —— 14 列基线表 + 手绘 SVG 基线时间线 + 冻结预检 Modal（门禁禁用态）
 *  3. changeset  变更集 —— 15 列变更集表 + 多维筛选 + 手绘 SVG 变更规模双向条形 + 高风险聚合区
 *  4. diff       版本对比 —— summary 概览 + 手绘 SVG 指标哑铃图 + 增删清单 + AI 兼容性评估
 *  5. calendar   发布日历 —— 手绘 SVG 月历 + 12 列日历项表 + 冲突治理区 + AI 发布窗口推荐
 */
import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Flag,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  Hourglass,
  Info,
  Layers,
  ListChecks,
  Lock,
  Package,
  Rocket,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Tag,
  Target,
  Trash2,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  API_CONTRACT_MAP,
  BUG_MAP,
  CURRENT_SPRINT,
  ENV_MAP,
  GATE_MAP,
  RELEASE_MAP,
  REQUIREMENT_MAP,
  ROLE_MAP,
  SDLC_STAGES,
  TASK_MAP,
  TODAY,
  USER_MAP,
  agents,
} from '../data';
import type { Executor, Tone } from '../data';
import {
  CHANGE_SETS,
  RELEASE_CALENDAR,
  REQ_POOL,
  VERSIONS,
  VERSION_BASELINES,
  VERSION_DIFFS,
  VERSION_ID_BY_RELEASE,
  VERSION_MAP,
} from '../data-mgmt';
import type {
  ChangeSetDef,
  ReleaseCalendarItem,
  ReqPoolItemDef,
  VersionBaselineDef,
  VersionDef,
  VersionDiffDef,
  VersionMetricDelta,
} from '../data-mgmt';
import './release.css';

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

type TabId = 'versions' | 'baseline' | 'changeset' | 'diff' | 'calendar';

const TABS: { id: TabId; name: string; icon: typeof Package; count: number }[] = [
  { id: 'versions', name: '版本规划', icon: Package, count: VERSIONS.length },
  { id: 'baseline', name: '基线与冻结', icon: Snowflake, count: VERSION_BASELINES.length },
  { id: 'changeset', name: '变更集', icon: GitCommitHorizontal, count: CHANGE_SETS.length },
  { id: 'diff', name: '版本对比', icon: GitCompareArrows, count: VERSION_DIFFS.length },
  { id: 'calendar', name: '发布日历', icon: CalendarDays, count: RELEASE_CALENDAR.length },
];

/** 版本类型 → 中文标签与标签语义 */
const VERSION_TYPE: Record<VersionDef['type'], { label: string; tone: string }> = {
  feature: { label: '特性版本', tone: 'brand' },
  minor: { label: '次版本', tone: 'info' },
  major: { label: '主版本', tone: 'danger' },
  patch: { label: '补丁版本', tone: 'neutral' },
  rc: { label: '候选发布', tone: 'warn' },
};

/** 版本状态 → 标签语义 */
const VERSION_STATUS_TONE: Record<VersionDef['status'], string> = {
  规划中: 'info',
  开发中: 'brand',
  已冻结: 'warn',
  灰度中: 'ai',
  已发布: 'ok',
  已回滚: 'danger',
};

/** 已进入终态 / 冻结态的版本不可再执行冻结动作 */
const FREEZE_LOCKED: VersionDef['status'][] = ['已冻结', '灰度中', '已发布', '已回滚'];

/** 变更风险等级 → 中文与语义 */
const RISK_META: Record<ChangeSetDef['riskLevel'], { label: string; tone: string }> = {
  high: { label: '高风险', tone: 'danger' },
  medium: { label: '中风险', tone: 'warn' },
  low: { label: '低风险', tone: 'ok' },
};

/** 变更类型 → 标签语义 */
const CHANGE_TYPE_TONE: Record<ChangeSetDef['changeType'], string> = {
  新增: 'ok',
  变更: 'info',
  修复: 'warn',
  移除: 'danger',
  配置: 'neutral',
};

/** 变更集模块 → 手绘 SVG 条形着色（与 CHANGE_SETS.module 的实际取值一一对应） */
const MODULE_HEX: Record<string, string> = {
  数据库: '#4338ca',
  优惠核销: '#db2777',
  消息投递: '#7c3aed',
  运维工具: '#0d9488',
  幂等: '#4f46e5',
  状态机: '#3b82f6',
  缓存: '#b45309',
  订单查询: '#10b981',
  数据合规: '#ef4444',
};

/** 执行主体 → 中文与语义 */
const EXECUTOR_META: Record<Executor, { label: string; tone: string }> = {
  ai: { label: 'AI 执行', tone: 'ai' },
  human: { label: '人工执行', tone: 'info' },
  'ai+human': { label: '人机协同', tone: 'brand' },
};

/** 发布日历事件类型 → 短标签与语义色（覆盖 RELEASE_CALENDAR 的全部 7 类） */
const CAL_EVENT_META: Record<ReleaseCalendarItem['eventType'], { short: string; tone: string }> = {
  版本冻结: { short: '冻结', tone: 'brand' },
  灰度发布: { short: '灰度', tone: 'warn' },
  全量发布: { short: '全量', tone: 'ok' },
  回滚窗口: { short: '回滚', tone: 'slate' },
  大促封网: { short: '封网', tone: 'danger' },
  依赖方联调: { short: '联调', tone: 'info' },
  安全扫描窗口: { short: '安扫', tone: 'ai' },
};

/** 版本 qualityGate 的 6 个键与 GATE_MAP 的门禁 id 对齐 */
const GATE_ORDER: { key: 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6'; id: string }[] = [
  { key: 'g1', id: 'G1' },
  { key: 'g2', id: 'G2' },
  { key: 'g3', id: 'G3' },
  { key: 'g4', id: 'G4' },
  { key: 'g5', id: 'G5' },
  { key: 'g6', id: 'G6' },
];

/**
 * 618 大促预备封网区间（取自 CAL-11 的 date=2026-04-01 与其 title 中声明的 04-01 ~ 04-20）。
 * 数据层未提供结构化的封网结束日期，此处作为页面展示常量固化，供路线图 / 月历 / 窗口推荐使用。
 */
const BLACKOUT = {
  calId: 'CAL-11',
  start: '2026-04-01',
  end: '2026-04-20',
  label: '618 大促预备封网',
};

/** 版本对比中 AI 兼容性风险 → 大号色标语义 */
const COMPAT_RISK: Record<VersionDiffDef['aiCompatibilityRisk'], { label: string; tone: string; hex: string }> = {
  low: { label: '低', tone: 'ok', hex: '#10b981' },
  medium: { label: '中', tone: 'warn', hex: '#f59e0b' },
  high: { label: '高', tone: 'danger', hex: '#ef4444' },
};

/** Agent id → 名称（VERSION_DIFFS.generatedBy 使用 ag-* id） */
const AGENT_NAME: Record<string, string> = agents.reduce<Record<string, string>>((acc, a) => {
  acc[a.id] = a.name;
  return acc;
}, {});

/* ------------------------------------------------------------------ 工具函数 */

/** 数字千分位 */
function num(v: number) {
  return v.toLocaleString('zh-CN');
}

/** 金额 / 小数保留 */
function fixed(v: number, d = 1) {
  return v.toFixed(d);
}

/** 成员姓名（USER_MAP 真实字段为 name / avatarColor） */
function userName(id: string) {
  return USER_MAP[id]?.name ?? id;
}

/** 成员头像色类 */
function avatarCls(id: string) {
  const u = USER_MAP[id];
  return u ? AVATAR_TONE[u.avatarColor] : 'ac-avatar--slate';
}

/** 成员首字（真实字段 initial） */
function userInitial(id: string) {
  return USER_MAP[id]?.initial ?? '·';
}

/** 成员角色简称 */
function roleShort(id: string) {
  const u = USER_MAP[id];
  return u ? ROLE_MAP[u.roleId]?.short ?? '' : '';
}

/** 长文本截断（SVG text 不支持溢出省略） */
function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** 日期字符串（YYYY-MM-DD）→ 距基准日的天数 */
function dayOffset(dateStr: string, base: string) {
  return Math.round((new Date(`${dateStr}T00:00:00`).getTime() - new Date(`${base}T00:00:00`).getTime()) / 86400000);
}

/** 日期字符串 → MM-DD */
function md(dateStr: string) {
  return dateStr.length >= 10 ? dateStr.slice(5, 10) : dateStr;
}

/** 关联对象 id → 类型前缀与标签语义（style.css 仅提供 7 种 ac-tag--{tone}，此处直接给归并后的值） */
function relatedMeta(id: string): { label: string; tone: string } {
  if (id.indexOf('REQ-') === 0) return { label: '需求', tone: 'brand' };
  if (id.indexOf('TASK-') === 0) return { label: '任务', tone: 'info' };
  if (id.indexOf('BUG-') === 0) return { label: '缺陷', tone: 'danger' };
  if (id.indexOf('API-') === 0) return { label: '契约', tone: 'ok' };
  if (id.indexOf('REL-') === 0) return { label: '发布单', tone: 'warn' };
  return { label: '其他', tone: 'neutral' };
}

/** 关联对象 id → 标题（跨 5 个数据源解析） */
function relatedTitle(id: string) {
  if (id.indexOf('REQ-') === 0) return REQUIREMENT_MAP[id]?.title ?? '';
  if (id.indexOf('TASK-') === 0) return TASK_MAP[id]?.title ?? '';
  if (id.indexOf('BUG-') === 0) return BUG_MAP[id]?.title ?? '';
  if (id.indexOf('API-') === 0) return API_CONTRACT_MAP[id]?.name ?? '';
  if (id.indexOf('REL-') === 0) return RELEASE_MAP[id]?.title ?? '';
  return '';
}

/** 关联对象 id → 归属页面（点击跳链时使用） */
function relatedPage(id: string) {
  if (id.indexOf('REQ-') === 0) return 'requirement';
  if (id.indexOf('TASK-') === 0) return 'board';
  if (id.indexOf('BUG-') === 0) return 'bug';
  if (id.indexOf('API-') === 0) return 'design';
  if (id.indexOf('REL-') === 0) return 'pipeline';
  return '';
}

/** 跳转到其他原型页面 */
function jump(page: string) {
  if (page) window.location.hash = `#page=${page}`;
}

/** 门禁名（GATE_MAP 取真实名称，如 G1 → 需求门禁） */
function gateName(id: string) {
  return GATE_MAP[id]?.name ?? id;
}

/** 版本未通过的阻断门禁列表 */
function failedBlockingGates(v: VersionDef) {
  return GATE_ORDER.filter((g) => !v.qualityGate[g.key].pass && GATE_MAP[g.id]?.blocking);
}

/** 版本未通过的全部门禁（含非阻断） */
function failedGates(v: VersionDef) {
  return GATE_ORDER.filter((g) => !v.qualityGate[g.key].pass);
}

/** 复制到剪贴板（制品镜像 / 校验和） */
function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
  }
}

/* ------------------------------------------------------------------ 内联 SVG 图表 */

/** 版本路线图：5 个版本按日期横向排布，含 TODAY 竖线与大促封网区间 */
function VersionRoadmap({
  versions,
  onSelect,
  activeId,
}: {
  versions: VersionDef[];
  onSelect: (v: VersionDef) => void;
  activeId: string;
}) {
  const W = 1120;
  const H = 268;
  const padL = 46;
  const padR = 46;
  const axisY = 150;
  const plotW = W - padL - padR;

  const sorted = useMemo(() => [...versions].sort((a, b) => a.planDate.localeCompare(b.planDate)), [versions]);
  const start = '2026-01-15';
  const total = dayOffset('2026-04-28', start);
  const x = (d: string) => padL + (dayOffset(d, start) / total) * plotW;

  const bx0 = x(BLACKOUT.start);
  const bx1 = x(BLACKOUT.end);
  const tx = x(TODAY);

  const ticks = ['2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15', '2026-04-01', '2026-04-15', '2026-04-28'];

  return (
    <svg
      className="ac-rl-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="版本路线图：v2.2 至 v3.0 共 5 个版本按计划日期横向排布，标注今天与大促封网区间"
    >
      {/* 大促封网区间 */}
      <rect x={bx0} y={30} width={Math.max(bx1 - bx0, 2)} height={axisY - 6} fill="#ef4444" opacity={0.07} />
      <line x1={bx0} y1={30} x2={bx0} y2={axisY + 24} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} opacity={0.55} />
      <line x1={bx1} y1={30} x2={bx1} y2={axisY + 24} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} opacity={0.55} />
      <text className="ac-rl-svg-band" x={(bx0 + bx1) / 2} y={24} textAnchor="middle">
        {BLACKOUT.label}（{md(BLACKOUT.start)} ~ {md(BLACKOUT.end)}）
      </text>

      {/* 月份刻度 */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={axisY} x2={x(t)} y2={axisY + 6} stroke="#cfd6e0" strokeWidth={1} />
          <text className="ac-rl-svg-tick" x={x(t)} y={axisY + 20} textAnchor="middle">
            {md(t)}
          </text>
        </g>
      ))}

      {/* 主轴 */}
      <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="#dfe3ea" strokeWidth={2} />

      {/* 版本节点 */}
      {sorted.map((v, idx) => {
        const dateStr = v.actualDate ?? v.planDate;
        const cx = x(dateStr);
        const up = idx % 2 === 0;
        const color = TONE_HEX[v.tone] ?? TONE_HEX.brand;
        const nodeY = up ? axisY - 46 : axisY + 46;
        const active = v.id === activeId;
        return (
          <g
            key={v.id}
            className="ac-rl-road-node"
            onClick={() => onSelect(v)}
            role="button"
            aria-label={`${v.name} ${v.codeName}，${v.status}`}
          >
            <line x1={cx} y1={axisY} x2={cx} y2={nodeY} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.7} />
            <circle cx={cx} cy={axisY} r={active ? 8 : 6} fill={color} stroke="#fff" strokeWidth={2} />
            {v.status === '规划中' && <circle cx={cx} cy={axisY} r={12} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />}
            <rect
              x={cx - 66}
              y={up ? nodeY - 34 : nodeY - 12}
              width={132}
              height={44}
              rx={7}
              fill="#fff"
              stroke={active ? color : '#e2e6ec'}
              strokeWidth={active ? 2 : 1}
            />
            <text className="ac-rl-road-name" x={cx} y={up ? nodeY - 18 : nodeY + 4} textAnchor="middle">
              {v.name}
            </text>
            <text className="ac-rl-road-sub" x={cx} y={up ? nodeY - 5 : nodeY + 17} textAnchor="middle">
              {VERSION_TYPE[v.type].label} · {v.status}
            </text>
            <text className="ac-rl-road-date" x={cx} y={up ? nodeY + 24 : nodeY - 20} textAnchor="middle">
              {v.actualDate ? `实际 ${md(v.actualDate)}` : `计划 ${md(v.planDate)}`}
            </text>
            {v.breakingChanges && (
              <text className="ac-rl-road-break" x={cx + 58} y={up ? nodeY - 26 : nodeY + 26} textAnchor="middle">
                破坏性
              </text>
            )}
          </g>
        );
      })}

      {/* TODAY 竖线 */}
      <line x1={tx} y1={26} x2={tx} y2={axisY + 40} stroke="#4f46e5" strokeWidth={1.5} />
      <rect x={tx - 30} y={H - 30} width={60} height={20} rx={10} fill="#4f46e5" />
      <text className="ac-rl-svg-today" x={tx} y={H - 16} textAnchor="middle">
        今天 {md(TODAY)}
      </text>
      <line x1={tx} y1={axisY + 40} x2={tx} y2={H - 30} stroke="#4f46e5" strokeWidth={1.5} strokeDasharray="3 3" />
    </svg>
  );
}

/** 门禁六联指示器（G1~G6 通过情况的小型 SVG 条） */
function GatePips({ v, size = 16 }: { v: VersionDef; size?: number }) {
  const gap = 3;
  const w = GATE_ORDER.length * size + (GATE_ORDER.length - 1) * gap;
  return (
    <svg
      width={w}
      height={size}
      viewBox={`0 0 ${w} ${size}`}
      role="img"
      aria-label={`门禁概览：${GATE_ORDER.map((g) => `${g.id}${v.qualityGate[g.key].pass ? '通过' : '未通过'}`).join('、')}`}
    >
      {GATE_ORDER.map((g, i) => {
        const pass = v.qualityGate[g.key].pass;
        return (
          <g key={g.id}>
            <rect
              x={i * (size + gap)}
              y={0}
              width={size}
              height={size}
              rx={3}
              fill={pass ? '#e7f8f1' : '#feecec'}
              stroke={pass ? '#10b981' : '#ef4444'}
              strokeWidth={1}
            />
            <text
              x={i * (size + gap) + size / 2}
              y={size - 4}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={700}
              fill={pass ? '#047857' : '#b91c1c'}
            >
              {g.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 基线时间线：5 条基线的冻结时点与制品产出 */
function BaselineTimeline({
  baselines,
  onSelect,
}: {
  baselines: VersionBaselineDef[];
  onSelect: (b: VersionBaselineDef) => void;
}) {
  const W = 1120;
  const H = 220;
  const padL = 40;
  const padR = 40;
  const axisY = 118;
  const plotW = W - padL - padR;
  const start = '2026-01-20';
  const total = dayOffset('2026-04-20', start);
  const x = (d: string) => padL + (dayOffset(d, start) / total) * plotW;

  const rows = baselines.map((b) => {
    const v = VERSION_MAP[b.versionId];
    const frozen = b.frozenAt !== '';
    return { b, v, frozen, date: frozen ? b.frozenAt.slice(0, 10) : v?.planDate ?? start };
  });

  return (
    <svg
      className="ac-rl-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="基线时间线：5 条版本基线的冻结时点、commit 与制品镜像产出"
    >
      <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="#dfe3ea" strokeWidth={2} />
      {['2026-01-20', '2026-02-10', '2026-03-01', '2026-03-20', '2026-04-10', '2026-04-20'].map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={axisY} x2={x(t)} y2={axisY + 5} stroke="#cfd6e0" />
          <text className="ac-rl-svg-tick" x={x(t)} y={axisY + 19} textAnchor="middle">
            {md(t)}
          </text>
        </g>
      ))}
      <line x1={x(TODAY)} y1={40} x2={x(TODAY)} y2={axisY + 26} stroke="#4f46e5" strokeWidth={1.5} strokeDasharray="4 3" />
      <text className="ac-rl-svg-today-inline" x={x(TODAY) + 5} y={44}>
        今天 {md(TODAY)}
      </text>

      {rows.map((r, i) => {
        const cx = x(r.date);
        const up = i % 2 === 0;
        const color = r.frozen ? TONE_HEX[r.v?.tone ?? 'brand'] : '#94a3b8';
        const boxY = up ? axisY - 86 : axisY + 34;
        return (
          <g key={r.b.id} className="ac-rl-road-node" onClick={() => onSelect(r.b)} role="button" aria-label={`基线 ${r.b.id}`}>
            <line x1={cx} y1={axisY} x2={cx} y2={up ? boxY + 52 : boxY} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.7} />
            <circle cx={cx} cy={axisY} r={6} fill={r.frozen ? color : '#fff'} stroke={color} strokeWidth={2} />
            <rect x={cx - 92} y={boxY} width={184} height={52} rx={7} fill="#fff" stroke={r.frozen ? '#e2e6ec' : '#cfd6e0'} strokeDasharray={r.frozen ? undefined : '4 3'} />
            <text className="ac-rl-road-name" x={cx - 84} y={boxY + 16}>
              {r.b.id} · {r.v?.name ?? ''}
            </text>
            <text className="ac-rl-road-sub" x={cx - 84} y={boxY + 30}>
              {r.frozen ? `冻结 ${r.b.frozenAt}` : '尚未冻结'}
            </text>
            <text className="ac-rl-svg-mono" x={cx - 84} y={boxY + 44}>
              {r.frozen ? `${r.b.commitSha} · ${r.b.tag}` : `${r.b.branch}（待构建）`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 变更规模双向条形图：14 条变更集的 linesAdded / linesDeleted，按模块着色 */
function ChangeSizeBars({ items }: { items: ChangeSetDef[] }) {
  const rowH = 26;
  const labelW = 168;
  const W = 1120;
  const valueW = 96;
  const H = items.length * rowH + 44;
  const halfW = (W - labelW - valueW) / 2;
  const center = labelW + halfW;
  const max = Math.max(...items.map((i) => Math.max(i.linesAdded, i.linesDeleted)), 1);

  return (
    <svg
      className="ac-rl-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="变更规模条形图：各变更集的新增行数与删除行数双向对比，按模块着色"
    >
      <line x1={center} y1={6} x2={center} y2={H - 26} stroke="#cfd6e0" strokeWidth={1} />
      <text className="ac-rl-svg-legend" x={center - 8} y={14} textAnchor="end">
        ← 删除行数
      </text>
      <text className="ac-rl-svg-legend" x={center + 8} y={14}>
        新增行数 →
      </text>
      {items.map((c, idx) => {
        const y = 22 + idx * rowH;
        const color = MODULE_HEX[c.module] ?? '#64748b';
        const aw = Math.max(2, (c.linesAdded / max) * (halfW - 8));
        const dw = Math.max(2, (c.linesDeleted / max) * (halfW - 8));
        return (
          <g key={c.id}>
            <text className="ac-rl-svg-name" x={0} y={y + 14}>
              {clip(`${c.id} ${c.title}`, 22)}
            </text>
            <rect x={center - dw} y={y + 3} width={dw} height={13} rx={2} fill={color} opacity={0.34} />
            <rect x={center} y={y + 3} width={aw} height={13} rx={2} fill={color} />
            <text className="ac-rl-svg-num" x={W} y={y + 14} textAnchor="end">
              +{num(c.linesAdded)} / -{num(c.linesDeleted)}
            </text>
            <title>{`${c.id} ${c.title}｜模块 ${c.module}｜新增 ${num(c.linesAdded)} 行、删除 ${num(c.linesDeleted)} 行`}</title>
          </g>
        );
      })}
      {/* 模块图例 */}
      {Array.from(new Set(items.map((i) => i.module))).map((m, i) => (
        <g key={m}>
          <rect x={labelW + i * 108} y={H - 16} width={9} height={9} rx={2} fill={MODULE_HEX[m] ?? '#64748b'} />
          <text className="ac-rl-svg-legend" x={labelW + i * 108 + 13} y={H - 8}>
            {m}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 指标哑铃图：版本对比 metricDelta 的 from → to，颜色由 good 决定（而非 dir） */
function MetricDumbbell({ items }: { items: VersionMetricDelta[] }) {
  const W = 1080;
  const rowH = 44;
  const labelW = 232;
  const valueW = 176;
  const H = items.length * rowH + 30;
  const left = labelW + 16;
  const right = W - valueW - 16;

  return (
    <svg
      className="ac-rl-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="版本指标对比哑铃图：逐项展示 from 到 to 的变化，颜色表示该变化对业务是否有利"
    >
      <text className="ac-rl-svg-legend" x={left} y={14}>
        起点版本实测值 → 目标版本实测值（绿=对业务有利，红=不利；缺陷类指标下降判定为有利）
      </text>
      {items.map((m, idx) => {
        const y = 26 + idx * rowH;
        const lo = Math.min(m.from, m.to);
        const hi = Math.max(m.from, m.to);
        const span = hi - lo || 1;
        const fx = left + ((m.from - lo) / span) * (right - left);
        const tx = left + ((m.to - lo) / span) * (right - left);
        const color = m.good ? '#10b981' : '#ef4444';
        const cy = y + 18;
        return (
          <g key={m.metric}>
            <text className="ac-rl-svg-name" x={0} y={cy - 2}>
              {clip(m.metric, 20)}
            </text>
            <line x1={left} y1={cy} x2={right} y2={cy} stroke="#eef0f4" strokeWidth={6} strokeLinecap="round" />
            <line x1={Math.min(fx, tx)} y1={cy} x2={Math.max(fx, tx)} y2={cy} stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.85} />
            <circle cx={fx} cy={cy} r={6} fill="#fff" stroke="#94a3b8" strokeWidth={2} />
            <circle cx={tx} cy={cy} r={7} fill={color} stroke="#fff" strokeWidth={2} />
            <text className="ac-rl-svg-num" x={W} y={cy + 4} textAnchor="end">
              {m.dir === 'up' ? '▲' : '▼'} {m.deltaPct > 0 ? '+' : ''}
              {fixed(m.deltaPct)}%
            </text>
            <text className="ac-rl-svg-dumb-val" x={fx} y={cy - 12} textAnchor="middle">
              {m.from}
            </text>
            <text className="ac-rl-svg-dumb-val" x={tx} y={cy - 12} textAnchor="middle">
              {m.to}
            </text>
            <title>{`${m.metric}：${m.from} → ${m.to}（${m.deltaPct > 0 ? '+' : ''}${m.deltaPct}%，${m.good ? '对业务有利' : '对业务不利'}）`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** 发布日历月历（手绘 SVG） */
function MonthCalendar({
  year,
  month,
  items,
  onPick,
}: {
  year: number;
  month: number;
  items: ReleaseCalendarItem[];
  onPick: (it: ReleaseCalendarItem) => void;
}) {
  const W = 1120;
  const headH = 28;
  const cellH = 104;
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = first.getDay();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const H = headH + weeks * cellH + 8;
  const cellW = W / 7;
  const weekNames = ['日', '一', '二', '三', '四', '五', '六'];

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const byDay = useMemo(() => {
    const map: Record<string, ReleaseCalendarItem[]> = {};
    items.forEach((it) => {
      if (it.date.slice(0, 7) !== monthKey) return;
      const k = it.date.slice(8, 10);
      map[k] = map[k] ? [...map[k], it] : [it];
    });
    return map;
  }, [items, monthKey]);

  const blackoutInMonth = monthKey === BLACKOUT.start.slice(0, 7);
  const bStart = blackoutInMonth ? Number(BLACKOUT.start.slice(8, 10)) : 0;
  const bEnd = blackoutInMonth ? Number(BLACKOUT.end.slice(8, 10)) : 0;
  const bx0 = (lead + bStart - 1) * cellW;
  const bx1 = (lead + bEnd) * cellW;

  const todayInMonth = TODAY.slice(0, 7) === monthKey;
  const todayIdx = todayInMonth ? lead + Number(TODAY.slice(8, 10)) - 1 : -1;

  return (
    <svg
      className="ac-rl-svg ac-rl-cal"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`${year} 年 ${month} 月发布日历，共 ${items.filter((i) => i.date.slice(0, 7) === monthKey).length} 个事项`}
    >
      {/* 星期表头 */}
      {weekNames.map((w, i) => (
        <g key={w}>
          <rect x={i * cellW} y={0} width={cellW} height={headH} fill="#fafbfc" />
          <text className="ac-rl-cal-week" x={i * cellW + cellW / 2} y={headH - 9} textAnchor="middle">
            周{w}
          </text>
        </g>
      ))}

      {/* 封网带 */}
      {blackoutInMonth && (
        <rect x={bx0} y={headH} width={Math.max(bx1 - bx0, cellW)} height={weeks * cellH} fill="#ef4444" opacity={0.06} />
      )}

      {/* 日格 */}
      {Array.from({ length: weeks * 7 }).map((_, idx) => {
        const day = idx - lead + 1;
        const inMonth = day >= 1 && day <= daysInMonth;
        const col = idx % 7;
        const row = Math.floor(idx / 7);
        const x0 = col * cellW;
        const y0 = headH + row * cellH;
        const weekend = col === 0 || col === 6;
        const list = inMonth ? byDay[String(day).padStart(2, '0')] ?? [] : [];
        const shown = list.slice(0, 3);
        const hasConflict = list.some((i) => i.conflictNote !== '');
        return (
          <g key={idx}>
            <rect
              x={x0}
              y={y0}
              width={cellW}
              height={cellH}
              fill={inMonth ? (weekend ? '#fcfcfd' : '#fff') : '#f7f8fa'}
              stroke="#eef0f4"
            />
            {inMonth && todayIdx === idx && (
              <rect x={x0 + 1} y={y0 + 1} width={cellW - 2} height={cellH - 2} fill="none" stroke="#4f46e5" strokeWidth={2} />
            )}
            {inMonth && (
              <text className={todayIdx === idx ? 'ac-rl-cal-day ac-rl-cal-day--today' : 'ac-rl-cal-day'} x={x0 + 8} y={y0 + 16}>
                {day}
              </text>
            )}
            {hasConflict && (
              <g>
                <path d={`M ${x0 + cellW - 16} ${y0} L ${x0 + cellW} ${y0} L ${x0 + cellW} ${y0 + 16} Z`} fill="#ef4444" />
                <title>该日存在发布冲突，详见冲突治理区</title>
              </g>
            )}
            {shown.map((it, i) => {
              const meta = CAL_EVENT_META[it.eventType];
              const color = TONE_HEX[meta.tone] ?? TONE_HEX.neutral;
              const py = y0 + 24 + i * 20;
              return (
                <g key={it.id} className="ac-rl-cal-pill" onClick={() => onPick(it)} role="button" aria-label={it.title}>
                  <rect x={x0 + 5} y={py} width={cellW - 10} height={17} rx={3} fill={color} opacity={it.allDay ? 0.92 : 0.14} />
                  <rect x={x0 + 5} y={py} width={3} height={17} rx={1.5} fill={color} />
                  <text
                    className={it.allDay ? 'ac-rl-cal-pill-t ac-rl-cal-pill-t--all' : 'ac-rl-cal-pill-t'}
                    x={x0 + 13}
                    y={py + 12}
                    fill={it.allDay ? '#fff' : color}
                  >
                    {clip(`${meta.short} ${it.title}`, it.allDay ? 13 : 14)}
                  </text>
                  <title>{`${it.date} ${it.eventType}｜${it.title}${it.conflictNote ? `｜冲突：${it.conflictNote}` : ''}`}</title>
                </g>
              );
            })}
            {list.length > 3 && (
              <text className="ac-rl-cal-more" x={x0 + cellW - 8} y={y0 + cellH - 7} textAnchor="end">
                +{list.length - 3}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ 抽屉子组件 */

/** 版本详情抽屉：完整字段 + 六道门禁 + AI 发布说明 + 关联清单 */
function VersionDrawerBody({
  v,
  baseline,
  noteState,
  onAcceptNote,
  onRejectNote,
  onRegenNote,
}: {
  v: VersionDef;
  baseline: VersionBaselineDef | undefined;
  noteState: { accepted: boolean; rejected: boolean; text: string[]; regenerated: number };
  onAcceptNote: () => void;
  onRejectNote: () => void;
  onRegenNote: () => void;
}) {
  const reqs = v.requirementIds.map((id) => REQUIREMENT_MAP[id]).filter(Boolean);
  const tasks = v.taskIds.map((id) => TASK_MAP[id]).filter(Boolean);
  const bugs = v.bugIds.map((id) => BUG_MAP[id]).filter(Boolean);
  const releases = v.releaseIds.map((id) => RELEASE_MAP[id]).filter(Boolean);

  return (
    <>
      <div className="ac-row ac-gap-2 ac-wrap ac-mb-3">
        <span className={`ac-tag ac-tag--${TAG_TONE[v.tone]}`}>{VERSION_TYPE[v.type].label}</span>
        <span className={`ac-tag ac-tag--${VERSION_STATUS_TONE[v.status]}`}>
          <span className="ac-tag-dot" />
          {v.status}
        </span>
        {v.breakingChanges ? (
          <span className="ac-tag ac-tag--danger">
            <AlertTriangle size={12} />
            含破坏性变更
          </span>
        ) : (
          <span className="ac-tag ac-tag--ok">无破坏性变更</span>
        )}
        <span className="ac-tag ac-tag--outline">
          <Snowflake size={12} />
          基线 {v.baselineId}
        </span>
      </div>

      <dl className="ac-kv ac-mb-4">
        <dt>版本代号</dt>
        <dd className="ac-semi">{v.codeName}</dd>
        <dt>计划 / 实际</dt>
        <dd className="ac-mono">
          {v.planDate} → {v.actualDate ?? '未发布'}
          {v.actualDate && v.actualDate !== v.planDate && (
            <span className={`ac-xs ${dayOffset(v.actualDate, v.planDate) > 0 ? 'ac-warn-text' : 'ac-ok-text'}`}>
              （{dayOffset(v.actualDate, v.planDate) > 0 ? `延期 ${dayOffset(v.actualDate, v.planDate)} 天` : '提前发布'}）
            </span>
          )}
        </dd>
        <dt>范围摘要</dt>
        <dd className="ac-lh">{v.scopeSummary}</dd>
        <dt>特性数量</dt>
        <dd className="ac-tnum">{v.featureCount} 个特性</dd>
        <dt>工作项</dt>
        <dd className="ac-tnum">
          需求 {v.requirementIds.length} · 任务 {v.taskIds.length} · 缺陷 {v.bugIds.length}
        </dd>
        <dt>负责人</dt>
        <dd>
          <span className="ac-user">
            <span className={`ac-avatar ac-avatar--sm ${avatarCls(v.owner)}`}>{userInitial(v.owner)}</span>
            <span className="ac-user-name">{userName(v.owner)}</span>
            <span className="ac-user-meta">{roleShort(v.owner)}</span>
          </span>
        </dd>
        <dt>审批人</dt>
        <dd>
          <span className="ac-avatar-group">
            {v.approverIds.map((id) => (
              <span key={id} className={`ac-avatar ac-avatar--sm ${avatarCls(id)}`} title={`${userName(id)} · ${roleShort(id)}`}>
                {userInitial(id)}
              </span>
            ))}
          </span>
        </dd>
        <dt>关联发布单</dt>
        <dd>
          {releases.length === 0 ? (
            <span className="ac-muted">无（该版本未纳管发布单，或发布单尚未排定）</span>
          ) : (
            <span className="ac-row ac-gap-1 ac-wrap">
              {releases.map((r) => (
                <button key={r.id} type="button" className="ac-btn ac-btn--text ac-btn--sm ac-brand-text ac-mono" onClick={() => jump('pipeline')}>
                  {r.id}
                  <ExternalLink size={11} />
                </button>
              ))}
            </span>
          )}
        </dd>
        <dt>兼容性说明</dt>
        <dd className="ac-lh">{v.compatNote}</dd>
        <dt>基线制品</dt>
        <dd className="ac-mono ac-xs">
          {baseline && baseline.artifactImage !== '' ? baseline.artifactImage : '尚未产出'}
        </dd>
      </dl>

      <div className="ac-section-title">六道质量门禁</div>
      <div className="ac-rl-gate-list ac-mb-4">
        {GATE_ORDER.map((g) => {
          const res = v.qualityGate[g.key];
          const gate = GATE_MAP[g.id];
          const stage = SDLC_STAGES.find((s) => s.id === gate?.stageId);
          return (
            <div key={g.id} className={`ac-rl-gate ${res.pass ? 'ac-rl-gate--ok' : 'ac-rl-gate--bad'}`}>
              <span className="ac-rl-gate-icon">{res.pass ? <CheckCircle2 size={15} /> : <XCircle size={15} />}</span>
              <div className="ac-flex-1">
                <div className="ac-rl-gate-head">
                  <span className="ac-rl-gate-name">
                    {g.id} {gate?.name}
                  </span>
                  <span className={`ac-tag ac-tag--sm ac-tag--${res.pass ? 'ok' : gate?.blocking ? 'danger' : 'warn'}`}>
                    {res.pass ? '通过' : gate?.blocking ? '未通过 · 阻断' : '未通过 · 非阻断'}
                  </span>
                  {stage && <span className="ac-xs ac-muted">{stage.name}环节</span>}
                  <span className="ac-xs ac-muted ac-ml-auto ac-mono">责任人 {gate ? ROLE_MAP[gate.ownerRoleId]?.short : '—'}</span>
                </div>
                <div className={`ac-rl-gate-note ${res.pass ? '' : 'ac-danger-text'}`}>{res.note}</div>
              </div>
            </div>
          );
        })}
      </div>
      {!noteState.rejected && failedGates(v).length > 0 && (
        <div className="ac-hint ac-hint--danger ac-mb-4">
          <ShieldAlert size={14} />
          <span>
            {v.name} 当前有 {failedGates(v).length} 道门禁未通过（{failedGates(v).map((g) => g.id).join(' / ')}），
            其中 {failedBlockingGates(v).length} 道为阻断门禁；阻断门禁未清零前，冻结基线与发布单审批都会被平台禁用。
          </span>
        </div>
      )}

      <div className="ac-section-title">AI 发布说明草稿</div>
      <div className="ac-ai-block ac-mb-3">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          ag-ops 生成 · 依据版本范围 / 变更集 / 门禁实测值与灰度记录
          <span className="ac-tag ac-tag--sm ac-tag--outline ac-ml-auto">
            模型成本 ¥{fixed(v.tokenCost, 2)}
            {noteState.regenerated > 0 && ` · 已重生成 ${noteState.regenerated} 次`}
          </span>
        </div>
        <ol className="ac-rl-note-list">
          {noteState.text.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <div className="ac-row ac-gap-2 ac-wrap ac-mt-3">
          <button
            type="button"
            className={`ac-btn ac-btn--sm ${noteState.accepted ? 'ac-btn--ghost ac-btn--disabled' : 'ac-btn--primary'}`}
            onClick={onAcceptNote}
            disabled={noteState.accepted}
          >
            <CheckCircle2 size={13} />
            {noteState.accepted ? '已采纳为正式发布说明' : '采纳为正式发布说明'}
          </button>
          <button
            type="button"
            className={`ac-btn ac-btn--sm ${noteState.rejected ? 'ac-btn--danger-ghost ac-btn--disabled' : 'ac-btn--danger-ghost'}`}
            onClick={onRejectNote}
            disabled={noteState.rejected}
          >
            <Ban size={13} />
            {noteState.rejected ? '已驳回' : '驳回'}
          </button>
          <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={onRegenNote}>
            <RotateCcw size={13} />
            重新生成
          </button>
          <button type="button" className="ac-btn ac-btn--sm ac-btn--text">
            <FileText size={13} />
            编辑
          </button>
        </div>
        {noteState.accepted && (
          <div className="ac-hint ac-hint--ok ac-mt-3">
            <CheckCircle2 size={14} />
            <span>已采纳为 {v.name} 的正式发布说明，随基线 {v.baselineId} 归档并作为 G5 发布门禁的评审证据。</span>
          </div>
        )}
        {noteState.rejected && (
          <div className="ac-hint ac-hint--warn ac-mt-3">
            <AlertTriangle size={14} />
            <span>
              已驳回该草稿。驳回理由会回灌 ag-ops 作为负样本，下一次生成将提高对门禁实测值与灰度批次记录的引用权重；
              人工可点击「编辑」直接改写后再次提交。
            </span>
          </div>
        )}
      </div>

      <div className="ac-section-title">关联工作项</div>
      <div className="ac-rl-rel-group">
        <div className="ac-rl-rel-block">
          <div className="ac-rl-rel-label">
            <ListChecks size={12} />
            需求 {reqs.length}
          </div>
          {reqs.length === 0 ? (
            <div className="ac-xs ac-muted">该版本的工作项属其他 PingCode 项目，未纳入本原型数据集</div>
          ) : (
            reqs.map((r) => (
              <button key={r.id} type="button" className="ac-rl-rel-item" onClick={() => jump('requirement')}>
                <span className="ac-mono ac-xs ac-brand-text">{r.id}</span>
                <span className="ac-rl-rel-title">{r.title}</span>
                <span className={`ac-tag ac-tag--sm ac-tag--${r.priority === 'P0' ? 'danger' : r.priority === 'P1' ? 'warn' : 'neutral'}`}>
                  {r.priority}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="ac-rl-rel-block">
          <div className="ac-rl-rel-label">
            <Boxes size={12} />
            任务 {tasks.length}
          </div>
          {tasks.length === 0 ? (
            <div className="ac-xs ac-muted">无纳入本数据集的任务</div>
          ) : (
            <div className="ac-rl-rel-grid">
              {tasks.map((t) => (
                <button key={t.id} type="button" className="ac-rl-rel-chip" title={t.title} onClick={() => jump('board')}>
                  <span className="ac-mono ac-xs">{t.id}</span>
                  <span className="ac-xs ac-muted ac-ellipsis">{clip(t.title, 14)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ac-rl-rel-block">
          <div className="ac-rl-rel-label">
            <AlertTriangle size={12} />
            缺陷 {bugs.length}
          </div>
          {bugs.length === 0 ? (
            <div className="ac-xs ac-muted">无纳入本数据集的缺陷</div>
          ) : (
            bugs.map((b) => (
              <button key={b.id} type="button" className="ac-rl-rel-item" onClick={() => jump('bug')}>
                <span className="ac-mono ac-xs ac-danger-text">{b.id}</span>
                <span className="ac-rl-rel-title">{clip(b.title, 34)}</span>
                <span className={`ac-tag ac-tag--sm ac-tag--${b.releaseBlocking ? 'danger' : 'neutral'}`}>
                  {b.releaseBlocking ? '阻断发布' : '不阻断'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/** 基线详情抽屉 */
function BaselineDrawerBody({ b, v }: { b: VersionBaselineDef; v: VersionDef | undefined }) {
  const frozen = b.frozenAt !== '';
  return (
    <>
      {frozen ? (
        <div className="ac-hint ac-hint--ok ac-mb-3">
          <Lock size={14} />
          <span>
            基线已于 {b.frozenAt} 由 {userName(b.frozenBy)} 冻结，commit {b.commitSha} 之后的提交不再进入本版本范围，
            需通过变更集走门禁例外流程。
          </span>
        </div>
      ) : (
        <div className="ac-hint ac-hint--warn ac-mb-3">
          <Hourglass size={14} />
          <span>
            该基线尚未冻结：{b.branch} 分支仍在接收提交，commitSha 与校验和为空，制品 {b.artifactImage} 待构建产出。
          </span>
        </div>
      )}

      <dl className="ac-kv ac-mb-4">
        <dt>基线编号</dt>
        <dd className="ac-mono ac-brand-text">{b.id}</dd>
        <dt>所属版本</dt>
        <dd>
          {v ? `${v.name} ${v.codeName}` : b.versionId}
          <span className={`ac-tag ac-tag--sm ac-tag--${v ? VERSION_STATUS_TONE[v.status] : 'neutral'}`}>{v?.status}</span>
        </dd>
        <dt>冻结时间</dt>
        <dd className="ac-mono">{frozen ? b.frozenAt : '—'}</dd>
        <dt>冻结执行人</dt>
        <dd>
          <span className="ac-user">
            <span className={`ac-avatar ac-avatar--sm ${avatarCls(b.frozenBy)}`}>{userInitial(b.frozenBy)}</span>
            <span className="ac-user-name">{userName(b.frozenBy)}</span>
            <span className="ac-user-meta">{frozen ? '冻结执行人' : '计划责任人'}</span>
          </span>
        </dd>
        <dt>commit</dt>
        <dd className="ac-mono">{frozen ? b.commitSha : '尚未冻结'}</dd>
        <dt>分支 / tag</dt>
        <dd className="ac-mono">
          {b.branch} → {b.tag}
        </dd>
        <dt>制品镜像</dt>
        <dd>
          <span className="ac-row ac-gap-2">
            <span className="ac-mono ac-xs ac-rl-artifact">{b.artifactImage}</span>
            <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => copyText(b.artifactImage)}>
              <Copy size={12} />
              复制
            </button>
          </span>
        </dd>
        <dt>制品校验和</dt>
        <dd>
          {frozen ? (
            <span className="ac-row ac-gap-2">
              <span className="ac-mono ac-xs ac-rl-artifact">{b.checksum}</span>
              <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => copyText(b.checksum)}>
                <Copy size={12} />
                复制
              </button>
            </span>
          ) : (
            <span className="ac-muted">待构建产出</span>
          )}
        </dd>
        <dt>签发人</dt>
        <dd>
          {b.signOffIds.length === 0 ? (
            <span className="ac-muted">尚未签发</span>
          ) : (
            <span className="ac-avatar-group">
              {b.signOffIds.map((id) => (
                <span key={id} className={`ac-avatar ac-avatar--sm ${avatarCls(id)}`} title={`${userName(id)} · ${roleShort(id)}`}>
                  {userInitial(id)}
                </span>
              ))}
            </span>
          )}
        </dd>
      </dl>

      <div className="ac-section-title">纳入范围明细</div>
      <div className="ac-metric-grid ac-metric-grid--4 ac-mb-4">
        <div className="ac-metric">
          <div className="ac-metric-head">
            <span className="ac-metric-label">纳入需求</span>
            <span className="ac-metric-icon">
              <ListChecks size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {b.includedCounts.requirements}
            <span className="ac-metric-unit">条</span>
          </div>
          <div className="ac-metric-foot">冻结时点的完整快照口径</div>
        </div>
        <div className="ac-metric ac-metric--info">
          <div className="ac-metric-head">
            <span className="ac-metric-label">纳入任务</span>
            <span className="ac-metric-icon">
              <Boxes size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {b.includedCounts.tasks}
            <span className="ac-metric-unit">个</span>
          </div>
          <div className="ac-metric-foot">含开发 / 联调 / 测试 / 发布</div>
        </div>
        <div className="ac-metric ac-metric--danger">
          <div className="ac-metric-head">
            <span className="ac-metric-label">纳入缺陷</span>
            <span className="ac-metric-icon">
              <AlertTriangle size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {b.includedCounts.bugs}
            <span className="ac-metric-unit">个</span>
          </div>
          <div className="ac-metric-foot">修复随本基线一并交付</div>
        </div>
        <div className="ac-metric ac-metric--ai">
          <div className="ac-metric-head">
            <span className="ac-metric-label">接口契约</span>
            <span className="ac-metric-icon">
              <GitBranch size={14} />
            </span>
          </div>
          <div className="ac-metric-value">
            {b.includedCounts.apiContracts}
            <span className="ac-metric-unit">份</span>
          </div>
          <div className="ac-metric-foot">G2 架构门禁冻结产物</div>
        </div>
      </div>

      <div className="ac-section-title">被移出版本的条目</div>
      {b.excludedItems.length === 0 ? (
        <div className="ac-hint ac-mb-3">
          <Info size={14} />
          <span>本基线无移出条目，版本范围自规划以来未发生裁剪。</span>
        </div>
      ) : (
        <div className="ac-rl-excl-list">
          {b.excludedItems.map((ex) => (
            <div className="ac-rl-excl" key={ex.id}>
              <div className="ac-rl-excl-head">
                <span className={`ac-tag ac-tag--sm ac-tag--${relatedMeta(ex.id).tone}`}>{relatedMeta(ex.id).label}</span>
                <span className="ac-mono ac-xs ac-brand-text">{ex.id}</span>
                <span className="ac-rl-excl-title">{ex.title}</span>
              </div>
              <div className="ac-hint ac-hint--warn ac-rl-excl-reason">
                <ArrowUpRight size={13} />
                <span>{ex.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {v && (
        <>
          <div className="ac-section-title">签发记录</div>
          <div className="ac-timeline">
            <div className="ac-timeline-item ac-timeline-item--ok">
              <div className="ac-timeline-head">
                <span className="ac-timeline-title">范围冻结评审</span>
                <span className="ac-timeline-time">{frozen ? b.frozenAt : '待排期'}</span>
              </div>
              <div className="ac-timeline-desc">
                确认 {v.name} 的范围摘要与 {b.includedCounts.requirements} 条需求 / {b.includedCounts.tasks} 个任务一致，
                移出 {b.excludedItems.length} 个条目并逐条登记原因。
              </div>
            </div>
            <div className={`ac-timeline-item ${frozen ? 'ac-timeline-item--ok' : 'ac-timeline-item--dim'}`}>
              <div className="ac-timeline-head">
                <span className="ac-timeline-title">制品构建与校验</span>
                <span className="ac-timeline-time">{frozen ? b.frozenAt : '—'}</span>
              </div>
              <div className="ac-timeline-desc">
                {frozen
                  ? `产出 ${b.artifactImage}，校验和 ${b.checksum.slice(0, 20)}…，与 ${b.tag} 一致。`
                  : '尚未构建，无制品与校验和。'}
              </div>
            </div>
            <div className={`ac-timeline-item ${b.signOffIds.length > 0 ? 'ac-timeline-item--ok' : 'ac-timeline-item--dim'}`}>
              <div className="ac-timeline-head">
                <span className="ac-timeline-title">签发</span>
                <span className="ac-timeline-time">{b.signOffIds.length > 0 ? `${b.signOffIds.length} 人签核` : '待签发'}</span>
              </div>
              <div className="ac-timeline-desc">
                {b.signOffIds.length > 0
                  ? `${b.signOffIds.map((id) => `${userName(id)}（${roleShort(id)}）`).join('、')} 完成签核，基线进入不可变状态。`
                  : '需研发总监与架构师双签后基线方可生效。'}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** 变更集详情抽屉 */
function ChangeSetDrawerBody({ c }: { c: ChangeSetDef }) {
  const v = VERSION_MAP[c.versionId];
  const related = c.relatedIds;
  const mrIds = c.mrIds;
  return (
    <>
      <div className="ac-row ac-gap-2 ac-wrap ac-mb-3">
        <span className={`ac-tag ac-tag--${CHANGE_TYPE_TONE[c.changeType]}`}>{c.changeType}</span>
        <span className="ac-tag ac-tag--outline">
          <Layers size={12} />
          {c.module}
        </span>
        <span className={`ac-tag ac-tag--${RISK_META[c.riskLevel].tone}`}>{RISK_META[c.riskLevel].label}</span>
        <span className={`ac-tag ac-tag--${EXECUTOR_META[c.executor].tone}`}>{EXECUTOR_META[c.executor].label}</span>
        {c.dbMigration && (
          <span className="ac-tag ac-tag--danger">
            <Database size={12} />
            含数据库迁移
          </span>
        )}
        {c.breakingApi && (
          <span className="ac-tag ac-tag--danger">
            <ShieldAlert size={12} />
            破坏性接口变更
          </span>
        )}
      </div>

      <dl className="ac-kv ac-mb-4">
        <dt>编号</dt>
        <dd className="ac-mono ac-brand-text">{c.id}</dd>
        <dt>所属版本</dt>
        <dd>{v ? `${v.id} · ${v.name} ${v.codeName}` : c.versionId}</dd>
        <dt>变更规模</dt>
        <dd className="ac-tnum">
          <span className="ac-ok-text">+{num(c.linesAdded)}</span> / <span className="ac-danger-text">-{num(c.linesDeleted)}</span>
          <span className="ac-xs ac-muted">（净增 {num(c.linesAdded - c.linesDeleted)} 行）</span>
        </dd>
        <dt>接口变更</dt>
        <dd>{c.apiChanged ? '有接口契约变更' : '无接口契约变更'}</dd>
        <dt>评审人</dt>
        <dd>
          <span className="ac-avatar-group">
            {c.reviewerIds.map((id) => (
              <span key={id} className={`ac-avatar ac-avatar--sm ${avatarCls(id)}`} title={`${userName(id)} · ${roleShort(id)}`}>
                {userInitial(id)}
              </span>
            ))}
          </span>
        </dd>
        <dt>关联 MR</dt>
        <dd>
          {mrIds.length === 0 ? (
            <span className="ac-muted">无代码 MR（配置 / 数据类变更，通过发布单直接执行）</span>
          ) : (
            <span className="ac-row ac-gap-1 ac-wrap">
              {mrIds.map((m) => (
                <span key={m} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">
                  {m}
                </span>
              ))}
            </span>
          )}
        </dd>
      </dl>

      <div className="ac-section-title">数据库迁移</div>
      {c.dbMigration ? (
        <div className="ac-hint ac-hint--warn ac-mb-4">
          <Database size={14} />
          <span>
            迁移脚本 <span className="ac-mono">{c.migrationScript}</span>
            ：必须在 DBA 窗口内执行，且与回滚脚本成对归档；生产执行前需在预生产完成 3 轮零差异比对。
          </span>
        </div>
      ) : (
        <div className="ac-hint ac-mb-4">
          <Info size={14} />
          <span>本变更集不涉及数据库结构变更，回滚只需还原代码 / 配置。</span>
        </div>
      )}

      <div className="ac-section-title">回滚方案</div>
      <div className="ac-rl-rollback ac-mb-4">
        <RotateCcw size={14} />
        <span>{c.rollbackPlan}</span>
      </div>

      <div className="ac-section-title">影响面分析</div>
      <div className="ac-rl-impact ac-mb-4">
        <div className="ac-rl-impact-row">
          <span className="ac-rl-impact-k">直接影响</span>
          <span className="ac-rl-impact-v">
            {c.module}模块，变更类型「{c.changeType}」，代码规模 +{num(c.linesAdded)} / -{num(c.linesDeleted)} 行。
          </span>
        </div>
        <div className="ac-rl-impact-row">
          <span className="ac-rl-impact-k">接口影响</span>
          <span className="ac-rl-impact-v">
            {c.apiChanged
              ? `涉及接口契约变更，relatedIds 中的 API-* 需同步升版${c.breakingApi ? '；其中含破坏性变更，下游必须改造并保留 3 个月兼容期开关' : '；均为向后兼容的新增'}`
              : '不涉及对外接口契约，下游无需改造。'}
          </span>
        </div>
        <div className="ac-rl-impact-row">
          <span className="ac-rl-impact-k">门禁影响</span>
          <span className="ac-rl-impact-v">
            {c.riskLevel === 'high'
              ? '高风险变更需通过 G3 编码门禁（覆盖率 ≥ 85%）与 G4 测试门禁（P0/P1 缺陷清零），并在 G5 发布门禁中登记回滚演练记录。'
              : c.riskLevel === 'medium'
                ? '中风险变更需通过 G3 编码门禁，并在 G4 测试门禁中覆盖回归用例。'
                : '低风险变更随所属版本的门禁整体判定，无需单独签核。'}
          </span>
        </div>
        <div className="ac-rl-impact-row">
          <span className="ac-rl-impact-k">执行主体</span>
          <span className="ac-rl-impact-v">
            {EXECUTOR_META[c.executor].label}
            {c.executor === 'ai' && '：由 ag-code / ag-ops 自动执行，人工仅在门禁失败时介入。'}
            {c.executor === 'ai+human' && '：AI 产出变更草案与回滚脚本，人工完成评审与窗口执行。'}
            {c.executor === 'human' && '：以人工操作为主（配置中心 / DBA 窗口），平台负责留痕与校验。'}
          </span>
        </div>
      </div>

      <div className="ac-section-title">关联对象</div>
      <div className="ac-rl-rel-grid">
        {related.map((id) => {
          const meta = relatedMeta(id);
          return (
            <button key={id} type="button" className="ac-rl-rel-chip" title={relatedTitle(id)} onClick={() => jump(relatedPage(id))}>
              <span className={`ac-tag ac-tag--sm ac-tag--${meta.tone}`}>{meta.label}</span>
              <span className="ac-mono ac-xs">{id}</span>
              <span className="ac-xs ac-muted ac-ellipsis">{clip(relatedTitle(id), 18)}</span>
            </button>
          );
        })}
      </div>

      <div className="ac-hint ac-hint--ai ac-mt-4">
        <Sparkles size={14} />
        <span>
          编号口径说明：本处 {c.id} 属「版本变更集」编号（CS-01 ~ CS-14，按版本内模块聚合）；
          而任务详情里的 CS-24xx 属「AI 编码会话」编号（TaskDef.sessionId），两者前缀相近但语义不同，不可互相替代。
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 页面 */

export default function ReleasePage() {
  const [tab, setTab] = useState<TabId>('versions');

  /* ---- 抽屉 ---- */
  const [drawerVersion, setDrawerVersion] = useState<VersionDef | null>(null);
  const [drawerBaseline, setDrawerBaseline] = useState<VersionBaselineDef | null>(null);
  const [drawerChangeSet, setDrawerChangeSet] = useState<ChangeSetDef | null>(null);
  const [drawerCal, setDrawerCal] = useState<ReleaseCalendarItem | null>(null);

  /* ---- 本地乐观更新 ---- */
  /** AI 发布说明：采纳 / 驳回 / 重新生成 */
  const [noteOverrides, setNoteOverrides] = useState<
    Record<string, { accepted: boolean; rejected: boolean; text: string[]; regenerated: number }>
  >({});
  /** 版本范围建议：采纳 / 驳回 */
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, 'accepted' | 'rejected'>>({});
  /** 冻结预检 Modal 的目标版本 */
  const [freezeTarget, setFreezeTarget] = useState<VersionDef | null>(null);
  /** 高风险变更 AI 建议的采纳状态 */
  const [riskOverrides, setRiskOverrides] = useState<Record<string, 'accepted' | 'rejected'>>({});
  /** 日历冲突：采纳调整 / 保持原计划 */
  const [calOverrides, setCalOverrides] = useState<Record<string, 'adjusted' | 'kept'>>({});
  /** 升级检查清单勾选态 */
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  /* ---- 变更集筛选 ---- */
  const [csVersion, setCsVersion] = useState<string>('VER-04');
  const [csType, setCsType] = useState<string>('all');
  const [csModule, setCsModule] = useState<string>('all');
  const [csRisk, setCsRisk] = useState<string>('all');
  const [csDbOnly, setCsDbOnly] = useState(false);
  const [csBreakingOnly, setCsBreakingOnly] = useState(false);
  const [csKeyword, setCsKeyword] = useState('');

  /* ---- 版本对比选择 ---- */
  const [diffFrom, setDiffFrom] = useState<string>(VERSION_DIFFS[0].fromVersionId);
  const [diffTo, setDiffTo] = useState<string>(VERSION_DIFFS[0].toVersionId);

  /* ---- 发布日历月份 ---- */
  const [calMonth, setCalMonth] = useState<string>('2026-03');

  /* ============================== 派生数据 ============================== */

  const baselinesByVersion = useMemo(() => {
    const m: Record<string, VersionBaselineDef> = {};
    VERSION_BASELINES.forEach((b) => {
      m[b.versionId] = b;
    });
    return m;
  }, []);

  const sortedVersions = useMemo(() => [...VERSIONS].sort((a, b) => a.planDate.localeCompare(b.planDate)), []);

  /** 当前活跃版本：优先「开发中」，其次「已冻结」且计划日期最近者 */
  const activeVersion = useMemo(() => {
    const dev = VERSIONS.find((v) => v.status === '开发中');
    if (dev) return dev;
    const frozen = VERSIONS.filter((v) => v.status === '已冻结').sort((a, b) => b.planDate.localeCompare(a.planDate));
    return frozen[0] ?? VERSIONS[0];
  }, []);

  const changesetModules = useMemo(() => Array.from(new Set(CHANGE_SETS.map((c) => c.module))), []);

  const filteredChangeSets = useMemo(() => {
    const kw = csKeyword.trim().toLowerCase();
    return CHANGE_SETS.filter((c) => {
      if (csVersion !== 'all' && c.versionId !== csVersion) return false;
      if (csType !== 'all' && c.changeType !== csType) return false;
      if (csModule !== 'all' && c.module !== csModule) return false;
      if (csRisk !== 'all' && c.riskLevel !== csRisk) return false;
      if (csDbOnly && !c.dbMigration) return false;
      if (csBreakingOnly && !c.breakingApi) return false;
      if (kw && !`${c.id} ${c.title} ${c.module} ${c.migrationScript} ${c.mrIds.join(' ')}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [csVersion, csType, csModule, csRisk, csDbOnly, csBreakingOnly, csKeyword]);

  const highRiskChangeSets = useMemo(
    () => CHANGE_SETS.filter((c) => c.breakingApi || c.dbMigration),
    [],
  );

  const activeDiff = useMemo<VersionDiffDef | undefined>(
    () => VERSION_DIFFS.find((d) => d.fromVersionId === diffFrom && d.toVersionId === diffTo),
    [diffFrom, diffTo],
  );

  const calMonths = useMemo(() => {
    const set = new Set<string>();
    RELEASE_CALENDAR.forEach((it) => set.add(it.date.slice(0, 7)));
    return Array.from(set).sort();
  }, []);

  const calItems = useMemo(
    () => [...RELEASE_CALENDAR].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [],
  );

  const conflictItems = useMemo(() => RELEASE_CALENDAR.filter((it) => it.conflictNote !== ''), []);

  /** AI 版本范围建议：基于当前迭代剩余产能与需求池高分项推导 */
  const scopeSuggestions = useMemo(() => {
    const leftPoints = CURRENT_SPRINT.capacity - CURRENT_SPRINT.committed;
    /** 尚未挂靠任何版本的高分需求池条目（requirementId 为 null 且 aiPriorityScore ≥ 55） */
    const poolCandidates = REQ_POOL.filter((p) => p.requirementId === null && p.aiPriorityScore >= 55).sort(
      (a, b) => b.aiPriorityScore - a.aiPriorityScore,
    );
    const rc = VERSION_MAP['VER-04'];
    const ga = VERSION_MAP['VER-05'];
    const items: {
      key: string;
      action: '纳入' | '移出';
      target: string;
      subject: string;
      reason: string;
      points: number;
      tone: Tone;
      pool?: ReqPoolItemDef;
    }[] = [];

    items.push({
      key: 'scope-move-out-req2405',
      action: '移出',
      target: `${rc.name} → Sprint 25`,
      subject: 'REQ-2405 多仓多商家拆单与合单能力',
      points: REQUIREMENT_MAP['REQ-2405']?.storyPoints ?? 13,
      tone: 'warn',
      reason:
        `G3 单测覆盖率 71.4%（阈值 85%），近 7 日增速 0.64pt/日，按斜率补齐需 21 天而迭代仅剩 8 天；` +
        `同时 API-10 拆单预演契约仍为草稿、WMS 协议未冻结（PTR-10 已登记）。把 REQ-2405（13 点）移出 rc1 可释放约 13 点产能，` +
        `把 G3 覆盖率补齐的窗口从 21 天压缩到 12 天，让 REL-2403 有机会在 03-26 的顺延窗口执行。`,
    });

    items.push({
      key: 'scope-move-in-rp09',
      action: '纳入',
      target: `${ga.name}（v3.0）`,
      subject: 'RP-09 order-query 缓存穿透率超阈值：热点 Key 缺少空值兜底',
      points: REQ_POOL.find((p) => p.id === 'RP-09')?.estimatePoints ?? 5,
      tone: 'info',
      pool: REQ_POOL.find((p) => p.id === 'RP-09'),
      reason:
        `ag-ba 从 Prometheus 指标主动发现：订单详情缓存穿透率 0.42%，已超出 REQ-2404 验收标准 AC1 的 0.3% 上限，` +
        `且穿透请求 78% 集中在不存在的订单号（疑似恶意扫描）。AI 优先级分 73、技术复杂度仅 4（空值缓存 + 布隆过滤器），` +
        `预估 5 点。v3.0 计划日期 2026-04-10 落在封网期内，本身需要申请豁免，把这项大促容量类修复并入可增强豁免申请的理由。`,
    });

    poolCandidates.slice(0, 2).forEach((p) => {
      if (p.id === 'RP-09') return;
      items.push({
        key: `scope-pool-${p.id}`,
        action: '纳入',
        target: `${ga.name}（v3.0）或 Sprint 25 首批`,
        subject: `${p.id} ${p.title}`,
        points: p.estimatePoints,
        tone: p.tone,
        pool: p,
        reason: `${p.aiScoreReason} 当前处于「${p.stage}」阶段，AI 优先级分 ${p.aiPriorityScore}、预估 ${p.estimatePoints} 点，尚未挂靠任何版本基线。`,
      });
    });

    return { items, leftPoints };
  }, []);

  /** AI 发布窗口推荐：跳过封网期与已有生产事项，优先工作日中段 */
  const windowSuggestions = useMemo(() => {
    const occupied = new Set(RELEASE_CALENDAR.filter((it) => it.envIds.indexOf('env-prod') >= 0).map((it) => it.date));
    const out: { date: string; score: number; reasons: string[] }[] = [];
    const base = new Date('2026-03-20T00:00:00');
    for (let i = 0; i < 45 && out.length < 3; i += 1) {
      const d = new Date(base.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      if (iso <= TODAY) continue;
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (iso >= BLACKOUT.start && iso <= BLACKOUT.end) continue;
      if (occupied.has(iso)) continue;
      const reasons: string[] = [];
      let score = 60;
      if (dow === 2 || dow === 3 || dow === 4) {
        score += 18;
        reasons.push('周二至周四，值班 DBA 与 SRE 全员在岗，回滚响应最快');
      } else {
        reasons.push('周一 / 周五，需额外确认值班排班');
      }
      if (iso > '2026-03-25') {
        score += 12;
        reasons.push('晚于 03-25，可为 G3 覆盖率补齐与 G4 剩余 54 组金额边界用例回归留出时间');
      }
      score -= dayOffset(BLACKOUT.start, iso) > 0 && dayOffset(BLACKOUT.start, iso) < 5 ? 10 : 0;
      if (dayOffset(BLACKOUT.start, iso) > 0 && dayOffset(BLACKOUT.start, iso) < 5) {
        reasons.push(`距 ${BLACKOUT.label}（${md(BLACKOUT.start)}）不足 5 天，观察期可能被封网截断`);
      }
      reasons.push('当日无其他 env-prod 事项占用，连接池与 DBA 值班资源无争用');
      out.push({ date: iso, score, reasons });
    }
    return out.sort((a, b) => b.score - a.score);
  }, []);

  /* ============================== 行为 ============================== */

  const noteStateOf = (v: VersionDef) =>
    noteOverrides[v.id] ?? { accepted: false, rejected: false, text: v.aiReleaseNote, regenerated: 0 };

  const acceptNote = (v: VersionDef) =>
    setNoteOverrides((prev) => ({ ...prev, [v.id]: { ...noteStateOf(v), accepted: true } }));

  const rejectNote = (v: VersionDef) =>
    setNoteOverrides((prev) => ({ ...prev, [v.id]: { ...noteStateOf(v), rejected: true } }));

  const regenNote = (v: VersionDef) =>
    setNoteOverrides((prev) => {
      const cur = noteStateOf(v);
      const extra = `（重新生成 ${cur.regenerated + 1} 次）补充引用 ${
        failedGates(v).length > 0 ? `门禁未通过项 ${failedGates(v).map((g) => g.id).join(' / ')} 的当前实测值与整改责任人` : '最近一次灰度批次的观察记录'
      }，并同步 CHANGE_SETS 中 ${CHANGE_SETS.filter((c) => c.versionId === v.id).length} 条变更集的回滚开关名`;
      return {
        ...prev,
        [v.id]: {
          accepted: false,
          rejected: false,
          regenerated: cur.regenerated + 1,
          text: [...v.aiReleaseNote, `${extra}`],
        },
      };
    });

  const activeDiffChecklist = useMemo(() => {
    if (!activeDiff) return [];
    const s = activeDiff.summary;
    const out: { key: string; text: string; tone: string }[] = [];
    if (s.breakingApis > 0) {
      out.push({
        key: 'ck-breaking',
        tone: 'danger',
        text: `向全部下游发出破坏性变更通知（${s.breakingApis} 项），并取得书面确认回执`,
      });
      out.push({ key: 'ck-switch', tone: 'warn', text: '确认每个破坏性变更都有可用的回落开关，且开关已演练' });
    }
    if (s.dbMigrations > 0) {
      out.push({ key: 'ck-dba', tone: 'danger', text: `预约 DBA 生产窗口执行 ${s.dbMigrations} 项数据库迁移，并归档回滚脚本` });
      out.push({ key: 'ck-dryrun', tone: 'warn', text: '在预生产完成 3 轮零差异比对，留存比对报告' });
    }
    if (s.newApis > 0) {
      out.push({ key: 'ck-api', tone: 'info', text: `${s.newApis} 份新增接口契约完成签署冻结（G2 架构门禁）` });
    }
    if (s.fixedBugs > 0) {
      out.push({ key: 'ck-bug', tone: 'ok', text: `${s.fixedBugs} 个缺陷的回归用例已合入测试计划并执行通过` });
    }
    if (activeDiff.removedItems.length > 0) {
      out.push({
        key: 'ck-removed',
        tone: 'warn',
        text: `${activeDiff.removedItems.length} 个移出条目已登记去向（下一版本或需求池），避免范围丢失`,
      });
    }
    out.push({ key: 'ck-observe', tone: 'info', text: 'G6 观测面板与 SLO 基线就绪，切流后可立即验证生产指标' });
    return out;
  }, [activeDiff]);

  /* ============================== 渲染 ============================== */

  return (
    <div className="ac-rl" data-annotation-id="ai-sdlc-release-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">版本管理</div>
          <div className="ac-page-desc">
            本页负责版本的<b>规划、范围冻结、基线与变更集</b>，回答发布前「做什么 / 含什么」；单次发布的<b>执行过程</b>
            （构建、门禁、灰度、回滚）在「部署流水线」页。两者通过 VERSIONS.releaseIds ↔ RELEASE_ORDERS.id
            （VERSION_ID_BY_RELEASE 反查）双向关联。数据口径贯穿「订单中心重构」（EPIC-ORDER-REF）· {CURRENT_SPRINT.name}：
            5 个版本（v2.2 → v3.0）、5 条基线、14 条变更集、4 组版本对比、12 个发布日历事项，今天 {TODAY}。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            {CURRENT_SPRINT.name} · {CURRENT_SPRINT.startDate} ~ {CURRENT_SPRINT.endDate}
          </span>
          <span className="ac-tag ac-tag--warn">
            <Snowflake size={12} />
            活跃版本 {activeVersion.name}
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('pipeline')}>
            <Rocket size={13} />
            去部署流水线
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
              <span className="ac-tab-count">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* ================= 1. 版本规划 ================= */}
      {tab === 'versions' && (
        <>
          <div className="ac-section-title">版本路线图</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-release-roadmap">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Target size={16} />
                v2.2 → v3.0 版本时间轴
              </span>
              <span className="ac-card-subtitle">已发布版本显示实际日期，未发布显示计划日期；节点色取自版本语义色</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  <CalendarDays size={12} />
                  {sortedVersions[0].planDate} ~ {sortedVersions[sortedVersions.length - 1].planDate}
                </span>
                <span className="ac-tag ac-tag--danger">
                  <Ban size={12} />
                  {BLACKOUT.label}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <VersionRoadmap versions={VERSIONS} onSelect={setDrawerVersion} activeId={drawerVersion?.id ?? ''} />
              <div className="ac-rl-legend">
                <span className="ac-rl-legend-item">
                  <span className="ac-rl-legend-dot" style={{ background: TONE_HEX.ok }} />
                  已发布
                </span>
                <span className="ac-rl-legend-item">
                  <span className="ac-rl-legend-dot" style={{ background: TONE_HEX.warn }} />
                  已冻结待发布
                </span>
                <span className="ac-rl-legend-item">
                  <span className="ac-rl-legend-dot" style={{ background: TONE_HEX.info }} />
                  规划中
                </span>
                <span className="ac-rl-legend-item">
                  <span className="ac-rl-legend-line" />
                  今天（{TODAY}）
                </span>
                <span className="ac-rl-legend-item">
                  <span className="ac-rl-legend-band" />
                  大促预备封网（禁止非紧急生产变更）
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">版本卡片</div>
          <div className="ac-grid-3 ac-rl-ver-grid" data-annotation-id="ai-sdlc-release-cards">
            {sortedVersions.map((v) => {
              const bl = baselinesByVersion[v.id];
              const failed = failedGates(v);
              return (
                <div
                  className="ac-rl-ver-card"
                  key={v.id}
                  onClick={() => setDrawerVersion(v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setDrawerVersion(v);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="ac-rl-ver-head">
                    <div className="ac-flex-1">
                      <div className="ac-rl-ver-name">
                        {v.name}
                        <span className="ac-rl-ver-code">{v.codeName}</span>
                      </div>
                      <div className="ac-row ac-gap-1 ac-wrap ac-mt-1">
                        <span className={`ac-tag ac-tag--sm ac-tag--${VERSION_TYPE[v.type].tone}`}>{VERSION_TYPE[v.type].label}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${VERSION_STATUS_TONE[v.status]}`}>{v.status}</span>
                        {v.breakingChanges && (
                          <span className="ac-tag ac-tag--sm ac-tag--danger">
                            <AlertTriangle size={11} />
                            破坏性
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`ac-avatar ac-avatar--lg ac-avatar--square ${avatarCls(v.owner)}`} title={`负责人 ${userName(v.owner)}`}>
                      {userInitial(v.owner)}
                    </span>
                  </div>

                  <div className="ac-rl-ver-scope">{v.scopeSummary}</div>

                  <div className="ac-rl-ver-stats">
                    <span>
                      <ListChecks size={12} />
                      需求 <b>{v.requirementIds.length}</b>
                    </span>
                    <span>
                      <Boxes size={12} />
                      任务 <b>{v.taskIds.length}</b>
                    </span>
                    <span>
                      <AlertTriangle size={12} />
                      缺陷 <b>{v.bugIds.length}</b>
                    </span>
                    <span>
                      <Zap size={12} />
                      特性 <b>{v.featureCount}</b>
                    </span>
                  </div>

                  <div className="ac-rl-ver-foot">
                    <span className="ac-row ac-gap-1">
                      <Clock size={11} className="ac-muted" />
                      <span className="ac-xs ac-mono">{v.actualDate ?? v.planDate}</span>
                    </span>
                    <GatePips v={v} size={15} />
                    <span className="ac-avatar-group ac-ml-auto">
                      {v.approverIds.slice(0, 3).map((id) => (
                        <span key={id} className={`ac-avatar ac-avatar--xs ${avatarCls(id)}`} title={`审批人 ${userName(id)}`}>
                          {userInitial(id)}
                        </span>
                      ))}
                      {v.approverIds.length > 3 && <span className="ac-avatar-more">+{v.approverIds.length - 3}</span>}
                    </span>
                  </div>

                  {failed.length > 0 ? (
                    <div className="ac-hint ac-hint--danger ac-rl-ver-hint">
                      <ShieldAlert size={13} />
                      <span>
                        {failed.map((g) => g.id).join(' / ')} 未通过（{failedBlockingGates(v).length} 道阻断），冻结与发布审批被禁用
                      </span>
                    </div>
                  ) : (
                    <div className="ac-hint ac-hint--ok ac-rl-ver-hint">
                      <ShieldCheck size={13} />
                      <span>G1 ~ G6 六道门禁全部通过，基线 {bl?.id ?? v.baselineId} 可签发</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ac-section-title">版本清单</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-release-table">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                版本总表（15 列）
              </span>
              <span className="ac-card-subtitle">点击任意行查看完整详情、六道门禁逐项结论与 AI 发布说明草稿</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">共 {VERSIONS.length} 个版本</span>
                <span className="ac-tag ac-tag--ai">
                  <Sparkles size={12} />
                  发布说明草稿成本 ¥{fixed(VERSIONS.reduce((s, v) => s + v.tokenCost, 0), 2)}
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>版本</th>
                      <th>代号</th>
                      <th>类型</th>
                      <th>状态</th>
                      <th className="ac-td-num">计划日期</th>
                      <th className="ac-td-num">实际日期</th>
                      <th>范围摘要</th>
                      <th className="ac-td-right">需求</th>
                      <th className="ac-td-right">任务</th>
                      <th className="ac-td-right">缺陷</th>
                      <th className="ac-td-right">特性</th>
                      <th className="ac-td-center">破坏性变更</th>
                      <th>负责人</th>
                      <th>关联发布单</th>
                      <th className="ac-td-center">门禁 G1~G6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVersions.map((v) => (
                      <tr key={v.id} className="ac-rl-row" onClick={() => setDrawerVersion(v)} title="点击查看版本详情">
                        <td>
                          <div className="ac-rl-cell-name">{v.name}</div>
                          <span className="ac-xs ac-muted ac-mono">{v.id}</span>
                        </td>
                        <td className="ac-text-2">{v.codeName}</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${VERSION_TYPE[v.type].tone}`}>{VERSION_TYPE[v.type].label}</span>
                        </td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${VERSION_STATUS_TONE[v.status]}`}>
                            <span className="ac-tag-dot" />
                            {v.status}
                          </span>
                        </td>
                        <td className="ac-td-num">{v.planDate}</td>
                        <td className="ac-td-num">{v.actualDate ?? '—'}</td>
                        <td className="ac-rl-cell-scope">{clip(v.scopeSummary, 46)}</td>
                        <td className="ac-td-num">{v.requirementIds.length}</td>
                        <td className="ac-td-num">{v.taskIds.length}</td>
                        <td className="ac-td-num">{v.bugIds.length}</td>
                        <td className="ac-td-num">{v.featureCount}</td>
                        <td className="ac-td-center">
                          {v.breakingChanges ? (
                            <span className="ac-tag ac-tag--sm ac-tag--danger">是</span>
                          ) : (
                            <span className="ac-tag ac-tag--sm ac-tag--neutral">否</span>
                          )}
                        </td>
                        <td>
                          <span className="ac-user">
                            <span className={`ac-avatar ac-avatar--xs ${avatarCls(v.owner)}`}>{userInitial(v.owner)}</span>
                            <span className="ac-user-name">{userName(v.owner)}</span>
                          </span>
                        </td>
                        <td>
                          {v.releaseIds.length === 0 ? (
                            <span className="ac-xs ac-muted">未纳管</span>
                          ) : (
                            <span className="ac-row ac-gap-1 ac-wrap">
                              {v.releaseIds.map((rid) => {
                                const rel = RELEASE_MAP[rid];
                                return (
                                  <button
                                    key={rid}
                                    type="button"
                                    className={`ac-tag ac-tag--sm ac-tag--${
                                      rel?.status === 'blocked' ? 'danger' : rel?.status === 'released' ? 'ok' : 'warn'
                                    }`}
                                    title={`${rel?.title}｜窗口 ${rel?.windowStart} ~ ${rel?.windowEnd}`}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      jump('pipeline');
                                    }}
                                  >
                                    {rid}
                                    <ExternalLink size={10} />
                                  </button>
                                );
                              })}
                            </span>
                          )}
                        </td>
                        <td className="ac-td-center">
                          <GatePips v={v} size={14} />
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
                  VER-01（v2.2）与 VER-02（v2.3）的工作项属 PingCode「会员中心」「支付中台」项目，未纳入本原型数据集，
                  故需求 / 任务 / 缺陷三列为 0，其完整规模口径见「基线与冻结」标签页的 includedCounts；
                  VER-01 早于发布单纳管、VER-05 尚未排定发布单，故关联发布单为空。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 版本范围建议</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-release-scope">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                ag-pm · 版本范围调整建议
              </span>
              <span className="ac-card-subtitle">
                依据 {CURRENT_SPRINT.name} 剩余产能、门禁斜率与需求池 AI 优先级分推导，采纳后写回版本基线范围
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  {CURRENT_SPRINT.name} 产能 {CURRENT_SPRINT.capacity} 点 · 已承诺 {CURRENT_SPRINT.committed} · 已完成{' '}
                  {CURRENT_SPRINT.completed} · 剩余 {scopeSuggestions.leftPoints} 点
                </span>
                <span className="ac-tag ac-tag--ai">{scopeSuggestions.items.length} 条建议</span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-hint ac-hint--ai ac-mb-3">
                <Sparkles size={14} />
                <span>
                  AI 做了什么：把 {CURRENT_SPRINT.name}（{CURRENT_SPRINT.startDate} ~ {CURRENT_SPRINT.endDate}）的剩余产能、
                  G3 覆盖率增速斜率、需求池 aiPriorityScore ≥ 55 的未挂靠条目三者放在一起求解，给出「纳入 / 移出」建议。
                  依据是什么：CURRENT_SPRINT 的 capacity / committed / completed、VERSIONS[*].qualityGate 的实测 note、
                  REQ_POOL 的 aiScoreReason。人工如何介入：每条建议都可单独采纳或驳回，驳回理由会回灌 ag-pm 作为负样本。
                </span>
              </div>

              <div className="ac-rl-scope-list">
                {scopeSuggestions.items.map((s) => {
                  const st = scopeOverrides[s.key];
                  return (
                    <div className={`ac-rl-scope ${st === 'accepted' ? 'ac-rl-scope--accepted' : st === 'rejected' ? 'ac-rl-scope--rejected' : ''}`} key={s.key}>
                      <div className="ac-rl-scope-head">
                        <span className={`ac-tag ac-tag--sm ac-tag--${s.action === '移出' ? 'warn' : 'ok'}`}>
                          {s.action === '移出' ? <Trash2 size={11} /> : <Plus0Icon />}
                          建议{s.action}
                        </span>
                        <span className="ac-rl-scope-subject">{s.subject}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[s.tone]}`}>{s.target}</span>
                        <span className="ac-tag ac-tag--sm ac-tag--outline">{s.points} 点</span>
                      </div>
                      <div className="ac-rl-scope-reason">{s.reason}</div>
                      {s.pool && (
                        <div className="ac-rl-scope-meta">
                          <span>
                            <Tag size={11} />
                            {s.pool.code} · {s.pool.sourceType}
                          </span>
                          <span>
                            <Activity size={11} />
                            AI 优先级分 {s.pool.aiPriorityScore}
                          </span>
                          <span>
                            <Flag size={11} />
                            {s.pool.stage}
                          </span>
                          <span>
                            <Users size={11} />
                            评审 {s.pool.reviewers.map((r) => userName(r)).join('、')}
                          </span>
                        </div>
                      )}
                      <div className="ac-row ac-gap-2 ac-mt-2">
                        <button
                          type="button"
                          className={`ac-btn ac-btn--sm ${st === 'accepted' ? 'ac-btn--ghost ac-btn--disabled' : 'ac-btn--primary'}`}
                          disabled={st === 'accepted'}
                          onClick={() => setScopeOverrides((p) => ({ ...p, [s.key]: 'accepted' }))}
                        >
                          <CheckCircle2 size={13} />
                          {st === 'accepted' ? '已采纳' : '采纳'}
                        </button>
                        <button
                          type="button"
                          className={`ac-btn ac-btn--sm ac-btn--danger-ghost ${st === 'rejected' ? 'ac-btn--disabled' : ''}`}
                          disabled={st === 'rejected'}
                          onClick={() => setScopeOverrides((p) => ({ ...p, [s.key]: 'rejected' }))}
                        >
                          <Ban size={13} />
                          {st === 'rejected' ? '已驳回' : '驳回'}
                        </button>
                        {st === 'accepted' && (
                          <span className="ac-hint ac-hint--ok ac-rl-scope-done">
                            <CheckCircle2 size={13} />
                            <span>
                              已写入版本范围：{s.action === '移出' ? '从目标基线剔除并登记去向' : '纳入目标版本基线'}，
                              同步刷新 includedCounts 与对应 VERSION_DIFFS 的 addedItems / removedItems。
                            </span>
                          </span>
                        )}
                        {st === 'rejected' && (
                          <span className="ac-hint ac-hint--warn ac-rl-scope-done">
                            <AlertTriangle size={13} />
                            <span>已驳回，理由回灌 ag-pm；本条建议在 24 小时内不再重复推送。</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 2. 基线与冻结 ================= */}
      {tab === 'baseline' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-release-baseline">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Snowflake size={16} />
                版本基线（代码冻结快照）
              </span>
              <span className="ac-card-subtitle">每版本一条基线，记录冻结时点、commit、制品镜像与校验和</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">已冻结 {VERSION_BASELINES.filter((b) => b.frozenAt !== '').length}</span>
                <span className="ac-tag ac-tag--outline">待冻结 {VERSION_BASELINES.filter((b) => b.frozenAt === '').length}</span>
              </div>
            </div>
            <div className="ac-card-body">
              <BaselineTimeline baselines={VERSION_BASELINES} onSelect={setDrawerBaseline} />
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>基线编号</th>
                      <th>所属版本</th>
                      <th className="ac-td-num">冻结时间</th>
                      <th>冻结人</th>
                      <th>commit</th>
                      <th>分支</th>
                      <th>tag</th>
                      <th>制品镜像</th>
                      <th className="ac-td-right">纳入需求</th>
                      <th className="ac-td-right">纳入任务</th>
                      <th className="ac-td-right">纳入缺陷</th>
                      <th className="ac-td-right">接口契约</th>
                      <th>校验和</th>
                      <th>签发人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VERSION_BASELINES.map((b) => {
                      const v = VERSION_MAP[b.versionId];
                      const frozen = b.frozenAt !== '';
                      return (
                        <tr key={b.id} className="ac-rl-row" onClick={() => setDrawerBaseline(b)} title="点击查看基线详情">
                          <td className="ac-mono ac-brand-text">{b.id}</td>
                          <td>
                            <div className="ac-rl-cell-name">{v?.name ?? b.versionId}</div>
                            <span className="ac-xs ac-muted">{v?.codeName}</span>
                          </td>
                          <td className="ac-td-num">{frozen ? b.frozenAt : <span className="ac-muted">未冻结</span>}</td>
                          <td>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ${avatarCls(b.frozenBy)}`}>{userInitial(b.frozenBy)}</span>
                              <span className="ac-user-name">{userName(b.frozenBy)}</span>
                            </span>
                          </td>
                          <td className="ac-mono ac-xs">{frozen ? b.commitSha : '—'}</td>
                          <td className="ac-mono ac-xs ac-text-2">{b.branch}</td>
                          <td className="ac-mono ac-xs">{b.tag}</td>
                          <td>
                            <span className="ac-row ac-gap-1">
                              <span className="ac-mono ac-xs ac-rl-artifact">{clip(b.artifactImage, 44)}</span>
                              <button
                                type="button"
                                className="ac-btn ac-btn--text ac-btn--sm"
                                title="复制制品镜像地址"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  copyText(b.artifactImage);
                                }}
                              >
                                <Copy size={12} />
                              </button>
                            </span>
                          </td>
                          <td className="ac-td-num">{b.includedCounts.requirements}</td>
                          <td className="ac-td-num">{b.includedCounts.tasks}</td>
                          <td className="ac-td-num">{b.includedCounts.bugs}</td>
                          <td className="ac-td-num">{b.includedCounts.apiContracts}</td>
                          <td>
                            {frozen ? (
                              <span className="ac-row ac-gap-1">
                                <span className="ac-mono ac-xs ac-muted">{clip(b.checksum, 22)}</span>
                                <button
                                  type="button"
                                  className="ac-btn ac-btn--text ac-btn--sm"
                                  title="复制校验和"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    copyText(b.checksum);
                                  }}
                                >
                                  <Copy size={12} />
                                </button>
                              </span>
                            ) : (
                              <span className="ac-xs ac-muted">待构建</span>
                            )}
                          </td>
                          <td>
                            {b.signOffIds.length === 0 ? (
                              <span className="ac-xs ac-muted">未签发</span>
                            ) : (
                              <span className="ac-avatar-group">
                                {b.signOffIds.map((id) => (
                                  <span key={id} className={`ac-avatar ac-avatar--xs ${avatarCls(id)}`} title={userName(id)}>
                                    {userInitial(id)}
                                  </span>
                                ))}
                              </span>
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

          <div className="ac-section-title">冻结操作</div>
          <div className="ac-grid-2">
            {VERSIONS.filter((v) => FREEZE_LOCKED.indexOf(v.status) < 0).map((v) => {
              const bl = baselinesByVersion[v.id];
              const blocked = failedBlockingGates(v);
              const all = failedGates(v);
              const canFreeze = blocked.length === 0;
              return (
                <div className="ac-card ac-rl-freeze-card" key={v.id}>
                  <div className="ac-card-head">
                    <span className="ac-card-title">
                      <Lock size={16} />
                      {v.name} {v.codeName}
                    </span>
                    <span className="ac-card-subtitle">
                      {bl?.branch} · 计划纳入 {bl?.includedCounts.requirements ?? 0} 需求 / {bl?.includedCounts.tasks ?? 0} 任务
                    </span>
                    <div className="ac-card-extra">
                      <span className={`ac-tag ac-tag--sm ac-tag--${VERSION_STATUS_TONE[v.status]}`}>{v.status}</span>
                    </div>
                  </div>
                  <div className="ac-card-body">
                    <div className="ac-row ac-gap-2 ac-wrap ac-mb-3">
                      <GatePips v={v} size={20} />
                      <span className="ac-xs ac-muted">
                        G1~G6 中 {6 - all.length} 通过 / {all.length} 未通过（{blocked.length} 道阻断）
                      </span>
                    </div>
                    {canFreeze ? (
                      <div className="ac-hint ac-hint--ok ac-mb-3">
                        <ShieldCheck size={14} />
                        <span>全部阻断门禁通过，可执行基线冻结；冻结后 {bl?.branch} 分支将拒绝新的合入。</span>
                      </div>
                    ) : (
                      <div className="ac-hint ac-hint--danger ac-mb-3">
                        <ShieldAlert size={14} />
                        <span>
                          <b>冻结按钮已禁用</b>：{blocked.map((g) => `${g.id} ${gateName(g.id)}`).join('、')} 为阻断门禁且未通过。
                          平台规范：阻断门禁未清零时，冻结基线、发布单审批与灰度批次准入三项操作同时禁用，不接受口头豁免。
                        </span>
                      </div>
                    )}
                    <ul className="ac-rl-freeze-gates">
                      {all.map((g) => (
                        <li key={g.id}>
                          <XCircle size={12} className="ac-danger-text" />
                          <span className="ac-mono ac-xs ac-danger-text">{g.id}</span>
                          <span className="ac-xs ac-text-2">{v.qualityGate[g.key].note}</span>
                        </li>
                      ))}
                      {all.length === 0 && <li className="ac-xs ac-muted">无未通过门禁</li>}
                    </ul>
                  </div>
                  <div className="ac-card-foot ac-row ac-gap-2">
                    <button
                      type="button"
                      className={`ac-btn ac-btn--sm ${canFreeze ? 'ac-btn--primary' : 'ac-btn--ghost'}`}
                      onClick={() => setFreezeTarget(v)}
                    >
                      <Snowflake size={13} />
                      {canFreeze ? '冻结基线' : '冻结预检'}
                    </button>
                    <span className="ac-xs ac-muted">
                      {canFreeze ? '将弹出二次确认，列出纳入条目数与门禁结论' : '门禁未通过，仅可查看预检结论，无法确认冻结'}
                    </span>
                  </div>
                </div>
              );
            })}
            {VERSIONS.filter((v) => FREEZE_LOCKED.indexOf(v.status) < 0).length === 0 && (
              <div className="ac-card">
                <div className="ac-empty ac-empty--sm">
                  <span className="ac-empty-icon">
                    <Snowflake size={22} />
                  </span>
                  <div className="ac-empty-title">当前没有可冻结的版本</div>
                  <div className="ac-empty-desc">全部 5 个版本均已进入「已冻结 / 灰度中 / 已发布」终态，冻结操作只在「开发中 / 规划中」阶段开放。</div>
                </div>
              </div>
            )}
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Lock size={16} />
                已进入终态的版本
              </span>
              <span className="ac-card-subtitle">基线不可变，任何范围调整都必须通过新的变更集走门禁例外流程</span>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>版本</th>
                      <th>基线</th>
                      <th>状态</th>
                      <th className="ac-td-num">冻结时间</th>
                      <th>commit</th>
                      <th>移出条目</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VERSIONS.filter((v) => FREEZE_LOCKED.indexOf(v.status) >= 0).map((v) => {
                      const bl = baselinesByVersion[v.id];
                      return (
                        <tr key={v.id} className="ac-rl-row" onClick={() => bl && setDrawerBaseline(bl)}>
                          <td className="ac-rl-cell-name">{v.name}</td>
                          <td className="ac-mono ac-xs">{bl?.id}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${VERSION_STATUS_TONE[v.status]}`}>{v.status}</span>
                          </td>
                          <td className="ac-td-num">{bl?.frozenAt || '—'}</td>
                          <td className="ac-mono ac-xs">{bl?.commitSha || '—'}</td>
                          <td className="ac-td-num">{bl?.excludedItems.length ?? 0}</td>
                          <td className="ac-rl-cell-scope">{clip(v.compatNote, 60)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 3. 变更集 ================= */}
      {tab === 'changeset' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-release-changeset">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <GitCommitHorizontal size={16} />
                版本变更集（15 列）
              </span>
              <span className="ac-card-subtitle">
                按版本内模块聚合的变更单元；编号 CS-01 ~ CS-14 与任务详情里的 AI 编码会话 CS-24xx 是两套独立编号
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  命中 {filteredChangeSets.length} / {CHANGE_SETS.length}
                </span>
                <span className="ac-tag ac-tag--danger">高风险 {highRiskChangeSets.length}</span>
              </div>
            </div>

            <div className="ac-filter-bar">
              <div className="ac-field ac-field--inline">
                <span className="ac-field-label">版本</span>
                <select className="ac-select ac-select--sm" value={csVersion} onChange={(e) => setCsVersion(e.target.value)}>
                  <option value="all">全部版本</option>
                  {VERSIONS.filter((v) => CHANGE_SETS.some((c) => c.versionId === v.id)).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.codeName}（{CHANGE_SETS.filter((c) => c.versionId === v.id).length}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="ac-field ac-field--inline">
                <span className="ac-field-label">变更类型</span>
                <select className="ac-select ac-select--sm" value={csType} onChange={(e) => setCsType(e.target.value)}>
                  <option value="all">全部</option>
                  {(['新增', '变更', '修复', '移除', '配置'] as ChangeSetDef['changeType'][]).map((t) => (
                    <option key={t} value={t}>
                      {t}（{CHANGE_SETS.filter((c) => c.changeType === t).length}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="ac-field ac-field--inline">
                <span className="ac-field-label">模块</span>
                <select className="ac-select ac-select--sm" value={csModule} onChange={(e) => setCsModule(e.target.value)}>
                  <option value="all">全部</option>
                  {changesetModules.map((m) => (
                    <option key={m} value={m}>
                      {m}（{CHANGE_SETS.filter((c) => c.module === m).length}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="ac-field ac-field--inline">
                <span className="ac-field-label">风险</span>
                <select className="ac-select ac-select--sm" value={csRisk} onChange={(e) => setCsRisk(e.target.value)}>
                  <option value="all">全部</option>
                  <option value="high">高风险</option>
                  <option value="medium">中风险</option>
                  <option value="low">低风险</option>
                </select>
              </div>
              <label className="ac-rl-check">
                <input type="checkbox" checked={csDbOnly} onChange={(e) => setCsDbOnly(e.target.checked)} />
                <Database size={12} />
                仅含 DB 迁移
              </label>
              <label className="ac-rl-check">
                <input type="checkbox" checked={csBreakingOnly} onChange={(e) => setCsBreakingOnly(e.target.checked)} />
                <ShieldAlert size={12} />
                仅破坏性接口
              </label>
              <div className="ac-rl-search">
                <Search size={13} className="ac-muted" />
                <input
                  className="ac-input ac-input--sm"
                  placeholder="搜索编号 / 标题 / 模块 / 迁移脚本 / MR"
                  value={csKeyword}
                  onChange={(e) => setCsKeyword(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto"
                onClick={() => {
                  setCsVersion('all');
                  setCsType('all');
                  setCsModule('all');
                  setCsRisk('all');
                  setCsDbOnly(false);
                  setCsBreakingOnly(false);
                  setCsKeyword('');
                }}
              >
                <Filter size={13} />
                重置筛选
              </button>
            </div>

            <div className="ac-card-body ac-card-body--flush">
              {filteredChangeSets.length === 0 ? (
                <div className="ac-empty">
                  <span className="ac-empty-icon">
                    <Search size={22} />
                  </span>
                  <div className="ac-empty-title">没有符合条件的变更集</div>
                  <div className="ac-empty-desc">当前筛选组合下 14 条变更集均不匹配，可放宽风险等级或清空关键字后重试。</div>
                </div>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm ac-table--bordered">
                    <thead>
                      <tr>
                        <th>编号</th>
                        <th>标题</th>
                        <th>变更类型</th>
                        <th>模块</th>
                        <th>所属版本</th>
                        <th>关联对象</th>
                        <th>数据库迁移</th>
                        <th>回滚方案</th>
                        <th className="ac-td-center">风险</th>
                        <th>评审人</th>
                        <th>MR</th>
                        <th className="ac-td-right">增 / 删行</th>
                        <th className="ac-td-center">接口变更</th>
                        <th className="ac-td-center">破坏性接口</th>
                        <th>执行主体</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChangeSets.map((c) => {
                        const v = VERSION_MAP[c.versionId];
                        return (
                          <tr key={c.id} className="ac-rl-row" onClick={() => setDrawerChangeSet(c)} title="点击查看变更集详情">
                            <td className="ac-mono ac-brand-text">{c.id}</td>
                            <td className="ac-rl-cell-title">{clip(c.title, 40)}</td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${CHANGE_TYPE_TONE[c.changeType]}`}>{c.changeType}</span>
                            </td>
                            <td>
                              <span className="ac-rl-module">
                                <span className="ac-rl-module-dot" style={{ background: MODULE_HEX[c.module] ?? '#64748b' }} />
                                {c.module}
                              </span>
                            </td>
                            <td className="ac-xs ac-text-2">
                              {v?.name}
                              <div className="ac-xs ac-muted ac-mono">{c.versionId}</div>
                            </td>
                            <td>
                              <span className="ac-row ac-gap-1 ac-wrap">
                                {c.relatedIds.slice(0, 4).map((rid) => (
                                  <button
                                    key={rid}
                                    type="button"
                                    className={`ac-tag ac-tag--sm ac-tag--${relatedMeta(rid).tone}`}
                                    title={`${relatedMeta(rid).label}｜${relatedTitle(rid)}`}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      jump(relatedPage(rid));
                                    }}
                                  >
                                    {rid}
                                  </button>
                                ))}
                                {c.relatedIds.length > 4 && (
                                  <span className="ac-tag ac-tag--sm ac-tag--outline">+{c.relatedIds.length - 4}</span>
                                )}
                              </span>
                            </td>
                            <td>
                              {c.dbMigration ? (
                                <span className="ac-mono ac-xs ac-warn-text" title={c.migrationScript}>
                                  <Database size={11} /> {clip(c.migrationScript, 26)}
                                </span>
                              ) : (
                                <span className="ac-xs ac-muted">无</span>
                              )}
                            </td>
                            <td className="ac-rl-cell-scope">{clip(c.rollbackPlan, 34)}</td>
                            <td className="ac-td-center">
                              <span className={`ac-tag ac-tag--sm ac-tag--${RISK_META[c.riskLevel].tone}`}>{RISK_META[c.riskLevel].label}</span>
                            </td>
                            <td>
                              <span className="ac-avatar-group">
                                {c.reviewerIds.map((id) => (
                                  <span key={id} className={`ac-avatar ac-avatar--xs ${avatarCls(id)}`} title={`${userName(id)} · ${roleShort(id)}`}>
                                    {userInitial(id)}
                                  </span>
                                ))}
                              </span>
                            </td>
                            <td>
                              {c.mrIds.length === 0 ? (
                                <span className="ac-xs ac-muted">—</span>
                              ) : (
                                <span className="ac-mono ac-xs ac-text-2">{c.mrIds.join(', ')}</span>
                              )}
                            </td>
                            <td className="ac-td-num">
                              <span className="ac-ok-text">+{num(c.linesAdded)}</span>
                              <span className="ac-muted"> / </span>
                              <span className="ac-danger-text">-{num(c.linesDeleted)}</span>
                            </td>
                            <td className="ac-td-center">
                              {c.apiChanged ? <span className="ac-tag ac-tag--sm ac-tag--info">有</span> : <span className="ac-xs ac-muted">无</span>}
                            </td>
                            <td className="ac-td-center">
                              {c.breakingApi ? (
                                <span className="ac-tag ac-tag--sm ac-tag--danger">
                                  <ShieldAlert size={10} />
                                  是
                                </span>
                              ) : (
                                <span className="ac-xs ac-muted">否</span>
                              )}
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${EXECUTOR_META[c.executor].tone}`}>
                                {EXECUTOR_META[c.executor].label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="ac-section-title">变更规模</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Activity size={16} />
                14 条变更集的新增 / 删除行数
              </span>
              <span className="ac-card-subtitle">中轴左侧为删除行数（34% 透明度），右侧为新增行数；颜色按模块区分</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">+{num(CHANGE_SETS.reduce((s, c) => s + c.linesAdded, 0))}</span>
                <span className="ac-tag ac-tag--danger">-{num(CHANGE_SETS.reduce((s, c) => s + c.linesDeleted, 0))}</span>
              </div>
            </div>
            <div className="ac-card-body">
              <ChangeSizeBars items={filteredChangeSets.length > 0 ? filteredChangeSets : CHANGE_SETS} />
            </div>
          </div>

          <div className="ac-section-title">高风险变更</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ShieldAlert size={16} />
                含破坏性接口或数据库迁移的变更集
              </span>
              <span className="ac-card-subtitle">这些变更集必须在发布前完成下游通知、DBA 窗口预约与回滚演练</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--danger">
                  破坏性接口 {CHANGE_SETS.filter((c) => c.breakingApi).length}
                </span>
                <span className="ac-tag ac-tag--warn">DB 迁移 {CHANGE_SETS.filter((c) => c.dbMigration).length}</span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-hint ac-hint--danger ac-mb-3">
                <ShieldAlert size={14} />
                <span>
                  {highRiskChangeSets.length} 条高风险变更集集中在 {VERSION_MAP['VER-04'].name}（
                  {highRiskChangeSets.filter((c) => c.versionId === 'VER-04').length} 条），
                  其中 5 项数据库迁移的「基因分片」与「全量迁移」必须在同一个 DBA 窗口内串行执行、不可拆分；
                  3 项破坏性接口变更（状态机非法流转、订单号基因位、offset 分页废弃）均需下游改造并保留 3 个月兼容期开关。
                </span>
              </div>

              <div className="ac-ai-block ac-mb-3">
                <div className="ac-ai-block-title">
                  <Sparkles size={14} />
                  ag-arch · 迁移与兼容建议
                </div>
                <ol className="ac-rl-note-list">
                  <li>
                    迁移顺序固定为 V2401（幂等唯一索引）→ V2402（outbox 表）→ V2408（状态流水分区表）→ V2413（基因分片）→ V2419（全量迁移）；
                    前三项可并行，后两项必须串行且在同一 DBA 窗口内完成。
                  </li>
                  <li>
                    V2413 基因分片上线后，任何按旧规则从订单号解析用户维度的下游都会失配，需改用 API-02 的显式查询；
                    建议在灰度批次 1（1%）之前完成下游改造扫描，由 ag-arch 出具体清单。
                  </li>
                  <li>
                    订单列表 offset 分页废弃后，page 参数返回 PAGE_PARAM_DEPRECATED；兼容期内 API-03 同时接受 page 与 cursor，
                    3 个月后下线 page 分支，需在技术债跟踪中登记下线日期。
                  </li>
                  <li>
                    V2422（SM4 加密）为密文落库，数据侧唯一回滚手段是 KMS 密钥版本回退，密文本身不做反向解密；
                    旧报表必须切换到脱敏视图 order_pii_masked_view，否则将读到密文。
                  </li>
                </ol>
                <div className="ac-row ac-gap-2 ac-wrap ac-mt-3">
                  <button
                    type="button"
                    className={`ac-btn ac-btn--sm ${riskOverrides['risk-migration'] === 'accepted' ? 'ac-btn--ghost ac-btn--disabled' : 'ac-btn--ai'}`}
                    disabled={riskOverrides['risk-migration'] === 'accepted'}
                    onClick={() => setRiskOverrides((p) => ({ ...p, 'risk-migration': 'accepted' }))}
                  >
                    <CheckCircle2 size={13} />
                    {riskOverrides['risk-migration'] === 'accepted' ? '已采纳并生成迁移工单' : '采纳为迁移执行顺序'}
                  </button>
                  <button
                    type="button"
                    className={`ac-btn ac-btn--sm ac-btn--danger-ghost ${riskOverrides['risk-migration'] === 'rejected' ? 'ac-btn--disabled' : ''}`}
                    disabled={riskOverrides['risk-migration'] === 'rejected'}
                    onClick={() => setRiskOverrides((p) => ({ ...p, 'risk-migration': 'rejected' }))}
                  >
                    <Ban size={13} />
                    {riskOverrides['risk-migration'] === 'rejected' ? '已驳回' : '驳回'}
                  </button>
                </div>
                {riskOverrides['risk-migration'] === 'accepted' && (
                  <div className="ac-hint ac-hint--ok ac-mt-3">
                    <CheckCircle2 size={14} />
                    <span>已采纳：迁移顺序写入 REL-2403 的发布前置检查项，并同步给 DBA 值班组与 ag-ops。</span>
                  </div>
                )}
              </div>

              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>标题</th>
                      <th>版本</th>
                      <th className="ac-td-center">破坏性接口</th>
                      <th>迁移脚本</th>
                      <th>回滚方案</th>
                      <th className="ac-td-right">增 / 删行</th>
                      <th className="ac-td-center">风险</th>
                      <th>评审人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highRiskChangeSets.map((c) => (
                      <tr key={c.id} className="ac-rl-row" onClick={() => setDrawerChangeSet(c)}>
                        <td className="ac-mono ac-brand-text">{c.id}</td>
                        <td className="ac-rl-cell-title">{clip(c.title, 44)}</td>
                        <td className="ac-xs ac-text-2">{VERSION_MAP[c.versionId]?.name}</td>
                        <td className="ac-td-center">
                          {c.breakingApi ? <span className="ac-tag ac-tag--sm ac-tag--danger">是</span> : <span className="ac-xs ac-muted">否</span>}
                        </td>
                        <td className="ac-mono ac-xs">{c.migrationScript || '—'}</td>
                        <td className="ac-rl-cell-scope">{clip(c.rollbackPlan, 40)}</td>
                        <td className="ac-td-num">
                          <span className="ac-ok-text">+{num(c.linesAdded)}</span> / <span className="ac-danger-text">-{num(c.linesDeleted)}</span>
                        </td>
                        <td className="ac-td-center">
                          <span className={`ac-tag ac-tag--sm ac-tag--${RISK_META[c.riskLevel].tone}`}>{RISK_META[c.riskLevel].label}</span>
                        </td>
                        <td>
                          <span className="ac-avatar-group">
                            {c.reviewerIds.map((id) => (
                              <span key={id} className={`ac-avatar ac-avatar--xs ${avatarCls(id)}`} title={userName(id)}>
                                {userInitial(id)}
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 4. 版本对比 ================= */}
      {tab === 'diff' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-release-diff">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <GitCompareArrows size={16} />
                相邻版本差异对比
              </span>
              <span className="ac-card-subtitle">4 组对比：v2.2→v2.3、v2.3→v2.4、v2.4→v3.0-rc1、v3.0-rc1→v3.0</span>
              <div className="ac-card-extra">
                <div className="ac-field ac-field--inline">
                  <span className="ac-field-label">起始</span>
                  <select className="ac-select ac-select--sm" value={diffFrom} onChange={(e) => setDiffFrom(e.target.value)}>
                    {VERSIONS.slice(0, VERSIONS.length - 1).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.codeName}
                      </option>
                    ))}
                  </select>
                </div>
                <ArrowUpRight size={16} className="ac-muted" />
                <div className="ac-field ac-field--inline">
                  <span className="ac-field-label">目标</span>
                  <select className="ac-select ac-select--sm" value={diffTo} onChange={(e) => setDiffTo(e.target.value)}>
                    {VERSIONS.slice(1).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.codeName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="ac-card-body">
              {!activeDiff ? (
                <div className="ac-empty">
                  <span className="ac-empty-icon">
                    <GitCompareArrows size={22} />
                  </span>
                  <div className="ac-empty-title">该版本组合没有预生成的对比数据</div>
                  <div className="ac-empty-desc">
                    平台只为相邻版本生成对比快照（VERSION_DIFFS 共 4 组）。请选择相邻的两个版本，例如 {VERSION_MAP[diffFrom]?.name} →{' '}
                    {VERSIONS.find((v) => VERSION_DIFFS.some((d) => d.fromVersionId === diffFrom && d.toVersionId === v.id))?.name ?? '…'}。
                  </div>
                </div>
              ) : (
                <>
                  <div className="ac-rl-diff-head">
                    <span className="ac-rl-diff-ver">
                      {VERSION_MAP[activeDiff.fromVersionId].name}
                      <em>{VERSION_MAP[activeDiff.fromVersionId].codeName}</em>
                    </span>
                    <ArrowUpRight size={20} className="ac-brand-text" />
                    <span className="ac-rl-diff-ver ac-rl-diff-ver--to">
                      {VERSION_MAP[activeDiff.toVersionId].name}
                      <em>{VERSION_MAP[activeDiff.toVersionId].codeName}</em>
                    </span>
                    <span className="ac-tag ac-tag--outline ac-mono">{activeDiff.id}</span>
                    <span className="ac-tag ac-tag--ai">
                      <Sparkles size={12} />
                      {AGENT_NAME[activeDiff.generatedBy] ?? activeDiff.generatedBy}（{activeDiff.generatedBy}）生成于 {activeDiff.generatedAt}
                    </span>
                  </div>

                  <div className="ac-rl-summary">
                    <div className="ac-rl-sum">
                      <span className="ac-rl-sum-icon ac-rl-sum-icon--ok">
                        <Plus0Icon />
                      </span>
                      <span className="ac-rl-sum-value">{activeDiff.summary.addedFeatures}</span>
                      <span className="ac-rl-sum-label">新增特性</span>
                    </div>
                    <div className="ac-rl-sum">
                      <span className="ac-rl-sum-icon ac-rl-sum-icon--info">
                        <GitCommitHorizontal size={15} />
                      </span>
                      <span className="ac-rl-sum-value">{activeDiff.summary.changedFeatures}</span>
                      <span className="ac-rl-sum-label">变更特性</span>
                    </div>
                    <div className="ac-rl-sum">
                      <span className="ac-rl-sum-icon ac-rl-sum-icon--neutral">
                        <Trash2 size={15} />
                      </span>
                      <span className="ac-rl-sum-value">{activeDiff.summary.removedFeatures}</span>
                      <span className="ac-rl-sum-label">移除特性</span>
                    </div>
                    <div className="ac-rl-sum">
                      <span className="ac-rl-sum-icon ac-rl-sum-icon--ok">
                        <CheckCircle2 size={15} />
                      </span>
                      <span className="ac-rl-sum-value">{activeDiff.summary.fixedBugs}</span>
                      <span className="ac-rl-sum-label">修复缺陷</span>
                    </div>
                    <div className="ac-rl-sum">
                      <span className="ac-rl-sum-icon ac-rl-sum-icon--brand">
                        <GitBranch size={15} />
                      </span>
                      <span className="ac-rl-sum-value">{activeDiff.summary.newApis}</span>
                      <span className="ac-rl-sum-label">新增接口</span>
                    </div>
                    <div className="ac-rl-sum">
                      <span className="ac-rl-sum-icon ac-rl-sum-icon--danger">
                        <ShieldAlert size={15} />
                      </span>
                      <span className="ac-rl-sum-value">{activeDiff.summary.breakingApis}</span>
                      <span className="ac-rl-sum-label">破坏性接口</span>
                    </div>
                    <div className="ac-rl-sum">
                      <span className="ac-rl-sum-icon ac-rl-sum-icon--warn">
                        <Database size={15} />
                      </span>
                      <span className="ac-rl-sum-value">{activeDiff.summary.dbMigrations}</span>
                      <span className="ac-rl-sum-label">DB 迁移</span>
                    </div>
                  </div>

                  <div className="ac-section-title">指标对比</div>
                  <MetricDumbbell items={activeDiff.metricDelta} />

                  <div className="ac-grid-2 ac-mt-4">
                    <div className="ac-rl-diff-col">
                      <div className="ac-rl-diff-col-head ac-ok-text">
                        <Plus0Icon />
                        新增重点条目（{activeDiff.addedItems.length}）
                      </div>
                      {activeDiff.addedItems.length === 0 ? (
                        <div className="ac-xs ac-muted">本次对比无新增条目</div>
                      ) : (
                        activeDiff.addedItems.map((it) => (
                          <div className="ac-diff-row ac-diff-row--add ac-rl-diff-item" key={it.id}>
                            <span className="ac-diff-sign">+</span>
                            <span className="ac-mono ac-xs ac-brand-text">{it.id}</span>
                            <span className="ac-rl-diff-item-title">{it.title}</span>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[it.tone]}`}>{relatedMeta(it.id).label}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="ac-rl-diff-col">
                      <div className="ac-rl-diff-col-head ac-danger-text">
                        <Trash2 size={13} />
                        移出版本基线的条目（{activeDiff.removedItems.length}）
                      </div>
                      {activeDiff.removedItems.length === 0 ? (
                        <div className="ac-xs ac-muted">本次对比无移出条目，范围未发生裁剪</div>
                      ) : (
                        activeDiff.removedItems.map((it) => (
                          <div className="ac-diff-row ac-diff-row--del ac-rl-diff-item" key={it.id}>
                            <span className="ac-diff-sign">-</span>
                            <div className="ac-flex-1">
                              <div className="ac-row ac-gap-2">
                                <span className="ac-mono ac-xs ac-danger-text">{it.id}</span>
                                <span className="ac-rl-diff-item-title">{it.title}</span>
                              </div>
                              <div className="ac-xs ac-muted ac-mt-1 ac-lh">移出原因：{it.reason}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="ac-section-title">AI 兼容性评估</div>
                  <div className="ac-rl-compat">
                    <div className="ac-rl-compat-gauge">
                      <svg width={132} height={132} viewBox="0 0 132 132" role="img" aria-label={`AI 判定的兼容性风险等级：${COMPAT_RISK[activeDiff.aiCompatibilityRisk].label}`}>
                        <circle cx={66} cy={66} r={54} fill="none" stroke="#eef0f4" strokeWidth={14} />
                        <circle
                          cx={66}
                          cy={66}
                          r={54}
                          fill="none"
                          stroke={COMPAT_RISK[activeDiff.aiCompatibilityRisk].hex}
                          strokeWidth={14}
                          strokeLinecap="round"
                          strokeDasharray={`${
                            (activeDiff.aiCompatibilityRisk === 'high' ? 0.82 : activeDiff.aiCompatibilityRisk === 'medium' ? 0.5 : 0.2) * 339
                          } 339`}
                          transform="rotate(-90 66 66)"
                        />
                        <text className="ac-rl-compat-risk" x={66} y={64} textAnchor="middle">
                          {COMPAT_RISK[activeDiff.aiCompatibilityRisk].label}
                        </text>
                        <text className="ac-rl-compat-risk-label" x={66} y={82} textAnchor="middle">
                          兼容性风险
                        </text>
                      </svg>
                      <div className="ac-rl-compat-meta">
                        <span className={`ac-tag ac-tag--${COMPAT_RISK[activeDiff.aiCompatibilityRisk].tone}`}>
                          {COMPAT_RISK[activeDiff.aiCompatibilityRisk].label}风险
                        </span>
                        <span className="ac-xs ac-muted">
                          判定依据：破坏性接口 {activeDiff.summary.breakingApis} 项 · DB 迁移 {activeDiff.summary.dbMigrations} 项 · 移出条目{' '}
                          {activeDiff.removedItems.length} 项
                        </span>
                      </div>
                    </div>
                    <div className="ac-ai-block ac-flex-1">
                      <div className="ac-ai-block-title">
                        <Sparkles size={14} />
                        {AGENT_NAME[activeDiff.generatedBy] ?? activeDiff.generatedBy} · 迁移与兼容建议
                      </div>
                      <div className="ac-mt-2 ac-lh">{activeDiff.aiMigrationAdvice}</div>
                    </div>
                  </div>

                  <div className="ac-section-title">升级检查清单</div>
                  <div className="ac-rl-checklist">
                    {activeDiffChecklist.map((ck) => {
                      const key = `${activeDiff.id}-${ck.key}`;
                      const done = checklist[key] === true;
                      return (
                        <label className={`ac-rl-checklist-item ${done ? 'ac-rl-checklist-item--done' : ''}`} key={key}>
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={(e) => setChecklist((p) => ({ ...p, [key]: e.target.checked }))}
                          />
                          <span className={`ac-tag ac-tag--sm ac-tag--${ck.tone}`}>{done ? '已完成' : '待办'}</span>
                          <span className="ac-rl-checklist-text">{ck.text}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="ac-hint ac-mt-3">
                    <Info size={14} />
                    <span>
                      已勾选 {activeDiffChecklist.filter((c) => checklist[`${activeDiff.id}-${c.key}`]).length} / {activeDiffChecklist.length} 项；
                      清单随对比组合切换而重新生成，勾选状态按「对比组 + 检查项」维度本地留存。
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= 5. 发布日历 ================= */}
      {tab === 'calendar' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-release-calendar">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <CalendarDays size={16} />
                发布日历
              </span>
              <span className="ac-card-subtitle">12 个事项覆盖 2026-01-30 ~ 2026-04-10，7 类事件；红色角标表示当日存在冲突</span>
              <div className="ac-card-extra">
                <div className="ac-tabs ac-tabs--pill">
                  {calMonths.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`ac-tab ${calMonth === m ? 'ac-tab--active' : ''}`}
                      onClick={() => setCalMonth(m)}
                    >
                      {m}
                      <span className="ac-tab-count">{RELEASE_CALENDAR.filter((it) => it.date.slice(0, 7) === m).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="ac-card-body">
              <MonthCalendar
                year={Number(calMonth.slice(0, 4))}
                month={Number(calMonth.slice(5, 7))}
                items={calItems}
                onPick={setDrawerCal}
              />
              <div className="ac-rl-legend">
                {(Object.keys(CAL_EVENT_META) as ReleaseCalendarItem['eventType'][]).map((k) => (
                  <span className="ac-rl-legend-item" key={k}>
                    <span className="ac-rl-legend-dot" style={{ background: TONE_HEX[CAL_EVENT_META[k].tone] }} />
                    {k}（{RELEASE_CALENDAR.filter((it) => it.eventType === k).length}）
                  </span>
                ))}
                <span className="ac-rl-legend-item">
                  <span className="ac-rl-legend-conflict" />
                  当日存在冲突
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th className="ac-td-num">日期</th>
                      <th>类型</th>
                      <th>标题</th>
                      <th>关联版本</th>
                      <th>负责人</th>
                      <th>环境</th>
                      <th className="ac-td-center">全天</th>
                      <th>执行主体</th>
                      <th>冲突说明</th>
                      <th>AI 消解建议</th>
                      <th className="ac-td-center">处理状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calItems.map((it) => {
                      const v = it.versionId ? VERSION_MAP[it.versionId] : null;
                      const meta = CAL_EVENT_META[it.eventType];
                      const st = calOverrides[it.id];
                      return (
                        <tr key={it.id} className="ac-rl-row" onClick={() => setDrawerCal(it)} title="点击查看日历项详情">
                          <td className="ac-mono ac-xs ac-brand-text">{it.id}</td>
                          <td className="ac-td-num">{it.date}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[meta.tone as Tone]}`}>{it.eventType}</span>
                          </td>
                          <td className="ac-rl-cell-title">{clip(it.title, 42)}</td>
                          <td>
                            {v ? (
                              <span className="ac-xs ac-text-2">
                                {v.name}
                                <span className="ac-xs ac-muted ac-mono"> {v.id}</span>
                              </span>
                            ) : (
                              <span className="ac-xs ac-muted">组织级事项</span>
                            )}
                          </td>
                          <td>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ${avatarCls(it.owner)}`}>{userInitial(it.owner)}</span>
                              <span className="ac-user-name">{userName(it.owner)}</span>
                            </span>
                          </td>
                          <td>
                            <span className="ac-row ac-gap-1 ac-wrap">
                              {it.envIds.map((eid) => (
                                <span key={eid} className="ac-tag ac-tag--sm ac-tag--outline" title={ENV_MAP[eid]?.url}>
                                  {ENV_MAP[eid]?.code ?? eid} {ENV_MAP[eid]?.name}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-td-center">{it.allDay ? <span className="ac-tag ac-tag--sm ac-tag--neutral">全天</span> : <span className="ac-xs ac-muted">时段</span>}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${EXECUTOR_META[it.executor].tone}`}>{EXECUTOR_META[it.executor].label}</span>
                          </td>
                          <td className="ac-rl-cell-scope">
                            {it.conflictNote ? <span className="ac-danger-text">{clip(it.conflictNote, 34)}</span> : <span className="ac-xs ac-muted">无</span>}
                          </td>
                          <td className="ac-rl-cell-scope">
                            {it.aiResolution ? <span className="ac-ai-text">{clip(it.aiResolution, 34)}</span> : <span className="ac-xs ac-muted">—</span>}
                          </td>
                          <td className="ac-td-center">
                            {it.conflictNote === '' ? (
                              <span className="ac-xs ac-muted">无冲突</span>
                            ) : st === 'adjusted' ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ok">已采纳调整</span>
                            ) : st === 'kept' ? (
                              <span className="ac-tag ac-tag--sm ac-tag--warn">保持原计划</span>
                            ) : (
                              <span className="ac-tag ac-tag--sm ac-tag--danger">待处理</span>
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

          <div className="ac-section-title">冲突治理</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <AlertTriangle size={16} />
                发布日历冲突与 AI 消解建议
              </span>
              <span className="ac-card-subtitle">两组冲突：03-20 迁移窗口与灰度批次 1 争用；04-10 全量发布落在大促封网期</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--danger">{conflictItems.length} 项冲突</span>
                <span className="ac-tag ac-tag--ok">
                  已处理 {Object.keys(calOverrides).length}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-rl-conflict-list">
                {conflictItems.map((it) => {
                  const st = calOverrides[it.id];
                  const v = it.versionId ? VERSION_MAP[it.versionId] : null;
                  return (
                    <div className={`ac-rl-conflict ${st === 'adjusted' ? 'ac-rl-conflict--adjusted' : st === 'kept' ? 'ac-rl-conflict--kept' : ''}`} key={it.id}>
                      <div className="ac-rl-conflict-head">
                        <span className="ac-mono ac-xs ac-brand-text">{it.id}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[CAL_EVENT_META[it.eventType].tone as Tone]}`}>{it.eventType}</span>
                        <span className="ac-mono ac-xs">{it.date}</span>
                        <span className="ac-rl-conflict-title">{it.title}</span>
                        {v && <span className="ac-tag ac-tag--sm ac-tag--outline">{v.name}</span>}
                        <span className="ac-user ac-ml-auto">
                          <span className={`ac-avatar ac-avatar--xs ${avatarCls(it.owner)}`}>{userInitial(it.owner)}</span>
                          <span className="ac-user-name">{userName(it.owner)}</span>
                        </span>
                      </div>
                      <div className="ac-hint ac-hint--danger ac-mt-2">
                        <AlertTriangle size={13} />
                        <span>{it.conflictNote}</span>
                      </div>
                      <div className="ac-ai-block ac-mt-2">
                        <div className="ac-ai-block-title">
                          <Sparkles size={13} />
                          ag-ops · 冲突消解建议
                        </div>
                        <div className="ac-mt-2 ac-lh">{it.aiResolution}</div>
                      </div>
                      <div className="ac-row ac-gap-2 ac-wrap ac-mt-3">
                        <button
                          type="button"
                          className={`ac-btn ac-btn--sm ${st === 'adjusted' ? 'ac-btn--ghost ac-btn--disabled' : 'ac-btn--primary'}`}
                          disabled={st === 'adjusted'}
                          onClick={() => setCalOverrides((p) => ({ ...p, [it.id]: 'adjusted' }))}
                        >
                          <CalendarDays size={13} />
                          {st === 'adjusted' ? '已采纳调整' : '采纳调整'}
                        </button>
                        <button
                          type="button"
                          className={`ac-btn ac-btn--sm ac-btn--ghost ${st === 'kept' ? 'ac-btn--disabled' : ''}`}
                          disabled={st === 'kept'}
                          onClick={() => setCalOverrides((p) => ({ ...p, [it.id]: 'kept' }))}
                        >
                          <Flag size={13} />
                          {st === 'kept' ? '已保持原计划' : '保持原计划'}
                        </button>
                        <button type="button" className="ac-btn ac-btn--sm ac-btn--text" onClick={() => setDrawerCal(it)}>
                          查看详情
                          <ChevronRight size={12} />
                        </button>
                        {st === 'adjusted' && (
                          <span className="ac-hint ac-hint--ok ac-rl-scope-done">
                            <CheckCircle2 size={13} />
                            <span>已按 AI 建议调整日历，同步通知负责人与关联发布单审批人，并在发布单上登记新的窗口。</span>
                          </span>
                        )}
                        {st === 'kept' && (
                          <span className="ac-hint ac-hint--warn ac-rl-scope-done">
                            <AlertTriangle size={13} />
                            <span>保持原计划：冲突未消解，需由负责人承担窗口争用风险，平台会在当日 09:00 再次提醒。</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 发布窗口推荐</div>
          <div className="ac-grid-3">
            {windowSuggestions.map((w, i) => (
              <div className="ac-card ac-rl-window" key={w.date}>
                <div className="ac-card-head">
                  <span className="ac-card-title">
                    <Rocket size={16} />
                    {i === 0 ? '首选窗口' : `备选 ${i}`}
                  </span>
                  <span className="ac-card-subtitle">评分 {w.score} / 100</span>
                  <div className="ac-card-extra">
                    <span className={`ac-tag ac-tag--sm ac-tag--${i === 0 ? 'ok' : 'outline'}`}>{w.date}</span>
                  </div>
                </div>
                <div className="ac-card-body">
                  <div className="ac-progress ac-mb-3">
                    <div className={`ac-progress-bar ${i === 0 ? 'ac-progress-bar--ok' : ''}`} style={{ width: `${w.score}%` }} />
                  </div>
                  <ul className="ac-rl-window-reasons">
                    {w.reasons.map((r) => (
                      <li key={r}>
                        <CheckCircle2 size={12} className="ac-ok-text" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          <div className="ac-hint ac-hint--ai">
            <Sparkles size={14} />
            <span>
              推荐口径：以 {TODAY} 之后为起点，剔除周末、{BLACKOUT.label}（{BLACKOUT.start} ~ {BLACKOUT.end}）与已有 env-prod 事项的日期，
              再按「值班完整度（周二至周四 +18）」「门禁补齐余量（晚于 03-25 +12）」「距封网安全间距（不足 5 天 −10）」加权打分。
              前置条件仍然是 G3 覆盖率补齐至 85% 与 G4 用例执行率 100%；门禁未过不谈窗口。
            </span>
          </div>
        </>
      )}

      {/* ================= 抽屉 ================= */}
      <Drawer
        open={drawerVersion !== null}
        title={drawerVersion ? `${drawerVersion.name} ${drawerVersion.codeName} · 版本详情` : ''}
        subtitle={drawerVersion ? `${drawerVersion.id}｜${VERSION_TYPE[drawerVersion.type].label}｜${drawerVersion.status}` : undefined}
        width={760}
        onClose={() => setDrawerVersion(null)}
      >
        {drawerVersion && (
          <VersionDrawerBody
            v={drawerVersion}
            baseline={baselinesByVersion[drawerVersion.id]}
            noteState={noteStateOf(drawerVersion)}
            onAcceptNote={() => acceptNote(drawerVersion)}
            onRejectNote={() => rejectNote(drawerVersion)}
            onRegenNote={() => regenNote(drawerVersion)}
          />
        )}
      </Drawer>

      <Drawer
        open={drawerBaseline !== null}
        title={drawerBaseline ? `${drawerBaseline.id} · 版本基线` : ''}
        subtitle={drawerBaseline ? `${VERSION_MAP[drawerBaseline.versionId]?.name ?? ''}｜${drawerBaseline.branch}｜${drawerBaseline.tag}` : undefined}
        width={700}
        onClose={() => setDrawerBaseline(null)}
      >
        {drawerBaseline && <BaselineDrawerBody b={drawerBaseline} v={VERSION_MAP[drawerBaseline.versionId]} />}
      </Drawer>

      <Drawer
        open={drawerChangeSet !== null}
        title={drawerChangeSet ? `${drawerChangeSet.id} · 变更集详情` : ''}
        subtitle={drawerChangeSet ? clip(drawerChangeSet.title, 44) : undefined}
        width={720}
        onClose={() => setDrawerChangeSet(null)}
      >
        {drawerChangeSet && <ChangeSetDrawerBody c={drawerChangeSet} />}
      </Drawer>

      <Drawer
        open={drawerCal !== null}
        title={drawerCal ? `${drawerCal.id} · ${drawerCal.eventType}` : ''}
        subtitle={drawerCal ? `${drawerCal.date}｜${clip(drawerCal.title, 40)}` : undefined}
        width={660}
        onClose={() => setDrawerCal(null)}
      >
        {drawerCal && (
          <>
            <dl className="ac-kv ac-mb-4">
              <dt>事项类型</dt>
              <dd>
                <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[CAL_EVENT_META[drawerCal.eventType].tone as Tone]}`}>
                  {drawerCal.eventType}
                </span>
              </dd>
              <dt>标题</dt>
              <dd className="ac-lh">{drawerCal.title}</dd>
              <dt>日期</dt>
              <dd className="ac-mono">
                {drawerCal.date}
                {drawerCal.allDay && <span className="ac-tag ac-tag--sm ac-tag--neutral">全天</span>}
              </dd>
              <dt>关联版本</dt>
              <dd>
                {drawerCal.versionId ? (
                  <span>
                    {VERSION_MAP[drawerCal.versionId]?.name} {VERSION_MAP[drawerCal.versionId]?.codeName}
                    <span className="ac-xs ac-muted ac-mono">（{drawerCal.versionId}）</span>
                  </span>
                ) : (
                  <span className="ac-muted">跨版本的组织级事项，不挂靠单一版本</span>
                )}
              </dd>
              <dt>负责人</dt>
              <dd>
                <span className="ac-user">
                  <span className={`ac-avatar ac-avatar--sm ${avatarCls(drawerCal.owner)}`}>{userInitial(drawerCal.owner)}</span>
                  <span className="ac-user-name">{userName(drawerCal.owner)}</span>
                  <span className="ac-user-meta">{roleShort(drawerCal.owner)}</span>
                </span>
              </dd>
              <dt>涉及环境</dt>
              <dd>
                <span className="ac-row ac-gap-1 ac-wrap">
                  {drawerCal.envIds.map((eid) => (
                    <span key={eid} className="ac-tag ac-tag--sm ac-tag--outline">
                      {ENV_MAP[eid]?.code} {ENV_MAP[eid]?.name}
                    </span>
                  ))}
                </span>
              </dd>
              <dt>执行主体</dt>
              <dd>
                <span className={`ac-tag ac-tag--sm ac-tag--${EXECUTOR_META[drawerCal.executor].tone}`}>
                  {EXECUTOR_META[drawerCal.executor].label}
                </span>
              </dd>
              <dt>反查版本</dt>
              <dd className="ac-xs ac-text-2">
                {drawerCal.versionId
                  ? `VERSION_ID_BY_RELEASE 口径：发布单 ${VERSION_MAP[drawerCal.versionId]?.releaseIds.join(' / ') || '（无）'} → ${drawerCal.versionId}`
                  : '组织级事项不参与 VERSION_ID_BY_RELEASE 反查'}
              </dd>
            </dl>

            {drawerCal.conflictNote !== '' ? (
              <>
                <div className="ac-section-title">冲突说明</div>
                <div className="ac-hint ac-hint--danger ac-mb-3">
                  <AlertTriangle size={14} />
                  <span>{drawerCal.conflictNote}</span>
                </div>
                <div className="ac-section-title">AI 消解建议</div>
                <div className="ac-ai-block">
                  <div className="ac-ai-block-title">
                    <Sparkles size={14} />
                    ag-ops · 依据封网期、环境可用性与门禁状态求解
                  </div>
                  <div className="ac-mt-2 ac-lh">{drawerCal.aiResolution}</div>
                </div>
              </>
            ) : (
              <div className="ac-hint ac-hint--ok">
                <ShieldCheck size={14} />
                <span>该事项与其他日历项无资源或时间争用，无需消解。</span>
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* ================= 冻结预检 Modal ================= */}
      <Modal
        open={freezeTarget !== null}
        title={freezeTarget ? `冻结基线 · ${freezeTarget.name} ${freezeTarget.codeName}` : ''}
        subtitle={freezeTarget ? `${freezeTarget.baselineId}｜${baselinesByVersion[freezeTarget.id]?.branch}` : undefined}
        width={640}
        onClose={() => setFreezeTarget(null)}
        footer={
          freezeTarget && (
            <>
              <span className="ac-xs ac-muted">
                {failedBlockingGates(freezeTarget).length > 0
                  ? `存在 ${failedBlockingGates(freezeTarget).length} 道未通过的阻断门禁，确认冻结已被禁用`
                  : '确认后将锁定分支、生成 commit 快照与制品校验和'}
              </span>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setFreezeTarget(null)}>
                取消
              </button>
              <button
                type="button"
                className={`ac-btn ac-btn--sm ac-btn--primary ${failedBlockingGates(freezeTarget).length > 0 ? 'ac-btn--disabled' : ''}`}
                disabled={failedBlockingGates(freezeTarget).length > 0}
                onClick={() => setFreezeTarget(null)}
              >
                <Snowflake size={13} />
                确认冻结
              </button>
            </>
          )
        }
      >
        {freezeTarget && (
          <>
            <div className="ac-hint ac-hint--warn ac-mb-3">
              <AlertTriangle size={14} />
              <span>
                冻结是不可逆动作：{baselinesByVersion[freezeTarget.id]?.branch} 分支将拒绝新的合入，
                后续任何范围调整都必须以新的变更集走门禁例外流程。请确认下列纳入范围与门禁结论。
              </span>
            </div>

            <div className="ac-section-title">将纳入基线的条目</div>
            <div className="ac-metric-grid ac-metric-grid--4 ac-mb-3">
              <div className="ac-metric">
                <div className="ac-metric-head">
                  <span className="ac-metric-label">需求</span>
                  <span className="ac-metric-icon">
                    <ListChecks size={14} />
                  </span>
                </div>
                <div className="ac-metric-value">
                  {baselinesByVersion[freezeTarget.id]?.includedCounts.requirements ?? 0}
                  <span className="ac-metric-unit">条</span>
                </div>
                <div className="ac-metric-foot">冻结时点快照口径</div>
              </div>
              <div className="ac-metric ac-metric--info">
                <div className="ac-metric-head">
                  <span className="ac-metric-label">任务</span>
                  <span className="ac-metric-icon">
                    <Boxes size={14} />
                  </span>
                </div>
                <div className="ac-metric-value">
                  {baselinesByVersion[freezeTarget.id]?.includedCounts.tasks ?? 0}
                  <span className="ac-metric-unit">个</span>
                </div>
                <div className="ac-metric-foot">含发布类工作项</div>
              </div>
              <div className="ac-metric ac-metric--danger">
                <div className="ac-metric-head">
                  <span className="ac-metric-label">缺陷</span>
                  <span className="ac-metric-icon">
                    <AlertTriangle size={14} />
                  </span>
                </div>
                <div className="ac-metric-value">
                  {baselinesByVersion[freezeTarget.id]?.includedCounts.bugs ?? 0}
                  <span className="ac-metric-unit">个</span>
                </div>
                <div className="ac-metric-foot">修复随基线交付</div>
              </div>
              <div className="ac-metric ac-metric--ai">
                <div className="ac-metric-head">
                  <span className="ac-metric-label">接口契约</span>
                  <span className="ac-metric-icon">
                    <GitBranch size={14} />
                  </span>
                </div>
                <div className="ac-metric-value">
                  {baselinesByVersion[freezeTarget.id]?.includedCounts.apiContracts ?? 0}
                  <span className="ac-metric-unit">份</span>
                </div>
                <div className="ac-metric-foot">须全部 frozen</div>
              </div>
            </div>

            <div className="ac-section-title">门禁结论</div>
            <ul className="ac-rl-freeze-gates ac-mb-3">
              {GATE_ORDER.map((g) => {
                const res = freezeTarget.qualityGate[g.key];
                return (
                  <li key={g.id} className={res.pass ? '' : 'ac-rl-freeze-gate-bad'}>
                    {res.pass ? <CheckCircle2 size={12} className="ac-ok-text" /> : <XCircle size={12} className="ac-danger-text" />}
                    <span className="ac-mono ac-xs">{g.id}</span>
                    <span className={`ac-xs ${res.pass ? 'ac-text-2' : 'ac-danger-text'}`}>
                      {gateName(g.id)}
                      {GATE_MAP[g.id]?.blocking ? '（阻断）' : '（非阻断）'}：{res.note}
                    </span>
                  </li>
                );
              })}
            </ul>

            {failedBlockingGates(freezeTarget).length > 0 && (
              <div className="ac-hint ac-hint--danger">
                <ShieldAlert size={14} />
                <span>
                  无法冻结：{failedBlockingGates(freezeTarget).map((g) => `${g.id} ${gateName(g.id)}`).join('、')} 为阻断门禁且未通过。
                  需先完成整改（补齐覆盖率、回归剩余用例、取得窗口批复）并复判通过后，本按钮才会解除禁用。
                  平台不提供口头豁免通道；确需例外发布，只能由门禁责任人在「部署流水线」页发起门禁例外审批并留痕。
                </span>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ 微型图标 */

/** lucide 无「Plus」语义所需的极小加号，用内联 SVG 保持与标签同高 */
function Plus0Icon() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
