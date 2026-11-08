import {
  type CompletionContext,
  type CompletionResult,
  autocompletion,
  snippet,
} from '@codemirror/autocomplete';
import { hoverTooltip, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { lspCompletion, lspHover, lspDidChange, lspDidOpen } from '../../services/tauriClient';
import type { LspCompletionItem } from '../../types/latex';

/**
 * Fallback citation suggestions for offline/browser mode
 */
const FALLBACK_CITATIONS: LspCompletionItem[] = [
  { label: 'knuth1984', kind: 'Citation', detail: '@book', documentation: 'The TeXbook (Donald E. Knuth, 1984)', insertText: 'knuth1984' },
  { label: 'lamport1994', kind: 'Citation', detail: '@book', documentation: 'LaTeX: A Document Preparation System (Leslie Lamport, 1994)', insertText: 'lamport1994' },
  { label: 'einstein1905', kind: 'Citation', detail: '@article', documentation: 'Zur Elektrodynamik bewegter Körper (Albert Einstein, 1905)', insertText: 'einstein1905' },
];

/**
 * Fallback reference labels for offline/browser mode
 */
const FALLBACK_LABELS: LspCompletionItem[] = [
  { label: 'sec:intro', kind: 'Reference', detail: 'Section 1', insertText: 'sec:intro' },
  { label: 'eq:maxwell', kind: 'Reference', detail: 'Equation (1)', insertText: 'eq:maxwell' },
  { label: 'fig:architecture', kind: 'Reference', detail: 'Figure 1', insertText: 'fig:architecture' },
];

/**
 * Fallback environments for offline/browser mode
 */
const FALLBACK_ENVIRONMENTS: LspCompletionItem[] = [
  { label: 'equation', kind: 'Environment', detail: 'Numbered equation block', insertText: 'equation' },
  { label: 'align', kind: 'Environment', detail: 'Multi-line aligned math', insertText: 'align' },
  { label: 'itemize', kind: 'Environment', detail: 'Bulleted list', insertText: 'itemize' },
  { label: 'enumerate', kind: 'Environment', detail: 'Numbered list', insertText: 'enumerate' },
  { label: 'tabular', kind: 'Environment', detail: 'Tabular table', insertText: 'tabular' },
  { label: 'figure', kind: 'Environment', detail: 'Floating figure', insertText: 'figure' },
];

/**
 * Fallback packages for offline/browser mode
 */
const FALLBACK_PACKAGES: LspCompletionItem[] = [
  { label: 'amsmath', kind: 'Package', detail: 'AMS math facilities', insertText: 'amsmath' },
  { label: 'graphicx', kind: 'Package', detail: 'Enhanced support for graphics', insertText: 'graphicx' },
  { label: 'hyperref', kind: 'Package', detail: 'Hypertext links in LaTeX', insertText: 'hyperref' },
  { label: 'biblatex', kind: 'Package', detail: 'Sophisticated bibliographies', insertText: 'biblatex' },
];

/**
 * Common LaTeX command suggestions for instant offline completion
 */
const FALLBACK_COMMANDS: LspCompletionItem[] = [
  { label: '\\section', detail: 'Section heading', insertText: '\\section{${1:Title}}' },
  { label: '\\subsection', detail: 'Subsection heading', insertText: '\\subsection{${1:Title}}' },
  { label: '\\subsubsection', detail: 'Sub-subsection heading', insertText: '\\subsubsection{${1:Title}}' },
  { label: '\\chapter', detail: 'Chapter heading', insertText: '\\chapter{${1:Title}}' },
  { label: '\\textbf', detail: 'Bold typography', insertText: '\\textbf{${1:text}}' },
  { label: '\\textit', detail: 'Italic typography', insertText: '\\textit{${1:text}}' },
  { label: '\\texttt', detail: 'Monospace typewriter', insertText: '\\texttt{${1:code}}' },
  { label: '\\cite', detail: 'BibTeX citation', insertText: '\\cite{${1:key}}' },
  { label: '\\ref', detail: 'Cross-reference label', insertText: '\\ref{${1:label}}' },
  { label: '\\eqref', detail: 'Equation reference', insertText: '\\eqref{${1:eq}}' },
  { label: '\\label', detail: 'Label marker', insertText: '\\label{${1:marker}}' },
  { label: '\\begin', detail: 'Environment block', insertText: '\\begin{${1:env}}\n\t$0\n\\end{${1:env}}' },
  { label: '\\frac', detail: 'Fraction', insertText: '\\frac{${1:a}}{${2:b}}' },
  { label: '\\sqrt', detail: 'Square root', insertText: '\\sqrt{${1:x}}' },
  { label: '\\sum', detail: 'Summation', insertText: '\\sum_{${1:i=1}}^{${2:n}}' },
  { label: '\\int', detail: 'Integral', insertText: '\\int_{${1:a}}^{${2:b}}' },
  { label: '\\alpha', detail: 'Greek alpha (α)', insertText: '\\alpha' },
  { label: '\\beta', detail: 'Greek beta (β)', insertText: '\\beta' },
  { label: '\\gamma', detail: 'Greek gamma (γ)', insertText: '\\gamma' },
  { label: '\\infty', detail: 'Infinity (∞)', insertText: '\\infty' },
  { label: '\\usepackage', detail: 'Package import', insertText: '\\usepackage{${1:package}}' },
  { label: '\\item', detail: 'List item', insertText: '\\item ' },
];

function getContextualFallbacks(wordText: string): LspCompletionItem[] {
  if (wordText.startsWith('\\cite{')) return FALLBACK_CITATIONS;
  if (wordText.startsWith('\\ref{') || wordText.startsWith('\\eqref{')) return FALLBACK_LABELS;
  if (wordText.startsWith('\\begin{') || wordText.startsWith('\\end{')) return FALLBACK_ENVIRONMENTS;
  if (wordText.startsWith('\\usepackage{')) return FALLBACK_PACKAGES;
  return FALLBACK_COMMANDS;
}

export function createLspCompletionSource(getUri: () => string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(
      /\\[a-zA-Z@]*|\\cite\{[^}]*|\\ref\{[^}]*|\\eqref\{[^}]*|\\begin\{[^}]*|\\usepackage\{[^}]*/
    );
    if (!word && !context.explicit) return null;

    let from = word ? word.from : context.pos;
    const isBraced = word && word.text.includes('{');
    if (isBraced) {
      const braceIndex = word.text.indexOf('{');
      from = word.from + braceIndex + 1;
    }

    const uri = getUri();
    const line = context.state.doc.lineAt(context.pos);
    const lineNum = line.number - 1; // 0-based LSP line
    const colNum = context.pos - line.from; // 0-based character

    try {
      const items = await lspCompletion(uri, lineNum, colNum);
      const candidates =
        items.length > 0 ? items : getContextualFallbacks(word ? word.text : '');

      return {
        from,
        options: candidates.map((item) => {
          const insert = item.insertText ?? item.insert_text;
          return {
            label: item.label,
            type: item.kind?.toLowerCase() === 'citation' ? 'class' : 'keyword',
            detail: item.detail,
            info: item.documentation,
            apply: insert ? snippet(insert) : item.label,
          };
        }),
        validFor: isBraced
          ? /[^}]*/
          : /\\[a-zA-Z@]*|\\cite\{[^}]*|\\ref\{[^}]*|\\eqref\{[^}]*|\\begin\{[^}]*|\\usepackage\{[^}]*/,
      };
    } catch {
      return {
        from,
        options: getContextualFallbacks(word ? word.text : '').map((item) => {
          const insert = item.insertText ?? item.insert_text;
          return {
            label: item.label,
            type: item.kind?.toLowerCase() === 'citation' ? 'class' : 'keyword',
            detail: item.detail,
            apply: insert ? snippet(insert) : item.label,
          };
        }),
      };
    }
  };
}

export function createLspHoverTooltip(getUri: () => string): Extension {
  return hoverTooltip(async (view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const lineNum = line.number - 1;
    const colNum = pos - line.from;
    const uri = getUri();

    try {
      const result = await lspHover(uri, lineNum, colNum);
      if (!result || !result.contents) return null;

      // Find token boundaries around cursor
      const text = line.text;
      let start = colNum;
      while (start > 0 && /[a-zA-Z0-9\\@]/.test(text[start - 1] ?? '')) {
        start--;
        if (text[start] === '\\') break;
      }
      let end = colNum;
      while (end < text.length && /[a-zA-Z0-9*]/.test(text[end] ?? '')) {
        end++;
      }

      return {
        pos: line.from + start,
        end: line.from + Math.max(end, start + 1),
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className =
            'p-2.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] shadow-xl rounded text-xs space-y-1 max-w-md z-50 text-[var(--text-primary)] font-sans leading-relaxed';

          const content = document.createElement('div');
          content.className = 'whitespace-pre-wrap font-sans text-xs';
          content.textContent = result.contents;

          dom.appendChild(content);
          return { dom };
        },
      };
    } catch {
      return null;
    }
  });
}

export function lspSyncExtension(getUri: () => string): Extension {
  let docVersion = 1;

  return EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      docVersion += 1;
      const uri = getUri();
      const text = update.state.doc.toString();
      void lspDidChange(uri, text, docVersion);
    }
  });
}

export function lspClient(getUri: () => string): Extension[] {
  // Notify LSP of open document
  const uri = getUri();
  void lspDidOpen(uri, '', 1);

  return [
    autocompletion({
      override: [createLspCompletionSource(getUri)],
      defaultKeymap: true,
    }),
    createLspHoverTooltip(getUri),
    lspSyncExtension(getUri),
  ];
}
