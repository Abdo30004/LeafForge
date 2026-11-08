import { WidgetType, EditorView } from '@codemirror/view';

export class MacroCapsuleWidget extends WidgetType {
  constructor(
    readonly kind: 'macro' | 'tikz' | 'primitive',
    readonly label: string,
    readonly pos: number
  ) {
    super();
  }

  override eq(other: MacroCapsuleWidget): boolean {
    return (
      other.kind === this.kind &&
      other.label === this.label &&
      other.pos === this.pos
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const pill = document.createElement('span');
    pill.className =
      'cm-macro-capsule inline-flex items-center space-x-1.5 px-2 py-0.5 my-0.5 rounded text-[11px] font-mono cursor-pointer border select-none transition-all';

    if (this.kind === 'tikz') {
      pill.className +=
        ' bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25';
      pill.innerHTML = `<span>🎨</span><span>TikZ Graphic: <strong>${this.label}</strong></span>`;
    } else if (this.kind === 'primitive') {
      pill.className +=
        ' bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25';
      pill.innerHTML = `<span>⚙️</span><span>TeX Primitive: <strong>${this.label}</strong></span>`;
    } else {
      pill.className +=
        ' bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/25';
      pill.innerHTML = `<span>⚡</span><span>Macro: <strong>${this.label}</strong></span>`;
    }

    pill.title = 'Click to expand source code';

    pill.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({
        selection: { anchor: this.pos },
        scrollIntoView: true,
      });
      view.focus();
    });

    return pill;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
