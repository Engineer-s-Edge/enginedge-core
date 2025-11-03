# React Agent Module

ReAct (Reasoning + Acting) agents with block-based builder interface.

## Overview

ReAct agents are the default expert agent type in EnginEdge. They combine chain-of-thought reasoning with tool execution, making them suitable for general-purpose conversational AI tasks.

## Architecture

```
react/
├── controllers/
│   └── builder.controller.ts  # Block-based builder API
├── services/                   # (Future: React-specific services)
└── react.module.ts            # Module definition
```

## Features

### Block-Based Builder

The builder controller provides a visual block-based interface for creating React agents:

- **Templates**: Pre-configured agent templates for common use cases
- **Blocks**: Modular components (LLM, Tools, Memory, Chain-of-Thought)
- **Validation**: Ensures valid configurations before saving
- **Preview**: Test agent behavior before deployment

### Builder Endpoints

#### Get Block Templates
```http
GET /assistants/builder/blocks?category=llm
```
Returns available building blocks for creating assistants.

#### Get Assistant Templates
```http
GET /assistants/builder/templates?category=customer-support
```
Returns pre-configured assistant templates.

#### Create from Blocks
```http
POST /assistants/builder/create-from-blocks
```
Build an assistant from selected blocks.

#### Create from Template
```http
POST /assistants/builder/create-from-template/:templateId
```
Instantiate an assistant from a template.

#### Validate Configuration
```http
POST /assistants/builder/validate
```
Validate assistant configuration before creating.

## ReAct Agent Behavior

**Reasoning Phase**: The agent thinks through the problem
- Analyzes user input
- Plans approach
- Considers context

**Acting Phase**: The agent executes tools
- Calls APIs
- Searches databases
- Processes information

**Iteration**: Repeats reasoning + acting until task is complete

## Configuration

ReAct agents are configured through the `reactConfig` field:

```typescript
{
  intelligence: {
    llm: {
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
      tokenLimit: 4000
    },
    cot: {  // Chain-of-thought
      enabled: true,
      maxSteps: 5
    }
  },
  memory: {
    enabled: true,
    type: "buffer",
    maxTokens: 2000
  },
  tools: [
    { toolName: "web-search" },
    { toolName: "calculator" },
    { toolName: "database-query" }
  ]
}
```

## Use Cases

- **Customer Support**: Answer questions using knowledge base
- **Research Assistant**: Search and synthesize information
- **Code Helper**: Debug code and suggest improvements
- **Task Automation**: Execute multi-step workflows
- **Data Analysis**: Query databases and generate insights

## Dependencies

- **CommonModule**: Shared infrastructure
- **AgentModule**: Core ReAct agent implementation
- **LLMModule**: Language model services

## Future Enhancements

- [ ] React-specific analytics service
- [ ] Custom tool builder
- [ ] Advanced reasoning strategies
- [ ] Multi-agent collaboration
- [ ] Performance optimization service
