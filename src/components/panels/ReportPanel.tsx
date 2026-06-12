import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { Modal } from '@/components/common/Modal';
import { formatTime, formatSize, formatDate } from '@/utils';
import { RequestResult, ReplaySnapshot } from '@/types';

export const ReportPanel: React.FC = () => {
  const {
    selectedProjectId,
    currentResults,
    snapshots,
    saveSnapshot,
    deleteSnapshot,
    replayConfig,
    environments,
    selectedEnvironmentId
  } = useAppStore();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [viewingSnapshot, setViewingSnapshot] = useState<ReplaySnapshot | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const projectSnapshots = snapshots.filter((s) => s.projectId === selectedProjectId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const displayResults = viewingSnapshot ? viewingSnapshot.results : currentResults;
  const displayConfig = viewingSnapshot ? viewingSnapshot.config : replayConfig;
  const selectedResult = displayResults.find((r) => r.id === selectedResultId);

  const passed = displayResults.filter((r) => r.passed).length;
  const failed = displayResults.length - passed;
  const avgTime =
    displayResults.length > 0
      ? Math.round(
          displayResults.reduce((sum, r) => sum + (r.response?.time || 0), 0) / displayResults.length
        )
      : 0;

  const getMethodTagClass = (method: string) => {
    const m = method.toUpperCase();
    if (m === 'GET') return 'tag-method-get';
    if (m === 'POST') return 'tag-method-post';
    if (m === 'PUT') return 'tag-method-put';
    if (m === 'DELETE') return 'tag-method-delete';
    return 'tag-method-other';
  };

  const handleSaveSnapshot = () => {
    if (!snapshotName.trim() || !selectedProjectId) return;
    saveSnapshot(snapshotName.trim(), selectedProjectId, currentResults);
    setSnapshotName('');
    setShowSaveModal(false);
  };

  const generateReport = () => {
    const lines: string[] = [];
    lines.push('# API 回放报告');
    lines.push('');
    lines.push(`生成时间: ${formatDate(Date.now())}`);
    lines.push(`环境: ${currentEnv?.name || '未选择'}`);
    lines.push('');
    lines.push('## 概览');
    lines.push(`- 总请求数: ${displayResults.length}`);
    lines.push(`- 通过: ${passed}`);
    lines.push(`- 失败: ${failed}`);
    lines.push(`- 通过率: ${displayResults.length > 0 ? ((passed / displayResults.length) * 100).toFixed(1) : 0}%`);
    lines.push(`- 平均响应时间: ${formatTime(avgTime)}`);
    lines.push('');
    lines.push('## 回放配置');
    lines.push(`- 并发数: ${displayConfig.concurrency}`);
    lines.push(`- 请求间隔: ${displayConfig.interval}ms`);
    lines.push(`- 结果筛选: ${displayConfig.statusFilter}`);
    lines.push(`- 串联变量: ${displayConfig.extractPrevious ? '是' : '否'}`);
    lines.push(`- 遇错即停: ${displayConfig.stopOnFailure ? '是' : '否'}`);
    lines.push('');
    lines.push('## 详细结果');
    lines.push('');
    lines.push('| # | 结果 | 方法 | 名称 | 状态码 | 耗时 | 断言 |');
    lines.push('|---|------|------|------|--------|------|------|');
    displayResults.forEach((r, i) => {
      const assertPass = r.assertionResults.filter((a) => a.passed).length;
      const assertTotal = r.assertionResults.length;
      lines.push(
        `| ${i + 1} | ${r.passed ? '✓ 通过' : '✗ 失败'} | ${r.request.method} | ${r.request.name} | ${
          r.response?.status || 'ERR'
        } | ${formatTime(r.response?.time || 0)} | ${assertPass}/${assertTotal} |`
      );
    });
    lines.push('');
    lines.push('## 失败详情');
    displayResults
      .filter((r) => !r.passed)
      .forEach((r) => {
        lines.push(`### ${r.request.method} ${r.request.name}`);
        lines.push(`- URL: ${r.request.url}`);
        if (r.error) lines.push(`- 错误: ${r.error}`);
        if (r.response) lines.push(`- 状态码: ${r.response.status} ${r.response.statusText}`);
        r.assertionResults
          .filter((a) => !a.passed)
          .forEach((a) => {
            lines.push(`  - 断言失败 [${a.name}]: ${a.message}`);
          });
        lines.push('');
      });

    return lines.join('\n');
  };

  const handleExportReport = async () => {
    const content = generateReport();
    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.saveFile(
          `api-replay-report-${Date.now()}.md`,
          content,
          [{ name: 'Markdown', extensions: ['md'] }]
        );
      } else {
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-replay-report-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportJson = async () => {
    const data = {
      exportedAt: Date.now(),
      environment: currentEnv?.name,
      config: displayConfig,
      results: displayResults
    };
    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.saveFile(
          `api-replay-results-${Date.now()}.json`,
          JSON.stringify(data, null, 2),
          [{ name: 'JSON', extensions: ['json'] }]
        );
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-replay-results-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    }
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
        <h2>
          结果报告 {viewingSnapshot ? ` - 查看快照: ${viewingSnapshot.name}` : ''}
        </h2>
        <div className="toolbar">
          {viewingSnapshot && (
            <button className="btn" onClick={() => { setViewingSnapshot(null); setSelectedResultId(null); }}>
              ← 返回当前结果
            </button>
          )}
          {!viewingSnapshot && currentResults.length > 0 && (
            <button className="btn" onClick={() => { setSnapshotName(`回放快照 ${formatDate(Date.now())}`); setShowSaveModal(true); }}>
              💾 保存快照
            </button>
          )}
          {displayResults.length > 0 && (
            <>
              <button className="btn" onClick={handleExportReport}>
                📄 导出报告
              </button>
              <button className="btn" onClick={handleExportJson}>
                📦 导出 JSON
              </button>
            </>
          )}
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid-4">
          <div className="stat-card">
            <div className="value">{displayResults.length}</div>
            <div className="label">总请求数</div>
          </div>
          <div className="stat-card">
            <div className="value text-success">{passed}</div>
            <div className="label">通过</div>
          </div>
          <div className="stat-card">
            <div className="value text-error">{failed}</div>
            <div className="label">失败</div>
          </div>
          <div className="stat-card">
            <div className="value text-info">{formatTime(avgTime)}</div>
            <div className="label">平均耗时</div>
          </div>
        </div>

        <div className="grid-2" style={{ flex: 1, minHeight: 0 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>
              {viewingSnapshot ? '快照请求结果' : '当前回放结果'} ({displayResults.length})
            </h3>
            {displayResults.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 32 }}>
                暂无回放结果
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
                <table className="kvp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th style={{ width: 50 }}>结果</th>
                      <th style={{ width: 70 }}>方法</th>
                      <th>名称</th>
                      <th style={{ width: 70 }}>状态</th>
                      <th style={{ width: 80 }}>耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayResults.map((r, i) => (
                      <tr
                        key={r.id}
                        className={selectedResultId === r.id ? 'active' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedResultId(r.id)}
                      >
                        <td className="text-center">{i + 1}</td>
                        <td className="text-center">
                          <span className={`tag ${r.passed ? 'tag-success' : 'tag-error'}`}>
                            {r.passed ? '✓' : '✗'}
                          </span>
                        </td>
                        <td>
                          <span className={`tag ${getMethodTagClass(r.request.method)}`}>{r.request.method}</span>
                        </td>
                        <td className="truncate">{r.request.name}</td>
                        <td className="text-center">
                          {r.response ? r.response.status : <span className="text-error">ERR</span>}
                        </td>
                        <td className="text-center">{formatTime(r.response?.time || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>
              {selectedResult ? `请求详情: ${selectedResult.request.name}` : '请求详情'}
            </h3>
            {!selectedResult ? (
              <div className="text-center text-muted" style={{ padding: 32 }}>
                点击左侧列表查看详情
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
                <div className="mb-3">
                  <span className={`tag ${getMethodTagClass(selectedResult.request.method)}`}>
                    {selectedResult.request.method}
                  </span>
                  <span style={{ marginLeft: 8 }} className="text-secondary">
                    {selectedResult.request.url}
                  </span>
                </div>

                <div className="flex gap-2 mb-3 flex-wrap">
                  {selectedResult.passed ? (
                    <span className="tag tag-success">✓ 整体通过</span>
                  ) : (
                    <span className="tag tag-error">✗ 整体失败</span>
                  )}
                  {selectedResult.response && (
                    <>
                      <span
                        className={`tag ${
                          selectedResult.response.status >= 200 && selectedResult.response.status < 300
                            ? 'tag-success'
                            : selectedResult.response.status >= 400
                            ? 'tag-error'
                            : 'tag-warning'
                        }`}
                      >
                        {selectedResult.response.status} {selectedResult.response.statusText}
                      </span>
                      <span className="tag tag-info">{formatTime(selectedResult.response.time)}</span>
                      <span className="tag">{formatSize(selectedResult.response.size)}</span>
                    </>
                  )}
                  {selectedResult.error && <span className="tag tag-error">{selectedResult.error}</span>}
                </div>

                <div className="mb-3">
                  <strong className="text-sm">断言 ({selectedResult.assertionResults.filter((a) => a.passed).length}/{selectedResult.assertionResults.length})</strong>
                  <div className="mt-2">
                    {selectedResult.assertionResults.length === 0 ? (
                      <span className="text-muted text-sm">无断言</span>
                    ) : (
                      selectedResult.assertionResults.map((a) => (
                        <div key={a.assertionId} className="list-item" style={{ padding: '6px 10px', marginBottom: 4 }}>
                          <div className="flex items-center gap-2 flex-1">
                            <span className={`tag ${a.passed ? 'tag-success' : 'tag-error'}`}>
                              {a.passed ? '✓' : '✗'}
                            </span>
                            <span className="text-sm">{a.name}</span>
                          </div>
                          <span className="text-secondary text-sm">{a.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <strong className="text-sm">响应 Body</strong>
                  <pre className="json-viewer mt-2" style={{ maxHeight: 200 }}>
                    {selectedResult.response
                      ? typeof selectedResult.response.data === 'string'
                        ? selectedResult.response.data
                        : JSON.stringify(selectedResult.response.data, null, 2)
                      : '无响应数据'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {!viewingSnapshot && (
          <div className="card">
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>历史快照 ({projectSnapshots.length})</h3>
            {projectSnapshots.length === 0 ? (
              <div className="text-muted text-center" style={{ padding: 16 }}>暂无快照</div>
            ) : (
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                <table className="kvp-table">
                  <thead>
                    <tr>
                      <th>快照名称</th>
                      <th>创建时间</th>
                      <th>请求数</th>
                      <th>通过</th>
                      <th>失败</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectSnapshots.map((s) => {
                      const sPassed = s.results.filter((r) => r.passed).length;
                      return (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td>{formatDate(s.createdAt)}</td>
                          <td className="text-center">{s.results.length}</td>
                          <td className="text-center text-success">{sPassed}</td>
                          <td className="text-center text-error">{s.results.length - sPassed}</td>
                          <td className="text-center">
                            <button className="btn btn-sm" onClick={() => { setViewingSnapshot(s); setSelectedResultId(null); }}>
                              查看
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                if (confirm('确定删除此快照？')) deleteSnapshot(s.id);
                              }}
                              style={{ marginLeft: 4 }}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showSaveModal && (
        <Modal
          title="保存回放快照"
          onClose={() => setShowSaveModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowSaveModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSaveSnapshot}>保存</button>
            </>
          }
        >
          <div className="form-row">
            <label>快照名称</label>
            <input
              type="text"
              className="input"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              autoFocus
            />
          </div>
          <p className="text-secondary text-sm">
            将保存 {currentResults.length} 条请求结果，供后续对比分析
          </p>
        </Modal>
      )}
    </div>
  );
};
