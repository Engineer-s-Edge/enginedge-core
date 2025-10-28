jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { YouTubeRetriever } from './youtube.retriever';
import { MyLogger } from '@core/services/logger/logger.service';

describe('YouTubeRetriever (behavior)', () => {
  it('fails validation when videoUrl missing', async () => {
    const tool = new YouTubeRetriever(new MyLogger() as any);
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('calls loader with defaults (language="en", includeInfo=true) and maps documents', async () => {
    const logger = new (MyLogger as any)();
    const loader = {
      load: jest.fn(async (_url: string, _opts: any) => [
        { pageContent: 'Transcript line 1', metadata: { title: 'Video' } },
        { pageContent: 'Transcript line 2', metadata: { title: 'Video' } },
      ]),
    } as any;
    const tool = new YouTubeRetriever(logger, loader);
    const res = await tool.execute({
      name: 'youtube.retrieve',
      args: { videoUrl: 'https://youtu.be/abc' } as any,
    });
    expect(res.success).toBe(true);
    const out = (res as any).output.data;
    expect(out.ok).toBe(true);
    expect(out.data).toEqual([
      { content: 'Transcript line 1', metadata: { title: 'Video' } },
      { content: 'Transcript line 2', metadata: { title: 'Video' } },
    ]);
    expect(loader.load).toHaveBeenCalledWith('https://youtu.be/abc', {
      language: 'en',
      addVideoInfo: true,
    });
  });

  it('passes through provided language and includeInfo=false', async () => {
    const logger = new (MyLogger as any)();
    const loader = { load: jest.fn(async () => []) } as any;
    const tool = new YouTubeRetriever(logger, loader);
    await tool.execute({
      name: 'youtube.retrieve',
      args: { videoUrl: 'v', language: 'fr', includeInfo: false } as any,
    });
    expect(loader.load).toHaveBeenCalledWith('v', {
      language: 'fr',
      addVideoInfo: false,
    });
  });

  it('returns failure when loader throws', async () => {
    const logger = new (MyLogger as any)();
    const loader = {
      load: jest.fn(async () => {
        throw new Error('yt down');
      }),
    } as any;
    const tool = new YouTubeRetriever(logger, loader);
    const res = await tool.execute({
      name: 'youtube.retrieve',
      args: { videoUrl: 'v' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('Error');
      expect(res.error.message).toBe('yt down');
    }
  });
});
