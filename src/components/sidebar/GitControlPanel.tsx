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
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useGitStore } from '../../store/useGitStore';
import { formatErrorMessage, formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';
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
  const userProfile = useGitStore((s) => s.userProfile);
  const setGitStatus = useGitStore((s) => s.setGitStatus);

  const [commitMessage, setCommitMessage] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
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
      const res = await gitStatus(workspacePath);
      setGitStatus(res.branch, res.isClean, res.ahead, res.behind, res.staged, res.unstaged);
      const bList = await gitListBranches(workspacePath);
      setBranches(bList);
    } catch (err) {
      logger.warn('Git', 'Failed to refresh git status', { error: formatErrorDetails(err) });
    } finally {
      setLoadingStatus(false);
    }
  }, [workspacePath, setGitStatus]);

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
    setLoadingSync(true);
    setErrorMsg(null);
    try {
      await gitPush(workspacePath);
      logger.info('Git', `Successfully pushed branch ${branch} to origin`);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Git push failed');
      logger.error('Git', 'Git push failed', { error: formatErrorDetails(e), branch });
      setErrorMsg(msg);
    } finally {
      setLoadingSync(false);
    }
  };

  const handlePull = async () => {
    if (!workspacePath) return;
    setLoadingSync(true);
    setErrorMsg(null);
    try {
      await gitPull(workspacePath);
      logger.info('Git', `Successfully pulled incoming changes on branch ${branch}`);
      await refreshStatus();
    } catch (e) {
      const msg = formatErrorMessage(e, 'Git pull failed');
      logger.error('Git', 'Git pull failed', { error: formatErrorDetails(e), branch });
      setErrorMsg(msg);
    } finally {
      setLoadingSync(false);
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
            onClick={() => setCloneModalOpen(true)}
            className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Clone Repository"
          >
            <GitFork className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refreshStatus}
            disabled={loadingStatus}
            className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            title="Refresh Git Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-accent-primary' : ''}`} />
          </button>
        </div>
      </div>

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
          <div className="flex items-center space-x-1">
            <button
              onClick={handlePull}
              disabled={loadingSync}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] transition-colors disabled:opacity-50"
              title={`Pull incoming commits (${behind} behind)`}
            >
              <ArrowDown className="w-3 h-3 text-sky-400" />
              <span className="font-mono text-[11px]">{behind}</span>
            </button>
            <button
              onClick={handlePush}
              disabled={loadingSync}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] transition-colors disabled:opacity-50"
              title={`Push local commits (${ahead} ahead)`}
            >
              <ArrowUp className="w-3 h-3 text-emerald-400" />
              <span className="font-mono text-[11px]">{ahead}</span>
            </button>
          </div>
        </div>

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
            className="w-full px-2.5 py-1.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] resize-none focus:outline-hidden focus:border-accent-primary font-mono placeholder:text-zinc-600"
          />
          <button
            onClick={handleCommit}
            disabled={loadingCommit || staged.length === 0 || !commitMessage.trim()}
            className="w-full py-1.5 bg-accent-primary text-black font-semibold rounded-md text-xs hover:opacity-90 transition-opacity flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
      </div>

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
