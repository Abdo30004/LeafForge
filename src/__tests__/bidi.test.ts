import { describe, it, expect } from 'vitest';
import { detectLineDirection } from '../editor/extensions/bidiIsolation';
import { EditorState } from '@codemirror/state';
import { bidiIsolation } from '../editor/extensions/bidiIsolation';

describe('Unicode UAX #9 BiDi RTL Engine', () => {
  it('detects English prose as LTR', () => {
    expect(detectLineDirection('This is a normal English paragraph.')).toBe('ltr');
    expect(detectLineDirection('\\section{Introduction}')).toBe('ltr');
  });

  it('detects Arabic prose as RTL', () => {
    // "هذا نص باللغة العربية"
    expect(detectLineDirection('هذا نص باللغة العربية يحتوي على شرح.')).toBe('rtl');
  });

  it('detects Hebrew prose as RTL', () => {
    // "שלום עולם"
    expect(detectLineDirection('שלום עולם, זהו מבחן בעברית.')).toBe('rtl');
  });

  it('identifies RTL in mixed sentences where first strong character is Arabic', () => {
    const mixedArabic = 'في هذه التجربة استخدمنا \\cite{knuth1984} للحسابات.';
    expect(detectLineDirection(mixedArabic)).toBe('rtl');
  });

  it('identifies LTR when first strong character is English despite following Arabic', () => {
    const mixedEnglish = 'For example: كلمة عربية in English text.';
    expect(detectLineDirection(mixedEnglish)).toBe('ltr');
  });

  it('honors explicit inline magic comments (% !RTL and % !LTR)', () => {
    expect(detectLineDirection('English sentence % !RTL')).toBe('rtl');
    expect(detectLineDirection('نص عربي % !LTR')).toBe('ltr');
  });

  it('attaches BiDi extensions to CodeMirror without errors', () => {
    const doc = 'نص عربي \\cite{knuth} و معادلة $x=1$';
    const state = EditorState.create({
      doc,
      extensions: [bidiIsolation()],
    });

    expect(state.doc.toString()).toBe(doc);
    expect(state.doc.lines).toBe(1);
  });
});
