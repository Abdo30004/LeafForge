import React from 'react';
import { GitBranch, Zap, ArrowLeftRight, Globe } from 'lucide-react';
import { useGitStore } from '../../store/useGitStore';
import { useCompilerStore } from '../../store/useCompilerStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export const StatusBar: React.FC = () => {
  const gitBranch = useGitStore((s) => s.branch);
  const gitAhead = useGitStore((s) => s.ahead);
  const gitBehind = useGitStore((s) => s.behind);

  const compilerEngine = useCompilerStore((s) => s.engine);
  const compilerStatus = useCompilerStore((s) => s.status);
  const lastDuration = useCompilerStore((s) => s.lastBuildDurationMs);

  const cursorPosition = useWorkspaceStore((s) => s.cursorPosition);
  const activeLineIsRtl = useWorkspaceStore((s) => s.activeLineIsRtl);

  return (
    <footer className="h-[24px] bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] px-2.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] select-none shrink-0 z-30 font-mono">
      {/* Left Telemetry */}
      <div className="flex items-center space-x-3">
        {/* Git Branch */}
        <div className="flex items-center space-x-1 hover:text-[var(--text-primary)] cursor-pointer">
          <GitBranch className="w-3 h-3 text-accent-primary" />
          <span className="font-sans font-medium text-[var(--text-primary)]">{gitBranch}</span>
          {(gitAhead > 0 || gitBehind > 0) && (
            <span className="text-[10px] text-accent-primary">
              (↑{gitAhead} ↓{gitBehind})
            </span>
          )}
        </div>

        <div className="h-3 w-[1px] bg-[var(--border-subtle)]" />

        {/* Compiler Status */}
        <div className="flex items-center space-x-1 hover:text-[var(--text-primary)] cursor-pointer">
          <Zap
            className={`w-3 h-3 ${
              compilerStatus === 'compiling'
                ? 'text-amber-400 animate-spin'
                : compilerStatus === 'error'
                  ? 'text-rose-400'
                  : 'text-emerald-400'
            }`}
          />
          <span className="capitalize">{compilerEngine}</span>
          <span>({lastDuration > 0 ? `${lastDuration}ms` : 'Ready'})</span>
        </div>
      </div>

      {/* Right Telemetry */}
      <div className="flex items-center space-x-3">
        {/* SyncTeX Bridge Status */}
        <div className="flex items-center space-x-1 hover:text-[var(--text-primary)]">
          <ArrowLeftRight className="w-3 h-3 text-accent-primary" />
          <span>SyncTeX Ready</span>
        </div>

        <div className="h-3 w-[1px] bg-[var(--border-subtle)]" />

        {/* RTL Detection Mode */}
        <div className="flex items-center space-x-1 hover:text-[var(--text-primary)]">
          <Globe className={`w-3 h-3 ${activeLineIsRtl ? 'text-amber-400' : 'text-sky-400'}`} />
          <span>{activeLineIsRtl ? 'RTL: Active (Arabic/Hebrew)' : 'RTL: Auto (LTR)'}</span>
        </div>

        <div className="h-3 w-[1px] bg-[var(--border-subtle)]" />

        {/* Line / Column */}
        <div className="hover:text-[var(--text-primary)]">
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.col}
          </span>
        </div>

        <div className="h-3 w-[1px] bg-[var(--border-subtle)]" />

        {/* Encoding */}
        <div>
          <span>UTF-8</span>
        </div>
      </div>
    </footer>
  );
};
