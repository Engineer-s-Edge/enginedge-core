import { Test } from '@nestjs/testing';
import { AssistantsCrudService } from './assistants-crud.service';
import { AssistantsRepository } from '../repositories/assistants.repository';
import { MyLogger } from '../../../core/services/logger/logger.service';
import {
  AssistantStatus,
  AssistantType,
  AssistantMode,
} from '../entities/assistant.entity';

describe('AssistantsCrudService', () => {
  let service: AssistantsCrudService;
  const repo = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByName: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<AssistantsRepository>;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<MyLogger>;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        AssistantsCrudService,
        { provide: AssistantsRepository, useValue: repo },
        { provide: MyLogger, useValue: logger },
      ],
    }).compile();
    service = mod.get(AssistantsCrudService);
    jest.clearAllMocks();
  });

  it('create: transforms DTO, checks dupes, calls repo.create', async () => {
    (repo.findByName as any) = jest.fn().mockResolvedValue(null);
    (repo.create as any) = jest
      .fn()
      .mockImplementation(async (data) => ({ id: '1', ...data }));

    const dto = {
      name: 'assistant-1',
      description: 'd',
      type: 'react',
      primaryMode: AssistantMode.BALANCED,
      isPublic: false,
      settings: {
        intelligence: {
          llm: {
            provider: 'groq',
            model: 'llama3-8b',
            tokenLimit: 8192,
            temperature: 0.3,
          },
        },
        memory: { windowSize: 8 },
        tools: [],
      },
    } as any;

    const created = await service.create(dto);
    expect(repo.findByName).toHaveBeenCalledWith('assistant-1');
    // verify transform: type normalized and settings mapped to reactConfig
    const createArgs = (repo.create as any).mock.calls[0][0];
    expect(createArgs.type).toBe(AssistantType.REACT_AGENT);
    expect(createArgs.status).toBe(AssistantStatus.ACTIVE);
    expect(createArgs.reactConfig).toBeDefined();
    expect(createArgs.reactConfig.intelligence.llm.provider).toBe('groq');
    expect(createArgs.reactConfig.cot.temperature).toBe(0.3);
    expect(created.name).toBe('assistant-1');
  });

  it('create: throws ConflictException if name exists', async () => {
    (repo.findByName as any) = jest
      .fn()
      .mockResolvedValue({ name: 'assistant-1' });
    await expect(
      service.create({ name: 'assistant-1' } as any),
    ).rejects.toThrow('already exists');
  });

  it('findAll: delegates to repo with filters', async () => {
    (repo.findAll as any) = jest.fn().mockResolvedValue([{ name: 'a' }]);
    const res = await service.findAll({ isPublic: true } as any);
    expect(repo.findAll).toHaveBeenCalledWith({ isPublic: true });
    expect(res).toEqual([{ name: 'a' }]);
  });

  it('findByName: returns assistant or throws NotFound', async () => {
    (repo.findByName as any) = jest.fn().mockResolvedValue({ name: 'x' });
    expect(await service.findByName('x')).toEqual({ name: 'x' });

    (repo.findByName as any) = jest.fn().mockResolvedValue(null);
    await expect(service.findByName('nope')).rejects.toThrow('not found');
  });

  it('update: transforms DTO and delegates to repo', async () => {
    (repo.update as any) = jest.fn().mockResolvedValue({
      name: 'x',
      reactConfig: { cot: { temperature: 0.9 } },
    });
    const dto = {
      settings: { intelligence: { llm: { temperature: 0.9 } } },
    } as any;
    const updated = await service.update('x', dto);
    // ensure transform mapped temperature into reactConfig.cot.temperature
    const updateArgs = (repo.update as any).mock.calls[0][1];
    expect(updateArgs.reactConfig.cot.temperature).toBe(0.9);
    expect(updated.name).toBe('x');
  });

  it('update: throws NotFound when repo returns null', async () => {
    (repo.update as any) = jest.fn().mockResolvedValue(null);
    await expect(service.update('x', {} as any)).rejects.toThrow('not found');
  });

  it('remove: is idempotent and logs when missing', async () => {
    (repo.delete as any) = jest.fn().mockResolvedValue(true);
    await expect(service.remove('x')).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith('x');

    (repo.delete as any) = jest.fn().mockResolvedValue(false);
    await expect(service.remove('x')).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });
});
