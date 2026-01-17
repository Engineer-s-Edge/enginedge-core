// src/infrastructure/auth/auth.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { IdentityClientService } from './identity-client.service';
import { JwtService } from './jwt.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let mockIdentity: Partial<IdentityClientService>;
  let mockJwtService: Partial<JwtService>;

  beforeEach(async () => {
    mockIdentity = {
      login: jest.fn().mockResolvedValue({ token: 'abc' }),
      register: jest.fn().mockResolvedValue({ id: '1' }),
      profile: jest.fn().mockResolvedValue({ email: 'u@example.com' }),
      refresh: jest.fn().mockResolvedValue({ token: 'new' }),
      revoke: jest.fn().mockResolvedValue({ success: true }),
    };

    mockJwtService = {
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: IdentityClientService, useValue: mockIdentity },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should login', async () => {
    const result = await controller.login({ email: 'e', password: 'p' });
    expect(result).toEqual({ token: 'abc' });
    expect(mockIdentity.login).toHaveBeenCalledWith('e', 'p');
  });

  it('should register', async () => {
    const result = await controller.register({ email: 'e' });
    expect(result).toEqual({ id: '1' });
  });

  it('should get profile', async () => {
    const req = { user: { sub: 'u1' } };
    const result = await controller.profile(req);
    expect(result).toEqual({ email: 'u@example.com' });
    expect(mockIdentity.profile).toHaveBeenCalledWith('u1');
  });

  it('should get profile with userId', async () => {
    const req = { user: { userId: 'u1' } };
    const result = await controller.profile(req);
    expect(result).toEqual({ email: 'u@example.com' });
    expect(mockIdentity.profile).toHaveBeenCalledWith('u1');
  });

  it('should throw unauthorized if user id missing in profile', async () => {
    const req = { user: {} };
    await expect(controller.profile(req)).rejects.toThrow(UnauthorizedException);
  });

  it('should refresh token', async () => {
    const result = await controller.refresh({ refreshToken: 'ref' });
    expect(result).toEqual({ token: 'new' });
  });

  it('should revoke token', async () => {
    const result = await controller.revoke({ refreshToken: 'ref' });
    expect(result).toEqual({ success: true });
  });
});
