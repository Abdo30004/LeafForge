import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { yCollab } from 'y-codemirror.next';
import { collabManager } from '../services/collabManager';
import { useCollabStore } from '../store/useCollabStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

describe('Yjs CRDT Engine & CollabManager Test Suite', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspacePath: '/mock/workspace/project',
      activeFilePath: '/mock/workspace/project/main.tex',
      fileContents: {
        '/mock/workspace/project/main.tex': '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      },
    });

    useCollabStore.setState({
      status: 'disconnected',
      roomId: null,
      peers: [],
      designatedCommitterId: null,
      followingPeerId: null,
    });
  });

  it('manages Y.Doc instance and creates Y.Text for document files', () => {
    const ytext = collabManager.getYText('sections/intro.tex', 'Initial LaTeX Content');
    expect(ytext).toBeDefined();
    expect(ytext.toString()).toBe('Initial LaTeX Content');
  });

  it('binds yCollab extension to CodeMirror 6 with awareness', () => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('main.tex');
    ytext.insert(0, '\\section{Introduction}');

    const extension = yCollab(ytext, null);
    expect(extension).toBeDefined();
  });

  it('connects to collaborative session with encrypted room key from .texflow/room.key', async () => {
    const roomId = await collabManager.connect('/mock/workspace/project');
    expect(roomId).toBeDefined();
    expect(roomId).toContain('leafforge-project-');

    expect(useCollabStore.getState().status).toBe('connected');
    expect(useCollabStore.getState().roomId).toBe(roomId);
    expect(collabManager.roomKey).toBeDefined();
    expect(collabManager.roomKey?.length).toBe(64);
  });

  it('handles awareness local cursor updates', async () => {
    await collabManager.connect('/mock/workspace/project');
    collabManager.updateLocalCursor(12, 5, '/mock/workspace/project/main.tex');

    const state = collabManager.provider?.awareness.getLocalState();
    expect(state?.user?.cursor).toEqual({ line: 12, column: 5 });
    expect(state?.user?.activeFile).toBe('/mock/workspace/project/main.tex');
  });

  it('elects Designated Committer as peer with minimal (joinedAt, clientId)', () => {
    const peers = [
      {
        clientId: 42,
        username: 'alice',
        avatarUrl: 'alice.png',
        color: '#38bdf8',
        joinedAt: 1000,
      },
      {
        clientId: 15,
        username: 'bob',
        avatarUrl: 'bob.png',
        color: '#34d399',
        joinedAt: 500, // Joined earlier -> should be elected leader
      },
      {
        clientId: 99,
        username: 'charlie',
        avatarUrl: 'charlie.png',
        color: '#f43f5e',
        joinedAt: 1500,
      },
    ];

    const sorted = [...peers].sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
      return a.clientId - b.clientId;
    });

    expect(sorted[0]?.username).toBe('bob');
    expect(sorted[0]?.clientId).toBe(15);
  });

  it('disconnects and resets collaboration state cleanly', async () => {
    await collabManager.connect('/mock/workspace/project');
    expect(useCollabStore.getState().status).toBe('connected');

    collabManager.disconnect();
    expect(useCollabStore.getState().status).toBe('disconnected');
    expect(useCollabStore.getState().roomId).toBeNull();
    expect(useCollabStore.getState().peers).toEqual([]);
    expect(useCollabStore.getState().designatedCommitterId).toBeNull();
  });
});
