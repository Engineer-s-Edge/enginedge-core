import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MyLogger } from '../../services/logger/logger.service';
import { LocalWolframService } from './local-kernel/local-wolfram.service';
import { WebWolframService } from './web/web-wolfram.service';

/**
 * Service for interacting with Wolfram technologies.
 * This service provides methods to interact with both a local, containerized
 * Wolfram Kernel for raw computations and the external Wolfram|Alpha API for
 * natural language queries.
 */
@Injectable()
export class WolframService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
    private readonly local: LocalWolframService,
    private readonly web: WebWolframService,
  ) {}

  /**
   * Executes a raw Wolfram Language expression using the local kernel.
   * This is suitable for precise mathematical or programmatic tasks.
   * @param expression The Wolfram Language expression to execute.
   * @returns The result of the computation.
   */
  async executeLocalQuery(expression: string): Promise<any> {
    return this.local.execute(expression);
  }

  /**
   * Executes a natural language query using the external Wolfram|Alpha API.
   * This is suitable for answering questions and interpreting natural language.
   * @param query The natural language query (e.g., "what is the capital of France?").
   * @returns The parsed and structured result from Wolfram|Alpha.
   */
  async executeOnlineQuery(query: string): Promise<any> {
    return this.web.execute(query);
  }

  async execute(
    queryOrExpression: string,
    target: 'local' | 'web' = 'local',
  ): Promise<any> {
    if (target === 'web') {
      return this.executeOnlineQuery(queryOrExpression);
    }
    return this.executeLocalQuery(queryOrExpression);
  }
}
