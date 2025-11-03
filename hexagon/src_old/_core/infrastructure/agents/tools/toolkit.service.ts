import { Injectable } from '@nestjs/common';
import { Tool, ToolCall, UserApprovalCallback } from './toolkit.interface';

import Ajv, { ValidateFunction } from 'ajv';
import sanitizeHtml = require('sanitize-html');
import { MyLogger } from '@core/services/logger/logger.service';

@Injectable()
export class Toolkit {
  private tools = new Map<string, Tool>();
  private validators = new Map<string, ValidateFunction>();
  private ajv = new Ajv();
  private failureCounts = new Map<string, number>();
  private pauseThreshold = 2;

  constructor(
    private onUserApproval: UserApprovalCallback,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('Toolkit initialized with AJV validator', Toolkit.name);
  }

  register(tool: Tool): void {
    this.logger.info(`Starting tool registration: ${tool.name}`, Toolkit.name);
    this.logger.debug(
      `Tool details: type=${tool.type}, description=${tool.description}`,
      Toolkit.name,
    );

    if (this.tools.has(tool.name)) {
      this.logger.error(
        `Tool "${tool.name}" is already registered`,
        undefined,
        Toolkit.name,
      );
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }

    this.logger.info(
      `Registering tool: ${tool.name} (type: ${tool.type})`,
      Toolkit.name,
    );

    // Only retrievers need RAG config
    if (tool.type !== 'retriever') {
      this.logger.debug(
        `Removing RAG config for non-retriever tool: ${tool.name}`,
        Toolkit.name,
      );
      delete tool.retrieverConfig;
    } else {
      this.logger.debug(
        `Preserving RAG config for retriever tool: ${tool.name}`,
        Toolkit.name,
      );
    }

    // Compile schema
    this.logger.debug(
      `Compiling input schema for tool: ${tool.name}`,
      Toolkit.name,
    );
    const validate = this.ajv.compile(tool.inputSchema);
    this.tools.set(tool.name, tool);
    this.validators.set(tool.name, validate);
    this.failureCounts.set(tool.name, 0);

    this.logger.info(
      `Successfully registered tool: ${tool.name} (total tools: ${this.tools.size})`,
      Toolkit.name,
    );
  }

  /**
   * Executes a batch of tool calls, handling parallelism per tool settings
   */
  async executeCalls(calls: ToolCall[]): Promise<any[]> {
    this.logger.info(
      `Executing batch of ${calls.length} tool calls`,
      Toolkit.name,
    );
    this.logger.debug(
      `Tool calls: ${JSON.stringify(calls.map((c) => ({ name: c.name, argsKeys: Object.keys(c.args) })))}`,
      Toolkit.name,
    );

    // Group calls by parallel flag
    const parallelGroups: { [key: string]: ToolCall[] } = {};
    const serial: ToolCall[] = [];
    for (const call of calls) {
      const tool = this.tools.get(call.name);
      if (!tool) {
        this.logger.error(
          `Unregistered tool: ${call.name}`,
          undefined,
          Toolkit.name,
        );
        throw new Error(`Unregistered tool: ${call.name}`);
      }
      if (tool.parallel) {
        parallelGroups[call.name] = parallelGroups[call.name] || [];
        parallelGroups[call.name].push(call);
        this.logger.debug(
          `Added to parallel group: ${call.name}`,
          Toolkit.name,
        );
      } else {
        serial.push(call);
        this.logger.debug(`Added to serial queue: ${call.name}`, Toolkit.name);
      }
    }

    this.logger.info(
      `Grouped calls: ${serial.length} serial, ${Object.keys(parallelGroups).length} parallel groups`,
      Toolkit.name,
    );
    this.logger.debug(
      `Parallel groups: ${JSON.stringify(Object.keys(parallelGroups))}`,
      Toolkit.name,
    );

    const results: any[] = [];
    // Execute serially
    for (const call of serial) {
      this.logger.info(
        `Executing serial tool call: ${call.name}`,
        Toolkit.name,
      );
      const startTime = Date.now();
      const result = await this.executeCallWithFlow(call);
      const duration = Date.now() - startTime;
      this.logger.debug(
        `Serial tool call completed: ${call.name} (${duration}ms)`,
        Toolkit.name,
      );
      results.push(result);
    }
    // Execute parallel groups
    for (const [toolName, group] of Object.entries(parallelGroups)) {
      this.logger.info(
        `Executing parallel group for tool: ${toolName} with ${group.length} calls`,
        Toolkit.name,
      );
      const strategy = this.tools.get(toolName)!.concatenate;
      const argsList = group.map((c) => c.args);
      const concatenatedArgs = strategy ? strategy(argsList) : argsList;
      this.logger.debug(
        `Concatenated args for parallel group: ${toolName}`,
        Toolkit.name,
      );

      const startTime = Date.now();
      const result = await this.executeCallWithFlow({
        name: toolName,
        args: concatenatedArgs,
      });
      const duration = Date.now() - startTime;
      this.logger.debug(
        `Parallel group completed: ${toolName} (${duration}ms)`,
        Toolkit.name,
      );
      results.push(result);
    }

    this.logger.info(
      `Completed batch execution, returning ${results.length} results`,
      Toolkit.name,
    );
    return results;
  }

  /**
   * Handles validation, user approval, execution, error counting, and retries
   */
  private async executeCallWithFlow(call: ToolCall): Promise<any> {
    const tool = this.tools.get(call.name)!;

    this.logger.info(
      `Starting tool call execution: ${call.name}`,
      Toolkit.name,
    );
    this.logger.debug(
      `Tool call args: ${JSON.stringify(call.args)}`,
      Toolkit.name,
    );

    // Validate
    this.logger.debug(`Validating tool call: ${call.name}`, Toolkit.name);
    const validate = this.validators.get(call.name)!;
    if (!validate(call.args)) {
      this.logger.error(
        `Validation failed for tool ${call.name}`,
        undefined,
        Toolkit.name,
      );
      this.logger.debug(
        `Validation errors: ${JSON.stringify(validate.errors)}`,
        Toolkit.name,
      );
      throw new Error(`Validation failed for tool ${call.name}`);
    }
    this.logger.debug(`Validation passed for tool: ${call.name}`, Toolkit.name);

    // Approval
    this.logger.info(
      `Requesting user approval for tool call: ${call.name}`,
      Toolkit.name,
    );
    const failureCount = this.failureCounts.get(call.name)!;
    this.logger.debug(
      `Current failure count for ${call.name}: ${failureCount}`,
      Toolkit.name,
    );

    const { approved, modifiedArgs } = await this.onUserApproval(
      call,
      failureCount,
    );
    if (!approved) {
      this.logger.warn(`User rejected tool call: ${call.name}`, Toolkit.name);
      throw new Error(`User rejected tool call: ${call.name}`);
    }

    const finalArgs = modifiedArgs ?? call.args;
    if (modifiedArgs) {
      this.logger.debug(
        `User modified args for tool: ${call.name}`,
        Toolkit.name,
      );
    }

    // Execution with retries
    let attempts = 0;
    while (attempts <= tool.retries) {
      try {
        this.logger.info(
          `Executing tool: ${call.name} (attempt ${attempts + 1}/${tool.retries + 1})`,
          Toolkit.name,
        );
        const startTime = Date.now();

        // Execute underlying tool logic
        const output = await this.invokeTool(tool, finalArgs);

        const duration = Date.now() - startTime;
        // Reset failure count
        this.failureCounts.set(call.name, 0);
        this.logger.info(
          `Successfully executed tool: ${call.name} (${duration}ms)`,
          Toolkit.name,
        );
        return output;
      } catch (e: unknown) {
        attempts++;
        const count = (this.failureCounts.get(call.name) || 0) + 1;
        this.failureCounts.set(call.name, count);

        this.logger.warn(
          `Tool execution failed: ${call.name} (attempt ${attempts}, failure count: ${count})`,
          Toolkit.name,
        );
        if (e instanceof Error) {
          this.logger.debug(`Error details: ${e.message}`, Toolkit.name);
        }

        // Pause if threshold reached
        if (count >= this.pauseThreshold) {
          this.logger.warn(
            `Tool failure threshold reached for ${call.name}, pausing for user approval`,
            Toolkit.name,
          );
          await this.onUserApproval(call, count); // pause for user
        }
        if (attempts > tool.retries) {
          // Emit error guidance or throw
          if (e instanceof Error) {
            const evt = tool.errorEvent.find((ev) => ev.name === e.name);
            if (evt && evt.retryable) {
              this.logger.debug(
                `Error is retryable, continuing: ${e.name}`,
                Toolkit.name,
              );
              continue;
            }
          }
          this.logger.error(
            `Tool execution failed after all retries: ${call.name}`,
            (e as Error).stack,
            Toolkit.name,
          );
          throw e;
        }
      }
    }
  }

  /**
   * Low-level invocation of the tool's execute method, passing RAG params if needed
   */
  private async invokeTool(tool: Tool, args: any): Promise<any> {
    this.logger.debug(
      `Invoking tool: ${tool.name} (type: ${tool.type})`,
      Toolkit.name,
    );

    // If retriever, pass rag params
    if (tool.type === 'retriever') {
      this.logger.debug(
        `Adding RAG config for retriever tool: ${tool.name}`,
        Toolkit.name,
      );
      const result = await tool.execute({
        ...args,
        ragConfig: tool.retrieverConfig,
      });
      this.logger.debug(`Retriever tool completed: ${tool.name}`, Toolkit.name);
      return result;
    }

    this.logger.debug(
      `Executing non-retriever tool: ${tool.name}`,
      Toolkit.name,
    );
    const result = await tool.execute(args);
    this.logger.debug(
      `Non-retriever tool completed: ${tool.name}`,
      Toolkit.name,
    );
    return result;
  }

  public preparePromptPayload(): string {
    this.logger.info(
      `Preparing prompt payload for ${this.tools.size} tools`,
      Toolkit.name,
    );

    // If no tools are registered, return empty string
    if (this.tools.size === 0) {
      this.logger.debug('No tools registered, returning empty payload', Toolkit.name);
      return '';
    }

    const toolDescriptions = Array.from(this.tools.values())
      .map((t) => {
        const name = sanitizeHtml(t.name);
        const desc = sanitizeHtml(t.description);
        const input = JSON.stringify(t.inputSchema);
        const output = JSON.stringify(t.outputSchema);
        const examples = JSON.stringify(t.invocationExample);
        // WIP: ADD THE REST
        return `Tool: ${name}\nDescription: ${desc}\nUseCase: ${t.useCase}\nInput: ${input}\nOutput: ${output}\nExamples: ${examples}`;
      })
      .join('\n---\n');

    // Add header to indicate tools are available
    const payload = `\n\nYou have access to the following tools:\n\n${toolDescriptions}\n`;

    this.logger.debug(
      `Generated prompt payload: ${payload.length} characters`,
      Toolkit.name,
    );
    return payload;
  }
}
