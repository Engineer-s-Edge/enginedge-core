# Assistants Feature Module

Unified module for all assistant types in the EnginEdge platform.

## Overview

The Assistants module provides a comprehensive framework for creating, managing, and executing AI agents. It's organized into specialized submodules for different agent architectures:

- **Common**: Shared infrastructure (entities, DTOs, CRUD, execution)
- **React**: ReAct (Reasoning + Acting) agents with block-based builder
- **Graph**: Graph-based workflow agents with DAG execution
- **Genius**: Meta-learning orchestrator that commands Expert Agents

## Architecture

```
features/assistants/
├── common/                    # Shared infrastructure
│   ├── dto/                  # Common DTOs
│   ├── entities/             # MongoDB entities
│   ├── repositories/         # Database operations
│   ├── services/             # Shared services
│   └── common.module.ts
├── react/                     # ReAct agents
│   ├── controllers/          # Block-based builder API
│   └── react.module.ts
├── graph/                     # Graph agents
│   ├── controllers/          # Execution control & builder
│   ├── services/             # Graph management
│   ├── dto/                  # Graph-specific DTOs
│   └── graph.module.ts
├── genius/                    # Genius meta-learning
│   ├── controllers/          # Learning control, topics, escalations
│   ├── services/             # Orchestration services
│   ├── dto/                  # Genius-specific DTOs
│   └── genius.module.ts
├── controllers/
│   └── assistants.controller.ts  # Root-level CRUD for all assistants
├── assistants.service.ts     # Unified service interface
└── assistants.module.ts      # Main module
```

## Module Organization

### CommonModule

Provides foundational services used by all assistant types:

- **AssistantsRepository**: MongoDB operations
- **AgentConfigFactory**: Converts settings to agent configs
- **AssistantExecutorService**: Executes agents
- **AssistantsCrudService**: CRUD operations
- **ModelInformationService**: LLM model metadata

### ReactModule

ReAct agents with block-based builder:

- Chain-of-thought reasoning
- Tool execution
- Memory management
- Visual block-based configuration
- Templates for common use cases

### GraphModule

Workflow agents with DAG execution:

- Directed acyclic graph workflows
- Conditional branching
- Parallel execution
- User interaction points (input/approval)
- Checkpointing for long-running jobs

### GeniusModule

Meta-learning orchestrator:

- Commands multiple Expert Agents
- 3 learning modes (User-Directed, Autonomous, Scheduled)
- Quality validation pipeline
- News integration from datalake
- User escalation system

## Root-Level API

### AssistantsController

Provides unified CRUD endpoints for all assistant types:

```http
POST   /assistants                    # Create assistant
GET    /assistants                    # List assistants
GET    /assistants/:name              # Get specific assistant
PUT    /assistants/:name              # Update assistant
DELETE /assistants/:name              # Delete assistant
POST   /assistants/:name/execute      # Execute assistant
POST   /assistants/:name/execute/stream  # Stream execution
POST   /assistants/query              # Advanced query
```

### Model Information Endpoints

```http
GET /assistants/models                         # List all models
GET /assistants/models/providers               # List providers
GET /assistants/models/provider/:provider      # Models by provider
GET /assistants/models/category/:category      # Models by category
GET /assistants/models/capability/:capability  # Models by capability
GET /assistants/models/search                  # Search models
GET /assistants/models/cost-range              # Filter by cost
GET /assistants/models/:provider/:modelId/details  # Model details
POST /assistants/models/:modelId/calculate-cost    # Cost estimation
```

## Specialized APIs

### React Builder
```
POST /assistants/builder/blocks
POST /assistants/builder/templates
POST /assistants/builder/create-from-blocks
POST /assistants/builder/create-from-template/:templateId
POST /assistants/builder/validate
```

### Graph Control & Builder
```
GET  /assistants/graph/:conversationId/state
POST /assistants/graph/:conversationId/pause
POST /assistants/graph/:conversationId/resume
POST /assistants/graph/:conversationId/nodes/:nodeId/input
POST /assistants/graph/:conversationId/nodes/:nodeId/approval

GET  /assistants/builder/graph/node-templates
GET  /assistants/builder/graph/edge-types
POST /assistants/builder/graph/create
POST /assistants/builder/graph/validate
```

### Genius Learning & Management
```
POST /genius/start/user-directed
POST /genius/start/autonomous
POST /genius/stop
GET  /genius/status
GET  /genius/statistics

POST /genius/schedule
GET  /genius/schedule
PATCH /genius/schedule/:jobId

POST /topics
GET  /topics
POST /topics/seed

GET  /escalations
GET  /escalations/active
POST /escalations/:escalationId/resolve
```

## Assistant Types

### 1. ReAct Agent (Type: `react` or `react_agent`)

**Best for**: General conversational AI, customer support, research tasks

**Key Features**:
- Chain-of-thought reasoning
- Tool integration
- Memory management
- Easy configuration via blocks

**Example Use Cases**:
- Customer support chatbot
- Research assistant
- Code debugging helper
- Data analysis assistant

### 2. Graph Agent (Type: `graph` or `graph_agent`)

**Best for**: Complex workflows, approval processes, conditional logic

**Key Features**:
- Visual workflow design
- Conditional branching
- Parallel execution
- Human-in-the-loop

**Example Use Cases**:
- Multi-stage approval workflows
- Document review pipelines
- Data validation processes
- ETL workflows with conditional logic

### 3. Genius Agent (Type: `genius`)

**Best for**: Continuous learning, knowledge graph expansion, meta-research

**Key Features**:
- Autonomous learning
- Expert agent orchestration
- Quality validation
- News integration
- Escalation management

**Example Use Cases**:
- Continuous knowledge base expansion
- Research automation
- Topic discovery and tracking
- Multi-expert coordination

## Creating an Assistant

### Example: Create a ReAct Agent

```typescript
POST /assistants

{
  "name": "support-bot",
  "type": "react",
  "description": "Customer support assistant",
  "settings": {
    "intelligence": {
      "llm": {
        "provider": "openai",
        "model": "gpt-4",
        "temperature": 0.7
      }
    },
    "tools": ["web-search", "knowledge-base"],
    "memory": {
      "enabled": true,
      "type": "buffer"
    }
  }
}
```

### Example: Create a Graph Agent

```typescript
POST /assistants

{
  "name": "approval-workflow",
  "type": "graph",
  "description": "Document approval process",
  "graphConfig": {
    "nodes": [
      { "id": "start", "type": "input" },
      { "id": "review", "type": "llm" },
      { "id": "approve", "type": "approval" },
      { "id": "notify", "type": "tool" }
    ],
    "edges": [
      { "from": "start", "to": "review" },
      { "from": "review", "to": "approve" },
      { "from": "approve", "to": "notify", "condition": "approved === true" }
    ]
  }
}
```

## Executing an Assistant

```typescript
POST /assistants/:name/execute

{
  "userId": "u_123",
  "conversationId": "conv_456",
  "userMessage": "Hello, I need help with my order",
  "contextParams": {
    "orderId": "ORD-789"
  }
}
```

## Streaming Execution

```typescript
POST /assistants/:name/execute/stream

// Returns Server-Sent Events (SSE)
data: {"chunk": "I'd be happy to help", "type": "chunk"}
data: {"chunk": " with your order.", "type": "chunk"}
data: {"type": "done"}
```

## Dependencies

- **MongooseModule**: Database persistence
- **AgentModule**: Core agent infrastructure
- **LLMModule**: Language model services
- **CoreServicesModule**: Logging and utilities

## Testing

Each submodule has comprehensive test coverage:

```bash
# Test all assistants
npm test -- assistants

# Test specific modules
npm test -- assistants/common
npm test -- assistants/react
npm test -- assistants/graph
npm test -- assistants/genius
```

## Future Roadmap

- [ ] Multi-agent collaboration framework
- [ ] Advanced analytics and insights
- [ ] A/B testing for agent configurations
- [ ] Agent marketplace (share templates)
- [ ] Performance optimization dashboard
- [ ] Cost tracking and budgeting
- [ ] Custom tool builder
- [ ] Agent version control
