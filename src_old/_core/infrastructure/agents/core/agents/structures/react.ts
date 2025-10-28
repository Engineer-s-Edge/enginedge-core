import { Inject } from '@nestjs/common';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import BaseAgent from './base';
import { Toolkit } from '@core/infrastructure/agents/tools/toolkit.service';
import AgentMemory from '@core/infrastructure/agents/components/memory/memory.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { ConversationRepository } from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import {
  ReActAgentConfig,
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  AgentState,
} from '../types/agent.entity';
import { CheckpointService } from '@core/infrastructure/agents/components/vectorstores/services/checkpoint.service';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';
import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import { TextSplitterConfig } from '@core/infrastructure/agents/components/textsplitters/textsplitter.factory';
import { LoaderService } from '@core/infrastructure/agents/components/loaders/loader.service';
import { UserIdType } from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

export class ReActAgent extends BaseAgent {
  private settings: ReActAgentConfig;

  constructor(
    @Inject(Toolkit) tools: Toolkit,
    @Inject(AgentMemory) memory: AgentMemory,
    @Inject(LLMService) llm: LLMService,
    @Inject(ConversationRepository)
    protected conversationRepository: ConversationRepository,
    @Inject(VectorStoreService) protected vectorStore: VectorStoreService,
    @Inject(CheckpointService) protected checkpointService: CheckpointService,
    @Inject(LoaderService) protected loaderService: LoaderService,
    settings: ReActAgentConfig,
    config: {
      memoryConfig: AgentMemoryConfig;
      checkpointConfig: AgentCheckpointConfig;
      intelligenceConfig: AgentIntelligenceConfig;
      loaderConfig: AgentLoaderConfig;
      textsplitterConfig: TextSplitterConfig;
      embedderConfig: EmbeddingOptions;
    },
    protected userId: UserIdType,
    logger: MyLogger,
  ) {
    super(
      tools,
      memory,
      llm,
      conversationRepository,
      vectorStore,
      checkpointService,
      loaderService,
      config,
      userId,
      logger,
    );

    this.logger.info('ReActAgent initializing', ReActAgent.name);

    this.emit('react-agent-initializing', {
      settings,
      timestamp: new Date(),
    });

    // Validate that all required configuration is present
    if (!settings || typeof settings !== 'object') {
      this.logger.error(
        'ReActAgent configuration validation failed - settings not provided or invalid',
        ReActAgent.name,
      );
      throw new Error('ReActAgent requires complete configuration settings');
    }

    // Use the complete settings directly - no merging with defaults
    this.settings = settings;
    this.logger.debug(
      `ReActAgent settings loaded - ID: ${this.settings._id}, enabled: ${this.settings.enabled}`,
      ReActAgent.name,
    );

    // Use the _id field for agent identification
    this._id = this.settings._id;

    // Use the state field to set agent state
    this.state = this.settings.state;

    // Check if agent is enabled - if not, set to stopped state
    if (!this.settings.enabled) {
      this.logger.warn(
        `ReActAgent ${this.settings._id} is disabled, setting state to STOPPED`,
        ReActAgent.name,
      );
      this.state = AgentState.STOPPED;
      this.emit('react-agent-disabled', {
        agentId: this.settings._id,
        timestamp: new Date(),
      });
    }

    // Set the custom prompt template for ReAct using cot.promptTemplate
    this.custom_prompt = this.settings.cot.promptTemplate;
    this.logger.debug(
      `Custom prompt template set, length: ${this.custom_prompt.length}`,
      ReActAgent.name,
    );

    // Update intelligence config using all intelligence fields
    if (this.intelligenceConfig && this.settings.intelligence) {
      this.logger.debug(
        `Updating intelligence config - provider: ${this.settings.intelligence.llm.provider}, model: ${this.settings.intelligence.llm.model}`,
        ReActAgent.name,
      );
      Object.assign(this.intelligenceConfig, this.settings.intelligence);

      // Apply LLM configuration
      Object.assign(
        this.intelligenceConfig.llm,
        this.settings.intelligence.llm,
      );
    } // Apply tools from settings - register each tool with the toolkit
    if (this.settings.tools && this.settings.tools.length > 0) {
      this.logger.info(
        `Registering ${this.settings.tools.length} tools with ReActAgent`,
        ReActAgent.name,
      );
      // Register the configured tools with the injected toolkit
      this.settings.tools.forEach((tool) => {
        this.tools.register(tool);
      });
      this.logger.info(
        `Successfully registered ${this.settings.tools.length} tools`,
        ReActAgent.name,
      );
    }

    this.logger.info(
      'ReActAgent configuration completed successfully',
      ReActAgent.name,
    );
    this.emit('react-agent-configured', {
      agentId: this.settings._id,
      maxSteps: this.settings.cot.maxSteps,
      temperature: this.settings.cot.temperature,
      provider: this.settings.intelligence.llm.provider,
      model: this.settings.intelligence.llm.model,
      cotEnabled: this.settings.cot.enabled,
      selfConsistencyEnabled: this.settings.cot.selfConsistency.enabled,
      toolsCount: this.settings.tools.length,
      canModifyStorage: this.settings.canModifyStorage,
      escalationEnabled: this.settings.intelligence.escalate,
      timestamp: new Date(),
    });
  }

  // Override buildPrompt to include few-shot examples
  protected override async buildPrompt(
    userprompt: string,
    newMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
    attachments?: {
      files: File[];
      action: 'vstore' | 'deliver' | 'parse';
    }[],
    intelligence?: AgentIntelligenceConfig,
  ): Promise<HumanMessage> {
    this.logger.info(
      `Building prompt for ReActAgent, user prompt length: ${userprompt.length}`,
      ReActAgent.name,
    );
    try {
      // Get the base prompt from parent
      const basePrompt = await super.buildPrompt(
        userprompt,
        newMessages,
        tokenTarget,
        contentSequence,
        attachments,
        intelligence,
      );

      // If few-shot examples are configured, inject them into the prompt
      if (
        this.settings.cot.fewShotExamples &&
        this.settings.cot.fewShotExamples.length > 0
      ) {
        let promptContent = basePrompt.content as string;

        // Build few-shot examples section with XML format
        // NOTE: example fields already contain XML tags, just concatenate them
        const fewShotSection = this.settings.cot.fewShotExamples
          .map((example) => {
            let exampleText = `Question: ${example.input}\n`;
            if (example.thought) exampleText += `${example.thought}\n`;
            if (example.action) exampleText += `${example.action}\n`;
            if (example.observation) exampleText += `${example.observation}\n`;
            if (example.finalAnswer) exampleText += `${example.finalAnswer}\n`;
            return exampleText + '\n';
          })
          .join('');

        // Insert few-shot examples before the final "Question: {input}" part
        // Look for the last occurrence of "Question:" and insert examples before it
        const questionIndex = promptContent.lastIndexOf('Question:');
        if (questionIndex !== -1) {
          promptContent =
            promptContent.substring(0, questionIndex) +
            'Here are some examples:\n\n' +
            fewShotSection +
            promptContent.substring(questionIndex);
        } else {
          // If no "Question:" found, append to the end
          promptContent += '\n\nHere are some examples:\n\n' + fewShotSection;
        }

        this.emit('react-few-shot-examples-injected', {
          exampleCount: this.settings.cot.fewShotExamples.length,
          promptTokens: this.llm.countTokens(promptContent, {
            providerName: this.intelligenceConfig.llm.provider,
            modelId: this.intelligenceConfig.llm.model,
          }),
          timestamp: new Date(),
        });

        this.logger.info(
          `Injected ${this.settings.cot.fewShotExamples.length} few-shot examples into prompt`,
          ReActAgent.name,
        );
        return new HumanMessage(promptContent);
      }

      this.logger.info(
        'Prompt built successfully without few-shot examples',
        ReActAgent.name,
      );
      return basePrompt;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Failed to build prompt for ReActAgent\n' + (info.stack || ''),
        ReActAgent.name,
      );
      throw new Error(info.message);
    }
  }

  // Helper method to check if we have complete action blocks
  private hasCompleteActionBlock(buffer: string): boolean {
    this.logger.debug(
      `Checking for complete action blocks in buffer of length: ${buffer.length}`,
      ReActAgent.name,
    );
    // Look for complete <action>...</action> blocks with <tool> and <input> tags
    const actionPattern = /<action>.*?<tool>.*?<\/tool>.*?<input>.*?<\/input>.*?<\/action>/is;
    const hasComplete = actionPattern.test(buffer);
    
    this.logger.debug(
      `Complete XML action block found: ${hasComplete}`,
      ReActAgent.name,
    );
    return hasComplete;
  }

  // Helper method to parse multiple action blocks from buffer
  private parseActionBlocks(
    buffer: string,
  ): Array<{ action: string; input: string | Record<string, unknown> }> {
    this.logger.debug('Parsing action blocks from buffer', ReActAgent.name);
    const actions: Array<{
      action: string;
      input: string | Record<string, unknown>;
    }> = [];
    
    // Match <action>...</action> blocks
    const actionPattern = /<action>(.*?)<\/action>/gis;
    let match;
    
    while ((match = actionPattern.exec(buffer)) !== null) {
      const actionContent = match[1];
      
      // Extract tool name
      const toolMatch = actionContent.match(/<tool>(.*?)<\/tool>/is);
      // Extract input
      const inputMatch = actionContent.match(/<input>(.*?)<\/input>/is);
      
      if (toolMatch && inputMatch) {
        const actionName = toolMatch[1].trim();
        const actionInput = inputMatch[1].trim();

        try {
          const parsedInput = JSON.parse(actionInput);
          actions.push({ action: actionName, input: parsedInput });
          this.logger.debug(
            `Parsed action: ${actionName} with JSON input`,
            ReActAgent.name,
          );
        } catch {
          // If JSON parsing fails, treat as string input
          actions.push({ action: actionName, input: actionInput });
          this.logger.debug(
            `Parsed action: ${actionName} with string input`,
            ReActAgent.name,
          );
        }
      }
    }

    this.logger.debug(
      `Parsed ${actions.length} action blocks from buffer`,
      ReActAgent.name,
    );
    return actions;
  }
  public override async stream(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<AsyncIterable<string>> {
    this.logger.info('Starting ReActAgent stream operation', ReActAgent.name);
    this.logger.debug(
      `Self-consistency enabled: ${this.settings.cot.selfConsistency.enabled}, samples: ${this.settings.cot.selfConsistency.samples}`,
      ReActAgent.name,
    );

    // Check if self-consistency is enabled
    if (
      this.settings.cot.selfConsistency.enabled &&
      this.settings.cot.selfConsistency.samples > 1
    ) {
      this.logger.info(
        'Using self-consistency approach for reasoning',
        ReActAgent.name,
      );
      // Use self-consistency approach
      return this._selfConsistentStreamImplementation(
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
    } else {
      this.logger.info('Using single-path reasoning approach', ReActAgent.name);
      // Use regular single-path reasoning
      return this._streamImplementation(
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
    }
  }

  // Self-consistent stream implementation that aggregates multiple reasoning paths
  private async *_selfConsistentStreamImplementation(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): AsyncGenerator<string, void, unknown> {
    this.logger.info(
      'Starting self-consistency stream implementation',
      ReActAgent.name,
    );
    try {
      // Run multiple reasoning paths
      const reasoningPaths = await this.performSelfConsistency(
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );

      this.logger.debug(
        `Self-consistency completed with ${reasoningPaths.length} reasoning paths`,
        ReActAgent.name,
      );
      // Select the best answer using voting
      const bestAnswer = this.selectBestAnswer(reasoningPaths);

      this.logger.info(
        `Best answer selected from ${reasoningPaths.length} paths`,
        ReActAgent.name,
      );
      this.emit('react-self-consistency-result-selected', {
        selectedAnswer: bestAnswer,
        totalPaths: reasoningPaths.length,
        timestamp: new Date(),
      });

      // Yield the best answer in XML format
      yield `<answer>${bestAnswer}</answer>`;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Self-consistency failed, attempting fallback\n' + (info.stack || ''),
        ReActAgent.name,
      );
      // If self-consistency fails, try intelligence escalation if enabled
      if (this.settings.intelligence.escalate) {
        this.logger.info(
          'Attempting intelligence escalation as fallback',
          ReActAgent.name,
        );
        const escalatedResult = await this.attemptIntelligenceEscalation(
          input,
          latestMessages,
          tokenTarget,
          contentSequence,
          error instanceof Error ? error.message : String(error),
        );

        if (escalatedResult) {
          this.logger.info(
            'Intelligence escalation succeeded',
            ReActAgent.name,
          );
          yield escalatedResult;
          return;
        }
      }

      this.logger.info(
        'Falling back to regular stream implementation',
        ReActAgent.name,
      );
      // If escalation also fails or isn't enabled, fall back to regular stream
      const fallbackStream = this._streamImplementation(
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
      for await (const chunk of fallbackStream) {
        yield chunk;
      }
    }
  } // Internal implementation as a generator
  private async *_streamImplementation(
    input: string,
    history: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): AsyncGenerator<string, void, unknown> {
    this.logger.info('Starting ReAct stream implementation', ReActAgent.name);
    this.logger.debug(
      `Max steps: ${this.settings.cot.maxSteps}, CoT enabled: ${this.settings.cot.enabled}`,
      ReActAgent.name,
    );

    await this.awaitInit();
    const messages: BaseMessage[] = [...history];
    let done = false;
    let steps = 0;

    this.emit('react-reasoning-start', {
      input,
      maxSteps: this.settings.cot.maxSteps,
      timestamp: new Date(),
    });

    try {
      while (!done && steps < this.settings.cot.maxSteps) {
        this.logger.debug(
          `Starting ReAct step ${steps + 1}/${this.settings.cot.maxSteps}`,
          ReActAgent.name,
        );
        this.emit('react-step-start', {
          stepNumber: steps + 1,
          maxSteps: this.settings.cot.maxSteps,
          input,
          timestamp: new Date(),
        });

        const prompt = await this.buildPrompt(
          input,
          history,
          tokenTarget,
          contentSequence,
        );

        this.emit('react-thought-generating', {
          stepNumber: steps + 1,
          promptTokens: this.llm.countTokens(prompt.content as string, {
            providerName: this.intelligenceConfig.llm.provider,
            modelId: this.intelligenceConfig.llm.model,
          }),
          timestamp: new Date(),
        });

        // Get runtime configuration (may have been updated)
        const runtimeConfig = this.getRuntimeConfig();

        // Build LLM configuration using all COT parameters with runtime values
        const llmConfig = {
          temperature: runtimeConfig.temperature,
          topP: this.settings.cot.topP,
          frequencyPenalty: this.settings.cot.frequencyPenalty,
          presencePenalty: this.settings.cot.presencePenalty,
          maxTokens: runtimeConfig.maxTokens,
          stop: this.settings.cot.stopSequences,
        };

        // Use compatible options for chat with full COT configuration
        const llmStream = await this.llm.chat([prompt], {
          stream: true,
          abort: this.abortController?.signal,
          config: llmConfig,
          providerName: this.intelligenceConfig.llm.provider,
          modelId: this.intelligenceConfig.llm.model,
        });

        let buffer = '';
        let thoughtText = '';
        let actionDetected = false;
        let finalAnswerDetected = false;

        for await (const chunk of llmStream) {
          const text = chunk.response;
          buffer += text;

          // this.logger.debug(
          //   `ReAct received chunk: ${text.length} chars, buffer now: ${buffer.length} chars - "${text.substring(0, 50)}..."`,
          //   ReActAgent.name,
          // );

          this.emit('react-streaming-chunk', {
            chunk: text,
            stepNumber: steps + 1,
            bufferLength: buffer.length,
            timestamp: new Date(),
          });

          // Only yield the new text chunk, not the entire buffer
          yield text;

          // Check for thinking completion
          if (/<thinking>/i.test(buffer) && !thoughtText && /<\/thinking>/i.test(buffer)) {
            const thoughtMatch = buffer.match(
              /<thinking>(.*?)<\/thinking>/is,
            );
            if (thoughtMatch) {
              thoughtText = thoughtMatch[1].trim();
              this.emit('react-thought-completed', {
                stepNumber: steps + 1,
                thought: thoughtText,
                timestamp: new Date(),
              });
            }
          }

          // Check for final answer
          if (/<\/answer>/i.test(buffer) && !finalAnswerDetected) {
            finalAnswerDetected = true;
            const finalAnswerMatch = buffer.match(/<answer>(.*?)<\/answer>/is);
            if (finalAnswerMatch) {
              this.emit('react-final-answer', {
                answer: finalAnswerMatch[1].trim(),
                stepNumber: steps + 1,
                totalSteps: steps + 1,
                timestamp: new Date(),
              });
            }
            done = true;
            break;
          }

          // Check for action detection - support multiple actions
          if (
            /<action>/i.test(buffer) &&
            /<\/action>/i.test(buffer) &&
            !actionDetected
          ) {
            // Check if we have complete action(s) - look for the end pattern
            const hasCompleteActions = this.hasCompleteActionBlock(buffer);
            if (hasCompleteActions) {
              actionDetected = true;
              break;
            }
          }
        }

        if (!done && actionDetected) {
          this.logger.debug(
            `Action detected in step ${steps + 1}, parsing action blocks`,
            ReActAgent.name,
          );
          // Parse multiple actions from buffer
          const actionBlocks = this.parseActionBlocks(buffer);

          if (actionBlocks.length === 0) {
            this.logger.error(
              `No valid action blocks found in step ${steps + 1}`,
              ReActAgent.name,
            );
            this.emit('react-parsing-error', {
              stepNumber: steps + 1,
              error: 'No valid action blocks found',
              buffer: buffer.substring(0, 200) + '...',
              timestamp: new Date(),
            });
            throw new Error('No valid action blocks found');
          }

          // Convert to ToolCall format
          const toolCalls = actionBlocks.map((block) => ({
            name: block.action,
            args: block.input,
          }));

          this.logger.debug(
            `Executing ${toolCalls.length} tool calls in step ${steps + 1}`,
            ReActAgent.name,
          );
          this.emit('react-actions-planned', {
            stepNumber: steps + 1,
            actions: toolCalls,
            thought: thoughtText,
            timestamp: new Date(),
          });

          // Execute the tools using toolkit's executeCalls method
          this.emit('react-multi-tool-execution-start', {
            stepNumber: steps + 1,
            toolCalls,
            timestamp: new Date(),
          });

          try {
            // Check if storage modification is required and allowed
            const requiresStorageModification = toolCalls.some(
              (call) =>
                call.name.toLowerCase().includes('storage') ||
                call.name.toLowerCase().includes('save') ||
                call.name.toLowerCase().includes('write') ||
                call.name.toLowerCase().includes('memory'),
            );

            if (requiresStorageModification && !this.canModifyStorage()) {
              this.logger.warn(
                `Storage modification denied in step ${steps + 1} - agent not configured to allow storage changes`,
                ReActAgent.name,
              );
              this.emit('react-storage-modification-denied', {
                stepNumber: steps + 1,
                toolCalls,
                timestamp: new Date(),
              });

              const errorObs = `Observation: Storage modification not allowed by agent configuration`;
              messages.push(new AIMessage(errorObs));
              yield errorObs;
            } else {
              // Use executeCalls for multi-tool execution with parallelism support
              const results = await this.tools.executeCalls(toolCalls);

              this.logger.debug(
                `Tool execution completed in step ${steps + 1} - ${results.length} results`,
                ReActAgent.name,
              );
              // Format observations - handle array of results
              let observationText = '';
              if (results.length === 1) {
                observationText = `Observation: ${results[0]}`;
              } else {
                // Be defensive: align results to tool calls length to avoid undefined access
                const pairCount = Math.min(results.length, toolCalls.length);
                const parts: string[] = [];
                for (let i = 0; i < pairCount; i++) {
                  const toolName = toolCalls[i]?.name ?? `tool-${i + 1}`;
                  parts.push(
                    `Observation ${i + 1} (${toolName}): ${results[i]}`,
                  );
                }
                // If we somehow received more results than planned tool calls, append generically
                for (let i = pairCount; i < results.length; i++) {
                  parts.push(`Observation ${i + 1}: ${results[i]}`);
                }
                observationText = parts.join('\n');
              }

              messages.push(new AIMessage(observationText));

              this.emit('react-multi-tool-execution-complete', {
                stepNumber: steps + 1,
                toolCalls,
                results,
                timestamp: new Date(),
              });

              this.emit('react-observations-generated', {
                stepNumber: steps + 1,
                observations: results,
                toolCount: toolCalls.length,
                timestamp: new Date(),
              });

              yield observationText;
            }
          } catch (toolError) {
            const errorMessage =
              toolError instanceof Error
                ? toolError.message
                : String(toolError);

            this.logger.error(
              `Tool execution failed in step ${steps + 1}: ${errorMessage}`,
              ReActAgent.name,
            );
            this.emit('react-multi-tool-execution-error', {
              stepNumber: steps + 1,
              toolCalls,
              error: errorMessage,
              timestamp: new Date(),
            });

            const errorObs = `Observation: Error executing tools: ${errorMessage}`;
            messages.push(new AIMessage(errorObs));
            yield errorObs;
          }
        }

        steps++;

        this.logger.debug(
          `ReAct step ${steps} completed - thought: ${!!thoughtText}, action: ${actionDetected}, final: ${finalAnswerDetected}`,
          ReActAgent.name,
        );
        
        // Log the thinking process for debugging
        if (thoughtText) {
          this.logger.debug(
            `Step ${steps} thinking: ${thoughtText.substring(0, 200)}${thoughtText.length > 200 ? '...' : ''}`,
            ReActAgent.name,
          );
        }
        this.emit('react-step-complete', {
          stepNumber: steps,
          thoughtGenerated: !!thoughtText,
          actionExecuted: actionDetected,
          finalAnswerReached: finalAnswerDetected,
          timestamp: new Date(),
        });
      }

      if (!done) {
        this.logger.warn(
          `Max ReAct steps (${this.settings.cot.maxSteps}) exceeded`,
          ReActAgent.name,
        );
        this.emit('react-max-steps-exceeded', {
          maxSteps: this.settings.cot.maxSteps,
          finalStep: steps,
          input,
          timestamp: new Date(),
        });
        
        // Instead of throwing an error, return the last thinking piece
        const lastMessage = messages[messages.length - 1];
        const lastThinking = typeof lastMessage?.content === 'string' 
          ? lastMessage.content 
          : 'I need more time to think about this.';
        this.logger.info(
          `Returning last thinking piece due to max steps exceeded: ${lastThinking.substring(0, 100)}...`,
          ReActAgent.name,
        );
        
        // Yield the last thinking piece as the final answer in XML format
        yield `\n\n<answer>${lastThinking}</answer>`;
        return;
      }

      this.logger.info(
        `ReAct reasoning completed successfully in ${steps} steps`,
        ReActAgent.name,
      );
      this.emit('react-reasoning-complete', {
        totalSteps: steps,
        maxSteps: this.settings.cot.maxSteps,
        input,
        timestamp: new Date(),
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'ReAct reasoning failed\n' + (info.stack || ''),
        ReActAgent.name,
      );
      // If main reasoning fails and intelligence escalation is enabled, try escalation
      if (this.settings.intelligence.escalate) {
        this.logger.info(
          'Attempting intelligence escalation due to reasoning failure',
          ReActAgent.name,
        );
        this.emit('react-intelligence-escalation-triggered', {
          originalError: error instanceof Error ? error.message : String(error),
          currentProvider: this.intelligenceConfig.llm.provider,
          timestamp: new Date(),
        });

        const escalatedResult = await this.attemptIntelligenceEscalation(
          input,
          history,
          tokenTarget,
          contentSequence,
          error instanceof Error ? error.message : String(error),
        );

        if (escalatedResult) {
          this.logger.info(
            'Intelligence escalation succeeded',
            ReActAgent.name,
          );
          yield escalatedResult;
          return;
        }
      }

      // Re-throw the error if escalation failed or wasn't enabled
      throw new Error(info.message);
    }
  }

  public async invoke(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    this.logger.info('Starting ReActAgent invoke operation', ReActAgent.name);
    let final = '';
    // Use the defined stream method that returns a Promise<AsyncIterable<any>>
    const streamResult = await this.stream(
      input,
      latestMessages,
      tokenTarget,
      contentSequence,
    );

    // Iterate through the stream results and accumulate
    for await (const chunk of streamResult) {
      final += chunk;
    }

    // Extract the final answer if it exists (XML format), otherwise return the accumulated response
    const finalAnswerMatch = final.match(/<answer>(.*?)<\/answer>/is);
    const finalAnswer = finalAnswerMatch ? finalAnswerMatch[1].trim() : final.trim();
    
    this.logger.info(
      `ReActAgent invoke completed - response length: ${finalAnswer.length}`,
      ReActAgent.name,
    );
    return finalAnswer;
  }

  // Helper method to implement self-consistency by running multiple reasoning paths
  private async performSelfConsistency(
    input: string,
    history: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string[]> {
    const { enabled, samples } = this.settings.cot.selfConsistency;

    if (!enabled || samples <= 1) {
      return [];
    }

    this.emit('react-self-consistency-start', {
      samples,
      input,
      timestamp: new Date(),
    });

    const _reasoningPaths: string[] = [];

    // Run multiple reasoning paths in parallel for efficiency
    const pathPromises = Array.from({ length: samples }, async (_, index) => {
      try {
        // Slightly vary temperature for diversity if temperatureModifiable is enabled
        let pathTemperature = this.settings.cot.temperature;
        if (this.settings.cot.temperatureModifiable) {
          // Add small random variation to temperature for each path
          pathTemperature = Math.min(
            1.0,
            Math.max(
              0.0,
              this.settings.cot.temperature + (Math.random() - 0.5) * 0.2,
            ),
          );
        }

        this.emit('react-self-consistency-path-start', {
          pathIndex: index + 1,
          temperature: pathTemperature,
          timestamp: new Date(),
        });

        // Create a separate reasoning path
        let pathResult = '';
        const pathStream = this._streamImplementation(
          input,
          history,
          tokenTarget,
          contentSequence,
        );

        for await (const chunk of pathStream) {
          pathResult += chunk;
        }

        // Extract final answer from the path
        const finalAnswerMatch = pathResult.match(/FinalAnswer:\s*(.*)/i);
        const finalAnswer = finalAnswerMatch
          ? finalAnswerMatch[1].trim()
          : pathResult;

        this.emit('react-self-consistency-path-complete', {
          pathIndex: index + 1,
          finalAnswer,
          timestamp: new Date(),
        });

        return finalAnswer;
      } catch (error) {
        this.emit('react-self-consistency-path-error', {
          pathIndex: index + 1,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        });
        return null;
      }
    });

    // Wait for all paths to complete
    const results = await Promise.all(pathPromises);
    const validResults = results.filter(
      (result) => result !== null,
    ) as string[];

    this.emit('react-self-consistency-complete', {
      totalPaths: samples,
      successfulPaths: validResults.length,
      results: validResults,
      timestamp: new Date(),
    });

    return validResults;
  }

  // Helper method to vote on the most consistent answer from multiple reasoning paths
  private selectBestAnswer(answers: string[]): string {
    if (answers.length === 0) {
      return '';
    }

    if (answers.length === 1) {
      return answers[0];
    }

    // Simple voting mechanism - count similar answers
    const answerGroups = new Map<
      string,
      { count: number; answers: string[] }
    >();

    answers.forEach((answer) => {
      const normalizedAnswer = answer.toLowerCase().trim();

      // Find if this answer is similar to any existing group
      let groupKey = normalizedAnswer;
      for (const [existingKey] of answerGroups) {
        // Simple similarity check - if answers share significant common words
        const existingWords = existingKey.split(/\s+/);
        const currentWords = normalizedAnswer.split(/\s+/);
        const commonWords = existingWords.filter(
          (word) => word.length > 3 && currentWords.includes(word),
        );

        // If they share more than 50% of significant words, group them
        if (
          commonWords.length >
          Math.max(existingWords.length, currentWords.length) * 0.5
        ) {
          groupKey = existingKey;
          break;
        }
      }

      if (!answerGroups.has(groupKey)) {
        answerGroups.set(groupKey, { count: 0, answers: [] });
      }

      const group = answerGroups.get(groupKey)!;
      group.count++;
      group.answers.push(answer);
    });

    // Find the group with the highest count
    let bestGroup = { count: 0, answers: [] as string[] };
    for (const group of answerGroups.values()) {
      if (group.count > bestGroup.count) {
        bestGroup = group;
      }
    }

    // Return the first answer from the most voted group
    return bestGroup.answers[0] || answers[0];
  }

  // Helper method to implement intelligence escalation
  private async attemptIntelligenceEscalation(
    input: string,
    history: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
    previousError?: string,
  ): Promise<string | null> {
    if (
      !this.settings.intelligence.escalate ||
      !this.settings.intelligence.providerEscalationOptions
    ) {
      return null;
    }

    const currentProvider = this.intelligenceConfig.llm.provider;
    const escalationOptions =
      this.settings.intelligence.providerEscalationOptions;

    // Find next provider in escalation chain
    const currentIndex = escalationOptions.indexOf(currentProvider as any);
    const nextProviderIndex = currentIndex + 1;

    if (nextProviderIndex >= escalationOptions.length) {
      this.emit('react-intelligence-escalation-exhausted', {
        currentProvider,
        attemptedProviders: escalationOptions.slice(0, nextProviderIndex),
        error: previousError,
        timestamp: new Date(),
      });
      return null;
    }

    const nextProvider = escalationOptions[nextProviderIndex];

    this.emit('react-intelligence-escalation-attempt', {
      fromProvider: currentProvider,
      toProvider: nextProvider,
      reason: previousError || 'Performance optimization',
      timestamp: new Date(),
    });

    try {
      // Get escalation model from modelEscalationTable if available
      let escalationModel = this.intelligenceConfig.llm.model;
      let escalationTokenLimit = this.intelligenceConfig.llm.tokenLimit;

      if (
        this.settings.intelligence.modelEscalationTable &&
        nextProvider in this.settings.intelligence.modelEscalationTable
      ) {
        const models = (this.settings.intelligence.modelEscalationTable as any)[
          nextProvider
        ];
        if (models && models.length > 0) {
          escalationModel = models[0].model;
          escalationTokenLimit = models[0].tokenLimit;
        }
      }

      // Temporarily switch to the escalated provider
      const _originalConfig = { ...this.intelligenceConfig };
      this.intelligenceConfig.llm.provider = nextProvider;
      this.intelligenceConfig.llm.model = escalationModel;
      this.intelligenceConfig.llm.tokenLimit = escalationTokenLimit;

      // Attempt the operation with the escalated provider
      let result = '';
      const escalatedStream = this._streamImplementation(
        input,
        history,
        tokenTarget,
        contentSequence,
      );

      for await (const chunk of escalatedStream) {
        result += chunk;
      }

      this.emit('react-intelligence-escalation-success', {
        provider: nextProvider,
        model: escalationModel,
        result: result.substring(0, 100) + '...', // Truncated result for logging
        timestamp: new Date(),
      });

      // Keep the escalated configuration for future use
      return result;
    } catch (escalationError) {
      // Restore original configuration on failure
      this.intelligenceConfig.llm.provider = currentProvider;

      this.emit('react-intelligence-escalation-failed', {
        provider: nextProvider,
        error:
          escalationError instanceof Error
            ? escalationError.message
            : String(escalationError),
        timestamp: new Date(),
      });

      // Recursively try the next provider in the chain
      return this.attemptIntelligenceEscalation(
        input,
        history,
        tokenTarget,
        contentSequence,
        escalationError instanceof Error
          ? escalationError.message
          : String(escalationError),
      );
    }
  }

  // Helper method to check if storage modification is allowed
  private canModifyStorage(): boolean {
    return this.settings.canModifyStorage;
  }
  // Helper method to get runtime-adjustable parameters
  private getRuntimeConfig(): { temperature: number; maxTokens: number } {
    return {
      temperature: this.settings.cot.temperature,
      maxTokens: this.settings.cot.maxTokens,
    };
  }

  // Public method to get current maxSteps value
  public getMaxSteps(): number {
    return this.settings.cot.maxSteps;
  }
  // Method to update runtime parameters if modifiable
  public updateRuntimeParameters(updates: {
    temperature?: number;
    maxTokens?: number;
    maxSteps?: number;
  }): boolean {
    let updated = false;

    if (
      updates.temperature !== undefined &&
      this.settings.cot.temperatureModifiable
    ) {
      // Validate temperature range
      if (updates.temperature >= 0 && updates.temperature <= 1) {
        const oldTemp = this.settings.cot.temperature;
        (this.settings.cot as any).temperature = updates.temperature;

        this.emit('react-runtime-parameter-updated', {
          parameter: 'temperature',
          oldValue: oldTemp,
          newValue: updates.temperature,
          timestamp: new Date(),
        });
        updated = true;
      }
    }

    if (
      updates.maxTokens !== undefined &&
      this.settings.cot.maxTokensModifiable
    ) {
      // Validate maxTokens range
      if (
        updates.maxTokens > 0 &&
        updates.maxTokens <= this.intelligenceConfig.llm.tokenLimit
      ) {
        const oldMaxTokens = this.settings.cot.maxTokens;
        (this.settings.cot as any).maxTokens = updates.maxTokens;

        this.emit('react-runtime-parameter-updated', {
          parameter: 'maxTokens',
          oldValue: oldMaxTokens,
          newValue: updates.maxTokens,
          timestamp: new Date(),
        });
        updated = true;
      }
    }

    if (updates.maxSteps !== undefined) {
      // Validate maxSteps range (allow 1-100 steps as reasonable bounds)
      if (updates.maxSteps > 0 && updates.maxSteps <= 100) {
        const oldMaxSteps = this.settings.cot.maxSteps;
        (this.settings.cot as any).maxSteps = updates.maxSteps;

        this.emit('react-runtime-parameter-updated', {
          parameter: 'maxSteps',
          oldValue: oldMaxSteps,
          newValue: updates.maxSteps,
          timestamp: new Date(),
        });
        updated = true;
      }
    }

    return updated;
  }
}
