// src/llm.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMessage } from '@langchain/core/messages';
// import type { RunnableConfig } from '@langchain/core/runnables';
import LLMProviderInterface, {
  ChatInvocationResult,
  EmbedInvocationResult,
} from './interfaces/provider.interface';
import AnthropicProvider from './providers/anthropic';
import GoogleProvider from './providers/google';
import GroqProvider from './providers/groq';
import NvidiaProvider from './providers/nvidia';
import OpenAIProvider from './providers/openai';
import XAIProvider from './providers/xai';
import { BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';
import {
  Model,
  ModelsData,
  getInputCost,
  getOutputCost,
  getCachedInputCost,
  supportsCapability,
  filterByProvider,
  filterByCategory,
  getModelsByCostRange,
  isComplexPricing,
} from './model-types';
import * as fs from 'fs';
import * as path from 'path';
import { MyLogger } from '@core/services/logger/logger.service';

export interface ModelDetails {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  category: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
  cachedInputCostPer1M: number | null;
  vision: boolean | null;
  functionCalling: boolean | null;
  multilingual?: boolean;
  extendedThinking?: boolean;
  knowledgeCutoff?: string | null;
  // Additional pricing info for complex models
  audioInputCostPer1M?: number | null;
  audioOutputCostPer1M?: number | null;
  // Special pricing
  pricingPerImage?: any;
  pricingPerUse?: any;
}

// cost per 1K tokens
const COST_RATES: Record<string, { prompt: number; completion: number }> = {
  anthropic: { prompt: 0.015, completion: 0.06 },
  google: { prompt: 0.01, completion: 0.03 },
  groq: { prompt: 0.005, completion: 0.02 },
  nvidia: { prompt: 0.008, completion: 0.016 },
  openai: { prompt: 0.01, completion: 0.03 },
  xai: { prompt: 0.006, completion: 0.012 },
};

@Injectable()
export default class LLMService {
  private providers = new Map<string, LLMProviderInterface>();
  private defaultProvider: string;
  private fallbackProviders: string[];
  private maxRetries: number;
  private debug: boolean;
  private totalCost = 0;
  private modelsData: ModelsData = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('Initializing LLMService with providers', LLMService.name);

    // bring in all providers
    this.providers.set('anthropic', new AnthropicProvider(this.logger));
    this.providers.set('google', new GoogleProvider(this.logger));
    this.providers.set('groq', new GroqProvider(this.logger));
    this.providers.set('nvidia', new NvidiaProvider(this.logger));
    this.providers.set('openai', new OpenAIProvider(this.logger));
    this.providers.set('xai', new XAIProvider(this.logger));

    this.defaultProvider =
      this.configService.get<string>('llm.defaultProvider') ?? 'openai';
    this.fallbackProviders =
      this.configService.get<string[]>('llm.fallbackProviders') ?? [];
    this.maxRetries = this.configService.get<number>('llm.maxRetries') ?? 3;
    this.debug = this.configService.get<boolean>('llm.debug') ?? false;

    this.logger.info(
      `LLMService configured with default provider: ${this.defaultProvider}, fallback providers: ${this.fallbackProviders.join(', ')}`,
      LLMService.name,
    );

    if (!this.providers.has(this.defaultProvider)) {
      this.logger.error(
        `Default provider "${this.defaultProvider}" not available`,
        undefined,
        LLMService.name,
      );
      throw new Error(
        `Default provider "${this.defaultProvider}" not available`,
      );
    }

    // Load models data
    this.loadModelsData();
  }

  listProviders(): string[] {
    return [...this.providers.keys()];
  }

  async listModels(providerName = this.defaultProvider): Promise<string[]> {
    const res = this.getProvider(providerName).listModels();
    return Array.isArray(res) ? res : await res;
  }

  async listModelsWithDetails(
    providerName = this.defaultProvider,
  ): Promise<ModelDetails[]> {
    const modelDetails: ModelDetails[] = [];
    const normalizedProvider = providerName.toLowerCase();

    // 1) Models from detailed data
    const modelsFromData = this.getModelsByProvider(providerName);
    for (const model of modelsFromData) {
      const modelDetail = this.convertModelToDetails(model, model.name);
      modelDetails.push(modelDetail);
    }

    // 2) Models from provider API (if provider is available)
    try {
      const provider = this.getProvider(normalizedProvider);
      const apiModels = await provider.listModels();

      // Merge any IDs not already present
      for (const modelId of apiModels) {
        const exists = modelDetails.some(
          (m) => m.id === modelId || m.name === modelId,
        );
        if (!exists) {
          modelDetails.push({
            id: modelId,
            name: modelId,
            provider: providerName,
            description: null,
            category: null,
            contextWindow: null,
            maxOutputTokens: null,
            inputCostPer1M: null,
            outputCostPer1M: null,
            cachedInputCostPer1M: null,
            vision: null,
            functionCalling: null,
            multilingual: undefined,
            extendedThinking: undefined,
            knowledgeCutoff: null,
          });
        }
      }
    } catch {
      // If provider not registered, just return detailed data
    }

    if (this.debug) {
      console.log(
        `[LLMService] Provider ${providerName} final model count: ${modelDetails.length}`,
      );
    }

    return modelDetails;
  }

  async getModelDetails(
    providerName: string,
    modelId: string,
  ): Promise<ModelDetails | null> {
    // Only return details if we have the model in our loaded data
    const modelFromData = this.modelsData.find(
      (m) =>
        m.name.toLowerCase() === modelId.toLowerCase() ||
        m.name.toLowerCase().includes(modelId.toLowerCase()),
    );

    if (modelFromData) {
      return this.convertModelToDetails(modelFromData, modelId);
    }

    // Return null if we don't have accurate information
    return null;
  }

  async getFallbackModels(): Promise<{ provider: string; modelId: string }[]> {
    const out: { provider: string; modelId: string }[] = [];
    for (const p of this.fallbackProviders) {
      const prov = this.getProvider(p);
      if ((await prov.listModels()).includes(prov.defaultLLMModelId)) {
        out.push({ provider: p, modelId: prov.defaultLLMModelId });
      }
    }
    return out;
  }

  async getFallbackEmbeddingModels(): Promise<
    { provider: string; modelId: string }[]
  > {
    const out: { provider: string; modelId: string }[] = [];
    for (const p of this.fallbackProviders) {
      const prov = this.getProvider(p);
      if ((await prov.listModels()).includes(prov.defaultEmbeddingModelId)) {
        out.push({ provider: p, modelId: prov.defaultEmbeddingModelId });
      }
    }
    return out;
  }

  async chat(
    messages: BaseMessage[],
    opts: {
      providerName?: string;
      modelId?: string;
      config?: BaseChatModelCallOptions;
      stream: true;
      abort?: AbortSignal;
    },
  ): Promise<AsyncIterable<any>>;

  async chat(
    messages: BaseMessage[],
    opts: {
      providerName?: string;
      modelId?: string;
      config?: BaseChatModelCallOptions;
      stream?: false | undefined;
      abort?: AbortSignal;
    },
  ): Promise<ChatInvocationResult>;
  async chat(
    messages: BaseMessage[],
    opts: {
      providerName?: string;
      modelId?: string;
      config?: BaseChatModelCallOptions;
      stream?: boolean;
      abort?: AbortSignal;
    } = {},
  ): Promise<ChatInvocationResult | AsyncIterable<any>> {
    this.logger.info(
      `Starting chat with ${messages.length} messages, provider: ${opts.providerName || this.defaultProvider}, stream: ${opts.stream || false}`,
      LLMService.name,
    );

    const providerOrder = [
      opts.providerName || this.defaultProvider,
      ...this.fallbackProviders.filter((p) => p !== opts.providerName),
    ];
    let lastErr: Error | undefined;

    // Merge abort signal into config
    const configWithAbort = {
      ...opts.config,
      ...(opts.abort && { signal: opts.abort }),
    };

    for (
      let attempt = 0;
      attempt < Math.min(providerOrder.length, this.maxRetries);
      attempt++
    ) {
      const pName = providerOrder[attempt];
      const prov = this.getProvider(pName);

      this.logger.info(
        `Attempting chat with provider: ${pName} (attempt ${attempt + 1}/${Math.min(providerOrder.length, this.maxRetries)})`,
        LLMService.name,
      );

      try {
        const mid = opts.modelId || prov.defaultLLMModelId;
        this.logger.info(
          `Using model: ${mid} for provider: ${pName}`,
          LLMService.name,
        );

        if (opts.stream && prov.streamChat) {
          this.logger.info(
            `Starting streaming chat with provider: ${pName}`,
            LLMService.name,
          );
          return this.wrapStreamWithCostAndAbort(
            prov.streamChat(
              prov.getLLM(mid, configWithAbort),
              messages,
              configWithAbort,
            ),
            pName,
            opts.abort,
          );
        } else {
          const res = await prov.invokeChat(
            prov.getLLM(mid, configWithAbort),
            messages,
            configWithAbort,
          );
          this.applyCost(res.usage, pName);
          this.logger.info(
            `Chat completed successfully with provider: ${pName}, tokens used: ${res.usage?.promptTokens || 0} prompt, ${res.usage?.completionTokens || 0} completion`,
            LLMService.name,
          );
          return res;
        }
      } catch (err) {
        // Check if the error is due to abortion, and if so, don't retry
        if (opts.abort?.aborted || (err as Error).name === 'AbortError') {
          this.logger.warn(
            `Chat aborted for provider: ${pName}`,
            LLMService.name,
          );
          throw err;
        }

        // Propagate rate limit or timeout errors to caller rather than silently falling back
        if (this.isRateLimitOrTimeoutError(err)) {
          this.logger.warn(
            `Provider ${pName} returned rate limit/timeout: ${(err as Error).message}. Not retrying.`,
            LLMService.name,
          );
          throw err as Error;
        }

        // Otherwise, try next provider
        lastErr = err as Error;
        this.logger.warn(
          `Provider ${pName} failed, trying next provider: ${lastErr.message}`,
          LLMService.name,
        );
        this.logError(`Provider ${pName} failed:`, lastErr);
      }
    }

    this.logger.error(
      `All providers failed for chat request`,
      lastErr?.stack,
      LLMService.name,
    );
    if (lastErr) throw new Error(`All providers failed: ${lastErr.message}`);
    else throw new Error('An unknown error occurred while chatting');
  }

  async embed(
    input: string | BaseMessage[],
    opts: {
      providerName?: string;
      modelId?: string;
      config?: Record<string, unknown>;
    } = {},
  ): Promise<EmbedInvocationResult> {
    this.logger.info(
      `Starting embedding for input type: ${typeof input}, provider: ${opts.providerName || this.defaultProvider}`,
      LLMService.name,
    );

    const providerOrder = [
      opts.providerName || this.defaultProvider,
      ...this.fallbackProviders.filter((p) => p !== opts.providerName),
    ];
    let lastErr: Error | undefined;

    for (let i = 0; i < Math.min(providerOrder.length, this.maxRetries); i++) {
      const pName = providerOrder[i];
      const prov = this.getProvider(pName);

      this.logger.info(
        `Attempting embedding with provider: ${pName} (attempt ${i + 1}/${Math.min(providerOrder.length, this.maxRetries)})`,
        LLMService.name,
      );

      try {
        const mid = opts.modelId || prov.defaultEmbeddingModelId;
        if (!mid) {
          this.logger.warn(
            `No embedding model available for provider: ${pName}`,
            LLMService.name,
          );
          throw new Error(`No embed model for ${pName}`);
        }

        this.logger.info(
          `Using embedding model: ${mid} for provider: ${pName}`,
          LLMService.name,
        );
        const model = prov.getEmbeddingModel(mid, opts.config);
        const res = await prov.embed(model, input, opts.config);

        if (res.usage) {
          this.applyCost(res.usage, pName);
          this.logger.info(
            `Embedding completed successfully with provider: ${pName}, tokens used: ${res.usage.promptTokens}`,
            LLMService.name,
          );
        }

        return res;
      } catch (err) {
        lastErr = err as Error;
        this.logger.warn(
          `Embedding failed on provider ${pName}: ${lastErr.message}`,
          LLMService.name,
        );
        this.logError(`Embed failed on ${pName}:`, lastErr);
      }
    }

    this.logger.error(
      `All embedding providers failed`,
      lastErr?.stack,
      LLMService.name,
    );
    if (lastErr)
      throw new Error(`All embedding providers failed: ${lastErr.message}`);
    else throw new Error('An unknown error occurred while embedding');
  }

  // Simple invoke wrapper for tests expecting LLMService.invoke API
  async invoke(
    payload: { input: string | BaseMessage[] },
    opts?: { provider?: string; model?: string },
  ): Promise<{ text: string; usage: any; stopReason?: string }> {
    const input = payload.input;
    let messages: BaseMessage[];
    if (Array.isArray(input)) {
      messages = input as BaseMessage[];
    } else {
      // Wrap raw string as a single human message
      const { HumanMessage } = await import('@langchain/core/messages');
      messages = [new HumanMessage({ content: input })];
    }
    const res = (await this.chat(messages, {
      providerName: opts?.provider,
      modelId: opts?.model,
      stream: false,
    })) as any;
    return {
      text: res?.response?.toString?.() ?? String(res?.response ?? ''),
      usage: res?.usage ?? {},
      stopReason: 'stop',
    };
  }

  countTokens(
    textOrMsgs: string | BaseMessage[],
    opts?: { providerName: string; modelId: string },
  ): number {
    try {
      return this.getProvider(
        opts?.providerName ?? this.defaultProvider,
      ).countTokens(textOrMsgs, opts?.modelId);
    } catch {
      // fallback heuristic
      const text =
        typeof textOrMsgs === 'string'
          ? textOrMsgs
          : textOrMsgs.map((m) => m.content).join(' ');
      return Math.ceil(text.split(/\s+/).length * 1.3);
    }
  }

  getUsageStats(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, prov] of this.providers) {
      out[k] = prov.getUsageStats();
    }
    out.estimatedTotalCost = this.totalCost;
    return out;
  }

  resetUsage() {
    for (const prov of this.providers.values())
      if (prov.resetUsage) prov.resetUsage();
    this.totalCost = 0;
  }

  async healthCheck(providerName?: string): Promise<Record<string, boolean>> {
    const targets = providerName ? [providerName] : [...this.providers.keys()];
    const res: Record<string, boolean> = {};
    for (const name of targets) {
      const prov = this.providers.get(name)!;
      res[name] = prov.healthCheck ? await prov.healthCheck() : true;
    }
    return res;
  }

  private getProvider(name: string) {
    const p = this.providers.get(name.toLowerCase());
    if (!p) throw new Error(`Provider "${name}" not found`);
    return p;
  }

  private applyCost(
    usage: {
      promptTokens?: number;
      completionTokens?: number;
      prompt?: number;
      completion?: number;
    },
    provider: string,
  ) {
    const rate = COST_RATES[provider] || { prompt: 0.01, completion: 0.03 };
    const promptTokens = usage.promptTokens ?? usage.prompt ?? 0;
    const completionTokens = usage.completionTokens ?? usage.completion ?? 0;
    this.totalCost +=
      (promptTokens / 1000) * rate.prompt +
      (completionTokens / 1000) * rate.completion;
  }
  private async *wrapStreamWithCost(
    stream: AsyncIterable<any>,
    provider: string,
  ) {
    for await (const chunk of stream) {
      if (chunk.usage) this.applyCost(chunk.usage, provider);
      yield chunk;
    }
  }

  private async *wrapStreamWithCostAndAbort(
    stream: AsyncIterable<any>,
    provider: string,
    abortSignal?: AbortSignal,
  ) {
    try {
      for await (const chunk of stream) {
        // Check if the operation was aborted
        if (abortSignal?.aborted) {
          this.logError(`Stream aborted for provider ${provider}`);
          return; // Exit gracefully, returning what we've got so far
        }

        if (chunk.usage) this.applyCost(chunk.usage, provider);
        yield chunk;
      }
    } catch (error) {
      // If it's an abort error, don't throw - just exit gracefully
      if (abortSignal?.aborted || (error as Error).name === 'AbortError') {
        this.logError(`Stream aborted for provider ${provider}`);
        return; // Return whatever was yielded so far
      }
      // Re-throw other errors
      throw error;
    }
  }

  private logError(...args: any[]) {
    if (this.debug) console.error('[LLMService]', ...args);
  }

  private isRateLimitOrTimeoutError(err: unknown): boolean {
    const e = err as any;
    const msg = (e?.message || '').toString().toLowerCase();
    const code = (e?.code || '').toString().toUpperCase();
    const status = e?.status ?? e?.statusCode;
    return (
      msg.includes('rate limit') ||
      msg.includes('ratelimit') ||
      code === 'TIMEOUT' ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      code === 'ETIMEDOUT' ||
      status === 429 ||
      code === '429'
    );
  }

  /**
   * Load models data from the JSON file
   */
  private loadModelsData(): void {
    try {
      const modelsPath = path.join(
        process.cwd(),
        'res',
        'stats_dat',
        'models.json',
      );
      const modelsFile = fs.readFileSync(modelsPath, 'utf8');
      this.modelsData = JSON.parse(modelsFile) as ModelsData;

      if (this.debug) {
        console.log(
          `[LLMService] Loaded ${this.modelsData.length} models from ${modelsPath}`,
        );
      }
    } catch (error) {
      this.logError('Failed to load models data:', error);
      this.modelsData = [];
    }
  }

  /**
   * Convert Model to ModelDetails format
   */
  private convertModelToDetails(model: Model, modelId: string): ModelDetails {
    const details: ModelDetails = {
      id: modelId,
      name: model.name,
      provider: model.provider,
      description: model.description,
      category: model.category,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens,
      inputCostPer1M: getInputCost(model, 'text'),
      outputCostPer1M: getOutputCost(model, 'text'),
      cachedInputCostPer1M: getCachedInputCost(model, 'text'),
      vision: model.vision,
      functionCalling: model.functionCalling,
      multilingual: model.multilingual,
      extendedThinking: model.extendedThinking,
      knowledgeCutoff: model.knowledgeCutoff,
    };

    // Handle complex pricing for audio models
    if (isComplexPricing(model.inputCostPer1M)) {
      details.audioInputCostPer1M = model.inputCostPer1M.audio;
    }
    if (isComplexPricing(model.outputCostPer1M)) {
      details.audioOutputCostPer1M = model.outputCostPer1M.audio;
    }

    // Handle special pricing
    if (model.pricingPerImage) {
      details.pricingPerImage = model.pricingPerImage;
    }
    if (model.pricingPerUse) {
      details.pricingPerUse = model.pricingPerUse;
    }

    return details;
  }

  /**
   * Get all models data
   */
  getModelsData(): ModelsData {
    return this.modelsData;
  }

  /**
   * Find models by name (case-insensitive partial match)
   */
  findModelsByName(name: string): Model[] {
    const searchTerm = name.toLowerCase();
    return this.modelsData.filter((model) =>
      model.name.toLowerCase().includes(searchTerm),
    );
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(provider: string): Model[] {
    return filterByProvider(this.modelsData, provider as any);
  }

  /**
   * Get models by category
   */
  getModelsByCategory(category: string): Model[] {
    return filterByCategory(this.modelsData, category as any);
  }

  /**
   * Get models within a cost range
   * Only includes models with complete pricing information
   */
  getModelsByCostRange(minCost: number, maxCost: number): Model[] {
    return this.modelsData.filter((model) => {
      const inputCost = getInputCost(model, 'text');
      return inputCost !== null && inputCost >= minCost && inputCost <= maxCost;
    });
  }

  /**
   * Get models with specific capabilities
   */
  getModelsWithCapability(
    capability:
      | 'vision'
      | 'functionCalling'
      | 'multilingual'
      | 'extendedThinking',
  ): Model[] {
    return this.modelsData.filter((model) =>
      supportsCapability(model, capability),
    );
  }

  /**
   * Calculate estimated cost for a request
   * Returns null if model not found or pricing information is incomplete
   */
  calculateEstimatedCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number = 0,
  ): { inputCost: number; outputCost: number; totalCost: number } | null {
    const model = this.modelsData.find(
      (m) => m.name.toLowerCase() === modelId.toLowerCase(),
    );

    if (!model) {
      return null;
    }

    const inputCostPer1M = getInputCost(model, 'text');
    const outputCostPer1M = getOutputCost(model, 'text');

    // Only calculate if we have complete pricing information
    if (inputCostPer1M === null || outputCostPer1M === null) {
      return null;
    }

    const inputCost = (inputTokens / 1000000) * inputCostPer1M;
    const outputCost = (outputTokens / 1000000) * outputCostPer1M;
    const totalCost = inputCost + outputCost;

    return { inputCost, outputCost, totalCost };
  }
}
