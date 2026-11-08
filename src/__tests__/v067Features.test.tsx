import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useCompilerStore } from '../store/useCompilerStore';
import { WorkspaceManager } from '../services/workspaceManager';
import { dialog } from '../services/dialog';
import * as tauriClient from '../services/tauriClient';

vi.mock('../store/useWorkspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/useWorkspaceStore')>();
  type State = ReturnType<typeof actual.useWorkspaceStore.getState>;
  const mockHook = <R,>(selector?: (state: State) => R) =>
    selector ? selector(actual.useWorkspaceStore.getState()) : actual.useWorkspaceStore.getState();
  Object.assign(mockHook, actual.useWorkspaceStore);
  return {
    ...actual,
    useWorkspaceStore: mockHook,
  };
});

vi.mock('../store/useCompilerStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/useCompilerStore')>();
  type State = ReturnType<typeof actual.useCompilerStore.getState>;
  const mockHook = <R,>(selector?: (state: State) => R) =>
    selector ? selector(actual.useCompilerStore.getState()) : actual.useCompilerStore.getState();
  Object.assign(mockHook, actual.useCompilerStore);
  return {
    ...actual,
    useCompilerStore: mockHook,
  };
});

import { SettingsPanel } from '../components/sidebar/SettingsPanel';
import { PdfViewport } from '../components/pdf/PdfViewport';

describe('LeafForge v0.6.7 Feature Suite', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspacePath: '/mock/workspace/project-alpha',
      openFiles: ['/mock/workspace/project-alpha/main.tex'],
      activeFilePath: '/mock/workspace/project-alpha/main.tex',
      fileContents: {
        '/mock/workspace/project-alpha/main.tex': '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      },
      dirtyFiles: {},
      theme: 'dark',
    });

    useCompilerStore.setState({
      status: 'idle',
      pdfPath: '/mock/workspace/project-alpha/.leafforge/main.pdf',
    });
  });

  it('renders SettingsPanel with compilation timeout, quality modes, and auto-save controls', () => {
    const html = renderToString(<SettingsPanel />);
    expect(html).toContain('Timeout (s)');
    expect(html).toContain('Quality');
    expect(html).toContain('Draft (Fastest)');
    expect(html).toContain('Fast (Single Pass)');
    expect(html).toContain('Normal (Standard)');
    expect(html).toContain('Full (Multi-Pass)');
    expect(html).toContain('Auto-Save Edits');
    expect(html).toContain('Global Auto-Save');
    expect(html).toContain('Restore Project on Launch');
  });

  it('renders PdfViewport with double-click and Ctrl+Click inverse navigation hint', () => {
    const html = renderToString(<PdfViewport />);
    expect(html).toContain('Double-click or Ctrl+Click canvas to jump to LaTeX source');
    expect(html).toContain('Pop out PDF to separate window');
  });

  it('WorkspaceManager protects against accidental project switch when compiling or files dirty', async () => {
    // 1. Mark file dirty
    useWorkspaceStore.setState({
      dirtyFiles: { '/mock/workspace/project-alpha/main.tex': true },
    });

    const confirmSpy = vi.spyOn(dialog, 'confirm').mockResolvedValue(false);

    const switched = await WorkspaceManager.switchWorkspace('/mock/workspace/project-beta');
    expect(switched).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unsaved Changes or Active Task',
        isDestructive: true,
      })
    );
    expect(useWorkspaceStore.getState().workspacePath).toBe('/mock/workspace/project-alpha');

    confirmSpy.mockRestore();
  });

  it('WorkspaceManager cleanly switches projects when user confirms or state is clean', async () => {
    useWorkspaceStore.setState({ dirtyFiles: {} });
    useCompilerStore.setState({ status: 'idle' });

    vi.spyOn(tauriClient, 'listFiles').mockResolvedValue([
      {
        name: 'main.tex',
        path: '/mock/workspace/project-beta/main.tex',
        isDirectory: false,
      },
    ]);

    const switched = await WorkspaceManager.switchWorkspace('/mock/workspace/project-beta');
    expect(switched).toBe(true);
    expect(useWorkspaceStore.getState().workspacePath).toBe('/mock/workspace/project-beta');
  });

  it('WorkspaceManager persists session state and restores initial workspace', async () => {
    const saveSpy = vi.spyOn(tauriClient, 'saveProjectSettings').mockResolvedValue({});
    await WorkspaceManager.saveCurrentSession();
    expect(saveSpy).toHaveBeenCalledWith(
      '/mock/workspace/project-alpha',
      expect.objectContaining({
        openFiles: ['/mock/workspace/project-alpha/main.tex'],
        activeFile: '/mock/workspace/project-alpha/main.tex',
      })
    );
    saveSpy.mockRestore();
  });
});
