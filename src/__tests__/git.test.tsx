import { describe, it, expect, beforeEach } from 'vitest';
import { useGitStore } from '../store/useGitStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import {
  gitStatus,
  gitStage,
  gitUnstage,
  gitCommit,
  gitDiff,
  gitListBranches,
  gitCheckoutBranch,
  gitReconcile3Way,
} from '../services/tauriClient';

describe('Git Control & Reconciliation Test Suite', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspacePath: '/mock/workspace/project',
    });
    useGitStore.setState({
      branch: 'main',
      isClean: false,
      ahead: 1,
      behind: 0,
      staged: [{ path: 'main.tex', staged: true, status: 'modified' }],
      unstaged: [{ path: 'refs.bib', staged: false, status: 'untracked' }],
    });
  });

  it('provides full git status structure in mock environment', async () => {
    const status = await gitStatus('/mock/workspace/project');
    expect(status.branch).toBe('main');
    expect(status.isClean).toBe(true);
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
  });

  it('supports staging, unstaging, and committing operations', async () => {
    await expect(gitStage('/mock/workspace', 'main.tex')).resolves.toBeUndefined();
    await expect(gitUnstage('/mock/workspace', 'main.tex')).resolves.toBeUndefined();

    const commitOid = await gitCommit('/mock/workspace', 'feat: update document', 'Author', 'author@test.com');
    expect(commitOid).toBeDefined();
    expect(commitOid.length).toBe(40);
  });

  it('generates unified diff for staged and unstaged files', async () => {
    const diff = await gitDiff('/mock/workspace', 'main.tex', true);
    expect(diff).toContain('diff --git');
    expect(diff).toContain('-Old Line');
    expect(diff).toContain('+New Line');
  });

  it('lists branches and supports branch checkout', async () => {
    const branches = await gitListBranches('/mock/workspace');
    expect(branches).toContain('main');

    await expect(gitCheckoutBranch('/mock/workspace', 'feat/new-idea', true)).resolves.toBeUndefined();
  });

  it('reconciles 3-way CRDT to Git when clean', async () => {
    const base = 'Preamble\nBody line 1\nEnd';
    const crdt = 'Preamble\nBody line 1 (user)\nEnd';
    const remote = 'Preamble\nBody line 1\nEnd';

    const result = await gitReconcile3Way(base, crdt, remote);
    expect(result.clean).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.mergedText).toBe(crdt);
  });

  it('detects 3-way conflict when both CRDT and Git remote modify same section', async () => {
    const base = 'Line 1\nLine 2';
    const crdt = 'Line 1\nLine 2 modified by peer';
    const remote = 'Line 1\nLine 2 modified by git push';

    const result = await gitReconcile3Way(base, crdt, remote);
    expect(result.clean).toBe(false);
    expect(result.hasConflicts).toBe(true);
    expect(result.mergedText).toContain('<<<<<<< LIVE SESSION (CRDT)');
    expect(result.mergedText).toContain('>>>>>>> INCOMING GIT COMMIT');
  });
});
