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
  Download,
  Eye,
  FolderOpen,
} from 'lucide-react';
import { useCompilerStore } from '../../store/useCompilerStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  readFileBinary,
  readFileText,
  synctexForward,
  synctexInverse,
  revealInExplorer,
  cleanPath,
  savePdfAs,
  openInDefaultApp,
  openDetachedPdfWindow,
  isTauriEnvironment,
} from '../../services/tauriClient';
import { SyncTexOverlay } from './SyncTexOverlay';
import { formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';
import type { SyncTexCoordinate } from '../../types/latex';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';

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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clickX: number;
    clickY: number;
  } | null>(null);

  const pdfPath = useCompilerStore((s) => s.pdfPath);
  const compilerStatus = useCompilerStore((s) => s.status);
  const runCompile = useCompilerStore((s) => s.runCompile);
  const compileNonce = useCompilerStore((s) => s.compileNonce);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [hasValidPdf, setHasValidPdf] = useState<boolean>(false);

  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const rootTexFile = useWorkspaceStore((s) => s.rootTexFile) || 'main.tex';
  const openFile = useWorkspaceStore((s) => s.openFile);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
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

        // Render at at least 2.0x resolution for ultra-sharp vectors, fonts and formulas
        const dpr = window.devicePixelRatio || 1;
        const outputScale = Math.max(dpr, 2.0);

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = [outputScale, 0, 0, outputScale, 0, 0];

        const renderContext = {
          canvas,
          canvasContext: ctx,
          transform,
          viewport,
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
          logger.error('PDF', 'PDF page rendering error', { error: formatErrorDetails(err) });
        }
        setIsRendering(false);
      }
    },
    []
  );

  // Load PDF file when pdfPath changes or recompile completes
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      const nextBuffer = activeBuffer === 'A' ? 'B' : 'A';

      if (!pdfPath) {
        setHasValidPdf(false);
        return;
      }

      const cleanPdfPath = cleanPath(pdfPath);

      try {
        let loadingTask: pdfjsLib.PDFDocumentLoadingTask;

        // Directly read raw binary bytes from disk to prevent URL parsing errors
        let binaryBytes: Uint8Array | null = null;
        try {
          binaryBytes = await readFileBinary(cleanPdfPath);
        } catch {
          // Fallback if binary direct read is unavailable
        }

        if (cancelled) return;

        if (binaryBytes && binaryBytes.length > 0) {
          loadingTask = pdfjsLib.getDocument({ data: binaryBytes });
        } else {
          loadingTask = pdfjsLib.getDocument({ url: cleanPdfPath });
        }

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
        if (!cancelled) {
          setHasValidPdf(true);
        }
      } catch (e) {
        logger.debug('PDF', 'PDF loading failed or document unavailable', {
          error: formatErrorDetails(e),
        });
        if (!cancelled) {
          setHasValidPdf(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [pdfPath, compileNonce, currentPage, scale]);

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
        logger.warn('SyncTeX', 'Forward SyncTeX query failed', {
          error: formatErrorDetails(err),
          targetFile,
          line,
          column,
        });
      }
    };

    window.addEventListener('leafforge:synctex-forward', handleForwardSync);
    return () => {
      window.removeEventListener('leafforge:synctex-forward', handleForwardSync);
    };
  }, [workspacePath, rootTexFile, currentPage, numPages, scale]);

  // Handle Inverse SyncTeX (Double-click or Cmd/Ctrl+Click inside PDF canvas)
  const triggerInverseSync = async (clientX: number, clientY: number) => {
    const canvas = activeBuffer === 'A' ? canvasARef.current : canvasBRef.current;
    if (!canvas || !workspacePath) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // Convert from screen px to PDF pt (72 dpi)
    const xPt = clickX / scale;
    const yPt = clickY / scale;

    try {
      const result = await synctexInverse(workspacePath, rootTexFile, currentPage, xPt, yPt);
      if (result) {
        let targetFile = result.file;
        const normWork = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
        if (!targetFile.startsWith('/') && !targetFile.includes(':')) {
          const cleanRel = targetFile.replace(/^[./\\]+/, '');
          targetFile = `${normWork}/${cleanRel}`;
        }

        const state = useWorkspaceStore.getState();
        let content = state.fileContents[targetFile];
        if (content === undefined) {
          try {
            content = await readFileText(targetFile);
          } catch {
            content = '';
          }
        }

        openFile(targetFile, content);
        setActiveFile(targetFile);

        // Jump cursor and scroll to line & column
        setTimeout(() => {
          setEditorJumpTarget({ line: result.line, col: result.column });
        }, 30);

        logger.info('SyncTeX', `Inverse SyncTeX jumped to: ${targetFile}:${result.line}:${result.column}`);
      }
    } catch (err) {
      logger.warn('SyncTeX', 'Inverse SyncTeX query failed', {
        error: formatErrorDetails(err),
        currentPage,
        xPt,
        yPt,
      });
    }
  };

  const handleCanvasClick = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      triggerInverseSync(event.clientX, event.clientY);
    }
  };

  const handleCanvasDoubleClick = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    triggerInverseSync(event.clientX, event.clientY);
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];

    return [
      {
        label: 'Jump to LaTeX Source',
        icon: FileText,
        shortcut: 'Double-Click / Ctrl+Click',
        action: () => triggerInverseSync(contextMenu.clickX, contextMenu.clickY),
      },
      { divider: true },
      {
        label: 'Zoom In',
        icon: ZoomIn,
        action: handleZoomIn,
      },
      {
        label: 'Zoom Out',
        icon: ZoomOut,
        action: handleZoomOut,
      },
      {
        label: 'Reset Zoom (100%)',
        action: () => setScale(1.0),
      },
      {
        label: 'Fit to Width',
        icon: Maximize2,
        action: handleFitWidth,
      },
      {
        label: 'Fit to Page',
        icon: Minimize2,
        action: handleFitPage,
      },
      { divider: true },
      {
        label: 'Recompile TeX',
        icon: RefreshCw,
        shortcut: 'Ctrl+B',
        action: () => runCompile(),
      },
      ...(pdfPath
        ? [
            {
              label: 'Download PDF',
              icon: Download,
              action: () => handleDownloadPdf(),
            },
            {
              label: 'Open in System Viewer',
              icon: ExternalLink,
              action: () => handleOpenExternal(),
            },
            {
              label: 'Reveal PDF in File Explorer',
              icon: FolderOpen,
              action: () => revealInExplorer(pdfPath),
            },
          ]
        : []),
    ];
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

  // Save / Download PDF file via native system dialog
  const handleDownloadPdf = async () => {
    if (!pdfPath) return;
    setDownloading(true);
    try {
      const fileName = cleanPath(pdfPath).split(/[/\\]/).pop() || 'document.pdf';
      const savedPath = await savePdfAs(pdfPath, fileName);
      if (savedPath) {
        logger.info('PDF', `Successfully exported PDF to: ${savedPath}`);
        return;
      }
      if (savedPath === null && isTauriEnvironment()) {
        // User cancelled save file dialog
        return;
      }

      // Browser fallback
      let bytes: Uint8Array;
      try {
        bytes = await readFileBinary(cleanPath(pdfPath));
      } catch {
        const resp = await fetch(cleanPath(pdfPath));
        const buf = await resp.arrayBuffer();
        bytes = new Uint8Array(buf);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('PDF', 'Failed to download PDF', { error: formatErrorDetails(err) });
    } finally {
      setDownloading(false);
    }
  };

  // Open PDF in default system desktop application
  const handleOpenExternal = async () => {
    if (!pdfPath) return;
    const cleanPdfPath = cleanPath(pdfPath);
    try {
      await openInDefaultApp(cleanPdfPath);
      logger.info('PDF', `Opened PDF in default system application: ${cleanPdfPath}`);
    } catch (err) {
      logger.error('PDF', 'Failed to open PDF externally', { error: formatErrorDetails(err) });
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
            disabled={!hasValidPdf || currentPage <= 1}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] disabled:opacity-30"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] text-[var(--text-primary)]">
            {hasValidPdf ? `${currentPage} / ${numPages}` : '- / -'}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={!hasValidPdf || currentPage >= numPages}
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

        {/* Actions: Recompile, Download, System Viewer, Pop-out */}
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
          <button
            onClick={handleDownloadPdf}
            disabled={!pdfPath || downloading}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] disabled:opacity-30"
            title="Save / Download PDF"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {pdfPath && (
            <button
              onClick={handleOpenExternal}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
              title="Open in System Default PDF Viewer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {!isDetached && (
            <button
              onClick={async () => {
                try {
                  await openDetachedPdfWindow();
                } catch (e) {
                  logger.error('PDF', 'Failed to open detached PDF window', { error: formatErrorDetails(e) });
                }
              }}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
              title="Pop out PDF to separate window"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main PDF Scroll Canvas Container */}
      <div
        ref={containerRef}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            clickX: e.clientX,
            clickY: e.clientY,
          });
        }}
        className="flex-1 overflow-auto p-4 flex justify-center items-center bg-[#181a1f]/80 relative"
      >
        {!pdfPath || !hasValidPdf ? (
          <div className="flex flex-col items-center justify-center text-center p-8 select-none my-auto">
            <div className="w-12 h-12 rounded-full bg-[var(--surface-editor)] border border-[var(--border-subtle)] flex items-center justify-center mb-3 text-[var(--text-muted)]">
              <FileText className="w-6 h-6 opacity-60" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">No Preview available</p>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-[260px]">
              Compile your document to generate and preview the rendered PDF output.
            </p>
          </div>
        ) : (
          <div
            className="relative shadow-2xl bg-white border border-black/20 rounded transition-transform my-auto"
            style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
          >
            {/* Buffer A Canvas */}
            <canvas
              ref={canvasARef}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              title="Double-click or Ctrl+Click to jump to LaTeX source"
              className={`absolute top-0 left-0 transition-opacity duration-150 cursor-pointer ${
                activeBuffer === 'A' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
            />

            {/* Buffer B Canvas (Double-buffer) */}
            <canvas
              ref={canvasBRef}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              title="Double-click or Ctrl+Click to jump to LaTeX source"
              className={`absolute top-0 left-0 transition-opacity duration-150 cursor-pointer ${
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
        )}
      </div>

      {/* Subtle Hint Bar */}
      <div className="h-5 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] px-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <div className="flex items-center space-x-2">
          <span>⇄ Double-click or Ctrl+Click canvas to jump to LaTeX source</span>
          {isRendering && <span className="text-accent-primary">● Rendering...</span>}
        </div>
        <div className="flex items-center space-x-1 font-mono">
          <FileText className="w-3 h-3" />
          <span>{rootTexFile.replace(/\.tex$/, '.pdf')}</span>
        </div>
      </div>

      {/* PDF Viewport Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
