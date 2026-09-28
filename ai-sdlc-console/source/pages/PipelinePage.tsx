/**
 * 部署流水线（pageId: pipeline）
 * 构建选择器 + 三标签页（流水线 / 门禁 / 环境与通知）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Box,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  FlaskConical,
  GitBranch,
  GitCommit,
  Globe,
  Hammer,
  ListChecks,
  type LucideIcon,
  Mail,
  Package,
  Percent,
  Phone,
  RefreshCw,
  Rocket,
  ScanSearch,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Terminal,
  Undo2,
  User,
  UserCheck,
  Webhook,
  XCircle,
} from 'lucide-react';
import {
  DEPLOY_NOTIFY,
  DEPLOY_NOTIFY_LOGS,
  ENVIRONMENTS,
  ENV_MAP,
  G3_FAILURE_TREND,
  GATES,
  GATE_MAP,
  PIPELINE_MAP,
  PIPELINE_RUNS,
  RELEASE_ORDERS,
  TASK_MAP,
  TEST_REPORT,
  TODAY,
  USER_MAP,
} from '../data';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import './pipeline.css';

type PipelineRun = (typeof PIPELINE_RUNS)[number];
type PipelineStage = PipelineRun['stages'][number];
type Gate = (typeof GATES)[number];
type EnvDef = (typeof ENVIRONMENTS)[number];
type ReleaseOrder = (typeof RELEASE_ORDERS)[number];
type NotifyLog = (typeof DEPLOY_NOTIFY_LOGS)[number];
type StageStatus = 'success' | 'failed' | 'running' | 'skipped' | 'waiting';
type TabKey = 'pipeline' | 'gates' | 'env';

/** 需求约定的 8 阶段泳道（数据层为 6 阶段，按序对齐，未覆盖阶段灰化待执行） */
const CANON_PHASES: { key: string; title: string; icon: LucideIcon }[] = [
  { key: 'checkout', title: '拉取代码', icon: GitBranch },
  { key: 'compile', title: '编译', icon: Hammer },
  { key: 'unit', title: '单测', icon: FlaskConical },
  { key: 'artifact', title: '制品', icon: Package },
  { key: 'dev', title: '部署 DEV', icon: Server },
  { key: 'smoke', title: '冒烟', icon: Terminal },
  { key: 'stg', title: '部署 STG', icon: Box },
  { key: 'prod', title: '部署 PROD', icon: Globe },
];

const RUN_STATUS_META: Record<PipelineRun['status'], { label: string; tone: string }> = {
  success: { label: '成功', tone: 'ok' },
  failed: { label: '失败', tone: 'danger' },
  running: { label: '运行中', tone: 'brand' },
  canceled: { label: '已取消', tone: 'neutral' },
};

const STAGE_STATUS_META: Record<StageStatus, { label: string; tone: string; node: string }> = {
  success: { label: '成功', tone: 'ok', node: 'ok' },
  failed: { label: '失败', tone: 'danger', node: 'failed' },
  running: { label: '运行中', tone: 'brand', node: 'running' },
  skipped: { label: '跳过', tone: 'neutral', node: 'pending' },
  waiting: { label: '待执行', tone: 'neutral', node: 'pending' },
};

const TRIGGER_LABEL: Record<PipelineRun['trigger'], string> = {
  push: '代码推送',
  manual: '手动触发',
  schedule: '定时触发',
  agent: 'AI 智能体',
};

const CHANNEL_META: Record<string, { label: string; tone: string }> = {
  'lark-card': { label: '飞书卡片', tone: 'brand' },
  'lark-group': { label: '飞书群', tone: 'info' },
  email: { label: '邮件', tone: 'neutral' },
  webhook: { label: 'Webhook', tone: 'ai' },
  sms: { label: '短信', tone: 'warn' },
  phone: { label: '电话', tone: 'danger' },
};

const CHANNEL_ICON: Record<string, LucideIcon> = {
  'lark-card': Bell,
  'lark-group': Bell,
  email: Mail,
  webhook: Webhook,
  sms: Smartphone,
  phone: Phone,
};

const NOTIFY_RESULT_META: Record<NotifyLog['result'], { label: string; tone: string }> = {
  sent: { label: '已发送', tone: 'ok' },
  failed: { label: '发送失败', tone: 'danger' },
  merged: { label: '合并推送', tone: 'neutral' },
};

const RELEASE_STATUS_META: Record<ReleaseOrder['status'], { label: string; tone: string }> = {
  released: { label: '已发布', tone: 'ok' },
  approving: { label: '审批中', tone: 'brand' },
  blocked: { label: '已阻断', tone: 'danger' },
  planned: { label: '已计划', tone: 'neutral' },
  rolledback: { label: '已回滚', tone: 'warn' },
};

const BATCH_STATUS_META: Record<string, { label: string; mod: string }> = {
  done: { label: '已完成', mod: 'done' },
  running: { label: '进行中', mod: 'running' },
  blocked: { label: '已阻断', mod: 'blocked' },
  waiting: { label: '等待中', mod: '' },
  skipped: { label: '已跳过', mod: '' },
};

/** 门禁状态 → 中文口径（与门禁清单标签保持一致） */
const GATE_STATUS_LABEL: Record<Gate['status'], string> = {
  passed: '已通过',
  failed: '未通过',
  pending: '待校验',
  waived: '已例外豁免',
};

/** 通知模板编号 → 通知规则（用于「模板」列展示模板名与模板正文） */
const NOTIFY_TPL_MAP: Record<string, (typeof DEPLOY_NOTIFY)[number]> = DEPLOY_NOTIFY.reduce<
  Record<string, (typeof DEPLOY_NOTIFY)[number]>
>((acc, n) => {
  acc[n.id] = n;
  return acc;
}, {});

/** 发布前检查项序号（①~⑤，用于禁用原因红条的条目编号） */
const CIRCLED_IDX = ['①', '②', '③', '④', '⑤'];

interface LaneNode {
  key: string;
  idx: number;
  title: string;
  stageId: string;
  realName: string;
  status: StageStatus;
  durationSec: number;
  gateId: string;
  log: string;
  retriable: boolean;
}

/** spec 要求的 5 项发布前检查（全部由数据层派生，不写死结论） */
interface Precheck {
  key: string;
  idx: number;
  name: string;
  icon: LucideIcon;
  ok: boolean;
  /** 实测值文案 */
  actual: string;
  /** 数据来源文案 */
  source: string;
}

/* ---------- 资源用量字符串解析（如 "0.3 / 1 核"、"612MB / 2Gi"） ---------- */
function toBase(v: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('gi')) return v * 1024;
  if (u.startsWith('mi')) return v;
  if (u.startsWith('ki')) return v / 1024;
  return v;
}

function parseUsage(raw: string): number | null {
  const parts = raw.split('/');
  if (parts.length !== 2) return null;
  const a = /^\s*([\d.]+)\s*([A-Za-z]*)/.exec(parts[0]);
  const b = /^\s*([\d.]+)\s*([A-Za-z]*)/.exec(parts[1]);
  if (!a || !b) return null;
  const used = toBase(Number(a[1]), a[2]);
  const total = toBase(Number(b[1]), b[2]);
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((used / total) * 100));
}

function avgUsage(list: string[]): number | null {
  const vals = list.map(parseUsage).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((sum, v) => sum + v, 0) / vals.length);
}

function usageTone(pct: number): string {
  if (pct >= 85) return 'danger';
  if (pct >= 65) return 'warn';
  return 'ok';
}

function fmtDur(sec: number): string {
  if (sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

function shortSha(sha: string): string {
  return sha ? sha.slice(0, 7) : '—';
}

/* ---------- 门禁 criteria / actual 文本解析（用于派生发布前检查项） ---------- */

/** 从「聚合 71.4% ✗」一类文本中抽取第一个百分数 */
function extractPercent(text: string): number | null {
  const m = /([\d.]+)\s*%/u.exec(text);
  return m ? Number(m[1]) : null;
}

/** 从「阻断级 0 ✓ / 严重级 2」一类文本中，抽取关键字之后的第一个整数 */
function extractIntAfter(text: string, keyword: string): number | null {
  const at = text.indexOf(keyword);
  if (at < 0) return null;
  const m = /([0-9]+)/u.exec(text.slice(at + keyword.length));
  return m ? Number(m[1]) : null;
}

/** 按关键字定位门禁 criteria 条目及其同序 actual 条目 */
function pickCriterion(gate: Gate, keyword: string): { criteria: string; actual: string } {
  const idx = gate.criteria.findIndex((c) => c.includes(keyword));
  if (idx < 0) return { criteria: '', actual: '' };
  return { criteria: gate.criteria[idx], actual: gate.actual[idx] ?? '' };
}

/** 'YYYY-MM-DD HH:mm' → 时间戳（原型内统一时间格式，非法值返回 NaN） */
function toTs(text: string): number {
  return new Date(text.replace(' ', 'T')).getTime();
}

/* ============================================================
 * 页面
 * ============================================================ */
export default function PipelinePage() {
  const [runId, setRunId] = useState(PIPELINE_RUNS[0].id);
  const [tab, setTab] = useState<TabKey>('pipeline');
  const [stageOverrides, setStageOverrides] = useState<Record<string, StageStatus>>({});
  const [logNode, setLogNode] = useState<LaneNode | null>(null);
  const [releaseSubmitted, setReleaseSubmitted] = useState(false);
  const [releaseModal, setReleaseModal] = useState(false);
  const [channel, setChannel] = useState('all');
  const [rollbackTarget, setRollbackTarget] = useState<ReleaseOrder | null>(null);
  const [releaseOverrides, setReleaseOverrides] = useState<Record<string, ReleaseOrder['status']>>({});
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const run = PIPELINE_MAP[runId] ?? PIPELINE_RUNS[0];
  const task = TASK_MAP[run.taskId];

  const laneNodes: LaneNode[] = useMemo(
    () =>
      CANON_PHASES.map((phase, i) => {
        const stage: PipelineStage | undefined = run.stages[i];
        const override = stage ? stageOverrides[`${run.id}:${stage.id}`] : undefined;
        const status: StageStatus = override ?? stage?.status ?? 'waiting';
        return {
          key: phase.key,
          idx: i + 1,
          title: phase.title,
          stageId: stage?.id ?? `none-${phase.key}`,
          realName: stage?.name ?? '未配置',
          status,
          durationSec: stage?.durationSec ?? 0,
          gateId: stage?.gateId ?? '',
          log:
            stage?.log ??
            `阶段「${phase.title}」在当前流水线口径（${run.scope}）下未配置该阶段，处于待执行状态。`,
          retriable: Boolean(stage) && status === 'failed',
        };
      }),
    [run, stageOverrides],
  );

  const failedNodes = laneNodes.filter((n) => n.status === 'failed');
  const effStatus: PipelineRun['status'] = useMemo(() => {
    if (laneNodes.some((n) => n.status === 'running')) return 'running';
    if (laneNodes.some((n) => n.status === 'failed')) return 'failed';
    if (run.status === 'canceled') return 'canceled';
    if (run.status === 'failed') return 'success';
    return run.status;
  }, [laneNodes, run]);

  function retryStage(node: LaneNode) {
    const key = `${run.id}:${node.stageId}`;
    setStageOverrides((prev) => ({ ...prev, [key]: 'running' }));
    const handle = window.setTimeout(() => {
      setStageOverrides((prev) => ({ ...prev, [key]: 'success' }));
    }, 2000);
    timers.current.push(handle);
  }

  /* ---------------- 门禁 ---------------- */
  const blockingUnmet = GATES.filter((g) => g.blocking && g.status !== 'passed');
  const canRelease = blockingUnmet.length === 0;
  const releaseOrder =
    RELEASE_ORDERS.find((o) => o.taskId === run.taskId) ?? RELEASE_ORDERS[RELEASE_ORDERS.length - 1];

  /* ---------------- 发布前检查（spec 要求的 5 项，全部由数据层派生） ---------------- */
  const g3 = GATE_MAP.G3;
  const g4 = GATE_MAP.G4;
  const g5 = GATE_MAP.G5;

  /** 原型内“当前时刻”：TODAY 当日 + 各门禁 lastCheckedAt 的最大时分（数据派生，非硬编码） */
  const nowAt = `${TODAY} ${GATES.reduce((max, g) => {
    const hm = g.lastCheckedAt.split(' ')[1] ?? '';
    return hm > max ? hm : max;
  }, '')}`;

  const prechecks: Precheck[] = useMemo(() => {
    /* ① 覆盖率阈值：G3「需求级聚合分支覆盖率 ≥ 85%」条目 */
    const cov = pickCriterion(g3, '聚合分支覆盖率');
    const covTarget = extractPercent(cov.criteria) ?? TEST_REPORT.coverageTarget;
    const covActual = extractPercent(cov.actual) ?? TEST_REPORT.coverageBranch;
    const covOk = covActual >= covTarget && g3.status !== 'failed';

    /* ② 静态扫描零阻断：G3「SonarQube 阻断级问题 = 0」条目，并与当前构建 sonarBlocker 取较大值 */
    const scan = pickCriterion(g3, '阻断级问题');
    const scanLimit = extractIntAfter(scan.criteria, '=') ?? 0;
    const scanBlocker = Math.max(extractIntAfter(scan.actual, '阻断级') ?? 0, run.sonarBlocker);
    const scanMajor = extractIntAfter(scan.actual, '严重级') ?? 0;
    const scanOk = scanBlocker <= scanLimit;

    /* ③ 冒烟用例全通过：TR-24 测试报告失败 / 阻塞用例数 + G4 门禁状态 */
    const smokeOk = TEST_REPORT.caseFailed === 0 && TEST_REPORT.caseBlocked === 0 && g4.status === 'passed';

    /* ④ 审批人已批准：G5 门禁状态 + 当前发布单审批状态 */
    const approver = USER_MAP[g5.approverId];
    const approveOk = g5.status === 'passed' && releaseOrder.status !== 'blocked';

    /* ⑤ 变更窗口内：发布单 windowStart ~ windowEnd 与当前时刻比较 */
    const nowTs = toTs(nowAt);
    const winStartTs = toTs(releaseOrder.windowStart);
    const winEndTs = toTs(releaseOrder.windowEnd);
    const windowOk = nowTs >= winStartTs && nowTs <= winEndTs;
    const windowState = windowOk ? '窗口内' : nowTs < winStartTs ? '窗口未开始' : '窗口已结束';

    return [
      {
        key: 'coverage',
        idx: 1,
        name: '覆盖率阈值',
        icon: Percent,
        ok: covOk,
        actual: `聚合分支覆盖率 ${covActual}% / 阈值 ${covTarget}%`,
        source: `来源：G3 ${g3.name} criteria / actual（聚合分支覆盖率条目）`,
      },
      {
        key: 'scan',
        idx: 2,
        name: '静态扫描零阻断',
        icon: ScanSearch,
        ok: scanOk,
        actual: `阻断 ${scanBlocker} / 严重 ${scanMajor}（阈值 阻断 ≤ ${scanLimit}）`,
        source: `来源：G3 ${g3.name}（SonarQube）· 当前构建 ${run.id} sonarBlocker`,
      },
      {
        key: 'smoke',
        idx: 3,
        name: '冒烟用例全通过',
        icon: FlaskConical,
        ok: smokeOk,
        actual: `失败 ${TEST_REPORT.caseFailed} 条 · 阻塞 ${TEST_REPORT.caseBlocked} 条（已执行 ${TEST_REPORT.caseExecuted} / ${TEST_REPORT.caseTotal}，通过率 ${TEST_REPORT.passRate}%）`,
        source: `来源：G4 ${g4.name}（${GATE_STATUS_LABEL[g4.status]}）· ${TEST_REPORT.id} 测试报告 caseFailed / caseBlocked`,
      },
      {
        key: 'approval',
        idx: 4,
        name: '审批人已批准',
        icon: UserCheck,
        ok: approveOk,
        actual: `${approver?.name ?? g5.approverId} · G5 ${GATE_STATUS_LABEL[g5.status]} · 发布单 ${releaseOrder.id} ${RELEASE_STATUS_META[releaseOrder.status].label}`,
        source: `来源：G5 ${g5.name} status / approverId · ${releaseOrder.id} status`,
      },
      {
        key: 'window',
        idx: 5,
        name: '变更窗口内',
        icon: CalendarClock,
        ok: windowOk,
        actual: `${releaseOrder.windowStart} ~ ${releaseOrder.windowEnd} · 当前 ${nowAt}（${windowState}）`,
        source: `来源：${releaseOrder.id} windowStart / windowEnd · 当前时刻取 TODAY 与门禁 lastCheckedAt 最大值`,
      },
    ];
  }, [g3, g4, g5, releaseOrder, run, nowAt]);

  const precheckUnmet = prechecks.filter((p) => !p.ok);
  const precheckOkCount = prechecks.length - precheckUnmet.length;
  /** 发布按钮禁用条件：既有阻断门禁未满足，或 5 项发布前检查任一未满足 */
  const releaseBlocked = !canRelease || precheckUnmet.length > 0;

  /* ---------------- 通知记录 ---------------- */
  const channels = Array.from(new Set(DEPLOY_NOTIFY_LOGS.map((l) => l.channel)));
  const notifyLogs = channel === 'all' ? DEPLOY_NOTIFY_LOGS : DEPLOY_NOTIFY_LOGS.filter((l) => l.channel === channel);

  function gateStatusIcon(gate: Gate) {
    if (gate.status === 'passed') return <CheckCircle2 size={14} />;
    if (gate.status === 'failed') return <XCircle size={14} />;
    if (gate.status === 'waived') return <ShieldAlert size={14} />;
    return <AlertTriangle size={14} />;
  }

  return (
    <div className="ac-page" data-annotation-id="ai-sdlc-pipeline-page">
      {/* ---------------- 构建选择器 ---------------- */}
      <div className="ac-card ac-card--flat" data-annotation-id="ai-sdlc-pipeline-build-selector">
        <div className="ac-card-head">
          <div className="ac-card-title">
            <GitCommit size={15} /> 构建记录
          </div>
          <div className="ac-card-subtitle">共 {PIPELINE_RUNS.length} 次流水线运行</div>
        </div>
        <div className="ac-card-body ac-card-body--tight">
          <div className="ac-pipe-runbar">
            {PIPELINE_RUNS.map((r) => {
              const meta = RUN_STATUS_META[r.status];
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`ac-pipe-run ${r.id === runId ? 'ac-pipe-run--active' : ''}`}
                  onClick={() => {
                    setRunId(r.id);
                    setStageOverrides({});
                    setLogNode(null);
                  }}
                >
                  <div className="ac-row-between">
                    <span className="ac-pipe-run-code">{r.id}</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${meta.tone}`}>{meta.label}</span>
                  </div>
                  <div className="ac-pipe-run-msg">{r.commitMsg}</div>
                  <div className="ac-row ac-gap-2 ac-xs ac-muted">
                    <span className="ac-tag ac-tag--sm ac-tag--outline">{TRIGGER_LABEL[r.trigger]}</span>
                    <span className="ac-mono ac-ellipsis">{r.branch}</span>
                  </div>
                  <div className="ac-pipe-run-meta">
                    {shortSha(r.commitSha)} · {r.startedAt}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------- 标签页 ---------------- */}
      <div className="ac-tabs" data-annotation-id="ai-sdlc-pipeline-tabs">
        <button
          type="button"
          className={`ac-tab ${tab === 'pipeline' ? 'ac-tab--active' : ''}`}
          onClick={() => setTab('pipeline')}
        >
          流水线
          <span className="ac-tab-count">{laneNodes.length}</span>
        </button>
        <button
          type="button"
          className={`ac-tab ${tab === 'gates' ? 'ac-tab--active' : ''}`}
          onClick={() => setTab('gates')}
        >
          门禁
          <span className="ac-tab-count">{GATES.length}</span>
        </button>
        <button
          type="button"
          className={`ac-tab ${tab === 'env' ? 'ac-tab--active' : ''}`}
          onClick={() => setTab('env')}
        >
          环境与通知
          <span className="ac-tab-count">{ENVIRONMENTS.length}</span>
        </button>
      </div>

      {/* ================= 标签页 1：流水线 ================= */}
      {tab === 'pipeline' ? (
        <>
          {/* 汇总条 */}
          <div className="ac-card ac-card--flat" data-annotation-id="ai-sdlc-pipeline-summary">
            <div className="ac-card-head">
              <div className="ac-card-title">
                <Rocket size={15} /> {run.id} 构建概览
              </div>
              <div className="ac-card-subtitle">
                {task ? `${task.code} · ${task.title}` : `scope: ${run.scope}`}
                {run.mrId ? ` · ${run.mrId}` : ''}
              </div>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${RUN_STATUS_META[effStatus].tone}`}>
                  {RUN_STATUS_META[effStatus].label}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pipe-summary">
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">构建编号</span>
                  <span className="ac-pipe-summary-v ac-mono">{run.id}</span>
                </div>
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">分支</span>
                  <span className="ac-pipe-summary-v ac-mono">{run.branch}</span>
                </div>
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">提交</span>
                  <span className="ac-pipe-summary-v ac-mono">
                    {shortSha(run.commitSha)} · {run.commitMsg}
                  </span>
                </div>
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">触发人</span>
                  <span className="ac-pipe-summary-v">
                    <span className="ac-row ac-gap-2">
                      <span className={`ac-avatar ac-avatar--xs ac-avatar--${USER_MAP[run.triggeredBy]?.avatarColor ?? 'slate'}`}>
                        {USER_MAP[run.triggeredBy]?.initial ?? 'AI'}
                      </span>
                      {USER_MAP[run.triggeredBy]?.name ?? run.triggeredBy}
                    </span>
                  </span>
                </div>
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">总耗时</span>
                  <span className="ac-pipe-summary-v ac-mono">{fmtDur(run.durationSec)}</span>
                </div>
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">门禁通过</span>
                  <span className="ac-pipe-summary-v ac-mono">
                    {run.gatesPassed} / {run.gatesTotal}
                  </span>
                </div>
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">增量覆盖率</span>
                  <span className="ac-pipe-summary-v ac-mono">{run.incrementalCoverage}%</span>
                </div>
                <div className="ac-pipe-summary-item">
                  <span className="ac-pipe-summary-k">当前状态</span>
                  <span className="ac-pipe-summary-v">{RUN_STATUS_META[effStatus].label}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 阶段节点 */}
          <div className="ac-card" data-annotation-id="ai-sdlc-pipeline-stages">
            <div className="ac-card-head">
              <div className="ac-card-title">
                <GitBranch size={15} /> 阶段泳道
              </div>
              <div className="ac-card-subtitle">
                按「拉取代码 → 编译 → 单测 → 制品 → 部署 DEV → 冒烟 → 部署 STG → 部署 PROD」口径对齐
              </div>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--sm ac-tag--neutral">
                  失败 {failedNodes.length} · 待执行 {laneNodes.filter((n) => n.status === 'waiting').length}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-flow">
                {laneNodes.map((node, i) => {
                  const meta = STAGE_STATUS_META[node.status];
                  const Icon = CANON_PHASES[i].icon;
                  const prev = i > 0 ? laneNodes[i - 1] : null;
                  const arrowMod =
                    prev && prev.status === 'success'
                      ? 'ac-flow-arrow--ok'
                      : prev && prev.status === 'running'
                        ? 'ac-flow-arrow--running'
                        : '';
                  return (
                    <div key={node.key} className="ac-row ac-gap-0">
                      {i > 0 ? (
                        <div className={`ac-flow-arrow ${arrowMod}`}>
                          <ChevronRight size={15} />
                        </div>
                      ) : null}
                      <div className={`ac-flow-node ac-pipe-node ac-flow-node--${meta.node}`}>
                        <div className="ac-flow-node-head">
                          <span className="ac-flow-node-idx">{node.idx}</span>
                          <span className="ac-flow-node-title">{node.title}</span>
                          <span className="ac-flow-node-icon">
                            <Icon size={14} />
                          </span>
                        </div>
                        <span className="ac-pipe-node-badges">
                          <span className={`ac-tag ac-tag--sm ac-tag--${meta.tone}`}>{meta.label}</span>
                          {node.gateId ? (
                            <span className="ac-tag ac-tag--sm ac-tag--warn">{node.gateId}</span>
                          ) : null}
                        </span>
                        <span className="ac-flow-node-meta">
                          耗时 {fmtDur(node.durationSec)}
                        </span>
                        <span className="ac-pipe-node-real" title={`对应数据层阶段：${node.realName}`}>
                          对应阶段 {node.realName}
                        </span>
                        <button
                          type="button"
                          className="ac-btn ac-btn--sm ac-btn--text"
                          onClick={() => setLogNode(node)}
                        >
                          <Terminal size={12} /> 查看日志
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 失败摘要 */}
              {failedNodes.length > 0 ? (
                <div data-annotation-id="ai-sdlc-pipeline-stage-error">
                  {failedNodes.map((node) => (
                    <div key={node.key} className="ac-pipe-error">
                      <span className="ac-pipe-error-icon">
                        <AlertTriangle size={16} />
                      </span>
                      <div className="ac-pipe-error-main">
                        <div className="ac-pipe-error-title">
                          阶段 {node.idx}「{node.title}」（对应 {node.realName}）执行失败
                          {node.gateId ? ` · 关联门禁 ${node.gateId}` : ''}
                        </div>
                        <div className="ac-pipe-error-desc">{node.log}</div>
                      </div>
                      <button
                        type="button"
                        className="ac-btn ac-btn--sm ac-btn--danger-ghost"
                        disabled={!node.retriable}
                        title={node.retriable ? '重跑该阶段' : '该阶段当前不可重试'}
                        onClick={() => retryStage(node)}
                      >
                        <RefreshCw size={12} /> 重试该阶段
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {effStatus === 'running' ? (
                <div className="ac-hint ac-hint--ai ac-mt-3">
                  <RefreshCw size={14} />
                  阶段重跑中，完成后将自动刷新汇总状态（本地模拟，约 2 秒）。
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {/* ================= 标签页 2：门禁 ================= */}
      {tab === 'gates' ? (
        <div className="ac-grid-3-2">
          <div className="ac-card" data-annotation-id="ai-sdlc-pipeline-gates">
            <div className="ac-card-head">
              <div className="ac-card-title">
                <ShieldCheck size={15} /> 质量门禁清单
              </div>
              <div className="ac-card-subtitle">
                通过 {GATES.filter((g) => g.status === 'passed').length} / {GATES.length} 道 · 阻断类未满足{' '}
                {blockingUnmet.length} 项
              </div>
            </div>
            <div className="ac-card-body ac-card-body--tight">
              {GATES.map((gate) => (
                <div key={gate.id} className="ac-gate-row">
                  <span className={`ac-gate-icon ac-gate-icon--${gate.status}`}>{gateStatusIcon(gate)}</span>
                  <div className="ac-gate-main">
                    <div className="ac-row ac-gap-2 ac-row-wrap">
                      <span className="ac-mono ac-sm" style={{ fontWeight: 700 }}>{gate.id}</span>
                      <span className="ac-sm" style={{ fontWeight: 700 }}>{gate.name}</span>
                      <span
                        className={`ac-tag ac-tag--sm ac-tag--${
                          gate.status === 'passed'
                            ? 'ok'
                            : gate.status === 'failed'
                              ? 'danger'
                              : gate.status === 'waived'
                                ? 'neutral'
                                : 'warn'
                        }`}
                      >
                        {gate.status === 'passed'
                          ? '已满足'
                          : gate.status === 'failed'
                            ? '未满足'
                            : gate.status === 'waived'
                              ? '已例外豁免'
                              : '待校验'}
                      </span>
                      {gate.blocking ? (
                        <span className="ac-tag ac-tag--sm ac-tag--outline">阻断发布</span>
                      ) : (
                        <span className="ac-tag ac-tag--sm ac-tag--outline">非阻断</span>
                      )}
                      <span className="ac-xs ac-muted">责任角色 {gate.ownerRoleId} · 校验智能体 {gate.agentId}</span>
                    </div>
                    <div className="ac-gate-cmp">
                      {gate.criteria.map((c, i) => (
                        <div key={`${gate.id}-c-${i}`} className="ac-gate-cmp-item">
                          <span className="ac-gate-cmp-k">要求</span>
                          <span className="ac-gate-cmp-v">{c}</span>
                        </div>
                      ))}
                      {gate.actual.map((a, i) => (
                        <div key={`${gate.id}-a-${i}`} className="ac-gate-cmp-item">
                          <span className="ac-gate-cmp-k">当前</span>
                          <span className="ac-gate-cmp-v">{a}</span>
                        </div>
                      ))}
                    </div>
                    <div className="ac-sm ac-muted ac-mt-2">{gate.desc}</div>
                    <div className="ac-row ac-gap-3 ac-xs ac-muted ac-mt-2 ac-row-wrap">
                      <span className="ac-mono">最近校验 {gate.lastCheckedAt}</span>
                      {gate.lastPipelineId ? <span className="ac-mono">来源 {gate.lastPipelineId}</span> : null}
                      <span>通过率 {gate.passRate}%</span>
                      <span>证据 {gate.evidence.length} 份</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ac-col ac-gap-4">
            {/* 发布前检查（5 项） */}
            <div className="ac-card">
              <div className="ac-card-head">
                <div className="ac-card-title">
                  <ListChecks size={15} /> 发布前检查
                </div>
                <div className="ac-card-subtitle">已满足 {precheckOkCount} / 5</div>
                <div className="ac-card-extra">
                  <span
                    className={`ac-tag ac-tag--sm ac-tag--${precheckUnmet.length === 0 ? 'ok' : 'danger'}`}
                  >
                    {precheckUnmet.length === 0 ? '全部满足' : `${precheckUnmet.length} 项未满足`}
                  </span>
                </div>
              </div>
              <div className="ac-card-body ac-card-body--tight">
                {prechecks.map((p) => {
                  const Icon = p.icon;
                  return (
                    <div
                      key={p.key}
                      className={`ac-pipe-check ${p.ok ? 'ac-pipe-check--ok' : 'ac-pipe-check--off'}`}
                    >
                      <span className="ac-pipe-check-idx">{p.idx}</span>
                      <span
                        className={`ac-pipe-check-icon ${p.ok ? 'ac-pipe-check-icon--ok' : 'ac-pipe-check-icon--off'}`}
                        title={p.ok ? '满足' : '未满足'}
                      >
                        {p.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      </span>
                      <div className="ac-pipe-check-main">
                        <div className="ac-row ac-gap-2 ac-row-wrap">
                          <span className="ac-pipe-check-name">
                            <Icon size={12} /> {p.name}
                          </span>
                          <span className={`ac-tag ac-tag--sm ac-tag--${p.ok ? 'ok' : 'danger'}`}>
                            {p.ok ? '满足' : '未满足'}
                          </span>
                        </div>
                        <div className="ac-pipe-check-actual ac-mono">{p.actual}</div>
                        <div className="ac-xs ac-muted">{p.source}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 发布到 PROD */}
            <div className="ac-card" data-annotation-id="ai-sdlc-pipeline-gate-release">
              <div className="ac-card-head">
                <div className="ac-card-title">
                  <Rocket size={15} /> 发布到 PROD
                </div>
                <div className="ac-card-subtitle">
                  {releaseOrder ? `${releaseOrder.id} · ${releaseOrder.version}` : '未关联发布单'}
                </div>
              </div>
              <div className="ac-card-body">
                {releaseOrder ? (
                  <dl className="ac-kv">
                    <dt>变更窗口</dt>
                    <dd className="ac-mono">
                      {releaseOrder.windowStart} ~ {releaseOrder.windowEnd}
                    </dd>
                    <dt>风险等级</dt>
                    <dd>
                      <span
                        className={`ac-tag ac-tag--sm ac-tag--${
                          releaseOrder.riskLevel === 'high'
                            ? 'danger'
                            : releaseOrder.riskLevel === 'medium'
                              ? 'warn'
                              : 'ok'
                        }`}
                      >
                        {releaseOrder.riskLevel === 'high' ? '高' : releaseOrder.riskLevel === 'medium' ? '中' : '低'}
                      </span>
                    </dd>
                    <dt>审批人</dt>
                    <dd>
                      <span className="ac-row ac-gap-2 ac-row-wrap">
                        {releaseOrder.approverIds.map((id) => {
                          const u = USER_MAP[id];
                          return u ? (
                            <span key={id} className="ac-row ac-gap-1 ac-xs">
                              <span className={`ac-avatar ac-avatar--xs ac-avatar--${u.avatarColor}`}>
                                {u.initial}
                              </span>
                              {u.name}
                            </span>
                          ) : null;
                        })}
                      </span>
                    </dd>
                    <dt>变更项</dt>
                    <dd>{releaseOrder.changeItems} 项 · 影响 {releaseOrder.affectedServices.length} 个服务</dd>
                  </dl>
                ) : null}

                <div className="ac-divider" />

                {releaseSubmitted ? (
                  <div className="ac-hint ac-hint--ok">
                    <CheckCircle2 size={14} />
                    已提交发布：{releaseOrder?.id} 等待三级审批签署，审批通过后将按灰度批次执行。
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ac-btn ac-btn--primary ac-btn--block"
                      disabled={releaseBlocked}
                      title={
                        releaseBlocked
                          ? `存在 ${blockingUnmet.length} 项阻断门禁、${precheckUnmet.length} 项发布前检查未满足，禁止提交发布`
                          : '阻断门禁与 5 项发布前检查全部满足，提交发布至 PROD'
                      }
                      onClick={() => setReleaseModal(true)}
                    >
                      <Rocket size={15} /> 发布到 PROD
                    </button>

                    {releaseBlocked ? (
                      <div className="ac-hint ac-hint--danger ac-mt-3">
                        <ShieldAlert size={14} />
                        <span>
                          {blockingUnmet.length > 0 ? (
                            <>
                              <strong>未满足的阻断门禁（{blockingUnmet.length} 项）：</strong>
                              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                {blockingUnmet.map((g) => (
                                  <li key={g.id}>
                                    {g.id} {g.name}：{g.actual[0]}
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          {precheckUnmet.length > 0 ? (
                            <>
                              <strong className="ac-pipe-block-sub">
                                未满足的发布前检查（{precheckUnmet.length} / 5 项）：
                              </strong>
                              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                {precheckUnmet.map((p) => (
                                  <li key={p.key}>
                                    {CIRCLED_IDX[p.idx - 1]} {p.name}：{p.actual}
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                        </span>
                      </div>
                    ) : (
                      <div className="ac-hint ac-hint--ok ac-mt-3">
                        <CheckCircle2 size={14} />
                        全部阻断类门禁与 5 项发布前检查均已满足，可进入变更窗口提审。
                      </div>
                    )}

                    <div className="ac-hint ac-hint--warn ac-mt-3">
                      <AlertTriangle size={14} />
                      非阻断门禁 G6（观测门禁）当前为待校验，不阻断本次发布，但需在灰度前补齐核心指标告警规则。
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* G3 覆盖率趋势 */}
            <div className="ac-card" data-annotation-id="ai-sdlc-pipeline-g3-trend">
              <div className="ac-card-head">
                <div className="ac-card-title">
                  <FlaskConical size={15} /> 近 {G3_FAILURE_TREND.length} 次构建覆盖率趋势
                </div>
                <div className="ac-card-subtitle">G3 门禁阈值 85%</div>
              </div>
              <div className="ac-card-body">
                <CoverageTrend />
                <div className="ac-col ac-gap-2 ac-mt-3">
                  {G3_FAILURE_TREND.map((d) => (
                    <div key={d.runId} className="ac-row ac-gap-2 ac-xs">
                      <span className="ac-mono ac-muted">{d.runId}</span>
                      <span className="ac-muted">{d.date}</span>
                      <span className="ac-flex-1 ac-ellipsis" title={d.note}>
                        {d.note}
                      </span>
                      <span className="ac-tag ac-tag--sm ac-tag--danger">{d.coverage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ================= 标签页 3：环境与通知 ================= */}
      {tab === 'env' ? (
        <>
          <div className="ac-grid-4" data-annotation-id="ai-sdlc-pipeline-environments">
            {ENVIRONMENTS.map((env) => (
              <EnvCard key={env.id} env={env} />
            ))}
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-pipeline-notify-logs">
            <div className="ac-card-head">
              <div className="ac-card-title">
                <Bell size={15} /> 部署通知记录
              </div>
              <div className="ac-card-subtitle">
                共 {notifyLogs.length} / {DEPLOY_NOTIFY_LOGS.length} 条
              </div>
            </div>
            <div className="ac-card-body ac-card-body--tight">
              <div className="ac-notify-chips ac-mb-3">
                <button
                  type="button"
                  className={`ac-chip ${channel === 'all' ? 'ac-chip--active' : ''}`}
                  onClick={() => setChannel('all')}
                >
                  全部渠道
                </button>
                {channels.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`ac-chip ${channel === c ? 'ac-chip--active' : ''}`}
                    onClick={() => setChannel(c)}
                  >
                    {CHANNEL_META[c]?.label ?? c}
                  </button>
                ))}
              </div>

              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>渠道</th>
                      <th>接收人</th>
                      <th>模板</th>
                      <th>通知内容</th>
                      <th>发送状态</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifyLogs.map((log) => {
                      const ch = CHANNEL_META[log.channel] ?? { label: log.channel, tone: 'neutral' };
                      const Icon = CHANNEL_ICON[log.channel] ?? Bell;
                      const result = NOTIFY_RESULT_META[log.result];
                      const tpl = NOTIFY_TPL_MAP[log.templateId];
                      return (
                        <tr key={log.id}>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${ch.tone}`}>
                              <Icon size={11} /> {ch.label}
                            </span>
                          </td>
                          <td>
                            <span className="ac-row ac-gap-2">
                              <span className="ac-avatar-group">
                                {log.receivers.slice(0, 4).map((id) => {
                                  const u = USER_MAP[id];
                                  return u ? (
                                    <span
                                      key={id}
                                      className={`ac-avatar ac-avatar--xs ac-avatar--${u.avatarColor}`}
                                      title={`${u.name} · ${u.title}`}
                                    >
                                      {u.initial}
                                    </span>
                                  ) : null;
                                })}
                              </span>
                              <span className="ac-xs ac-muted">
                                {log.receivers.map((id) => USER_MAP[id]?.name ?? id).join('、')}
                              </span>
                            </span>
                          </td>
                          <td>
                            <span
                              className="ac-pipe-tpl"
                              title={
                                tpl
                                  ? `模板编号 ${tpl.id}｜投放对象 ${tpl.target}｜触发事件 ${tpl.events.join(' / ')}\n模板正文：${tpl.template}`
                                  : `模板编号 ${log.templateId} 未在通知规则中登记`
                              }
                            >
                              <span className="ac-mono ac-xs ac-bold">{log.templateId}</span>
                              <span className="ac-pipe-tpl-sub ac-xs ac-muted">{tpl?.target ?? '未匹配通知规则'}</span>
                            </span>
                          </td>
                          <td>
                            <div className="ac-sm">{log.title}</div>
                            <div className="ac-xs ac-muted ac-mono">
                              {log.event} · {log.relatedIds.join(' / ')}
                            </div>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${result.tone}`}>{result.label}</span>
                          </td>
                          <td className="ac-td-num">{log.time}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-pipeline-release-orders">
            <div className="ac-card-head">
              <div className="ac-card-title">
                <Box size={15} /> 发布单与回滚
              </div>
              <div className="ac-card-subtitle">共 {RELEASE_ORDERS.length} 张发布单</div>
            </div>
            <div className="ac-card-body ac-card-body--tight">
              {RELEASE_ORDERS.map((order) => {
                const status = releaseOverrides[order.id] ?? order.status;
                const meta = RELEASE_STATUS_META[status];
                const rollbackDisabled = status === 'rolledback' || status === 'planned';
                const env = ENV_MAP[order.envId];
                return (
                  <div key={order.id} className="ac-release-row">
                    <div className="ac-release-main">
                      <div className="ac-row ac-gap-2 ac-row-wrap">
                        <span className="ac-mono ac-sm" style={{ fontWeight: 700 }}>{order.id}</span>
                        <span className="ac-sm" style={{ fontWeight: 700 }}>{order.title}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${meta.tone}`}>{meta.label}</span>
                        {order.gateBlockedIds.length > 0 ? (
                          <span className="ac-tag ac-tag--sm ac-tag--danger">
                            阻断门禁 {order.gateBlockedIds.join(' / ')}
                          </span>
                        ) : null}
                      </div>
                      <div className="ac-row ac-gap-3 ac-xs ac-muted ac-mt-2 ac-row-wrap">
                        <span className="ac-mono">{order.version}</span>
                        <span>{env ? `${env.code} · ${env.name}` : order.envId}</span>
                        <span className="ac-row ac-gap-1">
                          <User size={11} /> {USER_MAP[order.ownerId]?.name ?? order.ownerId}
                        </span>
                        <span className="ac-mono">
                          {order.windowStart} ~ {order.windowEnd}
                        </span>
                        <span>
                          RTO ≤ {order.rtoMin} 分钟 · 演练 {order.rehearsed} 次
                        </span>
                        <span>变更 {order.changeItems} 项</span>
                      </div>
                      <div className="ac-release-batches">
                        {order.batches.map((b) => {
                          const bm = BATCH_STATUS_META[b.status];
                          return (
                            <span
                              key={b.batch}
                              className={`ac-release-batch ${bm.mod ? `ac-release-batch--${bm.mod}` : ''}`}
                              title={`${bm.label} · 观察 ${b.observeMin} 分钟 · ${b.note}`}
                            >
                              批次{b.batch} {b.ratio}%
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ac-btn ac-btn--sm ac-btn--danger-ghost"
                      disabled={rollbackDisabled}
                      title={
                        rollbackDisabled
                          ? status === 'rolledback'
                            ? '该发布单已回滚'
                            : '该发布单尚未发布，无回滚对象'
                          : '发起回滚（二次确认）'
                      }
                      onClick={() => setRollbackTarget(order)}
                    >
                      <Undo2 size={12} /> 回滚
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {/* ---------------- 阶段日志抽屉 ---------------- */}
      <Drawer
        open={Boolean(logNode)}
        title={logNode ? `阶段 ${logNode.idx} · ${logNode.title}` : '阶段日志'}
        subtitle={logNode ? `${run.id} · 对应阶段 ${logNode.realName} · 耗时 ${fmtDur(logNode.durationSec)}` : ''}
        width={620}
        onClose={() => setLogNode(null)}
      >
        {logNode ? (
          <div className="ac-col ac-gap-3">
            <div className="ac-row ac-gap-2 ac-row-wrap">
              <span className={`ac-tag ac-tag--sm ac-tag--${STAGE_STATUS_META[logNode.status].tone}`}>
                {STAGE_STATUS_META[logNode.status].label}
              </span>
              {logNode.gateId ? (
                <span className="ac-tag ac-tag--sm ac-tag--warn">关联门禁 {logNode.gateId}</span>
              ) : null}
              <span className="ac-xs ac-muted ac-mono">stageId: {logNode.stageId}</span>
            </div>
            <div className="ac-code">
              <div className="ac-code-head">
                <span className="ac-code-title">{logNode.realName}</span>
                <span className="ac-code-lang">console</span>
              </div>
              <div className="ac-code-body">{logNode.log}</div>
            </div>
            <div className="ac-hint ac-hint--ai">
              <Terminal size={14} />
              日志为阶段执行摘要（数据层 `PipelineStageDef.log` 单行摘要），完整流水线日志请在 CI 系统中按构建号{' '}
              <span className="ac-mono">{run.id}</span> 检索。
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* ---------------- 发布确认弹窗 ---------------- */}
      <Modal
        open={releaseModal}
        title="确认发布到生产环境"
        subtitle={releaseOrder ? `${releaseOrder.id} · ${releaseOrder.title}` : ''}
        width={560}
        onClose={() => setReleaseModal(false)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setReleaseModal(false)}>
              取消
            </button>
            <button
              type="button"
              className="ac-btn ac-btn--primary"
              onClick={() => {
                setReleaseSubmitted(true);
                setReleaseModal(false);
              }}
            >
              <Rocket size={14} /> 确认提交发布
            </button>
          </>
        }
      >
        {releaseOrder ? (
          <div className="ac-col ac-gap-3">
            <dl className="ac-kv">
              <dt>发布版本</dt>
              <dd className="ac-mono">{releaseOrder.version}</dd>
              <dt>变更窗口</dt>
              <dd className="ac-mono">
                {releaseOrder.windowStart} ~ {releaseOrder.windowEnd}
              </dd>
              <dt>影响服务</dt>
              <dd>{releaseOrder.affectedServices.join('、')}</dd>
              <dt>回滚方案</dt>
              <dd>{releaseOrder.rollbackPlan}</dd>
            </dl>
            <div className="ac-divider" />
            <div className="ac-sm" style={{ fontWeight: 700 }}>审批人确认</div>
            <div className="ac-col ac-gap-2">
              {releaseOrder.approverIds.map((id, i) => {
                const u = USER_MAP[id];
                return (
                  <div key={id} className="ac-row ac-gap-2 ac-sm">
                    <span className={`ac-avatar ac-avatar--sm ac-avatar--${u?.avatarColor ?? 'slate'}`}>
                      {u?.initial ?? '?'}
                    </span>
                    <span>{u?.name ?? id}</span>
                    <span className="ac-xs ac-muted">{u?.title}</span>
                    <span className="ac-ml-auto ac-tag ac-tag--sm ac-tag--neutral">
                      {i === 0 ? '一级审批 · 已签署' : `${i + 1} 级审批 · 待签署`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="ac-hint ac-hint--warn">
              <AlertTriangle size={14} />
              提交后将进入变更审批流，审批通过前不会产生任何生产流量切换。
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ---------------- 回滚二次确认弹窗 ---------------- */}
      <Modal
        open={Boolean(rollbackTarget)}
        title="回滚确认"
        subtitle={rollbackTarget ? `${rollbackTarget.id} · ${rollbackTarget.title}` : ''}
        width={540}
        onClose={() => setRollbackTarget(null)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setRollbackTarget(null)}>
              取消
            </button>
            <button
              type="button"
              className="ac-btn ac-btn--danger"
              onClick={() => {
                if (rollbackTarget) {
                  setReleaseOverrides((prev) => ({ ...prev, [rollbackTarget.id]: 'rolledback' }));
                }
                setRollbackTarget(null);
              }}
            >
              <Undo2 size={14} /> 确认回滚
            </button>
          </>
        }
      >
        {rollbackTarget ? (
          <div className="ac-col ac-gap-3">
            <div className="ac-hint ac-hint--danger">
              <AlertTriangle size={14} />
              回滚为不可逆的高风险操作，请再次确认目标版本与回切动作。
            </div>
            <dl className="ac-kv">
              <dt>当前版本</dt>
              <dd className="ac-mono">{rollbackTarget.version}</dd>
              <dt>回滚方案</dt>
              <dd>{rollbackTarget.rollbackPlan}</dd>
              <dt>目标 RTO</dt>
              <dd className="ac-mono">≤ {rollbackTarget.rtoMin} 分钟（已演练 {rollbackTarget.rehearsed} 次）</dd>
              <dt>影响服务</dt>
              <dd>{rollbackTarget.affectedServices.join('、')}</dd>
              <dt>灰度批次</dt>
              <dd>
                {rollbackTarget.batches
                  .map((b) => `批次${b.batch}(${b.ratio}%) ${BATCH_STATUS_META[b.status].label}`)
                  .join(' · ')}
              </dd>
            </dl>
            <div className="ac-hint ac-hint--ai">
              <Clock size={14} />
              确认后将推送飞书卡片与值班短信至 {rollbackTarget.approverIds.map((id) => USER_MAP[id]?.name ?? id).join('、')}。
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ============================================================
 * 环境卡片
 * ============================================================ */
function EnvCard({ env }: { env: EnvDef }) {
  const totalReplicas = env.instances.reduce((s, i) => s + i.replicas, 0);
  const readyReplicas = env.instances.reduce((s, i) => s + i.readyReplicas, 0);
  const cpu = avgUsage(env.instances.map((i) => i.cpu));
  const mem = avgUsage(env.instances.map((i) => i.mem));
  const healthLabel = env.health === 'healthy' ? '健康' : env.health === 'degraded' ? '降级' : '不可用';

  return (
    <div className="ac-card">
      <div className="ac-card-head">
        <div className="ac-card-title ac-env-head">
          <span className={`ac-env-dot ac-env-dot--${env.health}`} />
          <span className="ac-mono">{env.code}</span>
          <span>{env.name}</span>
        </div>
        <div className="ac-card-extra">
          <span
            className={`ac-tag ac-tag--sm ac-tag--${
              env.health === 'healthy' ? 'ok' : env.health === 'degraded' ? 'warn' : 'danger'
            }`}
          >
            {healthLabel}
          </span>
        </div>
      </div>
      <div className="ac-card-body ac-card-body--tight ac-col ac-gap-3">
        <dl className="ac-kv" style={{ gridTemplateColumns: '72px minmax(0, 1fr)' }}>
          <dt>当前版本</dt>
          <dd className="ac-mono ac-ellipsis" title={env.version}>{env.version}</dd>
          <dt>实例</dt>
          <dd className="ac-mono">
            {readyReplicas} / {totalReplicas} 就绪
          </dd>
          <dt>最近部署</dt>
          <dd className="ac-mono">{env.lastDeployAt}</dd>
          <dt>命名空间</dt>
          <dd className="ac-mono ac-ellipsis" title={env.namespace}>{env.namespace}</dd>
        </dl>

        <div className="ac-env-metric">
          <div className="ac-env-metric-head">
            <Cpu size={12} /> CPU 平均占用
            <span className="ac-ml-auto ac-mono">{cpu === null ? '—' : `${cpu}%`}</span>
          </div>
          <div className="ac-progress ac-progress--sm">
            <div
              className={`ac-progress-bar ac-progress-bar--${usageTone(cpu ?? 0)}`}
              style={{ width: `${cpu ?? 0}%` }}
            />
          </div>
        </div>

        <div className="ac-env-metric">
          <div className="ac-env-metric-head">
            <Server size={12} /> 内存平均占用
            <span className="ac-ml-auto ac-mono">{mem === null ? '—' : `${mem}%`}</span>
          </div>
          <div className="ac-progress ac-progress--sm">
            <div
              className={`ac-progress-bar ac-progress-bar--${usageTone(mem ?? 0)}`}
              style={{ width: `${mem ?? 0}%` }}
            />
          </div>
        </div>

        <div className="ac-env-instances">
          {env.instances.map((inst) => (
            <div key={inst.name} className="ac-env-inst">
              <span className={`ac-env-dot ac-env-dot--${inst.status}`} />
              <span className="ac-flex-1 ac-ellipsis" title={inst.name}>{inst.name}</span>
              <span className="ac-mono ac-xs">
                {inst.readyReplicas}/{inst.replicas}
              </span>
              <span className="ac-mono ac-xs ac-muted" title={`CPU ${inst.cpu} · 内存 ${inst.mem}`}>
                {inst.cpu}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * G3 覆盖率趋势（内联 SVG 手绘）
 * ============================================================ */
function CoverageTrend() {
  const w = 320;
  const h = 140;
  const padL = 36;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const min = 60;
  const max = 90;
  const n = G3_FAILURE_TREND.length;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * innerH;
  const points = G3_FAILURE_TREND.map((d, i) => `${x(i)},${y(d.coverage)}`).join(' ');
  const threshY = y(85);

  return (
    <div className="ac-trend-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="ac-trend-svg" role="img" aria-label="近 3 次构建覆盖率趋势">
        {/* 坐标轴 */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#e2e6ec" strokeWidth="1" />
        <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke="#e2e6ec" strokeWidth="1" />
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="9" fill="#98a2b0">
          {max}
        </text>
        <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" fontSize="9" fill="#98a2b0">
          {min}
        </text>
        {/* 阈值线 */}
        <line
          x1={padL}
          y1={threshY}
          x2={w - padR}
          y2={threshY}
          stroke="#ef4444"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
        <text x={w - padR} y={threshY - 4} textAnchor="end" fontSize="9" fill="#ef4444">
          阈值 85%
        </text>
        {/* 趋势线 */}
        <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="2" />
        {G3_FAILURE_TREND.map((d, i) => (
          <g key={d.runId}>
            <circle cx={x(i)} cy={y(d.coverage)} r="4" fill="#ffffff" stroke="#4f46e5" strokeWidth="2" />
            <text x={x(i)} y={y(d.coverage) - 9} textAnchor="middle" fontSize="9.5" fill="#131a24" fontWeight="700">
              {d.coverage}
            </text>
            <text x={x(i)} y={h - 14} textAnchor="middle" fontSize="9" fill="#98a2b0">
              {d.date.slice(5)}
            </text>
            <text x={x(i)} y={h - 3} textAnchor="middle" fontSize="8.5" fill="#98a2b0">
              用例 +{d.addedCases}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
