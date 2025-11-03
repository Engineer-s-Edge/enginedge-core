import {
  buildLineOffsets,
  charOffsetToPosition,
  formatPosition,
  splitWithPositions,
} from './split_position';

describe('split_position utils', () => {
  describe('buildLineOffsets', () => {
    it('returns [0] for empty text', () => {
      expect(buildLineOffsets('')).toEqual([0]);
    });

    it('returns only 0 for single-line text', () => {
      expect(buildLineOffsets('abc')).toEqual([0]);
    });

    it('returns offsets at the start of each line for multi-line text', () => {
      const text = 'a\nb\ncd';
      // indexes: 0:a, 1:\n, 2:b, 3:\n, 4:c, 5:d
      expect(buildLineOffsets(text)).toEqual([0, 2, 4]);
    });
  });

  describe('charOffsetToPosition', () => {
    const text = 'a\nb\ncd';
    const offsets = buildLineOffsets(text); // [0,2,4]

    it('maps start of text to line 1, column 1', () => {
      expect(charOffsetToPosition(0, offsets)).toEqual({ line: 1, column: 1 });
    });

    it('maps newline char within a line correctly (1-based)', () => {
      expect(charOffsetToPosition(1, offsets)).toEqual({ line: 1, column: 2 });
    });

    it('maps first char of second line to line 2, column 1', () => {
      expect(charOffsetToPosition(2, offsets)).toEqual({ line: 2, column: 1 });
    });

    it('maps end of last line correctly', () => {
      expect(charOffsetToPosition(5, offsets)).toEqual({ line: 3, column: 2 });
    });
  });

  describe('formatPosition', () => {
    it('wraps charOffsetToPosition into { line, character }', () => {
      const text = 'x\ny';
      const offsets = buildLineOffsets(text); // [0,2]
      expect(formatPosition(2, offsets)).toEqual({ line: 2, character: 1 });
    });
  });

  describe('splitWithPositions', () => {
    it('returns empty for no chunks', async () => {
      const out = await splitWithPositions('anything', async () => []);
      expect(out).toEqual([]);
    });

    it('computes correct positions across lines and duplicate chunks', async () => {
      const text = 'Hello\nWorld!\nWorld!';
      // chunks appear in order and include duplicates
      const chunks = ['Hello', 'World!', 'World!'];
      const out = await splitWithPositions(text, async () => chunks);

      // line offsets: [0,6,13]
      expect(out).toHaveLength(3);

      // "Hello" at 0..4 -> line 1: col 1..5
      expect(out[0]).toEqual({
        text: 'Hello',
        start: { line: 1, character: 1 },
        end: { line: 1, character: 5 },
      });

      // first "World!" at 6..11 -> line 2: col 1..6
      expect(out[1]).toEqual({
        text: 'World!',
        start: { line: 2, character: 1 },
        end: { line: 2, character: 6 },
      });

      // second "World!" at 13..18 -> line 3: col 1..6
      expect(out[2]).toEqual({
        text: 'World!',
        start: { line: 3, character: 1 },
        end: { line: 3, character: 6 },
      });
    });

    it('supports multi-line chunks (end position on subsequent line)', async () => {
      const text = 'A\nBC\nD';
      // a single chunk that spans from index 0 to 4 ("A\nBC\nD")
      const out = await splitWithPositions(text, async () => ['A\nBC\nD']);
      // line offsets: [0,2,5]
      expect(out).toHaveLength(1);
      expect(out[0].start).toEqual({ line: 1, character: 1 });
      expect(out[0].end).toEqual({ line: 3, character: 1 });
    });
  });
});
