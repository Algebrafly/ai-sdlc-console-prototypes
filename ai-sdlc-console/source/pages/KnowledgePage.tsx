/**
 * 企业知识库（pageId: knowledge）
 *
 * 核心价值主张：研发流程各阶段的输出产物（PRD、架构视图、接口契约、任务清单、代码 MR 与评审记录、
 * 测试报告、根因分析、发布记录、回滚预案等）**自动归档**入企业知识库，经「采集 → 解析/OCR →
 * 结构化抽取 → 层级切片 → 向量化 → 图谱构建 → 索引与评测」7 步入库流水线加工后，
 * 供 7 个 SDLC Agent 检索消费，从而降低幻觉、贴近团队规范。能力对标 **WeKnora**（腾讯开源 RAG 框架）。
 *
 * 标签页：
 *  1. overview    总览 —— 资产规模 / 阶段覆盖率 / 检索质量 / 成本 / WeKnora 引擎与 8 项能力 / 保鲜告警
 *  2. artifacts   阶段产物归档 —— 18 项产物归档流水线图 + 映射表 + 8 条归档规则 + 7 步入库 + 8 次执行
 *  3. assets      空间与文档 —— 6 个知识空间卡片 + 20 篇文档 17 列表 + 空间分布图 + RAG 衔接说明
 *  4. graph       知识图谱 —— 18 节点 26 边手绘 SVG 力导向图 + 节点/边详情面板 + degree 排行
 *  5. retrieval   检索与评测 —— 检索测试台 + 14 条检索日志 16 列表 + 质量散点 + 3 个评测集趋势
 *  6. governance  治理与消费 —— 7 个 Agent 消费统计 + 幻觉率对比 + 6 条治理策略 + 分级访问热力 + 冲突仲裁
 */
import React, { Fragment, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Gauge,
  HardDrive,
  Layers,
  Link2,
  ListChecks,
  Lock,
  Network,
  Play,
  RefreshCw,
  Scale,
  ScanLine,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Table2,
  Target,
  Timer,
  Waypoints,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  KB_ARCHIVE_RULES,
  KB_CHUNKS,
  KB_CONSUME_STATS,
  KB_DOCS,
  KB_ENGINE,
  KB_EVAL_SETS,
  KB_GOVERNANCE,
  KB_GRAPH_EDGES,
  KB_GRAPH_NODES,
  KB_INGEST_RUNS,
  KB_INGEST_STEPS,
  KB_RETRIEVAL_LOGS,
  KB_SPACES,
  KB_STAGE_ARTIFACT_MAP,
  WEKNORA_CAPABILITIES,
  kbStats,
} from '../data-kb';
import type {
  KbAccessLevel,
  KbArchiveRuleDef,
  KbDocDef,
  KbGraphEdgeDef,
  KbGraphNodeDef,
  KbIngestRunDef,
  KbRetrievalLogDef,
  KbStageArtifactDef,
} from '../data-kb';
import {
  ARCH_COMPONENT_MAP,
  ARCH_LAYERS,
  SDLC_STAGES,
  USER_MAP,
  agents,
  auditLogs,
  egressPolicy,
  ragEntries,
  redactRules,
} from '../data';
import type { Tone } from '../data';
import './knowledge.css';

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

/** 语义色 → 头像色类 */
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

type TabId = 'overview' | 'artifacts' | 'assets' | 'graph' | 'retrieval' | 'governance';

const TABS: { id: TabId; name: string; icon: typeof Cpu }[] = [
  { id: 'overview', name: '总览', icon: Gauge },
  { id: 'artifacts', name: '阶段产物归档', icon: Archive },
  { id: 'assets', name: '空间与文档', icon: BookOpen },
  { id: 'graph', name: '知识图谱', icon: Network },
  { id: 'retrieval', name: '检索与评测', icon: Search },
  { id: 'governance', name: '治理与消费', icon: ShieldCheck },
];

const ACCESS_META: Record<KbAccessLevel, { label: string; tone: string }> = {
  public: { label: '公开', tone: 'ok' },
  internal: { label: '内部', tone: 'info' },
  restricted: { label: '受限', tone: 'warn' },
  confidential: { label: '机密', tone: 'danger' },
};

const ACCESS_ORDER: KbAccessLevel[] = ['public', 'internal', 'restricted', 'confidential'];

const EMBED_META: Record<KbDocDef['embedStatus'], { label: string; tone: string }> = {
  ready: { label: '已就绪', tone: 'ok' },
  indexing: { label: '索引中', tone: 'info' },
  failed: { label: '失败', tone: 'danger' },
  stale: { label: '待更新', tone: 'warn' },
};

const PARSE_META: Record<KbDocDef['parseStatus'], { label: string; tone: string }> = {
  parsed: { label: '已解析', tone: 'ok' },
  parsing: { label: '解析中', tone: 'info' },
  'ocr-pending': { label: '待 OCR', tone: 'warn' },
  failed: { label: '解析失败', tone: 'danger' },
};

const RULE_ACTION_META: Record<KbArchiveRuleDef['action'], { label: string; tone: string }> = {
  archive: { label: '仅归档', tone: 'info' },
  'archive-and-index': { label: '归档并建索引', tone: 'ok' },
  skip: { label: '跳过不入库', tone: 'neutral' },
  'redact-then-archive': { label: '脱敏后归档', tone: 'warn' },
};

const DEDUP_META: Record<KbArchiveRuleDef['dedupStrategy'], string> = {
  'content-hash': '内容哈希去重',
  'semantic-similarity': '语义相似度去重',
  'version-supersede': '版本取代',
};

const CHUNK_STRATEGY_META: Record<string, { label: string; note: string }> = {
  heading: { label: '标题层级切片', note: '按标题树切分并保留 headingPath 上下文' },
  semantic: { label: '语义切片', note: '按语义边界切分，适合规范与叙述性文档' },
  fixed: { label: '定长切片', note: 'fixed(512) 定长切分，作为降级兜底策略' },
  'table-row': { label: '表格行组切片', note: '按行组切分，避免跨行切断表格语义' },
  'code-block': { label: '代码块切片', note: '按语法块切分，不跨函数边界' },
};

const VERSION_POLICY_META: Record<string, string> = {
  latest: '仅保留最新版',
  'all-versions': '保留全部版本',
  'baseline-only': '仅保留基线版',
};

const INGEST_ENGINE_META: Record<string, { label: string; tone: string }> = {
  weknora: { label: 'WeKnora 引擎', tone: 'ai' },
  platform: { label: '平台自有', tone: 'info' },
  'ai-agent': { label: 'AI Agent', tone: 'brand' },
};

const INGEST_STATUS_META: Record<KbIngestRunDef['status'], { label: string; tone: string }> = {
  success: { label: '成功', tone: 'ok' },
  partial: { label: '部分成功', tone: 'warn' },
  running: { label: '执行中', tone: 'info' },
  failed: { label: '失败', tone: 'danger' },
  queued: { label: '排队中', tone: 'neutral' },
};

const STEP_RUN_META: Record<string, { label: string; tone: string; node: string }> = {
  done: { label: '完成', tone: 'ok', node: 'ok' },
  running: { label: '执行中', tone: 'info', node: 'running' },
  pending: { label: '待执行', tone: 'neutral', node: 'pending' },
  failed: { label: '失败', tone: 'danger', node: 'failed' },
  skipped: { label: '已跳过', tone: 'warn', node: 'pending' },
};

const NODE_TYPE_META: Record<string, { tone: Tone; shape: string }> = {
  限界上下文: { tone: 'brand', shape: 'circle' },
  领域概念: { tone: 'ai', shape: 'hexagon' },
  技术组件: { tone: 'slate', shape: 'rect' },
  接口: { tone: 'info', shape: 'round' },
  数据表: { tone: 'teal', shape: 'table' },
  中间件: { tone: 'slate', shape: 'dash' },
  服务: { tone: 'neutral', shape: 'pill' },
  规范: { tone: 'indigo', shape: 'spec' },
  缺陷模式: { tone: 'danger', shape: 'triangle' },
  人员: { tone: 'pink', shape: 'circle' },
  文档: { tone: 'amber', shape: 'doc' },
};

/** 关系 → 颜色 / 线型 / ascii key（用于 SVG marker id） */
const RELATION_META: Record<string, { hex: string; dash: string; key: string }> = {
  依赖: { hex: TONE_HEX.brand, dash: '', key: 'dep' },
  包含: { hex: TONE_HEX.ai, dash: '', key: 'inc' },
  实现: { hex: TONE_HEX.info, dash: '', key: 'imp' },
  调用: { hex: TONE_HEX.teal, dash: '5 3', key: 'call' },
  约束: { hex: TONE_HEX.warn, dash: '', key: 'con' },
  派生自: { hex: TONE_HEX.indigo, dash: '5 3', key: 'der' },
  验证: { hex: TONE_HEX.ok, dash: '', key: 'ver' },
  导致: { hex: TONE_HEX.danger, dash: '', key: 'cau' },
  归属于: { hex: TONE_HEX.pink, dash: '3 3', key: 'bel' },
  替代: { hex: TONE_HEX.slate, dash: '5 3', key: 'rep' },
};

const QUERY_TYPE_META: Record<KbRetrievalLogDef['queryType'], { label: string; tone: string }> = {
  semantic: { label: '语义检索', tone: 'ai' },
  keyword: { label: '关键词检索', tone: 'info' },
  hybrid: { label: '混合检索', tone: 'brand' },
  graph: { label: '图谱检索', tone: 'warn' },
};

const CALLER_TYPE_META: Record<KbRetrievalLogDef['callerType'], { label: string; tone: string }> = {
  agent: { label: 'Agent', tone: 'ai' },
  human: { label: '人工', tone: 'info' },
  api: { label: '开放 API', tone: 'neutral' },
};

const FEEDBACK_META: Record<string, { label: string; tone: string }> = {
  helpful: { label: '有帮助', tone: 'ok' },
  partial: { label: '部分有用', tone: 'warn' },
  irrelevant: { label: '不相关', tone: 'danger' },
  none: { label: '未反馈', tone: 'neutral' },
};

const GOV_SCOPE_META: Record<string, { label: string; tone: string }> = {
  space: { label: '空间级', tone: 'brand' },
  doc: { label: '文档级', tone: 'info' },
  chunk: { label: '切片级', tone: 'ai' },
  query: { label: '查询级', tone: 'warn' },
};

const GOV_ENFORCED_META: Record<string, { label: string; tone: string }> = {
  weknora: { label: 'WeKnora 侧', tone: 'ai' },
  platform: { label: '平台侧', tone: 'info' },
  both: { label: '双侧协同', tone: 'brand' },
};

const GOV_STATUS_META: Record<string, { label: string; tone: string }> = {
  enabled: { label: '强制生效', tone: 'ok' },
  monitor: { label: '监控模式', tone: 'warn' },
  disabled: { label: '已停用', tone: 'neutral' },
};

const AUTOMATION_META: Record<string, { label: string; tone: string }> = {
  full: { label: '全自动', tone: 'ok' },
  assisted: { label: '人机协同', tone: 'ai' },
  manual: { label: '人工', tone: 'neutral' },
};

const EVAL_METRICS: { key: 'recallAt10' | 'mrr' | 'ndcgAt10' | 'faithfulnessPct'; label: string; tone: Tone; pct: boolean }[] = [
  { key: 'recallAt10', label: 'recall@10', tone: 'brand', pct: false },
  { key: 'mrr', label: 'MRR', tone: 'ai', pct: false },
  { key: 'ndcgAt10', label: 'nDCG@10', tone: 'teal', pct: false },
  { key: 'faithfulnessPct', label: '答案忠实度', tone: 'warn', pct: true },
];

/** 图谱多跳推理演示：沿真实边 KGE-06 / KGE-07 / KGE-08 走两跳 */
const GRAPH_HOP_DEMO = {
  question: '幂等键失效会影响哪些下游？',
  hops: [
    { step: 1, text: '图谱检索路命中起点 KG-06「幂等键」（领域概念，layer-domain / ac-idem-guard）', edge: '' },
    { step: 2, text: '沿 KGE-06「约束」跳到 KG-16「创建订单接口 API-01」，置信度 97%，已人工核验（u-zhou）', edge: 'KGE-06' },
    { step: 3, text: '沿 KGE-07「实现」跳到 KG-01「订单上下文」（degree 8，图谱最大枢纽）', edge: 'KGE-07' },
    { step: 4, text: '再由 KG-01 沿 KGE-08「调用」扩展到 KG-09「库存扣减」，沿 KGE-09「依赖」扩展到 KG-03「优惠上下文」', edge: 'KGE-08 / KGE-09' },
  ],
  docs: ['KD-12', 'KD-15', 'KD-13'],
  conclusion:
    '两跳内召回 3 篇文档（PRD v2.3 基线 / 14 份接口契约集 / 用户故事与验收标准集），据此可回答「幂等键失效 → API-01 重复落单 → 库存重复扣减 + 优惠重复核销」的完整影响链，而纯向量路只能召回契约切片、无法给出跨上下文影响面。',
};

/** 知识冲突仲裁演示项（对应 kb-gov-06 与检索日志 KR-12 的真实场景） */
const CONFLICT_CASE = {
  id: 'KC-CONFLICT-01',
  topic: 'outbox 本地消息表的最大重试次数',
  similarity: 0.93,
  detectedFrom: 'KR-12',
  detectedAt: '2026-03-17 20:48',
  options: [
    {
      docId: 'KD-01',
      version: 'v1.8',
      claim: '重试最多 5 次后转死信队列并告警',
      chunkRef: 'KD-01#104',
      from: 'Confluence 架构组基线（2026-01-08 归档）',
      tone: 'brand' as Tone,
    },
    {
      docId: 'KD-14',
      version: 'v2.0',
      claim: '重试最多 3 次后转死信队列并告警',
      chunkRef: 'KD-14#25',
      from: 'G2 架构冻结版四层架构视图（2026-03-13 归档）',
      tone: 'ai' as Tone,
    },
  ],
  impact:
    '两份文档语义相似度 0.93 但结论相左，触发 kb-gov-06 的隔离策略（当前为 monitor 模式，只告警不硬隔离）；' +
    'KR-12 因此被标记 used=false，架构 Agent 放弃本次召回并改为发起澄清工单。',
};

/* ------------------------------------------------------------------ 工具函数 */

function jump(page: string) {
  window.location.hash = `#page=${page}`;
}

function num(v: number) {
  return v.toLocaleString('zh-CN');
}

function ownerName(id: string) {
  if (id === 'ai') return 'AI Agent 自动归档';
  return USER_MAP[id]?.name ?? id;
}

function ownerInitial(id: string) {
  if (id === 'ai') return 'AI';
  return USER_MAP[id]?.initial ?? id.slice(0, 1).toUpperCase();
}

function ownerAvatar(id: string) {
  const tone = USER_MAP[id]?.avatarColor;
  return tone ? AVATAR_TONE[tone] : 'ac-avatar--slate';
}

function agentName(id: string) {
  return agents.find((a) => a.id === id)?.name ?? id;
}

function stageName(id: string) {
  return SDLC_STAGES.find((s) => s.id === id)?.name ?? id;
}

function stageTone(id: string): Tone {
  return SDLC_STAGES.find((s) => s.id === id)?.tone ?? 'neutral';
}

function spaceName(id: string) {
  return KB_SPACES.find((s) => s.id === id)?.name ?? id;
}

function docById(id: string | null) {
  if (!id) return null;
  return KB_DOCS.find((d) => d.id === id) ?? null;
}

function layerName(id: string | null) {
  if (!id) return '—';
  const l = ARCH_LAYERS.find((x) => x.id === id);
  return l ? `${l.code} ${l.name}` : id;
}

/**
 * 切片引用解析：data-kb.ts 有两种写法
 *  · 样本切片 → `KC-xx`，可展开真实 content
 *  · 非样本切片 → `{docId}#{chunkIndex}`（如 KD-15#52），只显示编号与所属文档
 */
type ChunkRef =
  | { kind: 'sample'; ref: string; docId: string; index: number; content: string; headingPath: string[]; tokenCount: number; strategy: string }
  | { kind: 'compound'; ref: string; docId: string; index: number };

function resolveChunkRef(ref: string): ChunkRef {
  const sample = KB_CHUNKS.find((c) => c.id === ref);
  if (sample) {
    return {
      kind: 'sample',
      ref,
      docId: sample.docId,
      index: sample.chunkIndex,
      content: sample.content,
      headingPath: sample.headingPath,
      tokenCount: sample.tokenCount,
      strategy: sample.strategy,
    };
  }
  const at = ref.indexOf('#');
  if (at > 0) {
    return { kind: 'compound', ref, docId: ref.slice(0, at), index: Number(ref.slice(at + 1)) };
  }
  return { kind: 'compound', ref, docId: ref, index: -1 };
}

/** 中文友好的二元组切分，用于检索测试台的相似度匹配 */
function bigrams(s: string): string[] {
  const clean = s.replace(/[\s，。、；：？！“”‘’（）()\[\]{}<>·\-—…,.?!:;'"']/g, '');
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i += 1) out.push(clean.slice(i, i + 2));
  return out;
}

function matchScore(input: string, target: string) {
  const a = new Set(bigrams(input));
  const b = bigrams(target);
  if (a.size === 0 || b.length === 0) return 0;
  let hit = 0;
  b.forEach((g) => {
    if (a.has(g)) hit += 1;
  });
  return hit / b.length;
}

/** Fruchterman-Reingold 确定性力导向布局（初始位置由下标决定，无随机数，每次渲染结果一致） */
function computeGraphLayout(
  nodes: KbGraphNodeDef[],
  edges: KbGraphEdgeDef[],
  width: number,
  height: number,
): { id: string; x: number; y: number }[] {
  const n = nodes.length;
  const idx = new Map<string, number>();
  nodes.forEach((nd, i) => idx.set(nd.id, i));
  const pos = nodes.map((_, i) => {
    const angle = (i / n) * Math.PI * 2 + 0.4;
    const radius = Math.min(width, height) * 0.33;
    return { x: width / 2 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle) };
  });
  const links = edges
    .map((e) => ({ a: idx.get(e.from), b: idx.get(e.to) }))
    .filter((l): l is { a: number; b: number } => l.a !== undefined && l.b !== undefined);
  const ideal = Math.min(width, height) * 0.32;
  const iterations = 320;
  for (let it = 0; it < iterations; it += 1) {
    const cool = 1 - it / iterations;
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (i - j) * 0.5 + 0.5;
          dy = 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const f = (ideal * ideal) / d;
        disp[i].x += (dx / d) * f;
        disp[i].y += (dy / d) * f;
        disp[j].x -= (dx / d) * f;
        disp[j].y -= (dy / d) * f;
      }
    }
    links.forEach(({ a, b }) => {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const f = ((d * d) / ideal) * 0.42;
      disp[a].x -= (dx / d) * f;
      disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f;
      disp[b].y += (dy / d) * f;
    });
    const maxStep = 14 * cool + 0.6;
    for (let i = 0; i < n; i += 1) {
      disp[i].x += (width / 2 - pos[i].x) * 0.035;
      disp[i].y += (height / 2 - pos[i].y) * 0.05;
      const d = Math.max(Math.sqrt(disp[i].x * disp[i].x + disp[i].y * disp[i].y), 0.01);
      pos[i].x += (disp[i].x / d) * Math.min(d, maxStep);
      pos[i].y += (disp[i].y / d) * Math.min(d, maxStep);
    }
  }
  const padX = 78;
  const padTop = 34;
  const padBottom = 44;
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const s = Math.min((width - padX * 2) / Math.max(maxX - minX, 1), (height - padTop - padBottom) / Math.max(maxY - minY, 1));
  const offX = (width - (maxX - minX) * s) / 2;
  const offY = padTop + (height - padTop - padBottom - (maxY - minY) * s) / 2;
  return pos.map((p, i) => ({ id: nodes[i].id, x: offX + (p.x - minX) * s, y: offY + (p.y - minY) * s }));
}

const nodeRadius = (degree: number) => 17 + degree * 2.4;

/* ------------------------------------------------------------------ 手绘 SVG 图表 */

interface DonutItem {
  label: string;
  value: number;
  tone: Tone;
}

/** 通用环形图 */
function DonutChart({
  items,
  size = 176,
  thickness = 24,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  items: DonutItem[];
  size?: number;
  thickness?: number;
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = (size - thickness) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  let cursor = -Math.PI / 2;
  const arcs = items
    .filter((i) => i.value > 0)
    .map((i) => {
      const span = total > 0 ? (i.value / total) * Math.PI * 2 : 0;
      const start = cursor;
      const end = cursor + Math.max(span, 0.0001);
      cursor += span;
      const p1 = { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) };
      const p2 = { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) };
      const large = end - start > Math.PI ? 1 : 0;
      return {
        key: i.label,
        d: `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
        color: TONE_HEX[i.tone] ?? TONE_HEX.brand,
      };
    });
  return (
    <div className="ac-kb-donut-wrap">
      <svg className="ac-kb-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={ariaLabel}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f5" strokeWidth={thickness} />
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={thickness} />
        ))}
        <text className="ac-kb-donut-value" x={cx} y={cy + 2} textAnchor="middle">
          {centerValue}
        </text>
        <text className="ac-kb-donut-label" x={cx} y={cy + 18} textAnchor="middle">
          {centerLabel}
        </text>
      </svg>
      <div className="ac-legend">
        {items.map((i) => (
          <div className="ac-legend-item" key={i.label}>
            <span className="ac-legend-swatch" style={{ background: TONE_HEX[i.tone] }} />
            {i.label}
            <span className="ac-legend-value">
              {i.value}
              {total > 0 ? ` · ${((i.value / total) * 100).toFixed(1)}%` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 阶段归档覆盖率横向堆叠条：应归档 vs 已归档 */
function StageCoverageBars() {
  const rows = kbStats.coverage.byStage;
  const W = 780;
  const labelW = 96;
  const valueW = 118;
  const rowH = 34;
  const H = rows.length * rowH + 8;
  const chartW = W - labelW - valueW;
  const maxExpected = Math.max(...rows.map((r) => r.expectedArtifacts), 1);
  const totalArchived = rows.reduce((s, r) => s + r.archivedArtifacts, 0);
  const totalExpected = rows.reduce((s, r) => s + r.expectedArtifacts, 0);
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`SDLC 六环节产物归档覆盖率横向堆叠条：合计 ${totalArchived} / ${totalExpected} 项已归档`}
    >
      {rows.map((r, i) => {
        const y = i * rowH + 4;
        const unit = chartW / maxExpected;
        return (
          <g key={r.stageId}>
            <text className="ac-kb-svg-name" x={0} y={y + 17}>
              {r.stageName}
            </text>
            <rect x={labelW} y={y + 5} width={chartW} height={17} rx={4} fill="#eceff4" />
            <rect x={labelW} y={y + 5} width={r.archivedArtifacts * unit} height={17} rx={4} fill={TONE_HEX[r.tone] ?? TONE_HEX.ok} />
            {Array.from({ length: r.expectedArtifacts }).map((_, k) => (
              <line
                key={k}
                x1={labelW + (k + 1) * unit}
                y1={y + 5}
                x2={labelW + (k + 1) * unit}
                y2={y + 22}
                stroke="#fff"
                strokeWidth={1.4}
                opacity={k + 1 < r.expectedArtifacts ? 0.85 : 0}
              />
            ))}
            <text className="ac-kb-svg-value" x={labelW + chartW + 8} y={y + 18}>
              {r.archivedArtifacts}/{r.expectedArtifacts} · {r.coveragePct.toFixed(1)}%
            </text>
          </g>
        );
      })}
      <text className="ac-kb-svg-cap" x={labelW} y={H - 1}>
        合计 {totalArchived}/{totalExpected} 项产物已生成本迭代知识文档（覆盖率 {((totalArchived / totalExpected) * 100).toFixed(1)}%），未覆盖 2 项见下方说明
      </text>
    </svg>
  );
}

/** 迷你质量分环（知识空间卡片用） */
function MiniRing({ score, tone }: { score: number; tone: Tone }) {
  const size = 46;
  const r = 18;
  const c = 2 * Math.PI * r;
  const color = TONE_HEX[tone] ?? TONE_HEX.brand;
  return (
    <svg className="ac-kb-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`空间质量分 ${score} 分`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f5" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${((score / 100) * c).toFixed(2)} ${c.toFixed(2)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text className="ac-kb-ring-value" x={size / 2} y={size / 2 + 4} textAnchor="middle">
        {score.toFixed(0)}
      </text>
    </svg>
  );
}

/** 归档流水线总览：6 个 SDLC 环节 × 每环节 3 个产物节点 */
function ArchivePipelineSvg({ onPickDoc }: { onPickDoc: (docId: string) => void }) {
  const colW = 168;
  const gap = 12;
  const padX = 14;
  const W = padX * 2 + SDLC_STAGES.length * colW + (SDLC_STAGES.length - 1) * gap;
  const H = 288;
  const headY = 22;
  const nodeH = 54;
  const nodeGap = 12;
  const firstNodeY = headY + 62;
  return (
    <div className="ac-kb-scroll-x">
      <svg
        className="ac-kb-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="SDLC 六环节 18 项产物的知识库归档流水线总览，节点色标表示是否已生成本迭代知识文档"
      >
        <defs>
          <marker id="ac-kb-pipe-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#98a2b0" />
          </marker>
        </defs>
        {SDLC_STAGES.map((st, si) => {
          const x = padX + si * (colW + gap);
          const items = KB_STAGE_ARTIFACT_MAP.filter((a) => a.stageId === st.id);
          const cov = kbStats.coverage.byStage.find((c) => c.stageId === st.id);
          return (
            <g key={st.id}>
              {si > 0 ? (
                <line x1={x - gap + 2} y1={headY + 22} x2={x - 3} y2={headY + 22} stroke="#98a2b0" strokeWidth={1.6} markerEnd="url(#ac-kb-pipe-arrow)" />
              ) : null}
              <rect x={x} y={headY} width={colW} height={44} rx={9} fill={`${TONE_HEX[st.tone]}1f`} stroke={TONE_HEX[st.tone]} strokeWidth={1.5} />
              <text className="ac-kb-svg-node" x={x + 12} y={headY + 19}>
                {st.code} · {st.name}
              </text>
              <text className="ac-kb-svg-cap" x={x + 12} y={headY + 35}>
                门禁 {st.gateId} · 已归档 {cov?.archivedArtifacts ?? 0}/{cov?.expectedArtifacts ?? items.length}
              </text>
              <line x1={x + colW / 2} y1={headY + 44} x2={x + colW / 2} y2={firstNodeY - 6} stroke="#cfd6e0" strokeWidth={1.3} />
              {items.map((it, ii) => {
                const ny = firstNodeY + ii * (nodeH + nodeGap);
                const done = it.docId !== null;
                const color = done ? TONE_HEX[it.tone] ?? TONE_HEX.ok : TONE_HEX.slate;
                return (
                  <g
                    key={it.id}
                    className="ac-kb-pipe-node"
                    onClick={() => {
                      if (it.docId) onPickDoc(it.docId);
                    }}
                  >
                    <line x1={x + colW / 2} y1={ny - 6} x2={x + colW / 2} y2={ny} stroke="#e2e6ec" strokeWidth={1.2} />
                    <rect
                      x={x}
                      y={ny}
                      width={colW}
                      height={nodeH}
                      rx={8}
                      fill={done ? '#fff' : '#f7f8fa'}
                      stroke={color}
                      strokeWidth={1.4}
                      strokeDasharray={done ? undefined : '4 3'}
                    />
                    <rect x={x} y={ny} width={4} height={nodeH} rx={2} fill={color} />
                    <text className="ac-kb-svg-node" x={x + 12} y={ny + 18}>
                      {it.artifactName.length > 15 ? `${it.artifactName.slice(0, 14)}…` : it.artifactName}
                    </text>
                    <text className="ac-kb-svg-cap" x={x + 12} y={ny + 33}>
                      {it.artifactType} · {it.autoArchive ? '自动归档' : '人工归档'}
                    </text>
                    <text className="ac-kb-svg-mono" x={x + 12} y={ny + 47}>
                      {done ? `${it.docId} · ${it.archiveRuleId}` : `未产出 · ${it.archiveRuleId} 判 skip`}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
        <text className="ac-kb-svg-cap" x={padX} y={H - 8}>
          实线节点＝本迭代已生成知识文档（点击可跳到「空间与文档」并选中该文档）；虚线灰节点＝docId 为 null，本轮尚未产出，原因见 note。
        </text>
      </svg>
    </div>
  );
}

/** 入库耗时构成：7 步 avgDurationSec 堆叠条（合计 188.7s = KB_ENGINE.avgIngestSec） */
function IngestDurationStack() {
  const W = 900;
  const H = 118;
  const barY = 30;
  const barH = 30;
  const total = KB_INGEST_STEPS.reduce((s, x) => s + x.avgDurationSec, 0);
  let cursor = 10;
  const usable = W - 20;
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`7 步入库流水线平均耗时构成堆叠条，合计 ${total.toFixed(1)} 秒`}
    >
      {KB_INGEST_STEPS.map((s) => {
        const w = (s.avgDurationSec / total) * usable;
        const x = cursor;
        cursor += w;
        return (
          <g key={s.id}>
            <rect x={x} y={barY} width={Math.max(w - 1.5, 1.5)} height={barH} rx={3} fill={TONE_HEX[s.tone] ?? TONE_HEX.brand}>
              <title>{`${s.name}：平均 ${s.avgDurationSec}s（占比 ${((s.avgDurationSec / total) * 100).toFixed(1)}%）`}</title>
            </rect>
            {w > 46 ? (
              <text className="ac-kb-svg-seg-light" x={x + w / 2} y={barY + 19} textAnchor="middle">
                {s.avgDurationSec}s
              </text>
            ) : null}
            <text className="ac-kb-svg-cap" x={x + w / 2} y={barY - 6} textAnchor="middle">
              {s.order}. {s.name}
            </text>
            <text className="ac-kb-svg-cap" x={x + w / 2} y={barY + barH + 15} textAnchor="middle">
              {((s.avgDurationSec / total) * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
      <line x1={10} y1={barY + barH + 26} x2={W - 10} y2={barY + barH + 26} stroke="#e2e6ec" />
      <text className="ac-kb-svg-value" x={10} y={H - 6}>
        合计 {total.toFixed(1)} s
      </text>
      <text className="ac-kb-svg-cap" x={W - 10} y={H - 6} textAnchor="end">
        与 KB_ENGINE.avgIngestSec = {KB_ENGINE.avgIngestSec} s 一致（已结束 7 次执行耗时之和 1321 ÷ 7）
      </text>
    </svg>
  );
}

/** 知识空间三维对比：文档数 / 切片数 / 近 30 日命中（各维度独立归一化） */
function SpaceGroupedBars() {
  const W = 860;
  const H = 250;
  const padL = 20;
  const padR = 20;
  const padT = 26;
  const padB = 52;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const slot = chartW / KB_SPACES.length;
  const bw = Math.min(slot * 0.22, 26);
  const series: { key: 'docCount' | 'chunkCount' | 'hitCount30d'; label: string; tone: Tone }[] = [
    { key: 'docCount', label: '文档数', tone: 'brand' },
    { key: 'chunkCount', label: '切片数', tone: 'ai' },
    { key: 'hitCount30d', label: '近 30 日命中', tone: 'teal' },
  ];
  const maxes = {
    docCount: Math.max(...KB_SPACES.map((s) => s.docCount), 1),
    chunkCount: Math.max(...KB_SPACES.map((s) => s.chunkCount), 1),
    hitCount30d: Math.max(...KB_SPACES.map((s) => s.hitCount30d), 1),
  };
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="6 个知识空间的文档数、切片数与近 30 日命中数三维对比（各维度独立归一化）"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padL} y1={padT + chartH - f * chartH} x2={W - padR} y2={padT + chartH - f * chartH} stroke="#eef1f5" />
      ))}
      {KB_SPACES.map((sp, i) => {
        const cx = padL + slot * i + slot / 2;
        return (
          <g key={sp.id}>
            {series.map((se, si) => {
              const v = sp[se.key];
              const h = (v / maxes[se.key]) * chartH;
              const x = cx + (si - 1) * (bw + 3) - bw / 2;
              return (
                <g key={se.key}>
                  <rect x={x} y={padT + chartH - h} width={bw} height={Math.max(h, 1.5)} rx={3} fill={TONE_HEX[se.tone]} opacity={0.88}>
                    <title>{`${sp.name} · ${se.label} ${num(v)}`}</title>
                  </rect>
                  <text className="ac-kb-svg-cap" x={x + bw / 2} y={padT + chartH - h - 4} textAnchor="middle">
                    {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                  </text>
                </g>
              );
            })}
            <text className="ac-kb-svg-axis" x={cx} y={H - 32} textAnchor="middle">
              {sp.name}
            </text>
            <text className="ac-kb-svg-cap" x={cx} y={H - 18} textAnchor="middle">
              {sp.id} · {sp.code}
            </text>
          </g>
        );
      })}
      {series.map((se, si) => (
        <g key={se.key}>
          <rect x={padL + si * 130} y={6} width={11} height={11} rx={3} fill={TONE_HEX[se.tone]} />
          <text className="ac-kb-svg-cap" x={padL + si * 130 + 16} y={15}>
            {se.label}（按各维度最大值归一化）
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 知识图谱：18 节点 26 边 */
function KnowledgeGraphSvg({
  layout,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}: {
  layout: { id: string; x: number; y: number }[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
}) {
  const W = 1040;
  const H = 620;
  const pmap = useMemo(() => new Map(layout.map((p) => [p.id, p])), [layout]);
  const relationKeys = Object.keys(RELATION_META);

  const shapeOf = (node: KbGraphNodeDef, x: number, y: number, r: number) => {
    const meta = NODE_TYPE_META[node.nodeType] ?? { tone: 'neutral' as Tone, shape: 'circle' };
    const fill = `${TONE_HEX[meta.tone]}22`;
    const stroke = TONE_HEX[meta.tone];
    switch (meta.shape) {
      case 'hexagon': {
        const pts = Array.from({ length: 6 })
          .map((_, k) => {
            const a = (Math.PI / 3) * k - Math.PI / 6;
            return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
          })
          .join(' ');
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.8} />;
      }
      case 'triangle': {
        const rr = r * 1.18;
        const pts = `${x},${y - rr} ${x + rr * 0.92},${y + rr * 0.7} ${x - rr * 0.92},${y + rr * 0.7}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.8} />;
      }
      case 'rect':
        return <rect x={x - r} y={y - r * 0.74} width={r * 2} height={r * 1.48} rx={4} fill={fill} stroke={stroke} strokeWidth={1.8} />;
      case 'table':
        return (
          <g>
            <rect x={x - r} y={y - r * 0.74} width={r * 2} height={r * 1.48} rx={3} fill={fill} stroke={stroke} strokeWidth={1.8} />
            <line x1={x - r} y1={y - r * 0.24} x2={x + r} y2={y - r * 0.24} stroke={stroke} strokeWidth={1.1} />
          </g>
        );
      case 'dash':
        return (
          <rect x={x - r} y={y - r * 0.74} width={r * 2} height={r * 1.48} rx={5} fill={fill} stroke={stroke} strokeWidth={1.8} strokeDasharray="5 3" />
        );
      case 'pill':
        return <rect x={x - r * 1.15} y={y - r * 0.62} width={r * 2.3} height={r * 1.24} rx={r * 0.62} fill={fill} stroke={stroke} strokeWidth={1.8} />;
      case 'spec':
        return (
          <g>
            <rect x={x - r} y={y - r * 0.74} width={r * 2} height={r * 1.48} rx={3} fill={fill} stroke={stroke} strokeWidth={1.4} />
            <rect x={x - r} y={y - r * 0.74} width={5} height={r * 1.48} fill={stroke} />
          </g>
        );
      case 'doc': {
        const w = r * 1.7;
        const h = r * 1.5;
        const pts = `${x - w / 2},${y - h / 2} ${x + w / 2 - 9},${y - h / 2} ${x + w / 2},${y - h / 2 + 9} ${x + w / 2},${y + h / 2} ${x - w / 2},${y + h / 2}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.6} />;
      }
      case 'round':
        return <rect x={x - r} y={y - r * 0.7} width={r * 2} height={r * 1.4} rx={r * 0.4} fill={fill} stroke={stroke} strokeWidth={1.8} />;
      default:
        return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={2} />;
    }
  };

  return (
    <div className="ac-kb-scroll-x">
      <svg
        className="ac-kb-svg ac-kb-graph"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="订单域知识图谱：18 个节点、26 条关系边，节点形状与颜色区分实体类型，边颜色与线型区分关系类型"
      >
        <defs>
          {relationKeys.map((k) => (
            <marker
              key={k}
              id={`ac-kb-ar-${RELATION_META[k].key}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={RELATION_META[k].hex} />
            </marker>
          ))}
        </defs>

        {/* 边 */}
        {KB_GRAPH_EDGES.map((e) => {
          const a = pmap.get(e.from);
          const b = pmap.get(e.to);
          if (!a || !b) return null;
          const na = KB_GRAPH_NODES.find((x) => x.id === e.from);
          const nb = KB_GRAPH_NODES.find((x) => x.id === e.to);
          const ra = nodeRadius(na?.degree ?? 1);
          const rb = nodeRadius(nb?.degree ?? 1);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.max(Math.hypot(dx, dy), 0.01);
          const off = 18;
          const cxp = (a.x + b.x) / 2 + (-dy / len) * off;
          const cyp = (a.y + b.y) / 2 + (dx / len) * off;
          const sdx = cxp - a.x;
          const sdy = cyp - a.y;
          const sl = Math.max(Math.hypot(sdx, sdy), 0.01);
          const sx = a.x + (sdx / sl) * (ra + 2);
          const sy = a.y + (sdy / sl) * (ra + 2);
          const tdx = b.x - cxp;
          const tdy = b.y - cyp;
          const tl = Math.max(Math.hypot(tdx, tdy), 0.01);
          const ex = b.x - (tdx / tl) * (rb + 5);
          const ey = b.y - (tdy / tl) * (rb + 5);
          const meta = RELATION_META[e.relation] ?? { hex: TONE_HEX.neutral, dash: '', key: 'dep' };
          const low = e.aiExtracted && e.confidencePct < 90;
          const active = selectedEdgeId === e.id || selectedNodeId === e.from || selectedNodeId === e.to;
          const lx = 0.25 * sx + 0.5 * cxp + 0.25 * ex;
          const ly = 0.25 * sy + 0.5 * cyp + 0.25 * ey;
          return (
            <g key={e.id} className="ac-kb-edge" onClick={() => onSelectEdge(selectedEdgeId === e.id ? null : e.id)}>
              <path
                d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cxp.toFixed(1)} ${cyp.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
                fill="none"
                stroke={meta.hex}
                strokeWidth={active ? 2.4 : 1.4}
                strokeDasharray={low ? '3 3' : meta.dash || undefined}
                opacity={active ? 1 : 0.62}
                markerEnd={`url(#ac-kb-ar-${meta.key})`}
              />
              <path
                d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cxp.toFixed(1)} ${cyp.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
                fill="none"
                stroke="transparent"
                strokeWidth={11}
              />
              <text className="ac-kb-svg-edge-label" x={lx} y={ly} textAnchor="middle" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {e.relation}
              </text>
              {e.verified ? <circle cx={lx} cy={ly + 9} r={2.6} fill={meta.hex} /> : null}
            </g>
          );
        })}

        {/* 节点 */}
        {KB_GRAPH_NODES.map((node) => {
          const p = pmap.get(node.id);
          if (!p) return null;
          const r = nodeRadius(node.degree);
          const active = selectedNodeId === node.id;
          return (
            <g key={node.id} className="ac-kb-node" onClick={() => onSelectNode(active ? null : node.id)}>
              {active ? <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke={TONE_HEX.brand} strokeWidth={2} strokeDasharray="4 3" /> : null}
              {shapeOf(node, p.x, p.y, r)}
              <text className="ac-kb-svg-degree" x={p.x} y={p.y + 4} textAnchor="middle">
                {node.degree}
              </text>
              <text className="ac-kb-svg-label" x={p.x} y={p.y + r + 15} textAnchor="middle" stroke="#fff" strokeWidth={3.4} paintOrder="stroke">
                {node.label}
              </text>
              <text className="ac-kb-svg-cap" x={p.x} y={p.y + r + 28} textAnchor="middle" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {node.id} · {node.nodeType}
                {node.aiExtracted ? '' : ' · 人工'}
              </text>
            </g>
          );
        })}

        {/* 图例 */}
        <g>
          {Object.keys(NODE_TYPE_META)
            .filter((t) => KB_GRAPH_NODES.some((n) => n.nodeType === t))
            .map((t, i) => {
              const meta = NODE_TYPE_META[t];
              const lx = 16 + (i % 4) * 178;
              const ly = H - 34 + Math.floor(i / 4) * 16;
              return (
                <g key={t}>
                  <rect x={lx} y={ly - 8} width={10} height={10} rx={2} fill={`${TONE_HEX[meta.tone]}33`} stroke={TONE_HEX[meta.tone]} strokeWidth={1.2} />
                  <text className="ac-kb-svg-cap" x={lx + 15} y={ly + 1}>
                    {t}
                  </text>
                </g>
              );
            })}
          <text className="ac-kb-svg-cap" x={W - 16} y={H - 30} textAnchor="end">
            虚线边＝AI 抽取且置信度 &lt; 90%；边标签下的实心点＝已人工核验（verified）
          </text>
        </g>
      </svg>
    </div>
  );
}

/** degree 排行条形图 */
function DegreeBars() {
  const rows = [...KB_GRAPH_NODES].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
  const W = 560;
  const labelW = 150;
  const valueW = 78;
  const chartW = W - labelW - valueW;
  const rowH = 22;
  const H = rows.length * rowH + 6;
  const max = Math.max(...rows.map((r) => r.degree), 1);
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`18 个图谱节点按 degree 降序排行，最高为 KG-01 订单上下文 ${rows[0].degree} 条边`}
    >
      {rows.map((r, i) => {
        const y = i * rowH + 3;
        const w = Math.max(3, (r.degree / max) * chartW);
        return (
          <g key={r.id}>
            <text className="ac-kb-svg-name" x={0} y={y + 13}>
              {r.label}
            </text>
            <rect x={labelW} y={y + 3} width={chartW} height={12} rx={3} fill="#eceff4" />
            <rect x={labelW} y={y + 3} width={w} height={12} rx={3} fill={TONE_HEX[r.tone] ?? TONE_HEX.brand} />
            <text className="ac-kb-svg-value" x={W} y={y + 13} textAnchor="end">
              {r.id} · {r.degree}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 检索质量散点：topScore × latencyMs，含阈值线 */
function RetrievalScatter({ logs, onPick }: { logs: KbRetrievalLogDef[]; onPick: (id: string) => void }) {
  const W = 720;
  const H = 268;
  const padL = 46;
  const padR = 18;
  const padT = 18;
  const padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxLat = Math.max(...logs.map((l) => l.latencyMs), 1);
  const minScore = 0.5;
  const maxScore = 1;
  const xOf = (v: number) => padL + (v / maxLat) * chartW;
  const yOf = (v: number) => padT + chartH - ((v - minScore) / (maxScore - minScore)) * chartH;
  const threshold = logs[0]?.scoreThreshold ?? 0.72;
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="14 条检索日志的最高相似度得分与检索时延散点图，含 0.72 阈值线"
    >
      {[0.6, 0.7, 0.8, 0.9, 1].map((v) => (
        <g key={v}>
          <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="#eef1f5" />
          <text className="ac-kb-svg-axis" x={padL - 6} y={yOf(v) + 4} textAnchor="end">
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} className="ac-kb-svg-axis" x={xOf(maxLat * f)} y={H - 22} textAnchor="middle">
          {Math.round(maxLat * f)}ms
        </text>
      ))}
      <line x1={padL} y1={yOf(threshold)} x2={W - padR} y2={yOf(threshold)} stroke={TONE_HEX.danger} strokeDasharray="4 3" strokeWidth={1.2} />
      <text className="ac-kb-svg-cap" x={W - padR} y={yOf(threshold) - 5} textAnchor="end" fill={TONE_HEX.danger}>
        召回阈值 {threshold}
      </text>
      {logs.map((l) => {
        const color = !l.used ? TONE_HEX.slate : l.hallucinationSuppressed ? TONE_HEX.ok : TONE_HEX[l.tone] ?? TONE_HEX.brand;
        return (
          <g key={l.id} className="ac-kb-node" onClick={() => onPick(l.id)}>
            <circle cx={xOf(l.latencyMs)} cy={yOf(l.topScore)} r={6.5} fill={color} opacity={0.85} stroke="#fff" strokeWidth={1.4}>
              <title>{`${l.id} · ${l.query}`}</title>
            </circle>
            <text className="ac-kb-svg-cap" x={xOf(l.latencyMs)} y={yOf(l.topScore) - 10} textAnchor="middle">
              {l.id}
            </text>
          </g>
        );
      })}
      <text className="ac-kb-svg-axis" x={padL} y={12}>
        纵轴 最高相似度得分
      </text>
      <text className="ac-kb-svg-axis" x={W - padR} y={12} textAnchor="end">
        横轴 检索时延
      </text>
    </svg>
  );
}

/** 每个 Agent 的检索次数条形 */
function AgentRetrievalBars() {
  const rows = [...KB_CONSUME_STATS].sort((a, b) => b.retrievalCount30d - a.retrievalCount30d);
  const W = 560;
  const labelW = 132;
  const valueW = 96;
  const chartW = W - labelW - valueW;
  const rowH = 26;
  const H = rows.length * rowH + 6;
  const max = Math.max(...rows.map((r) => r.retrievalCount30d), 1);
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`7 个 Agent 近 30 日知识库检索次数条形图，合计 ${num(rows.reduce((s, r) => s + r.retrievalCount30d, 0))} 次`}
    >
      {rows.map((r, i) => {
        const y = i * rowH + 3;
        const w = Math.max(3, (r.retrievalCount30d / max) * chartW);
        return (
          <g key={r.agentId}>
            <text className="ac-kb-svg-name" x={0} y={y + 16}>
              {r.agentName}
            </text>
            <rect x={labelW} y={y + 5} width={chartW} height={14} rx={4} fill="#eceff4" />
            <rect x={labelW} y={y + 5} width={w} height={14} rx={4} fill={TONE_HEX[r.tone] ?? TONE_HEX.brand} />
            <text className="ac-kb-svg-value" x={W} y={y + 16} textAnchor="end">
              {num(r.retrievalCount30d)} 次 · 采纳 {r.acceptRatePct}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 评测趋势折线：3 个评测集 × 5 次历史 × 可切换指标 */
function EvalTrendLines({ metricKey, pct }: { metricKey: 'recallAt10' | 'mrr' | 'ndcgAt10' | 'faithfulnessPct'; pct: boolean }) {
  const W = 760;
  const H = 250;
  const padL = 48;
  const padR = 22;
  const padT = 22;
  const padB = 44;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const points = KB_EVAL_SETS[0].history.length;
  const allValues = KB_EVAL_SETS.flatMap((s) => s.history.map((h) => h[metricKey]));
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const span = Math.max(rawMax - rawMin, 0.001);
  const min = rawMin - span * 0.18;
  const max = rawMax + span * 0.14;
  const xOf = (i: number) => padL + (points > 1 ? (i / (points - 1)) * chartW : 0);
  const yOf = (v: number) => padT + chartH - ((v - min) / (max - min)) * chartH;
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`3 个检索评测集近 5 次评测的 ${metricKey} 趋势折线图`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = min + (max - min) * f;
        return (
          <g key={f}>
            <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="#eef1f5" />
            <text className="ac-kb-svg-axis" x={padL - 6} y={yOf(v) + 4} textAnchor="end">
              {pct ? v.toFixed(1) : v.toFixed(3)}
            </text>
          </g>
        );
      })}
      {KB_EVAL_SETS[0].history.map((h, i) => (
        <text key={h.at} className="ac-kb-svg-cap" x={xOf(i)} y={H - 24} textAnchor="middle">
          {h.at.slice(5, 10)}
        </text>
      ))}
      {KB_EVAL_SETS.map((s) => {
        const path = s.history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(h[metricKey]).toFixed(1)}`).join(' ');
        return (
          <g key={s.id}>
            <path d={path} fill="none" stroke={TONE_HEX[s.tone] ?? TONE_HEX.brand} strokeWidth={2.2} />
            {s.history.map((h, i) => (
              <circle key={h.at} cx={xOf(i)} cy={yOf(h[metricKey])} r={3.4} fill="#fff" stroke={TONE_HEX[s.tone] ?? TONE_HEX.brand} strokeWidth={2} />
            ))}
            <text className="ac-kb-svg-value" x={xOf(points - 1) + 6} y={yOf(s.history[points - 1][metricKey]) + 4}>
              {s.id}
            </text>
          </g>
        );
      })}
      <text className="ac-kb-svg-axis" x={padL} y={13}>
        {EVAL_METRICS.find((m) => m.key === metricKey)?.label ?? metricKey}
      </text>
    </svg>
  );
}

/** 幻觉率对比：withoutKb vs withKb 分组条形 */
function HallucinationCompare() {
  const rows = KB_CONSUME_STATS;
  const W = 860;
  const H = 268;
  const padL = 34;
  const padR = 16;
  const padT = 26;
  const padB = 52;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const slot = chartW / rows.length;
  const bw = Math.min(slot * 0.28, 30);
  const max = Math.max(...rows.map((r) => r.withoutKbPct), 1);
  const yOf = (v: number) => padT + chartH - (v / max) * chartH;
  const totalRetrieval = rows.reduce((s, r) => s + r.retrievalCount30d, 0);
  const wAvgBefore = rows.reduce((s, r) => s + r.withoutKbPct * r.retrievalCount30d, 0) / totalRetrieval;
  const wAvgAfter = rows.reduce((s, r) => s + r.withKbPct * r.retrievalCount30d, 0) / totalRetrieval;
  const reduction = ((wAvgBefore - wAvgAfter) / wAvgBefore) * 100;
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`7 个 Agent 注入知识前后幻觉率对比，按检索次数加权平均下降 ${reduction.toFixed(1)}%`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = max * f;
        return (
          <g key={f}>
            <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="#eef1f5" />
            <text className="ac-kb-svg-axis" x={padL - 6} y={yOf(v) + 4} textAnchor="end">
              {v.toFixed(0)}%
            </text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const cx = padL + slot * i + slot / 2;
        return (
          <g key={r.agentId}>
            <rect x={cx - bw - 2} y={yOf(r.withoutKbPct)} width={bw} height={padT + chartH - yOf(r.withoutKbPct)} rx={3} fill={TONE_HEX.danger} opacity={0.8}>
              <title>{`${r.agentName} 未注入知识幻觉率 ${r.withoutKbPct}%`}</title>
            </rect>
            <rect x={cx + 2} y={yOf(r.withKbPct)} width={bw} height={padT + chartH - yOf(r.withKbPct)} rx={3} fill={TONE_HEX.ok}>
              <title>{`${r.agentName} 注入知识后幻觉率 ${r.withKbPct}%`}</title>
            </rect>
            <text className="ac-kb-svg-cap" x={cx - bw / 2 - 2} y={yOf(r.withoutKbPct) - 4} textAnchor="middle">
              {r.withoutKbPct}%
            </text>
            <text className="ac-kb-svg-cap" x={cx + bw / 2 + 2} y={yOf(r.withKbPct) - 4} textAnchor="middle">
              {r.withKbPct}%
            </text>
            <text className="ac-kb-svg-axis" x={cx} y={H - 32} textAnchor="middle">
              {r.agentName.replace(' Agent', '')}
            </text>
            <text className="ac-kb-svg-cap" x={cx} y={H - 18} textAnchor="middle">
              下降 {(((r.withoutKbPct - r.withKbPct) / r.withoutKbPct) * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
      <g>
        <rect x={padL} y={6} width={11} height={11} rx={3} fill={TONE_HEX.danger} opacity={0.8} />
        <text className="ac-kb-svg-cap" x={padL + 16} y={15}>
          未注入知识幻觉率
        </text>
        <rect x={padL + 140} y={6} width={11} height={11} rx={3} fill={TONE_HEX.ok} />
        <text className="ac-kb-svg-cap" x={padL + 156} y={15}>
          注入知识后幻觉率
        </text>
        <text className="ac-kb-svg-value" x={W - padR} y={15} textAnchor="end">
          加权平均 {wAvgBefore.toFixed(2)}% → {wAvgAfter.toFixed(2)}%（下降 {reduction.toFixed(1)}%，按 retrievalCount30d 加权）
        </text>
      </g>
    </svg>
  );
}

/** 单 Agent 近 4 周检索次数 sparkline */
function WeekSpark({ points, tone }: { points: { week: string; retrievalCount: number; acceptRatePct: number }[]; tone: Tone }) {
  const W = 116;
  const H = 34;
  const pad = 4;
  const max = Math.max(...points.map((p) => p.retrievalCount), 1);
  const min = Math.min(...points.map((p) => p.retrievalCount), 0);
  const span = Math.max(max - min, 1);
  const color = TONE_HEX[tone] ?? TONE_HEX.brand;
  const coords = points.map((p, i) => ({
    x: pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2),
    y: H - pad - ((p.retrievalCount - min) / span) * (H - pad * 2),
  }));
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`近 4 周检索次数趋势：${points.map((p) => `${p.week} ${p.retrievalCount} 次`).join('，')}`}
    >
      <path d={`${line} L ${coords[coords.length - 1].x.toFixed(1)} ${H - pad} L ${coords[0].x.toFixed(1)} ${H - pad} Z`} fill={color} opacity={0.13} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 2.6 : 1.7} fill={color} />
      ))}
    </svg>
  );
}

/** 分级访问控制热力网格：accessLevel × 知识空间 */
function AccessHeatGrid() {
  const spaces = KB_SPACES;
  const cellW = 92;
  const cellH = 40;
  const labelW = 96;
  const totalW = 74;
  const W = labelW + spaces.length * cellW + totalW + 12;
  const H = 44 + ACCESS_ORDER.length * cellH + 30;
  const counts = ACCESS_ORDER.map((lv) => spaces.map((sp) => KB_DOCS.filter((d) => d.spaceId === sp.id && d.accessLevel === lv).length));
  const max = Math.max(...counts.flat(), 1);
  return (
    <svg
      className="ac-kb-svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="20 篇知识文档按访问级别与所属空间的交叉分布热力网格"
    >
      {spaces.map((sp, j) => (
        <text key={sp.id} className="ac-kb-svg-axis" x={labelW + j * cellW + cellW / 2} y={20} textAnchor="middle">
          {sp.name}
        </text>
      ))}
      <text className="ac-kb-svg-axis" x={labelW + spaces.length * cellW + totalW / 2} y={20} textAnchor="middle">
        合计
      </text>
      {ACCESS_ORDER.map((lv, i) => {
        const rowSum = counts[i].reduce((s, v) => s + v, 0);
        return (
          <g key={lv}>
            <text className="ac-kb-svg-name" x={0} y={44 + i * cellH + 24}>
              {ACCESS_META[lv].label}
            </text>
            {spaces.map((sp, j) => {
              const v = counts[i][j];
              const alpha = v === 0 ? 0 : 0.16 + (v / max) * 0.74;
              return (
                <g key={sp.id}>
                  <rect
                    x={labelW + j * cellW + 2}
                    y={44 + i * cellH}
                    width={cellW - 4}
                    height={cellH - 4}
                    rx={5}
                    fill={TONE_HEX[ACCESS_META[lv].tone === 'danger' ? 'danger' : ACCESS_META[lv].tone === 'warn' ? 'warn' : ACCESS_META[lv].tone === 'info' ? 'info' : 'ok']}
                    opacity={v === 0 ? 1 : alpha}
                    stroke={v === 0 ? '#eef1f5' : 'none'}
                  >
                    <title>{`${sp.name} · ${ACCESS_META[lv].label} · ${v} 篇`}</title>
                  </rect>
                  <text className="ac-kb-svg-value" x={labelW + j * cellW + cellW / 2} y={44 + i * cellH + 23} textAnchor="middle" fill={v === 0 ? '#c3cad4' : '#131a24'}>
                    {v === 0 ? '—' : v}
                  </text>
                </g>
              );
            })}
            <rect x={labelW + spaces.length * cellW + 2} y={44 + i * cellH} width={totalW - 4} height={cellH - 4} rx={5} fill="#f2f4f8" />
            <text className="ac-kb-svg-value" x={labelW + spaces.length * cellW + totalW / 2} y={44 + i * cellH + 23} textAnchor="middle">
              {rowSum}
            </text>
          </g>
        );
      })}
      <text className="ac-kb-svg-cap" x={labelW} y={H - 8}>
        脱敏文档 {kbStats.redactedDocCount} 篇 · 受限及以上（restricted + confidential）{kbStats.restrictedDocCount} 篇 · 文档总数 {KB_DOCS.length}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ 页面 */

export default function KnowledgePage() {
  const [tab, setTab] = useState<TabId>('overview');

  /* -------- 总览 -------- */
  const [staleRefreshed, setStaleRefreshed] = useState<string[]>([]);
  const [staleHint, setStaleHint] = useState<string | null>(null);

  /* -------- 阶段产物归档 -------- */
  const [ruleOverrides, setRuleOverrides] = useState<Record<string, boolean>>({});
  const [ruleHint, setRuleHint] = useState<string | null>(null);
  const [artifactDrawer, setArtifactDrawer] = useState<KbStageArtifactDef | null>(null);
  const [ingestDrawer, setIngestDrawer] = useState<KbIngestRunDef | null>(null);

  /* -------- 空间与文档 -------- */
  const [fSpace, setFSpace] = useState('all');
  const [fDocType, setFDocType] = useState('all');
  const [fSource, setFSource] = useState('all');
  const [fStage, setFStage] = useState('all');
  const [fEmbed, setFEmbed] = useState('all');
  const [fAccess, setFAccess] = useState('all');
  const [fStale, setFStale] = useState('all');
  const [docKeyword, setDocKeyword] = useState('');
  const [docSort, setDocSort] = useState<'id' | 'chunks' | 'tokensK' | 'hitCount30d' | 'citationCount' | 'updatedAt'>('id');
  const [docSortAsc, setDocSortAsc] = useState(true);
  const [docDrawer, setDocDrawer] = useState<KbDocDef | null>(null);

  /* -------- 知识图谱 -------- */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('KG-01');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [graphHint, setGraphHint] = useState<string | null>(null);

  /* -------- 检索与评测 -------- */
  const [benchQuery, setBenchQuery] = useState('');
  const [benchType, setBenchType] = useState<'all' | KbRetrievalLogDef['queryType']>('all');
  const [benchTopK, setBenchTopK] = useState(8);
  const [benchResult, setBenchResult] = useState<{ log: KbRetrievalLogDef | null; score: number } | null>(null);
  const [logDrawer, setLogDrawer] = useState<KbRetrievalLogDef | null>(null);
  const [evalMetric, setEvalMetric] = useState<'recallAt10' | 'mrr' | 'ndcgAt10' | 'faithfulnessPct'>('recallAt10');
  const [evalRuns, setEvalRuns] = useState<Record<string, string>>({});

  /* -------- 治理与消费 -------- */
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictPick, setConflictPick] = useState<string | null>(null);
  const [conflictResolved, setConflictResolved] = useState<{ docId: string; at: string } | null>(null);

  const layout = useMemo(() => computeGraphLayout(KB_GRAPH_NODES, KB_GRAPH_EDGES, 1040, 620), []);

  const selectedNode = useMemo(() => KB_GRAPH_NODES.find((n) => n.id === selectedNodeId) ?? null, [selectedNodeId]);
  const selectedEdge = useMemo(() => KB_GRAPH_EDGES.find((e) => e.id === selectedEdgeId) ?? null, [selectedEdgeId]);
  const nodeEdges = useMemo(
    () => (selectedNode ? KB_GRAPH_EDGES.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id) : []),
    [selectedNode],
  );

  const allRules = useMemo(
    () => KB_ARCHIVE_RULES.map((r) => (r.id in ruleOverrides ? { ...r, enabled: ruleOverrides[r.id] } : r)),
    [ruleOverrides],
  );

  const staleDocs = useMemo(() => KB_DOCS.filter((d) => d.staleness.isStale), []);

  const docTypeOptions = useMemo(() => Array.from(new Set(KB_DOCS.map((d) => d.docType))), []);
  const sourceOptions = useMemo(() => Array.from(new Set(KB_DOCS.map((d) => d.sourceSystem))), []);

  const filteredDocs = useMemo(() => {
    const kw = docKeyword.trim().toLowerCase();
    const rows = KB_DOCS.filter((d) => {
      if (fSpace !== 'all' && d.spaceId !== fSpace) return false;
      if (fDocType !== 'all' && d.docType !== fDocType) return false;
      if (fSource !== 'all' && d.sourceSystem !== fSource) return false;
      if (fStage !== 'all' && d.stageId !== fStage) return false;
      if (fEmbed !== 'all' && d.embedStatus !== fEmbed) return false;
      if (fAccess !== 'all' && d.accessLevel !== fAccess) return false;
      if (fStale === 'stale' && !d.staleness.isStale) return false;
      if (fStale === 'fresh' && d.staleness.isStale) return false;
      if (kw) {
        const hay = `${d.id} ${d.title} ${d.sourceRef} ${d.legacyKbId ?? ''} ${d.legacyRagId ?? ''} ${d.relatedIds.join(' ')}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    const dir = docSortAsc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (docSort === 'id') return a.id.localeCompare(b.id) * dir;
      if (docSort === 'updatedAt') return a.updatedAt.localeCompare(b.updatedAt) * dir;
      return (a[docSort] - b[docSort]) * dir;
    });
  }, [fSpace, fDocType, fSource, fStage, fEmbed, fAccess, fStale, docKeyword, docSort, docSortAsc]);

  const legacyDocs = useMemo(() => KB_DOCS.filter((d) => d.legacyRagId !== null), []);

  const kbAuditLogs = useMemo(() => {
    const ids = Array.from(new Set(KB_GOVERNANCE.flatMap((g) => g.auditLogIds)));
    return auditLogs
      .filter((l) => ids.includes(l.id))
      .sort((a, b) => b.time.localeCompare(a.time));
  }, []);

  const nodeTypeDist = useMemo(() => {
    const map = new Map<string, number>();
    KB_GRAPH_NODES.forEach((n) => map.set(n.nodeType, (map.get(n.nodeType) ?? 0) + 1));
    return Array.from(map.entries()).map(([label, value], i) => ({
      label,
      value,
      tone: (NODE_TYPE_META[label]?.tone ?? (i % 2 === 0 ? 'brand' : 'info')) as Tone,
    }));
  }, []);

  const graphStats = useMemo(() => {
    const degreeSum = KB_GRAPH_NODES.reduce((s, n) => s + n.degree, 0);
    const aiEdges = KB_GRAPH_EDGES.filter((e) => e.aiExtracted).length;
    const verified = KB_GRAPH_EDGES.filter((e) => e.verified).length;
    return {
      nodes: KB_GRAPH_NODES.length,
      edges: KB_GRAPH_EDGES.length,
      avgDegree: degreeSum / Math.max(KB_GRAPH_NODES.length, 1),
      degreeSum,
      aiEdgePct: (aiEdges / KB_GRAPH_EDGES.length) * 100,
      verifiedPct: (verified / KB_GRAPH_EDGES.length) * 100,
      verified,
    };
  }, []);

  const agentLogCounts = useMemo(() => {
    const map = new Map<string, number>();
    KB_RETRIEVAL_LOGS.filter((l) => l.callerType === 'agent').forEach((l) => map.set(l.callerId, (map.get(l.callerId) ?? 0) + 1));
    return map;
  }, []);

  const toggleDocSort = (key: typeof docSort) => {
    if (docSort === key) setDocSortAsc((v) => !v);
    else {
      setDocSort(key);
      setDocSortAsc(true);
    }
  };

  const docSortIcon = (key: typeof docSort) => (docSort === key ? (docSortAsc ? ' ↑' : ' ↓') : '');

  const runBench = () => {
    const q = benchQuery.trim();
    if (!q) {
      setBenchResult(null);
      return;
    }
    const pool = benchType === 'all' ? KB_RETRIEVAL_LOGS : KB_RETRIEVAL_LOGS.filter((l) => l.queryType === benchType);
    const best = pool.reduce<{ log: KbRetrievalLogDef | null; score: number }>(
      (acc, l) => {
        const s = matchScore(q, l.query);
        return s > acc.score ? { log: l, score: s } : acc;
      },
      { log: null, score: 0 },
    );
    setBenchResult({ log: best.score >= 0.1 ? best.log : null, score: best.score });
  };

  const toggleRule = (rule: KbArchiveRuleDef) => {
    const next = !(rule.id in ruleOverrides ? ruleOverrides[rule.id] : rule.enabled);
    setRuleOverrides((prev) => ({ ...prev, [rule.id]: next }));
    const impacted = KB_STAGE_ARTIFACT_MAP.filter((a) => a.archiveRuleId === rule.id);
    setRuleHint(
      next
        ? `${rule.id}「${rule.name}」已启用：命中 ${rule.matchStageIds.map(stageName).join(' / ')} 环节的 ${impacted.length} 项产物（${impacted
            .map((a) => a.artifactName)
            .join('、')}），按 priority ${rule.priority} 参与求值，动作为${RULE_ACTION_META[rule.action].label}。`
        : `${rule.id}「${rule.name}」已停用：${impacted.length} 项产物将不再自动归档（${impacted
            .map((a) => a.artifactName)
            .join('、')}），后续同类事件会顺延到下一条命中的规则，若无规则命中则不入库并告警空间 Owner。`,
    );
  };

  const reingestStale = (docIds: string[]) => {
    setStaleRefreshed((prev) => Array.from(new Set([...prev, ...docIds])));
    setStaleHint(
      `已触发 ${docIds.join(' / ')} 的重新入库（本地乐观状态）：将走 7 步流水线重做解析 → 切片 → 向量化，预计 ${KB_ENGINE.avgIngestSec}s × ${docIds.length} 篇；` +
        '完成后 staleness.lastVerifiedAt 刷新为今日、embedStatus 由 stale 回到 ready，重排阶段的 0.6 降权因子同时解除。',
    );
  };

  const incrementalExtract = () => {
    setGraphHint(
      `已触发增量图谱抽取（本地乐观状态）：扫描 KI-08 新入库的 186 个切片，按 NER + 关系抽取 + 实体链接流程与 ARCH_COMPONENTS 的 14 个组件 id 对齐；` +
        `置信度 < 80% 的边进入人工复核队列由严慕舟确认，当前图谱 ${graphStats.nodes} 节点 / ${graphStats.edges} 边，verified ${graphStats.verified} 条。`,
    );
  };

  const runEval = (id: string) => {
    setEvalRuns((prev) => ({ ...prev, [id]: '2026-03-19 18:40' }));
  };

  const resolveConflict = () => {
    if (!conflictPick) return;
    setConflictResolved({ docId: conflictPick, at: '2026-03-19 18:52' });
    setConflictOpen(false);
  };

  return (
    <div className="ac-kb" data-annotation-id="ai-sdlc-knowledge-page">
      {/* ---------- 页头 ---------- */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">企业知识库</div>
          <div className="ac-page-desc">
            研发流程各阶段的输出产物（PRD、架构视图、接口契约、任务清单、代码 MR 与评审记录、测试报告、根因分析、发布记录、回滚预案等）
            <strong>自动归档</strong>入企业知识库，经「解析 → 切片 → 向量化 → 图谱构建」加工后供 7 个 Agent 检索消费，
            从而降低幻觉、贴近团队规范；能力对标 <strong>WeKnora</strong>（腾讯开源文档理解与检索增强框架）。
            全部数据围绕「订单中心重构」（EPIC-ORDER-REF）Sprint 24 的真实产物展开。
          </div>
        </div>
        <div className="ac-page-actions">
          <span className="ac-tag ac-tag--outline">
            <Clock size={12} />
            {kbStats.range}
          </span>
          <span className={`ac-tag ac-tag--${KB_ENGINE.status === 'connected' ? 'ok' : 'warn'}`}>
            <span className={KB_ENGINE.status === 'connected' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
            WeKnora {KB_ENGINE.version} · {KB_ENGINE.status === 'connected' ? '已连接' : '未连接'}
          </span>
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setTab('artifacts')}>
            <Archive size={13} />
            归档映射
          </button>
          <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={() => setTab('retrieval')}>
            <Search size={13} />
            检索测试台
          </button>
        </div>
      </div>

      {/* ---------- 页签 ---------- */}
      <div className="ac-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count =
            t.id === 'overview'
              ? kbStats.totalSpaces
              : t.id === 'artifacts'
                ? KB_STAGE_ARTIFACT_MAP.length
                : t.id === 'assets'
                  ? KB_DOCS.length
                  : t.id === 'graph'
                    ? KB_GRAPH_NODES.length
                    : t.id === 'retrieval'
                      ? KB_RETRIEVAL_LOGS.length
                      : KB_GOVERNANCE.length;
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

      {/* ================= 1. 总览 ================= */}
      {tab === 'overview' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--6 ac-mb-0" data-annotation-id="ai-sdlc-knowledge-overview-metrics">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">知识空间</span>
                <span className="ac-metric-icon">
                  <Boxes size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {kbStats.totalSpaces}
                <span className="ac-metric-unit">个</span>
              </div>
              <div className="ac-metric-foot">与 KB_ENGINE.indexCount 一一对应</div>
            </div>
            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">知识文档</span>
                <span className="ac-metric-icon">
                  <BookOpen size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {kbStats.totalDocs}
                <span className="ac-metric-unit">篇</span>
              </div>
              <div className="ac-metric-foot">自动归档 {kbStats.autoArchiveCount30d} · 人工 {kbStats.manualUploadCount30d}</div>
            </div>
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">向量切片</span>
                <span className="ac-metric-icon">
                  <Database size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {num(kbStats.totalChunks)}
                <span className="ac-metric-unit">片</span>
              </div>
              <div className="ac-metric-foot">= Σ 空间 chunkCount = Σ 文档 chunks</div>
            </div>
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">Token 总量</span>
                <span className="ac-metric-icon">
                  <Layers size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {kbStats.totalTokensM.toFixed(3).replace(/0$/, '')}
                <span className="ac-metric-unit">M</span>
              </div>
              <div className="ac-metric-foot">Σ tokensK 1219K ÷ 1000 ≈ 1.219M</div>
            </div>
            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head">
                <span className="ac-metric-label">近 30 日检索</span>
                <span className="ac-metric-icon">
                  <Search size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {num(kbStats.retrievalByAgents30d)}
                <span className="ac-metric-unit">次</span>
              </div>
              <div className="ac-metric-foot">Agent 检索；含人工 {num(kbStats.retrievalByHumans30d)} 次合计 {num(kbStats.retrievalCount30d)}</div>
            </div>
            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head">
                <span className="ac-metric-label">存储体积</span>
                <span className="ac-metric-icon">
                  <HardDrive size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {kbStats.totalSizeGb.toFixed(2)}
                <span className="ac-metric-unit">GB</span>
              </div>
              <div className="ac-metric-foot">原文 12.75MB + pgvector 索引 9.4MB + OCR 中间产物</div>
            </div>
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card" data-annotation-id="ai-sdlc-knowledge-stage-coverage">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Archive size={16} />
                  SDLC 阶段产物归档覆盖率
                </span>
                <span className="ac-card-subtitle">六环节各 3 项产物，合计 18 项，本迭代已生成知识文档 16 项</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--ok">100% 覆盖 4 个环节</span>
                  <span className="ac-tag ac-tag--warn">未覆盖 2 项</span>
                </div>
              </div>
              <div className="ac-card-body">
                <StageCoverageBars />
                <div className="ac-hint ac-hint--warn ac-kb-mt">
                  <AlertTriangle size={14} />
                  <span>
                    <strong>未覆盖项 1 · 环境拓扑快照（st-deploy-2）：</strong>
                    生产拓扑快照须在切流完成后采集，REL-2403 因 G3（聚合覆盖率 71.4%）与 BLOCK-0312（DBA 未批复迁移窗口）双重阻塞未执行，
                    当前仅有 env-staging 的两次回切演练快照（上次归档 2026-02-27），本轮不生成新文档，docId 为 null。
                  </span>
                </div>
                <div className="ac-hint ac-hint--warn">
                  <AlertTriangle size={14} />
                  <span>
                    <strong>未覆盖项 2 · 技术债清单（st-observe-3）：</strong>
                    G6 环节 progress 仅 20%、门禁未开启，本迭代技术债清单仍为草稿态，被归档规则 KA-08 判定 skip（草稿不入库，避免污染检索）；
                    上一版归档于 Sprint 23 收尾（2026-02-20），其中 TD-2026-041 已转化为 REQ-2406 领域事件标准化。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Zap size={16} />
                  归档来源构成
                </span>
                <span className="ac-card-subtitle">近 30 日 20 篇文档</span>
              </div>
              <div className="ac-card-body">
                <DonutChart
                  size={172}
                  thickness={24}
                  centerValue={`${kbStats.autoArchivedPct}%`}
                  centerLabel="自动归档"
                  ariaLabel="近 30 日文档来源构成：SDLC 事件自动归档 9 篇，Confluence / 飞书存量同步与人工上传 11 篇"
                  items={[
                    { label: '事件驱动自动归档', value: kbStats.autoArchiveCount30d, tone: 'ai' },
                    { label: '人工上传 / 存量同步', value: kbStats.manualUploadCount30d, tone: 'info' },
                  ]}
                />
                <dl className="ac-kv ac-kb-kv-tight ac-kb-mt">
                  <dt>自动归档</dt>
                  <dd>
                    KD-12 ~ KD-20 共 {kbStats.autoArchiveCount30d} 篇，由 KA-01 ~ KA-07 规则在 SDLC 事件命中后触发
                  </dd>
                  <dt>人工 / 存量</dt>
                  <dd>
                    KD-01 ~ KD-11 共 {kbStats.manualUploadCount30d} 篇，承接自 Confluence（11 篇中的 10 篇）与飞书文档
                  </dd>
                  <dt>入库成功率</dt>
                  <dd className="ac-tnum">
                    {kbStats.ingestSuccessRatePct}%（已结束 7 次执行中 success 5 + partial 1）
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="ac-grid-3">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Target size={16} />
                  检索质量指标
                </span>
                <span className="ac-card-subtitle">取自活跃评测集 KQ-01 最近一次结果</span>
              </div>
              <div className="ac-card-body">
                <dl className="ac-kv ac-kb-kv">
                  <dt>recall@10</dt>
                  <dd className="ac-tnum ac-semi ac-ok-text">{kbStats.evalRecallAt10.toFixed(3)}</dd>
                  <dt>MRR</dt>
                  <dd className="ac-tnum ac-semi">{kbStats.evalMrr.toFixed(3)}</dd>
                  <dt>答案忠实度</dt>
                  <dd className="ac-tnum ac-semi">{kbStats.faithfulnessPct}%</dd>
                  <dt>幻觉率下降</dt>
                  <dd className="ac-tnum ac-semi ac-ok-text">{kbStats.hallucinationReductionPct}%（12.04% → 2.50%）</dd>
                  <dt>缓存命中率</dt>
                  <dd className="ac-tnum">{kbStats.cacheHitRatePct}%</dd>
                  <dt>平均检索时延</dt>
                  <dd className="ac-tnum">{kbStats.avgRetrievalMs} ms</dd>
                  <dt>近 30 日引用</dt>
                  <dd className="ac-tnum">{num(kbStats.citationCount30d)} 次</dd>
                </dl>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Coins size={16} />
                  成本与规模
                </span>
                <span className="ac-card-subtitle">近 30 日</span>
              </div>
              <div className="ac-card-body">
                <dl className="ac-kv ac-kb-kv">
                  <dt>RAG Token 成本</dt>
                  <dd className="ac-tnum ac-semi">¥{kbStats.tokenCost30dYuan.toFixed(1)}</dd>
                  <dt>存储成本</dt>
                  <dd className="ac-tnum ac-semi">¥{kbStats.storageCost30dYuan.toFixed(1)}</dd>
                  <dt>入库解析成本</dt>
                  <dd className="ac-tnum">¥{KB_INGEST_RUNS.reduce((s, r) => s + r.costYuan, 0).toFixed(2)}（单列，不含在 Token 成本内）</dd>
                  <dt>图谱规模</dt>
                  <dd className="ac-tnum">
                    {kbStats.graphNodes} 节点 / {kbStats.graphEdges} 边
                  </dd>
                  <dt>切片总数</dt>
                  <dd className="ac-tnum">{num(kbStats.totalChunks)} 片</dd>
                  <dt>QPS 上限</dt>
                  <dd className="ac-tnum">{KB_ENGINE.qpsLimit} QPS</dd>
                </dl>
                <div className="ac-hint ac-kb-mt">
                  <Coins size={14} />
                  <span>
                    ¥{kbStats.tokenCost30dYuan.toFixed(1)} = Σ KB_CONSUME_STATS.tokenCostFromKb（仅 RAG 注入的模型 token 成本）；
                    入库侧的解析与向量化成本 ¥{KB_INGEST_RUNS.reduce((s, r) => s + r.costYuan, 0).toFixed(2)} 单列于 KB_INGEST_RUNS.costYuan，两者不重复计算。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card" data-annotation-id="ai-sdlc-knowledge-stale-alert">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <AlertTriangle size={16} />
                  知识保鲜告警
                </span>
                <span className="ac-card-subtitle">超期未复核 {kbStats.staleDocCount} 篇（占全库 {kbStats.staleDocPct}%）</span>
                <div className="ac-card-extra">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ai ac-btn--sm"
                    onClick={() => reingestStale(staleDocs.map((d) => d.id))}
                    disabled={staleRefreshed.length >= staleDocs.length}
                  >
                    <RefreshCw size={12} />
                    触发重新入库
                  </button>
                </div>
              </div>
              <div className="ac-card-body">
                {staleHint ? (
                  <div className="ac-hint ac-hint--ok ac-kb-mb">
                    <CheckCircle2 size={14} />
                    <span>{staleHint}</span>
                  </div>
                ) : null}
                <div className="ac-kb-stale-list">
                  {staleDocs.map((d) => (
                    <div className="ac-kb-stale" key={d.id}>
                      <div className="ac-kb-stale-head">
                        <span className={`ac-tag ac-tag--sm ac-tag--${EMBED_META[d.embedStatus].tone}`}>{EMBED_META[d.embedStatus].label}</span>
                        <button type="button" className="ac-kb-stale-title ac-kb-link" onClick={() => setDocDrawer(d)}>
                          {d.title}
                        </button>
                        <span className="ac-xs ac-muted ac-mono ac-ml-auto">
                          {d.id} · {d.version}
                        </span>
                      </div>
                      <div className="ac-xs ac-text-2 ac-kb-stale-reason">
                        过期原因：{d.staleness.staleReason ?? '超过复核周期'} · 最近核验 {d.staleness.lastVerifiedAt} · 周期 {d.staleness.verifyCycleDays} 天
                      </div>
                      <div className="ac-kb-ai-actions">
                        <button
                          type="button"
                          className="ac-btn ac-btn--sm ac-btn--ghost"
                          onClick={() => reingestStale([d.id])}
                          disabled={staleRefreshed.includes(d.id)}
                        >
                          <RefreshCw size={12} />
                          {staleRefreshed.includes(d.id) ? '已排队重索引' : '仅重索引本篇'}
                        </button>
                        <span className="ac-xs ac-muted">重排阶段已施加 0.6 降权因子（WK-05）</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="ac-hint ac-hint--warn ac-kb-mt">
                  <ShieldCheck size={14} />
                  <span>
                    治理策略 kb-gov-04「知识保鲜与失效」要求每篇文档按 verifyCycleDays（7 / 30 / 60 / 90 天四档）定期复核；
                    超期即标记 isStale 并在重排阶段降权，避免过期规约（如 KD-08 金额精度附录 C 的 v3.2 条款）污染 Agent 生成结果。
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card" data-annotation-id="ai-sdlc-knowledge-weknora-engine">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Cpu size={16} />
                WeKnora 引擎信息
              </span>
              <span className="ac-card-subtitle">
                {KB_ENGINE.vendor} · {KB_ENGINE.deployMode} · {KB_ENGINE.protocol}
              </span>
              <div className="ac-card-extra">
                <span className={`ac-tag ac-tag--${KB_ENGINE.status === 'connected' ? 'ok' : 'warn'}`}>
                  <span className={KB_ENGINE.status === 'connected' ? 'ac-pulse-dot' : 'ac-tag-dot'} />
                  {KB_ENGINE.status === 'connected' ? '已连接' : KB_ENGINE.status === 'paused' ? '已暂停' : '未接入'}
                </span>
                <a className="ac-btn ac-btn--ghost ac-btn--sm" href={KB_ENGINE.docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={12} />
                  开源仓库
                </a>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-kb-engine-grid">
                <dl className="ac-kv ac-kb-kv">
                  <dt>引擎 id</dt>
                  <dd className="ac-mono">{KB_ENGINE.id}</dd>
                  <dt>版本</dt>
                  <dd className="ac-mono">{KB_ENGINE.name} {KB_ENGINE.version}</dd>
                  <dt>部署方式</dt>
                  <dd>{KB_ENGINE.deployMode}</dd>
                  <dt>服务入口</dt>
                  <dd className="ac-mono ac-xs">{KB_ENGINE.endpoint}</dd>
                  <dt>协议 / 鉴权</dt>
                  <dd>
                    {KB_ENGINE.protocol} · {KB_ENGINE.authMode}
                  </dd>
                  <dt>接入时间</dt>
                  <dd className="ac-mono">{KB_ENGINE.connectedAt}</dd>
                  <dt>SLA 可用率</dt>
                  <dd className="ac-tnum">{KB_ENGINE.slaUptimePct}%</dd>
                </dl>
                <dl className="ac-kv ac-kb-kv">
                  <dt>嵌入模型</dt>
                  <dd className="ac-mono">{KB_ENGINE.embeddingModel}（1024 维，L2 归一化）</dd>
                  <dt>重排模型</dt>
                  <dd className="ac-mono">{KB_ENGINE.rerankModel}</dd>
                  <dt>OCR 引擎</dt>
                  <dd className="ac-xs">{KB_ENGINE.ocrEngine}</dd>
                  <dt>向量库</dt>
                  <dd>{KB_ENGINE.vectorStore}（HNSW，m=16 / ef_construction=200）</dd>
                  <dt>图存储</dt>
                  <dd>{KB_ENGINE.graphStore}</dd>
                  <dt>索引数</dt>
                  <dd className="ac-tnum">{KB_ENGINE.indexCount} 个（每空间一个索引）</dd>
                </dl>
                <dl className="ac-kv ac-kb-kv">
                  <dt>总切片</dt>
                  <dd className="ac-tnum">{num(KB_ENGINE.totalChunks)} 片</dd>
                  <dt>总 Token</dt>
                  <dd className="ac-tnum">{KB_ENGINE.totalTokensM} M</dd>
                  <dt>QPS 上限</dt>
                  <dd className="ac-tnum">{KB_ENGINE.qpsLimit}</dd>
                  <dt>平均检索时延</dt>
                  <dd className="ac-tnum">{KB_ENGINE.avgRetrievalMs} ms</dd>
                  <dt>平均入库耗时</dt>
                  <dd className="ac-tnum">{KB_ENGINE.avgIngestSec} s / 篇</dd>
                  <dt>解析格式</dt>
                  <dd>
                    <span className="ac-kb-tag-col">
                      {KB_ENGINE.parserFormats.map((f) => (
                        <span key={f} className="ac-tag ac-tag--sm ac-tag--outline">
                          {f}
                        </span>
                      ))}
                    </span>
                  </dd>
                </dl>
              </div>
              <div className="ac-hint ac-hint--ai ac-kb-mt">
                <Sparkles size={14} />
                <span>{KB_ENGINE.note}</span>
              </div>
            </div>
          </div>

          <div className="ac-section-title">WeKnora 8 项核心能力与平台落地形态</div>
          <div className="ac-grid-4 ac-kb-cap-grid">
            {WEKNORA_CAPABILITIES.map((cap) => (
              <div className="ac-kb-cap" key={cap.id}>
                <div className="ac-kb-cap-head">
                  <span className={`ac-avatar ac-avatar--square ${AVATAR_TONE[cap.tone]}`}>
                    <BrainCircuit size={15} />
                  </span>
                  <div className="ac-flex-1">
                    <div className="ac-kb-cap-name">{cap.name}</div>
                    <div className="ac-row ac-gap-1 ac-mt-1">
                      <span className="ac-tag ac-tag--sm ac-mono">{cap.id}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${AUTOMATION_META[cap.automationLevel].tone}`}>
                        {AUTOMATION_META[cap.automationLevel].label}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ac-kb-cap-desc">{cap.desc}</div>
                <div className="ac-kb-cap-block">
                  <div className="ac-kb-cap-label">
                    <Layers size={11} />
                    输入产物
                  </div>
                  <div className="ac-kb-tag-col">
                    {cap.inputArtifacts.map((a) => (
                      <span key={a} className="ac-tag ac-tag--sm ac-tag--outline">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ac-kb-cap-block">
                  <div className="ac-kb-cap-label">
                    <ArrowRight size={11} />
                    输出产物
                  </div>
                  <div className="ac-kb-tag-col">
                    {cap.outputArtifacts.map((a) => (
                      <span key={a} className="ac-tag ac-tag--sm ac-tag--ai">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ac-kb-cap-metrics">
                  {cap.metrics.map((m) => (
                    <span className="ac-kb-cap-metric" key={m.name}>
                      <strong>{m.value}</strong>
                      {m.unit}
                      <em>{m.name}</em>
                    </span>
                  ))}
                </div>
                <div className="ac-kb-cap-foot">
                  <span className="ac-xs ac-muted">服务环节</span>
                  <span className="ac-kb-tag-col">
                    {cap.sdStageIds.map((s) => (
                      <span key={s} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(s)]}`}>
                        {stageName(s)}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="ac-kb-cap-foot">
                  <span className="ac-xs ac-muted">消费 Agent</span>
                  <span className="ac-kb-tag-col">
                    {cap.agentIds.map((a) => (
                      <span key={a} className="ac-tag ac-tag--sm ac-tag--brand">
                        {agentName(a)}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="ac-kb-cap-eq">
                  <Settings2 size={11} />
                  平台落地：{cap.platformEquivalent}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ================= 2. 阶段产物归档 ================= */}
      {tab === 'artifacts' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-knowledge-archive-pipeline">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Waypoints size={16} />
                归档流水线总览 · 6 环节 × 3 产物
              </span>
              <span className="ac-card-subtitle">产物节点色标表示归档状态，点击已归档节点可跳到「空间与文档」并选中对应文档</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">已归档 16</span>
                <span className="ac-tag ac-tag--warn">未产出 2</span>
              </div>
            </div>
            <div className="ac-card-body">
              <ArchivePipelineSvg
                onPickDoc={(docId) => {
                  const d = docById(docId);
                  setTab('assets');
                  if (d) {
                    setDocKeyword(d.id);
                    setDocDrawer(d);
                  }
                }}
              />
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Table2 size={16} />
                阶段产物 → 知识库归档映射
              </span>
              <span className="ac-card-subtitle">SDLC_STAGES 六环节 outputs 共 18 项，逐项登记触发事件、归档规则、目标空间与消费 Agent</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">共 {KB_STAGE_ARTIFACT_MAP.length} 条</span>
                <span className="ac-tag ac-tag--ai">自动归档 {KB_STAGE_ARTIFACT_MAP.filter((a) => a.autoArchive).length}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>环节</th>
                      <th>产物名</th>
                      <th>产物类型</th>
                      <th className="ac-td-center">自动归档</th>
                      <th>归档触发事件</th>
                      <th>归档规则</th>
                      <th>目标空间</th>
                      <th>生成文档</th>
                      <th className="ac-td-right">留存</th>
                      <th>访问级别</th>
                      <th className="ac-td-center">脱敏</th>
                      <th>脱敏规则</th>
                      <th>消费 Agent</th>
                      <th>切片策略</th>
                      <th>版本策略</th>
                      <th>最近归档 / 次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KB_STAGE_ARTIFACT_MAP.map((a) => {
                      const rule = allRules.find((r) => r.id === a.archiveRuleId);
                      const doc = docById(a.docId);
                      return (
                        <tr key={a.id} className="ac-kb-row" onClick={() => setArtifactDrawer(a)} title="点击查看完整字段与业务理由">
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(a.stageId)]}`}>{a.stageName}</span>
                            <span className="ac-xs ac-muted ac-mono ac-kb-cell-sub">{a.id}</span>
                          </td>
                          <td>
                            <span className="ac-kb-cell-main">{a.artifactName}</span>
                          </td>
                          <td>
                            <span className="ac-tag ac-tag--sm ac-tag--outline">{a.artifactType}</span>
                          </td>
                          <td className="ac-td-center">
                            {a.autoArchive ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ai">
                                <Sparkles size={11} />
                                自动
                              </span>
                            ) : (
                              <span className="ac-xs ac-muted">人工</span>
                            )}
                          </td>
                          <td className="ac-mono ac-xs ac-text-2">{a.archiveTrigger}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${rule ? RULE_ACTION_META[rule.action].tone : 'neutral'}`}>
                              {a.archiveRuleId}
                            </span>
                            <span className="ac-xs ac-muted ac-kb-cell-sub">{rule?.name ?? '—'}</span>
                          </td>
                          <td>
                            <span className="ac-kb-cell-main">{spaceName(a.targetSpaceId)}</span>
                            <span className="ac-xs ac-muted ac-mono ac-kb-cell-sub">{a.targetSpaceId}</span>
                          </td>
                          <td>
                            {doc ? (
                              <button
                                type="button"
                                className="ac-btn ac-btn--text ac-btn--sm ac-kb-link"
                                title={doc.title}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTab('assets');
                                  setDocKeyword(doc.id);
                                  setDocDrawer(doc);
                                }}
                              >
                                <Link2 size={12} />
                                {doc.id}
                              </button>
                            ) : (
                              <span className="ac-tag ac-tag--sm ac-tag--warn">未产出</span>
                            )}
                          </td>
                          <td className="ac-td-num">{a.retentionDays} 天</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${ACCESS_META[a.accessLevel].tone}`}>
                              {a.accessLevel === 'confidential' || a.accessLevel === 'restricted' ? <Lock size={11} /> : null}
                              {ACCESS_META[a.accessLevel].label}
                            </span>
                          </td>
                          <td className="ac-td-center">
                            {a.redactRequired ? <span className="ac-tag ac-tag--sm ac-tag--danger">需脱敏</span> : <span className="ac-xs ac-muted">否</span>}
                          </td>
                          <td className="ac-xs">
                            {a.redactRuleIds.length > 0 ? (
                              <span className="ac-kb-tag-col">
                                {a.redactRuleIds.map((rd) => {
                                  const rule2 = redactRules.find((r) => r.id === rd);
                                  return (
                                    <span key={rd} className={`ac-tag ac-tag--sm ac-tag--${rule2 ? TAG_TONE[rule2.tone] : 'neutral'}`} title={rule2?.name ?? rd}>
                                      {rd}
                                    </span>
                                  );
                                })}
                              </span>
                            ) : (
                              <span className="ac-muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className="ac-kb-tag-col">
                              {a.consumedByAgentIds.map((ag) => (
                                <span key={ag} className="ac-tag ac-tag--sm ac-tag--brand" title={agentName(ag)}>
                                  {ag}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-xs ac-text-2">{CHUNK_STRATEGY_META[a.chunkStrategy]?.label ?? a.chunkStrategy}</td>
                          <td className="ac-xs ac-text-2">{VERSION_POLICY_META[a.versionPolicy] ?? a.versionPolicy}</td>
                          <td className="ac-xs">
                            <span className="ac-mono ac-text-2">{a.lastArchivedAt}</span>
                            <span className="ac-kb-cell-sub ac-muted">累计 {a.archivedCount} 次</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot ac-kb-foot">
              <span>
                <Archive size={13} />
                archivedCount 为跨迭代累计归档次数；docId 指向本迭代生成的知识文档，为 null 表示本轮尚未产出（原因见抽屉中的 note）
              </span>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                归档规则（按 priority 升序求值，首条命中即执行）
              </span>
              <span className="ac-card-subtitle">KA-01 ~ KA-08 共 8 条，覆盖需求 / 架构 / 编码 / 测试 / 发布 / 观测六环节</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">启用 {allRules.filter((r) => r.enabled).length}</span>
                <span className="ac-tag ac-tag--outline">近 30 日命中 {num(allRules.reduce((s, r) => s + r.hitCount30d, 0))}</span>
              </div>
            </div>
            {ruleHint ? (
              <div className="ac-hint ac-hint--warn ac-kb-inline-hint">
                <AlertTriangle size={14} />
                <span>{ruleHint}</span>
                <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-kb-hint-close" onClick={() => setRuleHint(null)}>
                  收起
                </button>
              </div>
            ) : null}
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>名称</th>
                      <th>匹配环节</th>
                      <th>匹配产物类型</th>
                      <th>触发条件表达式</th>
                      <th>动作</th>
                      <th>目标空间</th>
                      <th>命名模板</th>
                      <th>去重策略</th>
                      <th>通知人</th>
                      <th className="ac-td-right">优先级</th>
                      <th className="ac-td-right">近 30 日命中</th>
                      <th>最近命中</th>
                      <th className="ac-td-center">启用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...allRules]
                      .sort((a, b) => a.priority - b.priority)
                      .map((r) => (
                        <tr key={r.id} className={r.enabled ? '' : 'ac-kb-row-disabled'}>
                          <td className="ac-mono ac-brand-text ac-semi">{r.id}</td>
                          <td>
                            <span className="ac-kb-cell-main">{r.name}</span>
                          </td>
                          <td>
                            <span className="ac-kb-tag-col">
                              {r.matchStageIds.map((s) => (
                                <span key={s} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(s)]}`}>
                                  {stageName(s)}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td>
                            <span className="ac-kb-tag-col">
                              {r.matchArtifactTypes.map((t) => (
                                <span key={t} className="ac-tag ac-tag--sm ac-tag--outline">
                                  {t}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td>
                            <div className="ac-code ac-code--light ac-kb-expr">
                              <div className="ac-code-body">{r.condition}</div>
                            </div>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${RULE_ACTION_META[r.action].tone}`}>{RULE_ACTION_META[r.action].label}</span>
                          </td>
                          <td className="ac-xs ac-text-2">
                            {spaceName(r.targetSpaceId)}
                            <span className="ac-kb-cell-sub ac-muted ac-mono">{r.targetSpaceId}</span>
                          </td>
                          <td className="ac-mono ac-xs ac-text-2 ac-kb-tpl">{r.namingTemplate}</td>
                          <td className="ac-xs ac-text-2">{DEDUP_META[r.dedupStrategy]}</td>
                          <td>
                            <span className="ac-avatar-group">
                              {r.notifyUserIds.map((u) => (
                                <span key={u} className={`ac-avatar ac-avatar--xs ${ownerAvatar(u)}`} title={ownerName(u)}>
                                  {ownerInitial(u)}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-td-num">{r.priority}</td>
                          <td className="ac-td-num">{num(r.hitCount30d)}</td>
                          <td className="ac-mono ac-xs ac-text-2">{r.lastHitAt}</td>
                          <td className="ac-td-center">
                            <button
                              type="button"
                              className={`ac-kb-switch ${r.enabled ? 'ac-kb-switch--on' : ''}`}
                              aria-label={`${r.id} 启用开关`}
                              aria-pressed={r.enabled}
                              onClick={() => toggleRule(r)}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <ShieldCheck size={14} />
                <span>
                  KA-08「草稿态与门禁未通过产物跳过」优先级最低（8），是所有环节的兜底：只要产物为 draft 或门禁未 passed 就判 skip，
                  这正是本迭代「技术债清单」docId 为 null 的直接原因。切换启用开关为本地乐观更新，会同步提示受影响的产物条数。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Workflow size={16} />
                入库流水线 · 7 步
              </span>
              <span className="ac-card-subtitle">采集 → 解析/OCR → 结构化抽取 → 层级切片 → 向量化 → 图谱构建 → 索引与评测</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">平均 {KB_ENGINE.avgIngestSec}s / 篇</span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-flow">
                {KB_INGEST_STEPS.map((s, i) => (
                  <div key={s.id} className="ac-row ac-gap-0">
                    {i > 0 ? (
                      <div className="ac-flow-arrow ac-flow-arrow--ok">
                        <ChevronRight size={15} />
                      </div>
                    ) : null}
                    <div className={`ac-flow-node ac-kb-flow-node ac-flow-node--${s.engine === 'ai-agent' ? 'running' : 'ok'}`}>
                      <div className="ac-flow-node-head">
                        <span className="ac-flow-node-idx">{s.order}</span>
                        <span className="ac-flow-node-title">{s.name}</span>
                        <span className="ac-flow-node-icon">
                          {s.engine === 'weknora' ? <Cpu size={13} /> : s.engine === 'ai-agent' ? <BrainCircuit size={13} /> : <Settings2 size={13} />}
                        </span>
                      </div>
                      <span className="ac-kb-tag-col">
                        <span className={`ac-tag ac-tag--sm ac-tag--${INGEST_ENGINE_META[s.engine].tone}`}>{INGEST_ENGINE_META[s.engine].label}</span>
                        <span className="ac-tag ac-tag--sm ac-tag--outline">并发 {s.parallelism}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${s.successRatePct >= 99 ? 'ok' : s.successRatePct >= 96 ? 'warn' : 'danger'}`}>
                          成功率 {s.successRatePct}%
                        </span>
                      </span>
                      <span className="ac-flow-node-meta">{s.desc}</span>
                      <span className="ac-flow-node-meta">
                        输入：{s.inputArtifacts.join(' / ')}
                        <br />
                        输出：{s.outputArtifacts.join(' / ')}
                      </span>
                      <span className="ac-flow-node-meta ac-kb-flow-fallback">
                        <AlertTriangle size={11} />
                        重试 {s.retryPolicy.maxAttempts} 次 / {s.retryPolicy.backoffMs}ms · 降级：{s.fallbackAction}
                      </span>
                      <span className="ac-flow-node-meta ac-mono">
                        <Timer size={11} /> 平均 {s.avgDurationSec}s · {s.id}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ac-kb-mt">
                <IngestDurationStack />
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Activity size={16} />
                入库执行记录
              </span>
              <span className="ac-card-subtitle">最近 8 次（近 30 日共 46 次，此处为样本）；点击行查看 7 步逐步执行状态</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">成功 {KB_INGEST_RUNS.filter((r) => r.status === 'success').length}</span>
                <span className="ac-tag ac-tag--warn">部分成功 {KB_INGEST_RUNS.filter((r) => r.status === 'partial').length}</span>
                <span className="ac-tag ac-tag--danger">失败 {KB_INGEST_RUNS.filter((r) => r.status === 'failed').length}</span>
                <span className="ac-tag ac-tag--info">执行中 {KB_INGEST_RUNS.filter((r) => r.status === 'running').length}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>触发方式</th>
                      <th>触发来源</th>
                      <th>涉及文档</th>
                      <th>开始</th>
                      <th>结束</th>
                      <th className="ac-td-right">耗时</th>
                      <th>状态</th>
                      <th className="ac-td-right">产出切片</th>
                      <th className="ac-td-right">Token</th>
                      <th className="ac-td-right">成本</th>
                      <th className="ac-td-right">OCR 页数</th>
                      <th className="ac-td-right">新增节点</th>
                      <th className="ac-td-right">新增边</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KB_INGEST_RUNS.map((r) => {
                      const meta = INGEST_STATUS_META[r.status];
                      return (
                        <tr key={r.id} className="ac-kb-row" onClick={() => setIngestDrawer(r)} title="点击查看 7 步逐步执行状态">
                          <td className="ac-mono ac-brand-text ac-semi">{r.id}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${r.triggeredBy === 'event' ? 'ai' : r.triggeredBy === 'schedule' ? 'brand' : 'neutral'}`}>
                              {r.triggeredBy === 'event' ? '事件触发' : r.triggeredBy === 'schedule' ? '定时调度' : '人工触发'}
                            </span>
                          </td>
                          <td className="ac-mono ac-xs ac-text-2 ac-kb-trigger">{r.triggerRef}</td>
                          <td>
                            <span className="ac-kb-tag-col">
                              {r.docIds.map((d) => {
                                const doc = docById(d);
                                return (
                                  <span key={d} className={`ac-tag ac-tag--sm ac-tag--${doc ? TAG_TONE[doc.tone] : 'neutral'}`} title={doc?.title ?? d}>
                                    {d}
                                  </span>
                                );
                              })}
                            </span>
                          </td>
                          <td className="ac-mono ac-xs ac-text-2 ac-nowrap">{r.startedAt}</td>
                          <td className="ac-mono ac-xs ac-text-2 ac-nowrap">{r.finishedAt ?? '—'}</td>
                          <td className="ac-td-num">{r.durationSec}s</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${meta.tone}`}>
                              {r.status === 'running' ? <span className="ac-pulse-dot" /> : null}
                              {meta.label}
                            </span>
                          </td>
                          <td className="ac-td-num">{num(r.totalChunksProduced)}</td>
                          <td className="ac-td-num">{num(r.totalTokens)}</td>
                          <td className="ac-td-num">¥{r.costYuan.toFixed(2)}</td>
                          <td className="ac-td-num">
                            {r.ocrPages > 0 ? (
                              <span className="ac-warn-text ac-semi">
                                <ScanLine size={11} /> {r.ocrPages}
                              </span>
                            ) : (
                              <span className="ac-muted">0</span>
                            )}
                          </td>
                          <td className="ac-td-num">{r.graphNodesAdded}</td>
                          <td className="ac-td-num">{r.graphEdgesAdded}</td>
                        </tr>
                      );
                    })}
                    <tr className="ac-kb-sum-row">
                      <td colSpan={6} className="ac-semi">
                        合计（已结束 7 次，KI-08 执行中不计入均值分母）
                      </td>
                      <td className="ac-td-num ac-semi">
                        {KB_INGEST_RUNS.filter((r) => r.finishedAt !== null).reduce((s, r) => s + r.durationSec, 0)}s
                      </td>
                      <td>
                        <span className="ac-tag ac-tag--sm ac-tag--info">成功率 {kbStats.ingestSuccessRatePct}%</span>
                      </td>
                      <td className="ac-td-num ac-semi">{num(KB_INGEST_RUNS.reduce((s, r) => s + r.totalChunksProduced, 0))}</td>
                      <td className="ac-td-num ac-semi">{num(KB_INGEST_RUNS.reduce((s, r) => s + r.totalTokens, 0))}</td>
                      <td className="ac-td-num ac-semi">¥{KB_INGEST_RUNS.reduce((s, r) => s + r.costYuan, 0).toFixed(2)}</td>
                      <td className="ac-td-num ac-semi">{KB_INGEST_RUNS.reduce((s, r) => s + r.ocrPages, 0)}</td>
                      <td className="ac-td-num ac-semi">{KB_INGEST_RUNS.reduce((s, r) => s + r.graphNodesAdded, 0)}</td>
                      <td className="ac-td-num ac-semi">{KB_INGEST_RUNS.reduce((s, r) => s + r.graphEdgesAdded, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot ac-kb-foot">
              <span>
                <Gauge size={13} />
                新增节点合计 {KB_INGEST_RUNS.reduce((s, r) => s + r.graphNodesAdded, 0)} = KB_GRAPH_NODES 长度；新增边合计{' '}
                {KB_INGEST_RUNS.reduce((s, r) => s + r.graphEdgesAdded, 0)} = KB_GRAPH_EDGES 长度；已结束 7 次耗时之和 1321s ÷ 7 = 188.7s = KB_ENGINE.avgIngestSec
              </span>
            </div>
          </div>
        </>
      )}

      {/* ================= 3. 空间与文档 ================= */}
      {tab === 'assets' && (
        <>
          <div className="ac-section-title">知识空间（6）</div>
          <div className="ac-grid-3 ac-kb-space-grid">
            {KB_SPACES.map((sp) => (
              <div className="ac-kb-space" key={sp.id}>
                <div className="ac-kb-space-head">
                  <span className={`ac-avatar ac-avatar--lg ac-avatar--square ${AVATAR_TONE[sp.tone]}`}>
                    <Boxes size={16} />
                  </span>
                  <div className="ac-flex-1">
                    <div className="ac-kb-space-name">{sp.name}</div>
                    <div className="ac-row ac-gap-1 ac-mt-1">
                      <span className="ac-tag ac-tag--sm ac-mono">{sp.id}</span>
                      <span className="ac-tag ac-tag--sm ac-tag--outline">{sp.code}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${ACCESS_META[sp.accessLevel].tone}`}>{ACCESS_META[sp.accessLevel].label}</span>
                    </div>
                  </div>
                  <MiniRing score={sp.qualityScore} tone={sp.tone} />
                </div>
                <div className="ac-kb-space-desc">{sp.desc}</div>
                <div className="ac-kb-space-metrics">
                  <span>
                    <BookOpen size={11} />
                    文档 <strong>{sp.docCount}</strong>
                  </span>
                  <span>
                    <Database size={11} />
                    切片 <strong>{num(sp.chunkCount)}</strong>
                  </span>
                  <span>
                    <Layers size={11} />
                    Token <strong>{sp.tokensK}K</strong>
                  </span>
                  <span>
                    <Search size={11} />
                    命中 <strong>{num(sp.hitCount30d)}</strong>
                  </span>
                </div>
                <dl className="ac-kv ac-kb-kv-tight">
                  <dt>负责人</dt>
                  <dd>
                    <span className="ac-avatar-group">
                      {sp.ownerIds.map((u) => (
                        <span key={u} className={`ac-avatar ac-avatar--xs ${ownerAvatar(u)}`} title={ownerName(u)}>
                          {ownerInitial(u)}
                        </span>
                      ))}
                    </span>{' '}
                    <span className="ac-xs ac-text-2">{sp.ownerIds.map(ownerName).join(' / ')}</span>
                  </dd>
                  <dt>服务环节</dt>
                  <dd>
                    <span className="ac-kb-tag-col">
                      {sp.stageIds.map((s) => (
                        <span key={s} className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(s)]}`}>
                          {stageName(s)}
                        </span>
                      ))}
                    </span>
                  </dd>
                  <dt>自动归档</dt>
                  <dd>
                    <span className={`ac-tag ac-tag--sm ac-tag--${sp.autoArchiveEnabled ? 'ok' : 'neutral'}`}>
                      {sp.autoArchiveEnabled ? '已开启' : '未开启'}
                    </span>
                  </dd>
                  <dt>脱敏策略</dt>
                  <dd className="ac-xs">{sp.redactPolicyId ?? '无需脱敏'}</dd>
                  <dt>嵌入模型</dt>
                  <dd className="ac-mono ac-xs">{sp.embeddingModel}</dd>
                  <dt>质量分</dt>
                  <dd className="ac-tnum">
                    {sp.qualityScore.toFixed(1)} / 100
                    <span className="ac-xs ac-muted">（0.40 覆盖率 + 0.25 新鲜度 + 0.20 命中率 + 0.15 引用有效性）</span>
                  </dd>
                  <dt>过期文档</dt>
                  <dd>
                    {sp.staleDocCount > 0 ? (
                      <span className="ac-tag ac-tag--sm ac-tag--warn">{sp.staleDocCount} 篇超期</span>
                    ) : (
                      <span className="ac-tag ac-tag--sm ac-tag--ok">无</span>
                    )}
                  </dd>
                  <dt>更新时间</dt>
                  <dd className="ac-mono ac-xs">{sp.updatedAt}</dd>
                </dl>
                <div className="ac-kb-ai-actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost ac-btn--sm"
                    onClick={() => {
                      setFSpace(sp.id);
                      setTab('assets');
                    }}
                  >
                    <Filter size={12} />
                    只看本空间文档
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Boxes size={16} />
                空间分布对比
              </span>
              <span className="ac-card-subtitle">文档数 / 切片数 / 近 30 日命中数三维（各维度独立归一化）</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">切片合计 {num(KB_SPACES.reduce((s, x) => s + x.chunkCount, 0))}</span>
              </div>
            </div>
            <div className="ac-card-body">
              <SpaceGroupedBars />
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <BookOpen size={16} />
                知识文档清单
              </span>
              <span className="ac-card-subtitle">当前资产视图 Top {KB_DOCS.length}，KD-01~KD-11 承接存量 RAG 条目、KD-12~KD-20 为本轮自动归档新增</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">
                  命中 {filteredDocs.length} / {KB_DOCS.length}
                </span>
                <button
                  type="button"
                  className="ac-btn ac-btn--ghost ac-btn--sm"
                  onClick={() => {
                    setFSpace('all');
                    setFDocType('all');
                    setFSource('all');
                    setFStage('all');
                    setFEmbed('all');
                    setFAccess('all');
                    setFStale('all');
                    setDocKeyword('');
                  }}
                >
                  <RefreshCw size={12} />
                  重置筛选
                </button>
              </div>
            </div>

            <div className="ac-filter-bar">
              <Search size={14} className="ac-muted" />
              <input
                className="ac-input ac-kb-search"
                value={docKeyword}
                placeholder="搜索编号 / 标题 / 来源引用 / 历史编号 / 关联单据（如 KD-15、REQ-2401、rag-01）"
                onChange={(e) => setDocKeyword(e.target.value)}
              />
              <Filter size={14} className="ac-muted" />
              <select className="ac-select" value={fSpace} onChange={(e) => setFSpace(e.target.value)}>
                <option value="all">全部空间（6）</option>
                {KB_SPACES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={fDocType} onChange={(e) => setFDocType(e.target.value)}>
                <option value="all">全部文档类型</option>
                {docTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={fSource} onChange={(e) => setFSource(e.target.value)}>
                <option value="all">全部来源系统</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={fStage} onChange={(e) => setFStage(e.target.value)}>
                <option value="all">全部环节</option>
                {SDLC_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={fEmbed} onChange={(e) => setFEmbed(e.target.value)}>
                <option value="all">全部嵌入状态</option>
                <option value="ready">已就绪</option>
                <option value="indexing">索引中</option>
                <option value="stale">待更新</option>
                <option value="failed">失败</option>
              </select>
              <select className="ac-select" value={fAccess} onChange={(e) => setFAccess(e.target.value)}>
                <option value="all">全部访问级别</option>
                {ACCESS_ORDER.map((lv) => (
                  <option key={lv} value={lv}>
                    {ACCESS_META[lv].label}
                  </option>
                ))}
              </select>
              <select className="ac-select" value={fStale} onChange={(e) => setFStale(e.target.value)}>
                <option value="all">保鲜状态（全部）</option>
                <option value="fresh">未过期</option>
                <option value="stale">已过期</option>
              </select>
              <select
                className="ac-select"
                value={`${docSort}:${docSortAsc ? 'asc' : 'desc'}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':');
                  setDocSort(k as typeof docSort);
                  setDocSortAsc(d === 'asc');
                }}
              >
                <option value="id:asc">排序：编号 ↑</option>
                <option value="id:desc">排序：编号 ↓</option>
                <option value="chunks:desc">排序：切片数 ↓</option>
                <option value="tokensK:desc">排序：Token ↓</option>
                <option value="hitCount30d:desc">排序：近 30 日命中 ↓</option>
                <option value="citationCount:desc">排序：累计引用 ↓</option>
                <option value="updatedAt:desc">排序：更新时间 ↓</option>
              </select>
            </div>

            <div className="ac-card-body ac-card-body--flush">
              {filteredDocs.length === 0 ? (
                <div className="ac-empty">
                  <span className="ac-empty-icon">
                    <Search size={22} />
                  </span>
                  <div className="ac-empty-title">没有符合条件的知识文档</div>
                  <div className="ac-empty-desc">
                    当前筛选组合下命中 0 篇。知识库共 20 篇文档、6 个空间；若查找的是尚未归档的产物（环境拓扑快照 / 技术债清单），
                    请到「阶段产物归档」标签查看 docId 为 null 的原因说明。
                  </div>
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost ac-btn--sm"
                    onClick={() => {
                      setFSpace('all');
                      setFDocType('all');
                      setFSource('all');
                      setFStage('all');
                      setFEmbed('all');
                      setFAccess('all');
                      setFStale('all');
                      setDocKeyword('');
                    }}
                  >
                    清空全部筛选
                  </button>
                </div>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table ac-table--sm ac-table--bordered">
                    <thead>
                      <tr>
                        <th className="ac-kb-sortable" onClick={() => toggleDocSort('id')}>
                          文档{docSortIcon('id')}
                        </th>
                        <th>所属空间</th>
                        <th>历史编号</th>
                        <th>文档类型</th>
                        <th>来源系统 / 引用</th>
                        <th>所属环节</th>
                        <th>关联业务对象</th>
                        <th>版本 / 基线</th>
                        <th>格式 / 体积</th>
                        <th className="ac-kb-sortable ac-td-right" onClick={() => toggleDocSort('chunks')}>
                          切片 / Token{docSortIcon('chunks')}
                        </th>
                        <th>嵌入状态</th>
                        <th>解析 / OCR</th>
                        <th className="ac-td-right">表·图·码</th>
                        <th>访问级别 / 脱敏</th>
                        <th>负责人 / 创建</th>
                        <th className="ac-kb-sortable ac-td-right" onClick={() => toggleDocSort('hitCount30d')}>
                          命中 / 引用{docSortIcon('hitCount30d')}
                        </th>
                        <th>反馈 / 保鲜</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocs.map((d) => {
                        const sp = KB_SPACES.find((x) => x.id === d.spaceId);
                        return (
                          <tr key={d.id} className="ac-kb-row" onClick={() => setDocDrawer(d)} title="点击查看完整元信息与切片样本">
                            <td>
                              <div className="ac-kb-doc-title">{d.title}</div>
                              <span className="ac-xs ac-muted ac-mono">{d.id}</span>
                            </td>
                            <td>
                              <span className="ac-kb-cell-main">{sp?.name ?? d.spaceId}</span>
                              <span className="ac-xs ac-muted ac-mono ac-kb-cell-sub">{sp?.code ?? ''}</span>
                            </td>
                            <td className="ac-xs">
                              {d.legacyKbId ? (
                                <>
                                  <span className="ac-mono ac-text-2">{d.legacyKbId}</span>
                                  <span className="ac-kb-cell-sub ac-muted ac-mono">{d.legacyRagId}</span>
                                </>
                              ) : (
                                <span className="ac-tag ac-tag--sm ac-tag--ai">本轮新增</span>
                              )}
                            </td>
                            <td>
                              <span className="ac-tag ac-tag--sm ac-tag--outline">{d.docType}</span>
                            </td>
                            <td>
                              <span className="ac-kb-cell-main">{d.sourceSystem}</span>
                              <span className="ac-mono ac-xs ac-muted ac-kb-cell-sub ac-kb-clip">{d.sourceRef}</span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(d.stageId)]}`}>{d.stageName}</span>
                            </td>
                            <td>
                              <span className="ac-kb-tag-col">
                                {d.relatedIds.slice(0, 3).map((rid) => (
                                  <button
                                    key={rid}
                                    type="button"
                                    className="ac-tag ac-tag--sm ac-tag--brand ac-kb-link"
                                    title={`关联业务对象 ${rid}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      jump(rid.startsWith('BUG') ? 'bug' : rid.startsWith('REQ') ? 'requirement' : rid.startsWith('REL') ? 'pipeline' : 'board');
                                    }}
                                  >
                                    {rid}
                                  </button>
                                ))}
                                {d.relatedIds.length > 3 ? <span className="ac-tag ac-tag--sm ac-tag--outline">+{d.relatedIds.length - 3}</span> : null}
                              </span>
                            </td>
                            <td className="ac-xs">
                              <span className="ac-mono ac-text-2">{d.version}</span>
                              {d.isBaseline ? <span className="ac-kb-cell-sub"><span className="ac-tag ac-tag--sm ac-tag--ok">基线</span></span> : null}
                            </td>
                            <td className="ac-xs ac-text-2 ac-nowrap">
                              {d.format} · {num(d.sizeKb)} KB
                              <span className="ac-kb-cell-sub ac-muted">{d.pageCount !== null ? `${d.pageCount} 页` : '无分页'}</span>
                            </td>
                            <td className="ac-td-num ac-xs">
                              {num(d.chunks)} / {d.tokensK}K
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${EMBED_META[d.embedStatus].tone}`}>
                                {d.embedStatus === 'indexing' ? <span className="ac-pulse-dot" /> : null}
                                {EMBED_META[d.embedStatus].label}
                              </span>
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${PARSE_META[d.parseStatus].tone}`}>{PARSE_META[d.parseStatus].label}</span>
                              {d.ocrRequired ? (
                                <span className="ac-kb-cell-sub">
                                  <span className="ac-tag ac-tag--sm ac-tag--warn">
                                    <ScanLine size={11} />
                                    需 OCR
                                  </span>
                                </span>
                              ) : null}
                            </td>
                            <td className="ac-td-num ac-xs">
                              {d.tableCount} · {d.imageCount} · {d.codeBlockCount}
                            </td>
                            <td>
                              <span className={`ac-tag ac-tag--sm ac-tag--${ACCESS_META[d.accessLevel].tone}`}>
                                {d.accessLevel === 'restricted' || d.accessLevel === 'confidential' ? <Lock size={11} /> : null}
                                {ACCESS_META[d.accessLevel].label}
                              </span>
                              {d.redacted ? (
                                <span className="ac-kb-cell-sub">
                                  <span className="ac-tag ac-tag--sm ac-tag--danger">已脱敏</span>
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <span className="ac-avatar-group">
                                {d.ownerIds.slice(0, 3).map((u) => (
                                  <span key={u} className={`ac-avatar ac-avatar--xs ${ownerAvatar(u)}`} title={ownerName(u)}>
                                    {ownerInitial(u)}
                                  </span>
                                ))}
                              </span>
                              <span className="ac-kb-cell-sub">
                                {d.createdBy === 'ai' ? (
                                  <span className="ac-tag ac-tag--sm ac-tag--ai">
                                    <Sparkles size={11} />
                                    AI 生成
                                  </span>
                                ) : (
                                  <span className="ac-xs ac-muted">{ownerName(d.createdBy)}</span>
                                )}
                              </span>
                            </td>
                            <td className="ac-td-num ac-xs">
                              {num(d.hitCount30d)}
                              <span className="ac-kb-cell-sub ac-muted">
                                引用 {d.citationCount} · {d.citedByAgents.length} 个 Agent
                              </span>
                            </td>
                            <td className="ac-xs">
                              <span className={d.feedbackScore >= 4.5 ? 'ac-ok-text ac-semi' : d.feedbackScore >= 4 ? 'ac-text-2' : 'ac-warn-text'}>
                                ★ {d.feedbackScore.toFixed(1)}
                              </span>
                              <span className="ac-kb-cell-sub">
                                {d.staleness.isStale ? (
                                  <span className="ac-tag ac-tag--sm ac-tag--warn">已过期</span>
                                ) : (
                                  <span className="ac-tag ac-tag--sm ac-tag--ok">保鲜中</span>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="ac-card-foot">
              <div className="ac-hint">
                <Link2 size={14} />
                <span>
                  <strong>与既有 RAG 条目的衔接：</strong>本页 {KB_DOCS.length} 篇文档中有 {legacyDocs.length} 篇承接自「AI 能力观测」页的{' '}
                  <code className="ac-kb-code">ragEntries</code>（legacyRagId = rag-01 ~ rag-{String(legacyDocs.length).padStart(2, '0')}，
                  legacyKbId 原样保留 KB-ARCH-01 / KB-CODE-02 / KB-SEC-02 / KB-TEST-03 / KB-OPS-01 / KB-BS-2401 等旧编号作为兼容层），
                  其 chunks / tokensK / embedModel / hitCount30d / embedStatus 与存量值严格一致（如 KD-02 = rag-02：74 片 / 38K token / 命中 246 次）；
                  另 {KB_DOCS.length - legacyDocs.length} 篇（KD-12 ~ KD-20）为本轮 SDLC 事件自动归档的新增产物，
                  与 ragEntries 的 {ragEntries.length} 条存量条目不重复登记。
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 4. 知识图谱 ================= */}
      {tab === 'graph' && (
        <>
          <div className="ac-metric-grid ac-metric-grid--6 ac-mb-0">
            <div className="ac-metric">
              <div className="ac-metric-head">
                <span className="ac-metric-label">图谱节点</span>
                <span className="ac-metric-icon">
                  <Network size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {graphStats.nodes}
                <span className="ac-metric-unit">个</span>
              </div>
              <div className="ac-metric-foot">= Σ 入库执行 graphNodesAdded</div>
            </div>
            <div className="ac-metric ac-metric--info">
              <div className="ac-metric-head">
                <span className="ac-metric-label">关系边</span>
                <span className="ac-metric-icon">
                  <Share2 size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {graphStats.edges}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">端点出现 {graphStats.degreeSum} 次 = 26 × 2</div>
            </div>
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">平均度</span>
                <span className="ac-metric-icon">
                  <Gauge size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {graphStats.avgDegree.toFixed(2)}
                <span className="ac-metric-unit">边/节点</span>
              </div>
              <div className="ac-metric-foot">最高 KG-01 订单上下文 8 条</div>
            </div>
            <div className="ac-metric ac-metric--ai">
              <div className="ac-metric-head">
                <span className="ac-metric-label">AI 抽取占比</span>
                <span className="ac-metric-icon">
                  <Sparkles size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {graphStats.aiEdgePct.toFixed(1)}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">{KB_GRAPH_EDGES.filter((e) => e.aiExtracted).length} 条边由 AI 抽取</div>
            </div>
            <div className="ac-metric ac-metric--ok">
              <div className="ac-metric-head">
                <span className="ac-metric-label">已人工核验</span>
                <span className="ac-metric-icon">
                  <CheckCircle2 size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {graphStats.verifiedPct.toFixed(1)}
                <span className="ac-metric-unit">%</span>
              </div>
              <div className="ac-metric-foot">{graphStats.verified} / {graphStats.edges} 条边 verified</div>
            </div>
            <div className="ac-metric ac-metric--warn">
              <div className="ac-metric-head">
                <span className="ac-metric-label">待复核边</span>
                <span className="ac-metric-icon">
                  <AlertTriangle size={14} />
                </span>
              </div>
              <div className="ac-metric-value">
                {KB_GRAPH_EDGES.filter((e) => !e.verified).length}
                <span className="ac-metric-unit">条</span>
              </div>
              <div className="ac-metric-foot">置信度 &lt; 80% 强制进入复核队列</div>
            </div>
          </div>

          <div className="ac-kb-graph-layout" data-annotation-id="ai-sdlc-knowledge-graph-canvas">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Network size={16} />
                  订单域知识图谱
                </span>
                <span className="ac-card-subtitle">18 节点 / 26 边 · 确定性力导向布局 · 点击节点或边查看详情</span>
                <div className="ac-card-extra">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost ac-btn--sm"
                    onClick={() => {
                      setSelectedNodeId(null);
                      setSelectedEdgeId(null);
                    }}
                  >
                    清除选中
                  </button>
                  <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={incrementalExtract}>
                    <Sparkles size={12} />
                    触发增量抽取
                  </button>
                </div>
              </div>
              <div className="ac-card-body">
                <KnowledgeGraphSvg
                  layout={layout}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={selectedEdgeId}
                  onSelectNode={(id) => {
                    setSelectedNodeId(id);
                    if (id) setSelectedEdgeId(null);
                  }}
                  onSelectEdge={(id) => {
                    setSelectedEdgeId(id);
                    if (id) setSelectedNodeId(null);
                  }}
                />
                {graphHint ? (
                  <div className="ac-hint ac-hint--ok ac-kb-mt">
                    <CheckCircle2 size={14} />
                    <span>{graphHint}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="ac-kb-graph-side">
              {selectedEdge ? (
                <div className="ac-card">
                  <div className="ac-card-head">
                    <span className="ac-card-title">
                      <Share2 size={15} />
                      关系边 {selectedEdge.id}
                    </span>
                    <div className="ac-card-extra">
                      <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setSelectedEdgeId(null)}>
                        收起
                      </button>
                    </div>
                  </div>
                  <div className="ac-card-body">
                    <div className="ac-kb-edge-path">
                      <span className="ac-tag ac-tag--sm ac-tag--brand">
                        {KB_GRAPH_NODES.find((n) => n.id === selectedEdge.from)?.label}
                      </span>
                      <span className="ac-kb-edge-rel" style={{ color: (RELATION_META[selectedEdge.relation] ?? { hex: TONE_HEX.neutral }).hex }}>
                        —{selectedEdge.relation}→
                      </span>
                      <span className="ac-tag ac-tag--sm ac-tag--brand">
                        {KB_GRAPH_NODES.find((n) => n.id === selectedEdge.to)?.label}
                      </span>
                    </div>
                    <dl className="ac-kv ac-kb-kv-tight ac-kb-mt">
                      <dt>权重</dt>
                      <dd className="ac-tnum">{selectedEdge.weight}</dd>
                      <dt>置信度</dt>
                      <dd className="ac-tnum">
                        {selectedEdge.confidencePct}%
                        {selectedEdge.confidencePct < 80 ? <span className="ac-tag ac-tag--sm ac-tag--danger ac-kb-ml">低于 80% 阈值</span> : null}
                      </dd>
                      <dt>抽取方式</dt>
                      <dd>
                        <span className={`ac-tag ac-tag--sm ac-tag--${selectedEdge.aiExtracted ? 'ai' : 'neutral'}`}>
                          {selectedEdge.aiExtracted ? 'AI 抽取' : '人工录入'}
                        </span>
                      </dd>
                      <dt>人工核验</dt>
                      <dd>
                        {selectedEdge.verified ? (
                          <span className="ac-tag ac-tag--sm ac-tag--ok">
                            <CheckCircle2 size={11} />
                            已核验 · {ownerName(selectedEdge.verifiedBy ?? '')}
                          </span>
                        ) : (
                          <span className="ac-tag ac-tag--sm ac-tag--warn">待复核</span>
                        )}
                      </dd>
                      <dt>创建时间</dt>
                      <dd className="ac-mono ac-xs">{selectedEdge.createdAt}</dd>
                      <dt>来源文档</dt>
                      <dd>
                        <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-kb-link" onClick={() => { const d = docById(selectedEdge.evidence.docId); if (d) { setTab('assets'); setDocDrawer(d); } }}>
                          <Link2 size={12} />
                          {selectedEdge.evidence.docId} · {docById(selectedEdge.evidence.docId)?.title ?? ''}
                        </button>
                      </dd>
                      <dt>证据切片</dt>
                      <dd className="ac-mono ac-xs">{selectedEdge.evidence.chunkId}</dd>
                    </dl>
                    <div className="ac-kb-sub-title ac-kb-mt">
                      <FileText size={13} />
                      原文引用（quote）
                    </div>
                    <div className="ac-code ac-code--light ac-kb-quote">
                      <div className="ac-code-head">
                        <span className="ac-code-title">{selectedEdge.evidence.chunkId}</span>
                        <span className="ac-code-lang">{resolveChunkRef(selectedEdge.evidence.chunkId).kind === 'sample' ? '样本切片' : '复合引用'}</span>
                      </div>
                      <div className="ac-code-body">{selectedEdge.evidence.quote}</div>
                    </div>
                  </div>
                </div>
              ) : selectedNode ? (
                <div className="ac-card">
                  <div className="ac-card-head">
                    <span className="ac-card-title">
                      <Network size={15} />
                      {selectedNode.label}
                    </span>
                    <div className="ac-card-extra">
                      <button type="button" className="ac-btn ac-btn--text ac-btn--sm" onClick={() => setSelectedNodeId(null)}>
                        收起
                      </button>
                    </div>
                  </div>
                  <div className="ac-card-body">
                    <dl className="ac-kv ac-kb-kv-tight">
                      <dt>节点 id</dt>
                      <dd className="ac-mono ac-brand-text">{selectedNode.id}</dd>
                      <dt>实体类型</dt>
                      <dd>
                        <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[NODE_TYPE_META[selectedNode.nodeType]?.tone ?? 'neutral']}`}>
                          {selectedNode.nodeType}
                        </span>
                      </dd>
                      <dt>所属层</dt>
                      <dd>{layerName(selectedNode.layer)}</dd>
                      <dt>关联组件</dt>
                      <dd>
                        {selectedNode.componentId ? (
                          <>
                            {ARCH_COMPONENT_MAP[selectedNode.componentId]?.name ?? selectedNode.componentId}
                            <span className="ac-xs ac-muted ac-mono ac-kb-ml">{selectedNode.componentId}</span>
                          </>
                        ) : (
                          <span className="ac-xs ac-muted">无对应架构组件</span>
                        )}
                      </dd>
                      <dt>来源文档</dt>
                      <dd>
                        <span className="ac-kb-tag-col">
                          {selectedNode.docIds.map((d) => (
                            <button
                              key={d}
                              type="button"
                              className="ac-tag ac-tag--sm ac-tag--outline ac-kb-link"
                              title={docById(d)?.title ?? d}
                              onClick={() => {
                                const doc = docById(d);
                                if (doc) {
                                  setTab('assets');
                                  setDocDrawer(doc);
                                }
                              }}
                            >
                              {d}
                            </button>
                          ))}
                        </span>
                      </dd>
                      <dt>degree</dt>
                      <dd className="ac-tnum">
                        {selectedNode.degree}（全库排名第{' '}
                        {[...KB_GRAPH_NODES].sort((a, b) => b.degree - a.degree).findIndex((n) => n.id === selectedNode.id) + 1}）
                      </dd>
                      <dt>weight</dt>
                      <dd className="ac-tnum">{selectedNode.weight}</dd>
                      <dt>首次发现</dt>
                      <dd className="ac-mono ac-xs">{selectedNode.firstSeenAt}</dd>
                      <dt>最近更新</dt>
                      <dd className="ac-mono ac-xs">{selectedNode.lastUpdatedAt}</dd>
                      <dt>AI 抽取</dt>
                      <dd>
                        <span className={`ac-tag ac-tag--sm ac-tag--${selectedNode.aiExtracted ? 'ai' : 'neutral'}`}>
                          {selectedNode.aiExtracted ? `AI 抽取 · 置信度 ${selectedNode.confidencePct}%` : '人工录入 · 置信度 100%'}
                        </span>
                      </dd>
                    </dl>

                    <div className="ac-kb-sub-title ac-kb-mt">
                      <Share2 size={13} />
                      邻接边（{nodeEdges.length}）
                    </div>
                    <div className="ac-kb-adj-list">
                      {nodeEdges.map((e) => {
                        const outgoing = e.from === selectedNode.id;
                        const other = outgoing ? e.to : e.from;
                        return (
                          <button type="button" className="ac-kb-adj" key={e.id} onClick={() => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }}>
                            <span className="ac-kb-adj-dir">{outgoing ? '→' : '←'}</span>
                            <span className="ac-kb-adj-rel" style={{ color: (RELATION_META[e.relation] ?? { hex: TONE_HEX.neutral }).hex }}>
                              {e.relation}
                            </span>
                            <span className="ac-kb-adj-node">{KB_GRAPH_NODES.find((n) => n.id === other)?.label ?? other}</span>
                            <span className={`ac-tag ac-tag--sm ac-tag--${e.verified ? 'ok' : 'warn'}`}>{e.verified ? '已核验' : '待复核'}</span>
                            <span className="ac-xs ac-muted ac-mono ac-ml-auto">{e.confidencePct}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ac-card">
                  <div className="ac-card-head">
                    <span className="ac-card-title">
                      <Search size={15} />
                      图谱详情面板
                    </span>
                  </div>
                  <div className="ac-card-body">
                    <div className="ac-empty ac-empty--sm">
                      <span className="ac-empty-icon">
                        <Network size={20} />
                      </span>
                      <div className="ac-empty-title">未选中节点或关系边</div>
                      <div className="ac-empty-desc">点击图谱中的任意节点查看类型、所属层、关联组件与全部邻接边；点击任意边查看证据切片与原文引用。</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="ac-card">
                <div className="ac-card-head">
                  <span className="ac-card-title">
                    <Activity size={15} />
                    节点类型分布
                  </span>
                </div>
                <div className="ac-card-body">
                  <DonutChart
                    size={158}
                    thickness={22}
                    centerValue={`${graphStats.nodes}`}
                    centerLabel="节点总数"
                    ariaLabel="18 个图谱节点按实体类型的分布环形图"
                    items={nodeTypeDist}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="ac-grid-2-1">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Gauge size={16} />
                  degree 排行
                </span>
                <span className="ac-card-subtitle">18 个节点按连接数降序，KG-01 订单上下文为图谱最大枢纽</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">合计 {graphStats.degreeSum} = 边数 × 2</span>
                </div>
              </div>
              <div className="ac-card-body">
                <DegreeBars />
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Sparkles size={16} />
                  AI 图谱构建
                </span>
                <span className="ac-card-subtitle">对应 WeKnora 能力 WK-06</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-ai-block">
                  <div className="ac-ai-block-title">
                    <Sparkles size={13} />
                    ag-arch / ag-review · 实体与关系抽取流程
                  </div>
                  <div className="ac-kb-ai-list">
                    <p>
                      <strong>1. 实体识别（NER）：</strong>从入库流水线第 3 步「结构化抽取」产出的切片中识别候选实体，
                      按 11 种 nodeType 归类（限界上下文 / 领域概念 / 技术组件 / 接口 / 数据表 / 中间件 / 服务 / 规范 / 缺陷模式 / 人员 / 文档）。
                    </p>
                    <p>
                      <strong>2. 实体链接：</strong>与架构画布的 ARCH_COMPONENTS 做 id 对齐 —— 例如「订单上下文」链接到{' '}
                      <code className="ac-kb-code">ac-order-domain</code>、「多级缓存层」链接到 <code className="ac-kb-code">ac-cache-layer</code>，
                      18 个节点中 {KB_GRAPH_NODES.filter((n) => n.componentId !== null).length} 个成功对齐组件、
                      {KB_GRAPH_NODES.filter((n) => n.layer !== null).length} 个对齐到 ARCH_LAYERS 的四层。
                    </p>
                    <p>
                      <strong>3. 关系抽取：</strong>输出 10 种 relation（依赖 / 包含 / 实现 / 调用 / 约束 / 派生自 / 验证 / 导致 / 归属于 / 替代），
                      每条边强制挂载 evidence（docId + chunkId + 原文 quote）与 confidencePct。
                    </p>
                    <p>
                      <strong>4. 人工复核：</strong>置信度 &lt; 80% 的边进入复核队列，由架构师严慕舟（u-yan）或研发工程师周浩然（u-zhou）确认后 verified 置真；
                      当前 {graphStats.verified} / {graphStats.edges} 条已核验（{(graphStats.verifiedPct).toFixed(1)}%），人工复核通过率 91.7%。
                    </p>
                    <p>
                      <strong>人工如何介入：</strong>图谱构建失败不阻塞检索（向量与 BM25 路仍可用），仅关闭图谱召回路并告警；
                      驳回的边会连同理由回灌为负样本，用于改进下一轮抽取提示词。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Share2 size={16} />
                图谱驱动的检索增强示例（多跳推理）
              </span>
              <span className="ac-card-subtitle">纯向量路无法回答跨上下文影响面，图谱路两跳即可召回</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai">召回 3 篇文档</span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-kb-hop-question">
                <Search size={14} />
                问：{GRAPH_HOP_DEMO.question}
              </div>
              <div className="ac-flow ac-kb-mt">
                {GRAPH_HOP_DEMO.hops.map((h, i) => (
                  <div key={h.step} className="ac-row ac-gap-0">
                    {i > 0 ? (
                      <div className="ac-flow-arrow ac-flow-arrow--ok">
                        <ChevronRight size={15} />
                      </div>
                    ) : null}
                    <div className={`ac-flow-node ac-kb-hop-node ${i === 0 ? 'ac-flow-node--running' : 'ac-flow-node--ok'}`}>
                      <div className="ac-flow-node-head">
                        <span className="ac-flow-node-idx">{h.step}</span>
                        <span className="ac-flow-node-title">{h.edge || '起点定位'}</span>
                        <span className="ac-flow-node-icon">
                          <Network size={13} />
                        </span>
                      </div>
                      <span className="ac-flow-node-meta">{h.text}</span>
                    </div>
                  </div>
                ))}
                <div className="ac-row ac-gap-0">
                  <div className="ac-flow-arrow ac-flow-arrow--ok">
                    <ChevronRight size={15} />
                  </div>
                  <div className="ac-flow-node ac-kb-hop-node ac-flow-node--gate">
                    <div className="ac-flow-node-head">
                      <span className="ac-flow-node-idx">
                        <BookOpen size={12} />
                      </span>
                      <span className="ac-flow-node-title">召回文档</span>
                    </div>
                    <span className="ac-kb-tag-col">
                      {GRAPH_HOP_DEMO.docs.map((d) => (
                        <button
                          key={d}
                          type="button"
                          className="ac-tag ac-tag--sm ac-tag--brand ac-kb-link"
                          title={docById(d)?.title ?? d}
                          onClick={() => {
                            const doc = docById(d);
                            if (doc) {
                              setTab('assets');
                              setDocDrawer(doc);
                            }
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </span>
                  </div>
                </div>
              </div>
              <div className="ac-hint ac-hint--ai ac-kb-mt">
                <Sparkles size={14} />
                <span>{GRAPH_HOP_DEMO.conclusion}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 5. 检索与评测 ================= */}
      {tab === 'retrieval' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-knowledge-retrieval-bench">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Search size={16} />
                检索测试台
              </span>
              <span className="ac-card-subtitle">输入问题后按语义相似度匹配一条真实检索日志，完整还原其多路召回 → 重排 → 命中切片 → 采纳情况</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">阈值 0.72</span>
                <span className="ac-tag ac-tag--ai">重排模型 {KB_ENGINE.rerankModel}</span>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-kb-bench">
                <input
                  className="ac-input ac-kb-bench-input"
                  value={benchQuery}
                  placeholder="输入检索问题，例如：幂等下单 Idempotency-Key 两级校验应如何实现"
                  onChange={(e) => setBenchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runBench();
                  }}
                />
                <select className="ac-select" value={benchType} onChange={(e) => setBenchType(e.target.value as typeof benchType)}>
                  <option value="all">检索类型（不限）</option>
                  <option value="semantic">语义检索</option>
                  <option value="keyword">关键词检索</option>
                  <option value="hybrid">混合检索</option>
                  <option value="graph">图谱检索</option>
                </select>
                <select className="ac-select" value={benchTopK} onChange={(e) => setBenchTopK(Number(e.target.value))}>
                  <option value={3}>topK = 3</option>
                  <option value={5}>topK = 5</option>
                  <option value={8}>topK = 8</option>
                  <option value={10}>topK = 10</option>
                </select>
                <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={runBench}>
                  <Play size={12} />
                  检索
                </button>
              </div>
              <div className="ac-kb-bench-chips">
                <span className="ac-xs ac-muted">试试这些问题：</span>
                {KB_RETRIEVAL_LOGS.slice(0, 6).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="ac-tag ac-tag--sm ac-tag--outline ac-kb-link"
                    onClick={() => {
                      setBenchQuery(l.query);
                      setBenchType('all');
                      setBenchResult({ log: l, score: 1 });
                    }}
                  >
                    {l.id} · {l.query.length > 22 ? `${l.query.slice(0, 21)}…` : l.query}
                  </button>
                ))}
              </div>

              {benchResult === null ? (
                <div className="ac-hint ac-kb-mt">
                  <Search size={14} />
                  <span>
                    输入问题并点击「检索」，测试台会从 {KB_RETRIEVAL_LOGS.length} 条真实检索日志中按二元组相似度匹配最相近的一条，
                    并还原其完整召回链路；本次请求 topK = {benchTopK}，历史日志各自使用其登记时的 topK 配置。
                  </span>
                </div>
              ) : benchResult.log === null ? (
                <div className="ac-empty ac-kb-mt">
                  <span className="ac-empty-icon">
                    <XCircle size={22} />
                  </span>
                  <div className="ac-empty-title">未命中任何历史检索日志</div>
                  <div className="ac-empty-desc">
                    最高二元组相似度仅 {(benchResult.score * 100).toFixed(1)}%，低于匹配阈值 10%。真实检索链路中，若精排后最高分低于 0.72 阈值，
                    同样会返回空结果 —— 例如 KR-13「预生产环境连接池上限」的 topScore 仅 0.61，运维 Agent 因此改调 Prometheus 实时接口，
                    并在结论中标注「非知识库来源」，而不是硬答。
                  </div>
                </div>
              ) : (
                <RetrievalTrace log={benchResult.log} matchPct={benchResult.score} requestedTopK={benchTopK} />
              )}
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ListChecks size={16} />
                检索日志
              </span>
              <span className="ac-card-subtitle">
                {KB_RETRIEVAL_LOGS.filter((l) => l.callerType === 'agent').length} 条 Agent 调用（覆盖全部 7 个 Agent）+{' '}
                {KB_RETRIEVAL_LOGS.filter((l) => l.callerType === 'human').length} 条人工调用
              </span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">被采用 {KB_RETRIEVAL_LOGS.filter((l) => l.used).length}</span>
                <span className="ac-tag ac-tag--ai">抑制幻觉 {KB_RETRIEVAL_LOGS.filter((l) => l.hallucinationSuppressed).length}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>时间</th>
                      <th>查询语句</th>
                      <th>检索类型</th>
                      <th>调用方</th>
                      <th>关联调用链</th>
                      <th>所属环节</th>
                      <th>召回策略</th>
                      <th className="ac-td-right">候选 / 重排后</th>
                      <th>命中切片</th>
                      <th className="ac-td-right">最高分 / 阈值</th>
                      <th className="ac-td-right">时延</th>
                      <th className="ac-td-right">Token 成本</th>
                      <th className="ac-td-center">采用 / 引用</th>
                      <th>反馈</th>
                      <th>幻觉抑制 / 脱敏</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KB_RETRIEVAL_LOGS.map((l) => {
                      const fb = FEEDBACK_META[l.feedback ?? 'none'];
                      return (
                        <tr key={l.id} className="ac-kb-row" onClick={() => setLogDrawer(l)} title="点击查看完整召回链路与命中切片正文">
                          <td className="ac-mono ac-brand-text ac-semi">{l.id}</td>
                          <td className="ac-mono ac-xs ac-text-2 ac-nowrap">{l.at}</td>
                          <td className="ac-kb-query">{l.query}</td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${QUERY_TYPE_META[l.queryType].tone}`}>{QUERY_TYPE_META[l.queryType].label}</span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${CALLER_TYPE_META[l.callerType].tone}`}>
                              {CALLER_TYPE_META[l.callerType].label}
                            </span>
                            <span className="ac-kb-cell-sub">
                              {l.callerType === 'agent' ? (
                                <span className="ac-xs ac-text-2">{agentName(l.callerId)}</span>
                              ) : (
                                <span className="ac-user">
                                  <span className={`ac-avatar ac-avatar--xs ${ownerAvatar(l.callerId)}`}>{ownerInitial(l.callerId)}</span>
                                  <span className="ac-user-name">{ownerName(l.callerId)}</span>
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="ac-xs">
                            {l.agentTraceId ? (
                              <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-kb-link" onClick={(e) => { e.stopPropagation(); jump('ai-observe'); }}>
                                <Link2 size={11} />
                                {l.agentTraceId}
                              </button>
                            ) : (
                              <span className="ac-muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(l.stageId)]}`}>{stageName(l.stageId)}</span>
                          </td>
                          <td className="ac-xs">
                            <span className="ac-kb-tag-col">
                              {l.recallStrategy.map((r) => (
                                <span key={r.type} className="ac-tag ac-tag--sm ac-tag--outline" title={`topK ${r.topK} · 权重 ${r.weight}`}>
                                  {r.type} {r.topK}/{r.weight}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="ac-td-num ac-xs">
                            {l.candidateCount} → {l.rerankedCount}
                          </td>
                          <td className="ac-xs">
                            <span className="ac-kb-tag-col">
                              {l.hitChunkIds.map((h) => {
                                const ref = resolveChunkRef(h);
                                return (
                                  <span
                                    key={h}
                                    className={`ac-tag ac-tag--sm ac-tag--${ref.kind === 'sample' ? 'ai' : 'neutral'}`}
                                    title={ref.kind === 'sample' ? `${ref.docId} 第 ${ref.index} 片（样本切片，可展开正文）` : `${ref.docId} 第 ${ref.index} 片（非样本切片）`}
                                  >
                                    {h}
                                  </span>
                                );
                              })}
                            </span>
                          </td>
                          <td className="ac-td-num ac-xs">
                            <span className={l.topScore >= l.scoreThreshold ? 'ac-ok-text ac-semi' : 'ac-danger-text ac-semi'}>
                              {l.topScore.toFixed(2)}
                            </span>
                            <span className="ac-kb-cell-sub ac-muted">/ {l.scoreThreshold.toFixed(2)}</span>
                          </td>
                          <td className="ac-td-num ac-xs">{l.latencyMs} ms</td>
                          <td className="ac-td-num ac-xs">{l.tokenCost > 0 ? `$${l.tokenCost.toFixed(2)}` : '—'}</td>
                          <td className="ac-td-center">
                            <span className={`ac-tag ac-tag--sm ac-tag--${l.used ? 'ok' : 'danger'}`}>{l.used ? '已采用' : '未采用'}</span>
                            <span className="ac-kb-cell-sub ac-muted">引用 {l.citationCount}</span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${fb.tone}`}>{fb.label}</span>
                          </td>
                          <td>
                            {l.hallucinationSuppressed ? (
                              <span className="ac-tag ac-tag--sm ac-tag--ok">
                                <ShieldCheck size={11} />
                                已抑制
                              </span>
                            ) : (
                              <span className="ac-xs ac-muted">—</span>
                            )}
                            {l.redacted ? (
                              <span className="ac-kb-cell-sub">
                                <span className="ac-tag ac-tag--sm ac-tag--warn">
                                  <Lock size={11} />
                                  已脱敏
                                </span>
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot ac-kb-foot">
              <span>
                <ShieldCheck size={13} />
                命中切片有两种引用形式：<code className="ac-kb-code">KC-xx</code> 为样本切片（紫色标签，可展开真实正文），
                <code className="ac-kb-code">{'{docId}#{chunkIndex}'}</code> 为非样本切片（灰色标签，仅显示编号与所属文档）
              </span>
            </div>
          </div>

          <div className="ac-grid-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Target size={16} />
                  检索质量散点
                </span>
                <span className="ac-card-subtitle">最高相似度得分 × 检索时延（点击圆点打开日志详情）</span>
              </div>
              <div className="ac-card-body">
                <RetrievalScatter logs={KB_RETRIEVAL_LOGS} onPick={(id) => setLogDrawer(KB_RETRIEVAL_LOGS.find((l) => l.id === id) ?? null)} />
                <div className="ac-kb-legend-row">
                  <span className="ac-kb-legend-item">
                    <span className="ac-kb-legend-swatch" style={{ background: TONE_HEX.slate }} />
                    未采用（used=false）
                  </span>
                  <span className="ac-kb-legend-item">
                    <span className="ac-kb-legend-swatch" style={{ background: TONE_HEX.ok }} />
                    抑制幻觉
                  </span>
                  <span className="ac-kb-legend-item">
                    <span className="ac-kb-legend-swatch" style={{ background: TONE_HEX.brand }} />
                    其余按日志语义色
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <BrainCircuit size={16} />
                  Agent 检索覆盖度
                </span>
                <span className="ac-card-subtitle">14 条日志中 agent 调用 12 条，覆盖全部 7 个 Agent；human 2 条</span>
              </div>
              <div className="ac-card-body">
                <AgentRetrievalBars />
                <div className="ac-kb-legend-row">
                  {agents.map((a) => (
                    <span className="ac-kb-legend-item" key={a.id}>
                      <span className="ac-kb-legend-swatch" style={{ background: TONE_HEX[a.tone] }} />
                      {a.name}：样本日志 {agentLogCounts.get(a.id) ?? 0} 条 · 近 30 日 {num(KB_CONSUME_STATS.find((c) => c.agentId === a.id)?.retrievalCount30d ?? 0)} 次
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Gauge size={16} />
                检索评测集
              </span>
              <span className="ac-card-subtitle">3 个黄金评测集合计 {KB_EVAL_SETS.reduce((s, e) => s + e.queryCount, 0)} 问，每周三 22:00 自动回归</span>
              <div className="ac-card-extra">
                <div className="ac-tabs ac-tabs--pill">
                  {EVAL_METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={`ac-tab ${evalMetric === m.key ? 'ac-tab--active' : ''}`}
                      onClick={() => setEvalMetric(m.key)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="ac-card-body">
              <EvalTrendLines metricKey={evalMetric} pct={EVAL_METRICS.find((m) => m.key === evalMetric)?.pct ?? false} />
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>评测集</th>
                      <th className="ac-td-right">查询数</th>
                      <th>金标文档</th>
                      <th className="ac-td-right">recall@5</th>
                      <th className="ac-td-right">recall@10</th>
                      <th className="ac-td-right">MRR</th>
                      <th className="ac-td-right">nDCG@10</th>
                      <th className="ac-td-right">precision@5</th>
                      <th className="ac-td-right">答案忠实度</th>
                      <th className="ac-td-right">平均时延</th>
                      <th>状态</th>
                      <th>最近运行</th>
                      <th className="ac-td-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KB_EVAL_SETS.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div className="ac-kb-cell-main">{e.name}</div>
                          <span className="ac-xs ac-muted ac-mono">{e.id}</span>
                          <span className="ac-xs ac-text-2 ac-kb-cell-sub ac-kb-eval-desc">{e.desc}</span>
                        </td>
                        <td className="ac-td-num">{e.queryCount}</td>
                        <td>
                          <span className="ac-kb-tag-col">
                            {e.goldenDocIds.map((g) => (
                              <button
                                key={g}
                                type="button"
                                className="ac-tag ac-tag--sm ac-tag--outline ac-kb-link"
                                title={docById(g)?.title ?? g}
                                onClick={() => {
                                  const doc = docById(g);
                                  if (doc) {
                                    setTab('assets');
                                    setDocDrawer(doc);
                                  }
                                }}
                              >
                                {g}
                              </button>
                            ))}
                          </span>
                        </td>
                        <td className="ac-td-num">{e.metrics.recallAt5.toFixed(3)}</td>
                        <td className="ac-td-num ac-semi">{e.metrics.recallAt10.toFixed(3)}</td>
                        <td className="ac-td-num">{e.metrics.mrr.toFixed(3)}</td>
                        <td className="ac-td-num">{e.metrics.ndcgAt10.toFixed(3)}</td>
                        <td className="ac-td-num">{e.metrics.precisionAt5.toFixed(3)}</td>
                        <td className="ac-td-num">
                          <span className={e.metrics.answerFaithfulnessPct >= 93 ? 'ac-ok-text' : e.metrics.answerFaithfulnessPct >= 90 ? 'ac-warn-text' : 'ac-danger-text'}>
                            {e.metrics.answerFaithfulnessPct}%
                          </span>
                        </td>
                        <td className="ac-td-num">{e.metrics.avgLatencyMs} ms</td>
                        <td>
                          <span className={`ac-tag ac-tag--sm ac-tag--${e.status === 'active' ? 'ok' : e.status === 'draft' ? 'info' : 'neutral'}`}>
                            {e.status === 'active' ? '生效中' : e.status === 'draft' ? '扩充中' : '已归档'}
                          </span>
                        </td>
                        <td className="ac-mono ac-xs ac-text-2">{evalRuns[e.id] ?? e.lastRunAt}</td>
                        <td className="ac-td-right">
                          <button type="button" className="ac-btn ac-btn--sm ac-btn--ghost" onClick={() => runEval(e.id)}>
                            <Play size={12} />
                            {evalRuns[e.id] ? '已重新运行' : '运行评测'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {KB_EVAL_SETS.map((e) => (
            <div className="ac-card" key={e.id}>
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Workflow size={16} />
                  {e.id} 调优动作时间线
                </span>
                <span className="ac-card-subtitle">{e.name}</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">{e.tuningActions.length} 项调整</span>
                  {evalRuns[e.id] ? <span className="ac-tag ac-tag--ok">最近运行 {evalRuns[e.id]}</span> : null}
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-timeline">
                  {e.tuningActions.map((a, i) => (
                    <div className={`ac-timeline-item ${i === e.tuningActions.length - 1 ? 'ac-timeline-item--ok' : 'ac-timeline-item--ai'}`} key={a}>
                      <div className="ac-timeline-head">
                        <span className="ac-timeline-title">
                          调优 {i + 1}
                        </span>
                        <span className="ac-timeline-time">{e.history[Math.min(i, e.history.length - 1)].at}</span>
                        <span className={`ac-tag ac-tag--sm ac-tag--${i === e.tuningActions.length - 1 ? 'ok' : 'ai'}`}>
                          {i === e.tuningActions.length - 1 ? '当前生效' : '已固化'}
                        </span>
                      </div>
                      <div className="ac-timeline-desc">{a}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ================= 6. 治理与消费 ================= */}
      {tab === 'governance' && (
        <>
          <div className="ac-card" data-annotation-id="ai-sdlc-knowledge-hallucination">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <ShieldCheck size={16} />
                注入知识前后的幻觉率对比
              </span>
              <span className="ac-card-subtitle">本页最有说服力的指标：7 个 Agent 按近 30 日检索次数加权</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ok">
                  加权平均下降 {kbStats.hallucinationReductionPct}%
                </span>
                <span className="ac-tag ac-tag--outline">12.04% → 2.50%</span>
              </div>
            </div>
            <div className="ac-card-body">
              <HallucinationCompare />
              <div className="ac-hint ac-kb-mt">
                <Gauge size={14} />
                <span>
                  <strong>口径说明：</strong>加权平均幻觉率 = Σ(withoutKbPct × retrievalCount30d) ÷ Σ retrievalCount30d；
                  注入前 {(KB_CONSUME_STATS.reduce((s, r) => s + r.withoutKbPct * r.retrievalCount30d, 0) / KB_CONSUME_STATS.reduce((s, r) => s + r.retrievalCount30d, 0)).toFixed(3)}%、
                  注入后 {(KB_CONSUME_STATS.reduce((s, r) => s + r.withKbPct * r.retrievalCount30d, 0) / KB_CONSUME_STATS.reduce((s, r) => s + r.retrievalCount30d, 0)).toFixed(3)}%，
                  相对下降 = (12.038 − 2.496) ÷ 12.038 = {kbStats.hallucinationReductionPct}%，与 kbStats.hallucinationReductionPct 一致（展示时四舍五入为 12.04% / 2.50%）。
                  幻觉的定义：Agent 输出的结论未挂载真实存在的 docId + chunkId，或引文与结论语义不一致，由 kb-gov-05 引用溯源校验器判定。
                </span>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <BrainCircuit size={16} />
                AI 消费统计（近 30 日）
              </span>
              <span className="ac-card-subtitle">7 个 Agent 各一条：检索量 / 采纳率 / 引用 / 幻觉率 / 成本 / 时延影响 / 趋势</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--outline">检索合计 {num(KB_CONSUME_STATS.reduce((s, r) => s + r.retrievalCount30d, 0))}</span>
                <span className="ac-tag ac-tag--ai">引用合计 {num(KB_CONSUME_STATS.reduce((s, r) => s + r.citationCount, 0))}</span>
                <span className="ac-tag ac-tag--warn">Token 成本 ¥{KB_CONSUME_STATS.reduce((s, r) => s + r.tokenCostFromKb, 0).toFixed(1)}</span>
              </div>
            </div>
            <div className="ac-card-body ac-card-body--flush">
              <div className="ac-table-wrap">
                <table className="ac-table ac-table--sm ac-table--bordered">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>所属环节</th>
                      <th className="ac-td-right">检索次数</th>
                      <th className="ac-td-right">平均命中</th>
                      <th className="ac-td-right">topK</th>
                      <th className="ac-td-right">采纳率</th>
                      <th className="ac-td-right">引用次数</th>
                      <th className="ac-td-right">注入前幻觉率</th>
                      <th className="ac-td-right">注入后幻觉率</th>
                      <th className="ac-td-right">下降幅度</th>
                      <th className="ac-td-right">KB Token 成本</th>
                      <th>最常检索空间</th>
                      <th>最常引用文档</th>
                      <th className="ac-td-right">时延影响 / 反馈</th>
                      <th>近 4 周趋势</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KB_CONSUME_STATS.map((r) => {
                      const drop = ((r.withoutKbPct - r.withKbPct) / r.withoutKbPct) * 100;
                      return (
                        <tr key={r.agentId}>
                          <td>
                            <span className="ac-user">
                              <span className={`ac-avatar ac-avatar--sm ac-avatar--square ${AVATAR_TONE[r.tone]}`}>
                                <BrainCircuit size={13} />
                              </span>
                              <span>
                                <span className="ac-user-name">{r.agentName}</span>
                                <span className="ac-user-meta ac-mono">{r.agentId}</span>
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(r.stageId)]}`}>{stageName(r.stageId)}</span>
                          </td>
                          <td className="ac-td-num ac-semi">{num(r.retrievalCount30d)}</td>
                          <td className="ac-td-num">{r.avgHitsPerQuery}</td>
                          <td className="ac-td-num">{r.topKUsed}</td>
                          <td className="ac-td-num">
                            <span className={r.acceptRatePct >= 82 ? 'ac-ok-text' : r.acceptRatePct >= 76 ? 'ac-text-2' : 'ac-warn-text'}>
                              {r.acceptRatePct}%
                            </span>
                          </td>
                          <td className="ac-td-num">{num(r.citationCount)}</td>
                          <td className="ac-td-num">
                            <span className="ac-danger-text ac-semi">{r.withoutKbPct}%</span>
                          </td>
                          <td className="ac-td-num">
                            <span className="ac-ok-text ac-semi">{r.withKbPct}%</span>
                          </td>
                          <td className="ac-td-num">
                            <span className="ac-kb-drop">↓ {drop.toFixed(1)}%</span>
                          </td>
                          <td className="ac-td-num">¥{r.tokenCostFromKb.toFixed(1)}</td>
                          <td>
                            <span className="ac-kb-tag-col">
                              {r.topSpaceIds.map((s, i) => (
                                <span key={s} className={`ac-tag ac-tag--sm ac-tag--${i === 0 ? 'brand' : 'outline'}`} title={spaceName(s)}>
                                  {s}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td>
                            <span className="ac-kb-tag-col">
                              {r.topDocIds.map((d, i) => (
                                <button
                                  key={d}
                                  type="button"
                                  className={`ac-tag ac-tag--sm ac-tag--${i === 0 ? 'ai' : 'outline'} ac-kb-link`}
                                  title={docById(d)?.title ?? d}
                                  onClick={() => {
                                    const doc = docById(d);
                                    if (doc) {
                                      setTab('assets');
                                      setDocDrawer(doc);
                                    }
                                  }}
                                >
                                  {d}
                                </button>
                              ))}
                            </span>
                          </td>
                          <td className="ac-td-num ac-xs">
                            +{r.latencyImpactMs} ms
                            <span className="ac-kb-cell-sub">★ {r.feedbackScore.toFixed(1)}</span>
                          </td>
                          <td>
                            <div className="ac-kb-spark">
                              <WeekSpark points={r.trend} tone={r.tone} />
                              <span className="ac-xs ac-muted">
                                {r.trend[0].week} → {r.trend[r.trend.length - 1].week}
                                <br />
                                采纳 {r.trend[0].acceptRatePct}% → {r.trend[r.trend.length - 1].acceptRatePct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ac-card-foot ac-kb-foot">
              <span>
                <Gauge size={13} />
                latencyImpactMs 为端到端知识注入耗时（检索 + 重排 + 上下文拼装），大于纯检索时延 {kbStats.avgRetrievalMs}ms；
                ag-code 检索量最大（{num(KB_CONSUME_STATS.find((r) => r.agentId === 'ag-code')?.retrievalCount30d ?? 0)} 次）且注入前幻觉率最高（14.2%），是知识库收益最大的消费方
              </span>
            </div>
          </div>

          <div className="ac-section-title">治理策略（6）</div>
          <div className="ac-grid-3 ac-kb-gov-grid">
            {KB_GOVERNANCE.map((g) => (
              <div className="ac-kb-gov" key={g.id}>
                <div className="ac-kb-gov-head">
                  <span className={`ac-avatar ac-avatar--square ${AVATAR_TONE[g.tone]}`}>
                    <ShieldCheck size={15} />
                  </span>
                  <div className="ac-flex-1">
                    <div className="ac-kb-gov-name">{g.name}</div>
                    <div className="ac-row ac-gap-1 ac-mt-1">
                      <span className="ac-tag ac-tag--sm ac-mono">{g.id}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${GOV_STATUS_META[g.status].tone}`}>{GOV_STATUS_META[g.status].label}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${GOV_SCOPE_META[g.scope].tone}`}>{GOV_SCOPE_META[g.scope].label}</span>
                    </div>
                  </div>
                  {g.violationCount30d > 0 ? (
                    <span className="ac-badge ac-badge--danger">{g.violationCount30d}</span>
                  ) : null}
                </div>
                <div className="ac-kb-gov-desc">{g.desc}</div>
                <div className="ac-code ac-code--light ac-kb-expr-block">
                  <div className="ac-code-head">
                    <span className="ac-code-title">ruleExpr</span>
                    <span className="ac-code-lang">{GOV_ENFORCED_META[g.enforcedBy].label}</span>
                  </div>
                  <div className="ac-code-body">{g.ruleExpr}</div>
                </div>
                <dl className="ac-kv ac-kb-kv-tight">
                  <dt>关联策略</dt>
                  <dd>
                    {g.relatedPolicyIds.length > 0 ? (
                      <span className="ac-kb-tag-col">
                        {g.relatedPolicyIds.map((p) => {
                          const eg = egressPolicy.find((x) => x.id === p);
                          const rd = redactRules.find((x) => x.id === p);
                          return (
                            <span
                              key={p}
                              className={`ac-tag ac-tag--sm ac-tag--${eg ? TAG_TONE[eg.tone] : rd ? TAG_TONE[rd.tone] : 'outline'}`}
                              title={eg?.desc ?? rd?.note ?? p}
                            >
                              {p} {eg?.name ?? rd?.name ?? ''}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span className="ac-xs ac-muted">引擎内置策略，无平台侧关联条目</span>
                    )}
                  </dd>
                  <dt>近 30 日违规</dt>
                  <dd className="ac-tnum">
                    {g.violationCount30d} 次
                    {g.lastViolationAt ? <span className="ac-xs ac-muted ac-kb-ml">最近 {g.lastViolationAt}</span> : null}
                  </dd>
                  <dt>审计日志</dt>
                  <dd>
                    <span className="ac-kb-tag-col">
                      {g.auditLogIds.map((a) => {
                        const log = auditLogs.find((x) => x.id === a);
                        return (
                          <button
                            key={a}
                            type="button"
                            className="ac-tag ac-tag--sm ac-tag--outline ac-kb-link"
                            title={log ? `${log.time} · ${log.action}` : a}
                            onClick={() => jump('settings')}
                          >
                            {a}
                          </button>
                        );
                      })}
                    </span>
                  </dd>
                  <dt>负责人</dt>
                  <dd>
                    <span className="ac-avatar-group">
                      {g.ownerIds.map((u) => (
                        <span key={u} className={`ac-avatar ac-avatar--xs ${ownerAvatar(u)}`} title={ownerName(u)}>
                          {ownerInitial(u)}
                        </span>
                      ))}
                    </span>{' '}
                    <span className="ac-xs ac-text-2">{g.ownerIds.map(ownerName).join(' / ')}</span>
                  </dd>
                </dl>
              </div>
            ))}
          </div>

          <div className="ac-grid-3-2">
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <Lock size={16} />
                  分级访问控制矩阵
                </span>
                <span className="ac-card-subtitle">20 篇文档按 accessLevel × 知识空间交叉统计</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--danger">脱敏 {kbStats.redactedDocCount} 篇</span>
                  <span className="ac-tag ac-tag--warn">受限及以上 {kbStats.restrictedDocCount} 篇</span>
                </div>
              </div>
              <div className="ac-card-body">
                <AccessHeatGrid />
                <div className="ac-hint ac-hint--warn ac-kb-mt">
                  <ShieldCheck size={14} />
                  <span>
                    KS-05「运维与发布」为 confidential 级，ag-ops 仅在发布决策上下文中可读原文，其余场景只返回摘要；
                    Agent 使用共享账号 u-ai-copilot 检索时继承调用人的密级，不得越级。近 30 日 kb-gov-03 拦截 3 次越级尝试（al-0020 / al-0002 / al-0025）。
                  </span>
                </div>
              </div>
            </div>

            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title">
                  <FileText size={16} />
                  审计追溯
                </span>
                <span className="ac-card-subtitle">从平台 auditLogs 中筛出与知识库治理策略关联的记录</span>
                <div className="ac-card-extra">
                  <span className="ac-tag ac-tag--outline">{kbAuditLogs.length} 条</span>
                </div>
              </div>
              <div className="ac-card-body">
                <div className="ac-timeline ac-kb-audit">
                  {kbAuditLogs.map((l) => {
                    const gov = KB_GOVERNANCE.find((g) => g.auditLogIds.includes(l.id));
                    return (
                      <div
                        className={`ac-timeline-item ${
                          l.result === 'denied' ? 'ac-timeline-item--danger' : l.result === 'failed' ? 'ac-timeline-item--warn' : 'ac-timeline-item--ok'
                        }`}
                        key={l.id}
                      >
                        <div className="ac-timeline-head">
                          <span className="ac-timeline-title">{l.action}</span>
                          <span className="ac-timeline-time">{l.time}</span>
                          <span className={`ac-tag ac-tag--sm ac-tag--${l.result === 'success' ? 'ok' : l.result === 'denied' ? 'danger' : 'warn'}`}>
                            {l.resultLabel}
                          </span>
                        </div>
                        <div className="ac-timeline-desc">
                          {l.actorName}（{l.roleName}）· {l.category} · {l.targetType} {l.targetId} {l.targetTitle} · IP {l.ip}
                        </div>
                        <div className="ac-timeline-extra">
                          <span className="ac-kb-tag-col">
                            <span className="ac-tag ac-tag--sm ac-mono">{l.id}</span>
                            {gov ? (
                              <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[gov.tone]}`}>
                                关联策略 {gov.id} {gov.name}
                              </span>
                            ) : null}
                          </span>
                          <div className="ac-xs ac-text-2 ac-kb-mt">{l.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title">
                <Scale size={16} />
                知识冲突仲裁区
              </span>
              <span className="ac-card-subtitle">对应治理策略 kb-gov-06：语义相似度 &gt; 0.92 但结论相左的切片需人工裁决后才恢复召回</span>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--warn">待仲裁 1 项</span>
                <button
                  type="button"
                  className="ac-btn ac-btn--sm ac-btn--primary"
                  onClick={() => setConflictOpen(true)}
                  disabled={conflictResolved !== null}
                >
                  <Scale size={12} />
                  {conflictResolved ? '已裁决' : '裁决'}
                </button>
              </div>
            </div>
            <div className="ac-card-body">
              <div className="ac-kb-conflict">
                <div className="ac-kb-conflict-head">
                  <span className="ac-tag ac-tag--sm ac-tag--danger">
                    <AlertTriangle size={11} />
                    {CONFLICT_CASE.id}
                  </span>
                  <span className="ac-kb-cell-main">{CONFLICT_CASE.topic}</span>
                  <span className="ac-tag ac-tag--sm ac-tag--warn">相似度 {CONFLICT_CASE.similarity}</span>
                  <span className="ac-xs ac-muted ac-mono ac-ml-auto">
                    检出自 {CONFLICT_CASE.detectedFrom} · {CONFLICT_CASE.detectedAt}
                  </span>
                </div>
                <div className="ac-kb-conflict-grid">
                  {CONFLICT_CASE.options.map((o) => {
                    const doc = docById(o.docId);
                    const picked = conflictResolved?.docId === o.docId;
                    return (
                      <div className={`ac-kb-conflict-opt ${picked ? 'ac-kb-conflict-opt--picked' : ''}`} key={o.docId}>
                        <div className="ac-kb-conflict-opt-head">
                          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[o.tone]}`}>
                            {o.docId} · {o.version}
                          </span>
                          {picked ? (
                            <span className="ac-tag ac-tag--sm ac-tag--ok">
                              <CheckCircle2 size={11} />
                              已裁定保留
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="ac-btn ac-btn--text ac-btn--sm ac-ml-auto"
                            onClick={() => {
                              if (doc) {
                                setTab('assets');
                                setDocDrawer(doc);
                              }
                            }}
                          >
                            查看文档
                            <ChevronRight size={12} />
                          </button>
                        </div>
                        <div className="ac-kb-conflict-claim">「{o.claim}」</div>
                        <div className="ac-xs ac-muted">
                          来源：{o.from} · 证据切片 <code className="ac-kb-code">{o.chunkRef}</code>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="ac-hint ac-hint--warn ac-kb-mt">
                  <AlertTriangle size={14} />
                  <span>{CONFLICT_CASE.impact}</span>
                </div>
                {conflictResolved ? (
                  <div className="ac-hint ac-hint--ok ac-kb-mt">
                    <CheckCircle2 size={14} />
                    <span>
                      已于 {conflictResolved.at} 裁定保留 {conflictResolved.docId}（{docById(conflictResolved.docId)?.version ?? ''}）为准：
                      另一份文档的冲突切片被标记 superseded 并从召回中降权，图谱对应边 verified 置真并记录裁决人；
                      KR-12 的知识冲突状态解除，架构 Agent 可重新检索该主题。
                    </span>
                  </div>
                ) : null}
                <div className="ac-kb-sub-title ac-kb-mt">
                  <Workflow size={13} />
                  仲裁流程
                </div>
                <div className="ac-flow">
                  {['AI 检测语义冲突', '标记冲突并隔离切片', '通知双方文档负责人', '人工裁决保留版本', '更新图谱 verified 并恢复召回'].map((s, i) => (
                    <div key={s} className="ac-row ac-gap-0">
                      {i > 0 ? (
                        <div className={`ac-flow-arrow ${i < 4 ? 'ac-flow-arrow--ok' : ''}`}>
                          <ChevronRight size={15} />
                        </div>
                      ) : null}
                      <div className={`ac-flow-node ac-kb-arb-node ${i === 3 ? 'ac-flow-node--gate' : i < 3 ? 'ac-flow-node--ok' : 'ac-flow-node--pending'}`}>
                        <div className="ac-flow-node-head">
                          <span className="ac-flow-node-idx">{i + 1}</span>
                          <span className="ac-flow-node-title">{s}</span>
                          <span className="ac-flow-node-icon">
                            {i === 0 ? <Sparkles size={13} /> : i === 3 ? <Scale size={13} /> : <ShieldCheck size={13} />}
                          </span>
                        </div>
                        <span className="ac-flow-node-meta">
                          {i === 0
                            ? 'WeKnora 侧计算切片两两相似度，> 0.92 且结论相左即触发'
                            : i === 1
                              ? 'kb-gov-06 当前为 monitor 模式，只告警不硬隔离'
                              : i === 2
                                ? '飞书通知 KD-01 负责人严慕舟与 KD-14 负责人林知远'
                                : i === 3
                                  ? '人工确认哪份为权威版本，另一份标记 superseded'
                                  : '对应图谱边 verified 置真，KR-12 解除未采用状态'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= 抽屉与弹窗 ================= */}
      <Drawer
        open={artifactDrawer !== null}
        title={artifactDrawer ? `${artifactDrawer.stageName} · ${artifactDrawer.artifactName}` : ''}
        subtitle={artifactDrawer ? `${artifactDrawer.id} · 产物类型 ${artifactDrawer.artifactType} · 目标空间 ${spaceName(artifactDrawer.targetSpaceId)}` : undefined}
        width={720}
        onClose={() => setArtifactDrawer(null)}
      >
        {artifactDrawer ? <ArtifactDetail a={artifactDrawer} onOpenDoc={(d) => { setArtifactDrawer(null); setTab('assets'); setDocDrawer(d); }} /> : null}
      </Drawer>

      <Drawer
        open={ingestDrawer !== null}
        title={ingestDrawer ? `${ingestDrawer.id} · 入库执行详情` : ''}
        subtitle={ingestDrawer ? `${ingestDrawer.startedAt} · ${INGEST_STATUS_META[ingestDrawer.status].label}` : undefined}
        width={700}
        onClose={() => setIngestDrawer(null)}
      >
        {ingestDrawer ? <IngestRunDetail run={ingestDrawer} /> : null}
      </Drawer>

      <Drawer
        open={docDrawer !== null}
        title={docDrawer ? docDrawer.title : ''}
        subtitle={docDrawer ? `${docDrawer.id} · ${spaceName(docDrawer.spaceId)} · ${docDrawer.docType} · ${docDrawer.version}` : undefined}
        width={760}
        onClose={() => setDocDrawer(null)}
      >
        {docDrawer ? <DocDetail d={docDrawer} /> : null}
      </Drawer>

      <Drawer
        open={logDrawer !== null}
        title={logDrawer ? `${logDrawer.id} · 检索详情` : ''}
        subtitle={logDrawer ? `${logDrawer.at} · ${QUERY_TYPE_META[logDrawer.queryType].label} · ${logDrawer.query}` : undefined}
        width={760}
        onClose={() => setLogDrawer(null)}
      >
        {logDrawer ? <RetrievalTrace log={logDrawer} matchPct={null} requestedTopK={null} /> : null}
      </Drawer>

      <Modal
        open={conflictOpen}
        title="知识冲突裁决"
        subtitle={`${CONFLICT_CASE.id} · ${CONFLICT_CASE.topic}`}
        width={680}
        onClose={() => setConflictOpen(false)}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={resolveConflict} disabled={conflictPick === null}>
              <CheckCircle2 size={12} />
              确认裁决并更新图谱
            </button>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setConflictOpen(false)}>
              取消
            </button>
          </>
        }
      >
        <div className="ac-hint ac-hint--warn ac-kb-mb">
          <AlertTriangle size={14} />
          <span>
            两份文档对「{CONFLICT_CASE.topic}」给出矛盾结论（语义相似度 {CONFLICT_CASE.similarity}）。请选择保留哪一份为权威版本：
            被弃用的一份其冲突切片将标记 superseded 并在重排阶段降权，图谱对应边的 verified 置真并记录裁决人（当前登录人 林知远）。
          </span>
        </div>
        <div className="ac-kb-conflict-grid">
          {CONFLICT_CASE.options.map((o) => (
            <label className={`ac-kb-conflict-pick ${conflictPick === o.docId ? 'ac-kb-conflict-pick--on' : ''}`} key={o.docId}>
              <input
                type="radio"
                name="ac-kb-conflict"
                value={o.docId}
                checked={conflictPick === o.docId}
                onChange={() => setConflictPick(o.docId)}
              />
              <span className="ac-kb-conflict-pick-body">
                <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[o.tone]}`}>
                  {o.docId} · {o.version}
                </span>
                <span className="ac-kb-conflict-claim">「{o.claim}」</span>
                <span className="ac-xs ac-muted">
                  {o.from} · 证据切片 <code className="ac-kb-code">{o.chunkRef}</code>
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="ac-hint ac-kb-mt">
          <ShieldCheck size={14} />
          <span>
            裁决结果会写入审计日志（category=知识治理），并通知 {CONFLICT_CASE.options.map((o) => docById(o.docId)?.ownerIds.map(ownerName).join(' / ')).join(' 与 ')}；
            本次为本地乐观更新，不回写数据层。
          </span>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ 详情子组件 */

/** 归档映射详情：完整字段 + 业务理由 + 被哪些检索日志引用 */
function ArtifactDetail({ a, onOpenDoc }: { a: KbStageArtifactDef; onOpenDoc: (d: KbDocDef) => void }) {
  const rule = KB_ARCHIVE_RULES.find((r) => r.id === a.archiveRuleId);
  const doc = docById(a.docId);
  const artifactDocId = a.docId;
  const citingLogs = useMemo(() => {
    if (!artifactDocId) return [];
    return KB_RETRIEVAL_LOGS.filter((l) =>
      l.hitChunkIds.some((h) => h === artifactDocId || h.startsWith(`${artifactDocId}#`) || resolveChunkRef(h).docId === artifactDocId),
    );
  }, [artifactDocId]);
  const sampleChunks = useMemo(() => (artifactDocId ? KB_CHUNKS.filter((c) => c.docId === artifactDocId) : []), [artifactDocId]);

  return (
    <>
      <dl className="ac-kv ac-kb-kv ac-kb-mb">
        <dt>映射 id</dt>
        <dd className="ac-mono ac-brand-text">{a.id}</dd>
        <dt>环节</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(a.stageId)]}`}>
            {SDLC_STAGES.find((s) => s.id === a.stageId)?.code} {a.stageName}
          </span>
          <span className="ac-xs ac-muted ac-kb-ml">门禁 {SDLC_STAGES.find((s) => s.id === a.stageId)?.gateId}</span>
        </dd>
        <dt>产物名</dt>
        <dd>{a.artifactName}</dd>
        <dt>产物类型</dt>
        <dd>
          <span className="ac-tag ac-tag--sm ac-tag--outline">{a.artifactType}</span>
        </dd>
        <dt>自动归档</dt>
        <dd>{a.autoArchive ? '是（事件驱动）' : '否（人工上传）'}</dd>
        <dt>触发事件</dt>
        <dd className="ac-mono ac-xs">{a.archiveTrigger}</dd>
        <dt>归档规则</dt>
        <dd>
          {a.archiveRuleId} · {rule?.name ?? '—'}
          <span className="ac-kb-cell-sub ac-xs ac-text-2">
            动作 {rule ? RULE_ACTION_META[rule.action].label : '—'} · 去重 {rule ? DEDUP_META[rule.dedupStrategy] : '—'} · 优先级 {rule?.priority ?? '—'}
          </span>
        </dd>
        <dt>目标空间</dt>
        <dd>
          {spaceName(a.targetSpaceId)}（{a.targetSpaceId}）
        </dd>
        <dt>生成文档</dt>
        <dd>
          {doc ? (
            <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-kb-link" onClick={() => onOpenDoc(doc)}>
              <Link2 size={12} />
              {doc.id} · {doc.title}
            </button>
          ) : (
            <span className="ac-tag ac-tag--sm ac-tag--warn">
              <AlertTriangle size={11} />
              未产出（docId = null）
            </span>
          )}
        </dd>
        <dt>留存 / 访问</dt>
        <dd>
          {a.retentionDays} 天 ·{' '}
          <span className={`ac-tag ac-tag--sm ac-tag--${ACCESS_META[a.accessLevel].tone}`}>{ACCESS_META[a.accessLevel].label}</span>
        </dd>
        <dt>脱敏</dt>
        <dd>
          {a.redactRequired ? (
            <>
              <span className="ac-tag ac-tag--sm ac-tag--danger">需脱敏</span>
              <span className="ac-kb-tag-col ac-kb-ml">
                {a.redactRuleIds.map((rd) => {
                  const r2 = redactRules.find((x) => x.id === rd);
                  return (
                    <span key={rd} className={`ac-tag ac-tag--sm ac-tag--${r2 ? TAG_TONE[r2.tone] : 'neutral'}`}>
                      {rd} {r2?.name ?? ''}
                    </span>
                  );
                })}
              </span>
            </>
          ) : (
            <span className="ac-xs ac-muted">无需脱敏</span>
          )}
        </dd>
        <dt>消费 Agent</dt>
        <dd>
          <span className="ac-kb-tag-col">
            {a.consumedByAgentIds.map((ag) => (
              <span key={ag} className="ac-tag ac-tag--sm ac-tag--brand">
                {agentName(ag)}
              </span>
            ))}
          </span>
        </dd>
        <dt>切片策略</dt>
        <dd>
          {CHUNK_STRATEGY_META[a.chunkStrategy]?.label ?? a.chunkStrategy}
          <span className="ac-kb-cell-sub ac-xs ac-text-2">{CHUNK_STRATEGY_META[a.chunkStrategy]?.note ?? ''}</span>
        </dd>
        <dt>嵌入模型</dt>
        <dd className="ac-mono ac-xs">{a.embeddingModel}</dd>
        <dt>版本策略</dt>
        <dd>{VERSION_POLICY_META[a.versionPolicy] ?? a.versionPolicy}</dd>
        <dt>最近归档</dt>
        <dd className="ac-mono ac-xs">
          {a.lastArchivedAt} · 累计 {a.archivedCount} 次
        </dd>
      </dl>

      <div className="ac-kb-sub-title">
        <FileText size={13} />
        业务理由（note）
      </div>
      <div className="ac-hint">
        <Layers size={14} />
        <span>{a.note}</span>
      </div>

      <div className="ac-kb-sub-title ac-kb-mt">
        <Search size={13} />
        被哪些检索日志引用过（{citingLogs.length}）
      </div>
      {citingLogs.length === 0 ? (
        <div className="ac-hint ac-hint--warn">
          <AlertTriangle size={14} />
          <span>
            近 30 日的 {KB_RETRIEVAL_LOGS.length} 条检索日志样本中没有命中该产物对应文档的记录；
            样本仅覆盖典型场景，全量命中统计见文档的 hitCount30d 字段。
          </span>
        </div>
      ) : (
        <div className="ac-kb-log-list">
          {citingLogs.map((l) => (
            <div className="ac-kb-log-item" key={l.id}>
              <span className="ac-mono ac-xs ac-brand-text">{l.id}</span>
              <span className={`ac-tag ac-tag--sm ac-tag--${QUERY_TYPE_META[l.queryType].tone}`}>{QUERY_TYPE_META[l.queryType].label}</span>
              <span className="ac-xs ac-text-2 ac-kb-log-query">{l.query}</span>
              <span className="ac-xs ac-muted ac-mono ac-ml-auto">{l.at}</span>
              <span className={`ac-tag ac-tag--sm ac-tag--${l.used ? 'ok' : 'danger'}`}>{l.used ? '已采用' : '未采用'}</span>
            </div>
          ))}
        </div>
      )}

      {sampleChunks.length > 0 ? (
        <>
          <div className="ac-kb-sub-title ac-kb-mt">
            <Database size={13} />
            该文档的样本切片（{sampleChunks.length}）
          </div>
          {sampleChunks.map((c) => (
            <ChunkCard key={c.id} chunkId={c.id} />
          ))}
        </>
      ) : null}
    </>
  );
}

/** 入库执行详情：7 步逐步状态 */
function IngestRunDetail({ run }: { run: KbIngestRunDef }) {
  return (
    <>
      <dl className="ac-kv ac-kb-kv ac-kb-mb">
        <dt>执行编号</dt>
        <dd className="ac-mono ac-brand-text">{run.id}</dd>
        <dt>触发</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${run.triggeredBy === 'event' ? 'ai' : run.triggeredBy === 'schedule' ? 'brand' : 'neutral'}`}>
            {run.triggeredBy === 'event' ? '事件触发' : run.triggeredBy === 'schedule' ? '定时调度' : '人工触发'}
          </span>
          <span className="ac-mono ac-xs ac-kb-ml">{run.triggerRef}</span>
        </dd>
        <dt>涉及文档</dt>
        <dd>
          <span className="ac-kb-tag-col">
            {run.docIds.map((d) => (
              <span key={d} className="ac-tag ac-tag--sm ac-tag--outline" title={docById(d)?.title ?? d}>
                {d} · {docById(d)?.title ?? ''}
              </span>
            ))}
          </span>
        </dd>
        <dt>时间窗口</dt>
        <dd className="ac-mono ac-xs">
          {run.startedAt} → {run.finishedAt ?? '进行中'}（{run.durationSec}s）
        </dd>
        <dt>状态</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${INGEST_STATUS_META[run.status].tone}`}>{INGEST_STATUS_META[run.status].label}</span>
        </dd>
        <dt>产出</dt>
        <dd className="ac-tnum">
          切片 {num(run.totalChunksProduced)} · Token {num(run.totalTokens)} · 成本 ¥{run.costYuan.toFixed(2)}
        </dd>
        <dt>OCR / 图谱</dt>
        <dd className="ac-tnum">
          OCR {run.ocrPages} 页 · 新增节点 {run.graphNodesAdded} · 新增边 {run.graphEdgesAdded}
        </dd>
      </dl>

      <div className="ac-hint ac-kb-mb">
        <Layers size={14} />
        <span>{run.note}</span>
      </div>

      <div className="ac-kb-sub-title">
        <Waypoints size={13} />
        7 步逐步执行状态
      </div>
      <div className="ac-flow-v">
        {run.steps.map((s) => {
          const def = KB_INGEST_STEPS.find((x) => x.id === s.stepId);
          const meta = STEP_RUN_META[s.status];
          return (
            <div className="ac-flow-v-node" key={s.stepId}>
              <div className="ac-flow-v-rail">
                <span className={`ac-flow-v-dot ac-flow-v-dot--${meta.node}`}>{def?.order ?? ''}</span>
                <span className="ac-flow-v-line" />
              </div>
              <div className="ac-flow-v-body">
                <div className="ac-flow-v-title">
                  {def?.name ?? s.stepId}
                  <span className={`ac-tag ac-tag--sm ac-tag--${meta.tone} ac-kb-ml`}>{meta.label}</span>
                  {def ? <span className={`ac-tag ac-tag--sm ac-tag--${INGEST_ENGINE_META[def.engine].tone} ac-kb-ml`}>{INGEST_ENGINE_META[def.engine].label}</span> : null}
                </div>
                <div className="ac-flow-v-desc">
                  <span className="ac-mono ac-xs">
                    {s.startedAt ?? '未开始'} → {s.finishedAt ?? '—'} · {s.durationSec}s · 处理 {num(s.itemsProcessed)} 项
                  </span>
                  {def ? <span className="ac-kb-cell-sub">平均 {def.avgDurationSec}s · 成功率 {def.successRatePct}% · 并发 {def.parallelism}</span> : null}
                  {s.error ? <span className="ac-kb-error">{s.error}</span> : null}
                  {!s.error && def ? <span className="ac-kb-cell-sub ac-muted">降级预案：{def.fallbackAction}</span> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** 文档详情：完整元信息 + 摘要 + 保鲜 + 取代关系 + 图谱节点 + 切片样本 */
function DocDetail({ d }: { d: KbDocDef }) {
  const sp = KB_SPACES.find((x) => x.id === d.spaceId);
  const sampleChunks = useMemo(() => KB_CHUNKS.filter((c) => c.docId === d.id), [d.id]);
  const artifacts = useMemo(() => KB_STAGE_ARTIFACT_MAP.filter((a) => a.docId === d.id), [d.id]);
  const nodeCount = d.chunks;

  return (
    <>
      <div className="ac-ai-block ac-kb-mb">
        <div className="ac-ai-block-title">
          <BookOpen size={13} />
          文档摘要（summary）
        </div>
        <div className="ac-mt-2">{d.summary}</div>
      </div>

      <dl className="ac-kv ac-kb-kv ac-kb-mb">
        <dt>文档编号</dt>
        <dd className="ac-mono ac-brand-text">{d.id}</dd>
        <dt>所属空间</dt>
        <dd>
          {sp?.name ?? d.spaceId}（{d.spaceId} · {sp?.code ?? ''}）
        </dd>
        <dt>历史编号</dt>
        <dd>
          {d.legacyKbId ? (
            <>
              <span className="ac-mono ac-xs">{d.legacyKbId}</span>
              <span className="ac-xs ac-muted ac-kb-ml">承接自 ragEntries 的 {d.legacyRagId}</span>
            </>
          ) : (
            <span className="ac-tag ac-tag--sm ac-tag--ai">本轮 SDLC 自动归档新增</span>
          )}
        </dd>
        <dt>类型 / 环节</dt>
        <dd>
          <span className="ac-tag ac-tag--sm ac-tag--outline">{d.docType}</span>{' '}
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(d.stageId)]}`}>{d.stageName}</span>
        </dd>
        <dt>来源</dt>
        <dd>
          {d.sourceSystem}
          <span className="ac-kb-cell-sub ac-mono ac-xs ac-text-2">{d.sourceRef}</span>
        </dd>
        <dt>关联对象</dt>
        <dd>
          <span className="ac-kb-tag-col">
            {d.relatedIds.map((rid) => (
              <button
                key={rid}
                type="button"
                className="ac-tag ac-tag--sm ac-tag--brand ac-kb-link"
                onClick={() => jump(rid.startsWith('BUG') ? 'bug' : rid.startsWith('REQ') ? 'requirement' : rid.startsWith('REL') ? 'pipeline' : 'board')}
              >
                {rid}
              </button>
            ))}
          </span>
        </dd>
        <dt>版本</dt>
        <dd>
          <span className="ac-mono">{d.version}</span>{' '}
          {d.isBaseline ? <span className="ac-tag ac-tag--sm ac-tag--ok">基线版本</span> : <span className="ac-xs ac-muted">非基线</span>}
        </dd>
        <dt>格式规模</dt>
        <dd className="ac-tnum">
          {d.format} · {num(d.sizeKb)} KB · {d.pageCount !== null ? `${d.pageCount} 页` : '无分页'} · 表格 {d.tableCount} · 图片 {d.imageCount} · 代码块{' '}
          {d.codeBlockCount}
        </dd>
        <dt>切片 / Token</dt>
        <dd className="ac-tnum">
          {num(d.chunks)} 片 · {d.tokensK}K token（均 {Math.round((d.tokensK * 1000) / Math.max(d.chunks, 1))} token/片）
        </dd>
        <dt>嵌入</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${EMBED_META[d.embedStatus].tone}`}>{EMBED_META[d.embedStatus].label}</span>{' '}
          <span className={`ac-tag ac-tag--sm ac-tag--${PARSE_META[d.parseStatus].tone}`}>{PARSE_META[d.parseStatus].label}</span>{' '}
          <span className="ac-mono ac-xs">{d.embedModel}</span>
          {d.ocrRequired ? (
            <span className="ac-tag ac-tag--sm ac-tag--warn ac-kb-ml">
              <ScanLine size={11} />
              需 OCR
            </span>
          ) : null}
        </dd>
        <dt>访问 / 脱敏</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${ACCESS_META[d.accessLevel].tone}`}>{ACCESS_META[d.accessLevel].label}</span>{' '}
          {d.redacted ? (
            <>
              <span className="ac-tag ac-tag--sm ac-tag--danger">已脱敏</span>
              <span className="ac-kb-tag-col ac-kb-ml">
                {d.redactedFields.map((f) => {
                  const rd = redactRules.find((r) => r.field === f || r.name.includes(f));
                  return (
                    <span key={f} className="ac-tag ac-tag--sm ac-tag--outline" title={rd?.note ?? f}>
                      {f}
                      {rd ? ` (${rd.id})` : ''}
                    </span>
                  );
                })}
              </span>
            </>
          ) : (
            <span className="ac-xs ac-muted">未脱敏</span>
          )}
        </dd>
        <dt>负责人</dt>
        <dd>
          <span className="ac-avatar-group">
            {d.ownerIds.map((u) => (
              <span key={u} className={`ac-avatar ac-avatar--xs ${ownerAvatar(u)}`} title={ownerName(u)}>
                {ownerInitial(u)}
              </span>
            ))}
          </span>{' '}
          <span className="ac-xs ac-text-2">{d.ownerIds.map(ownerName).join(' / ')}</span>
        </dd>
        <dt>创建方式</dt>
        <dd>
          {d.createdBy === 'ai' ? (
            <span className="ac-tag ac-tag--sm ac-tag--ai">
              <Sparkles size={11} />
              AI 生成
            </span>
          ) : (
            <span className="ac-xs ac-text-2">人工创建 · {ownerName(d.createdBy)}</span>
          )}
        </dd>
        <dt>时间线</dt>
        <dd className="ac-mono ac-xs">
          创建 {d.createdAt} · 更新 {d.updatedAt} · 最近归档 {d.lastArchivedAt}
        </dd>
        <dt>消费情况</dt>
        <dd className="ac-tnum">
          近 30 日命中 {num(d.hitCount30d)} 次 · 累计引用 {d.citationCount} 次 · 反馈 ★{d.feedbackScore.toFixed(1)}
          <span className="ac-kb-cell-sub">
            <span className="ac-kb-tag-col">
              {d.citedByAgents.map((ag) => (
                <span key={ag} className="ac-tag ac-tag--sm ac-tag--brand">
                  {agentName(ag)}
                </span>
              ))}
            </span>
          </span>
        </dd>
        <dt>图谱节点</dt>
        <dd>
          {d.graphNodeIds.length > 0 ? (
            <span className="ac-kb-tag-col">
              {d.graphNodeIds.map((g) => {
                const node = KB_GRAPH_NODES.find((x) => x.id === g);
                return (
                  <span key={g} className="ac-tag ac-tag--sm ac-tag--ai" title={node ? `${node.label} · ${node.nodeType} · degree ${node.degree}` : g}>
                    {g} {node?.label ?? ''}
                  </span>
                );
              })}
            </span>
          ) : (
            <span className="ac-xs ac-muted">未贡献图谱节点</span>
          )}
        </dd>
        <dt>归档来源</dt>
        <dd>
          {artifacts.length > 0 ? (
            <span className="ac-kb-tag-col">
              {artifacts.map((a) => (
                <span key={a.id} className="ac-tag ac-tag--sm ac-tag--outline" title={a.note}>
                  {a.id} · {a.artifactName}
                </span>
              ))}
            </span>
          ) : (
            <span className="ac-xs ac-muted">存量文档，非本轮阶段产物归档生成</span>
          )}
        </dd>
      </dl>

      <div className="ac-kb-sub-title">
        <RefreshCw size={13} />
        保鲜信息（staleness）
      </div>
      <dl className="ac-kv ac-kb-kv-tight ac-kb-mb">
        <dt>最近核验</dt>
        <dd className="ac-mono ac-xs">{d.staleness.lastVerifiedAt}</dd>
        <dt>核验周期</dt>
        <dd>{d.staleness.verifyCycleDays} 天</dd>
        <dt>是否过期</dt>
        <dd>
          {d.staleness.isStale ? (
            <span className="ac-tag ac-tag--sm ac-tag--warn">
              <AlertTriangle size={11} />
              已过期
            </span>
          ) : (
            <span className="ac-tag ac-tag--sm ac-tag--ok">保鲜中</span>
          )}
        </dd>
        <dt>过期原因</dt>
        <dd className="ac-xs">{d.staleness.staleReason ?? '—'}</dd>
        <dt>被取代</dt>
        <dd>
          {d.supersededBy ? (
            <span className="ac-tag ac-tag--sm ac-tag--danger">
              已由 {d.supersededBy} 取代，本文档同时从检索索引下线
            </span>
          ) : (
            <span className="ac-xs ac-muted">未被取代，仍为当前有效版本</span>
          )}
        </dd>
      </dl>

      <div className="ac-kb-sub-title">
        <Database size={13} />
        切片样本预览
      </div>
      {sampleChunks.length > 0 ? (
        sampleChunks.map((c) => <ChunkCard key={c.id} chunkId={c.id} />)
      ) : (
        <div className="ac-hint">
          <Database size={14} />
          <span>
            样本切片未展开，共 {num(nodeCount)} 片（KB_CHUNKS 仅收录 {KB_CHUNKS.length} 条样本切片用于演示，本文档未被收录）。
            切片策略为 {CHUNK_STRATEGY_META[artifacts[0]?.chunkStrategy ?? 'heading']?.label ?? '标题层级切片'}，
            平均切片长度约 {Math.round((d.tokensK * 1000) / Math.max(d.chunks, 1))} token；实际检索时按 headingPath 与 position 定位原文。
          </span>
        </div>
      )}
    </>
  );
}

/** 切片卡片：样本切片展开真实 content，复合引用只显示编号与所属文档 */
function ChunkCard({ chunkId }: { chunkId: string }) {
  const ref = resolveChunkRef(chunkId);
  if (ref.kind === 'compound') {
    const doc = docById(ref.docId);
    return (
      <div className="ac-kb-chunk ac-kb-chunk--compound">
        <div className="ac-kb-chunk-head">
          <span className="ac-tag ac-tag--sm ac-tag--neutral">{ref.ref}</span>
          <span className="ac-xs ac-muted">
            非样本切片 · 所属文档 {ref.docId}
            {ref.index >= 0 ? ` 第 ${ref.index} 片` : ''}
          </span>
          {doc ? <span className="ac-xs ac-text-2 ac-ml-auto">{doc.title}</span> : null}
        </div>
        <div className="ac-xs ac-muted ac-kb-chunk-note">
          该切片未收录进 KB_CHUNKS 样本集，正文不在此展开；检索命中时由 WeKnora 按 docId + chunkIndex 实时回源取原文并做引用溯源校验。
        </div>
      </div>
    );
  }
  return (
    <div className="ac-kb-chunk">
      <div className="ac-kb-chunk-head">
        <span className="ac-tag ac-tag--sm ac-tag--ai">{ref.ref}</span>
        <span className="ac-xs ac-muted ac-mono">
          {ref.docId} #{ref.index} · {ref.tokenCount} token
        </span>
        <span className="ac-tag ac-tag--sm ac-tag--outline">{CHUNK_STRATEGY_META[ref.strategy]?.label ?? ref.strategy}</span>
        <span className="ac-xs ac-text-2 ac-ml-auto">{ref.headingPath.join(' / ')}</span>
      </div>
      <div className="ac-code ac-code--light ac-kb-chunk-body">
        <div className="ac-code-body">{ref.content}</div>
      </div>
    </div>
  );
}

/** 检索链路还原：多路召回 → 重排 → 命中切片 → 采纳情况 */
function RetrievalTrace({
  log,
  matchPct,
  requestedTopK,
}: {
  log: KbRetrievalLogDef;
  matchPct: number | null;
  requestedTopK: number | null;
}) {
  const aboveThreshold = log.topScore >= log.scoreThreshold;
  return (
    <>
      {matchPct !== null ? (
        <div className="ac-hint ac-hint--ai ac-kb-mt">
          <Sparkles size={14} />
          <span>
            已匹配到最相近的真实检索日志 <strong>{log.id}</strong>（二元组相似度 {(matchPct * 100).toFixed(1)}%）
            {requestedTopK !== null ? `；本次请求 topK = ${requestedTopK}，该历史日志登记的重排后数量为 ${log.rerankedCount}` : ''}
            。以下为该次检索的完整还原。
          </span>
        </div>
      ) : null}

      <dl className="ac-kv ac-kb-kv ac-kb-mt">
        <dt>日志编号</dt>
        <dd className="ac-mono ac-brand-text">{log.id}</dd>
        <dt>时间</dt>
        <dd className="ac-mono ac-xs">{log.at}</dd>
        <dt>查询语句</dt>
        <dd>{log.query}</dd>
        <dt>检索类型</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${QUERY_TYPE_META[log.queryType].tone}`}>{QUERY_TYPE_META[log.queryType].label}</span>
        </dd>
        <dt>调用方</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${CALLER_TYPE_META[log.callerType].tone}`}>{CALLER_TYPE_META[log.callerType].label}</span>{' '}
          {log.callerType === 'agent' ? (
            <span className="ac-xs ac-text-2">
              {agentName(log.callerId)}（{log.callerId}）
            </span>
          ) : (
            <span className="ac-user">
              <span className={`ac-avatar ac-avatar--xs ${ownerAvatar(log.callerId)}`}>{ownerInitial(log.callerId)}</span>
              <span className="ac-user-name">{ownerName(log.callerId)}</span>
            </span>
          )}
        </dd>
        <dt>关联调用链</dt>
        <dd>
          {log.agentTraceId ? (
            <button type="button" className="ac-btn ac-btn--text ac-btn--sm ac-kb-link" onClick={() => jump('ai-observe')}>
              <Link2 size={12} />
              {log.agentTraceId}（在「AI 能力观测」页查看完整调用链）
            </button>
          ) : (
            <span className="ac-xs ac-muted">无关联 Agent 轨迹</span>
          )}
        </dd>
        <dt>所属环节</dt>
        <dd>
          <span className={`ac-tag ac-tag--sm ac-tag--${TAG_TONE[stageTone(log.stageId)]}`}>{stageName(log.stageId)}</span>
        </dd>
        <dt>重排模型</dt>
        <dd className="ac-mono ac-xs">{log.rerankModel}</dd>
        <dt>时延 / 成本</dt>
        <dd className="ac-tnum">
          {log.latencyMs} ms · {log.tokenCost > 0 ? `$${log.tokenCost.toFixed(2)}` : '人工调用不计费'}
        </dd>
      </dl>

      <div className="ac-kb-sub-title ac-kb-mt">
        <Workflow size={13} />
        召回链路
      </div>
      <div className="ac-flow">
        {log.recallStrategy.map((r, i) => (
          <Fragment key={r.type}>
            {i > 0 ? (
              <div className="ac-flow-arrow">
                <ChevronRight size={15} />
              </div>
            ) : null}
            <div className="ac-flow-node ac-kb-recall-node ac-flow-node--running">
              <div className="ac-flow-node-head">
                <span className="ac-flow-node-idx">{i + 1}</span>
                <span className="ac-flow-node-title">
                  {r.type === 'vector' ? '向量召回' : r.type === 'bm25' ? 'BM25 召回' : '图谱召回'}
                </span>
                <span className="ac-flow-node-icon">
                  <Search size={13} />
                </span>
              </div>
              <span className="ac-flow-node-meta">
                topK {r.topK} · 权重 {r.weight}
                <br />
                {r.type === 'vector'
                  ? '语义相似（bge-large-zh-v1.5，1024 维）'
                  : r.type === 'bm25'
                    ? '术语与编号精确匹配（API-03 / BUG-1043）'
                    : '多跳关系扩展（NebulaGraph）'}
              </span>
            </div>
          </Fragment>
        ))}
        <div className="ac-flow-arrow ac-flow-arrow--ok">
          <ChevronRight size={15} />
        </div>
        <div className="ac-flow-node ac-kb-recall-node ac-flow-node--ok">
          <div className="ac-flow-node-head">
            <span className="ac-flow-node-idx">
              <Target size={12} />
            </span>
            <span className="ac-flow-node-title">融合 + 重排</span>
          </div>
          <span className="ac-flow-node-meta">
            候选 {log.candidateCount} → 重排后 {log.rerankedCount}
            <br />
            cross-encoder 精排，stale 文档降权 0.6
          </span>
        </div>
        <div className="ac-flow-arrow ac-flow-arrow--ok">
          <ChevronRight size={15} />
        </div>
        <div className={`ac-flow-node ac-kb-recall-node ${log.used ? 'ac-flow-node--ok' : 'ac-flow-node--failed'}`}>
          <div className="ac-flow-node-head">
            <span className="ac-flow-node-idx">
              {log.used ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            </span>
            <span className="ac-flow-node-title">{log.used ? '被 AI 采用' : '未采用'}</span>
          </div>
          <span className="ac-flow-node-meta">
            最高分 {log.topScore.toFixed(2)} {aboveThreshold ? '≥' : '<'} 阈值 {log.scoreThreshold.toFixed(2)}
            <br />
            引用 {log.citationCount} 条 · 反馈 {FEEDBACK_META[log.feedback ?? 'none'].label}
          </span>
        </div>
      </div>

      <div className="ac-kb-sub-title ac-kb-mt">
        <Database size={13} />
        命中切片（{log.hitChunkIds.length}）
      </div>
      {log.hitChunkIds.map((h) => <ChunkCard key={h} chunkId={h} />)}

      <div className="ac-kb-sub-title ac-kb-mt">
        <Gauge size={13} />
        得分与阈值
      </div>
      <div className="ac-kb-score-row">
        <div className="ac-progress ac-progress--lg">
          <div
            className={`ac-progress-bar ${aboveThreshold ? 'ac-progress-bar--ok' : 'ac-progress-bar--danger'}`}
            style={{ width: `${Math.min(log.topScore * 100, 100)}%` }}
          />
        </div>
        <span className="ac-kb-score-value">{log.topScore.toFixed(2)}</span>
        <span className={`ac-tag ac-tag--sm ac-tag--${aboveThreshold ? 'ok' : 'danger'}`}>
          阈值 {log.scoreThreshold.toFixed(2)} · {aboveThreshold ? '通过' : '未通过'}
        </span>
      </div>

      {log.hallucinationSuppressed ? (
        <div className="ac-hint ac-hint--ok ac-kb-mt">
          <ShieldCheck size={14} />
          <span>
            <strong>幻觉已抑制：</strong>本次检索触发了引用溯源校验（kb-gov-05），拦截了模型初稿中不成立或无索引依据的结论，
            强制要求补充证据后才放行。这正是「注入知识后幻觉率降至 2.50%」的直接机制。
          </span>
        </div>
      ) : null}

      {!log.used ? (
        <div className="ac-hint ac-hint--danger ac-kb-mt">
          <XCircle size={14} />
          <span>
            <strong>未采用原因：</strong>
            {log.id === 'KR-12'
              ? 'KD-01（v1.8 Confluence 基线）与 KD-14（v2.0 G2 冻结版）对 outbox 重试次数描述冲突（5 次 vs 3 次），语义相似度 0.93 触发知识冲突仲裁（kb-gov-06），策略要求人工确认前不得注入；架构 Agent 放弃本次召回，改为发起澄清工单。可到「治理与消费」标签的仲裁区裁决。'
              : log.id === 'KR-13'
                ? '连接池上限属运行态数据，不在知识库范围内：知识库只有静态发布归档包 KD-19，且相关字段已按 rd-08 脱敏；topScore 0.61 低于阈值 0.72，无候选通过精排。运维 Agent 转而调用 Prometheus 实时接口取数，并在结论中标注「非知识库来源」。'
                : '召回结果未被 AI 采用。'}
          </span>
        </div>
      ) : null}

      <div className="ac-kb-sub-title ac-kb-mt">
        <FileText size={13} />
        业务说明（note）
      </div>
      <div className="ac-hint">
        <Layers size={14} />
        <span>{log.note}</span>
      </div>

      {log.redacted ? (
        <div className="ac-hint ac-hint--warn ac-kb-mt">
          <Lock size={14} />
          <span>
            本次召回内容含敏感字段，出域前已按 SEC-MASK-2.1（redactRules）脱敏；
            Agent 使用共享账号 u-ai-copilot 检索时继承调用人的密级，不得越级读取 restricted / confidential 原文。
          </span>
        </div>
      ) : null}
    </>
  );
}
