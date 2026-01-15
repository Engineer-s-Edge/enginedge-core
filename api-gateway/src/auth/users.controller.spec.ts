// src/auth/users.controller.spec.ts

import { UsersController } from './users.controller';
import { IdentityClientService } from './identity-client.service';

describe('UsersController', () => {
  let controller: UsersController;
  let mockIdentity: Partial<IdentityClientService>;

  beforeEach(async () => {
    mockIdentity = {
      getUserById: jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' }),
      getUserByEmail: jest.fn().mockResolvedValue({ id: '2', email: 'email@example.com' }),
      listUsers: jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]),
      updateUser: jest.fn().mockResolvedValue({ id: '1', updated: true }),
      createUser: jest.fn().mockResolvedValue({ id: '3', created: true }),
      deleteUser: jest.fn().mockResolvedValue({ success: true }),
    };

    controller = new UsersController(mockIdentity as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get user by id', async () => {
    const result = await controller.getUserById('1');
    expect(result).toEqual({ id: '1', email: 'test@example.com' });
    expect(mockIdentity.getUserById).toHaveBeenCalledWith('1');
  });

  it('should get user by email', async () => {
    const result = await controller.getUserByEmail('email@example.com', {
      user: { roles: [] },
    } as any);
    expect(result).toEqual({ id: '2', email: 'email@example.com' });
    expect(mockIdentity.getUserByEmail).toHaveBeenCalledWith('email@example.com');
  });

  it('should list users if admin', async () => {
    const req = { user: { roles: ['admin'] } };
    const result = await controller.getUserByEmail(undefined, req as any);
    expect(result).toHaveLength(2);
    expect(mockIdentity.listUsers).toHaveBeenCalled();
  });

  it('should forbid list users if not admin', async () => {
    const req = { user: { roles: ['user'] } };
    const result = await controller.getUserByEmail(undefined, req as any);
    expect(result).toEqual({ message: 'Forbidden: admin role required' });
  });

  it('should forbid list users if no roles', async () => {
    const req = { user: {} };
    const result = await controller.getUserByEmail(undefined, req as any);
    expect(result).toEqual({ message: 'Forbidden: admin role required' });
  });

  it('should update user', async () => {
    const result = await controller.updateUser('1', { name: 'New' });
    expect(result).toEqual({ id: '1', updated: true });
    expect(mockIdentity.updateUser).toHaveBeenCalledWith('1', { name: 'New' });
  });

  it('should create user', async () => {
    const result = await controller.createUser({ email: 'new@example.com' });
    expect(result).toEqual({ id: '3', created: true });
    expect(mockIdentity.createUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });

  it('should delete user', async () => {
    const result = await controller.deleteUser('1');
    expect(result).toEqual({ success: true });
    expect(mockIdentity.deleteUser).toHaveBeenCalledWith('1');
  });
});
