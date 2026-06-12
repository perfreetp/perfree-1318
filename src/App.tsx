import React from 'react';
import { useAppStore } from '@/store';
import { TabType } from '@/types';
import { ProjectPanel } from '@/components/panels/ProjectPanel';
import { RequestPanel } from '@/components/panels/RequestPanel';
import { EnvironmentPanel } from '@/components/panels/EnvironmentPanel';
import { QueuePanel } from '@/components/panels/QueuePanel';
import { AssertionPanel } from '@/components/panels/AssertionPanel';
import { ReportPanel } from '@/components/panels/ReportPanel';
import { HistoryPanel } from '@/components/panels/HistoryPanel';

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'project', label: '项目管理', icon: '📁' },
  { key: 'request', label: '请求编辑', icon: '📝' },
  { key: 'environment', label: '环境变量', icon: '🌍' },
  { key: 'queue', label: '回放队列', icon: '▶️' },
  { key: 'assertion', label: '断言对比', icon: '🔍' },
  { key: 'report', label: '结果报告', icon: '📊' },
  { key: 'history', label: '历史记录', icon: '🕐' }
];

const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    projects,
    selectedProjectId,
    selectProject,
    environments,
    selectedEnvironmentId,
    selectEnvironment,
    currentResults
  } = useAppStore();

  const projectEnvs = environments.filter((e) => e.projectId === selectedProjectId);

  const renderPanel = () => {
    switch (activeTab) {
      case 'project':
        return <ProjectPanel />;
      case 'request':
        return <RequestPanel />;
      case 'environment':
        return <EnvironmentPanel />;
      case 'queue':
        return <QueuePanel />;
      case 'assertion':
        return <AssertionPanel />;
      case 'report':
        return <ReportPanel />;
      case 'history':
        return <HistoryPanel />;
      default:
        return null;
    }
  };

  const getTabBadge = (key: TabType) => {
    if (key === 'report' && currentResults.length > 0) {
      return currentResults.length;
    }
    return null;
  };

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>⚡ API Replay Tool</h1>
        <div className="project-info">
          <select
            className="project-select"
            value={selectedProjectId || ''}
            onChange={(e) => selectProject(e.target.value || null)}
          >
            <option value="">请选择项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                📁 {p.name}
              </option>
            ))}
          </select>
          {selectedProjectId && (
            <select
              className="env-select"
              value={selectedEnvironmentId || ''}
              onChange={(e) => selectEnvironment(e.target.value || null)}
            >
              <option value="">请选择环境</option>
              {projectEnvs.map((env) => (
                <option key={env.id} value={env.id}>
                  🌍 {env.name}
                  {env.isDefault ? ' (默认)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => {
          const badge = getTabBadge(tab.key);
          return (
            <div
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="icon">{tab.icon}</span>
              <span>{tab.label}</span>
              {badge !== null && <span className="badge">{badge}</span>}
            </div>
          );
        })}
      </div>

      <div className="main-content">{renderPanel()}</div>
    </div>
  );
};

export default App;
