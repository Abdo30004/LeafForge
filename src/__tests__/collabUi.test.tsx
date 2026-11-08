import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CollabPanel } from '../components/sidebar/CollabPanel';
import { ConflictModal } from '../components/modals/ConflictModal';
import { TopHeaderBar } from '../components/layout/TopHeaderBar';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { ConflictState, PeerUser } from '../types/collab';

describe('CollabPanel, ConflictModal & Presence UI Components', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspacePath: '/mock/workspace/project',
      activeFilePath: '/mock/workspace/project/main.tex',
      fileContents: {
        '/mock/workspace/project/main.tex': '\\documentclass{article}\nHello World',
      },
    });
  });

  it('renders CollabPanel in disconnected state with connection options', () => {
    const html = renderToString(<CollabPanel statusOverride="disconnected" />);
    expect(html).toContain('Collaboration');
    expect(html).toContain('Real-Time CRDT Session');
    expect(html).toContain('Secured by repo key in .texflow/room.key');
    expect(html).toContain('Start Live Session');
    expect(html).toContain('Host Session');
    expect(html).toContain('Join Session');
  });

  it('renders CollabPanel in connected state with peers and Designated Committer leader', () => {
    const peers: PeerUser[] = [
      {
        clientId: 1,
        username: 'alice',
        avatarUrl: 'https://github.com/alice.png',
        color: '#38bdf8',
        joinedAt: 100,
        permission: 'admin',
        canWrite: true,
      },
      {
        clientId: 2,
        username: 'bob',
        avatarUrl: 'https://github.com/bob.png',
        color: '#34d399',
        joinedAt: 200,
        permission: 'write',
        canWrite: true,
      },
    ];

    const html = renderToString(
      <CollabPanel
        statusOverride="connected"
        roomIdOverride="leafforge-project-12345678"
        peersOverride={peers}
        isCommitterOverride={true}
      />
    );

    expect(html).toContain('leafforge-project-12345678');
    expect(html).toContain('E2E Encrypted');
    expect(html).toContain('Copy Invite Token (Public Repos)');
    expect(html).toContain('You are Designated Committer');
    expect(html).toContain('Push Live Changes to GitHub');
    expect(html).toContain('Reconcile with Git (3-Way)');
    expect(html).toContain('alice');
    expect(html).toContain('bob');
    expect(html).toContain('Active Collaborators');
  });

  it('renders ConflictModal when active merge conflicts exist', () => {
    const mockConflict: ConflictState = {
      filePath: '/mock/workspace/project/main.tex',
      baseText: 'Base text',
      crdtText: 'Live text',
      remoteText: 'Remote text',
      mergedWithMarkers:
        'Header\n<<<<<<< LIVE SESSION (CRDT)\nLive text\n=======\nRemote text\n>>>>>>> INCOMING GIT COMMIT\nFooter',
      hunks: [
        {
          id: 'hunk-0',
          index: 0,
          liveContent: 'Live text',
          remoteContent: 'Remote text',
          chosen: null,
        },
      ],
    };

    const html = renderToString(<ConflictModal conflictOverride={mockConflict} />);
    expect(html).toContain('3-Way Merge Conflicts Detected');
    expect(html).toContain('Conflict');
    expect(html).toContain('main.tex');
    expect(html).toContain('Keep All Live (CRDT)');
    expect(html).toContain('Accept All Incoming (Git)');
    expect(html).toContain('Live Session (CRDT)');
    expect(html).toContain('Incoming Git Commit');
    expect(html).toContain('Apply Resolution');
  });

  it('renders collaborator avatars and Crown in TopHeaderBar', () => {
    const peers: PeerUser[] = [
      {
        clientId: 42,
        username: 'lead-author',
        avatarUrl: 'https://github.com/lead-author.png',
        color: '#38bdf8',
        joinedAt: 50,
        permission: 'admin',
        canWrite: true,
      },
    ];

    const html = renderToString(
      <TopHeaderBar peersOverride={peers} designatedCommitterIdOverride={42} />
    );

    expect(html).toContain('lead-author');
    expect(html).toContain('Designated Committer');
  });
});
