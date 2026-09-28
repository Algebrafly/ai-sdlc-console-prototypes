/**
 * 安全与审计（pageId: settings）
 *
 * 页面结构：
 *  · 顶部常驻安全态势摘要条 —— 出网状态 / 脱敏规则启用数 / 近 24h 审计条数 / SSO 状态
 *  1. 出网与脱敏 —— 代码出网开关（允许 / 禁止两态）+ 环境出网策略矩阵（ALLOW / MASK / DENY）
 *                   + 脱敏规则表（启用状态可切换）+ 最小化上传策略与切片大小上限
 *  2. 审计日志 —— 全量操作留痕表 + 时间范围 / 动作类型筛选 + traceId 检索 + 留痕明细抽屉
 *  3. 鉴权与权限 —— SSO / OAuth2 接入状态与账号安全 + 7 角色 × 4 权限 RBAC 矩阵（当前角色行高亮）
 *
 * 数据来源：data.ts —— egressPolicy / redactRules / auditLogs / rbacMatrix / ssoStatus
 *          / ENVIRONMENTS / ROLES / USER_MAP / CURRENT_USER
 */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eraser,
  Eye,
  FileClock,
  Gavel,
  Globe,
  KeyRound,
  Pencil,
  ScrollText,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Drawer from '../components/Drawer';
import {
  CURRENT_USER,
  ENVIRONMENTS,
  ROLES,
  USER_MAP,
  auditLogs,
  egressPolicy,
  rbacMatrix,
  redactRules,
  ssoStatus,
} from '../data';
import type { AuditLogDef, EgressMode, RbacAccessLevel, RbacPermissionId, Tone } from '../data';
import './settings.css';

/* ------------------------------------------------------------------ 映射表 */

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

/** 语义色 → 态势条图标底色（settings.css 提供 6 种） */
const POSTURE_TONE: Partial<Record<Tone, string>> = {
  ok: 'ac-st-posture-icon--ok',
  warn: 'ac-st-posture-icon--warn',
  danger: 'ac-st-posture-icon--danger',
  brand: 'ac-st-posture-icon--brand',
  ai: 'ac-st-posture-icon--ai',
  info: 'ac-st-posture-icon--info',
};

/** 出网模式 → 图标 */
const EGRESS_ICON: Record<EgressMode, LucideIcon> = {
  ALLOW: Globe,
  MASK: Eraser,
  DENY: Ban,
};

/** RBAC 授权级别 → 图标 */
const ACCESS_ICON: Record<RbacAccessLevel, LucideIcon> = {
  full: ShieldCheck,
  own: CheckCircle2,
  readonly: Eye,
  none: Ban,
};

/** RBAC 权限维度 → 图标 */
const PERM_ICON: Record<RbacPermissionId, LucideIcon> = {
  view: Eye,
  edit: Pencil,
  approve: Gavel,
  admin: Settings2,
};

/** 审计结果 → 图标与标签语义 */
const RESULT_META: Record<AuditLogDef['result'], { icon: LucideIcon; tone: string }> = {
  success: { icon: CheckCircle2, tone: 'ok' },
  denied: { icon: ShieldOff, tone: 'danger' },
  failed: { icon: XCircle, tone: 'warn' },
};

type TabId = 'egress' | 'audit' | 'auth';

const TABS: { id: TabId; name: string; icon: LucideIcon }[] = [
  { id: 'egress', name: '出网与脱敏', icon: ShieldCheck },
  { id: 'audit', name: '审计日志', icon: ScrollText },
  { id: 'auth', name: '鉴权与权限', icon: KeyRound },
];

type RangeId = 'all' | '24h' | '7d' | '30d';

/** 审计时间范围口径（since 为空表示不限；字符串比较依赖 `YYYY-MM-DD HH:mm` 定长格式） */
const RANGE_OPTIONS: { id: RangeId; label: string; since: string }[] = [
  { id: 'all', label: '全部时间', since: '' },
  { id: '24h', label: '近 24 小时', since: '2026-03-19 00:00' },
  { id: '7d', label: '近 7 日', since: '2026-03-13 00:00' },
  { id: '30d', label: '近 30 日', since: '2026-02-18 00:00' },
];

/** 环境 id → 环境名称（出网策略按环境展示） */
const ENV_NAME: Record<string, string> = ENVIRONMENTS.reduce<Record<string, string>>((acc, e) => {
  acc[e.id] = e.name;
  return acc;
}, {});

/** 角色 id → 角色名称（SSO 强制校验角色展示） */
const ROLE_NAME: Record<string, string> = ROLES.reduce<Record<string, string>>((acc, r) => {
  acc[r.id] = r.name;
  return acc;
}, {});

/** 审计流水中最新一条的时间，作为「近 24 小时」口径基准 */
const AUDIT_LATEST = auditLogs[0]?.time ?? '';
const AUDIT_DAY = AUDIT_LATEST.slice(0, 10);

function num(value: number): string {
  return value.toLocaleString('zh-CN');
}

function envName(id: string): string {
  return ENV_NAME[id] ?? id;
}

function roleName(id: string): string {
  return ROLE_NAME[id] ?? id;
}

/* ------------------------------------------------------------------ 子组件 */

/** 纯展示开关（用于整行即按钮的场景） */
function SwitchVisual({ on, deny, small }: { on: boolean; deny?: boolean; small?: boolean }) {
  return (
    <span
      className={`ac-st-switch ${small ? 'ac-st-switch--sm' : ''} ${
        on ? 'ac-st-switch--on' : deny ? 'ac-st-switch--deny' : ''
      }`}
      aria-hidden="true"
    >
      <span className="ac-st-switch-dot" />
    </span>
  );
}

/** 可点击开关 */
function SwitchButton({
  on,
  deny,
  small,
  label,
  onToggle,
}: {
  on: boolean;
  deny?: boolean;
  small?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`ac-st-switch ${small ? 'ac-st-switch--sm' : ''} ${
        on ? 'ac-st-switch--on' : deny ? 'ac-st-switch--deny' : ''
      }`}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
    >
      <span className="ac-st-switch-dot" />
    </button>
  );
}

/** 审计留痕明细（Drawer 内容） */
function AuditDetail({ log }: { log: AuditLogDef }) {
  const actor = USER_MAP[log.actorId];
  const ResultIcon = RESULT_META[log.result].icon;
  return (
    <div className="ac-col ac-gap-4">
      <div className="ac-card ac-card--flat">
        <div className="ac-card-body">
          <div className="ac-row ac-gap-3">
            <span className={`ac-avatar ac-avatar--lg ${AVATAR_TONE[log.actorTone]}`}>
              {log.actorName.slice(0, 1)}
            </span>
            <div className="ac-col ac-flex-1">
              <span className="ac-card-title">{log.actorName}</span>
              <span className="ac-xs ac-muted">
                {log.roleName} · {actor ? actor.account : log.actorId}
                {actor ? ` · ${actor.dept}` : ''}
              </span>
            </div>
            <span className={`ac-tag ac-tag--${TAG_TONE[log.tone]}`}>
              <ResultIcon size={12} />
              {log.resultLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="ac-card ac-card--flat">
        <div className="ac-card-head">
          <span className="ac-card-title">
            <ScrollText size={15} />
            留痕明细
          </span>
          <div className="ac-card-extra">
            <span className="ac-st-trace-code">{log.id}</span>
          </div>
        </div>
        <div className="ac-card-body">
          <dl className="ac-kv ac-st-sso-grid">
            <dt>发生时间</dt>
            <dd className="ac-mono">{log.time}</dd>
            <dt>traceId</dt>
            <dd className="ac-mono">{log.id}</dd>
            <dt>动作类型</dt>
            <dd>{log.category}</dd>
            <dt>操作动作</dt>
            <dd>{log.action}</dd>
            <dt>对象类型</dt>
            <dd>{log.targetType}</dd>
            <dt>对象编号</dt>
            <dd className="ac-mono">{log.targetId}</dd>
            <dt>对象标题</dt>
            <dd>{log.targetTitle}</dd>
            <dt>来源 IP</dt>
            <dd className="ac-mono">{log.ip}</dd>
            <dt>处理结果</dt>
            <dd>{log.resultLabel}</dd>
          </dl>
        </div>
      </div>

      <div className="ac-hint ac-hint--ai">
        <ScrollText size={14} />
        <span>{log.detail}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 页面 */

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>('egress');
  /** 代码出网总闸（两态：允许 / 禁止） */
  const [egressAllowed, setEgressAllowed] = useState(true);
  /** 脱敏规则启用状态（可逐条切换） */
  const [ruleEnabled, setRuleEnabled] = useState<Record<string, boolean>>(() =>
    redactRules.reduce<Record<string, boolean>>((acc, r) => {
      acc[r.id] = r.enabled;
      return acc;
    }, {}),
  );

  const [range, setRange] = useState<RangeId>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [activeLog, setActiveLog] = useState<AuditLogDef | null>(null);

  /* ---------- 派生数据 ---------- */
  const enabledRuleCount = redactRules.filter((r) => ruleEnabled[r.id]).length;
  const totalHits = redactRules.reduce((s, r) => s + r.hits, 0);

  const denyEnvs = egressPolicy.filter((p) => p.code === 'DENY').flatMap((p) => p.envIds);
  const audit24h = auditLogs.filter((l) => l.time.startsWith(AUDIT_DAY)).length;
  const auditAbnormal = auditLogs.filter((l) => l.result !== 'success').length;
  const since7d = RANGE_OPTIONS.find((r) => r.id === '7d')?.since ?? '';
  const audit7d = auditLogs.filter((l) => l.time >= since7d).length;

  const currentRoleName =
    rbacMatrix.rows.find((r) => r.roleId === rbacMatrix.currentRoleId)?.roleName ??
    rbacMatrix.currentRoleId;

  const posture: {
    key: string;
    icon: LucideIcon;
    tone: Tone;
    label: string;
    value: string;
    foot: string;
  }[] = [
    {
      key: 'egress',
      icon: egressAllowed ? Globe : ShieldAlert,
      tone: egressAllowed ? 'ok' : 'danger',
      label: '代码出网状态',
      value: egressAllowed ? '允许出网' : '禁止出网',
      foot: `预发 / 生产恒为禁止出域（${denyEnvs.length} 个环境）`,
    },
    {
      key: 'redact',
      icon: Eraser,
      tone: 'ok',
      label: '脱敏规则启用',
      value: `${enabledRuleCount} / ${redactRules.length} 条`,
      foot: `累计命中 ${num(totalHits)} 次 · 统一组件 SEC-MASK-2.1`,
    },
    {
      key: 'audit',
      icon: FileClock,
      tone: 'info',
      label: `近 24 小时审计（${AUDIT_DAY}）`,
      value: `${audit24h} 条`,
      foot: `近 7 日 ${audit7d} 条 · 失败 / 拒绝 ${auditAbnormal} 条`,
    },
    {
      key: 'sso',
      icon: KeyRound,
      tone: ssoStatus.enabled ? 'ok' : 'neutral',
      label: 'SSO / OAuth2 接入',
      value: ssoStatus.enabled ? '已启用' : '未启用',
      foot: `${ssoStatus.primaryProvider} · ${ssoStatus.protocol} · 绑定率 ${ssoStatus.boundUserRate}%`,
    },
  ];

  const auditCategories = useMemo(
    () => Array.from(new Set(auditLogs.map((l) => l.category))),
    [],
  );

  const filteredLogs = useMemo(() => {
    const since = RANGE_OPTIONS.find((r) => r.id === range)?.since ?? '';
    const keyword = query.trim().toLowerCase();
    return auditLogs.filter((l) => {
      if (since && l.time < since) return false;
      if (category !== 'all' && l.category !== category) return false;
      if (keyword) {
        const haystack = `${l.id} ${l.targetId} ${l.action} ${l.targetTitle}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [range, category, query]);

  return (
    <div className="ac-st" data-annotation-id="ai-sdlc-settings-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">安全与审计</div>
          <div className="ac-page-desc">
            统一管控代码与数据的出网边界、字段级脱敏规则与最小化上传策略，留痕全部敏感操作，
            并以 SSO / MFA 与 RBAC 最小权限收敛访问面；口径与「订单中心重构」（EPIC-ORDER-REF）Sprint 24 安全基线一致。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            {AUDIT_LATEST}
          </span>
          <span className="ac-tag ac-tag--brand">
            <ShieldCheck size={12} />
            当前视角：{currentRoleName}
          </span>
        </div>
      </div>

      {/* ---------- 顶部安全态势摘要条 ---------- */}
      <div className="ac-card" data-annotation-id="ai-sdlc-settings-posture">
        <div className="ac-card-head">
          <span className="ac-card-title">
            <ShieldCheck size={16} />
            安全态势摘要
          </span>
          <span className="ac-card-subtitle">出网 · 脱敏 · 留痕 · 鉴权 四项基线</span>
          <div className="ac-card-extra">
            <span className="ac-tag ac-tag--outline">审计流水 {auditLogs.length} 条</span>
            <span className="ac-tag ac-tag--ok">
              <ShieldCheck size={12} />
              基线达标
            </span>
          </div>
        </div>
        <div className="ac-card-body">
          <div className="ac-st-posture">
            {posture.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="ac-st-posture-item">
                  <span className={`ac-st-posture-icon ${POSTURE_TONE[item.tone] ?? ''}`}>
                    <Icon size={17} />
                  </span>
                  <div className="ac-col ac-flex-1">
                    <span className="ac-st-posture-label">{item.label}</span>
                    <span className="ac-st-posture-value">{item.value}</span>
                    <span className="ac-st-posture-foot">{item.foot}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- 页签 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count =
            t.id === 'egress' ? redactRules.length : t.id === 'audit' ? auditLogs.length : rbacMatrix.rows.length;
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

      {/* ================= 1. 出网与脱敏 ================= */}
      {tab === 'egress' && (
        <>
          <div className="ac-section-title">代码出网管控</div>
          <div className="ac-grid-2">
            {/* 出网开关 */}
            <div className="ac-card" data-annotation-id="ai-sdlc-settings-egress">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Globe size={16} />
                  代码出网开关
                </span>
                <div className="ac-card-extra">
                  <span className={`ac-tag ac-tag--${egressAllowed ? 'ok' : 'danger'}`}>
                    <span className={egressAllowed ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                    {egressAllowed ? '允许出网' : '禁止出网'}
                  </span>
                </div>
              </div>
              <div className="ac-card-body ac-card-body--flush">
                <button
                  type="button"
                  className="ac-st-switch-row"
                  onClick={() => setEgressAllowed((v) => !v)}
                  aria-pressed={egressAllowed}
                >
                  <SwitchVisual on={egressAllowed} deny={!egressAllowed} />
                  <span className="ac-flex-1">
                    <span className="ac-st-switch-title">
                      {egressAllowed ? '允许代码出网' : '禁止代码出网'}
                    </span>
                    <span className="ac-st-switch-desc">
                      {egressAllowed
                        ? '开发环境代码与公开级数据可调用外部公有云模型；测试环境数据须经脱敏后方可出域；预发与生产环境恒为禁止。'
                        : '所有外部模型调用被网关拦截，模型路由强制回落内网私有化 mdl-local，出域请求一律拒绝并留痕。'}
                    </span>
                  </span>
                </button>
              </div>
              {!egressAllowed && (
                <div className="ac-card-body ac-card-body--tight">
                  <div className="ac-hint ac-hint--danger">
                    <AlertTriangle size={14} />
                    <span>
                      禁止出网后的行为：① 外部公有云模型（mdl-claude / mdl-deepseek / mdl-qwen / mdl-gpt5）调用一律拦截；
                      ② 路由策略命中 <span className="ac-mono">EGRESS-DENY</span>，自动切换为内网私有化{' '}
                      <span className="ac-mono">mdl-local</span>；③ 每次出域请求写入安全审计流水并标记为「拒绝」。
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 最小化上传策略 */}
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Server size={16} />
                  最小化上传策略
                </span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">切片上限 512 KB</span>
                </div>
              </div>
              <div className="ac-card-body">
                <dl className="ac-kv">
                  <dt>切片大小上限</dt>
                  <dd>512 KB / 切片，超出自动二次切分</dd>
                  <dt>单文件上限</dt>
                  <dd>8 MB，超出部分本地裁剪</dd>
                  <dt>单次切片数</dt>
                  <dd>不超过 64 个切片</dd>
                  <dt>去重策略</dt>
                  <dd>内容寻址去重，仅上传命中变更的切片</dd>
                  <dt>上传前处理</dt>
                  <dd>强制经统一脱敏组件 SEC-MASK-2.1 处理</dd>
                  <dt>留痕</dt>
                  <dd>每次上传写入安全审计流水（含 traceId）</dd>
                </dl>
              </div>
              <div className="ac-card-foot">
                <span className="ac-xs ac-muted">
                  上传内容仅用于当次推理上下文，不落盘、不用于模型训练；超出上限的上下文由本地裁剪后分片提交。
                </span>
              </div>
            </div>
          </div>

          {/* 环境出网策略矩阵 */}
          <div className="ac-section-title">环境出网策略矩阵</div>
          <div className="ac-grid-3 ac-st-policy-grid">
            {egressPolicy.map((p) => {
              const Icon = EGRESS_ICON[p.code];
              const active = p.code === (egressAllowed ? 'ALLOW' : 'DENY');
              return (
                <div
                  key={p.id}
                  className={`ac-st-policy-card ${active ? 'ac-st-policy-card--active' : ''}`}
                >
                  <div className="ac-st-policy-head">
                    <span
                      className={`ac-avatar ac-avatar--square ac-avatar--sm ${AVATAR_TONE[p.tone]}`}
                    >
                      <Icon size={13} />
                    </span>
                    <span className="ac-st-policy-name">{p.name}</span>
                    <span
                      className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[p.tone]} ac-ml-auto`}
                    >
                      {p.id}
                    </span>
                  </div>
                  <div className="ac-st-policy-desc">{p.desc}</div>
                  <ul className="ac-st-policy-rules">
                    {p.rules.map((r) => (
                      <li key={r}>
                        <CheckCircle2 size={13} />
                        {r}
                      </li>
                    ))}
                  </ul>
                  <div className="ac-xs ac-muted">
                    数据等级上限 {p.maxSecretLevel} · 外部模型 {p.allowExternalModel ? '允许' : '禁止'} ·
                    原始数据 {p.allowRawData ? '允许' : '禁止'}
                  </div>
                  <div className="ac-st-policy-envs">
                    <span className="ac-xs ac-muted">适用环境</span>
                    {p.envIds.map((id) => (
                      <span key={id} className="ac-tag ac-tag--sm ac-tag--outline">
                        {envName(id)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 脱敏规则表 */}
          <div className="ac-section-title">字段级脱敏规则</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-settings-redact">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Eraser size={16} />
                脱敏规则（SEC-MASK-2.1）
              </span>
              <span className="ac-card-subtitle">命中即按策略改写，出域与展示统一生效</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">启用 {enabledRuleCount}</span>
                <span className="ac-tag ac-tag--outline">共 {redactRules.length} 条</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>规则名称</th>
                      <th>匹配类型</th>
                      <th>脱敏动作</th>
                      <th>示例（脱敏前 → 脱敏后）</th>
                      <th>适用范围</th>
                      <th className="ac-td-right">命中次数</th>
                      <th className="ac-td-center">启用状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {redactRules.map((r) => {
                      const on = ruleEnabled[r.id];
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="ac-st-rule-name">{r.name}</div>
                            <span className="ac-xs ac-muted ac-mono">
                              {r.field} · {r.id}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.tone]}`}>
                              {r.category}
                            </span>
                          </td>
                          <td>
                            <div className="ac-st-cell-desc">{r.strategy}</div>
                          </td>
                          <td>
                            <span className="ac-st-sample">
                              <span className="ac-st-sample-before">{r.sampleBefore}</span>
                              <span className="ac-muted">→</span>
                              <span className="ac-st-sample-after">{r.sampleAfter}</span>
                            </span>
                          </td>
                          <td className="ac-text-2">{r.scope}</td>
                          <td className="ac-td-num">{num(r.hits)}</td>
                          <td className="ac-td-center">
                            <SwitchButton
                              small
                              on={on}
                              label={`${on ? '停用' : '启用'}${r.name}`}
                              onToggle={() =>
                                setRuleEnabled((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <span className="ac-xs ac-muted">
                规则按字段匹配，命中后按动作改写并保留命中计数；停用规则不参与出域与展示改写，变更本身同样写入审计流水。
              </span>
            </div>
          </div>
        </>
      )}

      {/* ================= 2. 审计日志 ================= */}
      {tab === 'audit' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-settings-audit">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ScrollText size={16} />
                安全审计留痕
              </span>
              <span className="ac-card-subtitle">敏感操作全量留痕，支持按时间、动作类型与 traceId 追溯</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">命中 {filteredLogs.length} / {auditLogs.length}</span>
                <span className="ac-tag ac-tag--warn">失败 / 拒绝 {auditAbnormal}</span>
              </div>
            </div>

            <div className="ac-filter-bar">
              <span className="ac-xs ac-muted">时间范围</span>
              <select
                className="ac-select ac-select--sm"
                value={range}
                onChange={(e) => setRange(e.target.value as RangeId)}
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="ac-xs ac-muted">动作类型</span>
              <select
                className="ac-select ac-select--sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">全部动作类型</option>
                {auditCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Search size={14} className="ac-muted" />
              <input
                className="ac-input ac-input--sm"
                style={{ minWidth: 220 }}
                placeholder="检索 traceId（如 al-0001）"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setQuery('')}>
                  清除
                </button>
              )}
            </div>

            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>操作者</th>
                      <th>动作类型</th>
                      <th>动作与对象</th>
                      <th>traceId</th>
                      <th className="ac-td-right">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l) => {
                      const ResultIcon = RESULT_META[l.result].icon;
                      return (
                        <tr
                          key={l.id}
                          className="ac-st-audit-row"
                          onClick={() => setActiveLog(l)}
                        >
                          <td className="ac-mono ac-muted ac-nowrap">{l.time}</td>
                          <td>
                            <span className="ac-st-audit-actor">
                              <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[l.actorTone]}`}>
                                {l.actorName.slice(0, 1)}
                              </span>
                              <span className="ac-col">
                                <span className="ac-strong">{l.actorName}</span>
                                <span className="ac-xs ac-muted">{l.roleName}</span>
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[l.tone]}`}>
                              {l.category}
                            </span>
                          </td>
                          <td>
                            <div className="ac-st-cell-desc">{l.action}</div>
                            <span className="ac-xs ac-muted ac-mono">
                              {l.targetType} · {l.targetId} · {l.targetTitle}
                            </span>
                          </td>
                          <td>
                            <span className="ac-st-trace-code">{l.id}</span>
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${RESULT_META[l.result].tone}`}>
                              <ResultIcon size={11} />
                              {l.resultLabel}
                            </span>
                            <ChevronRight size={13} className="ac-muted" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {filteredLogs.length === 0 && (
              <div className="ac-empty ac-empty--sm">
                <div className="ac-empty-title">无匹配留痕</div>
                <div className="ac-empty-desc">
                  当前时间范围、动作类型与 traceId 条件下没有审计记录，请调整筛选条件后重试。
                </div>
              </div>
            )}
          </div>

          <Drawer
            open={activeLog !== null}
            title="审计留痕明细"
            subtitle={activeLog ? `${activeLog.time} · ${activeLog.actorName} · ${activeLog.resultLabel}` : ''}
            width={620}
            onClose={() => setActiveLog(null)}
          >
            {activeLog && <AuditDetail log={activeLog} />}
          </Drawer>
        </>
      )}

      {/* ================= 3. 鉴权与权限 ================= */}
      {tab === 'auth' && (
        <>
          {/* SSO 接入状态 */}
          <div className="ac-card" data-annotation-id="ai-sdlc-settings-sso">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <KeyRound size={16} />
                SSO / OAuth2 接入状态
              </span>
              <span className="ac-card-subtitle">统一身份认证与账号安全基线</span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--sm ac-tag--${ssoStatus.enabled ? 'ok' : 'neutral'}`}>
                  <span className={ssoStatus.enabled ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                  {ssoStatus.enabled ? '已启用' : '未启用'}
                </span>
                <span className="ac-tag ac-tag--sm ac-tag--outline">{ssoStatus.protocol}</span>
                {ssoStatus.mfaRequired && (
                  <span className="ac-tag ac-tag--sm ac-tag--warn">
                    <ShieldCheck size={11} />
                    MFA 强校验
                  </span>
                )}
                <span className="ac-tag ac-tag--sm ac-tag--outline">
                  <UserCheck size={11} />
                  绑定率 {ssoStatus.boundUserRate}%
                </span>
              </div>
            </div>

            <div className="ac-card-body">
              <dl className="ac-kv ac-st-sso-grid">
                <dt>主接入渠道</dt>
                <dd>{ssoStatus.primaryProvider}</dd>
                <dt>认证协议</dt>
                <dd>{ssoStatus.protocol}</dd>
                <dt>IdP 签发方</dt>
                <dd className="ac-st-sso-issuer ac-mono">{ssoStatus.issuer}</dd>
                <dt>登录入口</dt>
                <dd className="ac-st-sso-issuer ac-mono">{ssoStatus.loginUrl}</dd>
                <dt>账号绑定</dt>
                <dd>
                  {ssoStatus.boundUsers} / {ssoStatus.totalUsers} 人（绑定率 {ssoStatus.boundUserRate}%）
                </dd>
                <dt>会话有效期</dt>
                <dd>{ssoStatus.sessionTimeoutMin} 分钟</dd>
                <dt>强制 MFA 角色</dt>
                <dd>
                  <span className="ac-row ac-gap-2 ac-wrap">
                    {ssoStatus.enforcedRoles.map((id) => (
                      <span key={id} className="ac-tag ac-tag--sm ac-tag--outline">
                        {roleName(id)}
                      </span>
                    ))}
                  </span>
                </dd>
                <dt>上次校验时间</dt>
                <dd className="ac-mono">{ssoStatus.lastSyncAt}</dd>
              </dl>
            </div>

            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>接入渠道</th>
                      <th>协议</th>
                      <th>状态</th>
                      <th className="ac-td-right">绑定账号</th>
                      <th>最近登录</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ssoStatus.providers.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="ac-row ac-gap-2">
                            <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[p.tone]}`}>
                              <Building2 size={11} />
                            </span>
                            <span className="ac-st-rule-name">{p.name}</span>
                          </span>
                        </td>
                        <td className="ac-text-2">{p.protocol}</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[p.tone]}`}>
                            <span className={p.enabled ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                            {p.status}
                          </span>
                        </td>
                        <td className="ac-td-num">{p.boundUsers}</td>
                        <td className="ac-mono ac-muted">{p.lastLoginAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ac-card-body">
              <ul className="ac-st-notes">
                {ssoStatus.notes.map((n) => (
                  <li key={n}>
                    <ShieldCheck size={14} />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* RBAC 权限矩阵 */}
          <div className="ac-card" data-annotation-id="ai-sdlc-settings-rbac">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Users size={16} />
                角色权限矩阵（RBAC）
              </span>
              <span className="ac-card-subtitle">
                {rbacMatrix.rows.length} 个角色 × {rbacMatrix.permissions.length} 个权限维度 · 当前视角行高亮
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--brand">当前视角：{currentRoleName}</span>
                <span className="ac-tag ac-tag--outline">
                  {CURRENT_USER.name} · {CURRENT_USER.title}
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>角色</th>
                      {rbacMatrix.permissions.map((perm) => {
                        const PermIcon = PERM_ICON[perm.id];
                        return (
                          <th key={perm.id}>
                            <span className="ac-row ac-gap-2">
                              <PermIcon size={13} className="ac-muted" />
                              <span className="ac-st-rbac-perm-title">{perm.name}</span>
                            </span>
                            <span className="ac-st-rbac-perm-desc">{perm.desc}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rbacMatrix.rows.map((row) => {
                      const current = row.roleId === rbacMatrix.currentRoleId;
                      return (
                        <tr key={row.roleId} className={current ? 'ac-st-rbac-row--current' : ''}>
                          <td>
                            <span className="ac-st-rbac-role">
                              <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[row.roleTone]}`}>
                                {row.roleName.slice(0, 1)}
                              </span>
                              <span className="ac-st-rbac-role-name">{row.roleName}</span>
                              {current && <span className="ac-tag ac-tag--sm ac-tag--brand">当前</span>}
                            </span>
                          </td>
                          {rbacMatrix.permissions.map((perm) => {
                            const cell = row.cells[perm.id];
                            const CellIcon = ACCESS_ICON[cell.level];
                            return (
                              <td key={perm.id}>
                                <span className={`ac-st-rbac-cell ${TEXT_TONE[cell.tone]}`}>
                                  <CellIcon size={13} />
                                  {cell.label}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <span className="ac-xs ac-muted">
                授权级别：全部（跨业务域全量）/ 本域（仅本人所属业务域）/ 只读 / 无；门禁放行、发布审批等关键动作遵循最小权限原则，超出角色权限的操作会被拒绝并写入审计流水。
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
