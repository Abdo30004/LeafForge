import { create } from 'zustand';
import type { GitFileStatus, GithubUserProfile, GitCommitInfo } from '../types/git';

export interface GitState {
  isRepo: boolean;
  branch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  remoteUrl: string | null;
  commits: GitCommitInfo[];
  userProfile: GithubUserProfile | null;
  deviceModalOpen: boolean;
  connectModalOpen: boolean;

  setIsRepo: (isRepo: boolean) => void;
  setBranch: (branch: string) => void;
  setRemoteUrl: (remoteUrl: string | null) => void;
  setCommits: (commits: GitCommitInfo[]) => void;
  setGitStatus: (
    branch: string,
    isClean: boolean,
    ahead: number,
    behind: number,
    staged: GitFileStatus[],
    unstaged: GitFileStatus[],
    isRepo?: boolean
  ) => void;
  setUserProfile: (profile: GithubUserProfile | null) => void;
  setDeviceModalOpen: (open: boolean) => void;
  setConnectModalOpen: (open: boolean) => void;
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
  isRepo: false,
  branch: 'main',
  isClean: true,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  remoteUrl: null,
  commits: [],
  userProfile: loadSavedProfile(),
  deviceModalOpen: false,
  connectModalOpen: false,

  setIsRepo: (isRepo) => set({ isRepo }),
  setBranch: (branch) => set({ branch }),
  setRemoteUrl: (remoteUrl) => set({ remoteUrl }),
  setCommits: (commits) => set({ commits }),
  setGitStatus: (branch, isClean, ahead, behind, staged, unstaged, isRepo) =>
    set((state) => ({
      branch,
      isClean,
      ahead,
      behind,
      staged,
      unstaged,
      isRepo: isRepo !== undefined ? isRepo : state.isRepo,
    })),
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
  setConnectModalOpen: (connectModalOpen) => set({ connectModalOpen }),
}));
