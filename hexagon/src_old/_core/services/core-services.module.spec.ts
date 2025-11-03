import { Test } from '@nestjs/testing';
import { CoreServicesModule } from './core-services.module';
import { MyLogger } from './logger/logger.service';
import { RequestContextService } from './logger/request-context.service';
import { AllExceptionsFilter } from '../errors/all-exceptions.filter';
import { HttpExceptionFilter } from '../errors/http-exception.filter';

describe('CoreServicesModule', () => {
  it('provides and exports logging and filters', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreServicesModule],
    }).compile();
    const logger = moduleRef.get(MyLogger);
    const ctx = moduleRef.get(RequestContextService);
    const all = moduleRef.get(AllExceptionsFilter);
    const http = moduleRef.get(HttpExceptionFilter);
    expect(logger).toBeDefined();
    expect(ctx).toBeDefined();
    expect(all).toBeDefined();
    expect(http).toBeDefined();
  });
});
