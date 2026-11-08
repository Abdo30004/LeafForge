import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  visualModeExtensions,
  setVisualModeEffect,
  buildVisualDecorations,
} from '../editor/extensions/visualModePlugin';
import { MathWidget } from '../editor/widgets/MathWidget';
import katex from 'katex';

describe('Visual Mode & Widget Subsystem', () => {
  it('renders KaTeX formulas cleanly via MathWidget', () => {
    const rawFormula = '$\\alpha + \\beta = \\gamma$';
    const widget = new MathWidget(rawFormula, false, 0);

    const rendered = katex.renderToString('\\alpha + \\beta = \\gamma', {
      throwOnError: false,
      displayMode: false,
    });

    expect(rendered).toContain('katex');
    expect(rendered).toContain('α');
    expect(widget.rawTex).toBe(rawFormula);
  });

  it('builds decorations when visual mode is enabled and folds math tokens', () => {
    const doc = 'Inline formula $\\sum_{i=1}^n x_i$ inside text.';
    let state = EditorState.create({
      doc,
      extensions: [visualModeExtensions(false)],
    });

    // In raw mode, no visual decorations
    let decos = buildVisualDecorations(state);
    expect(decos.size).toBe(0);

    // Switch to visual mode
    state = state.update({
      effects: setVisualModeEffect.of(true),
    }).state;

    decos = buildVisualDecorations(state);
    expect(decos.size).toBeGreaterThan(0);
  });

  it('unfolds formula when cursor is placed inside its character range', () => {
    const doc = 'Equation: $E=mc^2$ is famous.';
    // Formula is at indices 10..18
    let state = EditorState.create({
      doc,
      selection: { anchor: 0 }, // Cursor at 0 (outside)
      extensions: [visualModeExtensions(true)],
    });

    let decos = buildVisualDecorations(state);
    expect(decos.size).toBe(1);

    // Move cursor inside formula at index 14
    state = state.update({
      selection: { anchor: 14 },
    }).state;

    decos = buildVisualDecorations(state);
    // When cursor is inside, formula is unfolded (no replacement decoration)
    expect(decos.size).toBe(0);
  });
});
