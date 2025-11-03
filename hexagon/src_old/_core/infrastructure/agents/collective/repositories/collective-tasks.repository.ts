import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CollectiveTask,
  CollectiveTaskDocument,
  TaskState,
  TaskLevel,
} from '../entities/collective-task.entity';

@Injectable()
export class CollectiveTasksRepository {
  constructor(
    @InjectModel(CollectiveTask.name)
    private taskModel: Model<CollectiveTaskDocument>,
  ) {}

  async create(taskData: Partial<CollectiveTask>): Promise<CollectiveTaskDocument> {
    const task = new this.taskModel(taskData);
    return task.save();
  }

  async findById(id: string | Types.ObjectId): Promise<CollectiveTaskDocument | null> {
    return this.taskModel.findById(id).exec();
  }

  async findByCollectiveId(
    collectiveId: string | Types.ObjectId,
  ): Promise<CollectiveTaskDocument[]> {
    return this.taskModel.find({ collectiveId }).sort({ createdAt: 1 }).exec();
  }

  async findByState(
    collectiveId: string | Types.ObjectId,
    state: TaskState,
  ): Promise<CollectiveTaskDocument[]> {
    return this.taskModel.find({ collectiveId, state }).exec();
  }

  async findAvailableTasks(
    collectiveId: string | Types.ObjectId,
    allowedAgentIds: string[],
  ): Promise<CollectiveTaskDocument[]> {
    // Find unassigned tasks where:
    // 1. State is unassigned
    // 2. Agent is in allowedAgentIds
    // 3. All dependencies are completed
    const unassignedTasks = await this.taskModel
      .find({
        collectiveId,
        state: TaskState.UNASSIGNED,
        allowedAgentIds: { $in: allowedAgentIds },
      })
      .exec();

    // Filter by dependencies
    const tasksWithMetDependencies: CollectiveTaskDocument[] = [];
    for (const task of unassignedTasks) {
      if (task.dependencies.length === 0) {
        tasksWithMetDependencies.push(task);
        continue;
      }

      // Check if all dependencies are completed
      const dependencyStates = await this.taskModel
        .find({ _id: { $in: task.dependencies } })
        .select('state')
        .exec();

      const allCompleted = dependencyStates.every(
        (dep) => dep.state === TaskState.COMPLETED,
      );

      if (allCompleted) {
        tasksWithMetDependencies.push(task);
      }
    }

    return tasksWithMetDependencies;
  }

  async findByLevel(
    collectiveId: string | Types.ObjectId,
    level: TaskLevel,
  ): Promise<CollectiveTaskDocument[]> {
    return this.taskModel.find({ collectiveId, level }).exec();
  }

  async findByParentId(
    parentTaskId: string | Types.ObjectId,
  ): Promise<CollectiveTaskDocument[]> {
    return this.taskModel.find({ parentTaskId }).exec();
  }

  async findByAssignedAgent(
    collectiveId: string | Types.ObjectId,
    agentId: string,
  ): Promise<CollectiveTaskDocument[]> {
    return this.taskModel.find({ collectiveId, assignedAgentId: agentId }).exec();
  }

  async findBlockedTasks(
    collectiveId: string | Types.ObjectId,
  ): Promise<CollectiveTaskDocument[]> {
    return this.taskModel
      .find({
        collectiveId,
        state: TaskState.BLOCKED,
        blockedBy: { $exists: true, $ne: [] },
      })
      .exec();
  }

  async updateState(
    id: string | Types.ObjectId,
    state: TaskState,
    additionalUpdates?: Partial<CollectiveTask>,
  ): Promise<CollectiveTaskDocument | null> {
    const updates: any = { state, ...additionalUpdates };

    if (state === TaskState.IN_PROGRESS && !additionalUpdates?.startedAt) {
      updates.startedAt = new Date();
    }

    if (state === TaskState.COMPLETED && !additionalUpdates?.completedAt) {
      updates.completedAt = new Date();
    }

    if (state === TaskState.FAILED && !additionalUpdates?.failedAt) {
      updates.failedAt = new Date();
    }

    return this.taskModel.findByIdAndUpdate(id, updates, { new: true }).exec();
  }

  async assignTask(
    id: string | Types.ObjectId,
    agentId: string,
  ): Promise<CollectiveTaskDocument | null> {
    // Atomic operation to prevent race conditions
    return this.taskModel
      .findOneAndUpdate(
        {
          _id: id,
          state: TaskState.UNASSIGNED, // Only assign if still unassigned
        },
        {
          state: TaskState.ASSIGNED,
          assignedAgentId: agentId,
        },
        { new: true },
      )
      .exec();
  }

  async addChildTask(
    parentId: string | Types.ObjectId,
    childId: string | Types.ObjectId,
  ): Promise<CollectiveTaskDocument | null> {
    return this.taskModel
      .findByIdAndUpdate(
        parentId,
        {
          $addToSet: { childTaskIds: childId },
        },
        { new: true },
      )
      .exec();
  }

  async addDependency(
    taskId: string | Types.ObjectId,
    dependencyId: string | Types.ObjectId,
  ): Promise<CollectiveTaskDocument | null> {
    return this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          $addToSet: { dependencies: dependencyId },
        },
        { new: true },
      )
      .exec();
  }

  async addBlocker(
    taskId: string | Types.ObjectId,
    blockerId: string | Types.ObjectId,
  ): Promise<CollectiveTaskDocument | null> {
    return this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          $addToSet: { blockedBy: blockerId },
        },
        { new: true },
      )
      .exec();
  }

  async removeBlocker(
    taskId: string | Types.ObjectId,
    blockerId: string | Types.ObjectId,
  ): Promise<CollectiveTaskDocument | null> {
    return this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          $pull: { blockedBy: blockerId },
        },
        { new: true },
      )
      .exec();
  }

  async delete(id: string | Types.ObjectId): Promise<boolean> {
    const result = await this.taskModel.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async deleteByCollectiveId(collectiveId: string | Types.ObjectId): Promise<number> {
    const result = await this.taskModel.deleteMany({ collectiveId }).exec();
    return result.deletedCount;
  }
}
