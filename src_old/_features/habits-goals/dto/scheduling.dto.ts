import { Habit } from '../entities/habit.entity';
import { Goal } from '../entities/goal.entity';

export interface ScheduleItem {
  type: 'habit' | 'goal';
  id: string;
  title: string;
  priority: string;
  estimatedDuration: number; // in minutes
  item: Habit | Goal;
  originalDuration?: number;
  partNumber?: number;
  totalParts?: number;
  isSplit?: boolean;
}

export interface ScheduleSlot {
  startTime: Date;
  endTime: Date;
  item: ScheduleItem;
}

export interface AvailableTimeSlot {
  start: Date;
  end: Date;
  duration: number; // in minutes
}
