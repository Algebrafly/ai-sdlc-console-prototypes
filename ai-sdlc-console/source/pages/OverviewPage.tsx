/**
 * 总览驾驶舱（pageId: overview）
 *
 * 区块：
 *  1. 当前迭代摘要条（CURRENT_SPRINT）
 *  2. SDLC 六环节横向流程条（SDLC_STAGES，可点击跳转对应页面）
 *  3. 6 张核心指标卡（overviewMetrics + 手绘 SVG sparkline）
 *  4. 左右分栏：我的待办（myTodos + 详情 Drawer） / 最近状态流转事件（recentEvents + 筛选）
 */
import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Bug,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Coins,
  Copy,
  ExternalLink,
  Gauge,
  GitBranch,
  Rocket,
  Sparkles,
  Timer,
  Workflow,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import {
  CURRENT_SPRINT,
  GATES,
  SDLC_STAGES,
  TASKS,
  TODAY,
  USERS,
  myTodos,
  overviewMetrics,
  recentEvents,
} from '../data';
import type { EventTargetType, MyTodoDef, NotifyChannel, RecentEventDef, Tone } from '../data';
import './overview.css';

/* ------------------------------------------------------------------ 常量 */

/** 语义色 → 十六进制（与 style.css 设计 token 一致，用于手绘 SVG 与健康色点） */
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

/**
 * SDLC 六环节 → 目标页面 id。
 * 数据层 SdlcStage 未提供 targetPageId 字段，此处按环节语义与路由注册表做映射。
 */
const STAGE_PAGE_MAP: Record<string, string> = {
  'st-req': 'requirement',
  'st-arch': 'design',
  'st-code': 'board',
  'st-test': 'test',
  'st-deploy': 'pipeline',
  'st-observe': 'ai-observe',
};

/**
 * 环节健康状态（三态）。
 * 数据层 SdlcStage 未提供健康状态字段，此处由该环节绑定的质量门禁（GATES）状态推导。
 */
type HealthKey = 'ok' | 'blocked' | 'risk';

const HEALTH_META: Record<HealthKey, { label: string; color: string }> = {
  ok: { label: '健康', color: TONE_HEX.ok },
  blocked: { label: '阻塞', color: TONE_HEX.danger },
  risk: { label: '风险', color: TONE_HEX.warn },
};

const GATE_STATUS_LABEL: Record<string, string> = {
  passed: '已通过',
  failed: '未通过',
  pending: '待校验',
  waived: '已豁免',
};

/** 门禁状态 → 环节健康三态 */
function healthFromGate(status: string | undefined): HealthKey {
  if (status === 'passed') return 'ok';
  if (status === 'failed') return 'blocked';
  return 'risk';
}

/**
 * 关联对象编号 → 目标页面 id。
 * MyTodoDef.refId 为自由文本编号，按前缀约定映射到路由注册表中的页面。
 */
function refTargetPage(refId: string): string | null {
  if (refId.startsWith('TASK-')) return 'board';
  if (refId.startsWith('BUG-')) return 'bug';
  if (refId.startsWith('REQ-')) return 'requirement';
  if (refId.startsWith('REL-')) return 'pipeline';
  if (/^G\d$/u.test(refId)) return 'pipeline';
  return null;
}

/** 事件目标对象类型 → 目标页面 id */
const EVENT_TARGET_PAGE: Record<EventTargetType, string> = {
  task: 'board',
  requirement: 'requirement',
  bug: 'bug',
  gate: 'pipeline',
  release: 'pipeline',
  pipeline: 'pipeline',
};

const CHANNEL_LABEL: Record<NotifyChannel, string> = {
  'lark-card': '飞书卡片',
  'lark-group': '飞书群',
  webhook: 'Webhook',
  sms: '短信',
  phone: '电话',
  email: '邮件',
};

const TARGET_TYPE_LABEL: Record<EventTargetType, string> = {
  task: '任务',
  requirement: '需求',
  bug: '缺陷',
  gate: '门禁',
  release: '发布单',
  pipeline: '流水线',
};

/** 任务终态（用于统计各环节在制品数） */
const TERMINAL_TASK_STATES = new Set(['released']);

/** 待办处理建议：数据层 MyTodoDef 无该字段，按待办类型给出领域化建议文案 */
const TODO_ADVICE: Record<string, string> = {
  发布: '先与 SRE 对齐切流窗口：在发布门禁（G5）六项全绿、BLOCK-0312 拿到 DBA 迁移窗口后再放行灰度；期间保持回滚预案可用。',
  缺陷: '将缺陷提至最高优先级，指派原 MR 提交人处理剩余 must-fix 项；复检通过后回写 PingCode 状态，并补充回归用例防复发。',
  阻塞: '升级至研发总监裁决并同步 PMO 调整排期；若 24 小时内仍未拿到数据库窗口，则切换为分批迁移方案以解除阻塞。',
  评审: '在方案评审会上拉通架构师确认边界，形成 ADR 决策记录后同步至知识库 KB-ARCH-01，并回写任务卡。',
  需求: '在需求评审前补齐验收标准、依赖项与合规确认，再纳入下一迭代（SP-25）需求池排期。',
  门禁: '补齐单元测试至阈值以上（≥85%），检查流水线质量红线配置与 SonarQube 阻断规则，重跑门禁后再提交发布单。',
  迭代: '在迭代收尾前完成 PingCode 子任务映射与双向对账，确认剩余点数的排期可行性。',
};

/** 待办优先级 → 徽章样式 */
const PRIORITY_BADGE: Record<MyTodoDef['priority'], string> = {
  P0: 'ac-badge--danger',
  P1: 'ac-badge--warn',
  P2: 'ac-badge--neutral',
};

/** 姓名 → 成员（用于动态流头像） */
const USER_BY_NAME = new Map(USERS.map((u) => [u.name, u]));

/* ------------------------------------------------------------------ 小组件 */

/** 手绘 SVG sparkline（近 7 个周期趋势） */
function Sparkline({ data, tone, id }: { data: number[]; tone: Tone; id: string }) {
  const W = 160;
  const H = 34;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const stepX = data.length > 1 ? W / (data.length - 1) : W;
  const coords = data.map((v, i) => [
    i * stepX,
    H - 4 - ((v - min) / span) * (H - 10),
  ]);
  const line = `M${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
  const area = `${line} L${W},${H} L0,${H} Z`;
  const color = TONE_HEX[tone] ?? TONE_HEX.brand;
  const gradientId = `ov-spark-${id}`;

  return (
    <svg
      className="ac-metric-spark"
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="近 7 个周期趋势"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** 指标卡右上角图标（按指标 id 分派，id 与 data.ts overviewMetrics 严格一致） */
function metricIcon(id: string): ReactNode {
  switch (id) {
    case 'deliveredTasks':
      return <CheckCircle2 size={15} />;
    case 'aiAcceptRate':
      return <Sparkles size={15} />;
    case 'buildPassRate':
      return <Workflow size={15} />;
    case 'releaseSuccessRate':
      return <Rocket size={15} />;
    case 'openDefects':
      return <Bug size={15} />;
    case 'tokenCost':
      return <Coins size={15} />;
    default:
      return <Gauge size={15} />;
  }
}

/** 事件 → 时间线节点语义色 */
function eventToneClass(e: RecentEventDef): string {
  if (e.to === 'failed' || e.to === 'blocked' || e.from === 'blocked') return 'ac-timeline-item--danger';
  if (e.actorTone === 'ai') return 'ac-timeline-item--ai';
  if (e.actorTone === 'warn') return 'ac-timeline-item--warn';
  if (e.from !== e.to) return 'ac-timeline-item--ok';
  return 'ac-timeline-item--dim';
}

type EventFilter = 'all' | 'task' | 'bug';

/* ------------------------------------------------------------------ 页面 */

export default function OverviewPage() {
  const [activeTodo, setActiveTodo] = useState<MyTodoDef | null>(null);
  const [doneTodoIds, setDoneTodoIds] = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [todoType, setTodoType] = useState<string>('all');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  /** 各环节在制品数（排除终态任务） */
  const wipByStage = useMemo(() => {
    const counter: Record<string, number> = {};
    TASKS.forEach((t) => {
      if (TERMINAL_TASK_STATES.has(t.state)) return;
      counter[t.stageId] = (counter[t.stageId] ?? 0) + 1;
    });
    return counter;
  }, []);

  /** 各环节健康三态（由绑定的质量门禁状态推导） */
  const healthByStage = useMemo(() => {
    const map: Record<string, HealthKey> = {};
    SDLC_STAGES.forEach((s) => {
      const gate = GATES.find((g) => g.id === s.gateId);
      map[s.id] = healthFromGate(gate?.status);
    });
    return map;
  }, []);

  /** 当前迭代剩余自然日 */
  const daysLeft = useMemo(() => {
    const end = new Date(`${CURRENT_SPRINT.endDate}T00:00:00`).getTime();
    const now = new Date(`${TODAY}T00:00:00`).getTime();
    return Math.max(0, Math.round((end - now) / 86400000));
  }, []);

  const filteredEvents = useMemo(
    () => recentEvents.filter((e) => (eventFilter === 'all' ? true : e.targetType === eventFilter)),
    [eventFilter],
  );

  /** 待办类型 chips（从数据中动态归纳，避免硬编码） */
  const todoTypes = useMemo(() => Array.from(new Set(myTodos.map((t) => t.type))), []);

  const filteredTodos = useMemo(
    () => (todoType === 'all' ? myTodos : myTodos.filter((t) => t.type === todoType)),
    [todoType],
  );

  const pendingTodoCount = myTodos.filter((t) => !doneTodoIds.includes(t.id)).length;
  const activeTodoDone = activeTodo ? doneTodoIds.includes(activeTodo.id) : false;

  /** 轻量 toast 提示（复制等瞬时反馈） */
  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  };

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const jump = (page: string | null) => {
    if (page) window.location.hash = `#page=${page}`;
  };

  /** 复制溯源 id（失败时降级提示，不静默） */
  const copyTrace = (traceId: string) => {
    const clip = navigator.clipboard;
    if (!clip?.writeText) {
      showToast('当前环境不支持剪贴板，请手动复制');
      return;
    }
    clip
      .writeText(traceId)
      .then(() => showToast(`已复制溯源 id：${traceId}`))
      .catch(() => showToast('复制失败，请手动选择复制'));
  };

  return (
    <div className="ac-page ac-ov">
      {/* ============ 1. 当前迭代摘要条 ============ */}
      <div className="ac-card" data-annotation-id="ai-sdlc-overview-sprint">
        <div className="ac-card-body">
          <div className="ac-ov-sprint">
            <div className="ac-ov-sprint-main">
              <div className="ac-ov-sprint-name">
                {CURRENT_SPRINT.name}
                <span className={`ac-tag ac-tag--${CURRENT_SPRINT.tone}`}>{CURRENT_SPRINT.statusLabel}</span>
                <span className="ac-tag ac-tag--outline ac-tag--sm">{CURRENT_SPRINT.id}</span>
              </div>
              <div className="ac-ov-sprint-theme">
                迭代主题：{CURRENT_SPRINT.theme} · {CURRENT_SPRINT.startDate} ~ {CURRENT_SPRINT.endDate} · 剩余 {daysLeft} 天
              </div>
            </div>
            <div className="ac-ov-sprint-stats">
              <div className="ac-ov-stat">
                <div className="ac-ov-stat-label">承诺点数</div>
                <div className="ac-ov-stat-value">
                  {CURRENT_SPRINT.committed}
                  <small>SP</small>
                </div>
              </div>
              <div className="ac-ov-stat">
                <div className="ac-ov-stat-label">已完成点数</div>
                <div className="ac-ov-stat-value">
                  {CURRENT_SPRINT.completed}
                  <small>SP</small>
                </div>
              </div>
              <div className="ac-ov-stat">
                <div className="ac-ov-stat-label">团队产能</div>
                <div className="ac-ov-stat-value">
                  {CURRENT_SPRINT.capacity}
                  <small>SP</small>
                </div>
              </div>
              <div className="ac-ov-stat">
                <div className="ac-ov-stat-label">迭代完成度</div>
                <div className="ac-ov-stat-value">
                  {CURRENT_SPRINT.progress}
                  <small>%</small>
                </div>
              </div>
            </div>
            <div className="ac-ov-sprint-progress">
              <div className="ac-progress ac-progress--lg">
                <div
                  className={`ac-progress-bar ac-progress-bar--${CURRENT_SPRINT.progress >= 80 ? 'ok' : CURRENT_SPRINT.progress >= 50 ? 'warn' : 'danger'}`}
                  style={{ width: `${CURRENT_SPRINT.progress}%` }}
                />
              </div>
              <div className="ac-ov-sprint-goal">
                <Timer size={12} /> 迭代目标：{CURRENT_SPRINT.goal}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 2. SDLC 六环节横向流程条 ============ */}
      <div className="ac-card" data-annotation-id="ai-sdlc-overview-flow">
        <div className="ac-card-head">
          <div className="ac-card-title">
            <GitBranch size={15} /> AI 研发生命周期六环节
          </div>
          <div className="ac-card-extra">
            <span className="ac-card-subtitle">点击环节节点可进入对应工作台</span>
          </div>
        </div>
        <div className="ac-card-body">
          <div className="ac-flow">
            {SDLC_STAGES.map((stage, index) => {
              const healthKey = healthByStage[stage.id] ?? 'risk';
              const health = HEALTH_META[healthKey];
              const gate = GATES.find((g) => g.id === stage.gateId);
              const stateClass =
                healthKey === 'blocked'
                  ? 'ac-flow-node--failed'
                  : stage.progress >= 100
                    ? 'ac-flow-node--ok'
                    : stage.progress > 0
                      ? 'ac-flow-node--running'
                      : 'ac-flow-node--pending';
              const prev = index > 0 ? SDLC_STAGES[index - 1] : undefined;
              const targetPage = STAGE_PAGE_MAP[stage.id];
              const wip = wipByStage[stage.id] ?? 0;

              const jumpStage = () => {
                if (targetPage) window.location.hash = `#page=${targetPage}`;
              };

              return (
                <Fragment key={stage.id}>
                  {prev && (
                    <div className={`ac-flow-arrow ${prev.progress >= 100 ? 'ac-flow-arrow--ok' : ''}`}>
                      <ChevronRight size={16} />
                    </div>
                  )}
                  <div
                    className={`ac-flow-node ${stateClass}`}
                    role="button"
                    tabIndex={0}
                    title={
                      targetPage
                        ? `${stage.desc}\n点击进入「${stage.name}」工作台`
                        : `${stage.desc}\n（暂无对应页面）`
                    }
                    onClick={jumpStage}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        jumpStage();
                      }
                    }}
                  >
                    <div className="ac-flow-node-head">
                      <span className="ac-flow-node-idx">{stage.order}</span>
                      <span className="ac-flow-node-title">{stage.name}</span>
                      <span className="ac-flow-node-icon">{stage.code}</span>
                    </div>
                    <div className="ac-ov-node-desc">{stage.desc}</div>
                    <div className="ac-ov-node-foot">
                      <span className="ac-ov-node-wip" title="该环节未闭环的工作项数量">
                        <ClipboardList size={12} /> 在制 {wip}
                      </span>
                      <span
                        className="ac-ov-node-health"
                        title={`健康状态：${health.label}（门禁 ${stage.gateId} ${GATE_STATUS_LABEL[gate?.status ?? ''] ?? '未定义'}）`}
                      >
                        <span className="ac-ov-dot" style={{ background: health.color }} />
                        {health.label}
                      </span>
                    </div>
                    <div className="ac-flow-node-meta">环节进度 {stage.progress}%</div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============ 3. 核心指标卡 ============ */}
      <div data-annotation-id="ai-sdlc-overview-metrics">
        <div className="ac-metric-grid ac-metric-grid--6">
          {overviewMetrics.map((m) => {
            const deltaClass =
              m.deltaDir === 'up'
                ? 'ac-metric-delta--up'
                : m.deltaDir === 'down'
                  ? 'ac-metric-delta--down'
                  : 'ac-metric-delta--flat';
            const arrow = m.deltaDir === 'up' ? '▲' : m.deltaDir === 'down' ? '▼' : '—';
            return (
              <div className={`ac-metric ac-metric--${m.tone}`} key={m.id}>
                <div className="ac-metric-head">
                  <span className="ac-metric-label">{m.name}</span>
                  <span className="ac-metric-icon">{metricIcon(m.id)}</span>
                </div>
                <div className="ac-metric-value">
                  {m.value}
                  <span className="ac-metric-unit">{m.unit}</span>
                </div>
                <div className={`ac-metric-delta ${deltaClass}`}>
                  {arrow} {Math.abs(m.delta)}
                  <span className="ac-ov-delta-note">较上周期</span>
                </div>
                <Sparkline data={m.spark} tone={m.tone} id={m.id} />
                <div className="ac-metric-foot">{m.hint}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============ 4. 左右分栏：我的待办 / 最近事件流 ============ */}
      <div className="ac-ov-split" data-annotation-id="ai-sdlc-overview-lower">
        {/* ---- 左：分配给我的待办 ---- */}
        <div className="ac-card">
          <div className="ac-card-head">
            <div className="ac-card-title">
              <ClipboardList size={15} /> 分配给我的待办
            </div>
            <div className="ac-card-extra">
              <span className="ac-tag ac-tag--brand ac-tag--sm">待处理 {pendingTodoCount} 项</span>
              <span className="ac-card-subtitle">点击行查看详情</span>
            </div>
          </div>
          <div className="ac-card-body ac-card-body--flush">
            <div className="ac-ov-todo-filter">
              <div className="ac-tabs ac-tabs--pill">
                {(['all', ...todoTypes] as string[]).map((key) => (
                  <button
                    type="button"
                    key={key}
                    className={`ac-tab ${todoType === key ? 'ac-tab--active' : ''}`}
                    onClick={() => setTodoType(key)}
                    title={key === 'all' ? '显示全部类型的待办' : `仅显示「${key}」类型待办`}
                  >
                    {key === 'all' ? '全部类型' : key}
                    <span className="ac-tab-count">
                      {key === 'all' ? myTodos.length : myTodos.filter((t) => t.type === key).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {filteredTodos.length === 0 ? (
              <div className="ac-empty ac-empty--sm">
                <div className="ac-empty-title">该类型下暂无待办</div>
                <div className="ac-empty-desc">切换上方类型标签可查看其他待办事项</div>
              </div>
            ) : (
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-ov-todo-table">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>待办事项</th>
                      <th>优先级</th>
                      <th>截止时间</th>
                      <th>关联对象</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTodos.map((t) => {
                      const done = doneTodoIds.includes(t.id);
                      const refPage = refTargetPage(t.refId);
                      return (
                        <tr
                          key={t.id}
                          className={done ? 'ac-ov-todo-row--done' : ''}
                          onClick={() => setActiveTodo(t)}
                          title="点击查看待办详情"
                        >
                          <td>
                            <span className={`ac-tag ac-tag--${t.tone} ac-tag--sm`}>{t.type}</span>
                          </td>
                          <td>
                            <div className="ac-ov-todo-title">{t.title}</div>
                            {done && <span className="ac-ov-todo-done-flag">已完成</span>}
                          </td>
                          <td>
                            <span className={`ac-badge ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</span>
                          </td>
                          <td className="ac-nowrap ac-mono ac-xs">{t.due}</td>
                          <td>
                            {refPage ? (
                              <button
                                type="button"
                                className="ac-ov-todo-ref ac-ov-todo-ref--link"
                                title={`前往关联对象 ${t.refId}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  jump(refPage);
                                }}
                              >
                                {t.refId}
                                <ExternalLink size={10} />
                              </button>
                            ) : (
                              <span className="ac-ov-todo-ref" title="该编号暂无对应页面">
                                {t.refId}
                              </span>
                            )}
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

        {/* ---- 右：最近状态流转事件 ---- */}
        <div className="ac-card">
          <div className="ac-card-head">
            <div className="ac-card-title">
              <GitBranch size={15} /> 最近状态流转事件
            </div>
            <div className="ac-card-extra">
              <div className="ac-tabs ac-tabs--pill">
                {(
                  [
                    ['all', '全部'],
                    ['task', '仅任务'],
                    ['bug', '仅缺陷'],
                  ] as [EventFilter, string][]
                ).map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={`ac-tab ${eventFilter === key ? 'ac-tab--active' : ''}`}
                    onClick={() => setEventFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ac-card-body">
            {filteredEvents.length === 0 ? (
              <div className="ac-empty ac-empty--sm">
                <div className="ac-empty-title">当前筛选下暂无事件</div>
                <div className="ac-empty-desc">切换筛选条件可查看其他类型的状态流转事件</div>
              </div>
            ) : (
              <div className="ac-timeline">
                {filteredEvents.map((e) => {
                  const actor = USER_BY_NAME.get(e.actor);
                  const avatarColor = actor?.avatarColor ?? e.actorTone;
                  const avatarText = actor?.initial ?? e.actor.slice(0, 1);
                  return (
                    <div className={`ac-timeline-item ${eventToneClass(e)}`} key={e.id}>
                      <div className="ac-timeline-head">
                        <span className={`ac-avatar ac-avatar--xs ac-avatar--${avatarColor}`}>{avatarText}</span>
                        <span className="ac-timeline-title">{e.actor}</span>
                        <span className="ac-tag ac-tag--neutral ac-tag--sm">{TARGET_TYPE_LABEL[e.targetType]}</span>
                        <span className="ac-timeline-time">{e.time}</span>
                      </div>
                      <div className="ac-timeline-desc">{e.action}</div>
                      <div className="ac-timeline-extra ac-row ac-row-wrap ac-gap-2">
                        <span className="ac-ov-transition">
                          <span className="ac-ov-from">{e.from}</span>
                          <ArrowRight size={11} />
                          <span className="ac-ov-to">{e.to}</span>
                        </span>
                        <button
                          type="button"
                          className="ac-ov-event-target ac-ov-link"
                          title={`前往${TARGET_TYPE_LABEL[e.targetType]} ${e.targetId}`}
                          onClick={() => jump(EVENT_TARGET_PAGE[e.targetType])}
                        >
                          <span className="ac-mono">{e.targetId}</span> · {e.targetTitle}
                          <ExternalLink size={10} />
                        </button>
                        <button
                          type="button"
                          className="ac-ov-trace"
                          title={`点击复制溯源 id：${e.traceId}`}
                          onClick={() => copyTrace(e.traceId)}
                        >
                          <Copy size={10} />
                          {e.traceId}
                        </button>
                        <span className="ac-tag ac-tag--outline ac-tag--sm">{CHANNEL_LABEL[e.channel]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ 待办详情 Drawer ============ */}
      <Drawer
        open={activeTodo !== null}
        title={activeTodo?.title ?? ''}
        subtitle={activeTodo ? `${activeTodo.type} · 关联 ${activeTodo.refId}` : undefined}
        width={560}
        onClose={() => setActiveTodo(null)}
        footer={
          activeTodo ? (
            <>
              <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setActiveTodo(null)}>
                关闭
              </button>
              <button
                type="button"
                className={`ac-btn ${activeTodoDone ? 'ac-btn--ghost' : 'ac-btn--primary'}`}
                disabled={activeTodoDone}
                title={activeTodoDone ? '该待办已标记完成' : '将该待办标记为已完成'}
                onClick={() =>
                  setDoneTodoIds((prev) => (prev.includes(activeTodo.id) ? prev : [...prev, activeTodo.id]))
                }
              >
                {activeTodoDone ? (
                  <>
                    <CheckCircle2 size={14} /> 已完成
                  </>
                ) : (
                  '标记完成'
                )}
              </button>
            </>
          ) : null
        }
      >
        {activeTodo && (
          <div className="ac-col ac-gap-4">
            <div className="ac-grid-2">
              <div className="ac-ov-kv">
                <span className="ac-ov-kv-label">待办类型</span>
                <span className="ac-ov-kv-value">
                  <span className={`ac-tag ac-tag--${activeTodo.tone} ac-tag--sm`}>{activeTodo.type}</span>
                </span>
              </div>
              <div className="ac-ov-kv">
                <span className="ac-ov-kv-label">优先级</span>
                <span className="ac-ov-kv-value">
                  <span className={`ac-badge ${PRIORITY_BADGE[activeTodo.priority]}`}>{activeTodo.priority}</span>
                </span>
              </div>
              <div className="ac-ov-kv">
                <span className="ac-ov-kv-label">截止时间</span>
                <span className="ac-ov-kv-value ac-mono">{activeTodo.due}</span>
              </div>
              <div className="ac-ov-kv">
                <span className="ac-ov-kv-label">关联对象</span>
                <span className="ac-ov-kv-value">
                  {refTargetPage(activeTodo.refId) ? (
                    <button
                      type="button"
                      className="ac-ov-todo-ref ac-ov-todo-ref--link"
                      title={`前往关联对象 ${activeTodo.refId}`}
                      onClick={() => {
                        jump(refTargetPage(activeTodo.refId));
                        setActiveTodo(null);
                      }}
                    >
                      {activeTodo.refId}
                      <ExternalLink size={10} />
                    </button>
                  ) : (
                    <span className="ac-ov-todo-ref" title="该编号暂无对应页面">
                      {activeTodo.refId}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div>
              <div className="ac-section-title">待办事项</div>
              <div className="ac-text-2 ac-lh">{activeTodo.title}</div>
            </div>

            <div>
              <div className="ac-section-title">处理建议</div>
              <div className="ac-ai-block">
                <div className="ac-ai-block-title">
                  <Sparkles size={13} /> AI 处理建议
                </div>
                <div className="ac-lh">{TODO_ADVICE[activeTodo.type] ?? '暂无建议，请结合上下文人工判断。'}</div>
              </div>
            </div>

            <div className="ac-ov-kv">
              <span className="ac-ov-kv-label">当前状态</span>
              <span className="ac-ov-kv-value">
                {activeTodoDone ? (
                  <span className="ac-tag ac-tag--ok ac-tag--sm">
                    <span className="ac-tag-dot" /> 已完成
                  </span>
                ) : (
                  <span className="ac-tag ac-tag--warn ac-tag--sm">
                    <span className="ac-tag-dot" /> 待处理
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </Drawer>

      {/* ============ 轻量 toast 提示 ============ */}
      {toast && (
        <div className="ac-ov-toast" role="status" aria-live="polite">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}
    </div>
  );
}
