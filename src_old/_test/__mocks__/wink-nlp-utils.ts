// Mock for wink-nlp-utils
const nlpUtils = {
  string: {
    tokenize0: (input: string) => {
      // Return array of tokens, not string
      return input
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length > 0);
    },
  },
  tokens: {
    stem: (tokens: string[]) => {
      // Simple stemming - return array of strings
      return tokens.map((token) => token.replace(/s$/, ''));
    },
  },
};

export default nlpUtils;
