import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersRepository } from './repositories/users.repository';
import { MyLogger } from '../../core/services/logger/logger.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<UsersRepository>;

  const mockRepo: Partial<Record<keyof UsersRepository, any>> = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByUsername: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockLogger: MyLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: mockRepo },
        { provide: MyLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(UsersRepository);
    jest.clearAllMocks();
  });

  it('findAll returns list', async () => {
    (repo.findAll as jest.Mock).mockResolvedValue([
      { _id: '1', username: 'a' },
    ]);
    const res = await service.findAll();
    expect(res).toEqual([{ _id: '1', username: 'a' }]);
    expect(repo.findAll).toHaveBeenCalled();
  });

  it('findAll propagates errors', async () => {
    (repo.findAll as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(service.findAll()).rejects.toThrow('boom');
  });

  it('findById returns user or null', async () => {
    (repo.findById as jest.Mock).mockResolvedValueOnce({ _id: '1' });
    await expect(service.findById('1')).resolves.toEqual({ _id: '1' });
    (repo.findById as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.findById('2')).resolves.toBeNull();
  });

  it('findById propagates errors', async () => {
    (repo.findById as jest.Mock).mockRejectedValue(new Error('db'));
    await expect(service.findById('x')).rejects.toThrow('db');
  });

  it('findByUsername returns user or null', async () => {
    (repo.findByUsername as jest.Mock).mockResolvedValueOnce({
      _id: '1',
      username: 'a',
    });
    await expect(service.findByUsername('a')).resolves.toEqual({
      _id: '1',
      username: 'a',
    });
    (repo.findByUsername as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.findByUsername('b')).resolves.toBeNull();
  });

  it('findByUsername propagates errors', async () => {
    (repo.findByUsername as jest.Mock).mockRejectedValue(new Error('db'));
    await expect(service.findByUsername('x')).rejects.toThrow('db');
  });

  it('create delegates to repository', async () => {
    (repo.create as jest.Mock).mockResolvedValue({ _id: '1', username: 'a' });
    const res = await service.create({ username: 'a' });
    expect(repo.create).toHaveBeenCalledWith({ username: 'a' });
    expect(res).toEqual({ _id: '1', username: 'a' });
  });

  it('create propagates errors', async () => {
    (repo.create as jest.Mock).mockRejectedValue(new Error('dup'));
    await expect(service.create({ username: 'a' })).rejects.toThrow('dup');
  });

  it('update delegates and returns updated', async () => {
    (repo.update as jest.Mock).mockResolvedValue({ _id: '1', username: 'b' });
    const res = await service.update('1', { username: 'b' });
    expect(repo.update).toHaveBeenCalledWith('1', { username: 'b' });
    expect(res).toEqual({ _id: '1', username: 'b' });
  });

  it('update propagates errors', async () => {
    (repo.update as jest.Mock).mockRejectedValue(new Error('db'));
    await expect(service.update('1', { username: 'b' })).rejects.toThrow('db');
  });

  it('delete delegates and returns deleted', async () => {
    (repo.delete as jest.Mock).mockResolvedValue({ _id: '1' });
    const res = await service.delete('1');
    expect(repo.delete).toHaveBeenCalledWith('1');
    expect(res).toEqual({ _id: '1' });
  });

  it('delete propagates errors', async () => {
    (repo.delete as jest.Mock).mockRejectedValue(new Error('db'));
    await expect(service.delete('1')).rejects.toThrow('db');
  });
});
