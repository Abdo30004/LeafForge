import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useCompilerStore } from '../store/useCompilerStore';
import {
  compileDocument,
  detectEngines,
  synctexForward,
  synctexInverse,
  listSystemFonts,
  listFontFamilies,
  cleanAuxFiles,
} from '../services/tauriClient';
import { PackageFontPanel } from '../components/sidebar/PackageFontPanel';
import { BuildLogDrawer } from '../components/diagnostics/BuildLogDrawer';
import { SyncTexOverlay } from '../components/pdf/SyncTexOverlay';
import { PdfViewport } from '../components/pdf/PdfViewport';

describe('Phase 3 Multi-Engine Compiler & SyncTeX Telemetry', () => {
  it('manages compiler state, engine switching, and preamble caching', () => {
    const store = useCompilerStore.getState();

    // Default engine
    expect(store.engine).toBe('tectonic');
    expect(store.usePreambleCache).toBe(true);

    // Switch engine
    store.setEngine('lualatex');
    expect(useCompilerStore.getState().engine).toBe('lualatex');

    store.setEngine('xelatex');
    expect(useCompilerStore.getState().engine).toBe('xelatex');

    store.setEngine('pdflatex');
    expect(useCompilerStore.getState().engine).toBe('pdflatex');

    // Toggle preamble cache
    store.setUsePreambleCache(false);
    expect(useCompilerStore.getState().usePreambleCache).toBe(false);
    store.setUsePreambleCache(true);
    expect(useCompilerStore.getState().usePreambleCache).toBe(true);
  });

  it('updates build results and handles status transitions with diagnostics', () => {
    const store = useCompilerStore.getState();

    // 1. Success with 0 diagnostics
    store.setBuildResult(120, [], 'Compilation completed with 0 errors', '/path/main.pdf', '/path/main.synctex.gz');
    expect(useCompilerStore.getState().status).toBe('success');
    expect(useCompilerStore.getState().lastBuildDurationMs).toBe(120);
    expect(useCompilerStore.getState().pdfPath).toBe('/path/main.pdf');
    expect(useCompilerStore.getState().synctexPath).toBe('/path/main.synctex.gz');

    // 2. Warning diagnostic
    store.setBuildResult(
      180,
      [
        {
          filePath: 'main.tex',
          line: 42,
          column: 1,
          severity: 'warning',
          message: 'Overfull \\hbox (15.2pt too wide)',
        },
      ],
      'Warning log output'
    );
    expect(useCompilerStore.getState().status).toBe('warning');

    // 3. Error diagnostic
    store.setBuildResult(
      95,
      [
        {
          filePath: 'sections/intro.tex',
          line: 18,
          column: 1,
          severity: 'error',
          message: 'Undefined control sequence \\badmacro',
        },
      ],
      'Error log output'
    );
    expect(useCompilerStore.getState().status).toBe('error');
    expect(useCompilerStore.getState().diagnostics.length).toBe(1);
    expect(useCompilerStore.getState().diagnostics[0]?.filePath).toBe('sections/intro.tex');
  });

  it('manages BuildLogDrawer visibility and active tabs', () => {
    const store = useCompilerStore.getState();
    expect(store.logDrawerOpen).toBe(false);

    store.toggleLogDrawer();
    expect(useCompilerStore.getState().logDrawerOpen).toBe(true);

    store.setActiveLogTab('warnings');
    expect(useCompilerStore.getState().activeLogTab).toBe('warnings');

    store.setActiveLogTab('raw');
    expect(useCompilerStore.getState().activeLogTab).toBe('raw');

    store.setLogDrawerOpen(false);
    expect(useCompilerStore.getState().logDrawerOpen).toBe(false);
  });

  it('verifies client bridges for compiler, synctex, and fonts in browser/test mode', async () => {
    // 1. Compiler bridge
    const compResult = await compileDocument('/workspace', 'main.tex', 'tectonic', true);
    expect(compResult.success).toBe(true);
    expect(compResult.engine).toBe('tectonic');
    expect(compResult.pdfPath).toContain('main.pdf');

    // 2. Engine detection
    const engines = await detectEngines();
    expect(engines.length).toBeGreaterThanOrEqual(4);
    expect(engines.some((e) => e.engine === 'tectonic')).toBe(true);
    expect(engines.some((e) => e.engine === 'lualatex')).toBe(true);

    // 3. SyncTeX Forward & Inverse
    const forwardCoord = await synctexForward('/workspace', 'main.tex', 'main.tex', 5, 1);
    expect(forwardCoord).not.toBeNull();
    expect(forwardCoord?.page).toBe(1);
    expect(forwardCoord?.x).toBeGreaterThan(0);

    const inverseTarget = await synctexInverse('/workspace', 'main.tex', 1, 72, 150);
    expect(inverseTarget).not.toBeNull();
    expect(inverseTarget?.file).toBe('main.tex');

    // 4. Clean Aux
    const cleaned = await cleanAuxFiles('/workspace', 'main.tex');
    expect(Array.isArray(cleaned)).toBe(true);

    // 5. System Fonts
    const fonts = await listSystemFonts();
    expect(fonts.length).toBeGreaterThan(0);

    const families = await listFontFamilies();
    expect(families.length).toBeGreaterThan(0);
  });

  it('renders PackageFontPanel with engines, preamble cache, CTAN cache, and fonts', () => {
    const html = renderToString(<PackageFontPanel />);
    expect(html).toContain('Compiler Engine');
    expect(html).toContain('Tectonic (Auto-CTAN)');
    expect(html).toContain('LuaLaTeX');
    expect(html).toContain('XeLaTeX');
    expect(html).toContain('pdfLaTeX');
    expect(html).toContain('Preamble Format Cache');
    expect(html).toContain('Automatic CTAN Package Cache');
    expect(html).toContain('System RTL Fonts');
  });

  it('renders BuildLogDrawer with errors, warnings, and log tabs', () => {
    const testDiags = [
      {
        filePath: 'main.tex',
        line: 12,
        column: 1,
        severity: 'error' as const,
        message: 'Syntax error in equation',
      },
    ];

    const html = renderToString(
      <BuildLogDrawer isOpen={true} diagnostics={testDiags} rawLog="Sample raw TeX output" />
    );
    expect(html).toContain('Errors');
    expect(html).toContain('Warnings');
    expect(html).toContain('Raw Log');
    expect(html).toContain('Syntax error in equation');
    expect(html).toContain('12');
  });

  it('renders SyncTexOverlay at designated coordinate geometry', () => {
    const coord = { page: 1, x: 100, y: 250, width: 180, height: 20 };
    const html = renderToString(
      <SyncTexOverlay coordinate={coord} scale={1.5} pageWidth={612} pageHeight={792} />
    );
    expect(html).toContain('synctex-highlight-overlay');
    expect(html).toContain('left:150px');
    expect(html).toContain('top:375px');
    expect(html).toContain('width:270px');
  });

  it('renders double-buffered PdfViewport with navigation, zoom, and SyncTeX canvas', () => {
    const html = renderToString(<PdfViewport />);
    expect(html).toContain('pdf-viewport');
    expect(html).toContain('PDF Preview');
    expect(html).toContain('No Preview available');
    expect(html).toContain('Cmd/Ctrl+Click canvas to jump to LaTeX source');
  });
});
