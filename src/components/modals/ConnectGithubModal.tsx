import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  Lock,
  Globe,
  Loader2,
  AlertCircle,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useGitStore } from '../../store/useGitStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  listGithubUserRepos,
  createGithubRepo,
  gitInit,
  gitSetRemote,
  gitStatus,
} from '../../services/tauriClient';
import type { GithubRepoSummary } from '../../types/git';
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

export const ConnectGithubModal: React.FC = () => {
  const isOpen = useGitStore((s) => s.connectModalOpen);
  const setOpen = useGitStore((s) => s.setConnectModalOpen);
  const setDeviceModalOpen = useGitStore((s) => s.setDeviceModalOpen);
  const userProfile = useGitStore((s) => s.userProfile);
  const isRepo = useGitStore((s) => s.isRepo);
  const setGitStatus = useGitStore((s) => s.setGitStatus);
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);

  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing');
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectingId, setConnectingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New repo fields
  const defaultRepoName = useMemo(() => {
    if (!workspacePath) return 'latex-document';
    const parts = workspacePath.split(/[/\\]/);
    const last = parts.filter(Boolean).pop();
    return last ? last.toLowerCase().replace(/[^a-z0-9_-]/g, '-') : 'latex-document';
  }, [workspacePath]);

  const [newRepoName, setNewRepoName] = useState(defaultRepoName);
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setNewRepoName(defaultRepoName);
  }, [defaultRepoName, isOpen]);

  const fetchRepos = useCallback(async () => {
    if (!userProfile) return;
    setLoadingRepos(true);
    setErrorMsg(null);
    try {
      const list = await listGithubUserRepos();
      setRepos(list);
    } catch (err) {
      const msg = formatErrorMessage(err, 'Failed to fetch GitHub repositories');
      logger.error('Git', 'Failed to fetch user repositories', {
        error: formatErrorDetails(err),
      });
      setErrorMsg(msg);
    } finally {
      setLoadingRepos(false);
    }
  }, [userProfile]);

  useEffect(() => {
    if (isOpen && userProfile) {
      fetchRepos();
    }
  }, [isOpen, userProfile, fetchRepos]);

  const handleConnectRepo = async (repo: GithubRepoSummary) => {
    if (!workspacePath) return;
    setConnectingId(repo.id);
    setErrorMsg(null);
    try {
      if (!isRepo) {
        await gitInit(workspacePath);
      }
      await gitSetRemote(workspacePath, repo.cloneUrl, 'origin');
      logger.info('Git', `Successfully connected workspace to GitHub repository: ${repo.fullName}`, {
        repoUrl: repo.cloneUrl,
      });

      // Refresh git status
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

      setOpen(false);
    } catch (err) {
      const msg = formatErrorMessage(err, `Failed to connect repository: ${repo.fullName}`);
      logger.error('Git', `Failed to connect repository: ${repo.fullName}`, {
        error: formatErrorDetails(err),
      });
      setErrorMsg(msg);
    } finally {
      setConnectingId(null);
    }
  };

  const handleCreateAndConnect = async () => {
    if (!workspacePath || !newRepoName.trim()) return;
    setCreating(true);
    setErrorMsg(null);
    try {
      const created = await createGithubRepo(
        newRepoName.trim(),
        isPrivate,
        newRepoDesc.trim() || undefined
      );

      if (!isRepo) {
        await gitInit(workspacePath);
      }
      await gitSetRemote(workspacePath, created.cloneUrl, 'origin');
      logger.info('Git', `Created and connected new GitHub repository: ${created.fullName}`, {
        repoUrl: created.cloneUrl,
      });

      // Refresh git status
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

      setOpen(false);
    } catch (err) {
      const msg = formatErrorMessage(err, 'Failed to create GitHub repository');
      logger.error('Git', 'Failed to create GitHub repository', {
        error: formatErrorDetails(err),
      });
      setErrorMsg(msg);
    } finally {
      setCreating(false);
    }
  };

  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return repos;
    const q = searchQuery.toLowerCase().trim();
    return repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [repos, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--canvas)]/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary">
              <GithubIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Connect to GitHub
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Link this workspace to an existing repository or create a new one
              </p>
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
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 break-words">{errorMsg}</div>
            </div>
          )}

          {!userProfile ? (
            /* Unauthenticated State */
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary">
                <GithubIcon className="w-6 h-6" />
              </div>
              <div className="max-w-xs space-y-1">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                  Sign In Required
                </h4>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Sign in with your GitHub account to access your repositories and connect your project.
                </p>
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  setDeviceModalOpen(true);
                }}
                className="px-4 py-2 bg-accent-primary text-black font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity flex items-center space-x-2 cursor-pointer"
              >
                <GithubIcon className="w-4 h-4" />
                <span>Sign in with GitHub</span>
              </button>
            </div>
          ) : (
            /* Authenticated Content */
            <div className="space-y-4">
              {/* User Identity Chip */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--canvas)]/60 border border-[var(--border-subtle)]">
                <div className="flex items-center space-x-2.5">
                  <img
                    src={userProfile.avatarUrl}
                    alt={userProfile.username}
                    className="w-6 h-6 rounded-full border border-[var(--border-subtle)]"
                  />
                  <div className="text-xs">
                    <span className="text-[var(--text-muted)]">Signed in as </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      @{userProfile.username}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    Connected
                  </span>
                </div>
              </div>

              {/* Tabs Switcher */}
              <div className="flex border-b border-[var(--border-subtle)] text-xs">
                <button
                  onClick={() => setActiveTab('existing')}
                  className={`pb-2 px-3 font-semibold transition-colors border-b-2 ${
                    activeTab === 'existing'
                      ? 'border-accent-primary text-accent-primary'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Your Repositories ({repos.length})
                </button>
                <button
                  onClick={() => setActiveTab('new')}
                  className={`pb-2 px-3 font-semibold transition-colors border-b-2 ${
                    activeTab === 'new'
                      ? 'border-accent-primary text-accent-primary'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Create New Repository
                </button>
              </div>

              {activeTab === 'existing' ? (
                /* Tab 1: Existing Repositories */
                <div className="space-y-3">
                  {/* Search Bar */}
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search repositories..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary font-mono placeholder:text-zinc-600"
                      />
                    </div>
                    <button
                      onClick={fetchRepos}
                      disabled={loadingRepos}
                      className="p-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                      title="Refresh repository list"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${loadingRepos ? 'animate-spin text-accent-primary' : ''}`}
                      />
                    </button>
                  </div>

                  {/* Repositories List */}
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                    {loadingRepos ? (
                      <div className="py-8 flex flex-col items-center justify-center space-y-2 text-[var(--text-muted)] text-xs">
                        <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                        <span>Loading repositories from GitHub...</span>
                      </div>
                    ) : filteredRepos.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                        {searchQuery ? 'No matching repositories found.' : 'No repositories found.'}
                      </div>
                    ) : (
                      filteredRepos.map((repo) => (
                        <div
                          key={repo.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-subtle)] hover:border-accent-primary/40 bg-[var(--canvas)]/30 hover:bg-[var(--hover-bg)] transition-colors group"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="flex items-center space-x-1.5">
                              {repo.private ? (
                                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              )}
                              <span className="font-semibold text-xs text-[var(--text-primary)] truncate font-mono">
                                {repo.fullName}
                              </span>
                            </div>
                            {repo.description && (
                              <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                                {repo.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleConnectRepo(repo)}
                            disabled={connectingId !== null}
                            className="px-3 py-1.5 rounded-md bg-accent-primary/10 hover:bg-accent-primary text-accent-primary hover:text-black font-semibold text-xs border border-accent-primary/20 transition-all shrink-0 flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                          >
                            {connectingId === repo.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <span>Connect</span>
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* Tab 2: Create New Repository */
                <div className="space-y-3.5 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      Repository Name
                    </label>
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      placeholder="e.g. quantum-optics-paper"
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={newRepoDesc}
                      onChange={(e) => setNewRepoDesc(e.target.value)}
                      placeholder="Academic paper written with LeafForge"
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600"
                    />
                  </div>

                  {/* Privacy Selector */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsPrivate(true)}
                      className={`p-2.5 rounded-lg border text-left flex items-start space-x-2 transition-colors ${
                        isPrivate
                          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                          : 'border-[var(--border-subtle)] hover:bg-[var(--hover-bg)] text-[var(--text-muted)]'
                      }`}
                    >
                      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          Private
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          Only you and collaborators can view
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPrivate(false)}
                      className={`p-2.5 rounded-lg border text-left flex items-start space-x-2 transition-colors ${
                        !isPrivate
                          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                          : 'border-[var(--border-subtle)] hover:bg-[var(--hover-bg)] text-[var(--text-muted)]'
                      }`}
                    >
                      <Globe className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          Public
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          Anyone on the internet can view
                        </div>
                      </div>
                    </button>
                  </div>

                  <button
                    onClick={handleCreateAndConnect}
                    disabled={creating || !newRepoName.trim()}
                    className="w-full py-2 bg-accent-primary text-black font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer mt-2"
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>Create & Connect Repository</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
