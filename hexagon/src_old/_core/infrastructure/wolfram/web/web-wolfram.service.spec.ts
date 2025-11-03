import { Test } from '@nestjs/testing';
import { WebWolframService } from './web-wolfram.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MyLogger } from '../../../services/logger/logger.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebWolframService', () => {
  let service: WebWolframService;
  const logger: Partial<MyLogger> = {
    info: jest.fn(),
    error: jest.fn(),
  } as any;

  function makeModule(apiKey?: string) {
    return Test.createTestingModule({
      providers: [
        WebWolframService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'WOLFRAM_ALPHA_API_KEY' ? apiKey : undefined,
          },
        },
        { provide: MyLogger, useValue: logger },
      ],
    }).compile();
  }

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns error when API key missing', async () => {
    const module = await makeModule(undefined);
    service = module.get(WebWolframService);
    const res = await service.execute('2+2');
    expect(res.success).toBe(false);
    expect(res.error?.message).toMatch(/API key is not configured/);
  });

  it('returns data on successful query result', async () => {
    const module = await makeModule('key123');
    service = module.get(WebWolframService);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        queryresult: {
          success: true,
          pods: [{ subpods: [{ plaintext: '4' }] }],
        },
      },
    } as any);
    const res = await service.execute('2+2');
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.interpretation).toBe('4');
  });

  it('returns error payload on API non-success', async () => {
    const module = await makeModule('key123');
    service = module.get(WebWolframService);
    mockedAxios.get.mockResolvedValueOnce({
      data: { queryresult: { success: false, error: { msg: 'nope' } } },
    } as any);
    const res = await service.execute('bad');
    expect(res.success).toBe(false);
    expect(res.error?.message).toContain('Failed to process query');
  });
});
