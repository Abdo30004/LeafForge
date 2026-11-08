import { describe, it, expect, beforeEach } from 'vitest';
import { useCompilerStore } from '../store/useCompilerStore';
import type { SyncTexCoordinate, SyncTexInverseResult } from '../types/latex';

describe('SyncTeX Two-Way Coordinate Mapping Test Suite', () => {
  beforeEach(() => {
    useCompilerStore.setState({
      activeSyncTarget: null,
      pdfPath: '/mock/workspace/main.pdf',
      synctexPath: '/mock/workspace/main.synctex.gz',
    });
  });

  describe('Scaled Point (sp) to PDF Point (pt) Conversions', () => {
    const SP_PER_PT = 65536.0;
    const PT_TO_PDF_PT = 72.0 / 72.27; // PostScript 72 dpi vs TeX 72.27 pt

    function spToPdfPt(sp: number): number {
      return (sp / SP_PER_PT) * PT_TO_PDF_PT;
    }

    it('accurately converts 65536 sp to ~0.99626 PDF points', () => {
      const pt = spToPdfPt(65536);
      expect(pt).toBeCloseTo(0.99626, 4);
    });

    it('accurately converts large coordinate offsets (10 inches in sp)', () => {
      // 10 inches = 720 bp = 722.7 pt = 47,362,867.2 sp
      const tenInchesSp = 10 * 72.27 * 65536;
      const pdfPoints = spToPdfPt(tenInchesSp);
      expect(pdfPoints).toBeCloseTo(720.0, 2);
    });
  });

  describe('Forward Search Coordinate Resolution', () => {
    interface MockSyncRecord {
      fileTag: number;
      line: number;
      col: number;
      page: number;
      xPt: number;
      yPt: number;
      widthPt: number;
      heightPt: number;
    }

    const inputMap = new Map<number, string>([
      [1, 'main.tex'],
      [2, 'sections/intro.tex'],
      [3, 'sections/methods.tex'],
    ]);

    const records: MockSyncRecord[] = [
      { fileTag: 1, line: 10, col: 1, page: 1, xPt: 72.0, yPt: 150.0, widthPt: 450.0, heightPt: 14.0 },
      { fileTag: 1, line: 25, col: 1, page: 1, xPt: 72.0, yPt: 280.0, widthPt: 450.0, heightPt: 24.0 },
      { fileTag: 2, line: 15, col: 1, page: 2, xPt: 72.0, yPt: 120.0, widthPt: 450.0, heightPt: 14.0 },
      { fileTag: 3, line: 30, col: 1, page: 2, xPt: 72.0, yPt: 350.0, widthPt: 450.0, heightPt: 18.0 },
    ];

    function forwardSearch(file: string, line: number): SyncTexCoordinate | null {
      // Find matching tag
      let tag: number | null = null;
      for (const [t, path] of inputMap.entries()) {
        if (path === file) {
          tag = t;
          break;
        }
      }
      if (tag === null) return null;

      // Exact match or closest line
      let closest: MockSyncRecord | null = null;
      let minLineDelta = Infinity;

      for (const r of records) {
        if (r.fileTag === tag) {
          const delta = Math.abs(r.line - line);
          if (delta < minLineDelta) {
            minLineDelta = delta;
            closest = r;
          }
        }
      }

      if (!closest) return null;
      return {
        page: closest.page,
        x: closest.xPt,
        y: closest.yPt,
        width: closest.widthPt,
        height: closest.heightPt,
      };
    }

    it('resolves exact line in root document to page 1 coordinates', () => {
      const coord = forwardSearch('main.tex', 10);
      expect(coord).not.toBeNull();
      expect(coord?.page).toBe(1);
      expect(coord?.x).toBe(72.0);
      expect(coord?.y).toBe(150.0);
      expect(coord?.height).toBe(14.0);
    });

    it('resolves included file sections/intro.tex to page 2 coordinates', () => {
      const coord = forwardSearch('sections/intro.tex', 15);
      expect(coord).not.toBeNull();
      expect(coord?.page).toBe(2);
      expect(coord?.y).toBe(120.0);
    });

    it('falls back to nearest line when exact line lacks sync anchor', () => {
      // Line 12 does not exist, should fall back to line 10
      const coord = forwardSearch('main.tex', 12);
      expect(coord).not.toBeNull();
      expect(coord?.y).toBe(150.0);
    });

    it('returns null when querying unindexed file', () => {
      const coord = forwardSearch('unknown_chapter.tex', 1);
      expect(coord).toBeNull();
    });
  });

  describe('Inverse Search (Nearest-Neighbor Euclidean Lookup)', () => {
    interface MockSyncRecord {
      fileTag: number;
      line: number;
      col: number;
      page: number;
      xPt: number;
      yPt: number;
    }

    const inputMap = new Map<number, string>([
      [1, 'main.tex'],
      [2, 'sections/intro.tex'],
    ]);

    const records: MockSyncRecord[] = [
      { fileTag: 1, line: 5, col: 1, page: 1, xPt: 100.0, yPt: 200.0 },
      { fileTag: 1, line: 15, col: 1, page: 1, xPt: 100.0, yPt: 350.0 },
      { fileTag: 2, line: 8, col: 1, page: 2, xPt: 100.0, yPt: 150.0 },
      { fileTag: 2, line: 20, col: 1, page: 2, xPt: 100.0, yPt: 400.0 },
    ];

    function inverseSearch(page: number, x: number, y: number): SyncTexInverseResult | null {
      let closest: MockSyncRecord | null = null;
      let minDistanceSq = Infinity;

      for (const r of records) {
        if (r.page === page) {
          const dx = r.xPt - x;
          const dy = r.yPt - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closest = r;
          }
        }
      }

      if (!closest) return null;
      return {
        file: inputMap.get(closest.fileTag) ?? 'main.tex',
        line: closest.line,
        column: closest.col,
      };
    }

    it('maps clicked point near (102, 203) on page 1 to main.tex line 5', () => {
      const inv = inverseSearch(1, 102.0, 203.0);
      expect(inv).not.toBeNull();
      expect(inv?.file).toBe('main.tex');
      expect(inv?.line).toBe(5);
    });

    it('maps clicked point near (98, 355) on page 1 to main.tex line 15', () => {
      const inv = inverseSearch(1, 98.0, 355.0);
      expect(inv).not.toBeNull();
      expect(inv?.file).toBe('main.tex');
      expect(inv?.line).toBe(15);
    });

    it('maps clicked point on page 2 to sections/intro.tex', () => {
      const inv = inverseSearch(2, 105.0, 395.0);
      expect(inv).not.toBeNull();
      expect(inv?.file).toBe('sections/intro.tex');
      expect(inv?.line).toBe(20);
    });

    it('returns null if querying a page with no records', () => {
      const inv = inverseSearch(99, 100, 100);
      expect(inv).toBeNull();
    });
  });

  describe('SyncTeX Store Telemetry & Forward Pulse Target', () => {
    it('sets activeSyncTarget in compiler store to trigger amber highlight animation', () => {
      const target: SyncTexCoordinate = {
        page: 1,
        x: 120.5,
        y: 250.0,
        width: 400.0,
        height: 18.0,
      };

      useCompilerStore.getState().setActiveSyncTarget(target);
      expect(useCompilerStore.getState().activeSyncTarget).toEqual(target);

      // Clearing target
      useCompilerStore.getState().setActiveSyncTarget(null);
      expect(useCompilerStore.getState().activeSyncTarget).toBeNull();
    });
  });
});
