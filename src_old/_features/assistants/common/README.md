# Assistants Common Module

Shared infrastructure for all assistant types in the EnginEdge platform.

## Purpose

The CommonModule provides foundational services and entities that are used across all assistant types (React, Graph, and Genius agents). It implements the common CRUD operations, configuration management, and execution logic.

## Structure

```
common/
├── dto/
│   ├── assistant.dto.ts      # Request/response DTOs for assistants
│   └── execution.dto.ts      # Execution request DTOs
├── entities/
│   └── assistant.entity.ts   # MongoDB entity and schemas
├── repositories/
│   └── assistants.repository.ts  # Database operations
├── services/
│   ├── agent-config-factory.service.ts    # Creates agent configurations
│   ├── assistant-executor.service.ts      # Handles agent execution
│   ├── assistants-crud.service.ts         # CRUD operations
│   └── model-information.service.ts       # LLM model metadata
└── common.module.ts          # Module definition
```

## Key Components

### Entities

**Assistant Entity** (`assistant.entity.ts`)
- MongoDB schema for all assistant types
- Supports React agents, Graph agents, and block-based assistants
- Stores configuration, status, and metadata

### DTOs

**CreateAssistantDto** - Creating new assistants
**UpdateAssistantDto** - Updating existing assistants
**ExecuteAssistantDto** - Execution parameters (userId, conversationId, userMessage, etc.)
**AssistantFiltersDto** - Query filters for listing assistants

### Services

**AssistantsCrudService**
- Create, read, update, delete operations
- Validation and business logic
- Status management

**AgentConfigFactory**
- Converts assistant settings to agent configurations
- Maps block-based configs to ReAct agent settings
- Handles graph agent config generation

**AssistantExecutorService**
- Executes assistants using the agent infrastructure
- Manages conversation state
- Handles streaming responses
- Updates execution status

**ModelInformationService**
- Provides LLM model metadata
- Cost estimation
- Model capabilities and limits
- Provider information

### Repository

**AssistantsRepository**
- Direct MongoDB access
- Efficient queries with filters
- Aggregation pipelines

## Dependencies

- **AgentModule** - Core agent infrastructure
- **LLMModule** - Language model services
- **CoreServicesModule** - Logging and utilities

## Usage

Import CommonModule in your assistant-specific module:

```typescript
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  // ... your providers and controllers
})
export class YourAssistantModule {}
```

## Integration

This module is imported by:
- ReactModule (block-based builder)
- GraphModule (workflow agents)
- GeniusModule (meta-learning orchestrator)
- AssistantsModule (root module)

All assistant types share this common infrastructure, ensuring consistency in how assistants are stored, configured, and executed.
