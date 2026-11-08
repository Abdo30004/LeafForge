import React, { useState } from 'react';
import { X, GitFork, FolderOpen, Loader2, AlertCircle, Check } from 'lucide-react';
import { gitClone, openFolder, listFiles, watchDirectory, gitStatus } from '../../services/tauriClient';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useGitStore } from '../../store/useGitStore';

interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloneRepoModal: React.FC<CloneRepoModalProps> = ({ isOpen, onClose }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [targetDir, setTargetDir] = useState('');
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const setWorkspacePath = useWorkspaceStore((s) => s.setWorkspacePath);
  const setFiles = useWorkspaceStore((s) => s.setFiles);
  const setGitStatus = useGitStore((s) => s.setGitStatus);

  if (!isOpen) return null;

  const handlePickDirectory = async () => {
    try {
      const selected = await openFolder();
      if (selected) {
        setTargetDir(selected);
      }
    } catch (e) {
      console.error('Pick directory error:', e);
    }
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      setErrorMsg('Please enter a Git repository URL.');
      return;
    }
    if (!targetDir.trim()) {
      setErrorMsg('Please select a target destination folder.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await gitClone(repoUrl.trim(), targetDir.trim(), branch.trim() || undefined);
      setSuccessMsg('Repository cloned successfully! Opening workspace...');

      // Auto-load cloned project into workspace
      setWorkspacePath(targetDir.trim());
      const files = await listFiles(targetDir.trim());
      setFiles(files);
      await watchDirectory(targetDir.trim());

      const status = await gitStatus(targetDir.trim());
      setGitStatus(
        status.branch,
        status.isClean,
        status.ahead,
        status.behind,
        status.staged,
        status.unstaged
      );

      setTimeout(() => {
        setLoading(false);
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to clone repository: ${msg}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--canvas)]/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center">
              <GitFork className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Clone GitHub Repository</h3>
              <p className="text-[11px] text-[var(--text-muted)]">Native libgit2 clone with OS keychain authentication</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleClone} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-md text-xs text-rose-400 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-xs text-emerald-400 flex items-center space-x-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-primary)]">Repository URL</label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/latex-paper.git"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary font-mono placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-primary)]">Destination Directory</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                placeholder="/path/to/destination/folder"
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary font-mono placeholder:text-zinc-600"
              />
              <button
                type="button"
                onClick={handlePickDirectory}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium flex items-center space-x-1.5 transition-colors border border-[var(--border-subtle)] cursor-pointer"
                title="Browse destination folder"
              >
                <FolderOpen className="w-3.5 h-3.5 text-accent-primary" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-primary)]">
              Branch <span className="text-[11px] text-[var(--text-muted)]">(Optional, defaults to HEAD)</span>
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-accent-primary font-mono placeholder:text-zinc-600"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-accent-primary text-black font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Cloning Repository...' : 'Clone Repository'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
