export interface PeerCursor {
  line: number;
  column: number;
}

export interface PeerUser {
  clientId: number;
  username: string;
  avatarUrl: string;
  color: string;
  activeFile?: string;
  cursor?: PeerCursor;
  joinedAt: number;
  permission?: 'admin' | 'write' | 'read' | 'none';
  canWrite?: boolean;
}

export type RoomConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ConflictHunk {
  id: string;
  index: number;
  liveContent: string;
  remoteContent: string;
  baseContent?: string;
  chosen: 'live' | 'remote' | 'custom' | null;
  customContent?: string;
}

export interface ConflictState {
  filePath: string;
  baseText: string;
  crdtText: string;
  remoteText: string;
  mergedWithMarkers: string;
  hunks: ConflictHunk[];
}

export interface CollabRoomState {
  roomId: string;
  status: RoomConnectionStatus;
  peers: PeerUser[];
  designatedCommitterId?: number | null;
  isCommitter: boolean;
  userPermission?: 'admin' | 'write' | 'read' | 'none';
  canWrite: boolean;
}
