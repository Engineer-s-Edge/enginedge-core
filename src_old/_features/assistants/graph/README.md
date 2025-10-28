# Graph Agent Module

Graph-based workflow agents with DAG (Directed Acyclic Graph) execution.

## Overview

Graph agents execute workflows as directed acyclic graphs where each node represents a step and edges define control flow. This enables complex, conditional workflows with branching, parallel execution, and user interaction points.

## Architecture

```
graph/
├── controllers/
│   ├── graph.controller.ts          # Runtime execution control
│   └── graph-builder.controller.ts  # Graph design & templates
├── services/
│   ├── graph-agent-manager.service.ts  # Execution management
│   └── graph-builder.service.ts         # Graph construction
├── dto/
│   ├── graph.dto.ts                 # Execution DTOs
│   └── graph-builder.dto.ts         # Builder DTOs
└── graph.module.ts                  # Module definition
```

## Key Concepts

### Nodes

Graph nodes represent discrete steps in a workflow:

- **LLM Node**: Call language model
- **Tool Node**: Execute external tool
- **Conditional Node**: Branch based on conditions
- **Parallel Node**: Execute multiple branches simultaneously
- **Aggregator Node**: Combine results from parallel branches
- **Input Node**: Request user input
- **Approval Node**: Require user approval
- **Transform Node**: Data transformation
- **Checkpoint Node**: Save state for recovery

### Edges

Edges define how execution flows between nodes:

- **Sequential**: One node follows another
- **Conditional**: Branch based on condition evaluation
- **Parallel**: Split execution into multiple branches
- **Loop**: Repeat a subgraph until condition is met

### User Interactions

Graph agents can pause for user involvement:

- **Input Request**: Node waits for user to provide data
- **Approval Gate**: Node waits for user approval/rejection
- **Feedback Loop**: User can steer execution direction

## API Endpoints

### Runtime Control

#### Get Graph State
```http
GET /assistants/graph/:conversationId/state
```
Returns current execution state, active nodes, and history.

#### Pause Execution
```http
POST /assistants/graph/:conversationId/pause
```
Pause the graph mid-execution.

#### Resume Execution
```http
POST /assistants/graph/:conversationId/resume
```
Resume a paused graph.

#### Provide Input
```http
POST /assistants/graph/:conversationId/nodes/:nodeId/input
```
Supply data to an input node.

#### Provide Approval
```http
POST /assistants/graph/:conversationId/nodes/:nodeId/approval
```
Approve or reject at an approval node.

### Graph Builder

#### Get Node Templates
```http
GET /assistants/builder/graph/node-templates?category=llm
```
Returns available node types for building graphs.

#### Get Edge Types
```http
GET /assistants/builder/graph/edge-types
```
Returns available edge types for connections.

#### Get User Interaction Types
```http
GET /assistants/builder/graph/user-interaction-types
```
Returns user interaction modes (input, approval, feedback).

#### Create Graph Agent
```http
POST /assistants/builder/graph/create
```
Create a new graph agent from configuration.

#### Validate Graph
```http
POST /assistants/builder/graph/validate
```
Validate graph structure and configuration.

## Example Graph

```typescript
{
  "name": "Research & Summarize Workflow",
  "graphConfig": {
    "nodes": [
      {
        "id": "start",
        "type": "input",
        "config": { "prompt": "What topic should I research?" }
      },
      {
        "id": "search",
        "type": "tool",
        "config": { "toolName": "web-search", "maxResults": 5 }
      },
      {
        "id": "parallel-analysis",
        "type": "parallel",
        "branches": ["sentiment", "facts", "sources"]
      },
      {
        "id": "sentiment",
        "type": "llm",
        "config": { "instruction": "Analyze sentiment" }
      },
      {
        "id": "facts",
        "type": "llm",
        "config": { "instruction": "Extract key facts" }
      },
      {
        "id": "sources",
        "type": "llm",
        "config": { "instruction": "Evaluate source credibility" }
      },
      {
        "id": "aggregate",
        "type": "aggregator",
        "config": { "strategy": "merge" }
      },
      {
        "id": "approval",
        "type": "approval",
        "config": { "message": "Approve this analysis?" }
      },
      {
        "id": "summarize",
        "type": "llm",
        "config": { "instruction": "Create executive summary" }
      }
    ],
    "edges": [
      { "from": "start", "to": "search", "type": "sequential" },
      { "from": "search", "to": "parallel-analysis", "type": "sequential" },
      { "from": "parallel-analysis", "to": ["sentiment", "facts", "sources"], "type": "parallel" },
      { "from": ["sentiment", "facts", "sources"], "to": "aggregate", "type": "sequential" },
      { "from": "aggregate", "to": "approval", "type": "sequential" },
      {
        "from": "approval",
        "to": "summarize",
        "type": "conditional",
        "condition": "approved === true"
      },
      {
        "from": "approval",
        "to": "search",
        "type": "conditional",
        "condition": "approved === false"
      }
    ]
  }
}
```

## Execution Model

1. **Start**: Begin at entry node
2. **Execute Node**: Run node logic (LLM call, tool execution, etc.)
3. **Evaluate Edges**: Determine next node(s) based on edge type and conditions
4. **Branch/Merge**: Handle parallel execution and aggregation
5. **Pause**: Wait for user input/approval if needed
6. **Checkpoint**: Save state at checkpoint nodes
7. **Complete**: Reach terminal node

## Use Cases

- **Multi-Step Workflows**: Complex processes with many stages
- **Conditional Logic**: Different paths based on data
- **Parallel Processing**: Execute multiple tasks simultaneously
- **Human-in-the-Loop**: Require user decisions at key points
- **Long-Running Jobs**: Checkpointed workflows that can recover from failures
- **Approval Workflows**: Document review, data validation, etc.
- **Data Pipelines**: ETL processes with transformations

## Dependencies

- **CommonModule**: Shared infrastructure
- **AgentModule**: Core graph agent implementation
- **LLMModule**: Language model services

## Future Enhancements

- [ ] Visual graph editor UI
- [ ] Sub-graph composition (reusable workflows)
- [ ] Dynamic node generation at runtime
- [ ] Advanced error handling and retry logic
- [ ] Performance analytics per node
- [ ] Graph version control
- [ ] A/B testing for graph variants
