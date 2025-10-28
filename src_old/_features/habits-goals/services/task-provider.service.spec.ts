import { Test, TestingModule } from '@nestjs/testing';
import { TaskProviderService } from './task-provider.service';
import { HabitsService } from './habits.service';
import { GoalsService } from './goals.service';
import { ScheduleItem } from '../dto/scheduling.dto';

describe('TaskProviderService', () => {
  let service: TaskProviderService;
  let habitsService: HabitsService;
  let goalsService: GoalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskProviderService,
        {
          provide: HabitsService,
          useValue: {
            getUnmetHabits: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: GoalsService,
          useValue: {
            getUnmetGoals: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<TaskProviderService>(TaskProviderService);
    habitsService = module.get<HabitsService>(HabitsService);
    goalsService = module.get<GoalsService>(GoalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUnmetItemsForScheduling', () => {
    it('should return a sorted list of habits and goals', async () => {
      const habits = [
        {
          _id: 'h1',
          title: 'Habit 1',
          priority: 'medium',
          dailyTimeCommitment: 30,
        },
      ];
      const goals = [
        {
          _id: 'g1',
          title: 'Goal 1',
          priority: 'high',
          dailyTimeCommitment: 60,
        },
      ];

      (habitsService.getUnmetHabits as jest.Mock).mockResolvedValue(habits);
      (goalsService.getUnmetGoals as jest.Mock).mockResolvedValue(goals);

      const items = await service.getUnmetItemsForScheduling('user-1');

      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Goal 1');
      expect(items[1].title).toBe('Habit 1');
    });
  });
});
