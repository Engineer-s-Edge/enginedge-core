import { Providers } from '@core/infrastructure/agents/components/llm/interfaces/llm.interface';
import { ReActAgentConfig, AgentState } from './agent.entity';

export const DEFAULT_REACT_SETTINGS: Partial<ReActAgentConfig> = {
  state: AgentState.INITIALIZING,
  enabled: true,
  cot: {
    enabled: true,
    promptTemplate: `You are a reasoning assistant that uses structured thinking to solve problems.

For EVERY response, you MUST use XML-style tags in this exact format:

<thinking>
Your step-by-step reasoning about what to do
</thinking>

<answer>
Your final answer to the user
</answer>

IF TOOLS ARE AVAILABLE (listed below), you can use them with this format:

<action>
<tool>tool_name</tool>
<input>{"param": "value"}</input>
</action>

<observation>
[This will be filled by the system after tool execution]
</observation>

... (you can repeat thinking/action/observation blocks as needed) ...

IMPORTANT RULES:
1. ALWAYS wrap your reasoning in <thinking></thinking> tags
2. ALWAYS end with <answer></answer> tags when you're done
3. The system will STOP as soon as you output </answer>
4. For simple questions, go straight from <thinking> to <answer>
5. ONLY use <action> blocks if tools are listed below AND you need them
6. DO NOT invent or hallucinate tools - only use tools that are explicitly listed
7. You have up to 5 reasoning steps - use them wisely

Example for simple question (no tools needed):
Question: What is 1+1?
<thinking>
This is basic arithmetic, I can answer directly.
</thinking>
<answer>
2
</answer>

Example when tools are available:
Question: Search for the weather in Paris
<thinking>
I need to use a search tool to find weather information about Paris.
</thinking>
<action>
<tool>WebSearch</tool>
<input>{"query": "Paris weather"}</input>
</action>
<observation>
[system provides: Paris weather is 18°C, clear skies]
</observation>
<thinking>
I now have the weather information from the search results.
</thinking>
<answer>
The weather in Paris is currently 18°C with clear skies.
</answer>

Begin!

Question: {input}
`,
    maxTokens: 512,
    temperature: 0.7,
    topP: 0.9,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    fewShotExamples: [
      {
        input: 'What is 12 × 13?',
        thought: '<thinking>\nI need to calculate 12 × 13. This is multiplication. If a calculator tool is available, I should use it. If not, I can calculate it directly.\n</thinking>',
        action: '<action>\n<tool>Calculator</tool>\n<input>{"expression": "12 * 13"}</input>\n</action>',
        observation: '<observation>\n156\n</observation>',
        finalAnswer: '<answer>\n12 × 13 = 156\n</answer>',
      },
      {
        input: 'What is the capital of France?',
        thought:
          '<thinking>\nThis is a simple factual question that I can answer directly from my knowledge.\n</thinking>',
        action: '',
        observation: '',
        finalAnswer: '<answer>\nThe capital of France is Paris.\n</answer>',
      },
    ],
    stopSequences: [],  // Let the LLM naturally complete XML tags
    maxSteps: 5,
    selfConsistency: {
      enabled: false,
      samples: 1,
    },
    temperatureModifiable: true,
    maxTokensModifiable: true,
  },
  intelligence: {
    llm: { provider: 'groq', model: 'llama-3.3-70b-versatile', tokenLimit: 8192 },
    escalate: false,
    providerEscalationOptions: [
      Providers.GOOGLE,
      Providers.OPENAI,
      Providers.ANTHROPIC,
      Providers.GROQ,
      Providers.XAI,
      Providers.NVIDIA,
    ],
    modelEscalationTable: {
      [Providers.GOOGLE]: [
        {
          model: '',
          tokenLimit: 0,
        },
      ],
      [Providers.OPENAI]: [
        {
          model: '',
          tokenLimit: 0,
        },
        {
          model: '',
          tokenLimit: 0,
        },
      ],
      [Providers.ANTHROPIC]: [
        {
          model: '',
          tokenLimit: 0,
        },
        {
          model: '',
          tokenLimit: 0,
        },
      ],
      [Providers.GROQ]: [
        {
          model: '',
          tokenLimit: 0,
        },
      ],
      [Providers.XAI]: [
        {
          model: '',
          tokenLimit: 0,
        },
      ],
      [Providers.NVIDIA]: [
        {
          model: '',
          tokenLimit: 0,
        },
      ],
    },
  },
  tools: [],
  canModifyStorage: false,
};
