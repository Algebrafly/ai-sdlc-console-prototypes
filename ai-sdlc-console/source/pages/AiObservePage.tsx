/**
 * AI 能力观测（pageId: ai-observe）
 *
 * 标签页：
 *  1. 模型网关 —— 模型清单 / 场景化路由策略 / 调用统计（手绘 SVG 横向条形图 + 趋势柱）
 *  2. Agent 编排 —— 7 个智能体卡片 + 执行轨迹调用链 Drawer
 *  3. 知识库 —— RAG 条目表格 + 类型筛选 + 行展开摘要
 */
import React, { Fragment, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Database,
  ExternalLink,
  Gauge,
  Layers,
  ListChecks,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Wrench,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import {
  agentTraces,
  agents,
  modelStats,
  models,
  ragEntries,
  routingRules,
} from '../data';
import type { AgentTraceDef, RagEntryDef, Tone } from '../data';
import './ai-observe.css';

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

type TabId = 'gateway' | 'agents' | 'kb';

const TABS: { id: TabId; name: string; icon: typeof Cpu }[] = [
  { id: 'gateway', name: '模型网关', icon: Route },
  { id: 'agents', name: 'Agent 编排', icon: BrainCircuit },
  { id: 'kb', name: '知识库', icon: Database },
];

/** 执行轨迹目标对象类型 → 编号前缀说明与跳转页面 */
const TARGET_META: Record<AgentTraceDef['targetType'], { label: string; page: string }> = {
  task: { label: '任务', page: 'board' },
  bug: { label: '缺陷', page: 'bug' },
  requirement: { label: '需求', page: 'requirement' },
  release: { label: '发布单', page: 'pipeline' },
  pipeline: { label: '流水线', page: 'pipeline' },
};

/** RAG 条目状态 → 展示文案与标签语义 */
const RAG_STATUS: Record<RagEntryDef['status'], { label: string; tone: string }> = {
  ready: { label: '可用', tone: 'ok' },
  indexing: { label: '索引中', tone: 'warn' },
  stale: { label: '待更新', tone: 'danger' },
};

/** 登录用户 / 网关统计口径的展示辅助 —— 模型网关参数按场景下发平台默认值 */
const SCENE_RUNTIME: { match: string; temperature: string; timeout: string; retries: number }[] = [
  { match: '需求澄清', temperature: '0.7', timeout: '60s', retries: 2 },
  { match: '架构设计', temperature: '0.3', timeout: '120s', retries: 2 },
  { match: '编码实现', temperature: '0.2', timeout: '90s', retries: 3 },
  { match: '测试验证', temperature: '0.4', timeout: '60s', retries: 3 },
  { match: '部署发布', temperature: '0.1', timeout: '120s', retries: 2 },
];

/** 场景 → 网关下发参数（数据层未提供结构化采样参数，按场景统一下发平台默认值） */
function sceneRuntime(scene: string) {
  const hit = SCENE_RUNTIME.find((r) => scene.includes(r.match));
  return hit ?? { match: '', temperature: '0.3', timeout: '60s', retries: 2 };
}

/** 跳转到其他原型页面 */
function jump(page: string) {
  window.location.hash = `#page=${page}`;
}

/** 数字千分位 */
function num(v: number) {
  return v.toLocaleString('zh-CN');
}

/* ------------------------------------------------------------------ 子组件 */

/** 调用量横向条形图（手绘 SVG，禁止引入图表库） */
function HBarChart({ items }: { items: { label: string; value: number; tone: Tone }[] }) {
  const W = 560;
  const labelW = 148;
  const valueW = 58;
  const chartW = W - labelW - valueW;
  const rowH = 30;
  const height = items.length * rowH + 6;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <svg
      className="ac-ao-hbar"
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="各模型近 7 日调用量对比"
    >
      {items.map((it, idx) => {
        const y = idx * rowH + 3;
        const w = Math.max(3, (it.value / max) * chartW);
        const color = TONE_HEX[it.tone] ?? TONE_HEX.brand;
        return (
          <g key={it.label}>
            <text className="ac-ao-hbar-name" x={0} y={y + 18}>
              {it.label}
            </text>
            <rect className="ac-ao-hbar-grid" x={labelW} y={y + 7} width={chartW} height={16} rx={4} />
            <rect x={labelW} y={y + 7} width={w} height={16} rx={4} fill={color} />
            <text className="ac-ao-hbar-value" x={W} y={y + 19} textAnchor="end">
              {num(it.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 调用链一跳 */
interface Hop {
  kind: string;
  title: string;
  meta?: string;
  at?: string;
  tone: Tone;
  latencyMs: number;
  token: number | null;
}

/** 由执行轨迹推导完整调用链：触发事件 → Agent → 模型 → 工具调用 → 产出 → 状态迁移 */
function buildHops(trace: AgentTraceDef): Hop[] {
  const total = trace.latencyMs;
  const steps = trace.steps;
  const agentLat = Math.round(total * 0.06);
  const modelLat = Math.round(total * 0.5);
  const restTotal = Math.max(total - agentLat - modelLat, steps.length);
  const perStep = Math.round(restTotal / Math.max(steps.length, 1));

  const hops: Hop[] = [
    {
      kind: '触发事件',
      title: `${TARGET_META[trace.targetType].label} ${trace.targetId}`,
      meta: trace.targetTitle,
      at: trace.startedAt,
      tone: trace.tone,
      latencyMs: 0,
      token: null,
    },
    {
      kind: 'Agent 调度',
      title: trace.agentName,
      meta: `接收触发事件并装载上下文契约`,
      tone: 'ai',
      latencyMs: agentLat,
      token: null,
    },
    {
      kind: '模型推理',
      title: trace.modelName,
      meta: `上下文输入 ${num(trace.tokenIn)} tokens · 生成输出 ${num(trace.tokenOut)} tokens`,
      tone: 'brand',
      latencyMs: modelLat,
      token: trace.tokenIn + trace.tokenOut,
    },
  ];

  steps.forEach((s) => {
    hops.push({
      kind: '工具调用',
      title: s.name,
      at: s.at,
      tone: s.tone,
      latencyMs: perStep,
      token: null,
    });
  });

  hops.push({
    kind: '状态迁移',
    title: trace.result,
    tone: trace.tone,
    latencyMs: 0,
    token: null,
  });

  return hops;
}

/* ------------------------------------------------------------------ 页面 */

export default function AiObservePage() {
  const [tab, setTab] = useState<TabId>('gateway');
  const [activeTrace, setActiveTrace] = useState<AgentTraceDef | null>(null);
  const [ragCategory, setRagCategory] = useState<string>('all');
  const [expandedRag, setExpandedRag] = useState<string | null>(null);

  /** 调用统计的派生指标（均由 modelStats 提供的数据计算，不新增字段） */
  const stats = useMemo(() => {
    const byModel = modelStats.byModel;
    const totalCalls = modelStats.totalCalls;
    const callsSum = byModel.reduce((s, m) => s + m.calls, 0) || 1;
    const successRate = byModel.reduce((s, m) => s + m.calls * m.successRate, 0) / callsSum;
    const p95 = Math.round(modelStats.avgLatencyMs * 1.6);
    const fallbackCalls = Math.round(
      byModel.reduce((s, m) => s + (m.calls * (100 - m.successRate)) / 100, 0),
    );
    const topCost = byModel.reduce((a, b) => (b.cost > a.cost ? b : a), byModel[0]);
    return {
      totalCalls,
      successRate,
      p95,
      fallbackCalls,
      costShare: (topCost.cost / modelStats.totalCost) * 100,
      topCostModel: topCost.modelName,
    };
  }, []);

  const trendMax = Math.max(...modelStats.trend.map((t) => t.calls), 1);

  const ragCategories = useMemo(
    () => Array.from(new Set(ragEntries.map((r) => r.category))),
    [],
  );

  const filteredRag = useMemo(
    () => (ragCategory === 'all' ? ragEntries : ragEntries.filter((r) => r.category === ragCategory)),
    [ragCategory],
  );

  const totalRagChunks = ragEntries.reduce((s, r) => s + r.chunks, 0);
  const totalRagHits = ragEntries.reduce((s, r) => s + r.hitCount, 0);

  return (
    <div className="ac-ao" data-annotation-id="ai-sdlc-ai-observe-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">AI 能力观测</div>
          <div className="ac-page-desc">
            统一观测模型网关的模型供给与路由策略、SDLC 各环节智能体的运行轨迹与调用链，以及 RAG 知识库的切片与引用情况；
            所有指标口径与「订单中心重构」（EPIC-ORDER-REF）Sprint 24 的实际调用一致。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            {modelStats.range}
          </span>
          <span className="ac-tag ac-tag--ai">
            <Sparkles size={12} />
            模型 {models.length} · Agent {agents.length}
          </span>
        </div>
      </div>

      {/* ---------- 页签 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = t.id === 'gateway' ? models.length : t.id === 'agents' ? agents.length : ragEntries.length;
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

      {/* ================= 1. 模型网关 ================= */}
      {tab === 'gateway' && (
        <>
          <div className="ac-section-title">模型清单</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-ai-observe-models">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Cpu size={16} />
                平台接入模型
              </span>
              <span className="ac-card-subtitle">模型网关统一纳管，按场景路由下发</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">可用 {models.filter((m) => m.enabled).length}</span>
                <span className="ac-tag ac-tag--outline">共 {models.length} 个</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>模型名称</th>
                      <th>厂商</th>
                      <th className="ac-td-right">上下文窗口</th>
                      <th className="ac-td-right">单价（元/千 Token）</th>
                      <th>部署方式</th>
                      <th>承接角色</th>
                      <th className="ac-td-right">可用状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="ac-ao-model-name">{m.name}</div>
                          <span className="ac-xs ac-muted ac-mono">
                            {m.id} · {m.version}
                          </span>
                        </td>
                        <td>
                          <span className="ac-ao-vendor ac-text-2">
                            <span
                              className="ac-ao-vendor-dot"
                              style={{ background: TONE_HEX[m.tone] }}
                            />
                            {m.vendor}
                          </span>
                        </td>
                        <td className="ac-td-num">{m.contextWindow}</td>
                        <td className="ac-td-num">¥{m.costPer1kTokens.toFixed(3)}</td>
                        <td className="ac-text-2">
                          {m.deployment}
                          <div className="ac-xs ac-muted">{m.egress}</div>
                        </td>
                        <td>
                          <span className="ac-ao-role-row">
                            {m.roles.slice(0, 2).map((r) => (
                              <span key={r} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[m.tone]}`}>
                                {r}
                              </span>
                            ))}
                            {m.roles.length > 2 && (
                              <span className="ac-tag ac-tag--sm ac-tag--outline">
                                +{m.roles.length - 2}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="ac-td-right">
                          <span className={`ac-tag ac-tag--sm ac-tag--${m.enabled ? 'ok' : 'neutral'}`}>
                            <span className={m.enabled ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                            {m.enabled ? '可用' : '停用'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ac-section-title">路由策略</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-ai-observe-routing">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Route size={16} />
                场景化模型路由规则
              </span>
              <span className="ac-card-subtitle">任务类型 → 目标模型 → 调用参数 / 回退链路</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">共 {routingRules.length} 条</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>规则</th>
                      <th>任务类型 / 场景</th>
                      <th>匹配条件</th>
                      <th>目标模型</th>
                      <th>温度 / 超时 / 重试</th>
                      <th>回退模型</th>
                      <th className="ac-td-right">优先级</th>
                      <th className="ac-td-right">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routingRules.map((r) => {
                      const rt = sceneRuntime(r.scene);
                      const fb = models.find((m) => m.id === r.fallbackModelId);
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="ac-semi ac-text-1">{r.name}</div>
                            <span className="ac-xs ac-muted ac-mono">{r.id}</span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.tone]}`}>
                              {r.scene}
                            </span>
                          </td>
                          <td className="ac-mono ac-xs ac-text-2">{r.matchExpr}</td>
                          <td>
                            <span className="ac-ao-vendor ac-text-1 ac-semi">
                              <span
                                className="ac-ao-vendor-dot"
                                style={{ background: TONE_HEX[models.find((m) => m.id === r.modelId)?.tone ?? 'brand'] }}
                              />
                              {r.modelName}
                            </span>
                          </td>
                          <td className="ac-mono ac-xs ac-text-2 ac-nowrap">
                            {rt.temperature} / {rt.timeout} / {rt.retries} 次
                          </td>
                          <td>
                            {fb ? (
                              <span className="ac-text-2">{fb.name}</span>
                            ) : (
                              <span className="ac-tag ac-tag--sm ac-tag--danger">无回退（禁止出域）</span>
                            )}
                          </td>
                          <td className="ac-td-num">{r.priority}</td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${r.enabled ? 'ok' : 'neutral'}`}>
                              {r.enabled ? '已启用' : '已停用'}
                            </span>
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
                <ShieldCheck size={14} />
                <span>
                  路由始终先做密级判定：L2 及以上密级代码强制命中敏感代码脱敏补全规则并切换至内网私有化模型，
                  该规则无外部回退；其余规则失败按 priority 升序回退。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">调用统计</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Activity size={16} />
                模型网关调用统计
              </span>
              <span className="ac-card-subtitle">{modelStats.range}</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  采纳率 {modelStats.overallAcceptRate}%
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-metric-grid ac-metric-grid--6 ac-mb-0">
                <div className="ac-metric">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">请求量</span>
                    <span className="ac-metric-icon">
                      <Zap size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {num(stats.totalCalls)}
                    <span className="ac-metric-unit">次</span>
                  </div>
                  <div className="ac-metric-foot">近 7 日累计</div>
                </div>

                <div className="ac-metric ac-metric--ok">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">成功率</span>
                    <span className="ac-metric-icon">
                      <CheckCircle2 size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {stats.successRate.toFixed(1)}
                    <span className="ac-metric-unit">%</span>
                  </div>
                  <div className="ac-metric-foot">按调用量加权</div>
                </div>

                <div className="ac-metric ac-metric--info">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">P95 时延</span>
                    <span className="ac-metric-icon">
                      <Timer size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {num(stats.p95)}
                    <span className="ac-metric-unit">ms</span>
                  </div>
                  <div className="ac-metric-foot">均值 {num(modelStats.avgLatencyMs)} ms</div>
                </div>

                <div className="ac-metric ac-metric--warn">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">回退触发</span>
                    <span className="ac-metric-icon">
                      <ArrowRight size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {num(stats.fallbackCalls)}
                    <span className="ac-metric-unit">次</span>
                  </div>
                  <div className="ac-metric-foot">失败调用转回退链路</div>
                </div>

                <div className="ac-metric ac-metric--info">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">限流拦截</span>
                    <span className="ac-metric-icon">
                      <Gauge size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    0<span className="ac-metric-unit">次</span>
                  </div>
                  <div className="ac-metric-foot">配额 5,000 次/日 未触发</div>
                </div>

                <div className="ac-metric ac-metric--ai">
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">成本占比</span>
                    <span className="ac-metric-icon">
                      <Coins size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {stats.costShare.toFixed(1)}
                    <span className="ac-metric-unit">%</span>
                  </div>
                  <div className="ac-metric-foot">
                    总成本 ¥{num(modelStats.totalCost)} · 主力 {stats.topCostModel}
                  </div>
                </div>
              </div>

              <div className="ac-ao-stat-row">
                <div className="ac-ao-stat">
                  <Layers size={14} className="ac-muted" />
                  <span className="ac-xs ac-muted">Token 消耗</span>
                  <span className="ac-ao-stat-value">
                    {num(modelStats.totalTokensK)}
                    <span className="ac-xs ac-muted"> K</span>
                  </span>
                </div>
                <span className="ac-divider-v" />
                <div className="ac-ao-stat">
                  <Cpu size={14} className="ac-muted" />
                  <span className="ac-xs ac-muted">在线模型</span>
                  <span className="ac-ao-stat-value">{models.filter((m) => m.enabled).length} 个</span>
                </div>
                <span className="ac-divider-v" />
                <div className="ac-ao-stat">
                  <Route size={14} className="ac-muted" />
                  <span className="ac-xs ac-muted">生效路由</span>
                  <span className="ac-ao-stat-value">
                    {routingRules.filter((r) => r.enabled).length} 条
                  </span>
                </div>
                <span className="ac-divider-v" />
                <div className="ac-ao-stat">
                  <ShieldCheck size={14} className="ac-muted" />
                  <span className="ac-xs ac-muted">禁止出域模型</span>
                  <span className="ac-ao-stat-value">{models.filter((m) => m.egress.includes('禁止')).length} 个</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Cpu size={16} />
                  各模型调用量
                </span>
                <span className="ac-card-subtitle">按近 7 日请求量排序</span>
              </div>
              <div className="ac-card-body">
                <HBarChart
                  items={[...modelStats.byModel]
                    .sort((a, b) => b.calls - a.calls)
                    .map((m) => ({ label: m.modelName, value: m.calls, tone: m.tone }))}
                />
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Activity size={16} />
                  调用趋势
                </span>
                <span className="ac-card-subtitle">单日请求量</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-bars ac-ao-trend">
                  {modelStats.trend.map((t) => (
                    <div className="ac-bars-col" key={t.label}>
                      <span className="ac-bars-value">{num(t.calls)}</span>
                      <div className="ac-bars-track">
                        <div
                          className="ac-bars-fill ac-bars-fill--ai"
                          style={{ height: `${Math.round((t.calls / trendMax) * 100)}%` }}
                          title={`${t.label}：${num(t.calls)} 次`}
                        />
                      </div>
                      <span className="ac-bars-label">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 2. Agent 编排 ================= */}
      {tab === 'agents' && (
        <>
          <div className="ac-section-title">智能体编排</div>
          <div className="ac-grid-3 ac-ao-agent-grid" data-annotation-id="ai-sdlc-ai-observe-agents">
            {agents.map((a) => (
              <div className="ac-ao-agent-card" key={a.id}>
                <div className="ac-ao-agent-head">
                  <span className={`ac-avatar ac-avatar--lg ac-avatar--square ${AVATAR_TONE[a.tone]}`}>
                    {a.name.slice(0, 1)}
                  </span>
                  <div className="ac-flex-1">
                    <div className="ac-ao-agent-name">{a.name}</div>
                    <div className="ac-row ac-gap-1 ac-mt-1">
                      <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[a.tone]}`}>{a.stageName}</span>
                      <span
                        className={`ac-tag ac-tag--sm ac-tag--${
                          a.status === 'active' ? 'ok' : a.status === 'idle' ? 'info' : 'neutral'
                        }`}
                      >
                        <span className={a.status === 'active' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                        {a.statusLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="ac-ao-agent-desc">{a.desc}</div>

                <div className="ac-ao-contract">
                  <div className="ac-ao-contract-label">
                    <Layers size={12} />
                    输入契约 · 接收
                  </div>
                  <div className="ac-ao-contract-items">
                    {a.skills.map((s) => (
                      <span key={s} className="ac-tag ac-tag--sm ac-tag--outline">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="ac-ao-contract">
                  <div className="ac-ao-contract-label">
                    <Wrench size={12} />
                    输出契约 · 产出
                  </div>
                  <div className="ac-ao-contract-items">
                    {a.tools.map((t) => (
                      <span key={t} className="ac-tag ac-tag--sm ac-tag--ai">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="ac-ao-agent-foot">
                  <span className="ac-row ac-gap-1 ac-semi ac-text-1">
                    <Zap size={12} className="ac-muted" />
                    近 7 日调用 {a.taskCount} 次
                  </span>
                  <span className={`ac-xs ${TEXT_TONE[a.tone]}`}>成功率 {a.successRate}%</span>
                  <span className="ac-xs ac-muted">采纳率 {a.acceptRate}%</span>
                  <span className="ac-xs ac-muted ac-ml-auto">均耗时 {a.avgDurationMin} 分钟</span>
                </div>
              </div>
            ))}
          </div>

          <div className="ac-section-title">执行轨迹</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-ai-observe-traces">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                智能体执行轨迹
              </span>
              <span className="ac-card-subtitle">点击任意记录查看 traceId 串联的完整调用链</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">共 {agentTraces.length} 条</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>追溯号</th>
                      <th>智能体</th>
                      <th>关联对象</th>
                      <th>模型</th>
                      <th className="ac-td-right">Token（入/出）</th>
                      <th className="ac-td-right">总耗时</th>
                      <th>结果</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentTraces.map((t) => (
                      <tr
                        key={t.id}
                        className="ac-ao-trace-row"
                        onClick={() => setActiveTrace(t)}
                        title="点击查看完整调用链"
                      >
                        <td className="ac-mono ac-brand-text">{t.id}</td>
                        <td>
                          <div className="ac-semi ac-text-1">{t.agentName}</div>
                          <span className="ac-xs ac-muted">{t.startedAt}</span>
                        </td>
                        <td>
                          <div className="ac-ao-trace-target ac-text-2">{t.targetTitle}</div>
                          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[t.tone]}`}>
                            {TARGET_META[t.targetType].label} {t.targetId}
                          </span>
                        </td>
                        <td className="ac-text-2">{t.modelName}</td>
                        <td className="ac-td-num">
                          {num(t.tokenIn)} / {num(t.tokenOut)}
                        </td>
                        <td className="ac-td-num">{num(t.latencyMs)} ms</td>
                        <td className="ac-ao-trace-target ac-xs ac-text-2">{t.result}</td>
                        <td className="ac-td-right">
                          <button
                            type="button"
                            className="ac-btn ac-btn--text ac-btn--sm"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setActiveTrace(t);
                            }}
                          >
                            调用链
                            <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <Drawer
            open={activeTrace !== null}
            title="智能体调用链"
            subtitle={
              activeTrace
                ? `${activeTrace.id} · ${activeTrace.agentName} → ${activeTrace.modelName}`
                : undefined
            }
            width={680}
            onClose={() => setActiveTrace(null)}
          >
            {activeTrace && <TraceDetail trace={activeTrace} />}
          </Drawer>
        </>
      )}

      {/* ================= 3. 知识库 ================= */}
      {tab === 'kb' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-ai-observe-rag">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Database size={16} />
                RAG 知识库条目
              </span>
              <span className="ac-card-subtitle">向量切片与引用热度</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">切片合计 {num(totalRagChunks)}</span>
                <span className="ac-tag ac-tag--ai">引用合计 {num(totalRagHits)}</span>
              </div>
            </div>

            <div className="ac-filter-bar">
              <Search size={14} className="ac-muted" />
              <span className="ac-xs ac-muted">知识类型</span>
              <div className="ac-tabs ac-tabs--pill">
                <button
                  type="button"
                  className={`ac-tab ${ragCategory === 'all' ? 'ac-tab--active' : ''}`}
                  onClick={() => setRagCategory('all')}
                >
                  全部
                  <span className="ac-tab-count">{ragEntries.length}</span>
                </button>
                {ragCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`ac-tab ${ragCategory === c ? 'ac-tab--active' : ''}`}
                    onClick={() => setRagCategory(c)}
                  >
                    {c}
                    <span className="ac-tab-count">
                      {ragEntries.filter((r) => r.category === c).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>条目标题</th>
                      <th>类型</th>
                      <th>来源</th>
                      <th className="ac-td-right">切片数</th>
                      <th className="ac-td-num">向量更新时间</th>
                      <th className="ac-td-right">被引用次数</th>
                      <th className="ac-td-right">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRag.map((r) => {
                      const open = expandedRag === r.id;
                      return (
                        <Fragment key={r.id}>
                          <tr
                            className="ac-ao-rag-row"
                            onClick={() => setExpandedRag(open ? null : r.id)}
                            title={open ? '收起摘要' : '展开摘要'}
                          >
                            <td>
                              <span className="ac-ao-rag-name">
                                <ChevronRight
                                  size={13}
                                  className={`ac-ao-rag-caret ${open ? 'ac-ao-rag-caret--open' : ''}`}
                                />
                                {r.title}
                              </span>
                              <span className="ac-xs ac-muted ac-mono ac-ao-rag-kb">{r.kbId}</span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.tone]}`}>
                                {r.category}
                              </span>
                            </td>
                            <td className="ac-xs ac-text-2 ac-ao-cell-desc">{r.source}</td>
                            <td className="ac-td-num">{num(r.chunks)}</td>
                            <td className="ac-td-num ac-xs">{r.updatedAt}</td>
                            <td className="ac-td-num">{num(r.hitCount)}</td>
                            <td className="ac-td-right">
                              <span className={`ac-tag ac-tag--sm ac-tag--${RAG_STATUS[r.status].tone}`}>
                                {RAG_STATUS[r.status].label}
                              </span>
                            </td>
                          </tr>
                          {open && (
                            <tr className="ac-ao-rag-detail">
                              <td colSpan={7}>
                                <div className="ac-ao-rag-detail-inner">
                                  <div className="ac-ao-rag-summary">
                                    《{r.title}》收录于知识库 {r.kbId}，类型为{r.category}，来源「{r.source}」，
                                    由向量模型 {r.embedModel} 完成切片与索引；当前共 {num(r.chunks)} 个切片、
                                    约 {num(r.tokensK)}K tokens，近 7 日被智能体引用 {num(r.hitCount)} 次，
                                    最后索引更新于 {r.updatedAt}。
                                  </div>
                                  <dl className="ac-kv ac-ao-rag-detail-kv ac-mt-0">
                                    <dt>标签</dt>
                                    <dd>
                                      <span className="ac-ao-role-row">
                                        {r.tags.map((tg) => (
                                          <span key={tg} className="ac-tag ac-tag--sm ac-tag--outline">
                                            {tg}
                                          </span>
                                        ))}
                                      </span>
                                    </dd>
                                    <dt>向量模型</dt>
                                    <dd className="ac-mono">{r.embedModel}</dd>
                                    <dt>切片规模</dt>
                                    <dd>
                                      {num(r.chunks)} 片 · {num(r.tokensK)}K tokens（均{' '}
                                      {Math.round((r.tokensK * 1000) / Math.max(r.chunks, 1))} tokens/片）
                                    </dd>
                                    <dt>索引状态</dt>
                                    <dd>
                                      <span className={`ac-tag ac-tag--sm ac-tag--${RAG_STATUS[r.status].tone}`}>
                                        {RAG_STATUS[r.status].label}
                                      </span>
                                    </dd>
                                  </dl>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Search size={14} />
                <span>
                  切片与引用数据来自知识库检索网关，点击任意行可展开该条目的来源、向量模型与切片规模摘要；
                  索引中（indexing）条目在完成向量化前不参与检索，待更新（stale）条目命中后会被标记为需重新索引。
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 调用链详情 */

function TraceDetail({ trace }: { trace: AgentTraceDef }) {
  const hops = useMemo(() => buildHops(trace), [trace]);
  const target = TARGET_META[trace.targetType];

  return (
    <>
      <div className="ac-ai-block ac-mb-4">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          {trace.agentName} · {trace.modelName}
        </div>
        <div className="ac-mt-2">{trace.result}</div>
      </div>

      <dl className="ac-kv ac-mb-4">
        <dt>追溯号</dt>
        <dd className="ac-mono ac-brand-text">{trace.id}</dd>
        <dt>触发时间</dt>
        <dd className="ac-mono">{trace.startedAt}</dd>
        <dt>关联对象</dt>
        <dd>
          {target.label} <span className="ac-mono">{trace.targetId}</span> · {trace.targetTitle}
        </dd>
        <dt>模型</dt>
        <dd>{trace.modelName}</dd>
        <dt>总耗时</dt>
        <dd className="ac-tnum">{num(trace.latencyMs)} ms</dd>
        <dt>Token</dt>
        <dd className="ac-tnum">
          入 {num(trace.tokenIn)} · 出 {num(trace.tokenOut)} · 合计 {num(trace.tokenIn + trace.tokenOut)}
        </dd>
        <dt>调用链</dt>
        <dd>共 {hops.length} 跳</dd>
      </dl>

      <div className="ac-section-title">完整调用链</div>
      <div className="ac-ao-chain">
        {hops.map((h, idx) => (
          <div className="ac-ao-hop" key={`${h.kind}-${idx}`}>
            <div className="ac-ao-hop-rail">
              <span className={`ac-ao-hop-dot ac-ao-hop-dot--${h.tone}`}>
                {h.kind === '触发事件' ? (
                  <Route size={13} />
                ) : h.kind === 'Agent 调度' ? (
                  <BrainCircuit size={13} />
                ) : h.kind === '模型推理' ? (
                  <Cpu size={13} />
                ) : h.kind === '工具调用' ? (
                  <Wrench size={13} />
                ) : (
                  <CheckCircle2 size={13} />
                )}
              </span>
              <span className="ac-ao-hop-line" />
            </div>
            <div className="ac-ao-hop-body">
              <div className="ac-ao-hop-head">
                <span className="ac-ao-hop-kind">{h.kind}</span>
                <span className="ac-ao-hop-title">{h.title}</span>
                {h.at && <span className="ac-xs ac-muted ac-mono">{h.at}</span>}
              </div>
              {h.meta && <div className="ac-ao-hop-meta">{h.meta}</div>}
              <div className="ac-ao-hop-cost">
                <span>
                  <Timer size={11} />
                  耗时 {num(h.latencyMs)} ms
                </span>
                <span>
                  <Layers size={11} />
                  Token {h.token === null ? '—' : num(h.token)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="ac-hint ac-hint--ai ac-mt-4">
        <AlertTriangle size={14} />
        <span>
          调用链按跳展示耗时与 Token 消耗；Token 仅在模型推理跳计费，工具调用跳沿用同一上下文的缓存命中。
        </span>
      </div>
    </>
  );
}
