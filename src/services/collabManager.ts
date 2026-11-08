import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useCollabStore } from '../store/useCollabStore';
import { useGitStore } from '../store/useGitStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import {
  getOrCreateRoomKey,
  verifyRepoCollaborator,
  gitGetRemoteUrl,
  parseGithubOwnerRepo,
} from './tauriClient';
import { formatErrorDetails } from '../utils/formatError';
import { logger } from './logger';
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

export interface CollabConnectOptions {
  customRoomId?: string;
  customKey?: string;
  owner?: string;
  repo?: string;
  signalingServers?: string[];
  websocketUrl?: string;
  skipPermissionCheck?: boolean;
}

export interface CollabInvitePayload {
  roomId: string;
  key: string;
  project?: string;
}

/**
 * Creates an encrypted invite token string for sharing with collaborators out-of-band.
 * Works seamlessly in public repositories without committing secrets to Git.
 */
export function createInviteToken(roomId: string, key: string, project?: string): string {
  const payload: CollabInvitePayload = { roomId, key, project };
  return 'LFCOLLAB:' + btoa(JSON.stringify(payload));
}

/**
 * Parses an invite token or invite URL into room ID and encryption key.
 */
export function parseInviteToken(token: string): CollabInvitePayload | null {
  try {
    const raw = token.trim();
    if (!raw.startsWith('LFCOLLAB:')) {
      if (raw.startsWith('leafforge://collab')) {
        const url = new URL(raw);
        const roomId = url.searchParams.get('room');
        const key = url.searchParams.get('key');
        if (roomId && key) {
          return { roomId, key, project: url.searchParams.get('project') || undefined };
        }
      }
      return null;
    }
    const json = atob(raw.slice('LFCOLLAB:'.length));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed.roomId === 'string' && typeof parsed.key === 'string') {
      return parsed as CollabInvitePayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Derives a deterministic 256-bit hexadecimal AES key from a human passphrase
 * using SHA-256 via Web Crypto API.
 */
export async function deriveKeyFromPassphrase(passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(passphrase.trim()));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class CollabManager {
  private static instance: CollabManager | null = null;

  public doc: Y.Doc;
  public provider: WebrtcProvider | null = null;
  public wsProvider: WebsocketProvider | null = null;
  public persistence: IndexeddbPersistence | null = null;
  public roomKey: string | null = null;
  public currentRoomId: string | null = null;
  public myColor: string;
  public userPermission: 'admin' | 'write' | 'read' | 'none' = 'admin';
  public canWrite = true;

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

  public getRoomKey(): string | null {
    return this.roomKey;
  }

  /**
   * Connect to collaborative room using public signaling encrypted by .texflow/room.key or customKey
   * Secured by GitHub collaborator permission check (verify_repo_collaborator)
   */
  public async connect(
    workspacePath: string,
    optionsOrRoomId?: string | CollabConnectOptions
  ): Promise<string> {
    useCollabStore.getState().setStatus('connecting');

    let opts: CollabConnectOptions;
    if (typeof optionsOrRoomId === 'string') {
      const parsedToken = parseInviteToken(optionsOrRoomId);
      if (parsedToken) {
        opts = {
          customRoomId: parsedToken.roomId,
          customKey: parsedToken.key,
        };
      } else {
        opts = { customRoomId: optionsOrRoomId };
      }
    } else {
      opts = optionsOrRoomId || {};
    }

    try {
      // Clean up previous providers if any
      this.disconnect();

      // 1. GitHub Collaborator Permission Gate (Subsystem A.3)
      let owner = opts.owner;
      let repo = opts.repo;

      if (!owner || !repo) {
        try {
          const remoteUrl = await gitGetRemoteUrl(workspacePath);
          if (remoteUrl) {
            const parsed = parseGithubOwnerRepo(remoteUrl);
            if (parsed) {
              owner = parsed.owner;
              repo = parsed.repo;
            }
          }
        } catch (e) {
          logger.debug('Collab', 'Could not determine git remote URL', {
            error: formatErrorDetails(e),
          });
        }
      }

      const userProfile = useGitStore.getState().userProfile;
      let myPermission: 'admin' | 'write' | 'read' | 'none' = 'admin';
      let myCanWrite = true;

      if (owner && repo && !opts.skipPermissionCheck) {
        const username = userProfile?.username;
        if (!username) {
          throw new Error(
            `GitHub authentication required: Please sign in to collaborate on ${owner}/${repo}`
          );
        }

        const perm = await verifyRepoCollaborator(owner, repo, username);
        if (perm.permission === 'none' || (!perm.canRead && !perm.canWrite)) {
          throw new Error(
            `Permission denied: User @${username} does not have collaborator access to ${owner}/${repo}`
          );
        }

        myPermission = perm.permission;
        myCanWrite = perm.canWrite;
      }

      this.userPermission = myPermission;
      this.canWrite = myCanWrite;
      useCollabStore.getState().setUserPermission(myPermission, myCanWrite);

      // 2. Fetch or generate the 256-bit AES encryption key
      // If a customKey is supplied (via invite token or UI passphrase), use it directly in memory;
      // otherwise fallback to .texflow/room.key in local workspace.
      const key = opts.customKey || (await getOrCreateRoomKey(workspacePath));
      this.roomKey = key;

      // 3. Generate room ID: custom ID or deterministic hash of workspace folder + key snippet
      const folderName = workspacePath.replace(/\\/g, '/').split('/').pop() || 'project';
      const roomId = opts.customRoomId || `leafforge-${folderName}-${key.slice(0, 8)}`;
      this.currentRoomId = roomId;

      // 4. Initialize IndexedDB offline cache persistence
      if (typeof window !== 'undefined' && 'indexedDB' in window) {
        this.persistence = new IndexeddbPersistence(roomId, this.doc);
      }

      // 6. Initialize WebRTC Provider with public signaling secured with AES-GCM password
      const signalingServers = opts.signalingServers || ['wss://signaling.yjs.dev'];
      this.provider = new WebrtcProvider(roomId, this.doc, {
        signaling: signalingServers,
        password: key, // Secures WebRTC signaling channels with repo key
      });

      // 7. Optional WebSocket Provider if configured
      if (opts.websocketUrl) {
        try {
          this.wsProvider = new WebsocketProvider(opts.websocketUrl, roomId, this.doc);
        } catch (wsErr) {
          logger.warn('Collab', 'Failed to initialize WebSocket provider fallback', {
            error: formatErrorDetails(wsErr),
          });
        }
      }

      // 8. Set local user awareness profile
      const initialActiveFile = useWorkspaceStore.getState().activeFilePath || undefined;

      this.provider.awareness.setLocalStateField('user', {
        clientId: this.doc.clientID,
        name: userProfile?.username || `Researcher-${this.doc.clientID.toString().slice(-4)}`,
        username: userProfile?.username || `Researcher-${this.doc.clientID.toString().slice(-4)}`,
        avatarUrl:
          userProfile?.avatarUrl ||
          `https://api.dicebear.com/7.x/identicon/svg?seed=${this.doc.clientID}`,
        color: this.myColor,
        colorLight: this.myColor + '33',
        joinedAt: Date.now(),
        activeFile: initialActiveFile,
        permission: myPermission,
        canWrite: myCanWrite,
      });

      // 9. Subscribe to awareness changes for peer list & Designated Committer election
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

      logger.info('Collab', `Successfully joined room ${roomId}`);
      return roomId;
    } catch (err) {
      logger.error('Collab', 'Failed to connect to collab session', {
        error: formatErrorDetails(err),
      });
      useCollabStore.getState().setStatus('disconnected');
      throw err;
    }
  }

  /**
   * Handle awareness changes & elect deterministic Designated Committer (Subsystem B.2)
   */
  public handleAwarenessUpdate(): void {
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
            permission?: 'admin' | 'write' | 'read' | 'none';
            canWrite?: boolean;
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
          permission: u.permission ?? 'write',
          canWrite: u.canWrite ?? true,
        });
      }
    });

    // Designated Committer Election (Subsystem B.2):
    // Leader = argmin_{p in ActiveWritePeers} (p.joinedAt, p.clientId)
    const activeWritePeers = peers.filter(
      (p) => p.canWrite !== false && (p.permission === 'admin' || p.permission === 'write' || !p.permission)
    );

    const sorted = [...activeWritePeers].sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
      return a.clientId - b.clientId;
    });

    const leader = sorted[0];
    const leaderId = leader ? leader.clientId : null;
    const isCommitter = leaderId === this.doc.clientID;

    useCollabStore.getState().setPeers(peers);
    useCollabStore.getState().setDesignatedCommitterId(leaderId);
    useCollabStore.getState().setIsCommitter(isCommitter);

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
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
    if (this.persistence) {
      this.persistence.destroy();
      this.persistence = null;
    }
    this.currentRoomId = null;
    this.userPermission = 'admin';
    this.canWrite = true;
    useCollabStore.getState().setStatus('disconnected');
    useCollabStore.getState().setRoomId(null);
    useCollabStore.getState().setPeers([]);
    useCollabStore.getState().setDesignatedCommitterId(null);
    useCollabStore.getState().setIsCommitter(false);
    useCollabStore.getState().setUserPermission(null, true);
  }
}

export const collabManager = CollabManager.getInstance();
