import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import {
  applyTextDelta,
  parseConflictHunks,
  assembleResolvedDocument,
  gitCrdtBridge,
} from '../services/gitCrdtBridge';
import { collabManager } from '../services/collabManager';
import { useCollabStore } from '../store/useCollabStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import * as tauriClient from '../services/tauriClient';

describe('3-Way CRDT-to-Git Reconciler & Conflict Resolver Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useWorkspaceStore.setState({
      workspacePath: '/mock/workspace/project',
      activeFilePath: '/mock/workspace/project/main.tex',
      fileContents: {
        '/mock/workspace/project/main.tex':
          '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      },
      dirtyFiles: {},
    });

    useCollabStore.setState({
      status: 'disconnected',
      roomId: null,
      peers: [],
      designatedCommitterId: null,
      followingPeerId: null,
      userPermission: 'admin',
      canWrite: true,
      isCommitter: false,
      activeConflict: null,
    });
  });

  describe('Character-level Delta & Hunk Parser Algorithms', () => {
    it('applies minimal character delta into Y.Text preserving common prefix and suffix', () => {
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText('test.tex');
      ytext.insert(0, 'Hello beautiful world of LaTeX!');

      // Replace "beautiful" with "magnificent"
      applyTextDelta(ytext, 'Hello beautiful world of LaTeX!', 'Hello magnificent world of LaTeX!');

      expect(ytext.toString()).toBe('Hello magnificent world of LaTeX!');
    });

    it('handles no-op delta when text is identical', () => {
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText('test.tex');
      ytext.insert(0, 'Unchanged text');

      applyTextDelta(ytext, 'Unchanged text', 'Unchanged text');
      expect(ytext.toString()).toBe('Unchanged text');
    });

    it('parses conflict markers into structured ConflictHunk objects', () => {
      const textWithConflicts = [
        '\\documentclass{article}',
        '<<<<<<< LIVE SESSION (CRDT)',
        '\\title{Quantum Computing with Yjs}',
        '=======',
        '\\title{Distributed Systems with Git}',
        '>>>>>>> INCOMING GIT COMMIT',
        '\\begin{document}',
        '<<<<<<< LIVE SESSION (CRDT)',
        'Author: Alice (CRDT)',
        '=======',
        'Author: Bob (Git Remote)',
        '>>>>>>> INCOMING GIT COMMIT',
        '\\end{document}',
      ].join('\n');

      const hunks = parseConflictHunks(textWithConflicts);
      expect(hunks).toHaveLength(2);

      expect(hunks[0]?.index).toBe(0);
      expect(hunks[0]?.liveContent).toBe('\\title{Quantum Computing with Yjs}');
      expect(hunks[0]?.remoteContent).toBe('\\title{Distributed Systems with Git}');

      expect(hunks[1]?.index).toBe(1);
      expect(hunks[1]?.liveContent).toBe('Author: Alice (CRDT)');
      expect(hunks[1]?.remoteContent).toBe('Author: Bob (Git Remote)');
    });

    it('reassembles resolved document based on per-hunk user selections', () => {
      const textWithConflicts = [
        'Line 1: preamble',
        '<<<<<<< LIVE SESSION (CRDT)',
        'Line 2: live choice',
        '=======',
        'Line 2: remote choice',
        '>>>>>>> INCOMING GIT COMMIT',
        'Line 3: middle',
        '<<<<<<< LIVE SESSION (CRDT)',
        'Line 4: live choice 2',
        '=======',
        'Line 4: remote choice 2',
        '>>>>>>> INCOMING GIT COMMIT',
        'Line 5: end',
      ].join('\n');

      // Pick live for hunk 0, remote for hunk 1
      const resolved = assembleResolvedDocument(textWithConflicts, {
        0: 'live',
        1: 'remote',
      });

      expect(resolved).toBe(
        ['Line 1: preamble', 'Line 2: live choice', 'Line 3: middle', 'Line 4: remote choice 2', 'Line 5: end'].join('\n')
      );
    });
  });

  describe('3-Way CRDT-to-Git Reconciliation Scenarios (Subsystem B.3)', () => {
    const filePath = '/mock/workspace/project/main.tex';

    it('Scenario 1: Remote is up to date with base -> live CRDT wins cleanly', async () => {
      const baseContent = 'Initial content at HEAD';
      gitCrdtBridge.setBase(filePath, baseContent);

      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'Live CRDT content edited by peers');

      const outcome = await gitCrdtBridge.reconcileFile(filePath, baseContent);

      expect(outcome.status).toBe('up-to-date');
      expect(outcome.mergedText).toBe('Live CRDT content edited by peers');
      expect(useCollabStore.getState().activeConflict).toBeNull();
    });

    it('Scenario 2: CRDT equals remote -> trivially clean alignment', async () => {
      const text = 'Identical content across Git and CRDT';
      gitCrdtBridge.setBase(filePath, 'Old base');

      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, text);

      const outcome = await gitCrdtBridge.reconcileFile(filePath, text);

      expect(outcome.status).toBe('clean');
      expect(outcome.mergedText).toBe(text);
      expect(gitCrdtBridge.getBase(filePath)).toBe(text);
    });

    it('Scenario 3: CRDT untouched from base, Remote changed -> remote applied cleanly to Y.Text', async () => {
      const baseContent = 'Base line 1\nBase line 2';
      const remoteContent = 'Base line 1\nRemote updated line 2';

      gitCrdtBridge.setBase(filePath, baseContent);
      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, baseContent);

      const outcome = await gitCrdtBridge.reconcileFile(filePath, remoteContent);

      expect(outcome.status).toBe('clean');
      expect(outcome.mergedText).toBe(remoteContent);
      expect(ytext.toString()).toBe(remoteContent);
      expect(useWorkspaceStore.getState().fileContents[filePath]).toBe(remoteContent);
    });

    it('Scenario 4: Clean 3-way merge when CRDT and Remote edit different non-conflicting parts', async () => {
      const base = 'Header\nBody\nFooter';
      const crdt = 'Header\nBody edited in live session\nFooter';
      const remote = 'Header edited in git\nBody\nFooter';

      gitCrdtBridge.setBase(filePath, base);
      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, crdt);

      vi.spyOn(tauriClient, 'gitReconcile3Way').mockResolvedValueOnce({
        clean: true,
        mergedText: 'Header edited in git\nBody edited in live session\nFooter',
        hasConflicts: false,
        conflictCount: 0,
      });

      const outcome = await gitCrdtBridge.reconcileFile(filePath, remote);

      expect(outcome.status).toBe('clean');
      expect(outcome.mergedText).toBe('Header edited in git\nBody edited in live session\nFooter');
      expect(ytext.toString()).toBe('Header edited in git\nBody edited in live session\nFooter');
      expect(useCollabStore.getState().activeConflict).toBeNull();
    });

    it('Scenario 5: Conflict detected -> surfaces ConflictModal and pauses for resolution', async () => {
      const base = 'Section 1\nSection 2\nSection 3';
      const crdt = 'Section 1\nSection 2 (Live Peer Edit)\nSection 3';
      const remote = 'Section 1\nSection 2 (Git Pull Push Edit)\nSection 3';

      gitCrdtBridge.setBase(filePath, base);
      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, crdt);

      const conflictMarkers = [
        'Section 1',
        '<<<<<<< LIVE SESSION (CRDT)',
        'Section 2 (Live Peer Edit)',
        '=======',
        'Section 2 (Git Pull Push Edit)',
        '>>>>>>> INCOMING GIT COMMIT',
        'Section 3',
      ].join('\n');

      vi.spyOn(tauriClient, 'gitReconcile3Way').mockResolvedValueOnce({
        clean: false,
        mergedText: conflictMarkers,
        hasConflicts: true,
        conflictCount: 1,
      });

      const outcome = await gitCrdtBridge.reconcileFile(filePath, remote);

      expect(outcome.status).toBe('conflict');
      expect(outcome.conflictCount).toBe(1);
      expect(useCollabStore.getState().activeConflict).not.toBeNull();
      expect(useCollabStore.getState().activeConflict?.filePath).toBe(filePath);
      expect(useCollabStore.getState().activeConflict?.hunks).toHaveLength(1);
    });

    it('resolves active conflict applying user choice to Y.Text and closing modal', async () => {
      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'Conflicted text before resolution');

      const resolvedText = 'Section 1\nSection 2 (Live Peer Edit)\nSection 3';

      await gitCrdtBridge.resolveConflict(filePath, resolvedText, '/mock/workspace/project');

      expect(ytext.toString()).toBe(resolvedText);
      expect(gitCrdtBridge.getBase(filePath)).toBe(resolvedText);
      expect(useWorkspaceStore.getState().fileContents[filePath]).toBe(resolvedText);
      expect(useCollabStore.getState().activeConflict).toBeNull();
    });
  });

  describe('Designated Committer Push Authorization Guard (Subsystem B.2)', () => {
    it('blocks non-committer peer from pushing to GitHub during active multi-peer session', async () => {
      useCollabStore.setState({
        status: 'connected',
        isCommitter: false,
        designatedCommitterId: 10,
        peers: [
          {
            clientId: 10,
            username: 'alice-leader',
            avatarUrl: 'alice.png',
            color: '#38bdf8',
            joinedAt: 100,
            permission: 'admin',
            canWrite: true,
          },
          {
            clientId: 20,
            username: 'bob-collaborator',
            avatarUrl: 'bob.png',
            color: '#34d399',
            joinedAt: 200,
            permission: 'write',
            canWrite: true,
          },
        ],
      });

      await expect(
        gitCrdtBridge.designatedCommitterPush('/mock/workspace/project', 'chore: test commit')
      ).rejects.toThrow(/Only the elected Designated Committer \(@alice-leader\) can push/);
    });

    it('allows elected Designated Committer to stage, commit, and push cleanly', async () => {
      useCollabStore.setState({
        status: 'connected',
        isCommitter: true,
        designatedCommitterId: 10,
        peers: [
          {
            clientId: 10,
            username: 'alice-leader',
            avatarUrl: 'alice.png',
            color: '#38bdf8',
            joinedAt: 100,
            permission: 'admin',
            canWrite: true,
          },
          {
            clientId: 20,
            username: 'bob-collaborator',
            avatarUrl: 'bob.png',
            color: '#34d399',
            joinedAt: 200,
            permission: 'write',
            canWrite: true,
          },
        ],
      });

      const stageSpy = vi.spyOn(tauriClient, 'gitStageAll').mockResolvedValueOnce();
      const commitSpy = vi.spyOn(tauriClient, 'gitCommit').mockResolvedValueOnce('mock_commit_sha_123');
      const pushSpy = vi.spyOn(tauriClient, 'gitPush').mockResolvedValueOnce();

      const commitHash = await gitCrdtBridge.designatedCommitterPush(
        '/mock/workspace/project',
        'feat: collaborative edits'
      );

      expect(commitHash).toBe('mock_commit_sha_123');
      expect(stageSpy).toHaveBeenCalledWith('/mock/workspace/project');
      expect(commitSpy).toHaveBeenCalledWith('/mock/workspace/project', 'feat: collaborative edits');
      expect(pushSpy).toHaveBeenCalledWith('/mock/workspace/project', undefined, undefined);
    });
  });
});
