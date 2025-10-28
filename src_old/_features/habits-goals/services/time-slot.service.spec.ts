import { Test, TestingModule } from '@nestjs/testing';
import { TimeSlotService } from './time-slot.service';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('TimeSlotService', () => {
  let service: TimeSlotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeSlotService,
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

    service = module.get<TimeSlotService>(TimeSlotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAvailableTimeSlots', () => {
    it('should use 5-minute minimum slot duration', () => {
      const busySlots = [
        {
          start: new Date('2025-07-22T09:30:00'),
          end: new Date('2025-07-22T10:00:00'),
        },
        {
          start: new Date('2025-07-22T14:00:00'),
          end: new Date('2025-07-22T15:00:00'),
        },
      ];

      const workingHours = { start: '09:00', end: '18:00' };

      const availableSlots = service.findAvailableTimeSlots(
        busySlots,
        workingHours,
      );

      availableSlots.forEach((slot: any) => {
        expect(slot.duration).toBeGreaterThanOrEqual(5);
      });

      expect(availableSlots.length).toBeGreaterThan(0);
    });
  });
});
