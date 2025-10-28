jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

const recognizeMock = jest.fn(async (_buf: Buffer, _cfg: any) => ' Hello OCR ');
jest.mock('node-tesseract-ocr', () => ({ recognize: recognizeMock }));

import { OcrService } from './ocr';

describe('OcrService', () => {
  it('recognizeText returns trimmed text and calls tesseract with merged config', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const svc = new OcrService(logger);
    const buf = Buffer.from([1, 2, 3]);
    const text = await svc.recognizeText(buf, { lang: 'eng', psm: 6 });
    expect(text).toBe('Hello OCR');
    expect(recognizeMock).toHaveBeenCalled();
  });

  it('recognizeText returns empty string on error', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const svc = new OcrService(logger);
    const buf = Buffer.from([4, 5, 6]);
    (recognizeMock as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const text = await svc.recognizeText(buf);
    expect(text).toBe('');
  });

  it('batchRecognize filters short results by minLength', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const svc = new OcrService(logger);
    const bufs = [Buffer.from([1]), Buffer.from([2]), Buffer.from([3])];
    // First call -> ' Hello OCR ', second -> ' a ', third -> 'text'
    (recognizeMock as jest.Mock)
      .mockResolvedValueOnce(' Hello OCR ')
      .mockResolvedValueOnce(' a ')
      .mockResolvedValueOnce('text');
    const results = await svc.batchRecognize(bufs, { minLength: 3 });
    expect(results).toEqual(['Hello OCR', 'text']);
  });
});
