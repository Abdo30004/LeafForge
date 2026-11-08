import React, { useRef, useEffect } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { foldGutter, indentOnInput, bracketMatching, foldKeymap } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { yCollab } from 'y-codemirror.next';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useCompilerStore } from '../store/useCompilerStore';
import { useCollabStore } from '../store/useCollabStore';
import { collabManager } from '../services/collabManager';
import { latexSupport } from './extensions/latexLanguage';
import { bidiIsolation, detectLineDirection, toggleLineDirection } from './extensions/bidiIsolation';
import { visualModeExtensions, setVisualModeEffect } from './extensions/visualModePlugin';
import { synctexClick } from './extensions/synctexClick';
import { inlineDiagnostics, setDiagnosticsEffect } from './extensions/inlineDiagnostics';
import { lspClient } from './extensions/lspClient';

export interface LatexEditorProps {
  className?: string;
}

export const LatexEditor: React.FC<LatexEditorProps> = ({ className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const fileContents = useWorkspaceStore((s) => s.fileContents);
  const editorMode = useWorkspaceStore((s) => s.editorMode);
  const editorJumpTarget = useWorkspaceStore((s) => s.editorJumpTarget);
  const theme = useWorkspaceStore((s) => s.theme);

  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const setCursorPosition = useWorkspaceStore((s) => s.setCursorPosition);
  const setActiveLineIsRtl = useWorkspaceStore((s) => s.setActiveLineIsRtl);
  const setEditorJumpTarget = useWorkspaceStore((s) => s.setEditorJumpTarget);

  const diagnostics = useCompilerStore((s) => s.diagnostics);
  const collabStatus = useCollabStore((s) => s.status);
  const canWrite = useCollabStore((s) => s.canWrite);

  const content = activeFilePath ? (fileContents[activeFilePath] ?? '') : '';

  // 1. Initialize CodeMirror 6 EditorView on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const baseTheme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: 'var(--surface-editor, #111418)',
        color: 'var(--text-primary, #e6ecf2)',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      },
      '.cm-content': {
        padding: '12px 0',
        caretColor: 'var(--accent-primary, #38bdf8)',
      },
      '.cm-line': {
        padding: '0 16px',
        lineHeight: '1.65',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--accent-primary, #38bdf8)',
        borderLeftWidth: '2px',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--surface-editor, #111418)',
        color: 'var(--text-muted, #52525b)',
        borderRight: '1px solid var(--border-subtle, #222730)',
        userSelect: 'none',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        color: 'var(--text-primary, #e6ecf2)',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: 'rgba(56, 189, 248, 0.25) !important',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(56, 189, 248, 0.3) !important',
      },
    });

    const activeUri = activeFilePath
      ? 'file:///' + activeFilePath.replace(/\\/g, '/').replace(/^\/+/, '')
      : 'file:///document.tex';

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        {
          key: 'Ctrl-Alt-r',
          run: (v) => toggleLineDirection(v),
        },
      ]),
      baseTheme,
      ...latexSupport(),
      ...bidiIsolation(),
      synctexClick(() => useWorkspaceStore.getState().activeFilePath),
      ...inlineDiagnostics(() => useCompilerStore.getState().diagnostics),
      ...lspClient(() => activeUri),
      ...visualModeExtensions(editorMode === 'visual'),
      EditorState.readOnly.of(!canWrite),
      EditorView.editable.of(canWrite),
      ...(collabStatus === 'connected' && collabManager.provider && activeFilePath
        ? [yCollab(collabManager.getYText(activeFilePath, content), collabManager.provider.awareness)]
        : []),
      EditorView.updateListener.of((update) => {
        // Document changes -> update store
        if (update.docChanged) {
          const currentFile = useWorkspaceStore.getState().activeFilePath;
          if (currentFile) {
            const newText = update.state.doc.toString();
            updateFileContent(currentFile, newText);
          }
        }

        // Selection / cursor changes -> update telemetry
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          const lineNum = line.number;
          const colNum = head - line.from + 1;
          setCursorPosition({ line: lineNum, col: colNum });

          const isRtl = detectLineDirection(line.text) === 'rtl';
          setActiveLineIsRtl(isRtl);

          const curFile = useWorkspaceStore.getState().activeFilePath;
          collabManager.updateLocalCursor(lineNum, colNum, curFile || undefined);
        }
      }),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [activeFilePath, collabStatus, canWrite]);

  // 2. Synchronize external content changes (e.g. from file watcher or Git)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== content) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: content },
      });
    }
  }, [content]);

  // 3. Mode Switch: Raw Source vs Visual WYSIWYM (Preserving cursor & scroll)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: setVisualModeEffect.of(editorMode === 'visual'),
    });
  }, [editorMode]);

  // 4. Update Diagnostics squiggles when compiler finishes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: setDiagnosticsEffect.of(diagnostics),
    });
  }, [diagnostics]);

  // 5. Jump target handler (from Document Outline or Inverse SyncTeX)
  useEffect(() => {
    if (!editorJumpTarget || !viewRef.current) return;

    const view = viewRef.current;
    const targetLine = Math.max(1, Math.min(editorJumpTarget.line, view.state.doc.lines));
    const lineInfo = view.state.doc.line(targetLine);
    const colOffset = editorJumpTarget.col ? Math.max(0, editorJumpTarget.col - 1) : 0;
    const pos = Math.min(lineInfo.to, lineInfo.from + colOffset);

    view.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true,
    });
    view.focus();

    setEditorJumpTarget(null);
  }, [editorJumpTarget, setEditorJumpTarget]);

  // 6. Theme update
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Dispatch empty transaction to force re-render with new CSS variables
    view.dispatch({});
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className ?? ''}`}
      data-testid="codemirror-latex-editor"
    />
  );
};
