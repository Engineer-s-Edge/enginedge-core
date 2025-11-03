import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { MyLogger } from '../../core/services/logger/logger.service';
import { ConversationIdType, UserIdType, GraphAgentIdType, ReActAgentIdType } from '@core/infrastructure/database/utils/custom_types';
import { ConversationMessage } from '@core/infrastructure/agents/components/vectorstores/entities/conversation.entity';

// DTOs for request validation
interface CreateConversationDto {
  userId: string;
  agentId: string;
  initialMessage?: string;
}

interface AddMessageDto {
  sender: 'human' | 'ai' | 'system' | 'internal';
  text: string;
  thought?: string;
  action?: string;
  observation?: string;
  finalAnswer?: string;
}

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'ConversationsController initialized',
      ConversationsController.name,
    );
  }

  /**
   * Create a new conversation
   * POST /api/conversations
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateConversationDto) {
    this.logger.info(
      `Creating conversation for user: ${createDto.userId}`,
      ConversationsController.name,
    );
    try {
      const conversation = await this.conversationsService.create(
        createDto.userId as UserIdType,
        createDto.agentId as GraphAgentIdType | ReActAgentIdType,
        createDto.initialMessage,
      );
      return {
        success: true,
        conversation,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create conversation`,
        e.stack,
        ConversationsController.name,
      );
      return {
        success: false,
        error: e.message,
        conversation: null,
      };
    }
  }

  /**
   * Add a message to an existing conversation
   * PATCH /api/conversations/:id/messages
   */
  @Patch(':id/messages')
  @HttpCode(HttpStatus.OK)
  async addMessage(@Param('id') id: string, @Body() messageDto: AddMessageDto) {
    this.logger.info(
      `Adding message to conversation: ${id}`,
      ConversationsController.name,
    );
    try {
      const conversation = await this.conversationsService.addMessage(
        id as ConversationIdType,
        messageDto,
      );
      if (!conversation) {
        return {
          success: false,
          error: `Conversation ${id} not found`,
          conversation: null,
        };
      }
      return {
        success: true,
        conversation,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to add message to conversation ${id}`,
        e.stack,
        ConversationsController.name,
      );
      return {
        success: false,
        error: e.message,
        conversation: null,
      };
    }
  }

  /**
   * Get all conversations for a user
   * GET /api/conversations?userId=user-placeholder
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findByUserId(@Query('userId') userId: string) {
    this.logger.info(
      `Fetching conversations for user: ${userId}`,
      ConversationsController.name,
    );
    try {
      const conversations = await this.conversationsService.findByUserId(
        userId as UserIdType,
      );
      return {
        success: true,
        conversations,
        count: conversations.length,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to fetch conversations for user ${userId}`,
        e.stack,
        ConversationsController.name,
      );
      return {
        success: false,
        error: e.message,
        conversations: [],
        count: 0,
      };
    }
  }

  /**
   * Get a specific conversation by ID
   * GET /api/conversations/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string) {
    this.logger.info(
      `Fetching conversation: ${id}`,
      ConversationsController.name,
    );
    try {
      const conversation = await this.conversationsService.findById(id as ConversationIdType);
      if (!conversation) {
        return {
          success: false,
          error: `Conversation ${id} not found`,
          conversation: null,
        };
      }
      return {
        success: true,
        conversation,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to fetch conversation ${id}`,
        e.stack,
        ConversationsController.name,
      );
      return {
        success: false,
        error: e.message,
        conversation: null,
      };
    }
  }
}
