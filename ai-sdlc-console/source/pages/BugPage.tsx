/**
 * 缺陷流转 · BugPage
 *
 * 四个标签：缺陷台账（筛选 + 列表 + AI 分析抽屉）、流转分析（状态机 + 时间线 + 瓶颈）、
 * 通知与订阅（规则 + 日志 + 个人订阅）、根因报告（报告清单 + 详情抽屉）。
 * 核心交互：AI 根因分析 → 采纳建议并指派 → 状态流转 + 追加通知日志 + Toast。
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  Bug,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GitBranch,
  GitMerge,
  Layers,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Users,
  Webhook,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  BUGS,
  BUG_ANALYSIS,
  BUG_ANALYSIS_MAP,
  BUG_FLOW_STATS,
  BUG_NOTIFY,
  BUG_NOTIFY_LOGS,
  BUG_NOTIFY_MAP,
  BUG_NOTIFY_STATS,
  BUG_SLA_POLICIES,
  BUG_STATE_FLOW,
  BUG_STATS,
  BUG_TIMELINE_BY_BUG,
  BUG_WATCH_SUBS,
  ENVIRONMENTS,
  TASK_MAP,
  TEST_MODULE_MAP,
  USER_MAP,
  agents,
  models,
} from '../data';
import type { BugAnalysisDef, BugDef, BugNotifyLogDef, Tone } from '../data';
import './bug.css';

/* ============================================================
   类型与常量
   ============================================================ */

type TabId = 'ledger' | 'flow' | 'notify' | 'reports';

/** 缺陷 6 态 → 展示文案与语义色 */
const STATUS_META: Record<BugDef['status'], { label: string; tone: string }> = {
  new: { label: '新建', tone: 'info' },
  analyzing: { label: '分析中', tone: 'brand' },
  fixing: { label: '修复中', tone: 'warn' },
  verifying: { label: '验证中', tone: 'ai' },
  closed: { label: '已关闭', tone: 'ok' },
  reopened: { label: '已重开', tone: 'danger' },
};

const PRIORITY_TONE: Record<BugDef['priority'], string> = {
  P0: 'danger',
  P1: 'warn',
  P2: 'info',
  P3: 'neutral',
};

/**
 * 严重级 → 圆点色（按严重度递减）
 * 资损级 / 致命 / 高危 → danger，严重 → warn，一般 → info，轻微及以下 → text-3。
 * 取值来自 BUGS 的 severity 字段（中文枚举），未登记的严重级回退到最浅色。
 */
const SEVERITY_TONE: Record<string, string> = {
  '资损级（致命）': 'var(--danger)',
  致命: 'var(--danger)',
  '高危（合规）': 'var(--danger)',
  '高危（数据安全）': 'var(--danger)',
  严重: 'var(--warn)',
  一般: 'var(--info)',
  轻微: 'var(--text-3)',
};
const SEVERITY_TONE_FALLBACK = 'var(--text-3)';

/** 严重级筛选 chip 的展示顺序（由重到轻），数据中新增的严重级追加在末尾 */
const SEVERITY_ORDER = ['资损级（致命）', '致命', '高危（合规）', '高危（数据安全）', '严重', '一般', '轻微'];

/** 缺陷来源（BugDef 无 source 字段，由既有字段派生） */
type BugSource = 'auto' | 'monitor' | 'manual';

/** 来源 → 展示文案与 tag 语义色 */
const SOURCE_META: Record<BugSource, { label: string; tone: string }> = {
  auto: { label: '自动化测试', tone: 'ai' },
  monitor: { label: '监控告警', tone: 'warn' },
  manual: { label: '人工', tone: 'neutral' },
};

/** 监控告警线索关键词：命中即判定为「监控发现」，优先于关联用例 */
const MONITOR_KEYWORDS = ['资损告警', '监控告警', '告警触发', '生产告警', '线上告警', '告警平台'];

/** 允许通过「采纳建议并指派」流转到修复中的来源状态（其余状态只改派不改状态） */
const ASSIGNABLE_FROM: BugDef['status'][] = ['new', 'analyzing', 'reopened'];

/** 通知渠道 → 图标与文案 */
const CHANNEL_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  'lark-group': { label: '飞书群', icon: Users, tone: 'info' },
  'lark-card': { label: '飞书卡片', icon: MessageSquare, tone: 'brand' },
  email: { label: '邮件', icon: Mail, tone: 'neutral' },
  webhook: { label: 'Webhook', icon: Webhook, tone: 'ai' },
  sms: { label: '短信', icon: Send, tone: 'warn' },
  phone: { label: '电话', icon: Phone, tone: 'danger' },
};

/** 通知结果 → 语义色 */
const RESULT_TONE: Record<BugNotifyLogDef['result'], { label: string; tone: string }> = {
  sent: { label: '已发送', tone: 'info' },
  acked: { label: '已确认', tone: 'ok' },
  merged: { label: '已合并', tone: 'brand' },
  failed: { label: '发送失败', tone: 'danger' },
  escalated: { label: '已升级', tone: 'warn' },
};

/** 操作者类型 → 展示 */
const ACTOR_META: Record<string, { label: string; tone: string }> = {
  human: { label: '人工', tone: 'info' },
  agent: { label: 'AI Agent', tone: 'ai' },
  system: { label: '系统', tone: 'neutral' },
};

/** 根因报告状态 */
const REPORT_STATUS_TONE: Record<BugAnalysisDef['status'], { label: string; tone: string }> = {
  draft: { label: '草稿', tone: 'neutral' },
  reviewing: { label: '评审中', tone: 'info' },
  approved: { label: '已通过', tone: 'ok' },
  rejected: { label: '已驳回', tone: 'danger' },
};

/** Tone → ac-tag-- 语义色归并（tag 仅支持 7 种） */
function tagTone(tone: Tone): string {
  const map: Record<Tone, string> = {
    brand: 'brand', ai: 'ai', ok: 'ok', warn: 'warn', danger: 'danger',
    info: 'info', neutral: 'neutral', slate: 'neutral', teal: 'ok',
    pink: 'danger', indigo: 'brand', amber: 'warn',
  };
  return map[tone];
}

/** Tone → SVG 颜色变量 */
const TONE_VAR: Record<string, string> = {
  brand: 'var(--brand)', ai: 'var(--ai)', ok: 'var(--ok)', warn: 'var(--warn)',
  danger: 'var(--danger)', info: 'var(--info)', neutral: 'var(--text-3)',
  slate: 'var(--text-3)', teal: 'var(--ok)', pink: 'var(--danger)',
  indigo: 'var(--brand)', amber: 'var(--warn)',
};

/** Tone → 时间线节点色 */
const TIMELINE_TONE: Record<string, string> = {
  ok: 'ok', warn: 'warn', danger: 'danger', ai: 'ai',
  brand: 'ok', info: 'dim', neutral: 'dim', slate: 'dim',
  teal: 'ok', pink: 'danger', indigo: 'dim', amber: 'warn',
};

/* ============================================================
   查表工具
   ============================================================ */

const AGENT_MAP = Object.fromEntries(agents.map((a) => [a.id, a]));
const MODEL_MAP = Object.fromEntries(models.map((m) => [m.id, m]));
const ENV_MAP = Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, e]));

const userName = (id: string) => USER_MAP[id]?.name ?? id;
const userInitial = (id: string) => USER_MAP[id]?.initial ?? id.slice(0, 1);
const userTone = (id: string) => tagTone(USER_MAP[id]?.avatarColor ?? 'neutral');
const moduleName = (id: string) => TEST_MODULE_MAP[id]?.name ?? id;
const envName = (id: string) => ENV_MAP[id]?.code ?? id;
const agentName = (id: string) => AGENT_MAP[id]?.name ?? id;
const modelName = (id: string) => MODEL_MAP[id]?.name ?? id;

/* ============================================================
   派生工具：缺陷来源 / 指派匹配度
   ============================================================ */

/**
 * 派生缺陷来源（BugDef 无 source 字段，只能用既有字段推断）：
 * 1) phenomenon / tags / relatedIds 中出现监控告警线索 → 监控告警
 *    （生产观测先发现，即便事后补了复现用例，来源仍记为监控告警）；
 * 2) 否则关联了测试用例（caseIds 非空）→ 自动化测试（用例失败自动建单）；
 * 3) 否则 → 人工（人工提测 / 评审 / 走查建单）。
 */
function bugSource(b: BugDef): BugSource {
  const clue = [b.phenomenon, ...b.tags, ...b.relatedIds].join(' ');
  if (MONITOR_KEYWORDS.some((k) => clue.includes(k))) return 'monitor';
  if (b.caseIds.length > 0) return 'auto';
  return 'manual';
}

/** 某人当前在制品数（未关闭缺陷条数，含本地覆盖前的原始口径） */
function openWipOf(userId: string): number {
  return BUGS.filter((b) => b.assigneeId === userId && b.status !== 'closed').length;
}

/** 某人历史处理过的同 category 缺陷条数（含本条） */
function sameCategoryHandled(bug: BugDef, userId: string): number {
  return BUGS.filter((b) => b.category === bug.category && b.assigneeId === userId).length;
}

/**
 * 指派匹配度权重（原始分权重，合计 90，经 ASSIGN_WEIGHT_TOTAL 归一化后作为匹配度百分比展示）：
 * - taskOwner   35：本缺陷关联任务的负责人，直接改过相关代码，最强信号；
 * - moduleOwner 25：所属测试模块负责人，熟悉该模块用例与质量口径；
 * - capacity    20：产能，在制品越少分越高，按 wip / WIP_FULL_LOAD 线性衰减；
 * - experience  10：同类缺陷经验，同 category 历史处理例数 × 5，上限 10。
 * 匹配度 = 原始得分 ÷ 权重合计 × 100，四项全部命中时为 100%。
 */
const ASSIGN_WEIGHTS = { taskOwner: 35, moduleOwner: 25, capacity: 20, experience: 10 };
/** 权重合计，作为归一化分母（35 + 25 + 20 + 10 = 90） */
const ASSIGN_WEIGHT_TOTAL =
  ASSIGN_WEIGHTS.taskOwner + ASSIGN_WEIGHTS.moduleOwner + ASSIGN_WEIGHTS.capacity + ASSIGN_WEIGHTS.experience;
/** 在制品达到该条数视为满负荷，产能分归零 */
const WIP_FULL_LOAD = 8;
/** 抽屉内展示的候选人上限 */
const ASSIGN_CANDIDATE_LIMIT = 3;

/** 计算某人对某缺陷的指派匹配度（0~100 的百分比，纯函数；归一化不改变候选人排序） */
function scoreAssignee(bug: BugDef, userId: string): number {
  let raw = 0;
  if (bug.taskIds.some((t) => TASK_MAP[t]?.ownerId === userId)) raw += ASSIGN_WEIGHTS.taskOwner;
  if (TEST_MODULE_MAP[bug.moduleId]?.ownerId === userId) raw += ASSIGN_WEIGHTS.moduleOwner;
  raw += Math.max(0, Math.round(ASSIGN_WEIGHTS.capacity * (1 - openWipOf(userId) / WIP_FULL_LOAD)));
  raw += Math.min(ASSIGN_WEIGHTS.experience, sameCategoryHandled(bug, userId) * 5);
  return Math.round((raw / ASSIGN_WEIGHT_TOTAL) * 100);
}

/** 由命中的权重因子动态生成中文匹配理由（未命中的因子不出现） */
function assignMatchReason(bug: BugDef, userId: string): string {
  const parts: string[] = [];
  const hitTasks = bug.taskIds.filter((t) => TASK_MAP[t]?.ownerId === userId);
  if (hitTasks.length > 0) parts.push(`${hitTasks.join('、')} 负责人`);
  const module = TEST_MODULE_MAP[bug.moduleId];
  if (module?.ownerId === userId) parts.push(`「${module.name}」模块负责人`);
  const handled = sameCategoryHandled(bug, userId);
  if (handled > 0) parts.push(`同类「${bug.category}」缺陷历史处理 ${handled} 例`);
  const wip = openWipOf(userId);
  parts.push(wip <= 2 ? `当前在制品 ${wip} 个，产能可承接` : `当前在制品 ${wip} 个，需评估排期`);
  return parts.join('；');
}

/** 指派候选人（AI 推荐项为匹配度最高者） */
interface AssignCandidate {
  userId: string;
  score: number;
  reason: string;
  wip: number;
  recommended: boolean;
}

/**
 * 生成候选人列表：候选池 = 当前处理人 + 关联任务负责人 + 所属测试模块负责人，
 * 去重并剔除 AI 共享账号（缺陷修复必须指派给真人），按匹配度降序取前 3。
 */
function buildAssignCandidates(bug: BugDef): AssignCandidate[] {
  const pool: string[] = [];
  const push = (id?: string) => {
    if (!id || USER_MAP[id]?.isAi || pool.includes(id)) return;
    pool.push(id);
  };
  push(bug.assigneeId);
  bug.taskIds.forEach((t) => push(TASK_MAP[t]?.ownerId));
  push(TEST_MODULE_MAP[bug.moduleId]?.ownerId);
  return pool
    .map((userId) => ({
      userId,
      score: scoreAssignee(bug, userId),
      reason: assignMatchReason(bug, userId),
      wip: openWipOf(userId),
      recommended: false,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, ASSIGN_CANDIDATE_LIMIT)
    .map((c, i) => ({ ...c, recommended: i === 0 }));
}

/** 采纳指派后的目标状态：仅新建 / 分析中 / 已重开可流转到修复中，其余状态只改派不改状态 */
function nextStatusAfterAssign(fromState: BugDef['status']): BugDef['status'] {
  return ASSIGNABLE_FROM.includes(fromState) ? 'fixing' : fromState;
}

/** 验证中 / 已关闭无对应迁移边，不接受指派；返回空串表示可指派 */
function assignBlockReason(fromState: BugDef['status']): string {
  if (fromState === 'verifying') return '当前处于「验证中」，需验证人复验失败并重开后才能重新指派';
  if (fromState === 'closed') return '已关闭，如需重新指派请先按状态机重开（closed → reopened）';
  return '';
}

/* ============================================================
   AI 分析抽屉主体（台账与根因报告共用）
   ============================================================ */

interface AnalysisBodyProps {
  bug: BugDef;
  analysis?: BugAnalysisDef;
  /** 报告模式下额外展示复现步骤与评审人 */
  asReport?: boolean;
  /** 采纳指派后的本地状态（用于回显） */
  override?: { status: BugDef['status']; assigneeId: string };
  /** 候选指派人（由 buildAssignCandidates 派生，按匹配度降序） */
  candidates: AssignCandidate[];
  /** 选中状态提升到 BugPage，供抽屉 footer 与确认弹窗共享 */
  chosenOptionId: string;
  chosenAssigneeId: string;
  onChooseOption: (optionId: string) => void;
  onChooseAssignee: (userId: string) => void;
  onAdopt: (bug: BugDef, optionId: string, assigneeId: string) => void;
}

function AnalysisBody({
  bug,
  analysis,
  asReport,
  override,
  candidates,
  chosenOptionId,
  chosenAssigneeId,
  onChooseOption,
  onChooseAssignee,
  onAdopt,
}: AnalysisBodyProps) {
  const status = override?.status ?? bug.status;
  const assigneeId = override?.assigneeId ?? bug.assigneeId;
  const canAdopt = Boolean(chosenOptionId) && Boolean(chosenAssigneeId);

  if (!analysis) {
    return (
      <div className="ac-empty">
        <span className="ac-empty-icon"><Bot size={24} /></span>
        <span className="ac-empty-title">AI 根因分析进行中</span>
        <span className="ac-empty-desc">
          {agentName(bug.aiAssist.agentId)} 正在采集日志、调用链与代码上下文，
          预计 {bug.aiAssist.seconds}s 内产出首版归因结论。
        </span>
      </div>
    );
  }

  return (
    <div className="ac-bg-drawer-inner">
      {/* 1. 缺陷摘要 */}
      <section>
        <div className="ac-bg-block-title"><Bug size={14} /> 缺陷摘要</div>
        <div className="ac-row ac-gap-2 ac-wrap ac-mb-2">
          <span className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[bug.priority]}`}>{bug.priority}</span>
          <span className="ac-tag ac-tag--sm ac-tag--danger">{bug.severity}</span>
          <span className="ac-tag ac-tag--sm ac-tag--neutral">{bug.category}</span>
          <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_META[status].tone}`}>
            <span className="ac-tag-dot" />
            {STATUS_META[status].label}
          </span>
          {bug.releaseBlocking && <span className="ac-badge ac-badge--danger">发布阻断</span>}
        </div>
        <dl className="ac-kv">
          <dt>现象</dt><dd className="ac-sm">{bug.phenomenon}</dd>
          <dt>影响</dt><dd className="ac-sm">{bug.impact}</dd>
          <dt>复现率</dt><dd>{analysis.reproduceRate}</dd>
          <dt>环境</dt><dd>{envName(analysis.envId)} · {ENV_MAP[analysis.envId]?.name ?? ''}</dd>
          <dt>处理人</dt>
          <dd>
            <span className="ac-user">
              <span className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(assigneeId)}`}>{userInitial(assigneeId)}</span>
              <span className="ac-user-name">{userName(assigneeId)}</span>
            </span>
          </dd>
          <dt>关联分支</dt><dd className="ac-mono">{bug.branch || '—'}</dd>
          <dt>关联 MR</dt><dd className="ac-mono">{bug.mrId || '—'}</dd>
          <dt>关联流水线</dt><dd className="ac-mono">{bug.pipelineId || '—'}</dd>
          <dt>关联任务</dt>
          <dd>
            <span className="ac-row ac-gap-1 ac-wrap">
              {bug.taskIds.map((t) => (
                <span key={t} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">
                  {TASK_MAP[t]?.code ?? t}
                </span>
              ))}
            </span>
          </dd>
          <dt>关联用例</dt>
          <dd>
            <span className="ac-row ac-gap-1 ac-wrap">
              {bug.caseIds.map((c) => (
                <span key={c} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{c}</span>
              ))}
            </span>
          </dd>
        </dl>
      </section>

      {/* 2. AI 归因结论 */}
      <section>
        <div className="ac-bg-block-title"><Sparkles size={14} /> AI 归因结论</div>
        <div className="ac-hint ac-hint--ai">
          <Bot size={14} />
          <div className="ac-col ac-gap-1">
            <strong>{agentName(analysis.agentId)} · {modelName(analysis.modelId)} · 置信度 {analysis.confidence}%</strong>
            <span className="ac-sm">{bug.aiAssist.summary}</span>
            <span className="ac-xs">
              耗时 {bug.aiAssist.seconds}s · 人工确认：
              {bug.aiAssist.humanConfirmedBy
                ? `${userName(bug.aiAssist.humanConfirmedBy)} @ ${bug.aiAssist.humanConfirmedAt}`
                : '待确认'}
            </span>
          </div>
        </div>
        <div className="ac-mt-2 ac-sm ac-lh"><strong>根因小结：</strong>{analysis.rootCauseSummary}</div>
      </section>

      {/* 3. 五问法 */}
      <section>
        <div className="ac-bg-block-title"><Target size={14} /> 5-Why 失败归因</div>
        <div className="ac-bg-why">
          {analysis.whys.map((w) => (
            <div key={w.level} className="ac-bg-why-item">
              <span className="ac-bg-why-idx">{w.level}</span>
              <div className="ac-bg-why-body">
                <div className="ac-bg-why-q">{w.question}</div>
                <div className="ac-bg-why-a">{w.answer}</div>
                <div className="ac-bg-why-ev">证据：{w.evidence}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 疑似问题代码位置 */}
      <section>
        <div className="ac-bg-block-title"><GitBranch size={14} /> 疑似问题代码位置</div>
        <div className="ac-bg-code-loc ac-mb-2">
          <ExternalLink size={12} />
          {analysis.codeLocation}
        </div>
        <div className="ac-grid-2">
          <div className="ac-code ac-code--light">
            <div className="ac-code-head">
              <span className="ac-code-title">修复前</span>
              <span className="ac-code-lang">{analysis.codeLang}</span>
            </div>
            <div className="ac-code-body">{analysis.codeBefore.join('\n')}</div>
          </div>
          <div className="ac-code ac-code--light">
            <div className="ac-code-head">
              <span className="ac-code-title">修复后</span>
              <span className="ac-code-lang">{analysis.codeLang}</span>
            </div>
            <div className="ac-code-body">{analysis.codeAfter.join('\n')}</div>
          </div>
        </div>
      </section>

      {/* 5. 发生链路 */}
      <section>
        <div className="ac-bg-block-title"><Activity size={14} /> 缺陷发生链路</div>
        <div className="ac-flow-v">
          {analysis.occurChain.map((step, i) => (
            <div key={step.seq} className="ac-flow-v-node">
              <div className="ac-flow-v-rail">
                <span
                  className={`ac-flow-v-dot ${step.tone === 'danger' ? 'ac-flow-v-dot--failed' : step.tone === 'warn' ? 'ac-flow-v-dot--running' : 'ac-flow-v-dot--ok'}`}
                >
                  {step.seq}
                </span>
                {i < analysis.occurChain.length - 1 && <span className="ac-flow-v-line" />}
              </div>
              <div className="ac-flow-v-body">
                <div className="ac-flow-v-title">{step.where}</div>
                <div className="ac-flow-v-desc">{step.what}</div>
                <div className="ac-timeline-time">{step.at}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 影响面 */}
      <section>
        <div className="ac-bg-block-title"><Layers size={14} /> 影响面评估</div>
        <div className="ac-bg-impact">
          {analysis.impactScope.map((d) => (
            <div key={d.dim} className="ac-bg-impact-item">
              <span className="ac-bg-impact-dim">{d.dim}</span>
              <span className="ac-bg-impact-value" style={{ color: TONE_VAR[d.tone] }}>{d.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 7. 建议指派人（候选人由模块负责人 / 关联任务负责人 / 当前处理人派生，按匹配度降序） */}
      <section>
        <div className="ac-bg-block-title"><Users size={14} /> 建议指派人</div>
        <div className="ac-bg-assign-list">
          {candidates.map((c) => {
            const chosen = chosenAssigneeId === c.userId;
            return (
              <div
                key={c.userId}
                className={`ac-bg-assign-card${chosen ? ' ac-bg-assign-card--chosen' : ''}`}
                onClick={() => onChooseAssignee(c.userId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChooseAssignee(c.userId); }}
              >
                <div className="ac-bg-assign-head">
                  <span className={`ac-avatar ac-avatar--sm ac-avatar--${userTone(c.userId)}`}>{userInitial(c.userId)}</span>
                  <span className="ac-col ac-gap-0 ac-bg-assign-id">
                    <span className="ac-semi">{userName(c.userId)}</span>
                    <span className="ac-xs ac-muted">
                      {USER_MAP[c.userId]?.title ?? ''} · {USER_MAP[c.userId]?.dept ?? ''}
                    </span>
                  </span>
                  <span className="ac-bg-assign-score">
                    匹配度 <strong>{c.score}%</strong>
                  </span>
                  {c.recommended && <span className="ac-tag ac-tag--sm ac-tag--brand"><Sparkles size={10} /> AI 推荐</span>}
                  {chosen && <span className="ac-tag ac-tag--sm ac-tag--ok"><CheckCircle2 size={10} /> 已选</span>}
                </div>
                <div className="ac-bg-assign-reason">{c.reason}</div>
                <div className="ac-bg-assign-meta">
                  <span>当前在制品 {c.wip} 个</span>
                  <span className="ac-bg-kpi-foot-divider" />
                  <span>本迭代承接 {USER_MAP[c.userId]?.capacity ?? 0} 故事点</span>
                  {c.userId === bug.assigneeId && (
                    <>
                      <span className="ac-bg-kpi-foot-divider" />
                      <span>当前处理人</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {candidates.length === 0 && (
          <div className="ac-xs ac-muted">未匹配到候选指派人，请在缺陷台账中手动改派</div>
        )}
      </section>

      {/* 8. 修复方案候选 */}
      <section>
        <div className="ac-bg-block-title"><Zap size={14} /> 修复方案候选</div>
        <div className="ac-bg-fix-list">
          {analysis.fixOptions.map((opt) => {
            const chosen = chosenOptionId === opt.id;
            return (
              <div
                key={opt.id}
                className={`ac-bg-fix-card${chosen ? ' ac-bg-fix-card--chosen' : ''}`}
                onClick={() => onChooseOption(opt.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChooseOption(opt.id); }}
              >
                <div className="ac-bg-fix-head">
                  <span className="ac-semi">{opt.name}</span>
                  {opt.recommended && <span className="ac-tag ac-tag--sm ac-tag--brand">推荐</span>}
                  <span className={`ac-tag ac-tag--sm ac-tag--${opt.riskLevel === '高' ? 'danger' : opt.riskLevel === '中' ? 'warn' : 'ok'}`}>
                    风险 {opt.riskLevel}
                  </span>
                  {chosen && <span className="ac-tag ac-tag--sm ac-tag--ok"><CheckCircle2 size={10} /> 已选</span>}
                </div>
                <div className="ac-bg-fix-desc">{opt.desc}</div>
                <div className="ac-bg-fix-stats">
                  <div className="ac-bg-fix-stat">
                    <span className="ac-bg-fix-stat-label">预计工时</span>
                    <span className="ac-bg-fix-stat-value">{opt.effortHours}h</span>
                  </div>
                  <div className="ac-bg-fix-stat">
                    <span className="ac-bg-fix-stat-label">覆盖率增益</span>
                    <span className="ac-bg-fix-stat-value">+{opt.coverageGain}pp</span>
                  </div>
                  <div className="ac-bg-fix-stat">
                    <span className="ac-bg-fix-stat-label">风险等级</span>
                    <span className="ac-bg-fix-stat-value">{opt.riskLevel}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="ac-mt-3">
          <button
            type="button"
            className="ac-btn ac-btn--primary ac-btn--sm"
            disabled={!canAdopt}
            onClick={() => onAdopt(bug, chosenOptionId, chosenAssigneeId)}
          >
            <Sparkles size={13} /> 采纳建议并指派
          </button>
          {!canAdopt && (
            <span className="ac-xs ac-muted" style={{ marginLeft: 8 }}>
              {chosenOptionId ? '请先选择一位建议指派人' : '请先选择一个修复方案'}
            </span>
          )}
        </div>
      </section>

      {/* 9. 验证方案与预防动作 */}
      <div className="ac-grid-2">
        <section>
          <div className="ac-bg-block-title"><Shield size={14} /> 验证方案</div>
          <div className="ac-bg-step-list">
            {analysis.verificationPlan.map((v, i) => (
              <div key={i} className="ac-bg-step-item">
                <span className="ac-bg-step-idx">{i + 1}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="ac-bg-block-title"><RotateCcw size={14} /> 预防动作</div>
          <div className="ac-bg-step-list">
            {analysis.prevention.map((p, i) => (
              <div key={i} className="ac-bg-step-item">
                <span className="ac-bg-step-idx">{i + 1}</span>
                <span>
                  <span className="ac-tag ac-tag--sm ac-tag--outline">{p.type}</span>{' '}
                  {p.action}
                  <span className="ac-xs ac-muted"> · {userName(p.ownerId)} · {p.dueDate}{p.kbId ? ` · ${p.kbId}` : ''}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 10. 报告模式追加：复现步骤与评审人 */}
      {asReport && (
        <section>
          <div className="ac-bg-block-title"><FileText size={14} /> 复现步骤与评审</div>
          <div className="ac-bg-step-list ac-mb-3">
            {analysis.reproduceSteps.map((s, i) => (
              <div key={i} className="ac-bg-step-item">
                <span className="ac-bg-step-idx">{i + 1}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div className="ac-bg-report-meta">
            <div className="ac-col ac-gap-1">
              <span className="ac-xs ac-muted">报告版本</span>
              <span className="ac-sm ac-semi">{analysis.version}</span>
            </div>
            <div className="ac-col ac-gap-1">
              <span className="ac-xs ac-muted">评审人</span>
              <span className="ac-avatar-group">
                {analysis.reviewerIds.map((r) => (
                  <span key={r} className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(r)}`} title={userName(r)}>
                    {userInitial(r)}
                  </span>
                ))}
              </span>
            </div>
            <div className="ac-col ac-gap-1">
              <span className="ac-xs ac-muted">创建时间</span>
              <span className="ac-sm">{analysis.createdAt}</span>
            </div>
            <div className="ac-col ac-gap-1">
              <span className="ac-xs ac-muted">更新时间</span>
              <span className="ac-sm">{analysis.updatedAt}</span>
            </div>
            <div className="ac-col ac-gap-1">
              <span className="ac-xs ac-muted">文档路径</span>
              <span className="ac-mono ac-xs">{analysis.docPath}</span>
            </div>
            <div className="ac-col ac-gap-1">
              <span className="ac-xs ac-muted">关联对象</span>
              <span className="ac-mono ac-xs">{analysis.relatedIds.join(' · ')}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   主组件
   ============================================================ */

export default function BugPage() {
  const [tab, setTab] = useState<TabId>('ledger');

  /* ---- 台账筛选 ---- */
  const [keyword, setKeyword] = useState('');
  const [fPriority, setFPriority] = useState<string>('');
  const [fSeverity, setFSeverity] = useState<string>('');
  const [fStatus, setFStatus] = useState<string>('');
  const [fAssignee, setFAssignee] = useState<string>('');
  const [blockingOnly, setBlockingOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ---- 本地状态覆盖（采纳指派后生效） ---- */
  const [overrides, setOverrides] = useState<Record<string, { status: BugDef['status']; assigneeId: string }>>({});
  const [extraLogs, setExtraLogs] = useState<BugNotifyLogDef[]>([]);

  /* ---- 抽屉 ---- */
  const [drawerBug, setDrawerBug] = useState<BugDef | null>(null);
  const [drawerMode, setDrawerMode] = useState<'analysis' | 'report'>('analysis');
  const [drawerOpen, setDrawerOpen] = useState(false);
  /* 抽屉内的方案 / 指派人选中态提升到这里，footer 与确认弹窗与抽屉正文共享同一份 */
  const [chosenOptionId, setChosenOptionId] = useState('');
  const [chosenAssigneeId, setChosenAssigneeId] = useState('');

  /* ---- 指派确认弹窗 ---- */
  const [adoptModal, setAdoptModal] = useState<{
    bug: BugDef;
    optionId: string;
    assigneeId: string;
    score: number;
    reason: string;
  } | null>(null);

  /* ---- 通知规则开关 ---- */
  const [ruleEnabled, setRuleEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(BUG_NOTIFY.map((r) => [r.id, r.enabled])),
  );

  /* ---- 流转分析：选中的缺陷 ---- */
  const [timelineBugId, setTimelineBugId] = useState('BUG-1043');

  /* ---- Toast ---- */
  const [toast, setToast] = useState<{ msg: string; tone: string } | null>(null);
  const showToast = useCallback((msg: string, tone: string) => {
    setToast({ msg, tone });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  /* ============================================================
     派生数据
     ============================================================ */

  /** 应用本地覆盖后的缺陷列表 */
  const liveBugs = useMemo<BugDef[]>(
    () => BUGS.map((b) => (overrides[b.id] ? { ...b, ...overrides[b.id] } : b)),
    [overrides],
  );

  const filteredBugs = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return liveBugs.filter((b) => {
      if (kw && !`${b.id} ${b.pcCode} ${b.title}`.toLowerCase().includes(kw)) return false;
      if (fPriority && b.priority !== fPriority) return false;
      if (fSeverity && b.severity !== fSeverity) return false;
      if (fStatus && b.status !== fStatus) return false;
      if (fAssignee && b.assigneeId !== fAssignee) return false;
      if (blockingOnly && !b.releaseBlocking) return false;
      return true;
    });
  }, [liveBugs, keyword, fPriority, fSeverity, fStatus, fAssignee, blockingOnly]);

  /** 严重级筛选项（由重到轻，带条数计数） */
  const severityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    liveBugs.forEach((b) => counts.set(b.severity, (counts.get(b.severity) ?? 0) + 1));
    const known = SEVERITY_ORDER.filter((s) => counts.has(s));
    const extra = Array.from(counts.keys()).filter((s) => !SEVERITY_ORDER.includes(s));
    return [...known, ...extra].map((s) => ({ severity: s, count: counts.get(s) ?? 0 }));
  }, [liveBugs]);

  /** 台账行：附带派生出的来源标签，避免在 JSX 中重复调用 bugSource */
  const ledgerRows = useMemo(
    () => filteredBugs.map((bug) => ({ bug, source: bugSource(bug) })),
    [filteredBugs],
  );

  /** 抽屉对应缺陷的候选指派人 */
  const drawerCandidates = useMemo<AssignCandidate[]>(
    () => (drawerBug ? buildAssignCandidates(drawerBug) : []),
    [drawerBug],
  );

  const assigneeOptions = useMemo(() => {
    const ids = Array.from(new Set(BUGS.map((b) => b.assigneeId)));
    return ids.map((id) => ({ id, name: userName(id) }));
  }, []);

  const allLogs = useMemo(
    () => [...extraLogs, ...BUG_NOTIFY_LOGS],
    [extraLogs],
  );

  /** 状态分布（应用覆盖后重算） */
  const liveStatusCounts = useMemo(() => {
    const acc: Record<string, number> = { new: 0, analyzing: 0, fixing: 0, verifying: 0, closed: 0, reopened: 0 };
    liveBugs.forEach((b) => { acc[b.status] = (acc[b.status] ?? 0) + 1; });
    return acc;
  }, [liveBugs]);

  /** 阶段耗时条形图数据 */
  const stageBars = [
    { label: '检出→分析', value: BUG_FLOW_STATS.avgDetectToAnalyzeHours, tone: 'info' },
    { label: '分析→修复', value: BUG_FLOW_STATS.avgAnalyzeToFixHours, tone: 'brand' },
    { label: '修复→验证', value: BUG_FLOW_STATS.avgFixToVerifyHours, tone: 'danger' },
    { label: '验证→关闭', value: BUG_FLOW_STATS.avgVerifyToCloseHours, tone: 'ok' },
  ];
  const stageMax = Math.max(...stageBars.map((s) => s.value), 1);

  const timelineEvents = useMemo(() => {
    const list = BUG_TIMELINE_BY_BUG[timelineBugId] ?? [];
    return [...list].sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [timelineBugId]);

  /* ============================================================
     交互处理
     ============================================================ */

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === filteredBugs.length ? new Set() : new Set(filteredBugs.map((b) => b.id)),
    );
  };

  /**
   * 每次打开抽屉都重置选中态：修复方案取报告的 chosenOptionId，
   * 指派人取匹配度最高的候选人（即 AI 推荐项）。
   */
  const resetDrawerSelection = (bug: BugDef | null) => {
    setChosenOptionId(bug ? BUG_ANALYSIS_MAP[bug.id]?.chosenOptionId ?? '' : '');
    setChosenAssigneeId(bug ? buildAssignCandidates(bug)[0]?.userId ?? '' : '');
  };

  const openAnalysis = (bug: BugDef) => {
    setDrawerBug(bug);
    setDrawerMode('analysis');
    resetDrawerSelection(bug);
    setDrawerOpen(true);
  };

  const openReport = (analysis: BugAnalysisDef) => {
    const bug = BUGS.find((b) => b.id === analysis.bugId) ?? null;
    setDrawerBug(bug);
    setDrawerMode('report');
    resetDrawerSelection(bug);
    setDrawerOpen(true);
  };

  /** 「采纳建议并指派」→ 弹确认框（匹配度与理由按选中候选人实时派生） */
  const handleAdoptRequest = (bug: BugDef, optionId: string, assigneeId: string) => {
    if (!optionId || !assigneeId) return;
    const candidate = buildAssignCandidates(bug).find((c) => c.userId === assigneeId);
    setAdoptModal({
      bug,
      optionId,
      assigneeId,
      score: candidate?.score ?? scoreAssignee(bug, assigneeId),
      reason: candidate?.reason ?? assignMatchReason(bug, assigneeId),
    });
  };

  /** 确认指派 → 按状态机流转 + 追加通知日志 + Toast */
  const confirmAdopt = () => {
    if (!adoptModal) return;
    const { bug, optionId, assigneeId } = adoptModal;
    const fromState = overrides[bug.id]?.status ?? bug.status;
    const blocked = assignBlockReason(fromState);

    /* 验证中 / 已关闭无对应迁移边：不改数据，只给出告警 */
    if (blocked) {
      setAdoptModal(null);
      showToast(`${bug.id} ${blocked}`, 'warn');
      return;
    }

    const toState = nextStatusAfterAssign(fromState);
    const option = BUG_ANALYSIS_MAP[bug.id]?.fixOptions.find((o) => o.id === optionId);

    setOverrides((prev) => ({ ...prev, [bug.id]: { status: toState, assigneeId } }));

    const logId = `BNL-LOCAL-${Date.now()}`;
    const now = '2026-03-19 18:20';
    setExtraLogs((prev) => [
      {
        id: logId,
        notifyId: 'BN-05',
        bugId: bug.id,
        event: 'bug.assigned',
        time: now,
        title: `【AI 指派】${bug.id} ${bug.title}｜采纳方案「${option?.name ?? optionId}」｜指派给 ${userName(assigneeId)}`,
        receivers: [assigneeId],
        channel: 'lark-card',
        result: 'sent',
        ackBy: '',
        ackAt: '',
        timelineId: `BT-LOCAL-${logId}`,
        refIds: [bug.mrId || bug.pipelineId || bug.moduleId].filter(Boolean),
      },
      ...prev,
    ]);

    setAdoptModal(null);
    setDrawerOpen(false);
    showToast(
      toState === fromState
        ? `已改派给 ${userName(assigneeId)}，状态保持「${STATUS_META[fromState].label}」`
        : `已指派给 ${userName(assigneeId)}，状态流转 ${STATUS_META[fromState].label} → ${STATUS_META[toState].label}`,
      'ok',
    );
  };

  /* ---- 指派确认弹窗的派生信息 ---- */
  const adoptFromState = adoptModal ? overrides[adoptModal.bug.id]?.status ?? adoptModal.bug.status : null;
  const adoptBlocked = adoptFromState ? assignBlockReason(adoptFromState) : '';
  const adoptToState = adoptFromState ? nextStatusAfterAssign(adoptFromState) : null;

  /* ============================================================
     JSX
     ============================================================ */
  return (
    <div className="ac-bg" data-annotation-id="ai-sdlc-bug-page">
      {/* ---- 页头 ---- */}
      <div className="ac-page-head">
        <div>
          <h2 className="ac-page-title">缺陷流转</h2>
          <p className="ac-page-desc">缺陷台账、AI 根因分析与流转追踪</p>
        </div>
        <div className="ac-page-actions">
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => showToast('新建缺陷表单已打开（原型示意）', 'info')}>
            <Plus size={14} /> 新建缺陷
          </button>
          <button type="button" className="ac-btn ac-btn--sm" onClick={() => setTab('notify')}>
            <Settings2 size={14} /> 订阅通知设置
          </button>
        </div>
      </div>

      {/* ---- KPI ---- */}
      <div className="ac-metric-grid">
        <div className="ac-metric">
          <div className="ac-metric-head">
            <span className="ac-metric-label">缺陷总数</span>
            <span className="ac-metric-icon"><Bug size={15} /></span>
          </div>
          <div className="ac-metric-value">{BUG_STATS.total}</div>
          <div className="ac-metric-foot">已关闭 {BUG_STATS.closed} · 未关闭 {BUG_STATS.open}</div>
        </div>
        <div className="ac-metric ac-metric--danger">
          <div className="ac-metric-head">
            <span className="ac-metric-label">P0 未关闭</span>
            <span className="ac-metric-icon"><AlertTriangle size={15} /></span>
          </div>
          <div className="ac-metric-value">{BUG_STATS.byPriority.P0.open}</div>
          <div className="ac-metric-foot">P1 未关闭 {BUG_STATS.byPriority.P1.open}</div>
        </div>
        <div className="ac-metric ac-metric--warn">
          <div className="ac-metric-head">
            <span className="ac-metric-label">发布阻断</span>
            <span className="ac-metric-icon"><Shield size={15} /></span>
          </div>
          <div className="ac-metric-value">{BUG_STATS.releaseBlocking}</div>
          <div className="ac-metric-foot">全部计入 G4 门禁 actual</div>
        </div>
        <div className="ac-metric ac-metric--warn">
          <div className="ac-metric-head">
            <span className="ac-metric-label">SLA 超时</span>
            <span className="ac-metric-icon"><Timer size={15} /></span>
          </div>
          <div className="ac-metric-value">{BUG_FLOW_STATS.slaBreachedCount}</div>
          <div className="ac-metric-foot">超时率 {BUG_FLOW_STATS.slaBreachRate}%</div>
        </div>
        <div className="ac-metric ac-metric--ai">
          <div className="ac-metric-head">
            <span className="ac-metric-label">AI 首次命中率</span>
            <span className="ac-metric-icon"><Sparkles size={15} /></span>
          </div>
          <div className="ac-metric-value">
            {BUG_FLOW_STATS.aiFirstHitRate}
            <span className="ac-metric-unit">%</span>
          </div>
          <div className="ac-metric-foot">{BUG_FLOW_STATS.aiFirstHitCount} / {BUG_FLOW_STATS.aiInvolvedCount} 例</div>
        </div>
        <div className="ac-metric ac-metric--info">
          <div className="ac-metric-head">
            <span className="ac-metric-label">平均修复时长</span>
            <span className="ac-metric-icon"><Clock size={15} /></span>
          </div>
          <div className="ac-metric-value">
            {BUG_FLOW_STATS.avgDetectToCloseHours}
            <span className="ac-metric-unit">h</span>
          </div>
          <div className="ac-metric-foot">重开 {BUG_FLOW_STATS.reopenCount} 次 · 瓶颈 {BUG_FLOW_STATS.bottleneck}</div>
        </div>
      </div>

      {/* ---- 标签栏 ---- */}
      <div className="ac-tabs">
        <button className={`ac-tab${tab === 'ledger' ? ' ac-tab--active' : ''}`} onClick={() => setTab('ledger')}>
          缺陷台账 <span className="ac-tab-count">{BUGS.length}</span>
        </button>
        <button className={`ac-tab${tab === 'flow' ? ' ac-tab--active' : ''}`} onClick={() => setTab('flow')}>
          流转分析 <span className="ac-tab-count">{BUG_FLOW_STATS.eventTotal}</span>
        </button>
        <button className={`ac-tab${tab === 'notify' ? ' ac-tab--active' : ''}`} onClick={() => setTab('notify')}>
          通知与订阅 <span className="ac-tab-count">{BUG_NOTIFY.length}</span>
        </button>
        <button className={`ac-tab${tab === 'reports' ? ' ac-tab--active' : ''}`} onClick={() => setTab('reports')}>
          根因报告 <span className="ac-tab-count">{BUG_ANALYSIS.length}</span>
        </button>
      </div>

      {/* ============================================================
           标签 1：缺陷台账
           ============================================================ */}
      {tab === 'ledger' && (
        <>
          <div className="ac-search-card" data-annotation-id="ai-sdlc-bug-filters">
            <div className="ac-field">
              <span className="ac-field-label">关键字</span>
              <div className="ac-row ac-gap-2">
                <Search size={14} className="ac-muted" />
                <input
                  className="ac-input ac-input--sm"
                  style={{ width: 220 }}
                  placeholder="缺陷编号 / PingCode 编号 / 标题"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
            </div>
            <div className="ac-field">
              <span className="ac-field-label">优先级</span>
              <div className="ac-bg-chip-row">
                <button
                  type="button"
                  className={`ac-bg-chip${fPriority === '' ? ' ac-bg-chip--active' : ''}`}
                  onClick={() => setFPriority('')}
                >
                  全部 <span className="ac-bg-chip-count">{liveBugs.length}</span>
                </button>
                {(['P0', 'P1', 'P2', 'P3'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`ac-bg-chip${fPriority === p ? ' ac-bg-chip--active' : ''}`}
                    onClick={() => setFPriority(fPriority === p ? '' : p)}
                  >
                    <span className="ac-bg-chip-dot" style={{ background: TONE_VAR[PRIORITY_TONE[p]] }} />
                    {p} <span className="ac-bg-chip-count">{BUG_STATS.byPriority[p].total}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ac-field">
              <span className="ac-field-label">严重级</span>
              <div className="ac-bg-chip-row">
                <button
                  type="button"
                  className={`ac-bg-chip${fSeverity === '' ? ' ac-bg-chip--active' : ''}`}
                  onClick={() => setFSeverity('')}
                >
                  全部 <span className="ac-bg-chip-count">{liveBugs.length}</span>
                </button>
                {severityOptions.map((o) => (
                  <button
                    key={o.severity}
                    type="button"
                    className={`ac-bg-chip${fSeverity === o.severity ? ' ac-bg-chip--active' : ''}`}
                    onClick={() => setFSeverity(fSeverity === o.severity ? '' : o.severity)}
                  >
                    <span className="ac-bg-chip-dot" style={{ background: SEVERITY_TONE[o.severity] ?? SEVERITY_TONE_FALLBACK }} />
                    {o.severity} <span className="ac-bg-chip-count">{o.count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ac-field">
              <span className="ac-field-label">状态</span>
              <select
                className="ac-select ac-select--sm"
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value)}
              >
                <option value="">全部状态</option>
                {(Object.keys(STATUS_META) as BugDef['status'][]).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}（{liveStatusCounts[s]}）</option>
                ))}
              </select>
            </div>
            <div className="ac-field">
              <span className="ac-field-label">指派给</span>
              <select
                className="ac-select ac-select--sm"
                value={fAssignee}
                onChange={(e) => setFAssignee(e.target.value)}
              >
                <option value="">全部处理人</option>
                {assigneeOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="ac-field ac-field--inline">
              <span className="ac-field-label">仅看发布阻断</span>
              <button
                type="button"
                className={`ac-bg-switch${blockingOnly ? ' ac-bg-switch--on' : ''}`}
                onClick={() => setBlockingOnly(!blockingOnly)}
                aria-label="仅看发布阻断"
              />
            </div>
            <div className="ac-search-card-actions">
              <button
                type="button"
                className="ac-btn ac-btn--text ac-btn--sm"
                onClick={() => {
                  setKeyword(''); setFPriority(''); setFSeverity(''); setFStatus(''); setFAssignee(''); setBlockingOnly(false);
                }}
              >
                重置筛选
              </button>
            </div>
          </div>

          <div className="ac-card ac-card--flat" data-annotation-id="ai-sdlc-bug-list">
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>
                        <input
                          type="checkbox"
                          checked={filteredBugs.length > 0 && selected.size === filteredBugs.length}
                          onChange={toggleAll}
                          aria-label="全选"
                        />
                      </th>
                      <th style={{ width: 100 }}>编号</th>
                      <th style={{ minWidth: 200 }}>标题</th>
                      <th style={{ width: 96 }}>严重级</th>
                      <th style={{ width: 54 }}>优先级</th>
                      <th style={{ width: 82 }}>状态</th>
                      <th style={{ width: 92 }}>来源</th>
                      <th style={{ width: 84 }}>分类</th>
                      <th style={{ width: 128 }}>发现环境 / 分支</th>
                      <th style={{ width: 96 }}>指派给</th>
                      <th style={{ width: 68 }}>SLA</th>
                      <th style={{ width: 104 }}>发现时间</th>
                      <th style={{ width: 52 }}>阻断</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map(({ bug: b, source }) => (
                      <tr
                        key={b.id}
                        className={selected.has(b.id) ? 'ac-table-row--selected' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => openAnalysis(b)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(b.id)}
                            onChange={() => toggleSelect(b.id)}
                            aria-label={`选择 ${b.id}`}
                          />
                        </td>
                        <td>
                          <div className="ac-bg-bug-title">
                            <span className="ac-mono ac-xs ac-bold">{b.id}</span>
                            <span className="ac-bg-bug-sub">{b.pcCode}</span>
                          </div>
                        </td>
                        <td>
                          <span className="ac-bg-cell ac-bg-cell--wide" title={b.title}>{b.title}</span>
                        </td>
                        <td className="ac-xs">{b.severity}</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[b.priority]}`}>{b.priority}</span>
                        </td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_META[b.status].tone}`}>
                            <span className="ac-tag-dot" />
                            {STATUS_META[b.status].label}
                          </span>
                        </td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${SOURCE_META[source].tone}`}>
                            {source === 'auto' && <Bot size={10} style={{ marginRight: 3 }} />}
                            {SOURCE_META[source].label}
                          </span>
                        </td>
                        <td><span className="ac-bg-cell ac-bg-cell--sm ac-xs" title={b.category}>{b.category}</span></td>
                        <td>
                          <div className="ac-bg-bug-title">
                            <span className="ac-xs">{envName(b.envId)}</span>
                            <span className="ac-bg-bug-sub ac-mono">{b.branch || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="ac-user">
                            <span className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(b.assigneeId)}`}>
                              {userInitial(b.assigneeId)}
                            </span>
                            <span className="ac-user-name">{userName(b.assigneeId)}</span>
                          </span>
                        </td>
                        <td>
                          {b.slaLeftHours < 0 ? (
                            <span className="ac-xs ac-bold ac-danger-text">已超时</span>
                          ) : (
                            <span className="ac-xs ac-tnum">剩 {b.slaLeftHours}h</span>
                          )}
                        </td>
                        <td className="ac-xs ac-tnum">{b.foundAt}</td>
                        <td className="ac-td-center">
                          {b.releaseBlocking ? <span className="ac-badge ac-badge--danger">阻</span> : <span className="ac-muted ac-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredBugs.length === 0 && (
                <div className="ac-empty ac-empty--sm">
                  <span className="ac-empty-icon"><Search size={22} /></span>
                  <span className="ac-empty-title">无匹配缺陷</span>
                  <span className="ac-empty-desc">调整关键字或筛选条件后重试</span>
                </div>
              )}
              <div className="ac-table-foot">
                <span>共 {filteredBugs.length} 条 / 已选 {selected.size} 条</span>
                <div className="ac-table-foot-pages">
                  <button type="button" className="ac-page-btn ac-page-btn--active">1</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================
           标签 2：流转分析
           ============================================================ */}
      {tab === 'flow' && (
        <div data-annotation-id="ai-sdlc-bug-flow">
          <div className="ac-hint ac-hint--warn ac-mb-3">
            <AlertTriangle size={14} />
            <div>
              <strong>当前瓶颈：{BUG_FLOW_STATS.bottleneck}</strong>
              <div className="ac-sm">{BUG_FLOW_STATS.bottleneckReason}</div>
              <div className="ac-xs">{BUG_FLOW_STATS.note}</div>
            </div>
          </div>

          <div className="ac-grid-2 ac-mb-3">
            {/* 阶段耗时 */}
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><TrendingUp size={15} /> 各阶段平均耗时（小时）</span>
              </div>
              <div className="ac-card-body">
                <svg className="ac-bg-chart" viewBox="0 0 460 160" height="160">
                  {stageBars.map((s, i) => {
                    const w = (s.value / stageMax) * 300;
                    const y = 10 + i * 36;
                    return (
                      <g key={s.label}>
                        <text className="ac-bg-chart-label" x={92} y={y + 14} textAnchor="end">{s.label}</text>
                        <rect className="ac-bg-chart-track" x={100} y={y} width={300} height={20} rx={4} />
                        <rect x={100} y={y} width={w} height={20} rx={4} fill={TONE_VAR[s.tone]} opacity={0.88} />
                        <text className="ac-bg-chart-value" x={106 + w} y={y + 14}>{s.value}h</text>
                      </g>
                    );
                  })}
                </svg>
                <div className="ac-divider" />
                <div className="ac-bg-kpi-foot ac-row-wrap ac-gap-3">
                  <span className="ac-xs">事件总数 <strong>{BUG_FLOW_STATS.eventTotal}</strong></span>
                  <span className="ac-bg-kpi-foot-divider" />
                  <span className="ac-xs">自动流转 <strong>{BUG_FLOW_STATS.autoFlowCount}</strong>（{BUG_FLOW_STATS.autoFlowRate}%）</span>
                  <span className="ac-bg-kpi-foot-divider" />
                  <span className="ac-xs">AI 参与 <strong>{BUG_FLOW_STATS.aiInvolvedRate}%</strong></span>
                  <span className="ac-bg-kpi-foot-divider" />
                  <span className="ac-xs">最长未关闭 <strong>{BUG_FLOW_STATS.longestOpenBugId}</strong>（{BUG_FLOW_STATS.longestOpenDays} 天）</span>
                </div>
              </div>
            </div>

            {/* SLA 策略 */}
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><Timer size={15} /> SLA 策略与升级链路</span>
              </div>
              <div className="ac-card-body ac-card-body--flush">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>优先级</th>
                      <th>确认</th>
                      <th className="ac-td-num">分析</th>
                      <th className="ac-td-num">修复</th>
                      <th className="ac-td-num">验证</th>
                      <th className="ac-td-num">总时长</th>
                      <th>升级级数</th>
                      <th>阻断发布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BUG_SLA_POLICIES.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[p.priority]}`}>{p.priority}</span>
                        </td>
                        <td className="ac-xs">{p.ackMinutes}min</td>
                        <td className="ac-td-num">{p.analyzeHours}h</td>
                        <td className="ac-td-num">{p.fixHours}h</td>
                        <td className="ac-td-num">{p.verifyHours}h</td>
                        <td className="ac-td-num ac-bold">{p.totalHours}h</td>
                        <td className="ac-td-num">{p.escalations.length}</td>
                        <td className="ac-td-center">
                          {p.autoBlockRelease
                            ? <span className="ac-badge ac-badge--danger">是</span>
                            : <span className="ac-muted ac-xs">否</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 状态机 */}
          <div className="ac-card ac-mb-3">
            <div className="ac-card-head">
              <span className="ac-card-title"><GitMerge size={15} /> 缺陷状态机（6 态 · {BUG_STATE_FLOW.length} 条迁移）</span>
              <span className="ac-card-subtitle">actorType：人工 / AI Agent / 系统</span>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>迁移</th>
                    <th style={{ minWidth: 200 }}>触发条件</th>
                    <th style={{ width: 90 }}>触发者</th>
                    <th style={{ width: 70 }} className="ac-td-num">SLA</th>
                    <th style={{ minWidth: 220 }}>约束说明</th>
                  </tr>
                </thead>
                <tbody>
                  {BUG_STATE_FLOW.map((f, i) => (
                    <tr key={`${f.from}-${f.to}-${i}`}>
                      <td>
                        <span className="ac-row ac-gap-1">
                          <span className="ac-tag ac-tag--sm ac-tag--outline">{f.from}</span>
                          <ArrowRight size={12} className="ac-bg-state-arrow" />
                          <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_META[f.to as BugDef['status']]?.tone ?? 'neutral'}`}>
                            {f.to}
                          </span>
                        </span>
                      </td>
                      <td className="ac-xs">{f.trigger}</td>
                      <td>
                        <span className={`ac-tag ac-tag--sm ac-tag--${ACTOR_META[f.actorType].tone}`}>
                          {f.actorType === 'agent' && <Bot size={10} style={{ marginRight: 2 }} />}
                          {ACTOR_META[f.actorType].label}
                        </span>
                      </td>
                      <td className="ac-td-num ac-xs">{f.slaHours > 0 ? `${f.slaHours}h` : '—'}</td>
                      <td className="ac-bg-state-note">{f.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 缺陷流转时间线 */}
          <div className="ac-card" data-annotation-id="ai-sdlc-bug-timeline">
            <div className="ac-card-head">
              <span className="ac-card-title"><Activity size={15} /> 缺陷流转时间线（倒序）</span>
              <div className="ac-card-extra">
                <select
                  className="ac-select ac-select--sm"
                  value={timelineBugId}
                  onChange={(e) => setTimelineBugId(e.target.value)}
                  style={{ width: 260 }}
                >
                  {BUGS.map((b) => (
                    <option key={b.id} value={b.id}>{b.id} · {b.title.slice(0, 22)}…</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ac-card-body">
              {timelineEvents.length > 0 ? (
                <div className="ac-timeline">
                  {timelineEvents.map((ev) => (
                    <div key={ev.id} className={`ac-timeline-item ac-timeline-item--${TIMELINE_TONE[ev.tone] ?? 'dim'}`}>
                      <div className="ac-timeline-head">
                        <span className={`ac-tag ac-tag--sm ac-tag--outline`}>{ev.fromState}</span>
                        <ArrowRight size={11} className="ac-muted" />
                        <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_META[ev.toState as BugDef['status']]?.tone ?? 'neutral'}`}>
                          {ev.toState}
                        </span>
                        <span className="ac-timeline-title">{ev.action}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${ACTOR_META[ev.actorType].tone}`}>
                          {ev.actorType === 'agent' && <Bot size={10} style={{ marginRight: 2 }} />}
                          {userName(ev.actorId)}
                        </span>
                        <span className="ac-timeline-time">{ev.at}</span>
                      </div>
                      <div className="ac-timeline-desc">{ev.detail}</div>
                      <div className="ac-timeline-extra ac-row ac-gap-1 ac-wrap">
                        {ev.refIds.map((r) => (
                          <span key={r} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{r}</span>
                        ))}
                        <span className="ac-tag ac-tag--sm ac-tag--neutral ac-mono">trace-bug-{ev.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ac-empty ac-empty--sm">
                  <span className="ac-empty-icon"><Activity size={22} /></span>
                  <span className="ac-empty-title">暂无流转事件</span>
                  <span className="ac-empty-desc">该缺陷尚未产生状态迁移记录</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
           标签 3：通知与订阅
           ============================================================ */}
      {tab === 'notify' && (
        <div data-annotation-id="ai-sdlc-bug-notify">
          <div className="ac-metric-grid ac-metric-grid--4">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">通知规则</span>
                <span className="ac-metric-icon"><Bell size={15} /></span>
              </div>
              <div className="ac-metric-value">{BUG_NOTIFY_STATS.ruleTotal}</div>
              <div className="ac-metric-foot">启用 {BUG_NOTIFY_STATS.ruleEnabled}</div>
            </div>
            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">近 30 天发送</span>
                <span className="ac-metric-icon"><Send size={15} /></span>
              </div>
              <div className="ac-metric-value">{BUG_NOTIFY_STATS.sent30d}</div>
              <div className="ac-metric-foot">合并降噪 {BUG_NOTIFY_STATS.mergedCount} 条（{BUG_NOTIFY_STATS.mergeRate}%）</div>
            </div>
            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head">
                <span className="ac-metric-label">确认率</span>
                <span className="ac-metric-icon"><CheckCircle2 size={15} /></span>
              </div>
              <div className="ac-metric-value">
                {BUG_NOTIFY_STATS.ackRate}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">P0 平均确认 {BUG_NOTIFY_STATS.avgAckMinutesP0} 分钟</div>
            </div>
            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head">
                <span className="ac-metric-label">升级 / 失败</span>
                <span className="ac-metric-icon"><AlertTriangle size={15} /></span>
              </div>
              <div className="ac-metric-value">
                {BUG_NOTIFY_STATS.escalatedCount}
                <span className="ac-metric-unit"> / {BUG_NOTIFY_STATS.failedCount}</span>
              </div>
              <div className="ac-metric-foot">PingCode 回写 {BUG_NOTIFY_STATS.pingcodeWritebackCount} 次 · 失败 {BUG_NOTIFY_STATS.pingcodeWritebackFail}</div>
            </div>
          </div>

          <div className="ac-hint ac-hint--ai ac-mb-3">
            <Sparkles size={14} />
            <div>
              <strong>AI 洞察：</strong>
              <div className="ac-sm">{BUG_NOTIFY_STATS.insight}</div>
              <div className="ac-sm">{BUG_NOTIFY_STATS.advice}</div>
            </div>
          </div>

          {/* 通知规则 */}
          <div className="ac-card ac-mb-3">
            <div className="ac-card-head">
              <span className="ac-card-title"><Settings2 size={15} /> 通知规则</span>
              <span className="ac-card-subtitle">开关即时生效，超时未确认自动升级</span>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th style={{ width: 160 }}>规则</th>
                      <th style={{ width: 92 }}>渠道</th>
                      <th style={{ minWidth: 180 }}>目标</th>
                      <th style={{ minWidth: 160 }}>触发事件</th>
                      <th style={{ width: 150 }}>命中条件</th>
                      <th style={{ width: 96 }}>接收人</th>
                      <th style={{ width: 66 }} className="ac-td-num">确认时限</th>
                      <th style={{ width: 120 }}>超时升级</th>
                      <th style={{ width: 130 }}>静默窗口</th>
                      <th style={{ width: 56 }}>启用</th>
                      <th style={{ width: 70 }} className="ac-td-num">30天</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BUG_NOTIFY.map((r) => {
                      const ChIcon = CHANNEL_META[r.channel]?.icon ?? Send;
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="ac-bg-bug-title">
                              <span className="ac-mono ac-xs ac-bold">{r.id}</span>
                              <span className="ac-bg-bug-sub">{r.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${CHANNEL_META[r.channel]?.tone ?? 'neutral'}`}>
                              <ChIcon size={10} style={{ marginRight: 3 }} />
                              {CHANNEL_META[r.channel]?.label ?? r.channel}
                            </span>
                          </td>
                          <td><span className="ac-bg-cell" title={r.target}>{r.target}</span></td>
                          <td>
                            <span className="ac-row ac-gap-1 ac-wrap">
                              {r.events.map((e) => (
                                <span key={e} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{e}</span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-mono ac-xs">{r.matchRule}</td>
                          <td>
                            <span className="ac-avatar-group">
                              {r.receiverIds.slice(0, 3).map((u) => (
                                <span key={u} className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(u)}`} title={userName(u)}>
                                  {userInitial(u)}
                                </span>
                              ))}
                              {r.receiverIds.length > 3 && (
                                <span className="ac-avatar-more">+{r.receiverIds.length - 3}</span>
                              )}
                            </span>
                          </td>
                          <td className="ac-td-num ac-xs">{r.ackTimeoutMin}min</td>
                          <td className="ac-xs">{BUG_NOTIFY_MAP[r.escalateToId]?.name ?? r.escalateToId}</td>
                          <td className="ac-xs">{r.silenceWindow}</td>
                          <td>
                            <button
                              type="button"
                              className={`ac-bg-switch${ruleEnabled[r.id] ? ' ac-bg-switch--on' : ''}`}
                              onClick={() => {
                                setRuleEnabled((prev) => ({ ...prev, [r.id]: !prev[r.id] }));
                                showToast(`${r.id} 已${ruleEnabled[r.id] ? '停用' : '启用'}`, ruleEnabled[r.id] ? 'warn' : 'ok');
                              }}
                              aria-label={`启用 ${r.id}`}
                            />
                          </td>
                          <td className="ac-td-num">{r.sentCount30d}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 通知日志 */}
          <div className="ac-card ac-mb-3">
            <div className="ac-card-head">
              <span className="ac-card-title"><Send size={15} /> 推送研发的通知记录</span>
              <span className="ac-card-subtitle">共 {allLogs.length} 条，倒序</span>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-bg-log-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th style={{ width: 106 }}>时间</th>
                      <th style={{ width: 140 }}>规则</th>
                      <th style={{ minWidth: 260 }}>缺陷与摘要</th>
                      <th style={{ width: 118 }}>事件</th>
                      <th style={{ width: 88 }}>渠道</th>
                      <th style={{ width: 96 }}>接收人</th>
                      <th style={{ width: 78 }}>结果</th>
                      <th style={{ width: 120 }}>确认</th>
                      <th style={{ width: 82 }}>时间线</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLogs.map((l) => {
                      const ChIcon = CHANNEL_META[l.channel]?.icon ?? Send;
                      const rule = BUG_NOTIFY_MAP[l.notifyId];
                      return (
                        <tr key={l.id}>
                          <td className="ac-xs ac-tnum">{l.time}</td>
                          <td className="ac-xs">
                            <span className="ac-mono">{l.notifyId}</span>
                            <span className="ac-muted"> {rule?.name ?? ''}</span>
                          </td>
                          <td>
                            <div className="ac-bg-bug-title">
                              <span className="ac-mono ac-xs ac-bold">{l.bugId}</span>
                              <span className="ac-bg-cell ac-bg-cell--wide ac-xs" title={l.title}>{l.title}</span>
                            </div>
                          </td>
                          <td className="ac-mono ac-xs">{l.event}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${CHANNEL_META[l.channel]?.tone ?? 'neutral'}`}>
                              <ChIcon size={10} style={{ marginRight: 3 }} />
                              {CHANNEL_META[l.channel]?.label ?? l.channel}
                            </span>
                          </td>
                          <td>
                            <span className="ac-avatar-group">
                              {l.receivers.slice(0, 3).map((u) => (
                                <span key={u} className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(u)}`} title={userName(u)}>
                                  {userInitial(u)}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${RESULT_TONE[l.result].tone}`}>
                              <span className="ac-tag-dot" />
                              {RESULT_TONE[l.result].label}
                            </span>
                          </td>
                          <td className="ac-xs">
                            {l.ackBy ? `${userName(l.ackBy)} · ${l.ackAt}` : <span className="ac-muted">未确认</span>}
                          </td>
                          <td className="ac-mono ac-xs">{l.timelineId}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 个人订阅 */}
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title"><Users size={15} /> 个人订阅偏好</span>
              <span className="ac-card-subtitle">决定谁在什么条件下被打扰</span>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>成员</th>
                    <th style={{ minWidth: 220 }}>关注范围</th>
                    <th style={{ width: 120 }}>优先级</th>
                    <th style={{ width: 160 }}>渠道</th>
                    <th style={{ width: 170 }}>静默时段</th>
                    <th style={{ width: 92 }}>日报/周报</th>
                    <th style={{ width: 96 }}>AI 自动派单</th>
                    <th style={{ width: 96 }}>关注缺陷</th>
                  </tr>
                </thead>
                <tbody>
                  {BUG_WATCH_SUBS.map((s) => (
                    <tr key={s.userId}>
                      <td>
                        <span className="ac-user">
                          <span className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(s.userId)}`}>
                            {userInitial(s.userId)}
                          </span>
                          <span className="ac-user-name">{userName(s.userId)}</span>
                        </span>
                      </td>
                      <td>
                        <span className="ac-row ac-gap-1 ac-wrap">
                          {s.watchScope.map((w) => (
                            <span key={w} className="ac-tag ac-tag--sm ac-tag--outline">{w}</span>
                          ))}
                        </span>
                      </td>
                      <td>
                        <span className="ac-row ac-gap-1">
                          {s.priorities.map((p) => (
                            <span key={p} className={`ac-tag ac-tag--sm ac-tag--${PRIORITY_TONE[p]}`}>{p}</span>
                          ))}
                        </span>
                      </td>
                      <td>
                        <span className="ac-row ac-gap-1 ac-wrap">
                          {s.channels.map((c) => (
                            <span key={c} className="ac-xs">{CHANNEL_META[c]?.label ?? c}</span>
                          ))}
                        </span>
                      </td>
                      <td className="ac-xs">{s.quietHours}</td>
                      <td className="ac-xs">
                        {s.dailyDigest ? '日报' : '—'} / {s.weeklyDigest ? '周报' : '—'}
                      </td>
                      <td className="ac-td-center">
                        {s.autoAssign
                          ? <span className="ac-tag ac-tag--sm ac-tag--ai"><Bot size={10} /> 开启</span>
                          : <span className="ac-muted ac-xs">关闭</span>}
                      </td>
                      <td className="ac-td-num ac-xs">{s.watchingBugIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
           标签 4：根因报告
           ============================================================ */}
      {tab === 'reports' && (
        <div className="ac-card ac-card--flat" data-annotation-id="ai-sdlc-bug-reports">
          <div className="ac-card-head">
            <span className="ac-card-title"><FileText size={15} /> AI 根因分析报告清单</span>
            <span className="ac-card-subtitle">共 {BUG_ANALYSIS.length} 篇 · 点击查看完整报告</span>
          </div>
          <div className="ac-card-body ac-card-body--flush">
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th style={{ width: 86 }}>报告编号</th>
                    <th style={{ minWidth: 280 }}>标题</th>
                    <th style={{ width: 62 }}>版本</th>
                    <th style={{ width: 76 }}>状态</th>
                    <th style={{ width: 88 }}>作者</th>
                    <th style={{ width: 150 }}>AI Agent · 模型</th>
                    <th style={{ width: 76 }} className="ac-td-num">置信度</th>
                    <th style={{ width: 96 }}>评审人</th>
                    <th style={{ width: 106 }}>更新时间</th>
                    <th style={{ width: 170 }}>文档路径</th>
                  </tr>
                </thead>
                <tbody>
                  {BUG_ANALYSIS.map((a) => {
                    const meta = REPORT_STATUS_TONE[a.status];
                    return (
                      <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => openReport(a)}>
                        <td className="ac-mono ac-xs ac-bold">{a.id}</td>
                        <td><span className="ac-bg-cell ac-bg-cell--wide" title={a.title}>{a.title}</span></td>
                        <td className="ac-xs">{a.version}</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${meta.tone}`}>
                            <span className="ac-tag-dot" />
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          <span className="ac-user">
                            <span className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(a.authorId)}`}>
                              {userInitial(a.authorId)}
                            </span>
                            <span className="ac-user-name">{userName(a.authorId)}</span>
                          </span>
                        </td>
                        <td className="ac-xs">
                          <Bot size={10} className="ac-ai-text" style={{ marginRight: 3 }} />
                          {agentName(a.agentId)} · {modelName(a.modelId)}
                        </td>
                        <td className="ac-td-num ac-bold">{a.confidence}%</td>
                        <td>
                          <span className="ac-avatar-group">
                            {a.reviewerIds.map((r) => (
                              <span key={r} className={`ac-avatar ac-avatar--xs ac-avatar--${userTone(r)}`} title={userName(r)}>
                                {userInitial(r)}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="ac-xs ac-tnum">{a.updatedAt}</td>
                        <td className="ac-mono ac-xs">{a.docPath}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
           AI 分析 / 根因报告抽屉
           ============================================================ */}
      <Drawer
        open={drawerOpen}
        title={drawerBug ? `${drawerBug.id} · ${drawerBug.title}` : ''}
        subtitle={
          drawerBug
            ? drawerMode === 'analysis'
              ? `AI 根因分析 · 置信度 ${BUG_ANALYSIS_MAP[drawerBug.id]?.confidence ?? '—'}% · ${moduleName(drawerBug.moduleId)}`
              : `根因分析报告 ${BUG_ANALYSIS_MAP[drawerBug.id]?.version ?? ''} · ${REPORT_STATUS_TONE[BUG_ANALYSIS_MAP[drawerBug.id]?.status ?? 'draft'].label}`
            : undefined
        }
        width={780}
        onClose={() => setDrawerOpen(false)}
        footer={
          drawerBug ? (
            <div className="ac-row ac-gap-2">
              <button
                type="button"
                className="ac-btn ac-btn--text ac-btn--sm"
                onClick={() => showToast(`打开 ${BUG_ANALYSIS_MAP[drawerBug.id]?.docPath ?? '报告文档'}（原型示意）`, 'info')}
              >
                <ExternalLink size={13} /> 查看完整报告文档
              </button>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm ac-ml-auto" onClick={() => setDrawerOpen(false)}>
                关闭
              </button>
              <button
                type="button"
                className="ac-btn ac-btn--primary ac-btn--sm"
                disabled={!BUG_ANALYSIS_MAP[drawerBug.id] || !chosenOptionId || !chosenAssigneeId}
                onClick={() => handleAdoptRequest(drawerBug, chosenOptionId, chosenAssigneeId)}
              >
                <Sparkles size={13} /> 采纳建议并指派
              </button>
            </div>
          ) : undefined
        }
      >
        <div data-annotation-id="ai-sdlc-bug-analysis-drawer">
          {drawerBug && (
            <AnalysisBody
              bug={drawerBug}
              analysis={BUG_ANALYSIS_MAP[drawerBug.id]}
              asReport={drawerMode === 'report'}
              override={overrides[drawerBug.id]}
              candidates={drawerCandidates}
              chosenOptionId={chosenOptionId}
              chosenAssigneeId={chosenAssigneeId}
              onChooseOption={setChosenOptionId}
              onChooseAssignee={setChosenAssigneeId}
              onAdopt={handleAdoptRequest}
            />
          )}
        </div>
      </Drawer>

      {/* ============================================================
           指派确认弹窗
           ============================================================ */}
      <Modal
        open={!!adoptModal}
        title="采纳 AI 建议并指派"
        subtitle={
          adoptModal && adoptFromState && adoptToState
            ? adoptBlocked
              ? `${adoptModal.bug.id} · 当前状态不接受指派`
              : adoptToState === adoptFromState
                ? `${adoptModal.bug.id} · 状态保持「${STATUS_META[adoptFromState].label}」，仅改派处理人`
                : `${adoptModal.bug.id} · 状态将流转为「${STATUS_META[adoptToState].label}」`
            : ''
        }
        width={560}
        onClose={() => setAdoptModal(null)}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setAdoptModal(null)}>
              取消
            </button>
            <button
              type="button"
              className="ac-btn ac-btn--primary ac-btn--sm"
              disabled={!!adoptBlocked}
              onClick={confirmAdopt}
            >
              <CheckCircle2 size={13} /> 确认指派
            </button>
          </div>
        }
      >
        {adoptModal && adoptFromState && adoptToState && (() => {
          const bug = adoptModal.bug;
          const analysis = BUG_ANALYSIS_MAP[bug.id];
          const option = analysis?.fixOptions.find((o) => o.id === adoptModal.optionId);
          const stateChanged = adoptToState !== adoptFromState;
          return (
            <div className="ac-col ac-gap-3">
              {adoptBlocked ? (
                <div className="ac-hint ac-hint--warn">
                  <AlertTriangle size={14} />
                  <div className="ac-sm">
                    {bug.id} {adoptBlocked}，本次不写入任何变更。
                  </div>
                </div>
              ) : (
                <div className="ac-hint ac-hint--ai">
                  <Sparkles size={14} />
                  <div className="ac-sm">
                    {stateChanged
                      ? `指派后状态将从「${STATUS_META[adoptFromState].label}」流转为「${STATUS_META[adoptToState].label}」，并向处理人推送飞书卡片通知，同时回写 PingCode。`
                      : `缺陷已处于「${STATUS_META[adoptFromState].label}」，本次仅改派处理人、不产生状态迁移，并向新处理人推送飞书卡片通知。`}
                  </div>
                </div>
              )}
              <dl className="ac-kv">
                <dt>建议指派人</dt>
                <dd>
                  <span className="ac-user">
                    <span className={`ac-avatar ac-avatar--sm ac-avatar--${userTone(adoptModal.assigneeId)}`}>
                      {userInitial(adoptModal.assigneeId)}
                    </span>
                    <span className="ac-user-name">{userName(adoptModal.assigneeId)}</span>
                    <span className="ac-user-meta">{USER_MAP[adoptModal.assigneeId]?.title ?? ''}</span>
                    <span className="ac-tag ac-tag--sm ac-tag--brand">匹配度 {adoptModal.score}%</span>
                  </span>
                </dd>
                <dt>匹配理由</dt>
                <dd className="ac-sm">{adoptModal.reason}</dd>
                <dt>采纳方案</dt>
                <dd className="ac-sm">
                  {option ? `${option.name}（${option.effortHours}h · 风险${option.riskLevel} · 覆盖率 +${option.coverageGain}pp）` : '—'}
                </dd>
                <dt>状态流转</dt>
                <dd>
                  <span className="ac-row ac-gap-1">
                    <span className="ac-tag ac-tag--sm ac-tag--outline">{STATUS_META[adoptFromState].label}</span>
                    <ArrowRight size={12} className="ac-muted" />
                    <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_META[adoptToState].tone}`}>
                      {STATUS_META[adoptToState].label}
                    </span>
                    {!stateChanged && <span className="ac-xs ac-muted">（无迁移）</span>}
                  </span>
                </dd>
                <dt>同步 PingCode</dt>
                <dd className="ac-sm">是（幂等键 {bug.pcCode}，写入 external_id 映射）</dd>
              </dl>
            </div>
          );
        })()}
      </Modal>

      {/* ============================================================
           Toast
           ============================================================ */}
      {toast && (
        <div className="ac-bg-toast-wrap">
          <div className={`ac-bg-toast ac-bg-toast--${toast.tone}`}>
            {toast.tone === 'ok' ? <CheckCircle2 size={15} /> : toast.tone === 'ai' ? <Bot size={15} /> : toast.tone === 'warn' ? <AlertTriangle size={15} /> : <XCircle size={15} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}