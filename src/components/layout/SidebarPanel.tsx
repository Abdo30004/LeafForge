import React, { useRef, useEffect } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useGitStore } from '../../store/useGitStore';
import { useCollabStore } from '../../store/useCollabStore';
import { FileTreePanel } from '../sidebar/FileTreePanel';
import { ListTree, GitBranch, Users, Settings } from 'lucide-react';

export const SidebarPanel: React.FC = () => {
  const activeTab = useWorkspaceStore((s) => s.activeSidebarTab);
  const collapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const width = useWorkspaceStore((s) => s.sidebarWidth);
  const setWidth = useWorkspaceStore((s) => s.setSidebarWidth);
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);

  const gitBranch = useGitStore((s) => s.branch);
  const isGitClean = useGitStore((s) => s.isClean);
  const collabStatus = useCollabStore((s) => s.status);
  const collabPeers = useCollabStore((s) => s.peers);

  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      // Activity rail is 44px
      const newWidth = Math.max(180, Math.min(480, e.clientX - 44));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setWidth]);

  if (collapsed) return null;

  return (
    <div
      style={{ width: `${width}px` }}
      className="relative h-full bg-[var(--surface-elevated)] border-r border-[var(--border-subtle)] flex flex-col shrink-0 select-none overflow-hidden"
    >
      {/* Content based on active tab */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'files' && <FileTreePanel />}

        {activeTab === 'outline' && (
          <div className="flex flex-col h-full p-3 space-y-3">
            <div className="flex items-center space-x-1.5 pb-2 border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <ListTree className="w-3.5 h-3.5" />
              <span>Document Outline</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              LaTeX section structure (\part, \chapter, \section, \subsection) will automatically populate here once a document is active.
            </p>
          </div>
        )}

        {activeTab === 'git' && (
          <div className="flex flex-col h-full p-3 space-y-3">
            <div className="flex items-center space-x-1.5 pb-2 border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <GitBranch className="w-3.5 h-3.5 text-accent-primary" />
              <span>Source Control</span>
            </div>
            <div className="bg-[var(--canvas)] p-2.5 rounded border border-[var(--border-subtle)] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Active Branch:</span>
                <span className="font-mono text-accent-primary font-medium">{gitBranch}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Working Tree:</span>
                <span className={`text-[11px] font-medium ${isGitClean ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isGitClean ? 'Clean' : 'Modified changes'}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'collab' && (
          <div className="flex flex-col h-full p-3 space-y-3">
            <div className="flex items-center space-x-1.5 pb-2 border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Users className="w-3.5 h-3.5 text-accent-primary" />
              <span>Collaborators</span>
            </div>
            <div className="bg-[var(--canvas)] p-2.5 rounded border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Room Status:</span>
                <span className="capitalize text-xs font-medium text-emerald-400">{collabStatus}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Active Peers:</span>
                <span className="text-xs font-mono">{collabPeers.length} online</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex flex-col h-full p-3 space-y-4">
            <div className="flex items-center space-x-1.5 pb-2 border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-primary)]">UI Theme</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-3 py-2 rounded text-xs text-left border ${
                    theme === 'dark'
                      ? 'border-accent-primary bg-[var(--active-bg)] text-accent-primary font-medium'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Obsidian Studio
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`px-3 py-2 rounded text-xs text-left border ${
                    theme === 'light'
                      ? 'border-accent-primary bg-[var(--active-bg)] text-accent-primary font-medium'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Parchment Precision
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle on Right Border */}
      <div
        onMouseDown={() => {
          isResizingRef.current = true;
        }}
        className="absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-accent-primary transition-colors z-30"
      />
    </div>
  );
};
