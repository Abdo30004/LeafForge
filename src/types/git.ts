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

export interface CollaboratorPermission {
  permission: 'admin' | 'write' | 'read' | 'none';
  canWrite: boolean;
  canRead: boolean;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  profile?: GithubUserProfile | null;
}

export interface PollTokenResponse {
  status: 'success' | 'pending' | 'slow_down' | 'expired' | 'denied' | 'error';
  accessToken?: string;
  error?: string;
  errorDescription?: string;
  interval?: number;
}
