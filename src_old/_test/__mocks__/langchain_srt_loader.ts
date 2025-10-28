export class SRTLoader {
  private blob: Blob;
  constructor(blob: Blob) {
    this.blob = blob;
  }
  async load(): Promise<
    Array<{ pageContent: string; metadata: Record<string, any> }>
  > {
    // Return a minimal mock document
    return [
      {
        pageContent: 'Mock SRT content',
        metadata: { mocked: true, size: (this.blob as any).size ?? 0 },
      },
    ];
  }
}
