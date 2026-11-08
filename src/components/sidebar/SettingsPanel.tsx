import React, { useState, useEffect } from 'react';
import { Settings, FolderCog, Sliders, Check, Save } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useGitStore } from '../../store/useGitStore';
import {
  getProjectSettings,
  saveProjectSettings,
  getGlobalSettings,
  saveGlobalSettings,
  parseGithubOwnerRepo,
} from '../../services/tauriClient';
import type { ProjectSettings, GlobalSettings } from '../../types/settings';
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
    autoCompile: true,
    synctexEnabled: true,
  });

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    theme: 'dark',
    defaultEngine: 'tectonic',
    fontSize: 14,
    autoCompileDelayMs: 1000,
  });

  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    getGlobalSettings().then((gs) => {
      setGlobalSettings(gs);
      if (gs.theme && (gs.theme === 'dark' || gs.theme === 'light')) {
        setTheme(gs.theme);
      }
    }).catch(() => {});
  }, [setTheme]);

  useEffect(() => {
    if (workspacePath) {
      getProjectSettings(workspacePath).then((ps) => {
        setProjectSettings((prev) => ({
          ...prev,
          ...ps,
        }));
      }).catch(() => {});
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

  const handleSaveGlobalTheme = async (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    const updated = { ...globalSettings, theme: newTheme };
    setGlobalSettings(updated);
    await saveGlobalSettings(updated).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto select-none text-[13px] p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <div className="flex items-center space-x-1.5">
          <Settings className="w-3.5 h-3.5 text-accent-primary" />
          <span>Configuration & Settings</span>
        </div>
        {savedFeedback && (
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
        </div>
      </div>
    </div>
  );
};
