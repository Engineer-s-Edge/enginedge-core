import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage, MessageContent } from '@langchain/core/messages';
import type { Embeddings } from '@langchain/core/embeddings';

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { getErrorInfo } from '@common/error-assertions';

import LLMProviderInterface, {
  ChatInvocationResult,
  EmbedInvocationResult,
  UsageStats,
  TokenUsage,
} from '../interfaces/provider.interface';
import { MyLogger } from '@core/services/logger/logger.service';

export default class OpenAIProvider implements LLMProviderInterface {
  public providerName = 'openai';
  public displayName = 'OpenAI';
  public defaultLLMModelId = 'gpt-4o-mini';
  public defaultEmbeddingModelId = 'text-embedding-3-small';

  private stats: UsageStats = {
    cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  constructor(private readonly logger: MyLogger) {
    this.logger.info('OpenAIProvider initializing', OpenAIProvider.name);
  }

  /** Fetch list of models via OpenAI REST API */
  async listModels(): Promise<string[]> {
    this.logger.info('Fetching OpenAI models', OpenAIProvider.name);
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      this.logger.error('Missing OPENAI_API_KEY', OpenAIProvider.name);
      throw new Error('Missing OPENAI_API_KEY');
    }
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        this.logger.error(
          `Failed to list OpenAI models: ${res.statusText}`,
          OpenAIProvider.name,
        );
        throw new Error(`List models failed: ${res.statusText}`);
      }
      const json = (await res.json()) as { data: { id: string }[] };
      const models = json.data.map((m) => m.id);
      this.logger.info(
        `Successfully fetched ${models.length} OpenAI models`,
        OpenAIProvider.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error fetching OpenAI models\n' + (info.stack || ''),
        OpenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Instantiate ChatOpenAI with a given model */
  getLLM(
    modelId: string,
    config: BaseChatModelCallOptions = {},
  ): BaseChatModel {
    this.logger.info(
      `Creating OpenAI LLM model: ${modelId}`,
      OpenAIProvider.name,
    );
    return new ChatOpenAI({
      modelName: modelId,
      apiKey: process.env.OPENAI_API_KEY,
      ...config,
    });
  }

  /** Single chat call, extracting token usage if present */
  async invokeChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult> {
    this.logger.info(
      `Invoking OpenAI chat with ${messages.length} messages`,
      OpenAIProvider.name,
    );
    try {
      const llm = model;
      const aiMsg = await llm.invoke(messages, config);
      const meta = aiMsg.response_metadata?.token_usage ?? {};
      const usage: TokenUsage = {
        promptTokens: meta.prompt_tokens ?? 0,
        completionTokens: meta.completion_tokens ?? 0,
        totalTokens: meta.total_tokens ?? 0,
      };
      this.recordUsage(usage);
      const text = aiMsg.text ?? aiMsg.content ?? '';
      this.logger.info(
        `OpenAI chat completed. Tokens used: ${usage.totalTokens}`,
        OpenAIProvider.name,
      );
      return { response: text as MessageContent, raw: aiMsg, usage };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error invoking OpenAI chat\n' + (info.stack || ''),
        OpenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Stream chat responses in real‑time */
  async *streamChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): AsyncIterable<ChatInvocationResult> {
    this.logger.info(
      `Starting OpenAI stream chat with ${messages.length} messages`,
      OpenAIProvider.name,
    );
    try {
      const llm = model;
      const stream = await llm.stream(messages, config);
      for await (const chunk of stream) {
        const newText = chunk.text ?? '';
        this.logger.debug(
          `OpenAI chunk received: ${newText.length} chars - "${newText.substring(0, 50)}..."`,
          OpenAIProvider.name,
        );
        // Yield only the new chunk, not accumulated buffer
        yield {
          response: newText,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      this.logger.info('OpenAI stream chat completed', OpenAIProvider.name);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in OpenAI stream chat\n' + (info.stack || ''),
        OpenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Batch multiple chat calls */
  async batchChat(
    model: BaseChatModel,
    batchMessages: BaseMessage[][],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult[]> {
    this.logger.info(
      `Starting OpenAI batch chat with ${batchMessages.length} batches`,
      OpenAIProvider.name,
    );
    try {
      const results = await Promise.all(
        batchMessages.map((msgs) => this.invokeChat(model, msgs, config)),
      );
      this.logger.info(
        `OpenAI batch chat completed with ${results.length} results`,
        OpenAIProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in OpenAI batch chat\n' + (info.stack || ''),
        OpenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** List supported embedding models (static) */
  async listEmbeddingModels(): Promise<string[]> {
    this.logger.info('Listing OpenAI embedding models', OpenAIProvider.name);
    return [this.defaultEmbeddingModelId];
  }

  /** Instantiate an OpenAI embeddings client */
  getEmbeddingModel(
    modelId: string,
    config: Record<string, unknown> = {},
  ): Embeddings {
    this.logger.info(
      `Creating OpenAI embedding model: ${modelId}`,
      OpenAIProvider.name,
    );
    return new OpenAIEmbeddings({
      model: modelId,
      apiKey: process.env.OPENAI_API_KEY,
      ...config,
    });
  }

  /** Embed a single input (string or messages) */
  async embed(
    model: Embeddings,
    input: string | BaseMessage[],
    config: Record<string, unknown> = {},
  ): Promise<EmbedInvocationResult> {
    this.logger.info('Starting OpenAI embedding', OpenAIProvider.name);
    try {
      const embedder = model as OpenAIEmbeddings;
      if (typeof input === 'string') {
        const vector = await embedder.embedQuery(input);
        this.logger.info(
          `OpenAI embedding completed. Vector size: ${vector.length}`,
          OpenAIProvider.name,
        );
        return {
          embeddings: {
            embedding: vector,
            embeddingModelId: embedder.model,
            size: vector.length,
          },
        };
      } else {
        const texts = input.map((m) => (m as BaseMessage).content ?? '');
        const vectors = await embedder.embedQuery(texts.join('\n\n'));
        this.logger.info(
          `OpenAI embedding completed. Vector size: ${vectors.length}`,
          OpenAIProvider.name,
        );
        return {
          embeddings: {
            embedding: vectors,
            embeddingModelId: embedder.model,
            size: vectors.length,
          },
        };
      }
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in OpenAI embedding\n' + (info.stack || ''),
        OpenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Batch embedding multiple inputs */
  async embedBatch(
    model: Embeddings,
    inputs: (string | BaseMessage[])[],
    config: Record<string, unknown> = {},
  ): Promise<EmbedInvocationResult[]> {
    this.logger.info(
      `Starting OpenAI batch embedding with ${inputs.length} inputs`,
      OpenAIProvider.name,
    );
    try {
      const results = await Promise.all(
        inputs.map((i) => this.embed(model, i, config)),
      );
      this.logger.info(
        `OpenAI batch embedding completed with ${results.length} results`,
        OpenAIProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in OpenAI batch embedding\n' + (info.stack || ''),
        OpenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Rough token count via whitespace */
  countTokens(
    textOrMessages: string | BaseMessage[],
    _modelId?: string,
  ): number {
    if (typeof textOrMessages === 'string') {
      return textOrMessages.trim().split(/\s+/).length;
    }
    return textOrMessages.reduce((c, m) => {
      const txt = m.content.toString() ?? '';
      return c + txt.trim().split(/\s+/).length;
    }, 0);
  }

  /** Reset tracked usage */
  resetUsage(): void {
    this.stats = {
      cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  /** Retrieve usage stats */
  getUsageStats(): UsageStats {
    return this.stats;
  }

  /** Basic health check by listing models */
  async healthCheck(): Promise<boolean> {
    this.logger.info('Performing OpenAI health check', OpenAIProvider.name);
    try {
      await this.listModels();
      this.logger.info('OpenAI health check passed', OpenAIProvider.name);
      return true;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'OpenAI health check failed\n' + (info.stack || ''),
        OpenAIProvider.name,
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
