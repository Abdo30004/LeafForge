import { describe, it, expect } from 'vitest';
import { parseLatexOutline } from '../components/sidebar/OutlinePanel';
import { EditorState } from '@codemirror/state';
import { latexSupport } from '../editor/extensions/latexLanguage';

describe('LaTeX Editor & Outline Engine', () => {
  it('parses hierarchical outline elements accurately', () => {
    const sampleTex = `
\\documentclass{article}
\\usepackage{amsmath}

\\begin{document}

\\part{Theoretical Foundations}
\\section{Introduction}
\\label{sec:intro}
Here is some introductory text with an equation:
\\begin{equation}
  E = mc^2
\\end{equation}

\\subsection{Background & Context}
\\subsubsection{Historical Notes}
\\paragraph{A small paragraph note}

\\begin{figure}
  \\caption{Simulation Results}
\\end{figure}

\\begin{table}
  \\caption{Benchmark Performance}
\\end{table}

\\end{document}
`;

    const outline = parseLatexOutline(sampleTex);
    expect(outline.length).toBe(8);

    const part = outline.find((i) => i.type === 'part');
    expect(part).toBeDefined();
    expect(part?.title).toBe('Theoretical Foundations');
    expect(part?.level).toBe(0);

    const section = outline.find((i) => i.type === 'section');
    expect(section).toBeDefined();
    expect(section?.title).toBe('Introduction');
    expect(section?.level).toBe(2);

    const label = outline.find((i) => i.type === 'label');
    expect(label).toBeDefined();
    expect(label?.title).toBe('sec:intro');

    const sub = outline.find((i) => i.type === 'subsection');
    expect(sub?.title).toBe('Background & Context');

    const subsub = outline.find((i) => i.type === 'subsubsection');
    expect(subsub?.title).toBe('Historical Notes');

    const fig = outline.find((i) => i.type === 'figure');
    expect(fig?.title).toBe('Simulation Results');

    const tbl = outline.find((i) => i.type === 'table');
    expect(tbl?.title).toBe('Benchmark Performance');
  });

  it('initializes CodeMirror with LaTeX language extensions and parses document', () => {
    const doc = '\\section{Quantum Mechanics}\n$E = \\hbar \\omega$';
    const state = EditorState.create({
      doc,
      extensions: [latexSupport()],
    });

    expect(state.doc.toString()).toBe(doc);
    expect(state.doc.lines).toBe(2);
  });
});
