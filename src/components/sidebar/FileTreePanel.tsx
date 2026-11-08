import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  FolderOpen as FolderOpenIcon,
  FileText,
  FileCode,
  Image as ImageIcon,
  BookOpen,
  FilePlus,
  FolderPlus,
  ImagePlus,
  RefreshCw,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronDown,
  Star,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { FileEntry } from '../../types/ipc';
import {
  openFolder,
  listFiles,
  readFileText,
  createFile,
  createDir,
  renamePath,
  deletePath,
  importBinaryAsset,
  onFsChange,
  watchDirectory,
} from '../../services/tauriClient';

export const FileTreePanel: React.FC = () => {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const files = useWorkspaceStore((s) => s.files);
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const rootTexFile = useWorkspaceStore((s) => s.rootTexFile);
  const dirtyFiles = useWorkspaceStore((s) => s.dirtyFiles);

  const setWorkspacePath = useWorkspaceStore((s) => s.setWorkspacePath);
  const setFiles = useWorkspaceStore((s) => s.setFiles);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const setRootTexFile = useWorkspaceStore((s) => s.setRootTexFile);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [modalState, setModalState] = useState<{
    type: 'createFile' | 'createDir' | 'rename' | null;
    targetPath?: string;
    defaultValue?: string;
  }>({ type: null });
  const [modalInput, setModalInput] = useState('');

  const refreshTree = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const tree = await listFiles(workspacePath);
      setFiles(tree);
    } catch (err) {
      console.error('Failed to list files:', err);
    }
  }, [workspacePath, setFiles]);

  // Listen for background filesystem changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      try {
        unlisten = await onFsChange(() => {
          refreshTree();
        });
      } catch (e) {
        console.warn('Filesystem change listener not active outside Tauri:', e);
      }
    };
    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshTree]);

  const handleOpenFolder = async () => {
    try {
      const selected = await openFolder();
      if (selected) {
        setWorkspacePath(selected);
        const tree = await listFiles(selected);
        setFiles(tree);
        await watchDirectory(selected);

        // Auto-detect root .tex file if main.tex exists
        const findMain = (entries: FileEntry[]): string | null => {
          for (const e of entries) {
            if (!e.isDirectory && (e.name === 'main.tex' || e.name.endsWith('.tex'))) {
              return e.path;
            }
            if (e.children) {
              const res = findMain(e.children);
              if (res) return res;
            }
          }
          return null;
        };

        const rootCandidate = findMain(tree);
        if (rootCandidate) {
          setRootTexFile(rootCandidate);
        }
      }
    } catch (err) {
      console.error('Error opening folder:', err);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleFolder(entry.path);
      return;
    }

    try {
      const content = await readFileText(entry.path);
      openFile(entry.path, content);
    } catch (err) {
      console.error('Failed to read file:', err);
      openFile(entry.path, '');
    }
  };

  const handleCreateFileSubmit = async () => {
    if (!modalInput.trim() || !workspacePath) return;
    try {
      const parentDir = modalState.targetPath ?? workspacePath;
      const newPath = `${parentDir.replace(/\\/g, '/')}/${modalInput.trim()}`;
      await createFile(newPath);
      setModalState({ type: null });
      setModalInput('');
      await refreshTree();
      openFile(newPath, '');
    } catch (err) {
      console.error('Failed to create file:', err);
    }
  };

  const handleCreateDirSubmit = async () => {
    if (!modalInput.trim() || !workspacePath) return;
    try {
      const parentDir = modalState.targetPath ?? workspacePath;
      const newPath = `${parentDir.replace(/\\/g, '/')}/${modalInput.trim()}`;
      await createDir(newPath);
      setModalState({ type: null });
      setModalInput('');
      await refreshTree();
    } catch (err) {
      console.error('Failed to create directory:', err);
    }
  };

  const handleRenameSubmit = async () => {
    if (!modalInput.trim() || !modalState.targetPath) return;
    try {
      const oldPath = modalState.targetPath;
      const norm = oldPath.replace(/\\/g, '/');
      const parentDir = norm.substring(0, norm.lastIndexOf('/'));
      const newPath = `${parentDir}/${modalInput.trim()}`;
      await renamePath(oldPath, newPath);
      setModalState({ type: null });
      setModalInput('');
      await refreshTree();
    } catch (err) {
      console.error('Failed to rename path:', err);
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;
    try {
      await deletePath(path);
      await refreshTree();
    } catch (err) {
      console.error('Failed to delete path:', err);
    }
  };

  const handleImportAsset = async () => {
    if (!workspacePath) return;
    const source = prompt('Enter absolute path of image/asset to import (.png, .pdf, .eps):');
    if (!source || !source.trim()) return;
    try {
      const destDir = `${workspacePath.replace(/\\/g, '/')}/figures`;
      await importBinaryAsset(destDir, source.trim());
      await refreshTree();
    } catch (err) {
      console.error('Failed to import asset:', err);
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'tex') return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (ext === 'bib') return <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    if (ext === 'cls' || ext === 'sty')
      return <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    if (['png', 'pdf', 'eps', 'jpg', 'jpeg', 'svg'].includes(ext ?? ''))
      return <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />;
  };

  const renderEntry = (entry: FileEntry, depth = 0) => {
    const isExpanded = expandedFolders[entry.path] ?? depth === 0;
    const isActive = activeFilePath === entry.path;
    const isRoot = rootTexFile === entry.path;
    const isDirty = dirtyFiles[entry.path] ?? false;

    return (
      <div key={entry.path} className="flex flex-col select-none">
        <div
          onClick={() => handleFileClick(entry)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className={`group flex items-center justify-between py-1 pr-2 text-xs cursor-pointer transition-colors ${
            isActive
              ? 'bg-[var(--active-bg)] text-accent-primary font-medium'
              : 'text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0 truncate">
            {entry.isDirectory ? (
              <span className="text-[var(--text-muted)] shrink-0">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}

            {entry.isDirectory ? (
              isExpanded ? (
                <FolderOpenIcon className="w-3.5 h-3.5 text-accent-primary shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-accent-primary shrink-0" />
              )
            ) : (
              getFileIcon(entry.name)
            )}

            <span className="truncate">{entry.name}</span>

            {isRoot && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20 shrink-0">
                ROOT
              </span>
            )}

            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary shrink-0" />
            )}
          </div>

          {/* Hover Actions */}
          <div className="hidden group-hover:flex items-center space-x-1 shrink-0 text-[var(--text-muted)]">
            {!entry.isDirectory && entry.name.endsWith('.tex') && !isRoot && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRootTexFile(entry.path);
                }}
                title="Set as Root TeX File"
                className="hover:text-emerald-400 p-0.5"
              >
                <Star className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setModalState({
                  type: 'rename',
                  targetPath: entry.path,
                  defaultValue: entry.name,
                });
                setModalInput(entry.name);
              }}
              title="Rename"
              className="hover:text-[var(--text-primary)] p-0.5"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(entry.path);
              }}
              title="Delete"
              className="hover:text-rose-400 p-0.5"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {entry.isDirectory && isExpanded && entry.children && (
          <div className="flex flex-col">
            {entry.children.map((child) => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-elevated)] text-[var(--text-primary)] overflow-hidden">
      {/* Explorer Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--text-muted)]">
          Explorer
        </span>

        {workspacePath && (
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                setModalState({ type: 'createFile' });
                setModalInput('');
              }}
              className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="New LaTeX File"
            >
              <FilePlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setModalState({ type: 'createDir' });
                setModalInput('');
              }}
              className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="New Directory"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleImportAsset}
              className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Import Figure Asset"
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={refreshTree}
              className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Refresh Files"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main File List or Empty State */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {!workspacePath ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center space-y-3">
            <Folder className="w-10 h-10 text-[var(--text-muted)] stroke-1" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--text-primary)]">
                No Folder Opened
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Open a local folder to start writing LaTeX documents.
              </p>
            </div>
            <button
              onClick={handleOpenFolder}
              className="px-3 py-1.5 rounded-md bg-accent-primary text-black font-medium text-xs hover:opacity-90 transition-opacity"
            >
              Open Folder
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text-muted)]">
            Empty workspace. Create a file above.
          </div>
        ) : (
          files.map((entry) => renderEntry(entry))
        )}
      </div>

      {/* Input Modal for Create / Rename */}
      {modalState.type && (
        <div className="p-2 border-t border-[var(--border-subtle)] bg-[var(--surface-panel)]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (modalState.type === 'createFile') handleCreateFileSubmit();
              if (modalState.type === 'createDir') handleCreateDirSubmit();
              if (modalState.type === 'rename') handleRenameSubmit();
            }}
            className="flex flex-col space-y-1.5"
          >
            <label className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">
              {modalState.type === 'createFile' && 'New File Name:'}
              {modalState.type === 'createDir' && 'New Directory Name:'}
              {modalState.type === 'rename' && 'Rename Path:'}
            </label>
            <input
              autoFocus
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              placeholder={
                modalState.type === 'createFile'
                  ? 'e.g. sections/methods.tex'
                  : 'e.g. chapters'
              }
              className="w-full px-2 py-1 text-xs rounded bg-[var(--canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary"
            />
            <div className="flex justify-end space-x-1">
              <button
                type="button"
                onClick={() => setModalState({ type: null })}
                className="px-2 py-0.5 rounded text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2 py-0.5 rounded text-[11px] bg-accent-primary text-black font-medium"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
