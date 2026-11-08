import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CommandPalette } from '../components/modals/CommandPalette';
import { TopHeaderBar } from '../components/layout/TopHeaderBar';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useCompilerStore } from '../store/useCompilerStore';
import { useGitStore } from '../store/useGitStore';
import { useCollabStore } from '../store/useCollabStore';

describe('CommandPalette (Cmd/Ctrl+K) Unit & Integration Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useWorkspaceStore.setState({
      commandPaletteOpen: false,
      workspacePath: '/mock/workspace/project',
      activeFilePath: '/mock/workspace/project/main.tex',
      openFiles: ['/mock/workspace/project/main.tex', '/mock/workspace/project/refs.bib'],
      files: [
        { name: 'main.tex', path: '/mock/workspace/project/main.tex', isDirectory: false },
        { name: 'refs.bib', path: '/mock/workspace/project/refs.bib', isDirectory: false },
        { name: 'sections', path: '/mock/workspace/project/sections', isDirectory: true },
        { name: 'intro.tex', path: '/mock/workspace/project/sections/intro.tex', isDirectory: false },
      ],
      fileContents: {
        '/mock/workspace/project/main.tex':
          '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      },
      editorMode: 'raw',
      theme: 'dark',
      activeLineIsRtl: false,
      outlineItems: [
        { id: 'sec-1', type: 'section', title: '1. Introduction', line: 10, level: 1 },
        { id: 'sec-2', type: 'section', title: '2. Methodology', line: 45, level: 1 },
      ],
      editorJumpTarget: null,
    });

    useCompilerStore.setState({
      engine: 'tectonic',
      status: 'idle',
      lastBuildDurationMs: 0,
      logDrawerOpen: false,
      activeLogTab: 'errors',
      diagnostics: [],
    });

    useGitStore.setState({
      branch: 'main',
      isClean: true,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      deviceModalOpen: false,
    });

    useCollabStore.setState({
      status: 'disconnected',
      peers: [],
      followingPeerId: null,
    });
  });

  it('does not render when commandPaletteOpen is false', () => {
    const html = renderToString(<CommandPalette />);
    expect(html).toBe('');
  });

  it('renders complete dialog and action catalogue when commandPaletteOpen is true', () => {
    const html = renderToString(
      <CommandPalette
        isOpenOverride={true}
        filesOverride={[
          { name: 'main.tex', path: '/mock/workspace/project/main.tex', isDirectory: false },
          { name: 'refs.bib', path: '/mock/workspace/project/refs.bib', isDirectory: false },
          { name: 'intro.tex', path: '/mock/workspace/project/sections/intro.tex', isDirectory: false },
        ]}
        outlineItemsOverride={[
          { id: 'sec-1', type: 'section', title: '1. Introduction', line: 10, level: 1 },
          { id: 'sec-2', type: 'section', title: '2. Methodology', line: 45, level: 1 },
        ]}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Type a command or search files... (Cmd/Ctrl+K)');

    // Categories
    expect(html).toContain('All');
    expect(html).toContain('Editor');
    expect(html).toContain('Compiler');
    expect(html).toContain('Git');
    expect(html).toContain('BiDi / RTL');
    expect(html).toContain('Collaboration');
    expect(html).toContain('View');
    expect(html).toContain('Files');

    // Key commands across all subsystems
    expect(html).toContain('Switch to Visual Mode');
    expect(html).toContain('Save Active Document');
    expect(html).toContain('Toggle Paragraph Direction (RTL / LTR)');
    expect(html).toContain('Compile LaTeX Document');
    expect(html).toContain('Select Engine: Tectonic (Auto-CTAN / XeTeX)');
    expect(html).toContain('Select Engine: LuaLaTeX');
    expect(html).toContain('Refresh Git Repository Status');
    expect(html).toContain('Git: Stage All Modified Files');
    expect(html).toContain('GitHub: Connect Account (Device Flow)');
    expect(html).toContain('BiDi: Set Paragraph Direction to RTL');
    expect(html).toContain('RTL Typography: Select Amiri Font');
    expect(html).toContain('Collab: Connect to Real-Time CRDT Session');
    expect(html).toContain('View: Show File Explorer');
    expect(html).toContain('View: Toggle Theme');

    // Workspace files
    expect(html).toContain('Open: main.tex');
    expect(html).toContain('Open: refs.bib');
    expect(html).toContain('Open: intro.tex');

    // Document outline sections
    expect(html).toContain('Jump to: 1. Introduction');
    expect(html).toContain('Jump to: 2. Methodology');

    // Navigation hint bar
    expect(html).toContain('Navigate');
    expect(html).toContain('Select');
    expect(html).toContain('Close');
  });

  it('toggles command palette open and closed via workspace store', () => {
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(false);

    useWorkspaceStore.getState().toggleCommandPalette();
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(true);

    useWorkspaceStore.getState().toggleCommandPalette();
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(false);

    useWorkspaceStore.getState().setCommandPaletteOpen(true);
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(true);
  });

  it('renders Commands launch pill in TopHeaderBar', () => {
    const html = renderToString(<TopHeaderBar />);
    expect(html).toContain('Commands');
    expect(html).toContain('⌘K');
  });

  it('updates title when editor is in visual mode', () => {
    const html = renderToString(<CommandPalette isOpenOverride={true} editorModeOverride="visual" />);
    expect(html).toContain('Switch to Raw Source Mode');
  });

  it('updates title when collab session is connected', () => {
    const html = renderToString(
      <CommandPalette isOpenOverride={true} collabStatusOverride="connected" />
    );
    expect(html).toContain('Collab: Disconnect from Live Session');
  });
});
