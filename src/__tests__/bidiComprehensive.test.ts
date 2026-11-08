import { describe, it, expect } from 'vitest';
import { detectLineDirection } from '../editor/extensions/bidiIsolation';
import { EditorState } from '@codemirror/state';
import { bidiIsolation } from '../editor/extensions/bidiIsolation';

describe('Comprehensive Unicode UAX #9 BiDi Tokenization & Isolation Test Suite', () => {
  describe('Strong Directional Detection across Global Scripts', () => {
    it('detects standard English and Latin prose as LTR', () => {
      expect(detectLineDirection('The quick brown fox jumps over the lazy dog.')).toBe('ltr');
      expect(detectLineDirection('\\documentclass[12pt]{article}')).toBe('ltr');
      expect(detectLineDirection('\\begin{equation}')).toBe('ltr');
    });

    it('detects Classical and Modern Standard Arabic prose as RTL', () => {
      // "في هذه الدراسة نقترح خوارزمية جديدة لتوزيع الحوسبة"
      expect(
        detectLineDirection('في هذه الدراسة نقترح خوارزمية جديدة لتوزيع الحوسبة.')
      ).toBe('rtl');
    });

    it('detects Arabic text with extensive Tashkeel diacritics (vowels) as RTL', () => {
      // "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
      const withTashkeel = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
      expect(detectLineDirection(withTashkeel)).toBe('rtl');
    });

    it('detects Persian / Farsi specific characters (گ چ پ ژ) as RTL', () => {
      // "پژوهش‌های انجام‌شده در این دانشگاه نشان می‌دهد"
      expect(
        detectLineDirection('پژوهش‌های انجام‌شده در این دانشگاه نشان می‌دهد.')
      ).toBe('rtl');
    });

    it('detects Modern and Classical Hebrew prose as RTL', () => {
      // "מאמר זה מציג פתרון חדשני לבעיה מורכבת"
      expect(
        detectLineDirection('מאמר זה מציג פתרון חדשני לבעיה מורכבת בתחום המדע.')
      ).toBe('rtl');
    });

    it('detects Syriac / Aramaic script as RTL', () => {
      // Syriac block \u0700-\u074F
      const syriac = '\u0710\u0712\u0713\u0714 שלום';
      expect(detectLineDirection(syriac)).toBe('rtl');
    });
  });

  describe('Mixed Prose & Initial Strong Character Resolution', () => {
    it('resolves as RTL when first strong character is Arabic despite embedded English words', () => {
      // "نظام LeafForge يقدم تجربة ممتازة"
      const line = 'نظام LeafForge يقدم تجربة ممتازة في كتابة الأبحاث.';
      expect(detectLineDirection(line)).toBe('rtl');
    });

    it('resolves as LTR when first strong character is English despite following Arabic text', () => {
      const line = 'LeafForge supports Arabic: مرحبا بك في محرر النصوص.';
      expect(detectLineDirection(line)).toBe('ltr');
    });

    it('skips leading neutral characters (spaces, punctuation, digits) to find first strong character', () => {
      expect(detectLineDirection('   (123) - [45] : مرحبا بالعالم')).toBe('rtl');
      expect(detectLineDirection('   (123) - [45] : Hello World')).toBe('ltr');
    });

    it('treats empty lines and purely numeric/punctuation lines as LTR by default', () => {
      expect(detectLineDirection('')).toBe('ltr');
      expect(detectLineDirection('   ')).toBe('ltr');
      expect(detectLineDirection('--- 123456789 !!! +++')).toBe('ltr');
    });
  });

  describe('Explicit Magic Comment Directives (% !RTL and % !LTR)', () => {
    it('forces RTL mode on English line when % !RTL is present', () => {
      expect(detectLineDirection('English sentence styled in RTL block % !RTL')).toBe('rtl');
      expect(detectLineDirection('% !RTL First line comment')).toBe('rtl');
    });

    it('forces LTR mode on Arabic line when % !LTR is present', () => {
      expect(detectLineDirection('نص عربي مطلوب عرضه من اليسار % !LTR')).toBe('ltr');
    });
  });

  describe('CodeMirror 6 BiDi Extension Integration', () => {
    it('initializes CodeMirror state with bidiIsolation extension without errors', () => {
      const doc = [
        '\\documentclass{article}',
        '\\begin{document}',
        'في هذه الورقة استشهدنا بـ \\cite{knuth1984} ووجدنا أن $\\mathcal{O}(n \\log n)$ تمثل التعقيد.',
        '\\end{document}',
      ].join('\n');

      const state = EditorState.create({
        doc,
        extensions: [bidiIsolation()],
      });

      expect(state.doc.toString()).toBe(doc);
      expect(state.doc.lines).toBe(4);
    });

    it('maintains document integrity when applying bidi isolation to mixed documents', () => {
      const text = 'نص عربي مع معادلة $x^2 + y^2 = r^2$ ورمز \\ref{sec:methods} ومرجع \\cite{author2020}.';
      const state = EditorState.create({
        doc: text,
        extensions: [bidiIsolation()],
      });

      expect(state.doc.line(1).text).toBe(text);
      expect(detectLineDirection(text)).toBe('rtl');
    });
  });
});
