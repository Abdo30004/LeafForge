import { WidgetType, EditorView } from '@codemirror/view';

export type SectionLevel = 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'paragraph';

export class SectionPrefixWidget extends WidgetType {
  constructor(
    readonly level: SectionLevel,
    readonly isStarred: boolean,
    readonly pos: number
  ) {
    super();
  }

  override eq(other: SectionPrefixWidget): boolean {
    return (
      other.level === this.level &&
      other.isStarred === this.isStarred &&
      other.pos === this.pos
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const badge = document.createElement('span');
    badge.className =
      'cm-section-badge inline-flex items-center px-1.5 py-0.5 mr-2 rounded text-[10px] font-mono uppercase tracking-wider bg-accent-primary/15 text-accent-primary border border-accent-primary/30 cursor-pointer select-none';
    badge.textContent = this.level + (this.isStarred ? '*' : '');
    badge.title = 'Click to edit section command';

    badge.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({
        selection: { anchor: this.pos },
        scrollIntoView: true,
      });
      view.focus();
    });

    return badge;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
