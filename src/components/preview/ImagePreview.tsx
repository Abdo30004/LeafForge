import React, { useEffect, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Copy,
  Check,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { readFileBinary } from '../../services/tauriClient';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';

interface ImagePreviewProps {
  filePath: string;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ filePath }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const workspacePath = useWorkspaceStore((s) => s.workspacePath);

  const fileName = filePath.split(/[/\\]/).pop() || 'image';

  // Relative path from workspace root for LaTeX \includegraphics
  const getRelativePathForLatex = (): string => {
    if (!workspacePath) return fileName;
    const normWork = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
    const normFile = filePath.replace(/\\/g, '/');
    if (normFile.startsWith(normWork)) {
      return normFile.slice(normWork.length).replace(/^\/+/, '');
    }
    return fileName;
  };

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadImage() {
      setLoadError(null);
      setDimensions(null);
      try {
        const bytes = await readFileBinary(filePath);
        if (!active) return;

        setFileSizeBytes(bytes.length);

        const ext = fileName.split('.').pop()?.toLowerCase();
        const mime =
          ext === 'svg'
            ? 'image/svg+xml'
            : ext === 'png'
            ? 'image/png'
            : ext === 'gif'
            ? 'image/gif'
            : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg';

        const blob = new Blob([bytes], { type: mime });
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (err) {
        if (!active) return;
        logger.error('Preview', 'Failed to load image preview', {
          error: formatErrorDetails(err),
          filePath,
        });
        setLoadError('Failed to load image file from disk');
      }
    }

    loadImage();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [filePath, fileName]);

  const handleCopyLatex = async () => {
    const relPath = getRelativePathForLatex();
    const snippet = `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=\\linewidth]{${relPath}}\n  \\caption{Caption text}\n  \\label{fig:${relPath.replace(/[^a-zA-Z0-9]/g, '_')}}\n\\end{figure}`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleOpenExternal = async () => {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(filePath);
    } catch {
      if (blobUrl) window.open(blobUrl, '_blank');
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      className="flex flex-col h-full bg-[var(--canvas)] select-none overflow-hidden"
      data-testid="image-preview"
    >
      {/* Top Toolbar */}
      <div className="h-9 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 text-xs shrink-0">
        <div className="flex items-center space-x-2">
          <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-medium text-[var(--text-primary)] truncate max-w-xs">{fileName}</span>
          {dimensions && (
            <span className="text-[11px] text-[var(--text-muted)]">
              ({dimensions.width} × {dimensions.height} px
              {fileSizeBytes !== null ? ` • ${formatSize(fileSizeBytes)}` : ''})
            </span>
          )}
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setScale((s) => Math.max(0.2, Number((s - 0.2).toFixed(1))))}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-[var(--text-muted)] min-w-[36px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(4.0, Number((s + 0.2).toFixed(1))))}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setScale(1.0)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Reset Zoom (100%)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3 bg-[var(--border-subtle)] mx-1" />

          <button
            onClick={handleCopyLatex}
            className="px-2 py-1 rounded bg-[var(--border-subtle)] hover:bg-accent-primary hover:text-white transition-colors text-[11px] flex items-center space-x-1"
            title="Copy LaTeX \\includegraphics snippet to clipboard"
          >
            {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedSnippet ? 'Copied LaTeX!' : 'Copy LaTeX'}</span>
          </button>

          <button
            onClick={handleOpenExternal}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Open in System Default Viewer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Image Canvas View */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-[#121316] relative">
        {loadError ? (
          <div className="flex flex-col items-center space-y-2 text-center p-6">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-sm font-medium text-[var(--text-primary)]">Unable to load image</p>
            <p className="text-xs text-[var(--text-muted)]">{loadError}</p>
          </div>
        ) : blobUrl ? (
          <div
            className="relative shadow-xl border border-white/10 rounded overflow-hidden max-w-full max-h-full transition-transform flex items-center justify-center"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #1e2024 25%, transparent 25%), linear-gradient(-45deg, #1e2024 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e2024 75%), linear-gradient(-45deg, transparent 75%, #1e2024 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
          >
            <img
              src={blobUrl}
              alt={fileName}
              onLoad={(e) => {
                const img = e.currentTarget;
                setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                transition: 'transform 0.1s ease-out',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
              className="select-none pointer-events-auto"
            />
          </div>
        ) : (
          <div className="text-xs text-[var(--text-muted)]">Loading image...</div>
        )}
      </div>

      {/* Bottom Hint */}
      <div className="h-5 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] px-2.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span>Image Asset Preview • {filePath}</span>
        <span>Use "Copy LaTeX" to copy figure inclusion macro</span>
      </div>
    </div>
  );
};
