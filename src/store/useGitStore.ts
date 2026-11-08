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

const SAVED_PROFILE_KEY = 'leafforge:github-user-profile';

const loadSavedProfile = (): GithubUserProfile | null => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_PROFILE_KEY);
    return saved ? (JSON.parse(saved) as GithubUserProfile) : null;
  } catch {
    return null;
  }
};

export const useGitStore = create<GitState>((set) => ({
  branch: 'main',
  isClean: true,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  userProfile: loadSavedProfile(),
  deviceModalOpen: false,

  setBranch: (branch) => set({ branch }),
  setGitStatus: (branch, isClean, ahead, behind, staged, unstaged) =>
    set({ branch, isClean, ahead, behind, staged, unstaged }),
  setUserProfile: (userProfile) => {
    try {
      if (typeof window !== 'undefined') {
        if (userProfile) {
          localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(userProfile));
        } else {
          localStorage.removeItem(SAVED_PROFILE_KEY);
        }
      }
    } catch {
      // ignore storage errors
    }
    set({ userProfile });
  },
  setDeviceModalOpen: (deviceModalOpen) => set({ deviceModalOpen }),
}));
