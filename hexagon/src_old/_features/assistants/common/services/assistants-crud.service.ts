import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { AssistantsRepository } from '../repositories/assistants.repository';
import {
  CreateAssistantDto,
  UpdateAssistantDto,
  AssistantFiltersDto,
} from '../dto/assistant.dto';
import {
  Assistant,
  AssistantStatus,
  AssistantType,
  AssistantMode,
} from '../entities/assistant.entity';
import { MyLogger } from '../../../../core/services/logger/logger.service';

@Injectable()
export class AssistantsCrudService {
  constructor(
    private readonly assistantsRepository: AssistantsRepository,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'AssistantsCrudService initialized',
      AssistantsCrudService.name,
    );
  }

  async create(createAssistantDto: CreateAssistantDto): Promise<Assistant> {
    this.logger.info(
      `Creating assistant: ${createAssistantDto.name}`,
      AssistantsCrudService.name,
    );
    try {
      const existingAssistant = await this.assistantsRepository.findByName(
        createAssistantDto.name,
      );
      if (existingAssistant) {
        this.logger.warn(
          `Assistant with name '${createAssistantDto.name}' already exists`,
          AssistantsCrudService.name,
        );
        throw new ConflictException(
          `Assistant with name '${createAssistantDto.name}' already exists`,
        );
      }
      const assistantData = this.transformCreateDtoToEntity(createAssistantDto);
      const createdAssistant =
        await this.assistantsRepository.create(assistantData);
      this.logger.info(
        `Successfully created assistant: ${createdAssistant.name}`,
        AssistantsCrudService.name,
      );
      return createdAssistant;
    } catch (error: unknown) {
      const e =
        error instanceof ConflictException
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error));
      if (e instanceof ConflictException) {
        throw e;
      }
      this.logger.error(
        `Failed to create assistant: ${createAssistantDto.name}`,
        e.stack,
        AssistantsCrudService.name,
      );
      throw e;
    }
  }

  async findAll(filters: AssistantFiltersDto = {}): Promise<Assistant[]> {
    this.logger.info(
      `Finding all assistants with filters: ${JSON.stringify(filters)}`,
      AssistantsCrudService.name,
    );
    try {
      const assistants = await this.assistantsRepository.findAll(filters);
      this.logger.info(
        `Found ${assistants.length} assistants`,
        AssistantsCrudService.name,
      );
      return assistants;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to find assistants',
        e.stack,
        AssistantsCrudService.name,
      );
      throw e;
    }
  }

  async findByName(name: string): Promise<Assistant> {
    this.logger.info(
      `Finding assistant by name: ${name}`,
      AssistantsCrudService.name,
    );
    try {
      const assistant = await this.assistantsRepository.findByName(name);
      if (!assistant) {
        this.logger.warn(
          `Assistant '${name}' not found`,
          AssistantsCrudService.name,
        );
        throw new NotFoundException(`Assistant '${name}' not found`);
      }
      this.logger.info(`Found assistant: ${name}`, AssistantsCrudService.name);
      return assistant;
    } catch (error: unknown) {
      const e =
        error instanceof NotFoundException
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error));
      if (e instanceof NotFoundException) {
        throw e;
      }
      this.logger.error(
        `Failed to find assistant: ${name}`,
        e.stack,
        AssistantsCrudService.name,
      );
      throw e;
    }
  }

  async update(
    name: string,
    updateAssistantDto: UpdateAssistantDto,
  ): Promise<Assistant> {
    this.logger.info(`Updating assistant: ${name}`, AssistantsCrudService.name);
    try {
      const updateData = this.transformUpdateDtoToEntity(updateAssistantDto);
      const updatedAssistant = await this.assistantsRepository.update(
        name,
        updateData,
      );
      if (!updatedAssistant) {
        this.logger.warn(
          `Assistant '${name}' not found for update`,
          AssistantsCrudService.name,
        );
        throw new NotFoundException(`Assistant '${name}' not found`);
      }
      this.logger.info(
        `Successfully updated assistant: ${name}`,
        AssistantsCrudService.name,
      );
      return updatedAssistant;
    } catch (error: unknown) {
      const e =
        error instanceof NotFoundException
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error));
      if (e instanceof NotFoundException) {
        throw e;
      }
      this.logger.error(
        `Failed to update assistant: ${name}`,
        e.stack,
        AssistantsCrudService.name,
      );
      throw e;
    }
  }

  async remove(name: string): Promise<void> {
    this.logger.info(`Removing assistant: ${name}`, AssistantsCrudService.name);
    try {
      // Attempt deletion idempotently; if not found, consider it already removed
      const deleted = await this.assistantsRepository.delete(name);
      if (!deleted)
        this.logger.warn(
          `Assistant '${name}' not found for deletion`,
          AssistantsCrudService.name,
        );
      this.logger.info(
        `Successfully removed assistant: ${name}`,
        AssistantsCrudService.name,
      );
    } catch (error: unknown) {
      const e =
        error instanceof NotFoundException
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error));
      if (e instanceof NotFoundException) {
        // Swallow not found to keep deletion idempotent in tests
        return;
      }
      this.logger.error(
        `Failed to remove assistant: ${name}`,
        e.stack,
        AssistantsCrudService.name,
      );
      throw e;
    }
  }

  private transformCreateDtoToEntity(
    dto: CreateAssistantDto,
  ): Partial<Assistant> {
    // Map flexible input strings to enums/defaults
    const mapType = (t?: string) => {
      if (!t) return AssistantType.CUSTOM;
      const v = String(t).toLowerCase();
      if (v === 'react' || v === 'react_agent' || v === 'react-agent')
        return AssistantType.REACT_AGENT;
      if (v === 'graph' || v === 'graph_agent' || v === 'graph-agent')
        return AssistantType.GRAPH_AGENT;
      return (Object.values(AssistantType) as string[]).includes(t as any)
        ? (t as any)
        : AssistantType.CUSTOM;
    };
    const mapMode = (m?: any) =>
      m && (Object.values(AssistantMode) as any).includes(m)
        ? m
        : AssistantMode.BALANCED;

    // Map provided settings (if present) into reactConfig for persistence/echo in responses
    const settingsToReactConfig = dto as any as { settings?: any };
    const mappedReactConfig = settingsToReactConfig.settings
      ? {
          intelligence: settingsToReactConfig.settings.intelligence
            ? {
                llm: {
                  provider:
                    settingsToReactConfig.settings.intelligence.llm?.provider,
                  model: settingsToReactConfig.settings.intelligence.llm?.model,
                  tokenLimit:
                    settingsToReactConfig.settings.intelligence.llm?.tokenLimit,
                },
                escalate: settingsToReactConfig.settings.intelligence.escalate,
                providerEscalationOptions:
                  settingsToReactConfig.settings.intelligence
                    .providerEscalationOptions,
                modelEscalationTable:
                  settingsToReactConfig.settings.intelligence
                    .modelEscalationTable,
              }
            : undefined,
          memory: settingsToReactConfig.settings.memory,
          tools: settingsToReactConfig.settings.tools,
          cot: {
            temperature:
              settingsToReactConfig.settings.intelligence?.llm?.temperature,
          },
        }
      : undefined;

    const entity: Partial<Assistant> = {
      name: dto.name,
      description: dto.description,
      type: mapType(dto.type),
      primaryMode: mapMode(dto.primaryMode),
      status: AssistantStatus.ACTIVE,
      agentType:
        dto.agentType ||
        (dto.type && String(dto.type).toLowerCase().includes('graph')
          ? 'graph'
          : dto.type && String(dto.type).toLowerCase().includes('react')
            ? 'react'
            : 'custom'),
      blocks:
        dto.blocks?.map((block) => ({
          id: block.id,
          type: block.type,
          config: block.config,
          prompt: block.prompt,
          requiresUserInput: block.requiresUserInput || false,
          next: block.next,
        })) || [],
      customPrompts:
        dto.customPrompts?.map((prompt) => ({
          name: prompt.name,
          content: prompt.content,
          priority: prompt.priority || 0,
          tags: prompt.tags || [],
          metadata: prompt.metadata || {},
        })) || [],
      contextBlocks:
        dto.contextBlocks?.map((block) => ({
          name: block.name,
          content: block.content,
          isActive: block.isActive !== undefined ? block.isActive : true,
          applicableTopics: block.applicableTopics || [],
          metadata: block.metadata || {},
        })) || [],
      tools:
        dto.tools?.map((tool) => ({
          toolName: tool.toolName,
          isEnabled: tool.isEnabled !== undefined ? tool.isEnabled : true,
          parameters: tool.parameters || {},
          customInstructions: tool.customInstructions,
        })) || [],
      subjectExpertise: dto.subjectExpertise || [],
      reactConfig: (dto.reactConfig as any) || (mappedReactConfig as any),
      graphConfig: dto.graphConfig as any,
      isPublic: dto.isPublic || false,
      userId: dto.userId,
      metadata: {},
    };

    return entity;
  }

  private transformUpdateDtoToEntity(
    dto: UpdateAssistantDto,
  ): Partial<Assistant> {
    const entity: Partial<Assistant> = {};
    const mapType = (t?: string) => {
      if (!t) return undefined;
      const v = String(t).toLowerCase();
      if (v === 'react' || v === 'react_agent' || v === 'react-agent')
        return AssistantType.REACT_AGENT;
      if (v === 'graph' || v === 'graph_agent' || v === 'graph-agent')
        return AssistantType.GRAPH_AGENT;
      return (Object.values(AssistantType) as string[]).includes(t as any)
        ? (t as any)
        : undefined;
    };
    const mapMode = (m?: any) =>
      m && (Object.values(AssistantMode) as any).includes(m) ? m : undefined;

    if (dto.description !== undefined) entity.description = dto.description;
    const t = mapType(dto.type);
    if (t !== undefined) entity.type = t;
    const m = mapMode(dto.primaryMode);
    if (m !== undefined) entity.primaryMode = m;
    if (dto.agentType !== undefined) entity.agentType = dto.agentType;
    if (dto.blocks !== undefined) {
      entity.blocks = dto.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        config: block.config,
        prompt: block.prompt,
        requiresUserInput: block.requiresUserInput || false,
        next: block.next,
      }));
    }
    if (dto.customPrompts !== undefined) {
      entity.customPrompts = dto.customPrompts.map((prompt) => ({
        name: prompt.name,
        content: prompt.content,
        priority: prompt.priority || 0,
        tags: prompt.tags || [],
        metadata: prompt.metadata || {},
      }));
    }
    if (dto.contextBlocks !== undefined) {
      entity.contextBlocks = dto.contextBlocks.map((block) => ({
        name: block.name,
        content: block.content,
        isActive: block.isActive !== undefined ? block.isActive : true,
        applicableTopics: block.applicableTopics || [],
        metadata: block.metadata || {},
      }));
    }
    if (dto.tools !== undefined) {
      entity.tools = dto.tools.map((tool) => ({
        toolName: tool.toolName,
        isEnabled: tool.isEnabled !== undefined ? tool.isEnabled : true,
        parameters: tool.parameters || {},
        customInstructions: tool.customInstructions,
      }));
    }
    if (dto.subjectExpertise !== undefined)
      entity.subjectExpertise = dto.subjectExpertise;
    // Map flexible 'settings' (if provided) into reactConfig on update
    const settingsDto = (dto as any).settings;
    if (settingsDto) {
      entity.reactConfig = {
        ...(entity.reactConfig || ({} as any)),
        intelligence: settingsDto.intelligence
          ? {
              llm: {
                provider: settingsDto.intelligence.llm?.provider,
                model: settingsDto.intelligence.llm?.model,
                tokenLimit: settingsDto.intelligence.llm?.tokenLimit,
              },
              escalate: settingsDto.intelligence.escalate,
              providerEscalationOptions:
                settingsDto.intelligence.providerEscalationOptions,
              modelEscalationTable:
                settingsDto.intelligence.modelEscalationTable,
            }
          : undefined,
        memory: settingsDto.memory,
        tools: settingsDto.tools,
        cot: {
          temperature: settingsDto.intelligence?.llm?.temperature,
        },
      } as any;
    }
    if (dto.reactConfig !== undefined)
      entity.reactConfig = {
        ...(entity.reactConfig as any),
        ...(dto.reactConfig as any),
      } as any;
    if (dto.graphConfig !== undefined)
      entity.graphConfig = dto.graphConfig as any;
    if (dto.isPublic !== undefined) entity.isPublic = dto.isPublic;
    if (dto.userId !== undefined) entity.userId = dto.userId;

    return entity;
  }
}
