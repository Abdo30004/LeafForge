import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Zap,
  Package,
  Type,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Search,
} from 'lucide-react';
import { useCompilerStore } from '../../store/useCompilerStore';
import { detectEngines, listFontFamilies } from '../../services/tauriClient';
import type { LatexEngine } from '../../types/latex';

export const PackageFontPanel: React.FC = () => {
  const engine = useCompilerStore((s) => s.engine);
  const setEngine = useCompilerStore((s) => s.setEngine);
  const usePreambleCache = useCompilerStore((s) => s.usePreambleCache);
  const setUsePreambleCache = useCompilerStore((s) => s.setUsePreambleCache);
  const availableEngines = useCompilerStore((s) => s.availableEngines);
  const setAvailableEngines = useCompilerStore((s) => s.setAvailableEngines);
  const fontFamilies = useCompilerStore((s) => s.fontFamilies);
  const setFontFamilies = useCompilerStore((s) => s.setFontFamilies);
  const activeFontFamily = useCompilerStore((s) => s.activeFontFamily);
  const setActiveFontFamily = useCompilerStore((s) => s.setActiveFontFamily);
  const runCompile = useCompilerStore((s) => s.runCompile);
  const status = useCompilerStore((s) => s.status);

  const [loadingEngines, setLoadingEngines] = useState(false);
  const [fontSearch, setFontSearch] = useState('');

  const refreshEngines = async () => {
    setLoadingEngines(true);
    try {
      const engines = await detectEngines();
      setAvailableEngines(engines);
    } catch (e) {
      console.error('Failed to detect engines:', e);
    } finally {
      setLoadingEngines(false);
    }
  };

  useEffect(() => {
    refreshEngines();
    listFontFamilies()
      .then((fonts) => setFontFamilies(fonts))
      .catch((e) => console.error('Failed to load fonts:', e));
  }, []);

  const engineDescriptions: Record<LatexEngine, { title: string; subtitle: string; tag: string }> = {
    tectonic: {
      title: 'Tectonic (Auto-CTAN)',
      subtitle: 'Zero-setup XeTeX engine with automatic package download',
      tag: 'Default',
    },
    lualatex: {
      title: 'LuaLaTeX',
      subtitle: 'Modern engine with full Lua scripting and RTL support',
      tag: 'RTL Recommended',
    },
    xelatex: {
      title: 'XeLaTeX',
      subtitle: 'Native Unicode and system OpenType font support',
      tag: 'Unicode',
    },
    pdflatex: {
      title: 'pdfLaTeX',
      subtitle: 'Classic fast engine for IEEE, ACM, arXiv papers',
      tag: 'Fast',
    },
  };

  const filteredFonts = fontFamilies.filter((f) =>
    f.toLowerCase().includes(fontSearch.toLowerCase())
  );

  return (
    <div
      className="p-3 space-y-4 overflow-y-auto h-full text-xs"
      data-testid="package-font-panel"
    >
      {/* 1. LaTeX Compiler Engine Selector */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 font-semibold text-[var(--text-primary)]">
            <Cpu className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Compiler Engine</span>
          </div>
          <button
            onClick={refreshEngines}
            disabled={loadingEngines}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
            title="Scan system compilers"
          >
            <RefreshCw className={`w-3 h-3 ${loadingEngines ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-1.5">
          {(['tectonic', 'lualatex', 'xelatex', 'pdflatex'] as LatexEngine[]).map((engKey) => {
            const info = engineDescriptions[engKey];
            const isSelected = engine === engKey;
            const detected = availableEngines.find((e) => e.engine === engKey);
            const isInstalled = detected?.available ?? true; // Tectonic is default or auto-managed

            return (
              <div
                key={engKey}
                onClick={() => setEngine(engKey)}
                className={`p-2.5 rounded border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-primary)] ring-1 ring-[var(--accent-primary)]/50'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-editor)] hover:border-zinc-500 text-[var(--text-muted)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-[var(--text-primary)] flex items-center space-x-1.5">
                    <span>{info.title}</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded font-normal">
                      {info.tag}
                    </span>
                  </div>
                  {isInstalled ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span title="Not found on PATH">
                      <AlertCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">{info.subtitle}</div>
                {detected?.version && (
                  <div className="text-[10px] font-mono text-zinc-500 mt-1 truncate">
                    {detected.version}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Precompiled Preamble Format Caching */}
      <section className="p-2.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-editor)] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 font-semibold text-[var(--text-primary)]">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Preamble Format Cache</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={usePreambleCache}
              onChange={(e) => setUsePreambleCache(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-4 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[var(--accent-primary)]"></div>
          </label>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Precompiles lines 1 through <code className="text-zinc-300">\begin&#123;document&#125;</code> into{' '}
          <code className="text-zinc-300">.leafforge-cache/</code> to accelerate re-compilations by 60–75%.
        </p>
      </section>

      {/* 3. Automatic CTAN Package Cache */}
      <section className="p-2.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-editor)] space-y-2">
        <div className="flex items-center space-x-1.5 font-semibold text-[var(--text-primary)]">
          <Package className="w-3.5 h-3.5 text-emerald-400" />
          <span>Automatic CTAN Package Cache</span>
        </div>
        <div className="flex items-center space-x-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded">
          <HardDrive className="w-3.5 h-3.5 shrink-0" />
          <span>On-demand auto-downloading enabled for missing packages via Tectonic.</span>
        </div>
      </section>

      {/* 4. RTL System Font Picker */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 font-semibold text-[var(--text-primary)]">
            <Type className="w-3.5 h-3.5 text-sky-400" />
            <span>System RTL Fonts</span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)]">
            {fontFamilies.length} fonts
          </span>
        </div>

        <div className="flex items-center space-x-1.5 px-2 py-1 bg-[var(--surface-editor)] border border-[var(--border-subtle)] rounded">
          <Search className="w-3 h-3 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search fonts (e.g. Amiri, Scheherazade)..."
            value={fontSearch}
            onChange={(e) => setFontSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] w-full placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="max-h-36 overflow-y-auto space-y-1 border border-[var(--border-subtle)] p-1 rounded bg-[var(--surface-editor)]">
          {filteredFonts.length === 0 ? (
            <div className="text-zinc-500 p-2 text-center text-[11px]">No fonts match search.</div>
          ) : (
            filteredFonts.slice(0, 40).map((font) => (
              <div
                key={font}
                onClick={() => setActiveFontFamily(font)}
                className={`px-2 py-1 rounded cursor-pointer text-[11px] flex items-center justify-between ${
                  activeFontFamily === font
                    ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] font-semibold'
                    : 'text-[var(--text-primary)] hover:bg-[var(--border-subtle)]'
                }`}
              >
                <span className="truncate">{font}</span>
                {activeFontFamily === font && <CheckCircle2 className="w-3 h-3 shrink-0" />}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Compile Action Button */}
      <button
        onClick={() => runCompile()}
        disabled={status === 'compiling'}
        className="w-full py-2 px-3 rounded font-medium text-xs bg-[var(--accent-primary)] hover:opacity-90 text-white flex items-center justify-center space-x-1.5 shadow transition-all disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${status === 'compiling' ? 'animate-spin' : ''}`} />
        <span>{status === 'compiling' ? 'Compiling Document...' : 'Compile Document'}</span>
      </button>
    </div>
  );
};
