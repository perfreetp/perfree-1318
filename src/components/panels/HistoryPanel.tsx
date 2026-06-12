import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { Modal } from '@/components/common/Modal';
import { formatTime, formatSize, formatDate } from '@/utils';
import { HistoryRecord } from '@/types';

export const HistoryPanel: React.FC = () => {
  const {
    selectedProjectId,
    history,
    requests,
    clearHistory,
    clearExpiredHistory,
    selectRequest,
    setActiveTab,
    createRequest,
    selectedEnvironmentId,
    environments
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPassed, setFilterPassed] = useState<'all' | 'passed' | 'failed'>('all');
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearDays, setClearDays] = useState(7);

  const projectHistory = history.filter((h) => h.projectId === selectedProjectId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const filteredHistory = projectHistory.filter((h) => {
    if (filterPassed === 'passed' && !h.passed) return false;
    if (filterPassed === 'failed' && h.passed) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        h.request.name.toLowerCase().includes(q) ||
        h.request.url.toLowerCase().includes(q) ||
        h.request.method.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getMethodTagClass = (method: string) => {
    const m = method.toUpperCase();
    if (m === 'GET') return 'tag-method-get';
    if (m === 'POST') return 'tag-method-post';
    if (m === 'PUT') return 'tag-method-put';
    if (m === 'DELETE') return 'tag-method-delete';
    return 'tag-method-other';
  };

  const handleReplayRequest = async (record: HistoryRecord) => {
    let targetReq = requests.find((r) => r.id === record.requestId);
    if (!targetReq) {
      targetReq = createRequest(selectedProjectId!, {
        name: record.request.name,
        method: record.request.method,
        url: record.request.url,
        params: record.request.params,
        headers: record.request.headers,
        body: record.request.body
      });
    }
    selectRequest(targetReq.id);
    setActiveTab('request');
  };

  const handleClearExpired = () => {
    clearExpiredHistory(clearDays);
    setShowClearModal(false);
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
        <h2>历史记录 ({filteredHistory.length}/{projectHistory.length})</h2>
        <div className="toolbar">
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              if (confirm('确定清除本项目所有历史记录？')) clearHistory(selectedProjectId!);
            }}
            disabled={projectHistory.length === 0}
          >
            清除全部
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setShowClearModal(true)}
            disabled={projectHistory.length === 0}
          >
            清理过期
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card">
          <div className="flex gap-3 items-center flex-wrap">
            <input
              type="text"
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="搜索请求名称、URL、方法..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="select"
              style={{ maxWidth: 140 }}
              value={filterPassed}
              onChange={(e) => setFilterPassed(e.target.value as any)}
            >
              <option value="all">全部结果</option>
              <option value="passed">仅通过</option>
              <option value="failed">仅失败</option>
            </select>
          </div>
        </div>

        <div className="grid-2" style={{ flex: 1, minHeight: 0 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>记录列表</h3>
            {filteredHistory.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 32 }}>
                暂无历史记录
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
                {filteredHistory.map((record) => (
                  <div
                    key={record.id}
                    className={`list-item ${selectedRecord?.id === record.id ? 'active' : ''}`}
                    style={{ padding: '8px 10px', cursor: 'pointer', marginBottom: 6 }}
                    onClick={() => setSelectedRecord(record)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`tag ${record.passed ? 'tag-success' : 'tag-error'}`}>
                        {record.passed ? '✓' : '✗'}
                      </span>
                      <span className={`tag ${getMethodTagClass(record.request.method)}`}>
                        {record.request.method}
                      </span>
                      <span className="truncate">{record.request.name}</span>
                      {record.response && (
                        <span className="tag">
                          {record.response.status}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="text-secondary text-sm">{formatDate(record.createdAt)}</span>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplayRequest(record);
                        }}
                      >
                        回放
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>
              {selectedRecord ? `详情: ${selectedRecord.request.name}` : '记录详情'}
            </h3>
            {!selectedRecord ? (
              <div className="text-center text-muted" style={{ padding: 32 }}>
                点击左侧查看历史记录详情
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`tag ${getMethodTagClass(selectedRecord.request.method)}`}>
                    {selectedRecord.request.method}
                  </span>
                  <span className={`tag ${selectedRecord.passed ? 'tag-success' : 'tag-error'}`}>
                    {selectedRecord.passed ? '✓ 通过' : '✗ 失败'}
                  </span>
                  {selectedRecord.response && (
                    <>
                      <span className="tag">
                        {selectedRecord.response.status} {selectedRecord.response.statusText}
                      </span>
                      <span className="tag tag-info">{formatTime(selectedRecord.response.time)}</span>
                      <span className="tag">{formatSize(selectedRecord.response.size)}</span>
                    </>
                  )}
                  <span className="text-secondary text-sm">{formatDate(selectedRecord.createdAt)}</span>
                </div>

                <div className="mb-3">
                  <strong className="text-sm">请求 URL</strong>
                  <div className="json-viewer mt-2 text-sm">{selectedRecord.request.url}</div>
                </div>

                {selectedRecord.request.headers.length > 0 && (
                  <div className="mb-3">
                    <strong className="text-sm">请求头</strong>
                    <pre className="json-viewer mt-2 text-sm">
                      {selectedRecord.request.headers
                        .filter((h) => h.enabled)
                        .map((h) => `${h.key}: ${h.value}`)
                        .join('\n')}
                    </pre>
                  </div>
                )}

                {selectedRecord.request.body.type !== 'none' && (
                  <div className="mb-3">
                    <strong className="text-sm">请求体 ({selectedRecord.request.body.type})</strong>
                    <pre className="json-viewer mt-2 text-sm">
                      {selectedRecord.request.body.type === 'json'
                        ? selectedRecord.request.body.json
                        : selectedRecord.request.body.type === 'raw'
                        ? selectedRecord.request.body.raw
                        : JSON.stringify(selectedRecord.request.body, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedRecord.response && (
                  <div>
                    <strong className="text-sm">响应 Body</strong>
                    <pre className="json-viewer mt-2" style={{ maxHeight: 250 }}>
                      {typeof selectedRecord.response.data === 'string'
                        ? selectedRecord.response.data
                        : JSON.stringify(selectedRecord.response.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showClearModal && (
        <Modal
          title="清理过期历史记录"
          onClose={() => setShowClearModal(false)}
          width={400}
          footer={
            <>
              <button className="btn" onClick={() => setShowClearModal(false)}>取消</button>
              <button className="btn btn-danger" onClick={handleClearExpired}>
                清理
              </button>
            </>
          }
        >
          <div className="form-row">
            <label>清理多少天以前的记录</label>
            <select
              className="select"
              value={clearDays}
              onChange={(e) => setClearDays(Number(e.target.value))}
            >
              <option value={1}>1 天前</option>
              <option value={3}>3 天前</option>
              <option value={7}>7 天前</option>
              <option value={30}>30 天前</option>
              <option value={90}>90 天前</option>
            </select>
          </div>
          <p className="text-secondary text-sm">
            此操作不可恢复，将永久删除 {clearDays} 天前的历史记录
          </p>
        </Modal>
      )}
    </div>
  );
};
