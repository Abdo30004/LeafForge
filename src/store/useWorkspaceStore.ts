import { create } from 'zustand';
import type { FileEntry } from '../types/ipc';

export type SidebarTab = 'files' | 'outline' | 'git' | 'collab' | 'settings';
export type EditorMode = 'raw' | 'visual';
export type AppTheme = 'dark' | 'light';

export interface WorkspaceState {
  workspacePath: string | null;
  files: FileEntry[];
  activeFilePath: string | null;
  openFiles: string[];
  fileContents: Record<string, string>;
  dirtyFiles: Record<string, boolean>;
  rootTexFile: string | null;
  activeSidebarTab: SidebarTab;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  pdfPanelWidth: number;
  editorMode: EditorMode;
  theme: AppTheme;

  setWorkspacePath: (path: string | null) => void;
  setFiles: (files: FileEntry[]) => void;
  openFile: (path: string, content?: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string) => void;
  setRootTexFile: (path: string | null) => void;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setPdfPanelWidth: (width: number) => void;
  setEditorMode: (mode: EditorMode) => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspacePath: null,
  files: [],
  activeFilePath: null,
  openFiles: [],
  fileContents: {},
  dirtyFiles: {},
  rootTexFile: null,
  activeSidebarTab: 'files',
  sidebarCollapsed: false,
  sidebarWidth: 260,
  pdfPanelWidth: 480,
  editorMode: 'raw',
  theme: 'dark',

  setWorkspacePath: (path) => set({ workspacePath: path }),

  setFiles: (files) => set({ files }),

  openFile: (path, content) =>
    set((state) => {
      const openFiles = state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path];
      const fileContents =
        content !== undefined
          ? { ...state.fileContents, [path]: content }
          : state.fileContents;
      return {
        openFiles,
        fileContents,
        activeFilePath: path,
      };
    }),

  closeFile: (path) =>
    set((state) => {
      const openFiles = state.openFiles.filter((p) => p !== path);
      let activeFilePath = state.activeFilePath;
      if (activeFilePath === path) {
        activeFilePath = openFiles[openFiles.length - 1] ?? null;
      }
      return { openFiles, activeFilePath };
    }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateFileContent: (path, content) =>
    set((state) => ({
      fileContents: { ...state.fileContents, [path]: content },
      dirtyFiles: { ...state.dirtyFiles, [path]: true },
    })),

  markFileSaved: (path) =>
    set((state) => ({
      dirtyFiles: { ...state.dirtyFiles, [path]: false },
    })),

  setRootTexFile: (path) => set({ rootTexFile: path }),

  setActiveSidebarTab: (tab) =>
    set((state) => ({
      activeSidebarTab: tab,
      sidebarCollapsed: state.activeSidebarTab === tab && !state.sidebarCollapsed ? false : false,
    })),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setPdfPanelWidth: (width) => set({ pdfPanelWidth: width }),

  setEditorMode: (editorMode) => set({ editorMode }),

  setTheme: (theme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
      }
      return { theme: next };
    }),
}));
