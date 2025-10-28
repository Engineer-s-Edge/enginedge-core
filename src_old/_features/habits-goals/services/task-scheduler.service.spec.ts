import { Test, TestingModule } from '@nestjs/testing';
import { TaskSchedulerService } from './task-scheduler.service';
import { TaskSplittingService } from './task-splitting.service';
import { ScheduleItem, AvailableTimeSlot } from '../dto/scheduling.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('TaskSchedulerService', () => {
  let service: TaskSchedulerService;
  let taskSplittingService: TaskSplittingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskSchedulerService,
        {
          provide: TaskSplittingService,
          useValue: {
            splitItemIntoChunks: jest.fn((item) => [item]),
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

    service = module.get<TaskSchedulerService>(TaskSchedulerService);
    taskSplittingService =
      module.get<TaskSplittingService>(TaskSplittingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fitItemsIntoSlots with splitting', () => {
    it('should schedule regular items first, then try splitting unscheduled items', () => {
      const items: ScheduleItem[] = [
        {
          type: 'habit',
          id: 'habit-1',
          title: 'Small Task',
          priority: 'high',
          estimatedDuration: 20,
          item: {} as any,
        },
        {
          type: 'goal',
          id: 'goal-1',
          title: 'Large Task',
          priority: 'medium',
          estimatedDuration: 90,
          item: {} as any,
        },
      ];

      const availableSlots: AvailableTimeSlot[] = [
        {
          start: new Date('2025-07-22T09:00:00'),
          end: new Date('2025-07-22T09:30:00'),
          duration: 30,
        },
        {
          start: new Date('2025-07-22T14:00:00'),
          end: new Date('2025-07-22T14:45:00'),
          duration: 45,
        },
        {
          start: new Date('2025-07-22T16:00:00'),
          end: new Date('2025-07-22T16:30:00'),
          duration: 30,
        },
      ];

      (
        taskSplittingService.splitItemIntoChunks as jest.Mock
      ).mockImplementation((item, slots) => {
        if (item.id === 'goal-1') {
          return [
            {
              ...item,
              id: 'goal-1_part_1',
              estimatedDuration: 45,
              isSplit: true,
              originalDuration: 90,
              partNumber: 1,
              totalParts: 2,
            },
            {
              ...item,
              id: 'goal-1_part_2',
              estimatedDuration: 45,
              isSplit: true,
              originalDuration: 90,
              partNumber: 2,
              totalParts: 2,
            },
          ];
        }
        return [item];
      });

      const scheduledSlots = service.fitItemsIntoSlots(items, availableSlots);

      expect(scheduledSlots.length).toBeGreaterThan(1);

      const smallTaskSlot = scheduledSlots.find(
        (slot: any) => slot.item.id === 'habit-1',
      );
      expect(smallTaskSlot).toBeDefined();
      expect(smallTaskSlot?.item.isSplit).toBeFalsy();

      const largeTaskSlots = scheduledSlots.filter((slot: any) =>
        slot.item.id.startsWith('goal-1_part_'),
      );
      expect(largeTaskSlots.length).toBeGreaterThan(0);
    });

    it('should successfully schedule large items by splitting them', () => {
      const items: ScheduleItem[] = [
        {
          type: 'habit',
          id: 'habit-small',
          title: 'Small Task',
          priority: 'high',
          estimatedDuration: 15,
          item: {} as any,
        },
        {
          type: 'goal',
          id: 'goal-huge',
          title: 'Huge Task',
          priority: 'medium',
          estimatedDuration: 180,
          item: {} as any,
        },
      ];

      const availableSlots: AvailableTimeSlot[] = [
        {
          start: new Date('2025-07-22T09:00:00'),
          end: new Date('2025-07-22T09:30:00'),
          duration: 30,
        },
        {
          start: new Date('2025-07-22T10:00:00'),
          end: new Date('2025-07-22T11:00:00'),
          duration: 60,
        },
        {
          start: new Date('2025-07-22T14:00:00'),
          end: new Date('2025-07-22T14:45:00'),
          duration: 45,
        },
        {
          start: new Date('2025-07-22T16:00:00'),
          end: new Date('2025-07-22T16:30:00'),
          duration: 30,
        },
      ];

      (
        taskSplittingService.splitItemIntoChunks as jest.Mock
      ).mockImplementation((item, slots) => {
        if (item.id === 'goal-huge') {
          return [
            {
              ...item,
              id: 'goal-huge_part_1',
              estimatedDuration: 60,
              isSplit: true,
              originalDuration: 180,
              partNumber: 1,
              totalParts: 3,
            },
            {
              ...item,
              id: 'goal-huge_part_2',
              estimatedDuration: 60,
              isSplit: true,
              originalDuration: 180,
              partNumber: 2,
              totalParts: 3,
            },
            {
              ...item,
              id: 'goal-huge_part_3',
              estimatedDuration: 60,
              isSplit: true,
              originalDuration: 180,
              partNumber: 3,
              totalParts: 3,
            },
          ];
        }
        return [item];
      });

      const scheduledSlots = service.fitItemsIntoSlots(items, availableSlots);

      expect(scheduledSlots.length).toBe(2);

      const smallTaskSlot = scheduledSlots.find(
        (slot: any) => slot.item.id === 'habit-small',
      );
      expect(smallTaskSlot).toBeDefined();
      expect(smallTaskSlot?.item.isSplit).toBeFalsy();

      const largeTaskSlots = scheduledSlots.filter((slot: any) =>
        slot.item.id.startsWith('goal-huge_part_'),
      );
      expect(largeTaskSlots.length).toBeGreaterThan(0);

      const totalScheduledForLargeTask = largeTaskSlots.reduce(
        (sum: number, slot: any) => sum + slot.item.estimatedDuration,
        0,
      );
      expect(totalScheduledForLargeTask).toBeGreaterThan(0);
    });
  });
});
