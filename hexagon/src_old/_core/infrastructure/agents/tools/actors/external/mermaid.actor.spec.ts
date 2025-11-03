jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import axios from 'axios';
jest.mock('axios');

import { MermaidActor } from './mermaid.actor';

describe('MermaidActor (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    (axios.post as jest.Mock).mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('rejects missing required diagram field', async () => {
    const tool = new MermaidActor();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('renders default svg via env server, returns base64 payload and mime', async () => {
    process.env.KROKI_URL = 'https://kroki.example';
    const svg = Buffer.from('<svg/>');
    (axios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: svg });

    const tool = new MermaidActor();
    const res = await tool.execute({
      name: tool.name,
      args: { diagram: 'graph TD; A-->B;' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url, body, config] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://kroki.example/mermaid/svg');
      expect(body).toBe('graph TD; A-->B;');
      expect(config.headers['Content-Type']).toBe('text/plain');

      const out = (res as any).output;
      expect(out.mimeType).toBe('image/svg+xml');
      expect(out.data.ok).toBe(true);
      expect(out.data.data.encoding).toBe('base64');
      expect(out.data.data.length).toBe(svg.length);
      expect(Buffer.from(out.data.data.data, 'base64').toString()).toBe(
        svg.toString(),
      );
    }
  });

  it('renders png via custom serverUrl arg', async () => {
    const png = Buffer.from([1, 2, 3, 4]);
    (axios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: png });

    const tool = new MermaidActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        diagram: 'flowchart LR; X-->Y;',
        format: 'png',
        serverUrl: 'https://my.kroki/',
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://my.kroki/mermaid/png');
      const out = (res as any).output;
      expect(out.mimeType).toBe('image/png');
      expect(out.data.data.format).toBe('png');
    }
  });

  it('returns failure when axios throws', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('kroki down'));
    const tool = new MermaidActor();
    const res = await tool.execute({
      name: tool.name,
      args: { diagram: 'graph TD; A-->B;' },
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/kroki down/);
  });
});
