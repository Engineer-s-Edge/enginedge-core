# Daily Time Commitment Feature

This feature allows users to specify how much time per day they want to dedicate to each habit or goal, enabling better time management and realistic planning.

## Overview

The daily time commitment feature adds a new optional field `dailyTimeCommitment` (in minutes) to both habits and goals. This helps users:

- Plan their daily schedule more effectively
- Set realistic expectations for time allocation
- Track total daily time commitments across all habits and goals
- Find habits and goals by time requirements
- Validate that their total daily commitments don't exceed available time

## Database Schema Changes

### Goal Entity
- Added `dailyTimeCommitment?: number` (optional, minimum 1 minute)

### Habit Entity  
- Added `dailyTimeCommitment?: number` (optional, minimum 1 minute)

## API Endpoints

### Goals
- `GET /goals/time-commitment/total` - Get total daily time commitment for all active goals
- `GET /goals/time-commitment/range?min=X&max=Y` - Get goals within time commitment range

### Habits
- `GET /habits/time-commitment/total` - Get total daily time commitment for all active habits
- `GET /habits/time-commitment/range?min=X&max=Y` - Get habits within time commitment range

### Combined Time Management
- `GET /time-management/daily-breakdown` - Get breakdown of time commitments by type
- `GET /time-management/all-commitments` - Get all habits and goals with time commitments
- `GET /time-management/commitments/range?min=X&max=Y` - Get all commitments within range
- `GET /time-management/validate-limit?maxMinutes=X` - Validate if total commitments exceed limit

## DTO Updates

### CreateGoalDto & UpdateGoalDto
```typescript
@IsOptional()
@IsNumber()
@Min(1)
dailyTimeCommitment?: number;
```

### CreateHabitDto & UpdateHabitDto
```typescript
@IsOptional()
@IsNumber()
@Min(1)
dailyTimeCommitment?: number;
```

## Service Methods

### GoalsService
- `getTotalDailyTimeCommitment(userId: string): Promise<number>`
- `getGoalsByTimeCommitment(userId: string, minMinutes?: number, maxMinutes?: number): Promise<Goal[]>`

### HabitsService
- `getTotalDailyTimeCommitment(userId: string): Promise<number>`
- `getHabitsByTimeCommitment(userId: string, minMinutes?: number, maxMinutes?: number): Promise<Habit[]>`

### TimeManagementService (New)
- `getDailyTimeBreakdown(userId: string): Promise<DailyTimeBreakdown>`
- `getAllTimeCommitments(userId: string): Promise<TimeCommitmentItem[]>`
- `getTimeCommitmentsByRange(userId: string, minMinutes?: number, maxMinutes?: number): Promise<TimeCommitmentItem[]>`
- `validateDailyTimeLimit(userId: string, maxDailyMinutes: number): Promise<ValidationResult>`

## Usage Examples

### Creating a Goal with Daily Time Commitment
```json
POST /goals
{
  "title": "Learn Spanish",
  "description": "Practice Spanish vocabulary and grammar",
  "status": "not_started",
  "priority": "high",
  "startDate": "2025-07-19",
  "dailyTimeCommitment": 30
}
```

### Creating a Habit with Daily Time Commitment
```json
POST /habits
{
  "title": "Morning Exercise",
  "description": "Daily workout routine",
  "frequency": "daily",
  "status": "active",
  "priority": "high",
  "startDate": "2025-07-19",
  "dailyTimeCommitment": 45
}
```

### Getting Daily Time Breakdown
```json
GET /time-management/daily-breakdown

Response:
{
  "habits": 45,
  "goals": 30,
  "total": 75,
  "habitsCount": 1,
  "goalsCount": 1
}
```

### Validating Daily Time Limit
```json
GET /time-management/validate-limit?maxMinutes=120

Response:
{
  "isValid": true,
  "currentTotal": 75,
  "maxLimit": 120,
  "exceededBy": undefined
}
```

## Frontend Integration

The frontend can use these new endpoints to:
1. Show time commitment input fields when creating/editing habits and goals
2. Display daily time breakdown in dashboard
3. Warn users when total daily commitments exceed available time
4. Filter habits/goals by time commitment requirements
5. Show time management insights and recommendations

## Migration Notes

- The `dailyTimeCommitment` field is optional, so existing habits and goals will continue to work
- No database migration is required as new fields are optional
- The feature is backward compatible with existing API clients
