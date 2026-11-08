import React, { useState } from 'react';
import {
  Users,
  Wifi,
  ShieldCheck,
  Crown,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  Lock,
  Globe,
  LogOut,
  Radio,
  GitMerge,
  UploadCloud,
  CheckCircle2,
  Share2,
  KeyRound,
  LogIn,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useCollabStore } from '../../store/useCollabStore';
import {
  collabManager,
  createInviteToken,
  parseInviteToken,
  deriveKeyFromPassphrase,
} from '../../services/collabManager';
import { gitCrdtBridge } from '../../services/gitCrdtBridge';
import { readFileText } from '../../services/tauriClient';
import { formatErrorMessage, formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';
import type { RoomConnectionStatus, PeerUser } from '../../types/collab';

export interface CollabPanelProps {
  statusOverride?: RoomConnectionStatus;
  roomIdOverride?: string;
  peersOverride?: PeerUser[];
  isCommitterOverride?: boolean;
}

export const CollabPanel: React.FC<CollabPanelProps> = ({
  statusOverride,
  roomIdOverride,
  peersOverride,
  isCommitterOverride,
}) => {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);

  const storeStatus = useCollabStore((s) => s.status);
  const storeRoomId = useCollabStore((s) => s.roomId);
  const storePeers = useCollabStore((s) => s.peers);
  const storeIsCommitter = useCollabStore((s) => s.isCommitter);

  const status = statusOverride ?? storeStatus;
  const roomId = roomIdOverride ?? storeRoomId;
  const peers = peersOverride ?? storePeers;
  const isCommitter = isCommitterOverride ?? storeIsCommitter;

  const designatedCommitterId = useCollabStore((s) => s.designatedCommitterId);
  const followingPeerId = useCollabStore((s) => s.followingPeerId);
  const userPermission = useCollabStore((s) => s.userPermission);
  const canWrite = useCollabStore((s) => s.canWrite);
  const toggleFollowPeer = useCollabStore((s) => s.toggleFollowPeer);

  const [customRoomInput, setCustomRoomInput] = useState('');
  const [collabMode, setCollabMode] = useState<'host' | 'join'>('host');
  const [inviteTokenInput, setInviteTokenInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileSuccess, setReconcileSuccess] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);

  const handleConnect = async () => {
    if (!workspacePath) {
      setErrorMsg('Please open a project folder first.');
      return;
    }
    setConnecting(true);
    setErrorMsg(null);
    try {
      if (collabMode === 'join') {
        const rawToken = inviteTokenInput.trim();
        if (rawToken) {
          const parsed = parseInviteToken(rawToken);
          if (!parsed && !rawToken.startsWith('LFCOLLAB:')) {
            throw new Error('Invalid invite token format. Please paste a valid token starting with LFCOLLAB:');
          }
          await collabManager.connect(workspacePath, rawToken);
        } else if (customRoomInput.trim()) {
          const customKey = passphraseInput.trim()
            ? await deriveKeyFromPassphrase(passphraseInput)
            : undefined;
          await collabManager.connect(workspacePath, {
            customRoomId: customRoomInput.trim(),
            customKey,
          });
        } else {
          throw new Error('Please paste an invite token or enter a Room ID.');
        }
      } else {
        const customKey = passphraseInput.trim()
          ? await deriveKeyFromPassphrase(passphraseInput)
          : undefined;
        await collabManager.connect(workspacePath, {
          customRoomId: customRoomInput.trim() || undefined,
          customKey,
        });
      }
    } catch (err: unknown) {
      const msg = formatErrorMessage(err, 'Failed to connect to session');
      logger.error('Collab', 'Failed to connect to collaboration session', {
        error: formatErrorDetails(err),
        workspacePath,
        room: customRoomInput.trim() || undefined,
      });
      setErrorMsg(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    collabManager.disconnect();
  };

  const handleCopyRoomId = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      logger.warn('Collab', 'Clipboard copy error', { error: formatErrorDetails(e) });
    }
  };

  const handleCopyInviteToken = async () => {
    if (!roomId) return;
    const key = collabManager.getRoomKey();
    if (!key) return;
    const folderName = workspacePath
      ? workspacePath.replace(/\\/g, '/').split('/').pop()
      : undefined;
    const token = createInviteToken(roomId, key, folderName);
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    } catch (e) {
      logger.warn('Collab', 'Clipboard copy error for invite token', {
        error: formatErrorDetails(e),
      });
    }
  };

  const handleReconcileWithGit = async () => {
    if (!activeFilePath) {
      setErrorMsg('Open a file first to reconcile.');
      return;
    }
    setReconciling(true);
    setReconcileSuccess(null);
    setErrorMsg(null);
    try {
      // Read current disk/remote content
      const diskContent = await readFileText(activeFilePath);
      const outcome = await gitCrdtBridge.reconcileFile(
        activeFilePath,
        diskContent,
        workspacePath ?? undefined
      );

      if (outcome.status === 'clean' || outcome.status === 'up-to-date') {
        setReconcileSuccess('Session cleanly synchronized with Git!');
        setTimeout(() => setReconcileSuccess(null), 3000);
      }
    } catch (err: unknown) {
      const msg = formatErrorMessage(err, 'Reconciliation failed');
      logger.error('Collab', 'Git-CRDT reconciliation failed', {
        error: formatErrorDetails(err),
        filePath: activeFilePath,
      });
      setErrorMsg(msg);
    } finally {
      setReconciling(false);
    }
  };

  const handleDesignatedCommitterPush = async () => {
    if (!workspacePath) return;
    setPushing(true);
    setErrorMsg(null);
    try {
      await gitCrdtBridge.designatedCommitterPush(
        workspacePath,
        `chore(collab): sync live collaborative session changes`
      );
      setReconcileSuccess('Committed and pushed to GitHub as Designated Committer!');
      setTimeout(() => setReconcileSuccess(null), 3000);
    } catch (err: unknown) {
      const msg = formatErrorMessage(err, 'Push failed');
      logger.error('Collab', 'Designated committer push failed', {
        error: formatErrorDetails(err),
        workspacePath,
      });
      setErrorMsg(msg);
    } finally {
      setPushing(false);
    }
  };

  const followedPeer = peers.find((p) => p.clientId === followingPeerId);

  return (
    <div className="flex flex-col h-full overflow-hidden select-none text-[13px]">
      {/* Panel Header */}
      <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center space-x-1.5 font-bold uppercase text-[11px] tracking-wider text-[var(--text-muted)]">
          <Users className="w-3.5 h-3.5 text-accent-primary" />
          <span>Collaboration</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              status === 'connected'
                ? 'bg-emerald-400 animate-pulse'
                : status === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-zinc-500'
            }`}
          />
          <span className="text-[11px] font-medium capitalize text-[var(--text-muted)]">
            {status}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* If Not Connected */}
        {status === 'disconnected' && (
          <div className="space-y-4">
            <div className="bg-[var(--canvas)] p-3.5 rounded-lg border border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center space-x-2 text-accent-primary">
                <Radio className="w-4 h-4" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Real-Time CRDT Session
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Connect with collaborators via encrypted P2P/WebRTC signaling. Changes are synchronized conflict-free with Yjs.
              </p>

              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5 text-[11px] text-[var(--text-muted)]">
                <div className="flex items-center space-x-1.5 text-emerald-400">
                  <Lock className="w-3 h-3" />
                  <span>Secured by repo key in .texflow/room.key</span>
                </div>
                <div className="flex items-center space-x-1.5 text-sky-400">
                  <Globe className="w-3 h-3" />
                  <span>Signaling: wss://signaling.yjs.dev</span>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-0.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCollabMode('host')}
                className={`py-1.5 rounded-md flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  collabMode === 'host'
                    ? 'bg-accent-primary text-black shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Radio className="w-3 h-3" />
                <span>Host Session</span>
              </button>
              <button
                type="button"
                onClick={() => setCollabMode('join')}
                className={`py-1.5 rounded-md flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  collabMode === 'join'
                    ? 'bg-accent-primary text-black shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LogIn className="w-3 h-3" />
                <span>Join Session</span>
              </button>
            </div>

            {collabMode === 'host' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-primary)]">
                    Room Name / ID <span className="text-[11px] text-[var(--text-muted)]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={customRoomInput}
                    onChange={(e) => setCustomRoomInput(e.target.value)}
                    placeholder="Auto-generated from project"
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-primary)] flex items-center space-x-1">
                    <KeyRound className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>Room Passphrase</span>
                    <span className="text-[11px] text-[var(--text-muted)] font-normal">(Optional for public repos)</span>
                  </label>
                  <input
                    type="password"
                    value={passphraseInput}
                    onChange={(e) => setPassphraseInput(e.target.value)}
                    placeholder="Leave empty to use .texflow/room.key"
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600 font-mono"
                  />
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || !workspacePath}
                  className="w-full py-2 bg-accent-primary text-black font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity flex items-center justify-center space-x-1.5 disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5" />
                      <span>Start Live Session</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-primary)] flex items-center space-x-1">
                    <Share2 className="w-3 h-3 text-emerald-400" />
                    <span>Invite Token or Link</span>
                  </label>
                  <textarea
                    rows={2}
                    value={inviteTokenInput}
                    onChange={(e) => setInviteTokenInput(e.target.value)}
                    placeholder="Paste LFCOLLAB:... token received from co-author"
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600 resize-none"
                  />
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="grow border-t border-[var(--border-subtle)]"></div>
                  <span className="shrink mx-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">or manual</span>
                  <div className="grow border-t border-[var(--border-subtle)]"></div>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={customRoomInput}
                    onChange={(e) => setCustomRoomInput(e.target.value)}
                    placeholder="Room ID"
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600"
                  />
                  <input
                    type="password"
                    value={passphraseInput}
                    onChange={(e) => setPassphraseInput(e.target.value)}
                    placeholder="Shared Passphrase"
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600"
                  />
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || !workspacePath}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Joining...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Join Live Session</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* If Connected */}
        {status === 'connected' && (
          <div className="space-y-4">
            {/* Room Info Card */}
            <div className="bg-[var(--canvas)] p-3 rounded-lg border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Active Room
                </span>
                <span className="flex items-center space-x-1 text-[10px] text-emerald-400 font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  <span>E2E Encrypted</span>
                </span>
              </div>

              <div className="flex items-center justify-between p-1.5 bg-[var(--surface-elevated)] rounded border border-[var(--border-subtle)] text-xs font-mono">
                <span className="truncate max-w-[180px] text-accent-primary font-medium" title={roomId || ''}>
                  {roomId}
                </span>
                <button
                  onClick={handleCopyRoomId}
                  className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Copy Room ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between pt-1">
                <span>Relay: signaling.yjs.dev</span>
                <span className="capitalize">
                  Role: <strong className="text-[var(--text-primary)]">{userPermission ?? 'write'}</strong>
                  {!canWrite && <span className="text-amber-400 ml-1">(Read-Only)</span>}
                </span>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                <button
                  type="button"
                  onClick={handleCopyInviteToken}
                  className="w-full py-1.5 px-2.5 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                  title="Copy shareable invite token for co-authors (public repos safe)"
                >
                  {copiedToken ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Invite Token Copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copy Invite Token (Public Repos)</span>
                    </>
                  )}
                </button>
                <p className="text-[10px] text-[var(--text-muted)] text-center leading-tight">
                  Share with co-authors to connect without committing keys to Git.
                </p>
              </div>
            </div>

            {/* Designated Committer Banner */}
            {isCommitter ? (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                <div className="flex items-center space-x-1.5 text-amber-400 font-semibold">
                  <Crown className="w-3.5 h-3.5 fill-current" />
                  <span>You are Designated Committer</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  You are the elected leader for Git pushes. Your client coordinates version control to avoid collisions.
                </p>
                <button
                  onClick={handleDesignatedCommitterPush}
                  disabled={pushing}
                  className="w-full mt-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded text-[11px] transition-colors flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {pushing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Pushing to GitHub...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3 h-3" />
                      <span>Push Live Changes to GitHub</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              designatedCommitterId && (
                <div className="p-2 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-[11px] flex items-center space-x-1.5 text-[var(--text-muted)]">
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    Committer leader:{' '}
                    <strong className="text-[var(--text-primary)]">
                      {peers.find((p) => p.clientId === designatedCommitterId)?.username ||
                        `Client #${designatedCommitterId}`}
                    </strong>
                  </span>
                </div>
              )
            )}

            {/* Following Peer Banner */}
            {followedPeer && (
              <div className="p-2 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-accent-primary truncate">
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Following @{followedPeer.username}</span>
                </div>
                <button
                  onClick={() => toggleFollowPeer(followedPeer.clientId)}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium cursor-pointer"
                >
                  Unfollow
                </button>
              </div>
            )}

            {/* Reconcile Status Notifications */}
            {reconcileSuccess && (
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{reconcileSuccess}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* 3-Way Reconcile Button */}
            <button
              onClick={handleReconcileWithGit}
              disabled={reconciling || !activeFilePath}
              className="w-full py-1.5 rounded-lg bg-[var(--canvas)] hover:bg-[var(--hover-bg)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] transition-colors flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40"
              title="Reconcile live CRDT document with Git disk / remote commits"
            >
              {reconciling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-primary" />
                  <span>Reconciling...</span>
                </>
              ) : (
                <>
                  <GitMerge className="w-3.5 h-3.5 text-accent-primary" />
                  <span>Reconcile with Git (3-Way)</span>
                </>
              )}
            </button>

            {/* Active Peers List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <span>Active Collaborators ({peers.length})</span>
              </div>

              <div className="space-y-1.5">
                {peers.map((peer) => {
                  const isLeader = peer.clientId === designatedCommitterId;
                  const isFollowing = peer.clientId === followingPeerId;

                  return (
                    <div
                      key={peer.clientId}
                      className="p-2 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] flex items-center justify-between space-x-2"
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <div
                          className="w-7 h-7 rounded-full p-0.5 shrink-0"
                          style={{ border: `2px solid ${peer.color}` }}
                        >
                          <img
                            src={peer.avatarUrl}
                            alt={peer.username}
                            className="w-full h-full rounded-full"
                          />
                        </div>
                        <div className="truncate">
                          <div className="flex items-center space-x-1">
                            <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                              {peer.username}
                            </span>
                            {isLeader && (
                              <span
                                className="text-[10px] text-amber-400"
                                title="Designated Committer (Elected Leader for Git pushes)"
                              >
                                <Crown className="w-3 h-3 fill-current" />
                              </span>
                            )}
                            {peer.canWrite === false && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                                Read
                              </span>
                            )}
                          </div>
                          {peer.activeFile && (
                            <p className="text-[10px] text-[var(--text-muted)] truncate font-mono">
                              {peer.activeFile.split(/[\\/]/).pop()}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Follow peer button */}
                      <button
                        onClick={() => toggleFollowPeer(peer.clientId)}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          isFollowing
                            ? 'bg-accent-primary text-black'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
                        }`}
                        title={isFollowing ? 'Stop following' : 'Follow peer cursor & file'}
                      >
                        {isFollowing ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Disconnect Button */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={handleDisconnect}
                className="w-full py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-md text-xs font-medium transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Session</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
