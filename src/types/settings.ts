export type CompileQuality = 'draft' | 'fast' | 'normal' | 'full';

export interface ProjectSettings {
  rootFile?: string | null;
  engine?: string | null;
  compileTimeoutSecs?: number | null;
  compileQuality?: CompileQuality | null;
  autoSave?: boolean | null;
  autoSaveDelayMs?: number | null;
  gitRemote?: string | null;
  gitBranch?: string | null;
  autoCompile?: boolean | null;
  synctexEnabled?: boolean | null;
  openFiles?: string[] | null;
  activeFile?: string | null;
}

export interface GlobalSettings {
  theme: 'dark' | 'light';
  defaultEngine: string;
  fontSize: number;
  autoCompileDelayMs: number;
  autoSave: boolean;
  autoSaveDelayMs: number;
  compileTimeoutSecs: number;
  compileQuality: CompileQuality;
  lastOpenedWorkspace?: string | null;
  recentWorkspaces: string[];
  restoreWorkspaceState: boolean;
  editorWordWrap: boolean;
}
