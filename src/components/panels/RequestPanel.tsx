import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store';
import { KeyValueEditor } from '@/components/common/KeyValueEditor';
import { Modal } from '@/components/common/Modal';
import { ApiRequest, HttpMethod, RequestBody, KeyValuePair, Extractor, Assertion, ApiResponse } from '@/types';
import { generateId, formatTime, formatSize } from '@/utils';
import { sendRequest, collectVariables } from '@/services/httpService';
import { runAssertions } from '@/services/assertionService';
import { autoParse, ImportResult } from '@/services/importService';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
type RequestTab = 'params' | 'headers' | 'body' | 'extractors' | 'assertions';

export const RequestPanel: React.FC = () => {
  const {
    selectedProjectId,
    selectedEnvironmentId,
    environments,
    requests,
    selectedRequestId,
    selectRequest,
    createRequest,
    updateRequest,
    deleteRequest,
    duplicateRequest,
    toggleFavorite,
    addToQueue,
    importRequests,
    addHistory
  } = useAppStore();

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFav, setFilterFav] = useState(false);
  const [requestTab, setRequestTab] = useState<RequestTab>('params');
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'assertions'>('body');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [assertionResults, setAssertionResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showExtractorModal, setShowExtractorModal] = useState(false);
  const [showAssertionModal, setShowAssertionModal] = useState(false);
  const [editingExtractor, setEditingExtractor] = useState<Extractor | null>(null);
  const [editingAssertion, setEditingAssertion] = useState<Assertion | null>(null);

  const projectRequests = requests.filter((r) => r.projectId === selectedProjectId);
  const currentRequest = requests.find((r) => r.id === selectedRequestId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const filteredRequests = projectRequests.filter((r) => {
    if (filterFav && !r.favorite) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
      );
    }
    return true;
  });

  useEffect(() => {
    if (currentRequest) {
      setResponse(null);
      setResponseError(null);
      setAssertionResults([]);
    }
  }, [selectedRequestId]);

  const getMethodTagClass = (method: string) => {
    const m = method.toUpperCase();
    if (m === 'GET') return 'tag-method-get';
    if (m === 'POST') return 'tag-method-post';
    if (m === 'PUT') return 'tag-method-put';
    if (m === 'DELETE') return 'tag-method-delete';
    return 'tag-method-other';
  };

  const handleUpdateField = <K extends keyof ApiRequest>(key: K, value: ApiRequest[K]) => {
    if (!currentRequest) return;
    updateRequest(currentRequest.id, { [key]: value });
  };

  const handleUpdateParams = (params: KeyValuePair[]) => handleUpdateField('params', params);
  const handleUpdateHeaders = (headers: KeyValuePair[]) => handleUpdateField('headers', headers);

  const handleUpdateBodyType = (type: RequestBody['type']) => {
    if (!currentRequest) return;
    const body = currentRequest.body;
    let newBody: RequestBody;
    switch (type) {
      case 'json':
        newBody = { type: 'json', json: body.json || '{}' };
        break;
      case 'form-data':
        newBody = { type: 'form-data', formData: body.formData || [] };
        break;
      case 'x-www-form-urlencoded':
        newBody = { type: 'x-www-form-urlencoded', urlEncoded: body.urlEncoded || [] };
        break;
      case 'raw':
        newBody = { type: 'raw', raw: body.raw || '' };
        break;
      default:
        newBody = { type: 'none' };
    }
    handleUpdateField('body', newBody);
  };

  const handleUpdateFormData = (formData: KeyValuePair[]) =>
    handleUpdateField('body', { type: 'form-data', formData });

  const handleUpdateUrlEncoded = (urlEncoded: KeyValuePair[]) =>
    handleUpdateField('body', { type: 'x-www-form-urlencoded', urlEncoded });

  const handleUpdateRaw = (raw: string) =>
    handleUpdateField('body', { type: 'raw', raw });

  const handleUpdateJson = (json: string) =>
    handleUpdateField('body', { type: 'json', json });

  const handleSend = async () => {
    if (!currentRequest || !currentRequest.url) {
      alert('请填写请求地址');
      return;
    }
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    setAssertionResults([]);

    const variables = collectVariables(currentEnv?.variables || []);
    const sendResult = await sendRequest(currentRequest, variables);

    const resp = sendResult.response;
    if (resp) {
      setResponse(resp);
    }
    if (sendResult.error) {
      setResponseError(sendResult.error);
    }

    const assertionResults = resp ? runAssertions(resp, currentRequest.assertions || []) : [];
    setAssertionResults(assertionResults);

    let passed = true;
    if (sendResult.error || sendResult.bodyParseError) {
      passed = false;
    } else if (assertionResults.length > 0) {
      passed = assertionResults.every((a) => a.passed);
    }

    addHistory({
      projectId: currentRequest.projectId,
      requestId: currentRequest.id,
      request: JSON.parse(JSON.stringify(currentRequest)),
      actualRequest: sendResult.actualRequest,
      response: resp,
      passed
    });

    setLoading(false);
  };

  const handleImport = () => {
    const trimmed = importText.trim();
    if (!trimmed) return;

    const parsed = autoParse(trimmed);
    if (!parsed) {
      setImportErrors(['无法识别导入格式，请检查内容是否为 cURL 命令、HAR 或 Postman 集合']);
      return;
    }

    const isMultiple = 'requests' in parsed;
    if (isMultiple) {
      const result = parsed as ImportResult;
      if (result.requests.length === 0) {
        setImportErrors(result.errors.length > 0 ? result.errors : ['未解析到有效请求']);
        return;
      }
      importRequests(selectedProjectId!, result.requests);
      setImportErrors(result.errors);
    } else {
      createRequest(selectedProjectId!, parsed as Partial<ApiRequest>);
      setImportErrors([]);
    }
    setShowImport(false);
    setImportText('');
  };

  const handleAddExtractor = () => {
    setEditingExtractor({
      id: generateId(),
      name: '提取器1',
      source: 'body',
      expression: 'data.token',
      variableName: 'token',
      enabled: true
    });
    setShowExtractorModal(true);
  };

  const handleEditExtractor = (ext: Extractor) => {
    setEditingExtractor({ ...ext });
    setShowExtractorModal(true);
  };

  const handleSaveExtractor = () => {
    if (!currentRequest || !editingExtractor) return;
    const exts = currentRequest.extractors || [];
    const exists = exts.find((e) => e.id === editingExtractor.id);
    const newExtractors = exists
      ? exts.map((e) => (e.id === editingExtractor.id ? editingExtractor : e))
      : [...exts, editingExtractor];
    updateRequest(currentRequest.id, { extractors: newExtractors });
    setShowExtractorModal(false);
    setEditingExtractor(null);
  };

  const handleDeleteExtractor = (id: string) => {
    if (!currentRequest) return;
    updateRequest(currentRequest.id, {
      extractors: (currentRequest.extractors || []).filter((e) => e.id !== id)
    });
  };

  const handleAddAssertion = () => {
    setEditingAssertion({
      id: generateId(),
      name: '状态码 2xx',
      source: 'status',
      expression: '',
      operator: 'statusCode',
      expectedValue: '2xx',
      enabled: true
    });
    setShowAssertionModal(true);
  };

  const handleEditAssertion = (as: Assertion) => {
    setEditingAssertion({ ...as });
    setShowAssertionModal(true);
  };

  const handleSaveAssertion = () => {
    if (!currentRequest || !editingAssertion) return;
    const asserts = currentRequest.assertions || [];
    const exists = asserts.find((a) => a.id === editingAssertion.id);
    const newAssertions = exists
      ? asserts.map((a) => (a.id === editingAssertion.id ? editingAssertion : a))
      : [...asserts, editingAssertion];
    updateRequest(currentRequest.id, { assertions: newAssertions });
    setShowAssertionModal(false);
    setEditingAssertion(null);
  };

  const handleDeleteAssertion = (id: string) => {
    if (!currentRequest) return;
    updateRequest(currentRequest.id, {
      assertions: (currentRequest.assertions || []).filter((a) => a.id !== id)
    });
  };

  const renderBodyEditor = () => {
    if (!currentRequest) return null;
    const body = currentRequest.body;
    switch (body.type) {
      case 'json':
        return (
          <textarea
            className="textarea"
            style={{ minHeight: 180, fontFamily: 'var(--font-mono)' }}
            placeholder='{"key": "value"}'
            value={body.json || ''}
            onChange={(e) => handleUpdateJson(e.target.value)}
          />
        );
      case 'form-data':
        return (
          <KeyValueEditor
            items={body.formData || []}
            onChange={handleUpdateFormData}
            keyPlaceholder="字段名"
            valuePlaceholder="值"
          />
        );
      case 'x-www-form-urlencoded':
        return (
          <KeyValueEditor
            items={body.urlEncoded || []}
            onChange={handleUpdateUrlEncoded}
            keyPlaceholder="字段名"
            valuePlaceholder="值"
          />
        );
      case 'raw':
        return (
          <textarea
            className="textarea"
            style={{ minHeight: 180, fontFamily: 'var(--font-mono)' }}
            placeholder="原始请求体..."
            value={body.raw || ''}
            onChange={(e) => handleUpdateRaw(e.target.value)}
          />
        );
      default:
        return <div className="text-muted text-center" style={{ padding: 24 }}>该请求不包含 Body</div>;
    }
  };

  if (!selectedProjectId) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>请先在项目管理中选择或创建一个项目</p>
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
            <span>请求列表 ({filteredRequests.length})</span>
            <div className="flex gap-2">
              <button
                className={`btn btn-sm btn-icon ${filterFav ? 'btn-primary' : ''}`}
                onClick={() => setFilterFav(!filterFav)}
                title="仅显示收藏"
              >
                ⭐
              </button>
              <button className="btn btn-sm btn-icon" onClick={() => setShowImport(true)} title="导入">
                📥
              </button>
              <button
                className="btn btn-sm btn-icon"
                onClick={() => createRequest(selectedProjectId!)}
                title="新建请求"
              >
                +
              </button>
            </div>
          </div>
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              className="input"
              placeholder="搜索请求..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="split-sidebar-body">
            {filteredRequests.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 24 }}>
                暂无请求
              </div>
            ) : (
              filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className={`list-item ${selectedRequestId === req.id ? 'active' : ''}`}
                  style={{ padding: '8px 10px', cursor: 'pointer' }}
                  onClick={() => selectRequest(req.id)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={`star-btn ${req.favorite ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(req.id);
                      }}
                    >
                      {req.favorite ? '★' : '☆'}
                    </span>
                    <span className={`tag ${getMethodTagClass(req.method)}`}>{req.method}</span>
                    <span className="truncate text-sm">{req.name}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="split-content">
          {!currentRequest ? (
            <div className="panel-body">
              <div className="empty-state">
                <div className="icon">📝</div>
                <p>从左侧选择一个请求，或点击 + 按钮新建</p>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-header">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <input
                    type="text"
                    className="input"
                    style={{ maxWidth: 260 }}
                    value={currentRequest.name}
                    onChange={(e) => handleUpdateField('name', e.target.value)}
                  />
                  <span
                    className={`star-btn ${currentRequest.favorite ? 'active' : ''}`}
                    onClick={() => toggleFavorite(currentRequest.id)}
                    style={{ fontSize: 20 }}
                  >
                    {currentRequest.favorite ? '★' : '☆'}
                  </span>
                </div>
                <div className="toolbar">
                  <button className="btn btn-sm" onClick={() => addToQueue(selectedProjectId!, currentRequest.id)}>
                    + 加入队列
                  </button>
                  <button className="btn btn-sm" onClick={() => duplicateRequest(currentRequest.id)}>
                    复制
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirm('确定删除此请求？')) deleteRequest(currentRequest.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
                <div className="flex gap-2" style={{ alignItems: 'stretch' }}>
                  <select
                    className="select"
                    style={{ width: 100 }}
                    value={currentRequest.method}
                    onChange={(e) => handleUpdateField('method', e.target.value as HttpMethod)}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="请输入请求 URL，例如 https://api.example.com/v1/users"
                    value={currentRequest.url}
                    onChange={(e) => handleUpdateField('url', e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={handleSend} disabled={loading}>
                    {loading ? '发送中...' : '▶ Send'}
                  </button>
                </div>

                <div className="card">
                  <div className="tabs-inline">
                    <div
                      className={`tab-inline ${requestTab === 'params' ? 'active' : ''}`}
                      onClick={() => setRequestTab('params')}
                    >
                      Query Params ({currentRequest.params.filter((p) => p.enabled).length})
                    </div>
                    <div
                      className={`tab-inline ${requestTab === 'headers' ? 'active' : ''}`}
                      onClick={() => setRequestTab('headers')}
                    >
                      Headers ({currentRequest.headers.filter((h) => h.enabled).length})
                    </div>
                    <div
                      className={`tab-inline ${requestTab === 'body' ? 'active' : ''}`}
                      onClick={() => setRequestTab('body')}
                    >
                      Body
                    </div>
                    <div
                      className={`tab-inline ${requestTab === 'extractors' ? 'active' : ''}`}
                      onClick={() => setRequestTab('extractors')}
                    >
                      提取器 ({(currentRequest.extractors || []).filter((e) => e.enabled).length})
                    </div>
                    <div
                      className={`tab-inline ${requestTab === 'assertions' ? 'active' : ''}`}
                      onClick={() => setRequestTab('assertions')}
                    >
                      断言 ({(currentRequest.assertions || []).filter((a) => a.enabled).length})
                    </div>
                  </div>

                  {requestTab === 'params' && (
                    <KeyValueEditor
                      items={currentRequest.params}
                      onChange={handleUpdateParams}
                      keyPlaceholder="参数名"
                      valuePlaceholder="参数值"
                    />
                  )}

                  {requestTab === 'headers' && (
                    <KeyValueEditor
                      items={currentRequest.headers}
                      onChange={handleUpdateHeaders}
                      keyPlaceholder="Header 名"
                      valuePlaceholder="Header 值"
                    />
                  )}

                  {requestTab === 'body' && (
                    <div>
                      <div className="tabs-inline">
                        {(['none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw'] as const).map((t) => (
                          <div
                            key={t}
                            className={`tab-inline ${currentRequest.body.type === t ? 'active' : ''}`}
                            onClick={() => handleUpdateBodyType(t)}
                          >
                            {t}
                          </div>
                        ))}
                      </div>
                      {renderBodyEditor()}
                    </div>
                  )}

                  {requestTab === 'extractors' && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-secondary">
                          从响应中提取值并保存为变量，可在后续请求中使用 {'{{变量名}}'} 引用
                        </span>
                        <button className="btn btn-sm btn-primary" onClick={handleAddExtractor}>
                          + 添加提取器
                        </button>
                      </div>
                      {(currentRequest.extractors || []).length === 0 ? (
                        <div className="text-muted text-center" style={{ padding: 24 }}>
                          暂无提取器
                        </div>
                      ) : (
                        <table className="kvp-table">
                          <thead>
                            <tr>
                              <th style={{ width: 40 }} className="text-center">启用</th>
                              <th>名称</th>
                              <th>来源</th>
                              <th>表达式</th>
                              <th>保存为</th>
                              <th style={{ width: 80 }} className="text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(currentRequest.extractors || []).map((e) => (
                              <tr key={e.id}>
                                <td className="text-center">
                                  <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={e.enabled}
                                    onChange={(ev) =>
                                      updateRequest(currentRequest.id, {
                                        extractors: (currentRequest.extractors || []).map((x) =>
                                          x.id === e.id ? { ...x, enabled: ev.target.checked } : x
                                        )
                                      })
                                    }
                                  />
                                </td>
                                <td>{e.name}</td>
                                <td>
                                  <span className="tag">{e.source}</span>
                                </td>
                                <td className="font-mono text-sm">{e.expression}</td>
                                <td className="font-mono text-sm">{`{{${e.variableName}}}`}</td>
                                <td className="text-center">
                                  <button className="btn btn-sm btn-icon" onClick={() => handleEditExtractor(e)}>
                                    ✏️
                                  </button>
                                  <button className="btn btn-sm btn-icon hover-danger" onClick={() => handleDeleteExtractor(e.id)}>
                                    🗑
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {requestTab === 'assertions' && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-secondary">
                          对响应进行断言校验，断言全部通过才算请求成功
                        </span>
                        <button className="btn btn-sm btn-primary" onClick={handleAddAssertion}>
                          + 添加断言
                        </button>
                      </div>
                      {(currentRequest.assertions || []).length === 0 ? (
                        <div className="text-muted text-center" style={{ padding: 24 }}>
                          暂无断言
                        </div>
                      ) : (
                        <table className="kvp-table">
                          <thead>
                            <tr>
                              <th style={{ width: 40 }} className="text-center">启用</th>
                              <th>名称</th>
                              <th>来源</th>
                              <th>表达式</th>
                              <th>操作符</th>
                              <th>期望值</th>
                              <th style={{ width: 80 }} className="text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(currentRequest.assertions || []).map((a) => (
                              <tr key={a.id}>
                                <td className="text-center">
                                  <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={a.enabled}
                                    onChange={(ev) =>
                                      updateRequest(currentRequest.id, {
                                        assertions: (currentRequest.assertions || []).map((x) =>
                                          x.id === a.id ? { ...x, enabled: ev.target.checked } : x
                                        )
                                      })
                                    }
                                  />
                                </td>
                                <td>{a.name}</td>
                                <td>
                                  <span className="tag">{a.source}</span>
                                </td>
                                <td className="font-mono text-sm">{a.expression || '-'}</td>
                                <td>{a.operator}</td>
                                <td className="font-mono text-sm">{a.expectedValue}</td>
                                <td className="text-center">
                                  <button className="btn btn-sm btn-icon" onClick={() => handleEditAssertion(a)}>
                                    ✏️
                                  </button>
                                  <button className="btn btn-sm btn-icon hover-danger" onClick={() => handleDeleteAssertion(a.id)}>
                                    🗑
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>

                {(response || responseError) && (
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 280 }}>
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex gap-2 items-center flex-wrap">
                        {response ? (
                          <>
                            <span
                              className={`tag ${
                                response.status >= 200 && response.status < 300
                                  ? 'tag-success'
                                  : response.status >= 400
                                  ? 'tag-error'
                                  : 'tag-warning'
                              }`}
                            >
                              {response.status} {response.statusText}
                            </span>
                            <span className="tag tag-info">{formatTime(response.time)}</span>
                            <span className="tag">{formatSize(response.size)}</span>
                          </>
                        ) : (
                          <span className="tag tag-error">请求失败: {responseError}</span>
                        )}
                      </div>
                      <div className="tabs-inline" style={{ margin: 0, border: 'none' }}>
                        <div
                          className={`tab-inline ${responseTab === 'body' ? 'active' : ''}`}
                          onClick={() => setResponseTab('body')}
                        >
                          Body
                        </div>
                        <div
                          className={`tab-inline ${responseTab === 'headers' ? 'active' : ''}`}
                          onClick={() => setResponseTab('headers')}
                        >
                          Headers
                        </div>
                        <div
                          className={`tab-inline ${responseTab === 'assertions' ? 'active' : ''}`}
                          onClick={() => setResponseTab('assertions')}
                        >
                          断言
                          {assertionResults.length > 0 && (
                            <span
                              className="badge"
                              style={{
                                background: assertionResults.every((a) => a.passed)
                                  ? 'var(--success)'
                                  : 'var(--error)',
                                marginLeft: 4
                              }}
                            >
                              {assertionResults.filter((a) => a.passed).length}/{assertionResults.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {responseTab === 'body' && response && (
                      <pre className="json-viewer flex-1">
                        {typeof response.data === 'string'
                          ? response.data
                          : JSON.stringify(response.data, null, 2)}
                      </pre>
                    )}
                    {responseTab === 'body' && !response && (
                      <div className="text-error">{responseError}</div>
                    )}
                    {responseTab === 'headers' && response && (
                      <pre className="json-viewer flex-1">
                        {Object.entries(response.headers)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join('\n')}
                      </pre>
                    )}
                    {responseTab === 'assertions' && (
                      <div className="flex-1 overflow-auto">
                        {assertionResults.length === 0 ? (
                          <div className="text-muted text-center" style={{ padding: 24 }}>
                            暂无断言结果
                          </div>
                        ) : (
                          assertionResults.map((a) => (
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
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showImport && (
        <Modal
          title="导入接口集合 / 粘贴抓包内容"
          onClose={() => setShowImport(false)}
          width={600}
          footer={
            <>
              <button className="btn" onClick={() => setShowImport(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleImport}>
                导入
              </button>
            </>
          }
        >
          <p className="text-secondary mb-3">
            支持粘贴 cURL 命令、HAR 导出内容、Postman Collection JSON
          </p>
          <textarea
            className="textarea"
            style={{ minHeight: 200, fontFamily: 'var(--font-mono)' }}
            placeholder="在此粘贴 cURL / HAR / Postman 内容..."
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {importErrors.length > 0 && (
            <div className="mt-3">
              {importErrors.map((err, i) => (
                <div key={i} className="text-error text-sm">
                  ⚠ {err}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {showExtractorModal && editingExtractor && (
        <Modal
          title={editingExtractor.name ? '编辑提取器' : '新建提取器'}
          onClose={() => setShowExtractorModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowExtractorModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSaveExtractor}>
                保存
              </button>
            </>
          }
        >
          <div className="form-row">
            <label>名称</label>
            <input
              type="text"
              className="input"
              value={editingExtractor.name}
              onChange={(e) => setEditingExtractor({ ...editingExtractor, name: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div className="form-row">
              <label>来源</label>
              <select
                className="select"
                value={editingExtractor.source}
                onChange={(e) =>
                  setEditingExtractor({ ...editingExtractor, source: e.target.value as any })
                }
              >
                <option value="body">响应 Body (JSONPath)</option>
                <option value="header">响应 Header</option>
                <option value="status">状态码</option>
              </select>
            </div>
            <div className="form-row">
              <label>保存为变量</label>
              <input
                type="text"
                className="input"
                value={editingExtractor.variableName}
                onChange={(e) =>
                  setEditingExtractor({ ...editingExtractor, variableName: e.target.value })
                }
                placeholder="例如 token"
              />
            </div>
          </div>
          <div className="form-row">
            <label>表达式 (JSONPath 如 data.token, Header 名如 Authorization)</label>
            <input
              type="text"
              className="input"
              value={editingExtractor.expression}
              onChange={(e) => setEditingExtractor({ ...editingExtractor, expression: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {showAssertionModal && editingAssertion && (
        <Modal
          title={editingAssertion.name ? '编辑断言' : '新建断言'}
          onClose={() => setShowAssertionModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowAssertionModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSaveAssertion}>
                保存
              </button>
            </>
          }
        >
          <div className="form-row">
            <label>名称</label>
            <input
              type="text"
              className="input"
              value={editingAssertion.name}
              onChange={(e) => setEditingAssertion({ ...editingAssertion, name: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div className="form-row">
              <label>来源</label>
              <select
                className="select"
                value={editingAssertion.source}
                onChange={(e) =>
                  setEditingAssertion({ ...editingAssertion, source: e.target.value as any })
                }
              >
                <option value="status">状态码</option>
                <option value="body">响应 Body</option>
                <option value="header">响应 Header</option>
                <option value="time">响应时间</option>
              </select>
            </div>
            <div className="form-row">
              <label>操作符</label>
              <select
                className="select"
                value={editingAssertion.operator}
                onChange={(e) =>
                  setEditingAssertion({ ...editingAssertion, operator: e.target.value as any })
                }
              >
                <option value="equals">等于</option>
                <option value="notEquals">不等于</option>
                <option value="contains">包含</option>
                <option value="notContains">不包含</option>
                <option value="greaterThan">大于</option>
                <option value="lessThan">小于</option>
                <option value="hasKey">存在键</option>
                <option value="lengthEquals">长度等于</option>
                <option value="regex">正则匹配</option>
                <option value="statusCode">状态码匹配</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>表达式 (JSONPath 如 data.code，Header 名，留空表示状态码/响应时间本身)</label>
            <input
              type="text"
              className="input"
              value={editingAssertion.expression}
              onChange={(e) => setEditingAssertion({ ...editingAssertion, expression: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>期望值</label>
            <input
              type="text"
              className="input"
              value={editingAssertion.expectedValue}
              onChange={(e) =>
                setEditingAssertion({ ...editingAssertion, expectedValue: e.target.value })
              }
            />
          </div>
        </Modal>
      )}
    </div>
  );
};
