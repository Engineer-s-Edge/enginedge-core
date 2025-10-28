import { Module } from '@nestjs/common';
import { HabitsGoalsInfrastructureModule } from '../../core/infrastructure/habits-goals/habits-goals-infrastructure.module';
import {
  HabitsController,
  HabitsApiController,
} from './controllers/habits.controller';
import {
  GoalsController,
  GoalsApiController,
} from './controllers/goals.controller';
import { SchedulingController } from './controllers/scheduling.controller';
import { TimeManagementController } from './controllers/time-management.controller';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [HabitsGoalsInfrastructureModule, CoreServicesModule],
  controllers: [
    HabitsController,
    HabitsApiController,
    GoalsController,
    GoalsApiController,
    SchedulingController,
    TimeManagementController,
  ],
})
export class HabitsGoalsApiModule {}
