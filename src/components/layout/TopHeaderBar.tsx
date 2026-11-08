import React from 'react';
import {
  FileCode2,
  Eye,
  Play,
  Sun,
  Moon,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useCompilerStore } from '../../store/useCompilerStore';
import { openFolder, listFiles, watchDirectory } from '../../services/tauriClient';

export const TopHeaderBar: React.FC = () => {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const rootTexFile = useWorkspaceStore((s) => s.rootTexFile);
  const editorMode = useWorkspaceStore((s) => s.editorMode);
  const setEditorMode = useWorkspaceStore((s) => s.setEditorMode);
  const theme = useWorkspaceStore((s) => s.theme);
  const toggleTheme = useWorkspaceStore((s) => s.toggleTheme);
  const setWorkspacePath = useWorkspaceStore((s) => s.setWorkspacePath);
  const setFiles = useWorkspaceStore((s) => s.setFiles);

  const compilerStatus = useCompilerStore((s) => s.status);
  const compilerEngine = useCompilerStore((s) => s.engine);
  const lastDuration = useCompilerStore((s) => s.lastBuildDurationMs);

  const handleOpenFolder = async () => {
    try {
      const selected = await openFolder();
      if (selected) {
        setWorkspacePath(selected);
        const fileTree = await listFiles(selected);
        setFiles(fileTree);
        await watchDirectory(selected);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const getWorkspaceTitle = (): string => {
    if (!workspacePath) return 'No Project Open';
    const normalized = workspacePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] ?? 'Project';
  };

  const getActiveFileName = (): string => {
    if (!activeFilePath) return '';
    const normalized = activeFilePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] ?? '';
  };

  const activeFileName = getActiveFileName();
  const isRoot = activeFilePath && rootTexFile === activeFilePath;

  return (
    <header className="h-[40px] border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between px-3 select-none z-30 shrink-0">
      {/* Left: Branding & Project Path */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-1.5 text-accent-primary font-bold text-sm tracking-tight">
          <Sparkles className="w-4 h-4 text-accent-primary" />
          <span className="text-[var(--text-primary)] font-semibold">Leaf</span>
          <span className="text-accent-primary">Forge</span>
        </div>

        <div className="h-4 w-[1px] bg-[var(--border-subtle)]" />

        <div className="flex items-center space-x-2 text-xs truncate">
          <button
            onClick={handleOpenFolder}
            className="flex items-center space-x-1.5 px-2 py-1 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] transition-colors"
            title="Open Project Folder"
          >
            <FolderOpen className="w-3.5 h-3.5 text-accent-primary" />
            <span className="font-medium max-w-[140px] truncate">
              {getWorkspaceTitle()}
            </span>
          </button>

          {activeFileName && (
            <>
              <span className="text-[var(--text-muted)]">/</span>
              <span className="text-[var(--text-primary)] font-mono text-xs">
                {activeFileName}
              </span>
              {isRoot && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-semibold uppercase tracking-wider border border-emerald-500/20">
                  ROOT
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Center: Mode Segmented Switcher */}
      <div className="flex items-center bg-[var(--canvas)] p-0.5 rounded-md border border-[var(--border-subtle)]">
        <button
          onClick={() => setEditorMode('raw')}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            editorMode === 'raw'
              ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
          title="Raw LaTeX Source Mode (Cmd/Ctrl+Shift+M)"
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Raw</span>
        </button>

        <button
          onClick={() => setEditorMode('visual')}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            editorMode === 'visual'
              ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
          title="Visual WYSIWYM Mode (Cmd/Ctrl+Shift+M)"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Visual</span>
        </button>
      </div>

      {/* Right: Actions, Compile Status & Theme */}
      <div className="flex items-center space-x-2">
        {/* Compile Pill */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs bg-[var(--canvas)] border border-[var(--border-subtle)]">
          <span
            className={`w-2 h-2 rounded-full ${
              compilerStatus === 'compiling'
                ? 'bg-amber-400 animate-pulse'
                : compilerStatus === 'error'
                  ? 'bg-rose-500'
                  : 'bg-emerald-500'
            }`}
          />
          <span className="capitalize text-[var(--text-primary)] font-medium">
            {compilerEngine}
          </span>
          <span className="text-[var(--text-muted)] text-[11px]">
            {lastDuration > 0 ? `${lastDuration}ms` : 'Ready'}
          </span>
        </div>

        {/* Compile Button */}
        <button
          className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
          title="Compile Document (Cmd/Ctrl+S or Cmd/Ctrl+Enter)"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Compile</span>
        </button>

        <div className="h-4 w-[1px] bg-[var(--border-subtle)]" />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light (Parchment Precision)' : 'Dark (Obsidian Studio)'} theme`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-sky-600" />
          )}
        </button>
      </div>
    </header>
  );
};
