jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

// Mock googleapis Drive client
const listMock = jest.fn();
const getMock = jest.fn();
const createMock = jest.fn();
const deleteMock = jest.fn();
const permCreateMock = jest.fn();
const setCredsMock = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest
        .fn()
        .mockImplementation(() => ({ setCredentials: setCredsMock })),
    },
    drive: jest.fn(() => ({
      files: {
        list: listMock,
        get: getMock,
        create: createMock,
        delete: deleteMock,
      },
      permissions: { create: permCreateMock },
    })),
  },
}));

import { GoogleDriveActor } from './google_drive.actor';

describe('GoogleDriveActor (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    listMock.mockReset();
    getMock.mockReset();
    createMock.mockReset();
    deleteMock.mockReset();
    permCreateMock.mockReset();
    setCredsMock.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fails validation for bad args', async () => {
    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { nope: 1 } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('fails when OAuth env missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;
    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'list' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success)
      expect(res.error.message).toMatch(/Google OAuth credentials missing/);
  });

  it('list: passes pageSize and returns files', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    listMock.mockImplementation(async (opts: any) => {
      expect(opts.pageSize).toBe(5);
      expect(String(opts.fields)).toContain('files(');
      return { data: { files: [{ id: '1' }, { id: '2' }] } };
    });

    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'list', pageSize: 5 },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
      expect(out.data.data.length).toBe(2);
      expect(setCredsMock).toHaveBeenCalledWith({ refresh_token: 'refresh' });
    }
  });

  it('get: requires fileId and returns the file', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    getMock.mockImplementation(async (opts: any) => {
      expect(opts.fileId).toBe('abc');
      expect(opts.fields).toBe('*');
      return { data: { id: 'abc', name: 'Doc' } };
    });

    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'get', fileId: 'abc' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
      expect(out.data.data.id).toBe('abc');
    }
  });

  it('get: throws validation error when fileId missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'get' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('upload: requires name/mimeType/contentBase64 and returns created file', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    createMock.mockImplementation(async (opts: any) => {
      expect(opts.requestBody.name).toBe('hello.txt');
      expect(opts.media.mimeType).toBe('text/plain');
      expect(Buffer.isBuffer(opts.media.body)).toBe(true);
      return { data: { id: 'new1', name: 'hello.txt' } };
    });

    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        op: 'upload',
        name: 'hello.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('hi').toString('base64'),
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.data.id).toBe('new1');
    }
  });

  it('upload: throws validation error when required fields missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'upload', name: 'x' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('delete: requires fileId and returns ok', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    deleteMock.mockResolvedValueOnce(undefined);

    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'delete', fileId: 'gone' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
    }
  });

  it('delete: throws validation error when fileId missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'delete' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('share: requires fileId, role, type and returns ok', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    permCreateMock.mockResolvedValueOnce(undefined);

    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'share', fileId: 'f1', role: 'reader', type: 'anyone' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
    }
  });

  it('share: throws validation error when required fields missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    const tool = new GoogleDriveActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'share', fileId: 'f1' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('returns failure when Drive API throws', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    listMock.mockRejectedValueOnce(new Error('drive down'));
    const tool = new GoogleDriveActor();
    const res = await tool.execute({ name: tool.name, args: { op: 'list' } });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/drive down/);
  });
});
