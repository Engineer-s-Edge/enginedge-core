import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationRepository } from '../../core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import { Conversation, ConversationMessage } from '../../core/infrastructure/agents/components/vectorstores/entities/conversation.entity';
import {
  ConversationIdType,
  UserIdType,
  GraphAgentIdType,
  ReActAgentIdType,
  NodeIdType,
  MessageId,
} from '../../core/infrastructure/database/utils/custom_types';
import { AgentMemoryType } from '../../core/infrastructure/agents/components/memory/memory.interface';
import { MyLogger } from '../../core/services/logger/logger.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'ConversationsService initialized',
      ConversationsService.name,
    );
  }

  /**
   * Get all conversations for a specific user
   */
  async findByUserId(userId: UserIdType): Promise<Conversation[]> {
    this.logger.info(
      `Finding conversations for user: ${userId}`,
      ConversationsService.name,
    );
    try {
      const conversations = await this.conversationRepository.findAllByUserId(
        userId,
      );
      this.logger.info(
        `Found ${conversations.length} conversations for user: ${userId}`,
        ConversationsService.name,
      );
      return conversations;
    } catch (error) {
      this.logger.error(
        `Error finding conversations for user ${userId}`,
        ConversationsService.name,
      );
      throw error;
    }
  }

  /**
   * Get a specific conversation by ID
   */
  async findById(id: ConversationIdType): Promise<Conversation | null> {
    this.logger.info(
      `Finding conversation: ${id}`,
      ConversationsService.name,
    );
    try {
      const conversation = await this.conversationRepository.findById(id);
      if (conversation) {
        this.logger.info(
          `Found conversation: ${id}`,
          ConversationsService.name,
        );
      } else {
        this.logger.warn(
          `Conversation not found: ${id}`,
          ConversationsService.name,
        );
      }
      return conversation;
    } catch (error) {
      this.logger.error(
        `Error finding conversation ${id}`,
        ConversationsService.name,
      );
      throw error;
    }
  }

  /**
   * Create a new conversation
   */
  async create(
    userId: UserIdType,
    agentId: GraphAgentIdType | ReActAgentIdType,
    initialMessage?: string,
  ): Promise<Conversation> {
    this.logger.info(
      `Creating conversation for user: ${userId}, agent: ${agentId}`,
      ConversationsService.name,
    );
    try {
      // Create initial conversation with default memory config
      const conversationData: Partial<Conversation> = {
        ownerId: userId,
        agentId,
        currentNode: 'start' as NodeIdType,
        memoryConfig: {
          type: AgentMemoryType.ConversationBufferWindowMemory,
          maxSize: 10,
        },
        memoryRecords: {
          config: {
            type: AgentMemoryType.ConversationBufferWindowMemory,
            maxSize: 10,
          },
          data: {
            type: AgentMemoryType.ConversationBufferWindowMemory,
            messages: [],
          },
        },
        messages: [],
        snippets: [],
        summary: { data: '' },
        checkpoints: [],
      };

      const conversation = await this.conversationRepository.create(
        conversationData,
      );

      // If initial message provided, add it
      if (initialMessage) {
        const initialMsg: Partial<ConversationMessage> = {
          _id: MessageId.create(new Types.ObjectId()),
          timestamp: new Date().toISOString(),
          sender: 'human' as any,
          text: initialMessage,
          nodeId: 'start' as NodeIdType,
          order: 0,
        };

        conversation.messages.push(initialMsg as ConversationMessage);
        await conversation.save();
      }

      this.logger.info(
        `Created conversation: ${conversation._id}`,
        ConversationsService.name,
      );
      return conversation;
    } catch (error) {
      this.logger.error(
        `Error creating conversation for user ${userId}`,
        ConversationsService.name,
      );
      throw error;
    }
  }

  /**
   * Add a message to an existing conversation
   */
  async addMessage(
    conversationId: ConversationIdType,
    messageData: {
      sender: 'human' | 'ai' | 'system' | 'internal';
      text: string;
      thought?: string;
      action?: string;
      observation?: string;
      finalAnswer?: string;
    },
  ): Promise<Conversation | null> {
    this.logger.info(
      `Adding message to conversation: ${conversationId}`,
      ConversationsService.name,
    );
    try {
      const conversation = await this.conversationRepository.findById(
        conversationId,
      );
      
      if (!conversation) {
        this.logger.warn(
          `Conversation not found: ${conversationId}`,
          ConversationsService.name,
        );
        return null;
      }

      const newMessage: Partial<ConversationMessage> = {
        _id: MessageId.create(new Types.ObjectId()),
        timestamp: new Date().toISOString(),
        sender: messageData.sender as any,
        text: messageData.text,
        nodeId: conversation.currentNode,
        order: conversation.messages.length,
        thought: messageData.thought,
        action: messageData.action,
        observation: messageData.observation,
        finalAnswer: messageData.finalAnswer,
      };

      conversation.messages.push(newMessage as ConversationMessage);
      await conversation.save();

      this.logger.info(
        `Added message to conversation: ${conversationId}`,
        ConversationsService.name,
      );
      return conversation;
    } catch (error) {
      this.logger.error(
        `Error adding message to conversation ${conversationId}`,
        ConversationsService.name,
      );
      throw error;
    }
  }
}
