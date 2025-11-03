import { Injectable, Inject } from '@nestjs/common';
import {
  ConversationRepository,
  CheckpointRestoreResult,
  CreateCheckpointDto,
} from '../repos/conversation.repository';
import {
  ConversationIdType,
  NodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import {
  ConversationCheckpoint,
  Conversation,
} from '../entities/conversation.entity';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable()
export class CheckpointService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info('CheckpointService initializing', CheckpointService.name);
  }

  /**
   * Create a new checkpoint for a conversation
   * @param conversationId ID of the conversation
   * @param checkpointData Data for the new checkpoint
   * @returns The updated conversation or null if not found
   */
  async createCheckpoint(
    conversationId: ConversationIdType,
    checkpointData: CreateCheckpointDto,
  ): Promise<Conversation | null> {
    this.logger.info(
      `Creating checkpoint for conversation ${conversationId} with name: ${checkpointData.name}`,
      CheckpointService.name,
    );
    try {
      const result = await this.conversationRepository.createCheckpoint(
        conversationId,
        checkpointData,
      );
      if (result) {
        this.logger.info(
          `Successfully created checkpoint for conversation ${conversationId}`,
          CheckpointService.name,
        );
      } else {
        this.logger.warn(
          `Failed to create checkpoint for conversation ${conversationId} - conversation not found`,
          CheckpointService.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating checkpoint for conversation ${conversationId}`,
        CheckpointService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Create a graph-specific checkpoint
   * @param conversationId ID of the conversation
   * @param checkpointData Graph checkpoint data
   * @returns The updated conversation or null if not found
   */
  async createGraphCheckpoint(
    conversationId: ConversationIdType,
    checkpointData: Omit<CreateCheckpointDto, 'checkpointType'> & {
      checkpointType:
        | 'graph-node-start'
        | 'graph-node-end'
        | 'graph-between-nodes';
      graphState: NonNullable<CreateCheckpointDto['graphState']>;
    },
  ): Promise<Conversation | null> {
    this.logger.info(
      `Creating graph checkpoint for conversation ${conversationId} with type: ${checkpointData.checkpointType}`,
      CheckpointService.name,
    );
    try {
      const result = await this.conversationRepository.createCheckpoint(
        conversationId,
        checkpointData,
      );
      if (result) {
        this.logger.info(
          `Successfully created graph checkpoint for conversation ${conversationId}`,
          CheckpointService.name,
        );
      } else {
        this.logger.warn(
          `Failed to create graph checkpoint for conversation ${conversationId} - conversation not found`,
          CheckpointService.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating graph checkpoint for conversation ${conversationId}`,
        CheckpointService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Get graph checkpoints for a specific node or branch
   * @param conversationId ID of the conversation
   * @param nodeId Optional node ID to filter checkpoints
   * @returns Array of graph checkpoints
   */
  async getGraphCheckpoints(
    conversationId: ConversationIdType,
    nodeId?: NodeIdType,
  ): Promise<ConversationCheckpoint[]> {
    this.logger.info(
      `Getting graph checkpoints for conversation ${conversationId}${nodeId ? ` filtered by node ${nodeId}` : ''}`,
      CheckpointService.name,
    );
    try {
      const allCheckpoints =
        await this.conversationRepository.listCheckpoints(conversationId);

      if (!allCheckpoints) {
        this.logger.warn(
          `No checkpoints found for conversation ${conversationId}`,
          CheckpointService.name,
        );
        return [];
      }

      let graphCheckpoints = allCheckpoints.filter(
        (cp) => cp.checkpointType && cp.checkpointType.startsWith('graph-'),
      );

      if (nodeId) {
        const beforeFilter = graphCheckpoints.length;
        graphCheckpoints = graphCheckpoints.filter(
          (cp) =>
            cp.graphState?.pausedAtNode === nodeId ||
            cp.graphState?.pausedBranches?.includes(nodeId) ||
            cp.graphState?.executionHistory?.some(
              (entry) => entry.nodeId === nodeId,
            ),
        );
        this.logger.info(
          `Filtered graph checkpoints from ${beforeFilter} to ${graphCheckpoints.length} for node ${nodeId}`,
          CheckpointService.name,
        );
      }

      this.logger.info(
        `Found ${graphCheckpoints.length} graph checkpoints for conversation ${conversationId}`,
        CheckpointService.name,
      );
      return graphCheckpoints;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error getting graph checkpoints for conversation ${conversationId}`,
        CheckpointService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Get all checkpoints for a conversation
   * @param conversationId ID of the conversation
   * @returns Array of checkpoints or null if conversation not found
   */
  async getCheckpoints(
    conversationId: ConversationIdType,
  ): Promise<ConversationCheckpoint[] | null> {
    this.logger.info(
      `Getting all checkpoints for conversation ${conversationId}`,
      CheckpointService.name,
    );
    try {
      const result =
        await this.conversationRepository.listCheckpoints(conversationId);
      if (result) {
        this.logger.info(
          `Found ${result.length} checkpoints for conversation ${conversationId}`,
          CheckpointService.name,
        );
      } else {
        this.logger.warn(
          `No checkpoints found for conversation ${conversationId}`,
          CheckpointService.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error getting checkpoints for conversation ${conversationId}`,
        CheckpointService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Get a specific checkpoint
   * @param conversationId ID of the conversation
   * @param checkpointId ID of the checkpoint
   * @returns The checkpoint or null if not found
   */
  async getCheckpoint(
    conversationId: ConversationIdType,
    checkpointId: string,
  ): Promise<ConversationCheckpoint | null> {
    this.logger.info(
      `Getting checkpoint ${checkpointId} for conversation ${conversationId}`,
      CheckpointService.name,
    );
    try {
      const result = await this.conversationRepository.getCheckpoint(
        conversationId,
        checkpointId,
      );
      if (result) {
        this.logger.info(
          `Found checkpoint ${checkpointId} for conversation ${conversationId}`,
          CheckpointService.name,
        );
      } else {
        this.logger.warn(
          `Checkpoint ${checkpointId} not found for conversation ${conversationId}`,
          CheckpointService.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error getting checkpoint ${checkpointId} for conversation ${conversationId}`,
        CheckpointService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a checkpoint
   * @param conversationId ID of the conversation
   * @param checkpointId ID of the checkpoint
   * @returns The updated conversation or null if not found
   */
  async deleteCheckpoint(
    conversationId: ConversationIdType,
    checkpointId: string,
  ): Promise<Conversation | null> {
    this.logger.info(
      `Deleting checkpoint ${checkpointId} for conversation ${conversationId}`,
      CheckpointService.name,
    );
    try {
      const result = await this.conversationRepository.deleteCheckpoint(
        conversationId,
        checkpointId,
      );
      if (result) {
        this.logger.info(
          `Successfully deleted checkpoint ${checkpointId} for conversation ${conversationId}`,
          CheckpointService.name,
        );
      } else {
        this.logger.warn(
          `Failed to delete checkpoint ${checkpointId} for conversation ${conversationId} - conversation not found`,
          CheckpointService.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting checkpoint ${checkpointId} for conversation ${conversationId}`,
        CheckpointService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Restore a conversation to a checkpoint
   * @param conversationId ID of the conversation
   * @param checkpointId ID of the checkpoint
   * @returns Result of the restore operation
   */
  async restoreCheckpoint(
    conversationId: ConversationIdType,
    checkpointId: string,
  ): Promise<CheckpointRestoreResult> {
    this.logger.info(
      `Restoring conversation ${conversationId} to checkpoint ${checkpointId}`,
      CheckpointService.name,
    );
    try {
      const result = await this.conversationRepository.restoreCheckpoint(
        conversationId,
        checkpointId,
      );
      if (result.success) {
        this.logger.info(
          `Successfully restored conversation ${conversationId} to checkpoint ${checkpointId}`,
          CheckpointService.name,
        );
      } else {
        this.logger.warn(
          `Failed to restore conversation ${conversationId} to checkpoint ${checkpointId}: ${result.error}`,
          CheckpointService.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error restoring conversation ${conversationId} to checkpoint ${checkpointId}`,
        CheckpointService.name,
        info.stack,
      );
      throw error;
    }
  }
}
