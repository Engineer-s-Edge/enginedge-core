import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Schema } from 'mongoose';
import { MongoDbRequestRepository } from '../repositories/mongodb-request.repository';
import { MongoDbWorkflowRepository } from '../repositories/mongodb-workflow.repository';
import { IRequestRepository } from '@application/ports/request-repository.port';
import { IWorkflowRepository } from '@application/ports/workflow-repository.port';

const RequestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    workflow: { type: String, required: true },
    status: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    workers: { type: [Schema.Types.Mixed], default: [] },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    completedAt: { type: Date },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    correlationId: { type: String },
    idempotencyKey: { type: String },
  },
  { collection: 'orchestration_requests' }
);

const WorkflowSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    steps: { type: [Schema.Types.Mixed], required: true },
    currentStep: { type: Number, default: 0 },
    state: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'workflows' }
);

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/enginedge-hexagon';
        return {
          uri,
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: 'OrchestrationRequest', schema: RequestSchema },
      { name: 'Workflow', schema: WorkflowSchema },
    ]),
  ],
  providers: [
    {
      provide: 'IRequestRepository',
      useClass: MongoDbRequestRepository,
    },
    {
      provide: 'IWorkflowRepository',
      useClass: MongoDbWorkflowRepository,
    },
    MongoDbRequestRepository,
    MongoDbWorkflowRepository,
  ],
  exports: ['IRequestRepository', 'IWorkflowRepository', MongooseModule],
})
export class DatabaseModule {}
