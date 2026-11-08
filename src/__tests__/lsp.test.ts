import { describe, it, expect } from 'vitest';
import { createLspCompletionSource } from '../editor/extensions/lspClient';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

describe('LSP Client Integration', () => {
  it('provides LaTeX completions when typing command prefixes', async () => {
    const doc = '\\sec';
    const state = EditorState.create({ doc });
    const source = createLspCompletionSource(() => 'file:///main.tex');

    const context = new CompletionContext(state, 4, true);
    const result = await source(context);

    expect(result).not.toBeNull();
    expect(result?.options.length).toBeGreaterThan(0);
    const hasSection = result?.options.some((opt) => opt.label === '\\section');
    expect(hasSection).toBe(true);
  });

  it('suggests environments and citations in completions', async () => {
    const doc = '\\cite{';
    const state = EditorState.create({ doc });
    const source = createLspCompletionSource(() => 'file:///main.tex');

    const context = new CompletionContext(state, 6, true);
    const result = await source(context);

    expect(result).not.toBeNull();
    expect(result?.options.length).toBeGreaterThan(0);
  });
});
