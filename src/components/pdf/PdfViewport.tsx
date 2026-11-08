import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { useCompilerStore } from '../../store/useCompilerStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { synctexForward, synctexInverse } from '../../services/tauriClient';
import { SyncTexOverlay } from './SyncTexOverlay';
import type { SyncTexCoordinate } from '../../types/latex';

// Set up PDF.js worker
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // In test / non-vite environments, fallback gracefully
  }
}

export interface PdfViewportProps {
  className?: string;
  isDetached?: boolean;
}

export const PdfViewport: React.FC<PdfViewportProps> = ({ className, isDetached }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);

  const [activeBuffer, setActiveBuffer] = useState<'A' | 'B'>('A');
  const [scale, setScale] = useState<number>(1.0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(1);
  const [pageWidth, setPageWidth] = useState<number>(612);
  const [pageHeight, setPageHeight] = useState<number>(792);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [syncCoordinate, setSyncCoordinate] = useState<SyncTexCoordinate | null>(null);

  const pdfPath = useCompilerStore((s) => s.pdfPath);
  const compilerStatus = useCompilerStore((s) => s.status);
  const runCompile = useCompilerStore((s) => s.runCompile);

  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const rootTexFile = useWorkspaceStore((s) => s.rootTexFile) || 'main.tex';
  const openFile = useWorkspaceStore((s) => s.openFile);
  const setEditorJumpTarget = useWorkspaceStore((s) => s.setEditorJumpTarget);

  const activeDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Render a specific page into the target buffer canvas
  const renderPageIntoBuffer = useCallback(
    async (
      doc: pdfjsLib.PDFDocumentProxy,
      pageNumber: number,
      targetBuffer: 'A' | 'B',
      zoomScale: number
    ) => {
      const canvas = targetBuffer === 'A' ? canvasARef.current : canvasBRef.current;
      if (!canvas) return;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel error
        }
      }

      setIsRendering(true);
      try {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: zoomScale });

        setPageWidth(viewport.width);
        setPageHeight(viewport.height);

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvas,
          canvasContext: ctx,
          viewport: viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;

        // Atomically swap buffer on requestAnimationFrame for zero-flicker presentation
        requestAnimationFrame(() => {
          setActiveBuffer(targetBuffer);
          setIsRendering(false);
        });
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('PDF rendering error:', err);
        }
        setIsRendering(false);
      }
    },
    []
  );

  // Render mock fallback canvas if no PDF available
  const renderMockPdf = useCallback(
    (targetBuffer: 'A' | 'B', zoomScale: number) => {
      const canvas = targetBuffer === 'A' ? canvasARef.current : canvasBRef.current;
      if (!canvas) return;

      const baseW = 595;
      const baseH = 842;
      const w = baseW * zoomScale;
      const h = baseH * zoomScale;

      setPageWidth(w);
      setPageHeight(h);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // White paper page background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Subtle drop shadow / paper boundary
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, w, h);

      // Mock PDF title & typography
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${Math.round(18 * zoomScale)}px serif`;
      ctx.fillText('LeafForge — Autonomous LaTeX Document', 50 * zoomScale, 80 * zoomScale);

      ctx.fillStyle = '#475569';
      ctx.font = `${Math.round(10 * zoomScale)}px serif`;
      ctx.fillText(
        `Generated with ${useCompilerStore.getState().engine} • Ready for forward & inverse SyncTeX`,
        50 * zoomScale,
        105 * zoomScale
      );

      // Decorative text lines mimicking paper
      ctx.fillStyle = '#334155';
      ctx.font = `${Math.round(11 * zoomScale)}px serif`;
      const paragraphs = [
        '1. Introduction and Architecture Overview',
        'LeafForge provides a production-grade local-first desktop IDE for academic and scientific writing.',
        'With embedded Tectonic compilation and native SyncTeX indexing, bidirectional cursor mapping is instantaneous.',
        'Mathematical precision is guaranteed through sub-second incremental preamble caches.',
      ];

      let yPos = 150 * zoomScale;
      for (const line of paragraphs) {
        ctx.fillText(line, 50 * zoomScale, yPos);
        yPos += 24 * zoomScale;
      }

      requestAnimationFrame(() => {
        setActiveBuffer(targetBuffer);
      });
    },
    []
  );

  // Load PDF file when pdfPath changes or recompile completes
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      const nextBuffer = activeBuffer === 'A' ? 'B' : 'A';

      if (!pdfPath) {
        renderMockPdf(nextBuffer, scale);
        return;
      }

      try {
        // Load PDF bytes via fetch or tauri URL
        const loadingTask = pdfjsLib.getDocument({ url: pdfPath });
        const doc = await loadingTask.promise;

        if (cancelled) return;

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

        await renderPageIntoBuffer(doc, validPage, nextBuffer, scale);
      } catch (e) {
        console.warn('PDF.js failed to load real file, falling back to clean render canvas:', e);
        if (!cancelled) {
          renderMockPdf(nextBuffer, scale);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [pdfPath, currentPage, scale]);

  // Handle Forward SyncTeX Events (Cmd/Ctrl+Click from Editor)
  useEffect(() => {
    const handleForwardSync = async (e: Event) => {
      const customEv = e as CustomEvent<{ filePath?: string; line: number; column: number }>;
      const { filePath, line, column } = customEv.detail;

      if (!workspacePath) return;

      const targetFile = filePath || rootTexFile;
      try {
        const coord = await synctexForward(workspacePath, rootTexFile, targetFile, line, column);
        if (coord) {
          setSyncCoordinate(coord);
          if (coord.page !== currentPage && coord.page <= numPages) {
            setCurrentPage(coord.page);
          }

          // Smoothly scroll container to coordinate position
          if (containerRef.current) {
            const targetY = coord.y * scale - 100;
            containerRef.current.scrollTo({
              top: Math.max(0, targetY),
              behavior: 'smooth',
            });
          }
        }
      } catch (err) {
        console.error('Forward SyncTeX error:', err);
      }
    };

    window.addEventListener('leafforge:synctex-forward', handleForwardSync);
    return () => {
      window.removeEventListener('leafforge:synctex-forward', handleForwardSync);
    };
  }, [workspacePath, rootTexFile, currentPage, numPages, scale]);

  // Handle Inverse SyncTeX (Cmd/Ctrl+Click inside PDF canvas)
  const handleCanvasClick = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Convert from screen px to PDF pt (72 dpi)
    const xPt = clickX / scale;
    const yPt = clickY / scale;

    if (!workspacePath) return;

    try {
      const result = await synctexInverse(workspacePath, rootTexFile, currentPage, xPt, yPt);
      if (result) {
        openFile(result.file);
        setEditorJumpTarget({ line: result.line, col: result.column });
      }
    } catch (err) {
      console.error('Inverse SyncTeX query failed:', err);
    }
  };

  // Zoom helpers
  const handleZoomIn = () => setScale((s) => Math.min(3.0, Number((s + 0.15).toFixed(2))));
  const handleZoomOut = () => setScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))));
  const handleFitWidth = () => {
    if (containerRef.current) {
      const availWidth = containerRef.current.clientWidth - 48;
      const newScale = Math.max(0.4, Math.min(2.5, Number((availWidth / 595).toFixed(2))));
      setScale(newScale);
    }
  };
  const handleFitPage = () => {
    if (containerRef.current) {
      const availHeight = containerRef.current.clientHeight - 64;
      const newScale = Math.max(0.4, Math.min(2.5, Number((availHeight / 842).toFixed(2))));
      setScale(newScale);
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-[var(--canvas)] select-none overflow-hidden ${
        className ?? ''
      }`}
      data-testid="pdf-viewport"
    >
      {/* Top Controls Toolbar */}
      <div className="h-9 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 text-xs z-10 shrink-0">
        {/* Page navigation */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mr-1">
            PDF Preview
          </span>
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

        {/* Zoom & Fit Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-[var(--text-muted)] min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3 bg-[var(--border-subtle)] mx-1" />
          <button
            onClick={handleFitWidth}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Fit Width"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFitPage}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Fit Page"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Compile trigger & Pop-out button */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => runCompile()}
            disabled={compilerStatus === 'compiling'}
            className="p-1 rounded text-[var(--text-muted)] hover:text-accent-primary hover:bg-[var(--border-subtle)]"
            title="Recompile Document (Cmd/Ctrl+Enter)"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${compilerStatus === 'compiling' ? 'animate-spin text-accent-primary' : ''}`}
            />
          </button>
          {!isDetached && (
            <button
              onClick={() => {
                window.open(window.location.href, '_blank', 'width=900,height=1000');
              }}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
              title="Pop out PDF to separate window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main PDF Scroll Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex justify-center items-start bg-[#181a1f]/80 relative"
      >
        <div
          className="relative shadow-2xl bg-white border border-black/20 rounded transition-transform"
          style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
        >
          {/* Buffer A Canvas */}
          <canvas
            ref={canvasARef}
            onClick={handleCanvasClick}
            className={`absolute top-0 left-0 transition-opacity duration-150 cursor-crosshair ${
              activeBuffer === 'A' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          />

          {/* Buffer B Canvas (Double-buffer) */}
          <canvas
            ref={canvasBRef}
            onClick={handleCanvasClick}
            className={`absolute top-0 left-0 transition-opacity duration-150 cursor-crosshair ${
              activeBuffer === 'B' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          />

          {/* SyncTeX Amber Highlight Pulse Overlay */}
          <SyncTexOverlay
            coordinate={syncCoordinate}
            scale={scale}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
          />
        </div>
      </div>

      {/* Subtle Hint Bar */}
      <div className="h-5 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] px-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <div className="flex items-center space-x-2">
          <span>⇄ Cmd/Ctrl+Click canvas to jump to LaTeX source</span>
          {isRendering && <span className="text-accent-primary">● Rendering...</span>}
        </div>
        <div className="flex items-center space-x-1 font-mono">
          <FileText className="w-3 h-3" />
          <span>{rootTexFile.replace(/\.tex$/, '.pdf')}</span>
        </div>
      </div>
    </div>
  );
};
