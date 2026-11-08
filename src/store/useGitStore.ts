import { create } from 'zustand';
import type { GitFileStatus, GithubUserProfile } from '../types/git';

export interface GitState {
  branch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  userProfile: GithubUserProfile | null;
  deviceModalOpen: boolean;

  setBranch: (branch: string) => void;
  setGitStatus: (
    branch: string,
    isClean: boolean,
    ahead: number,
    behind: number,
    staged: GitFileStatus[],
    unstaged: GitFileStatus[]
  ) => void;
  setUserProfile: (profile: GithubUserProfile | null) => void;
  setDeviceModalOpen: (open: boolean) => void;
}

export const useGitStore = create<GitState>((set) => ({
  branch: 'main',
  isClean: true,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  userProfile: null,
  deviceModalOpen: false,

  setBranch: (branch) => set({ branch }),
  setGitStatus: (branch, isClean, ahead, behind, staged, unstaged) =>
    set({ branch, isClean, ahead, behind, staged, unstaged }),
  setUserProfile: (userProfile) => set({ userProfile }),
  setDeviceModalOpen: (deviceModalOpen) => set({ deviceModalOpen }),
}));
