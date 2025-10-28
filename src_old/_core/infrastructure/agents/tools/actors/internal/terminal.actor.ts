import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolCall, ToolOutput } from '../../toolkit.interface';

const exec = promisify(execCb);

interface TerminalArgs {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  shell?: string; // override default shell
  env?: Record<string, string>;
  allowDangerous?: boolean; // must be true to execute non-whitelisted commands
  allowedCommands?: string[]; // override default whitelist
}

interface TerminalOutput extends ToolOutput {
  data: any;
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'C://Windows//System32//cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function isWhitelisted(command: string, allowed: string[]): boolean {
  const firstToken = command.trim().split(/\s+/)[0].toLowerCase();
  return allowed.some((cmd) => firstToken === cmd.toLowerCase());
}

export class TerminalActor extends BaseActor<TerminalArgs, TerminalOutput> {
  _id: ToolIdType = 't_000000000000000000000104' as unknown as ToolIdType;
  name = 'terminal.exec';
  description = 'Execute a shell command with timeout and whitelist safety.';
  useCase = 'Run diagnostic or utility commands in a controlled environment.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['command'],
    properties: {
      command: { type: 'string', minLength: 1 },
      cwd: { type: 'string' },
      timeoutMs: { type: 'number', minimum: 0, default: 15000 },
      shell: { type: 'string' },
      env: {
        type: 'object',
        additionalProperties: { type: 'string' },
        default: {},
      },
      allowDangerous: { type: 'boolean', default: false },
      allowedCommands: {
        type: 'array',
        items: { type: 'string' },
        default:
          process.platform === 'win32'
            ? ['echo', 'dir', 'type', 'whoami', 'ver', 'where']
            : ['echo', 'ls', 'cat', 'pwd', 'whoami', 'which'],
      },
    },
  };

  outputSchema = {
    type: 'object',
    required: ['stdout', 'stderr', 'exitCode', 'durationMs'],
    properties: {
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      exitCode: { type: 'number' },
      durationMs: { type: 'number' },
      command: { type: 'string' },
      cwd: { type: 'string' },
    },
  };

  invocationExample = [
    {
      name: 'terminal.exec',
      args: { command: 'echo Hello', allowDangerous: false },
    } as ToolCall,
  ];

  retries = 0;
  errorEvent = [
    {
      name: 'TimeoutError',
      guidance: 'Increase timeoutMs or simplify the command.',
      retryable: false,
    },
    {
      name: 'ValidationError',
      guidance: 'Command not allowed; set allowDangerous or use whitelist.',
      retryable: false,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  protected async act(args: TerminalArgs): Promise<TerminalOutput> {
    this.logger.info(
      `Executing terminal command: ${args.command}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Terminal args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const start = Date.now();
    const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
    const shell = args.shell || getDefaultShell();
    const timeout = args.timeoutMs ?? 15000;
    const whitelist =
      args.allowedCommands && args.allowedCommands.length > 0
        ? args.allowedCommands
        : (this.inputSchema as any).properties.allowedCommands.default;

    this.logger.debug(
      `Command execution context - cwd: ${cwd}, shell: ${shell}, timeout: ${timeout}ms`,
      this.constructor.name,
    );
    this.logger.debug(
      `Whitelist: ${JSON.stringify(whitelist)}`,
      this.constructor.name,
    );

    if (!args.allowDangerous && !isWhitelisted(args.command, whitelist)) {
      this.logger.error(
        `Command not allowed: ${args.command}`,
        undefined,
        this.constructor.name,
      );
      const err: any = new Error(`Command not allowed: ${args.command}`);
      err.name = 'ValidationError';
      throw err;
    }

    this.logger.info(
      `Command approved for execution: ${args.command}`,
      this.constructor.name,
    );

    try {
      this.logger.debug(
        `Starting command execution: ${args.command}`,
        this.constructor.name,
      );
      const { stdout, stderr } = await exec(args.command, {
        cwd,
        timeout,
        shell,
        env: { ...process.env, ...(args.env || {}) },
        windowsHide: true,
      } as any);

      const durationMs = Date.now() - start;
      this.logger.info(
        `Command executed successfully: ${args.command} (${durationMs}ms)`,
        this.constructor.name,
      );
      this.logger.debug(
        `Command output - stdout length: ${String(stdout ?? '').length}, stderr length: ${String(stderr ?? '').length}`,
        this.constructor.name,
      );

      return {
        data: {
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          exitCode: 0,
          durationMs,
          command: args.command,
          cwd,
        } as any,
        mimeType: 'application/json' as any,
      };
    } catch (e: any) {
      const durationMs = Date.now() - start;
      this.logger.warn(
        `Command execution failed: ${args.command} - ${e.message}`,
        this.constructor.name,
      );
      this.logger.debug(
        `Command error details - exitCode: ${typeof e.code === 'number' ? e.code : 1}`,
        this.constructor.name,
      );

      // child_process.exec throws on non-zero exit codes with error containing stdout/stderr
      return {
        data: {
          stdout: String(e.stdout ?? ''),
          stderr: String(e.stderr ?? e.message ?? ''),
          exitCode: typeof e.code === 'number' ? e.code : 1,
          durationMs,
          command: args.command,
          cwd,
        } as any,
        mimeType: 'application/json' as any,
      };
    }
  }
}

export default TerminalActor;
