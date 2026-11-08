import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useCompilerStore } from '../store/useCompilerStore';
import {
  openFolder,
  listFiles,
  watchDirectory,
  unwatchDirectory,
  cleanPath,
  getProjectSettings,
  saveProjectSettings,
  getGlobalSettings,
  saveGlobalSettings,
  abortCompilation,
  readFileText,
} from './tauriClient';
import { dialog } from './dialog';
import { logger } from './logger';
import { formatErrorDetails } from '../utils/formatError';
import type { FileEntry } from '../types/ipc';
import type { LatexEngine } from '../types/latex';

export class WorkspaceManager {
  private static isSwitching = false;

  /**
   * Prompts user and saves current workspace session before switching if needed.
   * Prompts for confirmation if compilation is running or if unsaved files exist.
   */
  public static async switchWorkspace(targetDir?: string): Promise<boolean> {
    if (this.isSwitching) return false;

    const currentWorkspace = useWorkspaceStore.getState().workspacePath;
    const compilerStatus = useCompilerStore.getState().status;
    const dirtyFiles = useWorkspaceStore.getState().dirtyFiles;
    const hasDirtyFiles = Object.values(dirtyFiles).some(Boolean);
    const isCompiling = compilerStatus === 'compiling';

    // If current workspace has active task or dirty files, prompt confirmation
    if (currentWorkspace && (isCompiling || hasDirtyFiles)) {
      const issues: string[] = [];
      if (isCompiling) issues.push('an active compilation task');
      if (hasDirtyFiles) issues.push('unsaved document edits');

      const confirmed = await dialog.confirm({
        title: 'Unsaved Changes or Active Task',
        message: `You currently have ${issues.join(' and ')}. Switching projects will stop compilation and discard unsaved modifications. Are you sure you want to proceed?`,
        confirmLabel: 'Switch Project',
        cancelLabel: 'Stay Here',
        isDestructive: true,
      });

      if (!confirmed) {
        return false;
      }
    }

    let selectedPath = targetDir;
    if (!selectedPath) {
      try {
        const folder = await openFolder();
        if (!folder) return false;
        selectedPath = folder;
      } catch (err) {
        logger.error('FileSystem', 'Failed to open directory dialog', {
          error: formatErrorDetails(err),
        });
        return false;
      }
    }

    const cleanSelected = cleanPath(selectedPath);

    // Save previous workspace session if one was open
    if (currentWorkspace) {
      await this.saveCurrentSession();
    }

    this.isSwitching = true;
    try {
      // 1. Abort active compilation and reset compiler state
      if (isCompiling) {
        try {
          await abortCompilation();
        } catch {
          // ignore abort error
        }
      }
      useCompilerStore.getState().setBuildResult(0, [], '', undefined, undefined);
      useCompilerStore.getState().setStatus('idle');

      // 2. Unwatch previous directory
      if (currentWorkspace) {
        try {
          await unwatchDirectory();
        } catch {
          // ignore unwatch error
        }
      }

      // 3. Clear open tabs in workspace
      useWorkspaceStore.getState().closeAllFiles();

      // 4. Set new workspace path and list files
      useWorkspaceStore.getState().setWorkspacePath(cleanSelected);
      const tree = await listFiles(cleanSelected);
      useWorkspaceStore.getState().setFiles(tree);

      // 5. Watch new directory
      try {
        await watchDirectory(cleanSelected);
      } catch (err) {
        logger.warn('FileSystem', 'Failed to watch new workspace directory', {
          error: formatErrorDetails(err),
          cleanSelected,
        });
      }

      // 6. Load Project Settings & restore root file and session
      const projectSettings = await getProjectSettings(cleanSelected);

      // Find root .tex file
      let rootTexCandidate: string | null = projectSettings.rootFile || null;
      if (!rootTexCandidate) {
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
        rootTexCandidate = findMain(tree);
      }

      if (rootTexCandidate) {
        useWorkspaceStore.getState().setRootTexFile(rootTexCandidate);
      }

      // Set engine from project settings if available
      if (projectSettings.engine) {
        useCompilerStore.getState().setEngine(projectSettings.engine as LatexEngine);
      }

      // Restore open files from project settings if available
      const filesToRestore = projectSettings.openFiles || [];
      if (filesToRestore.length > 0) {
        for (const filePath of filesToRestore) {
          try {
            const content = await readFileText(filePath);
            useWorkspaceStore.getState().openFile(filePath, content);
          } catch {
            // File might have been deleted or moved
          }
        }
        if (projectSettings.activeFile) {
          useWorkspaceStore.getState().setActiveFile(projectSettings.activeFile);
        }
      } else if (rootTexCandidate) {
        // If no open files saved, open root file by default
        try {
          const content = await readFileText(rootTexCandidate);
          useWorkspaceStore.getState().openFile(rootTexCandidate, content);
        } catch {
          // ignore
        }
      }

      // 7. Update Global Settings with recent projects
      try {
        const globalSettings = await getGlobalSettings();
        const recent = (globalSettings.recentWorkspaces || []).filter((p) => p !== cleanSelected);
        recent.unshift(cleanSelected);
        const topRecent = recent.slice(0, 10);

        await saveGlobalSettings({
          ...globalSettings,
          lastOpenedWorkspace: cleanSelected,
          recentWorkspaces: topRecent,
        });
      } catch (e) {
        logger.warn('Settings', 'Failed to update global settings with recent projects', {
          error: formatErrorDetails(e),
        });
      }

      logger.info('FileSystem', `Successfully switched workspace to: ${cleanSelected}`);
      return true;
    } catch (err) {
      logger.error('FileSystem', 'Failed to switch workspace', {
        error: formatErrorDetails(err),
        cleanSelected,
      });
      return false;
    } finally {
      this.isSwitching = false;
    }
  }

  /**
   * Persists current workspace's open files and active document into `.leafforge/settings.json`.
   */
  public static async saveCurrentSession(): Promise<void> {
    const workspacePath = useWorkspaceStore.getState().workspacePath;
    if (!workspacePath) return;

    try {
      const openFiles = useWorkspaceStore.getState().openFiles;
      const activeFile = useWorkspaceStore.getState().activeFilePath;
      const rootTexFile = useWorkspaceStore.getState().rootTexFile;

      await saveProjectSettings(workspacePath, {
        openFiles,
        activeFile,
        rootFile: rootTexFile,
      });
    } catch (e) {
      logger.debug('Settings', 'Failed to auto-save workspace session', {
        error: formatErrorDetails(e),
      });
    }
  }

  /**
   * Restores initial workspace on application startup if configured in global settings.
   */
  public static async restoreInitialWorkspace(): Promise<void> {
    try {
      const globalSettings = await getGlobalSettings();
      if (globalSettings.restoreWorkspaceState && globalSettings.lastOpenedWorkspace) {
        const last = globalSettings.lastOpenedWorkspace;
        await this.switchWorkspace(last);
      }
    } catch (e) {
      logger.debug('Settings', 'Failed to restore initial workspace on launch', {
        error: formatErrorDetails(e),
      });
    }
  }
}
