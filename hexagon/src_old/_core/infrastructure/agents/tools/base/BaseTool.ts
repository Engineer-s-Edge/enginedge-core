import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import {
  Tool,
  ToolCall,
  ToolResult,
  ToolSuccess,
  ToolFailure,
  ToolError,
  ToolOutput,
  RAGConfig,
} from '../toolkit.interface';
import Ajv, { ValidateFunction } from 'ajv';
import { MyLogger } from '@core/services/logger/logger.service';

/**
 * Abstract base class providing common logic for all Tools.
 */
export abstract class BaseTool<Args, Output extends ToolOutput>
  implements Tool
{
  // Metadata fields
  abstract _id: ToolIdType;
  abstract name: string;
  abstract description: string;
  abstract type: 'actor' | 'retriever';
  abstract retrieverConfig: RAGConfig | undefined;
  abstract useCase: string;
  abstract inputSchema: object;
  abstract outputSchema: object;
  abstract invocationExample: object[];
  abstract retries: number;
  abstract errorEvent: Array<{
    name: string;
    guidance: string;
    retryable: boolean;
  }>;
  abstract parallel: boolean;
  abstract concatenate: (
    results: ToolResult<any, ToolOutput>[],
  ) => ToolResult<Args, Output>;
  abstract maxIterations: number;
  abstract pauseBeforeUse: boolean;
  abstract userModifyQuery: boolean;

  private validator?: ValidateFunction;
  private ajv = new Ajv();
  protected logger: MyLogger;

  constructor() {
    this.logger = new MyLogger();
    this.logger.info(
      `Initializing ${this.constructor.name}`,
      this.constructor.name,
    );
  }

  /**
   * Initialize the tool, compiling the input schema for validation.
   */
  private ensureValidator() {
    if (!this.validator) {
      this.logger.debug(
        `Compiling input schema for ${this.constructor.name}`,
        this.constructor.name,
      );
      this.validator = this.ajv.compile(this.inputSchema);
      this.logger.info(
        `Successfully initialized ${this.constructor.name}`,
        this.constructor.name,
      );
    }
  }

  /**
   * Public entrypoint for tool execution flow with validation, retries, and error handling.
   */
  public async execute(call: ToolCall): Promise<ToolResult<Args, Output>> {
    this.ensureValidator();
    this.logger.info(
      `Executing tool call: ${call.name}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Tool call args: ${JSON.stringify(call.args)}`,
      this.constructor.name,
    );

    if (!this.validator!(call.args)) {
      this.logger.error(
        `Validation failed for tool call: ${call.name}`,
        undefined,
        this.constructor.name,
      );
      return this.failure(call, {
        name: 'ValidationError',
        message: 'Input does not match schema',
        retryable: false,
      });
    }

    if (this.pauseBeforeUse) {
      this.logger.info(
        `Pausing before use for tool: ${call.name}`,
        this.constructor.name,
      );
      // Hook for user confirmation/adjustment if needed
      await this.onPause(call);
    }

    let attempts = 0;
    const startTime = new Date();
    while (attempts <= this.retries) {
      try {
        this.logger.debug(
          `Executing tool: ${call.name} (attempt ${attempts + 1}/${this.retries + 1})`,
          this.constructor.name,
        );
        const data =
          this.type === 'actor'
            ? await this.executeTool(
                call.args as Args & { ragConfig: undefined },
              )
            : await this.executeTool(
                call.args as Args & { ragConfig: RAGConfig },
              );
        const endTime = new Date();
        this.logger.info(
          `Successfully executed tool: ${call.name} in ${endTime.getTime() - startTime.getTime()}ms`,
          this.constructor.name,
        );
        return this.success(call, data, startTime, endTime, attempts + 1);
      } catch (error: any) {
        attempts++;
        this.logger.warn(
          `Tool execution failed: ${call.name} (attempt ${attempts}) - ${error.message}`,
          this.constructor.name,
        );
        const evt = this.errorEvent.find((e) => e.name === error.name);
        if (!evt || !evt.retryable || attempts > this.retries) {
          const endTime = new Date();
          this.logger.error(
            `Tool execution failed after all retries: ${call.name}`,
            error.stack,
            this.constructor.name,
          );
          return this.failure(
            call,
            {
              name: error.name,
              message: error.message,
              guidance: evt?.guidance,
              retryable: false,
            },
            startTime,
            endTime,
            attempts,
          );
        }
      }
    }

    // Fallback (shouldn't reach here)
    this.logger.error(
      `Tool execution exceeded retry limit: ${call.name}`,
      undefined,
      this.constructor.name,
    );
    return this.failure(call, {
      name: 'UnknownError',
      message: 'Exceeded retry limit',
      retryable: false,
    });
  }

  /**
   * Execute the concrete tool logic.
   */
  protected abstract executeTool(
    args: Args & { ragConfig?: RAGConfig },
  ): Promise<Output>;

  /**
   * Optional hook invoked before first execution when pauseBeforeUse=true.
   */
  protected async onPause(call: ToolCall): Promise<void> {
    this.logger.debug(
      `onPause hook called for tool: ${call.name}`,
      this.constructor.name,
    );
    // Default no-op; override to prompt user for approval or modifications.
  }

  private success(
    call: ToolCall,
    output: Output,
    startTime: Date,
    endTime: Date,
    attempts: number,
  ): ToolSuccess<Args, Output> {
    return {
      success: true,
      call,
      output,
      startTime,
      endTime,
      attempts,
      durationMs: endTime.getTime() - startTime.getTime(),
    };
  }

  private failure(
    call: ToolCall,
    error: ToolError,
    startTime: Date = new Date(),
    endTime: Date = new Date(),
    attempts: number = 1,
  ): ToolFailure<Args> {
    return {
      success: false,
      call,
      error,
      startTime,
      endTime,
      attempts,
      durationMs: endTime.getTime() - startTime.getTime(),
    };
  }
}
