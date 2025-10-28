/**
 * TypeScript schema for OpenAI models data
 * Based on models.json structure
 */

// Base pricing structure for simple numeric values
export type SimplePricing = number;

// Complex pricing structure for models with different input/output types
export interface ComplexPricing {
  text: number;
  audio: number;
}

// Union type for flexible pricing
export type Pricing = SimplePricing | ComplexPricing | null;

// Image pricing structure
export interface ImagePricing {
  [resolution: string]: number;
}

// Standard image pricing
export interface StandardImagePricing {
  standard: ImagePricing;
  hd: ImagePricing;
}

// Per-use pricing (e.g., for Whisper)
export interface PerUsePricing {
  transcription: number;
}

// Union type for all pricing structures
export type PricingStructure =
  | { pricingPerImage: ImagePricing }
  | { pricingPerImage: StandardImagePricing }
  | { pricingPerUse: PerUsePricing }
  | {};

// Model categories
export type ModelCategory =
  | 'gpt-5'
  | 'o-series'
  | 'gpt-4'
  | 'gpt-3.5'
  | 'gpt-3'
  | 'other'
  | 'Audio'
  | 'image-generation'
  | 'gpt-oss'
  | 'text-embedding'
  | 'moderation'
  | 'speech-generation'
  | 'transcription';

// Provider types
export type Provider =
  | 'OpenAI'
  | 'Anthropic'
  | 'Groq'
  | 'Meta'
  | 'Moonshot AI'
  | 'PlayAI'
  | 'Alibaba Cloud';

// Base model interface with all possible fields
export interface Model {
  name: string;
  provider: Provider;
  description: string;
  category: ModelCategory;

  // Context and token limits
  contextWindow: number | null;
  contextWindowBeta?: number; // For models with beta context window
  maxOutputTokens: number | null;
  maxOutputTokensBeta?: number; // For models with beta output tokens
  maxFileSize?: number; // For models with file size limits

  // Pricing information
  inputCostPer1M: Pricing;
  cachedInputCostPer1M: Pricing;
  outputCostPer1M: Pricing;

  // Capabilities
  vision: boolean | null;
  functionCalling: boolean | null;
  multilingual?: boolean;
  extendedThinking?: boolean;

  // Additional metadata
  knowledgeCutoff?: string | null;

  // Special pricing structures (mutually exclusive with token-based pricing)
  pricingPerImage?: ImagePricing | StandardImagePricing;
  pricingPerUse?: PerUsePricing;
}

// Type guard to check if pricing is complex
export function isComplexPricing(pricing: Pricing): pricing is ComplexPricing {
  return pricing !== null && typeof pricing === 'object';
}

// Type guard to check if pricing is simple
export function isSimplePricing(pricing: Pricing): pricing is SimplePricing {
  return typeof pricing === 'number';
}

// Type guard to check if model has image pricing
export function hasImagePricing(
  model: Model,
): model is Model & { pricingPerImage: ImagePricing | StandardImagePricing } {
  return 'pricingPerImage' in model && model.pricingPerImage !== undefined;
}

// Type guard to check if model has per-use pricing
export function hasPerUsePricing(
  model: Model,
): model is Model & { pricingPerUse: PerUsePricing } {
  return 'pricingPerUse' in model && model.pricingPerUse !== undefined;
}

// Type guard to check if model has standard image pricing
export function hasStandardImagePricing(
  model: Model,
): model is Model & { pricingPerImage: StandardImagePricing } {
  return (
    hasImagePricing(model) &&
    typeof model.pricingPerImage === 'object' &&
    'standard' in model.pricingPerImage
  );
}

// Utility type for models with token-based pricing
export type TokenBasedModel = Model & {
  inputCostPer1M: Pricing;
  cachedInputCostPer1M: Pricing;
  outputCostPer1M: Pricing;
};

// Utility type for image generation models
export type ImageGenerationModel = Model & {
  pricingPerImage: ImagePricing | StandardImagePricing;
  vision: false;
  functionCalling: false;
};

// Utility type for transcription models
export type TranscriptionModel = Model & {
  pricingPerUse: PerUsePricing;
  vision: false;
  functionCalling: false;
};

// Array type for the complete models data
export type ModelsData = Model[];

// Helper function to get input cost for a specific type (text/audio)
export function getInputCost(
  model: Model,
  type: 'text' | 'audio' = 'text',
): number | null {
  if (isComplexPricing(model.inputCostPer1M)) {
    return model.inputCostPer1M[type] || null;
  }
  return isSimplePricing(model.inputCostPer1M) ? model.inputCostPer1M : null;
}

// Helper function to get output cost for a specific type (text/audio)
export function getOutputCost(
  model: Model,
  type: 'text' | 'audio' = 'text',
): number | null {
  if (isComplexPricing(model.outputCostPer1M)) {
    return model.outputCostPer1M[type] || null;
  }
  return isSimplePricing(model.outputCostPer1M) ? model.outputCostPer1M : null;
}

// Helper function to get cached input cost for a specific type (text/audio)
export function getCachedInputCost(
  model: Model,
  type: 'text' | 'audio' = 'text',
): number | null {
  if (isComplexPricing(model.cachedInputCostPer1M)) {
    return model.cachedInputCostPer1M[type] || null;
  }
  return isSimplePricing(model.cachedInputCostPer1M)
    ? model.cachedInputCostPer1M
    : null;
}

// Helper function to check if model supports a specific capability
export function supportsCapability(
  model: Model,
  capability:
    | 'vision'
    | 'functionCalling'
    | 'multilingual'
    | 'extendedThinking',
): boolean {
  switch (capability) {
    case 'vision':
      return model.vision === true;
    case 'functionCalling':
      return model.functionCalling === true;
    case 'multilingual':
      return model.multilingual === true;
    case 'extendedThinking':
      return model.extendedThinking === true;
    default:
      return false;
  }
}

// Helper function to filter models by category
export function filterByCategory(
  models: ModelsData,
  category: ModelCategory,
): Model[] {
  return models.filter((model) => model.category === category);
}

// Helper function to filter models by provider
export function filterByProvider(
  models: ModelsData,
  provider: Provider,
): Model[] {
  return models.filter((model) => model.provider === provider);
}

// Helper function to get models with vision capability
export function getVisionModels(models: ModelsData): Model[] {
  return models.filter((model) => model.vision === true);
}

// Helper function to get models with function calling
export function getFunctionCallingModels(models: ModelsData): Model[] {
  return models.filter((model) => model.functionCalling === true);
}

// Helper function to get models by cost range
export function getModelsByCostRange(
  models: ModelsData,
  minInputCost: number,
  maxInputCost: number,
): Model[] {
  return models.filter((model) => {
    const inputCost = getInputCost(model);
    return (
      inputCost !== null &&
      inputCost >= minInputCost &&
      inputCost <= maxInputCost
    );
  });
}

// Export default type for the models array
export default ModelsData;
