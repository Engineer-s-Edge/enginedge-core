import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { TimeManagementService } from '../services/time-management.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('time-management')
@UseGuards(JwtAuthGuard)
export class TimeManagementController {
  constructor(private readonly timeManagementService: TimeManagementService) {}

  @Get('daily-breakdown')
  async getDailyTimeBreakdown(@Request() req: any) {
    return this.timeManagementService.getDailyTimeBreakdown(req.user.userId);
  }

  @Get('all-commitments')
  async getAllTimeCommitments(@Request() req: any) {
    return this.timeManagementService.getAllTimeCommitments(req.user.userId);
  }

  @Get('commitments/range')
  async getTimeCommitmentsByRange(
    @Request() req: any,
    @Query('min') minMinutes?: string,
    @Query('max') maxMinutes?: string,
  ) {
    const min = minMinutes ? parseInt(minMinutes, 10) : undefined;
    const max = maxMinutes ? parseInt(maxMinutes, 10) : undefined;
    return this.timeManagementService.getTimeCommitmentsByRange(
      req.user.userId,
      min,
      max,
    );
  }

  @Get('validate-limit')
  async validateDailyTimeLimit(
    @Request() req: any,
    @Query('maxMinutes') maxMinutes: string,
  ) {
    const maxDailyMinutes = parseInt(maxMinutes, 10);
    return this.timeManagementService.validateDailyTimeLimit(
      req.user.userId,
      maxDailyMinutes,
    );
  }
}
