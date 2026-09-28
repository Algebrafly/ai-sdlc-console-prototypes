/**
 * 任务看板（pageId: board）
 * 10 态横向分列 · 负责人 / 优先级 / 迭代 / 关键字筛选 · 全部 / 分配给我 · 任务详情抽屉
 * 抽屉内容：描述 · 验收标准 · 状态流转（本地演示）· 提交与 Diff 摘要 · 本地测试与门禁 · Agent 参与记录
 */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Inbox,
  ListFilter,
  Search,
  Sparkles,
  TestTube2,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import {
  agents,
  CODING_SESSION_MAP,
  CURRENT_USER,
  PIPELINE_BY_TASK,
  REQUIREMENT_MAP,
  SPRINTS,
  TASKS,
  TASK_EVENTS,
  TASK_STATES,
  TASK_STATE_MAP,
  USER_MAP,
} from '../data';
import './board.css';

type Task = (typeof TASKS)[number];
type TaskEvent = (typeof TASK_EVENTS)[number];

/* ============================================================
 * 语义色映射：看板列色条 / 状态标签统一取同一份色值
 * （teal 等 tone 在 style.css 中无对应 .ac-tag--* 类，统一走内联色）
 * ============================================================ */
interface ToneStyle {
  solid: string;
  bg: string;
  fg: string;
  bd: string;
}

const TONE: Record<string, ToneStyle> = {
  neutral: { solid: '#94a3b8', bg: '#f1f3f6', fg: '#475569', bd: '#e4e8ee' },
  info: { solid: '#3b82f6', bg: 'var(--info-soft)', fg: '#1d4ed8', bd: '#cfe0fb' },
  ai: { solid: '#7c3aed', bg: 'var(--ai-soft)', fg: 'var(--ai-deep)', bd: '#e2d5fb' },
  brand: { solid: '#4f46e5', bg: 'var(--brand-soft)', fg: 'var(--brand-deep)', bd: '#d8dcfb' },
  teal: { solid: '#0d9488', bg: '#e6faf6', fg: '#0f766e', bd: '#b7ebe0' },
  warn: { solid: '#f59e0b', bg: 'var(--warn-soft)', fg: '#b45309', bd: '#f7e0b4' },
  danger: { solid: '#ef4444', bg: 'var(--danger-soft)', fg: '#b91c1c', bd: '#f6cdcd' },
  ok: { solid: '#10b981', bg: 'var(--ok-soft)', fg: '#047857', bd: '#c3ecdc' },
};

function tone(name: string): ToneStyle {
  return TONE[name] ?? TONE.neutral;
}

const PRIORITY_TONE: Record<string, string> = { P0: 'danger', P1: 'warn', P2: 'neutral' };
const TYPE_TONE: Record<string, string> = { 开发: 'brand', 联调: 'info', 测试: 'ai', 发布: 'ok', 技术债: 'warn' };
const EXECUTOR_LABEL: Record<string, string> = { ai: 'AI 主导', human: '人工', 'ai+human': '人机协作' };
const EXECUTOR_TONE: Record<string, string> = { ai: 'ai', human: 'info', 'ai+human': 'brand' };

const EVENT_KIND_LABEL: Record<string, string> = {
  assign: '指派',
  state: '状态流转',
  commit: '代码提交',
  review: '评审',
  gate: '门禁',
  risk: '风险',
  comment: '评论',
  sync: '同步',
  test: '测试',
};

const SESSION_STATUS: Record<string, { label: string; tone: string }> = {
  running: { label: '进行中', tone: 'brand' },
  waiting: { label: '等待确认', tone: 'warn' },
  paused: { label: '已暂停', tone: 'neutral' },
  done: { label: '已完成', tone: 'ok' },
  failed: { label: '失败', tone: 'danger' },
};

const PIPELINE_STATUS: Record<string, { label: string; tone: string }> = {
  success: { label: '通过', tone: 'ok' },
  failed: { label: '失败', tone: 'danger' },
  running: { label: '执行中', tone: 'brand' },
  skipped: { label: '已跳过', tone: 'neutral' },
  waiting: { label: '等待中', tone: 'warn' },
};

/* Agent / 模型名称映射（取自 agents 数据，非臆造） */
const AGENT_NAME: Record<string, string> = Object.fromEntries(agents.map((a) => [a.id, a.name]));
const MODEL_NAME: Record<string, string> = Object.fromEntries(agents.map((a) => [a.modelId, a.modelName]));

function actorName(event: TaskEvent): string {
  if (event.actorType === 'system') return '平台调度';
  if (event.actorId.startsWith('ag-')) return AGENT_NAME[event.actorId] ?? event.actorId;
  return USER_MAP[event.actorId]?.name ?? event.actorId;
}

function eventToneClass(event: TaskEvent): string {
  if (event.tone === 'danger') return 'ac-timeline-item--danger';
  if (event.tone === 'warn') return 'ac-timeline-item--warn';
  if (event.tone === 'ok') return 'ac-timeline-item--ok';
  if (event.actorType === 'agent' || event.tone === 'ai') return 'ac-timeline-item--ai';
  return 'ac-timeline-item--dim';
}

export default function BoardPage() {
  const [ownerId, setOwnerId] = useState('');
  const [priority, setPriority] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [openTaskId, setOpenTaskId] = useState('');
  const [stateOverride, setStateOverride] = useState<Record<string, string>>({});

  /* ---------- 筛选选项（从真实数据派生） ---------- */
  const sprintOptions = useMemo(
    () => SPRINTS.filter((s) => TASKS.some((t) => t.sprintId === s.id)).map((s) => ({ id: s.id, name: s.name })),
    [],
  );

  const isMine = useMemo(() => {
    const ids = new Set(TASKS.filter((t) => t.ownerId === CURRENT_USER.id || t.reviewerId === CURRENT_USER.id).map((t) => t.id));
    return (taskId: string) => ids.has(taskId);
  }, []);

  /* ---------- 筛选后的工作项 ---------- */
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return TASKS.filter((t) => {
      if (ownerId && t.ownerId !== ownerId) return false;
      if (priority && t.priority !== priority) return false;
      if (sprintId && t.sprintId !== sprintId) return false;
      if (kw) {
        const hay = `${t.code} ${t.title} ${t.branch} ${t.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [ownerId, priority, sprintId, keyword]);

  /* 每个状态列的工作项（按状态 id 归列；stateOverride 为本地演示覆盖） */
  const columns = useMemo(
    () =>
      TASK_STATES.map((state) => ({
        state,
        tasks: filtered.filter((t) => (stateOverride[t.id] ?? t.state) === state.id),
      })),
    [filtered, stateOverride],
  );

  const mineCount = useMemo(() => filtered.filter((t) => isMine(t.id)).length, [filtered, isMine]);
  const blockedCount = useMemo(() => filtered.filter((t) => t.blockedReason).length, [filtered]);
  const aiTaskCount = useMemo(() => filtered.filter((t) => t.executor !== 'human').length, [filtered]);

  const openTask = openTaskId ? TASKS.find((t) => t.id === openTaskId) : undefined;
  const openStateId = openTask ? (stateOverride[openTask.id] ?? openTask.state) : '';
  const openState = openStateId ? TASK_STATE_MAP[openStateId] : undefined;
  const openRequirement = openTask && openTask.reqId ? REQUIREMENT_MAP[openTask.reqId] : undefined;
  const openEvents = useMemo(
    () => (openTask ? TASK_EVENTS.filter((e) => e.taskId === openTask.id).slice().reverse() : []),
    [openTask],
  );
  const openPipeline = openTask ? PIPELINE_BY_TASK[openTask.id]?.[0] : undefined;
  const openSession = openTask && openTask.sessionId ? CODING_SESSION_MAP[openTask.sessionId] : undefined;

  function switchState(nextStateId: string) {
    if (!openTask) return;
    setStateOverride((prev) => ({ ...prev, [openTask.id]: nextStateId }));
  }

  return (
    <div className="ac-bd" data-annotation-id="ai-sdlc-board-page">
      {/* ============================================================
          ① 顶部筛选
         ============================================================ */}
      <div className="ac-filter-bar ac-bd-filters" data-annotation-id="ai-sdlc-board-page-filters">
        <span className="ac-bd-search">
          <Search size={13} />
          <input className="ac-input" placeholder="搜索编号 / 标题 / 分支 / 标签" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </span>

        <span className="ac-divider-v" />

        <span className="ac-xs ac-muted ac-nowrap">负责人</span>
        <select className="ac-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">全部负责人</option>
          {Object.values(USER_MAP)
            .filter((u) => TASKS.some((t) => t.ownerId === u.id))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>

        <span className="ac-xs ac-muted ac-nowrap">优先级</span>
        <select className="ac-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">全部</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>

        <span className="ac-xs ac-muted ac-nowrap">迭代</span>
        <select className="ac-select" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
          <option value="">全部迭代</option>
          {sprintOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <span className="ac-divider-v" />

        <div className="ac-tabs ac-tabs--pill">
          <button type="button" className={`ac-tab ${scope === 'all' ? 'ac-tab--active' : ''}`} onClick={() => setScope('all')}>
            <ListFilter size={13} />
            全部
          </button>
          <button type="button" className={`ac-tab ${scope === 'mine' ? 'ac-tab--active' : ''}`} onClick={() => setScope('mine')}>
            <Inbox size={13} />
            分配给我
          </button>
        </div>

        <div className="ac-bd-scope">
          <span className="ac-bd-scope-stat">
            命中 {filtered.length} 项 · 我的 {mineCount} 项
          </span>
          <span className="ac-bd-scope-stat">AI 参与 {aiTaskCount} 项</span>
          {blockedCount > 0 ? (
            <span className="ac-tag ac-tag--sm ac-tag--danger">
              <Ban size={10} />
              受阻 {blockedCount}
            </span>
          ) : null}
        </div>
      </div>

      {/* ============================================================
          ② 状态看板
         ============================================================ */}
      <div className="ac-board" data-annotation-id="ai-sdlc-board-page-columns">
        {columns.map(({ state, tasks }) => {
          const st = tone(state.tone);
          const mineInCol = tasks.filter((t) => isMine(t.id)).length;
          return (
            <div className="ac-board-col" key={state.id}>
              <div className="ac-board-col-head" title={state.desc}>
                <span className="ac-bd-col-bar" style={{ background: st.solid }} />
                <span className="ac-board-col-title">{state.name}</span>
                <div className="ac-bd-col-head-extra">
                  <span className="ac-bd-col-sla">SLA {state.slaHours}h</span>
                </div>
                <span className="ac-board-col-count" title={scope === 'mine' ? `我的 ${mineInCol} / 共 ${tasks.length}` : `共 ${tasks.length}`}>
                  {scope === 'mine' ? mineInCol : tasks.length}
                </span>
              </div>
              <div className="ac-board-col-body">
                {tasks.map((task) => {
                  const owner = USER_MAP[task.ownerId];
                  const mine = isMine(task.id);
                  const dim = scope === 'mine' && !mine;
                  const mods = ['ac-board-card'];
                  if (task.blockedReason) mods.push('ac-board-card--blocked');
                  else if (task.executor === 'human') mods.push('ac-board-card--human');
                  else mods.push('ac-board-card--ai');
                  if (dim) mods.push('ac-bd-card--dim');
                  else if (mine && scope === 'mine') mods.push('ac-bd-card--mine');
                  const aiStyle = tone(EXECUTOR_TONE[task.executor] ?? 'neutral');
                  return (
                    <div className={mods.join(' ')} key={task.id} onClick={() => setOpenTaskId(task.id)}>
                      <div className="ac-row-between ac-gap-2">
                        <span className="ac-board-card-id">{task.code}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>
                      </div>
                      <div className="ac-board-card-title" title={task.title}>
                        {task.title}
                      </div>
                      <div className="ac-board-card-tags">
                        <span className={`ac-tag ac-tag--sm ac-tag--${TYPE_TONE[task.type] ?? 'neutral'}`}>{task.type}</span>
                        {task.critical ? <span className="ac-tag ac-tag--sm ac-tag--danger">关键路径</span> : null}
                        {task.blockedReason ? (
                          <span className="ac-tag ac-tag--sm ac-tag--warn" title={task.blockedReason}>
                            <Ban size={10} />
                            受阻
                          </span>
                        ) : null}
                      </div>
                      <div className="ac-bd-card-meta">
                        {task.branch ? (
                          <span className="ac-bd-branch" title={task.branch}>
                            <GitBranch size={10} />
                            {task.branch}
                          </span>
                        ) : task.mrId ? (
                          <span className="ac-bd-branch" title={task.mrId}>
                            <GitPullRequest size={10} />
                            {task.mrId}
                          </span>
                        ) : (
                          <span className="ac-muted">暂无分支</span>
                        )}
                        <span className="ac-mono">{task.estimateHours}h</span>
                        <span className="ac-mono">{task.points}pt</span>
                      </div>
                      <div className="ac-bd-ai-row">
                        <span className={`ac-tag ac-tag--sm ac-tag--${EXECUTOR_TONE[task.executor] ?? 'neutral'}`}>
                          <Bot size={10} />
                          {EXECUTOR_LABEL[task.executor] ?? task.executor}
                        </span>
                        <span className="ac-bd-ai-track" title={`AI 产出占比 ${task.aiRatio}%`}>
                          <span className={`ac-bd-ai-fill ${task.executor === 'human' ? 'ac-bd-ai-fill--human' : ''}`} style={{ width: `${task.aiRatio}%`, background: aiStyle.solid }} />
                        </span>
                        <span className="ac-mono">{task.aiRatio}%</span>
                      </div>
                      <div className="ac-board-card-foot">
                        <span className={`ac-avatar ac-avatar--xs ac-avatar--${owner.avatarColor}`}>{owner.initial}</span>
                        <span className="ac-nowrap">{owner.name}</span>
                        {owner.isAi ? <span className="ac-tag ac-tag--sm ac-tag--ai">AI</span> : null}
                        <span className="ac-ml-auto ac-mono" title={`更新于 ${task.updatedAt}`}>
                          {task.progress}%
                        </span>
                      </div>
                    </div>
                  );
                })}
                {tasks.length === 0 ? <div className="ac-board-empty">该状态暂无工作项</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================
          ③ 任务详情抽屉
         ============================================================ */}
      <Drawer
        open={Boolean(openTask)}
        title={openTask ? openTask.title : ''}
        subtitle={openTask ? `${openTask.code} · ${openRequirement ? openRequirement.code : '发布执行工作项'}` : ''}
        width={720}
        onClose={() => setOpenTaskId('')}
        footer={
          openTask ? (
            <div className="ac-row-between" style={{ width: '100%' }}>
              <span className="ac-muted ac-xs">状态变更仅保存在当前原型会话，不写回平台</span>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setOpenTaskId('')}>
                关闭
              </button>
            </div>
          ) : null
        }
      >
        {openTask ? (
          <div className="ac-col ac-gap-3" data-annotation-id="ai-sdlc-board-page-drawer">
            {/* 状态与标签 */}
            <div className="ac-row ac-row-wrap ac-gap-2">
              {openState ? (
                <span
                  className="ac-tag ac-tag--sm"
                  style={{ background: tone(openState.tone).bg, color: tone(openState.tone).fg, borderColor: tone(openState.tone).bd }}
                >
                  {openState.name}
                </span>
              ) : null}
              <span className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[openTask.priority]}`}>{openTask.priority}</span>
              <span className={`ac-tag ac-tag--sm ac-tag--${TYPE_TONE[openTask.type] ?? 'neutral'}`}>{openTask.type}</span>
              <span className={`ac-tag ac-tag--sm ac-tag--${EXECUTOR_TONE[openTask.executor] ?? 'neutral'}`}>
                <Bot size={10} />
                {EXECUTOR_LABEL[openTask.executor] ?? openTask.executor}
              </span>
              {openTask.critical ? <span className="ac-tag ac-tag--sm ac-tag--danger">关键路径</span> : null}
              {openTask.tags.map((tg) => (
                <span className="ac-tag ac-tag--sm ac-tag--outline" key={tg}>
                  {tg}
                </span>
              ))}
            </div>

            {/* 状态流转（本地演示） */}
            <div>
              <div className="ac-section-title">状态流转</div>
              <div className="ac-bd-state-switch">
                {TASK_STATES.map((s) => {
                  const active = s.id === openStateId;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      className={`ac-bd-state-btn ${active ? 'ac-bd-state-btn--active' : ''}`}
                      onClick={() => switchState(s.id)}
                    >
                      <span className="ac-bd-state-dot" style={{ background: tone(s.tone).solid }} />
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <div className="ac-hint ac-mt-2">
                <Zap size={13} />
                <span>
                  当前「{openState?.name ?? '—'}」的 SLA 为 {openState?.slaHours ?? 0} 小时，由
                  {openState?.driver === 'ai' ? ' AI 自动' : openState?.driver === 'human' ? ' 人工' : ' AI 与人工协作'}推进；
                  允许流转到 {openState && openState.nextStates.length ? openState.nextStates.map((n) => TASK_STATE_MAP[n]?.name ?? n).join('、') : '—'}
                  （PingCode 侧映射为「{openState?.pingcodeName ?? '—'}」）。
                </span>
              </div>
            </div>

            {/* 描述 */}
            <div>
              <div className="ac-section-title">任务描述</div>
              <p className="ac-text-2 ac-sm ac-mb-0">{openTask.desc}</p>
              {openTask.blockedReason ? (
                <div className="ac-hint ac-hint--danger ac-mt-2">
                  <Ban size={13} />
                  <span>受阻原因：{openTask.blockedReason}</span>
                </div>
              ) : null}
            </div>

            {/* 验收标准 */}
            <div>
              <div className="ac-section-title">验收标准{openRequirement ? `（继承自 ${openRequirement.code}）` : ''}</div>
              {openRequirement && openRequirement.acceptanceCriteria.length ? (
                <ol className="ac-bd-criteria">
                  {openRequirement.acceptanceCriteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ol>
              ) : (
                <div className="ac-hint ac-hint--warn">
                  <AlertTriangle size={13} />
                  <span>该工作项为发布执行类工作项，未关联需求级验收标准，验收以发布单检查清单为准。</span>
                </div>
              )}
            </div>

            {/* 关键属性 */}
            <dl className="ac-kv">
              <dt>负责人</dt>
              <dd>
                {USER_MAP[openTask.ownerId].name}
                {USER_MAP[openTask.ownerId].title ? ` · ${USER_MAP[openTask.ownerId].title}` : ''}
              </dd>
              <dt>评审人</dt>
              <dd>{USER_MAP[openTask.reviewerId]?.name ?? '—'}</dd>
              <dt>所属迭代</dt>
              <dd>{SPRINTS.find((s) => s.id === openTask.sprintId)?.name ?? openTask.sprintId}</dd>
              <dt>所属需求</dt>
              <dd>{openRequirement ? `${openRequirement.code} · ${openRequirement.title}` : '—'}</dd>
              <dt>工期</dt>
              <dd>
                {openTask.startDate} ~ {openTask.endDate}
              </dd>
              <dt>工时 / 故事点</dt>
              <dd>
                预估 {openTask.estimateHours}h · 实际 {openTask.actualHours}h · {openTask.points}pt
              </dd>
              <dt>进度</dt>
              <dd>{openTask.progress}%</dd>
              <dt>最近更新</dt>
              <dd className="ac-mono ac-xs">{openTask.updatedAt}</dd>
            </dl>

            {/* 状态流转历史 */}
            <div>
              <div className="ac-section-title">状态流转历史</div>
              {openEvents.length ? (
                <div className="ac-timeline">
                  {openEvents.map((e) => (
                    <div className={`ac-timeline-item ${eventToneClass(e)}`} key={e.id}>
                      <div className="ac-timeline-head">
                        <span className="ac-timeline-title">{e.title}</span>
                        <span className="ac-tag ac-tag--sm ac-tag--outline">{EVENT_KIND_LABEL[e.kind] ?? e.kind}</span>
                        <span className="ac-timeline-time">{e.time}</span>
                        <span className="ac-bd-trace" title="事件追踪标识">
                          {e.id}
                        </span>
                      </div>
                      <div className="ac-timeline-desc">{e.detail}</div>
                      <div className="ac-timeline-extra ac-row ac-row-wrap ac-gap-2">
                        <span className="ac-xs ac-muted">
                          触发者 {actorName(e)}
                          {e.actorType === 'agent' ? '（Agent）' : e.actorType === 'system' ? '（平台）' : '（人工）'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ac-empty ac-empty--sm">
                  <span className="ac-empty-title">暂无流转事件</span>
                  <span className="ac-empty-desc">该工作项尚未产生状态流转记录</span>
                </div>
              )}
            </div>

            {/* 关联提交与 Diff 摘要 */}
            <div>
              <div className="ac-section-title">关联提交与 Diff 摘要</div>
              {openTask.mrId || openTask.branch ? (
                <div className="ac-col ac-gap-2">
                  <div className="ac-bd-commit">
                    <GitCommitHorizontal size={15} style={{ color: 'var(--brand)', flex: '0 0 auto', marginTop: 2 }} />
                    <div className="ac-bd-commit-body">
                      <span className="ac-bd-commit-sha">
                        {openPipeline ? `${openPipeline.commitSha} · ${openPipeline.id}` : openTask.mrId}
                      </span>
                      <span className="ac-bd-commit-msg">
                        {openPipeline ? openPipeline.commitMsg : `${openTask.code} 的代码变更`}
                      </span>
                      <span className="ac-bd-commit-sub">
                        {openTask.branch}
                        {openTask.mrId ? ` · ${openTask.mrId}` : ''}
                        {openPipeline ? ` · ${openPipeline.envId}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="ac-bd-diff">
                    <span className="ac-bd-diff-stat">
                      <FileCode2 size={13} />
                      提交 <strong>{openTask.commits}</strong> 次
                    </span>
                    <span className="ac-bd-diff-stat ac-bd-diff-add">
                      新增 <strong>+{openTask.additions}</strong>
                    </span>
                    <span className="ac-bd-diff-stat ac-bd-diff-del">
                      删除 <strong>-{openTask.deletions}</strong>
                    </span>
                    <span className="ac-bd-diff-stat">
                      <CheckCircle2 size={13} />
                      覆盖率 <strong>{openTask.coverage}%</strong>
                    </span>
                    <span className="ac-bd-diff-ratio">
                      <span className="ac-progress ac-progress--sm" title={`覆盖率 ${openTask.coverage}%`}>
                        <span
                          className={`ac-progress-bar ${openTask.coverage >= 80 ? 'ac-progress-bar--ok' : openTask.coverage >= 60 ? 'ac-progress-bar--warn' : 'ac-progress-bar--danger'}`}
                          style={{ width: `${openTask.coverage}%` }}
                        />
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="ac-hint">
                  <GitBranch size={13} />
                  <span>该工作项尚未产生代码提交与 Diff 记录。</span>
                </div>
              )}
            </div>

            {/* 本地测试结果 */}
            <div>
              <div className="ac-section-title">本地测试与门禁结果</div>
              {openPipeline ? (
                <div className="ac-col ac-gap-2">
                  <div className="ac-row ac-row-wrap ac-gap-2">
                    <span className={`ac-tag ac-tag--sm ac-tag--${PIPELINE_STATUS[openPipeline.status]?.tone ?? 'neutral'}`}>
                      <TestTube2 size={10} />
                      流水线{PIPELINE_STATUS[openPipeline.status]?.label ?? openPipeline.status}
                    </span>
                    <span className="ac-tag ac-tag--sm ac-tag--outline">
                      门禁 {openPipeline.gatesPassed}/{openPipeline.gatesTotal} 通过
                    </span>
                    <span className="ac-tag ac-tag--sm ac-tag--outline">增量覆盖率 {openPipeline.incrementalCoverage}%</span>
                    <span className={`ac-tag ac-tag--sm ${openPipeline.sonarBlocker > 0 ? 'ac-tag--danger' : 'ac-tag--ok'}`}>
                      阻断问题 {openPipeline.sonarBlocker}
                    </span>
                    <span className="ac-muted ac-xs ac-mono">
                      {openPipeline.startedAt} · 耗时 {openPipeline.durationSec}s
                    </span>
                  </div>
                  <div className="ac-bd-test-list">
                    {openPipeline.stages.map((stage) => {
                      const ps = PIPELINE_STATUS[stage.status] ?? PIPELINE_STATUS.waiting;
                      return (
                        <div className="ac-bd-test-row" key={stage.id}>
                          <span className="ac-bd-state-dot" style={{ background: tone(ps.tone).solid }} />
                          <span className="ac-bd-test-name">{stage.name}</span>
                          <span className={`ac-tag ac-tag--sm ac-tag--${ps.tone}`}>{ps.label}</span>
                          <span className="ac-bd-test-log" title={stage.log}>
                            {stage.log}
                          </span>
                          <span className="ac-bd-test-dur">{stage.durationSec}s</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="ac-hint">
                  <TestTube2 size={13} />
                  <span>该工作项尚未触发流水线，暂无本地测试与门禁结果。</span>
                </div>
              )}
            </div>

            {/* Agent 参与记录 */}
            <div>
              <div className="ac-section-title">Agent 参与记录</div>
              {openSession ? (
                <div className="ac-bd-session">
                  <div className="ac-bd-session-head">
                    <span className="ac-tag ac-tag--sm ac-tag--ai">
                      <Sparkles size={10} />
                      {AGENT_NAME[openSession.agentId] ?? openSession.agentId}
                    </span>
                    <span className="ac-tag ac-tag--sm ac-tag--outline">{MODEL_NAME[openSession.modelId] ?? openSession.modelId}</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${SESSION_STATUS[openSession.status]?.tone ?? 'neutral'}`}>
                      {SESSION_STATUS[openSession.status]?.label ?? openSession.status}
                    </span>
                    <span className="ac-muted ac-xs ac-mono">{openSession.id}</span>
                  </div>
                  <div className="ac-bd-session-grid">
                    <div className="ac-bd-session-cell">
                      <span>会话时长</span>
                      <span>{openSession.durationMin} 分钟</span>
                    </div>
                    <div className="ac-bd-session-cell">
                      <span>交互轮次</span>
                      <span>{openSession.turns} 轮</span>
                    </div>
                    <div className="ac-bd-session-cell">
                      <span>建议采纳率</span>
                      <span>{openSession.acceptRate}%</span>
                    </div>
                    <div className="ac-bd-session-cell">
                      <span>人工介入</span>
                      <span>{openSession.humanInterventions} 次</span>
                    </div>
                    <div className="ac-bd-session-cell">
                      <span>变更文件</span>
                      <span>
                        {openSession.filesChanged} 个（+{openSession.additions} / -{openSession.deletions}）
                      </span>
                    </div>
                    <div className="ac-bd-session-cell">
                      <span>工具调用</span>
                      <span>{openSession.toolCalls} 次</span>
                    </div>
                    <div className="ac-bd-session-cell">
                      <span>Token 消耗</span>
                      <span>{openSession.totalTokens.toLocaleString()}</span>
                    </div>
                    <div className="ac-bd-session-cell">
                      <span>成本</span>
                      <span>${openSession.costUsd.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="ac-bd-session-summary">{openSession.summary}</div>
                  {openSession.risks.length ? (
                    <div className="ac-col ac-gap-2">
                      {openSession.risks.map((r) => (
                        <div className="ac-hint ac-hint--warn" key={r}>
                          <AlertTriangle size={13} />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="ac-hint">
                  <Bot size={13} />
                  <span>该工作项由人工完成，未产生 AI 编码会话记录。</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
