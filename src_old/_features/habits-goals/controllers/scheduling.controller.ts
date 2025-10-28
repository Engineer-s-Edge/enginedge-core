import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { SchedulingService } from '../services/scheduling.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

interface ScheduleRequestDto {
  busySlots: Array<{ start: string; end: string }>;
  workingHours?: { start: string; end: string };
}

@Controller('scheduling')
@UseGuards(JwtAuthGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('unmet-items')
  async getUnmetItems(@Request() req: any) {
    return this.schedulingService.getUnmetItemsForScheduling(req.user.userId);
  }

  @Post('preview')
  async previewSchedule(
    @Request() req: any,
    @Body() scheduleRequest: ScheduleRequestDto,
  ) {
    const busySlots = scheduleRequest.busySlots.map((slot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }));

    return this.schedulingService.previewSchedule(
      req.user.userId,
      busySlots,
      scheduleRequest.workingHours,
    );
  }

  @Post('schedule-today')
  async scheduleForToday(
    @Request() req: any,
    @Body() scheduleRequest: ScheduleRequestDto,
  ) {
    const busySlots = scheduleRequest.busySlots.map((slot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }));

    return this.schedulingService.scheduleItemsForToday(
      req.user.userId,
      busySlots,
      scheduleRequest.workingHours,
    );
  }
}
