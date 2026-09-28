/**
 * 团队管理（pageId: team）
 *
 * 标签页：
 *  1. 团队编制   —— 汇总指标 / 手绘 SVG 组织架构树 / 团队卡片网格 / 角色配比堆叠条 + 理想配比对比 / 团队详情表 + 抽屉
 *  2. 团队效能   —— 迭代选择器 / 承诺-速率分组柱状图（叠加完成率双轴折线）/ 跨迭代趋势折线 + 6 项指标迷你走势 /
 *                   效能表（12 列）/ AI 团队诊断 / 6 维能力雷达图（当期 vs 上期）
 *  3. 协作与依赖 —— 手绘 SVG 协作关系图（7 节点 8 有向边）/ 协作明细表 / 阻塞治理看板 / AI 协作优化建议（采纳·转派·驳回）
 *  4. 研发仪式   —— 6 张仪式卡片 / 出席率-行动项关闭率对比条形图 / AI 提效四象限矩阵 / AI 议程与纪要生成演示
 *
 * 数据口径：全部取自 ./data-mgmt 的 TEAMS(7) / TEAM_METRICS(21 = 7 团队 × SP-22/23/24) /
 * TEAM_COLLABS(8) / CEREMONIES(6) 与 ./data 的 USERS / ROLES / SPRINTS / TASKS / ARCH_COMPONENT_MAP，
 * 贯穿案例为「订单中心重构」（EPIC-ORDER-REF）· Sprint 24（2026-03-02 ~ 2026-03-27，TODAY = 2026-03-19）。
 * 所有图表为内联手绘 SVG，未引入任何图表库。
 */
import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  Crosshair,
  Crown,
  Gauge,
  Handshake,
  Layers,
  ListChecks,
  Network,
  Percent,
  Plus,
  Rocket,
  Scale,
  Send,
  ShieldCheck,
  Siren,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  TriangleAlert,
  UserCheck,
  Users,
  Waypoints,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  FormGroupTitle,
  FormGrid,
  MultiPickField,
  SelectField,
  TextareaField,
  TextField,
  cleanErrors,
  requireText,
} from '../components/FormFields';
import type { FieldOption } from '../components/FormFields';
import {
  ARCH_COMPONENTS,
  ARCH_COMPONENT_MAP,
  CURRENT_SPRINT,
  ROLES,
  ROLE_MAP,
  SPRINTS,
  TASKS,
  TODAY,
  USERS,
  USER_MAP,
  agents,
} from '../data';
import type { Tone, UserDef } from '../data';
import {
  CEREMONIES,
  MEMBER_PROFILE_MAP,
  TEAM_COLLABS,
  TEAM_METRICS,
  TEAMS,
  WORKLOADS,
} from '../data-mgmt';
import type { CeremonyDef, TeamCollabDef, TeamDef, TeamMetricSnapshot } from '../data-mgmt';
import './team.css';

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

type TabId = 'org' | 'metrics' | 'collab' | 'ceremony';

const TABS: { id: TabId; name: string; icon: typeof Users; count: number }[] = [
  { id: 'org', name: '团队编制', icon: Building2, count: TEAMS.length },
  { id: 'metrics', name: '团队效能', icon: Gauge, count: TEAM_METRICS.length },
  { id: 'collab', name: '协作与依赖', icon: Handshake, count: TEAM_COLLABS.length },
  { id: 'ceremony', name: '研发仪式', icon: CalendarClock, count: CEREMONIES.length },
];

/** TEAM_METRICS 覆盖的 3 个迭代，按 SPRINTS 的原始顺序排列 */
const METRIC_SPRINT_IDS: string[] = SPRINTS.map((s) => s.id).filter((id) =>
  TEAM_METRICS.some((m) => m.sprintId === id),
);

/** 效能趋势可切换的数值型指标 */
type NumericMetricKey =
  | 'velocityPoints'
  | 'committedPoints'
  | 'completionRatePct'
  | 'sayDoRatioPct'
  | 'defectDensity'
  | 'aiAdoptionPct'
  | 'avgPrReviewHours'
  | 'cycleTimeDays';

interface MetricDef {
  key: NumericMetricKey;
  label: string;
  unit: string;
  /** 该指标变大是否为好事（决定 Δ 的红绿） */
  betterUp: boolean;
  digits: number;
}

const METRIC_DEFS: MetricDef[] = [
  { key: 'velocityPoints', label: '实际速率', unit: '点', betterUp: true, digits: 0 },
  { key: 'sayDoRatioPct', label: '承诺达成率', unit: '%', betterUp: true, digits: 1 },
  { key: 'completionRatePct', label: '任务完成率', unit: '%', betterUp: true, digits: 0 },
  { key: 'defectDensity', label: '缺陷密度', unit: '个/KLOC', betterUp: false, digits: 2 },
  { key: 'aiAdoptionPct', label: 'AI 采纳率', unit: '%', betterUp: true, digits: 0 },
  { key: 'avgPrReviewHours', label: 'PR 评审时长', unit: 'h', betterUp: false, digits: 1 },
  { key: 'cycleTimeDays', label: '周期时间', unit: '天', betterUp: false, digits: 1 },
];

/** 6 维能力雷达的维度定义（口径见 RADAR_NOTE） */
const RADAR_DIMS: { label: string; short: string }[] = [
  { label: '交付速率', short: '速率' },
  { label: '质量', short: '质量' },
  { label: 'AI 采纳', short: 'AI' },
  { label: '协作效率', short: '协作' },
  { label: '评审效率', short: '评审' },
  { label: '周期时间', short: '周期' },
];

const RADAR_NOTE =
  '雷达口径：交付速率 = min(100, 承诺达成率)；质量 = (1 − 缺陷密度 ÷ 1.1) × 100，1.1 为 SP-22 全组织最高缺陷密度基线；' +
  'AI 采纳 = aiAdoptionPct；协作效率 = 任务条数完成率（TEAM_COLLABS 仅有当期快照，故用完成率作跨迭代可比代理）；' +
  '评审效率 = 100 − PR 评审时长 × 4（24h 记 4 分）；周期时间 = 100 − 周期天数 × 10。所有维度均已归一到 0~100。';

/**
 * 理想角色配比基线（技术中心 2026 编制指引，页面内置常量，非 data-mgmt 提供）。
 * 实际配比按 TEAMS.memberIds 中各成员在 USERS.roleId 上的归属统计（合计 9 名真人）。
 */
const IDEAL_ROLE_RATIO: Record<string, number> = {
  developer: 45,
  tester: 15,
  architect: 12,
  product: 12,
  ops: 8,
  pmo: 5,
  manager: 3,
};

/** 偏离基线多少个百分点即判定为「配比失衡」 */
const RATIO_GAP_THRESHOLD = 8;

/** 协作关系图的团队短名（节点内文字空间有限） */
const TEAM_SHORT: Record<string, string> = {
  'TEAM-01': '订单研发',
  'TEAM-02': '前端',
  'TEAM-03': '产品',
  'TEAM-04': '架构',
  'TEAM-05': '质保',
  'TEAM-06': '基础平台',
  'TEAM-07': 'PMO',
};

/** 协作健康度展示元数据 */
const HEALTH_META: Record<TeamCollabDef['health'], { label: string; tone: Tone; hex: string }> = {
  ok: { label: '健康', tone: 'ok', hex: TONE_HEX.ok },
  warn: { label: '预警', tone: 'warn', hex: TONE_HEX.warn },
  risk: { label: '阻塞', tone: 'danger', hex: TONE_HEX.danger },
};

/** AI 介入等级中文化 */
const AI_ASSIST_META: Record<
  CeremonyDef['aiAssist'],
  { label: string; level: number; tone: Tone; desc: string }
> = {
  none: { label: '不参与', level: 0, tone: 'neutral', desc: '全程由人工主持与记录' },
  summary: { label: '生成纪要', level: 1, tone: 'info', desc: 'AI 只做会后纪要与行动项归档' },
  agenda: { label: '生成议程', level: 2, tone: 'ai', desc: 'AI 会前生成议程，会后生成纪要' },
  full: { label: '全流程辅助', level: 3, tone: 'brand', desc: 'AI 会前预读 + 议程 + 会中记录 + 会后行动项跟踪' },
};

/**
 * 研发仪式的 AI 提效升级方案（逐条对应 CEREMONIES 的真实 aiAssist 等级与行动项关闭率）。
 * CER-01 / CER-03 已达 full，仅给出保持动作。
 */
const CEREMONY_UPGRADE: Record<
  string,
  { from: CeremonyDef['aiAssist']; to: CeremonyDef['aiAssist']; plan: string; gain: string }
> = {
  'CER-01': {
    from: 'full',
    to: 'full',
    plan: '已为全流程辅助，保持现状：把 AI 产出的 24 个任务卡草稿与 TASKS 的 24 条工作项做一致性回归（当前一一对应），并把容量热力图纳入迭代首日的准入检查。',
    gain: '出席率 96%、行动项关闭率 88%，为 6 个仪式中综合最优，可作为其他仪式的标杆模板。',
  },
  'CER-02': {
    from: 'summary',
    to: 'agenda',
    plan: '由 ag-ba 在每工作日 09:25 自动生成三段式议程：① 当日关键路径风险（SP-24 共 11 个 critical 任务）② 阻塞清单（当前 BLOCK-0312 已等待 96.5 小时）③ 昨日未完成项与责任人。主持人只做点名与裁决，不再现场收集信息。',
    gain: '15 分钟站会中的信息收集环节预计压缩到 4 分钟，行动项关闭率有望由 74% 提升至 85% 以上（对标 CER-01 的 88%）。',
  },
  'CER-03': {
    from: 'full',
    to: 'full',
    plan: '已为全流程辅助，保持现状：把 17 问 Brainstorm 追问清单与需求池 AI 打分复核表沉淀为需求管理页的常驻输入，形成「澄清会 → 需求池评分回写」的闭环。',
    gain: '出席率 92%、行动项关闭率 85%，AI 采纳率 78% 的交易中台产品组是该仪式的主要受益方。',
  },
  'CER-04': {
    from: 'agenda',
    to: 'full',
    plan: '由 ag-arch 预生成《KB-ARCH-01 一致性校验清单》（当前 14 项、13 项通过）与 API-10 契约冻结建议稿，ag-review 把命名 / 分层 / 异常包装类规约问题在 MR 阶段前置拦截；人工评审只裁决限界上下文边界与事务语义。',
    gain: '依据 COOP-01，平台架构组承接的 15 个 MR 评审等待 6.4h 仅为 SLA 的 27%，再压缩 2.5h/MR 可释放约 37.5 小时/迭代，直接改善该团队 SP-24 承诺达成率 64.3% 的偏低状态。',
  },
  'CER-05': {
    from: 'summary',
    to: 'full',
    plan: '由 ag-ba 基于 TEAM_METRICS 的 21 条跨迭代快照自动生成归因分析与改进项责任矩阵：SP-22 → SP-23 → SP-24 的组织级承诺达成率为 100% → 96.7% → 67.7%，AI 逐团队拆解偏差来源并挂 SLA 跟踪；SP-23 遗留的 2 条改进项在会前自动带出。',
    gain: '行动项关闭率由 78% 提升的空间最大：当前 9 条改进项仅闭环 7 条，遗留 2 条转入 SP-24 后无人跟踪，结构化后可避免跨迭代丢失。',
  },
  'CER-06': {
    from: 'full',
    to: 'full',
    plan: 'AI 介入已是 full，但行动项关闭率 62% 为 6 个仪式最低 —— 问题不在 AI 介入不足，而在行动项未结构化。建议把 REL-2403 的门禁结论（G3 / G4 未通过）与 4 批灰度准入判定转成带 SLA 的结构化行动项回写 PingCode，由 ag-ops 每日跟踪并自动升级超期项。',
    gain: '该仪式直接决定 2026-03-20 22:00 的切流窗口能否顺延至 03-26；行动项闭环率每提升 10 个百分点，可减少一次人工催办轮次。',
  },
};

/* ------------------------------------------------------------------ 工具函数 */

/** 团队 id → 名称（图表与文案复用） */
const TEAM_MAP_NAME: Record<string, string> = TEAMS.reduce<Record<string, string>>((acc, t) => {
  acc[t.id] = t.name;
  return acc;
}, {});

/** 团队 id → 定义 */
const TEAM_BY_ID: Record<string, TeamDef> = TEAMS.reduce<Record<string, TeamDef>>((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {});

/** 协作关系 id → 定义 */
const COLLAB_BY_ID: Record<string, TeamCollabDef> = TEAM_COLLABS.reduce<Record<string, TeamCollabDef>>(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {},
);

/** userId → 本迭代负载明细 */
const WORKLOAD_BY_USER: Record<string, (typeof WORKLOADS)[number]> = WORKLOADS.reduce<
  Record<string, (typeof WORKLOADS)[number]>
>((acc, w) => {
  acc[w.userId] = w;
  return acc;
}, {});

/** 取某团队某迭代的效能快照 */
function metricOf(teamId: string, sprintId: string): TeamMetricSnapshot | undefined {
  return TEAM_METRICS.filter((m) => m.teamId === teamId && m.sprintId === sprintId)[0];
}

/** 团队成员（真实 USERS 记录） */
function membersOf(team: TeamDef): UserDef[] {
  return team.memberIds.map((id) => USER_MAP[id]).filter(Boolean);
}

/** 团队的角色构成：roleId → 人数 */
function roleCountOf(team: TeamDef): Record<string, number> {
  const acc: Record<string, number> = {};
  ROLES.forEach((r) => {
    acc[r.id] = 0;
  });
  membersOf(team).forEach((u) => {
    acc[u.roleId] = (acc[u.roleId] ?? 0) + 1;
  });
  return acc;
}

/** 团队参与的协作关系（作为发起方或接收方） */
function collabsOf(teamId: string): TeamCollabDef[] {
  return TEAM_COLLABS.filter((c) => c.fromTeamId === teamId || c.toTeamId === teamId);
}

/** 团队协作健康度小结 */
function collabSummary(teamId: string) {
  const list = collabsOf(teamId);
  const risk = list.filter((c) => c.health === 'risk').length;
  const warn = list.filter((c) => c.health === 'warn').length;
  const ok = list.filter((c) => c.health === 'ok').length;
  const blocked = list.reduce((s, c) => s + c.blockedCount, 0);
  const tone: Tone = risk > 0 ? 'danger' : warn > 0 ? 'warn' : 'ok';
  return { total: list.length, risk, warn, ok, blocked, tone };
}

/** 6 维能力雷达得分（0~100，口径见 RADAR_NOTE） */
function radarScores(m: TeamMetricSnapshot): number[] {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  return [
    clamp(Math.min(100, m.sayDoRatioPct)),
    clamp((1 - m.defectDensity / 1.1) * 100),
    clamp(m.aiAdoptionPct),
    clamp(m.completionRatePct),
    clamp(100 - m.avgPrReviewHours * 4),
    clamp(100 - m.cycleTimeDays * 10),
  ];
}

/** 团队效能评级（组织内相对分位 + 绝对阈值双口径） */
function gradeOf(m: TeamMetricSnapshot): { label: string; tone: Tone } {
  const score =
    Math.min(100, m.sayDoRatioPct) * 0.3 +
    m.completionRatePct * 0.2 +
    m.aiAdoptionPct * 0.2 +
    Math.max(0, 100 - m.defectDensity * 60) * 0.15 +
    Math.max(0, 100 - m.cycleTimeDays * 8) * 0.15;
  if (score >= 82) return { label: 'A 卓越', tone: 'ok' };
  if (score >= 70) return { label: 'B 达标', tone: 'info' };
  if (score >= 58) return { label: 'C 待改进', tone: 'warn' };
  return { label: 'D 风险', tone: 'danger' };
}

/** 环比变化：当期 vs 上一迭代 */
function deltaOf(teamId: string, sprintId: string, key: NumericMetricKey) {
  const idx = METRIC_SPRINT_IDS.indexOf(sprintId);
  const cur = metricOf(teamId, sprintId);
  const prev = idx > 0 ? metricOf(teamId, METRIC_SPRINT_IDS[idx - 1]) : undefined;
  if (!cur || !prev) return null;
  return cur[key] - prev[key];
}

/** 跳转到其他原型页面 */
function jump(page: string) {
  window.location.hash = `#page=${page}`;
}

/**
 * AI 团队诊断：叙事文本为人工撰写，全部数值由 TEAM_METRICS / TEAM_COLLABS 在运行时插值，
 * 保证「结论里的每个数字都能在数据层复核」。
 */
function buildDiagnosis(teamId: string): { headline: string; evidence: string; action: string; tone: Tone } {
  const s22 = metricOf(teamId, 'SP-22');
  const s23 = metricOf(teamId, 'SP-23');
  const s24 = metricOf(teamId, 'SP-24');
  if (!s22 || !s23 || !s24) {
    return { headline: '数据不足', evidence: '缺少完整的三期效能快照。', action: '补齐快照后重跑诊断。', tone: 'neutral' };
  }
  const team = TEAMS.filter((t) => t.id === teamId)[0];
  const aiDelta = s24.aiAdoptionPct - s22.aiAdoptionPct;
  const defectDelta = Math.round((s24.defectDensity - s22.defectDensity) * 100) / 100;
  const reviewDrop = Math.round(((s22.avgPrReviewHours - s24.avgPrReviewHours) / s22.avgPrReviewHours) * 1000) / 10;

  switch (teamId) {
    case 'TEAM-01':
      return {
        headline: `AI 采纳率 ${s22.aiAdoptionPct}% → ${s24.aiAdoptionPct}%（+${aiDelta}pp，全组织最高），质量与评审同步改善`,
        evidence:
          `缺陷密度由 ${s22.defectDensity} 降至 ${s24.defectDensity} 个/KLOC（${defectDelta}），PR 平均评审时长由 ${s22.avgPrReviewHours}h 压缩至 ${s24.avgPrReviewHours}h（−${reviewDrop}%），周期时间 ${s22.cycleTimeDays} → ${s24.cycleTimeDays} 天，说明 AI 产出质量与评审门禁同时生效。` +
          `但 SP-24 承诺 ${s24.committedPoints} 点仅完成 ${s24.velocityPoints} 点，承诺达成率 ${s24.sayDoRatioPct}% 为 7 个团队最低。`,
        action:
          '瓶颈是外部依赖而非产能：COOP-02 记录 BLOCK-0312 使 TASK-2419 的生产迁移窗口等待 96.5 小时（SLA 48 小时），直接卡住关键路径末段的 TASK-2420 与 TASK-2421。建议把承诺达成率的归因由「产能不足」修正为「依赖阻塞」，SP-25 承诺前先扣除已知阻塞窗口，并把该团队的 AI 结对实践沉淀为组织级规约。',
        tone: 'warn' as Tone,
      };
    case 'TEAM-02':
      return {
        headline: `单点前端编制（${team.headcount} 人），缺陷密度 ${s24.defectDensity} 个/KLOC 仍为 7 个团队最高`,
        evidence:
          `缺陷密度虽由 SP-22 的 ${s22.defectDensity} 降至 ${s24.defectDensity}（−${Math.round((1 - s24.defectDensity / s22.defectDensity) * 1000) / 10}%），但绝对值仍高于 SP-24 组织均值 0.41；AI 采纳率 ${s22.aiAdoptionPct}% → ${s24.aiAdoptionPct}%，PR 评审时长 ${s24.avgPrReviewHours}h 已是全组织第二短。` +
          `SP-24 承诺 ${s24.committedPoints} 点完成 ${s24.velocityPoints} 点（${s24.sayDoRatioPct}%）。`,
        action:
          '根因是前端无同侪评审：COOP-03 显示 API-10「拆单预演」契约仍为 draft，导致 TASK-2416 progress 为 0、等待 18.2 小时（SLA 的 76%）。建议把 ac-order-query 的评审人由平台架构组兜底，并由 ag-arch 基于 TASK-2415 的拆单方案先生成 Mock Server 与 OpenAPI 草稿，让前端在契约冻结前并行开发。',
        tone: 'warn' as Tone,
      };
    case 'TEAM-03':
      return {
        headline: `AI 采纳率 ${s24.aiAdoptionPct}% 为全组织最高，但 PR 评审时长 ${s24.avgPrReviewHours}h 仍是第二高`,
        evidence:
          `需求侧 AI 产出已成常态（AI 采纳率 ${s22.aiAdoptionPct}% → ${s23.aiAdoptionPct}% → ${s24.aiAdoptionPct}%），缺陷密度 ${s24.defectDensity} 个/KLOC 为研发序列外的最低值之一；` +
          `但周期时间 ${s24.cycleTimeDays} 天仍高于组织均值，SP-24 承诺 ${s24.committedPoints} 点完成 ${s24.velocityPoints} 点（${s24.sayDoRatioPct}%）。`,
        action:
          'COOP-04 记录本迭代发生 2 次 PRD 基线修订、需求变更率 18.4%。建议在需求澄清会引入 ag-pm 的「变更影响面预扫描」：每次基线修订前自动列出受影响的 TASK / API / 用例清单，把变更决策前置到评审会而非开发中途。',
        tone: 'warn' as Tone,
      };
    case 'TEAM-04':
      return {
        headline: `平均职级 P${team.avgSeniority.toFixed(1)} 全组织最高，呈现「评审挤出开发」形态`,
        evidence:
          `该团队承接 COOP-01 的 15 个 MR 架构一致性评审，评审等待 ${COLLAB_BY_ID['COOP-01'].avgWaitHours}h 仅为 SLA 的 ${Math.round((COLLAB_BY_ID['COOP-01'].avgWaitHours / COLLAB_BY_ID['COOP-01'].slaHours) * 100)}%，协作健康；` +
          `但自身 SP-24 承诺 ${s24.committedPoints} 点仅完成 ${s24.velocityPoints} 点（${s24.sayDoRatioPct}%），完成率 ${s24.completionRatePct}% 亦为 7 个团队次低。AI 采纳率 ${s22.aiAdoptionPct}% → ${s24.aiAdoptionPct}%，缺陷密度 ${s24.defectDensity} 个/KLOC。`,
        action:
          '把规约类评审（命名、分层、异常包装）全量前移到 ag-review 自动拦截，人工只聚焦边界与事务语义，按每条 MR 再压缩 2.5 小时估算可释放约 37.5 小时/迭代；同时把可测性评审清单固化为 ag-arch 的输出模板（COOP-06），减少重复讨论。',
        tone: 'danger' as Tone,
      };
    case 'TEAM-05':
      return {
        headline: `完成率 ${s24.completionRatePct}% 与承诺达成率 ${s24.sayDoRatioPct}% 双双垫底，成因为上游产物未就绪`,
        evidence:
          `SP-24 承诺 ${s24.committedPoints} 点仅完成 ${s24.velocityPoints} 点；COOP-05 记录 ${COLLAB_BY_ID['COOP-05'].blockedCount} 项阻塞、等待 ${COLLAB_BY_ID['COOP-05'].avgWaitHours}h（SLA ${COLLAB_BY_ID['COOP-05'].slaHours}h 的 ${Math.round((COLLAB_BY_ID['COOP-05'].avgWaitHours / COLLAB_BY_ID['COOP-05'].slaHours) * 100)}%）：TASK-2405（单测补齐）与 TASK-2420（双写校验）未就绪，128 组金额边界用例仅执行 74 组（执行率 62%）。` +
          `正向面是 AI 采纳率 ${s22.aiAdoptionPct}% → ${s24.aiAdoptionPct}%，PR 评审时长 ${s22.avgPrReviewHours}h → ${s24.avgPrReviewHours}h。`,
        action:
          '把「构建产物就绪」写入 G3 的出口条件，由 ag-test 在 MR 合入后 10 分钟内自动触发对应用例集而非等测试计划人工排期；162 条回归用例改为全自动执行，仅失败项进入人工复核。',
        tone: 'danger' as Tone,
      };
    case 'TEAM-06':
      return {
        headline: `周期时间 ${s24.cycleTimeDays} 天全组织最短，SP-24 达成率下滑的唯一外因是窗口审批`,
        evidence:
          `SP-22 / SP-23 承诺达成率均为 ${s22.sayDoRatioPct}% / ${s23.sayDoRatioPct}%，SP-24 降至 ${s24.sayDoRatioPct}%（承诺 ${s24.committedPoints} 点完成 ${s24.velocityPoints} 点）；` +
          `周期时间 ${s22.cycleTimeDays} → ${s24.cycleTimeDays} 天，缺陷密度 ${s24.defectDensity} 个/KLOC，AI 采纳率 ${s24.aiAdoptionPct}%。该团队同时是 COOP-02 的阻塞接收方（BLOCK-0312 等待 96.5h）。`,
        action:
          '把生产迁移窗口审批改为「默认放行 + 事后审计」：由 ag-ops 基于预生产 3 轮零差异比对结果生成风险签核单，DBA 只需在 4 小时内否决而非主动批准；同时把埋点契约纳入 G2 架构门禁（COOP-08），避免上线后返工。',
        tone: 'warn' as Tone,
      };
    default:
      return {
        headline: `AI 采纳率 ${s24.aiAdoptionPct}% 与 PR 评审时长 ${s24.avgPrReviewHours}h 均为 7 个团队最差`,
        evidence:
          `周期时间 ${s24.cycleTimeDays} 天最长，完成率由 SP-23 的 ${s23.completionRatePct}% 跌至 SP-24 的 ${s24.completionRatePct}%，承诺达成率 ${s24.sayDoRatioPct}% 为全组织最低；` +
          `AI 采纳率虽由 ${s22.aiAdoptionPct}% 提升至 ${s24.aiAdoptionPct}%（+${aiDelta}pp），但基数最低。COOP-07 记录 TASK-2415 / TASK-2408 的转出协商已进行 3 轮、等待 ${COLLAB_BY_ID['COOP-07'].avgWaitHours}h（SLA 的 ${Math.round((COLLAB_BY_ID['COOP-07'].avgWaitHours / COLLAB_BY_ID['COOP-07'].slaHours) * 100)}%）。`,
        action:
          '由 PMO 直接基于 WORKLOADS 快照提出「带补偿的转出方案」（转出任务 + 明确接手人 + SP-25 优先级承诺）一次性表决，避免多轮拉锯；ag-ba 自动生成转出后的负载模拟结果作为决策依据（周浩然 223.8% / 沈亦白 181.0% 的过载可在同一张表上收敛）。',
        tone: 'danger' as Tone,
      };
  }
}

/* ------------------------------------------------------------------ 内联 SVG 图表 */

/** 手绘 SVG 组织架构树：虚拟根节点「技术中心」+ 7 个一级团队（TEAMS.parentTeamId 均为 null） */
function OrgTreeChart({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const W = 1200;
  const H = 272;
  const nodeW = 148;
  const nodeH = 116;
  const gap = 12;
  const totalW = TEAMS.length * nodeW + (TEAMS.length - 1) * gap;
  const startX = Math.round((W - totalW) / 2);
  const childY = 130;
  const rootW = 232;
  const rootH = 58;
  const rootX = Math.round((W - rootW) / 2);
  const rootY = 12;
  const busY = 102;
  const centers = TEAMS.map((_, i) => startX + i * (nodeW + gap) + nodeW / 2);
  const humanCount = TEAMS.reduce((s, t) => s + t.headcount, 0);

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="技术中心组织架构树：1 个虚拟根节点下挂 7 个一级团队，节点显示负责人、编制人数、平均职级、技术栈与承接组件数"
    >
      {/* 根节点 */}
      <rect x={rootX} y={rootY} width={rootW} height={rootH} rx={10} className="ac-tmg-tree-root" />
      <text x={W / 2} y={rootY + 24} textAnchor="middle" className="ac-tmg-tree-root-name">
        技术中心
      </text>
      <text x={W / 2} y={rootY + 43} textAnchor="middle" className="ac-tmg-tree-root-sub">
        {TEAMS.length} 个一级团队 · {humanCount} 名真人 + 1 个 AI 共享账号
      </text>

      {/* 连线：根 → 主干 → 各团队 */}
      <line x1={W / 2} y1={rootY + rootH} x2={W / 2} y2={busY} className="ac-tmg-tree-link" />
      <line x1={centers[0]} y1={busY} x2={centers[centers.length - 1]} y2={busY} className="ac-tmg-tree-link" />
      {centers.map((cx, i) => (
        <line key={TEAMS[i].id} x1={cx} y1={busY} x2={cx} y2={childY} className="ac-tmg-tree-link" />
      ))}

      {/* 团队节点 */}
      {TEAMS.map((t, i) => {
        const x = startX + i * (nodeW + gap);
        const cx = centers[i];
        const leader = USER_MAP[t.leaderId];
        const active = t.id === selectedId;
        return (
          <g
            key={t.id}
            className="ac-tmg-tree-node"
            onClick={() => onSelect(t.id)}
            role="button"
            aria-label={`选中团队 ${t.name}`}
          >
            <title>{`${t.name}（${t.id}）· 负责人 ${leader?.name ?? '—'} · 编制 ${t.headcount} 人 · 平均职级 P${t.avgSeniority.toFixed(1)}`}</title>
            <rect
              x={x}
              y={childY}
              width={nodeW}
              height={nodeH}
              rx={10}
              className={active ? 'ac-tmg-tree-card ac-tmg-tree-card--active' : 'ac-tmg-tree-card'}
            />
            <circle cx={x + 24} cy={childY + 26} r={14} fill={TONE_HEX[t.tone] ?? TONE_HEX.brand} />
            <text x={x + 24} y={childY + 30} textAnchor="middle" className="ac-tmg-tree-initial">
              {leader?.initial ?? '—'}
            </text>
            <text x={x + 44} y={childY + 24} className="ac-tmg-tree-name">
              {t.name}
            </text>
            <text x={x + 44} y={childY + 39} className="ac-tmg-tree-id">
              {t.id}
            </text>
            <line x1={x + 12} y1={childY + 50} x2={x + nodeW - 12} y2={childY + 50} className="ac-tmg-tree-sep" />
            <text x={x + 12} y={childY + 68} className="ac-tmg-tree-meta">
              负责人 {leader?.name ?? '—'}
            </text>
            <text x={x + 12} y={childY + 86} className="ac-tmg-tree-meta">
              编制 {t.headcount} 人 · P{t.avgSeniority.toFixed(1)}
            </text>
            <text x={x + 12} y={childY + 104} className="ac-tmg-tree-meta">
              栈 {t.techStack.length} · 组件 {t.ownedComponentIds.length}
            </text>
            {active && <circle cx={cx} cy={childY - 6} r={3.5} fill={TONE_HEX.brand} />}
          </g>
        );
      })}

      <text x={W / 2} y={H - 6} textAnchor="middle" className="ac-tmg-tree-caption">
        TEAMS.parentTeamId 均为 null（技术中心下的扁平一级团队结构），根节点为按 CURRENT_USER.dept 还原的虚拟组织节点；点击任意团队节点可联动下方详情
      </text>
    </svg>
  );
}

/** 手绘 SVG 角色配比堆叠条形图：每个团队按 7 个角色的人数堆叠 */
function RoleMixChart({ onSelect }: { onSelect: (id: string) => void }) {
  const W = 980;
  const labelW = 128;
  const valueW = 150;
  const rowH = 30;
  const H = TEAMS.length * rowH + 10;
  const chartW = W - labelW - valueW;
  const maxHead = Math.max(...TEAMS.map((t) => t.headcount), 1);
  const unit = chartW / maxHead;

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="7 个团队的角色构成堆叠条形图，按 7 个角色的人数分段着色"
    >
      {TEAMS.map((t, rowIdx) => {
        const y = rowIdx * rowH + 5;
        const counts = roleCountOf(t);
        let cursor = labelW;
        return (
          <g key={t.id} className="ac-tmg-tree-node" onClick={() => onSelect(t.id)}>
            <text x={0} y={y + 15} className="ac-tmg-bar-name">
              {t.name}
            </text>
            <rect className="ac-tmg-bar-track" x={labelW} y={y + 3} width={chartW} height={17} rx={4} />
            {ROLES.map((r) => {
              const c = counts[r.id] ?? 0;
              if (c <= 0) return null;
              const w = c * unit;
              const rect = (
                <rect
                  key={r.id}
                  x={cursor}
                  y={y + 3}
                  width={Math.max(w - 2, 2)}
                  height={17}
                  rx={3}
                  fill={TONE_HEX[r.color] ?? TONE_HEX.brand}
                >
                  <title>{`${t.name} · ${r.name} ${c} 人`}</title>
                </rect>
              );
              cursor += w;
              return rect;
            })}
            <text x={labelW + chartW + 10} y={y + 16} className="ac-tmg-bar-value">
              {t.headcount} 人 ·{' '}
              {ROLES.filter((r) => (counts[r.id] ?? 0) > 0)
                .map((r) => `${r.short}×${counts[r.id]}`)
                .join(' ')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 手绘 SVG 理想配比 vs 实际配比对比图，并标出偏离基线 ≥ 8pp 的角色 */
function IdealVsActualChart() {
  const W = 980;
  const labelW = 104;
  const deltaW = 168;
  const rowH = 46;
  const H = ROLES.length * rowH + 26;
  const chartW = W - labelW - deltaW;
  const scaleMax = 50;
  const unit = chartW / scaleMax;
  const humanTotal = TEAMS.reduce((s, t) => s + t.headcount, 0) || 1;

  const actual: Record<string, number> = {};
  ROLES.forEach((r) => {
    actual[r.id] = USERS.filter((u) => !u.isAi && u.roleId === r.id).length;
  });

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="理想角色配比与实际角色配比对比条形图，浅色为编制指引基线，深色为实际占比，右侧标注偏离百分点"
    >
      {/* 刻度 */}
      {[0, 10, 20, 30, 40, 50].map((tick) => (
        <g key={tick}>
          <line
            x1={labelW + tick * unit}
            y1={4}
            x2={labelW + tick * unit}
            y2={ROLES.length * rowH + 4}
            className="ac-tmg-axis"
          />
          <text x={labelW + tick * unit} y={H - 8} textAnchor="middle" className="ac-tmg-axis-label">
            {tick}%
          </text>
        </g>
      ))}

      {ROLES.map((r, i) => {
        const y = i * rowH + 8;
        const ideal = IDEAL_ROLE_RATIO[r.id] ?? 0;
        const realPct = Math.round(((actual[r.id] ?? 0) / humanTotal) * 1000) / 10;
        const delta = Math.round((realPct - ideal) * 10) / 10;
        const off = Math.abs(delta) >= RATIO_GAP_THRESHOLD;
        return (
          <g key={r.id}>
            <text x={0} y={y + 14} className="ac-tmg-bar-name">
              {r.name}
            </text>
            {/* 理想 */}
            <rect
              x={labelW}
              y={y}
              width={Math.max(ideal * unit, 2)}
              height={11}
              rx={3}
              fill={TONE_HEX[r.color] ?? TONE_HEX.brand}
              opacity={0.24}
            >
              <title>{`${r.name} 理想配比 ${ideal}%`}</title>
            </rect>
            {/* 实际 */}
            <rect
              x={labelW}
              y={y + 15}
              width={Math.max(realPct * unit, 2)}
              height={11}
              rx={3}
              fill={off ? TONE_HEX.danger : TONE_HEX[r.color] ?? TONE_HEX.brand}
            >
              <title>{`${r.name} 实际 ${actual[r.id]} 人 / ${humanTotal} 人 = ${realPct}%`}</title>
            </rect>
            <text x={labelW + chartW + 10} y={y + 12} className="ac-tmg-bar-value">
              理想 {ideal.toFixed(0)}% · 实际 {realPct.toFixed(1)}%
            </text>
            <text
              x={labelW + chartW + 10}
              y={y + 27}
              className={off ? 'ac-tmg-delta-text ac-tmg-delta-text--off' : 'ac-tmg-delta-text'}
            >
              {off ? '⚠ ' : ''}Δ {delta > 0 ? '+' : ''}
              {delta.toFixed(1)}pp（{actual[r.id]} 人）
              {off ? ' 失衡' : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 手绘 SVG 分组柱状图：7 个团队的承诺点数 / 实际速率，叠加完成率双轴折线 */
function GroupedBarChart({ sprintId }: { sprintId: string }) {
  const W = 980;
  const H = 320;
  const padL = 46;
  const padR = 56;
  const padT = 22;
  const padB = 58;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const rows = TEAMS.map((t) => ({ team: t, m: metricOf(t.id, sprintId) })).filter((r) => r.m) as {
    team: TeamDef;
    m: TeamMetricSnapshot;
  }[];
  const maxPoints = Math.ceil(Math.max(...rows.map((r) => Math.max(r.m.committedPoints, r.m.velocityPoints)), 10) / 10) * 10;
  const groupW = plotW / Math.max(rows.length, 1);
  const barW = Math.min(26, groupW * 0.26);
  const yPoint = (v: number) => padT + plotH - (v / maxPoints) * plotH;
  const yPct = (v: number) => padT + plotH - (Math.min(100, v) / 100) * plotH;
  const linePts = rows.map((r, i) => ({ x: padL + groupW * i + groupW / 2, y: yPct(r.m.completionRatePct), v: r.m.completionRatePct, name: r.team.name }));

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${sprintId} 各团队承诺点数与实际速率分组柱状图，叠加任务完成率折线（右轴 0~100%）`}
    >
      {/* 左轴网格 */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={padL} y1={padT + plotH * f} x2={W - padR} y2={padT + plotH * f} className="ac-tmg-axis" />
          <text x={padL - 8} y={padT + plotH * f + 4} textAnchor="end" className="ac-tmg-axis-label">
            {Math.round(maxPoints * (1 - f))}
          </text>
          <text x={W - padR + 8} y={padT + plotH * f + 4} className="ac-tmg-axis-label ac-tmg-axis-label--right">
            {Math.round(100 * (1 - f))}%
          </text>
        </g>
      ))}

      {rows.map((r, i) => {
        const gx = padL + groupW * i + groupW / 2;
        const committedH = padT + plotH - yPoint(r.m.committedPoints);
        const velocityH = padT + plotH - yPoint(r.m.velocityPoints);
        return (
          <g key={r.team.id}>
            <rect
              x={gx - barW - 3}
              y={yPoint(r.m.committedPoints)}
              width={barW}
              height={Math.max(committedH, 1)}
              rx={3}
              className="ac-tmg-bar-ghost"
            >
              <title>{`${r.team.name} 承诺 ${r.m.committedPoints} 点`}</title>
            </rect>
            <rect
              x={gx + 3}
              y={yPoint(r.m.velocityPoints)}
              width={barW}
              height={Math.max(velocityH, 1)}
              rx={3}
              fill={TONE_HEX[r.m.tone] ?? TONE_HEX.brand}
            >
              <title>{`${r.team.name} 实际 ${r.m.velocityPoints} 点 · 达成率 ${r.m.sayDoRatioPct}%`}</title>
            </rect>
            <text x={gx - barW / 2 - 3} y={yPoint(r.m.committedPoints) - 5} textAnchor="middle" className="ac-tmg-bar-num">
              {r.m.committedPoints}
            </text>
            <text x={gx + barW / 2 + 3} y={yPoint(r.m.velocityPoints) - 5} textAnchor="middle" className="ac-tmg-bar-num ac-tmg-bar-num--strong">
              {r.m.velocityPoints}
            </text>
            <text x={gx} y={H - padB + 18} textAnchor="middle" className="ac-tmg-axis-label">
              {TEAM_SHORT[r.team.id] ?? r.team.name}
            </text>
            <text x={gx} y={H - padB + 34} textAnchor="middle" className="ac-tmg-axis-sub">
              {r.m.sayDoRatioPct.toFixed(1)}%
            </text>
          </g>
        );
      })}

      {/* 完成率折线（右轴） */}
      <polyline
        points={linePts.map((p) => `${p.x},${p.y}`).join(' ')}
        className="ac-tmg-line"
        fill="none"
      />
      {linePts.map((p) => (
        <g key={p.x}>
          <circle cx={p.x} cy={p.y} r={4} className="ac-tmg-line-dot">
            <title>{`${p.name} 任务完成率 ${p.v}%`}</title>
          </circle>
          <text x={p.x} y={p.y - 10} textAnchor="middle" className="ac-tmg-line-label">
            {p.v}%
          </text>
        </g>
      ))}

      <text x={padL} y={14} className="ac-tmg-axis-title">
        故事点（左轴）
      </text>
      <text x={W - padR} y={14} textAnchor="end" className="ac-tmg-axis-title">
        任务完成率（右轴）
      </text>
    </svg>
  );
}

/** 手绘 SVG 单指标跨迭代趋势折线 */
function TrendLineChart({ teamId, def }: { teamId: string; def: MetricDef }) {
  const W = 980;
  const H = 232;
  const padL = 58;
  const padR = 40;
  const padT = 24;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const pts = METRIC_SPRINT_IDS.map((sid) => ({ sid, m: metricOf(teamId, sid) })).filter((p) => p.m) as {
    sid: string;
    m: TeamMetricSnapshot;
  }[];
  const values = pts.map((p) => p.m[def.key]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || Math.max(rawMax * 0.2, 1);
  const lo = Math.max(0, rawMin - span * 0.35);
  const hi = rawMax + span * 0.35;
  const x = (i: number) => padL + (plotW / Math.max(pts.length - 1, 1)) * i;
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const last = values[values.length - 1];
  const first = values[0];
  const delta = Math.round((last - first) * 100) / 100;
  const good = def.betterUp ? delta > 0 : delta < 0;

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${TEAM_SHORT[teamId] ?? teamId} 的${def.label}跨 ${METRIC_SPRINT_IDS.join(' / ')} 趋势折线图`}
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={padL} y1={padT + plotH * f} x2={W - padR} y2={padT + plotH * f} className="ac-tmg-axis" />
          <text x={padL - 10} y={padT + plotH * f + 4} textAnchor="end" className="ac-tmg-axis-label">
            {(hi - (hi - lo) * f).toFixed(def.digits)}
          </text>
        </g>
      ))}
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className="ac-tmg-line" fill="none" />
      <polygon
        points={`${x(0)},${padT + plotH} ${values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} ${x(values.length - 1)},${padT + plotH}`}
        className="ac-tmg-area"
      />
      {values.map((v, i) => (
        <g key={pts[i].sid}>
          <circle cx={x(i)} cy={y(v)} r={5} className="ac-tmg-line-dot">
            <title>{`${pts[i].sid} ${def.label} ${v.toFixed(def.digits)}${def.unit}`}</title>
          </circle>
          <text x={x(i)} y={y(v) - 13} textAnchor="middle" className="ac-tmg-line-label">
            {v.toFixed(def.digits)}
            {def.unit === '%' ? '%' : ''}
          </text>
          <text x={x(i)} y={H - padB + 20} textAnchor="middle" className="ac-tmg-axis-label">
            {pts[i].sid}
          </text>
          <text x={x(i)} y={H - padB + 35} textAnchor="middle" className="ac-tmg-axis-sub">
            {SPRINTS.filter((s) => s.id === pts[i].sid)[0]?.theme ?? ''}
          </text>
        </g>
      ))}
      <text x={padL} y={15} className="ac-tmg-axis-title">
        {def.label}（{def.unit}）· 三期累计 {delta > 0 ? '+' : ''}
        {delta.toFixed(def.digits)} {good ? '↗ 向好' : delta === 0 ? '→ 持平' : '↘ 转差'}
      </text>
    </svg>
  );
}

/** 迷你走势图（6 项指标一览） */
function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  const W = 116;
  const H = 34;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => {
    const x = 4 + ((W - 8) / Math.max(values.length - 1, 1)) * i;
    const y = H - 5 - ((v - lo) / span) * (H - 12);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="三期迷你走势">
      <polyline points={pts.join(' ')} fill="none" stroke={TONE_HEX[tone] ?? TONE_HEX.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r={2.8} fill={TONE_HEX[tone] ?? TONE_HEX.brand} />
    </svg>
  );
}

/** 手绘 SVG 6 维能力雷达图（当期 vs 上期两层多边形） */
function RadarChart({ teamId, sprintId }: { teamId: string; sprintId: string }) {
  const W = 400;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 108;
  const idx = METRIC_SPRINT_IDS.indexOf(sprintId);
  const prevId = idx > 0 ? METRIC_SPRINT_IDS[idx - 1] : null;
  const cur = metricOf(teamId, sprintId);
  const prev = prevId ? metricOf(teamId, prevId) : undefined;
  const curVals = cur ? radarScores(cur) : [];
  const prevVals = prev ? radarScores(prev) : [];

  const pointAt = (dimIdx: number, value: number) => {
    const angle = (Math.PI * 2 * dimIdx) / RADAR_DIMS.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value)) / 100) * R;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };
  const poly = (vals: number[]) => vals.map((v, i) => { const p = pointAt(i, v); return `${p.x},${p.y}`; }).join(' ');

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${TEAM_SHORT[teamId] ?? teamId} 的 6 维能力雷达图，实线为 ${sprintId}，虚线为${prevId ?? '无上一迭代'}`}
    >
      {[25, 50, 75, 100].map((ring) => (
        <polygon
          key={ring}
          points={RADAR_DIMS.map((_, i) => { const p = pointAt(i, ring); return `${p.x},${p.y}`; }).join(' ')}
          className="ac-tmg-radar-ring"
          fill="none"
        />
      ))}
      {RADAR_DIMS.map((d, i) => {
        const p = pointAt(i, 100);
        const lp = pointAt(i, 126);
        return (
          <g key={d.label}>
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} className="ac-tmg-radar-spoke" />
            <text
              x={lp.x}
              y={lp.y + 4}
              textAnchor={Math.abs(lp.x - cx) < 12 ? 'middle' : lp.x > cx ? 'start' : 'end'}
              className="ac-tmg-radar-label"
            >
              {d.label}
            </text>
            {curVals.length > 0 && (
              <text
                x={lp.x}
                y={lp.y + 18}
                textAnchor={Math.abs(lp.x - cx) < 12 ? 'middle' : lp.x > cx ? 'start' : 'end'}
                className="ac-tmg-radar-value"
              >
                {curVals[i]}
              </text>
            )}
          </g>
        );
      })}
      {prevVals.length > 0 && (
        <polygon points={poly(prevVals)} className="ac-tmg-radar-prev" fill={TONE_HEX.neutral} fillOpacity={0.12} />
      )}
      {curVals.length > 0 && (
        <polygon points={poly(curVals)} className="ac-tmg-radar-cur" fill={TONE_HEX.brand} fillOpacity={0.2} />
      )}
      {curVals.map((v, i) => {
        const p = pointAt(i, v);
        return <circle key={RADAR_DIMS[i].label} cx={p.x} cy={p.y} r={3.4} fill={TONE_HEX.brand} />;
      })}
    </svg>
  );
}

/** 手绘 SVG 协作关系图：7 个团队节点 + 8 条有向边（边宽 = itemCount，边色 = health） */
function CollabGraph({
  selectedTeamId,
  onSelect,
  healthById,
}: {
  selectedTeamId: string;
  onSelect: (id: string) => void;
  healthById: Record<string, TeamCollabDef['health']>;
}) {
  const W = 880;
  const H = 540;
  const cx = 440;
  const cy = 268;
  const R = 182;
  const pos = TEAMS.map((t, i) => {
    const angle = (Math.PI * 2 * i) / TEAMS.length - Math.PI / 2;
    return { team: t, x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle), angle };
  });
  const byId = pos.reduce<Record<string, (typeof pos)[number]>>((acc, p) => {
    acc[p.team.id] = p;
    return acc;
  }, {});
  const maxItem = Math.max(...TEAM_COLLABS.map((c) => c.itemCount), 1);

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="7 个团队与 8 条跨团队协作关系的有向关系图，边宽表示协作事项数，颜色表示健康度，虚线表示存在阻塞"
    >
      <defs>
        {(['ok', 'warn', 'risk'] as const).map((h) => (
          <marker
            key={h}
            id={`ac-tmg-arrow-${h}`}
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={7}
            markerHeight={7}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={HEALTH_META[h].hex} />
          </marker>
        ))}
      </defs>

      {/* 边 */}
      {TEAM_COLLABS.map((c) => {
        const from = byId[c.fromTeamId];
        const to = byId[c.toTeamId];
        if (!from || !to) return null;
        const health = healthById[c.id] ?? c.health;
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        /* 把控制点朝圆心方向拉近，避免弦线穿过其它节点 */
        const qx = mx + (cx - mx) * 0.34;
        const qy = my + (cy - my) * 0.34;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const rTo = 26 + (to.team.headcount ?? 1) * 4 + 8;
        const ex = to.x - (dx / len) * rTo;
        const ey = to.y - (dy / len) * rTo;
        const width = 1.4 + (c.itemCount / maxItem) * 3.6;
        const touched = selectedTeamId === c.fromTeamId || selectedTeamId === c.toTeamId;
        return (
          <g key={c.id} opacity={touched ? 1 : 0.55}>
            <path
              d={`M ${from.x} ${from.y} Q ${qx} ${qy} ${ex} ${ey}`}
              fill="none"
              stroke={HEALTH_META[health].hex}
              strokeWidth={width}
              strokeDasharray={c.blockedCount > 0 ? '7 4' : undefined}
              markerEnd={`url(#ac-tmg-arrow-${health})`}
            >
              <title>{`${c.id} ${c.fromTeamId} → ${c.toTeamId} · ${c.collabType} · ${c.itemCount} 项 · 等待 ${c.avgWaitHours}h / SLA ${c.slaHours}h · 阻塞 ${c.blockedCount}`}</title>
            </path>
            <text x={qx} y={qy - 4} textAnchor="middle" className="ac-tmg-graph-edge">
              {c.itemCount}
            </text>
            {c.blockedCount > 0 && (
              <g>
                <circle cx={qx} cy={qy + 12} r={9} fill={TONE_HEX.danger} />
                <text x={qx} y={qy + 16} textAnchor="middle" className="ac-tmg-graph-badge">
                  {c.blockedCount}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 节点 */}
      {pos.map((p) => {
        const r = 26 + p.team.headcount * 4;
        const active = p.team.id === selectedTeamId;
        const summary = collabSummary(p.team.id);
        return (
          <g
            key={p.team.id}
            className="ac-tmg-tree-node"
            onClick={() => onSelect(p.team.id)}
            role="button"
            aria-label={`选中团队 ${p.team.name}`}
          >
            <title>{`${p.team.name}（${p.team.id}）· 编制 ${p.team.headcount} 人 · 协作 ${summary.total} 条（健康 ${summary.ok} / 预警 ${summary.warn} / 阻塞 ${summary.risk}）`}</title>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={TONE_HEX[p.team.tone] ?? TONE_HEX.brand}
              stroke={active ? TONE_HEX.brand : '#fff'}
              strokeWidth={active ? 4 : 2.5}
              opacity={active ? 1 : 0.9}
            />
            <text x={p.x} y={p.y + 1} textAnchor="middle" className="ac-tmg-graph-name">
              {TEAM_SHORT[p.team.id] ?? p.team.name}
            </text>
            <text x={p.x} y={p.y + 15} textAnchor="middle" className="ac-tmg-graph-sub">
              {p.team.headcount} 人
            </text>
            {summary.blocked > 0 && (
              <g>
                <circle cx={p.x + r * 0.76} cy={p.y - r * 0.76} r={9} fill={TONE_HEX.danger} stroke="#fff" strokeWidth={1.5} />
                <text x={p.x + r * 0.76} y={p.y - r * 0.76 + 4} textAnchor="middle" className="ac-tmg-graph-badge">
                  {summary.blocked}
                </text>
              </g>
            )}
          </g>
        );
      })}

      <text x={cx} y={H - 12} textAnchor="middle" className="ac-tmg-tree-caption">
        静态环形布局（非实时力导向）· 边宽 = itemCount · 边色 = health（绿健康 / 橙预警 / 红阻塞）· 虚线与红色角标 = blockedCount &gt; 0
      </text>
    </svg>
  );
}

/** 手绘 SVG 仪式出席率与行动项关闭率分组条形图 */
function CeremonyBarChart() {
  const W = 980;
  const H = 260;
  const padL = 44;
  const padR = 20;
  const padT = 24;
  const padB = 54;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const groupW = plotW / CEREMONIES.length;
  const barW = Math.min(22, groupW * 0.24);
  const y = (v: number) => padT + plotH - (v / 100) * plotH;

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="6 个研发仪式的出席率与行动项关闭率分组条形图，纵轴 0 到 100%"
    >
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line x1={padL} y1={y(tick)} x2={W - padR} y2={y(tick)} className="ac-tmg-axis" />
          <text x={padL - 8} y={y(tick) + 4} textAnchor="end" className="ac-tmg-axis-label">
            {tick}%
          </text>
        </g>
      ))}
      {CEREMONIES.map((c, i) => {
        const gx = padL + groupW * i + groupW / 2;
        return (
          <g key={c.id}>
            <rect x={gx - barW - 3} y={y(c.attendanceRatePct)} width={barW} height={padT + plotH - y(c.attendanceRatePct)} rx={3} fill={TONE_HEX.info}>
              <title>{`${c.name} 出席率 ${c.attendanceRatePct}%`}</title>
            </rect>
            <rect
              x={gx + 3}
              y={y(c.actionItemCloseRatePct)}
              width={barW}
              height={padT + plotH - y(c.actionItemCloseRatePct)}
              rx={3}
              fill={c.actionItemCloseRatePct >= 85 ? TONE_HEX.ok : c.actionItemCloseRatePct >= 75 ? TONE_HEX.warn : TONE_HEX.danger}
            >
              <title>{`${c.name} 行动项关闭率 ${c.actionItemCloseRatePct}%`}</title>
            </rect>
            <text x={gx - barW / 2 - 3} y={y(c.attendanceRatePct) - 5} textAnchor="middle" className="ac-tmg-bar-num">
              {c.attendanceRatePct}
            </text>
            <text x={gx + barW / 2 + 3} y={y(c.actionItemCloseRatePct) - 5} textAnchor="middle" className="ac-tmg-bar-num ac-tmg-bar-num--strong">
              {c.actionItemCloseRatePct}
            </text>
            <text x={gx} y={H - padB + 18} textAnchor="middle" className="ac-tmg-axis-label">
              {c.name}
            </text>
            <text x={gx} y={H - padB + 34} textAnchor="middle" className="ac-tmg-axis-sub">
              {AI_ASSIST_META[c.aiAssist].label} · {c.durationMin}min
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 手绘 SVG AI 仪式提效矩阵：X = AI 介入程度，Y = 行动项关闭率，四象限 */
function CeremonyMatrix({ onPick }: { onPick: (id: string) => void }) {
  const W = 680;
  const H = 400;
  const padL = 62;
  const padR = 26;
  const padT = 26;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yMin = 50;
  const yMax = 100;
  const xSplit = 1.5;
  const ySplit = 80;
  const x = (level: number) => padL + (level / 3) * plotW;
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const QUAD = [
    { key: 'lt', x0: padL, y0: padT, x1: x(xSplit), y1: y(ySplit), label: '低 AI × 高闭环', hint: '可自动化增量', tone: TONE_HEX.info },
    { key: 'rt', x0: x(xSplit), y0: padT, x1: W - padR, y1: y(ySplit), label: 'AI 全流程 × 高闭环', hint: '标杆区', tone: TONE_HEX.ok },
    { key: 'lb', x0: padL, y0: y(ySplit), x1: x(xSplit), y1: padT + plotH, label: '低 AI × 低闭环', hint: '优先改造', tone: TONE_HEX.danger },
    { key: 'rb', x0: x(xSplit), y0: y(ySplit), x1: W - padR, y1: padT + plotH, label: 'AI 已介入 × 低闭环', hint: '流程问题', tone: TONE_HEX.warn },
  ];

  return (
    <svg
      className="ac-tmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="6 个研发仪式在「AI 介入程度 × 行动项关闭率」坐标系中的四象限散点图"
    >
      {QUAD.map((q) => (
        <g key={q.key}>
          <rect x={q.x0} y={q.y0} width={q.x1 - q.x0} height={q.y1 - q.y0} fill={q.tone} opacity={0.06} />
          <text x={q.x0 + 8} y={q.y0 + 16} className="ac-tmg-quad-label" fill={q.tone}>
            {q.label}
          </text>
          <text x={q.x0 + 8} y={q.y0 + 30} className="ac-tmg-quad-hint">
            {q.hint}
          </text>
        </g>
      ))}

      {[yMin, 60, 70, 80, 90, 100].map((tick) => (
        <g key={tick}>
          <line x1={padL} y1={y(tick)} x2={W - padR} y2={y(tick)} className={tick === ySplit ? 'ac-tmg-split' : 'ac-tmg-axis'} />
          <text x={padL - 8} y={y(tick) + 4} textAnchor="end" className="ac-tmg-axis-label">
            {tick}%
          </text>
        </g>
      ))}
      {[0, 1, 2, 3].map((level) => (
        <g key={level}>
          <line x1={x(level)} y1={padT} x2={x(level)} y2={padT + plotH} className={level === 1 ? 'ac-tmg-split-v' : 'ac-tmg-axis'} />
          <text x={x(level)} y={H - padB + 18} textAnchor="middle" className="ac-tmg-axis-label">
            {['none', 'summary', 'agenda', 'full'][level]}
          </text>
          <text x={x(level)} y={H - padB + 33} textAnchor="middle" className="ac-tmg-axis-sub">
            {AI_ASSIST_META[(['none', 'summary', 'agenda', 'full'] as const)[level]].label}
          </text>
        </g>
      ))}

      {CEREMONIES.map((c, i) => {
        const level = AI_ASSIST_META[c.aiAssist].level;
        /* 同等级多点做纵向微偏移，避免完全重叠 */
        const sameLevel = CEREMONIES.filter((o) => AI_ASSIST_META[o.aiAssist].level === level);
        const orderInLevel = sameLevel.findIndex((o) => o.id === c.id);
        const px = x(level) + (orderInLevel - (sameLevel.length - 1) / 2) * 26;
        const py = y(c.actionItemCloseRatePct);
        const color = TONE_HEX[c.tone] ?? TONE_HEX.brand;
        return (
          <g key={c.id} className="ac-tmg-tree-node" onClick={() => onPick(c.id)} role="button" aria-label={`查看 ${c.name} 的提效方案`}>
            <title>{`${c.name} · AI 介入 ${AI_ASSIST_META[c.aiAssist].label} · 行动项关闭率 ${c.actionItemCloseRatePct}% · 出席率 ${c.attendanceRatePct}%`}</title>
            <circle cx={px} cy={py} r={13} fill={color} opacity={0.9} />
            <text x={px} y={py + 4} textAnchor="middle" className="ac-tmg-matrix-idx">
              {i + 1}
            </text>
            <text x={px} y={py - 19} textAnchor="middle" className="ac-tmg-matrix-name">
              {c.name}
            </text>
          </g>
        );
      })}

      <text x={padL - 46} y={padT - 10} className="ac-tmg-axis-title">
        行动项关闭率
      </text>
      <text x={W - padR} y={H - 8} textAnchor="end" className="ac-tmg-axis-title">
        AI 介入程度 →
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ 页面 */

type TeamSortKey = 'name' | 'headcount' | 'avgSeniority' | 'committed' | 'velocity' | 'sayDo' | 'tech';

/** 「录入团队」表单值；只存在于页面 useState，不回写 data-mgmt */
interface CreateForm {
  name: string;
  leaderId: string;
  memberIds: string[];
  mission: string;
  establishedAt: string;
  techStack: string[];
  ownedComponentIds: string[];
  currentSprintIds: string[];
}

const EMPTY_FORM: CreateForm = {
  name: '',
  leaderId: '',
  memberIds: [],
  mission: '',
  establishedAt: '',
  techStack: [],
  ownedComponentIds: [],
  currentSprintIds: [],
};

/** 新团队配色：按负责人 roleId 确定性映射（取值均在 Tone 的 12 个合法值内） */
const ROLE_TONE: Record<string, Tone> = {
  manager: 'brand',
  product: 'ai',
  architect: 'indigo',
  developer: 'info',
  tester: 'amber',
  ops: 'warn',
  pmo: 'pink',
};

/** AI 推导技术栈：关键词命中即对齐该既有团队的 techStack（自上而下优先匹配） */
const STACK_RULES: { keys: string[]; teamId: string }[] = [
  { keys: ['前端', '页面', '体验', '界面', 'ui', 'vue'], teamId: 'TEAM-02' },
  { keys: ['测试', '质量', '用例', '缺陷', '门禁', '回归'], teamId: 'TEAM-05' },
  { keys: ['架构', '平台', '治理', '契约', '选型', '限界上下文'], teamId: 'TEAM-04' },
  { keys: ['订单', '交易', '履约', '优惠', '后端', '接口', '数据库'], teamId: 'TEAM-01' },
  { keys: ['运维', '发布', '流水线', '观测', '环境', '部署', 'ci'], teamId: 'TEAM-06' },
  { keys: ['产品', '需求', '规划', '优先级', 'prd'], teamId: 'TEAM-03' },
  { keys: ['排期', '项目', '里程碑', '风险', '资源', 'pmo'], teamId: 'TEAM-07' },
];

/** AI 推导承接组件时用于加分的业务关键词（与 ARCH_COMPONENTS 的 name / desc 对照） */
const COMP_KEYWORDS: string[] = [
  '订单', '查询', '履约', '优惠', '拆单', '迁移', '缓存', '事件', '脱敏', '审计', '状态机', '幂等', '消息', '分片', '网关',
];

/** 编制建议的归属智能体：取 ./data agents 的真实条目（ag-ba · 模型 mdl-deepseek），不自行编造 id */
const ORG_AI_AGENT = agents.filter((a) => a.id === 'ag-ba')[0];

export default function TeamPage() {
  const [tab, setTab] = useState<TabId>('org');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('TEAM-01');
  const [sprintId, setSprintId] = useState<string>('SP-24');
  const [trendKey, setTrendKey] = useState<NumericMetricKey>('velocityPoints');
  const [drawerTeam, setDrawerTeam] = useState<TeamDef | null>(null);
  const [sort, setSort] = useState<{ key: TeamSortKey; dir: 'asc' | 'desc' }>({ key: 'sayDo', dir: 'asc' });

  /* ---- 协作建议的本地乐观更新（采纳 / 转派 / 驳回） ---- */
  const [collabState, setCollabState] = useState<
    Record<string, { decision: 'adopted' | 'reassigned' | 'rejected'; health: TeamCollabDef['health'] }>
  >({});
  const [collabFeedback, setCollabFeedback] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);

  /* ---- 仪式演示区块 ---- */
  const [demoCeremonyId, setDemoCeremonyId] = useState<string>('CER-04');
  const [demoFeedback, setDemoFeedback] = useState<{ tone: 'ok' | 'ai'; text: string } | null>(null);

  /* ---- 录入团队（本地草稿态，不回写 data-mgmt） ---- */
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<TeamDef[]>([]);
  const [createNote, setCreateNote] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  /** 成员已归属其它团队的软提示，不阻断提交 */
  const [softWarn, setSoftWarn] = useState<string | null>(null);

  /** 既有 7 个团队 + 本次会话录入的团队（仅本地） */
  const allTeams = useMemo(() => [...TEAMS, ...created], [created]);

  const selectedTeam = TEAMS.filter((t) => t.id === selectedTeamId)[0] ?? TEAMS[0];
  const trendDef = METRIC_DEFS.filter((d) => d.key === trendKey)[0] ?? METRIC_DEFS[0];

  /* ---- 编制汇总 ---- */
  const orgStats = useMemo(() => {
    const humanTotal = allTeams.reduce((s, t) => s + t.headcount, 0);
    const aiTotal = USERS.filter((u) => u.isAi).length;
    const weightedSeniority =
      allTeams.reduce((s, t) => s + t.avgSeniority * t.headcount, 0) / Math.max(humanTotal, 1);
    const simpleSeniority = allTeams.reduce((s, t) => s + t.avgSeniority, 0) / Math.max(allTeams.length, 1);
    const stacks = new Set<string>();
    const components = new Set<string>();
    allTeams.forEach((t) => {
      t.techStack.forEach((s) => stacks.add(s));
      t.ownedComponentIds.forEach((c) => components.add(c));
    });
    const soloTeams = allTeams.filter((t) => t.headcount === 1).length;
    const singleRoleTeams = allTeams.filter((t) => {
      const counts = roleCountOf(t);
      return Object.keys(counts).filter((k) => counts[k] > 0).length <= 1;
    }).length;
    return {
      humanTotal,
      aiTotal,
      weightedSeniority,
      simpleSeniority,
      stackCount: stacks.size,
      componentCount: components.size,
      soloTeams,
      singleRoleTeams,
    };
  }, [allTeams]);

  /* ---- 角色配比实际值 ---- */
  const roleActual = useMemo(() => {
    const acc: Record<string, number> = {};
    ROLES.forEach((r) => {
      acc[r.id] = USERS.filter((u) => !u.isAi && u.roleId === r.id).length;
    });
    return acc;
  }, []);

  const ratioGaps = useMemo(
    () =>
      ROLES.map((r) => {
        const realPct = Math.round((roleActual[r.id] / Math.max(orgStats.humanTotal, 1)) * 1000) / 10;
        const ideal = IDEAL_ROLE_RATIO[r.id] ?? 0;
        return { role: r, ideal, realPct, delta: Math.round((realPct - ideal) * 10) / 10, off: Math.abs(realPct - ideal) >= RATIO_GAP_THRESHOLD };
      }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    [roleActual, orgStats.humanTotal],
  );

  /* ---- 团队详情表（排序） ---- */
  const teamRows = useMemo(() => {
    const rows = allTeams.map((t) => {
      const m = metricOf(t.id, 'SP-24');
      return {
        team: t,
        leader: USER_MAP[t.leaderId],
        hasMetric: Boolean(m),
        committed: m?.committedPoints ?? 0,
        velocity: m?.velocityPoints ?? 0,
        sayDo: m?.sayDoRatioPct ?? 0,
        collab: collabSummary(t.id),
      };
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.team.name.localeCompare(b.team.name, 'zh-CN') * dir;
        case 'headcount':
          return (a.team.headcount - b.team.headcount) * dir;
        case 'avgSeniority':
          return (a.team.avgSeniority - b.team.avgSeniority) * dir;
        case 'tech':
          return (a.team.techStack.length - b.team.techStack.length) * dir;
        case 'committed':
          return (a.committed - b.committed) * dir;
        case 'velocity':
          return (a.velocity - b.velocity) * dir;
        default:
          return (a.sayDo - b.sayDo) * dir;
      }
    });
  }, [sort, allTeams]);

  /* ---- 效能表数据 ---- */
  const metricRows = useMemo(
    () =>
      TEAMS.map((t) => {
        const m = metricOf(t.id, sprintId);
        if (!m) return null;
        const d = deltaOf(t.id, sprintId, 'sayDoRatioPct');
        return { team: t, m, delta: d, grade: gradeOf(m) };
      }).filter(Boolean) as { team: TeamDef; m: TeamMetricSnapshot; delta: number | null; grade: { label: string; tone: Tone } }[],
    [sprintId],
  );

  const sprintTotals = useMemo(() => {
    const rows = TEAM_METRICS.filter((m) => m.sprintId === sprintId);
    const committed = rows.reduce((s, m) => s + m.committedPoints, 0);
    const velocity = rows.reduce((s, m) => s + m.velocityPoints, 0);
    const sprint = SPRINTS.filter((s) => s.id === sprintId)[0];
    return {
      committed,
      velocity,
      sayDo: committed > 0 ? Math.round((velocity / committed) * 1000) / 10 : 0,
      defect: rows.reduce((s, m) => s + m.defectDensity, 0) / Math.max(rows.length, 1),
      ai: rows.reduce((s, m) => s + m.aiAdoptionPct, 0) / Math.max(rows.length, 1),
      dangerTeams: rows.filter((m) => m.tone === 'danger').length,
      sprint,
    };
  }, [sprintId]);

  /** 团队诊断：本次会话录入的团队没有 TEAM_METRICS 快照，降级为「暂无效能快照」而非报错 */
  const diagnoses = useMemo(
    () =>
      allTeams.map((t) => ({
        team: t,
        d: TEAM_BY_ID[t.id]
          ? buildDiagnosis(t.id)
          : {
              headline: '暂无效能快照',
              evidence: `${t.id} 为本次会话录入的本地草稿团队，TEAM_METRICS 中尚无 SP-22 / SP-23 / SP-24 三期快照，诊断所需数值无法插值；现有口径为编制 ${t.headcount} 人、平均职级 P${t.avgSeniority.toFixed(1)}、承接架构组件 ${t.ownedComponentIds.length} 个。`,
              action: `待所属迭代（${t.currentSprintIds[0] ?? CURRENT_SPRINT.id}）收口后生成首个效能快照，再由 ag-ba 重跑诊断。`,
              tone: 'neutral' as Tone,
            },
      })),
    [allTeams],
  );

  /** 各迭代的组织级 AI 采纳率均值（7 个团队简单平均），用于指标卡的三期对比文案 */
  const orgAiBySprint = useMemo(() => {
    const acc: Record<string, number> = {};
    METRIC_SPRINT_IDS.forEach((sid) => {
      const rows = TEAM_METRICS.filter((m) => m.sprintId === sid);
      acc[sid] = rows.reduce((s, m) => s + m.aiAdoptionPct, 0) / Math.max(rows.length, 1);
    });
    return acc;
  }, []);

  /* ---- 协作：应用本地覆盖后的健康度 ---- */
  const healthById = useMemo(() => {
    const acc: Record<string, TeamCollabDef['health']> = {};
    TEAM_COLLABS.forEach((c) => {
      acc[c.id] = collabState[c.id]?.health ?? c.health;
    });
    return acc;
  }, [collabState]);

  const blockedCollabs = useMemo(
    () => [...TEAM_COLLABS].filter((c) => c.blockedCount > 0).sort((a, b) => b.blockedCount - a.blockedCount || b.avgWaitHours - a.avgWaitHours),
    [],
  );

  const upgradeHealth = (h: TeamCollabDef['health']): TeamCollabDef['health'] =>
    h === 'risk' ? 'warn' : h === 'warn' ? 'ok' : 'ok';

  const decideCollab = (c: TeamCollabDef, decision: 'adopted' | 'reassigned' | 'rejected') => {
    const current = healthById[c.id];
    const next = decision === 'adopted' ? upgradeHealth(current) : current;
    setCollabState((prev) => ({ ...prev, [c.id]: { decision, health: next } }));
    const from = TEAM_MAP_NAME[c.fromTeamId];
    const to = TEAM_MAP_NAME[c.toTeamId];
    if (decision === 'adopted') {
      setCollabFeedback({
        tone: next === 'ok' ? 'ok' : 'warn',
        text: `已采纳 ${c.id}（${from} → ${to}）的 AI 优化建议：健康度由「${HEALTH_META[current].label}」本地升级为「${HEALTH_META[next].label}」，并已在协作看板挂出跟踪项；实际生效需 ${to} 负责人在 SLA ${c.slaHours}h 内确认。`,
      });
    } else if (decision === 'reassigned') {
      setCollabFeedback({
        tone: 'warn',
        text: `${c.id}（${from} → ${to}）已转派：升级层级由研发总监提升至指导委员会（SH-07），等待时长 ${c.avgWaitHours}h 继续计时，健康度维持「${HEALTH_META[current].label}」直至新责任人给出时限承诺。`,
      });
    } else {
      setCollabFeedback({
        tone: 'danger',
        text: `已驳回 ${c.id}（${from} → ${to}）的 AI 建议，健康度维持「${HEALTH_META[current].label}」；驳回理由将回写 ag-ba 的建议质量评估，连续 3 次驳回后该类建议不再自动推送。`,
      });
    }
  };

  /* ---- 仪式：AI 议程 / 纪要生成 ---- */
  const demoCeremony = CEREMONIES.filter((c) => c.id === demoCeremonyId)[0] ?? CEREMONIES[0];
  const demoAgenda = useMemo(() => buildAgenda(demoCeremony), [demoCeremony]);
  const demoMinutes = useMemo(() => buildMinutes(demoCeremony), [demoCeremony]);

  /* ---- 录入团队：可选项 ---- */
  const leaderOptions = useMemo<FieldOption[]>(
    () => USERS.filter((u) => !u.isAi).map((u) => ({ value: u.id, label: `${u.name} · ${u.title}` })),
    [],
  );
  const memberOptions = useMemo<FieldOption[]>(
    () => USERS.filter((u) => !u.isAi).map((u) => ({ value: u.id, label: `${u.name}（${u.title}）` })),
    [],
  );
  const stackOptions = useMemo<FieldOption[]>(
    () => Array.from(new Set(TEAMS.flatMap((t) => t.techStack))).map((s) => ({ value: s, label: s })),
    [],
  );
  const componentOptions = useMemo<FieldOption[]>(
    () => ARCH_COMPONENTS.map((c) => ({ value: c.id, label: c.name, title: `${c.id} · ${c.desc}` })),
    [],
  );
  const sprintOptions = useMemo<FieldOption[]>(
    () => SPRINTS.map((s) => ({ value: s.id, label: `${s.name}（${s.statusLabel}）` })),
    [],
  );

  /** 下一个可用团队编号：既有 7 个 + 本次已录入的，首个新建为 TEAM-08 */
  const nextTeamId = `TEAM-${String(TEAMS.length + created.length + 1).padStart(2, '0')}`;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setAiDraft(null);
    setSoftWarn(null);
    setCreateOpen(true);
  };

  const patchForm = (patch: Partial<CreateForm>) => setForm((prev) => ({ ...prev, ...patch }));

  /** 负责人 / 成员联动：负责人自动计入编制；同时给出跨团队兼岗软提示（不阻断提交） */
  const applyMembers = (leaderId: string, picked: string[]) => {
    const memberIds = leaderId && !picked.includes(leaderId) ? [leaderId, ...picked] : picked;
    const dup = memberIds
      .map((id) => {
        const owner = TEAMS.filter((t) => t.memberIds.includes(id))[0];
        return owner ? `${USER_MAP[id]?.name ?? id}（${owner.name}）` : null;
      })
      .filter(Boolean) as string[];
    setForm((prev) => ({ ...prev, leaderId, memberIds }));
    setSoftWarn(
      dup.length > 0
        ? `以下成员已归属其它团队：${dup.join('、')}。本组织为扁平一级团队结构，跨团队兼岗会导致编制重复计数，建议先与原团队负责人确认。`
        : null,
    );
  };

  /** 提交前全量校验，返回 {} 表示可提交 */
  const validateCreate = (f: CreateForm, teams: TeamDef[]) => {
    const name = f.name.trim();
    const mission = f.mission.trim();
    const raw: Record<string, string | undefined> = {
      name: requireText(name, '团队名称'),
      leaderId: f.leaderId ? '' : '请选择团队负责人',
      mission: requireText(mission, '团队使命'),
      establishedAt: f.establishedAt ? '' : '请选择成立日期',
      memberIds: f.memberIds.length >= 1 ? '' : '请至少选择 1 名团队成员',
    };
    if (!raw.name && teams.some((t) => t.name === name)) raw.name = `团队「${name}」已存在`;
    if (!raw.mission && mission.length < 10) raw.mission = '团队使命过短，请补充负责的领域与保障目标';
    if (!raw.establishedAt && f.establishedAt > TODAY) raw.establishedAt = `成立日期不得晚于今日 ${TODAY}`;
    return cleanErrors(raw);
  };

  /** AI 生成编制建议：全部为确定性规则匹配（关键词 / 频次众数 / 相关度打分），不使用随机数 */
  const runAiDraft = () => {
    const name = form.name.trim();
    const mission = form.mission.trim();
    if (!name && !mission) {
      setErrors((prev) => ({ ...prev, ai: '请先填写团队名称与使命' }));
      setAiDraft(null);
      return;
    }
    setErrors((prev) => {
      if (!prev.ai) return prev;
      const next = { ...prev };
      delete next.ai;
      return next;
    });
    const text = `${name} ${mission}`.toLowerCase();
    const hitKeys = (keys: string[]) => keys.filter((k) => text.includes(k));

    /* ① 技术栈：命中职能关键词则对齐该既有团队的栈，否则取 7 个团队栈的频次众数 Top3 */
    const rule = STACK_RULES.filter((r) => hitKeys(r.keys).length > 0)[0];
    let stack = form.techStack;
    let stackWhy = '沿用表单已选的技术栈';
    if (stack.length === 0) {
      if (rule) {
        const src = TEAM_BY_ID[rule.teamId];
        stack = src.techStack;
        stackWhy = `使命 / 名称命中关键词「${hitKeys(rule.keys)[0]}」，对齐既有 ${src.name}（${src.id}）的 techStack`;
      } else {
        const freq = new Map<string, number>();
        TEAMS.forEach((t) => t.techStack.forEach((s) => freq.set(s, (freq.get(s) ?? 0) + 1)));
        stack = Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
          .slice(0, 3)
          .map(([s]) => s);
        stackWhy = `未命中任何职能关键词，改取既有 ${TEAMS.length} 个团队 techStack 的出现频次众数 Top3`;
      }
    }

    /* ② 承接组件：优先在「当前未被任何既有团队持有」的组件里按相关度打分取 Top3 */
    const free = ARCH_COMPONENTS.filter((c) => !TEAMS.some((t) => t.ownedComponentIds.includes(c.id)));
    const pool = free.length > 0 ? free : ARCH_COMPONENTS;
    const stackLow = stack.map((s) => s.toLowerCase());
    const comps =
      form.ownedComponentIds.length > 0
        ? form.ownedComponentIds
        : pool
            .map((c, i) => {
              const hay = `${c.name} ${c.tech} ${c.desc} ${c.repo}`.toLowerCase();
              let score = 0;
              stackLow.forEach((s) => {
                const head = s.split(' ')[0];
                if (hay.includes(s)) score += 3;
                else if (head.length > 2 && hay.includes(head)) score += 1;
              });
              COMP_KEYWORDS.forEach((k) => {
                if (text.includes(k) && (c.name.includes(k) || c.desc.includes(k))) score += 2;
              });
              return { id: c.id, score, i };
            })
            .sort((a, b) => b.score - a.score || a.i - b.i)
            .slice(0, 3)
            .map((x) => x.id);
    const compWhy =
      form.ownedComponentIds.length > 0
        ? '沿用表单已选的承接组件'
        : free.length > 0
          ? `ARCH_COMPONENTS 中有 ${free.length} 个组件尚未被任何既有团队持有，从中按 techStack 与使命关键词的相关度打分取 Top3`
          : `ARCH_COMPONENTS 的 ${ARCH_COMPONENTS.length} 个组件已全部被既有 ${TEAMS.length} 个团队持有，故在全集内按 techStack 与使命关键词的相关度打分取 Top3`;
    const heldText = comps
      .map((cid) => {
        const owners = TEAMS.filter((t) => t.ownedComponentIds.includes(cid)).map((t) => t.name);
        return owners.length > 0 ? `${ARCH_COMPONENT_MAP[cid]?.name ?? cid}（现由 ${owners.join(' / ')} 持有）` : null;
      })
      .filter(Boolean) as string[];
    const transferText =
      heldText.length > 0
        ? `；这些组件当前由 ${heldText.join('、')} 持有，需走架构资产转移流程后才能改判归属。`
        : '。';

    /* ③ 所属迭代：SPRINTS 中 status 为 active / planned 的迭代（SP-24 / SP-25） */
    const planned = SPRINTS.filter((s) => s.status === 'active' || s.status === 'planned');
    const sprints = form.currentSprintIds.length > 0 ? form.currentSprintIds : planned.map((s) => s.id);

    /* ④ 建议编制：承接组件数 ÷ 3 向上取整并 clamp 到 [2, 8]，只作文本建议，不改 memberIds */
    const suggested = Math.min(8, Math.max(2, Math.ceil(comps.length / 3)));

    setForm((prev) => ({ ...prev, techStack: stack, ownedComponentIds: comps, currentSprintIds: sprints }));
    setAiDraft(
      `由 ${ORG_AI_AGENT.id}（${ORG_AI_AGENT.name}）依据既有 ${TEAMS.length} 个团队的 techStack / ownedComponentIds 分布与 ARCH_COMPONENTS ${ARCH_COMPONENTS.length} 个组件的归属现状推导，模型为 data.ts models 中的真实条目 ${ORG_AI_AGENT.modelId}（${ORG_AI_AGENT.modelName}），全过程为确定性规则匹配、未使用随机数：` +
        `① 技术栈 ${stack.length} 项（${stack.join(' / ')}）—— ${stackWhy}。` +
        `② 承接组件 ${comps.length} 个（${comps.map((cid) => ARCH_COMPONENT_MAP[cid]?.name ?? cid).join(' / ')}）—— ${compWhy}${transferText}` +
        `③ 所属迭代 ${sprints.join(' / ')} —— 取 SPRINTS 中 status 为 active / planned 的迭代（${planned.map((s) => `${s.id} ${s.statusLabel}`).join('、')}）。` +
        `④ 建议编制 ${suggested} 人 —— 承接组件 ${comps.length} 个 ÷ 3 向上取整并 clamp 到 [2, 8]；技术栈 ${stack.length} 项属${stack.length >= 5 ? '宽栈' : stack.length >= 3 ? '中等栈' : '窄栈'}。此项仅为文本建议，未自动改动成员多选，请人工确认后再勾选成员。`,
    );
  };

  /** 提交：组装 TeamDef 存入本地 created，不回写数据模块 */
  const submitCreate = () => {
    const fixed: CreateForm =
      form.leaderId && !form.memberIds.includes(form.leaderId)
        ? { ...form, memberIds: [form.leaderId, ...form.memberIds] }
        : form;
    if (fixed !== form) setForm(fixed);
    const next = validateCreate(fixed, allTeams);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const id = nextTeamId;
    const levels = fixed.memberIds.map((uid) => {
      const s = MEMBER_PROFILE_MAP[uid]?.seniority;
      return s ? Number(s.slice(1)) : null;
    });
    const noProfile = fixed.memberIds.filter((uid, i) => levels[i] === null);
    const avgSeniority =
      Math.round(
        (levels.reduce<number>((sum, v) => sum + (v ?? 5), 0) / Math.max(fixed.memberIds.length, 1)) * 10,
      ) / 10;
    const team: TeamDef = {
      id,
      name: fixed.name.trim(),
      leaderId: fixed.leaderId,
      memberIds: fixed.memberIds,
      parentTeamId: null,
      mission: fixed.mission.trim(),
      establishedAt: fixed.establishedAt,
      headcount: fixed.memberIds.length,
      avgSeniority,
      techStack: fixed.techStack,
      ownedComponentIds: fixed.ownedComponentIds,
      currentSprintIds: fixed.currentSprintIds,
      tone: ROLE_TONE[USER_MAP[fixed.leaderId]?.roleId ?? ''] ?? 'slate',
    };
    const total = TEAMS.length + created.length + 1;
    setCreated((prev) => [...prev, team]);
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setAiDraft(null);
    setSoftWarn(null);
    setCreateNote(
      `已录入团队「${team.name}」（${team.id} · 负责人 ${USER_MAP[team.leaderId]?.name ?? team.leaderId} · 编制 ${team.headcount} 人 · 平均职级 P${team.avgSeniority.toFixed(1)}），当前为本地草稿态：已计入组织概览与团队对比表（共 ${total} 个团队），尚未回写 PingCode；该团队暂无 TEAM_METRICS 效能快照与 TEAM_COLLABS 协作关系，待首个迭代结束后生成。` +
        (noProfile.length > 0
          ? `其中 ${noProfile.map((uid) => USER_MAP[uid]?.name ?? uid).join('、')} 不在 MEMBER_PROFILES 中，平均职级按 P5.0 计。`
          : '') +
        `口径说明：组织架构树、团队卡片与团队选择器仍读取 data-mgmt 的 TEAMS 常量（${TEAMS.length} 个），故新团队只出现在组织概览指标、团队对比表与 AI 诊断中，且仅在本地会话有效，刷新即丢失。`,
    );
  };

  const errKeys = Object.keys(errors).filter((k) => k !== 'ai');

  const sortIcon = (key: TeamSortKey) =>
    sort.key === key ? (sort.dir === 'asc' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />) : null;

  const toggleSort = (key: TeamSortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <div className="ac-tmg" data-annotation-id="ai-sdlc-team-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">团队管理</div>
          <div className="ac-page-desc">
            管理技术中心 7 个一级团队的编制与角色配比、跨 3 个迭代（SP-22 / SP-23 / SP-24）的效能快照、
            8 条跨团队协作关系与 6 类研发仪式；所有指标口径与贯穿案例「订单中心重构」（EPIC-ORDER-REF · Sprint 24，
            2026-03-02 ~ 2026-03-27）一致，统计基准日 TODAY = {TODAY}（迭代第 18 天，剩余 8 天）。
          </div>
        </div>
        <div className="ac-page-actions">
          <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={openCreate}>
            <Plus size={13} />
            录入团队
          </button>
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            {CURRENT_SPRINT.name} {CURRENT_SPRINT.statusLabel}
          </span>
          <span className="ac-tag ac-tag--brand">
            <Users size={12} />
            {allTeams.length} 团队 · {orgStats.humanTotal} 名真人
          </span>
          <span className="ac-tag ac-tag--ai">
            <Bot size={12} />
            {orgStats.aiTotal} 个 AI 共享账号
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('insight')}>
            <Activity size={13} />
            查看效能报表
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
              <span className="ac-tab-count">{t.id === 'org' ? allTeams.length : t.count}</span>
            </button>
          );
        })}
      </div>

      {/* ---------- 录入结果提示（本地草稿态） ---------- */}
      {createNote && (
        <div className="ac-hint ac-hint--ok ac-mb-4">
          <CircleCheck size={14} />
          <span>{createNote}</span>
          <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => setCreateNote(null)}>
            收起
          </button>
        </div>
      )}

      {/* ================= 1. 团队编制 ================= */}
      {tab === 'org' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--4 ac-tmg-metric-row" data-annotation-id="ai-sdlc-team-summary">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">一级团队数</span>
                <span className="ac-metric-icon">
                  <Building2 size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {allTeams.length}
                <span className="ac-metric-unit">个</span>
              </div>
              <div className="ac-metric-foot">扁平结构 · parentTeamId 均为 null</div>
            </div>

            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">总人数</span>
                <span className="ac-metric-icon">
                  <Users size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {orgStats.humanTotal + orgStats.aiTotal}
                <span className="ac-metric-unit">人</span>
              </div>
              <div className="ac-metric-foot">
                真人 {orgStats.humanTotal}（团队编制）+ AI {orgStats.aiTotal}（平台级共享，不归属团队）
              </div>
            </div>

            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head">
                <span className="ac-metric-label">平均职级</span>
                <span className="ac-metric-icon">
                  <Crown size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                P{orgStats.weightedSeniority.toFixed(1)}
                <span className="ac-metric-unit">按编制加权</span>
              </div>
              <div className="ac-metric-foot">团队简单平均 P{orgStats.simpleSeniority.toFixed(1)} · 最高 P8.0（平台架构组）</div>
            </div>

            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">覆盖技术栈</span>
                <span className="ac-metric-icon">
                  <Layers size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {orgStats.stackCount}
                <span className="ac-metric-unit">项</span>
              </div>
              <div className="ac-metric-foot">承接架构组件 {orgStats.componentCount} 个（覆盖 ARCH_COMPONENTS 全部 14 个）</div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-team-org-tree">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Network size={16} />
                组织架构树
              </span>
              <span className="ac-card-subtitle">按 TEAMS.parentTeamId 层级绘制 · 点击节点选中团队并联动下方卡片与详情表</span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[selectedTeam.tone]}`}>
                  <CircleDot size={11} />
                  当前选中 {selectedTeam.name}
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-tmg-tree-body">
              <OrgTreeChart selectedId={selectedTeamId} onSelect={setSelectedTeamId} />
            </div>
          </div>

          <div className="ac-section-title">团队卡片</div>
          <div className="ac-tmg-team-grid" data-annotation-id="ai-sdlc-team-cards">
            {TEAMS.map((t) => {
              const leader = USER_MAP[t.leaderId];
              const members = membersOf(t);
              const active = t.id === selectedTeamId;
              const m24 = metricOf(t.id, 'SP-24');
              return (
                <div
                  key={t.id}
                  className={active ? 'ac-tmg-team-card ac-tmg-team-card--active' : 'ac-tmg-team-card'}
                  onClick={() => setSelectedTeamId(t.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelectedTeamId(t.id);
                  }}
                >
                  <div className="ac-tmg-team-head">
                    <span className={`ac-avatar ac-avatar--lg ac-avatar--square ${AVATAR_TONE[t.tone]}`}>
                      {t.name.slice(0, 1)}
                    </span>
                    <div className="ac-flex-1 ac-tmg-team-headtext">
                      <div className="ac-tmg-team-name">{t.name}</div>
                      <div className="ac-row ac-gap-1 ac-mt-1">
                        <span className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{t.id}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[t.tone]}`}>编制 {t.headcount} 人</span>
                        {t.headcount === 1 && (
                          <span className="ac-tag ac-tag--sm ac-tag--danger">
                            <TriangleAlert size={10} />
                            单点风险
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ac-btn ac-btn--text ac-btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDrawerTeam(t);
                      }}
                    >
                      详情
                      <ChevronRight size={12} />
                    </button>
                  </div>

                  <div className="ac-tmg-team-mission">{t.mission}</div>

                  <div className="ac-tmg-team-leader">
                    <span className="ac-tmg-field-label">
                      <Crown size={11} />
                      负责人
                    </span>
                    {leader && (
                      <span className="ac-user">
                        <span className={`ac-avatar ac-avatar--sm ${AVATAR_TONE[leader.avatarColor]}`}>{leader.initial}</span>
                        <span className="ac-user-name">{leader.name}</span>
                        <span className="ac-user-meta">{leader.title}</span>
                      </span>
                    )}
                    <span className="ac-xs ac-muted ac-ml-auto">成立 {t.establishedAt}</span>
                  </div>

                  <div className="ac-tmg-team-row">
                    <span className="ac-tmg-field-label">
                      <Users size={11} />
                      成员
                    </span>
                    <span className="ac-avatar-group">
                      {members.slice(0, 5).map((u) => (
                        <span key={u.id} className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[u.avatarColor]}`} title={`${u.name} · ${u.title}`}>
                          {u.initial}
                        </span>
                      ))}
                      {members.length > 5 && <span className="ac-avatar-more">+{members.length - 5}</span>}
                    </span>
                    <span className="ac-xs ac-muted">平均职级 P{t.avgSeniority.toFixed(1)}</span>
                  </div>

                  <div className="ac-tmg-tagblock">
                    <span className="ac-tmg-field-label">
                      <Layers size={11} />
                      技术栈 {t.techStack.length} 项
                    </span>
                    <div className="ac-tmg-tags">
                      {t.techStack.map((s) => (
                        <span key={s} className="ac-tag ac-tag--sm ac-tag--outline">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="ac-tmg-tagblock">
                    <span className="ac-tmg-field-label">
                      <Boxes size={11} />
                      承接架构组件 {t.ownedComponentIds.length} 个
                    </span>
                    <div className="ac-tmg-tags">
                      {t.ownedComponentIds.slice(0, 5).map((cid) => (
                        <span key={cid} className="ac-tag ac-tag--sm ac-tag--neutral" title={ARCH_COMPONENT_MAP[cid]?.tech ?? ''}>
                          {ARCH_COMPONENT_MAP[cid]?.name ?? cid}
                        </span>
                      ))}
                      {t.ownedComponentIds.length > 5 && (
                        <span className="ac-tag ac-tag--sm ac-tag--outline">+{t.ownedComponentIds.length - 5}</span>
                      )}
                      {t.ownedComponentIds.length === 0 && <span className="ac-xs ac-muted">职能型团队，不直接持有架构组件</span>}
                    </div>
                  </div>

                  <div className="ac-tmg-team-foot">
                    <span className="ac-row ac-gap-1">
                      {t.currentSprintIds.map((sid) => {
                        const sp = SPRINTS.filter((s) => s.id === sid)[0];
                        return (
                          <span key={sid} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[sp?.tone ?? 'neutral']}`}>
                            {sp?.name ?? sid} · {sp?.theme ?? ''}
                          </span>
                        );
                      })}
                    </span>
                    {m24 && (
                      <span className={`ac-xs ac-semi ${TEXT_TONE[m24.tone]}`}>
                        SP-24 {m24.velocityPoints}/{m24.committedPoints} 点 · {m24.sayDoRatioPct}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ac-section-title">角色配比</div>
          <div className="ac-grid-2-1" data-annotation-id="ai-sdlc-team-role-mix">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Users size={16} />
                  团队角色构成
                </span>
                <span className="ac-card-subtitle">按 USERS.roleId 统计 · 条宽按编制人数等比（最大 {Math.max(...TEAMS.map((t) => t.headcount))} 人）</span>
              </div>
              <div className="ac-card-body">
                <RoleMixChart onSelect={setSelectedTeamId} />
                <div className="ac-legend ac-tmg-legend">
                  {ROLES.map((r) => (
                    <span className="ac-legend-item" key={r.id}>
                      <span className="ac-legend-swatch" style={{ background: TONE_HEX[r.color] }} />
                      {r.name}
                      <span className="ac-legend-value">{roleActual[r.id]} 人</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Scale size={16} />
                  理想 vs 实际配比
                </span>
                <span className="ac-card-subtitle">偏离 ≥ {RATIO_GAP_THRESHOLD}pp 判定为失衡</span>
              </div>
              <div className="ac-card-body ac-tmg-ratio-body">
                {ratioGaps.map((g) => (
                  <div className="ac-tmg-ratio-row" key={g.role.id}>
                    <span className="ac-tmg-ratio-name">
                      <span className="ac-legend-swatch" style={{ background: TONE_HEX[g.role.color] }} />
                      {g.role.name}
                    </span>
                    <span className="ac-tmg-ratio-bars">
                      <span className="ac-tmg-ratio-track">
                        <span className="ac-tmg-ratio-ideal" style={{ width: `${Math.min(100, (g.ideal / 50) * 100)}%` }} />
                      </span>
                      <span className="ac-tmg-ratio-track">
                        <span
                          className={g.off ? 'ac-tmg-ratio-real ac-tmg-ratio-real--off' : 'ac-tmg-ratio-real'}
                          style={{ width: `${Math.min(100, (g.realPct / 50) * 100)}%`, background: g.off ? TONE_HEX.danger : TONE_HEX[g.role.color] }}
                        />
                      </span>
                    </span>
                    <span className={`ac-tmg-ratio-delta ${g.off ? 'ac-danger-text' : 'ac-muted'}`}>
                      {g.ideal.toFixed(0)}% / {g.realPct.toFixed(1)}%
                      <b>
                        {' '}
                        {g.delta > 0 ? '+' : ''}
                        {g.delta.toFixed(1)}pp
                      </b>
                    </span>
                  </div>
                ))}
                <div className="ac-hint ac-hint--ai ac-tmg-ratio-hint">
                  <Sparkles size={14} />
                  <span>
                    研发角色实际占比 {ratioGaps.filter((g) => g.role.id === 'developer')[0]?.realPct.toFixed(1)}%，低于编制指引基线 45%
                    （按 {orgStats.humanTotal} 人编制折算应为 4 人，现有 3 人）；该缺口已被 SP-24 的负载实证：
                    周浩然负载 223.8%、沈亦白 181.0%（WORKLOADS）。管理 / 职能角色占比高于基线属小团队扁平化的正常形态，
                    建议 SP-25 履约域扩编时优先补研发与测试序列。
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Scale size={16} />
                理想配比 vs 实际配比（全角色展开）
              </span>
              <span className="ac-card-subtitle">浅色条 = 技术中心 2026 编制指引基线 · 深色条 = 实际占比（{orgStats.humanTotal} 名真人）</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--sm ac-tag--danger">
                  失衡 {ratioGaps.filter((g) => g.off).length} 项
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <IdealVsActualChart />
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <ShieldCheck size={14} />
                <span>
                  理想配比为本页面内置的组织设计基线常量（IDEAL_ROLE_RATIO），不来自 data-mgmt；实际配比由 TEAMS.memberIds →
                  USERS.roleId 逐人统计得出，可逐条复核。单点风险：{orgStats.soloTeams} 个团队编制仅 1 人（巴士因子 = 1），
                  {orgStats.singleRoleTeams} 个团队只覆盖单一角色，质量与架构能力需跨团队支援。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">团队详情</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-team-table">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                团队编制与当期交付
              </span>
              <span className="ac-card-subtitle">点击表头排序 · 点击行查看成员清单、技能概览、当期任务与效能趋势</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">SP-24 承诺合计 {sprintTotals.committed} 点</span>
                <span className="ac-tag ac-tag--sm ac-tag--danger">{sprintTotals.dangerTeams} 个团队达成率告警</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th className="ac-tmg-sortable" onClick={() => toggleSort('name')}>
                        团队 {sortIcon('name')}
                      </th>
                      <th>负责人</th>
                      <th className="ac-td-right ac-tmg-sortable" onClick={() => toggleSort('headcount')}>
                        编制 {sortIcon('headcount')}
                      </th>
                      <th className="ac-td-right ac-tmg-sortable" onClick={() => toggleSort('avgSeniority')}>
                        平均职级 {sortIcon('avgSeniority')}
                      </th>
                      <th>角色构成</th>
                      <th className="ac-td-right ac-tmg-sortable" onClick={() => toggleSort('tech')}>
                        技术栈 {sortIcon('tech')}
                      </th>
                      <th>所属迭代</th>
                      <th className="ac-td-right ac-tmg-sortable" onClick={() => toggleSort('committed')}>
                        SP-24 承诺 {sortIcon('committed')}
                      </th>
                      <th className="ac-td-right ac-tmg-sortable" onClick={() => toggleSort('velocity')}>
                        SP-24 速率 {sortIcon('velocity')}
                      </th>
                      <th className="ac-td-right ac-tmg-sortable" onClick={() => toggleSort('sayDo')}>
                        承诺达成率 {sortIcon('sayDo')}
                      </th>
                      <th>协作健康度</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamRows.map((r) => {
                      const counts = roleCountOf(r.team);
                      const m24 = metricOf(r.team.id, 'SP-24');
                      return (
                        <tr
                          key={r.team.id}
                          className={r.team.id === selectedTeamId ? 'ac-tmg-row ac-table-row--selected' : 'ac-tmg-row'}
                          onClick={() => {
                            setSelectedTeamId(r.team.id);
                            setDrawerTeam(r.team);
                          }}
                          title="点击查看团队详情"
                        >
                          <td>
                            <div className="ac-tmg-cell-name">
                              <span className="ac-tmg-dot" style={{ background: TONE_HEX[r.team.tone] }} />
                              {r.team.name}
                              {created.some((c) => c.id === r.team.id) && (
                                <span className="ac-tag ac-tag--sm ac-tag--ai">新建 · 待同步</span>
                              )}
                            </div>
                            <span className="ac-xs ac-muted ac-mono">{r.team.id}</span>
                          </td>
                          <td>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[r.leader?.avatarColor ?? 'brand']}`}>
                                {r.leader?.initial ?? '—'}
                              </span>
                              <span className="ac-user-name">{r.leader?.name ?? '—'}</span>
                            </span>
                            <div className="ac-xs ac-muted">{MEMBER_PROFILE_MAP[r.team.leaderId]?.seniority ?? '—'} · {r.leader?.title}</div>
                          </td>
                          <td className="ac-td-num">
                            {r.team.headcount}
                            {r.team.headcount === 1 && <span className="ac-tmg-solo">单点</span>}
                          </td>
                          <td className="ac-td-num">P{r.team.avgSeniority.toFixed(1)}</td>
                          <td>
                            <span className="ac-tmg-tags">
                              {ROLES.filter((ro) => (counts[ro.id] ?? 0) > 0).map((ro) => (
                                <span key={ro.id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[ro.color]}`}>
                                  {ro.short}×{counts[ro.id]}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-td-num">
                            {r.team.techStack.length} 项
                            <div className="ac-xs ac-muted ac-tmg-cell-stack">{r.team.techStack.slice(0, 2).join(' · ')}</div>
                          </td>
                          <td>
                            <span className="ac-tmg-tags">
                              {r.team.currentSprintIds.map((sid) => (
                                <span key={sid} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">
                                  {sid}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-td-num">
                            {r.hasMetric ? r.committed : <span className="ac-xs ac-muted">暂无数据</span>}
                          </td>
                          <td className="ac-td-num ac-semi">
                            {r.hasMetric ? r.velocity : <span className="ac-xs ac-muted ac-semi">暂无数据</span>}
                          </td>
                          <td className="ac-td-right">
                            {r.hasMetric ? (
                              <div className="ac-tmg-saydo">
                                <span className="ac-progress ac-progress--sm">
                                  <span
                                    className={`ac-progress-bar ${m24 ? `ac-progress-bar--${m24.tone === 'ok' ? 'ok' : m24.tone === 'warn' ? 'warn' : 'danger'}` : ''}`}
                                    style={{ width: `${Math.min(100, r.sayDo)}%` }}
                                  />
                                </span>
                                <span className={`ac-xs ac-semi ${m24 ? TEXT_TONE[m24.tone] : 'ac-muted'}`}>{r.sayDo.toFixed(1)}%</span>
                              </div>
                            ) : (
                              <span className="ac-xs ac-muted">暂无数据</span>
                            )}
                          </td>
                          <td>
                            <span className="ac-row ac-gap-1">
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.collab.tone]}`}>
                                {r.collab.total} 条协作
                              </span>
                              {r.collab.blocked > 0 && (
                                <span className="ac-tag ac-tag--sm ac-tag--danger">阻塞 {r.collab.blocked}</span>
                              )}
                            </span>
                          </td>
                          <td className="ac-td-right">
                            <button
                              type="button"
                              className="ac-btn ac-btn--text ac-btn--sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDrawerTeam(r.team);
                              }}
                            >
                              详情
                              <ChevronRight size={12} />
                            </button>
                          </td>
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

      {/* ================= 2. 团队效能 ================= */}
      {tab === 'metrics' && (
        <div data-annotation-id="ai-sdlc-team-metrics">
          <div className="ac-filter-bar">
            <Gauge size={14} className="ac-muted" />
            <span className="ac-xs ac-muted">效能迭代</span>
            <div className="ac-tabs ac-tabs--pill">
              {METRIC_SPRINT_IDS.map((sid) => {
                const sp = SPRINTS.filter((s) => s.id === sid)[0];
                return (
                  <button
                    key={sid}
                    type="button"
                    className={`ac-tab ${sprintId === sid ? 'ac-tab--active' : ''}`}
                    onClick={() => setSprintId(sid)}
                  >
                    {sp?.name ?? sid} · {sp?.theme ?? ''}
                    <span className="ac-tab-count">
                      {TEAM_METRICS.filter((m) => m.sprintId === sid).length}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="ac-divider-v" />
            <span className="ac-xs ac-muted">
              {sprintTotals.sprint?.startDate} ~ {sprintTotals.sprint?.endDate} · 产能 {sprintTotals.sprint?.capacity} 点
            </span>
            <div className="ac-ml-auto ac-row ac-gap-2">
              <span className="ac-tag ac-tag--outline">承诺 {sprintTotals.committed} 点</span>
              <span className={`ac-tag ac-tag--${sprintTotals.sayDo >= 95 ? 'ok' : sprintTotals.sayDo >= 70 ? 'warn' : 'danger'}`}>
                实际 {sprintTotals.velocity} 点 · {sprintTotals.sayDo}%
              </span>
            </div>
          </div>

          <div className="ac-metric-grid ac-metric-grid--4 ac-tmg-metric-row">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">组织承诺达成率</span>
                <span className="ac-metric-icon">
                  <Target size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {sprintTotals.sayDo.toFixed(1)}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">
                {sprintTotals.velocity} / {sprintTotals.committed} 点 · 与 SPRINTS.{sprintId} 的 completed/committed 对账一致
              </div>
            </div>
            <div className="ac-metric ac-metric--danger">
              <div className="ac-metric-head">
                <span className="ac-metric-label">达成率告警团队</span>
                <span className="ac-metric-icon">
                  <Siren size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {sprintTotals.dangerTeams}
                <span className="ac-metric-unit">/ {TEAMS.length} 个</span>
              </div>
              <div className="ac-metric-foot">tone = danger（达成率 &lt; 70%）</div>
            </div>
            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">平均缺陷密度</span>
                <span className="ac-metric-icon">
                  <ShieldCheck size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {sprintTotals.defect.toFixed(2)}
                <span className="ac-metric-unit">个/KLOC</span>
              </div>
              <div className="ac-metric-foot">7 个团队简单平均</div>
            </div>
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">平均 AI 采纳率</span>
                <span className="ac-metric-icon">
                  <Bot size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {sprintTotals.ai.toFixed(1)}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">
                {METRIC_SPRINT_IDS[0]} 组织均值 {orgAiBySprint[METRIC_SPRINT_IDS[0]].toFixed(1)}%，三期提升{' '}
                {(orgAiBySprint[sprintId] - orgAiBySprint[METRIC_SPRINT_IDS[0]]).toFixed(1)}pp
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Activity size={16} />
                承诺点数 vs 实际速率（叠加完成率折线）
              </span>
              <span className="ac-card-subtitle">左轴故事点 · 右轴任务完成率 · 柱色取该团队当期 tone</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--sm ac-tag--outline">
                  <span className="ac-tmg-key ac-tmg-key--ghost" />
                  承诺
                </span>
                <span className="ac-tag ac-tag--sm ac-tag--outline">
                  <span className="ac-tmg-key ac-tmg-key--real" />
                  实际
                </span>
                <span className="ac-tag ac-tag--sm ac-tag--outline">
                  <span className="ac-tmg-key ac-tmg-key--line" />
                  完成率
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <GroupedBarChart sprintId={sprintId} />
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint ac-hint--warn">
                <TriangleAlert size={14} />
                <span>
                  {sprintId} 为{SPRINTS.filter((s) => s.id === sprintId)[0]?.statusLabel}状态
                  {sprintId === 'SP-24' ? `（TODAY = ${TODAY}，迭代已过 18/26 天 = 69%，组织完成率 ${sprintTotals.sayDo}% 略低于时间进度）` : '（已归档，数据为终值）'}
                  ；合计校验：7 个团队 committedPoints 之和 = SPRINTS.committed = {sprintTotals.committed}，velocityPoints 之和 = SPRINTS.completed = {sprintTotals.velocity}。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <TrendingUp size={16} />
                  {selectedTeam.name} · 跨迭代趋势
                </span>
                <span className="ac-card-subtitle">SP-22 → SP-23 → SP-24 三期对比</span>
                <div className="ac-card-extra">
                  <select
                    className="ac-select ac-select--sm"
                    value={trendKey}
                    onChange={(e) => setTrendKey(e.target.value as NumericMetricKey)}
                    aria-label="选择趋势指标"
                  >
                    {METRIC_DEFS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}（{d.unit}）
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="ac-card-body">
                <TrendLineChart teamId={selectedTeam.id} def={trendDef} />
                <div className="ac-tmg-spark-grid">
                  {METRIC_DEFS.map((d) => {
                    const vals = METRIC_SPRINT_IDS.map((sid) => metricOf(selectedTeam.id, sid)?.[d.key] ?? 0);
                    const delta = vals[vals.length - 1] - vals[0];
                    const good = d.betterUp ? delta > 0 : delta < 0;
                    return (
                      <button
                        type="button"
                        key={d.key}
                        className={d.key === trendKey ? 'ac-tmg-spark ac-tmg-spark--active' : 'ac-tmg-spark'}
                        onClick={() => setTrendKey(d.key)}
                      >
                        <span className="ac-tmg-spark-label">{d.label}</span>
                        <Sparkline values={vals} tone={good ? 'ok' : delta === 0 ? 'neutral' : 'danger'} />
                        <span className={`ac-tmg-spark-value ${good ? 'ac-ok-text' : delta === 0 ? 'ac-muted' : 'ac-danger-text'}`}>
                          {vals[vals.length - 1].toFixed(d.digits)}
                          {d.unit === '%' ? '%' : ''}
                          <i>
                            {' '}
                            {delta > 0 ? '+' : ''}
                            {delta.toFixed(d.digits)}
                          </i>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Target size={16} />
                  6 维能力雷达
                </span>
                <span className="ac-card-subtitle">{selectedTeam.name}</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--sm ac-tag--brand">
                    <span className="ac-tmg-key ac-tmg-key--line" />
                    {sprintId}
                  </span>
                  <span className="ac-tag ac-tag--sm ac-tag--outline">
                    <span className="ac-tmg-key ac-tmg-key--prev" />
                    {METRIC_SPRINT_IDS[Math.max(METRIC_SPRINT_IDS.indexOf(sprintId) - 1, 0)]}
                  </span>
                </div>
              </div>
              <div className="ac-card-body">
                <RadarChart teamId={selectedTeam.id} sprintId={sprintId} />
                <div className="ac-hint ac-tmg-radar-note">
                  <ShieldCheck size={14} />
                  <span>{RADAR_NOTE}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                团队效能明细（{sprintId}）
              </span>
              <span className="ac-card-subtitle">12 列 · 环比对齐上一迭代 · 评级为组织内综合分位</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">{metricRows.length} 条快照</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>团队</th>
                      <th>迭代</th>
                      <th className="ac-td-right">承诺点数</th>
                      <th className="ac-td-right">实际速率</th>
                      <th className="ac-td-right">任务完成率</th>
                      <th className="ac-td-right">承诺达成率</th>
                      <th className="ac-td-right">缺陷密度</th>
                      <th className="ac-td-right">AI 采纳率</th>
                      <th className="ac-td-right">PR 评审时长</th>
                      <th className="ac-td-right">周期时间</th>
                      <th className="ac-td-right">环比达成率</th>
                      <th className="ac-td-right">评级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map((r) => {
                      const dAi = deltaOf(r.team.id, sprintId, 'aiAdoptionPct');
                      return (
                        <tr
                          key={r.team.id}
                          className={r.team.id === selectedTeamId ? 'ac-tmg-row ac-table-row--selected' : 'ac-tmg-row'}
                          onClick={() => setSelectedTeamId(r.team.id)}
                          title="点击联动趋势图与雷达图"
                        >
                          <td>
                            <div className="ac-tmg-cell-name">
                              <span className="ac-tmg-dot" style={{ background: TONE_HEX[r.team.tone] }} />
                              {r.team.name}
                            </div>
                            <span className="ac-xs ac-muted">{r.team.headcount} 人 · P{r.team.avgSeniority.toFixed(1)}</span>
                          </td>
                          <td className="ac-mono ac-xs ac-text-2">{r.m.sprintId}</td>
                          <td className="ac-td-num">{r.m.committedPoints}</td>
                          <td className="ac-td-num ac-semi">{r.m.velocityPoints}</td>
                          <td className="ac-td-num">{r.m.completionRatePct}%</td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.m.tone]}`}>{r.m.sayDoRatioPct.toFixed(1)}%</span>
                          </td>
                          <td className="ac-td-num">{r.m.defectDensity.toFixed(2)}</td>
                          <td className="ac-td-num">
                            {r.m.aiAdoptionPct}%
                            {dAi !== null && (
                              <span className={`ac-xs ${dAi >= 0 ? 'ac-ok-text' : 'ac-danger-text'}`}>
                                {' '}
                                {dAi >= 0 ? '+' : ''}
                                {dAi.toFixed(0)}pp
                              </span>
                            )}
                          </td>
                          <td className="ac-td-num">{r.m.avgPrReviewHours.toFixed(1)}h</td>
                          <td className="ac-td-num">{r.m.cycleTimeDays.toFixed(1)}d</td>
                          <td className="ac-td-right">
                            {r.delta === null ? (
                              <span className="ac-xs ac-muted">—</span>
                            ) : (
                              <span className={`ac-tmg-delta ${r.delta >= 0 ? 'ac-ok-text' : 'ac-danger-text'}`}>
                                {r.delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {r.delta >= 0 ? '+' : ''}
                                {r.delta.toFixed(1)}pp
                              </span>
                            )}
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.grade.tone]}`}>{r.grade.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 团队诊断</div>
          <div className="ac-tmg-diag-grid">
            {diagnoses.map(({ team, d }) => (
              <div className="ac-tmg-diag" key={team.id}>
                <div className="ac-tmg-diag-head">
                  <span className={`ac-avatar ac-avatar--sm ac-avatar--square ${AVATAR_TONE[team.tone]}`}>
                    {team.name.slice(0, 1)}
                  </span>
                  <div className="ac-flex-1">
                    <div className="ac-tmg-diag-team">
                      {team.name}
                      <span className="ac-xs ac-muted ac-mono">{team.id}</span>
                    </div>
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[d.tone]}`}>
                      <Sparkles size={10} />
                      ag-ba 效能诊断
                    </span>
                  </div>
                  <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setSelectedTeamId(team.id)}>
                    联动图表
                    <ChevronRight size={12} />
                  </button>
                </div>
                <div className={`ac-tmg-diag-title ${TEXT_TONE[d.tone]}`}>{d.headline}</div>
                <div className="ac-tmg-diag-block">
                  <span className="ac-tmg-diag-label">
                    <Activity size={11} />
                    依据
                  </span>
                  <span>{d.evidence}</span>
                </div>
                <div className="ac-tmg-diag-block">
                  <span className="ac-tmg-diag-label">
                    <Zap size={11} />
                    建议动作
                  </span>
                  <span>{d.action}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="ac-hint ac-hint--ai">
            <Bot size={14} />
            <span>
              诊断由 ag-ba（效能分析 Agent）基于 TEAM_METRICS 的 21 条跨迭代快照与 TEAM_COLLABS 的 8 条协作记录生成：
              每条结论的数值均可在「团队效能明细」表中逐格复核，建议动作指向具体的协作编号（COOP-0x）与工作项编号（TASK-24xx）。
              人工介入方式：点击「联动图表」核对趋势，或在协作与依赖页对同源的 AI 建议执行采纳 / 转派 / 驳回。
            </span>
          </div>
        </div>
      )}

      {/* ================= 3. 协作与依赖 ================= */}
      {tab === 'collab' && (
        <div data-annotation-id="ai-sdlc-team-collab">
          <div className="ac-grid-3-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Waypoints size={16} />
                  跨团队协作关系图
                </span>
                <span className="ac-card-subtitle">{TEAMS.length} 个节点 · {TEAM_COLLABS.length} 条有向边 · 点击节点聚焦该团队的协作边</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--sm ac-tag--ok">健康 {TEAM_COLLABS.filter((c) => healthById[c.id] === 'ok').length}</span>
                  <span className="ac-tag ac-tag--sm ac-tag--warn">预警 {TEAM_COLLABS.filter((c) => healthById[c.id] === 'warn').length}</span>
                  <span className="ac-tag ac-tag--sm ac-tag--danger">阻塞 {TEAM_COLLABS.filter((c) => healthById[c.id] === 'risk').length}</span>
                </div>
              </div>
              <div className="ac-card-body">
                <CollabGraph selectedTeamId={selectedTeamId} onSelect={setSelectedTeamId} healthById={healthById} />
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Siren size={16} />
                  阻塞治理看板
                </span>
                <span className="ac-card-subtitle">按 blockedCount 排序 · SLA 超时预警</span>
              </div>
              <div className="ac-card-body ac-tmg-block-body">
                {blockedCollabs.length === 0 && (
                  <div className="ac-empty ac-empty--sm">
                    <span className="ac-empty-icon">
                      <CircleCheck size={20} />
                    </span>
                    <span className="ac-empty-title">当前无阻塞协作</span>
                  </div>
                )}
                {blockedCollabs.map((c) => {
                  const ratio = Math.round((c.avgWaitHours / c.slaHours) * 100);
                  const from = TEAM_MAP_NAME[c.fromTeamId];
                  const to = TEAM_MAP_NAME[c.toTeamId];
                  const state = collabState[c.id];
                  return (
                    <div className="ac-tmg-block" key={c.id}>
                      <div className="ac-tmg-block-head">
                        <span className="ac-tag ac-tag--sm ac-tag--danger ac-mono">{c.id}</span>
                        <span className="ac-tmg-block-title">
                          {from} <ArrowRightLeft size={11} /> {to}
                        </span>
                        <span className="ac-tag ac-tag--sm ac-tag--outline">{c.collabType}</span>
                        <span className="ac-tag ac-tag--sm ac-tag--danger ac-ml-auto">
                          <TriangleAlert size={10} />
                          阻塞 {c.blockedCount} 项
                        </span>
                      </div>
                      <div className="ac-tmg-block-sla">
                        <span className="ac-tmg-sla-label">等待 {c.avgWaitHours}h / SLA {c.slaHours}h</span>
                        <span className="ac-progress ac-progress--sm">
                          <span
                            className={`ac-progress-bar ${ratio > 100 ? 'ac-progress-bar--danger' : ratio > 50 ? 'ac-progress-bar--warn' : 'ac-progress-bar--ok'}`}
                            style={{ width: `${Math.min(100, ratio)}%` }}
                          />
                        </span>
                        <span className={`ac-xs ac-semi ${ratio > 100 ? 'ac-danger-text' : 'ac-warn-text'}`}>
                          {ratio}% {ratio > 100 ? '已超时' : '接近超时'}
                        </span>
                      </div>
                      <div className="ac-tmg-block-note">{c.note}</div>
                      {state && (
                        <div className={`ac-hint ac-hint--${state.decision === 'adopted' ? 'ok' : state.decision === 'reassigned' ? 'warn' : 'danger'} ac-tmg-block-fb`}>
                          {state.decision === 'adopted' ? <CircleCheck size={13} /> : state.decision === 'reassigned' ? <Send size={13} /> : <CircleX size={13} />}
                          <span>
                            {state.decision === 'adopted'
                              ? `已采纳 AI 建议，健康度本地升级为「${HEALTH_META[state.health].label}」`
                              : state.decision === 'reassigned'
                                ? '已转派至指导委员会（SH-07）跟踪'
                                : 'AI 建议已驳回，健康度维持不变'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="ac-hint ac-hint--danger">
                  <Siren size={14} />
                  <span>
                    最高优先级：COOP-02 的 BLOCK-0312 已等待 96.5 小时，为 SLA（48h）的 201%，直接卡住 CRITICAL_PATH 末段的
                    TASK-2420 与 TASK-2421，并使发布单 REL-2403 的批次 1 准入条件（G3 ≥ 85% 且 TASK-2419/2420 完成）无法满足。
                    COOP-05 的 2 项阻塞使 G4 测试门禁的 128 组金额边界用例仅执行 74 组（62%）。
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Handshake size={16} />
                协作明细
              </span>
              <span className="ac-card-subtitle">健康度判定：blockedCount ≥ 1 → 阻塞；否则 avgWaitHours &gt; slaHours ÷ 2 → 预警；其余 → 健康</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  事项合计 {TEAM_COLLABS.reduce((s, c) => s + c.itemCount, 0)} 项
                </span>
                <span className="ac-tag ac-tag--danger">
                  阻塞合计 {TEAM_COLLABS.reduce((s, c) => s + c.blockedCount, 0)} 项
                </span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>发起团队</th>
                      <th>接收团队</th>
                      <th>协作类型</th>
                      <th className="ac-td-right">事项数</th>
                      <th className="ac-td-right">平均等待</th>
                      <th className="ac-td-right">SLA</th>
                      <th className="ac-td-right">等待占比</th>
                      <th className="ac-td-right">阻塞数</th>
                      <th className="ac-td-right">健康度</th>
                      <th>说明</th>
                      <th className="ac-td-right">AI 建议</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TEAM_COLLABS.map((c) => {
                      const health = healthById[c.id];
                      const ratio = Math.round((c.avgWaitHours / c.slaHours) * 100);
                      const state = collabState[c.id];
                      return (
                        <tr
                          key={c.id}
                          className={
                            selectedTeamId === c.fromTeamId || selectedTeamId === c.toTeamId
                              ? 'ac-tmg-row ac-table-row--selected'
                              : 'ac-tmg-row'
                          }
                          onClick={() => setSelectedTeamId(c.fromTeamId)}
                          title="点击在关系图中聚焦该条协作"
                        >
                          <td className="ac-mono ac-brand-text">{c.id}</td>
                          <td>
                            <div className="ac-tmg-cell-name">
                              <span className="ac-tmg-dot" style={{ background: TONE_HEX[TEAM_BY_ID[c.fromTeamId]?.tone ?? 'neutral'] }} />
                              {TEAM_MAP_NAME[c.fromTeamId]}
                            </div>
                          </td>
                          <td>
                            <div className="ac-tmg-cell-name">
                              <span className="ac-tmg-dot" style={{ background: TONE_HEX[TEAM_BY_ID[c.toTeamId]?.tone ?? 'neutral'] }} />
                              {TEAM_MAP_NAME[c.toTeamId]}
                            </div>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[c.tone]}`}>{c.collabType}</span>
                          </td>
                          <td className="ac-td-num">{c.itemCount}</td>
                          <td className="ac-td-num">{c.avgWaitHours.toFixed(1)}h</td>
                          <td className="ac-td-num ac-muted">{c.slaHours}h</td>
                          <td className="ac-td-num">
                            <span className={ratio > 100 ? 'ac-danger-text ac-semi' : ratio > 50 ? 'ac-warn-text' : 'ac-ok-text'}>
                              {ratio}%
                            </span>
                          </td>
                          <td className="ac-td-num">
                            {c.blockedCount > 0 ? (
                              <span className="ac-tag ac-tag--sm ac-tag--danger">{c.blockedCount}</span>
                            ) : (
                              <span className="ac-muted">0</span>
                            )}
                          </td>
                          <td className="ac-td-right">
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[HEALTH_META[health].tone]}`}>
                              <span className="ac-tag-dot" style={{ background: HEALTH_META[health].hex }} />
                              {HEALTH_META[health].label}
                              {state?.decision === 'adopted' && health !== c.health ? '（已升级）' : ''}
                            </span>
                          </td>
                          <td className="ac-tmg-cell-note">{c.note}</td>
                          <td className="ac-td-right">
                            <span className="ac-tag ac-tag--sm ac-tag--ai">
                              <Sparkles size={10} />
                              {c.aiSuggestion.length} 字建议
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

          <div className="ac-section-title">AI 协作优化建议</div>
          {collabFeedback && (
            <div className={`ac-hint ac-hint--${collabFeedback.tone}`}>
              {collabFeedback.tone === 'ok' ? <CircleCheck size={14} /> : collabFeedback.tone === 'warn' ? <Send size={14} /> : <CircleX size={14} />}
              <span>{collabFeedback.text}</span>
            </div>
          )}
          <div className="ac-tmg-advice-grid">
            {[...TEAM_COLLABS]
              .sort((a, b) => {
                const rank = (h: TeamCollabDef['health']) => (h === 'risk' ? 0 : h === 'warn' ? 1 : 2);
                return rank(healthById[a.id]) - rank(healthById[b.id]) || b.avgWaitHours - a.avgWaitHours;
              })
              .map((c) => {
                const health = healthById[c.id];
                const state = collabState[c.id];
                return (
                  <div className={state?.decision === 'rejected' ? 'ac-tmg-advice ac-tmg-advice--rejected' : 'ac-tmg-advice'} key={c.id}>
                    <div className="ac-tmg-advice-head">
                      <span className="ac-tag ac-tag--sm ac-tag--ai">
                        <Sparkles size={10} />
                        ag-ba
                      </span>
                      <span className="ac-mono ac-xs ac-brand-text">{c.id}</span>
                      <span className="ac-xs ac-text-2">
                        {TEAM_MAP_NAME[c.fromTeamId]} → {TEAM_MAP_NAME[c.toTeamId]} · {c.collabType}
                      </span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[HEALTH_META[health].tone]} ac-ml-auto`}>
                        {HEALTH_META[health].label}
                      </span>
                    </div>
                    <div className="ac-ai-block ac-tmg-advice-body">{c.aiSuggestion}</div>
                    <div className="ac-tmg-advice-foot">
                      <span className="ac-xs ac-muted">
                        依据：等待 {c.avgWaitHours}h / SLA {c.slaHours}h（{Math.round((c.avgWaitHours / c.slaHours) * 100)}%）· 事项 {c.itemCount} · 阻塞 {c.blockedCount}
                      </span>
                      <span className="ac-ml-auto ac-row ac-gap-1">
                        <button
                          type="button"
                          className={state?.decision === 'adopted' ? 'ac-btn ac-btn--primary ac-btn--sm' : 'ac-btn ac-btn--ghost ac-btn--sm'}
                          onClick={() => decideCollab(c, 'adopted')}
                          disabled={state?.decision === 'adopted'}
                        >
                          {state?.decision === 'adopted' ? <Check size={12} /> : <CircleCheck size={12} />}
                          {state?.decision === 'adopted' ? '已采纳' : '采纳'}
                        </button>
                        <button
                          type="button"
                          className={state?.decision === 'reassigned' ? 'ac-btn ac-btn--primary ac-btn--sm' : 'ac-btn ac-btn--ghost ac-btn--sm'}
                          onClick={() => decideCollab(c, 'reassigned')}
                        >
                          <Send size={12} />
                          转派
                        </button>
                        <button
                          type="button"
                          className={state?.decision === 'rejected' ? 'ac-btn ac-btn--danger ac-btn--sm' : 'ac-btn ac-btn--ghost ac-btn--sm'}
                          onClick={() => decideCollab(c, 'rejected')}
                        >
                          <CircleX size={12} />
                          驳回
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ================= 4. 研发仪式 ================= */}
      {tab === 'ceremony' && (
        <div data-annotation-id="ai-sdlc-team-ceremony">
          <div className="ac-tmg-cer-grid">
            {CEREMONIES.map((c) => {
              const assist = AI_ASSIST_META[c.aiAssist];
              const owner = ROLE_MAP[c.ownerRoleId];
              const ownerUser = USERS.filter((u) => !u.isAi && u.roleId === c.ownerRoleId)[0];
              return (
                <div className="ac-tmg-cer" key={c.id}>
                  <div className="ac-tmg-cer-head">
                    <span className={`ac-avatar ac-avatar--square ${AVATAR_TONE[c.tone]}`}>
                      <CalendarClock size={15} />
                    </span>
                    <div className="ac-flex-1">
                      <div className="ac-tmg-cer-name">{c.name}</div>
                      <div className="ac-xs ac-muted ac-mono">
                        {c.id} · {c.cadence}
                      </div>
                    </div>
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[assist.tone]}`}>
                      <Sparkles size={10} />
                      AI {assist.label}
                    </span>
                  </div>

                  <div className="ac-tmg-cer-meta">
                    <span>
                      <Timer size={11} />
                      {c.durationMin} 分钟
                    </span>
                    <span>
                      <Clock size={11} />
                      上次 {c.lastHeldAt}
                    </span>
                    <span>
                      <UserCheck size={11} />
                      出席率 {c.attendanceRatePct}%
                    </span>
                    <span>
                      <Check size={11} />
                      行动项关闭 {c.actionItemCloseRatePct}%
                    </span>
                  </div>

                  <div className="ac-tmg-cer-row">
                    <span className="ac-tmg-field-label">
                      <Crown size={11} />
                      主持角色
                    </span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[owner?.tagTone ?? 'neutral']}`}>
                      {owner?.name ?? c.ownerRoleId}
                    </span>
                    {ownerUser && (
                      <span className="ac-user">
                        <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[ownerUser.avatarColor]}`}>{ownerUser.initial}</span>
                        <span className="ac-user-name">{ownerUser.name}</span>
                      </span>
                    )}
                  </div>

                  <div className="ac-tmg-cer-row">
                    <span className="ac-tmg-field-label">
                      <Users size={11} />
                      参与角色
                    </span>
                    <span className="ac-tmg-tags">
                      {c.attendeeRoleIds.map((rid) => (
                        <span key={rid} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[ROLE_MAP[rid]?.tagTone ?? 'neutral']}`}>
                          {ROLE_MAP[rid]?.short ?? rid}
                        </span>
                      ))}
                    </span>
                  </div>

                  <div className="ac-tmg-cer-ai">
                    <span className="ac-tmg-cer-ai-label">
                      <Bot size={11} />
                      AI 产出物料 · {assist.desc}
                    </span>
                    <span className="ac-tmg-cer-ai-text">{c.aiOutput}</span>
                  </div>

                  <div className="ac-tmg-cer-foot">
                    <span className="ac-tmg-cer-bars">
                      <span className="ac-tmg-cer-bar">
                        <i style={{ width: `${c.attendanceRatePct}%` }} className="ac-tmg-cer-bar-fill--info" />
                      </span>
                      <span className="ac-tmg-cer-bar">
                        <i
                          style={{ width: `${c.actionItemCloseRatePct}%` }}
                          className={
                            c.actionItemCloseRatePct >= 85
                              ? 'ac-tmg-cer-bar-fill--ok'
                              : c.actionItemCloseRatePct >= 75
                                ? 'ac-tmg-cer-bar-fill--warn'
                                : 'ac-tmg-cer-bar-fill--danger'
                          }
                        />
                      </span>
                    </span>
                    <button
                      type="button"
                      className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto"
                      onClick={() => {
                        setDemoCeremonyId(c.id);
                        setDemoFeedback(null);
                      }}
                    >
                      生成议程
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Percent size={16} />
                出席率 vs 行动项关闭率
              </span>
              <span className="ac-card-subtitle">蓝色 = 出席率 · 绿/橙/红 = 行动项关闭率（≥85% / 75~84% / &lt;75%）</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  平均出席率 {(CEREMONIES.reduce((s, c) => s + c.attendanceRatePct, 0) / CEREMONIES.length).toFixed(1)}%
                </span>
                <span className="ac-tag ac-tag--warn">
                  平均关闭率 {(CEREMONIES.reduce((s, c) => s + c.actionItemCloseRatePct, 0) / CEREMONIES.length).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <CeremonyBarChart />
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint ac-hint--warn">
                <TriangleAlert size={14} />
                <span>
                  出席率整体健康（均值 {(CEREMONIES.reduce((s, c) => s + c.attendanceRatePct, 0) / CEREMONIES.length).toFixed(1)}%，最低为架构评审会 88%），
                  但行动项关闭率均值仅 {(CEREMONIES.reduce((s, c) => s + c.actionItemCloseRatePct, 0) / CEREMONIES.length).toFixed(1)}%，
                  发布评审会 62% 为最低 —— 「人到了、事没闭环」是当前研发仪式的主要损耗点，而非出席问题。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-grid-1-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Crosshair size={16} />
                  AI 提效四象限
                </span>
                <span className="ac-card-subtitle">X = AI 介入程度 · Y = 行动项关闭率 · 点击圆点查看升级方案</span>
              </div>
              <div className="ac-card-body">
                <CeremonyMatrix onPick={setDemoCeremonyId} />
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Rocket size={16} />
                  AI 仪式提效方案
                </span>
                <span className="ac-card-subtitle">逐条对应真实的 aiAssist 等级与行动项关闭率，给出可执行的升级路径与量化收益</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--sm ac-tag--ai">
                    待升级 {CEREMONIES.filter((c) => CEREMONY_UPGRADE[c.id] && CEREMONY_UPGRADE[c.id].from !== CEREMONY_UPGRADE[c.id].to).length} 个
                  </span>
                </div>
              </div>
              <div className="ac-card-body ac-tmg-upgrade-body">
                {CEREMONIES.map((c) => {
                  const up = CEREMONY_UPGRADE[c.id];
                  if (!up) return null;
                  const changed = up.from !== up.to;
                  return (
                    <div className={changed ? 'ac-tmg-upgrade ac-tmg-upgrade--pending' : 'ac-tmg-upgrade'} key={c.id}>
                      <div className="ac-tmg-upgrade-head">
                        <span className="ac-tmg-upgrade-name">{c.name}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[AI_ASSIST_META[up.from].tone]}`}>
                          {AI_ASSIST_META[up.from].label}
                        </span>
                        {changed && (
                          <>
                            <ArrowRightLeft size={12} className="ac-muted" />
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[AI_ASSIST_META[up.to].tone]}`}>
                              {AI_ASSIST_META[up.to].label}
                            </span>
                          </>
                        )}
                        <span className={`ac-tag ac-tag--sm ac-ml-auto ${c.actionItemCloseRatePct >= 85 ? 'ac-tag--ok' : c.actionItemCloseRatePct >= 75 ? 'ac-tag--warn' : 'ac-tag--danger'}`}>
                          关闭率 {c.actionItemCloseRatePct}%
                        </span>
                      </div>
                      <div className="ac-tmg-upgrade-plan">{up.plan}</div>
                      <div className="ac-tmg-upgrade-gain">
                        <Target size={11} />
                        {up.gain}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                AI 议程与纪要生成演示
              </span>
              <span className="ac-card-subtitle">
                由 {AI_ASSIST_META[demoCeremony.aiAssist].label === '不参与' ? 'ag-pm' : 'ag-pm + ag-ba'} 依据 CEREMONIES、TEAM_METRICS 与 TEAM_COLLABS 实时生成
              </span>
              <div className="ac-card-extra">
                <select
                  className="ac-select ac-select--sm"
                  value={demoCeremonyId}
                  onChange={(e) => {
                    setDemoCeremonyId(e.target.value);
                    setDemoFeedback(null);
                  }}
                  aria-label="选择仪式"
                >
                  {CEREMONIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{c.cadence}）
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ac-btn ac-btn--ghost ac-btn--sm"
                  onClick={() =>
                    setDemoFeedback({
                      tone: 'ok',
                      text: `已把「${demoCeremony.name}」写入林知远的日历：${demoCeremony.cadence}，时长 ${demoCeremony.durationMin} 分钟，自动邀请 ${demoCeremony.attendeeRoleIds.length} 类角色共 ${demoCeremony.attendeeRoleIds.reduce((s, rid) => s + USERS.filter((u) => !u.isAi && u.roleId === rid).length, 0)} 人，议程与预读材料作为附件一并下发。`,
                    })
                  }
                >
                  <CalendarPlus size={13} />
                  插入日历
                </button>
                <button
                  type="button"
                  className="ac-btn ac-btn--ai ac-btn--sm"
                  onClick={() =>
                    setDemoFeedback({
                      tone: 'ai',
                      text: `已推送到飞书群「订单中心重构 · SP-24」：卡片含议程 ${demoAgenda.items.length} 项、预读材料 ${demoAgenda.preReads.length} 份与行动项跟踪链接；群内 ${demoCeremony.attendeeRoleIds.length} 类角色的成员会收到 @ 提醒，未在 30 分钟内确认出席的成员由 ag-pm 自动私聊催办。`,
                    })
                  }
                >
                  <Send size={13} />
                  发送到飞书群
                </button>
              </div>
            </div>
            <div className="ac-card-body">
              {demoFeedback && (
                <div className={`ac-hint ac-hint--${demoFeedback.tone} ac-mb-3`}>
                  {demoFeedback.tone === 'ok' ? <CircleCheck size={14} /> : <Sparkles size={14} />}
                  <span>{demoFeedback.text}</span>
                </div>
              )}
              <div className="ac-tmg-demo-grid">
                <div className="ac-code ac-code--light">
                  <div className="ac-code-head">
                    <span className="ac-code-title">agenda-{demoCeremony.id}.md · AI 议程草稿</span>
                    <span className="ac-code-lang">markdown</span>
                  </div>
                  <pre className="ac-code-body">{demoAgenda.text}</pre>
                </div>
                <div className="ac-code ac-code--light">
                  <div className="ac-code-head">
                    <span className="ac-code-title">minutes-{demoCeremony.id}.md · AI 纪要模板</span>
                    <span className="ac-code-lang">markdown</span>
                  </div>
                  <pre className="ac-code-body">{demoMinutes}</pre>
                </div>
              </div>
              <div className="ac-hint ac-hint--ai ac-mt-3">
                <Bot size={14} />
                <span>
                  人工介入方式：议程草稿中的每一项都可拖拽调整顺序或改为「不讨论，仅通报」；纪要模板在会中由 ag-pm 实时填充，
                  主持人只需在结束前确认行动项的责任人与时限（当前 {demoCeremony.name} 的行动项关闭率为 {demoCeremony.actionItemCloseRatePct}%，
                  未确认责任人是历史纪要中行动项流失的首要原因）。生成内容不写回 PingCode，需点击「插入日历 / 发送到飞书群」后才产生外部副作用。
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 录入团队弹窗（本地草稿态，不回写 data-mgmt） ---------- */}
      <Modal
        open={createOpen}
        title="录入团队"
        subtitle={`新建一级团队 · parentTeamId 固定为 null · 编号自动取 ${nextTeamId} · 仅保存在本地会话`}
        width={780}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={runAiDraft}>
              <Sparkles size={13} />
              AI 生成编制建议
            </button>
            <span className="ac-row ac-gap-2 ac-ml-auto">
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={submitCreate}>
                <Check size={13} />
                确认录入
              </button>
            </span>
          </>
        }
      >
        <FormGrid cols={2}>
          <FormGroupTitle title="团队标识" note="与 data-mgmt 的 TeamDef 字段一一对应" />
          <TextField
            label="团队名称"
            required
            value={form.name}
            onChange={(v) => patchForm({ name: v })}
            error={errors.name}
            hint="团队名称，全局唯一"
            placeholder="如：履约中心研发组"
            maxLength={24}
          />
          <TextField
            label="成立日期"
            required
            type="date"
            mono
            value={form.establishedAt}
            onChange={(v) => patchForm({ establishedAt: v })}
            error={errors.establishedAt}
            hint={`不得晚于 TODAY = ${TODAY}`}
          />
          <SelectField
            label="团队负责人"
            required
            value={form.leaderId}
            onChange={(v) => applyMembers(v, form.memberIds)}
            options={leaderOptions}
            error={errors.leaderId}
            placeholder="请选择负责人"
            hint="选项取自 USERS 中 !isAi 的 9 名真人成员"
          />
          <MultiPickField
            label="团队成员"
            required
            full
            value={form.memberIds}
            onChange={(v) => applyMembers(form.leaderId, v)}
            options={memberOptions}
            error={errors.memberIds}
            hint={form.leaderId ? '负责人已自动计入编制，取消勾选负责人会被自动补回' : '负责人会自动计入编制'}
          />

          <FormGroupTitle title="职责与技术栈" note="mission / techStack / ownedComponentIds / currentSprintIds" />
          <TextareaField
            label="团队使命"
            required
            full
            rows={2}
            value={form.mission}
            onChange={(v) => patchForm({ mission: v })}
            error={errors.mission}
            hint="团队使命，一句话说明负责的领域与保障目标"
            placeholder="负责……的建设与治理，保障……的正确性与容量水位"
            maxLength={120}
          />
          <MultiPickField
            label="技术栈"
            full
            value={form.techStack}
            onChange={(v) => patchForm({ techStack: v })}
            options={stackOptions}
            hint="选项为既有 7 个团队 techStack 的去重并集"
          />
          <MultiPickField
            label="承接架构组件"
            full
            value={form.ownedComponentIds}
            onChange={(v) => patchForm({ ownedComponentIds: v })}
            options={componentOptions}
            hint="选项取自 ARCH_COMPONENTS 的 14 个组件，悬浮可查看组件 id 与说明"
          />
          <MultiPickField
            label="所属迭代"
            value={form.currentSprintIds}
            onChange={(v) => patchForm({ currentSprintIds: v })}
            options={sprintOptions}
            hint="选项取自 SPRINTS 的 4 个迭代"
          />
        </FormGrid>

        {softWarn && (
          <div className="ac-hint ac-hint--warn ac-mt-3">
            <TriangleAlert size={14} />
            <span>{softWarn}</span>
          </div>
        )}
        {aiDraft && (
          <div className="ac-hint ac-hint--ai ac-mt-3">
            <Sparkles size={14} />
            <span>{aiDraft}</span>
          </div>
        )}
        {errors.ai && (
          <div className="ac-hint ac-hint--danger ac-mt-3">
            <TriangleAlert size={14} />
            <span>{errors.ai}</span>
          </div>
        )}
        {errKeys.length > 0 && (
          <div className="ac-hint ac-hint--danger ac-mt-3">
            <CircleX size={14} />
            <span>
              还有 {errKeys.length} 处待修正：{errKeys.map((k) => errors[k]).join('；')}
            </span>
          </div>
        )}
      </Modal>

      {/* ---------- 团队详情抽屉 ---------- */}
      <Drawer
        open={drawerTeam !== null}
        title={drawerTeam ? `${drawerTeam.name} · 团队详情` : '团队详情'}
        subtitle={drawerTeam ? `${drawerTeam.id} · 负责人 ${USER_MAP[drawerTeam.leaderId]?.name ?? '—'} · 成立于 ${drawerTeam.establishedAt}` : undefined}
        width={720}
        onClose={() => setDrawerTeam(null)}
        footer={
          drawerTeam && (
            <>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => jump('board')}>
                <ListChecks size={13} />
                查看任务看板
              </button>
              <button
                type="button"
                className="ac-btn ac-btn--primary ac-btn--sm"
                onClick={() => {
                  setSelectedTeamId(drawerTeam.id);
                  setTab('metrics');
                  setDrawerTeam(null);
                }}
              >
                <Gauge size={13} />
                查看该团队效能
              </button>
            </>
          )
        }
      >
        {drawerTeam && <TeamDetail team={drawerTeam} />}
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ 团队详情 */

function TeamDetail({ team }: { team: TeamDef }) {
  const members = membersOf(team);
  const leader = USER_MAP[team.leaderId];
  const profile = MEMBER_PROFILE_MAP[team.leaderId];
  const sprintTasks = TASKS.filter((t) => t.sprintId === 'SP-24' && team.memberIds.indexOf(t.ownerId) >= 0);
  const snapshots = METRIC_SPRINT_IDS.map((sid) => metricOf(team.id, sid)).filter(Boolean) as TeamMetricSnapshot[];
  const collabs = collabsOf(team.id);
  const counts = roleCountOf(team);
  const cur = metricOf(team.id, 'SP-24');
  const prev = metricOf(team.id, 'SP-23');

  return (
    <>
      <div className="ac-ai-block ac-mb-4">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          ag-ba · 团队画像摘要
        </div>
        <div className="ac-mt-2">{buildDiagnosis(team.id).headline}。{buildDiagnosis(team.id).evidence}</div>
      </div>

      <dl className="ac-kv ac-tmg-kv ac-mb-4">
        <dt>团队使命</dt>
        <dd>{team.mission}</dd>
        <dt>负责人</dt>
        <dd>
          {leader && (
            <span className="ac-user">
              <span className={`ac-avatar ac-avatar--sm ${AVATAR_TONE[leader.avatarColor]}`}>{leader.initial}</span>
              <span className="ac-user-name">{leader.name}</span>
              <span className="ac-user-meta">
                {leader.title} · {profile?.seniority ?? '—'} · {leader.email}
              </span>
            </span>
          )}
        </dd>
        <dt>编制</dt>
        <dd>
          {team.headcount} 人 · 平均职级 P{team.avgSeniority.toFixed(1)} · 上级团队{' '}
          {team.parentTeamId ? TEAM_MAP_NAME[team.parentTeamId] : '技术中心（虚拟根节点）'}
        </dd>
        <dt>角色构成</dt>
        <dd>
          <span className="ac-tmg-tags">
            {ROLES.filter((r) => (counts[r.id] ?? 0) > 0).map((r) => (
              <span key={r.id} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[r.color]}`}>
                {r.name} × {counts[r.id]}
              </span>
            ))}
          </span>
        </dd>
        <dt>成立时间</dt>
        <dd className="ac-mono">
          {team.establishedAt}（至今 {Math.max(0, Math.round((new Date(TODAY).getTime() - new Date(team.establishedAt).getTime()) / 86400000 / 30.4))} 个月）
        </dd>
        <dt>所属迭代</dt>
        <dd>
          <span className="ac-tmg-tags">
            {team.currentSprintIds.map((sid) => {
              const sp = SPRINTS.filter((s) => s.id === sid)[0];
              return (
                <span key={sid} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[sp?.tone ?? 'neutral']}`}>
                  {sp?.name ?? sid} · {sp?.theme ?? ''}（{sp?.statusLabel ?? ''}）
                </span>
              );
            })}
          </span>
        </dd>
        <dt>承接组件</dt>
        <dd>
          {team.ownedComponentIds.length === 0 ? (
            <span className="ac-xs ac-muted">职能型团队，不直接持有架构组件</span>
          ) : (
            <span className="ac-tmg-tags">
              {team.ownedComponentIds.map((cid) => {
                const comp = ARCH_COMPONENT_MAP[cid];
                return (
                  <span key={cid} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[comp?.tone ?? 'neutral']}`} title={`${comp?.repo ?? ''} · ${comp?.tech ?? ''}`}>
                    {comp?.name ?? cid}
                  </span>
                );
              })}
            </span>
          )}
        </dd>
      </dl>

      <div className="ac-section-title">成员清单与技能概览</div>
      <div className="ac-table-wrap ac-mb-4">
        <table className="ac-table ac-table--sm ac-table--bordered">
          <thead>
            <tr>
              <th>成员</th>
              <th>角色 / 职级</th>
              <th>用工类型</th>
              <th className="ac-td-right">本迭代负载</th>
              <th className="ac-td-right">AI 采纳率</th>
              <th className="ac-td-right">近 30 日 PR</th>
              <th className="ac-td-right">缺陷逃逸</th>
              <th>技能标签</th>
            </tr>
          </thead>
          <tbody>
            {members.map((u) => {
              const p = MEMBER_PROFILE_MAP[u.id];
              const w = WORKLOAD_BY_USER[u.id];
              return (
                <tr key={u.id}>
                  <td>
                    <span className="ac-user">
                      <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[u.avatarColor]}`}>{u.initial}</span>
                      <span className="ac-user-name">{u.name}</span>
                      {u.id === team.leaderId && (
                        <span className="ac-tag ac-tag--sm ac-tag--brand">
                          <Crown size={9} />
                          负责人
                        </span>
                      )}
                    </span>
                    <div className="ac-xs ac-muted">{u.title}</div>
                  </td>
                  <td className="ac-xs ac-text-2">
                    {ROLE_MAP[u.roleId]?.name ?? u.roleId} · {p?.seniority ?? '—'}
                  </td>
                  <td className="ac-xs ac-text-2">{p?.employmentType ?? '—'}</td>
                  <td className="ac-td-num">
                    {w ? (
                      <span className={w.overload ? 'ac-danger-text ac-semi' : 'ac-text-1'}>
                        {w.loadPct.toFixed(1)}%
                        <span className="ac-xs ac-muted">
                          {' '}
                          ({w.allocatedPoints}/{w.capacityPoints})
                        </span>
                      </span>
                    ) : (
                      <span className="ac-muted">—</span>
                    )}
                  </td>
                  <td className="ac-td-num">{p ? `${p.aiAcceptRatePct.toFixed(1)}%` : '—'}</td>
                  <td className="ac-td-num">{p?.prCount30d ?? '—'}</td>
                  <td className="ac-td-num">
                    {p && p.defectEscapeCount30d > 0 ? (
                      <span className="ac-warn-text ac-semi">{p.defectEscapeCount30d}</span>
                    ) : (
                      <span className="ac-ok-text">{p?.defectEscapeCount30d ?? '—'}</span>
                    )}
                  </td>
                  <td>
                    <span className="ac-tmg-tags">
                      {u.skills.map((s) => (
                        <span key={s} className="ac-tag ac-tag--sm ac-tag--outline">
                          {s}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="ac-empty ac-empty--sm">
                    <span className="ac-empty-icon">
                      <Users size={18} />
                    </span>
                    <span className="ac-empty-title">该团队暂无在编成员</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ac-section-title">效能趋势（SP-22 → SP-24）</div>
      <div className="ac-table-wrap ac-mb-4">
        <table className="ac-table ac-table--sm ac-table--bordered">
          <thead>
            <tr>
              <th>迭代</th>
              <th>主题</th>
              <th className="ac-td-right">承诺 / 实际</th>
              <th className="ac-td-right">达成率</th>
              <th className="ac-td-right">完成率</th>
              <th className="ac-td-right">缺陷密度</th>
              <th className="ac-td-right">AI 采纳率</th>
              <th className="ac-td-right">PR 评审</th>
              <th className="ac-td-right">周期时间</th>
              <th className="ac-td-right">评级</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((m) => {
              const sp = SPRINTS.filter((s) => s.id === m.sprintId)[0];
              const g = gradeOf(m);
              return (
                <tr key={m.sprintId}>
                  <td className="ac-mono ac-xs ac-brand-text">{m.sprintId}</td>
                  <td className="ac-xs ac-text-2">{sp?.theme ?? '—'}</td>
                  <td className="ac-td-num">
                    {m.committedPoints} / <b>{m.velocityPoints}</b>
                  </td>
                  <td className="ac-td-right">
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[m.tone]}`}>{m.sayDoRatioPct.toFixed(1)}%</span>
                  </td>
                  <td className="ac-td-num">{m.completionRatePct}%</td>
                  <td className="ac-td-num">{m.defectDensity.toFixed(2)}</td>
                  <td className="ac-td-num">{m.aiAdoptionPct}%</td>
                  <td className="ac-td-num">{m.avgPrReviewHours.toFixed(1)}h</td>
                  <td className="ac-td-num">{m.cycleTimeDays.toFixed(1)}d</td>
                  <td className="ac-td-right">
                    <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[g.tone]}`}>{g.label}</span>
                  </td>
                </tr>
              );
            })}
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <span className="ac-xs ac-muted">暂无数据 · 待首个迭代结束后生成</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {cur && prev && (
        <div className="ac-hint ac-mb-4">
          <Activity size={14} />
          <span>
            SP-23 → SP-24 变化：达成率 {prev.sayDoRatioPct.toFixed(1)}% → {cur.sayDoRatioPct.toFixed(1)}%（
            {cur.sayDoRatioPct - prev.sayDoRatioPct > 0 ? '+' : ''}
            {(cur.sayDoRatioPct - prev.sayDoRatioPct).toFixed(1)}pp）；AI 采纳率 {prev.aiAdoptionPct}% → {cur.aiAdoptionPct}%；
            PR 评审时长 {prev.avgPrReviewHours}h → {cur.avgPrReviewHours}h；周期时间 {prev.cycleTimeDays}d → {cur.cycleTimeDays}d。
            SP-24 尚未收口（TODAY = {TODAY}，末日 2026-03-27），达成率偏低属迭代中期正常形态。
          </span>
        </div>
      )}

      <div className="ac-section-title">SP-24 承接工作项（{sprintTasks.length} 个）</div>
      {sprintTasks.length === 0 ? (
        <div className="ac-empty ac-empty--sm ac-mb-4">
          <span className="ac-empty-icon">
            <ListChecks size={18} />
          </span>
          <span className="ac-empty-title">该团队成员在 SP-24 未直接承接 TASK-24xx</span>
          <span className="ac-empty-desc">
            产品 / 测试 / PMO / 管理者序列的工作以非任务型工作项计入承诺点数，构成说明见 WORKLOADS.note。
          </span>
        </div>
      ) : (
        <div className="ac-table-wrap ac-mb-4">
          <table className="ac-table ac-table--sm ac-table--bordered">
            <thead>
              <tr>
                <th>任务</th>
                <th>负责人</th>
                <th>状态</th>
                <th className="ac-td-right">点数</th>
                <th className="ac-td-right">进度</th>
                <th className="ac-td-right">AI 产出</th>
                <th className="ac-td-right">覆盖率</th>
                <th>关键路径</th>
              </tr>
            </thead>
            <tbody>
              {sprintTasks.map((t) => {
                const owner = USER_MAP[t.ownerId];
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="ac-semi ac-text-1 ac-tmg-task-title">{t.title}</div>
                      <span className="ac-xs ac-muted ac-mono">
                        {t.id} · {t.reqId || '无关联需求'}
                      </span>
                    </td>
                    <td>
                      <span className="ac-user">
                        <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[owner?.avatarColor ?? 'brand']}`}>{owner?.initial ?? '—'}</span>
                        <span className="ac-user-name">{owner?.name ?? t.ownerId}</span>
                      </span>
                    </td>
                    <td>
                      <span className="ac-tag ac-tag--sm ac-tag--neutral">{t.stateLabel}</span>
                    </td>
                    <td className="ac-td-num">{t.points}</td>
                    <td className="ac-td-num">{t.progress}%</td>
                    <td className="ac-td-num">{t.aiRatio}%</td>
                    <td className="ac-td-num">
                      <span className={t.coverage >= 85 ? 'ac-ok-text' : t.coverage > 0 ? 'ac-warn-text' : 'ac-danger-text'}>
                        {t.coverage}%
                      </span>
                    </td>
                    <td>
                      {t.critical ? (
                        <span className="ac-tag ac-tag--sm ac-tag--danger">
                          <Zap size={9} />
                          关键路径
                        </span>
                      ) : (
                        <span className="ac-xs ac-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ac-section-title">协作关系（{collabs.length} 条）</div>
      <div className="ac-tmg-drawer-collab">
        {collabs.map((c) => {
          const outgoing = c.fromTeamId === team.id;
          const other = TEAM_BY_ID[outgoing ? c.toTeamId : c.fromTeamId];
          return (
            <div className="ac-tmg-drawer-collab-row" key={c.id}>
              <span className="ac-mono ac-xs ac-brand-text">{c.id}</span>
              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[HEALTH_META[c.health].tone]}`}>
                {outgoing ? '发起 →' : '← 接收'}
              </span>
              <span className="ac-semi ac-text-1">{other?.name ?? '—'}</span>
              <span className="ac-xs ac-muted">{c.collabType}</span>
              <span className="ac-xs ac-muted ac-ml-auto">
                {c.itemCount} 项 · 等待 {c.avgWaitHours}h / SLA {c.slaHours}h
              </span>
              {c.blockedCount > 0 && (
                <span className="ac-tag ac-tag--sm ac-tag--danger">阻塞 {c.blockedCount}</span>
              )}
            </div>
          );
        })}
        {collabs.length === 0 && <span className="ac-xs ac-muted">该团队本迭代无跨团队协作记录。</span>}
      </div>

      <div className="ac-hint ac-hint--ai ac-mt-4">
        <Bot size={14} />
        <span>
          AI 做了什么：ag-ba 汇总该团队三期效能快照、{members.length} 名成员的负载与技能档案、{sprintTasks.length} 个当期工作项与{' '}
          {collabs.length} 条协作记录，生成上方的画像摘要与改进建议。依据：TEAM_METRICS / MEMBER_PROFILES / WORKLOADS / TASKS / TEAM_COLLABS 五个数据集的交叉引用。
          人工如何介入：负责人可在「协作与依赖」页对同源建议执行采纳 / 转派 / 驳回，或在「排期甘特」页调整工作项归属。
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 仪式议程 / 纪要生成 */

interface AgendaDraft {
  text: string;
  items: string[];
  preReads: string[];
}

/** 由真实的仪式定义 + 当期效能 / 协作数据生成 AI 议程草稿 */
function buildAgenda(c: CeremonyDef): AgendaDraft {
  const owner = ROLE_MAP[c.ownerRoleId];
  const ownerUser = USERS.filter((u) => !u.isAi && u.roleId === c.ownerRoleId)[0];
  const attendeeNames = c.attendeeRoleIds
    .map((rid) => USERS.filter((u) => !u.isAi && u.roleId === rid).map((u) => u.name))
    .reduce<string[]>((acc, list) => acc.concat(list), []);
  const dangerTeams = TEAMS.filter((t) => metricOf(t.id, 'SP-24')?.tone === 'danger');
  const blocked = TEAM_COLLABS.filter((x) => x.blockedCount > 0);
  const assist = AI_ASSIST_META[c.aiAssist];

  const items: string[] = [
    `上轮行动项回顾（当前按期关闭率 ${c.actionItemCloseRatePct}%，出席率 ${c.attendanceRatePct}%）`,
  ];
  if (c.aiAssist !== 'none') {
    items.push(`AI 预读材料通报（${assist.label}）：${c.aiOutput.slice(0, 46)}…`);
  }
  items.push(
    `当期指标快照：SP-24 组织承诺达成率 67.7%（65 / 96 点），${dangerTeams.length} 个团队 tone = danger（${dangerTeams
      .map((t) => TEAM_SHORT[t.id])
      .join('、')}）`,
  );
  if (blocked.length > 0) {
    items.push(
      `阻塞项裁决：${blocked.map((b) => `${b.id}（${TEAM_SHORT[b.fromTeamId]} → ${TEAM_SHORT[b.toTeamId]}，等待 ${b.avgWaitHours}h / SLA ${b.slaHours}h，阻塞 ${b.blockedCount} 项）`).join('；')}`,
    );
  }
  items.push(`决策项与责任人确认（主持：${owner?.name ?? c.ownerRoleId}${ownerUser ? ` · ${ownerUser.name}` : ''}）`);
  items.push(`行动项登记：每条须含责任人 + 时限 + 验收口径，未登记责任人的行动项不进入纪要`);

  const preReads: string[] = [
    `TEAM_METRICS 三期快照（SP-22 / SP-23 / SP-24 共 ${TEAM_METRICS.length} 条）`,
    `TEAM_COLLABS 协作明细（${TEAM_COLLABS.length} 条，其中 ${blocked.length} 条存在阻塞）`,
  ];
  if (c.ownerRoleId === 'ops' || c.ownerRoleId === 'architect') {
    preReads.push('ARCH_COMPONENTS 组件状态与 REL-2403 门禁结论（G3 / G4 未通过）');
  }
  if (c.ownerRoleId === 'product') {
    preReads.push('需求池 20 条候选与 10 轮评审记录（REQ_POOL / REQ_REVIEWS）');
  }
  if (c.ownerRoleId === 'pmo') {
    preReads.push('WORKLOADS 负载快照（周浩然 223.8% / 沈亦白 181.0% 两项过载）');
  }

  const text = [
    `# ${c.name} · AI 生成议程草稿`,
    ``,
    `- 仪式编号：${c.id}`,
    `- 节奏：${c.cadence}`,
    `- 时长：${c.durationMin} 分钟（AI 建议压缩至 ${Math.max(10, Math.round(c.durationMin * 0.75))} 分钟）`,
    `- 主持：${owner?.name ?? c.ownerRoleId}${ownerUser ? `（${ownerUser.name}）` : ''}`,
    `- 参与角色：${c.attendeeRoleIds.map((rid) => ROLE_MAP[rid]?.short ?? rid).join(' / ')}`,
    `- 建议出席人：${attendeeNames.length > 0 ? attendeeNames.join('、') : '按角色自动邀请'}`,
    `- 上次召开：${c.lastHeldAt}`,
    `- AI 介入程度：${assist.label}（${assist.desc}）`,
    ``,
    `## 议程（${items.length} 项）`,
    ...items.map((it, i) => `${i + 1}. ${it}`),
    ``,
    `## AI 会前预读材料（${preReads.length} 份）`,
    ...preReads.map((p, i) => `${i + 1}. ${p}`),
    ``,
    `## AI 已产出的物料`,
    c.aiOutput,
    ``,
    `> 生成者：ag-pm（需求澄清 Agent）+ ag-ba（效能分析 Agent）· 生成时间 ${TODAY} 08:55 · 模型 Claude 3.7 Sonnet`,
    `> 人工介入：可调整议程顺序、把任一项改为「仅通报不讨论」，或删除 AI 追加的阻塞裁决项。`,
  ].join('\n');

  return { text, items, preReads };
}

/** 由仪式定义生成 AI 纪要模板（会中实时填充） */
function buildMinutes(c: CeremonyDef): string {
  const assist = AI_ASSIST_META[c.aiAssist];
  const gap = 100 - c.actionItemCloseRatePct;
  return [
    `# ${c.name} · 会议纪要（AI 实时填充）`,
    ``,
    `## 一、基本信息`,
    `- 时间 / 时长：{{startedAt}} ~ {{endedAt}}（计划 ${c.durationMin} 分钟，实际 {{actualMin}} 分钟）`,
    `- 主持：${ROLE_MAP[c.ownerRoleId]?.name ?? c.ownerRoleId}（{{chairName}}）`,
    `- 出席：{{attended}} / {{invited}} 人（出席率 {{attendancePct}}%，上次 ${c.attendanceRatePct}%）`,
    `- 缺席与委托：{{absentList}}`,
    `- 记录：ag-pm 自动转写 + {{reviewer}} 人工校订`,
    ``,
    `## 二、议题结论（逐条对应议程）`,
    `| # | 议题 | 结论 | 决策人 | 依据数据 |`,
    `| - | ---- | ---- | ------ | -------- |`,
    `| 1 | 上轮行动项回顾 | {{conclusion1}} | {{owner1}} | 关闭率 ${c.actionItemCloseRatePct}% |`,
    `| 2 | 当期指标快照 | {{conclusion2}} | {{owner2}} | SP-24 达成率 67.7% |`,
    `| 3 | 阻塞项裁决 | {{conclusion3}} | {{owner3}} | COOP-02 / COOP-05 |`,
    ``,
    `## 三、行动项（未填责任人的条目不会被写入纪要）`,
    `| # | 行动项 | 责任人 | 时限 | 验收口径 | SLA |`,
    `| - | ------ | ------ | ---- | -------- | --- |`,
    `| A1 | {{action1}} | {{who1}} | {{due1}} | {{dod1}} | {{sla1}} |`,
    `| A2 | {{action2}} | {{who2}} | {{due2}} | {{dod2}} | {{sla2}} |`,
    ``,
    `## 四、AI 附加分析`,
    `- 本次会议 AI 介入程度：${assist.label}（${assist.desc}）`,
    `- 行动项关闭率风险：当前 ${c.actionItemCloseRatePct}%，距 100% 尚有 ${gap} 个百分点缺口，` +
      `历史流失主因为「未确认责任人」与「无验收口径」，本模板已把两者设为必填。`,
    `- AI 建议的下次会议前置动作：{{nextPreAction}}`,
    ``,
    `> 分发：飞书群「订单中心重构 · SP-24」+ 行动项自动回写 PingCode 工作项备注`,
    `> 人工介入：主持人须在散会前确认第二、三节的全部 {{占位符}} 已被替换；未确认的纪要标记为 draft，不进入版本基线。`,
  ].join('\n');
}
