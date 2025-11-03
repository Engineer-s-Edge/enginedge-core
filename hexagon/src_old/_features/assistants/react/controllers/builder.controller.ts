import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { AssistantsCrudService } from '../../common/services/assistants-crud.service';
import { AssistantType, AssistantMode } from '../../common/entities/assistant.entity';
import { CreateAssistantDto } from '../../common/dto/assistant.dto';
import { getErrorInfo } from '@common/error-assertions';

/**
 * Builder Controller for Block-Based Assistants
 *
 * ARCHITECTURE NOTE:
 * - Assistants are user-facing configurations that wrap underlying agents
 * - The real execution happens in infrastructure agents (ReActAgent, GraphAgent)
 * - Block-based assistants use CUSTOM type and get converted to ReActAgent workflows
 * - Graph-based assistants use GRAPH_AGENT type and create GraphAgent instances
 * - AssistantType is mostly just a label - the blocks/graph structure determines functionality
 */

interface BlockTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  config: Record<string, any>;
  category: string;
}

interface AssistantTemplate {
  name: string;
  description: string;
  primaryMode: AssistantMode;
  blocks: any[];
  category: string;
  tags: string[];
}

@Controller('assistants/builder')
export class BuilderController {
  constructor(private readonly assistantsService: AssistantsCrudService) {}

  @Get('templates')
  async getAssistantTemplates(@Query('category') category?: string) {
    try {
      const templates: AssistantTemplate[] = [
        {
          name: 'General Conversational Assistant',
          description:
            'A general-purpose assistant that can answer questions and maintain conversation history',
          primaryMode: AssistantMode.BALANCED,
          blocks: [
            {
              id: 'input-node',
              type: 'input',
              config: {
                inputField: 'query',
                prompt: 'How can I help you today?',
              },
              next: 'llm-node',
            },
            {
              id: 'llm-node',
              type: 'llm',
              config: {
                systemPrompt:
                  'You are a helpful and friendly assistant. Answer user queries accurately and concisely.',
                temperature: 0.7,
                modelName: 'llama-3.3-70b-versatile',
              },
            },
          ],
          category: 'conversational',
          tags: ['general', 'chat', 'basic'],
        },
        {
          name: 'Coding Assistant',
          description:
            'A programming assistant specializing in code generation and debugging',
          primaryMode: AssistantMode.BALANCED,
          blocks: [
            {
              id: 'input-node',
              type: 'input',
              config: {
                inputField: 'query',
                prompt: 'What coding help do you need?',
              },
              next: 'llm-node',
            },
            {
              id: 'llm-node',
              type: 'llm',
              config: {
                systemPrompt:
                  'You are a specialized programming assistant. Help users write code, debug issues, and explain programming concepts. Provide clear, efficient code examples with explanations.',
                temperature: 0.3,
                modelName: 'deepseek-coder',
              },
            },
          ],
          category: 'development',
          tags: ['development', 'code', 'debug'],
        },
        {
          name: 'Research Assistant',
          description:
            'Research assistant that can search and analyze information from various sources',
          primaryMode: AssistantMode.BALANCED,
          blocks: [
            {
              id: 'input-node',
              type: 'input',
              config: {
                inputField: 'query',
                prompt: 'What would you like to research today?',
              },
              next: 'input-classifier',
            },
            {
              id: 'input-classifier',
              type: 'llm',
              config: {
                systemPrompt:
                  "Classify if the user's query needs search or can be answered with general knowledge.",
                outputFormat: 'json',
              },
              next: {
                true: 'search-synthesis',
                false: 'answer-direct',
              },
            },
          ],
          category: 'research',
          tags: ['research', 'analysis', 'information'],
        },
      ];

      const filteredTemplates = category
        ? templates.filter((t) => t.category === category)
        : templates;

      return {
        success: true,
        templates: filteredTemplates,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
        templates: [],
      };
    }
  }

  @Get('block-templates')
  async getBlockTemplates(@Query('category') category?: string) {
    try {
      const blockTemplates: BlockTemplate[] = [
        {
          id: 'input-block',
          name: 'Input Block',
          type: 'input',
          description: 'Captures user input for processing',
          config: {
            inputField: 'query',
            prompt: 'Please provide your input:',
          },
          category: 'input',
        },
        {
          id: 'llm-block',
          name: 'LLM Block',
          type: 'llm',
          description: 'Processes input using a language model',
          config: {
            systemPrompt: 'You are a helpful assistant.',
            temperature: 0.7,
            modelName: 'llama-3.3-70b-versatile',
          },
          category: 'processing',
        },
        {
          id: 'tool-block',
          name: 'Tool Block',
          type: 'tool',
          description: 'Executes a specific tool or function',
          config: {
            name: 'calculator',
            description: 'Performs arithmetic operations',
          },
          category: 'processing',
        },
        {
          id: 'condition-block',
          name: 'Condition Block',
          type: 'condition',
          description: 'Routes flow based on conditions',
          config: {
            condition: 'input.length > 10',
            trueNext: 'process-long',
            falseNext: 'process-short',
          },
          category: 'control',
        },
        {
          id: 'memory-block',
          name: 'Memory Block',
          type: 'memory',
          description: 'Stores or retrieves information from memory',
          config: {
            operation: 'store',
            key: 'conversation_context',
          },
          category: 'memory',
        },
        {
          id: 'output-block',
          name: 'Output Block',
          type: 'output',
          description: 'Returns results to the user',
          config: {
            format: 'text',
            template: '{{result}}',
          },
          category: 'output',
        },
      ];

      const filteredBlocks = category
        ? blockTemplates.filter((b) => b.category === category)
        : blockTemplates;

      return {
        success: true,
        blockTemplates: filteredBlocks,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
        blockTemplates: [],
      };
    }
  }

  @Post('validate')
  @UsePipes(new ValidationPipe({ transform: true }))
  async validateBlocks(@Body() body: { blocks: any[] }) {
    try {
      const { blocks } = body;
      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic validation
      if (!blocks || blocks.length === 0) {
        errors.push('At least one block is required');
      }

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const blockId = block.id || `block_${i}`;

        // Required fields
        if (!block.type) {
          errors.push(`Block ${blockId}: 'type' is required`);
        }
        if (!block.config) {
          errors.push(`Block ${blockId}: 'config' is required`);
        } // Type-specific validation
        switch (block.type) {
          case 'input':
            if (!block.config.inputField) {
              warnings.push(
                `Block ${blockId}: Input blocks should specify 'inputField'`,
              );
            }
            break;
          case 'llm':
            if (!block.config.systemPrompt) {
              warnings.push(
                `Block ${blockId}: LLM blocks should have a 'systemPrompt'`,
              );
            }
            break;
          case 'tool':
            if (!block.config.name) {
              errors.push(
                `Block ${blockId}: Tool blocks must specify tool 'name'`,
              );
            }
            break;
        }

        // Next node validation
        if (block.next && typeof block.next === 'string') {
          const nextBlockExists = blocks.some((b) => b.id === block.next);
          if (!nextBlockExists) {
            warnings.push(
              `Block ${blockId}: Next block '${block.next}' not found`,
            );
          }
        }
      }

      return {
        success: true,
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
        isValid: false,
      };
    }
  }
  @Post('create-from-template/:templateName')
  async createFromTemplate(
    @Param('templateName') templateName: string,
    @Body()
    customization: { name: string; description?: string; modifications?: any },
  ) {
    try {
      // Get template
      const templatesResponse = await this.getAssistantTemplates();
      const templates = templatesResponse.templates || [];
      const template = templates.find(
        (t: AssistantTemplate) =>
          t.name.toLowerCase().replace(/\s+/g, '-') ===
          templateName.toLowerCase(),
      );

      if (!template) {
        return {
          success: false,
          error: `Template '${templateName}' not found`,
        };
      } // Create assistant from template
      const createDto: CreateAssistantDto = {
        name: customization.name,
        description: customization.description || template.description,
        type: AssistantType.CUSTOM, // All block-based assistants are CUSTOM type
        primaryMode: template.primaryMode,
        blocks: template.blocks,
        isPublic: false,
      };

      const result = await this.assistantsService.create(createDto);

      return {
        success: true,
        message: `Assistant created from template '${template.name}'`,
        assistant: result,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
      };
    }
  }

  @Get('categories')
  async getCategories() {
    return {
      success: true,
      categories: [
        {
          id: 'conversational',
          name: 'Conversational',
          description: 'General purpose chat assistants',
        },
        {
          id: 'development',
          name: 'Development',
          description: 'Code and programming assistants',
        },
        {
          id: 'research',
          name: 'Research',
          description: 'Information gathering and analysis',
        },
        {
          id: 'productivity',
          name: 'Productivity',
          description: 'Task management and automation',
        },
        {
          id: 'education',
          name: 'Education',
          description: 'Learning and teaching assistants',
        },
        {
          id: 'creative',
          name: 'Creative',
          description: 'Content creation and ideation',
        },
      ],
    };
  }
  @Get('assistant-types')
  async getAssistantTypes() {
    return {
      success: true,
      types: [
        {
          id: 'custom',
          name: 'Custom Assistant',
          description: 'Custom assistant with user-defined block configuration',
        },
        {
          id: 'graph_agent',
          name: 'Graph Agent',
          description: 'Advanced assistant using graph-based execution flow',
        },
      ],
    };
  }

  @Get('assistant-modes')
  async getAssistantModes() {
    return {
      success: true,
      modes: Object.values(AssistantMode).map((mode) => ({
        id: mode,
        name: mode.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        description: this.getModeDescription(mode),
      })),
    };
  }
  private getModeDescription(mode: AssistantMode): string {
    const descriptions = {
      [AssistantMode.PRECISE]: 'Focuses on accuracy and factual responses',
      [AssistantMode.CREATIVE]: 'Emphasizes creative and innovative solutions',
      [AssistantMode.BALANCED]: 'Balances accuracy with creativity',
      [AssistantMode.SOCRATIC]: 'Uses questioning to guide learning',
      [AssistantMode.CUSTOM]: 'Custom interaction mode',
      [AssistantMode.VISUAL_LEARNING]:
        'Focuses on visual and diagram-based explanations',
    };
    return descriptions[mode] || 'Custom interaction mode';
  }
}
