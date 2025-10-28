import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MyLogger } from '../../../services/logger/logger.service';

@Injectable()
export class WebWolframService {
  private readonly wolframAlphaApiUrl = 'https://api.wolframalpha.com/v2/query';

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
  ) {}

  async execute(query: string): Promise<any> {
    const apiKey = this.configService.get<string>('WOLFRAM_ALPHA_API_KEY');
    if (!apiKey) {
      const errorMessage = 'Wolfram|Alpha API key is not configured.';
      this.logger.error(errorMessage, '', WebWolframService.name);
      return {
        data: null,
        success: false,
        error: { message: errorMessage },
      };
    }

    try {
      this.logger.info(
        `Calling Wolfram|Alpha API with query: ${query}`,
        WebWolframService.name,
      );

      const response = await axios.get(this.wolframAlphaApiUrl, {
        params: {
          input: query,
          appid: apiKey,
          output: 'JSON',
          format: 'plaintext',
        },
        timeout: 30000,
      });

      this.logger.info(
        `Received response from Wolfram|Alpha API for query: "${query}"`,
        WebWolframService.name,
      );

      const queryResult = response.data.queryresult;

      if (!queryResult.success) {
        throw new Error(
          queryResult.error?.msg ||
            'Wolfram|Alpha API returned a non-success response.',
        );
      }

      return {
        data: queryResult.pods,
        interpretation: queryResult.pods?.[0]?.subpods?.[0]?.plaintext,
        success: true,
        source: 'wolfram_alpha_api',
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Wolfram|Alpha API error: ${e.message}`,
        e.stack,
        WebWolframService.name,
      );
      const respData = (error as any)?.response?.data;
      if (respData) {
        this.logger.error(
          `Error response data: ${JSON.stringify(respData || {})}`,
          undefined,
          WebWolframService.name,
        );
      }
      return {
        data: null,
        success: false,
        error: {
          message: `Failed to process query with Wolfram|Alpha API: ${e.message}`,
          details: respData || null,
        },
      };
    }
  }
}
