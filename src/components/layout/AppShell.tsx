import React, { useRef, useEffect, useState } from 'react';
import { TopHeaderBar } from './TopHeaderBar';
import { ActivityRail } from './ActivityRail';
import { SidebarPanel } from './SidebarPanel';
import { StatusBar } from './StatusBar';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useCompilerStore } from '../../store/useCompilerStore';
import { writeFileText, onFsChange, revealInExplorer, openExternalPath } from '../../services/tauriClient';
import { LatexEditor } from '../../editor/LatexEditor';
import { PdfViewport } from '../pdf/PdfViewport';
import { BuildLogDrawer } from '../diagnostics/BuildLogDrawer';
import { GithubDeviceModal } from '../modals/GithubDeviceModal';
import { ConflictModal } from '../modals/ConflictModal';
import { CommandPalette } from '../modals/CommandPalette';
import { formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';
import { ImagePreview } from '../preview/ImagePreview';
import { PdfDocumentPreview } from '../preview/PdfDocumentPreview';
import { UnsupportedFilePreview } from '../preview/UnsupportedFilePreview';
import { getFileCategory } from '../../utils/fileCategory';
import {
  X,
  FileCode,
  FileText,
  BookOpen,
  Image as ImageIcon,
  FileQuestion,
  Copy,
  ExternalLink,
  FolderOpen,
  ArrowRight,
} from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';
import { copyToClipboard } from '../../utils/clipboard';

export const AppShell: React.FC = () => {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const fileContents = useWorkspaceStore((s) => s.fileContents);
  const dirtyFiles = useWorkspaceStore((s) => s.dirtyFiles);
  const pdfPanelWidth = useWorkspaceStore((s) => s.pdfPanelWidth);
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const runCompile = useCompilerStore((s) => s.runCompile);

  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const closeOtherFiles = useWorkspaceStore((s) => s.closeOtherFiles);
  const closeFilesToRight = useWorkspaceStore((s) => s.closeFilesToRight);
  const closeAllFiles = useWorkspaceStore((s) => s.closeAllFiles);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const setPdfPanelWidth = useWorkspaceStore((s) => s.setPdfPanelWidth);

  const isResizingPdfRef = useRef(false);
  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number;
    y: number;
    filePath?: string;
  } | null>(null);

  // Global suppression of default browser/webview context menu across desktop app
  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleGlobalContextMenu);
    return () => window.removeEventListener('contextmenu', handleGlobalContextMenu);
  }, []);

  // Background file watcher integration: auto-compile on changes to TeX/bib/cls/sty
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    onFsChange((event) => {
      const isRelevant = event.paths.some((p) => {
        const lower = p.toLowerCase();
        return (
          lower.endsWith('.tex') ||
          lower.endsWith('.bib') ||
          lower.endsWith('.sty') ||
          lower.endsWith('.cls')
        );
      });

      if (isRelevant) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          runCompile();
        }, 400);
      }
    })
      .then((unsub) => {
        unlisten = unsub;
      })
      .catch(() => {
        // ignore in mock mode
      });

    return () => {
      if (unlisten) unlisten();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [runCompile]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPdfRef.current) return;
      const newWidth = Math.max(240, Math.min(800, window.innerWidth - e.clientX));
      setPdfPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingPdfRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setPdfPanelWidth]);

  // Global Save shortcut (Cmd/Ctrl + S) & Close Tab (Cmd/Ctrl + W)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeFilePath) {
          const content = fileContents[activeFilePath] ?? '';
          try {
            await writeFileText(activeFilePath, content);
            markFileSaved(activeFilePath);
            runCompile();
          } catch (err) {
            logger.error('FileSystem', 'Failed to save file on shortcut Ctrl+S', {
              error: formatErrorDetails(err),
              filePath: activeFilePath,
            });
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeFilePath) {
          closeFile(activeFilePath);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath, fileContents, markFileSaved, runCompile, closeFile]);

  const getFileName = (path: string): string => {
    const norm = path.replace(/\\/g, '/');
    return norm.split('/').pop() ?? path;
  };

  const getTabContextMenuItems = (): ContextMenuItem[] => {
    if (!tabContextMenu) return [];

    if (!tabContextMenu.filePath) {
      return [
        {
          label: 'Close All Tabs',
          icon: X,
          disabled: openFiles.length === 0,
          action: () => closeAllFiles(),
        },
        ...(workspacePath
          ? [
              { divider: true },
              {
                label: 'Reveal Workspace in File Explorer',
                icon: FolderOpen,
                action: () => revealInExplorer(workspacePath),
              },
            ]
          : []),
      ];
    }

    const { filePath } = tabContextMenu;
    const fileName = getFileName(filePath);
    const relPath = workspacePath
      ? filePath.replace(/\\/g, '/').replace(workspacePath.replace(/\\/g, '/').replace(/\/+$/, '') + '/', '')
      : filePath;
    const isOnlyTab = openFiles.length <= 1;
    const isLastTab = openFiles.indexOf(filePath) === openFiles.length - 1;

    return [
      {
        label: 'Close Tab',
        icon: X,
        shortcut: 'Ctrl+W',
        action: () => closeFile(filePath),
      },
      {
        label: 'Close Others',
        icon: X,
        disabled: isOnlyTab,
        action: () => closeOtherFiles(filePath),
      },
      {
        label: 'Close Tabs to the Right',
        icon: ArrowRight,
        disabled: isLastTab,
        action: () => closeFilesToRight(filePath),
      },
      {
        label: 'Close All Tabs',
        icon: X,
        action: () => closeAllFiles(),
      },
      { divider: true },
      {
        label: 'Copy File Name',
        icon: Copy,
        action: () => copyToClipboard(fileName),
      },
      {
        label: 'Copy Relative Path',
        icon: Copy,
        action: () => copyToClipboard(relPath),
      },
      {
        label: 'Copy Absolute Path',
        icon: Copy,
        action: () => copyToClipboard(filePath),
      },
      { divider: true },
      {
        label: 'Open in Default App',
        icon: ExternalLink,
        action: () => openExternalPath(filePath),
      },
      {
        label: 'Reveal in File Explorer',
        icon: FolderOpen,
        action: () => revealInExplorer(filePath),
      },
    ];
  };

  const getTabIcon = (path: string) => {
    const category = getFileCategory(path);
    if (category === 'image') return <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (category === 'pdf') return <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    if (category === 'unsupported') return <FileQuestion className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />;

    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'tex') return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (ext === 'bib') return <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />;
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      {/* 40px TopBar */}
      <TopHeaderBar />

      {/* Main Workspace 4-Zone Horizontal Split */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Zone 1: 44px Activity Rail */}
        <ActivityRail />

        {/* Zone 2: Collapsible Sidebar Panel */}
        <SidebarPanel />

        {/* Zone 3: Center Editor Zone */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--surface-editor)] overflow-hidden">
          {/* Open Tabs Header */}
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              setTabContextMenu({
                x: e.clientX,
                y: e.clientY,
              });
            }}
            className="h-[34px] border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center overflow-x-auto select-none shrink-0 px-1"
          >
            {openFiles.length === 0 ? (
              <span className="text-xs text-[var(--text-muted)] italic px-2">No open documents</span>
            ) : (
              openFiles.map((filePath) => {
                const isActive = activeFilePath === filePath;
                const isDirty = dirtyFiles[filePath] ?? false;
                const fileName = getFileName(filePath);

                return (
                  <div
                    key={filePath}
                    onClick={() => setActiveFile(filePath)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTabContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        filePath,
                      });
                    }}
                    className={`group flex items-center space-x-1.5 px-3 py-1 text-xs cursor-pointer border-r border-[var(--border-subtle)] transition-colors h-full ${
                      isActive
                        ? 'bg-[var(--surface-editor)] text-[var(--text-primary)] font-medium border-t-2 border-t-accent-primary'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
                    }`}
                  >
                    {getTabIcon(filePath)}
                    <span className="truncate max-w-[140px]">{fileName}</span>

                    {isDirty ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary shrink-0" />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeFile(filePath);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Editor Workspace Canvas */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {activeFilePath ? (
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {(() => {
                  const category = getFileCategory(activeFilePath);
                  if (category === 'image') {
                    return <ImagePreview filePath={activeFilePath} />;
                  }
                  if (category === 'pdf') {
                    return <PdfDocumentPreview filePath={activeFilePath} />;
                  }
                  if (category === 'unsupported') {
                    return <UnsupportedFilePreview filePath={activeFilePath} />;
                  }
                  return <LatexEditor className="flex-1 w-full h-full" />;
                })()}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <FileCode className="w-12 h-12 text-[var(--text-muted)] stroke-1" />
                <p className="text-sm font-medium text-[var(--text-primary)]">Select a file to edit</p>
                <p className="text-xs text-[var(--text-muted)] max-w-sm">
                  Choose a LaTeX file (.tex), bibliography (.bib), or asset from the explorer sidebar to open it.
                </p>
              </div>
            )}
            {/* Filterable Build Log Drawer */}
            <BuildLogDrawer />
          </div>
        </div>

        {/* Resizer Handle between Editor & PDF Preview */}
        <div
          onMouseDown={() => {
            isResizingPdfRef.current = true;
          }}
          className="w-[4px] h-full cursor-col-resize hover:bg-accent-primary transition-colors z-30 shrink-0 bg-[var(--border-subtle)]"
        />

        {/* Zone 4: Right PDF Preview Zone */}
        <div
          style={{ width: `${pdfPanelWidth}px` }}
          className="h-full bg-[var(--surface-elevated)] flex flex-col shrink-0 overflow-hidden select-none"
        >
          <PdfViewport />
        </div>
      </div>

      {/* 24px StatusBar */}
      <StatusBar />

      {/* GitHub Device Flow Modal */}
      <GithubDeviceModal />

      {/* 3-Way CRDT-Git Merge Conflict Modal */}
      <ConflictModal />

      {/* Cmd/Ctrl+K Global Command Palette */}
      <CommandPalette />

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <ContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          items={getTabContextMenuItems()}
          onClose={() => setTabContextMenu(null)}
        />
      )}
    </div>
  );
};
