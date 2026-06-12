import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { Modal } from '@/components/common/Modal';
import { formatDate } from '@/utils';

export const ProjectPanel: React.FC = () => {
  const {
    projects,
    selectedProjectId,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    setActiveTab
  } = useAppStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setShowCreateModal(true);
  };

  const openEdit = (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    setEditingId(id);
    setName(project.name);
    setDescription(project.description || '');
    setShowCreateModal(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editingId) {
      updateProject(editingId, name.trim(), description.trim());
    } else {
      createProject(name.trim(), description.trim());
    }
    setShowCreateModal(false);
  };

  const handleSelect = (id: string) => {
    selectProject(id);
    setActiveTab('request');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定删除此项目？相关请求、环境、历史记录将一并删除。')) {
      deleteProject(id);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>项目管理</h2>
        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreate}>
            + 新建项目
          </button>
        </div>
      </div>
      <div className="panel-body">
        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📁</div>
            <p>还没有项目，点击右上角按钮创建第一个项目</p>
            <button className="btn btn-primary" onClick={openCreate}>
              + 新建项目
            </button>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={`list-item ${selectedProjectId === project.id ? 'active' : ''}`}
              onClick={() => handleSelect(project.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span>📁</span>
                  <strong className="truncate">{project.name}</strong>
                  {selectedProjectId === project.id && <span className="tag tag-info">当前</span>}
                </div>
                {project.description && (
                  <div className="text-sm text-secondary mt-2 truncate">{project.description}</div>
                )}
                <div className="text-sm text-muted mt-2">
                  创建于 {formatDate(project.createdAt)} · 更新于 {formatDate(project.updatedAt)}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(project.id); }}>
                  编辑
                </button>
                <button className="btn btn-sm btn-danger" onClick={(e) => handleDelete(project.id, e)}>
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <Modal
          title={editingId ? '编辑项目' : '新建项目'}
          onClose={() => setShowCreateModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowCreateModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>保存</button>
            </>
          }
        >
          <div className="form-row">
            <label>项目名称</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入项目名称"
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>项目描述</label>
            <textarea
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入项目描述（可选）"
            />
          </div>
        </Modal>
      )}
    </div>
  );
};
