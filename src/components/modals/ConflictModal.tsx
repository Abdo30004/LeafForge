import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  FileCode2,
  GitMerge,
  ArrowRight,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { useCollabStore } from '../../store/useCollabStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { gitCrdtBridge, assembleResolvedDocument } from '../../services/gitCrdtBridge';
import type { ConflictState, ConflictHunk } from '../../types/collab';

export interface ConflictModalProps {
  conflictOverride?: ConflictState | null;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({ conflictOverride }) => {
  const storeConflict = useCollabStore((s) => s.activeConflict);
  const activeConflict = conflictOverride !== undefined ? conflictOverride : storeConflict;
  const setActiveConflict = useCollabStore((s) => s.setActiveConflict);
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);

  const [choices, setChoices] = useState<Record<number, 'live' | 'remote'>>({});
  const [activeTab, setActiveTab] = useState<'hunks' | 'preview'>('hunks');
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (activeConflict) {
      // Default to empty choices
      const initial: Record<number, 'live' | 'remote'> = {};
      activeConflict.hunks.forEach((hunk: ConflictHunk) => {
        if (hunk.chosen) {
          initial[hunk.index] = hunk.chosen as 'live' | 'remote';
        }
      });
      setChoices(initial);
      setActiveTab('hunks');
      setIsApplying(false);
    }
  }, [activeConflict]);

  if (!activeConflict) return null;

  const totalHunks = activeConflict.hunks.length;
  const resolvedCount = Object.keys(choices).length;
  const allResolved = totalHunks > 0 && resolvedCount === totalHunks;

  const handleChooseHunk = (index: number, choice: 'live' | 'remote') => {
    setChoices((prev) => ({
      ...prev,
      [index]: choice,
    }));
  };

  const handleChooseAll = (choice: 'live' | 'remote') => {
    const updated: Record<number, 'live' | 'remote'> = {};
    activeConflict.hunks.forEach((hunk: ConflictHunk) => {
      updated[hunk.index] = choice;
    });
    setChoices(updated);
  };

  const previewText = assembleResolvedDocument(activeConflict.mergedWithMarkers, choices);

  const handleApply = async () => {
    if (!allResolved) return;
    setIsApplying(true);
    try {
      await gitCrdtBridge.resolveConflict(
        activeConflict.filePath,
        previewText,
        workspacePath ?? undefined
      );
    } catch (err) {
      console.error('Failed to apply conflict resolution:', err);
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    setActiveConflict(null);
  };

  const fileName = activeConflict.filePath.replace(/\\/g, '/').split('/').pop() || 'document.tex';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden text-[13px] animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--canvas)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-base text-[var(--text-primary)]">
                  3-Way Merge Conflicts Detected
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                  {totalHunks} {totalHunks === 1 ? 'Conflict' : 'Conflicts'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5 flex items-center space-x-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-accent-primary" />
                <span>{fileName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            title="Dismiss resolver"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Controls & Tab Switcher */}
        <div className="px-4 py-2.5 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[var(--text-muted)] font-medium">Batch Actions:</span>
            <button
              onClick={() => handleChooseAll('live')}
              className="px-2.5 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 font-medium transition-colors cursor-pointer"
            >
              Keep All Live (CRDT)
            </button>
            <button
              onClick={() => handleChooseAll('remote')}
              className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 font-medium transition-colors cursor-pointer"
            >
              Accept All Incoming (Git)
            </button>
          </div>

          <div className="flex items-center bg-[var(--canvas)] p-0.5 rounded-md border border-[var(--border-subtle)]">
            <button
              onClick={() => setActiveTab('hunks')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTab === 'hunks'
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Hunks ({resolvedCount}/{totalHunks})</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTab === 'preview'
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Merged Preview</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'hunks' ? (
            activeConflict.hunks.map((hunk: ConflictHunk, idx: number) => {
              const currentChoice = choices[hunk.index];

              return (
                <div
                  key={hunk.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--canvas)] overflow-hidden shadow-xs"
                >
                  <div className="px-3.5 py-2 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--text-primary)] uppercase tracking-wider">
                      Conflict Hunk #{idx + 1}
                    </span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        currentChoice
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {currentChoice ? `Resolved (${currentChoice})` : 'Unresolved'}
                    </span>
                  </div>

                  {/* Side-by-Side Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
                    {/* Live CRDT Choice Card */}
                    <div
                      onClick={() => handleChooseHunk(hunk.index, 'live')}
                      className={`p-3 space-y-2 cursor-pointer transition-colors ${
                        currentChoice === 'live'
                          ? 'bg-sky-500/10'
                          : 'hover:bg-[var(--hover-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-sky-400 flex items-center space-x-1.5">
                          <span>Live Session (CRDT)</span>
                        </span>
                        <button
                          type="button"
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            currentChoice === 'live'
                              ? 'bg-sky-500 text-black'
                              : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {currentChoice === 'live' ? '✓ Selected' : 'Keep Live'}
                        </button>
                      </div>
                      <pre className="p-2.5 rounded bg-[var(--surface-editor)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                        {hunk.liveContent || <span className="text-zinc-600 italic">&lt;empty&gt;</span>}
                      </pre>
                    </div>

                    {/* Incoming Git Remote Choice Card */}
                    <div
                      onClick={() => handleChooseHunk(hunk.index, 'remote')}
                      className={`p-3 space-y-2 cursor-pointer transition-colors ${
                        currentChoice === 'remote'
                          ? 'bg-amber-500/10'
                          : 'hover:bg-[var(--hover-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-400 flex items-center space-x-1.5">
                          <span>Incoming Git Commit</span>
                        </span>
                        <button
                          type="button"
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            currentChoice === 'remote'
                              ? 'bg-amber-500 text-black'
                              : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {currentChoice === 'remote' ? '✓ Selected' : 'Accept Git'}
                        </button>
                      </div>
                      <pre className="p-2.5 rounded bg-[var(--surface-editor)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                        {hunk.remoteContent || <span className="text-zinc-600 italic">&lt;empty&gt;</span>}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Output preview with current hunk selections:</span>
                <span className="font-mono text-[11px]">{previewText.split('\n').length} lines</span>
              </div>
              <pre className="p-3.5 rounded-lg bg-[var(--surface-editor)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] overflow-x-auto whitespace-pre leading-relaxed max-h-[50vh]">
                {previewText}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--canvas)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                allResolved ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-[var(--text-muted)] font-medium">
              {allResolved
                ? 'All conflicts resolved. Ready to synchronize.'
                : `${totalHunks - resolvedCount} of ${totalHunks} conflict(s) remaining`}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleClose}
              disabled={isApplying}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!allResolved || isApplying}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isApplying ? (
                <span>Applying...</span>
              ) : (
                <>
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>Apply Resolution & Synchronize</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
