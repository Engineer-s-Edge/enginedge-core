import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage, MessageContent } from '@langchain/core/messages';
import type { Embeddings } from '@langchain/core/embeddings';

import { ChatGroq } from '@langchain/groq';
import { getErrorInfo } from '@common/error-assertions';

import LLMProviderInterface, {
  ChatInvocationResult,
  EmbedInvocationResult,
  UsageStats,
  TokenUsage,
} from '../interfaces/provider.interface';
import { MyLogger } from '@core/services/logger/logger.service';

export default class GroqProvider implements LLMProviderInterface {
  public providerName = 'groq';
  public displayName = 'Groq';
  public defaultLLMModelId = 'llama-3.3-70b-versatile';
  public defaultEmbeddingModelId = 'text-embedding-ada-002';

  private stats: UsageStats = {
    cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  constructor(private readonly logger: MyLogger) {
    this.logger.info('GroqProvider initializing', GroqProvider.name);
  }

  /** List active Groq models via OpenAI‑compatible endpoint */
  async listModels(): Promise<string[]> {
    this.logger.info('Fetching Groq models', GroqProvider.name);
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.logger.error('Missing GROQ_API_KEY', GroqProvider.name);
      throw new Error('Missing GROQ_API_KEY');
    }
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!res.ok) {
        this.logger.error(
          `Failed to list Groq models: ${res.statusText}`,
          GroqProvider.name,
        );
        throw new Error(`Failed to list models: ${res.statusText}`);
      }
      const data = (await res.json()) as {
        data?: { id: string }[];
        models?: { name: string }[];
      };
      const models =
        data.models?.map((m) => m.name) ?? data.data?.map((m) => m.id) ?? [];
      this.logger.info(
        `Successfully fetched ${models.length} Groq models`,
        GroqProvider.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error fetching Groq models\n' + (info.stack || ''),
        GroqProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Instantiate a Groq chat model for completions */
  getLLM(
    modelId: string,
    config: BaseChatModelCallOptions = {},
  ): BaseChatModel {
    this.logger.info(`Creating Groq LLM model: ${modelId}`, GroqProvider.name);
    const apiKey = process.env.GROQ_API_KEY;
    const options: any = {
      apiKey,
      model: modelId,
    };
    // Other RunnableConfig fields can be mapped into model_kwargs if needed
    return new ChatGroq(options);
  }

  /** Single chat invocation */
  async invokeChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult> {
    this.logger.info(
      `Invoking Groq chat with ${messages.length} messages`,
      GroqProvider.name,
    );
    try {
      const llm = model as ChatGroq;
      const response = await llm.invoke(messages);
      // Token usage can be extracted if available; fallback to prompt-only count
      const promptTokens = this.countTokens(messages);
      const usage: TokenUsage = {
        promptTokens,
        completionTokens: 0,
        totalTokens: promptTokens,
      };
      this.recordUsage(usage);
      this.logger.info(
        `Groq chat completed. Tokens used: ${usage.totalTokens}`,
        GroqProvider.name,
      );
      // ChatGroq.invoke returns a string with the completion text
      return {
        response: response.content as MessageContent,
        raw: response,
        usage,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error invoking Groq chat\n' + (info.stack || ''),
        GroqProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Stream chat responses token‑by‑token */
  async *streamChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): AsyncIterable<ChatInvocationResult> {
    this.logger.info(
      `Starting Groq stream chat with ${messages.length} messages`,
      GroqProvider.name,
    );
    try {
      const llm = model as ChatGroq;
      const stream = await llm.stream(messages);
      for await (const chunk of stream) {
        const newText = chunk.text ?? '';
        // this.logger.debug(
        //   `Groq chunk received: ${newText.length} chars - "${newText.substring(0, 50)}..."`,
        //   GroqProvider.name,
        // );
        // Yield only the new chunk, not accumulated buffer
        yield {
          response: newText,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      this.logger.info('Groq stream chat completed', GroqProvider.name);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Groq stream chat\n' + (info.stack || ''),
        GroqProvider.name,
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
      `Starting Groq batch chat with ${batchMessages.length} batches`,
      GroqProvider.name,
    );
    try {
      const results = await Promise.all(
        batchMessages.map((msgs) => this.invokeChat(model, msgs, config)),
      );
      this.logger.info(
        `Groq batch chat completed with ${results.length} results`,
        GroqProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Groq batch chat\n' + (info.stack || ''),
        GroqProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** List supported embedding models (static override) */
  async listEmbeddingModels(): Promise<string[]> {
    this.logger.warn(
      'Groq does not support embedding models',
      GroqProvider.name,
    );
    throw new Error(
      'Groq does not support any embedding models, please use another provider for embeddings.',
    );
  }

  getEmbeddingModel(
    modelId: string,
    config?: Record<string, unknown>,
  ): Embeddings {
    this.logger.warn(
      'Groq does not support embedding models',
      GroqProvider.name,
    );
    throw new Error(
      'Groq does not support any embedding models, please use another provider for embeddings.',
    );
  }

  /** Embed text or messages via Groq's embedding endpoint */
  async embed(
    model: Embeddings,
    input: string | BaseMessage[],
    config: Record<string, unknown> = {},
  ): Promise<EmbedInvocationResult> {
    this.logger.warn('Groq does not support embedding', GroqProvider.name);
    throw new Error(
      'Groq does not support any embedding models, please use another provider for embeddings.',
    );
  }

  /** Simple whitespace token count fallback */
  countTokens(
    textOrMessages: string | BaseMessage[],
    _modelId?: string,
  ): number {
    if (typeof textOrMessages === 'string') {
      return textOrMessages.trim().split(/\s+/).length;
    }
    return (textOrMessages as BaseMessage[]).reduce((sum, m) => {
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

  /** Retrieve aggregated usage stats */
  getUsageStats(): UsageStats {
    return this.stats;
  }

  /** Verify connectivity by listing models */
  async healthCheck(): Promise<boolean> {
    this.logger.info('Performing Groq health check', GroqProvider.name);
    try {
      await this.listModels();
      this.logger.info('Groq health check passed', GroqProvider.name);
      return true;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Groq health check failed\n' + (info.stack || ''),
        GroqProvider.name,
      );
      return false;
    }
  }

  /** Internal: record a usage event */
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
