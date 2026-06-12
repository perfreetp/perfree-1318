import { create } from 'zustand';
import {
  Project,
  ApiRequest,
  Environment,
  ReplaySnapshot,
  HistoryRecord,
  ReplayQueueItem,
  ReplayConfig,
  RequestResult,
  TabType,
  KeyValuePair,
  HttpMethod,
  OfflineReport
} from '@/types';
import { AppData, loadData, saveData } from './storage';
import { generateId } from '@/utils';

interface AppState extends AppData {
  activeTab: TabType;
  replayConfig: ReplayConfig;
  currentResults: RequestResult[];
  compareSnapshotId: string | null;
  compareResults: RequestResult[];
  importedReport: OfflineReport | null;

  setActiveTab: (tab: TabType) => void;

  createProject: (name: string, description?: string) => Project;
  updateProject: (id: string, name: string, description?: string) => void;
  deleteProject: (id: string) => void;
  selectProject: (id: string | null) => void;

  createRequest: (projectId: string, data?: Partial<ApiRequest>) => ApiRequest;
  updateRequest: (id: string, data: Partial<ApiRequest>) => void;
  deleteRequest: (id: string) => void;
  duplicateRequest: (id: string) => ApiRequest;
  selectRequest: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
  importRequests: (projectId: string, requests: ApiRequest[]) => void;

  createEnvironment: (projectId: string, name: string) => Environment;
  updateEnvironment: (id: string, data: Partial<Environment>) => void;
  deleteEnvironment: (id: string) => void;
  selectEnvironment: (id: string | null) => void;

  addToQueue: (projectId: string, requestId: string) => void;
  removeFromQueue: (projectId: string, requestId: string) => void;
  clearQueue: (projectId: string) => void;
  updateQueueItem: (projectId: string, requestId: string, data: Partial<ReplayQueueItem>) => void;
  reorderQueue: (projectId: string, items: ReplayQueueItem[]) => void;

  setReplayConfig: (config: Partial<ReplayConfig>) => void;
  setCurrentResults: (results: RequestResult[]) => void;

  saveSnapshot: (name: string, projectId: string, results: RequestResult[]) => ReplaySnapshot;
  deleteSnapshot: (id: string) => void;
  setCompareSnapshot: (id: string | null) => void;

  addHistory: (record: Omit<HistoryRecord, 'id' | 'createdAt'>) => void;
  addHistoryBatch: (records: Omit<HistoryRecord, 'id' | 'createdAt'>[]) => void;
  updateResultFailureReason: (resultId: string, reason: string) => void;
  updateHistoryFailureReason: (historyId: string, reason: string) => void;
  clearHistory: (projectId?: string) => void;
  clearExpiredHistory: (days: number) => void;

  importOfflineReport: (report: OfflineReport) => void;
  clearImportedReport: () => void;

  persist: () => void;
}

const initialData = loadData();

export const useAppStore = create<AppState>((set, get) => ({
  ...initialData,
  activeTab: 'project',
  replayConfig: {
    concurrency: 1,
    interval: 0,
    statusFilter: 'all',
    stopOnFailure: false,
    extractPrevious: true
  },
  currentResults: [],
  compareSnapshotId: null,
  compareResults: [],
  importedReport: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  createProject: (name, description) => {
    const project: Project = {
      id: generateId(),
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const env: Environment = {
      id: generateId(),
      projectId: project.id,
      name: '默认环境',
      variables: [],
      isDefault: true,
      createdAt: Date.now()
    };
    const state = get();
    const newState = {
      projects: [...state.projects, project],
      environments: [...state.environments, env],
      selectedProjectId: project.id,
      selectedEnvironmentId: env.id
    };
    set(newState);
    get().persist();
    return project;
  },

  updateProject: (id, name, description) => {
    const state = get();
    set({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, name, description, updatedAt: Date.now() } : p
      )
    });
    get().persist();
  },

  deleteProject: (id) => {
    const state = get();
    set({
      projects: state.projects.filter((p) => p.id !== id),
      requests: state.requests.filter((r) => r.projectId !== id),
      environments: state.environments.filter((e) => e.projectId !== id),
      snapshots: state.snapshots.filter((s) => s.projectId !== id),
      history: state.history.filter((h) => h.projectId !== id),
      queue: Object.fromEntries(Object.entries(state.queue).filter(([k]) => k !== id)),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId
    });
    get().persist();
  },

  selectProject: (id) => {
    const state = get();
    const env = state.environments.find((e) => e.projectId === id && e.isDefault);
    set({
      selectedProjectId: id,
      selectedEnvironmentId: env?.id || null,
      selectedRequestId: null
    });
  },

  createRequest: (projectId, data) => {
    const now = Date.now();
    const request: ApiRequest = {
      id: generateId(),
      projectId,
      name: data?.name || '新建请求',
      method: data?.method || ('GET' as HttpMethod),
      url: data?.url || '',
      params: data?.params || [],
      headers: data?.headers || [],
      body: data?.body || { type: 'none' },
      description: data?.description,
      favorite: false,
      extractors: data?.extractors || [],
      assertions: data?.assertions || [],
      createdAt: now,
      updatedAt: now,
      ...data
    };
    set({ requests: [...get().requests, request], selectedRequestId: request.id });
    get().persist();
    return request;
  },

  updateRequest: (id, data) => {
    set({
      requests: get().requests.map((r) =>
        r.id === id ? { ...r, ...data, updatedAt: Date.now() } : r
      )
    });
    get().persist();
  },

  deleteRequest: (id) => {
    const state = get();
    set({
      requests: state.requests.filter((r) => r.id !== id),
      selectedRequestId: state.selectedRequestId === id ? null : state.selectedRequestId
    });
    get().persist();
  },

  duplicateRequest: (id) => {
    const state = get();
    const original = state.requests.find((r) => r.id === id);
    if (!original) return null as unknown as ApiRequest;
    const now = Date.now();
    const copy: ApiRequest = {
      ...JSON.parse(JSON.stringify(original)),
      id: generateId(),
      name: `${original.name} (副本)`,
      createdAt: now,
      updatedAt: now
    };
    set({ requests: [...state.requests, copy], selectedRequestId: copy.id });
    get().persist();
    return copy;
  },

  selectRequest: (id) => set({ selectedRequestId: id }),

  toggleFavorite: (id) => {
    set({
      requests: get().requests.map((r) =>
        r.id === id ? { ...r, favorite: !r.favorite } : r
      )
    });
    get().persist();
  },

  importRequests: (projectId, requests) => {
    const now = Date.now();
    const imported = requests.map((r) => ({
      ...r,
      id: generateId(),
      projectId,
      createdAt: now,
      updatedAt: now
    }));
    set({ requests: [...get().requests, ...imported] });
    get().persist();
  },

  createEnvironment: (projectId, name) => {
    const env: Environment = {
      id: generateId(),
      projectId,
      name,
      variables: [],
      isDefault: false,
      createdAt: Date.now()
    };
    set({ environments: [...get().environments, env], selectedEnvironmentId: env.id });
    get().persist();
    return env;
  },

  updateEnvironment: (id, data) => {
    set({
      environments: get().environments.map((e) => (e.id === id ? { ...e, ...data } : e))
    });
    get().persist();
  },

  deleteEnvironment: (id) => {
    const state = get();
    set({
      environments: state.environments.filter((e) => e.id !== id),
      selectedEnvironmentId: state.selectedEnvironmentId === id ? null : state.selectedEnvironmentId
    });
    get().persist();
  },

  selectEnvironment: (id) => set({ selectedEnvironmentId: id }),

  addToQueue: (projectId, requestId) => {
    const state = get();
    const current = state.queue[projectId] || [];
    if (current.find((i) => i.requestId === requestId)) return;
    const item: ReplayQueueItem = {
      id: generateId(),
      requestId,
      order: current.length,
      enabled: true
    };
    set({ queue: { ...state.queue, [projectId]: [...current, item] } });
    get().persist();
  },

  removeFromQueue: (projectId, requestId) => {
    const state = get();
    const current = state.queue[projectId] || [];
    set({
      queue: {
        ...state.queue,
        [projectId]: current.filter((i) => i.requestId !== requestId)
      }
    });
    get().persist();
  },

  clearQueue: (projectId) => {
    set({ queue: { ...get().queue, [projectId]: [] } });
    get().persist();
  },

  updateQueueItem: (projectId, requestId, data) => {
    const state = get();
    const current = state.queue[projectId] || [];
    set({
      queue: {
        ...state.queue,
        [projectId]: current.map((i) =>
          i.requestId === requestId ? { ...i, ...data } : i
        )
      }
    });
    get().persist();
  },

  reorderQueue: (projectId, items) => {
    set({
      queue: {
        ...get().queue,
        [projectId]: items.map((i, idx) => ({ ...i, order: idx }))
      }
    });
    get().persist();
  },

  setReplayConfig: (config) => {
    set({ replayConfig: { ...get().replayConfig, ...config } });
  },

  setCurrentResults: (results) => set({ currentResults: results }),

  saveSnapshot: (name, projectId, results) => {
    const snapshot: ReplaySnapshot = {
      id: generateId(),
      projectId,
      name,
      config: { ...get().replayConfig },
      results,
      createdAt: Date.now()
    };
    set({ snapshots: [...get().snapshots, snapshot] });
    get().persist();
    return snapshot;
  },

  deleteSnapshot: (id) => {
    set({ snapshots: get().snapshots.filter((s) => s.id !== id) });
    get().persist();
  },

  setCompareSnapshot: (id) => {
    const state = get();
    if (id) {
      const snapshot = state.snapshots.find((s) => s.id === id);
      set({ compareSnapshotId: id, compareResults: snapshot?.results || [] });
    } else {
      set({ compareSnapshotId: null, compareResults: [] });
    }
  },

  addHistory: (record) => {
    const history: HistoryRecord = {
      ...record,
      id: generateId(),
      createdAt: Date.now()
    };
    set({ history: [history, ...get().history].slice(0, 1000) });
    get().persist();
  },

  addHistoryBatch: (records) => {
    const now = Date.now();
    const newRecords = records.map((record) => ({
      ...record,
      id: generateId(),
      createdAt: now
    }));
    set({ history: [...newRecords, ...get().history].slice(0, 1000) });
    get().persist();
  },

  updateResultFailureReason: (resultId, reason) => {
    const state = get();
    const newResults = state.currentResults.map((r) =>
      r.id === resultId ? { ...r, failureReason: reason } : r
    );
    const newHistory = state.history.map((h) =>
      h.resultId === resultId ? { ...h, failureReason: reason } : h
    );
    set({ currentResults: newResults, history: newHistory });
    get().persist();
  },

  updateHistoryFailureReason: (historyId, reason) => {
    const state = get();
    const newHistory = state.history.map((h) =>
      h.id === historyId ? { ...h, failureReason: reason } : h
    );
    const record = state.history.find((h) => h.id === historyId);
    let newResults = state.currentResults;
    if (record?.resultId) {
      newResults = state.currentResults.map((r) =>
        r.id === record.resultId ? { ...r, failureReason: reason } : r
      );
    }
    set({ history: newHistory, currentResults: newResults });
    get().persist();
  },

  clearHistory: (projectId) => {
    if (projectId) {
      set({ history: get().history.filter((h) => h.projectId !== projectId) });
    } else {
      set({ history: [] });
    }
    get().persist();
  },

  clearExpiredHistory: (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    set({ history: get().history.filter((h) => h.createdAt >= cutoff) });
    get().persist();
  },

  importOfflineReport: (report) => {
    set({ importedReport: report, currentResults: report.results });
  },

  clearImportedReport: () => {
    set({ importedReport: null, currentResults: [] });
  },

  persist: () => {
    const state = get();
    saveData({
      projects: state.projects,
      requests: state.requests,
      environments: state.environments,
      snapshots: state.snapshots,
      history: state.history,
      queue: state.queue,
      selectedProjectId: state.selectedProjectId,
      selectedEnvironmentId: state.selectedEnvironmentId,
      selectedRequestId: state.selectedRequestId
    });
  }
}));
