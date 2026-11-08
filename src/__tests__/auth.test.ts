import { describe, it, expect, beforeEach } from 'vitest';
import { useGitStore } from '../store/useGitStore';
import {
  startGithubDeviceFlow,
  pollGithubDeviceToken,
  getGithubAuthStatus,
  getOrCreateRoomKey,
} from '../services/tauriClient';

describe('GitHub OAuth & Device Flow Store & Client', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    useGitStore.setState({
      branch: 'main',
      isClean: true,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      userProfile: null,
      deviceModalOpen: false,
    });
  });

  it('manages modal open state and user profile in store', () => {
    const store = useGitStore.getState();
    store.setDeviceModalOpen(true);
    expect(useGitStore.getState().deviceModalOpen).toBe(true);

    store.setUserProfile({
      username: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://github.com/images/error/octocat_happy.gif',
      email: 'octocat@github.com',
    });

    const currentProfile = useGitStore.getState().userProfile;
    expect(currentProfile?.username).toBe('octocat');
    expect(currentProfile?.name).toBe('The Octocat');
  });

  it('initiates device flow in browser mock mode', async () => {
    const deviceData = await startGithubDeviceFlow();
    expect(deviceData.userCode).toBe('WDJB-MJHT');
    expect(deviceData.verificationUri).toBe('https://github.com/login/device');
    expect(deviceData.expiresIn).toBe(900);
    expect(deviceData.interval).toBe(5);
  });

  it('polls device token in browser mock mode', async () => {
    const res = await pollGithubDeviceToken(undefined, 'mock-device-code');
    expect(res.status).toBe('success');
    expect(res.accessToken).toBe('mock_gho_token');
  });

  it('checks auth status in browser mock mode', async () => {
    const status = await getGithubAuthStatus();
    expect(status.authenticated).toBe(false);
    expect(status.profile).toBeNull();
  });

  it('gets or creates 64-character room key for Yjs encrypted signaling', async () => {
    const key = await getOrCreateRoomKey('/test/project');
    expect(key).toBeDefined();
    expect(key.length).toBe(64);
  });
});
