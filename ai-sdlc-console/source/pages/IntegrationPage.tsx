/**
 * PingCode 集成中心 · IntegrationPage
 *
 * 数据源：data.ts → providers / pingcodeConfig / modelMappings / stateMappings / idMappings / syncQueue
 * 能力：服务商接入总览、PingCode 主配置、模型 / 状态 / 标识三类映射、同步队列（重试中 · 死信 · 对账 · 字段回写），
 *       服务商与死信条目可下钻抽屉查看明细。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  Clock,
  Download,
  FileCheck2,
  Gauge,
  GitBranch,
  Hammer,
  Info,
  KeyRound,
  Link2,
  ListChecks,
  Package,
  Plug,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import {
  idMappings,
  modelMappings,
  pingcodeConfig,
  providers,
  stateMappings,
  syncQueue,
} from '../data';
import type {
  IdMappingDef,
  IdMappingEntityType,
  IntegrationProviderDef,
  ProviderKind,
  SyncDeadLetterDef,
  SyncQueueItemDef,
  SyncReconcileItemDef,
  SyncWritebackDef,
  Tone,
} from '../data';
import './integration.css';

/* ============================================================
   类型与常量
   ============================================================ */

/** 服务商类型 → 图标 */
const PROVIDER_ICON: Record<ProviderKind, LucideIcon> = {
  project: Boxes,
  scm: GitBranch,
  ci: Hammer,
  quality: ShieldCheck,
  artifact: Package,
};

const PROVIDER_MAP: Record<string, IntegrationProviderDef> = providers.reduce<Record<string, IntegrationProviderDef>>(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {},
);

/** 服务商接入状态 → 标签文案 / tag 语义色 / 图标 / 抽屉明细与处置建议 */
const PROVIDER_STATUS: Record<
  IntegrationProviderDef['status'],
  { label: string; tone: string; icon: LucideIcon; detail: string; hintTone: string; hint: string }
> = {
  connected: {
    label: '已连接',
    tone: 'ok',
    icon: CheckCircle2,
    detail: '正常',
    hintTone: 'ok',
    hint: '该服务商连接正常，数据按同步策略增量回传；如出现字段冲突可在映射配置中调整对应关系。',
  },
  paused: {
    label: '已暂停',
    tone: 'warn',
    icon: CirclePause,
    detail: '已暂停（访问密钥待轮换）',
    hintTone: 'warn',
    hint: '该服务商已暂停同步，请先完成访问密钥轮换并在同步设置中重新授权。',
  },
  unplugged: {
    label: '未接入',
    tone: 'neutral',
    icon: Unplug,
    detail: '未接入（抽象适配器已预留）',
    hintTone: 'ai',
    hint: '该服务商尚未接入，项目协作类抽象适配器与标识映射位已预留；补齐服务地址与凭据后即可纳入统一同步。',
  },
};

/** 服务商接入状态统计：仅 status 为 connected 的计入「已接入」 */
const PROVIDER_STAT = providers.reduce<Record<IntegrationProviderDef['status'], number>>(
  (acc, p) => {
    acc[p.status] += 1;
    return acc;
  },
  { connected: 0, paused: 0, unplugged: 0 },
);

/** Tone → tag 语义色（tag 仅支持 7 种，其余归并） */
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

/** Tone → 头像底色（style.css 支持全部 11 种） */
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

/** Tone → 文本语义色类 */
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

/** Tone → 指标卡左侧色条（metric 仅支持 5 种） */
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

type MappingTabId = 'model' | 'state' | 'id';

const MAPPING_TABS: { id: MappingTabId; name: string; icon: LucideIcon; count: number }[] = [
  { id: 'model', name: '模型映射', icon: Sparkles, count: modelMappings.length },
  { id: 'state', name: '状态映射', icon: ArrowLeftRight, count: stateMappings.length },
  { id: 'id', name: '标识映射', icon: Link2, count: idMappings.length },
];

const ENTITY_TABS: { id: IdMappingEntityType | 'all'; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'task', name: '开发任务' },
  { id: 'requirement', name: '需求' },
  { id: 'bug', name: '缺陷' },
];

/* ============================================================
   工具函数
   ============================================================ */

/** 状态映射同步方向（中文枚举串）→ 图标 / 文案 / 语义色 */
function directionMeta(direction: string): { icon: LucideIcon; label: string; tone: Tone } {
  if (direction.includes('双向')) return { icon: ArrowLeftRight, label: '双向同步', tone: 'brand' };
  if (direction.includes('平台→PingCode')) return { icon: ArrowRight, label: '平台 → PingCode', tone: 'ai' };
  return { icon: ArrowLeft, label: 'PingCode → 平台', tone: 'info' };
}

/**
 * 标识映射同步方向（push / pull / both）→ 文案 / tag 语义色 / 图标。
 * 与 directionMeta 的取值域不同（后者消费状态映射的中文枚举串），故单独建表，互不影响。
 */
const ID_DIRECTION: Record<IdMappingDef['direction'], { label: string; tone: string; icon: LucideIcon }> = {
  push: { label: '平台 → PingCode', tone: 'brand', icon: ArrowRight },
  pull: { label: 'PingCode → 平台', tone: 'info', icon: ArrowLeft },
  both: { label: '双向', tone: 'ai', icon: ArrowLeftRight },
};

/** 同步状态 → tag 语义色 */
function statusTone(status: SyncQueueItemDef['status']): Tone {
  const map: Record<SyncQueueItemDef['status'], Tone> = {
    pending: 'neutral',
    running: 'info',
    succeeded: 'ok',
    failed: 'warn',
  };
  return map[status];
}

const STATUS_LABEL: Record<SyncQueueItemDef['status'], string> = {
  pending: '待处理',
  running: '进行中',
  succeeded: '已成功',
  failed: '已失败',
};

function latencyLabel(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/* ============================================================
   子组件
   ============================================================ */

function Switch({ checked }: { checked: boolean }) {
  return (
    <span className={`ac-ig-switch ${checked ? 'ac-ig-switch--on' : ''}`} aria-hidden="true">
      <span className="ac-ig-switch-dot" />
    </span>
  );
}

/** 服务商接入卡片 */
function ProviderCard({ provider, onOpen }: { provider: IntegrationProviderDef; onOpen: () => void }) {
  const Icon = PROVIDER_ICON[provider.kind];
  const status = PROVIDER_STATUS[provider.status];
  const StatusIcon = status.icon;
  const unplugged = provider.status === 'unplugged';
  return (
    <div className={`ac-card ${unplugged ? 'ac-ig-provider--unplugged' : ''}`}>
      <div className="ac-card-body">
        <div className="ac-row ac-gap-3">
          <span className={`ac-avatar ac-avatar--square ac-avatar--lg ${AVATAR_TONE[provider.tone]}`}>
            <Icon size={18} />
          </span>
          <div className="ac-flex-1">
            <div className="ac-row ac-gap-2">
              <span className="ac-ig-provider-name">{provider.name}</span>
              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[provider.tone]}`}>{provider.kindLabel}</span>
            </div>
            <div className="ac-xs ac-muted ac-mt-1">{provider.vendor}</div>
          </div>
          <span className={`ac-tag ac-tag--${status.tone}`}>
            <StatusIcon size={12} />
            {status.label}
          </span>
        </div>

        <div className="ac-ig-provider-desc">{provider.desc}</div>

        <div className="ac-ig-provider-meta">
          <div className="ac-row ac-gap-2">
            <Server size={13} className="ac-muted" />
            <span className="ac-mono ac-ellipsis">{provider.endpoint}</span>
          </div>
          <div className="ac-row ac-gap-2">
            <KeyRound size={13} className="ac-muted" />
            <span className="ac-xs ac-text-2">{provider.authType}</span>
          </div>
        </div>

        <div className="ac-ig-tag-row">
          {provider.syncObjects.map((obj) => (
            <span className="ac-tag ac-tag--outline ac-tag--sm" key={obj}>
              {obj}
            </span>
          ))}
        </div>

        <div className="ac-row ac-gap-2 ac-mt-3 ac-ig-provider-foot">
          <span className="ac-xs ac-muted ac-row ac-gap-1">
            <Clock size={12} />
            {provider.lastSyncAt}
          </span>
          <span className="ac-row ac-gap-2 ac-ml-auto">
            {/* 未接入的服务商暂不提供连接入口，按钮保持禁用直至端点与凭据补齐 */}
            {unplugged ? (
              <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" disabled>
                <Plug size={13} />
                连接
              </button>
            ) : null}
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={onOpen}>
              接入详情
              <ChevronRight size={13} />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   下钻抽屉状态
   ============================================================ */

type Drill =
  | { kind: 'provider'; provider: IntegrationProviderDef }
  | { kind: 'dead'; letter: SyncDeadLetterDef };

/* ============================================================
   页面
   ============================================================ */

export default function IntegrationPage() {
  const [mappingTab, setMappingTab] = useState<MappingTabId>('model');
  const [entityTab, setEntityTab] = useState<IdMappingEntityType | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [flags, setFlags] = useState({
    enabled: pingcodeConfig.enabled,
    writeback: pingcodeConfig.writebackEnabled,
    twoWay: pingcodeConfig.twoWayState,
  });
  /** 已人工重放的死信条目 id（自动去重），驱动死信行状态与计数派生 */
  const [replayedIds, setReplayedIds] = useState<string[]>([]);
  /** 重放反馈提示条文案，数秒后自动消失 */
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const { counts } = syncQueue;

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  /** 死信人工重放：登记 id（去重）→ 关闭抽屉 → 提示条反馈 */
  const replayDeadLetter = (letter: SyncDeadLetterDef) => {
    if (replayedIds.includes(letter.id)) return;
    setReplayedIds((prev) => (prev.includes(letter.id) ? prev : [...prev, letter.id]));
    setDrill(null);
    setReplayNotice(`${letter.refId} 已重新入队，进入指数退避重试（第 1 次，10s 后重试）`);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setReplayNotice(null), 6000);
  };

  /* 重放后计数派生：已重放条目从「失败待重试 / 死信」中扣除 */
  const replayedCount = replayedIds.length;
  const deadLetterCount = useMemo(() => Math.max(syncQueue.deadLetters.length - replayedCount, 0), [replayedCount]);
  const failedCount = useMemo(() => Math.max(counts.failed - replayedCount, 0), [counts.failed, replayedCount]);
  const retryCount = syncQueue.retrying.length;

  const queueMetrics: { key: string; label: string; value: number; unit: string; foot: string; tone: Tone; icon: LucideIcon }[] = [
    { key: 'pending', label: '待处理', value: counts.pending, unit: '条', foot: '等待调度', tone: 'warn', icon: Clock },
    { key: 'running', label: '进行中', value: counts.running, unit: '条', foot: '实时同步中', tone: 'info', icon: Activity },
    { key: 'succeeded', label: '今日已成功', value: counts.succeeded, unit: '条', foot: '成功率 99.4%', tone: 'ok', icon: CheckCircle2 },
    {
      key: 'failed',
      label: '失败待重试',
      value: failedCount,
      unit: '条',
      foot: replayedCount > 0 ? `已重放 ${replayedCount} 条` : '指数退避重试',
      tone: 'danger',
      icon: AlertTriangle,
    },
  ];

  /* 标识映射过滤：对象类型 pill AND 关键字（平台标识 / PingCode 编号 / 标题，大小写不敏感） */
  const filteredIdMappings: IdMappingDef[] = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return idMappings.filter((m) => {
      if (entityTab !== 'all' && m.entityType !== entityTab) return false;
      if (!kw) return true;
      return [m.platformId, m.pingcodeCode, m.platformTitle].some((f) => f.toLowerCase().includes(kw));
    });
  }, [entityTab, keyword]);

  return (
    <div className="ac-ig-page" data-annotation-id="ai-sdlc-integration-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">PingCode 集成中心</div>
          <div className="ac-page-desc">
            以 PingCode 为唯一事实源，打通项目协作、代码托管、持续集成与代码质量工具链；统一维护模型 / 状态 / 标识三类映射，
            双向同步研发过程数据并回写工作项进度、状态与门禁结果。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className={`ac-tag ac-tag--${flags.enabled ? 'ok' : 'neutral'}`}>
            <span className={flags.enabled ? 'ac-pulse-dot' : 'ac-tag-dot'} />
            {flags.enabled ? '同步已启用' : '同步已停用'}
          </span>
          <span className="ac-tag ac-tag--outline">
            <RefreshCw size={12} />
            最近同步 {pingcodeConfig.lastSyncAt}
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm">
            <Settings2 size={14} />
            同步设置
          </button>
          <button type="button" className="ac-btn ac-btn--primary ac-btn--sm">
            <RefreshCw size={14} />
            立即同步
          </button>
        </div>
      </div>

      {/* ---------- 同步队列概览 ---------- */}
      <div className="ac-card">
        <div className="ac-card-head">
          <span className="ac-card-title">
            <Activity size={16} />
            同步队列概览
          </span>
          <span className="ac-card-subtitle">{pingcodeConfig.syncMode}</span>
          <div className="ac-card-extra">
            <span className={`ac-tag ac-tag--${deadLetterCount > 0 ? 'danger' : 'ok'}`}>
              死信 {deadLetterCount}
            </span>
            {replayedCount > 0 ? <span className="ac-tag ac-tag--ok">已重放 {replayedCount}</span> : null}
            <span className={`ac-tag ac-tag--${retryCount > 0 ? 'warn' : 'ok'}`}>重试中 {retryCount}</span>
          </div>
        </div>
        <div className="ac-card-body">
          <div className="ac-metric-grid ac-metric-grid--4 ac-mb-0">
            {queueMetrics.map((m) => {
              const Icon = m.icon;
              return (
                <div className={`ac-metric ${metricTone(m.tone)}`} key={m.key}>
                  <div className="ac-metric-head">
                    <span className="ac-metric-label">{m.label}</span>
                    <span className="ac-metric-icon">
                      <Icon size={14} />
                    </span>
                  </div>
                  <div className="ac-metric-value">
                    {m.value}
                    <span className="ac-metric-unit">{m.unit}</span>
                  </div>
                  <div className="ac-metric-foot">{m.foot}</div>
                </div>
              );
            })}
          </div>

          <div className="ac-ig-stat-row">
            <div className="ac-ig-stat">
              <Zap size={14} className="ac-muted" />
              <span className="ac-xs ac-muted">吞吐</span>
              <span className="ac-ig-stat-value">
                {syncQueue.throughputPerHour}
                <span className="ac-xs ac-muted"> 条/小时</span>
              </span>
            </div>
            <span className="ac-divider-v" />
            <div className="ac-ig-stat">
              <Gauge size={14} className="ac-muted" />
              <span className="ac-xs ac-muted">平均延迟</span>
              <span className="ac-ig-stat-value">{latencyLabel(syncQueue.avgLatencyMs)}</span>
            </div>
            <span className="ac-divider-v" />
            <div className="ac-ig-stat">
              <CheckCircle2 size={14} className="ac-muted" />
              <span className="ac-xs ac-muted">同步成功率</span>
              <span className="ac-ig-stat-value ac-ok-text">{syncQueue.successRate}%</span>
            </div>
            <span className="ac-divider-v" />
            <div className="ac-ig-stat">
              <Repeat size={14} className="ac-muted" />
              <span className="ac-xs ac-muted">同步间隔</span>
              <span className="ac-ig-stat-value">{pingcodeConfig.syncIntervalMin} 分钟</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 服务商接入 ---------- */}
      <div className="ac-ig-provider-head">
        <div className="ac-section-title">服务商接入</div>
        <span className="ac-tag ac-tag--sm ac-tag--ok">
          <CheckCircle2 size={12} />
          已接入 {PROVIDER_STAT.connected}
        </span>
        <span className="ac-tag ac-tag--sm ac-tag--warn">
          <CirclePause size={12} />
          已暂停 {PROVIDER_STAT.paused}
        </span>
        <span className="ac-tag ac-tag--sm ac-tag--neutral">
          <Unplug size={12} />
          未接入 {PROVIDER_STAT.unplugged}
        </span>
        <span className="ac-xs ac-muted ac-ml-auto">
          共 {providers.length} 个服务商，覆盖项目协作 / 代码托管 / 持续集成 / 代码质量 / 制品库五类
        </span>
      </div>
      <div className="ac-grid-3 ac-ig-provider-grid" data-annotation-id="ai-sdlc-integration-providers">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} onOpen={() => setDrill({ kind: 'provider', provider: p })} />
        ))}
      </div>

      {/* ---------- PingCode 主配置 ---------- */}
      <div className="ac-section-title">PingCode 主配置</div>
      <div className="ac-grid-2-1 ac-ig-config-grid">
        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <Plug size={16} />
              连接与项目绑定
            </span>
            <span className="ac-card-subtitle">{pingcodeConfig.projectName}</span>
          </div>
          <div className="ac-card-body">
            <dl className="ac-kv ac-ig-kv">
              <dt>租户</dt>
              <dd className="ac-mono">{pingcodeConfig.tenant}</dd>
              <dt>域名</dt>
              <dd className="ac-mono">{pingcodeConfig.domain}</dd>
              <dt>API 地址</dt>
              <dd className="ac-mono ac-ellipsis">{pingcodeConfig.apiBase}</dd>
              <dt>项目编号</dt>
              <dd>
                <span className="ac-tag ac-tag--brand ac-tag--sm">{pingcodeConfig.projectId}</span>
              </dd>
              <dt>授权方式</dt>
              <dd>{pingcodeConfig.authType}</dd>
              <dt>访问令牌</dt>
              <dd className="ac-mono">{pingcodeConfig.tokenMasked}</dd>
              <dt>授权范围</dt>
              <dd>
                <span className="ac-ig-tag-row">
                  {pingcodeConfig.scope.map((s) => (
                    <span className="ac-tag ac-tag--outline ac-tag--sm" key={s}>
                      {s}
                    </span>
                  ))}
                </span>
              </dd>
              <dt>负责人</dt>
              <dd>林知远 · 研发总监</dd>
              <dt>最近同步</dt>
              <dd className="ac-mono">{pingcodeConfig.lastSyncAt}</dd>
              <dt>最近对账</dt>
              <dd className="ac-mono">{pingcodeConfig.lastReconcileAt}</dd>
            </dl>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <Settings2 size={16} />
              同步开关
            </span>
          </div>
          <div className="ac-card-body">
            <div className="ac-ig-switch-list">
              <button
                type="button"
                className="ac-ig-switch-row"
                onClick={() => setFlags((f) => ({ ...f, enabled: !f.enabled }))}
              >
                <span className="ac-flex-1">
                  <span className="ac-ig-switch-label">启用 PingCode 集成</span>
                  <span className="ac-xs ac-muted">关闭后所有出向同步与回写将暂停</span>
                </span>
                <Switch checked={flags.enabled} />
              </button>
              <button
                type="button"
                className="ac-ig-switch-row"
                onClick={() => setFlags((f) => ({ ...f, twoWay: !f.twoWay }))}
              >
                <span className="ac-flex-1">
                  <span className="ac-ig-switch-label">状态双向同步</span>
                  <span className="ac-xs ac-muted">平台状态机与 PingCode 工作项状态互相同步</span>
                </span>
                <Switch checked={flags.twoWay} />
              </button>
              <button
                type="button"
                className="ac-ig-switch-row"
                onClick={() => setFlags((f) => ({ ...f, writeback: !f.writeback }))}
              >
                <span className="ac-flex-1">
                  <span className="ac-ig-switch-label">字段回写</span>
                  <span className="ac-xs ac-muted">进度、门禁结果、发布版本等字段回写工作项</span>
                </span>
                <Switch checked={flags.writeback} />
              </button>
            </div>

            <div className="ac-hint ac-hint--warn ac-mt-4">
              <AlertTriangle size={14} />
              <span>
                当前存在 {deadLetterCount} 条死信
                {replayedCount > 0 ? `（另有 ${replayedCount} 条已人工重放，正按指数退避重试）` : ''}与 {retryCount}{' '}
                条重试中条目，其中 BUG-1052 因缺少脱敏标记字段
                <span className="ac-mono"> secretLevel</span> 无法回写，建议补齐字段后重放。
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 映射配置 ---------- */}
      <div className="ac-card" data-annotation-id="ai-sdlc-integration-mappings">
        <div className="ac-card-head">
          <span className="ac-card-title">
            <ListChecks size={16} />
            映射配置
          </span>
          <span className="ac-card-subtitle">平台字段与 PingCode 字段的对应关系</span>
          <div className="ac-card-extra">
            <span className="ac-tag ac-tag--outline">
              共 {modelMappings.length + stateMappings.length + idMappings.length} 条
            </span>
          </div>
        </div>

        <div className="ac-ig-tabs-wrap">
          <div className="ac-tabs">
            {MAPPING_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ac-tab ${t.id === mappingTab ? 'ac-tab--active' : ''}`}
                  onClick={() => setMappingTab(t.id)}
                >
                  <Icon size={14} />
                  {t.name}
                  <span className="ac-tab-count">{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ac-card-body ac-card-body--flush">
          {mappingTab === 'model' ? (
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th>平台模型</th>
                    <th>PingCode 别名</th>
                    <th>供应商</th>
                    <th>同步字段</th>
                    <th>说明</th>
                    <th className="ac-td-right">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {modelMappings.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="ac-col ac-gap-0">
                          <span className="ac-semi ac-text-1">{m.platformName}</span>
                          <span className="ac-xs ac-muted ac-mono">{m.modelId}</span>
                        </div>
                      </td>
                      <td className="ac-mono ac-brand-text">{m.pingcodeAlias}</td>
                      <td className="ac-text-2">{m.provider}</td>
                      <td className="ac-mono ac-muted">{m.syncField}</td>
                      <td className="ac-xs ac-text-2 ac-ig-cell-desc">{m.desc}</td>
                      <td className="ac-td-right">
                        <span className={`ac-tag ac-tag--sm ac-tag--${m.enabled ? 'ok' : 'neutral'}`}>
                          {m.enabled ? '已启用' : '未开放'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : mappingTab === 'state' ? (
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>编码</th>
                    <th>平台状态</th>
                    <th>PingCode 状态</th>
                    <th>同步方向</th>
                    <th>同步方式</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {stateMappings.map((s) => {
                    const dir = directionMeta(s.direction);
                    const DirIcon = dir.icon;
                    return (
                      <tr key={s.id}>
                        <td className="ac-mono ac-muted">{s.stateCode}</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[s.tone]}`}>{s.stateName}</span>
                        </td>
                        <td className="ac-semi ac-text-1">{s.pingcodeName}</td>
                        <td>
                          <span className={`ac-row ac-gap-1 ac-xs ${TEXT_TONE[dir.tone]}`}>
                            <DirIcon size={13} />
                            {dir.label}
                          </span>
                        </td>
                        <td className="ac-text-2">{s.syncMode}</td>
                        <td className="ac-xs ac-text-2 ac-ig-cell-desc">{s.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="ac-ig-subfilter">
                <div className="ac-tabs ac-tabs--pill">
                  {ENTITY_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`ac-tab ${t.id === entityTab ? 'ac-tab--active' : ''}`}
                      onClick={() => setEntityTab(t.id)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className="ac-row ac-gap-2">
                  <Search size={14} className="ac-muted" />
                  <input
                    className="ac-input ac-input--sm ac-ig-search"
                    placeholder="搜索平台标识 / PingCode 编号 / 标题"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </div>
                <span className="ac-xs ac-muted ac-ml-auto">
                  显示 {filteredIdMappings.length} / {idMappings.length} 条标识映射
                </span>
              </div>
              <div className="ac-table-wrap" data-annotation-id="ai-sdlc-integration-idmap">
                {filteredIdMappings.length > 0 ? (
                  <table className="ac-table ac-table--sm">
                    <thead>
                      <tr>
                        <th style={{ width: 88 }}>类型</th>
                        <th>平台标识</th>
                        <th>标题</th>
                        <th>PingCode 编号</th>
                        <th>方向</th>
                        <th>创建时间</th>
                        <th className="ac-td-right">同步状态</th>
                        <th className="ac-td-right">最近同步</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIdMappings.map((m) => {
                        const dir = ID_DIRECTION[m.direction];
                        const DirIcon = dir.icon;
                        return (
                          <tr key={m.id}>
                            <td>
                              <span className="ac-tag ac-tag--outline ac-tag--sm">{m.entityLabel}</span>
                            </td>
                            <td className="ac-mono ac-brand-text">{m.platformId}</td>
                            <td className="ac-text-1 ac-ig-cell-title ac-ig-idmap-title">{m.platformTitle}</td>
                            <td className="ac-mono ac-text-2">{m.pingcodeCode}</td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${dir.tone}`}>
                                <DirIcon size={12} />
                                {dir.label}
                              </span>
                            </td>
                            <td className="ac-tnum ac-xs ac-muted ac-ig-nowrap">{m.createdAt}</td>
                            <td className="ac-td-right">
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[m.tone]}`}>{m.syncStatus}</span>
                            </td>
                            <td className="ac-td-right ac-mono ac-muted ac-ig-nowrap">{m.syncedAt}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="ac-empty ac-empty--sm">
                    <span className="ac-empty-icon">
                      <Search size={22} />
                    </span>
                    <span className="ac-empty-title">无匹配映射</span>
                    <span className="ac-empty-desc">未找到符合条件的标识映射，请调整对象类型或修改关键字后重试</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- 同步队列 ---------- */}
      <div className="ac-section-title">同步队列</div>
      <div className="ac-grid-2 ac-ig-queue-grid" data-annotation-id="ai-sdlc-integration-syncqueue">
        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <RefreshCw size={16} />
              重试中
            </span>
            <span className="ac-card-subtitle">指数退避重试队列</span>
            <div className="ac-card-extra">
              <span className="ac-tag ac-tag--warn">{retryCount} 条</span>
            </div>
          </div>
          <div className="ac-card-body ac-card-body--flush">
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th>对象</th>
                    <th>引用</th>
                    <th>服务商</th>
                    <th>状态</th>
                    <th className="ac-td-right">重试</th>
                    <th className="ac-td-right">耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {syncQueue.retrying.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <div className="ac-col ac-gap-0">
                          <span className="ac-semi ac-text-1">{it.objectType}</span>
                          <span className="ac-xs ac-muted ac-ig-nowrap">
                            {it.direction === 'push' ? '推送' : '拉取'} · {it.traceId}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="ac-col ac-gap-0">
                          <span className="ac-mono ac-brand-text">{it.refId}</span>
                          <span className="ac-xs ac-muted ac-ellipsis ac-ig-ref-title">{it.refTitle}</span>
                        </div>
                      </td>
                      <td className="ac-text-2 ac-ig-nowrap">{PROVIDER_MAP[it.providerId]?.name ?? it.providerId}</td>
                      <td>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[statusTone(it.status)]}`}>
                          {STATUS_LABEL[it.status]}
                        </span>
                      </td>
                      <td className="ac-td-right ac-tnum">{it.attempts}</td>
                      <td className="ac-td-right ac-tnum">{latencyLabel(it.latencyMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ac-ig-msg-list">
              {syncQueue.retrying.map((it) => (
                <div className="ac-ig-msg" key={it.id}>
                  <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[it.tone]}`}>{it.traceId}</span>
                  <span className="ac-xs ac-text-2 ac-flex-1">{it.message}</span>
                  <span className="ac-xs ac-muted ac-ig-nowrap ac-mono">{it.updatedAt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <Trash2 size={16} />
              死信队列
            </span>
            <span className="ac-card-subtitle">需人工介入后重放</span>
            <div className="ac-card-extra">
              <span className={`ac-tag ac-tag--${deadLetterCount > 0 ? 'danger' : 'ok'}`}>
                {deadLetterCount} 条待处理
              </span>
              {replayedCount > 0 ? <span className="ac-tag ac-tag--ok">已重放 {replayedCount} 条</span> : null}
            </div>
          </div>
          <div className="ac-card-body ac-card-body--flush">
            {/* 人工重放反馈：本页无全局 toast，改在死信卡片顶部就地提示 */}
            {replayNotice ? (
              <div className="ac-hint ac-hint--ok ac-ig-replay-hint" role="status" aria-live="polite">
                <RotateCcw size={14} />
                <span>{replayNotice}</span>
              </div>
            ) : null}
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th>引用</th>
                    <th>对象</th>
                    <th>失败原因</th>
                    <th className="ac-td-right">尝试</th>
                    <th className="ac-td-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {syncQueue.deadLetters.map((d) => {
                    const replayed = replayedIds.includes(d.id);
                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="ac-col ac-gap-0">
                            <span className={`ac-mono ${replayed ? 'ac-text-2' : 'ac-danger-text'}`}>{d.refId}</span>
                            <span className="ac-xs ac-muted ac-mono">{d.traceId}</span>
                          </div>
                        </td>
                        <td>
                          <span className="ac-tag ac-tag--outline ac-tag--sm">{d.objectType}</span>
                        </td>
                        <td className="ac-xs ac-text-2 ac-ig-cell-desc">
                          <div className="ac-row-top ac-gap-1">
                            <span className="ac-flex-1">{d.reason}</span>
                            {replayed ? <span className="ac-tag ac-tag--ok ac-tag--sm">已重新入队</span> : null}
                          </div>
                        </td>
                        <td className="ac-td-right ac-tnum">{d.attempts}</td>
                        <td className="ac-td-right">
                          <span className="ac-ig-row-actions">
                            <button
                              type="button"
                              className="ac-btn ac-btn--text ac-btn--sm"
                              disabled={replayed}
                              onClick={() => replayDeadLetter(d)}
                            >
                              <RotateCcw size={13} />
                              {replayed ? '已重放' : '重放'}
                            </button>
                            <button
                              type="button"
                              className="ac-btn ac-btn--ghost ac-btn--sm"
                              onClick={() => setDrill({ kind: 'dead', letter: d })}
                            >
                              详情
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 对账与字段回写 ---------- */}
      <div className="ac-section-title">对账与字段回写</div>
      <div className="ac-grid-2 ac-ig-queue-grid">
        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title">
              <FileCheck2 size={16} />
              全量对账
            </span>
            <span className="ac-card-subtitle">对账时间 {syncQueue.lastReconcile.at}</span>
          </div>
          <div className="ac-card-body ac-card-body--flush">
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th>范围</th>
                    <th className="ac-td-right">平台</th>
                    <th className="ac-td-right">PingCode</th>
                    <th className="ac-td-right">差异</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {syncQueue.lastReconcile.items.map((r: SyncReconcileItemDef) => (
                    <tr key={r.id}>
                      <td className="ac-semi ac-text-1">{r.scope}</td>
                      <td className="ac-td-right ac-tnum">{r.platformCount}</td>
                      <td className="ac-td-right ac-tnum">{r.pingcodeCount}</td>
                      <td className="ac-td-right">
                        <span className={`ac-bold ${r.diff === 0 ? 'ac-ok-text' : 'ac-warn-text'}`}>{r.diff}</span>
                      </td>
                      <td>
                        <span className={`ac-xs ${TEXT_TONE[r.tone]}`}>{r.result}</span>
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
              <Repeat size={16} />
              字段回写
            </span>
            <span className="ac-card-subtitle">平台 → PingCode 工作项字段</span>
          </div>
          <div className="ac-card-body ac-card-body--flush">
            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th>字段</th>
                    <th>来源 → 目标</th>
                    <th className="ac-td-right">样本</th>
                    <th style={{ width: 128 }}>成功率</th>
                    <th className="ac-td-right">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {syncQueue.writebacks.map((w: SyncWritebackDef) => (
                    <tr key={w.id}>
                      <td className="ac-mono ac-text-1">{w.field}</td>
                      <td>
                        <div className="ac-col ac-gap-0">
                          <span className="ac-xs ac-text-2">{w.source}</span>
                          <span className="ac-xs ac-muted">→ {w.target}</span>
                        </div>
                      </td>
                      <td className="ac-td-right ac-tnum">{w.samples}</td>
                      <td>
                        <div className="ac-progress-row">
                          <div className="ac-progress ac-progress--sm ac-flex-1">
                            <div
                              className={`ac-progress-bar ${w.successRate >= 98 ? 'ac-progress-bar--ok' : 'ac-progress-bar--warn'}`}
                              style={{ width: `${w.successRate}%` }}
                            />
                          </div>
                          <span className="ac-progress-label">{w.successRate}%</span>
                        </div>
                      </td>
                      <td className="ac-td-right">
                        <span className={`ac-tag ac-tag--sm ac-tag--${w.enabled ? 'ok' : 'neutral'}`}>
                          {w.enabled ? '启用' : '停用'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="ac-hint ac-mt-3">
        <Info size={14} />
        <span>
          口径说明：服务商接入信息取自 <span className="ac-mono">providers</span>，主配置取自{' '}
          <span className="ac-mono">pingcodeConfig</span>，映射关系取自 <span className="ac-mono">modelMappings</span> /{' '}
          <span className="ac-mono">stateMappings</span> / <span className="ac-mono">idMappings</span>，同步队列、死信、对账与回写取自{' '}
          <span className="ac-mono">syncQueue</span>；所有同步动作以 PingCode 为唯一事实源，冲突时以平台侧状态机为准。
        </span>
      </div>

      {/* ---------- 下钻抽屉 ---------- */}
      <Drawer
        open={drill !== null}
        title={
          drill?.kind === 'provider'
            ? `${drill.provider.name} · 接入详情`
            : drill?.kind === 'dead'
              ? `${drill.letter.refId} · 死信明细`
              : ''
        }
        subtitle={drill?.kind === 'provider' ? drill.provider.vendor : '需人工介入后重放'}
        width={620}
        onClose={() => setDrill(null)}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setDrill(null)}>
              关闭
            </button>
            {drill?.kind === 'dead' ? (
              <button
                type="button"
                className="ac-btn ac-btn--primary ac-btn--sm ac-ml-auto"
                disabled={replayedIds.includes(drill.letter.id)}
                onClick={() => replayDeadLetter(drill.letter)}
              >
                <RotateCcw size={14} />
                {replayedIds.includes(drill.letter.id) ? '已重新入队' : '重新入队'}
              </button>
            ) : (
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm ac-ml-auto">
                <Download size={14} />
                导出配置
              </button>
            )}
          </div>
        }
      >
        {drill?.kind === 'provider' ? (
          <div className="ac-col ac-gap-4">
            <div className="ac-row ac-gap-3">
              <span className={`ac-avatar ac-avatar--square ac-avatar--xl ${AVATAR_TONE[drill.provider.tone]}`}>
                {React.createElement(PROVIDER_ICON[drill.provider.kind], { size: 22 })}
              </span>
              <div className="ac-flex-1">
                <div className="ac-row ac-gap-2">
                  <span className="ac-ig-provider-name">{drill.provider.name}</span>
                  <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[drill.provider.tone]}`}>
                    {drill.provider.kindLabel}
                  </span>
                </div>
                <div className="ac-xs ac-muted ac-mt-1">{drill.provider.desc}</div>
              </div>
              <span className={`ac-tag ac-tag--${PROVIDER_STATUS[drill.provider.status].tone}`}>
                {PROVIDER_STATUS[drill.provider.status].label}
              </span>
            </div>

            <dl className="ac-kv ac-ig-kv">
              <dt>服务商</dt>
              <dd>{drill.provider.vendor}</dd>
              <dt>接口地址</dt>
              <dd className="ac-mono ac-ig-wrap">{drill.provider.endpoint}</dd>
              <dt>授权方式</dt>
              <dd>{drill.provider.authType}</dd>
              <dt>授权范围</dt>
              <dd>
                <span className="ac-ig-tag-row">
                  {drill.provider.scopes.map((s) => (
                    <span className="ac-tag ac-tag--outline ac-tag--sm" key={s}>
                      {s}
                    </span>
                  ))}
                </span>
              </dd>
              <dt>同步对象</dt>
              <dd>
                <span className="ac-ig-tag-row">
                  {drill.provider.syncObjects.map((o) => (
                    <span className="ac-tag ac-tag--brand ac-tag--sm" key={o}>
                      {o}
                    </span>
                  ))}
                </span>
              </dd>
              <dt>最近同步</dt>
              <dd className="ac-mono">{drill.provider.lastSyncAt}</dd>
              <dt>连接状态</dt>
              <dd
                className={
                  drill.provider.status === 'connected'
                    ? 'ac-ok-text'
                    : drill.provider.status === 'paused'
                      ? 'ac-warn-text'
                      : 'ac-muted'
                }
              >
                {PROVIDER_STATUS[drill.provider.status].detail}
              </dd>
            </dl>

            <div className={`ac-hint ac-hint--${PROVIDER_STATUS[drill.provider.status].hintTone}`}>
              <Info size={14} />
              <span>{PROVIDER_STATUS[drill.provider.status].hint}</span>
            </div>
          </div>
        ) : drill?.kind === 'dead' ? (
          <div className="ac-col ac-gap-4">
            <dl className="ac-kv ac-ig-kv">
              <dt>引用标识</dt>
              <dd className="ac-mono ac-danger-text">{drill.letter.refId}</dd>
              <dt>对象类型</dt>
              <dd>{drill.letter.objectType}</dd>
              <dt>追踪号</dt>
              <dd className="ac-mono">{drill.letter.traceId}</dd>
              <dt>失败原因</dt>
              <dd className="ac-text-2">{drill.letter.reason}</dd>
              <dt>尝试次数</dt>
              <dd className="ac-tnum">{drill.letter.attempts} 次</dd>
              <dt>首次失败</dt>
              <dd className="ac-mono">{drill.letter.firstFailedAt}</dd>
              <dt>最近失败</dt>
              <dd className="ac-mono">{drill.letter.lastFailedAt}</dd>
              <dt>处理状态</dt>
              <dd>
                {replayedIds.includes(drill.letter.id) ? (
                  <span className="ac-tag ac-tag--ok ac-tag--sm">
                    <RotateCcw size={12} />
                    已重新入队
                  </span>
                ) : (
                  <span className="ac-tag ac-tag--danger ac-tag--sm">待人工重放</span>
                )}
              </dd>
            </dl>

            {replayedIds.includes(drill.letter.id) ? (
              <div className="ac-hint ac-hint--ok">
                <CheckCircle2 size={14} />
                <span>
                  该条目已重新入队，将按指数退避策略重试（第 1 次，10s 后重试）；若上游数据仍未修复，会再次回到死信队列。
                </span>
              </div>
            ) : (
              <div className="ac-hint ac-hint--danger">
                <AlertTriangle size={14} />
                <span>
                  死信条目已停止自动重试，需修复上游数据后手动重新入队。建议先核对 PingCode 侧目标工作项是否存在、
                  必填字段是否完整，再执行重放以避免重复写入。
                </span>
              </div>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
