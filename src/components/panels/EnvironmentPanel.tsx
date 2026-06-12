import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { KeyValueEditor } from '@/components/common/KeyValueEditor';
import { Environment, EnvironmentVariable } from '@/types';
import { generateId } from '@/utils';

export const EnvironmentPanel: React.FC = () => {
  const {
    selectedProjectId,
    environments,
    selectedEnvironmentId,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    selectEnvironment
  } = useAppStore();

  const [newEnvName, setNewEnvName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  const projectEnvs = environments.filter((e) => e.projectId === selectedProjectId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const handleCreateEnv = () => {
    if (!newEnvName.trim() || !selectedProjectId) return;
    createEnvironment(selectedProjectId, newEnvName.trim());
    setNewEnvName('');
    setShowNewInput(false);
  };

  const handleUpdateEnvName = (id: string, name: string) => {
    updateEnvironment(id, { name });
  };

  const handleUpdateVariables = (variables: EnvironmentVariable[]) => {
    if (!currentEnv) return;
    updateEnvironment(currentEnv.id, { variables });
  };

  const handleSetDefault = (env: Environment) => {
    projectEnvs.forEach((e) => {
      updateEnvironment(e.id, { isDefault: e.id === env.id });
    });
  };

  if (!selectedProjectId) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="icon">⚙️</div>
            <p>请先在项目管理中选择一个项目</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="split-view" style={{ height: '100%' }}>
        <div className="split-sidebar">
          <div className="split-sidebar-header flex justify-between items-center">
            <span>环境列表</span>
            <button className="btn btn-sm btn-icon" onClick={() => setShowNewInput(true)}>
              +
            </button>
          </div>
          <div className="split-sidebar-body">
            {showNewInput && (
              <div className="list-item mb-3">
                <input
                  type="text"
                  className="input"
                  style={{ marginRight: 8 }}
                  placeholder="环境名称"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateEnv()}
                />
                <button className="btn btn-sm btn-primary" onClick={handleCreateEnv}>
                  创建
                </button>
              </div>
            )}

            {projectEnvs.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 24 }}>
                暂无环境
              </div>
            ) : (
              projectEnvs.map((env) => (
                <div
                  key={env.id}
                  className={`list-item ${selectedEnvironmentId === env.id ? 'active' : ''}`}
                  style={{ padding: '10px 12px', cursor: 'pointer' }}
                  onClick={() => selectEnvironment(env.id)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span>🌍</span>
                    <input
                      type="text"
                      className="input"
                      style={{ background: 'transparent', border: 'none', flex: 1 }}
                      value={env.name}
                      onChange={(e) => handleUpdateEnvName(env.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {env.isDefault && <span className="tag tag-info">默认</span>}
                  </div>
                  <div className="flex gap-1">
                    {!env.isDefault && (
                      <button
                        className="btn btn-sm btn-icon"
                        title="设为默认"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetDefault(env);
                        }}
                      >
                        ⭐
                      </button>
                    )}
                    {!env.isDefault && (
                      <button
                        className="btn btn-sm btn-icon hover-danger"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('确定删除此环境？')) deleteEnvironment(env.id);
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="split-content">
          <div className="panel-header">
            <h2>
              {currentEnv ? `环境变量 - ${currentEnv.name}` : '请选择一个环境'}
              <span className="text-secondary text-sm" style={{ marginLeft: 12 }}>
                使用 {'{{变量名}}'} 在请求中引用变量
              </span>
            </h2>
          </div>
          <div className="panel-body">
            {!currentEnv ? (
              <div className="empty-state">
                <div className="icon">🔧</div>
                <p>从左侧选择一个环境进行编辑</p>
              </div>
            ) : (
              <div className="card">
                <KeyValueEditor
                  items={currentEnv.variables}
                  onChange={handleUpdateVariables}
                  keyPlaceholder="变量名"
                  valuePlaceholder="变量值"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
