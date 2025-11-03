import { Test, TestingModule } from '@nestjs/testing';
import { ExperienceProjectsBuilder } from './experience-projects.builder';
import { ExperienceProjectsRuleEnforcer } from './experience-projects.rule-enforcer';
import LlmService from '../../agents/components/llm/llm.service';

// Mock LlmService
const mockLlmService = {
  chat: jest.fn(),
};

describe('ExperienceProjectsBuilder', () => {
  let builder: ExperienceProjectsBuilder;
  let llmService: LlmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExperienceProjectsBuilder,
        ExperienceProjectsRuleEnforcer,
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    builder = module.get<ExperienceProjectsBuilder>(ExperienceProjectsBuilder);
    llmService = module.get<LlmService>(LlmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(builder).toBeDefined();
  });

  it('should call the LlmService and return a validated experience entry', async () => {
    const rawDescription = 'I was a software engineer at a cool company.';
    const context = { title: 'Software Engineer', company: 'Cool Company' };
    const llmBullets = [
      'Developed a new feature that increased user engagement by 10%',
      'Fixed over 50 bugs.',
    ];
    // The enforcer will remove the period from the second bullet
    const expectedNormalizedBullets = [
      'Developed a new feature that increased user engagement by 10%',
      'Fixed over 50 bugs',
    ];

    const mockResponse = {
      response: JSON.stringify(llmBullets),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    } as any;
    mockLlmService.chat.mockResolvedValue(mockResponse);

    const result = await builder.build(rawDescription, context);

    expect(llmService.chat).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          content: expect.stringContaining(rawDescription),
        }),
      ],
      {},
    );
    expect(result.title).toBe(context.title);
    expect(result.bullets).toEqual(expectedNormalizedBullets);
  });

  it('should handle non-JSON responses from the LLM service', async () => {
    const rawDescription = 'I was a software engineer.';
    const context = { title: 'Software Engineer', company: 'A Company' };

    const mockResponse = {
      response: 'This is not JSON.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    } as any;
    mockLlmService.chat.mockResolvedValue(mockResponse);

    // Mock console.error to prevent logging during tests
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await builder.build(rawDescription, context);

    // Enforcer normalization removes trailing period
    expect(result.bullets).toEqual([rawDescription.replace(/\.$/, '')]);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
