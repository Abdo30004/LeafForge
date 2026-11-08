import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FileEntry, FsChangeEvent } from '../types/ipc';

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
