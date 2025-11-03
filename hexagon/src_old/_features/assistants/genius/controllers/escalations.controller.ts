/**
 * Escalations Controller
 * 
 * REST API endpoints for managing user escalations.
 * 
 * Routes:
 * - GET    /escalations              - Query escalations with filters
 * - GET    /escalations/active       - Get active escalations for current user
 * - GET    /escalations/pending      - Get pending notifications
 * - GET    /escalations/statistics   - Get escalation statistics
 * - GET    /escalations/:escalationId - Get specific escalation
 * - POST   /escalations/:escalationId/notify - Notify user about escalation
 * - POST   /escalations/:escalationId/discuss - Start discussion
 * - POST   /escalations/:escalationId/resolve - Resolve with user response
 * - POST   /escalations/:escalationId/cancel - Cancel escalation
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EscalationsService } from '../services/escalations.service';
import {
  QueryEscalationsDto,
  ResolveEscalationDto,
  CancelEscalationDto,
} from '../dto/genius.dto';

@Controller('escalations')
export class EscalationsController {
  constructor(private escalationsService: EscalationsService) {}

  /**
   * Query escalations with filters
   */
  @Get()
  async queryEscalations(@Query() query: QueryEscalationsDto): Promise<any[]> {
    return this.escalationsService.query(query);
  }

  /**
   * Get active escalations for current user
   */
  @Get('active')
  async getActive(): Promise<any[]> {
    return this.escalationsService.getActive();
  }

  /**
   * Get pending notifications
   */
  @Get('pending')
  async getPending(): Promise<any[]> {
    return this.escalationsService.getPending();
  }

  /**
   * Get escalation statistics
   */
  @Get('statistics')
  async getStatistics(): Promise<any> {
    return this.escalationsService.getStatistics();
  }

  /**
   * Get specific escalation
   */
  @Get(':escalationId')
  async getEscalation(@Param('escalationId') escalationId: string): Promise<any> {
    return this.escalationsService.getById(escalationId);
  }

  /**
   * Notify user about escalation
   */
  @Post(':escalationId/notify')
  @HttpCode(HttpStatus.OK)
  async notifyUser(
    @Param('escalationId') escalationId: string,
  ): Promise<{ message: string }> {
    await this.escalationsService.notifyUser(escalationId);
    return { message: 'User notified' };
  }

  /**
   * Start discussion
   */
  @Post(':escalationId/discuss')
  @HttpCode(HttpStatus.OK)
  async startDiscussion(
    @Param('escalationId') escalationId: string,
  ): Promise<{ message: string }> {
    await this.escalationsService.startDiscussion(escalationId);
    return { message: 'Discussion started' };
  }

  /**
   * Resolve with user response
   */
  @Post(':escalationId/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('escalationId') escalationId: string,
    @Body() dto: ResolveEscalationDto,
  ): Promise<{ message: string }> {
    await this.escalationsService.resolve(escalationId, dto);
    return { message: 'Escalation resolved' };
  }

  /**
   * Cancel escalation
   */
  @Post(':escalationId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('escalationId') escalationId: string,
    @Body() dto: CancelEscalationDto,
  ): Promise<{ message: string }> {
    await this.escalationsService.cancel(escalationId, dto);
    return { message: 'Escalation cancelled' };
  }
}
