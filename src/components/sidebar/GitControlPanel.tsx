import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  Check,
  ArrowUp,
  ArrowDown,
  FileDiff,
  Loader2,
  GitFork,
  X,
  PlusCircle,
  AlertCircle,
  FolderGit2,
  ExternalLink,
  Unlink,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useGitStore } from '../../store/useGitStore';
import { formatErrorMessage, formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';
import { dialog } from '../../services/dialog';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);
import {
  gitStatus,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitCommit,
  gitPush,
  gitPull,
  gitDiff,
  gitListBranches,
  gitCheckoutBranch,
  gitIsRepo,
  gitInit,
  gitSetRemote,
  gitGetRemoteUrl,
  gitRemoveRemote,
  gitLog,
  parseGithubOwnerRepo,
  getProjectSettings,
  saveProjectSettings,
} from '../../services/tauriClient';
import { CloneRepoModal } from '../modals/CloneRepoModal';
import type { GitFileStatus } from '../../types/git';

export const GitControlPanel: React.FC = () => {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);

  const branch = useGitStore((s) => s.branch);
  const ahead = useGitStore((s) => s.ahead);
  const behind = useGitStore((s) => s.behind);
  const staged = useGitStore((s) => s.staged);
  const unstaged = useGitStore((s) => s.unstaged);
  const isRepo = useGitStore((s) => s.isRepo);
  const setIsRepo = useGitStore((s) => s.setIsRepo);
  const remoteUrl = useGitStore((s) => s.remoteUrl);
  const setRemoteUrl = useGitStore((s) => s.setRemoteUrl);
  const commits = useGitStore((s) => s.commits);
  const setCommits = useGitStore((s) => s.setCommits);
  const setConnectModalOpen = useGitStore((s) => s.setConnectModalOpen);
  const userProfile = useGitStore((s) => s.userProfile);
  const setGitStatus = useGitStore((s) => s.setGitStatus);

  const [commitMessage, setCommitMessage] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'success' | 'info';
    message: string;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [newBranchInput, setNewBranchInput] = useState('');
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Diff inspection state
  const [inspectDiff, setInspectDiff] = useState<{
    filePath: string;
    staged: boolean;
    content: string;
  } | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!workspacePath) return;
    setLoadingStatus(true);
    try {
      const isR = await gitIsRepo(workspacePath);
      setIsRepo(isR);
      if (!isR) {
        setRemoteUrl(null);
        setCommits([]);
        setLoadingStatus(false);
        return;
      }
      const res = await gitStatus(workspacePath);
      setGitStatus(
        res.branch,
        res.isClean,
        res.ahead,
        res.behind,
        res.staged,
        res.unstaged,
        res.isRepo ?? true
      );
      const bList = await gitListBranches(workspacePath);
      setBranches(bList);

      // Check remote URL
      let rUrl = await gitGetRemoteUrl(workspacePath, 'origin');
      if (!rUrl) {
        // Check if project settings had a remote saved
        const pSettings = await getProjectSettings(workspacePath).catch(() => null);
        if (pSettings?.gitRemote) {
          await gitSetRemote(workspacePath, pSettings.gitRemote, 'origin').catch(() => {});
          rUrl = pSettings.gitRemote;
        }
      } else {
        saveProjectSettings(workspacePath, { gitRemote: rUrl, gitBranch: res.branch }).catch(() => {});
      }
      setRemoteUrl(rUrl);

      // Load commit log
      const log = await gitLog(workspacePath, 25);
      setCommits(log);
    } catch (err) {
      logger.warn('Git', 'Failed to refresh git status', { error: formatErrorDetails(err) });
    } finally {
      setLoadingStatus(false);
    }
  }, [workspacePath, setGitStatus, setIsRepo, setRemoteUrl, setCommits]);

  const handleInitRepo = async () => {
    if (!workspacePath) return;
    setLoadingInit(true);
    setErrorMsg(null);
    try {
      await gitInit(workspacePath);
      setIsRepo(true);
      logger.info('Git', `Successfully initialized Git repository in: ${workspacePath}`);
      await refreshStatus();
    } catch (err) {
      const msg = formatErrorMessage(err, 'Failed to initialize Git repository');
      logger.error('Git', 'Git initialization failed', { error: formatErrorDetails(err) });
      setErrorMsg(msg);
    } finally {
      setLoadingInit(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleStageFile = async (path: string) => {
    if (!workspacePath) return;
    setErrorMsg(null);
    try {
      await gitStage(workspacePath, path);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, `Failed to stage file: ${path}`);
      logger.error('Git', `Failed to stage file: ${path}`, { error: formatErrorDetails(e), path });
      setErrorMsg(msg);
    }
  };

  const handleUnstageFile = async (path: string) => {
    if (!workspacePath) return;
    setErrorMsg(null);
    try {
      await gitUnstage(workspacePath, path);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, `Failed to unstage file: ${path}`);
      logger.error('Git', `Failed to unstage file: ${path}`, { error: formatErrorDetails(e), path });
      setErrorMsg(msg);
    }
  };

  const handleStageAll = async () => {
    if (!workspacePath) return;
    setErrorMsg(null);
    try {
      await gitStageAll(workspacePath);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Failed to stage all files');
      logger.error('Git', 'Failed to stage all files', { error: formatErrorDetails(e) });
      setErrorMsg(msg);
    }
  };

  const handleUnstageAll = async () => {
    if (!workspacePath) return;
    setErrorMsg(null);
    try {
      await gitUnstageAll(workspacePath);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Failed to unstage all files');
      logger.error('Git', 'Failed to unstage all files', { error: formatErrorDetails(e) });
      setErrorMsg(msg);
    }
  };

  const handleCommit = async () => {
    if (!workspacePath || !commitMessage.trim() || staged.length === 0) return;
    setLoadingCommit(true);
    setErrorMsg(null);
    try {
      await gitCommit(
        workspacePath,
        commitMessage.trim(),
        userProfile?.name || userProfile?.username || undefined,
        userProfile?.email || undefined
      );
      setCommitMessage('');
      logger.info('Git', `Committed changes with message: "${commitMessage.trim()}"`);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Git commit failed');
      logger.error('Git', 'Git commit failed', {
        error: formatErrorDetails(e),
        commitMessage: commitMessage.trim(),
      });
      setErrorMsg(msg);
    } finally {
      setLoadingCommit(false);
    }
  };

  const handlePush = async () => {
    if (!workspacePath) return;
    setIsPushing(true);
    setErrorMsg(null);
    setSyncFeedback(null);
    try {
      await gitPush(workspacePath);
      logger.info('Git', `Successfully pushed branch ${branch} to origin`);
      setSyncFeedback({
        type: 'success',
        message: `Pushed local commits to origin/${branch} successfully!`,
      });
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Git push failed');
      logger.error('Git', 'Git push failed', { error: formatErrorDetails(e), branch });
      setErrorMsg(msg);
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async () => {
    if (!workspacePath) return;
    setIsPulling(true);
    setErrorMsg(null);
    setSyncFeedback(null);
    try {
      const res = await gitPull(workspacePath);
      logger.info('Git', `Successfully pulled incoming changes on branch ${branch}: ${res.message}`);
      if (res.upToDate) {
        setSyncFeedback({
          type: 'info',
          message: 'Branch is already up to date with remote.',
        });
      } else {
        setSyncFeedback({
          type: 'success',
          message: res.message || 'Pulled latest changes from remote.',
        });
      }
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Git pull failed');
      logger.error('Git', 'Git pull failed', { error: formatErrorDetails(e), branch });
      setErrorMsg(msg);
    } finally {
      setIsPulling(false);
    }
  };

  const handleDisconnect = async () => {
    if (!workspacePath) return;
    const ok = await dialog.confirm({
      title: 'Disconnect from GitHub',
      message:
        'Are you sure you want to disconnect this workspace from GitHub? Remote origin will be removed; local commits will remain safe.',
      confirmLabel: 'Disconnect',
      isDestructive: true,
    });
    if (!ok) return;

    setDisconnecting(true);
    setErrorMsg(null);
    try {
      await gitRemoveRemote(workspacePath, 'origin');
      setRemoteUrl(null);
      saveProjectSettings(workspacePath, { gitRemote: null }).catch(() => {});
      logger.info('Git', 'Disconnected workspace from GitHub remote');
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Failed to disconnect from GitHub');
      logger.error('Git', 'Failed to disconnect repository', { error: formatErrorDetails(e) });
      setErrorMsg(msg);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCheckout = async (targetBranch: string, create = false) => {
    if (!workspacePath) return;
    setErrorMsg(null);
    try {
      await gitCheckoutBranch(workspacePath, targetBranch, create);
      setShowBranchMenu(false);
      setNewBranchInput('');
      logger.info('Git', `Checked out branch: ${targetBranch} (created: ${create})`);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, `Checkout failed for branch: ${targetBranch}`);
      logger.error('Git', 'Checkout branch failed', {
        error: formatErrorDetails(e),
        targetBranch,
        create,
      });
      setErrorMsg(msg);
    }
  };

  const handleOpenDiff = async (filePath: string, isStaged: boolean) => {
    if (!workspacePath) return;
    try {
      const diffContent = await gitDiff(workspacePath, filePath, isStaged);
      setInspectDiff({ filePath, staged: isStaged, content: diffContent });
    } catch (e) {
      const msg = formatErrorMessage(e, `Failed to load diff for ${filePath}`);
      logger.error('Git', 'Failed to inspect diff', {
        error: formatErrorDetails(e),
        filePath,
        isStaged,
      });
      setErrorMsg(msg);
    }
  };

  const renderStatusBadge = (status: GitFileStatus['status']) => {
    switch (status) {
      case 'added':
        return <span className="text-[10px] font-bold text-emerald-400">A</span>;
      case 'modified':
        return <span className="text-[10px] font-bold text-amber-400">M</span>;
      case 'deleted':
        return <span className="text-[10px] font-bold text-rose-400">D</span>;
      case 'untracked':
        return <span className="text-[10px] font-bold text-sky-400">U</span>;
      default:
        return <span className="text-[10px] font-bold text-zinc-400">?</span>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none text-[13px]">
      {/* Top Header & Actions */}
      <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center space-x-1.5 font-bold uppercase text-[11px] tracking-wider text-[var(--text-muted)]">
          <GitBranch className="w-3.5 h-3.5 text-accent-primary" />
          <span>Source Control</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setConnectModalOpen(true)}
            className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-accent-primary transition-colors cursor-pointer"
            title="Connect or Publish to GitHub"
          >
            <GithubIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCloneModalOpen(true)}
            className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Clone Repository"
          >
            <GitFork className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refreshStatus}
            disabled={loadingStatus}
            className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Git Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-accent-primary' : ''}`} />
          </button>
        </div>
      </div>

      {!workspacePath ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2 text-[var(--text-muted)] text-xs">
          <FolderGit2 className="w-8 h-8 opacity-40 text-accent-primary" />
          <p>No project workspace opened.</p>
        </div>
      ) : !isRepo ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary">
            <FolderGit2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              No Git Repository Found
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
              This workspace folder is not currently initialized with Git. Initialize it locally or connect directly to a GitHub repository.
            </p>
          </div>
          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start space-x-2 max-w-xs text-left">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}
          <div className="w-full space-y-2 pt-2 max-w-xs">
            <button
              onClick={handleInitRepo}
              disabled={loadingInit}
              className="w-full py-2 px-3 rounded-lg bg-accent-primary text-black font-semibold text-xs flex items-center justify-center space-x-2 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {loadingInit ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderGit2 className="w-4 h-4" />
              )}
              <span>Initialize Git Repository</span>
            </button>
            <button
              onClick={() => setConnectModalOpen(true)}
              className="w-full py-2 px-3 rounded-lg bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <GithubIcon className="w-4 h-4" />
              <span>Connect to GitHub</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* GitHub Linked Repository Card */}
          {remoteUrl ? (
            <div className="p-2.5 mx-3 mt-2 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between space-x-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5 text-[11px] font-bold text-emerald-400">
                  <GithubIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="truncate">
                    {parseGithubOwnerRepo(remoteUrl)
                      ? `${parseGithubOwnerRepo(remoteUrl)?.owner}/${parseGithubOwnerRepo(remoteUrl)?.repo}`
                      : 'Connected Repository'}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] truncate font-mono mt-0.5">
                  origin • {branch}
                </div>
              </div>
              <div className="flex items-center space-x-1 shrink-0">
                <a
                  href={remoteUrl.replace(/\.git$/, '')}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 cursor-pointer"
                  title="Open in GitHub browser"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 font-semibold text-[10px] flex items-center space-x-1 cursor-pointer"
                  title="Disconnect remote repository"
                >
                  {disconnecting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Unlink className="w-3 h-3" />
                  )}
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 pt-2">
              <button
                onClick={() => setConnectModalOpen(true)}
                className="w-full py-1.5 px-2.5 rounded-lg bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] hover:border-accent-primary/40 text-[var(--text-primary)] text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <GithubIcon className="w-3.5 h-3.5 text-zinc-400" />
                <span>Connect to GitHub</span>
              </button>
            </div>
          )}

          {/* Branch & Sync Bar */}
          <div className="p-3 bg-[var(--canvas)]/40 border-b border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="relative">
                <button
                  onClick={() => setShowBranchMenu(!showBranchMenu)}
                  className="flex items-center space-x-1.5 px-2 py-1 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono transition-colors"
                  title="Switch branch"
                >
                  <GitBranch className="w-3 h-3 text-accent-primary" />
                  <span className="font-semibold">{branch}</span>
                </button>

                {/* Branch Switcher Dropdown */}
                {showBranchMenu && (
                  <div className="absolute left-0 top-8 z-40 w-52 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-xl p-2 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] px-1">
                      Branches
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-0.5">
                      {branches.map((bName) => (
                        <button
                          key={bName}
                          onClick={() => handleCheckout(bName)}
                          className={`w-full text-left px-2 py-1 rounded text-xs font-mono flex items-center justify-between ${
                            bName === branch
                              ? 'bg-[var(--active-bg)] text-accent-primary font-medium'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
                          }`}
                        >
                          <span className="truncate">{bName}</span>
                          {bName === branch && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          value={newBranchInput}
                          onChange={(e) => setNewBranchInput(e.target.value)}
                          placeholder="New branch name..."
                          className="flex-1 px-2 py-1 rounded bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary"
                        />
                        <button
                          onClick={() => {
                            if (newBranchInput.trim()) {
                              handleCheckout(newBranchInput.trim(), true);
                            }
                          }}
                          disabled={!newBranchInput.trim()}
                          className="p-1 rounded bg-accent-primary text-black disabled:opacity-40"
                          title="Create Branch"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sync (Pull/Push) */}
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handlePull}
                  disabled={isPulling || isPushing}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] hover:border-sky-500/50 text-xs text-[var(--text-primary)] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  title={`Pull incoming commits (${behind} behind)`}
                >
                  <ArrowDown
                    className={`w-3.5 h-3.5 text-sky-400 ${isPulling ? 'animate-spin' : ''}`}
                  />
                  <span className="font-mono text-[11px]">Pull</span>
                  {behind > 0 && (
                    <span className="px-1 rounded bg-sky-500/20 text-sky-300 font-bold text-[10px] font-mono">
                      {behind}
                    </span>
                  )}
                </button>
                <button
                  onClick={handlePush}
                  disabled={isPushing || isPulling}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] hover:border-emerald-500/50 text-xs text-[var(--text-primary)] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  title={`Push local commits (${ahead} ahead)`}
                >
                  <ArrowUp
                    className={`w-3.5 h-3.5 text-emerald-400 ${isPushing ? 'animate-spin' : ''}`}
                  />
                  <span className="font-mono text-[11px]">Push</span>
                  {ahead > 0 && (
                    <span className="px-1 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] font-mono">
                      {ahead}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Sync Feedback Banner */}
            {syncFeedback && (
              <div className="p-2 rounded bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{syncFeedback.message}</span>
                </div>
                <button
                  onClick={() => setSyncFeedback(null)}
                  className="p-0.5 text-emerald-400/80 hover:text-emerald-300 cursor-pointer"
                  title="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Error Feedback Banner */}
            {errorMsg && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start justify-between space-x-2">
                <div className="flex items-start space-x-1.5 flex-1 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span className="break-words leading-relaxed">{errorMsg}</span>
                </div>
                <button
                  onClick={() => setErrorMsg(null)}
                  className="p-0.5 text-rose-400/80 hover:text-rose-300 rounded cursor-pointer"
                  title="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Commit Message & Action */}
            <div className="space-y-1.5 pt-1">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleCommit();
                  }
                }}
                placeholder="Commit message (Ctrl+Enter to commit)..."
                rows={2}
                className="w-full px-2.5 py-1.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] resize-none focus:outline-hidden focus:border-emerald-500 font-mono placeholder:text-zinc-600"
              />
              <button
                onClick={handleCommit}
                disabled={loadingCommit || staged.length === 0 || !commitMessage.trim()}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-md shadow-emerald-950/20 hover:shadow-emerald-500/20 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loadingCommit ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Commit to {branch}</span>
              </button>
            </div>
          </div>

      {/* Changes Lists */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
        {/* Staged Changes */}
        <div className="p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Staged Changes ({staged.length})</span>
            {staged.length > 0 && (
              <button
                onClick={handleUnstageAll}
                className="text-[10px] text-accent-primary hover:underline lowercase"
              >
                unstage all
              </button>
            )}
          </div>

          {staged.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]/70 italic py-1">No staged changes</p>
          ) : (
            <div className="space-y-0.5">
              {staged.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between p-1.5 rounded hover:bg-[var(--hover-bg)] group text-xs font-mono"
                >
                  <div className="flex items-center space-x-2 truncate">
                    {renderStatusBadge(file.status)}
                    <span className="truncate text-[var(--text-primary)]" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenDiff(file.path, true)}
                      className="p-1 rounded hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-accent-primary"
                      title="Inspect Diff"
                    >
                      <FileDiff className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleUnstageFile(file.path)}
                      className="p-1 rounded hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-400"
                      title="Unstage File"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Changes (Unstaged) */}
        <div className="p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Changes ({unstaged.length})</span>
            {unstaged.length > 0 && (
              <button
                onClick={handleStageAll}
                className="text-[10px] text-accent-primary hover:underline lowercase"
              >
                stage all
              </button>
            )}
          </div>

          {unstaged.length === 0 ? (
            <div className="py-2 flex items-center space-x-1.5 text-xs text-emerald-400/80">
              <Check className="w-3.5 h-3.5" />
              <span>Working tree clean</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {unstaged.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between p-1.5 rounded hover:bg-[var(--hover-bg)] group text-xs font-mono"
                >
                  <div className="flex items-center space-x-2 truncate">
                    {renderStatusBadge(file.status)}
                    <span className="truncate text-[var(--text-primary)]" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenDiff(file.path, false)}
                      className="p-1 rounded hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-accent-primary"
                      title="Inspect Diff"
                    >
                      <FileDiff className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleStageFile(file.path)}
                      className="p-1 rounded hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-emerald-400"
                      title="Stage File"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commit History List */}
        {commits.length > 0 && (
          <div className="p-3 border-t border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              <span>Recent Commits ({commits.length})</span>
              <span className="font-mono text-[10px] text-accent-primary">{branch}</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
              {commits.map((c) => (
                <div
                  key={c.hash}
                  className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--canvas)]/40 hover:bg-[var(--hover-bg)] transition-colors flex items-start space-x-2 group"
                >
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-emerald-400 font-bold text-[10px] shrink-0 font-mono">
                    {c.shortHash}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs text-[var(--text-primary)] truncate font-sans font-medium"
                      title={c.message}
                    >
                      {c.message || 'No commit message'}
                    </p>
                    <div className="flex items-center space-x-1.5 text-[10px] text-[var(--text-muted)] mt-0.5 font-sans">
                      <span className="truncate">{c.authorName}</span>
                      <span>•</span>
                      <span>{new Date(c.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {/* Diff Inspector Modal */}
      {inspectDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--canvas)]/40">
              <div className="flex items-center space-x-2">
                <FileDiff className="w-4 h-4 text-accent-primary" />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {inspectDiff.filePath}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--hover-bg)] text-[var(--text-muted)] uppercase">
                  {inspectDiff.staged ? 'Staged' : 'Working Tree'}
                </span>
              </div>
              <button
                onClick={() => setInspectDiff(null)}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-[#0d0f12] font-mono text-xs leading-relaxed">
              {inspectDiff.content ? (
                <pre className="whitespace-pre-wrap">
                  {inspectDiff.content.split('\n').map((line, idx) => {
                    const isAdd = line.startsWith('+') && !line.startsWith('+++');
                    const isDel = line.startsWith('-') && !line.startsWith('---');
                    const isHunk = line.startsWith('@@');

                    let lineStyle = 'text-zinc-300';
                    let bgStyle = '';
                    if (isAdd) {
                      lineStyle = 'text-emerald-400';
                      bgStyle = 'bg-emerald-500/10';
                    } else if (isDel) {
                      lineStyle = 'text-rose-400';
                      bgStyle = 'bg-rose-500/10';
                    } else if (isHunk) {
                      lineStyle = 'text-sky-400 font-bold';
                      bgStyle = 'bg-sky-500/5';
                    }

                    return (
                      <div key={idx} className={`px-2 py-0.5 rounded-xs ${lineStyle} ${bgStyle}`}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <div className="text-zinc-500 italic">No visible line differences detected.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      <CloneRepoModal isOpen={cloneModalOpen} onClose={() => setCloneModalOpen(false)} />
    </div>
  );
};
