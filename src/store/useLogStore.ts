import { create } from 'zustand';
import type { LogEntry, LogLevel } from '../types/ipc';
import {
  getRecentLogs,
  clearAppLogs as clearBackendLogs,
  openLogFile as openBackendLogFile,
  getLogFilePath,
} from '../services/tauriClient';

const MAX_STORED_LOGS = 1000;

export interface LogStoreState {
  logs: LogEntry[];
  searchFilter: string;
  levelFilter: LogLevel | 'ALL';
  logFilePath: string | null;

  addLog: (entry: LogEntry) => void;
  setLogs: (logs: LogEntry[]) => void;
  clearLogs: () => Promise<void>;
  loadLogsFromDisk: (limit?: number) => Promise<void>;
  loadRecentLogs: (limit?: number) => Promise<void>;
  setSearchFilter: (search: string) => void;
  setLevelFilter: (level: LogLevel | 'ALL') => void;
  openLogFile: () => Promise<void>;
  fetchLogFilePath: () => Promise<void>;
  filteredLogs: () => LogEntry[];
}

export const useLogStore = create<LogStoreState>((set, get) => ({
  logs: [],
  searchFilter: '',
  levelFilter: 'ALL',
  logFilePath: null,

  addLog: (entry) =>
    set((state) => {
      const next = [entry, ...state.logs];
      if (next.length > MAX_STORED_LOGS) {
        next.length = MAX_STORED_LOGS;
      }
      return { logs: next };
    }),

  setLogs: (logs) => set({ logs }),

  clearLogs: async () => {
    try {
      await clearBackendLogs();
    } catch {
      // ignore
    }
    set({ logs: [] });
  },

  loadLogsFromDisk: async (limit = 200) => {
    try {
      const diskLogs = await getRecentLogs(limit);
      if (diskLogs && diskLogs.length > 0) {
        set({ logs: diskLogs });
      }
    } catch (e) {
      console.warn('Failed to load logs from disk:', e);
    }
  },

  loadRecentLogs: async (limit = 200) => {
    await get().loadLogsFromDisk(limit);
    await get().fetchLogFilePath();
  },

  setSearchFilter: (searchFilter) => set({ searchFilter }),

  setLevelFilter: (levelFilter) => set({ levelFilter }),

  openLogFile: async () => {
    try {
      await openBackendLogFile();
    } catch (e) {
      console.error('Failed to open log file:', e);
    }
  },

  fetchLogFilePath: async () => {
    try {
      const path = await getLogFilePath();
      if (path) {
        set({ logFilePath: path });
      }
    } catch {
      // ignore
    }
  },

  filteredLogs: () => {
    const { logs, searchFilter, levelFilter } = get();
    return logs.filter((entry) => {
      if (levelFilter !== 'ALL' && entry.level !== levelFilter) {
        return false;
      }
      if (searchFilter.trim().length > 0) {
        const query = searchFilter.toLowerCase();
        const msgMatch = entry.message.toLowerCase().includes(query);
        const targetMatch = entry.target.toLowerCase().includes(query);
        const detailsMatch = entry.details?.toLowerCase().includes(query) ?? false;
        return msgMatch || targetMatch || detailsMatch;
      }
      return true;
    });
  },
}));
