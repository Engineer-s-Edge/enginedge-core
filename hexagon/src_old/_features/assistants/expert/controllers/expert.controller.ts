import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  HttpException,
  HttpStatus,
  Sse,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ExpertService } from '../services/expert.service';
import {
  ResearchRequestDto,
  ResearchResponseDto,
  ResearchHistoryResponseDto,
  KnowledgeGraphResponseDto,
} from '../dto/expert.dto';

/**
 * Expert Agent Controller
 *
 * REST endpoints for Expert Agent research operations using ICS Bear Hunter methodology:
 * - POST /expert/research: Execute comprehensive research with AIM/SHOOT/SKIN phases
 * - GET /expert/research/stream: Real-time streaming of research progress
 * - GET /expert/history: Retrieve research session history
 * - GET /expert/knowledge-graph: Access knowledge graph built during research
 */
@Controller('assistants/expert')
@UseGuards(JwtAuthGuard)
export class ExpertController {
  constructor(private readonly expertService: ExpertService) {}

  /**
   * Execute research query
   * POST /assistants/expert/research
   *
   * Runs full AIM → SHOOT → SKIN research workflow:
   * 1. AIM: Structural analysis, concept extraction, question generation
   * 2. SHOOT: Multi-source research via Tavily, confidence scoring
   * 3. SKIN: Final synthesis (800-1200 words) with citations
   *
   * @param body Research request parameters
   * @param req Authenticated request with user context
   * @returns Complete research results with sources, confidence scores, and knowledge graph
   */
  @Post('research')
  async executeResearch(
    @Body() body: ResearchRequestDto,
    @Req() req: any,
  ): Promise<ResearchResponseDto> {
    try {
      const userId = req.user?.sub || req.user?.userId || req.user?._id;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.expertService.executeResearch(
        body.query,
        userId,
        {
          researchDepth: body.researchDepth,
          maxSources: body.maxSources,
          maxTokens: body.maxTokens,
          useBertScore: body.useBertScore,
          conversationId: body.conversationId,
        },
      );

      return result;
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Research execution failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Stream research progress (SSE)
   * GET /assistants/expert/research/stream?query=...&userId=...
   *
   * Server-sent events stream for real-time research progress:
   * - Phase transitions (AIM → SHOOT → SKIN)
   * - Source discovery events
   * - Question answering progress
   * - Final synthesis chunks
   *
   * @param query Research query
   * @param userId User ID (from JWT)
   * @param researchDepth Optional research depth ('basic' | 'advanced')
   * @param maxSources Optional max sources per question (1-20)
   * @param maxTokens Optional max tokens for synthesis (500-10000)
   * @param useBertScore Optional enable BERT-score semantic matching
   * @param conversationId Optional conversation context
   * @returns Observable stream of research events
   */
  @Get('research/stream')
  @Sse()
  streamResearch(
    @Query('query') query: string,
    @Query('userId') userId: string,
    @Query('researchDepth') researchDepth?: 'basic' | 'advanced',
    @Query('maxSources') maxSources?: string,
    @Query('maxTokens') maxTokens?: string,
    @Query('useBertScore') useBertScore?: string,
    @Query('conversationId') conversationId?: string,
  ): Observable<MessageEvent> {
    if (!query || !userId) {
      throw new HttpException(
        'Query and userId are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const subject = new Subject<MessageEvent>();

    // Start research streaming asynchronously
    this.expertService
      .streamResearch(query, userId, {
        researchDepth,
        maxSources: maxSources ? parseInt(maxSources, 10) : undefined,
        maxTokens: maxTokens ? parseInt(maxTokens, 10) : undefined,
        useBertScore: useBertScore === 'true',
        conversationId,
      })
      .then((stream: AsyncIterable<any>) => {
        (async () => {
          try {
            for await (const chunk of stream) {
              subject.next({
                data: JSON.stringify(chunk),
                type: 'message',
              } as MessageEvent);
            }
            subject.complete();
          } catch (error: any) {
            subject.next({
              data: JSON.stringify({
                type: 'error',
                error: error.message || 'Stream error',
              }),
              type: 'error',
            } as MessageEvent);
            subject.complete();
          }
        })();
      })
      .catch((error: any) => {
        subject.next({
          data: JSON.stringify({
            type: 'error',
            error: error.message || 'Failed to start research stream',
          }),
          type: 'error',
        } as MessageEvent);
        subject.complete();
      });

    return subject.asObservable();
  }

  /**
   * Get research history
   * GET /assistants/expert/history?userId=...&limit=10&offset=0
   *
   * Retrieve past research sessions with metadata:
   * - Session ID, query, domain
   * - Source counts and confidence scores
   * - Execution times
   *
   * @param userId User ID (from JWT)
   * @param limit Max results to return (default 10)
   * @param offset Pagination offset (default 0)
   * @returns Research history with aggregate statistics
   */
  @Get('history')
  async getResearchHistory(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ResearchHistoryResponseDto> {
    if (!userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const history = await this.expertService.getResearchHistory(
        userId,
        limit ? parseInt(limit, 10) : 10,
        offset ? parseInt(offset, 10) : 0,
      );
      return history;
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to retrieve research history',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get knowledge graph
   * GET /assistants/expert/knowledge-graph?userId=...&conversationId=...
   *
   * Retrieve knowledge graph built during research sessions:
   * - Nodes: concepts, entities, processes, theories
   * - ICS layer assignments (L1-L6)
   * - Research status and confidence scores
   * - Node relationships
   *
   * @param userId User ID (from JWT)
   * @param conversationId Optional conversation scope
   * @returns Knowledge graph with nodes and statistics
   */
  @Get('knowledge-graph')
  async getKnowledgeGraph(
    @Query('userId') userId: string,
    @Query('conversationId') conversationId?: string,
  ): Promise<KnowledgeGraphResponseDto> {
    if (!userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const graph = await this.expertService.getKnowledgeGraph(
        userId,
        conversationId,
      );
      return graph;
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to retrieve knowledge graph',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
