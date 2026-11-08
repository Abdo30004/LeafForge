import React from 'react';
import {
  FolderTree,
  ListTree,
  GitBranch,
  Users,
  Settings,
} from 'lucide-react';
import { useWorkspaceStore, type SidebarTab } from '../../store/useWorkspaceStore';

interface RailTabItem {
  id: SidebarTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: RailTabItem[] = [
  { id: 'files', label: 'File Explorer', icon: FolderTree },
  { id: 'outline', label: 'Document Outline', icon: ListTree },
  { id: 'git', label: 'Source Control (Git)', icon: GitBranch },
  { id: 'collab', label: 'Live Collaboration', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const ActivityRail: React.FC = () => {
  const activeTab = useWorkspaceStore((s) => s.activeSidebarTab);
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveSidebarTab);
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);

  const handleTabClick = (tabId: SidebarTab) => {
    if (activeTab === tabId) {
      toggleSidebar();
    } else {
      setActiveTab(tabId);
    }
  };

  return (
    <aside className="w-[44px] bg-[var(--activity-rail-bg)] border-r border-[var(--border-subtle)] flex flex-col items-center py-2 shrink-0 z-20 select-none justify-between">
      {/* Top Main Navigation */}
      <div className="flex flex-col items-center space-y-1 w-full">
        {TABS.slice(0, 4).map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id && !sidebarCollapsed;
          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              className={`relative w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                isActive
                  ? 'text-accent-primary bg-[var(--active-bg)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
              }`}
              title={label}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-accent-primary rounded-r" />
              )}
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Bottom Settings */}
      <div className="w-full flex justify-center pb-1">
        {TABS.slice(4).map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id && !sidebarCollapsed;
          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              className={`relative w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                isActive
                  ? 'text-accent-primary bg-[var(--active-bg)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
              }`}
              title={label}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-accent-primary rounded-r" />
              )}
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    </aside>
  );
};
