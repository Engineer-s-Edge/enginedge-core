import { Injectable } from '@nestjs/common';
import { AgentService } from '../../../../core/infrastructure/agents/core/agents/agent.service';
import {
  UserId,
  ConversationId,
  UserIdType,
  ConversationIdType,
} from '../../../../core/infrastructure/database/utils/custom_types';
import { Types } from 'mongoose';
import { MyLogger } from '../../../../core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable()
export class GraphAgentManagerService {
  constructor(
    private readonly agentService: AgentService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'GraphAgentManagerService initialized',
      GraphAgentManagerService.name,
    );
  }

  async getGraphState(userId: string, conversationId: string) {
    this.logger.info(
      `Getting graph state for user: ${userId}, conversation: ${conversationId}`,
      GraphAgentManagerService.name,
    );
    try {
      const user = UserId.create(new Types.ObjectId(userId));
      const conversation = ConversationId.create(
        new Types.ObjectId(conversationId),
      );
      const state = await this.agentService.getGraphAgentExecutionState(
        user,
        conversation,
      );
      this.logger.debug(
        `Retrieved graph state for conversation: ${conversationId}`,
        GraphAgentManagerService.name,
      );
      return state;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to get graph state for conversation: ${conversationId}\n${info.stack || ''}`,
        GraphAgentManagerService.name,
      );
      throw error;
    }
  }

  async pauseGraph(userId: string, conversationId: string, options?: any) {
    this.logger.info(
      `Pausing graph for user: ${userId}, conversation: ${conversationId}`,
      GraphAgentManagerService.name,
    );
    try {
      const user = UserId.create(new Types.ObjectId(userId));
      const conversation = ConversationId.create(
        new Types.ObjectId(conversationId),
      );
      await this.agentService.pauseGraphAgent(user, conversation, options);
      this.logger.info(
        `Successfully paused graph for conversation: ${conversationId}`,
        GraphAgentManagerService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to pause graph for conversation: ${conversationId}\n${info.stack || ''}`,
        GraphAgentManagerService.name,
      );
      throw error;
    }
  }

  async resumeGraph(userId: string, conversationId: string) {
    this.logger.info(
      `Resuming graph for user: ${userId}, conversation: ${conversationId}`,
      GraphAgentManagerService.name,
    );
    try {
      const user = UserId.create(new Types.ObjectId(userId));
      const conversation = ConversationId.create(
        new Types.ObjectId(conversationId),
      );
      await this.agentService.resumeGraphAgent(user, conversation);
      this.logger.info(
        `Successfully resumed graph for conversation: ${conversationId}`,
        GraphAgentManagerService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to resume graph for conversation: ${conversationId}\n${info.stack || ''}`,
        GraphAgentManagerService.name,
      );
      throw error;
    }
  }

  async provideGraphInput(
    userId: string,
    conversationId: string,
    nodeId: string,
    input: string,
  ) {
    this.logger.info(
      `Providing graph input for user: ${userId}, conversation: ${conversationId}, node: ${nodeId}`,
      GraphAgentManagerService.name,
    );
    try {
      const user = UserId.create(new Types.ObjectId(userId));
      const conversation = ConversationId.create(
        new Types.ObjectId(conversationId),
      );
      const node = new Types.ObjectId(nodeId) as any;
      await this.agentService.provideGraphAgentUserInput(
        user,
        conversation,
        node,
        input,
      );
      this.logger.info(
        `Successfully provided input to node: ${nodeId}`,
        GraphAgentManagerService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to provide input to node: ${nodeId}\n${info.stack || ''}`,
        GraphAgentManagerService.name,
      );
      throw error;
    }
  }

  async provideGraphApproval(
    userId: string,
    conversationId: string,
    nodeId: string,
    approved: boolean,
  ) {
    this.logger.info(
      `Providing graph approval for user: ${userId}, conversation: ${conversationId}, node: ${nodeId}, approved: ${approved}`,
      GraphAgentManagerService.name,
    );
    try {
      const user = UserId.create(new Types.ObjectId(userId));
      const conversation = ConversationId.create(
        new Types.ObjectId(conversationId),
      );
      const node = new Types.ObjectId(nodeId) as any;
      await this.agentService.provideGraphAgentUserApproval(
        user,
        conversation,
        node,
        approved,
      );
      this.logger.info(
        `Successfully provided approval to node: ${nodeId}`,
        GraphAgentManagerService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to provide approval to node: ${nodeId}\n${info.stack || ''}`,
        GraphAgentManagerService.name,
      );
      throw error;
    }
  }
}
