import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MyLogger } from '../../core/services/logger/logger.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        {
          provide: MyLogger,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    })
      // Allow requests past guards for unit tests
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('findAll delegates to service', async () => {
    usersService.findAll.mockResolvedValue([{ _id: '1' }]);
    await expect(controller.findAll()).resolves.toEqual([{ _id: '1' }]);
    expect(usersService.findAll).toHaveBeenCalled();
  });

  it('findById returns value', async () => {
    usersService.findById.mockResolvedValue({ _id: '1' });
    await expect(controller.findById('1')).resolves.toEqual({ _id: '1' });
    expect(usersService.findById).toHaveBeenCalledWith('1');
  });

  it('create delegates and returns created user', async () => {
    usersService.create.mockResolvedValue({ _id: '1', username: 'a' });
    await expect(controller.create({ username: 'a' } as any)).resolves.toEqual({
      _id: '1',
      username: 'a',
    });
    expect(usersService.create).toHaveBeenCalledWith({ username: 'a' });
  });

  it('update delegates and returns updated user', async () => {
    usersService.update.mockResolvedValue({ _id: '1', username: 'b' });
    await expect(controller.update('1', { username: 'b' })).resolves.toEqual({
      _id: '1',
      username: 'b',
    });
    expect(usersService.update).toHaveBeenCalledWith('1', { username: 'b' });
  });

  it('delete delegates and returns deleted user', async () => {
    usersService.delete.mockResolvedValue({ _id: '1' });
    await expect(controller.delete('1')).resolves.toEqual({ _id: '1' });
    expect(usersService.delete).toHaveBeenCalledWith('1');
  });
});
