import { CsrfMiddleware, CsrfValidationMiddleware } from './csrf.middleware';

describe('CsrfMiddleware', () => {
  it('sets token cookie on GET', () => {
    const mw = new CsrfMiddleware();
    const req: any = { method: 'GET' };
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();
    mw.use(req, res, next);
    expect(res.cookie).toHaveBeenCalledWith(
      'csrf-token',
      expect.any(String),
      expect.objectContaining({ httpOnly: false, sameSite: 'strict' }),
    );
    expect(next).toHaveBeenCalled();
  });
});

describe('CsrfValidationMiddleware', () => {
  it('rejects when header/cookie missing or not equal', () => {
    const mw = new CsrfValidationMiddleware();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res: any = { status };
    mw.use({ method: 'POST', cookies: {}, headers: {} } as any, res, jest.fn());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ message: 'Invalid CSRF token' });
  });

  it('passes when header matches cookie', () => {
    const mw = new CsrfValidationMiddleware();
    const next = jest.fn();
    mw.use(
      {
        method: 'PUT',
        cookies: { 'csrf-token': 'abc' },
        headers: { 'x-csrf-token': 'abc' },
      } as any,
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalled();
  });
});
