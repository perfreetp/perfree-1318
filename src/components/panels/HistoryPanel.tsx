import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/store';
import { Modal } from '@/components/common/Modal';
import { KeyValueEditor } from '@/components/common/KeyValueEditor';
import { formatTime, formatSize, formatDate, formatDateTimeShort, generateId } from '@/utils';
import { HistoryRecord, RequestResult, HistoryFilterType, ApiRequest, KeyValuePair, AssertionResult } from '@/types';
import { sendRequest, collectVariables } from '@/services/httpService';
import { runAssertions } from '@/services/assertionService';
import { diffJson, diffText, DiffLine } from '@/services/diffService';

type DetailTabType = 'detail' | 'requestHistory' | 'compare' | 'trend';
type RerunBodyType = 'none' | 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded';

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
    environments,
    addHistory,
    updateHistoryFailureReason,
    setCurrentResults
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<HistoryFilterType>('all');
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearDays, setClearDays] = useState(7);
  const [detailTab, setDetailTab] = useState<DetailTabType>('detail');

  const [isEditingReason, setIsEditingReason] = useState(false);
  const [editingReason, setEditingReason] = useState('');

  const [compareMode, setCompareMode] = useState(false);
  const [compareRecordIds, setCompareRecordIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareTab, setCompareTab] = useState<'request' | 'status' | 'body' | 'assertions'>('body');

  const [isReplaying, setIsReplaying] = useState(false);

  const [showRerunModal, setShowRerunModal] = useState(false);
  const [rerunRecord, setRerunRecord] = useState<HistoryRecord | null>(null);
  const [rerunEnvId, setRerunEnvId] = useState<string>('');
  const [rerunHeaders, setRerunHeaders] = useState<KeyValuePair[]>([]);
  const [rerunBodyType, setRerunBodyType] = useState<RerunBodyType>('none');
  const [rerunBodyJson, setRerunBodyJson] = useState('');
  const [rerunBodyRaw, setRerunBodyRaw] = useState('');
  const [rerunBodyFormData, setRerunBodyFormData] = useState<KeyValuePair[]>([]);
  const [rerunBodyUrlEncoded, setRerunBodyUrlEncoded] = useState<KeyValuePair[]>([]);

  const projectHistory = history.filter((h) => h.projectId === selectedProjectId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const filterHistoryRecords = (records: HistoryRecord[], filter: HistoryFilterType): HistoryRecord[] => {
    switch (filter) {
      case 'all':
        return records;
      case 'passed':
        return records.filter((h) => h.passed === true);
      case 'failed':
        return records.filter((h) => h.passed === false);
      case '2xx':
        return records.filter((h) => h.response && h.response.status >= 200 && h.response.status < 300);
      case '3xx':
        return records.filter((h) => h.response && h.response.status >= 300 && h.response.status < 400);
      case '4xx':
        return records.filter((h) => h.response && h.response.status >= 400 && h.response.status < 500);
      case '5xx':
        return records.filter((h) => h.response && h.response.status >= 500 && h.response.status < 600);
      default:
        return records;
    }
  };

  const filteredHistory = useMemo(() => {
    let result = projectHistory;
    result = filterHistoryRecords(result, filterType);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((h) =>
        h.request.name.toLowerCase().includes(q) ||
        h.request.url.toLowerCase().includes(q) ||
        h.request.method.toLowerCase().includes(q)
      );
    }
    return result;
  }, [projectHistory, filterType, searchQuery]);

  const sameRequestHistory = useMemo(() => {
    if (!selectedRecord?.requestId) return [];
    return projectHistory
      .filter((h) => h.requestId === selectedRecord.requestId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [selectedRecord, projectHistory]);

  const sameRequestHistoryAsc = useMemo(() => {
    return [...sameRequestHistory].sort((a, b) => a.createdAt - b.createdAt);
  }, [sameRequestHistory]);

  const compareRecords = useMemo(() => {
    if (compareRecordIds.length !== 2) return [null, null];
    const record1 = projectHistory.find((h) => h.id === compareRecordIds[0]);
    const record2 = projectHistory.find((h) => h.id === compareRecordIds[1]);
    return [record1 || null, record2 || null];
  }, [compareRecordIds, projectHistory]);

  const trendStats = useMemo(() => {
    if (sameRequestHistoryAsc.length === 0) {
      return null;
    }
    const total = sameRequestHistoryAsc.length;
    const passedCount = sameRequestHistoryAsc.filter((h) => h.passed).length;
    const failedCount = total - passedCount;
    const passRate = total > 0 ? ((passedCount / total) * 100).toFixed(1) : '0';

    const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'no-response': 0 };
    let maxTime = 0;
    const failureReasons: Record<string, number> = {};

    sameRequestHistoryAsc.forEach((h) => {
      if (h.response) {
        const s = h.response.status;
        if (s >= 200 && s < 300) statusCounts['2xx']++;
        else if (s >= 300 && s < 400) statusCounts['3xx']++;
        else if (s >= 400 && s < 500) statusCounts['4xx']++;
        else if (s >= 500 && s < 600) statusCounts['5xx']++;
        if (h.response.time > maxTime) maxTime = h.response.time;
      } else {
        statusCounts['no-response']++;
      }
      if (h.failureReason) {
        failureReasons[h.failureReason] = (failureReasons[h.failureReason] || 0) + 1;
      }
    });

    const statusTotal = total;
    const timePercent = (time: number) => (maxTime > 0 ? (time / maxTime) * 100 : 0);

    const sortedFailureReasons = Object.entries(failureReasons).sort((a, b) => b[1] - a[1]);

    return {
      total,
      passedCount,
      failedCount,
      passRate,
      statusCounts,
      statusTotal,
      maxTime,
      timePercent,
      failureReasons: sortedFailureReasons
    };
  }, [sameRequestHistoryAsc]);

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

  const handleOpenRerunModal = (record: HistoryRecord) => {
    setRerunRecord(record);
    setRerunEnvId(selectedEnvironmentId || environments[0]?.id || '');
    setRerunHeaders(record.request.headers.filter((h) => h.enabled).map((h) => ({ ...h })));
    const rawBodyType = record.request.body.type;
    const bodyType: RerunBodyType = rawBodyType === 'binary' ? 'raw' : (rawBodyType as RerunBodyType) || 'none';
    setRerunBodyType(bodyType);
    setRerunBodyJson(record.request.body.json || '');
    setRerunBodyRaw(record.request.body.raw || '');
    setRerunBodyFormData((record.request.body.formData || []).map((h) => ({ ...h })));
    setRerunBodyUrlEncoded((record.request.body.urlEncoded || []).map((h) => ({ ...h })));
    setShowRerunModal(true);
  };

  const handleConfirmRerun = async () => {
    if (!rerunRecord || isReplaying) return;
    setIsReplaying(true);

    try {
      const targetEnv = environments.find((e) => e.id === rerunEnvId);
      const envVars = targetEnv?.variables || [];
      const variables = collectVariables(envVars);

      const newBody: ApiRequest['body'] = {
        type: rerunBodyType,
        json: rerunBodyType === 'json' ? rerunBodyJson : undefined,
        raw: rerunBodyType === 'raw' ? rerunBodyRaw : undefined,
        formData: rerunBodyType === 'form-data' ? rerunBodyFormData : undefined,
        urlEncoded: rerunBodyType === 'x-www-form-urlencoded' ? rerunBodyUrlEncoded : undefined
      };

      const modifiedRequest: ApiRequest = {
        ...rerunRecord.request,
        headers: rerunHeaders,
        body: newBody
      };

      const sendResult = await sendRequest(modifiedRequest, variables);
      const { response, error, bodyParseError, actualRequest } = sendResult;

      const assertionResults = response ? runAssertions(response, modifiedRequest.assertions || []) : [];

      let passed = true;
      if (error || bodyParseError) {
        passed = false;
      } else if (assertionResults.length > 0) {
        passed = assertionResults.every((a) => a.passed);
      }

      const resultId = generateId();
      const requestResult: RequestResult = {
        id: resultId,
        requestId: rerunRecord.requestId || '',
        request: modifiedRequest,
        actualRequest,
        response,
        error,
        assertionResults,
        extractedVariables: {},
        passed,
        startTime: Date.now(),
        endTime: Date.now() + (response?.time || 0)
      };

      setCurrentResults([requestResult]);

      addHistory({
        projectId: selectedProjectId!,
        requestId: rerunRecord.requestId,
        resultId,
        request: modifiedRequest,
        actualRequest,
        response,
        passed,
        sourceHistoryId: rerunRecord.id
      });

      setActiveTab('report');
      setShowRerunModal(false);
      setRerunRecord(null);
    } catch (e: any) {
      console.error('复跑失败:', e);
    } finally {
      setIsReplaying(false);
    }
  };

  const handleClearExpired = () => {
    clearExpiredHistory(clearDays);
    setShowClearModal(false);
  };

  const handleSelectRecord = (record: HistoryRecord) => {
    setSelectedRecord(record);
    setDetailTab('detail');
    setCompareMode(false);
    setCompareRecordIds([]);
  };

  const handleEditReason = () => {
    if (!selectedRecord) return;
    setEditingReason(selectedRecord.failureReason || '');
    setIsEditingReason(true);
  };

  const handleSaveReason = () => {
    if (!selectedRecord) return;
    updateHistoryFailureReason(selectedRecord.id, editingReason.trim());
    setIsEditingReason(false);
    setSelectedRecord((prev) => (prev ? { ...prev, failureReason: editingReason.trim() } : null));
  };

  const handleToggleCompareSelect = (recordId: string) => {
    if (!compareMode) return;

    setCompareRecordIds((prev) => {
      if (prev.includes(recordId)) {
        return prev.filter((id) => id !== recordId);
      }
      if (prev.length < 2) {
        return [...prev, recordId];
      }
      return [prev[1], recordId];
    });
  };

  const handleStartCompare = () => {
    if (compareRecordIds.length === 2) {
      setShowCompareModal(true);
    }
  };

  const renderDiffLines = (lines: DiffLine[]) => {
    return (
      <pre className="json-viewer" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {lines.map((line, idx) => (
          <div
            key={idx}
            style={{
              background: line.added ? 'rgba(46, 160, 67, 0.15)' : line.removed ? 'rgba(248, 81, 73, 0.15)' : 'transparent',
              padding: '0 4px',
              color: line.added ? '#2ea043' : line.removed ? '#f85149' : 'inherit'
            }}
          >
            {line.added ? '+ ' : line.removed ? '- ' : '  '}
            {line.value}
          </div>
        ))}
      </pre>
    );
  };

  const getCompareContent = () => {
    const [record1, record2] = compareRecords;
    if (!record1 || !record2) return null;

    switch (compareTab) {
      case 'request': {
        const req1 = {
          url: record1.request.url,
          method: record1.request.method,
          params: record1.request.params,
          headers: record1.request.headers,
          body: record1.request.body
        };
        const req2 = {
          url: record2.request.url,
          method: record2.request.method,
          params: record2.request.params,
          headers: record2.request.headers,
          body: record2.request.body
        };
        return renderDiffLines(diffJson(req1, req2));
      }
      case 'status': {
        const status1 = record1.response
          ? `${record1.response.status} ${record1.response.statusText}`
          : '无响应';
        const status2 = record2.response
          ? `${record2.response.status} ${record2.response.statusText}`
          : '无响应';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <strong className="text-sm">状态码对比</strong>
              <div className="mt-2">
                {renderDiffLines(diffText(status1, status2))}
              </div>
            </div>
            <div>
              <strong className="text-sm">响应头对比</strong>
              <div className="mt-2">
                {renderDiffLines(
                  diffText(
                    record1.response
                      ? Object.entries(record1.response.headers)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([k, v]) => `${k}: ${v}`)
                          .join('\n')
                      : '',
                    record2.response
                      ? Object.entries(record2.response.headers)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([k, v]) => `${k}: ${v}`)
                          .join('\n')
                      : ''
                  )
                )}
              </div>
            </div>
            <div>
              <strong className="text-sm">响应时间对比</strong>
              <div className="mt-2">
                {renderDiffLines(
                  diffText(
                    String(record1.response?.time || 0) + 'ms',
                    String(record2.response?.time || 0) + 'ms'
                  )
                )}
              </div>
            </div>
          </div>
        );
      }
      case 'body': {
        const body1 = record1.response?.data;
        const body2 = record2.response?.data;
        return renderDiffLines(diffJson(body1, body2));
      }
      case 'assertions': {
        const r1Results = record1.assertionResults;
        const r2Results = record2.assertionResults;
        const hasAssertionResults = (r1Results && r1Results.length > 0) || (r2Results && r2Results.length > 0);

        const mergedAssertions: Array<{
          key: string;
          name: string;
          r1?: AssertionResult;
          r2?: AssertionResult;
        }> = [];

        if (hasAssertionResults) {
          const map = new Map<string, { key: string; name: string; r1?: AssertionResult; r2?: AssertionResult }>();
          r1Results?.forEach((a) => {
            const key = `${a.assertionId}||${a.name}`;
            map.set(key, { key, name: a.name, r1: a });
          });
          r2Results?.forEach((a) => {
            const key = `${a.assertionId}||${a.name}`;
            const existing = map.get(key);
            if (existing) {
              existing.r2 = a;
            } else {
              map.set(key, { key, name: a.name, r2: a });
            }
          });
          mergedAssertions.push(...Array.from(map.values()));
        }

        const renderAssertionCompareRow = (item: { key: string; name: string; r1?: AssertionResult; r2?: AssertionResult }) => {
          const { r1, r2, key } = item;
          const hasDiff = r1 && r2 && (r1.passed !== r2.passed || r1.message !== r2.message || r1.actual !== r2.actual || r1.expected !== r2.expected);
          const rowBg = hasDiff ? 'rgba(248, 81, 73, 0.08)' : 'transparent';

          const renderCell = (a?: AssertionResult) => {
            if (!a) {
              return <span className="text-muted text-sm">无此断言</span>;
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
                <div className="flex items-center gap-2">
                  <span className={`tag ${a.passed ? 'tag-success' : 'tag-error'}`} style={{ fontSize: 11 }}>
                    {a.passed ? '✓' : '✗'}
                  </span>
                  <span className={a.passed ? 'text-success' : 'text-error'}>
                    {a.passed ? '通过' : '失败'}
                  </span>
                </div>
                {a.expected !== undefined && a.expected !== '' && (
                  <div className="text-secondary text-sm">
                    <strong>期望:</strong> {a.expected}
                  </div>
                )}
                {a.actual !== undefined && a.actual !== '' && (
                  <div className="text-secondary text-sm">
                    <strong>实际:</strong> {a.actual}
                  </div>
                )}
                {a.message && (
                  <div className="text-secondary text-sm">
                    <strong>消息:</strong> {a.message}
                  </div>
                )}
              </div>
            );
          };

          return (
            <div
              key={item.key}
              style={{
                padding: 10,
                marginBottom: 8,
                border: hasDiff ? '1px solid rgba(248, 81, 73, 0.3)' : '1px solid var(--border-color)',
                borderRadius: 4,
                background: rowBg
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="text-sm text-secondary" style={{ marginBottom: 4, fontWeight: 500 }}>记录 1</div>
                  {renderCell(r1)}
                </div>
                <div>
                  <div className="text-sm text-secondary" style={{ marginBottom: 4, fontWeight: 500 }}>记录 2</div>
                  {renderCell(r2)}
                </div>
              </div>
            </div>
          );
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <span>
                记录 1:{' '}
                <span className={record1.passed ? 'text-success' : 'text-error'}>
                  {record1.passed ? '✓ 通过' : '✗ 失败'}
                </span>
              </span>
              <span>
                记录 2:{' '}
                <span className={record2.passed ? 'text-success' : 'text-error'}>
                  {record2.passed ? '✓ 通过' : '✗ 失败'}
                </span>
              </span>
            </div>
            <div>
              <strong className="text-sm">失败原因对比</strong>
              <div className="mt-2">
                {renderDiffLines(
                  diffText(
                    record1.failureReason || '无失败原因',
                    record2.failureReason || '无失败原因'
                  )
                )}
              </div>
            </div>
            {hasAssertionResults ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong className="text-sm">断言结果对比</strong>
                  <span className="text-secondary text-sm">共 {mergedAssertions.length} 条断言</span>
                </div>
                {mergedAssertions.length === 0 ? (
                  <div className="text-sm text-muted">无断言结果</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {mergedAssertions.map((item) => (
                      <div key={item.key}>
                        <div className="text-sm" style={{ fontWeight: 500, marginBottom: 4 }}>
                          {item.name}
                        </div>
                        {renderAssertionCompareRow(item)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <strong className="text-sm">断言定义对比（无执行结果，仅显示定义）</strong>
                <div className="mt-2">
                  {renderDiffLines(
                    diffJson(
                      record1.request.assertions || [],
                      record2.request.assertions || []
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  const findHistoryIndex = (id: string) => {
    return projectHistory.findIndex((h) => h.id === id) + 1;
  };

  const getInflectionType = (records: HistoryRecord[], index: number): 'to-failed' | 'to-passed' | null => {
    if (index === 0) return null;
    const prev = records[index - 1];
    const curr = records[index];
    if (prev.passed && !curr.passed) return 'to-failed';
    if (!prev.passed && curr.passed) return 'to-passed';
    return null;
  };

  const getNodeColor = (record: HistoryRecord): string => {
    if (!record.response) return '#6e7681';
    return record.passed ? '#2ea043' : '#f85149';
  };

  const renderAssertionResultItem = (a: AssertionResult) => (
    <div key={a.assertionId} className="list-item" style={{ padding: '4px 8px', marginBottom: 4 }}>
      <div className="flex items-center gap-2 flex-1">
        <span className={`tag ${a.passed ? 'tag-success' : 'tag-error'}`} style={{ fontSize: 11 }}>
          {a.passed ? '✓' : '✗'}
        </span>
        <span className="text-sm">{a.name}</span>
      </div>
      <span className="text-secondary text-sm">{a.message}</span>
    </div>
  );

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
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as HistoryFilterType)}
            >
              <option value="all">全部结果</option>
              <option value="passed">仅通过</option>
              <option value="failed">仅失败</option>
              <option value="2xx">2xx</option>
              <option value="3xx">3xx</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
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
                    onClick={() => handleSelectRecord(record)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                      <span className={`tag ${record.passed ? 'tag-success' : 'tag-error'}`}>
                        {record.passed ? '✓' : '✗'}
                      </span>
                      <span className={`tag ${getMethodTagClass(record.request.method)}`}>
                        {record.request.method}
                      </span>
                      <span className="truncate">{record.request.name}</span>
                      {record.sourceHistoryId && (
                        <span className="tag tag-info">
                          从历史 #{findHistoryIndex(record.sourceHistoryId)} 复跑
                        </span>
                      )}
                      {record.failureReason && (
                        <span className="tag tag-warning">⚑ {record.failureReason}</span>
                      )}
                      {record.response && <span className="tag">{record.response.status}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="text-secondary text-sm">{formatDate(record.createdAt)}</span>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenRerunModal(record);
                        }}
                        disabled={isReplaying}
                      >
                        {isReplaying ? '运行中...' : '复跑'}
                      </button>
                      <button
                        className="btn btn-sm"
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10
              }}
            >
              <div className="tab-group" style={{ fontSize: 12 }}>
                <button
                  className={`tab-btn ${detailTab === 'detail' ? 'active' : ''}`}
                  onClick={() => setDetailTab('detail')}
                >
                  详情
                </button>
                <button
                  className={`tab-btn ${detailTab === 'requestHistory' ? 'active' : ''}`}
                  onClick={() => setDetailTab('requestHistory')}
                  disabled={!selectedRecord?.requestId}
                >
                  同请求历史
                </button>
                <button
                  className={`tab-btn ${detailTab === 'compare' ? 'active' : ''}`}
                  onClick={() => setDetailTab('compare')}
                  disabled={!selectedRecord?.requestId}
                >
                  对比
                </button>
                <button
                  className={`tab-btn ${detailTab === 'trend' ? 'active' : ''}`}
                  onClick={() => setDetailTab('trend')}
                  disabled={!selectedRecord?.requestId}
                >
                  趋势
                </button>
              </div>
            </div>

            {!selectedRecord ? (
              <div className="text-center text-muted" style={{ padding: 32, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                点击左侧查看历史记录详情
              </div>
            ) : detailTab === 'detail' ? (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`tag ${getMethodTagClass(selectedRecord.request.method)}`}>
                    {selectedRecord.request.method}
                  </span>
                  <span className={`tag ${selectedRecord.passed ? 'tag-success' : 'tag-error'}`}>
                    {selectedRecord.passed ? '✓ 通过' : '✗ 失败'}
                  </span>
                  {selectedRecord.sourceHistoryId && (
                    <span className="tag tag-info">
                      从历史 #{findHistoryIndex(selectedRecord.sourceHistoryId)} 复跑
                    </span>
                  )}
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

                {selectedRecord.actualRequest && (
                  <div className="mb-3">
                    <strong className="text-sm">实际发送请求</strong>
                    <div className="mt-2">
                      <div className="text-sm mb-1">
                        <span className="text-secondary">URL: </span>
                        {selectedRecord.actualRequest.url}
                      </div>
                      <div className="text-sm mb-1">
                        <span className="text-secondary">Method: </span>
                        {selectedRecord.actualRequest.method}
                      </div>
                      {selectedRecord.actualRequest.bodyRaw && (
                        <div>
                          <span className="text-secondary text-sm">Body: </span>
                          <pre className="json-viewer mt-1" style={{ maxHeight: 150, fontSize: 12 }}>
                            {selectedRecord.actualRequest.bodyRaw}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong className="text-sm">失败原因</strong>
                    <button className="btn btn-sm" onClick={handleEditReason}>
                      编辑
                    </button>
                  </div>
                  {isEditingReason ? (
                    <div className="mt-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="input"
                        style={{ minHeight: 80, resize: 'vertical' }}
                        value={editingReason}
                        onChange={(e) => setEditingReason(e.target.value)}
                        placeholder="输入失败原因..."
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => setIsEditingReason(false)}>
                          取消
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={handleSaveReason}>
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="mt-2 text-sm"
                      style={{
                        padding: '8px 12px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 4,
                        minHeight: 36
                      }}
                    >
                      {selectedRecord.failureReason || <span className="text-muted">暂无失败原因</span>}
                    </div>
                  )}
                </div>

                {selectedRecord.assertionResults && selectedRecord.assertionResults.length > 0 && (
                  <div className="mb-3">
                    <strong className="text-sm">
                      断言结果 ({selectedRecord.assertionResults.filter((a) => a.passed).length}/{selectedRecord.assertionResults.length})
                    </strong>
                    <div className="mt-2">
                      {selectedRecord.assertionResults.map((a) => renderAssertionResultItem(a))}
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <strong className="text-sm">原始请求 URL</strong>
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
            ) : detailTab === 'requestHistory' ? (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span className="text-sm text-secondary">
                    共 {sameRequestHistory.length} 条执行记录（按时间倒序）
                  </span>
                  <button
                    className={`btn btn-sm ${compareMode ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setCompareMode(!compareMode);
                      setCompareRecordIds([]);
                    }}
                  >
                    {compareMode ? '退出对比' : '对比模式'}
                  </button>
                </div>
                {sameRequestHistory.length === 0 ? (
                  <div className="text-center text-muted" style={{ padding: 32 }}>
                    暂无同请求历史记录
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, overflow: 'auto' }}>
                      {sameRequestHistory.map((record, index) => (
                        <div
                          key={record.id}
                          className={`list-item ${
                            selectedRecord?.id === record.id ? 'active' : ''
                          } ${compareRecordIds.includes(record.id) ? 'selected' : ''}`}
                          style={{
                            padding: '8px 10px',
                            cursor: compareMode ? 'pointer' : 'pointer',
                            marginBottom: 6,
                            background: compareRecordIds.includes(record.id)
                              ? 'var(--bg-primary)'
                              : undefined,
                            border: compareRecordIds.includes(record.id)
                              ? '1px solid var(--border-primary)'
                              : undefined
                          }}
                          onClick={() => {
                            if (compareMode) {
                              handleToggleCompareSelect(record.id);
                            } else {
                              handleSelectRecord(record);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {compareMode && (
                              <input
                                type="checkbox"
                                checked={compareRecordIds.includes(record.id)}
                                onChange={() => handleToggleCompareSelect(record.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                            <span className="text-secondary text-sm" style={{ width: 24, textAlign: 'center' }}>
                              #{index + 1}
                            </span>
                            <span className={`tag ${record.passed ? 'tag-success' : 'tag-error'}`}>
                              {record.passed ? '✓' : '✗'}
                            </span>
                            {record.response && (
                              <span className="tag">{record.response.status}</span>
                            )}
                            {record.response && (
                              <span className="tag tag-info">{formatTime(record.response.time)}</span>
                            )}
                            {record.failureReason && (
                              <span className="tag tag-warning">⚑ {record.failureReason}</span>
                            )}
                          </div>
                          <span className="text-secondary text-sm">{formatDate(record.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                    {compareMode && compareRecordIds.length === 2 && (
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: '1px solid var(--border-color)',
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 8
                        }}
                      >
                        <button
                          className="btn btn-sm"
                          onClick={() => setCompareRecordIds([])}
                        >
                          清空选择
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleStartCompare}
                        >
                          开始对比
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : detailTab === 'trend' ? (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200, display: 'flex', flexDirection: 'column', padding: '8px 4px' }}>
                {sameRequestHistoryAsc.length === 0 ? (
                  <div className="text-center text-muted" style={{ padding: 32 }}>
                    暂无历史数据
                  </div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: 28 }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: 9,
                        top: 6,
                        bottom: 6,
                        width: 2,
                        background: 'var(--border-color)'
                      }}
                    />
                    {sameRequestHistoryAsc.map((record, idx) => {
                      const inflection = getInflectionType(sameRequestHistoryAsc, idx);
                      const dotColor = getNodeColor(record);
                      const isSelected = selectedRecord?.id === record.id;
                      const isLast = idx === sameRequestHistoryAsc.length - 1;
                      return (
                        <div
                          key={record.id}
                          style={{
                            position: 'relative',
                            marginBottom: isLast ? 0 : 14,
                            cursor: 'pointer'
                          }}
                          onClick={() => handleSelectRecord(record)}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: -28,
                              top: 8,
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: dotColor,
                              border: inflection
                                ? `3px solid ${inflection === 'to-failed' ? '#f85149' : '#2ea043'}`
                                : '2px solid var(--bg-primary)',
                              boxShadow: isSelected ? '0 0 0 3px rgba(31, 111, 235, 0.35)' : undefined,
                              zIndex: 1
                            }}
                          />
                          <div
                            className={`card ${isSelected ? 'active' : ''}`}
                            style={{
                              padding: 10,
                              border: isSelected
                                ? '1px solid var(--primary)'
                                : '1px solid var(--border-color)',
                              background: isSelected
                                ? 'var(--bg-primary)'
                                : 'var(--bg-secondary)'
                            }}
                          >
                            <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                              <span className="text-secondary text-sm" style={{ fontWeight: 500 }}>
                                {formatDateTimeShort(record.createdAt)}
                              </span>
                              <span className="text-secondary text-sm">
                                #{idx + 1}
                              </span>
                              <span className={`tag ${record.passed ? 'tag-success' : 'tag-error'}`} style={{ fontSize: 11 }}>
                                {record.passed ? '✓ 通过' : '✗ 失败'}
                              </span>
                              {record.sourceHistoryId && (
                                <span className="tag tag-info" style={{ fontSize: 11 }}>
                                  从历史 #{findHistoryIndex(record.sourceHistoryId)} 复跑
                                </span>
                              )}
                              {inflection === 'to-failed' && (
                                <span className="tag tag-error" style={{ fontSize: 11 }}>
                                  🔴 从通过变失败
                                </span>
                              )}
                              {inflection === 'to-passed' && (
                                <span className="tag tag-success" style={{ fontSize: 11 }}>
                                  🟢 从失败恢复
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                              {record.response ? (
                                <>
                                  <span className="tag" style={{ fontSize: 11 }}>
                                    {record.response.status} {record.response.statusText}
                                  </span>
                                  <span className="tag tag-info" style={{ fontSize: 11 }}>
                                    {formatTime(record.response.time)}
                                  </span>
                                </>
                              ) : (
                                <span className="tag" style={{ fontSize: 11, background: 'var(--bg-secondary)' }}>
                                  无响应
                                </span>
                              )}
                            </div>
                            {record.failureReason && (
                              <div className="text-sm" style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>
                                <span style={{ fontWeight: 500 }}>失败原因：</span>
                                {record.failureReason}
                              </div>
                            )}
                            {record.assertionResults && record.assertionResults.length > 0 && (
                              <div>
                                <div className="text-sm" style={{ marginBottom: 4, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                  断言结果 ({record.assertionResults.filter(a => a.passed).length}/{record.assertionResults.length})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  {record.assertionResults.filter(a => !a.passed).slice(0, 3).map(a => renderAssertionResultItem(a))}
                                  {record.assertionResults.filter(a => !a.passed).length > 3 && (
                                    <div className="text-secondary text-sm" style={{ paddingLeft: 4 }}>
                                      ...还有 {record.assertionResults.filter(a => !a.passed).length - 3} 条失败断言
                                    </div>
                                  )}
                                  {record.assertionResults.filter(a => !a.passed).length === 0 &&
                                    record.assertionResults.slice(0, 2).map(a => renderAssertionResultItem(a))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 200, display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: 10 }}>
                  <span className="text-sm text-secondary">
                    选择两条记录进行对比
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button
                    className={`btn btn-sm ${compareMode ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setCompareMode(!compareMode);
                      setCompareRecordIds([]);
                    }}
                  >
                    {compareMode ? '退出选择' : '选择记录对比'}
                  </button>
                  {compareRecordIds.length === 2 && (
                    <button className="btn btn-sm btn-primary" onClick={handleStartCompare}>
                      查看对比
                    </button>
                  )}
                </div>
                {compareRecordIds.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <span className="text-sm">
                      已选择 {compareRecordIds.length}/2 条记录
                    </span>
                  </div>
                )}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {sameRequestHistory.map((record) => (
                    <div
                      key={record.id}
                      className={`list-item ${
                        compareRecordIds.includes(record.id) ? 'selected' : ''
                      }`}
                      style={{
                        padding: '8px 10px',
                        cursor: compareMode ? 'pointer' : 'default',
                        marginBottom: 6,
                        opacity: compareMode ? 1 : 0.5
                      }}
                      onClick={() => compareMode && handleToggleCompareSelect(record.id)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {compareMode && (
                          <input
                            type="checkbox"
                            checked={compareRecordIds.includes(record.id)}
                            onChange={() => handleToggleCompareSelect(record.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span className={`tag ${record.passed ? 'tag-success' : 'tag-error'}`}>
                          {record.passed ? '✓' : '✗'}
                        </span>
                        <span className="truncate">{record.request.name}</span>
                        {record.response && (
                          <span className="tag">{record.response.status}</span>
                        )}
                      </div>
                      <span className="text-secondary text-sm">{formatDate(record.createdAt)}</span>
                    </div>
                  ))}
                </div>
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
              <button className="btn" onClick={() => setShowClearModal(false)}>
                取消
              </button>
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

      {showCompareModal && (
        <Modal
          title="历史记录对比"
          onClose={() => setShowCompareModal(false)}
          width={800}
          footer={
            <>
              <button className="btn" onClick={() => setShowCompareModal(false)}>
                关闭
              </button>
            </>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <div className="tab-group">
              <button
                className={`tab-btn ${compareTab === 'request' ? 'active' : ''}`}
                onClick={() => setCompareTab('request')}
              >
                请求内容
              </button>
              <button
                className={`tab-btn ${compareTab === 'status' ? 'active' : ''}`}
                onClick={() => setCompareTab('status')}
              >
                响应状态
              </button>
              <button
                className={`tab-btn ${compareTab === 'body' ? 'active' : ''}`}
                onClick={() => setCompareTab('body')}
              >
                响应 Body
              </button>
              <button
                className={`tab-btn ${compareTab === 'assertions' ? 'active' : ''}`}
                onClick={() => setCompareTab('assertions')}
              >
                断言结果
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
              <div className="text-sm text-secondary mb-1">记录 1</div>
              <div className="text-sm">
                {compareRecords[0]
                  ? `${compareRecords[0].request.name} - ${formatDate(compareRecords[0].createdAt)}`
                  : '-'}
              </div>
            </div>
            <div style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
              <div className="text-sm text-secondary mb-1">记录 2</div>
              <div className="text-sm">
                {compareRecords[1]
                  ? `${compareRecords[1].request.name} - ${formatDate(compareRecords[1].createdAt)}`
                  : '-'}
              </div>
            </div>
          </div>

          <div
            style={{
              maxHeight: 500,
              overflow: 'auto',
              padding: 12,
              background: 'var(--bg-secondary)',
              borderRadius: 4
            }}
          >
            {getCompareContent()}
          </div>
        </Modal>
      )}

      {showRerunModal && rerunRecord && (
        <Modal
          title="复跑确认"
          onClose={() => setShowRerunModal(false)}
          width={640}
          footer={
            <>
              <button className="btn" onClick={() => setShowRerunModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmRerun}
                disabled={isReplaying}
              >
                {isReplaying ? '运行中...' : '执行复跑'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row">
              <label>选择环境</label>
              <select
                className="select"
                value={rerunEnvId}
                onChange={(e) => setRerunEnvId(e.target.value)}
              >
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8 }}>请求头</label>
              <KeyValueEditor
                items={rerunHeaders}
                onChange={setRerunHeaders}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8 }}>Body 类型</label>
              <select
                className="select"
                value={rerunBodyType}
                onChange={(e) => setRerunBodyType(e.target.value as RerunBodyType)}
                style={{ marginBottom: 12 }}
              >
                <option value="none">none</option>
                <option value="json">json</option>
                <option value="raw">raw</option>
                <option value="form-data">form-data</option>
                <option value="x-www-form-urlencoded">urlencoded</option>
              </select>

              {rerunBodyType === 'json' && (
                <textarea
                  className="input"
                  style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
                  placeholder='{"key": "value"}'
                  value={rerunBodyJson}
                  onChange={(e) => setRerunBodyJson(e.target.value)}
                />
              )}

              {rerunBodyType === 'raw' && (
                <textarea
                  className="input"
                  style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
                  placeholder="raw body content"
                  value={rerunBodyRaw}
                  onChange={(e) => setRerunBodyRaw(e.target.value)}
                />
              )}

              {rerunBodyType === 'form-data' && (
                <KeyValueEditor
                  items={rerunBodyFormData}
                  onChange={setRerunBodyFormData}
                />
              )}

              {rerunBodyType === 'x-www-form-urlencoded' && (
                <KeyValueEditor
                  items={rerunBodyUrlEncoded}
                  onChange={setRerunBodyUrlEncoded}
                />
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
