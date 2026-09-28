/**
 * 需求工作台（pageId: requirement）
 *
 * 区块（左右两栏）：
 *  1. 左栏 Brainstorm 对话区（需求选择 + 模拟 SSE 流式输出 + 生成 PRD / 重新生成）
 *  2. 右栏 PRD 产物区（PRD 版本切换、差异摘要、四分区正文、提交评审）
 *  3. 评审意见面板（PRD_REVIEWS，采纳 / 拒绝本地闭环 + 点击定位故事高亮滚动）
 *  4. 「交给架构 Agent 拆解」Modal（确认入队 → 逐条进度 → 跳转架构设计）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  GitBranch,
  Layers,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Play,
  RefreshCw,
  Rocket,
  Send,
  SkipForward,
  Sparkles,
  Square,
  User,
  X,
  Zap,
} from 'lucide-react';
import Modal from '../components/Modal';
import {
  BRAINSTORM_SCRIPT,
  CURRENT_SPRINT,
  CURRENT_USER,
  PRD_REVIEWS,
  PRD_VERSIONS,
  REQUIREMENTS,
  REQUIREMENT_MAP,
  TASKS,
  TODAY,
  USER_MAP,
  USER_STORIES,
  USERS,
} from '../data';
import type { BrainstormMsg, RequirementDef, Tone, UserStoryDef } from '../data';
import './requirement.css';

/* ------------------------------------------------------------------ 常量 */

/** tone → style.css 已覆盖的 tag 语义色（未覆盖的色相做降级映射） */
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

/** 需求状态 → 语义色 */
const REQ_STATUS_TONE: Record<RequirementDef['status'], string> = {
  backlog: 'neutral',
  refined: 'info',
  taskCreated: 'info',
  dev: 'brand',
  testGreen: 'ok',
  committed: 'ok',
  deployed: 'ok',
  qa: 'ai',
  bugfix: 'warn',
  released: 'ok',
};

const PRIORITY_BADGE: Record<'P0' | 'P1' | 'P2', string> = {
  P0: 'ac-badge--danger',
  P1: 'ac-badge--warn',
  P2: 'ac-badge--neutral',
};

const RISK_META: Record<RequirementDef['risk'], { label: string; tone: string }> = {
  high: { label: '高风险', tone: 'danger' },
  medium: { label: '中风险', tone: 'warn' },
  low: { label: '低风险', tone: 'ok' },
};

const ARTIFACT_LABEL: Record<string, string> = {
  requirement: '需求',
  story: '用户故事',
  ac: '验收标准',
  risk: '风险',
  decision: '决策',
  analysis: '分析报告',
};

/** 评审意见本地处理状态 */
type ReviewState = 'pending' | 'adopted' | 'rejected';

const REVIEW_STATE_META: Record<ReviewState, { label: string; tone: string }> = {
  pending: { label: '待处理', tone: 'warn' },
  adopted: { label: '已采纳', tone: 'ok' },
  rejected: { label: '已拒绝', tone: 'neutral' },
};

/** 版本变更条目 → 新增 / 修改 / 删除（数据层为扁平字符串，按描述前缀启发式归类） */
function changeKind(text: string): 'add' | 'mod' | 'del' {
  if (/^(新增|新建|补充|纳入)/u.test(text)) return 'add';
  if (/^(删除|移除|下线|废弃)/u.test(text)) return 'del';
  return 'mod';
}

const CHANGE_KIND_META = {
  add: { label: '新增', tone: 'ok' },
  mod: { label: '修改', tone: 'info' },
  del: { label: '删除', tone: 'danger' },
} as const;

/** Brainstorm 消息 → 气泡类型（数据层无 type 字段，按角色与产物语义归类） */
function bubbleKind(m: BrainstormMsg): 'user' | 'system' | 'ask' | 'gen' | 'result' {
  if (m.role === 'user') return 'user';
  if (m.role === 'system') return 'system';
  if (m.artifacts && m.artifacts.length > 0) return 'gen';
  if (/(本轮.*(结束|汇总)|产出汇总|待确认项)/u.test(m.content)) return 'result';
  return 'ask';
}

/** 评论内容 → 定位到的用户故事编号（数据层无该字段，按编号 / 需求编号 / 故事标题匹配） */
function locateStory(text: string): string | null {
  const us = text.match(/US-\d{2}/u);
  if (us) return us[0];
  const req = text.match(/REQ-\d{4}/u);
  if (req) {
    const target = REQUIREMENT_MAP[req[0]];
    if (target && target.storyIds.length > 0) return target.storyIds[0];
  }
  const byTitle = USER_STORIES.find((s) => text.includes(s.title));
  return byTitle ? byTitle.id : null;
}

const BASELINE_VERSION = PRD_VERSIONS[PRD_VERSIONS.length - 1];
const BASELINE_VERSION_ID = BASELINE_VERSION.id;

/** Brainstorm 回放总条数，播完即视为 PRD 草稿落地 */
const SCRIPT_TOTAL = BRAINSTORM_SCRIPT.length;

/** PRD 草稿的四个分区（生成中态用于说明将要落地的内容） */
const PRD_SECTIONS = ['背景与目标', '用户故事列表', '非功能需求', '开放问题'];

/** 可提交评审的人员池（产品 / 架构 / 测试 / PMO / 运维） */
const REVIEWER_POOL = USERS.filter(
  (u) => !u.isAi && ['product', 'architect', 'tester', 'pmo', 'ops'].includes(u.roleId),
);

/* ------------------------------------------------------------------ 页面 */

export default function RequirementPage() {
  const [selectedReqId, setSelectedReqId] = useState<string>(REQUIREMENTS[0].id);
  const [prdVersionId, setPrdVersionId] = useState<string>(BASELINE_VERSION_ID);
  const [checkedGwt, setCheckedGwt] = useState<string[]>([]);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [reviewStates, setReviewStates] = useState<Record<string, ReviewState>>({});
  const [reviewLogs, setReviewLogs] = useState<Record<string, string[]>>({});

  /* ---- Brainstorm 流式生成 ---- */
  const [shownCount, setShownCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [typing, setTyping] = useState('');
  const [draft, setDraft] = useState('');
  const [seed, setSeed] = useState<string | null>(null);
  const [hlStoryId, setHlStoryId] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  /* ---- Brainstorm → PRD 落地联动 ---- */
  /** PRD 卡刚落地时的短暂高亮标记 */
  const [prdFresh, setPrdFresh] = useState(false);
  const freshTimer = useRef<number | null>(null);
  /** 上一次渲染的 prdReady，用于识别 false → true 的翻转沿 */
  const prevReadyRef = useRef(false);

  /* ---- 拆解 Modal ---- */
  const [decomposeOpen, setDecomposeOpen] = useState(false);
  const [decomposePhase, setDecomposePhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [queuedCount, setQueuedCount] = useState(0);

  /* ---- 提交评审 Modal ---- */
  const [submitOpen, setSubmitOpen] = useState(false);
  const [pickedReviewers, setPickedReviewers] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  /* ---------------------------------------------------------- 派生数据 */

  const req = REQUIREMENT_MAP[selectedReqId] ?? REQUIREMENTS[0];

  /** PRD 草稿是否已落地：Brainstorm 流式回放播完（shownCount 达到脚本总条数）即为 true */
  const prdReady = shownCount >= SCRIPT_TOTAL;
  /** 生成中态的进度百分比（已回放消息数 / 脚本总条数） */
  const prdPercent = SCRIPT_TOTAL > 0 ? Math.round((shownCount / SCRIPT_TOTAL) * 100) : 0;

  const prd = useMemo(
    () => PRD_VERSIONS.find((v) => v.id === prdVersionId) ?? PRD_VERSIONS[PRD_VERSIONS.length - 1],
    [prdVersionId],
  );
  const isHistorical = prd.id !== BASELINE_VERSION_ID;
  const prdAuthor = USER_MAP[prd.authorId];

  /** 当前需求下的用户故事（按 req.storyIds 顺序） */
  const reqStories = useMemo(() => {
    const owned = USER_STORIES.filter((s) => s.reqId === req.id);
    const order = req.storyIds;
    return owned.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [req]);

  /** 用户故事 → 关联任务编号（TASKS.storyIds 反向统计） */
  const tasksByStory = useMemo(() => {
    const map: Record<string, string[]> = {};
    TASKS.forEach((t) => {
      t.storyIds.forEach((sid) => {
        if (!map[sid]) map[sid] = [];
        map[sid].push(t.code);
      });
    });
    return map;
  }, []);

  /** 非功能需求：当前 PRD 版本覆盖范围内非「功能需求」的条目 */
  const nfrItems = useMemo(
    () => REQUIREMENTS.filter((r) => prd.relatedReqIds.includes(r.id) && r.type !== '功能需求'),
    [prd],
  );

  /** 开放问题：该版本未闭环的评审意见 + 版本范围内的高风险需求 */
  const openQuestions = useMemo(() => {
    const list: { id: string; from: string; text: string; tone: string }[] = [];
    PRD_REVIEWS.filter((rv) => rv.prdVersionId === prd.id).forEach((rv) => {
      rv.comments.forEach((c, idx) => {
        if (!c.resolved) {
          list.push({
            id: `${rv.id}-${idx}`,
            from: `${USER_MAP[rv.reviewerId]?.name ?? rv.reviewerId}（${rv.roleLabel}）`,
            text: c.point,
            tone: 'danger',
          });
        }
      });
    });
    REQUIREMENTS.filter((r) => prd.relatedReqIds.includes(r.id) && r.risk === 'high').forEach((r) => {
      list.push({ id: `risk-${r.id}`, from: `${r.code} 风险登记`, text: r.riskNote, tone: 'warn' });
    });
    return list;
  }, [prd]);

  /** 当前版本下的评审记录 */
  const versionReviews = useMemo(
    () => PRD_REVIEWS.filter((rv) => rv.prdVersionId === prd.id),
    [prd],
  );

  /* ---------------------------------------------------------- 交互逻辑 */

  useEffect(() => {
    if (!playing) return;
    if (shownCount >= BRAINSTORM_SCRIPT.length) {
      setPlaying(false);
      return;
    }
    const next = BRAINSTORM_SCRIPT[shownCount];
    // AI 消息按字符追加，模拟 SSE 流式输出；用户 / 系统消息整条入列
    if (next.role === 'ai') {
      if (typing.length < next.content.length) {
        const id = window.setTimeout(() => setTyping(next.content.slice(0, typing.length + 2)), 10 / speed);
        return () => window.clearTimeout(id);
      }
      const id = window.setTimeout(() => {
        setShownCount((c) => c + 1);
        setTyping('');
      }, 320 / speed);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setShownCount((c) => c + 1), 460 / speed);
    return () => window.clearTimeout(id);
  }, [playing, shownCount, speed, typing]);

  /** 流式输出时自动滚动到底部 */
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shownCount, typing]);

  /** prdReady 由 false 翻转为 true 的那一刻给 PRD 卡一次短暂高亮，提示「草稿已落地」 */
  useEffect(() => {
    if (prdReady && !prevReadyRef.current) {
      setPrdFresh(true);
      if (freshTimer.current !== null) window.clearTimeout(freshTimer.current);
      freshTimer.current = window.setTimeout(() => setPrdFresh(false), 2000);
    }
    prevReadyRef.current = prdReady;
  }, [prdReady]);

  /** 组件卸载时清理高亮定时器，避免在已卸载组件上 setState */
  useEffect(
    () => () => {
      if (freshTimer.current !== null) window.clearTimeout(freshTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (decomposePhase !== 'running') return;
    if (queuedCount >= reqStories.length) {
      setDecomposePhase('done');
      return;
    }
    const id = window.setTimeout(() => setQueuedCount((c) => c + 1), 420);
    return () => window.clearTimeout(id);
  }, [decomposePhase, queuedCount, reqStories.length]);

  const shownMessages = BRAINSTORM_SCRIPT.slice(0, shownCount);
  const nextMsg = shownCount < BRAINSTORM_SCRIPT.length ? BRAINSTORM_SCRIPT[shownCount] : null;
  const streamingMsg = playing && nextMsg && nextMsg.role === 'ai' ? nextMsg : null;
  const thinking = !!streamingMsg && typing.length === 0;

  const toggleGwt = (key: string) => {
    setCheckedGwt((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  /** 定位到用户故事：滚动居中并短暂高亮 */
  const flashStory = (storyId: string) => {
    setHlStoryId(storyId);
    window.setTimeout(() => setHlStoryId((cur) => (cur === storyId ? null : cur)), 2400);
  };

  const openStory = (storyId: string) => {
    const story = USER_STORIES.find((s) => s.id === storyId);
    if (story && story.reqId !== selectedReqId) setSelectedReqId(story.reqId);
    window.setTimeout(() => {
      document.getElementById(`rq-story-${storyId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashStory(storyId);
    }, 90);
  };

  const decideReview = (key: string, next: Exclude<ReviewState, 'pending'>) => {
    setReviewStates((prev) => ({ ...prev, [key]: next }));
    setReviewLogs((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), `${TODAY} 已${next === 'adopted' ? '采纳' : '拒绝'}（苏文瑾）`],
    }));
  };

  /** 重置并开始流式生成 */
  const runStream = () => {
    setShownCount(0);
    setTyping('');
    setPlaying(true);
  };

  const generate = () => {
    setSeed(draft.trim() || '请基于当前迭代主题，澄清需求并生成结构化 PRD 草稿。');
    setDraft('');
    runStream();
  };

  const toggleReviewer = (id: string) => {
    setPickedReviewers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const closeSubmit = () => {
    setSubmitOpen(false);
    setSubmitted(false);
    setPickedReviewers([]);
    setReviewNote('');
  };

  const startDecompose = () => {
    setDecomposePhase('running');
    setQueuedCount(0);
  };

  const closeDecompose = () => {
    setDecomposeOpen(false);
    setDecomposePhase('confirm');
    setQueuedCount(0);
  };

  const reqOwner = USER_MAP[req.ownerId];
  const storyTaskTotal = reqStories.reduce((sum, s) => sum + (tasksByStory[s.id]?.length ?? 0), 0);

  /* ---------------------------------------------------------- 渲染 */

  return (
    <div className="ac-page ac-rq">
      {/* ============ 标题区 ============ */}
      <div className="ac-page-head">
        <div>
          <div className="ac-page-title">需求工作台</div>
          <div className="ac-page-desc">
            AI Brainstorm 澄清 → 结构化 PRD 草稿 → 多轮评审闭环 → 交付架构 Agent 拆解。当前贯穿案例：
            {CURRENT_SPRINT.theme}（{CURRENT_SPRINT.name}）。
          </div>
        </div>
        <div className="ac-page-actions">
          <button
            type="button"
            className="ac-btn ac-btn--ghost"
            onClick={() => {
              setSelectedReqId(REQUIREMENTS[0].id);
              setPrdVersionId(BASELINE_VERSION_ID);
            }}
            title="重置选中需求与 PRD 版本为初始状态"
          >
            <Clock size={14} /> 重置视图
          </button>
          <button
            type="button"
            className="ac-btn ac-btn--ai"
            disabled={!prdReady}
            onClick={() => setDecomposeOpen(true)}
            title={
              prdReady
                ? `将「${req.code}」下 ${reqStories.length} 条用户故事交给架构 Agent 拆解`
                : 'PRD 草稿尚未落地，请先完成 Brainstorm 回放，或在草稿卡中点击「跳过演示」'
            }
          >
            <Sparkles size={14} /> 交给架构 Agent 拆解
          </button>
        </div>
      </div>

      <div className="ac-rq-split">
        {/* ============ 右：PRD 产物区 ============ */}
        <div className="ac-col ac-gap-4 ac-rq-main">
            {/* ---- 2. 需求详情 + PRD 草稿 ---- */}
            <div
              className={`ac-card ${prdFresh ? 'ac-rq-prd--fresh' : ''}`}
              data-annotation-id="ai-sdlc-requirement-prd"
            >
              <div className="ac-card-head">
                <div className="ac-card-title">
                  <FileText size={15} /> 结构化 PRD 草稿
                </div>
                <div className="ac-card-extra">
                  {prdReady ? (
                    <>
                      <span className="ac-card-subtitle">AI 生成占比 {prd.aiRatio}%</span>
                      <label className="ac-rq-version">
                        <span className="ac-muted">PRD 版本</span>
                        <select
                          className="ac-select ac-select--sm"
                          value={prdVersionId}
                          onChange={(e) => setPrdVersionId(e.target.value)}
                          title="切换查看不同版本的 PRD"
                        >
                          {PRD_VERSIONS.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.version} · {v.status}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} />
                      </label>
                      <button
                        type="button"
                        className="ac-btn ac-btn--primary ac-btn--sm"
                        title={`将 ${prd.version} 提交给相关角色评审`}
                        onClick={() => {
                          setSubmitOpen(true);
                          setSubmitted(false);
                        }}
                      >
                        <ClipboardCheck size={13} /> 提交评审
                      </button>
                    </>
                  ) : (
                    <span
                      className="ac-tag ac-tag--ai ac-tag--sm"
                      title="Brainstorm 会话回放完成后，PRD 草稿才会在此落地"
                    >
                      <LoaderCircle size={11} className="ac-spin" /> 草稿生成中 {shownCount} / {SCRIPT_TOTAL}
                    </span>
                  )}
                </div>
              </div>

              {prdReady ? (
              <div className="ac-card-body">
                {/* 版本只读提示条 */}
                {isHistorical && (
                  <div className="ac-hint ac-hint--warn ac-mb-3">
                    <AlertTriangle size={13} />
                    <span>
                      当前查看 {prd.version}（历史版本，只读）。基线版本为{' '}
                      {PRD_VERSIONS[PRD_VERSIONS.length - 1].version}，如需编辑请切回基线版本。
                    </span>
                  </div>
                )}

                {/* 版本元信息 */}
                <div className="ac-rq-vermeta">
                  <div className="ac-rq-vermeta-main">
                    <span className="ac-rq-vermeta-version">{prd.version}</span>
                    <span className={`ac-tag ac-tag--${TAG_TONE[prd.tone]} ac-tag--sm`}>{prd.status}</span>
                    <span className="ac-tag ac-tag--outline ac-tag--sm">{prd.title}</span>
                  </div>
                  <div className="ac-rq-vermeta-sub">
                    <span>
                      <User size={11} /> {prdAuthor?.name ?? prd.authorId}（{prdAuthor?.title ?? '—'}）
                    </span>
                    <span>
                      <Clock size={11} /> {prd.createdAt}
                    </span>
                    <span>
                      <BookOpen size={11} /> {prd.wordCount} 字
                    </span>
                    <span className="ac-ok-text">+{prd.diffStat.add}</span>
                    <span className="ac-danger-text">-{prd.diffStat.del}</span>
                  </div>
                </div>

                {/* 版本差异摘要 */}
                <div className="ac-rq-block">
                  <div className="ac-section-title">版本差异摘要</div>
                  <div className="ac-rq-changes">
                    {prd.changes.map((c, idx) => {
                      const kind = changeKind(c);
                      const meta = CHANGE_KIND_META[kind];
                      return (
                        <div className="ac-rq-change" key={`${prd.id}-${idx}`}>
                          <span className={`ac-tag ac-tag--${meta.tone} ac-tag--sm ac-rq-change-tag`}>
                            {meta.label}
                          </span>
                          <span className="ac-text-2">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="ac-muted ac-xs ac-mt-1">
                    差异条目由数据层 changes 描述按前缀启发式归类，仅用于速览。
                  </div>
                </div>

                {/* 分区一：背景与目标 */}
                <div className="ac-rq-block">
                  <div className="ac-section-title">背景与目标</div>
                  <div className="ac-rq-para">
                    <div className="ac-rq-para-label">版本变更说明</div>
                    <div className="ac-lh ac-text-2">{prd.changeSummary}</div>
                  </div>
                  <div className="ac-rq-para">
                    <div className="ac-rq-para-label">
                      {req.code} · {req.title}
                    </div>
                    <div className="ac-lh ac-text-2">{req.desc}</div>
                    <div className="ac-rq-kvline">
                      <span>来源：{req.source}</span>
                      <span>负责人：{reqOwner?.name ?? req.ownerId}</span>
                      <span>故事点：{req.storyPoints} SP</span>
                      <span>AI 参与度：{req.aiAssist}%</span>
                    </div>
                    <div className="ac-rq-kvline">
                      <span>类型：{req.type}</span>
                      <span className={`ac-tag ac-tag--${REQ_STATUS_TONE[req.status]} ac-tag--sm`}>
                        {req.statusLabel}
                      </span>
                      <span className={`ac-tag ac-tag--${RISK_META[req.risk].tone} ac-tag--sm`}>
                        {RISK_META[req.risk].label}
                      </span>
                      {req.tags.map((t) => (
                        <span className="ac-tag ac-tag--neutral ac-tag--sm" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ac-rq-para">
                    <div className="ac-rq-para-label">需求级验收标准</div>
                    <ul className="ac-rq-aclist">
                      {req.acceptanceCriteria.map((ac) => (
                        <li key={ac}>
                          <CircleDot size={11} />
                          <span>{ac}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 分区二：用户故事列表 */}
                <div className="ac-rq-block">
                  <div className="ac-section-title">
                    用户故事列表
                    <span className="ac-tag ac-tag--brand ac-tag--sm ac-ml-auto">
                      {reqStories.length} 条 · 关联任务 {storyTaskTotal} 个
                    </span>
                  </div>
                  {reqStories.length === 0 ? (
                    <div className="ac-empty ac-empty--sm">
                      <div className="ac-empty-title">该需求下暂无用户故事</div>
                      <div className="ac-empty-desc">可在 Brainstorm 澄清后由 AI 生成用户故事</div>
                    </div>
                  ) : (
                    <div className="ac-rq-stories">
                      {reqStories.map((story) => {
                        const taskCodes = tasksByStory[story.id] ?? [];
                        const expanded = expandedStoryId === story.id;
                        const checked = story.gwt.filter((_, i) =>
                          checkedGwt.includes(`${story.id}:${i}`),
                        ).length;
                        return (
                          <div
                            className={`ac-rq-story ${hlStoryId === story.id ? 'ac-rq-story--hl' : ''}`}
                            id={`rq-story-${story.id}`}
                            key={story.id}
                          >
                            <div className="ac-rq-story-head">
                              <span className="ac-mono ac-rq-story-id">{story.id}</span>
                              <span className="ac-rq-story-title">{story.title}</span>
                              <span className={`ac-badge ${PRIORITY_BADGE[story.priority]}`}>{story.priority}</span>
                              <span className={`ac-tag ac-tag--${TAG_TONE[story.tone]} ac-tag--sm`}>
                                {story.statusLabel}
                              </span>
                              <span className="ac-tag ac-tag--outline ac-tag--sm">{story.points} SP</span>
                            </div>
                            <div className="ac-rq-story-role">
                              作为 <b>{story.role.replace(/^作为\s*/u, '')}</b>，我希望{' '}
                              <b>{story.want}</b>，以便 <b>{story.soThat}</b>。
                            </div>
                            <div className="ac-rq-story-foot">
                              <button
                                type="button"
                                className="ac-btn ac-btn--text ac-btn--sm"
                                title={expanded ? '收起关联任务' : '展开查看关联任务编号'}
                                onClick={() => setExpandedStoryId(expanded ? null : story.id)}
                              >
                                <GitBranch size={12} />
                                关联任务 {taskCodes.length} 个
                                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              </button>
                              <span className="ac-muted ac-xs">
                                验收标准已勾选 {checked} / {story.gwt.length}
                              </span>
                              <span className="ac-muted ac-xs">来源 {story.source}</span>
                            </div>
                            {expanded && (
                              <div className="ac-rq-tasklist">
                                {taskCodes.length === 0 ? (
                                  <span className="ac-muted ac-xs">该故事暂未拆出开发任务</span>
                                ) : (
                                  taskCodes.map((code) => (
                                    <button
                                      type="button"
                                      key={code}
                                      className="ac-rq-taskchip"
                                      title={`前往任务看板查看 ${code}`}
                                      onClick={() => {
                                        window.location.hash = '#page=board';
                                      }}
                                    >
                                      <span className="ac-mono">{code}</span>
                                      <ExternalLink size={10} />
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                            <div className="ac-rq-gwt">
                              <div className="ac-rq-gwt-head">
                                <ListChecks size={12} /> 验收标准（Given / When / Then）
                              </div>
                              {story.gwt.map((g, i) => {
                                const key = `${story.id}:${i}`;
                                const on = checkedGwt.includes(key);
                                return (
                                  <label className={`ac-rq-gwt-item ${on ? 'ac-rq-gwt-item--on' : ''}`} key={key}>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={() => toggleGwt(key)}
                                      title="勾选表示该验收标准已在评审中确认"
                                    />
                                    <span>
                                      <b>Given</b> {g.given}
                                      <br />
                                      <b>When</b> {g.when}
                                      <br />
                                      <b>Then</b> {g.then}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 分区三：非功能需求 */}
                <div className="ac-rq-block">
                  <div className="ac-section-title">非功能需求</div>
                  {nfrItems.length === 0 ? (
                    <div className="ac-hint">
                      <AlertTriangle size={13} />
                      <span>
                        {prd.version} 覆盖范围（{prd.relatedReqIds.join('、')}）内未单独列出非功能 / 合规类需求。
                      </span>
                    </div>
                  ) : (
                    <div className="ac-rq-nfr">
                      {nfrItems.map((r) => (
                        <div className="ac-rq-nfr-item" key={r.id}>
                          <div className="ac-rq-nfr-head">
                            <span className="ac-mono">{r.code}</span>
                            <span className="ac-rq-nfr-title">{r.title}</span>
                            <span className="ac-tag ac-tag--info ac-tag--sm">{r.type}</span>
                            <span className={`ac-tag ac-tag--${RISK_META[r.risk].tone} ac-tag--sm`}>
                              {RISK_META[r.risk].label}
                            </span>
                          </div>
                          <ul className="ac-rq-aclist">
                            {r.acceptanceCriteria.map((ac) => (
                              <li key={ac}>
                                <CircleDot size={11} />
                                <span>{ac}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 分区四：开放问题 */}
                <div className="ac-rq-block">
                  <div className="ac-section-title">开放问题</div>
                  {openQuestions.length === 0 ? (
                    <div className="ac-hint ac-hint--ok">
                      <Check size={13} />
                      <span>{prd.version} 下无未闭环的评审意见与高风险项。</span>
                    </div>
                  ) : (
                    <ul className="ac-rq-openlist">
                      {openQuestions.map((q) => (
                        <li key={q.id}>
                          <span className={`ac-tag ac-tag--${q.tone} ac-tag--sm`}>{q.tone === 'danger' ? '待闭环' : '风险'}</span>
                          <span className="ac-text-2">{q.text}</span>
                          <span className="ac-muted ac-xs">— {q.from}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              ) : (
              <div className="ac-card-body">
                <div className="ac-empty ac-empty--sm">
                  <div className="ac-empty-icon">
                    <LoaderCircle size={18} className="ac-spin" />
                  </div>
                  <div className="ac-empty-title">需求澄清 Agent 正在生成 PRD 草稿</div>
                  <div className="ac-empty-desc">
                    左侧 Brainstorm 会话回放完成后，结构化草稿将在此落地；当前已回放 {shownCount} /{' '}
                    {SCRIPT_TOTAL} 条消息。
                  </div>
                </div>
                <div className="ac-rq-prdgen">
                  <div className="ac-rq-prdgen-head">
                    <span className="ac-muted ac-xs">草稿生成进度</span>
                    <span className="ac-mono ac-xs">
                      {shownCount} / {SCRIPT_TOTAL} · {prdPercent}%
                    </span>
                  </div>
                  <div className="ac-progress">
                    <div
                      className={`ac-progress-bar ${playing ? 'ac-progress-bar--striped' : ''}`}
                      style={{ width: `${prdPercent}%` }}
                    />
                  </div>
                  <div className="ac-rq-prdgen-secs">
                    {PRD_SECTIONS.map((s) => (
                      <span className="ac-rq-prdgen-sec" key={s}>
                        <FileText size={10} /> {s}
                      </span>
                    ))}
                  </div>
                  <div className="ac-rq-prdgen-note">
                    草稿落地后将展示：{PRD_SECTIONS.join(' / ')}，以及 {BASELINE_VERSION.version}{' '}
                    的版本差异摘要与提交评审入口。
                  </div>
                  <div className="ac-rq-prdgen-actions">
                    <button
                      type="button"
                      className="ac-btn ac-btn--primary ac-btn--sm"
                      disabled={playing}
                      title={
                        playing
                          ? '正在流式回放，请稍候'
                          : shownCount === 0
                            ? '开始流式回放 Brainstorm 会话'
                            : '继续播放剩余消息'
                      }
                      onClick={() => setPlaying(true)}
                    >
                      <Play size={12} /> {shownCount === 0 ? '开始回放' : '继续播放'}
                    </button>
                    <button
                      type="button"
                      className="ac-btn ac-btn--ghost ac-btn--sm"
                      title={`跳过流式演示，直接查看 ${BASELINE_VERSION.version} 定稿 PRD`}
                      onClick={() => {
                        setPlaying(false);
                        setTyping('');
                        setShownCount(SCRIPT_TOTAL);
                      }}
                    >
                      <SkipForward size={12} /> 跳过演示，查看 {BASELINE_VERSION.version} 定稿
                    </button>
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* ---- 3. 评审意见面板 ---- */}
            <div className="ac-card" data-annotation-id="ai-sdlc-requirement-review">
              <div className="ac-card-head">
                <div className="ac-card-title">
                  <MessageSquare size={15} /> PRD 评审意见
                </div>
                <div className="ac-card-extra">
                  <span className="ac-card-subtitle">
                    {prdReady ? `${prd.version} 共 ${versionReviews.length} 位评审人` : '等待 PRD 草稿落地'}
                  </span>
                </div>
              </div>
              {!prdReady ? (
              <div className="ac-card-body">
                <div className="ac-empty ac-empty--sm">
                  <div className="ac-empty-icon">
                    <MessageSquare size={16} />
                  </div>
                  <div className="ac-empty-title">PRD 草稿尚未落地</div>
                  <div className="ac-empty-desc">
                    Brainstorm 会话回放完成后，评审意见将开放采纳 / 拒绝处理与用户故事定位。
                  </div>
                </div>
              </div>
              ) : (
              <div className="ac-card-body">
                {versionReviews.length === 0 ? (
                  <div className="ac-empty ac-empty--sm">
                    <div className="ac-empty-title">该版本暂无评审记录</div>
                    <div className="ac-empty-desc">切换至 v2.3 基线版本可查看完整评审意见</div>
                  </div>
                ) : (
                  <div className="ac-col ac-gap-3">
                    {versionReviews.map((rv) => {
                      const reviewer = USER_MAP[rv.reviewerId];
                      return (
                        <div className="ac-rq-review" key={rv.id}>
                          <div className="ac-rq-review-head">
                            <span className={`ac-avatar ac-avatar--sm ac-avatar--${reviewer?.avatarColor ?? 'brand'}`}>
                              {reviewer?.initial ?? rv.reviewerId.slice(0, 1)}
                            </span>
                            <span className="ac-rq-review-name">{reviewer?.name ?? rv.reviewerId}</span>
                            <span className="ac-muted ac-xs">{rv.roleLabel}</span>
                            <span className={`ac-tag ac-tag--${TAG_TONE[rv.tone]} ac-tag--sm`}>{rv.verdictLabel}</span>
                            <span className="ac-timeline-time ac-ml-auto">{rv.at}</span>
                          </div>
                          <div className="ac-col ac-gap-2">
                            {rv.comments.map((c, idx) => {
                              const key = `${rv.id}:${idx}`;
                              const state = reviewStates[key] ?? 'pending';
                              const stateMeta = REVIEW_STATE_META[state];
                              const storyRef = locateStory(`${c.point} ${c.resolution}`);
                              const logs = reviewLogs[key] ?? [];
                              return (
                                <div className={`ac-rq-comment ac-rq-comment--${state}`} key={key}>
                                  <div className="ac-rq-comment-point">
                                    <AlertTriangle size={12} />
                                    <span>{c.point}</span>
                                  </div>
                                  <div className="ac-rq-comment-res">
                                    <span className="ac-rq-comment-res-label">处理结论</span>
                                    <span className="ac-text-2">{c.resolution}</span>
                                    <span className="ac-muted ac-xs">by {USER_MAP[c.resolvedBy]?.name ?? c.resolvedBy}</span>
                                  </div>
                                  <div className="ac-rq-comment-foot">
                                    <span className={`ac-tag ac-tag--${stateMeta.tone} ac-tag--sm`}>
                                      {stateMeta.label}
                                    </span>
                                    <span
                                      className={`ac-tag ac-tag--${c.resolved ? 'ok' : 'danger'} ac-tag--sm`}
                                      title="数据层标记的意见闭环状态"
                                    >
                                      {c.resolved ? '意见已闭环' : '意见未闭环'}
                                    </span>
                                    {storyRef ? (
                                      <button
                                        type="button"
                                        className="ac-rq-storyref"
                                        title={`滚动定位到用户故事 ${storyRef}`}
                                        onClick={() => openStory(storyRef)}
                                      >
                                        <CircleDot size={10} /> 定位 {storyRef}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="ac-rq-storyref ac-rq-storyref--off"
                                        disabled
                                        title="该意见未提及用户故事编号或需求编号，无法自动定位，请人工核对"
                                      >
                                        <CircleDot size={10} /> 未能定位
                                      </button>
                                    )}
                                    <span className="ac-ml-auto ac-row ac-gap-2">
                                      <button
                                        type="button"
                                        className="ac-btn ac-btn--ghost ac-btn--sm"
                                        disabled={state === 'adopted'}
                                        title={state === 'adopted' ? '该意见已采纳' : '采纳该评审意见并记录处理人'}
                                        onClick={() => decideReview(key, 'adopted')}
                                      >
                                        <Check size={12} /> 采纳
                                      </button>
                                      <button
                                        type="button"
                                        className="ac-btn ac-btn--ghost ac-btn--sm"
                                        disabled={state === 'rejected'}
                                        title={state === 'rejected' ? '该意见已拒绝' : '拒绝该评审意见并说明处理记录'}
                                        onClick={() => decideReview(key, 'rejected')}
                                      >
                                        <X size={12} /> 拒绝
                                      </button>
                                    </span>
                                  </div>
                                  {logs.length > 0 && (
                                    <div className="ac-rq-comment-log">
                                      {logs.map((log) => (
                                        <div key={log} className="ac-mono ac-xs ac-muted">
                                          {log}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>

          {/* ---- 4. Brainstorm 对话区 ---- */}
          <div className="ac-card ac-rq-sticky ac-rq-chat" data-annotation-id="ai-sdlc-requirement-brainstorm">
            <div className="ac-card-head">
              <div className="ac-card-title">
                <Bot size={15} /> Brainstorm 需求澄清
              </div>
              <div className="ac-card-extra">
                <span className="ac-tag ac-tag--ai ac-tag--sm">
                  {shownCount} / {BRAINSTORM_SCRIPT.length}
                </span>
              </div>
            </div>
            <div className="ac-rq-picker" data-annotation-id="ai-sdlc-requirement-picker">
              <div className="ac-rq-picker-row">
                <span className="ac-rq-picker-label">
                  <ListChecks size={13} /> 需求选择
                </span>
                <label className="ac-rq-picker-select">
                  <select
                    className="ac-select ac-select--sm"
                    value={selectedReqId}
                    onChange={(e) => setSelectedReqId(e.target.value)}
                    title="切换当前澄清并生成 PRD 的需求"
                  >
                    {REQUIREMENTS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {r.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
              </div>
              <div className="ac-rq-picker-meta">
                <span className={`ac-badge ${PRIORITY_BADGE[req.priority]}`}>{req.priority}</span>
                <span className={`ac-tag ac-tag--${REQ_STATUS_TONE[req.status]} ac-tag--sm`}>
                  {req.statusLabel}
                </span>
                <span className={`ac-tag ac-tag--${RISK_META[req.risk].tone} ac-tag--sm`}>
                  {RISK_META[req.risk].label}
                </span>
                <span className="ac-rq-picker-count">
                  <Layers size={11} /> {req.storyIds.length} 故事
                </span>
                <span className="ac-rq-picker-count">
                  <Zap size={11} /> AI 参与 {req.aiAssist}%
                </span>
              </div>
            </div>
            <div className="ac-rq-chat-tools">
              {playing ? (
                <button
                  type="button"
                  className="ac-btn ac-btn--danger-ghost ac-btn--sm"
                  title="停止流式回放"
                  onClick={() => setPlaying(false)}
                >
                  <Square size={12} /> 停止
                </button>
              ) : shownCount >= BRAINSTORM_SCRIPT.length ? (
                <button
                  type="button"
                  className="ac-btn ac-btn--ghost ac-btn--sm"
                  title="从头重新播放本次会话（右侧 PRD 草稿会回到生成中态并重新落地）"
                  onClick={() => {
                    setShownCount(0);
                    setTyping('');
                    setPlaying(true);
                  }}
                >
                  <Play size={12} /> 重新播放
                </button>
              ) : (
                <button
                  type="button"
                  className="ac-btn ac-btn--primary ac-btn--sm"
                  title={shownCount === 0 ? '开始流式回放 Brainstorm 会话' : '继续播放剩余消息'}
                  onClick={() => setPlaying(true)}
                >
                  <Play size={12} /> {shownCount === 0 ? '开始回放' : '继续播放'}
                </button>
              )}
              <div className="ac-tabs ac-tabs--pill ac-rq-speed">
                {([1, 2] as const).map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`ac-tab ${speed === s ? 'ac-tab--active' : ''}`}
                    title={`以 ${s} 倍速播放`}
                    onClick={() => setSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <div className="ac-rq-chat-body ac-scroll-y" ref={chatRef}>
              {shownCount === 0 && !playing ? (
                <div className="ac-empty ac-empty--sm">
                  <div className="ac-empty-title">会话尚未开始</div>
                  <div className="ac-empty-desc">
                    点击「开始回放」逐条播放 AI 需求澄清会话（{BRAINSTORM_SCRIPT.length} 条消息）
                  </div>
                </div>
              ) : (
                <>
                  {shownMessages.map((m) => {
                    const kind = bubbleKind(m);
                    if (kind === 'system') {
                      return (
                        <div className="ac-rq-sysmsg" key={m.id}>
                          <Zap size={11} />
                          <span>{m.content}</span>
                          <span className="ac-mono ac-xs">{m.at.slice(11)}</span>
                        </div>
                      );
                    }
                    const who = USER_MAP[m.whoId];
                    const toneClass =
                      kind === 'user' ? 'ac-rq-bubble--user' : `ac-rq-bubble--${kind}`;
                    return (
                      <div className={`ac-rq-msg ac-rq-msg--${kind}`} key={m.id}>
                        <div className="ac-rq-msg-head">
                          <span className={`ac-avatar ac-avatar--xs ac-avatar--${who?.avatarColor ?? (kind === 'user' ? 'brand' : 'ai')}`}>
                            {who?.initial ?? (kind === 'user' ? '我' : 'AI')}
                          </span>
                          <span className="ac-rq-msg-who">{m.who}</span>
                          {kind === 'ask' && <span className="ac-tag ac-tag--info ac-tag--sm">澄清追问</span>}
                          {kind === 'gen' && <span className="ac-tag ac-tag--ai ac-tag--sm">生成过程</span>}
                          {kind === 'result' && <span className="ac-tag ac-tag--ok ac-tag--sm">结果汇总</span>}
                          {kind === 'user' && <span className="ac-tag ac-tag--brand ac-tag--sm">用户指令</span>}
                          <span className="ac-mono ac-xs ac-ml-auto">{m.at.slice(11)}</span>
                        </div>
                        <div className={`ac-rq-bubble ${toneClass}`}>
                          <div className="ac-rq-bubble-text">{m.content}</div>
                          {m.artifacts && m.artifacts.length > 0 && (
                            <div className="ac-rq-artifacts">
                              {m.artifacts.map((a) => {
                                const isStory = a.type === 'story' || a.type === 'requirement';
                                return (
                                  <button
                                    type="button"
                                    key={`${m.id}-${a.ref}`}
                                    className="ac-rq-artifact"
                                    title={isStory ? `定位到 ${a.ref}` : `${ARTIFACT_LABEL[a.type] ?? a.type}：${a.ref}`}
                                    onClick={() => (isStory ? openStory(a.ref) : undefined)}
                                  >
                                    <span className="ac-tag ac-tag--neutral ac-tag--sm">
                                      {ARTIFACT_LABEL[a.type] ?? a.type}
                                    </span>
                                    <span>{a.label}</span>
                                    {isStory && <ChevronRight size={10} />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {(m.modelId || m.tokens) && (
                            <div className="ac-rq-bubble-meta ac-mono ac-xs">
                              {m.modelId && <span>{m.modelId}</span>}
                              {m.tokens && <span>{m.tokens} tokens</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {streamingMsg && typing.length > 0 && (
                    <div className={`ac-rq-msg ac-rq-msg--${bubbleKind(streamingMsg)}`}>
                      <div className="ac-rq-msg-head">
                        <span className="ac-avatar ac-avatar--xs ac-avatar--ai">
                          {USER_MAP[streamingMsg.whoId]?.initial ?? 'AI'}
                        </span>
                        <span className="ac-rq-msg-who">{streamingMsg.who}</span>
                        <span className="ac-tag ac-tag--ai ac-tag--sm">流式生成中</span>
                        <span className="ac-mono ac-xs ac-ml-auto">{streamingMsg.at.slice(11)}</span>
                      </div>
                      <div className={`ac-rq-bubble ac-rq-bubble--${bubbleKind(streamingMsg)}`}>
                        <div className="ac-rq-bubble-text">
                          {typing}
                          <span className="ac-rq-caret" />
                        </div>
                      </div>
                    </div>
                  )}
                  {thinking && (
                    <div className="ac-rq-thinking">
                      <span className="ac-rq-dot" />
                      <span className="ac-rq-dot" />
                      <span className="ac-rq-dot" />
                      <span className="ac-muted ac-xs">AI 正在思考…</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="ac-rq-composer">
              <div className="ac-rq-composer-hint">
                <Sparkles size={11} />
                <span>
                  {seed ?? '输入业务背景或澄清要点，点击「生成 PRD」由 AI 依据历史会话产出结构化草稿。'}
                </span>
              </div>
              <div className="ac-rq-composer-row">
                <textarea
                  className="ac-textarea ac-rq-composer-input"
                  rows={2}
                  placeholder="补充澄清要点，例如：幂等键如何选择？并发冲突如何回滚？"
                  value={draft}
                  disabled={playing}
                  onChange={(e) => setDraft(e.target.value)}
                  title={playing ? 'AI 正在流式生成，请稍候' : '输入补充说明后点击「生成 PRD」'}
                />
                <div className="ac-rq-composer-btns">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ai ac-btn--sm"
                    disabled={playing}
                    title={
                      playing ? 'AI 正在流式生成，请稍候' : `基于「${req.code}」与澄清要点生成结构化 PRD 草稿`
                    }
                    onClick={generate}
                  >
                    <Send size={12} /> 生成 PRD
                  </button>
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost ac-btn--sm"
                    disabled={playing}
                    title={playing ? 'AI 正在流式生成，请稍候' : '重置会话并重新流式生成 PRD'}
                    onClick={runStream}
                  >
                    <RefreshCw size={12} /> 重新生成
                  </button>
                </div>
              </div>
            </div>

            <div className="ac-card-foot ac-rq-chat-foot">
              <span className="ac-muted ac-xs">
                <Sparkles size={11} /> 已沉淀 {USER_STORIES.filter((s) => s.reqId === req.id).length} 条用户故事 · 产物写入知识库 KB-BS-{req.code.replace('REQ-', '')}
              </span>
            </div>
          </div>
      </div>

      {/* ============ 5. 交给架构 Agent 拆解 Modal ============ */}
      <Modal
        open={decomposeOpen}
        title="交给架构 Agent 拆解"
        subtitle={`${req.code} · ${req.title}`}
        width={640}
        onClose={closeDecompose}
        footer={
          decomposePhase === 'done' ? (
            <>
              <button type="button" className="ac-btn ac-btn--ghost" onClick={closeDecompose}>
                关闭
              </button>
              <button
                type="button"
                className="ac-btn ac-btn--primary"
                title="前往架构设计与任务拆解页面"
                onClick={() => {
                  window.location.hash = '#page=design';
                  closeDecompose();
                }}
              >
                <Rocket size={14} /> 前往架构设计与任务拆解
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ac-btn ac-btn--ghost"
                disabled={decomposePhase === 'running'}
                title={decomposePhase === 'running' ? '入队进行中，请等待完成' : '取消本次拆解'}
                onClick={closeDecompose}
              >
                取消
              </button>
              <button
                type="button"
                className="ac-btn ac-btn--ai"
                disabled={decomposePhase === 'running' || reqStories.length === 0}
                title={
                  reqStories.length === 0
                    ? '当前需求下没有可同步的用户故事'
                    : decomposePhase === 'running'
                      ? '正在逐条入队，请稍候'
                      : `确认将 ${reqStories.length} 条用户故事加入同步队列`
                }
                onClick={startDecompose}
              >
                <Sparkles size={14} />
                {decomposePhase === 'running' ? '入队中…' : '确认入队'}
              </button>
            </>
          )
        }
      >
        <div className="ac-col ac-gap-4">
          <div className="ac-grid-3">
            <div className="ac-rq-mstat">
              <div className="ac-rq-mstat-label">待同步用户故事</div>
              <div className="ac-rq-mstat-value">
                {reqStories.length}
                <small>条</small>
              </div>
            </div>
            <div className="ac-rq-mstat">
              <div className="ac-rq-mstat-label">目标工作项类型</div>
              <div className="ac-rq-mstat-value ac-rq-mstat-value--text">PingCode Story</div>
            </div>
            <div className="ac-rq-mstat">
              <div className="ac-rq-mstat-label">拆解后工作项</div>
              <div className="ac-rq-mstat-value ac-rq-mstat-value--text">PingCode Task</div>
            </div>
          </div>

          <div className="ac-hint ac-hint--ai">
            <Sparkles size={13} />
            <span>
              幂等保障：以「需求编号 + 用户故事编号 + 故事内容哈希」作为同步幂等键，重复入队不会产生重复工作项；
              已同步的故事将回写 PingCode 工作项编号，二次同步仅做增量更新。
            </span>
          </div>

          <div>
            <div className="ac-section-title">同步预览</div>
            <div className="ac-rq-synclist">
              {reqStories.map((story: UserStoryDef, idx) => {
                const done = decomposePhase !== 'confirm' && idx < queuedCount;
                const active = decomposePhase === 'running' && idx === queuedCount;
                return (
                  <div
                    className={`ac-rq-syncrow ${done ? 'ac-rq-syncrow--done' : ''} ${active ? 'ac-rq-syncrow--active' : ''}`}
                    key={story.id}
                  >
                    <span className="ac-mono ac-rq-syncrow-id">{story.id}</span>
                    <span className="ac-rq-syncrow-title">{story.title}</span>
                    <ChevronRight size={12} />
                    <span className="ac-tag ac-tag--brand ac-tag--sm">PingCode Story</span>
                    <span className="ac-rq-syncrow-state">
                      {done ? (
                        <>
                          <Check size={12} /> 已入队
                        </>
                      ) : active ? (
                        '入队中…'
                      ) : (
                        '待入队'
                      )}
                    </span>
                  </div>
                );
              })}
              {reqStories.length === 0 && (
                <div className="ac-empty ac-empty--sm">
                  <div className="ac-empty-title">无可同步的用户故事</div>
                  <div className="ac-empty-desc">请先在 Brainstorm 中澄清并生成用户故事</div>
                </div>
              )}
            </div>
          </div>

          {decomposePhase === 'done' && (
            <div className="ac-hint ac-hint--ok">
              <Check size={13} />
              <span>
                已入队 {queuedCount} / {reqStories.length} 条用户故事，同步任务 SYNC-0240 状态 success。
                架构 Agent 将据此输出影响面分析与任务拆解方案。
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* ============ 6. 提交评审 Modal ============ */}
      <Modal
        open={submitOpen}
        title="提交 PRD 评审"
        subtitle={`${prd.version} · ${req.code} ${req.title}`}
        width={600}
        onClose={closeSubmit}
        footer={
          submitted ? (
            <button type="button" className="ac-btn ac-btn--primary" onClick={closeSubmit}>
              完成
            </button>
          ) : (
            <>
              <button type="button" className="ac-btn ac-btn--ghost" onClick={closeSubmit}>
                取消
              </button>
              <button
                type="button"
                className="ac-btn ac-btn--primary"
                disabled={pickedReviewers.length === 0}
                title={
                  pickedReviewers.length === 0
                    ? '请至少选择 1 位评审人'
                    : `向 ${pickedReviewers.length} 位评审人发出评审邀请`
                }
                onClick={() => setSubmitted(true)}
              >
                <Send size={14} /> 提交评审
              </button>
            </>
          )
        }
      >
        {submitted ? (
          <div className="ac-col ac-gap-3">
            <div className="ac-hint ac-hint--ok">
              <Check size={13} />
              <span>
                已向 {pickedReviewers.length} 位评审人发出「{prd.version}」评审邀请，评审任务已写入各自待办，
                预计 1 个工作日内反馈。
              </span>
            </div>
            <div className="ac-rq-reviewers">
              {pickedReviewers.map((id) => {
                const u = USER_MAP[id];
                return (
                  <span className="ac-rq-reviewer ac-rq-reviewer--on" key={id}>
                    <span className={`ac-avatar ac-avatar--xs ac-avatar--${u?.avatarColor ?? 'brand'}`}>
                      {u?.initial ?? id.slice(0, 1)}
                    </span>
                    <span className="ac-rq-reviewer-name">{u?.name ?? id}</span>
                    <span className="ac-muted ac-xs">{u?.title ?? '—'}</span>
                  </span>
                );
              })}
            </div>
            {reviewNote.trim() && (
              <div className="ac-rq-para">
                <div className="ac-rq-para-label">评审说明</div>
                <div className="ac-lh ac-text-2">{reviewNote}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="ac-col ac-gap-4">
            <div>
              <div className="ac-section-title">选择评审人</div>
              <div className="ac-rq-reviewers">
                {REVIEWER_POOL.map((u) => {
                  const on = pickedReviewers.includes(u.id);
                  return (
                    <label className={`ac-rq-reviewer ${on ? 'ac-rq-reviewer--on' : ''}`} key={u.id}>
                      <input type="checkbox" checked={on} onChange={() => toggleReviewer(u.id)} />
                      <span className={`ac-avatar ac-avatar--xs ac-avatar--${u.avatarColor}`}>
                        {u.initial}
                      </span>
                      <span className="ac-rq-reviewer-name">{u.name}</span>
                      <span className="ac-muted ac-xs">{u.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="ac-section-title">评审说明</div>
              <textarea
                className="ac-textarea"
                rows={3}
                placeholder="说明本次评审关注点，例如：重点确认幂等键选取与并发冲突回滚方案。"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                title="填写给评审人的说明（可选）"
              />
            </div>
            <div className="ac-hint ac-hint--ai">
              <Sparkles size={13} />
              <span>
                提交后系统按角色生成评审任务：产品确认业务价值、架构确认技术可行性、测试确认验收标准可测、PMO
                确认排期影响。
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
