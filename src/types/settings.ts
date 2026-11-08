export interface ProjectSettings {
  rootFile?: string | null;
  engine?: string | null;
  gitRemote?: string | null;
  gitBranch?: string | null;
  autoCompile?: boolean | null;
  synctexEnabled?: boolean | null;
}

export interface GlobalSettings {
  theme: 'dark' | 'light';
  defaultEngine: string;
  fontSize: number;
  autoCompileDelayMs: number;
}
