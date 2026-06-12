import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/store';
import { Modal } from '@/components/common/Modal';
import { compareResults, diffJson, diffText, DiffLine } from '@/services/diffService';
import { formatTime, formatSize, formatDate } from '@/utils';
import { RequestResult } from '@/types';

export const AssertionPanel: React.FC = () => {
  const {
    selectedProjectId,
    currentResults,
    snapshots,
    compareSnapshotId,
    compareResults: compareResultsState,
    setCompareSnapshot,
    updateResultFailureReason
  } = useAppStore();

  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [selectedCompareResultId, setSelectedCompareResultId] = useState<string | null>(null);
  const [showFailReasonModal, setShowFailReasonModal] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [diffTab, setDiffTab] = useState<'status' | 'headers' | 'body' | 'assertions'>('body');

  const projectSnapshots = snapshots.filter((s) => s.projectId === selectedProjectId);
  const selectedResult = currentResults.find((r) => r.id === selectedResultId);
  const selectedCompareResult = compareResultsState.find((r) => r.id === selectedCompareResultId);

  const comparison = useMemo(() => {
    if (!selectedResult || !selectedCompareResult) return null;
    return compareResults([selectedCompareResult], [selectedResult])[0];
  }, [selectedResult, selectedCompareResult]);

  const getMethodTagClass = (method: string) => {
    const m = method.toUpperCase();
    if (m === 'GET') return 'tag-method-get';
    if (m === 'POST') return 'tag-method-post';
    if (m === 'PUT') return 'tag-method-put';
    if (m === 'DELETE') return 'tag-method-delete';
    return 'tag-method-other';
  };

  const renderDiffLines = (lines: DiffLine[]) => {
    if (!lines || lines.length === 0) {
      return <div className="text-muted text-center" style={{ padding: 16 }}>无差异</div>;
    }
    return (
      <pre className="json-viewer" style={{ margin: 0, minHeight: 200 }}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.added ? 'diff-added' : line.removed ? 'diff-removed' : ''
            }
          >
            {line.added ? '+ ' : line.removed ? '- ' : '  '}
            {line.value}
          </div>
        ))}
      </pre>
    );
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
        <h2>断言 & 对比</h2>
        <div className="toolbar">
          <select
            className="select"
            style={{ minWidth: 200 }}
            value={compareSnapshotId || ''}
            onChange={(e) => setCompareSnapshot(e.target.value || null)}
          >
            <option value="">选择要对比的快照 (可选)</option>
            {projectSnapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} - {formatDate(s.createdAt)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid-2" style={{ flex: 1, minHeight: 0 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>
              当前结果 ({currentResults.length})
              {currentResults.length > 0 && (
                <span className="text-secondary text-sm" style={{ marginLeft: 8 }}>
                  通过率: {currentResults.filter((r) => r.passed).length}/{currentResults.length}
                </span>
              )}
            </h3>
            {currentResults.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 32 }}>
                还没有回放结果，请前往「回放队列」执行回放
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
                {currentResults.map((r) => (
                  <div
                    key={r.id}
                    className={`list-item ${selectedResultId === r.id ? 'active' : ''}`}
                    style={{ padding: '8px 10px', cursor: 'pointer', marginBottom: 6 }}
                    onClick={() => setSelectedResultId(r.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`tag ${r.passed ? 'tag-success' : 'tag-error'}`}>
                        {r.passed ? '✓' : '✗'}
                      </span>
                      <span className={`tag ${getMethodTagClass(r.request.method)}`}>
                        {r.request.method}
                      </span>
                      <span className="truncate">{r.request.name}</span>
                      {r.response && (
                        <span className="tag">
                          {r.response.status}
                        </span>
                      )}
                      {r.response && (
                        <span className="tag tag-info">
                          {formatTime(r.response.time)}
                        </span>
                      )}
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedResultId(r.id);
                        setFailReason(r.failureReason || '');
                        setShowFailReasonModal(true);
                      }}
                    >
                      {r.failureReason ? '编辑原因' : '标记失败原因'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>
              {compareSnapshotId ? `对比快照 (${compareResultsState.length})` : '对比快照'}
            </h3>
            {!compareSnapshotId ? (
              <div className="text-center text-muted" style={{ padding: 32 }}>
                请在上方选择一个历史快照进行对比
              </div>
            ) : compareResultsState.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 32 }}>
                该快照没有结果
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
                {compareResultsState.map((r) => (
                  <div
                    key={r.id}
                    className={`list-item ${selectedCompareResultId === r.id ? 'active' : ''}`}
                    style={{ padding: '8px 10px', cursor: 'pointer', marginBottom: 6 }}
                    onClick={() => setSelectedCompareResultId(r.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`tag ${r.passed ? 'tag-success' : 'tag-error'}`}>
                        {r.passed ? '✓' : '✗'}
                      </span>
                      <span className={`tag ${getMethodTagClass(r.request.method)}`}>
                        {r.request.method}
                      </span>
                      <span className="truncate">{r.request.name}</span>
                      {r.response && <span className="tag">{r.response.status}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {(selectedResult || selectedCompareResult) && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="flex justify-between items-center mb-3">
              <h3 style={{ fontSize: 13 }}>
                {comparison
                  ? `差异对比: ${selectedResult?.request.name}`
                  : selectedResult
                  ? `详情: ${selectedResult.request.name}`
                  : `详情: ${selectedCompareResult?.request.name}`}
              </h3>
              <div className="tabs-inline" style={{ margin: 0, border: 'none' }}>
                <div
                  className={`tab-inline ${diffTab === 'status' ? 'active' : ''}`}
                  onClick={() => setDiffTab('status')}
                >
                  状态
                </div>
                <div
                  className={`tab-inline ${diffTab === 'headers' ? 'active' : ''}`}
                  onClick={() => setDiffTab('headers')}
                >
                  Headers
                </div>
                <div
                  className={`tab-inline ${diffTab === 'body' ? 'active' : ''}`}
                  onClick={() => setDiffTab('body')}
                >
                  Body
                </div>
                <div
                  className={`tab-inline ${diffTab === 'assertions' ? 'active' : ''}`}
                  onClick={() => setDiffTab('assertions')}
                >
                  断言
                </div>
              </div>
            </div>

            {diffTab === 'body' && (
              comparison
                ? renderDiffLines(comparison.responseDiff.body || [])
                : (
                  <pre className="json-viewer" style={{ margin: 0, minHeight: 200 }}>
                    {typeof (selectedResult || selectedCompareResult)?.response?.data === 'string'
                      ? (selectedResult || selectedCompareResult)?.response?.data
                      : JSON.stringify((selectedResult || selectedCompareResult)?.response?.data, null, 2)}
                  </pre>
                )
            )}

            {diffTab === 'status' && (
              comparison
                ? renderDiffLines(comparison.responseDiff.status || [])
                : (
                  <div className="json-viewer" style={{ margin: 0, minHeight: 100 }}>
                    状态码: {(selectedResult || selectedCompareResult)?.response?.status || '无响应'}
                    {(selectedResult || selectedCompareResult)?.error && (
                      <div className="text-error" style={{ marginTop: 8 }}>
                        错误: {(selectedResult || selectedCompareResult)?.error}
                      </div>
                    )}
                  </div>
                )
            )}

            {diffTab === 'headers' && (
              comparison
                ? renderDiffLines(comparison.responseDiff.headers || [])
                : (
                  <pre className="json-viewer" style={{ margin: 0, minHeight: 200 }}>
                    {Object.entries((selectedResult || selectedCompareResult)?.response?.headers || {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n')}
                  </pre>
                )
            )}

            {diffTab === 'assertions' && (
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {comparison ? (
                  comparison.assertionDiffs.length === 0 ? (
                    <div className="text-muted text-center" style={{ padding: 24 }}>无断言</div>
                  ) : (
                    comparison.assertionDiffs.map((a, i) => (
                      <div key={i} className="list-item" style={{ marginBottom: 6 }}>
                        <div className="flex items-center gap-2 flex-1">
                          <span className={`tag ${a.newPassed ? 'tag-success' : 'tag-error'}`}>
                            当前: {a.newPassed ? 'PASS' : 'FAIL'}
                          </span>
                          {a.oldPassed !== undefined && (
                            <span className={`tag ${a.oldPassed ? 'tag-success' : 'tag-error'}`}>
                              历史: {a.oldPassed ? 'PASS' : 'FAIL'}
                            </span>
                          )}
                          <strong>{a.name}</strong>
                          {a.oldPassed !== a.newPassed && (
                            <span className="tag tag-warning">状态变更</span>
                          )}
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  (selectedResult || selectedCompareResult)?.assertionResults.length === 0 ? (
                    <div className="text-muted text-center" style={{ padding: 24 }}>无断言</div>
                  ) : (
                    (selectedResult || selectedCompareResult)?.assertionResults.map((a) => (
                      <div key={a.assertionId} className="list-item" style={{ marginBottom: 6 }}>
                        <div className="flex items-center gap-2 flex-1">
                          <span className={`tag ${a.passed ? 'tag-success' : 'tag-error'}`}>
                            {a.passed ? '✓ PASS' : '✗ FAIL'}
                          </span>
                          <strong>{a.name}</strong>
                        </div>
                        <div className="text-sm text-secondary">{a.message}</div>
                      </div>
                    ))
                  )
                )}
              </div>
            )}

            {selectedResult && selectedResult.failureReason && (
              <div className="mt-3">
                <span className="tag tag-warning">失败原因</span>
                <div className="mt-2 text-sm" style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                  {selectedResult.failureReason}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showFailReasonModal && (
        <Modal
          title="标记失败原因"
          onClose={() => setShowFailReasonModal(false)}
          width={500}
          footer={
            <>
              <button className="btn" onClick={() => setShowFailReasonModal(false)}>取消</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (selectedResultId) {
                    updateResultFailureReason(selectedResultId, failReason);
                  }
                  setShowFailReasonModal(false);
                }}
              >
                保存
              </button>
            </>
          }
        >
          <div className="form-row">
            <label>失败原因描述</label>
            <textarea
              className="textarea"
              style={{ minHeight: 120 }}
              placeholder="请描述失败原因，例如：后端返回码异常、数据结构变更、网络超时等"
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
            />
          </div>
          <div>
            <label className="text-secondary text-sm">常用原因（点击填入）：</label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {['后端 Bug', '接口变更未同步', '测试数据问题', '网络超时', '鉴权失败', '参数错误'].map(
                (r) => (
                  <button
                    key={r}
                    className="btn btn-sm"
                    onClick={() => setFailReason(failReason ? `${failReason}；${r}` : r)}
                  >
                    {r}
                  </button>
                )
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
