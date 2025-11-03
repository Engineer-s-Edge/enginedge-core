import { Injectable, BadRequestException } from '@nestjs/common';
import { AgentService } from '../../../../core/infrastructure/agents/core/agents/agent.service';
import { AgentExecuteOptions } from '../../../../core/infrastructure/agents/core/agents/services/execution.service';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ExecuteAssistantDto } from '../dto/execution.dto';
import { AgentConfigFactory } from './agent-config-factory.service';
import { AssistantsCrudService } from './assistants-crud.service';
import { AssistantsRepository } from '../repositories/assistants.repository';
import { AssistantStatus } from '../entities/assistant.entity';
import { MyLogger } from '../../../../core/services/logger/logger.service';

@Injectable()
export class AssistantExecutorService {
  constructor(
    private readonly agentService: AgentService,
    private readonly agentConfigFactory: AgentConfigFactory,
    private readonly assistantsCrudService: AssistantsCrudService,
    private readonly assistantsRepository: AssistantsRepository,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'AssistantExecutorService initialized',
      AssistantExecutorService.name,
    );
  }

  async execute(name: string, executeDto: ExecuteAssistantDto): Promise<any> {
    this.logger.info(
      `Executing assistant: ${name} for user: ${executeDto.userId}`,
      AssistantExecutorService.name,
    );

    try {
      const assistant = await this.assistantsCrudService.findByName(name);

      if (assistant.status !== AssistantStatus.ACTIVE) {
        this.logger.warn(
          `Assistant '${name}' is not active (status: ${assistant.status})`,
          AssistantExecutorService.name,
        );
        throw new BadRequestException(`Assistant '${name}' is not active`);
      }

      this.logger.debug(
        `Converting assistant '${name}' to agent configuration`,
        AssistantExecutorService.name,
      );
      const { type, userId, conversationId, settings, config } =
        this.agentConfigFactory.convertAssistantToAgentOptions(
          assistant,
          executeDto,
        );

      const history = executeDto.options?.history;

      const executeOptions: AgentExecuteOptions = {
        input: executeDto.input,
        streaming: executeDto.options?.streaming || false,
        tokenTarget: executeDto.options?.maxTokens,
        history:
          history && history.length > 0
            ? (history as [HumanMessage, ...AIMessage[]])
            : undefined,
      };

      this.logger.info(
        `Creating and executing agent for assistant '${name}'`,
        AssistantExecutorService.name,
      );
      const result = await this.agentService.createAndExecute(
        { type, userId, conversationId, settings, config },
        executeOptions,
      );

      await this.assistantsRepository.updateExecutionStats(name);
      this.logger.info(
        `Successfully executed assistant '${name}'`,
        AssistantExecutorService.name,
      );

      // Handle both string results and streaming results
      let finalResult: string;
      if (typeof result === 'string') {
        finalResult = result;
      } else if (result && typeof result[Symbol.asyncIterator] === 'function') {
        // It's a stream, accumulate the results
        finalResult = '';
        for await (const chunk of result) {
          finalResult += chunk;
        }
      } else {
        finalResult = String(result || 'No result');
      }

      return {
        success: true,
        result: finalResult,
        assistant: assistant.name,
        type: type,
        streaming: executeDto.options?.streaming || false,
        sessionId: conversationId,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to execute assistant '${name}': ${e.message}`,
        e.stack,
        AssistantExecutorService.name,
      );
      throw e;
    }
  }

  async executeStream(
    name: string,
    executeDto: ExecuteAssistantDto,
  ): Promise<AsyncGenerator<string, void, unknown>> {
    this.logger.info(
      `Streaming execution for assistant: ${name}, user: ${executeDto.userId}`,
      AssistantExecutorService.name,
    );

    try {
      const assistant = await this.assistantsCrudService.findByName(name);

      if (assistant.status !== AssistantStatus.ACTIVE) {
        throw new BadRequestException(`Assistant '${name}' is not active`);
      }

      const { type, userId, conversationId, settings, config } =
        this.agentConfigFactory.convertAssistantToAgentOptions(
          assistant,
          executeDto,
        );

      const history = executeDto.options?.history;

      const executeOptions: AgentExecuteOptions = {
        input: executeDto.input,
        streaming: true, // Force streaming
        tokenTarget: executeDto.options?.maxTokens,
        history:
          history && history.length > 0
            ? (history as [HumanMessage, ...AIMessage[]])
            : undefined,
      };

      const result = await this.agentService.createAndExecute(
        { type, userId, conversationId, settings, config },
        executeOptions,
      );

      await this.assistantsRepository.updateExecutionStats(name);

      // Return the stream directly without accumulating
      if (result && typeof (result as any)[Symbol.asyncIterator] === 'function') {
        return result as AsyncGenerator<string, void, unknown>;
      }

      // If not a stream, convert to async generator
      async function* singleValueGenerator() {
        yield String(result || 'No result');
      }
      return singleValueGenerator();
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to stream assistant '${name}': ${e.message}`,
        e.stack,
        AssistantExecutorService.name,
      );
      throw e;
    }
  }
}
