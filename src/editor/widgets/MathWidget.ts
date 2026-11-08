import { WidgetType, EditorView } from '@codemirror/view';
import katex from 'katex';

export class MathWidget extends WidgetType {
  constructor(
    readonly rawTex: string,
    readonly displayMode: boolean,
    readonly pos: number
  ) {
    super();
  }

  override eq(other: MathWidget): boolean {
    return (
      other.rawTex === this.rawTex &&
      other.displayMode === this.displayMode &&
      other.pos === this.pos
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span');
    span.className = this.displayMode
      ? 'cm-math-widget cm-math-display block my-2 p-3 text-center bg-[var(--canvas)] border border-[var(--border-subtle)] rounded-md cursor-pointer hover:border-accent-primary transition-colors select-none'
      : 'cm-math-widget cm-math-inline inline-block px-1.5 py-0.5 mx-0.5 bg-[var(--canvas)] border border-[var(--border-subtle)] rounded cursor-pointer hover:border-accent-primary transition-colors select-none align-middle';

    span.title = 'Click to edit LaTeX formula';

    try {
      const cleanTex = this.cleanTexForKatex(this.rawTex);
      const html = katex.renderToString(cleanTex, {
        throwOnError: false,
        displayMode: this.displayMode,
      });
      span.innerHTML = html;
    } catch {
      span.textContent = this.rawTex;
    }

    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Click unfolds raw TeX by setting cursor inside the formula
      view.dispatch({
        selection: { anchor: this.pos },
        scrollIntoView: true,
      });
      view.focus();
    });

    return span;
  }

  private cleanTexForKatex(tex: string): string {
    const cleaned = tex.trim();
    // Strip $$ ... $$
    if (cleaned.startsWith('$$') && cleaned.endsWith('$$')) {
      return cleaned.slice(2, -2).trim();
    }
    // Strip \[ ... \]
    if (cleaned.startsWith('\\[') && cleaned.endsWith('\\]')) {
      return cleaned.slice(2, -2).trim();
    }
    // Strip \( ... \)
    if (cleaned.startsWith('\\(') && cleaned.endsWith('\\)')) {
      return cleaned.slice(2, -2).trim();
    }
    // Strip $ ... $
    if (cleaned.startsWith('$') && cleaned.endsWith('$')) {
      return cleaned.slice(1, -1).trim();
    }
    // Strip \begin{equation} ... \end{equation}
    const eqMatch = cleaned.match(/\\begin\{(?:equation|align|gather)\*?\}([\s\S]*?)\\end\{(?:equation|align|gather)\*?\}/);
    if (eqMatch && eqMatch[1]) {
      return eqMatch[1].trim();
    }
    return cleaned;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
