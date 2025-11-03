# Collective Agent System

**Multi-Agent Coordination System with Project Manager Orchestration**

## 🎯 Overview

The Collective Agent System is an advanced multi-agent coordination platform that simulates a complete organizational structure. Unlike centralized multi-agent systems, this collective operates as a true peer-to-peer team where each agent has independent reasoning capabilities, coordinated by a specialized Project Manager (PM) agent.

### Key Features

- ✅ **No Central LLM**: Each agent operates independently with its own LLM instance
- ✅ **Dynamic Task Distribution**: Agents claim tasks based on capability and availability
- ✅ **Hierarchical Task Decomposition**: 8-level task tree (Vision → Subtask)
- ✅ **Deadlock Detection & Recovery**: Algorithmic cycle detection with PM intervention
- ✅ **Organic Communication**: Message queues with priority levels + shared project board
- ✅ **Conversation-Per-Task**: Full context preservation with resume capability
- ✅ **Artifact Management**: Versioned, locked, searchable shared resources
- ✅ **Human-in-the-Loop**: Real-time oversight with freeze/resume/intervention controls

## 📁 Architecture

```
features/assistants/collective/
├── entities/                    # MongoDB schemas
│   ├── collective.entity.ts           # Collective configuration
│   ├── collective-task.entity.ts      # Task hierarchy
│   ├── collective-message.entity.ts   # Message queue
│   ├── collective-artifact.entity.ts  # Shared artifacts
│   ├── collective-conversation.entity.ts  # Agent conversations
│   └── collective-event.entity.ts     # Audit log
├── repositories/               # Data access layer
│   ├── collectives.repository.ts
│   ├── collective-tasks.repository.ts
│   ├── collective-messages.repository.ts
│   ├── collective-artifacts.repository.ts
│   ├── collective-conversations.repository.ts
│   └── collective-events.repository.ts
├── services/                   # Business logic
│   ├── collective.service.ts          # Main orchestration service
│   ├── pm-tools.service.ts            # PM agent special tools
│   ├── deadlock-detection.service.ts  # Cycle detection algorithm
│   └── task-assignment.service.ts     # Algorithmic task assignment
├── dto/                        # API contracts
│   ├── collective.dto.ts
│   ├── task.dto.ts
│   ├── message.dto.ts
│   └── artifact.dto.ts
├── controllers/                # REST endpoints
│   └── collective.controller.ts
└── collective.module.ts        # Module configuration
```

## 🏗️ System Components

### 1. Collective

A collective represents a complete multi-agent organization working toward a shared vision.

**Properties:**
- `name`: Human-readable collective name
- `description`: Purpose and scope
- `vision`: Level 0 - the high-level goal (e.g., "Build a search engine like Google")
- `agents[]`: Predefined roster of ReAct/Graph agents with capabilities
- `pmAgent`: Project Manager agent configuration
- `status`: `initializing | running | paused | completed | failed`

### 2. Task Hierarchy (8 Levels)

Tasks are organized in a tree structure from broad vision to atomic subtasks:

| Level | Scope | Example |
|-------|-------|---------|
| 0 | Vision/Mission | "Organize the world's information" |
| 1 | Portfolio/Business Line | "Search", "Cloud", "Ads" |
| 2 | Program/Initiative | "Search Infrastructure" |
| 3 | Epic | "Build Distributed Crawler Framework" |
| 4 | Feature/Capability | "Link Analysis Engine" |
| 5 | Story/Deliverable | "Implement caching layer" |
| 6 | Task | "Write concurrency handler" |
| 7 | Subtask | "Write unit tests" |

**Task State Machine:**
```
unassigned → assigned → in_progress → completed
                ↓           ↓
              blocked    failed
                ↓           ↓
            delegated   cancelled
                          review
```

### 3. PM Agent Special Tools

The PM agent has exclusive tools for orchestrating the collective:

**Task Management:**
- `createTask()` - Add new tasks to project board
- `updateTask()` - Modify task properties
- `assignTask()` - Assign task to specific agent
- `reassignTask()` - Move task from one agent to another
- `cancelTask()` - Stop task execution

**Agent Monitoring:**
- `viewAgentStatus()` - Check agent's current work
- `viewAgentConversation()` - Read agent's task conversation
- `sendDirective()` - Send instructions to agent's message queue
- `broadcastMessage()` - Message multiple agents

**Error Handling:**
- `retryTaskWithHints()` - Retry failed task with guidance
- `escalateToHuman()` - Notify user of issues

**Deadlock Resolution:**
- `detectDeadlocks()` - Find circular dependencies
- `resolveDeadlock()` - Fix deadlock via reprioritization or directives

### 4. Message Queue System

Each agent has a personal message queue with priority levels:

**Priorities:**
- `CRITICAL` - Human messages (pause other work)
- `HIGH` - Deadlock fixes, PM directives
- `NORMAL` - Regular delegation/help requests
- `LOW` - Info requests
- `BACKGROUND` - PM task decomposition (special low priority)

**Message Types:**
- `delegation` - Agent creates subtask for another agent
- `help_request` - Agent stuck, needs assistance
- `info_request` - Query for information
- `pm_directive` - PM gives instructions
- `status_update` - Progress report
- `result` - Task completion result
- `human_message` - User input

### 5. Deadlock Detection

The system detects circular dependencies using DFS cycle detection:

```typescript
// Example deadlock:
Task A blocked by Task B
Task B blocked by Task C
Task C blocked by Task A  // Cycle detected!
```

**Resolution Strategies:**
1. **Reprioritize** - Increase priority of blocking tasks
2. **PM Directive** - PM tells agent to work on blocking task first
3. **Escalate to Human** - Complex deadlocks require user decision

### 6. Artifact Management

Shared resources with version control:

**Features:**
- **Versioning** - Each update creates new version
- **Locking** - Prevent concurrent edits (atomic operations)
- **Searchability** - Full-text search across all artifacts
- **Linking** - Artifacts tied to tasks
- **Custom Types** - Code, docs, data, designs, test results, etc.

### 7. Conversation Management

Each task gets its own conversation:

**Features:**
- **Full History** - All messages preserved
- **Auto-Summarization** - PM can review progress
- **Resume Capability** - Paused tasks can be resumed
- **Search** - Agents search their own conversations, PM searches all

## 🔄 PM Main Loop

The PM agent runs a continuous prioritized event loop:

```typescript
while (collective.status === 'running') {
  // 1. Handle human messages (CRITICAL - pause all other work)
  if (humanMessage) {
    await handleHumanMessage(humanMessage);
    await propagateToRelevantConversations(humanMessage);
    continue;
  }
  
  // 2. Resolve deadlocks (HIGH priority)
  const deadlocks = await detectDeadlocks();
  if (deadlocks.length > 0) {
    await handleDeadlock(deadlocks[0]); // One at a time
    continue;
  }
  
  // 3. Handle failed/stuck agents (MEDIUM priority)
  const failedAgent = await checkFailedAgents();
  if (failedAgent) {
    await handleFailedAgent(failedAgent); // One at a time
    continue;
  }
  
  // 4. Process regular updates (NORMAL priority)
  await processTaskUpdates();
  
  // 5. Task decomposition (BACKGROUND priority)
  await continueTaskDecomposition();
}
```

## 🤖 Agent Behavior

### Idle Agent Algorithm

```typescript
while (agent.status === 'idle') {
  // 1. Check personal message queue first
  const message = await agent.checkMessageQueue();
  if (message) {
    await agent.handleMessage(message);
    continue;
  }
  
  // 2. Queue empty - wait for task assignment algorithm
  const task = await waitForTaskAssignment();
  if (task) {
    await agent.startTaskConversation(task);
  }
}
```

### Task Assignment (Algorithmic, not PM)

```typescript
// System assigns ONE task only if queue is empty
for (const idleAgent of idleAgents) {
  const availableTasks = await findAvailableTasks(agent.id);
  if (availableTasks.length > 0) {
    // Atomic operation - prevents race conditions
    await assignTask(availableTasks[0], agent.id);
  }
}
```

## 📡 API Endpoints

### Collective Management

```http
POST   /assistants/collective          # Create collective
POST   /assistants/collective/:id/start    # Start collective
POST   /assistants/collective/:id/pause    # Pause collective
POST   /assistants/collective/:id/resume   # Resume collective
GET    /assistants/collective              # Get user's collectives
GET    /assistants/collective/:id          # Get collective details
DELETE /assistants/collective/:id          # Delete collective
```

### Task Management

```http
GET    /assistants/collective/:id/tasks           # Get all tasks
GET    /assistants/collective/:id/tasks/hierarchy # Get task tree
POST   /assistants/collective/tasks               # Create task manually
```

### Monitoring

```http
GET    /assistants/collective/:id/events                    # Audit log
GET    /assistants/collective/:id/deadlocks                 # Detect deadlocks
GET    /assistants/collective/:id/agents/:agentId/status   # Agent status
```

## 🚀 Usage Example

### 1. Create a Collective

```typescript
const collective = await collectiveService.createCollective(userId, {
  name: 'Search Engine Development',
  description: 'Build a Google-like search engine',
  vision: 'Organize the world\'s information and make it universally accessible',
  agents: [
    {
      id: 'researcher-1',
      name: 'Research Specialist',
      type: 'react',
      description: 'Analyzes technical requirements and designs',
      capabilities: ['research', 'analysis', 'design'],
      tools: [/* research tools */],
      reActConfig: {/* ... */},
    },
    {
      id: 'developer-1',
      name: 'Backend Developer',
      type: 'react',
      description: 'Implements server-side logic',
      capabilities: ['coding', 'backend', 'api'],
      tools: [/* coding tools */],
      reActConfig: {/* ... */},
    },
    {
      id: 'qa-1',
      name: 'Quality Assurance',
      type: 'graph',
      description: 'Tests and validates implementations',
      capabilities: ['testing', 'qa', 'validation'],
      tools: [/* testing tools */],
      graphConfig: {/* ... */},
    },
  ],
  pmAgent: {
    id: 'pm',
    reActConfig: {/* PM configuration */},
    specialTools: [/* PM tools */],
  },
});
```

### 2. Start the Collective

```typescript
await collectiveService.startCollective(collective.id);

// PM will:
// 1. Break down vision into portfolios
// 2. Create programs, epics, features, stories, tasks
// 3. Assign tasks to agents based on capabilities
// 4. Monitor progress and handle errors
// 5. Detect and resolve deadlocks
```

### 3. Monitor Progress

```typescript
// Get task hierarchy
const taskTree = await collectiveService.getTaskHierarchy(collective.id);

// Check for deadlocks
const deadlocks = await collectiveService.detectDeadlocks(collective.id);

// View agent status
const status = await collectiveService.getAgentStatus(collective.id, 'developer-1');
// {
//   agentId: 'developer-1',
//   currentTasks: [{ id: '...', title: 'Implement API endpoint', state: 'in_progress' }],
//   messageQueueCount: 2
// }

// View audit log
const events = await collectiveService.getCollectiveEvents(collective.id);
```

### 4. Human Intervention

```typescript
// Pause collective
await collectiveService.pauseCollective(collective.id);

// Create manual task
await collectiveService.createTask({
  collectiveId: collective.id,
  level: 6, // Task level
  title: 'Fix critical bug',
  description: 'Memory leak in search indexer',
  category: 'task',
  allowedAgentIds: ['developer-1'],
});

// Resume collective
await collectiveService.resumeCollective(collective.id);
```

## 🧪 Testing Strategy

### Unit Tests

- Repository CRUD operations
- PM tools functionality
- Deadlock detection algorithm
- Task assignment logic

### Integration Tests

- Multi-agent task execution
- Message queue routing
- Artifact version control
- Conversation save/resume

### E2E Tests

- Complete collective workflow (vision → subtasks)
- Deadlock scenarios
- Human intervention flows
- Error recovery

## 📊 Database Collections

### `collectives`
- Collective configuration
- Agent roster
- PM configuration
- Status tracking

### `collective_tasks`
- Task hierarchy
- State machine
- Dependencies
- Assignments

### `collective_messages`
- Message queue entries
- Priority levels
- Conversation threading

### `collective_artifacts`
- Shared resources
- Version history
- Lock management

### `collective_conversations`
- Agent task conversations
- Full message history
- Auto-generated summaries

### `collective_events`
- Audit log
- All actions tracked
- Debugging support

## 🔧 Configuration

### Environment Variables

```bash
# MongoDB connection
MONGO_URI=mongodb://localhost:27017/enginedge

# PM agent settings
PM_LOOP_INTERVAL=5000  # milliseconds
PM_MAX_TASK_DEPTH=7    # Maximum task hierarchy depth
```

### PM Agent Configuration

```typescript
{
  id: 'pm',
  reActConfig: {
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 4000,
    systemPrompt: `You are a Project Manager agent...`,
  },
  specialTools: [
    'createTask',
    'updateTask',
    'assignTask',
    'cancelTask',
    'reassignTask',
    'viewAgentStatus',
    'sendDirective',
    'broadcastMessage',
    'retryTaskWithHints',
    'escalateToHuman',
  ],
}
```

## 🎯 Best Practices

### 1. Agent Capability Matching

Define clear capabilities for each agent:

```typescript
{
  id: 'backend-dev',
  capabilities: ['nodejs', 'typescript', 'mongodb', 'api-design'],
}
```

Then assign tasks only to agents with matching capabilities.

### 2. Task Decomposition

PM should create tasks layer-by-layer:
- Levels 0-3: Think holistically about the entire vision
- Levels 4-7: Focus narrowly on specific feature/story

### 3. Avoid Deadlocks

- Define clear task dependencies upfront
- Use PM directives to break potential cycles
- Escalate complex deadlocks to human operator

### 4. Artifact Organization

Use consistent naming and tagging:

```typescript
{
  name: 'SearchAPI_v3.ts',
  type: 'code',
  tags: ['api', 'backend', 'search', 'v3'],
}
```

### 5. Human Oversight

Monitor critical events:
- Deadlock detection
- Failed tasks (>3 retries)
- PM escalations

## 🔮 Future Enhancements

- **ML-based Task Priority** - Learn optimal task ordering
- **Predictive Deadlock Prevention** - Detect potential cycles before they form
- **Agent Pair Programming** - Two agents collaborate on one task
- **Consensus Voting** - Major decisions require multiple agent agreement
- **Collective-to-Collective** - Meta-organizations with hierarchical collectives
- **Dynamic Agent Spawning** - Add agents mid-execution (with safeguards)

## 📚 References

- [Design Document](/.docs/COLLECTIVE_AGENT_DESIGN.md) - Complete architecture specification
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) - Task-based autonomous agents
- [CrewAI](https://github.com/joaomdmoura/crewAI) - Role-based multi-agent systems
- [LangGraph](https://langchain-ai.github.io/langgraph/) - Graph-based agent orchestration

---

**Built with ❤️ using NestJS + MongoDB + TypeScript**
