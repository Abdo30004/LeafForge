import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ContextMenu, type ContextMenuItem } from '../components/common/ContextMenu';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { copyToClipboard } from '../utils/clipboard';
import { duplicateFile } from '../services/tauriClient';
import { FileText, Copy, Trash2 } from 'lucide-react';

describe('Desktop Context Menu & Tab Management Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useWorkspaceStore.setState({
      workspacePath: 'C:/mock/workspace',
      openFiles: [
        'C:/mock/workspace/main.tex',
        'C:/mock/workspace/intro.tex',
        'C:/mock/workspace/results.tex',
        'C:/mock/workspace/refs.bib',
      ],
      activeFilePath: 'C:/mock/workspace/intro.tex',
      fileContents: {},
      dirtyFiles: {},
      rootTexFile: 'C:/mock/workspace/main.tex',
    });
  });

  describe('ContextMenu Component Rendering', () => {
    it('renders menu items, icons, shortcuts, and dividers correctly', () => {
      const items: ContextMenuItem[] = [
        {
          label: 'Open Document',
          icon: FileText,
          shortcut: 'Enter',
          action: vi.fn(),
        },
        {
          label: 'Copy Path',
          icon: Copy,
          shortcut: 'Ctrl+C',
          action: vi.fn(),
        },
        { divider: true },
        {
          label: 'Delete File',
          icon: Trash2,
          shortcut: 'Del',
          danger: true,
          action: vi.fn(),
        },
        {
          label: 'Disabled Action',
          disabled: true,
          action: vi.fn(),
        },
      ];

      const html = renderToString(
        <ContextMenu x={150} y={220} items={items} onClose={vi.fn()} />
      );

      expect(html).toContain('Open Document');
      expect(html).toContain('Copy Path');
      expect(html).toContain('Delete File');
      expect(html).toContain('Disabled Action');
      expect(html).toContain('Ctrl+C');
      expect(html).toContain('Del');
      // Verify divider
      expect(html).toContain('h-[1px]');
      // Verify danger style class
      expect(html).toContain('text-rose-400');
      // Verify disabled style class
      expect(html).toContain('opacity-40');
    });

    it('sets correct coordinates in styling', () => {
      const items: ContextMenuItem[] = [
        { label: 'Action 1', action: vi.fn() },
      ];

      const html = renderToString(
        <ContextMenu x={350} y={480} items={items} onClose={vi.fn()} />
      );

      expect(html).toContain('top:480px');
      expect(html).toContain('left:350px');
    });
  });

  describe('Workspace Tab Management Store Actions', () => {
    it('closeOtherFiles closes all tabs except the specified one', () => {
      const store = useWorkspaceStore.getState();
      expect(store.openFiles.length).toBe(4);

      store.closeOtherFiles('C:/mock/workspace/results.tex');

      const updated = useWorkspaceStore.getState();
      expect(updated.openFiles).toEqual(['C:/mock/workspace/results.tex']);
      expect(updated.activeFilePath).toBe('C:/mock/workspace/results.tex');
    });

    it('closeFilesToRight closes tabs to the right of target index', () => {
      const store = useWorkspaceStore.getState();

      store.closeFilesToRight('C:/mock/workspace/intro.tex');

      const updated = useWorkspaceStore.getState();
      expect(updated.openFiles).toEqual([
        'C:/mock/workspace/main.tex',
        'C:/mock/workspace/intro.tex',
      ]);
      expect(updated.activeFilePath).toBe('C:/mock/workspace/intro.tex');
    });

    it('closeAllFiles closes all opened documents', () => {
      const store = useWorkspaceStore.getState();

      store.closeAllFiles();

      const updated = useWorkspaceStore.getState();
      expect(updated.openFiles).toEqual([]);
      expect(updated.activeFilePath).toBeNull();
    });
  });

  describe('Clipboard Copy Utility', () => {
    it('successfully copies text to navigator clipboard', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const result = await copyToClipboard('\\input{sections/methods}');
      expect(result).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith('\\input{sections/methods}');
    });

    it('handles clipboard failure gracefully without throwing', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const result = await copyToClipboard('test');
      expect(result).toBe(false);
    });
  });

  describe('Duplicate File Tauri IPC Bridge', () => {
    it('returns mock fallback when outside Tauri environment', async () => {
      const result = await duplicateFile('C:/mock/workspace/paper.tex');
      expect(result).toBe('C:/mock/workspace/paper.tex_copy');
    });
  });
});
