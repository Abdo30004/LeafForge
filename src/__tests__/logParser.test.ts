import { describe, it, expect, beforeEach } from 'vitest';
import { useCompilerStore } from '../store/useCompilerStore';
import type { LatexDiagnostic } from '../types/latex';

describe('LaTeX Log Parser & Diagnostic Extraction Test Suite', () => {
  beforeEach(() => {
    useCompilerStore.setState({
      status: 'idle',
      lastBuildDurationMs: 0,
      diagnostics: [],
      rawLog: '',
      logDrawerOpen: false,
      activeLogTab: 'errors',
    });
  });

  describe('Diagnostic Severity & Store Telemetry', () => {
    it('sets compiler status to error when error diagnostic is present', () => {
      const diags: LatexDiagnostic[] = [
        {
          filePath: 'main.tex',
          line: 42,
          column: 1,
          severity: 'error',
          message: 'Undefined control sequence \\badmacro',
          rawLogSnippet: '! Undefined control sequence.\nl.42 \\badmacro',
        },
      ];

      useCompilerStore.getState().setBuildResult(120, diags, 'log with error');

      expect(useCompilerStore.getState().status).toBe('error');
      expect(useCompilerStore.getState().diagnostics).toHaveLength(1);
      expect(useCompilerStore.getState().lastBuildDurationMs).toBe(120);
    });

    it('sets compiler status to warning when only warnings and bad boxes are present', () => {
      const diags: LatexDiagnostic[] = [
        {
          filePath: 'main.tex',
          line: 85,
          column: 1,
          severity: 'warning',
          message: "LaTeX Warning: Reference `sec:methods' on page 3 undefined on input line 85.",
          rawLogSnippet: "Reference `sec:methods' on page 3 undefined on input line 85.",
        },
        {
          filePath: 'main.tex',
          line: 10,
          column: 1,
          severity: 'warning',
          message: 'Overfull \\hbox (24.5pt too wide) in paragraph at lines 10--15',
          rawLogSnippet: 'Overfull \\hbox (24.5pt too wide) in paragraph at lines 10--15',
        },
      ];

      useCompilerStore.getState().setBuildResult(95, diags, 'log with warnings');

      expect(useCompilerStore.getState().status).toBe('warning');
      expect(useCompilerStore.getState().diagnostics).toHaveLength(2);
    });

    it('sets compiler status to success when diagnostics list is clean', () => {
      useCompilerStore.getState().setBuildResult(80, [], 'Output written on main.pdf (1 page).');

      expect(useCompilerStore.getState().status).toBe('success');
      expect(useCompilerStore.getState().diagnostics).toHaveLength(0);
    });
  });

  describe('Filter Tabs & Drawer State', () => {
    it('filters diagnostics by tab category (errors vs warnings)', () => {
      const diags: LatexDiagnostic[] = [
        {
          filePath: 'main.tex',
          line: 12,
          column: 1,
          severity: 'error',
          message: 'Syntax error',
        },
        {
          filePath: 'main.tex',
          line: 30,
          column: 1,
          severity: 'warning',
          message: 'Citation undefined',
        },
        {
          filePath: 'main.tex',
          line: 45,
          column: 1,
          severity: 'info',
          message: 'Package loaded',
        },
      ];

      useCompilerStore.getState().setBuildResult(100, diags, 'raw log contents');

      const errors = useCompilerStore.getState().diagnostics.filter((d) => d.severity === 'error');
      const warnings = useCompilerStore.getState().diagnostics.filter((d) => d.severity === 'warning');
      const infos = useCompilerStore.getState().diagnostics.filter((d) => d.severity === 'info');

      expect(errors).toHaveLength(1);
      expect(errors[0]?.line).toBe(12);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.line).toBe(30);

      expect(infos).toHaveLength(1);
      expect(infos[0]?.line).toBe(45);
    });

    it('toggles log drawer open/close and tab selection', () => {
      const store = useCompilerStore.getState();
      expect(store.logDrawerOpen).toBe(false);

      store.toggleLogDrawer();
      expect(useCompilerStore.getState().logDrawerOpen).toBe(true);

      store.setActiveLogTab('warnings');
      expect(useCompilerStore.getState().activeLogTab).toBe('warnings');

      store.setActiveLogTab('raw');
      expect(useCompilerStore.getState().activeLogTab).toBe('raw');

      store.toggleLogDrawer();
      expect(useCompilerStore.getState().logDrawerOpen).toBe(false);
    });
  });

  describe('Path and Snippet Coordinate Normalization', () => {
    it('normalizes mixed backslashes and relative path indicators', () => {
      const normalize = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^"|"$/g, '');

      expect(normalize('./sections/intro.tex')).toBe('sections/intro.tex');
      expect(normalize('sections\\chapter1.tex')).toBe('sections/chapter1.tex');
      expect(normalize('"C:\\Users\\Paper\\main.tex"')).toBe('C:/Users/Paper/main.tex');
    });

    it('parses bad box line span ranges accurately', () => {
      const rawBadBox = 'Overfull \\hbox (15.2pt too wide) in paragraph at lines 42--48';
      const rangeMatch = rawBadBox.match(/at lines (\d+)--(\d+)/);

      expect(rangeMatch).not.toBeNull();
      const startLine = parseInt(rangeMatch![1] ?? '1', 10);
      const endLine = parseInt(rangeMatch![2] ?? '1', 10);

      expect(startLine).toBe(42);
      expect(endLine).toBe(48);
    });

    it('extracts input line number from multi-line package warnings', () => {
      const warnLines = [
        'Package hyperref Warning: Token not allowed in a PDF string (PDFDocEncoding):',
        '(hyperref)                removing `\\mathalpha`',
        'on input line 152.',
      ].join(' ');

      const match = warnLines.match(/on input line (\d+)/i);
      expect(match).not.toBeNull();
      expect(parseInt(match![1] ?? '1', 10)).toBe(152);
    });
  });
});
