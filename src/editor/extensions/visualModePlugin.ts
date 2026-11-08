import {
  StateField,
  StateEffect,
  type Extension,
  RangeSetBuilder,
  type EditorState,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  showTooltip,
  type Tooltip,
} from '@codemirror/view';
import katex from 'katex';
import { MathWidget } from '../widgets/MathWidget';
import { SectionPrefixWidget, type SectionLevel } from '../widgets/SectionWidget';
import { TableWidget } from '../widgets/TableWidget';
import { MacroCapsuleWidget } from '../widgets/MacroCapsuleWidget';

export const setVisualModeEffect = StateEffect.define<boolean>();

export const visualModeStateField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setVisualModeEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// Typographic Section Class Map
const SECTION_CLASSES: Record<SectionLevel, string> = {
  part: 'cm-part-text text-3xl font-extrabold tracking-tight text-[var(--text-primary)]',
  chapter: 'cm-chapter-text text-2xl font-bold tracking-tight text-[var(--text-primary)]',
  section: 'cm-section-text text-xl font-bold tracking-tight text-[var(--text-primary)]',
  subsection: 'cm-subsection-text text-lg font-semibold tracking-tight text-[var(--text-primary)]',
  subsubsection: 'cm-subsubsection-text text-base font-medium text-[var(--text-primary)]',
  paragraph: 'cm-paragraph-text text-sm font-bold text-[var(--text-primary)]',
};

const boldMark = Decoration.mark({ class: 'cm-visual-bold font-bold text-[var(--text-primary)]' });
const italicMark = Decoration.mark({ class: 'cm-visual-italic italic text-[var(--text-primary)]' });
const underlineMark = Decoration.mark({ class: 'cm-visual-underline underline text-[var(--text-primary)]' });
const hideSyntaxMark = Decoration.replace({});

/**
 * Builds decorations when in visual mode and cursor is outside token range
 */
export function buildVisualDecorations(state: EditorState): DecorationSet {
  const isVisual = state.field(visualModeStateField, false);
  if (!isVisual) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const docText = state.doc.toString();
  const sel = state.selection.main;
  const cursorFrom = sel.from;
  const cursorTo = sel.to;

  const isCursorInside = (from: number, to: number) => {
    return cursorTo >= from && cursorFrom <= to;
  };

  // Collect all decoration items to insert in strictly ascending position order
  interface DecoEntry {
    from: number;
    to: number;
    deco: Decoration;
  }
  const entries: DecoEntry[] = [];

  // 1. Display Math: $$ ... $$, \[ ... \], \begin{equation} ... \end{equation}
  const displayMathRegex =
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(?:equation|align|gather)\*?\}[\s\S]*?\\end\{(?:equation|align|gather)\*?\})/g;
  let match: RegExpExecArray | null;
  const coveredRanges: Array<[number, number]> = [];

  while ((match = displayMathRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    coveredRanges.push([from, to]);

    if (!isCursorInside(from, to)) {
      entries.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new MathWidget(match[0], true, from + 2),
          block: true,
        }),
      });
    }
  }

  // 2. Tabular Environments: \begin{tabular} ... \end{tabular}
  const tabularRegex = /\\begin\{tabular\}\{[^}]+\}[\s\S]*?\\end\{tabular\}/g;
  while ((match = tabularRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    coveredRanges.push([from, to]);

    if (!isCursorInside(from, to)) {
      entries.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new TableWidget(match[0], from, to),
          block: true,
        }),
      });
    }
  }

  // 3. Fallback Capsules: \newcommand, \begin{tikzpicture} ... \end{tikzpicture}, \makeatletter ... \makeatother
  const tikzRegex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;
  while ((match = tikzRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    coveredRanges.push([from, to]);

    if (!isCursorInside(from, to)) {
      entries.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new MacroCapsuleWidget('tikz', 'Figure', from),
        }),
      });
    }
  }

  const macroDefRegex = /\\(?:newcommand|renewcommand)\*?\{(\\[a-zA-Z]+)\}(?:\[[0-9]+\])?\{[\s\S]*?\}/g;
  while ((match = macroDefRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    coveredRanges.push([from, to]);

    if (!isCursorInside(from, to) && match[1]) {
      entries.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new MacroCapsuleWidget('macro', match[1], from),
        }),
      });
    }
  }

  // Helper to check if a range overlaps with already replaced large blocks
  const isCovered = (start: number, end: number) => {
    return coveredRanges.some(([cFrom, cTo]) => start < cTo && end > cFrom);
  };

  // 4. Inline Math: $ ... $ (excluding display math)
  const inlineMathRegex = /(?<!\$)\$([^$\n]+)\$(?!\$)/g;
  while ((match = inlineMathRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;

    if (!isCovered(from, to)) {
      coveredRanges.push([from, to]);
      if (!isCursorInside(from, to)) {
        entries.push({
          from,
          to,
          deco: Decoration.replace({
            widget: new MathWidget(match[0], false, from + 1),
          }),
        });
      }
    }
  }

  // 5. Section headings: \section{Title}, \subsection{Title}, etc.
  const sectionRegex =
    /\\(part|chapter|section|subsection|subsubsection|paragraph)(\*?)\{([^}]+)\}/g;
  while ((match = sectionRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;

    if (!isCovered(from, to) && match[1] && match[3]) {
      const level = match[1] as SectionLevel;
      const isStarred = match[2] === '*';
      const prefixLen = `\\${level}${match[2]}{`.length;
      const titleLen = match[3].length;

      const prefixFrom = from;
      const prefixTo = from + prefixLen;
      const titleFrom = prefixTo;
      const titleTo = titleFrom + titleLen;
      const suffixFrom = titleTo;
      const suffixTo = to;

      if (!isCursorInside(from, to)) {
        // Replace \section{ with badge
        entries.push({
          from: prefixFrom,
          to: prefixTo,
          deco: Decoration.replace({
            widget: new SectionPrefixWidget(level, isStarred, from),
          }),
        });
        // Scale title typography
        const headingClass = SECTION_CLASSES[level] ?? SECTION_CLASSES.section;
        entries.push({
          from: titleFrom,
          to: titleTo,
          deco: Decoration.mark({ class: headingClass }),
        });
        // Hide closing brace }
        entries.push({
          from: suffixFrom,
          to: suffixTo,
          deco: hideSyntaxMark,
        });
      }
    }
  }

  // 6. Formatting: \textbf{...}, \textit{...}, \underline{...}
  const formatRegex = /\\(textbf|textit|underline)\{([^}]+)\}/g;
  while ((match = formatRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;

    if (!isCovered(from, to) && match[1] && match[2]) {
      const type = match[1];
      const prefixLen = `\\${type}{`.length;
      const textLen = match[2].length;

      const prefixFrom = from;
      const prefixTo = from + prefixLen;
      const contentFrom = prefixTo;
      const contentTo = contentFrom + textLen;
      const suffixFrom = contentTo;
      const suffixTo = to;

      if (!isCursorInside(from, to)) {
        entries.push({ from: prefixFrom, to: prefixTo, deco: hideSyntaxMark });
        const mark = type === 'textbf' ? boldMark : type === 'textit' ? italicMark : underlineMark;
        entries.push({ from: contentFrom, to: contentTo, deco: mark });
        entries.push({ from: suffixFrom, to: suffixTo, deco: hideSyntaxMark });
      }
    }
  }

  // Sort entries ascending by from, then by to
  entries.sort((a, b) => a.from - b.from || a.to - b.to);

  for (const entry of entries) {
    if (entry.from < entry.to) {
      builder.add(entry.from, entry.to, entry.deco);
    }
  }

  return builder.finish();
}

export const visualModeDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildVisualDecorations(state);
  },
  update(decorations, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.effects.some((e) => e.is(setVisualModeEffect))
    ) {
      return buildVisualDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Live Math Tooltip: when cursor is inside an unfolded math formula,
 * renders a live floating KaTeX preview tooltip above the cursor!
 */
export const mathCursorTooltip = StateField.define<Tooltip | null>({
  create() {
    return null;
  },
  update(_tooltip, tr) {
    const isVisual = tr.state.field(visualModeStateField, false);
    if (!isVisual) return null;

    const sel = tr.state.selection.main;
    if (!sel.empty) return null;

    const line = tr.state.doc.lineAt(sel.head);
    const lineText = line.text;
    const lineOffset = sel.head - line.from;

    // Detect if cursor is inside $...$ or $$...$$
    const mathMatch = lineText.match(/(?:\$\$[^$]+\$\$|\$[^$\n]+\$)/g);
    if (!mathMatch) return null;

    let targetFormula: string | null = null;
    let matchStart = 0;

    for (const formula of mathMatch) {
      const idx = lineText.indexOf(formula, matchStart);
      if (idx !== -1) {
        const end = idx + formula.length;
        if (lineOffset >= idx && lineOffset <= end) {
          targetFormula = formula;
          break;
        }
        matchStart = end;
      }
    }

    if (!targetFormula) return null;

    const cleanFormula = targetFormula.replace(/^\$\$?|\$\$?$/g, '').trim();

    return {
      pos: sel.head,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className =
          'p-2 bg-[var(--surface-elevated)] border border-accent-primary shadow-xl rounded-md text-xs z-50 text-[var(--text-primary)] select-none pointer-events-none';
        try {
          dom.innerHTML = katex.renderToString(cleanFormula, { throwOnError: false });
        } catch {
          dom.textContent = cleanFormula;
        }
        return { dom };
      },
    };
  },
  provide: (f) => showTooltip.compute([f], (state) => state.field(f)),
});

export function visualModeExtensions(isVisualInitial = false): Extension[] {
  return [
    visualModeStateField.init(() => isVisualInitial),
    visualModeDecorationsField,
    mathCursorTooltip,
  ];
}
