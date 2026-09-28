/**
 * AI 研发协作控制台 · 原型入口
 * @name AI 研发协作控制台
 */
import React, { useMemo } from 'react';
import {
  AnnotationViewer,
  type AnnotationDirectoryRouteNode,
  type AnnotationSourceDocument,
  type AnnotationViewerOptions,
} from '@axhub/annotation';
import { defineHashPageRoute, useHashPage } from '../../common/useHashPage';
import Layout from './components/Layout';
import OverviewPage from './pages/OverviewPage';
import ProjectPage from './pages/ProjectPage';
import PeoplePage from './pages/PeoplePage';
import TeamPage from './pages/TeamPage';
import ReqPoolPage from './pages/ReqPoolPage';
import RequirementPage from './pages/RequirementPage';
import PrototypePage from './pages/PrototypePage';
import DesignPage from './pages/DesignPage';
import BoardPage from './pages/BoardPage';
import SchedulePage from './pages/SchedulePage';
import CodingPage from './pages/CodingPage';
import ReleasePage from './pages/ReleasePage';
import PipelinePage from './pages/PipelinePage';
import TestPage from './pages/TestPage';
import ApiTestPage from './pages/ApiTestPage';
import BugPage from './pages/BugPage';
import InsightPage from './pages/InsightPage';
import KnowledgePage from './pages/KnowledgePage';
import IntegrationPage from './pages/IntegrationPage';
import AiObservePage from './pages/AiObservePage';
import SettingsPage from './pages/SettingsPage';
import annotationSourceDocument from './annotation-source.json';
import impl00 from './docs/impl-00-overview.md?raw';
import impl01 from './docs/impl-01-protocol.md?raw';
import impl02 from './docs/impl-02-agents.md?raw';
import impl03 from './docs/impl-03-state-machine.md?raw';
import impl04 from './docs/impl-04-data-model.md?raw';
import impl05 from './docs/impl-05-integration.md?raw';
import impl06 from './docs/impl-06-ide-plugin.md?raw';
import impl07 from './docs/impl-07-console.md?raw';
import impl08 from './docs/impl-08-security.md?raw';
import impl09 from './docs/impl-09-roadmap.md?raw';
import impl10 from './docs/impl-10-management.md?raw';
import impl11 from './docs/impl-11-prototype-axhub.md?raw';
import impl12 from './docs/impl-12-api-test-hifox.md?raw';
import impl13 from './docs/impl-13-knowledge-weknora.md?raw';
import './style.css';

const route = defineHashPageRoute(
  [
    { id: 'overview', title: '总览驾驶舱' },
    { id: 'project', title: '项目管理' },
    { id: 'people', title: '人员管理' },
    { id: 'team', title: '团队管理' },
    { id: 'req-pool', title: '需求管理' },
    { id: 'requirement', title: '需求工作台' },
    { id: 'prototype', title: 'AI 原型工坊' },
    { id: 'design', title: '架构设计与任务拆解' },
    { id: 'board', title: '任务看板' },
    { id: 'schedule', title: '排期甘特' },
    { id: 'coding', title: 'AI 编码协作' },
    { id: 'release', title: '版本管理' },
    { id: 'pipeline', title: '部署流水线' },
    { id: 'test', title: '测试中心' },
    { id: 'api-test', title: '接口自动化测试' },
    { id: 'bug', title: 'Bug 流转' },
    { id: 'insight', title: '效能报表' },
    { id: 'knowledge', title: '企业知识库' },
    { id: 'integration', title: 'PingCode 集成中心' },
    { id: 'ai-observe', title: 'AI 能力观测' },
    { id: 'settings', title: '安全与审计' },
  ],
  { defaultPageId: 'overview' },
);

/** 页面 id → 页面标题（供面包屑与外部引用复用） */
export const PAGE_TITLES: Record<string, string> = {
  overview: '总览驾驶舱',
  project: '项目管理',
  people: '人员管理',
  team: '团队管理',
  'req-pool': '需求管理',
  requirement: '需求工作台',
  prototype: 'AI 原型工坊',
  design: '架构设计与任务拆解',
  board: '任务看板',
  schedule: '排期甘特',
  coding: 'AI 编码协作',
  release: '版本管理',
  pipeline: '部署流水线',
  test: '测试中心',
  'api-test': '接口自动化测试',
  bug: 'Bug 流转',
  insight: '效能报表',
  knowledge: '企业知识库',
  integration: 'PingCode 集成中心',
  'ai-observe': 'AI 能力观测',
  settings: '安全与审计',
};

/** 页面 id → 页面组件（管理类 + 六环节 + 总览 + 横向能力） */
const PAGES: Record<string, React.ComponentType> = {
  overview: OverviewPage,
  project: ProjectPage,
  people: PeoplePage,
  team: TeamPage,
  'req-pool': ReqPoolPage,
  requirement: RequirementPage,
  prototype: PrototypePage,
  design: DesignPage,
  board: BoardPage,
  schedule: SchedulePage,
  coding: CodingPage,
  release: ReleasePage,
  pipeline: PipelinePage,
  test: TestPage,
  'api-test': ApiTestPage,
  bug: BugPage,
  insight: InsightPage,
  knowledge: KnowledgePage,
  integration: IntegrationPage,
  'ai-observe': AiObservePage,
  settings: SettingsPage,
};

/** 实施方案文档：markdownPath → 构建期内联的正文 */
const DIRECTORY_MARKDOWN_BY_PATH: Record<string, string> = {
  'docs/impl-00-overview.md': impl00,
  'docs/impl-01-protocol.md': impl01,
  'docs/impl-02-agents.md': impl02,
  'docs/impl-03-state-machine.md': impl03,
  'docs/impl-04-data-model.md': impl04,
  'docs/impl-05-integration.md': impl05,
  'docs/impl-06-ide-plugin.md': impl06,
  'docs/impl-07-console.md': impl07,
  'docs/impl-08-security.md': impl08,
  'docs/impl-09-roadmap.md': impl09,
  'docs/impl-10-management.md': impl10,
  'docs/impl-11-prototype-axhub.md': impl11,
  'docs/impl-12-api-test-hifox.md': impl12,
  'docs/impl-13-knowledge-weknora.md': impl13,
};

type DirectoryNodeWithMarkdownPath = {
  type?: string;
  markdown?: string;
  markdownPath?: string;
  children?: DirectoryNodeWithMarkdownPath[];
};

/** 把目录节点的 markdownPath 解析为运行时可直接读取的 markdown 正文 */
function inlineDirectoryMarkdown(source: typeof annotationSourceDocument): AnnotationSourceDocument {
  const cloned = JSON.parse(JSON.stringify(source)) as AnnotationSourceDocument & {
    directory?: { nodes?: DirectoryNodeWithMarkdownPath[] };
  };

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

export default function AiSdlcConsole() {
  const { page, setPage } = useHashPage(route);
  const pageTitle = PAGE_TITLES[page] || PAGE_TITLES[route.defaultPageId];
  const CurrentPage = PAGES[page] ?? OverviewPage;
  const annotationSource = useMemo(() => inlineDirectoryMarkdown(annotationSourceDocument), []);
  const annotationOptions = useMemo<AnnotationViewerOptions>(
    () => ({
      currentPageId: page,
      onDirectoryRoute: (node: AnnotationDirectoryRouteNode) => {
        if (typeof node.route === 'string' && PAGES[node.route]) setPage(node.route);
      },
    }),
    [page, setPage],
  );

  return (
    <>
      <Layout page={page} setPage={setPage} pageTitle={pageTitle}>
        <CurrentPage />
      </Layout>
      <AnnotationViewer source={annotationSource} options={annotationOptions} />
    </>
  );
}
