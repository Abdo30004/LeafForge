import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useCollabStore } from '../store/useCollabStore';
import { useGitStore } from '../store/useGitStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { getOrCreateRoomKey } from './tauriClient';
import type { PeerUser, PeerCursor } from '../types/collab';

const PEER_COLORS = [
  '#38bdf8', // Indigo/Cyan
  '#34d399', // Emerald
  '#f43f5e', // Rose
  '#fbbf24', // Amber
  '#a855f7', // Purple
  '#fb923c', // Orange
  '#ec4899', // Pink
  '#2dd4bf', // Teal
];

function getRandomColor(): string {
  const index = Math.floor(Math.random() * PEER_COLORS.length);
  return PEER_COLORS[index] ?? '#38bdf8';
}

export class CollabManager {
  private static instance: CollabManager | null = null;

  public doc: Y.Doc;
  public provider: WebrtcProvider | null = null;
  public persistence: IndexeddbPersistence | null = null;
  public roomKey: string | null = null;
  public currentRoomId: string | null = null;
  public myColor: string;

  private constructor() {
    this.doc = new Y.Doc();
    this.myColor = getRandomColor();
  }

  public static getInstance(): CollabManager {
    if (!CollabManager.instance) {
      CollabManager.instance = new CollabManager();
    }
    return CollabManager.instance;
  }

  /**
   * Connect to collaborative room using public signaling encrypted by .texflow/room.key
   */
  public async connect(workspacePath: string, customRoomId?: string): Promise<string> {
    useCollabStore.getState().setStatus('connecting');

    try {
      // 1. Fetch or generate the 256-bit AES encryption key in .texflow/room.key
      const key = await getOrCreateRoomKey(workspacePath);
      this.roomKey = key;

      // 2. Generate room ID: custom ID or deterministic hash of workspace folder + key snippet
      const folderName = workspacePath.replace(/\\/g, '/').split('/').pop() || 'project';
      const roomId = customRoomId || `leafforge-${folderName}-${key.slice(0, 8)}`;
      this.currentRoomId = roomId;

      // 3. Clean up previous provider if any
      this.disconnect();

      // 4. Initialize IndexedDB offline cache persistence
      if (typeof window !== 'undefined' && 'indexedDB' in window) {
        this.persistence = new IndexeddbPersistence(roomId, this.doc);
      }

      // 5. Initialize WebRTC Provider with public signaling (wss://signaling.yjs.dev) secured with AES-GCM
      this.provider = new WebrtcProvider(roomId, this.doc, {
        signaling: ['wss://signaling.yjs.dev'],
        password: key, // Secures WebRTC signaling channels with repo key
      });

      // 6. Set local user awareness profile
      const userProfile = useGitStore.getState().userProfile;
      const initialActiveFile = useWorkspaceStore.getState().activeFilePath || undefined;

      this.provider.awareness.setLocalStateField('user', {
        clientId: this.doc.clientID,
        username: userProfile?.username || `Researcher-${this.doc.clientID.toString().slice(-4)}`,
        avatarUrl:
          userProfile?.avatarUrl ||
          `https://api.dicebear.com/7.x/identicon/svg?seed=${this.doc.clientID}`,
        color: this.myColor,
        joinedAt: Date.now(),
        activeFile: initialActiveFile,
      });

      // 7. Subscribe to awareness changes for peer list & Designated Committer election
      this.provider.awareness.on('change', () => {
        this.handleAwarenessUpdate();
      });

      this.provider.on('status', (event: { connected: boolean }) => {
        if (event.connected) {
          useCollabStore.getState().setStatus('connected');
        } else {
          useCollabStore.getState().setStatus('disconnected');
        }
      });

      useCollabStore.getState().setRoomId(roomId);
      useCollabStore.getState().setStatus('connected');
      this.handleAwarenessUpdate();

      return roomId;
    } catch (err) {
      console.error('Failed to connect to collab session:', err);
      useCollabStore.getState().setStatus('disconnected');
      throw err;
    }
  }

  /**
   * Handle awareness changes & elect deterministic Designated Committer (Subsystem B.2)
   */
  private handleAwarenessUpdate(): void {
    if (!this.provider) return;

    const states = this.provider.awareness.getStates();
    const peers: PeerUser[] = [];

    states.forEach((state, client) => {
      const u = state.user as
        | {
            clientId?: number;
            username?: string;
            avatarUrl?: string;
            color?: string;
            activeFile?: string;
            cursor?: PeerCursor;
            joinedAt?: number;
          }
        | undefined;

      if (u && u.username) {
        peers.push({
          clientId: client,
          username: u.username,
          avatarUrl: u.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${client}`,
          color: u.color || '#38bdf8',
          activeFile: u.activeFile,
          cursor: u.cursor,
          joinedAt: u.joinedAt || 0,
        });
      }
    });

    // Designated Committer Election:
    // Leader = argmin_{p in ActiveWritePeers} (p.joinedAt, p.clientId)
    const sorted = [...peers].sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
      return a.clientId - b.clientId;
    });

    const leader = sorted[0];
    const leaderId = leader ? leader.clientId : null;

    useCollabStore.getState().setPeers(peers);
    useCollabStore.getState().setDesignatedCommitterId(leaderId);

    // Follow Peer logic: if we are following a peer, check their active file and cursor
    const followingId = useCollabStore.getState().followingPeerId;
    if (followingId) {
      const followed = peers.find((p) => p.clientId === followingId);
      if (followed) {
        if (followed.activeFile) {
          const currentFile = useWorkspaceStore.getState().activeFilePath;
          if (currentFile !== followed.activeFile) {
            useWorkspaceStore.getState().setActiveFile(followed.activeFile);
          }
        }
        if (followed.cursor) {
          useWorkspaceStore.getState().setEditorJumpTarget({
            line: followed.cursor.line,
            col: followed.cursor.column,
          });
        }
      }
    }
  }

  /**
   * Broadcast local cursor & active file to peers via awareness
   */
  public updateLocalCursor(line: number, column: number, activeFile?: string): void {
    if (!this.provider) return;
    const currentState = this.provider.awareness.getLocalState();
    const currentUser = (currentState?.user || {}) as Record<string, unknown>;

    this.provider.awareness.setLocalStateField('user', {
      ...currentUser,
      activeFile: activeFile ?? currentUser.activeFile,
      cursor: { line, column },
    });
  }

  /**
   * Retrieve or create a synchronized Y.Text instance for a given file
   */
  public getYText(filePath: string, initialContent?: string): Y.Text {
    const ytext = this.doc.getText(filePath);
    if (ytext.toString().length === 0 && initialContent && initialContent.length > 0) {
      this.doc.transact(() => {
        ytext.insert(0, initialContent);
      }, 'initial-load');
    }
    return ytext;
  }

  /**
   * Disconnect from collaborative session
   */
  public disconnect(): void {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    if (this.persistence) {
      this.persistence.destroy();
      this.persistence = null;
    }
    this.currentRoomId = null;
    useCollabStore.getState().setStatus('disconnected');
    useCollabStore.getState().setRoomId(null);
    useCollabStore.getState().setPeers([]);
    useCollabStore.getState().setDesignatedCommitterId(null);
  }
}

export const collabManager = CollabManager.getInstance();
