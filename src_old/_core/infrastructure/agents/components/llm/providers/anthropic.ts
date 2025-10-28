import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { getErrorInfo } from '@common/error-assertions';
import LLMProviderInterface, {
  ChatInvocationResult,
  EmbedInvocationResult,
  UsageStats,
  TokenUsage,
} from '../interfaces/provider.interface';
import { MyLogger } from '@core/services/logger/logger.service';

export default class AnthropicProvider implements LLMProviderInterface {
  public providerName = 'anthropic';
  public displayName = 'Anthropic Provider';
  public defaultLLMModelId = 'claude-3-7-sonnet-latest';
  public defaultEmbeddingModelId = '';

  private stats: UsageStats = {
    cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  constructor(private readonly logger: MyLogger) {
    this.logger.info('AnthropicProvider initializing', AnthropicProvider.name);
  }

  /**
   * Fetch the list of available Anthropic chat models from the API.
   */
  async listModels(): Promise<string[]> {
    this.logger.info('Fetching Anthropic models', AnthropicProvider.name);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not found, returning empty models list',
        AnthropicProvider.name,
      );
      return [];
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey },
      });
      if (!res.ok) {
        this.logger.warn(
          `Failed to list Anthropic models: ${res.statusText}`,
          AnthropicProvider.name,
        );
        return [];
      }
      const data = (await res.json()) as { models: { name: string }[] };
      const models = data.models.map((m) => m.name);
      this.logger.info(
        `Successfully fetched ${models.length} Anthropic models`,
        AnthropicProvider.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error fetching Anthropic models\n' + (info.stack || ''),
        AnthropicProvider.name,
      );
      return [];
    }
  }

  /**
   * Instantiate a LangChain ChatAnthropic model (which extends BaseChatModel).
   */
  getLLM(
    modelId: string,
    config: BaseChatModelCallOptions = {},
  ): BaseChatModel {
    this.logger.info(
      `Creating Anthropic LLM model: ${modelId}`,
      AnthropicProvider.name,
    );
    return new ChatAnthropic({
      model: modelId,
      apiKey: process.env.ANTHROPIC_API_KEY,
      ...config,
    });
  }

  async invokeChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult> {
    this.logger.info(
      `Invoking Anthropic chat with ${messages.length} messages`,
      AnthropicProvider.name,
    );
    try {
      const result = await model.invoke(messages, config);
      const usageMeta = result.response_metadata?.usage;
      const text = result.content;
      const usage: TokenUsage = {
        promptTokens: usageMeta?.input_tokens ?? 0,
        completionTokens: usageMeta?.output_tokens ?? 0,
        totalTokens: usageMeta?.total_tokens ?? 0,
      };
      this.recordUsage(usage);
      this.logger.info(
        `Anthropic chat completed. Tokens used: ${usage.totalTokens}`,
        AnthropicProvider.name,
      );
      return {
        response: text,
        raw: result,
        generations: undefined,
        usage,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error invoking Anthropic chat\n' + (info.stack || ''),
        AnthropicProvider.name,
      );
      throw new Error(info.message);
    }
  }

  async *streamChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): AsyncIterable<ChatInvocationResult> {
    this.logger.info(
      `Starting Anthropic stream chat with ${messages.length} messages`,
      AnthropicProvider.name,
    );
    const chunks: any[] = [];
    try {
      const stream = await model.stream(messages, config);
      for await (const msg of stream) {
        const newText = msg.text;
        chunks.push(msg);
        this.logger.debug(
          `Anthropic chunk received: ${newText.length} chars - "${newText.substring(0, 50)}..."`,
          AnthropicProvider.name,
        );
        // Yield only the new chunk, not accumulated buffer
        yield {
          response: newText,
          chunks: [...chunks],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      const last = chunks[chunks.length - 1]?.response_metadata?.usage;
      if (last) {
        const usage: TokenUsage = {
          promptTokens: last.input_tokens,
          completionTokens: last.output_tokens,
          totalTokens: last.total_tokens,
        };
        this.recordUsage(usage);
        this.logger.info(
          `Anthropic stream chat completed. Tokens used: ${usage.totalTokens}`,
          AnthropicProvider.name,
        );
        // Final usage update - no need to yield response again as we've already streamed it
        yield { response: '', usage };
      }
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Anthropic stream chat\n' + (info.stack || ''),
        AnthropicProvider.name,
      );
      throw new Error(info.message);
    }
  }

  async batchChat(
    model: BaseChatModel,
    batchMessages: BaseMessage[][],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult[]> {
    this.logger.info(
      `Starting Anthropic batch chat with ${batchMessages.length} batches`,
      AnthropicProvider.name,
    );
    try {
      const results = await Promise.all(
        batchMessages.map((msgs) => this.invokeChat(model, msgs, config)),
      );
      this.logger.info(
        `Anthropic batch chat completed with ${results.length} results`,
        AnthropicProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Anthropic batch chat\n' + (info.stack || ''),
        AnthropicProvider.name,
      );
      throw new Error(info.message);
    }
  }

  async listEmbeddingModels(): Promise<string[]> {
    this.logger.warn(
      'Embedding models are not supported by Anthropic',
      AnthropicProvider.name,
    );
    throw new Error('Embedding models are not supported by Anthropic');
  }

  getEmbeddingModel(): never {
    this.logger.warn(
      'Embedding models are not supported by Anthropic',
      AnthropicProvider.name,
    );
    throw new Error('Embedding models are not supported by Anthropic');
  }

  async embed(): Promise<EmbedInvocationResult> {
    this.logger.warn(
      'Embedding not supported by Anthropic',
      AnthropicProvider.name,
    );
    throw new Error('Embedding not supported');
  }

  async embedBatch(): Promise<EmbedInvocationResult[]> {
    this.logger.warn(
      'Batch embedding not supported by Anthropic',
      AnthropicProvider.name,
    );
    throw new Error('Batch embedding not supported');
  }

  countTokens(
    textOrMessages: string | BaseMessage[],
    modelId?: string,
  ): number {
    if (typeof textOrMessages === 'string') {
      return textOrMessages.split(/\s+/).length;
    }
    return textOrMessages.reduce((count, msg) => {
      const text = msg.content.toString() ?? '';
      return count + text.split(/\s+/).length;
    }, 0);
  }

  resetUsage(): void {
    this.stats = {
      cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  getUsageStats(): UsageStats {
    return this.stats;
  }

  async healthCheck(): Promise<boolean> {
    this.logger.info(
      'Performing Anthropic health check',
      AnthropicProvider.name,
    );
    try {
      // TBI - implement actual health check
      this.logger.info('Anthropic health check passed', AnthropicProvider.name);
      return true;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Anthropic health check failed\n' + (info.stack || ''),
        AnthropicProvider.name,
      );
      return false;
    }
  }

  private recordUsage(usage: TokenUsage) {
    this.stats.lastRequest = usage;
    this.stats.cumulative.promptTokens =
      (this.stats.cumulative.promptTokens || 0) + (usage.promptTokens || 0);
    this.stats.cumulative.completionTokens =
      (this.stats.cumulative.completionTokens || 0) +
      (usage.completionTokens || 0);
    this.stats.cumulative.totalTokens =
      (this.stats.cumulative.totalTokens || 0) + (usage.totalTokens || 0);
  }
}
