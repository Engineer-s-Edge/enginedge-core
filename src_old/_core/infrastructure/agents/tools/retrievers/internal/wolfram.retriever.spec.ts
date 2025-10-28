jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { WolframRetriever } from './wolfram.retriever';
import { MyLogger } from '@core/services/logger/logger.service';
import { ConfigService } from '@nestjs/config';

describe('WolframRetriever (behavior)', () => {
  const logger = new (MyLogger as any)();
  const cfg = new ConfigService() as any;

  it('returns ok=true when Wolfram service succeeds', async () => {
    const mockWolfram = {
      execute: jest.fn(async () => ({ success: true, data: { value: 42 } })),
    } as any;
    const tool = new WolframRetriever(
      logger,
      cfg,
      {} as any,
      {} as any,
      mockWolfram,
    );
    const res = await tool.execute({
      name: 'wolfram.retrieve',
      args: { query: '2+2' } as any,
    });
    expect(res.success).toBe(true);
    const out = (res as any).output;
    expect(out.mimeType).toBe('application/json');
    expect(out.data.ok).toBe(true);
    expect(out.data.data).toEqual({ success: true, data: { value: 42 } });
    expect(mockWolfram.execute).toHaveBeenCalledWith('2+2');
  });

  it('returns ok=false when Wolfram service indicates failure', async () => {
    const mockWolfram = {
      execute: jest.fn(async () => ({
        success: false,
        error: { message: 'bad' },
      })),
    } as any;
    const tool = new WolframRetriever(
      logger,
      cfg,
      {} as any,
      {} as any,
      mockWolfram,
    );
    const res = await tool.execute({
      name: 'wolfram.retrieve',
      args: { query: 'invalid' } as any,
    });
    expect(res.success).toBe(true);
    const out = (res as any).output;
    expect(out.data.ok).toBe(false);
    expect(out.data.data).toEqual({
      success: false,
      error: { message: 'bad' },
    });
  });

  it('fails validation when query missing', async () => {
    const tool = new WolframRetriever(
      logger,
      cfg,
      {} as any,
      {} as any,
      { execute: jest.fn() } as any,
    );
    const res = await tool.execute({
      name: 'wolfram.retrieve',
      args: {} as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('returns failure when Wolfram service throws', async () => {
    const mockWolfram = {
      execute: jest.fn(async () => {
        throw new Error('wolfram down');
      }),
    } as any;
    const tool = new WolframRetriever(
      logger,
      cfg,
      {} as any,
      {} as any,
      mockWolfram,
    );
    const res = await tool.execute({
      name: 'wolfram.retrieve',
      args: { query: '2+2' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('Error');
      expect(res.error.message).toBe('wolfram down');
    }
  });
});
