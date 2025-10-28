import { registerAs } from '@nestjs/config';

/**
 * Configuration for external services
 */
export default registerAs('services', () => ({
  // Wolfram Alpha API configuration
  wolfram: {
    apiKey:
      process.env.WOLFRAM_ALPHA_API_KEY || process.env.WOLFRAM_API_KEY || '',
    options: {
      defaultFormat: process.env.WOLFRAM_DEFAULT_FORMAT || 'plaintext',
      timeout: parseInt(process.env.WOLFRAM_TIMEOUT || '10000', 10),
    },
  },
  // Add other services as needed
}));
