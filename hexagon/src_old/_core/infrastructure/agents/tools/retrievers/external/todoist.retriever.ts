import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import axios from 'axios';

interface TodoistRetrieveArgs {
  token?: string;
  filter?: string;
}
interface TodoistRetrieveOutput extends ToolOutput {
  data: any;
}

export class TodoistRetriever extends BaseRetriever<
  TodoistRetrieveArgs,
  TodoistRetrieveOutput
> {
  _id: ToolIdType = 't_000000000000000000000307' as unknown as ToolIdType;
  name = 'todoist.retrieve';
  description = 'Retrieve tasks from Todoist.';
  useCase = 'Pull pending tasks for planning.';

  constructor() {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 50,
      top_kModifiable: true,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      token: { type: 'string' },
      filter: { type: 'string' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [{ name: 'todoist.retrieve', args: {} } as ToolCall];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: any[]) => r[r.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private headers(token?: string) {
    const auth = token || process.env.TODOIST_TOKEN || '';
    if (!auth) {
      this.logger.error(
        'Todoist token missing for retriever',
        undefined,
        this.constructor.name,
      );
      throw Object.assign(new Error('Todoist token missing'), {
        name: 'ValidationError',
      });
    }
    this.logger.debug(
      'Creating Todoist headers for retriever',
      this.constructor.name,
    );
    return { Authorization: `Bearer ${auth}` };
  }

  protected async retrieve(
    args: TodoistRetrieveArgs & { ragConfig: RAGConfig },
  ): Promise<TodoistRetrieveOutput> {
    this.logger.info(
      `Retrieving Todoist tasks with filter: ${args.filter || 'no filter'}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Todoist retriever args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    try {
      const base = 'https://api.todoist.com/rest/v2';
      const requestParams = { filter: args.filter };

      this.logger.debug(
        `Todoist API request params: ${JSON.stringify(requestParams)}`,
        this.constructor.name,
      );
      this.logger.debug(
        'Fetching tasks from Todoist API',
        this.constructor.name,
      );

      const res = await axios.get(`${base}/tasks`, {
        headers: this.headers(args.token),
        params: requestParams,
      });
      const items = (res.data || []).slice(0, args.ragConfig.top_k || 50);

      this.logger.info(
        `Todoist tasks retrieved: ${items.length} tasks`,
        this.constructor.name,
      );
      this.logger.debug(
        `Filter: ${args.filter || 'none'}, limit: ${args.ragConfig.top_k || 50}`,
        this.constructor.name,
      );

      return {
        data: { ok: true, data: items } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `Todoist retrieval failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default TodoistRetriever;
