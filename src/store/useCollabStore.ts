import { create } from 'zustand';
import type { PeerUser, RoomConnectionStatus, ConflictState } from '../types/collab';

export interface CollabState {
  status: RoomConnectionStatus;
  roomId: string | null;
  peers: PeerUser[];
  designatedCommitterId: number | null;
  followingPeerId: number | null;
  userPermission: 'admin' | 'write' | 'read' | 'none' | null;
  canWrite: boolean;
  isCommitter: boolean;
  activeConflict: ConflictState | null;

  setStatus: (status: RoomConnectionStatus) => void;
  setRoomId: (roomId: string | null) => void;
  setPeers: (peers: PeerUser[]) => void;
  setDesignatedCommitterId: (id: number | null) => void;
  setFollowingPeerId: (id: number | null) => void;
  toggleFollowPeer: (id: number) => void;
  setUserPermission: (permission: 'admin' | 'write' | 'read' | 'none' | null, canWrite: boolean) => void;
  setIsCommitter: (isCommitter: boolean) => void;
  setActiveConflict: (conflict: ConflictState | null) => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  status: 'disconnected',
  roomId: null,
  peers: [],
  designatedCommitterId: null,
  followingPeerId: null,
  userPermission: null,
  canWrite: true,
  isCommitter: false,
  activeConflict: null,

  setStatus: (status) => set({ status }),
  setRoomId: (roomId) => set({ roomId }),
  setPeers: (peers) => set({ peers }),
  setDesignatedCommitterId: (id) => set({ designatedCommitterId: id }),
  setFollowingPeerId: (id) => set({ followingPeerId: id }),
  toggleFollowPeer: (id) =>
    set((state) => ({
      followingPeerId: state.followingPeerId === id ? null : id,
    })),
  setUserPermission: (userPermission, canWrite) => set({ userPermission, canWrite }),
  setIsCommitter: (isCommitter) => set({ isCommitter }),
  setActiveConflict: (activeConflict) => set({ activeConflict }),
}));
