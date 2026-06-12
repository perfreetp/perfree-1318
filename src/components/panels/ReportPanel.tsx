import React, { useState, useRef } from 'react';
import { useAppStore } from '@/store';
import { Modal } from '@/components/common/Modal';
import { formatTime, formatSize, formatDate } from '@/utils';
import { RequestResult, ReplaySnapshot, ReplayConfig, OfflineReport } from '@/types';
import { replayEngine } from '@/services/replayEngine';

export const ReportPanel: React.FC = () => {
  const {
    selectedProjectId,
    currentResults,
    snapshots,
    saveSnapshot,
    deleteSnapshot,
    replayConfig,
    environments,
    selectedEnvironmentId,
    setReplayConfig,
    importedReport,
    importOfflineReport,
    clearImportedReport
  } = useAppStore();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [viewingSnapshot, setViewingSnapshot] = useState<ReplaySnapshot | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const [showExportReportModal, setShowExportReportModal] = useState(false);
  const [exportReportName, setExportReportName] = useState('');
  const [exportReportDesc, setExportReportDesc] = useState('');
  const [showImportError, setShowImportError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectSnapshots = snapshots.filter((s) => s.projectId === selectedProjectId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const allResults = importedReport
    ? importedReport.results
    : viewingSnapshot
    ? viewingSnapshot.results
    : currentResults;
  const displayConfig = viewingSnapshot
    ? viewingSnapshot.config
    : replayConfig;
  const displayResults = replayEngine.filterResultsByStatus(allResults, displayConfig.statusFilter);
  const selectedResult = displayResults.find((r) => r.id === selectedResultId);

  const totalPassed = allResults.filter((r) => r.passed).length;
  const totalFailed = allResults.length - totalPassed;
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
    lines.push(`- 总请求数: ${allResults.length}`);
    lines.push(`- 通过: ${totalPassed}`);
    lines.push(`- 失败: ${totalFailed}`);
    lines.push(`- 通过率: ${allResults.length > 0 ? ((totalPassed / allResults.length) * 100).toFixed(1) : 0}%`);
    lines.push(`- 平均响应时间: ${formatTime(avgTime)}`);
    lines.push(`- 当前筛选: ${displayConfig.statusFilter} (仅展示，不影响数据)`);
    lines.push('');
    lines.push('## 回放配置');
    lines.push(`- 并发数: ${displayConfig.concurrency}`);
    lines.push(`- 请求间隔: ${displayConfig.interval}ms`);
    lines.push(`- 结果筛选: ${displayConfig.statusFilter}`);
    lines.push(`- 串联变量: ${displayConfig.extractPrevious ? '是' : '否'}`);
    lines.push(`- 遇错即停: ${displayConfig.stopOnFailure ? '是' : '否'}`);
    lines.push('');
    lines.push('## 详细结果 (全部)');
    lines.push('');
    lines.push('| # | 结果 | 方法 | 名称 | 状态码 | 耗时 | 断言 | 失败原因 |');
    lines.push('|---|------|------|------|--------|------|------|----------|');
    allResults.forEach((r, i) => {
      const assertPass = r.assertionResults.filter((a) => a.passed).length;
      const assertTotal = r.assertionResults.length;
      lines.push(
        `| ${i + 1} | ${r.passed ? '✓ 通过' : '✗ 失败'} | ${r.request.method} | ${r.request.name} | ${
          r.response?.status || 'ERR'
        } | ${formatTime(r.response?.time || 0)} | ${assertPass}/${assertTotal} | ${r.failureReason || '-'} |`
      );
    });
    lines.push('');
    lines.push('## 失败详情');
    allResults
      .filter((r) => !r.passed)
      .forEach((r) => {
        lines.push(`### ${r.request.method} ${r.request.name}`);
        lines.push(`- URL: ${r.request.url}`);
        if (r.actualRequest) {
          lines.push(`- 实际URL: ${r.actualRequest.url}`);
          if (r.actualRequest.bodyRaw) {
            lines.push('```json');
            lines.push(r.actualRequest.bodyRaw);
            lines.push('```');
          }
        }
        if (r.failureReason) lines.push(`- 失败原因: ${r.failureReason}`);
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
      filter: displayConfig.statusFilter,
      totalCount: allResults.length,
      filteredCount: displayResults.length,
      results: allResults
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

  const handleOpenExportReportModal = () => {
    const defaultName = `回放报告-${formatDate(Date.now()).replace(/[\/\s:]/g, '-')}`;
    setExportReportName(defaultName);
    setExportReportDesc('');
    setShowExportReportModal(true);
  };

  const handleExportOfflineReport = async () => {
    if (!exportReportName.trim()) return;

    const report: OfflineReport = {
      version: '1.0.0',
      exportedAt: Date.now(),
      environmentName: importedReport ? importedReport.environmentName : currentEnv?.name,
      config: importedReport ? importedReport.config : displayConfig,
      name: exportReportName.trim(),
      description: exportReportDesc.trim() || undefined,
      results: allResults
    };

    const content = JSON.stringify(report, null, 2);
    const filename = `${exportReportName.trim()}.report.json`;

    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.saveFile(
          filename,
          content,
          [{ name: 'API 回放报告', extensions: ['report.json', 'json'] }]
        );
      } else {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setShowExportReportModal(false);
    }
  };

  const handleImportOfflineReport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as OfflineReport;

      if (!data.version || !data.results || !Array.isArray(data.results)) {
        throw new Error('文件格式不正确：缺少 version 或 results 字段');
      }

      importOfflineReport(data);
      setViewingSnapshot(null);
      setSelectedResultId(null);
      setShowImportError('');
    } catch (e: any) {
      setShowImportError(e.message || '文件解析失败');
    }
  };

  const handleTriggerImportFile = () => {
    setShowImportError('');
    fileInputRef.current?.click();
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
          结果报告{' '}
          {importedReport
            ? ` - 导入报告: ${importedReport.name}`
            : viewingSnapshot
            ? ` - 查看快照: ${viewingSnapshot.name}`
            : ''}
        </h2>
        <div className="toolbar">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.report.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportOfflineReport(file);
              e.target.value = '';
            }}
          />
          {!importedReport && !viewingSnapshot && (
            <select
              className="select"
              style={{ width: 140 }}
              value={displayConfig.statusFilter}
              onChange={(e) => setReplayConfig({ statusFilter: e.target.value as ReplayConfig['statusFilter'] })}
              disabled={currentResults.length === 0}
            >
              <option value="all">全部结果</option>
              <option value="passed">仅通过</option>
              <option value="failed">仅失败</option>
              <option value="2xx">2xx</option>
              <option value="3xx">3xx</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
            </select>
          )}
          {importedReport && (
            <button className="btn" onClick={() => { clearImportedReport(); setSelectedResultId(null); }}>
              ← 退出导入报告
            </button>
          )}
          {viewingSnapshot && (
            <button className="btn" onClick={() => { setViewingSnapshot(null); setSelectedResultId(null); }}>
              ← 返回当前结果
            </button>
          )}
          <button className="btn" onClick={handleTriggerImportFile}>
            📥 导入报告
          </button>
          {!importedReport && !viewingSnapshot && currentResults.length > 0 && (
            <button className="btn" onClick={() => { setSnapshotName(`回放快照 ${formatDate(Date.now())}`); setShowSaveModal(true); }}>
              💾 保存快照
            </button>
          )}
          {allResults.length > 0 && (
            <>
              <button className="btn" onClick={handleOpenExportReportModal}>
                � 导出离线报告
              </button>
              <button className="btn" onClick={handleExportReport}>
                📄 导出 Markdown
              </button>
              <button className="btn" onClick={handleExportJson}>
                � 导出 JSON
              </button>
            </>
          )}
        </div>
      </div>

      {importedReport && (
        <div style={{ padding: '8px 16px', background: 'rgba(56, 139, 253, 0.1)', borderBottom: '1px solid var(--border-color)' }}>
          <span className="tag tag-info">导入报告</span>
          <span className="text-sm" style={{ marginLeft: 8 }}>
            {importedReport.name}
            {importedReport.description && ` - ${importedReport.description}`}
          </span>
          <span className="text-secondary text-sm" style={{ marginLeft: 12 }}>
            导出时间: {formatDate(importedReport.exportedAt)}
          </span>
          {importedReport.environmentName && (
            <span className="text-secondary text-sm" style={{ marginLeft: 12 }}>
              环境: {importedReport.environmentName}
            </span>
          )}
        </div>
      )}

      {showImportError && (
        <div style={{ padding: '8px 16px', background: 'rgba(248, 81, 73, 0.1)', color: '#f85149', borderBottom: '1px solid var(--border-color)' }}>
          ⚠ 导入失败: {showImportError}
        </div>
      )}

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid-4">
          <div className="stat-card">
            <div className="value">{allResults.length}</div>
            <div className="label">总请求数</div>
            {displayResults.length !== allResults.length && (
              <div className="text-xs text-secondary mt-1">显示 {displayResults.length} 条</div>
            )}
          </div>
          <div className="stat-card">
            <div className="value text-success">{totalPassed}</div>
            <div className="label">通过</div>
          </div>
          <div className="stat-card">
            <div className="value text-error">{totalFailed}</div>
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
                        <td className="truncate">
                          {r.request.name}
                          {r.failureReason && (
                            <span className="tag tag-warning" style={{ marginLeft: 6 }}>
                              ⚑ {r.failureReason}
                            </span>
                          )}
                        </td>
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
                  {selectedResult.failureReason && (
                    <span className="tag tag-warning">⚑ {selectedResult.failureReason}</span>
                  )}
                </div>

                {selectedResult.actualRequest && (
                  <div className="mb-3">
                    <strong className="text-sm">实际发送请求</strong>
                    <div className="mt-2">
                      <div className="text-sm mb-1">
                        <span className="text-secondary">URL: </span>
                        {selectedResult.actualRequest.url}
                      </div>
                      <div className="text-sm mb-1">
                        <span className="text-secondary">Method: </span>
                        {selectedResult.actualRequest.method}
                      </div>
                      {selectedResult.actualRequest.bodyRaw && (
                        <div>
                          <span className="text-secondary text-sm">Body: </span>
                          <pre className="json-viewer mt-1" style={{ maxHeight: 150, fontSize: 12 }}>
                            {selectedResult.actualRequest.bodyRaw}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedResult.failureReason && (
                  <div className="mb-3">
                    <strong className="text-sm">失败原因</strong>
                    <div className="mt-2 text-sm" style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                      {selectedResult.failureReason}
                    </div>
                  </div>
                )}

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

      {showExportReportModal && (
        <Modal
          title="导出离线报告包"
          onClose={() => setShowExportReportModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowExportReportModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleExportOfflineReport}>导出</button>
            </>
          }
        >
          <div className="form-row">
            <label>报告名称</label>
            <input
              type="text"
              className="input"
              value={exportReportName}
              onChange={(e) => setExportReportName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>描述（可选）</label>
            <textarea
              className="input"
              style={{ minHeight: 80, resize: 'vertical' }}
              value={exportReportDesc}
              onChange={(e) => setExportReportDesc(e.target.value)}
              placeholder="添加报告说明，例如回归测试版本、问题说明等..."
            />
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
            <div className="text-sm text-secondary mb-2">导出内容：</div>
            <div className="text-sm">
              • {allResults.length} 条请求结果（含请求/响应/断言）
            </div>
            <div className="text-sm">
              • 环境: {importedReport ? importedReport.environmentName : currentEnv?.name || '未选择'}
            </div>
            <div className="text-sm">
              • 失败原因
            </div>
            <div className="text-sm">
              • 回放配置
            </div>
          </div>
          <p className="text-secondary text-sm mt-3">
            导出后生成 .report.json 文件，可分享给他人在工具中导入查看
          </p>
        </Modal>
      )}
    </div>
  );
};
