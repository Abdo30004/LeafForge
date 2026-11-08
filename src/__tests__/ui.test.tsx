import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from '../App';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useCompilerStore } from '../store/useCompilerStore';

describe('LeafForge Academic Studio UI', () => {
  it('renders AppShell completely in server-side / headless DOM', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Leaf');
    expect(html).toContain('Forge');
    expect(html).toContain('Explorer');
    expect(html).toContain('SyncTeX Ready');
    expect(html).toContain('PDF Preview');
  });

  it('updates compiler status pill correctly', () => {
    const compiler = useCompilerStore.getState();
    compiler.setStatus('compiling');
    expect(useCompilerStore.getState().status).toBe('compiling');

    compiler.setBuildResult(145, [], 'Build successful');
    expect(useCompilerStore.getState().status).toBe('success');
    expect(useCompilerStore.getState().lastBuildDurationMs).toBe(145);
  });

  it('manages open file tabs and active document', () => {
    const workspace = useWorkspaceStore.getState();
    workspace.openFile('/workspace/main.tex', '\\documentclass{article}');
    expect(useWorkspaceStore.getState().openFiles).toContain('/workspace/main.tex');
    expect(useWorkspaceStore.getState().activeFilePath).toBe('/workspace/main.tex');
    expect(useWorkspaceStore.getState().fileContents['/workspace/main.tex']).toBe(
      '\\documentclass{article}'
    );

    workspace.updateFileContent('/workspace/main.tex', '% updated content');
    expect(useWorkspaceStore.getState().dirtyFiles['/workspace/main.tex']).toBe(true);

    workspace.markFileSaved('/workspace/main.tex');
    expect(useWorkspaceStore.getState().dirtyFiles['/workspace/main.tex']).toBe(false);

    workspace.closeFile('/workspace/main.tex');
    expect(useWorkspaceStore.getState().openFiles).not.toContain('/workspace/main.tex');
  });
});
