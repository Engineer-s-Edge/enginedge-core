import { Test, TestingModule } from '@nestjs/testing';
import { BuilderController } from './builder.controller';
import { AssistantsService } from '../assistants.service';
// Avoid importing deep service tree that pulls ESM-only deps
jest.mock('../assistants.service', () => ({
  AssistantsService: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
  })),
}));
import { AssistantType, AssistantMode } from '../entities/assistant.entity';

jest.mock('@common/error-assertions', () => ({
  getErrorInfo: (e: any) => ({ message: String(e?.message || e) }),
}));

describe('BuilderController', () => {
  let controller: BuilderController;
  const service = {
    create: jest.fn(),
  } as unknown as jest.Mocked<AssistantsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BuilderController],
      providers: [{ provide: AssistantsService, useValue: service }],
    }).compile();
    controller = module.get(BuilderController);
    jest.clearAllMocks();
  });

  it('getAssistantTemplates returns templates and can filter by category', async () => {
    const resAll = await controller.getAssistantTemplates();
    expect(resAll.success).toBe(true);
    expect(resAll.templates.length).toBeGreaterThan(0);

    const resFiltered = await controller.getAssistantTemplates('development');
    expect(resFiltered.success).toBe(true);
    expect(
      resFiltered.templates.every((t: any) => t.category === 'development'),
    ).toBe(true);
  });

  it('getBlockTemplates returns blocks and can filter by category', async () => {
    const resAll = await controller.getBlockTemplates();
    expect(resAll.success).toBe(true);
    expect(resAll.blockTemplates.length).toBeGreaterThan(0);

    const resFiltered = await controller.getBlockTemplates('processing');
    expect(resFiltered.success).toBe(true);
    expect(
      resFiltered.blockTemplates.every((b: any) => b.category === 'processing'),
    ).toBe(true);
  });

  it('validateBlocks captures errors and warnings', async () => {
    let res = await controller.validateBlocks({ blocks: [] });
    expect(res.success).toBe(true);
    expect(res.isValid).toBe(false);
    expect(res.errors?.includes('At least one block is required')).toBe(true);

    res = await controller.validateBlocks({
      blocks: [
        { id: '1', type: 'tool', config: {} },
        { id: '2', type: 'llm', config: {} },
        { id: '3', type: 'input', config: {} },
        { id: '4', type: 'output', next: 'missing', config: {} },
      ],
    });
    expect(res.isValid).toBe(false);
    expect(
      (res.errors || []).some((e) => e.includes('Tool blocks must specify')),
    ).toBe(true);
    expect(
      (res.warnings || []).some((w) =>
        w.includes("LLM blocks should have a 'systemPrompt'"),
      ),
    ).toBe(true);
    expect(
      (res.warnings || []).some((w) =>
        w.includes("Input blocks should specify 'inputField'"),
      ),
    ).toBe(true);
    expect(
      (res.warnings || []).some((w) =>
        w.includes("Next block 'missing' not found"),
      ),
    ).toBe(true);
  });

  it('createFromTemplate maps template -> CreateAssistantDto and calls service', async () => {
    const created = { id: 'a1', name: 'My Bot' };
    (service.create as any) = jest.fn().mockResolvedValue(created);
    const res = await controller.createFromTemplate(
      'general-conversational-assistant',
      {
        name: 'My Bot',
        description: 'desc',
      },
    );
    expect(res.success).toBe(true);
    expect(res.assistant).toEqual(created);
    // verify DTO mapping includes type CUSTOM and primaryMode from template
    const dto = (service.create as any).mock.calls[0][0];
    expect(dto.type).toBe(AssistantType.CUSTOM);
    expect(Object.values(AssistantMode)).toContain(dto.primaryMode);
  });

  it('createFromTemplate returns friendly error if template not found', async () => {
    const res = await controller.createFromTemplate('does-not-exist', {
      name: 'X',
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/not found/i);
  });
});
