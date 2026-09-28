/**
 * 测试中心 · TestPage
 *
 * 三个标签：用例库（树 + 表格 + 导入/导出 + 用例详情抽屉）、
 * 执行记录（计划摘要 + 计划列表 + 计划详情抽屉）、
 * 测试报告（门禁 + 覆盖率 + 失败用例 + 缺陷分布 + 结论/签核）。
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Bot,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Gauge,
  Layers,
  Pen,
  Play,
  Plus,
  RefreshCw,
  Search,
  XCircle,
  Zap,
} from 'lucide-react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import {
  FieldOption,
  FormGroupTitle,
  FormGrid,
  SelectField,
  TextField,
  TextareaField,
  requireText,
} from '../components/FormFields';
import {
  BUGS,
  BUG_STATS,
  ENVIRONMENTS,
  REQUIREMENTS,
  TASK_MAP,
  TEST_CASES,
  TEST_MODULES,
  TEST_MODULE_MAP,
  TEST_PLANS,
  TEST_REPORT,
  USERS,
  USER_MAP,
} from '../data';
import type { TestCaseDef, TestPlanDef, Tone } from '../data';
import './test.css';

/* ============================================================
   类型与常量
   ============================================================ */

type TabId = 'cases' | 'plans' | 'report';

const STATUS_TAG_MAP: Record<string, string> = {
  passed: 'ok',
  failed: 'danger',
  blocked: 'warn',
  pending: 'neutral',
};

const STATUS_DOT_COLOR: Record<string, string> = {
  passed: 'var(--ok)',
  failed: 'var(--danger)',
  blocked: 'var(--warn)',
  pending: 'var(--text-3)',
};

const PRIORITY_DOT_COLOR: Record<string, string> = {
  P0: 'var(--danger)',
  P1: 'var(--warn)',
  P2: 'var(--info)',
};

const PLAN_STATUS_TAG: Record<string, string> = {
  running: 'brand',
  paused: 'warn',
  blocked: 'danger',
  done: 'ok',
};

/** 测试计划触发方式 → 中文文案（取自 TestPlanDef.trigger，不再由轮次派生） */
const TRIGGER_LABEL: Record<TestPlanDef['trigger'], string> = {
  pipeline: '流水线触发',
  manual: '手工',
  schedule: '定时',
};

/** 测试计划触发方式 → tag 语义色 */
const TRIGGER_TAG: Record<TestPlanDef['trigger'], string> = {
  pipeline: 'ai',
  manual: 'neutral',
  schedule: 'info',
};

/** AI 智能体共享账号（Artisan Copilot），用例作者为它时「来源」判定为 AI 生成 */
const AI_AUTHOR_ID = 'u-ai-copilot';

/** tag 只支持 7 种 tone，其余归并 */
function tagTone(tone: Tone): string {
  const map: Record<Tone, string> = {
    brand: 'brand', ai: 'ai', ok: 'ok', warn: 'warn', danger: 'danger',
    info: 'info', neutral: 'neutral', slate: 'neutral', teal: 'ok',
    pink: 'danger', indigo: 'brand', amber: 'warn',
  };
  return map[tone];
}

/* ============================================================
   工具函数
   ============================================================ */

function passRateBarTone(rate: number): string {
  if (rate >= 90) return 'ok';
  if (rate >= 80) return 'warn';
  return 'danger';
}

function reqCode(id: string): string {
  const r = REQUIREMENTS.find((x) => x.id === id);
  return r ? r.code : id;
}

/** 步骤 / 预期结果摘要：取首条，多条时补「等 N 步 / 等 N 条」，完整内容由 title 承载 */
function listSummary(list: string[], unit: string): string {
  if (list.length === 0) return '';
  return list.length > 1 ? `${list[0]} 等 ${list.length} ${unit}` : list[0];
}

/* ============================================================
   组件
   ============================================================ */

export default function TestPage() {
  /* ---- tab ---- */
  const [tab, setTab] = useState<TabId>('cases');

  /* ---- 用例库 state ---- */
  const [treeSearch, setTreeSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(TEST_MODULES.map((m) => m.id)));
  const [selModule, setSelModule] = useState<string>('');
  const [selCase, setSelCase] = useState<TestCaseDef | null>(null);
  const [caseDrawerOpen, setCaseDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [autoOnly, setAutoOnly] = useState(false);

  /* ---- 导入 modal ---- */
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'xmind' | 'excel'>('xmind');
  const [importProgress, setImportProgress] = useState(0);
  const [importing, setImporting] = useState(false);

  /* ---- toast ---- */
  const [toast, setToast] = useState<{ msg: string; tone: string } | null>(null);

  /* ---- 执行记录 state ---- */
  const [selPlan, setSelPlan] = useState<TestPlanDef | null>(null);
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);

  /* ---- 报告 state ---- */
  const [expandedFailures, setExpandedFailures] = useState<Set<string>>(new Set());
  const [bugDistDim, setBugDistDim] = useState<'module' | 'severity' | 'category'>('module');
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [bugModalCase, setBugModalCase] = useState<TestCaseDef | null>(null);

  /* ---- 新建用例 ---- */
  interface CreateForm {
    title: string;
    moduleId: string;
    planId: string;
    reqId: string;
    taskId: string;
    apiId: string;
    priority: 'P0' | 'P1' | 'P2';
    type: '功能' | '接口' | '性能' | '安全' | '回归' | '混沌';
    auto: string;  // 'yes' | 'no'
    authorId: string;
    preconditions: string;
    steps: string;
    expected: string;
  }
  const EMPTY_FORM: CreateForm = {
    title: '', moduleId: '', planId: '', reqId: '', taskId: '', apiId: '',
    priority: 'P2', type: '功能', auto: 'no', authorId: '',
    preconditions: '', steps: '', expected: '',
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<TestCaseDef[]>([]);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aiDraft, setAiDraft] = useState<{ steps: string[]; expected: string[]; note: string } | null>(null);

  /* ============================================================
     新建用例 · 合并 TEST_CASES
     ============================================================ */
  const allCases = useMemo(() => [...TEST_CASES, ...created], [created]);

  /* ============================================================
     Toast 工具
     ============================================================ */
  const showToast = useCallback((msg: string, tone: string) => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ============================================================
     用例库 · 过滤与分组
     ============================================================ */
  const treeFiltered = useMemo(() => {
    if (!treeSearch) return TEST_MODULES;
    const kw = treeSearch.toLowerCase();
    return TEST_MODULES.filter(
      (m) => m.name.toLowerCase().includes(kw) || m.code.toLowerCase().includes(kw),
    );
  }, [treeSearch]);

  const casesForModule = useMemo(() => {
    let filtered = allCases;
    if (selModule) filtered = filtered.filter((c) => c.moduleId === selModule);
    if (statusFilter) filtered = filtered.filter((c) => c.status === statusFilter);
    if (autoOnly) filtered = filtered.filter((c) => c.auto);
    return filtered;
  }, [selModule, statusFilter, autoOnly, allCases]);

  const statusCounts = useMemo(() => {
    const base = selModule
      ? allCases.filter((c) => c.moduleId === selModule)
      : allCases;
    return {
      all: base.length,
      passed: base.filter((c) => c.status === 'passed').length,
      failed: base.filter((c) => c.status === 'failed').length,
      blocked: base.filter((c) => c.status === 'blocked').length,
      pending: base.filter((c) => c.status === 'pending').length,
    };
  }, [selModule, allCases]);

  /* ============================================================
     执行记录 · 聚合
     ============================================================ */
  const planAgg = useMemo(() => {
    const total = TEST_PLANS.length;
    const execRate = TEST_PLANS.length
      ? TEST_PLANS.reduce((s, p) => s + p.execRate, 0) / TEST_PLANS.length
      : 0;
    const passRate = TEST_PLANS.length
      ? TEST_PLANS.reduce((s, p) => s + p.passRate, 0) / TEST_PLANS.length
      : 0;
    const blockedTotal = TEST_PLANS.reduce((s, p) => s + p.blocked, 0);
    const skippedTotal = TEST_PLANS.reduce((s, p) => s + p.skipped, 0);
    return { total, execRate, passRate, blockedTotal, skippedTotal };
  }, []);

  /* ============================================================
     报告 · 失败用例
     ============================================================ */
  const failedCases = useMemo(
    () => allCases.filter((c) => c.status === 'failed'),
    [allCases],
  );
  const nonPassedCases = useMemo(
    () => allCases.filter((c) => c.status !== 'passed'),
    [allCases],
  );

  /* ============================================================
     导入 / 导出
     ============================================================ */
  const openImport = (type: 'xmind' | 'excel') => {
    setImportType(type);
    setImportModalOpen(true);
    setImportProgress(0);
    setImporting(false);
  };

  const runImport = () => {
    setImporting(true);
    const steps = [25, 50, 75, 100];
    steps.forEach((v, i) => {
      setTimeout(() => {
        setImportProgress(v);
        if (i === steps.length - 1) {
          setImporting(false);
          setImportModalOpen(false);
          showToast(
            importType === 'xmind'
              ? '已导入 12 条用例，合并 3 条重复'
              : '已导入 18 条用例，跳过 2 条格式异常',
            'ok',
          );
        }
      }, (i + 1) * 600);
    });
  };

  const handleExportExcel = () => {
    showToast(`已导出当前筛选下 ${casesForModule.length} 条用例`, 'ok');
  };

  const openCaseDrawer = (c: TestCaseDef) => {
    setSelCase(c);
    setCaseDrawerOpen(true);
  };

  const openPlanDrawer = (p: TestPlanDef) => {
    setSelPlan(p);
    setPlanDrawerOpen(true);
  };

  const toggleFailure = (id: string) => {
    setExpandedFailures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateBug = (c: TestCaseDef) => {
    setBugModalCase(c);
    setBugModalOpen(true);
  };

  const confirmCreateBug = () => {
    const id = `BUG-10${50 + Math.floor(Math.random() * 50)}`;
    setBugModalOpen(false);
    showToast(`已创建缺陷 ${id} 并推送给处理人`, 'ai');
  };

  /* ============================================================
     新建用例 · 选项
     ============================================================ */

  const moduleOptions: FieldOption[] = TEST_MODULES.map((m) => ({
    value: m.id,
    label: `${m.code} ${m.name}`,
    title: `${m.ownerId ? USER_MAP[m.ownerId]?.name ?? m.ownerId : ''} · ${m.caseCount} 条用例`,
  }));

  const planOptions: FieldOption[] = TEST_PLANS.map((p) => ({
    value: p.id,
    label: `${p.id} ${p.name}`,
    title: `模块数 ${p.moduleIds.length} · 用例 ${p.caseCount} · 通过率 ${p.passRate}%`,
  }));

  const reqOptions: FieldOption[] = REQUIREMENTS.map((r) => ({
    value: r.id,
    label: `${r.code} ${r.title.slice(0, 28)}`,
  }));

  const taskOptions: FieldOption[] = Object.values(TASK_MAP).map((t) => ({
    value: t.id,
    label: `${t.id} ${t.title.slice(0, 24)}`,
  }));

  const userOptions: FieldOption[] = USERS.map((u) => ({
    value: u.id,
    label: `${u.name} · ${u.title}`,
  }));

  const nextCaseId = `TC-${String(TEST_CASES.length + created.length + 1).padStart(3, '0')}`;

  /* ---- 新建用例交互 ---- */
  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setAiDraft(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setErrors({});
    setAiDraft(null);
  };

  const patchForm = (key: keyof CreateForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; delete n.ai; return n; });
    // 修改 steps/expected 后清掉 AI 草稿
    if (key === 'steps' || key === 'expected') setAiDraft(null);
  };

  /* ---- AI 生成步骤与预期 ---- */
  const runAiDraft = () => {
    if (!form.title.trim() || !form.moduleId) {
      setErrors((prev) => ({ ...prev, ai: '请先填写用例标题并选择所属模块' }));
      return;
    }
    const mod = TEST_MODULE_MAP[form.moduleId];
    const modName = mod?.name ?? form.moduleId;
    const typeMap: Record<string, string> = { '功能': '正向流程', '接口': '接口参数', '性能': '并发负载', '安全': '越权与注入', '回归': '回归验证', '混沌': '故障注入' };
    const hint = typeMap[form.type] ?? form.type;

    const steps = [
      `前置：${form.preconditions.trim() || '确认测试环境可用'}`,
      `步骤 1：调用 ${modName} 相关入口——${form.title.slice(0, 30)}`,
      `步骤 2：验证关键状态变更与数据落库`,
      `步骤 3：检查 ${hint} 相关边界条件`,
    ];

    const expected = [
      '返回码符合接口契约定义',
      '关键数据字段与预期一致',
      '异常场景下错误码与提示信息完整',
    ];

    const stepsText = steps.join('\n');
    const expectedText = expected.join('\n');

    const note =
      `由 ag-ba（可观测分析 Agent）按用例模板推导 ${form.type} 类用例的步骤骨架与预期结果，覆盖 ${hint} 场景；` +
      `模型 mdl-local（私有化 Llama3-70B，禁止出域）。` +
      `模块「${modName}」的现有用例以 ${mod?.caseCount ?? 'N'} 条为参考。` +
      `请人工逐条核对并补充业务细节后再提交。`;

    setAiDraft({ steps, expected, note });
    setForm((prev) => ({ ...prev, steps: stepsText, expected: expectedText }));
  };

  /* ---- 校验与提交 ---- */
  const validateCreate = (): boolean => {
    const errs: Record<string, string> = {};
    const e = requireText(form.title, '用例标题'); if (e) errs.title = e;
    else if (form.title.trim().length < 6) errs.title = '用例标题过短，请完整描述测试场景';
    const me = requireText(form.moduleId, '所属模块'); if (me) errs.moduleId = me;
    const pe = requireText(form.planId, '所属计划'); if (pe) errs.planId = pe;
    const ae = requireText(form.authorId, '用例作者'); if (ae) errs.authorId = ae;
    if (!form.steps.trim()) errs.steps = '请填写测试步骤，每行一步';
    if (!form.expected.trim()) errs.expected = '请填写预期结果';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitCreate = () => {
    if (!validateCreate()) return;
    const item: TestCaseDef = {
      id: nextCaseId,
      moduleId: form.moduleId,
      planId: form.planId,
      title: form.title.trim(),
      reqId: form.reqId,
      taskId: form.taskId,
      apiId: form.apiId.trim(),
      priority: form.priority,
      type: form.type,
      auto: form.auto === 'yes',
      authorId: form.authorId,
      preconditions: form.preconditions.trim(),
      steps: form.steps.trim().split('\n').filter((s) => s.trim()),
      expected: form.expected.trim().split('\n').filter((s) => s.trim()),
      actual: '',
      status: 'pending',
      lastRunAt: '',
      durationSec: 0,
      bugIds: [],
      evidence: '',
    };
    setCreated((prev) => [...prev, item]);
    closeCreate();
    showToast(
      `已录入用例「${form.title.trim()}」（${item.id} · 状态待执行），当前为本地草稿态：已计入用例库（共 ${allCases.length + 1} 条），待提交后纳入正式执行计划。`,
      'ok',
    );
  };

  /* ============================================================
     SVG 缺陷分布条形图
     ============================================================ */
  const bugDistData = useMemo(() => {
    if (bugDistDim === 'module') {
      return Object.entries(BUG_STATS.byModule)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: TEST_MODULE_MAP[k]?.name ?? k, value: v }));
    }
    if (bugDistDim === 'severity') {
      const map: Record<string, number> = {};
      BUGS.forEach((b) => {
        const s = b.severity;
        map[s] = (map[s] || 0) + 1;
      });
      return Object.entries(map).map(([k, v]) => ({ label: k, value: v }));
    }
    return Object.entries(BUG_STATS.byCategory).map(([k, v]) => ({ label: k, value: v }));
  }, [bugDistDim]);

  const bugDistMax = useMemo(() => Math.max(...bugDistData.map((d) => d.value), 1), [bugDistData]);
  const BUG_DIST_COLORS = ['var(--danger)', 'var(--warn)', 'var(--info)', 'var(--ai)', 'var(--brand)', 'var(--ok)'];

  /* ============================================================
     JSX
     ============================================================ */
  return (
    <div className="ac-page" data-annotation-id="ai-sdlc-test-page">
      {/* ---- 页头 ---- */}
      <div className="ac-page-head">
        <div>
          <h2 className="ac-page-title">测试中心</h2>
          <p className="ac-page-desc">用例库、执行记录与测试报告</p>
        </div>
        <div className="ac-page-actions">
          <button
            type="button"
            className="ac-btn ac-btn--primary ac-btn--sm"
            onClick={openCreate}
          >
            <Plus size={13} />
            新建用例
          </button>
          <button
            type="button"
            className="ac-btn ac-btn--ghost ac-btn--sm"
            onClick={() => openImport('xmind')}
          >
            <FileText size={14} />
            <span className="ac-xs">导入 XMind</span>
          </button>
          <button
            type="button"
            className="ac-btn ac-btn--ghost ac-btn--sm"
            onClick={() => openImport('excel')}
          >
            <FileSpreadsheet size={14} />
            <span className="ac-xs">导入 Excel</span>
          </button>
          <button
            type="button"
            className="ac-btn ac-btn--sm"
            onClick={handleExportExcel}
          >
            <Download size={14} />
            <span className="ac-xs">导出 Excel</span>
          </button>
        </div>
      </div>

      {/* ---- 标签栏 ---- */}
      <div className="ac-tabs">
        <button
          className={`ac-tab${tab === 'cases' ? ' ac-tab--active' : ''}`}
          onClick={() => setTab('cases')}
        >
          用例库 <span className="ac-tab-count">{allCases.length}</span>
        </button>
        <button
          className={`ac-tab${tab === 'plans' ? ' ac-tab--active' : ''}`}
          onClick={() => setTab('plans')}
        >
          执行记录 <span className="ac-tab-count">{TEST_PLANS.length}</span>
        </button>
        <button
          className={`ac-tab${tab === 'report' ? ' ac-tab--active' : ''}`}
          onClick={() => setTab('report')}
        >
          测试报告
        </button>
      </div>

      {/* ============================================================
           标签 1：用例库
           ============================================================ */}
      {tab === 'cases' && (
        <div className="ac-test-split" data-annotation-id="ai-sdlc-test-cases">
          {/* ---- 左侧树 ---- */}
          <div className="ac-tree">
            <div className="ac-tree-search">
              <span className="ac-tree-search-icon"><Search size={14} /></span>
              <input
                className="ac-input ac-input--sm ac-w-full"
                placeholder="搜索模块名或编号…"
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
              />
            </div>
            <div className="ac-tree-list">
              {/* 虚拟根 */}
              <button
                type="button"
                className={`ac-tree-row${selModule === '' ? ' ac-tree-row--active' : ''}`}
                onClick={() => { setSelModule(''); }}
              >
                <span className="ac-tree-caret">
                  <ChevronDown size={12} />
                </span>
                <span className="ac-tree-label ac-bold">订单中心重构 EPIC-ORDER-REF</span>
                <span className="ac-tree-count">{allCases.length}</span>
              </button>
              <div className="ac-tree-children">
                {treeFiltered.map((mod) => (
                  <React.Fragment key={mod.id}>
                    <button
                      type="button"
                      className={`ac-tree-row${selModule === mod.id ? ' ac-tree-row--active' : ''}`}
                      onClick={() => {
                        setSelModule(selModule === mod.id ? '' : mod.id);
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(mod.id)) next.delete(mod.id);
                          else next.add(mod.id);
                          return next;
                        });
                      }}
                    >
                      <span className="ac-tree-caret">
                        {expanded.has(mod.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                      <span
                        className="ac-tree-dot"
                        style={{ background: PRIORITY_DOT_COLOR[mod.priority] ?? 'var(--text-3)' }}
                      />
                      <span className="ac-tree-label">{mod.code} {mod.name}</span>
                      <span className="ac-tree-count">{mod.caseCount}</span>
                    </button>
                    {expanded.has(mod.id) && (
                      <div className="ac-tree-children">
                        {allCases.filter((c) => c.moduleId === mod.id).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="ac-tree-row"
                            onClick={(e) => { e.stopPropagation(); openCaseDrawer(c); }}
                          >
                            <span className="ac-tree-caret ac-tree-caret--hidden">
                              <ChevronRight size={12} />
                            </span>
                            <span className="ac-tree-label ac-xs">{c.id} {c.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* ---- 右侧表格 ---- */}
          <div>
            <div className="ac-row ac-gap-3 ac-mb-3">
              <div className="ac-chip-row ac-flex-1">
                <button
                  type="button"
                  className={`ac-chip${statusFilter === '' ? ' ac-chip--active' : ''}`}
                  onClick={() => setStatusFilter('')}
                >
                  全部 <span className="ac-chip-count">{statusCounts.all}</span>
                </button>
                <button
                  type="button"
                  className={`ac-chip${statusFilter === 'passed' ? ' ac-chip--active' : ''}`}
                  onClick={() => setStatusFilter('passed')}
                >
                  <span className="ac-chip-dot" style={{ background: 'var(--ok)' }} />
                  已通过 <span className="ac-chip-count">{statusCounts.passed}</span>
                </button>
                <button
                  type="button"
                  className={`ac-chip${statusFilter === 'failed' ? ' ac-chip--active' : ''}`}
                  onClick={() => setStatusFilter('failed')}
                >
                  <span className="ac-chip-dot" style={{ background: 'var(--danger)' }} />
                  失败 <span className="ac-chip-count">{statusCounts.failed}</span>
                </button>
                <button
                  type="button"
                  className={`ac-chip${statusFilter === 'blocked' ? ' ac-chip--active' : ''}`}
                  onClick={() => setStatusFilter('blocked')}
                >
                  <span className="ac-chip-dot" style={{ background: 'var(--warn)' }} />
                  阻塞 <span className="ac-chip-count">{statusCounts.blocked}</span>
                </button>
                <button
                  type="button"
                  className={`ac-chip${statusFilter === 'pending' ? ' ac-chip--active' : ''}`}
                  onClick={() => setStatusFilter('pending')}
                >
                  <span className="ac-chip-dot" style={{ background: 'var(--text-3)' }} />
                  未执行 <span className="ac-chip-count">{statusCounts.pending}</span>
                </button>
              </div>
              <label className="ac-row ac-gap-2">
                <span className="ac-xs ac-muted ac-nowrap">
                  <Bot size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 3 }} />
                  仅看自动化
                </span>
                <button
                  type="button"
                  className={`ac-switch${autoOnly ? ' ac-switch--on' : ''}`}
                  onClick={() => setAutoOnly(!autoOnly)}
                  aria-label="仅看自动化"
                />
              </label>
            </div>

            <div className="ac-table-wrap">
              <table className="ac-table ac-table--sm">
                <thead>
                  <tr>
                    <th style={{ width: 84 }}>编号</th>
                    <th style={{ minWidth: 200 }}>标题</th>
                    {/* 新增三列：前置条件 / 步骤摘要 / 预期结果，单元格统一 ac-cell 截断并由 title 承载全文 */}
                    <th style={{ width: 200 }}>前置条件</th>
                    <th style={{ width: 210 }}>步骤摘要</th>
                    <th style={{ width: 200 }}>预期结果</th>
                    <th style={{ width: 88 }}>关联需求</th>
                    <th style={{ width: 88 }}>关联任务</th>
                    <th style={{ width: 56 }}>优先级</th>
                    <th style={{ width: 100 }}>类型 / 执行</th>
                    <th style={{ width: 92 }}>来源</th>
                    <th style={{ width: 80 }}>状态</th>
                    <th style={{ width: 104 }}>最近执行</th>
                    <th style={{ width: 56 }} className="ac-td-num">耗时</th>
                    <th style={{ width: 88 }}>关联缺陷</th>
                  </tr>
                </thead>
                <tbody>
                  {casesForModule.map((c) => (
                    <tr key={c.id}>
                      <td className="ac-mono ac-xs">{c.id}</td>
                      <td>
                        <span
                          className="ac-cell ac-cell--wide ac-cursor"
                          onClick={() => openCaseDrawer(c)}
                          title={c.title}
                        >
                          {c.title}
                        </span>
                        {created.some((x) => x.id === c.id) ? (
                          <span className="ac-tag ac-tag--sm ac-tag--ai" style={{ marginLeft: 8 }}>新建 · 待同步</span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className="ac-cell ac-xs ac-muted"
                          style={{ maxWidth: 200 }}
                          title={c.preconditions}
                        >
                          {c.preconditions}
                        </span>
                      </td>
                      <td>
                        <span
                          className="ac-cell ac-xs ac-muted"
                          style={{ maxWidth: 210 }}
                          title={c.steps.join('\n')}
                        >
                          {listSummary(c.steps, '步')}
                        </span>
                      </td>
                      <td>
                        <span
                          className="ac-cell ac-xs ac-muted"
                          style={{ maxWidth: 200 }}
                          title={c.expected.join('\n')}
                        >
                          {listSummary(c.expected, '条')}
                        </span>
                      </td>
                      <td className="ac-xs">{reqCode(c.reqId)}</td>
                      <td className="ac-mono ac-xs">{TASK_MAP[c.taskId]?.code ?? c.taskId}</td>
                      <td>
                        <span className={`ac-tag ac-tag--sm ac-tag--${c.priority === 'P0' ? 'danger' : c.priority === 'P1' ? 'warn' : 'info'}`}>
                          {c.priority}
                        </span>
                      </td>
                      {/* 类型 + 执行方式：自动化/人工执行原「来源」列语义并入此处，避免新增列继续加宽表格 */}
                      <td>
                        <div className="ac-row ac-gap-1">
                          <span className="ac-tag ac-tag--sm ac-tag--neutral">{c.type}</span>
                          <span
                            className="ac-tag ac-tag--sm ac-tag--outline"
                            title={c.auto ? '自动化执行' : '人工执行'}
                          >
                            {c.auto ? '自动' : '手动'}
                          </span>
                        </div>
                      </td>
                      {/* 来源：按作者账号判定 AI 生成 / 手工（AI 智能体共享账号见 AI_AUTHOR_ID） */}
                      <td>
                        {c.authorId === AI_AUTHOR_ID ? (
                          <span className="ac-tag ac-tag--sm ac-tag--ai">
                            <Bot size={10} style={{ marginRight: 2 }} />
                            AI 生成
                          </span>
                        ) : (
                          <span className="ac-tag ac-tag--sm ac-tag--neutral">手工</span>
                        )}
                      </td>
                      <td>
                        <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_TAG_MAP[c.status] ?? 'neutral'}`}>
                          <span
                            className="ac-tag-dot"
                            style={{ background: STATUS_DOT_COLOR[c.status] ?? 'var(--text-3)' }}
                          />
                          {{ passed: '通过', failed: '失败', blocked: '阻塞', pending: '待执行' }[c.status]}
                        </span>
                      </td>
                      <td className="ac-tnum ac-xs">{c.lastRunAt}</td>
                      <td className="ac-td-num ac-xs">{c.durationSec}s</td>
                      <td>
                        {c.bugIds.length > 0 ? (
                          <div className="ac-row ac-gap-1">
                            {c.bugIds.map((bid) => (
                              <span key={bid} className="ac-link ac-xs">{bid}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="ac-muted ac-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {casesForModule.length === 0 && (
              <div className="ac-empty ac-empty--sm">
                <span className="ac-empty-title">无匹配用例</span>
                <span className="ac-empty-desc">调整筛选条件或搜索关键字</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
           标签 2：执行记录
           ============================================================ */}
      {tab === 'plans' && (
        <div data-annotation-id="ai-sdlc-test-plans">
          <div className="ac-report-summary ac-mb-4">
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">计划总数</div>
              <div className="ac-report-summary-value">{planAgg.total}</div>
            </div>
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">平均执行率</div>
              <div className="ac-report-summary-value">{planAgg.execRate.toFixed(1)}%</div>
            </div>
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">平均通过率</div>
              <div className="ac-report-summary-value">{planAgg.passRate.toFixed(1)}%</div>
            </div>
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">阻塞 / 跳过</div>
              <div className="ac-report-summary-value" style={{ color: 'var(--danger)' }}>
                {planAgg.blockedTotal}
                <span className="ac-xs ac-muted"> / {planAgg.skippedTotal}</span>
              </div>
            </div>
          </div>

          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>计划名</th>
                  <th style={{ width: 96 }}>触发方式</th>
                  <th style={{ width: 80 }}>环境</th>
                  <th style={{ minWidth: 120 }}>模块</th>
                  <th style={{ width: 70 }} className="ac-td-num">总数</th>
                  <th style={{ width: 70 }} className="ac-td-num">通过</th>
                  <th style={{ width: 70 }} className="ac-td-num">失败</th>
                  <th style={{ width: 70 }} className="ac-td-num">阻塞</th>
                  <th style={{ width: 70 }} className="ac-td-num">跳过</th>
                  <th style={{ width: 100 }}>执行率</th>
                  <th style={{ width: 100 }}>通过率</th>
                  <th style={{ width: 100 }}>执行人</th>
                  <th style={{ width: 140 }}>起止时间</th>
                  <th style={{ width: 70 }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {TEST_PLANS.map((p) => (
                  <tr
                    key={p.id}
                    className={p.failed > 0 ? 'ac-tr-danger' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openPlanDrawer(p)}
                  >
                    <td>
                      <div className="ac-row ac-gap-2">
                        <span className="ac-semi">{p.name}</span>
                        <span className="ac-tag ac-tag--sm ac-tag--outline">第{p.round}轮</span>
                      </div>
                    </td>
                    <td>
                      <span className={`ac-tag ac-tag--sm ac-tag--${TRIGGER_TAG[p.trigger]}`}>
                        {TRIGGER_LABEL[p.trigger]}
                      </span>
                    </td>
                    <td className="ac-xs">{ENVIRONMENTS.find((e) => e.id === p.envId)?.code ?? p.envId}</td>
                    <td>
                      <div className="ac-row ac-gap-1 ac-wrap">
                        {p.moduleIds.map((mid) => (
                          <span key={mid} className="ac-tag ac-tag--sm ac-tag--outline">
                            {TEST_MODULE_MAP[mid]?.name ?? mid}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="ac-td-num">{p.caseCount}</td>
                    <td className="ac-td-num" style={{ color: 'var(--ok)' }}>{p.passed}</td>
                    <td className="ac-td-num" style={{ color: p.failed > 0 ? 'var(--danger)' : undefined }}>{p.failed}</td>
                    <td className="ac-td-num" style={{ color: p.blocked > 0 ? 'var(--warn)' : undefined }}>{p.blocked}</td>
                    {/* 跳过：本轮明确跳过、不计入执行率，属正常业务态故用中性色而非危险色 */}
                    <td className="ac-td-num" style={{ color: p.skipped > 0 ? 'var(--text-3)' : undefined }}>{p.skipped}</td>
                    <td>
                      <div className="ac-progress-row">
                        <div className="ac-progress ac-progress--sm ac-flex-1">
                          <div className="ac-progress-bar ac-progress-bar--info" style={{ width: `${p.execRate}%` }} />
                        </div>
                        <span className="ac-progress-label">{p.execRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="ac-progress-row">
                        <div className="ac-progress ac-progress--sm ac-flex-1">
                          <div
                            className={`ac-progress-bar ac-progress-bar--${passRateBarTone(p.passRate)}`}
                            style={{ width: `${p.passRate}%` }}
                          />
                        </div>
                        <span className="ac-progress-label">{p.passRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="ac-avatar-group">
                        {p.executorIds.slice(0, 3).map((uid) => {
                          const u = USER_MAP[uid];
                          return u ? (
                            <span key={uid} className={`ac-avatar ac-avatar--sm ac-avatar--${tagTone(u.avatarColor)}`} title={u.name}>
                              {u.initial}
                            </span>
                          ) : null;
                        })}
                        {p.executorIds.length > 3 && (
                          <span className="ac-avatar-more">+{p.executorIds.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="ac-xs">{p.window}</td>
                    <td>
                      <span className={`ac-tag ac-tag--sm ac-tag--${PLAN_STATUS_TAG[p.status]}`}>
                        {{ running: '执行中', paused: '已暂停', blocked: '已阻塞', done: '已完成' }[p.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
           标签 3：测试报告
           ============================================================ */}
      {tab === 'report' && (
        <div data-annotation-id="ai-sdlc-test-report">
          {/* 报告头 */}
          <div className="ac-report-head ac-mb-4">
            <div>
              <div className="ac-row ac-gap-3 ac-mb-2">
                <span className="ac-lg ac-bold">{TEST_REPORT.title}</span>
                <span className="ac-tag ac-tag--sm ac-tag--outline">{TEST_REPORT.version}</span>
                <span className={`ac-tag ac-tag--sm ac-tag--${TEST_REPORT.status === 'rejected' ? 'danger' : TEST_REPORT.status === 'signed' ? 'ok' : 'warn'}`}>
                  {{ rejected: '已驳回', draft: '草稿', signed: '已签发' }[TEST_REPORT.status]}
                </span>
              </div>
              <div className="ac-row ac-gap-3 ac-xs ac-muted">
                <span>作者：{USER_MAP[TEST_REPORT.authorId]?.name ?? TEST_REPORT.authorId}</span>
                <span>创建：{TEST_REPORT.createdAt}</span>
              </div>
            </div>
            <div className="ac-col ac-gap-2">
              <div className="ac-hint ac-hint--danger">
                <AlertTriangle size={14} />
                <div>
                  <strong>门禁 {TEST_REPORT.gateId} · 未通过</strong>
                  <br />
                  <span className="ac-xs">发布门禁未通过：{TEST_REPORT.blockingItems.length} 项阻塞</span>
                </div>
              </div>
            </div>
          </div>

          {/* 摘要四格 */}
          <div className="ac-report-summary ac-mb-4">
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">用例总数 / 已执行</div>
              <div className="ac-report-summary-value">
                {TEST_REPORT.caseTotal} <span className="ac-xs ac-muted">/ {TEST_REPORT.caseExecuted}</span>
              </div>
            </div>
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">执行率 / 通过率</div>
              <div className="ac-report-summary-value">
                {TEST_REPORT.execRate.toFixed(1)}% <span className="ac-xs ac-muted">/ {TEST_REPORT.passRate.toFixed(1)}%</span>
              </div>
            </div>
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">增量覆盖率</div>
              <div className="ac-report-summary-value">
                {TEST_REPORT.coverageIncremental}% <span className="ac-xs ac-muted">/ 目标 {TEST_REPORT.coverageTarget}%</span>
              </div>
            </div>
            <div className="ac-report-summary-item">
              <div className="ac-report-summary-label">分支覆盖率</div>
              <div className="ac-report-summary-value">{TEST_REPORT.coverageBranch}%</div>
            </div>
          </div>

          {/* 覆盖率与性能 */}
          <div className="ac-grid-2 ac-mb-4">
            {/* 覆盖率 */}
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><Gauge size={15} /> 覆盖率对比</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-col ac-gap-3">
                  <div>
                    <div className="ac-row-between ac-mb-1">
                      <span className="ac-xs">增量覆盖率</span>
                      <span className="ac-xs ac-bold">{TEST_REPORT.coverageIncremental}%</span>
                    </div>
                    <div className="ac-progress">
                      <div
                        className={`ac-progress-bar ${TEST_REPORT.coverageIncremental < (TEST_REPORT.coverageTarget ?? 85) ? 'ac-progress-bar--danger' : 'ac-progress-bar--ok'}`}
                        style={{ width: `${Math.min(TEST_REPORT.coverageIncremental, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="ac-row-between ac-mb-1">
                      <span className="ac-xs">分支覆盖率</span>
                      <span className="ac-xs ac-bold">{TEST_REPORT.coverageBranch}%</span>
                    </div>
                    <div className="ac-progress">
                      <div className="ac-progress-bar ac-progress-bar--warn" style={{ width: `${Math.min(TEST_REPORT.coverageBranch, 100)}%` }} />
                    </div>
                  </div>
                  <div className="ac-hint ac-hint--warn">
                    增量覆盖率 {TEST_REPORT.coverageIncremental}%，低于目标 {TEST_REPORT.coverageTarget}%，缺口来自 TASK-2405 / TASK-2407 未完成。
                  </div>
                </div>
              </div>
            </div>

            {/* 性能 */}
            <div className="ac-card">
              <div className="ac-card-head">
                <span className="ac-card-title"><Zap size={15} /> 性能指标</span>
              </div>
              <div className="ac-card-body">
                <dl className="ac-kv">
                  <dt>目标 TPS</dt>
                  <dd>{TEST_REPORT.perf.targetTps} <span className="ac-xs ac-muted">vs 实际 {TEST_REPORT.perf.actualTps}</span></dd>
                  <dt>API-01 P95</dt>
                  <dd>{TEST_REPORT.perf.api01P95Ms}ms</dd>
                  <dt>
                    API-03 P95
                    {TEST_REPORT.perf.api03P95Ms > TEST_REPORT.perf.api03TargetMs && (
                      <span style={{ color: 'var(--danger)', marginLeft: 4 }}>未达标</span>
                    )}
                  </dt>
                  <dd>
                    <span style={{ color: TEST_REPORT.perf.api03P95Ms > TEST_REPORT.perf.api03TargetMs ? 'var(--danger)' : undefined }}>
                      {TEST_REPORT.perf.api03P95Ms}ms
                    </span>
                    <span className="ac-xs ac-muted"> / 目标 {TEST_REPORT.perf.api03TargetMs}ms</span>
                  </dd>
                  <dt>错误率</dt>
                  <dd>{TEST_REPORT.perf.errorRate}%</dd>
                </dl>
              </div>
            </div>
          </div>

          {/* 用例状态分布 */}
          <div className="ac-card ac-mb-4">
            <div className="ac-card-head">
              <span className="ac-card-title"><Layers size={15} /> 用例状态分布</span>
            </div>
            <div className="ac-card-body">
              <div className="ac-stack-bar ac-mb-3">
                {[
                  { label: '通过', value: TEST_REPORT.casePassed, color: 'var(--ok)' },
                  { label: '失败', value: TEST_REPORT.caseFailed, color: 'var(--danger)' },
                  { label: '阻塞', value: TEST_REPORT.caseBlocked, color: 'var(--warn)' },
                  { label: '未执行', value: TEST_REPORT.caseTotal - TEST_REPORT.caseExecuted, color: 'var(--text-3)' },
                ].map((seg) =>
                  seg.value > 0 ? (
                    <div
                      key={seg.label}
                      className="ac-stack-seg"
                      style={{ width: `${(seg.value / TEST_REPORT.caseTotal) * 100}%`, background: seg.color }}
                      title={`${seg.label}: ${seg.value}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="ac-legend">
                {[
                  { label: '通过', value: TEST_REPORT.casePassed, color: 'var(--ok)' },
                  { label: '失败', value: TEST_REPORT.caseFailed, color: 'var(--danger)' },
                  { label: '阻塞', value: TEST_REPORT.caseBlocked, color: 'var(--warn)' },
                  { label: '未执行', value: TEST_REPORT.caseTotal - TEST_REPORT.caseExecuted, color: 'var(--text-3)' },
                ].map((seg) => (
                  <div key={seg.label} className="ac-legend-item">
                    <span className="ac-legend-swatch" style={{ background: seg.color }} />
                    <span>{seg.label}</span>
                    <span className="ac-legend-value">{seg.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 失败用例明细 */}
          <div className="ac-card ac-mb-4" data-annotation-id="ai-sdlc-test-report-failures">
            <div className="ac-card-head">
              <span className="ac-card-title"><XCircle size={15} /> 失败用例明细</span>
              <span className="ac-card-subtitle">
                {failedCases.length > 0 ? `${failedCases.length} 条失败` : '0 条失败，以下展示未通过用例'}
              </span>
            </div>
            <div className="ac-card-body">
              {(failedCases.length > 0 ? failedCases : nonPassedCases.slice(0, 5)).map((c) => {
                const isExpanded = expandedFailures.has(c.id);
                return (
                  <div key={c.id} className={`ac-fail-item${isExpanded ? ' ac-fail-item--open' : ''}`}>
                    <div className="ac-fail-head" onClick={() => toggleFailure(c.id)}>
                      <span className="ac-tag ac-tag--sm ac-tag--danger">
                        <span className="ac-tag-dot" />
                        {c.status === 'failed' ? '失败' : c.status === 'blocked' ? '阻塞' : '未执行'}
                      </span>
                      <span className="ac-fail-title">{c.id} · {c.title}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${c.priority === 'P0' ? 'danger' : c.priority === 'P1' ? 'warn' : 'info'}`}>
                        {c.priority}
                      </span>
                      <span className="ac-tag ac-tag--sm ac-tag--neutral">{c.type}</span>
                      <span className="ac-tag ac-tag--sm ac-tag--ai">
                        <Bot size={10} style={{ marginRight: 2 }} />
                        AI 归因：{c.status === 'failed' ? '断言失败' : '环境阻塞'}
                      </span>
                      <span className="ac-ml-auto">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="ac-mt-3">
                        {/* 堆栈摘要 */}
                        <div className="ac-stack-code">
                          <div className="ac-code ac-code--light">
                            <div className="ac-code-head">
                              <span className="ac-code-title">org.trade.order.AmountAllocatorTest</span>
                              <span className="ac-code-lang">Java</span>
                            </div>
                            <div className="ac-code-body">
                              <span className="ac-stack-hit">Expected: 100.00</span>
                              {'\n'}  Actual: 99.99
                              {'\n'}    at AmountAllocatorTest.testThreeWaySplit(AmountAllocatorTest.java:142)
                              {'\n'}    at AmountAllocator.allocate(AmountAllocator.java:87)
                              {'\n'}    at OrderService.calcPromo(OrderService.java:456)
                            </div>
                          </div>
                        </div>
                        {/* 实际结果 */}
                        {c.actual && (
                          <div className="ac-mt-2">
                            <span className="ac-xs ac-bold">实际结果：</span>
                            <span className="ac-xs">{c.actual}</span>
                          </div>
                        )}
                        <div className="ac-mt-3">
                          <button
                            type="button"
                            className="ac-btn ac-btn--danger-ghost ac-btn--sm"
                            onClick={(e) => { e.stopPropagation(); handleCreateBug(c); }}
                          >
                            <Bug size={13} />
                            一键提 Bug
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 缺陷分布 */}
          <div className="ac-card ac-mb-4" data-annotation-id="ai-sdlc-test-report-bugdist">
            <div className="ac-card-head">
              <span className="ac-card-title"><Bug size={15} /> 缺陷分布</span>
              <span className="ac-card-subtitle">共 {BUG_STATS.total} 个缺陷</span>
              <div className="ac-card-extra">
                <div className="ac-chip-row">
                  {(['module', 'severity', 'category'] as const).map((dim) => (
                    <button
                      key={dim}
                      type="button"
                      className={`ac-chip${bugDistDim === dim ? ' ac-chip--active' : ''}`}
                      onClick={() => setBugDistDim(dim)}
                    >
                      {{ module: '按模块', severity: '按严重级', category: '按分类' }[dim]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="ac-card-body">
              <svg className="ac-svg-chart" viewBox="0 0 520 180" height="180">
                {bugDistData.map((d, i) => {
                  const w = (d.value / bugDistMax) * 340;
                  const y = 12 + i * 28;
                  return (
                    <g key={d.label}>
                      <text className="ac-chart-label" x={100} y={y + 13} textAnchor="end">
                        {d.label.length > 8 ? d.label.slice(0, 8) + '…' : d.label}
                      </text>
                      <rect
                        x={108}
                        y={y}
                        width={w}
                        height={18}
                        rx={3}
                        fill={BUG_DIST_COLORS[i % BUG_DIST_COLORS.length]}
                        opacity={0.85}
                      />
                      <text className="ac-chart-value" x={112 + w} y={y + 13}>
                        {d.value}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* 报告结论 */}
          <div className="ac-card ac-mb-4">
            <div className="ac-card-head">
              <span className="ac-card-title"><FileText size={15} /> 报告结论与签核</span>
            </div>
            <div className="ac-card-body">
              <p className="ac-sm ac-lh">{TEST_REPORT.conclusion}</p>

              {TEST_REPORT.blockingItems.length > 0 && (
                <div className="ac-mt-3">
                  <span className="ac-xs ac-bold">阻塞项：</span>
                  {TEST_REPORT.blockingItems.map((item, i) => (
                    <div key={i} className="ac-hint ac-hint--danger ac-mt-1">{item}</div>
                  ))}
                </div>
              )}

              {TEST_REPORT.risks.length > 0 && (
                <div className="ac-mt-3">
                  <span className="ac-xs ac-bold">风险：</span>
                  {TEST_REPORT.risks.map((r, i) => (
                    <div key={i} className="ac-hint ac-hint--warn ac-mt-1">{r}</div>
                  ))}
                </div>
              )}

              {TEST_REPORT.suggestions.length > 0 && (
                <div className="ac-mt-3">
                  <span className="ac-xs ac-bold">建议：</span>
                  {TEST_REPORT.suggestions.map((s, i) => (
                    <div key={i} className="ac-hint ac-hint--ai ac-mt-1">{s}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 轮次对比 */}
          {TEST_REPORT.rounds.length > 0 && (
            <div className="ac-card ac-mb-4">
              <div className="ac-card-head">
                <span className="ac-card-title"><RefreshCw size={15} /> 轮次对比</span>
              </div>
              <div className="ac-card-body ac-card-body--flush">
                <table className="ac-table ac-table--sm">
                  <thead>
                    <tr>
                      <th>轮次</th>
                      <th>窗口</th>
                      <th className="ac-td-num">执行</th>
                      <th className="ac-td-num">新增缺陷</th>
                      <th className="ac-td-num">关闭缺陷</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TEST_REPORT.rounds.map((r) => (
                      <tr key={r.round}>
                        <td>第{r.round}轮</td>
                        <td className="ac-xs">{r.window}</td>
                        <td className="ac-td-num">{r.executed}</td>
                        <td className="ac-td-num" style={{ color: 'var(--danger)' }}>{r.newBugs}</td>
                        <td className="ac-td-num" style={{ color: 'var(--ok)' }}>{r.closedBugs}</td>
                        <td className="ac-xs">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 签核情况 */}
          <div className="ac-card">
            <div className="ac-card-head">
              <span className="ac-card-title"><CheckCircle2 size={15} /> 签核情况</span>
            </div>
            <div className="ac-card-body">
              <div className="ac-timeline">
                {TEST_REPORT.signOffs.map((so, i) => (
                  <div
                    key={i}
                    className={`ac-timeline-item ac-timeline-item--${so.action === '驳回' ? 'danger' : so.action === '提交' ? 'ok' : 'dim'}`}
                  >
                    <div className="ac-timeline-head">
                      <span className="ac-avatar ac-avatar--xs ac-avatar--brand">{so.name[0]}</span>
                      <span className="ac-timeline-title">{so.name}</span>
                      <span className={`ac-tag ac-tag--sm ac-tag--${so.action === '驳回' ? 'danger' : so.action === '提交' ? 'ok' : so.action === '待签' ? 'warn' : 'info'}`}>
                        {so.action}
                      </span>
                    </div>
                    <div className="ac-timeline-time">{so.time}</div>
                    <div className="ac-timeline-desc">{so.comment}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 附件 */}
          {TEST_REPORT.attachments.length > 0 && (
            <div className="ac-card ac-mt-4">
              <div className="ac-card-head">
                <span className="ac-card-title"><Download size={15} /> 附件</span>
              </div>
              <div className="ac-card-body">
                <div className="ac-row ac-gap-2 ac-wrap">
                  {TEST_REPORT.attachments.map((a, i) => (
                    <span key={i} className="ac-tag ac-tag--outline">{a}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
           用例详情抽屉
           ============================================================ */}
      <Drawer
        open={caseDrawerOpen}
        title={selCase ? `${selCase.id} · ${selCase.title}` : ''}
        subtitle={selCase ? `优先级 ${selCase.priority} · ${selCase.type}` : undefined}
        width={720}
        onClose={() => setCaseDrawerOpen(false)}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm"><Pen size={13} /> 编辑</button>
            <button type="button" className="ac-btn ac-btn--sm" onClick={() => showToast('重新执行已触发，请查看执行记录', 'ai')}>
              <Play size={13} /> 重新执行
            </button>
          </div>
        }
      >
        <div data-annotation-id="ai-sdlc-test-case-drawer">
          {selCase && (
            <div className="ac-col ac-gap-3">
              <dl className="ac-kv">
                <dt>用例编号</dt><dd className="ac-mono">{selCase.id}</dd>
                <dt>关联需求</dt><dd>{reqCode(selCase.reqId)}</dd>
                <dt>关联任务</dt><dd className="ac-mono">{TASK_MAP[selCase.taskId]?.code ?? selCase.taskId}</dd>
                <dt>关联接口</dt><dd className="ac-mono">{selCase.apiId}</dd>
                <dt>模块</dt><dd>{TEST_MODULE_MAP[selCase.moduleId]?.name ?? selCase.moduleId}</dd>
                <dt>状态</dt>
                <dd>
                  <span className={`ac-tag ac-tag--sm ac-tag--${STATUS_TAG_MAP[selCase.status]}`}>
                    <span className="ac-tag-dot" style={{ background: STATUS_DOT_COLOR[selCase.status] }} />
                    {{ passed: '通过', failed: '失败', blocked: '阻塞', pending: '待执行' }[selCase.status]}
                  </span>
                </dd>
                <dt>作者</dt><dd>{USER_MAP[selCase.authorId]?.name ?? selCase.authorId}</dd>
                <dt>最近执行</dt><dd>{selCase.lastRunAt} · {selCase.durationSec}s</dd>
              </dl>

              <div className="ac-divider" />

              <div>
                <span className="ac-section-title">前置条件</span>
                <p className="ac-sm ac-lh">{selCase.preconditions}</p>
              </div>

              <div>
                <span className="ac-section-title">测试步骤</span>
                <ol className="ac-col ac-gap-1">
                  {selCase.steps.map((s, i) => (
                    <li key={i} className="ac-sm">{s}</li>
                  ))}
                </ol>
              </div>

              <div>
                <span className="ac-section-title">预期结果</span>
                <ul className="ac-col ac-gap-1">
                  {selCase.expected.map((e, i) => (
                    <li key={i} className="ac-sm">{e}</li>
                  ))}
                </ul>
              </div>

              {selCase.actual && (
                <div>
                  <span className="ac-section-title">实际结果</span>
                  <p className="ac-sm ac-lh">{selCase.actual}</p>
                </div>
              )}

              {selCase.bugIds.length > 0 && (
                <div>
                  <span className="ac-section-title">关联缺陷</span>
                  <div className="ac-row ac-gap-2 ac-wrap">
                    {selCase.bugIds.map((bid) => (
                      <span key={bid} className="ac-tag ac-tag--sm ac-tag--danger">{bid}</span>
                    ))}
                  </div>
                </div>
              )}

              {selCase.evidence && (
                <div>
                  <span className="ac-section-title">证据</span>
                  <p className="ac-sm ac-muted">{selCase.evidence}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Drawer>

      {/* ============================================================
           执行记录 · 计划详情抽屉
           ============================================================ */}
      <Drawer
        open={planDrawerOpen}
        title={selPlan ? selPlan.name : ''}
        subtitle={selPlan ? `第 ${selPlan.round} 轮 · ${selPlan.window}` : undefined}
        width={720}
        onClose={() => setPlanDrawerOpen(false)}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm ac-ml-auto">
              查看失败用例
            </button>
          </div>
        }
      >
        <div data-annotation-id="ai-sdlc-test-plan-drawer">
          {selPlan && (
            <div className="ac-col ac-gap-3">
              <dl className="ac-kv">
                <dt>计划 ID</dt><dd className="ac-mono">{selPlan.id}</dd>
                <dt>环境</dt><dd>{ENVIRONMENTS.find((e) => e.id === selPlan.envId)?.name ?? selPlan.envId}</dd>
                <dt>触发方式</dt>
                <dd>
                  <span className={`ac-tag ac-tag--sm ac-tag--${TRIGGER_TAG[selPlan.trigger]}`}>
                    {TRIGGER_LABEL[selPlan.trigger]}
                  </span>
                </dd>
                <dt>状态</dt>
                <dd>
                  <span className={`ac-tag ac-tag--sm ac-tag--${PLAN_STATUS_TAG[selPlan.status]}`}>
                    {{ running: '执行中', paused: '已暂停', blocked: '已阻塞', done: '已完成' }[selPlan.status]}
                  </span>
                </dd>
                <dt>用例总数</dt><dd>{selPlan.caseCount}</dd>
                <dt>已执行</dt><dd>{selPlan.executed}（{selPlan.execRate.toFixed(1)}%）</dd>
                <dt>跳过用例</dt>
                <dd>
                  {selPlan.skipped}
                  <span className="ac-xs ac-muted">
                    （不计入执行率，待执行 {Math.max(0, selPlan.caseCount - selPlan.executed - selPlan.skipped)}）
                  </span>
                </dd>
                <dt>通过 / 失败 / 阻塞 / 跳过</dt>
                <dd>
                  <span style={{ color: 'var(--ok)' }}>{selPlan.passed}</span>
                  {' / '}
                  <span style={{ color: selPlan.failed > 0 ? 'var(--danger)' : undefined }}>{selPlan.failed}</span>
                  {' / '}
                  <span style={{ color: selPlan.blocked > 0 ? 'var(--warn)' : undefined }}>{selPlan.blocked}</span>
                  {' / '}
                  <span style={{ color: 'var(--text-3)' }}>{selPlan.skipped}</span>
                </dd>
                <dt>AI 生成 / 人工复核</dt>
                <dd>
                  <div className="ac-progress-row">
                    <div className="ac-progress ac-progress--sm ac-flex-1">
                      <div className="ac-progress-bar ac-progress-bar--ai" style={{ width: `${(selPlan.aiGenerated / selPlan.caseCount) * 100}%` }} />
                    </div>
                    <span className="ac-progress-label">{selPlan.aiGenerated} / {selPlan.humanReviewed}</span>
                  </div>
                </dd>
              </dl>

              <div className="ac-divider" />

              <div>
                <span className="ac-section-title">准入标准</span>
                <p className="ac-sm ac-lh">{selPlan.entryCriteria}</p>
              </div>

              <div>
                <span className="ac-section-title">准出标准</span>
                <p className="ac-sm ac-lh">{selPlan.exitCriteria}</p>
              </div>

              {selPlan.blockers.length > 0 && (
                <div>
                  <span className="ac-section-title">当前阻塞项</span>
                  {selPlan.blockers.map((b, i) => (
                    <div key={i} className="ac-hint ac-hint--warn ac-mt-1">{b}</div>
                  ))}
                </div>
              )}

              {selPlan.summary && (
                <div>
                  <span className="ac-section-title">小结</span>
                  <p className="ac-sm ac-lh">{selPlan.summary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Drawer>

      {/* ============================================================
           导入 Modal（XMind / Excel）
           ============================================================ */}
      <Modal
        open={importModalOpen}
        title={`导入 ${importType === 'xmind' ? 'XMind' : 'Excel'}`}
        subtitle="字段映射预览与进度"
        width={640}
        onClose={() => { if (!importing) setImportModalOpen(false); }}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setImportModalOpen(false)} disabled={importing}>
              取消
            </button>
            <button type="button" className="ac-btn ac-btn--sm" onClick={runImport} disabled={importing}>
              {importing ? `导入中 ${importProgress}%…` : '确认导入'}
            </button>
          </div>
        }
      >
        <div className="ac-col ac-gap-3">
          <table className="ac-table ac-table--sm">
            <thead>
              <tr>
                <th>源字段</th>
                <th>→</th>
                <th>目标字段</th>
              </tr>
            </thead>
            <tbody>
              {importType === 'xmind' ? (
                <>
                  <tr><td>XMind 中心主题</td><td>→</td><td>模块</td></tr>
                  <tr><td>XMind 一级子主题</td><td>→</td><td>用例标题</td></tr>
                  <tr><td>XMind 二级子主题</td><td>→</td><td>测试步骤</td></tr>
                  <tr><td>XMind 备注</td><td>→</td><td>预期结果</td></tr>
                </>
              ) : (
                <>
                  <tr><td>Excel 列 A</td><td>→</td><td>用例编号</td></tr>
                  <tr><td>Excel 列 B</td><td>→</td><td>用例标题</td></tr>
                  <tr><td>Excel 列 C</td><td>→</td><td>前置条件</td></tr>
                  <tr><td>Excel 列 D</td><td>→</td><td>测试步骤</td></tr>
                  <tr><td>Excel 列 E</td><td>→</td><td>预期结果</td></tr>
                  <tr><td>Excel 列 F</td><td>→</td><td>优先级</td></tr>
                </>
              )}
            </tbody>
          </table>

          {importing && (
            <div className="ac-import-progress">
              <div className="ac-progress">
                <div className="ac-progress-bar ac-progress-bar--info" style={{ width: `${importProgress}%` }} />
              </div>
              <div className="ac-import-steps">
                <span style={{ opacity: importProgress >= 25 ? 1 : 0.4 }}>
                  {importProgress >= 25 ? '✓' : '○'} 解析文件
                </span>
                <span style={{ opacity: importProgress >= 50 ? 1 : 0.4 }}>
                  {importProgress >= 50 ? '✓' : '○'} 字段映射校验
                </span>
                <span style={{ opacity: importProgress >= 75 ? 1 : 0.4 }}>
                  {importProgress >= 75 ? '✓' : '○'} 去重合并
                </span>
                <span style={{ opacity: importProgress >= 100 ? 1 : 0.4 }}>
                  {importProgress >= 100 ? '✓' : '○'} 写入用例库
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ============================================================
           一键提 Bug 确认 Modal
           ============================================================ */}
      <Modal
        open={bugModalOpen}
        title="一键创建缺陷"
        subtitle={bugModalCase ? `基于失败用例 ${bugModalCase.id}` : ''}
        width={520}
        onClose={() => setBugModalOpen(false)}
        footer={
          <div className="ac-row ac-gap-2">
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setBugModalOpen(false)}>
              取消
            </button>
            <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={confirmCreateBug}>
              <Bot size={13} /> 确认创建
            </button>
          </div>
        }
      >
        {bugModalCase && (
          <div className="ac-col ac-gap-3">
            <div className="ac-hint ac-hint--ai">
              将自动创建缺陷（带 AI 归因摘要）并推送给对应模块处理人。
            </div>
            <dl className="ac-kv">
              <dt>来源用例</dt><dd className="ac-mono">{bugModalCase.id}</dd>
              <dt>失败原因</dt><dd>{bugModalCase.actual || '断言失败'}</dd>
              <dt>关联模块</dt><dd>{TEST_MODULE_MAP[bugModalCase.moduleId]?.name ?? bugModalCase.moduleId}</dd>
              <dt>建议优先级</dt><dd>{bugModalCase.priority}</dd>
            </dl>
          </div>
        )}
      </Modal>

      {/* ============================================================
           新建用例 Modal
           ============================================================ */}
      <Modal
        open={createOpen}
        title="新建测试用例"
        subtitle={`将录入到用例库（当前 ${allCases.length} 条），起始状态为「待执行」`}
        width={760}
        onClose={closeCreate}
        footer={
          <div className="ac-row ac-gap-3">
            <button type="button" className="ac-btn ac-btn--ai ac-btn--sm" onClick={runAiDraft}>
              <Zap size={13} />
              AI 生成步骤与预期
            </button>
            <div className="ac-ml-auto" />
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={closeCreate}>
              取消
            </button>
            <button type="button" className="ac-btn ac-btn--primary ac-btn--sm" onClick={submitCreate}>
              录入用例
            </button>
          </div>
        }
      >
        <FormGrid cols={2}>
          <FormGroupTitle title="基本信息" note={`编号 ${nextCaseId}`} />
          <TextField
            label="用例标题" required full
            value={form.title} onChange={(v) => patchForm('title', v)}
            error={errors.title}
            placeholder="如：相同 Idempotency-Key 重复提交仅生成一笔订单"
            maxLength={80}
          />
          <SelectField
            label="所属模块" required
            value={form.moduleId} onChange={(v) => patchForm('moduleId', v)}
            options={moduleOptions} error={errors.moduleId}
            placeholder="请选择测试模块"
          />
          <SelectField
            label="所属计划" required
            value={form.planId} onChange={(v) => patchForm('planId', v)}
            options={planOptions} error={errors.planId}
            placeholder="请选择测试计划"
          />
          <SelectField
            label="关联需求"
            value={form.reqId} onChange={(v) => patchForm('reqId', v)}
            options={reqOptions} placeholder="可选"
          />
          <SelectField
            label="关联任务"
            value={form.taskId} onChange={(v) => patchForm('taskId', v)}
            options={taskOptions} placeholder="可选"
          />
          <TextField
            label="关联 API" mono
            value={form.apiId} onChange={(v) => patchForm('apiId', v)}
            placeholder="如：API-01"
          />

          <FormGroupTitle title="分类与状态" />
          <SelectField
            label="优先级" required
            value={form.priority} onChange={(v) => patchForm('priority', v)}
            options={[
              { value: 'P0', label: 'P0 · 阻塞级' },
              { value: 'P1', label: 'P1 · 高优先级' },
              { value: 'P2', label: 'P2 · 常规' },
            ]}
          />
          <SelectField
            label="测试类型" required
            value={form.type} onChange={(v) => patchForm('type', v)}
            options={[
              { value: '功能', label: '功能' },
              { value: '接口', label: '接口' },
              { value: '性能', label: '性能' },
              { value: '安全', label: '安全' },
              { value: '回归', label: '回归' },
              { value: '混沌', label: '混沌' },
            ]}
          />
          <SelectField
            label="是否自动化"
            value={form.auto} onChange={(v) => patchForm('auto', v)}
            options={[
              { value: 'no', label: '手工' },
              { value: 'yes', label: '自动化' },
            ]}
          />
          <SelectField
            label="用例作者" required
            value={form.authorId} onChange={(v) => patchForm('authorId', v)}
            options={userOptions} error={errors.authorId}
            placeholder="请选择作者"
          />

          <FormGroupTitle title="前置条件与步骤" />
          <TextareaField
            label="前置条件"
            value={form.preconditions} onChange={(v) => patchForm('preconditions', v)}
            rows={2}
            placeholder="如：Redis 7 可用；用户已完成实名"
          />
          <TextareaField
            label="测试步骤" required full
            value={form.steps} onChange={(v) => patchForm('steps', v)}
            error={errors.steps}
            rows={4}
            placeholder="每行一步，如：
前置：确认测试环境可用
步骤 1：调用下单接口
步骤 2：验证幂等记录"
          />
          <TextareaField
            label="预期结果" required full
            value={form.expected} onChange={(v) => patchForm('expected', v)}
            error={errors.expected}
            rows={4}
            placeholder="每行一条，如：
返回 201 与 orderId
幂等记录 hitCount = 5"
          />
        </FormGrid>

        {errors.ai ? (
          <div className="ac-hint ac-hint--danger ac-mt-3">
            <AlertTriangle size={14} />
            <span>{errors.ai}</span>
          </div>
        ) : null}

        {aiDraft ? (
          <div className="ac-hint ac-hint--ai ac-mt-3">
            <Bot size={14} />
            <span>{aiDraft.note}</span>
          </div>
        ) : null}

        {Object.keys(errors).filter((k) => k !== 'ai').length > 0 ? (
          <div className="ac-hint ac-hint--danger ac-mt-3">
            <AlertTriangle size={14} />
            <span>
              还有 {Object.keys(errors).filter((k) => k !== 'ai').length} 处待修正：
              {Object.keys(errors).filter((k) => k !== 'ai').map((k) => errors[k]).join('；')}
            </span>
          </div>
        ) : null}

        {!aiDraft && !Object.keys(errors).length ? (
          <div className="ac-hint ac-hint--ai ac-mt-3">
            <Bot size={14} />
            <span>提示：填写标题与模块后可用「AI 生成步骤与预期」快速生成测试骨架，生成后仍可手工修改。</span>
          </div>
        ) : null}
      </Modal>

      {/* ============================================================
           Toast
           ============================================================ */}
      {toast && (
        <div className="ac-toast-wrap">
          <div className={`ac-toast ac-toast--${toast.tone}`}>
            {toast.tone === 'ai' ? <Bot size={15} /> : <CheckCircle2 size={15} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}