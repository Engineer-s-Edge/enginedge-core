import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { MyLogger } from '../services/logger/logger.service';

function makeHost() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const req: any = { method: 'GET', url: '/test' };
  return {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const logger: Partial<MyLogger> = { error: jest.fn() } as any;

  it('handles HttpException with proper status and message', () => {
    const filter = new AllExceptionsFilter(logger as any);
    const host = makeHost();
    const exc = new HttpException(
      { message: 'bad', error: 'Bad' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exc, host);
    const res: any = (host.switchToHttp() as any).getResponse();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        path: '/test',
        message: 'bad',
      }),
    );
  });

  it('handles generic Error as 500', () => {
    const filter = new AllExceptionsFilter(logger as any);
    const host = makeHost();
    filter.catch(new Error('oops'), host);
    const res: any = (host.switchToHttp() as any).getResponse();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, path: '/test' }),
    );
  });
});
