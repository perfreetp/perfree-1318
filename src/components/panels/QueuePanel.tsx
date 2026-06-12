import React, { useState, useRef } from 'react';
import { useAppStore } from '@/store';
import { Modal } from '@/components/common/Modal';
import { ReplayConfig, ReplayQueueItem } from '@/types';
import { replayEngine, ReplayProgress } from '@/services/replayEngine';
import { formatTime, formatDate } from '@/utils';

export const QueuePanel: React.FC = () => {
  const {
    selectedProjectId,
    requests,
    environments,
    selectedEnvironmentId,
    queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    updateQueueItem,
    reorderQueue,
    replayConfig,
    setReplayConfig,
    setCurrentResults,
    setActiveTab,
    addHistoryBatch
  } = useAppStore();

  const [showAddRequests, setShowAddRequests] = useState(false);
  const [showSaveSnapshot, setShowSaveSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [progress, setProgress] = useState<ReplayProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const cancelRef = useRef(false);

  const projectRequests = requests.filter((r) => r.projectId === selectedProjectId);
  const projectQueue = (queue[selectedProjectId || ''] || []).sort((a, b) => a.order - b.order);
  const queuedIds = new Set(projectQueue.map((i) => i.requestId));
  const availableRequests = projectRequests.filter((r) => !queuedIds.has(r.id));
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const getMethodTagClass = (method: string) => {
    const m = method.toUpperCase();
    if (m === 'GET') return 'tag-method-get';
    if (m === 'POST') return 'tag-method-post';
    if (m === 'PUT') return 'tag-method-put';
    if (m === 'DELETE') return 'tag-method-delete';
    return 'tag-method-other';
  };

  const handleAddSelected = (ids: string[]) => {
    ids.forEach((id) => addToQueue(selectedProjectId!, id));
    setShowAddRequests(false);
  };

  const handleMoveUp = (idx: number) => {
    if (idx <= 0) return;
    const newQueue = [...projectQueue];
    [newQueue[idx - 1], newQueue[idx]] = [newQueue[idx], newQueue[idx - 1]];
    reorderQueue(selectedProjectId!, newQueue);
  };

  const handleMoveDown = (idx: number) => {
    if (idx >= projectQueue.length - 1) return;
    const newQueue = [...projectQueue];
    [newQueue[idx], newQueue[idx + 1]] = [newQueue[idx + 1], newQueue[idx]];
    reorderQueue(selectedProjectId!, newQueue);
  };

  const handleStartReplay = async () => {
    if (projectQueue.filter((i) => i.enabled).length === 0) {
      alert('队列中没有启用的请求');
      return;
    }

    setIsRunning(true);
    cancelRef.current = false;
    setProgress({ total: projectQueue.filter((i) => i.enabled).length, current: 0, results: [] });

    try {
      const results = await replayEngine.runReplay(
        projectRequests,
        projectQueue,
        currentEnv,
        replayConfig,
        (p) => {
          if (!cancelRef.current) setProgress(p);
        }
      );
      setCurrentResults(results);

      const historyRecords = results.map((r) => ({
        projectId: r.request.projectId,
        requestId: r.requestId,
        resultId: r.id,
        request: JSON.parse(JSON.stringify(r.request)),
        actualRequest: r.actualRequest,
        response: r.response,
        assertionResults: r.assertionResults,
        passed: r.passed,
        failureReason: r.failureReason
      }));
      addHistoryBatch(historyRecords);

      setActiveTab('report');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    replayEngine.cancel();
  };

  if (!selectedProjectId) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>请先在项目管理中选择一个项目</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>回放队列 ({projectQueue.filter((i) => i.enabled).length}/{projectQueue.length})</h2>
        <div className="toolbar">
          <button className="btn" onClick={() => setShowAddRequests(true)} disabled={isRunning}>
            + 添加请求
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (confirm('确定清空队列？')) clearQueue(selectedProjectId!);
            }}
            disabled={isRunning || projectQueue.length === 0}
          >
            清空
          </button>
          {isRunning ? (
            <button className="btn btn-danger" onClick={handleCancel}>
              ■ 停止
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleStartReplay} disabled={projectQueue.length === 0}>
              ▶ 开始回放
            </button>
          )}
        </div>
      </div>

      <div className="panel-body">
        <div className="card mb-3">
          <h3 style={{ fontSize: 13, marginBottom: 12 }}>回放设置</h3>
          <div className="grid-4">
            <div className="form-row">
              <label>并发数</label>
              <input
                type="number"
                className="input"
                min={1}
                max={50}
                value={replayConfig.concurrency}
                onChange={(e) =>
                  setReplayConfig({ concurrency: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })
                }
                disabled={isRunning}
              />
            </div>
            <div className="form-row">
              <label>间隔 (ms)</label>
              <input
                type="number"
                className="input"
                min={0}
                value={replayConfig.interval}
                onChange={(e) => setReplayConfig({ interval: Math.max(0, Number(e.target.value) || 0) })}
                disabled={isRunning}
              />
            </div>
            <div className="form-row">
              <label>结果筛选</label>
              <select
                className="select"
                value={replayConfig.statusFilter}
                onChange={(e) => setReplayConfig({ statusFilter: e.target.value as ReplayConfig['statusFilter'] })}
                disabled={isRunning}
              >
                <option value="all">全部</option>
                <option value="2xx">仅 2xx</option>
                <option value="3xx">仅 3xx</option>
                <option value="4xx">仅 4xx</option>
                <option value="5xx">仅 5xx</option>
                <option value="failed">仅失败</option>
              </select>
            </div>
            <div className="form-row flex items-center gap-2" style={{ alignItems: 'center' }}>
              <label style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={replayConfig.extractPrevious}
                  onChange={(e) => setReplayConfig({ extractPrevious: e.target.checked })}
                  disabled={isRunning}
                />
                {' '}串联变量
              </label>
              <label style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={replayConfig.stopOnFailure}
                  onChange={(e) => setReplayConfig({ stopOnFailure: e.target.checked })}
                  disabled={isRunning}
                />
                {' '}遇错即停
              </label>
            </div>
          </div>
        </div>

        {progress && isRunning && (
          <div className="card mb-3">
            <div className="flex justify-between items-center mb-2">
              <span>
                正在执行: {progress.currentRequest}
              </span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {projectQueue.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📭</div>
            <p>队列为空，点击右上角按钮添加请求</p>
          </div>
        ) : (
          <table className="kvp-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} className="text-center">#</th>
                <th style={{ width: 60 }} className="text-center">启用</th>
                <th>方法</th>
                <th>请求名称</th>
                <th>URL</th>
                <th style={{ width: 120 }} className="text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {projectQueue.map((item, idx) => {
                const req = projectRequests.find((r) => r.id === item.requestId);
                if (!req) return null;
                return (
                  <tr key={item.id}>
                    <td className="text-center">{idx + 1}</td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={item.enabled}
                        onChange={(e) =>
                          updateQueueItem(selectedProjectId!, item.requestId, { enabled: e.target.checked })
                        }
                        disabled={isRunning}
                      />
                    </td>
                    <td>
                      <span className={`tag ${getMethodTagClass(req.method)}`}>{req.method}</span>
                    </td>
                    <td>
                      {req.favorite && <span style={{ color: 'var(--warning)' }}>★ </span>}
                      {req.name}
                    </td>
                    <td className="text-secondary text-sm truncate" style={{ maxWidth: 300 }}>
                      {req.url}
                    </td>
                    <td className="text-center">
                      <button
                        className="btn btn-sm btn-icon"
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0 || isRunning}
                        title="上移"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-sm btn-icon"
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === projectQueue.length - 1 || isRunning}
                        title="下移"
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-sm btn-icon hover-danger"
                        onClick={() => removeFromQueue(selectedProjectId!, item.requestId)}
                        disabled={isRunning}
                        title="移除"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAddRequests && (
        <AddRequestsModal
          requests={availableRequests}
          onCancel={() => setShowAddRequests(false)}
          onAdd={handleAddSelected}
          getMethodTagClass={getMethodTagClass}
        />
      )}
    </div>
  );
};

interface AddModalProps {
  requests: any[];
  onCancel: () => void;
  onAdd: (ids: string[]) => void;
  getMethodTagClass: (m: string) => string;
}

const AddRequestsModal: React.FC<AddModalProps> = ({ requests, onCancel, onAdd, getMethodTagClass }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const filtered = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelected(newSet);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  return (
    <Modal
      title="添加请求到队列"
      onClose={onCancel}
      width={600}
      footer={
        <>
          <button className="btn" onClick={onCancel}>取消</button>
          <button
            className="btn btn-primary"
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
          >
            添加 ({selected.size})
          </button>
        </>
      }
    >
      <div className="mb-3">
        <input
          type="text"
          className="input"
          placeholder="搜索请求..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center text-muted" style={{ padding: 24 }}>
          没有可添加的请求（所有请求都已在队列中）
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <label>
              <input type="checkbox" className="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
              {' '}全选 ({selected.size}/{filtered.length})
            </label>
          </div>
          <div style={{ maxHeight: 350, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 4 }}>
            {filtered.map((req) => (
              <div
                key={req.id}
                className="list-item"
                style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', cursor: 'pointer' }}
                onClick={() => toggle(req.id)}
              >
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.has(req.id)}
                    onChange={() => toggle(req.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={`tag ${getMethodTagClass(req.method)}`}>{req.method}</span>
                  <span>{req.name}</span>
                </div>
                <span className="text-secondary text-sm truncate" style={{ maxWidth: 200 }}>
                  {req.url}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
};
