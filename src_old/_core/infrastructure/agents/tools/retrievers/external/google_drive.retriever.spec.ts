jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

// Mock googleapis before importing the retriever
const filesListMock = jest.fn();
const setCredsMock = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest
        .fn()
        .mockImplementation(() => ({ setCredentials: setCredsMock })),
    },
    drive: jest.fn(() => ({ files: { list: filesListMock } })),
  },
}));

import { google } from 'googleapis';
import { GoogleDriveRetriever } from './google_drive.retriever';

describe('GoogleDriveRetriever (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    filesListMock.mockReset();
    (google.drive as unknown as jest.Mock).mockClear?.();
    (google.auth.OAuth2 as unknown as jest.Mock).mockClear?.();
    setCredsMock.mockClear();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fails validation for extra unexpected arg', async () => {
    const tool = new GoogleDriveRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { extra: 1 } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('uses env OAuth creds, applies ragConfig.top_k to pageSize, defaults fields, and returns files', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    const items = [
      { id: 'f1', name: 'Doc 1' },
      { id: 'f2', name: 'Doc 2' },
      { id: 'f3', name: 'Doc 3' },
    ];
    filesListMock.mockImplementation(async (opts: any) => {
      expect(opts.q).toBe("name contains 'report'");
      expect(opts.pageSize).toBe(3); // from ragConfig.top_k
      expect(opts.fields).toBe(
        'files(id,name,mimeType,webViewLink,modifiedTime,owners)',
      );
      return { data: { files: items } };
    });

    const tool = new GoogleDriveRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { query: "name contains 'report'", ragConfig: { top_k: 3 } as any },
    });

    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.mimeType).toBe('application/json');
      expect(out.data.ok).toBe(true);
      expect((out.data.data as any[]).length).toBe(3);
      expect(setCredsMock).toHaveBeenCalledWith({ refresh_token: 'refresh' });
    }
  });

  it('allows overriding pageSize and fields via args', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    filesListMock.mockImplementation(async (opts: any) => {
      expect(opts.pageSize).toBe(5); // arg overrides ragConfig
      expect(opts.fields).toBe('files(id,name)');
      return { data: { files: [{ id: 'x' }] } };
    });

    const tool = new GoogleDriveRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: {
        pageSize: 5,
        fields: 'files(id,name)',
        ragConfig: { top_k: 2 } as any,
      },
    });

    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect((out.data.data as any[])[0].id).toBe('x');
    }
  });

  it('fails when OAuth env is missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;

    const tool = new GoogleDriveRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { ragConfig: { top_k: 2 } as any } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.message).toMatch(/Google OAuth credentials missing/);
    }
  });

  it('returns failure when Drive API throws', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    filesListMock.mockRejectedValue(new Error('Drive down'));

    const tool = new GoogleDriveRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { ragConfig: { top_k: 1 } as any } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/Drive down/);
  });
});
