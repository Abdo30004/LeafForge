import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Copy,
  Check,
  Trash2,
  Terminal,
  Search,
} from 'lucide-react';
import { useCompilerStore } from '../../store/useCompilerStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { cleanAuxFiles } from '../../services/tauriClient';
import type { LatexDiagnostic } from '../../types/latex';

export interface BuildLogDrawerProps {
  isOpen?: boolean;
  diagnostics?: LatexDiagnostic[];
  activeTab?: 'errors' | 'warnings' | 'raw';
  rawLog?: string;
}

export const BuildLogDrawer: React.FC<BuildLogDrawerProps> = ({
  isOpen,
  diagnostics: propDiags,
  activeTab: propActiveTab,
  rawLog: propRawLog,
}) => {
  const storeOpen = useCompilerStore((s) => s.logDrawerOpen);
  const logDrawerOpen = isOpen !== undefined ? isOpen : storeOpen;

  const storeTab = useCompilerStore((s) => s.activeLogTab);
  const activeLogTab = propActiveTab !== undefined ? propActiveTab : storeTab;

  const storeDiags = useCompilerStore((s) => s.diagnostics);
  const diagnostics = propDiags !== undefined ? propDiags : storeDiags;

  const storeRawLog = useCompilerStore((s) => s.rawLog);
  const rawLog = propRawLog !== undefined ? propRawLog : storeRawLog;

  const lastDuration = useCompilerStore((s) => s.lastBuildDurationMs);

  const toggleLogDrawer = useCompilerStore((s) => s.toggleLogDrawer);
  const setActiveLogTab = useCompilerStore((s) => s.setActiveLogTab);

  const setEditorJumpTarget = useWorkspaceStore((s) => s.setEditorJumpTarget);
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const rootTexFile = useWorkspaceStore((s) => s.rootTexFile) || 'main.tex';
  const openFile = useWorkspaceStore((s) => s.openFile);

  const [copied, setCopied] = useState(false);
  const [filterText, setFilterText] = useState('');

  if (!logDrawerOpen) return null;

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const handleCopyLog = () => {
    if (!rawLog) return;
    navigator.clipboard.writeText(rawLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCleanAux = async () => {
    if (!workspacePath) return;
    try {
      await cleanAuxFiles(workspacePath, rootTexFile);
    } catch (e) {
      console.error('Failed to clean aux files:', e);
    }
  };

  const handleJumpToDiagnostic = (diag: LatexDiagnostic) => {
    if (diag.filePath) {
      openFile(diag.filePath);
    }
    setEditorJumpTarget({ line: diag.line, col: diag.column });
  };

  const filteredRawLog = filterText
    ? rawLog
        .split('\n')
        .filter((l) => l.toLowerCase().includes(filterText.toLowerCase()))
        .join('\n')
    : rawLog;

  return (
    <div
      className="border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-col h-64 transition-all duration-200 z-20 shadow-2xl"
      data-testid="build-log-drawer"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--surface-app)]">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveLogTab('errors')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              activeLogTab === 'errors'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Errors</span>
            <span
              className={`px-1 rounded text-[10px] font-bold ${
                errors.length > 0 ? 'bg-rose-500 text-white' : 'bg-zinc-700 text-zinc-300'
              }`}
            >
              {errors.length}
            </span>
          </button>

          <button
            onClick={() => setActiveLogTab('warnings')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              activeLogTab === 'warnings'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Warnings</span>
            <span
              className={`px-1 rounded text-[10px] font-bold ${
                warnings.length > 0 ? 'bg-amber-500 text-black' : 'bg-zinc-700 text-zinc-300'
              }`}
            >
              {warnings.length}
            </span>
          </button>

          <button
            onClick={() => setActiveLogTab('raw')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              activeLogTab === 'raw'
                ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Raw Log</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {lastDuration > 0 && (
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Build: {lastDuration}ms
            </span>
          )}

          <button
            onClick={handleCleanAux}
            title="Clean auxiliary compilation files (.aux, .log, .out)"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopyLog}
            title="Copy Raw Log"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={toggleLogDrawer}
            title="Close Drawer"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawer content body */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {activeLogTab === 'errors' && (
          <div className="space-y-1.5">
            {errors.length === 0 ? (
              <div className="text-[var(--text-muted)] p-4 text-center">No compilation errors.</div>
            ) : (
              errors.map((err, idx) => (
                <div
                  key={idx}
                  onClick={() => handleJumpToDiagnostic(err)}
                  className="p-2 bg-rose-500/10 border border-rose-500/20 rounded cursor-pointer hover:bg-rose-500/20 transition-colors flex items-start space-x-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 text-[11px] text-rose-300 font-semibold">
                      <span>{err.filePath}</span>
                      <span>:</span>
                      <span>Line {err.line}</span>
                    </div>
                    <div className="text-[var(--text-primary)] mt-0.5 whitespace-pre-wrap">
                      {err.message}
                    </div>
                    {err.rawLogSnippet && (
                      <div className="mt-1 p-1 bg-black/30 rounded text-[10px] text-zinc-400 whitespace-pre font-mono overflow-x-auto">
                        {err.rawLogSnippet}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeLogTab === 'warnings' && (
          <div className="space-y-1.5">
            {warnings.length === 0 ? (
              <div className="text-[var(--text-muted)] p-4 text-center">No compilation warnings.</div>
            ) : (
              warnings.map((warn, idx) => (
                <div
                  key={idx}
                  onClick={() => handleJumpToDiagnostic(warn)}
                  className="p-2 bg-amber-500/10 border border-amber-500/20 rounded cursor-pointer hover:bg-amber-500/20 transition-colors flex items-start space-x-2"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 text-[11px] text-amber-300 font-semibold">
                      <span>{warn.filePath}</span>
                      <span>:</span>
                      <span>Line {warn.line}</span>
                    </div>
                    <div className="text-[var(--text-primary)] mt-0.5 whitespace-pre-wrap">
                      {warn.message}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeLogTab === 'raw' && (
          <div className="h-full flex flex-col space-y-1">
            <div className="flex items-center space-x-1.5 px-2 py-1 bg-[var(--surface-app)] border border-[var(--border-subtle)] rounded">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter log..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] w-full font-mono placeholder:text-[var(--text-muted)]"
              />
            </div>
            <pre className="flex-1 overflow-auto p-2 bg-[var(--surface-editor)] border border-[var(--border-subtle)] rounded text-[11px] leading-relaxed text-zinc-300 whitespace-pre font-mono">
              {filteredRawLog || 'No compilation output recorded yet.'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
