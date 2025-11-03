import { Test, TestingModule } from '@nestjs/testing';
import { LocalWolframService } from './local-wolfram.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MyLogger } from '../../../services/logger/logger.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocalWolframService', () => {
  let service: LocalWolframService;
  const config = {
    get: jest.fn((k: string) =>
      k === 'WOLFRAM_LOCAL_URL' ? 'http://localhost:5001' : undefined,
    ),
  } as any;
  const logger: Partial<MyLogger> = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalWolframService,
        { provide: ConfigService, useValue: config },
        { provide: MyLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(LocalWolframService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('execute returns success payload on kernel success', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, result: 42 },
    } as any);
    const res = await service.execute('2+2');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:5001/compute',
      { code: '2+2' },
      { timeout: 30000 },
    );
    expect(res).toEqual({
      data: 42,
      interpretation: expect.stringContaining('2+2'),
      success: true,
      source: 'local_wolfram_kernel',
    });
  });

  it('execute returns error payload on kernel failure', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: false, error: 'boom' },
    } as any);
    const res = await service.execute('bad');
    expect(res.success).toBe(false);
    expect(res.error?.message).toContain('Failed to process query');
  });

  it('execute catches axios error and returns details', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { message: 'ERR' } },
      message: 'Network',
    });
    const res = await service.execute('f(x)');
    expect(res.success).toBe(false);
    expect(res.error?.details).toEqual({ message: 'ERR' });
  });
});
