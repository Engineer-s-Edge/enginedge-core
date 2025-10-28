import { registerAs } from '@nestjs/config';

export default registerAs('llm', () => ({
  defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'google',
  fallbackProviders: process.env.LLM_FALLBACK_PROVIDERS
    ? process.env.LLM_FALLBACK_PROVIDERS.split(',')
    : ['groq', 'nvidia', 'xai', 'openai'],
  maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3', 10),
  debug: process.env.LLM_DEBUG === 'true',
}));
