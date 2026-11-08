import React, { useEffect, useState } from 'react';
import {
  FileQuestion,
  ExternalLink,
  FolderOpen,
  FileArchive,
  Cpu,
  FileCode,
  File,
} from 'lucide-react';
import { readFileBinary } from '../../services/tauriClient';
import { getFileExtension } from '../../utils/fileCategory';

interface UnsupportedFilePreviewProps {
  filePath: string;
}

export const UnsupportedFilePreview: React.FC<UnsupportedFilePreviewProps> = ({ filePath }) => {
  const [fileSize, setFileSize] = useState<number | null>(null);

  const fileName = filePath.split(/[/\\]/).pop() || 'file';
  const ext = getFileExtension(filePath).toUpperCase() || 'UNKNOWN';

  useEffect(() => {
    let active = true;
    readFileBinary(filePath)
      .then((bytes) => {
        if (active) setFileSize(bytes.length);
      })
      .catch(() => {
        if (active) setFileSize(null);
      });
    return () => {
      active = false;
    };
  }, [filePath]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleOpenExternal = async () => {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(filePath);
    } catch {
      // ignore
    }
  };

  const handleRevealInExplorer = async () => {
    try {
      const parentDir = filePath.replace(/[/\\][^/\\]+$/, '');
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(parentDir);
    } catch {
      // ignore
    }
  };

  const getFileIcon = () => {
    const lowerExt = ext.toLowerCase();
    if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar'].includes(lowerExt)) {
      return <FileArchive className="w-16 h-16 text-amber-400 stroke-1" />;
    }
    if (['exe', 'dll', 'so', 'dylib', 'bin', 'o', 'obj'].includes(lowerExt)) {
      return <Cpu className="w-16 h-16 text-sky-400 stroke-1" />;
    }
    if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(lowerExt)) {
      return <FileCode className="w-16 h-16 text-purple-400 stroke-1" />;
    }
    return <FileQuestion className="w-16 h-16 text-[var(--text-muted)] stroke-1" />;
  };

  return (
    <div
      className="flex flex-col h-full bg-[var(--canvas)] select-none overflow-hidden"
      data-testid="unsupported-file-preview"
    >
      {/* Top Bar */}
      <div className="h-9 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 text-xs shrink-0">
        <div className="flex items-center space-x-2">
          <File className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="font-medium text-[var(--text-primary)] truncate max-w-sm">{fileName}</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--border-subtle)] text-[var(--text-muted)]">
            {ext}
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleOpenExternal}
            className="px-2 py-1 rounded bg-[var(--border-subtle)] hover:bg-[var(--hover-bg)] text-[var(--text-primary)] transition-colors text-xs flex items-center space-x-1"
            title="Open in default system program"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open in System App</span>
          </button>
        </div>
      </div>

      {/* Center Informational Card */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] shadow-lg">
          {getFileIcon()}
        </div>

        <div className="space-y-1.5 max-w-md">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            File format not supported for text editing
          </h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            The file <span className="font-mono text-[var(--text-primary)]">{fileName}</span> is a binary or non-text format ({ext}).
            LeafForge does not display this file type directly in the editor to prevent corruption.
          </p>
        </div>

        {fileSize !== null && (
          <div className="text-xs font-mono text-[var(--text-muted)] bg-[var(--surface-elevated)] px-3 py-1 rounded-full border border-[var(--border-subtle)]">
            Size: {formatSize(fileSize)} ({fileSize.toLocaleString()} bytes)
          </div>
        )}

        <div className="flex items-center space-x-2 pt-2">
          <button
            onClick={handleOpenExternal}
            className="px-3.5 py-1.5 rounded bg-accent-primary hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in System Default App</span>
          </button>

          <button
            onClick={handleRevealInExplorer}
            className="px-3.5 py-1.5 rounded bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium transition-colors flex items-center space-x-1.5"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Show in Folder</span>
          </button>
        </div>
      </div>

      {/* Bottom Status */}
      <div className="h-5 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] px-2.5 flex items-center text-[10px] text-[var(--text-muted)]">
        <span className="truncate">{filePath}</span>
      </div>
    </div>
  );
};
