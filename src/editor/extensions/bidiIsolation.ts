import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import {
  StateField,
  StateEffect,
  type Extension,
  RangeSetBuilder,
} from '@codemirror/state';

// Strong RTL Unicode regex: Arabic, Hebrew, Syriac, Thaana, Samaritan
const RTL_REGEX =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u0800-\u083F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Strong LTR Unicode regex: Latin, Greek, Cyrillic, CJK
const LTR_REGEX =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;

/**
 * Unicode UAX #9 Paragraph Direction Detection Rule P2:
 * Scans characters until the first character of type L, AL, or R is encountered.
 * Returns 'rtl' if first strong directional character is RTL, else 'ltr'.
 */
export function detectLineDirection(text: string): 'rtl' | 'ltr' {
  // Check for inline magic comments first
  if (text.includes('% !RTL')) return 'rtl';
  if (text.includes('% !LTR')) return 'ltr';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!char) continue;

    // Check if strong RTL
    if (RTL_REGEX.test(char)) {
      return 'rtl';
    }
    // Check if strong LTR
    if (LTR_REGEX.test(char)) {
      return 'ltr';
    }
  }

  return 'ltr'; // Default fallback
}

/**
 * Manual Direction Override StateField and Effects
 */
export interface LineDirectionOverride {
  lineNumber: number;
  direction: 'rtl' | 'ltr' | 'auto';
}

export const setLineDirectionEffect = StateEffect.define<LineDirectionOverride>();

export const manualLineDirectionField = StateField.define<Map<number, 'rtl' | 'ltr'>>({
  create() {
    return new Map();
  },
  update(overrides, tr) {
    let next = overrides;
    for (const effect of tr.effects) {
      if (effect.is(setLineDirectionEffect)) {
        if (next === overrides) {
          next = new Map(overrides);
        }
        if (effect.value.direction === 'auto') {
          next.delete(effect.value.lineNumber);
        } else {
          next.set(effect.value.lineNumber, effect.value.direction);
        }
      }
    }
    return next;
  },
});

const rtlLineDeco = Decoration.line({
  attributes: {
    dir: 'rtl',
    class: 'cm-rtl-line',
  },
});

const ltrCommandIsolateDeco = Decoration.mark({
  attributes: {
    dir: 'ltr',
    class: 'cm-ltr-isolate',
    style: 'unicode-bidi: isolate; display: inline-block;',
  },
});

/**
 * ViewPlugin that applies per-line RTL direction and LTR isolation marks
 * to LaTeX control sequences and inline/display math inside RTL lines.
 */
class BidiViewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.transactions.some((tr) => tr.effects.some((e) => e.is(setLineDirectionEffect)))
    ) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const overrides = view.state.field(manualLineDirectionField, false) ?? new Map<number, 'rtl' | 'ltr'>();

    for (const { from, to } of view.visibleRanges) {
      const startLine = view.state.doc.lineAt(from);
      const endLine = view.state.doc.lineAt(to);

      for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
        const line = view.state.doc.line(lineNum);
        const manual = overrides.get(lineNum);
        const direction = manual ?? detectLineDirection(line.text);

        if (direction === 'rtl') {
          // 1. Line-level RTL decoration
          builder.add(line.from, line.from, rtlLineDeco);

          // 2. Mark LaTeX commands and math spans with LTR isolation
          // LaTeX commands with arguments: e.g. \cite{foo}, \ref{bar}, \frac{a}{b}, \begin{eq}
          // Inline / Display math: $...$, $$...$$, \(...\), \[...\]
          const text = line.text;
          const tokenRegex =
            /(\\[a-zA-Z@]+(?:\{[^{}]*\}|\[[^[\]]*\])*)|(\$\$[^$]+\$\$|\$[^$\n]+\$|\\\(.*?\\\)|\s*\\\[.*?\\\])/g;

          let match: RegExpExecArray | null;
          while ((match = tokenRegex.exec(text)) !== null) {
            const tokenStart = line.from + match.index;
            const tokenEnd = tokenStart + match[0].length;
            if (tokenStart < tokenEnd) {
              builder.add(tokenStart, tokenEnd, ltrCommandIsolateDeco);
            }
          }
        }
      }
    }

    return builder.finish();
  }
}

export const bidiPlugin = ViewPlugin.fromClass(BidiViewPlugin, {
  decorations: (v) => v.decorations,
});

/**
 * Toggle RTL / LTR direction on current cursor line
 */
export function toggleLineDirection(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const overrides = view.state.field(manualLineDirectionField, false);
  const current = overrides?.get(line.number) ?? detectLineDirection(line.text);
  const next = current === 'rtl' ? 'ltr' : 'rtl';

  view.dispatch({
    effects: setLineDirectionEffect.of({ lineNumber: line.number, direction: next }),
  });
  return true;
}

/**
 * Full BiDi Isolation extension bundle
 */
export function bidiIsolation(): Extension[] {
  return [
    EditorView.perLineTextDirection.of(true),
    manualLineDirectionField,
    bidiPlugin,
  ];
}
