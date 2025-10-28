# Assistants Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AssistantsModule                                │
│                  (Main orchestrator for all assistants)                 │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  │                │                │
         ┌────────▼────────┐ ┌────▼─────┐ ┌───────▼────────┐
         │  CommonModule   │ │ Submodules │ │ Root Services  │
         │  (Shared infra) │ │            │ │                │
         └─────────────────┘ └────┬───────┘ └────────────────┘
                                  │
                  ┌───────────────┼───────────────┐
                  │               │               │
         ┌────────▼────────┐ ┌───▼──────┐ ┌─────▼──────────┐
         │  ReactModule    │ │GraphModule│ │ GeniusModule   │
         │ (Block builder) │ │  (DAG)    │ │ (Meta-learning)│
         └─────────────────┘ └───────────┘ └────────────────┘
```

## Module Dependency Graph

```
AssistantsModule
├── imports
│   ├── CoreServicesModule (logging, utilities)
│   ├── CommonModule ──┐
│   ├── ReactModule    ├── all import CommonModule
│   ├── GraphModule    │
│   └── GeniusModule ──┘
├── controllers
│   └── AssistantsController (root CRUD for all assistants)
└── providers
    └── AssistantsService (unified interface to all assistant types)
```

## CommonModule Internal Structure

```
CommonModule
├── imports
│   ├── MongooseModule.forFeature([Assistant])
│   ├── AgentModule.forFeature()
│   ├── LLMModule.register()
│   └── CoreServicesModule
├── providers (exported)
│   ├── AssistantsRepository (MongoDB operations)
│   ├── AgentConfigFactory (settings → agent configs)
│   ├── AssistantsCrudService (CRUD operations)
│   ├── AssistantExecutorService (execution logic)
│   └── ModelInformationService (LLM metadata)
└── exports
    └── All providers (for use by submodules)
```

## ReactModule Internal Structure

```
ReactModule
├── imports
│   ├── CommonModule (shared services)
│   └── CoreServicesModule
└── controllers
    └── BuilderController
        ├── GET /assistants/builder/blocks
        ├── GET /assistants/builder/templates
        ├── POST /assistants/builder/create-from-blocks
        ├── POST /assistants/builder/create-from-template/:id
        └── POST /assistants/builder/validate
```

## GraphModule Internal Structure

```
GraphModule
├── imports
│   ├── CommonModule (shared services)
│   └── CoreServicesModule
├── controllers
│   ├── GraphController (execution control)
│   │   ├── GET /assistants/graph/:conversationId/state
│   │   ├── POST /assistants/graph/:conversationId/pause
│   │   ├── POST /assistants/graph/:conversationId/resume
│   │   ├── POST /assistants/graph/:conversationId/nodes/:nodeId/input
│   │   └── POST /assistants/graph/:conversationId/nodes/:nodeId/approval
│   └── GraphBuilderController (graph design)
│       ├── GET /assistants/builder/graph/node-templates
│       ├── GET /assistants/builder/graph/edge-types
│       ├── POST /assistants/builder/graph/create
│       └── POST /assistants/builder/graph/validate
├── providers (exported)
│   ├── GraphAgentManagerService (execution management)
│   └── GraphBuilderService (graph construction)
└── exports
    └── All providers
```

## GeniusModule Internal Structure

```
GeniusModule
├── imports
│   └── CoreServicesModule
├── controllers
│   ├── GeniusController (learning control)
│   │   ├── POST /genius/start/user-directed
│   │   ├── POST /genius/start/autonomous
│   │   ├── POST /genius/stop
│   │   ├── GET /genius/status
│   │   ├── GET /genius/statistics
│   │   ├── POST /genius/schedule
│   │   ├── GET /genius/schedule
│   │   ├── PATCH /genius/schedule/:jobId
│   │   └── DELETE /genius/schedule/:jobId
│   ├── TopicsController (topic catalog)
│   │   ├── POST /topics
│   │   ├── POST /topics/seed
│   │   ├── GET /topics
│   │   ├── GET /topics/:topicId
│   │   └── PATCH /topics/:topicId
│   └── EscalationsController (user escalations)
│       ├── GET /escalations
│       ├── GET /escalations/active
│       ├── GET /escalations/statistics
│       ├── POST /escalations/:escalationId/resolve
│       └── POST /escalations/:escalationId/cancel
├── providers (exported)
│   ├── GeniusService (orchestration)
│   ├── TopicsService (topic management)
│   ├── EscalationsService (escalation handling)
│   └── [9 core infrastructure services]
└── exports
    └── GeniusService, TopicsService, EscalationsService
```

## Request Flow Example

### Creating a ReAct Assistant

```
Client
  │
  │ POST /assistants { type: "react", ... }
  │
  ▼
AssistantsController
  │
  │ assistantsService.create(dto)
  │
  ▼
AssistantsService
  │
  │ assistantsCrudService.create(dto)
  │
  ▼
AssistantsCrudService (CommonModule)
  │
  │ agentConfigFactory.createConfig(assistant)
  │
  ▼
AgentConfigFactory (CommonModule)
  │
  │ Creates ReActAgentConfig from settings
  │
  ▼
AssistantsRepository (CommonModule)
  │
  │ Saves to MongoDB
  │
  ▼
Response to Client
```

### Executing a Graph Assistant

```
Client
  │
  │ POST /assistants/:name/execute
  │
  ▼
AssistantsController
  │
  │ assistantsService.execute(name, dto)
  │
  ▼
AssistantsService
  │
  │ assistantExecutorService.execute(assistant, dto)
  │
  ▼
AssistantExecutorService (CommonModule)
  │
  │ agentConfigFactory.createConfig(assistant)
  │ agentService.execute(config)
  │
  ▼
AgentService (Core Infrastructure)
  │
  │ GraphAgent.execute()
  │
  ▼
Graph Execution (DAG traversal)
  │
  │ Pause at user interaction node
  │
  ▼
GraphAgentManagerService (GraphModule)
  │
  │ Manages state, waits for input
  │
  ▼
Client receives partial response
```

## Key Design Principles

1. **Separation of Concerns**: Each agent type is independent
2. **Shared Foundation**: Common infrastructure reused across all types
3. **Dependency Injection**: NestJS modules handle all dependencies
4. **Single Responsibility**: Each service has one clear purpose
5. **Open/Closed**: Easy to add new agent types without modifying existing code
6. **Interface Segregation**: Submodules only import what they need
7. **Dependency Inversion**: All depend on abstractions (CommonModule)

## Future Extensibility

To add a new agent type (e.g., "SwarmModule"):

```typescript
// 1. Create swarm/swarm.module.ts
@Module({
  imports: [CommonModule, CoreServicesModule],
  controllers: [SwarmController],
  providers: [SwarmService],
  exports: [SwarmService],
})
export class SwarmModule {}

// 2. Add to AssistantsModule
@Module({
  imports: [
    CommonModule,
    ReactModule,
    GraphModule,
    GeniusModule,
    SwarmModule, // ← New module
  ],
  // ...
})
export class AssistantsModule {}
```

That's it! The new agent type integrates seamlessly.
