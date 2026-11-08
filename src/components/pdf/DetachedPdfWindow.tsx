import React from 'react';
import { PdfViewport } from './PdfViewport';

export const DetachedPdfWindow: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-[var(--canvas)] overflow-hidden flex flex-col select-none">
      <div className="h-9 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 text-xs text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-primary)]">LeafForge — PDF Preview</span>
        <span>Independent Monitor Viewport</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <PdfViewport isDetached={true} />
      </div>
    </div>
  );
};
