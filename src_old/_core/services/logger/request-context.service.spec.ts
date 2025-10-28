import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  it('stores and retrieves requestId via ALS', async () => {
    const svc = new RequestContextService();
    const result = await new Promise<string>((resolve) => {
      svc.runWith({ requestId: 'rid-1' }, () => {
        resolve(svc.getRequestId()!);
      });
    });
    expect(result).toBe('rid-1');
  });
});
