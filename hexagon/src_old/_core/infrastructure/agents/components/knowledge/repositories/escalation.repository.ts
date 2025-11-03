/**
 * Escalation Repository
 * 
 * MongoDB operations for escalations.
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  EscalationIdType,
  UserIdType,
  TopicIdType,
  GeniusAgentIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { EscalationId } from '@core/infrastructure/database/utils/custom_types';
import { EscalationEntity } from '../entities/escalation.entity';
import {
  Escalation,
  EscalationStatus,
  EscalationType,
  EscalationPriority,
  CreateEscalationDto,
  UpdateEscalationStatusDto,
  EscalationQueryFilters,
  EscalationStatistics,
} from '../types/escalation.types';

@Injectable()
export class EscalationRepository {
  constructor(
    @InjectModel(EscalationEntity.name)
    private escalationModel: Model<EscalationEntity>,
    private logger: MyLogger,
  ) {}

  /**
   * Create new escalation
   */
  async create(dto: CreateEscalationDto): Promise<Escalation> {
    const escalationId = EscalationId.create(new Types.ObjectId());
    const now = new Date();

    const entity = new this.escalationModel({
      escalationId,
      status: EscalationStatus.DETECTED,
      type: dto.type,
      priority: dto.priority,
      userId: dto.userId,
      title: dto.title,
      description: dto.description,
      context: dto.context,
      statusHistory: [
        {
          status: EscalationStatus.DETECTED,
          timestamp: now,
          note: 'Escalation created',
        },
      ],
      createdAt: now,
      expiresAt: dto.expiresAt,
      externalNotificationSent: false,
    });

    const saved = await entity.save();
    return this.toDto(saved);
  }

  /**
   * Find by ID
   */
  async findById(escalationId: EscalationIdType): Promise<Escalation | null> {
    const entity = await this.escalationModel.findOne({ escalationId }).exec();
    return entity ? this.toDto(entity) : null;
  }

  /**
   * Find many with filters
   */
  async findMany(filters: EscalationQueryFilters, limit = 100): Promise<Escalation[]> {
    const query: any = {};

    if (filters.userId) {
      query.userId = filters.userId;
    }

    if (filters.status) {
      query.status = Array.isArray(filters.status)
        ? { $in: filters.status }
        : filters.status;
    }

    if (filters.type) {
      query.type = Array.isArray(filters.type) ? { $in: filters.type } : filters.type;
    }

    if (filters.priority) {
      query.priority = Array.isArray(filters.priority)
        ? { $in: filters.priority }
        : filters.priority;
    }

    if (filters.topicId) {
      query['context.topicId'] = filters.topicId;
    }

    if (filters.geniusAgentId) {
      query['context.geniusAgentId'] = filters.geniusAgentId;
    }

    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {};
      if (filters.createdAfter) {
        query.createdAt.$gte = filters.createdAfter;
      }
      if (filters.createdBefore) {
        query.createdAt.$lte = filters.createdBefore;
      }
    }

    if (!filters.includeExpired) {
      query.$or = [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }];
    }

    const entities = await this.escalationModel
      .find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit)
      .exec();

    return entities.map((e) => this.toDto(e));
  }

  /**
   * Update status
   */
  async updateStatus(
    escalationId: EscalationIdType,
    dto: UpdateEscalationStatusDto,
  ): Promise<Escalation | null> {
    const entity = await this.escalationModel.findOne({ escalationId }).exec();
    if (!entity) return null;

    entity.status = dto.status;
    entity.statusHistory.push({
      status: dto.status,
      timestamp: new Date(),
      note: dto.note,
    });

    // Update timestamps based on status
    if (dto.status === EscalationStatus.NOTIFIED && !entity.notifiedAt) {
      entity.notifiedAt = new Date();
    }

    if (dto.status === EscalationStatus.RESOLVED && !entity.resolvedAt) {
      entity.resolvedAt = new Date();
    }

    const saved = await entity.save();
    return this.toDto(saved);
  }

  /**
   * Add user response
   */
  async addUserResponse(
    escalationId: EscalationIdType,
    userResponse: any,
  ): Promise<Escalation | null> {
    const entity = await this.escalationModel.findOne({ escalationId }).exec();
    if (!entity) return null;

    entity.userResponse = userResponse;
    entity.status = EscalationStatus.RESOLVED;
    entity.resolvedAt = new Date();
    entity.statusHistory.push({
      status: EscalationStatus.RESOLVED,
      timestamp: new Date(),
      note: 'User provided response',
    });

    const saved = await entity.save();
    return this.toDto(saved);
  }

  /**
   * Mark as notified
   */
  async markNotified(
    escalationId: EscalationIdType,
    externalNotificationSent = false,
  ): Promise<void> {
    await this.escalationModel
      .updateOne(
        { escalationId },
        {
          $set: {
            notifiedAt: new Date(),
            externalNotificationSent,
          },
        },
      )
      .exec();
  }

  /**
   * Get active escalations for user
   */
  async getActiveForUser(userId: UserIdType, limit = 50): Promise<Escalation[]> {
    const entities = await this.escalationModel
      .find({
        userId,
        status: {
          $in: [
            EscalationStatus.DETECTED,
            EscalationStatus.NOTIFIED,
            EscalationStatus.IN_DISCUSSION,
          ],
        },
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
      })
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit)
      .exec();

    return entities.map((e) => this.toDto(e));
  }

  /**
   * Get statistics
   */
  async getStatistics(userId?: UserIdType): Promise<EscalationStatistics> {
    const matchStage: any = {};
    if (userId) {
      matchStage.userId = userId;
    }

    const pipeline: any[] = [
      { $match: matchStage },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
          resolutionTimes: [
            {
              $match: {
                resolvedAt: { $exists: true },
                createdAt: { $exists: true },
              },
            },
            {
              $project: {
                resolutionTime: {
                  $subtract: ['$resolvedAt', '$createdAt'],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgTime: { $avg: '$resolutionTime' },
              },
            },
          ],
          active: [
            {
              $match: {
                status: {
                  $in: [
                    EscalationStatus.DETECTED,
                    EscalationStatus.NOTIFIED,
                    EscalationStatus.IN_DISCUSSION,
                  ],
                },
              },
            },
            { $count: 'count' },
          ],
          expired: [
            {
              $match: {
                expiresAt: { $exists: true, $lt: new Date() },
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ];

    const results = await this.escalationModel.aggregate(pipeline).exec();
    const data = results[0];

    const total = data.total[0]?.count || 0;
    const resolved = data.byStatus.find((s: any) => s._id === EscalationStatus.RESOLVED)
      ?.count || 0;

    return {
      total,
      byStatus: this.arrayToRecord(data.byStatus, Object.values(EscalationStatus)),
      byType: this.arrayToRecord(data.byType, Object.values(EscalationType)),
      byPriority: this.arrayToRecord(data.byPriority, Object.values(EscalationPriority)),
      averageResolutionTime: data.resolutionTimes[0]?.avgTime || 0,
      activeEscalations: data.active[0]?.count || 0,
      expiredEscalations: data.expired[0]?.count || 0,
      resolutionRate: total > 0 ? (resolved / total) * 100 : 0,
    };
  }

  /**
   * Delete old resolved escalations (cleanup)
   */
  async deleteOldResolved(daysOld = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.escalationModel
      .deleteMany({
        status: EscalationStatus.RESOLVED,
        resolvedAt: { $lt: cutoffDate },
      })
      .exec();

    return result.deletedCount || 0;
  }

  // ========================================
  // Helper Methods
  // ========================================

  private toDto(entity: EscalationEntity): Escalation {
    return {
      escalationId: entity.escalationId,
      status: entity.status,
      type: entity.type,
      priority: entity.priority,
      userId: entity.userId,
      title: entity.title,
      description: entity.description,
      context: entity.context,
      userResponse: entity.userResponse,
      statusHistory: entity.statusHistory,
      createdAt: entity.createdAt,
      notifiedAt: entity.notifiedAt,
      resolvedAt: entity.resolvedAt,
      expiresAt: entity.expiresAt,
      externalNotificationSent: entity.externalNotificationSent,
    };
  }

  private arrayToRecord(arr: any[], keys: string[]): Record<string, number> {
    const record: Record<string, number> = {};
    keys.forEach((key) => {
      const item = arr.find((a: any) => a._id === key);
      record[key] = item?.count || 0;
    });
    return record;
  }
}
