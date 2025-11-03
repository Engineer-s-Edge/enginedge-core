import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ToolIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { BaseActor } from '../../base/BaseActor';
import { ToolCall, ToolOutput } from '../../toolkit.interface';

type TodoOperation = 'list' | 'add' | 'update' | 'delete' | 'clear';

interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface InternalTodoArgs {
  op: TodoOperation;
  userId?: UserIdType;
  id?: string;
  title?: string;
  done?: boolean;
  storePath?: string; // defaults to ./.agent_state/todos.json
}

interface InternalTodoOutput extends ToolOutput {
  data: any;
}

export class InternalTodoActor extends BaseActor<
  InternalTodoArgs,
  InternalTodoOutput
> {
  _id: ToolIdType = 't_000000000000000000000103' as unknown as ToolIdType;
  name = 'todo.internal';
  description =
    'Lightweight internal TODO list manager (list/add/update/delete).';
  useCase = 'Track tasks for ReAct/Graph agents between steps.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {
        type: 'string',
        enum: ['list', 'add', 'update', 'delete', 'clear'],
      },
      userId: { type: 'string' },
      id: { type: 'string' },
      title: { type: 'string' },
      done: { type: 'boolean' },
      storePath: { type: 'string' },
    },
  };

  outputSchema = {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      items: { type: 'array', items: { type: 'object' } },
      message: { type: 'string' },
    },
  };

  invocationExample = [
    { name: 'todo.internal', args: { op: 'list' } } as ToolCall,
    {
      name: 'todo.internal',
      args: { op: 'add', title: 'Write unit tests' },
    } as ToolCall,
  ];

  retries = 0;
  errorEvent = [
    {
      name: 'ValidationError',
      guidance: 'Check required fields for the selected operation.',
      retryable: false,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private defaultStorePath() {
    return path.resolve(process.cwd(), '.agent_state', 'todos.json');
  }

  private async ensureStore(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(
        filePath,
        JSON.stringify({ byUser: {} }, null, 2),
        'utf8',
      );
    }
  }

  private async load(
    filePath: string,
  ): Promise<{ byUser: Record<string, TodoItem[]> }> {
    await this.ensureStore(filePath);
    const raw = await fs.readFile(filePath, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.byUser) return { byUser: {} };
      return parsed;
    } catch {
      return { byUser: {} };
    }
  }

  private async save(filePath: string, data: any) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  protected async act(args: InternalTodoArgs): Promise<InternalTodoOutput> {
    this.logger.info(
      `Executing internal todo operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Internal todo args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const storePath = path.resolve(args.storePath || this.defaultStorePath());
    this.logger.debug(`Todo store path: ${storePath}`, this.constructor.name);

    const data = await this.load(storePath);
    const userKey = (args.userId || 'anonymous') as string;
    data.byUser[userKey] = data.byUser[userKey] || [];
    this.logger.debug(
      `User key: ${userKey}, existing todos: ${data.byUser[userKey].length}`,
      this.constructor.name,
    );

    const now = new Date().toISOString();
    const list = data.byUser[userKey];

    switch (args.op) {
      case 'list': {
        this.logger.info(
          `Listing todos for user: ${userKey} (${list.length} items)`,
          this.constructor.name,
        );
        return {
          data: { ok: true, items: list } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'add': {
        if (!args.title || args.title.trim().length === 0) {
          this.logger.error(
            'title is required for add operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('title is required for add'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Adding todo: ${args.title.trim()}`,
          this.constructor.name,
        );
        const id = `td_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const item: TodoItem = {
          id,
          title: args.title.trim(),
          done: false,
          createdAt: now,
        };
        list.push(item);
        await this.save(storePath, data);
        this.logger.info(
          `Todo added successfully: ${id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, items: list } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'update': {
        if (!args.id) {
          this.logger.error(
            'id is required for update operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('id is required for update'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(`Updating todo: ${args.id}`, this.constructor.name);
        const idx = list.findIndex((t) => t.id === args.id);
        if (idx < 0) {
          this.logger.error(
            `Todo not found: ${args.id}`,
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('Todo not found'), {
            name: 'ValidationError',
          });
        }
        if (typeof args.title === 'string') list[idx].title = args.title;
        if (typeof args.done === 'boolean') list[idx].done = args.done;
        list[idx].updatedAt = now;
        await this.save(storePath, data);
        this.logger.info(
          `Todo updated successfully: ${args.id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, items: list } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'delete': {
        if (!args.id) {
          this.logger.error(
            'id is required for delete operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('id is required for delete'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(`Deleting todo: ${args.id}`, this.constructor.name);
        const filtered = list.filter((t) => t.id !== args.id);
        data.byUser[userKey] = filtered;
        await this.save(storePath, data);
        this.logger.info(
          `Todo deleted successfully: ${args.id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, items: filtered } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'clear': {
        this.logger.debug(
          `Clearing all todos for user: ${userKey}`,
          this.constructor.name,
        );
        data.byUser[userKey] = [];
        await this.save(storePath, data);
        this.logger.info(
          `All todos cleared for user: ${userKey}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, items: [] } as any,
          mimeType: 'application/json' as any,
        };
      }
      default: {
        this.logger.error(
          `Unsupported internal todo operation: ${args.op}`,
          undefined,
          this.constructor.name,
        );
        throw Object.assign(new Error(`Unsupported op: ${args.op}`), {
          name: 'ValidationError',
        });
      }
    }
  }
}

export default InternalTodoActor;
