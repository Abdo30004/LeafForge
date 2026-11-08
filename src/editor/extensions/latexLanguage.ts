import { StreamLanguage, type StringStream, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { EditorView, keymap } from '@codemirror/view';
import { type Extension, EditorSelection } from '@codemirror/state';

interface LatexState {
  inComment: boolean;
  inInlineMath: boolean;
  inDisplayMath: boolean;
  inCommandArg: boolean;
  mathDepth: number;
}

export const latexStreamParser = {
  name: 'latex',
  startState: (): LatexState => ({
    inComment: false,
    inInlineMath: false,
    inDisplayMath: false,
    inCommandArg: false,
    mathDepth: 0,
  }),

  token: (stream: StringStream, state: LatexState): string | null => {
    // 1. Comments
    if (stream.match(/^%/)) {
      stream.skipToEnd();
      return 'comment';
    }

    // 2. Display Math ($$ or \[)
    if (stream.match(/^\$\$/) || stream.match(/^\\\[/)) {
      state.inDisplayMath = !state.inDisplayMath;
      return 'string';
    }

    if (stream.match(/^\\\]/)) {
      state.inDisplayMath = false;
      return 'string';
    }

    // 3. Inline Math ($ or \()
    if (stream.match(/^\$/) && !state.inDisplayMath) {
      state.inInlineMath = !state.inInlineMath;
      return 'string';
    }

    if (stream.match(/^\\\(/) || stream.match(/^\\\)/)) {
      state.inInlineMath = !state.inInlineMath;
      return 'string';
    }

    // Inside math mode
    if (state.inDisplayMath || state.inInlineMath) {
      if (stream.match(/^\\[a-zA-Z]+/)) {
        return 'atom'; // Math operators like \alpha, \sum, \int, \frac
      }
      if (stream.match(/^[{}[\]()^_]/)) {
        return 'punctuation';
      }
      stream.next();
      return 'string';
    }

    // 4. Structural keywords & environments
    if (stream.match(/^\\(begin|end)\b/)) {
      return 'keyword';
    }

    if (stream.match(/^\\(documentclass|usepackage|input|include|bibliography|bibliographystyle)\b/)) {
      return 'meta';
    }

    // 5. Section headings
    if (stream.match(/^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/)) {
      return 'heading';
    }

    // 6. Citations and References
    if (stream.match(/^\\(cite|nocite|ref|eqref|pageref|label|url|href)\b/)) {
      return 'link';
    }

    // 7. Typography and styling
    if (stream.match(/^\\(textbf|mathbf)\b/)) {
      return 'strong';
    }
    if (stream.match(/^\\(textit|emph|mathit)\b/)) {
      return 'emphasis';
    }
    if (stream.match(/^\\(texttt|verb)\b/)) {
      return 'monospace';
    }

    // 8. Macro definitions
    if (stream.match(/^\\(newcommand|renewcommand|providecommand|def|let)\b/)) {
      return 'def';
    }

    // 9. Generic LaTeX commands (\commandName or \\)
    if (stream.match(/^\\[a-zA-Z@]+/)) {
      return 'variable';
    }

    if (stream.match(/^\\\\/)) {
      return 'keyword'; // Line break
    }

    if (stream.match(/^\\./)) {
      return 'escape'; // Escaped character like \$ or \%
    }

    // 10. Delimiters and brackets
    if (stream.match(/^[{}]/)) {
      return 'bracket';
    }
    if (stream.match(/^[[\]()]/)) {
      return 'punctuation';
    }

    // 11. Alignment and tabular tokens
    if (stream.match(/^&/)) {
      return 'operator';
    }

    stream.next();
    return null;
  },
};

export const latexLanguage = StreamLanguage.define(latexStreamParser);

export const latexHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--text-muted, #71717a)', fontStyle: 'italic' },
  { tag: t.keyword, color: '#c084fc', fontWeight: '600' }, // Purple
  { tag: t.meta, color: '#60a5fa', fontWeight: '500' }, // Blue
  { tag: t.heading, color: '#34d399', fontWeight: '700' }, // Emerald
  { tag: t.link, color: '#f472b6', textDecoration: 'underline' }, // Rose/Pink
  { tag: t.strong, fontWeight: '700', color: 'var(--text-primary)' },
  { tag: t.emphasis, fontStyle: 'italic', color: 'var(--text-primary)' },
  { tag: t.monospace, color: '#f59e0b', fontFamily: 'monospace' }, // Amber
  { tag: t.definition(t.variableName), color: '#a78bfa', fontWeight: '600' }, // Violet
  { tag: t.atom, color: '#38bdf8' }, // Cyan
  { tag: t.variableName, color: '#38bdf8' }, // Cyan commands
  { tag: t.string, color: '#fde047' }, // Yellow/Gold for math
  { tag: t.bracket, color: '#e2e8f0', fontWeight: '500' },
  { tag: t.punctuation, color: '#94a3b8' },
  { tag: t.operator, color: '#fb923c' },
  { tag: t.escape, color: '#f43f5e' },
]);

/**
 * LaTeX Environment Auto-Close:
 * When pressing Enter right after `\begin{<name>}`, automatically expands to:
 * \begin{<name>}
 *   <cursor>
 * \end{<name>}
 */
export const latexEnvironmentAutoClose: Extension = keymap.of([
  {
    key: 'Enter',
    run: (view: EditorView) => {
      const state = view.state;
      const range = state.selection.main;
      if (!range.empty) return false;

      const line = state.doc.lineAt(range.head);
      const textBeforeCursor = line.text.slice(0, range.head - line.from);

      // Check if text directly before cursor ends with \begin{env_name}
      const match = textBeforeCursor.match(/\\begin\{([a-zA-Z0-9*_-]+)\}\s*$/);
      if (!match || !match[1]) return false;

      const envName = match[1];
      const indentMatch = line.text.match(/^(\s*)/);
      const baseIndent = indentMatch ? indentMatch[1] : '';
      const innerIndent = baseIndent + '  ';

      const insertText = `\n${innerIndent}\n${baseIndent}\\end{${envName}}`;
      const insertPos = range.head;
      const cursorTarget = insertPos + 1 + innerIndent.length;

      view.dispatch({
        changes: { from: insertPos, insert: insertText },
        selection: EditorSelection.cursor(cursorTarget),
      });

      return true;
    },
  },
]);

/**
 * Full LaTeX Language Support bundle for CodeMirror 6
 */
export function latexSupport(): Extension[] {
  return [
    latexLanguage,
    syntaxHighlighting(latexHighlightStyle),
    latexEnvironmentAutoClose,
  ];
}
