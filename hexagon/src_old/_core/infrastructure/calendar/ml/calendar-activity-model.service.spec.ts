import { CalendarActivityModelService } from './calendar-activity-model.service';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('CalendarActivityModelService', () => {
  let service: CalendarActivityModelService;
  let http: any;

  // Silence Nest Logger output for this test suite
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    http = {
      post: jest.fn(),
      get: jest.fn(),
    } as Partial<HttpService> as any;
    service = new CalendarActivityModelService(http as HttpService);
  });

  it('predict adapts ML response to legacy shape', async () => {
    http.post.mockReturnValue(
      of({
        data: {
          recommendations: [
            {
              time_slot: 1,
              hour: 10,
              probability: 0.8,
              confidence: 0.7,
              recommended: true,
            },
            {
              time_slot: 2,
              hour: 11,
              probability: 0.6,
              confidence: 0.5,
              recommended: false,
            },
          ],
        },
      }),
    );

    const res = await service.predict('U1', {
      eventData: { title: 'Test' },
      userContext: {},
    });
    expect(res.recommendation).toBe('approve');
    expect(res.raw_recommendations.length).toBe(2);
  });

  it('predict returns fallback on HTTP error', async () => {
    http.post.mockReturnValue(throwError(() => new Error('down')));
    const res = await service.predict('U1', {
      eventData: { title: 'X' },
      userContext: {},
    });
    expect(res.suggestions[0]).toContain('Could not connect to ML service');
  });

  it('checkMlServiceHealth returns ok on 200 and error otherwise', async () => {
    http.get.mockReturnValueOnce(of({ data: { status: 'ok' } }));
    await expect(service.checkMlServiceHealth()).resolves.toEqual({
      status: 'ok',
      details: { status: 'ok' },
    });

    http.get.mockReturnValueOnce(throwError(() => new Error('fail')));
    const res = await service.checkMlServiceHealth();
    expect(res.status).toBe('error');
  });
});
