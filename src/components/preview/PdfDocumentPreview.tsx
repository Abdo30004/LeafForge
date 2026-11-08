import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { readFileBinary, cleanPath } from '../../services/tauriClient';
import { formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';

interface PdfDocumentPreviewProps {
  filePath: string;
}

export const PdfDocumentPreview: React.FC<PdfDocumentPreviewProps> = ({ filePath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [scale, setScale] = useState<number>(1.0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(1);
  const [pageWidth, setPageWidth] = useState<number>(612);
  const [pageHeight, setPageHeight] = useState<number>(792);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<boolean>(false);

  const activeDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const fileName = filePath.split(/[/\\]/).pop() || 'document.pdf';

  const renderPage = useCallback(
    async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number, zoomScale: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }

      try {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: zoomScale });
        const dpr = window.devicePixelRatio || 1;
        const outputScale = Math.max(dpr, 2.0);

        setPageWidth(viewport.width);
        setPageHeight(viewport.height);

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const transform = [outputScale, 0, 0, outputScale, 0, 0];

        const renderTask = page.render({
          canvas,
          canvasContext: ctx,
          transform,
          viewport,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'RenderingCancelledException') {
          return;
        }
        logger.warn('PDF', 'PDF page rendering warning', { error: formatErrorDetails(err) });
      }
    },
    []
  );

  useEffect(() => {
    let active = true;

    async function loadDocument() {
      setLoadError(null);
      try {
        const bytes = await readFileBinary(filePath);
        if (!active) return;

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        if (!active) return;

        if (activeDocRef.current) {
          try {
            activeDocRef.current.cleanup();
          } catch {
            // ignore
          }
        }
        activeDocRef.current = doc;
        setNumPages(doc.numPages);

        const validPage = Math.min(Math.max(1, currentPage), doc.numPages);
        setCurrentPage(validPage);
        await renderPage(doc, validPage, scale);
      } catch (err) {
        if (!active) return;
        logger.error('PDF', 'Failed to load PDF document', {
          error: formatErrorDetails(err),
          filePath,
        });
        setLoadError('Failed to parse PDF document bytes');
      }
    }

    loadDocument();

    return () => {
      active = false;
    };
  }, [filePath, currentPage, scale, renderPage]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const bytes = await readFileBinary(filePath);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenExternal = async () => {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(cleanPath(filePath));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-[var(--canvas)] select-none overflow-hidden"
      data-testid="pdf-document-preview"
    >
      {/* Top Toolbar */}
      <div className="h-9 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 text-xs shrink-0">
        <div className="flex items-center space-x-2">
          <FileText className="w-3.5 h-3.5 text-rose-400" />
          <span className="font-medium text-[var(--text-primary)] truncate max-w-sm">{fileName}</span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] disabled:opacity-30"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] text-[var(--text-primary)]">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] disabled:opacity-30"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))))}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-[var(--text-muted)] min-w-[36px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3.0, Number((s + 0.15).toFixed(2))))}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3 bg-[var(--border-subtle)] mx-1" />
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Save / Download PDF"
          >
            <Download className="w-3.5 h-3.5" />
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

      {/* Main Canvas Scroll Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex justify-center items-start bg-[#181a1f]/80 relative"
      >
        {loadError ? (
          <div className="flex flex-col items-center space-y-2 text-center p-8">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-sm font-medium text-[var(--text-primary)]">Unable to preview PDF</p>
            <p className="text-xs text-[var(--text-muted)]">{loadError}</p>
          </div>
        ) : (
          <div
            className="relative shadow-2xl bg-white border border-black/20 rounded transition-transform"
            style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
          >
            <canvas ref={canvasRef} className="absolute top-0 left-0" />
          </div>
        )}
      </div>

      {/* Bottom Status */}
      <div className="h-5 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] px-2.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span>PDF Document Preview • {filePath}</span>
        <span>Page {currentPage} of {numPages}</span>
      </div>
    </div>
  );
};
