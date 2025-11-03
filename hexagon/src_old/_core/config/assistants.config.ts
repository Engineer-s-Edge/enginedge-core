import { registerAs } from '@nestjs/config';
import {
  AssistantType,
  AssistantMode,
} from '../../features/assistants/common/entities/assistant.entity';
import { AgentType } from '../infrastructure/agents/core/agents/services/factory.service';

export default registerAs('assistants', () => ({
  defaultModels: {
    [AssistantType.CODE_HELPER]: 'llama-3.3-70b-versatile',
    [AssistantType.RESEARCH]: 'llama-3.3-70b-versatile',
    [AssistantType.GRAPH_AGENT]: 'llama-3.3-70b-versatile',
    [AssistantType.PROBLEM_SOLVER]: 'llama-3.3-70b-versatile',
    [AssistantType.STUDY_HELPER]: 'llama-3.3-70b-versatile',
    [AssistantType.MOCK_INTERVIEWER]: 'llama-3.3-70b-versatile',
    [AssistantType.RESUME_CRITIQUER]: 'llama-3.3-70b-versatile',
    [AssistantType.CALENDAR_ASSISTANT]: 'llama-3.3-70b-versatile',
    [AssistantType.REACT_AGENT]: 'llama-3.3-70b-versatile',
    [AssistantType.CUSTOM]: 'llama-3.3-70b-versatile',
  },
  defaultMemoryTypes: {
    [AssistantType.STUDY_HELPER]: 'cbwm',
    [AssistantType.CODE_HELPER]: 'ctbm',
    [AssistantType.RESEARCH]: 'csm',
    [AssistantType.MOCK_INTERVIEWER]: 'cbwm',
    [AssistantType.RESUME_CRITIQUER]: 'cbm',
    [AssistantType.CALENDAR_ASSISTANT]: 'cbm',
    [AssistantType.PROBLEM_SOLVER]: 'cbwm',
    [AssistantType.GRAPH_AGENT]: 'cbm',
    [AssistantType.REACT_AGENT]: 'cbwm',
    [AssistantType.CUSTOM]: 'cbm',
  },
  agentTypePrompts: {
    [AgentType.REACT]:
      'You are a ReAct agent. Use reasoning and acting patterns to solve problems step by step.',
    [AgentType.GRAPH]:
      'You are a Graph agent. Execute complex workflows with multiple steps and user interactions.',
    [AgentType.BASE]: 'You are a helpful AI assistant.',
    [AgentType.EXPERT]:
      'You are an expert-level AI agent with deep domain knowledge.',
    [AgentType.GENIUS]:
      'You are a genius-level AI agent capable of advanced reasoning.',
    [AgentType.COLLECTIVE]: 'You are part of a collective intelligence system.',
    [AgentType.MANAGER]:
      'You are a manager agent responsible for coordinating tasks.',
  },
  assistantTypePrompts: {
    [AssistantType.STUDY_HELPER]: 'Focus on educational support and learning.',
    [AssistantType.PROBLEM_SOLVER]:
      'Approach problems systematically and analytically.',
    [AssistantType.MOCK_INTERVIEWER]: 'Act as a professional interviewer.',
    [AssistantType.RESUME_CRITIQUER]:
      'Review resumes critically and constructively.',
    [AssistantType.CALENDAR_ASSISTANT]:
      'Help with scheduling and time management.',
    [AssistantType.CODE_HELPER]:
      'Provide programming assistance and code review.',
    [AssistantType.RESEARCH]: 'Conduct thorough research and analysis.',
    [AssistantType.GRAPH_AGENT]: 'Execute complex multi-step workflows.',
    [AssistantType.REACT_AGENT]:
      'Use chain-of-thought reasoning to solve problems step by step.',
    [AssistantType.CUSTOM]: 'Follow the specific configuration provided.',
  },
  assistantModePrompts: {
    [AssistantMode.PRECISE]: 'Be precise and accurate in your responses.',
    [AssistantMode.CREATIVE]: 'Be creative and innovative in your approach.',
    [AssistantMode.BALANCED]:
      'Maintain a balanced approach between accuracy and creativity.',
    [AssistantMode.SOCRATIC]: 'Use the Socratic method to guide learning.',
    [AssistantMode.VISUAL_LEARNING]:
      'Support visual learning with examples and diagrams.',
    [AssistantMode.CUSTOM]: 'Follow the specific interaction style provided.',
  },
  stopSequences: {
    [AssistantType.CODE_HELPER]: ['```', '</code>', 'Final Answer:'],
    [AssistantType.STUDY_HELPER]: ['Final Answer:', 'Summary:'],
    [AssistantType.RESEARCH]: ['Conclusion:', 'Final Answer:', 'References:'],
    [AssistantType.MOCK_INTERVIEWER]: ['Interview End:', 'Final Assessment:'],
    [AssistantType.RESUME_CRITIQUER]: [
      'Final Recommendation:',
      'Overall Rating:',
    ],
    [AssistantType.CALENDAR_ASSISTANT]: [
      'Schedule Created:',
      'Booking Confirmed:',
    ],
    [AssistantType.PROBLEM_SOLVER]: ['Solution:', 'Final Answer:'],
    [AssistantType.GRAPH_AGENT]: ['Workflow Complete:', 'Next Node:'],
    [AssistantType.REACT_AGENT]: ['Final Answer:', 'Thought:', 'Observation:'],
    [AssistantType.CUSTOM]: ['Final Answer:'],
  },
  maxIterationsMultipliers: {
    [AssistantType.RESEARCH]: 2,
    [AssistantType.PROBLEM_SOLVER]: 1.5,
    [AssistantType.CODE_HELPER]: 1.5,
    [AssistantType.GRAPH_AGENT]: 3,
    [AssistantType.STUDY_HELPER]: 1,
    [AssistantType.MOCK_INTERVIEWER]: 1,
    [AssistantType.RESUME_CRITIQUER]: 1,
    [AssistantType.CALENDAR_ASSISTANT]: 1,
    [AssistantType.REACT_AGENT]: 2,
    [AssistantType.CUSTOM]: 1,
  },
  executionTimeout: 300000,
  nodeCommands: {
    input: 'GET_USER_INPUT',
    llm: 'PROCESS_WITH_LLM',
    tool: 'USE_TOOL',
    condition: 'EVALUATE_CONDITION',
    output: 'GENERATE_OUTPUT',
    approval: 'REQUEST_APPROVAL',
  },
  nodeNames: {
    input: 'User Input',
    llm: 'AI Processing',
    tool: 'Tool Execution',
    condition: 'Decision Point',
    output: 'Generate Response',
    approval: 'User Approval',
  },
}));
