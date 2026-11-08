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
import { useGitStore } from '../../store/useGitStore';
import {
  openFolder,
  listFiles,
  watchDirectory,
  getGithubAuthStatus,
} from '../../services/tauriClient';

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
  const runCompile = useCompilerStore((s) => s.runCompile);
  const toggleLogDrawer = useCompilerStore((s) => s.toggleLogDrawer);
  const diagnostics = useCompilerStore((s) => s.diagnostics);

  const userProfile = useGitStore((s) => s.userProfile);
  const setUserProfile = useGitStore((s) => s.setUserProfile);
  const setDeviceModalOpen = useGitStore((s) => s.setDeviceModalOpen);

  React.useEffect(() => {
    getGithubAuthStatus()
      .then((status) => {
        if (status.authenticated && status.profile) {
          setUserProfile(status.profile);
        }
      })
      .catch((e) => console.error('Auth status check failed:', e));
  }, [setUserProfile]);

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
        <div
          onClick={toggleLogDrawer}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs bg-[var(--canvas)] border border-[var(--border-subtle)] cursor-pointer hover:border-zinc-500 transition-colors"
          title="Click to view build logs & diagnostics"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              compilerStatus === 'compiling'
                ? 'bg-amber-400 animate-pulse'
                : compilerStatus === 'error'
                  ? 'bg-rose-500 animate-pulse'
                  : compilerStatus === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
            }`}
          />
          <span className="capitalize text-[var(--text-primary)] font-medium">
            {compilerEngine}
          </span>
          <span className="text-[var(--text-muted)] text-[11px]">
            {compilerStatus === 'error'
              ? `${diagnostics.filter((d) => d.severity === 'error').length} Errors`
              : lastDuration > 0
                ? `${lastDuration}ms`
                : 'Ready'}
          </span>
        </div>

        {/* Compile Button */}
        <button
          onClick={() => runCompile()}
          disabled={compilerStatus === 'compiling'}
          className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors disabled:opacity-50"
          title="Compile Document (Cmd/Ctrl+S or Cmd/Ctrl+Enter)"
        >
          <Play className={`w-3 h-3 fill-current ${compilerStatus === 'compiling' ? 'animate-spin' : ''}`} />
          <span>{compilerStatus === 'compiling' ? 'Compiling...' : 'Compile'}</span>
        </button>

        <div className="h-4 w-[1px] bg-[var(--border-subtle)]" />

        {/* GitHub Account / Sign In */}
        {userProfile ? (
          <button
            onClick={() => setDeviceModalOpen(true)}
            className="flex items-center space-x-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-accent-primary transition-all cursor-pointer"
            title={`Signed in as @${userProfile.username}. Click to manage.`}
          >
            <img
              src={userProfile.avatarUrl}
              alt={userProfile.username}
              className="w-6 h-6 rounded-full border border-accent-primary"
            />
          </button>
        ) : (
          <button
            onClick={() => setDeviceModalOpen(true)}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-md text-xs bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)] cursor-pointer"
            title="Sign in with GitHub"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}

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
