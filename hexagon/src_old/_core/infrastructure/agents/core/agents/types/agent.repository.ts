import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document } from 'mongoose';
import { ReActAgentDocument, GraphAgentDocument } from './agent.entity';
import {
  GraphAgentIdType,
  ReActAgentIdType,
} from '@core/infrastructure/database/utils/custom_types';

export interface BaseAgentDocument extends Document {
  _id: string;
  agentType: 'ReactAgent' | 'GraphAgent';
}

@Injectable()
export class AgentsRepository {
  constructor(
    @InjectModel('Agents')
    private readonly agentModel: Model<BaseAgentDocument>,
    @InjectModel('ReactAgent')
    private readonly reactAgentModel: Model<ReActAgentDocument>,
    @InjectModel('GraphAgent')
    private readonly graphAgentModel: Model<GraphAgentDocument>,
  ) {}

  // ReactAgent methods
  createReactAgent(
    data: Partial<ReActAgentDocument>,
  ): Promise<ReActAgentDocument> {
    return this.reactAgentModel.create(data);
  }

  findReactAgentById(id: ReActAgentIdType): Promise<ReActAgentDocument | null> {
    return this.reactAgentModel.findById(id).exec();
  }

  updateReactAgent(
    id: ReActAgentIdType,
    update: Partial<ReActAgentDocument>,
  ): Promise<ReActAgentDocument | null> {
    return this.reactAgentModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
  }

  deleteReactAgent(id: ReActAgentIdType): Promise<ReActAgentDocument | null> {
    return this.reactAgentModel.findByIdAndDelete(id).exec();
  }

  listReactAgents(): Promise<ReActAgentDocument[]> {
    return this.reactAgentModel.find().exec();
  }

  // GraphAgent methods
  createGraphAgent(
    data: Partial<GraphAgentDocument>,
  ): Promise<GraphAgentDocument> {
    return this.graphAgentModel.create(data);
  }

  findGraphAgentById(id: GraphAgentIdType): Promise<GraphAgentDocument | null> {
    return this.graphAgentModel.findById(id).exec();
  }

  updateGraphAgent(
    id: GraphAgentIdType,
    update: Partial<GraphAgentDocument>,
  ): Promise<GraphAgentDocument | null> {
    return this.graphAgentModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
  }

  deleteGraphAgent(id: GraphAgentIdType): Promise<GraphAgentDocument | null> {
    return this.graphAgentModel.findByIdAndDelete(id).exec();
  }

  listGraphAgents(): Promise<GraphAgentDocument[]> {
    return this.graphAgentModel.find().exec();
  }

  // BaseAgent methods
  createBaseAgent(
    data: Partial<BaseAgentDocument>,
  ): Promise<BaseAgentDocument> {
    return this.agentModel.create(data);
  }

  findBaseAgentById(id: string): Promise<BaseAgentDocument | null> {
    return this.agentModel.findById(id).exec();
  }

  updateBaseAgent(
    id: string,
    update: Partial<BaseAgentDocument>,
  ): Promise<BaseAgentDocument | null> {
    return this.agentModel.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  deleteBaseAgent(id: string): Promise<BaseAgentDocument | null> {
    return this.agentModel.findByIdAndDelete(id).exec();
  }

  findBaseAgentByType(
    type: 'ReactAgent' | 'GraphAgent',
  ): Promise<BaseAgentDocument[]> {
    return this.agentModel.find({ agentType: type }).exec();
  }

  // Common methods
  listAllAgents(): Promise<BaseAgentDocument[]> {
    return this.agentModel.find().exec();
  }
}
