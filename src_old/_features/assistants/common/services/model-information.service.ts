import { Injectable } from '@nestjs/common';
import LLMService, {
  ModelDetails,
} from '../../../../core/infrastructure/agents/components/llm/llm.service';
import { Model } from '../../../../core/infrastructure/agents/components/llm/model-types';
import { MyLogger } from '../../../../core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable()
export class ModelInformationService {
  constructor(
    private readonly llmService: LLMService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'ModelInformationService initialized',
      ModelInformationService.name,
    );
  }

  async getAllModels(): Promise<Model[]> {
    this.logger.info('Retrieving all models', ModelInformationService.name);
    try {
      const models = await this.llmService.getModelsData();
      this.logger.info(
        `Retrieved ${models.length} models`,
        ModelInformationService.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to retrieve all models\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async getModelsByProvider(provider: string): Promise<Model[]> {
    this.logger.info(
      `Retrieving models for provider: ${provider}`,
      ModelInformationService.name,
    );
    try {
      const modelDetails =
        await this.llmService.listModelsWithDetails(provider);

      this.logger.info(
        `Provider ${provider} returned ${modelDetails.length} model details`,
        ModelInformationService.name,
      );
      this.logger.debug(
        `Model names: ${modelDetails.map((m) => m.name).join(', ')}`,
        ModelInformationService.name,
      );

      const models = modelDetails.map((detail) => ({
        name: detail.name,
        provider: detail.provider as any,
        description: detail.description as any,
        category: detail.category as any,
        contextWindow: detail.contextWindow,
        maxOutputTokens: detail.maxOutputTokens,
        inputCostPer1M: detail.inputCostPer1M,
        cachedInputCostPer1M: detail.cachedInputCostPer1M,
        outputCostPer1M: detail.outputCostPer1M,
        vision: detail.vision,
        functionCalling: detail.functionCalling,
        multilingual: detail.multilingual,
        extendedThinking: detail.extendedThinking,
        knowledgeCutoff: detail.knowledgeCutoff,
      }));

      this.logger.info(
        `Successfully processed ${models.length} models for provider: ${provider}`,
        ModelInformationService.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to retrieve models for provider: ${provider}\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async getModelsByCategory(category: string): Promise<Model[]> {
    this.logger.info(
      `Retrieving models by category: ${category}`,
      ModelInformationService.name,
    );
    try {
      const models = await this.llmService.getModelsByCategory(category);
      this.logger.info(
        `Retrieved ${models.length} models for category: ${category}`,
        ModelInformationService.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to retrieve models for category: ${category}\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async getModelsByCostRange(
    minCost: number,
    maxCost: number,
  ): Promise<Model[]> {
    this.logger.info(
      `Retrieving models by cost range: ${minCost} - ${maxCost}`,
      ModelInformationService.name,
    );
    try {
      const models = await this.llmService.getModelsByCostRange(
        minCost,
        maxCost,
      );
      this.logger.info(
        `Retrieved ${models.length} models in cost range: ${minCost} - ${maxCost}`,
        ModelInformationService.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to retrieve models for cost range: ${minCost} - ${maxCost}\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async getModelsWithCapability(
    capability:
      | 'vision'
      | 'functionCalling'
      | 'multilingual'
      | 'extendedThinking',
  ): Promise<Model[]> {
    this.logger.info(
      `Retrieving models with capability: ${capability}`,
      ModelInformationService.name,
    );
    try {
      const models = await this.llmService.getModelsWithCapability(capability);
      this.logger.info(
        `Retrieved ${models.length} models with capability: ${capability}`,
        ModelInformationService.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to retrieve models with capability: ${capability}\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async findModelsByName(name: string): Promise<Model[]> {
    this.logger.info(
      `Searching models by name: ${name}`,
      ModelInformationService.name,
    );
    try {
      const models = await this.llmService.findModelsByName(name);
      this.logger.info(
        `Found ${models.length} models matching name: ${name}`,
        ModelInformationService.name,
      );
      return models;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to search models by name: ${name}\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async getModelDetails(
    providerName: string,
    modelId: string,
  ): Promise<ModelDetails | null> {
    this.logger.info(
      `Retrieving model details for provider: ${providerName}, model: ${modelId}`,
      ModelInformationService.name,
    );
    try {
      const details = await this.llmService.getModelDetails(
        providerName,
        modelId,
      );
      if (details) {
        this.logger.info(
          `Retrieved model details for: ${providerName}/${modelId}`,
          ModelInformationService.name,
        );
      } else {
        this.logger.warn(
          `Model not found: ${providerName}/${modelId}`,
          ModelInformationService.name,
        );
      }
      return details;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to retrieve model details for: ${providerName}/${modelId}\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async calculateModelCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number = 0,
  ): Promise<{
    inputCost: number;
    outputCost: number;
    totalCost: number;
  } | null> {
    this.logger.info(
      `Calculating cost for model: ${modelId}, input: ${inputTokens}, output: ${outputTokens}`,
      ModelInformationService.name,
    );
    try {
      const cost = await this.llmService.calculateEstimatedCost(
        modelId,
        inputTokens,
        outputTokens,
      );
      if (cost) {
        this.logger.info(
          `Calculated cost for ${modelId}: $${cost.totalCost.toFixed(4)}`,
          ModelInformationService.name,
        );
      } else {
        this.logger.warn(
          `Could not calculate cost for model: ${modelId}`,
          ModelInformationService.name,
        );
      }
      return cost;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to calculate cost for model: ${modelId}\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async getAvailableProviders(): Promise<string[]> {
    this.logger.info(
      'Retrieving available providers',
      ModelInformationService.name,
    );
    try {
      const providers = await this.llmService.listProviders();
      this.logger.info(
        `Retrieved ${providers.length} providers: ${providers.join(', ')}`,
        ModelInformationService.name,
      );
      return providers;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to retrieve available providers\n${info.stack || ''}`,
        ModelInformationService.name,
      );
      throw error;
    }
  }

  async getModelsWithDetails(providerName?: string): Promise<ModelDetails[]> {
    return this.llmService.listModelsWithDetails(providerName);
  }
}
