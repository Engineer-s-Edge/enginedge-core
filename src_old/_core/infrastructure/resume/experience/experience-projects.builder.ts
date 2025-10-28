import { Injectable } from '@nestjs/common';
import { ExperienceProjectsRuleEnforcer } from './experience-projects.rule-enforcer';
import LlmService from '../../agents/components/llm/llm.service';
import { ExperienceEntryDto } from '../dtos/resume.dtos';

@Injectable()
export class ExperienceProjectsBuilder {
  constructor(
    private readonly experienceProjectsRuleEnforcer: ExperienceProjectsRuleEnforcer,
    private readonly llmService: LlmService,
  ) {}

  async build(
    rawDescription: string,
    context: { title: string; company: string },
  ): Promise<ExperienceEntryDto> {
    const prompt = `
      Based on the following job description, generate 3-5 resume bullet points in the XYZ format (Accomplished [X] as measured by [Y], by doing [Z]).
      Description: "${rawDescription}"
      Return the result as a JSON array of strings. For example: ["bullet 1", "bullet 2"]
    `;

    // In a real scenario, this would be an actual LLM call.
    // As per instructions, we are mocking this. The test will provide the mock implementation.
    const { HumanMessage } = await import('@langchain/core/messages');
    const messages = [new HumanMessage(prompt)];
    const llmResponse = await this.llmService.chat(messages, {});

    let bullets: string[] = [];
    try {
      // ChatInvocationResult returns `response` which can be a string or structured content.
      const content = (llmResponse as any).response;
      let text: string;
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        // LangChain MessageContent array case: join text parts if present
        text = content
          .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join('');
      } else {
        text = String(content ?? '');
      }

      bullets = JSON.parse(text);
    } catch (error) {
      // Handle cases where LLM output is not valid JSON
      console.error('Failed to parse LLM response for bullets:', error);
      bullets = [rawDescription]; // Fallback to the raw description
    }

    const experienceEntry: ExperienceEntryDto = {
      title: context.title,
      company: context.company,
      bullets: bullets,
    };

    // Validate the generated entry
    const { normalizedEntries } =
      this.experienceProjectsRuleEnforcer.enforceExperience([experienceEntry]);

    return normalizedEntries[0];
  }
}
