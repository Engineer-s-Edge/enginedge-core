import TextSplitterFactory from './textsplitter.factory';

describe('TextSplitterFactory', () => {
  const mkAdapter = (name: string) => ({ name }) as any;
  const char = mkAdapter('char');
  const rec = mkAdapter('rec');
  const tok = mkAdapter('tok');
  const htmlHdr = mkAdapter('htmlHdr');
  const htmlSec = mkAdapter('htmlSec');
  const mdDr = mkAdapter('md');
  const code = mkAdapter('code');
  const latex = mkAdapter('latex');
  const semantic = mkAdapter('semantic');

  const factory = new TextSplitterFactory(
    char,
    rec,
    tok,
    htmlHdr,
    htmlSec,
    mdDr,
    code,
    latex,
    semantic,
  );

  it('returns specific adapters for each type', () => {
    expect(factory.getSplitter('character')).toBe(char);
    expect(factory.getSplitter('recursive')).toBe(rec);
    expect(factory.getSplitter('token')).toBe(tok);
    expect(factory.getSplitter('html-header')).toBe(htmlHdr);
    expect(factory.getSplitter('html-section')).toBe(htmlSec);
    expect(factory.getSplitter('markdown')).toBe(mdDr);
    expect(factory.getSplitter('code')).toBe(code);
    expect(factory.getSplitter('latex')).toBe(latex);
    expect(factory.getSplitter('semantic')).toBe(semantic);
  });
});
