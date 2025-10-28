import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import googleCalendarConfig from '../../../config/google-calendar.config';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { HabitsGoalsInfrastructureModule } from '../../habits-goals/habits-goals-infrastructure.module';
import { GoogleAuthService } from './google-auth.service';
import { GoogleCalendarApiService } from './google-calendar-api.service';
import { DataSyncService } from './data-sync.service';
import { SchedulingOrchestratorService } from './scheduling-orchestrator.service';
import { HabitsGoalsModule } from '../../../../features/habits-goals/habits-goals.module';
import { CoreServicesModule } from '@core/services/core-services.module';
import { CalendarMlModule } from '../ml/calendar-ml.module';

@Module({
  imports: [
    ConfigModule.forFeature(googleCalendarConfig),
    HabitsGoalsInfrastructureModule,
    HabitsGoalsModule,
    CoreServicesModule,
    CalendarMlModule,
  ],
  providers: [
    GoogleCalendarService,
    GoogleAuthService,
    GoogleCalendarApiService,
    DataSyncService,
    SchedulingOrchestratorService,
  ],
  controllers: [GoogleCalendarController],
  exports: [
    GoogleCalendarService,
    GoogleAuthService,
    GoogleCalendarApiService,
    DataSyncService,
    SchedulingOrchestratorService,
    CalendarMlModule,
  ],
})
export class GoogleCalendarModule {}
