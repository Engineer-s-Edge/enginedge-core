import { Test } from '@nestjs/testing';
import { GraphBuilderController } from './graph-builder.controller';
import { GraphBuilderService } from '../services/graph-builder.service';

jest.mock('@common/error-assertions', () => ({
  getErrorInfo: (e: any) => ({ message: String(e?.message || e) }),
}));
// Prevent deep imports from pulling ESM-only modules via service import graph
jest.mock('../services/graph-builder.service', () => ({
  GraphBuilderService: jest.fn().mockImplementation(() => ({
    getGraphNodeTemplates: jest.fn(),
    getGraphEdgeTypes: jest.fn(),
    getUserInteractionTypes: jest.fn(),
    validateGraphConfig: jest.fn(),
    createGraphAgent: jest.fn(),
    analyzeGraphFlow: jest.fn(),
    getGraphPatterns: jest.fn(),
  })),
}));

describe('GraphBuilderController', () => {
  let ctrl: GraphBuilderController;
  const svc = {
    getGraphNodeTemplates: jest.fn(),
    getGraphEdgeTypes: jest.fn(),
    getUserInteractionTypes: jest.fn(),
    validateGraphConfig: jest.fn(),
    createGraphAgent: jest.fn(),
    analyzeGraphFlow: jest.fn(),
    getGraphPatterns: jest.fn(),
  } as unknown as jest.Mocked<GraphBuilderService>;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [GraphBuilderController],
      providers: [{ provide: GraphBuilderService, useValue: svc }],
    }).compile();
    ctrl = mod.get(GraphBuilderController);
    jest.clearAllMocks();
  });

  it('getGraphNodeTemplates returns templates and supports category filtering at service', async () => {
    (svc.getGraphNodeTemplates as any).mockResolvedValue([{ id: 't1' }]);
    const res = await ctrl.getGraphNodeTemplates('cat');
    expect(svc.getGraphNodeTemplates).toHaveBeenCalledWith('cat');
    expect(res).toEqual({ success: true, templates: [{ id: 't1' }] });
  });

  it('edge types and interaction types delegated to service', async () => {
    (svc.getGraphEdgeTypes as any).mockResolvedValue(['seq']);
    (svc.getUserInteractionTypes as any).mockResolvedValue(['confirm']);
    expect((await ctrl.getGraphEdgeTypes()).edgeTypes).toEqual(['seq']);
    expect((await ctrl.getUserInteractionTypes()).interactionTypes).toEqual([
      'confirm',
    ]);
  });

  it('validateGraphConfig returns structure from service', async () => {
    (svc.validateGraphConfig as any).mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    });
    const res = await ctrl.validateGraphConfig({
      graphConfig: { nodes: [] },
    } as any);
    expect(svc.validateGraphConfig).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.isValid).toBe(true);
  });

  it('createGraphAgent returns success and agent from service', async () => {
    (svc.createGraphAgent as any).mockResolvedValue({ name: 'A' });
    const res = await ctrl.createGraphAgent({ graphConfig: {} } as any);
    expect(res.success).toBe(true);
    expect(res.agent).toEqual({ name: 'A' });
  });

  it('analyzeGraphFlow proxies to service', async () => {
    (svc.analyzeGraphFlow as any).mockResolvedValue({ nodes: 2 });
    const res = await ctrl.analyzeGraphFlow({ graphConfig: {} });
    expect(res).toEqual({ success: true, analysis: { nodes: 2 } });
  });

  it('getGraphPatterns supports category and delegates to service', async () => {
    (svc.getGraphPatterns as any).mockResolvedValue([{ id: 'p1' }]);
    const res = await ctrl.getGraphPatterns('cat');
    expect(svc.getGraphPatterns).toHaveBeenCalledWith('cat');
    expect(res).toEqual({ success: true, patterns: [{ id: 'p1' }] });
  });
});
