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
  FileText,
  ExternalLink,
} from 'lucide-react';
import { useCompilerStore } from '../../store/useCompilerStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useLogStore } from '../../store/useLogStore';
import { cleanAuxFiles } from '../../services/tauriClient';
import type { LatexDiagnostic } from '../../types/latex';
import type { LogLevel, LogEntry } from '../../types/ipc';

export interface BuildLogDrawerProps {
  isOpen?: boolean;
  diagnostics?: LatexDiagnostic[];
  activeTab?: 'errors' | 'warnings' | 'raw' | 'appLogs';
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
  const clearErrors = useCompilerStore((s) => s.clearErrors);
  const clearWarnings = useCompilerStore((s) => s.clearWarnings);
  const clearRawLog = useCompilerStore((s) => s.clearRawLog);

  const setEditorJumpTarget = useWorkspaceStore((s) => s.setEditorJumpTarget);
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const rootTexFile = useWorkspaceStore((s) => s.rootTexFile) || 'main.tex';
  const openFile = useWorkspaceStore((s) => s.openFile);

  const appLogs = useLogStore((s) => s.logs);
  const appLogLevelFilter = useLogStore((s) => s.levelFilter);
  const setAppLogLevelFilter = useLogStore((s) => s.setLevelFilter);
  const appLogSearchFilter = useLogStore((s) => s.searchFilter);
  const setAppLogSearchFilter = useLogStore((s) => s.setSearchFilter);
  const clearAppLogs = useLogStore((s) => s.clearLogs);
  const openLogFile = useLogStore((s) => s.openLogFile);
  const logFilePath = useLogStore((s) => s.logFilePath);
  const loadRecentLogs = useLogStore((s) => s.loadRecentLogs);

  const filteredAppLogs = React.useMemo(() => {
    return appLogs.filter((entry: LogEntry) => {
      if (appLogLevelFilter !== 'ALL' && entry.level !== appLogLevelFilter) {
        return false;
      }
      if (appLogSearchFilter.trim().length > 0) {
        const q = appLogSearchFilter.toLowerCase();
        return (
          entry.message.toLowerCase().includes(q) ||
          entry.target.toLowerCase().includes(q) ||
          (entry.details?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [appLogs, appLogLevelFilter, appLogSearchFilter]);

  const [copied, setCopied] = useState(false);
  const [filterText, setFilterText] = useState('');

  if (!logDrawerOpen) return null;

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const handleCopyLog = () => {
    if (activeLogTab === 'appLogs') {
      const text = filteredAppLogs
        .map(
          (l: LogEntry) =>
            `[${l.timestamp}] [${l.level}] [${l.target}] ${l.message}${
              l.details ? `\nDetails: ${l.details}` : ''
            }`
        )
        .join('\n');
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
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

  const handleClearCurrent = async () => {
    if (activeLogTab === 'errors') {
      clearErrors();
    } else if (activeLogTab === 'warnings') {
      clearWarnings();
    } else if (activeLogTab === 'raw') {
      clearRawLog();
    } else if (activeLogTab === 'appLogs') {
      await clearAppLogs();
    }
    await handleCleanAux();
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

          <button
            onClick={() => {
              setActiveLogTab('appLogs');
              loadRecentLogs();
            }}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              activeLogTab === 'appLogs'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>App Logs</span>
            <span className="px-1 rounded text-[10px] font-bold bg-zinc-700 text-zinc-300">
              {appLogs.length}
            </span>
          </button>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {lastDuration > 0 && (
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Build: {lastDuration}ms
            </span>
          )}

          <button
            onClick={handleClearCurrent}
            title={
              activeLogTab === 'errors'
                ? 'Clear compilation errors'
                : activeLogTab === 'warnings'
                  ? 'Clear compilation warnings'
                  : activeLogTab === 'raw'
                    ? 'Clear raw build log'
                    : 'Clear application logs'
            }
            className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
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
            {errors.length > 0 && (
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-[var(--border-subtle)]">
                <span className="text-[11px] text-[var(--text-muted)]">
                  {errors.length} {errors.length === 1 ? 'error' : 'errors'}
                </span>
                <button
                  onClick={() => clearErrors()}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[var(--hover-bg)] hover:bg-rose-500/20 text-xs text-[var(--text-muted)] hover:text-rose-400 border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  title="Clear compilation errors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Errors</span>
                </button>
              </div>
            )}
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
            {warnings.length > 0 && (
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-[var(--border-subtle)]">
                <span className="text-[11px] text-[var(--text-muted)]">
                  {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
                </span>
                <button
                  onClick={() => clearWarnings()}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[var(--hover-bg)] hover:bg-amber-500/20 text-xs text-[var(--text-muted)] hover:text-amber-300 border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  title="Clear compilation warnings"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Warnings</span>
                </button>
              </div>
            )}
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
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1.5 px-2 py-1 bg-[var(--surface-app)] border border-[var(--border-subtle)] rounded flex-1">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Filter log..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] w-full font-mono placeholder:text-[var(--text-muted)]"
                />
              </div>
              <button
                onClick={() => clearRawLog()}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[var(--hover-bg)] hover:bg-rose-500/20 text-xs text-[var(--text-muted)] hover:text-rose-400 border border-[var(--border-subtle)] transition-colors cursor-pointer shrink-0"
                title="Clear raw compilation log"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-2 bg-[var(--surface-editor)] border border-[var(--border-subtle)] rounded text-[11px] leading-relaxed text-zinc-300 whitespace-pre font-mono">
              {filteredRawLog || 'No compilation output recorded yet.'}
            </pre>
          </div>
        )}

        {activeLogTab === 'appLogs' && (
          <div className="h-full flex flex-col space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 flex-1">
                <div className="flex items-center space-x-1.5 px-2 py-1 bg-[var(--surface-app)] border border-[var(--border-subtle)] rounded flex-1">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <input
                    type="text"
                    placeholder="Search application & crash logs..."
                    value={appLogSearchFilter}
                    onChange={(e) => setAppLogSearchFilter(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] w-full font-mono placeholder:text-[var(--text-muted)]"
                  />
                </div>
                <select
                  value={appLogLevelFilter}
                  onChange={(e) => setAppLogLevelFilter(e.target.value as LogLevel | 'ALL')}
                  aria-label="Filter logs by level"
                  className="px-2 py-1 rounded bg-[var(--surface-app)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">ALL LEVELS</option>
                  <option value="CRASH">CRASH</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => openLogFile()}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-sans transition-colors cursor-pointer"
                  title={`Open persistent log file: ${logFilePath || 'leafforge.log'}`}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                  <span>Open Log File</span>
                </button>
                <button
                  onClick={() => clearAppLogs()}
                  className="flex items-center space-x-1 px-2 py-1 rounded bg-[var(--hover-bg)] hover:bg-rose-500/20 text-xs text-[var(--text-muted)] hover:text-rose-400 border border-[var(--border-subtle)] font-sans transition-colors cursor-pointer"
                  title="Clear memory and disk logs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[var(--surface-editor)] border border-[var(--border-subtle)] rounded p-2 space-y-1 font-mono text-[11px]">
              {filteredAppLogs.length === 0 ? (
                <div className="text-[var(--text-muted)] text-center py-6">
                  No matching application logs recorded yet.
                </div>
              ) : (
                filteredAppLogs.map((entry: LogEntry, idx: number) => {
                  const isCrash = entry.level === 'CRASH';
                  const isError = entry.level === 'ERROR';
                  const isWarn = entry.level === 'WARN';
                  const isInfo = entry.level === 'INFO';

                  const badgeColor = isCrash
                    ? 'bg-rose-600/30 text-rose-300 border-rose-500/50'
                    : isError
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : isWarn
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : isInfo
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                          : 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30';

                  return (
                    <div
                      key={idx}
                      className={`p-1.5 rounded border transition-colors ${
                        isCrash || isError
                          ? 'bg-rose-500/5 border-rose-500/20 text-rose-200'
                          : 'bg-[var(--canvas)]/40 border-transparent hover:border-[var(--border-subtle)] text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2 text-[10px]">
                        <span className="text-zinc-500">
                          {entry.timestamp.includes('T')
                            ? entry.timestamp.split('T')[1]?.slice(0, 12)
                            : entry.timestamp}
                        </span>
                        <span className={`px-1 rounded text-[9px] font-bold border ${badgeColor}`}>
                          {entry.level}
                        </span>
                        <span className="text-accent-primary font-semibold">[{entry.target}]</span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap select-text">{entry.message}</div>
                      {entry.details && (
                        <pre className="mt-1 p-1.5 bg-black/40 rounded text-[10px] text-zinc-400 whitespace-pre-wrap overflow-x-auto select-text border border-white/5">
                          {entry.details}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
