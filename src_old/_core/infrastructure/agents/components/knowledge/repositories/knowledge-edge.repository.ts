import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import KnowledgeEdgeModel, {
  KnowledgeEdge,
  EdgeType,
} from '../entities/knowledge-edge.entity';
import {
  KnowledgeEdgeId,
  KnowledgeEdgeIdType,
  KnowledgeNodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { Types } from 'mongoose';

@Injectable()
export class KnowledgeEdgeRepository {
  constructor(
    @InjectModel('knowledge_edges')
    private readonly knowledgeEdgeModel: typeof KnowledgeEdgeModel,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'KnowledgeEdgeRepository initializing',
      KnowledgeEdgeRepository.name,
    );
  }

  /**
   * Create a new knowledge edge
   */
  async create(edgeData: Partial<KnowledgeEdge>): Promise<KnowledgeEdge> {
    try {
      const _id = KnowledgeEdgeId.create(new Types.ObjectId()) as any;
      const edge = new this.knowledgeEdgeModel({
        _id,
        ...edgeData,
      });
      const result = await edge.save();
      this.logger.info(
        `Created knowledge edge: ${result._id} (${result.sourceId} -> ${result.targetId}, type: ${result.type})`,
        KnowledgeEdgeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating knowledge edge: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find edge by ID
   */
  async findById(id: KnowledgeEdgeIdType): Promise<KnowledgeEdge | null> {
    try {
      const result = await this.knowledgeEdgeModel.findById(id).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding edge by ID ${id}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find all edges
   */
  async findAll(): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel.find().exec();
      this.logger.info(
        `Found ${result.length} knowledge edges`,
        KnowledgeEdgeRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding all edges: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find edges by source node ID
   */
  async findBySource(
    sourceId: KnowledgeNodeIdType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel.find({ sourceId }).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding edges by source ${sourceId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find edges by target node ID
   */
  async findByTarget(
    targetId: KnowledgeNodeIdType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel.find({ targetId }).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding edges by target ${targetId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find edges by type
   */
  async findByType(type: EdgeType): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel.find({ type }).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding edges by type ${type}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find edges by source and type
   */
  async findBySourceAndType(
    sourceId: KnowledgeNodeIdType,
    type: EdgeType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel
        .find({ sourceId, type })
        .exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding edges by source ${sourceId} and type ${type}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find edges by target and type
   */
  async findByTargetAndType(
    targetId: KnowledgeNodeIdType,
    type: EdgeType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel
        .find({ targetId, type })
        .exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding edges by target ${targetId} and type ${type}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find edge connecting two specific nodes
   */
  async findEdgeBetween(
    sourceId: KnowledgeNodeIdType,
    targetId: KnowledgeNodeIdType,
    type?: EdgeType,
  ): Promise<KnowledgeEdge | null> {
    try {
      const query: any = { sourceId, targetId };
      if (type !== undefined) {
        query.type = type;
      }
      const result = await this.knowledgeEdgeModel.findOne(query).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding edge between ${sourceId} and ${targetId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find all edges connected to a node (in either direction)
   */
  async findConnectedEdges(
    nodeId: KnowledgeNodeIdType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel
        .find({
          $or: [{ sourceId: nodeId }, { targetId: nodeId }],
        })
        .exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding connected edges for node ${nodeId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find outgoing edges (where node is source)
   */
  async findOutgoingEdges(
    nodeId: KnowledgeNodeIdType,
    type?: EdgeType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const query: any = { sourceId: nodeId };
      if (type !== undefined) {
        query.type = type;
      }
      const result = await this.knowledgeEdgeModel.find(query).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding outgoing edges for node ${nodeId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find incoming edges (where node is target)
   */
  async findIncomingEdges(
    nodeId: KnowledgeNodeIdType,
    type?: EdgeType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const query: any = { targetId: nodeId };
      if (type !== undefined) {
        query.type = type;
      }
      const result = await this.knowledgeEdgeModel.find(query).exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding incoming edges for node ${nodeId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Update an edge
   */
  async update(
    id: KnowledgeEdgeIdType,
    updates: Partial<KnowledgeEdge>,
  ): Promise<KnowledgeEdge | null> {
    try {
      const result = await this.knowledgeEdgeModel
        .findByIdAndUpdate(id, updates, { new: true })
        .exec();
      if (result) {
        this.logger.info(
          `Updated knowledge edge: ${id}`,
          KnowledgeEdgeRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating edge ${id}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Delete an edge
   */
  async delete(id: KnowledgeEdgeIdType): Promise<boolean> {
    try {
      const result = await this.knowledgeEdgeModel.findByIdAndDelete(id).exec();
      if (result) {
        this.logger.info(
          `Deleted knowledge edge: ${id}`,
          KnowledgeEdgeRepository.name,
        );
        return true;
      }
      return false;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting edge ${id}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Delete all edges connected to a node
   */
  async deleteConnectedEdges(nodeId: KnowledgeNodeIdType): Promise<number> {
    try {
      const result = await this.knowledgeEdgeModel
        .deleteMany({
          $or: [{ sourceId: nodeId }, { targetId: nodeId }],
        })
        .exec();
      const count = result.deletedCount || 0;
      this.logger.info(
        `Deleted ${count} edges connected to node ${nodeId}`,
        KnowledgeEdgeRepository.name,
      );
      return count;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting connected edges for node ${nodeId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find prerequisite chain (edges of type PREREQUISITE_FOR)
   */
  async findPrerequisiteChain(
    nodeId: KnowledgeNodeIdType,
  ): Promise<KnowledgeEdge[]> {
    try {
      const result = await this.knowledgeEdgeModel
        .find({ targetId: nodeId, type: EdgeType.PREREQUISITE_FOR })
        .exec();
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding prerequisite chain for node ${nodeId}: ${info.message}`,
        KnowledgeEdgeRepository.name,
        info.stack,
      );
      throw error;
    }
  }
}
