import { create } from 'zustand';
import { compileDocument } from '../services/tauriClient';
import type {
  CompilerStatus,
  EngineInfo,
  LatexDiagnostic,
  LatexEngine,
  SyncTexCoordinate,
  SystemFontInfo,
} from '../types/latex';
import { useWorkspaceStore } from './useWorkspaceStore';

export interface CompilerState {
  engine: LatexEngine;
  status: CompilerStatus;
  lastBuildDurationMs: number;
  pdfPath: string | null;
  synctexPath: string | null;
  usePreambleCache: boolean;
  diagnostics: LatexDiagnostic[];
  logDrawerOpen: boolean;
  activeLogTab: 'errors' | 'warnings' | 'raw';
  rawLog: string;
  activeSyncTarget: SyncTexCoordinate | null;
  availableEngines: EngineInfo[];
  systemFonts: SystemFontInfo[];
  fontFamilies: string[];
  activeFontFamily: string;

  setEngine: (engine: LatexEngine) => void;
  setStatus: (status: CompilerStatus) => void;
  setPdfPath: (pdfPath: string | null) => void;
  setSynctexPath: (synctexPath: string | null) => void;
  setUsePreambleCache: (enabled: boolean) => void;
  setBuildResult: (
    durationMs: number,
    diagnostics: LatexDiagnostic[],
    log: string,
    pdfPath?: string,
    synctexPath?: string
  ) => void;
  toggleLogDrawer: () => void;
  setLogDrawerOpen: (open: boolean) => void;
  setActiveLogTab: (tab: 'errors' | 'warnings' | 'raw') => void;
  setActiveSyncTarget: (target: SyncTexCoordinate | null) => void;
  setAvailableEngines: (engines: EngineInfo[]) => void;
  setSystemFonts: (fonts: SystemFontInfo[]) => void;
  setFontFamilies: (families: string[]) => void;
  setActiveFontFamily: (family: string) => void;
  runCompile: () => Promise<void>;
}

export const useCompilerStore = create<CompilerState>((set, get) => ({
  engine: 'tectonic',
  status: 'idle',
  lastBuildDurationMs: 0,
  pdfPath: null,
  synctexPath: null,
  usePreambleCache: true,
  diagnostics: [],
  logDrawerOpen: false,
  activeLogTab: 'errors',
  rawLog: '',
  activeSyncTarget: null,
  availableEngines: [],
  systemFonts: [],
  fontFamilies: [],
  activeFontFamily: 'Default',

  setEngine: (engine) => set({ engine }),
  setStatus: (status) => set({ status }),
  setPdfPath: (pdfPath) => set({ pdfPath }),
  setSynctexPath: (synctexPath) => set({ synctexPath }),
  setUsePreambleCache: (usePreambleCache) => set({ usePreambleCache }),
  setBuildResult: (durationMs, diagnostics, log, pdfPath, synctexPath) =>
    set({
      lastBuildDurationMs: durationMs,
      diagnostics,
      rawLog: log,
      pdfPath: pdfPath ?? get().pdfPath,
      synctexPath: synctexPath ?? get().synctexPath,
      status: diagnostics.some((d) => d.severity === 'error')
        ? 'error'
        : diagnostics.some((d) => d.severity === 'warning')
        ? 'warning'
        : 'success',
    }),
  toggleLogDrawer: () => set((state) => ({ logDrawerOpen: !state.logDrawerOpen })),
  setLogDrawerOpen: (open) => set({ logDrawerOpen: open }),
  setActiveLogTab: (activeLogTab) => set({ activeLogTab }),
  setActiveSyncTarget: (activeSyncTarget) => set({ activeSyncTarget }),
  setAvailableEngines: (availableEngines) => set({ availableEngines }),
  setSystemFonts: (systemFonts) => set({ systemFonts }),
  setFontFamilies: (fontFamilies) => set({ fontFamilies }),
  setActiveFontFamily: (activeFontFamily) => set({ activeFontFamily }),

  runCompile: async () => {
    const ws = useWorkspaceStore.getState();
    const workspacePath = ws.workspacePath;
    const rootFile = ws.rootTexFile || ws.activeFilePath || 'main.tex';

    if (!workspacePath) return;

    set({ status: 'compiling' });
    try {
      const result = await compileDocument(
        workspacePath,
        rootFile,
        get().engine,
        get().usePreambleCache
      );

      get().setBuildResult(
        result.durationMs,
        result.diagnostics,
        result.logOutput,
        result.pdfPath,
        result.synctexPath
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      set({
        status: 'error',
        rawLog: errMsg,
        diagnostics: [
          {
            filePath: rootFile,
            line: 1,
            column: 1,
            severity: 'error',
            message: errMsg,
          },
        ],
      });
    }
  },
}));
