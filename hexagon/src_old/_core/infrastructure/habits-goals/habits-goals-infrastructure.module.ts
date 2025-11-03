import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Habit, HabitSchema } from './entities/habit.entity';
import { Goal, GoalSchema } from './entities/goal.entity';
import { HabitsService } from './services/habits.service';
import { GoalsService } from './services/goals.service';
import { SchedulingService } from './services/scheduling.service';
import { TimeManagementService } from './services/time-management.service';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Habit.name, schema: HabitSchema },
      { name: Goal.name, schema: GoalSchema },
    ]),
    CoreServicesModule,
  ],
  providers: [
    HabitsService,
    GoalsService,
    SchedulingService,
    TimeManagementService,
  ],
  exports: [
    HabitsService,
    GoalsService,
    SchedulingService,
    TimeManagementService,
  ],
})
export class HabitsGoalsInfrastructureModule {}
