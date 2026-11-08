import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface SyncTexJumpEvent {
  filePath?: string;
  line: number;
  column: number;
}

export function synctexClick(getFilePath?: () => string | null): Extension {
  return EditorView.domEventHandlers({
    click(event: MouseEvent, view: EditorView) {
      // Check Cmd (macOS) or Ctrl (Windows/Linux)
      if (!event.metaKey && !event.ctrlKey) {
        return false;
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const line = view.state.doc.lineAt(pos);
      const lineNumber = line.number;
      const column = pos - line.from + 1;
      const filePath = getFilePath ? getFilePath() : null;

      const detail: SyncTexJumpEvent = {
        filePath: filePath ?? undefined,
        line: lineNumber,
        column,
      };

      // Dispatch forward SyncTeX event for PdfViewport
      window.dispatchEvent(new CustomEvent('leafforge:synctex-forward', { detail }));

      return true;
    },
  });
}
