import { LineCharPos } from '../../vectorstores/entities/store.entity';

/**
 * Builds an array of character offsets where each line begins in the text.
 * The first element is always 0 (start of line 1).
 */
export function buildLineOffsets(text: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

/**
 * Converts a character index into a (line, column) tuple based on precomputed offsets.
 * Lines and columns are 1-based.
 */
export function charOffsetToPosition(
  offset: number,
  lineOffsets: number[],
): { line: number; column: number } {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (lineOffsets[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - lineOffsets[low] + 1 };
}

/**
 * Formats a character offset into "line:column" string using lineOffsets.
 */
export function formatPosition(
  offset: number,
  lineOffsets: number[],
): LineCharPos {
  const { line, column } = charOffsetToPosition(offset, lineOffsets);
  return { line, character: column };
}

/**
 * Splits text using the provided splitter function, attaching "line:column" positions to each chunk.
 * @param text - the full input text
 * @param splitterFn - async function that returns array of chunk strings
 */
export async function splitWithPositions(
  text: string,
  splitterFn: (text: string) => Promise<string[]>,
): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
  // 1. Generate chunks
  const chunks = await splitterFn(text);
  // 2. Compute line offsets
  const lineOffsets = buildLineOffsets(text);
  // 3. Iterate and map positions
  const results: { text: string; start: LineCharPos; end: LineCharPos }[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const startIdx = text.indexOf(chunk, cursor);
    const endIdx = startIdx + chunk.length - 1;
    results.push({
      text: chunk,
      start: formatPosition(startIdx, lineOffsets),
      end: formatPosition(endIdx, lineOffsets),
    });
    cursor = endIdx + 1;
  }
  return results;
}
