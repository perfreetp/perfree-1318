export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestBody {
  type: 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary';
  raw?: string;
  formData?: KeyValuePair[];
  urlEncoded?: KeyValuePair[];
  json?: string;
}

export interface ApiRequest {
  id: string;
  projectId: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  body: RequestBody;
  description?: string;
  favorite: boolean;
  folderId?: string;
  extractors?: Extractor[];
  assertions?: Assertion[];
  createdAt: number;
  updatedAt: number;
}

export interface Extractor {
  id: string;
  name: string;
  source: 'body' | 'header' | 'status';
  expression: string;
  variableName: string;
  enabled: boolean;
}

export type AssertionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'hasKey'
  | 'lengthEquals'
  | 'regex'
  | 'statusCode';

export interface Assertion {
  id: string;
  name: string;
  source: 'body' | 'header' | 'status' | 'time';
  expression: string;
  operator: AssertionOperator;
  expectedValue: string;
  enabled: boolean;
}

export interface AssertionResult {
  assertionId: string;
  name: string;
  passed: boolean;
  actual: string;
  expected: string;
  message: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  time: number;
  size: number;
}

export interface RequestResult {
  id: string;
  requestId: string;
  request: ApiRequest;
  actualRequest?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
    bodyRaw?: string;
  };
  response?: ApiResponse;
  error?: string;
  assertionResults: AssertionResult[];
  extractedVariables: Record<string, string>;
  passed: boolean;
  startTime: number;
  endTime: number;
  failureReason?: string;
}

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  variables: EnvironmentVariable[];
  isDefault: boolean;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReplayQueueItem {
  id: string;
  requestId: string;
  order: number;
  enabled: boolean;
}

export interface ReplayConfig {
  concurrency: number;
  interval: number;
  statusFilter: 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'failed';
  stopOnFailure: boolean;
  extractPrevious: boolean;
}

export interface ReplaySnapshot {
  id: string;
  projectId: string;
  name: string;
  config: ReplayConfig;
  results: RequestResult[];
  createdAt: number;
}

export interface HistoryRecord {
  id: string;
  projectId: string;
  requestId?: string;
  resultId?: string;
  sourceHistoryId?: string;
  request: ApiRequest;
  actualRequest?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
    bodyRaw?: string;
  };
  response?: ApiResponse;
  passed: boolean;
  failureReason?: string;
  createdAt: number;
}

export type HistoryFilterType = 'all' | 'passed' | 'failed' | '2xx' | '3xx' | '4xx' | '5xx';

export interface OfflineReport {
  version: string;
  exportedAt: number;
  environmentName?: string;
  config?: ReplayConfig;
  name: string;
  description?: string;
  results: RequestResult[];
}

export type TabType =
  | 'project'
  | 'request'
  | 'environment'
  | 'queue'
  | 'assertion'
  | 'report'
  | 'history';
