/**
 * 效能报表 · InsightPage
 *
 * 数据源：data.ts → efficiencyData（3 个时间范围 × 3 个统计维度 = 9 组快照）
 * 能力：范围 / 维度切换、四组效能指标卡、SVG 手绘趋势图与环形图、交付榜 / 缺陷榜、指标与榜单下钻抽屉。
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bug,
  ChevronRight,
  Download,
  FolderKanban,
  Gauge,
  Info,
  Minus,
  RefreshCw,
  Rocket,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import { efficiencyData } from '../data';
import type {
  EfficiencyDimensionId,
  EfficiencyMetricDef,
  EfficiencyRangeId,
  EfficiencyRankItemDef,
  EfficiencySnapshot,
  Tone,
} from '../data';
import './insight.css';

/* ============================================================
   类型与常量
   ============================================================ */

/** 快照中的四组指标（交付 / 缺陷密度 / 发布节奏 / AI 增效） */
type GroupKey = 'delivery' | 'defectDensity' | 'release' | 'ai';

interface GroupDef {
  key: GroupKey;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
}

const GROUPS: GroupDef[] = [
  { key: 'delivery', title: '交付效率', subtitle: '吞吐 · 交付周期 · 在制品', icon: Gauge, tone: 'ok' },
  { key: 'defectDensity', title: '缺陷密度', subtitle: '密度 · P0 占比 · 修复时长', icon: Bug, tone: 'warn' },
  { key: 'release', title: '发布节奏', subtitle: '频次 · 成功率 · RTO', icon: Rocket, tone: 'info' },
  { key: 'ai', title: 'AI 增效', subtitle: '产出 · 采纳 · 首因 · 用例占比 · 时延 · 成本', icon: Sparkles, tone: 'ai' },
];

const DIM_ICON: Record<EfficiencyDimensionId, LucideIcon> = {
  project: FolderKanban,
  team: Users,
  person: BadgeCheck,
};

/** 各时间范围的 x 轴刻度（与 7 点趋势序列一一对应） */
const AXIS_LABELS: Record<EfficiencyRangeId, string[]> = {
  '7d': ['03-13', '03-14', '03-15', '03-16', '03-17', '03-18', '03-19'],
  '30d': ['02-18', '02-23', '02-28', '03-05', '03-10', '03-15', '03-19'],
  quarter: ['01-01', '01-15', '02-01', '02-15', '03-01', '03-15', '03-31'],
};

/** Tone → 文本语义色类（style.css 已定义） */
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

/** Tone → SVG 颜色变量 */
const TONE_VAR: Record<Tone, string> = {
  brand: 'var(--brand)',
  ai: 'var(--ai)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  info: 'var(--info)',
  neutral: 'var(--text-3)',
  slate: 'var(--text-3)',
  teal: 'var(--ok)',
  pink: 'var(--danger)',
  indigo: 'var(--brand)',
  amber: 'var(--warn)',
};

/** 榜单名次配色：前三名金 / 银 / 铜，第 4、5 名统一中性灰 */
const RANK_TONE = [
  'var(--warn)',
  'var(--text-3)',
  'var(--amber, #b45309)',
  'var(--text-3)',
  'var(--text-3)',
];

/** AI 增效六项指标的扇区 / 图例配色（按指标顺序取色，保证互不相同） */
const AI_COLORS = ['var(--ai)', 'var(--brand)', 'var(--ok)', 'var(--info)', 'var(--warn)', 'var(--danger)'];

/* ============================================================
   工具函数
   ============================================================ */

/** tag 仅支持 7 种语义色，其余色调做归并映射，避免样式失效 */
function tagTone(tone: Tone): string {
  const map: Record<Tone, string> = {
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
  return map[tone];
}

/** metric 左侧色条仅支持 5 种语义色，其余回落到默认品牌色 */
function metricTone(tone: Tone): string {
  const map: Partial<Record<Tone, string>> = {
    ai: 'ac-metric--ai',
    ok: 'ac-metric--ok',
    warn: 'ac-metric--warn',
    danger: 'ac-metric--danger',
    info: 'ac-metric--info',
    teal: 'ac-metric--ok',
    pink: 'ac-metric--danger',
    amber: 'ac-metric--warn',
  };
  return map[tone] ?? '';
}

/** 把「已格式化的指标值 + 环比」还原成一条平滑趋势序列（原型可视化用） */
function buildSeries(value: string, delta: number, points: number, phase: number): number[] {
  const end = Number.parseFloat(value);
  if (!Number.isFinite(end) || end === 0) {
    return Array.from({ length: points }, () => 0);
  }
  const factor = 1 + delta / 100;
  const start = factor > 0.05 ? end / factor : end * 1.12;
  return Array.from({ length: points }, (_, i) => {
    const t = points === 1 ? 1 : i / (points - 1);
    const wobble = end * 0.014 * Math.sin(i * 1.9 + phase) + end * 0.009 * Math.cos(i * 1.1 + phase);
    const v = start + (end - start) * t + wobble;
    return i === points - 1 ? end : Math.max(0, Number(v.toFixed(3)));
  });
}

function tickLabel(v: number): string {
  if (v === 0) return '0';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/** 指标值千分位格式化：仅处理 4 位以上整数的纯数值（如 1840 → 1,840、15436.8 → 15,436.8），其余原样返回 */
function formatMetricValue(value: string): string {
  if (!/^\d{4,}(\.\d+)?$/.test(value)) return value;
  const [int, dec] = value.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${grouped}.${dec}` : grouped;
}

/* ============================================================
   图表：迷你趋势线 / 趋势折线面积图 / 环形图（全部 SVG 手绘）
   ============================================================ */

interface SparklineProps {
  series: number[];
  color: string;
  width?: number;
  height?: number;
}

/** 指标卡内的迷你趋势线 */
function Sparkline({ series, color, width = 96, height = 22 }: SparklineProps) {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const step = width / Math.max(series.length - 1, 1);
  const points = series
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 6) - 3).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="ac-metric-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ stroke: color }}
      />
    </svg>
  );
}

interface SeriesDef {
  label: string;
  color: string;
  data: number[];
  dashed?: boolean;
}

interface TrendChartProps {
  series: SeriesDef[];
  labels: string[];
  unit: string;
}

/** 趋势折线 + 面积图 */
function TrendChart({ series, labels, unit }: TrendChartProps) {
  const W = 660;
  const H = 216;
  const padL = 46;
  const padR = 14;
  const padT = 14;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = labels.length;
  const max = Math.max(...series.flatMap((s) => s.data), 1) * 1.12;
  const x = (i: number) => padL + (plotW * i) / Math.max(n - 1, 1);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg className="ac-in-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="指标趋势图">
      {ticks.map((t) => {
        const gy = padT + plotH - t * plotH;
        return (
          <g key={t}>
            <line
              x1={padL}
              y1={gy}
              x2={W - padR}
              y2={gy}
              strokeWidth={1}
              style={{ stroke: t === 0 ? 'var(--border)' : 'var(--border-soft)' }}
            />
            <text x={padL - 8} y={gy + 3.5} textAnchor="end" className="ac-in-chart-tick">
              {tickLabel(max * t)}
            </text>
          </g>
        );
      })}

      {series.map((s) => {
        const line = s.data
          .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
          .join(' ');
        const area = `${line} L${x(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${x(0).toFixed(1)},${(
          padT + plotH
        ).toFixed(1)} Z`;
        return (
          <g key={s.label}>
            {!s.dashed ? <path d={area} opacity={0.1} style={{ fill: s.color }} /> : null}
            <path
              d={line}
              fill="none"
              strokeWidth={s.dashed ? 1.6 : 2.2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ stroke: s.color }}
            />
            {s.data.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 3.2 : 1.9} style={{ fill: s.color }} />
            ))}
          </g>
        );
      })}

      {labels.map((lb, i) => (
        <text key={lb} x={x(i)} y={H - 8} textAnchor="middle" className="ac-in-chart-tick">
          {lb}
        </text>
      ))}
      <text x={padL} y={H - 8} textAnchor="start" className="ac-in-chart-unit">
        {unit}
      </text>
    </svg>
  );
}

interface DonutItem {
  label: string;
  value: number;
  display: string;
  color: string;
}

/** 环形构成图 */
function DonutChart({ items, size = 172, thickness = 22 }: { items: DonutItem[]; size?: number; thickness?: number }) {
  const total = items.reduce((acc, it) => acc + it.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="构成占比">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={thickness}
        style={{ stroke: 'var(--bg-hover)' }}
      />
      {items.map((it) => {
        const len = (it.value / total) * circumference;
        const node = (
          <circle
            key={it.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
            strokeDasharray={`${len.toFixed(2)} ${(circumference - len).toFixed(2)}`}
            strokeDashoffset={(-offset).toFixed(2)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ stroke: it.color }}
          />
        );
        offset += len;
        return node;
      })}
    </svg>
  );
}

/* ============================================================
   子组件
   ============================================================ */

/** 环比徽标：颜色取语义色（tone 已表达「向好 / 恶化」），箭头取方向 */
function DeltaBadge({ metric }: { metric: EfficiencyMetricDef }) {
  if (metric.delta === 0) {
    return (
      <span className="ac-metric-delta ac-muted">
        <Minus size={12} />
        环比持平
      </span>
    );
  }
  const up = metric.delta > 0;
  return (
    <span className={`ac-metric-delta ${TEXT_TONE[metric.tone]}`}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {`${up ? '+' : ''}${metric.delta}%`}
    </span>
  );
}

function MetricTile({ metric, onOpen }: { metric: EfficiencyMetricDef; onOpen: () => void }) {
  const series = useMemo(() => buildSeries(metric.value, metric.delta, 7, 1), [metric]);
  return (
    <div
      className={`ac-metric ${metricTone(metric.tone)} ac-cursor`}
      onClick={onOpen}
      title={`查看「${metric.label}」指标明细`}
    >
      <div className="ac-metric-head">
        <span className="ac-metric-label">{metric.label}</span>
        <span className="ac-metric-icon">
          <ChevronRight size={14} />
        </span>
      </div>
      <div className="ac-metric-value">
        {formatMetricValue(metric.value)}
        <span className="ac-metric-unit">{metric.unit}</span>
      </div>
      <div className="ac-row ac-gap-2">
        <DeltaBadge metric={metric} />
        <span className="ac-metric-foot ac-ml-auto">较上期</span>
      </div>
      <Sparkline series={series} color={TONE_VAR[metric.tone]} />
    </div>
  );
}

interface RankCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  items: EfficiencyRankItemDef[];
  valueLabel: string;
  onOpen: (item: EfficiencyRankItemDef) => void;
}

function RankCard({ title, subtitle, icon: Icon, tone, items, valueLabel, onOpen }: RankCardProps) {
  return (
    <div className="ac-card">
      <div className="ac-card-head">
        <span className="ac-card-title">
          <Icon size={16} />
          {title}
        </span>
        <span className="ac-card-subtitle">{subtitle}</span>
        <div className="ac-card-extra">
          <span className={`ac-tag ac-tag--${tagTone(tone)}`}>TOP {items.length}</span>
        </div>
      </div>
      <div className="ac-card-body ac-card-body--flush">
        <div className="ac-table-wrap">
          <table className="ac-table ac-table--sm">
            <thead>
              <tr>
                <th style={{ width: 52 }}>名次</th>
                <th>主体</th>
                <th className="ac-td-right">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.rank}-${item.name}`} className="ac-cursor" onClick={() => onOpen(item)}>
                  <td>
                    <span
                      className="ac-in-rank"
                      style={{ background: RANK_TONE[item.rank - 1] ?? 'var(--text-3)' }}
                    >
                      {item.rank}
                    </span>
                  </td>
                  <td>
                    <div className="ac-col ac-gap-0">
                      <span className="ac-semi ac-text-1">{item.name}</span>
                      <span className="ac-xs ac-muted">{item.sub}</span>
                    </div>
                  </td>
                  <td className="ac-td-right">
                    <span className={`ac-bold ${TEXT_TONE[item.tone]}`}>{item.value}</span>
                    <ChevronRight size={13} className="ac-muted ac-in-rank-arrow" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   下钻抽屉状态
   ============================================================ */

type Drill =
  | { kind: 'metric'; group: GroupKey; metric: EfficiencyMetricDef }
  | { kind: 'rank'; list: 'delivery' | 'defect'; item: EfficiencyRankItemDef };

/* ============================================================
   页面
   ============================================================ */

export default function InsightPage() {
  const [rangeId, setRangeId] = useState<EfficiencyRangeId>('30d');
  const [dimId, setDimId] = useState<EfficiencyDimensionId>('project');
  const [trendGroup, setTrendGroup] = useState<GroupKey>('delivery');
  const [trendIdx, setTrendIdx] = useState(0);
  const [drill, setDrill] = useState<Drill | null>(null);

  const range = efficiencyData.ranges.find((r) => r.id === rangeId) ?? efficiencyData.ranges[0];
  const dimension = efficiencyData.dimensions.find((d) => d.id === dimId) ?? efficiencyData.dimensions[0];
  const snapshot: EfficiencySnapshot = efficiencyData.data[rangeId][dimId];
  const axisLabels = AXIS_LABELS[rangeId];

  /* 趋势图：当前分组下第 idx 个指标的本期 / 上期两条曲线 */
  const trendGroupDef = GROUPS.find((g) => g.key === trendGroup) ?? GROUPS[0];
  const trendMetrics = snapshot[trendGroup];
  const safeIdx = Math.min(trendIdx, trendMetrics.length - 1);
  const trendMetric = trendMetrics[safeIdx];
  const trendSeries: SeriesDef[] = useMemo(() => {
    const cur = buildSeries(trendMetric.value, trendMetric.delta, axisLabels.length, 1);
    const prev = buildSeries(trendMetric.value, trendMetric.delta, axisLabels.length, 2).map((v) => v * 0.958);
    return [
      { label: '本期', color: TONE_VAR[trendMetric.tone], data: cur },
      { label: '上期', color: 'var(--text-3)', data: prev, dashed: true },
    ];
  }, [trendMetric, axisLabels.length]);

  /* AI 增效六项指标：先按数组顺序取色，再按量纲拆分 ——
     百分比型（产出占比 / 采纳率 / 首因命中率 / 用例占比）参与环形构成，
     响应时延（ms）与 Token 成本（元）量纲不同，不参与扇区计算，单列展示 */
  const aiColored = snapshot.ai.map((m, i) => ({ metric: m, color: AI_COLORS[i % AI_COLORS.length] }));
  const donutItems: DonutItem[] = aiColored
    .filter((it) => it.metric.unit === '%')
    .map((it) => ({
      label: it.metric.label,
      value: Number.parseFloat(it.metric.value) || 0,
      display: `${formatMetricValue(it.metric.value)}${it.metric.unit}`,
      color: it.color,
    }));
  const aiExtraItems = aiColored
    .filter((it) => it.metric.unit !== '%')
    .map((it) => ({
      label: it.metric.label,
      display: `${formatMetricValue(it.metric.value)} ${it.metric.unit}`,
      color: it.color,
    }));
  /* 环形中心：AI 代码产出占比（百分比型首项，与扇区口径一致） */
  const aiHead = snapshot.ai.find((m) => m.unit === '%') ?? snapshot.ai[0];

  return (
    <div className="ac-in-page" data-annotation-id="ai-sdlc-insight-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">效能报表</div>
          <div className="ac-page-desc">
            交付效率、缺陷密度、发布节奏与 AI 增效四类指标，按时间范围与统计维度交叉下钻；趋势由快照指标与环比推算，
            榜单可直接追溯到责任人与关联需求。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--outline">
            <RefreshCw size={12} />
            数据更新于 2026-03-19 18:10
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm">
            <Download size={14} />
            导出报表
          </button>
        </div>
      </div>

      {/* ---------- 过滤条：时间范围 × 统计维度 ---------- */}
      <div className="ac-filter-bar" data-annotation-id="ai-sdlc-insight-toolbar">
        <span className="ac-xs ac-muted ac-nowrap">时间范围</span>
        <div className="ac-tabs ac-tabs--pill">
          {efficiencyData.ranges.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`ac-tab ${r.id === rangeId ? 'ac-tab--active' : ''}`}
              onClick={() => setRangeId(r.id)}
            >
              {r.name}
            </button>
          ))}
        </div>
        <span className="ac-divider-v" />
        <span className="ac-xs ac-muted ac-nowrap">统计维度</span>
        <div className="ac-tabs ac-tabs--pill">
          {efficiencyData.dimensions.map((d) => {
            const Icon = DIM_ICON[d.id];
            return (
              <button
                key={d.id}
                type="button"
                className={`ac-tab ${d.id === dimId ? 'ac-tab--active' : ''}`}
                onClick={() => setDimId(d.id)}
              >
                <Icon size={13} />
                {d.name}
              </button>
            );
          })}
        </div>
        <span className="ac-ml-auto ac-xs ac-muted ac-mono">{range.note}</span>
      </div>

      {/* ---------- 四组效能指标 ---------- */}
      <div className="ac-grid-2 ac-in-group-grid" data-annotation-id="ai-sdlc-insight-metrics">
        {GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <div className="ac-card" key={group.key}>
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Icon size={16} />
                  {group.title}
                </span>
                <span className="ac-card-subtitle">{group.subtitle}</span>
                <div className="ac-card-extra">
                  <span className={`ac-tag ac-tag--${tagTone(group.tone)}`}>{range.name}</span>
                </div>
              </div>
              <div className="ac-card-body ac-card-body--tight">
                <div className="ac-metric-grid ac-in-metric-grid">
                  {snapshot[group.key].map((metric) => (
                    <MetricTile
                      key={metric.label}
                      metric={metric}
                      onOpen={() => setDrill({ kind: 'metric', group: group.key, metric })}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- 趋势图 + 环形图 ---------- */}
      <div className="ac-grid-3-2 ac-in-chart-grid">
        <div className="ac-card" data-annotation-id="ai-sdlc-insight-trend">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <TrendingUp size={16} />
              指标趋势
            </span>
            <span className="ac-card-subtitle">
              {dimension.name} · {range.note}
            </span>
            <div className="ac-card-extra">
              <div className="ac-tabs ac-tabs--pill">
                {GROUPS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    className={`ac-tab ${g.key === trendGroup ? 'ac-tab--active' : ''}`}
                    onClick={() => {
                      setTrendGroup(g.key);
                      setTrendIdx(0);
                    }}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ac-card-body">
            <div className="ac-row ac-gap-2 ac-in-metric-pills">
              {trendMetrics.map((m, i) => (
                <button
                  key={m.label}
                  type="button"
                  className={`ac-in-pill ${i === safeIdx ? 'ac-in-pill--active' : ''}`}
                  onClick={() => setTrendIdx(i)}
                >
                  {m.label}
                  <span className="ac-mono ac-ml-auto">
                    {formatMetricValue(m.value)}
                    {m.unit}
                  </span>
                </button>
              ))}
            </div>

            <TrendChart series={trendSeries} labels={axisLabels} unit={trendMetric.unit} />

            <div className="ac-row ac-gap-4 ac-mt-2">
              {trendSeries.map((s) => (
                <span className="ac-legend-item ac-flex-0" key={s.label}>
                  <span className="ac-legend-swatch" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
              <span className="ac-xs ac-muted ac-ml-auto">
                {trendGroupDef.title} · 当前值 {formatMetricValue(trendMetric.value)}
                {trendMetric.unit} · 环比 {trendMetric.delta > 0 ? '+' : ''}
                {trendMetric.delta}%
              </span>
            </div>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <Sparkles size={16} />
              AI 增效构成
            </span>
            <span className="ac-card-subtitle">百分比型指标相对占比</span>
            <div className="ac-card-extra">
              <span className="ac-tag ac-tag--ai">AI 增效 {snapshot.ai.length} 项</span>
            </div>
          </div>
          <div className="ac-card-body">
            <div className="ac-in-donut-row">
              <div className="ac-donut">
                <DonutChart items={donutItems} />
                <div className="ac-donut-center">
                  <span className="ac-donut-value">
                    {formatMetricValue(aiHead.value)}
                    {aiHead.unit}
                  </span>
                  <span className="ac-donut-label">{aiHead.label}</span>
                </div>
              </div>
              <div className="ac-legend ac-flex-1">
                {donutItems.map((it) => (
                  <span className="ac-legend-item" key={it.label}>
                    <span className="ac-legend-swatch" style={{ background: it.color }} />
                    <span className="ac-ellipsis">{it.label}</span>
                    <span className="ac-legend-value">{it.display}</span>
                  </span>
                ))}
              </div>
            </div>
            {/* 非百分比型指标（ms / 元）量纲不同，不参与扇区计算，以并列小卡展示 */}
            <div className="ac-in-ai-extra">
              {aiExtraItems.map((it) => (
                <div className="ac-in-ai-extra-item" key={it.label}>
                  <span className="ac-legend-swatch" style={{ background: it.color }} />
                  <span className="ac-xs ac-muted ac-ellipsis">{it.label}</span>
                  <span className="ac-in-ai-extra-value">{it.display}</span>
                </div>
              ))}
            </div>
            <div className="ac-hint ac-hint--ai ac-mt-3">
              <Info size={14} />
              <span>
                {aiHead.label} {formatMetricValue(aiHead.value)}
                {aiHead.unit}，本区间 {dimension.name} 下的代码产出以 AI 编码 Agent 为主力；环形图仅纳入百分比型指标，
                响应时延与 Token 成本量纲不同已单列展示，建议结合采纳率、首因命中率与 Token 成本共同评估提效质量与投入产出。
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 交付榜 / 缺陷榜 ---------- */}
      <div className="ac-grid-2" data-annotation-id="ai-sdlc-insight-rank">
        <RankCard
          title="交付榜"
          subtitle={`${dimension.name} · ${range.name}`}
          icon={Trophy}
          tone="info"
          items={snapshot.topDelivery}
          valueLabel="交付点数"
          onOpen={(item) => setDrill({ kind: 'rank', list: 'delivery', item })}
        />
        <RankCard
          title="缺陷榜"
          subtitle={`${dimension.name} · ${range.name}`}
          icon={Bug}
          tone="danger"
          items={snapshot.topDefect}
          valueLabel="缺陷数"
          onOpen={(item) => setDrill({ kind: 'rank', list: 'defect', item })}
        />
      </div>

      <div className="ac-hint ac-mt-3">
        <Info size={14} />
        <span>
          口径说明：指标值与环比取自 <span className="ac-mono">efficiencyData</span> 对应「时间范围 × 统计维度」快照；
          趋势曲线由指标终值与环比变化推算，用于表达走向；榜单仅统计已交付 / 已关闭条目，点击任意指标或榜单行可下钻明细。
        </span>
      </div>

      {/* ---------- 下钻抽屉 ---------- */}
      <Drawer
        open={drill !== null}
        title={
          drill?.kind === 'metric'
            ? `${drill.metric.label} · 指标明细`
            : drill?.kind === 'rank'
              ? `${drill.item.name} · ${drill.list === 'delivery' ? '交付榜' : '缺陷榜'}明细`
              : ''
        }
        subtitle={`${range.name}（${range.note}） · ${dimension.name}`}
        width={620}
        onClose={() => setDrill(null)}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setDrill(null)}>
              关闭
            </button>
            <button type="button" className="ac-btn ac-btn--primary ac-btn--sm ac-ml-auto">
              <Download size={14} />
              导出该明细
            </button>
          </div>
        }
      >
        {drill?.kind === 'metric' ? (
          <div className="ac-col ac-gap-4">
            <div className="ac-metric-grid ac-metric-grid--3 ac-mb-0">
              <div className="ac-metric">
                <div className="ac-metric-head">
                  <span className="ac-metric-label">当前值</span>
                </div>
                <div className="ac-metric-value">
                  {formatMetricValue(drill.metric.value)}
                  <span className="ac-metric-unit">{drill.metric.unit}</span>
                </div>
              </div>
              <div className="ac-metric">
                <div className="ac-metric-head">
                  <span className="ac-metric-label">环比上期</span>
                </div>
                <div className="ac-metric-value">
                  <DeltaBadge metric={drill.metric} />
                </div>
              </div>
              <div className={`ac-metric ${metricTone(drill.metric.tone)}`}>
                <div className="ac-metric-head">
                  <span className="ac-metric-label">指标分组</span>
                </div>
                <div className="ac-metric-value ac-md">
                  {GROUPS.find((g) => g.key === drill.group)?.title}
                </div>
              </div>
            </div>

            <div className="ac-col ac-gap-1">
              <div className="ac-section-title">区间趋势</div>
              <TrendChart
                series={[{ label: drill.metric.label, color: TONE_VAR[drill.metric.tone], data: buildSeries(drill.metric.value, drill.metric.delta, axisLabels.length, 1) }]}
                labels={axisLabels}
                unit={drill.metric.unit}
              />
            </div>

            <div className="ac-col ac-gap-1">
              <div className="ac-section-title">指标口径</div>
              <dl className="ac-kv">
                <dt>指标名称</dt>
                <dd>{drill.metric.label}</dd>
                <dt>统计口径</dt>
                <dd>
                  按「{dimension.name}」聚合，统计区间 {range.note}，与 PingCode 工作项状态回写保持一致
                </dd>
                <dt>环比基准</dt>
                <dd>上一同等长度区间</dd>
                <dt>健康度</dt>
                <dd className={TEXT_TONE[drill.metric.tone]}>
                  {drill.metric.tone === 'ok'
                    ? '向好'
                    : drill.metric.tone === 'danger'
                      ? '需关注'
                      : drill.metric.tone === 'warn'
                        ? '预警'
                        : drill.metric.tone === 'ai'
                          ? 'AI 增效'
                          : '正常'}
                </dd>
              </dl>
            </div>

            <div className={`ac-hint ac-hint--${drill.metric.tone === 'danger' ? 'danger' : drill.metric.tone === 'warn' ? 'warn' : 'ok'}`}>
              <Info size={14} />
              <span>
                {drill.metric.tone === 'danger'
                  ? '该指标明显偏离目标，建议在下一次迭代复盘会中定位阻塞点并拆分风险任务。'
                  : drill.metric.tone === 'warn'
                    ? '该指标存在波动，建议持续观察并在门禁中增加校验项。'
                    : '该指标处于健康区间，可继续保持当前的协作节奏与门禁策略。'}
              </span>
            </div>
          </div>
        ) : drill?.kind === 'rank' ? (
          <div className="ac-col ac-gap-4">
            <dl className="ac-kv">
              <dt>名次</dt>
              <dd>
                <span className="ac-in-rank" style={{ background: RANK_TONE[drill.item.rank - 1] ?? 'var(--text-3)' }}>
                  {drill.item.rank}
                </span>
              </dd>
              <dt>主体</dt>
              <dd>{drill.item.name}</dd>
              <dt>归属</dt>
              <dd>{drill.item.sub}</dd>
              <dt>{drill.list === 'delivery' ? '交付点数' : '缺陷数'}</dt>
              <dd className={TEXT_TONE[drill.item.tone]}>{drill.item.value}</dd>
              <dt>榜单</dt>
              <dd>{drill.list === 'delivery' ? '交付榜' : '缺陷榜'}</dd>
              <dt>统计维度</dt>
              <dd>{dimension.name}</dd>
              <dt>时间范围</dt>
              <dd>{range.name}（{range.note}）</dd>
            </dl>

            <div className="ac-col ac-gap-1">
              <div className="ac-section-title">关联条目</div>
              <div className="ac-col ac-gap-2">
                {(drill.item.sub.includes('·') ? drill.item.sub.split('·').slice(1).join('·') : drill.item.sub)
                  .split('/')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((ref) => (
                    <span className="ac-tag ac-tag--outline" key={ref}>
                      {ref}
                    </span>
                  ))}
              </div>
            </div>

            <div className={`ac-hint ac-hint--${drill.list === 'delivery' ? 'ok' : 'warn'}`}>
              <Info size={14} />
              <span>
                {drill.list === 'delivery'
                  ? '交付榜按已完成工作项的故事点汇总，包含 AI 账号产出；点击可继续跳转至任务看板查看明细。'
                  : '缺陷榜按关联需求归集的缺陷数量排序，P0 / 资损级缺陷优先处理，建议结合修复时长一并评估。'}
              </span>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
