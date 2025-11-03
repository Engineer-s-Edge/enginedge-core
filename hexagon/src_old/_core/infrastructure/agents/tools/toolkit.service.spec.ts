jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { Toolkit } from './toolkit.service';
import { Tool, ToolCall } from './toolkit.interface';
import { MyLogger } from '@core/services/logger/logger.service';

function makeTool(
  name: string,
  type: 'actor' | 'retriever',
  opts?: Partial<Tool>,
): Tool {
  const base: Tool = {
    _id: 't_1' as any,
    name,
    description: 'desc',
    type,
    retrieverConfig:
      type === 'retriever'
        ? ({
            similarity: 0.5,
            similarityModifiable: false,
            top_k: 3,
            top_kModifiable: true,
            optimize: true,
          } as any)
        : undefined,
    useCase: 'uc',
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object' },
    invocationExample: [],
    retries: 0,
    errorEvent: [],
    parallel: false,
    concatenate: (o: any) => o[o.length - 1],
    maxIterations: 1,
    pauseBeforeUse: false,
    userModifyQuery: false,
    execute: jest.fn(async (call: ToolCall) => ({
      success: true as true,
      call,
      output: { data: { ok: true }, mimeType: 'application/json' as any },
      startTime: new Date(),
      endTime: new Date(),
      attempts: 1,
      durationMs: 0,
    })) as unknown as Tool['execute'],
  };
  return Object.assign(base, opts);
}

describe('Toolkit', () => {
  it('registers tools and strips retrieverConfig for actors', async () => {
    const toolkit = new Toolkit(
      async () => ({ approved: true }),
      new MyLogger() as any,
    );
    const actor = makeTool('act', 'actor');
    const retr = makeTool('ret', 'retriever');
    toolkit.register(actor);
    toolkit.register(retr);
    // actor should not have retrieverConfig
    expect((actor as any).retrieverConfig).toBeUndefined();
    // retriever keeps config
    expect(retr.retrieverConfig).toBeDefined();
  });

  it('executes serial and parallel groups and returns outputs', async () => {
    const toolkit = new Toolkit(
      async () => ({ approved: true }),
      new MyLogger() as any,
    );
    const serial = makeTool('s', 'actor');
    const parallel = makeTool('p', 'actor', {
      parallel: true,
      concatenate: (args: any[]) => args[args.length - 1],
    });
    toolkit.register(serial);
    toolkit.register(parallel);

    const calls: ToolCall[] = [
      { name: 's', args: {} },
      { name: 'p', args: { one: 1 } },
      { name: 'p', args: { two: 2 } },
    ];
    const results = await toolkit.executeCalls(calls);
    expect(results.length).toBe(2); // one serial, one parallel group
    expect((serial.execute as jest.Mock).mock.calls.length).toBe(1);
    expect((parallel.execute as jest.Mock).mock.calls.length).toBe(1);
  });

  it('preparePromptPayload includes sanitized tool info', () => {
    const toolkit = new Toolkit(
      async () => ({ approved: true }),
      new MyLogger() as any,
    );
    const actor = makeTool('x', 'actor', {
      description: '<b>bold</b>',
      invocationExample: [{ a: 1 } as any],
    });
    toolkit.register(actor);
    const payload = toolkit.preparePromptPayload();
    expect(payload).toContain('Tool: x');
    expect(payload).toContain('UseCase: uc');
    // Sanitized description should not include raw tag
    expect(payload).toContain('bold');
  });
});
