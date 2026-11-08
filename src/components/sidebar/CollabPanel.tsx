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
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useCollabStore } from '../../store/useCollabStore';
import { collabManager } from '../../services/collabManager';

export const CollabPanel: React.FC = () => {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);

  const status = useCollabStore((s) => s.status);
  const roomId = useCollabStore((s) => s.roomId);
  const peers = useCollabStore((s) => s.peers);
  const designatedCommitterId = useCollabStore((s) => s.designatedCommitterId);
  const followingPeerId = useCollabStore((s) => s.followingPeerId);
  const toggleFollowPeer = useCollabStore((s) => s.toggleFollowPeer);

  const [customRoomInput, setCustomRoomInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!workspacePath) {
      setErrorMsg('Please open a project folder first.');
      return;
    }
    setConnecting(true);
    setErrorMsg(null);
    try {
      await collabManager.connect(workspacePath, customRoomInput.trim() || undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to connect: ${msg}`);
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
      console.error('Clipboard copy error:', e);
    }
  };

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
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
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
                  className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  title="Copy Room ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between pt-1">
                <span>Relay: signaling.yjs.dev</span>
                <span>Crash cache: IndexedDB</span>
              </div>
            </div>

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
                        className={`p-1.5 rounded transition-colors ${
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
                className="w-full py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-md text-xs font-medium transition-colors flex items-center justify-center space-x-1.5"
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
