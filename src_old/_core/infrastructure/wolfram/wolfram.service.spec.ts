import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { WolframService } from './wolfram.service';
import { WolframModule } from './wolfram.module';
import axios from 'axios';

describe('WolframService (integration)', () => {
  let service: WolframService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), WolframModule],
    }).compile();

    service = module.get<WolframService>(WolframService);
  });

  it('should compute a simple expression via local kernel if available', async () => {
    const url = process.env.WOLFRAM_LOCAL_URL || 'http://wolfram-kernel:5000';
    // Quick health check. If not reachable, skip the test gracefully.
    try {
      await axios.get(`${url}/health`, { timeout: 2000 });
    } catch {
      return; // skip: kernel not available in this environment
    }

    const result = await service.executeLocalQuery('N[Pi, 20]');
    expect(result.success).toBe(true);
    expect(result.data).toContain('3.14159');
  });

  it('should route via facade default to local when no target provided', async () => {
    const url = process.env.WOLFRAM_LOCAL_URL || 'http://wolfram-kernel:5000';
    try {
      await axios.get(`${url}/health`, { timeout: 2000 });
    } catch {
      return; // skip when kernel not available
    }
    const result = await service.execute('N[Pi, 10]');
    expect(result.success).toBe(true);
    expect(result.source).toBe('local_wolfram_kernel');
  });
});
