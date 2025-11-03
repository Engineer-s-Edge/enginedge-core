jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { OcrRetriever } from './ocr.retriever';
import { MyLogger } from '@core/services/logger/logger.service';

describe('OcrRetriever (behavior)', () => {
  const logger = new (MyLogger as any)();

  it('converts base64 to buffers, passes options, and returns mapped results', async () => {
    // base64 for 'short' (5 chars) and 'a much longer text' (20+)
    const img1 = Buffer.from('short', 'utf8').toString('base64');
    const img2 = Buffer.from('a much longer text', 'utf8').toString('base64');

    const seen: { buffers?: Buffer[]; opts?: any } = {};
    const mockOcr = {
      batchRecognize: jest.fn(async (buffers: Buffer[], opts: any) => {
        seen.buffers = buffers;
        seen.opts = opts;
        // Return texts directly (no filtering here)
        return buffers.map((b) => b.toString('utf8'));
      }),
    } as any;

    const tool = new OcrRetriever(logger as any, mockOcr);
    const res = await tool.execute({
      name: 'ocr.retrieve',
      args: { imagesBase64: [img1, img2], lang: 'eng', minLength: 3 },
    } as any);

    expect(res.success).toBe(true);
    const out = (res as any).output;
    expect(out.mimeType).toBe('application/json');
    expect(out.data.ok).toBe(true);
    expect(out.data.data).toEqual([
      { index: 0, text: 'short' },
      { index: 1, text: 'a much longer text' },
    ]);

    // Verify buffers and options passed to OCR service
    expect(mockOcr.batchRecognize).toHaveBeenCalledTimes(1);
    expect(seen.buffers).toHaveLength(2);
    expect(Buffer.isBuffer(seen.buffers![0])).toBe(true);
    expect(seen.buffers![0].toString('utf8')).toBe('short');
    expect(seen.buffers![1].toString('utf8')).toBe('a much longer text');
    expect(seen.opts).toEqual({ lang: 'eng', minLength: 3 });
  });

  it('reflects minLength filtering from OCR service (indexes from filtered array)', async () => {
    // base64 for 'no' (2) and 'sufficient' (9)
    const img1 = Buffer.from('no', 'utf8').toString('base64');
    const img2 = Buffer.from('sufficient', 'utf8').toString('base64');

    const mockOcr = {
      batchRecognize: jest.fn(async (buffers: Buffer[], opts: any) => {
        const texts = buffers.map((b) => b.toString('utf8'));
        const min = opts?.minLength ?? 5;
        return texts.filter((t) => t.length >= min);
      }),
    } as any;

    const tool = new OcrRetriever(logger as any, mockOcr);
    const res = await tool.execute({
      name: 'ocr.retrieve',
      args: { imagesBase64: [img1, img2], lang: 'eng', minLength: 5 },
    } as any);

    expect(res.success).toBe(true);
    const data = (res as any).output.data.data;
    // Only 'sufficient' remains; index should be 0 because mapping uses filtered array ordering
    expect(data).toEqual([{ index: 0, text: 'sufficient' }]);
  });

  it('fails validation when imagesBase64 missing', async () => {
    const tool = new OcrRetriever(
      logger as any,
      { batchRecognize: jest.fn() } as any,
    );
    const res = await tool.execute({ name: 'ocr.retrieve', args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('returns failure when OCR service throws', async () => {
    const mockOcr = {
      batchRecognize: jest.fn(async () => {
        throw new Error('ocr failed');
      }),
    } as any;
    const tool = new OcrRetriever(logger as any, mockOcr);
    const img = Buffer.from('text', 'utf8').toString('base64');
    const res = await tool.execute({
      name: 'ocr.retrieve',
      args: { imagesBase64: [img] },
    } as any);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('Error');
      expect(res.error.message).toBe('ocr failed');
    }
  });
});
