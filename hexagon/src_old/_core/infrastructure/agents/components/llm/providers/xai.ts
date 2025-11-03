import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage, MessageContent } from '@langchain/core/messages';
import type { Embeddings } from '@langchain/core/embeddings';

import { ChatXAI } from '@langchain/xai'; // xAI Grok chat integration :contentReference[oaicite:9]{index=9}
import { getErrorInfo } from '@common/error-assertions';

import LLMProviderInterface, {
  ChatInvocationResult,
  EmbedInvocationResult,
  UsageStats,
  TokenUsage,
} from '../interfaces/provider.interface';
import { MyLogger } from '@core/services/logger/logger.service';

export default class ChatXAIProvider implements LLMProviderInterface {
  public providerName = 'xai';
  public displayName = 'xAI Grok';
  public defaultLLMModelId = 'grok-beta';
  public defaultEmbeddingModelId = '';

  private stats: UsageStats = {
    cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  constructor(private readonly logger: MyLogger) {
    this.logger.info('ChatXAIProvider initializing', ChatXAIProvider.name);
  }

  /** List available Grok models via xAI's REST API */
  async listModels(): Promise<string[]> {
    this.logger.info('Fetching XAI models', ChatXAIProvider.name);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'XAI_API_KEY not found, returning empty models list',
        ChatXAIProvider.name,
      );
      return [];
    }
    try {
      const res = await fetch(`https://api.x.ai/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        this.logger.warn(
          `Failed to list XAI models: ${res.statusText}`,
          ChatXAIProvider.name,
        );
        return [];
      }
      const data = (await res.json()) as { models: { name: string }[] };
      const models = data.models.map((m) => m.name);
      this.logger.info(
        `Successfully fetched ${models.length} XAI models`,
        ChatXAIProvider.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error fetching XAI models\n' + (info.stack || ''),
        ChatXAIProvider.name,
      );
      return [];
    }
  }

  /** Instantiate the ChatXAI model */
  getLLM(
    modelId: string,
    config: BaseChatModelCallOptions = {},
  ): BaseChatModel {
    this.logger.info(
      `Creating XAI LLM model: ${modelId}`,
      ChatXAIProvider.name,
    );
    // Cast to any to avoid excessive generic instantiation from upstream types
    const XAIClass: any = ChatXAI as any;
    // @ts-ignore - suppress deep generic instantiation from upstream types
    return new XAIClass({
      model: modelId,
      ...(config as any),
    }) as unknown as BaseChatModel;
  }

  /** Invoke a chat completion */
  async invokeChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult> {
    this.logger.info(
      `Invoking XAI chat with ${messages.length} messages`,
      ChatXAIProvider.name,
    );
    try {
      const llm = model;
      // ChatXAI.invoke expects [role, content] tuples
      const aiMsg = await (llm as any).invoke(
        messages.map(
          (m) =>
            [
              typeof (m as any)._getType === 'function'
                ? (m as any)._getType()
                : 'human',
              (m as any).content,
            ] as [string, any],
        ),
        config as any,
      );
      // Count prompt tokens roughly via whitespace split
      const promptTokens = this.countTokens(messages);
      const usage: TokenUsage = {
        promptTokens,
        completionTokens: 0,
        totalTokens: promptTokens,
      };
      this.recordUsage(usage);
      const text = (aiMsg as any).text ?? '';
      this.logger.info(
        `XAI chat completed. Tokens used: ${usage.totalTokens}`,
        ChatXAIProvider.name,
      );
      return { response: text as MessageContent, raw: aiMsg, usage };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error invoking XAI chat\n' + (info.stack || ''),
        ChatXAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Stream token‑level chat responses */
  async *streamChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): AsyncIterable<ChatInvocationResult> {
    this.logger.info(
      `Starting XAI stream chat with ${messages.length} messages`,
      ChatXAIProvider.name,
    );
    try {
      const llm = model;
      const stream = await (llm as any).stream(
        messages.map(
          (m) =>
            [
              typeof (m as any)._getType === 'function'
                ? (m as any)._getType()
                : 'human',
              (m as any).content,
            ] as [string, any],
        ),
        config as any,
      );
      for await (const chunk of stream) {
        const newText = (chunk as any).text ?? '';
        this.logger.debug(
          `XAI chunk received: ${newText.length} chars - "${newText.substring(0, 50)}..."`,
          ChatXAIProvider.name,
        );
        // Yield only the new chunk, not accumulated buffer
        yield {
          response: newText,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      this.logger.info('XAI stream chat completed', ChatXAIProvider.name);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in XAI stream chat\n' + (info.stack || ''),
        ChatXAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Batch multiple chat invocations */
  async batchChat(
    model: BaseChatModel,
    batchMessages: BaseMessage[][],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult[]> {
    this.logger.info(
      `Starting XAI batch chat with ${batchMessages.length} batches`,
      ChatXAIProvider.name,
    );
    try {
      const results = await Promise.all(
        batchMessages.map((msgs) => this.invokeChat(model, msgs, config)),
      );
      this.logger.info(
        `XAI batch chat completed with ${results.length} results`,
        ChatXAIProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in XAI batch chat\n' + (info.stack || ''),
        ChatXAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Embeddings are not supported by ChatXAI */
  async listEmbeddingModels(): Promise<string[]> {
    this.logger.warn(
      'Embeddings not supported by ChatXAI',
      ChatXAIProvider.name,
    );
    throw new Error('Embeddings not supported by ChatXAI');
  }
  getEmbeddingModel(): Embeddings {
    this.logger.warn(
      'Embeddings not supported by ChatXAI',
      ChatXAIProvider.name,
    );
    throw new Error('Embeddings not supported by ChatXAI');
  }
  async embed(): Promise<EmbedInvocationResult> {
    this.logger.warn(
      'Embeddings not supported by ChatXAI',
      ChatXAIProvider.name,
    );
    throw new Error('Embeddings not supported by ChatXAI');
  }
  async embedBatch(): Promise<EmbedInvocationResult[]> {
    this.logger.warn(
      'Embeddings not supported by ChatXAI',
      ChatXAIProvider.name,
    );
    throw new Error('Embeddings not supported by ChatXAI');
  }

  /** Rough whitespace token count */
  countTokens(textOrMessages: string | BaseMessage[], _?: string): number {
    if (typeof textOrMessages === 'string') {
      return textOrMessages.trim().split(/\s+/).length;
    }
    return textOrMessages.reduce((sum, m) => {
      const txt = m.content.toString() ?? '';
      return sum + txt.trim().split(/\s+/).length;
    }, 0);
  }

  /** Reset usage stats */
  resetUsage(): void {
    this.stats = {
      cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  /** Get aggregated usage stats */
  getUsageStats(): UsageStats {
    return this.stats;
  }

  /** Health check by listing models */
  async healthCheck(): Promise<boolean> {
    this.logger.info('Performing XAI health check', ChatXAIProvider.name);
    try {
      await this.listModels();
      this.logger.info('XAI health check passed', ChatXAIProvider.name);
      return true;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'XAI health check failed\n' + (info.stack || ''),
        ChatXAIProvider.name,
      );
      return false;
    }
  }

  /** Internal: record usage events */
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
