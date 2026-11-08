import {
  StateField,
  StateEffect,
  type Extension,
  RangeSetBuilder,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
} from '@codemirror/view';
import type { LatexDiagnostic } from '../../types/latex';

export const setDiagnosticsEffect = StateEffect.define<LatexDiagnostic[]>();

const errorMark = Decoration.mark({
  class: 'cm-lint-error border-b-2 border-rose-500 underline decoration-wavy decoration-rose-500 bg-rose-500/10',
});

const warningMark = Decoration.mark({
  class: 'cm-lint-warning border-b-2 border-amber-500 underline decoration-wavy decoration-amber-500 bg-amber-500/10',
});

export const diagnosticsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(diagnostics, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiagnosticsEffect)) {
        const diags = effect.value;
        const builder = new RangeSetBuilder<Decoration>();
        const doc = tr.newDoc;

        for (const diag of diags) {
          if (diag.line > 0 && diag.line <= doc.lines) {
            const line = doc.line(diag.line);
            const col = Math.max(0, Math.min(line.length, diag.column > 0 ? diag.column - 1 : 0));
            const from = line.from + col;
            const to = Math.min(line.to, from + Math.max(1, line.length - col));

            if (from < to) {
              const mark = diag.severity === 'error' ? errorMark : warningMark;
              builder.add(from, to, mark);
            }
          }
        }
        return builder.finish();
      }
    }
    return diagnostics.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function diagnosticsTooltip(getDiagnostics: () => LatexDiagnostic[]): Extension {
  return hoverTooltip((view, pos) => {
    const diags = getDiagnostics();
    if (!diags || diags.length === 0) return null;

    const line = view.state.doc.lineAt(pos);
    const lineNum = line.number;

    const matching = diags.filter((d) => d.line === lineNum);
    if (matching.length === 0) return null;

    return {
      pos: line.from,
      end: line.to,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className =
          'p-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] shadow-xl rounded text-xs space-y-1.5 max-w-sm z-50 text-[var(--text-primary)]';

        for (const diag of matching) {
          const item = document.createElement('div');
          item.className = 'flex items-start space-x-1.5';

          const badge = document.createElement('span');
          badge.className =
            diag.severity === 'error'
              ? 'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30';
          badge.textContent = diag.severity;

          const msg = document.createElement('div');
          msg.className = 'flex-1 font-mono text-[11px] leading-tight text-[var(--text-primary)]';
          msg.textContent = diag.message;

          item.appendChild(badge);
          item.appendChild(msg);
          dom.appendChild(item);
        }

        return {
          dom,
        };
      },
    };
  });
}

export function inlineDiagnostics(getDiagnostics: () => LatexDiagnostic[]): Extension[] {
  return [diagnosticsField, diagnosticsTooltip(getDiagnostics)];
}
