import { Test, TestingModule } from '@nestjs/testing';
import { TaskSplittingService } from './task-splitting.service';
import { ScheduleItem, AvailableTimeSlot } from '../dto/scheduling.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('TaskSplittingService', () => {
  let service: TaskSplittingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskSplittingService,
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

    service = module.get<TaskSplittingService>(TaskSplittingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('splitItemIntoChunks', () => {
    it('should not split an item that fits in available slots', () => {
      const item: ScheduleItem = {
        type: 'habit',
        id: 'habit-1',
        title: 'Exercise',
        priority: 'high',
        estimatedDuration: 30,
        item: {} as any,
      };

      const availableSlots: AvailableTimeSlot[] = [
        {
          start: new Date('2025-07-22T09:00:00'),
          end: new Date('2025-07-22T10:00:00'),
          duration: 60,
        },
      ];

      const chunks = service.splitItemIntoChunks(item, availableSlots);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual(item);
    });

    it('should split a large item into smaller chunks', () => {
      const item: ScheduleItem = {
        type: 'goal',
        id: 'goal-1',
        title: 'Learn Programming',
        priority: 'high',
        estimatedDuration: 120,
        item: {} as any,
      };

      const availableSlots: AvailableTimeSlot[] = [
        {
          start: new Date('2025-07-22T09:00:00'),
          end: new Date('2025-07-22T09:30:00'),
          duration: 30,
        },
        {
          start: new Date('2025-07-22T14:00:00'),
          end: new Date('2025-07-22T15:00:00'),
          duration: 60,
        },
        {
          start: new Date('2025-07-22T16:00:00'),
          end: new Date('2025-07-22T16:30:00'),
          duration: 30,
        },
      ];

      const chunks = service.splitItemIntoChunks(item, availableSlots);

      expect(chunks.length).toBeGreaterThan(1);

      chunks.forEach((chunk: ScheduleItem, index: number) => {
        expect(chunk.isSplit).toBe(true);
        expect(chunk.originalDuration).toBe(120);
        expect(chunk.partNumber).toBe(index + 1);
        expect(chunk.totalParts).toBe(chunks.length);
        expect(chunk.estimatedDuration).toBeGreaterThanOrEqual(10);
        expect(chunk.title).toContain('(Part');
        expect(chunk.id).toContain('_part_');
      });

      const totalDuration = chunks.reduce(
        (sum: number, chunk: ScheduleItem) => sum + chunk.estimatedDuration,
        0,
      );
      expect(totalDuration).toBe(120);
    });

    it('should handle very large items by creating multiple chunks', () => {
      const item: ScheduleItem = {
        type: 'goal',
        id: 'goal-large',
        title: 'Very Large Task',
        priority: 'high',
        estimatedDuration: 300, // 5 hours
        item: {} as any,
      };

      const availableSlots: AvailableTimeSlot[] = [
        {
          start: new Date('2025-07-22T09:00:00'),
          end: new Date('2025-07-22T09:30:00'),
          duration: 30,
        },
        {
          start: new Date('2025-07-22T14:00:00'),
          end: new Date('2025-07-22T15:00:00'),
          duration: 60,
        },
        {
          start: new Date('2025-07-22T16:00:00'),
          end: new Date('2025-07-22T16:45:00'),
          duration: 45,
        },
      ];

      const chunks = service.splitItemIntoChunks(item, availableSlots);

      expect(chunks.length).toBeGreaterThan(3);

      chunks.forEach((chunk: ScheduleItem) => {
        expect(chunk.estimatedDuration).toBeGreaterThanOrEqual(10);
        expect(chunk.isSplit).toBe(true);
        expect(chunk.originalDuration).toBe(300);
      });

      const totalDuration = chunks.reduce(
        (sum: number, chunk: ScheduleItem) => sum + chunk.estimatedDuration,
        0,
      );
      expect(totalDuration).toBe(300);
    });

    it('should create default chunks when no suitable slots exist but item is large enough', () => {
      const item: ScheduleItem = {
        type: 'goal',
        id: 'goal-force-split',
        title: 'Force Split Task',
        priority: 'high',
        estimatedDuration: 120,
        item: {} as any,
      };

      const availableSlots: AvailableTimeSlot[] = [];

      const chunks = service.splitItemIntoChunks(item, availableSlots);

      expect(chunks.length).toBeGreaterThan(1);

      chunks.forEach((chunk: ScheduleItem) => {
        expect(chunk.estimatedDuration).toBeGreaterThanOrEqual(10);
        expect(chunk.isSplit).toBe(true);
        expect(chunk.originalDuration).toBe(120);
      });

      const totalDuration = chunks.reduce(
        (sum: number, chunk: ScheduleItem) => sum + chunk.estimatedDuration,
        0,
      );
      expect(totalDuration).toBe(120);
    });
  });

  describe('createDefaultChunks', () => {
    it('should create optimal default chunks for very large items', () => {
      const item: ScheduleItem = {
        type: 'goal',
        id: 'goal-massive',
        title: 'Massive Task',
        priority: 'high',
        estimatedDuration: 480, // 8 hours
        item: {} as any,
      };

      const chunks = (service as any).createDefaultChunks(item);

      expect(chunks.length).toBeGreaterThan(5);

      const sixtyMinuteChunks = chunks.filter(
        (chunk: ScheduleItem) => chunk.estimatedDuration === 60,
      );
      expect(sixtyMinuteChunks.length).toBeGreaterThan(0);

      chunks.forEach((chunk: ScheduleItem) => {
        expect(chunk.estimatedDuration).toBeGreaterThanOrEqual(10);
        expect(chunk.estimatedDuration).toBeLessThanOrEqual(60);
        expect(chunk.isSplit).toBe(true);
        expect(chunk.originalDuration).toBe(480);
      });

      const totalDuration = chunks.reduce(
        (sum: number, chunk: ScheduleItem) => sum + chunk.estimatedDuration,
        0,
      );
      expect(totalDuration).toBe(480);
    });
  });
});
