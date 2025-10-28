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

import { VirusTotalActor } from './virustotal.actor';

describe('VirusTotalActor (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    (axios.post as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fails validation when op missing', async () => {
    const tool = new VirusTotalActor();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('url-scan: requires API key via env or arg; posts form data and returns ok', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'ENV_KEY';
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { data: { id: 'scan123' } },
    });
    const tool = new VirusTotalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'url-scan', url: 'https://example.com' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url, body, config] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://www.virustotal.com/api/v3/urls');
      expect(String(body)).toContain('url=https%3A%2F%2Fexample.com');
      expect(config.headers['x-apikey']).toBe('ENV_KEY');
    }
  });

  it('url-scan: token arg overrides env', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'ENV_KEY';
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: {} });
    const tool = new VirusTotalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'url-scan', apiKey: 'ARG_KEY', url: 'https://a' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [, , config] = (axios.post as jest.Mock).mock.calls[0];
      expect(config.headers['x-apikey']).toBe('ARG_KEY');
    }
  });

  it('url-scan: throws validation error when url missing', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'ENV_KEY';
    const tool = new VirusTotalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'url-scan' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('url-report: requires resource and calls GET', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'ENV_KEY';
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: { data: { id: 'scan123' } },
    });
    const tool = new VirusTotalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'url-report', resource: 'scan123' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url, config] = (axios.get as jest.Mock).mock.calls[0];
      expect(url).toBe('https://www.virustotal.com/api/v3/analyses/scan123');
      expect(config.headers['x-apikey']).toBe('ENV_KEY');
    }
  });

  it('file-report: requires resource and calls GET', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'ENV_KEY';
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: { data: { id: 'hash123' } },
    });
    const tool = new VirusTotalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'file-report', resource: 'hash123' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url] = (axios.get as jest.Mock).mock.calls[0];
      expect(url).toBe('https://www.virustotal.com/api/v3/files/hash123');
    }
  });

  it('returns failure when API key missing', async () => {
    delete process.env.VIRUSTOTAL_API_KEY;
    const tool = new VirusTotalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'url-report', resource: 'scan123' },
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('returns failure when axios throws', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'ENV_KEY';
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('vt down'));
    const tool = new VirusTotalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'url-report', resource: 'scan123' },
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/vt down/);
  });
});
