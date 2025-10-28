/**
 * Escalations Service
 * 
 * Service for managing escalations via API.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { EscalationService } from '@core/infrastructure/agents/components/knowledge/services/escalation.service';
import { QueryEscalationsDto, ResolveEscalationDto, CancelEscalationDto } from '../dto/genius.dto';

@Injectable()
export class EscalationsService {
  // TODO: Get from auth context
  private currentUserId = 'u_default_user' as any;

  constructor(
    private escalationService: EscalationService,
    private logger: MyLogger,
  ) {}

  async query(query: QueryEscalationsDto): Promise<any[]> {
    return this.escalationService.find(
      {
        userId: this.currentUserId,
        status: query.status,
        type: query.type,
        priority: query.priority,
        topicId: query.topicId as any,
        includeExpired: query.includeExpired,
      },
      query.limit || 100,
    );
  }

  async getActive(): Promise<any[]> {
    return this.escalationService.getActiveForUser(this.currentUserId, 50);
  }

  async getPending(): Promise<any[]> {
    return this.escalationService.getPendingNotifications(50);
  }

  async getStatistics(): Promise<any> {
    return this.escalationService.getStatistics(this.currentUserId);
  }

  async getById(escalationId: string): Promise<any> {
    const escalation = await this.escalationService.getById(escalationId as any);

    if (!escalation) {
      throw new NotFoundException(`Escalation ${escalationId} not found`);
    }

    return escalation;
  }

  async notifyUser(escalationId: string): Promise<void> {
    await this.escalationService.notifyUser(escalationId as any);
  }

  async startDiscussion(escalationId: string): Promise<void> {
    await this.escalationService.startDiscussion(escalationId as any);
  }

  async resolve(escalationId: string, dto: ResolveEscalationDto): Promise<void> {
    await this.escalationService.resolveWithResponse(escalationId as any, dto as any);
  }

  async cancel(escalationId: string, dto: CancelEscalationDto): Promise<void> {
    await this.escalationService.cancel(escalationId as any, dto.reason);
  }
}
