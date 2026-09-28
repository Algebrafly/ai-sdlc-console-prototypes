# impl-07 浏览器协同控制台实施方案

| 项 | 值 |
|:---|:---|
| 文档编号 | impl-07 |
| 版本 | v1.1 |
| 对应原型 | `makepro/src/prototypes/ai-sdlc-console`（**21 页面**，Hash 多页路由；v1.0 为 13 页面，本轮扩展） |
| 覆盖架构层 | 第 ④ 层「浏览器协同控制台」 |
| 依赖文档 | impl-00（架构总览）、impl-01（通信协议）、impl-02（Agent 编排）、impl-03（状态机）、impl-04（数据模型）、impl-05（外部集成）、impl-08（安全与权限）；**本轮扩展追加**：impl-10（管理类五域）、impl-11（AxHub 原型）、impl-12（hifox 接口自动化）、impl-13（WeKnora 知识库） |
| 关联阶段 | impl-09 的 P0（框架与设计系统）、P1~P4（分页面交付）；本轮新增页面分别落在 P3（`api-test`）、P4（`project`/`people`/`team`/`req-pool`/`release`）、P0+P2+P4（`knowledge`），`prototype` 跨 P0~P2 |
| 被引用为母版 | 本篇 §3.1（三向映射）、§6.1（角色可见性矩阵）、§7（工时拆分）三张表的**列定义**被 impl-10 §6/§7/§9、impl-11 §8.1/§9、impl-12 §9.1/§9.2/§9.3、impl-13 §11.1/§11.2/§11.3 声明为「完全同构，可被其直接引用合并」（本轮扩展） |

## 本篇范围

本篇把设计方案第四章「浏览器协同控制台」落到可开工的前端实施方案：**21 个页面 ↔ 后端 REST 接口 ↔ 实时订阅主题的三向映射**、前端技术选型与目录结构、共享组件清单与复用规则、状态管理与数据刷新策略、按角色的视图权限差异、分页面工时拆分与并行分组；自 v1.1 起追加**批注锚点体系**（§11）与 8 个新页面 / 3 个增强页面的全部映射、矩阵与验收项。

**不在本篇范围**：消息信封字段定义与 WSS 握手细节（见 impl-01）、Agent 输入输出 Schema（见 impl-02）、状态迁移守卫（见 impl-03）、表结构与索引（见 impl-04）、PingCode Provider 实现（见 impl-05）、IDE 侧 Webview/Tool Window（见 impl-06）、出网与脱敏（见 impl-08）；**本轮扩展追加**：管理类五域的表 / 接口 / 状态机 / AI 能力（见 impl-10）、AxHub 原型生成流水线与端到端编排（见 impl-11）、hifox 用例生成与执行报告链路（见 impl-12）、WeKnora 归档映射与检索图谱（见 impl-13）。本篇只承接这四篇的**三向映射行、角色可见性行与工时行**，不重复其领域细节。

---

## 1. 页面清单与导航结构

### 1.1 21 个页面（`index.tsx` 为唯一事实源）

| # | pageId | 页面标题 | SDLC 环节 | 侧边栏分组 | 组件文件 |
|:--:|:---|:---|:---|:---|:---|
| 1 | `overview` | 总览驾驶舱 | 全环节 | 总览 | `pages/OverviewPage.tsx` |
| 2 | `requirement` | 需求工作台 | ① 需求 | 需求与设计 | `pages/RequirementPage.tsx` |
| 3 | `design` | 架构设计与任务拆解 | ② 设计 | 需求与设计 | `pages/DesignPage.tsx` |
| 4 | `board` | 任务看板 | ②③ 交付 | 交付执行 | `pages/BoardPage.tsx` |
| 5 | `schedule` | 排期甘特 | ③ 排期 | 交付执行 | `pages/SchedulePage.tsx` |
| 6 | `coding` | AI 编码协作 | ④ 编码 | 交付执行 | `pages/CodingPage.tsx` |
| 7 | `pipeline` | 部署流水线 | ④⑤ 部署 | 发布与质量 | `pages/PipelinePage.tsx` |
| 8 | `test` | 测试中心 | ⑥ 测试 | 发布与质量 | `pages/TestPage.tsx` |
| 9 | `bug` | Bug 流转 | ⑥ 缺陷 | 发布与质量 | `pages/BugPage.tsx` |
| 10 | `insight` | 效能报表 | 度量 | 度量洞察 | `pages/InsightPage.tsx` |
| 11 | `integration` | PingCode 集成中心 | 横向 | 平台集成 | `pages/IntegrationPage.tsx` |
| 12 | `ai-observe` | AI 能力观测 | 横向 | 平台集成 | `pages/AiObservePage.tsx` |
| 13 | `settings` | 安全与审计 | 横向 | 平台集成 | `pages/SettingsPage.tsx` |
| 14 | `project` | 项目管理 | 治理层（跨迭代组合视角） | 项目与资源 | `pages/ProjectPage.tsx`（**本轮扩展**，impl-10） |
| 15 | `people` | 人员管理 | 治理层（人的产能与技能） | 项目与资源 | `pages/PeoplePage.tsx`（**本轮扩展**，impl-10） |
| 16 | `team` | 团队管理 | 治理层（编制与协作阻塞） | 项目与资源 | `pages/TeamPage.tsx`（**本轮扩展**，impl-10） |
| 17 | `req-pool` | 需求管理 | ① 需求（进入迭代**之前**的候选池） | 需求与设计 | `pages/ReqPoolPage.tsx`（**本轮扩展**，impl-10） |
| 18 | `prototype` | AI 原型工坊 | ①② 需求 / 设计（PRD 定稿后自动出原型） | 需求与设计 | `pages/PrototypePage.tsx`（**本轮扩展**，impl-11） |
| 19 | `release` | 版本管理 | ⑤ 发布（发布**之前**的规划与冻结） | 发布与质量 | `pages/ReleasePage.tsx`（**本轮扩展**，impl-10） |
| 20 | `api-test` | 接口自动化测试 | ⑥ 测试（接口级） | 发布与质量 | `pages/ApiTestPage.tsx`（**本轮扩展**，impl-12） |
| 21 | `knowledge` | 企业知识库 | 横向（全 6 环节产物归档与检索） | 知识与平台 | `pages/KnowledgePage.tsx`（**本轮扩展**，impl-13） |

> **序号说明**：上表 1~13 为 v1.0 既有行，**原样保留**（含其原始序号与分组名，`integration`/`ai-observe`/`settings` 三行的分组名沿用 v1.0 的「平台集成」写法，其在 `Layout.tsx` 中的现名已改为「知识与平台」，见 §1.2）；14~21 为本轮追加。
>
> **真实的展示顺序以 `index.tsx` 的 `route` 数组为准**（`PAGE_TITLES` 与 `PAGES` 三处键序完全一致），即：
>
> ```
> overview → project → people → team → req-pool → requirement → prototype → design
>          → board → schedule → coding → release → pipeline → test → api-test → bug
>          → insight → knowledge → integration → ai-observe → settings
> ```
>
> 该顺序按「总览 → 治理层 → SDLC 六环节纵向 → 度量 → 横向平台能力」编排，与本表的「既有行在前、新增行在后」的**文档编号顺序**不同，两者均有效但用途不同：本表用于**追溯 v1.0 → v1.1 的增量**，`route` 数组用于**侧边栏与路由的实际渲染顺序**。

### 1.2 侧边栏分组（`components/Layout.tsx`）

**7 大分组（本轮扩展：6 → 7）**，逐字取自 `MENU_GROUPS`，成员顺序与数组一致：

| 分组 id | 分组标题 | 分组图标 | 页面数 | 包含 pageId（按 `items` 数组顺序） |
|:---|:---|:---|:--:|:---|
| `g-overview` | 总览 | `LayoutDashboard` | 1 | `overview`（`Gauge`） |
| `g-resource` | **项目与资源**（本轮新增分组） | `Building2` | 3 | `project`（`FolderKanban`）、`people`（`UserRound`）、`team`（`Users`） |
| `g-discovery` | 需求与设计 | `FileText` | 4 | `req-pool`（`Inbox`，**新**）、`requirement`（`MessageSquareText`）、`prototype`（`LayoutTemplate`，**新**）、`design`（`Network`） |
| `g-delivery` | 交付执行 | `Kanban` | 3 | `board`（`SquareKanban`）、`schedule`（`CalendarRange`）、`coding`（`Braces`） |
| `g-quality` | 发布与质量 | `Rocket` | 5 | `release`（`Package`，**新**）、`pipeline`（`Workflow`）、`test`（`FlaskConical`）、`api-test`（`Terminal`，**新**）、`bug`（`Bug`） |
| `g-insight` | 度量洞察 | `TrendingUp` | 1 | `insight`（`ChartColumn`） |
| `g-platform` | **知识与平台**（原名「平台集成」，本轮改名） | `Plug` | 4 | `knowledge`（`Library`，**新**）、`integration`（`Link2`）、`ai-observe`（`Cpu`）、`settings`（`ShieldCheck`） |
| **合计** | 7 分组 | — | **21** | — |

**v1.0 → v1.1 分组变更逐条**：

| 变更类型 | 内容 |
|:---|:---|
| 新增分组 | `g-resource`「项目与资源」（`Building2`），承载 `project` / `people` / `team` 三个治理层页面 |
| 分组改名 | `g-platform`：「平台集成」→「**知识与平台**」（`Plug` 图标不变），因新增 `knowledge` 页后该分组不再只是「集成」 |
| 成员扩充 | `g-discovery` 2 → 4（新增 `req-pool`、`prototype`）；`g-quality` 3 → 5（新增 `release`、`api-test`）；`g-platform` 3 → 4（新增 `knowledge`） |
| 成员不变 | `g-overview`（1）、`g-delivery`（3）、`g-insight`（1） |

> `Layout.tsx` 中 `MENU_GROUPS` 上方的注释原文为「七大分组 · 覆盖「项目与资源治理 + AI 研发生命周期全环节 + 知识与平台」」；但 `<nav className="ac-menu">` 上方的行内注释仍写「菜单：6 分组」，**属遗留注释未同步**（不影响渲染，`MENU_GROUPS.length === 7`）。本篇只登记，不代改 `.tsx`。

### 1.3 路由与全局壳

- **路由**：Hash 多页路由 `#page=<pageId>`，由 `src/common/useHashPage.ts` 的 `defineHashPageRoute` + `useHashPage` 提供，`defaultPageId: 'overview'`。刷新后按 hash 定位，无 history 依赖，适配 Make 管理端 `?p=<prototype-id>` 直链。
- **面包屑**：`AI 研发协作平台 > <分组标题> > <页面标题>`，分组标题由 `findGroupTitle(pageId)` 反查。
- **全局壳常驻件**：迭代选择器（`SP-24` 等）、角色切换器（7 角色）、全局搜索、通知中心（6 条固定示例）、当前用户卡。切换角色会改变落地页与可见区块（§6）。
- **（本轮扩展）路由注册数**：`index.tsx` 的 `defineHashPageRoute` 注册 **21 个** `{ id, title }`，`PAGE_TITLES` 与 `PAGES` 两张 `Record` 的键集合与之**完全一致**（21 键）；非法 pageId 由 `PAGES[page] ?? OverviewPage` 兜底回落总览。
- **（本轮扩展）面包屑反查**：`findGroupTitle(pageId)` 在 7 个分组的 `items` 中线性查找，未命中时返回字符串 `'工作台'`（21 个 pageId 全部命中，该兜底分支实际不可达）。
- **（本轮扩展）移动端抽屉**：`Layout.tsx` 新增 `mobileNavOpen` 状态与 `ac-sidebar--mobile-open` 类，顶栏 `ac-topbar-menu-btn`（`aria-label="打开导航"`）切换；`useEffect` 监听 `page` 变化后自动收起，避免切页后抽屉遮挡内容。

---

## 2. 前端技术选型

| 维度 | 选型 | 理由 | 被否方案 |
|:---|:---|:---|:---|
| 框架 | React 18.2 + TypeScript `strict` | 与 IDE 插件 Webview（impl-06）共用组件心智；类型契约可由 impl-01 Schema 生成 | Vue 3（团队无存量）；纯 HTML（无法承载 21 页复杂交互，本轮扩展） |
| 构建 | Vite 5.4 | 秒级冷启动，`ENTRY_KEY` 多入口隔离，产物单文件便于 Make 托管 | Webpack（配置成本高）；Rspack（生态未验证） |
| 状态管理 | **无外部库**：`useState` + `useMemo` 派生 + 按页面自持 | 页面之间零共享状态（各页只读 4 个数据模块，本轮扩展：`data.ts` / `data-mgmt.ts` / `data-ai-flow.ts` / `data-kb.ts`），引入 Redux/Zustand 属过度设计 | Redux Toolkit（样板代码重）；Zustand（跨页共享需求不存在）；React Query（真实实现阶段再引入，见 §5.6） |
| 样式 | 原生 CSS + CSS 变量 token + `ac-` 前缀 BEM 风格 | 零运行时开销；token 集中便于换肤；原型与生产可 1:1 迁移 | Tailwind（与既有 1762 非空行 token 体系冲突）；CSS-in-JS（运行时开销 + SSR 复杂度）；CSS Modules（跨页复用通用类反而变难） |
| 图表 | **内联 SVG 手绘**（折线/条形/环形/堆叠条；本轮扩展追加：四象限散点、热力网格、组织架构树、漏斗、力导向图、版本时间线、场景链路图、瀑布图、哑铃图、雷达图、月历、时序泳道图） | 无依赖、可完全对齐 token、包体小；数据点 ≤ 30 无性能压力 | ECharts（+300KB，且样式难对齐）；Recharts（同上）；D3（本轮 8 个新页均未引入） |
| 图标 | `lucide-react@0.562.0` | 树摇友好、线性风格统一 | Ant Design Icons（风格偏重） |
| 长列表 | 当前分页（`ac-page-btn`）；真实实现按 §5.5 阈值引入虚拟滚动 | 原型数据量 ≤ 50 行，虚拟化属过早优化 | 一开始就上 `react-window`（增加复杂度） |

### 2.1 目录结构

```
makepro/src/prototypes/ai-sdlc-console/
├── index.tsx              # 入口：@name、21 页路由注册、PAGE_TITLES、PAGES 映射、
│                          #       14 篇 markdown 的 ?raw 导入与 inlineDirectoryMarkdown()
├── data.ts                # 贯穿案例主数据（订单中心重构 Sprint 24），14,390 非空行，90 个 export const
├── data-mgmt.ts           # 【本轮新增】管理类五域，4,603 非空行 / 34 interface / 35 const → impl-10
├── data-ai-flow.ts        # 【本轮新增】外部能力对标 + 端到端编排 + AxHub 原型 + hifox 接口自动化
│                          #            + IDE 同步 + AI 排期与工时预估，5,512 非空行 / 47 interface / 27 const → impl-11、impl-12
├── data-kb.ts             # 【本轮新增】WeKnora 企业知识库，4,511 非空行 / 18 interface / 16 const / 2 type → impl-13
├── style.css              # 设计 token + 通用组件类（1,762 非空行 / 1,857 总行）
├── components/
│   ├── Layout.tsx         # 侧边栏（7 分组 · 21 项）+ 顶栏（面包屑/迭代/角色/通知/移动端抽屉）+ 内容容器
│   ├── Drawer.tsx         # 右侧抽屉（ESC/遮罩关闭）
│   └── Modal.tsx          # 居中弹窗（ESC/遮罩关闭）
├── pages/                 # 21 个页面组件 + 21 个页面独占 CSS（一一对应）
│   ├── OverviewPage.tsx        + overview.css        # ac-ov-
│   ├── ProjectPage.tsx         + project.css         # ac-pj-   【本轮新增】
│   ├── PeoplePage.tsx          + people.css          # ac-pp-   【本轮新增】
│   ├── TeamPage.tsx            + team.css            # ac-tmg-  【本轮新增】
│   ├── ReqPoolPage.tsx         + req-pool.css        # ac-rp-   【本轮新增】
│   ├── RequirementPage.tsx     + requirement.css     # ac-rq-
│   ├── PrototypePage.tsx       + prototype.css       # ac-pt-   【本轮新增】
│   ├── DesignPage.tsx          + design.css          # ac-dg-
│   ├── BoardPage.tsx           + board.css           # ac-bd-
│   ├── SchedulePage.tsx        + schedule.css        # ac-sch-
│   ├── CodingPage.tsx          + coding.css          # ac-ide-（本轮 IDE 同步区）/ ac-msg- / ac-diff- / ac-exec-
│   ├── ReleasePage.tsx         + release.css         # ac-rl-   【本轮新增】
│   ├── PipelinePage.tsx        + pipeline.css        # ac-pipe- / ac-gate- / ac-env-
│   ├── TestPage.tsx            + test.css            # 无页面前缀（历史约定：ac-tree- / ac-chip- / ac-fail- / ac-test-）
│   ├── ApiTestPage.tsx         + api-test.css        # ac-at-   【本轮新增】
│   ├── BugPage.tsx             + bug.css             # ac-bg-
│   ├── InsightPage.tsx         + insight.css         # ac-in-
│   ├── KnowledgePage.tsx       + knowledge.css       # ac-kb-   【本轮新增】
│   ├── IntegrationPage.tsx     + integration.css     # ac-ig-
│   ├── AiObservePage.tsx       + ai-observe.css      # ac-ao-
│   └── SettingsPage.tsx        + settings.css        # ac-st-
├── docs/                  # impl-00 ~ impl-13 十四篇实施方案【本轮扩展：10 → 14】
│   ├── impl-00-overview.md          impl-07-console.md
│   ├── impl-01-protocol.md          impl-08-security.md
│   ├── impl-02-agents.md            impl-09-roadmap.md
│   ├── impl-03-state-machine.md     impl-10-management.md         【本轮新增】
│   ├── impl-04-data-model.md        impl-11-prototype-axhub.md    【本轮新增】
│   ├── impl-05-integration.md       impl-12-api-test-hifox.md     【本轮新增】
│   └── impl-06-ide-plugin.md        impl-13-knowledge-weknora.md  【本轮新增】
└── annotation-source.json # Make 批注目录树（folder 3 / route 21 / markdown 14 / link 4）+ markdownMap（171 锚点）
```

**分层职责**：`index.tsx` 只做路由、页面装配与 markdown 内联，不含业务；`Layout.tsx` 只做导航壳与全局上下文（迭代/角色），不含页面数据；`pages/*` 自持本页状态与派生计算；**4 个数据模块**（`data.ts` 为主数据，`data-mgmt.ts` / `data-ai-flow.ts` / `data-kb.ts` 为三个新域）是唯一数据源，三个新模块**只 import `data.ts`、彼此不互相依赖**（详见 impl-00 §9.3），页面之间**不互相 import**（保证可并行开发、可独立删除）。

**页面独占 CSS 前缀清单（实测 21 个 `.css`，前缀取值经 grep 核实）**：

| 前缀 | 归属页面 / CSS 文件 | 来源 |
|:---|:---|:---|
| `ac-ov-` | `overview` / `overview.css` | 既有 |
| `ac-rq-` | `requirement` / `requirement.css` | 既有 |
| `ac-dg-` | `design` / `design.css` | 既有 |
| `ac-bd-` | `board` / `board.css` | 既有 |
| `ac-sch-` | `schedule` / `schedule.css` | 既有 |
| `ac-ide-`、`ac-msg-`、`ac-diff-`、`ac-exec-` | `coding` / `coding.css` | `ac-msg-`/`ac-diff-`/`ac-exec-` 既有；**`ac-ide-` 为本轮「本地 IDE 同步」区新增**（该文件内出现频次最高） |
| `ac-pipe-`、`ac-gate-`、`ac-env-` | `pipeline` / `pipeline.css` | 既有（三段前缀分别对应流水线泳道 / 门禁清单 / 环境与通知三个区块，非单一页面前缀） |
| （无页面前缀）`ac-tree-`、`ac-chip-`、`ac-fail-`、`ac-test-`、`ac-stack-` | `test` / `test.css` | 既有历史约定，**新增类不得再引入无前缀命名**（§4.2 规则 1） |
| `ac-bg-` | `bug` / `bug.css` | 既有 |
| `ac-in-` | `insight` / `insight.css` | 既有 |
| `ac-ig-` | `integration` / `integration.css` | 既有 |
| `ac-ao-` | `ai-observe` / `ai-observe.css` | 既有 |
| `ac-st-` | `settings` / `settings.css` | 既有 |
| **`ac-pj-`** | `project` / `project.css` | **本轮新增** |
| **`ac-pp-`** | `people` / `people.css` | **本轮新增** |
| **`ac-tmg-`** | `team` / `team.css` | **本轮新增** |
| **`ac-rp-`** | `req-pool` / `req-pool.css` | **本轮新增**（注意与 `requirement` 的 `ac-rq-` 区分：`rp` = req-pool，`rq` = requirement） |
| **`ac-pt-`** | `prototype` / `prototype.css` | **本轮新增** |
| **`ac-rl-`** | `release` / `release.css` | **本轮新增** |
| **`ac-at-`** | `api-test` / `api-test.css` | **本轮新增** |
| **`ac-kb-`** | `knowledge` / `knowledge.css` | **本轮新增** |

> **文件名与前缀不一一对应的两处**：`ReqPoolPage.tsx` → `req-pool.css`（连字符命名，前缀 `ac-rp-`）、`ApiTestPage.tsx` → `api-test.css`（连字符命名，前缀 `ac-at-`）。其余 19 个页面的 CSS 文件名与组件名严格同名（仅大小写与扩展名不同）。

---

## 3. 页面 ↔ API ↔ 订阅主题 三向映射（本文核心）

### 3.1 总表

REST 路径全部沿用 impl-01 §4 契约；标注「本文补充」者为 impl-01 未覆盖、按同一 `/api/v1/...` 风格补齐。订阅主题全部沿用 impl-01 §3.2 与 impl-03 §6 的 `sdlc.*` 命名。

**v1.1 变更（本轮扩展）**：① 表格由 5 列扩为 **6 列**，追加「关键交互」列，与 impl-10 §6 / impl-11 §8.1 / impl-12 §9.1 / impl-13 §11.1 的四张同构表**列定义完全一致**，可被其直接引用合并；② 既有 **13 行原样保留**（前 5 列文字逐字未改，仅补齐第 6 列，内容取自本篇 §3.2 的分页面要点）；③ **追加 8 行**覆盖新页面，其 6 个单元格**逐字摘取**自 impl-10 §6（`project` / `people` / `team` / `req-pool` / `release` 五行）、impl-11 §8.1（`prototype`）、impl-12 §9.1（`api-test`）、impl-13 §11.1（`knowledge`），接口编号与事件主题一律沿用原文，本篇不自造；④ `schedule` / `design` / `coding` 三行的「关键交互」列在既有描述**之后追加**本轮新增的 AI 能力，原有文字未删改。

| pageId | 主要数据域（impl-04 表） | REST 接口 | 实时订阅主题 | 刷新策略 | 关键交互 |
|:---|:---|:---|:---|:---|:---|
| `overview` | `task`、`defect`、`build`、`model_call_log` | `GET /metrics/overview`、`GET /tasks?mine=1&size=20`、`GET /requirements?sprintId=SP-24` | `sdlc.task.*`、`sdlc.gate.*`、`sdlc.bug.*` | 首屏拉取 + 订阅增量（流程条在制品数、待办、事件流） | 六环节横向流程条读 `SDLC_STAGES` 的在制品数与门禁健康色，点击跳页（`setPage`）；6 张核心指标卡；「分配给我的待办」按当前角色过滤；底部事件时间线携带 `traceId`（全站排查入口）。订阅后只更新计数与首条事件，不重拉整页（详见 §3.2） |
| `requirement` | `requirement`、`user_story`、`prd_version`、`prd_review` | `GET /requirements/{id}`、`GET /prd-versions?requirementId=`、`POST /brainstorm/sessions`、`POST /prd-versions/{id}/reviews`、`POST /requirements/{id}/decompose`、`PUT /requirements/{id}` | `sdlc.agent.<runId>`（流式）、`sdlc.sync.*` | SSE 流式追加 + 会话结束后整块刷新 PRD | 左侧 Brainstorm 按 `agent.stream.chunk` 分块追加，`done:true` 后落 PRD 草稿；右侧结构化 PRD（用户故事 As a / I want / So that + 验收标准、非功能需求、开放问题）；版本下拉切换拉 `diffSummary`；评审意见定位到 `storyRef`；「交给架构 Agent 拆解」确认框（待同步故事数 / 目标工作项类型 / 幂等提示）→ 按 `sync.status` 显示入队进度（详见 §3.2） |
| `design` | `requirement`、`task`、`code_link`、`external_id_map` | `GET /requirements/{id}`、`POST /tasks`、`PUT /tasks/{id}`、`GET /tasks?reqId=`、**`GET /api-contracts?reqId=`（本文补充）**、**`POST /requirements/{id}/sync-preview`（本文补充）** | `sdlc.sync.*`、`sdlc.task.*` | 首屏拉取；批量同步时按 `sync.status` 逐条更新行状态 | 四标签（架构文档 + SVG 组件关系图 / 接口定义 / 任务清单树 / 三点估算）；任务行内联编辑负责人与工时走 `PUT /tasks/{id}`（携带 `expectedVersion`，冲突返回 `SDLC-TASK-409` 需刷新重试）；「再拆解」展开子任务；底部实时汇总总工时与建议并行度；批量同步 PingCode 预览弹窗展示 `UUID ↔ external_id` 映射、目标工作项类型、幂等标记（已存在显示「更新」）、逐条进度与结果（成功/失败/进入重试队列）。**（本轮扩展）** ① 既有「三点估算」升级为 **AI 工时预估**：`AI_EFFORT_ESTIMATES` **12 条**（`EST-01`~`EST-12`）16 列表，含特征权重贡献瀑布图、人工 vs AI 对照图、误差收敛折线（ensemble 28.8% → 9.0%，数据源 `EFFORT_ACCURACY_TREND_ENSEMBLE` / `_CODE_SIZE` / `_COMPLEXITY`）；② 既有「AI 再拆解」升级为**真实拆解建议**：`AI_BREAKDOWN_SUGGESTIONS` **6 条**（`BRK-01`~`BRK-06`），DAG 图 + 逐条/部分采纳 + 9 项拆解质量自检；③ **门禁禁用态**：置信度 < 70% 且单一风险因子权重 ≥ 50% 时「采纳」按钮 `disabled`（`DesignPage.tsx` 第 2760 / 3565 行：`gate.blocked && !riskAck[e.id]` → `ac-btn--disabled`），真实禁用样例 `EST-04` / `EST-06` / `EST-12`，`ac-hint--danger` 逐条展开禁用原因，勾选「已知悉风险」（`riskAck`）后方可解禁 |
| `board` | `task`、`task_state_history`、`code_link` | `GET /tasks?state=&ownerId=&sprintId=&priority=&q=&mine=&page=`、`GET /tasks/{id}`、`GET /tasks/{id}/history`、`POST /tasks/{id}/transitions` | `sdlc.task.*`（含 `state_changed`/`assigned`/`blocked`） | 首屏拉取列计数；订阅事件做**卡片跨列移动**（局部更新，不整表重拉） | 按 impl-03 的 10 状态横向分列，列头显示状态名与计数；订阅 `sdlc.task.state_changed` 后**只移动对应卡片**并增减两列计数；`SDLC-STATE-409/422` 时卡片回弹并弹出守卫失败原因（如「增量分支覆盖率 68.2% 低于门禁阈值 85%」）；任务详情抽屉含描述、验收标准、流转历史（状态/时间/触发者/traceId）、关联提交与 Diff 摘要、本地测试结果、Agent 参与记录（详见 §3.2） |
| `schedule` | `task`、`task_state_history` | `GET /tasks?sprintId=SP-24`、**`GET /tasks/{id}/dependencies`（本文补充）**、**`GET /schedule/conflicts?sprintId=`（本文补充）**、`PUT /tasks/{id}` | `sdlc.task.*` | 首屏拉取 + 拖拽后乐观更新，失败回滚（§5.3） | 左侧任务树（负责人 + 工时）+ 右侧时间轴，周/日粒度切换；甘特条为 CSS 手绘（起止定位 + 进度填充），关键路径主色加粗描边；SVG 依赖箭头（FS 关系）与风险标记，悬停弹出风险说明（类型/影响天数/PMO Agent 建议）；顶部冲突告警条（负责人时间重叠、依赖倒挂）点击定位到具体任务。**（本轮扩展）** ① **AI 排期建议**：`AI_SCHEDULE_SUGGESTIONS` **8 条**（`SCH-01`~`SCH-08`）16 列表，逐条给出建议类型、影响面、约束校验结果与采纳动作；② **AI 冲突消解看板**：与 `data.ts` `GANTT_CONFLICTS` **6 条**（`GANTT-CF-01`~`GANTT-CF-06`）真实关联，其中 **4 条**被 `accepted` / `auto-applied` 的建议消解；③ **一键 AI 自动排期可回放流程**：基于 `AI_AUTOMATION_FLOWS` 的 `AIF-06`（迭代规划 → AI 排期与工时预估 → 冲突消解 → 甘特基线锁定，**8 步**，`autoRatePct=84`、`avgEndToEndMin=56`）逐步回放；④ **门禁禁用态**：约束校验不通过时「采纳」按钮 `disabled`（`SchedulePage.tsx` 第 1530 / 2801 行：`blockers.length > 0` → `ac-btn--disabled`），真实禁用样例 `SCH-02` / `SCH-03`，`ac-hint--danger` 展开阻塞项明细 |
| `coding` | `task`、`build`、`test_execution`、`code_link` | `GET /tasks/{id}/coding-session`、`POST /tasks/{id}/context-slices`、`GET /pipelines?taskId=`、`POST /tasks/{id}/transitions` | `sdlc.agent.<runId>`、`sdlc.task.*` | 会话流 SSE 追加；Diff 决策走 `coding.diff.decision`（WSS）后局部刷新 | 任务选择器 → AI 会话流（用户指令 / Agent 思考 / 工具调用 / 产出）按 `agent.stream.chunk` 与 `agent.tool_call` 渲染；上下文切片清单展示文件路径、行范围、符号名、**是否已脱敏**（与 impl-08 对齐）；并排 Diff（新增绿/删除红/行号）支持全部接受 / 全部拒绝 / 逐块接受，决策经 `coding.diff.decision` 上行；本地执行结果区（命令、退出码、耗时、通过/失败用例数、可展开日志摘要）经 `test.report` 上行后驱动 `dev → testGreen` 迁移；**仅当测试全绿**时「触发部署」可用并跳 `pipeline`，否则禁用并提示原因。**（本轮扩展）** 新增「**本地 IDE 同步**」区，呈现本地 IDE 的 AI 使用结果如何回流平台：① `IDE_SYNC_SESSIONS` **10 条**（`IDE-01`~`IDE-10`）16 列会话表；② `IDE_SYNC_EVENTS` **24 条**（`IDES-01`~`IDES-24`）事件流（`connect`/`auth`/`context-collect`/`mask`/`ai-turn`/`accept`/`reject`/`diff-upload`/`test-result`/`coverage`/`error`/`retry`/`conflict`/`offline-queue`/`flush`/`disconnect`）；③ 时序泳道图；④ `IDE_PLUGINS` 双端插件卡（`IDE-PLG-VSC` / `IDE-PLG-JB`）；⑤ **出网管控因果**：`egressMode` 为 `DENY` 的 **2 条**会话强制走 `mdl-local`，`MASK` 的 **7 条**走外部模型但先按 `redactRules` 脱敏；⑥ **G3 门禁联动**：G3 当前 `failed`，「触发部署」按钮禁用并逐条列出禁用原因（`CodingPage.tsx` 第 842 / 1989 / 2001 行「**「触发部署」已禁用，原因如下：**」） |
| `pipeline` | `build`、`pipeline_stage`、`notification_log` | `GET /pipelines/{id}`、`POST /pipelines/{id}/stages/{stageId}/retry`、`GET /gates?stageId=`、`POST /gates/{gateId}/waive`、`GET /environments`、`GET /releases?status=`、`POST /releases/{id}/execute`、`POST /releases/{id}/rollback` | `sdlc.pipeline.*`、`sdlc.gate.*`、`sdlc.notify.*` | 订阅驱动阶段条状态；门禁未过时禁用「发布到 PROD」（§5.4） | 横向流水线按 **8 个规范阶段**（`CANON_PHASES`）渲染泳道，数据层 `PIPELINE_STAGE_TEMPLATE` 实际为 **6 段**，页面按位次映射并在每个节点下以「对应阶段 {realName}」显式披露真实阶段名，未配置泳道降级为 `waiting`；每阶段带状态/耗时/日志入口，失败节点红色高亮 + 错误摘要 + 「重试该阶段」；发布门禁清单 **G1~G6 六道**逐项比对 `criteria` 与 `actual`，任一阻断类门禁未满足即禁用「发布到 PROD」并列出缺失项，`waive` 需 `SDLC-PIPE-403` 权限校验；「环境与通知」标签展示 DEV/STG/PROD 卡片与部署通知记录（详见 §3.2） |
| `test` | `test_case`、`test_plan`、`test_execution`、`defect` | `GET /test-cases?moduleId=&priority=&source=&q=`、`POST /test-cases/import`、`GET /test-cases/export`、`GET /test-plans?range=`、`POST /test-plans/{id}/execute`、`GET /test-reports/{id}` | `sdlc.gate.*`（G4）、`sdlc.bug.*` | 首屏拉取；导入按 `jobId` 轮询进度（§5.5）；「一键提 Bug」后订阅回插缺陷 | 三标签。用例库 = 左侧模块树（EPIC → 7 模块 → 用例）+ 右侧用例表（编号/标题/前置条件/步骤摘要/预期结果/优先级/类型/来源/关联需求）+ 状态 chips 筛选 + 「仅看自动化」开关；导入 XMind / Excel 走 `POST /test-cases/import`（`format` + `fieldMapping`），弹窗内展示字段映射预览与四步进度；执行记录 = 计划列表；测试报告 = 结论 + G4 门禁判定、覆盖率与性能对比、用例状态堆叠条、失败用例明细（堆栈摘要 + QA Agent 归因）、「一键提 Bug」、缺陷分布 SVG 条形图、轮次对比与签核（详见 §3.2） |
| `bug` | `defect`、`notification_log`、`task_state_history` | `GET /bugs?severity=&status=&assigneeId=&q=`、`GET /bugs/{id}`、`POST /bugs`、`POST /bugs/{id}/analysis`、`POST /bugs/{id}/transitions`、`POST /bugs/{id}/notify`、**`GET /bug-analysis?bugId=`（本文补充）**、**`GET /notify-rules` / `PUT /notify-rules/{id}`（本文补充）** | `sdlc.bug.*`（含 `created`/`state_changed`/`sla_escalated`）、`sdlc.notify.*` | 首屏拉取 + 订阅增量；「采纳建议并指派」乐观更新（§5.3） | 四标签。缺陷台账 + 关键字搜索 + 严重级/状态/指派人筛选 + 「仅看发布阻断」开关 + 行选与全选；「AI 分析」抽屉（缺陷摘要、AI 归因结论、5-Why、疑似问题代码位置、发生链路、影响面、修复方案候选、验证方案与预防动作）；**「采纳建议并指派」**确认框 → `POST /bugs/{id}/transitions` 走 `analyzing → fixing`（守卫 `report.approved && mrId != null && branch != null`，impl-03 §4）+ `POST /bugs/{id}/notify`；流转分析、通知与订阅、根因报告三标签（详见 §3.2、§5.3） |
| `insight` | `task`、`defect`、`build`、`model_call_log` | `GET /metrics/efficiency?range=7d\|30d\|quarter&dim=project\|team\|person` | — （纯查询，无实时需求） | 范围/维度切换即重拉；结果按 `range+dim` 键缓存 5 min | 时间范围（7 天/30 天/季度）× 维度（项目/团队/个人）联动刷新；四组指标卡（交付效率 / 缺陷密度 / 发布节奏 / AI 增效）+ SVG 折线面积趋势图 + AI 增效环形构成 + 交付榜与缺陷榜 Top 5 + 指标与榜单下钻抽屉（详见 §3.2） |
| `integration` | `external_id_map`、`sync_event`、`notification_log` | `GET /integrations/providers`、`GET/PUT /integrations/pingcode/config`、`GET /integrations/pingcode/state-mappings`、`GET /integrations/id-mappings?entityType=&q=`、`GET /integrations/sync-queue`、`POST /integrations/sync-queue/dead-letters/{id}/replay`、`POST /integrations/reconcile` | `sdlc.sync.*`、`sdlc.integration.*`（PingCode Webhook 入站，见 impl-05 §6） | 首屏拉取 + 订阅队列计数；死信重放后按 `itemId` 局部更新 | Provider 列表（PingCode 已启用，Jira/禅道/ONES/TAPD 未接入占位）+ 连接配置与连通性检测；数据模型映射表与状态工作流映射表（本平台 10 状态 ↔ PingCode 状态）；「标识映射」标签展示 `external_id ↔ 本地 UUID` + 搜索；「同步队列」标签展示四态计数、指数退避重试次数、死信队列（失败原因 + 人工重放）、最近对账结果与外部变更回写记录（详见 §3.2） |
| `ai-observe` | `model_call_log`、`rag_entry` | `GET /ai/models`、`GET /ai/routing-rules`、`GET /ai/model-stats?range=7d`、`GET /ai/agents`、`GET /ai/traces?agentId=&targetType=&targetId=`、`GET /ai/rag/entries?category=&q=` | `sdlc.agent.<runId>`（选中 trace 时可跟实时调用） | 首屏拉取；trace 列表 30s 轮询兜底 | 模型网关（5 模型列表 + 路由策略规则表 + 调用统计 SVG 条形图）；Agent 编排（7 个 Agent 输入输出契约摘要 + 近 7 日调用量；选中调用记录展示 `traceId` 串联的完整调用链，每跳耗时与 Token）；知识库（RAG 条目：标题/类型/来源/切片数/向量更新时间/被引用次数 + 类型筛选 + 条目摘要）。**（本轮扩展提示）** 本标签的 `rag_entry` 在 impl-13 §8.7 迁移后改读 `GET /api/v1/kb/docs`（经只读视图 `v_rag_entry` 过渡），页面结构与类名不变（详见 §3.2） |
| `settings` | `audit_log`、`project` | `GET /security/egress`、`PUT /security/egress`、`GET /security/redact-rules`、`PUT /security/redact-rules/{id}`、`GET /audit/logs?from=&to=&action=&traceId=&page=`、`GET /rbac/matrix`、`GET /sso/status` | `sdlc.notify.*`（安全告警） | 首屏拉取；写操作后重拉对应分区并校验 `expectedVersion` | 代码出网开关（ALLOW/MASK/DENY + 禁止时行为说明）、脱敏规则表（规则名/匹配类型/动作/启用状态/命中次数）、最小化上传策略与切片大小上限；审计日志 + 时间与动作类型筛选 + `traceId` 检索；鉴权与权限（SSO/OAuth2 接入状态 + 7 角色 × 查看/编辑/审批/配置 RBAC 矩阵，当前角色列高亮）（详见 §3.2） |
| `project` | `project`（扩展）、`project_milestone`、`project_stakeholder`(+`_ref`)、`project_risk`、`ai_project_report`；关联 `gate`（G-05 待补）、`release_order`（G-04 待补）、`sprint` | `MGMT-01`（`view=list\|summary\|scatter`）、`MGMT-02`、`MGMT-03`、`MGMT-04`、`MGMT-05`、`MGMT-06`（`view=registry\|raci-matrix\|power-interest`）、`MGMT-07`、`MGMT-08`、`MGMT-09`、`MGMT-10`、`MGMT-11`、`MGMT-12` | `sdlc.project.*`（E-01/02/03/04/05）、`sdlc.milestone.*`（E-06/07/08）、`sdlc.risk.*`（E-10/11）、`sdlc.stakeholder.updated`（E-09）、`sdlc.gate.*`（复用 impl-03） | 首屏按标签页拉取（`portfolio` 用 `cache:portfolio:{tenantId}` 60 s；`detail` 用 `cache:project:{projectId}` 300 s）；订阅 `sdlc.project.health_changed` 后**只更新健康灯与分值**，不重拉组合表；周报生成走 SSE 流式追加，`done:true` 后整块刷新 | ① 5 标签切换（项目组合 / 当前项目 / 里程碑 / 干系人 / 风险与 AI 周报）；② 组合表筛选 + 搜索 + 排序、四象限散点点击定位项目卡；③ 里程碑泳道时间线含 `TODAY` 竖线，点击行看交付物 / 滑移原因 / 门禁实测；④ AI 里程碑延期预测的采纳 / 驳回（采纳触发 `MGMT-05`，`baseline_version + 1`）；⑤ RACI 决策域矩阵按域切换（`shRaci`）+ 权力-利益四象限；⑥ AI 沟通建议采纳后写入 PMO 沟通计划并生成飞书日程草稿；⑦ 5×5 概率影响热力矩阵 + `detectedBy` 筛选（AI / 人工）；⑧ AI 周报「采纳并发布到飞书 / 重新生成 / 编辑后发布 / 驳回」四动作，发布前弹确认框 |
| `people` | `member_profile`、`skill`、`skill_matrix`、`certification`、`member_certification`、`member_workload`、`ai_collab_pref`、`team_member`；关联 `app_user`、`task` | `MGMT-13`（`fields=` 列级过滤）、`MGMT-14`（`include=skills,certifications,workload,aiCollabPref,growthPlan`）、`MGMT-15`（`include=skills,insights,personStats`）、`MGMT-16`、`MGMT-17`、`MGMT-18`、`MGMT-19` | `sdlc.member.*`（E-12/13）、`sdlc.workload.*`（E-14/15）、`sdlc.task.*`（复用，转交任务后同步负责人） | 首屏拉取；技能矩阵按 `userId × skillId` 缓存 300 s；负载表在收到 `sdlc.workload.rebalanced` 后**只更新涉及的两人行与条形图**；证书临期扫描为每日 08:00 推送，页面收到 E-13 头插告警条 | ① 5 标签切换（成员名册 / 技能矩阵 / 产能与负载 / AI 协作偏好 / 成长与认证）；② 15 列成员表筛选 + 搜索 + 排序，档案抽屉；③ 9 人 × 14 技能热力网格（手绘 SVG），单元格抽屉看 `lastUsedAt` / `aiAssistRatePct` / `certified` 证据；④ AI 技能洞察四类（单点依赖 / 关键技能缺口 / AI 补位倒挂 / 认证覆盖）采纳 / 驳回，采纳写入 `SP-25` 能力建设清单并挂到 `growthPlan`；⑤ 负载条形图超产能部分 `danger` 叠加，`u-yan` 反差案例（负载 38.5% 但为唯一 `SK-07`/`SK-08` level 5 持有人）；⑥ AI 产能再平衡建议 `RB-01`~`RB-03` 采纳 / 驳回（采纳走 `MGMT-18` → `PUT /tasks/{id}`）；⑦ AI 协作偏好卡（五星 `feedbackScore`）+ 采纳率对比条 + 团队均值线 + 拒绝理由环形图 + 提示词模板分布；⑧ 证书临期 / 过期标色 + 团队能力雷达双多边形（当期 vs 上期） |
| `team` | `team`、`team_member`、`team_metric_snapshot`、`team_collab`、`ceremony`；关联 `arch_component`、`sprint` | `MGMT-20`（`include=members,orgTree,roleMix`）、`MGMT-21`（`include=trend,radar`）、`MGMT-22`（`include` 阻塞看板与图）、`MGMT-23`、`MGMT-24`（`include=quadrant`）、`MGMT-25` | `sdlc.team.*`（E-16/17）、`sdlc.ceremony.summary_generated`（E-18）、`sdlc.workload.overloaded`（E-14，团队负载汇总） | 首屏拉取；效能快照按 `sprintId + teamId` 缓存 300 s；迭代选择器切换即重拉 `MGMT-21`；收到 E-17 后**只更新协作图对应边与健康标记**，阻塞看板头插 | ① 4 标签切换（团队编制 / 团队效能 / 协作与依赖 / 研发仪式）；② 手绘 SVG 组织架构树（两层：技术中心 → 7 个一级团队，`parent_team_id` 全 NULL）；③ 团队卡片网格 + 角色配比堆叠条与理想配比对比；④ 承诺-速率分组柱状图叠加完成率双轴折线、跨迭代趋势折线 + 6 项指标迷你走势、6 维能力雷达（当期 vs 上期）；⑤ AI 团队诊断采纳 / 驳回；⑥ 协作关系图（7 节点 8 有向边）+ 阻塞治理看板（`BLOCK-0312` 等待 96.5 h vs SLA 48 h = 201%）；⑦ AI 协作优化建议三动作「采纳 · 转派 · 驳回」（转派需目标团队 leader 二次确认）；⑧ 6 张仪式卡 + 出席率-行动项闭环率对比条 + AI 提效四象限矩阵 + AI 议程与纪要生成演示 |
| `req-pool` | `req_pool_item`、`req_review_round`；关联 `requirement`、`user_story`、`task`、`defect`、`release_order`（G-04 待补）、`sprint` | `MGMT-26`、`MGMT-27`、`MGMT-28`、`MGMT-29`、`MGMT-30`、`MGMT-31`、`MGMT-32`、`MGMT-33`、`MGMT-34`（`dim=funnel\|source\|both`）、`MGMT-35`（`brokenOnly=0\|1`） | `sdlc.reqpool.*`（E-19~E-25）、`sdlc.task.state_changed`（复用，驱动 `已入迭代 → 已交付`） | 首屏拉取 + `cache:reqpool:{projectId}:{stage}` 120 s；订阅 E-21 后**只移动对应行的阶段标签并更新阶段流计数**；批量入迭代（`MGMT-31`）为单事务，成功后按响应 `scheduled[]` 逐行乐观更新，任一失败整体回滚；漏斗与来源统计缓存 300 s | ① 5 标签切换（需求池 / 价值成本矩阵 / 评审轮次 / 漏斗与来源 / 追溯与关联）；② 15 列需求池表多维筛选 + 排序 + 多选（复选框仅对非 `已入迭代`/`已交付`/`已拒绝` 条目可用）；③ 阶段流点击快速筛选；④ AI 优先级评分口径切换（`standard`/`promo`/`compliance`，试算不落库）+ Top5 卡 + 重评分；⑤ 批量入迭代（选迭代 + 容量校验 + 决策说明回写）与拒绝（理由回写审计流水 + 飞书通知提出人）；⑥ 手绘 SVG 四象限散点（气泡大小 = `estimatePoints`，以 6 为高低分界）+ 紧急度-风险气泡图 + AI 组合建议「采纳生成迭代计划」；⑦ 12 列评审记录表 + AI 会前预读与澄清问题抽屉（主持人可驳回 AI 的任一问题）+ 评分变化哑铃图 + AI 评审提效统计；⑧ 手绘 SVG 漏斗（6 阶段）+ 来源环形图与明细表 + 来源 × 阶段堆叠条 + AI 来源洞察；⑨ 追溯链路图（池 → 需求 → 故事 → 任务 → 缺陷 → 发布单）+ 追溯矩阵 + 断链检测（3 类断链 + 2 类预警）+ AI 完整性评估 |
| `prototype` | `prototype_job`、`prototype_job_step`、`prototype_page`、`prototype_component`、`prototype_review`、`prototype_version`、`prototype_export`、`ai_tool_provider`、`ai_tool_capability`、`ai_automation_flow`(+`_step`)；关联 `prd_version`（impl-04 §3.4）、`requirement`（§3.2）、`model_call_log`（§3.20）、`api_contract`（缺口 G-05 待补） | `PTP-01`~`PTP-22`（22 个，§5.2）；复用 impl-01 §4.2 的 `GET /prd-versions?requirementId=`（选 PRD 基线）与 §4.8 的 `GET /ai/traces?agentId=&targetType=prototype&targetId=`（调用链下钻） | `sdlc.prototype.*`（P-01~P-16 全部 16 个）、`sdlc.agent.<runId>`（流式生成时的 `agent.stream.chunk` / `agent.tool_call`）、`sdlc.prd.baselined`（上游触发，用于「PRD 刚定稿」的入口提示）、`sdlc.notify.*`（回退需求澄清与升级提醒） | 首屏拉取 `PTP-02`（`include=summary`，缓存 60 s）；生成中订阅 P-03/P-04/P-09 做**步骤条与页面树的局部更新**（按 `seq` 与 `pageCode` 精准失效，不整页重拉，impl-07 §5.5）；任务完成后 `cache:ptpjob:{jobId}` TTL 由 60 s 提升到 300 s；批注区订阅 P-10/P-11 头插与状态替换；版本时间线订阅 P-12/P-13 追加节点；`PTP-21` 健康检查 60 s 轮询兜底（`presence:axhub:health`） | ① 5 标签切换（生成任务 / 原型结构与预览 / 组件与批注 / 版本与导出 / AxHub 能力与自动化编排）；② 新建任务表单：选 PRD 基线（默认 `PRD-ORD-v2.3`）、勾需求（默认 `REQ-2401`+`REQ-2403`）、选保真度（默认 `high`）、选设备（默认 `desktop`+`mobile`）、选模式（默认 `full`）、选模型（默认 `mdl-claude`），**`canGenerate = prdBaseline.baseline === true && fReqs.length > 0 && fDevices.length > 0`**，不满足时按钮加 `ac-btn--disabled`；③ **可回放的 7 步生成进度**：按 `STEP_WEIGHTS = [8,12,30,18,14,12,6]` 渲染加权进度条与累计贡献，支持暂停 / 继续（`disabled={!sim.running}`）；④ 15 列任务表（5 个任务覆盖 `exported`/`generating`/`reviewing`/`approved`/`failed` 五种状态），失败行展开 `failReason` 与失败步骤；⑤ 手绘 SVG 页面树（3 层导航：订单域 / 履约域 / 合规域）+ 线框预览 + 页面属性 + 交互流有向图；⑥ 13 列组件库表 + 复用度条形图 + 12 条批注评审（三动作「标记解决 / 转交处理 / 驳回」，已用状态转 `ac-btn--disabled`）+ 严重度堆叠图；⑦ 手绘 SVG 版本时间线 + 版本表 + `diffFromPrev` 四组清单（`addedPages`/`removedPages`/`modifiedPages`/`addedComponents`）+ **4 格式导出**（每格式显示 `withComments`/`withInteractions`/`sizeMb`/范围，导出中显示条纹进度条，完成后给出 `bundlePath`）；⑧ AxHub 集成信息卡（`provider-axhub` 全字段）+ 6 条能力卡（`AXHUB-01`~`AXHUB-06`，显示 `adoptionRatePct`）+ `AIF-01` 端到端流展开（8 步逐条 + 2 个人工检查点高亮）+ 6 条流概览 + 收益测算（`savedHours` / `weightedAutoRatePct` / `totalRuns` + 口径说明） |
| `release` | `product_version`、`product_version_baseline`、`change_set`、`release_calendar`、`product_version_diff`；关联 `requirement`、`task`、`defect`、`release_order`（G-04 待补）、`gate`（G-05 待补） | `MGMT-36`（`include=roadmap,scope`）、`MGMT-37`、`MGMT-38`、`MGMT-39`、`MGMT-40`、`MGMT-41`、`MGMT-42`（`pair=adjacent\|all`）、`MGMT-43`（`include=conflicts`）、`MGMT-44`、`MGMT-45`；复用 impl-01 §4.4 的 `GET /releases?status=`、`POST /releases/{id}/execute`、`POST /releases/{id}/rollback` | `sdlc.version.*`（E-26/27/28）、`sdlc.changeset.*`（E-29/30）、`sdlc.calendar.*`（E-31/32/33）、`sdlc.gate.*`（复用，驱动冻结禁用态）、`sdlc.pipeline.*`（复用，驱动 `已冻结 → 灰度中`） | 首屏拉取；冻结预检（`MGMT-38`）**不缓存**，每次打开 Modal 实时读 `GATES`；订阅 `sdlc.gate.result` 后重算 `canFreeze` 并即时切换冻结按钮的禁用态与缺失原因文案；发布日历按月缓存 300 s，收到 E-31/E-32 后只重绘冲突组 | ① 5 标签切换（版本规划 / 基线与冻结 / 变更集 / 版本对比 / 发布日历）；② 手绘 SVG 版本路线图 + 版本卡片网格 + 15 列版本表；③ AI 版本范围建议采纳 / 驳回（采纳即改 `requirementIds` 并把被移出条目退回 `待排期`）；④ 14 列基线表 + 基线时间线 + **冻结预检 Modal（门禁禁用态）**：`canFreeze=false` 时按钮文案为「冻结预检」而非「冻结基线」，提示「门禁未通过，仅可查看预检结论，无法确认冻结」；⑤ 15 列变更集表多维筛选 + 变更规模双向条形 + 高风险聚合区；⑥ 版本对比 summary 概览 + 指标哑铃图 + 增删清单 + AI 兼容性评估；⑦ 手绘 SVG 月历 + 12 列日历项表 + 冲突治理区（`CFG-A` / `CFG-B`）+ AI 发布窗口推荐（封网期命中项不可采纳） |
| `api-test` | **新增**：`api_case`、`api_scenario`、`api_scenario_step`、`api_mock_rule`、`api_data_set`、`api_test_run`、`api_test_report`；**既有**：`api_contract`（`API_CONTRACTS` 14 份）、`test_module`（`tm-*` 7 模块）、`defect`（`BUG-1043`~`BUG-1055`）、`build`/`pipeline_stage`（`PIPE-2401`~`PIPE-2410`）、`gate`（G1~G6）、`requirement`（`REQ-2401`~`REQ-2408`）、`model_call_log`（`tokenCost`） | §7.1 的 24 项 / 26 端点，全部「本文补充」：`GET/POST/PUT /api-cases*`、`POST /api-cases/generate`、`GET /contract-coverage`、`POST /contract-coverage/gap-cases`、`GET/POST/PUT /api-scenarios*`、`POST /api-scenarios/{id}/validate`、`POST /api-scenarios/{id}/execute`、`POST /api-runs/{id}/cancel`、`GET /api-runs`、`POST /ci-callbacks/apitest`、`GET/PUT /api-mocks*`、`POST /api-mocks/{id}/trial`、`GET /api-data-sets`、`POST /api-data-sets/{id}/mask-check`、`GET /api-reports/{id}`、`POST /api-reports/{id}/publish`；复用 impl-01 §4.4 `GET /gates?stageId=`、§4.6 `POST /bugs`、§4.8 `GET /ai/traces` | `sdlc.apitest.*`（8 主题，§7.3）；`sdlc.gate.*`（G3/G4/G5/G6 判定）；`sdlc.bug.*`（自动开单回插）；`sdlc.pipeline.*`（`PIPE-24xx` 阶段变化）；`sdlc.agent.<runId>`（AI 生成用例/场景的流式产出） | 首屏拉取 6 个标签页各自的列表；`run_completed` 到达时只更新对应执行行与报告 `summary`（精准失效，impl-07 §5.5）；AI 生成走 SSE 逐条追加 `reasoning[]`/`steps[]`，`done:true` 后整块落草稿列表；执行中的 run 用 5s 轮询兜底（进度条） | ① 6 标签页：用例库 16 / 场景编排 5 / Mock 与数据集 12（8+4）/ 执行记录 8 / 测试报告 8 / hifox 能力与 CI 集成 6；② 用例详情抽屉展示 `steps` 与失败现场「期望 vs 实际」；③ 契约覆盖度条（14 格，实色=已建例、虚线灰=未建例）+「一键生成缺失用例」乐观新增；④ flaky 治理区的「采纳诊断 / 驳回」（采纳=duration 断言 `onFail` 改 `retry`）；⑤ 场景链路图（22 步按 6 种 `stepType` 手绘 SVG 形状）+ 步骤明细 + 断言质量分析（52 条）；⑥ Mock 试运行弹窗；⑦ 数据集列定义与脱敏规则抽屉；⑧ 报告页「签发报告」按钮在 `gateImpact.pass=false` 时禁用并给出 4 项缺失原因；⑨ AI 改进建议 4 条逐条采纳/驳回（右上角「已采纳 N / 4」）；⑩ 「AI 生成场景」弹窗（选契约 + 业务目标 → `ag-test` 输出 4 段 reasoning + 步骤草案 → 采纳为草稿场景 `AS-06`） |
| `knowledge` | **新增（15 张）**：`kb_space`、`kb_doc`、`kb_chunk`、`kb_graph_node`、`kb_graph_edge`、`kb_ingest_run`、`kb_ingest_step_run`、`kb_retrieval_log`、`kb_eval_set`、`kb_archive_rule`、`kb_archive_decision`、`kb_stage_artifact_map`、`kb_governance`、`kb_consume_stat`、`kb_stats_snapshot`；**既有**：`rag_entry`（迁移期，经 `v_rag_entry`）、`audit_log`（`al-*` 11 条）、`model_call_log`（`token_cost_from_kb` 归集）、`prd_version`（`KD-12`）、`api_contract`（`KD-15`）、`test_execution`（`KD-18`）、`defect`（`KD-18`/`KD-20`）、`release_order`（`KD-19`）、`app_user`（`owner_ids`/`verified_by_id`） | §9.1 的 30 项 / 33 端点，全部「本文补充」：`GET/PUT /kb/spaces*`、`GET/PUT /kb/docs*`、`POST /kb/docs`（上传）、`POST /kb/docs/{id}/reindex`、`POST /kb/docs/{id}/verify`（保鲜）、`GET /kb/stage-artifacts`、`GET/PUT /kb/archive-rules*`、`POST /kb/archive-rules/{id}/toggle`、`GET /kb/archive-decisions`、`GET /kb/ingest-runs`、`GET /kb/ingest-runs/{id}`、`POST /kb/ingest-runs/{id}/replay`、`GET /kb/docs/{id}/chunks`、`GET /kb/chunks/{ref}`、`GET /kb/graph/nodes`、`GET /kb/graph/edges`、`POST /kb/graph/traverse`、`POST /kb/graph/edges/{id}/verify`、`POST /kb/retrieval`、`GET /kb/retrieval-logs`、`GET/POST /kb/eval-sets*`、`GET /kb/eval-sets/{id}/history`、`GET /kb/consume-stats`、`GET /kb/stats`、`GET/PUT /kb/governance*`、`POST /kb/conflicts/{id}/resolve`；复用 impl-01 §4.8 `GET /ai/rag/entries`（经 `v_rag_entry`）、§4.9 `GET /audit/logs` | `sdlc.kb.*`（10 主题，§9.3）；`sdlc.gate.*`（`gate.passed:G1/G2/G6` 驱动归档覆盖率）；`sdlc.notify.*`（保鲜告警、冲突通知）；入站消费 13 个归档触发主题（§2.4，本页只展示不订阅） | 首屏拉取 6 个标签页各自数据（总览读 `cache:kb:stats:overview`，60s TTL）；`doc_indexed`/`ingest_completed` 到达时只更新对应文档行的 `embedStatus` 与入库记录卡片（精准失效，impl-07 §5.5）；`ingest_started` 后对进行中的批次用 5s 轮询兜底 7 步进度；`doc_stale`/`conflict_detected` 走 `notify.push` 插入告警卡；检索测试台为同步 REST，不订阅 | ① 6 标签页：总览 6 / 阶段产物归档 18 / 空间与文档 20 / 知识图谱 18 / 检索与评测 14 / 治理与消费 6（`ac-tab-count` 逐个对应）；② 总览：6 张指标卡 + SDLC 阶段产物归档覆盖率 + 归档来源构成 + 检索质量指标 + 成本与规模 + 知识保鲜告警（逐篇「刷新复核」，全部处理完主按钮禁用）+ WeKnora 引擎信息（19 字段）；③ 阶段产物归档：6 环节 × 3 产物流水线图 + 18 行映射表 + 8 条归档规则（按 `priority` 升序）+ 7 步入库流水线 + 8 次入库执行记录（含 `KI-07` 失败步骤与 `KI-08` 合批重放）；④ 空间与文档：6 个空间卡片 + 20 篇文档 17 列表（7 组筛选 + 排序 + `legacyKbId`/`legacyRagId` 兼容列 + 「本轮新增」标签）+ 空间分布对比 + RAG 衔接说明；⑤ 知识图谱：18 节点 26 边手绘 SVG 力导向图（虚线边 = AI 抽取且置信度 < 90%、边标签下实心点 = 已 `verified`）+ 节点/边详情面板 + `degree` 排行 + AI 图谱构建说明 + 多跳推理示例（4 跳）+ 冲突仲裁（选择胜者后按钮解禁）；⑥ 检索与评测：检索测试台（输入问题按语义相似度匹配一条真实日志，完整还原多路召回 → 重排 → 命中切片 → 采纳情况）+ 14 条检索日志 16 列表 + 质量散点 + 3 个评测集趋势；⑦ 治理与消费：7 个 Agent 消费统计（检索量/采纳率/引用/幻觉率/成本/时延影响/趋势）+ 幻觉率对比（12.04% → 2.50%，-79.3%）+ 6 条治理策略 + 分级访问热力 + 关联审计流水 |

> **表中接口编号的来源（可逐条追溯）**：`MGMT-01`~`MGMT-45` 见 impl-10 §3.2~§3.7；`PTP-01`~`PTP-22` 见 impl-11 §5.2；impl-12 §7.1 的 24 项 / 26 端点未编 `HFX-*` 型接口号（其 `HFX-01`~`HFX-06` 是**能力**编号而非接口编号），故该行沿用原文的路径枚举写法；impl-13 §9.1 的 30 项 / 33 端点同理，沿用原文路径枚举。事件编号 `E-01`~`E-33` 见 impl-10 §4.1，`P-01`~`P-16` 见 impl-11 §5.5，`sdlc.apitest.*` 8 主题见 impl-12 §7.3，`sdlc.kb.*` 10 主题见 impl-13 §9.3。

> **主题使用约束**：前端只订阅 impl-01 §3.2 已声明的通配主题（`sdlc.task.*`、`sdlc.bug.*`、`sdlc.pipeline.*`、`sdlc.gate.*`、`sdlc.notify.*`、`sdlc.sync.*`、`sdlc.agent.<runId>`）。进入页面发 `client.subscribe`，离开发 `client.unsubscribe`，避免长连接下主题堆积。
>
> **（本轮扩展）新增 4 组通配主题**，同样须在 impl-01 §3.2 补登记后方可订阅：
>
> | 通配主题 | 条数 | 定义位置 | 订阅页面 | 消费组 |
> |:---|:--:|:---|:---|:---|
> | `sdlc.project.*` / `sdlc.milestone.*` / `sdlc.stakeholder.*` / `sdlc.risk.*` / `sdlc.member.*` / `sdlc.workload.*` / `sdlc.team.*` / `sdlc.ceremony.*` / `sdlc.reqpool.*` / `sdlc.version.*` / `sdlc.changeset.*` / `sdlc.calendar.*` | **33**（`E-01`~`E-33`） | impl-10 §4.1 | `project`、`people`、`team`、`req-pool`、`release` | `stream:grp:mgmt`（+ 复用 `stream:grp:console` / `notify` / `sync` / `state`） |
> | `sdlc.prototype.*` | **16**（`P-01`~`P-16`） | impl-11 §5.5 | `prototype` | `stream:grp:prototype` |
> | `sdlc.apitest.*` | **8** | impl-12 §7.3 | `api-test` | `stream:grp:apitest` |
> | `sdlc.kb.*` | **10** | impl-13 §9.3 | `knowledge` | `stream:grp:kb` |
>
> 合计新增 **67 个**主题（33 + 16 + 8 + 10）。其中两个**高频主题必须聚合发布**，不得逐次投递：`sdlc.apitest.mock_hit`（`MK-01` 单条 30 日命中 18,420 次，按 `(ruleId, 分钟)` 聚合，实时计数走 Redis `counter:mock:{ruleId}:{yyyymmdd}`）与 `sdlc.kb.retrieval_logged`（近 30 日 3,842 次检索，按 `(callerId, 小时)` 聚合，明细落 `kb_retrieval_log` 表由 REST 查询）——否则会冲垮 `stream:sdlc.events`（`MAXLEN ~ 1e6`）。此外 impl-13 §2.4 的 **13 个入站归档触发主题**（`sdlc.prd.baselined` / `sdlc.contract.frozen` / `sdlc.mr.merged` / `sdlc.coverage.reported` / `sdlc.review.approved` / `sdlc.testplan.executed` / `sdlc.testreport.published` / `sdlc.release.completed` / `sdlc.alert.fired` / `sdlc.rca.approved` / `sdlc.gate.passed` 等）由 `knowledge` 页**只展示不订阅**。

### 3.2 分页面要点

**`overview` 总览驾驶舱**：六环节横向流程条读 `SDLC_STAGES` 的在制品数与门禁健康色，点击跳页（`setPage`）；6 张核心指标卡来自 `GET /metrics/overview`；「分配给我的待办」按当前角色过滤；底部事件时间线携带 `traceId`，是全站排查入口。订阅 `sdlc.task.*` + `sdlc.gate.*` 后只更新计数与首条事件，不重拉整页。

**`requirement` 需求工作台**：左侧 Brainstorm 用 `POST /brainstorm/sessions` 拿到 `streamUrl`，按 `agent.stream.chunk` 分块追加（模拟 SSE），`done:true` 后落 PRD 草稿并触发 `GET /prd-versions` 刷新；右侧结构化 PRD 含用户故事（As a / I want / So that + 验收标准）、非功能需求、开放问题；版本下拉切换拉取 `diffSummary`；评审意见可定位到具体 `storyRef`。「交给架构 Agent 拆解」弹确认框（待同步故事数、目标工作项类型、幂等提示），确认后 `POST /requirements/{id}/decompose` 并按 `sync.status` 显示入队进度。

**`design` 架构设计与任务拆解**：四标签（架构文档 + SVG 组件关系图 / 接口定义 / 任务清单树 / 三点估算）。任务行内联编辑负责人与工时走 `PUT /tasks/{id}`（携带 `expectedVersion`，冲突返回 `SDLC-TASK-409` 需刷新重试）；「再拆解」展开子任务；底部实时汇总总工时与建议并行度。批量同步 PingCode 预览弹窗展示 `UUID ↔ external_id` 映射、目标工作项类型、幂等标记（已存在显示「更新」）、逐条进度与结果（成功/失败/进入重试队列）。

**`board` 任务看板**：按 impl-03 的 10 状态横向分列，列头显示状态名与计数（来自 `GET /tasks` 响应的 `columns`）。订阅 `sdlc.task.state_changed` 后**只移动对应卡片**并增减两列计数；`SDLC-STATE-409/422` 时卡片回弹并弹出守卫失败原因（如「增量分支覆盖率 68.2% 低于门禁阈值 85%」）。任务详情抽屉含描述、验收标准、流转历史（状态/时间/触发者/traceId）、关联提交与 Diff 摘要、本地测试结果、Agent 参与记录。

**`schedule` 排期甘特**：左侧任务树（负责人 + 工时）+ 右侧时间轴，周/日粒度切换。甘特条为 CSS 手绘（起止定位 + 进度填充），关键路径主色加粗描边；SVG 依赖箭头（FS 关系）与风险标记，悬停弹出风险说明（类型/影响天数/PMO Agent 建议）；顶部冲突告警条（负责人时间重叠、依赖倒挂）点击定位到具体任务。

**`coding` AI 编码协作**：任务选择器 → AI 会话流（用户指令 / Agent 思考 / 工具调用 / 产出）按 `agent.stream.chunk` 与 `agent.tool_call` 渲染；上下文切片清单展示文件路径、行范围、符号名、**是否已脱敏**（与 impl-08 对齐）；并排 Diff（新增绿/删除红/行号）支持全部接受 / 全部拒绝 / 逐块接受，决策经 `coding.diff.decision` 上行；本地执行结果区（命令、退出码、耗时、通过/失败用例数、可展开日志摘要）经 `test.report` 上行后驱动 `dev → testGreen` 迁移；**仅当测试全绿**时「触发部署」可用并跳 `pipeline`，否则禁用并提示原因。

**`pipeline` 部署流水线**：横向流水线按 **8 个规范阶段**（`CANON_PHASES`：拉取代码 / 编译 / 单测 / 制品 / 部署 DEV / 冒烟 / 部署 STG / 部署 PROD）渲染泳道，数据层的 `PIPELINE_STAGE_TEMPLATE` 实际为 **6 段**（`stg-1` 代码检出 → `stg-2` 静态扫描 → `stg-3` 单元测试 → `stg-4` 镜像构建 → `stg-5` 环境部署 → `stg-6` 门禁汇总），页面按位次映射并在每个节点下以「对应阶段 {realName}」显式披露真实阶段名；未配置的泳道降级为 `waiting` 并给出「当前流水线口径下未配置该阶段」的说明，不留空白。每阶段带状态/耗时/日志入口，失败节点红色高亮 + 错误摘要 + 「重试该阶段」（`POST /pipelines/{id}/stages/{stageId}/retry`）。发布门禁清单为 **G1~G6 六道**（需求 / 架构 / 编码 / 测试 / 发布 / 观测），逐道展开 `criteria` 与 `actual` 的逐项比对；任一阻断类门禁未满足即禁用「发布到 PROD」并列出缺失项；`POST /gates/{gateId}/waive` 需 `SDLC-PIPE-403` 权限校验。「环境与通知」标签展示 DEV/STG/PROD 卡片（版本/实例数/健康/最近部署）与部署通知记录（渠道/接收人/模板/发送状态/时间）。

**`test` 测试中心**：三标签。用例库 = 左侧模块树（EPIC → 7 模块 → 用例）+ 右侧用例表（编号/标题/前置条件/步骤摘要/预期结果/优先级/类型/来源/关联需求），支持状态 chips 筛选与「仅看自动化」开关；导入 XMind / Excel 走 `POST /test-cases/import`（`format` + `fieldMapping`），弹窗内展示字段映射预览与四步进度；执行记录 = 计划列表（计划名/触发方式/环境/总数-通过-失败-阻塞/执行率与通过率进度条/执行人/起止时间）；测试报告 = 结论 + G4 门禁判定、覆盖率与性能对比、用例状态堆叠条、失败用例明细（堆栈摘要 + QA Agent 归因）、「一键提 Bug」、缺陷分布 SVG 条形图（按模块/严重级/分类切换）、轮次对比与签核。

**`bug` Bug 流转**：四标签。缺陷台账（编号/标题/严重级/优先级/状态/来源/发现版本/指派给/SLA/发现时间/发布阻断）+ 关键字搜索 + 严重级/状态/指派人筛选 + 「仅看发布阻断」开关 + 行选与全选。「AI 分析」抽屉展示缺陷摘要、AI 归因结论（Agent + 模型 + 置信度 + 耗时 + 人工确认）、5-Why、疑似问题代码位置（文件 + 行号 + 修复前后代码）、发生链路、影响面、修复方案候选、验证方案与预防动作；**「采纳建议并指派」**弹确认框（建议指派人 + 匹配理由 + 采纳方案 + 状态流转 + 是否同步 PingCode），确认后 `POST /bugs/{id}/transitions` 走 `analyzing → fixing`（守卫要求 `report.approved && mrId != null && branch != null`，见 impl-03 §4），并 `POST /bugs/{id}/notify` 生成通知记录。流转分析 = 瓶颈提示 + 各阶段平均耗时 SVG 条形图 + SLA 策略与升级链路 + 6 态 8 迁移状态机表 + 缺陷时间线（倒序：状态/操作者/备注/traceId）。通知与订阅 = 规则表（渠道/目标/触发事件/命中条件/接收人/确认时限/超时升级/静默窗口/启用开关）+ 推送研发的 IM 通知记录（接收人/摘要/发送状态/确认人）+ 个人订阅偏好。根因报告 = 报告清单与详情抽屉。

**`insight` 效能报表**：时间范围（7 天/30 天/季度）× 维度（项目/团队/个人）联动刷新 `GET /metrics/efficiency`；四组指标卡（交付效率 / 缺陷密度 / 发布节奏 / AI 增效）+ SVG 折线面积趋势图 + AI 增效环形构成 + 交付榜与缺陷榜 Top 5 + 指标与榜单下钻抽屉。

**`integration` PingCode 集成中心**：Provider 列表（PingCode 已启用，Jira/禅道/ONES/TAPD 未接入占位）+ 连接配置与连通性检测；数据模型映射表与状态工作流映射表（本平台 10 状态 ↔ PingCode 状态，与 impl-03 §8、impl-05 §4 一致）；「标识映射」标签展示 `external_id ↔ 本地 UUID`（外部编号/对象类型与标题/创建时间/最后同步时间/方向）+ 搜索；「同步队列」标签展示待处理/处理中/成功/失败计数、指数退避重试次数、死信队列（失败原因 + 人工重放）、最近对账结果与外部变更回写记录。

**`ai-observe` AI 能力观测**：模型网关（5 模型列表 + 路由策略规则表 + 调用统计：请求量/成功率/时延/fallback/限流/成本占比 SVG 条形图）；Agent 编排（7 个 Agent 输入输出契约摘要 + 近 7 日调用量；选中调用记录展示 `traceId` 串联的完整调用链：触发事件 → Agent → 模型 → 工具调用 → 产出 → 状态迁移，每跳耗时与 Token）；知识库（RAG 条目：标题/类型/来源/切片数/向量更新时间/被引用次数 + 类型筛选 + 条目摘要）。

**`settings` 安全与审计**：代码出网开关（ALLOW/MASK/DENY + 禁止时行为说明）、脱敏规则表（规则名/匹配类型/动作/启用状态/命中次数）、最小化上传策略与切片大小上限；审计日志（时间/操作者/动作类型/对象/traceId/结果）+ 时间与动作类型筛选 + `traceId` 检索；鉴权与权限（SSO/OAuth2 接入状态 + 7 角色 × 查看/编辑/审批/配置 RBAC 矩阵，当前角色列高亮）。

---

## 4. 共享组件清单与复用规则

### 4.1 通用类（`style.css`，1762 行）

> **本轮扩展说明**：下表「复用页面」列为 **v1.0 的快照**，其中若干行已被本轮 8 个新页超出（如 `ac-tabs` 实际 20 页在用、`ac-metric` 16 页、`ac-hint` 20 页）。为不破坏既有交叉引用，本表**原样保留**；21 页 × 通用类的**实测复用矩阵**见 §4.3，两者冲突时以 §4.3 为准。

| 组件 | 关键类名 | 复用页面 | 约束 |
|:---|:---|:---|:---|
| 表格 | `ac-table`、`ac-table--sm`、`ac-table--bordered`、`ac-td-num`、`ac-td-center`、`ac-table-row--selected`、`ac-table-wrap`、`ac-table-foot`、`ac-page-btn` | 全部 21 页（本轮扩展：13 → 21） | 宽表必须包 `ac-table-wrap` 以启用横向滚动；数字列用 `ac-td-num`（等宽 + tabular-nums） |
| 卡片 | `ac-card`、`ac-card--flat`、`ac-card-head/-title/-subtitle/-extra`、`ac-card-body`（`--tight`/`--flush`）、`ac-card-foot` | 全部 | 内嵌表格用 `--flush` 去内边距 |
| 按钮 | `ac-btn` + `--primary`/`--ai`/`--ghost`/`--text`/`--danger`/`--danger-ghost`/`--sm`/`--lg`/`--block` | 全部 | 禁用态用 `disabled` 或 `ac-btn--disabled`（`pointer-events:none`）；AI 动作统一 `--ai` 渐变 |
| 标签 | `ac-tag` + `--brand/--ai/--ok/--warn/--danger/--info/--neutral/--outline` + `--sm/--lg`、`ac-tag-dot` | 全部 | **`Tone` 有 12 个值，`ac-tag--` 只支持 7 个**，必须经 `tagTone()` 归并（`slate→neutral`、`teal→ok`、`pink→danger`、`indigo→brand`、`amber→warn`） |
| 徽标 | `ac-badge` + `--danger/--warn/--ok/--info/--ai/--brand/--neutral` | overview、bug、pipeline | 用于计数角标与「阻」标记 |
| 头像 | `ac-avatar` + `--xs/--sm/--lg/--xl/--square` + 12 种 tone 色、`ac-avatar-group`、`ac-avatar-more`、`ac-user`/`-name`/`-meta` | 全部 | 头像色直取 `UserDef.avatarColor`（12 值全支持，无需归并）；超 3 人折叠为 `+N` |
| 进度条 | `ac-progress`（`--sm/--lg`）、`ac-progress-bar` + `--ok/--warn/--danger/--info/--striped`、`ac-progress-row`、`ac-progress-label` | board、schedule、pipeline、test、bug | 通过率阈值配色统一：≥90 `ok`、≥80 `warn`、否则 `danger` |
| 标签页 | `ac-tabs`、`ac-tab`、`ac-tab--active`、`ac-tab-count`、`ac-tabs--pill` | design、pipeline、test、bug、insight、integration、ai-observe、settings | 计数用 `ac-tab-count`；pill 变体用于次级切换 |
| 时间线 | `ac-timeline`、`ac-timeline-item` + `--ok/--warn/--danger/--ai/--dim`、`-head/-title/-time/-desc/-extra` | overview、board、bug、test | 节点色由 `TIMELINE_TONE` 从 `Tone` 映射（仅 5 种节点色） |
| 横向流程 | `ac-flow`、`ac-flow-node` + `--active/--ok/--running/--failed/--pending/--gate`、`ac-flow-arrow` | overview、pipeline | 门禁节点用 `--gate`（琥珀） |
| 纵向流程 | `ac-flow-v`、`ac-flow-v-node/-rail/-dot`（`--ok/--running/--failed`）`/-line/-body/-title/-desc` | coding、bug | 用于会话流与缺陷发生链路 |
| 甘特 | `ac-gantt`、`-scroll`、`-inner`、`-head*`、`-row`、`-side`、`-track`、`-grid*`、`-bar`（`--ai/--ok/--warn/--danger/--info/--muted/--striped`）、`-milestone`、`-today-line`、`-dep`、`-legend` | schedule | 仅 schedule 使用；最小宽 1000px，靠 `-scroll` 横滚 |
| 看板 | `ac-board`、`-col`、`-col-head/-dot/-title/-count`、`-col-body`、`-card`（`--ai/--human/--blocked/--active`）、`-card-id/-title/-tags/-foot`、`-empty` | board | 列 = 状态；卡片左边框色区分执行主体 |
| Diff | `ac-diff`、`-head/-file/-stat/-add/-del`、`-body`、`-row`（`--add/--del/--ctx/--hunk`）、`-ln/-sign/-code`、`-split`、`-split-head` | coding、board | 并排用 `-split`；行号列 `-ln` 固定宽 |
| 代码块 | `ac-code`（`--light`）、`-head/-title/-lang/-body`、token 类 `ac-tok-key/-str/-num/-com/-fn/-type/-attr` | coding、bug、pipeline、test | 深色为默认；抽屉内窄容器用 `--light` |
| 架构 | `ac-arch`、`-layer`、`-layer-head/-name/-desc/-body`、`-box`（`--ai`）、`-box-name/-tech`、`-link` | design | AI 组件加 `--ai` 紫框 |
| 指标卡 | `ac-metric-grid`（`--3/--4/--6`）、`ac-metric`（`--ai/--ok/--warn/--danger/--info`）、`-head/-label/-icon/-value/-unit/-delta/-foot/-spark` | overview、insight、bug、pipeline、integration | 左侧 3px 色条由修饰类决定 |
| 图表 | `ac-bars`/`-col`/`-track`/`-fill`（`--ai/--ok/--warn/--danger/--muted`）/`-label`/`-value`；`ac-donut`/`-center`/`-value`/`-label`；`ac-legend`/`-item`/`-swatch`/`-value`；`ac-heat`/`-cell`（`--1`~`--5`） | insight、ai-observe、overview | 优先 SVG 手绘；简单占比可用 `ac-bars` |
| 抽屉/弹窗 | `Drawer.tsx`、`Modal.tsx`（`ac-drawer*`、`ac-modal*`） | 全部 | 均支持 ESC + 遮罩关闭；`Modal` 在 `open=false` 时直接 `return null`，`Drawer` 靠 `--open` 类做滑入动画 |
| 表单 | `ac-search-card`（`-actions`）、`ac-field`（`-label`/`--inline`/`-req`/`-hint`）、`ac-input`/`ac-select`/`ac-textarea`（`--sm`/`--readonly`） | board、test、bug、integration、settings、ai-observe | 筛选区统一 `ac-search-card`；必填标 `ac-field-req` |
| 提示条 | `ac-hint` + `--warn/--danger/--ok/--ai` | 全部 | 首子元素放 lucide 图标 |
| 空态 | `ac-empty`（`--sm`）、`-icon/-title/-desc` | 全部 | 筛选无结果与数据未就绪都用它，禁止留空白 |
| AI 块 | `ac-ai-block`、`-title` | requirement、coding、bug、test | 承载 AI 产出，紫色左边框 |
| 布局工具 | `ac-row`/`-top`/`-between`/`-wrap`、`ac-col`/`-center`、`ac-gap-0..6`、`ac-flex-1`/`-0`、`ac-grid-2/-3/-4/-2-1/-1-2/-3-2`、间距与字号原子类 | 全部 | 优先用原子类，避免页面 CSS 重复声明 |
| 页面壳 | `ac-page-head`、`-title`、`-desc`、`-actions` | 全部 | 每页首元素；标题 19px/800，描述最大宽 820px |

### 4.2 复用规则

1. **前缀隔离**：通用类一律 `ac-`；页面专属类一律 `ac-<pg>-`（`ac-bd-` 看板、`ac-sch-` 甘特、`ac-dg-` 设计、`ac-rq-` 需求、`ac-ov-` 总览、`ac-in-` 效能、`ac-ig-` 集成、`ac-ao-` AI 观测、`ac-st-` 设置、`ac-bg-` 缺陷；**本轮扩展追加** `ac-pj-` 项目、`ac-pp-` 人员、`ac-tmg-` 团队、`ac-rp-` 需求池、`ac-pt-` 原型、`ac-rl-` 版本、`ac-at-` 接口自动化、`ac-kb-` 知识库、`ac-ide-` 编码页的 IDE 同步区）。测试中心沿用早期 `ac-tree-`/`ac-chip-`/`ac-fail-`/`ac-stack-` 等无页面前缀的类，属历史约定，新增类不得再引入无前缀命名。**两个易混前缀**：`ac-rq-` = `requirement`（需求工作台），`ac-rp-` = `req-pool`（需求管理），不得互换；`ac-pt-` = `prototype`，与 `pipeline` 的 `ac-pipe-` 无关联。
2. **只用 token，不写死颜色**：所有颜色引用 `--brand`/`--ai`/`--ok`/`--warn`/`--danger`/`--info`/`--text-1..3`/`--border(-soft)`/`--bg-*`/`--radius-*`/`--shadow-*`/`--sp-*`。
3. **不跨页 import**：页面之间不互相引用组件或样式；需要共用的抽到 `components/` 或 `style.css`。
4. **不引 `src/common` 组件**：除 `useHashPage` 路由工具外，原型内自持 `Drawer`/`Modal`，避免外部样式污染。
5. **Tone 归并集中**：每页顶部的 `tagTone()`/`TEXT_TONE`/`TONE_VAR`/`TIMELINE_TONE` 保持一致实现，真实实现阶段应上提为 `components/tone.ts` 单一来源。
6. **（本轮新增）数据模块只读**：4 个数据模块（`data.ts` / `data-mgmt.ts` / `data-ai-flow.ts` / `data-kb.ts`）导出的全部常量一律视为**只读冻结数据**，页面**不得**向其写回；任何可写状态一律走 §4.4 的「乐观更新覆盖层模式」。
7. **（本轮新增）AI 建议必须有裁决出口**：任何 AI 产出（建议 / 评分 / 诊断 / 洞察 / 拆解 / 排期 / 用例 / 窗口推荐）在页面上必须同时给出「采纳」与「驳回」两个动作，且采纳后要有**可见的落地痕迹**（写入覆盖层、头插日志、更新徽标计数），不允许只有「查看」。
8. **（本轮新增）门禁禁用态必须解释**：见 §4.5，禁用按钮必须同时给出结构化缺失原因，不允许只灰不解释。

### 4.3 21 页 × 通用类 实测复用矩阵（本轮扩展，grep 核实）

| 通用类 / 属性 | 命中页面数 | 页面清单（`pages/*.tsx`） | 与 §4.1 的差异 |
|:---|:--:|:---|:---|
| `ac-tag` | **21** | 全部 21 页 | 一致（§4.1 记「全部」） |
| `ac-tabs` | **20** | 除 `SchedulePage` 外全部 | §4.1 只列 8 页，**已超出** |
| `ac-hint` | **20** | 除 `OverviewPage` 外全部 | §4.1 记「全部」，实测 20（`overview` 未用） |
| `ac-avatar` | **20** | 除 `InsightPage` 外全部 | §4.1 记「全部」，实测 20（`insight` 未用） |
| `ac-table-wrap` | **19** | 除 `BoardPage`、`ReqPoolPage` 外全部 | §4.1 记「全部 13 页」；`board` 用 `ac-board` 横滚、`req-pool` 的宽表另有容器 |
| `ac-empty` | **18** | `api-test`、`board`、`bug`、`coding`、`design`、`integration`、`knowledge`、`overview`、`people`、`project`、`prototype`、`release`、`req-pool`、`requirement`、`schedule`、`settings`、`team`、`test` | §4.1 记「全部」，实测 18（`insight`、`ai-observe` 未用） |
| `ac-metric` | **16** | `ai-observe`、`api-test`、`bug`、`coding`、`design`、`insight`、`integration`、`knowledge`、`overview`、`people`、`project`、`prototype`、`release`、`req-pool`、`schedule`、`team` | §4.1 只列 5 页，**已超出** |
| `ac-progress` | **15** | `api-test`、`board`、`integration`、`knowledge`、`overview`、`people`、`pipeline`、`project`、`prototype`、`release`、`req-pool`、`requirement`、`schedule`、`team`、`test` | §4.1 只列 5 页且含 `bug`，实测 `bug` 未用 |
| `ac-ai-block` | **12** | `ai-observe`、`api-test`、`design`、`knowledge`、`overview`、`people`、`project`、`prototype`、`release`、`req-pool`、`schedule`、`team` | §4.1 只列 4 页（`requirement`/`coding`/`bug`/`test`），实测**这 4 页均未命中**、命中集完全不重叠 |
| `ac-timeline` | **9** | `board`、`bug`、`coding`、`knowledge`、`overview`、`release`、`req-pool`、`requirement`、`test` | §4.1 只列 4 页，**已超出** |
| `ac-flow`（横向流程，含 `-node`/`-arrow`） | **6** | `api-test`、`coding`、`knowledge`、`overview`、`pipeline`、`prototype` | §4.1 只列 `overview`、`pipeline` |
| `ac-badge` | **5** | `bug`、`coding`、`knowledge`、`overview`、`requirement` | §4.1 列 `overview`、`bug`、`pipeline`，实测 `pipeline` 未用 |
| `ac-flow-v`（纵向流程） | **4** | `bug`、`knowledge`、`prototype`、`schedule` | §4.1 列 `coding`、`bug`，实测 `coding` 用的是横向 `ac-flow` |
| `Drawer.tsx` / `Modal.tsx` 导入 | **21** | 全部 21 页 | 一致（§4.1 记「全部」） |
| `role="img"`（内联 SVG 图表无障碍） | **15** | `ai-observe`、`api-test`、`coding`、`design`、`insight`、`knowledge`、`overview`、`people`、`pipeline`、`project`、`prototype`、`release`、`req-pool`、`schedule`、`team` | §4.1 未列；**本轮 8 个新页全部命中** |
| `aria-label` | **18** | 除 `BoardPage`、`IntegrationPage`、`RequirementPage` 外全部 | §4.1 未列；**本轮 8 个新页全部命中** |
| `ac-search-card` / `ac-filter` / `ac-toolbar` | **15** | 其中 `ac-search-card` **仅 `BugPage` 1 处** | §4.1「筛选区统一 `ac-search-card`；复用页面 board、test、bug、integration、settings、ai-observe」**与实测不符**，登记为待校对项（见 §12） |

> **待校对项（只登记，不改 `style.css` 与页面）**：① `ac-ai-block` 的 §4.1 复用页面清单与实测完全不重叠，疑为 v1.0 记录时的类名口径差异；② `ac-search-card` 实际只有 `bug` 页在用，其余页面的筛选区用的是页面前缀类（如 `ac-at-filter`、`ac-rp-filter`），「统一 `ac-search-card`」的表述应改为「筛选区容器可用 `ac-search-card` 或页面前缀筛选条」；③ `ac-badge` / `ac-progress` 的既有清单含未命中页面。

### 4.4 本轮沉淀的跨页统一模式（新增 4 条，均为 8 个新页与 3 个增强页共用）

本轮 8 个新页没有引入新的**组件文件**（`components/` 仍只有 `Layout.tsx` / `Drawer.tsx` / `Modal.tsx`），但沉淀出 **4 种可复用的实现模式**。它们目前是各页内的同构代码，真实实现阶段应按 §5.6 的思路抽为共享件。

#### 4.4.1 乐观更新覆盖层模式（**跨页统一规范**）

**规范**：

```tsx
// ① 本地覆盖层：只记录「与服务端快照的差异」，键为实体 id
const [overrides, setOverrides] = useState<Record<string, Override>>({});

// ② 派生叠加：useMemo 把覆盖层叠加到只读常量上，得到「当前视图数据」
const liveRows = useMemo(
  () => SOURCE_ROWS.map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r)),
  [overrides],
);

// ③ 写操作：先写覆盖层（UI 立即变化），再「模拟」发请求；失败则删除该键回滚
const adopt = (id: string, patch: Override) => {
  setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  // 真实实现：await POST ...；catch → setOverrides(prev => { delete next[id]; return next; })
};
```

**三条硬约束**：

1. **从不写回数据模块**：4 个数据模块的导出常量是 `const` 冻结对象，页面**不得** `push` / `splice` / 直接改属性；覆盖层是唯一可写载体（§4.2 规则 6）。
2. **覆盖层只存差异**：不复制整行，只存被改动的字段（`Partial<T>`），保证服务端权威值到达后可无损合并。
3. **派生一律 `useMemo`**：叠加计算不得写在 render 体内（§5.1 关键约束），依赖数组只含 `[overrides]` 与源常量。

**本轮真实采用该模式的页面清单（grep `useState<Record<...>>` 核实，17 页）**：

| 页面 | 覆盖层状态名 | 覆盖内容 |
|:---|:---|:---|
| `board` | `stateOverride` | 卡片跨列移动后的状态 |
| `requirement` | `reviewStates`、`reviewLogs` | 评审意见状态与追加日志 |
| `design` | `overrides`、`subTasks`、`estimateOverrides`、`riskAck`、`overrideInput`、`brkDecisions`、`brkDrafts`、`brkAcOpen`、`expandedGroups` | 任务工时/负责人、AI 再拆解子任务、**AI 工时预估的人工改判**、风险知悉勾选、**拆解建议的逐条/部分采纳** |
| `schedule` | `overrides`、`expanded` | **AI 排期建议的采纳/驳回/自动应用**、行展开 |
| `coding` | `hunkState`、`govOverrides` | Diff 逐块决策、**IDE 同步区的出网治理改判** |
| `pipeline` | `stageOverrides`、`releaseOverrides` | 阶段重试后的状态、发布单状态 |
| `bug` | `overrides`、`ruleEnabled` | 「采纳建议并指派」后的状态与指派人、通知规则开关 |
| `settings` | `ruleEnabled` | 脱敏规则启停 |
| `project`（**新**） | `diagVotes`、`commVotes`、`msVotes` | AI 健康诊断 / 沟通建议 / 里程碑延期预测的采纳-驳回 |
| `people`（**新**） | `insightVotes`、`rebalanceVotes`、`growthVotes` | AI 技能洞察 / 产能再平衡 / 成长计划的采纳-驳回 |
| `team`（**新**） | `collabState`（`Record<string, { decision, health }>`） | AI 协作优化建议的「采纳 · 转派 · 驳回」+ 协作健康度升级 |
| `req-pool`（**新**） | `overrides`、`rescored` | 阶段迁移与入迭代结果、AI 优先级重评分（试算不落库） |
| `prototype`（**新**） | `reviewOverrides`、`exportState`、`confChecks` | 批注三动作状态、4 格式导出进度、冲突检查勾选 |
| `release`（**新**） | `scopeOverrides`、`riskOverrides`、`calOverrides`、`checklist` | AI 版本范围建议、迁移风险采纳、日历冲突「调整/保持」、冻结预检清单 |
| `api-test`（**新**） | `flakyDecision`、`mockOverrides`、`dsExtraRows`、`failureDecision` | flaky 诊断采纳-驳回、Mock 启停、数据集行数、失败项「提 Bug / 重跑」 |
| `knowledge`（**新**） | `ruleOverrides`、`evalRuns` | 归档规则启停、评测集运行态 |

> `insight`、`integration`、`ai-observe`、`overview` 四页为纯查询页，无覆盖层（`integration` 的死信重放按 §5.3 走局部行更新，未使用 `Record` 覆盖表）。

#### 4.4.2 门禁禁用态模式（**跨页统一规范**）

**规范（四要素缺一不可）**：

```tsx
// ① 结构化判据：由数据算出布尔量，不靠人工猜测
const blockers: string[] = [];
if (gate.status !== 'passed') blockers.push(`门禁 ${gate.id} 未通过（实测 ${gate.actual}）`);
if (constraint.failed)        blockers.push(`约束校验失败：${constraint.reason}`);
const canAdopt = blockers.length === 0;

// ② 按钮 disabled + 类名双写（原生 disabled 保证键盘不可达，类名保证视觉一致）
<button
  type="button"
  className={`ac-btn ac-btn--ai ${canAdopt ? '' : 'ac-btn--disabled'}`}
  disabled={!canAdopt}
  title={canAdopt ? undefined : blockers.join('；')}   // ③ title 写明原因
>采纳</button>

// ④ ac-hint--danger 展开明细（title 只能承载一行，明细必须可见）
{!canAdopt && (
  <div className="ac-hint ac-hint--danger">
    <TriangleAlert size={13} />
    <div><strong>「采纳」已禁用，原因如下：</strong>{blockers.map((b) => <div key={b}>{b}</div>)}</div>
  </div>
)}
```

**与 §5.4 的关系**：§5.4 是 v1.0 的「门禁与禁用态」场景表（5 个场景）；本模式是其**实现层规范**，两者配套使用——§5.4 回答「哪些按钮受门禁约束」，本节回答「受约束的按钮必须怎么写」。

**本轮真实采用该模式的页面清单（grep `ac-btn--disabled` / `disabled={` 核实）**：

| 页面 | 禁用判据（代码原文） | 受约束的动作 | 真实禁用样例 |
|:---|:---|:---|:---|
| `design` | `gate.blocked && !riskAck[e.id]`（第 2760 / 3565 行） | AI 工时预估的「采纳」 | `EST-04`、`EST-06`、`EST-12`（置信度 < 70% 且单一风险因子权重 ≥ 50%） |
| `schedule` | `blockers.length > 0` / `dsBlockers.length > 0`（第 1530 / 2801 行） | AI 排期建议的「采纳」 | `SCH-02`、`SCH-03`（约束校验不通过） |
| `coding` | G3 门禁 `failed` + 产物齐备度（第 842 / 1989 / 2001 行） | 「触发部署（G3 联动）」 | G3 当前 `failed`，逐条列出禁用原因 |
| `prototype`（**新**） | `canGenerate = prdBaseline.baseline === true && fReqs.length > 0 && fDevices.length > 0`（第 1742 行） | 「开始生成」 | PRD 非基线 / 未选需求 / 未选设备 |
| `prototype`（**新**） | 存在未闭环 `blocker` 级批注 | 「锁定基线」 | `PT-03` 的 2 条阻断级批注待 `ag-pm` 回应 |
| `release`（**新**） | `failedBlockingGates(freezeTarget).length > 0`（第 3461 行） | 「冻结基线」（`canFreeze=false` 时按钮文案降为「冻结预检」） | G3 `failed` |
| `api-test`（**新**） | `gatePass`（`gateImpact.pass`，第 3310 行） | 「签发报告」 | 4 项缺失原因 |
| `req-pool`（**新**） | 批量入迭代容量校验（`batchOverflow` → `ac-hint--danger`，第 3323 行） | 「确认入迭代」 | 超过迭代容量 120% 需 `manager` + `pmo` 双签（impl-10 §8.4） |
| `knowledge`（**新**） | 保鲜告警未全部处理 / 冲突未选胜者（第 5318 行 `ac-hint--danger`） | 保鲜复核主按钮 / 冲突仲裁提交 | 2 篇 `isStale=true`（`KD-07`、`KD-08`） |
| `project`（**新**） | 里程碑改期缺签核 / 新日期早于今天（第 1607 / 2480 / 2808 / 3282 行） | 「调整基线」 | `SDLC-MS-422` |
| `people`（**新**） | 再平衡建议的目标人已超载（第 3536 行） | 「采纳并转交」 | `RB-0x` |
| `pipeline`（既有） | 任一门禁 `status != 'passed'` 且未 `waived` | 「发布到 PROD」 | G3 覆盖率 71.4% < 85% |
| `bug`（既有） | `!canAdopt`（第 608 行：未选修复方案或无 AI 分析报告） | 「采纳建议并指派」 | — |

#### 4.4.3 手绘 SVG 图表模式（本轮新增 16 类图）

**规范**：① 一律内联 `<svg>`，不引图表库（§2 选型）；② 根 `<svg>` 必须带 `role="img"` + `aria-label`（§8）；③ 颜色只取 CSS 变量（`var(--ai)` 等），不写死色值；④ 容器必须 `min-width: 0` 且外层允许横向滚动，避免撑破栅格；⑤ 数据点 ≤ 30 直接渲染，超过则先聚合。

**本轮新增的 12 类图与归属页面**：

| 图类型 | 页面 | 数据源 |
|:---|:---|:---|
| 四象限散点（偏差 × 变更率） | `project` | `MGMT-01` `view=scatter` |
| 里程碑泳道时间线（含 `TODAY` 竖线） | `project` | `PROJECT_MILESTONES` 12 条 |
| 5×5 概率影响热力矩阵 | `project` | `PROJECT_RISKS` |
| RACI 决策域矩阵 / 权力-利益四象限 | `project` | `STAKEHOLDERS` |
| 技能热力网格（9 人 × 14 技能） | `people` | `SKILL_MATRIX` |
| 能力雷达双多边形（当期 vs 上期） | `people`、`team` | `TEAM_METRICS` |
| 组织架构树（两层） | `team` | `TEAMS` 7 条（`parentTeamId` 全 `null`） |
| 协作关系有向图（7 节点 8 边） | `team` | `TEAM_COLLABS` |
| 漏斗（6 阶段）+ 来源环形图 | `req-pool` | `REQ_FUNNEL`、`REQ_SOURCE_STATS` |
| 追溯链路图 / 版本路线图 / 月历 / 哑铃图 | `req-pool`、`release` | `REQ_POOL`、`VERSIONS`、`RELEASE_CALENDAR`、`VERSION_DIFFS` |
| 页面树（3 层导航）+ 交互流有向图 + 版本时间线 | `prototype` | `PROTOTYPE_PAGES`、`PROTOTYPE_VERSIONS` |
| 场景链路图（22 步 × 6 种 `stepType` 形状） | `api-test` | `API_SCENARIO_STEPS` |
| 力导向图（18 节点 26 边，虚线 = 未核验） | `knowledge` | `KB_GRAPH_NODES`、`KB_GRAPH_EDGES` |
| 特征权重贡献瀑布图 + 误差收敛折线 | `design` | `AI_EFFORT_ESTIMATES`、`EFFORT_ACCURACY_TREND_*` |
| 拆解 DAG 图 | `design` | `AI_BREAKDOWN_SUGGESTIONS` |
| 时序泳道图 | `coding` | `IDE_SYNC_EVENTS` 24 条 |

#### 4.4.4 可回放流程演示模式（本轮新增）

**规范**：把一条 `AI_AUTOMATION_FLOWS` 的 `steps[]` 渲染为「加权进度条 + 逐步日志 + 暂停/继续/重播」的可回放演示，用于向业务方解释「AI 到底做了什么」。

| 页面 | 回放的流 | 步数 | 权重来源 |
|:---|:---|:--:|:---|
| `prototype` | `AIF-01`（PRD 定稿 → 原型生成 → 批注评审 → 需求确认） | 8 | `STEP_WEIGHTS = [8,12,30,18,14,12,6]`（7 步生成流水线，合计 100） |
| `schedule` | `AIF-06`（迭代规划 → AI 排期与工时预估 → 冲突消解 → 甘特基线锁定） | 8 | 按 `steps[].durationSec` 归一 |
| `design` | AI 再拆解过程回放（`replayRunning` 态） | — | 按 `AI_BREAKDOWN_SUGGESTIONS[].tasks[].points` |

**三条实现约束**：① 回放态用 `sim.running` / `replayRunning` 一类布尔量守护，暂停时 `disabled={!sim.running}`；② 每步展示 `executor`（`ai` / `ai+human` / `human`）与 `fallbackAction`，人工检查点必须高亮；③ 回放不改动覆盖层，只读演示，重播即复位。

### 4.5 门禁禁用态场景补充（扩展 §5.4 的 5 个场景）

在 §5.4 既有 5 个场景之外，本轮新增 8 个受门禁 / 结构化判据约束的写操作（判据与代码行号见 §4.4.2）：

| 场景 | 禁用条件 | 提示来源 |
|:---|:---|:---|
| `design` 采纳 AI 工时预估 | 置信度 < 70% **且**单一风险因子权重 ≥ 50%，且未勾选「已知悉风险」 | `AI_EFFORT_ESTIMATES[].confidencePct` / `riskFactors[].weight` |
| `design` 提交 AI 再拆解 | `draftStat.canSubmit === false`（未选任何子任务或点数越界） | 本地 UI 状态 |
| `schedule` 采纳 AI 排期建议 | 约束校验 `blockers.length > 0`（资源 / 依赖 / 产能 / 截止 / 门禁五类） | `AI_SCHEDULE_SUGGESTIONS[].constraintChecks` |
| `prototype` 开始生成 | PRD 非基线 / 未选需求 / 未选设备 | `prd_version.baseline`、表单选择集 |
| `prototype` 锁定基线 | 存在未闭环 `blocker` 级批注，或存在 `ai-generated` 组件未经 `architect` 确认 | `PTP-17` 守卫（impl-11 §5.2） |
| `release` 冻结基线 | `failedBlockingGates()` 非空（阻断类门禁未通过） | `GATES` 实时读取（**不走缓存**，impl-10 §6） |
| `api-test` 签发报告 | `gateImpact.pass === false` | `apiTestReport.summary.gateImpact` |
| `knowledge` 提交冲突仲裁 | 未选择胜者 | `KB_GOVERNANCE` `kb-gov-06` |

---

## 5. 状态管理与数据刷新策略

### 5.1 状态分层

| 层 | 内容 | 载体 | 生命周期 |
|:---|:---|:---|:---|
| 全局壳状态 | 当前 `pageId`、当前迭代 `sprintId`、当前角色 `roleId`、侧边栏折叠 | `Layout.tsx` + `useHashPage`（pageId 落 URL hash） | 全会话 |
| 服务端状态 | 列表、详情、统计、映射表 | 页面内 `useState` 持有快照；真实实现替换为 React Query | 页面挂载期 |
| 客户端 UI 状态 | 当前 Tab、筛选条件、搜索关键字、展开集合（`Set<string>`）、选中行、抽屉/弹窗开关 | 页面内 `useState` | 页面挂载期，切页即弃 |
| 派生状态 | 过滤结果、分组、聚合计数、图表数据 | `useMemo` | 随依赖变化重算 |
| 乐观状态 | 本地覆盖表（如 `overrides: Record<bugId, {status, assigneeId}>`）、本地追加日志（`extraLogs`） | 页面内 `useState` | 直到服务端确认或回滚 |

**关键约束**：派生数据一律 `useMemo`，不在 render 内重复 `filter/reduce`；`Set` 型展开状态用函数式更新（`prev => new Set(...)`）避免闭包陈旧值。

### 5.2 实时刷新链路

```
进入页面 → client.subscribe { topics: ['sdlc.task.*'], filters: {sprintId} }
        ← server.subscribe.ack { topics, snapshotSeq }
        ← 首屏 REST 拉取（携带 snapshotSeq 作为一致性水位）
运行中   ← task.state_changed / gate.result / bug.created / sync.status ...
        → 按 payload 中的实体 id 做局部更新
离开页面 → client.unsubscribe { topics }
```

- **心跳**：每 25s `client.ping`，服务端 `server.pong`；两次未响应视为断线。
- **断线重连**：按 impl-01 §7.1 退避重连，握手时 `client.hello` 携带 `resumeFromSeq` / `lastMsgId` 做增量续传。
- **补偿**：若 `server.welcome.currentSeq` 与本地水位差值超阈值（>200 条），放弃增量、整页重拉快照（impl-01 §7.2）。
- **轮询兜底**：`insight` 无订阅需求；`ai-observe` 的 trace 列表与 `test` 的导入任务进度用 30s / 2s 轮询兜底。

### 5.3 乐观更新与回滚

以 `bug` 页「采纳建议并指派」为规范样例：

1. 用户在 AI 分析抽屉选定修复方案 → 点「采纳建议并指派」→ 确认弹窗展示指派人、匹配理由、状态流转（`analyzing → fixing`）、是否同步 PingCode。
2. 确认后立即写本地 `overrides[bugId] = { status:'fixing', assigneeId }`，台账行与抽屉徽标同步变化（**不等服务端**）。
3. 同时向 `extraLogs` 头插一条 `result:'sent'` 的通知日志，用户在「通知与订阅」标签可见。
4. 并行发起 `POST /bugs/{id}/transitions`（携带 `expectedVersion`）与 `POST /bugs/{id}/notify`。
5. 成功：以服务端 `seq` 为准合并，丢弃本地覆盖；`sdlc.bug.state_changed` 到达时按 `msgId` 幂等去重（impl-01 §6）。
6. 失败：
   - `SDLC-BUG-409`（缺陷非法迁移**或**守卫失败，如 `mrId`/`branch` 为空、根因报告未 `approved`）→ 回滚覆盖 + `ac-hint--danger` 展示 `detail.message` 与 `allowedNext`（口径以 impl-03 §5.2 为准）；
   - `SDLC-TASK-409`（乐观锁冲突）→ 回滚 + 强制刷新该行；
   - 网络失败且 `retryable:true` → 保留乐观态并进入重试队列，UI 标「同步中」。

同一模式适用于 `board` 卡片拖拽、`schedule` 工时内联编辑、`settings` 开关切换、`integration` 死信重放；**（本轮扩展）** 亦适用于 `schedule` 的 AI 排期建议采纳、`design` 的 AI 工时预估改判与拆解建议采纳、`project` / `people` / `team` / `req-pool` / `release` / `prototype` / `api-test` / `knowledge` 八页的全部「采纳 / 驳回 / 转派 / 启停 / 试运行」动作——完整清单与状态名见 §4.4.1。

### 5.4 门禁与禁用态

写操作按钮的可用性由**服务端事实**决定，不做前端猜测：

| 场景 | 禁用条件 | 提示来源 |
|:---|:---|:---|
| `coding` 触发部署 | 本地测试未全绿（`failed > 0` 或 `exitCode != 0`） | `test.report` 上行结果 |
| `pipeline` 发布到 PROD | 任一门禁 `status != 'passed'`（且未 `waived`） | `GET /gates` + `gate.result` 事件 |
| `bug` 采纳并指派 | 未选择修复方案，或该缺陷无 AI 分析报告 | 本地 UI 状态 |
| `design` 同步 PingCode | 未勾选任何故事 / 连通性检测失败 | `GET /integrations/pingcode/config` |
| `settings` 保存出网档位 | `expectedVersion` 陈旧 | `PUT` 返回 `SDLC-SEC-409` |

禁用按钮必须同时给出**缺失原因文案**，不允许只灰不解释。

### 5.5 缓存失效与大列表

- **精准失效**：收到 `sdlc.task.state_changed{taskId}` 只失效该 task 及其所属看板列计数；`sdlc.gate.result{gateId}` 只失效对应门禁卡与发布按钮态。禁止「任何事件都整页重拉」。
- **快照缓存**：`insight` 按 `range+dim` 键缓存 5 min；`ai-observe` 按 `range` 缓存 60s；`settings` 的 RBAC 矩阵缓存至角色切换。
- **虚拟滚动阈值**：单表渲染行数 > 200 时引入虚拟滚动；甘特任务行 > 150 时对时间轴做窗口化渲染。当前原型最大表为 `bug` 通知日志（47 条）与 `test` 用例（20 条代表样本），均未触阈值。
- **重渲染控制**：表格行组件保持纯函数；`onClick` 用稳定引用（`useCallback`）；避免在 `map` 内创建新对象作为 props。
- **（本轮扩展）新页面的快照缓存键**：`cache:portfolio:{tenantId}` 60 s（`project` 组合视图）、`cache:project:{projectId}` 300 s（`project` 详情）、技能矩阵按 `userId × skillId` 300 s（`people`）、效能快照按 `sprintId + teamId` 300 s（`team`）、`cache:reqpool:{projectId}:{stage}` 120 s + 漏斗与来源统计 300 s（`req-pool`）、`cache:ptpjob:{jobId}` 60 s（生成中）→ 300 s（完成后）（`prototype`）、发布日历按月 300 s（`release`）、`cache:kb:stats:overview` 60 s（`knowledge`）。
- **（本轮扩展）两个「禁止缓存」的例外**：① `release` 页的**冻结预检**（`MGMT-38`）每次打开 Modal 都实时读 `GATES`，否则门禁状态变化后 `canFreeze` 会给出错误结论（impl-10 §6）；② `prototype` 页的 **AxHub 健康检查**（`PTP-21`）不缓存，60 s 轮询探测（impl-11 §5.2）。
- **（本轮扩展）大列表实测**：本轮新页的最大表为 `req-pool` 需求池 15 列 × 20 条、`knowledge` 文档清单 17 列 × 20 篇、`api-test` 用例库 16 条 / 场景步骤 22 条、`coding` 的 IDE 同步事件流 24 条，**均未触及 200 行虚拟滚动阈值**；`people` 的技能热力网格为 9 × 14 = 126 个单元格，属 SVG 网格而非表格行，同样不触阈值。

### 5.6 真实实现阶段的演进

原型用 **4 个数据模块**（`data.ts` / `data-mgmt.ts` / `data-ai-flow.ts` / `data-kb.ts`）的静态假数据 + 页面内 `useState`（本轮扩展：v1.0 为单一 `data.ts`）。接入真实后端时按以下顺序替换，**不改页面结构与类名**：

1. 抽 `services/<domain>.ts` 封装 REST（对应 impl-01 §4 各域，本轮扩展追加 impl-10 §3 的 `MGMT-*`、impl-11 §5.2 的 `PTP-*`、impl-12 §7.1 的 24 项、impl-13 §9.1 的 30 项）；
2. 引入 React Query 管理服务端状态与缓存失效（替换 §5.5 的手写缓存）；
3. 抽 `realtime/useSdlcSubscription(topics, filters, onEvent)` 封装 `client.subscribe` + 重连 + 幂等去重；
4. 把各页重复的 `tagTone/TONE_VAR/TIMELINE_TONE` 上提为 `components/tone.ts`；
5. 类型由 impl-01 的 Schema 生成（impl-09 §3.3 的 `schema-gen --check` 保证无 diff）；
6. **（本轮新增）** 把 §4.4.1 的乐观更新覆盖层抽为 `hooks/useOptimisticOverlay<T>(source, keyFn)`，把 §4.4.2 的门禁禁用态抽为 `components/GatedButton.tsx`（props：`blockers: string[]` + `title` + `hintTone`），把 §4.4.4 的可回放流程抽为 `components/FlowReplay.tsx`（props：`steps: AutomationFlowStepDef[]` + `weights?: number[]`）。

### 5.7 本轮新增页面的刷新策略与订阅主题汇总（本轮扩展）

| pageId | 订阅主题（通配） | 精准失效粒度 | 轮询兜底 | 覆盖层 |
|:---|:---|:---|:---|:---|
| `project` | `sdlc.project.*`、`sdlc.milestone.*`、`sdlc.risk.*`、`sdlc.stakeholder.updated`、`sdlc.gate.*` | 健康灯与分值（`health_changed`）；里程碑行（`slipped`/`rebaselined`/`completed`）；风险行 | 无 | `diagVotes`、`commVotes`、`msVotes` |
| `people` | `sdlc.member.*`、`sdlc.workload.*`、`sdlc.task.*` | 负载表**只更新涉及的两人行与条形图**（`rebalanced`）；证书告警条头插（`cert_expiring`，每日 08:00 扫描） | 无 | `insightVotes`、`rebalanceVotes`、`growthVotes` |
| `team` | `sdlc.team.*`、`sdlc.ceremony.summary_generated`、`sdlc.workload.overloaded` | 协作图**只更新对应边与健康标记**（`collab_blocked`）；阻塞看板头插 | 无 | `collabState` |
| `req-pool` | `sdlc.reqpool.*`（`E-19`~`E-25`）、`sdlc.task.state_changed` | **只移动对应行的阶段标签并更新阶段流计数**（`item_stage_changed`）；批量入迭代成功后按响应 `scheduled[]` 逐行乐观更新，**任一失败整体回滚**（单事务） | 无 | `overrides`、`rescored` |
| `prototype` | `sdlc.prototype.*`（`P-01`~`P-16`）、`sdlc.agent.<runId>`、`sdlc.prd.baselined`、`sdlc.notify.*` | 按 `seq` 与 `pageCode` 精准失效步骤条与页面树（`P-03`/`P-04`/`P-09`）；批注区头插与状态替换（`P-10`/`P-11`）；版本时间线追加节点（`P-12`/`P-13`） | `PTP-21` 健康检查 **60 s**（`presence:axhub:health`） | `reviewOverrides`、`exportState`、`confChecks` |
| `release` | `sdlc.version.*`、`sdlc.changeset.*`、`sdlc.calendar.*`、`sdlc.gate.*`、`sdlc.pipeline.*` | 收到 `sdlc.gate.result` 后**重算 `canFreeze`** 并即时切换冻结按钮禁用态与缺失原因文案；日历收到 `E-31`/`E-32` 后**只重绘冲突组** | 无（冻结预检每次实时读） | `scopeOverrides`、`riskOverrides`、`calOverrides`、`checklist` |
| `api-test` | `sdlc.apitest.*`（8 主题）、`sdlc.gate.*`、`sdlc.bug.*`、`sdlc.pipeline.*`、`sdlc.agent.<runId>` | `run_completed` 到达时**只更新对应执行行与报告 `summary`**；AI 生成走 SSE 逐条追加 `reasoning[]`/`steps[]`，`done:true` 后整块落草稿列表 | 执行中的 run **5 s**（进度条） | `flakyDecision`、`mockOverrides`、`dsExtraRows`、`failureDecision` |
| `knowledge` | `sdlc.kb.*`（10 主题）、`sdlc.gate.*`（`gate.passed:G1/G2/G6`）、`sdlc.notify.*` | `doc_indexed`/`ingest_completed` 到达时**只更新对应文档行的 `embedStatus` 与入库记录卡片**；`doc_stale`/`conflict_detected` 走 `notify.push` 插入告警卡 | 进行中的入库批次 **5 s**（7 步进度）；检索测试台为**同步 REST，不订阅** | `ruleOverrides`、`evalRuns` |

**一条贯穿全部 21 页的硬约束（本轮扩展）**：

> **三个新数据模块（`data-mgmt.ts` / `data-ai-flow.ts` / `data-kb.ts`）与既有 `data.ts` 一样，均为只读常量模块**（全部导出为 `export const`，无任何 setter / mutator）。页面上看到的任何「已采纳」「已发布」「已冻结」「已解决」「已启动」状态，**一律是本地乐观更新覆盖层的产物**（§4.4.1），刷新页面即复位。真实实现阶段这些状态改由服务端权威值 + `sdlc.*` 事件驱动，覆盖层退化为「请求在途」的临时态。这条约束保证了：① 原型可被任意次演示而不污染数据；② 页面之间零共享可写状态，可完全并行开发（§2.1 分层职责）；③ 接入真实后端时**不需要改页面结构**，只需把覆盖层的写入点替换为 `mutation.onMutate`（§5.6 第 2、6 条）。

---

## 6. 按角色的视图权限差异

角色取自 `data.ts` 的 `ROLES`（7 个），权限语义与 impl-08 的 RBAC 矩阵一致（查看 / 编辑 / 审批 / 配置）。

| roleId | 角色名 | 默认落地页 | 重点关注页 | 可编辑 | 可审批 | 可配置 |
|:---|:---|:---|:---|:---|:---:|:---:|
| `manager` | 研发管理者 | `overview` | overview、insight、ai-observe | 无（只读全局） | ✅ 发布审批、PRD 签发 | ❌ |
| `product` | 产品经理 | `requirement` | requirement、overview、insight | 需求、PRD、评审意见 | ✅ PRD 定稿 | ❌ |
| `architect` | 架构师 | `design` | design、requirement、coding | 架构文档、接口契约、任务拆解与估算 | ✅ 契约冻结、根因报告评审 | ❌ |
| `developer` | 研发工程师 | `board` | board、coding、bug | 自有任务状态、Diff 决策、缺陷修复 | ❌ | ❌ |
| `tester` | 测试工程师 | `test` | test、bug、pipeline | 用例、测试计划、报告签发、缺陷验证 | ✅ G4 测试门禁 | ❌ |
| `ops` | 运维工程师 | `pipeline` | pipeline、settings、ai-observe | 流水线重试、环境、发布批次 | ✅ G5 发布门禁、门禁 waive | ✅ 出网档位、脱敏规则、通知渠道 |
| `pmo` | 项目经理（PMO） | `schedule` | schedule、board、overview | 排期、依赖、里程碑 | ✅ 变更窗口 | ✅ 同步队列、死信重放、对账 |

> **（本轮扩展）落地页与 `focusPages` 的处理**：8 个新页面**不作为任何角色的默认落地页**，`ROLES[].homePage` 保持上表取值不变（impl-10 §7.3 明确「避免改变既有登录体验」）。impl-10 §7.3 建议的 `focusPages` 扩展（`manager` 追加 `project`/`release`；`pmo` 追加 `project`/`team`/`req-pool`；`product` 追加 `req-pool`；`architect` 追加 `release`；`ops` 追加 `release`）需改 `data.ts`，**本篇只登记建议，不代为修改**。

### 6.1 页面级可见性矩阵

`●` 完整可编辑 / `◐` 只读 / `○` 不可见（菜单隐藏）

| pageId | manager | product | architect | developer | tester | ops | pmo |
|:---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `overview` | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ● |
| `requirement` | ◐ | ● | ● | ◐ | ◐ | ○ | ◐ |
| `design` | ◐ | ◐ | ● | ◐ | ○ | ○ | ◐ |
| `board` | ◐ | ○ | ◐ | ● | ◐ | ◐ | ● |
| `schedule` | ◐ | ○ | ◐ | ◐ | ○ | ○ | ● |
| `coding` | ○ | ○ | ◐ | ● | ○ | ○ | ○ |
| `pipeline` | ◐ | ○ | ◐ | ◐ | ◐ | ● | ◐ |
| `test` | ◐ | ◐ | ○ | ◐ | ● | ◐ | ◐ |
| `bug` | ◐ | ◐ | ◐ | ● | ● | ◐ | ◐ |
| `insight` | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ● |
| `integration` | ○ | ○ | ○ | ○ | ○ | ◐ | ● |
| `ai-observe` | ● | ○ | ◐ | ○ | ○ | ● | ○ |
| `settings` | ◐ | ○ | ○ | ○ | ○ | ● | ○ |
| `project` | ● | ◐ | ◐ | ○ | ○ | ◐ | ● |
| `people` | ● | ◐ | ◐ | ◐（仅本人行） | ◐ | ◐ | ● |
| `team` | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ● |
| `req-pool` | ◐ | ● | ◐ | ○ | ◐ | ○ | ● |
| `prototype` | ◐ | ● | ● | ◐ | ◐ | ◐ | ◐ |
| `release` | ● | ◐ | ● | ◐ | ◐ | ● | ● |
| `api-test` | ◐ | ◐ | ◐ | ◐ | ● | ◐ | ◐ |
| `knowledge` | ● | ◐ | ● | ◐ | ◐ | ◐ | ◐ |

**矩阵规模：21 页 × 7 角色 = 147 格**（v1.0 为 13 × 7 = 91 格，本轮 +56 格）。既有 13 行**原样保留**；追加的 8 行来源如下：

| pageId | 可见性来源 | 判定依据（逐字摘取要点） |
|:---|:---|:---|
| `project` | **impl-10 §7.1**（逐字） | `manager` 的 `view=全部` + `approve=全部` + `admin=本域`，是项目组合与周报签发的唯一责任人；`pmo` 的 `edit=只读` 但 `admin=本域`，承担排期、里程碑与风险治理，故为 `●`；`product`/`architect`/`ops` 需看健康度与门禁实测但不改基线，为 `◐`；`developer`/`tester` 的项目组合视角与其作业无关，为 `○`，**避免暴露预算与人力成本** |
| `people` | **impl-10 §7.1**（逐字） | `manager` 全量（含 L3 受限字段）；`pmo` 需负载与产能做排期，为 `●`；`architect` 需技能矩阵做任务分派与单点依赖治理，为 `◐`（不含成本与绩效列）；`developer` 按 impl-08 §6.3 的 `own` 作用域**只看本人行**；`product`/`tester`/`ops` 只读聚合视图 |
| `team` | **impl-10 §7.1**（逐字） | `manager`/`pmo` 为治理主体（`●`）；其余 5 角色需看协作关系与阻塞但不改编制，为 `◐`。`developer` 保留 `◐` 的理由：`COOP-02`（`BLOCK-0312`）直接影响其任务，需看到阻塞治理看板与升级路径 |
| `req-pool` | **impl-10 §7.1**（逐字） | `product` 是需求池的责任角色（`ReqPoolItemDef.ownerRoleId` 多为 `product`），为 `●`；`pmo` 负责排期与容量校验（`MGMT-31` 的容量守卫），为 `●`；`manager` 只读 + 否决权，为 `◐`；`architect` 需看技术复杂度与依赖契约状态，为 `◐`；`tester` 需看追溯与断链（用例覆盖的起点），为 `◐`；`developer`/`ops` 与池治理无关，为 `○` |
| `prototype` | **本篇按 impl-11 §5.2 的 22 个 `PTP-*` 接口权限标注推导**（impl-11 未设「角色可见性」小节，见 §12 待校对项 D-01） | `product` 为主写角色（`PTP-01` 写：`product`（主）、`architect`；`PTP-16` 人工出版本；`PTP-17`/`PTP-18` 签核与审批），为 `●`；`architect` 同为主写（`PTP-01`/`PTP-09`/`PTP-13`/`PTP-18` 写 + `PTP-17` 签核 + `ai-generated` 组件确认权），为 `●`；`manager` 只有审批与取消权（`PTP-05` `cancel` 需 `manager`；`PTP-06` 重跑审批；`PTP-13` `blocker` 级驳回二次确认；`PTP-17` 审批；`PTP-18` `gateEvidence=true` 审批），日常不编辑，为 `◐`；`developer` 读全量但 `tokenCost` 被剔除（`PTP-02`），写权限仅 `PTP-09` 的 `own` 与 `PTP-12` 批注，为 `◐`；`tester` 参与批注评审（`PTP-13` 写含 `tester`）但不改原型，为 `◐`；`ops` 仅「AxHub 能力与自动化编排」标签（`PTP-20` 读 `ops`/`manager`/`architect`/`product`；`PTP-21` 写 `status` 仅 `ops`），页面级为 `◐`；`pmo` 只读（`PTP-02`/`PTP-22` 读全量），为 `◐`。**无 `○` 格** |
| `release` | **impl-10 §7.1**（逐字） | 版本规划是**四方共担**：`manager`（范围与优先级裁决）、`architect`（契约冻结与破坏性变更评审，`approve=架构门禁`）、`ops`（发布窗口与环境，`approve=发布审批`）、`pmo`（发布日历与冲突消解）均为 `●`；`product` 需看版本范围与需求归属，为 `◐`；`developer`/`tester` 需看变更集与基线 commit（决定测试与修复范围），为 `◐` |
| `api-test` | **impl-12 §9.2**（逐字） | `tester` 为 `●`（`rbacMatrix.tester = { view:全部, edit:本域, approve:测试报告 }`；`SDLC_STAGES[st-test].ownerRoleId='tester'`；`GATES.G4.ownerRoleId='tester'`）；其余 6 角色为 `◐`。**与 `test` 行的差异**：`test` 页 `architect` 为 `○`，本页 `architect` 为 `◐`，理由是契约覆盖度直接指向架构师职责（`API_CONTRACTS[].reviewerId` 6 份为 `u-yan`），且 `aiRecommendedActions` 有 `ownerRoleId='architect'` 的动作项。`pmo` 的 `◐` 为只读（`edit=readonly`，`PUT/POST` 返回 `SDLC-AUTH-403`） |
| `knowledge` | **impl-13 §11.2**（逐字） | `manager` 全部空间的治理策略配置（`kb-gov-01`~`06` 的 `ownerIds` 含 `u-lin` 4 条）、归档规则启停、冲突仲裁、审计查询，为 `●`；`architect` 图谱边人工核验（`verifiedBy='u-yan'` 10 条）、架构类文档保鲜、归档规则 `condition` 修改、冲突仲裁（`kb-gov-06.ownerIds=['u-yan']`）、手动触发重索引，为 `●`；其余 5 角色为 `◐`。**无 `○` 格**：知识库是全部 7 个角色的公共基础设施（`WK-01`/`WK-03`/`WK-04`/`WK-08` 四项能力的 `agentIds` 都是全 7 个 Agent）。页面级矩阵只表达「治理与全局配置」的可见性，**文档级细粒度权限以 impl-13 §10.1 的 4 级访问矩阵为准**，空间级编辑权由 `kb_space.owner_ids` 决定（6 个空间的 Owner 覆盖 5 个角色） |

**8 个新页的 `○`（不可见）格统计**：56 格中仅 **4 格** —— `project` 的 `developer` / `tester`（2 格，理由：避免暴露预算与人力成本）与 `req-pool` 的 `developer` / `ops`（2 格，理由：与池治理无关）。`people` / `team` / `prototype` / `release` / `api-test` / `knowledge` 六页**对全 7 角色可见**，差异只在编辑权与列级过滤（impl-10 §8.2 字段分级表、impl-13 §10.1 四级访问矩阵）。这与既有 13 行中 `integration`（5 个 `○`）、`coding`（5 个 `○`）、`ai-observe`（4 个 `○`）的高隐藏率形成对比：**本轮新增页面以「全员可见的治理与知识基础设施」为主**。

### 6.2 落地与降级规则

- 登录后按 `ROLES[roleId].homePage` 跳转；手动访问无权限页面时渲染 `ac-empty` + 「无权限，返回我的主页」按钮，不白屏。
- 只读页隐藏全部写操作按钮（不是禁用），避免误点后再报错；`◐` 页面的抽屉/弹窗保留但去掉 footer 动作区。
- 顶栏角色切换器在原型中用于演示；**真实实现必须移除**，角色只由 `GET /auth/me` 的 `roles[]` 决定。
- **前端权限只是展示层收敛**：所有写接口在服务端必须二次校验（impl-08 §5），越权返回 `SDLC-AUTH-403` 或 `SDLC-STATE-403`。

---

## 7. 分页面开发工时拆分

角色代号沿用 impl-09 §3.2（R4 前端、R1/R2/R3 后端、R7 AI 工程、R9 测试）。

| pageId | 页面 | 复杂度 | 前端人日 | 后端人日 | 联调人日 | 主要依赖 | 并行组 |
|:---|:---|:--:|:--:|:--:|:--:|:---|:--:|
| — | 设计系统 + Layout + 路由（`style.css`/`components/`） | 高 | 6 | 1 | 1 | impl-01 契约冻结 | A |
| `overview` | 总览驾驶舱 | 中 | 4 | 2 | 1 | `/metrics/overview` | B |
| `requirement` | 需求工作台（含流式） | 高 | 7 | 4 | 2 | `ag-pm`、`/brainstorm/sessions`、SSE | C |
| `design` | 架构设计与任务拆解 | 高 | 7 | 4 | 2 | `ag-arch`、`POST /tasks`、同步预览 | C |
| `board` | 任务看板 | 中 | 5 | 2 | 2 | impl-03 状态机、`sdlc.task.*` | B |
| `schedule` | 排期甘特（CSS 甘特 + SVG 依赖） | 高 | 8 | 3 | 2 | 任务依赖与冲突算法 | D |
| `coding` | AI 编码协作（会话流 + Diff） | 极高 | 10 | 5 | 3 | `ag-code`、impl-06 插件上行、`coding.diff.decision` | C |
| `pipeline` | 部署流水线（8 泳道 / 6 数据阶段 + 6 门禁） | 高 | 8 | 5 | 3 | `sdlc.pipeline.*`、`sdlc.gate.*`、`/releases` | D |
| `test` | 测试中心（树 + 导入 + 报告） | 高 | 8 | 5 | 2 | `ag-test`、`/test-cases/import`、G4 | E |
| `bug` | Bug 流转（台账 + AI 分析 + 状态机 + 通知） | 极高 | 10 | 6 | 3 | `ag-review`/`ag-ba`、impl-03 缺陷状态机、通知中心 | E |
| `insight` | 效能报表（SVG 图表 ×4 组） | 中 | 6 | 4 | 1 | `/metrics/efficiency` 聚合口径 | B |
| `integration` | PingCode 集成中心 | 中 | 6 | 3 | 2 | impl-05 Provider、同步队列、对账 | D |
| `ai-observe` | AI 能力观测（调用链追踪） | 高 | 7 | 4 | 2 | impl-02 Agent 契约、`model_call_log`、`traceId` | E |
| `settings` | 安全与审计 | 中 | 5 | 3 | 1 | impl-08 出网/脱敏/审计/RBAC | B |
| **合计** | 13 页 + 基底 | — | **95** | **51** | **27** | — | — |

**总计 173 人日 ≈ 34.6 人周**，落在 impl-09 §3.2 中 R4 前端（P0~P3 共 17 人周）+ 后端分摊 + 联调的量级内；控制台是跨 P0~P4 持续交付的产物，不集中在单一阶段。

> **上表为 v1.0 的 13 页范围，原样保留**（前端 95 + 后端 51 + 联调 27 = 173 人日）。本轮新增的 8 页与 4 个能力域的工时在 impl-10 / impl-11 / impl-12 / impl-13 各自的工时章节中声明，汇总见 §7.2；合并总计见 §7.3。

### 7.1 并行分组建议

| 组 | 页面 | 前置 | 说明 |
|:--:|:---|:---|:---|
| A | 设计系统 + Layout + 路由 | impl-01 契约冻结 | **阻塞全部**，必须最先完成 |
| B | overview、board、insight、settings | A | 依赖面窄、可率先出可演示闭环 |
| C | requirement、design、coding | A + impl-02 Agent 契约 | AI 强相关，需与 R7 同步联调 |
| D | schedule、pipeline、integration | A + impl-03/impl-05 | 状态机与外部同步强相关 |
| E | test、bug、ai-observe | A + impl-02/impl-03 | 质量域三页共用缺陷与 Agent 数据 |
| **E（扩充）** | **+ `api-test`** | A + impl-02 `ag-test` Schema + impl-12 §6 的 7 张新表迁移 | **本轮扩展**：impl-12 §9.3 明确「沿用 impl-07 §7.1 质量域，与 `test`/`bug`/`ai-observe` 同组」；与 `test` 页合计 33 人日，建议 1 名前端 + 1 名后端（R1）+ 0.5 名测试（R9）在 P3 内并行完成 |
| **F**（管理域基底） | 管理域基底（24 张表迁移脚本 + 触发器 + `tone` 派生服务 + 列级过滤中间件 + `stream:grp:mgmt` 消费者） | impl-04 迁移规范冻结、impl-08 §6.3 授权判定可用 | **本轮扩展**（impl-10 §9.1）：前端 2 / 后端 8 / 联调 2 = 12 人日；**阻塞 G/H/I**，必须最先完成；建议 R1 + R2 两人 4 周 |
| **G** | `project` + `people` | F | **本轮扩展**（impl-10 §9.1）：两页共享 `app_user` / `member_profile` 与 AI 裁决按钮组组件（`ProjectPage` 与 `PeoplePage` 的「采纳 / 驳回」实现同构，可抽 `components/AiVoteButtons.tsx`）；建议 2 名前端各领一页 |
| **H** | `team` + `req-pool` | F | **本轮扩展**（impl-10 §9.1）：`team` 的效能快照与 `req-pool` 的漏斗都依赖 `sprint` 表（缺口 G-05）；`req-pool` 的 8 阶段状态机需与 impl-03 的 `state-machine:8084` 服务共用迁移框架 |
| **I** | `release` | F + 缺口 G-03/G-04 补齐 | **本轮扩展**（impl-10 §9.1）：强依赖 `release_order` 与 `gate` 两张待补表，**必须**在 impl-04 补齐后开工，否则冻结预检无法落库 |
| **J** | 管理域 AI 能力（7 项） | impl-02 Agent 契约冻结、F | **本轮扩展**（impl-10 §9.1）：与 G/H/I **完全并行**（R7 独立推进）；先交付 impl-10 §5.4 评分（无 LLM 依赖，纯公式 + 解释）与 §5.7 窗口推荐（硬约束为主），后交付 §5.2 周报（一致性校验最复杂） |
| **K** | 管理域集成测试与验收 | G + H + I + J | **本轮扩展**（impl-10 §9.1）：R9 主导；权限矩阵用例（impl-10 §7.1 的 35 个格子 × 4 类操作）与 L3 字段剔除用例（impl-10 §8.2）为必测项 |
| **L** | 原型域基底（11 张表迁移 + 触发器 + `stream:grp:prototype` 消费者 + `q:ptp:*` 队列）+ AxHub 集成适配器 | impl-04 迁移规范、impl-08 校验点、AxHub OpenAPI 与沙箱环境可用 | **本轮扩展**（impl-11 §9.1）：**阻塞 M/N/O/P**；建议 R1（表与触发器）+ R3（适配器）两人 4 周；沙箱不可用时先用 Mock Server 打通契约（`AXHUB-01`~`06` 的 `inputArtifacts`/`outputArtifacts` 即 Mock 规格） |
| **M** | `prototype` 的 `jobs` + `canvas` 两个标签 | L | **本轮扩展**（impl-11 §9.1）：两标签共享任务选择器与步骤进度状态；`canvas` 的手绘 SVG 页面树与交互流有向图是本页最重的前端工作（8 人日），可复用 §4.1 的 `ac-arch` / `ac-flow` 类体系 |
| **N** | `prototype` 的 `components` + `versions` 两个标签 | L | **本轮扩展**（impl-11 §9.1）：批注评审与版本导出是**同一条闭环**（批注 → 修订 → 新版本 → 导出），必须由同一人做以避免状态口径分裂 |
| **O** | `prototype` 的 `capability` 标签 + 知识库归档与门禁证据挂载 | L + impl-13 的 `KB_STAGE_ARTIFACT_MAP` 扩展 | **本轮扩展**（impl-11 §9.1）：`capability` 标签是**只读展示**（无写操作），依赖面最窄，可由前端在等待 L 时先行开发（用 `data-ai-flow.ts` 静态数据） |
| **P** | 7 步流水线 Prompt 与降级 + 批注锚点回流 | L + impl-02 Agent 契约冻结 | **本轮扩展**（impl-11 §9.1）：R7 独立推进，与 M/N/O **完全并行**；先交付步骤 1~2（`AXHUB-01`，`full` 自动化、最稳定）与 `PTP-GUARD-02`，后交付步骤 5（`AXHUB-04`，采纳率最低 71%、唯一会致失败的步骤） |
| **Q** | 原型域集成测试与验收 | M + N + O + P | **本轮扩展**（impl-11 §9.1）：R9 主导；`PT-05` 失败回退用例（构造 GWT 完整率 0% 的 PRD，验证在步骤 1 后即被 `PTP-GUARD-02` 阻断）为**必测项** |
| **R**（原 impl-13 自称 `F`） | `knowledge` 企业知识库（6 标签页 · 22 卡片 · 18 节点 26 边手绘 SVG 力导向图 · 7 步流水线图 · 检索测试台） | A + impl-02 Agent 契约 + impl-04 表结构 | **本轮扩展**（impl-13 §11.3）：前端 10 / 后端 8 / 联调 4 = 22 人日；与 E 组可完全并行，唯一耦合点是 `sdlc.apitest.report_published` → `KA-05` → `KD-18` 的归档链路，建议在 P3 末期做一次端到端联调 |

> **⚠ 并行组编号冲突（本篇裁定，见 §12 待校对项 D-02）**：impl-10 §9.1 与 impl-13 §11.3 **都把自身的分组称为 `F`**，但两者的内容、前置与人日完全不同（impl-10 的 F = 管理域基底 12 人日、阻塞 G/H/I；impl-13 的 F = 知识与平台域 22 人日、不阻塞任何组）。本篇统一裁定：**`F` 归 impl-10 的管理域基底**（因其字母序接续 A~E 且是阻塞项），**impl-13 的知识与平台域改称 `R`**（接续 impl-11 的 L~Q）。impl-10 / impl-13 原文**未修改**，引用时需以本表为准。

B~E 四组在 A 完成后可完全并行（页面之间零 import，见 §2.1）；建议 4 名前端各领一组，或 2 名前端按 B+D / C+E 搭配。**（本轮扩展）** 追加 F~R 后的完整并行关系：

```
A（设计系统，阻塞全部）
├── B / C / D / E（v1.0 既有四组，A 后完全并行；E 组本轮追加 api-test）
├── F（管理域基底）──► G（project + people）
│                 ├──► H（team + req-pool）
│                 └──► I（release，另需 impl-04 补齐 G-03/G-04）
│       J（管理域 AI，与 G/H/I 完全并行，R7 独立推进）
│       K（管理域集成测试）◄── G + H + I + J
├── L（原型域基底 + AxHub 适配器）──► M（jobs + canvas）
│                                ├──► N（components + versions）
│                                └──► O（capability + 归档挂载，另需 impl-13 的 KB_STAGE_ARTIFACT_MAP）
│       P（Prompt 与降级 + 锚点回流，与 M/N/O 完全并行，R7 独立推进）
│       Q（原型域集成测试）◄── M + N + O + P
└── R（knowledge，与 E 组完全并行；耦合点 sdlc.apitest.report_published → KA-05 → KD-18）
```

**两条关键路径（本轮扩展后）**：

| 路径 | 链条 | 长度决定因素 |
|:---|:---|:---|
| 管理域 | `A → F → I → K` | `release` 页依赖 impl-04 补齐缺口 G-03（`release_order` 缺 `project_id`/`requirement_ids`/`version_id`）与 G-04（impl-04 无 `release_order` 表），是**唯一有跨文档外部前置**的页面（impl-10 §9.1） |
| 原型域 | `A → L → N → Q` | 批注-版本-导出闭环是最长链条，且 `Q` 的 4 格式导出保真用例依赖 `N`（impl-11 §9.1） |

### 7.2 本轮扩展工时（4 篇文档的真实数字，逐篇核实）

| 能力域 | 文档与章节 | 页面 / 工作项 | 前端人日 | 后端人日 | 联调（集成）人日 | 小计 | 人周 | 并行组 |
|:---|:---|:---|:--:|:--:|:--:|:--:|:--:|:--:|
| 管理类五域 | **impl-10 §9** | 5 页（`project`/`people`/`team`/`req-pool`/`release`）+ 管理域基底 + 管理域 AI 能力（7 项）+ 集成测试与验收 | **59** | **50** | **23** | **132** | 26.4 | **F~K** |
| AI 原型生成 | **impl-11 §9** | 1 页 5 标签（`prototype`）+ 原型域基底 + AxHub 集成适配器 + 7 步流水线 Prompt 与降级 + 批注锚点回流 + 知识库归档与门禁证据挂载 + 集成测试与验收 | **34** | **41** | **31** | **106** | 21.2 | **L~Q** |
| 接口自动化 | **impl-12 §9.3** | 1 页 6 标签（`api-test`，20 卡片 · 22 步链路图 SVG · 5 抽屉/弹窗） | **9** | **6** | **3** | **18** | 3.6 | **E** |
| 企业知识库 | **impl-13 §11.3** | 1 页 6 标签（`knowledge`，22 卡片 · 18 节点 26 边力导向图 · 7 步流水线图 · 检索测试台） | **10** | **8** | **4** | **22** | 4.4 | **R**（原文自称 `F`） |
| **本轮小计** | — | 8 个新页 + 4 个域的基底 / AI / 集成 / 测试 | **112** | **105** | **61** | **278** | **55.6** | — |

> **与任务口径的核对结论**：本轮任务书给出的 4 个数字（impl-10 **132 人日**、impl-11 **106 人日**、impl-12 **18 人日**、impl-13 **22 人日**）与四篇文档的工时章节**逐项一致**，无需修正。其中 impl-11 的第三列在原文中称「**集成**人日」（31），impl-10 / impl-12 / impl-13 称「**联调**人日」，本篇按同一列合并统计，并在表头标注「联调（集成）」。impl-11 §9 另指出：其集成人日占比 **29%**（31 ÷ 106），显著高于本篇 §7 既有 13 页的均值 **16%**（27 ÷ 173），原因是原型域涉及三方外部系统（AxHub Make、WeKnora、对象存储）与四种导出格式的保真验证。
>
> **impl-12 / impl-13 的细分行不重复计列**：两篇的工时表在首行给出总量后，另列「后端细分」与「AI 工程细分」行，原文均注明「**细分是对首行总量的拆解，不是追加**」，并给出加总校验（impl-12：后端 6 = 2+2+2 ✓、联调 3 = 1+1+1 ✓；impl-13：后端 8 = 2+2+2+2 ✓、联调 4 = 2+1+1 ✓）。本篇只取首行总量。impl-13 的「AI 工程细分」后端工作量注明「计入 impl-02，不重复计列」，故未纳入上表后端列。

### 7.3 合并总计与人力校验

| 范围 | 前端 | 后端 | 联调 / 集成 | 合计人日 | 人周（÷5） |
|:---|:--:|:--:|:--:|:--:|:--:|
| v1.0：13 页 + 基底（本篇 §7） | 95 | 51 | 27 | **173** | 34.6 |
| v1.1：本轮 4 个能力域（§7.2） | 112 | 105 | 61 | **278** | 55.6 |
| **合并总计（21 页 + 4 域）** | **207** | **156** | **88** | **451** | **90.2** |

**与 impl-09 §3.2 的量级校验**：impl-09 给出 P0~P3 累计约 **134.5 人周**（按 7 人并行 ≈ 19 周），其中 R4 前端在 P0~P3 共 **17 人周**（3 + 4 + 4 + 6）。本轮合并后的前端总量为 207 人日 ≈ **41.4 人周**，是 impl-09 R4 既有预算的 **2.4 倍**；后端 156 人日 ≈ 31.2 人周、联调 88 人日 ≈ 17.6 人周。三点结论：

1. **R4 前端需从「1-2 人」上调**：41.4 人周的前端工作量若仍按 impl-09 的 19 周窗口交付，需要 **≥ 2.2 名前端全职**；建议按 §7.1 的分组配置 4 名前端（B~E 各一组）+ 2 名前端（G/H）+ 2 名前端（M/N）分批投入。
2. **P4 不再是「按需」**：impl-10 的 132 人日全部落在 P4，impl-13 的治理与评测部分也在 P4，P4 已从 impl-09 §1.1 的「持续 / 按需并行」变成**工时最大的单一阶段**（≥ 26.4 人周）。详见 impl-00 §13.2 的修订建议。
3. **关键路径由 impl-04 的缺口补齐时点决定**：`A → F → I → K` 与 `A → L → N → Q` 两条路径中，只有 `I`（`release`）有跨文档外部前置（impl-04 需追加 `release_order` 与 `gate` 两张表）。若该补齐延后，管理域 5 页中的 1 页会脱期，其余 4 页与原型域、知识库域不受影响。

---

## 8. 可访问性与响应式

| 项 | 规则 |
|:---|:---|
| 设计基线 | **1440×900** 桌面端；侧边栏展开 **240px**、收起 **64px**（`style.css` 第 71~72 行 `--sidebar-w: 240px` / `--sidebar-w-collapsed: 64px`，本轮扩展订正：v1.0 记为 232px / 60px，与代码不符）；内容区 `--bg-page` + `padding: var(--sp-5)` |
| 横向滚动 | 仅允许出现在 `ac-table-wrap`、`ac-gantt-scroll`、`ac-board`、`ac-flow`、`ac-diff-body` 等显式滚动容器内；页面主体不得出现横向滚动条 |
| 窄屏降级 | `@media (max-width: 1180px)`：`ac-test-split` 由两栏转单栏、`ac-report-summary` 4 列转 2 列、`ac-report-head` 转单列；各页 `ac-grid-3/-4` 同步降列 |
| 键盘 | `Esc` 关闭抽屉与弹窗；树节点、修复方案卡等可点区域带 `role="button"` + `tabIndex={0}` + `Enter/Space` 处理；标签页用原生 `button` 保证 Tab 可达 |
| ARIA | 图标按钮必须有 `aria-label`（如「关闭」「仅看发布阻断」「启用 BN-01」）；弹窗带 `role="dialog"` + `aria-modal`；抽屉 `aria-hidden` 跟随开合 |
| 色彩 | 状态**不得只靠颜色**传达：`ac-tag` 同时有文案，`ac-tag-dot` 仅辅助；正文对比度 ≥ 4.5:1（`--text-1` on `--bg-card`） |
| 数字 | 所有数值列用 `ac-td-num` / `ac-tnum`（`font-variant-numeric: tabular-nums`）保证对齐 |
| 文案 | 禁止「占位」「TODO」「待补充」「Lorem」；空数据一律走 `ac-empty` 并给出下一步引导 |

### 8.1 本轮 8 个新页 + 3 个增强页的实测情况（本轮扩展）

| 项 | 实测结论 | 核实方式 |
|:---|:---|:---|
| **内联 SVG 图表无障碍** | 本轮 **8 个新页全部**为内联 SVG 图表根节点带 `role="img"` 与 `aria-label`（`project` / `people` / `prototype` / `release` / `req-pool` / `api-test` / `knowledge` / `team`）；全站命中 `role="img"` 的页面共 **15 个**（另含 `ai-observe` / `coding` / `design` / `insight` / `overview` / `pipeline` / `schedule`） | grep `role="img"` on `pages/*.tsx` |
| **`aria-label` 覆盖** | 全站 **18 / 21** 页命中；本轮 8 个新页**全部命中**。未命中的 3 页为 `BoardPage`、`IntegrationPage`、`RequirementPage`（均为 v1.0 既有页，登记为待补项 D-05） | grep `aria-label` on `pages/*.tsx` |
| **横向滚动只在显式容器** | 横向滚动仅出现在 `ac-table-wrap`（19 页命中）与页面独占的显式滚动容器内：`ac-gantt-scroll`（`schedule`）、`ac-board`（`board`）、`ac-flow`（6 页）、`ac-diff-body`（`coding`）、`ac-sch-*`/`ac-dg-*`/`ac-rp-*`/`ac-kb-*` 等页面级 `-scroll` 类。**页面主体（`.ac-content`）无横向滚动条** | grep `ac-table-wrap` + 各页 CSS 的 `overflow-x` |
| **栅格一律 `minmax(0,1fr)`** | 全部 21 个页面 CSS 的多列栅格均写作 `grid-template-columns: repeat(N, minmax(0, 1fr))` 或 `minmax(0, 1fr) minmax(0, Xfr)`，**无裸 `1fr`**；固定列用显式像素（如 `168px minmax(0, 1fr)`、`92px minmax(0, 1fr)`、`104px minmax(0, 1fr)`）。理由：裸 `1fr` 的 `min-width` 默认为 `auto`，宽表或长文本会把列撑破并外溢到页面主体 | grep `minmax\(0,\s*1fr\)` on `pages/*.css` |
| **根类 `min-width: 0`** | 每个页面的根类（`ac-pj`、`ac-pp`、`ac-tmg`、`ac-rp`、`ac-pt`、`ac-rl`、`ac-at`、`ac-kb`、`ac-ide` 等）以及所有作为 grid/flex 子项的容器均声明 `min-width: 0`，与 `minmax(0,1fr)` 配套，双重阻断溢出 | grep `min-width:\s*0` on `pages/*.css` |
| **窄屏断点** | 本轮 8 个新页各自声明断点：`project` / `people` / `api-test` / `knowledge` = `1180px`；`team` / `req-pool` = `1180px` + `768px`；`prototype` / `release` = `1280px` + `900px`。全站另有 `style.css` 的 `1440px` / `1180px` / `768px` 三档与 `design.css` / `requirement.css` / `schedule.css` 的 `1280px` / `1360px` / `1000px` | grep `@media (max-width:` on `pages/*.css` 与 `style.css` |
| **数字列对齐** | 本轮新页的全部数值列（健康分、预算、负载率、评分、耗时、成本、切片数、命中率）均用 `ac-td-num`（`font-variant-numeric: tabular-nums`）；SVG 图内数值用 `text-anchor` 显式对齐 | 页面代码抽查 |
| **空态** | 18 / 21 页使用 `ac-empty`；本轮 8 个新页**全部使用**（筛选无结果、数据未就绪、追溯断链三种场景）。未命中的 3 页为 `insight`、`ai-observe`、`pipeline` | grep `ac-empty` |
| **色彩不单独承载语义** | 本轮新页的状态一律「色 + 文案」双通道：热力网格单元格带 `title` 与数值、力导向图的未核验边为**虚线**（不只靠颜色）、漏斗各段带阶段名与计数、四象限散点带项目名标签 | 页面代码抽查 |
| **键盘可达** | 标签页一律原生 `<button>`（`ac-tabs` 20 页命中）；抽屉与弹窗支持 `Esc` + 遮罩关闭（21 页全部导入 `Drawer` / `Modal`）；力导向图节点、热力网格单元格、组织树节点等可点区域带 `role="button"` + `tabIndex={0}` + `Enter`/`Space` 处理 | grep `from '../components/(Drawer\|Modal)'` = 21 页 |
| **文案红线** | 本轮 8 个新页与 3 个增强页**无**「占位 / TODO / 待补充 / Lorem / TBD」字样；不确定处一律以「实测 / 实测值 / 口径说明」显式披露（如 `prototype` 页把 `autoRatePct` 的口径限制与收益上限写在数字旁边） | grep 全量扫描 |

---

## 9. 验收清单（可执行判定）

- [ ] **21** 个 pageId 全部可经 `#page=<id>` 直达，刷新后仍定位正确；非法 pageId 回落 `overview`（本轮扩展：13 → 21）。
- [ ] 侧边栏 **7** 分组可展开/收起，当前项高亮且带主色左边框；面包屑三级正确（平台 > 分组 > 页面）（本轮扩展：6 → 7）。
- [ ] 总览六环节流程条点击后跳转到对应 pageId，在制品数与 `board` 列计数一致。
- [ ] 跨页数据一致：同一 `TASK-24xx` 在 board / schedule / coding / test / bug / integration 中的 id、标题、状态、负责人完全一致。
- [ ] 关键交互全部可用：Brainstorm 流式生成、Diff 逐块接受、门禁未过时禁用发布并给出缺失原因、AI 分析「采纳建议并指派」触发状态流转 + 追加通知记录、死信人工重放、脱敏与出网开关切换。
- [ ] `npm run typecheck` 对 `ai-sdlc-console` 目录 0 错误；`vite build`（`ENTRY_KEY=prototypes/ai-sdlc-console`）exit 0。
- [ ] 1440×900 下 **21** 页均无页面级横向滚动条、无内容溢出、无空占位文案（本轮扩展：13 → 21）。
- [ ] 每页 **4~13** 个 `data-annotation-id`（本轮扩展订正：v1.0 记为「2~8 个」，实测 21 页区间为 4~13，逐页明细见 §11.2），全站去重后 **171** 个，且在 `annotation-source.json` 的 `nodes` 与 `markdownMap` 中均有对应条目。
- [ ] 前端所有写操作对应的服务端接口在 impl-01 §4 中存在；订阅主题均在 impl-01 §3.2 / impl-03 §6 已声明（**本轮扩展**：impl-10 §4.1 的 33 个 `E-*`、impl-11 §5.5 的 16 个 `P-*`、impl-12 §7.3 的 8 个 `sdlc.apitest.*`、impl-13 §9.3 的 10 个 `sdlc.kb.*` 需**补登记进 impl-01 §3.2** 后本项方可判定通过，见 §12 待校对项 D-03）。

### 9.1 本轮 8 个新页的追加验收项（可勾选判定）

**通用（8 页共用）**

- [ ] 8 个新页各自首屏的 `ac-page-desc` 中**显式披露**与既有页面的分工边界（如 `req-pool` 披露「需求池的横向全生命周期治理 vs `requirement` 的单条需求纵向深度作业」、`release` 披露「版本规划与范围冻结 vs `pipeline` 的单次发布执行」、`api-test` 披露与 `test` 页的分工），不做隐式约定（impl-10 §1.5）。
- [ ] 8 个新页的**全部数据来自 4 个数据模块的只读常量**，页面无任何对数据模块的写回；所有「已采纳 / 已发布 / 已冻结」状态刷新页面后复位（§5.7 硬约束）。
- [ ] 8 个新页的每条 AI 产出都同时具备「采纳」与「驳回」两个动作，且采纳后有可见落地痕迹（§4.2 规则 7）。
- [ ] 8 个新页的内联 SVG 图表根节点均带 `role="img"` + `aria-label`（§8.1）。
- [ ] 8 个新页各 9 个 `data-annotation-id`，命名符合 `ai-sdlc-<pageId>-<block>`，与 `annotation-source.json` 的 `nodes[].id` / `locator.selectors` / `markdownMap` 三处一一对应（§11）。

**`project` 项目管理**

- [ ] 5 个标签页（项目组合 / 当前项目 / 里程碑 / 干系人 / 风险与 AI 周报）均可切换，`ac-tab-count` 与实际行数一致。
- [ ] `PROJECTS` 6 个项目中 `PRJ-01`（订单中心重构，`code='ORD-REF-2026'`）的 `isCurrent=true`，且其 `milestoneIds` 中 `gateId='G3'` 的里程碑与 `GATES[G3].status='failed'` **同源一致**（impl-10 §1.5 边界三）。
- [ ] `PROJECT_MILESTONES` 12 条（`MS-01`~`MS-12`）中 `PRJ-01` 占 6 条，`gateId` 依次为 `G1`~`G6`。
- [ ] `STAKEHOLDERS` 的 RACI 全表**唯一 A**（`SH-07` 集团数字化负责人），矩阵渲染不出现两个 `A`。
- [ ] `PROJECT_RISKS` 的 `score = 概率值 × 影响值`（`low=1 / medium=3 / high=5`，取值 1~25），5×5 热力矩阵的每格计数与散点清单可对账。
- [ ] AI 周报的四个动作（采纳并发布到飞书 / 重新生成 / 编辑后发布 / 驳回）与 `MGMT-12` 的四个 `decision` 一一对应；驳回理由回流为 `ag-ba` 负样本的说明可见。
- [ ] `budget*` / `spent*` 为 L3 受限字段：`architect` / `product` / `ops` 视图下该列被**整体剔除**（不是掩码、不是 0 值），响应头附 `X-Redacted-Fields`（impl-10 §8.1）。

**`people` 人员管理**

- [ ] 5 个标签页可切换；15 列成员表支持筛选 + 搜索 + 排序，档案抽屉可打开。
- [ ] 技能热力网格为 **9 人 × 14 技能 = 126 格**，单元格抽屉展示 `lastUsedAt` / `aiAssistRatePct` / `certified` 三项证据。
- [ ] `u-yan` 的反差案例可见：负载 38.5%（低）但为唯一 `SK-07` / `SK-08` level 5 持有人（单点依赖），AI 技能洞察能识别该组合。
- [ ] AI 产能再平衡建议 `RB-01`~`RB-03` 的评分口径与 `BugPage.scoreAssignee()` **同源**；因 `ASSIGN_WEIGHTS` 合计为 **90** 而非注释所写的 100（impl-10 §2.9 缺口 G-09），匹配度按 `score / 90 × 100` 归一展示，页面不出现「匹配度 100%」不可达文案。
- [ ] `monthly_cost_wan` / `defect_escape_count_30d` / `overtime_hours_month` / `ai_reject_reasons` 四个 L3 字段对非授权角色不可见；`developer` 视图下 `basis` 中的「近 30 日加班 41h」被替换为「当前在制品数偏高」（impl-10 §8.2）。

**`team` 团队管理**

- [ ] 4 个标签页可切换；手绘 SVG 组织架构树为**两层**（技术中心 → 7 个一级团队），因 `TEAMS` 7 条的 `parentTeamId` 均为 `null`（impl-10 §2.9 缺口 G-06），页面**不得**假装存在第三层。
- [ ] `team.headcount` 之和 = **9**；`owned_component_ids` 并集 = **14** 个组件且无重复持有（impl-10 §10.1 合计对账 ②③）。
- [ ] `team_metric_snapshot` 同 `sprint_id` 下 `committed_points` 之和 = `SPRINTS.committed`、`velocity_points` 之和 = `SPRINTS.completed`（`SP-22` 88/88、`SP-23` 92/89、`SP-24` 96/65）。
- [ ] 协作关系图为 **7 节点 8 有向边**；阻塞治理看板的 `BLOCK-0312` 等待 **96.5 h vs SLA 48 h = 201%** 可复算。
- [ ] AI 协作优化建议的「转派」动作需目标团队 leader 二次确认，未确认前不写覆盖层。

**`req-pool` 需求管理**

- [ ] 5 个标签页可切换；需求池表为 **15 列 × 20 条**（`REQ_POOL` 20 条）。
- [ ] 8 阶段状态机的 8 个原子值（`收集` / `评估中` / `已评分` / `待排期` / `已入迭代` / `已交付` / `已拒绝` / `已挂起`）在阶段流中全部出现，且漏斗 6 阶段的 `count` 为 **20 / 18 / 16 / 11 / 9 / 1**（impl-10 §10.1 合计对账 ⑧）。
- [ ] 已入迭代的 **8 条**与 `REQ-2401`~`REQ-2408` 一一对应（经 `REQ_POOL_ID_BY_REQUIREMENT` 反查），追溯链路图「池 → 需求 → 故事 → 任务 → 缺陷 → 发布单」的最后一跳若因缺口 G-03 断链，必须以**断链标记**呈现而非静默省略。
- [ ] AI 优先级评分的三种口径（`standard` / `promo` / `compliance`）切换为**试算不落库**；以 `standard` 口径对全池 20 条重算，结果与 `REQ_POOL[].aiPriorityScore` **逐条相等**。
- [ ] 复选框仅对非 `已入迭代` / `已交付` / `已拒绝` 条目可用；批量入迭代超容量时 `ac-hint--danger` 提示且按钮禁用。
- [ ] `req_review_round` 每条目末轮 `score_after` = `req_pool_item.ai_priority_score`（impl-10 §10.1 合计对账 ⑤）。

**`prototype` AI 原型工坊**

- [ ] 5 个标签页可切换；15 列任务表的 5 个任务覆盖 `exported` / `generating` / `reviewing` / `approved` / `failed` **五种状态各一条**（`PT-01`~`PT-05`）。
- [ ] 可回放的 7 步生成进度按 `STEP_WEIGHTS = [8,12,30,18,14,12,6]`（合计 **100**）渲染加权进度条与累计贡献；暂停 / 继续按钮在 `!sim.running` 时禁用。
- [ ] `PT-05` 的失败必须归因到**步骤 5「交互流与状态机」**（`PTS-33.status='failed'`），并展示 `PTP-GUARD-01`~`06` 六道守卫把检出点前移可节省 **1,610 s** 与 **5.18**（美元）成本的说明（impl-11 §3.8）。
- [ ] `PROTOTYPE_COMPONENTS` 18 个组件的 `source` 分布为 `axhub-lib` **15** / `custom` **1** / `ai-generated` **2**；页面**不得**沿用 `PTS-04.outputSummary` 与 `EXPORT_META` 中「14 个可复用 / 4 个 AI 派生」的旧措辞（impl-11 §10.3 I-06）。
- [ ] 4 格式导出的能力矩阵如实披露：`make` / `html` 的 `withComments=true` 且 `withInteractions=true`；`figma` / `sketch` 两者均为 `false`；只有 `make` 与 `html` 可独立作为 G1 门禁证据（`PTP-GUARD-06`）。
- [ ] 收益测算区必须同时显示口径说明「节省人时不含返工与复核成本，属**上限口径**」，且 `AIF-04` 的 3.5 h 标注为未实现收益（`lastRunStatus='failed'`）。
- [ ] 9 个 `data-annotation-id` 与 impl-11 §7.1 末尾列出的清单逐字一致。

**`release` 版本管理**

- [ ] 5 个标签页可切换；版本表 15 列、基线表 14 列、变更集表 15 列、日历项表 12 列。
- [ ] 版本 6 状态机（`规划中` / `开发中` / `已冻结` / `灰度中` / `已发布` / `已回滚`）全部出现；`changeType` 5 值（`新增` / `变更` / `修复` / `移除` / `配置`）、`eventType` 7 类全部有实例。
- [ ] **冻结预检 Modal**：`canFreeze=false` 时按钮文案为「冻结预检」而非「冻结基线」，提示「门禁未通过，仅可查看预检结论，无法确认冻结」；`MGMT-38` 响应**不走缓存**（改 `GATES[G3].status` 后立即重开 Modal，结论随之变化）。
- [ ] `VB-04.commitSha='f19d6c0'` 与 `REL-2403.version='order-api:2421-f19d6c0（待构建）'` 的构建号一致（impl-10 §1.5 边界二）。
- [ ] `VERSION_ID_BY_RELEASE` 反查链路可用；`product_version` 的 8 需求 / 24 任务 / 12 缺陷**有且仅有一个归属**（impl-10 §10.1 合计对账 ④）。
- [ ] AI 发布窗口推荐中**封网期命中项不可采纳**；`RELEASE_CALENDAR` 的冲突治理区展示 `CFG-A` / `CFG-B` 两组。

**`api-test` 接口自动化测试**

- [ ] 6 个标签页的 `ac-tab-count` 依次为 **16 / 5 / 12（8+4）/ 8 / 8 / 6**，与 `API_CASES` 16 条、`API_SCENARIOS` 5 条、`MOCK_RULES` 8 条 + `DATA_SETS` 4 条、`API_TEST_RUNS` 8 条、报告 8 项 summary、`HFX-01`~`HFX-06` 6 条能力逐一对应。
- [ ] 契约覆盖度条为 **14 格**（`API-01`~`API-14`），实色 = 已建例、虚线灰 = 未建例；`AC-16` 因 `API-14` 为 `draft` 而处于 `draft` 态，页面文案「草稿态：验收标准未冻结，`ag-test` 只能产出 draft 用例且不参与门禁判定」可见。
- [ ] 场景链路图为 **22 步**（`ASS-01`~`ASS-22`），按 6 种 `stepType` 用手绘 SVG 形状区分；断言质量分析统计 **52 条**断言。
- [ ] 「签发报告」按钮在 `gateImpact.pass=false` 时禁用并给出 **4 项**缺失原因；报告签发权在 `tester`（impl-08 §6.2 `tester.approve = 测试报告`），AI 只出草稿。
- [ ] flaky 治理区「采纳诊断」的语义为 duration 断言 `onFail` 由 `fail` 改 `retry`，采纳后写入覆盖层。
- [ ] `MK-06` 的 `dynamic-ai` Mock 在 `EGRESS-DENY` 档下**必须走 `mdl-local`**，页面给出该因果说明（impl-12 §8.5）。
- [ ] 9 个 `data-annotation-id` 与 impl-12 §9.1 列出的清单逐字一致。

**`knowledge` 企业知识库**

- [ ] 6 个标签页的 `ac-tab-count` 依次为 **6 / 18 / 20 / 18 / 14 / 6**，与总览 6 卡、`KB_STAGE_ARTIFACT_MAP` 18 条、`KB_DOCS` 20 篇、图谱 18 节点、`KB_RETRIEVAL_LOGS` 14 条、`KB_GOVERNANCE` 6 条逐一对应。
- [ ] WeKnora 引擎信息卡按 3 组 `<dl>` 渲染 **19 行键值**（7 + 6 + 6）；`version` 一律显示 **`1.4.2`**（不显示 `'WeKnora 1.4.2'`，impl-13 §1.2 裁定）。
- [ ] 归档覆盖率显示 **88.9%**（16 ÷ 18），6 环节的分子分母为 3/3、3/3、3/3、3/3、2/3、2/3；2 项未归档给出真实原因（`REL-2403` 被 G3 与 `BLOCK-0312` 双重阻塞；技术债清单草稿态被 `KA-08` 判 `skip`）。
- [ ] 知识图谱为 **18 节点 26 边**；`verified=false` 的 **8 条**边渲染为**虚线**，`graphStats.verifiedPct = 18 ÷ 26 = 69.2%`（**页面以实测为准**，不采信 `WK-06.metrics` 声称的 91.7% / 83.3%，impl-13 §1.2 警示框）；`Σ degree = 52 = 26 × 2` 可对账。
- [ ] 幻觉率对比显示 **12.04% → 2.50%（−79.3%）**，且加权公式与「用展示值反算会得到 79.2%」的精度陷阱说明可见（impl-13 §7.2）。
- [ ] 检索测试台的 `scoreThreshold` 为 **0.72**（14 条日志一致）；唯一低于阈值实例 `KR-13`（0.61）可复现；`avgRetrievalMs = 3752 ÷ 14 = 268` 可复算。
- [ ] `KB_DOCS` 20 篇中 **11 篇**承接自既有 `ragEntries`（`legacyRagId` = `rag-01`~`rag-11`），`chunks` / `tokensK` / `hitCount30d` 三列与 `data.ts` **全等**；衔接说明显示 `legacyDocs.length = 11`。
- [ ] 保鲜告警区：`staleDocCount=2`（`KD-07`、`KD-08`），逐篇「刷新复核」全部处理完后主按钮禁用；`KD-07`/`KD-08` 的 `isStale` 与 `embedStatus` 不一致时页面**不得**互相推导（impl-13 §10.5）。
- [ ] 入库执行记录 8 条中 `KI-07` 的失败步骤（`KIS-03`）与 `KI-08` 的合批重放链路可见；`ingestSuccessRatePct = (5+1) ÷ 7 = 85.7%` 的算法写明（`partial` 计入分子）。
- [ ] 9 个 `data-annotation-id` 与 impl-13 §11.1 列出的清单逐字一致。

### 9.2 本轮 3 个增强页的追加验收项

**`schedule` 排期甘特（锚点 9 → 13）**

- [ ] `AI_SCHEDULE_SUGGESTIONS` **8 条**（`SCH-01`~`SCH-08`）以 16 列表呈现，逐条含建议类型、影响面、约束校验结果与采纳动作。
- [ ] AI 冲突消解看板与 `GANTT_CONFLICTS` **6 条**（`GANTT-CF-01`~`GANTT-CF-06`）真实关联，其中 **4 条**被 `accepted` / `auto-applied` 的建议消解，消解前后状态可视化对照。
- [ ] 一键 AI 自动排期的可回放流程基于 `AIF-06`（`cron.sprint.planning.0730`、8 步、`autoRatePct=84`、`avgEndToEndMin=56`），逐步展示 `executor` 与 `fallbackAction`，人工检查点「人工决策高影响建议」高亮。
- [ ] **约束校验不通过时「采纳」按钮禁用**：`SCH-02`、`SCH-03` 为真实禁用样例，`title` 与 `ac-hint--danger` 均给出阻塞项明细（`blockers.length > 0`）。

**`design` 架构设计与任务拆解（锚点 8 → 12）**

- [ ] `AI_EFFORT_ESTIMATES` **12 条**（`EST-01`~`EST-12`）以 16 列表呈现；特征权重贡献瀑布图的各段之和等于总预估；人工 vs AI 对照图的双序列可切换。
- [ ] 误差收敛折线展示 ensemble 口径 **28.8% → 9.0%**，并可在 `EFFORT_ACCURACY_TREND_ENSEMBLE` / `_CODE_SIZE` / `_COMPLEXITY` 三条序列间切换。
- [ ] `AI_BREAKDOWN_SUGGESTIONS` **6 条**（`BRK-01`~`BRK-06`）以 DAG 图呈现，支持逐条采纳与部分采纳；9 项拆解质量自检逐项给出通过/未通过。
- [ ] **置信度 < 70% 且单一风险因子权重 ≥ 50% 时「采纳」禁用**：`EST-04` / `EST-06` / `EST-12` 为真实禁用样例；勾选「已知悉风险」（`riskAck`）后方可解禁，解禁动作留痕。
- [ ] 既有「三点估算」与「AI 再拆解」的原有交互（内联编辑负责人与工时、`expectedVersion` 冲突返回 `SDLC-TASK-409`、子任务展开、底部总工时与建议并行度汇总、批量同步预览弹窗）**全部保留可用**。

**`coding` AI 编码协作（锚点 7 → 11）**

- [ ] 「本地 IDE 同步」区呈现 `IDE_SYNC_SESSIONS` **10 条**（`IDE-01`~`IDE-10`）16 列表 + `IDE_SYNC_EVENTS` **24 条**（`IDES-01`~`IDES-24`）事件流 + 时序泳道图 + `IDE_PLUGINS` 双端插件卡（`IDE-PLG-VSC` / `IDE-PLG-JB`）。
- [ ] **出网管控因果可见**：`egressMode='DENY'` 的 **2 条**会话显示为强制走 `mdl-local`；`'MASK'` 的 **7 条**显示为走外部模型但先按 `redactRules` 脱敏；两类会话的模型列与脱敏标记不得混淆。
- [ ] **G3 门禁联动**：G3 当前 `failed`，「触发部署（G3 联动）」按钮禁用，并在 `ac-hint--danger` 中**逐条**列出禁用原因（门禁未通过 / 产物缺口 / 待补传 / 出网被拒四类）。
- [ ] `IDE-09` 的 `pluginVersion='1.7.9'`（其余 9 条为 `1.8.2`）被标为**版本漂移**，与 impl-06 的插件版本治理口径一致。
- [ ] 既有交互（AI 会话流、上下文切片脱敏标记、并排 Diff 逐块接受、本地执行结果驱动 `dev → testGreen`、仅测试全绿时可触发部署）**全部保留可用**。

---

## 10. 附录：页面 ↔ Agent ↔ 门禁 ↔ 通知 对照表

| pageId | 涉及 Agent（impl-02） | 相关门禁 | 通知规则 | 任务/缺陷状态（impl-03） |
|:---|:---|:---|:---|:---|
| `overview` | 全部（汇总） | G1~G6 健康色 | — | 10 态在制品汇总 |
| `requirement` | `ag-pm` 需求澄清 Agent | G1 需求就绪 | — | `backlog → refined` |
| `design` | `ag-arch` 架构设计 Agent | G2 契约冻结 | — | `refined → taskCreated` |
| `board` | `ag-code`、`ag-review` | — | — | 10 态全量 |
| `schedule` | `ag-arch`（估算复核） | — | 排期冲突告警 | `taskCreated → dev` |
| `coding` | `ag-code` 编码实现 Agent、`ag-review` 代码评审 Agent | G3 单测覆盖率 ≥ 85% | — | `dev → testGreen → committed` |
| `pipeline` | `ag-ops` 部署运维 Agent | G3、G4、G5 | `DN-01`~`DN-0x` 部署通知 | `committed → deployed` |
| `test` | `ag-test` 测试生成 Agent | G4 测试准出 | — | `deployed → qa` |
| `bug` | `ag-review`（根因）、`ag-ba` 可观测分析 Agent | G4 阻塞项 | `BN-01`~`BN-09` | 缺陷 6 态；任务 `qa → bugfix → released` |
| `insight` | `ag-ba` | — | — | — |
| `integration` | — | — | 同步失败告警 | — |
| `ai-observe` | 全部 7 个（调用链） | — | 模型降级 / 熔断告警 | — |
| `settings` | — | — | 安全告警 | — |
| `project` | `ag-ba` 可观测分析 Agent（项目风险预测 / AI 项目周报 / 里程碑延期预测，均 `mdl-gpt5` → fallback `mdl-claude`，impl-10 §5.8） | G1~G6 健康度（`PRJ-01.milestoneIds` 的 `gateId` 依次 G1~G6；`MS-03.gateId='G3'` 与 `GATES[G3].status='failed'` 同源） | `E-02` 健康度跨档、`E-03`/`E-04`/`E-05` 周报生成/发布/驳回、`E-06` 里程碑滑移、`E-07` 基线调整签核、`E-08` 里程碑完成、`E-09` 干系人变更、`E-10`/`E-11` 风险登记与状态迁移；周报发布走飞书卡片 | 治理层，不直接迁移任务态；里程碑改期走 `MGMT-05`（`baseline_version + 1`） |
| `people` | `ag-ba`（产能再平衡：**归因由 `ag-ba`、求解由规则引擎**，`mdl-deepseek` → fallback `mdl-gpt5`；AI 技能洞察） | — | `E-12` 成员档案变更、`E-13` 证书临期（`valid_until` 距今 ≤ 90 天，每日 08:00 扫描）、`E-14` 负载超载（`load_pct > 100` 首次或跨 150% 档）、`E-15` 再平衡采纳 | `sdlc.task.*` 复用：`MGMT-18` 采纳后走 `PUT /tasks/{id}` 改负责人 |
| `team` | `ag-ba`（团队诊断 / 协作优化 / 仪式议程与纪要，`mdl-qwen` → fallback `mdl-claude`，`rr-06` 中文文档） | — | `E-16` 团队效能快照、`E-17` 协作阻塞（`blocked_count` 增加或 `avg_wait_hours > sla_hours`）、`E-18` 仪式纪要生成、`E-14` 团队负载汇总 | — |
| `req-pool` | `ag-pm` 需求澄清 Agent（需求优先级评分 / 评审会前预读，`mdl-claude` → fallback `mdl-qwen`，`rr-01`；**LLM 不算分，分数由触发器按公式算**） | —（入迭代后由 G1 需求就绪承接） | `E-19` 入池、`E-20` 评分产出/重算、`E-21` 8 阶段迁移、`E-22` 批量入迭代、`E-23` 拒绝（理由回流提出人）、`E-24` 评审轮次登记、`E-25` 断链检出 | **需求池 8 阶段状态机**（`收集` → `评估中` → `已评分` → `待排期` → `已入迭代` → `已交付` / `已拒绝` / `已挂起`）；入迭代后衔接任务 `backlog → refined` |
| `prototype` | `ag-pm` 需求澄清 Agent（主）+ `ag-arch` 架构设计 Agent（步骤 3 页面结构与组件映射） | **G1 需求就绪** + **G2 契约冻结**（原型基线 `PTV-05` 与 9 条批注处理记录为证据；`PTP-GUARD-06` 限定只有 `make` / `html` 可独立作 G1 证据，`figma` / `sketch` 必须与之同时挂载） | `P-06` 任务完成、`P-07` 任务失败、`P-11` 批注闭环（携带 `gateEvidenceUpdated`）、`P-13` 版本基线锁定（`gate.result`，G1 证据更新）、`P-15` 回退需求澄清（携带 3 类缺失分支作为 Brainstorm 追问种子）、`P-16` AxHub 连接状态或组件库版本漂移 | `st-req → st-arch`；生成失败时 `backToStage='st-req'` 回退 |
| `release` | `ag-arch` 架构设计 Agent（版本范围建议 / 兼容性评估，`mdl-gpt5`，`rr-02`）+ `ag-ops` 部署运维 Agent（发布窗口推荐，`mdl-gpt5`，`rr-07`） | G1 / G2 证据齐备方可冻结基线（`sdlc.version.baseline_frozen`）；`sdlc.gate.*` 驱动**冻结禁用态**（`canFreeze`） | `E-26` AI 版本范围建议、`E-27` 版本 6 状态迁移、`E-28` 基线冻结、`E-29` 变更集登记、`E-30` 变更集高风险（`risk_level='high'` 或 `breaking_api=true`）、`E-31` 日历冲突检出（含封网期命中）、`E-32` 冲突消解审批、`E-33` AI 发布窗口推荐 | **版本 6 状态机**（`规划中` → `开发中` → `已冻结` → `灰度中` → `已发布` / `已回滚`）；`已冻结 → 灰度中` 由 `sdlc.pipeline.*` 驱动 |
| `api-test` | `ag-test` 测试生成 Agent（主，`HFX-01`/`02`/`03`/`04`/`06`）+ `ag-ops` 部署运维 Agent（`HFX-05` CI 集成与门禁联动，唯一由 `ag-ops` 主责的能力）+ `ag-review` 代码评审 Agent | **G3 / G4 / G5 / G6**（`gateImpact.pass=false` 时「签发报告」禁用；报告签发权在 `tester`，对应 impl-08 §6.2 `tester.approve = 测试报告`） | `sdlc.apitest.case_generated`、`scenario_triggered`、`run_started`、`run_completed`、`run_failed`、`report_published`、`mock_hit`（**按 `(ruleId, 分钟)` 聚合发布**）、`bug_created_from_test`（**先于** `sdlc.bug.created`） | `deployed → qa`；执行失败自动开单后走 impl-03 的缺陷 6 态，并经 `external_id_map` 回写 PingCode |
| `knowledge` | **全 7 个 Agent** 消费检索（`ag-pm` / `ag-arch` / `ag-code` / `ag-review` / `ag-test` / `ag-ops` / `ag-ba`，各一条 `KB_CONSUME_STATS`）；归档链路由 `ag-ba` 观测 | **G1 / G2 / G6**（`sdlc.gate.passed:G1/G2/G6` 驱动归档覆盖率 88.9%）；`staleDocPct` 纳入 **G6 观测门禁**的观测项（目标 ≤ 5%，当前 10.0%） | `sdlc.kb.doc_archived`、`ingest_started`、`doc_indexed`、`ingest_completed`、`ingest_failed`（转死信 `q:kb:dead`）、`graph_updated`、`doc_stale`（每日 06:00 保鲜巡检）、`retrieval_logged`（**按 `(callerId, 小时)` 聚合发布**）、`eval_completed`（每周三 22:00）、`conflict_detected`（相似度 > 0.92 且结论相左，`kb-gov-06`） | —（横向基础设施）；入站消费 impl-13 §2.4 的 **13 个归档触发主题**，把 SDLC 六环节 18 项产物写入 `kb_doc` |

> 门禁编号 G1~G6、Agent id 与名称、通知规则 id 均以 impl-02 / impl-03 / `data.ts` 为准，本篇不自定义。
>
> **（本轮扩展）追加 8 行的来源**：`project` / `people` / `team` / `req-pool` / `release` 五行的 Agent 与模型取值逐字取自 impl-10 §5.8「AI 能力参数与降级总表」，事件编号取自 impl-10 §4.1（`E-01`~`E-33`）；`prototype` 行取自 impl-11 §5.5（`P-01`~`P-16`）与 §7.4（门禁证据资格）；`api-test` 行取自 impl-12 §2.2（`HFX-01`~`HFX-06` 的主责 Agent）与 §7.3（8 个主题）；`knowledge` 行取自 impl-13 §7.1（7 个 Agent 消费统计）、§9.3（10 个主题）与 §11.5 R-01（`staleDocPct` 纳入 G6）。
>
> **两条跨页因果链（本轮新增，值得单独记住）**：
>
> 1. `api-test` → `knowledge`：报告签发（`tester` 批准）→ `sdlc.apitest.report_published` → 归档规则 `KA-05` 命中 → 落入知识空间 `KS-04` → 生成文档 `KD-18` 的新版本切片 → `ag-test` 下次生成用例时可检索到（impl-12 关联文档表、impl-13 关联文档表）。
> 2. `requirement` → `prototype` → `requirement`：PRD 基线冻结 → `sdlc.prd.baselined` → `AIF-01` 步骤 1 触发原型生成；若步骤 5「交互流与状态机」产出空图或 `PTP-GUARD-02` 命中 → `sdlc.prototype.clarify_requested`（`P-15`）→ `requirement` 页的 Brainstorm 区自动新开一轮会话，首条 `ag-pm` 消息即「上一轮原型生成失败，需补齐以下验收标准：…」（impl-11 §8.2）。`PT-05` 就是这条回退链的真实案例。

---

## 11. 批注锚点体系（本轮扩展）

本原型自身就使用 AxHub Make 的批注机制，因此其 wire format 可被逐字描述（完整规范见 impl-11 §7.1，本节只记控制台侧的实现事实）。

### 11.1 规模与三处一致性

| 项 | v1.0 | v1.1（本轮扩展） | 核实方式 |
|:---|:---:|:---:|:---|
| 页面数 | 13 | **21** | `index.tsx` 的 `route` 数组 |
| `data-annotation-id` 锚点数（去重） | 87 | **171** | `pages/*.tsx` 按属性字面值去重 |
| 锚点原始出现次数 | — | 172 | 其中 `ai-sdlc-coding-session-flow` 在 `CodingPage.tsx` 出现 **2 次**（两处条件渲染分支各一次），去重后为 1 |
| 每页锚点数区间 | 2 ~ 8（v1.0 记法） | **4 ~ 13** | 见 §11.2 逐页明细 |
| `annotation-source.json` 的 `data.nodes[]` | — | **171** | 与页面锚点数**逐页全等**（见 §11.2） |
| `annotation-source.json` 的 `markdownMap` 键数 | — | **171** | 与 `nodes[]` 一一对应，无孤儿 |
| 目录节点：`folder` / `route` / `markdown` / `link` | 3 / 13 / 10 / 4 | **3 / 21 / 14 / 4** | 递归统计 `directory.nodes` |

**三处一致性约束（可执行判定）**：`pages/*.tsx` 的 171 个去重锚点 = `annotation-source.json` 的 `data.nodes[].id` 171 个 = `markdownMap` 的 171 个键；且 `nodes[].pageId` 的逐页分布与页面实测**逐页全等**。任一不等即为缺陷。

### 11.2 逐页锚点明细（21 页，实测）

按 `index.tsx` 的 `route` 顺序排列：

| # | pageId | 组件文件 | 锚点数 | 本轮变化 |
|:--:|:---|:---|:--:|:---|
| 1 | `overview` | `OverviewPage.tsx` | 4 | 不变 |
| 2 | `project` | `ProjectPage.tsx` | **9** | **新页 +9** |
| 3 | `people` | `PeoplePage.tsx` | **9** | **新页 +9** |
| 4 | `team` | `TeamPage.tsx` | **9** | **新页 +9** |
| 5 | `req-pool` | `ReqPoolPage.tsx` | **9** | **新页 +9** |
| 6 | `requirement` | `RequirementPage.tsx` | 4 | 不变 |
| 7 | `prototype` | `PrototypePage.tsx` | **9** | **新页 +9** |
| 8 | `design` | `DesignPage.tsx` | **12** | 8 → 12（**+4**，AI 工时预估 + AI 再拆解） |
| 9 | `board` | `BoardPage.tsx` | 4 | 不变 |
| 10 | `schedule` | `SchedulePage.tsx` | **13** | 9 → 13（**+4**，AI 排期建议 + 冲突消解 + 可回放流程）；**全站最多** |
| 11 | `coding` | `CodingPage.tsx` | **11** | 7 → 11（**+4**，本地 IDE 同步区）；原始出现 12 次，`ai-sdlc-coding-session-flow` 重复 1 次 |
| 12 | `release` | `ReleasePage.tsx` | **9** | **新页 +9** |
| 13 | `pipeline` | `PipelinePage.tsx` | 12 | 不变 |
| 14 | `test` | `TestPage.tsx` | 8 | 不变 |
| 15 | `api-test` | `ApiTestPage.tsx` | **9** | **新页 +9** |
| 16 | `bug` | `BugPage.tsx` | 8 | 不变 |
| 17 | `insight` | `InsightPage.tsx` | 5 | 不变 |
| 18 | `knowledge` | `KnowledgePage.tsx` | **9** | **新页 +9** |
| 19 | `integration` | `IntegrationPage.tsx` | 5 | 不变 |
| 20 | `ai-observe` | `AiObservePage.tsx` | 6 | 不变 |
| 21 | `settings` | `SettingsPage.tsx` | 7 | 不变 |
| — | **合计** | 21 个页面组件 | **171** | 87 → 171（**+84** = 8 新页 × 9 = 72，加 `schedule`/`design`/`coding` 各 +4 = 12） |

**分布特征**：8 个新页**一律 9 个**（1 个页面根节点 + 8 个区块），是本轮的统一约定；3 个增强页各 **+4**；既有 10 页保持不变。最少的 3 页为 `overview` / `requirement` / `board`（各 4 个），最多的为 `schedule`（13 个）。**实测区间 4 ~ 13**，v1.0 的「每页 2~8 个」表述已在 §9 订正。

### 11.3 命名规范与 wire format

**锚点 id 命名**：`ai-sdlc-<pageId>-<block>`，其中 `<pageId>` 与 `index.tsx` 的路由 id 一致，`<block>` 为区块语义名。每个页面的根节点固定为 `ai-sdlc-<pageId>-page`。三个实例（逐字取自 impl-11 / impl-12 / impl-13 的清单）：

```
prototype 页 9 个：ai-sdlc-prototype-page / -summary / -create / -steps / -jobs
                  / -canvas / -reviews / -versions / -automation
api-test  页 9 个：ai-sdlc-api-test-page / -case-metrics / -case-table / -contract-coverage
                  / -flaky / -scenario-flow / -mock-rules / -run-table / -report-gate
knowledge 页 9 个：ai-sdlc-knowledge-page / -overview-metrics / -stage-coverage / -stale-alert
                  / -weknora-engine / -archive-pipeline / -graph-canvas / -retrieval-bench
                  / -hallucination
```

**`annotation-source.json` 的顶层 wire format（`format: "axhub-annotation-source"`，实测值）**：

| 顶层字段 | 类型 | 本原型实测取值 |
|:---|:---|:---|
| `documentVersion` | number | `1` |
| `format` | string | `"axhub-annotation-source"` |
| `presentation.layerSelectors` | string[] | `[".ac-drawer.ac-drawer--open", ".ac-modal-mask--open"]`（抽屉与弹窗打开时锚点仍可定位，故提升为独立图层） |
| `data.version` | number | `2` |
| `data.prototypeName` | string | `"ai-sdlc-console"` |
| `data.pageId` | string | `"overview"`（默认页，与 `defineHashPageRoute` 的 `defaultPageId` 一致） |
| `data.updatedAt` | number | 毫秒时间戳 |
| `data.nodes[]` | object[] | **171 条**锚点，单条结构见下 |
| `markdownMap` | `Record<anchorId, string>` | **171 个键**，每个锚点的 Markdown 正文（`hasMarkdown=true` 时必填） |
| `assetMap` | object | `{}`（本原型无图片附件） |
| `directory.nodes[]` | object[] | 目录树，节点 `type` ∈ `folder`（3）/ `route`（21）/ `markdown`（14）/ `link`（4） |

**`data.nodes[]` 单条结构**：

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `id` | string | 锚点 id，命名规范 `ai-sdlc-<pageId>-<block>` |
| `index` | number | 全局递增顺序号，决定批注面板排序 |
| `title` | string | 面板标题 |
| `pageId` | string | 所属页面，与 `index.tsx` 路由 id 一致 |
| `locator.selectors` | string[] | **CSS 属性选择器**，形如 `["[data-annotation-id=\"ai-sdlc-prototype-canvas\"]"]`，是锚点 ↔ DOM 的**唯一绑定** |
| `aiPrompt` | string | 供 AxHub 侧 AI 生成批注的引导语 |
| `annotationText` | string | 人工批注正文（初始为空） |
| `hasMarkdown` | boolean | 是否有 `markdownMap` 条目 |
| `color` | string | 锚点颜色，按分组着色（AI 相关区块用 `#7C3AED` AI 紫） |
| `images` | array | 附图 |
| `createdAt` / `updatedAt` | number | 毫秒时间戳 |

### 11.4 14 篇文档的内联机制（`index.tsx`）

批注目录树中的 `markdown` 节点只声明 `markdownPath`（如 `docs/impl-13-knowledge-weknora.md`），**不含正文**；正文在构建期由 Vite 的 `?raw` 导入内联，运行时由 `inlineDirectoryMarkdown()` 注入。三步机制（逐字对应 `index.tsx` 第 36~49、130~172、178 行）：

```ts
// ① 构建期：14 篇 markdown 以字符串形式进入 bundle
import impl00 from './docs/impl-00-overview.md?raw';
//    ... impl01 ~ impl13 同构，共 14 条 ?raw 导入

// ② 路径 → 正文 的静态映射表（14 个键，与 docs/ 目录一一对应）
const DIRECTORY_MARKDOWN_BY_PATH: Record<string, string> = {
  'docs/impl-00-overview.md': impl00,
  /* ... */
  'docs/impl-13-knowledge-weknora.md': impl13,
};

// ③ 运行时：深拷贝目录树，递归把 markdownPath 解析为 markdown 正文
function inlineDirectoryMarkdown(source: typeof annotationSourceDocument): AnnotationSourceDocument {
  const cloned = JSON.parse(JSON.stringify(source)) as AnnotationSourceDocument & { /* ... */ };
  const visit = (nodes?: DirectoryNodeWithMarkdownPath[]) => {
    if (!nodes) return;
    nodes.forEach((node) => {
      if (node.type === 'markdown' && node.markdownPath) {
        node.markdown = DIRECTORY_MARKDOWN_BY_PATH[node.markdownPath] ?? '';
      }
      visit(node.children);
    });
  };
  visit(cloned.directory?.nodes);
  return cloned;
}

// ④ 挂载：用 useMemo 只算一次，并把当前 pageId 与目录路由回调传给 Viewer
const annotationSource = useMemo(() => inlineDirectoryMarkdown(annotationSourceDocument), []);
const annotationOptions = useMemo<AnnotationViewerOptions>(() => ({
  currentPageId: page,
  onDirectoryRoute: (node) => {
    if (typeof node.route === 'string' && PAGES[node.route]) setPage(node.route);
  },
}), [page, setPage]);
```

**四条实现约束**：

1. **`?? ''` 兜底不得触发**：`DIRECTORY_MARKDOWN_BY_PATH` 的 14 个键必须与 `annotation-source.json` 中 14 个 `markdown` 节点的 `markdownPath` **完全一致**；若某条落到 `''`，批注面板会显示空白文档而无报错，属静默失败。新增文档时必须同时改三处：`docs/*.md`、`index.tsx` 的 `?raw` 导入与映射表、`annotation-source.json` 的目录节点。
2. **深拷贝隔离**：`JSON.parse(JSON.stringify(source))` 保证注入正文不污染 `import` 进来的 JSON 模块对象（该对象在 ES Module 下是**冻结的共享单例**，直接改会影响 HMR 后的第二次挂载）。
3. **`useMemo` 空依赖**：内联是纯静态计算，依赖数组为 `[]`；不得把 `page` 放进去，否则每次切页都会重新深拷贝整棵目录树（含 14 篇 markdown 全文，本原型约 1.2 MB 文本）。
4. **`onDirectoryRoute` 必须校验 `PAGES[node.route]`**：目录中的 `route` 节点若指向不存在的 pageId，直接 `setPage` 会让 `PAGES[page] ?? OverviewPage` 静默回落到总览，用户点目录却跳错页且无提示。

---

## 12. 本轮登记的待校对项（只登记，不修改其他文件）

本篇在同步 21 页 / 14 篇文档的过程中发现以下差异，**均未代为修改**源文件或其他 impl 文档，登记于此供下一轮统一校对：

| # | 待校对项 | 现象（可复现） | 影响 | 建议归属 |
|:--:|:---|:---|:---|:---|
| **D-01** | impl-11 **缺「角色可见性」小节** | impl-10 §7、impl-12 §9.2、impl-13 §11.2 均给出 7 角色 × 本页的可见性矩阵，唯独 impl-11 没有（grep `◐` / `●` / 「可见性」在 impl-11 中 0 命中） | 本篇 §6.1 的 `prototype` 行只能由 impl-11 §5.2 的 22 个 `PTP-*` 接口权限标注**推导**得出（推导过程已在 §6.1 逐格写明），不是原文摘取 | impl-11 补一节「7 角色 × 本页可见性」，并与本篇 §6.1 的 `prototype` 行对齐 |
| **D-02** | **并行组 `F` 被两篇重复占用** | impl-10 §9.1 的 F = 管理域基底（12 人日，阻塞 G/H/I）；impl-13 §11.3 的 F = 知识与平台域（22 人日，不阻塞任何组） | 按组名排期会把两条独立线路误判为同一条 | 本篇 §7.1 已裁定：`F` 归 impl-10，impl-13 改称 **`R`**。建议 impl-13 §11.3 同步改名（同一冲突亦登记在 impl-00 §13.1 P-01） |
| **D-03** | **67 个新事件主题未登记进 impl-01 §3.2** | impl-10 §4.1 的 33 个 `E-*`、impl-11 §5.5 的 16 个 `P-*`、impl-12 §7.3 的 8 个 `sdlc.apitest.*`、impl-13 §9.3 的 10 个 `sdlc.kb.*`，均声明「本文定义」，但 impl-01 §3.2 的通配主题清单未包含 `sdlc.project.*` / `sdlc.prototype.*` / `sdlc.apitest.*` / `sdlc.kb.*` 等 12 个新域 | §9 验收项「订阅主题均在 impl-01 §3.2 / impl-03 §6 已声明」**当前不可判定通过**；前端按 §3.1 订阅这些主题属「订阅未声明主题」 | impl-01 §3.2 补登记 12 个新域通配主题与 67 个具体主题 |
| **D-04** | **`Layout.tsx` 遗留注释「菜单：6 分组」** | `<nav className="ac-menu">` 上方行内注释仍写「6 分组」，而 `MENU_GROUPS.length === 7`、上方 `MENU_GROUPS` 的注释已写「七大分组」 | 仅误导阅读，不影响渲染 | `components/Layout.tsx`（本轮不改 `.tsx`） |
| **D-05** | 3 个既有页缺 `aria-label` | `BoardPage.tsx` / `IntegrationPage.tsx` / `RequirementPage.tsx` 未命中 `aria-label`（本轮 8 个新页全部命中） | §8 的 ARIA 规则「图标按钮必须有 `aria-label`」在这 3 页不成立 | 三个页面组件（本轮不改 `.tsx`） |
| **D-06** | §4.1 的「复用页面」列有 4 处与实测不符 | ① `ac-ai-block` 记 `requirement`/`coding`/`bug`/`test`，实测这 4 页**均未命中**、命中的是另 12 页；② `ac-search-card` 记「筛选区统一使用，复用页面 board、test、bug、integration、settings、ai-observe」，实测**仅 `BugPage` 1 处**；③ `ac-badge` 记含 `pipeline`，实测未命中；④ `ac-progress` 记含 `bug`，实测未命中 | §4.1 的复用清单不可作为「改这个类会影响哪些页」的依据；本篇已在 §4.3 给出 grep 实测矩阵作为替代 | 本篇 §4.1（下一轮修订）；`style.css` 无需改动 |
| **D-07** | v1.0 的侧边栏宽度与代码不符 | §8 原记「展开 232px、收起 60px」，`style.css` 第 71~72 行实为 `--sidebar-w: 240px` / `--sidebar-w-collapsed: 64px` | 响应式断点计算会偏差 8px / 4px | 本篇 §8 已订正（本轮已改） |
| **D-08** | `ai-sdlc-coding-session-flow` 锚点重复 | 该 id 在 `CodingPage.tsx` 出现 **2 次**（原始 172 次 / 去重 171 个）。`annotation-source.json` 只登记 1 条，故 `locator.selectors` 会命中**两个** DOM 节点 | 批注高亮时可能同时框住两个区块；`nodes[].index` 与 DOM 顺序的对应关系在条件渲染切换时不稳定 | `pages/CodingPage.tsx`（本轮不改 `.tsx`）；或按 impl-11 §10.2 R-04 的「锚点属性只增不改」原则保留，由 `layerSelectors` 消歧 |
| **D-09** | impl-09 P0-8 的页面数与角色数陈旧 | impl-09 §2.1 P0-8 交付物写「13 页面路由 + **6 角色** Mock 切换」，验收标准写「13 个路由可达」；本轮实际为 21 页面 + **7 角色**（`data.ts` `ROLES` 为 7 个，本篇 §6 的矩阵也是 7 列） | P0 阶段的验收标准与现状不符（「6 角色」与本篇 §6 的 7 角色矩阵本就是 v1.0 遗留的不一致） | impl-09 §2.1 P0-8（详见 impl-00 §13.2 第 1 条） |
| **D-10** | 四篇新文档的「全库表数」口径互相矛盾 | impl-10 给 44 / 50，impl-11 给 31 / 55 / 61 / 63，impl-12 与 impl-13 均给 27 / 35 / 42，**没有任何一篇给出四篇同时落地的合计** | 「全库多少张表」有 5 个不同答案 | 已在 impl-00 §12.2 用一张表并列四篇声明值与统一口径（**20 + 24 + 11 + 7 + 15 = 77 张**，补齐 8 张待补基础表后 85 张），并登记 T-01~T-05 五条差异；四篇原文未改 |

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|:---|:---|:---|
| v1.0 | 2026-03-19 | 首版发布：13 个页面清单与 6 分组导航结构、路由与全局壳、前端技术选型与目录结构、13 页 ↔ REST ↔ 订阅主题三向映射总表与分页面要点、共享组件清单（`style.css` 通用类）与 5 条复用规则、状态分层与实时刷新链路、乐观更新与回滚、门禁与禁用态、缓存失效与大列表阈值、真实实现阶段的演进、7 角色职责与 13 页可见性矩阵、落地与降级规则、13 页工时拆分（前端 95 + 后端 51 + 联调 27 = 173 人日）与 A~E 五个并行组、可访问性与响应式、9 条验收清单、页面 ↔ Agent ↔ 门禁 ↔ 通知对照表。 |
| v1.1 | 2026-03-19 | 同步本轮扩展：13→21 页、10→14 篇文档、6→7 导航分组、87→171 批注锚点、新增 3 个数据模块与 3 个外部能力对标。具体：① 头部表升版并追加「被引用为母版」行，依赖文档补 impl-10~13；② §1.1 追加 8 行（14~21）并给出 `index.tsx` `route` 的真实渲染顺序，§1.2 重写为 7 分组表（含分组图标与逐条变更），§1.3 追加路由注册数 / 面包屑反查 / 移动端抽屉三条；③ §2 选型表更新 21 页、4 个数据模块与本轮新增的 12 类内联 SVG 图表，§2.1 目录结构重写为真实的 21 个 `.tsx` + 21 个 `.css` + 4 个数据模块 + 14 篇 docs，并新增 21 行页面独占 CSS 前缀清单（grep 核实）；④ **§3.1 三向映射表由 5 列扩为 6 列、由 13 行扩为 21 行**，既有 13 行前 5 列逐字保留，8 行新页逐字摘取 impl-10 §6 / impl-11 §8.1 / impl-12 §9.1 / impl-13 §11.1，`schedule`/`design`/`coding` 三行的「关键交互」列追加本轮 AI 能力；主题使用约束补 4 组通配主题（67 个）与两个高频主题的聚合发布要求；⑤ §4.1 追加 v1.0 快照说明，§4.2 前缀隔离补 9 个新前缀并新增规则 6~8，新增 §4.3 21 页 × 通用类实测复用矩阵、§4.4 四种跨页统一模式（乐观更新覆盖层 / 门禁禁用态 / 手绘 SVG 图表 / 可回放流程演示，含真实采用页面清单）、§4.5 门禁禁用态场景补充 8 条；⑥ §5.3 补 8 页适用范围，§5.5 补新页缓存键、两个「禁止缓存」例外与大列表实测，§5.6 追加第 6 条抽共享件计划，新增 §5.7 八页刷新策略汇总与「三个新数据模块均为只读常量」硬约束；⑦ **§6.1 可见性矩阵由 13 行扩为 21 行**（7 角色 × 21 页 = 147 格），8 行来源逐条标注（`prototype` 行为本篇按 `PTP-*` 权限标注推导，登记为 D-01），§6 追加落地页与 `focusPages` 处理说明；⑧ §7 保留 173 人日原表，§7.1 追加 E 扩充与 F~R 共 13 个并行组、并行关系树与两条关键路径（含 `F` 组冲突裁定），新增 §7.2 四篇工时（132 / 106 / 18 / 22 = 278 人日）与 §7.3 合并总计 **451 人日 ≈ 90.2 人周**及与 impl-09 §3.2 的量级校验；⑨ §8 订正侧边栏宽度为 240px / 64px，新增 §8.1 八页 + 三增强页的 11 项可访问性与响应式实测；⑩ §9 更新 21 页 / 7 分组 / 4~13 锚点 / 171 锚点，新增 §9.1 八个新页的分页验收项（通用 5 条 + 各页 6~10 条）与 §9.2 三个增强页的验收项；⑪ **§10 对照表追加 8 行**（Agent / 门禁 / 通知 / 状态四列）与两条跨页因果链；⑫ 新增 §11 批注锚点体系（171 锚点的三处一致性、21 页逐页明细、命名规范与 wire format、14 篇文档的 `?raw` + `inlineDirectoryMarkdown()` 内联机制与 4 条实现约束）、§12 待校对项 D-01~D-10（只登记不代改）。 |
