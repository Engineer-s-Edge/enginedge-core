import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import KnowledgeNodeModel, {
  KnowledgeNode,
  ICSLayer,
  ResearchStatus,
} from '../entities/knowledge-node.entity';
import {
  KnowledgeNodeId,
  KnowledgeNodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { Types } from 'mongoose';

@Injectable()
export class KnowledgeNodeRepository {
  constructor(
    @InjectModel('knowledge_nodes')
    private readonly knowledgeNodeModel: typeof KnowledgeNodeModel,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'KnowledgeNodeRepository initializing',
      KnowledgeNodeRepository.name,
    );
  }

  /**
   * Create a new knowledge node
   */
  async create(nodeData: Partial<KnowledgeNode>): Promise<KnowledgeNode> {
    try {
      const _id = KnowledgeNodeId.create(new Types.ObjectId()) as any;
      const node = new this.knowledgeNodeModel({
        _id,
        ...nodeData,
      });
      const result = await node.save();
      this.logger.info(
        `Created knowledge node: ${result._id} (${result.label})`,
        KnowledgeNodeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating knowledge node: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find node by ID
   */
  async findById(id: KnowledgeNodeIdType): Promise<KnowledgeNode | null> {
    try {
      const result = await this.knowledgeNodeModel.findById(id).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding node by ID ${id}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find all nodes
   */
  async findAll(): Promise<KnowledgeNode[]> {
    try {
      const result = await this.knowledgeNodeModel.find().exec();
      this.logger.info(
        `Found ${result.length} knowledge nodes`,
        KnowledgeNodeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding all nodes: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find nodes by type
   */
  async findByType(type: string): Promise<KnowledgeNode[]> {
    try {
      const result = await this.knowledgeNodeModel.find({ type }).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding nodes by type ${type}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find nodes by layer
   */
  async findByLayer(layer: ICSLayer): Promise<KnowledgeNode[]> {
    try {
      const result = await this.knowledgeNodeModel.find({ layer }).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding nodes by layer ${layer}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find nodes by research status
   */
  async findByResearchStatus(
    status: ResearchStatus,
  ): Promise<KnowledgeNode[]> {
    try {
      const result = await this.knowledgeNodeModel
        .find({ researchStatus: status })
        .exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding nodes by research status ${status}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find unresearched nodes at a specific layer
   */
  async findUnresearchedByLayer(layer?: ICSLayer): Promise<KnowledgeNode[]> {
    try {
      const query: any = {
        researchStatus: {
          $in: [ResearchStatus.UNRESEARCHED, ResearchStatus.NEEDS_UPDATE],
        },
      };
      if (layer !== undefined) {
        query.layer = layer;
      }
      const result = await this.knowledgeNodeModel.find(query).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding unresearched nodes: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Search nodes by label (text search)
   */
  async searchByLabel(searchTerm: string): Promise<KnowledgeNode[]> {
    try {
      const result = await this.knowledgeNodeModel
        .find({ $text: { $search: searchTerm } })
        .exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error searching nodes by label: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Update a node
   */
  async update(
    id: KnowledgeNodeIdType,
    updates: Partial<KnowledgeNode>,
  ): Promise<KnowledgeNode | null> {
    try {
      const result = await this.knowledgeNodeModel
        .findByIdAndUpdate(id, updates, { new: true })
        .exec();
      if (result) {
        this.logger.info(
          `Updated knowledge node: ${id}`,
          KnowledgeNodeRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating node ${id}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a node
   */
  async delete(id: KnowledgeNodeIdType): Promise<boolean> {
    try {
      const result = await this.knowledgeNodeModel.findByIdAndDelete(id).exec();
      if (result) {
        this.logger.info(
          `Deleted knowledge node: ${id}`,
          KnowledgeNodeRepository.name,
        );
        return true;
      }
      return false;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting node ${id}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Lock a node for exclusive access
   */
  async lockNode(
    id: KnowledgeNodeIdType,
    actorId: string,
    reason: string,
  ): Promise<KnowledgeNode | null> {
    try {
      // First check if node is already locked by someone else
      const node = await this.findById(id);
      if (!node) return null;

      if (node.lock && node.lock.lockedBy !== actorId) {
        this.logger.warn(
          `Node ${id} already locked by ${node.lock.lockedBy}`,
          KnowledgeNodeRepository.name,
        );
        return null;
      }

      const result = await this.update(id, {
        lock: {
          lockedBy: actorId,
          lockedAt: new Date(),
          reason,
        },
      } as any);

      this.logger.info(
        `Node ${id} locked by ${actorId}`,
        KnowledgeNodeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error locking node ${id}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Unlock a node
   */
  async unlockNode(
    id: KnowledgeNodeIdType,
    actorId: string,
  ): Promise<KnowledgeNode | null> {
    try {
      const node = await this.findById(id);
      if (!node) return null;

      if (node.lock && node.lock.lockedBy !== actorId) {
        this.logger.warn(
          `Node ${id} cannot be unlocked by ${actorId}, locked by ${node.lock.lockedBy}`,
          KnowledgeNodeRepository.name,
        );
        return null;
      }

      const result = await this.update(id, { lock: undefined } as any);
      this.logger.info(
        `Node ${id} unlocked by ${actorId}`,
        KnowledgeNodeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error unlocking node ${id}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Mark a node as dubious
   */
  async markAsDubious(
    id: KnowledgeNodeIdType,
    actorId: string,
  ): Promise<KnowledgeNode | null> {
    try {
      const node = await this.findById(id);
      if (!node) return null;

      const dubiousReports = node.dubiousReports || [];
      dubiousReports.push({
        reportedBy: actorId,
        reportedAt: new Date(),
      });

      const result = await this.update(id, {
        researchStatus: ResearchStatus.DUBIOUS,
        confidence: Math.max(0, (node.confidence || 0.5) - 0.3),
        dubiousReports,
      } as any);

      this.logger.warn(
        `Node ${id} marked as dubious by ${actorId}`,
        KnowledgeNodeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error marking node ${id} as dubious: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Validate a node (increase confidence)
   */
  async validateNode(
    id: KnowledgeNodeIdType,
    actorId: string,
  ): Promise<KnowledgeNode | null> {
    try {
      const node = await this.findById(id);
      if (!node) return null;

      const validatedBy = node.validatedBy || [];
      if (!validatedBy.includes(actorId)) {
        validatedBy.push(actorId);
      }

      const result = await this.update(id, {
        validationCount: (node.validationCount || 0) + 1,
        confidence: Math.min(1.0, (node.confidence || 0.5) + 0.1),
        validatedBy,
      } as any);

      this.logger.info(
        `Node ${id} validated by ${actorId}`,
        KnowledgeNodeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error validating node ${id}: ${info.message}`,
        KnowledgeNodeRepository.name,
        info.stack,
      );
      throw error;
    }
  }
}
