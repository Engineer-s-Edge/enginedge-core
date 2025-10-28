import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CalendarActivityModelService } from './calendar-activity-model.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000, // 5 second timeout
      maxRedirects: 5,
    }),
  ],
  providers: [CalendarActivityModelService],
  exports: [CalendarActivityModelService],
})
export class CalendarMlModule {}
