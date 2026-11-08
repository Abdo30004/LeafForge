import { create } from 'zustand';
import type { PeerUser, RoomConnectionStatus } from '../types/collab';

export interface CollabState {
  status: RoomConnectionStatus;
  roomId: string | null;
  peers: PeerUser[];
  designatedCommitterId: number | null;
  followingPeerId: number | null;

  setStatus: (status: RoomConnectionStatus) => void;
  setRoomId: (roomId: string | null) => void;
  setPeers: (peers: PeerUser[]) => void;
  setDesignatedCommitterId: (id: number | null) => void;
  setFollowingPeerId: (id: number | null) => void;
  toggleFollowPeer: (id: number) => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  status: 'disconnected',
  roomId: null,
  peers: [],
  designatedCommitterId: null,
  followingPeerId: null,

  setStatus: (status) => set({ status }),
  setRoomId: (roomId) => set({ roomId }),
  setPeers: (peers) => set({ peers }),
  setDesignatedCommitterId: (id) => set({ designatedCommitterId: id }),
  setFollowingPeerId: (id) => set({ followingPeerId: id }),
  toggleFollowPeer: (id) =>
    set((state) => ({
      followingPeerId: state.followingPeerId === id ? null : id,
    })),
}));
