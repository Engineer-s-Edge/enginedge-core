# Collective Agent Communication System

Advanced message queue and inter-agent communication infrastructure.

## Components

### MessageQueueService (520 lines)

**Purpose:** Low-level message queue management with reliable delivery.

**Features:**
- Priority-based message delivery (CRITICAL → BACKGROUND)
- Automatic retry logic (up to 3 attempts with exponential backoff)
- Timeout detection (priority-dependent timeouts)
- Message threading (reply-to support)
- Delivery confirmation and status tracking
- Message archival (30-day retention)
- Full-text search
- Message analytics

**Key Methods:**

```typescript
// Send single message
await messageQueue.sendMessage(
  collectiveId,
  fromAgentId,
  toAgentId,
  content,
  { type, priority, metadata }
);

// Broadcast to all agents
await messageQueue.broadcastMessage(
  collectiveId,
  fromAgentId,
  content,
  { type, priority, excludeAgentIds }
);

// Mark message delivered
await messageQueue.markDelivered(messageId);

// Retry failed message
await messageQueue.retryMessage(messageId);

// Check for timeouts
await messageQueue.checkMessageTimeouts(collectiveId);

// Get message thread
const thread = await messageQueue.getMessageThread(messageId);

// Get statistics
const stats = await messageQueue.getMessageStats(collectiveId);
```

**Timeout Configuration:**

| Priority | Timeout |
|----------|---------|
| CRITICAL | 1 minute |
| HIGH | 5 minutes |
| NORMAL | 15 minutes |
| LOW | 1 hour |
| BACKGROUND | 24 hours |

**Retry Configuration:**
- Max attempts: 3
- Backoff delays: 1s, 5s, 15s (exponential)

---

### CommunicationService (520 lines)

**Purpose:** High-level communication patterns for agents and PM.

**Features:**
- Agent-to-PM communication (questions, escalations, progress reports)
- PM-to-agent directives
- Agent-to-agent messaging (help requests, info sharing)
- Broadcast messages
- Task-specific messaging
- Group conversations
- Message threading
- Communication analytics

**Key Methods:**

```typescript
// Agent asks PM
await comm.askPM(collectiveId, agentId, question, { taskId });

// PM sends directive
await comm.pmDirective(collectiveId, agentId, directive, { taskId });

// PM broadcasts
await comm.pmBroadcast(collectiveId, message, { priority });

// Agent reports progress
await comm.reportProgress(collectiveId, agentId, taskId, progress, {
  percentage: 75
});

// Agent requests help from another agent
await comm.requestHelp(
  collectiveId,
  fromAgentId,
  toAgentId,
  helpRequest,
  { taskId }
);

// Agent shares info
await comm.shareInfo(collectiveId, fromAgentId, toAgentId, info);

// Escalate to PM (CRITICAL)
await comm.escalateToPM(collectiveId, agentId, issue, {
  taskId,
  reason: 'Blocker detected'
});

// Reply to message (threaded)
await comm.replyToMessage(
  collectiveId,
  replyToMessageId,
  fromAgentId,
  content
);

// Start group conversation
const conversationId = await comm.startGroupConversation(
  collectiveId,
  [agentId1, agentId2, agentId3],
  'Sprint Planning',
  'Let's discuss the upcoming tasks...'
);

// Send to group
await comm.sendToGroup(
  collectiveId,
  conversationId,
  fromAgentId,
  message
);

// Get agent stats
const stats = await comm.getAgentCommStats(collectiveId, agentId);
// Returns: messagesSent, messagesReceived, questionsAsked, escalations, avgResponseTime
```

---

## Message Types

| Type | Priority | Use Case |
|------|----------|----------|
| `message` | NORMAL | General communication |
| `question` | HIGH | Agent asking PM for help |
| `directive` | HIGH | PM instructing agent |
| `broadcast` | NORMAL | PM broadcasting to all |
| `task_update` | NORMAL | Agent progress report |
| `help_request` | NORMAL | Agent asking another agent |
| `info_share` | LOW | Sharing information |
| `escalation` | CRITICAL | Issue requiring PM attention |
| `task_notification` | LOW | System task change notifications |
| `reply` | Inherited | Reply to previous message |
| `group_message` | NORMAL | Group conversation |

---

## Communication Patterns

### Pattern 1: Agent asks PM for help

```typescript
// Agent side
await communicationService.askPM(
  collectiveId,
  'agent_001',
  'I'm stuck on task XYZ. The API is returning 500 errors.',
  { taskId: 'task_123' }
);

// Creates:
// - HIGH priority message to pm_agent
// - Entry in PM conversation
// - Agent pauses and waits for PM response

// PM side (handled by runtime)
// - Message appears in PM conversation
// - PM reviews and responds with directive
await communicationService.pmDirective(
  collectiveId,
  'agent_001',
  'Check the logs at /var/log/api.log and look for authentication errors.',
  { taskId: 'task_123' }
);

// Agent receives directive in task conversation
// Agent resumes work with new guidance
```

### Pattern 2: Progress reporting

```typescript
// Agent reports progress periodically
await communicationService.reportProgress(
  collectiveId,
  'agent_002',
  'task_456',
  'Completed data migration, starting validation phase',
  { percentage: 60 }
);

// PM sees progress in conversation
// Message: "[60%] Completed data migration, starting validation phase"
```

### Pattern 3: Agent-to-agent collaboration

```typescript
// Agent A needs help from Agent B
await communicationService.requestHelp(
  collectiveId,
  'agent_003',
  'agent_004',
  'Can you share the database schema you created for the users table?',
  { taskId: 'task_789' }
);

// Agent B responds
await communicationService.replyToMessage(
  collectiveId,
  originalMessageId,
  'agent_004',
  'Sure! Here's the schema: CREATE TABLE users...'
);

// Creates threaded conversation
```

### Pattern 4: Escalation

```typescript
// Agent detects critical issue
await communicationService.escalateToPM(
  collectiveId,
  'agent_005',
  'Deployment failed: prod database connection refused',
  {
    taskId: 'task_999',
    reason: 'Production blocker'
  }
);

// Creates:
// - CRITICAL priority message
// - Event: task_escalated
// - Formatted PM conversation entry: "🚨 ESCALATION from agent_005: ..."
// - Agent pauses execution
```

### Pattern 5: Broadcast

```typescript
// PM broadcasts important update
await communicationService.pmBroadcast(
  collectiveId,
  'Security patch deployed. All agents should restart their work.',
  { priority: 'HIGH' }
);

// All agents receive message
// PM conversation logs: "Broadcast sent: Security patch..."
```

### Pattern 6: Group conversation

```typescript
// Start group discussion
const groupId = await communicationService.startGroupConversation(
  collectiveId,
  ['agent_001', 'agent_002', 'agent_003'],
  'API Design Review',
  'Let's discuss the REST API endpoints we need for the user service.'
);

// Agents participate
await communicationService.sendToGroup(
  collectiveId,
  groupId,
  'agent_001',
  'I propose we use /api/v1/users for the base endpoint'
);

await communicationService.sendToGroup(
  collectiveId,
  groupId,
  'agent_002',
  'Agreed. Should we include pagination?'
);
```

---

## Message Lifecycle

```
CREATE
  ↓
PENDING (queued)
  ↓
DELIVERED (agent received)
  ↓
READ (agent processed)
  ↓
ARCHIVED (after 30 days)
  ↓
DELETED (manual cleanup)

Or:

CREATE
  ↓
PENDING
  ↓
TIMEOUT (no delivery)
  ↓
RETRY (attempt 1, 2, 3)
  ↓
FAILED (max retries exceeded)
```

---

## Message Status

| Status | Description |
|--------|-------------|
| `pending` | Queued, awaiting delivery |
| `processing` | Currently being processed |
| `delivered` | Received by target agent |
| `read` | Agent acknowledged/processed |
| `failed` | Delivery failed after retries |

---

## Integration with Runtime

The communication system integrates with CollectiveRuntimeService:

```typescript
// In PM main loop
private async handleQuestionMessage(
  collectiveId: string,
  message: CollectiveMessageDocument,
): Promise<void> {
  // Question already added to PM conversation by CommunicationService
  
  // TODO: Invoke PM agent to answer
  const answer = await this.invokePMAgent(message.content);
  
  // Send directive back to agent
  await this.communicationService.pmDirective(
    collectiveId,
    message.fromAgentId,
    answer,
    { taskId: message.metadata.taskId }
  );
}
```

---

## Analytics

### Message Statistics

```typescript
const stats = await messageQueue.getMessageStats(collectiveId);
/*
{
  total: 1523,
  byStatus: {
    delivered: 1420,
    pending: 50,
    failed: 3,
    read: 1350
  },
  byPriority: {
    CRITICAL: 12,
    HIGH: 234,
    NORMAL: 1100,
    LOW: 150,
    BACKGROUND: 27
  },
  byType: {
    question: 45,
    task_update: 567,
    directive: 123,
    ...
  },
  avgDeliveryTime: 1234, // milliseconds
  failureRate: 0.002 // 0.2%
}
*/
```

### Agent Communication Statistics

```typescript
const stats = await communicationService.getAgentCommStats(collectiveId, 'agent_001');
/*
{
  messagesSent: 123,
  messagesReceived: 98,
  questionsAsked: 5,
  escalations: 2,
  avgResponseTime: 12345 // milliseconds
}
*/
```

---

## Archival and Cleanup

### Automatic Archival

```typescript
// Archive messages older than 30 days
const archivedCount = await messageQueue.archiveOldMessages(collectiveId);
// Archived messages are marked but not deleted
```

### Manual Cleanup

```typescript
// Delete archived messages (permanent)
const deletedCount = await messageQueue.deleteArchivedMessages(collectiveId);

// Or delete all messages (collective cleanup)
const totalDeleted = await messageQueue.deleteAllMessages(collectiveId);
```

---

## Search

### Full-Text Search

```typescript
// Search messages
const results = await messageQueue.searchMessages(
  collectiveId,
  'database schema',
  {
    agentId: 'agent_001', // Optional: filter by agent
    priority: 'HIGH',     // Optional: filter by priority
    type: 'question',     // Optional: filter by type
    limit: 20             // Optional: result limit
  }
);
```

---

## Error Handling

### Retry Logic

Messages that fail to deliver are automatically retried:

1. **Attempt 1:** Immediate retry after 1 second
2. **Attempt 2:** Retry after 5 seconds
3. **Attempt 3:** Retry after 15 seconds
4. **Permanent Failure:** Mark as failed, log event

### Timeout Detection

Messages that remain pending beyond their timeout threshold are automatically marked for retry:

```typescript
// Run periodically (e.g., in PM main loop)
const timedOutCount = await messageQueue.checkMessageTimeouts(collectiveId);
```

---

## Testing

### Unit Tests

- [ ] MessageQueueService
  - [ ] `sendMessage()` - creates message with correct priority
  - [ ] `broadcastMessage()` - sends to all agents except sender
  - [ ] `markDelivered()` - updates status and timestamp
  - [ ] `retryMessage()` - increments retry count
  - [ ] `checkMessageTimeouts()` - detects timed-out messages
  - [ ] `getMessageThread()` - builds conversation thread
  - [ ] `getMessageStats()` - calculates correct statistics
  - [ ] `archiveOldMessages()` - archives old messages
  - [ ] `searchMessages()` - full-text search works

- [ ] CommunicationService
  - [ ] `askPM()` - creates HIGH priority question
  - [ ] `pmDirective()` - sends directive to agent
  - [ ] `pmBroadcast()` - broadcasts to all agents
  - [ ] `reportProgress()` - sends progress update
  - [ ] `requestHelp()` - agent-to-agent help request
  - [ ] `escalateToPM()` - creates CRITICAL escalation
  - [ ] `replyToMessage()` - creates threaded reply
  - [ ] `startGroupConversation()` - creates group
  - [ ] `getAgentCommStats()` - calculates correct stats

### Integration Tests

- [ ] End-to-end message delivery
- [ ] Retry logic triggers on failures
- [ ] Timeout detection and handling
- [ ] Message threading works correctly
- [ ] Broadcast delivers to all agents
- [ ] Group conversations maintain participant list
- [ ] Statistics are accurate

---

## See Also

- [Phase 3 Summary](../.docs/COLLECTIVE_PHASE3_SUMMARY.md) - Complete delivery documentation
- [Runtime README](../runtime/README.md) - PM main loop and agent execution
- [Collective Design](../.docs/COLLECTIVE_AGENT_DESIGN.md) - Full architecture specification
- [Main README](../README.md) - Collective Agent usage guide
