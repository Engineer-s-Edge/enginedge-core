import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { getErrorInfo } from '@common/error-assertions';
import { GraphBuilderService } from '../services/graph-builder.service';
import {
  CreateGraphAgentDto,
  ValidateGraphConfigDto,
} from '../dto/graph-builder.dto';

@Controller('assistants/builder/graph')
export class GraphBuilderController {
  constructor(private readonly graphBuilderService: GraphBuilderService) {}

  /**
   * Get available graph node templates for building
   */
  @Get('node-templates')
  async getGraphNodeTemplates(@Query('category') category?: string) {
    try {
      return {
        success: true,
        templates:
          await this.graphBuilderService.getGraphNodeTemplates(category),
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
        templates: [],
      };
    }
  }

  /**
   * Get available edge types for graph connections
   */
  @Get('edge-types')
  async getGraphEdgeTypes() {
    try {
      return {
        success: true,
        edgeTypes: await this.graphBuilderService.getGraphEdgeTypes(),
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
        edgeTypes: [],
      };
    }
  }

  /**
   * Get user interaction configuration options
   */
  @Get('user-interaction-types')
  async getUserInteractionTypes() {
    try {
      return {
        success: true,
        interactionTypes:
          await this.graphBuilderService.getUserInteractionTypes(),
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
        interactionTypes: [],
      };
    }
  }

  /**
   * Validate a graph configuration before creation
   */
  @Post('validate')
  @UsePipes(new ValidationPipe({ transform: true }))
  async validateGraphConfig(@Body() validateDto: ValidateGraphConfigDto) {
    try {
      const validation = await this.graphBuilderService.validateGraphConfig(
        validateDto.graphConfig,
      );
      return {
        success: true,
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        suggestions: validation.suggestions,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        isValid: false,
        error: info.message,
        errors: [],
        warnings: [],
        suggestions: [],
      };
    }
  }

  /**
   * Create a graph agent from configuration
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true }))
  async createGraphAgent(@Body() createDto: CreateGraphAgentDto) {
    try {
      const result = await this.graphBuilderService.createGraphAgent(createDto);
      return {
        success: true,
        message: `Graph agent '${result.name}' created successfully`,
        agent: result,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
      };
    }
  }

  /**
   * Get graph execution flow analysis
   */
  @Post('analyze-flow')
  @UsePipes(new ValidationPipe({ transform: true }))
  async analyzeGraphFlow(@Body() body: { graphConfig: any }) {
    try {
      const analysis = await this.graphBuilderService.analyzeGraphFlow(
        body.graphConfig,
      );
      return {
        success: true,
        analysis,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
      };
    }
  }

  /**
   * Get examples of common graph patterns
   */
  @Get('patterns')
  async getGraphPatterns(@Query('category') category?: string) {
    try {
      return {
        success: true,
        patterns: await this.graphBuilderService.getGraphPatterns(category),
      };
    } catch (error) {
      const info = getErrorInfo(error);
      return {
        success: false,
        error: info.message,
        patterns: [],
      };
    }
  }
}
