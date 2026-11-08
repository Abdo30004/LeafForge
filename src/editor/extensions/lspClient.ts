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

export function createLspCompletionSource(getUri: () => string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/\\[a-zA-Z@]*|\\cite\{[^}]*|\\ref\{[^}]*|\\begin\{[^}]*/);
    if (!word && !context.explicit) return null;

    const from = word ? word.from : context.pos;
    const uri = getUri();
    const line = context.state.doc.lineAt(context.pos);
    const lineNum = line.number - 1; // 0-based LSP line
    const colNum = context.pos - line.from; // 0-based character

    try {
      const items = await lspCompletion(uri, lineNum, colNum);
      const candidates = items.length > 0 ? items : FALLBACK_COMMANDS;

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
        validFor: /\\[a-zA-Z@]*|\\cite\{[^}]*|\\ref\{[^}]*|\\begin\{[^}]*/,
      };
    } catch {
      return {
        from,
        options: FALLBACK_COMMANDS.map((item) => {
          const insert = item.insertText ?? item.insert_text;
          return {
            label: item.label,
            type: 'keyword',
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

      return {
        pos: line.from,
        end: line.to,
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
