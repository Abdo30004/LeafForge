export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: number;
  children?: FileEntry[];
}

export interface AppErrorPayload {
  code: string;
  message: string;
  details?: string;
}

export type FsChangeKind = 'create' | 'modify' | 'remove' | 'rename' | 'other';

export interface FsChangeEvent {
  paths: string[];
  kind: FsChangeKind;
}
