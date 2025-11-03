# Collective Agent Runtime

Core execution infrastructure for the Collective Agent system.

## Components

### CollectiveRuntimeService (630 lines)

**Purpose:** PM agent main loop orchestration and collective lifecycle management.

**Responsibilities:**
- Start/stop collective execution
- Run PM agent main loop (priority-based event processing)
- Monitor agent health and task progress
- Trigger deadlock detection
- Manage collective pause/resume
- Emit lifecycle events

**PM Main Loop** (runs every 1 second):

1. **CRITICAL/HIGH Priority Messages** (up to 10/cycle)
   - Deadlock alerts, agent failures, urgent questions

2. **Task Assignment** (up to 5 tasks/cycle)
   - Find idle agents, match tasks to capabilities, start executors

3. **Deadlock Detection** (every 30 seconds)
   - DFS cycle detection, alert generation

4. **NORMAL Priority Messages** (up to 5/cycle)
   - Task updates, progress reports

5. **Task Decomposition** (background)
   - High-level tasks → subtasks

6. **LOW/BACKGROUND Priority Messages** (up to 3/cycle)
   - Logging, metrics, housekeeping

7. **Completion Check**
   - Mark collective complete when all tasks in terminal states

**Usage:**

```typescript
// Start collective runtime
await runtimeService.startCollective(collectiveId);

// Check if running
const isRunning = runtimeService.isRunning(collectiveId);

// Pause all activity
await runtimeService.pauseCollective(collectiveId);

// Resume execution
await runtimeService.resumeCollective(collectiveId);

// Stop runtime
await runtimeService.stopCollective(collectiveId);
```

---

### AgentExecutor (570 lines)

**Purpose:** Individual worker agent execution and conversation management.

**Responsibilities:**
- Start agent execution for a specific task
- Create and manage conversation-per-task
- Invoke agent with proper context
- Handle agent responses and tool calls
- Update task state based on agent progress
- Handle agent failures and retries
- Stop agent execution gracefully

**Agent Lifecycle:**

```
idle → working → completed/failed → idle
   ↓
blocked (if task has unmet dependencies)
```

**Execution Loop:**

1. **Create/Resume Conversation**
   - Find existing conversation or create new
   - Load conversation history
   - Set status to 'active'

2. **Build Task Context**
   - Task details, acceptance criteria
   - Dependencies (with states)
   - Blockers
   - Parent task context
   - Instructions

3. **Invoke Agent** (up to 50 iterations)
   - Pass conversation history
   - Get agent response
   - Add to conversation

4. **Handle Tool Calls**
   - File operations
   - Artifact creation/update
   - Message sending
   - Task queries

5. **Check Completion**
   - Task completed → `completeTask()`
   - Needs help → `escalateToHuman()` + pause
   - Max iterations → pause

6. **Conversation Summarization**
   - Trigger at 20+ messages
   - Preserve context while managing tokens

**Usage:**

```typescript
// Start agent on task
await agentExecutor.startAgentExecution(
  collectiveId,
  agentId,
  taskId,
);

// Stop specific agent
await agentExecutor.stopAgent(collectiveId, agentId);

// Stop all agents in collective
await agentExecutor.stopAllAgents(collectiveId);
```

---

## Integration

### Module Wiring

```typescript
// collective.module.ts
@Module({
  imports: [
    MongooseModule.forFeature([...]),
    AgentsModule, // For agent execution
  ],
  providers: [
    ...repositories,
    ...services,
    CollectiveRuntimeService,
    AgentExecutor,
  ],
})
export class CollectiveModule {}
```

### Service Integration

```typescript
// collective.service.ts
constructor(
  ...existing deps,
  private readonly runtime: CollectiveRuntimeService,
) {}

async startCollective(collectiveId: string) {
  // Update status in DB
  await this.collectivesRepo.updateStatus(id, CollectiveStatus.RUNNING);
  
  // Start runtime
  await this.runtime.startCollective(collectiveId);
}
```

---

## Message Types

| Type | Priority | Handler | Description |
|------|----------|---------|-------------|
| `task_update` | NORMAL | `handleTaskUpdateMessage()` | Agent reporting progress |
| `question` | HIGH | `handleQuestionMessage()` | Agent asking PM for help |
| `directive` | HIGH | `handleDirectiveMessage()` | PM instructing agent |
| `broadcast` | NORMAL | `handleBroadcastMessage()` | PM broadcasting to all |
| `deadlock_alert` | CRITICAL | `handleDeadlockAlertMessage()` | Deadlock detected |
| `decomposition_needed` | NORMAL | `handleDecompositionMessage()` | Task needs breakdown |

---

## Events Emitted

| Event Type | Actor | When |
|------------|-------|------|
| `runtime_started` | system | PM main loop starts |
| `runtime_stopped` | system | PM main loop stops |
| `collective_paused` | pm_agent | Collective frozen |
| `collective_resumed` | pm_agent | Collective unfrozen |
| `collective_completed` | pm_agent | All tasks in terminal states |
| `agent_execution_started` | agentId | Agent starts working on task |
| `agent_execution_error` | agentId | Agent execution fails |
| `task_completed` | agentId | Task successfully finished |
| `task_failed` | agentId | Task execution failed |
| `task_escalated` | agentId | Agent needs PM help |
| `pm_loop_error` | pm_agent | Error in PM main loop |
| `deadlock_detected` | pm_agent | Deadlock found in task graph |

---

## Configuration

```typescript
// PM Loop
PM_LOOP_INTERVAL_MS = 1000                    // 1 second
DEADLOCK_CHECK_INTERVAL_MS = 30000            // 30 seconds
MAX_TASKS_PER_ASSIGNMENT_CYCLE = 5            // Prevent overwhelming

// Agent Execution
MAX_AGENT_ITERATIONS = 50                      // Prevent infinite loops
CONVERSATION_SUMMARIZATION_TRIGGER = 20        // messages
```

---

## Conversation-per-Task

Each task gets an isolated conversation thread:

```typescript
{
  collectiveId: ObjectId,
  agentId: string,        // Which agent is working
  taskId: ObjectId,       // Which task
  messages: [
    { role: 'system', content: 'Task context...', timestamp },
    { role: 'user', content: 'Task instructions...', timestamp },
    { role: 'assistant', content: 'Agent response...', timestamp },
  ],
  summary: string,        // Auto-updated when messages > 20
  status: 'active' | 'paused' | 'completed',
}
```

**Benefits:**
- ✅ Isolated context per task (no cross-talk)
- ✅ Full conversation history for debugging
- ✅ Resumable (pause/resume collective)
- ✅ Summarizable (manage token count)
- ✅ Queryable (PM can review any conversation)

**PM Conversation:**
- Special conversation with `taskId: null`
- Used for PM-user interaction
- All escalations, deadlocks, and decomposition requests land here

---

## Error Handling

### Agent Execution Errors

```typescript
try {
  await executeAgent(...);
} catch (error) {
  // Log error event
  await eventsRepo.create({
    collectiveId,
    type: 'agent_execution_error',
    actor: agentId,
    metadata: { error: error.message, stack: error.stack },
  });
  
  // Mark task as failed
  await failTask(collectiveId, agentId, taskId, error.message);
  
  // Return agent to idle
  agentConfig.status = 'idle';
}
```

### PM Loop Errors

```typescript
try {
  await runPMMainLoop(collectiveId);
} catch (error) {
  logger.error(`Error in PM main loop:`, error);
  
  await eventsRepo.create({
    collectiveId,
    type: 'pm_loop_error',
    actor: 'pm_agent',
    metadata: { error: error.message },
  });
}
```

---

## Testing

### Unit Tests

- [ ] CollectiveRuntimeService
  - [ ] Start/stop/pause/resume lifecycle
  - [ ] PM main loop processing
  - [ ] Message handlers (all 6 types)
  - [ ] Deadlock detection trigger
  - [ ] Task assignment trigger
  - [ ] Completion check

- [ ] AgentExecutor
  - [ ] Start/stop agent execution
  - [ ] Conversation creation/resumption
  - [ ] Task context building
  - [ ] Complete/fail task
  - [ ] Escalation handling
  - [ ] Summarization trigger

### Integration Tests

- [ ] Full collective execution workflow
- [ ] Priority message processing
- [ ] Agent lifecycle transitions
- [ ] Pause/resume behavior
- [ ] Deadlock detection
- [ ] Conversation management

---

## TODO: Phase 2 Continuation

### 1. LLM Integration

**Location:** `agent-executor.service.ts:443`

```typescript
private async invokeAgent(
  agentConfig: any,
  messages: any[],
  collectiveId: string,
  taskId: string,
): Promise<AgentResponse>
```

**Current:** Returns mock response  
**Next:** Integrate with `AgentService` from `AgentsModule`

### 2. Tool Call Handlers

**Location:** `agent-executor.service.ts:470`

```typescript
private async handleToolCalls(
  collectiveId: string,
  agentId: string,
  taskId: string,
  toolCalls: any[],
): Promise<void>
```

**Current:** Logs tool calls  
**Next:** Implement handlers for file ops, artifacts, messages, task queries

### 3. Task Decomposition

**Location:** `collective-runtime.service.ts:375`

```typescript
private async performTaskDecomposition(
  collectiveId: string,
): Promise<void>
```

**Current:** Creates message for PM  
**Next:** Implement LLM-based decomposition (VISION → PORTFOLIO → etc.)

### 4. Conversation Summarization

**Location:** `agent-executor.service.ts:563`

```typescript
private async summarizeConversation(
  conversation: CollectiveConversationDocument,
): Promise<void>
```

**Current:** Truncates to recent 15 messages  
**Next:** Implement LLM-based summarization

### 5. PM Question Answering

**Location:** `collective-runtime.service.ts:481`

```typescript
private async handleQuestionMessage(
  collectiveId: string,
  message: CollectiveMessageDocument,
): Promise<void>
```

**Current:** Adds to PM conversation  
**Next:** Invoke PM agent to generate answer and send response

---

## See Also

- [Phase 2 Summary](../.docs/COLLECTIVE_PHASE2_SUMMARY.md) - Complete delivery documentation
- [Collective Design](../.docs/COLLECTIVE_AGENT_DESIGN.md) - Full architecture specification
- [Phase 1 Summary](../.docs/COLLECTIVE_PHASE1_SUMMARY.md) - Core infrastructure delivery
- [Main README](../README.md) - Collective Agent usage guide
