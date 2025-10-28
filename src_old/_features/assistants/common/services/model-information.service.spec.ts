import { Test } from '@nestjs/testing';
import { ModelInformationService } from './model-information.service';
import LLMService, {
  ModelDetails,
} from '../../../core/infrastructure/agents/components/llm/llm.service';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('ModelInformationService', () => {
  let svc: ModelInformationService;
  const llm = {
    getModelsData: jest.fn(),
    listModelsWithDetails: jest.fn(),
    getModelsByCategory: jest.fn(),
    getModelsByCostRange: jest.fn(),
    getModelsWithCapability: jest.fn(),
    findModelsByName: jest.fn(),
    getModelDetails: jest.fn(),
    calculateEstimatedCost: jest.fn(),
    listProviders: jest.fn(),
  } as unknown as jest.Mocked<LLMService>;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<MyLogger>;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ModelInformationService,
        { provide: LLMService, useValue: llm },
        { provide: MyLogger, useValue: logger },
      ],
    }).compile();
    svc = mod.get(ModelInformationService);
    jest.clearAllMocks();
  });

  it('getAllModels delegates to llmService.getModelsData', async () => {
    (llm.getModelsData as any) = jest.fn().mockResolvedValue([{ name: 'm1' }]);
    expect(await svc.getAllModels()).toEqual([{ name: 'm1' }]);
  });

  it('getModelsByProvider maps details to models', async () => {
    const details: ModelDetails[] = [
      {
        name: 'llama3-8b',
        provider: 'Groq',
        description: 'd',
        category: 'gpt-4',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        inputCostPer1M: 0.05,
        cachedInputCostPer1M: null,
        outputCostPer1M: 0.08,
        vision: false,
        functionCalling: true,
        multilingual: true,
        extendedThinking: false,
        knowledgeCutoff: '2023-10',
      } as any,
    ];
    (llm.listModelsWithDetails as any) = jest.fn().mockResolvedValue(details);
    const res = await svc.getModelsByProvider('Groq');
    expect(llm.listModelsWithDetails).toHaveBeenCalledWith('Groq');
    expect(res[0].name).toBe('llama3-8b');
    expect(res[0].provider).toBe('Groq');
  });

  it('getModelsByCategory delegates and returns', async () => {
    (llm.getModelsByCategory as any) = jest
      .fn()
      .mockResolvedValue([{ name: 'm' }]);
    const res = await svc.getModelsByCategory('gpt-4');
    expect(llm.getModelsByCategory).toHaveBeenCalledWith('gpt-4');
    expect(res).toEqual([{ name: 'm' }]);
  });

  it('getModelsByCostRange delegates and returns', async () => {
    (llm.getModelsByCostRange as any) = jest
      .fn()
      .mockResolvedValue([{ name: 'cheap' }]);
    const res = await svc.getModelsByCostRange(0, 1);
    expect(llm.getModelsByCostRange).toHaveBeenCalledWith(0, 1);
    expect(res).toEqual([{ name: 'cheap' }]);
  });

  it('getModelsWithCapability delegates and returns', async () => {
    (llm.getModelsWithCapability as any) = jest
      .fn()
      .mockResolvedValue([{ name: 'vision-x' }]);
    const res = await svc.getModelsWithCapability('vision' as any);
    expect(llm.getModelsWithCapability).toHaveBeenCalledWith('vision');
    expect(res).toEqual([{ name: 'vision-x' }]);
  });

  it('findModelsByName delegates and returns', async () => {
    (llm.findModelsByName as any) = jest
      .fn()
      .mockResolvedValue([{ name: 'gpt-4o' }]);
    const res = await svc.findModelsByName('gpt');
    expect(llm.findModelsByName).toHaveBeenCalledWith('gpt');
    expect(res).toEqual([{ name: 'gpt-4o' }]);
  });

  it('getModelDetails delegates and returns details', async () => {
    (llm.getModelDetails as any) = jest
      .fn()
      .mockResolvedValue({ name: 'gpt-4' });
    const res = await svc.getModelDetails('openai', 'gpt-4');
    expect(llm.getModelDetails).toHaveBeenCalledWith('openai', 'gpt-4');
    expect(res).toEqual({ name: 'gpt-4' });
  });

  it('calculateModelCost delegates and returns cost', async () => {
    (llm.calculateEstimatedCost as any) = jest
      .fn()
      .mockResolvedValue({ inputCost: 1, outputCost: 2, totalCost: 3 });
    const res = await svc.calculateModelCost('m', 10, 5);
    expect(llm.calculateEstimatedCost).toHaveBeenCalledWith('m', 10, 5);
    expect(res).toEqual({ inputCost: 1, outputCost: 2, totalCost: 3 });
  });

  it('getAvailableProviders delegates and returns providers', async () => {
    (llm.listProviders as any) = jest
      .fn()
      .mockResolvedValue(['openai', 'groq']);
    const res = await svc.getAvailableProviders();
    expect(llm.listProviders).toHaveBeenCalled();
    expect(res).toEqual(['openai', 'groq']);
  });
});
