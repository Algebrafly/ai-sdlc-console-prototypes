/**
 * AI 编码协作（pageId: coding）
 * 平台侧：任务选择器 · AI 会话流（可回放）· 代码上下文切片 · Diff 逐块审查 · 本地执行结果 → 触发部署门禁
 * IDE 侧：VS Code / JetBrains 插件把本地 AI 编码的会话、Diff、单测、覆盖率与脱敏结果回流平台
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Ban,
  Blocks,
  Bot,
  ChartColumn,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CloudUpload,
  Cpu,
  Eye,
  ExternalLink,
  FileCode2,
  FileDiff,
  FlaskConical,
  FolderLock,
  Gauge,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Inbox,
  Info,
  KeyRound,
  Laptop,
  Layers,
  ListChecks,
  ListTree,
  Lock,
  Merge,
  Monitor,
  OctagonAlert,
  Package,
  Plug,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Rocket,
  ScanSearch,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Sparkles,
  Split,
  Square,
  Terminal,
  Timer,
  TrendingUp,
  Undo2,
  Unplug,
  Upload,
  User,
  Wifi,
  WifiOff,
  Workflow,
  Wrench,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  agents,
  CODING_SESSION_MAP,
  CODING_SESSIONS,
  CURRENT_SPRINT,
  egressPolicy,
  GATE_MAP,
  models,
  PIPELINE_MAP,
  redactRules,
  TASK_MAP,
  TASK_STATES,
  USER_MAP,
  type Executor,
  type Tone,
} from '../data';
import {
  AI_AUTOMATION_FLOWS,
  AI_FLOW_TODAY,
  AI_TOOL_PROVIDERS,
  IDE_PLUGINS,
  IDE_SYNC_EVENTS,
  IDE_SYNC_SESSIONS,
  type IdeSyncConflictDef,
  type IdeSyncEventDef,
  type IdeSyncMetricsDef,
  type IdeSyncSessionDef,
} from '../data-ai-flow';
import Drawer from '../components/Drawer';
import './coding.css';

type CodingSession = (typeof CODING_SESSIONS)[number];
type SessionTurn = CodingSession['transcript'][number];

/* ============================================================
 * 本地 mock 生成器（data.ts 未提供 Diff / 切片明细 / 本地执行结果）
 * 以会话 id 为种子确定性生成，保证同一会话每次渲染一致
 * ============================================================ */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let s = seed || 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/* ---------- 上下文切片 ---------- */
interface ContextSlice {
  path: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  symbol: string;
  masked: boolean;
  bytes: number;
}

function buildSlices(session: CodingSession): ContextSlice[] {
  return session.contextFiles.map((path) => {
    const rnd = makeRng(fnv1a(`${session.id}:${path}`));
    const file = path.split('/').pop() ?? path;
    const base = file.replace(/\.[^.]+$/, '');
    const isDoc = /\.(md|ya?ml|json)$/.test(file);
    const lineStart = 1 + Math.floor(rnd() * 36);
    const span = isDoc ? 10 + Math.floor(rnd() * 18) : 36 + Math.floor(rnd() * 150);
    return {
      path,
      file,
      lineStart,
      lineEnd: lineStart + span,
      symbol: isDoc ? `${base}（文档）` : base,
      masked: isDoc ? true : rnd() > 0.28,
      bytes: 1024 + Math.floor(rnd() * 24000),
    };
  });
}

/* ---------- Diff ---------- */
interface DiffLine {
  kind: 'add' | 'del' | 'ctx';
  oldNo: number | null;
  newNo: number | null;
  text: string;
}
interface DiffHunk {
  header: string;
  lines: DiffLine[];
}
interface DiffFile {
  path: string;
  file: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}
interface RawHunk {
  symbol: string;
  ctx: string[];
  del: string[];
  add: string[];
}

function rawHunks(file: string, sym: string): RawHunk[] {
  if (/\.java$/.test(file)) {
    return [
      {
        symbol: `${sym}#handle`,
        ctx: [`public class ${sym} {`, ''],
        del: ['    public void handle(Request req) {', '        service.create(req);'],
        add: [
          '    /** 幂等入口：先查回放，再落库 */',
          '    public void handle(Request req) {',
          '        guard.assertKey(req.getIdemKey());',
          '        if (guard.tryReplay(req.getIdemKey())) {',
          '            metrics.counter("idem.replay").increment();',
          '            return;',
          '        }',
          '        service.create(req.getIdemKey(), req);',
        ],
      },
      {
        symbol: `${sym}#deps`,
        ctx: ['    }', ''],
        del: ['    private final OrderService service;'],
        add: ['    private final IdempotencyGuard guard;', '    private final OrderService service;'],
      },
    ];
  }
  if (/\.ya?ml$/.test(file)) {
    return [
      {
        symbol: 'order.idem',
        ctx: ['order:', '  idem:'],
        del: ['    ttl-seconds: 3600'],
        add: ['    ttl-seconds: 86400', '    strict-mode: true'],
      },
    ];
  }
  if (/\.md$/.test(file)) {
    return [
      {
        symbol: '幂等语义',
        ctx: ['## 幂等语义', ''],
        del: ['- 重复提交直接返回 500'],
        add: ['- 重复提交返回首次结果 + `ORDER_DUPLICATED`', '- 命中回放不重复落库，日志手机号脱敏'],
      },
    ];
  }
  if (/\.(ts|vue)$/.test(file)) {
    return [
      {
        symbol: `${sym}·setup`,
        ctx: [`// ${sym}`, ''],
        del: ['const retry = ref(0)'],
        add: ['const idemKey = ref(genIdemKey())', 'const retry = ref(0)'],
      },
    ];
  }
  return [
    {
      symbol: sym,
      ctx: [`// ${file}`, ''],
      del: ['// TODO: 待补充'],
      add: ['// 已按契约实现', '// 覆盖异常分支'],
    },
  ];
}

function buildDiffFiles(session: CodingSession): DiffFile[] {
  return session.contextFiles.slice(0, 3).map((path) => {
    const file = path.split('/').pop() ?? path;
    const sym = file.replace(/\.[^.]+$/, '');
    let oldBase = 1 + ((fnv1a(path) >>> 3) % 28);
    let newBase = oldBase;
    const hunks: DiffHunk[] = rawHunks(file, sym).map((raw) => {
      const lines: DiffLine[] = [];
      let o = oldBase;
      let n = newBase;
      raw.ctx.forEach((text) => {
        lines.push({ kind: 'ctx', oldNo: o, newNo: n, text });
        o += 1;
        n += 1;
      });
      raw.del.forEach((text) => {
        lines.push({ kind: 'del', oldNo: o, newNo: null, text });
        o += 1;
      });
      raw.add.forEach((text) => {
        lines.push({ kind: 'add', oldNo: null, newNo: n, text });
        n += 1;
      });
      const header = `@@ -${oldBase},${raw.ctx.length + raw.del.length} +${newBase},${raw.ctx.length + raw.add.length} @@ ${raw.symbol}`;
      oldBase = o + 4;
      newBase = n + 4;
      return { header, lines };
    });
    return {
      path,
      file,
      additions: hunks.reduce((s, h) => s + h.lines.filter((l) => l.kind === 'add').length, 0),
      deletions: hunks.reduce((s, h) => s + h.lines.filter((l) => l.kind === 'del').length, 0),
      hunks,
    };
  });
}

/* ---------- 本地执行结果 ---------- */
interface ExecRun {
  id: string;
  command: string;
  exitCode: number;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  time: string;
  log: string[];
}

function buildExecRuns(session: CodingSession): ExecRun[] {
  const seed = fnv1a(`exec:${session.id}`);
  const rnd = makeRng(seed);
  const total = 96 + Math.floor(rnd() * 168);
  const hasFail = seed % 4 === 3;
  const failed = hasFail ? 1 + Math.floor(rnd() * 3) : 0;
  const skipped = Math.floor(rnd() * 3);
  const passed = total - failed - skipped;
  const module = session.contextFiles[0]?.split('/')[0] ?? 'order-api';
  const unitMs = 41000 + Math.floor(rnd() * 60000);
  const verifyMs = 63000 + Math.floor(rnd() * 90000);
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return [
    {
      id: `${session.id}-R1`,
      command: `mvn -q -pl ${module} test`,
      exitCode: 0,
      durationMs: unitMs,
      passed: Math.floor(passed * 0.7),
      failed: 0,
      skipped: 0,
      time: session.startedAt,
      log: [
        `[INFO] Scanning for projects...`,
        `[INFO] Building ${module} 1.0.0-SNAPSHOT`,
        `[INFO] Tests run: ${Math.floor(passed * 0.7)}, Failures: 0, Errors: 0, Skipped: 0`,
        `[INFO] BUILD SUCCESS`,
        `[INFO] Total time: ${s(unitMs)}`,
      ],
    },
    {
      id: `${session.id}-R2`,
      command: 'mvn -q verify -Pcoverage -DskipITs=false',
      exitCode: failed > 0 ? 1 : 0,
      durationMs: verifyMs,
      passed,
      failed,
      skipped,
      time: session.endedAt,
      log: [
        `[INFO] Building ${module} 1.0.0-SNAPSHOT`,
        `[INFO] Tests run: ${total}, Failures: ${failed}, Errors: 0, Skipped: ${skipped}`,
        ...(failed > 0
          ? [
              `[ERROR] OrderCreateControllerTest.handle:88 期望 409 实际 500`,
              `[ERROR] IdempotencyGuardTest.replay:64 未命中回放分支`,
              `[INFO] BUILD FAILURE`,
            ]
          : [`[INFO] JaCoCo: 增量分支覆盖率 ${(72 + rnd() * 20).toFixed(1)}%`, `[INFO] BUILD SUCCESS`]),
        `[INFO] Total time: ${s(verifyMs)}`,
      ],
    },
  ];
}

/* ============================================================
 * 展示辅助
 * ============================================================ */
function roleLabel(turn: SessionTurn): string {
  if (turn.role === 'user') return '人工指令';
  if (turn.role === 'tool') return '工具调用';
  return /方案|是否|建议/.test(turn.content) ? 'Agent 思考' : 'Agent 产出';
}

function actorName(turn: SessionTurn): string {
  return USER_MAP[turn.actorId]?.name ?? 'AI 编码 Agent';
}

function fmtBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

type HunkDecision = 'pending' | 'accepted' | 'rejected';

/* ============================================================
 * 本地 IDE AI 使用结果同步（VS Code / JetBrains 插件 → 平台）
 * 与上方「平台侧 AI 会话流」是两个不同视角：
 *   平台侧 = 平台托管的 AI 编码会话（CODING_SESSIONS）；
 *   IDE 侧 = 程序员在本地 IDE 用 AI 编码，插件把会话 / Diff / 单测结果 /
 *            覆盖率 / 脱敏情况回流平台（IDE_SYNC_SESSIONS）。
 * ============================================================ */
type IdeSession = IdeSyncSessionDef;
type IdeEvent = IdeSyncEventDef;
type EgressCode = IdeSession['privacy']['egressMode'];
type IdeSortKey = 'id' | 'lastSyncAt' | 'pendingUploads' | 'uploadBytes';

/** 治理动作的本地乐观更新补丁 */
interface GovOverride {
  syncMode?: IdeSession['syncMode'];
  connectionStatus?: IdeSession['connectionStatus'];
  syncState?: IdeSession['syncState'];
  syncStateLabel?: string;
  pendingUploads?: number;
}

/** Tone → ac-tag--{tone}：style.css 只有 7 种 tag 色，12 值 Tone 需归并 */
function tagTone(tone: Tone): string {
  const map: Record<Tone, string> = {
    brand: 'brand', ai: 'ai', ok: 'ok', warn: 'warn', danger: 'danger',
    info: 'info', neutral: 'neutral', slate: 'neutral', teal: 'ok',
    pink: 'danger', indigo: 'brand', amber: 'warn',
  };
  return map[tone];
}

/** Tone → ac-timeline-item--{mod}：仅 ok / warn / danger / ai / dim 有样式定义 */
function timelineMod(tone: Tone): string {
  const t = tagTone(tone);
  if (t === 'ok' || t === 'warn' || t === 'danger' || t === 'ai') return t;
  if (t === 'neutral') return 'dim';
  return '';
}

/** Tone → 手绘 SVG 取色（内联 SVG 无法用 CSS 变量做 fill 计算，统一走色值） */
const TONE_HEX: Record<Tone, string> = {
  brand: '#4f46e5', ai: '#7c3aed', ok: '#10b981', warn: '#f59e0b',
  danger: '#ef4444', info: '#3b82f6', neutral: '#94a3b8', slate: '#64748b',
  teal: '#0d9488', pink: '#db2777', indigo: '#4338ca', amber: '#b45309',
};

const MODEL_MAP = Object.fromEntries(models.map((m) => [m.id, m] as const));
const AGENT_MAP = Object.fromEntries(agents.map((a) => [a.id, a] as const));
const PROVIDER_MAP = Object.fromEntries(AI_TOOL_PROVIDERS.map((p) => [p.id, p] as const));
const REDACT_BY_FIELD = Object.fromEntries(redactRules.map((r) => [r.field, r] as const));
const EGRESS_BY_CODE = Object.fromEntries(egressPolicy.map((p) => [p.code, p] as const));

const SYNC_MODE_LABEL: Record<IdeSession['syncMode'], string> = {
  realtime: '实时长连接',
  batch: '定时批量',
  manual: '手动触发',
  'offline-queue': '离线队列',
};

const CONN_META: Record<IdeSession['connectionStatus'], { label: string; tone: Tone; Icon: LucideIcon }> = {
  online: { label: '在线', tone: 'ok', Icon: Wifi },
  degraded: { label: '降级', tone: 'warn', Icon: Activity },
  offline: { label: '离线', tone: 'danger', Icon: WifiOff },
};

const SYNC_STATE_LABEL: Record<IdeSession['syncState'], string> = {
  synced: '已同步',
  partial: '部分同步',
  conflict: '冲突待复核',
  queued: '排队中',
  failed: '同步失败',
};

const SYNC_STATE_ORDER: IdeSession['syncState'][] = ['synced', 'partial', 'conflict', 'queued', 'failed'];

const SYNC_STATE_TONE: Record<IdeSession['syncState'], Tone> = {
  synced: 'ok',
  partial: 'warn',
  conflict: 'danger',
  queued: 'info',
  failed: 'danger',
};

const EGRESS_META: Record<EgressCode, { label: string; tone: Tone; Icon: LucideIcon }> = {
  ALLOW: { label: '允许出域', tone: 'ok', Icon: ShieldCheck },
  MASK: { label: '脱敏后出域', tone: 'warn', Icon: ShieldOff },
  DENY: { label: '禁止出域', tone: 'danger', Icon: Ban },
};

const RESOLVED_BY_META: Record<IdeSyncConflictDef['resolvedBy'], { label: string; tone: Tone }> = {
  human: { label: '人工解决', tone: 'brand' },
  ai: { label: 'AI 三方合并', tone: 'ai' },
  auto: { label: '自动合并', tone: 'info' },
};

const LEVEL_META: Record<IdeEvent['level'], { label: string; tone: Tone }> = {
  info: { label: '常规', tone: 'neutral' },
  warn: { label: '告警', tone: 'warn' },
  error: { label: '错误', tone: 'danger' },
};

/** 16 种同步事件类型：中文名 + 图标 + 色标 */
const EVENT_META: Record<IdeEvent['type'], { label: string; tone: Tone; Icon: LucideIcon }> = {
  connect: { label: '建立连接', tone: 'ok', Icon: Plug },
  auth: { label: '鉴权换取令牌', tone: 'info', Icon: KeyRound },
  'context-collect': { label: '上下文采集', tone: 'info', Icon: Layers },
  mask: { label: '出网前脱敏', tone: 'warn', Icon: ShieldOff },
  'ai-turn': { label: 'AI 轮次', tone: 'ai', Icon: Bot },
  accept: { label: '采纳补丁', tone: 'ok', Icon: Check },
  reject: { label: '拒绝补丁', tone: 'warn', Icon: X },
  'diff-upload': { label: 'Diff 上行', tone: 'ok', Icon: FileDiff },
  'test-result': { label: '单测结果回传', tone: 'info', Icon: FlaskConical },
  coverage: { label: '覆盖率回传', tone: 'info', Icon: Gauge },
  conflict: { label: '版本冲突', tone: 'warn', Icon: GitMerge },
  retry: { label: '退避重试', tone: 'warn', Icon: RefreshCw },
  'offline-queue': { label: '入离线队列', tone: 'warn', Icon: Inbox },
  flush: { label: '队列补传', tone: 'ok', Icon: CloudUpload },
  disconnect: { label: '断连收尾', tone: 'neutral', Icon: Unplug },
  error: { label: '同步错误', tone: 'danger', Icon: OctagonAlert },
};

/** 需要在事件流中视觉突出的关键生命周期节点 */
const KEY_EVENT_TYPES: IdeEvent['type'][] = ['mask', 'conflict', 'offline-queue', 'flush', 'error', 'retry'];

/** 7 类上行产物：中文名 + 图标 */
const ARTIFACT_META: Record<IdeSession['artifactsUploaded'][number], { label: string; Icon: LucideIcon }> = {
  'ai-session': { label: 'AI 会话记录', Icon: ScrollText },
  diff: { label: '代码 Diff', Icon: FileDiff },
  'test-result': { label: '本地测试结果', Icon: FlaskConical },
  coverage: { label: '覆盖率报告', Icon: Gauge },
  'lint-report': { label: '静态扫描报告', Icon: ScanSearch },
  'context-snapshot': { label: '上下文快照', Icon: Layers },
  'commit-meta': { label: '提交元信息', Icon: GitCommitHorizontal },
};

const ARTIFACT_ORDER = Object.keys(ARTIFACT_META) as IdeSession['artifactsUploaded'];
/** G3 编码门禁直接消费的三类上行产物 */
const G3_ARTIFACTS = ['test-result', 'coverage', 'lint-report'] as IdeSession['artifactsUploaded'];

/** 插件能力清单：按名称前缀匹配（双端文案略有差异，如「任务卡侧栏（Tool Window）」） */
const FEATURE_META: { prefix: string; Icon: LucideIcon; desc: string }[] = [
  { prefix: '内联 AI 补全', Icon: Zap, desc: '编辑器内 Tab 补全，被采纳行数计入 aiAcceptedLines' },
  { prefix: '任务卡侧栏', Icon: ListTree, desc: '展示已认领任务的验收标准与上下文切片清单' },
  { prefix: '上下文切片选择器', Icon: Layers, desc: '勾选参与上行的文件与行范围，最小化上传' },
  { prefix: 'Diff 逐块接受', Icon: Split, desc: '按 hunk 接受 / 拒绝，拒绝理由回灌为负样本' },
  { prefix: '本地单测执行', Icon: FlaskConical, desc: '一键跑本地单测，结果作为 G3 判据上行' },
  { prefix: '脱敏预览', Icon: Eye, desc: '出网前预览命中的脱敏规则与被替换字段' },
  { prefix: '离线队列', Icon: Inbox, desc: '断网时加密落盘，回连后按序补传并校验 sha256' },
  { prefix: '一键提 MR', Icon: GitPullRequest, desc: '门禁预检通过后自动建 MR 并指派 2 名评审人' },
  { prefix: 'Agent 会话面板', Icon: Bot, desc: '在 IDE 内与 ag-code / ag-review 多轮对话' },
  { prefix: '门禁预检', Icon: ShieldCheck, desc: '提交前本地预跑 G3 判据，未达标不出网' },
];

function featureMeta(name: string) {
  return FEATURE_META.find((f) => name.startsWith(f.prefix));
}

const EXECUTOR_META: Record<Executor, { label: string; tone: Tone }> = {
  ai: { label: 'AI 自动', tone: 'ai' },
  human: { label: '人工执行', tone: 'brand' },
  'ai+human': { label: '人机协同', tone: 'info' },
};

const IDE_META: Record<IdeSession['ide'], { label: string; Icon: LucideIcon }> = {
  vscode: { label: 'VS Code', Icon: Monitor },
  jetbrains: { label: 'JetBrains', Icon: Laptop },
};

/* ---------- 数值格式化 ---------- */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtBytesBig(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtDurSec(sec: number): string {
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)} 小时`;
  if (sec >= 60) return `${Math.round(sec / 60)} 分钟`;
  return `${sec} 秒`;
}

/** 'YYYY-MM-DD HH:mm:ss' → 'HH:mm:ss' */
function hhmmss(at: string): string {
  return at.slice(11);
}

/** 'YYYY-MM-DD HH:mm:ss' → 毫秒时间戳（泳道图横轴用） */
function tsMs(at: string): number {
  return new Date(`${at.slice(0, 10)}T${at.slice(11)}`).getTime();
}

/** 仓库地址截断展示（悬浮看全量） */
function repoShort(url: string): string {
  const tail = url.split(':').pop() ?? url;
  return tail.replace(/\.git$/, '');
}

/**
 * IDE-07 上行流量核算：只统计 direction = ide→platform 且 bytes 非空的事件，
 * 其合计值与 IDE-07.metrics.uploadBytes 完全一致（含离线队列入队与补传的两次计数）。
 */
const IDE07_UPLOAD = (() => {
  const up = IDE_SYNC_EVENTS.filter(
    (e) => e.sessionId === 'IDE-07' && e.direction === 'ide→platform' && e.bytes !== null,
  );
  return { count: up.length, bytes: up.reduce((a, e) => a + (e.bytes ?? 0), 0) };
})();

/* ============================================================
 * 页面
 * ============================================================ */
export default function CodingPage() {
  const [sessionId, setSessionId] = useState(CODING_SESSIONS[0].id);
  const [visibleCount, setVisibleCount] = useState(CODING_SESSIONS[0].transcript.length);
  const [playing, setPlaying] = useState(false);
  const [fileIndex, setFileIndex] = useState(0);
  const [hunkState, setHunkState] = useState<Record<string, HunkDecision>>({});
  const [commitMsg, setCommitMsg] = useState('');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const session = useMemo(
    () => CODING_SESSIONS.find((s) => s.id === sessionId) ?? CODING_SESSIONS[0],
    [sessionId],
  );
  const task = TASK_MAP[session.taskId];
  const owner = USER_MAP[session.ownerId];

  const slices = useMemo(() => buildSlices(session), [session]);
  const diffFiles = useMemo(() => buildDiffFiles(session), [session]);
  const execRuns = useMemo(() => buildExecRuns(session), [session]);
  const latestRun = execRuns[execRuns.length - 1];
  const deployable = latestRun.exitCode === 0 && latestRun.failed === 0;

  /* 切换会话：重置审查状态与回放进度 */
  useEffect(() => {
    setVisibleCount(session.transcript.length);
    setPlaying(false);
    setFileIndex(0);
    setHunkState({});
    setExpandedRun(null);
    setCommitMsg(`feat(order): ${task.title}`);
  }, [session, task]);

  const total = session.transcript.length;

  /* 逐条流式回放 */
  useEffect(() => {
    if (!playing) return undefined;
    if (visibleCount >= total) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setVisibleCount((c) => Math.min(c + 1, total));
    }, 760);
    return () => window.clearInterval(timer);
  }, [playing, visibleCount, total]);

  const visibleTurns = session.transcript.slice(0, visibleCount);
  const currentFile = diffFiles[fileIndex] ?? diffFiles[0];

  /* Diff 决策：key = `${fileIndex}-${hunkIndex}` */
  const allKeys = useMemo(
    () => diffFiles.flatMap((f, fi) => f.hunks.map((_, hi) => `${fi}-${hi}`)),
    [diffFiles],
  );
  const summary = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    let pending = 0;
    allKeys.forEach((k) => {
      const v = hunkState[k] ?? 'pending';
      if (v === 'accepted') accepted += 1;
      else if (v === 'rejected') rejected += 1;
      else pending += 1;
    });
    return { accepted, rejected, pending };
  }, [allKeys, hunkState]);

  const decide = (fi: number, hi: number, value: HunkDecision) =>
    setHunkState((prev) => ({ ...prev, [`${fi}-${hi}`]: value }));

  const decideAll = (value: HunkDecision) =>
    setHunkState(Object.fromEntries(allKeys.map((k) => [k, value])));

  const totalBytes = slices.reduce((s, x) => s + x.bytes, 0);

  /* ============================================================
   * 本地 IDE 同步：状态与派生数据
   * ============================================================ */
  const [ideOpen, setIdeOpen] = useState(true);
  const [ideTab, setIdeTab] = useState<'overview' | 'health'>('overview');
  const [detailId, setDetailId] = useState<string | null>(null);

  /* 会话表：多维筛选 + 关键字 + 排序 */
  const [fIde, setFIde] = useState<'all' | IdeSession['ide']>('all');
  const [fMode, setFMode] = useState<'all' | IdeSession['syncMode']>('all');
  const [fConn, setFConn] = useState<'all' | IdeSession['connectionStatus']>('all');
  const [fState, setFState] = useState<'all' | IdeSession['syncState']>('all');
  const [fEgress, setFEgress] = useState<'all' | EgressCode>('all');
  const [fUser, setFUser] = useState('all');
  const [fKeyword, setFKeyword] = useState('');
  const [sortKey, setSortKey] = useState<IdeSortKey>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  /* 事件流：类型筛选 + 只看异常 */
  const [evTypes, setEvTypes] = useState<IdeEvent['type'][]>([]);
  const [evAbnormal, setEvAbnormal] = useState(false);

  /* 治理动作：本地乐观更新 + 撤销 */
  const [govOverrides, setGovOverrides] = useState<Record<string, GovOverride>>({});
  const [govToast, setGovToast] = useState<{
    n: number;
    sessionId: string;
    text: string;
    prev: GovOverride | null;
  } | null>(null);

  /* 门禁联动演示所选会话 */
  const [gateSessionId, setGateSessionId] = useState(IDE_SYNC_SESSIONS[0].id);

  /** 叠加治理乐观更新后的会话集合 */
  const ideSessions = useMemo<IdeSession[]>(
    () => IDE_SYNC_SESSIONS.map((s) => ({ ...s, ...(govOverrides[s.id] ?? {}) })),
    [govOverrides],
  );

  const ideUserOptions = useMemo(
    () => Array.from(new Set(IDE_SYNC_SESSIONS.map((s) => s.userId))),
    [],
  );

  const ideStats = useMemo(() => {
    const sum = (f: (s: IdeSession) => number) => ideSessions.reduce((a, s) => a + f(s), 0);
    const accepted = sum((s) => s.metrics.aiAcceptedLines);
    const rejected = sum((s) => s.metrics.aiRejectedLines);
    const todayList = ideSessions.filter((s) => s.lastSyncAt.slice(0, 10) === AI_FLOW_TODAY);
    const byEgress = { ALLOW: 0, MASK: 0, DENY: 0 } as Record<EgressCode, number>;
    ideSessions.forEach((s) => {
      byEgress[s.privacy.egressMode] += 1;
    });
    return {
      online: ideSessions.filter((s) => s.connectionStatus === 'online').length,
      degraded: ideSessions.filter((s) => s.connectionStatus === 'degraded').length,
      offline: ideSessions.filter((s) => s.connectionStatus === 'offline').length,
      pending: sum((s) => s.pendingUploads),
      accepted,
      rejected,
      acceptRate: accepted + rejected > 0 ? (accepted / (accepted + rejected)) * 100 : 0,
      todayCount: todayList.length,
      todayAccepted: todayList.reduce((a, s) => a + s.metrics.aiAcceptedLines, 0),
      bytes: sum((s) => s.metrics.uploadBytes),
      maskHits: sum((s) => s.metrics.maskHitCount),
      tokensMasked: sum((s) => s.metrics.tokensMasked),
      byEgress,
    };
  }, [ideSessions]);

  const ideRows = useMemo(() => {
    const kw = fKeyword.trim().toLowerCase();
    const list = ideSessions.filter((s) => {
      if (fIde !== 'all' && s.ide !== fIde) return false;
      if (fMode !== 'all' && s.syncMode !== fMode) return false;
      if (fConn !== 'all' && s.connectionStatus !== fConn) return false;
      if (fState !== 'all' && s.syncState !== fState) return false;
      if (fEgress !== 'all' && s.privacy.egressMode !== fEgress) return false;
      if (fUser !== 'all' && s.userId !== fUser) return false;
      if (kw) {
        const t = TASK_MAP[s.taskId];
        const hay = `${s.id} ${s.repoUrl} ${s.branch} ${s.taskId} ${t ? t.code : ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (s: IdeSession): number | string => {
      if (sortKey === 'lastSyncAt') return s.lastSyncAt;
      if (sortKey === 'pendingUploads') return s.pendingUploads;
      if (sortKey === 'uploadBytes') return s.metrics.uploadBytes;
      return s.id;
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [ideSessions, fIde, fMode, fConn, fState, fEgress, fUser, fKeyword, sortKey, sortDir]);

  /** 需要治理的会话：同步失败 / 冲突 / 连接降级 / 离线 */
  const ideProblems = useMemo(
    () =>
      ideSessions.filter(
        (s) =>
          s.syncState === 'failed' ||
          s.syncState === 'conflict' ||
          s.connectionStatus === 'degraded' ||
          s.connectionStatus === 'offline',
      ),
    [ideSessions],
  );

  const acceptAvg = useMemo(
    () => ideSessions.reduce((a, s) => a + s.metrics.acceptRatePct, 0) / Math.max(ideSessions.length, 1),
    [ideSessions],
  );

  const stateDist = useMemo(
    () =>
      SYNC_STATE_ORDER.map((k) => ({
        key: k,
        label: SYNC_STATE_LABEL[k],
        color: TONE_HEX[SYNC_STATE_TONE[k]],
        value: ideSessions.filter((s) => s.syncState === k).length,
      })),
    [ideSessions],
  );

  const detail = useMemo(
    () => ideSessions.find((s) => s.id === detailId) ?? null,
    [ideSessions, detailId],
  );
  const detailEvents = useMemo(
    () =>
      IDE_SYNC_EVENTS.filter((e) => e.sessionId === detailId).sort((a, b) => a.at.localeCompare(b.at)),
    [detailId],
  );
  const evRows = useMemo(
    () =>
      detailEvents.filter((e) => {
        if (evTypes.length > 0 && !evTypes.includes(e.type)) return false;
        if (evAbnormal && e.level === 'info') return false;
        return true;
      }),
    [detailEvents, evTypes, evAbnormal],
  );
  /** 上行流量核算：仅统计 ide→platform 且 bytes 非空的事件 */
  const evUpload = useMemo(() => {
    const up = detailEvents.filter((e) => e.direction === 'ide→platform' && e.bytes !== null);
    return { count: up.length, bytes: up.reduce((a, e) => a + (e.bytes ?? 0), 0) };
  }, [detailEvents]);

  const g3 = GATE_MAP.G3;
  const g3Rows = useMemo(
    () =>
      g3.criteria.map((c, i) => {
        const actual = g3.actual[i] ?? '';
        return { criteria: c, actual, pass: !actual.includes('✗') };
      }),
    [g3],
  );
  const g3Pipeline = PIPELINE_MAP[g3.lastPipelineId];
  const gateSession = ideSessions.find((s) => s.id === gateSessionId) ?? ideSessions[0];
  const gateMissing = G3_ARTIFACTS.filter((a) => !gateSession.artifactsUploaded.includes(a));
  const gateReady = gateMissing.length === 0 && gateSession.pendingUploads === 0 && g3.status === 'passed';

  /** 「触发部署」禁用原因：门禁未通过 / 产物缺口 / 待补传 / 出网被拒 */
  const gateReasons = useMemo(() => {
    const list: string[] = [];
    if (g3.status !== 'passed') {
      list.push(
        `G3 编码门禁当前为「${g3.status === 'failed' ? '未通过' : g3.status}」（判据达成率 ${
          g3.passRate
        }%，blocking=${g3.blocking ? '是' : '否'}，最近校验 ${g3.lastCheckedAt}）`,
      );
    }
    if (gateMissing.length > 0) {
      list.push(
        `${gateSession.id} 缺少 G3 必需产物：${gateMissing.map((a) => ARTIFACT_META[a].label).join(' / ')}`,
      );
    }
    if (gateSession.pendingUploads > 0) {
      list.push(`${gateSession.id} 尚有 ${gateSession.pendingUploads} 项产物待补传，尚未落入平台`);
    }
    if (gateSession.privacy.egressMode === 'DENY') {
      list.push(
        `${gateSession.id} 出网模式为 DENY（maxSecretLevel ${
          EGRESS_BY_CODE.DENY ? EGRESS_BY_CODE.DENY.maxSecretLevel : 'L3'
        }），产物滞留本地离线队列，需先完成出域例外审批`,
      );
    }
    return list;
  }, [g3, gateMissing, gateSession]);

  const ideFlow = AI_AUTOMATION_FLOWS.find((f) => f.id === 'AIF-02') ?? AI_AUTOMATION_FLOWS[0];

  /* 治理乐观更新的反馈条 8 秒后自动收起 */
  useEffect(() => {
    if (!govToast) return undefined;
    const timer = window.setTimeout(() => setGovToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [govToast]);

  const applyGov = (session: IdeSession, patch: GovOverride, text: string) => {
    const prev = govOverrides[session.id] ?? null;
    setGovOverrides((o) => ({ ...o, [session.id]: { ...(o[session.id] ?? {}), ...patch } }));
    setGovToast((t) => ({ n: (t?.n ?? 0) + 1, sessionId: session.id, text, prev }));
  };

  const undoGov = () => {
    if (!govToast) return;
    const { sessionId, prev } = govToast;
    setGovOverrides((o) => {
      const next = { ...o };
      if (prev) next[sessionId] = prev;
      else delete next[sessionId];
      return next;
    });
    setGovToast(null);
  };

  /** 重试同步：DENY 出网模式下重试仍会被策略拦截，只转入审批队列 */
  const retrySync = (s: IdeSession) => {
    if (s.privacy.egressMode === 'DENY') {
      applyGov(
        s,
        { connectionStatus: 'offline', syncState: 'queued', syncStateLabel: '重试已受理 · 仍被 EGRESS-DENY 拦截，产物转入出域审批队列' },
        `${s.id} 重试已受理：命中 EGRESS-DENY（maxSecretLevel L3），${s.pendingUploads} 项产物转入出域审批队列，需评审人按例外流程审批后方可补传`,
      );
      return;
    }
    applyGov(
      s,
      {
        connectionStatus: 'online',
        syncState: s.pendingUploads > 0 ? 'partial' : 'synced',
        syncStateLabel:
          s.pendingUploads > 0
            ? `重试成功 · 长连接已恢复，${s.pendingUploads} 项产物补传中`
            : '重试成功 · 长连接已恢复，产物全部上行',
      },
      `${s.id} 重试成功：WebSocket 长连接已恢复（RTT 回落至 ${s.metrics.avgLatencyMs}ms），${
        s.pendingUploads > 0 ? `${s.pendingUploads} 项产物进入补传` : '无待补传产物'
      }`,
    );
  };

  const toManual = (s: IdeSession) => {
    applyGov(
      s,
      { syncMode: 'manual', syncStateLabel: '已切换为手动上传 · 由开发者在 IDE 内点击「同步到平台」触发' },
      `${s.id} 已切换为手动上传：插件不再自动建连，改由开发者点击「同步到平台」逐次上行，出网管控策略 ${s.privacy.egressMode} 仍然生效`,
    );
  };

  const toggleEvType = (type: IdeEvent['type']) => {
    setEvTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const toggleSort = (key: IdeSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'id' || key === 'lastSyncAt' ? 'asc' : 'desc');
  };

  const resetFilters = () => {
    setFIde('all');
    setFMode('all');
    setFConn('all');
    setFState('all');
    setFEgress('all');
    setFUser('all');
    setFKeyword('');
    setSortKey('id');
    setSortDir('asc');
  };

  /** 关联平台会话：切换到平台侧会话流并滚动过去 */
  const gotoCodingSession = (csId: string) => {
    setSessionId(csId);
    setDetailId(null);
    const el = document.querySelector('[data-annotation-id="ai-sdlc-coding-session-flow"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** 可排序表头 */
  const sortTh = (key: IdeSortKey, label: string) => (
    <button type="button" className="ac-ide-sort" onClick={() => toggleSort(key)} title={`按${label}排序`}>
      {label}
      <ArrowUpDown size={10} className={sortKey === key ? 'ac-ide-sort-on' : 'ac-ide-sort-off'} />
      {sortKey === key ? <span className="ac-ide-sort-dir">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
    </button>
  );

  return (
    <div className="ac-page ac-coding" data-annotation-id="ai-sdlc-coding-page">
      {/* ---------------- 页头：双视角说明 + IDE 同步区开关 ---------------- */}
      <div className="ac-page-head">
        <div>
          <h2 className="ac-page-title">AI 编码协作</h2>
          <p className="ac-page-desc">
            本页两个视角。<strong>本地 IDE 侧</strong>：程序员在 VS Code / JetBrains 里用 AI 编码，插件把会话、Diff、
            本地单测结果、增量覆盖率与脱敏情况回流平台（下方「本地 IDE 同步」区）。
            <strong>平台侧</strong>：平台托管的 AI 编码会话流、上下文切片、Diff 逐块审查与本地执行门禁（再下方）。
            两者通过 <span className="ac-mono">IDE-*</span> 与 <span className="ac-mono">CS-*</span> 双向关联。
          </p>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--sm ac-tag--neutral">
            {CURRENT_SPRINT.name} · 数据口径 {AI_FLOW_TODAY}
          </span>
          <button
            type="button"
            className={`ac-btn ac-btn--sm ${ideOpen ? 'ac-btn--ghost' : 'ac-btn--primary'}`}
            onClick={() => setIdeOpen((v) => !v)}
          >
            <Plug size={13} />
            {ideOpen ? '收起本地 IDE 同步区' : '展开本地 IDE 同步区'}
          </button>
        </div>
      </div>

      {ideOpen ? (
        <>
          {/* ---------------- 本地 IDE 同步区：分隔条 + 子标签 ---------------- */}
          <div className="ac-ide-band">
            <span className="ac-ide-band-icon">
              <Plug size={14} />
            </span>
            <span className="ac-ide-band-title">本地 IDE 同步 · 插件回流的 AI 使用结果</span>
            <span className="ac-ide-band-sub">
              {IDE_SYNC_SESSIONS.length} 条同步会话 · {IDE_SYNC_EVENTS.length} 条链路事件 ·{' '}
              {IDE_PLUGINS.length} 个插件发行版
            </span>
            <span className="ac-ml-auto ac-row ac-gap-2 ac-wrap">
              <span className="ac-tag ac-tag--sm ac-tag--ok">
                <span className="ac-ide-dot ac-ide-dot--online" />
                在线 {ideStats.online}
              </span>
              <span className="ac-tag ac-tag--sm ac-tag--warn">降级 {ideStats.degraded}</span>
              <span className="ac-tag ac-tag--sm ac-tag--danger">离线 {ideStats.offline}</span>
              <span className="ac-tag ac-tag--sm ac-tag--info">待补传 {ideStats.pending} 项</span>
            </span>
          </div>

          <div className="ac-tabs ac-ide-tabs">
            <button
              type="button"
              className={`ac-tab${ideTab === 'overview' ? ' ac-tab--active' : ''}`}
              onClick={() => setIdeTab('overview')}
            >
              同步总览与接入 <span className="ac-tab-count">{ideSessions.length}</span>
            </button>
            <button
              type="button"
              className={`ac-tab${ideTab === 'health' ? ' ac-tab--active' : ''}`}
              onClick={() => setIdeTab('health')}
            >
              健康度与治理 <span className="ac-tab-count">{ideProblems.length}</span>
            </button>
          </div>

          {ideTab === 'overview' ? (
            <>
              {/* ---------------- A. IDE 同步会话总览 ---------------- */}
              <div className="ac-card" data-annotation-id="ai-sdlc-coding-ide-sync">
                <div className="ac-card-head">
                  <div className="ac-card-title">
                    <CloudUpload size={15} /> 本地 IDE AI 使用结果同步 · 总览
                  </div>
                  <div className="ac-card-subtitle">
                    程序员在本地 VS Code / JetBrains 用 AI 编码，插件把会话、Diff、单测、覆盖率与脱敏情况回流平台
                  </div>
                  <div className="ac-card-extra">
                    <span
                      className="ac-tag ac-tag--sm ac-tag--neutral"
                      title="出网管控三态与 data.ts 的 egressPolicy 一一对应：ALLOW 允许出域 / MASK 脱敏后出域 / DENY 禁止出域（强制内网 mdl-local）"
                    >
                      ALLOW {ideStats.byEgress.ALLOW} · MASK {ideStats.byEgress.MASK} · DENY{' '}
                      {ideStats.byEgress.DENY}
                    </span>
                  </div>
                </div>

                <div className="ac-card-body">
                  {/* ---- 6 张核心指标 ---- */}
                  <div className="ac-metric-grid ac-metric-grid--6">
                    <div className="ac-metric ac-metric--ok">
                      <div className="ac-metric-head">
                        <span className="ac-metric-label">在线同步会话</span>
                        <span className="ac-metric-icon">
                          <Wifi size={14} />
                        </span>
                      </div>
                      <div className="ac-metric-value">
                        {ideStats.online}
                        <span className="ac-metric-unit"> / {ideSessions.length}</span>
                      </div>
                      <div className="ac-metric-foot">
                        降级 {ideStats.degraded} · 离线 {ideStats.offline}
                      </div>
                    </div>

                    <div className="ac-metric ac-metric--warn">
                      <div className="ac-metric-head">
                        <span className="ac-metric-label">离线待补传</span>
                        <span className="ac-metric-icon">
                          <Inbox size={14} />
                        </span>
                      </div>
                      <div className="ac-metric-value">
                        {ideStats.pending}
                        <span className="ac-metric-unit"> 项</span>
                      </div>
                      <div className="ac-metric-foot">
                        <span className="ac-ellipsis">
                          {[...ideSessions]
                            .filter((s) => s.pendingUploads > 0)
                            .sort((a, b) => b.pendingUploads - a.pendingUploads)
                            .slice(0, 3)
                            .map((s) => `${s.id}（${s.pendingUploads}）`)
                            .join(' · ')}
                        </span>
                      </div>
                    </div>

                    <div className="ac-metric ac-metric--ai">
                      <div className="ac-metric-head">
                        <span className="ac-metric-label">近 24h AI 采纳行数</span>
                        <span className="ac-metric-icon">
                          <TrendingUp size={14} />
                        </span>
                      </div>
                      <div className="ac-metric-value">
                        {fmtNum(ideStats.todayAccepted)}
                        <span className="ac-metric-unit"> 行</span>
                      </div>
                      <div className="ac-metric-foot">
                        {ideStats.todayCount} 条会话于 {AI_FLOW_TODAY} 回流
                      </div>
                    </div>

                    <div className="ac-metric ac-metric--info">
                      <div className="ac-metric-head">
                        <span className="ac-metric-label">整体采纳率</span>
                        <span className="ac-metric-icon">
                          <Gauge size={14} />
                        </span>
                      </div>
                      <div className="ac-metric-value">
                        {ideStats.acceptRate.toFixed(1)}
                        <span className="ac-metric-unit"> %</span>
                      </div>
                      <div className="ac-metric-foot">
                        采纳 {fmtNum(ideStats.accepted)} / 拒绝 {fmtNum(ideStats.rejected)} 行
                      </div>
                    </div>

                    <div className="ac-metric ac-metric--ai">
                      <div className="ac-metric-head">
                        <span className="ac-metric-label">上行流量</span>
                        <span className="ac-metric-icon">
                          <Upload size={14} />
                        </span>
                      </div>
                      <div className="ac-metric-value">{fmtBytesBig(ideStats.bytes)}</div>
                      <div className="ac-metric-foot">
                        {fmtNum(ideStats.bytes)} 字节 · 12KB/片分片上行
                      </div>
                    </div>

                    <div className="ac-metric ac-metric--warn">
                      <div className="ac-metric-head">
                        <span className="ac-metric-label">脱敏命中次数</span>
                        <span className="ac-metric-icon">
                          <ShieldCheck size={14} />
                        </span>
                      </div>
                      <div className="ac-metric-value">
                        {fmtNum(ideStats.maskHits)}
                        <span className="ac-metric-unit"> 次</span>
                      </div>
                      <div className="ac-metric-foot">
                        脱敏 {fmtNum(ideStats.tokensMasked)} tokens（SEC-MASK-2.1）
                      </div>
                    </div>
                  </div>

                  <div className="ac-hint ac-mb-3">
                    <Info size={14} />
                    <span>
                      核算口径：<span className="ac-mono">totalLinesChanged = aiAcceptedLines + manualLines</span>；
                      <span className="ac-mono">
                        acceptRatePct = aiAcceptedLines / (aiAcceptedLines + aiRejectedLines) × 100
                      </span>
                      ；上行流量只统计 <span className="ac-mono">direction = ide→platform</span> 且 bytes 非空的事件——
                      IDE-07 共 {IDE07_UPLOAD.count} 条上行事件、合计 {fmtNum(IDE07_UPLOAD.bytes)} 字节，与其{' '}
                      <span className="ac-mono">metrics.uploadBytes</span> 完全对账。
                    </span>
                  </div>

                  {/* ---- 多维筛选 ---- */}
                  <div className="ac-filter-bar">
                    <span className="ac-ide-filter-ico">
                      <SlidersHorizontal size={14} />
                    </span>
                    <div className="ac-ide-search">
                      <Search size={13} />
                      <input
                        className="ac-input ac-input--sm"
                        value={fKeyword}
                        onChange={(e) => setFKeyword(e.target.value)}
                        placeholder="搜索会话号 / 仓库 / 分支 / 任务号"
                      />
                    </div>
                    <select
                      className="ac-select ac-select--sm"
                      value={fIde}
                      onChange={(e) => setFIde(e.target.value as 'all' | IdeSession['ide'])}
                    >
                      <option value="all">全部 IDE</option>
                      {(Object.keys(IDE_META) as IdeSession['ide'][]).map((k) => (
                        <option key={k} value={k}>
                          {IDE_META[k].label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ac-select ac-select--sm"
                      value={fMode}
                      onChange={(e) => setFMode(e.target.value as 'all' | IdeSession['syncMode'])}
                    >
                      <option value="all">全部同步模式</option>
                      {(Object.keys(SYNC_MODE_LABEL) as IdeSession['syncMode'][]).map((k) => (
                        <option key={k} value={k}>
                          {SYNC_MODE_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ac-select ac-select--sm"
                      value={fConn}
                      onChange={(e) => setFConn(e.target.value as 'all' | IdeSession['connectionStatus'])}
                    >
                      <option value="all">全部连接状态</option>
                      {(Object.keys(CONN_META) as IdeSession['connectionStatus'][]).map((k) => (
                        <option key={k} value={k}>
                          {CONN_META[k].label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ac-select ac-select--sm"
                      value={fState}
                      onChange={(e) => setFState(e.target.value as 'all' | IdeSession['syncState'])}
                    >
                      <option value="all">全部同步状态</option>
                      {SYNC_STATE_ORDER.map((k) => (
                        <option key={k} value={k}>
                          {SYNC_STATE_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ac-select ac-select--sm"
                      value={fEgress}
                      onChange={(e) => setFEgress(e.target.value as 'all' | EgressCode)}
                    >
                      <option value="all">全部出网模式</option>
                      {(Object.keys(EGRESS_META) as EgressCode[]).map((k) => (
                        <option key={k} value={k}>
                          {k} · {EGRESS_META[k].label}
                        </option>
                      ))}
                    </select>
                    <select className="ac-select ac-select--sm" value={fUser} onChange={(e) => setFUser(e.target.value)}>
                      <option value="all">全部成员</option>
                      {ideUserOptions.map((uid) => (
                        <option key={uid} value={uid}>
                          {USER_MAP[uid].name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="ac-btn ac-btn--sm ac-btn--text" onClick={resetFilters}>
                      <Undo2 size={13} />
                      重置
                    </button>
                    <span className="ac-ml-auto ac-xs ac-muted ac-nowrap">
                      命中 {ideRows.length} / {ideSessions.length} 条
                    </span>
                  </div>

                  {/* ---- 16 列会话表 ---- */}
                  {ideRows.length > 0 ? (
                    <div className="ac-table-wrap">
                      <table className="ac-table ac-table--sm ac-table--bordered ac-ide-table">
                        <thead>
                          <tr>
                            <th>{sortTh('id', '会话编号')}</th>
                            <th>成员</th>
                            <th>IDE / 版本</th>
                            <th>插件版本</th>
                            <th>操作系统</th>
                            <th>仓库</th>
                            <th>分支</th>
                            <th>关联任务</th>
                            <th>平台会话</th>
                            <th>同步模式</th>
                            <th>连接状态</th>
                            <th>同步状态</th>
                            <th className="ac-td-right">{sortTh('pendingUploads', '待补传')}</th>
                            <th>{sortTh('lastSyncAt', '最近同步')}</th>
                            <th className="ac-td-right">{sortTh('uploadBytes', '上行 / 时延')}</th>
                            <th>出网模式</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ideRows.map((s) => {
                            const u = USER_MAP[s.userId];
                            const t = TASK_MAP[s.taskId];
                            const cs = s.codingSessionId ? CODING_SESSION_MAP[s.codingSessionId] : null;
                            const IdeIcon = IDE_META[s.ide].Icon;
                            const ConnIcon = CONN_META[s.connectionStatus].Icon;
                            const EgIcon = EGRESS_META[s.privacy.egressMode].Icon;
                            return (
                              <tr key={s.id} className="ac-ide-row" onClick={() => setDetailId(s.id)}>
                                <td className="ac-nowrap">
                                  <span className="ac-ide-sid">{s.id}</span>
                                  <ChevronRight size={11} className="ac-ide-rowgo" />
                                </td>
                                <td className="ac-nowrap">
                                  <span className="ac-user">
                                    <span className={`ac-avatar ac-avatar--xs ac-avatar--${u.avatarColor}`}>
                                      {u.initial}
                                    </span>
                                    <span className="ac-user-name">{u.name}</span>
                                  </span>
                                </td>
                                <td className="ac-nowrap ac-xs">
                                  <span className="ac-row ac-gap-1">
                                    <IdeIcon size={12} />
                                    {s.ideVersion}
                                  </span>
                                </td>
                                <td className="ac-mono ac-xs ac-nowrap">v{s.pluginVersion}</td>
                                <td className="ac-xs ac-nowrap">{s.os}</td>
                                <td className="ac-mono ac-xs ac-ide-repo" title={s.repoUrl}>
                                  {repoShort(s.repoUrl)}
                                </td>
                                <td className="ac-mono ac-xs ac-ide-branch" title={s.branch}>
                                  <GitBranch size={10} />
                                  {s.branch}
                                </td>
                                <td className="ac-nowrap">
                                  <button
                                    type="button"
                                    className="ac-btn ac-btn--sm ac-btn--text ac-ide-link"
                                    title={`${t.code} · ${t.title}（${t.stateLabel}）→ 跳转任务看板`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.location.hash = '#page=board';
                                    }}
                                  >
                                    {s.taskId}
                                  </button>
                                  <span className="ac-ide-sub">{t.code}</span>
                                </td>
                                <td className="ac-nowrap">
                                  {cs ? (
                                    <>
                                      <button
                                        type="button"
                                        className="ac-btn ac-btn--sm ac-btn--text ac-ide-link"
                                        title={`联动下方平台侧会话流：${cs.id} · 模型 ${
                                          MODEL_MAP[cs.modelId] ? MODEL_MAP[cs.modelId].name : cs.modelId
                                        } · 采纳率 ${cs.acceptRate}%`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          gotoCodingSession(cs.id);
                                        }}
                                      >
                                        {cs.id}
                                      </button>
                                      <span className="ac-ide-sub">
                                        {MODEL_MAP[cs.modelId] ? MODEL_MAP[cs.modelId].name : cs.modelId}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="ac-xs ac-muted">未关联</span>
                                  )}
                                </td>
                                <td className="ac-nowrap">
                                  <span className="ac-tag ac-tag--sm ac-tag--outline">
                                    {SYNC_MODE_LABEL[s.syncMode]}
                                  </span>
                                </td>
                                <td className="ac-nowrap">
                                  <span className={`ac-ide-conn ac-ide-conn--${s.connectionStatus}`}>
                                    <span className={`ac-ide-dot ac-ide-dot--${s.connectionStatus}`} />
                                    <ConnIcon size={11} />
                                    {CONN_META[s.connectionStatus].label}
                                  </span>
                                </td>
                                <td className="ac-nowrap">
                                  <span
                                    className={`ac-tag ac-tag--sm ac-tag--${tagTone(SYNC_STATE_TONE[s.syncState])}`}
                                    title={s.syncStateLabel}
                                  >
                                    {SYNC_STATE_LABEL[s.syncState]}
                                  </span>
                                  {s.conflicts.length > 0 ? (
                                    <span className="ac-tag ac-tag--sm ac-tag--danger ac-ide-ml4">
                                      <GitMerge size={10} />
                                      冲突 {s.conflicts.length}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="ac-td-num ac-xs">
                                  {s.pendingUploads > 0 ? (
                                    <span className="ac-ide-pending">{s.pendingUploads}</span>
                                  ) : (
                                    <span className="ac-muted">0</span>
                                  )}
                                </td>
                                <td className="ac-mono ac-xs ac-nowrap" title={`开始于 ${s.startedAt}`}>
                                  {s.lastSyncAt.slice(5, 16)}
                                </td>
                                <td className="ac-td-num ac-xs ac-nowrap">
                                  {fmtBytesBig(s.metrics.uploadBytes)}
                                  <span className="ac-ide-sub">{s.metrics.avgLatencyMs} ms</span>
                                </td>
                                <td className="ac-nowrap">
                                  <span
                                    className={`ac-tag ac-tag--sm ac-tag--${tagTone(
                                      EGRESS_META[s.privacy.egressMode].tone,
                                    )}`}
                                    title={`${EGRESS_META[s.privacy.egressMode].label} · 策略版本 ${
                                      s.privacy.policyVersion
                                    }`}
                                  >
                                    <EgIcon size={10} />
                                    {s.privacy.egressMode}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="ac-empty ac-empty--sm">
                      <span className="ac-empty-icon">
                        <Search size={20} />
                      </span>
                      <span className="ac-empty-title">没有匹配的同步会话</span>
                      <span className="ac-empty-desc">
                        当前筛选条件下无 IDE 同步会话，请调整 IDE / 同步模式 / 连接状态 / 出网模式或清空关键字。
                      </span>
                      <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={resetFilters}>
                        <Undo2 size={13} />
                        重置筛选
                      </button>
                    </div>
                  )}
                </div>

                <div className="ac-card-foot ac-row ac-gap-4 ac-wrap ac-xs ac-muted">
                  <span>当前筛选 {ideRows.length} 条</span>
                  <span>
                    AI 采纳 {fmtNum(ideRows.reduce((a, s) => a + s.metrics.aiAcceptedLines, 0))} 行
                  </span>
                  <span>
                    人工 {fmtNum(ideRows.reduce((a, s) => a + s.metrics.manualLines, 0))} 行
                  </span>
                  <span>
                    上行 {fmtBytesBig(ideRows.reduce((a, s) => a + s.metrics.uploadBytes, 0))}
                  </span>
                  <span>
                    脱敏命中 {fmtNum(ideRows.reduce((a, s) => a + s.metrics.maskHitCount, 0))} 次
                  </span>
                  <span className="ac-ml-auto">点击任意行打开同步详情抽屉</span>
                </div>
              </div>

              {/* ---------------- B. IDE 插件与接入 ---------------- */}
              <div className="ac-card" data-annotation-id="ai-sdlc-coding-ide-plugins">
                <div className="ac-card-head">
                  <div className="ac-card-title">
                    <Puzzle size={15} /> IDE 插件与接入 · 双端一致性
                  </div>
                  <div className="ac-card-subtitle">
                    VS Code 扩展 + JetBrains 插件，同一套同步协议契约与字段口径
                  </div>
                  <div className="ac-card-extra">
                    <span className="ac-tag ac-tag--sm ac-tag--brand">
                      VS Code {ideSessions.filter((s) => s.ide === 'vscode').length} 条会话
                    </span>
                    <span className="ac-tag ac-tag--sm ac-tag--info">
                      JetBrains {ideSessions.filter((s) => s.ide === 'jetbrains').length} 条会话
                    </span>
                  </div>
                </div>

                <div className="ac-card-body">
                  <div className="ac-grid-2">
                    {IDE_PLUGINS.map((p) => {
                      const PlugIcon = IDE_META[p.ide].Icon;
                      return (
                        <div className="ac-ide-plug" key={p.id}>
                          <div className="ac-ide-plug-head">
                            <span className={`ac-ide-plug-ico ac-ide-plug-ico--${p.ide}`}>
                              <PlugIcon size={16} />
                            </span>
                            <span className="ac-col ac-gap-1 ac-flex-1">
                              <span className="ac-ide-plug-name">{p.name}</span>
                              <span className="ac-xs ac-muted">
                                {IDE_META[p.ide].label} · 发布于 {p.releasedAt} · {p.id}
                              </span>
                            </span>
                            <span className={`ac-tag ac-tag--sm ac-tag--${tagTone(p.tone)}`}>v{p.version}</span>
                          </div>

                          <dl className="ac-kv ac-ide-kv">
                            <dt>最低 IDE 版本</dt>
                            <dd className="ac-mono ac-xs">{p.minIdeVersion}</dd>
                            <dt>安装量</dt>
                            <dd>{fmtNum(p.installCount)} 台（内网自研分发）</dd>
                            <dt>同步协议</dt>
                            <dd className="ac-xs">{p.syncProtocol}</dd>
                            <dt>自动更新</dt>
                            <dd className="ac-xs">{p.autoUpdate ? '开启 · 灰度 24h 后全量' : '关闭'}</dd>
                            <dt>遥测授权</dt>
                            <dd className="ac-xs">
                              {p.telemetryOptIn ? '已授权 · 仅指标与事件，不含代码正文' : '未授权'}
                            </dd>
                            <dt>市场链接</dt>
                            <dd>
                              <a
                                className="ac-ide-mkt"
                                href={p.marketplaceUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={p.marketplaceUrl}
                              >
                                {p.ide === 'vscode' ? 'VS Code Marketplace' : 'JetBrains Marketplace'}
                                <ExternalLink size={11} />
                              </a>
                            </dd>
                          </dl>

                          <div className="ac-ide-plug-sub">
                            <span className="ac-ide-plug-sub-t">
                              <Cpu size={11} /> 支持的模型（{p.supportedModels.length}）
                            </span>
                            <span className="ac-row ac-gap-1 ac-wrap">
                              {p.supportedModels.map((mid) => {
                                const m = MODEL_MAP[mid];
                                return (
                                  <span
                                    key={mid}
                                    className={`ac-tag ac-tag--sm ac-tag--${tagTone(m.tone)}`}
                                    title={`${m.vendor} ${m.version} · ${m.deployment} · 出网：${m.egress} · ${mid}`}
                                  >
                                    {m.name}
                                  </span>
                                );
                              })}
                            </span>
                            <span className="ac-ide-note">
                              EGRESS-DENY 环境下仅 <span className="ac-mono">mdl-local</span>（私有化 Llama3-70B）可用，
                              其余 4 个外部模型由插件自动置灰。
                            </span>
                          </div>

                          <div className="ac-ide-plug-sub">
                            <span className="ac-ide-plug-sub-t">
                              <Blocks size={11} /> 能力清单（{p.features.length} 项）
                            </span>
                            <div className="ac-ide-feat-grid">
                              {p.features.map((f) => {
                                const meta = featureMeta(f);
                                const FIcon = meta ? meta.Icon : Puzzle;
                                return (
                                  <div className="ac-ide-feat" key={f}>
                                    <span className="ac-ide-feat-ico">
                                      <FIcon size={12} />
                                    </span>
                                    <span className="ac-col ac-gap-0 ac-flex-1">
                                      <span className="ac-ide-feat-name">{f}</span>
                                      <span className="ac-ide-feat-desc">{meta ? meta.desc : ''}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="ac-ide-plug-sub">
                            <span className="ac-ide-plug-sub-t">
                              <AlertTriangle size={11} /> 已知问题（{p.knownIssues.length}）
                            </span>
                            {p.knownIssues.map((k) => (
                              <div className="ac-hint ac-hint--warn ac-ide-issue" key={k}>
                                <AlertTriangle size={13} />
                                <span>{k}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="ac-hint ac-hint--ai ac-mt-3">
                    <Info size={14} />
                    <span>
                      <strong>双端一致性保障</strong>：VS Code 扩展与 JetBrains 插件共用同一份同步协议契约（
                      {IDE_PLUGINS[0].syncProtocol}），上下文切片选择、出网脱敏、Diff 逐块接受、离线队列补传与
                      门禁预检的字段口径完全相同；双端各自运行自动化冒烟测试覆盖整条同步链路
                      （建连 → 鉴权 → 上下文采集 → 脱敏 → 上行 → 冲突三方合并 → 离线补传 → 断连收尾），
                      任一端协议回归即阻断插件发版。当前 {ideSessions.length} 条同步会话中插件版本为{' '}
                      {Array.from(new Set(ideSessions.map((s) => s.pluginVersion))).join(' / ')}，
                      其中 IDE-09 仍停留在 v1.7.9（EGRESS-DENY 下不会自动切换 mdl-local，已通知升级），
                      是本次唯一的双端行为偏差来源。
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {ideTab === 'health' ? (
            <>
              {/* ---------------- D1. 同步健康度 ---------------- */}
              <div className="ac-card">
                <div className="ac-card-head">
                  <div className="ac-card-title">
                    <ChartColumn size={15} /> 同步健康度
                  </div>
                  <div className="ac-card-subtitle">
                    {ideSessions.length} 条同步会话的采纳率、上行体量与状态分布（手绘 SVG）
                  </div>
                  <div className="ac-card-extra">
                    <span className="ac-tag ac-tag--sm ac-tag--neutral">
                      算术均值 {acceptAvg.toFixed(1)}% · 加权 {ideStats.acceptRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="ac-card-body">
                  <div className="ac-grid-2">
                    <div className="ac-ide-chart">
                      <div className="ac-ide-chart-t">
                        <Gauge size={12} /> AI 采纳率（acceptRatePct）· 红虚线 = 团队算术均值 · 绿虚线 = 85% 门槛参考
                      </div>
                      <IdeAcceptChart rows={ideSessions} avg={acceptAvg} />
                      <div className="ac-ide-chart-note">
                        IDE-10 记为 0%：CS-2420 尚无人工采纳的 AI 建议（分母为 0），拉低算术均值；
                        按行数加权的整体采纳率为 {ideStats.acceptRate.toFixed(1)}%（
                        {fmtNum(ideStats.accepted)} / {fmtNum(ideStats.accepted + ideStats.rejected)} 行）。
                      </div>
                    </div>
                    <div className="ac-ide-chart">
                      <div className="ac-ide-chart-t">
                        <Upload size={12} /> 上行流量 vs 脱敏 tokens（各自归一化，双刻度对比）
                      </div>
                      <div className="ac-ide-legend">
                        <span className="ac-ide-legend-i">
                          <i style={{ background: TONE_HEX.info }} />
                          uploadBytes（字节，峰值 {fmtBytesBig(Math.max(...ideSessions.map((s) => s.metrics.uploadBytes)))}）
                        </span>
                        <span className="ac-ide-legend-i">
                          <i style={{ background: TONE_HEX.warn }} />
                          tokensMasked（token，峰值 {fmtNum(Math.max(...ideSessions.map((s) => s.metrics.tokensMasked)))}）
                        </span>
                      </div>
                      <IdeBytesChart rows={ideSessions} />
                      <div className="ac-ide-chart-note">
                        IDE-09 / IDE-10 为 EGRESS-DENY，上行流量分别为 0 B 与 142,860 B（仅上下文快照经审批后放行），
                        脱敏 tokens 为 0——因为禁止出域时数据根本不出网，无需脱敏。
                      </div>
                    </div>
                  </div>

                  <div className="ac-ide-donut-row">
                    <div className="ac-ide-chart">
                      <div className="ac-ide-chart-t">
                        <Activity size={12} /> 同步状态分布
                      </div>
                      <div className="ac-row ac-gap-5 ac-wrap">
                        <IdeStateDonut data={stateDist} total={ideSessions.length} />
                        <div className="ac-legend ac-flex-1">
                          {stateDist.map((d) => (
                            <div className="ac-legend-item" key={d.key}>
                              <span className="ac-legend-swatch" style={{ background: d.color }} />
                              {d.label}
                              <span className="ac-legend-value">
                                {d.value} 条 · {((d.value / ideSessions.length) * 100).toFixed(0)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------------- D2. 失败与降级治理 ---------------- */}
              <div className="ac-card">
                <div className="ac-card-head">
                  <div className="ac-card-title">
                    <OctagonAlert size={15} /> 失败与降级治理
                  </div>
                  <div className="ac-card-subtitle">
                    同步状态为 failed / conflict 或连接为 degraded / offline 的会话，共 {ideProblems.length} 条
                  </div>
                  <div className="ac-card-extra">
                    {Object.keys(govOverrides).length > 0 ? (
                      <button
                        type="button"
                        className="ac-btn ac-btn--sm ac-btn--ghost"
                        onClick={() => {
                          setGovOverrides({});
                          setGovToast(null);
                        }}
                      >
                        <Undo2 size={13} />
                        撤销全部本地更新（{Object.keys(govOverrides).length}）
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="ac-card-body">
                  {govToast ? (
                    <div className="ac-hint ac-hint--ok ac-mb-3">
                      <CheckCircle2 size={14} />
                      <span>{govToast.text}</span>
                      <button
                        type="button"
                        className="ac-btn ac-btn--sm ac-btn--ghost ac-ide-undo"
                        onClick={undoGov}
                      >
                        <Undo2 size={12} />
                        撤销
                      </button>
                    </div>
                  ) : null}

                  {ideProblems.length === 0 ? (
                    <div className="ac-empty ac-empty--sm">
                      <span className="ac-empty-icon">
                        <CheckCircle2 size={20} />
                      </span>
                      <span className="ac-empty-title">全部同步会话健康</span>
                      <span className="ac-empty-desc">当前没有失败、冲突、降级或离线的 IDE 同步会话。</span>
                    </div>
                  ) : (
                    ideProblems.map((s) => {
                      const u = USER_MAP[s.userId];
                      const ConnIcon = CONN_META[s.connectionStatus].Icon;
                      const dirty = Boolean(govOverrides[s.id]);
                      return (
                        <div className={`ac-ide-gov${dirty ? ' ac-ide-gov--dirty' : ''}`} key={s.id}>
                          <div className="ac-row ac-gap-2 ac-wrap">
                            <button
                              type="button"
                              className="ac-ide-sid ac-ide-linkbtn"
                              onClick={() => setDetailId(s.id)}
                              title="打开同步详情抽屉"
                            >
                              {s.id}
                            </button>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ac-avatar--${u.avatarColor}`}>
                                {u.initial}
                              </span>
                              <span className="ac-user-name">{u.name}</span>
                            </span>
                            <span className={`ac-tag ac-tag--sm ac-tag--${tagTone(CONN_META[s.connectionStatus].tone)}`}>
                              <ConnIcon size={10} />
                              {CONN_META[s.connectionStatus].label}
                            </span>
                            <span
                              className={`ac-tag ac-tag--sm ac-tag--${tagTone(SYNC_STATE_TONE[s.syncState])}`}
                              title={s.syncStateLabel}
                            >
                              {SYNC_STATE_LABEL[s.syncState]}
                            </span>
                            <span
                              className={`ac-tag ac-tag--sm ac-tag--${tagTone(
                                EGRESS_META[s.privacy.egressMode].tone,
                              )}`}
                            >
                              {s.privacy.egressMode}
                            </span>
                            {dirty ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ok">
                                <Check size={10} />
                                本地已更新
                              </span>
                            ) : null}
                            <span className="ac-ml-auto ac-xs ac-muted ac-mono ac-nowrap">
                              最近同步 {s.lastSyncAt}
                            </span>
                          </div>

                          {s.lastError ? (
                            <div className="ac-ide-gov-err">
                              <OctagonAlert size={12} />
                              <span>{s.lastError}</span>
                            </div>
                          ) : null}

                          <div className="ac-ide-gov-kv ac-xs ac-muted">
                            <span>待补传 {s.pendingUploads} 项</span>
                            <span>
                              已上行产物 {s.artifactsUploaded.length} / {ARTIFACT_ORDER.length} 类
                            </span>
                            <span>同步模式 {SYNC_MODE_LABEL[s.syncMode]}</span>
                            <span>平均时延 {s.metrics.avgLatencyMs} ms</span>
                            <span>
                              出网 {EGRESS_META[s.privacy.egressMode].label}（{s.privacy.policyVersion}）
                            </span>
                          </div>

                          <div className="ac-row ac-gap-2 ac-wrap">
                            <button
                              type="button"
                              className="ac-btn ac-btn--sm ac-btn--ghost"
                              onClick={() => retrySync(s)}
                            >
                              <RefreshCw size={12} />
                              重试同步
                            </button>
                            <button
                              type="button"
                              className="ac-btn ac-btn--sm ac-btn--ghost"
                              onClick={() => toManual(s)}
                            >
                              <Upload size={12} />
                              切换为手动上传
                            </button>
                            <button
                              type="button"
                              className="ac-btn ac-btn--sm ac-btn--text"
                              onClick={() => setDetailId(s.id)}
                            >
                              <Inbox size={12} />
                              查看离线队列（{s.pendingUploads}）
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div className="ac-hint ac-mt-3">
                    <Info size={13} />
                    <span>
                      以上操作为<strong>本地乐观更新</strong>：点击后立即反映在总览指标卡与会话表上，不写回后端；
                      反馈条内的「撤销」或卡片右上角的「撤销全部本地更新」可还原为平台侧真实状态。
                      EGRESS-DENY 的会话即使重试也只会被转入出域审批队列，不会绕过出网管控。
                    </span>
                  </div>
                </div>
              </div>

              {/* ---------------- D3. G3 门禁联动 ---------------- */}
              <div className="ac-card">
                <div className="ac-card-head">
                  <div className="ac-card-title">
                    <ShieldCheck size={15} /> {g3.id} {g3.name}联动 · 上行产物如何喂给门禁
                  </div>
                  <div className="ac-card-subtitle">
                    责任角色 developer · 校验 Agent {AGENT_MAP[g3.agentId] ? AGENT_MAP[g3.agentId].name : g3.agentId} ·{' '}
                    {g3.desc}
                  </div>
                  <div className="ac-card-extra">
                    <span
                      className={`ac-tag ac-tag--sm ac-tag--${
                        g3.status === 'passed' ? 'ok' : g3.status === 'failed' ? 'danger' : 'warn'
                      }`}
                    >
                      {g3.status === 'passed' ? '已通过' : g3.status === 'failed' ? '未通过' : '待校验'}
                    </span>
                    <span className="ac-tag ac-tag--sm ac-tag--neutral">判据达成率 {g3.passRate}%</span>
                  </div>
                </div>

                <div className="ac-card-body">
                  <div className="ac-ide-gate-grid">
                    {/* 左：门禁判据与实测 */}
                    <div className="ac-col ac-gap-2">
                      <div className="ac-ide-plug-sub-t">
                        <ListChecks size={11} /> 门禁判据（criteria）与当前实测（actual）
                      </div>
                      <div className="ac-table-wrap">
                        <table className="ac-table ac-table--sm ac-ide-gate-table">
                          <thead>
                            <tr>
                              <th>硬性判据</th>
                              <th>当前实测</th>
                              <th className="ac-td-center">结论</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g3Rows.map((r) => (
                              <tr key={r.criteria}>
                                <td className="ac-xs">{r.criteria}</td>
                                <td className="ac-xs ac-ide-gate-actual">{r.actual}</td>
                                <td className="ac-td-center">
                                  {r.pass ? (
                                    <span className="ac-tag ac-tag--sm ac-tag--ok">
                                      <CheckCircle2 size={10} />
                                      满足
                                    </span>
                                  ) : (
                                    <span className="ac-tag ac-tag--sm ac-tag--danger">
                                      <XCircle size={10} />
                                      未满足
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="ac-hint ac-hint--warn">
                        <AlertTriangle size={13} />
                        <span>
                          最近一次校验流水线{' '}
                          <span className="ac-mono">
                            {g3Pipeline ? g3Pipeline.id : g3.lastPipelineId}
                          </span>
                          {g3Pipeline
                            ? ` · 分支 ${g3Pipeline.branch} · commit ${g3Pipeline.commitSha} · 增量覆盖率 ${
                                g3Pipeline.incrementalCoverage
                              }% · 聚合覆盖率 ${g3Pipeline.branchCoverage}% · Sonar 阻断级 ${
                                g3Pipeline.sonarBlocker
                              } · 状态 ${g3Pipeline.status}`
                            : ''}
                          。判据 2 / 4 未达成，G3 保持 blocking，任何来自 IDE 的产物都不能单独放行部署。
                        </span>
                      </div>
                      <div className="ac-ide-note">
                        <span className="ac-mono">test-result</span> 供 G3 判定「用例执行与失败项」，
                        <span className="ac-mono">coverage</span> 供 G3 判定「增量 / 聚合分支覆盖率 ≥ 85%」，
                        <span className="ac-mono">lint-report</span> 供 G3 判定「SonarQube 阻断级问题 = 0」；
                        三者缺一即视为门禁输入不完整。证据文件：{g3.evidence.join('、')}。
                      </div>
                    </div>

                    {/* 右：会话产物齐备度 + 触发部署 */}
                    <div className="ac-col ac-gap-2">
                      <div className="ac-ide-plug-sub-t">
                        <Package size={11} /> 单会话产物齐备度 → 是否允许触发部署
                      </div>
                      <div className="ac-field ac-field--inline">
                        <span className="ac-field-label">选择同步会话</span>
                        <select
                          className="ac-select ac-select--sm"
                          value={gateSessionId}
                          onChange={(e) => setGateSessionId(e.target.value)}
                        >
                          {ideSessions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.id} · {USER_MAP[s.userId].name} · {SYNC_STATE_LABEL[s.syncState]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="ac-ide-art-grid ac-ide-art-grid--sm">
                        {ARTIFACT_ORDER.map((a) => {
                          const on = gateSession.artifactsUploaded.includes(a);
                          const need = G3_ARTIFACTS.includes(a);
                          const AIcon = ARTIFACT_META[a].Icon;
                          return (
                            <span
                              className={`ac-ide-art${on ? ' ac-ide-art--on' : ' ac-ide-art--off'}${
                                need ? ' ac-ide-art--need' : ''
                              }`}
                              key={a}
                              title={`${a} · ${ARTIFACT_META[a].label}${need ? '（G3 必需）' : ''} · ${
                                on ? '已上行' : '未上行'
                              }`}
                            >
                              <AIcon size={12} />
                              {ARTIFACT_META[a].label}
                              {on ? <Check size={11} /> : <X size={11} />}
                            </span>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className="ac-btn ac-btn--primary ac-btn--lg"
                        disabled={!gateReady}
                        title={
                          gateReady
                            ? 'G3 通过且产物齐备，可触发部署流水线'
                            : `禁用原因：${gateReasons.join('；')}`
                        }
                        onClick={() => {
                          window.location.hash = '#page=pipeline';
                        }}
                      >
                        <Rocket size={15} /> 触发部署（G3 联动）
                      </button>

                      {gateReady ? (
                        <span className="ac-hint ac-hint--ok">
                          <CheckCircle2 size={14} />
                          {gateSession.id} 的 G3 必需产物齐备、无待补传，且 G3 已通过，可进入部署流水线。
                        </span>
                      ) : (
                        <span className="ac-hint ac-hint--danger">
                          <Ban size={14} />
                          <span className="ac-col ac-gap-1">
                            <strong>「触发部署」已禁用，原因如下：</strong>
                            {gateReasons.map((r, i) => (
                              <span className="ac-ide-reason" key={r}>
                                {i + 1}. {r}
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------------- D4. 端到端编排流 ---------------- */}
              <div className="ac-card">
                <div className="ac-card-head">
                  <div className="ac-card-title">
                    <Workflow size={15} /> 端到端编排 · {ideFlow.name}
                  </div>
                  <div className="ac-card-subtitle">
                    触发事件 <span className="ac-mono">{ideFlow.triggerEvent}</span>（{ideFlow.triggerType}）· 最近执行{' '}
                    {ideFlow.lastRunAt} ·{' '}
                    {ideFlow.lastRunStatus === 'success'
                      ? '成功'
                      : ideFlow.lastRunStatus === 'partial'
                      ? '部分成功'
                      : '失败'}
                  </div>
                  <div className="ac-card-extra">
                    <span className="ac-tag ac-tag--sm ac-tag--ai">自动化率 {ideFlow.autoRatePct}%</span>
                    <span className="ac-tag ac-tag--sm ac-tag--info">
                      端到端均耗 {ideFlow.avgEndToEndMin} 分钟
                    </span>
                    <span className="ac-tag ac-tag--sm ac-tag--warn">
                      人工检查点 {ideFlow.humanCheckpoints.length} 处
                    </span>
                  </div>
                </div>
                <div className="ac-card-body">
                  <div className="ac-flow">
                    {ideFlow.steps.map((st, i) => {
                      const isCp = ideFlow.humanCheckpoints.includes(st.name);
                      const agent = st.agentId ? AGENT_MAP[st.agentId] : null;
                      const provider = st.toolProviderId ? PROVIDER_MAP[st.toolProviderId] : null;
                      return (
                        <React.Fragment key={st.order}>
                          {i > 0 ? (
                            <div className="ac-flow-arrow">
                              <ChevronRight size={14} />
                            </div>
                          ) : null}
                          <div
                            className={`ac-flow-node ac-ide-flownode ${
                              isCp ? 'ac-flow-node--gate' : 'ac-flow-node--running'
                            }`}
                          >
                            <div className="ac-flow-node-head">
                              <span className="ac-flow-node-idx">{st.order}</span>
                              <span className="ac-flow-node-title">{st.name}</span>
                              {isCp ? (
                                <span className="ac-ide-cp" title="该步骤必须人工确认后才能继续">
                                  <User size={10} />
                                  人工检查点
                                </span>
                              ) : null}
                            </div>
                            <div className="ac-ide-flownode-tags">
                              <span
                                className={`ac-tag ac-tag--sm ac-tag--${tagTone(EXECUTOR_META[st.executor].tone)}`}
                              >
                                {EXECUTOR_META[st.executor].label}
                              </span>
                              {agent ? (
                                <span
                                  className="ac-tag ac-tag--sm ac-tag--outline"
                                  title={`${agent.name} · 模型 ${agent.modelName} · 成功率 ${agent.successRate}%`}
                                >
                                  <Bot size={10} />
                                  {agent.name}
                                </span>
                              ) : (
                                <span className="ac-tag ac-tag--sm ac-tag--neutral">
                                  <Terminal size={10} />
                                  IDE 插件 / 平台自有集成
                                </span>
                              )}
                              {provider ? (
                                <span className="ac-tag ac-tag--sm ac-tag--neutral">{provider.name}</span>
                              ) : null}
                              <span className="ac-tag ac-tag--sm ac-tag--info">
                                <Timer size={10} />
                                {fmtDurSec(st.durationSec)}
                              </span>
                            </div>
                            <div className="ac-flow-node-meta ac-ide-flownode-meta">
                              <span>
                                <b className="ac-ide-k">输入</b>
                                {st.inputFrom}
                              </span>
                              <span>
                                <b className="ac-ide-k">输出</b>
                                {st.outputTo}
                              </span>
                              <span>
                                <b className="ac-ide-k">降级</b>
                                {st.fallbackAction}
                              </span>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <div className="ac-hint ac-hint--ai ac-mt-3">
                    <Info size={14} />
                    <span>
                      人工检查点为「{ideFlow.humanCheckpoints.join('」与「')}」：AI 逐块给出的补丁必须由开发者接受、
                      冲突三方合并结果必须由责任人复核，两步都通过后才会写入平台侧编码会话（CODING_SESSIONS）并自动创建 MR。
                      全流程 {ideFlow.steps.length} 步、自动化率 {ideFlow.autoRatePct}%、平均端到端{' '}
                      {ideFlow.avgEndToEndMin} 分钟；最近一次执行状态为「
                      {ideFlow.lastRunStatus === 'success'
                        ? '成功'
                        : ideFlow.lastRunStatus === 'partial'
                        ? '部分成功'
                        : '失败'}
                      」，对应 IDE-07 在 {AI_FLOW_TODAY} 10:31 的那次同步（6 条 AI 生成断言仍待人工复核后回传）。
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {/* ---------------- 任务选择器 ---------------- */}
      <div className="ac-card ac-card--flat" data-annotation-id="ai-sdlc-coding-task-selector">
        <div className="ac-card-head">
          <div className="ac-card-title">
            <Sparkles size={15} /> 编码任务
          </div>
          <div className="ac-card-subtitle">共 {CODING_SESSIONS.length} 个存在 AI 编码会话的任务</div>
        </div>
        <div className="ac-card-body ac-card-body--tight">
          <div className="ac-coding-taskbar">
            {CODING_SESSIONS.map((s) => {
              const t = TASK_MAP[s.taskId];
              const st = TASK_STATES.find((x) => x.id === t.state);
              const o = USER_MAP[s.ownerId];
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`ac-coding-task ${s.id === sessionId ? 'ac-coding-task--active' : ''}`}
                  onClick={() => setSessionId(s.id)}
                >
                  <div className="ac-row-between">
                    <span className="ac-coding-task-code">{t.code}</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${st?.tone ?? 'neutral'}`}>
                      {t.stateLabel}
                    </span>
                  </div>
                  <div className="ac-coding-task-title">{t.title}</div>
                  <div className="ac-row ac-gap-2 ac-xs ac-muted">
                    <span className={`ac-avatar ac-avatar--xs ac-avatar--${o.avatarColor}`}>
                      {o.initial}
                    </span>
                    <span>{o.name}</span>
                    <span className="ac-ml-auto ac-mono ac-xs">{s.repoBranch}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------- 会话流 + 上下文切片 ---------------- */}
      <div className="ac-grid-2-1">
        {/* 会话流 */}
        <div className="ac-card" data-annotation-id="ai-sdlc-coding-session-flow">
          <div className="ac-card-head">
            <div className="ac-card-title">
              <Bot size={15} /> AI 会话流
            </div>
            <div className="ac-card-subtitle">
              {session.id} · {session.turns} 轮 · 采纳率 {session.acceptRate}%
            </div>
            <div className="ac-card-extra">
              <button
                type="button"
                className={`ac-btn ac-btn--sm ${playing ? 'ac-btn--danger-ghost' : 'ac-btn--ghost'}`}
                onClick={() => {
                  if (playing) {
                    setPlaying(false);
                    return;
                  }
                  setVisibleCount(0);
                  setPlaying(true);
                }}
              >
                {playing ? <Square size={13} /> : <RotateCcw size={13} />}
                {playing ? '停止' : '重新播放'}
              </button>
            </div>
          </div>
          <div className="ac-card-body">
            <div className="ac-flowfeed">
              {visibleTurns.map((turn) => (
                <div key={turn.seq} className={`ac-msg ac-msg--${turn.role}`}>
                  <div className="ac-msg-avatar">
                    {turn.role === 'user' ? (
                      (USER_MAP[turn.actorId]?.initial ?? '人')
                    ) : turn.role === 'tool' ? (
                      <Wrench size={14} />
                    ) : (
                      <Bot size={15} />
                    )}
                  </div>
                  <div className="ac-msg-body">
                    <div className="ac-msg-head">
                      <span className="ac-msg-name">{actorName(turn)}</span>
                      <span className="ac-msg-role">{roleLabel(turn)}</span>
                      <span className="ac-msg-time ac-mono">{turn.time}</span>
                    </div>
                    <div className="ac-msg-bubble">
                      {turn.role === 'tool' && turn.toolName ? (
                        <span className="ac-msg-tool">
                          <Terminal size={10} /> {turn.toolName}
                        </span>
                      ) : null}
                      {turn.content}
                    </div>
                    <div className="ac-msg-meta">
                      {turn.durationMs > 0 ? (
                        <span>
                          <Clock size={10} /> {(turn.durationMs / 1000).toFixed(1)}s
                        </span>
                      ) : null}
                      <span>{turn.tokens} tokens</span>
                      <span>#{turn.seq}</span>
                    </div>
                  </div>
                </div>
              ))}
              {playing && visibleCount < total ? (
                <div className="ac-msg ac-msg--ai">
                  <div className="ac-msg-avatar">
                    <Bot size={15} />
                  </div>
                  <div className="ac-msg-body">
                    <div className="ac-msg-head">
                      <span className="ac-msg-name">AI 编码 Agent</span>
                      <span className="ac-msg-role">思考中</span>
                    </div>
                    <div className="ac-msg-bubble">
                      <span className="ac-typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="ac-card-foot ac-row ac-gap-3 ac-xs ac-muted">
            <span>
              <GitBranch size={11} /> {session.repoBranch}
            </span>
            <span>文件 {session.filesChanged}</span>
            <span className="ac-diff-add">+{session.additions}</span>
            <span className="ac-diff-del">-{session.deletions}</span>
            <span className="ac-ml-auto">模型 {session.modelId} · ${session.costUsd}</span>
          </div>
        </div>

        {/* 上下文切片 */}
        <div className="ac-card" data-annotation-id="ai-sdlc-coding-context-slices">
          <div className="ac-card-head">
            <div className="ac-card-title">
              <FileCode2 size={15} /> 代码上下文切片
            </div>
            <div className="ac-card-extra">
              <span
                className="ac-tag ac-tag--sm ac-tag--info"
                title="最小化上传：仅上传与本次任务相关的切片，敏感字段在本地脱敏后再送入模型，避免整仓上传"
              >
                最小化上传
              </span>
            </div>
          </div>
          <div className="ac-card-body ac-card-body--flush">
            <div className="ac-row-between ac-xs ac-muted" style={{ padding: '8px 20px' }}>
              <span>
                切片 {slices.length} 个 · 共 {fmtBytes(totalBytes)}
              </span>
              <span>
                已脱敏 {slices.filter((s) => s.masked).length} / {slices.length}
              </span>
            </div>
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>行范围</th>
                    <th>符号</th>
                    <th>脱敏</th>
                    <th className="ac-td-right">字节</th>
                  </tr>
                </thead>
                <tbody>
                  {slices.map((s) => (
                    <tr key={s.path}>
                      <td className="ac-mono ac-xs ac-ellipsis" title={s.path} style={{ maxWidth: 190 }}>
                        {s.file}
                      </td>
                      <td className="ac-mono ac-xs ac-nowrap">
                        {s.lineStart}-{s.lineEnd}
                      </td>
                      <td className="ac-xs">{s.symbol}</td>
                      <td>
                        {s.masked ? (
                          <span className="ac-tag ac-tag--sm ac-tag--ok">
                            <ShieldCheck size={10} /> 已脱敏
                          </span>
                        ) : (
                          <span className="ac-tag ac-tag--sm ac-tag--warn">
                            <ShieldAlert size={10} /> 未脱敏
                          </span>
                        )}
                      </td>
                      <td className="ac-td-num ac-xs">{fmtBytes(s.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Diff 审查 ---------------- */}
      <div className="ac-card" data-annotation-id="ai-sdlc-coding-diff-review">
        <div className="ac-card-head">
          <div className="ac-card-title">
            <FileCode2 size={15} /> Diff 审查
          </div>
          <div className="ac-card-subtitle">
            涉及文件 {session.filesChanged} · <span className="ac-diff-add">+{session.additions}</span>{' '}
            <span className="ac-diff-del">-{session.deletions}</span>（当前抽样 {diffFiles.length} 个文件）
          </div>
          <div className="ac-card-extra">
            <span className="ac-tag ac-tag--sm ac-tag--ok">已接受 {summary.accepted}</span>
            <span className="ac-tag ac-tag--sm ac-tag--neutral">已拒绝 {summary.rejected}</span>
            <span className="ac-tag ac-tag--sm ac-tag--warn">待处理 {summary.pending}</span>
            <button
              type="button"
              className="ac-btn ac-btn--sm ac-btn--ghost"
              onClick={() => decideAll('accepted')}
            >
              <Check size={13} /> 全部接受
            </button>
            <button
              type="button"
              className="ac-btn ac-btn--sm ac-btn--ghost"
              onClick={() => decideAll('rejected')}
            >
              <X size={13} /> 全部拒绝
            </button>
          </div>
        </div>

        <div className="ac-card-body ac-card-body--tight">
          <div className="ac-diff-files ac-mb-3">
            {diffFiles.map((f, fi) => (
              <button
                key={f.path}
                type="button"
                className={`ac-diff-filechip ${fi === fileIndex ? 'ac-diff-filechip--active' : ''}`}
                onClick={() => setFileIndex(fi)}
                title={f.path}
              >
                <span className="ac-diff-filechip-name">{f.file}</span>
                <span className="ac-diff-add">+{f.additions}</span>
                <span className="ac-diff-del">-{f.deletions}</span>
              </button>
            ))}
          </div>

          <div className="ac-diff">
            <div className="ac-diff-head">
              <FileCode2 size={13} />
              <span className="ac-diff-file">{currentFile.file}</span>
              <span className="ac-diff-stat">
                <span className="ac-diff-add">+{currentFile.additions}</span>
                <span className="ac-diff-del">-{currentFile.deletions}</span>
              </span>
            </div>

            {currentFile.hunks.map((hunk, hi) => {
              const key = `${fileIndex}-${hi}`;
              const state = hunkState[key] ?? 'pending';
              const leftRows: React.ReactNode[] = [];
              const rightRows: React.ReactNode[] = [];
              hunk.lines.forEach((line, li) => {
                if (line.kind === 'del') {
                  leftRows.push(renderRow(`l-${li}`, 'del', line.oldNo, '-', line.text));
                  rightRows.push(renderEmpty(`r-${li}`));
                } else if (line.kind === 'add') {
                  leftRows.push(renderEmpty(`l-${li}`));
                  rightRows.push(renderRow(`r-${li}`, 'add', line.newNo, '+', line.text));
                } else {
                  leftRows.push(renderRow(`l-${li}`, 'ctx', line.oldNo, ' ', line.text));
                  rightRows.push(renderRow(`r-${li}`, 'ctx', line.newNo, ' ', line.text));
                }
              });
              return (
                <div key={hunk.header}>
                  <div className={`ac-diff-hunkbar ac-diff-hunkbar--${state}`}>
                    <span className="ac-diff-hunkbar-code">{hunk.header}</span>
                    <span className="ac-ml-auto ac-row ac-gap-2">
                      {state === 'pending' ? (
                        <>
                          <button
                            type="button"
                            className="ac-btn ac-btn--sm ac-btn--ghost"
                            onClick={() => decide(fileIndex, hi, 'accepted')}
                          >
                            <Check size={12} /> 接受
                          </button>
                          <button
                            type="button"
                            className="ac-btn ac-btn--sm ac-btn--danger-ghost"
                            onClick={() => decide(fileIndex, hi, 'rejected')}
                          >
                            <X size={12} /> 拒绝
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ac-btn ac-btn--sm ac-btn--text"
                          title="点击撤销，恢复为待处理"
                          onClick={() => decide(fileIndex, hi, 'pending')}
                        >
                          {state === 'accepted' ? (
                            <span className="ac-hunk-state ac-hunk-state--accepted">
                              <CheckCircle2 size={13} /> 已接受
                            </span>
                          ) : (
                            <span className="ac-hunk-state ac-hunk-state--rejected">
                              <XCircle size={13} /> 已拒绝
                            </span>
                          )}
                          <RotateCcw size={11} />
                        </button>
                      )}
                    </span>
                  </div>
                  <div
                    className={`ac-diff-split-wrap ${
                      state === 'rejected' ? 'ac-diff-split-wrap--rejected' : ''
                    }`}
                  >
                    <div className="ac-diff-split">
                      <div className="ac-diff-split-head">旧版 · HEAD</div>
                      <div className="ac-diff-split-head">新版 · {session.repoBranch}</div>
                      <div className="ac-diff-body">{leftRows}</div>
                      <div className="ac-diff-body">{rightRows}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ac-card-foot">
          <div className="ac-field">
            <span className="ac-field-label">提交信息草稿</span>
            <textarea
              className="ac-textarea ac-input--sm"
              style={{ minHeight: 52 }}
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="填写提交信息（Conventional Commits）"
            />
          </div>
        </div>
      </div>

      {/* ---------------- 本地执行结果 + 部署门禁 ---------------- */}
      <div className="ac-card" data-annotation-id="ai-sdlc-coding-exec-results">
        <div className="ac-card-head">
          <div className="ac-card-title">
            <Terminal size={15} /> 本地执行结果
          </div>
          <div className="ac-card-subtitle">{session.id} · 最近 {execRuns.length} 次本地执行</div>
          <div className="ac-card-extra">
            {latestRun.failed === 0 && latestRun.exitCode === 0 ? (
              <span className="ac-tag ac-tag--sm ac-tag--ok">
                <CheckCircle2 size={11} /> 全部通过
              </span>
            ) : (
              <span className="ac-tag ac-tag--sm ac-tag--danger">
                <XCircle size={11} /> {latestRun.failed} 个用例失败
              </span>
            )}
          </div>
        </div>
        <div className="ac-card-body ac-card-body--tight">
          {execRuns.map((run) => {
            const ok = run.exitCode === 0 && run.failed === 0;
            const open = expandedRun === run.id;
            return (
              <div key={run.id}>
                <div className="ac-exec-row">
                  <span
                    className={`ac-badge ${ok ? 'ac-badge--ok' : 'ac-badge--danger'}`}
                    title={`exitCode = ${run.exitCode}`}
                  >
                    {run.exitCode}
                  </span>
                  <span className="ac-exec-cmd">{run.command}</span>
                  <span className="ac-exec-metrics">
                    <span>耗时 {(run.durationMs / 1000).toFixed(1)}s</span>
                    <span className="ac-diff-add">通过 {run.passed}</span>
                    <span className={run.failed > 0 ? 'ac-diff-del' : ''}>失败 {run.failed}</span>
                    <span>跳过 {run.skipped}</span>
                  </span>
                  <span className="ac-ml-auto ac-xs ac-muted ac-mono">{run.time}</span>
                  <button
                    type="button"
                    className="ac-btn ac-btn--sm ac-btn--text"
                    onClick={() => setExpandedRun(open ? null : run.id)}
                  >
                    {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {open ? '收起日志' : '查看日志'}
                  </button>
                </div>
                {open ? (
                  <div className="ac-code ac-mb-3">
                    <div className="ac-code-head">
                      <span className="ac-code-title">{run.command}</span>
                      <span className="ac-code-lang">shell</span>
                    </div>
                    <div className="ac-code-body">{run.log.join('\n')}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="ac-card-foot ac-row ac-gap-3">
          <button
            type="button"
            className="ac-btn ac-btn--primary ac-btn--lg"
            disabled={!deployable}
            title={
              deployable
                ? '本地执行全部通过，进入部署流水线'
                : `最近一次本地执行：exitCode=${latestRun.exitCode}，失败用例 ${latestRun.failed} 个，需全部通过后方可触发部署`
            }
            onClick={() => {
              window.location.hash = '#page=pipeline';
            }}
            data-annotation-id="ai-sdlc-coding-deploy-gate"
          >
            <Rocket size={15} /> 触发部署
          </button>
          {deployable ? (
            <span className="ac-hint ac-hint--ok ac-flex-1">
              <CheckCircle2 size={14} />
              门禁满足：最近一次本地执行 <span className="ac-mono">{latestRun.command}</span> 退出码 0 且
              无失败用例。
            </span>
          ) : (
            <span className="ac-hint ac-hint--warn ac-flex-1">
              <AlertTriangle size={14} />
              门禁未满足：最近一次本地执行退出码 {latestRun.exitCode}，失败 {latestRun.failed} 个用例（
              {latestRun.command}），修复后重跑通过才可触发部署。
            </span>
          )}
        </div>
      </div>

      {/* ---------------- C. 同步会话详情抽屉 ---------------- */}
      <Drawer
        open={detail !== null}
        width={1080}
        title={detail ? `${detail.id} · 本地 IDE 同步详情` : '本地 IDE 同步详情'}
        subtitle={
          detail
            ? `${USER_MAP[detail.userId].name} · ${detail.ideVersion} · 插件 v${detail.pluginVersion} · ${detail.os} · ${detail.branch}`
            : ''
        }
        onClose={() => setDetailId(null)}
        footer={
          detail ? (
            <>
              <span className="ac-xs ac-muted ac-mono">
                开始 {detail.startedAt} · 最近同步 {detail.lastSyncAt}
              </span>
              {detail.codingSessionId ? (
                <button
                  type="button"
                  className="ac-btn ac-btn--sm ac-btn--ghost"
                  onClick={() => {
                    if (detail.codingSessionId) gotoCodingSession(detail.codingSessionId);
                  }}
                >
                  <Bot size={13} />
                  联动平台侧会话 {detail.codingSessionId}
                </button>
              ) : null}
              <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => setDetailId(null)}>
                关闭
              </button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="ac-ide-detail" data-annotation-id="ai-sdlc-coding-ide-detail">
            {/* ---- C1. 指标区 ---- */}
            <div className="ac-ide-dsec">
              <div className="ac-ide-dsec-t">
                <Activity size={13} /> 同步指标（metrics · 12 项）
              </div>
              <div className="ac-ide-mgrid">
                <span className="ac-ide-mcell">
                  <b>AI 对话轮次</b>
                  {detail.metrics.aiTurnCount} 轮
                </span>
                <span className="ac-ide-mcell">
                  <b>AI 采纳行数</b>
                  {fmtNum(detail.metrics.aiAcceptedLines)} 行
                </span>
                <span className="ac-ide-mcell">
                  <b>AI 拒绝行数</b>
                  {fmtNum(detail.metrics.aiRejectedLines)} 行
                </span>
                <span className="ac-ide-mcell ac-ide-mcell--hl">
                  <b>采纳率</b>
                  {detail.metrics.acceptRatePct}%
                </span>
                <span className="ac-ide-mcell">
                  <b>人工编写行数</b>
                  {fmtNum(detail.metrics.manualLines)} 行
                </span>
                <span className="ac-ide-mcell ac-ide-mcell--hl">
                  <b>变更总行数</b>
                  {fmtNum(detail.metrics.totalLinesChanged)} 行
                </span>
                <span className="ac-ide-mcell">
                  <b>上下文文件数</b>
                  {detail.metrics.contextFilesSent} 个
                </span>
                <span className="ac-ide-mcell">
                  <b>采集 tokens</b>
                  {fmtNum(detail.metrics.tokensSent)}
                </span>
                <span className="ac-ide-mcell">
                  <b>脱敏 tokens</b>
                  {fmtNum(detail.metrics.tokensMasked)}
                </span>
                <span className="ac-ide-mcell">
                  <b>脱敏命中处数</b>
                  {fmtNum(detail.metrics.maskHitCount)} 处
                </span>
                <span className="ac-ide-mcell">
                  <b>上行字节</b>
                  {fmtBytesBig(detail.metrics.uploadBytes)}
                </span>
                <span className="ac-ide-mcell">
                  <b>平均时延</b>
                  {detail.metrics.avgLatencyMs} ms
                </span>
              </div>

              <IdeFormula m={detail.metrics} />

              <div className="ac-grid-2 ac-mt-3">
                <div className="ac-ide-chart">
                  <div className="ac-ide-chart-t">
                    <Split size={12} /> 行数构成（采纳 / 人工 / 拒绝对比）
                  </div>
                  <IdeLinesBar m={detail.metrics} />
                </div>
                <div className="ac-ide-chart">
                  <div className="ac-ide-chart-t">
                    <ShieldOff size={12} /> 脱敏漏斗（采集 → 命中脱敏 → 实际上行）
                  </div>
                  <IdeMaskFunnel m={detail.metrics} />
                </div>
              </div>
            </div>

            {/* ---- C2. 隐私与出网管控 ---- */}
            <div className="ac-ide-dsec">
              <div className="ac-ide-dsec-t">
                <Lock size={13} /> 隐私与出网管控（privacy）
              </div>

              <div className="ac-ide-egrow">
                <span
                  className={`ac-ide-egress ac-ide-egress--${detail.privacy.egressMode.toLowerCase()}`}
                  title={EGRESS_BY_CODE[detail.privacy.egressMode] ? EGRESS_BY_CODE[detail.privacy.egressMode].desc : ''}
                >
                  {(() => {
                    const EgIcon = EGRESS_META[detail.privacy.egressMode].Icon;
                    return <EgIcon size={20} />;
                  })()}
                  <strong>{detail.privacy.egressMode}</strong>
                  <small>{EGRESS_META[detail.privacy.egressMode].label}</small>
                </span>
                <dl className="ac-kv ac-ide-kv ac-flex-1">
                  <dt>策略版本</dt>
                  <dd className="ac-mono ac-xs">{detail.privacy.policyVersion}</dd>
                  <dt>策略条目</dt>
                  <dd className="ac-xs">
                    {EGRESS_BY_CODE[detail.privacy.egressMode]
                      ? `${EGRESS_BY_CODE[detail.privacy.egressMode].id} · ${
                          EGRESS_BY_CODE[detail.privacy.egressMode].name
                        }`
                      : detail.privacy.egressMode}
                  </dd>
                  <dt>允许外部模型</dt>
                  <dd className="ac-xs">
                    {EGRESS_BY_CODE[detail.privacy.egressMode] &&
                    EGRESS_BY_CODE[detail.privacy.egressMode].allowExternalModel
                      ? '是'
                      : '否 · 强制内网 mdl-local'}
                  </dd>
                  <dt>允许原始数据</dt>
                  <dd className="ac-xs">
                    {EGRESS_BY_CODE[detail.privacy.egressMode] &&
                    EGRESS_BY_CODE[detail.privacy.egressMode].allowRawData
                      ? '是'
                      : '否 · 出域前必须处理'}
                  </dd>
                  <dt>最高密级</dt>
                  <dd className="ac-xs">
                    {EGRESS_BY_CODE[detail.privacy.egressMode]
                      ? EGRESS_BY_CODE[detail.privacy.egressMode].maxSecretLevel
                      : '—'}
                  </dd>
                  <dt>脱敏成效</dt>
                  <dd className="ac-xs">
                    命中 {detail.metrics.maskHitCount} 处 · {fmtNum(detail.metrics.tokensMasked)} /{' '}
                    {fmtNum(detail.metrics.tokensSent)} tokens
                  </dd>
                </dl>
              </div>

              <div className="ac-ide-plug-sub">
                <span className="ac-ide-plug-sub-t">
                  <ShieldOff size={11} /> 实际被脱敏的字段（{detail.privacy.maskedFields.length}）→ 对应{' '}
                  {detail.privacy.policyVersion} 规则
                </span>
                {detail.privacy.maskedFields.length === 0 ? (
                  <span className="ac-ide-note">
                    该会话无字段被脱敏——
                    {detail.privacy.egressMode === 'ALLOW'
                      ? 'ALLOW 模式仅限 L1 公开级数据，无需脱敏；'
                      : 'DENY 模式数据根本不出网，脱敏环节不被触发（tokensMasked = 0）。'}
                  </span>
                ) : (
                  <div className="ac-ide-fields">
                    {detail.privacy.maskedFields.map((f) => {
                      const r = REDACT_BY_FIELD[f];
                      return (
                        <span
                          className="ac-ide-field"
                          key={f}
                          title={
                            r
                              ? `${r.id} ${r.name} · ${r.category} · ${r.strategy} · 作用域 ${r.scope} · 全局命中 ${fmtNum(r.hits)} 次`
                              : '该字段在 redactRules 中未登记'
                          }
                        >
                          <span className="ac-mono ac-xs">{f}</span>
                          {r ? (
                            <>
                              <span className={`ac-tag ac-tag--sm ac-tag--${tagTone(r.tone)}`}>
                                {r.id} {r.name}
                              </span>
                              <span className="ac-ide-field-s ac-mono">
                                {r.sampleBefore} → {r.sampleAfter}
                              </span>
                            </>
                          ) : (
                            <span className="ac-tag ac-tag--sm ac-tag--warn">规则未登记</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="ac-ide-plug-sub">
                <span className="ac-ide-plug-sub-t">
                  <FolderLock size={11} /> 永不上行的本地文件（{detail.privacy.localOnlyFiles.length}）
                </span>
                {detail.privacy.localOnlyFiles.length === 0 ? (
                  <span className="ac-ide-note">无本地保留文件（ALLOW 模式，开发环境工作区）。</span>
                ) : (
                  <div className="ac-code ac-code--light">
                    <div className="ac-code-head">
                      <span className="ac-code-title">localOnlyFiles · 仅保留在开发者本机，任何模式下都不上行</span>
                      <span className="ac-code-lang">paths</span>
                    </div>
                    <div className="ac-code-body">{detail.privacy.localOnlyFiles.join('\n')}</div>
                  </div>
                )}
              </div>

              <div className="ac-hint ac-hint--ai">
                <Cpu size={14} />
                <span>
                  <strong>出网模式决定模型可选集</strong>：本会话为 {detail.privacy.egressMode}（
                  {EGRESS_META[detail.privacy.egressMode].label}）。
                  {detail.privacy.egressMode === 'DENY'
                    ? `禁止任何数据出域，插件把模型强制路由到内网私有化 mdl-local（${
                        MODEL_MAP['mdl-local'] ? MODEL_MAP['mdl-local'].name : 'mdl-local'
                      }）；平台侧关联会话 ${
                        detail.codingSessionId ?? '—'
                      } 的 modelId 也正是 mdl-local。因此 tokensMasked = 0、contextFilesSent = ${
                        detail.metrics.contextFilesSent
                      }、uploadBytes = ${fmtNum(detail.metrics.uploadBytes)} —— 不是没有脱敏，而是数据根本不出网。`
                    : detail.privacy.egressMode === 'MASK'
                    ? `允许调用外部模型，但敏感字段必须先经 ${detail.privacy.policyVersion} 脱敏：本会话命中 ${
                        detail.metrics.maskHitCount
                      } 处、${fmtNum(detail.metrics.tokensMasked)} tokens 被替换后才出网；平台侧关联会话 ${
                        detail.codingSessionId ?? '—'
                      } 使用的是外部模型 ${
                        detail.codingSessionId && CODING_SESSION_MAP[detail.codingSessionId]
                          ? `${CODING_SESSION_MAP[detail.codingSessionId].modelId}（${
                              MODEL_MAP[CODING_SESSION_MAP[detail.codingSessionId].modelId]
                                ? MODEL_MAP[CODING_SESSION_MAP[detail.codingSessionId].modelId].name
                                : ''
                            }）`
                          : '—'
                      }。`
                    : '开发环境允许原始数据出域（仅限 L1 公开级），因此无脱敏命中、无本地保留文件。'}
                  全量 {IDE_SYNC_SESSIONS.length} 条会话中，MASK 的 7 条全部走外部模型（Claude / DeepSeek / Qwen），
                  DENY 的 2 条（IDE-09 / IDE-10）全部走 mdl-local，出网管控与模型路由一一对应。
                </span>
              </div>
            </div>

            {/* ---- C3. 产物上传清单 ---- */}
            <div className="ac-ide-dsec">
              <div className="ac-ide-dsec-t">
                <Package size={13} /> 产物上传清单（artifactsUploaded · {detail.artifactsUploaded.length} /{' '}
                {ARTIFACT_ORDER.length}）
              </div>
              <div className="ac-ide-art-grid">
                {ARTIFACT_ORDER.map((a) => {
                  const on = detail.artifactsUploaded.includes(a);
                  const need = G3_ARTIFACTS.includes(a);
                  const AIcon = ARTIFACT_META[a].Icon;
                  return (
                    <span
                      className={`ac-ide-art${on ? ' ac-ide-art--on' : ' ac-ide-art--off'}${
                        need ? ' ac-ide-art--need' : ''
                      }`}
                      key={a}
                      title={`${a} · ${ARTIFACT_META[a].label}${need ? '（G3 编码门禁必需）' : ''} · ${
                        on ? '已上行' : '未上行'
                      }`}
                    >
                      <AIcon size={13} />
                      <span className="ac-col ac-gap-0 ac-flex-1">
                        <span className="ac-ide-art-n">{ARTIFACT_META[a].label}</span>
                        <span className="ac-ide-art-s ac-mono">
                          {a}
                          {need ? ' · G3 必需' : ''}
                        </span>
                      </span>
                      {on ? <Check size={13} /> : <X size={13} />}
                    </span>
                  );
                })}
              </div>
              {detail.pendingUploads > 0 ? (
                <div className="ac-hint ac-hint--warn ac-mt-2">
                  <Inbox size={13} />
                  <span>
                    仍有 {detail.pendingUploads} 项产物滞留在本地离线队列，缺口为：
                    {ARTIFACT_ORDER.filter((a) => !detail.artifactsUploaded.includes(a))
                      .map((a) => `${ARTIFACT_META[a].label}（${a}）`)
                      .join('、')}
                    。回连或出域审批通过后按序补传，并逐片校验 sha256。
                  </span>
                </div>
              ) : (
                <div className="ac-hint ac-hint--ok ac-mt-2">
                  <CheckCircle2 size={13} />
                  <span>
                    离线队列已清空（pendingUploads = 0）。未上行的{' '}
                    {ARTIFACT_ORDER.filter((a) => !detail.artifactsUploaded.includes(a)).length} 类产物属于本次会话
                    未产生的类型，而非补传失败。
                  </span>
                </div>
              )}
            </div>

            {/* ---- C4. 冲突区 ---- */}
            <div className="ac-ide-dsec">
              <div className="ac-ide-dsec-t">
                <GitMerge size={13} /> 平台 / 本地版本冲突（conflicts · {detail.conflicts.length}）
              </div>
              {detail.conflicts.length === 0 ? (
                <span className="ac-ide-note">该会话不存在平台侧与本地的双向修改冲突。</span>
              ) : (
                detail.conflicts.map((c) => (
                  <div className="ac-ide-conflict" key={c.filePath}>
                    <div className="ac-mono ac-xs ac-ide-conflict-path">{c.filePath}</div>
                    <div className="ac-ide-conflict-vs">
                      <span className="ac-ide-vs ac-ide-vs--pf">
                        <b>平台版本</b>
                        {c.platformVersion}
                      </span>
                      <span className="ac-ide-vs ac-ide-vs--local">
                        <b>本地版本</b>
                        {c.localVersion}
                      </span>
                    </div>
                    <div className="ac-row ac-gap-2 ac-wrap">
                      <span
                        className={`ac-tag ac-tag--sm ac-tag--${tagTone(RESOLVED_BY_META[c.resolvedBy].tone)}`}
                      >
                        {c.resolvedBy === 'ai' ? <Bot size={10} /> : c.resolvedBy === 'human' ? <User size={10} /> : <Merge size={10} />}
                        {RESOLVED_BY_META[c.resolvedBy].label}
                      </span>
                      <span className="ac-tag ac-tag--sm ac-tag--neutral">resolvedBy = {c.resolvedBy}</span>
                    </div>
                    <div className="ac-xs ac-text-2 ac-ide-conflict-res">{c.resolution}</div>
                  </div>
                ))
              )}
            </div>

            {/* ---- C5. 事件流 + 时序泳道 ---- */}
            <div className="ac-ide-dsec" data-annotation-id="ai-sdlc-coding-ide-events">
              <div className="ac-ide-dsec-t">
                <ScrollText size={13} /> 同步事件流（{detailEvents.length} 条）· 会话时序泳道
              </div>

              {detailEvents.length === 0 ? (
                <div className="ac-empty ac-empty--sm">
                  <span className="ac-empty-icon">
                    <ScrollText size={20} />
                  </span>
                  <span className="ac-empty-title">该会话未开启逐事件留存</span>
                  <span className="ac-empty-desc">
                    平台当前只对 IDE-07（沈亦白 / TASK-2410 / CS-2410，{AI_FLOW_TODAY} 08:58~10:31）全量留存{' '}
                    {IDE_SYNC_EVENTS.length} 条链路事件作为样板；其余会话只保留指标与产物级摘要。
                  </span>
                </div>
              ) : (
                <>
                  <div className="ac-hint ac-mb-3">
                    <Upload size={13} />
                    <span>
                      上行核算：{evUpload.count} 条 <span className="ac-mono">direction = ide→platform</span> 且 bytes
                      非空的事件合计 <b>{fmtNum(evUpload.bytes)}</b> 字节，与{' '}
                      <span className="ac-mono">metrics.uploadBytes = {fmtNum(detail.metrics.uploadBytes)}</span>{' '}
                      {evUpload.bytes === detail.metrics.uploadBytes ? '完全对账一致' : '存在差异，需排查'}
                      （含离线队列入队与补传的两次计数）。
                    </span>
                  </div>

                  <IdeSwimlane events={detailEvents} />

                  <div className="ac-ide-keynodes">
                    <span className="ac-xs ac-muted">关键节点</span>
                    {KEY_EVENT_TYPES.map((t) => {
                      const n = detailEvents.filter((e) => e.type === t).length;
                      if (n === 0) return null;
                      const KIcon = EVENT_META[t].Icon;
                      return (
                        <button
                          type="button"
                          className={`ac-ide-evchip ac-ide-evchip--key${
                            evTypes.length === 1 && evTypes[0] === t ? ' ac-ide-evchip--on' : ''
                          }`}
                          key={t}
                          onClick={() => {
                            setEvTypes([t]);
                            setEvAbnormal(false);
                          }}
                        >
                          <KIcon size={10} />
                          {EVENT_META[t].label} ×{n}
                        </button>
                      );
                    })}
                  </div>

                  <div className="ac-ide-evfilter">
                    <span className="ac-xs ac-muted ac-nowrap">事件类型</span>
                    {Array.from(new Set(detailEvents.map((e) => e.type))).map((t) => {
                      const meta = EVENT_META[t];
                      const TIcon = meta.Icon;
                      const on = evTypes.includes(t);
                      const n = detailEvents.filter((e) => e.type === t).length;
                      return (
                        <button
                          type="button"
                          className={`ac-ide-evchip${on ? ' ac-ide-evchip--on' : ''}`}
                          key={t}
                          onClick={() => toggleEvType(t)}
                          title={`${meta.label}（${t}）· ${n} 条`}
                        >
                          <TIcon size={10} />
                          {meta.label}
                          <b>{n}</b>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`ac-btn ac-btn--sm ${evAbnormal ? 'ac-btn--danger-ghost' : 'ac-btn--ghost'}`}
                      onClick={() => setEvAbnormal((v) => !v)}
                    >
                      <AlertTriangle size={12} />
                      只看异常（{detailEvents.filter((e) => e.level !== 'info').length}）
                    </button>
                    {evTypes.length > 0 || evAbnormal ? (
                      <button
                        type="button"
                        className="ac-btn ac-btn--sm ac-btn--text"
                        onClick={() => {
                          setEvTypes([]);
                          setEvAbnormal(false);
                        }}
                      >
                        <Undo2 size={12} />
                        清空筛选
                      </button>
                    ) : null}
                    <span className="ac-ml-auto ac-xs ac-muted ac-nowrap">
                      显示 {evRows.length} / {detailEvents.length} 条
                    </span>
                  </div>

                  {evRows.length === 0 ? (
                    <div className="ac-empty ac-empty--sm">
                      <span className="ac-empty-icon">
                        <Search size={20} />
                      </span>
                      <span className="ac-empty-title">没有匹配的事件</span>
                      <span className="ac-empty-desc">当前类型筛选与「只看异常」组合下无事件，点击「清空筛选」恢复。</span>
                    </div>
                  ) : (
                    <div className="ac-timeline ac-ide-evlist">
                      {evRows.map((e) => {
                        const meta = EVENT_META[e.type];
                        const EIcon = meta.Icon;
                        const mod = timelineMod(meta.tone);
                        const isKey = KEY_EVENT_TYPES.includes(e.type);
                        const up = e.direction === 'ide→platform';
                        return (
                          <div
                            className={`ac-timeline-item${mod ? ` ac-timeline-item--${mod}` : ''}${
                              isKey ? ' ac-ide-ev--key' : ''
                            }`}
                            key={e.id}
                          >
                            <div className="ac-timeline-head">
                              <span className={`ac-ide-ev-type ac-ide-ev-type--${tagTone(meta.tone)}`}>
                                <EIcon size={11} />
                                {meta.label}
                              </span>
                              <span
                                className={`ac-tag ac-tag--sm ac-tag--${tagTone(LEVEL_META[e.level].tone)}`}
                              >
                                {LEVEL_META[e.level].label}
                              </span>
                              <span className={`ac-ide-ev-dir${up ? ' ac-ide-ev-dir--up' : ' ac-ide-ev-dir--down'}`}>
                                {up ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
                                {up ? '上行 IDE → 平台' : '下行 平台 → IDE'}
                              </span>
                              <span className="ac-timeline-time">{e.at}</span>
                              <span className="ac-ide-ev-id ac-mono">{e.id}</span>
                              {isKey ? <span className="ac-ide-ev-flag">关键节点</span> : null}
                            </div>
                            <div className="ac-timeline-desc">{e.payloadSummary}</div>
                            <div className="ac-ide-ev-meta">
                              {e.bytes !== null ? (
                                <span>
                                  <Upload size={10} />
                                  {fmtBytesBig(e.bytes)}
                                </span>
                              ) : (
                                <span className="ac-ide-ev-none">
                                  <Upload size={10} />
                                  无载荷
                                </span>
                              )}
                              {e.latencyMs !== null ? (
                                <span>
                                  <Timer size={10} />
                                  {fmtNum(e.latencyMs)} ms
                                </span>
                              ) : null}
                              {e.masked ? (
                                <span className="ac-ide-ev-mask">
                                  <ShieldOff size={10} />
                                  已脱敏 · {e.redactedFields.join(' / ')}
                                </span>
                              ) : (
                                <span className="ac-ide-ev-none">
                                  <ShieldCheck size={10} />
                                  无脱敏命中
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {detail.lastError ? (
              <div className="ac-ide-dsec">
                <div className="ac-ide-dsec-t">
                  <OctagonAlert size={13} /> 最近一次异常（lastError）
                </div>
                <div className="ac-hint ac-hint--danger">
                  <OctagonAlert size={14} />
                  <span>{detail.lastError}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

/* ---------- Diff 行渲染 ---------- */
function renderRow(
  key: string,
  kind: 'add' | 'del' | 'ctx',
  no: number | null,
  sign: string,
  text: string,
) {
  return (
    <div key={key} className={`ac-diff-row ac-diff-row--${kind}`}>
      <span className="ac-diff-ln">{no ?? ''}</span>
      <span className="ac-diff-sign">{sign}</span>
      <span className="ac-diff-code">{text || ' '}</span>
    </div>
  );
}

function renderEmpty(key: string) {
  return (
    <div key={key} className="ac-diff-row ac-diff-empty">
      <span className="ac-diff-ln" />
      <span className="ac-diff-sign" />
      <span className="ac-diff-code">{' '}</span>
    </div>
  );
}

/* ============================================================
 * IDE 同步：手绘 SVG 图表与抽屉子组件
 * ============================================================ */

/** 口径自洽核算：把两条公式的实算值与数据表登记值并列展示 */
function IdeFormula({ m }: { m: IdeSyncMetricsDef }) {
  const denom = m.aiAcceptedLines + m.aiRejectedLines;
  const recomputed = denom > 0 ? (m.aiAcceptedLines / denom) * 100 : 0;
  const rateOk = Math.abs(recomputed - m.acceptRatePct) < 0.06;
  const totalOk = m.aiAcceptedLines + m.manualLines === m.totalLinesChanged;
  return (
    <div className="ac-code ac-code--light ac-ide-formula">
      <div className="ac-code-head">
        <span className="ac-code-title">口径自洽核算（实算 vs 登记）</span>
        <span className="ac-code-lang">formula</span>
      </div>
      <div className="ac-code-body">
        <span className="ac-tok-key">totalLinesChanged</span>
        {' = '}
        <span className="ac-tok-fn">aiAcceptedLines</span>
        {' + '}
        <span className="ac-tok-fn">manualLines</span>
        {'\n                 = '}
        <span className="ac-tok-num">{fmtNum(m.aiAcceptedLines)}</span>
        {' + '}
        <span className="ac-tok-num">{fmtNum(m.manualLines)}</span>
        {' = '}
        <span className="ac-tok-num">{fmtNum(m.aiAcceptedLines + m.manualLines)}</span>
        {'   登记 '}
        <span className="ac-tok-num">{fmtNum(m.totalLinesChanged)}</span>
        {'   '}
        <span className={totalOk ? 'ac-tok-str' : 'ac-tok-attr'}>{totalOk ? '✓ 一致' : '✗ 不一致'}</span>
        {'\n\n'}
        <span className="ac-tok-key">acceptRatePct</span>
        {'    = '}
        <span className="ac-tok-fn">aiAcceptedLines</span>
        {' / ('}
        <span className="ac-tok-fn">aiAcceptedLines</span>
        {' + '}
        <span className="ac-tok-fn">aiRejectedLines</span>
        {') × 100\n'}
        {denom > 0 ? (
          <>
            {'                 = '}
            <span className="ac-tok-num">{fmtNum(m.aiAcceptedLines)}</span>
            {' / '}
            <span className="ac-tok-num">{fmtNum(denom)}</span>
            {' × 100 = '}
            <span className="ac-tok-num">{recomputed.toFixed(1)}%</span>
            {'   登记 '}
            <span className="ac-tok-num">{m.acceptRatePct}%</span>
            {'   '}
            <span className={rateOk ? 'ac-tok-str' : 'ac-tok-attr'}>{rateOk ? '✓ 一致' : '✗ 不一致'}</span>
          </>
        ) : (
          <>
            {'                 = '}
            <span className="ac-tok-num">{fmtNum(m.aiAcceptedLines)}</span>
            {' / '}
            <span className="ac-tok-num">0</span>
            <span className="ac-tok-com">
              {'  // 分母为 0（尚无人工采纳或拒绝的 AI 建议），按约定记为 0%'}
            </span>
          </>
        )}
        {'\n'}
        <span className="ac-tok-com">
          {`// 上行字节核算：仅 direction = ide→platform 且 bytes 非空的事件计入 uploadBytes = ${fmtNum(
            m.uploadBytes,
          )}`}
        </span>
      </div>
    </div>
  );
}

/** 行数构成条：AI 采纳 + 人工 = 变更总行数，并把 AI 拒绝行数画在下方作对比 */
function IdeLinesBar({ m }: { m: IdeSyncMetricsDef }) {
  const W = 470;
  const H = 190;
  const left = 8;
  const bw = W - left - 74;
  const maxV = Math.max(m.totalLinesChanged, m.aiRejectedLines, 1);
  const sc = bw / maxV;
  const accW = m.aiAcceptedLines * sc;
  const manW = m.manualLines * sc;
  const rejW = m.aiRejectedLines * sc;
  const y1 = 30;
  const y2 = 92;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="行数构成条">
      <text x={left} y={16} fontSize={10} fill="#5b6675">
        变更总行数 = AI 采纳 + 人工编写
      </text>
      <rect x={left} y={y1} width={Math.max(accW, 0)} height={22} rx={3} fill={TONE_HEX.ai} />
      <rect x={left + accW} y={y1} width={Math.max(manW, 0)} height={22} rx={3} fill={TONE_HEX.neutral} />
      {accW > 58 ? (
        <text x={left + accW / 2} y={y1 + 15} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">
          AI {fmtNum(m.aiAcceptedLines)}
        </text>
      ) : null}
      {manW > 52 ? (
        <text x={left + accW + manW / 2} y={y1 + 15} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">
          人工 {fmtNum(m.manualLines)}
        </text>
      ) : null}
      <text x={left + accW + manW + 8} y={y1 + 15} fontSize={10.5} fontWeight={700} fill="#131a24">
        {fmtNum(m.totalLinesChanged)} 行
      </text>

      <text x={left} y={80} fontSize={10} fill="#5b6675">
        对比：AI 拒绝行数（不计入变更总行数）
      </text>
      <rect x={left} y={y2} width={Math.max(rejW, 0)} height={22} rx={3} fill={TONE_HEX.danger} opacity={0.88} />
      {rejW > 58 ? (
        <text x={left + rejW / 2} y={y2 + 15} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">
          拒绝 {fmtNum(m.aiRejectedLines)}
        </text>
      ) : null}
      <text x={left + rejW + 8} y={y2 + 15} fontSize={10.5} fontWeight={700} fill="#b91c1c">
        {fmtNum(m.aiRejectedLines)} 行
      </text>

      <g>
        <rect x={left} y={138} width={10} height={10} rx={2} fill={TONE_HEX.ai} />
        <text x={left + 15} y={147} fontSize={9.5} fill="#5b6675">
          aiAcceptedLines
        </text>
        <rect x={left + 108} y={138} width={10} height={10} rx={2} fill={TONE_HEX.neutral} />
        <text x={left + 123} y={147} fontSize={9.5} fill="#5b6675">
          manualLines
        </text>
        <rect x={left + 208} y={138} width={10} height={10} rx={2} fill={TONE_HEX.danger} />
        <text x={left + 223} y={147} fontSize={9.5} fill="#5b6675">
          aiRejectedLines
        </text>
      </g>
      <text x={left} y={170} fontSize={10} fontWeight={700} fill="#4338ca">
        采纳率 {m.acceptRatePct}% = {fmtNum(m.aiAcceptedLines)} /（{fmtNum(m.aiAcceptedLines)} +{' '}
        {fmtNum(m.aiRejectedLines)}）× 100
      </text>
      <text x={left} y={185} fontSize={9.5} fill="#98a2b0">
        条形长度按同一比例尺绘制，可直接比较采纳与拒绝的体量差。
      </text>
    </svg>
  );
}

/** 脱敏漏斗：采集 tokens → 命中脱敏 → 实际上行（宽度严格按占比绘制） */
function IdeMaskFunnel({ m }: { m: IdeSyncMetricsDef }) {
  const W = 470;
  const H = 190;
  const fx = 8;
  const fw = 236;
  const cx = fx + fw / 2;
  const sent = m.tokensSent;
  const masked = m.tokensMasked;
  const out = Math.max(sent - masked, 0);
  const pct = sent > 0 ? masked / sent : 0;
  const wA = fw;
  const wB = Math.max(fw * pct, 5);
  const wC = sent > 0 ? Math.max(fw * (out / sent), 5) : 0;
  const aY = 24;
  const bY = 82;
  const cY = 132;
  const lx = fx + fw + 16;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="脱敏漏斗">
      <polygon
        points={`${cx - wA / 2},${aY} ${cx + wA / 2},${aY} ${cx + wB / 2},${bY} ${cx - wB / 2},${bY}`}
        fill="#eaf2ff"
        stroke={TONE_HEX.info}
        strokeWidth={1}
      />
      <rect x={cx - wA / 2} y={aY - 12} width={wA} height={12} rx={3} fill={TONE_HEX.info} />
      <polygon
        points={`${cx - wB / 2},${bY} ${cx + wB / 2},${bY} ${cx + wC / 2},${cY} ${cx - wC / 2},${cY}`}
        fill="#fef4e3"
        stroke={TONE_HEX.warn}
        strokeWidth={1}
      />
      <rect x={cx - wB / 2} y={bY - 10} width={wB} height={10} rx={2} fill={TONE_HEX.warn} />
      <rect x={cx - wC / 2} y={cY} width={wC} height={14} rx={3} fill={TONE_HEX.ok} />

      <text x={lx} y={22} fontSize={10} fontWeight={700} fill="#1d4ed8">
        ① 上下文采集
      </text>
      <text x={lx} y={36} fontSize={10} fill="#5b6675">
        tokensSent = {fmtNum(sent)}
      </text>
      <text x={lx} y={50} fontSize={9.5} fill="#98a2b0">
        {m.contextFilesSent} 个切片文件
      </text>

      <text x={lx} y={80} fontSize={10} fontWeight={700} fill="#b45309">
        ② 出网前命中脱敏
      </text>
      <text x={lx} y={94} fontSize={10} fill="#5b6675">
        tokensMasked = {fmtNum(masked)}
      </text>
      <text x={lx} y={108} fontSize={9.5} fill="#98a2b0">
        占比 {(pct * 100).toFixed(2)}% · maskHitCount = {m.maskHitCount} 处
      </text>

      <text x={lx} y={138} fontSize={10} fontWeight={700} fill="#047857">
        ③ 脱敏后实际上行
      </text>
      <text x={lx} y={152} fontSize={10} fill="#5b6675">
        {fmtNum(out)} tokens
      </text>
      <text x={lx} y={166} fontSize={9.5} fill="#98a2b0">
        uploadBytes = {fmtNum(m.uploadBytes)} B
      </text>

      <text x={fx} y={184} fontSize={9.5} fill="#98a2b0">
        漏斗宽度严格按 token 占比绘制；脱敏占比越小，中段越窄。
      </text>
    </svg>
  );
}

/** 采纳率横向条形图 + 团队算术均值线 + G3 门槛参考线 */
function IdeAcceptChart({ rows, avg }: { rows: IdeSession[]; avg: number }) {
  const W = 620;
  const left = 56;
  const right = 68;
  const rowH = 24;
  const top = 34;
  const H = top + rows.length * rowH + 28;
  const bw = W - left - right;
  const sc = bw / 100;
  const avgX = left + Math.min(Math.max(avg, 0), 100) * sc;
  const bottom = top + rows.length * rowH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="各同步会话 AI 采纳率横向条形图">
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <line x1={left + p * sc} y1={top - 8} x2={left + p * sc} y2={bottom} stroke="#eef0f4" strokeWidth={1} />
          <text x={left + p * sc} y={top - 14} fontSize={9.5} fill="#98a2b0" textAnchor="middle">
            {p}%
          </text>
        </g>
      ))}
      <line
        x1={left + 85 * sc}
        y1={top - 8}
        x2={left + 85 * sc}
        y2={bottom}
        stroke={TONE_HEX.ok}
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.75}
      />
      {rows.map((s, i) => {
        const y = top + i * rowH;
        const v = s.metrics.acceptRatePct;
        const w = v > 0 ? Math.max(v * sc, 2) : 0;
        const color = v === 0 ? '#cbd5e1' : v >= 85 ? TONE_HEX.ok : v >= 75 ? TONE_HEX.brand : TONE_HEX.warn;
        return (
          <g key={s.id}>
            <text x={left - 8} y={y + 13} fontSize={10} fill="#5b6675" textAnchor="end">
              {s.id}
            </text>
            <rect x={left} y={y + 3} width={bw} height={12} rx={3} fill="#f6f7fa" />
            <rect x={left} y={y + 3} width={w} height={12} rx={3} fill={color} />
            <text x={left + w + 6} y={y + 13} fontSize={10} fontWeight={700} fill="#131a24">
              {v.toFixed(1)}%
            </text>
          </g>
        );
      })}
      <line
        x1={avgX}
        y1={top - 8}
        x2={avgX}
        y2={bottom + 6}
        stroke={TONE_HEX.danger}
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />
      <text x={avgX} y={H - 8} fontSize={9.5} fontWeight={700} fill={TONE_HEX.danger} textAnchor="middle">
        团队算术均值 {avg.toFixed(1)}%
      </text>
      <text x={W - 4} y={H - 8} fontSize={9.5} fill={TONE_HEX.ok} textAnchor="end">
        绿虚线 = G3 增量覆盖率门槛 85%（参考）
      </text>
    </svg>
  );
}

/** 上行流量 vs 脱敏 tokens：双刻度归一化对比条 */
function IdeBytesChart({ rows }: { rows: IdeSession[] }) {
  const W = 620;
  const left = 56;
  const right = 96;
  const rowH = 26;
  const top = 12;
  const H = top + rows.length * rowH + 6;
  const bw = W - left - right;
  const maxB = Math.max(...rows.map((r) => r.metrics.uploadBytes), 1);
  const maxT = Math.max(...rows.map((r) => r.metrics.tokensMasked), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="上行流量与脱敏 tokens 对比">
      {rows.map((s, i) => {
        const y = top + i * rowH;
        const wb = (s.metrics.uploadBytes / maxB) * bw;
        const wt = (s.metrics.tokensMasked / maxT) * bw;
        return (
          <g key={s.id}>
            <text x={left - 8} y={y + 17} fontSize={10} fill="#5b6675" textAnchor="end">
              {s.id}
            </text>
            <rect x={left} y={y + 3} width={bw} height={8} rx={2} fill="#f6f7fa" />
            <rect x={left} y={y + 3} width={Math.max(wb, s.metrics.uploadBytes > 0 ? 1.5 : 0)} height={8} rx={2} fill={TONE_HEX.info} />
            <text x={left + bw + 6} y={y + 11} fontSize={9} fill="#1d4ed8">
              {fmtBytesBig(s.metrics.uploadBytes)}
            </text>
            <rect
              x={left}
              y={y + 14}
              width={Math.max(wt, s.metrics.tokensMasked > 0 ? 1.5 : 0)}
              height={6}
              rx={2}
              fill={TONE_HEX.warn}
            />
            <text x={left + bw + 6} y={y + 21} fontSize={9} fill="#b45309">
              {fmtNum(s.metrics.tokensMasked)} tok
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 同步状态分布环形图 */
function IdeStateDonut({
  data,
  total,
}: {
  data: { key: string; label: string; color: string; value: number }[];
  total: number;
}) {
  const sw = 20;
  const R = 52;
  const size = (R + sw / 2) * 2 + 10;
  const c = size / 2;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = data.map((d) => {
    const frac = total > 0 ? d.value / total : 0;
    const arc = { ...d, dash: frac * C, offset: -acc * C };
    acc += frac;
    return arc;
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="同步状态分布环形图">
      <circle cx={c} cy={c} r={R} fill="none" stroke="#f1f3f6" strokeWidth={sw} />
      {arcs.map((a) =>
        a.dash > 0 ? (
          <circle
            key={a.key}
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={sw}
            strokeDasharray={`${a.dash} ${C - a.dash}`}
            strokeDashoffset={a.offset}
            transform={`rotate(-90 ${c} ${c})`}
          >
            <title>{`${a.label} ${a.value} 条`}</title>
          </circle>
        ) : null,
      )}
      <text x={c} y={c - 1} fontSize={20} fontWeight={800} fill="#131a24" textAnchor="middle">
        {total}
      </text>
      <text x={c} y={c + 15} fontSize={10} fill="#98a2b0" textAnchor="middle">
        同步会话
      </text>
    </svg>
  );
}

/** 会话时序泳道图：横轴时间，纵轴 IDE 侧 / 平台侧两条泳道，按 direction 落点并连线 */
function IdeSwimlane({ events }: { events: IdeEvent[] }) {
  const W = 980;
  const H = 248;
  const padL = 92;
  const padR = 24;
  const laneIde = 96;
  const lanePf = 176;
  const inner = W - padL - padR;
  const t0 = tsMs(events[0].at);
  const t1 = tsMs(events[events.length - 1].at);
  const span = Math.max(t1 - t0, 1000);
  const xOf = (at: string) => padL + ((tsMs(at) - t0) / span) * inner;
  const yOf = (d: IdeEvent['direction']) => (d === 'ide→platform' ? laneIde : lanePf);

  const pts = events.map((e) => ({ e, x: xOf(e.at), y: yOf(e.direction) }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const offStart = events.find((e) => e.type === 'offline-queue');
  const offEnd = offStart
    ? events.find((e) => e.type === 'flush' && tsMs(e.at) > tsMs(offStart.at))
    : undefined;

  /* 关键节点标签：时间过近的自动省略，避免文字重叠 */
  const labels: { x: number; y: number; text: string; color: string }[] = [];
  pts.forEach((p) => {
    if (!KEY_EVENT_TYPES.includes(p.e.type)) return;
    if (labels.some((l) => Math.abs(l.x - p.x) < 74)) return;
    labels.push({
      x: p.x,
      y: p.e.direction === 'ide→platform' ? laneIde - 14 : lanePf + 22,
      text: `${EVENT_META[p.e.type].label} #${p.e.id.slice(-2)}`,
      color: TONE_HEX[EVENT_META[p.e.type].tone],
    });
  });

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const d = new Date(t0 + f * span);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return { f, x: padL + f * inner, label: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
  });

  return (
    <div className="ac-ide-swim">
      <div className="ac-ide-legend">
        <span className="ac-ide-legend-i">
          <i style={{ background: TONE_HEX.brand }} />
          IDE 侧发起（上行）
        </span>
        <span className="ac-ide-legend-i">
          <i style={{ background: TONE_HEX.info }} />
          平台侧下发（下行）
        </span>
        <span className="ac-ide-legend-i">
          <i style={{ background: TONE_HEX.danger }} />
          错误 / 冲突（大点）
        </span>
        <span className="ac-ide-legend-i">
          <i className="ac-ide-legend-off" />
          离线期（入队 → 补传）
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="同步事件时序泳道图">
        {offStart && offEnd ? (
          <>
            <rect
              x={xOf(offStart.at)}
              y={56}
              width={Math.max(xOf(offEnd.at) - xOf(offStart.at), 3)}
              height={160}
              fill="#e9ecf1"
              opacity={0.85}
            />
            <text
              x={(xOf(offStart.at) + xOf(offEnd.at)) / 2}
              y={50}
              fontSize={9.5}
              fontWeight={700}
              fill="#64748b"
              textAnchor="middle"
            >
              离线期 · 加密落盘待补传
            </text>
          </>
        ) : null}

        <rect x={padL} y={laneIde - 26} width={inner} height={52} rx={6} fill="#fbfbfe" stroke="#eef0f4" />
        <rect x={padL} y={lanePf - 26} width={inner} height={52} rx={6} fill="#fbfbfe" stroke="#eef0f4" />
        <text x={8} y={laneIde - 2} fontSize={11} fontWeight={700} fill={TONE_HEX.brand}>
          IDE 侧
        </text>
        <text x={8} y={laneIde + 12} fontSize={9} fill="#98a2b0">
          插件发起上行
        </text>
        <text x={8} y={lanePf - 2} fontSize={11} fontWeight={700} fill={TONE_HEX.info}>
          平台侧
        </text>
        <text x={8} y={lanePf + 12} fontSize={9} fill="#98a2b0">
          Agent 下发
        </text>

        <line x1={padL} y1={222} x2={padL + inner} y2={222} stroke="#e2e6ec" strokeWidth={1} />
        {ticks.map((t) => (
          <g key={t.f}>
            <line x1={t.x} y1={222} x2={t.x} y2={227} stroke="#cfd6e0" strokeWidth={1} />
            <text x={t.x} y={240} fontSize={9.5} fill="#98a2b0" textAnchor="middle">
              {t.label}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="#c7cbe0" strokeWidth={1.2} />

        {pts.map((p) => {
          const meta = EVENT_META[p.e.type];
          const big = p.e.type === 'error' || p.e.type === 'conflict';
          return (
            <circle
              key={p.e.id}
              cx={p.x}
              cy={p.y}
              r={big ? 7 : 4.5}
              fill={big ? TONE_HEX.danger : TONE_HEX[meta.tone]}
              stroke="#fff"
              strokeWidth={big ? 2 : 1.2}
            >
              <title>{`${p.e.id} ${p.e.at} · ${meta.label} · ${p.e.direction}`}</title>
            </circle>
          );
        })}

        {labels.map((l) => (
          <text
            key={`${l.text}-${l.x.toFixed(0)}`}
            x={l.x > W - padR - 70 ? l.x - 4 : l.x < padL + 46 ? l.x + 4 : l.x}
            y={l.y}
            fontSize={9.5}
            fontWeight={700}
            fill={l.color}
            textAnchor={l.x > W - padR - 70 ? 'end' : l.x < padL + 46 ? 'start' : 'middle'}
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
