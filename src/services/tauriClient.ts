import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FileEntry, FsChangeEvent } from '../types/ipc';
import type { LspCompletionItem, LspHoverResult, LspStatus } from '../types/latex';

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
