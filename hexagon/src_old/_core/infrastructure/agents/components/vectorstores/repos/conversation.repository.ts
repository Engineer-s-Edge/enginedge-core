import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import ConversationModel, {
  Conversation,
  ConversationCheckpoint,
} from '../entities/conversation.entity';
import {
  ConversationIdType,
  NodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

// Interface for checkpoint creation
export interface CreateCheckpointDto {
  name: string;
  description?: string;
  checkpointType?:
    | 'conversation'
    | 'graph-node-start'
    | 'graph-node-end'
    | 'graph-between-nodes';
  graphState?: {
    executionHistory: Array<{
      nodeId: NodeIdType;
      nodeName: string;
      input: string;
      output: string;
      timestamp: string;
      executionTime: number;
    }>;
    activeEdges: any[];
    pausedAtNode?: NodeIdType;
    pausedBranches?: NodeIdType[];
    currentInput?: string;
  };
}

// Interface for checkpoint restoration result
export interface CheckpointRestoreResult {
  success: boolean;
  conversation?: Conversation;
  error?: string;
}

@Injectable()
export class ConversationRepository {
  constructor(
    @InjectModel('conversation')
    private readonly conversationModel: typeof ConversationModel,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'ConversationRepository initializing',
      ConversationRepository.name,
    );
  }

  async findAll(): Promise<Conversation[]> {
    this.logger.info('Finding all conversations', ConversationRepository.name);
    try {
      const result = await this.conversationModel.find().exec();
      this.logger.info(
        `Found ${result.length} conversations`,
        ConversationRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error finding all conversations',
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async findAllByUserId(userId: string): Promise<Conversation[]> {
    this.logger.info(
      `Finding conversations for user ${userId}`,
      ConversationRepository.name,
    );
    try {
      const result = await this.conversationModel.find({ ownerId: userId }).exec();
      this.logger.info(
        `Found ${result.length} conversations for user ${userId}`,
        ConversationRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding conversations for user ${userId}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async findById(id: ConversationIdType): Promise<Conversation | null> {
    this.logger.info(
      `Finding conversation by ID ${id}`,
      ConversationRepository.name,
    );
    try {
      const result = await this.conversationModel.findById(id).exec();
      if (result) {
        this.logger.info(
          `Found conversation ${id}`,
          ConversationRepository.name,
        );
      } else {
        this.logger.warn(
          `Conversation ${id} not found`,
          ConversationRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding conversation ${id}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async create(conversation: Partial<Conversation>): Promise<Conversation> {
    this.logger.info(
      `Creating new conversation for user ${conversation.ownerId}`,
      ConversationRepository.name,
    );
    try {
      const newConversation = new this.conversationModel(conversation);
      const result = await newConversation.save();
      this.logger.info(
        `Successfully created conversation ${result._id}`,
        ConversationRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating conversation for user ${conversation.ownerId}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async update(
    id: ConversationIdType,
    update: Partial<Conversation>,
  ): Promise<Conversation | null> {
    this.logger.info(
      `Updating conversation ${id}`,
      ConversationRepository.name,
    );
    try {
      const result = await this.conversationModel
        .findByIdAndUpdate(id, update, { new: true })
        .exec();
      if (result) {
        this.logger.info(
          `Successfully updated conversation ${id}`,
          ConversationRepository.name,
        );
      } else {
        this.logger.warn(
          `Failed to update conversation ${id} - conversation not found`,
          ConversationRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating conversation ${id}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async delete(id: ConversationIdType): Promise<Conversation | null> {
    this.logger.info(
      `Deleting conversation ${id}`,
      ConversationRepository.name,
    );
    try {
      const result = await this.conversationModel.findByIdAndDelete(id).exec();
      if (result) {
        this.logger.info(
          `Successfully deleted conversation ${id}`,
          ConversationRepository.name,
        );
      } else {
        this.logger.warn(
          `Failed to delete conversation ${id} - conversation not found`,
          ConversationRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting conversation ${id}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Create a checkpoint of the current conversation state
   * @param conversationId ID of the conversation
   * @param checkpointData Checkpoint metadata
   * @returns Updated conversation with the new checkpoint
   */
  async createCheckpoint(
    conversationId: ConversationIdType,
    checkpointData: CreateCheckpointDto,
  ): Promise<Conversation | null> {
    this.logger.info(
      `Creating checkpoint for conversation ${conversationId} with name: ${checkpointData.name}`,
      ConversationRepository.name,
    );
    try {
      // Get the current conversation
      const conversation = await this.findById(conversationId);

      if (!conversation) {
        this.logger.warn(
          `Cannot create checkpoint - conversation ${conversationId} not found`,
          ConversationRepository.name,
        );
        return null;
      }

      // Create the checkpoint object
      const mongoose = require('mongoose');
      const checkpoint: ConversationCheckpoint = {
        _id: new mongoose.Types.ObjectId().toString(),
        name: checkpointData.name,
        description: checkpointData.description,
        timestamp: new Date().toISOString(),
        checkpointType: checkpointData.checkpointType || 'conversation',
        conversationState: {
          currentNode: conversation.currentNode,
          messages: [...conversation.messages],
          snippets: conversation.snippets
            ? [...conversation.snippets]
            : undefined,
          memoryRecords: { ...conversation.memoryRecords },
        },
        graphState: checkpointData.graphState,
      };

      this.logger.info(
        `Checkpoint created with ${conversation.messages.length} messages and ${conversation.snippets?.length || 0} snippets`,
        ConversationRepository.name,
      );

      // Add the checkpoint to the conversation
      const result = await this.conversationModel
        .findByIdAndUpdate(
          conversationId,
          {
            $push: { checkpoints: checkpoint },
          },
          { new: true },
        )
        .exec();

      if (result) {
        this.logger.info(
          `Successfully added checkpoint to conversation ${conversationId}`,
          ConversationRepository.name,
        );
      } else {
        this.logger.warn(
          `Failed to add checkpoint to conversation ${conversationId}`,
          ConversationRepository.name,
        );
      }

      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating checkpoint for conversation ${conversationId}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * List all checkpoints for a conversation
   * @param conversationId ID of the conversation
   * @returns Array of checkpoints or null if conversation not found
   */
  async listCheckpoints(
    conversationId: ConversationIdType,
  ): Promise<ConversationCheckpoint[] | null> {
    this.logger.info(
      `Listing checkpoints for conversation ${conversationId}`,
      ConversationRepository.name,
    );
    try {
      const conversation = await this.findById(conversationId);

      if (!conversation) {
        this.logger.warn(
          `Cannot list checkpoints - conversation ${conversationId} not found`,
          ConversationRepository.name,
        );
        return null;
      }

      const checkpoints = conversation.checkpoints || [];
      this.logger.info(
        `Found ${checkpoints.length} checkpoints for conversation ${conversationId}`,
        ConversationRepository.name,
      );
      return checkpoints;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error listing checkpoints for conversation ${conversationId}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Get a specific checkpoint by ID
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
      ConversationRepository.name,
    );
    try {
      const conversation = await this.findById(conversationId);

      if (!conversation || !conversation.checkpoints) {
        this.logger.warn(
          `Cannot get checkpoint - conversation ${conversationId} not found or has no checkpoints`,
          ConversationRepository.name,
        );
        return null;
      }

      const checkpoint =
        conversation.checkpoints.find((cp) => cp._id === checkpointId) || null;
      if (checkpoint) {
        this.logger.info(
          `Found checkpoint ${checkpointId} for conversation ${conversationId}`,
          ConversationRepository.name,
        );
      } else {
        this.logger.warn(
          `Checkpoint ${checkpointId} not found for conversation ${conversationId}`,
          ConversationRepository.name,
        );
      }
      return checkpoint;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error getting checkpoint ${checkpointId} for conversation ${conversationId}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a checkpoint
   * @param conversationId ID of the conversation
   * @param checkpointId ID of the checkpoint
   * @returns Updated conversation or null if not found
   */
  async deleteCheckpoint(
    conversationId: ConversationIdType,
    checkpointId: string,
  ): Promise<Conversation | null> {
    this.logger.info(
      `Deleting checkpoint ${checkpointId} from conversation ${conversationId}`,
      ConversationRepository.name,
    );
    try {
      const result = await this.conversationModel
        .findByIdAndUpdate(
          conversationId,
          {
            $pull: { checkpoints: { _id: checkpointId } },
          },
          { new: true },
        )
        .exec();

      if (result) {
        this.logger.info(
          `Successfully deleted checkpoint ${checkpointId} from conversation ${conversationId}`,
          ConversationRepository.name,
        );
      } else {
        this.logger.warn(
          `Failed to delete checkpoint ${checkpointId} from conversation ${conversationId} - conversation not found`,
          ConversationRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting checkpoint ${checkpointId} from conversation ${conversationId}`,
        ConversationRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Restore a conversation to a checkpoint state
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
      ConversationRepository.name,
    );
    try {
      // Get the conversation and validate
      const conversation = await this.findById(conversationId);

      if (!conversation) {
        this.logger.warn(
          `Cannot restore checkpoint - conversation ${conversationId} not found`,
          ConversationRepository.name,
        );
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      if (!conversation.checkpoints || conversation.checkpoints.length === 0) {
        this.logger.warn(
          `Cannot restore checkpoint - no checkpoints available for conversation ${conversationId}`,
          ConversationRepository.name,
        );
        return {
          success: false,
          error: 'No checkpoints available for this conversation',
        };
      }

      // Find the checkpoint
      const checkpoint = conversation.checkpoints.find(
        (cp) => cp._id === checkpointId,
      );

      if (!checkpoint) {
        this.logger.warn(
          `Cannot restore checkpoint - checkpoint ${checkpointId} not found for conversation ${conversationId}`,
          ConversationRepository.name,
        );
        return {
          success: false,
          error: 'Checkpoint not found',
        };
      }

      this.logger.info(
        `Restoring conversation ${conversationId} with ${checkpoint.conversationState.messages.length} messages and ${checkpoint.conversationState.snippets?.length || 0} snippets`,
        ConversationRepository.name,
      );

      // Restore the conversation state from the checkpoint
      const updatedConversation = await this.conversationModel
        .findByIdAndUpdate(
          conversationId,
          {
            currentNode: checkpoint.conversationState.currentNode,
            messages: checkpoint.conversationState.messages,
            snippets: checkpoint.conversationState.snippets || [],
            memoryRecords: checkpoint.conversationState.memoryRecords,
          },
          { new: true },
        )
        .exec();

      this.logger.info(
        `Successfully restored conversation ${conversationId} to checkpoint ${checkpointId}`,
        ConversationRepository.name,
      );

      return {
        success: true,
        conversation: updatedConversation || undefined,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error restoring conversation ${conversationId} to checkpoint ${checkpointId}`,
        ConversationRepository.name,
        info.stack,
      );
      return {
        success: false,
        error: `Failed to restore checkpoint: ${info.message}`,
      };
    }
  }
}
