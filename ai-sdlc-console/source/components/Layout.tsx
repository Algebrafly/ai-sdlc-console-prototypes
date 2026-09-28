import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bell,
  Boxes,
  Braces,
  Bug,
  Building2,
  CalendarRange,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Cpu,
  FileText,
  FlaskConical,
  FolderKanban,
  Gauge,
  Inbox,
  Kanban,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Link2,
  Menu,
  MessageSquareText,
  Network,
  Package,
  Plug,
  Rocket,
  Search,
  ShieldCheck,
  SquareKanban,
  Terminal,
  TrendingUp,
  UserRound,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { CURRENT_USER, ROLES, SPRINTS } from '../data';

interface LayoutProps {
  page: string;
  setPage: (id: string) => void;
  pageTitle: string;
  children: ReactNode;
}

type MenuItem = { id: string; label: string; icon: LucideIcon };
type MenuGroup = { id: string; title: string; icon: LucideIcon; items: MenuItem[] };

/** 七大分组 · 覆盖「项目与资源治理 + AI 研发生命周期全环节 + 知识与平台」 */
const MENU_GROUPS: MenuGroup[] = [
  {
    id: 'g-overview',
    title: '总览',
    icon: LayoutDashboard,
    items: [{ id: 'overview', label: '总览驾驶舱', icon: Gauge }],
  },
  {
    id: 'g-resource',
    title: '项目与资源',
    icon: Building2,
    items: [
      { id: 'project', label: '项目管理', icon: FolderKanban },
      { id: 'people', label: '人员管理', icon: UserRound },
      { id: 'team', label: '团队管理', icon: Users },
    ],
  },
  {
    id: 'g-discovery',
    title: '需求与设计',
    icon: FileText,
    items: [
      { id: 'req-pool', label: '需求管理', icon: Inbox },
      { id: 'requirement', label: '需求工作台', icon: MessageSquareText },
      { id: 'prototype', label: 'AI 原型工坊', icon: LayoutTemplate },
      { id: 'design', label: '架构设计与任务拆解', icon: Network },
    ],
  },
  {
    id: 'g-delivery',
    title: '交付执行',
    icon: Kanban,
    items: [
      { id: 'board', label: '任务看板', icon: SquareKanban },
      { id: 'schedule', label: '排期甘特', icon: CalendarRange },
      { id: 'coding', label: 'AI 编码协作', icon: Braces },
    ],
  },
  {
    id: 'g-quality',
    title: '发布与质量',
    icon: Rocket,
    items: [
      { id: 'release', label: '版本管理', icon: Package },
      { id: 'pipeline', label: '部署流水线', icon: Workflow },
      { id: 'test', label: '测试中心', icon: FlaskConical },
      { id: 'api-test', label: '接口自动化测试', icon: Terminal },
      { id: 'bug', label: 'Bug 流转', icon: Bug },
    ],
  },
  {
    id: 'g-insight',
    title: '度量洞察',
    icon: TrendingUp,
    items: [{ id: 'insight', label: '效能报表', icon: ChartColumn }],
  },
  {
    id: 'g-platform',
    title: '知识与平台',
    icon: Plug,
    items: [
      { id: 'knowledge', label: '企业知识库', icon: Library },
      { id: 'integration', label: 'PingCode 集成中心', icon: Link2 },
      { id: 'ai-observe', label: 'AI 能力观测', icon: Cpu },
      { id: 'settings', label: '安全与审计', icon: ShieldCheck },
    ],
  },
];

/** 顶栏未读通知数（原型固定值） */
const NOTICE_COUNT = 6;

/** 根据 pageId 找到所属分组标题，用于面包屑第二级 */
function findGroupTitle(pageId: string): string {
  const group = MENU_GROUPS.find((g) => g.items.some((item) => item.id === pageId));
  return group ? group.title : '工作台';
}

export default function Layout({ page, setPage, pageTitle, children }: LayoutProps) {
  /** 侧边栏整体收起（64px 图标态） */
  const [collapsed, setCollapsed] = useState(false);
  /** 各分组展开/收起状态，默认全部展开 */
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>({});
  /** 当前扮演角色，默认「管理者」 */
  const [roleId, setRoleId] = useState<string>(CURRENT_USER.defaultRoleId);
  /** 当前迭代 */
  const [sprintId, setSprintId] = useState<string>(SPRINTS.find((s) => s.status === 'active')?.id ?? SPRINTS[0].id);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [sprintMenuOpen, setSprintMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const topbarRef = useRef<HTMLDivElement>(null);
  const sidebarFootRef = useRef<HTMLDivElement>(null);

  const activeRole = ROLES.find((r) => r.id === roleId) ?? ROLES[0];
  const activeSprint = SPRINTS.find((s) => s.id === sprintId) ?? SPRINTS[0];

  /* 点击空白处关闭浮层 */
  useEffect(() => {
    if (!roleMenuOpen && !sprintMenuOpen && !noticeOpen) return undefined;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sidebarFootRef.current?.contains(target)) {
        setSprintMenuOpen(false);
        setNoticeOpen(false);
        return;
      }
      if (topbarRef.current?.contains(target)) {
        setRoleMenuOpen(false);
        return;
      }
      setRoleMenuOpen(false);
      setSprintMenuOpen(false);
      setNoticeOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [roleMenuOpen, sprintMenuOpen, noticeOpen]);

  /* 切页时收起移动端抽屉 */
  useEffect(() => {
    setMobileNavOpen(false);
  }, [page]);

  const toggleGroup = (id: string) =>
    setGroupCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const go = (id: string) => setPage(id);

  return (
    <div className="ac-app">
      {/* ================= 侧边栏 ================= */}
      <aside
        className={`ac-sidebar ${collapsed ? 'ac-sidebar--collapsed' : ''} ${
          mobileNavOpen ? 'ac-sidebar--mobile-open' : ''
        }`}
      >
        {/* Logo 区：可整体收起 */}
        <div className="ac-sidebar-logo">
          <span className="ac-sidebar-logo-icon">
            <Boxes size={18} />
          </span>
          <div className="ac-sidebar-logo-text">
            <strong>AI 研发协作控制台</strong>
            <small>ARTISAN SDLC CONSOLE</small>
          </div>
          <button
            type="button"
            className="ac-sidebar-collapse"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>

        {/* 菜单：7 分组 */}
        <nav className="ac-menu">
          {MENU_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const isCollapsed = Boolean(groupCollapsed[group.id]);
            return (
              <div key={group.id} className="ac-menu-group">
                <div
                  className={`ac-menu-group-title ${isCollapsed ? 'ac-menu-group-title--collapsed' : ''}`}
                  onClick={() => toggleGroup(group.id)}
                  title={collapsed ? group.title : undefined}
                >
                  <GroupIcon size={14} />
                  <span>{group.title}</span>
                  <ChevronDown size={14} className="ac-menu-caret" />
                </div>
                {!isCollapsed && (
                  <div className="ac-menu-items">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const active = page === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`ac-menu-item ${active ? 'ac-menu-item--active' : ''}`}
                          onClick={() => go(item.id)}
                          title={collapsed ? item.label : undefined}
                        >
                          <span className="ac-menu-item-icon">
                            <ItemIcon size={16} />
                          </span>
                          <span className="ac-menu-item-label">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* 底部用户卡：7 角色可切换 */}
        <div className="ac-sidebar-foot" ref={sidebarFootRef}>
          {roleMenuOpen && !collapsed ? (
            <div className="ac-role-menu">
              <div className="ac-role-menu-title">切换视角（{ROLES.length} 个角色）</div>
              {ROLES.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={`ac-role-option ${role.id === roleId ? 'ac-role-option--active' : ''}`}
                  onClick={() => {
                    setRoleId(role.id);
                    setRoleMenuOpen(false);
                  }}
                  title={role.desc}
                >
                  <span className={`ac-avatar ac-avatar--xs ac-avatar--${role.color}`}>{role.initial}</span>
                  <span>{role.name}</span>
                  {role.id === roleId ? (
                    <span className="ac-role-option-mark">
                      <Check size={14} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="ac-user-card"
            onClick={() => setRoleMenuOpen((v) => !v)}
            title={`${CURRENT_USER.name} · ${activeRole.name}`}
          >
            <span className={`ac-avatar ac-avatar--sm ac-avatar--${CURRENT_USER.avatarColor}`}>
              {CURRENT_USER.initial}
            </span>
            <span className="ac-user-card-meta">
              <span className="ac-user-card-name">{CURRENT_USER.name}</span>
              <span className="ac-user-card-role">{activeRole.short} · {activeRole.name}</span>
            </span>
            <ChevronDown size={14} className="ac-user-card-caret" />
          </button>
        </div>
      </aside>

      {/* ================= 主区域 ================= */}
      <div className="ac-main">
        <header className="ac-topbar" ref={topbarRef}>
          <div className="ac-topbar-left">
            <button
              type="button"
              className="ac-icon-btn ac-topbar-menu-btn"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="打开导航"
            >
              <Menu size={18} />
            </button>

            {/* 面包屑 */}
            <nav className="ac-crumb" aria-label="面包屑">
              <span className="ac-crumb-item" onClick={() => go('overview')}>
                AI 研发协作平台
              </span>
              <span className="ac-crumb-sep">/</span>
              <span className="ac-crumb-item" onClick={() => go('overview')}>{findGroupTitle(page)}</span>
              <span className="ac-crumb-sep">/</span>
              <span className="ac-crumb-current">{pageTitle}</span>
            </nav>
          </div>

          <div className="ac-topbar-right">
            {/* 全局搜索 */}
            <div className="ac-topbar-search">
              <Search size={15} />
              <input
                className="ac-input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索需求 / 任务 / Bug / 文档"
                aria-label="全局搜索"
              />
              <span className="ac-topbar-search-kbd">⌘K</span>
            </div>

            {/* 迭代选择器 */}
            <div className="ac-relative">
              <button
                type="button"
                className="ac-sprint-select"
                onClick={() => setSprintMenuOpen((v) => !v)}
                aria-label="切换迭代"
              >
                <span className="ac-col ac-gap-0">
                  <span className="ac-sprint-select-label">{activeSprint.name}</span>
                  <span className="ac-sprint-select-sub">{activeSprint.theme}</span>
                </span>
                <ChevronDown size={14} className="ac-muted" />
              </button>
              {sprintMenuOpen ? (
                <div className="ac-sprint-menu">
                  {SPRINTS.map((sprint) => (
                    <button
                      key={sprint.id}
                      type="button"
                      className={`ac-sprint-option ${sprint.id === sprintId ? 'ac-sprint-option--active' : ''}`}
                      onClick={() => {
                        setSprintId(sprint.id);
                        setSprintMenuOpen(false);
                      }}
                    >
                      <span className="ac-row ac-gap-2">
                        <span className="ac-sprint-option-name">{sprint.name}</span>
                        <span className={`ac-tag ac-tag--${sprint.tone}`}>{sprint.statusLabel}</span>
                      </span>
                      <span className="ac-sprint-option-meta">
                        {sprint.theme} · {sprint.startDate} ~ {sprint.endDate} · 进度 {sprint.progress}%
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* 通知铃铛 */}
            <div className="ac-relative">
              <button
                type="button"
                className="ac-icon-btn"
                onClick={() => setNoticeOpen((v) => !v)}
                aria-label={`通知，${NOTICE_COUNT} 条未读`}
              >
                <Bell size={18} />
                <span className="ac-icon-btn-badge">{NOTICE_COUNT}</span>
              </button>
              {noticeOpen ? (
                <div className="ac-sprint-menu" style={{ width: 320 }}>
                  <div className="ac-role-menu-title">通知中心 · 未读 {NOTICE_COUNT}</div>
                  {NOTICES.map((notice) => (
                    <div key={notice.id} className="ac-sprint-option" style={{ cursor: 'default' }}>
                      <span className="ac-row ac-gap-2">
                        <span className={`ac-badge ac-badge--${notice.tone}`}>{notice.channel}</span>
                        <span className="ac-sprint-option-name" style={{ fontSize: 12.5 }}>{notice.title}</span>
                      </span>
                      <span className="ac-sprint-option-meta">{notice.time} · {notice.target}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* 当前角色标识 */}
            <span className={`ac-tag ac-tag--${activeRole.tagTone}`} title={activeRole.desc}>
              {activeRole.short}视角
            </span>
          </div>
        </header>

        <main className="ac-content">{children}</main>
      </div>
    </div>
  );
}

/** 顶栏通知中心的固定示例数据 */
const NOTICES: {
  id: string;
  channel: string;
  tone: string;
  title: string;
  time: string;
  target: string;
}[] = [
  { id: 'n1', channel: '门禁', tone: 'danger', title: '发布门禁 G3 未通过：单测覆盖率 71.4%', time: '03-19 17:42', target: 'PIPE-2409' },
  { id: 'n2', channel: 'Bug', tone: 'warn', title: 'BUG-1043 优惠券叠加金额计算异常，AI 已定位', time: '03-19 16:08', target: '订单中心重构' },
  { id: 'n3', channel: '评审', tone: 'info', title: 'PRD v2.3 待你评审：退款链路时序变更', time: '03-19 14:20', target: 'REQ-2401' },
  { id: 'n4', channel: 'AI', tone: 'ai', title: 'AI 生成 TASK-2407 实现方案，等待人工确认', time: '03-19 11:55', target: 'TASK-2407' },
  { id: 'n5', channel: '同步', tone: 'ok', title: 'PingCode 双向同步完成，新增 3 个工作项', time: '03-19 10:02', target: '集成中心' },
  { id: 'n6', channel: '排期', tone: 'warn', title: 'TASK-2412 与 TASK-2415 资源冲突（周浩然）', time: '03-18 18:31', target: 'Sprint 24' },
];
