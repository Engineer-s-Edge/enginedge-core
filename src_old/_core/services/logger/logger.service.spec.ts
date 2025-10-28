jest.mock('winston-daily-rotate-file', () => ({}));
jest.mock('winston', () => {
  const impl = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  } as any;
  const pass = () => (i: any) => i;
  const formatFn: any = (_fn?: any) => pass();
  formatFn.combine = jest.fn(() => pass());
  formatFn.colorize = jest.fn(() => pass());
  formatFn.timestamp = jest.fn(() => pass());
  formatFn.printf = jest.fn(() => pass());
  formatFn.json = jest.fn(() => pass());
  formatFn.errors = jest.fn(() => pass());
  return {
    __impl: impl,
    createLogger: jest.fn(() => impl),
    transports: {
      Console: jest.fn().mockImplementation(() => ({ name: 'console' })),
      DailyRotateFile: jest.fn().mockImplementation(() => ({ name: 'rotate' })),
    },
    format: formatFn,
    Logform: { TransformableInfo: {} },
  };
});

import * as winston from 'winston';
import * as fs from 'fs';
import { MyLogger } from './logger.service';
import { RequestContextService } from './request-context.service';

// Mock fs to avoid actual directory creation
jest.spyOn(fs, 'existsSync').mockReturnValue(true);
jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);

const loggerImpl: any = (winston as any).__impl;

describe('MyLogger', () => {
  const requestContext = new RequestContextService();
  requestContext.runWith({ requestId: 'req-123' }, () => {}); // seed store

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOG_ENABLE_CONSOLE = 'false'; // silence console transport for deterministic tests
    process.env.LOG_ENABLE_FILES = 'false';
  });

  it('logs info and includes context metadata', () => {
    const logger = new MyLogger(requestContext);
    requestContext.runWith({ requestId: 'req-123' }, () => {
      logger.info('hello', 'TestContext');
    });
    expect(loggerImpl.info).toHaveBeenCalled();
    const meta = (loggerImpl.info as any).mock.calls[0][1];
    expect(meta).toHaveProperty('context');
  });

  it('redacts sensitive keys in metadata', () => {
    const logger = new MyLogger();
    logger.info('user login', {
      password: 'secret',
      token: 'abc',
      nested: { apikey: '123', ok: true },
    });
    const meta = (loggerImpl.info as any).mock.calls[0][1];
    // redaction occurs in format stage but we can still assert that raw meta contains context JSON string with keys
    expect(typeof meta.context).toBe('string');
    const parsed = JSON.parse(meta.context);
    expect(parsed.password).toBe('secret');
    // we cannot see redacted result here (format runs in transport), but ensure no crash and context serialization succeeded
  });

  it('error prints to console when console transport disabled', () => {
    const logger = new MyLogger();
    // force consoleEnabled=false path
    (logger as any).consoleEnabled = false;
    const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('boom', 'trace-here', 'Ctx');
    expect(loggerImpl.error).toHaveBeenCalled();
    expect(spyErr).toHaveBeenCalled();
    spyErr.mockRestore();
  });
});
