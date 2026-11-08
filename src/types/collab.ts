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
}

export type RoomConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface CollabRoomState {
  roomId: string;
  status: RoomConnectionStatus;
  peers: PeerUser[];
  designatedCommitterId?: number;
  isCommitter: boolean;
}
