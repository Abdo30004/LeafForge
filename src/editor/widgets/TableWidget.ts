import { WidgetType, EditorView } from '@codemirror/view';

export class TableWidget extends WidgetType {
  constructor(
    readonly rawTex: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      other.rawTex === this.rawTex &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className =
      'cm-table-widget my-2 p-2.5 bg-[var(--canvas)] border border-[var(--border-subtle)] rounded-md space-y-2 select-none';

    // Table Header Toolbar
    const toolbar = document.createElement('div');
    toolbar.className =
      'flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]';

    const title = document.createElement('span');
    title.className = 'font-bold font-mono text-accent-primary';
    title.textContent = 'TABLE EDITOR (Tabular)';

    const btnGroup = document.createElement('div');
    btnGroup.className = 'flex items-center space-x-1.5';

    const editBtn = document.createElement('button');
    editBtn.className =
      'px-2 py-0.5 rounded bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-[10px] font-medium border border-[var(--border-subtle)] transition-colors';
    editBtn.textContent = 'Edit Raw TeX';
    editBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({
        selection: { anchor: this.from + 15 },
        scrollIntoView: true,
      });
      view.focus();
    });

    btnGroup.appendChild(editBtn);
    toolbar.appendChild(title);
    toolbar.appendChild(btnGroup);
    container.appendChild(toolbar);

    // Table Grid Rendering
    const table = document.createElement('table');
    table.className =
      'w-full border-collapse border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]';

    const { rows } = this.parseTabular(this.rawTex);

    const tbody = document.createElement('tbody');
    rows.forEach((rowCells, rIdx) => {
      const tr = document.createElement('tr');
      tr.className = rIdx === 0 ? 'bg-[var(--surface-elevated)] font-semibold' : 'hover:bg-[var(--hover-bg)]';

      rowCells.forEach((cellText) => {
        const td = document.createElement(rIdx === 0 ? 'th' : 'td');
        td.className = 'border border-[var(--border-subtle)] p-1.5 text-center';
        td.textContent = cellText || '—';
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    return container;
  }

  private parseTabular(raw: string): { colSpec: string; rows: string[][] } {
    const specMatch = raw.match(/\\begin\{tabular\}\{([^}]+)\}/);
    const colSpec = specMatch && specMatch[1] ? specMatch[1] : '';

    const bodyMatch = raw.match(/\\begin\{tabular\}\{[^}]+\}([\s\S]*?)\\end\{tabular\}/);
    const body = bodyMatch && bodyMatch[1] ? bodyMatch[1].trim() : '';

    const rawRows = body.split('\\\\');
    const rows = rawRows
      .map((r) => r.replace(/\\hline/g, '').trim())
      .filter((r) => r.length > 0)
      .map((r) => r.split('&').map((c) => c.trim()));

    return { colSpec, rows };
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
