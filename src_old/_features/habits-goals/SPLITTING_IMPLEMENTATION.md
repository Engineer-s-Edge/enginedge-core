# Habit and Goal Splitting Implementation

## Overview
This implementation ensures that large habits and goals that cannot fit into available time slots are automatically split into smaller, schedulable chunks with a minimum duration of 10 minutes.

## Key Features

### 1. Automatic Item Splitting
- **Minimum Chunk Size**: All chunks are at least 10 minutes long
- **Intelligent Sizing**: Chunks are sized optimally based on available time slots
- **Duration Preservation**: Total duration is always preserved across all chunks
- **Metadata Tracking**: Each chunk maintains information about its original item

### 2. Robust Scheduling Logic
- **Priority-Based Scheduling**: Items are scheduled by priority (urgent > high > medium > low)
- **Two-Pass Algorithm**: First attempts direct scheduling, then splits unschedulable items
- **Adaptive Chunking**: Creates chunks that fit available slots or uses default optimal sizes

### 3. Multiple Splitting Strategies

#### Strategy 1: Slot-Based Splitting
- Analyzes available time slots
- Creates chunks that fit optimally into each slot
- Prioritizes larger slots for efficiency

#### Strategy 2: Overflow Handling
- Creates additional chunks using the largest available slot size
- Ensures no duration is lost

#### Strategy 3: Default Chunking
- Used when no suitable slots are available
- Creates chunks of optimal sizes (60min, 30min, 20min, or 10min minimum)
- Ensures even very large items can be scheduled across multiple sessions

### 4. Edge Case Handling
- **No Available Slots**: Creates default chunks for future scheduling
- **Very Small Slots**: Bypasses unusable slots (< 10 minutes) and uses default chunking
- **Partial Scheduling**: Handles cases where only some chunks can be scheduled

## Implementation Details

### Core Methods

#### `splitItemIntoChunks(item, availableSlots)`
- Main splitting logic with three fallback strategies
- Handles edge cases gracefully
- Preserves all metadata for tracking

#### `createDefaultChunks(item)`
- Creates optimal chunks when slot information is unavailable
- Uses intelligent sizing based on total duration
- Ensures manageable chunk sizes (10-60 minutes)

#### `fitItemsIntoSlots(items, availableSlots)`
- Enhanced scheduling algorithm
- Attempts direct scheduling first, then splitting
- Maintains slot state throughout the process

### Chunk Metadata
Each split chunk includes:
- `isSplit: true` - Indicates this is a split item
- `originalDuration` - Duration of the original habit/goal
- `partNumber` - Which part this is (1, 2, 3, etc.)
- `totalParts` - Total number of parts the item was split into
- `id` - Modified ID with `_part_X` suffix

### Frontend Integration
The Google Calendar service properly handles split items by:
- Creating descriptive event titles (e.g., "🔄 Exercise (Part 1 of 3)")
- Including detailed descriptions with timing information
- Storing metadata in extended properties for tracking

## Testing
Comprehensive test coverage includes:
- Basic splitting functionality
- Minimum duration enforcement
- Very large item handling
- Edge cases (no slots, small slots)
- Default chunking behavior
- Integration with scheduling algorithm

## Benefits
1. **No Lost Items**: Large habits/goals are never left unscheduled
2. **User-Friendly**: Automatic splitting requires no user intervention
3. **Flexible**: Works with any calendar configuration and time constraints
4. **Maintainable**: Clear separation of concerns and robust error handling
5. **Scalable**: Handles items of any size efficiently

## Future Enhancements
- User-configurable chunk sizes
- Smart rescheduling of incomplete chunks
- Progress tracking across split sessions
- Adaptive chunk sizing based on historical completion rates
