import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { MyLogger } from '../../core/services/logger/logger.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUsersService: Partial<Record<keyof UsersService, any>> = {
    findByUsername: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService: Partial<Record<keyof JwtService, any>> = {
    sign: jest.fn(),
  };

  const mockLogger: MyLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MyLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);

    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('returns user without password when credentials are valid', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue({
        _id: 'u1',
        username: 'alice',
        email: 'a@a.com',
        role: 'user',
        password: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const user = await service.validateUser('alice', 'secret');
      expect(user).toBeDefined();
      expect(user).toMatchObject({
        _id: 'u1',
        username: 'alice',
        email: 'a@a.com',
        role: 'user',
      });
      // password should be stripped
      expect((user as any).password).toBeUndefined();
      expect(usersService.findByUsername).toHaveBeenCalledWith('alice');
      expect(bcrypt.compare).toHaveBeenCalledWith('secret', 'hashed');
    });

    it('returns null when password does not match', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue({
        password: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const user = await service.validateUser('alice', 'wrong');
      expect(user).toBeNull();
    });

    it('returns null when user is not found', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue(null);

      const user = await service.validateUser('bob', 'irrelevant');
      expect(user).toBeNull();
    });

    it('rethrows underlying errors', async () => {
      const err = new Error('db down');
      (usersService.findByUsername as jest.Mock).mockRejectedValue(err);

      await expect(service.validateUser('x', 'y')).rejects.toThrow('db down');
    });
  });

  describe('login', () => {
    it('returns access token and user info', async () => {
      (jwtService.sign as jest.Mock).mockReturnValue('jwt-token');
      const result = await service.login({
        _id: 'u1',
        username: 'alice',
        email: 'a@a.com',
        role: 'admin',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        username: 'alice',
        sub: 'u1',
        role: 'admin',
      });
      expect(result).toEqual({
        access_token: 'jwt-token',
        user: { id: 'u1', username: 'alice', email: 'a@a.com', role: 'admin' },
      });
    });

    it('propagates errors from jwtService', async () => {
      (jwtService.sign as jest.Mock).mockImplementation(() => {
        throw new Error('sign fail');
      });
      await expect(
        service.login({
          _id: 'u1',
          username: 'x',
          email: 'x@x.com',
          role: 'user',
        }),
      ).rejects.toThrow('sign fail');
    });
  });

  describe('register', () => {
    it('rejects weak passwords', async () => {
      await expect(
        service.register({ username: 'a', email: 'a@a.com', password: 'weak' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hashes password and creates user', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('HASHED');
      (usersService.create as jest.Mock).mockResolvedValue({
        _id: 'u2',
        username: 'bob',
        email: 'b@b.com',
        role: 'user',
        password: 'HASHED',
      });

      const res = await service.register({
        username: 'bob',
        email: 'b@b.com',
        password: 'Strong1!',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('Strong1!', 10);
      expect(usersService.create).toHaveBeenCalledWith({
        username: 'bob',
        email: 'b@b.com',
        password: 'HASHED',
      });
      expect(res).toEqual({
        _id: 'u2',
        username: 'bob',
        email: 'b@b.com',
        role: 'user',
      });
      // ensure password not returned
      expect((res as any).password).toBeUndefined();
    });

    it('translates duplicate key error into ConflictException', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('HASHED');
      (usersService.create as jest.Mock).mockRejectedValue({
        code: 11000,
        keyPattern: { email: 1 },
      });

      await expect(
        service.register({
          username: 'c',
          email: 'c@c.com',
          password: 'Strong1!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates unknown errors', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('HASHED');
      (usersService.create as jest.Mock).mockRejectedValue(
        new Error('unknown'),
      );

      await expect(
        service.register({
          username: 'd',
          email: 'd@d.com',
          password: 'Strong1!',
        }),
      ).rejects.toThrow('unknown');
    });
  });
});
