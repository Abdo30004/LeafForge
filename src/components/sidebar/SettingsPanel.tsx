import React, { useState, useEffect } from 'react';
import { Settings, FolderCog, Sliders, Check, Save, Clock, Zap, History, FolderOpen } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useGitStore } from '../../store/useGitStore';
import {
  getProjectSettings,
  saveProjectSettings,
  getGlobalSettings,
  saveGlobalSettings,
  parseGithubOwnerRepo,
  cleanPath,
} from '../../services/tauriClient';
import { WorkspaceManager } from '../../services/workspaceManager';
import type { ProjectSettings, GlobalSettings, CompileQuality } from '../../types/settings';
import { logger } from '../../services/logger';

export const SettingsPanel: React.FC = () => {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const remoteUrl = useGitStore((s) => s.remoteUrl);
  const setConnectModalOpen = useGitStore((s) => s.setConnectModalOpen);

  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    rootFile: 'main.tex',
    engine: 'tectonic',
    compileTimeoutSecs: 90,
    compileQuality: 'normal',
    autoSave: true,
    autoSaveDelayMs: 1000,
    autoCompile: true,
    synctexEnabled: true,
  });

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    theme: 'dark',
    defaultEngine: 'tectonic',
    fontSize: 14,
    autoCompileDelayMs: 1000,
    autoSave: true,
    autoSaveDelayMs: 1000,
    compileTimeoutSecs: 90,
    compileQuality: 'normal',
    recentWorkspaces: [],
    restoreWorkspaceState: true,
    editorWordWrap: true,
  });

  const [savedFeedback, setSavedFeedback] = useState(false);
  const [globalSavedFeedback, setGlobalSavedFeedback] = useState(false);

  useEffect(() => {
    getGlobalSettings()
      .then((gs) => {
        setGlobalSettings(gs);
        if (gs.theme && (gs.theme === 'dark' || gs.theme === 'light')) {
          setTheme(gs.theme);
        }
      })
      .catch(() => {});
  }, [setTheme]);

  useEffect(() => {
    if (workspacePath) {
      getProjectSettings(workspacePath)
        .then((ps) => {
          setProjectSettings((prev) => ({
            ...prev,
            ...ps,
          }));
        })
        .catch(() => {});
    }
  }, [workspacePath]);

  const handleSaveProjectSettings = async () => {
    if (!workspacePath) return;
    try {
      await saveProjectSettings(workspacePath, projectSettings);
      logger.info('Settings', 'Saved project settings to .leafforge/settings.json');
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } catch (err) {
      logger.error('Settings', 'Failed to save project settings', { error: String(err) });
    }
  };

  const handleSaveGlobalSettings = async (updated: GlobalSettings) => {
    setGlobalSettings(updated);
    try {
      await saveGlobalSettings(updated);
      setGlobalSavedFeedback(true);
      setTimeout(() => setGlobalSavedFeedback(false), 2000);
    } catch (err) {
      logger.error('Settings', 'Failed to save global settings', { error: String(err) });
    }
  };

  const handleSaveGlobalTheme = async (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    const updated = { ...globalSettings, theme: newTheme };
    await handleSaveGlobalSettings(updated);
  };

  const handleSwitchToRecent = async (path: string) => {
    await WorkspaceManager.switchWorkspace(path);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto select-none text-[13px] p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <div className="flex items-center space-x-1.5">
          <Settings className="w-3.5 h-3.5 text-accent-primary" />
          <span>Configuration & Settings</span>
        </div>
        {(savedFeedback || globalSavedFeedback) && (
          <span className="text-emerald-400 font-bold text-[10px] flex items-center space-x-1 animate-in fade-in">
            <Check className="w-3 h-3" />
            <span>Saved</span>
          </span>
        )}
      </div>

      {/* Workspace-Specific Settings (.leafforge/settings.json) */}
      <div className="space-y-3">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--text-primary)]">
          <FolderCog className="w-3.5 h-3.5 text-emerald-400" />
          <span>Project Settings</span>
          <span className="font-mono text-[10px] text-[var(--text-muted)] font-normal">
            (.leafforge/settings.json)
          </span>
        </div>

        {!workspacePath ? (
          <div className="p-3 rounded-lg bg-[var(--canvas)]/40 border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] italic">
            No workspace currently open. Open a project to configure project-specific settings.
          </div>
        ) : (
          <div className="space-y-2.5 p-2.5 rounded-lg bg-[var(--canvas)]/40 border border-[var(--border-subtle)]">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                Root TeX Document
              </label>
              <input
                type="text"
                value={projectSettings.rootFile || ''}
                onChange={(e) =>
                  setProjectSettings((p) => ({ ...p, rootFile: e.target.value }))
                }
                placeholder="main.tex"
                className="w-full px-2.5 py-1.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                Compilation Engine
              </label>
              <select
                value={projectSettings.engine || 'tectonic'}
                onChange={(e) =>
                  setProjectSettings((p) => ({ ...p, engine: e.target.value }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                <option value="tectonic">Tectonic (Auto-CTAN / XeTeX)</option>
                <option value="pdflatex">pdfLaTeX (Standard TeX Live / MiKTeX)</option>
                <option value="xelatex">XeLaTeX (Modern Fonts / Unicode)</option>
                <option value="lualatex">LuaLaTeX (Lua Scripting / Direct OTF)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Timeout (s)</span>
                </label>
                <input
                  type="number"
                  min="10"
                  max="600"
                  value={projectSettings.compileTimeoutSecs ?? 90}
                  onChange={(e) =>
                    setProjectSettings((p) => ({
                      ...p,
                      compileTimeoutSecs: Number(e.target.value) || 90,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1 flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-sky-400" />
                  <span>Quality</span>
                </label>
                <select
                  value={projectSettings.compileQuality || 'normal'}
                  onChange={(e) =>
                    setProjectSettings((p) => ({
                      ...p,
                      compileQuality: e.target.value as CompileQuality,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="draft">Draft (Fastest)</option>
                  <option value="fast">Fast (Single Pass)</option>
                  <option value="normal">Normal (Standard)</option>
                  <option value="full">Full (Multi-Pass)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">Auto-Save Edits</span>
              <button
                type="button"
                onClick={() =>
                  setProjectSettings((p) => ({
                    ...p,
                    autoSave: p.autoSave === false ? true : false,
                  }))
                }
                className={`px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                  projectSettings.autoSave !== false
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {projectSettings.autoSave !== false ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                GitHub Repository
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={
                    remoteUrl
                      ? parseGithubOwnerRepo(remoteUrl)
                        ? `${parseGithubOwnerRepo(remoteUrl)?.owner}/${parseGithubOwnerRepo(remoteUrl)?.repo}`
                        : remoteUrl
                      : 'No remote connected'
                  }
                  className="flex-1 px-2.5 py-1.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] opacity-80"
                />
                <button
                  type="button"
                  onClick={() => setConnectModalOpen(true)}
                  className="px-2.5 py-1.5 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-medium shrink-0 cursor-pointer"
                >
                  {remoteUrl ? 'Manage' : 'Connect'}
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveProjectSettings}
              className="w-full mt-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Project Settings</span>
            </button>
          </div>
        )}
      </div>

      {/* Global Application Settings */}
      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--text-primary)]">
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          <span>Global Settings</span>
        </div>

        <div className="space-y-2.5 p-2.5 rounded-lg bg-[var(--canvas)]/40 border border-[var(--border-subtle)]">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">
              UI Appearance Theme
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSaveGlobalTheme('dark')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between border-2 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>Obsidian Studio</span>
                {theme === 'dark' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              <button
                onClick={() => handleSaveGlobalTheme('light')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between border-2 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>Parchment Precision</span>
                {theme === 'light' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                Default Engine
              </label>
              <select
                value={globalSettings.defaultEngine}
                onChange={(e) =>
                  handleSaveGlobalSettings({
                    ...globalSettings,
                    defaultEngine: e.target.value,
                  })
                }
                className="w-full px-2 py-1 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
              >
                <option value="tectonic">Tectonic</option>
                <option value="pdflatex">pdfLaTeX</option>
                <option value="xelatex">XeLaTeX</option>
                <option value="lualatex">LuaLaTeX</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                Default Timeout (s)
              </label>
              <input
                type="number"
                min="10"
                max="600"
                value={globalSettings.compileTimeoutSecs}
                onChange={(e) =>
                  handleSaveGlobalSettings({
                    ...globalSettings,
                    compileTimeoutSecs: Number(e.target.value) || 90,
                  })
                }
                className="w-full px-2 py-1 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">Global Auto-Save</span>
            <button
              type="button"
              onClick={() =>
                handleSaveGlobalSettings({
                  ...globalSettings,
                  autoSave: !globalSettings.autoSave,
                })
              }
              className={`px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                globalSettings.autoSave
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              {globalSettings.autoSave ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              Restore Project on Launch
            </span>
            <button
              type="button"
              onClick={() =>
                handleSaveGlobalSettings({
                  ...globalSettings,
                  restoreWorkspaceState: !globalSettings.restoreWorkspaceState,
                })
              }
              className={`px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                globalSettings.restoreWorkspaceState
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              {globalSettings.restoreWorkspaceState ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Workspaces / Projects */}
      {globalSettings.recentWorkspaces && globalSettings.recentWorkspaces.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--text-primary)]">
            <History className="w-3.5 h-3.5 text-purple-400" />
            <span>Recent Projects</span>
          </div>

          <div className="space-y-1">
            {globalSettings.recentWorkspaces.map((path) => {
              const norm = path.replace(/\\/g, '/');
              const folderName = norm.split('/').pop() || path;
              const isCurrent = workspacePath && cleanPath(workspacePath) === cleanPath(path);

              return (
                <div
                  key={path}
                  onClick={() => !isCurrent && handleSwitchToRecent(path)}
                  className={`p-2 rounded border transition-colors flex items-center justify-between group ${
                    isCurrent
                      ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300'
                      : 'border-[var(--border-subtle)] bg-[var(--canvas)]/40 hover:bg-[var(--hover-bg)] cursor-pointer'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-semibold truncate text-[var(--text-primary)]">
                      {folderName}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate font-mono">{path}</p>
                  </div>
                  {isCurrent ? (
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                      Active
                    </span>
                  ) : (
                    <FolderOpen className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-accent-primary shrink-0 transition-colors" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
