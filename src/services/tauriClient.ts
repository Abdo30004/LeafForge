import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FileEntry, FsChangeEvent } from '../types/ipc';
import type {
  CompilationResult,
  EngineInfo,
  LatexEngine,
  LspCompletionItem,
  LspHoverResult,
  LspStatus,
  MagicComments,
  SyncTexCoordinate,
  SyncTexInverseResult,
  SystemFontInfo,
} from '../types/latex';

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export async function openFolder(path?: string): Promise<string | null> {
  return invoke<string | null>('open_folder', { path });
}

export async function listFiles(dirPath: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_files', { dirPath });
}

export async function readFileText(path: string): Promise<string> {
  return invoke<string>('read_file_text', { path });
}

export async function writeFileText(path: string, content: string): Promise<void> {
  return invoke<void>('write_file_text', { path, content });
}

export async function createFile(path: string): Promise<void> {
  return invoke<void>('create_file', { path });
}

export async function createDir(path: string): Promise<void> {
  return invoke<void>('create_dir', { path });
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  return invoke<void>('rename_path', { oldPath, newPath });
}

export async function deletePath(path: string): Promise<void> {
  return invoke<void>('delete_path', { path });
}

export async function importBinaryAsset(targetDir: string, sourcePath: string): Promise<string> {
  return invoke<string>('import_binary_asset', { targetDir, sourcePath });
}

export async function watchDirectory(dirPath: string): Promise<void> {
  return invoke<void>('watch_directory', { dirPath });
}

export async function unwatchDirectory(): Promise<void> {
  return invoke<void>('unwatch_directory');
}

export async function onFsChange(callback: (event: FsChangeEvent) => void): Promise<UnlistenFn> {
  return listen<FsChangeEvent>('workspace://fs-change', (e) => {
    callback(e.payload);
  });
}

// LSP Client IPC bridges
export async function lspStart(rootPath?: string): Promise<LspStatus> {
  if (!isTauriEnvironment()) {
    return {
      running: true,
      server: 'Embedded TeX Mock Service',
      binary_found: false,
      message: 'Running in browser preview mode',
    };
  }
  return invoke<LspStatus>('lsp_start', { rootPath });
}

export async function lspStop(): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('lsp_stop');
}

export async function lspStatus(): Promise<LspStatus> {
  if (!isTauriEnvironment()) {
    return {
      running: true,
      server: 'Embedded TeX Mock Service',
      binary_found: false,
      message: 'Running in browser preview mode',
    };
  }
  return invoke<LspStatus>('lsp_status');
}

export async function lspDidOpen(uri: string, text: string, version = 1): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('lsp_did_open', { uri, text, version });
}

export async function lspDidChange(uri: string, text: string, version = 1): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('lsp_did_change', { uri, text, version });
}

export async function lspCompletion(
  uri: string,
  line: number,
  character: number
): Promise<LspCompletionItem[]> {
  if (!isTauriEnvironment()) return [];
  return invoke<LspCompletionItem[]>('lsp_completion', { uri, line, character });
}

export async function lspHover(
  uri: string,
  line: number,
  character: number
): Promise<LspHoverResult | null> {
  if (!isTauriEnvironment()) return null;
  return invoke<LspHoverResult | null>('lsp_hover', { uri, line, character });
}

// Compiler & Multi-Engine Pool IPC bridges
export async function compileDocument(
  projectDir: string,
  rootFile: string,
  engineOverride?: LatexEngine,
  usePreambleCache = true
): Promise<CompilationResult> {
  if (!isTauriEnvironment()) {
    return {
      success: true,
      engine: engineOverride || 'tectonic',
      durationMs: 42,
      pdfPath: `${projectDir}/${rootFile.replace(/\.tex$/, '.pdf')}`,
      diagnostics: [],
      logOutput: 'Mock browser compile successful.',
    };
  }
  return invoke<CompilationResult>('compile_document', {
    projectDir,
    rootFile,
    engineOverride,
    usePreambleCache,
  });
}

export async function detectEngines(): Promise<EngineInfo[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        engine: 'tectonic',
        name: 'Tectonic (Auto-CTAN / XeTeX)',
        available: true,
        version: '0.15.0',
        supportsSynctex: true,
        supportsFmtCache: false,
      },
      {
        engine: 'lualatex',
        name: 'LuaLaTeX',
        available: false,
        supportsSynctex: true,
        supportsFmtCache: true,
      },
      {
        engine: 'xelatex',
        name: 'XeLaTeX',
        available: false,
        supportsSynctex: true,
        supportsFmtCache: true,
      },
      {
        engine: 'pdflatex',
        name: 'pdfLaTeX',
        available: false,
        supportsSynctex: true,
        supportsFmtCache: true,
      },
    ];
  }
  return invoke<EngineInfo[]>('detect_engines');
}

export async function abortCompilation(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  return invoke<boolean>('abort_compilation');
}

export async function cleanAuxFiles(projectDir: string, rootFile: string): Promise<string[]> {
  if (!isTauriEnvironment()) return [];
  return invoke<string[]>('clean_aux_files', { projectDir, rootFile });
}

export async function parseMagicComments(filePath: string): Promise<MagicComments> {
  if (!isTauriEnvironment()) return {};
  return invoke<MagicComments>('parse_magic_comments', { filePath });
}

// SyncTeX Bridges
export async function synctexForward(
  projectDir: string,
  rootFile: string,
  file: string,
  line: number,
  column: number
): Promise<SyncTexCoordinate | null> {
  if (!isTauriEnvironment()) {
    return { page: 1, x: 72, y: 150, width: 250, height: 18 };
  }
  return invoke<SyncTexCoordinate | null>('synctex_forward', {
    projectDir,
    rootFile,
    file,
    line,
    column,
  });
}

export async function synctexInverse(
  projectDir: string,
  rootFile: string,
  page: number,
  x: number,
  y: number
): Promise<SyncTexInverseResult | null> {
  if (!isTauriEnvironment()) {
    return { file: rootFile, line: 1, column: 1 };
  }
  return invoke<SyncTexInverseResult | null>('synctex_inverse', {
    projectDir,
    rootFile,
    page,
    x,
    y,
  });
}

// Font Discovery Bridges
export async function listSystemFonts(): Promise<SystemFontInfo[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        family: 'Amiri',
        postscriptName: 'Amiri-Regular',
        style: 'Normal',
        weight: 400,
        isMonospace: false,
      },
      {
        family: 'JetBrains Mono',
        postscriptName: 'JetBrainsMono-Regular',
        style: 'Normal',
        weight: 400,
        isMonospace: true,
      },
    ];
  }
  return invoke<SystemFontInfo[]>('list_system_fonts');
}

export async function listFontFamilies(): Promise<string[]> {
  if (!isTauriEnvironment()) {
    return ['Amiri', 'JetBrains Mono', 'Inter', 'Scheherazade New', 'Frank Ruhl Libre'];
  }
  return invoke<string[]>('list_font_families');
}
