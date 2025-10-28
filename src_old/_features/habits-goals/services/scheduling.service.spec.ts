import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingService } from './scheduling.service';
import { ScheduleItem } from '../dto/scheduling.dto';
import { TaskProviderService } from './task-provider.service';
import { TimeSlotService } from './time-slot.service';
import { TaskSchedulerService } from './task-scheduler.service';
import { ConfigService } from '@nestjs/config';
import { TaskCompletionService } from './task-completion.service';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let taskProviderService: TaskProviderService;
  let timeSlotService: TimeSlotService;
  let taskSchedulerService: TaskSchedulerService;
  let taskCompletionService: TaskCompletionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: TaskProviderService,
          useValue: {
            getUnmetItemsForScheduling: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TimeSlotService,
          useValue: {
            findAvailableTimeSlots: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: TaskSchedulerService,
          useValue: {
            fitItemsIntoSlots: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: TaskCompletionService,
          useValue: {
            markScheduledItemsAsMet: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'scheduling.defaultWorkingHours') {
                return { start: '09:00', end: '18:00' };
              }
              return null;
            }),
          },
        },
        {
          provide: MyLogger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            setContext: jest.fn(),
            info: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    taskProviderService = module.get<TaskProviderService>(TaskProviderService);
    timeSlotService = module.get<TimeSlotService>(TimeSlotService);
    taskSchedulerService =
      module.get<TaskSchedulerService>(TaskSchedulerService);
    taskCompletionService = module.get<TaskCompletionService>(
      TaskCompletionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scheduleItemsForToday', () => {
    it('should call all the services in the correct order', async () => {
      const userId = 'user-1';
      const busySlots: Array<{ start: Date; end: Date }> = [];
      const workingHours = { start: '09:00', end: '17:00' };

      await service.scheduleItemsForToday(userId, busySlots, workingHours);

      expect(
        taskProviderService.getUnmetItemsForScheduling,
      ).toHaveBeenCalledWith(userId);
      expect(timeSlotService.findAvailableTimeSlots).toHaveBeenCalledWith(
        busySlots,
        workingHours,
      );
      expect(taskSchedulerService.fitItemsIntoSlots).toHaveBeenCalled();
      expect(taskCompletionService.markScheduledItemsAsMet).toHaveBeenCalled();
    });
  });

  describe('previewSchedule', () => {
    it('should call the correct services', async () => {
      const userId = 'user-1';
      const busySlots: Array<{ start: Date; end: Date }> = [];
      const workingHours = { start: '09:00', end: '17:00' };

      await service.previewSchedule(userId, busySlots, workingHours);

      expect(
        taskProviderService.getUnmetItemsForScheduling,
      ).toHaveBeenCalledWith(userId);
      expect(timeSlotService.findAvailableTimeSlots).toHaveBeenCalledWith(
        busySlots,
        workingHours,
      );
      expect(taskSchedulerService.fitItemsIntoSlots).toHaveBeenCalled();
      expect(
        taskCompletionService.markScheduledItemsAsMet,
      ).not.toHaveBeenCalled();
    });

    it('should call markScheduledItemsAsMet if markAsMet is true', async () => {
      const userId = 'user-1';
      const busySlots: Array<{ start: Date; end: Date }> = [];
      const workingHours = { start: '09:00', end: '17:00' };

      (taskSchedulerService.fitItemsIntoSlots as jest.Mock).mockReturnValue([
        { item: { id: '1' } },
      ]);

      await service.previewSchedule(userId, busySlots, workingHours, true);

      expect(taskCompletionService.markScheduledItemsAsMet).toHaveBeenCalled();
    });
  });

  describe('scheduleProvidedItems', () => {
    it('should call the correct services', async () => {
      const items: ScheduleItem[] = [];
      const busySlots: Array<{ start: Date; end: Date }> = [];
      const workingHours = { start: '09:00', end: '17:00' };

      await service.scheduleProvidedItems(items, busySlots, workingHours);

      expect(timeSlotService.findAvailableTimeSlots).toHaveBeenCalledWith(
        busySlots,
        workingHours,
      );
      expect(taskSchedulerService.fitItemsIntoSlots).toHaveBeenCalledWith(
        items,
        [],
      );
      expect(
        taskCompletionService.markScheduledItemsAsMet,
      ).not.toHaveBeenCalled();
    });
  });
});
