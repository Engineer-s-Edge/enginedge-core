import { Inject } from '@nestjs/common';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import BaseAgent from './base';
import { Toolkit } from '@core/infrastructure/agents/tools/toolkit.service';
import AgentMemory from '@core/infrastructure/agents/components/memory/memory.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { ConversationRepository } from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import {
  ExpertAgentConfig,
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  AgentState,
} from '../types/agent.entity';
import { CheckpointService } from '@core/infrastructure/agents/components/vectorstores/services/checkpoint.service';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';
import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import { TextSplitterConfig } from '@core/infrastructure/agents/components/textsplitters/textsplitter.factory';
import { LoaderService } from '@core/infrastructure/agents/components/loaders/loader.service';
import { KnowledgeNodeIdType, UserIdType } from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { TavilySearchLoader } from '@core/infrastructure/agents/components/loaders/web/tavily';
import { KnowledgeGraphService } from '@core/infrastructure/agents/components/knowledge/services/knowledge-graph.service';
import { GraphAlgorithmsService } from '@core/infrastructure/agents/components/knowledge/services/graph-algorithms.service';
import { ICSLayer } from '@core/infrastructure/agents/components/knowledge/entities/knowledge-node.entity';

/**
 * ICS Bear Hunter System Implementation
 * =====================================
 * AIM Phase: Build structural understanding ("why X?" and "how X relates to Y?")
 * SHOOT Phase: Deep research to fill in content
 * SKIN Phase: Prune, reorganize, and refine
 */

interface ResearchQuestion {
  question: string;
  layer: ICSLayer;
  priority: number;
  nodeId?: string;
}

interface ResearchResult {
  question: string;
  answer: string;
  sources: Array<{
    url: string;
    title: string;
    retrievedAt: Date;
    sourceType: 'web' | 'academic' | 'document' | 'user' | 'llm';
  }>;
  confidence: number;
  relatedConcepts: string[];
}

/**
 * ExpertAgent - Research agent using ICS Bear Hunter methodology
 *
 * This agent is designed to compete with Perplexity.ai-style research agents by:
 * 1. Building structural knowledge graphs (AIM phase)
 * 2. Conducting deep multi-source research (SHOOT phase)
 * 3. Refining and validating information (SKIN phase)
 *
 * Features:
 * - Shared knowledge graph across all Expert agent instances
 * - Multi-source research (web search, academic, documents)
 * - Citation tracking and confidence scoring
 * - Layer-based learning (L1-L6 hierarchy)
 * - Prerequisite chain building for complex topics
 */
export class ExpertAgent extends BaseAgent {
  private settings: ExpertAgentConfig;

  constructor(
    @Inject(Toolkit) tools: Toolkit,
    @Inject(AgentMemory) memory: AgentMemory,
    @Inject(LLMService) llm: LLMService,
    @Inject(ConversationRepository)
    protected conversationRepository: ConversationRepository,
    @Inject(VectorStoreService) protected vectorStore: VectorStoreService,
    @Inject(CheckpointService) protected checkpointService: CheckpointService,
    @Inject(LoaderService) protected loaderService: LoaderService,
    @Inject(TavilySearchLoader) private tavilySearch: TavilySearchLoader,
    @Inject(KnowledgeGraphService)
    private knowledgeGraph: KnowledgeGraphService,
    @Inject(GraphAlgorithmsService)
    private graphAlgorithms: GraphAlgorithmsService,
    settings: ExpertAgentConfig,
    config: {
      memoryConfig: AgentMemoryConfig;
      checkpointConfig: AgentCheckpointConfig;
      intelligenceConfig: AgentIntelligenceConfig;
      loaderConfig: AgentLoaderConfig;
      textsplitterConfig: TextSplitterConfig;
      embedderConfig: EmbeddingOptions;
    },
    protected userId: UserIdType,
    logger: MyLogger,
  ) {
    super(
      tools,
      memory,
      llm,
      conversationRepository,
      vectorStore,
      checkpointService,
      loaderService,
      config,
      userId,
      logger,
    );

    this.logger.info('ExpertAgent initializing', ExpertAgent.name);

    this.emit('expert-agent-initializing', {
      settings,
      timestamp: new Date(),
    });

    // Validate configuration
    if (!settings || typeof settings !== 'object') {
      this.logger.error(
        'ExpertAgent configuration validation failed',
        ExpertAgent.name,
      );
      throw new Error('ExpertAgent requires complete configuration settings');
    }

    this.settings = settings;
    this._id = this.settings._id;
    this.state = this.settings.state;

    // Check if agent is enabled
    if (!this.settings.enabled) {
      this.logger.warn(
        `ExpertAgent ${this.settings._id} is disabled`,
        ExpertAgent.name,
      );
      this.state = AgentState.STOPPED;
      this.emit('expert-agent-disabled', {
        agentId: this.settings._id,
        timestamp: new Date(),
      });
    }

    // Set custom prompt
    this.custom_prompt = this.settings.research.promptTemplate;

    // Update intelligence config
    if (this.intelligenceConfig && this.settings.intelligence) {
      Object.assign(this.intelligenceConfig, this.settings.intelligence);
      Object.assign(
        this.intelligenceConfig.llm,
        this.settings.intelligence.llm,
      );
    }

    // Register tools
    if (this.settings.tools && this.settings.tools.length > 0) {
      this.logger.info(
        `Registering ${this.settings.tools.length} tools with ExpertAgent`,
        ExpertAgent.name,
      );
      this.settings.tools.forEach((tool) => {
        this.tools.register(tool);
      });
    }

    this.logger.info(
      'ExpertAgent configuration completed successfully',
      ExpertAgent.name,
    );
    this.emit('expert-agent-configured', {
      agentId: this.settings._id,
      researchDepth: this.settings.research.researchDepth,
      maxSources: this.settings.research.maxSources,
      provider: this.settings.intelligence.llm.provider,
      model: this.settings.intelligence.llm.model,
    });
  }

  /**
   * Execute research query using ICS Bear Hunter methodology
   *
   * @param query User's research question
   * @param history Previous conversation messages
   * @returns Async generator yielding research progress and final answer
   */
  async *execute(
    query: string,
    _history: [HumanMessage, ...AIMessage[]] = [new HumanMessage(query)],
  ): AsyncGenerator<string, void, unknown> {
    await this.awaitInit();

    if (this.state !== AgentState.READY) {
      throw new Error(`ExpertAgent is not ready (state: ${this.state})`);
    }

    this.logger.info(
      `ExpertAgent executing research query: ${query}`,
      ExpertAgent.name,
    );

    this.emit('expert-research-started', {
      agentId: this._id,
      query,
      timestamp: new Date(),
    });

    try {
      // ==================== AIM PHASE ====================
      // Build structural understanding
      yield '🎯 **AIM Phase**: Analyzing query structure...\n\n';

      const structuralAnalysis = await this.aimPhase(query);
      yield `**Domain**: ${structuralAnalysis.domain}\n`;
      yield `**Key Concepts**: ${structuralAnalysis.concepts.join(', ')}\n`;
      yield `**Research Questions**: ${structuralAnalysis.questions.length} identified\n\n`;

      // ==================== SHOOT PHASE ====================
      // Deep research for each question
      yield '🔍 **SHOOT Phase**: Conducting deep research...\n\n';

      const researchResults: ResearchResult[] = [];
      for (const question of structuralAnalysis.questions) {
        yield `\n**Researching**: ${question.question}\n`;

        const result = await this.shootPhase(question);
        researchResults.push(result);

        // Store in knowledge graph
        if (question.nodeId) {
          await this.knowledgeGraph.addResearchData({
            nodeId: question.nodeId as KnowledgeNodeIdType,
            summary: result.answer,
            keyPoints: [result.answer],
            sources: result.sources,
            confidence: result.confidence,
          });
        }

        yield `✅ Found ${result.sources.length} sources (confidence: ${(result.confidence * 100).toFixed(0)}%)\n`;
      }

      // ==================== SKIN PHASE ====================
      // Synthesize and refine
      yield '\n\n✨ **SKIN Phase**: Synthesizing comprehensive answer...\n\n';

      const finalAnswer = await this.skinPhase(query, researchResults);

      yield '---\n\n';
      yield finalAnswer;
      yield '\n\n';

      // Add citations
      yield '\n\n### 📚 Sources\n\n';
      const allSources = researchResults.flatMap((r) => r.sources);
      const uniqueSources = Array.from(
        new Map(allSources.map((s) => [s.url, s])).values(),
      );

      for (let i = 0; i < uniqueSources.length; i++) {
        const source = uniqueSources[i];
        yield `${i + 1}. [${source.title}](${source.url})\n`;
      }

      this.emit('expert-research-completed', {
        agentId: this._id,
        query,
        sourcesCount: uniqueSources.length,
        timestamp: new Date(),
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error in ExpertAgent execution: ${info.message}`,
        ExpertAgent.name,
        info.stack,
      );

      yield `\n\n❌ **Error**: ${info.message}\n`;

      this.emit('expert-research-error', {
        agentId: this._id,
        query,
        error: info.message,
        timestamp: new Date(),
      });

      throw error;
    }
  }

  /**
   * AIM Phase: Build structural understanding
   *
   * Ask "why X?" and "how X relates to Y?" to build a concept map
   */
  private async aimPhase(query: string): Promise<{
    domain: string;
    concepts: string[];
    questions: ResearchQuestion[];
  }> {
    this.logger.info('AIM Phase: Analyzing query structure', ExpertAgent.name);

    // Use LLM to extract domain and key concepts
    const structurePrompt = `You are an expert research analyst implementing the ICS Bear Hunter methodology's AIM phase. Your task is to build a comprehensive structural understanding of a research query by identifying the domain, key concepts, and essential research questions.

# Query Analysis
"${query}"

# Your Task
Perform a deep structural analysis following these steps:

## 1. Domain Identification
Identify the primary academic or professional domain this query belongs to. Be specific - instead of just "Science", specify "Quantum Physics" or "Molecular Biology". Consider interdisciplinary aspects if the query spans multiple domains.

## 2. Concept Extraction (3-7 key concepts)
Extract the fundamental concepts that must be understood to fully address this query. For each concept:
- Identify core terminology and definitions
- Consider prerequisite knowledge needed
- Note relationships between concepts
- Assess complexity level

## 3. Research Question Generation
For each key concept, generate 1-3 targeted research questions using the "why" and "how" framework:
- **Why questions**: Probe underlying principles, causes, and motivations
- **How questions**: Explore mechanisms, processes, and relationships
- **Layer assignment**: Rate each question's complexity (1=foundational, 6=cutting-edge)
- **Priority scoring**: Rate importance for answering the original query (1=nice-to-know, 10=critical)

## 4. ICS Layer Guidelines
- **Layer 1-2**: Basic definitions, fundamental principles, historical context
- **Layer 3-4**: Mechanisms, processes, intermediate relationships
- **Layer 5-6**: Advanced applications, current research, open questions

# Output Format (JSON only)
\`\`\`json
{
  "domain": "Specific domain name (e.g., 'Machine Learning - Natural Language Processing')",
  "concepts": [
    "concept1 (brief description)",
    "concept2 (brief description)",
    "concept3 (brief description)"
  ],
  "questions": [
    {
      "concept": "concept1",
      "question": "Why does [phenomenon] occur in [context]? / How does [mechanism] enable [outcome]?",
      "layer": 1-6,
      "priority": 1-10,
      "rationale": "Brief explanation of why this question matters"
    }
  ]
}
\`\`\`

# Requirements
- Generate 5-15 research questions total
- Ensure questions build logically from foundational to advanced
- Prioritize questions that directly address the original query
- Include cross-cutting questions that connect multiple concepts
- Be specific and actionable in question formulation`;

    const response = await this.llm.chat([new HumanMessage(structurePrompt)], {
      stream: false,
      providerName: this.intelligenceConfig.llm.provider,
      modelId: this.intelligenceConfig.llm.model,
    });

    let analysis: any;
    try {
      const content =
        typeof response.response === 'string'
          ? response.response
          : JSON.stringify(response.response);
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      analysis = JSON.parse(jsonStr);
    } catch {
      this.logger.warn(
        'Failed to parse LLM response as JSON, using defaults',
        ExpertAgent.name,
      );
      analysis = {
        domain: 'General Knowledge',
        concepts: [query],
        questions: [
          { concept: query, question: query, layer: 3, priority: 10 },
        ],
      };
    }

    // Create nodes in knowledge graph for each concept
    const questions: ResearchQuestion[] = [];
    for (const q of analysis.questions || []) {
      // Find or create node for this concept
      const node = await this.knowledgeGraph.findOrCreateNode(
        q.concept || query,
        'concept',
        (q.layer || 3) as ICSLayer,
      );

      questions.push({
        question: q.question || query,
        layer: (q.layer || 3) as ICSLayer,
        priority: q.priority || 5,
        nodeId: node._id,
      });
    }

    // Sort by priority (higher first)
    questions.sort((a, b) => b.priority - a.priority);

    return {
      domain: analysis.domain || 'General Knowledge',
      concepts: analysis.concepts || [query],
      questions,
    };
  }

  /**
   * SHOOT Phase: Deep research to fill in content
   *
   * Conduct multi-source research for each question
   */
  private async shootPhase(
    question: ResearchQuestion,
  ): Promise<ResearchResult> {
    this.logger.info(
      `SHOOT Phase: Researching "${question.question}"`,
      ExpertAgent.name,
    );

    // Lock the node for research
    if (question.nodeId) {
      await this.knowledgeGraph.lockNodeForResearch(question.nodeId as KnowledgeNodeIdType, this._id);
    }

    try {
      // Conduct web search using Tavily
      const searchResults = await this.tavilySearch.load(question.question, {
        maxResults: this.settings.research.maxSources || 5,
        searchDepth: this.settings.research.researchDepth as
          | 'basic'
          | 'advanced',
        includeRawContent: true,
        safeSearch: true,
      });

      // Extract information from search results
      const sources = searchResults.map((doc) => ({
        url: doc.metadata.source || '',
        title: doc.metadata.title || 'Unknown',
        retrievedAt: new Date(),
        sourceType: 'web' as const,
      }));

      // Use LLM to synthesize answer from search results
      const synthesisPrompt = `You are an expert research synthesizer implementing the ICS Bear Hunter methodology's SHOOT phase. Your task is to extract, synthesize, and validate information from multiple web sources to answer a specific research question.

# Research Question
"${question.question}"

# ICS Layer Context
This question is at **Layer ${question.layer}** of the knowledge hierarchy:
${question.layer <= 2 ? '- Focus on: Foundational concepts, basic definitions, historical context, and fundamental principles' : ''}
${question.layer === 3 || question.layer === 4 ? '- Focus on: Mechanisms, processes, intermediate relationships, and practical applications' : ''}
${question.layer >= 5 ? '- Focus on: Advanced theory, cutting-edge research, complex interactions, and open questions' : ''}

# Source Material
You have ${searchResults.length} web sources to analyze. Each source contains relevant information:

${searchResults.map((doc, i) => `
## Source [${i + 1}]
**Title**: ${doc.metadata.title || 'Unknown'}
**URL**: ${doc.metadata.source || 'Unknown'}
**Content Preview** (first 800 characters):
${doc.pageContent.substring(0, 800)}...
`).join('\n')}

# Synthesis Instructions

## 1. Information Extraction
- Identify key facts, claims, and evidence from each source
- Note areas of consensus across multiple sources
- Flag conflicting information or contradictions
- Extract relevant statistics, examples, or case studies

## 2. Answer Construction
Create a comprehensive answer that:
- **Directly addresses the research question** with clarity and precision
- **Synthesizes information** from multiple sources (don't just summarize one source)
- **Provides context** for claims and findings
- **Uses specific examples** from the sources when available
- **Maintains appropriate depth** for Layer ${question.layer} complexity
- **Length**: 2-4 paragraphs (150-300 words)
- **Structure**: Start with direct answer, then supporting details, then implications

## 3. Related Concept Identification
Identify 3-7 related concepts that:
- Are mentioned in the sources
- Would deepen understanding of the topic
- Could be explored in follow-up research
- Connect to the original query's broader context

## 4. Confidence Assessment
Rate your confidence (0.0-1.0) based on:
- **Source quality** (0.2): Are sources authoritative and reliable?
- **Source agreement** (0.2): Do sources corroborate each other?
- **Coverage completeness** (0.2): Do sources fully address the question?
- **Evidence strength** (0.2): Are claims backed by data/research?
- **Information recency** (0.2): Is information current and up-to-date?

Confidence Guidelines:
- **0.9-1.0**: Exceptional - Multiple authoritative sources in complete agreement
- **0.7-0.8**: High - Strong sources with minor gaps or disagreements
- **0.5-0.6**: Moderate - Mixed source quality or incomplete coverage
- **0.3-0.4**: Low - Conflicting information or poor source quality
- **0.0-0.2**: Very Low - Insufficient or unreliable information

# Output Format (JSON only)
\`\`\`json
{
  "answer": "Comprehensive 2-4 paragraph synthesis directly addressing the question with specific details from sources",
  "relatedConcepts": [
    "Related concept 1 (why it's relevant)",
    "Related concept 2 (why it's relevant)",
    "Related concept 3 (why it's relevant)"
  ],
  "confidence": 0.0-1.0,
  "confidenceRationale": "Brief explanation of confidence score based on source quality, agreement, coverage, evidence, and recency"
}
\`\`\`

# Quality Standards
- Prioritize accuracy over completeness
- Acknowledge limitations or gaps in available information
- Use precise language appropriate for the ICS layer
- Maintain objectivity and avoid speculation beyond what sources support`;

      const synthesis = await this.llm.chat([new HumanMessage(synthesisPrompt)], {
        stream: false,
        providerName: this.intelligenceConfig.llm.provider,
        modelId: this.intelligenceConfig.llm.model,
      });

      let result: any;
      try {
        const content =
          typeof synthesis.response === 'string'
            ? synthesis.response
            : JSON.stringify(synthesis.response);
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : content;
        result = JSON.parse(jsonStr);
      } catch {
        this.logger.warn(
          'Failed to parse synthesis, using raw response',
          ExpertAgent.name,
        );
        result = {
          answer:
            typeof synthesis.response === 'string'
              ? synthesis.response
              : JSON.stringify(synthesis.response),
          relatedConcepts: [],
          confidence: 0.5,
        };
      }

      return {
        question: question.question,
        answer: result.answer || '',
        sources,
        confidence: result.confidence || 0.7,
        relatedConcepts: result.relatedConcepts || [],
      };
    } finally {
      // Unlock the node
      if (question.nodeId) {
        await this.knowledgeGraph.unlockNode(question.nodeId as KnowledgeNodeIdType, this._id);
      }
    }
  }

  /**
   * SKIN Phase: Prune, reorganize, and refine
   *
   * Synthesize all research into a coherent final answer
   */
  private async skinPhase(
    originalQuery: string,
    researchResults: ResearchResult[],
  ): Promise<string> {
    this.logger.info('SKIN Phase: Synthesizing final answer', ExpertAgent.name);

    const refinementPrompt = `You are an expert research writer implementing the ICS Bear Hunter methodology's SKIN phase. Your task is to synthesize multiple research findings into a comprehensive, coherent, and actionable final answer.

# Original Research Query
"${originalQuery}"

# Research Findings Summary
You have completed research on ${researchResults.length} related questions. Here are your findings:

${researchResults.map((r, i) => `
## Research Finding ${i + 1}
**Question**: ${r.question}
**Answer**: ${r.answer}
**Confidence**: ${(r.confidence * 100).toFixed(0)}%
**Sources**: ${r.sources.length} web sources
**Related Concepts**: ${r.relatedConcepts.join(', ') || 'None identified'}
`).join('\n')}

# Synthesis Instructions

## 1. Integration Strategy
Your answer must:
- **Address the original query directly** in the opening paragraph
- **Weave together findings** from all research questions into a coherent narrative
- **Build progressively** from foundational concepts to advanced insights
- **Highlight connections** between different research findings
- **Resolve contradictions** if findings conflict (explain why)

## 2. Structure Requirements
Create a well-organized response with:

### Introduction (1 paragraph)
- Direct answer to the original query
- Overview of key insights
- Context for why this matters

### Body (3-5 paragraphs)
- Synthesize findings thematically (not question-by-question)
- Use specific examples and evidence from research
- Explain mechanisms, relationships, and implications
- Build logical flow from basic to complex concepts
- Address multiple perspectives if relevant

### Knowledge Gaps & Limitations (1 paragraph)
- Acknowledge areas where information is incomplete
- Note conflicting viewpoints or uncertainties
- Reference confidence scores if findings are mixed
- Suggest what additional research might clarify

### Actionable Insights (1 paragraph, if applicable)
- Practical applications or next steps
- Recommendations based on findings
- Resources for deeper learning
- Open questions worth exploring

## 3. Writing Standards
- **Tone**: Professional yet accessible - write for an intelligent non-expert audience
- **Length**: 800-1200 words total
- **Formatting**: Use markdown with headers (##, ###), bold for emphasis, lists where appropriate
- **Citations**: Use inline references like [1], [2] when mentioning specific findings
- **Precision**: Be specific - avoid vague statements like "some researchers think"
- **Objectivity**: Present evidence-based conclusions, acknowledge uncertainty

## 4. Quality Criteria
- ✅ Comprehensive coverage of all findings
- ✅ Clear logical flow and organization
- ✅ Balance between detail and readability
- ✅ Evidence-based claims with appropriate confidence
- ✅ Practical value and actionable insights
- ✅ Proper acknowledgment of limitations

## 5. Confidence-Based Language
Use appropriate hedging based on research confidence:
- **High confidence (>80%)**: "Research demonstrates", "Evidence shows", "Studies confirm"
- **Moderate confidence (50-80%)**: "Research suggests", "Evidence indicates", "Studies point to"
- **Low confidence (<50%)**: "Some evidence suggests", "Preliminary research indicates", "Limited studies show"

# Output Format
Write the final answer in markdown format. Do NOT use JSON - write the actual research report as if publishing it.

Start your answer now:`;

    const finalAnswer = await this.llm.chat([new HumanMessage(refinementPrompt)], {
      stream: false,
      providerName: this.intelligenceConfig.llm.provider,
      modelId: this.intelligenceConfig.llm.model,
    });

    return typeof finalAnswer.response === 'string'
      ? finalAnswer.response
      : JSON.stringify(finalAnswer.response);
  }

  /**
   * Stream a research execution with token-by-token rendering
   */
  public async stream(
    query: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    _tokenTarget?: number,
    _contentSequence?: string[],
  ): Promise<AsyncIterable<any>> {
    // Expert agent execute already streams, so we wrap it in an async iterable
    const generator = this.execute(query, latestMessages.length > 0 ? latestMessages as [HumanMessage, ...AIMessage[]] : [new HumanMessage(query)]);
    
    return {
      [Symbol.asyncIterator]() {
        return generator;
      }
    };
  }
}
