import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { FileType } from './file.entity';

export type UserDocument = User & Document;

@Schema()
export class UserName {
  @Prop({ required: true })
  firstName!: string;

  @Prop({ required: true })
  middleNames!: string[];

  @Prop({ required: true })
  lastName!: string;
}

@Schema()
export class UserAddress {
  @Prop({ required: true })
  street!: string;

  @Prop({ required: true })
  city!: string;

  @Prop({ required: true })
  state!: string;

  get province(): string {
    return this.state;
  }

  set province(value: string) {
    this.state = value;
  }

  get territory(): string {
    return this.state;
  }

  set territory(value: string) {
    this.state = value;
  }

  @Prop({ required: true })
  country!: string;

  @Prop({ required: true })
  postalCode!: string;
}

@Schema()
export class UserEducation {
  @Prop({ required: true })
  school!: string;

  @Prop({ required: true })
  degree!: string;

  @Prop({ required: true })
  fieldOfStudy!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  location!: string;
}

@Schema()
export class UserExperience {
  @Prop({ required: true })
  company!: string;

  @Prop({ required: true })
  position!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  responsibilities!: string[];

  @Prop({ required: true })
  achievements!: string[];

  @Prop({ required: true })
  skills!: string[];
}

@Schema()
export class UserData {
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  name!: UserName;

  @Prop({ required: true })
  dateOfBirth!: Date;

  @Prop({ required: true })
  gender!: string;

  @Prop({ required: true })
  phoneNumber!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  address!: UserAddress;

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], required: true })
  experiences!: UserExperience[];

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], required: true })
  education!: UserEducation[];

  @Prop({ default: [] })
  certifications!: string[];

  @Prop({ default: [] })
  links!: string[];
}

@Schema()
export class Task {
  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ default: 0 })
  progressPercentage!: number;

  @Prop({ default: false })
  completed!: boolean;

  @Prop({ default: 'medium' })
  priority!: 'low' | 'medium' | 'high' | 'urgent';

  @Prop({ default: [] })
  tags!: string[];

  @Prop({ default: 0 })
  estimatedHours!: number;

  @Prop({ type: [String], default: [] })
  subtasks!: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

@Schema()
export class CalendarEvent {
  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true })
  startTime!: Date;

  @Prop({ required: true })
  endTime!: Date;

  @Prop({ default: false })
  isRecurring!: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  recurrencePattern?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: Date;
    daysOfWeek?: number[];
  };

  @Prop({ default: '' })
  location!: string;

  @Prop({ default: '' })
  googleCalendarEventId!: string;

  @Prop({ default: [] })
  attendees!: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

@Schema()
export class StudyPreferences {
  @Prop({ default: 25 })
  pomodoroWorkMinutes!: number;

  @Prop({ default: 5 })
  pomodoroBreakMinutes!: number;

  @Prop({ default: 15 })
  pomodoroLongBreakMinutes!: number;

  @Prop({ default: 4 })
  pomodoroCyclesBeforeLongBreak!: number;

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], default: [] })
  preferredStudyTimes!: {
    dayOfWeek: number;
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
  }[];

  @Prop({ default: [] })
  preferredSubjects!: string[];

  @Prop({ default: 'balanced' })
  studyStyle!: 'intense' | 'balanced' | 'spaced' | 'custom';

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  customPrompts!: Record<string, string>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

@Schema()
export class SchedulingZoneActivity {
  @Prop({ required: true })
  activityType!: string; // e.g., 'schoolwork', 'workout', 'reading', etc.

  @Prop({ default: 0 })
  preferenceWeight!: number; // Higher number means higher preference

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  conditions!: {
    progressStatus?: 'behind' | 'on_track' | 'ahead' | 'any';
    minTasksCompleted?: number;
    maxTasksCompleted?: number;
    specificTasks?: string[]; // Task IDs that must be completed
    daysOfWeek?: number[]; // 0-6 for Sunday-Saturday
    energyLevel?: 'low' | 'medium' | 'high' | 'any';
    weatherDependent?: boolean;
  };

  @Prop({ default: 0 })
  estimatedDuration!: number; // In minutes

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

@Schema()
export class SchedulingZone {
  @Prop({ required: true })
  name!: string; // e.g., "Afternoon Flex Time"

  @Prop({ type: [Number], required: true })
  daysOfWeek!: number[]; // 0-6 for Sunday-Saturday

  @Prop({ required: true })
  startTime!: Date; // HH:MM format

  @Prop({ required: true })
  endTime!: Date; // HH:MM format

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], required: true })
  possibleActivities!: SchedulingZoneActivity[];

  @Prop({ default: false })
  isFlexible!: boolean; // If true, this zone can be moved/resized based on daily needs

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

@Schema()
export class UserSchedule {
  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], default: [] })
  tasks!: Task[];

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], default: [] })
  events!: CalendarEvent[];

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], default: [] })
  schedulingZones!: SchedulingZone[];

  @Prop({ default: false })
  googleCalendarIntegrated!: boolean;

  @Prop({ default: '' })
  googleCalendarRefreshToken!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  studyPreferences!: StudyPreferences;

  @Prop({ default: 'balanced' })
  calendarGenerationStyle!: 'packed' | 'balanced' | 'relaxed' | 'custom';

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  calendarPreferences!: {
    maxTasksPerDay?: number;
    minBreakBetweenTasks?: number;
    preferredWorkingHours?: {
      start: string; // HH:MM format
      end: string; // HH:MM format
    };
    prioritizeByDeadline?: boolean;
    balanceSubjects?: boolean;
  };

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

@Schema()
export class UserFile {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'File' })
  fileId!: string;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true, enum: FileType, type: String })
  fileType!: FileType;

  @Prop({ required: true })
  uploadDate!: Date;
}

@Schema()
export class User {
  @Prop({ required: true, unique: true })
  username!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ default: 'user' })
  role!: string;

  @Prop({ default: Date.now })
  createdAt!: Date;

  @Prop({ default: Date.now })
  updatedAt!: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  userData!: UserData;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Chat' }] })
  chats!: string[];

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }], default: [] })
  files!: UserFile[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  schedule!: UserSchedule;
}

export const UserSchema = SchemaFactory.createForClass(User);
