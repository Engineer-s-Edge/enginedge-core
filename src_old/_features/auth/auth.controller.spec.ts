import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    validateUser: jest.Mock;
    login: jest.Mock;
    register: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      validateUser: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('returns token when credentials valid', async () => {
      const user = {
        _id: '1',
        username: 'alice',
        email: 'a@a.com',
        role: 'user',
      };
      authService.validateUser.mockResolvedValue(user);
      authService.login.mockResolvedValue({
        access_token: 't',
        user: { id: '1' },
      });

      const res = await controller.login({ username: 'alice', password: 'pw' });
      expect(authService.validateUser).toHaveBeenCalledWith('alice', 'pw');
      expect(authService.login).toHaveBeenCalledWith(user);
      expect(res).toEqual({ access_token: 't', user: { id: '1' } });
    });

    it('throws Unauthorized when invalid', async () => {
      authService.validateUser.mockResolvedValue(null);
      await expect(
        controller.login({ username: 'alice', password: 'bad' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('delegates to service', async () => {
      authService.register.mockResolvedValue({ _id: '2', username: 'bob' });
      const res = await controller.register({
        username: 'bob',
        password: 'Strong1!',
      });
      expect(authService.register).toHaveBeenCalledWith({
        username: 'bob',
        password: 'Strong1!',
      });
      expect(res).toEqual({ _id: '2', username: 'bob' });
    });
  });

  describe('profile', () => {
    it('returns user from request when guard allows', () => {
      const req = { user: { id: '1', username: 'alice' } } as any;
      expect(controller.getProfile(req)).toEqual({
        id: '1',
        username: 'alice',
      });
    });
  });
});
