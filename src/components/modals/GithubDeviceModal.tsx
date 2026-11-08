import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useGitStore } from '../../store/useGitStore';
import {
  startGithubDeviceFlow,
  pollGithubDeviceToken,
  getGithubUserProfile,
  logoutGithub,
  isTauriEnvironment,
} from '../../services/tauriClient';
import type { GithubDeviceCode } from '../../types/git';
import { formatErrorMessage, formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

export const GithubDeviceModal: React.FC = () => {
  const isOpen = useGitStore((s) => s.deviceModalOpen);
  const setOpen = useGitStore((s) => s.setDeviceModalOpen);
  const userProfile = useGitStore((s) => s.userProfile);
  const setUserProfile = useGitStore((s) => s.setUserProfile);

  const [loading, setLoading] = useState(false);
  const [deviceData, setDeviceData] = useState<GithubDeviceCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('Initializing...');
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  const handleStartFlow = useCallback(async () => {
    clearTimers();
    setLoading(true);
    setErrorMsg(null);
    setStatusText('Requesting authorization code from GitHub...');

    try {
      const res = await startGithubDeviceFlow();
      setDeviceData(res);
      setTimeLeft(res.expiresIn || 900);
      setLoading(false);
      setStatusText('Waiting for approval in browser...');

      // Start countdown timer
      countdownTimerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearTimers();
            setErrorMsg('Authorization code expired. Please generate a new code.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Start polling
      isPollingRef.current = true;
      let currentInterval = (res.interval || 5) * 1000;

      const schedulePoll = () => {
        if (!isPollingRef.current) return;
        pollTimerRef.current = setTimeout(async () => {
          if (!isPollingRef.current) return;
          try {
            const pollRes = await pollGithubDeviceToken(undefined, res.deviceCode);
            if (pollRes.status === 'success') {
              isPollingRef.current = false;
              clearTimers();
              setStatusText('Authentication successful! Loading profile...');
              const profile = await getGithubUserProfile();
              setUserProfile(profile);
              setTimeout(() => {
                setOpen(false);
              }, 1200);
            } else if (pollRes.status === 'slow_down') {
              currentInterval += 5000;
              schedulePoll();
            } else if (pollRes.status === 'expired') {
              isPollingRef.current = false;
              clearTimers();
              setErrorMsg('Code expired. Please request a new code.');
            } else if (pollRes.status === 'denied') {
              isPollingRef.current = false;
              clearTimers();
              setErrorMsg('Access was denied on GitHub.');
            } else {
              // still pending
              schedulePoll();
            }
          } catch (err: unknown) {
            logger.warn('Auth', `Polling warning: ${formatErrorMessage(err)}`, formatErrorDetails(err));
            schedulePoll();
          }
        }, currentInterval);
      };

      schedulePoll();
    } catch (err: unknown) {
      setLoading(false);
      const msg = formatErrorMessage(err);
      const details = formatErrorDetails(err);
      logger.error('Auth', `Failed to initiate device flow: ${msg}`, details);
      setErrorMsg(`Failed to initiate device flow: ${msg}`);
      clearTimers();
    }
  }, [clearTimers, setOpen, setUserProfile]);

  useEffect(() => {
    if (isOpen) {
      if (!userProfile) {
        handleStartFlow();
      }
    } else {
      clearTimers();
      setDeviceData(null);
      setErrorMsg(null);
    }
    return () => {
      clearTimers();
    };
  }, [isOpen, userProfile, handleStartFlow, clearTimers]);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    if (!deviceData?.userCode) return;
    try {
      await navigator.clipboard.writeText(deviceData.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      logger.warn('Auth', `Clipboard copy failed: ${formatErrorMessage(e)}`);
    }
  };

  const handleCopyAndOpen = async () => {
    if (!deviceData) return;
    await handleCopyCode();
    try {
      if (isTauriEnvironment()) {
        await openUrl(deviceData.verificationUri);
      } else {
        window.open(deviceData.verificationUri, '_blank');
      }
    } catch (e) {
      logger.warn('Auth', `Failed to open URL natively: ${formatErrorMessage(e)}`);
      window.open(deviceData.verificationUri, '_blank');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutGithub();
      setUserProfile(null);
      handleStartFlow();
    } catch (e) {
      logger.error('Auth', `Logout failed: ${formatErrorMessage(e)}`, formatErrorDetails(e));
    }
  };

  const formatMinutesSeconds = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--canvas)]/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#24292e] text-white flex items-center justify-center shadow-xs">
              <GithubIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">GitHub Authentication</h3>
              <p className="text-[11px] text-[var(--text-muted)]">OAuth 2.0 Device Flow & OS Keychain</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* If already authenticated */}
          {userProfile ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-3.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)]">
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.username}
                  className="w-12 h-12 rounded-full border border-accent-primary/40"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {userProfile.name || userProfile.username}
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                  <p className="text-xs text-accent-primary font-mono truncate">@{userProfile.username}</p>
                  {userProfile.email && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{userProfile.email}</p>
                  )}
                </div>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-xs text-emerald-400 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Token securely stored in OS Keychain via keyring. Ready for Git and Live Collaboration.</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center space-x-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect Account</span>
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-1.5 bg-accent-primary text-black font-medium rounded text-xs hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Authentication in progress */
            <div className="space-y-4">
              {loading ? (
                <div className="py-10 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                  <p className="text-xs text-[var(--text-muted)]">{statusText}</p>
                </div>
              ) : errorMsg ? (
                <div className="space-y-3">
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-md text-xs text-rose-400 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                  <button
                    onClick={handleStartFlow}
                    className="w-full py-2 bg-accent-primary text-black font-semibold rounded text-xs hover:opacity-90 transition-opacity"
                  >
                    Try Again
                  </button>
                </div>
              ) : deviceData ? (
                <div className="space-y-4">
                  <div className="text-center space-y-1">
                    <p className="text-xs text-[var(--text-muted)]">Enter this code at GitHub to authorize LeafForge:</p>
                    <div className="py-3 px-4 bg-[var(--canvas)] rounded-lg border border-[var(--border-subtle)] flex items-center justify-center space-x-3">
                      <span className="font-mono text-2xl font-bold tracking-widest text-accent-primary select-all">
                        {deviceData.userCode}
                      </span>
                      <button
                        onClick={handleCopyCode}
                        className="p-1.5 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title="Copy code"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleCopyAndOpen}
                    className="w-full py-2.5 px-4 bg-accent-primary text-black font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity flex items-center justify-center space-x-2 shadow-md cursor-pointer"
                  >
                    <span>Copy Code & Open GitHub</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Loader2 className="w-3 h-3 text-accent-primary animate-spin" />
                        <span>{statusText}</span>
                      </span>
                      <span className="font-mono text-accent-primary">
                        {formatMinutesSeconds(timeLeft)}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] text-center">
                      LeafForge will automatically detect authorization and save your token in the OS Keychain.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
