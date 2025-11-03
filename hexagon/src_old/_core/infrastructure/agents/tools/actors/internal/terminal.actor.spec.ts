jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { TerminalActor } from './terminal.actor';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

describe('TerminalActor', () => {
  it('fails validation when command missing', async () => {
    const tool = new TerminalActor();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('blocks non-whitelisted command when allowDangerous=false', async () => {
    const tool = new TerminalActor();
    const res = await tool.execute({
      name: tool.name,
      args: { command: 'node -v', allowDangerous: false } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('ValidationError');
      expect(res.error.message).toContain('Command not allowed');
    }
  });

  it('executes a whitelisted echo command and returns stdout/exitCode/cwd', async () => {
    const tool = new TerminalActor();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-actor-'));
    try {
      const res = await tool.execute({
        name: tool.name,
        args: { command: 'echo Hello World', cwd: tmp } as any,
      });
      expect(res.success).toBe(true);
      if (res.success) {
        const out = (res as any).output.data;
        expect(out.exitCode).toBe(0);
        expect(out.stdout.toLowerCase()).toContain('hello world');
        expect(path.resolve(out.cwd)).toBe(path.resolve(tmp));
        expect(out.command).toBe('echo Hello World');
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('respects allowedCommands override', async () => {
    const tool = new TerminalActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        command: 'echo ok',
        allowDangerous: false,
        allowedCommands: ['echo'],
      } as any,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output.data;
      expect(out.exitCode).toBe(0);
      expect(out.stdout.toLowerCase()).toContain('ok');
    }
  });
});
