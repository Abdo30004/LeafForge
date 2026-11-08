import React, { useRef, useEffect } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { FileTreePanel } from '../sidebar/FileTreePanel';
import { OutlinePanel } from '../sidebar/OutlinePanel';
import { PackageFontPanel } from '../sidebar/PackageFontPanel';
import { GitControlPanel } from '../sidebar/GitControlPanel';
import { CollabPanel } from '../sidebar/CollabPanel';
import { SettingsPanel } from '../sidebar/SettingsPanel';

export const SidebarPanel: React.FC = () => {
  const activeTab = useWorkspaceStore((s) => s.activeSidebarTab);
  const collapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const width = useWorkspaceStore((s) => s.sidebarWidth);
  const setWidth = useWorkspaceStore((s) => s.setSidebarWidth);

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

        {activeTab === 'outline' && <OutlinePanel />}

        {activeTab === 'packages' && <PackageFontPanel />}

        {activeTab === 'git' && <GitControlPanel />}

        {activeTab === 'collab' && <CollabPanel />}

        {activeTab === 'settings' && <SettingsPanel />}
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
