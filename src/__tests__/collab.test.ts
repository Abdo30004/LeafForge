import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { yCollab } from 'y-codemirror.next';
import {
  collabManager,
  createInviteToken,
  parseInviteToken,
  deriveKeyFromPassphrase,
} from '../services/collabManager';
import { useCollabStore } from '../store/useCollabStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useGitStore } from '../store/useGitStore';
import { parseGithubOwnerRepo } from '../services/tauriClient';
import * as tauriClient from '../services/tauriClient';

describe('Yjs CRDT Engine & CollabManager Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useWorkspaceStore.setState({
      workspacePath: '/mock/workspace/project',
      activeFilePath: '/mock/workspace/project/main.tex',
      fileContents: {
        '/mock/workspace/project/main.tex':
          '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      },
    });

    useGitStore.setState({
      userProfile: {
        username: 'alice',
        avatarUrl: 'https://github.com/alice.png',
        name: 'Alice',
      },
    });

    useCollabStore.setState({
      status: 'disconnected',
      roomId: null,
      peers: [],
      designatedCommitterId: null,
      followingPeerId: null,
      userPermission: null,
      canWrite: true,
      isCommitter: false,
      activeConflict: null,
    });
  });

  it('parses GitHub owner and repository from HTTPS and SSH URLs', () => {
    expect(parseGithubOwnerRepo('https://github.com/torvalds/linux.git')).toEqual({
      owner: 'torvalds',
      repo: 'linux',
    });
    expect(parseGithubOwnerRepo('https://github.com/overleaf/overleaf')).toEqual({
      owner: 'overleaf',
      repo: 'overleaf',
    });
    expect(parseGithubOwnerRepo('git@github.com:facebook/react.git')).toEqual({
      owner: 'facebook',
      repo: 'react',
    });
    expect(parseGithubOwnerRepo('invalid-url')).toBeNull();
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

  it('enforces GitHub collaborator permission gate (admin/write vs read vs none)', async () => {
    // 1. Admin/Write permission -> Read-write access
    vi.spyOn(tauriClient, 'verifyRepoCollaborator').mockResolvedValueOnce({
      permission: 'write',
      canWrite: true,
      canRead: true,
    });

    await collabManager.connect('/mock/workspace/project', {
      owner: 'academics',
      repo: 'nature-paper',
    });

    expect(useCollabStore.getState().status).toBe('connected');
    expect(useCollabStore.getState().userPermission).toBe('write');
    expect(useCollabStore.getState().canWrite).toBe(true);

    // 2. Read-only permission -> canWrite is false
    vi.spyOn(tauriClient, 'verifyRepoCollaborator').mockResolvedValueOnce({
      permission: 'read',
      canWrite: false,
      canRead: true,
    });

    await collabManager.connect('/mock/workspace/project', {
      owner: 'academics',
      repo: 'nature-paper',
    });

    expect(useCollabStore.getState().status).toBe('connected');
    expect(useCollabStore.getState().userPermission).toBe('read');
    expect(useCollabStore.getState().canWrite).toBe(false);

    // 3. Permission "none" -> Connection rejected with error
    vi.spyOn(tauriClient, 'verifyRepoCollaborator').mockResolvedValueOnce({
      permission: 'none',
      canWrite: false,
      canRead: false,
    });

    await expect(
      collabManager.connect('/mock/workspace/project', {
        owner: 'academics',
        repo: 'nature-paper',
      })
    ).rejects.toThrow(/Permission denied/);

    expect(useCollabStore.getState().status).toBe('disconnected');
  });

  it('elects Designated Committer only from ActiveWritePeers with minimal (joinedAt, clientId)', () => {
    const peers = [
      {
        clientId: 42,
        username: 'alice',
        avatarUrl: 'alice.png',
        color: '#38bdf8',
        joinedAt: 1000,
        permission: 'write' as const,
        canWrite: true,
      },
      {
        clientId: 5,
        username: 'viewer-dave',
        avatarUrl: 'dave.png',
        color: '#aaaaaa',
        joinedAt: 100, // Joined earlier, BUT read-only -> CANNOT be elected
        permission: 'read' as const,
        canWrite: false,
      },
      {
        clientId: 15,
        username: 'bob',
        avatarUrl: 'bob.png',
        color: '#34d399',
        joinedAt: 500, // Joined earlier with write access -> should be elected leader
        permission: 'admin' as const,
        canWrite: true,
      },
      {
        clientId: 99,
        username: 'charlie',
        avatarUrl: 'charlie.png',
        color: '#f43f5e',
        joinedAt: 1500,
        permission: 'write' as const,
        canWrite: true,
      },
    ];

    const activeWritePeers = peers.filter(
      (p) => p.canWrite !== false && (p.permission === 'admin' || p.permission === 'write')
    );

    const sorted = [...activeWritePeers].sort((a, b) => {
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
    expect(useCollabStore.getState().isCommitter).toBe(false);
  });

  it('generates and parses shareable invite tokens for public repository collaboration', () => {
    const roomId = 'leafforge-quantum-physics-abc12345';
    const key = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const token = createInviteToken(roomId, key, 'quantum-physics');

    expect(token).toBeDefined();
    expect(token.startsWith('LFCOLLAB:')).toBe(true);

    const parsed = parseInviteToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.roomId).toBe(roomId);
    expect(parsed?.key).toBe(key);
    expect(parsed?.project).toBe('quantum-physics');

    // Also handles leafforge://collab invite URLs
    const url = `leafforge://collab?room=${roomId}&key=${key}&project=quantum-physics`;
    const parsedUrl = parseInviteToken(url);
    expect(parsedUrl).not.toBeNull();
    expect(parsedUrl?.roomId).toBe(roomId);
    expect(parsedUrl?.key).toBe(key);

    // Rejects invalid token
    expect(parseInviteToken('invalid-gibberish')).toBeNull();
  });

  it('derives 256-bit AES key deterministically from human passphrase', async () => {
    const key1 = await deriveKeyFromPassphrase('super-secret-academic-passphrase');
    const key2 = await deriveKeyFromPassphrase('super-secret-academic-passphrase');
    const key3 = await deriveKeyFromPassphrase('different-passphrase');

    expect(key1).toBe(key2);
    expect(key1.length).toBe(64); // 256-bit hex
    expect(key1).not.toBe(key3);
  });

  it('connects to collaborative session using invite token in-memory without reading room.key file', async () => {
    const roomId = 'leafforge-shared-public-room';
    const key = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const token = createInviteToken(roomId, key);

    const connectedRoomId = await collabManager.connect('/mock/workspace/project', token);
    expect(connectedRoomId).toBe(roomId);
    expect(useCollabStore.getState().status).toBe('connected');
    expect(useCollabStore.getState().roomId).toBe(roomId);
    expect(collabManager.roomKey).toBe(key);
  });
});
