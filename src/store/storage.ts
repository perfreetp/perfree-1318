import {
  Project,
  ApiRequest,
  Environment,
  ReplaySnapshot,
  HistoryRecord,
  ReplayQueueItem
} from '@/types';

const STORAGE_KEY = 'api-replay-data';

export interface AppData {
  projects: Project[];
  requests: ApiRequest[];
  environments: Environment[];
  snapshots: ReplaySnapshot[];
  history: HistoryRecord[];
  queue: Record<string, ReplayQueueItem[]>;
  selectedProjectId: string | null;
  selectedEnvironmentId: string | null;
  selectedRequestId: string | null;
}

const defaultData: AppData = {
  projects: [],
  requests: [],
  environments: [],
  snapshots: [],
  history: [],
  queue: {},
  selectedProjectId: null,
  selectedEnvironmentId: null,
  selectedRequestId: null
};

export const loadData = (): AppData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaultData, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Load data failed:', e);
  }
  return defaultData;
};

export const saveData = (data: AppData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Save data failed:', e);
  }
};

export const clearData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
