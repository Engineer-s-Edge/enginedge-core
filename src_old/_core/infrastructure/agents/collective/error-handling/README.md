# Error Handling & Recovery

This module provides comprehensive error handling, retry strategies, and human escalation for the Collective Agent system.

## Services

### 1. ErrorHandlerService

**Purpose:** Intelligent error detection, classification, and action determination.

**Key Features:**
- Error classification by type and severity
- Automatic action determination (retry/cancel/escalate/reassign)
- Troubleshooting guidance generation
- Error statistics and reporting
- Error history tracking

**Error Types:**
- `task_failure`: General task execution failure
- `agent_crash`: Agent stopped responding
- `dependency_error`: Dependency unavailable
- `timeout_error`: Task exceeded time limit
- `validation_error`: Output doesn't meet criteria
- `resource_error`: Insufficient resources
- `permission_error`: Access denied

**Severity Levels:**
- `low`: Minor issues, easily recoverable
- `medium`: Moderate issues, may need adjustment
- `high`: Serious issues, requires attention
- `critical`: System-level issues, immediate escalation

**Usage:**

```typescript
// Handle a task failure
const result = await errorHandler.handleTaskFailure(
  collectiveId,
  taskId,
  {
    type: 'timeout_error',
    message: 'Task execution exceeded 5 minute timeout',
    agentId: 'agent-123',
  }
);

console.log(`Action: ${result.action}`); // 'retry'
console.log(`Reason: ${result.reason}`); // 'Retryable error...'

// Provide troubleshooting guidance
const guidance = await errorHandler.provideTroubleshootingGuidance(
  collectiveId,
  taskId,
  {
    type: 'validation_error',
    message: 'Output format does not match requirements',
  }
);

// Check if task should be retried
const shouldRetry = await errorHandler.shouldRetryTask(taskId);
if (shouldRetry) {
  await errorHandler.retryTask(collectiveId, taskId, {
    additionalHints: ['Focus on output format'],
  });
}

// Get error statistics
const stats = await errorHandler.getErrorStats(collectiveId);
console.log(`Total errors: ${stats.totalErrors}`);
console.log(`Error rate: ${stats.errorRate * 100}%`);
console.log(`Most common: ${stats.mostCommonError}`);

// Generate error report
const report = await errorHandler.generateErrorReport(collectiveId);
console.log(report);
```

**Error Actions:**

```typescript
interface ErrorAction {
  action: 'retry' | 'cancel' | 'escalate' | 'reassign';
  reason: string;
}

// Action determination logic:
// - Critical errors → escalate immediately
// - Non-recoverable → cancel
// - Max retries exceeded → escalate
// - Agent crash → reassign
// - Default → retry
```

---

### 2. RetryStrategyService

**Purpose:** Intelligent retry strategies that learn from failures and adapt.

**Key Features:**
- 6 retry strategies with scoring system
- Progressive backoff delays (5s → 2min)
- Strategy selection based on error type and history
- Action execution for each strategy
- Retry statistics tracking

**Strategies:**

1. **Simple Retry**
   - When: Transient errors, few attempts, simple tasks
   - Actions: Delay + reset task to pending
   - Best for: Network hiccups, temporary unavailability

2. **Decompose**
   - When: Complex tasks, multiple failures
   - Actions: PM breaks task into smaller subtasks
   - Best for: Tasks that are too large or complex

3. **Adjust Parameters**
   - When: Timeout/resource errors
   - Actions: Increase timeouts, allocate more resources
   - Best for: Tasks that need more time/memory

4. **Change Agent**
   - When: Agent crashes, skill mismatch
   - Actions: Reassign to different agent
   - Best for: Agent-specific issues

5. **Add Context**
   - When: Validation errors, ambiguous requirements
   - Actions: Add hints from previous attempts
   - Best for: Tasks needing clarification

6. **Simplify**
   - When: Many failures, task too complex
   - Actions: PM reduces task scope
   - Best for: Overambitious tasks

**Usage:**

```typescript
// Determine best retry strategy
const strategy = await retryStrategy.determineRetryStrategy(
  collectiveId,
  taskId,
  {
    type: 'timeout_error',
    message: 'Task timed out after 5 minutes',
    attemptCount: 2,
    totalTime: 600000, // 10 minutes total
  }
);

console.log(`Strategy: ${strategy.strategy}`); // 'adjust_parameters'
console.log(`Reason: ${strategy.reason}`);
console.log(`Actions: ${strategy.actions.length}`);

// Execute the strategy
await retryStrategy.executeRetryStrategy(
  collectiveId,
  taskId,
  strategy
);

// Get retry statistics
const stats = await retryStrategy.getRetryStats(taskId);
console.log(`Total retries: ${stats.totalRetries}`);
console.log(`Strategies used: ${stats.strategiesUsed.join(', ')}`);
console.log(`Success: ${stats.success}`);
```

**Strategy Scoring:**

```typescript
// Each strategy gets a score based on:
// - Error type match (e.g., timeout → adjust_parameters)
// - Attempt count (e.g., many attempts → decompose)
// - Task complexity (e.g., GOAL → decompose, SUBTASK → simple_retry)
// - Agent availability (e.g., idle agents → change_agent)

// Strategy with highest score is selected
// Weights: simple_retry=10, decompose=8, adjust_parameters=7,
//          change_agent=6, add_context=5, simplify=4
```

---

### 3. DeadlockResolverService

**Purpose:** Detect and resolve deadlocks intelligently.

**Key Features:**
- 5 resolution strategies
- Automatic resolution with retry tracking
- Human escalation after max attempts
- Resolution verification
- Task importance ranking

**Strategies:**

1. **Cancel Task**: Cancel least important task in cycle
2. **Remove Dependency**: Remove safest circular dependency
3. **Reassign Task**: Reassign to break agent contention
4. **Force Unblock**: Manual override to unblock task
5. **Escalate**: Human intervention required

**Usage:**

```typescript
// Resolve detected deadlocks
const result = await deadlockResolver.resolveDeadlocks(collectiveId);

console.log(`Resolved: ${result.resolved.length}`);
console.log(`Failed: ${result.failed.length}`);
console.log(`Escalated: ${result.escalated.length}`);
console.log(`Strategies: ${JSON.stringify(result.strategies)}`);

// Strategies used: { cancel_task: 2, reassign_task: 1 }
```

**Task Importance Ranking:**

```typescript
// Tasks ranked by importance (lower = more important):
// VISION = 1
// STRATEGIC_THEME = 2
// GOAL = 3
// OBJECTIVE = 4
// MILESTONE = 5
// INITIATIVE = 6
// TASK = 7
// SUBTASK = 8

// Deadlock resolution prefers cancelling less important tasks
```

---

### 4. HumanEscalationService

**Purpose:** Handle situations requiring human intervention.

**Key Features:**
- Comprehensive context summaries
- Collective pause/resume during escalation
- Suggested actions based on escalation type
- Timeout handling (24 hour limit)
- Resolution action execution
- Escalation statistics

**Escalation Types:**
- `deadlock`: Unresolvable deadlock
- `error`: Critical error requiring human fix
- `ambiguity`: Ambiguous requirements
- `decision`: Strategic decision needed
- `resource`: Resource constraints

**Urgency Levels:**
- `low`: Can wait, non-blocking
- `medium`: Should address soon
- `high`: Needs prompt attention
- `critical`: Immediate attention required

**Usage:**

```typescript
// Escalate to human
const result = await humanEscalation.escalate(
  collectiveId,
  {
    reason: 'Deadlock unresolvable after 3 attempts',
    type: 'deadlock',
    context: {
      taskId: 'task-123',
      details: { cycleLength: 4, attempts: 3 },
    },
    urgency: 'high',
  }
);

console.log(`Escalation ID: ${result.escalationId}`);
console.log(`Status: ${result.status}`); // 'pending'

// Collective is now PAUSED
// PM receives CRITICAL message with full context

// Human resolves escalation
await humanEscalation.resolve(
  result.escalationId,
  {
    guidance: 'Cancel task A and modify task B requirements',
    actions: [
      {
        type: 'cancel_task',
        params: { taskId: 'task-a' },
      },
      {
        type: 'modify_task',
        params: {
          taskId: 'task-b',
          updates: { acceptanceCriteria: 'Simplified criteria...' },
        },
      },
    ],
  }
);

// Collective resumes with guidance applied

// Get active escalations
const active = await humanEscalation.getActiveEscalations(collectiveId);
console.log(`Active escalations: ${active.length}`);

// Get escalation statistics
const stats = await humanEscalation.getEscalationStats(collectiveId);
console.log(`Total: ${stats.totalEscalations}`);
console.log(`Resolved: ${stats.resolved}`);
console.log(`Pending: ${stats.pending}`);
console.log(`Avg resolution time: ${stats.avgResolutionTime}ms`);
```

**Escalation Summary:**

```markdown
# Escalation Summary

**Type:** deadlock
**Urgency:** high
**Reason:** Deadlock unresolvable after 3 attempts

## Collective Overview
- **Vision:** Build user authentication system
- **Status:** paused
- **PM Agent:** pm-agent-001
- **Total Agents:** 3

## Task Progress
- Total: 15
- Completed: 8
- In Progress: 4
- Pending: 2
- Blocked: 1
- Failed: 0

## Problem Task
- **ID:** task-123
- **Title:** Implement login endpoint
- **Level:** TASK
- **State:** blocked
- **Assigned Agent:** agent-002
- **Description:** Create POST /login endpoint with JWT auth

## Recent Communication
- [2024-01-15T10:30:00Z] agent-002 → pm: I'm blocked waiting for task-124
- [2024-01-15T10:29:00Z] agent-003 → pm: I need task-123 to complete first
- ...

## Suggested Actions
- Cancel one of the deadlocked tasks
- Remove a circular dependency
- Reassign tasks to break contention
- Provide manual resolution guidance
```

---

## Integration with Runtime

The error handling services integrate with the PM main loop and agent executors:

```typescript
// In CollectiveRuntimeService (PM main loop):
async pmMainLoop() {
  // ... existing PM logic ...

  // Check for errors
  const failedTasks = await this.getFailedTasks(collectiveId);
  for (const task of failedTasks) {
    const action = await this.errorHandler.handleTaskFailure(
      collectiveId,
      task._id,
      task.error
    );

    if (action.action === 'retry') {
      const strategy = await this.retryStrategy.determineRetryStrategy(
        collectiveId,
        task._id,
        task.error
      );
      await this.retryStrategy.executeRetryStrategy(
        collectiveId,
        task._id,
        strategy
      );
    }
  }

  // Check for deadlocks
  const deadlocks = await this.deadlockDetection.detectDeadlocks(collectiveId);
  if (deadlocks.length > 0) {
    const result = await this.deadlockResolver.resolveDeadlocks(collectiveId);
    
    if (result.escalated.length > 0) {
      // Some deadlocks couldn't be auto-resolved
      await this.humanEscalation.escalate(collectiveId, {
        reason: 'Deadlock resolution failed',
        type: 'deadlock',
        context: { deadlocks: result.escalated },
        urgency: 'high',
      });
    }
  }
}

// In AgentExecutor:
async executeTask(collectiveId, task, agentId) {
  try {
    // ... execute task ...
  } catch (error) {
    // Record error
    await this.errorHandler.handleTaskFailure(
      collectiveId,
      task._id,
      {
        type: this.classifyError(error),
        message: error.message,
        agentId,
      }
    );
  }
}
```

---

## Error Flow Diagram

```
Task Fails
    │
    ├─→ ErrorHandler.handleTaskFailure()
    │       │
    │       ├─→ Classify error (type, severity, recoverable)
    │       ├─→ Determine action (retry/cancel/escalate/reassign)
    │       └─→ Execute action
    │
    ├─→ If action = 'retry':
    │       │
    │       └─→ RetryStrategy.determineRetryStrategy()
    │               │
    │               ├─→ Score all strategies
    │               ├─→ Select best strategy
    │               └─→ Execute strategy actions
    │
    ├─→ If action = 'escalate':
    │       │
    │       └─→ HumanEscalation.escalate()
    │               │
    │               ├─→ Pause collective
    │               ├─→ Build context summary
    │               ├─→ Send CRITICAL message to PM
    │               └─→ Wait for human resolution
    │
    └─→ If action = 'cancel':
            │
            └─→ PMTools.cancelTask()
```

---

## Configuration

```typescript
// Error Handler
MAX_TASK_RETRIES = 3
RETRY_DELAYS_MS = [5000, 15000, 30000] // 5s, 15s, 30s
MAX_ERROR_HISTORY = 100

// Retry Strategy
MAX_SIMPLE_RETRIES = 2
MAX_TOTAL_RETRIES = 5
RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 120000] // 5s→2min

// Deadlock Resolver
MAX_AUTO_RESOLUTION_ATTEMPTS = 3

// Human Escalation
MAX_ESCALATION_WAIT_MS = 24 * 60 * 60 * 1000 // 24 hours
```

---

## Testing

```typescript
describe('Error Handling', () => {
  it('should retry transient errors', async () => {
    const result = await errorHandler.handleTaskFailure(collectiveId, taskId, {
      type: 'timeout_error',
      message: 'Network timeout',
    });
    expect(result.action).toBe('retry');
  });

  it('should escalate critical errors', async () => {
    const result = await errorHandler.handleTaskFailure(collectiveId, taskId, {
      type: 'agent_crash',
      message: 'Agent segfault',
    });
    expect(result.action).toBe('escalate');
  });

  it('should select decompose strategy for complex tasks', async () => {
    const strategy = await retryStrategy.determineRetryStrategy(
      collectiveId,
      complexTaskId,
      { type: 'task_failure', attemptCount: 2 }
    );
    expect(strategy.strategy).toBe('decompose');
  });

  it('should resolve deadlock automatically', async () => {
    const result = await deadlockResolver.resolveDeadlocks(collectiveId);
    expect(result.resolved.length).toBeGreaterThan(0);
    expect(result.escalated.length).toBe(0);
  });

  it('should escalate and pause collective', async () => {
    const result = await humanEscalation.escalate(collectiveId, {
      reason: 'Test escalation',
      type: 'error',
      context: {},
      urgency: 'high',
    });
    
    const collective = await collectiveModel.findById(collectiveId);
    expect(collective.status).toBe('paused');
    expect(result.status).toBe('pending');
  });
});
```

---

## Next Steps

1. **Integrate with Runtime**: Wire error handlers into PM main loop and agent executors
2. **Add Metrics**: Track error rates, retry success rates, escalation frequencies
3. **UI Integration**: Build dashboard for error monitoring and escalation management
4. **Testing**: Comprehensive unit and integration tests
5. **Documentation**: API docs and troubleshooting guides
