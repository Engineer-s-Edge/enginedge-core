import { Injectable } from '@nestjs/common';
import { AvailableTimeSlot } from '../dto/scheduling.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class TimeSlotService {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('TimeSlotService initialized', TimeSlotService.name);
  }

  findAvailableTimeSlots(
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours: { start: string; end: string },
  ): AvailableTimeSlot[] {
    const today = new Date();
    const [startHour, startMinute] = workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end.split(':').map(Number);

    const workStart = new Date(today);
    workStart.setHours(startHour, startMinute, 0, 0);

    const workEnd = new Date(today);
    workEnd.setHours(endHour, endMinute, 0, 0);

    this.logger.info(
      `Finding available slots for working hours ${workingHours.start}-${workingHours.end}`,
      TimeSlotService.name,
    );
    this.logger.info(
      `Received ${busySlots.length} busy slots:`,
      TimeSlotService.name,
    );
    busySlots.forEach((slot, i) => {
      this.logger.info(
        `  Busy slot ${i + 1}: ${slot.start.toISOString()} to ${slot.end.toISOString()}`,
        TimeSlotService.name,
      );
    });

    const sortedBusySlots = busySlots
      .filter((slot) => {
        return slot.start < workEnd && slot.end > workStart;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    this.logger.info(
      `${sortedBusySlots.length} busy slots overlap with working hours`,
      TimeSlotService.name,
    );

    const availableSlots: AvailableTimeSlot[] = [];
    let currentTime = new Date(workStart);

    for (const busySlot of sortedBusySlots) {
      if (currentTime < busySlot.start) {
        const duration =
          (busySlot.start.getTime() - currentTime.getTime()) / (1000 * 60);
        if (duration >= 5) {
          availableSlots.push({
            start: new Date(currentTime),
            end: new Date(busySlot.start),
            duration,
          });
          this.logger.info(
            `  Available slot: ${currentTime.toISOString()} to ${busySlot.start.toISOString()} (${duration} min)`,
            TimeSlotService.name,
          );
        }
      }
      currentTime = new Date(
        Math.max(currentTime.getTime(), busySlot.end.getTime()),
      );
    }

    if (currentTime < workEnd) {
      const duration =
        (workEnd.getTime() - currentTime.getTime()) / (1000 * 60);
      if (duration >= 5) {
        availableSlots.push({
          start: new Date(currentTime),
          end: new Date(workEnd),
          duration,
        });
        this.logger.info(
          `  Available slot: ${currentTime.toISOString()} to ${workEnd.toISOString()} (${duration} min)`,
          TimeSlotService.name,
        );
      }
    }

    this.logger.info(
      `Found ${availableSlots.length} available slots`,
      TimeSlotService.name,
    );
    return availableSlots;
  }
}
