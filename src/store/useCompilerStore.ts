import { create } from 'zustand';
import type { CompilerStatus, LatexDiagnostic, LatexEngine } from '../types/latex';

export interface CompilerState {
  engine: LatexEngine;
  status: CompilerStatus;
  lastBuildDurationMs: number;
  diagnostics: LatexDiagnostic[];
  logDrawerOpen: boolean;
  activeLogTab: 'errors' | 'warnings' | 'raw';
  rawLog: string;

  setEngine: (engine: LatexEngine) => void;
  setStatus: (status: CompilerStatus) => void;
  setBuildResult: (durationMs: number, diagnostics: LatexDiagnostic[], log: string) => void;
  toggleLogDrawer: () => void;
  setLogDrawerOpen: (open: boolean) => void;
  setActiveLogTab: (tab: 'errors' | 'warnings' | 'raw') => void;
}

export const useCompilerStore = create<CompilerState>((set) => ({
  engine: 'tectonic',
  status: 'idle',
  lastBuildDurationMs: 0,
  diagnostics: [],
  logDrawerOpen: false,
  activeLogTab: 'errors',
  rawLog: '',

  setEngine: (engine) => set({ engine }),
  setStatus: (status) => set({ status }),
  setBuildResult: (durationMs, diagnostics, log) =>
    set({
      lastBuildDurationMs: durationMs,
      diagnostics,
      rawLog: log,
      status: diagnostics.some((d) => d.severity === 'error') ? 'error' : 'success',
    }),
  toggleLogDrawer: () => set((state) => ({ logDrawerOpen: !state.logDrawerOpen })),
  setLogDrawerOpen: (open) => set({ logDrawerOpen: open }),
  setActiveLogTab: (activeLogTab) => set({ activeLogTab }),
}));
