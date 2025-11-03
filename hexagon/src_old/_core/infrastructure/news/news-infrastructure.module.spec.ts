import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { NewsInfrastructureModule } from './news-infrastructure.module';
import { NewsInfrastructureService } from './services/news-infrastructure.service';
import { MyLogger } from '@core/services/logger/logger.service';

describe('NewsInfrastructureModule', () => {
  it('provides and exports NewsInfrastructureService', async () => {
    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        NewsInfrastructureModule,
      ],
    })
      .overrideProvider(MyLogger)
      .useValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      });
    const mod = await builder.compile();
    const svc = mod.get(NewsInfrastructureService);
    expect(svc).toBeDefined();
  });
});
