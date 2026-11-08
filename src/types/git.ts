export interface GitFileStatus {
  path: string;
  staged: boolean;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
}

export interface GitRepoStatus {
  branch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
}

export interface GithubDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface GithubUserProfile {
  username: string;
  name?: string;
  avatarUrl: string;
  email?: string;
}
