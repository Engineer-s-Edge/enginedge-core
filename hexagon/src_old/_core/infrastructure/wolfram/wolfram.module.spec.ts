import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { WolframModule } from './wolfram.module';
import { WolframService } from './wolfram.service';
import { LocalWolframService } from './local-kernel/local-wolfram.service';
import { WebWolframService } from './web/web-wolfram.service';
import { MyLogger } from '../../services/logger/logger.service';

describe('WolframModule', () => {
  it('exports WolframService and wires local/web providers', async () => {
    const builder = Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), WolframModule],
    })
      .overrideProvider(MyLogger)
      .useValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      });
    const mod = await builder.compile();
    expect(mod.get(WolframService)).toBeDefined();
    // Ensure providers can be resolved in the context
    expect(mod.get(LocalWolframService)).toBeDefined();
    expect(mod.get(WebWolframService)).toBeDefined();
  });
});
