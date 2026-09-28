/**
 * 人员管理（pageId: people）
 *
 * 标签页：
 *  1. 成员名册 roster   —— 汇总指标 / 角色·职级分布（手绘 SVG）/ 10 张成员卡 / 15 列成员表（筛选 + 搜索 + 排序）/ 档案抽屉
 *  2. 技能矩阵 skill    —— 9 人 × 14 技能热力网格（手绘 SVG）/ 技能维度与人员维度汇总 / AI 技能洞察 / 单元格抽屉
 *  3. 产能与负载 workload —— 负载条形图（手绘 SVG，超产能部分 danger 叠加）/ 11 列负载表 / AI 再平衡建议 / u-yan 反差案例
 *  4. AI 协作偏好 ai-pref —— 9 张偏好卡（含手绘 SVG 五星）/ 采纳率对比条 + 团队均值线 / 拒绝理由聚合环形图 / 提示词模板分布
 *  5. 成长与认证 growth —— 8 张证书登记表（临期/过期标色）/ 10 份成长计划卡 / AI 成长建议 / 团队能力雷达（手绘 SVG 双多边形）
 *
 * 数据口径：../data-mgmt 的人员管理段（SKILLS / SKILL_MATRIX / CERTIFICATIONS / MEMBER_PROFILES / WORKLOADS /
 * AI_COLLAB_PREFS / HUMAN_USER_IDS / TEAM_MAP）+ ../data 的共享基础（USERS / USER_MAP / ROLES / ROLE_MAP /
 * SPRINTS / CURRENT_SPRINT / TASKS / TASK_MAP / TODAY / SDLC_STAGES / agents / models）。
 * 页内不新增任何数据字段，所有派生指标均在注释中写明算式。
 */
import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  Bot,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Coins,
  Cpu,
  FileText,
  Fingerprint,
  GraduationCap,
  Handshake,
  HeartPulse,
  IdCard,
  Info,
  Layers,
  ListChecks,
  Medal,
  Plus,
  Radar,
  RefreshCw,
  Scale,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  FormGroupTitle,
  FormGrid,
  MultiPickField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
  cleanErrors,
  requireNumber,
  requireText,
} from '../components/FormFields';
import {
  CURRENT_SPRINT,
  ROLES,
  ROLE_MAP,
  SDLC_STAGES,
  TASK_MAP,
  TODAY,
  USERS,
  USER_MAP,
  agents,
  models,
} from '../data';
import type { Tone, UserDef } from '../data';
import {
  AI_COLLAB_PREFS,
  CERTIFICATIONS,
  HUMAN_USER_IDS,
  MEMBER_PROFILES,
  MEMBER_PROFILE_MAP,
  SKILLS,
  SKILL_MATRIX,
  SKILL_MATRIX_BY_USER,
  TEAMS,
  TEAM_MAP,
  WORKLOADS,
} from '../data-mgmt';
import type {
  AiCollabPrefDef,
  CertificationDef,
  MemberProfileDef,
  SkillDef,
  SkillMatrixCell,
  WorkloadDef,
} from '../data-mgmt';
import './people.css';

/* ================================================================== 常量 */

/** 语义色 → 十六进制（与 style.css 设计 token 一致，用于手绘 SVG 填色） */
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

type TabId = 'roster' | 'skill' | 'workload' | 'ai-pref' | 'growth';

const TABS: { id: TabId; name: string; icon: typeof Users; count: number }[] = [
  { id: 'roster', name: '成员名册', icon: Users, count: MEMBER_PROFILES.length },
  { id: 'skill', name: '技能矩阵', icon: Layers, count: SKILL_MATRIX.length },
  { id: 'workload', name: '产能与负载', icon: Activity, count: WORKLOADS.length },
  { id: 'ai-pref', name: 'AI 协作偏好', icon: Bot, count: AI_COLLAB_PREFS.length },
  { id: 'growth', name: '成长与认证', icon: GraduationCap, count: CERTIFICATIONS.length },
];

/** 技能等级 1~5 → 热力格填色与文字色（等级越高越深，与 style.css 的 ac-heat-cell--1..5 同色系） */
const LEVEL_FILL: Record<number, string> = {
  1: '#f1f3f8',
  2: '#dfe6fd',
  3: '#b9c4fa',
  4: '#7c86ee',
  5: '#4338ca',
};

const LEVEL_TEXT: Record<number, string> = {
  1: '#5b6675',
  2: '#3f4a5c',
  3: '#312e81',
  4: '#ffffff',
  5: '#ffffff',
};

/** 技能等级语义（用于图例与洞察文案） */
const LEVEL_LABEL: Record<number, string> = {
  1: '了解概念',
  2: '在指导下可完成',
  3: '可独立交付',
  4: '可指导他人',
  5: '可定义标准',
};

/** 业务需求强度 → 文案、标签语义与「团队目标熟练度」 */
const DEMAND_META: Record<SkillDef['demandLevel'], { label: string; tagTone: string; target: number }> = {
  critical: { label: '关键', tagTone: 'danger', target: 4.2 },
  high: { label: '高', tagTone: 'warn', target: 3.6 },
  medium: { label: '中', tagTone: 'info', target: 3.0 },
};

/** 用工形式 → 标签语义 */
const EMPLOYMENT_TAG: Record<MemberProfileDef['employmentType'], string> = {
  正式: 'ok',
  外包: 'warn',
  实习: 'info',
  'AI 账号': 'ai',
};

/** 在岗状态 → 标签语义 */
const STATUS_TAG: Record<MemberProfileDef['statusLabel'], string> = {
  在岗: 'ok',
  休假: 'info',
  借调: 'warn',
  离职交接: 'danger',
};

/** 职级序列（用于分布图的固定横轴顺序） */
const SENIORITY_ORDER: MemberProfileDef['seniority'][] = ['P4', 'P5', 'P6', 'P7', 'P8'];

/** 自动采纳范围 → 中文（AiCollabPrefDef.autoAcceptScope 的 5 个枚举值） */
const AUTO_ACCEPT_LABEL: Record<AiCollabPrefDef['autoAcceptScope'], string> = {
  none: '不自动采纳（逐条人工确认）',
  tests: '仅测试代码自动采纳',
  docs: '仅文档自动采纳',
  refactor: '仅重构自动采纳',
  all: '全部自动采纳',
};

/** 认证临期阈值（天）：剩余有效期 ≤ 90 天记为临期，< 0 记为已过期 */
const CERT_WARN_DAYS = 90;

/**
 * AI 建议拒绝理由的归类规则（按顺序命中即停）。
 * 输入为 MemberProfileDef.aiRejectReasons 的 27 条原文，输出为 11 个类目，
 * 用于「拒绝理由聚合 top5 + 其他」的环形图与 AI 改进方向结论。
 */
const REJECT_RULES: { cat: string; re: RegExp }[] = [
  { cat: '安全与合规风险', re: /合规|授权|脱敏|生产库快照/ },
  { cat: '发布与运维不完备', re: /回滚|告警|门禁阈值|发布|运维/ },
  { cat: '测试覆盖不足', re: /未覆盖|覆盖率|断言|正常路径|边界与并发/ },
  { cat: '违反架构与编码规约', re: /分层约束|目录约定|设计令牌|组合式 API|pom|依赖版本|红线约束|KB-ARCH|KB-CODE/ },
  { cat: '契约与接口不完备', re: /契约|错误码/ },
  { cat: '领域正确性缺陷', re: /分片键|幂等|精度|key 稳定性|前后置依赖|产能|在途阻塞|重复投递|重排抖动/ },
  { cat: '范围越界', re: /超出任务卡边界|过度引申|超出原始诉求/ },
  { cat: '粒度与结构不规范', re: /粒度/ },
  { cat: '可操作性不足', re: /笼统|不可测|量化阈值|可执行/ },
  { cat: '缺少依据与可解释性', re: /数据来源|权衡依据|标注|只给结论/ },
  { cat: '口径与风格不符', re: /口径|语气|风格|不一致/ },
];

/** 类目固定顺序：计数相同时按此顺序决定 top5 的取舍，保证结果可复现 */
const REJECT_ORDER = REJECT_RULES.map((r) => r.cat);

/** 每个类目对应的「AI 改进方向」结论 */
const REJECT_IMPROVE: Record<string, string> = {
  违反架构与编码规约: '把 KB-ARCH-01 分层约束、KB-CODE-02 金额规约与目录/设计令牌规范提升为强制召回项，并在 ag-review 中前置为阻断规则，避免生成后再返工。',
  领域正确性缺陷: '为分片、幂等、金额精度、消息重复投递四类高频错误补充「反例提示词 + 断言模板」，并要求 AI 输出必须附带命中分片键的 EXPLAIN 证据。',
  发布与运维不完备: '在 ag-ops 的回滚与告警生成模板中固化「数据一致性校验 + 维护窗口静默 + 项目基线阈值」三个必填段，缺项直接拒绝产出。',
  测试覆盖不足: '把「异常分支 / 并发 / 金额边界」写入 ag-test 的用例生成契约，覆盖率不只看行覆盖，同时校验分支与断言强度。',
  范围越界: '在会话上下文里显式注入任务卡边界与需求原始诉求，超出边界的改动一律降级为「建议」而非直接改码。',
  粒度与结构不规范: '统一用户故事与任务拆解的粒度标尺（3 / 5 / 8 点三档），AI 拆解结果必须回填档位理由，避免大小混杂导致估算失真。',
  可操作性不足: '要求每条建议附带「谁、在哪个工作项、做什么、何时完成」四要素，缺要素的建议不进入待办。',
  缺少依据与可解释性: '强制在结论后追加数据来源字段与采样口径，多方案对比必须给出权衡矩阵而非单一结论。',
  口径与风格不符: '为对内汇报与对外宣传分别建立语气模板，指标口径以效能看板为唯一真源。',
  契约与接口不完备: '接口生成必须包含错误码表与幂等语义声明，缺项由 ag-arch 阻断。',
  安全与合规风险: '禁止 AI 使用生产库快照构造测试数据，统一走脱敏数据集；涉及导出的功能强制二次授权校验。',
};

/* ================================================================== 工具函数 */

/** 数字千分位 */
function num(v: number) {
  return v.toLocaleString('zh-CN');
}

/** 保留 n 位小数 */
function fmt(v: number, d = 1) {
  return v.toFixed(d);
}

/** 'YYYY-MM-DD' → 整数天序号 */
function dayIdx(dateStr: string) {
  return Math.round(Date.parse(`${dateStr}T00:00:00Z`) / 86400000);
}

/** 距 TODAY 的天数（正数 = 未来，负数 = 已过期） */
function daysFromToday(dateStr: string) {
  return dayIdx(dateStr) - dayIdx(TODAY);
}

/** 司龄（年）= (TODAY − joinDate) ÷ 365.25 */
function tenureYears(joinDate: string) {
  return dayIdx(TODAY) >= dayIdx(joinDate) ? (dayIdx(TODAY) - dayIdx(joinDate)) / 365.25 : 0;
}

/** 截断长文本 */
function cut(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 负载率 → 语义色（口径同 data-mgmt.ts D 节：≥150 danger / 80~149.9 warn / <80 ok） */
function loadTone(loadPct: number): Tone {
  if (loadPct >= 150) return 'danger';
  if (loadPct >= 80) return 'warn';
  return 'ok';
}

/** 某成员在平台内承担评审的任务数（TASKS.reviewerId 计数） */
function reviewCountOf(userId: string) {
  return Object.values(TASK_MAP).filter((t) => t.reviewerId === userId).length;
}

/** 取成员所属团队名（teamIds 可能为空，如 AI 共享账号） */
function teamNamesOf(p: MemberProfileDef) {
  return p.teamIds.length ? p.teamIds.map((id) => TEAM_MAP[id]?.name ?? id).join(' / ') : '平台级共享资源';
}

/** 该成员的技能矩阵行（按等级降序、同等级按 AI 依赖度升序） */
function skillRowOf(userId: string) {
  return [...(SKILL_MATRIX_BY_USER[userId] ?? [])].sort(
    (a, b) => b.level - a.level || a.aiAssistRatePct - b.aiAssistRatePct,
  );
}

/** 拒绝理由归类 */
function classifyReject(reason: string) {
  const hit = REJECT_RULES.find((r) => r.re.test(reason));
  return hit ? hit.cat : '其他';
}

/** 极坐标 → 直角坐标（0° 指向正上方，顺时针） */
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** 环形图扇区路径 */
function donutSeg(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number) {
  const p1 = polar(cx, cy, rOuter, a0);
  const p2 = polar(cx, cy, rOuter, a1);
  const p3 = polar(cx, cy, rInner, a1);
  const p4 = polar(cx, cy, rInner, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(
    2,
  )} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${rInner} ${rInner} 0 ${large} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
}

/** 五角星路径（用于 AI 满意度评分的手绘 SVG 五星） */
function starPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const rad = ((i * 36 - 90) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * 0.44;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(2)},${(cy + rr * Math.sin(rad)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/* ================================================================== 派生统计类型 */

/** 技能维度汇总 */
interface SkillStat {
  skill: SkillDef;
  cells: SkillMatrixCell[];
  holders: number;
  experts: number;
  masters: number;
  avg: number;
  topUser: string;
  singlePoint: boolean;
}

/** 人员维度汇总 */
interface PersonSkillStat {
  userId: string;
  breadth: number;
  depth: number;
  avg: number;
  best: SkillMatrixCell | null;
  certCount: number;
  aiAssistAvg: number;
  lastUsed: string;
}

/** AI 技能洞察条目 */
interface SkillInsight {
  id: string;
  level: 'danger' | 'warn' | 'info' | 'ok';
  title: string;
  signals: { source: string; value: string }[];
  action: string;
}

/** AI 产能再平衡建议 */
interface RebalanceItem {
  id: string;
  kind: 'transfer' | 'release' | 'absorb' | 'bottleneck';
  fromId: string;
  toId: string;
  taskIds: string[];
  points: number;
  basis: string;
  action: string;
}

/** AI 成长建议 */
interface GrowthAdvice {
  id: string;
  userId: string;
  level: 'danger' | 'warn' | 'info';
  title: string;
  signals: { source: string; value: string }[];
  action: string;
}

/* ================================================================== 派生计算 */

/** 技能维度汇总：掌握人数（level ≥ 3）/ 专家数（≥ 4）/ 大师数（= 5）/ 平均熟练度 / 单点风险 */
function buildSkillStats(): SkillStat[] {
  return SKILLS.map((skill) => {
    const cells = SKILL_MATRIX.filter((c) => c.skillId === skill.id);
    const holders = cells.filter((c) => c.level >= 3).length;
    const experts = cells.filter((c) => c.level >= 4).length;
    const masters = cells.filter((c) => c.level === 5).length;
    const avg = cells.length ? cells.reduce((s, c) => s + c.level, 0) / cells.length : 0;
    const top = [...cells].sort((a, b) => b.level - a.level || a.aiAssistRatePct - b.aiAssistRatePct)[0];
    return {
      skill,
      cells,
      holders,
      experts,
      masters,
      avg,
      topUser: top ? top.userId : '',
      /** 单点风险：仅 1 人达到 level ≥ 4，且该技能需求强度为 critical / high */
      singlePoint: experts === 1 && skill.demandLevel !== 'medium',
    };
  });
}

/** 人员维度汇总：覆盖广度（level ≥ 3 的技能数）/ 深度（≥ 4）/ 平均等级 / 认证数 / AI 辅助均值 */
function buildPersonStats(): PersonSkillStat[] {
  return HUMAN_USER_IDS.map((userId) => {
    const cells = SKILL_MATRIX_BY_USER[userId] ?? [];
    const breadth = cells.filter((c) => c.level >= 3).length;
    const depth = cells.filter((c) => c.level >= 4).length;
    const avg = cells.length ? cells.reduce((s, c) => s + c.level, 0) / cells.length : 0;
    const best = [...cells].sort((a, b) => b.level - a.level || a.aiAssistRatePct - b.aiAssistRatePct)[0] ?? null;
    const aiAssistAvg = cells.length ? cells.reduce((s, c) => s + c.aiAssistRatePct, 0) / cells.length : 0;
    const lastUsed = cells.reduce((m, c) => (c.lastUsedAt > m ? c.lastUsedAt : m), '');
    return {
      userId,
      breadth,
      depth,
      avg,
      best,
      certCount: (MEMBER_PROFILE_MAP[userId]?.certifications ?? []).length,
      aiAssistAvg,
      lastUsed,
    };
  });
}

/**
 * AI 技能洞察（全部由 SKILL_MATRIX / SKILLS / MEMBER_PROFILES 既有字段派生）：
 *   ① 单点依赖：仅 1 人 level ≥ 4 且 demandLevel 为 critical / high
 *   ② 关键技能缺口：demandLevel = critical 且团队平均熟练度 < 3.0
 *   ③ AI 补位倒挂：level ≤ 2 的单元格 AI 辅助率均值 明显高于 level ≥ 4
 *   ④ 认证覆盖：certified = true 的单元格占比
 */
function buildSkillInsights(stats: SkillStat[]): SkillInsight[] {
  const out: SkillInsight[] = [];

  stats
    .filter((s) => s.singlePoint)
    .forEach((s) => {
      const only = s.cells.filter((c) => c.level >= 4)[0];
      const backup = [...s.cells]
        .filter((c) => c.userId !== only.userId)
        .sort((a, b) => b.level - a.level || a.aiAssistRatePct - b.aiAssistRatePct)[0];
      const onlyUser = USER_MAP[only.userId];
      const backupUser = USER_MAP[backup.userId];
      out.push({
        id: `sp-${s.skill.id}`,
        level: s.skill.demandLevel === 'critical' ? 'danger' : 'warn',
        title: `单点依赖：「${s.skill.name}」全团队仅 ${onlyUser?.name ?? only.userId} 一人达到 level ${only.level}`,
        signals: [
          { source: `SKILLS[${s.skill.id}].demandLevel`, value: `${DEMAND_META[s.skill.demandLevel].label}（稀缺度 ${s.skill.scarcityPct}%）` },
          { source: 'SKILL_MATRIX 统计', value: `level ≥ 4 共 ${s.experts} 人 / ${s.cells.length} 人；团队平均 ${fmt(s.avg, 2)}` },
          { source: `候选 backup ${backup.userId}`, value: `${backupUser?.name ?? backup.userId} 当前 level ${backup.level}，最近使用 ${backup.lastUsedAt}，AI 辅助率 ${backup.aiAssistRatePct}%` },
          { source: `SKILLS[${s.skill.id}].relatedRef`, value: s.skill.relatedRef },
        ],
        action: `在 ${s.skill.relatedRef.startsWith('KB-') ? `${s.skill.relatedRef} 的基础上由 AI 生成个性化学习路径` : `SP-25 的 ${s.skill.relatedRef} 相关工作项上`}安排 ${backupUser?.name ?? backup.userId} 与 ${onlyUser?.name ?? only.userId} 结对 2 周，目标把 backup 从 level ${backup.level} 提到 level 4；结对期间由 ag-review 对 backup 的产出做全量评审，${onlyUser?.name ?? only.userId} 只做方案签核以释放其评审时间。`,
      });
    });

  const criticalGap = stats
    .filter((s) => s.skill.demandLevel === 'critical' && s.avg < 3)
    .sort((a, b) => a.avg - b.avg);
  if (criticalGap.length) {
    out.push({
      id: 'gap-critical',
      level: 'warn',
      title: `关键技能缺口：${criticalGap.length} 项 critical 技能的团队平均熟练度低于「可独立交付」（level 3）`,
      signals: criticalGap.map((s) => ({
        source: `SKILLS[${s.skill.id}] ${s.skill.name}`,
        value: `平均 ${fmt(s.avg, 2)} · 掌握 ${s.holders} 人 · 专家 ${s.experts} 人 · 稀缺度 ${s.skill.scarcityPct}%`,
      })),
      action: `把这 ${criticalGap.length} 项纳入 SP-25 ~ SP-26 的团队能力建设目标：每项指定 1 名 level ≥ 4 的成员做教练，用 AI 生成的实战任务（而非课程）作为训练载体，两个月后以「独立交付一次相关工作项」为验收标准复测矩阵。`,
    });
  }

  const lowCells = SKILL_MATRIX.filter((c) => c.level <= 2);
  const highCells = SKILL_MATRIX.filter((c) => c.level >= 4);
  const lowAi = lowCells.reduce((s, c) => s + c.aiAssistRatePct, 0) / Math.max(lowCells.length, 1);
  const highAi = highCells.reduce((s, c) => s + c.aiAssistRatePct, 0) / Math.max(highCells.length, 1);
  out.push({
    id: 'ai-offset',
    level: 'info',
    title: `AI 正在补位低阶技能：level ≤ 2 的单元格 AI 辅助率均值 ${fmt(lowAi)}%，比 level ≥ 4 的 ${fmt(highAi)}% 高出 ${fmt(lowAi - highAi)} 个百分点`,
    signals: [
      { source: 'SKILL_MATRIX.aiAssistRatePct', value: `level ≤ 2 共 ${lowCells.length} 格，均值 ${fmt(lowAi)}%` },
      { source: 'SKILL_MATRIX.aiAssistRatePct', value: `level ≥ 4 共 ${highCells.length} 格，均值 ${fmt(highAi)}%` },
      { source: '口径说明', value: 'data-mgmt.ts G 节约定：等级越低越依赖 AI 辅助（level 5 → 38~52%，level 1 → 86~94%）' },
    ],
    action: '把「AI 辅助率 > 85% 且 level ≤ 2」的组合作为技能风险清单交给对应成员的成长计划：这类工作当前能交付，但一旦 AI 产出被驳回就无人可接手，应优先安排人工实操而非继续提高 AI 依赖。',
  });

  const certified = SKILL_MATRIX.filter((c) => c.certified).length;
  out.push({
    id: 'cert-coverage',
    level: certified / SKILL_MATRIX.length < 0.15 ? 'warn' : 'ok',
    title: `认证对矩阵的覆盖率仅 ${fmt((certified / SKILL_MATRIX.length) * 100)}%（${certified} / ${SKILL_MATRIX.length} 格 certified = true）`,
    signals: [
      { source: 'CERTIFICATIONS', value: `${CERTIFICATIONS.length} 张证书覆盖 ${Array.from(new Set(CERTIFICATIONS.flatMap((c) => c.relatedSkillIds))).length} / ${SKILLS.length} 项技能` },
      { source: '未覆盖技能', value: SKILLS.filter((s) => !CERTIFICATIONS.some((c) => c.relatedSkillIds.includes(s.id))).map((s) => s.name).join('、') || '无' },
    ],
    action:
      '认证只覆盖部分技能，不能作为能力唯一凭据；矩阵中 certified = false 但 level ≥ 4 的格子应由架构组做一次实操复核，把「自评等级」与「可验证证据」对齐后再用于排期决策。',
  });

  const order = { danger: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 6);
}

/** 从 WORKLOADS 的既有 suggestedAction / riskNote 组装结构化的产能再平衡建议 */
function buildRebalance(): RebalanceItem[] {
  const wl = (id: string) => WORKLOADS.find((w) => w.userId === id);
  const zhou = wl('u-zhou');
  const shen = wl('u-shen');
  const chen = wl('u-chen');
  const yan = wl('u-yan');
  const items: RebalanceItem[] = [];

  if (zhou && shen) {
    items.push({
      id: 'RB-01',
      kind: 'transfer',
      fromId: 'u-zhou',
      toId: 'u-shen',
      taskIds: ['TASK-2415'],
      points: TASK_MAP['TASK-2415']?.points ?? 8,
      basis: `周浩然负载 ${zhou.loadPct}%（${zhou.allocatedPoints} / ${zhou.capacityPoints} 点），TASK-2415 当前 ${TASK_MAP['TASK-2415']?.stateLabel ?? ''}、进度 ${TASK_MAP['TASK-2415']?.progress ?? 0}%，AI 已产出拆单方案；沈亦白 SK-06「RabbitMQ 与事件驱动架构」level 5，是该任务的事件链路强项。`,
      action: `把 TASK-2415（拆单引擎，${TASK_MAP['TASK-2415']?.points ?? 8} 点）从周浩然转交沈亦白，方案由严慕舟签核；转出后周浩然负载降至 ${fmt(((zhou.allocatedPoints - (TASK_MAP['TASK-2415']?.points ?? 8)) / zhou.capacityPoints) * 100)}%。`,
    });
  }

  if (shen && chen) {
    items.push({
      id: 'RB-02',
      kind: 'transfer',
      fromId: 'u-shen',
      toId: 'u-chen',
      taskIds: ['TASK-2408'],
      points: TASK_MAP['TASK-2408']?.points ?? 3,
      basis: `沈亦白负载 ${shen.loadPct}%、近 30 日缺陷逃逸 ${MEMBER_PROFILE_MAP['u-shen']?.defectEscapeCount30d ?? 0} 个为团队最高；TASK-2408（审计流水，${TASK_MAP['TASK-2408']?.points ?? 3} 点）前端只需订阅展示，陈屿负载 ${chen?.loadPct ?? 0}% 有 ${Math.max(0, (chen?.capacityPoints ?? 0) - (chen?.allocatedPoints ?? 0))} 点空闲产能。`,
      action: `把 TASK-2408 从沈亦白转交陈屿，沈亦白保留 TASK-2410（金额精度）与 TASK-2420（双写校验）两项资损相关任务；调整后沈亦白负载 ${fmt(((shen.allocatedPoints - (TASK_MAP['TASK-2408']?.points ?? 3)) / shen.capacityPoints) * 100)}%。`,
    });
  }

  if (shen) {
    const released = ['TASK-2402', 'TASK-2417'];
    const pts = released.reduce((s, id) => s + (TASK_MAP[id]?.points ?? 0), 0);
    items.push({
      id: 'RB-03',
      kind: 'release',
      fromId: 'u-shen',
      toId: '',
      taskIds: released,
      points: pts,
      basis: `${released.map((id) => `${id}（${TASK_MAP[id]?.stateLabel ?? ''}）`).join('、')} 已完成交付，但仍计入在途负载快照；沈亦白 aiOffloadPoints 为 ${shen.aiOffloadPoints} 点，AI 已分担其约 ${fmt((shen.aiOffloadPoints / Math.max(shen.allocatedPoints, 1)) * 100, 0)}% 的编码量。`,
      action: `在 WORKLOADS 快照中把已发布的 ${released.join(' / ')} 共 ${pts} 点移出在途负载，使负载率反映真实剩余工作量；同步把 SP-24 收口后的 ${pts} 点产能预留给 G3 覆盖率补齐。`,
    });
  }

  if (chen) {
    items.push({
      id: 'RB-04',
      kind: 'absorb',
      fromId: '',
      toId: 'u-chen',
      taskIds: ['TASK-2416'],
      points: Math.max(0, chen.capacityPoints - chen.allocatedPoints),
      basis: `陈屿负载 ${chen.loadPct}%（${chen.allocatedPoints} / ${chen.capacityPoints} 点）为研发角色最低，TASK-2416（拆单聚合视图，${TASK_MAP['TASK-2416']?.points ?? 5} 点）因 API-10 契约未冻结而进度 ${TASK_MAP['TASK-2416']?.progress ?? 0}%，endDate ${TASK_MAP['TASK-2416']?.endDate ?? ''} 已进入迭代最后一周。`,
      action: `基于 ag-arch 产出的履约回调 Mock Server 先行启动 TASK-2416，不必等待契约冻结；再承接 RB-01 / RB-02 转出的联调部分，把 ${Math.max(0, chen.capacityPoints - chen.allocatedPoints)} 点空闲产能利用率提升到 78%。`,
    });
  }

  if (yan) {
    items.push({
      id: 'RB-05',
      kind: 'bottleneck',
      fromId: 'u-yan',
      toId: 'u-yan',
      taskIds: ['TASK-2407', 'TASK-2415'],
      points: yan.aiOffloadPoints,
      basis: `严慕舟故事点负载仅 ${yan.loadPct}%（${yan.allocatedPoints} / ${yan.capacityPoints} 点），但他是 ${reviewCountOf('u-yan')} 个任务的 reviewerId、API-10 拆单契约的冻结责任人，${yan.riskNote}`,
      action: '故事点口径掩盖了评审瓶颈：① 设置每日 14:00~16:00 固定评审窗口，规约类问题前移给 ag-review 拦截；② TASK-2407 的技术选型交给 ag-arch 输出方案对比矩阵后只做签核；③ 人工评审聚焦事务边界与分片语义，预计把跨团队协作的平均等待时长再压缩 40%。',
    });
  }

  return items;
}

/** 每人 1~2 条 AI 成长建议（技能缺口 + 认证有效期 + 缺陷逃逸 + 负载 + AI 采纳率） */
function buildGrowthAdvice(stats: SkillStat[]): GrowthAdvice[] {
  const out: GrowthAdvice[] = [];
  MEMBER_PROFILES.forEach((p) => {
    const u = USER_MAP[p.userId];
    if (!u) return;
    const cells = SKILL_MATRIX_BY_USER[p.userId] ?? [];
    const items: GrowthAdvice[] = [];

    /* ① 缺陷逃逸 */
    if (p.defectEscapeCount30d >= 2) {
      const rank = MEMBER_PROFILES.filter((m) => m.defectEscapeCount30d > p.defectEscapeCount30d).length + 1;
      items.push({
        id: `${p.userId}-escape`,
        userId: p.userId,
        level: 'danger',
        title: `近 30 日缺陷逃逸 ${p.defectEscapeCount30d} 个（团队第 ${rank} 高），需把质量前移到自测环节`,
        signals: [
          { source: 'MemberProfileDef.defectEscapeCount30d', value: `${p.defectEscapeCount30d} 个 / 30 日` },
          { source: 'MemberProfileDef.prCount30d', value: `${p.prCount30d} 个 PR · 平均评审耗时 ${p.reviewAvgMin} 分钟` },
          { source: 'MemberProfileDef.overtimeHoursMonth', value: `本月加班 ${p.overtimeHoursMonth} 小时` },
        ],
        action: `把 ${p.defectEscapeCount30d} 个逃逸缺陷逐条回溯到用例缺口，用 ag-test 生成对应的边界与并发用例并纳入个人 PR 的自检清单；下一个 30 日目标降到 1 个以内，与该成员 growthPlan 中的既有行动项对齐。`,
      });
    }

    /* ② 关键技能短板 */
    const weak = cells
      .map((c) => ({ cell: c, skill: SKILLS.find((s) => s.id === c.skillId) }))
      .filter((x) => x.skill && x.skill.demandLevel === 'critical' && x.cell.level <= 2)
      .sort((a, b) => a.cell.level - b.cell.level)[0];
    if (weak && weak.skill) {
      const stat = stats.find((s) => s.skill.id === weak.skill!.id);
      items.push({
        id: `${p.userId}-skill`,
        userId: p.userId,
        level: 'warn',
        title: `关键技能短板：「${weak.skill.name}」当前 level ${weak.cell.level}（${LEVEL_LABEL[weak.cell.level]}），而团队需求强度为「关键」`,
        signals: [
          { source: `SKILL_MATRIX[${p.userId}][${weak.skill.id}]`, value: `level ${weak.cell.level} · 最近使用 ${weak.cell.lastUsedAt} · AI 辅助率 ${weak.cell.aiAssistRatePct}%` },
          { source: `SKILLS[${weak.skill.id}].scarcityPct`, value: `${weak.skill.scarcityPct}%（level ≥ 4 的人数缺口占比）` },
          { source: '团队水位', value: stat ? `掌握 ${stat.holders} 人 / 专家 ${stat.experts} 人 / 平均 ${fmt(stat.avg, 2)}` : '—' },
        ],
        action: `AI 辅助率 ${weak.cell.aiAssistRatePct}% 说明这项能力目前主要靠 AI 兜底，一旦建议被驳回就无人接手。建议按「${weak.skill.relatedRef}」相关的真实工作项安排 1 次不依赖 AI 的独立实操，由该技能 level ≥ 4 的成员做教练，目标两个迭代内提到 level 3。`,
      });
    }

    /* ③ 认证有效期 */
    const certs = p.certifications
      .map((id) => CERTIFICATIONS.find((c) => c.id === id))
      .filter(Boolean) as CertificationDef[];
    const soonest = certs.sort((a, b) => dayIdx(a.validUntil) - dayIdx(b.validUntil))[0];
    if (soonest && daysFromToday(soonest.validUntil) <= 365) {
      items.push({
        id: `${p.userId}-cert`,
        userId: p.userId,
        level: daysFromToday(soonest.validUntil) <= CERT_WARN_DAYS ? 'danger' : 'info',
        title: `最近到期的认证「${soonest.name}」剩余 ${daysFromToday(soonest.validUntil)} 天`,
        signals: [
          { source: `CERTIFICATIONS[${soonest.id}].validUntil`, value: `${soonest.validUntil}（发证机构 ${soonest.issuer}）` },
          { source: '关联技能', value: soonest.relatedSkillIds.map((id) => SKILLS.find((s) => s.id === id)?.name ?? id).join('、') },
        ],
        action: `把续证所需的学时 / 积分排入 Q3 个人计划，避免因证书失效导致 SKILL_MATRIX 中 ${certs.reduce((s, c) => s + c.relatedSkillIds.length, 0)} 项技能的 certified 标记被回退。`,
      });
    }

    /* ④ 负载挤占学习时间 */
    if (p.loadPct >= 150) {
      items.push({
        id: `${p.userId}-load`,
        userId: p.userId,
        level: 'danger',
        title: `负载 ${p.loadPct}% 已挤占成长时间，本迭代无法执行任何学习计划`,
        signals: [
          { source: 'MemberProfileDef.loadPct', value: `${p.loadPct}%（${p.allocatedPoints} / ${p.sprintCapacity} 点）` },
          { source: 'MemberProfileDef.overtimeHoursMonth', value: `本月加班 ${p.overtimeHoursMonth} 小时` },
        ],
        action: '先做负载再平衡（见「产能与负载」标签页的 RB-01 ~ RB-03），把负载压到 120% 以内再谈成长计划；否则 growthPlan 的行动项只会持续顺延，反而放大关键人依赖风险。',
      });
    }

    /* ⑤ AI 采纳率偏低 */
    if (!u.isAi && p.aiAcceptRatePct < 72) {
      items.push({
        id: `${p.userId}-ai`,
        userId: p.userId,
        level: 'warn',
        title: `AI 采纳率 ${fmt(p.aiAcceptRatePct)}% 低于团队均值，协作偏好可能未调优`,
        signals: [
          { source: 'MemberProfileDef.aiAcceptRatePct', value: `${fmt(p.aiAcceptRatePct)}%（团队均值 ${fmt(AI_COLLAB_PREFS.reduce((s, x) => s + x.acceptRatePct, 0) / AI_COLLAB_PREFS.length)}%）` },
          { source: 'MemberProfileDef.aiRejectReasons', value: p.aiRejectReasons.join('；') || '—' },
        ],
        action: `拒绝理由集中在「${p.aiRejectReasons.map(classifyReject).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join('、')}」，建议把这些约束写入个人提示词模板并调整 autoAcceptScope，而不是整体降低 AI 使用频率。`,
      });
    }

    out.push(...items.slice(0, 2));
  });
  return out;
}

/* ================================================================== 内联 SVG 图表 */

/** 角色分布横向条形（手绘 SVG） */
function RoleBarChart({ items }: { items: { roleId: string; name: string; count: number; tone: Tone }[] }) {
  const W = 420;
  const labelW = 104;
  const valueW = 46;
  const rowH = 28;
  const chartW = W - labelW - valueW;
  const H = items.length * rowH + 6;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <svg className="ac-pp-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="成员按角色分布">
      {items.map((it, idx) => {
        const y = idx * rowH + 3;
        const w = Math.max(2, (it.count / max) * chartW);
        return (
          <g key={it.roleId}>
            <text className="ac-pp-svg-name" x={0} y={y + 16}>
              {it.name}
            </text>
            <rect className="ac-pp-svg-track" x={labelW} y={y + 6} width={chartW} height={14} rx={4} />
            <rect x={labelW} y={y + 6} width={w} height={14} rx={4} fill={TONE_HEX[it.tone] ?? TONE_HEX.brand} />
            <text className="ac-pp-svg-value" x={W} y={y + 17} textAnchor="end">
              {it.count} 人
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 职级分布柱状（手绘 SVG） */
function SeniorityBarChart({ items }: { items: { label: string; count: number }[] }) {
  const W = 420;
  const H = 168;
  const pl = 30;
  const pb = 26;
  const pt = 16;
  const ph = H - pb - pt;
  const max = Math.max(...items.map((i) => i.count), 1);
  const bw = (W - pl - 10) / items.length;
  return (
    <svg className="ac-pp-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="成员职级分布">
      {[0, 1, 2, 3, 4].map((t) => (
        <g key={t}>
          <line className="ac-pp-svg-grid" x1={pl} y1={pt + ph - (ph * t) / max} x2={W - 6} y2={pt + ph - (ph * t) / max} />
          <text className="ac-pp-svg-tick" x={pl - 6} y={pt + ph - (ph * t) / max + 3.5} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {items.map((it, idx) => {
        const h = (it.count / max) * ph;
        const x = pl + idx * bw + bw * 0.2;
        return (
          <g key={it.label}>
            <rect x={x} y={pt + ph - h} width={bw * 0.6} height={Math.max(h, it.count ? 2 : 0)} rx={3} fill={it.count ? '#4f46e5' : '#e8ebf0'} />
            <text className="ac-pp-svg-value" x={x + (bw * 0.6) / 2} y={pt + ph - h - 5} textAnchor="middle">
              {it.count}
            </text>
            <text className="ac-pp-svg-name" x={x + (bw * 0.6) / 2} y={H - 8} textAnchor="middle">
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 技能矩阵热力网格（手绘 SVG，9 真人 × 14 技能，格内数字为 level 1~5） */
function SkillHeatmap({ onPick }: { onPick: (cell: SkillMatrixCell) => void }) {
  const left = 96;
  const cellW = 44;
  const cellH = 26;
  const headH = 92;
  const rows = HUMAN_USER_IDS;
  const W = left + SKILLS.length * cellW + 10;
  const H = headH + rows.length * cellH + 62;

  return (
    <div className="ac-pp-heat-scroll">
      <svg
        className="ac-pp-svg ac-pp-heat-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="9 位真人成员与 14 项技能的能力等级热力矩阵"
      >
        {/* 列头（斜排技能名） */}
        {SKILLS.map((s, ci) => {
          const x = left + ci * cellW + cellW / 2;
          const y = headH - 8;
          return (
            <g key={s.id}>
              <title>{`${s.id} ${s.name} · ${s.category} · 需求强度 ${DEMAND_META[s.demandLevel].label} · 稀缺度 ${s.scarcityPct}%`}</title>
              <text
                className={`ac-pp-heat-col ${s.demandLevel === 'critical' ? 'ac-pp-heat-col--critical' : ''}`}
                x={x}
                y={y}
                textAnchor="start"
                transform={`rotate(-60 ${x} ${y})`}
              >
                {cut(s.name, 14)}
              </text>
            </g>
          );
        })}

        {/* 行 */}
        {rows.map((uid, ri) => {
          const u = USER_MAP[uid];
          const y = headH + ri * cellH;
          return (
            <g key={uid}>
              <text className="ac-pp-heat-row" x={left - 8} y={y + cellH / 2 + 4} textAnchor="end">
                {u?.name ?? uid}
              </text>
              {SKILLS.map((s, ci) => {
                const cell = SKILL_MATRIX.find((c) => c.userId === uid && c.skillId === s.id);
                const level = cell?.level ?? 0;
                const x = left + ci * cellW;
                return (
                  <g
                    key={s.id}
                    className="ac-pp-heat-cell"
                    onClick={() => cell && onPick(cell)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if ((ev.key === 'Enter' || ev.key === ' ') && cell) onPick(cell);
                    }}
                  >
                    <title>
                      {cell
                        ? `${u?.name ?? uid} × ${s.name}：level ${cell.level}（${LEVEL_LABEL[cell.level]}）· ${cell.certified ? '持有认证' : '无认证'} · 最近使用 ${cell.lastUsedAt} · AI 辅助率 ${cell.aiAssistRatePct}%`
                        : `${u?.name ?? uid} × ${s.name}：无数据`}
                    </title>
                    <rect
                      x={x + 1.5}
                      y={y + 1.5}
                      width={cellW - 3}
                      height={cellH - 3}
                      rx={4}
                      fill={LEVEL_FILL[level] ?? '#f6f7fa'}
                      stroke={cell?.certified ? '#7c3aed' : 'transparent'}
                      strokeWidth={cell?.certified ? 1.6 : 0}
                    />
                    <text
                      className="ac-pp-heat-num"
                      x={x + cellW / 2}
                      y={y + cellH / 2 + 4}
                      textAnchor="middle"
                      fill={LEVEL_TEXT[level] ?? '#98a2b0'}
                    >
                      {level || '—'}
                    </text>
                    {cell?.certified ? <circle cx={x + cellW - 7} cy={y + 7} r={2.4} fill="#7c3aed" /> : null}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* 图例：等级色阶一行，认证标记另起一行，避免与色阶文字重叠 */}
        <g>
          {[1, 2, 3, 4, 5].map((lv, i) => (
            <g key={lv}>
              <rect x={left + i * 96} y={H - 48} width={16} height={14} rx={3} fill={LEVEL_FILL[lv]} />
              <text className="ac-pp-svg-tick" x={left + i * 96 + 22} y={H - 37}>
                L{lv} {LEVEL_LABEL[lv]}
              </text>
            </g>
          ))}
          <circle cx={left + 6} cy={H - 17} r={3} fill="#7c3aed" />
          <text className="ac-pp-svg-tick" x={left + 16} y={H - 13}>
            紫色描边 / 圆点 = 该格持有 CERTIFICATIONS 中覆盖此技能的证书（certified = true）
          </text>
        </g>
      </svg>
    </div>
  );
}

/** 负载条形图（手绘 SVG）：allocated vs capacity，超产能部分用 danger 叠加 */
function WorkloadBars({ onPick }: { onPick: (w: WorkloadDef) => void }) {
  const rows = [...WORKLOADS].sort((a, b) => b.loadPct - a.loadPct);
  const W = 760;
  const left = 96;
  const right = 118;
  const rowH = 34;
  const H = rows.length * rowH + 34;
  const chartW = W - left - right;
  const max = Math.max(...rows.map((r) => Math.max(r.allocatedPoints, r.capacityPoints))) * 1.06;
  const x = (v: number) => left + (v / max) * chartW;

  return (
    <svg className="ac-pp-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="9 位成员本迭代已分配点数与产能对比">
      {[0, 10, 20, 30, 40, 50].filter((t) => t <= max).map((t) => (
        <g key={t}>
          <line className="ac-pp-svg-grid" x1={x(t)} y1={6} x2={x(t)} y2={H - 26} />
          <text className="ac-pp-svg-tick" x={x(t)} y={H - 12} textAnchor="middle">
            {t} 点
          </text>
        </g>
      ))}

      {rows.map((r, idx) => {
        const u = USER_MAP[r.userId];
        const y = idx * rowH + 8;
        const capW = x(r.capacityPoints) - left;
        const allocW = x(Math.min(r.allocatedPoints, r.capacityPoints)) - left;
        const overW = r.allocatedPoints > r.capacityPoints ? x(r.allocatedPoints) - x(r.capacityPoints) : 0;
        return (
          <g key={r.userId} className="ac-pp-bar-hit" onClick={() => onPick(r)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') onPick(r); }}>
            <title>{`${u?.name ?? r.userId}：已分配 ${r.allocatedPoints} 点 / 产能 ${r.capacityPoints} 点 = ${r.loadPct}%${r.overload ? '（超载）' : ''}，AI 分担 ${r.aiOffloadPoints} 点`}</title>
            <text className="ac-pp-svg-name" x={0} y={y + 15}>
              {u?.name ?? r.userId}
            </text>
            <rect className="ac-pp-svg-track" x={left} y={y + 4} width={chartW} height={16} rx={4} />
            <rect x={left} y={y + 4} width={Math.max(2, allocW)} height={16} rx={4} fill={TONE_HEX[loadTone(r.loadPct)]} />
            {overW > 0 ? <rect x={left + capW} y={y + 4} width={overW} height={16} rx={0} fill={TONE_HEX.danger} fillOpacity="0.55" /> : null}
            {/* 100% 参考线 = 该成员的产能上限 */}
            <line className="ac-pp-svg-cap" x1={left + capW} y1={y} x2={left + capW} y2={y + 24} />
            <text className="ac-pp-svg-value" x={W - right + 8} y={y + 16}>
              {r.allocatedPoints} / {r.capacityPoints} 点
            </text>
            <text
              className="ac-pp-svg-value"
              x={W - 8}
              y={y + 16}
              textAnchor="end"
              fill={TONE_HEX[loadTone(r.loadPct)]}
            >
              {fmt(r.loadPct)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** AI 采纳率横向条形 + 团队均值参考线（手绘 SVG） */
function AcceptRateBars() {
  const rows = [...AI_COLLAB_PREFS].sort((a, b) => b.acceptRatePct - a.acceptRatePct);
  const avg = rows.reduce((s, r) => s + r.acceptRatePct, 0) / rows.length;
  const W = 700;
  const left = 96;
  const right = 76;
  const rowH = 30;
  const H = rows.length * rowH + 34;
  const chartW = W - left - right;
  const x = (v: number) => left + (v / 100) * chartW;

  return (
    <svg className="ac-pp-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="9 位成员的 AI 建议采纳率与团队均值对比">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line className="ac-pp-svg-grid" x1={x(t)} y1={6} x2={x(t)} y2={H - 26} />
          <text className="ac-pp-svg-tick" x={x(t)} y={H - 12} textAnchor="middle">
            {t}%
          </text>
        </g>
      ))}
      {rows.map((r, idx) => {
        const u = USER_MAP[r.userId];
        const p = MEMBER_PROFILE_MAP[r.userId];
        const y = idx * rowH + 8;
        const tone: Tone = r.acceptRatePct >= 82 ? 'ok' : r.acceptRatePct >= 74 ? 'brand' : 'warn';
        return (
          <g key={r.userId}>
            <title>{`${u?.name ?? r.userId}：采纳率 ${r.acceptRatePct}% · 日均 ${r.dailySessionCount} 次会话 · 单次 ${r.avgSessionMin} 分钟 · 满意度 ${r.feedbackScore} / 5`}</title>
            <text className="ac-pp-svg-name" x={0} y={y + 14}>
              {u?.name ?? r.userId}
            </text>
            <rect className="ac-pp-svg-track" x={left} y={y + 3} width={chartW} height={14} rx={4} />
            <rect x={left} y={y + 3} width={Math.max(2, x(r.acceptRatePct) - left)} height={14} rx={4} fill={TONE_HEX[tone]} />
            <text className="ac-pp-svg-value" x={W - right + 8} y={y + 15}>
              {fmt(r.acceptRatePct)}%
            </text>
            <text className="ac-pp-svg-tick" x={W - 6} y={y + 15} textAnchor="end">
              {p ? `${p.aiRejectReasons.length} 条拒绝` : ''}
            </text>
          </g>
        );
      })}
      <line className="ac-pp-svg-avg" x1={x(avg)} y1={4} x2={x(avg)} y2={H - 24} />
      <rect x={x(avg) - 44} y={H - 24} width={88} height={16} rx={8} fill="#7c3aed" />
      <text className="ac-pp-svg-avg-label" x={x(avg)} y={H - 12} textAnchor="middle">
        团队均值 {fmt(avg)}%
      </text>
    </svg>
  );
}

/** 拒绝理由聚合环形图（手绘 SVG，top5 + 其他） */
function RejectDonut({ items, total }: { items: { cat: string; count: number }[]; total: number }) {
  const palette = ['#ef4444', '#f59e0b', '#4f46e5', '#0d9488', '#7c3aed', '#94a3b8'];
  const cx = 108;
  const cy = 108;
  let angle = 0;
  return (
    <svg viewBox="0 0 216 216" width="216" height="216" role="img" aria-label="AI 建议拒绝理由聚合占比">
      {items.map((it, idx) => {
        const sweep = (it.count / Math.max(total, 1)) * 360;
        const a0 = angle;
        const a1 = angle + Math.max(sweep, 0.6);
        angle = a1;
        return (
          <path key={it.cat} d={donutSeg(cx, cy, 92, 56, a0, a1 - 1)} fill={palette[idx % palette.length]} fillOpacity={0.92}>
            <title>{`${it.cat}：${it.count} 条 · ${fmt((it.count / Math.max(total, 1)) * 100)}%`}</title>
          </path>
        );
      })}
      <text className="ac-pp-donut-value" x={cx} y={cy + 2} textAnchor="middle">
        {total}
      </text>
      <text className="ac-pp-donut-label" x={cx} y={cy + 20} textAnchor="middle">
        条拒绝理由
      </text>
    </svg>
  );
}

/** AI 满意度五星（手绘 SVG） */
function FeedbackStars({ score }: { score: number }) {
  return (
    <svg viewBox="0 0 78 16" width="78" height="16" role="img" aria-label={`AI 产出满意度评分 ${score} / 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={starPath(9 + i * 15, 8, 7)}
          fill={i < score ? '#f59e0b' : '#eceff4'}
          stroke={i < score ? '#b45309' : '#d8dde5'}
          strokeWidth="0.8"
        />
      ))}
    </svg>
  );
}

/** 团队能力雷达（手绘 SVG）：按 SKILLS.category 六大类聚合，当前 vs 目标两条多边形 */
function CategoryRadar({ data }: { data: { category: string; current: number; target: number }[] }) {
  const W = 520;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const R = 138;
  const n = data.length;
  const maxV = 5;
  const pt = (i: number, v: number) => polar(cx, cy, (Math.min(v, maxV) / maxV) * R, (360 / n) * i);
  const poly = (key: 'current' | 'target') =>
    data.map((d, i) => { const p = pt(i, d[key]); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');

  return (
    <svg className="ac-pp-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="团队六大能力类别当前平均熟练度与目标对比雷达图">
      {/* 同心环 */}
      {[1, 2, 3, 4, 5].map((lv) => (
        <g key={lv}>
          <polygon
            points={data.map((_, i) => { const p = pt(i, lv); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ')}
            fill="none"
            stroke="#e8ebf0"
            strokeWidth="1"
          />
          <text className="ac-pp-svg-tick" x={cx + 4} y={cy - (lv / maxV) * R + 3}>
            L{lv}
          </text>
        </g>
      ))}
      {/* 轴线与类目标签 */}
      {data.map((d, i) => {
        const p = pt(i, maxV);
        const lp = polar(cx, cy, R + 26, (360 / n) * i);
        return (
          <g key={d.category}>
            <line className="ac-pp-svg-grid" x1={cx} y1={cy} x2={p.x} y2={p.y} />
            <text
              className="ac-pp-radar-label"
              x={lp.x}
              y={lp.y}
              textAnchor={Math.abs(lp.x - cx) < 12 ? 'middle' : lp.x > cx ? 'start' : 'end'}
            >
              {d.category}
            </text>
            <text
              className="ac-pp-svg-tick"
              x={lp.x}
              y={lp.y + 14}
              textAnchor={Math.abs(lp.x - cx) < 12 ? 'middle' : lp.x > cx ? 'start' : 'end'}
            >
              当前 {fmt(d.current, 2)} / 目标 {fmt(d.target, 2)}
            </text>
          </g>
        );
      })}
      {/* 目标多边形 */}
      <polygon points={poly('target')} fill="#7c3aed" fillOpacity="0.1" stroke="#7c3aed" strokeWidth="2" strokeDasharray="6 4" />
      {/* 当前多边形 */}
      <polygon points={poly('current')} fill="#4f46e5" fillOpacity="0.2" stroke="#4f46e5" strokeWidth="2.4" />
      {data.map((d, i) => {
        const p = pt(i, d.current);
        return <circle key={`c${d.category}`} cx={p.x} cy={p.y} r={3.6} fill="#4f46e5" stroke="#fff" strokeWidth="1.4" />;
      })}
    </svg>
  );
}

/* ================================================================== 小型展示组件 */

/** 成员头像 + 姓名 + 岗位（user 缺省时回落到静态 USER_MAP，本地录入的新成员由调用方传入） */
function PersonCell({
  userId,
  size = 'sm',
  showTitle = true,
  user,
}: {
  userId: string;
  size?: 'xs' | 'sm' | 'lg';
  showTitle?: boolean;
  user?: UserDef;
}) {
  const u = user ?? USER_MAP[userId];
  if (!u) return <span className="ac-muted ac-xs">{userId}</span>;
  const sizeCls = size === 'lg' ? 'ac-avatar--lg' : size === 'xs' ? 'ac-avatar--xs' : 'ac-avatar--sm';
  return (
    <span className="ac-user">
      <span className={`ac-avatar ${sizeCls} ${u.isAi ? 'ac-avatar--ai' : AVATAR_TONE[u.avatarColor]}`}>{u.initial}</span>
      <span className="ac-col ac-gap-0">
        <span className="ac-user-name">
          {u.name}
          {u.isAi ? (
            <span className="ac-tag ac-tag--sm ac-tag--ai ac-ml-1">
              <Bot size={9} />
              AI 账号
            </span>
          ) : null}
        </span>
        {showTitle ? <span className="ac-user-meta">{u.title}</span> : null}
      </span>
    </span>
  );
}

/** 负载率进度条 */
function LoadBar({ loadPct, capacity, allocated }: { loadPct: number; capacity: number; allocated: number }) {
  const tone = loadTone(loadPct);
  return (
    <div className="ac-progress-row ac-pp-loadbar">
      <div className="ac-progress ac-progress--sm">
        <div
          className={`ac-progress-bar ac-progress-bar--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'danger'}`}
          style={{ width: `${Math.min(loadPct, 100)}%` }}
        />
      </div>
      <span className={`ac-progress-label ${TEXT_TONE[tone]}`}>{fmt(loadPct)}%</span>
      <span className="ac-xs ac-muted ac-nowrap">
        {allocated}/{capacity} 点
      </span>
    </div>
  );
}

/** 采纳 / 驳回 按钮组（本地 state 乐观更新） */
function AiVoteBar({ state, onVote }: { state: 'accepted' | 'rejected' | undefined; onVote: (v: 'accepted' | 'rejected') => void }) {
  if (state === 'accepted') {
    return (
      <span className="ac-tag ac-tag--sm ac-tag--ok">
        <CheckCircle2 size={12} />
        已采纳
      </span>
    );
  }
  if (state === 'rejected') {
    return (
      <span className="ac-tag ac-tag--sm ac-tag--neutral">
        <XCircle size={12} />
        已驳回
      </span>
    );
  }
  return (
    <span className="ac-row ac-gap-1">
      <button type="button" className="ac-btn ac-btn--sm ac-btn--primary" onClick={() => onVote('accepted')}>
        <CheckCircle2 size={12} />
        采纳
      </button>
      <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => onVote('rejected')}>
        <XCircle size={12} />
        驳回
      </button>
    </span>
  );
}

/* ================================================================== 抽屉内容 */

type PpDrawer =
  | { kind: 'member'; profile: MemberProfileDef }
  | { kind: 'cell'; cell: SkillMatrixCell }
  | { kind: 'workload'; wl: WorkloadDef }
  | null;

/** 成员完整档案抽屉（userMap 缺省时回落到静态 USER_MAP；本地录入的新成员由调用方传入合并后的 map） */
function MemberDrawerBody({ profile, userMap }: { profile: MemberProfileDef; userMap?: Record<string, UserDef> }) {
  const users = userMap ?? USER_MAP;
  const u = users[profile.userId];
  const role = u ? ROLE_MAP[u.roleId] : undefined;
  const wl = WORKLOADS.find((w) => w.userId === profile.userId);
  const pref = AI_COLLAB_PREFS.find((p) => p.userId === profile.userId);
  const skills = skillRowOf(profile.userId).slice(0, 6);
  const certs = profile.certifications
    .map((id) => CERTIFICATIONS.find((c) => c.id === id))
    .filter(Boolean) as CertificationDef[];
  const manager = profile.directReportTo ? users[profile.directReportTo] : null;

  return (
    <>
      <div className="ac-pp-drawer-head">
        <PersonCell userId={profile.userId} size="lg" user={u} />
        <div className="ac-row ac-gap-1 ac-wrap ac-ml-auto">
          <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_TAG[profile.statusLabel]}`}>{profile.statusLabel}</span>
          <span className={`ac-tag ac-tag--sm ac-tag--${EMPLOYMENT_TAG[profile.employmentType]}`}>{profile.employmentType}</span>
          <span className="ac-tag ac-tag--sm ac-tag--outline">{profile.seniority}</span>
        </div>
      </div>

      {u?.isAi ? (
        <div className="ac-hint ac-hint--ai ac-mb-4">
          <Bot size={14} />
          <span>
            这是一个 AI 共享账号，不占用人类产能：sprintCapacity / allocatedPoints / loadPct 均为 0，
            aiAcceptRatePct 与 aiRejectReasons 不适用；monthlyCostWan 为算力折算成本，seniority 按等效产能对标 P6 仅用于成本核算。
          </span>
        </div>
      ) : null}

      <dl className="ac-kv ac-mb-4">
        <dt>工号</dt>
        <dd className="ac-mono">{profile.employeeNo}</dd>
        <dt>账号 / 邮箱</dt>
        <dd className="ac-mono">
          {u?.account} · {u?.email}
        </dd>
        <dt>岗位 / 角色</dt>
        <dd>
          {u?.title}
          {role ? <span className="ac-xs ac-muted"> · 平台角色视角「{role.name}」</span> : null}
        </dd>
        <dt>部门 / 团队</dt>
        <dd>
          {u?.dept} · {teamNamesOf(profile)}
        </dd>
        <dt>入职日期</dt>
        <dd className="ac-tnum">
          {profile.joinDate}（司龄 {fmt(tenureYears(profile.joinDate))} 年）
        </dd>
        <dt>汇报对象</dt>
        <dd>{manager ? `${manager.name} · ${manager.title}` : '无平台内上级账号'}</dd>
        <dt>办公地点</dt>
        <dd>{profile.location}</dd>
        <dt>月度成本</dt>
        <dd className="ac-tnum">{fmt(profile.monthlyCostWan)} 万元</dd>
        <dt>本迭代产能</dt>
        <dd className="ac-tnum">
          {profile.sprintCapacity} 点 · 已分配 {profile.allocatedPoints} 点 · 负载 {fmt(profile.loadPct)}%
        </dd>
        <dt>AI 分担</dt>
        <dd className="ac-tnum">
          {wl
            ? `${wl.aiOffloadPoints} 点（占已分配 ${fmt((wl.aiOffloadPoints / Math.max(wl.allocatedPoints, 1)) * 100, 0)}%）`
            : u?.isAi
              ? '不占用人力产能'
              : '暂无 WORKLOADS 记录（待首次迭代排期后生成）'}
        </dd>
        <dt>近 30 日产出</dt>
        <dd className="ac-tnum">
          提交 {num(profile.commitCount30d)} 次 · PR {profile.prCount30d} 个 · 缺陷逃逸 {profile.defectEscapeCount30d} 个
        </dd>
        <dt>评审 / 加班</dt>
        <dd className="ac-tnum">
          平均评审 {profile.reviewAvgMin} 分钟 · 承担 {reviewCountOf(profile.userId)} 个任务的评审 · 本月加班 {profile.overtimeHoursMonth} 小时
        </dd>
        <dt>AI 采纳率</dt>
        <dd className="ac-tnum">{u?.isAi ? '不适用' : `${fmt(profile.aiAcceptRatePct)}%`}</dd>
      </dl>

      <div className="ac-section-title">技能前 6 项</div>
      {skills.length ? (
        <div className="ac-pp-skill-chips">
          {skills.map((c) => {
            const s = SKILLS.find((x) => x.id === c.skillId);
            return (
              <span className={`ac-pp-skill-chip ac-pp-skill-chip--l${c.level}`} key={c.skillId}>
                {s?.name ?? c.skillId}
                <b>L{c.level}</b>
                {c.certified ? <BadgeCheck size={11} /> : null}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="ac-xs ac-muted">
          {u?.isAi
            ? 'AI 共享账号不纳入技能矩阵，能力标签见下方。'
            : '暂无 SKILL_MATRIX 记录，待首次技能复核后生成；能力标签见下方。'}
        </div>
      )}
      {u && (u.isAi || !skills.length) ? (
        <div className="ac-row ac-gap-1 ac-wrap ac-mt-2">
          {u.skills.map((s) => (
            <span key={s} className={`ac-tag ac-tag--sm ${u.isAi ? 'ac-tag--ai' : 'ac-tag--outline'}`}>
              {s}
            </span>
          ))}
        </div>
      ) : null}

      <div className="ac-section-title">持有认证（{certs.length}）</div>
      {certs.length ? (
        <div className="ac-pp-cert-list">
          {certs.map((c) => {
            const left = daysFromToday(c.validUntil);
            return (
              <div className="ac-pp-cert-item" key={c.id}>
                <Medal size={14} className={left <= CERT_WARN_DAYS ? 'ac-danger-text' : 'ac-brand-text'} />
                <span className="ac-col ac-gap-0 ac-flex-1">
                  <span className="ac-sm ac-semi ac-text-1">{c.name}</span>
                  <span className="ac-xs ac-muted">
                    {c.issuer} · {c.level} · 有效期至 {c.validUntil}
                  </span>
                </span>
                <span className={`ac-tag ac-tag--sm ac-tag--${left < 0 ? 'danger' : left <= CERT_WARN_DAYS ? 'warn' : 'ok'}`}>
                  {left < 0 ? `已过期 ${-left} 天` : `剩余 ${left} 天`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ac-empty ac-empty--sm">
          <div className="ac-empty-icon">
            <Medal size={20} />
          </div>
          <div className="ac-empty-title">暂无登记认证</div>
          <div className="ac-empty-desc">
            {u?.isAi ? 'AI 账号不参与认证序列。' : '该成员在 CERTIFICATIONS 的 holderIds 中没有记录，能力凭据以技能矩阵实操复核为准。'}
          </div>
        </div>
      )}

      <div className="ac-section-title">成长计划</div>
      <div className="ac-pp-growth">
        <div className="ac-pp-growth-goal">
          <Target size={13} />
          {profile.growthPlan.goal}
        </div>
        <ul className="ac-pp-list">
          {profile.growthPlan.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <div className="ac-xs ac-muted ac-mt-2">
          <CalendarClock size={11} className="ac-pp-inline-icon" />
          复盘时间 {profile.growthPlan.reviewAt}（距今 {daysFromToday(profile.growthPlan.reviewAt)} 天）
        </div>
      </div>

      {pref ? (
        <>
          <div className="ac-section-title">AI 协作偏好</div>
          <dl className="ac-kv">
            <dt>常用 Agent</dt>
            <dd>
              {pref.preferredAgentIds.map((id) => agents.find((a) => a.id === id)?.name ?? id).join('、')}
            </dd>
            <dt>常用模型</dt>
            <dd>{pref.preferredModelIds.map((id) => models.find((m) => m.id === id)?.name ?? id).join('、')}</dd>
            <dt>自动采纳</dt>
            <dd>{AUTO_ACCEPT_LABEL[pref.autoAcceptScope]}</dd>
            <dt>使用强度</dt>
            <dd className="ac-tnum">
              日均 {pref.dailySessionCount} 次会话 · 单次 {pref.avgSessionMin} 分钟
            </dd>
            <dt>关闭 AI 环节</dt>
            <dd>
              {pref.optOutStages.length
                ? pref.optOutStages.map((id) => SDLC_STAGES.find((s) => s.id === id)?.name ?? id).join('、')
                : '全环节开启'}
            </dd>
          </dl>
        </>
      ) : null}

      <div className="ac-section-title">备注</div>
      <div className="ac-hint">
        <Info size={14} />
        <span>{profile.note}</span>
      </div>
    </>
  );
}

/** 技能矩阵单元格抽屉 */
function CellDrawerBody({ cell }: { cell: SkillMatrixCell }) {
  const u = USER_MAP[cell.userId];
  const skill = SKILLS.find((s) => s.id === cell.skillId);
  const certs = CERTIFICATIONS.filter((c) => c.relatedSkillIds.includes(cell.skillId));
  const holderCerts = certs.filter((c) => c.holderIds.includes(cell.userId));
  /** 关联任务：SKILLS.relatedRef 指向 ARCH_COMPONENTS 的组件 id，用它匹配 TASKS.componentIds */
  const relatedTasks = skill && skill.relatedRef.startsWith('ac-')
    ? Object.values(TASK_MAP).filter((t) => t.componentIds.includes(skill.relatedRef))
    : [];
  const peers = SKILL_MATRIX.filter((c) => c.skillId === cell.skillId).sort((a, b) => b.level - a.level);
  const rank = peers.findIndex((c) => c.userId === cell.userId) + 1;

  return (
    <>
      <div className="ac-pp-drawer-head">
        <PersonCell userId={cell.userId} />
        <span className="ac-tag ac-tag--sm ac-tag--outline ac-mono">{cell.skillId}</span>
        <span className={`ac-pp-level-badge ac-pp-level-badge--${cell.level}`}>level {cell.level}</span>
      </div>

      <dl className="ac-kv ac-mb-4">
        <dt>技能</dt>
        <dd>
          {skill?.name ?? cell.skillId}
          {skill ? <span className="ac-xs ac-muted"> · {skill.category}</span> : null}
        </dd>
        <dt>等级语义</dt>
        <dd>{LEVEL_LABEL[cell.level]}</dd>
        <dt>团队排名</dt>
        <dd className="ac-tnum">
          第 {rank} / {peers.length} 人（level ≥ 4 共 {peers.filter((c) => c.level >= 4).length} 人）
        </dd>
        <dt>需求强度</dt>
        <dd>
          {skill ? (
            <span className={`ac-tag ac-tag--sm ac-tag--${DEMAND_META[skill.demandLevel].tagTone}`}>
              {DEMAND_META[skill.demandLevel].label} · 稀缺度 {skill.scarcityPct}%
            </span>
          ) : (
            '—'
          )}
        </dd>
        <dt>最近使用</dt>
        <dd className="ac-mono">
          {cell.lastUsedAt}
          <span className="ac-xs ac-muted">（{daysFromToday(cell.lastUsedAt)} 天，负数为过去）</span>
        </dd>
        <dt>AI 辅助率</dt>
        <dd>
          <div className="ac-progress-row">
            <div className="ac-progress ac-progress--sm ac-pp-inline-progress">
              <div className="ac-progress-bar" style={{ width: `${cell.aiAssistRatePct}%` }} />
            </div>
            <span className="ac-progress-label">{cell.aiAssistRatePct}%</span>
          </div>
        </dd>
        <dt>认证状态</dt>
        <dd>
          {cell.certified ? (
            <span className="ac-tag ac-tag--sm ac-tag--ai">
              <BadgeCheck size={11} />
              已认证 · {holderCerts.map((c) => c.id).join('、')}
            </span>
          ) : (
            <span className="ac-tag ac-tag--sm ac-tag--outline">无覆盖该技能的证书</span>
          )}
        </dd>
        <dt>关联参考</dt>
        <dd className="ac-mono">{skill?.relatedRef ?? '—'}</dd>
      </dl>

      <div className="ac-section-title">关联任务（{relatedTasks.length}）</div>
      {relatedTasks.length ? (
        <div className="ac-pp-task-list">
          {relatedTasks.map((t) => (
            <div className="ac-pp-task-item" key={t.id}>
              <span className="ac-mono ac-brand-text ac-xs">{t.id}</span>
              <span className="ac-col ac-gap-0 ac-flex-1">
                <span className="ac-sm ac-text-1">{cut(t.title, 30)}</span>
                <span className="ac-xs ac-muted">
                  {t.stateLabel} · {t.points} 点 · 进度 {t.progress}% · AI 占比 {t.aiRatio}% · 负责人{' '}
                  {USER_MAP[t.ownerId]?.name ?? t.ownerId}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="ac-empty ac-empty--sm">
          <div className="ac-empty-icon">
            <ListChecks size={20} />
          </div>
          <div className="ac-empty-title">该技能未直接映射到平台工作项</div>
          <div className="ac-empty-desc">
            SKILLS.relatedRef 为「{skill?.relatedRef}」，不是架构组件 id（ac-*），因此无法通过 TASKS.componentIds 反查任务；
            这类技能（知识库 / 需求 / PRD 类）的能力证据来自评审记录与文档产出。
          </div>
        </div>
      )}

      <div className="ac-section-title">覆盖该技能的认证（{certs.length}）</div>
      {certs.length ? (
        <ul className="ac-pp-list">
          {certs.map((c) => (
            <li key={c.id}>
              {c.name}（{c.issuer} · {c.level} · 有效期至 {c.validUntil} · 持有人 {c.holderIds.length} 人）
            </li>
          ))}
        </ul>
      ) : (
        <div className="ac-xs ac-muted">暂无认证覆盖该技能，能力等级依赖实操复核。</div>
      )}

      <div className="ac-section-title">同技能成员水位</div>
      <div className="ac-pp-peer-row">
        {peers.map((c) => (
          <span className={`ac-pp-peer ${c.userId === cell.userId ? 'ac-pp-peer--me' : ''}`} key={c.userId} title={`${USER_MAP[c.userId]?.name}：level ${c.level}`}>
            <span className="ac-pp-peer-name">{USER_MAP[c.userId]?.initial ?? '?'}</span>
            <span className="ac-pp-peer-level" style={{ background: LEVEL_FILL[c.level], color: LEVEL_TEXT[c.level] }}>
              {c.level}
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

/** 负载明细抽屉 */
function WorkloadDrawerBody({ wl }: { wl: WorkloadDef }) {
  const p = MEMBER_PROFILE_MAP[wl.userId];
  return (
    <>
      <dl className="ac-kv ac-mb-4">
        <dt>迭代</dt>
        <dd>
          {CURRENT_SPRINT.name}（{CURRENT_SPRINT.startDate} ~ {CURRENT_SPRINT.endDate}）
        </dd>
        <dt>产能 / 已分配</dt>
        <dd className="ac-tnum">
          {wl.capacityPoints} 点 / {wl.allocatedPoints} 点
        </dd>
        <dt>负载率</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[loadTone(wl.loadPct)]}`}>
            {fmt(wl.loadPct)}%{wl.overload ? ' · 超载' : ''}
          </span>
        </dd>
        <dt>AI 分担</dt>
        <dd className="ac-tnum">{wl.aiOffloadPoints} 点</dd>
        <dt>加班 / 逃逸</dt>
        <dd className="ac-tnum">
          {p ? `${p.overtimeHoursMonth} 小时 / ${p.defectEscapeCount30d} 个` : '—'}
        </dd>
      </dl>

      <div className="ac-section-title">allocatedPoints 构成</div>
      <div className="ac-hint">
        <Scale size={14} />
        <span>{wl.note}</span>
      </div>

      <div className="ac-section-title">关联工作项（{wl.taskIds.length}）</div>
      <div className="ac-pp-task-list">
        {wl.taskIds.map((id) => {
          const t = TASK_MAP[id];
          return (
            <div className="ac-pp-task-item" key={id}>
              <span className="ac-mono ac-brand-text ac-xs">{id}</span>
              <span className="ac-col ac-gap-0 ac-flex-1">
                <span className="ac-sm ac-text-1">{t ? cut(t.title, 32) : '—'}</span>
                <span className="ac-xs ac-muted">
                  {t
                    ? `${t.stateLabel} · ${t.points} 点 · 进度 ${t.progress}% · AI 占比 ${t.aiRatio}% · ${t.ownerId === wl.userId ? '承接' : '评审'} · ${t.startDate} ~ ${t.endDate}`
                    : '工作项不在本原型 TASKS 数据集内'}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="ac-section-title">风险说明</div>
      <div className="ac-hint ac-hint--warn">
        <AlertTriangle size={14} />
        <span>{wl.riskNote}</span>
      </div>

      <div className="ac-section-title">AI 建议动作</div>
      <div className="ac-ai-block">
        <div className="ac-ai-block-title">
          <Sparkles size={14} />
          WorkloadDef.suggestedAction 原文
        </div>
        <div className="ac-mt-2">{wl.suggestedAction}</div>
      </div>
    </>
  );
}

/* ============================================ 录入成员（本地草稿态，不回写数据模块） */

/**
 * 录入成员表单的本地形态。
 * 数值字段一律用 string，以便区分「未填写」与「已填写 0」，提交时才 Number() 转换。
 * 红线：本表单不写回 ../data 与 ../data-mgmt，新建记录只存活在 PeoplePage 的 useState 中，
 * 页面卸载即消失，仅用于演示「录入 → 本地计入汇总 → 待 HR / PingCode 回写」的闭环。
 */
interface CreateForm {
  name: string;
  initial: string;
  account: string;
  email: string;
  title: string;
  dept: string;
  roleId: string;
  employeeNo: string;
  seniority: string;
  employmentType: string;
  teamIds: string[];
  joinDate: string;
  directReportTo: string;
  location: string;
  monthlyCostWan: string;
  sprintCapacity: string;
  skills: string[];
  growthGoal: string;
}

const EMPTY_FORM: CreateForm = {
  name: '',
  initial: '',
  account: '',
  email: '',
  title: '',
  dept: '',
  roleId: '',
  employeeNo: '',
  seniority: '',
  employmentType: '正式',
  teamIds: [],
  joinDate: '',
  directReportTo: '',
  location: '',
  monthlyCostWan: '',
  sprintCapacity: '',
  skills: [],
  growthGoal: '',
};

/** 既有 10 个账号的邮箱域名，取自 USERS[0].email（全部为 @artisan-tech.com） */
const EMAIL_DOMAIN = USERS[0].email.split('@')[1] ?? 'artisan-tech.com';

/** 新成员成长计划的统一复盘时间，与既有 10 份档案同批次 */
const GROWTH_REVIEW_AT = '2026-06-30';

/**
 * AI 推导口径 ①：月度成本基准（万元/月）= MEMBER_PROFILES 中同职级「正式」成员 monthlyCostWan 均值。
 * P8 = (9.8 林知远 + 11.2 严慕舟) / 2 = 10.5；P7 = (6.4 苏文瑾 + 7.6 周浩然) / 2 = 7.0；
 * P6 = (5.2 何斯年 + 5.6 孟星回 + 4.6 顾时衍) / 3 = 5.1；P5 = 4.8（陈屿，唯一正式样本）；
 * P4 在既有名册中无样本，按 P5 × 0.7 外推为 3.4。
 */
const AI_COST_BASE: Record<string, number> = { P4: 3.4, P5: 4.8, P6: 5.1, P7: 7.0, P8: 10.5 };

/**
 * AI 推导口径 ②：用工形式系数。
 * 外包 0.79 = 沈亦白（P5 外包）3.8 ÷ P5 正式基准 4.8；
 * AI 账号 0.67 = u-ai-copilot 3.4 ÷ P6 基准 5.1（算力折算成本，非人力薪酬）；
 * 实习在既有名册中无样本，按正式的 35% 折算。
 */
const AI_COST_FACTOR: Record<string, number> = { 正式: 1, 外包: 0.79, 实习: 0.35, 'AI 账号': 0.67 };

/**
 * AI 推导口径 ③：迭代产能兜底表（故事点），仅当同 roleId 无在编样本时使用。
 * 取 MEMBER_PROFILES.sprintCapacity 的同职级均值：P7 = 21（苏文瑾 / 周浩然均 21）；
 * P5 = (18 陈屿 + 21 沈亦白) / 2 ≈ 20；P6 = (18 何斯年 + 13 孟星回 + 13 顾时衍) / 3 ≈ 15；
 * P8 = (8 林知远 + 13 严慕舟) / 2 ≈ 11（管理与架构岗递减）；P4 无样本，按 P5 × 0.65 ≈ 13。
 */
const AI_CAPACITY_BY_SENIORITY: Record<string, number> = { P4: 13, P5: 20, P6: 15, P7: 21, P8: 11 };

/** 成长行动项模板：roleId → 2 条角色专属动作，{team} / {stack} 为占位符；第 3 条统一为职级晋升证据链 */
const ROLE_GROWTH_TEMPLATE: Record<string, [string, string]> = {
  developer: [
    '在 {team} 的 {stack} 模块完成 2 次独立交付并通过 G3 门禁（单测覆盖率 ≥ 80%）',
    '把 AI 结对产出的评审返工率压到 20% 以下，沉淀 3 条 {stack} 提示词模板进 KB-CODE-02',
  ],
  tester: [
    '为 {team} 补齐 {stack} 的接口自动化用例 60 条，把回归执行时长压到 25 分钟以内',
    '主导 1 次缺陷逃逸复盘，输出可拦截的门禁规则并落进 G4 检查项',
  ],
  ops: [
    '把 {team} 的 {stack} 发布链路接入六道门禁，灰度批次与回滚预案 100% 预生成',
    '为 {stack} 的关键指标建立告警基线，误报率压到 5% 以下并沉淀值班手册',
  ],
  architect: [
    '产出 {team} 在 {stack} 方向的限界上下文划分与 2 份接口契约，通过 G2 架构评审',
    '牵头 1 次架构决策记录（ADR）评审，把分层约束写进 KB-ARCH-01 的强制召回项',
  ],
  product: [
    '完成 {team} 中 {stack} 相关需求的 3 份 PRD 基线，验收标准全部可量化可观测',
    '把需求池 AI 打分的业务价值维度与实际交付效果对齐，偏差收敛到 10% 以内',
  ],
  pmo: [
    '把 {team} 涉及 {stack} 的排期依赖冲突清零，关键路径里程碑达成率 ≥ 95%',
    '输出 1 份跨团队产能与成本对照周报，口径与效能看板保持唯一真源',
  ],
  manager: [
    '把 {team} 在 {stack} 方向的 AI 采纳率提升到 85%，同时缺陷逃逸率不上升',
    '完成 1 轮人岗匹配复盘，输出 {team} 的能力缺口补齐计划与对应预算',
  ],
};

/** 「AI 生成档案初稿」的名义产出方与运行模型：人事与成本数据不出内网，固定走私有化模型 */
const AI_DRAFT_AGENT = agents.find((a) => a.id === 'ag-pm') ?? agents[0];
const AI_DRAFT_MODEL = models.find((m) => m.id === 'mdl-local') ?? models[0];

/** AI 档案初稿的推导结果；reasons 为逐项口径说明，展示在表单下方的 ac-hint--ai 中 */
interface MemberDraft {
  monthlyCostWan: string;
  sprintCapacity: string;
  aiAcceptRatePct: number;
  location: string;
  actions: string[];
  reasons: string[];
}

/**
 * 「AI 生成档案初稿」的确定性推导：不使用 Math.random，同一份表单输入必得同一份输出。
 * 全部口径来自 MEMBER_PROFILES / USERS / TEAMS 既有字段，逐项写入 reasons 以便回溯。
 * profiles / users 由调用方传入（组件内合并了本地草稿的 allProfiles / userMap），本函数不持有状态。
 */
function deriveMemberDraft(
  form: CreateForm,
  profiles: MemberProfileDef[],
  users: Record<string, UserDef>,
): MemberDraft {
  const reasons: string[] = [];
  const roleShort = ROLE_MAP[form.roleId]?.short ?? form.roleId;
  const firstTeamId = form.teamIds[0] ?? '';
  const firstTeam = firstTeamId ? TEAM_MAP[firstTeamId] : undefined;
  const teamName = firstTeam?.name ?? '订单中心重构项目组';
  const stack = firstTeam?.techStack[0] ?? '订单中心重构';

  /* ① 月度成本 = 职级基准 × 用工形式系数 */
  const costBase = AI_COST_BASE[form.seniority] ?? AI_COST_BASE.P5;
  const costFactor = AI_COST_FACTOR[form.employmentType] ?? 1;
  const monthlyCostWan = (costBase * costFactor).toFixed(1);
  reasons.push(
    `monthlyCostWan ${monthlyCostWan} 万元/月 = ${form.seniority} 正式基准 ${fmt(costBase)} 万（MEMBER_PROFILES 同职级正式成员 monthlyCostWan 均值）× ${form.employmentType}系数 ${costFactor}`,
  );

  /* ② 迭代产能 = 同角色在编真人均值，无样本时回退职级基准；实习打 5 折 */
  const rolePeers = profiles.filter((p) => {
    const u = users[p.userId];
    return !!u && !u.isAi && u.roleId === form.roleId;
  });
  const capBase = rolePeers.length
    ? Math.round(rolePeers.reduce((s, p) => s + p.sprintCapacity, 0) / rolePeers.length)
    : AI_CAPACITY_BY_SENIORITY[form.seniority] ?? 18;
  const intern = form.employmentType === '实习';
  const capacity = intern ? Math.max(1, Math.floor(capBase * 0.5)) : capBase;
  const capSrc = rolePeers.length
    ? `同角色「${roleShort}」${rolePeers.length} 位在编真人 sprintCapacity 均值 ${capBase} 点`
    : `角色「${roleShort}」暂无在编样本，回退到 ${form.seniority} 职级基准 ${capBase} 点`;
  reasons.push(`sprintCapacity ${capacity} 点 = ${capSrc}${intern ? '，实习按 50% 向下取整' : ''}；同值写入 UserDef.capacity`);

  /* ③ AI 采纳率 = 所选团队既有真人成员均值，无交集时取全体真人均值 */
  const humans = profiles.filter((p) => !users[p.userId]?.isAi);
  const teamPeers = humans.filter((p) => p.teamIds.some((t) => form.teamIds.includes(t)));
  const pool = teamPeers.length ? teamPeers : humans;
  const aiAcceptRatePct = Number(
    (pool.reduce((s, p) => s + p.aiAcceptRatePct, 0) / Math.max(pool.length, 1)).toFixed(1),
  );
  reasons.push(
    `aiAcceptRatePct ${fmt(aiAcceptRatePct)}% = ${
      teamPeers.length
        ? `所选团队 ${teamPeers.length} 位既有真人成员 aiAcceptRatePct 均值`
        : `所选团队暂无既有成员，回退到全体 ${pool.length} 位真人均值`
    }（AI 账号该项不适用，不计入样本）`,
  );

  /* ④ 办公地点 = 所选首个团队既有成员出现次数最多的 location */
  let location = '';
  if (firstTeamId) {
    const counter = new Map<string, number>();
    profiles
      .filter((p) => p.teamIds.includes(firstTeamId))
      .forEach((p) => counter.set(p.location, (counter.get(p.location) ?? 0) + 1));
    const top = Array.from(counter.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))[0];
    if (top) location = top[0];
  }
  reasons.push(
    location
      ? `location「${location}」= 「${teamName}」既有成员中出现次数最多的办公地点`
      : 'location 未推导：尚未选择所属团队，缺少可参照的团队聚集地，需人工填写',
  );

  /* ⑤ 成长行动项 3 条：roleId × seniority 命中确定性模板 */
  const tpl = ROLE_GROWTH_TEMPLATE[form.roleId] ?? ROLE_GROWTH_TEMPLATE.developer;
  const levelIdx = SENIORITY_ORDER.indexOf(form.seniority as MemberProfileDef['seniority']);
  const nextLevel = SENIORITY_ORDER[Math.max(0, Math.min(levelIdx + 1, SENIORITY_ORDER.length - 1))];
  const fill = (t: string) => t.replace(/\{team\}/g, teamName).replace(/\{stack\}/g, stack);
  const actions = [
    fill(tpl[0]),
    fill(tpl[1]),
    `对照 ${nextLevel} 能力模型补齐证据链（交付 / 质量 / 协作各 1 项），${GROWTH_REVIEW_AT} 复盘`,
  ];
  reasons.push(
    `growthPlan.actions 3 条 = roleId ${form.roleId}（${roleShort}）× seniority ${form.seniority} 命中确定性模板，团队与技术栈取「${teamName}」/「${stack}」；reviewAt 固定 ${GROWTH_REVIEW_AT}，与既有 10 份档案同批次`,
  );

  return { monthlyCostWan, sprintCapacity: String(capacity), aiAcceptRatePct, location, actions, reasons };
}

/* ================================================================== 主组件 */

type PpSortKey = 'name' | 'seniority' | 'joinDate' | 'monthlyCostWan' | 'sprintCapacity' | 'allocatedPoints' | 'loadPct' | 'aiAcceptRatePct';

export default function PeoplePage() {
  const [tab, setTab] = useState<TabId>('roster');
  const [drawer, setDrawer] = useState<PpDrawer>(null);
  const [taskModalId, setTaskModalId] = useState<string | null>(null);

  /* ---- 名册筛选 / 搜索 / 排序 ---- */
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [seniorityFilter, setSeniorityFilter] = useState<string>('all');
  const [employmentFilter, setEmploymentFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<PpSortKey>('loadPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  /* ---- 技能矩阵筛选 ---- */
  const [skillCategory, setSkillCategory] = useState<string>('all');
  const [singlePointOnly, setSinglePointOnly] = useState(false);

  /* ---- AI 建议的本地乐观更新 ---- */
  const [insightVotes, setInsightVotes] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [rebalanceVotes, setRebalanceVotes] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [growthVotes, setGrowthVotes] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [prefNote, setPrefNote] = useState<string>('');

  /* ---- 录入成员（本地草稿态：只存在于本页 useState，不回写数据模块） ---- */
  const [createOpen, setCreateOpen] = useState(false);
  const [extraUsers, setExtraUsers] = useState<UserDef[]>([]);
  const [extraProfiles, setExtraProfiles] = useState<MemberProfileDef[]>([]);
  const [createNote, setCreateNote] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  /** AI 推导出的结构化结果（采纳率 / 行动项），提交时写入 MemberProfileDef */
  const [draft, setDraft] = useState<MemberDraft | null>(null);

  /* ================= 派生数据 ================= */

  /** 合并后的成员 map = 静态 USER_MAP + 本地录入草稿 */
  const userMap = useMemo(() => {
    const m: Record<string, UserDef> = { ...USER_MAP };
    extraUsers.forEach((u) => {
      m[u.id] = u;
    });
    return m;
  }, [extraUsers]);

  /** 合并后的成员档案 = 静态 MEMBER_PROFILES + 本地录入草稿 */
  const allProfiles = useMemo(() => [...MEMBER_PROFILES, ...extraProfiles], [extraProfiles]);

  /** 成本分布条的满刻度 = 合并后名册的最高月度成本（原静态口径为严慕舟 11.2 万） */
  const costMax = useMemo(() => Math.max(...allProfiles.map((p) => p.monthlyCostWan)), [allProfiles]);

  /** 本地录入的成员 id 集合，用于名册与成长计划的「新建 · 待同步」标记 */
  const isNewMember = (userId: string) => extraProfiles.some((x) => x.userId === userId);

  const roster = useMemo(
    () =>
      allProfiles.map((p) => ({
        profile: p,
        user: userMap[p.userId],
        role: userMap[p.userId] ? ROLE_MAP[userMap[p.userId].roleId] : undefined,
        workload: WORKLOADS.find((w) => w.userId === p.userId),
      })),
    [allProfiles, userMap],
  );

  const summary = useMemo(() => {
    const humans = allProfiles.filter((p) => !userMap[p.userId]?.isAi);
    const ai = allProfiles.filter((p) => userMap[p.userId]?.isAi);
    const cost = allProfiles.reduce((s, p) => s + p.monthlyCostWan, 0);
    const humanCost = humans.reduce((s, p) => s + p.monthlyCostWan, 0);
    const capacity = allProfiles.reduce((s, p) => s + p.sprintCapacity, 0);
    const allocated = allProfiles.reduce((s, p) => s + p.allocatedPoints, 0);
    const avgTenure = humans.reduce((s, p) => s + tenureYears(p.joinDate), 0) / Math.max(humans.length, 1);
    const escapes = allProfiles.reduce((s, p) => s + p.defectEscapeCount30d, 0);
    const overtime = humans.reduce((s, p) => s + p.overtimeHoursMonth, 0);
    const overloaded = WORKLOADS.filter((w) => w.overload).length;
    return { humans, ai, cost, humanCost, capacity, allocated, avgTenure, escapes, overtime, overloaded };
  }, [allProfiles, userMap]);

  const roleDist = useMemo(
    () =>
      ROLES.map((r) => ({
        roleId: r.id,
        name: r.short,
        count: allProfiles.filter((p) => userMap[p.userId]?.roleId === r.id).length,
        tone: r.color,
      })).filter((r) => r.count > 0),
    [allProfiles, userMap],
  );

  const seniorityDist = useMemo(
    () =>
      SENIORITY_ORDER.map((s) => ({
        label: s,
        count: allProfiles.filter((p) => p.seniority === s).length,
      })),
    [allProfiles],
  );

  const skillStats = useMemo(() => buildSkillStats(), []);
  const personStats = useMemo(() => buildPersonStats(), []);
  const skillInsights = useMemo(() => buildSkillInsights(skillStats), [skillStats]);

  const categories = useMemo(() => Array.from(new Set(SKILLS.map((s) => s.category))), []);

  const radarData = useMemo(
    () =>
      categories.map((cat) => {
        const skills = SKILLS.filter((s) => s.category === cat);
        const cells = SKILL_MATRIX.filter((c) => skills.some((s) => s.id === c.skillId));
        const current = cells.length ? cells.reduce((s, c) => s + c.level, 0) / cells.length : 0;
        const target = skills.length ? skills.reduce((s, k) => s + DEMAND_META[k.demandLevel].target, 0) / skills.length : 0;
        return { category: cat, current, target };
      }),
    [categories],
  );

  const filteredSkillStats = useMemo(
    () =>
      skillStats.filter((s) => {
        if (skillCategory !== 'all' && s.skill.category !== skillCategory) return false;
        if (singlePointOnly && !s.singlePoint) return false;
        return true;
      }),
    [skillStats, skillCategory, singlePointOnly],
  );

  const rebalance = useMemo(() => buildRebalance(), []);
  const growthAdvice = useMemo(() => buildGrowthAdvice(skillStats), [skillStats]);

  /** 拒绝理由聚合：27 条原文 → 11 类目 → top5 + 其他 */
  const rejectAgg = useMemo(() => {
    const all = allProfiles.flatMap((p) => p.aiRejectReasons.map((r) => ({ userId: p.userId, reason: r, cat: classifyReject(r) })));
    const byCat = new Map<string, { cat: string; count: number; samples: string[] }>();
    all.forEach((a) => {
      const cur = byCat.get(a.cat) ?? { cat: a.cat, count: 0, samples: [] };
      cur.count += 1;
      cur.samples.push(a.reason);
      byCat.set(a.cat, cur);
    });
    const sorted = Array.from(byCat.values()).sort(
      (a, b) => b.count - a.count || REJECT_ORDER.indexOf(a.cat) - REJECT_ORDER.indexOf(b.cat),
    );
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    return {
      total: all.length,
      top,
      rest: { cat: '其他', count: rest.reduce((s, r) => s + r.count, 0), samples: rest.flatMap((r) => r.samples), detail: rest },
      all: sorted,
    };
  }, [allProfiles]);

  /** 提示词模板使用分布 */
  const templateDist = useMemo(() => {
    const map = new Map<string, number>();
    AI_COLLAB_PREFS.forEach((p) => p.promptTemplateIds.forEach((id) => map.set(id, (map.get(id) ?? 0) + 1)));
    return Array.from(map.entries())
      .map(([id, count]) => ({ id, count, users: AI_COLLAB_PREFS.filter((p) => p.promptTemplateIds.includes(id)).map((p) => p.userId) }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  }, []);

  const filteredRoster = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const rows = roster.filter(({ profile, user }) => {
      if (!user) return false;
      if (roleFilter !== 'all' && user.roleId !== roleFilter) return false;
      if (teamFilter !== 'all' && !profile.teamIds.includes(teamFilter)) return false;
      if (seniorityFilter !== 'all' && profile.seniority !== seniorityFilter) return false;
      if (employmentFilter !== 'all' && profile.employmentType !== employmentFilter) return false;
      if (!kw) return true;
      return [user.name, user.title, user.dept, user.email, profile.employeeNo, profile.location, teamNamesOf(profile), user.skills.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(kw);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const valueOf = (r: (typeof rows)[number]): number | string => {
      switch (sortKey) {
        case 'name':
          return r.user?.name ?? '';
        case 'seniority':
          return r.profile.seniority;
        case 'joinDate':
          return r.profile.joinDate;
        default:
          return r.profile[sortKey];
      }
    };
    return rows.sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'zh-CN') * dir;
      return (va - vb) * dir;
    });
  }, [roster, roleFilter, teamFilter, seniorityFilter, employmentFilter, keyword, sortKey, sortDir]);

  const teamOptions = useMemo(() => {
    const ids = Array.from(new Set(allProfiles.flatMap((p) => p.teamIds)));
    return ids.map((id) => ({ id, name: TEAM_MAP[id]?.name ?? id }));
  }, [allProfiles]);

  /* ---- 录入成员表单的选项（全部来自既有数据集，不新增枚举） ---- */

  const deptOptions = useMemo(
    () => Array.from(new Set(USERS.map((u) => u.dept))).map((d) => ({ value: d, label: d })),
    [],
  );

  const roleOptions = useMemo(
    () => ROLES.map((r) => ({ value: r.id, label: `${r.short}（${r.id}）`, title: `${r.name}：${r.desc}` })),
    [],
  );

  const seniorityOptions = useMemo(() => SENIORITY_ORDER.map((s) => ({ value: s, label: s })), []);

  const employmentOptions = useMemo(
    () =>
      (['正式', '外包', '实习', 'AI 账号'] as MemberProfileDef['employmentType'][]).map((t) => ({
        value: t,
        label: t,
      })),
    [],
  );

  /** 汇报对象候选 = 合并后名册里的全部成员（含本次会话已录入的草稿） */
  const managerOptions = useMemo(
    () =>
      allProfiles
        .map((p) => userMap[p.userId])
        .filter((u): u is UserDef => !!u)
        .map((u) => ({ value: u.id, label: `${u.name}（${u.title}）`, title: `${u.dept} · ${u.id}` })),
    [allProfiles, userMap],
  );

  const createTeamOptions = useMemo(
    () =>
      TEAMS.map((t) => ({
        value: t.id,
        label: t.name,
        title: `${t.id} · 负责人 ${userMap[t.leaderId]?.name ?? t.leaderId} · 编制 ${t.headcount} 人`,
      })),
    [userMap],
  );

  const skillOptions = useMemo(
    () =>
      SKILLS.map((s) => ({
        value: s.name,
        label: s.name,
        title: `${s.id} · ${s.category} · 需求强度「${DEMAND_META[s.demandLevel].label}」`,
      })),
    [],
  );

  const errorCount = Object.keys(errors).length;

  const taskModal = taskModalId ? TASK_MAP[taskModalId] : null;
  const avgAccept = AI_COLLAB_PREFS.reduce((s, p) => s + p.acceptRatePct, 0) / AI_COLLAB_PREFS.length;

  /* ================= 交互 ================= */

  const toggleSort = (key: PpSortKey) => {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIcon = (key: PpSortKey) =>
    sortKey !== key ? <ChevronRight size={11} className="ac-pp-sort-idle" /> : <TrendingUp size={11} className={sortDir === 'asc' ? 'ac-pp-sort-asc' : 'ac-pp-sort-desc'} />;

  const th = (label: string, key: PpSortKey, align?: string) => (
    <th
      className={`ac-pp-th-sort ${align ?? ''}`}
      onClick={() => toggleSort(key)}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') toggleSort(key);
      }}
    >
      <span className="ac-pp-th-inner">
        {label}
        {sortIcon(key)}
      </span>
    </th>
  );

  const vote = (
    setter: React.Dispatch<React.SetStateAction<Record<string, 'accepted' | 'rejected'>>>,
    id: string,
    v: 'accepted' | 'rejected',
  ) => setter((prev) => ({ ...prev, [id]: v }));

  /* ---- 录入成员 ---- */

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setAiDraft(null);
    setDraft(null);
    setCreateOpen(true);
  };

  const closeCreate = () => setCreateOpen(false);

  /** 局部更新表单，同时清掉被改字段与 AI 前置条件的错误提示 */
  const patchForm = (patch: Partial<CreateForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      Object.keys(patch).forEach((k) => delete next[k]);
      delete next.ai;
      return next;
    });
  };

  /** 姓名变化时联动头像文字：仅在用户未手工改过 initial 时自动取首字 */
  const onNameChange = (v: string) => {
    const first = v.trim().charAt(0);
    const stillAuto = !form.initial || form.initial === form.name.trim().charAt(0);
    patchForm(first && stillAuto ? { name: v, initial: first } : { name: v });
  };

  /** AI 生成档案初稿：前置需已选角色与职级，推导全程确定性（无随机数） */
  const aiFill = () => {
    if (!form.roleId || !form.seniority) {
      setErrors((prev) => ({ ...prev, ai: '请先选择角色与职级' }));
      return;
    }
    const d = deriveMemberDraft(form, allProfiles, userMap);
    setDraft(d);
    patchForm({
      monthlyCostWan: form.monthlyCostWan.trim() ? form.monthlyCostWan : d.monthlyCostWan,
      sprintCapacity: form.sprintCapacity.trim() ? form.sprintCapacity : d.sprintCapacity,
      location: form.location.trim() ? form.location : d.location,
    });
    setAiDraft(
      `AI 做了什么：由 ${AI_DRAFT_AGENT.name}（${AI_DRAFT_AGENT.id}）在 ${AI_DRAFT_MODEL.name}（${AI_DRAFT_MODEL.id} · ${AI_DRAFT_MODEL.deployment} · ${AI_DRAFT_MODEL.egress}）上生成档案初稿，人事与成本数据全程不出内网。` +
        `依据是什么：以 MEMBER_PROFILES 中同职级、同角色成员的成本与产能分布为样本推导，未使用任何随机数，同一份输入必得同一份输出。` +
        `逐项口径：${d.reasons.join('；')}。` +
        `人工如何介入：以上数值只回填当前表单，可逐项改写；确认提交后仅存活在本页 useState，不回写 data.ts / data-mgmt.ts，待 HR 系统与 PingCode 同步后转正。`,
    );
  };

  /** 提交前的全量校验：返回 { 字段: 错误文案 }，空对象表示可提交 */
  const validateCreate = (): Record<string, string> => {
    const e: Record<string, string | undefined> = {
      name: requireText(form.name, '姓名'),
      account: requireText(form.account, '域账号'),
      title: requireText(form.title, '岗位名称'),
      employeeNo: requireText(form.employeeNo, '工号'),
      seniority: requireText(form.seniority, '职级'),
      employmentType: requireText(form.employmentType, '用工形式'),
      joinDate: requireText(form.joinDate, '入职日期'),
      roleId: requireText(form.roleId, '平台角色'),
      monthlyCostWan: requireNumber(form.monthlyCostWan, '月度成本', 0.1, 100),
      sprintCapacity: requireNumber(form.sprintCapacity, '迭代产能', 1, 30),
    };
    const name = form.name.trim();
    if (!e.name && Object.values(userMap).some((u) => u.name === name)) {
      e.name = `成员「${name}」已存在，请勿重复录入`;
    }
    const account = form.account.trim();
    if (!e.account && [...USERS, ...extraUsers].some((u) => u.account === account)) {
      e.account = `域账号 ${account} 已存在`;
    }
    const employeeNo = form.employeeNo.trim();
    if (!e.employeeNo && allProfiles.some((p) => p.employeeNo === employeeNo)) {
      e.employeeNo = `工号 ${employeeNo} 已存在`;
    }
    if (!form.teamIds.length) e.teamIds = '请至少选择 1 个所属团队';
    if (!e.joinDate && form.joinDate > TODAY) e.joinDate = `入职日期不得晚于今日 ${TODAY}`;
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = '邮箱格式不正确';
    return cleanErrors(e);
  };

  /** 组装 UserDef + MemberProfileDef 并写入本地 state（不回写数据模块） */
  const submitCreate = () => {
    const found = validateCreate();
    setErrors(found);
    if (Object.keys(found).length) return;

    const userId = `u-new-${extraUsers.length + 1}`;
    const name = form.name.trim();
    const account = form.account.trim();
    const firstTeamId = form.teamIds[0];
    const isAi = form.employmentType === 'AI 账号';
    const avatarColor: Tone = ROLE_MAP[form.roleId]?.color ?? 'neutral';
    const capacity = Number(form.sprintCapacity);
    const teamPeers = allProfiles.filter((p) => p.teamIds.includes(firstTeamId));
    const dept = form.dept || teamPeers.map((p) => userMap[p.userId]?.dept).find(Boolean) || TEAM_MAP[firstTeamId]?.name || '技术中心';
    const location = form.location.trim() || teamPeers.map((p) => p.location).find(Boolean) || '待补充';

    const newUser: UserDef = {
      id: userId,
      name,
      initial: form.initial.trim() || name.charAt(0),
      account,
      title: form.title.trim(),
      dept,
      email: form.email.trim() || `${account}@${EMAIL_DOMAIN}`,
      roleId: form.roleId,
      avatarColor,
      capacity,
      skills: form.skills,
      ...(isAi ? { isAi: true } : {}),
    };

    const newProfile: MemberProfileDef = {
      userId,
      employeeNo: form.employeeNo.trim(),
      joinDate: form.joinDate,
      seniority: form.seniority as MemberProfileDef['seniority'],
      directReportTo: form.directReportTo || null,
      teamIds: form.teamIds,
      location,
      employmentType: form.employmentType as MemberProfileDef['employmentType'],
      monthlyCostWan: Number(form.monthlyCostWan),
      sprintCapacity: capacity,
      allocatedPoints: 0,
      loadPct: 0,
      overtimeHoursMonth: 0,
      aiAcceptRatePct: isAi ? 0 : draft?.aiAcceptRatePct ?? 0,
      aiRejectReasons: [],
      reviewAvgMin: 0,
      commitCount30d: 0,
      prCount30d: 0,
      defectEscapeCount30d: 0,
      certifications: [],
      growthPlan: {
        goal: form.growthGoal.trim() || '（待补充）',
        actions: draft?.actions ?? [],
        reviewAt: GROWTH_REVIEW_AT,
      },
      statusLabel: '在岗',
      tone: avatarColor,
      note: '本地录入草稿，待 HR 系统与 PingCode 同步后转正',
    };

    setExtraUsers((prev) => [...prev, newUser]);
    setExtraProfiles((prev) => [...prev, newProfile]);
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setAiDraft(null);
    setDraft(null);
    setCreateNote(
      `已录入成员「${name}」（${newProfile.employeeNo} · ${userId} · ${newProfile.seniority} · ${teamNamesOf(newProfile)}），` +
        `当前为本地草稿态：已计入成员名册、成本与产能汇总（共 ${allProfiles.length + 1} 个账号），尚未回写 HR / PingCode；` +
        `新成员暂无 WORKLOADS / SKILL_MATRIX / AI_COLLAB_PREFS 记录，待首次迭代排期与技能复核后生成。`,
    );
  };

  const yanWorkload = WORKLOADS.find((w) => w.userId === 'u-yan');
  const yanProfile = MEMBER_PROFILE_MAP['u-yan'];

  /* ================= 渲染 ================= */

  return (
    <div className="ac-pp" data-annotation-id="ai-sdlc-people-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">人员管理</div>
          <div className="ac-page-desc">
            以「{CURRENT_SPRINT.name}（{CURRENT_SPRINT.startDate} ~ {CURRENT_SPRINT.endDate}，今日 {TODAY}）」为口径，
            统一管理订单中心重构项目组的 {allProfiles.length} 个账号（{summary.humans.length} 位真人 +{' '}
            {summary.ai.length} 个 AI 共享账号）的名册、14 项技能矩阵、迭代产能负载、AI 协作偏好与成长认证。
            负载率 = 已分配故事点 ÷ 产能上限；技能等级 1~5 分别对应「了解概念 / 指导下可完成 / 可独立交付 / 可指导他人 / 可定义标准」。
          </div>
        </div>
        <div className="ac-page-actions">
          <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={openCreate}>
            <Plus size={13} />
            录入成员
          </button>
          <span className="ac-tag ac-tag--outline">
            <CalendarClock size={12} />
            {CURRENT_SPRINT.name} · 剩 {Math.max(0, daysFromToday(CURRENT_SPRINT.endDate))} 天
          </span>
          <span className="ac-tag ac-tag--warn">
            <AlertTriangle size={12} />
            超载 {summary.overloaded} 人
          </span>
          <span className="ac-tag ac-tag--ai">
            <Sparkles size={12} />
            AI 采纳率均值 {fmt(avgAccept)}%
          </span>
          <button
            type="button"
            className="ac-btn ac-btn--ghost ac-btn--sm"
            onClick={() =>
              setPrefNote(
                `已于 ${TODAY} 从 PingCode 与 GitLab 重新拉取 ${allProfiles.length} 个账号的负载、提交与评审数据，技能矩阵按最近一次实操复核结果刷新。${
                  extraProfiles.length ? `其中 ${extraProfiles.length} 人为本地录入草稿，待 HR 系统回写。` : ''
                }`,
              )
            }
          >
            <RefreshCw size={13} />
            {prefNote ? '已刷新数据' : '刷新人员快照'}
          </button>
        </div>
      </div>

      {/* ---------- 页签 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" className={`ac-tab ${tab === t.id ? 'ac-tab--active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={14} />
              {t.name}
              <span className="ac-tab-count">{t.id === 'roster' ? allProfiles.length : t.count}</span>
            </button>
          );
        })}
      </div>

      {createNote ? (
        <div className="ac-hint ac-hint--ok">
          <UserCheck size={14} />
          <span>{createNote}</span>
          <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => setCreateNote(null)}>
            收起
          </button>
        </div>
      ) : null}

      {prefNote ? (
        <div className="ac-hint ac-hint--ok">
          <CheckCircle2 size={14} />
          <span>{prefNote}</span>
        </div>
      ) : null}

      {/* ==================== 1. 成员名册 ==================== */}
      {tab === 'roster' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--6 ac-mb-0" data-annotation-id="ai-sdlc-people-roster-summary">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">账号总数</span>
                <span className="ac-metric-icon">
                  <Users size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {allProfiles.length}
                <span className="ac-metric-unit">个</span>
              </div>
              <div className="ac-metric-foot">
                真人 {summary.humans.length} · AI 账号 {summary.ai.length}
                {extraProfiles.length ? ` · 本地草稿 ${extraProfiles.length}` : ''}
              </div>
            </div>

            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">本迭代产能</span>
                <span className="ac-metric-icon">
                  <Zap size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {summary.capacity}
                <span className="ac-metric-unit">点</span>
              </div>
              <div className="ac-metric-foot">
                已分配 {summary.allocated} 点 · 组合负载 {fmt((summary.allocated / summary.capacity) * 100)}%
              </div>
            </div>

            <div className="ac-metric ac-metric--danger">
              <div className="ac-metric-head">
                <span className="ac-metric-label">超载成员</span>
                <span className="ac-metric-icon">
                  <AlertTriangle size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {summary.overloaded}
                <span className="ac-metric-unit">人</span>
              </div>
              <div className="ac-metric-foot">
                {WORKLOADS.filter((w) => w.overload)
                  .map((w) => `${userMap[w.userId]?.name} ${fmt(w.loadPct)}%`)
                  .join(' · ')}
              </div>
            </div>

            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head">
                <span className="ac-metric-label">月度人力成本</span>
                <span className="ac-metric-icon">
                  <Wallet size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {fmt(summary.cost)}
                <span className="ac-metric-unit">万元</span>
              </div>
              <div className="ac-metric-foot">
                真人 {fmt(summary.humanCost)} 万 · AI 算力折算 {fmt(summary.cost - summary.humanCost)} 万
              </div>
            </div>

            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">平均司龄</span>
                <span className="ac-metric-icon">
                  <Briefcase size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {fmt(summary.avgTenure)}
                <span className="ac-metric-unit">年</span>
              </div>
              <div className="ac-metric-foot">仅统计 {summary.humans.length} 位真人，AI 账号不计入</div>
            </div>

            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">近 30 日缺陷逃逸</span>
                <span className="ac-metric-icon">
                  <HeartPulse size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {summary.escapes}
                <span className="ac-metric-unit">个</span>
              </div>
              <div className="ac-metric-foot">本月加班合计 {summary.overtime} 小时（真人）</div>
            </div>
          </div>

          <div className="ac-section-title">结构分布</div>
          <div className="ac-grid-3" data-annotation-id="ai-sdlc-people-roster-dist">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <IdCard size={16} />
                  按平台角色分布
                </span>
                <span className="ac-card-subtitle">USERS.roleId → ROLES</span>
              </div>
              <div className="ac-card-body">
                <RoleBarChart items={roleDist} />
                <div className="ac-hint ac-mt-3">
                  <Info size={14} />
                  <span>
                    研发角色（含 AI 共享账号）{roleDist.find((r) => r.roleId === 'developer')?.count ?? 0} 人占比最高；
                    产品 / 测试 / PMO 各 1 人，均为单点，任一缺位都会阻塞对应门禁的签发。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Award size={16} />
                  职级与司龄分布
                </span>
                <span className="ac-card-subtitle">MemberProfileDef.seniority / joinDate</span>
              </div>
              <div className="ac-card-body">
                <SeniorityBarChart items={seniorityDist} />
                <dl className="ac-kv ac-mt-3">
                  <dt>P7 ~ P8</dt>
                  <dd className="ac-tnum">
                    {allProfiles.filter((p) => p.seniority === 'P7' || p.seniority === 'P8').length} 人 ·
                    成本 {fmt(allProfiles.filter((p) => p.seniority === 'P7' || p.seniority === 'P8').reduce((s, p) => s + p.monthlyCostWan, 0))} 万
                  </dd>
                  <dt>P5 ~ P6</dt>
                  <dd className="ac-tnum">
                    {allProfiles.filter((p) => p.seniority === 'P5' || p.seniority === 'P6').length} 人 ·
                    成本 {fmt(allProfiles.filter((p) => p.seniority === 'P5' || p.seniority === 'P6').reduce((s, p) => s + p.monthlyCostWan, 0))} 万
                  </dd>
                  <dt>司龄区间</dt>
                  <dd className="ac-tnum">
                    {fmt(Math.min(...summary.humans.map((p) => tenureYears(p.joinDate))))} ~{' '}
                    {fmt(Math.max(...summary.humans.map((p) => tenureYears(p.joinDate))))} 年
                  </dd>
                  <dt>用工形式</dt>
                  <dd>
                    正式 {allProfiles.filter((p) => p.employmentType === '正式').length} · 外包{' '}
                    {allProfiles.filter((p) => p.employmentType === '外包').length} · AI 账号{' '}
                    {allProfiles.filter((p) => p.employmentType === 'AI 账号').length}
                  </dd>
                </dl>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Coins size={16} />
                  成本与产出
                </span>
                <span className="ac-card-subtitle">monthlyCostWan 求和 / 近 30 日提交与 PR</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-pp-cost-list">
                  {[...allProfiles]
                    .sort((a, b) => b.monthlyCostWan - a.monthlyCostWan)
                    .map((p) => (
                      <div className="ac-pp-cost-row" key={p.userId}>
                        <span className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[userMap[p.userId]?.avatarColor ?? 'neutral']}`}>
                          {userMap[p.userId]?.initial}
                        </span>
                        <span className="ac-xs ac-text-2 ac-pp-cost-name">{userMap[p.userId]?.name ?? p.userId}</span>
                        <div className="ac-progress ac-progress--sm ac-flex-1">
                          <div
                            className={`ac-progress-bar ${userMap[p.userId]?.isAi ? '' : 'ac-progress-bar--info'}`}
                            style={{ width: `${(p.monthlyCostWan / costMax) * 100}%` }}
                          />
                        </div>
                        <span className="ac-xs ac-tnum ac-text-1">{fmt(p.monthlyCostWan)} 万</span>
                      </div>
                    ))}
                </div>
                <div className="ac-hint ac-mt-3">
                  <Scale size={14} />
                  <span>
                    每万元成本对应的近 30 日提交数：AI 共享账号 {fmt(MEMBER_PROFILE_MAP['u-ai-copilot'].commitCount30d / MEMBER_PROFILE_MAP['u-ai-copilot'].monthlyCostWan, 0)} 次 / 万元，
                    真人均值 {fmt(
                      summary.humans.reduce((s, p) => s + p.commitCount30d / p.monthlyCostWan, 0) / summary.humans.length,
                      0,
                    )}{' '}
                    次 / 万元。该比值只用于说明算力成本结构，不作为个人绩效口径。
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-section-title">成员卡片</div>
          <div className="ac-grid-3" data-annotation-id="ai-sdlc-people-roster-cards">
            {allProfiles.map((p) => {
              const u = userMap[p.userId];
              if (!u) return null;
              const matrixRows = skillRowOf(p.userId);
              const topSkills = matrixRows.length
                ? matrixRows
                    .slice(0, 3)
                    .map((c) => ({ name: SKILLS.find((s) => s.id === c.skillId)?.name ?? c.skillId, level: c.level }))
                : u.skills.slice(0, 3).map((s) => ({ name: s, level: 0 }));
              const pref = AI_COLLAB_PREFS.find((x) => x.userId === p.userId);
              return (
                <button type="button" key={p.userId} className={`ac-pp-mcard ${u.isAi ? 'ac-pp-mcard--ai' : ''}`} onClick={() => setDrawer({ kind: 'member', profile: p })}>
                  <div className="ac-pp-mcard-head">
                    <span className={`ac-avatar ac-avatar--lg ${u.isAi ? 'ac-avatar--ai' : AVATAR_TONE[u.avatarColor]}`}>{u.initial}</span>
                    <span className="ac-col ac-gap-0 ac-flex-1">
                      <span className="ac-pp-mcard-name">
                        {u.name}
                        {u.isAi ? (
                          <span className="ac-tag ac-tag--sm ac-tag--ai">
                            <Bot size={9} />
                            AI 账号
                          </span>
                        ) : null}
                      </span>
                      <span className="ac-xs ac-muted ac-mono">
                        {p.employeeNo} · {p.seniority}
                      </span>
                    </span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_TAG[p.statusLabel]}`}>
                      <span className={p.statusLabel === '在岗' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                      {p.statusLabel}
                    </span>
                  </div>

                  <div className="ac-xs ac-text-2">{u.title}</div>
                  <div className="ac-xs ac-muted">
                    {u.dept} · {teamNamesOf(p)}
                  </div>

                  <div className="ac-pp-mcard-skills">
                    {topSkills.map((s) => (
                      <span className={`ac-pp-skill-chip ${s.level ? `ac-pp-skill-chip--l${s.level}` : 'ac-pp-skill-chip--ai'}`} key={s.name}>
                        {cut(s.name, 12)}
                        {s.level ? <b>L{s.level}</b> : null}
                      </span>
                    ))}
                  </div>

                  <div className="ac-pp-mcard-load">
                    {u.isAi ? (
                      <span className="ac-xs ac-muted">不占用人力产能 · 算力成本 {fmt(p.monthlyCostWan)} 万/月</span>
                    ) : (
                      <LoadBar loadPct={p.loadPct} capacity={p.sprintCapacity} allocated={p.allocatedPoints} />
                    )}
                  </div>

                  <div className="ac-pp-mcard-foot">
                    <span className="ac-xs ac-muted">
                      <Coins size={11} className="ac-pp-inline-icon" />
                      {fmt(p.monthlyCostWan)} 万/月
                    </span>
                    <span className="ac-xs ac-muted">
                      <Medal size={11} className="ac-pp-inline-icon" />
                      认证 {p.certifications.length}
                    </span>
                    <span className={`ac-xs ${u.isAi ? 'ac-muted' : 'ac-ai-text'}`}>
                      <Sparkles size={11} className="ac-pp-inline-icon" />
                      {u.isAi ? '采纳率不适用' : `AI 采纳率 ${fmt(p.aiAcceptRatePct)}%`}
                    </span>
                    {pref ? <span className="ac-xs ac-muted ac-ml-auto">{pref.dailySessionCount} 次/日</span> : <span className="ac-xs ac-muted ac-ml-auto">{p.commitCount30d} 次提交</span>}
                    <ChevronRight size={14} className="ac-muted" />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="ac-section-title">成员明细表</div>
          <div className="ac-card" data-annotation-id="ai-sdlc-people-roster-table">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                成员名册（{filteredRoster.length} / {allProfiles.length}）
              </span>
              <span className="ac-card-subtitle">15 列口径，点击表头排序，点击行查看完整档案</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  命中成本合计 {fmt(filteredRoster.reduce((s, r) => s + r.profile.monthlyCostWan, 0))} 万
                </span>
              </div>
            </div>

            <div className="ac-filter-bar ac-pp-filter">
              <Search size={14} className="ac-muted" />
              <input
                className="ac-input"
                placeholder="搜索姓名 / 工号 / 岗位 / 部门 / 团队 / 技能"
                value={keyword}
                onChange={(ev) => setKeyword(ev.target.value)}
              />
              <select className="ac-select" value={roleFilter} onChange={(ev) => setRoleFilter(ev.target.value)}>
                <option value="all">全部角色</option>
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={teamFilter} onChange={(ev) => setTeamFilter(ev.target.value)}>
                <option value="all">全部团队</option>
                {teamOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={seniorityFilter} onChange={(ev) => setSeniorityFilter(ev.target.value)}>
                <option value="all">全部职级</option>
                {SENIORITY_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={employmentFilter} onChange={(ev) => setEmploymentFilter(ev.target.value)}>
                <option value="all">全部用工形式</option>
                <option value="正式">正式</option>
                <option value="外包">外包</option>
                <option value="实习">实习</option>
                <option value="AI 账号">AI 账号</option>
              </select>
              <button
                type="button"
                className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto"
                onClick={() => {
                  setKeyword('');
                  setRoleFilter('all');
                  setTeamFilter('all');
                  setSeniorityFilter('all');
                  setEmploymentFilter('all');
                  setSortKey('loadPct');
                  setSortDir('desc');
                }}
              >
                <RefreshCw size={12} />
                重置
              </button>
            </div>

            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      {th('姓名', 'name')}
                      <th>工号</th>
                      {th('职级', 'seniority')}
                      <th>岗位</th>
                      <th>平台角色</th>
                      <th>部门</th>
                      <th>团队</th>
                      {th('入职日期', 'joinDate')}
                      <th>汇报对象</th>
                      <th className="ac-td-center">用工形式</th>
                      {th('月成本', 'monthlyCostWan', 'ac-td-right')}
                      {th('本迭代产能', 'sprintCapacity', 'ac-td-right')}
                      {th('已分配点数', 'allocatedPoints', 'ac-td-right')}
                      {th('负载率', 'loadPct', 'ac-td-right')}
                      {th('AI 采纳率', 'aiAcceptRatePct', 'ac-td-right')}
                      <th className="ac-td-right">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoster.map(({ profile, user, role }) => (
                      <tr key={profile.userId} className="ac-pp-row" onClick={() => setDrawer({ kind: 'member', profile })}>
                        <td>
                          <PersonCell userId={profile.userId} size="xs" showTitle={false} user={user} />
                          {isNewMember(profile.userId) ? (
                            <span className="ac-tag ac-tag--sm ac-tag--ai ac-ml-1">新建 · 待同步</span>
                          ) : null}
                        </td>
                        <td className="ac-mono ac-xs ac-muted ac-nowrap">{profile.employeeNo}</td>
                        <td>
                          <span className="ac-tag ac-tag--sm ac-tag--outline">{profile.seniority}</span>
                        </td>
                        <td className="ac-xs ac-text-2 ac-nowrap">{user?.title}</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${role ? TAG_TONE[role.tagTone] : 'neutral'}`}>{role?.short ?? '—'}</span>
                        </td>
                        <td className="ac-xs ac-text-2 ac-nowrap">{user?.dept}</td>
                        <td className="ac-xs ac-text-2 ac-pp-cell-team">{teamNamesOf(profile)}</td>
                        <td className="ac-td-num ac-xs ac-nowrap">
                          {profile.joinDate}
                          <div className="ac-xs ac-muted">{fmt(tenureYears(profile.joinDate))} 年</div>
                        </td>
                        <td className="ac-xs ac-text-2 ac-nowrap">
                          {profile.directReportTo ? userMap[profile.directReportTo]?.name ?? profile.directReportTo : '—'}
                        </td>
                        <td className="ac-td-center">
                          <span className={`ac-tag ac-tag--sm ac-tag--${EMPLOYMENT_TAG[profile.employmentType]}`}>{profile.employmentType}</span>
                        </td>
                        <td className="ac-td-num">{fmt(profile.monthlyCostWan)}</td>
                        <td className="ac-td-num">{profile.sprintCapacity}</td>
                        <td className="ac-td-num">{profile.allocatedPoints}</td>
                        <td className={`ac-td-num ac-bold ${TEXT_TONE[loadTone(profile.loadPct)]}`}>
                          {user?.isAi ? '—' : `${fmt(profile.loadPct)}%`}
                        </td>
                        <td className="ac-td-num">{user?.isAi ? '—' : `${fmt(profile.aiAcceptRatePct)}%`}</td>
                        <td className="ac-td-right">
                          <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_TAG[profile.statusLabel]}`}>{profile.statusLabel}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRoster.length === 0 ? (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-icon">
                      <Search size={22} />
                    </div>
                    <div className="ac-empty-title">没有匹配的成员</div>
                    <div className="ac-empty-desc">
                      当前筛选条件下无结果。名册共 {allProfiles.length} 个账号，其中 AI 共享账号不归属任何团队，
                      按「团队」筛选时不会命中。
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Info size={14} />
                <span>
                  口径说明：负载率 = allocatedPoints ÷ sprintCapacity × 100（与 WORKLOADS 严格一致），
                  ≥150% 记为 danger、80~149.9% 记为 warn；AI 共享账号不占用人力产能，故负载率与采纳率显示为「—」；
                  月成本为月度综合成本（万元），AI 账号为算力折算成本。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 2. 技能矩阵 ==================== */}
      {tab === 'skill' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-people-skill-heatmap">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Layers size={16} />
                人 × 技能能力矩阵
              </span>
              <span className="ac-card-subtitle">
                {HUMAN_USER_IDS.length} 位真人 × {SKILLS.length} 项技能 = {SKILL_MATRIX.length} 格；格内数字为 level，紫色描边 = 持有覆盖该技能的认证
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">点击任意格查看详情</span>
              </div>
            </div>
            <div className="ac-card-body">
              <SkillHeatmap onPick={(cell) => setDrawer({ kind: 'cell', cell })} />
              <div className="ac-hint ac-mt-3">
                <Info size={14} />
                <span>
                  AI 共享账号（u-ai-copilot）不入矩阵：它是平台级共享资源，能力由 7 个 Agent 与 5 个模型组合提供，
                  不具备「个人熟练度」语义。矩阵中 level ≤ 2 且 AI 辅助率 &gt; 85% 的格子代表「当前靠 AI 兜底、人工无法独立接手」的能力空洞。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-grid-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Target size={16} />
                  技能维度汇总（{filteredSkillStats.length} / {SKILLS.length}）
                </span>
                <span className="ac-card-subtitle">掌握 = level ≥ 3；专家 = level ≥ 4</span>
              </div>
              <div className="ac-filter-bar">
                <select className="ac-select ac-select--sm" value={skillCategory} onChange={(ev) => setSkillCategory(ev.target.value)}>
                  <option value="all">全部类别</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`ac-btn ac-btn--sm ${singlePointOnly ? 'ac-btn--primary' : 'ac-btn--ghost'}`}
                  onClick={() => setSinglePointOnly(!singlePointOnly)}
                >
                  <AlertTriangle size={12} />
                  只看单点风险（{skillStats.filter((s) => s.singlePoint).length}）
                </button>
              </div>
              <div className="ac-card-body ac-card-body--flush">
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm">
                    <thead>
                      <tr>
                        <th>技能</th>
                        <th>类别</th>
                        <th className="ac-td-center">需求强度</th>
                        <th className="ac-td-right">稀缺度</th>
                        <th className="ac-td-right">掌握</th>
                        <th className="ac-td-right">专家</th>
                        <th className="ac-td-right">平均</th>
                        <th className="ac-td-center">单点风险</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSkillStats.map((s) => (
                        <tr key={s.skill.id}>
                          <td>
                            <div className="ac-semi ac-text-1 ac-pp-cell-skill">{s.skill.name}</div>
                            <span className="ac-xs ac-muted ac-mono">
                              {s.skill.id} · {s.skill.relatedRef}
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[s.skill.tone]}`}>{s.skill.category}</span>
                          </td>
                          <td className="ac-td-center">
                            <span className={`ac-tag ac-tag--sm ac-tag--${DEMAND_META[s.skill.demandLevel].tagTone}`}>
                              {DEMAND_META[s.skill.demandLevel].label}
                            </span>
                          </td>
                          <td className={`ac-td-num ${s.skill.scarcityPct >= 40 ? 'ac-danger-text' : ''}`}>{s.skill.scarcityPct}%</td>
                          <td className="ac-td-num">
                            {s.holders}
                            <span className="ac-xs ac-muted"> / {s.cells.length}</span>
                          </td>
                          <td className={`ac-td-num ${s.experts <= 1 ? 'ac-danger-text ac-bold' : ''}`}>{s.experts}</td>
                          <td className="ac-td-num">
                            {fmt(s.avg, 2)}
                            <div className="ac-progress ac-progress--sm ac-mt-1">
                              <div className="ac-progress-bar" style={{ width: `${(s.avg / 5) * 100}%` }} />
                            </div>
                          </td>
                          <td className="ac-td-center">
                            {s.singlePoint ? (
                              <span className="ac-tag ac-tag--sm ac-tag--danger" title={`仅 ${USER_MAP[s.topUser]?.name} 达到 level ≥ 4`}>
                                <AlertTriangle size={10} />
                                {USER_MAP[s.topUser]?.name}
                              </span>
                            ) : (
                              <span className="ac-tag ac-tag--sm ac-tag--ok">已冗余</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredSkillStats.length === 0 ? (
                    <div className="ac-empty ac-empty--sm">
                      <div className="ac-empty-icon">
                        <Layers size={20} />
                      </div>
                      <div className="ac-empty-title">该筛选条件下没有技能</div>
                      <div className="ac-empty-desc">
                        {singlePointOnly
                          ? '当前类别下不存在「仅 1 人 level ≥ 4 且需求强度为关键/高」的单点风险技能。'
                          : '请选择其他技能类别。'}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <UserCheck size={16} />
                  人员维度汇总（{personStats.length}）
                </span>
                <span className="ac-card-subtitle">覆盖广度 = level ≥ 3 的技能数；深度 = level ≥ 4 的技能数</span>
              </div>
              <div className="ac-card-body ac-card-body--flush">
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm">
                    <thead>
                      <tr>
                        <th>成员</th>
                        <th className="ac-td-right">广度</th>
                        <th className="ac-td-right">深度</th>
                        <th className="ac-td-right">平均等级</th>
                        <th>最强项</th>
                        <th className="ac-td-right">认证</th>
                        <th className="ac-td-right">AI 辅助均值</th>
                        <th className="ac-td-num">最近使用</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...personStats]
                        .sort((a, b) => b.depth - a.depth || b.avg - a.avg)
                        .map((ps) => (
                          <tr key={ps.userId} className="ac-pp-row" onClick={() => setDrawer({ kind: 'member', profile: MEMBER_PROFILE_MAP[ps.userId] })}>
                            <td>
                              <PersonCell userId={ps.userId} size="xs" showTitle={false} />
                            </td>
                            <td className="ac-td-num">
                              {ps.breadth}
                              <span className="ac-xs ac-muted"> / {SKILLS.length}</span>
                            </td>
                            <td className={`ac-td-num ${ps.depth >= 5 ? 'ac-ok-text ac-bold' : ''}`}>{ps.depth}</td>
                            <td className="ac-td-num">
                              {fmt(ps.avg, 2)}
                              <div className="ac-progress ac-progress--sm ac-mt-1">
                                <div className="ac-progress-bar" style={{ width: `${(ps.avg / 5) * 100}%` }} />
                              </div>
                            </td>
                            <td className="ac-xs ac-text-2 ac-pp-cell-skill">
                              {ps.best ? `${SKILLS.find((s) => s.id === ps.best!.skillId)?.name} L${ps.best.level}` : '—'}
                            </td>
                            <td className="ac-td-num">{ps.certCount}</td>
                            <td className="ac-td-num">{fmt(ps.aiAssistAvg, 0)}%</td>
                            <td className="ac-td-num ac-xs">{ps.lastUsed}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ac-card-foot">
                <div className="ac-hint">
                  <Scale size={14} />
                  <span>
                    广度与深度共同决定「可承接任务的类型宽度」与「可独立决策的技术深度」：严慕舟深度最高（8 项 level ≥ 4），
                    是全组的技术仲裁点；顾时衍 / 苏文瑾广度集中在产品与管理类技能，研发类技能 level 普遍为 1，
                    这是角色分工的正常结果，不应作为能力短板考核。
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 技能洞察</div>
          <div className="ac-card ac-pp-ai-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                技能缺口 · 单点依赖 · backup 人选
              </span>
              <span className="ac-card-subtitle">
                输入：SKILL_MATRIX 的 {SKILL_MATRIX.length} 格 level / certified / aiAssistRatePct / lastUsedAt + SKILLS 的 demandLevel / scarcityPct
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">
                  <Sparkles size={12} />
                  {skillInsights.length} 条洞察
                </span>
                <span className="ac-tag ac-tag--outline">
                  单点风险 {skillStats.filter((s) => s.singlePoint).length} 项
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pp-insight-list">
                {skillInsights.map((it) => (
                  <div className={`ac-pp-insight ac-pp-insight--${it.level}`} key={it.id}>
                    <div className="ac-pp-insight-head">
                      <span className="ac-pp-insight-icon">
                        {it.level === 'danger' ? <AlertTriangle size={14} /> : it.level === 'warn' ? <AlertTriangle size={14} /> : it.level === 'ok' ? <CheckCircle2 size={14} /> : <Activity size={14} />}
                      </span>
                      <span className="ac-pp-insight-title">{it.title}</span>
                      <span className="ac-ml-auto">
                        <AiVoteBar state={insightVotes[it.id]} onVote={(v) => vote(setInsightVotes, it.id, v)} />
                      </span>
                    </div>
                    <div className="ac-pp-signals">
                      {it.signals.map((s) => (
                        <span className="ac-pp-signal" key={`${it.id}-${s.source}`}>
                          <span className="ac-pp-signal-source ac-mono">{s.source}</span>
                          <span className="ac-pp-signal-value">{s.value}</span>
                        </span>
                      ))}
                    </div>
                    <div className="ac-pp-action">
                      <ArrowRight size={12} />
                      建议动作：{it.action}
                    </div>
                    {insightVotes[it.id] === 'accepted' ? (
                      <div className="ac-xs ac-ok-text ac-mt-2">
                        <CheckCircle2 size={11} className="ac-pp-inline-icon" />
                        已写入 SP-25 团队能力建设清单，并同步到相关成员的 growthPlan.actions。
                      </div>
                    ) : insightVotes[it.id] === 'rejected' ? (
                      <div className="ac-xs ac-muted ac-mt-2">
                        <XCircle size={11} className="ac-pp-inline-icon" />
                        已驳回：本条不进入能力建设清单，矩阵原始数据不受影响。
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="ac-hint ac-hint--ai ac-mt-3">
                <Sparkles size={14} />
                <span>
                  AI 做了什么：把 126 格矩阵按技能维度与人员维度双向聚合，识别「仅 1 人 level ≥ 4」的单点技能、
                  critical 技能的团队水位缺口、以及 level 与 AI 辅助率的倒挂关系，并为每个单点技能从矩阵里挑出等级最高的其他成员作为 backup 候选；
                  依据是什么：每条洞察都标注了 SKILLS / SKILL_MATRIX 的具体字段与数值；
                  人工如何介入：采纳后写入 SP-25 能力建设清单并挂到成员 growthPlan，驳回则不产生任何数据变更，表决仅存于页面本地状态。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 3. 产能与负载 ==================== */}
      {tab === 'workload' && (
        <>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Activity size={16} />
                {CURRENT_SPRINT.name} 负载分布
              </span>
              <span className="ac-card-subtitle">
                条形 = 已分配点数，深色叠加 = 超出产能的部分，虚线 = 该成员的 100% 产能参考线（capacityPoints）
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">点击条形查看构成</span>
                <span className="ac-tag ac-tag--danger">超载 {WORKLOADS.filter((w) => w.overload).length} 人</span>
              </div>
            </div>
            <div className="ac-card-body">
              <WorkloadBars onPick={(w) => setDrawer({ kind: 'workload', wl: w })} />
              <div className="ac-pp-legend">
                <span className="ac-legend-item">
                  <span className="ac-legend-swatch" style={{ background: TONE_HEX.ok }} />
                  负载 &lt; 80%
                </span>
                <span className="ac-legend-item">
                  <span className="ac-legend-swatch" style={{ background: TONE_HEX.warn }} />
                  80% ~ 149.9%
                </span>
                <span className="ac-legend-item">
                  <span className="ac-legend-swatch" style={{ background: TONE_HEX.danger }} />
                  ≥ 150%（含超产能叠加）
                </span>
                <span className="ac-pp-legend-note">
                  合计：产能 {WORKLOADS.reduce((s, w) => s + w.capacityPoints, 0)} 点 · 已分配{' '}
                  {WORKLOADS.reduce((s, w) => s + w.allocatedPoints, 0)} 点 · AI 分担{' '}
                  {WORKLOADS.reduce((s, w) => s + w.aiOffloadPoints, 0)} 点（占{' '}
                  {fmt((WORKLOADS.reduce((s, w) => s + w.aiOffloadPoints, 0) / WORKLOADS.reduce((s, w) => s + w.allocatedPoints, 0)) * 100, 0)}%）
                </span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">负载明细</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                迭代负载表（{WORKLOADS.length}）
              </span>
              <span className="ac-card-subtitle">承接任务为真实 TASK-24xx，点击标签查看工作项详情</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">{CURRENT_SPRINT.id}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th>角色</th>
                      <th>团队</th>
                      <th className="ac-td-right">产能点数</th>
                      <th className="ac-td-right">已分配点数</th>
                      <th className="ac-td-right">负载率</th>
                      <th className="ac-td-center">是否超载</th>
                      <th>承接 / 评审任务</th>
                      <th className="ac-td-right">AI 分担点数</th>
                      <th>风险说明</th>
                      <th>AI 建议动作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...WORKLOADS]
                      .sort((a, b) => b.loadPct - a.loadPct)
                      .map((w) => {
                        const u = USER_MAP[w.userId];
                        const p = MEMBER_PROFILE_MAP[w.userId];
                        return (
                          <tr key={w.userId} className="ac-pp-row" onClick={() => setDrawer({ kind: 'workload', wl: w })}>
                            <td>
                              <PersonCell userId={w.userId} size="xs" />
                            </td>
                            <td className="ac-xs ac-text-2 ac-nowrap">{u?.title}</td>
                            <td className="ac-xs ac-text-2 ac-pp-cell-team">{p ? teamNamesOf(p) : '—'}</td>
                            <td className="ac-td-num">{w.capacityPoints}</td>
                            <td className="ac-td-num">{w.allocatedPoints}</td>
                            <td className={`ac-td-num ac-bold ${TEXT_TONE[loadTone(w.loadPct)]}`}>{fmt(w.loadPct)}%</td>
                            <td className="ac-td-center">
                              <span className={`ac-tag ac-tag--sm ac-tag--${w.overload ? 'danger' : 'ok'}`}>
                                {w.overload ? '超载' : '正常'}
                              </span>
                            </td>
                            <td>
                              <span className="ac-pp-task-chips">
                                {w.taskIds.map((id) => (
                                  <button
                                    key={id}
                                    type="button"
                                    className={`ac-pp-task-chip ${TASK_MAP[id]?.ownerId === w.userId ? '' : 'ac-pp-task-chip--review'}`}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setTaskModalId(id);
                                    }}
                                    title={TASK_MAP[id]?.title}
                                  >
                                    {id.replace('TASK-', '')}
                                  </button>
                                ))}
                              </span>
                            </td>
                            <td className="ac-td-num">
                              {w.aiOffloadPoints}
                              <div className="ac-xs ac-muted">{fmt((w.aiOffloadPoints / Math.max(w.allocatedPoints, 1)) * 100, 0)}%</div>
                            </td>
                            <td className="ac-xs ac-text-2 ac-pp-cell-note">{cut(w.riskNote, 76)}</td>
                            <td className="ac-xs ac-pp-cell-note">
                              <span className="ac-ai-text">{cut(w.suggestedAction, 76)}</span>
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
                <Scale size={14} />
                <span>
                  allocatedPoints 口径：研发角色 = 其在 TASKS 中作为 ownerId 的故事点合计（可逐条复核）；
                  产品 / 测试 / PMO / 管理者未直接承接 TASK-24xx，其点数由 {CURRENT_SPRINT.id} 承诺的非任务型工作项折算，
                  构成写在 WorkloadDef.note 中；taskIds 的深色标签 = 本人承接（ownerId），浅色标签 = 非本人承接
                  （多数为 reviewerId 评审，顾时衍一行例外，是其作为 PMO 治理对象的关键路径阻塞链 TASK-2419/2420/2421）。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-grid-3-2">
            <div className="ac-card ac-pp-ai-card" data-annotation-id="ai-sdlc-people-workload-rebalance">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sparkles size={16} />
                  AI 产能再平衡建议
                </span>
                <span className="ac-card-subtitle">基于超载与闲置对比，给出具体的「谁的任务移给谁、移多少点」</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--ai">{rebalance.length} 条</span>
                  <span className="ac-tag ac-tag--outline">
                    已采纳 {Object.values(rebalanceVotes).filter((v) => v === 'accepted').length}
                  </span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-pp-rebalance-list">
                  {rebalance.map((r) => (
                    <div className={`ac-pp-rebalance ac-pp-rebalance--${r.kind}`} key={r.id}>
                      <div className="ac-pp-rebalance-head">
                        <span className="ac-mono ac-xs ac-muted">{r.id}</span>
                        <span
                          className={`ac-tag ac-tag--sm ac-tag--${
                            r.kind === 'transfer' ? 'brand' : r.kind === 'release' ? 'ok' : r.kind === 'absorb' ? 'info' : 'warn'
                          }`}
                        >
                          {r.kind === 'transfer' ? '任务转交' : r.kind === 'release' ? '释放已交付点数' : r.kind === 'absorb' ? '吸收闲置产能' : '评审瓶颈治理'}
                        </span>
                        {r.fromId ? <PersonCell userId={r.fromId} size="xs" showTitle={false} /> : null}
                        {r.fromId && r.toId && r.fromId !== r.toId ? <ArrowRight size={13} className="ac-muted" /> : null}
                        {r.toId && r.fromId !== r.toId ? <PersonCell userId={r.toId} size="xs" showTitle={false} /> : null}
                        <span className="ac-tag ac-tag--sm ac-tag--outline ac-tnum">{r.points} 点</span>
                        <span className="ac-ml-auto">
                          <AiVoteBar state={rebalanceVotes[r.id]} onVote={(v) => vote(setRebalanceVotes, r.id, v)} />
                        </span>
                      </div>
                      <div className="ac-pp-rebalance-tasks">
                        {r.taskIds.map((id) => (
                          <button key={id} type="button" className="ac-pp-task-chip" onClick={() => setTaskModalId(id)} title={TASK_MAP[id]?.title}>
                            {id}
                          </button>
                        ))}
                      </div>
                      <div className="ac-pp-signal">
                        <span className="ac-pp-signal-source ac-mono">依据</span>
                        <span className="ac-pp-signal-value">{r.basis}</span>
                      </div>
                      <div className="ac-pp-action">
                        <ArrowRight size={12} />
                        {r.action}
                      </div>
                      {rebalanceVotes[r.id] === 'accepted' ? (
                        <div className="ac-hint ac-hint--ok ac-mt-2">
                          <CheckCircle2 size={13} />
                          <span>
                            已采纳：{r.taskIds.join(' / ')} 的 ownerId 变更请求已提交（本地乐观更新，共 {r.points} 点），
                            同时通知双方与 PMO；实际生效需在任务看板上确认状态机允许的流转边。
                          </span>
                        </div>
                      ) : rebalanceVotes[r.id] === 'rejected' ? (
                        <div className="ac-hint ac-mt-2">
                          <XCircle size={13} />
                          <span>已驳回：负载快照保持原样，本条建议将在下一次 WORKLOADS 复算时重新评估。</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Handshake size={16} />
                  反差案例：严慕舟
                </span>
                <span className="ac-card-subtitle">故事点负载低，但评审与方案确认已饱和</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--warn">口径盲区</span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-pp-contrast">
                  <div className="ac-pp-contrast-item">
                    <span className="ac-xs ac-muted">故事点负载</span>
                    <span className="ac-pp-contrast-value ac-ok-text">{yanWorkload ? fmt(yanWorkload.loadPct) : '—'}%</span>
                    <span className="ac-xs ac-muted">
                      {yanWorkload?.allocatedPoints} / {yanWorkload?.capacityPoints} 点 · 全组最低
                    </span>
                  </div>
                  <div className="ac-pp-contrast-item">
                    <span className="ac-xs ac-muted">承担评审的任务</span>
                    <span className="ac-pp-contrast-value ac-danger-text">{reviewCountOf('u-yan')}</span>
                    <span className="ac-xs ac-muted">个 · 占全组 {Math.round((reviewCountOf('u-yan') / Object.keys(TASK_MAP).length) * 100)}%</span>
                  </div>
                  <div className="ac-pp-contrast-item">
                    <span className="ac-xs ac-muted">平均评审耗时</span>
                    <span className="ac-pp-contrast-value ac-warn-text">{yanProfile?.reviewAvgMin}</span>
                    <span className="ac-xs ac-muted">分钟 / 次 · 高于团队均值</span>
                  </div>
                  <div className="ac-pp-contrast-item">
                    <span className="ac-xs ac-muted">本月加班</span>
                    <span className="ac-pp-contrast-value ac-warn-text">{yanProfile?.overtimeHoursMonth}</span>
                    <span className="ac-xs ac-muted">小时 · 负载低但工时高</span>
                  </div>
                </div>

                <div className="ac-hint ac-hint--warn ac-mt-3">
                  <AlertTriangle size={14} />
                  <span>
                    故事点口径掩盖了评审瓶颈：{yanProfile?.note}
                  </span>
                </div>

                <div className="ac-ai-block ac-mt-3">
                  <div className="ac-ai-block-title">
                    <Sparkles size={14} />
                    AI 结论
                  </div>
                  <div className="ac-mt-2">
                    负载率只统计 ownerId 维度的故事点，不含 reviewerId 维度的评审工时与契约冻结责任，
                    因此严慕舟呈现「38.5% 低负载 + 22 小时加班」的矛盾信号。若仅按故事点做资源调配，
                    会错误地把他判定为可承接新任务的闲置产能，实际上一旦再压任务，API-10 契约冻结与{' '}
                    {reviewCountOf('u-yan')} 个任务的评审就会成为新的关键路径瓶颈。
                    正确的做法是把评审工时纳入负载口径（建议按「评审任务数 × 平均评审耗时」折算为等效点数），
                    并按 RB-05 把规约类评审前移给 ag-review 拦截。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 4. AI 协作偏好 ==================== */}
      {tab === 'ai-pref' && (
        <>
          <div className="ac-grid-3" data-annotation-id="ai-sdlc-people-aipref-accept">
            {AI_COLLAB_PREFS.map((pref) => {
              const u = USER_MAP[pref.userId];
              const p = MEMBER_PROFILE_MAP[pref.userId];
              if (!u || !p) return null;
              return (
                <div className="ac-pp-pref-card" key={pref.userId}>
                  <div className="ac-pp-pref-head">
                    <PersonCell userId={pref.userId} />
                    <span className="ac-ml-auto ac-col ac-gap-0 ac-align-end">
                      <FeedbackStars score={pref.feedbackScore} />
                      <span className="ac-xs ac-muted">满意度 {pref.feedbackScore} / 5</span>
                    </span>
                  </div>

                  <div className="ac-pp-pref-rate">
                    <span className="ac-pp-pref-rate-value">{fmt(pref.acceptRatePct)}%</span>
                    <span className="ac-xs ac-muted">AI 建议采纳率</span>
                    <span className={`ac-tag ac-tag--sm ac-tag--${pref.acceptRatePct >= avgAccept ? 'ok' : 'warn'}`}>
                      {pref.acceptRatePct >= avgAccept ? '高于' : '低于'}团队均值 {fmt(avgAccept)}%
                    </span>
                  </div>

                  <dl className="ac-kv ac-pp-pref-kv">
                    <dt>首选 Agent</dt>
                    <dd>
                      <span className="ac-row ac-gap-1 ac-wrap">
                        {pref.preferredAgentIds.map((id) => {
                          const a = agents.find((x) => x.id === id);
                          return (
                            <span key={id} className={`ac-tag ac-tag--sm ac-tag--${a ? TAG_TONE[a.tone] : 'outline'}`}>
                              <Cpu size={10} />
                              {a?.name ?? id}
                            </span>
                          );
                        })}
                      </span>
                    </dd>
                    <dt>首选模型</dt>
                    <dd>
                      <span className="ac-row ac-gap-1 ac-wrap">
                        {pref.preferredModelIds.map((id) => {
                          const m = models.find((x) => x.id === id);
                          return (
                            <span key={id} className={`ac-tag ac-tag--sm ac-tag--${m ? TAG_TONE[m.tone] : 'outline'}`}>
                              {m?.name ?? id}
                            </span>
                          );
                        })}
                      </span>
                    </dd>
                    <dt>自动接受</dt>
                    <dd className="ac-xs">{AUTO_ACCEPT_LABEL[pref.autoAcceptScope]}</dd>
                    <dt>使用强度</dt>
                    <dd className="ac-tnum ac-xs">
                      日均 {pref.dailySessionCount} 次会话 · 单次 {pref.avgSessionMin} 分钟 · 折合{' '}
                      {fmt((pref.dailySessionCount * pref.avgSessionMin) / 60)} 小时/日
                    </dd>
                    <dt>提示词模板</dt>
                    <dd>
                      <span className="ac-row ac-gap-1 ac-wrap">
                        {pref.promptTemplateIds.map((id) => (
                          <span key={id} className="ac-tag ac-tag--sm ac-tag--outline ac-mono">
                            {id}
                          </span>
                        ))}
                      </span>
                    </dd>
                    <dt>关闭 AI 环节</dt>
                    <dd>
                      {pref.optOutStages.length ? (
                        <span className="ac-row ac-gap-1 ac-wrap">
                          {pref.optOutStages.map((id) => {
                            const st = SDLC_STAGES.find((s) => s.id === id);
                            return (
                              <span key={id} className="ac-tag ac-tag--sm ac-tag--neutral">
                                {st ? `${st.code} ${st.name}` : id}
                              </span>
                            );
                          })}
                        </span>
                      ) : (
                        <span className="ac-tag ac-tag--sm ac-tag--ok">六大环节全开启</span>
                      )}
                    </dd>
                  </dl>

                  <div className="ac-pp-pref-usecase">
                    <div className="ac-xs ac-muted ac-mb-2">Top3 使用场景</div>
                    <ul className="ac-pp-list ac-pp-list--sm">
                      {pref.topUseCases.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="ac-pp-pref-foot">
                    <span className="ac-xs ac-muted">
                      <XCircle size={11} className="ac-pp-inline-icon" />
                      Top 拒绝理由：{p.aiRejectReasons.map(classifyReject).filter((v, i, a) => a.indexOf(v) === i).join('、')}
                    </span>
                    <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => setDrawer({ kind: 'member', profile: p })}>
                      完整档案
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ac-grid-3-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <TrendingUp size={16} />
                  采纳率对比
                </span>
                <span className="ac-card-subtitle">
                  AI_COLLAB_PREFS.acceptRatePct（与 MEMBER_PROFILES.aiAcceptRatePct 同源），紫色虚线为团队均值
                </span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--ai">均值 {fmt(avgAccept)}%</span>
                </div>
              </div>
              <div className="ac-card-body">
                <AcceptRateBars />
                <div className="ac-hint ac-mt-3">
                  <Info size={14} />
                  <span>
                    最高 {USER_MAP[[...AI_COLLAB_PREFS].sort((a, b) => b.acceptRatePct - a.acceptRatePct)[0].userId]?.name}{' '}
                    {fmt(Math.max(...AI_COLLAB_PREFS.map((p) => p.acceptRatePct)))}%（autoAcceptScope = 全部自动采纳），
                    最低 {USER_MAP[[...AI_COLLAB_PREFS].sort((a, b) => a.acceptRatePct - b.acceptRatePct)[0].userId]?.name}{' '}
                    {fmt(Math.min(...AI_COLLAB_PREFS.map((p) => p.acceptRatePct)))}%（autoAcceptScope = 不自动采纳）。
                    采纳率高低不等于协作质量：管理者角色拒绝的多是「缺依据、不可执行」的建议，属于有效筛选。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Fingerprint size={16} />
                  拒绝理由聚合
                </span>
                <span className="ac-card-subtitle">
                  {allProfiles.reduce((s, p) => s + p.aiRejectReasons.length, 0)} 条原文归为 {rejectAgg.all.length} 类，展示 top 5
                </span>
              </div>
              <div className="ac-card-body ac-pp-reject-body">
                <RejectDonut items={[...rejectAgg.top.map((t) => ({ cat: t.cat, count: t.count })), { cat: '其他', count: rejectAgg.rest.count }]} total={rejectAgg.total} />
                <div className="ac-legend ac-flex-1">
                  {[...rejectAgg.top.map((t) => ({ cat: t.cat, count: t.count })), { cat: `其他（${rejectAgg.rest.detail.length} 类）`, count: rejectAgg.rest.count }].map((it, idx) => (
                    <span className="ac-legend-item" key={it.cat}>
                      <span className="ac-legend-swatch" style={{ background: ['#ef4444', '#f59e0b', '#4f46e5', '#0d9488', '#7c3aed', '#94a3b8'][idx % 6] }} />
                      {it.cat}
                      <span className="ac-legend-value">
                        {it.count} · {fmt((it.count / rejectAgg.total) * 100, 0)}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="ac-card-foot">
                <div className="ac-pp-improve">
                  <div className="ac-pp-improve-title">
                    <Sparkles size={13} />
                    AI 改进方向（按占比排序）
                  </div>
                  {rejectAgg.top.map((t) => (
                    <div className="ac-pp-improve-item" key={t.cat}>
                      <span className="ac-tag ac-tag--sm ac-tag--ai">{t.cat}</span>
                      <span className="ac-xs ac-text-2">{REJECT_IMPROVE[t.cat] ?? '需人工补充改进方向。'}</span>
                      <span className="ac-xs ac-muted ac-pp-improve-sample">例：{cut(t.samples[0], 34)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ac-section-title">提示词模板使用分布</div>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <FileText size={16} />
                常用提示词模板（{templateDist.length}）
              </span>
              <span className="ac-card-subtitle">AI_COLLAB_PREFS.promptTemplateIds 与知识库编号同源</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">合计引用 {AI_COLLAB_PREFS.reduce((s, p) => s + p.promptTemplateIds.length, 0)} 次</span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pp-template-grid">
                {templateDist.map((t) => (
                  <div className="ac-pp-template" key={t.id}>
                    <div className="ac-row ac-gap-2">
                      <span className="ac-mono ac-brand-text ac-semi">{t.id}</span>
                      <span className="ac-tag ac-tag--sm ac-tag--ai ac-ml-auto">{t.count} 人使用</span>
                    </div>
                    <div className="ac-progress ac-progress--sm ac-mt-2">
                      <div className="ac-progress-bar" style={{ width: `${(t.count / AI_COLLAB_PREFS.length) * 100}%` }} />
                    </div>
                    <div className="ac-avatar-group ac-mt-2">
                      {t.users.map((uid) => (
                        <span key={uid} className={`ac-avatar ac-avatar--xs ${AVATAR_TONE[USER_MAP[uid]?.avatarColor ?? 'neutral']}`} title={USER_MAP[uid]?.name}>
                          {USER_MAP[uid]?.initial}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="ac-hint ac-mt-3">
                <Info size={14} />
                <span>
                  KB-CODE-02《金额计算规约》与 KB-ARCH-01《架构分层约束》是使用最广的两个模板，
                  恰好对应拒绝理由聚合中占比最高的「违反架构与编码规约」与「领域正确性缺陷」两类——
                  说明模板已被召回，但约束强度不足，需要把它们从「参考上下文」升级为「阻断式规则」。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== 5. 成长与认证 ==================== */}
      {tab === 'growth' && (
        <>
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Medal size={16} />
                认证登记表（{CERTIFICATIONS.length}）
              </span>
              <span className="ac-card-subtitle">
                临期阈值 {CERT_WARN_DAYS} 天（以 TODAY = {TODAY} 为基准）；持有人头像取自 USER_MAP
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">
                  有效 {CERTIFICATIONS.filter((c) => daysFromToday(c.validUntil) > CERT_WARN_DAYS).length}
                </span>
                <span className="ac-tag ac-tag--warn">
                  临期 {CERTIFICATIONS.filter((c) => daysFromToday(c.validUntil) >= 0 && daysFromToday(c.validUntil) <= CERT_WARN_DAYS).length}
                </span>
                <span className="ac-tag ac-tag--danger">已过期 {CERTIFICATIONS.filter((c) => daysFromToday(c.validUntil) < 0).length}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>认证名称</th>
                      <th>发证机构</th>
                      <th className="ac-td-center">等级</th>
                      <th className="ac-td-num">有效期至</th>
                      <th className="ac-td-right">剩余天数</th>
                      <th className="ac-td-center">状态</th>
                      <th>持有人</th>
                      <th>关联技能</th>
                      <th className="ac-td-num">编号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...CERTIFICATIONS]
                      .sort((a, b) => dayIdx(a.validUntil) - dayIdx(b.validUntil))
                      .map((c) => {
                        const left = daysFromToday(c.validUntil);
                        const tone = left < 0 ? 'danger' : left <= CERT_WARN_DAYS ? 'warn' : 'ok';
                        return (
                          <tr key={c.id}>
                            <td>
                              <div className="ac-semi ac-text-1 ac-pp-cell-cert">{c.name}</div>
                            </td>
                            <td className="ac-xs ac-text-2 ac-pp-cell-cert">{c.issuer}</td>
                            <td className="ac-td-center">
                              <span className="ac-tag ac-tag--sm ac-tag--outline">{c.level}</span>
                            </td>
                            <td className="ac-td-num ac-xs">{c.validUntil}</td>
                            <td className={`ac-td-num ${left <= CERT_WARN_DAYS ? 'ac-warn-text ac-bold' : ''}`}>
                              {left < 0 ? `逾期 ${-left}` : left}
                            </td>
                            <td className="ac-td-center">
                              <span className={`ac-tag ac-tag--sm ac-tag--${tone}`}>
                                {left < 0 ? '已过期' : left <= CERT_WARN_DAYS ? '临期' : '有效'}
                              </span>
                            </td>
                            <td>
                              <span className="ac-avatar-group">
                                {c.holderIds.map((uid) => (
                                  <span key={uid} className={`ac-avatar ac-avatar--sm ${AVATAR_TONE[USER_MAP[uid]?.avatarColor ?? 'neutral']}`} title={`${USER_MAP[uid]?.name} · ${USER_MAP[uid]?.title}`}>
                                    {USER_MAP[uid]?.initial}
                                  </span>
                                ))}
                              </span>
                              <span className="ac-xs ac-muted ac-ml-1">{c.holderIds.length} 人</span>
                            </td>
                            <td>
                              <span className="ac-row ac-gap-1 ac-wrap">
                                {c.relatedSkillIds.map((id) => (
                                  <span key={id} className="ac-tag ac-tag--sm ac-tag--outline">
                                    {SKILLS.find((s) => s.id === id)?.name ?? id}
                                  </span>
                                ))}
                              </span>
                            </td>
                            <td className="ac-td-num ac-mono ac-xs ac-muted">{c.id}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Info size={14} />
                <span>
                  当前 {CERTIFICATIONS.length} 张证书均在有效期内，最早到期的是{' '}
                  {[...CERTIFICATIONS].sort((a, b) => dayIdx(a.validUntil) - dayIdx(b.validUntil))[0].name}（
                  {[...CERTIFICATIONS].sort((a, b) => dayIdx(a.validUntil) - dayIdx(b.validUntil))[0].validUntil}，剩余{' '}
                  {daysFromToday([...CERTIFICATIONS].sort((a, b) => dayIdx(a.validUntil) - dayIdx(b.validUntil))[0].validUntil)} 天），
                  距 {CERT_WARN_DAYS} 天的临期阈值尚有缓冲，故本表暂无 warn / danger 标记；
                  证书与技能矩阵的 certified 标记双向对账，证书失效会自动回退对应格子。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-grid-3-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <GraduationCap size={16} />
                  个人成长计划（{allProfiles.length}）
                </span>
                <span className="ac-card-subtitle">MemberProfileDef.growthPlan：目标 / 行动项 / 复盘时间</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">
                    最近复盘 {allProfiles.map((p) => p.growthPlan.reviewAt).sort()[0]}
                  </span>
                </div>
              </div>
              <div className="ac-card-body ac-pp-growth-grid">
                {allProfiles.map((p) => {
                  const u = userMap[p.userId];
                  const reviewLeft = daysFromToday(p.growthPlan.reviewAt);
                  return (
                    <div className={`ac-pp-growth-card ${u?.isAi ? 'ac-pp-growth-card--ai' : ''}`} key={p.userId}>
                      <div className="ac-pp-growth-head">
                        <PersonCell userId={p.userId} size="xs" showTitle={false} user={u} />
                        {isNewMember(p.userId) ? (
                          <span className="ac-tag ac-tag--sm ac-tag--ai">新建 · 待同步</span>
                        ) : null}
                        <span className="ac-tag ac-tag--sm ac-tag--outline">{p.seniority}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${reviewLeft <= 60 ? 'warn' : 'neutral'} ac-ml-auto`}>
                          <CalendarClock size={10} />
                          复盘 {p.growthPlan.reviewAt}（{reviewLeft} 天）
                        </span>
                      </div>
                      <div className="ac-pp-growth-goal">
                        <Target size={12} />
                        {p.growthPlan.goal}
                      </div>
                      <ul className="ac-pp-list ac-pp-list--sm">
                        {p.growthPlan.actions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                      <div className="ac-pp-growth-foot">
                        <span className="ac-xs ac-muted">
                          <Medal size={10} className="ac-pp-inline-icon" />
                          认证 {p.certifications.length}
                        </span>
                        <span className="ac-xs ac-muted">
                          <AlertTriangle size={10} className="ac-pp-inline-icon" />
                          逃逸 {p.defectEscapeCount30d}
                        </span>
                        <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto" onClick={() => setDrawer({ kind: 'member', profile: p })}>
                          档案
                          <ChevronRight size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ac-card" data-annotation-id="ai-sdlc-people-growth-radar">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Radar size={16} />
                  团队能力雷达
                </span>
                <span className="ac-card-subtitle">
                  按 SKILLS.category 六大类聚合团队平均熟练度；目标值由 demandLevel 映射（关键 4.2 / 高 3.6 / 中 3.0）
                </span>
              </div>
              <div className="ac-card-body">
                <CategoryRadar data={radarData} />
                <div className="ac-pp-legend ac-mt-2">
                  <span className="ac-legend-item">
                    <span className="ac-legend-swatch" style={{ background: TONE_HEX.brand }} />
                    当前团队平均
                  </span>
                  <span className="ac-legend-item">
                    <span className="ac-legend-swatch" style={{ background: TONE_HEX.ai }} />
                    目标水位
                  </span>
                </div>
                <div className="ac-table-wrap ac-mt-3">
                  <table className="ac-table ac-table--sm">
                    <thead>
                      <tr>
                        <th>能力类别</th>
                        <th className="ac-td-right">技能数</th>
                        <th className="ac-td-right">当前</th>
                        <th className="ac-td-right">目标</th>
                        <th className="ac-td-right">缺口</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...radarData]
                        .sort((a, b) => b.target - b.current - (a.target - a.current))
                        .map((d) => {
                          const gap = d.target - d.current;
                          return (
                            <tr key={d.category}>
                              <td className="ac-semi ac-text-1">{d.category}</td>
                              <td className="ac-td-num">{SKILLS.filter((s) => s.category === d.category).length}</td>
                              <td className="ac-td-num">{fmt(d.current, 2)}</td>
                              <td className="ac-td-num ac-muted">{fmt(d.target, 2)}</td>
                              <td className={`ac-td-num ac-bold ${gap > 1.2 ? 'ac-danger-text' : gap > 0.7 ? 'ac-warn-text' : 'ac-ok-text'}`}>
                                {gap > 0 ? `-${fmt(gap, 2)}` : `+${fmt(-gap, 2)}`}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="ac-hint ac-hint--warn ac-mt-3">
                  <AlertTriangle size={14} />
                  <span>
                    缺口最大的是「{[...radarData].sort((a, b) => b.target - b.current - (a.target - a.current))[0].category}」
                    （当前 {fmt([...radarData].sort((a, b) => b.target - b.current - (a.target - a.current))[0].current, 2)} / 目标{' '}
                    {fmt([...radarData].sort((a, b) => b.target - b.current - (a.target - a.current))[0].target, 2)}），
                    唯一达标的是「AI 协作」——这是平台强推 AI 结对的直接结果，但也意味着其余五类能力正在被 AI 辅助率掩盖，
                    一旦 AI 建议被驳回就会出现无人可接手的空洞（见技能矩阵的 level ≤ 2 且辅助率 &gt; 85% 组合）。
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-section-title">AI 成长建议</div>
          <div className="ac-card ac-pp-ai-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Sparkles size={16} />
                逐人成长建议（{growthAdvice.length} 条）
              </span>
              <span className="ac-card-subtitle">
                结合技能矩阵缺口 + 认证有效期 + 近 30 日缺陷逃逸 + 负载率 + AI 采纳率派生，每人 1~2 条
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">
                  <Sparkles size={12} />
                  覆盖 {Array.from(new Set(growthAdvice.map((g) => g.userId))).length} 人
                </span>
                <span className="ac-tag ac-tag--outline">
                  已采纳 {Object.values(growthVotes).filter((v) => v === 'accepted').length}
                </span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-pp-growth-advice">
                {allProfiles.map((p) => {
                  const items = growthAdvice.filter((g) => g.userId === p.userId);
                  if (!items.length) return null;
                  return (
                    <div className="ac-pp-advice-group" key={p.userId}>
                      <div className="ac-pp-advice-who">
                        <PersonCell userId={p.userId} size="xs" user={userMap[p.userId]} />
                        <span className="ac-tag ac-tag--sm ac-tag--outline">{p.seniority}</span>
                        <span className="ac-xs ac-muted">{cut(p.growthPlan.goal, 30)}</span>
                      </div>
                      <div className="ac-pp-advice-items">
                        {items.map((g) => (
                          <div className={`ac-pp-insight ac-pp-insight--${g.level}`} key={g.id}>
                            <div className="ac-pp-insight-head">
                              <span className="ac-pp-insight-icon">
                                {g.level === 'danger' ? <AlertTriangle size={14} /> : g.level === 'warn' ? <Zap size={14} /> : <Info size={14} />}
                              </span>
                              <span className="ac-pp-insight-title">{g.title}</span>
                              <span className="ac-ml-auto">
                                <AiVoteBar state={growthVotes[g.id]} onVote={(v) => vote(setGrowthVotes, g.id, v)} />
                              </span>
                            </div>
                            <div className="ac-pp-signals">
                              {g.signals.map((s) => (
                                <span className="ac-pp-signal" key={`${g.id}-${s.source}`}>
                                  <span className="ac-pp-signal-source ac-mono">{s.source}</span>
                                  <span className="ac-pp-signal-value">{s.value}</span>
                                </span>
                              ))}
                            </div>
                            <div className="ac-pp-action">
                              <ArrowRight size={12} />
                              建议动作：{g.action}
                            </div>
                            {growthVotes[g.id] === 'accepted' ? (
                              <div className="ac-xs ac-ok-text ac-mt-2">
                                <CheckCircle2 size={11} className="ac-pp-inline-icon" />
                                已追加到 {userMap[p.userId]?.name} 的 growthPlan.actions，复盘时间 {p.growthPlan.reviewAt}。
                              </div>
                            ) : growthVotes[g.id] === 'rejected' ? (
                              <div className="ac-xs ac-muted ac-mt-2">
                                <XCircle size={11} className="ac-pp-inline-icon" />
                                已驳回：成长计划保持原样，本条不进入复盘清单。
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="ac-hint ac-hint--ai ac-mt-3">
                <Sparkles size={14} />
                <span>
                  AI 做了什么：交叉读取技能矩阵（level / aiAssistRatePct）、认证有效期、近 30 日缺陷逃逸、负载率与 AI 采纳率，
                  为每位成员挑出最紧迫的 1~2 项短板并给出可执行动作；
                  依据是什么：每条建议都标注了来源字段与具体数值，可直接回溯到 MEMBER_PROFILES / SKILL_MATRIX / CERTIFICATIONS；
                  人工如何介入：采纳后追加到该成员的 growthPlan.actions 并在复盘会上跟踪，驳回则不改变任何原始数据。
                  AI 共享账号同样有一份「成长计划」，其目标是把编码环节采纳率从 79.6% 提升到 85% 并把千行缺陷逃逸压到 0.3 以下。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---------- 抽屉 ---------- */}
      <Drawer
        open={drawer !== null}
        title={drawer?.kind === 'member' ? '成员档案' : drawer?.kind === 'cell' ? '技能矩阵单元格' : drawer?.kind === 'workload' ? '迭代负载明细' : ''}
        subtitle={
          drawer?.kind === 'member'
            ? `${drawer.profile.employeeNo} · ${userMap[drawer.profile.userId]?.title}`
            : drawer?.kind === 'cell'
              ? `${USER_MAP[drawer.cell.userId]?.name} × ${SKILLS.find((s) => s.id === drawer.cell.skillId)?.name}`
              : drawer?.kind === 'workload'
                ? `${USER_MAP[drawer.wl.userId]?.name} · ${CURRENT_SPRINT.name} · 负载 ${fmt(drawer.wl.loadPct)}%`
                : undefined
        }
        width={700}
        onClose={() => setDrawer(null)}
        footer={
          drawer ? (
            <div className="ac-row ac-gap-2">
              <span className="ac-xs ac-muted">
                {drawer.kind === 'member'
                  ? `${teamNamesOf(drawer.profile)} · 月成本 ${fmt(drawer.profile.monthlyCostWan)} 万元`
                  : drawer.kind === 'cell'
                    ? `level ${drawer.cell.level} · ${LEVEL_LABEL[drawer.cell.level]}`
                    : `${drawer.wl.taskIds.length} 个关联工作项 · AI 分担 ${drawer.wl.aiOffloadPoints} 点`}
              </span>
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm ac-ml-auto" onClick={() => setDrawer(null)}>
                关闭
              </button>
            </div>
          ) : undefined
        }
      >
        {drawer?.kind === 'member' ? <MemberDrawerBody profile={drawer.profile} userMap={userMap} /> : null}
        {drawer?.kind === 'cell' ? <CellDrawerBody cell={drawer.cell} /> : null}
        {drawer?.kind === 'workload' ? <WorkloadDrawerBody wl={drawer.wl} /> : null}
      </Drawer>

      {/* ---------- 弹窗：工作项详情 ---------- */}
      <Modal
        open={taskModal !== null}
        title="关联工作项"
        subtitle={taskModal ? `${taskModal.id} · ${taskModal.code}` : undefined}
        width={620}
        onClose={() => setTaskModalId(null)}
        footer={
          <div className="ac-row ac-gap-2 ac-justify-end">
            <span className="ac-xs ac-muted">
              {taskModal ? `所属迭代 ${taskModal.sprintId} · 更新于 ${taskModal.updatedAt}` : ''}
            </span>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setTaskModalId(null)}>
              关闭
            </button>
          </div>
        }
      >
        {taskModal ? (
          <>
            <div className="ac-semi ac-text-1 ac-lg ac-mb-3">{taskModal.title}</div>
            <dl className="ac-kv ac-mb-4">
              <dt>状态</dt>
              <dd>
                <span className="ac-tag ac-tag--sm ac-tag--brand">{taskModal.stateLabel}</span>
                <span className="ac-xs ac-muted ac-ml-1">
                  {taskModal.type} · {taskModal.priority}
                </span>
              </dd>
              <dt>负责人 / 评审</dt>
              <dd>
                {USER_MAP[taskModal.ownerId]?.name} / {USER_MAP[taskModal.reviewerId]?.name}
              </dd>
              <dt>故事点 / 工时</dt>
              <dd className="ac-tnum">
                {taskModal.points} 点 · 预估 {taskModal.estimateHours}h / 实际 {taskModal.actualHours}h
              </dd>
              <dt>进度 / 覆盖率</dt>
              <dd>
                <div className="ac-progress-row">
                  <div className="ac-progress ac-progress--sm ac-pp-inline-progress">
                    <div className="ac-progress-bar" style={{ width: `${taskModal.progress}%` }} />
                  </div>
                  <span className="ac-progress-label">{taskModal.progress}%</span>
                  <span className="ac-xs ac-muted">单测覆盖率 {taskModal.coverage}%</span>
                </div>
              </dd>
              <dt>AI 占比</dt>
              <dd className="ac-tnum">
                {taskModal.aiRatio}% · 执行主体{' '}
                {taskModal.executor === 'ai' ? 'AI 智能体' : taskModal.executor === 'human' ? '人工' : '人机协同'}
              </dd>
              <dt>起止日期</dt>
              <dd className="ac-mono">
                {taskModal.startDate} ~ {taskModal.endDate}
              </dd>
              <dt>关键路径</dt>
              <dd>
                {taskModal.critical ? (
                  <span className="ac-tag ac-tag--sm ac-tag--danger">
                    <AlertTriangle size={10} />
                    位于关键路径
                  </span>
                ) : (
                  <span className="ac-tag ac-tag--sm ac-tag--outline">非关键路径</span>
                )}
              </dd>
              <dt>关联需求</dt>
              <dd className="ac-mono">{taskModal.reqId || '—（发布执行类工作项）'}</dd>
            </dl>

            <div className="ac-section-title">说明</div>
            <p className="ac-pp-para">{taskModal.desc}</p>

            {taskModal.blockedReason ? (
              <div className="ac-hint ac-hint--danger ac-mt-3">
                <AlertTriangle size={14} />
                <span>{taskModal.blockedReason}</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="ac-empty ac-empty--sm">
            <div className="ac-empty-icon">
              <ListChecks size={20} />
            </div>
            <div className="ac-empty-title">工作项不在本原型数据集内</div>
            <div className="ac-empty-desc">该编号未出现在 TASKS（TASK-2401 ~ TASK-2424）中。</div>
          </div>
        )}
      </Modal>

      {/* ---------- 弹窗：录入成员（本地草稿态，不回写数据模块） ---------- */}
      <Modal
        open={createOpen}
        title="录入成员"
        subtitle="提交后仅计入本页 useState 与名册汇总，不回写 data.ts / data-mgmt.ts，待 HR 系统与 PingCode 同步后转正"
        width={780}
        onClose={closeCreate}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={aiFill}>
              <Sparkles size={13} />
              AI 生成档案初稿
            </button>
            <span className="ac-xs ac-muted">
              {extraProfiles.length ? `本次会话已录入 ${extraProfiles.length} 人` : '带 * 为必填项'}
            </span>
            <span className="ac-row ac-gap-2 ac-ml-auto">
              <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={closeCreate}>
                取消
              </button>
              <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={submitCreate}>
                <CheckCircle2 size={13} />
                确认录入
              </button>
            </span>
          </div>
        }
      >
        {errorCount ? (
          <div className="ac-hint ac-hint--danger ac-mb-3">
            <AlertTriangle size={14} />
            <span>
              还有 {errorCount} 处待修正：{Object.values(errors).join('；')}
            </span>
          </div>
        ) : null}

        <FormGrid cols={2}>
          <FormGroupTitle title="账号信息" note="写入 UserDef：头像、姓名、域账号与平台角色" />
          <TextField
            label="姓名"
            required
            value={form.name}
            onChange={onNameChange}
            error={errors.name}
            placeholder="如：许衔舟"
            maxLength={12}
          />
          <TextField
            label="头像文字"
            value={form.initial}
            onChange={(v) => patchForm({ initial: v })}
            maxLength={2}
            hint="头像文字，默认取姓名首字"
            placeholder="许"
          />
          <TextField
            label="域账号"
            required
            mono
            value={form.account}
            onChange={(v) => patchForm({ account: v })}
            error={errors.account}
            hint="域账号，全局唯一"
            placeholder="如：xu.xianzhou"
          />
          <TextField
            label="企业邮箱"
            type="email"
            value={form.email}
            onChange={(v) => patchForm({ email: v })}
            error={errors.email}
            hint={`留空则自动取 {account}@${EMAIL_DOMAIN}`}
            placeholder={`xu.xianzhou@${EMAIL_DOMAIN}`}
          />
          <TextField
            label="岗位名称"
            required
            value={form.title}
            onChange={(v) => patchForm({ title: v })}
            error={errors.title}
            placeholder="如：高级后端工程师"
          />
          <SelectField
            label="所属部门"
            value={form.dept}
            onChange={(v) => patchForm({ dept: v })}
            options={deptOptions}
            placeholder="留空则取所选团队既有成员的部门"
            hint="USERS.dept 去重枚举"
          />
          <SelectField
            label="平台角色"
            required
            value={form.roleId}
            onChange={(v) => patchForm({ roleId: v })}
            options={roleOptions}
            placeholder="请选择平台角色"
            error={errors.roleId}
            hint="ROLES：决定头像色（color）与登录后的页面视角"
          />

          <FormGroupTitle title="人事属性" note="写入 MemberProfileDef：来自 HR 系统，与 PingCode 账号绑定" />
          <TextField
            label="工号"
            required
            mono
            value={form.employeeNo}
            onChange={(v) => patchForm({ employeeNo: v })}
            error={errors.employeeNo}
            hint="工号，全局唯一"
            placeholder="如：AT-2026-0917"
          />
          <SelectField
            label="职级"
            required
            value={form.seniority}
            onChange={(v) => patchForm({ seniority: v })}
            options={seniorityOptions}
            placeholder="请选择职级"
            error={errors.seniority}
          />
          <SelectField
            label="用工形式"
            required
            value={form.employmentType}
            onChange={(v) => patchForm({ employmentType: v })}
            options={employmentOptions}
            error={errors.employmentType}
            hint="选「AI 账号」时标记 isAi，不计入真人产能"
          />
          <TextField
            label="入职日期"
            required
            type="date"
            mono
            value={form.joinDate}
            onChange={(v) => patchForm({ joinDate: v })}
            error={errors.joinDate}
            hint={`不得晚于今日 ${TODAY}`}
          />
          <SelectField
            label="直接汇报对象"
            value={form.directReportTo}
            onChange={(v) => patchForm({ directReportTo: v })}
            options={managerOptions}
            placeholder="无平台内汇报对象"
            hint="directReportTo；留空记为 null（如向集团 CTO 汇报）"
          />
          <TextField
            label="办公地点"
            value={form.location}
            onChange={(v) => patchForm({ location: v })}
            placeholder="上海 · 张江研发中心 A 座 12F"
            hint="留空则按所选团队既有成员的聚集地推导"
          />
          <MultiPickField
            label="所属团队"
            required
            value={form.teamIds}
            onChange={(v) => patchForm({ teamIds: v })}
            options={createTeamOptions}
            error={errors.teamIds}
            hint={`已选 ${form.teamIds.length} 个；至少 1 个（TEAMS 共 ${TEAMS.length} 个一级团队）`}
          />

          <FormGroupTitle title="产能与成本" note="sprintCapacity 同值写入 UserDef.capacity" />
          <NumberField
            label="月度综合成本"
            required
            value={form.monthlyCostWan}
            onChange={(v) => patchForm({ monthlyCostWan: v })}
            min={0.1}
            max={100}
            step={0.1}
            unit="万元/月"
            error={errors.monthlyCostWan}
            hint="AI 账号填算力折算成本"
          />
          <NumberField
            label="本迭代产能"
            required
            value={form.sprintCapacity}
            onChange={(v) => patchForm({ sprintCapacity: v })}
            min={1}
            max={30}
            step={1}
            unit="故事点"
            error={errors.sprintCapacity}
            hint="本迭代产能上限，等于 UserDef.capacity"
          />
          <MultiPickField
            label="技能标签"
            full
            value={form.skills}
            onChange={(v) => patchForm({ skills: v })}
            options={skillOptions}
            max={6}
            hint={`已选 ${form.skills.length} / 6，写入 UserDef.skills；不入 SKILL_MATRIX，待首次技能实操复核后补录等级`}
          />
          <TextareaField
            label="本期成长目标"
            full
            rows={2}
            value={form.growthGoal}
            onChange={(v) => patchForm({ growthGoal: v })}
            hint="本期成长目标；AI 可据此生成 3 条行动项"
            placeholder="如：在订单域完成分库分表迁移的独立交付，并补齐幂等设计的实操证据"
          />
        </FormGrid>

        {aiDraft ? (
          <div className="ac-hint ac-hint--ai ac-mt-3">
            <Sparkles size={14} />
            <span>{aiDraft}</span>
          </div>
        ) : null}

        <div className="ac-hint ac-mt-3">
          <Info size={14} />
          <span>
            提交后生成的 userId 为 u-new-N，仅存在于本页 useState：会计入成员名册、结构分布与成本 / 产能汇总，
            并在名册与成长计划中标记「新建 · 待同步」；WORKLOADS / SKILL_MATRIX / AI_COLLAB_PREFS / CERTIFICATIONS
            是独立数据集，需等首次迭代排期、技能复核与协作偏好采集后才会出现该成员的记录。
          </span>
        </div>
      </Modal>
    </div>
  );
}
