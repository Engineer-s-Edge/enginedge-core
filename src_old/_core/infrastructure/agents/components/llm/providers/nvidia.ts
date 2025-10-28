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

export default class NvidiaProvider implements LLMProviderInterface {
  public providerName = 'NvidiaNIM';
  public displayName = 'NVIDIA NIM';
  public defaultLLMModelId = 'llama-3-70b-instruct';
  public defaultEmbeddingModelId = 'embed-qa-4';

  private stats: UsageStats = {
    cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  constructor(private readonly logger: MyLogger) {
    this.logger.info('NvidiaProvider initializing', NvidiaProvider.name);
  }

  private getBaseURL() {
    return process.env.Nvidia_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
  }

  /** List Nvidia models via the OpenAI‑compatible endpoint */
  async listModels(): Promise<string[]> {
    this.logger.info('Fetching Nvidia models', NvidiaProvider.name);
    try {
      // Create a specialized client just for listing models
      const openaiApiKey = process.env.Nvidia_API_KEY || '';
      const baseURL = this.getBaseURL();

      // Make direct fetch request to the models endpoint
      const response = await fetch(`${baseURL}/models`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
      });

      if (!response.ok) {
        this.logger.error(
          `Failed to list Nvidia models: ${response.statusText}`,
          NvidiaProvider.name,
        );
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.data.map((m: any) => m.id);
      this.logger.info(
        `Successfully fetched ${models.length} Nvidia models`,
        NvidiaProvider.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error fetching Nvidia models\n' + (info.stack || ''),
        NvidiaProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Return a ChatOpenAI instance pointed at Nvidia */
  getLLM(
    modelId: string,
    config: BaseChatModelCallOptions = {},
  ): BaseChatModel {
    this.logger.info(
      `Creating Nvidia LLM model: ${modelId}`,
      NvidiaProvider.name,
    );
    return new ChatOpenAI({
      modelName: modelId,
      openAIApiKey: process.env.Nvidia_API_KEY,
      configuration: {
        baseURL: this.getBaseURL(),
        timeout: config.timeout,
        ...config, // spread any additional options
      },
    });
  }

  /** Single chat call */
  async invokeChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config?: BaseChatModelCallOptions,
  ): Promise<ChatInvocationResult> {
    this.logger.info(
      `Invoking Nvidia chat with ${messages.length} messages`,
      NvidiaProvider.name,
    );
    try {
      const llm = model;
      const aiMsg = await llm.invoke(
        messages.map((m) => [m._getType?.(), m.content] as const),
        config,
      );
      // extract token usage if provided, else rough count
      const usageMeta = aiMsg.response_metadata?.usage ?? {};
      const usage: TokenUsage = {
        promptTokens: usageMeta.prompt_tokens ?? this.countTokens(messages),
        completionTokens: usageMeta.completion_tokens ?? 0,
        totalTokens: usageMeta.total_tokens ?? 0,
      };
      this.recordUsage(usage);
      const text = aiMsg.text ?? aiMsg.content ?? '';
      this.logger.info(
        `Nvidia chat completed. Tokens used: ${usage.totalTokens}`,
        NvidiaProvider.name,
      );
      return { response: text as MessageContent, raw: aiMsg, usage };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error invoking Nvidia chat\n' + (info.stack || ''),
        NvidiaProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Streamed chat */
  async *streamChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config?: BaseChatModelCallOptions,
  ): AsyncIterable<ChatInvocationResult> {
    this.logger.info(
      `Starting Nvidia stream chat with ${messages.length} messages`,
      NvidiaProvider.name,
    );
    try {
      const llm = model;
      const stream = await llm.stream(messages, config);
      for await (const part of stream) {
        const newText = part.text ?? '';
        this.logger.debug(
          `Nvidia chunk received: ${newText.length} chars - "${newText.substring(0, 50)}..."`,
          NvidiaProvider.name,
        );
        // Yield only the new chunk, not accumulated buffer
        yield {
          response: newText,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      this.logger.info('Nvidia stream chat completed', NvidiaProvider.name);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Nvidia stream chat\n' + (info.stack || ''),
        NvidiaProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Batch chat */
  async batchChat(
    model: BaseChatModel,
    batchMessages: BaseMessage[][],
    config?: BaseChatModelCallOptions,
  ): Promise<ChatInvocationResult[]> {
    this.logger.info(
      `Starting Nvidia batch chat with ${batchMessages.length} batches`,
      NvidiaProvider.name,
    );
    try {
      const results = await Promise.all(
        batchMessages.map((msgs) => this.invokeChat(model, msgs, config)),
      );
      this.logger.info(
        `Nvidia batch chat completed with ${results.length} results`,
        NvidiaProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Nvidia batch chat\n' + (info.stack || ''),
        NvidiaProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Only one embedding model supported */
  async listEmbeddingModels(): Promise<string[]> {
    this.logger.info('Listing Nvidia embedding models', NvidiaProvider.name);
    return [this.defaultEmbeddingModelId];
  }

  /** Instantiate OpenAIEmbeddings pointed at Nvidia */
  getEmbeddingModel(modelId: string): Embeddings {
    this.logger.info(
      `Creating Nvidia embedding model: ${modelId}`,
      NvidiaProvider.name,
    );
    return new OpenAIEmbeddings({
      modelName: modelId,
      openAIApiKey: process.env.Nvidia_API_KEY,
      configuration: { baseURL: this.getBaseURL() }, // override endpoint :contentReference[oaicite:1]{index=1}
    });
  }

  /** Embed a single input (string or messages) */
  async embed(
    model: Embeddings,
    input: string | BaseMessage[],
    config: Record<string, unknown> = {},
  ): Promise<EmbedInvocationResult> {
    this.logger.info('Starting Nvidia embedding', NvidiaProvider.name);
    try {
      const embedder = model as OpenAIEmbeddings;
      if (typeof input === 'string') {
        const vector = await embedder.embedQuery(input);
        this.logger.info(
          `Nvidia embedding completed. Vector size: ${vector.length}`,
          NvidiaProvider.name,
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
          `Nvidia embedding completed. Vector size: ${vectors.length}`,
          NvidiaProvider.name,
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
        'Error in Nvidia embedding\n' + (info.stack || ''),
        NvidiaProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Batch embedding */
  async embedBatch(
    model: Embeddings,
    inputs: (string | BaseMessage[])[],
    config?: Record<string, unknown>,
  ): Promise<EmbedInvocationResult[]> {
    this.logger.info(
      `Starting Nvidia batch embedding with ${inputs.length} inputs`,
      NvidiaProvider.name,
    );
    try {
      const results = await Promise.all(
        inputs.map((i) => this.embed(model, i, config)),
      );
      this.logger.info(
        `Nvidia batch embedding completed with ${results.length} results`,
        NvidiaProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Nvidia batch embedding\n' + (info.stack || ''),
        NvidiaProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Rough whitespace token count */
  countTokens(textOrMessages: string | BaseMessage[]): number {
    const txts =
      typeof textOrMessages === 'string'
        ? [textOrMessages]
        : textOrMessages.map((m: any) => m.content);
    return txts.reduce((sum, t) => sum + t.trim().split(/\s+/).length, 0);
  }

  /** Reset stats */
  resetUsage(): void {
    this.stats = {
      cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  /** Retrieve stats */
  getUsageStats(): UsageStats {
    return this.stats;
  }

  /** Health check by listing models */
  async healthCheck(): Promise<boolean> {
    this.logger.info('Performing Nvidia health check', NvidiaProvider.name);
    try {
      await this.listModels();
      this.logger.info('Nvidia health check passed', NvidiaProvider.name);
      return true;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Nvidia health check failed\n' + (info.stack || ''),
        NvidiaProvider.name,
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
