import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CollectiveArtifact,
  CollectiveArtifactDocument,
} from '../entities/collective-artifact.entity';

@Injectable()
export class CollectiveArtifactsRepository {
  constructor(
    @InjectModel(CollectiveArtifact.name)
    private artifactModel: Model<CollectiveArtifactDocument>,
  ) {}

  async create(
    artifactData: Partial<CollectiveArtifact>,
  ): Promise<CollectiveArtifactDocument> {
    const artifact = new this.artifactModel(artifactData);
    return artifact.save();
  }

  async findById(id: string | Types.ObjectId): Promise<CollectiveArtifactDocument | null> {
    return this.artifactModel.findById(id).exec();
  }

  async findByCollectiveId(
    collectiveId: string | Types.ObjectId,
  ): Promise<CollectiveArtifactDocument[]> {
    return this.artifactModel.find({ collectiveId }).sort({ createdAt: -1 }).exec();
  }

  async findByTaskId(
    taskId: string | Types.ObjectId,
  ): Promise<CollectiveArtifactDocument[]> {
    return this.artifactModel.find({ taskId }).sort({ version: -1 }).exec();
  }

  async findByType(
    collectiveId: string | Types.ObjectId,
    type: string,
  ): Promise<CollectiveArtifactDocument[]> {
    return this.artifactModel.find({ collectiveId, type }).exec();
  }

  async search(
    collectiveId: string | Types.ObjectId,
    query: string,
    filters?: {
      type?: string[];
      tags?: string[];
    },
  ): Promise<CollectiveArtifactDocument[]> {
    const searchFilter: any = {
      collectiveId,
      $text: { $search: query },
    };

    if (filters?.type && filters.type.length > 0) {
      searchFilter.type = { $in: filters.type };
    }

    if (filters?.tags && filters.tags.length > 0) {
      searchFilter.tags = { $in: filters.tags };
    }

    return this.artifactModel.find(searchFilter).exec();
  }

  async lock(
    id: string | Types.ObjectId,
    agentId: string,
  ): Promise<CollectiveArtifactDocument | null> {
    // Atomic operation - only lock if not already locked
    return this.artifactModel
      .findOneAndUpdate(
        {
          _id: id,
          $or: [{ lockedBy: null }, { lockedBy: agentId }],
        },
        {
          lockedBy: agentId,
          lockedAt: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async unlock(
    id: string | Types.ObjectId,
    agentId: string,
  ): Promise<CollectiveArtifactDocument | null> {
    return this.artifactModel
      .findOneAndUpdate(
        {
          _id: id,
          lockedBy: agentId,
        },
        {
          lockedBy: null,
          lockedAt: null,
        },
        { new: true },
      )
      .exec();
  }

  async findLockedByAgent(agentId: string): Promise<CollectiveArtifactDocument[]> {
    return this.artifactModel.find({ lockedBy: agentId }).exec();
  }

  async updateArtifact(
    id: string | Types.ObjectId,
    updates: Partial<CollectiveArtifact>,
  ): Promise<CollectiveArtifactDocument | null> {
    return this.artifactModel.findByIdAndUpdate(id, updates, { new: true }).exec();
  }

  async createVersion(
    originalId: string | Types.ObjectId,
    agentId: string,
    newContent: string,
  ): Promise<CollectiveArtifactDocument> {
    const original = await this.findById(originalId);
    if (!original) {
      throw new Error('Original artifact not found');
    }

    const newVersion = await this.create({
      collectiveId: original.collectiveId,
      taskId: original.taskId,
      name: original.name,
      type: original.type,
      description: original.description,
      content: newContent,
      version: original.version + 1,
      previousVersionId: original._id as Types.ObjectId,
      createdBy: agentId,
      tags: original.tags,
      searchableContent: newContent,
    });

    return newVersion;
  }

  async getVersionHistory(
    artifactId: string | Types.ObjectId,
  ): Promise<CollectiveArtifactDocument[]> {
    const versions: CollectiveArtifactDocument[] = [];
    let currentArtifact = await this.findById(artifactId);

    while (currentArtifact) {
      versions.push(currentArtifact);
      if (!currentArtifact.previousVersionId) {
        break;
      }
      currentArtifact = await this.findById(currentArtifact.previousVersionId);
    }

    return versions;
  }

  async deleteByCollectiveId(collectiveId: string | Types.ObjectId): Promise<number> {
    const result = await this.artifactModel.deleteMany({ collectiveId }).exec();
    return result.deletedCount;
  }
}
