import { Test, TestingModule } from '@nestjs/testing';
import { TaskCompletionService } from './task-completion.service';
import { HabitsService } from './habits.service';
import { GoalsService } from './goals.service';
import { ScheduleSlot } from '../dto/scheduling.dto';
import { GoalStatus } from '../dto/goal.dto';
import { Goal } from '../entities/goal.entity';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('TaskCompletionService', () => {
  let service: TaskCompletionService;
  let habitsService: HabitsService;
  let goalsService: GoalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCompletionService,
        {
          provide: HabitsService,
          useValue: {
            toggleEntry: jest.fn(),
          },
        },
        {
          provide: GoalsService,
          useValue: {
            update: jest.fn(),
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

    service = module.get<TaskCompletionService>(TaskCompletionService);
    habitsService = module.get<HabitsService>(HabitsService);
    goalsService = module.get<GoalsService>(GoalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('markScheduledItemsAsMet', () => {
    it('should mark habits as completed', async () => {
      const scheduledSlots: ScheduleSlot[] = [
        {
          startTime: new Date(),
          endTime: new Date(),
          item: {
            type: 'habit',
            id: '60d5f9f8f8a8a8a8a8a8a8a8',
            title: 'Habit 1',
            priority: 'high',
            estimatedDuration: 30,
            item: {} as any,
          },
        },
      ];

      await service.markScheduledItemsAsMet('user-1', scheduledSlots);

      expect(habitsService.toggleEntry).toHaveBeenCalled();
    });

    it('should mark goals as in_progress', async () => {
      const scheduledSlots: ScheduleSlot[] = [
        {
          startTime: new Date(),
          endTime: new Date(),
          item: {
            type: 'goal',
            id: '60d5f9f8f8a8a8a8a8a8a8a8',
            title: 'Goal 1',
            priority: 'high',
            estimatedDuration: 60,
            item: { status: 'not_started' } as Goal,
          },
        },
      ];

      await service.markScheduledItemsAsMet('user-1', scheduledSlots);

      expect(goalsService.update).toHaveBeenCalledWith(
        '60d5f9f8f8a8a8a8a8a8a8a8',
        'user-1',
        { status: GoalStatus.IN_PROGRESS },
      );
    });
  });
});
