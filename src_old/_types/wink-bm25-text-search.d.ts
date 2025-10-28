declare module 'wink-bm25-text-search' {
  export interface BM25Engine {
    defineConfig(cfg: {
      fldWeights: Record<string, number>;
      bm25Params?: { k?: number; b?: number; k1?: number };
      ovFldNames?: string[];
    }): true;
    definePrepTasks(
      tasks: Array<(input: string) => string[]>,
      field?: string,
    ): number;
    addDoc(doc: { text: string }, id: string): number;
    learn(doc: { text: string }, id: string): number;
    consolidate(fp?: number): true;
    search(
      text: string,
      limit?: number,
      filter?: (fv: any, params?: any) => boolean,
      params?: any,
    ): Array<{ id: string; value: number }>;
    predict(
      text: string,
      limit?: number,
      filter?: (fv: any, params?: any) => boolean,
      params?: any,
    ): Array<{ id: string; value: number }>;
    exportJSON(): string;
    importJSON(json: string): true;
    reset(): true;
    getTotalDocs(): number;
    getDocs(): any[];
    getTokens(): any[];
    getConfig(): any;
    getIDF(): any;
    getTotalCorpusLength(): number;
  }

  function BM25(): BM25Engine;
  export = BM25;
}
