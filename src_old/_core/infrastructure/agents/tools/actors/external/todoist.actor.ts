import axios from 'axios';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, ToolCall } from '../../toolkit.interface';

type TodoistOp =
  | 'list-tasks'
  | 'create-task'
  | 'update-task'
  | 'close-task'
  | 'reopen-task'
  | 'delete-task';

interface TodoistArgs {
  op: TodoistOp;
  token?: string;
  taskId?: string;
  payload?: any; // task fields per API
}

interface TodoistOutput extends ToolOutput {
  data: any;
}

export class TodoistActor extends BaseActor<TodoistArgs, TodoistOutput> {
  _id: ToolIdType = 't_000000000000000000000206' as unknown as ToolIdType;
  name = 'todoist.actor';
  description = 'Todoist: list, create, update, complete/reopen, delete tasks.';
  useCase = 'Manage tasks in Todoist.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {
        type: 'string',
        enum: [
          'list-tasks',
          'create-task',
          'update-task',
          'close-task',
          'reopen-task',
          'delete-task',
        ],
      },
      token: { type: 'string' },
      taskId: { type: 'string' },
      payload: { type: 'object' },
    },
  };

  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    { name: 'todoist.actor', args: { op: 'list-tasks' } } as ToolCall,
  ];
  retries = 1;
  errorEvent = [
    {
      name: 'AxiosError',
      guidance: 'Check Todoist token and API limits.',
      retryable: true,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private headers(token?: string) {
    const auth = token || process.env.TODOIST_TOKEN || '';
    if (!auth) {
      this.logger.error(
        'Todoist token missing for actor',
        undefined,
        this.constructor.name,
      );
      throw Object.assign(new Error('Todoist token missing'), {
        name: 'ValidationError',
      });
    }
    this.logger.debug(
      'Creating Todoist headers for actor',
      this.constructor.name,
    );
    return {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
    };
  }

  protected async act(args: TodoistArgs): Promise<TodoistOutput> {
    this.logger.info(
      `Executing Todoist operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Todoist args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const base = 'https://api.todoist.com/rest/v2';
    switch (args.op) {
      case 'list-tasks': {
        this.logger.debug('Listing Todoist tasks', this.constructor.name);
        const res = await axios.get(`${base}/tasks`, {
          headers: this.headers(args.token),
        });
        this.logger.info(
          `Todoist tasks listed: ${res.data.length} tasks`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'create-task': {
        if (!args.payload) {
          this.logger.error(
            'payload required for create-task operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('payload required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Creating Todoist task: ${args.payload.content || 'untitled'}`,
          this.constructor.name,
        );
        const res = await axios.post(`${base}/tasks`, args.payload, {
          headers: this.headers(args.token),
        });
        this.logger.info(
          `Todoist task created successfully: ${res.data.id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'update-task': {
        if (!args.taskId || !args.payload) {
          this.logger.error(
            'taskId and payload required for update-task operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('taskId and payload required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Updating Todoist task: ${args.taskId}`,
          this.constructor.name,
        );
        const res = await axios.post(
          `${base}/tasks/${args.taskId}`,
          args.payload,
          { headers: this.headers(args.token) },
        );
        this.logger.info(
          `Todoist task updated successfully: ${args.taskId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'close-task': {
        if (!args.taskId) {
          this.logger.error(
            'taskId required for close-task operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('taskId required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Closing Todoist task: ${args.taskId}`,
          this.constructor.name,
        );
        await axios.post(
          `${base}/tasks/${args.taskId}/close`,
          {},
          { headers: this.headers(args.token) },
        );
        this.logger.info(
          `Todoist task closed successfully: ${args.taskId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'reopen-task': {
        if (!args.taskId) {
          this.logger.error(
            'taskId required for reopen-task operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('taskId required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Reopening Todoist task: ${args.taskId}`,
          this.constructor.name,
        );
        await axios.post(
          `${base}/tasks/${args.taskId}/reopen`,
          {},
          { headers: this.headers(args.token) },
        );
        this.logger.info(
          `Todoist task reopened successfully: ${args.taskId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'delete-task': {
        if (!args.taskId) {
          this.logger.error(
            'taskId required for delete-task operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('taskId required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Deleting Todoist task: ${args.taskId}`,
          this.constructor.name,
        );
        await axios.delete(`${base}/tasks/${args.taskId}`, {
          headers: this.headers(args.token),
        });
        this.logger.info(
          `Todoist task deleted successfully: ${args.taskId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      default:
        this.logger.error(
          `Unsupported Todoist operation: ${args.op}`,
          undefined,
          this.constructor.name,
        );
        throw Object.assign(new Error(`Unsupported op: ${args.op}`), {
          name: 'ValidationError',
        });
    }
  }
}

export default TodoistActor;
