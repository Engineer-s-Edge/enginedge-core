import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WinstonLoggerAdapter } from './winston-logger.adapter';
import { RequestContextService } from './request-context.service';
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('winston', () => {
  const mLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
    // Add other methods if needed
  };

  // winston.format is a function AND has properties
  // It returns a FormatWrap which is a function that returns a Format
  const mFormat: any = jest.fn().mockImplementation(() => {
    return jest.fn().mockReturnValue({ transform: jest.fn() });
  });
  mFormat.combine = jest.fn();
  mFormat.timestamp = jest.fn();
  mFormat.errors = jest.fn();
  mFormat.splat = jest.fn();
  mFormat.json = jest.fn();
  mFormat.colorize = jest.fn();
  mFormat.printf = jest.fn();

  return {
    createLogger: jest.fn().mockReturnValue(mLogger),
    transports: {
      Console: jest.fn(),
      DailyRotateFile: jest.fn(),
    },
    format: mFormat,
  };
});

// Mock winston-daily-rotate-file
jest.mock('winston-daily-rotate-file', () => jest.fn());

// Mock RequestContextService
const mockRequestContextService = {
  getStore: jest.fn(),
  run: jest.fn(),
};

// Mock ConfigService
const mockConfigService = {
  get: jest.fn(),
};

// Mock fs and path
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

describe('WinstonLoggerAdapter', () => {
  let adapter: WinstonLoggerAdapter;
  let logger: winston.Logger;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup Config defaults
    mockConfigService.get.mockImplementation((key, defaultValue) => {
      if (key === 'LOG_LEVEL') return 'info';
      if (key === 'LOG_ENABLE_CONSOLE') return 'true';
      return defaultValue;
    });

    // Ensure DailyRotateFile is attached to transports
    (winston.transports as any).DailyRotateFile = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WinstonLoggerAdapter,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RequestContextService, useValue: mockRequestContextService },
      ],
    }).compile();

    adapter = module.get<WinstonLoggerAdapter>(WinstonLoggerAdapter);
    // Access private logger
    logger = (adapter as any).logger;
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
    expect(winston.createLogger).toHaveBeenCalled();
  });

  describe('Logging Methods', () => {
    it('should log info', () => {
      adapter.info('test message', { foo: 'bar' });
      expect(logger.info).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          context: expect.stringContaining('{"foo":"bar"}'),
        }),
      );
    });

    it('should log debug', () => {
      adapter.debug('debug message');
      expect(logger.debug).toHaveBeenCalledWith(
        'debug message',
        expect.any(Object),
      );
    });

    // Note: 'log' method delegates to 'info' level logic in implementation details
    it('should log generic', () => {
      adapter.log('generic message');
      expect(logger.info).toHaveBeenCalledWith(
        'generic message',
        expect.any(Object),
      );
    });
  });

  describe('Context Handling', () => {
    it('should include request context', () => {
      mockRequestContextService.getStore.mockReturnValue({ requestId: '123' });
      adapter.info('msg');

      expect(logger.info).toHaveBeenCalledWith(
        'msg',
        expect.objectContaining({
          context: expect.stringContaining('"requestId":"123"'),
        }),
      );
    });
  });

  describe('Initialization Logic', () => {
    it('should create log directory if missing', async () => {
      const fsMock = require('fs');
      fsMock.existsSync.mockReturnValue(false);

      // Re-bootstrap
      const module = await Test.createTestingModule({
        providers: [
          WinstonLoggerAdapter,
          { provide: ConfigService, useValue: mockConfigService },
          {
            provide: RequestContextService,
            useValue: mockRequestContextService,
          },
        ],
      }).compile();

      expect(fsMock.mkdirSync).toHaveBeenCalled();
    });
  });
});
