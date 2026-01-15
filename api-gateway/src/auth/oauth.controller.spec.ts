import { OAuthController } from './oauth.controller';
import { IdentityClientService } from './identity-client.service';

describe('OAuthController', () => {
  let controller: OAuthController;
  let mockIdentity: Partial<IdentityClientService>;

  beforeEach(() => {
    mockIdentity = {
      oauthAuth: jest.fn().mockResolvedValue({ url: 'http://redirect' }),
      oauthCallback: jest.fn().mockResolvedValue({ url: 'http://success' }),
      oauthUnlink: jest.fn().mockResolvedValue({ success: true }),
    };
    controller = new OAuthController(mockIdentity as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('initiateAuth', () => {
    it('should return redirect url', async () => {
      const result = await controller.initiateAuth('google');
      expect(result).toEqual({ url: 'http://redirect' });
      expect(mockIdentity.oauthAuth).toHaveBeenCalledWith('google');
    });
  });

  describe('handleCallback', () => {
    it('should handle callback and redirect', async () => {
      const res = { redirect: jest.fn() };
      await controller.handleCallback('google', 'code', 'state', res as any);
      expect(mockIdentity.oauthCallback).toHaveBeenCalledWith('google', 'code', 'state');
      expect(res.redirect).toHaveBeenCalledWith('http://success');
    });

    it('should return result if no res provided', async () => {
      const result = await controller.handleCallback('google', 'code', 'state', undefined);
      expect(result).toEqual({ url: 'http://success' });
    });
  });

  describe('unlink', () => {
    it('should unlink provider', async () => {
      const result = await controller.unlink('google', 'u1');
      expect(result).toEqual({ success: true });
      expect(mockIdentity.oauthUnlink).toHaveBeenCalledWith('google', 'u1');
    });
  });
});
