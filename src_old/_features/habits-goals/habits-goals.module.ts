import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Habit, HabitSchema } from './entities/habit.entity';
import { Goal, GoalSchema } from './entities/goal.entity';
import { HabitsService } from './services/habits.service';
import { GoalsService } from './services/goals.service';
import { SchedulingService } from './services/scheduling.service';
import { TimeManagementService } from './services/time-management.service';
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
import { TaskProviderService } from './services/task-provider.service';
import { TimeSlotService } from './services/time-slot.service';
import { TaskSchedulerService } from './services/task-scheduler.service';
import { TaskSplittingService } from './services/task-splitting.service';
import { TaskCompletionService } from './services/task-completion.service';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Habit.name, schema: HabitSchema },
      { name: Goal.name, schema: GoalSchema },
    ]),
    CoreServicesModule,
  ],
  controllers: [
    HabitsController,
    HabitsApiController,
    GoalsController,
    GoalsApiController,
    SchedulingController,
    TimeManagementController,
  ],
  providers: [
    HabitsService,
    GoalsService,
    SchedulingService,
    TimeManagementService,
    TaskProviderService,
    TimeSlotService,
    TaskSchedulerService,
    TaskSplittingService,
    TaskCompletionService,
  ],
  exports: [
    HabitsService,
    GoalsService,
    SchedulingService,
    TimeManagementService,
    TaskProviderService,
    TimeSlotService,
    TaskSchedulerService,
    TaskSplittingService,
    TaskCompletionService,
  ],
})
export class HabitsGoalsModule {}
