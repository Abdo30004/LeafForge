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
import type { PeerUser } from '../types/collab';

describe('Comprehensive 3-Way CRDT-to-Git Reconciliation & Designated Committer Test Suite', () => {
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
      status: 'connected',
      roomId: 'room-test-1234',
      peers: [],
      designatedCommitterId: null,
      followingPeerId: null,
      userPermission: 'admin',
      canWrite: true,
      isCommitter: true,
      activeConflict: null,
    });
  });

  describe('Character-Level Minimal Delta Application (Y.Text)', () => {
    it('applies character insertion into middle of document without rewriting full text', () => {
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText('main.tex');
      ytext.insert(0, 'The quick brown fox jumps.');

      // Insert "lazy " before "fox"
      applyTextDelta(ytext, 'The quick brown fox jumps.', 'The quick brown lazy fox jumps.');

      expect(ytext.toString()).toBe('The quick brown lazy fox jumps.');
    });

    it('applies character deletion accurately', () => {
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText('main.tex');
      ytext.insert(0, 'First line\nSecond redundant line\nThird line');

      applyTextDelta(
        ytext,
        'First line\nSecond redundant line\nThird line',
        'First line\nThird line'
      );

      expect(ytext.toString()).toBe('First line\nThird line');
    });

    it('handles total replacement when strings have no common prefix or suffix', () => {
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText('main.tex');
      ytext.insert(0, 'AAAA');

      applyTextDelta(ytext, 'AAAA', 'ZZZZ');
      expect(ytext.toString()).toBe('ZZZZ');
    });
  });

  describe('Conflict Hunk Parsing & Interactive Reassembly', () => {
    it('parses multi-hunk conflict document into distinct structured ConflictHunk objects', () => {
      const docWithConflicts = [
        '\\documentclass{article}',
        '<<<<<<< LIVE SESSION (CRDT)',
        '\\author{Alice Cooper}',
        '=======',
        '\\author{Bob Marley}',
        '>>>>>>> INCOMING GIT COMMIT',
        '\\begin{document}',
        '<<<<<<< LIVE SESSION (CRDT)',
        'We propose Method A.',
        '=======',
        'We propose Method B.',
        '>>>>>>> INCOMING GIT COMMIT',
        '\\end{document}',
      ].join('\n');

      const hunks = parseConflictHunks(docWithConflicts);
      expect(hunks).toHaveLength(2);

      expect(hunks[0]?.index).toBe(0);
      expect(hunks[0]?.liveContent).toBe('\\author{Alice Cooper}');
      expect(hunks[0]?.remoteContent).toBe('\\author{Bob Marley}');

      expect(hunks[1]?.index).toBe(1);
      expect(hunks[1]?.liveContent).toBe('We propose Method A.');
      expect(hunks[1]?.remoteContent).toBe('We propose Method B.');
    });

    it('reassembles resolved document choosing live for hunk 0 and remote for hunk 1', () => {
      const docWithConflicts = [
        'Preamble',
        '<<<<<<< LIVE SESSION (CRDT)',
        'Live Author',
        '=======',
        'Remote Author',
        '>>>>>>> INCOMING GIT COMMIT',
        'Middle text',
        '<<<<<<< LIVE SESSION (CRDT)',
        'Live Abstract',
        '=======',
        'Remote Abstract',
        '>>>>>>> INCOMING GIT COMMIT',
        'Ending',
      ].join('\n');

      const choices: Record<number, 'live' | 'remote'> = {
        0: 'live',
        1: 'remote',
      };

      const resolved = assembleResolvedDocument(docWithConflicts, choices);

      expect(resolved).toContain('Preamble');
      expect(resolved).toContain('Live Author');
      expect(resolved).not.toContain('Remote Author');
      expect(resolved).toContain('Middle text');
      expect(resolved).toContain('Remote Abstract');
      expect(resolved).not.toContain('Live Abstract');
      expect(resolved).toContain('Ending');
      expect(resolved).not.toContain('<<<<<<<');
      expect(resolved).not.toContain('>>>>>>>');
    });
  });

  describe('Designated Committer Election Algorithm', () => {
    function electCommitter(peers: PeerUser[]): PeerUser | null {
      // Must have write/admin permission
      const eligible = peers.filter((p) => p.canWrite && (p.permission === 'admin' || p.permission === 'write'));
      if (eligible.length === 0) return null;

      // Leader = min(joinedAt, clientId)
      return eligible.reduce((prev, curr) => {
        if (curr.joinedAt < prev.joinedAt) return curr;
        if (curr.joinedAt === prev.joinedAt && curr.clientId < prev.clientId) return curr;
        return prev;
      });
    }

    it('elects earliest joined peer as Designated Committer', () => {
      const peers: PeerUser[] = [
        {
          clientId: 10,
          username: 'bob',
          avatarUrl: 'bob.png',
          color: '#10b981',
          joinedAt: 2000,
          permission: 'write',
          canWrite: true,
        },
        {
          clientId: 5,
          username: 'alice',
          avatarUrl: 'alice.png',
          color: '#38bdf8',
          joinedAt: 1000, // Joined first
          permission: 'admin',
          canWrite: true,
        },
      ];

      const leader = electCommitter(peers);
      expect(leader).not.toBeNull();
      expect(leader?.username).toBe('alice');
      expect(leader?.clientId).toBe(5);
    });

    it('breaks ties using lower clientId if timestamps are identical', () => {
      const peers: PeerUser[] = [
        {
          clientId: 42,
          username: 'carol',
          avatarUrl: 'carol.png',
          color: '#f59e0b',
          joinedAt: 1500,
          permission: 'write',
          canWrite: true,
        },
        {
          clientId: 12,
          username: 'david',
          avatarUrl: 'david.png',
          color: '#8b5cf6',
          joinedAt: 1500, // Same timestamp
          permission: 'write',
          canWrite: true,
        },
      ];

      const leader = electCommitter(peers);
      expect(leader?.username).toBe('david');
      expect(leader?.clientId).toBe(12);
    });

    it('excludes read-only peers from committer election', () => {
      const peers: PeerUser[] = [
        {
          clientId: 1,
          username: 'reviewer_guest',
          avatarUrl: 'guest.png',
          color: '#9ca3af',
          joinedAt: 500, // Joined earlier, but read-only
          permission: 'read',
          canWrite: false,
        },
        {
          clientId: 99,
          username: 'author_writer',
          avatarUrl: 'author.png',
          color: '#38bdf8',
          joinedAt: 2500,
          permission: 'write',
          canWrite: true,
        },
      ];

      const leader = electCommitter(peers);
      expect(leader?.username).toBe('author_writer');
      expect(leader?.clientId).toBe(99);
    });

    it('promotes next peer when current leader disconnects', () => {
      const initialPeers: PeerUser[] = [
        { clientId: 1, username: 'alice', avatarUrl: '', color: '', joinedAt: 100, permission: 'admin', canWrite: true },
        { clientId: 2, username: 'bob', avatarUrl: '', color: '', joinedAt: 200, permission: 'write', canWrite: true },
        { clientId: 3, username: 'charlie', avatarUrl: '', color: '', joinedAt: 300, permission: 'write', canWrite: true },
      ];

      expect(electCommitter(initialPeers)?.username).toBe('alice');

      // Alice disconnects
      const updatedPeers = initialPeers.filter((p) => p.username !== 'alice');
      const newLeader = electCommitter(updatedPeers);

      expect(newLeader?.username).toBe('bob');
      expect(newLeader?.clientId).toBe(2);
    });
  });

  describe('gitCrdtBridge 3-Way Reconciliation Workflow', () => {
    it('performs clean reconciliation when incoming remote changes have no conflicts', async () => {
      const filePath = '/mock/workspace/project/main.tex';
      gitCrdtBridge.setBase(filePath, 'Base Initial');

      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'Live Editing');

      vi.spyOn(tauriClient, 'gitReconcile3Way').mockResolvedValueOnce({
        clean: true,
        mergedText: 'Clean Merged Content',
        hasConflicts: false,
        conflictCount: 0,
      });

      const res = await gitCrdtBridge.reconcileFile(filePath, 'Remote Commit');

      expect(res.status).toBe('clean');
      expect(ytext.toString()).toBe('Clean Merged Content');
      expect(gitCrdtBridge.getBase(filePath)).toBe('Clean Merged Content');
    });

    it('surfaces conflict state in collab store when divergence cannot be cleanly merged', async () => {
      const filePath = '/mock/workspace/project/main.tex';
      gitCrdtBridge.setBase(filePath, 'Base Title');

      const ytext = collabManager.getYText(filePath);
      ytext.delete(0, ytext.length);
      ytext.insert(0, 'Live Title');

      const conflictedText = [
        '\\documentclass{article}',
        '<<<<<<< LIVE SESSION (CRDT)',
        'Live Title',
        '=======',
        'Remote Title',
        '>>>>>>> INCOMING GIT COMMIT',
        '\\end{document}',
      ].join('\n');

      vi.spyOn(tauriClient, 'gitReconcile3Way').mockResolvedValueOnce({
        clean: false,
        mergedText: conflictedText,
        hasConflicts: true,
        conflictCount: 1,
      });

      const res = await gitCrdtBridge.reconcileFile(filePath, 'Remote Title');

      expect(res.status).toBe('conflict');
      expect(res.conflictCount).toBe(1);
      const activeConflict = useCollabStore.getState().activeConflict;
      expect(activeConflict).not.toBeNull();
      expect(activeConflict?.filePath).toBe(filePath);
      expect(activeConflict?.hunks).toHaveLength(1);
    });
  });
});
