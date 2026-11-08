import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { GitCommitInfo } from '../types/git';

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

vi.mock('../store/useGitStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/useGitStore')>();
  type State = ReturnType<typeof actual.useGitStore.getState>;
  const mockHook = <R,>(selector?: (state: State) => R) =>
    selector ? selector(actual.useGitStore.getState()) : actual.useGitStore.getState();
  Object.assign(mockHook, actual.useGitStore);
  return {
    ...actual,
    useGitStore: mockHook,
  };
});

import { GitControlPanel } from '../components/sidebar/GitControlPanel';
import { SettingsPanel } from '../components/sidebar/SettingsPanel';
import { useGitStore } from '../store/useGitStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

describe('Settings and Git History Test Suite', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspacePath: '/mock/workspace/academic-paper',
      theme: 'dark',
    });

    useGitStore.setState({
      isRepo: true,
      branch: 'main',
      remoteUrl: 'https://github.com/academic-lab/nature-paper.git',
      ahead: 2,
      behind: 1,
      commits: [
        {
          hash: 'c0ffee1234567890abcdef1234567890abcdef12',
          shortHash: 'c0ffee1',
          message: 'feat: add quantum decoherence analysis',
          authorName: 'Dr. Alice',
          authorEmail: 'alice@lab.org',
          timestamp: 1731085200,
        },
        {
          hash: 'deadbeef1234567890abcdef1234567890abcdef1',
          shortHash: 'deadbee',
          message: 'fix: correct equation 4 Hamiltonian notation',
          authorName: 'Bob',
          authorEmail: 'bob@lab.org',
          timestamp: 1731081600,
        },
      ] as GitCommitInfo[],
    });
  });

  it('renders linked GitHub repository badge and branch info', () => {
    const html = renderToString(<GitControlPanel />);
    expect(html).toContain('academic-lab/nature-paper');
    expect(html).toContain('Disconnect');
    expect(html).toContain('Pull');
    expect(html).toContain('Push');
  });

  it('renders commit history entries with short hash badges and messages', () => {
    const html = renderToString(<GitControlPanel />);
    expect(html).toContain('Recent Commits');
    expect(html).toContain('c0ffee1');
    expect(html).toContain('feat: add quantum decoherence analysis');
    expect(html).toContain('deadbee');
    expect(html).toContain('fix: correct equation 4 Hamiltonian notation');
    expect(html).toContain('Dr. Alice');
  });

  it('renders SettingsPanel with project and global configurations', () => {
    const html = renderToString(<SettingsPanel />);
    expect(html).toContain('Configuration &amp; Settings');
    expect(html).toContain('Project Settings');
    expect(html).toContain('.leafforge/settings.json');
    expect(html).toContain('Global Settings');
    expect(html).toContain('Root TeX Document');
    expect(html).toContain('Compilation Engine');
    expect(html).toContain('Obsidian Studio');
    expect(html).toContain('Parchment Precision');
  });
});
