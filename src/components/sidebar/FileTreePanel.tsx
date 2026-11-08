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
  AlertCircle,
  X,
  Eye,
  EyeOff,
  FileQuestion,
  Copy,
  Files,
  ExternalLink,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { FileEntry } from '../../types/ipc';
import { getFileCategory, isBuildArtifact } from '../../utils/fileCategory';
import {
  openFolder,
  listFiles,
  readFileText,
  createFile,
  createDir,
  renamePath,
  deletePath,
  duplicateFile,
  revealInExplorer,
  openExternalPath,
  importBinaryAsset,
  pickAndImportAssets,
  isTauriEnvironment,
  onFsChange,
  watchDirectory,
} from '../../services/tauriClient';
import { formatErrorMessage, formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';
import { copyToClipboard } from '../../utils/clipboard';
import { dialog } from '../../services/dialog';

const getRelativePath = (fullPath: string, rootDir?: string | null): string => {
  if (!rootDir) return fullPath;
  const normRoot = rootDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const normPath = fullPath.replace(/\\/g, '/');
  if (normPath.startsWith(normRoot + '/')) {
    return normPath.slice(normRoot.length + 1);
  }
  return normPath;
};

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry?: FileEntry;
    isRoot?: boolean;
  } | null>(null);

  const refreshTree = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const tree = await listFiles(workspacePath);
      setFiles(tree);
    } catch (err) {
      logger.warn('FileSystem', 'Failed to list files in workspace', {
        error: formatErrorDetails(err),
        workspacePath,
      });
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
        logger.debug('FileSystem', 'Filesystem change listener inactive outside Tauri', {
          error: formatErrorDetails(e),
        });
      }
    };
    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshTree]);

  const handleOpenFolder = async () => {
    setErrorMsg(null);
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
        logger.info('FileSystem', `Opened workspace folder: ${selected}`);
      }
    } catch (err) {
      const msg = formatErrorMessage(err, 'Failed to open workspace folder');
      logger.error('FileSystem', 'Failed to open workspace folder', {
        error: formatErrorDetails(err),
      });
      setErrorMsg(msg);
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

    const category = getFileCategory(entry.path);
    if (category === 'text') {
      try {
        const content = await readFileText(entry.path);
        openFile(entry.path, content);
      } catch (err) {
        const msg = formatErrorMessage(err, `Failed to read file: ${entry.name}`);
        logger.error('FileSystem', `Failed to read file: ${entry.path}`, {
          error: formatErrorDetails(err),
          path: entry.path,
        });
        setErrorMsg(msg);
        openFile(entry.path, '');
      }
    } else {
      // For images, PDFs, and unsupported formats, open directly without UTF-8 string parse
      openFile(entry.path, '');
    }
  };

  const handleCreateFileSubmit = async () => {
    if (!modalInput.trim() || !workspacePath) return;
    setErrorMsg(null);
    const parentDir = modalState.targetPath ?? workspacePath;
    const newPath = `${parentDir.replace(/\\/g, '/')}/${modalInput.trim()}`;
    try {
      await createFile(newPath);
      setModalState({ type: null });
      setModalInput('');
      logger.info('FileSystem', `Created file: ${newPath}`);
      await refreshTree();
      openFile(newPath, '');
    } catch (err) {
      const msg = formatErrorMessage(err, `Failed to create file: ${modalInput.trim()}`);
      logger.error('FileSystem', 'Failed to create file', {
        error: formatErrorDetails(err),
        path: newPath,
      });
      setErrorMsg(msg);
    }
  };

  const handleCreateDirSubmit = async () => {
    if (!modalInput.trim() || !workspacePath) return;
    setErrorMsg(null);
    const parentDir = modalState.targetPath ?? workspacePath;
    const newPath = `${parentDir.replace(/\\/g, '/')}/${modalInput.trim()}`;
    try {
      await createDir(newPath);
      setModalState({ type: null });
      setModalInput('');
      logger.info('FileSystem', `Created directory: ${newPath}`);
      await refreshTree();
    } catch (err) {
      const msg = formatErrorMessage(err, `Failed to create directory: ${modalInput.trim()}`);
      logger.error('FileSystem', 'Failed to create directory', {
        error: formatErrorDetails(err),
        path: newPath,
      });
      setErrorMsg(msg);
    }
  };

  const handleRenameSubmit = async () => {
    if (!modalInput.trim() || !modalState.targetPath) return;
    setErrorMsg(null);
    const oldPath = modalState.targetPath;
    const norm = oldPath.replace(/\\/g, '/');
    const parentDir = norm.substring(0, norm.lastIndexOf('/'));
    const newPath = `${parentDir}/${modalInput.trim()}`;
    try {
      await renamePath(oldPath, newPath);
      setModalState({ type: null });
      setModalInput('');
      logger.info('FileSystem', `Renamed: ${oldPath} -> ${newPath}`);
      await refreshTree();
    } catch (err) {
      const msg = formatErrorMessage(err, `Failed to rename: ${oldPath}`);
      logger.error('FileSystem', 'Failed to rename path', {
        error: formatErrorDetails(err),
        oldPath,
        newPath,
      });
      setErrorMsg(msg);
    }
  };

  const handleDelete = async (path: string) => {
    const fileName = path.split(/[/\\]/).pop() || path;
    const confirmed = await dialog.confirm({
      title: 'Delete Item',
      message: `Are you sure you want to permanently delete "${fileName}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      isDestructive: true,
    });
    if (!confirmed) return;
    setErrorMsg(null);
    try {
      await deletePath(path);
      logger.info('FileSystem', `Deleted path: ${path}`);
      await refreshTree();
    } catch (err) {
      const msg = formatErrorMessage(err, `Failed to delete: ${path}`);
      logger.error('FileSystem', 'Failed to delete path', {
        error: formatErrorDetails(err),
        path,
      });
      setErrorMsg(msg);
    }
  };

  const handleDuplicate = async (sourcePath: string) => {
    setErrorMsg(null);
    try {
      const newPath = await duplicateFile(sourcePath);
      logger.info('FileSystem', `Duplicated: ${sourcePath} -> ${newPath}`);
      await refreshTree();
    } catch (err) {
      const msg = formatErrorMessage(err, `Failed to duplicate file`);
      logger.error('FileSystem', 'Failed to duplicate file', {
        error: formatErrorDetails(err),
        sourcePath,
      });
      setErrorMsg(msg);
    }
  };

  const handleCopy = async (text: string, description = 'Copied to clipboard') => {
    const ok = await copyToClipboard(text);
    if (ok) {
      logger.info('Clipboard', `${description}: ${text}`);
    }
  };

  const handleImportAsset = async (targetDirectory?: string) => {
    if (!workspacePath) return;
    setErrorMsg(null);
    try {
      const destDir = targetDirectory ?? `${workspacePath.replace(/\\/g, '/')}/figures`;
      if (isTauriEnvironment()) {
        const imported = await pickAndImportAssets(destDir);
        if (imported.length > 0) {
          logger.info('FileSystem', `Imported ${imported.length} asset(s) into ${destDir}: ${imported.join(', ')}`);
          await refreshTree();
        }
        return;
      }

      // Browser fallback prompt
      const source = await dialog.prompt({
        title: 'Import Asset',
        message: 'Enter absolute path of image or asset to import (.png, .pdf, .eps, .jpg):',
        placeholder: 'C:\\path\\to\\figure.png',
        confirmLabel: 'Import Asset',
      });
      if (!source || !source.trim()) return;
      await importBinaryAsset(destDir, source.trim());
      logger.info('FileSystem', `Imported asset from ${source.trim()} into ${destDir}`);
      await refreshTree();
    } catch (err) {
      const msg = formatErrorMessage(err, 'Failed to import asset');
      logger.error('FileSystem', 'Failed to import asset', {
        error: formatErrorDetails(err),
      });
      setErrorMsg(msg);
    }
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];

    if (contextMenu.isRoot || !contextMenu.entry) {
      return [
        {
          label: 'New LaTeX File',
          icon: FilePlus,
          action: () => {
            setModalState({ type: 'createFile' });
            setModalInput('');
          },
        },
        {
          label: 'New Directory',
          icon: FolderPlus,
          action: () => {
            setModalState({ type: 'createDir' });
            setModalInput('');
          },
        },
        {
          label: 'Import Figure Asset...',
          icon: ImagePlus,
          action: () => handleImportAsset(),
        },
        { divider: true },
        {
          label: 'Refresh Files',
          icon: RefreshCw,
          action: () => refreshTree(),
        },
        {
          label: showHidden ? 'Hide Build Artifacts' : 'Show Build Artifacts',
          icon: showHidden ? EyeOff : Eye,
          action: () => setShowHidden((prev) => !prev),
        },
        ...(workspacePath
          ? [
              { divider: true },
              {
                label: 'Copy Workspace Path',
                icon: Copy,
                action: () => handleCopy(workspacePath, 'Copied workspace path'),
              },
              {
                label: 'Reveal in File Explorer',
                icon: FolderOpenIcon,
                action: () => revealInExplorer(workspacePath),
              },
            ]
          : []),
      ];
    }

    const { entry } = contextMenu;
    const isTex = !entry.isDirectory && entry.name.endsWith('.tex');
    const isImage = !entry.isDirectory && getFileCategory(entry.name) === 'image';
    const isBib = !entry.isDirectory && entry.name.endsWith('.bib');
    const isRoot = rootTexFile === entry.path;
    const relPath = getRelativePath(entry.path, workspacePath);

    if (entry.isDirectory) {
      return [
        {
          label: 'New File Here...',
          icon: FilePlus,
          action: () => {
            setModalState({ type: 'createFile', targetPath: entry.path });
            setModalInput('');
          },
        },
        {
          label: 'New Subdirectory...',
          icon: FolderPlus,
          action: () => {
            setModalState({ type: 'createDir', targetPath: entry.path });
            setModalInput('');
          },
        },
        {
          label: 'Import Figure Here...',
          icon: ImagePlus,
          action: () => handleImportAsset(entry.path),
        },
        { divider: true },
        {
          label: 'Copy Relative Path',
          icon: Copy,
          action: () => handleCopy(relPath, 'Copied relative path'),
        },
        {
          label: 'Copy Absolute Path',
          icon: Copy,
          action: () => handleCopy(entry.path, 'Copied absolute path'),
        },
        { divider: true },
        {
          label: 'Rename Folder',
          icon: Edit2,
          shortcut: 'F2',
          action: () => {
            setModalState({
              type: 'rename',
              targetPath: entry.path,
              defaultValue: entry.name,
            });
            setModalInput(entry.name);
          },
        },
        {
          label: 'Duplicate Folder',
          icon: Files,
          action: () => handleDuplicate(entry.path),
        },
        {
          label: 'Delete Folder',
          icon: Trash2,
          shortcut: 'Del',
          danger: true,
          action: () => handleDelete(entry.path),
        },
        { divider: true },
        {
          label: 'Open Folder in Default App',
          icon: ExternalLink,
          action: () => openExternalPath(entry.path),
        },
        {
          label: 'Reveal in File Explorer',
          icon: FolderOpenIcon,
          action: () => revealInExplorer(entry.path),
        },
      ];
    }

    // Single File entries
    const items: ContextMenuItem[] = [
      {
        label: 'Open',
        icon: FileText,
        action: () => handleFileClick(entry),
      },
    ];

    if (isTex && !isRoot) {
      items.push({
        label: 'Set as Root TeX Document',
        icon: Star,
        action: () => setRootTexFile(entry.path),
      });
    }

    if (isTex) {
      items.push({
        label: 'Copy \\input{...} Macro',
        icon: FileCode,
        action: () => {
          const macro = `\\input{${relPath.replace(/\.tex$/i, '')}}`;
          handleCopy(macro, 'Copied LaTeX input macro');
        },
      });
    } else if (isImage) {
      items.push({
        label: 'Copy \\includegraphics Macro',
        icon: ImageIcon,
        action: () => {
          const figName = entry.name.replace(/\.[^/.]+$/, '');
          const snippet = `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${relPath}}\n  \\caption{${figName}}\n  \\label{fig:${figName.toLowerCase().replace(/[^a-z0-9]/g, '_')}}\n\\end{figure}`;
          handleCopy(snippet, 'Copied figure environment');
        },
      });
    } else if (isBib) {
      items.push({
        label: 'Copy \\addbibresource Macro',
        icon: BookOpen,
        action: () => {
          const snippet = `\\addbibresource{${relPath}}`;
          handleCopy(snippet, 'Copied bib macro');
        },
      });
    }

    items.push(
      { divider: true },
      {
        label: 'Copy Relative Path',
        icon: Copy,
        action: () => handleCopy(relPath, 'Copied relative path'),
      },
      {
        label: 'Copy Absolute Path',
        icon: Copy,
        action: () => handleCopy(entry.path, 'Copied absolute path'),
      },
      { divider: true },
      {
        label: 'Rename',
        icon: Edit2,
        shortcut: 'F2',
        action: () => {
          setModalState({
            type: 'rename',
            targetPath: entry.path,
            defaultValue: entry.name,
          });
          setModalInput(entry.name);
        },
      },
      {
        label: 'Duplicate File',
        icon: Files,
        action: () => handleDuplicate(entry.path),
      },
      {
        label: 'Delete File',
        icon: Trash2,
        shortcut: 'Del',
        danger: true,
        action: () => handleDelete(entry.path),
      },
      { divider: true },
      {
        label: 'Open in Default App',
        icon: ExternalLink,
        action: () => openExternalPath(entry.path),
      },
      {
        label: 'Reveal in File Explorer',
        icon: FolderOpenIcon,
        action: () => revealInExplorer(entry.path),
      }
    );

    return items;
  };

  const getFileIcon = (fileName: string) => {
    const category = getFileCategory(fileName);
    if (category === 'image') return <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (category === 'pdf') return <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    if (category === 'unsupported') return <FileQuestion className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />;

    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'tex') return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (ext === 'bib') return <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    if (ext === 'cls' || ext === 'sty')
      return <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />;
  };

  const renderEntry = (entry: FileEntry, depth = 0) => {
    const isArtifact = isBuildArtifact(entry.name);
    if (!showHidden && isArtifact) {
      return null;
    }

    const isExpanded = expandedFolders[entry.path] ?? depth === 0;
    const isActive = activeFilePath === entry.path;
    const isRoot = rootTexFile === entry.path;
    const isDirty = dirtyFiles[entry.path] ?? false;

    return (
      <div key={entry.path} className={`flex flex-col select-none ${isArtifact ? 'opacity-60' : ''}`}>
        <div
          onClick={() => handleFileClick(entry)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              entry,
            });
          }}
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

            {isArtifact && (
              <span className="text-[9px] px-1 rounded bg-[var(--border-subtle)] text-[var(--text-muted)] font-mono shrink-0">
                build
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
              onClick={() => handleImportAsset()}
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
            <button
              onClick={() => setShowHidden((prev) => !prev)}
              className={`p-1 rounded transition-colors ${
                showHidden
                  ? 'text-accent-primary bg-[var(--hover-bg)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
              }`}
              title={
                showHidden
                  ? 'Hide build artifacts (.aux, .log, .synctex)'
                  : 'Show build artifacts (.aux, .log, .synctex)'
              }
            >
              {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Error Feedback Banner */}
      {errorMsg && (
        <div className="p-2.5 mx-2 my-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start justify-between space-x-2 shrink-0">
          <div className="flex items-start space-x-1.5 flex-1 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
            <span className="break-words leading-relaxed">{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="p-0.5 text-rose-400/80 hover:text-rose-300 rounded cursor-pointer"
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main File List or Empty State */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        onContextMenu={(e) => {
          if (workspacePath) {
            e.preventDefault();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              isRoot: true,
            });
          }
        }}
      >
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

      {/* Desktop Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
