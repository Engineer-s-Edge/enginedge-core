import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { MyLogger } from '../services/logger/logger.service';

function makeHost() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const req: any = { method: 'POST', url: '/api', headers: {} };
  return {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  const logger: Partial<MyLogger> = {
    warn: jest.fn(),
    error: jest.fn(),
  } as any;

  it('formats array message as comma-joined and warns for 4xx', () => {
    const filter = new HttpExceptionFilter(logger as any);
    const host = makeHost();
    const exc = new BadRequestException({ message: ['a', 'b'], error: 'Bad' });
    filter.catch(exc, host);
    const res: any = (host.switchToHttp() as any).getResponse();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'a, b', error: 'Bad' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs error for 5xx and uses string message', () => {
    const filter = new HttpExceptionFilter(logger as any);
    const host = makeHost();
    const exc = new InternalServerErrorException('Kaput');
    filter.catch(exc, host);
    expect(logger.error).toHaveBeenCalled();
  });
});
