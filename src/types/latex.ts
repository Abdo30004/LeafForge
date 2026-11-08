export type LatexEngine = 'tectonic' | 'lualatex' | 'xelatex' | 'pdflatex';

export type CompilerStatus = 'idle' | 'compiling' | 'success' | 'warning' | 'error';

export interface SyncTexCoordinate {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SyncTexInverseResult {
  file: string;
  line: number;
  column: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface LatexDiagnostic {
  filePath: string;
  line: number;
  column: number;
  severity: DiagnosticSeverity;
  message: string;
  rawLogSnippet?: string;
}

export interface CompilationResult {
  success: boolean;
  engine: LatexEngine;
  durationMs: number;
  pdfPath?: string;
  diagnostics: LatexDiagnostic[];
  logOutput: string;
}
