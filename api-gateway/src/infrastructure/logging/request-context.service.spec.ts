import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return undefined when outside of context', () => {
    expect(service.getRequestId()).toBeUndefined();
    expect(service.getCorrelationId()).toBeUndefined();
  });

  it('should store and retrieve context', () => {
    service.runWith({ requestId: 'req-1', userId: 'user-1' }, () => {
      expect(service.getRequestId()).toBe('req-1');
      expect(service.getUserId()).toBe('user-1');
      expect(service.getStore()).toEqual({
        requestId: 'req-1',
        userId: 'user-1',
      });
    });
  });

  it('should handle nested contexts (though ALS usually handles this, we verify standard behavior)', () => {
    service.runWith({ requestId: 'outer' }, () => {
      expect(service.getRequestId()).toBe('outer');
      service.runWith({ requestId: 'inner' }, () => {
        expect(service.getRequestId()).toBe('inner');
      });
      expect(service.getRequestId()).toBe('outer');
    });
  });

  it('should return service name if set', () => {
    service.runWith({ serviceName: 'api' }, () => {
      expect(service.getServiceName()).toBe('api');
    });
  });

  it('should return correlation id if set', () => {
    service.runWith({ correlationId: 'corr-1' }, () => {
      expect(service.getCorrelationId()).toBe('corr-1');
    });
  });
});
