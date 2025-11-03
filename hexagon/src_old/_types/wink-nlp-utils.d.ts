declare module 'wink-nlp-utils' {
  // String processing functions
  export interface StringFunctions {
    lowerCase(input: string): string;
    upperCase(input: string): string;
    trim(input: string): string;
    removeExtraSpaces(input: string): string;
    retainAlphaNums(input: string): string;
    extractPersonsName(input: string): string;
    extractRunOfCapitalWords(input: string): string[];
    removePunctuations(input: string): string;
    removeSplChars(input: string): string;
    removeHTMLTags(input: string): string;
    removeElisions(input: string): string;
    splitElisions(input: string): string[];
    amplifyNotElision(input: string): string;
    marker(input: string, markerChar?: string): string;
    soc(input: string): Set<string>;
    setOfChars(input: string): Set<string>;
    ngram(input: string, size: number): string[];
    edgeNGrams(input: string, sizes: number | number[]): string[];
    bong(input: string, size: number): string[];
    bagOfNGrams(input: string, size: number): string[];
    song(input: string, size: number): string[];
    setOfNGrams(input: string, size: number): Set<string>;
    sentences(input: string): string[];
    composeCorpus(input: string): string;
    tokenize0(input: string): string[];
    tokenize(input: string): string[];
    stem(input: string): string;
    phonetize(input: string): string;
    soundex(input: string): string;
  }

  // Token array processing functions
  export interface TokenFunctions {
    stem(tokens: string[]): string[];
    phonetize(tokens: string[]): string[];
    soundex(tokens: string[]): string[];
    removeWords(tokens: string[], words: string[]): string[];
    bow(tokens: string[]): Record<string, number>;
    bagOfWords(tokens: string[]): Record<string, number>;
    sow(tokens: string[]): Set<string>;
    setOfWords(tokens: string[]): Set<string>;
    propagateNegations(tokens: string[]): string[];
    bigrams(tokens: string[]): string[];
    appendBigrams(tokens: string[]): string[];
  }

  export interface NlpUtils {
    string: StringFunctions;
    tokens: TokenFunctions;
    helper: Record<string, any>;
  }

  const nlpUtils: NlpUtils;
  export default nlpUtils;
}
