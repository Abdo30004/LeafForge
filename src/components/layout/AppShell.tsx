import React, { useRef, useEffect } from 'react';
import { TopHeaderBar } from './TopHeaderBar';
import { ActivityRail } from './ActivityRail';
import { SidebarPanel } from './SidebarPanel';
import { StatusBar } from './StatusBar';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { writeFileText } from '../../services/tauriClient';
import { LatexEditor } from '../../editor/LatexEditor';
import { X, FileCode, FileText, BookOpen, Image as ImageIcon } from 'lucide-react';

export const AppShell: React.FC = () => {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const fileContents = useWorkspaceStore((s) => s.fileContents);
  const dirtyFiles = useWorkspaceStore((s) => s.dirtyFiles);
  const pdfPanelWidth = useWorkspaceStore((s) => s.pdfPanelWidth);

  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const setPdfPanelWidth = useWorkspaceStore((s) => s.setPdfPanelWidth);

  const isResizingPdfRef = useRef(false);

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

  // Global Save shortcut (Cmd/Ctrl + S)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activeFilePath) {
          const content = fileContents[activeFilePath] ?? '';
          try {
            await writeFileText(activeFilePath, content);
            markFileSaved(activeFilePath);
          } catch (err) {
            console.error('Failed to save file:', err);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath, fileContents, markFileSaved]);

  const getFileName = (path: string): string => {
    const norm = path.replace(/\\/g, '/');
    return norm.split('/').pop() ?? path;
  };

  const getTabIcon = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'tex') return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (ext === 'bib') return <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    if (['png', 'pdf', 'eps', 'jpg'].includes(ext ?? ''))
      return <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
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
          <div className="h-[34px] border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center overflow-x-auto select-none shrink-0 px-1">
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
                <LatexEditor className="flex-1 w-full h-full" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <FileCode className="w-12 h-12 text-[var(--text-muted)] stroke-1" />
                <p className="text-sm font-medium text-[var(--text-primary)]">Select a file to edit</p>
                <p className="text-xs text-[var(--text-muted)] max-w-sm">
                  Choose a LaTeX file (.tex) or bibliography (.bib) from the explorer sidebar to open it.
                </p>
              </div>
            )}
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
          {/* PDF Panel Header */}
          <div className="h-[34px] border-b border-[var(--border-subtle)] px-3 flex items-center justify-between text-xs shrink-0">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              PDF Preview
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">Page 1 of 1</span>
          </div>

          {/* PDF Viewport Canvas Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[var(--canvas)] overflow-auto">
            <div className="w-[340px] h-[480px] bg-white rounded shadow-md border border-[var(--border-subtle)] flex flex-col items-center justify-center text-slate-800 p-6 text-center space-y-3">
              <h2 className="text-base font-serif font-bold text-slate-900">Document Title</h2>
              <p className="text-xs font-serif text-slate-600 italic">Author Name</p>
              <div className="w-full border-t border-slate-200 my-2" />
              <p className="text-[11px] font-serif text-slate-700 leading-relaxed text-left">
                Double-buffered PDF.js canvas will render the compiled output here upon triggering compile.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 24px StatusBar */}
      <StatusBar />
    </div>
  );
};
