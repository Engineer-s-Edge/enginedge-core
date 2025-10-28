import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MyLogger } from '../../../services/logger/logger.service';

@Injectable()
export class LocalWolframService {
  private readonly localKernelUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
  ) {
    this.localKernelUrl =
      this.configService.get<string>('WOLFRAM_LOCAL_URL') ||
      'http://wolfram-kernel:5000';
  }

  async execute(expression: string): Promise<any> {
    try {
      this.logger.info(
        `Calling local Wolfram Kernel with expression: ${expression}`,
        LocalWolframService.name,
      );

      const response = await axios.post(
        `${this.localKernelUrl}/compute`,
        { code: expression },
        { timeout: 30000 },
      );

      this.logger.info(
        `Received response from local Wolfram Kernel for expression: "${expression}"`,
        LocalWolframService.name,
      );
      this.logger.debug(
        `Response data: ${JSON.stringify(response.data)}`,
        LocalWolframService.name,
      );

      const kernelResponse = response.data;
      if (!kernelResponse.success) {
        throw new Error(
          kernelResponse.error || 'Unknown error from kernel service',
        );
      }

      return {
        data: kernelResponse.result,
        interpretation: `Result for "${expression}"`,
        success: true,
        source: 'local_wolfram_kernel',
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Local Wolfram Kernel error: ${e.message}`,
        e.stack,
        LocalWolframService.name,
      );
      const respData = (error as any)?.response?.data;
      if (respData) {
        this.logger.error(
          `Error response data: ${JSON.stringify(respData || {})}`,
          undefined,
          LocalWolframService.name,
        );
      }
      return {
        data: null,
        interpretation: null,
        success: false,
        error: {
          message: `Failed to process query with local kernel: ${e.message}`,
          details: respData || null,
        },
      };
    }
  }
}
