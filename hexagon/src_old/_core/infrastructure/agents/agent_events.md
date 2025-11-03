# Enhanced Event Emitters for BaseAgent and ReActAgent

## Overview

This document describes the comprehensive event emission system implemented throughout the BaseAgent and ReActAgent classes to provide enhanced observability and control over agent operations.

## BaseAgent Events

The `BaseAgent` class now emits detailed events throughout its lifecycle, providing insight into:

### Agent Lifecycle Events
- `agent-initializing`: Emitted when agent initialization begins
- `agent-ready`: Emitted when agent is fully initialized and ready
- `agent-state-changed`: Emitted when agent state transitions occur

### Memory Management Events
- `memory-loading`: Emitted when memory loading begins
- `memory-loaded`: Emitted when memory loading completes
- `memory-assembling`: Emitted when memory payload assembly begins
- `memory-assembled`: Emitted when memory payload assembly completes with size metrics
- `memory-switched`: Emitted when memory configuration changes

### Prompt Building Events
- `prompt-building`: Emitted when prompt construction begins
- `prompt-built`: Emitted when prompt is finalized with token metrics
- `prompt-token-limit-reached`: Emitted when token limits are hit during construction

### LLM Interaction Events
- `llm-invocation-start`: Emitted before LLM calls with configuration details
- `llm-invocation-complete`: Emitted after LLM calls with usage statistics
- `llm-streaming-chunk`: Emitted for each streaming chunk (can be added to streaming wrapper)
- `llm-provider-switched`: Emitted when LLM provider configuration changes

### Checkpoint Management Events
- `checkpoint-creating`: Emitted when checkpoint creation begins
- `checkpoint-created`: Emitted when checkpoint creation completes
- `checkpoint-restoring`: Emitted when checkpoint restoration begins
- `checkpoint-restored`: Emitted when checkpoint restoration completes

### Configuration Events
- `config-updated`: Emitted when agent configuration changes
- `conversation-switched`: Emitted when conversation context switches

### Operation Control Events
- `operation-aborted`: Emitted when operations are aborted
- `correction-applied`: Emitted when corrections are successfully applied
- `correction-failed`: Emitted when corrections fail

### Error and Warning Events
- `error`: Emitted for error conditions with context
- `warning`: Emitted for warning conditions

### File and Attachment Events
- `attachments-processing`: Emitted when file processing begins
- `attachments-processed`: Emitted when file processing completes

## ReActAgent Events

The `ReActAgent` extends BaseAgent events with ReAct-specific chain-of-thought reasoning observability:

### ReAct Agent Initialization Events
- `react-agent-initializing`: Emitted during ReAct agent initialization
- `react-agent-configured`: Emitted when ReAct configuration is finalized

### ReAct Reasoning Lifecycle Events
- `react-reasoning-start`: Emitted when ReAct reasoning begins
- `react-reasoning-complete`: Emitted when ReAct reasoning completes successfully
- `react-max-steps-exceeded`: Emitted when maximum reasoning steps are exceeded

### Step-Level Events
- `react-step-start`: Emitted at the beginning of each reasoning step
- `react-step-complete`: Emitted at the end of each reasoning step with metrics

### Thought Generation Events
- `react-thought-generating`: Emitted when thought generation begins
- `react-thought-completed`: Emitted when a thought is fully generated

### Action Planning and Execution Events
- `react-action-planned`: Emitted when an action is parsed and planned
- `react-tool-execution-start`: Emitted before tool execution
- `react-tool-execution-complete`: Emitted after successful tool execution
- `react-tool-execution-error`: Emitted when tool execution fails

### Observation Events
- `react-observation-generated`: Emitted when tool observations are generated

### Streaming Events
- `react-streaming-chunk`: Emitted for each streaming chunk with step context
- `react-final-answer`: Emitted when final answer is detected

### Error and Parsing Events
- `react-parsing-error`: Emitted when action/input parsing fails

## Event Data Structure

All events include:
- Contextual data relevant to the operation
- Timestamp for precise timing analysis
- Step numbers (for ReAct events)
- Token counts and usage metrics where applicable
- Error information for failure cases

## Usage Examples

### Listening to BaseAgent Events

```typescript
agent.on('llm-invocation-start', (data) => {
  console.log(`Starting LLM call with ${data.provider}/${data.model}, ${data.promptTokens} tokens`);
});

agent.on('memory-assembled', (data) => {
  console.log(`Memory assembled: ${data.payloadSize} tokens for conversation ${data.conversationId}`);
});

agent.on('error', (data) => {
  console.error(`Error in ${data.context}:`, data.error.message);
});
```

### Listening to ReActAgent Events

```typescript
reactAgent.on('react-reasoning-start', (data) => {
  console.log(`Starting ReAct reasoning for: "${data.input}" (max ${data.maxSteps} steps)`);
});

reactAgent.on('react-thought-completed', (data) => {
  console.log(`Step ${data.stepNumber} thought: ${data.thought}`);
});

reactAgent.on('react-tool-execution-complete', (data) => {
  console.log(`Step ${data.stepNumber}: Tool ${data.toolName} returned: ${data.observation}`);
});

reactAgent.on('react-final-answer', (data) => {
  console.log(`Final answer in ${data.totalSteps} steps: ${data.answer}`);
});
```

## Benefits

1. **Enhanced Observability**: Complete visibility into agent operations
2. **Performance Monitoring**: Token usage, timing, and resource metrics
3. **Debugging Support**: Detailed error context and operation flow
4. **Integration Ready**: Events can be easily consumed by monitoring systems
5. **ReAct Transparency**: Step-by-step insight into chain-of-thought reasoning
6. **Abort Support**: Proper event emission during operation cancellation

## Implementation Notes

- All events include timestamps for precise timing analysis
- Event data is typed using TypeScript interfaces for type safety
- Events are emitted at appropriate lifecycle points throughout operations
- Error events include rich context for debugging
- ReAct events provide granular insight into reasoning steps
- Token counting and usage metrics are included where relevant
- AbortSignal integration ensures proper cleanup and event emission during cancellation
