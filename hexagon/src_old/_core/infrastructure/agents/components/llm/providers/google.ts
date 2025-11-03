import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage, MessageContent } from '@langchain/core/messages';
import type { Embeddings } from '@langchain/core/embeddings';

import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';
import { getErrorInfo } from '@common/error-assertions';
import { TaskType } from '@google/generative-ai';

import LLMProviderInterface, {
  ChatInvocationResult,
  EmbedInvocationResult,
  UsageStats,
  TokenUsage,
} from '../interfaces/provider.interface';
import { MyLogger } from '@core/services/logger/logger.service';

export default class GoogleGenAIProvider implements LLMProviderInterface {
  public providerName = 'google-genai';
  public displayName = 'Google Generative AI';
  public defaultLLMModelId = 'gemini-2.0-flash';
  public defaultEmbeddingModelId = 'gemini-embedding-exp-03-07';

  private stats: UsageStats = {
    cumulative: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'GoogleGenAIProvider initializing',
      GoogleGenAIProvider.name,
    );
  }

  /** List available models via REST */
  async listModels(): Promise<string[]> {
    this.logger.info('Fetching Google models', GoogleGenAIProvider.name);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY not found, returning empty models list',
        GoogleGenAIProvider.name,
      );
      return [];
    }
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      if (!res.ok) {
        this.logger.warn(
          `Failed to list Google models: ${res.statusText}`,
          GoogleGenAIProvider.name,
        );
        return [];
      }
      const data = (await res.json()) as { models: { name: string }[] };
      const models = data.models.map((m) => m.name);
      this.logger.info(
        `Successfully fetched ${models.length} Google models`,
        GoogleGenAIProvider.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error fetching Google models\n' + (info.stack || ''),
        GoogleGenAIProvider.name,
      );
      return [];
    }
  }

  /** Instantiate a Gemini chat model */
  getLLM(
    modelId: string,
    config: BaseChatModelCallOptions = {},
  ): BaseChatModel {
    this.logger.info(
      `Creating Google LLM model: ${modelId}`,
      GoogleGenAIProvider.name,
    );
    return new ChatGoogleGenerativeAI({
      model: modelId,
      apiKey: process.env.GEMINI_API_KEY,
      ...config,
    });
  }

  /** Invoke chat with a sequence of messages */
  async invokeChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): Promise<ChatInvocationResult> {
    this.logger.info(
      `Invoking Google chat with ${messages.length} messages`,
      GoogleGenAIProvider.name,
    );
    try {
      const llm = model as ChatGoogleGenerativeAI;
      const aiMessage = await llm.invoke(messages, config);
      // rudimentary token counting
      const promptTokens = this.countTokens(messages);
      const usage: TokenUsage = {
        promptTokens,
        completionTokens: 0,
        totalTokens: promptTokens,
      };
      this.recordUsage(usage);
      const text = aiMessage.text ?? aiMessage.content ?? '';
      this.logger.info(
        `Google chat completed. Tokens used: ${usage.totalTokens}`,
        GoogleGenAIProvider.name,
      );
      return { response: text as MessageContent, raw: aiMessage, usage };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error invoking Google chat\n' + (info.stack || ''),
        GoogleGenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Stream responses token‑by‑token */
  async *streamChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config: BaseChatModelCallOptions = {},
  ): AsyncIterable<ChatInvocationResult> {
    this.logger.info(
      `Starting Google stream chat with ${messages.length} messages`,
      GoogleGenAIProvider.name,
    );
    try {
      const llm = model as ChatGoogleGenerativeAI;
      const stream = await llm.stream(messages, config);
      for await (const chunk of stream) {
        const newText = chunk.text ?? '';
        this.logger.debug(
          `Google chunk received: ${newText.length} chars - "${newText.substring(0, 50)}..."`,
          GoogleGenAIProvider.name,
        );
        // Yield only the new chunk, not accumulated buffer
        yield {
          response: newText,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      this.logger.info(
        'Google stream chat completed',
        GoogleGenAIProvider.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Google stream chat\n' + (info.stack || ''),
        GoogleGenAIProvider.name,
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
      `Starting Google batch chat with ${batchMessages.length} batches`,
      GoogleGenAIProvider.name,
    );
    try {
      const results = await Promise.all(
        batchMessages.map((msgs) => this.invokeChat(model, msgs, config)),
      );
      this.logger.info(
        `Google batch chat completed with ${results.length} results`,
        GoogleGenAIProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Google batch chat\n' + (info.stack || ''),
        GoogleGenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Return available embedding models (static fallback) */
  async listEmbeddingModels(): Promise<string[]> {
    this.logger.info(
      'Listing Google embedding models',
      GoogleGenAIProvider.name,
    );
    return [this.defaultEmbeddingModelId];
  }

  /** Instantiate the embeddings model */
  getEmbeddingModel(modelId: string): Embeddings {
    this.logger.info(
      `Creating Google embedding model: ${modelId}`,
      GoogleGenAIProvider.name,
    );
    return new GoogleGenerativeAIEmbeddings({
      modelName: modelId,
      taskType: TaskType.RETRIEVAL_DOCUMENT,
      title: 'LangChain docs',
    });
  }

  /** Embed a single input (string or messages) */
  async embed(
    model: Embeddings,
    input: string | BaseMessage[],
    config: Record<string, unknown> = {},
  ): Promise<EmbedInvocationResult> {
    this.logger.info('Starting Google embedding', GoogleGenAIProvider.name);
    try {
      const embedder = model as GoogleGenerativeAIEmbeddings;
      if (typeof input === 'string') {
        const vector = await embedder.embedQuery(input);
        this.logger.info(
          `Google embedding completed. Vector size: ${vector.length}`,
          GoogleGenAIProvider.name,
        );
        return {
          embeddings: {
            embedding: vector,
            embeddingModelId: embedder.modelName,
            size: vector.length,
          },
        };
      } else {
        const texts = input.map((m) => (m as BaseMessage).content ?? '');
        const vectors = await embedder.embedQuery(texts.join('\n\n'));
        this.logger.info(
          `Google embedding completed. Vector size: ${vectors.length}`,
          GoogleGenAIProvider.name,
        );
        return {
          embeddings: {
            embedding: vectors,
            embeddingModelId: embedder.modelName,
            size: vectors.length,
          },
        };
      }
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Google embedding\n' + (info.stack || ''),
        GoogleGenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Batch embed multiple inputs */
  async embedBatch(
    model: Embeddings,
    inputs: (string | BaseMessage[])[],
    config: Record<string, unknown> = {},
  ): Promise<EmbedInvocationResult[]> {
    this.logger.info(
      `Starting Google batch embedding with ${inputs.length} inputs`,
      GoogleGenAIProvider.name,
    );
    try {
      const results = await Promise.all(
        inputs.map((inp) => this.embed(model, inp, config)),
      );
      this.logger.info(
        `Google batch embedding completed with ${results.length} results`,
        GoogleGenAIProvider.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error in Google batch embedding\n' + (info.stack || ''),
        GoogleGenAIProvider.name,
      );
      throw new Error(info.message);
    }
  }

  /** Simple whitespace token count */
  countTokens(
    textOrMessages: string | BaseMessage[],
    _modelId?: string,
  ): number {
    if (typeof textOrMessages === 'string') {
      return textOrMessages.trim().split(/\s+/).length;
    }
    return textOrMessages.reduce((count, m) => {
      const text = m.content.toString() ?? '';
      return count + text.trim().split(/\s+/).length;
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

  /** Health check (always true) */
  async healthCheck(): Promise<boolean> {
    this.logger.info(
      'Performing Google health check',
      GoogleGenAIProvider.name,
    );
    try {
      this.logger.info('Google health check passed', GoogleGenAIProvider.name);
      return true;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Google health check failed\n' + (info.stack || ''),
        GoogleGenAIProvider.name,
      );
      return false;
    }
  }

  /** Internal: record usage */
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
